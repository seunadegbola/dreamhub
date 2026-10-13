"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase/client";
import { Button, Panel } from "./ui";

type Notice = { id: string; message: string };

/** A warning from the DreamHub team, shown until the member acknowledges it. */
export function MemberNotices() {
  const live = useStore((s) => s.mode === "live");
  const userId = useStore((s) => s.userId);
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    if (!live || !userId) return;
    supabase()
      .from("member_notices")
      .select("id, message")
      .eq("kind", "warning")
      .is("seen_at", null)
      .order("created_at")
      .then(({ data }) => setNotices((data as Notice[]) ?? []));
  }, [live, userId]);

  const n = notices[0];
  if (!n) return null;
  return (
    <Panel tone="save" className="mb-6 p-5" role="alert">
      <p className="font-bold">A message from the DreamHub team</p>
      <p className="mt-2 whitespace-pre-wrap">{n.message}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          onClick={async () => {
            await supabase().from("member_notices").update({ seen_at: new Date().toISOString() }).eq("id", n.id);
            setNotices((all) => all.slice(1));
          }}
        >
          I understand
        </Button>
        <a href="/guidelines" target="_blank" className="text-sm font-semibold underline underline-offset-4">
          Read the community guidelines
        </a>
      </div>
    </Panel>
  );
}
