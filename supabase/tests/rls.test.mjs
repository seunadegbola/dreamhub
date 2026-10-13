// Runs the DreamHub migration on a local Postgres (PGlite) with Supabase's auth pieces
// stubbed, then checks the security rules and functions behave as intended.
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";

// 0003 (the cron schedule) needs Supabase's pg_cron/pg_net, so it isn't run here.
const migration = ["0001_init.sql", "0002_reminders.sql", "0004_moderation.sql"].map((f) => fs.readFileSync(new URL(`../migrations/${f}`, import.meta.url), "utf8")).join("\n");
const db = new PGlite();

const stub = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) { pass++; console.log("  ✓", name); } else { fail++; console.log("  ✗", name, extra); } };

async function as(uid, sql, params) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); set role ${uid ? "authenticated" : "anon"};`);
  try { return await db.query(sql, params); } finally { await db.exec("reset role;"); }
}
async function fails(uid, sql, params) {
  try { await as(uid, sql, params); return false; } catch (e) { return e.message; }
}

process.on("unhandledRejection", (e) => { console.log("UNEXPECTED ERROR:", e.message, e.query ?? ""); process.exit(1); });
await db.exec(stub);
try {
  await db.exec(migration);
  ok("migration runs", true);
} catch (e) {
  console.log("MIGRATION FAILED:", e.message, e.position ? `at ${e.position}: ` + migration.slice(e.position - 120, Number(e.position) + 80) : "");
  process.exit(1);
}

const users = {};
for (const [k, email, name] of [["A", "alex@x.com", "Alex"], ["B", "priya@x.com", "Priya"], ["C", "sam@x.com", "Sam"], ["D", "dee@x.com", "Dee"]]) {
  const r = await db.query("insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id", [email, { name }]);
  users[k] = r.rows[0].id;
}
const { A, B, C, D } = users;

console.log("Profiles");
ok("signup creates profile with name", (await db.query("select name from profiles where id=$1", [A])).rows[0]?.name === "Alex");
ok("others can read names", (await as(B, "select name from profiles where id=$1", [A])).rows.length === 1);
ok("others cannot read email/date of birth", (await as(B, "select * from profiles_private where id=$1", [A])).rows.length === 0);
ok("owner reads own email", (await as(A, "select email from profiles_private where id=$1", [A])).rows[0]?.email === "alex@x.com");
ok("cannot change own status", !!(await fails(A, "update profiles set status='active' where id=$1", [A])));
ok("can change own name", (await as(A, "update profiles set name='Alexa' where id=$1 returning name", [A])).rows[0]?.name === "Alexa");
ok("cannot change someone else's name", (await as(A, "update profiles set name='x' where id=$1 returning id", [B])).rows.length === 0);
ok("anonymous visitors see nothing", (await as(null, "select * from profiles")).rows.length === 0);

console.log("Goals and tasks");
const g = (await as(A, "insert into goals (title, category, deadline, committed) values ('Dissertation','school', current_date + 20, true) returning id")).rows[0].id;
const t1 = (await as(A, "insert into tasks (goal_id, title, due_on, committed) values ($1,'Lit review', current_date + 3, true) returning id", [g])).rows[0].id;
const t2 = (await as(A, "insert into tasks (goal_id, title, due_on, committed) values ($1,'Private task', current_date + 5, false) returning id", [g])).rows[0].id;
await as(A, "insert into subtasks (task_id, title) values ($1, 'Secret step')", [t1]);
ok("owner sees own tasks", (await as(A, "select * from tasks")).rows.length === 2);
ok("stranger sees no tasks", (await as(C, "select * from tasks")).rows.length === 0);
ok("stranger sees no goals", (await as(C, "select * from goals")).rows.length === 0);
ok("cannot add a task to someone else's goal", !!(await fails(C, "insert into tasks (goal_id, title) values ($1, 'hijack')", [g])));
ok("cannot insert a goal as someone else", !!(await fails(C, "insert into goals (user_id, title, category) values ($1, 'x', 'work')", [A])));

console.log("Buddies");
ok("request by email returns 'sent'", (await as(A, "select request_buddy('PRIYA@x.com') as r")).rows[0].r === "sent");
ok("unknown email gives same answer (no probing)", (await as(A, "select request_buddy('nobody@x.com') as r")).rows[0].r === "sent");
ok("pending buddy can't see tasks yet", (await as(B, "select * from tasks")).rows.length === 0);
ok("requester can't accept on the other's behalf", (await as(A, "update buddies set status='active' returning id")).rows.length === 0);
await as(B, "update buddies set status='active' where addressee_id=$1", [B]);
ok("buddy sees committed deadline only", JSON.stringify((await as(B, "select title from tasks")).rows) === JSON.stringify([{ title: "Lit review" }]));
ok("buddy can't see steps", (await as(B, "select * from subtasks")).rows.length === 0);
ok("buddy sees goal titles", (await as(B, "select title from goals")).rows.length === 1);
await as(A, "insert into daily_activity (local_date, state) values (current_date, 'active')");
ok("buddy sees streak days", (await as(B, "select * from daily_activity where user_id=$1", [A])).rows.length === 1);
ok("stranger can't see streak days", (await as(C, "select * from daily_activity")).rows.length === 0);
const ov = (await as(B, "select * from buddy_overview()")).rows;
ok("buddy_overview returns the buddy with deadlines", ov.length === 1 && ov[0].name === "Alexa" && ov[0].deadlines.length === 1 && ov[0].active_days.length === 1);
ok("stranger can't nudge", !!(await fails(C, "insert into nudges (to_user_id, message, local_date) values ($1,'hi',current_date)", [A])));
await as(B, "insert into nudges (to_user_id, message, local_date) values ($1,'hi',current_date)", [A]);
ok("one nudge per buddy per day", !!(await fails(B, "insert into nudges (to_user_id, message, local_date) values ($1,'again',current_date)", [A])));

console.log("Extensions");
const ext = (await as(A, "insert into deadline_extensions (task_id, witness_user_id, old_due, new_due, reason) values ($1,$2, current_date+3, current_date+6, 'sources late') returning id", [t1, B])).rows[0].id;
ok("non-buddy can't be a witness", !!(await fails(A, "insert into deadline_extensions (task_id, witness_user_id, old_due, new_due, reason) values ($1,$2, current_date+3, current_date+6, 'x')", [t1, C])));
ok("stranger can't approve", !!(await fails(C, "select approve_extension($1)", [ext])));
ok("owner can't approve own request", !!(await fails(A, "select approve_extension($1)", [ext])));
await as(B, "select approve_extension($1)", [ext]);
const due = (await db.query("select due_on - current_date as d from tasks where id=$1", [t1])).rows[0].d;
ok("witness approval moves the deadline", due === 6, `got ${due}`);

console.log("XP");
await as(A, "insert into xp_events (action, amount, local_date) values ('focus', 390, current_date)");
ok("daily cap of 400 XP enforced", !!(await fails(A, "insert into xp_events (action, amount, local_date) values ('focus', 20, current_date)")));
ok("can still earn up to the cap", (await as(A, "insert into xp_events (action, amount, local_date) values ('focus', 10, current_date) returning id")).rows.length === 1);

console.log("Focus Hour tables");
const ja = (await as(A, "select * from join_focus_hour()")).rows[0];
const jb = (await as(B, "select * from join_focus_hour()")).rows[0];
ok("buddies are seated together", ja.table_no === jb.table_no && ja.session_id === jb.session_id);
ok("re-joining keeps the same table", (await as(A, "select * from join_focus_hour()")).rows[0].table_no === ja.table_no);
await as(A, "select block_user($1)", [C]);
const jc = (await as(C, "select * from join_focus_hour()")).rows[0];
ok("blocked person gets a different table", jc.table_no !== ja.table_no);
ok("blocking removes buddy link", (await db.query("select count(*)::int n from buddies where $1 in (requester_id, addressee_id) and $2 in (requester_id, addressee_id)", [A, C])).rows[0].n === 0);
const jd = (await as(D, "select * from join_focus_hour()")).rows[0];
ok("newcomer fills the fullest table with space", jd.table_no === ja.table_no);
const start = new Date(ja.scheduled_start);
ok("Focus Hour starts 18:30 London time", new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }).format(start) === "18:30");
// fill table to 8
const extra = [];
for (let i = 0; i < 6; i++) {
  const id = (await db.query("insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id", [`u${i}@x.com`, { name: `U${i}` }])).rows[0].id;
  extra.push(id);
  await as(id, "select * from join_focus_hour()");
}
const sizes = (await db.query("select table_no, count(*)::int n from session_participants where left_at is null group by 1 order by 1")).rows;
ok("no table goes above 8", sizes.every((r) => r.n <= 8), JSON.stringify(sizes));
await as(A, "select leave_session($1, 2)", [ja.session_id]);
ok("leaving frees the seat and counts attendance", (await db.query("select sessions_attended from profiles where id=$1", [A])).rows[0].sessions_attended === 1);

console.log("Hosted sessions");
const hs = (await as(A, "insert into sessions (type, host_user_id, title, visibility, capacity, scheduled_start) values ('hosted',$1,'Dissertation grind','invite_only',2, now() + interval '10 min') returning id", [A])).rows[0].id;
ok("public session needs 3 completed sessions", !!(await fails(A, "insert into sessions (type, host_user_id, title, visibility, scheduled_start) values ('hosted',$1,'x','public', now())", [A])));
ok("can't create a session as someone else", !!(await fails(D, "insert into sessions (type, host_user_id, title, scheduled_start) values ('hosted',$1,'x', now())", [A])));
ok("can't create a Focus Hour directly", !!(await fails(A, "insert into sessions (type, focus_date, title, scheduled_start) values ('focus_hour', current_date + 1,'x', now())")));
ok("invite-only session hidden from strangers", (await as(D, "select * from sessions where id=$1", [hs])).rows.length === 0);
ok("…but its link preview works", (await as(D, "select * from session_preview($1)", [hs])).rows[0]?.host_name === "Alexa");
await as(A, "insert into session_invites (session_id, inviter_id, invitee_user_id) values ($1,$2,$3)", [hs, A, B]);
const bl = (await as(B, "select * from list_sessions()")).rows;
ok("invitee sees it in list_sessions with invited_me", bl.length === 1 && bl[0].invited_me === true && bl[0].my_response === "pending");
await as(B, "update session_invites set status='accepted' where invitee_user_id=$1", [B]);
ok("attendee names include host and accepted invitee", JSON.stringify((await as(A, "select attendees from list_sessions()")).rows[0].attendees) === JSON.stringify(["Alexa", "Priya"]));
await as(D, "select * from join_session($1)", [hs]);
ok("link holder can join", (await as(D, "select * from sessions where id=$1", [hs])).rows.length === 1);
await as(B, "select * from join_session($1)", [hs]);
ok("capacity enforced", !!(await fails(extra[0], "select * from join_session($1)", [hs])));
ok("blocked user can't join host's session", !!(await fails(C, "select * from join_session($1)", [hs])));
ok("only the host can remove people", !!(await fails(B, "select remove_participant($1,$2)", [hs, D])));
await as(A, "select remove_participant($1,$2)", [hs, D]);
ok("removed person can't rejoin", !!(await fails(D, "select * from join_session($1)", [hs])));
ok("stranger can't invite people to someone else's session", !!(await fails(extra[1], "insert into session_invites (session_id, inviter_id, invitee_user_id) values ($1,$2,$3)", [hs, extra[1], extra[2]])));

console.log("Reports, logs");
ok("can report someone", (await as(B, "insert into reports (reported_user_id, reason) values ($1,'spam')", [D])).affectedRows === 1);
ok("can't read reports", (await as(B, "select * from reports")).rows.length === 0);
ok("can't report yourself", !!(await fails(B, "insert into reports (reported_user_id, reason) values ($1,'spam')", [B])));
await as(A, "insert into session_logs (type,title,local_date,blocks,minutes,outcome) values ('solo','Solo',current_date,1,25,'good')");
ok("logs are private", (await as(B, "select * from session_logs")).rows.length === 0);
ok("dream_day rolls over at 03:00", (await db.query("select dream_day('Europe/London', '2026-10-08 01:30:00+01') as d")).rows[0].d.toISOString().slice(0, 10) === "2026-10-07");

console.log("Reminders");
const fcm = (k) => `https://fcm.googleapis.com/fcm/send/device-${k}`;
await db.query("update profiles set onboarded = true, timezone = 'Europe/London', rest_weekdays = '{}', created_on = '2026-10-01' where id = any($1)", [[A, B, C]]);
await as(A, "select save_push_subscription($1, 'p256-key', 'auth-key')", [fcm("a")]);
ok("can save this device", (await as(A, "select endpoint from push_subscriptions")).rows.length === 1);
ok("can't see other people's devices", (await as(B, "select * from push_subscriptions")).rows.length === 0);
ok("only real push services accepted", !!(await fails(B, "select save_push_subscription('https://evil.example/hook', 'k', 'a')")));
ok("anonymous can't save devices", !!(await fails(null, "select save_push_subscription($1, 'k', 'a')", [fcm("x")])));
ok("people can't run the reminder job", !!(await fails(A, "select queue_reminders()")));
ok("people can't read the outbox", (await as(A, "select * from push_outbox")).rows.length === 0);
ok("outbox can't be taken without the secret", !!(await fails(null, "select * from take_push_outbox('wrong-secret-wrong-secret-wrong-secret')")));
ok("secret isn't reachable through the API", !!(await fails(null, "select * from private.settings")) && !!(await fails(A, "select * from private.settings")));

