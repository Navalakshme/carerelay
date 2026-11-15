-- Supabase only: enable the durable inbox worker once after 003.
-- There are no external notifications, payment accounts or privileged API keys.
create extension if not exists pg_cron;
do $$
begin
  if not exists(select 1 from cron.job where jobname='carerelay-check-ins') then
    perform cron.schedule('carerelay-check-ins','* * * * *','select care_private.tick_all()');
  end if;
end $$;
select jobname,schedule,active from cron.job where jobname='carerelay-check-ins';
