"use client";

import { useState, useSyncExternalStore } from "react";
import { hasPushSubscription, pushSupport, subscribeToPush, unsubscribeFromPush, type PushSupport } from "@/lib/push-client";

interface Props {
  initial: { phone: string | null; smsOptIn: boolean; pushDeviceCount: number };
}

export function NotificationSettingsForm({ initial }: Props) {
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [smsOptIn, setSmsOptIn] = useState(initial.smsOptIn);
  const [pushDevices, setPushDevices] = useState(initial.pushDeviceCount);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/me/notifications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() === "" ? null : phone.trim(), smsOptIn }),
      });
      if (res.ok) {
        const body = await res.json();
        setPhone(body.phone ?? "");
        setSmsOptIn(body.smsOptIn);
        setSaved(true);
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Something went wrong.");
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function enablePush() {
    setBusy(true);
    setError(null);
    try {
      const alreadySubscribed = await hasPushSubscription();
      await subscribeToPush();
      if (!alreadySubscribed) setPushDevices((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't enable push.");
    } finally {
      setBusy(false);
    }
  }

  async function disablePush() {
    setBusy(true);
    setError(null);
    try {
      const hadSubscription = await hasPushSubscription();
      await unsubscribeFromPush();
      if (hadSubscription) setPushDevices((n) => Math.max(0, n - 1));
    } catch {
      setError("Couldn't disable push on this device.");
    } finally {
      setBusy(false);
    }
  }

  const support = useSyncExternalStore<PushSupport | null>(
    () => () => {},
    () => pushSupport(),
    () => null,
  );

  return (
    <form onSubmit={save} className="flex max-w-md flex-col gap-6">
      <section>
        <h2 className="font-semibold">Text messages</h2>
        <label className="mt-2 flex flex-col gap-1">
          <span className="text-sm text-chalk-dim">Phone number (international format)</span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+15555550123"
            className="rounded-lg border px-4 py-3"
          />
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={smsOptIn}
            onChange={(e) => setSmsOptIn(e.target.checked)}
            disabled={phone.trim() === ""}
          />
          Text me when I&apos;m on the clock
        </label>
      </section>

      <section>
        <h2 className="font-semibold">Push notifications</h2>
        <p className="mt-1 text-sm text-chalk-dim">
          {pushDevices > 0
            ? `Enabled on ${pushDevices} device${pushDevices === 1 ? "" : "s"}.`
            : "Get pinged on this device, even when the site is closed."}
        </p>
        {support !== null && (
          support === "supported" ? (
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={enablePush}
                disabled={busy}
                className="disabled:opacity-50 chalk-btn chalk-btn-sm"
              >
                Enable on this device
              </button>
              {pushDevices > 0 && (
                <button
                  type="button"
                  onClick={disablePush}
                  disabled={busy}
                  className="disabled:opacity-50 chalk-btn chalk-btn-sm"
                >
                  Disable on this device
                </button>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-chalk-dim">
              {support === "unsupported"
                ? "This browser doesn't support push notifications. On iPhone, add the app to your Home Screen first."
                : "Push isn't configured on this server yet."}
            </p>
          )
        )}
      </section>

      <button
        type="submit"
        disabled={busy}
        className="disabled:opacity-50 chalk-btn chalk-btn-primary"
      >
        {busy ? "Saving…" : "Save"}
      </button>
      {saved && <p className="text-sm text-chalk-mint">Saved.</p>}
      {error && <p className="text-sm text-chalk-coral">{error}</p>}
    </form>
  );
}