const queue = async (at) => (await db.query("select queue_reminders($1::timestamptz) as n", [at])).rows[0].n;
const outbox = async (uid, kind) => (await db.query("select * from push_outbox where user_id=$1 and kind=$2 order by id", [uid, kind])).rows;

// Tuesday 13 Oct 2026, 18:26 in London: Focus Hour is 4 minutes away.
await queue("2026-10-13 18:26:00+01");
ok("Focus Hour reminder at 6:25pm", (await outbox(A, "focus_hour")).length === 1);
await queue("2026-10-13 18:27:00+01");
ok("never sent twice", (await outbox(A, "focus_hour")).length === 1);
ok("no device, no reminder", (await outbox(B, "focus_hour")).length === 0);
await queue("2026-10-13 18:20:00+01");
ok("nothing before 6:25pm", (await db.query("select count(*)::int n from push_outbox where kind='focus_hour' and ref='2026-10-12'")).rows[0].n === 0);

await as(C, "select save_push_subscription($1, 'k', 'a')", [fcm("c")]);
const tue = (await db.query("select extract(dow from date '2026-10-14')::int d")).rows[0].d;
await db.query("update profiles set rest_weekdays = $2 where id = $1", [C, [tue]]);
await db.query("update profiles set timezone = 'Asia/Tokyo' where id = $1", [B]);
await as(B, "select save_push_subscription($1, 'k', 'a')", [fcm("b")]);
await queue("2026-10-14 18:26:00+01");
ok("no Focus Hour reminder on a rest day", (await outbox(C, "focus_hour")).length === 0);
ok("nothing during quiet hours (2:26am in Tokyo)", (await outbox(B, "focus_hour")).length === 0);
ok("next day's reminder still goes to others", (await outbox(A, "focus_hour")).length === 2);

