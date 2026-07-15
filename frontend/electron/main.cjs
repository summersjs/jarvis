"use strict";

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
const { closeAction, forgeProjectUrl, navigationAction } = require("./behavior.cjs");
const { checkReachable, ConnectionMonitor } = require("./connection.cjs");
const { resolveDesktopConfig } = require("./config.cjs");
const { GpuCollector } = require("./gpu.cjs");
const { createLogger } = require("./logger.cjs");
const { MediaService } = require("./media.cjs");
const { resolveWindowsHelper } = require("./native-resources.cjs");
const { NetworkCollector } = require("./network.cjs");
const { SpeedTestService } = require("./speed-test.cjs");
const { StorageCollector } = require("./storage.cjs");
const { collectSystemStats } = require("./system-stats.cjs");
const { compactBounds, JsonStateStore, visibleBounds } = require("./window-state.cjs");

let config;
let logger;
let stateStore;
let logPath;
let mainWindow = null;
let assistantWindow = null;
let tray = null;
let connectionMonitor = null;
let isQuitting = false;
let saveTimer = null;
let gpuCollector;
let storageCollector;
let networkCollector;
let speedTestService;
let mediaService;
const nativeHealth = { startedAt: new Date().toISOString(), collectors: {} };

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
  const helperPath = (name) => resolveWindowsHelper(name, {
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    sourceDir: __dirname,
  });
  gpuCollector = new GpuCollector();
  storageCollector = new StorageCollector({ scriptPath: helperPath("windows-storage.ps1") });
  networkCollector = new NetworkCollector({ scriptPath: helperPath("windows-network.ps1") });
  speedTestService = new SpeedTestService({ store: stateStore, intervalMs: config.speedTestIntervalHours * 60 * 60 * 1000 });
  mediaService = new MediaService({
    scriptPath: helperPath("windows-media.ps1"),
    musicUrl: stateStore.get("musicUrl", config.musicUrl),
  });

  logger("electron-startup", `mode=${config.isDevelopment ? "development" : "production"}`);
  logger("target-url", config.publicTargetUrl);
  applyLaunchAtStartup(stateStore.get("launchAtStartup", true));
  registerIpcHandlers();
  session.defaultSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => permission === "geolocation" && requestingOrigin === config.targetOrigin);
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    let approved = false;
    try {
      approved = permission === "geolocation" && new URL(details.requestingUrl).origin === config.targetOrigin;
    } catch {
      approved = false;
    }
    callback(approved);
  });
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
      if (assistantWindow && !assistantWindow.isDestroyed() && assistantWindow.webContents.getURL().endsWith("/offline.html")) {
        await assistantWindow.loadURL(`${config.jarvisUrl}?mode=compact`);
      }
    },
    onOffline: async ({ attempt, nextRetryMs }) => {
      logger("connection-offline", `attempt=${attempt} retryMs=${nextRetryMs}`);
      await showOffline();
    },
  });
  void connectionMonitor.start();
}

function createAssistantWindow() {
  if (assistantWindow && !assistantWindow.isDestroyed()) return assistantWindow;
  const cursorDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const saved = stateStore.get("jarvisWindowBounds", {});
  const rememberedDisplay = screen.getAllDisplays().find((display) => String(display.id) === String(saved.displayId));
  const display = rememberedDisplay || cursorDisplay;
  const bounds = compactBounds(saved, display);
  assistantWindow = new BrowserWindow({
    ...bounds,
    minWidth: 380,
    minHeight: 520,
    show: false,
    backgroundColor: "#020806",
    title: "Jarvis Assistant",
    autoHideMenuBar: true,
    alwaysOnTop: Boolean(stateStore.get("jarvisAlwaysOnTop", false)),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  configureNavigation(assistantWindow);
  assistantWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      assistantWindow?.hide();
    }
  });
  assistantWindow.on("move", scheduleAssistantStateSave);
  assistantWindow.on("resize", scheduleAssistantStateSave);
  assistantWindow.on("closed", () => { assistantWindow = null; });
  assistantWindow.webContents.on("render-process-gone", (_event, details) => logger("assistant-renderer-crash", `reason=${details.reason} exit=${details.exitCode}`));
  assistantWindow.webContents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
    if (isMainFrame && code !== -3) logger("assistant-load-failed", `code=${code} url=${safeLogUrl(url)} reason=${description}`);
  });
  void assistantWindow.loadFile(path.join(__dirname, "loading.html"));
  void checkReachable(config.targetUrl).then(async (online) => {
    if (!assistantWindow || assistantWindow.isDestroyed()) return;
    if (online) await assistantWindow.loadURL(`${config.jarvisUrl}?mode=compact`);
    else await assistantWindow.loadFile(path.join(__dirname, "offline.html"));
    assistantWindow.show();
    assistantWindow.focus();
  });
  logger("assistant-window-created", `${bounds.width}x${bounds.height}`);
  return assistantWindow;
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
  const launchAtStartup = stateStore.get("launchAtStartup", true);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open Jarvis Dashboard", click: () => navigateTo(config.targetUrl) },
    { label: "Open Jarvis Assistant", click: openJarvisAssistant },
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
    openJarvisAssistant();
  });
  logger(registered ? "shortcut-registered" : "shortcut-registration-failed", "Alt+C");
}

