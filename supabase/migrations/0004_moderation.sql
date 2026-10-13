-- DreamHub — moderation (reports, warnings, suspensions)
-- Run once in Supabase → SQL Editor after 0003. Then make yourself an admin (see SETUP.md).
--
--  * Admins are listed in private.admins (not reachable through the API).
--  * Everything an admin does goes through admin_* functions that check the caller
--    is an admin, and is logged in moderation_actions.
--  * A warning or suspension message reaches the member as a notice in the app
--    (and as a notification if they have reminders on).
--  * Suspended members can't join, host, invite, nudge, add buddies or check in,
--    whatever the app does (enforced by triggers below).

create table private.admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table private.admins enable row level security;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public, private as $$
  select exists (select 1 from private.admins a where a.user_id = auth.uid());
$$;

create function private.require_admin() returns void
language plpgsql stable as $$
begin
  if not exists (select 1 from private.admins a where a.user_id = auth.uid()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
end $$;

create function private.reason_label(p_reason text) returns text
language sql immutable as $$
  select case p_reason
    when 'inappropriate' then 'Inappropriate behaviour'
    when 'harassment' then 'Harassment'
    when 'spam' then 'Spam or selling'
    when 'content' then 'Inappropriate content'
    when 'recording' then 'Recording others'
    when 'no_show' then 'No-show'
    else 'Something else' end;
$$;

------------------------------------------------------------------------------
-- Log of admin decisions (admins read it through admin_history; nobody else can)
------------------------------------------------------------------------------

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles (id) on delete set null,
  target_user_id uuid not null references public.profiles (id) on delete cascade,
  report_id uuid references public.reports (id) on delete set null,
  action text not null check (action in ('dismiss', 'uphold', 'warn', 'suspend', 'unsuspend')),
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now()
);
create index on public.moderation_actions (target_user_id, created_at desc);
alter table public.moderation_actions enable row level security;

------------------------------------------------------------------------------
-- Messages from the DreamHub team to a member
------------------------------------------------------------------------------

create table public.member_notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('warning', 'suspension')),
  message text not null check (char_length(message) between 1 and 1000),
  created_at timestamptz not null default now(),
  seen_at timestamptz
);
create index on public.member_notices (user_id, created_at desc);
alter table public.member_notices enable row level security;
create policy "own notices" on public.member_notices for select to authenticated using (user_id = auth.uid());
create policy "mark own notice seen" on public.member_notices for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, update, delete on public.member_notices from anon, authenticated;
grant update (seen_at) on public.member_notices to authenticated;

------------------------------------------------------------------------------
-- Suspended members can't take part, whichever way they try
------------------------------------------------------------------------------

create function private.not_suspended() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid := (to_jsonb(new) ->> tg_argv[0])::uuid;
begin
  if uid is not null and exists (select 1 from profiles p where p.id = uid and p.status = 'suspended') then
    raise exception 'account suspended' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger suspended_cannot_join before insert on public.session_participants for each row execute function private.not_suspended('user_id');
create trigger suspended_cannot_host before insert on public.sessions for each row execute function private.not_suspended('host_user_id');
create trigger suspended_cannot_invite before insert on public.session_invites for each row execute function private.not_suspended('inviter_id');
create trigger suspended_cannot_nudge before insert on public.nudges for each row execute function private.not_suspended('from_user_id');
create trigger suspended_cannot_add_buddies before insert on public.buddies for each row execute function private.not_suspended('requester_id');
create trigger suspended_cannot_check_in before insert on public.check_ins for each row execute function private.not_suspended('user_id');

------------------------------------------------------------------------------
-- Tell admins about new reports (delivered by the reminders job within a minute)
------------------------------------------------------------------------------

-- Admin alerts and team messages don't count towards anyone's 3-a-day reminder limit.
create or replace function private.enqueue(p_user uuid, p_kind text, p_ref text, p_title text, p_body text, p_url text, p_day date, p_capped boolean, p_at timestamptz)
returns void language plpgsql as $$
begin
  if p_capped and (select count(*) from public.push_outbox o where o.user_id = p_user and o.local_date = p_day and o.kind not in ('hosted', 'report', 'notice')) >= 3 then
    return;
  end if;
  insert into public.push_outbox (user_id, kind, ref, title, body, url, local_date, created_at)
  values (p_user, p_kind, p_ref, left(p_title, 120), left(p_body, 240), p_url, p_day, p_at)
  on conflict (user_id, kind, ref) do nothing;
end $$;

