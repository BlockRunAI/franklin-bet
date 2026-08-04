import test from "node:test";
import assert from "node:assert/strict";
import { normalize } from "node:path";
import { resolvePublicFile } from "../scripts/serve.mjs";
import { escapeHtml, safeEventEmoji } from "../assets/safe.js";
import { generateEvents } from "../scripts/lib/oracle.mjs";

test("static server resolves only intentionally public files", () => {
  const root = "/srv/franklin";
  assert.equal(resolvePublicFile("/", root), normalize(`${root}/index.html`));
  assert.equal(resolvePublicFile("/assets/app.js", root), normalize(`${root}/assets/app.js`));
  assert.equal(resolvePublicFile("/data/events.json", root), normalize(`${root}/data/events.json`));
  assert.equal(resolvePublicFile("/oracle.config.json", root), normalize(`${root}/oracle.config.json`));

  for (const path of ["/.env", "/.env.example", "/.git/config", "/package.json", "/assets/../.env", "/data/.secret"]) {
    assert.equal(resolvePublicFile(path, root), null, path);
  }
});

test("generated event text is inert at HTML sinks", () => {
  const payload = `<img src=x onerror="globalThis.pwned=1">`;
  const escaped = "&lt;img src=x onerror=&quot;globalThis.pwned=1&quot;&gt;";
  assert.equal(escapeHtml(payload), escaped);
  assert.equal(safeEventEmoji({ emoji: payload }), escaped);
  assert.equal(safeEventEmoji({ emoji: "⚽" }), "⚽");
});

test("built-in chat retries are not retried again as a whole prediction", async () => {
  let calls = 0;
  const client = { chat: async () => { calls++; return "not json"; } };
  const result = await generateEvents(
    client,
    [{ id: "event", title: "Event", question: "Pick one", options: ["Yes", "No"] }],
    [{ id: "model", name: "Model" }],
    { requestRetries: 0 },
  );
  assert.equal(calls, 1);
  assert.equal(result.abstained, 1);
});

test("custom agent adapters retain one explicit bounded prediction retry", async () => {
  let calls = 0;
  const ask = async () => { calls++; return { __abstained: true, modelId: "model", error: "bad output" }; };
  await generateEvents(
    null,
    [{ id: "event", title: "Event", question: "Pick one" }],
    [{ id: "model", name: "Model" }],
    { ask },
  );
  assert.equal(calls, 2);
});
