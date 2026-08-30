// Demo mode: the flag that lets a PUBLIC deployment accept email+password sign-ins,
// so a visitor can be handed a link and a password instead of an inbox.
//
// Why this needs more than one env var: `NODE_ENV` is "production" on every Vercel
// deploy, and `VERCEL_ENV` is "production" on the demo project too (its production
// branch is `main`), so neither distinguishes the demo from the real thing. The
// separation is environmental, and an environment is one settings misclick — or one
// wholesale env copy — away from being wrong.
//
// So the gate is layered, and this file holds only the layers that can be decided
// from the environment synchronously:
//
//   1. DEMO_MODE === "1"           explicit opt-in; absent means off, full stop
//   2. host allowlist              compiled in below, so adding a host is a reviewed
//                                  code change rather than an env edit
//   3. no live Stripe key          catches "prod env copied into the demo project",
//                                  which every host check would miss if the URL came too
//
// The fourth layer — a `DemoEnvironment` sentinel row that exists only in the demo
// database — is a DB read and lives in `isPasswordAuthAllowed`. It is the only factor
// that does not live in the env store, which is precisely why it is worth having.
//
// Discipline borrowed from the rest of this codebase: never fall through to a mode we
// cannot prove. An unrecognized host with DEMO_MODE=1 is FATAL, not a silent "off" —
// a silent off is indistinguishable from a gate that has quietly stopped working.

/**
 * Hosts (including port) permitted to run demo mode. Exact matches only.
 *
 * Deliberately NOT paired with a production deny-list: the real product domain is
 * still an open item (the beta runs on a placeholder *.vercel.app), so a hard-coded
 * deny-list would be a guess that reads as authoritative. The positive allowlist
 * excludes production by construction instead.
 */
export const DEMO_HOSTNAMES = [
  "demo.playoffbestball.com",
  "localhost:3000", // local dev
  "localhost:3100", // playwright webServer
] as const;

export interface DemoModeEnv {
  DEMO_MODE?: string;
  BETTER_AUTH_URL?: string;
  STRIPE_SECRET_KEY?: string;
}

export type DemoModeResolution =
  | { enabled: false; reason: "not-requested" }
  | { enabled: true; reason: "demo-host" }
  | { enabled: false; reason: "fatal"; message: string };

const NOT_REQUESTED = { enabled: false, reason: "not-requested" } as const;

function fatal(message: string): DemoModeResolution {
  return { enabled: false, reason: "fatal", message };
}

/** Host, including port — `new URL().host`, not `.hostname`. Null when unparseable. */
function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/**
 * Resolves demo mode from the environment. Pure — the caller supplies the env, so the
 * whole truth table is testable without touching `process.env`.
 *
 * `fatal` means the deployment is misconfigured in a way that could expose password
 * auth: the caller is expected to throw, not to degrade.
 */
export function resolveDemoMode(env: DemoModeEnv): DemoModeResolution {
  // Exact "1" only. "true"/"yes"/" 1" are typos, and a typo must not enable this.
  if (env.DEMO_MODE !== "1") return NOT_REQUESTED;

  // A live Stripe key is the sharpest evidence that production credentials are in
  // scope here, regardless of what the URL claims. Checked before the host so the
  // error names the real problem.
  if (env.STRIPE_SECRET_KEY?.startsWith("sk_live")) {
    return fatal(
      "DEMO_MODE=1 with a live Stripe secret key. Demo mode opens password sign-in; " +
        "it must never run against live billing credentials. Refusing to boot.",
    );
  }

  const host = hostOf(env.BETTER_AUTH_URL);
  if (host === null) {
    return fatal(
      `DEMO_MODE=1 but BETTER_AUTH_URL is missing or unparseable (${JSON.stringify(env.BETTER_AUTH_URL)}). ` +
        "Demo mode is gated on the deployment's own host and cannot be verified. Refusing to boot.",
    );
  }
  if (!(DEMO_HOSTNAMES as readonly string[]).includes(host)) {
    return fatal(
      `DEMO_MODE=1 on unrecognized host "${host}". Demo mode opens password sign-in and is ` +
        `limited to ${DEMO_HOSTNAMES.join(", ")}. Add the host to DEMO_HOSTNAMES in a reviewed ` +
        "change if this is intentional. Refusing to boot.",
    );
  }

  return { enabled: true, reason: "demo-host" };
}

