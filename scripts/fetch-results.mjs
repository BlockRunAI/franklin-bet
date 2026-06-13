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

// Provider team name → our fixture name, for word-level differences the
// accent/punctuation-insensitive key below can't absorb on its own.
const ALIAS = {
  "Korea Republic": "South Korea", "Iran": "IR Iran", "Türkiye": "Turkey",
  "USA": "United States", "United States of America": "United States",
  "Côte d'Ivoire": "Ivory Coast", "Czech Republic": "Czechia",
  "Bosnia-Herzegovina": "Bosnia and Herzegovina",
  "Congo DR": "DR Congo", "Cabo Verde": "Cape Verde",
};
const alias = (s) => (ALIAS[(s || "").trim()] || s || "").trim();
// Matching key: alias, then NFD-decompose and keep only [a-z0-9] — which also
// drops the combining accent marks, so "Curaçao"/"Curacao" collapse to one key.
const key = (s) => alias(s).normalize("NFD").toLowerCase().replace(/[^a-z0-9]/g, "");
// Unordered pair key — the provider may list home/away in either order.
const pairKey = (h, a) => [key(h), key(a)].sort().join("|");

// TheSportsDB (free, keyless). Returns [{home, away, status, homeScore, awayScore}].
// World Cup = league 4429. Override via env if needed.
async function fetchSource() {
  const apiKey = process.env.SPORTSDB_KEY || "3";       // free public test key
  const league = process.env.SPORTSDB_LEAGUE || "4429"; // FIFA World Cup
  const season = process.env.SPORTSDB_SEASON || "2026";
  const res = await fetch(`https://www.thesportsdb.com/api/v1/json/${apiKey}/eventsseason.php?id=${league}&s=${season}`);
  if (!res.ok) throw new Error(`thesportsdb ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const DONE = /^(FT|AET|PEN|AP|Match Finished|Finished)$/i;
  const LIVE = /^(1H|2H|HT|ET|BT|P|LIVE|Live|In Play|Playing)$/i;
  const num = (v) => (v == null || v === "" ? null : Number(v));
  return (data.events || []).map((m) => {
    const st = (m.strStatus || "").trim();
    return {
      home: m.strHomeTeam, away: m.strAwayTeam,
      status: DONE.test(st) ? "finished" : LIVE.test(st) ? "live" : "scheduled",
      homeScore: num(m.intHomeScore), awayScore: num(m.intAwayScore),
    };
  });
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
    const sameOrder = key(m.home) === key(ev.home);
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
  // Only rewrite when the actual scores/statuses changed — otherwise the
  // timestamp alone would churn a commit every run (the 30-min cron).
  if (JSON.stringify(existing) === JSON.stringify(byEvent)) {
    console.log(`No change — ${matched}/${events.length} matched, ${finished} finished. results.json left as-is.`);
    return;
  }
  const out = { updatedAt: new Date().toISOString(), source: "thesportsdb", byEvent };
  writeFileSync(join(ROOT, "data/results.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(`✓ Wrote data/results.json — matched ${matched}/${events.length} fixtures, ${finished} finished (merged; ${Object.keys(byEvent).length} total).`);
}

main().catch((err) => { console.error(err); process.exit(1); });
