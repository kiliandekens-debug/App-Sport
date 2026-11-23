import Foundation
import UIKit
import WatchConnectivity
import HealthKit

/// Link with the Apple Watch app. Started at launch (before the web view) so that actions
/// sent by the watch while the iPhone app was closed are kept until the web app reads them.
final class WatchLink: NSObject, WCSessionDelegate {
    static let shared = WatchLink()
    static let actionsQueued = Notification.Name("KadeonWatchActionsQueued")

    private let queueKey = "kadeon.watch.actions"
    private let lock = NSLock()
    private var lastState: String?
    private let health = HKHealthStore()

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    // MARK: phone → watch

    /// Latest session state (JSON): kept as application context (delivered even if the watch
    /// app is closed) and sent at once when the watch app is open.
    func send(state: String) {
        lastState = state
        guard WCSession.isSupported() else { return }
        let s = WCSession.default
        guard s.activationState == .activated, s.isPaired, s.isWatchAppInstalled else { return }
        try? s.updateApplicationContext(["state": state])
        if s.isReachable {
            s.sendMessage(["state": state], replyHandler: nil, errorHandler: nil)
        }
    }

    var info: [String: Bool] {
        // The watch says every few seconds whether its workout runs; after 30 min of silence it is considered over.
        let workout = watchWorkout && Date().timeIntervalSince(statusAt) < 1800
        guard WCSession.isSupported() else { return ["paired": false, "installed": false, "reachable": false, "workout": false] }
        let s = WCSession.default
        let on = s.activationState == .activated
        return ["paired": on && s.isPaired, "installed": on && s.isWatchAppInstalled, "reachable": on && s.isReachable, "workout": on && workout]
    }

    // MARK: watch status (workout running, heart rate)

    private var watchWorkout = false
    private var statusAt = Date.distantPast

    private func status(_ payload: [String: Any]) {
        guard let json = payload["status"] as? String, let data = json.data(using: .utf8),
              let st = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        DispatchQueue.main.async {
            self.watchWorkout = (st["workout"] as? Bool) ?? false
            self.statusAt = Date()
            let hr = (st["hr"] as? Double) ?? 0
            LiveSession.shared.heartRate(self.watchWorkout ? hr : 0)
        }
    }

    // MARK: login, for saving a session finished on the watch while the iPhone is locked

    private let authKey = "kadence.auth"

    func setAuth(_ auth: [String: Any]) {
        UserDefaults.standard.set(auth, forKey: authKey)
    }

    /// Saves the session sent with a « finish » action (workout + done sets, as the web app
    /// does), only when the iPhone app is not on screen and the access token is still valid.
    /// Returns the new workout id, or nil (the web app then saves it when it runs).
    private func saveFinished(_ action: [String: Any]) async -> String? {
        guard let auth = UserDefaults.standard.dictionary(forKey: authKey),
              let base = auth["url"] as? String, let key = auth["key"] as? String,
              let token = auth["access"] as? String, !token.isEmpty,
              let exp = auth["expiresAt"] as? Double, exp / 1000 > Date().timeIntervalSince1970 + 120,
              let session = action["session"] as? [String: Any],
              let exercises = session["exercises"] as? [[String: Any]],
              let startedAt = session["startedAt"] as? Double,
              let at = action["at"] as? Double else { return nil }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        func request(_ path: String, _ method: String, _ body: Any?) -> URLRequest? {
            guard let url = URL(string: base + "/rest/v1/" + path) else { return nil }
            var r = URLRequest(url: url)
            r.httpMethod = method
            r.setValue(key, forHTTPHeaderField: "apikey")
            r.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
            r.setValue("return=representation", forHTTPHeaderField: "Prefer")
            if let body { r.httpBody = try? JSONSerialization.data(withJSONObject: body) }
            return r
        }
        var rows: [[String: Any]] = []
        var used: [String] = []
        for (position, e) in exercises.enumerated() {
            guard let name = e["name"] as? String, let sets = e["sets"] as? [[String: Any]] else { continue }
            let letter = (e["superset"] as? String) ?? ""
            let superset: Any = letter.unicodeScalars.first.map { Int($0.value) - 64 } ?? NSNull()
            var index = 0
            for x in sets where (x["done"] as? Bool) == true {
                let warm = (x["warm"] as? Bool) ?? false
                rows.append([
                    "exercise": name, "position": position, "set_index": index,
                    "set_type": (x["type"] as? String) ?? (warm ? "warmup" : "normal"),
                    "weight_kg": (x["kg"] as? Double) ?? 0, "reps": (x["reps"] as? Int) ?? 0,
                    "superset_id": superset,
                ])
                index += 1
            }
            if index > 0 { used.append(name) }
        }
        guard !rows.isEmpty else { return nil }
        let workout: [String: Any] = [
            "title": (session["title"] as? String) ?? "Séance",
            "started_at": iso.string(from: Date(timeIntervalSince1970: startedAt / 1000)),
            "ended_at": iso.string(from: Date(timeIntervalSince1970: at / 1000)),
            "source": "app",
        ]
        guard let r1 = request("workouts", "POST", workout),
              let res1 = try? await URLSession.shared.data(for: r1),
              (res1.1 as? HTTPURLResponse)?.statusCode == 201,
              let made = (try? JSONSerialization.jsonObject(with: res1.0)) as? [[String: Any]],
              let id = made.first?["id"] as? String else { return nil }
        guard let r2 = request("sets", "POST", rows.map { $0.merging(["workout_id": id]) { a, _ in a } }),
              let res2 = try? await URLSession.shared.data(for: r2),
              (res2.1 as? HTTPURLResponse)?.statusCode == 201 else {
            // Half-saved: removed, so the web app can save it whole later.
            if let r = request("workouts?id=eq.\(id)", "DELETE", nil) { _ = try? await URLSession.shared.data(for: r) }
            return nil
        }
        // The coach's targets for these exercises are used up (as in the web app).
        let list = used.map { "\"" + $0.replacingOccurrences(of: "\"", with: "\\\"") + "\"" }.joined(separator: ",")
        if let q = "exercise=in.(\(list))".addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
           let r = request("coach_plans?" + q, "DELETE", nil) {
            _ = try? await URLSession.shared.data(for: r)
        }
        return id
    }

