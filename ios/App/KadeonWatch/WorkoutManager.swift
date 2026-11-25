import Foundation
import HealthKit
import CoreLocation
import WatchKit
import AVFoundation

/// Strength training workout on the watch: live heart rate and calories, saved to Apple
/// Health at the end (it then counts in the activity rings).
final class WorkoutManager: NSObject, ObservableObject, HKWorkoutSessionDelegate, HKLiveWorkoutBuilderDelegate {
    let store = HKHealthStore()
    @Published var running = false
    @Published var heartRate: Double = 0
    @Published var averageHeartRate: Double = 0
    @Published var calories: Double = 0

    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private let hrType = HKQuantityType.quantityType(forIdentifier: .heartRate)!
    private let energyType = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)!

    private var starting = false

    func requestAuthorization(_ done: (() -> Void)? = nil) {
        guard HKHealthStore.isHealthDataAvailable() else { done?(); return }
        let share: Set<HKSampleType> = [HKObjectType.workoutType(), energyType]
        let read: Set<HKObjectType> = [HKObjectType.workoutType(), hrType, energyType]
        store.requestAuthorization(toShare: share, read: read) { _, _ in
            DispatchQueue.main.async { done?() }
        }
    }

    /// Asks for Health access first (heart rate, calories, saving the workout), then starts:
    /// a workout started before access is granted collects nothing.
    func start() {
        guard session == nil, !starting, HKHealthStore.isHealthDataAvailable() else { return }
        starting = true
        requestAuthorization { [weak self] in
            // Ended meanwhile (end() clears `starting`): nothing to start.
            guard let self, self.starting else { return }
            self.starting = false
            self.begin()
        }
    }

    private func begin() {
        guard session == nil else { return }
        let config = HKWorkoutConfiguration()
        config.activityType = .traditionalStrengthTraining
        config.locationType = .indoor
        do {
            let s = try HKWorkoutSession(healthStore: store, configuration: config)
            let b = s.associatedWorkoutBuilder()
            b.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: config)
            s.delegate = self
            b.delegate = self
            session = s
            builder = b
            heartRate = 0
            averageHeartRate = 0
            calories = 0
            let date = Date()
            s.startActivity(with: date)
            b.beginCollection(withStart: date) { _, _ in }
            running = true
        } catch {
            session = nil
            builder = nil
        }
    }

    /// Ends the workout: saved to Apple Health (named after the session, with the volume
    /// lifted), or dropped (session cancelled, or too short).
    func end(save: Bool, title: String? = nil, volume: Double = 0) {
        starting = false
        guard let s = session, let b = builder else { return }
        session = nil
        builder = nil
        running = false
        s.end()
        b.endCollection(withEnd: Date()) { _, _ in
            if save {
                var meta: [String: Any] = [HKMetadataKeyWorkoutBrandName: "Kadence"]
                if let title { meta["KadenceTitle"] = title }
                if volume > 0 { meta["KadenceVolumeKg"] = volume }
                b.addMetadata(meta) { _, _ in
                    b.finishWorkout { _, _ in }
                }
            } else {
                b.discardWorkout()
            }
        }
    }

    // MARK: HKWorkoutSessionDelegate

    func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {}

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        DispatchQueue.main.async {
            if self.session === workoutSession {
                self.session = nil
                self.builder = nil
                self.running = false
            }
        }
    }

    // MARK: HKLiveWorkoutBuilderDelegate

    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        let bpm = HKUnit.count().unitDivided(by: .minute())
        var hr: Double?
        var avg: Double?
        var kcal: Double?
        if collectedTypes.contains(hrType), let stats = workoutBuilder.statistics(for: hrType) {
            hr = stats.mostRecentQuantity()?.doubleValue(for: bpm)
            avg = stats.averageQuantity()?.doubleValue(for: bpm)
        }
        if collectedTypes.contains(energyType), let stats = workoutBuilder.statistics(for: energyType) {
            kcal = stats.sumQuantity()?.doubleValue(for: .kilocalorie())
        }
        DispatchQueue.main.async {
            if let hr { self.heartRate = hr }
            if let avg { self.averageHeartRate = avg }
            if let kcal { self.calories = kcal }
        }
    }
}

