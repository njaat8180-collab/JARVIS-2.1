"use strict";

/*
 * ============================================================
 * JARVIS PRO MAX — VOICE TOLERANCE ENGINE
 * renderer/js/language/VoiceTolerance.js
 * ============================================================
 *
 * THE PROBLEM
 * -----------
 * STT (offline Whisper) produces imperfect text:
 *   "helo jarvis open crome" instead of "hello jarvis open chrome"
 *   "हेलो जार्विस" instead of "hello jarvis"
 *   "open v s code" instead of "open vscode"
 *
 * Existing matchers (NCE, BrowserVoiceControl, Matcher) use
 * exact substring/regex matching. Even one wrong letter fails.
 *
 * THE SOLUTION (this module)
 * --------------------------
 * ONE centralized pipeline that converts imperfect STT text
 * into a canonical representation that downstream modules can
 * rely on:
 *
 *   RAW STT
 *     → text cleaning (Unicode NFC, punctuation, spaces, dupes)
 *     → Hindi transliteration (reuse JARVISHindiTranslit)
 *     → STT spelling correction (helo→hello, crome→chrome)
 *     → phonetic fuzzy matching (krom→chrome via Soundex)
 *     → command synonym normalization
 *     → wake-word detection + extraction
 *     → grammar extraction (action + target + params)
 *     → confidence scoring
 *     → canonical text + debug info
 *
 * Downstream modules receive the CANONICAL text and never
 * see the raw STT errors. No existing module is replaced —
 * VoiceTolerance sits ABOVE the existing pipeline.
 *
 * OFFLINE: No cloud AI, no external API. 100% local.
 * ============================================================
 */

