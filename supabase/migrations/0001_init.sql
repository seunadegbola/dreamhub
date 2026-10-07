-- DreamHub — initial schema (PRD v2 §19)
-- Run once in Supabase → SQL Editor → New query → paste → Run.
--
-- Security model
--  * Row Level Security is ON for every table. Nothing is readable without a policy.
--  * Users own their goals, tasks, steps, activity, XP and session history.
--  * Buddies (accepted, both ways) can read each other's streak days, committed
--    deadlines and goal titles — never step details or session history (PRD §9).
--  * Anything that touches other people's rows (joining a Focus Hour table, buddy
--    requests, approving extensions) goes through SECURITY DEFINER functions that
--    check permissions themselves.
--  * No service-role key is needed by the app.


------------------------------------------------------------------------------
-- Profiles
------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '' check (char_length(name) <= 60),
  hue smallint not null default 225 check (hue between 0 and 359),
  timezone text not null default 'Europe/London',
  rest_weekdays smallint[] not null default '{}' check (cardinality(rest_weekdays) <= 2),
  created_on date not null default current_date,
  onboarded boolean not null default false,
  celebrations boolean not null default true,
  achievements text[] not null default '{}',
  focusing_until timestamptz,
  -- reliability (internal only, PRD §16)
  sessions_attended int not null default 0,
  sessions_left_early int not null default 0,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now()
);

-- Private details: only the owner can read them.
create table public.profiles_private (
  id uuid primary key references public.profiles (id) on delete cascade,
  email text,
  date_of_birth date
);

alter table public.profiles enable row level security;
alter table public.profiles_private enable row level security;

-- Names and avatars are visible to signed-in users (needed for rooms, hosts, buddies).
create policy "profiles readable by signed-in users" on public.profiles
  for select to authenticated using (true);
create policy "own profile insert" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "own profile update" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Users may only change these columns (not status or reliability counters).
revoke update on public.profiles from authenticated;
grant update (name, hue, timezone, rest_weekdays, created_on, onboarded, celebrations, achievements, focusing_until)
  on public.profiles to authenticated;

create policy "own private read" on public.profiles_private
  for select to authenticated using (id = auth.uid());
create policy "own private write" on public.profiles_private
  for insert to authenticated with check (id = auth.uid());
create policy "own private update" on public.profiles_private
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Create a profile for every new user.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, hue)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(coalesce(new.raw_user_meta_data ->> 'full_name', ''), ' ', 1), ''),
    (abs(hashtext(new.id::text)) % 360)
  );
  insert into public.profiles_private (id, email) values (new.id, new.email);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

------------------------------------------------------------------------------
-- Buddies (needed by later policies)
------------------------------------------------------------------------------

create table public.buddies (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active')),
  share_goals boolean not null default true,
  created_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);
create unique index buddies_pair on public.buddies (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create table public.blocks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  blocked_user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_user_id)
);

alter table public.buddies enable row level security;
alter table public.blocks enable row level security;

create function public.is_buddy(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from buddies
    where status = 'active'
      and ((requester_id = a and addressee_id = b) or (requester_id = b and addressee_id = a))
  );
$$;

create function public.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from blocks
    where (user_id = a and blocked_user_id = b) or (user_id = b and blocked_user_id = a)
  );
$$;

create policy "see own buddy rows" on public.buddies
  for select to authenticated using (auth.uid() in (requester_id, addressee_id));
create policy "addressee accepts" on public.buddies
  for update to authenticated using (addressee_id = auth.uid()) with check (addressee_id = auth.uid());
create policy "either side removes" on public.buddies
  for delete to authenticated using (auth.uid() in (requester_id, addressee_id));
-- Requests are created through request_buddy() below.

create policy "own blocks" on public.blocks
  for select to authenticated using (user_id = auth.uid());
create policy "own blocks delete" on public.blocks
  for delete to authenticated using (user_id = auth.uid());
-- Blocks are created through block_user() below.

