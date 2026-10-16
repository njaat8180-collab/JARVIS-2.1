"use strict";

const SEQUENCE = [
    { name: "CORE", critical: true, check: () => !!(globalThis.JARVIS || globalThis.JARVISApp || globalThis.jarvis) },
    { name: "IPC", critical: true, check: () => !!(globalThis.jarvis || globalThis.JarvisBridge) },
    { name: "AUDIO", critical: false, check: () => !!(globalThis.AudioContext || globalThis.webkitAudioContext) },
    { name: "STT", critical: false, check: () => !!globalThis.VoiceEngine },
    { name: "MEMORY", critical: false, check: () => !!(globalThis.jarvis?.users || globalThis.JarvisBridge?.users) },
    { name: "KNOWLEDGE", critical: false, check: () => !!(globalThis.JARVISBrain || globalThis.JARVISDomainRouter) },
    { name: "BROWSER", critical: false, check: () => !!(globalThis.jarvis?.browser || globalThis.JarvisBridge?.browser) },
    { name: "ACTIONS", critical: false, check: () => !!(globalThis.JARVISCommandCenter || globalThis.JARVISBrain) },
    { name: "TTS", critical: false, check: () => !!(globalThis.jarvis?.voice || globalThis.JarvisBridge?.voice) },
    { name: "SECURITY", critical: true, check: () => !!(globalThis.jarvis || globalThis.JarvisBridge) }
];

async function runBootSequence() {
    const results = [];
    const criticalFailures = [];
    for (const stage of SEQUENCE) {
        let ok = false;
        try { ok = !!(await stage.check()); } catch (_) { ok = false; }
        results.push({ name: stage.name, ok, critical: !!stage.critical });
        if (!ok && stage.critical) criticalFailures.push(stage.name);
    }
    return { ready: criticalFailures.length === 0, results, criticalFailures };
}
if (typeof module !== "undefined") module.exports = { SEQUENCE, runBootSequence };
globalThis.JARVISBootHealth = { SEQUENCE, runBootSequence };
