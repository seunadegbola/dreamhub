"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { useHydrated } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { Mascot } from "@/components/brand";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated();
  const onboarded = useStore((s) => s.profile.onboarded);
  const router = useRouter();

  useEffect(() => {
    if (hydrated && !onboarded) router.replace("/start");
  }, [hydrated, onboarded, router]);

  if (!hydrated || !onboarded) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Mascot mood="looking" size={88} />
      </div>
    );
  }
  return <AppShell>{children}</AppShell>;
}