------------------------------------------------------------------------------
-- Goals, tasks, steps, deadlines
------------------------------------------------------------------------------

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  category text not null check (category in ('work', 'school', 'business', 'creative', 'personal', 'other')),
  deadline date,
  intensity text not null default 'standard' check (intensity in ('gentle', 'standard', 'hardcore')),
  committed boolean not null default false,
  created_on date not null default current_date,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  estimated_minutes int not null default 60 check (estimated_minutes between 1 and 10000),
  due_on date,
  created_on date not null default current_date,
  committed boolean not null default false,
  completed_at timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  estimated_minutes int not null default 25,
  done boolean not null default false,
  completed_at timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.deadline_extensions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  witness_user_id uuid references public.profiles (id) on delete set null,
  old_due date not null,
  new_due date not null check (new_due > old_due),
  reason text not null check (char_length(reason) between 1 and 280),
  status text not null default 'pending' check (status in ('pending', 'approved', 'auto_approved', 'self_approved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index on public.goals (user_id);
create index on public.tasks (user_id);
create index on public.tasks (goal_id);
create index on public.subtasks (task_id);
create index on public.deadline_extensions (task_id);
create index on public.deadline_extensions (witness_user_id) where status = 'pending';

alter table public.goals enable row level security;
alter table public.tasks enable row level security;
alter table public.subtasks enable row level security;
alter table public.deadline_extensions enable row level security;

create policy "own goals" on public.goals for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "buddies see goal titles" on public.goals for select to authenticated
  using (public.is_buddy(auth.uid(), user_id));

create policy "own tasks" on public.tasks for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid()));
create policy "buddies see committed deadlines" on public.tasks for select to authenticated
  using (committed and due_on is not null and public.is_buddy(auth.uid(), user_id));

create policy "own steps" on public.subtasks for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.tasks t where t.id = task_id and t.user_id = auth.uid()));

create policy "own extensions" on public.deadline_extensions for select to authenticated
  using (user_id = auth.uid() or witness_user_id = auth.uid());
create policy "request extension" on public.deadline_extensions for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.tasks t where t.id = task_id and t.user_id = auth.uid())
    and (witness_user_id is null or public.is_buddy(auth.uid(), witness_user_id))
    and status in ('pending', 'self_approved')
  );

------------------------------------------------------------------------------
-- Streak days and XP
------------------------------------------------------------------------------

-- One row per DreamHub day the user was active or declared rest. Missed days are implied.
create table public.daily_activity (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  local_date date not null,
  state text not null check (state in ('active', 'rest')),
  created_at timestamptz not null default now(),
  primary key (user_id, local_date)
);

create table public.xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  action text not null,
  amount int not null check (amount between 0 and 400),
  local_date date not null,
  created_at timestamptz not null default now()
);
create index on public.xp_events (user_id, local_date);

alter table public.daily_activity enable row level security;
alter table public.xp_events enable row level security;

create policy "own days" on public.daily_activity for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "buddies see days" on public.daily_activity for select to authenticated
  using (public.is_buddy(auth.uid(), user_id));

create policy "own xp read" on public.xp_events for select to authenticated using (user_id = auth.uid());
-- Daily cap enforced here as well as in the app (PRD §13: 400 XP/day).
create policy "own xp insert" on public.xp_events for insert to authenticated
  with check (
    user_id = auth.uid()
    and amount + coalesce((select sum(x.amount) from public.xp_events x where x.user_id = auth.uid() and x.local_date = xp_events.local_date), 0) <= 400
  );

------------------------------------------------------------------------------
-- Sessions: Focus Hours, hosted and solo
------------------------------------------------------------------------------

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('focus_hour', 'hosted')),
  focus_date date,                       -- focus_hour only
  host_user_id uuid references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  category text not null default 'other',
  visibility text not null default 'invite_only' check (visibility in ('public', 'invite_only')),
  mode text not null default 'cameras' check (mode in ('cameras', 'quiet')),
  capacity int not null default 8 check (capacity between 2 and 8),
  kickoff_minutes int not null default 0,
  block_count int not null default 2 check (block_count between 1 and 8),
  block_minutes int not null default 25 check (block_minutes between 5 and 120),
  break_minutes int not null default 5 check (break_minutes between 0 and 30),
  scheduled_start timestamptz not null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  check ((type = 'focus_hour') = (focus_date is not null)),
  check (type = 'focus_hour' or host_user_id is not null)
);
create unique index sessions_one_focus_hour_per_day on public.sessions (focus_date) where type = 'focus_hour';
create index on public.sessions (scheduled_start);

create table public.session_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  table_no int not null default 1,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  removed boolean not null default false,
  blocks_completed int not null default 0
);
create unique index session_participants_one_active on public.session_participants (session_id, user_id) where left_at is null;
create index on public.session_participants (session_id, table_no) where left_at is null;

