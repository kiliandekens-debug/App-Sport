// Fil des amis : carte d'une publication, et feuille « Partager avec tes amis ».
import { useEffect, useState } from 'react';
import { useModal } from './modal.js';
import { useUi } from './ui.jsx';
import { Icon } from './components.jsx';
import { fmtKg } from './lib/stats.js';
import { mmss, hms } from './lib/running.js';
import { publish, gymPost, runPost, ensureProfile } from './social.js';

const COLORS = ['#7CCFF2', '#3DD68C', '#FFC933', '#B79CFF', '#FF8FB1', '#00A3FF'];
const INK = { '#7CCFF2': '#0B2230', '#3DD68C': '#07160E', '#FFC933': '#2A1E00', '#B79CFF': '#1B1036', '#FF8FB1': '#3A0B1C', '#00A3FF': '#00121F' };
const colorOf = (id = '') => COLORS[[...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 997, 7) % COLORS.length];
const initials = (name = '?') => (name.trim()[0] || '?').toUpperCase();
// The signed-in user: always the brand blue, as on the profile.
let ME = null;
export const setMe = (id) => { ME = id || null; };
const n1 = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
const n2 = (v) => String(Math.round(v * 100) / 100).replace('.', ',');
const BAR = { warm: 'var(--z0)', cool: 'var(--z0)', rest: 'var(--z0)', recovery: 'var(--z0)', easy: 'var(--z1)', steady: 'var(--z1)', race: 'var(--z2)', tempo: 'var(--z3)', fast: 'var(--z4)', rep: 'var(--z4)', hill: 'var(--z4)', stride: 'var(--z4)' };

export function Avatar({ id, name, size = 40 }) {
  const me = id === 'me' || (ME && id === ME);
  const c = me ? 'var(--brand)' : colorOf(id);
  return <span aria-hidden="true" className="avatar display" style={{ width: size, height: size, borderRadius: size / 2, background: c, color: me ? 'var(--on-brand)' : INK[c], fontSize: Math.round(size * 0.46) }}>{initials(name)}</span>;
}

export function ago(iso) {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 2) return 'À l\'instant';
  if (mins < 60) return `Il y a ${mins} min`;
  if (mins < 24 * 60) return `Il y a ${Math.round(mins / 60)} h`;
  const days = Math.round(mins / 1440);
  if (days === 1) return 'Hier';
  if (days < 7) return d.toLocaleDateString('fr-FR', { weekday: 'long' }).replace(/^./, (c) => c.toUpperCase());
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

const KIND = { gym: 'Musculation', run: 'Course', walk: 'Marche' };

