"use strict";

/*
 * Voice Engine Migration Wizard
 *
 * This service deliberately fails closed. A speech engine can affect the
 * microphone, startup, and the whole app, so JARVIS never downloads a random
 * binary, overwrites the active engine, or deletes Whisper as part of a voice
 * command. Unsupported engines return a useful preflight result and leave the
 * current configuration untouched.
 */

const SUPPORTED_ACTIVE_ENGINES = new Set(["offline", "sarvam"]);
const KNOWN_ENGINES = new Set(["whisper", "vosk", "offline", "sarvam"]);

function normalizeEngine(value) {
    const engine = String(value || "").trim().toLowerCase();
    if (engine === "whisper" || engine === "offline") return "whisper";
    if (engine === "vosk") return "vosk";
    if (engine === "sarvam") return "sarvam";
    return engine;
}

function createVoiceEngineMigration({ getSettings, saveSettings } = {}) {
    const readSettings = typeof getSettings === "function" ? getSettings : async () => ({ sttEngine: "sarvam" });
    const writeSettings = typeof saveSettings === "function" ? saveSettings : async () => ({ success: false });

    async function status() {
        const settings = await readSettings();
        const active = normalizeEngine(settings?.sttEngine || "sarvam");
        return {
            success: true,
            activeEngine: active || "sarvam",
            rollbackPreserved: true,
            supportedActiveEngines: Array.from(SUPPORTED_ACTIVE_ENGINES),
            target: "vosk",
            targetStatus: "unavailable",
            message: "Vosk is not bundled in this production build. Whisper remains available as the safe local rollback."
        };
    }

    async function preflight(target) {
        const normalized = normalizeEngine(target);
        if (!KNOWN_ENGINES.has(normalized)) {
            return { success: false, code: "UNKNOWN_ENGINE", target: normalized, error: "This voice engine is not recognized." };
        }
        if (normalized === "vosk") {
            return {
                success: false,
                code: "ENGINE_UNSUPPORTED",
                target: "vosk",
                approvalRequired: false,
                rollbackPreserved: true,
                error: "Vosk migration is not available in this build because it requires native Windows speech dependencies. Whisper was not changed or deleted."
            };
        }
        return { success: true, target: normalized, installRequired: false, approvalRequired: false };
    }

    async function request(target, options = {}) {
        const result = await preflight(target);
        if (!result.success) return result;
        if (options.approved !== true) {
            return { success: false, code: "APPROVAL_REQUIRED", target: result.target, approvalRequired: true, error: `Switch to ${result.target} requires your approval.` };
        }
        if (!SUPPORTED_ACTIVE_ENGINES.has(result.target === "whisper" ? "offline" : result.target)) {
            return { success: false, code: "ENGINE_UNSUPPORTED", target: result.target, error: "This engine is not enabled in the production runtime." };
        }
        const saved = await writeSettings({ sttEngine: result.target === "whisper" ? "offline" : result.target });
        return saved?.success === false
            ? { success: false, code: "SAVE_FAILED", error: "The voice engine was not changed." }
            : { success: true, target: result.target, rollbackPreserved: true, message: `Voice engine switched to ${result.target}.` };
    }

    async function cleanup(engine, options = {}) {
        const normalized = normalizeEngine(engine);
        if (options.approved !== true) return { success: false, code: "APPROVAL_REQUIRED", cleanupApprovalRequired: true, error: "Cleanup requires a separate confirmation." };
        return { success: false, code: "CLEANUP_DISABLED", target: normalized, error: "Automatic voice-engine deletion is disabled. Whisper remains preserved for rollback." };
    }

    return Object.freeze({ status, preflight, request, cleanup });
}

module.exports = { createVoiceEngineMigration, normalizeEngine };
