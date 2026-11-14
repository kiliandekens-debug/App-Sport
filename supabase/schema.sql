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
