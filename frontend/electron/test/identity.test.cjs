"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("active Electron labels and configuration use Jarvis", () => {
  for (const file of ["main.cjs", "config.cjs", "preload.cjs"]) {
    const contents = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    assert.doesNotMatch(contents, /chloe/i);
  }
});

test("legacy browser route redirects to canonical Jarvis", () => {
  const route = fs.readFileSync(path.join(__dirname, "..", "..", "src", "app", "chloe", "page.tsx"), "utf8");
  assert.match(route, /redirect\("\/jarvis"\)/);
});