// Save day: A active on 13 Oct... make 15 Oct a miss, 16 Oct the save day.
await db.query("delete from daily_activity where user_id = $1", [A]);
await db.query("insert into daily_activity (user_id, local_date, state) values ($1, '2026-10-14', 'active')", [A]);
await queue("2026-10-16 18:20:00+01");
const refs = async (uid, kind) => (await outbox(uid, kind)).map((r) => r.ref);
ok("save-day reminder after one missed day", (await refs(A, "save_day")).includes("2026-10-16"));
await queue("2026-10-16 09:30:00+01");
ok("missed-day message at 9am", (await refs(A, "missed_day")).includes("2026-10-16"));
await queue("2026-10-17 18:20:00+01");
ok("no save-day reminder after two missed days", !(await refs(A, "save_day")).includes("2026-10-17"));
await db.query("insert into daily_activity (user_id, local_date, state) values ($1, '2026-10-19', 'active'), ($1, '2026-10-21', 'active')", [A]);
await queue("2026-10-21 18:20:00+01");
ok("no save-day reminder once today counts", !(await refs(A, "save_day")).includes("2026-10-21"));

// Deadlines on 22 Oct.
const g2 = (await db.query("insert into goals (user_id, title, category, intensity) values ($1, 'Portfolio', 'work', 'standard') returning id", [A])).rows[0].id;
await db.query("insert into tasks (goal_id, user_id, title, due_on, sort_order) values ($1,$2,'Write the intro','2026-10-22',1), ($1,$2,'Pick photos','2026-10-23',2)", [g2, A]);
const g3 = (await db.query("insert into goals (user_id, title, category, intensity) values ($1, 'Garden', 'personal', 'gentle') returning id", [A])).rows[0].id;
await db.query("insert into tasks (goal_id, user_id, title, due_on) values ($1,$2,'Buy seeds','2026-10-23')", [g3, A]);
await db.query("insert into daily_activity (user_id, local_date, state) values ($1, '2026-10-22', 'active')", [A]);
await queue("2026-10-22 08:59:00+01");
ok("no deadline reminder before 9am", !(await refs(A, "deadlines")).includes("2026-10-22"));
await queue("2026-10-22 09:05:00+01");
const dl = (await outbox(A, "deadlines")).filter((r) => r.ref === "2026-10-22");
ok("deadline reminder names today's step", dl[0]?.title === "Due today: Write the intro", JSON.stringify(dl));
ok("…and counts tomorrow's (not gentle goals)", dl[0]?.body.startsWith("1 due tomorrow."), dl[0]?.body);

