import Foundation
import HealthKit
import WorkoutKit

/// Sends a running session of the plan to Apple's Workout app on the watch (WorkoutKit):
/// warm-up, intervals, cool-down, each with its duration and pace alert. The watch then
/// does GPS, pace, heart rate, cadence and route, and saves the run to Apple Health, from
/// where Kadence imports it. JSON shape: watchWorkout() in src/lib/running.js.
enum RunScheduler {
    struct Pace: Decodable { let fast: Double; let slow: Double }  // s/km
    struct Step: Decodable { let secs: Double; let purpose: String?; let pace: Pace? }
    struct Block: Decodable { let iterations: Int; let steps: [Step] }
    struct Run: Decodable { let name: String; let ymd: String; let warmup: Step?; let blocks: [Block]; let cooldown: Step? }

    enum Failure: LocalizedError {
        case unsupported, denied, invalid
        var errorDescription: String? {
            switch self {
            case .unsupported: return "Il faut une Apple Watch jumelée avec watchOS 10 ou plus récent."
            case .denied: return "Accès refusé. Autorise Kadence dans Réglages › Santé › Accès aux données, ou dans l'app Watch."
            case .invalid: return "Séance illisible."
            }
        }
    }

    private static func alert(_ p: Pace?) -> (any WorkoutAlert)? {
        guard let p, p.fast > 0, p.slow > p.fast else { return nil }
        let low = Measurement(value: 1000 / p.slow, unit: UnitSpeed.metersPerSecond)
        let high = Measurement(value: 1000 / p.fast, unit: UnitSpeed.metersPerSecond)
        return SpeedRangeAlert(target: low...high, metric: .current)
    }

    private static func step(_ s: Step) -> WorkoutStep {
        WorkoutStep(goal: .time(max(1, s.secs), .seconds), alert: alert(s.pace))
    }

    /// Scheduled on the session's day (today: right now), replacing what Kadeon had already sent for that day.
    static func schedule(json: String) async throws {
        guard WorkoutScheduler.isSupported else { throw Failure.unsupported }
        guard let run = try? JSONDecoder().decode(Run.self, from: Data(json.utf8)), !run.blocks.isEmpty else { throw Failure.invalid }

        let blocks = run.blocks.map { b -> IntervalBlock in
            let steps = b.steps.map { s -> IntervalStep in
                var i = IntervalStep(s.purpose == "recovery" ? .recovery : .work)
                i.step = step(s)
                return i
            }
            return IntervalBlock(steps: steps, iterations: max(1, b.iterations))
        }
        let workout = CustomWorkout(
            activity: .running,
            location: .outdoor,
            displayName: run.name,
            warmup: run.warmup.map(step),
            blocks: blocks,
            cooldown: run.cooldown.map(step)
        )
        let plan = WorkoutPlan(.custom(workout))

        let scheduler = WorkoutScheduler.shared
        var state = await scheduler.authorizationState
        if state != .authorized { state = await scheduler.requestAuthorization() }
        guard state == .authorized else { throw Failure.denied }

        let cal = Calendar.current
        let parts = run.ymd.split(separator: "-").compactMap { Int($0) }
        var when = DateComponents()
        if parts.count == 3 {
            when.year = parts[0]; when.month = parts[1]; when.day = parts[2]
        }
        let now = Date()
        let today = cal.dateComponents([.year, .month, .day], from: now)
        if parts.count != 3 || (when.year == today.year && when.month == today.month && when.day == today.day) {
            when = cal.dateComponents([.year, .month, .day, .hour, .minute], from: now)
        } else {
            when.hour = 7
            when.minute = 0
        }

        for old in await scheduler.scheduledWorkouts
        where old.date.year == when.year && old.date.month == when.month && old.date.day == when.day {
            await scheduler.remove(old.plan, at: old.date)
        }
        await scheduler.schedule(plan, at: when)
    }
}
