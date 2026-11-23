-- Intervals measured by the watch (Apple Health) and how they compare with the planned session.
alter table public.run_logs add column if not exists splits jsonb;
comment on column public.run_logs.splits is 'Intervals measured by the watch (Apple Health) and how they compare with the planned session.';
