"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const BUILTIN_TARGETS = Object.freeze({
  chrome: "https://www.google.com",
  vscode: "vscode://file/C:/Development/jarvis",
});

async function launchBuiltIn(appId, { shell, env = process.env, spawnProcess = spawnDetached, findUnreal = findUnrealEditor } = {}) {
  if (appId === "unreal") {
    const executable = findUnreal({ env });
    if (!executable) return { available: false, reason: "unreal_not_found" };
    try {
      await spawnProcess(executable, path.win32.dirname(executable));
      return { available: true };
    } catch {
      return { available: false, reason: "launch_failed" };
    }
  }
  if (appId === "terminal") {
    const executable = path.win32.join(env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const error = await shell.openPath(executable);
    return error ? { available: false, reason: "launch_failed" } : { available: true };
  }
  const target = BUILTIN_TARGETS[appId];
  if (!target) return { available: false, reason: "unknown_app" };
  await shell.openExternal(target);
  return { available: true };
}

function spawnDetached(executable, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [], { cwd, detached: true, shell: false, stdio: "ignore", windowsHide: false });
    child.once("error", reject);
    child.once("spawn", () => { child.unref(); resolve(); });
  });
}

function findUnrealEditor({ env = process.env, existsSync = fs.existsSync, readdirSync = fs.readdirSync } = {}) {
  const roots = [
    path.win32.join(env.ProgramFiles || "C:\\Program Files", "Epic Games"),
    path.win32.join(env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Epic Games"),
  ];
  for (const root of roots) {
    let installs = [];
    try {
      installs = readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^UE_[0-9.]+$/i.test(entry.name))
        .map((entry) => entry.name)
        .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
    } catch {
      continue;
    }
    for (const install of installs) {
      const executable = path.win32.join(root, install, "Engine", "Binaries", "Win64", "UnrealEditor.exe");
      if (existsSync(executable)) return executable;
    }
  }
  return null;
}

function normalizeCustomApps(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.flatMap((item) => {
    const id = String(item?.id || "");
    const label = String(item?.label || "").trim().slice(0, 60);
    const executable = String(item?.executable || "");
    if (!/^custom_[a-f0-9]{24,64}$/i.test(id) || !label || !isAllowedExecutable(executable) || seen.has(id)) return [];
    seen.add(id);
    return [{ id, label, executable }];
  }).slice(0, 12);
}

function createCustomApp(executable, existing = []) {
  if (!isAllowedExecutable(executable)) throw new Error("Choose a Windows application or shortcut (.exe or .lnk). ");
  const apps = normalizeCustomApps(existing);
  const duplicate = apps.find((item) => item.executable.toLowerCase() === executable.toLowerCase());
  if (duplicate) return { app: duplicate, apps };
  const app = {
    id: `custom_${crypto.randomBytes(16).toString("hex")}`,
    label: path.win32.basename(executable, path.win32.extname(executable)).slice(0, 60),
    executable,
  };
  return { app, apps: [...apps, app].slice(-12) };
}

async function launchCustomApp(appId, apps, shellApi) {
  const app = normalizeCustomApps(apps).find((item) => item.id === appId);
  if (!app) return { available: false, reason: "unknown_app" };
  const error = await shellApi.openPath(app.executable);
  return error ? { available: false, reason: "launch_failed" } : { available: true };
}

function isAllowedExecutable(value) {
  return typeof value === "string" && /^[a-z]:\\/i.test(value) && /\.(?:exe|lnk)$/i.test(value) && value.length <= 1024;
}

module.exports = {
  BUILTIN_TARGETS,
  createCustomApp,
  findUnrealEditor,
  isAllowedExecutable,
  launchBuiltIn,
  launchCustomApp,
  normalizeCustomApps,
  spawnDetached,
};
