"use client";

import { useState } from "react";

export function InviteLinkButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(`${window.location.origin}/join/${code}`);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard API unavailable (http://, old browser) — show the link so it can be copied manually.
          window.prompt("Copy your invite link:", `${window.location.origin}/join/${code}`);
        }
      }}
      className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
    >
      {copied ? "Copied!" : "Copy invite link"}
    </button>
  );
}
