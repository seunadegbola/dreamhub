import type { Metadata, Viewport } from "next";
import { brandFont } from "./fonts";
import "./globals.css";

const description = "Break overwhelming goals into small steps, set deadlines that stick, and focus alongside other people every evening at 6:30.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://joindreamhub.com"),
  title: "DreamHub — get things done, together",
  description,
  openGraph: { title: "DreamHub — get things done, together", description, url: "/", siteName: "DreamHub", locale: "en_GB", type: "website" },
  twitter: { card: "summary_large_image", title: "DreamHub — get things done, together", description },
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
