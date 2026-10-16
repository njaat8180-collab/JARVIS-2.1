// // ==========================================
// // JARVIS PRO MAX
// // Offline Matcher
// // renderer/js/brain/matcher.js
// // ==========================================

// "use strict";

// window.Matcher = {

//     commands: [

//         // ==========================
//         // CHROME
//         // ==========================

//         {
//             action: "open_chrome",

//             patterns: [

//                 "open chrome",
//                 "launch chrome",
//                 "start chrome",
//                 "run chrome",
//                 "google chrome",
//                 "browser",
//                 "open browser",
//                 "launch browser",
//                 "start browser",
//                 "open my browser",
//                 "chrome kholo",
//                 "browser kholo"

//             ],

//             response: "Opening Google Chrome."

//         },

//         // ==========================
//         // VS CODE
//         // ==========================

//         {

//             action: "open_vscode",

//             patterns: [

//                 "open vs code",
//                 "launch vs code",
//                 "visual studio code",
//                 "code editor",
//                 "start vscode",
//                 "run vscode",
//                 "open code"

//             ],

//             response: "Opening Visual Studio Code."

//         },

//         // ==========================
//         // NOTEPAD
//         // ==========================

//         {

//             action: "open_notepad",

//             patterns: [

//                 "open notepad",
//                 "start notepad",
//                 "launch notepad",
//                 "run notepad",
//                 "text editor"

//             ],

//             response: "Opening Notepad."

//         },

//         // ==========================
//         // CALCULATOR
//         // ==========================

//         {

//             action: "open_calculator",

//             patterns: [

//                 "calculator",
//                 "open calculator",
//                 "launch calculator",
//                 "start calculator",
//                 "calculate"

//             ],

//             response: "Opening Calculator."

//         },

//         // ==========================
//         // FILE EXPLORER
//         // ==========================

//         {

//             action: "open_explorer",

//             patterns: [

//                 "open explorer",
//                 "file explorer",
//                 "open files",
//                 "my files",
//                 "explorer"

//             ],

//             response: "Opening File Explorer."

//         },

//         // ==========================
//         // SETTINGS
//         // ==========================

//         {

//             action: "open_settings",

//             patterns: [

//                 "settings",
//                 "open settings",
//                 "windows settings",
//                 "system settings"

//             ],

//             response: "Opening Windows Settings."

//         },

//         // ==========================
//         // LOCK PC
//         // ==========================

//         {

//             action: "lock_pc",

//             patterns: [

//                 "lock pc",
//                 "lock computer",
//                 "lock windows",
//                 "lock laptop",
//                 "lock my pc",
//                 "lock my computer"

//             ],

//             response: "Locking your computer."

//         },

//         // ==========================
//         // SHUTDOWN
//         // ==========================

//         {

//             action: "shutdown_pc",

//             patterns: [

//                 "shutdown",
//                 "shutdown pc",
//                 "shutdown computer",
//                 "turn off computer",
//                 "power off"

//             ],

//             response: "Shutting down your computer."

//         },

//         // ==========================
//         // RESTART
//         // ==========================

//         {

//             action: "restart_pc",

//             patterns: [

//                 "restart",
//                 "restart pc",
//                 "restart computer",
//                 "reboot"

//             ],

//             response: "Restarting your computer."

//         },

//         // ==========================
//         // SLEEP
//         // ==========================

//         {

//             action: "sleep_pc",

//             patterns: [

//                 "sleep",
//                 "sleep pc",
//                 "sleep computer"

//             ],

//             response: "Putting your computer to sleep."

//         }

//     ],

//     // ==========================================
//     // FIND COMMAND
//     // ==========================================

//     find(text) {

//         text = (text || "").toLowerCase().trim();

//         for (const command of this.commands) {

//             for (const pattern of command.patterns) {

//                 if (text.includes(pattern)) {

//                     return command;

//                 }

//             }

//         }

//         return null;

//     }

// };
// ==========================================
// JARVIS PRO MAX
// Offline Matcher
// renderer/js/brain/matcher.js
// ==========================================

"use strict";

window.Matcher = {

    commands: [

        {
            action: "open_chrome",
            response: "Opening Google Chrome.",
            patterns: [
                "chrome",
                "open chrome",
                "launch chrome",
                "start chrome",
                "run chrome",
                "browser",
                "open browser",
                "google chrome"
            ]
        },

        {
            action: "open_vscode",
            response: "Opening Visual Studio Code.",
            patterns: [
                "vscode",
                "vs code",
                "visual studio code",
                "open vscode",
                "open vs code",
                "launch vscode",
                "code editor"
            ]
        },

        {
            action: "open_notepad",
            response: "Opening Notepad.",
            patterns: [
                "notepad",
                "open notepad",
                "launch notepad",
                "text editor"
            ]
        },

        {
            action: "open_calculator",
            response: "Opening Calculator.",
            patterns: [
                "calculator",
                "calc",
                "open calculator",
                "launch calculator",
                "start calculator"
            ]
        },

        {
            action: "open_explorer",
            response: "Opening File Explorer.",
            patterns: [
                "explorer",
                "file explorer",
                "open explorer",
                "my files"
            ]
        },

        {
            action: "open_settings",
            response: "Opening Windows Settings.",
            patterns: [
                "settings",
                "open settings",
                "windows settings"
            ]
        },

        {
            action: "lock_pc",
            response: "Locking your computer.",
            patterns: [
                "lock pc",
                "lock computer",
                "lock laptop"
            ]
        },

        {
            action: "shutdown_pc",
            response: "Shutting down your computer.",
            patterns: [
                "shutdown",
                "shutdown pc",
                "power off"
            ]
        },

        {
            action: "restart_pc",
            response: "Restarting your computer.",
            patterns: [
                "restart",
                "restart pc",
                "reboot"
            ]
        },

        {
            action: "sleep_pc",
            response: "Putting your computer to sleep.",
            patterns: [
                "sleep",
                "sleep pc"
            ]
        }

    ],

    // ==================================
    // FIND (enhanced with fuzzy matching)
    // ==================================
    find(text) {

        text = (text || "").toLowerCase().trim();

        // First: exact substring match (fast path — works for correct input)
        for (const command of this.commands) {
            for (const pattern of command.patterns) {
                if (text.includes(pattern)) {
                    return { ...command, confidence: 1.0, matchType: "exact" };
                }
            }
        }

        // Second: fuzzy match via VoiceTolerance phonetic similarity
        // This catches "open crome" → "open chrome" etc.
        if (window.JARVISVoiceTolerance) {
            try {
                const words = text.split(/\s+/);
                for (const command of this.commands) {
                    for (const pattern of command.patterns) {
                        const patternWords = pattern.split(/\s+/);
                        let allMatch = true;
                        let minConf = 1.0;
                        for (const pw of patternWords) {
                            let wordMatched = false;
                            for (const tw of words) {
                                const sim = window.JARVISVoiceTolerance.phoneticSimilarity(tw, pw);
                                if (sim >= 0.75) {
                                    wordMatched = true;
                                    minConf = Math.min(minConf, sim);
                                    break;
                                }
                            }
                            if (!wordMatched) { allMatch = false; break; }
                        }
                        if (allMatch && minConf >= 0.75) {
                            return {
                                ...command,
                                confidence: Math.round(minConf * 100) / 100,
                                matchType: "fuzzy"
                            };
                        }
                    }
                }
            } catch (_) {}
        }

        return null;

    },

    // ==================================
    // MATCH (returns best match with confidence)
    // ==================================
    match(text) {
        return this.find(text);
    }

};