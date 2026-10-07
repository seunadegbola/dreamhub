"use client";

import { AppShell } from "@/components/app-shell";
import { Mascot } from "@/components/brand";
import { Button } from "@/components/ui";
import { useSessionGate } from "@/lib/session-gate";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { state, retry } = useSessionGate();

  if (state === "error") {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <Mascot mood="looking" size={96} className="mx-auto" />
          <p className="mt-4 text-xl font-semibold">We couldn’t load your account.</p>
          <p className="mt-1 text-muted">Check your connection, then try again.</p>
          <Button className="mt-5" onClick={retry}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (state !== "ready") {
    return (
      <div className="grid min-h-dvh place-items-center" role="status" aria-label="Loading">
        <Mascot mood="looking" size={88} />
      </div>
    );
  }
  return <AppShell>{children}</AppShell>;
}