// The numbers of a post, by kind.
export function PostBody({ p, full = false }) {
  const s = p.stats || {};
  if (p.kind === 'gym') {
    return (
      <>
        <div className="post-kpis">
          {s.mins != null && <span><b>{s.mins}</b>min</span>}
          <span><b>{s.sets}</b>série{s.sets > 1 ? 's' : ''}</span>
          <span><b>{fmtKg(s.tonnes)} t</b>soulevées</span>
        </div>
        {(s.records || []).slice(0, full ? 3 : 1).map((r) => <div key={r} className="post-record"><b>Nouveau record</b> · {r}</div>)}
        {full && (
          <div className="list">
            {(s.exercises || []).map((e) => (
              <div key={e.n} className="between" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
                <span className="stack" style={{ gap: 1 }}><span style={{ fontWeight: 650 }}>{e.n}</span><span className="xs muted">{e.s} série{e.s > 1 ? 's' : ''}{e.b ? ` · meilleure ${e.b}` : ''}</span></span>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }
  const walk = p.kind === 'walk' || s.activity === 'treadmill';
  const total = (s.bars || []).reduce((a, b) => a + b[0], 0);
  return (
    <>
      <div className="post-kpis">
        <span><b>{n2(s.km || 0)}</b>km</span>
        {walk ? <span><b>{n1(s.speed || 0)}</b>km/h</span> : <span><b>{s.km ? mmss(Math.round(s.secs / s.km)) : '–'}</b>/km</span>}
        {s.elevation ? <span><b>{s.elevation}</b>m D+</span> : <span><b>{hms(s.secs || 0)}</b>durée</span>}
      </div>
      {total > 0 && (
        <div className="post-bars" role="img" aria-label="Profil de la séance">
          {s.bars.map((b, i) => <span key={i} style={{ flex: b[0] / total, height: `${Math.max(25, b[1] * 100)}%`, background: BAR[b[2]] || 'var(--z1)' }} />)}
        </div>
      )}
      {full && s.hr ? <span className="small muted">Fréquence cardiaque moyenne : {s.hr} bpm</span> : null}
    </>
  );
}

export function PostCard({ p, onOpen, onBravo, onMore }) {
  const s = p.stats || {};
  const badge = p.kind === 'gym' ? (s.records?.length ? ['Record', 'rec'] : null) : s.held != null && s.held === s.of ? ['Allure tenue', 'ok'] : null;
  return (
    <article className="card post" aria-label={`${p.name}, ${p.title}`}>
      <div className="row" style={{ gap: 10 }}>
        <Avatar id={p.user_id} name={p.name} />
        <span className="grow stack" style={{ gap: 0, minWidth: 0 }}>
          <span style={{ fontWeight: 700 }}>{p.mine ? 'Toi' : p.name}</span>
          <span className="xs muted" style={{ textTransform: 'none' }}>{ago(p.done_at)} · {KIND[p.kind]}</span>
        </span>
        {badge && <span className={`tag ${badge[1]}`}>{badge[0]}</span>}
        {onMore && <button className="icon-btn" aria-label="Plus d'options" onClick={() => onMore(p)} style={{ width: 36, height: 36 }}><Icon name="more" size={18} /></button>}
      </div>
      <button className="post-open" onClick={() => onOpen(p)}>
        <span className="display" style={{ fontSize: 20 }}>{p.title}</span>
        <PostBody p={p} />
        {p.note && <span style={{ color: 'var(--soft)', lineHeight: 1.4 }}>{p.note}</span>}
      </button>
      <div className="post-actions">
        <button className={p.bravoed ? 'on' : ''} aria-pressed={p.bravoed} onClick={() => onBravo(p)}><Icon name="flame" size={18} fill={p.bravoed ? 'currentColor' : undefined} />Bravo{p.bravos ? ` · ${p.bravos}` : ''}</button>
        <button onClick={() => onOpen(p)} aria-label={`Commentaires : ${p.comments}`}><Icon name="chat" size={18} />{p.comments || ''}</button>
      </div>
    </article>
  );
}

// « Partager avec tes amis » : aperçu, un mot, et ce qui est visible. Fréquence cardiaque cachée par défaut.
export function ShareSheet({ source, data, onClose, onDone }) {
  const ui = useUi();
  const ref = useModal(!!source, onClose);
  const [note, setNote] = useState('');
  const [loads, setLoads] = useState(true);
  const [hr, setHr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  useEffect(() => { if (source) ensureProfile().then((p) => setName(p.name)).catch(() => {}); }, [source]);
  if (!source) return null;
  const post = source.kind === 'gym' ? gymPost(source.w, data, { loads }) : runPost(source.l, data, { hr });
  const preview = { ...post, id: 'preview', user_id: 'me', name: name || 'Toi', mine: true, note: note.trim() || null, bravos: 0, comments: 0, bravoed: false };
  const go = async () => {
    setBusy(true);
    try { await publish({ ...post, note: note.trim() || null }); onDone?.(); onClose(); ui.notify('Publié pour tes amis'); } catch (e) { ui.notify(e.message || String(e)); } finally { setBusy(false); }
  };
  return (
    <div className="overlay" onClick={onClose}>
      <div ref={ref} tabIndex={-1} className="sheet wsheet" role="dialog" aria-modal="true" aria-label="Partager avec tes amis" onClick={(e) => e.stopPropagation()}>
        <span className="sheet-grip" />
        <div className="between"><span className="display" style={{ fontSize: 22 }}>Partager avec tes amis ?</span><button className="icon-btn" aria-label="Fermer" onClick={onClose}><Icon name="close" /></button></div>
        <PostCard p={preview} onOpen={() => {}} onBravo={() => {}} />
        <label className="stack" style={{ gap: 4 }}><span className="xs muted">Un mot (facultatif)</span><input className="input" maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Comment ça s'est passé ?" /></label>
        <div className="glist">
          {source.kind === 'gym'
            ? <label className="share-opt"><span>Charges, séries et records</span><input type="checkbox" checked={loads} onChange={(e) => setLoads(e.target.checked)} /></label>
            : <label className="share-opt"><span className="stack" style={{ gap: 0 }}><span>Fréquence cardiaque</span><span className="xs muted">Donnée de santé : cachée par défaut</span></span><input type="checkbox" checked={hr} onChange={(e) => setHr(e.target.checked)} /></label>}
        </div>
        <button className="btn primary big" disabled={busy} onClick={go}>Publier pour mes amis</button>
        <button className="btn" onClick={onClose}>Garder pour moi</button>
        <span className="xs muted" style={{ textAlign: 'center' }}>Visible seulement par tes amis. Tu peux retirer la publication à tout moment.</span>
      </div>
    </div>
  );
}

