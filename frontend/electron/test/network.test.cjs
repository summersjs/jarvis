"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { NetworkCollector, parseNetshWlan } = require("../network.cjs");

const WIFI = `Name : Wi-Fi\nState : connected\nSSID : sumsum\nReceive rate (Mbps) : 72.2\nTransmit rate (Mbps) : 72.2`;

test("Wi-Fi parser returns SSID and link rate without credential fields", () => {
  const value = parseNetshWlan(WIFI);
  assert.deepEqual(value, { wifiDetected: true, connected: true, ssid: "sumsum", permissionStatus: "available", linkSpeedMbps: 72.2 });
  assert.equal(JSON.stringify(value).includes("password"), false);
  assert.equal(JSON.stringify(value).includes("key"), false);
});

test("Windows location restriction preserves connected Wi-Fi state", () => {
  const value = parseNetshWlan("State : connected\nSSID information requires Location Services permission");
  assert.equal(value.connected, true);
  assert.equal(value.permissionStatus, "hiddenByWindows");
});

test("network collector distinguishes Wi-Fi, Ethernet, local-only, and offline", async () => {
  const interfaceJson = JSON.stringify({ connected: true, interfaceName: "Wi-Fi", description: "Wireless adapter", ipv4Address: "192.168.1.2", linkSpeedMbps: 866 });
  const wifi = new NetworkCollector({ platform: "win32", run: async (file) => file === "netsh.exe" ? WIFI : interfaceJson, reachability: async () => true });
  assert.equal((await wifi.get()).interfaceType, "wifi");
  const ethernet = new NetworkCollector({ platform: "win32", run: async (file) => file === "netsh.exe" ? "There is no wireless interface" : JSON.stringify({ connected: true, interfaceName: "Ethernet", description: "PCIe Ethernet", ipv4Address: "10.0.0.2", linkSpeedMbps: 1000 }), reachability: async () => true });
  assert.equal((await ethernet.get()).interfaceType, "ethernet");
  const local = new NetworkCollector({ platform: "win32", run: async (file) => file === "netsh.exe" ? WIFI : interfaceJson, reachability: async () => false });
  assert.equal((await local.get()).status, "localOnly");
  const offline = new NetworkCollector({ platform: "win32", run: async (file) => file === "netsh.exe" ? "" : '{"connected":false}', reachability: async () => false });
  assert.equal((await offline.get()).status, "offline");
});
