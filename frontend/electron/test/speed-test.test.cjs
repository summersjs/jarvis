"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { CACHE_MS, SpeedTestService, validateSpeedResult } = require("../speed-test.cjs");

function store(initial = {}) { return { data: initial, get(key, fallback) { return this.data[key] ?? fallback; }, set(key, value) { this.data[key] = value; } }; }
const SAMPLE = { downloadMbps: 287.4, uploadMbps: 31.2, latencyMs: 18, jitterMs: 3.1 };

test("valid result is cached for 24 hours", async () => {
  let calls = 0;
  const state = store();
  const service = new SpeedTestService({ store: state, now: () => 1_000_000, runner: async () => { calls += 1; return SAMPLE; } });
  await service.run({ manual: false });
  await service.run({ manual: false });
  assert.equal(calls, 1);
  assert.equal(service.intervalMs, CACHE_MS);
});

test("manual refresh runs once and concurrent calls do not duplicate", async () => {
  let resolveRunner;
  let calls = 0;
  const service = new SpeedTestService({ store: store(), runner: () => { calls += 1; return new Promise((resolve) => { resolveRunner = resolve; }); } });
  const first = service.run({ manual: true });
  const duplicate = await service.run({ manual: true });
  assert.equal(duplicate.alreadyRunning, true);
  assert.equal(calls, 1);
  resolveRunner(SAMPLE);
  await first;
});

test("failed refresh preserves the last good result and invalid results are rejected", async () => {
  const previous = validateSpeedResult(SAMPLE, new Date(0).toISOString());
  const service = new SpeedTestService({ store: store({ internetSpeedResult: previous }), now: () => CACHE_MS + 1, runner: async () => { throw new Error("failed"); } });
  const result = await service.run({ manual: true });
  assert.equal(result.downloadMbps, 287.4);
  assert.equal(result.refreshFailed, true);
  assert.equal(validateSpeedResult({ downloadMbps: 0, uploadMbps: 1, latencyMs: 2, jitterMs: 1 }), null);
});

test("failed automatic test is not retried until the cache period expires", async () => {
  let calls = 0;
  const state = store();
  const service = new SpeedTestService({ store: state, now: () => 1000, runner: async () => { calls += 1; throw new Error("failed"); } });
  await service.run({ manual: false });
  await service.run({ manual: false });
  assert.equal(calls, 1);
});
