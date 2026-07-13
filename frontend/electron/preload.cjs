"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const invoke = (channel, value) => ipcRenderer.invoke(channel, value);

contextBridge.exposeInMainWorld("jarvisDesktop", Object.freeze({
  getSystemStats: () => invoke("desktop:get-system-stats"),
  launchApp: (appId) => invoke("desktop:launch-app", appId),
  retryConnection: () => invoke("desktop:retry-connection"),
  openLogs: () => invoke("desktop:open-logs"),
  getShellConfig: () => invoke("desktop:get-shell-config"),
  getLaunchAtStartup: () => invoke("desktop:get-launch-at-startup"),
  setLaunchAtStartup: (enabled) => invoke("desktop:set-launch-at-startup", enabled),
}));
