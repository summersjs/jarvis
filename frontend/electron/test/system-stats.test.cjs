"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { collectSystemStats } = require("../system-stats.cjs");

test("CPU and RAM telemetry remain real calculated values", async () => {
  let sample = 0;
  const osModule = {
    cpus: () => sample++ === 0 ? [{ times: { idle: 100, user: 100, sys: 0, nice: 0, irq: 0 } }] : [{ times: { idle: 150, user: 250, sys: 0, nice: 0, irq: 0 } }],
    freemem: () => 4,
    totalmem: () => 8,
    uptime: () => 3660,
  };
  const result = await collectSystemStats({ osModule, delay: async () => {} });
  assert.equal(result.cpuUsage, 75);
  assert.equal(result.ramUsage, 50);
  assert.equal(result.uptime, "01:01");
});
