"use strict";

const path = require("node:path");
const { execFile } = require("node:child_process");

function collectWindowsTelemetry({ scriptPath = path.join(__dirname, "windows-telemetry.ps1"), platform = process.platform } = {}) {
  if (platform !== "win32") return Promise.resolve({});
  return new Promise((resolve) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath], { windowsHide: true, timeout: 15000 }, (error, stdout) => {
      if (error) return resolve({});
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result && typeof result === "object" ? result : {});
      } catch {
        resolve({});
      }
    });
  });
}

module.exports = { collectWindowsTelemetry };
