import SwiftUI

private let brand = Color(red: 1.0, green: 0.42, blue: 0.17)

struct ContentView: View {
    @EnvironmentObject var store: WatchStore

    var body: some View {
        NavigationStack { screen }
    }

    @ViewBuilder private var screen: some View {
        if let sum = store.summary {
            SummaryView(sum: sum)
        } else if let s = store.session {
            TimelineView(.periodic(from: .now, by: 1)) { ctx in
                let now = ctx.date.timeIntervalSince1970 * 1000
                if s.restUntil > now {
                    RestView(s: s, now: now)
                        .modifier(ElapsedToolbar(s: s, now: now))
                } else if let si = s.activeSet {
                    SetView(s: s, si: si, now: now)
                        .id("\(s.current)-\(si)")
                        .modifier(ElapsedToolbar(s: s, now: now))
                } else {
                    NextView(s: s)
                }
            }
        } else {
            IdleView()
        }
    }
}

// MARK: - Elapsed time next to the clock; heart rate and sets done below

/// Session time at the top left, beside the watch's clock.
struct ElapsedToolbar: ViewModifier {
    let s: WSession
    let now: Double

    func body(content: Content) -> some View {
        content.toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Text(mmss(Int((now - s.startedAt) / 1000)))
                    .font(.system(.footnote, design: .rounded).weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(brand)
            }
        }
    }
}

struct HeaderRow: View {
    @EnvironmentObject var store: WatchStore
    let s: WSession
    let now: Double

    var body: some View {
        HStack(spacing: 6) {
            let bpm = store.workout.heartRate
            Label(bpm > 0 ? "\(Int(bpm))" : "--", systemImage: store.workout.running ? "heart.fill" : "heart.slash")
                .foregroundStyle(bpm > 0 ? .red : .secondary)
                .labelStyle(CompactLabel())
                .accessibilityLabel(bpm > 0 ? "Fréquence cardiaque \(Int(bpm))" : "Fréquence cardiaque indisponible")
            Spacer(minLength: 0)
            Text("\(s.done)/\(s.total) séries")
                .foregroundStyle(.secondary)
        }
        .font(.system(.footnote, design: .rounded).weight(.semibold))
        .monospacedDigit()
    }
}

struct CompactLabel: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 2) {
            configuration.icon.imageScale(.small)
            configuration.title
        }
    }
}

// MARK: - Current set: load and reps with the Digital Crown, then validate

struct SetView: View {
    @EnvironmentObject var store: WatchStore
    let s: WSession
    let si: Int
    let now: Double

    @State private var kgTicks: Double = 0
    @State private var repsTicks: Double = 0
    @State private var field = 0
    @FocusState private var focused: Bool

    private var e: WExercise { s.exercises[s.current] }
    private var set: WSet { e.sets[si] }
    private var kg: Double { max(0, ((set.kg + kgTicks * e.step) * 10).rounded() / 10) }
    private var reps: Int { max(0, set.reps + Int(repsTicks)) }

    private var subtitle: String {
        let firstOfEx = !e.sets.contains { $0.done }
        if firstOfEx && !e.coach.isEmpty && !set.warm { return "Coach : \(e.coach)" }
        let rank = e.sets[...si].filter { $0.warm == set.warm }.count
        let of = e.sets.filter { $0.warm == set.warm }.count
        let kind = set.warm ? "Échauffement" : "Série"
        return set.prev.isEmpty ? "\(kind) \(rank)/\(of)" : "\(kind) \(rank)/\(of) · avant \(set.prev)"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HeaderRow(s: s, now: now)
            Text(e.name)
                .font(.system(.headline, design: .rounded))
                .lineLimit(2)
                .minimumScaleFactor(0.75)
            Text(subtitle)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            HStack(spacing: 6) {
                ValueBox(value: fmtKg(kg), unit: "kg", selected: field == 0)
                    .onTapGesture { field = 0 }
                    .accessibilityLabel("Charge \(fmtKg(kg)) kilos")
                    .accessibilityAddTraits(.isButton)
                ValueBox(value: "\(reps)", unit: "reps", selected: field == 1)
                    .onTapGesture { field = 1 }
                    .accessibilityLabel("\(reps) répétitions")
                    .accessibilityAddTraits(.isButton)
            }
            .focusable(true)
            .focused($focused)
            .digitalCrownRotation(
                field == 0 ? $kgTicks : $repsTicks,
                from: field == 0 ? -(set.kg / max(e.step, 0.5)).rounded(.down) : -Double(set.reps),
                through: field == 0 ? 400 : 100,
                by: 1,
                sensitivity: .low,
                isContinuous: false,
                isHapticFeedbackEnabled: true
            )
            Spacer(minLength: 0)
            Button {
                store.validate(kg: kg, reps: reps)
            } label: {
                Label("Valider", systemImage: "checkmark")
                    .font(.system(.body, design: .rounded).weight(.semibold))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(brand)
            .disabled(reps == 0)
        }
        .onAppear { focused = true }
    }
}

struct ValueBox: View {
    let value: String
    let unit: String
    let selected: Bool

    var body: some View {
        VStack(spacing: 0) {
            Text(value)
                .font(.system(size: 26, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .minimumScaleFactor(0.6)
                .lineLimit(1)
            Text(unit).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 4)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color.white.opacity(0.1)))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(selected ? brand : .clear, lineWidth: 2))
    }
}

// MARK: - Rest timer

struct RestView: View {
    @EnvironmentObject var store: WatchStore
    let s: WSession
    let now: Double

