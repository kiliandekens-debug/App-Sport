import Foundation
import Capacitor

/// Web app ↔ Apple Watch (see src/watch.js).
@objc(WatchBridgePlugin)
public class WatchBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WatchBridgePlugin"
    public let jsName = "WatchBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "drain", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startWorkout", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "info", returnType: CAPPluginReturnPromise),
    ]

    private var observer: NSObjectProtocol?

    override public func load() {
        observer = NotificationCenter.default.addObserver(forName: WatchLink.actionsQueued, object: nil, queue: .main) { [weak self] _ in
            self?.notifyListeners("action", data: [:])
        }
    }

    deinit {
        if let o = observer { NotificationCenter.default.removeObserver(o) }
    }

    @objc func update(_ call: CAPPluginCall) {
        WatchLink.shared.send(state: call.getString("state") ?? "{}")
        call.resolve()
    }

    @objc func drain(_ call: CAPPluginCall) {
        call.resolve(["actions": WatchLink.shared.drain()])
    }

    @objc func startWorkout(_ call: CAPPluginCall) {
        WatchLink.shared.startWatchWorkout { ok in call.resolve(["ok": ok]) }
    }

    @objc func info(_ call: CAPPluginCall) {
        call.resolve(WatchLink.shared.info)
    }
}
