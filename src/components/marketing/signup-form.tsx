"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { captureClientEvent } from "@/lib/analytics-client";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import type { SubscribeSource } from "@/domain/subscribers/sources";

export function SignupForm({
  source,
  cta = "Get the weekly digest",
  compact = false,
}: {
  source: SubscribeSource;
  cta?: string;
  compact?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const successRef = useRef<HTMLParagraphElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  // True only once hydrated, so the submit button stays disabled for a pre-hydration
  // native form submit — one that `onSubmit` never gets a chance to intercept and that
  // would otherwise navigate the page away and lose the typed email.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // The success message mounts already filled in, so a screen reader announcing
  // the live region alone is unreliable; moving focus to it is what makes the
  // confirmation dependable, and it also carries the footer form's focus down to
  // where the message is rather than leaving it at <body>.
  useEffect(() => {
    if (state === "sent") successRef.current?.focus();
  }, [state]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    setError(null);
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, source, website: honeypot }),
      });
      if (res.ok) {
        setState("sent");
        captureClientEvent(ANALYTICS_EVENTS.SUBSCRIBE_SUBMITTED, { source });
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong. Try again.");
      emailRef.current?.focus();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      emailRef.current?.focus();
    }
    setState("idle");
  }

  if (state === "sent") {
    return (
      <p ref={successRef} role="status" tabIndex={-1} className="rounded-lg bg-brand-tint p-4 text-ink">
        Check your inbox to confirm. The link works for 7 days.
      </p>
    );
  }

  const id = `signup-${source}`;
  const errorId = `${id}-error`;
  return (
    <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
      <div className={compact ? "flex flex-col gap-2 sm:flex-row" : "flex flex-col gap-3 sm:flex-row"}>
        <label htmlFor={id} className="sr-only">
          Email address
        </label>
        <input
          ref={emailRef}
          id={id}
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="input sm:max-w-sm"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        {/* Honeypot: off-screen and out of the tab order; people never see it. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label>
            Leave this empty
            <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} name="website" />
          </label>
        </div>
        {/* Disabled until hydrated: a pre-hydration native submit can't be intercepted by
            onSubmit, and would navigate the page away, losing the typed email. */}
        <button type="submit" className="btn btn-primary shrink-0" disabled={state === "busy" || !mounted}>
          {state === "busy" ? "Sending…" : cta}
        </button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
    </form>
  );
}
