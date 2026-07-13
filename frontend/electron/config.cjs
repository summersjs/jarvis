"use strict";

const DEFAULT_DESKTOP_URL = "http://localhost:3000/desktop";
const DEFAULT_JARVIS_ROUTE = "/jarvis";
const DEFAULT_MUSIC_URL = "https://music.youtube.com/";

function resolveDesktopConfig({ env = process.env, isPackaged = false } = {}) {
  const target = parseHttpUrl(env.JARVIS_DESKTOP_URL || DEFAULT_DESKTOP_URL, "JARVIS_DESKTOP_URL");
  if (target.pathname === "/") target.pathname = "/desktop";

  const jarvisRoute = normalizeRoute(env.JARVIS_ASSISTANT_ROUTE || DEFAULT_JARVIS_ROUTE);
  const musicUrl = parseHttpUrl(env.JARVIS_MUSIC_URL || DEFAULT_MUSIC_URL, "JARVIS_MUSIC_URL");
  const preferencePath = env.JARVIS_STARTUP_PREFERENCE_PATH || null;

  return {
    isDevelopment: env.ELECTRON_IS_DEV === "1" || !isPackaged,
    targetUrl: target.toString(),
    publicTargetUrl: publicUrl(target),
    targetOrigin: target.origin,
    jarvisUrl: new URL(jarvisRoute, target.origin).toString(),
    jarvisRoute,
    musicUrl: musicUrl.toString(),
    preferencePath,
  };
}

function parseHttpUrl(value, name) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid http or https URL.`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`${name} must use http or https.`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${name} must not contain embedded credentials.`);
  }
  return parsed;
}

function normalizeRoute(value) {
  const route = String(value || "").trim();
  if (!route.startsWith("/") || route.startsWith("//") || route.includes(":")) {
    throw new Error("JARVIS_ASSISTANT_ROUTE must be a local path beginning with one slash.");
  }
  return route;
}

function publicUrl(url) {
  const safe = new URL(url.toString());
  safe.username = "";
  safe.password = "";
  safe.search = "";
  safe.hash = "";
  return safe.toString();
}

module.exports = {
  DEFAULT_DESKTOP_URL,
  DEFAULT_JARVIS_ROUTE,
  resolveDesktopConfig,
};
