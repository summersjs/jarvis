"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_BOUNDS = { width: 1500, height: 940 };

class JsonStateStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = this.read();
    this.migrateLegacyKeys();
  }

  read() {
    try {
      return JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    } catch {
      return {};
    }
  }

  get(key, fallback) {
    return this.data[key] === undefined ? fallback : this.data[key];
  }

  set(key, value) {
    this.data[key] = value;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, this.filePath);
  }

  migrateLegacyKeys() {
    const migrations = {
      chloeResponseMode: "jarvisResponseMode",
      chloeAlwaysOnTop: "jarvisAlwaysOnTop",
      chloeWindowBounds: "jarvisWindowBounds",
    };
    let changed = false;
    for (const [legacy, current] of Object.entries(migrations)) {
      if (this.data[current] === undefined && this.data[legacy] !== undefined) this.data[current] = this.data[legacy];
      if (this.data[legacy] !== undefined) {
        delete this.data[legacy];
        changed = true;
      }
    }
    if (changed) this.write();
  }

  write() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, this.filePath);
  }
}

function visibleBounds(saved = {}, displays = [], primaryDisplay = displays[0]) {
  const fallbackArea = primaryDisplay?.workArea || { x: 0, y: 0, width: 1920, height: 1080 };
  const matchingDisplay = displays.find((display) => String(display.id) === String(saved.displayId));
  const intersects = displays.find((display) => intersectionArea(saved, display.workArea) >= 10000);
  const area = (matchingDisplay || intersects || primaryDisplay)?.workArea || fallbackArea;
  const width = clamp(Number(saved.width) || DEFAULT_BOUNDS.width, 960, area.width);
  const height = clamp(Number(saved.height) || DEFAULT_BOUNDS.height, 640, area.height);
  const requestedX = Number.isFinite(Number(saved.x)) ? Number(saved.x) : area.x + Math.round((area.width - width) / 2);
  const requestedY = Number.isFinite(Number(saved.y)) ? Number(saved.y) : area.y + Math.round((area.height - height) / 2);
  return {
    x: clamp(requestedX, area.x, area.x + area.width - width),
    y: clamp(requestedY, area.y, area.y + area.height - height),
    width,
    height,
  };
}

function compactBounds(saved = {}, display) {
  const area = display?.workArea || { x: 0, y: 0, width: 1920, height: 1080 };
  const width = clamp(Number(saved.width) || 460, 380, Math.min(720, area.width));
  const height = clamp(Number(saved.height) || 720, 520, Math.min(900, area.height));
  const defaultX = area.x + area.width - width - 24;
  const defaultY = area.y + area.height - height - 24;
  return {
    x: clamp(Number.isFinite(Number(saved.x)) ? Number(saved.x) : defaultX, area.x, area.x + area.width - width),
    y: clamp(Number.isFinite(Number(saved.y)) ? Number(saved.y) : defaultY, area.y, area.y + area.height - height),
    width,
    height,
  };
}

function intersectionArea(bounds, area) {
  if (![bounds.x, bounds.y, bounds.width, bounds.height].every((value) => Number.isFinite(Number(value)))) return 0;
  const width = Math.max(0, Math.min(Number(bounds.x) + Number(bounds.width), area.x + area.width) - Math.max(Number(bounds.x), area.x));
  const height = Math.max(0, Math.min(Number(bounds.y) + Number(bounds.height), area.y + area.height) - Math.max(Number(bounds.y), area.y));
  return width * height;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

module.exports = {
  DEFAULT_BOUNDS,
  JsonStateStore,
  compactBounds,
  visibleBounds,
};
