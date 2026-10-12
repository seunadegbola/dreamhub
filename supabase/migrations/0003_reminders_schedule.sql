-- DreamHub — start the reminders job (Supabase only).
-- Run once in Supabase → SQL Editor after 0002_reminders.sql.
-- If the first two lines fail, turn on "pg_cron" and "pg_net" in
-- Database → Extensions, then run the rest.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Queue whatever is due, and only call the website when something is waiting.
create or replace function private.run_reminders() returns void
language plpgsql security definer set search_path = public, private as $$
begin
  perform public.queue_reminders();
  if exists (select 1 from public.push_outbox o where o.sent_at is null) then
    perform net.http_post(
      url := (select s.value from private.settings s where s.key = 'push_url'),
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select s.value from private.settings s where s.key = 'push_secret')
      ),
      timeout_milliseconds := 10000
    );
  end if;
end $$;
revoke execute on function private.run_reminders() from public;

-- Every minute. Running this again just updates the existing job.
select cron.schedule('dreamhub-reminders', '* * * * *', 'select private.run_reminders()');

-- Useful checks:
--   select * from cron.job_run_details order by start_time desc limit 10;   -- did the job run?
--   select * from net._http_response order by created desc limit 10;        -- what did the website answer?
--   select kind, title, sent_at from public.push_outbox order by id desc limit 20;
-- To pause reminders:  select cron.unschedule('dreamhub-reminders');