create table public.session_invites (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  invitee_user_id uuid references public.profiles (id) on delete cascade,
  invitee_email text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  check (invitee_user_id is not null or invitee_email is not null)
);
create unique index session_invites_user on public.session_invites (session_id, invitee_user_id) where invitee_user_id is not null;

create table public.session_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  session_id uuid references public.sessions (id) on delete set null,
  type text not null check (type in ('focus_hour', 'hosted', 'solo')),
  title text not null,
  local_date date not null,
  ended_at timestamptz not null default now(),
  blocks int not null check (blocks between 0 and 8),
  minutes int not null check (minutes between 0 and 600),
  task_id uuid references public.tasks (id) on delete set null,
  planned text,
  outcome text not null check (outcome in ('good', 'finished', 'distracted', 'more_time')),
  with_names text[] not null default '{}'
);
create index on public.session_logs (user_id, local_date desc);

create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  block int not null,
  type text not null check (type in ('good', 'finished', 'distracted', 'more_time')),
  message text check (char_length(message) <= 200),
  created_at timestamptz not null default now()
);

alter table public.sessions enable row level security;
alter table public.session_participants enable row level security;
alter table public.session_invites enable row level security;
alter table public.session_logs enable row level security;
alter table public.check_ins enable row level security;

create function public.can_see_session(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from sessions s
    where s.id = sid and (
      s.type = 'focus_hour' or s.visibility = 'public' or s.host_user_id = auth.uid()
      or exists (select 1 from session_invites i where i.session_id = s.id and i.invitee_user_id = auth.uid())
      or exists (select 1 from session_participants p where p.session_id = s.id and p.user_id = auth.uid())
    )
  );
$$;

create function public.is_session_host(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from sessions where id = sid and host_user_id = auth.uid());
$$;

