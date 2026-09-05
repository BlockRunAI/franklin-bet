# 🏆 Franklin.bet

> The world's top AI models research the form, read the live odds, and bet on every 2026 World Cup match — on one screen.

A **static**, no-backend, no-login showcase. A council of frontier models
(GPT-5.5, Claude Opus 4.8, Gemini 3.1 Pro, Grok 4.3, DeepSeek V4, Kimi K2.6,
MiniMax M3) each predicts every fixture of the 2026 World Cup. Each match shows
the Home / Draw / Away consensus, every model's pick side by side, the boldest
upset calls, and **how each model did its research before committing**.

It's a marketing gimmick with a point: in grounded mode every prediction is a
real agent that searches the live web for form and team news, reads
prediction-market odds, and pays per call through the BlockRun account API or in USDC via x402 through one BlockRun
endpoint. The whole pipeline is **open-source and reproducible** — anyone can
re-run it with their own API key or wallet. The site *is* the demo.

English-first, with Chinese accents. Fixtures are **curated by maintainers**;
the site takes no user input. Built on [Franklin](https://blockrun.ai) ×
[BlockRun](https://blockrun.ai).

## How it works

```
 data/events.json   ─┐                         the admin-curated questions
 data/models.json   ─┤                         the council roster
                     │
              scripts/generate.mjs  ──►  each model answers, two engines:
                     │                     • chat  — one call (fast, ungrounded)
                     │                     • agent — Franklin prediction mode
                     │                       researches web + markets, then bets
                     ▼
 data/predictions.json  ──►  index.html + assets/  (pure static, reads JSON,
                              computes consensus in the browser)
```

### Grounded "AI bettor" mode

`--agent` routes each model through **Franklin prediction mode**
(`franklin predict`) — a stripped-down agent with a research-only toolset
(web search, source fetch, Exa, X, **live prediction markets**, market data) and
nothing else. Each model researches the question the way a person about to place
a bet would, then commits to a pick with a confidence. The site's expandable
panel shows the full research trail (every search + finding) and the live market
odds the model saw.

## Layout

```
index.html             Single-page showcase
assets/style.css       Dark "oracle" theme
assets/app.js          Loads data, derives consensus, renders, branding from config
oracle.config.json     Branding + engine defaults (forkable / white-labelable)
data/events.json       The hot-event questions (admin-curated)
data/models.json       The council roster
data/predictions.json  Generated answers — what the site renders
scripts/generate.mjs   Runs the council (chat or agent engine), merges results
scripts/add-event.mjs  Admin CLI: a topic line → a structured event
scripts/lib/oracle.mjs Shared engine: parsing, retries, merge
scripts/lib/agent.mjs  Drives `franklin predict` per model, captures the trace
scripts/serve.mjs      Zero-dep local static server
.github/workflows/     CI: regenerate → commit → redeploy
```

## Run locally

```bash
npm install
npm run seed       # fill data/predictions.json with zero-cost sample picks
npm run dev        # → http://localhost:4173
```

## Reproduce it yourself

The data pipeline is fully open. There are two ways the `data/predictions.json`
the site renders can be produced — and **anyone can run either**:

- **The canonical site** is refreshed server-side using a BlockRun account API key,
  then committed and redeployed.
- **You** can fork the repo, register at [user.blockrun.ai](https://user.blockrun.ai),
  add [credits](https://user.blockrun.ai/dashboard/credits), create an
  [API key](https://user.blockrun.ai/dashboard/keys), and regenerate the same way.
  The x402 wallet flow remains available. Because grounded runs use live web search and model
  sampling, you reproduce the **method**, not bit-identical output — that's
  expected for forecasting.

```bash
npm run seed                          # 0) zero-USDC placeholder data to render
export BLOCKRUN_API_KEY=brk_...         # recommended account billing
npm run generate -- --agent           # 1) grounded: each model researches + bets
npm run generate -- --agent --event wc26-arg-nga   # one match, merged in
npm run generate:free                 # zero-USDC NVIDIA tier (chat engine)
```

### Engines

| Engine | Command | Grounded? | Dependency |
|--------|---------|-----------|------------|
| `chat` | `npm run generate` | No (training data) | `@blockrun/llm` only |
| `agent` | `npm run generate -- --agent` | Yes (live web + market odds) | the **Franklin CLI** |

Agent mode invokes Franklin's **prediction mode** as a CLI — `franklin predict
--json` — and reads its JSON envelope. Franklin is treated as a *system tool*
(like `git` or `ffmpeg`), not an npm dependency, so it's **not** in
`package.json`. Install it separately:

```bash
npm i -g @blockrun/franklin     # needs a version with `franklin predict`
# …or point at a local build during development:
export FRANKLIN_CMD="node /path/to/Franklin/dist/index.js"
```

The contract between the two repos is the `franklin predict --json` envelope
(`{ finalText, trace, turnReason, usage }`), not raw stdout — so the CLI can
evolve without breaking the site as long as that shape holds.

### Add a fixture / topic

```bash
npm run add-event -- "Portugal vs Morocco World Cup 2026 quarter-final"   # append
npm run add-event -- "Who wins Euro 2028?" --generate                      # append + generate
```

## Automate the refresh (CI)

`.github/workflows/refresh.yml` lets a maintainer trigger a regenerate from the
Actions tab (choose `chat`/`agent`, optional single event), commits the updated
`predictions.json`, and pushes — your static host redeploys. Set the `BLOCKRUN_API_KEY` repo secret first. Wallet fallback order is Solana, then Base;
agent mode inherits either wallet from Franklin while chat mode supports the Base wallet. A weekly schedule is included
(commented out — agent mode spends real USDC).

## Deploy on a BlockRun subdomain

Pure static files. Suggested home: **`franklin.bet`**.

- **GCS bucket:** `gsutil -m rsync -r -x 'node_modules/.*|\.git/.*' . gs://franklin-bet` then point an HTTPS LB + DNS at it.
- **Cloud Run:** wrap in `nginx:alpine` serving the folder; add a domain mapping.
- **Vercel / Netlify / GitHub Pages:** no build step, set the custom domain.

No serve-time secrets — generation is a build step and `predictions.json` is committed.

## Configuration

`oracle.config.json` controls branding (title, tagline, links — read by the site)
and engine defaults (mode, tier, max spend/turns, concurrency, Franklin command).
Fork it, rebrand it, point it at your own roster.

## Disclaimer

For entertainment only. AI-generated opinions, not forecasts or financial
advice. Models can be confidently wrong — that's half the fun.

MIT licensed.
