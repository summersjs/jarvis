"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const invoke = (channel, value) => ipcRenderer.invoke(channel, value);

contextBridge.exposeInMainWorld("jarvisDesktop", Object.freeze({
  getSystemStats: () => invoke("desktop:get-system-stats"),
  launchApp: (appId) => invoke("desktop:launch-app", appId),
  openJarvisAssistant: () => invoke("desktop:open-jarvis-assistant"),
  hideJarvisAssistant: () => invoke("desktop:hide-jarvis-assistant"),
  openFullJarvis: () => invoke("desktop:open-full-jarvis"),
  getDesktopPreferences: () => invoke("desktop:get-preferences"),
  setDesktopPreference: (key, value) => invoke("desktop:set-preference", { key, value }),
  resetJarvisPosition: () => invoke("desktop:reset-jarvis-position"),
  getMediaStatus: () => invoke("desktop:media-command", "getNowPlaying"),
  controlMedia: (action) => invoke("desktop:media-command", action),
  retryConnection: () => invoke("desktop:retry-connection"),
  openLogs: () => invoke("desktop:open-logs"),
  getShellConfig: () => invoke("desktop:get-shell-config"),
  getLaunchAtStartup: () => invoke("desktop:get-launch-at-startup"),
  setLaunchAtStartup: (enabled) => invoke("desktop:set-launch-at-startup", enabled),
}));