create function private.alert_admins() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  -- The description stays out of the notification: lock screens are visible to others.
  perform private.enqueue(a.user_id, 'report', new.id::text, 'New report: ' || private.reason_label(new.reason),
            'Open DreamHub to review it.', '/admin', public.dream_day(p.timezone), false, now())
  from private.admins a
  join profiles p on p.id = a.user_id
  where p.timezone in (select tz.name from pg_timezone_names tz)
    and exists (select 1 from push_subscriptions s where s.user_id = a.user_id);
  return new;
end $$;
create trigger alert_admins_on_report after insert on public.reports for each row execute function private.alert_admins();

create function private.notify_member(p_user uuid, p_notice uuid, p_title text) returns void
language sql security definer set search_path = public, private as $$
  select private.enqueue(p_user, 'notice', p_notice::text, p_title, 'Open DreamHub to read it.', '/home',
           public.dream_day(p.timezone), false, now())
  from profiles p
  where p.id = p_user and p.timezone in (select tz.name from pg_timezone_names tz)
    and exists (select 1 from push_subscriptions s where s.user_id = p_user);
$$;

revoke execute on all functions in schema private from public;

------------------------------------------------------------------------------
-- Admin functions
------------------------------------------------------------------------------

-- Reports with everything needed to decide: who, what, where, and the person's record.
create function public.admin_reports(p_open boolean default true)
returns table (
  id uuid, created_at timestamptz, reason text, description text, status text, resolved_at timestamptz,
  reporter_id uuid, reporter_name text,
  reported_id uuid, reported_name text, reported_email text, reported_status text, reported_since date,
  reports_90d int, reporters_90d int, warnings int,
  session_id uuid, session_title text, session_type text, session_start timestamptz,
  last_action text, last_action_at timestamptz
)
language plpgsql stable security definer set search_path = public, private as $$
#variable_conflict use_column
begin
  perform private.require_admin();
  return query
  select r.id, r.created_at, r.reason, r.description, r.status, r.resolved_at,
         r.reporter_id, rp.name,
         r.reported_user_id, tp.name, tpp.email, tp.status, tp.created_on,
         (select count(*)::int from reports x where x.reported_user_id = r.reported_user_id and x.created_at > now() - interval '90 days'),
         (select count(distinct x.reporter_id)::int from reports x where x.reported_user_id = r.reported_user_id and x.created_at > now() - interval '90 days'),
         (select count(*)::int from moderation_actions m where m.target_user_id = r.reported_user_id and m.action = 'warn'),
         s.id, s.title, s.type, s.scheduled_start,
         la.action, la.created_at
  from reports r
  join profiles tp on tp.id = r.reported_user_id
  left join profiles_private tpp on tpp.id = r.reported_user_id
  left join profiles rp on rp.id = r.reporter_id
  left join sessions s on s.id = r.session_id
  left join lateral (
    select m.action, m.created_at from moderation_actions m where m.target_user_id = r.reported_user_id order by m.created_at desc limit 1
  ) la on true
  where (p_open and r.status = 'open') or (not p_open and r.status <> 'open')
  order by case when p_open then r.created_at end asc, r.resolved_at desc nulls last
  limit 200;
end $$;

create function public.admin_suspended()
returns table (user_id uuid, name text, email text, suspended_at timestamptz, note text)
language plpgsql stable security definer set search_path = public, private as $$
#variable_conflict use_column
begin
  perform private.require_admin();
  return query
  select p.id, p.name, pp.email, m.created_at, m.note
  from profiles p
  left join profiles_private pp on pp.id = p.id
  left join lateral (
    select m.created_at, m.note from moderation_actions m where m.target_user_id = p.id and m.action = 'suspend' order by m.created_at desc limit 1
  ) m on true
  where p.status = 'suspended'
  order by m.created_at desc nulls last;
end $$;

-- One member's record: reports about them and decisions taken, newest first.
create function public.admin_history(p_user uuid)
returns table (at timestamptz, kind text, detail text, by_name text)
language plpgsql stable security definer set search_path = public, private as $$
#variable_conflict use_column
begin
  perform private.require_admin();
  return query
  select * from (
    select r.created_at, 'report'::text, private.reason_label(r.reason) || coalesce(': ' || r.description, ''), rp.name
    from reports r left join profiles rp on rp.id = r.reporter_id where r.reported_user_id = p_user
    union all
    select m.created_at, m.action, coalesce(m.note, ''), ap.name
    from moderation_actions m left join profiles ap on ap.id = m.admin_id where m.target_user_id = p_user
  ) h (at, kind, detail, by_name)
  order by 1 desc
  limit 100;
