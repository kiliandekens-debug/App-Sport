import SwiftUI
import WatchKit

// Kadence colours (D.A. of November 2026): electric blue for efforts and strength, teal for
// rest and recovery, green for easy running and « in the target », yellow for warnings.
private let brand = Color(red: 0.0, green: 0.64, blue: 1.0)        // #00A3FF
private let brandDeep = Color(red: 0.0, green: 0.44, blue: 0.72)   // #0070B8
private let ember = Color(red: 0.42, green: 0.81, blue: 1.0)       // light blue: warm-up, changed values
private let go = Color(red: 0.2, green: 0.82, blue: 0.4)
private let chip = Color.white.opacity(0.14)
private let line = Color.white.opacity(0.18)
private let restBlue = Color(red: 0.37, green: 0.88, blue: 0.82)  // teal #5EE0D0
private let restDeep = Color(red: 0.12, green: 0.66, blue: 0.62)
private let warn = Color(red: 1.0, green: 0.79, blue: 0.2)

/// Soft glow at the top of every screen, fading to black (same mood as the iPhone app).
private func glow(_ c: Color) -> LinearGradient {
    LinearGradient(colors: [c.opacity(0.30), c.opacity(0.05), .black], startPoint: .top, endPoint: .bottom)
}

/// 368 → 6’08”
func paceQ(_ secPerKm: Double) -> String {
    guard secPerKm.isFinite, secPerKm > 0, secPerKm < 3600 else { return "—" }
    let t = Int(secPerKm.rounded())
    return String(format: "%d’%02d”", t / 60, t % 60)
}

/// Pace in big, or « -’--” » while it is not known yet.
func bigPace(_ secPerKm: Double) -> String { secPerKm > 0 ? paceQ(secPerKm) : "-’--”" }

/// 90 → « 1 min 30 », 60 → « 1 min », 20 → « 20 s ».
func fmtDur(_ secs: Double) -> String {
    let t = Int(secs.rounded())
    let m = t / 60, s = t % 60
    if m == 0 { return "\(s) s" }
    return s == 0 ? "\(m) min" : "\(m) min \(String(format: "%02d", s))"
}

/// « Série 2/3 » or « Échauffement 1/2 » for set si of an exercise.
func setRank(_ e: WExercise, _ si: Int) -> String {
    guard e.sets.indices.contains(si) else { return "" }
    let x = e.sets[si]
    let rank = e.sets[...si].filter { $0.warm == x.warm }.count
    let of = e.sets.filter { $0.warm == x.warm }.count
    return "\(x.warm ? "Échauffement" : "Série") \(rank)/\(of)"
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
                .containerBackground(glow(r.indoor ? restBlue : r.steps.isEmpty ? go : brand), for: .navigation)
        } else if store.tapisPicker {
            TapisPicker()
                .containerBackground(glow(restBlue), for: .navigation)
        } else if let sum = store.summary {
            SummaryView(sum: sum)
                .containerBackground(glow(go), for: .navigation)
        } else if let s = store.session {
            TimelineView(.periodic(from: .now, by: 1)) { ctx in
                let now = ctx.date.timeIntervalSince1970 * 1000
                if s.restUntil > now {
                    RestView(s: s, now: now)
                        .modifier(ElapsedToolbar(s: s, now: now))
                        .containerBackground(glow(restBlue), for: .navigation)
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

/// Round grey chip button, or coloured when prominent.
struct ChipStyle: ButtonStyle {
    var fill: Color = chip
    var fg: Color = .white
    var height: CGFloat = 34

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(.footnote, design: .rounded).weight(.bold))
            .foregroundStyle(fg)
            .frame(maxWidth: .infinity, minHeight: height)
            .background(Capsule().fill(fill))
            .opacity(configuration.isPressed ? 0.6 : 1)
            .scaleEffect(configuration.isPressed ? 0.95 : 1)
    }
}

/// Main action: a glowing capsule, blue by default (teal for the rest).
struct MainStyle: ButtonStyle {
    var colors: [Color] = [brand, brandDeep]
    var height: CGFloat = 40

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(.body, design: .rounded).weight(.bold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: height)
            .background(Capsule().fill(LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing)))
            .shadow(color: (colors.last ?? brand).opacity(0.45), radius: configuration.isPressed ? 2 : 6)
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
    }
}

/// « Allure      6’00”–6’20” » with a thin line under it.
struct InfoRow: View {
    let label: String
    let value: String
    var color: Color = .white

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(label)
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .foregroundStyle(.secondary)
                .lineLimit(1)
            Spacer(minLength: 4)
            Text(value)
                .font(.system(size: 15, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(color)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .padding(.vertical, 5)
        .overlay(alignment: .bottom) { Rectangle().fill(line).frame(height: 0.5) }
        .accessibilityElement(children: .combine)
    }
}

/// A very big number with its unit: 6’08” /km.
struct BigValue: View {
    let value: String
    var unit: String = ""
    var size: CGFloat = 50
    var color: Color = .white
    var countsDown = false

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 2) {
            Text(value)
                .font(.system(size: size, weight: .heavy, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(color)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .contentTransition(.numericText(countsDown: countsDown))
            if !unit.isEmpty {
                Text(unit)
                    .font(.system(size: max(13, size * 0.3), weight: .semibold, design: .rounded))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .fixedSize()
            }
        }
    }
}

/// A row of the home screen and of the lists: icon, title, detail, chevron.
struct NavRow: View {
    let icon: String
    let tint: Color
    let title: String
    var detail: String? = nil
    var busy = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 9) {
                Image(systemName: icon)
                    .font(.system(size: 19, weight: .semibold))
                    .foregroundStyle(tint)
                    .frame(width: 26)
                VStack(alignment: .leading, spacing: 0) {
                    Text(title)
                        .font(.system(size: 16, weight: .semibold, design: .rounded))
                        .lineLimit(2)
                        .minimumScaleFactor(0.75)
                        .multilineTextAlignment(.leading)
                    if let detail, !detail.isEmpty {
                        Text(detail)
                            .font(.system(size: 12, weight: .medium, design: .rounded))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                    }
                }
                Spacer(minLength: 2)
                if busy {
                    ProgressView().frame(width: 18, height: 18)
                } else {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 9)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 16).fill(chip))
        }
        .buttonStyle(.plain)
    }
}

