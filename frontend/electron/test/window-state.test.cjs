"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { compactBounds, visibleBounds } = require("../window-state.cjs");

const primary = { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1080 } };

test("saved bounds remain on their display", () => {
  assert.deepEqual(visibleBounds({ x: 100, y: 80, width: 1400, height: 800, displayId: 1 }, [primary], primary), { x: 100, y: 80, width: 1400, height: 800 });
});

test("compact Jarvis opens at the bottom right and stays on screen", () => {
  const display = { workArea: { x: 0, y: 0, width: 1920, height: 1040 } };
  assert.deepEqual(compactBounds({}, display), { x: 1436, y: 296, width: 460, height: 720 });
  const clamped = compactBounds({ x: 5000, y: 5000, width: 460, height: 720 }, display);
  assert.equal(clamped.x, 1460);
  assert.equal(clamped.y, 320);
});

test("off-screen windows return to the primary display", () => {
  const bounds = visibleBounds({ x: 6000, y: -4000, width: 1500, height: 900, displayId: 99 }, [primary], primary);
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 1920);
  assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 1080);
});
