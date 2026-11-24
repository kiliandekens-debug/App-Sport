import Foundation
import Combine
import WatchConnectivity
import WatchKit

/// The watch's copy of the session. Actions done here apply at once to this copy and are
/// sent to the iPhone, which applies them to the real session (src/watch.js). A state from
/// the iPhone replaces the copy only once it has acknowledged every action sent from here,
/// so a late message from a sleeping iPhone never undoes a set validated on the wrist.
final class WatchStore: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = WatchStore()

    @Published private(set) var session: WSession?
    @Published private(set) var suggestion: String?
    @Published private(set) var heardFromPhone = false
    @Published private(set) var waitingStart = false
    @Published private(set) var reachable = false
    @Published var summary: Summary?
    /// Next sessions of the running plan, kept for runs without the iPhone.
    @Published private(set) var runs: [WRun] = []
    /// Guided tapis sessions, kept for sessions without the iPhone.
    @Published private(set) var walks: [WRun] = []
    /// The Tapis list is open.
    @Published var tapisPicker = false
    /// Run chosen on the home screen, shown on the start screen until Démarrer.
    @Published var pendingRun: WRun?

    let workout = WorkoutManager()
    let runner = RunManager()

    /// The first run of the plan from today on.
    var upcomingRun: WRun? {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        let today = f.string(from: Date())
        return runs.first { $0.ymd >= today }
    }

    private let defaults = UserDefaults.standard
    private var lastSent: Double
    private var outbox: [String] = []
    private var restTimer: Timer?
    private var bag = Set<AnyCancellable>()

    override init() {
        lastSent = defaults.double(forKey: "lastSent")
        if let data = defaults.data(forKey: "session"), let s = try? JSONDecoder().decode(WSession.self, from: data) {
            session = s
        }
        suggestion = defaults.string(forKey: "suggestion")
        if let data = defaults.data(forKey: "walks"), let w = try? JSONDecoder().decode([WRun].self, from: data) {
            walks = w
        }
        if let data = defaults.data(forKey: "runs"), let r = try? JSONDecoder().decode([WRun].self, from: data) {
            runs = r
        }
        super.init()
        // Running screen: live values forwarded, and the finished run sent to the iPhone.
        runner.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }.store(in: &bag)
        runner.onFinish = { [weak self] payload in
            guard let self else { return }
            self.send(payload, at: nowMs())
            self.runs.removeAll { !$0.key.isEmpty && $0.key == (payload["key"] as? String) }
        }
        // Heart rate and calories shown live: forward the workout's changes.
        workout.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }.store(in: &bag)
        // Tell the iPhone at once when the workout starts or stops (it then leaves the end-of-rest
        // alerts to the watch), and every 10 s the heart rate for the Dynamic Island.
        workout.$running.removeDuplicates().sink { [weak self] _ in
            DispatchQueue.main.async { self?.sendStatus() }
        }.store(in: &bag)
        Timer.publish(every: 10, on: .main, in: .common).autoconnect().sink { [weak self] _ in
            guard let self, self.workout.running else { return }
            self.sendStatus()
        }.store(in: &bag)
    }

    private func sendStatus() {
        guard WCSession.isSupported(), WCSession.default.activationState == .activated else { return }
        let st: [String: Any] = ["workout": workout.running, "hr": workout.heartRate, "at": nowMs()]
        guard let data = try? JSONSerialization.data(withJSONObject: st), let json = String(data: data, encoding: .utf8) else { return }
        try? WCSession.default.updateApplicationContext(["status": json])
        if WCSession.default.isReachable {
            WCSession.default.sendMessage(["status": json], replyHandler: nil, errorHandler: nil)
        }
    }

    // MARK: heart rate back down during the rest

    private var peakFor: Double = -1
    private var peak: Double = 0

    /// « Prêt » once the heart rate is 20 bpm under its peak of this rest, or under 100.
    func ready(for s: WSession) -> Bool {
        let hr = workout.heartRate
        guard hr > 0 else { return false }
        if peakFor != s.restUntil { peakFor = s.restUntil; peak = hr }
        peak = max(peak, hr)
        return hr <= peak - 20 || hr < 100
    }

    func activate() {
        workout.requestAuthorization()
        scheduleRestAlert()
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    // MARK: actions done on the watch

    func start() {
        guard session == nil, !runner.active else { return }
        waitingStart = true
        send(["type": "start"], at: nowMs())
        workout.start()
    }

    /// Nothing came back from the iPhone: give up waiting.
    func cancelStart() {
        waitingStart = false
        if session == nil { workout.end(save: false) }
    }

    func validate(kg: Double, reps: Int) {
        guard var s = session, let si = s.activeSet, let e = s.exercise else { return }
        let ei = s.current
        let at = nowMs()
        s.validate(ex: ei, set: si, kg: kg, reps: reps, at: at)
        setSession(s)
        send(["type": "validate", "ex": ei, "name": e.name, "set": si, "kg": kg, "reps": reps], at: at)
        WKInterfaceDevice.current().play(.success)
    }

    /// One more set on the current exercise.
    func addSet() {
        guard var s = session else { return }
        let ei = s.current
        guard s.exercises.indices.contains(ei) else { return }
        s.addSet(ex: ei)
        setSession(s)
        send(["type": "addSet", "ex": ei, "name": s.exercises[ei].name], at: nowMs())
        WKInterfaceDevice.current().play(.click)
    }

    /// Machine taken: another exercise for the same muscle takes the remaining sets.
    func replace(with alt: WAlt) {
        guard var s = session else { return }
        let ei = s.current
        guard s.exercises.indices.contains(ei) else { return }
        let name = s.exercises[ei].name
        s.replace(ex: ei, with: alt)
        setSession(s)
        send(["type": "replace", "ex": ei, "name": name, "with": alt.name], at: nowMs())
        WKInterfaceDevice.current().play(.success)
    }

    func shiftRest(_ seconds: Int) {
        guard var s = session else { return }
        let at = nowMs()
        s.shiftRest(seconds, at: at)
        setSession(s)
        send(["type": "rest", "delta": seconds], at: at)
        WKInterfaceDevice.current().play(.click)
    }

    func skipRest() {
        guard var s = session else { return }
        s.restUntil = 0
        setSession(s)
        send(["type": "skip"], at: nowMs())
    }

    func choose(_ index: Int) {
        guard var s = session, s.exercises.indices.contains(index) else { return }
        s.current = index
        setSession(s)
        send(["type": "current", "ex": index, "name": s.exercises[index].name], at: nowMs())
    }

    func finish() {
        guard let s = session else { return }
        summary = makeSummary(s)
        setSession(nil)
        // The whole session goes with it: the iPhone can save it at once, even locked.
        var action: [String: Any] = ["type": "finish"]
        if let data = try? JSONEncoder().encode(s), let obj = try? JSONSerialization.jsonObject(with: data) { action["session"] = obj }
        send(action, at: nowMs())
        workout.end(save: true, title: s.title, volume: s.volume)
    }

    // MARK: state from the iPhone

    private func receive(_ payload: [String: Any]) {
        guard let json = payload["state"] as? String, let data = json.data(using: .utf8),
              let st = try? JSONDecoder().decode(PhoneState.self, from: data) else { return }
        DispatchQueue.main.async { self.apply(st) }
    }

    private func apply(_ st: PhoneState) {
        heardFromPhone = true
        if let w = st.walks {
            walks = w
            if let data = try? JSONEncoder().encode(w) { defaults.set(data, forKey: "walks") }
        }
        if let r = st.runs {
            runs = r
            if let data = try? JSONEncoder().encode(r) { defaults.set(data, forKey: "runs") }
        }
        suggestion = st.suggestion
        defaults.set(st.suggestion, forKey: "suggestion")
        // The iPhone has not applied our latest actions yet: keep our own copy.
        if (st.ack ?? 0) < lastSent { return }
        let before = session
        let next = st.active ? st.session : nil
        waitingStart = false
        if before == nil, next != nil {
            summary = nil
            pendingRun = nil
        } else if let b = before, next == nil {
            // Finished or cancelled on the iPhone.
            let worked = b.done > 0
            if worked { summary = makeSummary(b) }
            workout.end(save: worked, title: b.title, volume: b.volume)
        }
        if next != before { setSession(next) }
        if next != nil, !workout.running, !runner.active {
            workout.start()
        } else if next == nil, before == nil, workout.running {
            // Start asked from the watch, but the iPhone had nothing to start.
            workout.end(save: false)
        }
    }

    // MARK: helpers

    private func setSession(_ s: WSession?) {
        session = s
        if let s, let data = try? JSONEncoder().encode(s) {
            defaults.set(data, forKey: "session")
        } else {
            defaults.removeObject(forKey: "session")
        }
        scheduleRestAlert()
    }

    private func makeSummary(_ s: WSession) -> Summary {
        Summary(
            title: s.title,
            minutes: max(0, Int((nowMs() - s.startedAt) / 60000)),
            sets: s.done,
            volume: s.volume,
            heartRate: workout.averageHeartRate,
            calories: workout.calories
        )
    }

    /// Strong taps on the wrist when the rest is over (the workout keeps the app running).
    private func scheduleRestAlert() {
        restTimer?.invalidate()
        restTimer = nil
        guard let s = session, s.restUntil > nowMs() else { return }
        let delay = (s.restUntil - nowMs()) / 1000
        restTimer = Timer.scheduledTimer(withTimeInterval: delay, repeats: false) { [weak self] _ in
            WKInterfaceDevice.current().play(.stop)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) { WKInterfaceDevice.current().play(.stop) }
            self?.objectWillChange.send()
        }
    }

    /// Actions carry an increasing number (a timestamp, so it keeps growing after a
    /// reinstall); the iPhone applies each one once and sends back the last one applied.
    private func send(_ action: [String: Any], at: Double) {
        var a = action
        let seq = max(lastSent + 1, at.rounded())
        lastSent = seq
        defaults.set(seq, forKey: "lastSent")
        a["seq"] = seq
        a["at"] = at
        guard let data = try? JSONSerialization.data(withJSONObject: a),
              let json = String(data: data, encoding: .utf8) else { return }
        outbox.append(json)
        flush()
    }

    private func flush() {
        guard WCSession.isSupported(), WCSession.default.activationState == .activated else { return }
        let s = WCSession.default
        let items = outbox
        outbox.removeAll()
        for json in items {
            let payload = ["action": json]
            if s.isReachable {
                s.sendMessage(payload, replyHandler: nil) { _ in s.transferUserInfo(payload) }
            } else {
                s.transferUserInfo(payload)
            }
        }
    }

    // MARK: WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        DispatchQueue.main.async {
            self.reachable = session.isReachable
            self.flush()
        }
        if !session.receivedApplicationContext.isEmpty { receive(session.receivedApplicationContext) }
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async { self.reachable = session.isReachable }
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        receive(applicationContext)
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        receive(message)
    }
}
