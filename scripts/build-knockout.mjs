// Franklin.bet — knockout fixture builder.
//
// Pulls the real World Cup knockout bracket from ESPN (the same source as
// fetch-results) and appends the matches whose teams are already DECIDED into
// data/events.json, as stage:"knockout" / unit:"winner" events (no Draw option).
//
// Rounds whose teams are still TBD (placeholders like "Round of 32 1 Winner")
// are skipped — we only add a fixture once both real teams are known.
//
//   node scripts/build-knockout.mjs            # add any newly-decided KO matches
//   node scripts/build-knockout.mjs --round round-of-32
//
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const p = (f) => join(ROOT, f);

const ALIAS = {
  "Korea Republic": "South Korea", "Iran": "IR Iran", "Türkiye": "Turkey",
  "USA": "United States", "United States of America": "United States",
  "Côte d'Ivoire": "Ivory Coast", "Czech Republic": "Czechia",
  "Bosnia-Herzegovina": "Bosnia and Herzegovina",
  "Congo DR": "DR Congo", "Cabo Verde": "Cape Verde",
};
const alias = (s) => (ALIAS[(s || "").trim()] || s || "").trim();

const ROUND_META = {
  "round-of-32": { category: "Round of 32", next: "Round of 16", emoji: "⚔️" },
  "round-of-16": { category: "Round of 16", next: "Quarter-finals", emoji: "⚔️" },
  "quarterfinals": { category: "Quarter-finals", next: "Semi-finals", emoji: "🔥" },
  "semifinals": { category: "Semi-finals", next: "Final", emoji: "🏆" },
  "3rd-place": { category: "Third place", next: null, emoji: "🥉" },
  "final": { category: "Final", next: null, emoji: "🏆" },
};

// TBD placeholder names ESPN uses before a round's teams are decided.
const isTBD = (n) => !n || /Winner|Loser|TBD|Round of|Group [A-L]|place$/i.test(n);

// LA-local calendar date for a UTC ISO kickoff (PDT = UTC-7 in June/July).
const laDate = (iso) => new Date(new Date(iso).getTime() - 7 * 3600000).toISOString().slice(0, 10);

async function fetchKnockout() {
  const base = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
  const start = new Date("2026-06-28T00:00:00Z");
  const out = [];
  for (let i = 0; i < 24; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const date = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
    let data;
    try { const r = await fetch(`${base}?dates=${date}`); if (!r.ok) continue; data = await r.json(); } catch { continue; }
    for (const e of (data.events || [])) {
      const c = (e.competitions || [])[0]; if (!c) continue;
      const slug = e.season?.slug || c.notes?.[0]?.headline || "";
      const round = Object.keys(ROUND_META).find((k) => slug.includes(k));
      if (!round) continue;
      const h = (c.competitors || []).find((x) => x.homeAway === "home");
      const a = (c.competitors || []).find((x) => x.homeAway === "away");
      out.push({
        round,
        home: h?.team?.displayName || h?.team?.name,
        away: a?.team?.displayName || a?.team?.name,
        kickoff: e.date,
        venue: c.venue?.fullName || "",
      });
    }
  }
  return out;
}

function main(argv) {
  const onlyRound = argv.includes("--round") ? argv[argv.indexOf("--round") + 1] : null;
  const events = JSON.parse(readFileSync(p("data/events.json"), "utf8"));
  // team -> {flag, abbr} from the group fixtures
  const info = {};
  for (const e of events) {
    const m = e.id.match(/^wc26-[a-l]-([a-z0-9]+)-([a-z0-9]+)$/);
    if (m) { info[e.home] = { flag: e.homeFlag, abbr: m[1] }; info[e.away] = { flag: e.awayFlag, abbr: m[2] }; }
  }
  const have = new Set(events.map((e) => e.id));
  return fetchKnockout().then((fixtures) => {
    const added = [];
    for (const f of fixtures) {
      if (onlyRound && f.round !== onlyRound) continue;
      const meta = ROUND_META[f.round]; if (!meta) continue;
      const home = alias(f.home), away = alias(f.away);
      if (isTBD(home) || isTBD(away)) continue;          // teams not decided yet
      const hi = info[home], ai = info[away];
      if (!hi || !ai) { console.warn(`! no flag/abbr for ${home} or ${away} — skipped`); continue; }
      const roundTag = f.round.replace(/[^a-z0-9]/g, "");
      const id = `wc26-${roundTag}-${hi.abbr}-${ai.abbr}`;
      if (have.has(id)) continue;
      const resolves = laDate(f.kickoff);
      const adv = meta.next ? `advances to the ${meta.next}` : (meta.category === "Final" ? "wins the World Cup" : "finishes third");
      const ev = {
        id, category: meta.category, stage: "knockout",
        home, homeFlag: hi.flag, away, awayFlag: ai.flag,
        kickoff: f.kickoff, venue: f.venue, emoji: meta.emoji,
        title: `${home} vs ${away}`, resolves,
        question: `In the 2026 FIFA World Cup ${meta.category} match ${home} vs ${away} (${f.venue}, ${resolves}), which team ${adv}? After extra time and penalties if needed, pick exactly one: ${home} or ${away}.`,
        unit: "winner",
      };
      events.push(ev); have.add(id); added.push(ev);
    }
    // Keep group events first, then knockout, then the non-WC showcase events.
    writeFileSync(p("data/events.json"), JSON.stringify(events, null, 2) + "\n");
    console.log(`Added ${added.length} knockout fixture(s):`);
    for (const e of added) console.log(`  ${e.resolves}  ${e.id.padEnd(20)} ${e.title}  @ ${e.venue}`);
    if (!added.length) console.log("  (none — all decided fixtures already present, or teams still TBD)");
  });
}

main(process.argv.slice(2));
