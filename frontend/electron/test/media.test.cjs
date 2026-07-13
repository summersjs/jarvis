"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { MEDIA_ACTIONS, MediaService, parseMediaResult, validateMusicUrl } = require("../media.cjs");

test("media actions and music URL are narrowly allowlisted", async () => {
  assert.deepEqual([...MEDIA_ACTIONS], ["getSession", "playPause", "play", "pause", "next", "previous", "volumeUp", "volumeDown", "mute", "open"]);
  assert.equal(validateMusicUrl("https://music.youtube.com/"), "https://music.youtube.com/");
  assert.equal(validateMusicUrl("https://evil.example/"), null);
  const service = new MediaService({ platform: "win32", run: async () => "{}" });
  await assert.rejects(() => service.execute("powershell Get-Secret"), /Unsupported media action/);
});

test("YouTube Music session metadata validates and stale failures are marked", async () => {
  let calls = 0;
  const service = new MediaService({ platform: "win32", now: () => calls * 5000, run: async () => {
    calls += 1;
    if (calls === 1) return JSON.stringify({ available: true, source: "YouTube Music", sourceAppId: "Chrome._crx_cinhimbnkkghhklpknlkffjgod", title: "Passive", artist: "A Perfect Circle", album: "eMOTIVe", playbackStatus: "Playing", collectedAt: "2026-07-13T12:00:00Z" });
    const error = new Error("failed"); error.killed = true; throw error;
  }});
  const live = await service.getSession({ force: true });
  assert.equal(live.title, "Passive");
  const stale = await service.getSession({ force: true });
  assert.equal(stale.stale, true);
  assert.equal(stale.staleReason, "timeout");
});

test("no-session response is explicit and helper prefers YouTube sessions", () => {
  assert.equal(parseMediaResult('{"available":false,"reason":"no_session"}', "getSession").reason, "no_session");
  const helper = fs.readFileSync(path.join(__dirname, "..", "windows-media.ps1"), "utf8");
  assert.match(helper, /GetSessions/);
  assert.match(helper, /youtube\|cinhimbnkkghhklpknlkffjgod/i);
});
