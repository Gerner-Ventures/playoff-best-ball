import type { Metadata } from "next";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { tryParseLeagueSettings } from "@/domain/league-settings";
import { draftTimeLabel, getInvitePreview, formatDraftTime } from "@/domain/leagues/invite-preview";
import { JoinLeagueForm } from "@/components/join-league-form";
import { PublicInvite } from "@/components/invite/public-invite";

// generateMetadata and the page component both need the preview for the same
// request; cache() shares the one query between them instead of running it twice.
const cachedInvitePreview = cache((code: string) => getInvitePreview(db, code));

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const preview = await cachedInvitePreview(code);
  // noindex everywhere: crawlable for link previews, never in search (plan: spec clarification 2).
  if (!preview) return { title: "Invite not found", robots: { index: false } };
  const who = preview.commissionerFirstName ? `${preview.commissionerFirstName}'s` : "A";
  const label = draftTimeLabel(preview, new Date());
  const when =
    label.kind === "upcoming"
      ? `Draft ${formatDraftTime(label.at)}.`
      : label.kind === "not_started"
        ? "Draft not started yet."
        : "Draft time to be set.";
  return {
    title: { absolute: `You're invited to ${preview.leagueName}` },
    description: `${who} ${preview.season} playoff best ball league on Playoff Best Ball. ${when}`,
    robots: { index: false },
    twitter: { card: "summary_large_image" },
  };
}

function InviteNotFound() {
  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-xl font-bold">Invite not found</h1>
      <p className="mt-2 text-chalk-dim">Double-check the link with your commissioner.</p>
    </main>
  );
}

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const user = await getSessionUser();
  // Signed out: a public invite page instead of a bare redirect, so the link a
  // commissioner pastes into the group chat previews as the league (spec §7).
  if (!user) {
    const preview = await cachedInvitePreview(code);
    if (!preview) return <InviteNotFound />;
    return <PublicInvite code={code.toUpperCase()} preview={preview} />;
  }

  const league = await db.league.findUnique({
    where: { inviteCode: code.toUpperCase() },
    include: {
      _count: { select: { entries: true } },
      draft: { select: { id: true } },
      memberships: { where: { userId: user.id }, include: { entries: { orderBy: { createdAt: "asc" } } } },
    },
  });

  if (!league) return <InviteNotFound />;

  // Only redirect if the member already has an entry; a membership without an entry falls through
  // to the join form so joinLeague can self-heal the orphaned membership.
  if ((league.memberships[0]?.entries.length ?? 0) > 0) redirect(`/leagues/${league.id}`);

  const settings = tryParseLeagueSettings(league.settings);
  if (!settings) {
    return (
      <main className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-xl font-bold">Something&apos;s wrong with this league</h1>
        <p className="mt-2 text-chalk-dim">Ask your commissioner to contact support.</p>
      </main>
    );
  }

  const isFull = league._count.entries >= settings.maxEntries;
  const isUserMember = (league.memberships[0]?.entries.length ?? 0) > 0;
  const draftStarted = league.draft !== null;

  return (
    <main className="mx-auto flex max-w-md flex-col items-center gap-6 p-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold">{league.name}</h1>
        <p className="mt-1 text-chalk-dim">
          {league.season} playoffs · {league._count.entries}/{settings.maxEntries} teams
        </p>
      </div>
      {draftStarted && !isUserMember ? (
        <p className="text-center text-chalk-coral">
          The draft has already started — this league is closed to new teams.
        </p>
      ) : isFull ? (
        <p className="text-center text-chalk-coral">
          This league is full. The commissioner can upgrade to Premium for more spots.
        </p>
      ) : (
        <JoinLeagueForm code={code} />
      )}
    </main>
  );
}
