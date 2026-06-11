// Franklin.bet — shared generation engine.
//
// One place for: loading data, calling the council through the BlockRun gateway,
// robustly parsing model output, and merging results into predictions.json.
// Both generate.mjs and add-event.mjs build on this.

import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DATA = join(ROOT, "data");

// --- config ---------------------------------------------------------------
export async function loadConfig() {
  try {
    return JSON.parse(await readFile(join(ROOT, "oracle.config.json"), "utf8"));
  } catch {
    return {};
  }
}

export async function loadJSON(name) {
  return JSON.parse(await readFile(join(DATA, name), "utf8"));
}

export async function writeJSON(name, obj) {
  await writeFile(join(DATA, name), JSON.stringify(obj, null, 2) + "\n");
}

// Free NVIDIA roster used when tier === "free" — zero USDC.
export const FREE_MODELS = [
  { id: "nvidia/deepseek-v4-flash",           name: "DeepSeek V4 Flash", provider: "NVIDIA", color: "#76b900", free: true },
  { id: "nvidia/qwen3-next-80b-a3b-thinking", name: "Qwen3 Next 80B",    provider: "NVIDIA", color: "#615ced", free: true },
  { id: "nvidia/qwen3.5-397b-a17b",           name: "Qwen3.5 397B",      provider: "NVIDIA", color: "#06b6d4", free: true },
];

export const SYSTEM = [
  "You are a forecasting analyst on a panel of AI models predicting the outcome of a real-world event.",
  "Respond with ONLY a single-line, minified JSON object — no markdown, no code fences, no preamble, no thinking out loud.",
  'Schema: {"pick": string, "confidence": number, "rationale": string, "analysis": string}',
  "- pick: choose exactly one option from the question (a short label, e.g. a country, party, bucket, or Yes/No).",
  "- confidence: your probability that THIS pick is correct, a number between 0 and 1.",
  "- rationale: one sharp sentence (max 22 words) justifying the pick.",
  "- analysis: fuller reasoning in 3-5 sentences. Name the key drivers, the strongest counter-argument, and why you still land on this pick. Use no literal newline characters inside the string.",
  "Be decisive and specific. Do not hedge with 'it depends'. Output the JSON object and nothing else.",
].join("\n");

// --- robust parsing -------------------------------------------------------
// Models (esp. reasoning models like Kimi) wrap JSON in thinking, fences, or
// emit multiline strings that break a strict JSON.parse. Try hard, in order:
//   1) strip fences/thinking → whole-string parse
//   2) balanced-brace scan → parse each candidate
//   3) per-field regex extraction as a last resort
// Tolerant extraction of ANY JSON object from model text (no schema). Used by
// add-event to parse a normalized event. Returns the object or null.
export function looseJSON(raw) {
  if (!raw || typeof raw !== "string") return null;
  const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```json/gi, "").replace(/```/g, "").trim();
  const tryParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
  const sanitize = (s) => s.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ");
  let obj = tryParse(text) || tryParse(sanitize(text));
  if (obj && typeof obj === "object") return obj;
  for (const cand of braceCandidates(text)) {
    obj = tryParse(cand) || tryParse(sanitize(cand));
    if (obj && typeof obj === "object") return obj;
  }
  return null;
}

export function parseModelJSON(raw) {
  if (!raw || typeof raw !== "string") return null;
  let text = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")        // strip <think> blocks
    .replace(/```json/gi, "").replace(/```/g, "")
    .trim();

  const tryParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
  const sanitize = (s) =>
    // best-effort: escape raw newlines/tabs that appear inside the object
    s.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ");

  // 1) whole-string
  let obj = tryParse(text) || tryParse(sanitize(text));
  if (valid(obj)) return normalize(obj);

  // 2) balanced-brace candidates
  for (const cand of braceCandidates(text)) {
    obj = tryParse(cand) || tryParse(sanitize(cand));
    if (valid(obj)) return normalize(obj);
  }

  // 3) per-field regex (handles malformed JSON)
  const pick = field(text, "pick");
  if (pick) {
    return normalize({
      pick,
      confidence: numField(text, "confidence"),
      rationale: field(text, "rationale") || "",
      analysis: field(text, "analysis") || "",
    });
  }
  return null;
}

function valid(o) {
  return o && typeof o === "object" && typeof o.pick === "string" && o.pick.trim().length > 0;
}

function normalize(o) {
  const out = {
    pick: String(o.pick).trim(),
    confidence: clampConfidence(o.confidence),
    rationale: String(o.rationale || "").trim(),
    analysis: String(o.analysis || "").trim(),
  };
  // Agent (prediction-mode) answers also carry the live market-implied odds.
  if (o.marketOdds != null && String(o.marketOdds).trim()) {
    out.marketOdds = String(o.marketOdds).trim();
  }
  return out;
}

