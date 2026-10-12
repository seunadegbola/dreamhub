-- DreamHub — reminders (web push notifications)
-- Run once in Supabase → SQL Editor → New query → paste → Run, after 0001_init.sql.
-- Then run 0003_reminders_schedule.sql to start the every-minute job.
--
-- How it works
--  * Each browser/phone that turns notifications on saves a push subscription.
--  * Every minute, queue_reminders() works out who is due a reminder and adds it to
--    push_outbox (one row per person per reminder, so nothing is sent twice).
--  * If anything is waiting, the job calls joindreamhub.com/api/push/flush, which takes
--    the waiting rows with take_push_outbox(secret) and delivers them.
--  * The shared secret is generated here and never leaves the database, apart from the
--    request the job itself makes. Still no service-role key in the app.
--
-- Rules the app promises (Profile → Notifications):
--  * at most 3 a day, none between 10pm and 8am in the person's timezone,
--    except the 5-minute reminder for a session they signed up to;
--  * each type can be switched off (profiles_private.notify, missing key = on).

create schema if not exists private;
revoke all on schema private from public;

create table private.settings (key text primary key, value text not null);
insert into private.settings (key, value) values
  ('push_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')),
  ('push_url', 'https://joindreamhub.com/api/push/flush')
on conflict (key) do nothing;

-- Per-person switches: {"focus_hour": true, "save_day": false, ...}
alter table public.profiles_private
  add column notify jsonb not null default '{}'::jsonb
  check (jsonb_typeof(notify) = 'object' and pg_column_size(notify) < 2000);

------------------------------------------------------------------------------
-- Devices
------------------------------------------------------------------------------

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now()
);
create index on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy "own devices" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
-- Writes go through save_push_subscription / remove_push_subscription.

------------------------------------------------------------------------------
-- Outbox: what has been (or is about to be) sent. Never readable by users.
------------------------------------------------------------------------------

create table public.push_outbox (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  ref text not null,
  title text not null,
  body text not null,
  url text not null default '/home',
  local_date date not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (user_id, kind, ref)
);
create index on public.push_outbox (user_id, local_date);
create index on public.push_outbox (id) where sent_at is null;
alter table public.push_outbox enable row level security;

------------------------------------------------------------------------------
-- Helpers (private schema: not callable through the API)
------------------------------------------------------------------------------

create function private.wants(p_notify jsonb, p_kind text) returns boolean
language sql immutable as $$ select coalesce((p_notify ->> p_kind)::boolean, true) $$;

-- A day counts as missed if it isn't a rest weekday, nothing was logged, and the account existed.
create function private.missed(p_user uuid, p_day date, p_rest smallint[], p_created date) returns boolean
language sql stable as $$
  select p_day >= p_created
     and not (extract(dow from p_day)::smallint = any (p_rest))
     and not exists (select 1 from public.daily_activity a where a.user_id = p_user and a.local_date = p_day);
$$;

-- Everyone who could get a reminder: set up, active, valid timezone, at least one device.
create function private.reminder_people(p_at timestamptz)
returns table (id uuid, name text, tz text, rest_weekdays smallint[], created_on date, notify jsonb, today date, local_time time)
language sql stable as $$
  select p.id, p.name, p.timezone, p.rest_weekdays, p.created_on, pp.notify,
         public.dream_day(p.timezone, p_at), (p_at at time zone p.timezone)::time
  from public.profiles p
  join public.profiles_private pp on pp.id = p.id
  where p.onboarded and p.status = 'active'
    and p.timezone in (select tz.name from pg_timezone_names tz)
    and exists (select 1 from public.push_subscriptions s where s.user_id = p.id);
$$;

create function private.quiet(p_local time) returns boolean
language sql immutable as $$ select p_local < time '08:00' or p_local >= time '22:00' $$;

