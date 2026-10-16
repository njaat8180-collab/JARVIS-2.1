"use strict";

/**
 * ============================================================
 * JARVIS BROWSER ACTION ADAPTER (Phase 7)
 * ============================================================
 *
 * Exposes only the safe browser operations the real BrowserEngine
 * (src/browser/browser.js) and main.js's tab-management layer
 * already support (see PHASE7_ARCHITECTURE_INSPECTION.md, section
 * 1.2): navigate/open, new/close/switch tab, back/forward/reload/
 * stop, zoom in/out/reset, find/find-stop, bookmarks, history,
 * downloads, print/save.
 *
 * This adapter delegates to an injected `engine` with that same
 * method surface — in production that would be the real
 * BrowserEngine instance (plus whatever tab-management object
 * main.js already wires up); in tests it is a small mock. This
 * keeps the adapter itself fully Node-testable, since BrowserEngine
 * cannot be constructed outside a live Electron renderer/BrowserView.
 *
 * Absolutely NOT supported, by design (STEP 4 of the Phase 7 brief):
 *   - no arbitrary JavaScript execution against a page
 *   - no "AI browsing" / autonomous navigation loops
 *   - no method that accepts and runs a string of code
 * There is no executeScript()/runJs() method anywhere in this file,
 * and none is ever added dynamically.
 * ============================================================
 */

const DESTRUCTIVE_BROWSER_ACTIONS = new Set(["clearHistory", "clearDownloads"]);

function result({ success, action, message = null, data = null, error = null, requiresApproval = false }) {
    return { success, action, message, data, error, requiresApproval };
}

function isHttpUrl(value) {
    try {
        const url = new URL(String(value || "").trim());
        return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
    } catch (_) {
        return false;
    }
}

class BrowserActionAdapter {
    /**
     * @param {object} [options]
     * @param {object} [options.engine] - real/mock BrowserEngine-like object.
     */
    constructor(options = {}) {
        this.engine = options.engine || null;
    }

    _requireEngine(action) {
        if (!this.engine) {
            return result({ success: false, action, error: "No browser engine is available." });
        }
        return null;
    }

    async open(url) {
        const missing = this._requireEngine("open");
        if (missing) return missing;

        if (!isHttpUrl(url)) {
            return result({ success: false, action: "open", error: `"${url}" is not a valid http(s) URL.` });
        }
        if (typeof this.engine.navigate !== "function") {
            return result({ success: false, action: "open", error: "Engine does not support navigate()." });
        }
        return this._delegate("navigate", url, "open");
    }

    async newTab(url) {
        const missing = this._requireEngine("newTab");
        if (missing) return missing;
        if (url !== undefined && !isHttpUrl(url)) {
            return result({ success: false, action: "newTab", error: `"${url}" is not a valid http(s) URL.` });
        }
        if (typeof this.engine.newTab !== "function") {
            return result({ success: false, action: "newTab", error: "Engine does not support newTab()." });
        }
        // Use the shared delegate so transient engine failures and an engine
        // response with success:false become a normal browser-action result,
        // instead of rejecting the command promise into the renderer.
        return this._delegate("newTab", url, "newTab");
    }

    async closeTab(tabId) {
        return this._delegate("closeTab", tabId);
    }

    async switchTab(tabId) {
        return this._delegate("switchTab", tabId);
    }

    async back() {
        return this._delegate("back");
    }

    async forward() {
        return this._delegate("forward");
    }

    async reload() {
        return this._delegate("reload");
    }

    async stop() {
        return this._delegate("stop");
    }

    async zoomIn() {
        return this._delegate("zoomIn");
    }

    async zoomOut() {
        return this._delegate("zoomOut");
    }

    async zoomReset() {
        return this._delegate("resetZoom", undefined, "zoomReset");
    }

    async find(query) {
        if (!query || !String(query).trim()) {
            return result({ success: false, action: "find", error: "A non-empty search query is required." });
        }
        return this._delegate("findInPage", query, "find");
    }

    async findStop() {
        return this._delegate("stopFindInPage", undefined, "findStop");
    }

    async getBookmarks() {
        return this._delegate("getBookmarks");
    }

    async addBookmark(url) {
        if (!isHttpUrl(url)) {
            return result({ success: false, action: "addBookmark", error: `"${url}" is not a valid http(s) URL.` });
        }
        return this._delegate("addBookmark", url);
    }

    async getHistory() {
        return this._delegate("getHistory");
    }

    /** Destructive — requires explicit approval, checked here independently of the caller. */
    async clearHistory({ approved = false } = {}) {
        if (approved !== true) {
            return result({
                success: false,
                action: "clearHistory",
                requiresApproval: true,
                error: "clearHistory is destructive and requires explicit approval (approved !== true)."
            });
        }
        return this._delegate("clearHistory");
    }

    async getDownloads() {
        return this._delegate("getDownloads");
    }

    /** Destructive — requires explicit approval. */
    async clearDownloads({ approved = false } = {}) {
        if (approved !== true) {
            return result({
                success: false,
                action: "clearDownloads",
                requiresApproval: true,
                error: "clearDownloads is destructive and requires explicit approval (approved !== true)."
            });
        }
        return this._delegate("clearDownloads");
    }

    async print() {
        return this._delegate("printPage", undefined, "print");
    }

    async savePage(filePath) {
        return this._delegate("savePage", filePath);
    }

    /** Generic pass-through for the simple, argument-light engine methods above. */
    async _delegate(engineMethod, arg, actionNameOverride) {
        const action = actionNameOverride || engineMethod;
        const missing = this._requireEngine(action);
        if (missing) return missing;

        if (typeof this.engine[engineMethod] !== "function") {
            return result({ success: false, action, error: `Engine does not support ${engineMethod}().` });
        }

        try {
            const data = arg === undefined ? await this.engine[engineMethod]() : await this.engine[engineMethod](arg);
            if (data && data.success === false) {
                return result({
                    success: false,
                    action,
                    data,
                    error: data.error || data.message || `${action} failed.`
                });
            }
            return result({ success: true, action, data: data === undefined ? null : data });
        } catch (error) {
            return result({ success: false, action, error: error && error.message ? error.message : String(error) });
        }
    }
}

module.exports = { BrowserActionAdapter, DESTRUCTIVE_BROWSER_ACTIONS };
