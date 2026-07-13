"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { visibleBounds } = require("../window-state.cjs");

const primary = { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1080 } };

test("saved bounds remain on their display", () => {
  assert.deepEqual(visibleBounds({ x: 100, y: 80, width: 1400, height: 800, displayId: 1 }, [primary], primary), { x: 100, y: 80, width: 1400, height: 800 });
});

test("off-screen windows return to the primary display", () => {
  const bounds = visibleBounds({ x: 6000, y: -4000, width: 1500, height: 900, displayId: 99 }, [primary], primary);
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 1920);
  assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 1080);
});
