import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Worktree is nested inside a monorepo-like parent; pin root explicitly.
    root: __dirname,
  },
};

export default nextConfig;
