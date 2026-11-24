import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import postgres from "npm:postgres@3.4.5";

// Back-office de Kadence (admin.kadeon.be). Tout passe ici, côté serveur :
// l'app web ne contient aucun code d'administration et les comptes ordinaires n'ont accès à rien.
// Chaque appel vérifie que le jeton appartient à un superadmin (table app_roles).
// Ne renvoie que de l'activité (dates, nombres), jamais le contenu des séances ou des courses.

const ALLOWED = [/^https:\/\/admin\.kadeon\.be$/, /^https:\/\/kadence-admin[a-z0-9-]*\.vercel\.app$/, /^http:\/\/localhost:\d+$/];
const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ALLOWED.some((r) => r.test(origin)) ? origin : "https://admin.kadeon.be",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { max: 1, prepare: false });
const auth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });

// Codes lisibles : pas de 0/O, 1/I/L.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(8));
  const s = [...b].map((x) => ALPHABET[x % ALPHABET.length]).join("");
  return `KAD-${s.slice(0, 4)}-${s.slice(4)}`;
}

async function overview() {
  const users = await sql`
    select u.id, u.email, u.created_at, u.last_sign_in_at, u.email_confirmed_at,
      coalesce(u.raw_app_meta_data->>'provider', 'email') as provider,
      coalesce(r.role, 'user') as role,
      (select count(*)::int from public.workouts w where w.user_id = u.id) as workouts,
      (select max(w.started_at) from public.workouts w where w.user_id = u.id) as last_workout,
      (select count(*)::int from public.run_logs l where l.user_id = u.id) as runs,
      (select max(l.done_at) from public.run_logs l where l.user_id = u.id) as last_run,
      ((select count(*) from public.workouts w where w.user_id = u.id and w.started_at > now() - interval '7 days')
        + (select count(*) from public.run_logs l where l.user_id = u.id and l.done_at > now() - interval '7 days'))::int as last7,
      (select count(*)::int from public.feedback f where f.user_id = u.id) as feedback,
      g.seat, g.starts_at as beta_start, g.ends_at as beta_end, g.revoked_at as beta_revoked, g.code as beta_code
    from auth.users u
    left join public.app_roles r on r.user_id = u.id
    left join public.grants g on g.user_id = u.id and g.kind = 'beta'
    order by u.created_at`;
  const [health] = await sql`
    select
      (select count(*)::int from cron.job_run_details where start_time > now() - interval '24 hours') as cron_runs,
      (select count(*)::int from cron.job_run_details where start_time > now() - interval '24 hours' and status <> 'succeeded') as cron_fails,
      (select max(start_time) from cron.job_run_details) as cron_last,
      (select count(*)::int from public.scheduled_pushes where sent_at is null and send_at < now() - interval '2 minutes') as pushes_late,
      (select count(*)::int from public.scheduled_pushes where sent_at > now() - interval '24 hours') as pushes_sent,
      (select count(*)::int from public.push_subscriptions) as push_devices,
      (select count(*)::int from auth.users where created_at > now() - interval '7 days') as signups7,
      (select count(*)::int from auth.users where created_at > now() - interval '30 days') as signups30,
      pg_database_size(current_database())::bigint as db_bytes`;
  const codes = await sql`select code, note, uses, max_uses, expires_at, created_at from public.invite_codes order by created_at desc`;
  const [{ given }] = await sql`select coalesce(sum(uses), 0)::int as given from public.invite_codes`;
  const feedback = await sql`
    select f.id, f.message, f.page, f.app_version, f.platform, f.status, f.created_at, u.email
    from public.feedback f left join auth.users u on u.id = f.user_id
    order by f.created_at desc limit 200`;
  return { users, health, beta: { given, total: 50, codes }, feedback, at: new Date().toISOString() };
}

Deno.serve(async (req: Request) => {
  const headers = cors(req.headers.get("origin"));
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: who, error: authErr } = await auth.auth.getUser(token);
  if (authErr || !who?.user) return json({ error: "Session expirée, reconnecte-toi." }, 401);
  const me = who.user.id;
  const [role] = await sql`select role from public.app_roles where user_id = ${me}`;
  if (role?.role !== "superadmin") return json({ error: "Accès réservé au superadmin." }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Requête invalide." }, 400); }

  try {
    switch (body.action) {
      case "overview":
        return json(await overview());
      case "create_codes": {
        const count = Math.min(20, Math.max(1, Number(body.count) || 1));
        const maxUses = Math.min(50, Math.max(1, Number(body.max_uses) || 1));
        const days = Number(body.expires_days) || 0;
        const note = String(body.note || "").slice(0, 200) || null;
        const rows = Array.from({ length: count }, () => ({
          code: newCode(), note, max_uses: maxUses,
          expires_at: days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null,
        }));
        await sql`insert into public.invite_codes ${sql(rows, "code", "note", "max_uses", "expires_at")}`;
        return json({ codes: rows.map((r) => r.code) });
      }
      case "disable_code":
        await sql`update public.invite_codes set max_uses = greatest(uses, 1), expires_at = now() where code = ${String(body.code)}`;
        return json({ ok: true });
      case "revoke_beta":
        await sql`update public.grants set revoked_at = now() where user_id = ${String(body.user_id)} and kind = 'beta'`;
        return json({ ok: true });
      case "restore_beta":
        await sql`update public.grants set revoked_at = null where user_id = ${String(body.user_id)} and kind = 'beta'`;
        return json({ ok: true });
      case "feedback_status": {
        const status = String(body.status);
        if (!["new", "read", "done"].includes(status)) return json({ error: "Statut inconnu." }, 400);
        await sql`update public.feedback set status = ${status} where id = ${String(body.id)}`;
        return json({ ok: true });
      }
      case "set_role": {
        const target = String(body.user_id);
        const newRole = String(body.role);
        if (target === me) return json({ error: "Ton propre rôle ne se change pas ici." }, 400);
        if (!["superadmin", "admin", "user"].includes(newRole)) return json({ error: "Rôle inconnu." }, 400);
        await sql`insert into public.app_roles (user_id, role) values (${target}, ${newRole})
                  on conflict (user_id) do update set role = excluded.role`;
        return json({ ok: true });
      }
      default:
        return json({ error: "Action inconnue." }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: "Erreur serveur." }, 500);
  }
});
