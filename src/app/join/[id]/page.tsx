"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/hooks";
import { Mascot } from "@/components/brand";

/** Invite links land here: new people go through onboarding first, then into the session. */
export default function Join() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const hydrated = useHydrated();
  const onboarded = useStore((s) => s.profile.onboarded);
  useEffect(() => {
    if (!hydrated) return;
    router.replace(onboarded ? `/room/${id}` : `/start?next=/room/${id}`);
  }, [hydrated, onboarded, id, router]);
  return (
    <div className="grid min-h-dvh place-items-center">
      <Mascot mood="looking" size={88} />
    </div>
  );
}
