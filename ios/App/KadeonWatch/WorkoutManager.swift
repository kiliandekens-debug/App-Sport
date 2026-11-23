import Foundation
import HealthKit

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

    /// Ends the workout: saved to Apple Health, or dropped (session cancelled, or too short).
    func end(save: Bool) {
        starting = false
        guard let s = session, let b = builder else { return }
        session = nil
        builder = nil
        running = false
        s.end()
        b.endCollection(withEnd: Date()) { _, _ in
            if save {
                b.finishWorkout { _, _ in }
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
