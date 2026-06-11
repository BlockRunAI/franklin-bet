// Franklin.bet — prediction generator (CLI).
//
// Asks every council model the same structured question for each event, through
// ONE BlockRun gateway endpoint, and writes data/predictions.json. Every
// prediction is a real, metered call settled in USDC via x402 — your wallet
// signature is the only auth.
//
//   npm run generate                 # all events, flagship paid council
//   npm run generate:free            # all events, free NVIDIA tier ($0)
//   node scripts/generate.mjs --event world-cup-2026   # one event, merged in
//
// Paid tier needs a wallet: BASE_CHAIN_WALLET_KEY in the env, or the funded
// ~/.blockrun/.session wallet (auto-discovered).

import {
  DATA, loadJSON, writeJSON, FREE_MODELS, loadConfig,
  generateEvents, mergePredictions, resolveClient,
} from "./lib/oracle.mjs";
import { askModelAgent } from "./lib/agent.mjs";

function parseArgs(argv) {
  const args = { events: [], models: [], agent: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--event") args.events.push(argv[++i]);
    else if (a === "--model") args.models.push(argv[++i]);
    else if (a === "--agent") args.agent = true;
    else if (a === "--max-spend") args.maxSpend = Number(argv[++i]);
    else if (a === "--max-turns") args.maxTurns = Number(argv[++i]);
    else if (a === "--concurrency") args.concurrency = Number(argv[++i]);
  }
  return args;
}

async function main() {
  const config = await loadConfig();
  const eng = config.engine || {};
  const tier = (process.env.ORACLE_TIER || eng.tier || "flagship").toLowerCase();
  const args = parseArgs(process.argv.slice(2));
  // Config-level default for engine mode; --agent flag still forces it on.
  if (!args.agent && eng.mode === "agent") args.agent = true;

  const allEvents = await loadJSON("events.json");
  const events = args.events.length
    ? allEvents.filter((e) => args.events.includes(e.id))
    : allEvents;
  if (!events.length) {
    console.error("✗ No matching events. Check --event id against data/events.json.");
    process.exit(1);
  }

  let models;
  if (tier === "free") {
    models = FREE_MODELS;
    await writeJSON("models.json", FREE_MODELS);
    console.log("Tier: FREE (NVIDIA, $0 USDC). Wrote free roster to data/models.json.");
  } else {
    models = await loadJSON("models.json");
    console.log(`Tier: FLAGSHIP — ${models.length} paid models. Spends a small amount of USDC.`);
  }
  if (args.models.length) {
    models = models.filter((m) => args.models.includes(m.id));
    if (!models.length) { console.error("✗ No matching --model ids in data/models.json."); process.exit(1); }
  }

  // Engine: --agent routes each model through Franklin prediction mode (grounded,
  // tool-using). Otherwise a plain single chat call (fast, ungrounded).
  const genOpts = { ask: undefined, concurrency: undefined };
  let client = null, how = "n/a (agent mode — Franklin manages its own wallet)";
  if (args.agent) {
    genOpts.ask = askModelAgent;
    genOpts.concurrency = args.concurrency ?? eng.concurrency ?? 3;
    genOpts.maxSpend = args.maxSpend ?? eng.maxSpendPerCall ?? 1.2;
    genOpts.maxTurns = args.maxTurns ?? eng.maxTurns ?? 6;
    genOpts.franklinCmd = eng.franklinCmd;
    console.log(`Engine: AGENT (franklin predict) — grounded, tool-using. ` +
      `concurrency=${genOpts.concurrency}, max-spend=$${genOpts.maxSpend}/call, max-turns=${genOpts.maxTurns}`);
  } else {
    try {
      ({ client, how } = await resolveClient({ tier }));
    } catch (err) {
      console.error(`\n✗ No wallet available: ${err.message}`);
      console.error("  Set BASE_CHAIN_WALLET_KEY, or run `npm run generate:free`.\n");
      process.exit(1);
    }
    console.log("Engine: CHAT (single call) — fast, NOT grounded in live data.");
  }
  console.log(`Wallet: ${how}`);
  console.log(`Generating ${events.length} event(s) × ${models.length} models…`);

  const onLog = (level, msg) => {
    if (level === "event") process.stdout.write(`\n${msg}\n`);
    else console.log(`   ${msg}`);
  };
  const fresh = await generateEvents(client, events, models, genOpts, onLog);

  // Incremental merge when only some events were (re)generated.
  const existing = (args.events.length || args.models.length)
    ? await loadJSON("predictions.json").catch(() => null) : null;
  const out = mergePredictions(existing, fresh, { tier, engine: args.agent ? "agent" : "chat" });
  await writeJSON("predictions.json", out);

  console.log(`\n✓ Wrote data/predictions.json — ${fresh.ok} predictions, ${fresh.abstained} abstained.\n`);
  if (fresh.abstained > 0) {
    console.log("  Abstained models are shown as 'abstained' on the site (no clean answer after retries).");
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
