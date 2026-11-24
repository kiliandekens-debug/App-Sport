-- Fil des amis : profils visibles des amis, demandes d'amis, publications de séances, bravos,
-- commentaires, blocages et signalements. Non destructif : uniquement des tables nouvelles.
-- Une publication est une copie des chiffres choisis par l'auteur : les amis ne lisent jamais
-- les tables de séances ou de courses. Tout part avec le compte (on delete cascade).

create table if not exists public.social_profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  invite_code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  share_mode text not null default 'ask' check (share_mode in ('ask', 'never')),
  created_at timestamptz not null default now()
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references auth.users(id) on delete cascade,
  addressee uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester <> addressee),
  unique (requester, addressee)
);
create index if not exists friendships_addressee on public.friendships (addressee);

create table if not exists public.blocks (
  blocker uuid not null default auth.uid() references auth.users(id) on delete cascade,
  blocked uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked)
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('gym', 'run', 'walk')),
  ref_id text,
  title text not null check (char_length(title) between 1 and 80),
  note text check (note is null or char_length(note) <= 280),
  done_at timestamptz not null,
  stats jsonb not null default '{}'::jsonb check (pg_column_size(stats) < 16000),
  created_at timestamptz not null default now(),
  unique (user_id, kind, ref_id)
);
create index if not exists posts_user_done on public.posts (user_id, done_at desc);

create table if not exists public.reactions (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists comments_post on public.comments (post_id, created_at);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null default auth.uid() references auth.users(id) on delete cascade,
  post_id uuid references public.posts(id) on delete set null,
  comment_id uuid references public.comments(id) on delete set null,
  reported_user uuid references auth.users(id) on delete set null,
  reason text check (reason is null or char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

-- Amis = demande acceptée, sans blocage dans un sens ou l'autre.
create or replace function public.is_friend(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select a is not null and b is not null and exists (
    select 1 from friendships f
    where f.status = 'accepted' and ((f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a))
  ) and not exists (
    select 1 from blocks k where (k.blocker = a and k.blocked = b) or (k.blocker = b and k.blocked = a)
  );
$$;

create or replace function public.can_see_post(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from posts x where x.id = p and (x.user_id = auth.uid() or is_friend(auth.uid(), x.user_id)));
$$;

alter table public.social_profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.blocks enable row level security;
alter table public.posts enable row level security;
alter table public.reactions enable row level security;
alter table public.comments enable row level security;
alter table public.reports enable row level security;

-- Profils : le sien, ceux des amis, et ceux d'une demande en cours (pour afficher le nom).
create policy "profil lisible" on public.social_profiles for select to authenticated using (
  user_id = auth.uid() or is_friend(auth.uid(), user_id) or exists (
    select 1 from friendships f where f.status = 'pending'
      and ((f.requester = auth.uid() and f.addressee = social_profiles.user_id) or (f.addressee = auth.uid() and f.requester = social_profiles.user_id))
  )
);
create policy "profil à soi (ajout)" on public.social_profiles for insert to authenticated with check (user_id = auth.uid());
create policy "profil à soi (modif)" on public.social_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Demandes : lues par les deux personnes ; créées et acceptées par les fonctions ci-dessous ; retirées par l'une ou l'autre.
create policy "demandes lisibles" on public.friendships for select to authenticated using (auth.uid() in (requester, addressee));
create policy "demandes retirées" on public.friendships for delete to authenticated using (auth.uid() in (requester, addressee));

create policy "blocages à soi" on public.blocks for all to authenticated using (blocker = auth.uid()) with check (blocker = auth.uid());

create policy "publications lisibles" on public.posts for select to authenticated using (user_id = auth.uid() or is_friend(auth.uid(), user_id));
create policy "publications à soi (ajout)" on public.posts for insert to authenticated with check (user_id = auth.uid());
create policy "publications à soi (modif)" on public.posts for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "publications à soi (suppr)" on public.posts for delete to authenticated using (user_id = auth.uid());

create policy "bravos lisibles" on public.reactions for select to authenticated using (can_see_post(post_id));
create policy "bravo donné" on public.reactions for insert to authenticated with check (user_id = auth.uid() and can_see_post(post_id));
create policy "bravo retiré" on public.reactions for delete to authenticated using (user_id = auth.uid());

create policy "commentaires lisibles" on public.comments for select to authenticated using (can_see_post(post_id));
create policy "commentaire écrit" on public.comments for insert to authenticated with check (user_id = auth.uid() and can_see_post(post_id));
create policy "commentaire retiré" on public.comments for delete to authenticated using (
  user_id = auth.uid() or exists (select 1 from posts x where x.id = post_id and x.user_id = auth.uid())
);

create policy "signalement envoyé" on public.reports for insert to authenticated with check (reporter = auth.uid());

-- Demande d'ami avec le code (ou le lien) d'invitation de l'autre. Si l'autre m'avait déjà
-- demandé, on devient amis tout de suite.
create or replace function public.request_friend(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  them social_profiles%rowtype;
  f friendships%rowtype;
begin
  if me is null then raise exception 'Non connecté'; end if;
  select * into them from social_profiles where invite_code = upper(btrim(p_code));
  if not found or exists (select 1 from blocks k where (k.blocker = me and k.blocked = them.user_id) or (k.blocker = them.user_id and k.blocked = me)) then
    return jsonb_build_object('error', 'Code inconnu.');
  end if;
  if them.user_id = me then return jsonb_build_object('error', 'C''est ton propre code.'); end if;
  if (select count(*) from friendships where requester = me and created_at > now() - interval '1 day') >= 20 then
    return jsonb_build_object('error', 'Trop de demandes aujourd''hui. Réessaie demain.');
  end if;
  select * into f from friendships where (requester = me and addressee = them.user_id) or (requester = them.user_id and addressee = me);
  if found then
    if f.status = 'pending' and f.addressee = me then
      update friendships set status = 'accepted' where id = f.id;
      return jsonb_build_object('name', them.name, 'status', 'accepted');
    end if;
    return jsonb_build_object('name', them.name, 'status', f.status);
  end if;
  insert into friendships (requester, addressee) values (me, them.user_id);
  return jsonb_build_object('name', them.name, 'status', 'pending');
end;
$$;

create or replace function public.respond_friend(p_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_accept then
    update friendships set status = 'accepted' where id = p_id and addressee = auth.uid() and status = 'pending';
  else
    delete from friendships where id = p_id and addressee = auth.uid() and status = 'pending';
  end if;
end;
$$;

-- Bloquer : plus d'amitié, plus de demande, plus rien de visible dans un sens ni dans l'autre.
create or replace function public.block_user(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or p_user is null or p_user = me then return; end if;
  insert into blocks (blocker, blocked) values (me, p_user) on conflict do nothing;
  delete from friendships where (requester = me and addressee = p_user) or (requester = p_user and addressee = me);
end;
$$;

revoke all on function public.is_friend(uuid, uuid), public.can_see_post(uuid), public.request_friend(text), public.respond_friend(uuid, boolean), public.block_user(uuid) from public, anon;
grant execute on function public.is_friend(uuid, uuid), public.can_see_post(uuid), public.request_friend(text), public.respond_friend(uuid, boolean), public.block_user(uuid) to authenticated;
