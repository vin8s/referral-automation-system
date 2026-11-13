import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Database drivers run as plain Node modules (PGlite loads WASM files from disk).
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
};

export default nextConfig;
