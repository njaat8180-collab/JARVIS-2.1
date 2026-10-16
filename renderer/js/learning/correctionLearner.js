"use strict";

/*
 * ============================================================
 * JARVIS PRO MAX — CORRECTION LEARNER
 * renderer/js/learning/correctionLearner.js
 * ============================================================
 *
 * Learns from:
 *   1. USER CORRECTIONS — "No, I meant Chrome, not Chromium"
 *   2. COMMAND EXAMPLES — "When I say 'YouTube chalao', open YouTube"
 *
 * Stores structured learning examples that improve future intent
 * resolution WITHOUT retraining the LLM:
 *   - Corrections: (input, previousInterpretation, correctInterpretation)
 *   - Commands: (intent, exampleUtterances[])
 *
 * Future utterances are matched against these examples via the
 * existing VoiceTolerance/Matcher stack.
 * ============================================================
 */

(function () {

    const CORRECTIONS_KEY = "jarvis_user_corrections";
    const COMMANDS_KEY = "jarvis_learned_commands";
    const MAX_CORRECTIONS = 500;
    const MAX_COMMANDS = 200;

    let correctionsCache = null;
    let commandsCache = null;

    // ============================================================
    // LOAD / SAVE
    // ============================================================

    function loadCorrections() {
        if (correctionsCache !== null) return correctionsCache;
        try {
            correctionsCache = JSON.parse(localStorage.getItem(CORRECTIONS_KEY) || "[]");
        } catch (_) { correctionsCache = []; }
        return correctionsCache;
    }

    function saveCorrections() {
        try {
            if (correctionsCache.length > MAX_CORRECTIONS) {
                correctionsCache = correctionsCache.slice(-MAX_CORRECTIONS);
            }
            localStorage.setItem(CORRECTIONS_KEY, JSON.stringify(correctionsCache));
        } catch (_) {}
    }

    function loadCommands() {
        if (commandsCache !== null) return commandsCache;
        try {
            commandsCache = JSON.parse(localStorage.getItem(COMMANDS_KEY) || "[]");
        } catch (_) { commandsCache = []; }
        return commandsCache;
    }

    function saveCommands() {
        try {
            if (commandsCache.length > MAX_COMMANDS) {
                commandsCache = commandsCache.slice(-MAX_COMMANDS);
            }
            localStorage.setItem(COMMANDS_KEY, JSON.stringify(commandsCache));
        } catch (_) {}
    }

    // ============================================================
    // 1. DETECT USER CORRECTIONS
    // ============================================================

    // Patterns that indicate the user is correcting JARVIS
    const CORRECTION_PATTERNS = [
        // "No, I meant X" / "not X, Y"
        { pattern: /no[, ]+(?:i\s+)?meant\s+(.+?)(?:,?\s*not\s+(.+))?$/i, extract: "meant" },
        { pattern: /no[, ]+(?:i\s+)?wanted\s+(.+?)(?:,?\s*not\s+(.+))?$/i, extract: "meant" },
        // "not X, but Y" / "not X, Y"
        { pattern: /not\s+([\w\s]+?),?\s+(?:but|rather)\s+(.+)$/i, extract: "not_but" },
        { pattern: /i\s+(?:said|asked\s+for)\s+(.+?),?\s*not\s+(.+)$/i, extract: "said_not" },
        // "I meant X not Y" (Hinglish)
        { pattern: /(?:mera\s+)?matlab\s+(?:thaa?|tha|hai)?\s*(.+?)\s*,?\s*(?:nahi(n)?|not)\s+(.+)$/i, extract: "meant" },
        // "wrong, it should be X"
        { pattern: /wrong[, ]+it\s+(?:should\s+be|shouldve\s+been)\s+(.+)$/i, extract: "should_be" },
        { pattern: /galat[, ]+([^,]+?)(?:\s+chaiye|\s+tha|\s+hai)?$/i, extract: "should_be" },
    ];

    /**
     * Detect if a user message is a correction.
     * Returns { isCorrection, correctInterpretation, previousInterpretation } or null.
     */
    function detectCorrection(message) {
        const text = String(message || "").trim();
        if (!text || text.length > 200) return null;

        for (const { pattern, extract } of CORRECTION_PATTERNS) {
            const match = text.match(pattern);
            if (!match) continue;

            if (extract === "meant") {
                // "No, I meant X" or "matlab X, not Y"
                const correct = (match[1] || "").trim();
                const previous = (match[3] || match[2] || "").trim();
                if (correct) {
                    return {
                        isCorrection: true,
                        correctInterpretation: correct,
                        previousInterpretation: previous || "",
                    };
                }
            } else if (extract === "not_but") {
                // "not X, but Y" — X is wrong, Y is correct
                const previous = (match[1] || "").trim();
                const correct = (match[2] || "").trim();
                if (correct) {
                    return {
                        isCorrection: true,
                        correctInterpretation: correct,
                        previousInterpretation: previous,
                    };
                }
            } else if (extract === "said_not") {
                // "I said X, not Y" — X is correct, Y is wrong
                const correct = (match[1] || "").trim();
                const previous = (match[2] || "").trim();
                if (correct) {
                    return {
                        isCorrection: true,
                        correctInterpretation: correct,
                        previousInterpretation: previous,
                    };
                }
            } else if (extract === "should_be") {
                // "wrong, it should be X"
                const correct = (match[1] || "").trim();
                if (correct) {
                    return {
                        isCorrection: true,
                        correctInterpretation: correct,
                        previousInterpretation: "",
                    };
                }
            }
        }

        return null;
    }

    /**
     * Store a correction (with permission already granted).
     */
    function storeCorrection({ input, previousInterpretation, correctInterpretation, approved }) {
        const corrections = loadCorrections();
        const entry = {
            id: "c_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6),
            type: "correction",
            input: String(input || ""),
            previousInterpretation: String(previousInterpretation || ""),
            correctInterpretation: String(correctInterpretation || ""),
            approved: approved === true,
            learnedAt: new Date().toISOString(),
        };
        corrections.push(entry);
        saveCorrections();

        window.JARVISKnowledgeStore?.log({
            action: "correction_learned",
            input: entry.input.slice(0, 60),
            correct: entry.correctInterpretation.slice(0, 60),
        });

        return entry;
    }

    /**
     * Look up past corrections for a current input (fuzzy).
     * Returns the corrected interpretation or null.
     */
    function lookupCorrection(input) {
        const corrections = loadCorrections();
        if (!corrections.length) return null;

        const inputNorm = normalizeText(input);
        if (!inputNorm) return null;

        // Exact-ish match on original input
        for (const c of corrections.slice().reverse()) {
            if (normalizeText(c.input) === inputNorm) {
                return c.correctInterpretation;
            }
        }

        // The previous wrong interpretation matches current input
        for (const c of corrections.slice().reverse()) {
            const prev = normalizeText(c.previousInterpretation);
            if (prev && (prev === inputNorm || prev.includes(inputNorm) || inputNorm.includes(prev))) {
                return c.correctInterpretation;
            }
        }

        return null;
    }

    // ============================================================
    // 2. COMMAND LEARNING
    // ============================================================

    // Patterns for "when I say X, do Y"
    const COMMAND_PATTERNS = [
        // "When I say 'X', open Y" / "when i say X, do Y"
        { pattern: /when\s+i\s+say\s+["']?([^"']+)["']?,?\s*(.+)$/i, extract: "when_say" },
        // "If I say X, open Y"
        { pattern: /if\s+i\s+say\s+["']?([^"']+)["']?,?\s*(.+)$/i, extract: "when_say" },
        // "Remember: X means Y"
        { pattern: /remember[:\s]+["']?([^"']+)["']?\s+(?:means?|ka\s+matlab)\s+(.+)$/i, extract: "means" },
        // "jab main X bolu, to Y karna" (Hindi)
        { pattern: /jab\s+(?:main|mai(n)?)\s+["']?([^"']+)["']?\s+(?:bolu(n)?|bolun|kahu(n)?|bataun|bolo?onga)\s*,?\s*(?:to|toh)?\s*(.+)$/i, extract: "when_say" },
    ];

    /**
     * Detect a command-teaching message.
     * Returns { isCommandTeach, utterance, command } or null.
     */
    function detectCommandTeach(message) {
        const text = String(message || "").trim();
        if (!text || text.length > 300) return null;

        for (const { pattern, extract } of COMMAND_PATTERNS) {
            const match = text.match(pattern);
            if (!match) continue;

            if (extract === "when_say") {
                const utterance = (match[2] || match[1] || "").trim();
                const command = (match[4] || match[3] || match[2] || "").trim();
                // For "when I say X, Y" — X is utterance, Y is command
                const actualUtterance = (match[1] || match[2] || "").trim();
                const actualCommand = (match[2] && match.length > 2 ? match[2] : match[1]).trim();
                if (actualUtterance && actualCommand && actualUtterance !== actualCommand) {
                    return { isCommandTeach: true, utterance: actualUtterance, command: actualCommand };
                }
            } else if (extract === "means") {
                const utterance = (match[1] || "").trim();
                const command = (match[2] || "").trim();
                if (utterance && command) {
                    return { isCommandTeach: true, utterance, command };
                }
            }
        }

        return null;
    }

    /**
     * Store a learned command (with permission).
     */
    function storeCommand({ utterance, command, intent, examples = [], approved }) {
        const commands = loadCommands();

        // Generate example utterances
        const generatedExamples = generateExamples(utterance, command);
        const allExamples = [...new Set([utterance, ...examples, ...generatedExamples])].filter(Boolean);

        const entry = {
            id: "cmd_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6),
            utterance: String(utterance || ""),
            command: String(command || ""),
            intent: intent || inferIntent(command),
            examples: allExamples,
            approved: approved === true,
            learnedAt: new Date().toISOString(),
            useCount: 0,
        };

        // Dedup: if same utterance exists, update it
        const existingIdx = commands.findIndex(c => normalizeText(c.utterance) === normalizeText(utterance));
        if (existingIdx >= 0) {
            commands[existingIdx] = { ...commands[existingIdx], ...entry, id: commands[existingIdx].id, useCount: commands[existingIdx].useCount };
        } else {
            commands.push(entry);
        }
        saveCommands();

        window.JARVISKnowledgeStore?.log({
            action: "command_learned",
            utterance: entry.utterance.slice(0, 60),
            intent: entry.intent,
        });

        return entry;
    }

    /**
     * Look up a learned command for a given utterance (fuzzy).
     */
    function lookupCommand(utterance) {
        const commands = loadCommands();
        if (!commands.length) return null;

        const norm = normalizeText(utterance);
        if (!norm) return null;

        for (const cmd of commands) {
            // Direct utterance match
            if (normalizeText(cmd.utterance) === norm) {
                cmd.useCount = (cmd.useCount || 0) + 1;
                saveCommands();
                return cmd;
            }
            // Example match
            for (const example of (cmd.examples || [])) {
                if (normalizeText(example) === norm) {
                    cmd.useCount = (cmd.useCount || 0) + 1;
                    saveCommands();
                    return cmd;
                }
            }
            // Substring match (utterance contains the learned phrase)
            const cmdNorm = normalizeText(cmd.utterance);
            if (cmdNorm && (norm.includes(cmdNorm) || cmdNorm.includes(norm)) && cmdNorm.length > 3) {
                cmd.useCount = (cmd.useCount || 0) + 1;
                saveCommands();
                return cmd;
            }
        }

        return null;
    }

    /**
     * Generate example utterance variants for a command.
     * "YouTube chalao" → open YouTube / YouTube kholo / YouTube start karo
     */
    function generateExamples(utterance, command) {
        const examples = [];
        const u = String(utterance || "").toLowerCase().trim();
        const c = String(command || "").toLowerCase().trim();

        // Extract the entity (app/site name) from the command
        const openMatch = c.match(/(?:open|launch|start|run|kholo|chalao)\s+(.+)/);
        const entity = openMatch ? openMatch[1].trim() : "";

        if (entity) {
            examples.push(`open ${entity}`);
            examples.push(`launch ${entity}`);
            examples.push(`${entity} kholo`);
            examples.push(`${entity} chalao`);
            examples.push(`${entity} start karo`);
            examples.push(`jarvis open ${entity}`);
        }

        return examples;
    }

    /**
     * Infer intent from a command description.
     */
    function inferIntent(command) {
        const c = String(command || "").toLowerCase();
        if (/(?:open|launch|start|kholo|chalao)/.test(c)) return "OPEN_APP";
        if (/(?:close|band|exit|quit)/.test(c)) return "CLOSE_APP";
        if (/(?:search|dhoondo|khojo|find)/.test(c)) return "SEARCH";
        if (/(?:shutdown|band karo|power off)/.test(c)) return "SYSTEM_CONTROL_SHUTDOWN";
        if (/(?:restart|reboot)/.test(c)) return "SYSTEM_CONTROL_RESTART";
        if (/(?:weather|mausam)/.test(c)) return "WEATHER";
        if (/(?:time|samay)/.test(c)) return "TIME";
        if (/(?:news|khabar)/.test(c)) return "NEWS";
        return "CUSTOM_COMMAND";
    }

    // ============================================================
    // HELPERS
    // ============================================================

    function normalizeText(text) {
        return String(text || "")
            .toLowerCase()
            .replace(/[^\w\s]/g, "")
            .replace(/\s+/g, " ")
            .trim();
    }

    function stats() {
        return {
            corrections: loadCorrections().length,
            commands: loadCommands().length,
            topCommands: loadCommands().sort((a, b) => (b.useCount || 0) - (a.useCount || 0)).slice(0, 5),
        };
    }

    function clearAll() {
        correctionsCache = [];
        commandsCache = [];
        saveCorrections();
        saveCommands();
    }

    // ============================================================
    // EXPORT
    // ============================================================

    window.JARVISCorrectionLearner = Object.freeze({
        version: "CL-V1",
        detectCorrection,
        storeCorrection,
        lookupCorrection,
        detectCommandTeach,
        storeCommand,
        lookupCommand,
        generateExamples,
        inferIntent,
        stats,
        clearAll,
    });

    console.log("JARVIS Correction Learner CL-V1 READY");

})();
