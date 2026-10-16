"use strict";

// Privileged IPC belongs only to the application's own top-level document.
// Checking WebContents alone is insufficient: it survives navigation and
// untrusted child frames can also send messages from the same WebContents.
function isTrustedIPCEvent(event, window, rendererURL) {
    try {
        if (!window || window.isDestroyed() || !event?.sender || !event.senderFrame) return false;
        const contents = window.webContents;
        if (contents.isDestroyed() || event.sender !== contents || event.senderFrame !== contents.mainFrame) return false;
        const isRenderer = value => {
            const actual = new URL(String(value || ""));
            const expected = new URL(rendererURL);
            actual.hash = "";
            expected.hash = "";
            return actual.protocol === "file:" && actual.href === expected.href;
        };
        return isRenderer(contents.getURL()) && isRenderer(event.senderFrame.url);
    } catch (_) {
        // Detached frames and destroyed WebContents may throw while inspected.
        return false;
    }
}

const CONFIRMATIONS = Object.freeze({
    "system:shutdown": "Shut down this computer now?",
    "system:restart": "Restart this computer now?",
    "system:sleep": "Put this computer to sleep?",
    "system:lock": "Lock this computer?",
    "system:logoff": "Sign out of this computer?",
    "system:schedule-shutdown": "Schedule this computer to shut down?",
    "file:delete": "Delete the selected file or folder?"
});

function confirmationFor(channel, args) {
    const message = CONFIRMATIONS[channel];
    if (!message) return null;
    let detail = "Save your work before continuing. JARVIS will perform this action only if you choose Continue.";
    if (channel === "system:schedule-shutdown") {
        const delay = args[0];
        // Let the actual handler return its validation error without a dialog.
        if (!Number.isSafeInteger(delay) || delay < 60000 || delay > 7 * 24 * 60 * 60 * 1000) return null;
        detail = `Shutdown is scheduled in ${Math.ceil(delay / 60000)} minute(s). Running apps will be forced to close and unsaved work may be lost. The timer continues after JARVIS closes.`;
    } else if (channel === "file:delete") {
        detail = `Target: ${String(args[0] || "").slice(0, 1000)}\n\nThis operation can permanently remove the selected item. Review the path before continuing.`;
    }
    return { type: "warning", title: "JARVIS — confirm action", message, detail, buttons: ["Cancel", "Continue"], defaultId: 0, cancelId: 0, noLink: true };
}

function guardIPCHandler(channel, handler, { getWindow, rendererURL, confirm, onDenied = () => {}, eventOnly = false }) {
    let confirmationPending = false;
    const denied = code => {
        onDenied(channel, code);
        return { success: false, code, error: "This request is not authorized for the current JARVIS window." };
    };
    return function guardedIPC(event, ...args) {
        if (!isTrustedIPCEvent(event, getWindow(), rendererURL)) return denied("UNTRUSTED_IPC_SENDER");
        const options = confirmationFor(channel, args);
        if (!options) return handler(event, ...args);
        // High-impact requests must use invoke so their caller receives the
        // approval result. A send-only event must never bypass that exchange.
        if (eventOnly || typeof confirm !== "function") return denied("APPROVAL_UNAVAILABLE");
        if (confirmationPending) return { success: false, code: "APPROVAL_PENDING", error: "Review the existing confirmation first." };
        confirmationPending = true;
        return (async () => {
            try {
                const accepted = await confirm(getWindow(), options);
                if (accepted !== true) return { success: false, cancelled: true, code: "USER_CANCELLED", error: "Action cancelled. No changes were made." };
                if (!isTrustedIPCEvent(event, getWindow(), rendererURL)) return denied("UNTRUSTED_IPC_SENDER");
                return await handler(event, ...args);
            } catch (error) {
                return { success: false, code: "APPROVAL_FAILED", error: `Action was not completed: ${String(error?.message || error).slice(0, 240)}` };
            } finally {
                confirmationPending = false;
            }
        })();
    };
}

module.exports = { isTrustedIPCEvent, guardIPCHandler, confirmationFor };
