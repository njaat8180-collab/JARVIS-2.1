"use strict";

/*
 * JARVIS PRO MAX — Language Intelligence UI Controller
 * renderer/js/languageUI.js
 *
 * Updates the Language Intelligence panel in Settings with
 * real-time detection info from JARVISLanguageCore.
 */

(function () {

    function $(id) { return document.getElementById(id); }

    function setText(id, text) {
        const el = $(id);
        if (el) el.textContent = text;
    }

    // Listen for JARVIS diagnostic events to update the UI
    function init() {
        if (window.JARVISDiagnostics) {
            window.addEventListener("jarvis:diagnostic", (event) => {
                const diag = event.detail;
                if (diag && diag.kind === "LANG") {
                    const details = diag.details || {};
                    setText("langDetected", details.input ? detectMode(details.input) : "—");
                    setText("langConfidence", details.confidence ? `${Math.round(details.confidence * 100)}%` : "—");
                    setText("langIntent", details.intent || "—");
                    setText("langResponse", (details.responseLanguage || "en").toUpperCase());
                    setText("langLastInput", details.input || "—");
                    setText("langNormalized", details.normalized || "—");
                    setText("langEntity", details.entities ? JSON.stringify(details.entities).slice(0, 60) : "—");
                }
            });
        }

        // Also listen for console messages from voice.js
        const origLog = console.log;
        console.log = function (...args) {
            origLog.apply(console, args);
            const text = args.join(" ");
            if (text.includes("[BRAIN] Language:")) {
                const match = text.match(/Language:\s*(\w+)/);
                if (match) setText("langDetected", match[1]);
            }
            if (text.includes("[BRAIN] Intent:")) {
                const match = text.match(/Intent:\s*(\w+)/);
                if (match) setText("langIntent", match[1]);
            }
            if (text.includes("[BRAIN] Response Language:")) {
                const match = text.match(/Response Language:\s*(\w+)/);
                if (match) setText("langResponse", match[1].toUpperCase());
            }
        };

        console.log("[Language UI] Initialized");
    }

    function detectMode(text) {
        if (window.JARVISLanguageCore) {
            const r = window.JARVISLanguageCore.analyze(text);
            return r.mode;
        }
        return "—";
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    window.JarvisLanguageUI = { init, detectMode };

})();
