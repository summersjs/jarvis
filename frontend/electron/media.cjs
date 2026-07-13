"use strict";

const path = require("node:path");
const { execFile } = require("node:child_process");

const MEDIA_ACTIONS = new Set(["playPause", "nextTrack", "previousTrack", "volumeUp", "volumeDown", "mute", "getNowPlaying", "openYouTubeMusic"]);

function runMediaAction(action, { scriptPath = path.join(__dirname, "windows-media.ps1"), musicUrl = "https://music.youtube.com/", platform = process.platform } = {}) {
  if (!MEDIA_ACTIONS.has(action)) return Promise.reject(new TypeError("Unsupported media command."));
  if (platform !== "win32") return Promise.resolve({ available: false, reason: "Windows media controls are available only in the Windows Electron build." });
  return new Promise((resolve) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath, "-Action", action, "-MusicUrl", musicUrl], { windowsHide: true, timeout: 8000 }, (error, stdout) => {
      if (error) return resolve({ available: false, reason: "Windows media command failed." });
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch {
        resolve({ available: false, reason: "Windows media helper returned invalid data." });
      }
    });
  });
}

module.exports = { MEDIA_ACTIONS, runMediaAction };
