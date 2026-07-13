"use strict";

const retry = document.querySelector("#retry");
const logs = document.querySelector("#logs");
const target = document.querySelector("#target");

window.jarvisDesktop.getShellConfig().then((config) => {
  target.textContent = config.targetUrl;
});

retry.addEventListener("click", async () => {
  retry.disabled = true;
  retry.textContent = "Checking…";
  await window.jarvisDesktop.retryConnection();
  window.setTimeout(() => {
    retry.disabled = false;
    retry.textContent = "Retry";
  }, 1500);
});

logs.addEventListener("click", () => window.jarvisDesktop.openLogs());
