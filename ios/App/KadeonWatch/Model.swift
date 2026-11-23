import Foundation

// Same shapes as watchState() in src/watch.js. Times are JavaScript milliseconds.

struct WSet: Codable, Equatable {
    var kg: Double
    var reps: Int
    var warm: Bool
    var done: Bool
    var prev: String
    /// normal, warmup, dropset, failure (missing in states saved by older versions).
    var type: String?
}

/// Another exercise for the same muscle, with its last load (machine taken).
struct WAlt: Codable, Equatable, Hashable {
    var name: String
    var kg: Double
    var reps: Int
    var step: Double
}

struct WExercise: Codable, Equatable {
    var name: String
    var rest: Int
    var superset: String
    var step: Double
    var coach: String
    var sets: [WSet]
    var alts: [WAlt]?

    var isOpen: Bool { sets.contains { !$0.done } }
}

struct WSession: Codable, Equatable {
    var title: String
    var startedAt: Double
    var current: Int
    var restUntil: Double
    var restTotal: Int
    var exercises: [WExercise]

    var exercise: WExercise? { exercises.indices.contains(current) ? exercises[current] : nil }
    var activeSet: Int? { exercise?.sets.firstIndex { !$0.done } }

    var done: Int { exercises.reduce(0) { $0 + $1.sets.filter { !$0.warm && $0.done }.count } }
    var total: Int { exercises.reduce(0) { $0 + $1.sets.filter { !$0.warm }.count } }
    var volume: Double {
        exercises.reduce(0) { acc, e in acc + e.sets.filter { !$0.warm && $0.done }.reduce(0) { $0 + $1.kg * Double($1.reps) } }
    }

    /// After the rest: the exercise and the load (« 80 × 8 »), shown under the timer.
    var nextUp: (name: String, load: String)? {
        if let e = exercise, let i = activeSet {
            let x = e.sets[i]
            return (e.name, x.kg > 0 ? "\(fmtKg(x.kg)) kg × \(x.reps)" : "× \(x.reps)")
        }
        if let n = exercises.first(where: { $0.isOpen }) { return (n.name, "") }
        return nil
    }

    /// What comes after the rest, shown under the timer.
    var nextLabel: String {
        if let e = exercise, let i = activeSet {
            let x = e.sets[i]
            let load = x.kg > 0 ? "\(fmtKg(x.kg)) × \(x.reps)" : "× \(x.reps)"
            return "Ensuite : \(e.name), \(load)"
        }
        if let n = exercises.first(where: { $0.isOpen }) { return "Ensuite : \(n.name)" }
        return "Dernière série faite"
    }

    /// Port of afterValidate() in src/session.jsx: the set is done, then the next exercise
    /// of a superset, or the next open exercise, and the rest timer starts at `at`.
    mutating func validate(ex ei: Int, set si: Int, kg: Double, reps: Int, at: Double) {
        guard exercises.indices.contains(ei), exercises[ei].sets.indices.contains(si) else { return }
        exercises[ei].sets[si].kg = kg
        exercises[ei].sets[si].reps = reps
        exercises[ei].sets[si].done = true
        let e = exercises[ei]
        var cur = ei
        var rest = e.rest
        if !e.superset.isEmpty {
            let members = exercises.indices.filter { exercises[$0].superset == e.superset }
            let pos = members.firstIndex(of: ei) ?? 0
            if let after = members.dropFirst(pos + 1).first(where: { exercises[$0].isOpen }) {
                current = after
                restUntil = 0
                return
            }
            rest = members.map { exercises[$0].rest }.max() ?? 0
            if let first = members.first(where: { exercises[$0].isOpen }) {
                cur = first
            } else if let last = members.last, let nx = exercises.indices.first(where: { $0 > last && exercises[$0].isOpen }) {
                cur = nx
            }
        } else if !e.isOpen, let nx = exercises.indices.first(where: { $0 > ei && exercises[$0].isOpen }) {
            cur = nx
        }
        current = cur
        restUntil = rest > 0 ? at + Double(rest) * 1000 : 0
        restTotal = rest
    }

    /// One more working set on exercise ei, like its last one.
    mutating func addSet(ex ei: Int) {
        guard exercises.indices.contains(ei) else { return }
        let e = exercises[ei]
        let last = e.sets.last(where: { !$0.warm }) ?? e.sets.last
        exercises[ei].sets.append(WSet(kg: last?.kg ?? 0, reps: last?.reps ?? 0, warm: false, done: false, prev: "", type: "normal"))
        current = ei
    }

    /// Port of replaceExercise() in src/session.jsx: the alternative takes the remaining sets
    /// (done sets stay with the first exercise). The iPhone refines the loads afterwards.
    mutating func replace(ex ei: Int, with alt: WAlt) {
        guard exercises.indices.contains(ei) else { return }
        let e = exercises[ei]
        let open = e.sets.filter { !$0.done }
        guard !open.isEmpty else { return }
        let sets = open.map { x in
            WSet(kg: x.warm ? (alt.kg * 0.5 * 2).rounded() / 2 : alt.kg, reps: x.warm ? x.reps : alt.reps, warm: x.warm, done: false, prev: "", type: x.type)
        }
        let fresh = WExercise(name: alt.name, rest: e.rest, superset: e.superset, step: alt.step, coach: "", sets: sets, alts: nil)
        if e.sets.contains(where: { $0.done }) {
            exercises[ei].sets = e.sets.filter { $0.done }
            exercises.insert(fresh, at: ei + 1)
            current = ei + 1
        } else {
            exercises[ei] = fresh
            current = ei
        }
    }

    mutating func shiftRest(_ seconds: Int, at: Double) {
        let until = max(at, (restUntil > 0 ? restUntil : at) + Double(seconds) * 1000)
        restUntil = until
        restTotal = max(restTotal, Int(((until - at) / 1000).rounded(.up)))
    }
}

struct PhoneState: Codable {
    var v: Int?
    var ack: Double?
    var active: Bool
    var suggestion: String?
    var session: WSession?
}

struct Summary: Equatable {
    var title: String
    var minutes: Int
    var sets: Int
    var volume: Double
    var heartRate: Double
    var calories: Double
}

func nowMs() -> Double { Date().timeIntervalSince1970 * 1000 }

/// 80 → "80", 62.5 → "62,5".
func fmtKg(_ v: Double) -> String {
    let r = (v * 10).rounded() / 10
    if r == r.rounded() { return String(Int(r)) }
    return String(format: "%.1f", r).replacingOccurrences(of: ".", with: ",")
}

func mmss(_ seconds: Int) -> String {
    let s = max(0, seconds)
    return String(format: "%d:%02d", s / 60, s % 60)
}

/// "12 450" with a narrow space, as on the iPhone.
func fmtInt(_ v: Double) -> String {
    let f = NumberFormatter()
    f.numberStyle = .decimal
    f.locale = Locale(identifier: "fr_FR")
    f.maximumFractionDigits = 0
    return f.string(from: NSNumber(value: v.rounded())) ?? String(Int(v.rounded()))
}
