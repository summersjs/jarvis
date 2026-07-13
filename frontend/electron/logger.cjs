"use strict";

const fs = require("node:fs");
const path = require("node:path");

function createLogger(logPath, { development = false } = {}) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  return (event, details = "") => {
    const safeEvent = String(event).replace(/[\r\n]/g, " ").slice(0, 120);
    const safeDetails = String(details).replace(/[\r\n]/g, " ").slice(0, 600);
    const line = `${new Date().toISOString()} ${safeEvent}${safeDetails ? ` ${safeDetails}` : ""}\n`;
    fs.appendFileSync(logPath, line, { encoding: "utf8", mode: 0o600 });
    if (development) console.log(`[Jarvis] ${safeEvent}`, safeDetails);
  };
}

module.exports = { createLogger };
