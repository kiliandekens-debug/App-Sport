import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { imagesOf } from './lib/images.js';
import { SUPERSET_COLORS } from './lib/routines.js';

// Exercise illustration: two frames (start / end position) shown in turn.
export function ExerciseImage({ name, base, size = 48, animate = false, radius = 12 }) {
  const imgs = imagesOf(name, base);
  const [frame, setFrame] = useState(0);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    if (!animate || imgs.length < 2) return undefined;
    const t = setInterval(() => setFrame((f) => 1 - f), 900);
    return () => clearInterval(t);
  }, [animate, imgs.length]);
  const box = { width: size === 'full' ? '100%' : size, height: size === 'full' ? 'auto' : size, aspectRatio: size === 'full' ? '16 / 10' : undefined, maxHeight: size === 'full' ? 260 : undefined, borderRadius: radius, flexShrink: 0, overflow: 'hidden', background: '#F4F5F7' };
  const fit = size === 'full' ? 'contain' : 'cover';
  if (!imgs.length || broken) {
    return <div style={{ ...box, background: 'var(--raised)', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden="true"><Icon name="dumbbell" size={typeof size === 'number' ? Math.round(size / 2) : 40} /></div>;
  }
  return (
    <div className={size === 'full' ? undefined : 'thumb-mono'} style={{ ...box, position: 'relative' }}>
      {imgs.map((src, i) => (
        <img
          key={src}
          src={src}
          alt={i === 0 ? `Illustration : ${name}` : ''}
          loading="lazy"
          onError={() => setBroken(true)}
          style={{ position: i ? 'absolute' : 'static', inset: 0, width: '100%', height: '100%', objectFit: fit, display: 'block', opacity: animate ? (frame === i ? 1 : 0) : i === 0 ? 1 : 0, transition: 'opacity 0.25s' }}
        />
      ))}
    </div>
  );
}

export function SupersetTag({ letter }) {
  if (!letter) return null;
  return <span className="tag" style={{ background: SUPERSET_COLORS[letter] || 'var(--accent)', color: '#111418', alignSelf: 'flex-start' }}>Superset {letter}</span>;
}

const P = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  dumbbell: <path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11" />,
  chart: <path d="M4 19V5M4 19h16M8 15l4-4 3 3 5-6" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>,
  spark: <><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" /><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></>,
  check: <path d="M5 12l5 5 9-10" />,
  plus: <path d="M12 5v14M5 12h14" />,
  back: <path d="M15 6l-6 6 6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  up: <path d="M6 15l6-6 6 6" />,
  timer: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2M9 2h6" /></>,
  chevron: <path d="M9 6l6 6-6 6" />,
  play: <path d="M7 4l12 8-12 8z" />,
  swap: <path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />,
  next: <path d="M5 12h14M13 6l6 6-6 6" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>,
  skip: <path d="M5 5l10 7-10 7zM19 5v14" />,
  watch: <><rect x="6" y="6" width="12" height="12" rx="3" /><path d="M9 6l1-3h4l1 3M9 18l1 3h4l1-3" /></>,
  upload: <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4" />,
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
  minus: <path d="M5 12h14" />,
  flame: <path d="M12 3c1 3 4 5 4 9a4 4 0 0 1-8 0c0-1.5.5-2.5 1.5-3.5C10 10 12 8 12 3zM12 21a7 7 0 0 0 7-7" />,
};

export function Icon({ name, size = 20, width = 2, fill }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill || 'none'} stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name]}
    </svg>
  );
}

const TABS = [
  ['/', 'home', 'Accueil'],
  ['/exercices', 'dumbbell', 'Exercices'],
  ['/progres', 'chart', 'Progrès'],
  ['/course', 'timer', 'Course'],
  ['/coach', 'spark', 'Coach'],
  ['/profil', 'user', 'Profil'],
];

// Screen header: a floating pane of liquid glass. Large title at rest, compact once the page scrolls.
export function GlassHeader({ eyebrow, title, lead = null, right = null }) {
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.scrollY > 24);
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setCompact(window.scrollY > 24));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, []);
  return (
    <header className={`glass-head${compact ? ' compact' : ''}`}>
      <div className="glass">
        {lead}
        <div className="grow glass-text">
          {eyebrow && <span className="glass-eyebrow">{eyebrow}</span>}
          <h1 className="glass-title">{title}</h1>
        </div>
        {right}
      </div>
    </header>
  );
}

export function Nav() {
  return (
    <nav className="nav" aria-label="Navigation principale">
      <div className="nav-in">
        {TABS.map(([to, icon, label]) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon name={icon} size={22} />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export function Bars({ values, labels, height = 96, highlight = [], partialLast = false, label }) {
  const max = Math.max(...values, 0.0001);
  const cols = { gridTemplateColumns: `repeat(${values.length}, minmax(0, 1fr))` };
  return (
    <>
      <div className="bars" role="img" aria-label={label} style={{ ...cols, height }}>
        {values.map((v, i) => (
          <div
            key={i}
            className={partialLast && i === values.length - 1 ? 'partial' : highlight.includes(i) ? 'hi' : ''}
            style={{ height: `${Math.max(3, (v / max) * 100)}%` }}
          />
        ))}
      </div>
      {labels && (
        <div className="bars-labels" style={cols}>
          {labels.map((l, i) => <span key={i}>{l}</span>)}
        </div>
      )}
    </>
  );
}

export function Loading({ text = 'Chargement de tes séances' }) {
  return (
    <div className="screen" role="status" aria-label={text} style={{ padding: '28px 20px', gap: 14 }}>
      <div className="skel" style={{ height: 18, width: 140 }} />
      <div className="skel" style={{ height: 38, width: 220 }} />
      <div className="skel" style={{ height: 64 }} />
      <div className="skel" style={{ height: 230, borderRadius: 24 }} />
      <div className="skel" style={{ height: 64 }} />
      <div className="skel" style={{ height: 64 }} />
    </div>
  );
}

// Line chart for a progression: a few points, min and max marked, last point emphasised.
export function LineChart({ values, format = (v) => String(v), label }) {
  const W = 320, H = 150, px = 10, pt = 22, pb = 22;
  if (!values.length) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const x = (i) => (values.length === 1 ? W / 2 : px + (i * (W - 2 * px)) / (values.length - 1));
  const y = (v) => (max === min ? H / 2 : pt + (1 - (v - min) / span) * (H - pt - pb));
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const last = values.length - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label} style={{ display: 'block' }}>
      <line x1="0" x2={W} y1={y(max)} y2={y(max)} stroke="var(--line)" strokeDasharray="3 5" />
      {max !== min && <line x1="0" x2={W} y1={y(min)} y2={y(min)} stroke="var(--line)" strokeDasharray="3 5" />}
      <text x="0" y={y(max) - 7} fontSize="11" fill="var(--muted)">{format(max)}</text>
      {max !== min && <text x="0" y={y(min) + 16} fontSize="11" fill="var(--muted)">{format(min)}</text>}
      {values.length > 1 && <path d={`M${pts[0]} L${pts.slice(1).join(' L')} L${x(last)},${H} L${x(0)},${H} Z`} fill="var(--accent)" opacity="0.07" />}
      {values.length > 1 && <polyline points={pts.join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
      {values.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={i === last ? 5.5 : 3.2} fill={i === last ? 'var(--accent)' : 'var(--card)'} stroke="var(--accent)" strokeWidth="2" />
      ))}
    </svg>
  );
}
