"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ALLOWED_DRIVES, StorageCollector, parseStorageJson } = require("../storage.cjs");

test("C: schema computes real used/free totals", () => {
  const value = parseStorageJson(JSON.stringify({ drive: "C:", filesystem: "NTFS", volumeLabel: "Windows", totalBytes: 2_000_000_000_000, freeBytes: 800_000_000_000 }));
  assert.equal(value.available, true);
  assert.equal(value.usedBytes, 1_200_000_000_000);
  assert.equal(value.usedPercent, 60);
  assert.deepEqual([...ALLOWED_DRIVES], ["C:"]);
});

test("other drives and helper failures are rejected", async () => {
  assert.equal(parseStorageJson('{"drive":"D:","totalBytes":100,"freeBytes":50}').reason, "invalid_schema");
  const collector = new StorageCollector({ platform: "win32", run: async () => { throw new Error("failed"); } });
  assert.equal((await collector.get()).reason, "helper_failed");
});
