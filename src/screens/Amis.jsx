import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useData } from '../data.jsx';
import { useUi } from '../ui.jsx';
import { useModal } from '../modal.js';
import { Icon, GlassHeader } from '../components.jsx';
import { Avatar, PostCard, PostBody, ago } from '../social.jsx';
import { ensureProfile, updateProfile, loadFriends, loadFeed, loadComments, addComment, deleteComment, setBravo, unpublish, requestFriend, respondFriend, removeFriend, blockUser, report, ranking, INVITE_BASE } from '../social.js';
import { saveRoutine } from '../data.jsx';

const n1 = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
const METRICS = [['sessions', 'Séances', (v) => String(v)], ['km', 'Km', n1], ['dplus', 'D+', (v) => `${Math.round(v)}`], ['tonnes', 'Tonnes', n1]];

// Everything the screen needs, loaded together.
function useSocial() {
  const [st, setSt] = useState({ loading: true, error: null, profile: null, friends: null, posts: [] });
  const load = useCallback(async () => {
    try {
      const profile = await ensureProfile();
      const [friends, posts] = await Promise.all([loadFriends(), loadFeed()]);
      setSt({ loading: false, error: null, profile, friends, posts });
    } catch (e) {
      setSt((s) => ({ ...s, loading: false, error: e.message || String(e) }));
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  return [st, load, setSt];
}

// Me and every friend, with zeros for those who shared nothing this week.
function fullRank(posts, friends, profile, metric = 'sessions') {
  const r = ranking(posts);
  return [{ user: friends.me, name: profile.name, mine: true }, ...friends.friends.map((f) => ({ user: f.user, name: f.name }))]
    .map((x) => ({ sessions: 0, km: 0, dplus: 0, tonnes: 0, streak: 0, ...x, ...(r.find((y) => y.user === x.user) || {}), name: x.name, mine: !!x.mine }))
    .sort((a, b) => b[metric] - a[metric] || b.sessions - a.sessions || (b.mine ? 1 : 0) - (a.mine ? 1 : 0));
}

// One post opened: the details, bravos and comments.
function PostSheet({ post, onClose, onChanged, me }) {
  const ui = useUi();
  const data = useData();
  const ref = useModal(!!post, onClose);
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const reload = useCallback(() => { if (post) loadComments(post.id).then(setComments).catch(() => {}); }, [post]);
  useEffect(() => { setComments([]); reload(); }, [reload]);
  if (!post) return null;
  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try { await addComment(post.id, text); setText(''); reload(); onChanged(); } catch (err) { ui.notify(err.message || String(err)); } finally { setBusy(false); }
  };
  const ex = post.kind === 'gym' ? post.stats?.exercises || [] : [];
  const copy = async () => {
    const name = await ui.prompt({ title: 'Ajouter à mes routines', message: 'Les charges sont celles de ton ami : le coach les ajustera à ta première séance.', value: `${post.title} (${post.name})`.slice(0, 60), ok: 'Ajouter' });
    if (!name) return;
    try {
      await saveRoutine({ name, position: data.routines.length, exercises: ex.map((e) => ({ name: e.n, rest: 90, superset: null, sets: (e.sets || Array.from({ length: e.s }, () => ({ kg: null, reps: 10 }))).map((s) => ({ type: 'normal', kg: s.kg ?? null, reps: s.reps ?? 10 })) })) });
      await data.refresh();
      ui.notify('Routine ajoutée : elle est sur l\'accueil');
    } catch (err) { ui.notify(err.message || String(err)); }
  };
  const removeComment = async (c) => {
    if (!(await ui.confirm({ title: 'Supprimer ce commentaire ?', ok: 'Supprimer', danger: true }))) return;
    try { await deleteComment(c.id); reload(); onChanged(); } catch (err) { ui.notify(err.message || String(err)); }
  };
  const reportComment = async (c) => {
    if (!(await ui.confirm({ title: 'Signaler ce commentaire ?', message: 'Il sera examiné par l\'équipe Kadence.', ok: 'Signaler' }))) return;
    try { await report({ commentId: c.id, userId: c.user_id }); ui.notify('Merci, c\'est signalé'); } catch (err) { ui.notify(err.message || String(err)); }
  };
  return (
    <div className="overlay" onClick={onClose}>
      <div ref={ref} tabIndex={-1} className="sheet wsheet" role="dialog" aria-modal="true" aria-label={post.title} onClick={(e) => e.stopPropagation()}>
        <span className="sheet-grip" />
        <div className="row" style={{ gap: 10 }}>
          <Avatar id={post.user_id} name={post.name} />
          <span className="grow stack" style={{ gap: 0 }}><span style={{ fontWeight: 700 }}>{post.mine ? 'Toi' : post.name}</span><span className="xs muted">{ago(post.done_at)}</span></span>
          <button className="icon-btn" aria-label="Fermer" onClick={onClose}><Icon name="close" /></button>
        </div>
        <span className="display" style={{ fontSize: 26 }}>{post.title}</span>
        <PostBody p={post} full />
        {post.note && <span style={{ lineHeight: 1.4 }}>{post.note}</span>}
        {ex.length > 0 && !post.mine && <button className="btn primary" onClick={copy}><Icon name="plus" size={16} />Ajouter à mes routines</button>}
        <section className="stack" style={{ gap: 8 }} aria-label="Commentaires">
          <span className="label">{post.bravos ? `${post.bravos} bravo${post.bravos > 1 ? 's' : ''} · ` : ''}{comments.length} commentaire{comments.length > 1 ? 's' : ''}</span>
          {comments.map((c) => (
            <div key={c.id} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
              <Avatar id={c.user_id} name={c.name} size={30} />
              <div className="comment grow"><b>{c.user_id === me ? 'Toi' : c.name}</b> {c.body}</div>
              {(c.user_id === me || post.mine) ? <button className="icon-btn" aria-label="Supprimer le commentaire" onClick={() => removeComment(c)} style={{ width: 32, height: 32 }}><Icon name="trash" size={15} /></button>
                : <button className="icon-btn" aria-label="Signaler le commentaire" onClick={() => reportComment(c)} style={{ width: 32, height: 32 }}><Icon name="flag" size={15} /></button>}
            </div>
          ))}
          <form className="row" style={{ gap: 8 }} onSubmit={send}>
            <input className="input grow" aria-label="Ton commentaire" maxLength={500} placeholder="Écrire un commentaire" value={text} onChange={(e) => setText(e.target.value)} />
            <button className="icon-btn" aria-label="Envoyer" disabled={busy || !text.trim()} style={{ background: 'var(--accent)', color: 'var(--on-brand)' }}><Icon name="send" size={18} /></button>
          </form>
        </section>
      </div>
    </div>
  );
}

// Invitation, requests, friends and ranking.
function Manage({ st, reload }) {
  const ui = useUi();
  const [metric, setMetric] = useState('sessions');
  const { profile, friends, posts } = st;
  const link = `${INVITE_BASE}${profile.invite_code}`;
  const share = async () => {
    const text = `Rejoins-moi sur Kadence pour suivre nos séances : ${link}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Kadence', text, url: link });
      else { await navigator.clipboard.writeText(link); ui.notify('Lien copié'); }
    } catch { /* cancelled */ }
  };
  const enterCode = async () => {
    const code = await ui.prompt({ title: 'Code d\'un ami', message: 'Le code de 8 caractères que ton ami voit sous « Mon code ».', placeholder: 'AB12CD34', ok: 'Envoyer' });
    if (!code) return;
    try {
      const r = await requestFriend(code);
      ui.notify(r.error || (r.status === 'accepted' ? `Toi et ${r.name} êtes amis` : `Demande envoyée à ${r.name}`));
      reload();
    } catch (e) { ui.notify(e.message || String(e)); }
  };
  const answer = async (f, ok) => {
    try { await respondFriend(f.id, ok); ui.notify(ok ? `Toi et ${f.name} êtes amis` : 'Demande refusée'); reload(); } catch (e) { ui.notify(e.message || String(e)); }
  };
  const friendMenu = async (f) => {
    const what = await ui.confirm({ title: f.name, message: 'Retirer cet ami ? Vous ne verrez plus vos séances l\'un de l\'autre.', ok: 'Retirer', danger: true });
    if (!what) return;
    try { await removeFriend(f.id); reload(); } catch (e) { ui.notify(e.message || String(e)); }
  };
  const rename = async () => {
    const name = await ui.prompt({ title: 'Ton nom pour tes amis', value: profile.name, ok: 'Enregistrer' });
    if (!name || !name.trim()) return;
    try { await updateProfile({ name: name.trim().slice(0, 40) }); reload(); } catch (e) { ui.notify(e.message || String(e)); }
  };
  const rank = useMemo(() => fullRank(posts, friends, profile, metric), [posts, friends, profile, metric]);
  const fmt = METRICS.find((m) => m[0] === metric)[2];

  return (
    <div className="pad stack" style={{ gap: 12, paddingTop: 10 }}>
      <section className="card invite stack" style={{ gap: 8 }} aria-label="Inviter">
        <span className="display" style={{ fontSize: 20 }}>Invite un pote</span>
        <span className="small" style={{ lineHeight: 1.4 }}>Il reçoit un lien. Une fois inscrit, il t'envoie une demande ; tu acceptes et vous voyez vos séances partagées.</span>
        <button className="btn" onClick={share} style={{ background: 'var(--on-brand)', color: '#fff' }}><Icon name="upload" size={16} />Partager mon lien</button>
        <span className="xs" style={{ opacity: 0.85 }}>Mon code : <b style={{ letterSpacing: '0.08em' }}>{profile.invite_code}</b></span>
      </section>
      <button className="btn" onClick={enterCode}><Icon name="plus" size={16} />J'ai le code d'un ami</button>

      {friends.incoming.map((f) => (
        <section key={f.id} className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }} aria-label={`Demande de ${f.name}`}>
          <Avatar id={f.user} name={f.name} />
          <span className="grow stack" style={{ gap: 0 }}><span style={{ fontWeight: 700 }}>{f.name}</span><span className="xs muted">veut être ton ami</span></span>
          <button className="btn primary" style={{ height: 38, padding: '0 12px' }} onClick={() => answer(f, true)}>Accepter</button>
          <button className="icon-btn" aria-label={`Refuser ${f.name}`} onClick={() => answer(f, false)}><Icon name="close" size={16} /></button>
        </section>
      ))}

      <section className="stack" style={{ gap: 8 }} aria-label="Classement de la semaine">
        <h2 className="label">Classement de la semaine</h2>
        <div className="seg" role="group" aria-label="Critère" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          {METRICS.map(([k, l]) => <button key={k} className={metric === k ? 'on' : ''} aria-pressed={metric === k} onClick={() => setMetric(k)}>{l}</button>)}
        </div>
        <ol className="list rank">
          {rank.map((x, i) => (
            <li key={x.user} className={x.mine ? 'me' : ''}>
              <b className="display" style={{ width: 18, color: i === 0 && x[metric] > 0 ? 'var(--warm)' : undefined }}>{i + 1}</b>
              <Avatar id={x.user} name={x.name} size={32} />
              <span className="grow" style={{ fontWeight: x.mine ? 700 : 600 }}>{x.mine ? 'Toi' : x.name}</span>
              {x.streak > 1 && <span className="xs" style={{ color: 'var(--accent)', fontWeight: 700 }}>{x.streak} sem.</span>}
              <b className="display" style={{ minWidth: 30, textAlign: 'right' }}>{fmt(x[metric])}</b>
            </li>
          ))}
        </ol>
        <span className="xs muted">Compté sur les séances publiées. « sem. » : semaines d'affilée avec au moins 2 séances.</span>
      </section>

      {(friends.friends.length > 0 || friends.outgoing.length > 0) && (
        <section className="stack" style={{ gap: 8 }} aria-label="Mes amis">
          <h2 className="label">Mes amis</h2>
          <div className="list">
            {friends.friends.map((f) => (
              <button key={f.id} onClick={() => friendMenu(f)} style={{ textAlign: 'left', width: '100%', color: 'inherit', background: 'transparent', border: 'none' }}>
                <Avatar id={f.user} name={f.name} size={32} /><span className="grow" style={{ fontWeight: 600 }}>{f.name}</span><Icon name="more" size={16} />
              </button>
            ))}
            {friends.outgoing.map((f) => (
              <div key={f.id} className="row" style={{ gap: 10, padding: '10px 14px' }}>
                <Avatar id={f.user} name={f.name} size={32} /><span className="grow">{f.name}</span><span className="xs muted">en attente</span>
              </div>
            ))}
          </div>
        </section>
      )}
      <button className="text-btn" onClick={rename}>Ton nom pour tes amis : {profile.name}</button>
    </div>
  );
}

export default function Amis() {
  const ui = useUi();
  const { pathname } = useLocation();
  const manage = pathname === '/amis/gerer';
  const [st, reload, setSt] = useSocial();
  const [open, setOpen] = useState(null);

  if (st.loading) return <main className="screen"><GlassHeader title="Amis" /><div className="pad"><span className="muted">Chargement…</span></div></main>;
  if (st.error || !st.profile) {
    return <main className="screen"><GlassHeader title="Amis" /><div className="pad stack" style={{ gap: 10 }}><span className="muted">Le fil des amis n'est pas disponible pour l'instant.</span><button className="btn" onClick={reload}>Réessayer</button></div></main>;
  }
  const { posts, friends } = st;
  const patch = (id, f) => setSt((s) => ({ ...s, posts: s.posts.map((p) => (p.id === id ? f(p) : p)) }));
  const bravo = async (p) => {
    const on = !p.bravoed;
    patch(p.id, (x) => ({ ...x, bravoed: on, bravos: x.bravos + (on ? 1 : -1) }));
    try { await setBravo(p.id, on); } catch (e) { patch(p.id, (x) => ({ ...x, bravoed: !on, bravos: x.bravos + (on ? -1 : 1) })); ui.notify(e.message || String(e)); }
  };
  const more = async (p) => {
    if (p.mine) {
      if (!(await ui.confirm({ title: 'Retirer cette publication ?', message: 'Elle disparaît du fil de tes amis, avec ses bravos et commentaires. Ta séance reste dans ton historique.', ok: 'Retirer', danger: true }))) return;
      try { await unpublish(p.id); reload(); } catch (e) { ui.notify(e.message || String(e)); }
      return;
    }
    const rep = await ui.confirm({ title: `${p.name} · ${p.title}`, message: 'Signaler cette publication à l\'équipe Kadence ?', ok: 'Signaler' });
    if (rep) { try { await report({ postId: p.id, userId: p.user_id }); ui.notify('Merci, c\'est signalé'); } catch (e) { ui.notify(e.message || String(e)); } }
    const blk = await ui.confirm({ title: `Bloquer ${p.name} ?`, message: 'Vous ne serez plus amis et ne verrez plus rien l\'un de l\'autre.', ok: 'Bloquer', danger: true });
    if (blk) { try { await blockUser(p.user_id); ui.notify(`${p.name} est bloqué`); reload(); } catch (e) { ui.notify(e.message || String(e)); } }
  };

  const recent = posts.filter((p) => Date.now() - new Date(p.done_at).getTime() < 30 * 86400000);
  const meRank = fullRank(posts, friends, st.profile);
  const pos = meRank.findIndex((x) => x.mine) + 1;
  const weekSessions = meRank.reduce((a, x) => a + x.sessions, 0);
  const top = meRank.filter((x) => x.sessions > 0).slice(0, 3);

  return (
    <main className="screen">
      <GlassHeader eyebrow={manage ? 'Invitations et classement' : `${friends.friends.length} ami${friends.friends.length > 1 ? 's' : ''} · ${weekSessions} séance${weekSessions > 1 ? 's' : ''} cette semaine`} title={manage ? 'Mes amis' : 'Amis'}
        lead={manage ? <Link to="/amis" className="icon-btn" aria-label="Retour au fil"><Icon name="back" /></Link> : null}
        right={manage ? null : <Link to="/amis/gerer" className="icon-btn" aria-label={`Inviter et gérer mes amis${friends.incoming.length ? `, ${friends.incoming.length} demande${friends.incoming.length > 1 ? 's' : ''}` : ''}`} style={{ position: 'relative' }}><Icon name="userplus" size={20} />{friends.incoming.length > 0 && <span className="dot" />}</Link>} />
      {manage ? <Manage st={st} reload={reload} /> : (
        <div className="pad stack" style={{ gap: 12, paddingTop: 10 }}>
          {friends.incoming.length > 0 && <Link to="/amis/gerer" className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, color: 'inherit', textDecoration: 'none', padding: 12 }}><Icon name="userplus" /><span className="grow" style={{ fontWeight: 650 }}>{friends.incoming.length} demande{friends.incoming.length > 1 ? 's' : ''} d'ami</span><Icon name="chevron" size={16} /></Link>}
          {friends.friends.length === 0 ? (
            <section className="card stack" style={{ gap: 10 }}>
              <span className="display" style={{ fontSize: 22 }}>Ton fil est vide</span>
              <span className="small muted" style={{ lineHeight: 1.45 }}>Invite tes potes : vous verrez les séances que chacun choisit de partager, avec bravos et commentaires. Rien n'est public.</span>
              <Link to="/amis/gerer" className="btn primary"><Icon name="userplus" size={18} />Inviter un ami</Link>
            </section>
          ) : (
            <Link to="/amis/gerer" className="row" style={{ gap: 8, color: 'inherit', textDecoration: 'none' }} aria-label="Classement de la semaine">
              <div className="card" style={{ flex: 1, padding: '10px 12px', gap: 2 }}><span className="label">Ta place</span><span className="display" style={{ fontSize: 22 }}>{pos || '–'}<span className="small muted"> sur {friends.friends.length + 1}</span></span></div>
              <div className="card" style={{ flex: 2, padding: '10px 12px', gap: 6 }}>
                <span className="label">Séances cette semaine</span>
                <span className="row" style={{ gap: 6 }}>{top.length ? top.map((x) => <span key={x.user} className="row" style={{ gap: 4 }}><Avatar id={x.user} name={x.name} size={26} /><b className="small">{x.sessions}</b></span>) : <span className="small muted">Personne encore</span>}</span>
              </div>
            </Link>
          )}
          {recent.map((p) => <PostCard key={p.id} p={p} onOpen={setOpen} onBravo={bravo} onMore={more} />)}
          {recent.length === 0 && friends.friends.length > 0 && <span className="small muted">Aucune séance partagée ces 30 derniers jours. À la fin d'une séance, touche « Partager avec mes amis ».</span>}
          {recent.length > 0 && <span className="xs muted" style={{ textAlign: 'center' }}>Les 30 derniers jours</span>}
        </div>
      )}
      <PostSheet post={open} me={friends.me} onClose={() => setOpen(null)} onChanged={reload} />
    </main>
  );
}

