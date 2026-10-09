"use client";

import Link from "next/link";
import { captureClientEvent } from "@/lib/analytics-client";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import type { LaunchPhase } from "@/lib/launch";

export function CtaLink({
  href,
  cta,
  page,
  phase,
  className = "btn btn-primary",
  children,
}: {
  href: string;
  cta: string;
  page: string;
  phase: LaunchPhase;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={className} onClick={() => captureClientEvent(ANALYTICS_EVENTS.MARKETING_CTA_CLICKED, { cta, page, phase })}>
      {children}
    </Link>
  );
}
