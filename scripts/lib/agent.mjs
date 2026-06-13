// Franklin.bet — "AI bettor" engine.
//
// Drives Franklin's prediction mode (`franklin predict`) as a child process:
// each council model researches the event with a read-only toolset (web search,
// source fetch, Exa, X, live prediction markets, market data) the way a bettor
// would, then commits to a pick. We parse the JSON envelope it prints and keep
// the research trace so the site can show how each model did its homework.
//
// Franklin command is resolved from FRANKLIN_CMD (default "franklin"). For local
// dev against an un-published build, set e.g.
//   FRANKLIN_CMD="node /Users/you/BlockRun/Franklin/dist/index.js"

import { spawn } from "node:child_process";
import { parseModelJSON, snapPick } from "./oracle.mjs";

function franklinInvocation(cmdOverride) {
  // env wins (handy for local dev), then explicit override (from config), then PATH.
  const cmd = process.env.FRANKLIN_CMD || cmdOverride || "franklin";
  const parts = cmd.split(" ").filter(Boolean);
  return { bin: parts[0], baseArgs: parts.slice(1) };
}

// Pull the JSON envelope `franklin predict --json` prints. Franklin may emit
// other chatter; the envelope is the last stdout line that parses to an object
// carrying a `finalText` field.
function extractEnvelope(stdout) {
  const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].startsWith("{")) continue;
    try {
      const o = JSON.parse(lines[i]);
      if (o && typeof o.finalText === "string") return o;
    } catch { /* keep scanning upward */ }
  }
  return null;
}

// Trim the raw tool trace into something compact and presentable.
function compactTrace(trace) {
  if (!Array.isArray(trace)) return [];
  return trace.slice(0, 12).map((t) => ({
    tool: t.tool,
    query: shorten(t.input, 160),
    summary: shorten((t.output || "").replace(/\s+/g, " "), 280),
    isError: !!t.isError,
  }));
}

function shorten(s, n) {
  s = String(s || "").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// Ask one model to predict one event via Franklin prediction mode.
// Returns a normalized prediction (+ marketOdds + trace), or { __abstained }.
export async function askModelAgent(_client, model, event, opts = {}) {
  const { maxTurns, maxToolCalls, maxSpend, timeoutMs = 600000, franklinCmd } = opts;
  const { bin, baseArgs } = franklinInvocation(franklinCmd);
  const args = [...baseArgs, "predict", "--model", model.id, "--question", event.question];
  // Caps are opt-in: only passed when provided, so "no flag" = no cap.
  if (maxTurns != null) args.push("--max-turns", String(maxTurns));
  if (maxToolCalls != null) args.push("--max-tool-calls", String(maxToolCalls));
  if (maxSpend != null) args.push("--max-spend", String(maxSpend));

  return new Promise((resolve) => {
    let stdout = "", stderr = "", done = false;
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const finish = (val) => { if (!done) { done = true; clearTimeout(killer); resolve(val); } };
    const killer = setTimeout(() => { try { child.kill("SIGKILL"); } catch {}
      finish({ __abstained: true, modelId: model.id, error: `timeout after ${timeoutMs}ms` });
    }, timeoutMs);

    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("error", (e) => finish({ __abstained: true, modelId: model.id, error: e.message }));
    child.on("close", () => {
      const env = extractEnvelope(stdout);
      if (!env) {
        return finish({ __abstained: true, modelId: model.id, error: "no JSON envelope from franklin predict" });
      }
      const parsed = parseModelJSON(env.finalText);
      if (!parsed) {
        // It researched but never produced a clean final JSON.
        return finish({ __abstained: true, modelId: model.id, error: `unparseable answer (${env.turnReason})`, trace: compactTrace(env.trace) });
      }
      const snapped = snapPick(event, parsed.pick);
      if (!snapped) {
        return finish({ __abstained: true, modelId: model.id, error: `off-option pick: "${parsed.pick}"`, trace: compactTrace(env.trace) });
      }
      finish({
        modelId: model.id,
        ...parsed, // pick, confidence, rationale, analysis, marketOdds
        pick: snapped,
        trace: compactTrace(env.trace),
        turnReason: env.turnReason,
        tokens: env.usage,
      });
    });
  });
}