    /// Opens the watch app and starts a strength training workout there.
    func startWatchWorkout(_ done: @escaping (Bool) -> Void) {
        guard HKHealthStore.isHealthDataAvailable(), WCSession.isSupported(),
              WCSession.default.activationState == .activated, WCSession.default.isWatchAppInstalled else {
            done(false)
            return
        }
        let config = HKWorkoutConfiguration()
        config.activityType = .traditionalStrengthTraining
        config.locationType = .indoor
        health.startWatchApp(with: config) { ok, _ in
            DispatchQueue.main.async { done(ok) }
        }
    }

    // MARK: watch → phone

    /// Returns the queued actions (JSON strings, oldest first) and empties the queue.
    func drain() -> [String] {
        lock.lock()
        defer { lock.unlock() }
        let list = UserDefaults.standard.stringArray(forKey: queueKey) ?? []
        UserDefaults.standard.removeObject(forKey: queueKey)
        return list
    }

    /// An action made on the iPhone outside the web app (Live Activity buttons).
    func enqueueLocal(_ action: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: action),
              let json = String(data: data, encoding: .utf8) else { return }
        enqueue(["action": json])
    }

    /// A message from the watch: its status, or an action. A « finish » sent while the iPhone
    /// app is not on screen is saved here first, then queued marked as saved.
    private func received(_ payload: [String: Any]) {
        if payload["status"] != nil { status(payload) }
        guard let json = payload["action"] as? String else { return }
        guard let data = json.data(using: .utf8),
              let action = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              (action["type"] as? String) == "finish" else {
            enqueue(payload)
            return
        }
        DispatchQueue.main.async {
            let foreground = UIApplication.shared.applicationState == .active
            let task = BackgroundTask()
            Task {
                var out = action
                if !foreground, let id = await self.saveFinished(action) { out["saved"] = id }
                out["session"] = nil
                if let d = try? JSONSerialization.data(withJSONObject: out), let j = String(data: d, encoding: .utf8) {
                    self.enqueue(["action": j])
                }
                await MainActor.run { task.end() }
            }
        }
    }

    private func enqueue(_ payload: [String: Any]) {
        guard let action = payload["action"] as? String else { return }
        lock.lock()
        var list = UserDefaults.standard.stringArray(forKey: queueKey) ?? []
        list.append(action)
        UserDefaults.standard.set(Array(list.suffix(500)), forKey: queueKey)
        lock.unlock()
        DispatchQueue.main.async {
            // A few seconds for the web app to apply the action if the iPhone was woken up in the background.
            var task: UIBackgroundTaskIdentifier = .invalid
            task = UIApplication.shared.beginBackgroundTask {
                UIApplication.shared.endBackgroundTask(task)
                task = .invalid
            }
            NotificationCenter.default.post(name: WatchLink.actionsQueued, object: nil)
            DispatchQueue.main.asyncAfter(deadline: .now() + 20) {
                if task != .invalid { UIApplication.shared.endBackgroundTask(task) }
                task = .invalid
            }
        }
    }

    // MARK: WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        if activationState == .activated, let st = lastState {
            DispatchQueue.main.async { self.send(state: st) }
        }
    }

    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        // Another watch was paired: start again with it.
        WCSession.default.activate()
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        if session.isReachable, let st = lastState {
            DispatchQueue.main.async { self.send(state: st) }
        }
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        received(message)
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        received(message)
        replyHandler([:])
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        received(userInfo)
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        status(applicationContext)
    }
}

/// A few seconds of background time while a message from the watch is handled.
final class BackgroundTask {
    private var id: UIBackgroundTaskIdentifier = .invalid

    init() {
        id = UIApplication.shared.beginBackgroundTask { [weak self] in self?.end() }
    }

    func end() {
        if id != .invalid { UIApplication.shared.endBackgroundTask(id) }
        id = .invalid
    }
}
