// Franklin.bet — build data/events.json from the 2026 World Cup group-stage
// schedule. Re-runnable: edit FIXTURES (or the OTHER_MARKETS list) and re-run.
//
//   npm run build-fixtures
//
// Source: the real 2026 FIFA World Cup draw + group-stage schedule
// (Wikipedia "2026 FIFA World Cup draw" / per-group articles, cross-checked
// against Yahoo Sports' daily schedule). Kickoff times are approximate — the
// published schedule gives dates authoritatively but times only in US ET; we
// stamp a placeholder local-evening time so the countdown has something to tick
// to. Dates and matchups are the verified, authoritative part.

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// name → ISO 3166-1 alpha-2 (for computing flag emoji + short ids)
const ISO2 = {
  "Mexico": "MX", "South Africa": "ZA", "South Korea": "KR", "Czechia": "CZ",
  "Canada": "CA", "Bosnia and Herzegovina": "BA", "Qatar": "QA", "Switzerland": "CH",
  "Brazil": "BR", "Morocco": "MA", "Haiti": "HT", "Scotland": "GB-SCT",
  "United States": "US", "Paraguay": "PY", "Australia": "AU", "Turkey": "TR",
  "Germany": "DE", "Curaçao": "CW", "Ivory Coast": "CI", "Ecuador": "EC",
  "Netherlands": "NL", "Japan": "JP", "Sweden": "SE", "Tunisia": "TN",
  "Belgium": "BE", "Egypt": "EG", "IR Iran": "IR", "New Zealand": "NZ",
  "Spain": "ES", "Cape Verde": "CV", "Saudi Arabia": "SA", "Uruguay": "UY",
  "France": "FR", "Senegal": "SN", "Iraq": "IQ", "Norway": "NO",
  "Argentina": "AR", "Algeria": "DZ", "Austria": "AT", "Jordan": "JO",
  "Portugal": "PT", "DR Congo": "CD", "Uzbekistan": "UZ", "Colombia": "CO",
  "England": "GB-ENG", "Croatia": "HR", "Ghana": "GH", "Panama": "PA",
};
const FLAG_OVERRIDE = { "England": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "Scotland": "🏴󠁧󠁢󠁳󠁣󠁴󠁿" };
function flag(name) {
  if (FLAG_OVERRIDE[name]) return FLAG_OVERRIDE[name];
  const cc = ISO2[name];
  if (!cc || cc.length !== 2) return "🏳️";
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
function idCode(name) {
  return (ISO2[name] || name).replace(/[^A-Za-z]/g, "").toLowerCase().slice(0, 3);
}

// All 72 group-stage matches (verified). Times omitted in source → placeholder.
const FIXTURES = [
  ["A","Mexico","South Africa","2026-06-11","Estadio Azteca","Mexico City"],
  ["A","South Korea","Czechia","2026-06-11","Estadio Akron","Guadalajara"],
  ["B","Canada","Bosnia and Herzegovina","2026-06-12","BMO Field","Toronto"],
  ["D","United States","Paraguay","2026-06-12","SoFi Stadium","Inglewood"],
  ["B","Qatar","Switzerland","2026-06-13","Levi's Stadium","Santa Clara"],
  ["C","Brazil","Morocco","2026-06-13","MetLife Stadium","East Rutherford"],
  ["C","Haiti","Scotland","2026-06-13","Gillette Stadium","Foxborough"],
  ["D","Australia","Turkey","2026-06-13","BC Place","Vancouver"],
  ["E","Germany","Curaçao","2026-06-14","NRG Stadium","Houston"],
  ["F","Netherlands","Japan","2026-06-14","AT&T Stadium","Arlington"],
  ["E","Ivory Coast","Ecuador","2026-06-14","Lincoln Financial Field","Philadelphia"],
  ["F","Sweden","Tunisia","2026-06-14","Estadio BBVA","Monterrey"],
  ["H","Spain","Cape Verde","2026-06-15","Mercedes-Benz Stadium","Atlanta"],
  ["G","Belgium","Egypt","2026-06-15","Lumen Field","Seattle"],
  ["H","Saudi Arabia","Uruguay","2026-06-15","Hard Rock Stadium","Miami Gardens"],
  ["G","IR Iran","New Zealand","2026-06-15","SoFi Stadium","Inglewood"],
  ["I","France","Senegal","2026-06-16","MetLife Stadium","East Rutherford"],
  ["I","Iraq","Norway","2026-06-16","Gillette Stadium","Foxborough"],
  ["J","Argentina","Algeria","2026-06-16","Arrowhead Stadium","Kansas City"],
  ["J","Austria","Jordan","2026-06-16","Levi's Stadium","Santa Clara"],
  ["K","Portugal","DR Congo","2026-06-17","NRG Stadium","Houston"],
  ["L","England","Croatia","2026-06-17","AT&T Stadium","Arlington"],
  ["L","Ghana","Panama","2026-06-17","BMO Field","Toronto"],
  ["K","Uzbekistan","Colombia","2026-06-17","Estadio Azteca","Mexico City"],
  ["A","Czechia","South Africa","2026-06-18","Mercedes-Benz Stadium","Atlanta"],
  ["B","Switzerland","Bosnia and Herzegovina","2026-06-18","SoFi Stadium","Inglewood"],
  ["B","Canada","Qatar","2026-06-18","BC Place","Vancouver"],
  ["A","Mexico","South Korea","2026-06-18","Estadio Akron","Guadalajara"],
  ["D","United States","Australia","2026-06-19","Lumen Field","Seattle"],
  ["C","Scotland","Morocco","2026-06-19","Gillette Stadium","Foxborough"],
  ["C","Brazil","Haiti","2026-06-19","Lincoln Financial Field","Philadelphia"],
  ["D","Turkey","Paraguay","2026-06-19","Levi's Stadium","Santa Clara"],
  ["F","Netherlands","Sweden","2026-06-20","NRG Stadium","Houston"],
  ["E","Germany","Ivory Coast","2026-06-20","BMO Field","Toronto"],
  ["E","Ecuador","Curaçao","2026-06-20","Arrowhead Stadium","Kansas City"],
  ["F","Tunisia","Japan","2026-06-20","Estadio BBVA","Monterrey"],
  ["H","Spain","Saudi Arabia","2026-06-21","Mercedes-Benz Stadium","Atlanta"],
  ["G","Belgium","IR Iran","2026-06-21","SoFi Stadium","Inglewood"],
  ["H","Uruguay","Cape Verde","2026-06-21","Hard Rock Stadium","Miami Gardens"],
  ["G","New Zealand","Egypt","2026-06-21","BC Place","Vancouver"],
  ["J","Argentina","Austria","2026-06-22","AT&T Stadium","Arlington"],
  ["I","France","Iraq","2026-06-22","Lincoln Financial Field","Philadelphia"],
  ["I","Norway","Senegal","2026-06-22","MetLife Stadium","East Rutherford"],
  ["J","Jordan","Algeria","2026-06-22","Levi's Stadium","Santa Clara"],
  ["K","Portugal","Uzbekistan","2026-06-23","NRG Stadium","Houston"],
  ["L","England","Ghana","2026-06-23","Gillette Stadium","Foxborough"],
  ["L","Panama","Croatia","2026-06-23","BMO Field","Toronto"],
  ["K","Colombia","DR Congo","2026-06-23","Estadio Akron","Guadalajara"],
  ["B","Switzerland","Canada","2026-06-24","BC Place","Vancouver"],
  ["B","Bosnia and Herzegovina","Qatar","2026-06-24","Lumen Field","Seattle"],
  ["C","Scotland","Brazil","2026-06-24","Hard Rock Stadium","Miami Gardens"],
  ["C","Morocco","Haiti","2026-06-24","Mercedes-Benz Stadium","Atlanta"],
  ["A","Czechia","Mexico","2026-06-24","Estadio Azteca","Mexico City"],
  ["A","South Africa","South Korea","2026-06-24","Estadio BBVA","Monterrey"],
  ["E","Curaçao","Ivory Coast","2026-06-25","Lincoln Financial Field","Philadelphia"],
  ["E","Ecuador","Germany","2026-06-25","MetLife Stadium","East Rutherford"],
  ["F","Japan","Sweden","2026-06-25","AT&T Stadium","Arlington"],
  ["F","Tunisia","Netherlands","2026-06-25","Arrowhead Stadium","Kansas City"],
  ["D","Turkey","United States","2026-06-25","SoFi Stadium","Inglewood"],
  ["D","Paraguay","Australia","2026-06-25","Levi's Stadium","Santa Clara"],
  ["I","Norway","France","2026-06-26","Gillette Stadium","Foxborough"],
  ["I","Senegal","Iraq","2026-06-26","BMO Field","Toronto"],
  ["H","Cape Verde","Saudi Arabia","2026-06-26","NRG Stadium","Houston"],
  ["H","Uruguay","Spain","2026-06-26","Estadio Akron","Guadalajara"],
  ["G","Egypt","IR Iran","2026-06-26","Lumen Field","Seattle"],
  ["G","New Zealand","Belgium","2026-06-26","BC Place","Vancouver"],
  ["L","Panama","England","2026-06-27","MetLife Stadium","East Rutherford"],
  ["L","Croatia","Ghana","2026-06-27","Lincoln Financial Field","Philadelphia"],
  ["K","Colombia","Portugal","2026-06-27","Hard Rock Stadium","Miami Gardens"],
  ["K","DR Congo","Uzbekistan","2026-06-27","Mercedes-Benz Stadium","Atlanta"],
  ["J","Algeria","Austria","2026-06-27","Arrowhead Stadium","Kansas City"],
  ["J","Jordan","Argentina","2026-06-27","AT&T Stadium","Arlington"],
];

// Non-World-Cup markets kept on the homepage's "Other markets" section.
const OTHER_MARKETS = [
  { id: "btc-eoy-2026", category: "Crypto", emoji: "₿", title: "Bitcoin price at the end of 2026?", title_zh: "2026 年底比特币价格?", resolves: "2026-12-31", question: "What will the Bitcoin (BTC/USD) spot price be on December 31, 2026? Pick exactly one bucket: 'Below $90k', '$90k–$130k', '$130k–$180k', '$180k–$250k', or 'Above $250k'.", unit: "bucket", options: ["Below $90k", "$90k–$130k", "$130k–$180k", "$180k–$250k", "Above $250k"] },
  { id: "us-house-2026", category: "Politics", emoji: "🏛️", title: "Who controls the US House after the 2026 midterms?", title_zh: "2026 中期选举后谁掌控美国众议院?", resolves: "2026-11-03", question: "After the November 2026 US midterm elections, which party holds the majority in the House of Representatives? Pick exactly one: 'Democrats' or 'Republicans'.", unit: "party", options: ["Democrats", "Republicans"] },
  { id: "next-frontier-model", category: "Tech", emoji: "🤖", title: "Which lab ships the next frontier model first?", title_zh: "哪家实验室率先发布下一代前沿模型?", resolves: "2026-12-31", question: "Which AI lab is first to ship a clearly next-generation frontier model before the end of 2026? Pick exactly one: 'OpenAI', 'Anthropic', 'Google DeepMind', 'xAI', or 'a Chinese lab'.", unit: "lab", options: ["OpenAI", "Anthropic", "Google DeepMind", "xAI", "a Chinese lab"] },
  { id: "ballon-dor-2026", category: "Football", emoji: "🏆", title: "Who wins the 2026 Ballon d'Or?", title_zh: "谁将赢得 2026 年金球奖?", resolves: "2026-10-26", question: "Which footballer wins the 2026 Ballon d'Or? Pick exactly one: 'Lamine Yamal', 'Kylian Mbappé', 'Jude Bellingham', 'Vinícius Jr.', or 'Erling Haaland'.", unit: "player", options: ["Lamine Yamal", "Kylian Mbappé", "Jude Bellingham", "Vinícius Jr.", "Erling Haaland"] },
];

const matches = FIXTURES.map(([group, home, away, date, venue, city]) => ({
  id: `wc26-${group.toLowerCase()}-${idCode(home)}-${idCode(away)}`,
  category: `Group ${group}`,
  stage: "group",
  home, homeFlag: flag(home),
  away, awayFlag: flag(away),
  kickoff: `${date}T19:00:00Z`,
  venue: `${venue}, ${city}`,
  emoji: "⚽",
  title: `${home} vs ${away}`,
  resolves: date,
  question: `In the 2026 FIFA World Cup Group ${group} match ${home} vs ${away} (${venue}, ${date}), what is the full-time result? Pick exactly one: ${home}, Draw, or ${away}.`,
  unit: "result",
}));

const events = [...matches, ...OTHER_MARKETS];
writeFileSync(join(ROOT, "data/events.json"), JSON.stringify(events, null, 2) + "\n");

// Quick id-uniqueness guard.
const ids = new Set();
const dups = events.filter((e) => (ids.has(e.id) ? true : (ids.add(e.id), false)));
console.log(`✓ Wrote data/events.json — ${matches.length} group matches + ${OTHER_MARKETS.length} other markets = ${events.length} events.`);
if (dups.length) console.error("⚠️ duplicate ids:", dups.map((d) => d.id));
