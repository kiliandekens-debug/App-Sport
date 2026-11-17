import { useMemo, useRef, useState } from 'react';
import { readRunScreenshot, parseRunText } from '../lib/runocr.js';
import { useData, saveRunProfile, saveRunLog, deleteRunLog } from '../data.jsx';
import { useUi } from '../ui.jsx';
import { Icon, Bars, GlassHeader } from '../components.jsx';
import { fmtDay } from '../lib/stats.js';
import { GOALS, buildPlan, appleSteps, segments, intensityOf, mmss, hms, parseDuration, TYPE_LABEL, paceRange, pacesOf, structureText, goalPrediction, betterLevel, runStats } from '../lib/running.js';

const FILL = { warm: 'var(--z0)', cool: 'var(--z0)', rest: 'var(--z0)', easy: 'var(--z1)', steady: 'var(--z2)', tempo: 'var(--z3)', fast: 'var(--z4)' };
const today = () => new Date().toISOString().slice(0, 10);

// The session drawn as a profile: width = time, height = effort.
function RunChart({ session }) {
  const segs = segments(session);
  const total = segs.reduce((a, s) => a + s.mins, 0);
  // A steady run is one block: a short band is enough, no need for a big empty chart.
  const W = 320, H = segs.length === 1 ? 34 : 110, GAP = 1.5;
  let x = 0;
  const kinds = [...new Set(segs.map((s) => s.type))];
  return (
    <div className="stack" style={{ gap: 10 }}>
      <svg viewBox={`0 0 ${W} ${H + 18}`} width="100%" role="img" aria-label={`Séance de ${session.mins} minutes : ${kinds.map((k) => TYPE_LABEL[k]).join(', ')}`} style={{ display: 'block' }}>
        {segs.map((s, i) => {
          const w = (s.mins / total) * W;
          const h = intensityOf(s.type) * H;
          const rect = <rect key={i} x={x + GAP / 2} y={H - h} width={Math.max(1, w - GAP)} height={h} rx={3} fill={FILL[s.type]} />;
          x += w;
          return rect;
        })}
        <line x1="0" y1={H + 0.5} x2={W} y2={H + 0.5} stroke="var(--line)" />
        <text x="0" y={H + 14} fontSize="11" fill="var(--muted)">0</text>
        <text x={W} y={H + 14} fontSize="11" fill="var(--muted)" textAnchor="end">{session.mins} min</text>
      </svg>
      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        {kinds.map((k) => (
          <span key={k} className="row xs muted" style={{ gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: FILL[k], display: 'inline-block' }} />{TYPE_LABEL[k]}
          </span>
        ))}
      </div>
      <span className="small" style={{ lineHeight: 1.4 }}>{structureText(session)}</span>
    </div>
  );
}