// MARK: - Running, recorded by Kadence itself (GPS, heart rate, guided steps)


/// An outdoor run on the watch: a running workout (distance, heart rate, calories, saved to
/// Apple Health with its GPS route), guided step by step through the session of the plan,
/// with a vibration at each change of step, at each kilometre, and when the pace leaves the
/// target band. Ends with the splits of each step, sent to the iPhone for the verdict.
final class RunManager: NSObject, ObservableObject, HKWorkoutSessionDelegate, HKLiveWorkoutBuilderDelegate, CLLocationManagerDelegate {
    enum Phase: Equatable { case idle, countdown(Int), running, paused, saving }

    @Published private(set) var phase: Phase = .idle
    @Published private(set) var run: WRun?
    @Published private(set) var elapsed: Double = 0           // active time, pauses excluded
    @Published private(set) var meters: Double = 0
    @Published private(set) var heartRate: Double = 0
    @Published private(set) var averageHeartRate: Double = 0
    @Published private(set) var calories: Double = 0
    @Published private(set) var pace: Double = 0              // s/km over the last ~30 s, 0 = unknown
    @Published private(set) var stepIndex = 0
    @Published private(set) var paceWarning = 0               // -1 too slow, 1 too fast
    @Published private(set) var autoPaused = false
    @Published private(set) var kmToast: (km: Int, pace: Double)?
    @Published private(set) var gpsReady = false
    @Published var summary: RunSummary?
    // Tapis: speed (km/h) and incline (%) set with the Digital Crown, D+ from them.
    @Published private(set) var speed: Double = 5
    @Published private(set) var incline: Double = 0
    @Published private(set) var elevation: Double = 0
    /// « Monte à 10 % », shown at each palier.
    @Published private(set) var changeText = ""

    /// Called with the finished run (for the iPhone): start, secs, meters, hr, kcal, splits.
    var onFinish: (([String: Any]) -> Void)?

    private let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var route: HKWorkoutRouteBuilder?
    private let location = CLLocationManager()
    private var ticker: Timer?
    private var startDate = Date()
    private var samples: [(t: Double, m: Double)] = []
    private var stepStart: (t: Double, m: Double) = (0, 0)
    private var splits: [[String: Double]] = []
    private var effortResults: [String] = []
    private var lastKm = 0
    private var lastKmAt: (t: Double, m: Double) = (0, 0)
    private var outside = 0
    private var lastWarnAt: Double = -100
    private var lastSpokenAt: Double = -100
    private var spokenInStep = 0
    private let voice = Voice()
    private var still = 0
    private var moving = 0
    private var manualPause = false
    private var lastTick: Double = 0
    private var segs: [[String: Double]] = []
    private var segStart: Double = 0

