import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData, saveRoutine } from '../data.jsx';
import { useSession, deloadState, deloadActive, startDeload, stopDeload, deferDeload } from '../session.jsx';
import { deloadAdvice } from '../lib/coach.js';
import { fmtDay, fmtKg, sameDay, startOfWeek, titleKey } from '../lib/stats.js';
import { muscleOf } from '../lib/exercises.js';
import { adviceOfDay } from '../lib/programs.js';
import { routineFromHistory, nextSession } from '../lib/routines.js';
import { isWalk } from '../lib/treadmill.js';
import { Icon, ExerciseImage, GlassHeader, SectionHead, StatGrid, Shortcut } from '../components.jsx';
import { KMark } from '../brand.jsx';
import { buildPlan, segments, intensityOf, mainType, mmss, TYPE_LABEL, structureText } from '../lib/running.js';
import { DayDetail, WorkoutSheet, RunSheet, dayInfo } from '../day.jsx';

// "aujourd'hui", "hier", "il y a 3 jours", then the date.
const ago = (d) => {
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  return days <= 0 ? "aujourd'hui" : days === 1 ? 'hier' : days < 7 ? `il y a ${days} jours` : `le ${fmtDay(new Date(d))}`;
};
const s_ = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
const firstName = (user) => (user?.user_metadata?.name || '').split(' ')[0] || 'Kilian';
const fmtDuration = (min) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')}` : `${Math.round(min)} min`);
// "Aujourd'hui", "Demain", or the weekday.
const whenOf = (date, now) => (sameDay(date, now) ? "Aujourd'hui" : sameDay(date, new Date(now.getTime() + 86400000)) ? 'Demain' : date.toLocaleDateString('fr-FR', { weekday: 'long' }).replace(/^./, (c) => c.toUpperCase()));