    var body: some View {
        let left = max(0, Int(((s.restUntil - now) / 1000).rounded(.up)))
        let pct = s.restTotal > 0 ? min(1, Double(left) / Double(s.restTotal)) : 0
        VStack(spacing: 6) {
            ZStack {
                Circle().stroke(brand.opacity(0.25), lineWidth: 8)
                Circle()
                    .trim(from: 0, to: pct)
                    .stroke(brand, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .animation(.linear(duration: 1), value: pct)
                VStack(spacing: 0) {
                    Text("REPOS").font(.system(size: 10, weight: .semibold)).foregroundStyle(.secondary)
                    Text(mmss(left))
                        .font(.system(size: 30, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(brand)
                    if store.workout.heartRate > 0 {
                        Label("\(Int(store.workout.heartRate))", systemImage: "heart.fill")
                            .labelStyle(CompactLabel())
                            .font(.system(size: 11, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(.red)
                    }
                }
            }
            .frame(width: 96, height: 96)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Repos restant \(mmss(left))")
            Text(s.nextLabel)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
            HStack(spacing: 4) {
                Button("−15") { store.shiftRest(-15) }
                    .accessibilityLabel("Retirer 15 secondes")
                Button("+15") { store.shiftRest(15) }
                    .accessibilityLabel("Ajouter 15 secondes")
                Button { store.skipRest() } label: { Image(systemName: "forward.end.fill") }
                    .accessibilityLabel("Passer le repos")
            }
            .buttonStyle(.bordered)
            .font(.system(.footnote, design: .rounded).weight(.semibold))
        }
    }
}

// MARK: - Exercise finished: pick the next one, or finish

struct NextView: View {
    @EnvironmentObject var store: WatchStore
    let s: WSession
    @State private var confirm = false

    var body: some View {
        let remaining = s.exercises.indices.filter { s.exercises[$0].isOpen }
        List {
            Section {
                ForEach(remaining, id: \.self) { i in
                    Button { store.choose(i) } label: {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(s.exercises[i].name).font(.system(.footnote, design: .rounded).weight(.semibold))
                            let open = s.exercises[i].sets.filter { !$0.done }.count
                            Text(open > 1 ? "\(open) séries" : "1 série").font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                }
            } header: {
                Text(remaining.isEmpty ? "Tout est fait" : "Exercice suivant")
            }
            Button {
                if remaining.isEmpty { store.finish() } else { confirm = true }
            } label: {
                Label("Terminer la séance", systemImage: "flag.checkered")
                    .foregroundStyle(remaining.isEmpty ? brand : .primary)
            }
        }
        .confirmationDialog("Terminer la séance ?", isPresented: $confirm, titleVisibility: .visible) {
            Button("Terminer") { store.finish() }
            Button("Continuer", role: .cancel) {}
        } message: {
            Text(remaining.count > 1 ? "Il reste \(remaining.count) exercices." : "Il reste 1 exercice.")
        }
    }
}

// MARK: - No session: start today's one

struct IdleView: View {
    @EnvironmentObject var store: WatchStore

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Kadeon Sport")
                .font(.system(.footnote, design: .rounded).weight(.semibold))
                .foregroundStyle(brand)
            if store.waitingStart {
                Spacer(minLength: 0)
                HStack(spacing: 6) {
                    ProgressView().frame(width: 20)
                    Text("Démarrage sur l'iPhone…").font(.footnote)
                }
                Text("Ouvre Kadeon Sport sur l'iPhone si rien ne se passe.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Spacer(minLength: 0)
                Button("Annuler") { store.cancelStart() }
            } else if let next = store.suggestion {
                Text("Séance suggérée").font(.caption2).foregroundStyle(.secondary)
                Text(next)
                    .font(.system(.title3, design: .rounded).weight(.semibold))
                    .lineLimit(3)
                    .minimumScaleFactor(0.7)
                Spacer(minLength: 0)
                Button {
                    store.start()
                } label: {
                    Label("Démarrer", systemImage: "play.fill")
                        .font(.system(.body, design: .rounded).weight(.semibold))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(brand)
            } else {
                Spacer(minLength: 0)
                Text(store.heardFromPhone ? "Aucune séance suggérée. Lance une séance sur l'iPhone." : "Ouvre Kadeon Sport sur l'iPhone pour relier la montre.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Session finished

struct SummaryView: View {
    @EnvironmentObject var store: WatchStore
    let sum: Summary

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 6) {
                Text("Séance terminée")
                    .font(.system(.footnote, design: .rounded).weight(.semibold))
                    .foregroundStyle(brand)
                Text(sum.title).font(.system(.headline, design: .rounded)).lineLimit(2)
                row("Durée", "\(sum.minutes) min")
                row("Séries", "\(sum.sets)")
                row("Volume", "\(fmtInt(sum.volume)) kg")
                if sum.heartRate > 0 { row("FC moyenne", "\(Int(sum.heartRate)) bpm") }
                if sum.calories > 0 { row("Calories", "\(Int(sum.calories)) kcal") }
                Text("Le bilan complet est sur l'iPhone.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Button("OK") { store.summary = nil }
                    .padding(.top, 4)
            }
        }
    }

    private func row(_ k: String, _ v: String) -> some View {
        HStack {
            Text(k).font(.footnote).foregroundStyle(.secondary)
            Spacer()
            Text(v).font(.system(.body, design: .rounded).weight(.semibold)).monospacedDigit()
        }
    }
}
