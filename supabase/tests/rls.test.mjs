// Runs the DreamHub migration on a local Postgres (PGlite) with Supabase's auth pieces
// stubbed, then checks the security rules and functions behave as intended.
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";

const migration = fs.readFileSync(process.argv[2] ?? new URL("../migrations/0001_init.sql", import.meta.url), "utf8");
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

console.log("Account deletion");
await as(D, "select delete_my_account()");
ok("deleting an account removes the user and their profile", (await db.query("select count(*)::int n from profiles where id=$1", [D])).rows[0].n === 0 && (await db.query("select count(*)::int n from auth.users where id=$1", [D])).rows[0].n === 0);
ok("anonymous can't call functions", !!(await fails(null, "select * from join_focus_hour()")));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
