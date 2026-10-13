"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo, Mascot } from "@/components/brand";
import { Button } from "@/components/ui";
import { useStore } from "@/lib/store";
import { supabase, supabaseConfigured } from "@/lib/supabase/client";
import { LEGAL } from "@/lib/legal";

/** Where a suspended member lands instead of the app. */
export default function SuspendedPage() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) return void router.replace("/");
    (async () => {
      const { data } = await supabase().auth.getUser();
      if (!data.user) return router.replace("/login");
      const { data: p } = await supabase().from("profiles").select("status").eq("id", data.user.id).single();
      if (p?.status !== "suspended") return router.replace("/home");
      const { data: n } = await supabase().from("member_notices").select("message").eq("kind", "suspension").order("created_at", { ascending: false }).limit(1);
      setMessage(n?.[0]?.message ?? null);
    })();
  }, [router]);

  const signOut = async () => {
    await useStore.getState().signOut();
    router.replace("/");
  };

  return (
    <div className="min-h-dvh bg-paper">
      <header className="mx-auto flex h-16 max-w-xl items-center px-4">
        <Logo height={24} />
      </header>
      <main className="mx-auto max-w-xl px-4 pb-16 pt-8">
        <Mascot mood="looking" size={96} />
        <h1 className="mt-4 text-3xl font-bold tracking-tight">Your account is suspended</h1>
        {message && <p className="mt-3 whitespace-pre-wrap rounded-[10px] border-2 border-ink bg-surface p-4">{message}</p>}
        <p className="mt-4 text-muted">
          While your account is suspended you can’t join or host sessions, or contact other members. If you think this is a mistake, email{" "}
          <a className="font-semibold text-ink underline underline-offset-4" href={`mailto:${LEGAL.contactEmail}`}>
            {LEGAL.contactEmail}
          </a>
          .
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={signOut}>
            Sign out
          </Button>
          {!confirming ? (
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              Delete my account
            </Button>
          ) : (
            <Button
              className="bg-missed"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const { error } = await supabase().rpc("delete_my_account");
                if (error) {
                  setBusy(false);
                  return;
                }
                await useStore.getState().signOut().catch(() => {});
                router.replace("/");
              }}
            >
              Yes, delete everything
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
