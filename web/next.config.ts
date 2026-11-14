import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // FRONTEND.md §3: "/" opens the brief. Config-level so no page has to render a redirect.
    return [{ source: "/", destination: "/today", permanent: false }];
  },
  async rewrites() {
    // Local dev only: on Vercel, vercel.json routes /api/py/* to the Python service.
    if (process.env.NODE_ENV !== "development") return [];
    return [{ source: "/api/py/:path*", destination: "http://127.0.0.1:8000/api/py/:path*" }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
