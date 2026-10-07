"use client";

import Link from "next/link";
import clsx from "clsx";
import type { ComponentProps, ReactNode } from "react";
import type { DeadlineState } from "@/lib/domain/cascade";
import { DEADLINE_LABEL } from "@/lib/domain/cascade";

/* ---------------- Buttons ---------------- */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "xl";

const base =
  "inline-flex items-center justify-center gap-2 font-semibold rounded-[10px] border-2 border-ink select-none disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";
const variants: Record<Variant, string> = {
  primary: "bg-blue text-white shadow-brut press",
  secondary: "bg-surface text-ink shadow-brut press",
  ghost: "border-transparent bg-transparent text-ink hover:bg-haze/40",
  danger: "bg-surface text-missed border-missed hover:bg-missed-tint",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-[15px]",
  lg: "h-14 px-6 text-lg",
  xl: "h-[72px] px-8 text-xl md:text-2xl tracking-tight",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={clsx(base, variants[variant], sizes[size], className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={clsx(base, variants[variant], sizes[size], className)} {...props} />;
}

/* ---------------- Surfaces ---------------- */

/** Primary container: thick border, offset shadow. Use for things you act on. */
export function Panel({ className, children, tone = "plain", ...rest }: ComponentProps<"section"> & { tone?: "plain" | "blue" | "haze" | "save" }) {
  return (
    <section
      className={clsx(
        "rounded-[var(--dh-radius)] border-2 border-ink shadow-brut",
        tone === "plain" && "bg-surface",
        tone === "blue" && "bg-blue text-white",
        tone === "haze" && "bg-haze",
        tone === "save" && "bg-save-tint",
        className,
      )}
      {...rest}
    >
      {children}
    </section>
  );
}

/** Secondary container: hairline border, no shadow. Use for reference content. */
export function Box({ className, children, ...rest }: ComponentProps<"div">) {
  return (
    <div className={clsx("rounded-[var(--dh-radius)] border-[1.5px] border-hairline bg-surface", className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex items-baseline justify-between gap-4 mb-3", className)}>
      <h2 className="text-lg font-semibold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}

/* ---------------- Bits ---------------- */

export function Progress({ value, className, tone = "blue" }: { value: number; className?: string; tone?: "blue" | "white" }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className={clsx("h-3 w-full rounded-full border-2 overflow-hidden", tone === "blue" ? "border-ink bg-surface" : "border-white/80 bg-white/10", className)}
    >
      <div className={clsx("h-full transition-[width] duration-500 ease-out", tone === "blue" ? "bg-sky" : "bg-white")} style={{ width: `${pct}%` }} />
    </div>
  );
}

const STATE_STYLE: Record<DeadlineState, string> = {
  on_track: "bg-good-tint text-good",
  at_risk: "bg-save-tint text-[#8a5a00]",
  due_today: "bg-blue text-white",
  missed: "bg-missed-tint text-missed",
  done: "bg-good-tint text-good",
};

export function DeadlineBadge({ state }: { state: DeadlineState }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", STATE_STYLE[state])}>
      {state === "done" ? "✓ " : ""}
      {DEADLINE_LABEL[state]}
    </span>
  );
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx("inline-flex items-center gap-1 rounded-full border-[1.5px] border-ink/20 px-2.5 py-0.5 text-xs font-medium", className)}>{children}</span>;
}

export function Avatar({ name, hue = 230, size = 36, className }: { name: string; hue?: number; size?: number; className?: string }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      aria-hidden
      className={clsx("inline-flex shrink-0 items-center justify-center rounded-full border-2 border-ink font-bold", className)}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${hue} 70% 82%)`, color: "var(--dh-ink)" }}
    >
      {initials || "?"}
    </span>
  );
}

export function Checkbox({ checked, onChange, label, className }: { checked: boolean; onChange: () => void; label: string; className?: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={clsx(
        "grid size-6 shrink-0 place-items-center rounded-[6px] border-2 border-ink transition-colors",
        checked ? "bg-blue text-white" : "bg-surface hover:bg-haze/50",
        className,
      )}
    >
      {checked && (
        <svg viewBox="0 0 16 16" className="size-4 pop" aria-hidden>
          <path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-sm text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full h-12 rounded-[10px] border-2 border-ink bg-surface px-4 text-base placeholder:text-muted/60 focus:outline-none focus:ring-4 focus:ring-haze";

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
}) {
  return (
    <div role="radiogroup" className={clsx("inline-flex flex-wrap gap-2", className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "h-10 rounded-[10px] border-2 border-ink px-3.5 text-sm font-semibold transition-colors",
            value === o.value ? "bg-ink text-white" : "bg-surface hover:bg-haze/50",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
