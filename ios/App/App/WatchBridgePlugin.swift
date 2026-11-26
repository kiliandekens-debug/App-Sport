import Foundation
import Capacitor
import AuthenticationServices

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
        CAPPluginMethod(name: "scheduleRun", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "live", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "liveInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAuth", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "runSplits", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "appleSignIn", returnType: CAPPluginReturnPromise),
    ]

    private var observer: NSObjectProtocol?
    /// The pending « Continuer avec Apple » call (see src/appleAuth.js).
    private var appleCall: CAPPluginCall?

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

    /// A running session of the plan, sent to Apple's Workout app on the watch.
    @objc func scheduleRun(_ call: CAPPluginCall) {
        let json = call.getString("workout") ?? ""
        Task {
            do {
                try await RunScheduler.schedule(json: json)
                call.resolve()
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    /// Live Activity of the session (Dynamic Island, lock screen): "null" ends it.
    @objc func live(_ call: CAPPluginCall) {
        LiveSession.shared.apply(json: call.getString("state") ?? "null")
        call.resolve()
    }

    /// Login (url, key, access token, expiry) for saving a session finished on the watch while the iPhone is locked.
    @objc func setAuth(_ call: CAPPluginCall) {
        WatchLink.shared.setAuth([
            "url": call.getString("url") ?? "",
            "key": call.getString("key") ?? "",
            "access": call.getString("access") ?? "",
            "expiresAt": call.getDouble("expiresAt") ?? 0,
        ])
        call.resolve()
    }

    /// Intervals of the run recorded by the watch between `start` and `end` (ISO dates).
    @objc func runSplits(_ call: CAPPluginCall) {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let a = call.getString("start").flatMap(iso.date(from:)),
              let b = call.getString("end").flatMap(iso.date(from:)) else {
            call.resolve(["intervals": []])
            return
        }
        Task {
            let list = await RunSplits.intervals(start: a, end: b)
            call.resolve(["intervals": list])
        }
    }

    @objc func liveInfo(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(LiveSession.shared.info) }
    }

    @objc func info(_ call: CAPPluginCall) {
        call.resolve(WatchLink.shared.info)
    }

    /// Sign in with Apple: the system sheet (Face ID), then the identity token goes back to the
    /// web app, which hands it to Supabase. `nonce` is the SHA-256 of the raw nonce kept by JS.
    @objc func appleSignIn(_ call: CAPPluginCall) {
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = call.getString("nonce")
        appleCall = call
        DispatchQueue.main.async {
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }
}

extension WatchBridgePlugin: ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = appleCall else { return }
        appleCall = nil
        guard let cred = authorization.credential as? ASAuthorizationAppleIDCredential,
              let data = cred.identityToken, let token = String(data: data, encoding: .utf8) else {
            call.reject("Apple n'a pas renvoyé de jeton.")
            return
        }
        var out: [String: Any] = ["idToken": token, "user": cred.user]
        if let given = cred.fullName?.givenName { out["givenName"] = given }
        if let family = cred.fullName?.familyName { out["familyName"] = family }
        if let email = cred.email { out["email"] = email }
        if let code = cred.authorizationCode, let c = String(data: code, encoding: .utf8) { out["authorizationCode"] = c }
        call.resolve(out)
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let call = appleCall else { return }
        appleCall = nil
        if let e = error as? ASAuthorizationError, e.code == .canceled {
            call.reject("canceled", "canceled")
        } else {
            call.reject(error.localizedDescription)
        }
    }
}