function* braceCandidates(text) {
  // Yield every balanced {...} span (outermost first via depth tracking).
  const starts = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") starts.push(i);
    else if (text[i] === "}" && starts.length) {
      const s = starts.pop();
      if (starts.length === 0) yield text.slice(s, i + 1);
    }
  }
}

function field(text, key) {
  // "key": "value" — value may contain escaped quotes; stop at the closing
  // quote that precedes a comma or closing brace.
  const re = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, "i");
  const m = text.match(re);
  return m ? m[1].replace(/\\"/g, '"').replace(/\\n/g, " ").trim() : null;
}

function numField(text, key) {
  const re = new RegExp(`"${key}"\\s*:\\s*([0-9.]+)`, "i");
  const m = text.match(re);
  return m ? clampConfidence(m[1]) : 0.5;
}

export function clampConfidence(c) {
  const n = Number(c);
  if (!Number.isFinite(n)) return 0.5;
  if (n > 1) return Math.min(n / 100, 1); // tolerate "30" meaning 30%
  if (n < 0) return 0;
  return Number(n.toFixed(2));
}

// --- model call with timeout + retries ------------------------------------
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout after ${ms}ms (${label})`)), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); },
                 (e) => { clearTimeout(t); reject(e); });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Ask one model for one event, with retries and tolerant parsing.
// Returns a normalized prediction object, or null if it abstains after retries.
export async function askModel(client, model, event, opts = {}) {
  const { retries = 2, timeoutMs = 90000, maxTokens = 600, temperature = 0.7 } = opts;
  let lastErr = "no response";
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const prompt = attempt === 0
        ? event.question
        : `${event.question}\n\nReturn ONLY a single-line minified JSON object matching the schema. No other text.`;
      const text = await withTimeout(
        client.chat(model.id, prompt, { system: SYSTEM, temperature, maxTokens }),
        timeoutMs, model.id
      );
      const parsed = parseModelJSON(text);
      if (parsed) return { modelId: model.id, ...parsed };
      lastErr = "unparseable response";
    } catch (err) {
      lastErr = err?.message || String(err);
    }
    if (attempt < retries) await sleep(400 * (attempt + 1));
  }
  return { __abstained: true, modelId: model.id, error: lastErr };
}

// Generate predictions for a set of events across the full roster.
// opts.ask(client, model, event, opts) lets callers swap the per-model engine
// (plain chat vs the prediction-mode agent). Defaults to askModel.
// opts.concurrency caps how many models run at once (agent runs are heavy).
// onLog(level, msg) is an optional progress callback.
export async function generateEvents(client, events, models, opts = {}, onLog = () => {}) {
  const ask = opts.ask || askModel;
  const concurrency = opts.concurrency || models.length;
  const byEvent = {};
  let ok = 0, abstained = 0;
  for (const ev of events) {
    onLog("event", `${ev.emoji || "🔮"} ${ev.title}`);
    const results = await mapPool(models, concurrency, (m) => ask(client, m, ev, opts));
    byEvent[ev.id] = [];
    for (const r of results) {
      if (r.__abstained) {
        abstained++;
        onLog("fail", `✗ ${name(models, r.modelId)} abstained — ${r.error}`);
      } else {
        byEvent[ev.id].push(r);
        ok++;
        onLog("ok", `✓ ${name(models, r.modelId)} → ${r.pick} (${Math.round(r.confidence * 100)}%)`);
      }
    }
  }
  return { byEvent, ok, abstained };
}

function name(models, id) {
  return models.find((m) => m.id === id)?.name || id;
}

// Run fn over items with a bounded concurrency, preserving input order.
async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// Merge freshly generated events into an existing predictions file (incremental).
export function mergePredictions(existing, fresh, { tier, engine = "chat" }) {
  const byEvent = { ...(existing?.byEvent || {}) };
  for (const [id, votes] of Object.entries(fresh.byEvent)) byEvent[id] = votes;
  return {
    generatedAt: new Date().toISOString(),
    source: "blockrun",
    engine, // "chat" (single call) or "agent" (franklin predict, grounded)
    tier,
    byEvent,
  };
}

// Resolve a BlockRun client: explicit env key wins, else auto-discover the
// funded ~/.blockrun/.session wallet. Returns the client or throws.
export async function resolveClient({ tier }) {
  let LLMClient, setupAgentWallet;
  ({ LLMClient, setupAgentWallet } = await import("@blockrun/llm"));
  const baseURL = process.env.BLOCKRUN_BASE_URL;
  if (process.env.BASE_CHAIN_WALLET_KEY) {
    return { client: new LLMClient(baseURL ? { baseURL } : {}), how: "env key" };
  }
  if (tier !== "free" && !process.env.BASE_CHAIN_WALLET_KEY) {
    // setupAgentWallet still works for paid if a session/file wallet exists.
  }
  return { client: setupAgentWallet(), how: "~/.blockrun/.session" };
}