(function () {

    // ============================================================
    // 1. CONFIG
    // ============================================================

    const DEBUG = localStorage.getItem("jarvis_voice_debug") === "1";

    // Confidence thresholds
    const THRESHOLDS = {
        WAKE_WORD: 0.70,       // below this → not a wake word
        WAKE_WORD_HIGH: 0.85,  // above this → high confidence
        ACTION: 0.65,
        TARGET: 0.60,
        DANGEROUS_MIN: 0.80,   // shutdown/restart need at least this
    };

    // ============================================================
    // 2. KNOWN VOCABULARY (for fuzzy matching)
    // ============================================================

    // All words that are "correct" — built from the project's
    // actual command words, app aliases, site aliases, entities.
    // If a word is NOT in this set, we try to fuzzy-match it.

    const KNOWN_WORDS = new Set([
        // Wake word
        "jarvis",

        // Actions
        "open", "launch", "start", "run", "execute",
        "close", "exit", "quit", "kill", "terminate",
        "shutdown", "shut", "down",
        "restart", "reboot",
        "sleep", "suspend",
        "lock", "logoff", "log", "out", "off", "sign",
        "search", "find", "look", "for",
        "play", "pause", "resume", "stop",
        "tell", "show", "give", "say",
        "remember", "forget", "recall",
        "go", "back", "forward", "reload", "refresh",
        "new", "tab", "window",
        "screenshot", "capture",
        "set", "get", "check", "what", "who", "when", "where", "why", "how",
        "is", "are", "was", "were", "the", "a", "an",
        "my", "me", "please", "can", "you", "could", "would",
        "do", "did", "does", "will", "should",
        "in", "on", "at", "to", "from", "of", "about",
        "and", "or", "but", "if", "then",
        "now", "today", "tomorrow", "yesterday",
        "weather", "mausam", "temperature", "forecast",
        "time", "samay", "date", "day",
        "news", "khabar",
        "music", "gana", "song", "video",
        "volume", "brightness", "screen",
        "computer", "pc", "system", "laptop",
        "browser", "internet", "wifi",
        "battery", "ram", "cpu", "memory", "storage", "disk",
        "file", "folder", "photo", "image", "picture",
        "download", "upload",
        "alarm", "timer", "reminder", "list",
        "help", "settings", "language",
        "hello", "hi", "hey", "ok", "okay", "yo",
        "namaste", "namaskar", "pranam",
        "thanks", "thank", "youre", "welcome",
        "yes", "no", "yeah", "nope",
        "band", "bandh", "karo", "kar", "do", "batao", "bata",
        "dikhao", "dikha", "dhoondo", "dhundo", "khojo",
        "kholo", "khol", "chalao", "chalu", "shuru",
        "roko", "rok", "mitao", "hatao", "rakho", "lao", "bhejo",
        "kya", "kaise", "kyun", "kahan", "kab", "kaun", "kitna",
        "hai", "hain", "hoon", "tha", "thi", "the",
        "nahi", "na", "haan", "ji", "accha", "theek",
        "mujhe", "mera", "meri", "mere", "hume",
        "aap", "tum", "ise", "use", "wo", "ye",
        "yahan", "wahan", "andar", "bahar", "upar", "neeche",
        "abhi", "aaj", "kal", "subah", "shaam", "raat",
        "aur", "ya", "phir", "par", "lekin", "magar", "to", "bhi", "hi",
        "se", "ko", "ka", "ki", "ke", "ne",
        "mein", "ke", "liye", "baare",
        "minute", "hour", "second", "baje",
        "rupee", "rupees", "dollar", "euro",
    ]);

    // Apps — same as NCE APP_ALIASES (single source of truth: NCE)
    // We import them at runtime, but also keep a local copy for fuzzy matching
    const APP_WORDS = new Set([
        "chrome", "edge", "firefox", "brave", "opera",
        "vscode", "notepad", "code", "git", "bash", "cmd",
        "powershell", "word", "excel", "powerpoint", "outlook",
        "teams", "onenote", "calculator", "explorer", "settings",
        "paint", "task", "manager", "control", "panel", "camera",
        "photos", "snipping", "tool", "mail", "calendar",
        "discord", "whatsapp", "telegram", "skype", "slack", "zoom",
        "spotify", "vlc", "media", "player", "steam", "obs",
        "github", "studio", "visual", "microsoft", "google",
        "mozilla", "windows", "plus",
    ]);

    // Sites — from BrowserVoiceControl SITE_ALIASES
    const SITE_WORDS = new Set([
        "youtube", "google", "gmail", "email", "github", "facebook",
        "instagram", "twitter", "whatsapp", "netflix", "amazon",
        "wikipedia", "maps", "drive", "spotify", "chatgpt",
        "linkedin", "reddit",
    ]);

    // ============================================================
    // 3. STT SPELLING CORRECTION DICTIONARY
    // ============================================================
    // Maps common STT mis-transcriptions to correct words.
    // These are NOT random fuzzy guesses — they are KNOWN patterns
    // observed from offline Whisper with Indian accents (kept as a corrective layer that applies regardless of which local STT engine is in use).

    const STT_FIXES = {
        // Hello / greetings
        "helo": "hello", "heloo": "hello", "hilo": "hello",
        "hillo": "hello", "hallo": "hello", "hellow": "hello",
        "helloo": "hello", "hela": "hello", "hylo": "hello",
        "jelow": "hello", "elo": "hello",

        // Jarvis
        "jarves": "jarvis", "jarwis": "jarvis", "jarvies": "jarvis",
        "jarwes": "jarvis", "jarvus": "jarvis", "jarvas": "jarvis",
        "jervis": "jarvis", "javis": "jarvis", "jarvs": "jarvis",
        "jervus": "jarvis", "jarviss": "jarvis", "jerwis": "jarvis",
        "jarvice": "jarvis", "jarvise": "jarvis",

        // Chrome
        "crome": "chrome", "krom": "chrome", "chrom": "chrome",
        "crhome": "chrome", "chrme": "chrome", "krome": "chrome",
        "chroma": "chrome", "crom": "chrome", "kromium": "chrome",

        // VS Code
        "vscode": "vscode", "vs": "vs", "vsc": "vscode",
        "vscodee": "vscode", "vscodey": "vscode",

        // Discord
        "discrod": "discord", "discor": "discord", "discordd": "discord",
        "diskord": "discord", "discrd": "discord",

        // Spotify
        "spodify": "spotify", "spotfy": "spotify", "spotifay": "spotify",
        "spotifyy": "spotify", "sptify": "spotify", "spotfiy": "spotify",

        // Firefox
        "firefoz": "firefox", "firefoks": "firefox", "fox": "firefox",
        "firefoxx": "firefox", "firefoxs": "firefox",

        // Calculator
        "calculater": "calculator", "calc": "calculator",
        "calculet": "calculator", "calculatr": "calculator",

        // Notepad
        "notpad": "notepad", "note pad": "notepad",
        "noteppad": "notepad", "noteped": "notepad",

        // Settings
        "setting": "settings", "setings": "settings",
        "seting": "settings", "settingz": "settings",

        // Explorer
        "explor": "explorer", "explrer": "explorer",
        "explore": "explorer", "explorr": "explorer",

        // Shutdown
        "shutdon": "shutdown", "shutdow": "shutdown",
        "shutdonw": "shutdown", "shutdownn": "shutdown",
        "shut": "shutdown", "shutdwn": "shutdown",

        // Restart
        "restert": "restart", "restartt": "restart",
        "restar": "restart", "restrt": "restart",

        // Computer
        "computr": "computer", "compter": "computer",
        "comp": "computer", "computor": "computer",
        "computter": "computer",

        // Browser
        "brower": "browser", "browsr": "browser",
        "brower": "browser", "brwser": "browser",

        // Weather
        "wether": "weather", "weathr": "weather",
        "whether": "weather", "weathar": "weather",

        // Temperature
        "temprature": "temperature", "temparature": "temperature",
        "tempratur": "temperature", "temp": "temperature",

        // YouTube
        "utube": "youtube", "yutube": "youtube", "youtub": "youtube",
        "utub": "youtube", "youtubr": "youtube", "youtubee": "youtube",

        // Wikipedia
        "wikipeda": "wikipedia", "wikipedi": "wikipedia",
        "wikpedia": "wikipedia", "wikipeda": "wikipedia",

        // Generic STT artifacts
        "plz": "please", "pls": "please", "plse": "please",
        "kya": "kya", "hey": "hey",
        "d": "the", "da": "the", "de": "the",
        "wat": "what", "whn": "when", "whr": "where",
        "shud": "should", "wud": "would", "cud": "could",
        "u": "you", "ur": "your", "r": "are", "n": "and",
    };

    // ============================================================
    // 4. COMMAND SYNONYMS (action normalization)
    // ============================================================

    const ACTION_SYNONYMS = {
        // OPEN
        "open": "open", "launch": "open", "start": "open",
        "run": "open", "execute": "open",
        "kholo": "open", "khol": "open", "kholdo": "open",
        "chalao": "open", "chalu": "open", "shuru": "open",
        "shurukaro": "open", "bajao": "open", "laga": "open",

        // CLOSE
        "close": "close", "exit": "close", "quit": "close",
        "band": "close", "bandkaro": "close", "hatao": "close",
        "mitao": "close",

        // SHUTDOWN
        "shutdown": "shutdown", "shut": "shutdown",
        "poweroff": "shutdown", "turnoff": "shutdown",
        "bandkar": "shutdown", // context-dependent

        // RESTART
        "restart": "restart", "reboot": "restart",

        // SLEEP
        "sleep": "sleep", "suspend": "sleep", "sulao": "sleep",

        // LOCK
        "lock": "lock", "secure": "lock",

        // SEARCH
        "search": "search", "find": "search", "look": "search",
        "dhoondo": "search", "dhundo": "search", "khojo": "search",

        // TELL/SHOW
        "tell": "tell", "show": "show", "dikhao": "show",
        "batao": "tell", "bata": "tell", "batado": "tell",

        // PLAY
        "play": "play", "chalao": "play", // context-dependent

        // REMEMBER
        "remember": "remember", "yaad": "remember",

        // GO
        "go": "go", "visit": "go",
    };

    // Dangerous actions — require higher confidence
    const DANGEROUS_ACTIONS = new Set(["shutdown", "restart", "delete", "format", "logoff"]);

    // ============================================================
    // 5. TEXT CLEANING
    // ============================================================

    function cleanText(input) {
        let text = String(input || "").normalize("NFC").trim();

        // Convert smart quotes to straight quotes
        text = text.replace(/[\u201C\u201D]/g, '"');
        text = text.replace(/[\u2018\u2019]/g, "'");

        // Remove Devanagari danda (।) → period → then remove
        text = text.replace(/\u0964/g, ".");
        text = text.replace(/\u0965/g, "..");

        // Remove excessive punctuation (keep one if between words)
        text = text.replace(/[!]{2,}/g, "!");
        text = text.replace(/[?]{2,}/g, "?");
        text = text.replace(/[.]{2,}/g, ".");

        // Strip leading/trailing punctuation
        text = text.replace(/^[^\p{L}\p{N}]+/u, "");
        text = text.replace(/[^\p{L}\p{N}]+$/u, "");

        // Collapse multiple spaces
        text = text.replace(/\s+/g, " ").trim();

        // Deduplicate consecutive repeated words
        // "open open chrome" → "open chrome"
        // "jarvis jarvis open" → "jarvis open"
        // But DON'T remove non-consecutive repeats
        text = text.replace(/\b(\w+)(?:\s+\1\b)+/gi, "$1");

        // Lowercase for processing
        text = text.toLowerCase().trim();

        return text;
    }

    // ============================================================
    // 6. PHONETIC ALGORITHMS
    // ============================================================

    /**
     * Simplified Soundex for English words.
     * Maps phonetically similar words to the same code.
     * "crome" and "chrome" → "C650"
     * "helo" and "hello" → "H400"
     */
    function soundex(word) {
        const w = String(word || "").toLowerCase().replace(/[^a-z]/g, "");
        if (!w) return "";
        if (w.length === 1) return w.toUpperCase() + "000";

        // For voice matching: v/w are phonetically equivalent (code 1),
        // so we DON'T skip 'w' like traditional Soundex does.
        const codes = {
            b: "1", f: "1", p: "1", v: "1", w: "1",
            c: "2", g: "2", j: "2", k: "2", q: "2", s: "2", x: "2", z: "2",
            d: "3", t: "3",
            l: "4",
            m: "5", n: "5",
            r: "6",
        };

        let result = w[0].toUpperCase();
        let prevCode = codes[w[0]] || "0";

        for (let i = 1; i < w.length && result.length < 4; i++) {
            const ch = w[i];
            // Skip h, y — they don't affect pronunciation.
            // (w is NOT skipped — it's phonetically like v)
            if (ch === "h" || ch === "y") {
                prevCode = "0";
                continue;
            }
            const code = codes[ch] || "0";
            if (code !== "0" && code !== prevCode) {
                result += code;
            }
            prevCode = code;
        }

        return (result + "000").slice(0, 4);
    }

    /**
     * Levenshtein edit distance — how many character
     * insertions/deletions/substitutions to transform a→b.
     */
    function editDistance(a, b) {
        const s1 = String(a || "").toLowerCase();
        const s2 = String(b || "").toLowerCase();
        if (s1 === s2) return 0;
        if (!s1.length) return s2.length;
        if (!s2.length) return s1.length;

        const matrix = [];
        for (let i = 0; i <= s2.length; i++) matrix[i] = [i];
        for (let j = 0; j <= s1.length; j++) matrix[0][j] = j;

        for (let i = 1; i <= s2.length; i++) {
            for (let j = 1; j <= s1.length; j++) {
                const cost = s1[j - 1] === s2[i - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + cost
                );
            }
        }
        return matrix[s2.length][s1.length];
    }

    /**
     * Phonetic similarity score (0..1).
     * Combines Soundex match + edit distance ratio.
     */
    function phoneticSimilarity(word1, word2) {
        const w1 = String(word1 || "").toLowerCase();
        const w2 = String(word2 || "").toLowerCase();
        if (!w1 || !w2) return 0;
        if (w1 === w2) return 1.0;

        const maxLen = Math.max(w1.length, w2.length);
        const dist = editDistance(w1, w2);
        const distRatio = 1 - (dist / maxLen);

        const s1 = soundex(w1);
        const s2 = soundex(w2);
        const soundexMatch = s1 === s2 ? 0.3 : 0;

        // Weighted combination
        let score = (distRatio * 0.7) + soundexMatch;

        // Bonus for same first letter
        if (w1[0] === w2[0]) {
            score += 0.05;
        } else {
            // Phonetic first-letter equivalence: k↔c, b↔p, f↔v, j↔g, s↔z, t↔d
            const PHONETIC_PAIRS = [
                ["k", "c"], ["b", "p"], ["f", "v"], ["f", "w"],
                ["j", "g"], ["s", "z"], ["t", "d"], ["c", "s"],
            ];
            const a = w1[0], b = w2[0];
            if (PHONETIC_PAIRS.some(p => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a))) {
                score += 0.15;
            }
        }

        return Math.min(1.0, score);
    }

    // ============================================================
    // 7. FUZZY WORD CORRECTION
    // ============================================================

    /**
     * Build the full known-vocabulary set at runtime by pulling
     * from NCE APP_ALIASES and BVC SITE_ALIASES if available.
     */
    let _vocabCache = null;
    function getVocab() {
        if (_vocabCache) return _vocabCache;

        _vocabCache = new Set(KNOWN_WORDS);
        for (const w of APP_WORDS) _vocabCache.add(w);
        for (const w of SITE_WORDS) _vocabCache.add(w);

        // Pull from NCE if available
        try {
            if (window.JARVISNaturalCommandEngine) {
                // NCE is frozen; its internals aren't exposed.
                // We rely on our local APP_WORDS copy.
            }
        } catch (_) {}

        // Pull from BVC if available
        try {
            if (window.BrowserVoiceControl && window.BrowserVoiceControl._siteAliases) {
                for (const site of Object.keys(window.BrowserVoiceControl._siteAliases)) {
                    _vocabCache.add(site);
                }
            }
        } catch (_) {}

        return _vocabCache;
    }

    /**
     * Find the best fuzzy match for a word against known vocabulary.
     * Returns { word, confidence } or null.
     *
     * SAFETY: Only corrects words that are CLOSE to a known word.
     * "banana" will NOT become "chrome" — the similarity is too low.
     */
    function fuzzyCorrectWord(word) {
        const w = String(word || "").toLowerCase().trim();
        if (!w) return null;

        // 1. Exact STT fix lookup
        if (STT_FIXES[w]) {
            return { word: STT_FIXES[w], confidence: 0.98, source: "stt_dict" };
        }

        // 2. Exact vocabulary match — no correction needed
        const vocab = getVocab();
        if (vocab.has(w)) {
            return { word: w, confidence: 1.0, source: "exact" };
        }

        // 3. Phonetic fuzzy match against known vocabulary
        let bestMatch = null;
        let bestScore = 0;

        for (const known of vocab) {
            // Skip very short words for fuzzy matching (too many false positives)
            if (known.length < 3 && w.length < 3) continue;

            // Only attempt if lengths are within reasonable range
            const lenDiff = Math.abs(w.length - known.length);
            if (lenDiff > Math.max(2, Math.floor(known.length * 0.4))) continue;

            const score = phoneticSimilarity(w, known);

            // Require minimum similarity
            if (score > bestScore && score >= 0.65) {
                bestScore = score;
                bestMatch = known;
            }
        }

        if (bestMatch) {
            return {
                word: bestMatch,
                confidence: Math.round(bestScore * 100) / 100,
                source: "phonetic"
            };
        }

        // 4. No correction found — return original
        return { word: w, confidence: 0.5, source: "unknown" };
    }

    /**
     * Correct an entire phrase word-by-word.
     * Preserves multi-word known phrases (e.g. "vs code", "task manager").
     */
    function correctPhrase(text) {
        const words = text.split(/\s+/);
        const corrected = [];

        for (let i = 0; i < words.length; i++) {
            const word = words[i];

            // Try multi-word match first (look ahead 2-3 words)
            let matched = false;
            for (let lookAhead = Math.min(3, words.length - i - 1); lookAhead >= 1; lookAhead--) {
                const phrase = words.slice(i, i + 1 + lookAhead).join(" ");
                const vocab = getVocab();
                if (vocab.has(phrase)) {
                    corrected.push(phrase);
                    i += lookAhead;
                    matched = true;
                    break;
                }
            }
            if (matched) continue;

            // Single word correction
            const result = fuzzyCorrectWord(word);
            corrected.push(result.word);
        }

        return corrected.join(" ");
    }

    // ============================================================
    // 8. WAKE WORD DETECTION (fuzzy)
    // ============================================================

    const WAKE_WORD_VARIANTS = new Set([
        "jarvis", "jarves", "jarwis", "jarvies", "jarwes",
        "jarvus", "jarvas", "jervis", "javis", "jarvs",
        "jervus", "jerwis", "jarvice", "jarvise",
    ]);

    // Devanagari wake word variants (transliterated by HindiTranslit first)
    // After transliteration: जार्विस → "jarvis", जारविस → "jaravis" etc.
    // We also catch those:
    const WAKE_WORD_DEVA = [
        "\u091C\u093E\u0930\u094D\u0935\u093F\u0938", // जार्विस
        "\u091C\u093E\u0930\u0935\u093F\u0938",     // जारविस
        "\u091C\u093E\u0930\u094D\u0935\u093F\u0938\u094D", // जार्विस्
    ];

    function detectWakeWord(text) {
        const words = text.split(/\s+/);

        // Check for wake word in first 3 words
        for (let i = 0; i < Math.min(3, words.length); i++) {
            const word = words[i].toLowerCase();

            // Exact match
            if (WAKE_WORD_VARIANTS.has(word)) {
                return { word: "jarvis", confidence: 0.98, position: i };
            }

            // STT fix match
            if (STT_FIXES[word] === "jarvis") {
                return { word: "jarvis", confidence: 0.96, position: i };
            }

            // Phonetic match
            const sim = phoneticSimilarity(word, "jarvis");
            if (sim >= THRESHOLDS.WAKE_WORD) {
                return {
                    word: "jarvis",
                    confidence: Math.round(sim * 100) / 100,
                    position: i
                };
            }
        }

        // Check Devanagari (before transliteration)
        for (const deva of WAKE_WORD_DEVA) {
            if (text.includes(deva)) {
                return { word: "jarvis", confidence: 0.95, position: 0 };
            }
        }

        return null;
    }

    // ============================================================
    // 9. ACTION + TARGET EXTRACTION (grammar)
    // ============================================================

    // After normalization, extract the grammatical structure:
    // [WAKE_WORD] + [ACTION] + [TARGET] + [PARAMETERS]

    function extractGrammar(text, wakeWordInfo) {
        let working = text;

        // Remove wake word if present
        if (wakeWordInfo) {
            const words = working.split(/\s+/);
            words.splice(wakeWordInfo.position, 1);
            working = words.join(" ").trim();
        }

        // Remove filler words: "please", "can you", "could you", "would you",
        // "hey", "ok", "okay", "my", "me", "for me", "mujhe", "mere liye"
        working = working.replace(/\b(?:please|can you|could you|would you|hey|okay|ok|yo|arey|suno|na)\b/gi, "");
        working = working.replace(/\b(?:mujhe|mere liye|mere liye|mera|meri)\b/gi, "");
        working = working.replace(/\s+/g, " ").trim();

        // Find action word
        let action = null;
        let actionConfidence = 0;
        const words = working.split(/\s+/);

        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            const synonym = ACTION_SYNONYMS[word];

            if (synonym) {
                action = synonym;
                actionConfidence = 0.95;
                break;
            }

            // Fuzzy match action
            for (const [syn, canonical] of Object.entries(ACTION_SYNONYMS)) {
                if (syn.length < 3) continue;
                const sim = phoneticSimilarity(word, syn);
                if (sim >= 0.75) {
                    action = canonical;
                    actionConfidence = Math.round(sim * 100) / 100;
                    break;
                }
            }
            if (action) break;
        }

        // Extract target (everything after action, or the whole text if no action found)
        let target = "";
        let targetConfidence = 0;

        if (action && actionConfidence >= THRESHOLDS.ACTION) {
            const actionIdx = words.findIndex(w =>
                ACTION_SYNONYMS[w] === action ||
                Object.entries(ACTION_SYNONYMS).some(([syn, can]) =>
                    can === action && phoneticSimilarity(w, syn) >= 0.75
                )
            );
            if (actionIdx >= 0 && actionIdx < words.length - 1) {
                target = words.slice(actionIdx + 1).join(" ").trim();
                targetConfidence = target ? 0.90 : 0.30;
            }
        } else if (words.length > 0) {
            // No clear action — whole text is potential target
            target = working;
            targetConfidence = 0.40;
        }

        // Check if target is a known app/site
        if (target) {
            const vocab = getVocab();
            const targetWords = target.split(/\s+/);
            const allKnown = targetWords.every(w => vocab.has(w));
            if (allKnown && targetWords.length > 0) {
                targetConfidence = Math.max(targetConfidence, 0.85);
            }
        }

        // Dangerous command — boost required confidence
        let isDangerous = action && DANGEROUS_ACTIONS.has(action);

        return {
            action,
            actionConfidence,
            target,
            targetConfidence,
            isDangerous,
            remaining: working,
        };
    }

    // ============================================================
    // 10. FULL PIPELINE
    // ============================================================

    /**
     * Process raw STT text into a canonical representation.
     *
     * @param {string} rawText - What STT produced
     * @returns {Object} {
     *   raw,          // original input
     *   cleaned,      // after text cleaning
     *   transliterated, // after Hindi→Roman (if Devanagari)
     *   canonical,    // final corrected text for downstream
     *   wakeWord,     // { word, confidence, position } or null
     *   action,       // { name, confidence } or null
     *   target,       // { text, confidence } or null
     *   confidence,   // overall 0..1
     *   lang,         // "en" | "hi" | "hinglish"
     *   debug,        // { steps, corrections }
     * }
     */
    function process(rawText) {
        const debug = { steps: [], corrections: [] };
        const raw = String(rawText || "").trim();

        if (!raw) {
            return _emptyResult(raw);
        }

        // Step 1: Text cleaning
        const cleaned = cleanText(raw);
        debug.steps.push({ step: "clean", input: raw, output: cleaned });

        // Step 2: Hindi transliteration (reuse existing module)
        let transliterated = cleaned;
        let lang = "en";

        try {
            if (window.JARVISHindiTranslit && window.JARVISHindiTranslit.hasDevanagari(cleaned)) {
                transliterated = window.JARVISHindiTranslit.toCanonical(cleaned);
                lang = "hi";
                debug.steps.push({ step: "transliterate", input: cleaned, output: transliterated });
            } else if (window.JARVISLanguageCore) {
                lang = window.JARVISLanguageCore.detectLanguage(cleaned) || "en";
            }
        } catch (_) {}

        // Step 3: Detect wake word (before correction, on transliterated text)
        const wakeWordInfo = detectWakeWord(transliterated);
        if (wakeWordInfo) {
            debug.steps.push({ step: "wake_word", result: wakeWordInfo });
        }

        // Step 4: STT spelling correction + phonetic fuzzy matching
        let canonical = transliterated;
        try {
            const corrected = correctPhrase(transliterated);
            if (corrected !== transliterated) {
                // Log corrections for debug
                const origWords = transliterated.split(/\s+/);
                const corrWords = corrected.split(/\s+/);
                for (let i = 0; i < origWords.length; i++) {
                    if (origWords[i] !== corrWords[i]) {
                        debug.corrections.push({
                            original: origWords[i],
                            corrected: corrWords[i],
                        });
                    }
                }
                canonical = corrected;
                debug.steps.push({ step: "fuzzy_correct", input: transliterated, output: canonical });
            }
        } catch (_) {}

        // Step 5: Command synonym normalization
        // (normalize action words to canonical forms)
        let synonymNormalized = canonical;
        const words = synonymNormalized.split(/\s+/);
        for (let i = 0; i < words.length; i++) {
            const syn = ACTION_SYNONYMS[words[i]];
            if (syn && syn !== words[i]) {
                words[i] = syn;
            }
        }
        synonymNormalized = words.join(" ");
        if (synonymNormalized !== canonical) {
            canonical = synonymNormalized;
            debug.steps.push({ step: "synonyms", output: canonical });
        }

        // Step 6: Grammar extraction
        const grammar = extractGrammar(canonical, wakeWordInfo);
        debug.steps.push({ step: "grammar", result: grammar });

        // Step 7: Confidence scoring
        const wakeConf = wakeWordInfo ? wakeWordInfo.confidence : 0;
        const actConf = grammar.actionConfidence || 0;
        const tgtConf = grammar.targetConfidence || 0;

        // Overall confidence = weighted average
        let overall;
        if (wakeWordInfo) {
            overall = (wakeConf * 0.25) + (actConf * 0.40) + (tgtConf * 0.35);
        } else {
            // No wake word — lower the confidence
            overall = (actConf * 0.50) + (tgtConf * 0.50) * 0.80;
        }

        // Dangerous command — require higher confidence
        if (grammar.isDangerous && overall < THRESHOLDS.DANGEROUS_MIN) {
            overall = overall * 0.80; // penalize
        }

        overall = Math.round(overall * 100) / 100;

        // Debug logging
        if (DEBUG) {
            console.log("[VoiceTolerance] Pipeline:", {
                raw,
                cleaned,
                transliterated,
                canonical,
                wakeWord: wakeWordInfo,
                action: grammar.action,
                actionConfidence: grammar.actionConfidence,
                target: grammar.target,
                targetConfidence: grammar.targetConfidence,
                overall: overall,
                lang,
                corrections: debug.corrections,
            });
        }

        return {
            raw,
            cleaned,
            transliterated,
            canonical,
            wakeWord: wakeWordInfo,
            action: grammar.action ? {
                name: grammar.action,
                confidence: grammar.actionConfidence,
            } : null,
            target: grammar.target ? {
                text: grammar.target,
                confidence: grammar.targetConfidence,
            } : null,
            isDangerous: grammar.isDangerous,
            confidence: overall,
            lang,
            debug,
        };
    }

    function _emptyResult(raw) {
        return {
            raw: raw || "",
            cleaned: "",
            transliterated: "",
            canonical: "",
            wakeWord: null,
            action: null,
            target: null,
            isDangerous: false,
            confidence: 0,
            lang: "en",
            debug: { steps: [], corrections: [] },
        };
    }

    // ============================================================
    // 11. CONVENIENCE: just get canonical text
    // ============================================================

    function normalize(rawText) {
        return process(rawText).canonical;
    }

    // ============================================================
    // 12. SELF-LEARNING (local alias storage)
    // ============================================================

    const LEARN_KEY = "jarvis_voice_aliases";
    let learnedAliases = null;

    function loadLearned() {
        if (learnedAliases !== null) return;
        try {
            learnedAliases = JSON.parse(localStorage.getItem(LEARN_KEY) || "{}");
        } catch (_) {
            learnedAliases = {};
        }
    }

    function learnAlias(from, to) {
        loadLearned();
        learnedAliases[String(from).toLowerCase()] = String(to).toLowerCase();
        try {
            localStorage.setItem(LEARN_KEY, JSON.stringify(learnedAliases));
        } catch (_) {}
        // Also add to runtime STT_FIXES
        STT_FIXES[String(from).toLowerCase()] = String(to).toLowerCase();
    }

    function getLearnedAliases() {
        loadLearned();
        return { ...learnedAliases };
    }

    // Load learned aliases into STT_FIXES on startup
    loadLearned();
    for (const [from, to] of Object.entries(learnedAliases)) {
        STT_FIXES[from] = to;
    }

    // ============================================================
    // 13. EXPORT
    // ============================================================

    window.JARVISVoiceTolerance = Object.freeze({
        version: "VT-V1",
        process,
        normalize,
        cleanText,
        fuzzyCorrectWord,
        phoneticSimilarity,
        soundex,
        editDistance,
        detectWakeWord,
        correctPhrase,
        learnAlias,
        getLearnedAliases,
        THRESHOLDS,
    });

    console.log("Voice Tolerance Engine VT-V1 READY");

})();