-- Add one reminder unless it was already sent, or (when capped) the person has had 3 today.
create function private.enqueue(p_user uuid, p_kind text, p_ref text, p_title text, p_body text, p_url text, p_day date, p_capped boolean, p_at timestamptz)
returns void language plpgsql as $$
begin
  if p_capped and (select count(*) from public.push_outbox o where o.user_id = p_user and o.local_date = p_day and o.kind <> 'hosted') >= 3 then
    return;
  end if;
  insert into public.push_outbox (user_id, kind, ref, title, body, url, local_date, created_at)
  values (p_user, p_kind, p_ref, left(p_title, 120), left(p_body, 240), p_url, p_day, p_at)
  on conflict (user_id, kind, ref) do nothing;
end $$;

revoke execute on all functions in schema private from public;

------------------------------------------------------------------------------
-- The rules. Runs every minute; safe to run more often (everything is de-duplicated).
------------------------------------------------------------------------------

create function public.queue_reminders(p_at timestamptz default now()) returns int
language plpgsql security definer set search_path = public, private as $$
declare
  uk_day date := (p_at at time zone 'Europe/London')::date;
  fh_start timestamptz := ((p_at at time zone 'Europe/London')::date + time '18:30') at time zone 'Europe/London';
  waiting_before int;
  waiting_after int;
