import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSession, mmss, num, prevOf, SET_LABEL, SET_NAME, REST_OPTIONS, sessionToRoutine } from '../session.jsx';
import { useData, saveRoutine } from '../data.jsx';
import { useUi } from '../ui.jsx';
import { fmtKg, fmtInt, titleKey } from '../lib/stats.js';
import { SUPERSET_COLORS } from '../lib/routines.js';
import { Icon, ExerciseImage, SupersetTag } from '../components.jsx';
import ExerciseSheet from './ExerciseSheet.jsx';

const TYPE_COLOR = { warmup: 'var(--warm)', dropset: 'var(--drop)', failure: 'var(--danger)' };
const restLabel = (sec) => (sec ? mmss(sec) : 'Désactivé');

// One exercise with all its sets, as in Hevy: everything is editable in place.
function ExerciseCard({ e, ei, s, best, isCurrent, onOpen, cardRef }) {
  const ui = useUi();
  const [menu, setMenu] = useState(false);
  const isLast = ei === s.exercises.length - 1;
  const linked = e.superset && s.exercises[ei + 1]?.superset === e.superset;
  const activeIdx = e.sets.findIndex((x) => !x.done);
  const prevWarm = e.prev.filter((q) => q.type === 'warmup');
  const prevWork = e.prev.filter((q) => q.type !== 'warmup');
  const hasWarm = e.sets.some((x) => x.type === 'warmup');
  let workN = 0, wu = 0, wk = 0;

  const remove = async () => {
    if (await ui.confirm({ title: `Retirer ${e.name} ?`, message: 'Les séries déjà validées sur cet exercice seront perdues.', ok: 'Retirer', danger: true })) s.removeExercise(ei);
  };

  return (
    <section ref={cardRef} className={`ex-card ${isCurrent ? 'cur' : ''}`} style={e.superset ? { borderLeft: `4px solid ${SUPERSET_COLORS[e.superset]}` } : null} aria-label={e.name}>
      <div className="row" style={{ gap: 12 }}>
        <button onClick={onOpen} aria-label={`Voir l'illustration de ${e.name}`} style={{ padding: 0, border: 'none', background: 'none' }}>
          <ExerciseImage name={e.name} size={48} />
        </button>
        <div className="grow stack" style={{ gap: 3 }}>
          <SupersetTag letter={e.superset} />
          <span className="display" style={{ fontSize: 17, lineHeight: 1.2 }}>{e.name}</span>
          {best && <span className="xs muted">Record {fmtKg(best.kg)} kg × {best.reps}</span>}
        </div>
        <button className="icon-btn sq" aria-label={`Options de ${e.name}`} aria-expanded={menu} onClick={() => setMenu(!menu)}><Icon name={menu ? 'close' : 'more'} size={18} /></button>
      </div>

      {menu && (
        <div className="ex-menu">
          <button onClick={() => { s.addWarmups(ei); setMenu(false); }}><Icon name="flame" size={16} />{hasWarm ? "Recalculer l'échauffement" : "Ajouter l'échauffement (calcul auto)"}</button>
          {!isLast && <button onClick={() => { s.toggleSuperset(ei); setMenu(false); }}><Icon name="link" size={16} />{linked ? 'Délier du superset' : `Superset avec ${s.exercises[ei + 1].name}`}</button>}
          <button disabled={ei === 0} onClick={() => s.moveExercise(ei, -1)}><Icon name="up" size={16} />Monter</button>
          <button disabled={isLast} onClick={() => s.moveExercise(ei, 1)}><Icon name="down" size={16} />Descendre</button>
          <button disabled={!e.sets.length} onClick={() => s.removeLastSet(ei)}><Icon name="minus" size={16} />Retirer la dernière série</button>
          <button style={{ color: 'var(--danger)' }} onClick={remove}><Icon name="trash" size={16} />Retirer l'exercice</button>
        </div>
      )}

      <label className="rest-row">
        <Icon name="timer" size={16} />
        <span>Repos</span>
        <select aria-label={`Temps de repos pour ${e.name}`} value={e.rest ?? 0} onChange={(ev) => s.setRest(ei, Number(ev.target.value))}>
          {REST_OPTIONS.map((o) => <option key={o} value={o}>{restLabel(o)}</option>)}
        </select>
      </label>
      {e.plan && <span className="xs accent">Coach : {fmtKg(e.plan.kg)} kg × {e.plan.reps}. {e.plan.reason}.</span>}

      <div className="sets-head"><span>Série</span><span>Précédent</span><span style={{ textAlign: 'center' }}>Kg</span><span style={{ textAlign: 'center' }}>Reps</span><span /></div>
      <div className="stack" style={{ gap: 6 }}>
        {e.sets.map((x, i) => {
          const type = x.type || 'normal';
          const label = type === 'normal' ? String(++workN) : SET_LABEL[type];
          const p = type === 'warmup' ? prevWarm[wu++] : prevWork[wk++];
          const prev = p ? `${fmtKg(p.kg)} × ${p.reps}` : '–';
          const typeBtn = (
            <button className="n" onClick={() => s.cycleType(ei, i)} aria-label={`Série ${i + 1}, ${SET_NAME[type]}. Changer le type`}
              style={{ height: 40, borderRadius: 10, border: 'none', background: 'transparent', color: TYPE_COLOR[type] || 'inherit', fontWeight: 700, fontSize: 15 }}>{label}</button>
          );
          if (x.done) {
            return (
              <div key={i} className="set-row done">
                {typeBtn}<span className="muted small">{prev}</span>
                <span className="c">{fmtKg(num(x.kg))}</span><span className="c">{x.reps}</span>
                <button className="check" aria-label={`Annuler la validation de la série ${i + 1}`} onClick={() => s.unvalidate(ei, i)}><Icon name="check" size={18} width={2.5} /></button>
              </div>
            );
          }
          return (
            <div key={i} className={`set-row ${isCurrent && i === activeIdx ? 'active' : ''}`}>
              {typeBtn}<span className="muted small">{prev}</span>
              <input aria-label={`Charge en kg, série ${i + 1}`} inputMode="decimal" value={x.kg} placeholder={p ? fmtKg(p.kg) : 'kg'} onFocus={(ev) => ev.target.select()} onChange={(ev) => s.setSet(ei, i, { kg: ev.target.value })} />
              <input aria-label={`Répétitions, série ${i + 1}`} inputMode="numeric" value={x.reps} placeholder={p ? String(p.reps) : 'reps'} onFocus={(ev) => ev.target.select()} onChange={(ev) => s.setSet(ei, i, { reps: ev.target.value })} />
              <button className="check outline" aria-label={`Valider la série ${i + 1}`} onClick={() => { if (!s.validate(ei, i)) ui.notify('Indique le nombre de répétitions'); }}><Icon name="check" size={18} width={2.5} /></button>
            </div>
          );
        })}
      </div>
      <div className={hasWarm ? 'stack' : 'grid2'}>
        {!hasWarm && <button className="btn dashed" onClick={() => s.addWarmups(ei)}><Icon name="flame" size={16} />Échauffement auto</button>}
        <button className="btn dashed" onClick={() => s.addSet(ei)}><Icon name="plus" size={16} />Série</button>
      </div>
    </section>
  );
}

