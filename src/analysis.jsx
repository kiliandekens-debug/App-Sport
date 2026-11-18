import { useMemo, useState } from 'react';
import { useData } from './data.jsx';
import { analyseSession, fmtSets } from './lib/analysis.js';
import { FRONT, BACK } from './lib/bodymap.js';
import { Icon } from './components.jsx';

const MIRROR = 'matrix(-1 0 0 1 200 0)';
// 0 → idle tone, 8+ sets → full brand colour.
const heat = (n) => (n ? `color-mix(in oklab, var(--brand) ${Math.round(28 + 72 * Math.min(1, n / 8))}%, var(--map-idle))` : 'var(--map-idle)');

function Figure({ view, regions, selected, onPick, label }) {
  return (
    <figure className="bm-fig">
      <svg viewBox="0 0 200 410" role="img" aria-label={label}>
        {view.base.map((b, i) => (
          <g key={i} fill="var(--map-base)">
            <path d={b.d} />
            {!b.full && <path d={b.d} transform={MIRROR} />}
          </g>
        ))}
        {view.muscles.map((m) => {
          const n = regions[m.r] || 0;
          const on = selected === m.r;
          return (
            <g key={m.r} className={`bm-m${n ? ' hit' : ''}${on ? ' on' : ''}`} fill={heat(n)} onClick={n ? () => onPick(m.r) : undefined}>
              <path d={m.d} />
              <path d={m.d} transform={MIRROR} />
            </g>
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
      <Figure view={FRONT} regions={regions} selected={selected} onPick={onPick} label="Face" />
      <Figure view={BACK} regions={regions} selected={selected} onPick={onPick} label="Dos" />
    </div>
  );
}

// Zone, muscles worked (map + list) and evidence-based advice for one workout.
export function SessionAnalysis({ workout }) {
  const data = useData();
  const a = useMemo(() => analyseSession(workout, data.workouts), [workout, data.workouts]);
  const [open, setOpen] = useState(null);
  if (!a) return null;
  const pick = (r) => setOpen((cur) => (cur === r ? null : r));

  return (
    <>
      <section className="card ana" aria-label="Muscles travaillés">
        <div className="between">
          <h2 className="label">Zone travaillée</h2>
          <span className="xs muted">{a.sets} séries de travail</span>
        </div>
        <span className="display ana-zone">{a.zone.name}</span>
        {!!a.support.length && <span className="small muted">En soutien : {a.support.join(', ')}</span>}

        <BodyMap regions={a.regions} selected={open} onPick={pick} />
        <div className="bm-legend xs muted" aria-hidden="true">
          <span>1 série</span><span className="bm-ramp" /><span>8 et plus</span>
        </div>

        <div className="ana-list">
          {a.muscles.map((m) => {
            const on = open === m.region;
            return (
              <div key={m.region} className={`ana-row${on ? ' on' : ''}`}>
                <button className="ana-head" aria-expanded={on} onClick={() => pick(m.region)}>
                  <span className="ana-dot" style={{ background: heat(m.sets) }} />
                  <span className="grow" style={{ fontWeight: 650 }}>{m.name}</span>
                  <span className={`ana-role${m.primary ? ' main' : ''}`}>{m.primary ? 'Ciblé' : 'Soutien'}</span>
                  <span className="ana-n">{fmtSets(m.sets)}<small> séries</small></span>
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
        <span className="xs muted">Séries de soutien comptées pour moitié, comme dans les études sur le volume.</span>
      </section>

      <section className="card ana" aria-label="Pour améliorer ta séance">
        <h2 className="label">Pour améliorer ta séance</h2>
        {a.tips.length ? a.tips.map((t) => (
          <div key={t.id} className="ana-tip">
            <span className="ana-tip-mark" aria-hidden="true" />
            <div className="stack" style={{ gap: 4 }}>
              <span style={{ fontWeight: 700 }}>{t.title}</span>
              <span className="small" style={{ lineHeight: 1.45 }}>{t.text}</span>
              <span className="xs muted">Source : {t.source}</span>
            </div>
          </div>
        )) : <span className="small">Rien à corriger : ta séance suit les recommandations.</span>}
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
