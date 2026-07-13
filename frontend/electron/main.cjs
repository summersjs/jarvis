"use strict";

const os = require("node:os");
const path = require("node:path");
const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  session,
  shell,
  Tray,
} = require("electron");
const { closeAction, navigationAction, shortcutAction } = require("./behavior.cjs");
const { checkReachable, ConnectionMonitor } = require("./connection.cjs");
const { resolveDesktopConfig } = require("./config.cjs");
const { createLogger } = require("./logger.cjs");
const { JsonStateStore, visibleBounds } = require("./window-state.cjs");

let config;
let logger;
let stateStore;
let logPath;
let mainWindow = null;
let tray = null;
let connectionMonitor = null;
let isQuitting = false;
let saveTimer = null;

app.setName("Jarvis Desktop");

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showAndFocus());
  app.whenReady().then(startApplication).catch((error) => {
    console.error("Jarvis Electron startup failed", error);
    app.quit();
  });
}

async function startApplication() {
  config = resolveDesktopConfig({ isPackaged: app.isPackaged });
  logPath = path.join(app.getPath("logs"), "jarvis-desktop.log");
  logger = createLogger(logPath, { development: config.isDevelopment });
  const preferencePath = config.preferencePath
    ? path.resolve(config.preferencePath)
    : path.join(app.getPath("userData"), "desktop-state.json");
  stateStore = new JsonStateStore(preferencePath);

  logger("electron-startup", `mode=${config.isDevelopment ? "development" : "production"}`);
  logger("target-url", config.publicTargetUrl);
  applyLaunchAtStartup(stateStore.get("launchAtStartup", false));
  registerIpcHandlers();
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  createWindow();
  createTray();
  registerShortcut();
}

function createWindow() {
  const displays = screen.getAllDisplays();
  const bounds = visibleBounds(stateStore.get("window", {}), displays, screen.getPrimaryDisplay());
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: "#020806",
    title: "Jarvis",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  mainWindow.setFullScreen(Boolean(stateStore.get("fullscreen", false)));
  logger("window-created", `${bounds.width}x${bounds.height}`);

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("close", (event) => {
    if (closeAction({ isQuitting }) === "hide") {
      event.preventDefault();
      mainWindow?.hide();
      logger("window-hidden", "close-to-tray");
    }
  });
  mainWindow.on("move", scheduleWindowStateSave);
  mainWindow.on("resize", scheduleWindowStateSave);
  mainWindow.on("enter-full-screen", () => stateStore.set("fullscreen", true));
  mainWindow.on("leave-full-screen", () => stateStore.set("fullscreen", false));
  mainWindow.on("closed", () => {
    connectionMonitor?.stop();
    mainWindow = null;
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    logger("renderer-crash", `reason=${details.reason} exit=${details.exitCode}`);
  });
  mainWindow.webContents.on("did-fail-load", (_event, code, description, validatedUrl, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    logger("load-failed", `code=${code} url=${safeLogUrl(validatedUrl)} reason=${description}`);
    void showOffline();
    void connectionMonitor?.retryNow();
  });
  configureNavigation(mainWindow);
  void mainWindow.loadFile(path.join(__dirname, "loading.html"));

  connectionMonitor = new ConnectionMonitor({
    check: () => {
      logger("connection-check", config.publicTargetUrl);
      return checkReachable(config.targetUrl);
    },
    onOnline: async () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      logger("connection-online", config.publicTargetUrl);
      await mainWindow.loadURL(config.targetUrl);
      mainWindow.show();
    },
    onOffline: async ({ attempt, nextRetryMs }) => {
      logger("connection-offline", `attempt=${attempt} retryMs=${nextRetryMs}`);
      await showOffline();
    },
  });
  void connectionMonitor.start();
}

function configureNavigation(window) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    const action = navigationAction(url, config.targetOrigin);
    if (action === "external") {
      logger("external-link", safeLogUrl(url));
      void shell.openExternal(url);
    } else {
      logger("popup-blocked", safeLogUrl(url));
    }
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    const action = navigationAction(url, config.targetOrigin);
    if (action === "allow") return;
    event.preventDefault();
    if (action === "external") {
      logger("external-navigation", safeLogUrl(url));
      void shell.openExternal(url);
    } else {
      logger("navigation-blocked", safeLogUrl(url));
    }
  });
}

async function showOffline() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const current = mainWindow.webContents.getURL();
  if (!current.endsWith("/offline.html")) await mainWindow.loadFile(path.join(__dirname, "offline.html"));
  mainWindow.show();
}

function createTray() {
  const iconPath = path.join(__dirname, "assets", "tray.ico");
  const image = nativeImage.createFromPath(iconPath);
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip("Jarvis Desktop");
  rebuildTrayMenu();
  tray.on("double-click", showAndFocus);
  logger("tray-created", "ready");
}

