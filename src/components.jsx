import { NavLink } from 'react-router-dom';

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
  chevron: <path d="M9 6l6 6-6 6" />,
  play: <path d="M7 4l12 8-12 8z" />,
  swap: <path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />,
  next: <path d="M5 12h14M13 6l6 6-6 6" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>,
  skip: <path d="M5 5l10 7-10 7zM19 5v14" />,
  watch: <><rect x="6" y="6" width="12" height="12" rx="3" /><path d="M9 6l1-3h4l1 3M9 18l1 3h4l1-3" /></>,
  upload: <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
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
  ['/coach', 'spark', 'Coach'],
  ['/profil', 'user', 'Profil'],
];

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

export function Loading({ text = 'Chargement de tes séances…' }) {
  return <div className="center"><span className="muted">{text}</span></div>;
}
