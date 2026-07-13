"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("native preload exposes only named telemetry, speed, and media operations", () => {
  const preload = fs.readFileSync(path.join(__dirname, "..", "preload.cjs"), "utf8");
  for (const channel of [
    "jarvis:telemetry:getGpu", "jarvis:telemetry:getStorage", "jarvis:telemetry:getNetwork",
    "jarvis:network:getSpeedResult", "jarvis:network:runSpeedTest",
    "jarvis:media:getSession", "jarvis:media:executeAction", "jarvis:media:openYouTubeMusic",
    "desktop:open-forge-project", "desktop:collapse-jarvis",
  ]) assert.match(preload, new RegExp(channel.replaceAll(":", "\\:")));
  assert.doesNotMatch(preload, /executeCommand|runPowerShell|child_process|shell:/i);
});

test("native collectors never enable shell interpolation", () => {
  for (const file of ["gpu.cjs", "storage.cjs", "network.cjs", "media.cjs"]) {
    const contents = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    assert.doesNotMatch(contents, /shell:\s*true/);
  }
});
