"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");
const { checkReachable } = require("./connection.cjs");
const { resolveDesktopConfig } = require("./config.cjs");

const projectRoot = path.resolve(__dirname, "..");
const config = resolveDesktopConfig({ env: { ...process.env, ELECTRON_IS_DEV: "1" }, isPackaged: false });
let frontend = null;
let electron = null;
let stopping = false;

async function main() {
  if (!(await checkReachable(config.targetUrl, 1500))) {
    console.log(`[Jarvis] No frontend at ${config.publicTargetUrl}; starting Next.js.`);
    frontend = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev", "--", "--hostname", "127.0.0.1"], {
      cwd: projectRoot,
      stdio: "inherit",
      windowsHide: true,
    });
    await waitForFrontend();
  } else {
    console.log(`[Jarvis] Reusing frontend at ${config.publicTargetUrl}.`);
  }

  const electronBinary = require("electron");
  electron = spawn(electronBinary, [projectRoot], {
    cwd: projectRoot,
    env: { ...process.env, ELECTRON_IS_DEV: "1", JARVIS_DESKTOP_URL: config.targetUrl },
    stdio: "inherit",
  });
  electron.on("exit", (code) => shutdown(code || 0));
}

async function waitForFrontend() {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (frontend?.exitCode !== null) throw new Error("The frontend exited before Electron could connect.");
    if (await checkReachable(config.targetUrl, 1500)) return;
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  throw new Error(`Timed out waiting for ${config.publicTargetUrl}`);
}

function shutdown(code) {
  if (stopping) return;
  stopping = true;
  if (electron && electron.exitCode === null) electron.kill();
  if (frontend && frontend.exitCode === null) frontend.kill();
  process.exitCode = code;
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
main().catch((error) => {
  console.error(`[Jarvis] Desktop startup failed: ${error.message}`);
  shutdown(1);
});
