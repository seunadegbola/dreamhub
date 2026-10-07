"use client";

import { useEffect, useState } from "react";
import { useStore, nowMs } from "./store";
import { dreamDay } from "./domain/time";

/** True after the first client render — gates UI that reads persisted state. */
export function useHydrated() {
  const [h, setH] = useState(false);
  useEffect(() => setH(true), []);
  return h;
}

/** Current time (respecting the demo clock offset), ticking every `intervalMs`. */
export function useNow(intervalMs = 1000) {
  const offset = useStore((s) => s.clockOffsetMin);
  const [now, setNow] = useState(() => nowMs(offset));
  useEffect(() => {
    setNow(nowMs(offset));
    const id = setInterval(() => setNow(nowMs(offset)), intervalMs);
    return () => clearInterval(id);
  }, [offset, intervalMs]);
  return now;
}

export function useToday() {
  const now = useNow(30_000);
  const tz = useStore((s) => s.profile.timezone);
  return dreamDay(now, tz);
}
