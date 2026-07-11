import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { AppNav } from "@/components/app-nav";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const memberships = await db.membership.findMany({
    where: { userId: user.id },
    include: { league: true, entries: { take: 1, orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <AppNav userName={user.name} />
      <main className="mx-auto max-w-2xl p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">My leagues</h1>
          <Link
            href="/leagues/new"
            className="rounded-lg bg-green-700 px-4 py-2 font-semibold text-white"
          >
            Create league
          </Link>
        </div>
        {memberships.length === 0 ? (
          <p className="text-gray-600">
            No leagues yet. Create one, or ask your commissioner for an invite link.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {memberships.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/leagues/${m.leagueId}`}
                  className="flex items-center justify-between rounded-lg border p-4 hover:bg-gray-50"
                >
                  <div>
                    <div className="font-semibold">{m.league.name}</div>
                    <div className="text-sm text-gray-500">
                      {m.entries[0]?.name ?? "No team"}
                      {m.role === "COMMISSIONER" && " · Commissioner"}
                    </div>
                  </div>
                  <span className="text-sm text-gray-400">{m.league.season} season</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