function openJarvisAssistant() {
  const window = createAssistantWindow();
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
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

function scheduleAssistantStateSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!assistantWindow || assistantWindow.isDestroyed() || assistantWindow.isMinimized()) return;
    const bounds = assistantWindow.getBounds();
    stateStore.set("jarvisWindowBounds", { ...bounds, displayId: screen.getDisplayMatching(bounds).id });
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
  ipcMain.handle("desktop:get-shell-config", () => ({ targetUrl: config.publicTargetUrl, jarvisRoute: config.jarvisRoute }));
  ipcMain.handle("desktop:retry-connection", async () => {
    const online = await checkReachable(config.targetUrl);
    if (online && assistantWindow && !assistantWindow.isDestroyed()) await assistantWindow.loadURL(`${config.jarvisUrl}?mode=compact`);
    void connectionMonitor?.retryNow();
    return online;
  });
  ipcMain.handle("desktop:open-logs", () => shell.showItemInFolder(logPath));
  ipcMain.handle("desktop:get-launch-at-startup", () => Boolean(stateStore.get("launchAtStartup", true)));
  ipcMain.handle("desktop:set-launch-at-startup", (_event, enabled) => setLaunchAtStartup(enabled));
  ipcMain.handle("desktop:get-system-stats", () => collectSystemStats());
  ipcMain.handle("jarvis:telemetry:getGpu", () => trackedCollector("gpu", () => gpuCollector.get()));
  ipcMain.handle("jarvis:telemetry:getStorage", () => trackedCollector("storage", () => storageCollector.get()));
  ipcMain.handle("jarvis:telemetry:getNetwork", () => trackedCollector("network", () => networkCollector.get()));
  ipcMain.handle("jarvis:network:getSpeedResult", () => {
    const result = speedTestService.getResult({ autoRun: stateStore.get("automaticSpeedTest", true) });
    recordCollector("speedTest", result);
    return result;
  });
  ipcMain.handle("jarvis:network:runSpeedTest", () => trackedCollector("speedTest", () => speedTestService.run({ manual: true })));
  ipcMain.handle("jarvis:media:getSession", () => {
    if (!stateStore.get("mediaControlEnabled", true)) return { available: false, provider: "Windows GSMTC", reason: "disabled" };
    return trackedCollector("media", () => mediaService.getSession());
  });
  ipcMain.handle("jarvis:media:executeAction", (_event, action) => {
    if (!stateStore.get("mediaControlEnabled", true)) return { available: false, provider: "Windows GSMTC", reason: "disabled" };
    return trackedCollector("media", () => mediaService.execute(action));
  });
  ipcMain.handle("jarvis:media:openYouTubeMusic", () => trackedCollector("media", () => mediaService.execute("open")));
  ipcMain.handle("jarvis:native:getHealth", () => config.isDevelopment ? getNativeHealth() : { available: false, reason: "development_only" });
  ipcMain.handle("desktop:open-jarvis-assistant", () => { openJarvisAssistant(); return true; });
  ipcMain.handle("desktop:hide-jarvis-assistant", () => { assistantWindow?.hide(); return true; });
  ipcMain.handle("desktop:open-full-jarvis", () => { navigateTo(config.jarvisUrl); assistantWindow?.hide(); return true; });
  ipcMain.handle("desktop:collapse-jarvis", async () => {
    const window = createAssistantWindow();
    const online = await checkReachable(config.targetUrl);
    if (online) await window.loadURL(`${config.jarvisUrl}?mode=compact`);
    else await window.loadFile(path.join(__dirname, "offline.html"));
    window.show();
    window.focus();
    navigateTo(config.targetUrl);
    logger("assistant-window-collapsed", "compact");
    return true;
  });
  ipcMain.handle("desktop:get-preferences", () => getDesktopPreferences());
  ipcMain.handle("desktop:set-preference", (_event, payload) => setDesktopPreference(payload));
  ipcMain.handle("desktop:reset-jarvis-position", () => {
    stateStore.set("jarvisWindowBounds", {});
    assistantWindow?.destroy();
    assistantWindow = null;
    openJarvisAssistant();
    return true;
  });
  ipcMain.handle("desktop:launch-app", async (_event, appId) => {
    if (typeof appId !== "string") throw new TypeError("Application id must be a string.");
    const targets = {
      chrome: "https://www.google.com",
      vscode: "vscode://",
      discord: "discord://",
      terminal: "wt:",
    };
    if (appId === "youtube-music") return mediaService.execute("open");
    const target = targets[appId];
    if (!target) return false;
    await shell.openExternal(target);
    return true;
  });
  ipcMain.handle("desktop:open-forge-project", async (_event, projectId) => {
    const target = forgeProjectUrl(projectId, config.targetOrigin);
    logger("forge-project-open", `project=${projectId}`);
    await shell.openExternal(target);
    return true;
  });
}

