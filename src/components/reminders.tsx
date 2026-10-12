"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { useStore } from "@/lib/store";
import { Box, Button, SectionTitle } from "./ui";
import {
  DEFAULT_PREFS,
  deviceMessage,
  deviceState,
  loadPrefs,
  NOTIFY_KINDS,
  savePrefs,
  sendTestPush,
  turnOffPush,
  turnOnPush,
  type DeviceState,
  type NotifyKey,
  type NotifyPrefs,
} from "@/lib/push";

/**
 * For "Remind me" buttons: switches reminders on for this device (asking permission
 * if needed), makes sure that reminder type is on, and says what happened.
 * `done` is shown on success; `base` (optional) is shown whatever happens.
 */
export function useRemindMe() {
  const showToast = useStore((s) => s.showToast);
  return useCallback(
    async (kind: NotifyKey, done: string, base = "") => {
      const { mode, userId } = useStore.getState();
      const say = (t: string) => showToast([base, t].filter(Boolean).join(" "));
      if (mode !== "live" || !userId) return say(done); // demo
      try {
        const state = await turnOnPush();
        if (state !== "on") return say(deviceMessage(state) ?? "No problem. You can turn reminders on in your profile.");
        const prefs = await loadPrefs(userId);
        if (!prefs[kind]) await savePrefs(userId, { ...prefs, [kind]: true });
        say(done);
      } catch (e) {
        console.error(e);
        say("We couldn’t switch reminders on. Try again from your profile.");
      }
    },
    [showToast],
  );
}

/** Profile → Notifications. */
export function NotificationSettings() {
  const mode = useStore((s) => s.mode);
  const userId = useStore((s) => s.userId);
  const showToast = useStore((s) => s.showToast);
  const live = mode === "live" && !!userId;
  const [device, setDevice] = useState<DeviceState | "checking">("checking");
  const [prefs, setPrefs] = useState<NotifyPrefs>(DEFAULT_PREFS);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    deviceState().then(setDevice, () => setDevice("unsupported"));
    if (live) loadPrefs(userId!).then(setPrefs, () => {});
  }, [live, userId]);

  const toggle = async (key: NotifyKey) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    if (!live) return;
    try {
      await savePrefs(userId!, next);
    } catch {
      setPrefs(prefs);
      showToast("Couldn’t save that. Check your connection and try again.");
    }
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const message = device === "checking" ? null : deviceMessage(device);

  return (
    <Box className="p-5">
      <SectionTitle>Notifications</SectionTitle>
      <p className="-mt-2 mb-4 text-muted">At most 3 a day and none between 10pm and 8am, except reminders for sessions you’ve signed up to.</p>

      <div className="mb-5 rounded-[10px] border-[1.5px] border-hairline bg-paper p-4">
        {!live ? (
          <p className="text-sm text-muted">Create an account to get reminders on your phone or computer.</p>
        ) : device === "checking" ? (
          <p className="text-sm text-muted">Checking this device…</p>
        ) : device === "on" ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-semibold">✓ Reminders are on for this device</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await sendTestPush();
                    showToast("Sent. It should appear in a few seconds.");
                  })
                }
              >
                Send a test
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await turnOffPush();
                    setDevice(await deviceState());
                  })
                }
              >
                Turn off
              </Button>
            </div>
          </div>
        ) : device === "off" ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">Get reminders on this device, even when DreamHub isn’t open.</p>
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const state = await turnOnPush();
                  setDevice(state);
                  if (state === "on") showToast("Reminders are on for this device.");
                  else if (deviceMessage(state)) showToast(deviceMessage(state)!);
                })
              }
            >
              Turn on reminders
            </Button>
          </div>
        ) : (
          <p className="text-sm">{message}</p>
        )}
      </div>

      <ul className="space-y-3">
        {NOTIFY_KINDS.map(({ key, label, hint }) => (
          <li key={key} className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">{label}</p>
              <p className="text-sm text-muted">{hint}</p>
            </div>
            <button
              role="switch"
              aria-checked={prefs[key]}
              aria-label={label}
              onClick={() => toggle(key)}
              className={clsx("relative h-7 w-12 shrink-0 rounded-full border-2 border-ink transition-colors", prefs[key] ? "bg-blue" : "bg-surface")}
            >
              <span className={clsx("absolute top-0.5 size-5 rounded-full border-2 border-ink bg-white transition-all", prefs[key] ? "left-[22px]" : "left-0.5")} />
            </button>
          </li>
        ))}
      </ul>
    </Box>
  );
}
