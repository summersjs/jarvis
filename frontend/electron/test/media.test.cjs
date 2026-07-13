"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { MEDIA_ACTIONS, runMediaAction } = require("../media.cjs");

test("media commands are narrowly allowlisted", async () => {
  assert.equal(MEDIA_ACTIONS.has("playPause"), true);
  assert.equal(MEDIA_ACTIONS.has("getNowPlaying"), true);
  await assert.rejects(() => runMediaAction("powershell -Command Get-Secret"), /Unsupported media command/);
});

test("media status is explicitly unavailable off Windows", async () => {
  const result = await runMediaAction("getNowPlaying", { platform: "linux" });
  assert.equal(result.available, false);
});
