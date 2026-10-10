import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Runs the real sync script against stub `doppler` and `vercel` binaries, so the
// Preview guard is exercised without touching either service. The stub doppler
// serves secrets from FAKE_SECRETS; the stub vercel records each `env add` call.
const SCRIPT = path.resolve(__dirname, "../scripts/sync-doppler-to-vercel.sh");

let root: string;
let bin: string;
let work: string;

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), "sync-guard-"));
  bin = path.join(root, "bin");
  work = path.join(root, "work");
  mkdirSync(bin);
  mkdirSync(path.join(work, ".vercel"), { recursive: true });
  writeFileSync(path.join(work, ".vercel/project.json"), '{"projectId":"p","orgId":"o"}');
  writeFileSync(
    path.join(bin, "doppler"),
    `#!/usr/bin/env bash
if [ "$1 $2" = "secrets download" ]; then printf '%s' "$FAKE_SECRETS"; exit 0; fi
if [ "$1 $2" = "secrets get" ]; then
  python3 -c "import json,os,sys; print(json.loads(os.environ['FAKE_SECRETS'])[sys.argv[1]], end='')" "$3"; exit 0
fi
exit 2
`,
  );
  writeFileSync(path.join(bin, "vercel"), `#!/usr/bin/env bash\necho "$*" >> "$VERCEL_CALLS"; cat >/dev/null\n`);
  chmodSync(path.join(bin, "doppler"), 0o755);
  chmodSync(path.join(bin, "vercel"), 0o755);
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

function sync(target: string, secrets: Record<string, string>) {
  const calls = path.join(root, `calls-${Math.random().toString(36).slice(2)}`);
  writeFileSync(calls, "");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    FAKE_SECRETS: JSON.stringify(secrets),
    VERCEL_CALLS: calls,
  };
  delete env.VERCEL_TOKEN;
  delete env.VERCEL_ORG_ID;
  delete env.VERCEL_PROJECT_ID;
  const result = spawnSync("bash", [SCRIPT, target], { cwd: work, env, encoding: "utf8" });
  const written = readFileSync(calls, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split(" ")[2]);
  return { status: result.status, output: result.stdout + result.stderr, written };
}

const SAFE_STG = {
  BETTER_AUTH_SECRET: "x",
  RESEND_API_KEY: "re_x",
  STRIPE_SECRET_KEY: "sk_test_x",
  STRIPE_PUBLISH_KEY: "pk_test_x",
  DOPPLER_CONFIG: "stg",
};

describe("sync-doppler-to-vercel.sh", () => {
  it("syncs a clean stg config to preview, skipping Doppler's own variables", () => {
    const { status, written } = sync("preview", SAFE_STG);
    expect(status).toBe(0);
    expect(written.sort()).toEqual(
      ["BETTER_AUTH_SECRET", "RESEND_API_KEY", "STRIPE_PUBLISH_KEY", "STRIPE_SECRET_KEY"].sort(),
    );
  });

  it.each([
    ["INNGEST_SIGNING_KEY", "signkey-prod-x"],
    ["INNGEST_EVENT_KEY", "x"],
    ["DATABASE_URL", "postgres://x"],
    ["DATABASE_URL_UNPOOLED", "postgres://x"],
    ["POSTGRES_URL", "postgres://x"],
    ["PGPASSWORD", "x"],
    ["NEON_PROJECT_ID", "x"],
  ])("refuses to send %s to preview, and writes nothing", (key, value) => {
    const { status, output, written } = sync("preview", { ...SAFE_STG, [key]: value });
    expect(status).toBe(1);
    expect(output).toContain(`${key} must not be set for Preview`);
    expect(written).toEqual([]);
  });

  it.each([
    ["STRIPE_SECRET_KEY", "sk_live_x"],
    ["STRIPE_PUBLISH_KEY", "pk_live_x"],
    ["STRIPE_RESTRICTED_KEY", "rk_live_x"],
  ])("refuses a live-mode %s on preview", (key, value) => {
    const { status, output, written } = sync("preview", { ...SAFE_STG, [key]: value });
    expect(status).toBe(1);
    expect(output).toContain(`${key} is a live-mode Stripe key`);
    expect(written).toEqual([]);
  });

  it("leaves production syncs alone, still skipping the parked *_LIVE keys", () => {
    const { status, written } = sync("production", {
      INNGEST_SIGNING_KEY: "signkey-prod-x",
      DATABASE_URL: "postgres://x",
      STRIPE_SECRET_KEY_LIVE: "sk_live_x",
    });
    expect(status).toBe(0);
    expect(written.sort()).toEqual(["DATABASE_URL", "INNGEST_SIGNING_KEY"]);
  });

  it("refuses to sync an empty config", () => {
    const { status, output, written } = sync("preview", { DOPPLER_CONFIG: "stg" });
    expect(status).toBe(1);
    expect(output).toContain("refusing to sync an empty set");
    expect(written).toEqual([]);
  });
});