// `ProcessEnv` declares no properties, so it shares none with DemoModeEnv by
// structural typing. The cast is the read; the fields are all optional strings.
const resolution = resolveDemoMode(process.env as DemoModeEnv);
if (resolution.reason === "fatal") {
  // Module scope on purpose: `src/lib/auth.ts` imports this, and every route imports
  // auth transitively, so a misconfigured deploy fails at build/boot instead of
  // quietly serving password sign-in. The loud failure is the feature.
  throw new Error(resolution.message);
}

/**
 * Demo mode as far as the environment can attest. NOT sufficient to allow password
 * auth on its own — see `isPasswordAuthAllowed`, which adds the database sentinel.
 */
export const DEMO_MODE_REQUESTED = resolution.enabled;

// ---------------------------------------------------------------------------
// The database sentinel — the factor that does not live in the env store.
// ---------------------------------------------------------------------------

/** Single-row table; the id is fixed so marking twice is an upsert, not a duplicate. */
const SENTINEL_ID = "singleton";

/** Minimal shape needed here, so callers can pass the app client or the test client. */
type SentinelDb = {
  demoEnvironment: {
    findUnique(args: { where: { id: string } }): Promise<{ id: string } | null>;
    upsert(args: {
      where: { id: string };
      create: { id: string; label: string };
      update: { label: string };
    }): Promise<unknown>;
  };
};

let sentinelPresent = false; // memoized only once TRUE — see below

/**
 * Whether this database has been deliberately marked as a demo database.
 *
 * Memoizes only the `true` result: a false is worth re-checking (the operator may
 * not have marked it yet), while a true cannot become false without someone
 * deleting the row, and caching it keeps the auth path off the database on every
 * password request.
 */
export async function isDemoEnvironment(db: SentinelDb): Promise<boolean> {
  if (sentinelPresent) return true;
  const row = await db.demoEnvironment.findUnique({ where: { id: SENTINEL_ID } });
  sentinelPresent = row !== null;
  return sentinelPresent;
}

/**
 * Marks this database as a demo database. Called only by the demo seeder, which an
 * operator runs deliberately against a specific database — never from the request
 * path, so no deploy and no env change can create this row.
 */
export async function markDemoEnvironment(db: SentinelDb, label: string): Promise<void> {
  await db.demoEnvironment.upsert({
    where: { id: SENTINEL_ID },
    create: { id: SENTINEL_ID, label },
    update: { label },
  });
  sentinelPresent = true;
}

/**
 * The whole gate in one pure function, so the truth table is testable.
 *
 * E2E is deliberately independent of the sentinel: its database is disposable and
 * recreated per run, and requiring a sentinel there would add setup friction for no
 * safety — `E2E_TEST_MODE` is already confined to `NODE_ENV !== "production"`.
 *
 * Demo mode requires BOTH halves. Either alone is a misconfiguration: env without
 * the sentinel means the env was pointed at the wrong database; the sentinel without
 * the env means a demo database was restored somewhere it shouldn't be.
 */
export function passwordAuthDecision(input: {
  e2eEnabled: boolean;
  demoRequested: boolean;
  sentinelPresent: boolean;
}): boolean {
  if (input.e2eEnabled) return true;
  return input.demoRequested && input.sentinelPresent;
}

/** True when this deployment may accept email+password sign-in. */
export async function isPasswordAuthAllowed(db: SentinelDb): Promise<boolean> {
  const e2eEnabled =
    process.env.E2E_TEST_MODE === "1" && process.env.NODE_ENV !== "production";
  // Short-circuit before touching the database on the common (production) path.
  if (!e2eEnabled && !DEMO_MODE_REQUESTED) return false;
  return passwordAuthDecision({
    e2eEnabled,
    demoRequested: DEMO_MODE_REQUESTED,
    sentinelPresent: e2eEnabled ? false : await isDemoEnvironment(db),
  });
}