// Hosted session in 3 minutes: host B (Tokyo, after midnight) and A who said they'll be there.
const hs2 = (await db.query("insert into sessions (type, host_user_id, title, scheduled_start) values ('hosted', $1, 'Late sprint', '2026-10-24 17:00:00+01') returning id", [B])).rows[0].id;
await db.query("insert into session_invites (session_id, inviter_id, invitee_user_id, status) values ($1,$2,$2,'accepted')", [hs2, A]);
await queue("2026-10-24 16:57:00+01");
ok("5-minute reminder for people going to a hosted session", (await outbox(A, "hosted")).length === 1);
ok("host gets it too, even late at night", (await outbox(B, "hosted")).length === 1);

// Nudges, the 3-a-day cap and switching things off.
await db.query("insert into nudges (from_user_id, to_user_id, message, local_date, created_at) values ($1,$2,'You got this','2026-10-25','2026-10-25 12:00+01'), ($3,$2,'Go go go','2026-10-25','2026-10-25 12:00+01')", [B, A, C]);
await db.query("insert into push_outbox (user_id, kind, ref, title, body, local_date, created_at, sent_at) values ($1,'invite','x1','t','b','2026-10-25','2026-10-25 10:00+01', now()), ($1,'invite','x2','t','b','2026-10-25','2026-10-25 10:00+01', now())", [A]);
await queue("2026-10-25 12:01:00+01");
ok("nudges are sent, but never more than 3 a day", (await outbox(A, "nudge")).filter((r) => r.ref !== "x" && String(r.local_date.toISOString()).startsWith("2026-10-25")).length === 1);
await as(A, "update profiles_private set notify = '{\"focus_hour\": false}' where id = $1", [A]);
await queue("2026-10-26 18:26:00+00");
ok("a switched-off reminder isn't sent", !(await outbox(A, "focus_hour")).some((r) => r.ref === "2026-10-26"));