export default function Accueil({ user }) {
  const data = useData();
  const session = useSession();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const today = new Date();
  const run = data.runProfile ? buildPlan(data.runProfile, data.runLogs, data.workouts) : null;

  // With a programme: today's session; else the least recently done routine.
  const { routines, next, program } = nextSession(data);
  // Today: the run of the plan, the strength session of the programme, and one coach's word.
  const todayRun = run ? run.weeks.flat().find((s) => s.today && !s.done && !s.off) || null : null;
  const todayGym = program ? program.days.find((x) => x?.today) || null : null;
  const nextIsToday = !!(program && next && todayGym && !todayGym.done && todayGym.routine.id === next.id);
  const nextDay = program && next ? program.days.find((x) => x && x.routine.id === next.id && !x.done) : null;
  const tomorrow = new Date(today.getTime() + 86400000);
  const tomorrowRun = run ? run.weeks.flat().find((s) => !s.off && sameDay(s.date, tomorrow)) : null;
  const legsYesterday = data.workouts.some((w) => today - w.start < 30 * 3600000 && !sameDay(w.start, today) && w.sets.filter((s) => muscleOf(s.exercise) === 'Jambes').length >= 6);
  const advice0 = adviceOfDay({ date: today, run: todayRun, gym: todayGym && !todayGym.done ? todayGym.dayId : null, tomorrowHard: tomorrowRun && (tomorrowRun.kind === 'quality' || tomorrowRun.kind === 'long'), legsYesterday, pause: run?.pause || null });
  const last = data.workouts[0] || null;

  // The next session card: today's programme session first, then today's run, then the next
  // strength session, then the next run. Blue for musculation, green for course.
  const heroRun = !session.active && !nextIsToday && (todayRun || (!next && run?.next)) ? (todayRun || run.next) : null;
  const heroGym = !session.active && !heroRun ? next : null;

  // What happened, or is planned, on each day of the week: gym, run, or rest.
  const planned = run ? run.weeks.flat().filter((s) => !s.off) : [];
  const weekDays = data.weekDays.map((d, i) => {
    const info = dayInfo(data, d.date, planned);
    const pg = program?.days[i];
    return { ...d, ...info, gymPlanned: !!(pg && !pg.done && !info.gym.length && !info.past) };
  });
  const [selDay, setSelDay] = useState(() => Math.max(0, data.weekDays.findIndex((d) => d.today)));
  const [picked, setPicked] = useState(false);
  const sel = weekDays[selDay];
  const selGym = program ? program.days[(sel.date.getDay() + 6) % 7] : null;
  const [openW, setOpenW] = useState(null);
  const [openR, setOpenR] = useState(null);

  // Today's card does not repeat what the next session card already shows.
  const coveredGym = sel.today && !!heroGym && nextIsToday;
  const coveredRun = sel.today && !!heroRun && todayRun && heroRun.key === todayRun.key;
  const showGymPlan = selGym && !selGym.done && !coveredGym;
  const selAdvice = sel.today && !session.active ? advice0 : null;
  const selHas = sel.gym.length || sel.runs.length || (sel.plan && !sel.past && !coveredRun) || showGymPlan;
  const showDay = selHas || selAdvice || (picked && !sel.today) || (sel.today && !coveredGym && !coveredRun);

  const [deload, setDeload] = useState(() => ({ ...deloadState(), on: deloadActive() }));
  const reloadDeload = () => setDeload({ ...deloadState(), on: deloadActive() });
  const advice = !deload.on ? deloadAdvice(data, deload) : null;

  const startRoutine = (r) => { session.startRoutine(r); nav('/seance'); };
  const startProgram = (title) => { session.start(title); nav('/seance'); };
  const importFromHistory = async () => {
    setBusy(true);
    try {
      let pos = data.routines.length;
      for (const p of data.programs.slice(0, 4)) await saveRoutine({ ...routineFromHistory(data, p.title), position: pos++ });
      await data.refresh();
    } finally {
      setBusy(false);
    }
  };

  const sets = (r) => r.exercises.reduce((a, e) => a + e.sets.filter((s) => s.type !== 'warmup').length, 0);
  // Estimated duration: how long that session took last time, when it was timed.
  const lastOf = (name) => data.workouts.find((w) => titleKey(w.title) === titleKey(name) && w.end);
  const estMin = heroGym ? (() => { const w = lastOf(heroGym.name); const m = w ? Math.round((w.end - w.start) / 60000) : 0; return m >= 10 && m <= 240 ? m : null; })() : null;

  // This week, from the real data only.
  const weekStart = startOfWeek(today);
  const weekGym = data.workouts.filter((w) => w.start >= weekStart);
  const weekLogs = data.allLogs.filter((l) => new Date(l.done_at) >= weekStart);
  const weekRuns = weekLogs.filter((l) => !isWalk(l));
  const weekKm = weekRuns.reduce((a, l) => a + Number(l.distance_km || 0), 0);
  const weekMin = weekGym.reduce((a, w) => a + (w.end ? Math.max(0, (w.end - w.start) / 60000) : 0), 0) + weekLogs.reduce((a, l) => a + Number(l.duration_s || 0) / 60, 0);

  return (
    <main className="screen">
      <GlassHeader eyebrow={today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, (c) => c.toUpperCase())} title={`Salut ${firstName(user)}`}
        right={<span aria-hidden="true" style={{ color: 'var(--brand)', display: 'flex', opacity: 0.9 }}><KMark size={34} /></span>} />

      <div className="pad stack" style={{ paddingTop: 6, gap: 14 }}>
        <div className="week">
          {weekDays.map((d, i) => {
            const gym = d.gym.length > 0;
            const runPlanned = !!(d.plan && !d.past);
            const kind = gym ? 'gym' : d.run ? 'run' : d.gymPlanned ? 'pgym' : runPlanned ? 'planned' : 'rest';
            // A second activity the same day: done run, or a planned run / planned gym.
            const badge = (gym && d.run) ? 'run' : ((gym || d.gymPlanned) && !d.run && runPlanned) ? 'prun' : (d.run && !gym && d.gymPlanned) ? 'pgym' : null;
            const what = [gym && 'muscu', d.run && 'course', !gym && d.gymPlanned && 'muscu prévue', !d.run && runPlanned && 'course prévue'].filter(Boolean).join(' et ') || 'repos';
            return (
              <button key={d.date.toISOString()} className="day" onClick={() => { setSelDay(i); setPicked(true); }} aria-pressed={selDay === i}
                aria-label={`${d.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' })} : ${what}`}>
                <span style={d.today ? { color: 'var(--text)', fontWeight: 800 } : null}>{d.letter}</span>
                <span className={`dot k-${kind}${d.today ? ' today' : ''}${selDay === i ? ' sel' : ''}`}>
                  {kind === 'rest' ? <span className="dnum">{d.date.getDate()}</span> : <Icon name={kind === 'gym' || kind === 'pgym' ? 'dumbbell' : 'run'} size={19} width={2.2} />}
                  {badge && <span className={`dot-badge${badge === 'pgym' ? ' b-gym planned' : badge === 'prun' ? ' planned' : ''}`}><Icon name={badge === 'pgym' ? 'dumbbell' : 'run'} size={11} width={2.4} /></span>}
                </span>
              </button>
            );
          })}
        </div>
        {showDay && (
          <DayDetail d={sel} onRun={(key) => nav('/course', { state: { pick: key } })} onGym={(id) => setOpenW(id)} onRunLog={(id) => setOpenR(id)}
            hidePlan={coveredRun} covered={coveredGym || coveredRun}
            gymPlan={showGymPlan ? { name: selGym.routine.name, detail: s_(selGym.routine.exercises.length, 'exercice') } : null}
            onGymPlan={() => (sel.today && !session.active ? startRoutine(routines.find((r) => r.id === selGym.routine.id) || selGym.routine) : nav(`/routines/${selGym.routine.id}`))}
            advice={selAdvice} />
        )}

        {data.betaNotice && (
          <div className={`notice${data.betaNotice.error ? ' danger' : ''}`}>
            <Icon name="spark" size={18} />
            <div className="grow stack" style={{ gap: 4 }}>
              <span className="notice-t">{data.betaNotice.error ? 'Code bêta non utilisé' : `Bienvenue dans la bêta, place n° ${data.betaNotice.seat}`}</span>
              <span className="small muted" style={{ lineHeight: 1.45 }}>{data.betaNotice.error
                ? `${data.betaNotice.error} Tu peux réessayer dans Profil › Réglages › J'ai un code bêta.`
                : `Tout Kadence est à toi gratuitement jusqu'au ${fmtDay(new Date(data.betaNotice.ends_at))} ${new Date(data.betaNotice.ends_at).getFullYear()}. Un bug, une idée ? Profil › Réglages › Donner mon avis.`}</span>
              <div className="row"><button className="btn" onClick={data.closeBetaNotice}>OK</button></div>
            </div>
          </div>
        )}

        {session.active ? (
          <div className="card lg hero">
            <h2 className="label">Séance en cours</h2>
            <span className="display" style={{ fontSize: 26 }}>{session.title}</span>
            <span className="small muted">{session.done} / {session.total} séries validées</span>
            <Link to="/seance" className="btn primary big"><Icon name="play" size={18} width={2.5} />Reprendre</Link>
          </div>
        ) : heroRun ? (
          <RunHero s={heroRun} when={whenOf(heroRun.date, today)} onOpen={() => nav('/course', { state: { pick: heroRun.key } })} />
        ) : heroGym ? (
          <div className="card lg hero" aria-label="Prochaine séance">
            <div className="stack" style={{ gap: 6 }}>
              <h2 className="label">{program
                ? (nextIsToday ? `Aujourd'hui · Muscu · ${program.program.short}` : `Prochaine séance · ${program.program.short}${nextDay ? `, ${nextDay.date.toLocaleDateString('fr-FR', { weekday: 'long' })}` : ''}`)
                : 'Salle · Prochaine séance'}</h2>
              <span className="display">{heroGym.name}</span>
              <span className="small muted" style={{ lineHeight: 1.45 }}>
                {[s_(heroGym.exercises.length, 'exercice'), s_(sets(heroGym), 'série'), estMin && `≈ ${estMin} min`, heroGym.last && `faite ${ago(heroGym.last)}`].filter(Boolean).join(' · ')}
              </span>
            </div>
            <div className="stack" style={{ gap: 8 }}>
              {heroGym.exercises.slice(0, 3).map((e) => (
                <div key={e.name} className="row" style={{ gap: 10, fontSize: 15 }}>
                  <ExerciseImage name={e.name} size={38} radius={9} />
                  <span className="grow ellipsis">{e.name}</span>
                  <span className="muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{e.sets.filter((x) => x.type !== 'warmup').length} × {e.target?.reps ?? e.sets[e.sets.length - 1]?.reps ?? '?'}</span>
                </div>
              ))}
              {heroGym.exercises.length > 3 && <span className="small muted">+ {heroGym.exercises.length - 3} autre{heroGym.exercises.length - 3 > 1 ? 's' : ''}</span>}
            </div>
            <button className="btn primary big" onClick={() => (heroGym.id ? startRoutine(heroGym) : startProgram(heroGym.name))}><Icon name="play" size={18} width={2.5} />Démarrer la séance</button>
          </div>
        ) : null}

        {!session.active && deload.on && (
          <div className="notice">
            <Icon name="moon" size={18} />
            <div className="grow stack" style={{ gap: 4 }}>
              <span className="notice-t">Semaine allégée jusqu'au {fmtDay(new Date(deload.until))}</span>
              <span className="small muted" style={{ lineHeight: 1.45 }}>60 % des séries de travail et charges réduites de 10 % sur chaque séance démarrée. Garde la technique propre, sans aller à l'échec.</span>
              <div className="row"><button className="btn" onClick={() => { stopDeload(); reloadDeload(); }}>Arrêter</button></div>
            </div>
          </div>
        )}
        {!session.active && advice && (
          <div className="notice">
            <Icon name="spark" size={18} />
            <div className="grow stack" style={{ gap: 4 }}>
              <span className="notice-t">Le coach conseille une semaine allégée</span>
              <span className="small muted" style={{ lineHeight: 1.45 }}>{advice.why} Pendant 7 jours : 60 % des séries de travail et charges réduites de 10 %.</span>
              <div className="row">
                <button className="btn primary" onClick={() => { startDeload(7); reloadDeload(); }}>Activer 7 jours</button>
                <button className="btn" onClick={() => { deferDeload(); reloadDeload(); }}>Plus tard</button>
              </div>
            </div>
          </div>
        )}
        {!data.workouts.length && !session.active && (
          <Link to="/reglages" className="notice" style={{ color: 'inherit', textDecoration: 'none', alignItems: 'center' }}>
            <Icon name="upload" size={18} />
            <span className="grow stack" style={{ gap: 2 }}>
              <span className="notice-t">Importe ton historique Hevy</span>
              <span className="xs muted">Tes charges, records et routines seront repris.</span>
            </span>
            <Icon name="chevron" size={18} />
          </Link>
        )}
      </div>

      <div className="section" style={{ paddingTop: 28 }}>
        <SectionHead title="Mes routines" action={<Link to="/routines/nouvelle"><Icon name="plus" size={16} width={2.4} />Nouvelle</Link>} />
        {routines.length ? routines.map((r) => (
          <div key={r.id} className="routine-row">
            <Link to={`/routines/${r.id}`} aria-label={`Modifier la routine ${r.name}`}>
              {r.exercises[0] ? <ExerciseImage name={r.exercises[0].name} size={46} radius={11} /> : <span className="tile-icon k-gym"><Icon name="dumbbell" size={20} /></span>}
              <span className="grow stack" style={{ gap: 2, minWidth: 0 }}>
                <span className="ellipsis" style={{ fontSize: 16, fontWeight: 650 }}>{r.name}</span>
                <span className="xs muted ellipsis">{s_(r.exercises.length, 'exercice')} · {r.last ? (sameDay(r.last, today) ? "faite aujourd'hui" : `dernière fois le ${fmtDay(r.last)}`) : 'jamais faite'}</span>
              </span>
            </Link>
            <button className="play" aria-label={`Démarrer ${r.name}`} disabled={session.active} onClick={() => startRoutine(r)}><Icon name="play" size={17} width={2.5} /></button>
          </div>
        )) : (
          <div className="card">
            <span style={{ fontWeight: 600 }}>Pas encore de routine</span>
            <span className="small muted">{data.programs.length ? `À partir de tes séances habituelles : ${data.programs.map((p) => p.title).join(', ')}.` : 'Crée ta première routine.'}</span>
            {!!data.programs.length && <button className="btn primary" onClick={importFromHistory} disabled={busy}>{busy ? 'Création…' : 'Créer depuis mon historique'}</button>}
            <Link to="/routines/nouvelle" className="btn">Créer une routine vide</Link>
          </div>
        )}
        {!session.active && (
          <button className="text-btn" onClick={() => { session.startEmpty(); nav('/seance'); }}>
            <Icon name="plus" size={16} />Séance libre
          </button>
        )}
      </div>

      <div className="section" style={{ paddingTop: 20 }}>
        <SectionHead title="Accès rapides" />
        <div className="shortcuts">
          <Shortcut to="/course" icon="run" kind="run" title="Course" detail={run ? (run.next ? `${run.next.title}` : 'Plan terminé') : 'Créer un plan'} />
          <Shortcut to="/programmes" icon="list" kind="gym" title="Programmes" detail={program ? program.program.title : 'À choisir'} />
          <Shortcut to="/exercices" icon="dumbbell" title="Exercices" detail="Bibliothèque" />
          {last
            ? <Shortcut to="/coach" icon="spark" title="Bilan" detail={last.title} />
            : <Shortcut to="/historique" icon="clock" title="Historique" detail="Tes séances" />}
        </div>
      </div>

      {(weekGym.length > 0 || weekLogs.length > 0) && (
        <div className="section" style={{ paddingTop: 28 }}>
          <SectionHead title="Ma semaine" action={<Link to="/progres">Progrès<Icon name="chevron" size={15} /></Link>} />
          <StatGrid items={[
            { icon: 'dumbbell', kind: 'gym', value: weekGym.length, label: 'Muscu' },
            { icon: 'run', kind: 'run', value: weekRuns.length, label: weekRuns.length > 1 ? 'Courses' : 'Course' },
            { icon: 'flag', value: fmtKg(weekKm), unit: 'km', label: 'Distance' },
            { icon: 'clock', value: fmtDuration(weekMin), label: 'Temps' },
          ]} />
        </div>
      )}

      <WorkoutSheet id={openW} onClose={() => setOpenW(null)} />
      <RunSheet id={openR} onClose={() => setOpenR(null)} />
    </main>
  );
}