export default function Seance() {
  const s = useSession();
  const data = useData();
  const ui = useUi();
  const nav = useNavigate();
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(null);
  const [hint, setHint] = useState(() => { try { return !localStorage.getItem('app-sport-hint-types'); } catch { return false; } });
  const refs = useRef({});
  const mounted = useRef(false);
  const curName = s.active ? s.exercises[s.current]?.name : null;

  // Follow the session: bring the exercise being worked on into view.
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; if (!s.active || s.current === 0) return; }
    if (curName && refs.current[curName]) refs.current[curName].scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [curName]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s.active) {
    return (
      <main className="screen">
        <div className="center">
          <span className="title-s">Aucune séance en cours</span>
          <button className="btn primary" onClick={() => s.startEmpty()}>Démarrer une séance vide</button>
          <Link to="/">Retour à l'accueil</Link>
        </div>
      </main>
    );
  }

  const ex = s.exercise;
  const ei = s.current;
  const anyDone = s.exercises.some((e) => e.sets.some((x) => x.done));

  const abandon = async () => {
    if (await ui.confirm({ title: 'Abandonner la séance ?', message: anyDone ? 'Les séries validées ne seront pas enregistrées.' : 'Rien ne sera enregistré.', ok: 'Abandonner', danger: true })) { s.cancel(); nav('/'); }
  };
  const finish = async () => {
    if (!anyDone) { abandon(); return; }
    const left = s.total - s.done;
    const ok = await ui.confirm({
      title: 'Terminer la séance ?',
      message: left > 0 ? `${left} série${left > 1 ? 's' : ''} non validée${left > 1 ? 's' : ''} ne ser${left > 1 ? 'ont' : 'a'} pas enregistrée${left > 1 ? 's' : ''}.` : `${s.done} séries, ${fmtInt(s.volume)} kg soulevés.`,
      ok: 'Terminer',
    });
    if (!ok) return;
    setSaving(true);
    try {
      const summary = await s.finish();
      nav('/coach', { state: { summary } });
    } catch (err) {
      ui.notify(`Échec de l'enregistrement : ${err.message || err}`);
      setSaving(false);
    }
  };
  const rename = async () => {
    const t = await ui.prompt({ title: 'Nom de la séance', value: s.title, ok: 'Renommer' });
    if (t) s.rename(t);
  };
  const saveAsRoutine = async () => {
    const existing = data.routines.find((r) => titleKey(r.name) === titleKey(s.title));
    const name = await ui.prompt({
      title: existing ? 'Mettre à jour la routine' : 'Enregistrer comme routine',
      message: existing ? `Garde ce nom pour mettre à jour « ${existing.name} », ou change-le pour créer une nouvelle routine.` : 'Tu la retrouveras sur l\'accueil, prête à démarrer.',
      value: existing?.name || s.title,
      ok: 'Enregistrer',
    });
    if (!name) return;
    const same = data.routines.find((r) => r.name === name);
    try {
      await saveRoutine({ ...sessionToRoutine(s, name), id: same?.id, position: data.routines.length });
      await data.refresh();
      ui.notify(same ? 'Routine mise à jour' : 'Routine enregistrée');
    } catch (err) {
      ui.notify(err.message || String(err));
    }
  };
  const dismissHint = () => { setHint(false); try { localStorage.setItem('app-sport-hint-types', '1'); } catch { /* private mode */ } };

  return (
    <main className="screen wide" style={{ paddingBottom: 'calc(150px + env(safe-area-inset-bottom))' }}>
      <header className="session-head">
        <div className="row">
          <Link to="/" aria-label="Réduire la séance" className="icon-btn"><Icon name="down" /></Link>
          <button className="grow" style={{ background: 'none', border: 'none', color: 'inherit', textAlign: 'left', padding: 0, minHeight: 44 }} onClick={rename} aria-label={`Renommer la séance ${s.title}`}>
            <span className="display" style={{ fontSize: 20, lineHeight: 1.15 }}>{s.title}</span>
          </button>
          <Link to="/montre" aria-label="Vue montre" className="icon-btn"><Icon name="watch" /></Link>
          <button className="btn primary" onClick={finish} disabled={saving}>{saving ? '…' : 'Terminer'}</button>
        </div>
        <div className="session-stats">
          <span><b className="accent" style={{ color: 'var(--accent)' }}>{mmss(s.elapsed)}</b>durée</span>
          <span><b>{fmtInt(s.volume)}</b>kg</span>
          <span><b>{s.done}/{s.total}</b>séries</span>
        </div>
        <div className="session-bar"><div style={{ width: `${s.total ? (s.done / s.total) * 100 : 0}%` }} /></div>
      </header>

      <div className="split" style={{ paddingTop: 16 }}>
        <nav className="panel only-wide session-nav stack" style={{ gap: 6 }} aria-label="Exercices de la séance">
          {s.exercises.map((e, i) => {
            const w = e.sets.filter((x) => x.type !== 'warmup');
            return (
              <button key={e.name} className={`prog-item ${i === ei ? 'cur' : ''}`} onClick={() => { s.setCurrent(i); refs.current[e.name]?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                <ExerciseImage name={e.name} size={40} radius={10} />
                <span className="grow" style={{ fontSize: 15, fontWeight: i === ei ? 600 : 400 }}>{e.name}</span>
                <span className={`small ${i === ei ? 'accent' : 'muted'}`}>{w.filter((x) => x.done).length}/{w.length}</span>
              </button>
            );
          })}
        </nav>

        <div className="panel pad stack" style={{ gap: 12 }}>
          {hint && !!s.exercises.length && (
            <button onClick={dismissHint} className="row xs soft" style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--chip)', border: 'none', textAlign: 'left', lineHeight: 1.4 }}>
              <span className="grow">Les échauffements (É) se calculent seuls à 40, 60 et 80 % de ta première série de travail. Touche le numéro d'une série pour changer son type, et l'image pour voir le mouvement.</span>
              <Icon name="close" size={16} />
            </button>
          )}

          {s.exercises.map((e, i) => (
            <ExerciseCard key={e.name} e={e} ei={i} s={s} best={data.exercises.get(e.name)?.best} isCurrent={i === ei}
              onOpen={() => setOpen({ name: e.name })} cardRef={(el) => { refs.current[e.name] = el; }} />
          ))}

          {!s.exercises.length && (
            <div className="card">
              <span className="display" style={{ fontSize: 20 }}>Séance vide</span>
              <span className="small muted">Ajoute tes exercices un par un. Tes dernières charges sont reprises automatiquement.</span>
            </div>
          )}

          <Link to="/exercices" className="btn primary big" style={{ height: 52, fontSize: 16 }}><Icon name="plus" size={18} width={2.5} />Ajouter un exercice</Link>
          {!!s.exercises.length && (
            <button className="btn" style={{ height: 48, borderRadius: 14, background: 'transparent', border: '1px solid var(--border)' }} onClick={saveAsRoutine}>
              <Icon name="list" size={18} />Enregistrer comme routine
            </button>
          )}
          <button className="btn" style={{ background: 'transparent', color: 'var(--danger)', fontWeight: 500 }} onClick={abandon}>Abandonner la séance</button>
        </div>
      </div>

      <div className="dock">
        <div className="dock-in">
          {s.resting ? (
            <>
              <div className="progress"><div style={{ width: `${s.restTotal ? Math.round((s.restLeft / s.restTotal) * 100) : 0}%` }} /></div>
              <div className="row" style={{ gap: 10 }}>
                <button className="rest-btn" aria-label="Retirer 15 secondes" onClick={() => s.shiftRest(-15)}>−15</button>
                <div className="grow stack" style={{ alignItems: 'center', gap: 0 }}>
                  <span className="xs muted">Repos</span>
                  <span className="rest-num">{mmss(s.restLeft)}</span>
                </div>
                <button className="rest-btn" aria-label="Ajouter 15 secondes" onClick={() => s.shiftRest(15)}>+15</button>
                <button className="btn light" style={{ height: 52, borderRadius: 14 }} onClick={s.skipRest}>Passer</button>
              </div>
            </>
          ) : ex && s.activeSet >= 0 ? (
            <div className="row">
              <button className="grow stack" style={{ gap: 2, background: 'none', border: 'none', color: 'inherit', textAlign: 'left', padding: 0 }} onClick={() => refs.current[ex.name]?.scrollIntoView({ behavior: 'smooth', block: 'start' })} aria-label={`Aller à ${ex.name}`}>
                <span className="xs muted">À toi : {ex.name}</span>
                <span className="display" style={{ fontSize: 22 }}>{(() => { const x = ex.sets[s.activeSet]; const pv = prevOf(ex, s.activeSet); const kg = x.kg !== '' ? num(x.kg) : pv?.kg; const reps = x.reps !== '' ? x.reps : pv?.reps; return `${kg != null ? fmtKg(kg) : '?'} kg × ${reps ?? '?'}`; })()}</span>
              </button>
              <button className="btn primary" style={{ height: 56, borderRadius: 16, padding: '0 24px', fontSize: 16 }} onClick={() => { if (!s.validate(ei, s.activeSet)) ui.notify('Indique le nombre de répétitions'); }}>Valider</button>
            </div>
          ) : (
            <div className="row">
              <div className="grow stack" style={{ gap: 2 }}>
                <span className="xs accent" style={{ fontWeight: 600 }}>{ex ? 'Exercice terminé' : 'Séance vide'}</span>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{s.next ? `Prochain : ${s.next.name}` : ex ? 'Tout est fait' : 'Ajoute ton premier exercice'}</span>
              </div>
              {s.next
                ? <button className="btn" style={{ height: 52, borderRadius: 14 }} onClick={() => s.setCurrent(s.exercises.indexOf(s.next))}>Suivant</button>
                : ex ? <button className="btn primary" style={{ height: 52, borderRadius: 14 }} onClick={finish} disabled={saving}>Terminer</button>
                  : null}
            </div>
          )}
        </div>
      </div>

      <ExerciseSheet exercise={open} onClose={() => setOpen(null)} />
    </main>
  );
}
