import SwiftUI
import WatchKit

private let brand = Color(red: 1.0, green: 0.42, blue: 0.17)
private let ember = Color(red: 1.0, green: 0.66, blue: 0.22)
private let go = Color(red: 0.2, green: 0.82, blue: 0.4)
private let chip = Color.white.opacity(0.14)
private let restBlue = Color(red: 0.31, green: 0.76, blue: 0.94)
private let warn = Color(red: 1.0, green: 0.79, blue: 0.2)

/// Orange glow at the top of every screen, fading to black (same mood as the iPhone app).
private func glow(_ c: Color) -> LinearGradient {
    LinearGradient(colors: [c.opacity(0.42), c.opacity(0.08), .black], startPoint: .top, endPoint: .bottom)
}

struct ContentView: View {
    @EnvironmentObject var store: WatchStore

    var body: some View {
        NavigationStack { screen }
    }

    @ViewBuilder private var screen: some View {
        if let sum = store.runner.summary {
            RunSummaryView(sum: sum)
                .containerBackground(glow(go), for: .navigation)
        } else if store.runner.active {
            RunScreen()
        } else if let r = store.pendingRun {
            // Not a navigation push: the screen must survive the switch to the running screen.
            RunStartView(run: r)
                .containerBackground(glow(r.steps.isEmpty ? go : brand), for: .navigation)
        } else if let sum = store.summary {
            SummaryView(sum: sum)
                .containerBackground(glow(go), for: .navigation)
        } else if let s = store.session {
            TimelineView(.periodic(from: .now, by: 1)) { ctx in
                let now = ctx.date.timeIntervalSince1970 * 1000
                if s.restUntil > now {
                    RestView(s: s, now: now)
                        .modifier(ElapsedToolbar(s: s, now: now))
                        .containerBackground(glow(brand), for: .navigation)
                } else if let si = s.activeSet {
                    SetView(s: s, si: si, now: now)
                        .id("\(s.current)-\(si)")
                        .modifier(ElapsedToolbar(s: s, now: now))
                        .containerBackground(glow(brand), for: .navigation)
                } else {
                    NextView(s: s)
                        .containerBackground(glow(brand), for: .navigation)
                }
            }
        } else {
            IdleView()
                .containerBackground(glow(brand), for: .navigation)
        }
    }
}

// MARK: - Shared pieces

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
                    .foregroundStyle(ember)
            }
        }
    }
}

/// Live heart rate: a beating heart, or a crossed one when nothing is measured.
struct HeartPill: View {
    @EnvironmentObject var store: WatchStore
    var size: CGFloat = 13
    var live: Double? = nil

    var body: some View {
        let bpm = live ?? store.workout.heartRate
        HStack(spacing: 3) {
            Image(systemName: bpm > 0 ? "heart.fill" : "heart.slash")
                .symbolEffect(.pulse, options: .repeating, isActive: bpm > 0)
            Text(bpm > 0 ? "\(Int(bpm))" : "--")
                .monospacedDigit()
        }
        .font(.system(size: size, weight: .semibold, design: .rounded))
        .foregroundStyle(bpm > 0 ? Color.red : Color.secondary)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(bpm > 0 ? "Fréquence cardiaque \(Int(bpm))" : "Fréquence cardiaque indisponible")
    }
}

/// One dot per set of the exercise: done (filled), current (ring), to do (faint); warm-ups smaller.
struct SetDots: View {
    let e: WExercise
    let current: Int

    var body: some View {
        HStack(spacing: 3) {
            ForEach(e.sets.indices, id: \.self) { i in
                let x = e.sets[i]
                let d: CGFloat = x.warm ? 5 : 7
                Circle()
                    .fill(x.done ? brand : i == current ? Color.white : Color.white.opacity(0.22))
                    .frame(width: d, height: d)
                    .overlay(Circle().stroke(i == current ? brand : .clear, lineWidth: 1.5).frame(width: d + 4, height: d + 4))
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Série \(current + 1) sur \(e.sets.count)")
    }
}

/// Round grey chip button, or brand-coloured when prominent.
struct ChipStyle: ButtonStyle {
    var fill: Color = chip
    var fg: Color = .white

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(.footnote, design: .rounded).weight(.bold))
            .foregroundStyle(fg)
            .frame(maxWidth: .infinity, minHeight: 34)
            .background(Capsule().fill(fill))
            .opacity(configuration.isPressed ? 0.6 : 1)
            .scaleEffect(configuration.isPressed ? 0.95 : 1)
    }
}

