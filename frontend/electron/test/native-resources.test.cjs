"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const packageJson = require("../../package.json");
const { resolveWindowsHelper } = require("../native-resources.cjs");

test("packaged helpers resolve outside app.asar", () => {
  const result = resolveWindowsHelper("windows-media.ps1", {
    isPackaged: true,
    resourcesPath: "C:\\Jarvis\\resources",
    sourceDir: "ignored",
  });
  assert.equal(result, path.join("C:\\Jarvis\\resources", "native", "windows-media.ps1"));
  assert.equal(result.includes("app.asar"), false);
});

test("development helpers resolve beside Electron source", () => {
  assert.equal(resolveWindowsHelper("windows-storage.ps1", {
    isPackaged: false,
    resourcesPath: "ignored",
    sourceDir: "C:\\Development\\jarvis\\frontend\\electron",
  }), path.join("C:\\Development\\jarvis\\frontend\\electron", "windows-storage.ps1"));
});

test("helper names are allowlisted", () => {
  assert.throws(() => resolveWindowsHelper("anything.ps1", {
    isPackaged: true,
    resourcesPath: "C:\\Jarvis\\resources",
  }), /Unsupported Windows helper/);
});

test("electron-builder copies every Windows helper as an external resource", () => {
  const resource = packageJson.build.extraResources.find((entry) => entry.to === "native");
  assert.ok(resource);
  assert.deepEqual(new Set(resource.filter), new Set([
    "windows-media.ps1",
    "windows-network.ps1",
    "windows-storage.ps1",
  ]));
});
