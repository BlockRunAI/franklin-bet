// Franklin.bet — sample-data seeder.
//
// Produces a plausible data/predictions.json for the current events WITHOUT
// calling any model or spending USDC, so the site renders immediately on a fresh
// clone. Picks are derived deterministically from a rough team-strength table —
// clearly marked source:"sample". Replace with real grounded output via
// `npm run generate -- --agent`.
//
//   npm run seed

// Rough, illustrative team strength (0–100). Sample data only — real picks come
// from the grounded agent. Keys match the team names in data/events.json.
const STRENGTH = {
  "Argentina": 93, "France": 92, "Spain": 91, "Brazil": 90, "England": 88,
  "Portugal": 87, "Netherlands": 86, "Germany": 84, "Belgium": 84, "Croatia": 82,
  "Uruguay": 82, "Colombia": 81, "Morocco": 80, "Switzerland": 80, "Japan": 79,
  "Senegal": 78, "Norway": 78, "United States": 78, "Mexico": 77, "Austria": 77,
  "Turkey": 76, "Ecuador": 76, "Algeria": 75, "South Korea": 75, "Ivory Coast": 75,
  "Egypt": 74, "Sweden": 74, "Czechia": 74, "Scotland": 73, "Canada": 73,
  "Ghana": 73, "Australia": 73, "IR Iran": 73, "DR Congo": 72, "Paraguay": 72,
  "Bosnia and Herzegovina": 72, "Tunisia": 71, "South Africa": 70, "Uzbekistan": 70,
  "Qatar": 68, "Saudi Arabia": 68, "Panama": 68, "Iraq": 67, "New Zealand": 66,
  "Jordan": 66, "Cape Verde": 66, "Curaçao": 64, "Haiti": 63,
};

function probs(home, away, allowDraw) {
  const h = STRENGTH[home] ?? 78, a = STRENGTH[away] ?? 78;
  const d = h - a;
  let pH = 1 / (1 + Math.exp(-d / 8));
  let pA = 1 - pH;
  if (!allowDraw) return { home: pH, draw: 0, away: pA };
  const closeness = Math.max(0, 1 - Math.abs(d) / 30);
  const pD = 0.20 + 0.12 * closeness;
  return { home: pH * (1 - pD), draw: pD, away: pA * (1 - pD) };
}

// Largest-remainder allocation of N council seats across outcomes by probability.
function allocate(p, n) {
  const entries = Object.entries(p).filter(([, v]) => v > 0);
  const raw = entries.map(([k, v]) => [k, v * n]);
  const counts = Object.fromEntries(raw.map(([k, v]) => [k, Math.floor(v)]));
  let used = Object.values(counts).reduce((a, b) => a + b, 0);
  const rem = raw.map(([k, v]) => [k, v - Math.floor(v)]).sort((a, b) => b[1] - a[1]);
  for (let i = 0; used < n; i++, used++) counts[rem[i % rem.length][0]]++;
  return counts; // { home: x, draw: y, away: z }
}

function rationale(outcome, ev) {
  if (outcome === "home") return `${ev.home} carry the edge in quality and should control this one.`;
  if (outcome === "away") return `${ev.away} are live here and well capable of springing the upset.`;
  return `Evenly matched on paper — this has the makings of a tight draw.`;
}

// A match: distribute the council across Home/Draw/Away by team strength.
function seedMatch(ev, models) {
  const allowDraw = ev.unit !== "winner" && ev.stage !== "knockout";
  const p = probs(ev.home, ev.away, allowDraw);
  const counts = allocate(p, models.length);
  const pool = [];
  for (const o of ["home", "draw", "away"]) for (let i = 0; i < (counts[o] || 0); i++) pool.push(o);
  const pickLabel = { home: ev.home, away: ev.away, draw: "Draw" };
  return models.map((m, i) => {
    const outcome = pool[i] || "home";
    const base = p[outcome] || 0.4;
    const jitter = (((i * 37) % 7) - 3) / 100;
    return {
      modelId: m.id,
      pick: pickLabel[outcome],
      confidence: Number(Math.max(0.42, Math.min(0.9, 0.45 + base * 0.45 + jitter)).toFixed(2)),
      rationale: rationale(outcome, ev),
    };
  });
}

// A generic market: options[0] is treated as the favourite, the rest spread out.
function seedGeneric(ev, models) {
  const opts = ev.options && ev.options.length ? ev.options : ["Yes", "No"];
  const n = models.length;
  // ~45% of seats to the favourite, remainder round-robin over the others.
  const favSeats = Math.max(1, Math.round(n * 0.45));
  return models.map((m, i) => {
    const pick = i < favSeats ? opts[0] : opts[1 + ((i - favSeats) % Math.max(1, opts.length - 1))];
    const isFav = pick === opts[0];
    const jitter = (((i * 17) % 9) - 4) / 100;
    return {
      modelId: m.id,
      pick,
      confidence: Number(Math.max(0.4, Math.min(0.82, (isFav ? 0.58 : 0.46) + jitter)).toFixed(2)),
      rationale: isFav ? `Current signals point to ${pick}.` : `Backing ${pick} as the live alternative.`,
    };
  });
}

function main() {
  const events = JSON.parse(require_fs("data/events.json"));
  const models = JSON.parse(require_fs("data/models.json"));
  const byEvent = {};

  for (const ev of events) {
    byEvent[ev.id] = ev.home && ev.away ? seedMatch(ev, models) : seedGeneric(ev, models);
  }

  const out = {
    generatedAt: "2026-06-11T00:00:00Z",
    source: "sample",
    engine: "sample",
    note: "Deterministic placeholder data from a rough strength table — NOT real model output. Run `npm run generate -- --agent` for grounded predictions.",
    byEvent,
  };
  writeJSONSync("data/predictions.json", out);
  const total = Object.values(byEvent).reduce((n, v) => n + v.length, 0);
  console.log(`✓ Seeded data/predictions.json — ${events.length} matches, ${total} sample picks.`);
}

// Minimal sync fs helpers (this script is intentionally dependency-free).
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const DATA_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
function require_fs(rel) { return readFileSync(join(DATA_ROOT, rel), "utf8"); }
function writeJSONSync(rel, obj) { writeFileSync(join(DATA_ROOT, rel), JSON.stringify(obj, null, 2) + "\n"); }

main();
