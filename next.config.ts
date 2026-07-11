import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin root so Turbopack doesn't infer a workspace root from parent lockfiles (e.g. when running in a nested worktree).
    root: __dirname,
  },
};

export default nextConfig;
