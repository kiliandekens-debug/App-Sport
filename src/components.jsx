import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
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
  const box = { width: size === 'full' ? '100%' : size, height: size === 'full' ? 'auto' : size, aspectRatio: size === 'full' ? '3 / 2' : undefined, borderRadius: radius, flexShrink: 0, overflow: 'hidden', background: '#F4F5F7' };
  // Full size fills its frame too: "contain" left pale bars on each side of the photo.
  const fit = 'cover';
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
          style={{ position: i ? 'absolute' : 'static', inset: 0, width: '100%', height: '100%', objectFit: fit, objectPosition: 'center 35%', display: 'block', opacity: animate ? (frame === i ? 1 : 0) : i === 0 ? 1 : 0, transition: 'opacity 0.25s' }}
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
  run: <><circle cx="14.5" cy="4.5" r="1.9" /><path d="M13 8l-3 5 3.5 2.5-1.5 5.5M10 13l-4 1.5M13 8l3.5 3.5 3-1M13 8l-4.5 1-2 3" /></>,
  moon: <path d="M20 14.2A8 8 0 1 1 9.8 4a6.4 6.4 0 0 0 10.2 10.2z" />,
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
  bell: <><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  send: <><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7z" /></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 21h14" /></>,
  chat: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />,
  flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  userplus: <><circle cx="9" cy="8" r="4" /><path d="M2 21c0-4 3-6 7-6s7 2 7 6M19 8v6M16 11h6" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><circle cx="17" cy="9" r="2.5" /><path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5M16 14.5c3 0 6 1.5 6 4.5" /></>,
  flame: <path d="M12 3c1 3 4 5 4 9a4 4 0 0 1-8 0c0-1.5.5-2.5 1.5-3.5C10 10 12 8 12 3zM12 21a7 7 0 0 0 7-7" />,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  trophy: <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  heart: <path d="M12 20s-7-4.4-9-8.6C1.6 8.4 3.4 5 6.8 5c2 0 3.4 1.2 5.2 3 1.8-1.8 3.2-3 5.2-3 3.4 0 5.2 3.4 3.8 6.4C19 15.6 12 20 12 20z" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.01" /></>,
  shield: <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" />,
  palette: <><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5c0-4-4-7.2-9-7.2z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10.5" cy="7" r="1" /><circle cx="15" cy="7.5" r="1" /></>,
  logout: <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10" />,
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
  ['/course', 'run', 'Course'],
  ['/amis', 'users', 'Amis'],
  ['/progres', 'chart', 'Progrès'],
  ['/profil', 'user', 'Profil'],
];

// Screen header (iOS large title): the title sits in the page, nothing around it. Once it has
// scrolled away, a compact glass bar with the title (and the same actions) fades in at the top.
export function GlassHeader({ eyebrow, title, lead = null, right = null, back = null }) {
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.scrollY > 64);
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      // Hysteresis, so it never flickers around the threshold.
      raf = requestAnimationFrame(() => setCompact((c) => (c ? window.scrollY > 44 : window.scrollY > 64)));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, []);
  const small = lead && lead.props?.className?.includes('glass-avatar') ? lead : null;
  // back: { to, label } — a back button before the title, in both states.
  const backBtn = back ? <Link to={back.to} className="icon-btn" aria-label={back.label}><Icon name="back" /></Link> : null;
  return (
    <>
      <header className="page-head">
        {backBtn}
        {lead}
        <div className="grow glass-text">
          {eyebrow && <span className="glass-eyebrow">{eyebrow}</span>}
          <h1 className="glass-title">{title}</h1>
        </div>
        {right}
      </header>
      <div className={`compact-bar${compact ? ' on' : ''}`} aria-hidden={!compact} inert={compact ? undefined : ''}>
        <div className="glass">
          {backBtn}
          {small}
          <span className="grow glass-title ellipsis">{title}</span>
          {right}
        </div>
      </div>
    </>
  );
}

// A section title with an optional action on the right (« + Nouvelle », « Tout voir »).
export function SectionHead({ title, action = null }) {
  return <div className="sec-head"><h2>{title}</h2>{action}</div>;
}

// Sport figures in tiles: [{ icon, kind: 'gym' | 'run', value, unit, label }]. Only real numbers.
export function StatGrid({ items, cols }) {
  return (
    <div className="stat-grid" style={{ '--cols': cols || items.length }}>
      {items.map((it) => (
        <div key={it.label} className={`stat${it.kind ? ` k-${it.kind}` : ''}`}>
          {it.icon && <Icon name={it.icon} size={20} />}
          <b className="display">{it.value}{it.unit && <small>{it.unit}</small>}</b>
          <span>{it.label}</span>
        </div>
      ))}
    </div>
  );
}

// A quick link tile: icon, title, one line of context.
export function Shortcut({ to, icon, kind, title, detail }) {
  return (
    <Link to={to} className="shortcut">
      <span className={`tile-icon${kind ? ` k-${kind}` : ''}`}><Icon name={icon} size={20} /></span>
      <span className="grow" style={{ minWidth: 0 }}>
        <b>{title}</b>
        {detail && <span className="xs muted">{detail}</span>}
      </span>
    </Link>
  );
}

// Grouped list (iOS settings): a title, the rows, a footnote.
export function Group({ title, foot, children, id }) {
  return (
    <section className="stack" style={{ gap: 8 }} aria-labelledby={id}>
      {title && <h2 className="glabel" id={id}>{title}</h2>}
      <div className="glist">{children}</div>
      {foot}
    </section>
  );
}

// One row of a grouped list: icon (monochrome unless tone is set), label, value or control.
export function SettingRow({ icon, tone, children, onClick, to, right, danger, chevron, ...rest }) {
  const inner = (
    <>
      {icon && <span className={`gi${tone ? ` c-${tone}` : ''}`}><Icon name={icon} size={17} /></span>}
      <span className="grow gl" style={danger ? { color: 'var(--danger)' } : null}>{children}</span>
      {right}
    </>
  );
  if (to) return <Link to={to} className="grow-row" {...rest}>{inner}<Icon name="chevron" size={16} /></Link>;
  if (onClick) return <button className="grow-row" onClick={onClick} {...rest}>{inner}{chevron && <Icon name="chevron" size={16} />}</button>;
  return <div className="grow-row" {...rest}>{inner}</div>;
}

export function Nav() {
  const { pathname } = useLocation();
  return (
    <nav className="nav" aria-label="Navigation principale">
      <div className="nav-in">
        {TABS.map(([to, icon, label]) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive || (to === '/profil' && pathname.startsWith('/reglages')) ? 'active' : '')}>
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
