-- Excess (projet séparé, plus utilisé) n'a plus sa place dans la base de Kadence.
-- Les 16 lignes ont été archivées le 24/11/2026 (JSON avec le schéma, rangé dans le projet Claude
-- « App Suivi Sportif », archives/excess-archive-2026-11-24.json). Aucune table Kadence n'est touchée.
drop table if exists public.excess_posts;
drop table if exists public.excess_meta;
drop function if exists public.excess_touch();

-- Suppression de compte : plus d'autre projet dans la base, la connexion est toujours supprimée.
create or replace function public.delete_my_account()
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Non connecté';
  end if;
  delete from public.scheduled_pushes where user_id = uid;
  delete from public.push_subscriptions where user_id = uid;
  delete from public.sets where user_id = uid;
  delete from public.workouts where user_id = uid;
  delete from public.custom_exercises where user_id = uid;
  delete from public.coach_plans where user_id = uid;
  delete from public.routines where user_id = uid;
  delete from public.run_logs where user_id = uid;
  delete from public.run_profile where user_id = uid;
  delete from public.app_roles where user_id = uid;
  delete from auth.users where id = uid;
  return 'deleted';
end;
$function$;
