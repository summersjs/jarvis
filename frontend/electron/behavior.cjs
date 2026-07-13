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

module.exports = {
  closeAction,
  navigationAction,
  shortcutAction,
};
