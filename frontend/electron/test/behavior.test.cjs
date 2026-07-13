"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { closeAction, forgeProjectUrl, navigationAction, shortcutAction } = require("../behavior.cjs");

test("closing hides to tray unless Quit is explicit", () => {
  assert.equal(closeAction({ isQuitting: false }), "hide");
  assert.equal(closeAction({ isQuitting: true }), "close");
});

test("Alt+C targets one Jarvis assistant window", () => {
  assert.equal(shortcutAction({ visible: false, focused: false }), "show");
  assert.equal(shortcutAction({ visible: true, focused: false }), "focus");
  assert.equal(shortcutAction({ visible: true, focused: true }), "focus");
});

test("navigation stays on Jarvis and sends trusted external links outside", () => {
  const origin = "http://localhost:3000";
  assert.equal(navigationAction("http://localhost:3000/desktop", origin), "allow");
  assert.equal(navigationAction("https://example.com/help", origin), "external");
  assert.equal(navigationAction("javascript:alert(1)", origin), "block");
  assert.equal(navigationAction("file:///etc/passwd", origin), "block");
});

test("Forge project links are constructed from a validated UUID and approved origin", () => {
  const id = "a7be479f-ff47-44d4-8e3e-37fe377a146c";
  assert.equal(
    forgeProjectUrl(id, "http://localhost:3000"),
    `http://localhost:3000/forge/projects/${id}`,
  );
  assert.throws(() => forgeProjectUrl("../../etc/passwd", "http://localhost:3000"), /UUID/);
  assert.throws(() => forgeProjectUrl(id, "file:///tmp"), /http or https/);
});
