// Franklin.bet — results fetcher. Pulls live match status + final scores for the
// World Cup fixtures and writes data/results.json (the file the site reads to show
// FT scores, LIVE badges, ✓/✗ verdicts, and to auto-compute each model's win rate).
//
//   FOOTBALL_DATA_TOKEN=xxxx npm run fetch-results
//
// Default source: football-data.org v4 (free tier, needs a token). The source is
// isolated in fetchSource() — swap it for any provider that can return, per match,
// { home, away, status, homeScore, awayScore }. Matching back to our fixtures is by
// normalized team names, so the provider's naming differences are absorbed here.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

// Provider team name → our fixture name. Extend as needed for your source.
const ALIAS = {
  "Korea Republic": "South Korea", "Iran": "IR Iran", "Türkiye": "Turkey",
  "USA": "United States", "United States of America": "United States",
  "Côte d'Ivoire": "Ivory Coast", "Czech Republic": "Czechia",
  "DR Congo": "DR Congo", "Congo DR": "DR Congo", "Cabo Verde": "Cape Verde",
};
const norm = (s) => (ALIAS[s] || s || "").trim();
// Unordered pair key — the provider may list home/away in either order.
const pairKey = (h, a) => [norm(h), norm(a)].sort().join("|");

// football-data.org v4. Returns [{home, away, status, homeScore, awayScore}].
async function fetchSource() {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) {
    console.error("✗ FOOTBALL_DATA_TOKEN not set. Get a free token at https://www.football-data.org/ ,");
    console.error("  or replace fetchSource() with your own results provider.");
    process.exit(1);
  }
  const comp = process.env.FOOTBALL_DATA_COMP || "WC"; // World Cup competition code
  const res = await fetch(`https://api.football-data.org/v4/competitions/${comp}/matches`, {
    headers: { "X-Auth-Token": token },
  });
  if (!res.ok) throw new Error(`football-data ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const STATUS = { SCHEDULED: "scheduled", TIMED: "scheduled", IN_PLAY: "live", PAUSED: "live", FINISHED: "finished" };
  return (data.matches || []).map((m) => ({
    home: m.homeTeam?.name, away: m.awayTeam?.name,
    status: STATUS[m.status] || "scheduled",
    homeScore: m.score?.fullTime?.home ?? m.score?.regularTime?.home ?? null,
    awayScore: m.score?.fullTime?.away ?? m.score?.regularTime?.away ?? null,
  }));
}

async function main() {
  const events = JSON.parse(read("data/events.json")).filter((e) => e.home && e.away);
  // Index our fixtures by unordered team pair; keep home/away so we can orient
  // the provider's score to our fixture's home/away regardless of its ordering.
  const fixtureByPair = Object.fromEntries(events.map((e) => [pairKey(e.home, e.away), e]));

  const source = await fetchSource();
  // Merge into existing results — never wipe a previously-finished match just
  // because this fetch didn't include it.
  let existing = {};
  try { existing = JSON.parse(read("data/results.json")).byEvent || {}; } catch { /* none yet */ }
  const byEvent = { ...existing };

  let matched = 0, finished = 0;
  for (const m of source) {
    const ev = fixtureByPair[pairKey(m.home, m.away)];
    if (!ev) continue; // not one of our fixtures (or a naming mismatch — extend ALIAS)
    matched++;
    // Orient scores to OUR home/away (provider may have them swapped).
    const sameOrder = norm(m.home) === ev.home;
    const h = sameOrder ? m.homeScore : m.awayScore;
    const a = sameOrder ? m.awayScore : m.homeScore;
    if (m.status === "finished" && h != null && a != null) {
      byEvent[ev.id] = { status: "finished", home: h, away: a };
      finished++;
    } else if (m.status === "live") {
      byEvent[ev.id] = { status: "live", home: h ?? 0, away: a ?? 0 };
    }
    // scheduled matches are left out (the site treats absent as scheduled).
  }

  if (matched === 0) {
    console.error("⚠️ 0 fixtures matched — NOT writing (would wipe results). Check the competition code / extend the ALIAS map.");
    process.exit(1);
  }
  const out = { updatedAt: new Date().toISOString(), source: "football-data.org", byEvent };
  writeFileSync(join(ROOT, "data/results.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(`✓ Wrote data/results.json — matched ${matched}/${events.length} fixtures, ${finished} finished (merged; ${Object.keys(byEvent).length} total).`);
}

main().catch((err) => { console.error(err); process.exit(1); });
