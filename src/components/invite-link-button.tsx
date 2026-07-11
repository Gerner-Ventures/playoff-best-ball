"use client";

import { useState } from "react";

export function InviteLinkButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(`${window.location.origin}/join/${code}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
    >
      {copied ? "Copied!" : "Copy invite link"}
    </button>
  );
}