// Delivery
const secret = (await db.query("select value from private.settings where key='push_secret'")).rows[0].value;
await db.query("update push_outbox set sent_at = null, created_at = now() where user_id = $1 and kind = 'nudge'", [A]);
const taken = (await as(null, "select * from take_push_outbox($1)", [secret])).rows;
ok("the sender gets waiting reminders with the device", taken.some((t) => t.endpoint === fcm("a") && t.title.endsWith("nudged you") && ["You got this", "Go go go"].includes(t.body)), JSON.stringify(taken));
ok("…and they're marked sent", (await as(null, "select * from take_push_outbox($1)", [secret])).rows.length === 0);
await as(B, "select remove_push_subscription($1)", [fcm("a")]);
ok("can't remove someone else's device", (await db.query("select count(*)::int n from push_subscriptions where endpoint=$1", [fcm("a")])).rows[0].n === 1);
await as(B, "select save_push_subscription($1, 'k', 'a')", [fcm("a")]);
ok("a shared device moves to whoever signed in last", (await db.query("select user_id from push_subscriptions where endpoint=$1", [fcm("a")])).rows[0].user_id === B);
ok("gone devices can be dropped by the sender", (await as(null, "select drop_push_endpoints($1, $2) as n", [secret, [fcm("a")]])).rows[0].n === 1);

console.log("Moderation");
await db.query("insert into private.admins (user_id) values ($1)", [A]);
await as(A, "select save_push_subscription($1, 'k', 'a')", [fcm("admin")]);
ok("admins are recognised", (await as(A, "select is_admin() as a")).rows[0].a === true && (await as(B, "select is_admin() as a")).rows[0].a === false);
ok("members can't see reports through the admin view", !!(await fails(B, "select * from admin_reports()")));
ok("members can't warn or suspend", !!(await fails(B, "select admin_warn($1, 'x')", [C])) && !!(await fails(B, "select * from admin_suspend($1, 'x')", [C])));
ok("anonymous can't check admin status", !!(await fails(null, "select is_admin()")));
await as(C, "insert into reports (reported_user_id, reason, description) values ($1, 'harassment', 'Kept commenting on my room')", [B]);
const rep = (await as(A, "select * from admin_reports()")).rows.find((r) => r.reported_id === B && r.reason === "harassment");
ok("admin sees the report with context", !!rep && rep.reporter_name === "Sam" && rep.reports_90d >= 1, JSON.stringify(rep));
ok("admin gets a notification about it", (await outbox(A, "report")).some((r) => r.ref === rep?.id && r.title === "New report: Harassment" && !r.body.includes("Kept")));

