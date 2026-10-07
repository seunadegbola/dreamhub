"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "./store";
import { supabase, supabaseConfigured } from "./supabase/client";

export type GateState = "checking" | "ready" | "redirecting" | "error";

/**
 * Decides who may see the app:
 *  - signed in with Supabase → load their data (once per visit) → ready
 *  - signed in but never finished onboarding → /start
 *  - demo user (Try the demo, or no Supabase) → ready
 *  - nobody → /login (or /start if Supabase isn't set up)
 */
export function useSessionGate(): { state: GateState; retry: () => void } {
  const router = useRouter();
  const [state, setState] = useState<GateState>("checking");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const go = (path: string) => {
      if (cancelled) return;
      setState("redirecting");
      router.replace(path);
    };

    (async () => {
      const s = useStore.getState();
      if (!supabaseConfigured) {
        return s.profile.onboarded ? setState("ready") : go("/start");
      }
      const { data } = await supabase().auth.getUser();
      const user = data.user;
      if (cancelled) return;

      if (!user) {
        if (s.mode === "live") s.reset(); // signed out elsewhere
        if (useStore.getState().mode === "demo" && useStore.getState().profile.onboarded) return setState("ready");
        return go(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      }

      if (s.mode === "live" && s.userId === user.id && s.loaded) return setState("ready");
      try {
        await useStore.getState().startLive(user.id, user.email ?? "");
      } catch (e) {
        console.error(e);
        if (!cancelled) setState("error");
        return;
      }
      if (cancelled) return;
      if (!useStore.getState().profile.onboarded) return go("/start?step=0");
      setState("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [router, attempt]);

  return { state, retry: () => setAttempt((a) => a + 1) };
}
