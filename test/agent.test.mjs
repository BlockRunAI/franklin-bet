import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { askModelAgent, MAX_CHILD_STDOUT_BYTES } from "../scripts/lib/agent.mjs";

test("Franklin adapter kills a child that exceeds the stdout ceiling", async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const fixture = join(here, "fixtures", "flood-child.mjs");
  const result = await askModelAgent(null, { id: "model" }, { question: "question" }, {
    franklinCmd: `${process.execPath} ${fixture}`,
    timeoutMs: 10_000,
  });
  assert.equal(result.__abstained, true);
  assert.match(result.error, new RegExp(`stdout exceeded ${MAX_CHILD_STDOUT_BYTES} byte limit`));
});
