-- Appliquée le 19/11/2026. Politiques RLS : auth.uid() évalué une fois par requête
-- au lieu d'une fois par ligne (même règle « own rows »), et index sur user_id.
alter policy "own rows" on public.run_profile using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "own rows" on public.run_logs using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "own rows" on public.push_subscriptions using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "own rows" on public.scheduled_pushes using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "read own role" on public.app_roles using (user_id = (select auth.uid()));
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
create index if not exists scheduled_pushes_user_idx on public.scheduled_pushes (user_id);
