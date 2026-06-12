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
    else if (a === "--upcoming") args.upcoming = Number(argv[++i]);
    else if (a === "--skip-done") args.skipDone = true;
    else if (a === "--fill-abstained") args.fillAbstained = true;
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
  let events = args.events.length
    ? allEvents.filter((e) => args.events.includes(e.id))
    : allEvents;
  // --upcoming N: only matches kicking off within the next N days (the cron that
  // runs ~2 days before each match). --skip-done: skip events already predicted.
  if (args.upcoming != null) {
    const now = Date.now(), horizon = now + args.upcoming * 86400000;
    events = events.filter((e) => { const tt = Date.parse(e.kickoff || ""); return !isNaN(tt) && tt >= now && tt <= horizon; });
    console.log(`Filter: kicking off within ${args.upcoming} day(s) → ${events.length} match(es).`);
  }
  if (args.skipDone) {
    const existing = await loadJSON("predictions.json").catch(() => null);
    const done = new Set(Object.entries(existing?.byEvent || {}).filter(([, v]) => v && v.length).map(([id]) => id));
    const before = events.length;
    events = events.filter((e) => !done.has(e.id));
    console.log(`Filter: skip already-predicted → dropped ${before - events.length}, ${events.length} left.`);
  }
  if (!events.length) {
    console.log("Nothing to generate (no matching events after filters).");
    process.exit(0);
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
    // Caps are opt-in via CLI only — no flag = uncapped (Franklin's own defaults apply).
    genOpts.maxSpend = args.maxSpend;
    genOpts.maxTurns = args.maxTurns;
    genOpts.franklinCmd = eng.franklinCmd;
    console.log(`Engine: AGENT (franklin predict) — grounded, tool-using. ` +
      `concurrency=${genOpts.concurrency}, max-spend=${genOpts.maxSpend != null ? "$" + genOpts.maxSpend : "uncapped"}/call, max-turns=${genOpts.maxTurns ?? "default"}`);
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

  // --fill-abstained: re-run ONLY the (event, model) pairs that have no vote
  // yet in predictions.json (abstained or never run). Per-model merge keeps the
  // event's existing good votes. Skips events that are already complete.
  if (args.fillAbstained) {
    const existing = await loadJSON("predictions.json").catch(() => null);
    const votedByEvent = {};
    for (const [id, votes] of Object.entries(existing?.byEvent || {})) {
      votedByEvent[id] = new Set((votes || []).map((v) => v.modelId));
    }
    genOpts.modelFilter = (ev) => {
      const voted = votedByEvent[ev.id];
      // Only fill events that already have SOME votes — a zero-vote event isn't
      // "abstained", it just hasn't been run. Scope those with --event/--upcoming.
      if (!voted || voted.size === 0) return [];
      return models.filter((m) => !voted.has(m.id));
    };
    const missing = events.reduce((n, ev) => n + genOpts.modelFilter(ev).length, 0);
    const evWithGaps = events.filter((ev) => genOpts.modelFilter(ev).length).length;
    console.log(`Fill mode: re-running ${missing} missing (event × model) pair(s) across ${evWithGaps} partial event(s).`);
    if (!missing) { console.log("Nothing to fill — every event already has all models."); process.exit(0); }
  } else {
    console.log(`Generating ${events.length} event(s) × ${models.length} models…`);
  }

  const onLog = (level, msg) => {
    if (level === "event") process.stdout.write(`\n${msg}\n`);
    else console.log(`   ${msg}`);
  };
  const fresh = await generateEvents(client, events, models, genOpts, onLog);

  // Incremental merge when only some events were (re)generated.
  const partial = args.events.length || args.models.length || args.upcoming != null || args.skipDone || args.fillAbstained;
  const existing = partial ? await loadJSON("predictions.json").catch(() => null) : null;
  const out = mergePredictions(existing, fresh, { tier, engine: args.agent ? "agent" : "chat" });
  await writeJSON("predictions.json", out);

  console.log(`\n✓ Wrote data/predictions.json — ${fresh.ok} predictions, ${fresh.abstained} abstained.\n`);
  if (fresh.abstained > 0) {
    console.log("  Abstained models are shown as 'abstained' on the site (no clean answer after retries).");
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
