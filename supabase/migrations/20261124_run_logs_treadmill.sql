-- Tapis et marche inclinée : type d'activité, vitesse, pente, dénivelé et paliers.
-- Non destructif : colonnes ajoutées, les courses existantes restent des courses dehors (activity null = 'run').
alter table public.run_logs add column if not exists activity text
  check (activity is null or activity in ('run', 'treadmill', 'incline_walk', 'walk'));
alter table public.run_logs add column if not exists speed_kmh numeric check (speed_kmh is null or (speed_kmh >= 0 and speed_kmh <= 30));
alter table public.run_logs add column if not exists incline_pct numeric check (incline_pct is null or (incline_pct >= -5 and incline_pct <= 40));
alter table public.run_logs add column if not exists elevation_m numeric check (elevation_m is null or elevation_m >= 0);
-- Paliers de la séance : [{ secs, speed, incline }].
alter table public.run_logs add column if not exists segments jsonb;
