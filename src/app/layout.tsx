import type { Metadata, Viewport } from "next";
import { brandFont } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "DreamHub — get things done, together",
  description:
    "Break overwhelming goals into small steps, set deadlines that stick, and focus alongside other people every evening.",
};

export const viewport: Viewport = {
  themeColor: "#090c9b",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" className={brandFont.variable}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
