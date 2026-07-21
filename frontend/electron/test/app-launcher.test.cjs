"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createCustomApp,
  findUnrealEditor,
  launchBuiltIn,
  launchCustomApp,
  normalizeCustomApps,
} = require("../app-launcher.cjs");

test("every built-in desktop shortcut has an explicit launch path", async () => {
  const external = [];
  const opened = [];
  const shell = {
    openExternal: async (target) => external.push(target),
    openPath: async (target) => { opened.push(target); return ""; },
  };
  for (const appId of ["chrome", "vscode"]) {
    assert.deepEqual(await launchBuiltIn(appId, { shell }), { available: true });
  }
  assert.deepEqual(await launchBuiltIn("terminal", { shell, env: { SystemRoot: "C:\\Windows" } }), { available: true });
  assert.deepEqual(external, ["https://www.google.com", "vscode://file/C:/Development/jarvis"]);
  assert.deepEqual(opened, ["C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"]);
  assert.deepEqual(await launchBuiltIn("discord", { shell }), { available: false, reason: "unknown_app" });
});

test("Unreal discovery chooses the newest installed editor", async () => {
  const root = "C:\\Program Files\\Epic Games";
  const executable = `${root}\\UE_5.6\\Engine\\Binaries\\Win64\\UnrealEditor.exe`;
  const entries = ["UE_5.4", "UE_5.6"].map((name) => ({ name, isDirectory: () => true }));
  const found = findUnrealEditor({ env: { ProgramFiles: "C:\\Program Files" }, readdirSync: (candidate) => candidate === root ? entries : [], existsSync: (candidate) => candidate === executable });
  assert.equal(found, executable);
  const launched = [];
  const result = await launchBuiltIn("unreal", {
    shell: {},
    env: { ProgramFiles: "C:\\Program Files" },
    findUnreal: () => executable,
    spawnProcess: async (target, cwd) => launched.push({ target, cwd }),
  });
  assert.deepEqual(result, { available: true });
  assert.deepEqual(launched, [{ target: executable, cwd: `${root}\\UE_5.6\\Engine\\Binaries\\Win64` }]);
});

test("Add App persists only selected Windows executables and launches by opaque id", async () => {
  const created = createCustomApp("C:\\Tools\\Blender.exe", []);
  assert.equal(created.app.label, "Blender");
  assert.equal(normalizeCustomApps(created.apps).length, 1);
  assert.throws(() => createCustomApp("C:\\Tools\\notes.txt", []));

  let opened = "";
  const result = await launchCustomApp(created.app.id, created.apps, { openPath: async (target) => { opened = target; return ""; } });
  assert.deepEqual(result, { available: true });
  assert.equal(opened, "C:\\Tools\\Blender.exe");
  assert.deepEqual(await launchCustomApp("custom_000000000000000000000000", created.apps, { openPath: async () => "" }), { available: false, reason: "unknown_app" });
});
