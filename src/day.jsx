import { useState } from 'react';
import { useModal } from './modal.js';
import { useData, deleteWorkout, renameWorkout, deleteRunLog } from './data.jsx';
import { useUi } from './ui.jsx';
import { Icon, ExerciseImage } from './components.jsx';
import { SessionAnalysis } from './analysis.jsx';
import { fmtKg, fmtInt, sameDay, isWork, isPlausible, volumeOf } from './lib/stats.js';
import { mmss, hms, vdotOf, raceTime } from './lib/running.js';
import { isWalk, logTitle, fmtSpeed, fmtIncline } from './lib/treadmill.js';
import { ShareSheet } from './social.jsx';

const ACTIVITY_LOW = { incline_walk: 'marche inclinée', walk: 'marche dehors', treadmill: 'course sur tapis' };

const volume = (w) => volumeOf(w.sets);

// Everything about one calendar day: gym sessions, runs done, run planned.
export function dayInfo(data, date, planned = [], now = new Date()) {
  const gym = data.workouts.filter((w) => sameDay(w.start, date));
  const runs = data.allLogs.filter((l) => sameDay(new Date(l.done_at), date));
  const plan = planned.find((s) => sameDay(s.date, date) && !s.done) || null;
  const past = date < new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return { date, gym, runs, plan, past, today: sameDay(date, now), run: runs.length > 0 };
}

export const dayKind = (d) => (d.gym.length ? 'gym' : d.run ? 'run' : d.plan && !d.past ? 'planned' : 'rest');

// The selected day of the week strip: what was done, or what is planned.
// gymPlan: the programme's session planned that day (not done yet); advice: the coach's word.
export function DayDetail({ d, onRun, onGym, onRunLog, hideRunLink = false, gymPlan = null, onGymPlan, advice = null }) {
  if (!d) return null;
  const title = d.today ? "Aujourd'hui" : d.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const empty = !d.gym.length && !d.runs.length && !(d.plan && !d.past) && !gymPlan;
  return (
    <div className="card day-detail" aria-live="polite">
      <span className="xs muted" style={{ textTransform: 'capitalize', fontWeight: 600 }}>{title}</span>
      {d.gym.map((w) => {
        const work = w.sets.filter((x) => isWork(x) && isPlausible(x));
        return (
          <button key={w.id} className="day-row" onClick={() => onGym(w.id)}>
            <span className="day-ic k-gym"><Icon name="dumbbell" size={18} /></span>
            <span className="grow stack" style={{ gap: 1 }}>
              <span style={{ fontWeight: 650 }}>{w.title}</span>
              <span className="xs muted">{work.length} série{work.length > 1 ? "s" : ""}, {fmtInt(volumeOf(w.sets))} kg{w.end ? `, ${Math.round((w.end - w.start) / 60000)} min` : ''}</span>
            </span>
            <Icon name="chevron" size={18} />
          </button>
        );
      })}
      {d.runs.map((l) => (
        <button key={l.id} className="day-row" onClick={() => onRunLog?.(l.id)}>
          <span className="day-ic k-run"><Icon name="run" size={18} /></span>
          <span className="grow stack" style={{ gap: 1 }}>
            <span style={{ fontWeight: 650 }}>{logTitle(l)}, {fmtKg(Number(l.distance_km))} km</span>
            <span className="xs muted">{hms(l.duration_s)}, {isWalk(l) ? `${l.elevation_m ? `${Math.round(l.elevation_m)} m D+` : fmtSpeed(Number(l.speed_kmh) || 0)}` : `${mmss(l.duration_s / Number(l.distance_km))} /km`}{l.avg_hr ? `, ${l.avg_hr} bpm` : ''}</span>
          </span>
          <Icon name="chevron" size={18} />
        </button>
      ))}
      {d.plan && !d.past && (
        <button className="day-row" onClick={() => onRun(d.plan.key)} disabled={hideRunLink}>
          <span className="day-ic k-planned"><Icon name="run" size={18} /></span>
          <span className="grow stack" style={{ gap: 1 }}>
            <span style={{ fontWeight: 650 }}>{d.plan.title}</span>
            <span className="xs muted">Course prévue : {d.plan.mins} min, environ {fmtKg(d.plan.km)} km</span>
          </span>
          {!hideRunLink && <span className="xs" style={{ color: 'var(--accent)', fontWeight: 650 }}>Voir</span>}
        </button>
      )}
      {gymPlan && (
        <button className="day-row" onClick={onGymPlan}>
          <span className="day-ic k-gym" style={{ opacity: 0.75 }}><Icon name="dumbbell" size={18} /></span>
          <span className="grow stack" style={{ gap: 1 }}>
            <span style={{ fontWeight: 650 }}>{gymPlan.name}</span>
            <span className="xs muted">Muscu prévue : {gymPlan.detail}</span>
          </span>
          <span className="xs" style={{ color: 'var(--accent)', fontWeight: 650 }}>{d.today ? 'Démarrer' : 'Voir'}</span>
        </button>
      )}
      {empty && (
        <div className="day-row">
          <span className="day-ic k-rest"><Icon name="moon" size={17} /></span>
          <span className="small muted">{d.past ? 'Jour de repos.' : d.today ? 'Rien de prévu aujourd\'hui.' : 'Rien de prévu : jour de repos.'}</span>
        </div>
      )}
      {advice && (
        <div className="row small" style={{ gap: 8, alignItems: 'flex-start', lineHeight: 1.45, paddingTop: 2 }}>
          <Icon name="spark" size={16} /><span className="grow">{advice}</span>
        </div>
      )}
    </div>
  );
}


