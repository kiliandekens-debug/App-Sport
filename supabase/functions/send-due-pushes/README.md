Edge function deployed on Supabase (verify_jwt off, protected by the x-cron-secret header).
Called every 5 seconds by pg_cron through public.kick_due_pushes() when a row of
public.scheduled_pushes is due. Keys and secret live in public.push_config (service role only).