end $$;

create function private.close_report(p_report uuid, p_status text) returns void
language sql as $$
  update public.reports set status = p_status, resolved_at = now() where id = p_report and status = 'open';
$$;
revoke execute on function private.close_report(uuid, text) from public;

create function public.admin_dismiss_report(p_report uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public, private as $$
declare target uuid;
begin
  perform private.require_admin();
  select r.reported_user_id into target from reports r where r.id = p_report;
  if target is null then raise exception 'report not found'; end if;
  perform private.close_report(p_report, 'dismissed');
  insert into moderation_actions (admin_id, target_user_id, report_id, action, note) values (auth.uid(), target, p_report, 'dismiss', nullif(trim(p_note), ''));
end $$;

create function public.admin_warn(p_user uuid, p_message text, p_report uuid default null) returns void
language plpgsql security definer set search_path = public, private as $$
declare notice uuid;
begin
  perform private.require_admin();
  if coalesce(trim(p_message), '') = '' then raise exception 'write a message'; end if;
  if not exists (select 1 from profiles p where p.id = p_user) then raise exception 'member not found'; end if;
  insert into member_notices (user_id, kind, message) values (p_user, 'warning', trim(p_message)) returning id into notice;
  insert into moderation_actions (admin_id, target_user_id, report_id, action, note) values (auth.uid(), p_user, p_report, 'warn', trim(p_message));
  if p_report is not null then perform private.close_report(p_report, 'upheld'); end if;
  perform private.notify_member(p_user, notice, 'A message from the DreamHub team');
end $$;

-- Suspends, removes them from any session they're in, cancels sessions they host.
-- Returns the rooms they were in so the server can disconnect their video.
create function public.admin_suspend(p_user uuid, p_message text, p_report uuid default null)
returns table (session_id uuid, session_type text, table_no int)
language plpgsql security definer set search_path = public, private as $$
#variable_conflict use_column
declare notice uuid;
begin
  perform private.require_admin();
  if p_user = auth.uid() then raise exception 'you can''t suspend yourself'; end if;
  if exists (select 1 from private.admins a where a.user_id = p_user) then raise exception 'remove their admin access first'; end if;
  if coalesce(trim(p_message), '') = '' then raise exception 'write a message'; end if;
  update profiles set status = 'suspended', focusing_until = null where id = p_user;
  if not found then raise exception 'member not found'; end if;

  insert into member_notices (user_id, kind, message) values (p_user, 'suspension', trim(p_message)) returning id into notice;
  insert into moderation_actions (admin_id, target_user_id, report_id, action, note) values (auth.uid(), p_user, p_report, 'suspend', trim(p_message));
  if p_report is not null then perform private.close_report(p_report, 'upheld'); end if;
  update sessions s set cancelled_at = now()
    where s.host_user_id = p_user and s.type = 'hosted' and s.cancelled_at is null and s.scheduled_start > now() - interval '6 hours';
  delete from push_subscriptions s where s.user_id = p_user;

  return query
    with seats as (
      update session_participants sp set left_at = now(), removed = true
      where sp.user_id = p_user and sp.left_at is null
      returning sp.session_id, sp.table_no
    )
    select st.session_id, s.type, st.table_no from seats st join sessions s on s.id = st.session_id;
end $$;

create function public.admin_unsuspend(p_user uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public, private as $$
begin
  perform private.require_admin();
  update profiles set status = 'active' where id = p_user and status = 'suspended';
  if not found then raise exception 'member isn''t suspended'; end if;
  update member_notices set seen_at = now() where user_id = p_user and kind = 'suspension' and seen_at is null;
  insert into moderation_actions (admin_id, target_user_id, action, note) values (auth.uid(), p_user, 'unsuspend', nullif(trim(p_note), ''));
end $$;

revoke execute on function
  public.is_admin(), public.admin_reports(boolean), public.admin_suspended(), public.admin_history(uuid),
  public.admin_dismiss_report(uuid, text), public.admin_warn(uuid, text, uuid), public.admin_suspend(uuid, text, uuid), public.admin_unsuspend(uuid, text)
  from public, anon;
grant execute on function
  public.is_admin(), public.admin_reports(boolean), public.admin_suspended(), public.admin_history(uuid),
  public.admin_dismiss_report(uuid, text), public.admin_warn(uuid, text, uuid), public.admin_suspend(uuid, text, uuid), public.admin_unsuspend(uuid, text)
  to authenticated;
