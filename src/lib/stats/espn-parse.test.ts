import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseScoreboard, parseGameStats, parseRoster } from "./espn-parse";

const fixture = (name: string) =>
  JSON.parse(readFileSync(path.join(__dirname, "../../../tests/fixtures", name), "utf8"));

describe("parseScoreboard", () => {
  it("maps events to ProviderGames with our week number and a valid state", () => {
    const games = parseScoreboard(fixture("espn-scoreboard.json"), 1);
    expect(games.length).toBeGreaterThan(0);
    for (const g of games) {
      expect(g.week).toBe(1);
      expect(g.eventId).toBeTruthy();
      expect(["SCHEDULED", "IN_PROGRESS", "FINAL"]).toContain(g.state);
      expect(g.homeTeam).not.toBe(g.awayTeam);
      expect(g.startsAt.getTime()).toBeGreaterThan(0);
    }
  });

  // Concrete values — 2025 season Wild Card round (dates=2025 fixture).
  // BUF at JAX, event 401772977, FINAL: home JAX 24, away BUF 27.
  it("maps the BUF-JAX wild card game with correct teams, scores, and FINAL state", () => {
    const games = parseScoreboard(fixture("espn-scoreboard.json"), 1);
    const g = games.find((g) => g.eventId === "401772977");
    expect(g).toBeDefined();
    expect(g!.homeTeam).toBe("JAX");
    expect(g!.awayTeam).toBe("BUF");
    expect(g!.homeScore).toBe(24);
    expect(g!.awayScore).toBe(27);
    expect(g!.state).toBe("FINAL");
  });
});

describe("parseGameStats", () => {
  const lines = parseGameStats(fixture("espn-summary.json"));

  it("produces stat lines for skill players with sane values", () => {
    expect(lines.length).toBeGreaterThan(10);
    const qb = lines.find((l) => l.stats.passYards > 100);
    expect(qb).toBeDefined();
    expect(qb!.externalId).toBeTruthy();
  });

  it("produces exactly two DST lines with pointsAllowed set", () => {
    const dsts = lines.filter((l) => l.stats.pointsAllowed !== null);
    expect(dsts).toHaveLength(2);
    for (const dst of dsts) expect(dst.position).toBe("DST");
  });

  it("kicker FG distances land in fgMade/fgMissed arrays", () => {
    const kickers = lines.filter((l) => l.stats.fgMade.length + l.stats.fgMissed.length > 0);
    for (const k of kickers) {
      for (const d of [...k.stats.fgMade, ...k.stats.fgMissed]) {
        expect(d).toBeGreaterThan(9);
        expect(d).toBeLessThan(80);
      }
    }
  });

  it("every line round-trips the StatLine schema", () => {
    for (const l of lines) {
      expect(() => JSON.parse(JSON.stringify(l.stats))).not.toThrow();
    }
  });

  // ---- Concrete values from the BUF-JAX fixture (event 401772977) ----

  it("Josh Allen (BUF) has 273 pass yards, 1 TD, 0 INT", () => {
    const allen = lines.find((l) => l.externalId === "3918298");
    expect(allen).toBeDefined();
    expect(allen!.name).toBe("Josh Allen");
    expect(allen!.stats.passYards).toBe(273);
    expect(allen!.stats.passTd).toBe(1);
    expect(allen!.stats.passInt).toBe(0);
  });

  it("Trevor Lawrence (JAX) has 207 pass yards, 3 TD, 2 INT", () => {
    const tl = lines.find((l) => l.externalId === "4360310");
    expect(tl).toBeDefined();
    expect(tl!.stats.passYards).toBe(207);
    expect(tl!.stats.passTd).toBe(3);
    expect(tl!.stats.passInt).toBe(2);
  });

  it("Matt Prater made 50 & 47 yd FGs; Cam Little made 43, missed 54", () => {
    const prater = lines.find((l) => l.name === "Matt Prater");
    expect(prater).toBeDefined();
    expect([...prater!.stats.fgMade].sort((a, b) => a - b)).toEqual([47, 50]);
    expect(prater!.stats.fgMissed).toEqual([]);

    const little = lines.find((l) => l.name === "Cam Little");
    expect(little).toBeDefined();
    expect(little!.stats.fgMade).toEqual([43]);
    expect(little!.stats.fgMissed).toEqual([54]);
  });

  it("DST points allowed = opposing team's final score; BUF D made 2 INTs", () => {
    const buf = lines.find((l) => l.externalId === "dst-BUF");
    const jax = lines.find((l) => l.externalId === "dst-JAX");
    expect(buf).toBeDefined();
    expect(jax).toBeDefined();
    // BUF allowed JAX's 24; JAX allowed BUF's 27.
    expect(buf!.stats.pointsAllowed).toBe(24);
    expect(jax!.stats.pointsAllowed).toBe(27);
    // Buffalo's defense intercepted Trevor Lawrence twice.
    expect(buf!.stats.defInterceptions).toBe(2);
    expect(jax!.stats.defInterceptions).toBe(0);
  });
});

describe("parseRoster", () => {
  const players = parseRoster(fixture("espn-roster.json"), "KC");

  it("includes skill positions, skips non-fantasy positions, appends DST", () => {
    expect(players.length).toBeGreaterThan(5);
    const positions = new Set(players.map((p) => p.position));
    for (const pos of positions) expect(["QB", "RB", "WR", "TE", "K", "DST"]).toContain(pos);
    const dst = players.find((p) => p.position === "DST");
    expect(dst).toBeDefined();
    expect(dst!.externalId).toBe("dst-KC");
  });

  it("maps the place kicker (PK) to K and keeps Patrick Mahomes as QB", () => {
    const k = players.find((p) => p.position === "K");
    expect(k).toBeDefined();
    expect(k!.name).toBe("Harrison Butker");
    const mahomes = players.find((p) => p.name === "Patrick Mahomes");
    expect(mahomes).toBeDefined();
    expect(mahomes!.position).toBe("QB");
    expect(mahomes!.nflTeam).toBe("KC");
  });
});
