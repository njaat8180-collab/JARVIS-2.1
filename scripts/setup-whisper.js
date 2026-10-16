"use strict";

/**
 * JARVIS — WHISPER OFFLINE SETUP
 * scripts/setup-whisper.js
 * ------------------------------------------------------------
 * Pre-downloads the whisper.cpp runtime + the configured GGML model
 * so the first launch is fully offline. The app does this
 * automatically on first launch too — this script exists so it can
 * be done ahead of time (or to switch models):
 *
 *   node scripts/setup-whisper.js            # configured model (default: base)
 *   WHISPER_MODEL=small node scripts/setup-whisper.js
 *   npm run setup:whisper
 * ------------------------------------------------------------
 */

const whisperProvider = require("../stt/whisper/provider");
const voiceSTT = require("../voiceSTT");

async function main() {
    console.log("=== JARVIS offline Whisper setup ===\n");

    const status = whisperProvider.getStatus();
    console.log(`Platform          : ${status.executable.platform}`);
    console.log(`Configured model  : ${status.model.name} (${status.model.path})`);
    console.log(`Auto-download     : ${status.model.autoDownload ? "enabled" : "disabled"}\n`);

    whisperProvider.setProgressListener((info) => {
        if (info.status === "DOWNLOADING" && Number.isFinite(info.percent)) {
            process.stdout.write(`\r  ${info.type} download: ${info.percent}% (${Math.round((info.downloaded || 0) / 1048576)} / ${Math.round((info.total || 0) / 1048576)} MB)   `);
        } else if (info.detail) {
            process.stdout.write(`\n  ${info.type}: ${info.detail}\n`);
        }
    });

    console.log("[1/2] Ensuring whisper.cpp runtime…");
    const exe = await whisperProvider.resolveExecutable();
    let exePath = exe.path;
    if (!exe.found) {
        const ensured = await whisperProvider.ensureReady();
        if (!ensured.ok) {
            console.error(`\nSetup failed: ${ensured.error}`);
            process.exit(1);
        }
        exePath = ensured.executable;
    }
    console.log(`  whisper.cpp runtime: ${exePath}`);

    console.log("\n[2/2] Ensuring Whisper model…");
    const model = await whisperProvider.ensureModel();
    if (!model.ok) {
        console.error(`\nSetup failed: ${model.error}`);
        process.exit(1);
    }
    console.log(`  Model ready: ${model.path}\n`);

    const finalStatus = voiceSTT.getModelStatus();
    console.log("=== Done — offline STT is ready ===");
    console.log(`  engine   : ${finalStatus.engine}`);
    console.log(`  ready    : ${finalStatus.ready}`);
    console.log(`  whisper  : ${finalStatus.whisper.model.status} (${finalStatus.whisper.model.name})`);
}

main().catch((error) => {
    console.error(`Setup failed: ${error.message}`);
    process.exit(1);
});
