"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { useStore } from "@/lib/store";
import { admin, REASON_LABEL, type AdminReport, type HistoryItem, type Suspended } from "@/lib/admin";
import { Box, Button, Panel, Pill, Segmented } from "@/components/ui";
import { Mascot } from "@/components/brand";

type Tab = "open" | "resolved" | "suspended";

function ago(ts: string | null) {
  if (!ts) return "";
  const m = Math.round((Date.now() - new Date(ts).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d}d ago` : new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const first = (name: string) => name.split(" ")[0] || "there";

const warnTemplate = (r: AdminReport) =>
  `Hi ${first(r.reported_name)}, we’ve had a report about ${REASON_LABEL[r.reason]?.toLowerCase() ?? "your behaviour"} in a DreamHub session. Please take a moment to re-read our community guidelines: be kind, stay on task, and keep your camera on just you. If it happens again, we may suspend your account.`;

const suspendTemplate = (r: AdminReport) =>
  `Your DreamHub account has been suspended after a report of ${REASON_LABEL[r.reason]?.toLowerCase() ?? "a breach of our guidelines"}, which goes against our community guidelines. If you think this is a mistake, email hello@joindreamhub.com.`;

export default function AdminPage() {
  const live = useStore((s) => s.mode === "live");
  const showToast = useStore((s) => s.showToast);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("open");
  const [open, setOpen] = useState<AdminReport[] | null>(null);
  const [resolved, setResolved] = useState<AdminReport[] | null>(null);
  const [suspended, setSuspended] = useState<Suspended[] | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, r, s] = await Promise.all([admin.reports(true), admin.reports(false), admin.suspended()]);
      setOpen(o);
      setResolved(r);
      setSuspended(s);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn’t load reports.");
    }
  }, [showToast]);

  useEffect(() => {
    if (!live) return setAllowed(false);
    admin.isAdmin().then((ok) => {
      setAllowed(ok);
      if (ok) load();
    });
  }, [live, load]);

  if (allowed === null) return <p className="text-muted">Checking…</p>;
  if (!allowed) {
    return (
      <div className="py-16 text-center">
        <Mascot mood="looking" size={96} className="mx-auto" />
        <p className="mt-4 text-xl font-semibold">This page isn’t available.</p>
      </div>
    );
  }

  const list = tab === "open" ? open : tab === "resolved" ? resolved : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Moderation</h1>
          <p className="text-muted">Only admins can see this page. Every decision is logged.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={load}>
          Refresh
        </Button>
      </div>

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "open" as const, label: `Open${open ? ` (${open.length})` : ""}` },
          { value: "resolved" as const, label: "Resolved" },
          { value: "suspended" as const, label: `Suspended${suspended ? ` (${suspended.length})` : ""}` },
        ]}
      />

      {tab === "suspended" ? (
        suspended === null ? (
          <p className="text-muted">Loading…</p>
        ) : suspended.length === 0 ? (
          <p className="text-muted">Nobody is suspended.</p>
        ) : (
          <ul className="space-y-3">
            {suspended.map((m) => (
              <li key={m.user_id}>
                <SuspendedCard member={m} onDone={load} />
              </li>
            ))}
          </ul>
        )
      ) : list === null ? (
        <p className="text-muted">Loading…</p>
      ) : list.length === 0 ? (
        <Panel tone="haze" className="p-6 text-center">
          <p className="font-semibold">{tab === "open" ? "No open reports. 🎉" : "Nothing resolved yet."}</p>
        </Panel>
      ) : (
        <ul className="space-y-4">
          {list.map((r) => (
            <li key={r.id}>
              <ReportCard report={r} onDone={load} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReportCard({ report: r, onDone }: { report: AdminReport; onDone: () => void }) {
  const showToast = useStore((s) => s.showToast);
  const [mode, setMode] = useState<"warn" | "suspend" | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const isOpen = r.status === "open";
  const repeat = r.reports_90d > 1;

  const act = async (fn: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await fn();
      showToast(done);
      setMode(null);
      onDone();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const where =
    r.session_type === "focus_hour"
      ? `Focus Hour, ${new Date(r.session_start!).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}`
      : r.session_type === "hosted"
        ? `“${r.session_title}”`
        : null;

  return (
    <Box className={clsx("p-5", repeat && isOpen && "border-missed")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold">
            {r.reported_name || "Unnamed member"}
            {r.reported_status === "suspended" && <Pill className="ml-2 border-missed bg-missed-tint text-missed">Suspended</Pill>}
          </p>
          <p className="text-sm text-muted">
            {r.reported_email ?? "no email"} · member since {new Date(r.reported_since).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Pill className={clsx(repeat && "border-missed bg-missed-tint text-missed")}>
            {r.reports_90d} report{r.reports_90d === 1 ? "" : "s"} in 90 days
            {r.reporters_90d > 1 ? ` from ${r.reporters_90d} people` : ""}
          </Pill>
          {r.warnings > 0 && (
            <Pill>
              {r.warnings} warning{r.warnings === 1 ? "" : "s"}
            </Pill>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-[10px] bg-paper p-4">
        <p className="font-semibold">{REASON_LABEL[r.reason] ?? r.reason}</p>
        {r.description && <p className="mt-1 whitespace-pre-wrap">“{r.description}”</p>}
        <p className="mt-2 text-sm text-muted">
          Reported by {r.reporter_name || "a member"} · {ago(r.created_at)}
          {where && ` · ${where}`}
        </p>
      </div>

      {!isOpen && (
        <p className="mt-3 text-sm font-semibold">
          {r.status === "dismissed" ? "Dismissed" : "Action taken"} {ago(r.resolved_at)}
          {r.last_action && ` · latest: ${r.last_action}`}
        </p>
      )}

      {mode && (
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">
              {mode === "warn" ? `Message to ${first(r.reported_name)} (shown in the app)` : `Why they’re suspended (shown to ${first(r.reported_name)})`}
            </span>
            <textarea
              className="min-h-28 w-full rounded-[10px] border-2 border-ink bg-surface p-3 text-base focus:outline-none focus:ring-4 focus:ring-haze"
              value={message}
              maxLength={1000}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
          {mode === "suspend" && <p className="text-sm text-muted">They’ll be removed from any session they’re in, their upcoming sessions will be cancelled and they won’t be able to join, host or nudge anyone.</p>}
          <div className="flex flex-wrap gap-2">
            {mode === "warn" ? (
              <Button disabled={busy || !message.trim()} onClick={() => act(() => admin.warn(r.reported_id, message, isOpen ? r.id : undefined), "Warning sent.")}>
                Send warning
              </Button>
            ) : (
              <Button
                className="bg-missed"
                disabled={busy || !message.trim()}
                onClick={() => act(() => admin.suspend(r.reported_id, message, isOpen ? r.id : undefined), `${first(r.reported_name)} is suspended.`)}
              >
                Suspend account
              </Button>
            )}
            <Button variant="ghost" onClick={() => setMode(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!mode && (
        <div className="mt-4 flex flex-wrap gap-2">
          {isOpen && (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => act(() => admin.dismiss(r.id), "Report dismissed.")}>
              Dismiss
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setMessage(warnTemplate(r));
              setMode("warn");
            }}
          >
            Warn
          </Button>
          {r.reported_status === "suspended" ? (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => act(() => admin.unsuspend(r.reported_id), "Suspension lifted.")}>
              Lift suspension
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setMessage(suspendTemplate(r));
                setMode("suspend");
              }}
            >
              Suspend
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={async () => setHistory(history ? null : await admin.history(r.reported_id).catch(() => []))}>
            {history ? "Hide history" : "History"}
          </Button>
        </div>
      )}

      {history && (
        <ol className="mt-4 space-y-2 border-t-[1.5px] border-hairline pt-4 text-sm">
          {history.length === 0 && <li className="text-muted">No history.</li>}
          {history.map((h, i) => (
            <li key={i}>
              <span className="font-semibold capitalize">{h.kind}</span> · {ago(h.at)}
              {h.by_name && ` · ${h.kind === "report" ? "from" : "by"} ${h.by_name}`}
              {h.detail && <span className="block text-muted">{h.detail}</span>}
            </li>
          ))}
        </ol>
      )}
    </Box>
  );
}

function SuspendedCard({ member: m, onDone }: { member: Suspended; onDone: () => void }) {
  const showToast = useStore((s) => s.showToast);
  const [busy, setBusy] = useState(false);
  return (
    <Box className="flex flex-wrap items-center justify-between gap-3 p-5">
      <div>
        <p className="font-bold">{m.name || "Unnamed member"}</p>
        <p className="text-sm text-muted">
          {m.email ?? "no email"} · suspended {ago(m.suspended_at)}
        </p>
        {m.note && <p className="mt-1 text-sm">{m.note}</p>}
      </div>
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await admin.unsuspend(m.user_id);
            showToast("Suspension lifted.");
            onDone();
          } catch (e) {
            showToast(e instanceof Error ? e.message : "Something went wrong.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Lift suspension
      </Button>
    </Box>
  );
}
