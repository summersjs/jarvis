"use strict";

const https = require("node:https");
const { performance } = require("node:perf_hooks");

const CACHE_MS = 24 * 60 * 60 * 1000;
const PROVIDER = "Cloudflare edge (estimated)";
const DOWNLOAD_BYTES = 8_000_000;
const UPLOAD_BYTES = 2_000_000;

function median(values) {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function requestDownload(bytes, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    let firstByte = null;
    let received = 0;
    const request = https.get(`https://speed.cloudflare.com/__down?bytes=${bytes}`, { headers: { "User-Agent": "JarvisDesktop/1.0", "Cache-Control": "no-store" } }, (response) => {
      firstByte = performance.now();
      if (response.statusCode !== 200) { response.resume(); reject(new Error("download_status")); return; }
      response.on("data", (chunk) => {
        received += chunk.length;
        if (received > bytes + 1024) request.destroy(new Error("download_size"));
      });
      response.on("end", () => {
        const durationMs = performance.now() - started;
        if (bytes > 0 && received < bytes * 0.95) reject(new Error("download_incomplete"));
        else resolve({ bytes: received, durationMs, latencyMs: firstByte - started });
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error("timeout")));
    request.on("error", reject);
  });
}

function requestUpload(bytes, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.alloc(bytes);
    const started = performance.now();
    const request = https.request("https://speed.cloudflare.com/__up", {
      method: "POST",
      headers: { "User-Agent": "JarvisDesktop/1.0", "Content-Type": "application/octet-stream", "Content-Length": bytes },
    }, (response) => {
      response.resume();
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) reject(new Error("upload_status"));
        else resolve({ bytes, durationMs: performance.now() - started });
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error("timeout")));
    request.on("error", reject);
    request.end(payload);
  });
}

async function runEstimatedSpeedTest() {
  const latencyPoints = [];
  for (let index = 0; index < 5; index += 1) latencyPoints.push((await requestDownload(0, 5000)).latencyMs);
  const downloads = [];
  for (let index = 0; index < 2; index += 1) downloads.push(await requestDownload(DOWNLOAD_BYTES));
  const uploads = [];
  for (let index = 0; index < 2; index += 1) uploads.push(await requestUpload(UPLOAD_BYTES));
  const downloadBps = median(downloads.map((point) => (point.bytes * 8 * 1000) / point.durationMs));
  const uploadBps = median(uploads.map((point) => (point.bytes * 8 * 1000) / point.durationMs));
  const latencyMs = median(latencyPoints);
  const jitterMs = latencyPoints.length > 1 ? latencyPoints.slice(1).reduce((sum, point, index) => sum + Math.abs(point - latencyPoints[index]), 0) / (latencyPoints.length - 1) : 0;
  return { downloadMbps: downloadBps / 1_000_000, uploadMbps: uploadBps / 1_000_000, latencyMs, jitterMs };
}

function validateSpeedResult(value, testedAt = new Date().toISOString()) {
  const downloadMbps = Number(value?.downloadMbps);
  const uploadMbps = Number(value?.uploadMbps);
  const latencyMs = Number(value?.latencyMs);
  const jitterMs = Number(value?.jitterMs);
  if (![downloadMbps, uploadMbps, latencyMs, jitterMs].every(Number.isFinite) || downloadMbps <= 0 || uploadMbps <= 0 || latencyMs < 0 || jitterMs < 0 || downloadMbps > 100_000 || uploadMbps > 100_000) return null;
  return {
    available: true,
    estimated: true,
    downloadMbps: Math.round(downloadMbps * 10) / 10,
    uploadMbps: Math.round(uploadMbps * 10) / 10,
    latencyMs: Math.round(latencyMs * 10) / 10,
    jitterMs: Math.round(jitterMs * 10) / 10,
    provider: PROVIDER,
    testedAt,
    status: "success",
    approximateBandwidthMb: 20,
  };
}

class SpeedTestService {
  constructor({ store, runner = runEstimatedSpeedTest, now = () => Date.now(), intervalMs = CACHE_MS } = {}) {
    this.store = store; this.runner = runner; this.now = now; this.intervalMs = intervalMs; this.inFlight = null;
  }
  lastGood() {
    const value = this.store?.get("internetSpeedResult", null);
    return value?.available && value?.status === "success" ? value : null;
  }
  getResult({ autoRun = false } = {}) {
    const previous = this.lastGood();
    const lastAttemptAt = this.store?.get("internetSpeedLastAttemptAt", null);
    const referenceTime = Math.max(previous ? Date.parse(previous.testedAt) : 0, Number.isFinite(Date.parse(lastAttemptAt)) ? Date.parse(lastAttemptAt) : 0);
    const due = !referenceTime || this.now() - referenceTime >= this.intervalMs;
    if (autoRun && due && !this.inFlight) void this.run({ manual: false });
    if (this.inFlight) return previous ? { ...previous, running: true } : { available: false, status: "running", provider: PROVIDER };
    return previous || { available: false, status: "notTested", provider: PROVIDER };
  }
  async run({ manual = true } = {}) {
    if (this.inFlight) return { ...this.getResult(), alreadyRunning: true };
    const previous = this.lastGood();
    const lastAttemptAt = this.store?.get("internetSpeedLastAttemptAt", null);
    const referenceTime = Math.max(previous ? Date.parse(previous.testedAt) : 0, Number.isFinite(Date.parse(lastAttemptAt)) ? Date.parse(lastAttemptAt) : 0);
    if (!manual && referenceTime && this.now() - referenceTime < this.intervalMs) return previous ? { ...previous, cacheHit: true } : { available: false, status: "notTested", provider: PROVIDER, cacheHit: true };
    this.store?.set("internetSpeedLastAttemptAt", new Date(this.now()).toISOString());
    this.inFlight = (async () => {
      try {
        const value = validateSpeedResult(await this.runner(), new Date(this.now()).toISOString());
        if (!value) throw new Error("invalid_provider_result");
        this.store?.set("internetSpeedResult", value);
        return value;
      } catch (error) {
        const reason = error?.message === "invalid_provider_result" ? "invalid_result" : /timeout/i.test(String(error?.message)) ? "timeout" : "test_failed";
        return previous ? { ...previous, refreshFailed: true, refreshFailureReason: reason } : { available: false, status: "failed", provider: PROVIDER, reason };
      } finally {
        this.inFlight = null;
      }
    })();
    return this.inFlight;
  }
}

module.exports = { CACHE_MS, DOWNLOAD_BYTES, PROVIDER, SpeedTestService, UPLOAD_BYTES, median, runEstimatedSpeedTest, validateSpeedResult };
