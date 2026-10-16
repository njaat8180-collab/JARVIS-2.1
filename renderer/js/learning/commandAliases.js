"use strict";

/*
 * ============================================================
 * JARVIS PRO MAX — COMMAND ALIASES (Learning upgrade)
 * renderer/js/learning/commandAliases.js
 * ============================================================
 *
 * Users teach JARVIS custom command shortcuts:
 *   "Jarvis yaad rakh: jab main 'gk' bolu to 'Google kholo' ka matlab"
 *   → alias { trigger: "gk", expands: "Google kholo" }
 *
 * resolve(text) runs BEFORE intent matching so the Brain sees
 * the full command. Persisted in localStorage (renderer).
 *
 * Dual-exported for Node testing.
 * ============================================================
 */

var CommandAliases = (function () {

    var STORE_KEY = "jarvis.commandAliases.v1";
    var MAX_ALIASES = 100;

    function load() {
        try {
            if (typeof localStorage === "undefined") return [];
            var raw = localStorage.getItem(STORE_KEY);
            var list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list : [];
        } catch (_) { return []; }
    }

    function persist(list) {
        try {
            if (typeof localStorage === "undefined") return false;
            localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, MAX_ALIASES)));
            return true;
        } catch (_) { return false; }
    }

    function normalizeTrigger(t) {
        return String(t || "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 60);
    }

    /**
     * Teach: alias "gk" → "Google kholo"
     */
    function teach(trigger, expands) {
        trigger = normalizeTrigger(trigger);
        expands = String(expands || "").trim().slice(0, 200);
        if (!trigger || !expands) return { success: false, error: "Trigger aur dono required hain" };
        if (trigger.split(" ").length > 5) return { success: false, error: "Trigger max 5 words" };

        var list = load();
        // overwrite existing
        var existing = list.filter(function (a) { return a.trigger !== trigger; });
        existing.push({ trigger: trigger, expands: expands, createdAt: new Date().toISOString(), uses: 0 });
        persist(existing);
        return { success: true, alias: { trigger: trigger, expands: expands } };
    }

    function forget(trigger) {
        trigger = normalizeTrigger(trigger);
        var list = load();
        var kept = list.filter(function (a) { return a.trigger !== trigger; });
        persist(kept);
        return { success: true, removed: list.length - kept.length };
    }

    function list() { return load(); }

    /**
     * Resolve: replace alias triggers with their full commands.
     * Exact-match or prefix ("gk batao" → "Google kholo batao").
     */
    function resolve(text) {
        var t = String(text || "");
        if (!t.trim()) return t;
        var aliases = load();
        if (!aliases.length) return t;

        var lower = " " + t.toLowerCase().trim() + " ";
        for (var i = 0; i < aliases.length; i++) {
            var a = aliases[i];
            var needle = " " + a.trigger + " ";
            // exact whole-message match
            if ((" " + t.toLowerCase().trim() + " ") === needle) {
                bumpUses(a.trigger);
                return a.expands;
            }
            // prefix match: "gk batao" → "Google kholo batao"
            if (lower.indexOf(needle) === 0 || lower.startsWith(needle)) {
                bumpUses(a.trigger);
                return a.expands + " " + t.trim().slice(a.trigger.length).trim();
            }
        }
        return t;
    }

    function bumpUses(trigger) {
        try {
            var list = load();
            for (var i = 0; i < list.length; i++) {
                if (list[i].trigger === trigger) { list[i].uses = (list[i].uses || 0) + 1; }
            }
            persist(list);
        } catch (_) {}
    }

    /**
     * Learn from a teach-command in natural language:
     * "jab main 'gk' bolu to 'Google kholo'"
     */
    function tryLearnFromMessage(text) {
        var m = /(?:jab main|jab hum|jab mai)\s+['"]([^'"]+)['"]\s+(?:bolu|bolun|bolun to|bolu to|kahein|kehun)\s+(?:to|matlab|to matlab)\s+['"]([^'"]+)['"]/i.exec(text);
        if (m) return teach(m[1], m[2]);
        m = /(?:yaad rakh(?:o)?|remember)(?:\s+karo)?\s*:\s*(?:jab|when)\s+(?:main|hum)\s+['"]([^'"]+)['"]\s+(?:bolu|bolun|say)\s+(?:to|matlab)\s+['"]([^'"]+)['"]/i.exec(text);
        if (m) return teach(m[1], m[2]);
        return { success: false, learned: false };
    }

    function exportAll() { return JSON.stringify(load(), null, 2); }
    function importAll(json) {
        try {
            var list = JSON.parse(json);
            if (!Array.isArray(list)) return { success: false, error: "Invalid format" };
            persist(list.filter(function (a) { return a && a.trigger && a.expands; }));
            return { success: true, count: list.length };
        } catch (e) { return { success: false, error: e.message }; }
    }

    return {
        teach: teach,
        forget: forget,
        list: list,
        resolve: resolve,
        tryLearnFromMessage: tryLearnFromMessage,
        exportAll: exportAll,
        importAll: importAll
    };
})();

if (typeof window !== "undefined") window.JARVISCommandAliases = CommandAliases;
if (typeof module !== "undefined" && module.exports) module.exports = CommandAliases;
