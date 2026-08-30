#!/usr/bin/env node
/**
 * WCAG contrast gate for the cobalt design tokens.
 *
 * Parses the real token blocks out of src/app/globals.css rather than holding a
 * copy, so it cannot drift from what ships — a hardcoded copy of the palette
 * silently passed a stale value once already.
 *
 * Run: node scripts/check-contrast.mjs      (exit 1 on any failure)
 */
import { readFileSync } from "node:fs";

const CSS = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

// --- colour maths ---------------------------------------------------------
const hex = (h) => {
  const s = h.replace("#", "");
  const full = s.length === 3 ? [...s].map((c) => c + c).join("") : s;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
};
const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const lum = (h) => {
  const [r, g, b] = hex(h).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// --- token extraction -----------------------------------------------------
/** Body of the first `selector { ... }` block whose contents match `must`. */
function block(selector, must) {
  const re = new RegExp(`${selector.replace(".", "\\.")}\\s*\\{`, "g");
  let m;
  while ((m = re.exec(CSS))) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < CSS.length && depth > 0) {
      if (CSS[i] === "{") depth++;
      else if (CSS[i] === "}") depth--;
      i++;
    }
    const body = CSS.slice(start, i - 1);
    if (body.includes(must)) return body;
  }
  throw new Error(`could not find ${selector} block containing ${must}`);
}

function tokens(body) {
  const out = {};
  for (const [, k, v] of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) out[k] = v;
  return out;
}

const LIGHT = tokens(block(":root", "--surface"));
const DARK = { ...LIGHT, ...tokens(block(".theme-dark", "--surface")) };

const POSITIONS = ["qb", "rb", "wr", "te", "k", "dst"];

// --- checks ---------------------------------------------------------------
const rows = [];
function check(theme, label, fg, bg, floor) {
  if (!fg || !bg) {
    rows.push({ theme, label, r: NaN, floor, pass: false, note: "missing token" });
    return;
  }
  const r = ratio(fg, bg);
  rows.push({ theme, label, r, floor, pass: r >= floor });
}

for (const [theme, T] of [["light", LIGHT], ["dark", DARK]]) {
  // Text must be readable on both the page ground and a card surface.
  for (const name of ["ink", "ink-soft", "ink-muted", "out"]) {
    check(theme, `${name} on ground`, T[name], T.ground, 4.5);
    check(theme, `${name} on surface`, T[name], T.surface, 4.5);
  }
  check(theme, "brand as text on surface", T.brand, T.surface, 4.5);
  check(theme, "brand as text on ground", T.brand, T.ground, 4.5);
  check(theme, "brand-hover as text on surface", T["brand-hover"], T.surface, 4.5);
  check(theme, "brand-on over brand fill", T["brand-on"], T.brand, 4.5);
  check(theme, "good on surface", T.good, T.surface, 4.5);
  check(theme, "warn on surface", T.warn, T.surface, 4.5);

  // 1.4.11: a control's own boundary must clear 3:1. --rule is a divider and is
  // deliberately exempt — it is never the only thing identifying a control.
  check(theme, "border-control on surface", T["border-control"], T.surface, 3);
  check(theme, "border-control on ground", T["border-control"], T.ground, 3);

  // Chip label against its own tint.
  for (const p of POSITIONS) {
    check(theme, `chip ${p.toUpperCase()} on its tint`, T[`pos-${p}`], T[`pos-${p}-tint`], 4.5);
  }
}

// --- report ---------------------------------------------------------------
const pad = Math.max(...rows.map((r) => r.label.length));
let failures = 0;
for (const r of rows) {
  if (!r.pass) failures++;
  const val = Number.isNaN(r.r) ? r.note : `${r.r.toFixed(2)}:1`;
  console.log(
    `${r.pass ? "PASS" : "FAIL"}  ${r.theme.padEnd(5)}  ${r.label.padEnd(pad)}  ${val.padStart(8)}  (floor ${r.floor})`,
  );
}
console.log(`\n${rows.length} pairs checked, ${failures} failing`);
if (failures) process.exit(1);