function getDesktopPreferences() {
  return {
    jarvisResponseMode: stateStore.get("jarvisResponseMode", "text"),
    jarvisAlwaysOnTop: Boolean(stateStore.get("jarvisAlwaysOnTop", false)),
    weatherLocation: stateStore.get("weatherLocation", ""),
    weatherLatitude: stateStore.get("weatherLatitude", null),
    weatherLongitude: stateStore.get("weatherLongitude", null),
    weatherUnit: stateStore.get("weatherUnit", "fahrenheit"),
    musicUrl: stateStore.get("musicUrl", config.musicUrl),
    mediaControlEnabled: stateStore.get("mediaControlEnabled", true),
    automaticSpeedTest: stateStore.get("automaticSpeedTest", true),
    ttsMuted: Boolean(stateStore.get("ttsMuted", false)),
    launchAtStartup: Boolean(stateStore.get("launchAtStartup", false)),
  };
}

function setDesktopPreference(payload) {
  if (!payload || typeof payload !== "object") throw new TypeError("Preference payload is required.");
  const validators = {
    jarvisResponseMode: (value) => ["text", "voice", "both"].includes(value),
    jarvisAlwaysOnTop: (value) => typeof value === "boolean",
    weatherLocation: (value) => typeof value === "string" && value.length <= 160,
    weatherLatitude: (value) => value === null || (typeof value === "number" && value >= -90 && value <= 90),
    weatherLongitude: (value) => value === null || (typeof value === "number" && value >= -180 && value <= 180),
    weatherUnit: (value) => ["fahrenheit", "celsius"].includes(value),
    musicUrl: (value) => typeof value === "string" && /^https:\/\/music\.youtube\.com(?:\/.*)?$/.test(value),
    mediaControlEnabled: (value) => typeof value === "boolean",
    automaticSpeedTest: (value) => typeof value === "boolean",
    ttsMuted: (value) => typeof value === "boolean",
  };
  if (!Object.hasOwn(validators, payload.key) || !validators[payload.key](payload.value)) throw new TypeError("Unsupported desktop preference.");
  stateStore.set(payload.key, payload.value);
  if (payload.key === "jarvisAlwaysOnTop") assistantWindow?.setAlwaysOnTop(payload.value);
  if (payload.key === "musicUrl") mediaService.setMusicUrl(payload.value);
  return getDesktopPreferences();
}

async function trackedCollector(name, operation) {
  try {
    const result = await operation();
    recordCollector(name, result);
    return result;
  } catch (error) {
    const result = { available: false, reason: error instanceof TypeError ? "invalid_action" : "collector_failed", collectedAt: new Date().toISOString() };
    recordCollector(name, result);
    if (error instanceof TypeError) throw error;
    return result;
  }
}

function recordCollector(name, result) {
  const previous = nativeHealth.collectors[name] || { timeoutCount: 0 };
  nativeHealth.collectors[name] = {
    provider: result?.provider || previous.provider || null,
    lastAttempt: new Date().toISOString(),
    lastSuccess: result?.available ? (result.collectedAt || result.testedAt || new Date().toISOString()) : previous.lastSuccess || null,
    error: result?.available ? null : (result?.reason || result?.refreshFailureReason || null),
    timeoutCount: previous.timeoutCount + ((result?.reason || result?.refreshFailureReason) === "timeout" ? 1 : 0),
  };
}

function getNativeHealth() {
  return {
    available: true,
    electronDetected: true,
    platform: process.platform,
    startedAt: nativeHealth.startedAt,
    collectors: nativeHealth.collectors,
    ssidPermissionStatus: networkCollector.cached?.value?.ssidPermissionStatus || "unknown",
    activeMediaSource: mediaService.cached?.value?.source || null,
    speedTestProvider: speedTestService.getResult().provider,
  };
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
