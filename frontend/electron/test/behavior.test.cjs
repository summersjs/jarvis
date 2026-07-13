"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { closeAction, navigationAction, shortcutAction } = require("../behavior.cjs");

test("closing hides to tray unless Quit is explicit", () => {
  assert.equal(closeAction({ isQuitting: false }), "hide");
  assert.equal(closeAction({ isQuitting: true }), "close");
});

test("Alt+C restores, focuses, then opens Chloe", () => {
  assert.equal(shortcutAction({ visible: false, focused: false }), "show");
  assert.equal(shortcutAction({ visible: true, focused: false }), "focus");
  assert.equal(shortcutAction({ visible: true, focused: true }), "open-chloe");
});

test("navigation stays on Jarvis and sends trusted external links outside", () => {
  const origin = "http://localhost:3000";
  assert.equal(navigationAction("http://localhost:3000/desktop", origin), "allow");
  assert.equal(navigationAction("https://example.com/help", origin), "external");
  assert.equal(navigationAction("javascript:alert(1)", origin), "block");
  assert.equal(navigationAction("file:///etc/passwd", origin), "block");
});