/// Big check and a title: end of a block, of a run, of a session.
struct DoneHeader: View {
    let title: String
    let detail: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 30, weight: .bold))
                .foregroundStyle(go)
            VStack(alignment: .leading, spacing: 0) {
                Text(title)
                    .font(.system(size: 19, weight: .bold, design: .rounded))
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
                if !detail.isEmpty {
                    Text(detail)
                        .font(.system(size: 12, weight: .semibold, design: .rounded))
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .minimumScaleFactor(0.8)
                }
            }
        }
        .padding(.bottom, 4)
    }
}

// MARK: - Current set: load and reps, then validate

struct SetView: View {
    @EnvironmentObject var store: WatchStore
    let s: WSession
    let si: Int
    let now: Double

    @State private var kgTicks: Double = 0
    @State private var repsTicks: Double = 0
    @State private var menu = false
    /// Exact load chosen on the wheels (tap on the load); the Crown steps from it.
    @State private var baseKg: Double? = nil
    @State private var pickingKg = false
    @State private var pickingReps = false
    @FocusState private var focused: Bool

    private var e: WExercise { s.exercises[s.current] }
    private var set: WSet { e.sets[si] }
    private var startKg: Double { baseKg ?? set.kg }
    private var kgFloor: Double { -(startKg / max(e.step, 0.5)).rounded(.down) }
    private var kg: Double { max(0, ((startKg + kgTicks * e.step) * 10).rounded() / 10) }
    private var reps: Int { max(0, set.reps + Int(repsTicks)) }

