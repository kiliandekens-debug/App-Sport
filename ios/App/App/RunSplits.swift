import Foundation
import HealthKit

/// Intervals of a run recorded by the watch (Apple Health): one per step of a workout sent
/// from Kadence (warm-up, each rep and recovery, cool-down), or the whole run.
enum RunSplits {
    private static let store = HKHealthStore()

    static func intervals(start: Date, end: Date) async -> [[String: Double]] {
        guard HKHealthStore.isHealthDataAvailable(),
              let distance = HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning) else { return [] }
        try? await store.requestAuthorization(toShare: [], read: [HKObjectType.workoutType(), distance])

        let range = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
        let workouts: [HKWorkout] = await withCheckedContinuation { c in
            let q = HKSampleQuery(sampleType: .workoutType(), predicate: range, limit: 10,
                                  sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]) { _, samples, _ in
                c.resume(returning: (samples as? [HKWorkout]) ?? [])
            }
            store.execute(q)
        }
        guard let w = workouts.first(where: { $0.workoutActivityType == .running }) else { return [] }

        var parts: [(Date, Date)] = []
        if w.workoutActivities.count > 1 {
            parts = w.workoutActivities.map { ($0.startDate, $0.endDate ?? w.endDate) }
        } else if let segments = w.workoutEvents?.filter({ $0.type == .segment }), segments.count > 1 {
            parts = segments.map { ($0.dateInterval.start, $0.dateInterval.end) }
        } else {
            parts = [(w.startDate, w.endDate)]
        }

        var out: [[String: Double]] = []
        for (a, b) in parts where b > a {
            let p = NSCompoundPredicate(andPredicateWithSubpredicates: [
                HKQuery.predicateForObjects(from: w),
                HKQuery.predicateForSamples(withStart: a, end: b, options: .strictStartDate),
            ])
            let meters: Double = await withCheckedContinuation { c in
                let q = HKStatisticsQuery(quantityType: distance, quantitySamplePredicate: p, options: .cumulativeSum) { _, st, _ in
                    c.resume(returning: st?.sumQuantity()?.doubleValue(for: .meter()) ?? 0)
                }
                store.execute(q)
            }
            out.append(["secs": b.timeIntervalSince(a), "meters": meters])
        }
        return out
    }
}