function rebuildTrayMenu() {
  if (!tray) return;
  const launchAtStartup = stateStore.get("launchAtStartup", false);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open Jarvis", click: () => navigateTo(config.targetUrl) },
    { label: "Open Chloe", click: () => navigateTo(config.chloeUrl) },
    { label: "Toggle fullscreen", click: toggleFullscreen },
    { label: "Restart window", click: restartWindow },
    { type: "separator" },
    {
      label: "Launch at startup",
      type: "checkbox",
      checked: launchAtStartup,
      click: (item) => setLaunchAtStartup(Boolean(item.checked)),
    },
    { type: "separator" },
    { label: "Quit", click: quitApplication },
  ]));
}

function registerShortcut() {
  const registered = globalShortcut.register("Alt+C", () => {
    if (!mainWindow) return;
    const action = shortcutAction({ visible: mainWindow.isVisible(), focused: mainWindow.isFocused() });
    if (action === "show") showAndFocus();
    else if (action === "focus") mainWindow.focus();
    else navigateTo(config.chloeUrl);
  });
  logger(registered ? "shortcut-registered" : "shortcut-registration-failed", "Alt+C");
}

function navigateTo(url) {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  showAndFocus();
  void checkReachable(config.targetUrl).then((online) => {
    if (online) void mainWindow?.loadURL(url);
    else {
      void showOffline();
      void connectionMonitor?.retryNow();
    }
  });
}

function showAndFocus() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function toggleFullscreen() {
  if (!mainWindow) return;
  mainWindow.setFullScreen(!mainWindow.isFullScreen());
  showAndFocus();
}

function restartWindow() {
  logger("window-restart", "requested");
  connectionMonitor?.stop();
  mainWindow?.destroy();
  createWindow();
  rebuildTrayMenu();
}

function quitApplication() {
  isQuitting = true;
  logger("application-quit", "tray");
  app.quit();
}

function scheduleWindowStateSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized() || mainWindow.isFullScreen()) return;
    const bounds = mainWindow.getBounds();
    const display = screen.getDisplayMatching(bounds);
    stateStore.set("window", { ...bounds, displayId: display.id });
  }, 250);
}

function setLaunchAtStartup(enabled) {
  if (typeof enabled !== "boolean") throw new TypeError("Launch-at-startup must be a boolean.");
  stateStore.set("launchAtStartup", enabled);
  applyLaunchAtStartup(enabled);
  rebuildTrayMenu();
  return enabled;
}

function applyLaunchAtStartup(enabled) {
  const settings = { openAtLogin: enabled, path: process.execPath };
  if (!app.isPackaged) settings.args = [app.getAppPath()];
  app.setLoginItemSettings(settings);
  logger?.("launch-at-startup", enabled ? "enabled" : "disabled");
}

function registerIpcHandlers() {
  ipcMain.handle("desktop:get-shell-config", () => ({ targetUrl: config.publicTargetUrl, chloeRoute: config.chloeRoute }));
  ipcMain.handle("desktop:retry-connection", () => connectionMonitor?.retryNow() || false);
  ipcMain.handle("desktop:open-logs", () => shell.showItemInFolder(logPath));
  ipcMain.handle("desktop:get-launch-at-startup", () => Boolean(stateStore.get("launchAtStartup", false)));
  ipcMain.handle("desktop:set-launch-at-startup", (_event, enabled) => setLaunchAtStartup(enabled));
  ipcMain.handle("desktop:get-system-stats", () => collectSystemStats());
  ipcMain.handle("desktop:launch-app", async (_event, appId) => {
    if (typeof appId !== "string") throw new TypeError("Application id must be a string.");
    const targets = {
      chrome: "https://www.google.com",
      "youtube-music": "https://music.youtube.com",
      vscode: "vscode://",
      discord: "discord://",
      terminal: "wt:",
    };
    const target = targets[appId];
    if (!target) return false;
    await shell.openExternal(target);
    return true;
  });
}

async function collectSystemStats() {
  const start = cpuSnapshot();
  await new Promise((resolve) => setTimeout(resolve, 300));
  const end = cpuSnapshot();
  const totalDelta = end.total - start.total;
  const idleDelta = end.idle - start.idle;
  const cpuUsage = totalDelta > 0 ? Math.round((1 - idleDelta / totalDelta) * 100) : 0;
  const ramUsage = Math.round((1 - os.freemem() / os.totalmem()) * 100);
  const uptimeMinutes = Math.floor(os.uptime() / 60);
  return {
    cpuUsage,
    ramUsage,
    uptime: `${String(Math.floor(uptimeMinutes / 60)).padStart(2, "0")}:${String(uptimeMinutes % 60).padStart(2, "0")}`,
  };
}

function cpuSnapshot() {
  return os.cpus().reduce((summary, cpu) => {
    const total = Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
    return { idle: summary.idle + cpu.times.idle, total: summary.total + total };
  }, { idle: 0, total: 0 });
}

function safeLogUrl(value) {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "invalid-url";
  }
}

app.on("activate", showAndFocus);
app.on("before-quit", () => {
  isQuitting = true;
  connectionMonitor?.stop();
  globalShortcut.unregisterAll();
});
app.on("window-all-closed", (event) => event.preventDefault());
