"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveDesktopConfig } = require("../config.cjs");

test("desktop defaults to the existing /desktop web route", () => {
  const config = resolveDesktopConfig({ env: { ELECTRON_IS_DEV: "1" }, isPackaged: false });
  assert.equal(config.targetUrl, "http://localhost:3000/desktop");
  assert.equal(config.chloeUrl, "http://localhost:3000/chloe");
});

test("target shown offline strips query strings", () => {
  const config = resolveDesktopConfig({ env: { JARVIS_DESKTOP_URL: "https://jarvis.example/desktop?token=hidden" }, isPackaged: true });
  assert.equal(config.publicTargetUrl, "https://jarvis.example/desktop");
});

test("unsafe desktop protocols and routes are rejected", () => {
  assert.throws(() => resolveDesktopConfig({ env: { JARVIS_DESKTOP_URL: "file:///tmp/index.html" } }), /http or https/);
  assert.throws(() => resolveDesktopConfig({ env: { JARVIS_CHLOE_ROUTE: "https://evil.example" } }), /local path/);
});
