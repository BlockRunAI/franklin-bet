// Franklin.bet — admin "add a topic" CLI.
//
// Maintainers (not end users) curate what the council forecasts. Give it a plain
// topic line; one LLM call normalizes it into the structured event schema, it
// appends to data/events.json, and optionally generates predictions for just
// that event and merges them in.
//
//   node scripts/add-event.mjs "Will the Fed cut rates below 3% by mid-2027?"
//   node scripts/add-event.mjs "Who wins Euro 2028?" --generate
//
// --generate runs the configured engine (agent/chat) for the new event only.
// --resolves YYYY-MM-DD pins the resolution date instead of letting the model guess.

import {
  loadJSON, writeJSON, loadConfig, resolveClient, looseJSON,
  generateEvents, mergePredictions,
} from "./lib/oracle.mjs";
import { askModelAgent } from "./lib/agent.mjs";

const NORMALIZER_MODEL = process.env.ORACLE_NORMALIZER_MODEL || "google/gemini-3.5-flash";

const SYSTEM = [
  "You turn a rough topic into ONE well-formed prediction-market-style event.",
  "Respond with ONLY a single-line minified JSON object, no markdown:",
  '{"category": string, "emoji": string, "title": string, "title_zh": string, "resolves": "YYYY-MM-DD", "question": string, "unit": string}',
  "- category: one of Sports, Crypto, Politics, Tech, Economy, Space, Science, Culture, Business (pick the best fit).",
  "- emoji: one emoji capturing the topic.",
  "- title: a short, punchy question in English (the card headline).",
  "- title_zh: the same question in natural Chinese.",
  "- resolves: your best estimate of when the outcome is known (a real future date).",
  "- question: a crisp, self-contained question that EXPLICITLY lists the allowed answer options (e.g. 'Pick one: Yes or No.' or 'Pick one: Democrats or Republicans.' or a set of buckets). This is what every model will answer.",
  "- unit: a one-word label for the answer type (e.g. team, party, bucket, outcome, count, player, lab).",
  "Make the options mutually exclusive and collectively exhaustive where possible.",
].join("\n");

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

function parseArgs(argv) {
  const args = { topic: [], generate: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--generate") args.generate = true;
    else if (a === "--resolves") args.resolves = argv[++i];
    else if (a === "--id") args.id = argv[++i];
    else args.topic.push(a);
  }
  args.topic = args.topic.join(" ").trim();
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.topic) {
    console.error('Usage: node scripts/add-event.mjs "<topic>" [--generate] [--resolves YYYY-MM-DD] [--id slug]');
    process.exit(1);
  }

  const config = await loadConfig();
  const eng = config.engine || {};

  const { client, how } = await resolveClient({ tier: eng.tier || "flagship" });
  console.log(`Normalizing topic with ${NORMALIZER_MODEL} (wallet: ${how})…`);
  const raw = await client.chat(NORMALIZER_MODEL, `Topic: ${args.topic}`, { system: SYSTEM, temperature: 0.4, maxTokens: 400 });
  const ev = looseJSON(raw);
  if (!ev || !ev.question) {
    console.error("✗ Could not normalize topic into an event. Model said:\n", raw);
    process.exit(1);
  }

  const events = await loadJSON("events.json");
  const id = args.id || slugify(ev.title || args.topic);
  if (events.some((e) => e.id === id)) {
    console.error(`✗ Event id "${id}" already exists. Pass --id <slug> to override.`);
    process.exit(1);
  }

  const event = {
    id,
    category: ev.category || "Culture",
    emoji: ev.emoji || "🔮",
    title: ev.title || args.topic,
    title_zh: ev.title_zh || "",
    resolves: args.resolves || ev.resolves || "",
    question: ev.question,
    unit: ev.unit || "outcome",
  };

  events.push(event);
  await writeJSON("events.json", events);
  console.log(`\n✓ Added event "${id}" to data/events.json:`);
  console.log(`  ${event.emoji} ${event.title}  [${event.category}, resolves ${event.resolves || "?"}]`);
  console.log(`  Q: ${event.question}`);

  if (!args.generate) {
    console.log(`\nNext: generate predictions for it with`);
    console.log(`  node scripts/generate.mjs --event ${id}\n`);
    return;
  }

  // Generate predictions for just this event and merge in.
  const models = await loadJSON("models.json");
  const useAgent = eng.mode === "agent";
  const genOpts = useAgent
    ? { ask: askModelAgent, concurrency: eng.concurrency ?? 3, maxSpend: eng.maxSpendPerCall ?? 1.2, maxTurns: eng.maxTurns ?? 6, franklinCmd: eng.franklinCmd }
    : {};
  console.log(`\nGenerating predictions (${useAgent ? "agent" : "chat"} engine) for ${id}…`);
  const onLog = (level, msg) => { if (level === "event") process.stdout.write(`\n${msg}\n`); else console.log(`   ${msg}`); };
  const fresh = await generateEvents(useAgent ? null : client, [event], models, genOpts, onLog);
  const existing = await loadJSON("predictions.json").catch(() => null);
  const out = mergePredictions(existing, fresh, { tier: eng.tier || "flagship", engine: useAgent ? "agent" : "chat" });
  await writeJSON("predictions.json", out);
  console.log(`\n✓ Generated — ${fresh.ok} predictions, ${fresh.abstained} abstained. Committed to data/predictions.json.\n`);
}

main().catch((err) => { console.error(err); process.exit(1); });
