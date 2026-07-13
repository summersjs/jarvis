"use strict";

const { GpuCollector } = require("./gpu.cjs");
const { MediaService } = require("./media.cjs");
const { NetworkCollector } = require("./network.cjs");
const { StorageCollector } = require("./storage.cjs");

async function main() {
  const [gpu, storage, network, media] = await Promise.all([
    new GpuCollector().get({ force: true }),
    new StorageCollector().get(),
    new NetworkCollector().get({ force: true }),
    new MediaService().getSession({ force: true }),
  ]);
  process.stdout.write(`${JSON.stringify({ platform: process.platform, gpu, storage, network, media }, null, 2)}\n`);
  if (process.platform === "win32" && (!gpu.available || !storage.available || !network.available)) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`Native smoke test failed: ${error.message}\n`);
  process.exitCode = 1;
});