await as(A, "select admin_warn($1, 'Please keep comments kind.', $2)", [B, rep.id]);
ok("the member sees the warning", (await as(B, "select message from member_notices where kind='warning'")).rows[0]?.message === "Please keep comments kind.");
ok("nobody else sees it", (await as(C, "select * from member_notices")).rows.length === 0);
ok("warning closes the report as upheld", (await db.query("select status from reports where id=$1", [rep.id])).rows[0].status === "upheld");
ok("member can mark it seen", (await as(B, "update member_notices set seen_at = now() where user_id = $1 returning id", [B])).rows.length === 1);
ok("member can't edit the message", !!(await fails(B, "update member_notices set message = 'x' where user_id = $1", [B])));
ok("member can't write notices", !!(await fails(B, "insert into member_notices (user_id, kind, message) values ($1, 'warning', 'x')", [B])));
ok("decisions aren't readable directly", (await as(A, "select * from moderation_actions")).rows.length === 0);

await as(C, "insert into reports (reported_user_id, reason) values ($1, 'spam')", [B]);
const rep2 = (await as(A, "select * from admin_reports()")).rows.find((r) => r.reported_id === B && r.reason === "spam");
ok("record counts reports and warnings", rep2?.reports_90d >= 2 && rep2?.warnings === 1 && rep2?.last_action === "warn", JSON.stringify(rep2));
await db.query("update session_participants set left_at = null, removed = false where user_id = $1 and session_id = $2", [B, hs]);
const seats = (await as(A, "select * from admin_suspend($1, 'Suspended after repeated reports.', $2)", [B, rep2.id])).rows;
ok("suspending returns the rooms to disconnect", seats.some((x) => x.session_id === hs));
ok("they're removed from the session", (await db.query("select count(*)::int n from session_participants where user_id=$1 and left_at is null", [B])).rows[0].n === 0);
ok("suspended member can't join Focus Hour", !!(await fails(B, "select * from join_focus_hour()")));
ok("…or rejoin a session", !!(await fails(B, "select * from join_session($1)", [hs])));
ok("…or host one", !!(await fails(B, "insert into sessions (type, host_user_id, title, scheduled_start) values ('hosted', $1, 'x', now() + interval '1 day')", [B])));
ok("…or nudge anyone", !!(await fails(B, "insert into nudges (to_user_id, message, local_date) values ($1, 'hi', '2026-11-01')", [A])));
ok("they see why", (await as(B, "select message from member_notices where kind='suspension'")).rows[0]?.message === "Suspended after repeated reports.");
ok("their devices stop getting reminders", (await db.query("select count(*)::int n from push_subscriptions where user_id=$1", [B])).rows[0].n === 0);
ok("suspended list shows them", (await as(A, "select * from admin_suspended()")).rows.some((r) => r.user_id === B));
ok("admin can't suspend themselves", !!(await fails(A, "select * from admin_suspend($1, 'x')", [A])));
const hist = (await as(A, "select * from admin_history($1)", [B])).rows;
ok("history lists reports and decisions", ["report", "warn", "suspend"].every((k) => hist.some((h) => h.kind === k)), JSON.stringify(hist.map((h) => h.kind)));
await as(A, "select admin_unsuspend($1, 'Spoke to them')", [B]);
ok("unsuspending restores access", (await db.query("select status from profiles where id=$1", [B])).rows[0].status === "active" && (await as(B, "select * from join_focus_hour()")).rows.length === 1);
await as(C, "insert into reports (reported_user_id, reason) values ($1, 'other')", [A]);
const rep3 = (await as(A, "select * from admin_reports()")).rows.find((r) => r.reported_id === A);
await as(A, "select admin_dismiss_report($1, 'Not a problem')", [rep3.id]);
ok("dismissed reports move to resolved", (await as(A, "select * from admin_reports(false)")).rows.some((r) => r.id === rep3.id && r.status === "dismissed"));

console.log("Account deletion");
await as(D, "select delete_my_account()");
ok("deleting an account removes the user and their profile", (await db.query("select count(*)::int n from profiles where id=$1", [D])).rows[0].n === 0 && (await db.query("select count(*)::int n from auth.users where id=$1", [D])).rows[0].n === 0);
ok("anonymous can't call functions", !!(await fails(null, "select * from join_focus_hour()")));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