// A past gym session: stats, each exercise with its sets, rename or delete.
export function WorkoutSheet({ id, onClose }) {
  const data = useData();
  const ui = useUi();
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState(false);
  const w = id ? data.workouts.find((x) => x.id === id) : null;
  const ref = useModal(!!w, onClose);
  if (!w) return null;
  const exercises = [...new Set(w.sets.map((s) => s.exercise))].map((name) => ({ name, sets: w.sets.filter((s) => s.exercise === name) }));
  const records = exercises.filter((e) => { const st = data.exercises.get(e.name); return st?.best && st.best.date.getTime() === w.start.getTime() && st.history.length > 1; }).length;
  const remove = async () => {
    if (!(await ui.confirm({ title: 'Supprimer cette séance ?', message: `${w.title}, ${w.start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}. Ses séries disparaissent aussi de tes progrès et records.`, ok: 'Supprimer', danger: true }))) return;
    setBusy(true);
    try { await deleteWorkout(w.id); await data.refresh(); onClose(); ui.notify('Séance supprimée'); } catch (e) { ui.notify(e.message || String(e)); } finally { setBusy(false); }
  };
  const rename = async () => {
    const t = await ui.prompt({ title: 'Nom de la séance', value: w.title, ok: 'Renommer' });
    if (!t || t === w.title) return;
    try { await renameWorkout(w.id, t.trim()); await data.refresh(); ui.notify('Séance renommée'); } catch (e) { ui.notify(e.message || String(e)); }
  };
  return (
    <>
        <div className="overlay" onClick={() => onClose()}>
          <div ref={ref} tabIndex={-1} className="sheet wsheet" role="dialog" aria-modal="true" aria-label={w.title} onClick={(e) => e.stopPropagation()}>
            <span className="sheet-grip" />
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <div className="grow stack" style={{ gap: 4 }}>
                <span className="xs muted" style={{ textTransform: 'capitalize', fontWeight: 600 }}>{w.start.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                <span className="display">{w.title}</span>
              </div>
              <button className="icon-btn" aria-label="Fermer" onClick={() => onClose()}><Icon name="close" /></button>
            </div>

            <div className="wstats">
              {w.end && <div><b className="display">{Math.round((w.end - w.start) / 60000)}</b><span>min</span></div>}
              {(() => { const n = w.sets.filter((x) => isWork(x)).length; return <div><b className="display">{n}</b><span>série{n > 1 ? 's' : ''}</span></div>; })()}
              <div><b className="display">{fmtInt(volume(w))}</b><span>kg</span></div>
              {records > 0 && <div className="pr"><b className="display">{records}</b><span>record{records > 1 ? 's' : ''}</span></div>}
            </div>

            <div className="stack" style={{ gap: 10 }}>
              {exercises.map((e) => {
                const stat = data.exercises.get(e.name);
                const pr = stat?.best && stat.best.date.getTime() === w.start.getTime() && stat.history.length > 1;
                let n = 0;
                return (
                  <section key={e.name} className="wex">
                    <div className="row" style={{ gap: 12 }}>
                      <ExerciseImage name={e.name} size={44} radius={12} />
                      <div className="grow stack" style={{ gap: 2, minWidth: 0 }}>
                        <span style={{ fontWeight: 650, lineHeight: 1.25 }}>{e.name}</span>
                        <span className="xs muted">{e.sets.filter((x) => isWork(x)).length} série{e.sets.filter((x) => isWork(x)).length > 1 ? 's' : ''}{pr ? '' : stat?.best ? `, record ${fmtKg(stat.best.kg)} kg × ${stat.best.reps}` : ''}</span>
                      </div>
                      {pr && <span className="tag" style={{ background: 'var(--ok)', color: 'var(--on-ok)' }}>Record</span>}
                    </div>
                    <div className="wsets">
                      {e.sets.map((x, i) => {
                        const warm = x.set_type === 'warmup';
                        const label = warm ? 'É' : String(++n);
                        return (
                          <div key={i} className={`wset${warm ? ' warm' : ''}`}>
                            <span className="wn">{label}</span>
                            <span><b className="display">{fmtKg(x.weight_kg)}</b> kg × <b className="display">{x.reps}</b></span>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>

            <SessionAnalysis workout={w} />

            <button className="btn" onClick={() => setShare(true)}><Icon name="users" size={16} />Partager avec mes amis</button>
            <div className="row" style={{ gap: 8, paddingTop: 4 }}>
              <button className="btn grow" onClick={rename}><Icon name="edit" size={16} />Renommer</button>
              <button className="btn grow" style={{ color: 'var(--danger)', background: 'var(--danger-bg)' }} disabled={busy} onClick={remove}><Icon name="trash" size={16} />Supprimer</button>
            </div>
          </div>
        </div>
      {share && w && <ShareSheet source={{ kind: 'gym', w }} data={data} onClose={() => setShare(false)} />}
    </>
  );
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// A full month, Monday first. Each day shows what was done (or planned); tap a day for its detail.
export function MonthCalendar({ planned = [] }) {
  const data = useData();
  const now = new Date();
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [sel, setSel] = useState(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const [openW, setOpenW] = useState(null);
  const [openR, setOpenR] = useState(null);
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7;
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const days = Array.from({ length: count }, (_, i) => dayInfo(data, new Date(month.getFullYear(), month.getMonth(), i + 1), planned, now));
  const gymN = days.reduce((a, d) => a + d.gym.length, 0);
  const runN = days.reduce((a, d) => a + d.runs.length, 0);
  const km = days.reduce((a, d) => a + d.runs.reduce((b, l) => b + Number(l.distance_km || 0), 0), 0);
  const selInfo = dayInfo(data, sel, planned, now);
  const go = (d) => setMonth(new Date(month.getFullYear(), month.getMonth() + d, 1));
  const label = `${MONTHS[month.getMonth()]} ${month.getFullYear()}`;

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="card cal">
        <div className="row" style={{ gap: 8 }}>
          <button className="icon-btn" aria-label="Mois précédent" onClick={() => go(-1)} style={{ width: 38, height: 38 }}><Icon name="back" size={18} /></button>
          <span className="grow" style={{ textAlign: 'center', fontWeight: 700, fontSize: 17, textTransform: 'capitalize' }}>{label}</span>
          <button className="icon-btn" aria-label="Mois suivant" onClick={() => go(1)} style={{ width: 38, height: 38 }}><Icon name="chevron" size={18} /></button>
        </div>
        <div className="cal-grid" role="grid" aria-label={`Calendrier de ${label}`}>
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((l, i) => <span key={i} className="cal-h">{l}</span>)}
          {Array.from({ length: lead }, (_, i) => <span key={`e${i}`} />)}
          {days.map((d) => {
            const k = dayKind(d);
            const isSel = sameDay(d.date, sel);
            const what = [d.gym.length && 'muscu', d.run && 'course', !d.gym.length && !d.run && d.plan && !d.past && 'course prévue'].filter(Boolean).join(' et ') || 'repos';
            return (
              <button key={d.date.getDate()} className={`cal-d k-${k}${d.today ? ' today' : ''}${isSel ? ' sel' : ''}`} onClick={() => {
                  setSel(d.date);
                  const items = d.gym.length + d.runs.length;
                  if (items === 1) { if (d.gym.length) setOpenW(d.gym[0].id); else setOpenR(d.runs[0].id); }
                  else document.getElementById('cal-detail')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }}
                aria-pressed={isSel} aria-label={`${d.date.getDate()} ${MONTHS[month.getMonth()]} : ${what}`}>
                <span className="cal-n">{d.date.getDate()}</span>
                {k !== 'rest' && <span className="cal-i"><Icon name={k === 'gym' ? 'dumbbell' : 'run'} size={13} width={2.4} /></span>}
                {k === 'gym' && d.run && <span className="cal-b" />}
              </button>
            );
          })}
        </div>
        <div className="row xs muted" style={{ gap: 14, flexWrap: 'wrap' }}>
          <span><b className="display" style={{ color: 'var(--text)', fontSize: 15 }}>{gymN}</b> séance{gymN > 1 ? 's' : ''} de salle</span>
          <span><b className="display" style={{ color: 'var(--text)', fontSize: 15 }}>{runN}</b> course{runN > 1 ? 's' : ''}{km ? `, ${fmtKg(km)} km` : ''}</span>
        </div>
      </div>
      {(selInfo.gym.length > 0 || selInfo.runs.length > 0 || (selInfo.plan && !selInfo.past)) && (
        <div id="cal-detail" style={{ scrollMarginBottom: 110 }}><DayDetail d={selInfo} onRun={() => {}} onGym={(id) => setOpenW(id)} onRunLog={(id) => setOpenR(id)} hideRunLink /></div>
      )}
      <WorkoutSheet id={openW} onClose={() => setOpenW(null)} />
      <RunSheet id={openR} onClose={() => setOpenR(null)} />
    </div>
  );
}

// One logged run: the numbers, its pace and equivalent level, and delete.
export function RunSheet({ id, onClose }) {
  const data = useData();
  const ui = useUi();
  const l = id ? data.allLogs.find((x) => x.id === id) : null;
  const ref = useModal(!!l, onClose);
  const [share, setShare] = useState(false);
  if (!l) return null;
  const km = Number(l.distance_km);
  const date = new Date(l.done_at);
  const walk = isWalk(l);
  const v = !walk && km >= 3 && l.duration_s >= 600 ? vdotOf(km, l.duration_s) : null;
  const remove = async () => {
    if (!(await ui.confirm(walk ? { title: 'Supprimer cette séance ?', message: 'Elle disparaît de ton historique.', ok: 'Supprimer', danger: true } : { title: 'Supprimer cette course ?', message: 'Elle disparaît de tes statistiques et le plan est recalculé.', ok: 'Supprimer', danger: true }))) return;
    try { await deleteRunLog(l.id); await data.refresh(); onClose(); ui.notify(walk ? 'Séance supprimée' : 'Course supprimée'); } catch (e) { ui.notify(e.message || String(e)); }
  };
  const speed = Number(l.speed_kmh) || (l.duration_s ? (km / l.duration_s) * 3600 : 0);
  const tiles = [
    [fmtKg(km), 'km'], [hms(l.duration_s), 'durée'],
    ...(walk || l.activity === 'treadmill' ? [[fmtSpeed(speed).replace(' km/h', ''), 'km/h moy.']] : [[mmss(l.duration_s / km), '/km']]),
    ...(l.incline_pct != null && Number(l.incline_pct) ? [[fmtIncline(Number(l.incline_pct)).replace(' %', ''), '% de pente']] : []),
    ...(l.elevation_m ? [[String(Math.round(l.elevation_m)), 'm D+']] : []),
    ...(l.avg_hr ? [[String(l.avg_hr), 'bpm moyen']] : []), ...(l.calories ? [[String(l.calories), 'kcal']] : []), ...(v ? [[fmtKg(Math.round(v * 10) / 10), 'VDOT']] : []),
  ];
  return (
    <div className="overlay" onClick={onClose}>
      <div ref={ref} tabIndex={-1} className="sheet wsheet" role="dialog" aria-modal="true" aria-label={logTitle(l)} onClick={(e) => e.stopPropagation()}>
        <span className="sheet-grip" />
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="grow stack" style={{ gap: 4 }}>
            <span className="xs muted" style={{ textTransform: 'capitalize', fontWeight: 600 }}>{date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, {date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
            <span className="display">{logTitle(l)}</span>
          </div>
          <button className="icon-btn" aria-label="Fermer" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div className="wstats" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {tiles.map(([val, lab]) => <div key={lab}><b className="display">{val}</b><span>{lab}</span></div>)}
        </div>
        {v && <span className="small muted" style={{ lineHeight: 1.45 }}>À ce niveau, temps équivalents : 5 km en {hms(raceTime(v, 5))}, 10 km en {hms(raceTime(v, 10))}, semi en {hms(raceTime(v, 21.0975))}. Valable si la course était faite à fond ; pour un footing, ton vrai niveau est plus haut.</span>}
        <span className="xs muted">{l.source === 'strava' ? 'Importée de Strava' : l.source === 'screenshot' ? 'Lue sur une capture' : l.source === 'watch' ? 'Enregistrée avec l\'Apple Watch' : l.source === 'timer' ? 'Enregistrée avec le minuteur' : l.source === 'apple-health' ? 'Importée d\'Apple Santé' : 'Saisie à la main'}{walk && l.activity ? `, ${ACTIVITY_LOW[l.activity]}` : ''}{l.feel ? `, ressenti ${l.feel}/5` : ''}</span>
        <button className="btn" onClick={() => setShare(true)}><Icon name="users" size={16} />Partager avec mes amis</button>
        <button className="btn" style={{ color: 'var(--danger)', background: 'var(--danger-bg)' }} onClick={remove}><Icon name="trash" size={16} />Supprimer</button>
      </div>
      {share && <ShareSheet source={{ kind: 'run', l }} data={data} onClose={() => setShare(false)} />}
    </div>
  );
}
