"use strict";

const http = require("node:http");
const path = require("node:path");
const { execFile } = require("node:child_process");

const NETWORK_CACHE_MS = 20_000;
const REACHABILITY_CACHE_MS = 5 * 60_000;
const CONNECT_TEST_URL = "http://www.msftconnecttest.com/connecttest.txt";

function executeFile(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(executable, args, { windowsHide: true, shell: false, timeout: 7000, maxBuffer: 128 * 1024, ...options }, (error, stdout) => error ? reject(error) : resolve(stdout));
  });
}

function parseInterfaceJson(stdout) {
  let data;
  try { data = JSON.parse(String(stdout).trim()); } catch { return null; }
  if (!data || typeof data !== "object" || typeof data.connected !== "boolean") return null;
  if (!data.connected) return { connected: false };
  return {
    connected: true,
    interfaceName: String(data.interfaceName || "").slice(0, 120) || "Windows network",
    description: String(data.description || "").slice(0, 200) || null,
    ipv4Address: /^(?:\d{1,3}\.){3}\d{1,3}$/.test(String(data.ipv4Address || "")) ? String(data.ipv4Address) : null,
    linkSpeedMbps: finiteOrNull(data.linkSpeedMbps),
  };
}

function parseNetshWlan(stdout) {
  const text = String(stdout || "");
  const lower = text.toLowerCase();
  if (/location (?:services|permission)|access is denied|location permission/i.test(text)) {
    return { wifiDetected: true, ssid: null, permissionStatus: "hiddenByWindows", connected: /state\s*:\s*connected/i.test(text), linkSpeedMbps: null };
  }
  if (/there is no wireless interface|wireless autoconfig service.*not running/i.test(text)) {
    return { wifiDetected: false, ssid: null, permissionStatus: "notApplicable", connected: false, linkSpeedMbps: null };
  }
  const state = text.match(/^\s*State\s*:\s*(.+)$/im)?.[1]?.trim().toLowerCase();
  const ssid = text.match(/^\s*SSID\s*:\s*(.+)$/im)?.[1]?.trim() || null;
  const receiveRate = finiteOrNull(text.match(/^\s*Receive rate \(Mbps\)\s*:\s*(.+)$/im)?.[1]);
  return {
    wifiDetected: /name\s*:|description\s*:/i.test(lower),
    connected: state === "connected",
    ssid: ssid && ssid.length <= 128 ? ssid : null,
    permissionStatus: ssid ? "available" : "unavailable",
    linkSpeedMbps: receiveRate,
  };
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function checkInternetReachability({ url = CONNECT_TEST_URL, timeoutMs = 3000, request = http.get } = {}) {
  return new Promise((resolve) => {
    const req = request(url, { headers: { "User-Agent": "JarvisDesktop/1.0" } }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { if (body.length < 128) body += chunk; });
      response.on("end", () => resolve(response.statusCode === 200 && body.trim() === "Microsoft Connect Test"));
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(false); });
    req.on("error", () => resolve(false));
  });
}

class NetworkCollector {
  constructor({
    platform = process.platform,
    run = executeFile,
    reachability = checkInternetReachability,
    scriptPath = path.join(__dirname, "windows-network.ps1"),
    now = () => Date.now(),
  } = {}) {
    this.platform = platform; this.run = run; this.reachability = reachability; this.scriptPath = scriptPath; this.now = now;
    this.cached = null; this.reachabilityCache = null;
  }

  async get({ force = false } = {}) {
    const time = this.now();
    if (!force && this.cached && time - this.cached.time < NETWORK_CACHE_MS) return { ...this.cached.value, cacheHit: true };
    if (this.platform !== "win32") return this.store(unavailable("unsupported_platform", time), time);
    try {
      const [interfaceOutput, wlanOutput] = await Promise.all([
        this.run("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", this.scriptPath]),
        this.run("netsh.exe", ["wlan", "show", "interfaces"]).catch(() => ""),
      ]);
      const network = parseInterfaceJson(interfaceOutput);
      if (!network) return this.store(unavailable("malformed_output", time), time);
      if (!network.connected) return this.store({ available: true, provider: "Windows network APIs", connected: false, status: "offline", interfaceType: null, interfaceName: null, ssid: null, ssidPermissionStatus: "notApplicable", linkSpeedMbps: null, ipv4Address: null, internetReachable: false, collectedAt: new Date(time).toISOString() }, time);
      const wlan = parseNetshWlan(wlanOutput);
      const interfaceType = wlan.wifiDetected && (wlan.connected || /wi-?fi|wireless/i.test(network.interfaceName + network.description)) ? "wifi" : /ethernet/i.test(network.interfaceName + network.description) ? "ethernet" : "other";
      const internetReachable = await this.getReachability(time, force);
      return this.store({
        available: true,
        provider: "Get-NetIPConfiguration + netsh wlan",
        connected: true,
        status: internetReachable ? "connected" : "localOnly",
        interfaceType,
        interfaceName: network.interfaceName,
        ssid: interfaceType === "wifi" ? wlan.ssid : null,
        ssidPermissionStatus: interfaceType === "wifi" ? wlan.permissionStatus : "notApplicable",
        linkSpeedMbps: interfaceType === "wifi" ? (wlan.linkSpeedMbps ?? network.linkSpeedMbps) : network.linkSpeedMbps,
        ipv4Address: network.ipv4Address,
        internetReachable,
        collectedAt: new Date(this.now()).toISOString(),
      }, time);
    } catch (error) {
      return this.store(unavailable(error?.killed ? "timeout" : "helper_failed", this.now()), time);
    }
  }

  async getReachability(time, force) {
    if (!force && this.reachabilityCache && time - this.reachabilityCache.time < REACHABILITY_CACHE_MS) return this.reachabilityCache.value;
    const value = await this.reachability();
    this.reachabilityCache = { time, value: Boolean(value) };
    return Boolean(value);
  }

  store(value, time) { this.cached = { time, value }; return { ...value, cacheHit: false }; }
}

function unavailable(reason, time) {
  return { available: false, provider: "Windows network APIs", reason, connected: false, status: "unavailable", collectedAt: new Date(time).toISOString() };
}

module.exports = { CONNECT_TEST_URL, NETWORK_CACHE_MS, NetworkCollector, checkInternetReachability, parseInterfaceJson, parseNetshWlan };
