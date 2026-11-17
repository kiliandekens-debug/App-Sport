-- Applied to the Supabase project as migration "init_schema".
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  source text not null default 'app',
  created_at timestamptz not null default now(),
  unique (user_id, started_at)
);
create table public.sets (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  workout_id uuid not null references public.workouts on delete cascade,
  exercise text not null,
  position int not null default 0,
  set_index int not null,
  set_type text not null default 'normal',
  weight_kg numeric,
  reps int,
  distance_km numeric,
  duration_seconds int,
  rpe numeric
);
create index sets_user_exercise_idx on public.sets (user_id, exercise);
create index sets_workout_idx on public.sets (workout_id);
create index workouts_user_started_idx on public.workouts (user_id, started_at desc);
create table public.custom_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  base text,
  muscle text not null,
  equip text not null,
  notes text,
  separate_progress boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
create table public.coach_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  exercise text not null,
  target_kg numeric,
  target_reps int,
  reason text,
  created_at timestamptz not null default now(),
  unique (user_id, exercise)
);
alter table public.workouts enable row level security;
alter table public.sets enable row level security;
alter table public.custom_exercises enable row level security;
alter table public.coach_plans enable row level security;
create policy "own workouts" on public.workouts for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own sets" on public.sets for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own custom exercises" on public.custom_exercises for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own coach plans" on public.coach_plans for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Added later (applied as migrations "routines_and_supersets" and "running")
alter table public.sets add column if not exists superset_id text;

create table if not exists public.run_profile (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  goal text not null, target_date date, days_per_week int not null default 3,
  ref_distance_km numeric not null default 5, ref_time_s int not null,
  started_on date not null default current_date, updated_at timestamptz not null default now()
);
create table if not exists public.run_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  done_at timestamptz not null, session_key text, kind text, distance_km numeric, duration_s int,
  avg_hr int, calories int, feel int check (feel between 1 and 5), notes text,
  source text not null default 'manual', created_at timestamptz not null default now()
);
alter table public.run_profile enable row level security;
alter table public.run_logs enable row level security;
create policy "own rows" on public.run_profile for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.run_logs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
-- routines table: see the app's earlier migration (id, user_id, name, exercises jsonb, position, updated_at)
-- Migration "run_profile_schedule": the athlete's week (Monday first) and current volume.
alter table public.run_profile add column if not exists schedule jsonb;
alter table public.run_profile add column if not exists weekly_km numeric;
-- Migration "run_profile_reentry": return-to-running protocol on or off.
alter table public.run_profile add column if not exists reentry boolean not null default true;
-- Migration "roles_superadmin": app_roles (superadmin / admin / user), is_superadmin(),
-- admin_users() and admin_set_role() as security definer functions checked against the caller's role.