/// Main action: a glowing orange capsule.
struct MainStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(.body, design: .rounded).weight(.bold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: 40)
            .background(Capsule().fill(LinearGradient(colors: [ember, brand], startPoint: .topLeading, endPoint: .bottomTrailing)))
            .shadow(color: brand.opacity(0.5), radius: configuration.isPressed ? 2 : 6)
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
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
    @State private var menu = false
    @FocusState private var focused: Bool

    private var kgFloor: Double { -(set.kg / max(e.step, 0.5)).rounded(.down) }

    /// − / + buttons, for when the Digital Crown is awkward (sweaty fingers, gloves).
    private func step(_ d: Double) {
        if field == 0 { kgTicks = max(kgFloor, kgTicks + d) } else { repsTicks = max(-Double(set.reps), repsTicks + d) }
        WKInterfaceDevice.current().play(.click)
    }

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
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                SetDots(e: e, current: si)
                Spacer(minLength: 4)
                HeartPill()
            }
            Text(e.name)
                .font(.system(.headline, design: .rounded))
                .lineLimit(2)
                .minimumScaleFactor(0.75)
            Text(subtitle)
                .font(.system(.caption2, design: .rounded))
                .foregroundStyle(set.warm ? ember : .secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            HStack(spacing: 4) {
                StepButton(icon: "minus", label: field == 0 ? "Moins de charge" : "Une rep de moins") { step(-1) }
                ValueBox(value: fmtKg(kg), unit: "kg", selected: field == 0, changed: kgTicks != 0)
                    .onTapGesture { field = 0 }
                    .accessibilityLabel("Charge \(fmtKg(kg)) kilos")
                    .accessibilityAddTraits(.isButton)
                ValueBox(value: "\(reps)", unit: "reps", selected: field == 1, changed: repsTicks != 0)
                    .onTapGesture { field = 1 }
                    .accessibilityLabel("\(reps) répétitions")
                    .accessibilityAddTraits(.isButton)
                StepButton(icon: "plus", label: field == 0 ? "Plus de charge" : "Une rep de plus") { step(1) }
            }
            .focusable(true)
            .focused($focused)
            .digitalCrownRotation(
                field == 0 ? $kgTicks : $repsTicks,
                from: field == 0 ? kgFloor : -Double(set.reps),
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
            }
            .buttonStyle(MainStyle())
            .disabled(reps == 0)
            .opacity(reps == 0 ? 0.4 : 1)
        }
        .onAppear { focused = true }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { menu = true } label: { Image(systemName: "ellipsis") }
                    .accessibilityLabel("Plus d'options")
            }
        }
        .sheet(isPresented: $menu) {
            SetMenu(s: s).environmentObject(store)
        }
    }
}

struct StepButton: View {
    let icon: String
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .bold))
                .frame(width: 26, height: 26)
                .background(Circle().fill(chip))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// Add a set, swap the exercise (machine taken), or go to another one.
struct SetMenu: View {
    @EnvironmentObject var store: WatchStore
    @Environment(\.dismiss) private var dismiss
    let s: WSession

