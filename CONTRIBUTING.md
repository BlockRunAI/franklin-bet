# Contributing to Franklin.bet

Thanks for helping. The project has a deliberately small surface: a static site
that renders a JSON file, plus scripts that generate that JSON by asking AI
models. Topics are **curated by maintainers**, not submitted by end users.

## The data contract

Everything flows through three files in `data/`:

| File | Who writes it | What it is |
|------|---------------|------------|
| `events.json` | maintainers | The questions the council forecasts. The input. |
| `models.json` | maintainers | The council roster (id, brand, colour). |
| `predictions.json` | the generator | Every model's answer. What the site renders. |

The site (`index.html` + `assets/`) reads only these and computes consensus in
the browser. It never calls a model directly and takes no user input.

## Adding a topic

Two ways, same result:

1. **Edit `data/events.json`** — add an event object, then
   `node scripts/generate.mjs --event <id>`.
2. **CLI** — `npm run add-event -- "Will X happen by 2027?"`. One LLM call
   normalizes your topic into the event schema (id, category, emoji, a crisp
   question that lists the allowed options, resolve date) and appends it. Add
   `--generate` to also produce predictions for it and merge them in.

An event:

```json
{
  "id": "world-cup-2026",
  "category": "Sports",
  "emoji": "⚽",
  "title": "Who lifts the 2026 FIFA World Cup?",
  "title_zh": "谁将捧起 2026 世界杯?",
  "resolves": "2026-07-19",
  "question": "Which national team will win the 2026 FIFA World Cup? Pick exactly one country.",
  "unit": "team"
}
```

The `question` must name the allowed options explicitly — it's the exact prompt
every model answers.

## Generating predictions

Two engines, selected by `oracle.config.json` `engine.mode` or `--agent`:

- **chat** — one model call per question. Fast, cheap, but **ungrounded** (the
  model answers from training data). Good for layout/dev.
- **agent** — each model runs Franklin **prediction mode** (`franklin predict`):
  it researches the question with a read-only toolset (web search, source fetch,
  Exa, X, live prediction markets, market data) the way a bettor would, then
  commits to a pick. **Grounded**, with a research trace shown on the site.

```bash
npm run generate                       # uses engine.mode from oracle.config.json
npm run generate -- --agent            # force grounded agent mode
npm run generate -- --event btc-eoy-2026   # one event, merged
npm run generate:free                  # zero-USDC NVIDIA tier (chat)
```

Agent mode needs the `franklin` CLI on PATH (`npm i -g @blockrun/franklin`) or
`FRANKLIN_CMD` pointing at a local build, plus `BLOCKRUN_API_KEY` or a funded wallet.

## Billing & secrets

- Recommended: register at https://user.blockrun.ai, add credits, create an API key,
  and set `BLOCKRUN_API_KEY` locally or as a CI secret.
- x402 wallet fallback supports Solana through Franklin agent mode, then Base via
  `BASE_CHAIN_WALLET_KEY` or the local session wallet.
- **Never commit an API key, private key, or `.env`.** They are gitignored.

## Running locally

```bash
npm install
npm run dev      # http://localhost:4173
```

## Style

Plain ES modules, no build step, no framework. Keep the site dependency-free and
the data contract stable.
