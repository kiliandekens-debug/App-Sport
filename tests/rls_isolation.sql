-- Test d'isolation des données entre comptes (RLS). Lecture seule : tout se passe dans une
-- transaction qui est toujours annulée à la fin (RAISE EXCEPTION), rien n'est écrit en base.
-- À lancer avec l'outil execute_sql de Supabase (projet mrqxkncxksncidkpwlib).
-- Le résultat arrive sous forme d'erreur : « ISOLATION OK … » ou « ISOLATION ÉCHEC … ».
--
-- Vérifie :
--  1. RLS activée sur chaque table de public ;
--  2. chaque politique d'écriture a une clause WITH CHECK qui dépend de auth.uid() ;
--  3. un compte inconnu (connecté) ne voit et ne modifie AUCUNE ligne, sur aucune table ;
--  4. un visiteur non connecté (anon) ne voit aucune ligne ;
--  5. ce compte inconnu ne peut pas appeler les fonctions admin.
do $$
declare
  t record;
  n bigint;
  fails text[] := '{}';
  checked int := 0;
begin
  -- 1. RLS activée partout
  for t in
    select c.relname from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  loop
    fails := fails || format('RLS désactivée sur %s', t.relname);
  end loop;

  -- 2. Politiques d'écriture sans contrôle sur auth.uid()
  for t in
    select tablename, policyname from pg_policies
    where schemaname = 'public' and cmd in ('INSERT', 'UPDATE', 'ALL')
      and coalesce(with_check, qual, '') not like '%auth.uid()%'
  loop
    fails := fails || format('politique %s sur %s : écriture sans auth.uid()', t.policyname, t.tablename);
  end loop;
  for t in
    select tablename, policyname from pg_policies
    where schemaname = 'public' and coalesce(qual, '') ~* '^\s*\(?\s*true\s*\)?\s*$'
  loop
    fails := fails || format('politique %s sur %s : ouverte à tous (true)', t.policyname, t.tablename);
  end loop;

  -- 3. Compte connecté inconnu
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  for t in
    select c.relname, exists (select 1 from information_schema.columns ic where ic.table_schema = 'public' and ic.table_name = c.relname and ic.column_name = 'user_id') as has_uid
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relkind = 'r'
  loop
    checked := checked + 1;
    begin
      execute format('select count(*) from public.%I', t.relname) into n;
      if n > 0 then fails := fails || format('%s : %s ligne(s) d''un autre compte visibles', t.relname, n); end if;
    exception when insufficient_privilege then null;
    end;
    if t.has_uid then
      begin
        execute format('update public.%I set user_id = user_id', t.relname);
        get diagnostics n = row_count;
        if n > 0 then fails := fails || format('%s : %s ligne(s) d''un autre compte modifiables', t.relname, n); end if;
      exception when insufficient_privilege then null;
      end;
    end if;
  end loop;

  -- 5. Fonctions admin refusées
  begin
    perform * from public.admin_users();
    fails := fails || 'admin_users() accessible à un compte ordinaire'::text;
  exception when others then null;
  end;

  -- 4. Visiteur non connecté
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  for t in
    select c.relname from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relkind = 'r'
  loop
    begin
      execute format('select count(*) from public.%I', t.relname) into n;
      if n > 0 then fails := fails || format('%s : %s ligne(s) visibles sans connexion', t.relname, n); end if;
    exception when insufficient_privilege then null;
    end;
  end loop;
  execute 'reset role';

  if cardinality(fails) = 0 then
    raise exception 'ISOLATION OK : % tables vérifiées, aucune fuite.', checked;
  else
    raise exception 'ISOLATION ÉCHEC (%) : %', cardinality(fails), array_to_string(fails, ' | ');
  end if;
end $$;
