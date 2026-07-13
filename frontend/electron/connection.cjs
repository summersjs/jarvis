"use strict";

const http = require("node:http");
const https = require("node:https");

function checkReachable(targetUrl, timeoutMs = 3500) {
  return new Promise((resolve) => {
    const url = new URL(targetUrl);
    const client = url.protocol === "https:" ? https : http;
    const request = client.get(url, { timeout: timeoutMs }, (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 500);
    });
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

class ConnectionMonitor {
  constructor({ check, onOnline, onOffline, schedule = setTimeout, cancel = clearTimeout, maxDelayMs = 30000 }) {
    this.check = check;
    this.onOnline = onOnline;
    this.onOffline = onOffline;
    this.schedule = schedule;
    this.cancel = cancel;
    this.maxDelayMs = maxDelayMs;
    this.attempt = 0;
    this.timer = null;
    this.stopped = true;
    this.running = false;
  }

  start() {
    this.stopped = false;
    return this.retryNow();
  }

  stop() {
    this.stopped = true;
    if (this.timer) this.cancel(this.timer);
    this.timer = null;
  }

  async retryNow() {
    if (this.stopped || this.running) return false;
    if (this.timer) this.cancel(this.timer);
    this.timer = null;
    this.running = true;
    const online = await this.check();
    this.running = false;
    if (this.stopped) return online;

    if (online) {
      this.attempt = 0;
      await this.onOnline();
      return true;
    }

    this.attempt += 1;
    const delay = Math.min(1000 * 2 ** (this.attempt - 1), this.maxDelayMs);
    await this.onOffline({ attempt: this.attempt, nextRetryMs: delay });
    this.timer = this.schedule(() => this.retryNow(), delay);
    return false;
  }
}

module.exports = {
  checkReachable,
  ConnectionMonitor,
};
