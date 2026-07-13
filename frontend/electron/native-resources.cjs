"use strict";

const path = require("node:path");

const WINDOWS_HELPERS = new Set([
  "windows-media.ps1",
  "windows-network.ps1",
  "windows-storage.ps1",
]);

function resolveWindowsHelper(name, { isPackaged, resourcesPath, sourceDir } = {}) {
  if (!WINDOWS_HELPERS.has(name)) throw new TypeError("Unsupported Windows helper.");
  if (isPackaged) {
    if (!resourcesPath) throw new TypeError("Packaged resource path is required.");
    return path.join(resourcesPath, "native", name);
  }
  if (!sourceDir) throw new TypeError("Source directory is required.");
  return path.join(sourceDir, name);
}

module.exports = { resolveWindowsHelper, WINDOWS_HELPERS };
