"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { collectWindowsTelemetry } = require("../telemetry.cjs");

test("Windows-only telemetry does not invent values on unsupported systems", async () => {
  assert.deepEqual(await collectWindowsTelemetry({ platform: "linux" }), {});
});