    var body: some View {
        let others = s.exercises.indices.filter { $0 != s.current && s.exercises[$0].isOpen }
        List {
            Button {
                store.addSet()
                dismiss()
            } label: {
                Label("Ajouter une série", systemImage: "plus.circle.fill")
            }
            if let alts = s.exercise?.alts, !alts.isEmpty {
                Section("Machine prise ? Remplacer par") {
                    ForEach(alts, id: \.self) { a in
                        Button {
                            store.replace(with: a)
                            dismiss()
                        } label: {
                            VStack(alignment: .leading, spacing: 1) {
                                Text(a.name).font(.system(.footnote, design: .rounded).weight(.semibold))
                                Text(a.kg > 0 ? "Dernière fois \(fmtKg(a.kg)) kg × \(a.reps)" : "Dernière fois × \(a.reps)")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            if !others.isEmpty {
                Section("Passer à") {
                    ForEach(others, id: \.self) { i in
                        Button {
                            store.choose(i)
                            dismiss()
                        } label: {
                            Text(s.exercises[i].name).font(.system(.footnote, design: .rounded))
                        }
                    }
                }
            }
        }
    }
}

struct ValueBox: View {
    let value: String
    let unit: String
    let selected: Bool
    let changed: Bool

    var body: some View {
        VStack(spacing: -2) {
            Text(value)
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .monospacedDigit()
                .minimumScaleFactor(0.6)
                .lineLimit(1)
                .foregroundStyle(changed ? ember : .white)
                .contentTransition(.numericText())
            HStack(spacing: 2) {
                Text(unit)
                if selected { Image(systemName: "digitalcrown.arrow.clockwise").imageScale(.small) }
            }
            .font(.system(size: 10, weight: .semibold, design: .rounded))
            .foregroundStyle(selected ? brand : .secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 5)
        .background(RoundedRectangle(cornerRadius: 14).fill(selected ? brand.opacity(0.22) : chip))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(selected ? brand : .clear, lineWidth: 2))
        .animation(.easeOut(duration: 0.15), value: selected)
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
        let ready = store.ready(for: s)
        let ending = left <= 5 || ready
        let tint = ending ? go : brand
        VStack(spacing: 5) {
            ZStack {
                Circle().stroke(Color.white.opacity(0.12), lineWidth: 9)
                Circle()
                    .trim(from: 0, to: pct)
                    .stroke(
                        AngularGradient(colors: ending ? [go, go] : [ember, brand, ember], center: .center),
                        style: StrokeStyle(lineWidth: 9, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))
                    .shadow(color: tint.opacity(0.6), radius: 4)
                    .animation(.linear(duration: 1), value: pct)
                VStack(spacing: 0) {
                    Text(ready ? "PRÊT" : ending ? "PRÊT ?" : "REPOS")
                        .font(.system(size: 10, weight: .heavy, design: .rounded))
                        .foregroundStyle(ending ? go : .secondary)
                    Text(mmss(left))
                        .font(.system(size: 32, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(.white)
                        .contentTransition(.numericText(countsDown: true))
                    HeartPill(size: 11)
                }
            }
            .frame(width: 98, height: 98)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Repos restant \(mmss(left))")

            if let up = s.nextUp {
                VStack(spacing: 0) {
                    Text(up.name)
                        .font(.system(.caption2, design: .rounded))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                    if !up.load.isEmpty {
                        Text(up.load)
                            .font(.system(.footnote, design: .rounded).weight(.bold))
                            .foregroundStyle(ember)
                    }
                }
                .frame(maxWidth: .infinity)
            } else {
                Text("Dernière série faite")
                    .font(.system(.caption2, design: .rounded))
                    .foregroundStyle(.secondary)
            }

            HStack(spacing: 5) {
                Button("−15") { store.shiftRest(-15) }
                    .buttonStyle(ChipStyle())
                    .accessibilityLabel("Retirer 15 secondes")
                Button("+15") { store.shiftRest(15) }
                    .buttonStyle(ChipStyle())
                    .accessibilityLabel("Ajouter 15 secondes")
                Button { store.skipRest() } label: { Image(systemName: "forward.end.fill") }
                    .buttonStyle(ChipStyle(fill: brand))
                    .accessibilityLabel("Passer le repos")
            }
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
                        HStack(spacing: 8) {
                            Image(systemName: "dumbbell.fill").foregroundStyle(brand)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(s.exercises[i].name)
                                    .font(.system(.footnote, design: .rounded).weight(.semibold))
                                let open = s.exercises[i].sets.filter { !$0.done }.count
                                Text(open > 1 ? "\(open) séries" : "1 série")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
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
                    .font(.system(.footnote, design: .rounded).weight(.bold))
            }
            .listRowBackground(Capsule().fill(remaining.isEmpty ? brand : chip))
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
        ScrollView {
            VStack(spacing: 8) {
                gymCard
                runCard
                if store.upcomingRun != nil {
                    Button { store.pendingRun = .free } label: {
                        Label("Course libre", systemImage: "location.fill")
                    }
                    .buttonStyle(ChipStyle())
                }
                if store.suggestion == nil && store.upcomingRun == nil && !store.waitingStart {
                    Text(store.heardFromPhone ? "Lance une séance sur l'iPhone, ou crée ton plan de course." : "Ouvre Kadence sur l'iPhone pour relier la montre.")
                        .font(.system(.caption2, design: .rounded))
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .navigationTitle("Kadence")
    }

    @ViewBuilder private var gymCard: some View {
        if store.waitingStart {
            HomeCard(icon: "dumbbell.fill", eyebrow: "MUSCULATION", title: "Démarrage…", detail: "Ouvre Kadence sur l'iPhone si rien ne se passe.", colors: [ember, brand], busy: true) {
                store.cancelStart()
            }
        } else if let next = store.suggestion {
            HomeCard(icon: "dumbbell.fill", eyebrow: "MUSCULATION", title: next, detail: "Séance suggérée", colors: [ember, brand]) {
                store.start()
            }
        }
    }

    @ViewBuilder private var runCard: some View {
        if let r = store.upcomingRun {
            HomeCard(icon: "figure.run", eyebrow: "COURSE · \(r.when.uppercased())", title: r.title, detail: "\(r.mins) min · ≈ \(fmtKg(r.km)) km", colors: [Color(red: 0.25, green: 0.85, blue: 0.55), Color(red: 0.08, green: 0.6, blue: 0.35)]) {
                store.pendingRun = r
            }
        } else {
            HomeCard(icon: "figure.run", eyebrow: "COURSE", title: "Course libre", detail: "GPS, allure et BPM", colors: [Color(red: 0.25, green: 0.85, blue: 0.55), Color(red: 0.08, green: 0.6, blue: 0.35)]) {
                store.pendingRun = .free
            }
        }
    }
}

/// A big tappable card on the home screen: one per kind of session.
struct HomeCard: View {
    let icon: String
    let eyebrow: String
    let title: String
    let detail: String
    let colors: [Color]
    var busy = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Image(systemName: icon)
                        .font(.system(size: 15, weight: .bold))
                        .frame(width: 30, height: 30)
                        .background(Circle().fill(Color.black.opacity(0.22)))
                    Spacer()
                    if busy { ProgressView().frame(width: 22) } else { Image(systemName: "play.fill").font(.system(size: 13, weight: .bold)) }
                }
                Text(eyebrow)
                    .font(.system(size: 10, weight: .heavy, design: .rounded))
                    .opacity(0.8)
                    .padding(.top, 2)
                Text(title)
                    .font(.system(.headline, design: .rounded))
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
                    .multilineTextAlignment(.leading)
                Text(detail)
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .opacity(0.85)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(10)
            .background(RoundedRectangle(cornerRadius: 18).fill(LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing)))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Running

/// Before the start: the session, the GPS warming up, then Démarrer.
struct RunStartView: View {
    @EnvironmentObject var store: WatchStore
    let run: WRun

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 6) {
                Text(run.steps.isEmpty ? "COURSE LIBRE" : run.when.uppercased())
                    .font(.system(size: 10, weight: .heavy, design: .rounded))
                    .foregroundStyle(run.steps.isEmpty ? go : ember)
                Text(run.steps.isEmpty ? "Cours à ton rythme" : run.title)
                    .font(.system(.headline, design: .rounded))
                    .lineLimit(2)
                    .minimumScaleFactor(0.75)
                if run.steps.isEmpty {
                    Text("Distance, allure et BPM en direct. Vibration à chaque kilomètre.")
                        .font(.system(.caption2, design: .rounded))
                        .foregroundStyle(.secondary)
                } else {
                    Text("\(run.mins) min · ≈ \(fmtKg(run.km)) km")
                        .font(.system(.caption2, design: .rounded).weight(.semibold))
                        .foregroundStyle(.secondary)
                    VStack(alignment: .leading, spacing: 3) {
                        ForEach(run.outline, id: \.self) { line in
                            Text(line)
                                .font(.system(size: 12, weight: .semibold, design: .rounded))
                                .lineLimit(1)
                                .minimumScaleFactor(0.7)
                        }
                    }
                    .padding(8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 12).fill(chip))
                }
                HStack(spacing: 4) {
                    Image(systemName: store.runner.gpsReady ? "location.fill" : "location")
                    Text(store.runner.gpsReady ? "GPS prêt" : "Recherche du GPS…")
                }
                .font(.system(.caption2, design: .rounded).weight(.bold))
                .foregroundStyle(store.runner.gpsReady ? go : warn)
                Button {
                    store.pendingRun = nil
                    store.runner.start(run)
                } label: {
                    Label("Démarrer", systemImage: "play.fill")
                }
                .buttonStyle(MainStyle())
                .disabled(store.workout.running)
                if store.workout.running {
                    Text("Termine d'abord la séance de musculation.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button { store.pendingRun = nil } label: { Image(systemName: "xmark") }
                    .accessibilityLabel("Retour")
            }
        }
        .onAppear { store.runner.prepare() }
        .onDisappear { store.runner.unprepare() }
    }
}

/// During the run: the metrics, and the controls one swipe away.
struct RunScreen: View {
    @EnvironmentObject var store: WatchStore
    @State private var page = 1

    var body: some View {
        let r = store.runner
        switch r.phase {
        case .countdown(let n):
            VStack(spacing: 4) {
                Text("\(n)")
                    .font(.system(size: 80, weight: .heavy, design: .rounded))
                    .foregroundStyle(go)
                    .contentTransition(.numericText(countsDown: true))
                Text(r.step.map { "\($0.title)" } ?? "C'est parti")
                    .font(.system(.footnote, design: .rounded).weight(.bold))
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                Button("Annuler") { r.cancel() }
                    .buttonStyle(ChipStyle())
            }
            .containerBackground(glow(go), for: .navigation)
        case .saving:
            VStack(spacing: 6) {
                ProgressView()
                Text("Enregistrement…").font(.system(.footnote, design: .rounded))
            }
            .containerBackground(glow(go), for: .navigation)
        default:
            TabView(selection: $page) {
                RunControls().tag(0)
                RunMetrics().tag(1)
            }
            .tabViewStyle(.page)
            .containerBackground(glow(tint), for: .navigation)
        }
    }

    private var tint: Color {
        let r = store.runner
        if r.phase == .paused { return warn }
        switch r.step?.phase {
        case "work": return brand
        case "recovery": return restBlue
        default: return go
        }
    }
}

struct RunMetrics: View {
    @EnvironmentObject var store: WatchStore

    var body: some View {
        let r = store.runner
        let st = r.finishedPlan ? nil : r.step
        let tint: Color = r.phase == .paused ? warn : st?.phase == "work" ? brand : st?.phase == "recovery" ? restBlue : go
        VStack(alignment: .leading, spacing: 1) {
            Text(label(r, st))
                .font(.system(size: 11, weight: .heavy, design: .rounded))
                .foregroundStyle(.black)
                .padding(.horizontal, 7)
                .padding(.vertical, 2)
                .background(Capsule().fill(tint))
                .padding(.bottom, 2)
            if let st {
                // Guided step: time left first, then what to do, then pace and the rest.
                Text(mmss(Int(r.stepLeft.rounded(.up))))
                    .font(.system(size: 44, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(tint)
                    .contentTransition(.numericText(countsDown: true))
                    .lineLimit(1)
                Text(st.phase == "recovery" ? (r.nextStep.map { "Ensuite : \($0.title)" } ?? st.title) : st.title)
                    .font(.system(size: 13, weight: .semibold, design: .rounded))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                ProgressView(value: r.stepProgress)
                    .tint(tint)
                    .padding(.vertical, 2)
                Spacer(minLength: 0)
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    metric(paceText(r.pace), "/km", size: 26, color: paceColor(r, st))
                    Spacer(minLength: 2)
                    if r.paceWarning != 0 {
                        Text(r.paceWarning > 0 ? "Ralentis" : "Accélère")
                            .font(.system(size: 12, weight: .heavy, design: .rounded))
                            .foregroundStyle(warn)
                    } else if st.fast > 0 {
                        Text("\(fmtPace(st.fast))-\(fmtPace(st.slow))")
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                    }
                }
                HStack(alignment: .firstTextBaseline) {
                    metric(fmtKm(r.meters), "km", size: 20)
                    Spacer(minLength: 2)
                    heart(r.heartRate, size: 20)
                }
            } else {
                // Free run, or the plan is done: four lines, as on a running watch.
                metric(hms(r.elapsed), "", size: 38, color: ember)
                metric(fmtKm(r.meters), "km", size: 30)
                metric(paceText(r.pace), "/km", size: 30)
                heart(r.heartRate, size: 30)
                if r.finishedPlan {
                    Text("Séance faite : termine quand tu veux")
                        .font(.system(size: 11, weight: .semibold, design: .rounded))
                        .foregroundStyle(go)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .overlay {
            if let t = r.kmToast {
                VStack(spacing: 2) {
                    Text("Kilomètre \(t.km)").font(.system(.footnote, design: .rounded).weight(.bold)).foregroundStyle(go)
                    Text(fmtPace(t.pace)).font(.system(size: 44, weight: .heavy, design: .rounded)).monospacedDigit()
                    Text("ce kilomètre").font(.caption2).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(RoundedRectangle(cornerRadius: 16).fill(Color.black.opacity(0.94)))
                .transition(.opacity)
            }
        }
    }

    private func metric(_ value: String, _ unit: String, size: CGFloat, color: Color = .white) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 3) {
            Text(value)
                .font(.system(size: size, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(color)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            if !unit.isEmpty {
                Text(unit)
                    .font(.system(size: max(11, size * 0.42), weight: .semibold, design: .rounded))
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func heart(_ bpm: Double, size: CGFloat) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 3) {
            Image(systemName: "heart.fill")
                .font(.system(size: size * 0.6, weight: .bold))
                .foregroundStyle(.red)
            Text(bpm > 0 ? "\(Int(bpm))" : "—")
                .font(.system(size: size, weight: .bold, design: .rounded))
                .monospacedDigit()
            Text("BPM")
                .font(.system(size: max(10, size * 0.38), weight: .semibold, design: .rounded))
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(bpm > 0 ? "Fréquence cardiaque \(Int(bpm))" : "Fréquence cardiaque indisponible")
    }

    private func paceText(_ p: Double) -> String { p > 0 ? fmtPace(p) : "—" }

    private func paceColor(_ r: RunManager, _ st: WRunStep) -> Color {
        guard st.fast > 0, r.pace > 0 else { return .white }
        return r.pace >= st.fast && r.pace <= st.slow ? go : warn
    }

    private func label(_ r: RunManager, _ st: WRunStep?) -> String {
        if r.phase == .paused { return r.autoPaused ? "PAUSE AUTO" : "EN PAUSE" }
        guard let st else { return r.finishedPlan ? "TERMINÉ" : "COURSE LIBRE" }
        let (i, n) = r.stepRank
        switch st.phase {
        case "work": return "EFFORT \(i)/\(n)"
        case "recovery": return "RÉCUP \(i)/\(n)"
        default: return st.title.uppercased()
        }
    }
}

struct RunControls: View {
    @EnvironmentObject var store: WatchStore
    @State private var confirm = false

    var body: some View {
        let r = store.runner
        let paused = r.phase == .paused
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 6), GridItem(.flexible())], spacing: 6) {
            control(paused ? "Reprendre" : "Pause", paused ? "play.fill" : "pause.fill", paused ? warn : chip, paused ? .black : .white) {
                if paused { r.resume() } else { r.pause() }
            }
            control("Terminer", "stop.fill", Color.red.opacity(0.3), .red) { confirm = true }
            if r.guided && !r.finishedPlan {
                control("Étape suivante", "forward.end.fill", chip, .white) { r.nextStepNow() }
            }
            control("Verrouiller", "drop.fill", restBlue.opacity(0.25), restBlue) { r.lock() }
        }
        .confirmationDialog("Terminer la course ?", isPresented: $confirm, titleVisibility: .visible) {
            Button("Terminer") { r.end(save: true) }
            Button("Annuler la course", role: .destructive) { r.end(save: false) }
            Button("Continuer", role: .cancel) {}
        }
    }

    private func control(_ title: String, _ icon: String, _ fill: Color, _ fg: Color, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 3) {
                Image(systemName: icon).font(.system(size: 18, weight: .bold))
                Text(title).font(.system(size: 11, weight: .bold, design: .rounded)).lineLimit(1).minimumScaleFactor(0.7)
            }
            .foregroundStyle(fg)
            .frame(maxWidth: .infinity, minHeight: 64)
            .background(RoundedRectangle(cornerRadius: 16).fill(fill))
        }
        .buttonStyle(.plain)
    }
}

struct RunSummaryView: View {
    @EnvironmentObject var store: WatchStore
    let sum: RunSummary

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                Label("Bien joué", systemImage: "checkmark.seal.fill")
                    .font(.system(.footnote, design: .rounded).weight(.bold))
                    .foregroundStyle(go)
                Text(sum.title)
                    .font(.system(.headline, design: .rounded))
                    .lineLimit(2)
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 6), GridItem(.flexible())], spacing: 6) {
                    tile("\(fmtKm(sum.meters)) km", "Distance")
                    tile(hms(sum.seconds), "Temps")
                    tile(sum.meters > 50 ? "\(fmtPace(sum.seconds / (sum.meters / 1000)))" : "--", "Allure moy.")
                    if sum.heartRate > 0 { tile("\(Int(sum.heartRate))", "BPM moyen") }
                }
                if !sum.note.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(sum.note)
                            .font(.system(.caption2, design: .rounded).weight(.bold))
                            .foregroundStyle(go)
                        HStack(spacing: 3) {
                            ForEach(Array(sum.efforts.enumerated()), id: \.offset) { _, e in
                                Capsule().fill(e == "ok" ? go : warn).frame(height: 5)
                            }
                        }
                    }
                    .padding(8)
                    .background(RoundedRectangle(cornerRadius: 12).fill(go.opacity(0.14)))
                }
                Text("Enregistré dans Apple Santé, et dans Kadence à la prochaine ouverture de l'iPhone.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Button("OK") { store.runner.summary = nil }
                    .buttonStyle(MainStyle())
            }
        }
    }

    private func tile(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(value)
                .font(.system(.body, design: .rounded).weight(.bold))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text(label).font(.system(size: 10, design: .rounded)).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(7)
        .background(RoundedRectangle(cornerRadius: 12).fill(chip))
    }
}

// MARK: - Session finished

struct SummaryView: View {
    @EnvironmentObject var store: WatchStore
    let sum: Summary

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                Label("Séance terminée", systemImage: "checkmark.seal.fill")
                    .font(.system(.footnote, design: .rounded).weight(.bold))
                    .foregroundStyle(go)
                Text(sum.title)
                    .font(.system(.title3, design: .rounded).weight(.bold))
                    .lineLimit(2)
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 6), GridItem(.flexible())], spacing: 6) {
                    tile("clock.fill", "\(sum.minutes) min", "Durée", .white)
                    tile("square.stack.3d.up.fill", "\(sum.sets)", "Séries", .white)
                    tile("scalemass.fill", "\(fmtInt(sum.volume)) kg", "Volume", ember)
                    if sum.heartRate > 0 { tile("heart.fill", "\(Int(sum.heartRate))", "BPM moyen", .red) }
                    if sum.calories > 0 { tile("flame.fill", "\(Int(sum.calories))", "kcal", brand) }
                }
                Text("Le bilan complet est sur l'iPhone.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Button("OK") { store.summary = nil }
                    .buttonStyle(MainStyle())
            }
        }
    }

    private func tile(_ icon: String, _ value: String, _ label: String, _ c: Color) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Image(systemName: icon).font(.system(size: 11)).foregroundStyle(c)
            Text(value)
                .font(.system(.body, design: .rounded).weight(.bold))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text(label).font(.system(size: 10, design: .rounded)).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(7)
        .background(RoundedRectangle(cornerRadius: 12).fill(chip))
    }
}
