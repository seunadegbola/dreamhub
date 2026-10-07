/**
 * Brand font.
 *
 * The brand guide specifies Wotfard. Until the font files are added, Outfit (a similar
 * geometric sans, OFL licence) stands in, served locally from src/app/fonts/.
 *
 * To switch to Wotfard:
 *   1. Put the files in src/app/fonts/ (e.g. wotfard-regular.woff2 …)
 *   2. Replace the `src` below with the commented list.
 * Every component reads the font through the --font-brand CSS variable, so nothing else changes.
 */
import localFont from "next/font/local";

export const brandFont = localFont({
  variable: "--font-brand",
  display: "swap",
  src: [{ path: "./fonts/outfit-variable.woff2", weight: "100 900", style: "normal" }],
  // src: [
  //   { path: "./fonts/wotfard-thin.woff2", weight: "100" },
  //   { path: "./fonts/wotfard-extralight.woff2", weight: "200" },
  //   { path: "./fonts/wotfard-light.woff2", weight: "300" },
  //   { path: "./fonts/wotfard-regular.woff2", weight: "400" },
  //   { path: "./fonts/wotfard-medium.woff2", weight: "500" },
  //   { path: "./fonts/wotfard-semibold.woff2", weight: "600" },
  //   { path: "./fonts/wotfard-bold.woff2", weight: "700" },
  // ],
});
