import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

private let brand = Color(red: 1.0, green: 0.42, blue: 0.17)
private let gold = Color(red: 1.0, green: 0.78, blue: 0.19)
private let go = Color(red: 0.2, green: 0.78, blue: 0.35)

/// What the activity shows right now. The rest runs on its own (system timers); when it
/// ends, the activity goes stale and switches to « C'est reparti » without the app.
private struct Look {
    let st: SessionActivityAttributes.ContentState
    let stale: Bool

    var restRange: ClosedRange<Date>? {
        guard let a = st.restStart, let b = st.restEnd, b > a else { return nil }
        return a...b
    }
    var resting: Bool { restRange != nil && !stale && (st.restEnd ?? .distantPast) > Date() }
    var restOver: Bool { st.restEnd != nil && !resting }
    var record: Bool { !st.record.isEmpty }
    /// The fuse burns orange, or gold when the next set can beat the record.
    var tint: Color { restOver ? go : record ? gold : brand }
}

/// The fuse: a bar that burns down from right to left during the rest, with a spark at its end.
private struct Fuse: View {
    let range: ClosedRange<Date>
    let tint: Color

    var body: some View {
        ProgressView(timerInterval: range, countsDown: true) {
            EmptyView()
        } currentValueLabel: {
            EmptyView()
        }
        .progressViewStyle(.linear)
        .tint(tint)
        .labelsHidden()
    }
}

private struct RecordLine: View {
    let text: String
    var body: some View {
        Label {
            Text("\(text) = record")
                .font(.system(.footnote, design: .rounded).weight(.semibold))
        } icon: {
            Image(systemName: "trophy.fill")
        }
        .foregroundStyle(gold)
        .lineLimit(1)
    }
}

private struct Buttons: View {
    let look: Look

    var body: some View {
        HStack(spacing: 8) {
            if look.resting {
                Button(intent: AddRestIntent()) {
                    Text("+15 s").frame(maxWidth: .infinity)
                }
                .tint(.white.opacity(0.25))
                Button(intent: SkipRestIntent()) {
                    Label("Passer", systemImage: "forward.end.fill").frame(maxWidth: .infinity)
                }
                .tint(.white.opacity(0.25))
            } else if !look.st.validated && look.st.ex >= 0 && look.st.reps > 0 {
                Button(intent: ValidateSetIntent()) {
                    Label("Valider \(look.st.next)", systemImage: "checkmark").frame(maxWidth: .infinity)
                }
                .tint(look.record ? gold : brand)
            }
        }
        .font(.system(.footnote, design: .rounded).weight(.semibold))
        .buttonStyle(.borderedProminent)
    }
}

private struct Countdown: View {
    let range: ClosedRange<Date>
    var body: some View {
        Text(timerInterval: range, countsDown: true)
            .monospacedDigit()
            .multilineTextAlignment(.trailing)
    }
}

/// Lock screen banner (and Apple Watch Smart Stack).
private struct LockScreen: View {
    let look: Look

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(look.resting ? "Repos" : look.restOver ? "C'est reparti" : look.st.setLabel)
                        .font(.system(.caption, design: .rounded).weight(.semibold))
                        .foregroundStyle(look.tint)
                    Text(look.st.exercise)
                        .font(.system(.headline, design: .rounded))
                        .lineLimit(1)
                    if !look.st.next.isEmpty {
                        Text(look.resting ? "Ensuite : \(look.st.next)" : look.st.next)
                            .font(.system(.subheadline, design: .rounded))
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 8)
                if look.resting, let r = look.restRange {
                    Countdown(range: r)
                        .font(.system(size: 34, weight: .semibold, design: .rounded))
                        .foregroundStyle(look.tint)
                        .frame(maxWidth: 110, alignment: .trailing)
                } else {
                    Text("\(look.st.done)/\(look.st.total)")
                        .font(.system(.title3, design: .rounded).weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                }
            }
            if look.resting, let r = look.restRange {
                Fuse(range: r, tint: look.tint)
            }
            if look.record {
                RecordLine(text: look.st.record)
            }
            Buttons(look: look)
        }
        .padding(16)
    }
}

struct SessionLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: SessionActivityAttributes.self) { context in
            LockScreen(look: Look(st: context.state, stale: context.isStale))
                .activityBackgroundTint(Color.black.opacity(0.82))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            let look = Look(st: context.state, stale: context.isStale)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(look.st.exercise)
                            .font(.system(.footnote, design: .rounded).weight(.semibold))
                            .lineLimit(1)
                        Text(look.resting ? "Ensuite : \(look.st.next)" : look.restOver ? "C'est reparti : \(look.st.next)" : "\(look.st.setLabel) · \(look.st.next)")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if look.resting, let r = look.restRange {
                        Countdown(range: r)
                            .font(.system(.title2, design: .rounded).weight(.semibold))
                            .foregroundStyle(look.tint)
                            .frame(maxWidth: 80, alignment: .trailing)
                    } else {
                        Text("\(look.st.done)/\(look.st.total)")
                            .font(.system(.title3, design: .rounded).weight(.semibold))
                            .monospacedDigit()
                            .foregroundStyle(look.restOver ? go : .secondary)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 8) {
                        if look.resting, let r = look.restRange {
                            Fuse(range: r, tint: look.tint)
                        }
                        if look.record {
                            RecordLine(text: look.st.record)
                        }
                        Buttons(look: look)
                    }
                    .padding(.horizontal, 4)
                }
            } compactLeading: {
                Image(systemName: look.record ? "trophy.fill" : look.resting ? "flame.fill" : look.restOver ? "bolt.fill" : "dumbbell.fill")
                    .foregroundStyle(look.tint)
            } compactTrailing: {
                if look.resting, let r = look.restRange {
                    Countdown(range: r)
                        .font(.system(.footnote, design: .rounded).weight(.semibold))
                        .foregroundStyle(look.tint)
                        .frame(maxWidth: 44)
                } else {
                    Text(look.st.next)
                        .font(.system(.caption2, design: .rounded).weight(.semibold))
                        .foregroundStyle(look.restOver ? go : look.record ? gold : .primary)
                        .lineLimit(1)
                        .frame(maxWidth: 64)
                }
            } minimal: {
                if look.resting, let r = look.restRange {
                    ProgressView(timerInterval: r, countsDown: true) {
                        EmptyView()
                    } currentValueLabel: {
                        Image(systemName: look.record ? "trophy.fill" : "flame.fill")
                            .font(.system(size: 9))
                    }
                    .progressViewStyle(.circular)
                    .tint(look.tint)
                } else {
                    Image(systemName: look.record ? "trophy.fill" : look.restOver ? "bolt.fill" : "dumbbell.fill")
                        .foregroundStyle(look.tint)
                }
            }
            .keylineTint(look.tint)
        }
    }
}
