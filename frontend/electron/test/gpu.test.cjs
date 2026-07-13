"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { GPU_QUERY_ARGS, GpuCollector, locateNvidiaSmi, parseNvidiaCsv } = require("../gpu.cjs");

test("valid NVIDIA CSV returns utilization, VRAM, temperature, power, and driver", () => {
  const value = parseNvidiaCsv("NVIDIA GeForce RTX 3060, 22, 2048, 12288, 48, 42.5, 610.74");
  assert.equal(value.available, true);
  assert.equal(value.utilizationPercent, 22);
  assert.equal(value.memoryTotalMb, 12288);
  assert.equal(value.powerWatts, 42.5);
});

test("unsupported optional NVIDIA fields do not fail required telemetry", () => {
  const value = parseNvidiaCsv("NVIDIA GPU, 3, 100, 4096, N/A, [Not Supported], 600.1");
  assert.equal(value.available, true);
  assert.equal(value.temperatureC, null);
  assert.equal(value.powerWatts, null);
});

test("missing executable, malformed output, and timeout are explicit", async () => {
  assert.equal(locateNvidiaSmi({ env: { PATH: "Z:\\none" }, exists: () => false }), null);
  assert.equal(parseNvidiaCsv("garbage").reason, "malformed_output");
  const timeout = new GpuCollector({ platform: "win32", locate: () => "nvidia-smi.exe", run: async () => { const error = new Error("timeout"); error.killed = true; throw error; } });
  assert.equal((await timeout.get()).reason, "timeout");
});

test("GPU process receives only the fixed argument array", async () => {
  let received;
  const collector = new GpuCollector({ platform: "win32", locate: () => "C:\\Windows\\System32\\nvidia-smi.exe", run: async (executable, args) => { received = { executable, args }; return "GPU, 1, 2, 4096, 40, 10, 600"; } });
  await collector.get();
  assert.deepEqual(received.args, [...GPU_QUERY_ARGS]);
  assert.equal(received.executable, "C:\\Windows\\System32\\nvidia-smi.exe");
});
