"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ConnectionMonitor } = require("../connection.cjs");

test("offline state appears and Retry can recover", async () => {
  const outcomes = [false, true];
  const events = [];
  const scheduled = [];
  const monitor = new ConnectionMonitor({
    check: async () => outcomes.shift(),
    onOnline: async () => events.push("online"),
    onOffline: async ({ nextRetryMs }) => events.push(`offline:${nextRetryMs}`),
    schedule: (callback) => { scheduled.push(callback); return callback; },
    cancel: () => {},
  });
  await monitor.start();
  assert.deepEqual(events, ["offline:1000"]);
  await monitor.retryNow();
  assert.deepEqual(events, ["offline:1000", "online"]);
  assert.equal(scheduled.length, 1);
});

test("retry backoff is capped", async () => {
  const delays = [];
  const monitor = new ConnectionMonitor({
    check: async () => false,
    onOnline: async () => {},
    onOffline: async ({ nextRetryMs }) => delays.push(nextRetryMs),
    schedule: () => 1,
    cancel: () => {},
    maxDelayMs: 4000,
  });
  await monitor.start();
  await monitor.retryNow();
  await monitor.retryNow();
  await monitor.retryNow();
  assert.deepEqual(delays, [1000, 2000, 4000, 4000]);
});
