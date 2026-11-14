import type { MetadataRoute } from "next";

// Installable from the browser menu (FRONTEND.md §13). No install prompt and no service worker
// in this prototype.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FINN",
    short_name: "FINN",
    description: "What changed in your portfolio, whether it breaks your thesis, and who you know who can explain it.",
    start_url: "/today",
    display: "standalone",
    background_color: "#fafaf7",
    theme_color: "#fafaf7",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
