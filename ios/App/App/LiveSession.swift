import ActivityKit
import Foundation

/// Starts, updates and ends the session's Live Activity from the state sent by the web app
/// (liveState() in src/watch.js), and handles its buttons.
final class LiveSession {
    static let shared = LiveSession()

    /// Same fields as liveState(); times in JavaScript milliseconds (0 = none).
    private struct Incoming: Decodable {
        var title: String
        var exercise: String
        var setLabel: String
        var next: String
        var record: String
        var restStart: Double
        var restEnd: Double
        var done: Int
        var total: Int
        var ex: Int
        var name: String
        var set: Int
        var kg: Double
        var reps: Int
        var rest: Int
    }

    private var activity: Activity<SessionActivityAttributes>? {
        Activity<SessionActivityAttributes>.activities.first { $0.activityState == .active || $0.activityState == .stale }
    }

    private static func date(_ ms: Double) -> Date? { ms > 0 ? Date(timeIntervalSince1970: ms / 1000) : nil }

    private static func content(_ st: SessionActivityAttributes.ContentState) -> ActivityContent<SessionActivityAttributes.ContentState> {
        // Stale at the end of the rest: the activity then shows « C'est reparti » by itself.
        let stale = st.restEnd.flatMap { $0 > Date() ? $0 : nil }
        return ActivityContent(state: st, staleDate: stale, relevanceScore: 100)
    }

    /// `json` is "null" when there is no session.
    /// Last problem met, shown by Profil › Tester la Dynamic Island.
    private(set) var lastError = ""

    var info: [String: Any] {
        let auth = ActivityAuthorizationInfo()
        return [
            "enabled": auth.areActivitiesEnabled,
            "running": Activity<SessionActivityAttributes>.activities.count,
            "error": lastError,
        ]
    }

    /// `json` is "null" when there is no session.
    func apply(json: String) {
        if json == "null" {
            end()
            return
        }
        let inc: Incoming
        do {
            inc = try JSONDecoder().decode(Incoming.self, from: Data(json.utf8))
        } catch {
            lastError = "Données illisibles : \(error)"
            return
        }
        let st = SessionActivityAttributes.ContentState(
            exercise: inc.exercise, setLabel: inc.setLabel, next: inc.next, record: inc.record,
            restStart: Self.date(inc.restStart), restEnd: Self.date(inc.restEnd),
            done: inc.done, total: inc.total,
            ex: inc.ex, name: inc.name, set: inc.set, kg: inc.kg, reps: inc.reps, rest: inc.rest,
            validated: false
        )
        DispatchQueue.main.async {
            if let a = self.activity {
                Task { await a.update(Self.content(st)) }
                return
            }
            guard ActivityAuthorizationInfo().areActivitiesEnabled else {
                self.lastError = "Activités en direct désactivées (Réglages › Kadeon Sport)."
                return
            }
            do {
                _ = try Activity.request(attributes: SessionActivityAttributes(title: inc.title), content: Self.content(st), pushType: nil)
                self.lastError = ""
            } catch {
                self.lastError = "Démarrage refusé : \(error)"
            }
        }
    }

    func end() {
        Task {
            for a in Activity<SessionActivityAttributes>.activities {
                await a.end(nil, dismissalPolicy: .immediate)
            }
        }
    }

    /// A button of the activity: shown at once on the activity, and queued for the web app
    /// like an Apple Watch action (applied when it runs, at the time of the tap).
    func handle(_ button: SessionButton) async {
        guard let a = activity else { return }
        var st = a.content.state
        let now = Date()
        let at = (now.timeIntervalSince1970 * 1000).rounded()
        var action: [String: Any] = ["at": at, "seq": at]
        switch button {
        case .addRest:
            let end = max(now, (st.restEnd ?? now).addingTimeInterval(15))
            if st.restStart == nil || (st.restEnd ?? .distantPast) <= now { st.restStart = now }
            st.restEnd = end
            action["type"] = "rest"
            action["delta"] = 15
        case .skipRest:
            st.restStart = nil
            st.restEnd = nil
            action["type"] = "skip"
        case .validate:
            guard !st.validated, st.ex >= 0, st.reps > 0 else { return }
            action["type"] = "validate"
            action["ex"] = st.ex
            action["name"] = st.name
            action["set"] = st.set
            action["kg"] = st.kg
            action["reps"] = st.reps
            st.validated = true
            st.record = ""
            st.next = ""
            st.setLabel = "Série validée"
            st.done = min(st.total, st.done + 1)
            if st.rest > 0 {
                st.restStart = now
                st.restEnd = now.addingTimeInterval(TimeInterval(st.rest))
            }
        }
        WatchLink.shared.enqueueLocal(action)
        await a.update(Self.content(st))
    }
}
