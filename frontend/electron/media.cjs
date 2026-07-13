"use strict";

const path = require("node:path");
const { execFile } = require("node:child_process");

const MEDIA_ACTIONS = new Set(["getSession", "playPause", "play", "pause", "next", "previous", "volumeUp", "volumeDown", "mute", "open"]);
const CACHE_MS = 4000;

function executeMediaHelper(scriptPath, action, musicUrl) {
  return new Promise((resolve, reject) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath, "-Action", action, "-MusicUrl", musicUrl], {
      windowsHide: true, shell: false, timeout: 9000, maxBuffer: 128 * 1024,
    }, (error, stdout) => error ? reject(error) : resolve(stdout));
  });
}

function validateMusicUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "music.youtube.com" && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}

function parseMediaResult(stdout, action) {
  let data;
  try { data = JSON.parse(String(stdout).trim()); } catch { return { available: false, provider: "Windows GSMTC", reason: "malformed_output" }; }
  if (!data || typeof data.available !== "boolean") return { available: false, provider: "Windows GSMTC", reason: "invalid_schema" };
  if (action !== "getSession") return { available: data.available, provider: String(data.provider || "Windows GSMTC").slice(0, 80), action, reason: data.reason ? String(data.reason).slice(0, 100) : undefined, opened: data.opened ? String(data.opened).slice(0, 40) : undefined };
  if (!data.available) return { available: false, provider: "Windows GSMTC", reason: String(data.reason || "no_session").slice(0, 100), collectedAt: validDate(data.collectedAt) };
  return {
    available: true,
    provider: "Windows GSMTC",
    source: String(data.source || "Windows Media").slice(0, 160),
    sourceAppId: String(data.sourceAppId || "").slice(0, 220) || null,
    title: String(data.title || "").slice(0, 300) || null,
    artist: String(data.artist || "").slice(0, 300) || null,
    album: String(data.album || "").slice(0, 300) || null,
    artworkUrl: null,
    playbackStatus: ["playing", "paused", "stopped", "closed", "changing"].includes(String(data.playbackStatus).toLowerCase()) ? String(data.playbackStatus).toLowerCase() : "unknown",
    isPlaying: String(data.playbackStatus).toLowerCase() === "playing",
    collectedAt: validDate(data.collectedAt),
    stale: false,
  };
}

function validDate(value) {
  return Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : new Date().toISOString();
}

class MediaService {
  constructor({ platform = process.platform, run = executeMediaHelper, scriptPath = path.join(__dirname, "windows-media.ps1"), musicUrl = "https://music.youtube.com/", now = () => Date.now() } = {}) {
    this.platform = platform; this.run = run; this.scriptPath = scriptPath; this.musicUrl = validateMusicUrl(musicUrl) || "https://music.youtube.com/"; this.now = now;
    this.cached = null;
  }
  setMusicUrl(value) { const validated = validateMusicUrl(value); if (!validated) throw new TypeError("Unsupported music URL."); this.musicUrl = validated; }
  async getSession({ force = false } = {}) {
    const time = this.now();
    if (!force && this.cached && time - this.cached.time < CACHE_MS) return { ...this.cached.value, cacheHit: true };
    if (this.platform !== "win32") return { available: false, provider: "Windows GSMTC", reason: "unsupported_platform", collectedAt: new Date(time).toISOString() };
    try {
      const value = parseMediaResult(await this.run(this.scriptPath, "getSession", this.musicUrl), "getSession");
      this.cached = { time, value };
      return { ...value, cacheHit: false };
    } catch (error) {
      const reason = error?.killed ? "timeout" : "helper_failed";
      if (this.cached?.value?.available) return { ...this.cached.value, stale: true, staleReason: reason, cacheHit: false };
      return { available: false, provider: "Windows GSMTC", reason, collectedAt: new Date(this.now()).toISOString() };
    }
  }
  async execute(action) {
    if (!MEDIA_ACTIONS.has(action) || action === "getSession") throw new TypeError("Unsupported media action.");
    if (this.platform !== "win32") return { available: false, provider: "Windows GSMTC", reason: "unsupported_platform" };
    const value = parseMediaResult(await this.run(this.scriptPath, action, this.musicUrl), action);
    if (["playPause", "play", "pause", "next", "previous"].includes(action)) this.cached = null;
    return value;
  }
}

module.exports = { CACHE_MS, MEDIA_ACTIONS, MediaService, parseMediaResult, validateMusicUrl };
