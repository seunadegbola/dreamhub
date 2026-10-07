"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";

export function Toast() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div role="status" aria-live="polite" className="fixed inset-x-0 bottom-24 md:bottom-8 z-50 flex justify-center px-4 pointer-events-none">
      <div key={toast.id} className="rise pointer-events-auto rounded-[10px] border-2 border-ink bg-ink px-4 py-3 text-[15px] font-medium text-white shadow-brut">
        {toast.text}
      </div>
    </div>
  );
}

const COLORS = ["#090C9B", "#3066BE", "#B4C5E4", "#1AB7FC", "#F2B33D", "#FFFFFF"];

/** One-shot confetti burst. Respects reduced motion and the celebrations setting. */
export function Confetti({ pieces = 70 }: { pieces?: number }) {
  const enabled = useStore((s) => s.profile.celebrations);
  const [reduced, setReduced] = useState(false);
  useEffect(() => setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  const bits = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        dur: 1.8 + Math.random() * 1.4,
        dx: `${(Math.random() - 0.5) * 30}vw`,
        rot: `${(Math.random() - 0.5) * 1080}deg`,
        color: COLORS[i % COLORS.length],
        w: 7 + Math.random() * 7,
        h: 10 + Math.random() * 10,
        round: Math.random() > 0.7,
      })),
    [pieces],
  );
  if (!enabled || reduced) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {bits.map((b, i) => (
        <span
          key={i}
          className="absolute top-0 block border-[1.5px] border-ink"
          style={{
            left: `${b.left}%`,
            width: b.w,
            height: b.round ? b.w : b.h,
            borderRadius: b.round ? 999 : 2,
            background: b.color,
            animation: `dh-confetti ${b.dur}s cubic-bezier(.2,.6,.4,1) ${b.delay}s both`,
            ["--dx" as string]: b.dx,
            ["--rot" as string]: b.rot,
          }}
        />
      ))}
    </div>
  );
}
