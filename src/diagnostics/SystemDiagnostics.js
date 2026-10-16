"use strict";
const os = require("node:os");

function getSystemDiagnostics() {
    const cpus = os.cpus() || [];
    return {
        timestamp: Date.now(),
        platform: process.platform,
        node: process.versions.node,
        electron: process.versions.electron || null,
        cpu: { logicalCores: cpus.length },
        memory: { totalBytes: os.totalmem(), freeBytes: os.freemem() },
        uptimeSeconds: os.uptime()
    };
}

module.exports = { getSystemDiagnostics };
