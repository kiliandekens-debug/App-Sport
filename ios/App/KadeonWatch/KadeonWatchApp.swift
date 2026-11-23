import SwiftUI
import WatchKit
import HealthKit

final class AppDelegate: NSObject, WKApplicationDelegate {
    func applicationDidFinishLaunching() {
        WatchStore.shared.activate()
    }

    /// Session started on the iPhone: the system opens this app to run the workout.
    func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
        WatchStore.shared.workout.start()
    }
}

@main
struct KadeonWatchApp: App {
    @WKApplicationDelegateAdaptor(AppDelegate.self) var delegate

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(WatchStore.shared)
        }
    }
}
