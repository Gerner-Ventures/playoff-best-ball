import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { AppNav } from "@/components/app-nav";
import { AdminPanel } from "@/components/admin-panel";
import { CURRENT_SEASON } from "@/domain/season";
import { stripeModeFromKey } from "@/lib/stripe-mode";

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!isAdmin(user)) notFound();

  // Read per-request, not at module scope: the mode must reflect the running
  // deployment's env, and this page is the only place it's observable.
  const stripeMode = stripeModeFromKey(process.env.STRIPE_SECRET_KEY);

  const [games, playerCount, statCount] = await Promise.all([
    db.nflGame.findMany({ where: { season: CURRENT_SEASON }, orderBy: [{ week: "asc" }, { startsAt: "asc" }] }),
    db.player.count({ where: { season: CURRENT_SEASON } }),
    db.playerStat.count({ where: { season: CURRENT_SEASON } }),
  ]);

  return (
    <>
      <AppNav userName={user!.name} />
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-bold">Platform admin</h1>
        <p className="mt-1 text-sm text-chalk-dim">
          Season {CURRENT_SEASON} · {playerCount} players · {statCount} stat lines
        </p>
        <p className="mt-3 flex items-center gap-2 text-sm text-chalk-dim">
          Stripe
          <span
            className={
              stripeMode === "test"
                ? "chalk-badge"
                : "chalk-badge border-chalk-coral text-chalk-coral"
            }
          >
            {stripeMode.toUpperCase()}
          </span>
          {stripeMode === "live" && "— real cards will be charged"}
          {stripeMode === "off" && "— no key set; upgrade routes answer 501"}
          {stripeMode === "unknown" && "— key does not look like sk_test_ or sk_live_"}
        </p>
        <h2 className="mt-6 font-semibold">Games</h2>
        <ul className="mt-2 text-sm chalk-card">
          {games.map((g) => (
            <li key={g.id} className="flex justify-between border-b p-2 last:border-b-0 border-chalk-line">
              <span>W{g.week}: {g.awayTeam} @ {g.homeTeam}</span>
              <span className="text-chalk-dim">
                {g.state} {g.state !== "SCHEDULED" && `${g.awayScore}–${g.homeScore}`} · upd {g.updatedAt.toISOString().slice(0, 16)}
              </span>
            </li>
          ))}
          {games.length === 0 && <li className="p-3 text-chalk-dim">No games synced yet.</li>}
        </ul>
        <AdminPanel mockMode={process.env.STATS_PROVIDER === "fake"} />
      </main>
    </>
  );
}
