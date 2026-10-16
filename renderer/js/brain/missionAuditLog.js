"use strict";
(function () {
    const KEY = "jarvis.mission-audit.v1";
    function read() { try { const value = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(value) ? value : []; } catch (_) { return []; } }
    function record(event = {}) { const item = { at: new Date().toISOString(), type: String(event.type || "event"), state: String(event.state || "info"), summary: String(event.summary || "").slice(0, 240), confidence: Number.isFinite(Number(event.confidence)) ? Number(event.confidence) : null }; try { localStorage.setItem(KEY, JSON.stringify([item, ...read()].slice(0, 200))); } catch (_) {} return item; }
    function list(limit = 40) { return read().slice(0, Math.max(1, Math.min(200, Number(limit) || 40))); }
    window.JARVISMissionAudit = Object.freeze({ record, list, clear: () => { localStorage.removeItem(KEY); return { success: true }; } });
})();
