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

// ESPN public scoreboard (free, keyless, complete + live). The board is per-day,
// so we sweep a small window of recent UTC dates each run — enough to catch
// just-finished and in-play matches; older results are already merged.
// Returns [{home, away, status, homeScore, awayScore}].
async function fetchSource() {
  const base = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
  const days = Number(process.env.ESPN_DAYS || 4);
  const now = Date.now();
  const dates = Array.from({ length: days }, (_, i) => {
    const d = new Date(now - i * 86400000);
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  });
  const FIN = /FULL_TIME|FINAL|\bFT\b/i, LIVE = /FIRST_HALF|SECOND_HALF|HALFTIME|IN_PROGRESS|\bLIVE\b|EXTRA|PENALT/i;
  const num = (v) => (v == null || v === "" ? null : Number(v));
  const out = [];
  for (const date of dates) {
    let data;
    try { const r = await fetch(`${base}?dates=${date}`); if (!r.ok) continue; data = await r.json(); } catch { continue; }
    for (const e of (data.events || [])) {
      const c = (e.competitions || [])[0]; if (!c) continue;
      const h = (c.competitors || []).find((x) => x.homeAway === "home");
      const a = (c.competitors || []).find((x) => x.homeAway === "away");
      if (!h || !a) continue;
      const st = e.status?.type?.name || "";
      out.push({
        home: h.team?.displayName || h.team?.name, away: a.team?.displayName || a.team?.name,
        status: FIN.test(st) ? "finished" : LIVE.test(st) ? "live" : "scheduled",
        homeScore: num(h.score), awayScore: num(a.score),
      });
    }
  }
  return out;
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
    // Between tournaments (or after the final has been recorded) ESPN's
    // rolling scoreboard has no fixture from our small lookback window. That
    // is normal once every tracked match has a final result; do not turn the
    // 30-minute cron into a permanent failure. While any match is still
    // unresolved, however, zero matches is still a useful provider/mapping
    // alarm and must fail safely rather than silently doing nothing.
    const unresolved = events.filter((ev) => existing[ev.id]?.status !== "finished");
    if (unresolved.length === 0) {
      console.log(`No source fixtures matched; all ${events.length} tracked fixtures are already finished. results.json left as-is.`);
      return;
    }
    console.error("⚠️ 0 fixtures matched — NOT writing (would wipe results). Check the competition code / extend the ALIAS map.");
    process.exit(1);
  }
  // Only rewrite when the actual scores/statuses changed — otherwise the
  // timestamp alone would churn a commit every run (the 30-min cron).
  if (JSON.stringify(existing) === JSON.stringify(byEvent)) {
    console.log(`No change — ${matched}/${events.length} matched, ${finished} finished. results.json left as-is.`);
    return;
  }
  const out = { updatedAt: new Date().toISOString(), source: "espn", byEvent };
  writeFileSync(join(ROOT, "data/results.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(`✓ Wrote data/results.json — matched ${matched}/${events.length} fixtures, ${finished} finished (merged; ${Object.keys(byEvent).length} total).`);
}

main().catch((err) => { console.error(err); process.exit(1); });
