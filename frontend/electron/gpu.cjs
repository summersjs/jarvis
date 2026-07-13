"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");

const GPU_QUERY_ARGS = Object.freeze([
  "--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,driver_version",
  "--format=csv,noheader,nounits",
]);
const CACHE_MS = 4000;

function nvidiaCandidates(env = process.env) {
  const names = [];
  for (const directory of String(env.PATH || "").split(path.delimiter).filter(Boolean)) names.push(path.join(directory, "nvidia-smi.exe"));
  for (const root of [env.SystemRoot, env.WINDIR]) if (root) names.push(path.join(root, "System32", "nvidia-smi.exe"));
  for (const root of [env.ProgramFiles, env.ProgramW6432]) if (root) names.push(path.join(root, "NVIDIA Corporation", "NVSMI", "nvidia-smi.exe"));
  return [...new Set(names.map((item) => path.normalize(item)))];
}

function locateNvidiaSmi({ env = process.env, exists = fs.existsSync } = {}) {
  return nvidiaCandidates(env).find((candidate) => exists(candidate)) || null;
}

function optionalNumber(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized || /^(n\/a|not supported|\[not supported\]|-)$/i.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function parseNvidiaCsv(stdout, collectedAt = new Date().toISOString()) {
  const line = String(stdout || "").trim().split(/\r?\n/).find(Boolean);
  if (!line) return { available: false, provider: "nvidia-smi", reason: "malformed_output", collectedAt };
  const fields = line.split(",").map((field) => field.trim());
  if (fields.length < 7 || !fields[0]) return { available: false, provider: "nvidia-smi", reason: "malformed_output", collectedAt };
  const utilizationPercent = optionalNumber(fields[1]);
  const memoryUsedMb = optionalNumber(fields[2]);
  const memoryTotalMb = optionalNumber(fields[3]);
  const temperatureC = optionalNumber(fields[4]);
  const powerWatts = optionalNumber(fields[5]);
  if (utilizationPercent === null || memoryUsedMb === null || memoryTotalMb === null || memoryTotalMb <= 0) {
    return { available: false, provider: "nvidia-smi", reason: "missing_required_fields", collectedAt };
  }
  return {
    available: true,
    provider: "nvidia-smi",
    name: fields[0].slice(0, 160),
    utilizationPercent: Math.max(0, Math.min(100, utilizationPercent)),
    memoryUsedMb: Math.max(0, memoryUsedMb),
    memoryTotalMb,
    temperatureC,
    powerWatts,
    driverVersion: fields[6].slice(0, 80) || null,
    collectedAt,
  };
}

function executeFile(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(executable, args, { windowsHide: true, shell: false, timeout: 5000, maxBuffer: 64 * 1024, ...options }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

class GpuCollector {
  constructor({ platform = process.platform, locate = locateNvidiaSmi, run = executeFile, now = () => Date.now() } = {}) {
    this.platform = platform;
    this.locate = locate;
    this.run = run;
    this.now = now;
    this.cached = null;
  }

  async get({ force = false } = {}) {
    const timestamp = this.now();
    if (!force && this.cached && timestamp - this.cached.time < CACHE_MS) return { ...this.cached.value, cacheHit: true };
    if (this.platform !== "win32") return this.store({ available: false, provider: "nvidia-smi", reason: "unsupported_platform", collectedAt: new Date(timestamp).toISOString() }, timestamp);
    const executable = this.locate();
    if (!executable) return this.store({ available: false, provider: "nvidia-smi", reason: "executable_not_found", collectedAt: new Date(timestamp).toISOString() }, timestamp);
    try {
      const stdout = await this.run(executable, [...GPU_QUERY_ARGS]);
      return this.store(parseNvidiaCsv(stdout, new Date(this.now()).toISOString()), timestamp);
    } catch (error) {
      const reason = error?.killed || error?.code === "ETIMEDOUT" ? "timeout" : "process_failed";
      return this.store({ available: false, provider: "nvidia-smi", reason, collectedAt: new Date(this.now()).toISOString() }, timestamp);
    }
  }

  store(value, time) {
    this.cached = { value, time };
    return { ...value, cacheHit: false };
  }
}

module.exports = { CACHE_MS, GPU_QUERY_ARGS, GpuCollector, locateNvidiaSmi, nvidiaCandidates, parseNvidiaCsv };
