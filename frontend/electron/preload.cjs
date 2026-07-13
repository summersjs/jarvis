"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const invoke = (channel, value) => ipcRenderer.invoke(channel, value);

contextBridge.exposeInMainWorld("jarvisDesktop", Object.freeze({
  getSystemStats: () => invoke("desktop:get-system-stats"),
  getGpuTelemetry: () => invoke("jarvis:telemetry:getGpu"),
  getStorageTelemetry: () => invoke("jarvis:telemetry:getStorage"),
  getNetworkTelemetry: () => invoke("jarvis:telemetry:getNetwork"),
  getInternetSpeedResult: () => invoke("jarvis:network:getSpeedResult"),
  runInternetSpeedTest: () => invoke("jarvis:network:runSpeedTest"),
  getMediaSession: () => invoke("jarvis:media:getSession"),
  executeMediaAction: (action) => invoke("jarvis:media:executeAction", action),
  openYouTubeMusic: () => invoke("jarvis:media:openYouTubeMusic"),
  getNativeHealth: () => invoke("jarvis:native:getHealth"),
  launchApp: (appId) => invoke("desktop:launch-app", appId),
  openJarvisAssistant: () => invoke("desktop:open-jarvis-assistant"),
  hideJarvisAssistant: () => invoke("desktop:hide-jarvis-assistant"),
  openFullJarvis: () => invoke("desktop:open-full-jarvis"),
  getDesktopPreferences: () => invoke("desktop:get-preferences"),
  setDesktopPreference: (key, value) => invoke("desktop:set-preference", { key, value }),
  resetJarvisPosition: () => invoke("desktop:reset-jarvis-position"),
  retryConnection: () => invoke("desktop:retry-connection"),
  openLogs: () => invoke("desktop:open-logs"),
  getShellConfig: () => invoke("desktop:get-shell-config"),
  getLaunchAtStartup: () => invoke("desktop:get-launch-at-startup"),
  setLaunchAtStartup: (enabled) => invoke("desktop:set-launch-at-startup", enabled),
}));
