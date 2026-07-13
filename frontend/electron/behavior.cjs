"use strict";

const EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function closeAction({ isQuitting }) {
  return isQuitting ? "close" : "hide";
}

function shortcutAction({ visible, focused }) {
  if (!visible) return "show";
  if (!focused) return "focus";
  return "focus";
}

function navigationAction(candidate, approvedOrigin) {
  let url;
  try {
    url = new URL(candidate);
  } catch {
    return "block";
  }
  if (url.origin === approvedOrigin && ["http:", "https:"].includes(url.protocol)) return "allow";
  if (EXTERNAL_PROTOCOLS.has(url.protocol)) return "external";
  return "block";
}

function forgeProjectUrl(projectId, approvedOrigin) {
  const id = String(projectId || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new TypeError("Forge project id must be a UUID.");
  }
  const origin = new URL(approvedOrigin);
  if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password) {
    throw new TypeError("Approved Jarvis origin must use http or https without credentials.");
  }
  return new URL(`/forge/projects/${encodeURIComponent(id)}`, origin.origin).toString();
}

module.exports = {
  closeAction,
  forgeProjectUrl,
  navigationAction,
  shortcutAction,
};
