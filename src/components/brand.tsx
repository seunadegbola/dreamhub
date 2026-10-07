import clsx from "clsx";

/* ---------------- Logo ---------------- */

/**
 * Official DreamHub logo, extracted as vector from the brand guide (public/brand/*.svg).
 * Never stretch, recolour or move the logomark (brand guide, Dos & Don'ts).
 *  - "default": on white / light blue backgrounds
 *  - "on-blue": on the primary blue
 *  - "white":   on dark or photographic backgrounds
 */
export function Logo({ variant = "default", height = 28, className }: { variant?: "default" | "on-blue" | "white"; height?: number; className?: string }) {
  const src = variant === "default" ? "/brand/logo.svg" : variant === "on-blue" ? "/brand/logo-on-blue.svg" : "/brand/logo-white.svg";
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="DreamHub" height={height} style={{ height, width: (height * 339.31) / 97.16 }} className={clsx("block", className)} />;
}

/** The logomark on its own (used in the swirl pattern, favicon and small spaces). */
export function Mark({ size = 32, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/mark.svg" alt="" aria-hidden width={size} height={size} className={className} style={style} />;
}

/**
 * Brand pattern (brand guide §07): oversized, rotated logomark swirls.
 * Decorative only; sits behind content in blue or light-blue blocks.
 */
export function Swirls({ className, tone = "light" }: { className?: string; tone?: "light" | "dark" }) {
  const items = [
    { x: "-6%", y: "-18%", s: 260, r: -18, o: 0.9 },
    { x: "70%", y: "38%", s: 320, r: 24, o: 0.75 },
    { x: "38%", y: "-30%", s: 180, r: 160, o: 0.55 },
  ];
  return (
    <div aria-hidden className={clsx("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {items.map((it, i) => (
        <span
          key={i}
          className="absolute block"
          style={{
            left: it.x,
            top: it.y,
            width: it.s,
            height: it.s,
            transform: `rotate(${it.r}deg)`,
            opacity: tone === "light" ? it.o * 0.22 : it.o * 0.5,
            filter: tone === "light" ? "brightness(0) invert(1)" : undefined,
            backgroundImage: "url(/brand/mark.svg)",
            backgroundSize: "contain",
            backgroundRepeat: "no-repeat",
          }}
        />
      ))}
    </div>
  );
}

/* ---------------- Mascot ---------------- */

export type Mood = "happy" | "looking" | "celebrating" | "sleepy" | "waving" | "stretching" | "determined";

const BODY = "#1AB7FC";
const LINE = "#0B1E5B";
const SPOT = "#1F6FD0";
const IRIS = "#2B3F7E";

const ARM = {
  l1: "M40 78 C 22 88, 10 98, 14 112 C 17 120, 28 118, 26 110",
  l2: "M48 82 C 40 98, 36 112, 44 120 C 50 124, 55 117, 49 114",
  l3: "M56 84 C 56 100, 53 113, 59 122",
  r3: "M64 84 C 68 100, 72 112, 66 120 C 62 124, 57 118, 62 115",
  r2: "M72 82 C 82 96, 90 108, 84 118 C 80 122, 75 116, 80 113",
  r1: "M80 78 C 98 86, 110 96, 106 110 C 104 118, 94 118, 96 110",
  l1up: "M36 70 C 20 64, 10 50, 15 37 C 18 29, 28 31, 26 39",
  r1up: "M84 70 C 100 64, 110 50, 105 37 C 102 29, 92 31, 94 39",
};

function Arm({ d }: { d: string }) {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} stroke={LINE} strokeWidth="13" />
      <path d={d} stroke={BODY} strokeWidth="8" />
      <path d={d} stroke="#fff" strokeWidth="2.6" strokeDasharray="0.1 5.2" />
    </g>
  );
}

/**
 * DreamHub's octopus, redrawn as SVG from the supplied mascot art so it can change
 * expression (PRD §17). Replace with the illustrator's final poses when available.
 */
