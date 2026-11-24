-- Bêta : codes d'invitation, places bêta (50, premium 1 an), avis des utilisateurs.
-- Non destructif : uniquement des créations.

-- Codes d'invitation. Aucun accès direct depuis l'app (RLS sans politique) :
-- ils sont créés par le back-office (fonction edge « admin ») et utilisés par redeem_invite().
create table if not exists public.invite_codes (
  code text primary key check (code ~ '^[A-Z0-9-]{6,32}$'),
  note text,
  max_uses int not null default 1 check (max_uses > 0),
  uses int not null default 0 check (uses >= 0),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.invite_codes enable row level security;

-- Droits d'accès accordés à un compte (aujourd'hui : la bêta ; plus tard : codes promo, comptes offerts).
create table if not exists public.grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('beta')),
  seat int,
  code text references public.invite_codes(code) on delete set null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, kind)
);
create unique index if not exists grants_beta_seat on public.grants (seat) where kind = 'beta';
create index if not exists grants_code_idx on public.grants (code);
alter table public.grants enable row level security;
create policy "grants own read" on public.grants for select to authenticated using (user_id = (select auth.uid()));

-- Essais de code ratés (limite : 10 par heure et par compte, contre les essais au hasard).
create table if not exists public.invite_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists invite_attempts_user_at on public.invite_attempts (user_id, at);
alter table public.invite_attempts enable row level security;

-- Avis envoyés depuis l'app (« Donner mon avis »), lus dans le back-office.
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 4000),
  page text check (char_length(page) <= 200),
  app_version text check (char_length(app_version) <= 50),
  platform text check (char_length(platform) <= 50),
  status text not null default 'new' check (status in ('new', 'read', 'done')),
  created_at timestamptz not null default now()
);
create index if not exists feedback_user_idx on public.feedback (user_id);
alter table public.feedback enable row level security;
create policy "feedback own insert" on public.feedback for insert to authenticated with check (user_id = (select auth.uid()));
create policy "feedback own read" on public.feedback for select to authenticated using (user_id = (select auth.uid()));

-- Utilise un code : place bêta n° (places déjà données + 1), premium pendant 1 an.
-- Une place donnée reste comptée (même si le compte est supprimé ou la place retirée).
-- Renvoie { seat, ends_at } ou { error } (pas d'exception, pour garder la trace des essais ratés).
create or replace function public.redeem_invite(p_code text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  c public.invite_codes;
  g public.grants;
  given int;
  wanted text := upper(btrim(coalesce(p_code, '')));
begin
  if uid is null then return jsonb_build_object('error', 'Non connecté.'); end if;
  select * into g from public.grants where user_id = uid and kind = 'beta';
  if found then return jsonb_build_object('seat', g.seat, 'ends_at', g.ends_at, 'already', true); end if;
  if (select count(*) from public.invite_attempts where user_id = uid and at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('error', 'Trop d''essais. Réessaie dans une heure.');
  end if;
  perform pg_advisory_xact_lock(hashtext('kadence-beta-seats'));
  select * into c from public.invite_codes where code = wanted for update;
  if not found or c.uses >= c.max_uses or (c.expires_at is not null and c.expires_at < now()) then
    insert into public.invite_attempts (user_id) values (uid);
    return jsonb_build_object('error', 'Code inconnu, expiré ou déjà utilisé.');
  end if;
  select coalesce(sum(uses), 0) into given from public.invite_codes;
  if given >= 50 then
    return jsonb_build_object('error', 'Les 50 places bêta sont déjà prises.');
  end if;
  insert into public.grants (user_id, kind, seat, code, starts_at, ends_at)
    values (uid, 'beta', given + 1, c.code, now(), now() + interval '1 year')
    returning * into g;
  update public.invite_codes set uses = uses + 1 where code = c.code;
  return jsonb_build_object('seat', g.seat, 'ends_at', g.ends_at);
end;
$function$;
revoke all on function public.redeem_invite(text) from public, anon;
grant execute on function public.redeem_invite(text) to authenticated;

-- Premium pour le compte connecté : superadmin, ou accès en cours (bêta aujourd'hui, abonnement plus tard).
create or replace function public.is_premium()
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select auth.uid() is not null and (
    exists (select 1 from public.app_roles where user_id = auth.uid() and role = 'superadmin')
    or exists (select 1 from public.grants where user_id = auth.uid() and revoked_at is null
               and starts_at <= now() and (ends_at is null or ends_at > now()))
  );
$function$;
revoke all on function public.is_premium() from public, anon;
grant execute on function public.is_premium() to authenticated;

-- Le visiteur non connecté n'a aucune raison d'appeler is_superadmin().
revoke execute on function public.is_superadmin() from public, anon;