create function public.completed_session_count(uid uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from session_logs where user_id = uid and blocks > 0;
$$;

create policy "visible sessions" on public.sessions for select to authenticated
  using (host_user_id = auth.uid() or type = 'focus_hour' or visibility = 'public' or public.can_see_session(id));
create policy "host creates" on public.sessions for insert to authenticated
  with check (
    type = 'hosted' and host_user_id = auth.uid()
    -- Public sessions unlock after 3 completed sessions (PRD §7)
    and (visibility = 'invite_only' or public.completed_session_count(auth.uid()) >= 3)
  );
create policy "host edits" on public.sessions for update to authenticated
  using (host_user_id = auth.uid()) with check (host_user_id = auth.uid() and type = 'hosted');
create policy "host deletes" on public.sessions for delete to authenticated
  using (host_user_id = auth.uid());

create policy "own participation" on public.session_participants for select to authenticated
  using (user_id = auth.uid() or public.is_session_host(session_id));
-- Joining and leaving go through join_focus_hour / join_session / leave_session.

create policy "invites I sent or received" on public.session_invites for select to authenticated
  using (inviter_id = auth.uid() or invitee_user_id = auth.uid() or public.is_session_host(session_id));
create policy "host invites, or RSVP to a visible session" on public.session_invites for insert to authenticated
  with check (
    inviter_id = auth.uid()
    and (
      public.is_session_host(session_id)
      or (invitee_user_id = auth.uid() and public.can_see_session(session_id))
      or (invitee_user_id is not null and public.is_buddy(auth.uid(), invitee_user_id) and public.can_see_session(session_id))
    )
  );
create policy "invitee responds" on public.session_invites for update to authenticated
  using (invitee_user_id = auth.uid()) with check (invitee_user_id = auth.uid());

create policy "own logs" on public.session_logs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own check-ins" on public.check_ins for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

------------------------------------------------------------------------------
-- Nudges, reports
------------------------------------------------------------------------------

create table public.nudges (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  to_user_id uuid not null references public.profiles (id) on delete cascade,
  message text not null check (char_length(message) <= 80),
  local_date date not null,
  seen boolean not null default false,
  created_at timestamptz not null default now(),
  unique (from_user_id, to_user_id, local_date)        -- one nudge per buddy per day
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  reported_user_id uuid not null references public.profiles (id) on delete cascade,
  session_id uuid references public.sessions (id) on delete set null,
  reason text not null check (reason in ('inappropriate', 'harassment', 'spam', 'content', 'recording', 'no_show', 'other')),
  description text check (char_length(description) <= 1000),
  status text not null default 'open' check (status in ('open', 'upheld', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.nudges enable row level security;
alter table public.reports enable row level security;

create policy "send nudge to buddy" on public.nudges for insert to authenticated
  with check (from_user_id = auth.uid() and public.is_buddy(auth.uid(), to_user_id));
create policy "see own nudges" on public.nudges for select to authenticated
  using (auth.uid() in (from_user_id, to_user_id));
create policy "mark nudge seen" on public.nudges for update to authenticated
  using (to_user_id = auth.uid()) with check (to_user_id = auth.uid());

create policy "file a report" on public.reports for insert to authenticated
  with check (reporter_id = auth.uid() and reported_user_id <> auth.uid());
-- Reports are read by moderators via the dashboard (service role), never by users.

------------------------------------------------------------------------------
-- Functions the app calls (RPC)
------------------------------------------------------------------------------

-- The DreamHub day in a timezone: days end at 03:00 local (PRD §12).
create function public.dream_day(tz text, p_at timestamptz default now()) returns date
language sql stable as $$
  select ((p_at at time zone tz) - interval '3 hours')::date;
$$;

-- Join tonight's Focus Hour and get a table (PRD §6, §18).
-- Placement: skip tables with someone blocked; prefer a buddy's table; then the
-- fullest table with space; otherwise open a new table.
create function public.join_focus_hour()
returns table (session_id uuid, table_no int, scheduled_start timestamptz)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  d date := dream_day('Europe/London');
  s sessions%rowtype;
  chosen int;
  cap constant int := 8;
begin
  if me is null then raise exception 'not signed in'; end if;
  if (select status from profiles where id = me) <> 'active' then raise exception 'account suspended'; end if;

  insert into sessions (type, focus_date, title, category, visibility, mode, capacity, kickoff_minutes, block_count, block_minutes, break_minutes, scheduled_start)
  values ('focus_hour', d, 'Focus Hour', 'other', 'public', 'cameras', cap, 5, 4, 25, 5, (d + time '18:30') at time zone 'Europe/London')
  on conflict (focus_date) where type = 'focus_hour' do nothing;
  select * into s from sessions where type = 'focus_hour' and focus_date = d;

  -- Already seated? Keep the same table.
  select p.table_no into chosen from session_participants p
  where p.session_id = s.id and p.user_id = me and p.left_at is null;

  if chosen is null then
    with seats as (
      select p.table_no, count(*) as n,
             bool_or(is_blocked_between(me, p.user_id)) as blocked,
             bool_or(is_buddy(me, p.user_id)) as has_buddy
      from session_participants p
      where p.session_id = s.id and p.left_at is null
      group by p.table_no
    )
    select seats.table_no into chosen from seats
    where n < cap and not blocked
    order by has_buddy desc, n desc, seats.table_no
    limit 1;

    if chosen is null then
      select coalesce(max(p.table_no), 0) + 1 into chosen from session_participants p where p.session_id = s.id;
    end if;

    insert into session_participants (session_id, user_id, table_no) values (s.id, me, chosen);
  end if;

  update profiles set focusing_until = s.scheduled_start + interval '120 minutes' where id = me;
  return query select s.id, chosen, s.scheduled_start;
end $$;

-- Join a hosted session (link, invite or public). Anyone with the link may join
-- unless they were removed, are blocked by the host, or the room is full.
create function public.join_session(p_session uuid)
returns table (session_id uuid, table_no int, scheduled_start timestamptz)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  s sessions%rowtype;
  present int;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into s from sessions where id = p_session and type = 'hosted' and cancelled_at is null;
  if not found then raise exception 'session not found'; end if;
  if is_blocked_between(me, s.host_user_id) then raise exception 'session not found'; end if;
  if exists (select 1 from session_participants p where p.session_id = s.id and p.user_id = me and p.removed) then
    raise exception 'removed from session';
  end if;

  if not exists (select 1 from session_participants p where p.session_id = s.id and p.user_id = me and p.left_at is null) then
    select count(*) into present from session_participants p where p.session_id = s.id and p.left_at is null;
    if present >= s.capacity then raise exception 'session full'; end if;
    insert into session_participants (session_id, user_id, table_no) values (s.id, me, 1);
  end if;

  update profiles
  set focusing_until = s.scheduled_start + make_interval(mins => s.kickoff_minutes + s.block_count * s.block_minutes + (s.block_count - 1) * s.break_minutes)
  where id = me;
  return query select s.id, 1, s.scheduled_start;
end $$;

create function public.leave_session(p_session uuid, p_blocks int default 0)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  update session_participants
  set left_at = now(), blocks_completed = greatest(blocks_completed, least(p_blocks, 8))
  where session_id = p_session and user_id = me and left_at is null;
  update profiles
  set focusing_until = null,
      sessions_attended = sessions_attended + case when p_blocks > 0 then 1 else 0 end,
      sessions_left_early = sessions_left_early + case when p_blocks = 0 then 1 else 0 end
  where id = me;
end $$;

-- Host removes someone (they can't rejoin that session).
create function public.remove_participant(p_session uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_session_host(p_session) then raise exception 'only the host can remove people'; end if;
  update session_participants set left_at = now(), removed = true
  where session_id = p_session and user_id = p_user and left_at is null;
end $$;

-- Hosted sessions I can see, with host name and who's coming.
create function public.list_sessions()
returns table (
  id uuid, title text, host_user_id uuid, host_name text, is_mine boolean,
  scheduled_start timestamptz, kickoff_minutes int, block_count int, block_minutes int, break_minutes int,
  visibility text, mode text, capacity int, category text,
  attendees text[], invited_me boolean, my_response text
)
language sql stable security definer set search_path = public as $$
  select s.id, s.title, s.host_user_id, h.name, s.host_user_id = auth.uid(),
         s.scheduled_start, s.kickoff_minutes, s.block_count, s.block_minutes, s.break_minutes,
         s.visibility, s.mode, s.capacity, s.category,
         array(
           select pr.name from profiles pr
           where pr.id = s.host_user_id
              or pr.id in (select i.invitee_user_id from session_invites i where i.session_id = s.id and i.status = 'accepted')
           order by pr.id = s.host_user_id desc, pr.name
         ),
         exists (select 1 from session_invites i where i.session_id = s.id and i.invitee_user_id = auth.uid() and i.inviter_id <> auth.uid()),
         (select i.status from session_invites i where i.session_id = s.id and i.invitee_user_id = auth.uid() limit 1)
  from sessions s
  join profiles h on h.id = s.host_user_id
  where s.type = 'hosted'
    and s.cancelled_at is null
    and s.scheduled_start + make_interval(mins => s.kickoff_minutes + s.block_count * s.block_minutes + (s.block_count - 1) * s.break_minutes) > now()
    and can_see_session(s.id)
    and not is_blocked_between(auth.uid(), s.host_user_id)
  order by s.scheduled_start;
$$;

-- Buddy requests by email or user id (PRD §9: max 10 buddies).
create function public.request_buddy(p_email text default null, p_user uuid default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  target uuid := p_user;
begin
  if me is null then raise exception 'not signed in'; end if;
  if target is null and p_email is not null then
    select id into target from profiles_private where lower(email) = lower(trim(p_email));
  end if;
  -- Same answer whether or not the person exists, so emails can't be probed.
  if target is null or target = me or is_blocked_between(me, target) then return 'sent'; end if;
  if (select count(*) from buddies where me in (requester_id, addressee_id)) >= 10 then
    raise exception 'buddy limit reached';
  end if;
  -- If they already asked me, accept instead.
  update buddies set status = 'active' where requester_id = target and addressee_id = me and status = 'pending';
  if found then return 'accepted'; end if;
  insert into buddies (requester_id, addressee_id) values (me, target) on conflict do nothing;
  return 'sent';
end $$;

-- Everything the Buddies screen needs, in one call.
create function public.buddy_overview()
returns table (
  relation_id uuid, user_id uuid, name text, hue smallint, status text, incoming boolean,
  timezone text, rest_weekdays smallint[], created_on date, focusing_until timestamptz,
  active_days date[], rest_days date[], deadlines jsonb
)
language sql stable security definer set search_path = public as $$
  select b.id,
         p.id, p.name, p.hue, b.status, b.addressee_id = auth.uid(),
         p.timezone, p.rest_weekdays, p.created_on,
         case when b.status = 'active' then p.focusing_until end,
         case when b.status = 'active' then array(select local_date from daily_activity d where d.user_id = p.id and d.state = 'active' and d.local_date > current_date - 90 order by 1) else '{}' end,
         case when b.status = 'active' then array(select local_date from daily_activity d where d.user_id = p.id and d.state = 'rest' and d.local_date > current_date - 90 order by 1) else '{}' end,
         case when b.status = 'active' then coalesce((
           select jsonb_agg(jsonb_build_object('title', t.title, 'dueOn', t.due_on, 'createdOn', t.created_on, 'done', t.completed_at is not null) order by t.due_on)
           from tasks t where t.user_id = p.id and t.committed and t.due_on is not null
             and (t.completed_at is null or t.completed_at > now() - interval '2 days')
             and t.due_on >= current_date - 1
           ), '[]'::jsonb) else '[]'::jsonb end
  from buddies b
  join profiles p on p.id = case when b.requester_id = auth.uid() then b.addressee_id else b.requester_id end
  where auth.uid() in (b.requester_id, b.addressee_id);
$$;

-- Witness approves an extension; the task's deadline moves (PRD §11).
create function public.approve_extension(p_extension uuid)
returns void language plpgsql security definer set search_path = public as $$
declare e deadline_extensions%rowtype;
begin
  select * into e from deadline_extensions where id = p_extension and status = 'pending';
  if not found or e.witness_user_id is distinct from auth.uid() then raise exception 'not your extension to approve'; end if;
  update deadline_extensions set status = 'approved', resolved_at = now() where id = e.id;
  update tasks set due_on = e.new_due where id = e.task_id;
end $$;

-- Extensions nobody answered in 24 hours are approved automatically (called on app load).
create function public.settle_my_extensions()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with due as (
    update deadline_extensions set status = 'auto_approved', resolved_at = now()
    where user_id = auth.uid() and status = 'pending' and created_at < now() - interval '24 hours'
    returning task_id, new_due
  )
  update tasks t set due_on = due.new_due from due where t.id = due.task_id;
  get diagnostics n = row_count;
  return n;
end $$;

-- Self-approved extensions move the deadline straight away.
create function public.apply_self_extension(p_extension uuid)
returns void language plpgsql security definer set search_path = public as $$
declare e deadline_extensions%rowtype;
begin
  select * into e from deadline_extensions where id = p_extension and user_id = auth.uid() and status = 'self_approved';
  if not found then raise exception 'extension not found'; end if;
  update tasks set due_on = e.new_due where id = e.task_id and user_id = auth.uid();
end $$;

-- Block someone: removes any buddy link; they can't share a table or invite you (PRD §16).
create function public.block_user(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if p_user = me then return; end if;
  insert into blocks (user_id, blocked_user_id) values (me, p_user) on conflict do nothing;
  delete from buddies where (requester_id = me and addressee_id = p_user) or (requester_id = p_user and addressee_id = me);
end $$;

-- What someone sees before joining from a link (title, host, time, shape). No attendee details.
create function public.session_preview(p_session uuid)
returns table (
  id uuid, title text, host_user_id uuid, host_name text, scheduled_start timestamptz,
  kickoff_minutes int, block_count int, block_minutes int, break_minutes int,
  visibility text, mode text, capacity int, category text, cancelled boolean
)
language sql stable security definer set search_path = public as $$
  select s.id, s.title, s.host_user_id, h.name, s.scheduled_start,
         s.kickoff_minutes, s.block_count, s.block_minutes, s.break_minutes,
         s.visibility, s.mode, s.capacity, s.category, s.cancelled_at is not null
  from sessions s join profiles h on h.id = s.host_user_id
  where s.id = p_session and s.type = 'hosted' and not is_blocked_between(auth.uid(), s.host_user_id);
$$;

-- Delete my account and everything attached to it (PRD §16: account deletion).
create function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- Lets the app check its clock against the server's (server owns the clock, PRD §18).
create function public.server_now() returns timestamptz language sql stable as $$ select now(); $$;

-- Only signed-in users may call the RPCs.
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.join_focus_hour(), public.join_session(uuid), public.leave_session(uuid, int),
  public.remove_participant(uuid, uuid), public.list_sessions(), public.request_buddy(text, uuid),
  public.buddy_overview(), public.approve_extension(uuid), public.settle_my_extensions(),
  public.apply_self_extension(uuid), public.block_user(uuid), public.server_now(), public.session_preview(uuid), public.delete_my_account(),
  public.dream_day(text, timestamptz),
  public.is_buddy(uuid, uuid), public.is_blocked_between(uuid, uuid), public.can_see_session(uuid),
  public.is_session_host(uuid), public.completed_session_count(uuid)
to authenticated;