    /// The coach's word on the first working set, else last time's set.
    private var hint: String {
        let firstOfEx = !e.sets.contains { $0.done }
        if firstOfEx && !e.coach.isEmpty && !set.warm { return "Coach : \(e.coach)" }
        return set.prev.isEmpty ? "" : "Avant : \(set.prev)"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(setRank(e, si))
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .foregroundStyle(set.warm ? ember : brand)
                Spacer(minLength: 4)
                HeartPill(size: 12)
            }
            Text(e.name)
                .font(.system(size: 16, weight: .bold, design: .rounded))
                .lineLimit(2)
                .minimumScaleFactor(0.8)
            if !hint.isEmpty {
                Text(hint)
                    .font(.system(size: 11, weight: .medium, design: .rounded))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            HStack(spacing: 6) {
                LoadTile(value: fmtKg(kg), unit: "kg", caption: "charge", changed: kg != set.kg, crown: true)
                    .onTapGesture { pickingKg = true }
                    .accessibilityLabel("Charge \(fmtKg(kg)) kilos")
                    .accessibilityHint("Couronne pour changer, touche pour le poids exact")
                    .accessibilityAddTraits(.isButton)
                    .sheet(isPresented: $pickingKg, onDismiss: { focused = true }) {
                        KgPicker(initial: kg) { v in
                            baseKg = v
                            kgTicks = 0
                        }
                    }
                LoadTile(value: "\(reps)", unit: "", caption: reps > 1 ? "répétitions" : "répétition", changed: reps != set.reps, crown: false)
                    .onTapGesture { pickingReps = true }
                    .accessibilityLabel("\(reps) répétitions")
                    .accessibilityHint("Touche pour changer")
                    .accessibilityAddTraits(.isButton)
                    .sheet(isPresented: $pickingReps, onDismiss: { focused = true }) {
                        RepsPicker(initial: reps, goal: set.reps) { v in repsTicks = Double(v - set.reps) }
                    }
            }
            .padding(.top, 2)
            .fixedSize(horizontal: false, vertical: true)
            .focusable(true)
            .focused($focused)
            .digitalCrownRotation(
                $kgTicks,
                from: kgFloor,
                through: 400,
                by: 1,
                sensitivity: .low,
                isContinuous: false,
                isHapticFeedbackEnabled: true
            )
            Spacer(minLength: 0)
            Button {
                store.validate(kg: kg, reps: reps)
            } label: {
                Label("Valider la série", systemImage: "checkmark")
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .buttonStyle(MainStyle())
            .fixedSize(horizontal: false, vertical: true)
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

/// Load or reps: big value, what it is under it.
struct LoadTile: View {
    let value: String
    let unit: String
    let caption: String
    let changed: Bool
    let crown: Bool

    var body: some View {
        VStack(spacing: -1) {
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(value)
                    .font(.system(size: 30, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(changed ? ember : .white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                    .contentTransition(.numericText())
                if !unit.isEmpty {
                    Text(unit)
                        .font(.system(size: 14, weight: .bold, design: .rounded))
                        .foregroundStyle(.secondary)
                }
            }
            HStack(spacing: 2) {
                Text(caption)
                if crown { Image(systemName: "digitalcrown.arrow.clockwise").imageScale(.small) }
            }
            .font(.system(size: 11, weight: .semibold, design: .rounded))
            .foregroundStyle(.secondary)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 7)
        .padding(.horizontal, 4)
        .background(RoundedRectangle(cornerRadius: 16).fill(chip))
        .contentShape(RoundedRectangle(cornerRadius: 16))
    }
}

/// Exact load: whole kilos and tenths on two wheels, e.g. 12,3 kg.
struct KgPicker: View {
    @Environment(\.dismiss) private var dismiss
    let onPick: (Double) -> Void
    @State private var whole: Int
    @State private var tenth: Int

    init(initial: Double, onPick: @escaping (Double) -> Void) {
        self.onPick = onPick
        let t = Int((max(0, min(initial, 400)) * 10).rounded())
        _whole = State(initialValue: t / 10)
        _tenth = State(initialValue: t % 10)
    }

    var body: some View {
        VStack(spacing: 6) {
            HStack(alignment: .center, spacing: 2) {
                Picker("Kilos", selection: $whole) {
                    ForEach(0...400, id: \.self) { Text("\($0)").tag($0) }
                }
                .accessibilityLabel("Kilos")
                Text(",")
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                Picker("Dixièmes", selection: $tenth) {
                    ForEach(0...9, id: \.self) { Text("\($0)").tag($0) }
                }
                .frame(width: 44)
                .accessibilityLabel("Dixièmes de kilo")
                Text("kg")
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundStyle(.secondary)
            }
            .pickerStyle(.wheel)
            .labelsHidden()
            .frame(height: 96)
            Button {
                onPick(Double(whole) + Double(tenth) / 10)
                WKInterfaceDevice.current().play(.click)
                dismiss()
            } label: {
                Label("OK", systemImage: "checkmark")
            }
            .buttonStyle(MainStyle())
        }
        .navigationTitle("Charge")
    }
}

/// Reps: − value +, the Crown, and the goal of the set.
struct RepsPicker: View {
    @Environment(\.dismiss) private var dismiss
    let goal: Int
    let onPick: (Int) -> Void
    @State private var value: Double
    @FocusState private var focused: Bool

    init(initial: Int, goal: Int, onPick: @escaping (Int) -> Void) {
        self.goal = goal
        self.onPick = onPick
        _value = State(initialValue: Double(initial))
    }

    var body: some View {
        VStack(spacing: 6) {
            HStack(spacing: 4) {
                round("minus", "Une de moins") { value = max(0, value - 1) }
                Text("\(Int(value))")
                    .font(.system(size: 54, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .frame(maxWidth: .infinity)
                    .contentTransition(.numericText())
                round("plus", "Une de plus") { value = min(100, value + 1) }
            }
            .focusable(true)
            .focused($focused)
            .digitalCrownRotation($value, from: 0, through: 100, by: 1, sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true)
            if goal > 0 {
                Text("Objectif : \(goal)")
                    .font(.system(size: 13, weight: .semibold, design: .rounded))
                    .foregroundStyle(.secondary)
            }
            Button("Enregistrer") {
                onPick(Int(value))
                dismiss()
            }
            .buttonStyle(MainStyle())
        }
        .navigationTitle("Répétitions")
        .onAppear { focused = true }
    }

    private func round(_ icon: String, _ label: String, _ action: @escaping () -> Void) -> some View {
        Button {
            action()
            WKInterfaceDevice.current().play(.click)
        } label: {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .bold))
                .frame(width: 40, height: 40)
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
            Button {
                store.addWarmup()
                dismiss()
            } label: {
                Label("Ajouter un échauffement", systemImage: "flame.fill")
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

// MARK: - Rest timer

/// 40 and 41 mm watches: a few screens put their buttons on one line.
private let compact = WKInterfaceDevice.current().screenBounds.height < 210

struct RestView: View {
    @EnvironmentObject var store: WatchStore
    let s: WSession
    let now: Double

    var body: some View {
        let left = max(0, Int(((s.restUntil - now) / 1000).rounded(.up)))
        let pct = s.restTotal > 0 ? min(1, Double(left) / Double(s.restTotal)) : 0
        let ready = store.ready(for: s)
        let ending = left <= 5 || ready
        let tint = ending ? go : restBlue
        ScrollView {
            VStack(alignment: .leading, spacing: 3) {
                // The time, with « Repos » and the heart rate beside it: one line less, so
                // Reprendre stays clear of the rounded corners at the bottom.
                HStack(alignment: .center, spacing: 4) {
                    Text(mmss(left))
                        .font(.system(size: 44, weight: .heavy, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(tint)
                        .contentTransition(.numericText(countsDown: true))
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                        .accessibilityLabel("Repos restant \(mmss(left))")
                    Spacer(minLength: 2)
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(ready ? "Prêt" : "Repos")
                            .font(.system(size: 14, weight: .bold, design: .rounded))
                            .foregroundStyle(tint)
                        HeartPill(size: 12)
                    }
                }
                Capsule().fill(Color.white.opacity(0.14))
                    .frame(height: 4)
                    .overlay(alignment: .leading) {
                        GeometryReader { g in
                            Capsule().fill(tint).frame(width: g.size.width * pct)
                                .animation(.linear(duration: 1), value: pct)
                        }
                    }
                upNext
                    .padding(.vertical, 2)
                HStack(spacing: 5) {
                    Button("−15 s") { store.shiftRest(-15) }
                        .buttonStyle(ChipStyle(height: 30))
                        .accessibilityLabel("Retirer 15 secondes")
                    Button("+15 s") { store.shiftRest(15) }
                        .buttonStyle(ChipStyle(height: 30))
                        .accessibilityLabel("Ajouter 15 secondes")
                    // Small watch: Reprendre on the same line, so everything fits.
                    if compact {
                        Button { store.skipRest() } label: { Image(systemName: "play.fill") }
                            .buttonStyle(ChipStyle(fill: restBlue, fg: .black, height: 30))
                            .accessibilityLabel("Reprendre")
                    }
                }
                if !compact {
                    Button("Reprendre") { store.skipRest() }
                        .buttonStyle(MainStyle(colors: [restDeep, Color(red: 0.05, green: 0.45, blue: 0.42)], height: 36))
                        .accessibilityLabel("Passer le repos")
                }
            }
            .padding(.bottom, 8)
        }
    }

    @ViewBuilder private var upNext: some View {
        VStack(spacing: 0) {
            if let e = s.exercise, let i = s.activeSet, e.sets.contains(where: { $0.done }) {
                // Same exercise: one line is enough.
                let x = e.sets[i]
                Text("\(setRank(e, i)) · " + (x.kg > 0 ? "\(fmtKg(x.kg)) kg × \(x.reps)" : "× \(x.reps)"))
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            } else if let e = s.exercise, let i = s.activeSet {
                let x = e.sets[i]
                Text("À suivre · \(e.name)")
                    .font(.system(size: 13, weight: .bold, design: .rounded))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text("\(setRank(e, i)) · " + (x.kg > 0 ? "\(fmtKg(x.kg)) kg × \(x.reps)" : "× \(x.reps)"))
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            } else if let n = s.exercises.first(where: { $0.isOpen }) {
                Text("À suivre · \(n.name)")
                    .font(.system(size: 13, weight: .bold, design: .rounded))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            } else {
                Text("Dernière série faite")
                    .font(.system(size: 13, weight: .bold, design: .rounded))
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Exercise finished: pick the next one, or finish

struct NextView: View {
    @EnvironmentObject var store: WatchStore
    let s: WSession
    @State private var confirm = false

    var body: some View {
        let remaining = s.exercises.indices.filter { s.exercises[$0].isOpen }
        ScrollView {
            VStack(alignment: .leading, spacing: 6) {
                if remaining.isEmpty {
                    DoneHeader(title: "Tout est fait", detail: "\(s.done) séries")
                } else {
                    Text("Exercice suivant")
                        .font(.system(size: 15, weight: .bold, design: .rounded))
                        .foregroundStyle(brand)
                }
                ForEach(remaining, id: \.self) { i in
                    let open = s.exercises[i].sets.filter { !$0.done }.count
                    NavRow(icon: "dumbbell.fill", tint: brand, title: s.exercises[i].name, detail: open > 1 ? "\(open) séries" : "1 série") {
                        store.choose(i)
                    }
                }
                if remaining.isEmpty {
                    Button { store.finish() } label: { Label("Terminer la séance", systemImage: "flag.checkered") }
                        .buttonStyle(MainStyle())
                } else {
                    Button { confirm = true } label: { Label("Terminer la séance", systemImage: "flag.checkered") }
                        .buttonStyle(ChipStyle())
                        .padding(.top, 2)
                }
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

// MARK: - Home

struct IdleView: View {
    @EnvironmentObject var store: WatchStore

    var body: some View {
        ScrollView {
            VStack(spacing: 6) {
                gymRow
                runRow
                if store.upcomingRun != nil {
                    NavRow(icon: "location.fill", tint: go, title: "Course libre", detail: "GPS, allure et BPM") {
                        store.pendingRun = .free
                    }
                }
                NavRow(icon: "figure.walk.treadmill", tint: restBlue, title: "Tapis", detail: "12-3-30, paliers, libre") {
                    store.tapisPicker = true
                }
                if store.suggestion == nil && store.upcomingRun == nil && !store.waitingStart {
                    Text(store.heardFromPhone ? "Lance une séance sur l'iPhone, ou crée ton plan de course." : "Ouvre Kadence sur l'iPhone pour relier la montre.")
                        .font(.system(.caption2, design: .rounded))
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 2)
                }
            }
        }
        .navigationTitle("Kadence")
    }

    @ViewBuilder private var gymRow: some View {
        if store.waitingStart {
            NavRow(icon: "dumbbell.fill", tint: brand, title: "Démarrage…", detail: "Ouvre Kadence sur l'iPhone", busy: true) {
                store.cancelStart()
            }
        } else if let next = store.suggestion {
            NavRow(icon: "dumbbell.fill", tint: brand, title: next, detail: "Séance suggérée") {
                store.start()
            }
        }
    }

    @ViewBuilder private var runRow: some View {
        if let r = store.upcomingRun {
            NavRow(icon: "figure.run", tint: go, title: r.title, detail: "\(r.when) · \(r.mins) min · ≈ \(fmtKg(r.km)) km") {
                store.pendingRun = r
            }
        } else {
            NavRow(icon: "figure.run", tint: go, title: "Course libre", detail: "GPS, allure et BPM") {
                store.pendingRun = .free
            }
        }
    }
}

// MARK: - Running

/// Before the start: the session in a few lines, the GPS, then Démarrer.
struct RunStartView: View {
    @EnvironmentObject var store: WatchStore
    let run: WRun

    private var tint: Color { run.indoor ? restBlue : run.steps.isEmpty ? go : brand }
    private var icon: String { run.indoor ? (run.walking ? "figure.walk.treadmill" : "figure.run.treadmill") : "figure.run" }
    private var eyebrow: String {
        if run.indoor { return run.walking ? "MARCHE INCLINÉE" : "COURSE SUR TAPIS" }
        if run.steps.isEmpty { return "COURSE LIBRE" }
        return run.when.isEmpty ? "COURSE" : run.when.uppercased()
    }
    private var title: String {
        if run.steps.isEmpty { return run.indoor ? "À ton rythme" : "Course libre" }
        return run.title
    }

    /// « Efforts 6 × 1 min · Allure 6’00”–6’20” · Récup 1 min 30 · Durée 34 min ».
    private var rows: [(String, String)] {
        var out: [(String, String)] = []
        let work = run.steps.filter { $0.phase == "work" }
        let rec = run.steps.filter { $0.phase == "recovery" }
        if run.indoor {
            out.append(("Durée", "\(run.mins) min"))
            if run.km > 0 { out.append(("Distance", "\(fmtKg(run.km)) km")) }
            if let inc = run.steps.compactMap({ $0.incline }).max(), inc > 0 { out.append(("Pente max", "\(fmt1(inc)) %")) }
            return out
        }
        if work.count > 1, Set(work.map { $0.secs }).count == 1 {
            out.append(("Efforts", "\(work.count) × \(fmtDur(work[0].secs))"))
        } else if work.count == 1 {
            out.append(("Effort", fmtDur(work[0].secs)))
        }
        if let b = work.first(where: { $0.fast > 0 }) ?? run.steps.first(where: { $0.fast > 0 }) {
            out.append(("Allure", "\(paceQ(b.fast))–\(paceQ(b.slow))"))
        }
        if let r = rec.first { out.append(("Récup", fmtDur(r.secs))) }
        out.append(("Durée", "\(run.mins) min"))
        if run.km > 0 { out.append(("Distance", "≈ \(fmtKg(run.km)) km")) }
        return out
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .center, spacing: 8) {
                    Image(systemName: icon)
                        .font(.system(size: 26, weight: .semibold))
                        .foregroundStyle(tint)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(eyebrow)
                            .font(.system(size: 10, weight: .heavy, design: .rounded))
                            .foregroundStyle(tint)
                        Text(title)
                            .font(.system(size: 18, weight: .bold, design: .rounded))
                            .lineLimit(2)
                            .minimumScaleFactor(0.7)
                    }
                }
                .padding(.bottom, 2)
                if run.steps.isEmpty {
                    if run.indoor {
                        feature("digitalcrown.arrow.clockwise", "Vitesse et pente avec la Couronne")
                        feature("mountain.2.fill", "Distance et dénivelé calculés")
                    } else {
                        feature("waveform.path", "Vibration à chaque km")
                    }
                } else {
                    ForEach(Array(rows.enumerated()), id: \.offset) { _, r in
                        InfoRow(label: r.0, value: r.1)
                    }
                }
                if !run.indoor {
                    feature(store.runner.gpsReady ? "location.fill" : "location", store.runner.gpsReady ? "GPS prêt" : "Recherche du GPS…",
                            color: store.runner.gpsReady ? go : warn)
                }
                Button {
                    store.pendingRun = nil
                    store.runner.start(run)
                } label: {
                    Label("Démarrer", systemImage: "play.fill")
                }
                .buttonStyle(MainStyle())
                .disabled(store.workout.running)
                .padding(.top, 4)
                if store.workout.running {
                    Text("Termine d'abord la séance de musculation.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button { store.pendingRun = nil } label: { Image(systemName: "chevron.left") }
                    .accessibilityLabel("Retour")
            }
        }
        .onAppear { store.runner.prepare(indoor: run.indoor) }
        .onDisappear { store.runner.unprepare() }
    }

    private func feature(_ icon: String, _ text: String, color: Color = .white) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .semibold))
                .frame(width: 18)
            Text(text)
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .lineLimit(2)
                .minimumScaleFactor(0.8)
        }
        .foregroundStyle(color)
        .padding(.vertical, 3)
    }
}

private func phaseColor(_ phase: String?) -> Color {
    switch phase {
    case "work": return brand
    case "recovery": return restBlue
    default: return go
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
            let tint = phaseColor(r.step?.phase)
            VStack(spacing: 6) {
                ZStack {
                    Circle().stroke(Color.white.opacity(0.14), lineWidth: 8)
                    Circle()
                        .trim(from: 0, to: CGFloat(n) / 3)
                        .stroke(tint, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .animation(.easeInOut(duration: 0.9), value: n)
                    Text("\(n)")
                        .font(.system(size: 64, weight: .heavy, design: .rounded))
                        .contentTransition(.numericText(countsDown: true))
                }
                .frame(width: 112, height: 112)
                Text(r.step.map { $0.title } ?? "C'est parti")
                    .font(.system(size: 13, weight: .bold, design: .rounded))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Button("Annuler") { r.cancel() }
                    .buttonStyle(ChipStyle(height: 32))
            }
            .containerBackground(glow(tint), for: .navigation)
        case .saving:
            VStack(spacing: 6) {
                ProgressView()
                Text("Enregistrement…").font(.system(.footnote, design: .rounded))
            }
            .containerBackground(glow(go), for: .navigation)
        default:
            TabView(selection: $page) {
                RunControls().tag(0)
                if r.indoor { TapisMetrics().tag(1) } else { RunMetrics().tag(1) }
            }
            .tabViewStyle(.page)
            .containerBackground(glow(tint), for: .navigation)
        }
    }

    private var tint: Color {
        let r = store.runner
        if r.phase == .paused { return warn }
        if r.finishedPlan { return go }
        return phaseColor(r.step?.phase)
    }
}

struct RunMetrics: View {
    @EnvironmentObject var store: WatchStore

    var body: some View {
        let r = store.runner
        Group {
            if r.finishedPlan {
                planDone(r)
            } else if let st = r.step, st.phase == "recovery" {
                recovery(r, st)
            } else if let st = r.step {
                guided(r, st)
            } else {
                free(r)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .overlay { toasts(r) }
    }

    // A step with a pace to hold (or an easy part): the pace first, then what to do.
    private func guided(_ r: RunManager, _ st: WRunStep) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(header(r, st))
                .font(.system(size: 17, weight: .bold, design: .rounded))
                .foregroundStyle(r.phase == .paused ? warn : phaseColor(st.phase))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            BigValue(value: bigPace(r.pace), unit: "/km", size: 50)
            status(r, st)
            if st.fast > 0 {
                Text("Cible \(paceQ(st.fast))–\(paceQ(st.slow))/km")
                    .font(.system(size: 13, weight: .semibold, design: .rounded))
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            Spacer(minLength: 2)
            Rectangle().fill(line).frame(height: 0.5)
            HStack(alignment: .firstTextBaseline) {
                Image(systemName: "stopwatch")
                    .font(.system(size: 14, weight: .semibold))
                Text("\(mmss(Int(r.stepLeft.rounded(.up)))) restantes")
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Spacer(minLength: 2)
                HeartPill(size: 14, live: r.heartRate)
            }
            .padding(.top, 3)
        }
    }

    // Recovery: the time left in blue, what comes next, and a way to skip it.
    private func recovery(_ r: RunManager, _ st: WRunStep) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(r.phase == .paused ? "En pause" : "Récupération")
                    .font(.system(size: 17, weight: .bold, design: .rounded))
                    .foregroundStyle(r.phase == .paused ? warn : .white)
                Spacer(minLength: 2)
                HeartPill(size: 13, live: r.heartRate)
            }
            BigValue(value: mmss(Int(r.stepLeft.rounded(.up))), size: 54, color: restBlue, countsDown: true)
                .frame(maxWidth: .infinity)
            Text(nextText(r))
                .font(.system(size: 14, weight: .semibold, design: .rounded))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity)
            ProgressView(value: r.stepProgress)
                .tint(restBlue)
            Spacer(minLength: 2)
            Button("Passer la récup") { r.nextStepNow() }
                .buttonStyle(ChipStyle(height: 32))
        }
    }

    // Free run: pace in big, then time and distance side by side, then the heart rate.
    private func free(_ r: RunManager) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            HStack {
                Image(systemName: "figure.run")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(go)
                Spacer()
                if r.phase == .paused {
                    Text(r.autoPaused ? "Pause auto" : "En pause")
                        .font(.system(size: 13, weight: .bold, design: .rounded))
                        .foregroundStyle(warn)
                }
            }
            Text("Allure")
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundStyle(.secondary)
            BigValue(value: bigPace(r.pace), unit: "/km", size: 48, color: go)
            Rectangle().fill(line).frame(height: 0.5).padding(.vertical, 3)
            HStack(alignment: .top, spacing: 6) {
                stat(hms(r.elapsed), "", "Durée")
                Rectangle().fill(line).frame(width: 0.5, height: 34)
                stat(fmtKm(r.meters), "km", "Distance")
            }
            Spacer(minLength: 2)
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Image(systemName: "heart.fill")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(.red)
                Text(r.heartRate > 0 ? "\(Int(r.heartRate))" : "—")
                    .font(.system(size: 22, weight: .bold, design: .rounded))
                    .monospacedDigit()
                Text("bpm")
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(r.heartRate > 0 ? "Fréquence cardiaque \(Int(r.heartRate))" : "Fréquence cardiaque indisponible")
        }
    }

    // Every step done: the totals, and Terminer at hand.
    private func planDone(_ r: RunManager) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            DoneHeader(title: "Séance faite", detail: "Termine quand tu veux")
            InfoRow(label: "Temps", value: hms(r.elapsed))
            InfoRow(label: "Distance", value: "\(fmtKm(r.meters)) km")
            if r.effortsTotal > 0 {
                InfoRow(label: "Dans l'allure", value: "\(r.effortsOK)/\(r.effortsTotal) efforts", color: r.effortsOK == r.effortsTotal ? go : .white)
            }
            Spacer(minLength: 4)
            Button("Terminer") { r.end(save: true) }
                .buttonStyle(MainStyle(colors: [go, Color(red: 0.08, green: 0.6, blue: 0.35)]))
        }
    }

    @ViewBuilder private func toasts(_ r: RunManager) -> some View {
        if let t = r.blockToast {
            VStack(alignment: .leading, spacing: 0) {
                DoneHeader(title: "Bloc terminé", detail: "\(t.efforts)/\(t.efforts) efforts")
                InfoRow(label: "En effort", value: hms(t.workSecs))
                if t.banded {
                    InfoRow(label: "Dans la cible", value: hms(t.inBandSecs), color: go)
                }
                Spacer(minLength: 4)
                Button("OK") { r.dismissBlockToast() }
                    .buttonStyle(ChipStyle(height: 32))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(Color.black)
            .transition(.opacity)
        } else if let t = r.kmToast {
            VStack(spacing: 2) {
                Text("Kilomètre \(t.km)")
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                    .foregroundStyle(go)
                BigValue(value: paceQ(t.pace), unit: "/km", size: 46)
                Text("ce kilomètre")
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.black)
            .transition(.opacity)
        }
    }

    private func stat(_ value: String, _ unit: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(value)
                    .font(.system(size: 22, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                if !unit.isEmpty {
                    Text(unit)
                        .font(.system(size: 12, weight: .semibold, design: .rounded))
                        .foregroundStyle(.secondary)
                }
            }
            Text(label)
                .font(.system(size: 11, weight: .semibold, design: .rounded))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // « ✓ Dans la cible », « ↓ Ralentis », « ↑ Accélère », or how it should feel.
    @ViewBuilder private func status(_ r: RunManager, _ st: WRunStep) -> some View {
        if st.fast > 0, r.pace > 0 {
            let fast = r.pace < st.fast
            let slow = r.pace > st.slow
            HStack(spacing: 5) {
                Image(systemName: fast ? "arrow.down" : slow ? "arrow.up" : "checkmark.circle.fill")
                    .font(.system(size: 16, weight: .bold))
                Text(fast ? "Ralentis" : slow ? "Accélère" : "Dans la cible")
                    .font(.system(size: 17, weight: .bold, design: .rounded))
                    .lineLimit(1)
            }
            .foregroundStyle(fast || slow ? warn : go)
        } else if st.fast > 0 {
            Text("Allure en calcul…")
                .font(.system(size: 14, weight: .semibold, design: .rounded))
                .foregroundStyle(.secondary)
        } else if !st.hint.isEmpty {
            Text(st.hint)
                .font(.system(size: 15, weight: .semibold, design: .rounded))
                .foregroundStyle(phaseColor(st.phase))
                .lineLimit(2)
                .minimumScaleFactor(0.7)
        }
    }

    private func header(_ r: RunManager, _ st: WRunStep) -> String {
        if r.phase == .paused { return r.autoPaused ? "Pause auto" : "En pause" }
        if st.phase == "work" {
            let (i, n) = r.stepRank
            return n > 1 ? "Effort \(i)/\(n)" : st.title
        }
        return st.title
    }

    private func nextText(_ r: RunManager) -> String {
        guard let n = r.nextStep else { return "Dernière étape" }
        if n.phase == "work", let rank = r.nextWorkRank { return "avant l'effort \(rank.0)/\(rank.1)" }
        return "Ensuite : \(n.title.lowercased())"
    }
}

/// Tapis: the guided sessions sent by the iPhone, and the free sessions.
struct TapisPicker: View {
    @EnvironmentObject var store: WatchStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(store.walks) { w in
                    NavRow(icon: "figure.walk.treadmill", tint: restBlue, title: w.title, detail: "\(w.mins) min · \(fmtKg(w.km)) km") {
                        store.tapisPicker = false
                        store.pendingRun = w
                    }
                }
                NavRow(icon: "figure.walk.treadmill", tint: go, title: "Marche libre", detail: "Vitesse et pente à la Couronne") {
                    store.tapisPicker = false
                    store.pendingRun = .freeIndoor("incline_walk")
                }
                NavRow(icon: "figure.run.treadmill", tint: brand, title: "Course sur tapis", detail: "Vitesse et pente à la Couronne") {
                    store.tapisPicker = false
                    store.pendingRun = .freeIndoor("treadmill")
                }
                if store.walks.isEmpty {
                    Text("Ouvre Kadence sur l'iPhone pour recevoir les séances guidées.")
                        .font(.system(.caption2, design: .rounded))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("Tapis")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button { store.tapisPicker = false } label: { Image(systemName: "chevron.left") }
                    .accessibilityLabel("Retour")
            }
        }
    }
}

/// Tapis during the session: the palier, then speed and incline (Digital Crown), then the totals.
struct TapisMetrics: View {
    @EnvironmentObject var store: WatchStore
    @State private var field = 0          // 0 speed, 1 incline
    @State private var crown: Double = 0
    @FocusState private var focused: Bool

    var body: some View {
        let r = store.runner
        let st = r.finishedPlan ? nil : r.step
        let tint: Color = r.phase == .paused ? warn : st.map { phaseColor($0.phase) } ?? restBlue
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline) {
                Text(header(r, st))
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                    .foregroundStyle(tint)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Spacer(minLength: 2)
                Text(st != nil ? mmss(Int(r.stepLeft.rounded(.up))) : hms(r.elapsed))
                    .font(.system(size: 22, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(tint)
                    .contentTransition(.numericText(countsDown: st != nil))
            }
            if !r.changeText.isEmpty, st != nil || r.elapsed < 20 {
                Text(r.changeText)
                    .font(.system(size: 13, weight: .bold, design: .rounded))
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
            }
            if st != nil {
                ProgressView(value: r.stepProgress).tint(tint)
            }
            HStack(spacing: 5) {
                box(fmt1(r.speed), "km/h", selected: field == 0).onTapGesture { field = 0 }
                    .accessibilityLabel("Vitesse \(fmt1(r.speed)) kilomètres heure")
                    .accessibilityAddTraits(.isButton)
                box(fmt1(r.incline), "%", selected: field == 1).onTapGesture { field = 1 }
                    .accessibilityLabel("Pente \(fmt1(r.incline)) pour cent")
                    .accessibilityAddTraits(.isButton)
            }
            .focusable(true)
            .focused($focused)
            .digitalCrownRotation($crown, from: field == 0 ? 1 : 0, through: field == 0 ? 30 : 15, by: field == 0 ? 0.1 : 0.5,
                                  sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true)
            Spacer(minLength: 0)
            Rectangle().fill(line).frame(height: 0.5)
            HStack(alignment: .firstTextBaseline) {
                value(fmtKm(r.meters), "km")
                Spacer(minLength: 2)
                value("\(Int(r.elevation.rounded()))", "m D+")
            }
            HStack(alignment: .firstTextBaseline) {
                HeartPill(size: 16, live: r.heartRate)
                Spacer(minLength: 2)
                value("\(Int(r.calories))", "kcal")
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .onAppear { crown = r.speed; focused = true }
        .onChange(of: field) { _, f in crown = f == 0 ? store.runner.speed : store.runner.incline }
        .onChange(of: crown) { _, v in
            if field == 0 { store.runner.setSpeed(v) } else { store.runner.setIncline(v) }
        }
        // A new palier changes the values: the crown follows.
        .onChange(of: r.speed) { _, v in if field == 0, abs(crown - v) > 0.01 { crown = v } }
        .onChange(of: r.incline) { _, v in if field == 1, abs(crown - v) > 0.01 { crown = v } }
    }

    private func header(_ r: RunManager, _ st: WRunStep?) -> String {
        if r.phase == .paused { return "En pause" }
        guard let st else { return r.finishedPlan ? "Terminé" : "Tapis" }
        return r.steps.count > 1 ? "\(st.title) \(r.stepIndex + 1)/\(r.steps.count)" : st.title
    }

    private func box(_ v: String, _ unit: String, selected: Bool) -> some View {
        VStack(spacing: 0) {
            Text(v)
                .font(.system(size: 26, weight: .heavy, design: .rounded))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            HStack(spacing: 2) {
                Text(unit)
                if selected { Image(systemName: "digitalcrown.arrow.clockwise").imageScale(.small) }
            }
            .font(.system(size: 10, weight: .bold, design: .rounded))
            .foregroundStyle(selected ? restBlue : .secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 5)
        .background(RoundedRectangle(cornerRadius: 14).fill(selected ? restBlue.opacity(0.25) : chip))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(selected ? restBlue : .clear, lineWidth: 2))
    }

    private func value(_ v: String, _ unit: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 3) {
            Text(v).font(.system(size: 18, weight: .bold, design: .rounded)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
            Text(unit).font(.system(size: 10, weight: .semibold, design: .rounded)).foregroundStyle(.secondary)
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
        .confirmationDialog(r.indoor ? "Terminer la séance ?" : "Terminer la course ?", isPresented: $confirm, titleVisibility: .visible) {
            Button("Terminer") { r.end(save: true) }
            Button(r.indoor ? "Ne pas enregistrer" : "Annuler la course", role: .destructive) { r.end(save: false) }
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
            VStack(alignment: .leading, spacing: 0) {
                DoneHeader(title: "Bien joué", detail: sum.title)
                InfoRow(label: "Distance", value: "\(fmtKm(sum.meters)) km")
                InfoRow(label: "Temps", value: hms(sum.seconds))
                if sum.indoor {
                    InfoRow(label: "Vitesse moy.", value: sum.seconds > 0 ? "\(fmt1(sum.meters / sum.seconds * 3.6)) km/h" : "—")
                    InfoRow(label: "Dénivelé", value: "\(Int(sum.elevation.rounded())) m")
                } else {
                    InfoRow(label: "Allure moy.", value: sum.meters > 50 ? "\(paceQ(sum.seconds / (sum.meters / 1000)))/km" : "—")
                }
                if sum.heartRate > 0 { InfoRow(label: "BPM moyen", value: "\(Int(sum.heartRate))") }
                if sum.calories > 0 { InfoRow(label: "Calories", value: "\(Int(sum.calories)) kcal") }
                if !sum.note.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 3) {
                            ForEach(Array(sum.efforts.enumerated()), id: \.offset) { _, e in
                                Capsule().fill(e == "ok" ? go : warn).frame(height: 5)
                            }
                        }
                        Text(sum.note)
                            .font(.system(size: 12, weight: .semibold, design: .rounded))
                            .foregroundStyle(.secondary)
                    }
                    .padding(.top, 7)
                }
                Text("Enregistré dans Apple Santé, et dans Kadence à la prochaine ouverture de l'iPhone.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 6)
                Button("OK") { store.runner.summary = nil }
                    .buttonStyle(MainStyle())
            }
        }
    }
}

// MARK: - Session finished

struct SummaryView: View {
    @EnvironmentObject var store: WatchStore
    let sum: Summary

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                DoneHeader(title: "Séance terminée", detail: sum.title)
                InfoRow(label: "Durée", value: "\(sum.minutes) min")
                InfoRow(label: "Séries", value: "\(sum.sets)")
                InfoRow(label: "Volume", value: "\(fmtInt(sum.volume)) kg", color: ember)
                if sum.heartRate > 0 { InfoRow(label: "BPM moyen", value: "\(Int(sum.heartRate))") }
                if sum.calories > 0 { InfoRow(label: "Calories", value: "\(Int(sum.calories)) kcal") }
                Text("Le bilan complet est sur l'iPhone.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 6)
                Button("OK") { store.summary = nil }
                    .buttonStyle(MainStyle())
            }
        }
    }
}