// The next run: what it is, how long, how fast, and its shape.
function RunHero({ s, when, onOpen }) {
  const main = mainType(s);
  const block = s.blocks.flatMap((b) => (b.type === 'rep' ? [b.work] : [b])).find((b) => b.type === main);
  const hasReps = s.blocks.some((b) => b.type === 'rep');
  return (
    <div className="card lg hero k-run" aria-label="Prochaine sortie">
      <div className="stack" style={{ gap: 6 }}>
        <h2 className="label">{when} · Course</h2>
        <span className="display">{s.title}</span>
        {hasReps && <span className="small muted" style={{ lineHeight: 1.4 }}>{structureText(s)}</span>}
      </div>
      <div className="run-figs">
        <div><b>{s.mins} min</b><span>Durée</span></div>
        <div><b>≈ {String(s.km).replace('.', ',')} km</b><span>Distance</span></div>
        <div><b>{block?.pace ? <>{mmss(block.pace)}<small style={{ fontSize: 12, fontWeight: 700 }}> /km</small></> : '–'}</b><span>{TYPE_LABEL[main] ? `Allure ${TYPE_LABEL[main].toLowerCase()}` : 'Allure /km'}</span></div>
      </div>
      {segments(s).length > 1 && (
        <span className="mini-run" aria-hidden="true">
          {segments(s).map((g, i) => <span key={i} className={`seg-${g.type}`} style={{ flexGrow: g.mins, height: `${Math.round(intensityOf(g.type) * 100)}%` }} />)}
        </span>
      )}
      <button className="btn primary big" onClick={onOpen}><Icon name="run" size={18} width={2.4} />Voir la séance</button>
    </div>
  );
}
