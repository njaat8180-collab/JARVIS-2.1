/**
 * download-brain-model.js
 * -----------------------------------------------------------------------
 * Run this directly with plain Node (no Electron, no full JARVIS app) to
 * force the offline brain model to download/load right now, with visible
 * progress. Useful for confirming the download actually works before
 * relying on JARVIS to trigger it automatically on startup.
 *
 * Usage (from the jarvis_project folder):
 *   node scripts/download-brain-model.js
 */

const path = require("path");
const fs = require("fs");

// Outside Electron there is no app.getPath("userData"), so cache to a
// plain folder inside the project instead — embeddedBrain.js already
// falls back gracefully when require("electron") fails.
const cacheDir = path.join(__dirname, "..", "brain-models-cache");
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
process.env.JARVIS_BRAIN_CACHE_DIR = process.env.JARVIS_BRAIN_CACHE_DIR || cacheDir;

const embeddedBrain = require("../src/ai/embeddedBrain");

(async () => {
    console.log("============================================================");
    console.log(" JARVIS OFFLINE BRAIN — MANUAL DOWNLOAD/LOAD TEST");
    console.log(" Model:", process.env.JARVIS_BRAIN_MODEL || embeddedBrain.DEFAULT_MODEL);
    console.log(" Cache:", process.env.JARVIS_BRAIN_CACHE_DIR);
    console.log("============================================================");

    try {
        const reply = await embeddedBrain.think(
            "You are JARVIS, a helpful offline assistant. Keep replies short.",
            [],
            "Say hello in one short sentence."
        );
        console.log("\n✅ SUCCESS — model downloaded, loaded, and answered:");
        console.log("   ", reply);
        process.exit(0);
    } catch (error) {
        console.error("\n❌ FAILED:", error && error.message ? error.message : error);
        console.error("\nFull error:", error);
        process.exit(1);
    }
})();