    private let hrType = HKQuantityType.quantityType(forIdentifier: .heartRate)!
    private let energyType = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)!
    private let distanceType = HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning)!

    var active: Bool { phase != .idle }
    var steps: [WRunStep] { run?.steps ?? [] }
    var step: WRunStep? { steps.indices.contains(stepIndex) ? steps[stepIndex] : nil }
    var guided: Bool { !steps.isEmpty }
    var finishedPlan: Bool { guided && stepIndex >= steps.count }
    var indoor: Bool { run?.indoor ?? false }
    /// Average speed so far (km/h).
    var averageSpeed: Double { elapsed > 0 ? meters / elapsed * 3.6 : 0 }

    /// Seconds left in the current step.
    var stepLeft: Double {
        guard step != nil else { return 0 }
        return max(0, stepEnd(stepIndex) - elapsed)
    }
    var stepProgress: Double {
        guard let s = step, s.secs > 0 else { return 0 }
        return min(1, max(0, 1 - stepLeft / s.secs))
    }
    /// « 2 / 4 » among the steps of the same phase.
    var stepRank: (Int, Int) {
        guard let s = step else { return (0, 0) }
        let same = steps.indices.filter { steps[$0].phase == s.phase }
        return ((same.firstIndex(of: stepIndex) ?? 0) + 1, same.count)
    }
    var nextStep: WRunStep? { steps.indices.contains(stepIndex + 1) ? steps[stepIndex + 1] : nil }
    var averagePace: Double { meters > 50 ? elapsed / (meters / 1000) : 0 }

    private func stepEnd(_ i: Int) -> Double { steps.prefix(i + 1).reduce(0) { $0 + $1.secs } }

    // MARK: before the start

    /// Health and location access, then the GPS warms up while the runner gets ready.
    func prepare(indoor: Bool = false) {
        if indoor {
            guard HKHealthStore.isHealthDataAvailable() else { return }
            let share: Set<HKSampleType> = [HKObjectType.workoutType(), energyType, distanceType]
            let read: Set<HKObjectType> = [HKObjectType.workoutType(), hrType, energyType, distanceType]
            store.requestAuthorization(toShare: share, read: read) { _, _ in }
            return
        }
        location.delegate = self
        location.activityType = .fitness
        location.desiredAccuracy = kCLLocationAccuracyBest
        if location.authorizationStatus == .notDetermined { location.requestWhenInUseAuthorization() }
        location.startUpdatingLocation()
        guard HKHealthStore.isHealthDataAvailable() else { return }
        let share: Set<HKSampleType> = [HKObjectType.workoutType(), energyType, distanceType, HKSeriesType.workoutRoute()]
        let read: Set<HKObjectType> = [HKObjectType.workoutType(), hrType, energyType, distanceType]
        store.requestAuthorization(toShare: share, read: read) { _, _ in }
    }

    /// Leaving the start screen without running.
    func unprepare() {
        if phase == .idle { location.stopUpdatingLocation() }
    }

    /// 3, 2, 1, then the workout starts.
    func start(_ r: WRun) {
        guard phase == .idle else { return }
        run = r
        summary = nil
        prepare(indoor: r.indoor)
        if r.indoor {
            let first = r.steps.first
            speed = first?.speed ?? (r.walking ? 5 : 9)
            incline = first?.incline ?? (r.walking ? 8 : 1)
            changeText = "Règle le tapis : \(fmt1(speed)) km/h, \(fmt1(incline)) %"
        }
        phase = .countdown(3)
        WKInterfaceDevice.current().play(.click)
        var n = 3
        Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] t in
            guard let self else { t.invalidate(); return }
            n -= 1
            if n > 0 {
                self.phase = .countdown(n)
                WKInterfaceDevice.current().play(.click)
            } else {
                t.invalidate()
                self.begin()
            }
        }
    }

    /// Countdown cancelled.
    func cancel() {
        if case .countdown = phase {
            phase = .idle
            run = nil
            location.stopUpdatingLocation()
        }
    }

    private func begin() {
        let config = HKWorkoutConfiguration()
        config.activityType = run?.walking == true ? .walking : .running
        config.locationType = indoor ? .indoor : .outdoor
        do {
            let s = try HKWorkoutSession(healthStore: store, configuration: config)
            let b = s.associatedWorkoutBuilder()
            let source = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: config)
            // Tapis: the distance comes from the speed set, not from the wrist's own estimate.
            if indoor { source.disableCollection(for: distanceType) }
            b.dataSource = source
            s.delegate = self
            b.delegate = self
            session = s
            builder = b
            route = indoor ? nil : HKWorkoutRouteBuilder(healthStore: store, device: nil)
            resetCounters()
            startDate = Date()
            s.startActivity(with: startDate)
            b.beginCollection(withStart: startDate) { _, _ in }
            phase = .running
            WKInterfaceDevice.current().play(.start)
            ticker = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.tick() }
        } catch {
            phase = .idle
            run = nil
        }
    }

    private func resetCounters() {
        elapsed = 0; meters = 0; heartRate = 0; averageHeartRate = 0; calories = 0; pace = 0
        stepIndex = 0; paceWarning = 0; autoPaused = false; kmToast = nil
        samples = []; stepStart = (0, 0); splits = []; effortResults = []
        lastKm = 0; lastKmAt = (0, 0); outside = 0; lastWarnAt = -100; lastSpokenAt = -100; spokenInStep = 0; still = 0; moving = 0; manualPause = false
        elevation = 0; lastTick = 0; segs = []; segStart = 0
    }

    // MARK: every second

    private func tick() {
        guard let b = builder else { return }
        elapsed = b.elapsedTime(at: Date())
        guard phase == .running else { lastTick = elapsed; return }

        // Tapis: distance and D+ from the speed and incline set.
        if indoor {
            let dt = max(0, min(5, elapsed - lastTick))
            meters += speed / 3.6 * dt
            elevation += speed / 3.6 * dt * max(0, incline) / 100
        }
        lastTick = elapsed

        // Pace over the last ~30 s of running.
        samples.append((elapsed, meters))
        samples.removeAll { elapsed - $0.t > 35 }
        if let first = samples.first, elapsed - first.t >= 15, meters - first.m >= 20 {
            pace = (elapsed - first.t) / ((meters - first.m) / 1000)
        } else if elapsed > 20 {
            pace = 0
        }

        // Steps: vibration and 3-2-1 before each change.
        if guided, !finishedPlan {
            let left = stepEnd(stepIndex) - elapsed
            if left <= 3.5, left > 0.5 { WKInterfaceDevice.current().play(.click) }
            if left <= 0 { nextStepNow(auto: true) }
            checkPace()
        }

        // Every kilometre.
        let km = Int(meters / 1000)
        if km > lastKm {
            let split = (elapsed - lastKmAt.t) / max(0.001, (meters - lastKmAt.m) / 1000)
            lastKm = km
            lastKmAt = (elapsed, meters)
            kmToast = (km, split)
            WKInterfaceDevice.current().play(.notification)
            DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in
                if self?.kmToast?.km == km { self?.kmToast = nil }
            }
        }
    }

    /// Outside the target band for 10 s in a row: one vibration, at most every 30 s.
    /// Voice (« Trop rapide, ralentis »): after 15 s outside, at most once a minute and
    /// twice per effort, outdoors only (on the tapis the speed is set by hand).
    private func checkPace() {
        guard let s = step, s.alert, s.fast > 0, pace > 0, elapsed - stepStart.t > 20 else { paceWarning = 0; outside = 0; return }
        let w = pace < s.fast ? 1 : pace > s.slow ? -1 : 0
        if w == 0 { outside = 0; paceWarning = 0; return }
        outside += 1
        if outside >= 10 {
            paceWarning = w
            if elapsed - lastWarnAt > 30 {
                lastWarnAt = elapsed
                WKInterfaceDevice.current().play(w > 0 ? .directionDown : .directionUp)
            }
            if outside >= 15, !indoor, spokenInStep < 2, elapsed - lastSpokenAt > 60 {
                lastSpokenAt = elapsed
                spokenInStep += 1
                voice.say(w > 0 ? "Trop rapide, ralentis." : "Trop lent, accélère.")
            }
        }
    }

    /// Closes the current step (its split) and moves to the next one.
    func nextStepNow(auto: Bool = false) {
        guard guided, !finishedPlan, let s = step else { return }
        let secs = elapsed - stepStart.t
        let m = meters - stepStart.m
        splits.append(["secs": secs, "meters": m])
        if s.alert, s.fast > 0, m > 50 {
            let p = secs / (m / 1000)
            effortResults.append(p < s.fast ? "fast" : p > s.slow ? "slow" : "ok")
        }
        stepStart = (elapsed, meters)
        stepIndex += 1
        paceWarning = 0
        outside = 0
        spokenInStep = 0
        // Tapis: the next palier's speed and incline, and what to do.
        if indoor, let n = step, let sp = n.speed {
            let inc = n.incline ?? incline
            var parts: [String] = []
            if inc != incline { parts.append("\(inc > incline ? "Monte" : "Descends") à \(fmt1(inc)) %") }
            if sp != speed { parts.append("\(sp > speed ? "Accélère" : "Ralentis") à \(fmt1(sp)) km/h") }
            changeText = parts.isEmpty ? "Garde le même réglage" : parts.joined(separator: ", ")
            closeSeg(force: true)
            speed = sp
            incline = inc
        }
        if finishedPlan {
            WKInterfaceDevice.current().play(.success)
        } else {
            WKInterfaceDevice.current().play(step?.phase == "work" ? .start : .stop)
        }
    }

    // MARK: tapis settings

    /// Closes the current palier. Turning the crown makes many small changes: a palier of
    /// less than 3 s is merged into the next one.
    private func closeSeg(force: Bool = false) {
        let d = elapsed - segStart
        if d >= 3 || (force && d >= 1) {
            segs.append(["secs": d, "speed": speed, "incline": incline])
            segStart = elapsed
        }
    }

    func setSpeed(_ v: Double) {
        let x = min(30, max(1, (v * 10).rounded() / 10))
        guard indoor, x != speed else { return }
        closeSeg()
        speed = x
    }

    func setIncline(_ v: Double) {
        let x = min(15, max(0, (v * 2).rounded() / 2))
        guard indoor, x != incline else { return }
        closeSeg()
        incline = x
    }

    // MARK: pause, end

    func pause() {
        guard phase == .running else { return }
        manualPause = true
        session?.pause()
    }

    func resume() {
        guard phase == .paused else { return }
        manualPause = false
        autoPaused = false
        session?.resume()
    }

    func lock() { WKInterfaceDevice.current().enableWaterLock() }

    /// Ends the run: saved to Apple Health (with the route) and sent to the iPhone, or dropped.
    func end(save: Bool) {
        guard let s = session, let b = builder else { phase = .idle; run = nil; return }
        ticker?.invalidate()
        ticker = nil
        location.stopUpdatingLocation()
        let end = Date()
        elapsed = b.elapsedTime(at: end)
        // The step in progress counts too (the verdict needs every step that was run).
        if guided, !finishedPlan, elapsed - stepStart.t > 5 {
            splits.append(["secs": elapsed - stepStart.t, "meters": meters - stepStart.m])
        }
        let r = run
        let isIndoor = indoor
        if isIndoor { closeSeg(force: true) }
        var payload: [String: Any] = [
            "type": "run", "key": r?.key ?? "", "start": startDate.timeIntervalSince1970 * 1000,
            "secs": elapsed, "meters": meters, "hr": averageHeartRate, "kcal": calories,
            "splits": guided && !isIndoor ? splits : [],
        ]
        if isIndoor {
            payload["activity"] = r?.activity ?? "treadmill"
            payload["elevation"] = elevation
            payload["segments"] = segs
        }
        let worth = save && meters >= 200 && elapsed >= 60
        if worth {
            let slow = effortResults.filter { $0 == "slow" }.count
            let fast = effortResults.filter { $0 == "fast" }.count
            let ok = effortResults.count - slow - fast
            let note = effortResults.isEmpty ? "" : "Allure tenue sur \(ok) / \(effortResults.count) efforts"
                + (fast > 0 ? " · \(fast) trop vite" : "") + (slow > 0 ? " · \(slow) trop lent" + (slow > 1 ? "s" : "") : "")
            summary = RunSummary(title: r?.title ?? "Course", seconds: elapsed, meters: meters, heartRate: averageHeartRate,
                                 calories: calories, efforts: isIndoor ? [] : effortResults, note: isIndoor ? "" : note,
                                 elevation: elevation, indoor: isIndoor)
        }
        phase = .saving
        s.end()
        let routeBuilder = route
        let start = startDate
        let dist = meters
        let climb = elevation
        let finish: () -> Void = { b.endCollection(withEnd: end) { [weak self] _, _ in
            guard worth else {
                b.discardWorkout()
                DispatchQueue.main.async { self?.finishUp() }
                return
            }
            var meta: [String: Any] = [HKMetadataKeyWorkoutBrandName: "Kadence", HKMetadataKeyIndoorWorkout: isIndoor]
            if isIndoor, climb > 0 { meta[HKMetadataKeyElevationAscended] = HKQuantity(unit: .meter(), doubleValue: climb) }
            if let r, !r.key.isEmpty { meta["KadenceSessionKey"] = r.key; meta["KadenceTitle"] = r.title }
            b.addMetadata(meta) { _, _ in
                b.finishWorkout { workout, _ in
                    if let workout, let routeBuilder {
                        routeBuilder.finishRoute(with: workout, metadata: nil) { _, _ in }
                    }
                    DispatchQueue.main.async {
                        self?.onFinish?(payload)
                        self?.finishUp()
                    }
                }
            }
        } }
        // Tapis: the distance computed from the speed goes to Apple Health as one sample.
        if isIndoor, worth, dist > 0, end > start {
            let sample = HKQuantitySample(type: distanceType, quantity: HKQuantity(unit: .meter(), doubleValue: dist), start: start, end: end)
            b.add([sample]) { _, _ in finish() }
        } else {
            finish()
        }
    }

    private func finishUp() {
        session = nil
        builder = nil
        route = nil
        run = nil
        phase = .idle
    }

    // MARK: HKWorkoutSessionDelegate

    func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {
        DispatchQueue.main.async {
            guard self.session === workoutSession else { return }
            if toState == .paused { self.phase = .paused; WKInterfaceDevice.current().play(.stop) }
            if toState == .running, fromState == .paused { self.phase = .running; self.samples = []; WKInterfaceDevice.current().play(.start) }
        }
    }

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        DispatchQueue.main.async {
            if self.session === workoutSession { self.end(save: true) }
        }
    }

    // MARK: HKLiveWorkoutBuilderDelegate

    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        let bpm = HKUnit.count().unitDivided(by: .minute())
        var hr: Double?, avg: Double?, kcal: Double?, dist: Double?
        if collectedTypes.contains(hrType), let st = workoutBuilder.statistics(for: hrType) {
            hr = st.mostRecentQuantity()?.doubleValue(for: bpm)
            avg = st.averageQuantity()?.doubleValue(for: bpm)
        }
        if collectedTypes.contains(energyType), let st = workoutBuilder.statistics(for: energyType) {
            kcal = st.sumQuantity()?.doubleValue(for: .kilocalorie())
        }
        if collectedTypes.contains(distanceType), let st = workoutBuilder.statistics(for: distanceType) {
            dist = st.sumQuantity()?.doubleValue(for: .meter())
        }
        DispatchQueue.main.async {
            if let hr { self.heartRate = hr }
            if let avg { self.averageHeartRate = avg }
            if let kcal { self.calories = kcal }
            if let dist, !self.indoor { self.meters = dist }
        }
    }

    // MARK: CLLocationManagerDelegate

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        let good = locations.filter { $0.horizontalAccuracy >= 0 && $0.horizontalAccuracy <= 50 }
        DispatchQueue.main.async {
            if let last = locations.last { self.gpsReady = last.horizontalAccuracy >= 0 && last.horizontalAccuracy <= 30 }
            guard self.session != nil else { return }
            if !good.isEmpty, self.phase == .running { self.route?.insertRouteData(good) { _, _ in } }
            // Automatic pause: stopped for 8 s; starts again after 3 s of running.
            guard let speed = locations.last?.speed, speed >= 0 else { return }
            if self.phase == .running {
                self.still = speed < 0.4 ? self.still + 1 : 0
                if self.still >= 8 {
                    self.still = 0
                    self.autoPaused = true
                    self.session?.pause()
                }
            } else if self.phase == .paused, self.autoPaused, !self.manualPause {
                self.moving = speed > 1.4 ? self.moving + 1 : 0
                if self.moving >= 3 {
                    self.moving = 0
                    self.autoPaused = false
                    self.session?.resume()
                }
            }
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        DispatchQueue.main.async { self.gpsReady = false }
    }
}

/// Short spoken alerts in French, over the music (lowered while speaking), in the AirPods
/// or through the watch's speaker.
final class Voice: NSObject, AVSpeechSynthesizerDelegate {
    private let synth = AVSpeechSynthesizer()

    override init() {
        super.init()
        synth.delegate = self
    }

    func say(_ text: String) {
        guard !synth.isSpeaking else { return }
        let a = AVAudioSession.sharedInstance()
        try? a.setCategory(.playback, mode: .voicePrompt, options: [.duckOthers])
        try? a.setActive(true)
        let u = AVSpeechUtterance(string: text)
        u.voice = AVSpeechSynthesisVoice(language: "fr-FR")
        u.rate = AVSpeechUtteranceDefaultSpeechRate
        synth.speak(u)
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        // Music back to its normal volume.
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
