import { useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase.js';
import { useData, saveRunProfile, saveRunLog, deleteRunLog } from '../data.jsx';
import { useUi } from '../ui.jsx';
import { Icon } from '../components.jsx';
import { fmtDay } from '../lib/stats.js';
import { GOALS, buildPlan, appleSteps, segments, intensityOf, mmss, hms, parseDuration, fmtMin, TYPE_LABEL, paceRange } from '../lib/running.js';

const FILL = {
  warm: 'var(--rest-fill)', cool: 'var(--rest-fill)', rest: 'var(--rest-fill)',
  easy: 'color-mix(in srgb, var(--brand) 45%, var(--card))',
  steady: 'color-mix(in srgb, var(--brand) 65%, var(--card))',
  tempo: 'color-mix(in srgb, var(--brand) 85%, var(--card))',
  fast: 'var(--brand)',
};
const today = () => new Date().toISOString().slice(0, 10);

// The session drawn as a profile: width = time, height = effort.
function RunChart({ session }) {
  const segs = segments(session);
  const total = segs.reduce((a, s) => a + s.mins, 0);
  const W = 320, H = 110, GAP = 1.5;
  let x = 0;
  const kinds = [...new Set(segs.map((s) => s.type))];
  return (
    <div className="stack" style={{ gap: 10 }}>
      <svg viewBox={`0 0 ${W} ${H + 18}`} width="100%" role="img" aria-label={`Séance de ${session.mins} minutes : ${kinds.map((k) => TYPE_LABEL[k]).join(', ')}`} style={{ display: 'block' }}>
        {segs.map((s, i) => {
          const w = (s.mins / total) * W;
          const h = intensityOf(s.type) * H;
          const rect = <rect key={i} x={x + GAP / 2} y={H - h} width={Math.max(1, w - GAP)} height={h} rx={3} fill={FILL[s.type]} opacity={s.type === 'rest' ? 0.75 : 1} />;
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
    </div>
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
      <div className="head"><span className="small muted">Plan de course</span><h1 className="title">Ton objectif</h1></div>
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

async function toJpegBase64(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1500 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85).split(',')[1];
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
  const profile = data.runProfile;

  const plan = useMemo(() => (profile ? buildPlan(profile, data.runLogs, data.workouts) : null), [profile, data.runLogs, data.workouts]);

  const saveProfile = async (p) => {
    try { await saveRunProfile(p); await data.refresh(); setEditing(false); ui.notify('Plan enregistré'); } catch (e) { ui.notify(e.message || String(e)); }
  };

  if (!profile || editing) return <Setup initial={profile} onSave={saveProfile} onCancel={profile ? () => setEditing(false) : null} />;

  const next = plan.next;
  const weekSessions = plan.weeks[plan.current] || [];
  const apple = next ? appleSteps(next) : null;
  const logs = [...data.runLogs].reverse();

  const readCapture = async (file) => {
    if (!file) return;
    setReading(true);
    try {
      const image = await toJpegBase64(file);
      const { data: res, error } = await supabase.functions.invoke('read-run-screenshot', { body: { image, media_type: 'image/jpeg' } });
      if (error || !res?.result) {
        setDraftNote('Je n\'ai pas pu lire la capture. Saisis les valeurs à la main.');
        setDraft({ distance: '', duration: '', hr: '', cal: '', feel: null, when: toLocalInput() });
        return;
      }
      const r = res.result;
      setDraftNote('Vérifie les valeurs lues sur ta capture avant d\'enregistrer.');
      setDraft({
        distance: r.distance_km != null ? String(r.distance_km).replace('.', ',') : '',
        duration: r.duration_s != null ? hms(r.duration_s) : '',
        hr: r.avg_hr != null ? String(r.avg_hr) : '',
        cal: r.calories != null ? String(r.calories) : '',
        feel: null,
        when: toLocalInput(r.done_at),
      });
    } catch {
      setDraftNote('Je n\'ai pas pu lire la capture. Saisis les valeurs à la main.');
      setDraft({ distance: '', duration: '', hr: '', cal: '', feel: null, when: toLocalInput() });
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const manual = () => { setDraftNote(null); setDraft({ distance: '', duration: '', hr: '', cal: '', feel: null, when: toLocalInput() }); };

  const saveResult = async (f) => {
    try {
      await saveRunLog({
        done_at: new Date(f.when).toISOString(), session_key: next?.key || null, kind: next?.kind || null,
        distance_km: f.km, duration_s: f.secs, avg_hr: f.hr ? Number(f.hr) : null, calories: f.cal ? Number(f.cal) : null,
        feel: f.feel, source: draftNote?.startsWith('Vérifie') ? 'screenshot' : 'manual',
      });
      await data.refresh();
      setDraft(null);
      ui.notify('Course enregistrée, plan mis à jour');
    } catch (e) { ui.notify(e.message || String(e)); }
  };

  return (
    <main className="screen">
      <div className="head">
        <span className="small muted">{GOALS[profile.goal].label} · semaine {Math.min(plan.current + 1, plan.total)} sur {plan.total}</span>
        <h1 className="title">Course</h1>
      </div>

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
              <span className="label">Prochaine sortie</span>
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
            {plan.adj.message && <div className="card"><span className="small">{plan.adj.message}</span></div>}

            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => readCapture(e.target.files?.[0])} />
            <button className="btn primary big" disabled={reading} onClick={() => fileRef.current?.click()}>
              <Icon name="plus" size={18} />{reading ? 'Lecture de la capture…' : 'J\'ai couru : envoyer la capture'}
            </button>
            <button className="btn" onClick={manual}>Saisir à la main</button>
          </>
        )}

        {!draft && (
          <>
            <div className="between" style={{ paddingTop: 12 }}>
              <span className="label">Cette semaine</span>
              <span className="xs muted">{weekSessions.filter((s) => s.done).length} sur {weekSessions.length} faites</span>
            </div>
            {weekSessions.map((s) => (
              <div key={s.key} className="card row" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, background: s.done ? 'var(--done)' : undefined, borderColor: s.done ? 'var(--done-line)' : undefined }}>
                <span style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 13, background: s.done ? 'var(--ok)' : 'var(--chip)', color: 'var(--on-ok)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.done && <Icon name="check" size={14} width={3} />}</span>
                <div className="grow stack" style={{ gap: 1 }}>
                  <span style={{ fontWeight: 600 }}>{s.title}</span>
                  <span className="xs muted">{s.mins} min · ≈ {String(s.km).replace('.', ',')} km{s.blocks.length === 1 ? ` · ${paceRange(s.blocks[0].pace)} /km` : ''}</span>
                </div>
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
