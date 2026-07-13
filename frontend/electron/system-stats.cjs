"use strict";

const os = require("node:os");

function cpuSnapshot(osModule = os) {
  return osModule.cpus().reduce((summary, cpu) => {
    const total = Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
    return { idle: summary.idle + cpu.times.idle, total: summary.total + total };
  }, { idle: 0, total: 0 });
}

async function collectSystemStats({ osModule = os, delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)) } = {}) {
  const start = cpuSnapshot(osModule);
  await delay(300);
  const end = cpuSnapshot(osModule);
  const totalDelta = end.total - start.total;
  const idleDelta = end.idle - start.idle;
  const cpuUsage = totalDelta > 0 ? Math.round((1 - idleDelta / totalDelta) * 100) : 0;
  const ramUsage = Math.round((1 - osModule.freemem() / osModule.totalmem()) * 100);
  const uptimeMinutes = Math.floor(osModule.uptime() / 60);
  return { cpuUsage, ramUsage, uptime: `${String(Math.floor(uptimeMinutes / 60)).padStart(2, "0")}:${String(uptimeMinutes % 60).padStart(2, "0")}` };
}

module.exports = { collectSystemStats, cpuSnapshot };