begin
  delete from push_outbox o where o.created_at < p_at - interval '14 days';
  -- Anything not delivered within 30 minutes is stale: drop it rather than send it late.
  update push_outbox o set sent_at = p_at where o.sent_at is null and o.created_at < p_at - interval '30 minutes';
  select count(*) into waiting_before from push_outbox o where o.sent_at is null;

  -- 1. Hosted sessions starting within 5 minutes: host + everyone who said they'll be there.
  --    Not capped and allowed in quiet hours: the person chose this time.
  perform private.enqueue(u.id, 'hosted', x.sid::text,
            '“' || x.title || '” starts in 5 minutes', 'Bring one step to work on. See you there.',
            '/room/' || x.sid, u.today, false, p_at)
  from (
    select s.id as sid, s.title, s.host_user_id as uid from sessions s
    where s.type = 'hosted' and s.cancelled_at is null and s.scheduled_start > p_at and s.scheduled_start <= p_at + interval '5 minutes'
    union
    select s.id, s.title, i.invitee_user_id from sessions s join session_invites i on i.session_id = s.id
    where s.type = 'hosted' and s.cancelled_at is null and s.scheduled_start > p_at and s.scheduled_start <= p_at + interval '5 minutes'
      and i.status = 'accepted' and i.invitee_user_id is not null
  ) x
  join private.reminder_people(p_at) u on u.id = x.uid
  where private.wants(u.notify, 'hosted');

  -- 2. Buddy nudges (sent as soon as quiet hours allow, within a day).
  perform private.enqueue(u.id, 'nudge', n.id::text,
            coalesce(nullif(f.name, ''), 'A buddy') || ' nudged you',
            coalesce(nullif(n.message, ''), 'Time for one small step?'), '/home', u.today, true, p_at)
  from nudges n
  join profiles f on f.id = n.from_user_id
  join private.reminder_people(p_at) u on u.id = n.to_user_id
  where not n.seen and n.created_at > p_at - interval '1 day'
    and not private.quiet(u.local_time) and private.wants(u.notify, 'buddies')
  order by n.created_at;

  -- 3. Session invites from other people.
  perform private.enqueue(u.id, 'invite', i.id::text,
            coalesce(nullif(inv.name, ''), 'Someone') || ' invited you to focus',
            '“' || s.title || '” · ' || to_char(s.scheduled_start at time zone u.tz, 'Dy FMHH12:MIam'), '/focus', u.today, true, p_at)
  from session_invites i
  join sessions s on s.id = i.session_id
  join profiles inv on inv.id = i.inviter_id
  join private.reminder_people(p_at) u on u.id = i.invitee_user_id
  where i.status = 'pending' and i.inviter_id <> i.invitee_user_id and i.created_at > p_at - interval '1 day'
    and s.cancelled_at is null and s.scheduled_start > p_at
    and not private.quiet(u.local_time) and private.wants(u.notify, 'hosted')
  order by i.created_at;

  -- 4. Focus Hour in 5 minutes (18:25 UK), except on rest days.
  if p_at >= fh_start - interval '5 minutes' and p_at < fh_start then
    perform private.enqueue(u.id, 'focus_hour', uk_day::text,
              'Focus Hour starts in 5 minutes', 'Pick one step to bring. Cameras optional, mics muted.',
              '/room/focus-hour', u.today, true, p_at)
    from private.reminder_people(p_at) u
    where private.wants(u.notify, 'focus_hour') and not private.quiet(u.local_time)
      and not (extract(dow from u.today)::smallint = any (u.rest_weekdays))
      and not exists (select 1 from daily_activity a where a.user_id = u.id and a.local_date = u.today and a.state = 'rest');
  end if;

  -- 5. Save day, 6:15pm local: missed yesterday (but not the day before), nothing done yet today.
  perform private.enqueue(u.id, 'save_day', u.today::text,
            'Today’s a save day', 'You missed yesterday. One small step today keeps your streak going.',
            '/home', u.today, true, p_at)
  from private.reminder_people(p_at) u
  where u.local_time >= time '18:15' and u.local_time < time '19:00'
    and private.wants(u.notify, 'save_day')
    and private.missed(u.id, u.today - 1, u.rest_weekdays, u.created_on)
    and not private.missed(u.id, u.today - 2, u.rest_weekdays, u.created_on)
    and not exists (select 1 from daily_activity a where a.user_id = u.id and a.local_date = u.today);

  -- 6. Missed-day message, 9am local, same situation.
  perform private.enqueue(u.id, 'missed_day', u.today::text,
            'Yesterday slipped by. That’s okay.', 'Never miss twice: one small step today and your streak stays alive.',
            '/home', u.today, true, p_at)
  from private.reminder_people(p_at) u
  where u.local_time >= time '09:00' and u.local_time < time '11:00'
    and private.wants(u.notify, 'missed_day')
    and private.missed(u.id, u.today - 1, u.rest_weekdays, u.created_on)
    and not private.missed(u.id, u.today - 2, u.rest_weekdays, u.created_on)
    and not exists (select 1 from daily_activity a where a.user_id = u.id and a.local_date = u.today);

  -- 7. Deadlines, 9am local. Every goal: due today. Standard and hardcore: also due tomorrow.
  --    Hardcore: also overdue. One message per day.
  perform private.enqueue(u.id, 'deadlines', u.today::text,
            case
              when d.n_today = 1 then 'Due today: ' || left(d.first_today, 60)
              when d.n_today > 1 then d.n_today || ' steps due today'
              when d.n_overdue > 0 then d.n_overdue || case when d.n_overdue = 1 then ' step is overdue' else ' steps are overdue' end
              when d.n_tomorrow = 1 then 'Due tomorrow: ' || left(d.first_tomorrow, 60)
              else d.n_tomorrow || ' steps due tomorrow'
            end,
            concat_ws(' ',
              case when d.n_overdue > 0 and d.n_today > 0 then d.n_overdue || ' overdue.' end,
              case when d.n_tomorrow > 0 and (d.n_today > 0 or d.n_overdue > 0) then d.n_tomorrow || ' due tomorrow.' end,
              'One 25-minute block is enough to start.'),
            '/tasks', u.today, true, p_at)
  from private.reminder_people(p_at) u
  cross join lateral (
    select
      count(*) filter (where t.due_on = u.today) as n_today,
      (array_agg(t.title order by g.created_at, t.sort_order) filter (where t.due_on = u.today))[1] as first_today,
      count(*) filter (where t.due_on = u.today + 1 and g.intensity <> 'gentle') as n_tomorrow,
      (array_agg(t.title order by g.created_at, t.sort_order) filter (where t.due_on = u.today + 1 and g.intensity <> 'gentle'))[1] as first_tomorrow,
      count(*) filter (where t.due_on < u.today and g.intensity = 'hardcore') as n_overdue
    from tasks t join goals g on g.id = t.goal_id
    where t.user_id = u.id and t.completed_at is null and g.completed_at is null and t.due_on is not null
  ) d
  where u.local_time >= time '09:00' and u.local_time < time '11:00'
    and private.wants(u.notify, 'deadlines')
    and d.n_today + d.n_tomorrow + d.n_overdue > 0;

  select count(*) into waiting_after from push_outbox o where o.sent_at is null;
  return waiting_after - waiting_before;
