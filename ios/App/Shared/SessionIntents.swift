import AppIntents
import Foundation

/// Buttons of the Live Activity. They run in the iPhone app's process, which sets `handle`
/// at launch; the widget extension only draws the buttons.
enum SessionButton: String {
    case addRest, skipRest, validate
}

enum SessionIntentRouter {
    static var handle: ((SessionButton) async -> Void)?
}

struct AddRestIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Ajouter 15 secondes de repos"
    init() {}
    func perform() async throws -> some IntentResult {
        await SessionIntentRouter.handle?(.addRest)
        return .result()
    }
}

struct SkipRestIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Passer le repos"
    init() {}
    func perform() async throws -> some IntentResult {
        await SessionIntentRouter.handle?(.skipRest)
        return .result()
    }
}

struct ValidateSetIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Valider la série"
    init() {}
    func perform() async throws -> some IntentResult {
        await SessionIntentRouter.handle?(.validate)
        return .result()
    }
}
