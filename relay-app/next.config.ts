import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  // Database drivers run as plain Node modules (PGlite loads WASM files from disk).
  serverExternalPackages: ["@electric-sql/pglite", "pg"],

  // `next build` also writes a self-contained server to .next/standalone, which the
  // Dockerfile copies into the production image (AWS ECS Fargate). `npm run dev`
  // and `npm start` are unaffected.
  output: "standalone",

  poweredByHeader: false,

  async headers() {
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "same-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      // Only over HTTPS in production; never pin localhost to HTTPS.
      ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
    ];
    return [
      { source: "/:path*", headers: security },
      // Patient data must never be cached by the browser or the installed app.
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