end $$;

------------------------------------------------------------------------------
-- Called by /api/push/flush with the shared secret (anon key, no user session).
------------------------------------------------------------------------------

create function private.check_secret(p_secret text) returns void
language plpgsql stable as $$
begin
  if p_secret is null or length(p_secret) < 32
     or not exists (select 1 from private.settings s where s.key = 'push_secret' and s.value = p_secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
end $$;
revoke execute on function private.check_secret(text) from public;

-- Hands over up to 500 waiting reminders (one row per device) and marks them sent.
create function public.take_push_outbox(p_secret text)
returns table (id bigint, endpoint text, p256dh text, auth text, title text, body text, url text, kind text)
language plpgsql security definer set search_path = public, private as $$
#variable_conflict use_column
begin
  perform private.check_secret(p_secret);
  return query
    with claimed as (
      update push_outbox o set sent_at = now()
      where o.id in (select o2.id from push_outbox o2 where o2.sent_at is null order by o2.id limit 500 for update skip locked)
      returning o.id, o.user_id, o.title, o.body, o.url, o.kind
    )
    select c.id, s.endpoint, s.p256dh, s.auth, c.title, c.body, c.url, c.kind
    from claimed c join push_subscriptions s on s.user_id = c.user_id
    order by c.id;
end $$;

-- Devices the push service says are gone (uninstalled, permission revoked).
create function public.drop_push_endpoints(p_secret text, p_endpoints text[]) returns int
language plpgsql security definer set search_path = public, private as $$
declare n int;
begin
  perform private.check_secret(p_secret);
  delete from push_subscriptions s where s.endpoint = any (p_endpoints);
  get diagnostics n = row_count;
  return n;
end $$;

------------------------------------------------------------------------------
-- Called by signed-in people from the app.
------------------------------------------------------------------------------

-- Saves this device for the signed-in person. A device moves to whoever signed in last.
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'sign in first' using errcode = '42501'; end if;
  -- Only real browser push services, so the server never posts anywhere else.
  if p_endpoint !~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.push\.apple\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.notify\.windows\.com)/' then
    raise exception 'unsupported push service' using errcode = '22023';
  end if;
  delete from push_subscriptions s where s.endpoint = p_endpoint;
  insert into push_subscriptions (user_id, endpoint, p256dh, auth) values (me, p_endpoint, p_p256dh, p_auth);
  -- Keep the 10 most recent devices.
  delete from push_subscriptions s where s.user_id = me
    and s.id not in (select s2.id from push_subscriptions s2 where s2.user_id = me order by s2.created_at desc, s2.id limit 10);
end $$;

create function public.remove_push_subscription(p_endpoint text) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from push_subscriptions s where s.endpoint = p_endpoint and s.user_id = auth.uid();
end $$;

revoke execute on function
  public.queue_reminders(timestamptz), public.take_push_outbox(text), public.drop_push_endpoints(text, text[]),
  public.save_push_subscription(text, text, text), public.remove_push_subscription(text)
  from public, anon, authenticated;
grant execute on function public.take_push_outbox(text), public.drop_push_endpoints(text, text[]) to anon;
grant execute on function public.save_push_subscription(text, text, text), public.remove_push_subscription(text) to authenticated;
