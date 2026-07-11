"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { CURRENT_SEASON_YEAR } from "@/lib/constants";

// Navigation tabs for sub-header
const navTabs = [
  { href: "/", label: "Scores", liveLabel: "Live" },
  { href: "/projections", label: "EV" },
  { href: "/schedule", label: "Schedule" },
  { href: "/rosters", label: "Rosters" },
  { href: "/scoring", label: "Rules" },
];

export function MobileNav() {
  const pathname = usePathname();
  const [hasLiveGames, setHasLiveGames] = useState(false);

  // Check for live games by checking game status
  useEffect(() => {
    async function checkLiveGames() {
      try {
        // Check all playoff weeks in parallel for any live games
        const weeks = [1, 2, 3, 5];
        const responses = await Promise.all(
          weeks.map((week) =>
            fetch(`/api/games?year=${CURRENT_SEASON_YEAR}&week=${week}`)
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null)
          )
        );

        // Check if any game across all weeks is in progress
        const hasLive = responses.some((data) =>
          data?.games?.some((game: { status: { state: string } }) => game.status?.state === "in")
        );
        setHasLiveGames(hasLive);
      } catch {
        // Silently fail - just don't show live indicator
      }
    }

    checkLiveGames();
    // Re-check every 2 minutes
    const interval = setInterval(checkLiveGames, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <nav className="md:hidden overflow-x-auto scrollbar-hide border-b border-[var(--chalk-muted)]/30 bg-[var(--background)]">
      <div className="flex min-w-max px-2">
        {navTabs.map((tab) => {
          const isActive =
            pathname === tab.href || (tab.href !== "/" && pathname.startsWith(tab.href));
          const isScoresTab = tab.href === "/";
          const label = isScoresTab && hasLiveGames ? tab.liveLabel : tab.label;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`relative px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                isActive
                  ? "text-[var(--chalk-pink)]"
                  : "text-[var(--chalk-muted)] active:text-[var(--chalk-white)]"
              }`}
            >
              {isScoresTab && hasLiveGames && (
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              )}
              {label}
              {isActive && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-[var(--chalk-pink)] rounded-full" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// All navigation links for desktop
const allNavLinks = [
  { href: "/", label: "Live" },
  { href: "/projections", label: "Projections" },
  { href: "/schedule", label: "Schedule" },
  { href: "/rosters", label: "Rosters" },
  { href: "/scoring", label: "Scoring" },
  { href: "/admin", label: "Admin" },
];

export function DesktopNav() {
  const pathname = usePathname();

  return (
    <div className="hidden md:flex items-center space-x-1">
      {allNavLinks.map((link) => {
        const isActive =
          pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));

        return (
          <Link
            key={link.href}
            href={link.href}
            className={`px-3 py-2 text-sm font-medium transition-colors chalk-text min-h-[44px] flex items-center ${
              isActive
                ? "text-[var(--chalk-pink)]"
                : "text-[var(--chalk-white)] hover:text-[var(--chalk-pink)]"
            }`}
            style={{ fontFamily: "var(--font-chalk)" }}
          >
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}
