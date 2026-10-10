import type { MetadataRoute } from "next";
import { robotsRules } from "@/lib/indexing";
import { DEMO_MODE_REQUESTED } from "@/lib/demo-mode";

export default function robots(): MetadataRoute.Robots {
  return robotsRules({ VERCEL_ENV: process.env.VERCEL_ENV, demoMode: DEMO_MODE_REQUESTED });
}
