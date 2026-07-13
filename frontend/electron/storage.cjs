"use strict";

const path = require("node:path");
const { execFile } = require("node:child_process");

const ALLOWED_DRIVES = new Set(["C:"]);
const CACHE_MS = 60_000;

function executeStorageHelper(scriptPath) {
  return new Promise((resolve, reject) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath], {
      windowsHide: true, shell: false, timeout: 7000, maxBuffer: 64 * 1024,
    }, (error, stdout) => error ? reject(error) : resolve(stdout));
  });
}

function parseStorageJson(stdout, collectedAt = new Date().toISOString()) {
  let data;
  try { data = JSON.parse(String(stdout).trim()); } catch { return unavailable("malformed_output", collectedAt); }
  const drive = String(data.drive || "").toUpperCase();
  const totalBytes = Number(data.totalBytes);
  const freeBytes = Number(data.freeBytes);
  if (!ALLOWED_DRIVES.has(drive) || !Number.isFinite(totalBytes) || !Number.isFinite(freeBytes) || totalBytes <= 0 || freeBytes < 0 || freeBytes > totalBytes) {
    return unavailable("invalid_schema", collectedAt);
  }
  const usedBytes = totalBytes - freeBytes;
  return {
    available: true,
    provider: "Win32_LogicalDisk",
    drive,
    filesystem: typeof data.filesystem === "string" ? data.filesystem.slice(0, 32) : null,
    volumeLabel: typeof data.volumeLabel === "string" ? data.volumeLabel.slice(0, 80) : null,
    totalBytes,
    usedBytes,
    freeBytes,
    usedPercent: Math.round((usedBytes / totalBytes) * 1000) / 10,
    collectedAt,
  };
}

function unavailable(reason, collectedAt = new Date().toISOString()) {
  return { available: false, provider: "Win32_LogicalDisk", reason, collectedAt };
}

class StorageCollector {
  constructor({ platform = process.platform, run = executeStorageHelper, scriptPath = path.join(__dirname, "windows-storage.ps1"), now = () => Date.now() } = {}) {
    this.platform = platform; this.run = run; this.scriptPath = scriptPath; this.now = now; this.cached = null;
  }
  async get() {
    const time = this.now();
    if (this.cached && time - this.cached.time < CACHE_MS) return { ...this.cached.value, cacheHit: true };
    let value;
    if (this.platform !== "win32") value = unavailable("unsupported_platform", new Date(time).toISOString());
    else {
      try { value = parseStorageJson(await this.run(this.scriptPath), new Date(this.now()).toISOString()); }
      catch (error) { value = unavailable(error?.killed ? "timeout" : "helper_failed", new Date(this.now()).toISOString()); }
    }
    this.cached = { time, value };
    return { ...value, cacheHit: false };
  }
}

module.exports = { ALLOWED_DRIVES, CACHE_MS, StorageCollector, parseStorageJson };
