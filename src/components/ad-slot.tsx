"use client";

import { useEffect } from "react";
import Script from "next/script";

// The spec's single tasteful ad slot, free leagues only. Ad network choice is an
// open spec item; this mounts AdSense when configured and disappears otherwise.
const CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
const SLOT = process.env.NEXT_PUBLIC_ADSENSE_SLOT;

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

export function AdSlot() {
  useEffect(() => {
    if (CLIENT && SLOT) {
      try {
        (window.adsbygoogle = window.adsbygoogle ?? []).push({});
      } catch {
        /* blocked or double-push — never break the page over an ad */
      }
    }
  }, []);

  if (!CLIENT || !SLOT) {
    if (process.env.NODE_ENV === "production") return null;
    return (
      <div className="rounded-lg border border-dashed p-4 text-center text-xs text-gray-400">
        Ad slot (set NEXT_PUBLIC_ADSENSE_CLIENT + NEXT_PUBLIC_ADSENSE_SLOT)
      </div>
    );
  }
  return (
    <>
      <Script
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`}
        crossOrigin="anonymous"
        strategy="afterInteractive"
      />
      <ins
        className="adsbygoogle block"
        data-ad-client={CLIENT}
        data-ad-slot={SLOT}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </>
  );
}
