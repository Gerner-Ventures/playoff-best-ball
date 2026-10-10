import Link from "next/link";
import { formatDraftTime, type InvitePreview } from "@/domain/leagues/invite-preview";
import { TrackInviteView } from "./track-invite-view";

export function PublicInvite({ code, preview }: { code: string; preview: InvitePreview }) {
  const full = preview.entryCount >= preview.maxEntries;
  return (
    <div className="theme-light flex flex-1 items-center justify-center p-4 sm:p-8">
      <TrackInviteView />
      <main className="card w-full max-w-md p-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">You&apos;re invited</p>
        <h1 className="mt-2 text-3xl font-semibold text-balance">{preview.leagueName}</h1>
        <p className="mt-2 text-ink-soft">
          {preview.commissionerFirstName
            ? `${preview.commissionerFirstName} is running this ${preview.season} playoff best ball league.`
            : `A ${preview.season} playoff best ball league.`}
        </p>
        <dl className="mt-6 grid grid-cols-2 gap-3 text-left">
          <div className="rounded-lg bg-brand-tint p-3">
            <dt className="text-sm text-ink-soft">Draft</dt>
            <dd className="font-semibold text-ink">
              {preview.draftScheduledAt ? formatDraftTime(preview.draftScheduledAt) : "Not scheduled yet"}
            </dd>
          </div>
          <div className="rounded-lg bg-brand-tint p-3">
            <dt className="text-sm text-ink-soft">Teams</dt>
            <dd className="font-mono font-semibold text-ink">
              {preview.entryCount} of {preview.maxEntries}
            </dd>
          </div>
        </dl>
        <div className="mt-6">
          {preview.draftStarted ? (
            <p className="text-bad">The draft has already started, so this league is closed to new teams.</p>
          ) : full ? (
            <p className="text-bad">This league is full. The commissioner can upgrade to Premium for more spots.</p>
          ) : (
            <Link href={`/sign-in?callbackURL=/join/${code}`} className="btn btn-primary w-full">
              Sign in to join
            </Link>
          )}
        </div>
        <p className="mt-6 text-sm text-ink-muted">
          New to playoff best ball?{" "}
          <Link href="/how-it-works" className="font-semibold text-brand underline-offset-4 hover:underline">
            How it works
          </Link>
        </p>
      </main>
    </div>
  );
}