export function Mascot({ mood = "happy", size = 96, className, title }: { mood?: Mood; size?: number; className?: string; title?: string }) {
  const armsUp = mood === "celebrating" || mood === "stretching";
  const leftOuter = armsUp ? ARM.l1up : ARM.l1;
  const rightOuter = armsUp || mood === "waving" ? ARM.r1up : ARM.r1;
  const look = mood === "looking" ? { dx: -3, dy: -1 } : mood === "determined" ? { dx: 0, dy: 1 } : { dx: 0, dy: 2 };
  const openEyes = mood === "happy" || mood === "looking" || mood === "waving" || mood === "determined";

  return (
    <svg
      viewBox="0 0 120 130"
      width={size}
      height={(size * 130) / 120}
      className={clsx("overflow-visible", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      <Arm d={leftOuter} />
      <Arm d={ARM.l2} />
      <Arm d={ARM.l3} />
      <Arm d={ARM.r3} />
      <Arm d={ARM.r2} />
      <Arm d={rightOuter} />

      {/* head */}
      <path
        d="M26 62 C 22 28, 40 10, 60 10 C 80 10, 98 28, 94 62 C 92 78, 80 87, 60 87 C 40 87, 28 78, 26 62 Z"
        fill={BODY}
        stroke={LINE}
        strokeWidth="3"
      />
      <circle cx="80" cy="25" r="6" fill={SPOT} />
      <circle cx="89" cy="36" r="4" fill={SPOT} />
      <circle cx="78" cy="38" r="2.6" fill={SPOT} />

      {/* eyes */}
      {openEyes ? (
        <g>
          <ellipse cx="47" cy="53" rx="9.5" ry="11" fill="#fff" stroke={LINE} strokeWidth="2.6" />
          <ellipse cx="73" cy="53" rx="9.5" ry="11" fill="#fff" stroke={LINE} strokeWidth="2.6" />
          <circle cx={47 + look.dx} cy={54 + look.dy} r="6" fill={IRIS} />
          <circle cx={73 + look.dx} cy={54 + look.dy} r="6" fill={IRIS} />
          <circle cx={45 + look.dx} cy={51.5 + look.dy} r="2" fill="#fff" />
          <circle cx={71 + look.dx} cy={51.5 + look.dy} r="2" fill="#fff" />
          {mood === "determined" && (
            <g stroke={LINE} strokeWidth="3" strokeLinecap="round">
              <path d="M39 40 Q 46 37 53 40" />
              <path d="M81 40 Q 74 37 67 40" />
            </g>
          )}
        </g>
      ) : (
        <g fill="none" stroke={LINE} strokeWidth="3" strokeLinecap="round">
          {mood === "sleepy" ? (
            <>
              <path d="M39 55 Q 47 59 55 55" />
              <path d="M65 55 Q 73 59 81 55" />
            </>
          ) : (
            <>
              <path d="M40 56 Q 47 46 54 56" />
              <path d="M66 56 Q 73 46 80 56" />
            </>
          )}
        </g>
      )}

      {/* mouth */}
      {mood === "celebrating" ? (
        <path d="M52 69 Q 60 80 68 69 Z" fill={LINE} stroke={LINE} strokeWidth="2" strokeLinejoin="round" />
      ) : mood === "looking" || mood === "stretching" ? (
        <ellipse cx="60" cy="72" rx="3" ry="3.4" fill={LINE} />
      ) : mood === "determined" ? (
        <path d="M55 72 H 65" stroke={LINE} strokeWidth="2.6" strokeLinecap="round" />
      ) : (
        <path d="M54 70 Q 60 75 66 70" fill="none" stroke={LINE} strokeWidth="2.6" strokeLinecap="round" />
      )}

      {mood === "sleepy" && (
        <text x="96" y="16" fontSize="14" fontWeight="700" fill={LINE}>
          z
        </text>
      )}
    </svg>
  );
}