function SessionRow({ s, active, onPick }) {
  return (
    <button className="card row" disabled={s.done} onClick={onPick} aria-label={`${s.title}, ${s.mins} minutes${s.done ? ', faite' : ', afficher'}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, textAlign: 'left', width: '100%', color: 'inherit', background: s.done ? 'var(--done)' : undefined, borderColor: s.done ? 'var(--done-line)' : active ? 'var(--accent)' : undefined, borderWidth: active && !s.done ? 2 : undefined, opacity: 1 }}>
      <span style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 13, background: s.done ? 'var(--ok)' : 'var(--chip)', color: 'var(--on-ok)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.done && <Icon name="check" size={14} width={3} />}</span>
      <span className="grow stack" style={{ gap: 1 }}>
        <span style={{ fontWeight: 600 }}>{s.title}</span>
        <span className="xs muted">{s.mins} min, ≈ {String(s.km).replace('.', ',')} km{s.blocks.length === 1 ? `, ${paceRange(s.blocks[0].pace)} /km` : ''}</span>
      </span>
      {!s.done && <span className="xs" style={{ color: 'var(--accent)', fontWeight: 600 }}>{active ? 'Affichée' : 'Voir'}</span>}
    </button>
  );
}

function Setup({ initial, onSave, onCancel }) {
  const [goal, setGoal] = useState(initial?.goal || '10k');
  const [days, setDays] = useState(initial?.days_per_week || 3);
  const [refKm, setRefKm] = useState(initial?.ref_distance_km || 5);
  const [refTime, setRefTime] = useState(initial ? hms(initial.ref_time_s) : '');
  const [date, setDate] = useState(initial?.target_date || '');
  const [busy, setBusy] = useState(false);
  const secs = parseDuration(refTime);
  const bad = !secs || secs < 600 || secs > 20000;

  return (
    <main className="screen">
      <GlassHeader eyebrow="Plan de course" title="Ton objectif" />
      <div className="pad stack" style={{ gap: 16, paddingTop: 10 }}>
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">Objectif</span>
          <div className="seg" role="group" aria-label="Objectif" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            {Object.entries(GOALS).map(([k, g]) => <button key={k} className={goal === k ? 'on' : ''} aria-pressed={goal === k} onClick={() => setGoal(k)}>{g.label}</button>)}
          </div>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">Séances par semaine</span>
          <div className="seg" role="group" aria-label="Séances par semaine" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            {[2, 3, 4].map((n) => <button key={n} className={days === n ? 'on' : ''} aria-pressed={days === n} onClick={() => setDays(n)}>{n}</button>)}
          </div>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">Ton niveau actuel</span>
          <span className="small muted">Un temps récent sur une distance, même approximatif. Il sert à calculer tes allures.</span>
          <div className="seg" role="group" aria-label="Distance de référence" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            {[[3, '3 km'], [5, '5 km'], [10, '10 km']].map(([k, l]) => <button key={k} className={Number(refKm) === k ? 'on' : ''} aria-pressed={Number(refKm) === k} onClick={() => setRefKm(k)}>{l}</button>)}
          </div>
          <input className="input" inputMode="text" placeholder={Number(refKm) === 10 ? 'Temps, par exemple 58:30' : 'Temps, par exemple 28:30'} value={refTime} onChange={(e) => setRefTime(e.target.value)} aria-label="Temps de référence" />
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">Date de l'objectif (facultatif)</span>
          <input className="input" type="date" min={today()} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date de l'objectif" />
        </div>
        <button className="btn primary big" disabled={bad || busy} onClick={async () => {
          setBusy(true);
          try { await onSave({ goal, days_per_week: days, ref_distance_km: Number(refKm), ref_time_s: secs, target_date: date || null, started_on: initial?.started_on || today() }); } finally { setBusy(false); }
        }}>{initial ? 'Mettre à jour le plan' : 'Créer mon plan'}</button>
        {onCancel && <button className="btn" onClick={onCancel}>Annuler</button>}
      </div>
    </main>
  );
}

const toLocalInput = (iso) => {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function ResultForm({ draft, session, onSave, onCancel, note }) {
  const [f, setF] = useState(draft);
  const set = (k, v) => setF({ ...f, [k]: v });
  const secs = parseDuration(f.duration);
  const km = Number(String(f.distance).replace(',', '.'));
  const ok = km > 0 && secs > 0;
  return (
    <section className="card stack" style={{ gap: 12 }} aria-label="Résultat de la course">
      <span className="label">Résultat à enregistrer</span>
      {note && <span className="small" style={{ color: 'var(--rest)' }}>{note}</span>}
      <div className="grid2">
        <label className="stack" style={{ gap: 4 }}><span className="xs muted">Distance (km)</span><input className="input" inputMode="decimal" value={f.distance} onChange={(e) => set('distance', e.target.value)} /></label>
        <label className="stack" style={{ gap: 4 }}><span className="xs muted">Durée</span><input className="input" inputMode="text" placeholder="32:15" value={f.duration} onChange={(e) => set('duration', e.target.value)} /></label>
        <label className="stack" style={{ gap: 4 }}><span className="xs muted">Fréquence cardiaque moy.</span><input className="input" inputMode="numeric" value={f.hr} onChange={(e) => set('hr', e.target.value)} /></label>
        <label className="stack" style={{ gap: 4 }}><span className="xs muted">Calories</span><input className="input" inputMode="numeric" value={f.cal} onChange={(e) => set('cal', e.target.value)} /></label>
      </div>
      <label className="stack" style={{ gap: 4 }}><span className="xs muted">Date et heure</span><input className="input" type="datetime-local" value={f.when} onChange={(e) => set('when', e.target.value)} /></label>
      {ok && <span className="small muted">Allure moyenne : {mmss(secs / km)} /km{session ? ` (prévu : ${mmss((session.mins * 60) / session.km)})` : ''}</span>}
      <div className="stack" style={{ gap: 6 }}>
        <span className="xs muted">Comment c'était ?</span>
        <div className="seg" role="group" aria-label="Ressenti" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
          {[[1, 'Très facile'], [2, 'Facile'], [3, 'Bien'], [4, 'Dur'], [5, 'Très dur']].map(([n, l]) => (
            <button key={n} className={f.feel === n ? 'on' : ''} aria-pressed={f.feel === n} aria-label={l} title={l} onClick={() => set('feel', n)}>{n}</button>
          ))}
        </div>
        <span className="xs muted">1 = très facile, 5 = très dur</span>
      </div>
      <button className="btn primary big" disabled={!ok || !f.feel} onClick={() => onSave({ ...f, secs, km })}>Enregistrer la course</button>
      <button className="btn" onClick={onCancel}>Annuler</button>
    </section>
  );
}

export default function Course() {
  const data = useData();
  const ui = useUi();
  const fileRef = useRef(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [draftNote, setDraftNote] = useState(null);
  const [reading, setReading] = useState(false);
  const [picked, setPicked] = useState(null);
  const [showPlan, setShowPlan] = useState(false);
  const profile = data.runProfile;

  const plan = useMemo(() => (profile ? buildPlan(profile, data.runLogs, data.workouts) : null), [profile, data.runLogs, data.workouts]);

  const saveProfile = async (p) => {
    try { await saveRunProfile(p); await data.refresh(); setEditing(false); ui.notify('Plan enregistré'); } catch (e) { ui.notify(e.message || String(e)); }
  };

  if (!profile || editing) return <Setup initial={profile} onSave={saveProfile} onCancel={profile ? () => setEditing(false) : null} />;

  const all = plan.weeks.flat();
  const next = all.find((x) => x.key === picked && !x.done) || plan.next;
  const isPicked = next && plan.next && next.key !== plan.next.key;
  const paces = pacesOf(profile);
  const stats = runStats(data.runLogs);
  const better = betterLevel(profile, data.runLogs);
  const plannedWeekKm = (plan.weeks[plan.current] || []).reduce((a, x) => a + x.km, 0);
  const km1 = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
  const weekSessions = plan.weeks[plan.current] || [];
  const apple = next ? appleSteps(next) : null;
  const logs = [...data.runLogs].reverse();

  const empty = () => ({ distance: '', duration: '', hr: '', cal: '', feel: null, when: toLocalInput() });
  const fill = (r) => {
    if (!r.found) {
      setDraftNote('Je n\'ai pas réussi à lire les valeurs. Saisis-les à la main, ou colle le texte de la capture.');
      setDraft(empty());
      return;
    }
    setDraftNote(r.found < 2 ? 'Je n\'ai lu qu\'une partie des valeurs. Complète et vérifie avant d\'enregistrer.' : 'Vérifie les valeurs lues sur ta capture avant d\'enregistrer.');
    setDraft({
      distance: r.distance_km != null ? String(r.distance_km).replace('.', ',') : '',
      duration: r.duration_s != null ? hms(r.duration_s) : '',
      hr: r.avg_hr != null ? String(r.avg_hr) : '',
      cal: r.calories != null ? String(r.calories) : '',
      feel: null,
      when: toLocalInput(r.done_at),
    });
  };

  const readCapture = async (file) => {
    if (!file) return;
    setReading(true);
    try {
      fill(await readRunScreenshot(file));
    } catch {
      fill({ found: 0 });
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const pasteText = async () => {
    const text = await ui.prompt({ title: 'Coller le texte de la capture', message: 'Dans Photos, appuie longuement sur le texte de la capture, « Tout sélectionner », « Copier », puis colle ici.', placeholder: 'Texte copié', ok: 'Lire' });
    if (text) fill(parseRunText(text));
  };

  const manual = () => { setDraftNote(null); setDraft(empty()); };

  const saveResult = async (f) => {
    try {
      await saveRunLog({
        done_at: new Date(f.when).toISOString(), session_key: next?.key || null, kind: next?.kind || null,
        distance_km: f.km, duration_s: f.secs, avg_hr: f.hr ? Number(f.hr) : null, calories: f.cal ? Number(f.cal) : null,
        feel: f.feel, source: draftNote && !draftNote.includes('pas réussi') ? 'screenshot' : 'manual',
      });
      await data.refresh();
      setDraft(null);
      setPicked(null);
      ui.notify('Course enregistrée, plan mis à jour');
    } catch (e) { ui.notify(e.message || String(e)); }
  };

  return (
    <main className="screen">
      <GlassHeader eyebrow={`${GOALS[profile.goal].label}, semaine ${Math.min(plan.current + 1, plan.total)} sur ${plan.total}`} title="Course" />

      <div className="pad stack" style={{ gap: 12, paddingTop: 10 }}>
        {draft && <ResultForm draft={draft} session={next} note={draftNote} onSave={saveResult} onCancel={() => setDraft(null)} />}

        {!draft && plan.finished && (
          <div className="card stack" style={{ gap: 8 }}>
            <span className="display" style={{ fontSize: 22 }}>Plan terminé</span>
            <span className="small muted">Tu as fait toutes les séances prévues. Définis un nouvel objectif pour continuer.</span>
            <button className="btn primary" onClick={() => setEditing(true)}>Nouvel objectif</button>
          </div>
        )}

        {!draft && next && (
          <>
            <div className="card hero" style={{ gap: 8 }}>
              <span className="label">{isPicked ? `Séance choisie, semaine ${next.week + 1}` : 'Prochaine sortie'}</span>
              <span className="display">{next.title}</span>
              <div className="session-stats" style={{ padding: 0 }}>
                <span><b>{next.mins}</b>min</span>
                <span><b>≈ {String(next.km).replace('.', ',')}</b>km</span>
              </div>
              {(next.recover || next.taper) && <span className="small" style={{ fontWeight: 600 }}>{next.taper ? 'Semaine d\'affûtage : on garde les jambes fraîches.' : 'Semaine de récupération : volume réduit.'}</span>}
            </div>

            <section className="card stack" style={{ gap: 10 }} aria-label="Profil de la séance">
              <span className="label">La séance en un coup d'œil</span>
              <RunChart session={next} />
            </section>

            <section className="card stack" style={{ gap: 12 }} aria-label="À saisir dans Exercice">
              <div className="stack" style={{ gap: 2 }}>
                <span className="label">À saisir dans Exercice</span>
                <span className="small muted">{apple.where}</span>
              </div>
              <ol className="stack" style={{ gap: 10, margin: 0, padding: 0, listStyle: 'none' }}>
                {apple.steps.map((s, i) => (
                  <li key={i} className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
                    <span className="display" style={{ minWidth: 26, height: 26, borderRadius: 8, background: 'var(--chip)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>{i + 1}</span>
                    <div className="grow stack" style={{ gap: 1 }}>
                      <span style={{ fontWeight: 600 }}>{s.title}</span>
                      <span className="small muted">{s.detail}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            {plan.note && <div className="warn"><span className="xs" style={{ fontWeight: 700 }}>Jambes</span><span className="small" style={{ lineHeight: 1.4 }}>{plan.note}</span></div>}
            {plan.adj.message && !isPicked && <div className="card"><span className="small">{plan.adj.message}</span></div>}
            {better && (
              <div className="card stack" style={{ gap: 8 }}>
                <span style={{ fontWeight: 600 }}>Tu as progressé</span>
                <span className="small muted">Ta course du {fmtDay(new Date(better.log.done_at))} équivaut à {hms(better.eq5)} sur 5 km, contre {hms(better.ref5)} enregistré. Je peux recalculer tes allures sur ce niveau.</span>
                <button className="btn" onClick={() => saveProfile({ ...profile, ref_distance_km: 5, ref_time_s: Math.round(better.eq5) })}>Mettre à jour mes allures</button>
              </div>
            )}

            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => readCapture(e.target.files?.[0])} />
            <button className="btn primary big" disabled={reading} onClick={() => fileRef.current?.click()}>
              <Icon name="plus" size={18} />{reading ? 'Lecture de la capture…' : 'J\'ai couru : envoyer la capture'}
            </button>
            <div className="grid2">
              <button className="btn" onClick={pasteText}>Coller le texte</button>
              <button className="btn" onClick={manual}>Saisir à la main</button>
            </div>
            <span className="xs muted" style={{ textAlign: 'center' }}>La capture est lue sur ton téléphone. Elle n'est envoyée nulle part.</span>
          </>
        )}

        {!draft && (
          <>
            <div className="between" style={{ paddingTop: 12 }}>
              <span className="label">Cette semaine</span>
              <span className="xs muted">{weekSessions.filter((s) => s.done).length} sur {weekSessions.length} faites</span>
            </div>
            {weekSessions.map((s) => <SessionRow key={s.key} s={s} active={next?.key === s.key} onPick={() => { setPicked(s.key); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />)}

            <section className="card stack" style={{ gap: 12, marginTop: 12 }} aria-label="Tes allures">
              <div className="between">
                <span className="label">Tes allures</span>
                <span className="xs muted">par km</span>
              </div>
              <div className="stack" style={{ gap: 8 }}>
                {[['Facile', paces.easy * plan.adj.paceScale, 'footings, récupération'], ['Seuil', paces.tempo * plan.adj.paceScale, 'soutenu mais tenable'], ['Rapide', paces.fast * plan.adj.paceScale, 'fractionné']].map(([l, p, d]) => (
                  <div key={l} className="between">
                    <span><b>{l}</b> <span className="xs muted">{d}</span></span>
                    <span className="display" style={{ fontSize: 20, fontWeight: 700 }}>{mmss(p)}</span>
                  </div>
                ))}
              </div>
              <span className="small muted">Temps estimé aujourd'hui sur {GOALS[profile.goal].label === 'Forme' ? '5 km' : GOALS[profile.goal].label} : <b style={{ color: 'var(--text)' }}>{hms(goalPrediction(profile))}</b></span>
            </section>

            {stats.count > 0 && (
              <section className="card stack" style={{ gap: 12 }} aria-label="Ton suivi">
                <span className="label">Ton suivi</span>
                <div className="session-stats" style={{ padding: 0, flexWrap: 'wrap', rowGap: 6 }}>
                  <span><b>{stats.count}</b>sortie{stats.count > 1 ? 's' : ''}</span>
                  <span><b>{km1(stats.totalKm)}</b>km au total</span>
                  <span><b>{mmss(stats.avgPace)}</b>/km en moyenne</span>
                </div>
                <Bars values={stats.weeks.map((w) => w.km)} labels={stats.weeks.map((w) => `${w.from.getDate()}/${w.from.getMonth() + 1}`)} height={72} highlight={[stats.weeks.length - 1]} label="Kilomètres par semaine sur 8 semaines" />
                <span className="small muted">Cette semaine : {km1(stats.weekKm)} km sur {km1(plannedWeekKm)} prévus. Plus longue sortie : {km1(stats.longest)} km.</span>
              </section>
            )}

            <button className="btn" aria-expanded={showPlan} onClick={() => setShowPlan(!showPlan)}>{showPlan ? 'Masquer le plan complet' : `Voir le plan complet (${plan.total} semaines)`}</button>
            {showPlan && plan.weeks.map((wk, i) => (
              <div key={i} className="stack" style={{ gap: 8 }}>
                <div className="between" style={{ paddingTop: 8 }}>
                  <span className="label">Semaine {i + 1}{i === plan.current ? ' (en cours)' : ''}{wk[0]?.recover ? ' · récupération' : wk[0]?.taper ? ' · affûtage' : ''}</span>
                  <span className="xs muted">≈ {km1(wk.reduce((a, x) => a + x.km, 0))} km</span>
                </div>
                {wk.map((s) => <SessionRow key={s.key} s={s} active={next?.key === s.key} onPick={() => { setPicked(s.key); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />)}
              </div>
            ))}

            {!!logs.length && (
              <>
                <span className="label" style={{ paddingTop: 12 }}>Dernières courses</span>
                {logs.slice(0, 6).map((l) => (
                  <div key={l.id} className="card row" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
                    <div className="grow stack" style={{ gap: 1 }}>
                      <span style={{ fontWeight: 600 }}>{String(Number(l.distance_km)).replace('.', ',')} km en {hms(l.duration_s)}</span>
                      <span className="xs muted">{fmtDay(new Date(l.done_at))} · {mmss(l.duration_s / Number(l.distance_km))} /km{l.avg_hr ? ` · ${l.avg_hr} bpm` : ''}{l.feel ? ` · ressenti ${l.feel}/5` : ''}</span>
                    </div>
                    <button className="icon-btn" aria-label="Supprimer cette course" onClick={async () => {
                      if (!(await ui.confirm({ title: 'Supprimer cette course ?', message: 'Le plan sera recalculé.', ok: 'Supprimer', danger: true }))) return;
                      try { await deleteRunLog(l.id); await data.refresh(); } catch (e) { ui.notify(e.message || String(e)); }
                    }}><Icon name="close" size={16} /></button>
                  </div>
                ))}
              </>
            )}
            <button className="btn" style={{ marginTop: 8 }} onClick={() => setEditing(true)}>Modifier mon objectif</button>
          </>
        )}
      </div>
    </main>
  );
}
