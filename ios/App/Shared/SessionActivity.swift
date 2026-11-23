import ActivityKit
import Foundation

/// Live Activity of a gym session (Dynamic Island, lock screen, Apple Watch Smart Stack).
/// Shared by the iPhone app (which starts and updates it) and the widget extension (which draws it).
struct SessionActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        /// Exercise of the next set, and « Série 2/4 » / « Échauffement 1/2 ».
        var exercise: String
        var setLabel: String
        /// Next set: « 80 × 8 », or « × 8 » with body weight.
        var next: String
        /// Set that would be a new personal best (« 82,5 × 7 »), empty otherwise.
        var record: String
        /// Rest timer; nil when not resting.
        var restStart: Date?
        var restEnd: Date?
        var done: Int
        var total: Int
        /// The set the « Valider » button validates (same fields as a watch action).
        var ex: Int
        var name: String
        var set: Int
        var kg: Double
        var reps: Int
        var rest: Int
        /// Validated from the lock screen, waiting for the app to catch up.
        var validated: Bool
    }

    var title: String
}
