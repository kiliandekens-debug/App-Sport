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
        guard WCSession.isSupported() else { return ["paired": false, "installed": false, "reachable": false] }
        let s = WCSession.default
        let on = s.activationState == .activated
        return ["paired": on && s.isPaired, "installed": on && s.isWatchAppInstalled, "reachable": on && s.isReachable]
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
        enqueue(message)
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        enqueue(message)
        replyHandler([:])
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        enqueue(userInfo)
    }
}
