"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mascot } from "@/components/brand";
import { Button, ButtonLink } from "@/components/ui";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase/client";

/** After the email link or Google: save the plan made during onboarding to the new account. */
export default function FinishSignup() {
  const router = useRouter();
  const ran = useRef(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      const { data } = await supabase().auth.getUser();
      const user = data.user;
      if (!user) return router.replace("/login?error=link");

      // Returning user who used the sign-up form: don't overwrite their account.
      const { data: profile } = await supabase().from("profiles").select("onboarded").eq("id", user.id).single();
      try {
        if (profile?.onboarded) {
          await useStore.getState().startLive(user.id, user.email ?? "");
          return router.replace(useStore.getState().draft.next ?? "/home");
        }
        await useStore.getState().finishLiveOnboarding(user.id, user.email ?? "");
        router.replace("/start?step=6");
      } catch (e) {
        console.error(e);
        setError(true);
      }
    })();
  }, [router]);

  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      {error ? (
        <div>
          <Mascot mood="looking" size={96} className="mx-auto" />
          <p className="mt-4 text-xl font-semibold">You’re signed in, but we couldn’t save your plan.</p>
          <p className="mt-1 text-muted">Check your connection and try again, or add your goal from the dashboard.</p>
          <div className="mt-5 flex justify-center gap-3">
            <Button onClick={() => window.location.reload()}>Try again</Button>
            <ButtonLink href="/home" variant="secondary">
              Go to dashboard
            </ButtonLink>
          </div>
        </div>
      ) : (
        <div role="status">
          <Mascot mood="happy" size={96} className="mx-auto" />
          <p className="mt-4 text-xl font-semibold">Saving your plan…</p>
        </div>
      )}
    </div>
  );
}
