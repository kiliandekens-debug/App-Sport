import { useMemo, useState } from 'react';
import { useData } from './data.jsx';
import { analyseSession, fmtSets, nSets } from './lib/analysis.js';
import { BODY } from './lib/bodymap.js';
import { Icon } from './components.jsx';

// 0 → idle tone, 8+ sets → full brand colour.
const heat = (n) => (n ? `color-mix(in oklab, var(--brand) ${Math.round(30 + 70 * Math.min(1, n / 8))}%, var(--map-idle))` : 'var(--map-idle)');

// Shapes that stand for several zones show the busiest one.
const ZONES = {
  chest: ['pecs', 'pecHaut'],
  deltFront: ['deltAnt', 'deltLat'],
  deltBack: ['deltPost', 'deltLat'],
  trapBack: ['trapezes', 'hautDos'],
};
const zoneOf = (k, regions) => {
  const list = ZONES[k] || [k];
  return list.reduce((best, r) => ((regions[r] || 0) > (regions[best] || 0) ? r : best), list[0]);
};
const valueOf = (k, regions) => Math.max(...(ZONES[k] || [k]).map((r) => regions[r] || 0));

function Figure({ view, regions, selected, onPick, label }) {
  return (
    <figure className="bm-fig">
      <svg viewBox={view.vb} role="img" aria-label={label}>
        <path d={view.outline} className="bm-outline" />
        <g fill="var(--map-base)">{view.base.map((d, i) => <path key={i} d={d} />)}</g>
        {view.muscles.map((m, i) => {
          const n = valueOf(m.k, regions);
          const zone = zoneOf(m.k, regions);
          return (
            <path key={i} d={m.d} className={`bm-m${n ? ' hit' : ''}${selected === zone && n ? ' on' : ''}`} fill={heat(n)} onClick={n ? () => onPick(zone) : undefined} />
          );
        })}
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

export function BodyMap({ regions, selected, onPick }) {
  return (
    <div className="bm">
      <Figure view={BODY.front} regions={regions} selected={selected} onPick={onPick} label="Face" />
      <Figure view={BODY.back} regions={regions} selected={selected} onPick={onPick} label="Dos" />
    </div>
  );
}

// Zone, muscles worked (map + list) and evidence-based advice for one workout.
export function SessionAnalysis({ workout }) {
  const data = useData();
  const a = useMemo(() => analyseSession(workout, data.workouts), [workout, data.workouts]);
  const [open, setOpen] = useState(null);
  const [moreMuscles, setMoreMuscles] = useState(false);
  const [moreTips, setMoreTips] = useState(false);
  if (!a) return null;
  const targeted = a.muscles.filter((m) => m.primary);
  const support = a.muscles.filter((m) => !m.primary);
  const shownMuscles = moreMuscles ? a.muscles : targeted;
  const tips = moreTips ? a.tips : a.tips.slice(0, 2);
  const pick = (r) => setOpen((cur) => (cur === r ? null : r));

  return (
    <>
      <section className="card ana" aria-label="Muscles travaillés">
        <div className="between">
          <h2 className="label">Zone travaillée</h2>
          <span className="xs muted">{a.sets} série{a.sets > 1 ? 's' : ''} de travail</span>
        </div>
        <span className="display ana-zone">{a.zone.name}</span>

        <BodyMap regions={a.regions} selected={open} onPick={pick} />
        <div className="bm-legend xs muted" aria-hidden="true">
          <span>1 série</span><span className="bm-ramp" /><span>8 et plus</span>
        </div>

        <div className="ana-list">
          {shownMuscles.map((m) => {
            const on = open === m.region;
            return (
              <div key={m.region} className={`ana-row${on ? ' on' : ''}`}>
                <button className="ana-head" aria-expanded={on} onClick={() => pick(m.region)}>
                  <span className="ana-dot" style={{ background: heat(m.sets) }} />
                  <span className="grow" style={{ fontWeight: 650 }}>{m.name}</span>
                  {moreMuscles && <span className={`ana-role${m.primary ? ' main' : ''}`}>{m.primary ? 'Ciblé' : 'Soutien'}</span>}
                  <span className="ana-n">{fmtSets(m.sets)}<small> {nSets(m.sets).replace(/^\S+ /, '')}</small></span>
                  <Icon name="chevron" size={16} />
                </button>
                {on && (
                  <div className="ana-more small">
                    <span>{m.what}</span>
                    <span className="muted">Travaillé par : {m.exercises.join(', ')}.</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {!!support.length && (
          <button className="text-btn" onClick={() => setMoreMuscles(!moreMuscles)} aria-expanded={moreMuscles}>
            {moreMuscles ? 'Masquer les muscles en soutien' : `${support.length} muscle${support.length > 1 ? 's' : ''} en soutien`}
          </button>
        )}
      </section>

      <section className="card ana" aria-label="Pour améliorer ta séance">
        <h2 className="label">Pour améliorer ta séance</h2>
        {tips.length ? tips.map((t) => (
          <div key={t.id} className="ana-tip">
            <span className="ana-tip-mark" aria-hidden="true" />
            <div className="stack" style={{ gap: 4 }}>
              <span style={{ fontWeight: 700 }}>{t.title}</span>
              <span className="small" style={{ lineHeight: 1.45 }}>{t.text}</span>
              <span className="xs muted">Source : {t.source}</span>
            </div>
          </div>
        )) : <span className="small">Rien à corriger : ta séance suit les recommandations.</span>}
        {a.tips.length > 2 && (
          <button className="text-btn" onClick={() => setMoreTips(!moreTips)} aria-expanded={moreTips}>
            {moreTips ? 'Afficher moins' : `${a.tips.length - 2} autre${a.tips.length - 2 > 1 ? 's' : ''} conseil${a.tips.length - 2 > 1 ? 's' : ''}`}
          </button>
        )}
        {!!a.goods.length && (
          <div className="stack" style={{ gap: 8, paddingTop: 4 }}>
            <h3 className="xs muted" style={{ margin: 0, fontWeight: 700 }}>Ce qui est déjà bien</h3>
            {a.goods.map((g) => (
              <div key={g.id} className="row ana-good" style={{ alignItems: 'flex-start', gap: 8 }}>
                <span style={{ color: 'var(--ok)', paddingTop: 2 }}><Icon name="check" size={14} width={3} /></span>
                <span className="small"><b>{g.title}.</b> {g.text}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
