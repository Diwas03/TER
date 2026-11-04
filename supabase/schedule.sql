-- Run schema.sql first. Deploy collect-prices and set its COLLECTOR_SECRET.
-- In Supabase Vault create ter_collector_secret with the SAME secret value.
-- Never commit or paste that secret into chat. Do not use your public anon key.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'ter_collector_secret' and length(decrypted_secret) >= 32) then
    raise exception 'Create Vault secret ter_collector_secret (32+ characters) first';
  end if;
end $$;

-- Idempotent: replace only this application's job.
select cron.unschedule(jobid) from cron.job where jobname = 'ter-price-collector';
select cron.schedule(
  'ter-price-collector',
  '* * * * *',
  $job$
    select net.http_post(
      url := 'https://figymesgyoritaokpwug.supabase.co/functions/v1/collect-prices',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'ter_collector_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 25000
    );
  $job$
);
-- Collector errors: Edge Function logs and net._http_response (temporary results).
-- A successful cron run only queues HTTP work; require new price rows too.
-- Stop: select cron.unschedule('ter-price-collector');
