import type { MetadataRoute } from "next";

/** Lets people add DreamHub to their home screen (needed for reminders on iPhone). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DreamHub",
    short_name: "DreamHub",
    description: "Break goals into small steps, keep deadlines and focus together every evening.",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    background_color: "#f3f6fc",
    theme_color: "#090c9b",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
