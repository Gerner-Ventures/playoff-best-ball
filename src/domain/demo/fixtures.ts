// The cast and the leagues of the demo world. Pinned so every seed produces the
// same world, and so a link can be written down in a runbook.

/**
 * Password for every seeded account. Not a secret: the whole point is that it can
 * be handed to someone alongside a URL. It only works where demo mode is fully
 * enabled — see src/lib/demo-mode.ts.
 */
export const DEMO_PASSWORD = "demo-password-123";

/**
 * All demo addresses are @demo.example.com. `example.com` is reserved by RFC 2606
 * and can never receive mail, so even a demo deployment that was accidentally
 * given a working Resend key cannot reach a real person.
 */
const DOMAIN = "demo.example.com";

/** The account a visitor signs in as. Commissioner of both leagues. */
export const DEMO_PERSONA = {
  name: "Nick G.",
  email: `you@${DOMAIN}`,
  teamName: "Gerner's Heroes",
} as const;

/** Leaguemates. Real-ish names so the leaderboard doesn't read as a test fixture. */
export const DEMO_BOTS = [
  { name: "Marcus Webb", teamName: "Third and Long" },
  { name: "Priya Raman", teamName: "Chalk Talk" },
  { name: "Dave Okafor", teamName: "The Chain Gang" },
  { name: "Sam Ellison", teamName: "Pylon Pushers" },
  { name: "Tara Lindqvist", teamName: "Cover Two" },
  { name: "Ben Castillo", teamName: "Hail Mary Inc." },
  { name: "Jo Nakamura", teamName: "Play Action" },
  { name: "Riley Stroud", teamName: "Fourth Down Club" },
  { name: "Alex Mbeki", teamName: "Red Zone Rebels" },
  { name: "Casey Doyle", teamName: "Two Minute Drill" },
  { name: "Noor Haddad", teamName: "Gridiron Ghosts" },
].map((b) => ({
  ...b,
  email: `${b.name.split(" ")[0].toLowerCase()}@${DOMAIN}`,
}));

export const DEMO_EMAIL_DOMAIN = DOMAIN;

/**
 * The two leagues. Invite codes are pinned rather than league ids, because
 * League.id is a cuid the domain layer generates — the code is the unique,
 * human-typeable, actually shareable handle (`/join/DEMO2026`).
 *
 * The premium league is 12 teams; FREE_TIER_MAX_ENTRIES is 10, so a 12-team
 * league has to be premium. Having both tiers means the dashboard shows more than
 * one row and the projections paywall is visible side by side with the feature.
 */
export const DEMO_LEAGUES = {
  premium: {
    key: "premium",
    name: "The Gerner Invitational",
    inviteCode: "DEMO2026",
    entryCount: 12,
  },
  free: {
    key: "free",
    name: "Sunday Scaries",
    inviteCode: "DEMOFREE",
    entryCount: 8,
  },
} as const;

/** Every account the seeder creates, persona first. */
export function demoAccounts() {
  return [DEMO_PERSONA, ...DEMO_BOTS];
}
