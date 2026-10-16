"use strict";

/*
 * ============================================================
 * JARVIS PRO MAX — UNIVERSAL LANGUAGE INTELLIGENCE
 * renderer/js/language/LanguageCore.js
 * ============================================================
 *
 * The single entry point for multilingual understanding.
 *
 * Pipeline:
 *   Raw Transcript
 *     → Language Detection (en / hi / hinglish / mixed)
 *     → Text Normalization (Roman Hindi variants, Devanagari, mixed)
 *     → Semantic Intent Recognition
 *     → Entity Extraction (apps, sites, locations, numbers, dates)
 *     → Context Resolution (pronouns, follow-ups, topic continuity)
 *     → Confidence Scoring
 *     → Semantic Output (language-independent intent + entities)
 *
 * This module does NOT replace the existing NaturalCommandEngine.
 * It sits BEFORE it, enriches the text, and lets the NCE handle
 * the actual execution. It also provides response-language detection
 * so JARVIS replies in the same language the user spoke.
 *
 * ============================================================
 */

(function () {

    // ============================================================
    // 1. LANGUAGE DETECTION
    // ============================================================

    const DEVANAGARI_RE = /[\u0900-\u097F]/;
    const LATIN_RE = /[A-Za-z]/;

    // Strong romanized Hindi markers — even one hit strongly suggests Hindi/Hinglish
    const ROMANIZED_STRONG = /\b(kholo|khol|batao|batayein|batado|batao|dikhao|chalao|chalu|shuru|nikalo|lao|dhoondo|dhundo|rakho|dijiye|chahiye|mujhe|humko|humne|tumne|apne|nahin|nahi|kya|kyun|kyu|kahaan|kahan|kaise|kyunki|kyuki|kitna|kitni|kitne|abhi|bilkul|zaroor|theek|thik|achha|accha|karo|karke|karti|karta|karte|raha|rahi|rahe|hoon|hain|jaldi|yaar|bhai|matlab|samajh|samjho|wala|wali|suno|bolo|band|jao|aao|chahiye|kar\s+raha|kar\s+rahi|kar\s+rahe|ho\s+gaya|ho\s+gayi|ho\s+gaye|karda|kardo|krdo|kro|karna|kariye|bataiye|bataiyega|samjhao|samjhaye|chalado|chalwa|bandh|band\s+karo|chalu\s+karo|khol\s+do)\b/i;

    // Weak markers — need 2+ different hits to count
    const ROMANIZED_WEAK = /\b(hai|hain|hoon|hun|tha|thi|the|gaya|mera|meri|mere|hum|hume|aap|tum|kaun|kab|kaisa|kaisi|sakta|sakte|ek|kuch|sab|bas|mat|bata|dena|lo|par|pe|aur|ya|se|ko|ka|ki|ke|ne|toh|bhi|kal|aaj|phir|agar|hua|hui|hue|liya|liye|diya|diye|laga|lagi|lage|bola|boli|bole|suna|suni|sune|dekha|dekhi|dekhe|pucha|kaha|kahani|uska|uski|uske|iska|iski|iske|wahan|yahan|jahan|tab|jab|kyunki|phir|lekin|magar|warna|yaani|yaani|isliye|kyonki|jo|woh|yeh|voh|veh|kaun|konsa|konsi|kitna|kitne|kitni|kaisa|kaisi|kaise|aisa|aisi|aise|waisa|waisi|waise|itna|itni|itne|utna|utni|utne|zyada|thoda|thodi|bahut|bohot|kam|zyada|pura|puri|sab|kuch|kuchh|naa|naahi|haan|nahi|nahin|theek|thik|accha|achha)\b/gi;

    function detectLanguage(text) {
        const value = String(text || "").trim();
        if (!value) return "en";

        const hasDevanagari = DEVANAGARI_RE.test(value);
        const hasLatin = LATIN_RE.test(value);

        // Mixed Devanagari + Latin = code-switched Hinglish
        if (hasDevanagari && hasLatin) return "hinglish";

        // Pure Devanagari = Hindi
        if (hasDevanagari) return "hi";

        // No Devanagari — check for romanized Hindi
        if (hasLatin) {
            if (ROMANIZED_STRONG.test(value)) return "hinglish";

            const weakHits = new Set(
                (value.match(ROMANIZED_WEAK) || []).map(w => w.toLowerCase())
            ).size;
            if (weakHits >= 2) return "hinglish";
        }

        return "en";
    }

    function getLanguageMode(text) {
        const lang = detectLanguage(text);
        if (lang === "hi") return "HINDI";
        if (lang === "hinglish") return "HINGLISH";
        return "ENGLISH";
    }

    // ============================================================
    // 2. ROMAN HINDI DICTIONARY / NORMALIZATION
    // ============================================================

    // Maps common roman Hindi variants to a canonical form.
    // This is NOT a translation table — it normalizes spelling variants
    // so downstream intent matching works consistently.
    const ROMAN_HINDI_MAP = {
        // Action verbs
        "kholo": "kholo", "khol": "kholo", "khol do": "kholo", "kholna": "kholo",
        "open karo": "kholo", "open kr": "kholo", "open kardo": "kholo", "open kro": "kholo",
        "chalao": "chalao", "chalu karo": "chalao", "start karo": "chalao", "launch karo": "chalao",
        "karo": "karo", "kar do": "karo", "krdo": "karo", "kardo": "karo", "kro": "karo",
        "karna": "karna", "kariye": "kariye",
        "batao": "batao", "btao": "batao", "batado": "batao", "bata do": "batao",
        "bataiye": "bataiye", "bataiyega": "bataiyega", "tell me": "batao",
        "dikhao": "dikhao", "dikha": "dikhao", "dikhado": "dikhao", "show me": "dikhao",
        "dhoondo": "dhoondo", "dhundo": "dhoondo", "find": "dhoondo", "search karo": "dhoondo",
        "khojo": "dhoondo",
        "band karo": "band karo", "band kar do": "band karo", "bandh karo": "band karo",
        "close karo": "band karo", "band kardo": "band karo",
        // Common words
        "abhi": "abhi", "abhi ka": "abhi ka",
        "kal": "kal", "aaj": "aaj", "parso": "parso",
        "mera": "mera", "meri": "meri", "mere": "mere",
        "mujhe": "mujhe", "mujhko": "mujhe",
        "humko": "humko", "humne": "humne",
        "aur": "aur", "ya": "ya", "phir": "phir",
        "lekin": "lekin", "magar": "lekin", "par": "par",
        "haan": "haan", "nahi": "nahi", "nahin": "nahi",
        "theek": "theek", "thik": "theek", "accha": "accha", "achha": "accha",
        "bahut": "bahut", "bohot": "bahut", "zyada": "zyada", "thoda": "thoda",
        "jaldi": "jaldi", "ab": "abhi",
        "wahan": "wahan", "yahan": "yahan",
        "kya": "kya", "kaise": "kaise", "kyun": "kyun", "kyu": "kyun",
        "kahan": "kahan", "kahaan": "kahan", "kaha": "kahan",
        "kaun": "kaun", "konsa": "konsa", "konsi": "konsa",
        "kitna": "kitna", "kitne": "kitna", "kitni": "kitna",
        "bhai": "bhai", "yaar": "yaar",
    };

    // Filler words to strip for intent detection (but preserve for tone)
    const FILLER_WORDS = /\b(please|please yaar|jarvis|hey jarvis|ok jarvis|okay jarvis|arey|are|arrey|bhai|na|naa|toh|jo|just|can you|could you|would you|will you|zara|zaraa|ek second|ek min|ruko|wait)\b/gi;

    function normalizeRomanHindi(text) {
        let result = text;
        // Sort by length descending so multi-word phrases match before single words
        const entries = Object.entries(ROMAN_HINDI_MAP)
            .sort((a, b) => b[0].length - a[0].length);
        for (const [variant, canonical] of entries) {
            if (variant.includes(" ")) {
                // Multi-word phrase
                result = result.replace(new RegExp(`\\b${escapeRegExp(variant)}\\b`, "gi"), canonical);
            }
        }
        // Single word replacements (after multi-word)
        for (const [variant, canonical] of entries) {
            if (!variant.includes(" ")) {
                result = result.replace(new RegExp(`\\b${escapeRegExp(variant)}\\b`, "gi"), canonical);
            }
        }
        return result;
    }

    function escapeRegExp(s) {
        return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    // ============================================================
    // 3. TEXT NORMALIZATION
    // ============================================================

    function normalize(text) {
        if (!text) return "";
        let value = String(text).normalize("NFKC").trim();

        // Remove "JARVIS" wake word prefix
        value = value.replace(/^(?:hey|okay|ok)?\s*jarvis[\s,:-]*/i, "");
        value = value.replace(/^jarvis[\s,:-]*/i, "");

        // Normalize smart quotes
        value = value.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"');

        // Normalize dashes
        value = value.replace(/[\u2013\u2014\u2212]/g, "-");

        // Roman Hindi spelling normalization (only for Latin text)
        const hasDevanagari = DEVANAGARI_RE.test(value);
        if (!hasDevanagari) {
            value = normalizeRomanHindi(value);
        }

        // Collapse whitespace
        value = value.replace(/[ \t]+/g, " ").trim();

        return value;
    }

    // Strip fillers for intent matching (but keep original for tone)
    function stripFillers(text) {
        return text.replace(FILLER_WORDS, "").replace(/\s+/g, " ").trim();
    }

    // ============================================================
    // 4. ENTITY RECOGNITION
    // ============================================================

    // Known websites with their URLs
    const SITES = {
        "youtube": { name: "YouTube", url: "https://www.youtube.com", aliases: ["yt", "you tube", "youTube", "youtub", "यूट्यूब", "यूटुब"] },
        "gmail": { name: "Gmail", url: "https://mail.google.com", aliases: ["google mail", "gmail", "जीमेल"] },
        "google": { name: "Google", url: "https://www.google.com", aliases: ["googl", "gugl", "gogol", "गूगल", "गुगल"] },
        "github": { name: "GitHub", url: "https://github.com", aliases: ["git hub"] },
        "reddit": { name: "Reddit", url: "https://www.reddit.com", aliases: [] },
        "amazon": { name: "Amazon", url: "https://www.amazon.com", aliases: [] },
        "flipkart": { name: "Flipkart", url: "https://www.flipkart.com", aliases: [] },
        "wikipedia": { name: "Wikipedia", url: "https://www.wikipedia.org", aliases: ["wiki"] },
        "facebook": { name: "Facebook", url: "https://www.facebook.com", aliases: ["fb"] },
        "instagram": { name: "Instagram", url: "https://www.instagram.com", aliases: ["insta"] },
        "twitter": { name: "Twitter", url: "https://x.com", aliases: ["x.com"] },
        "linkedin": { name: "LinkedIn", url: "https://www.linkedin.com", aliases: ["linked in"] },
        "netflix": { name: "Netflix", url: "https://www.netflix.com", aliases: [] },
        "spotify": { name: "Spotify", url: "https://open.spotify.com", aliases: [] },
        "chatgpt": { name: "ChatGPT", url: "https://chat.openai.com", aliases: ["openai chat"] },
    };

    // Known apps with aliases
    const APPS = {
        "chrome": ["chrome", "google chrome", "chrom", "crome"],
        "edge": ["edge", "microsoft edge"],
        "firefox": ["firefox", "mozilla firefox", "fire fox"],
        "brave": ["brave", "brave browser"],
        "vscode": ["vscode", "vs code", "visual studio code", "code editor"],
        "notepad": ["notepad", "note pad", "notepad++"],
        "calculator": ["calculator", "calc"],
        "explorer": ["explorer", "file explorer", "windows explorer"],
        "settings": ["settings", "windows settings", "system settings"],
        "discord": ["discord", "discord app"],
        "whatsapp": ["whatsapp", "whatsapp desktop", "whatsapp app", "whats app"],
        "telegram": ["telegram", "telegram desktop"],
        "spotify": ["spotify", "spotify app"],
        "steam": ["steam", "steam app"],
        "cmd": ["cmd", "command prompt", "terminal"],
        "powershell": ["powershell", "power shell"],
        "paint": ["paint", "ms paint"],
        "task manager": ["task manager", "taskmanager"],
        "camera": ["camera", "windows camera"],
        "snipping tool": ["snipping tool", "snip tool", "screenshot tool"],
        "vlc": ["vlc", "vlc player"],
        "obs": ["obs", "obs studio"],
    };

    // Common Indian cities for weather/location
    const LOCATIONS = [
        "delhi", "mumbai", "bangalore", "bengaluru", "kolkata", "chennai",
        "hyderabad", "pune", "ahmedabad", "jaipur", "lucknow", "kanpur",
        "nagpur", "indore", "bhopal", "patna", "surat", "vadodara",
        "varanasi", "london", "tokyo", "new york", "dubai", "paris",
        "singapore", "sydney", "berlin", "toronto", "chicago",
    ];

    function findSite(text) {
        const lower = text.toLowerCase();
        // Sort by name length descending to match longest first
        const entries = Object.entries(SITES).sort((a, b) => b[0].length - a[0].length);
        for (const [key, site] of entries) {
            const allNames = [key, ...site.aliases];
            for (const name of allNames) {
                if (new RegExp(`(?:^|\\s)${escapeRegExp(name)}(?:$|\\s)`, "i").test(lower)) {
                    return site;
                }
            }
        }
        return null;
    }

    function findApp(text) {
        const lower = text.toLowerCase();
        const entries = Object.entries(APPS).sort((a, b) =>
            Math.max(...b[1].map(x => x.length)) - Math.max(...a[1].map(x => x.length))
        );
        for (const [canonical, aliases] of entries) {
            for (const alias of aliases) {
                if (new RegExp(`(?:^|\\s)${escapeRegExp(alias)}(?:$|\\s)`, "i").test(lower)) {
                    return canonical;
                }
            }
        }
        return null;
    }

    function findLocation(text) {
        const lower = text.toLowerCase();
        for (const loc of LOCATIONS) {
            if (new RegExp(`(?:^|\\s)${escapeRegExp(loc)}(?:$|\\s)`, "i").test(lower)) {
                // Capitalize first letter
                return loc.charAt(0).toUpperCase() + loc.slice(1);
            }
        }
        // Try to extract location after "in" or "ka/ke" patterns
        const patterns = [
            /\b(?:in|for|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
            /\b(.+?)\s+(?:ka|ke|ki)\s+(?:weather|mausam|temperature)/i,
            /\bweather\s+(?:in|for|at)\s+(.+?)$/i,
        ];
        for (const re of patterns) {
            const m = text.match(re);
            if (m && m[1]) {
                const loc = m[1].trim();
                if (loc.length > 1 && loc.length < 30 && !/^(?:what|the|please|today|weather|mausam|temperature)$/i.test(loc)) {
                    return loc.charAt(0).toUpperCase() + loc.slice(1);
                }
            }
        }
        return null;
    }

    // Vocabulary alone must never select a scripted live-data response.
    // These gates intentionally prefer "unknown" over a confident but wrong
    // answer; the conversational layer can still handle the sentence.
    function isDirectTimeRequest(text) {
        const value = String(text || "").trim();
        if (!value || /\b(?:meeting|runtime|run|response|release|limit|management|school|class|work|travel|arrival|departure)\s+time\b/i.test(value)) return false;
        return /^(?:(?:please|hey|okay|ok|jarvis)[,\s]*)?(?:what(?:'s| is)\s+(?:the\s+)?(?:current\s+)?time(?:\s+is\s+it)?|what\s+time\s+is\s+it|current\s+time|local\s+time|tell\s+me\s+(?:the\s+)?time|show\s+me\s+(?:the\s+)?time|time\s+(?:batao|bata\s+do|बताओ|बता\s+दो)|samay\s+(?:batao|bata\s+do)|waqt\s+(?:batao|bata\s+do)|(?:abhi\s+)?kitn(?:e|a)\s+baje(?:\s+(?:hain|hai))?|अभी\s+कितने\s+बजे|समय\s+(?:बताओ|बता\s+दो)|टाइम\s+(?:बताओ|बता\s+दो))\s*$/iu.test(value)
            || /^(?:[\p{L}][\p{L}\s.'-]{1,50})\s+time$/iu.test(value)
            || /^(?:what(?:'s| is)\s+the\s+)?(?:current\s+|local\s+)?time\s+in\s+[\p{L}][\p{L}\s.'-]{1,50}$/iu.test(value);
    }

    function isDirectDateRequest(text) {
        const value = String(text || "").trim();
        if (!value || /\b(?:birth|release|due|start|end|expiry|expiration|deadline|payment|joining|event)\s+date\b/i.test(value)) return false;
        const compact = value.replace(/[\u0027\u2019]/g, "");
        return /^(?:(?:please|hey|okay|ok|jarvis)[,\s]*)?(?:what(?:s| is)\s+(?:todays\s+date|the\s+current\s+date|the\s+date)|todays\s+date|current\s+date|tell\s+me\s+(?:todays\s+date|the\s+current\s+date|the\s+date)|show\s+me\s+(?:todays\s+date|the\s+current\s+date|the\s+date)|date\s+(?:batao|bata\s+do|बताओ|बता\s+दो)|aaj\s+ki\s+date|आज\s+की\s+तारीख|आज\s+की\s+डेट|तारीख\s+(?:बताओ|बता\s+दो))\s*$/iu.test(compact);
    }

    function hasExplicitWeatherRequest(text) {
        const value = String(text || "").trim();
        return /^(?:(?:please|hey|okay|ok|jarvis)[,\s]*)?(?:what(?:'s| is)\s+(?:the\s+)?(?:weather|temperature)|(?:check|tell|show|give|get)\s+(?:me\s+)?(?:the\s+)?(?:weather|temperature|forecast)|(?:weather|mausam|मौसम)\s+(?:in|of|for|ka|का|बताओ|batao)|(?:[\p{L}][\p{L}\s.'-]{1,50})\s+(?:weather|mausam|मौसम)|(?:[\p{L}\u0900-\u097F][\p{L}\u0900-\u097F\s.'-]{1,50})\s+(?:का|के|की)\s+(?:मौसम|weather)\s*(?:बताओ|बता\s+दो|batao)?)(?:\s+.*)?$/iu.test(value);
    }

    function hasExplicitNewsRequest(text) {
        const value = String(text || "").trim();
        return /^(?:(?:please|hey|okay|ok|jarvis)[,\s]*)?(?:latest|today'?s|current|breaking)\s+.+\s+(?:news|खबर|समाचार)\s*$/iu.test(value)
            || /^(?:news|khabar|samachar|न्यूज़|खबर|समाचार)\s+(?:about|on|for|batao|बताओ|दिखाओ|दिखा\s+दो)\b.*$/iu.test(value)
            || /^(?:latest|today'?s|current)\s+(?:news|khabar|samachar|न्यूज़|खबर|समाचार)\s*$/iu.test(value);
    }

    function hasExplicitSystemControl(text) {
        const value = String(text || "").trim();
        return /^(?:(?:please|hey|okay|ok|jarvis)[,\s]*)?(?:shutdown|shut\s+down|power\s+off|turn\s+off|restart|reboot|sleep|suspend|lock|sign\s+out|log\s+off)(?:\s+(?:the\s+)?(?:pc|computer|system|windows))?\s*$/iu.test(value)
            || /^(?:pc|computer|system|कंप्यूटर|सिस्टम|पीसी)\s+(?:shutdown|shut\s+down|restart|reboot|sleep|suspend|lock)\s+(?:kar(?:o|\s+do)|करो|कर\s+दो)$/iu.test(value)
            || /^(?:shutdown|shut\s+down|power\s+off|turn\s+off|restart|reboot|sleep|suspend|lock|sign\s+out|log\s+off)\s+(?:karo|kar\s+do|करो|कर\s+दो)$/iu.test(value);
    }

    // Hindi number words to digits
    const HINDI_NUMBERS = {
        "ek": 1, "do": 2, "teen": 3, "char": 4, "panch": 5,
        "chhe": 6, "saat": 7, "aath": 8, "nau": 9, "das": 10,
        "gyarah": 11, "barah": 12, "pandrah": 15, "bees": 20,
        "pachas": 50, "sau": 100, "hazar": 1000, "hazaar": 1000,
        // Devanagari number words
        "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पाँच": 5,
        "छह": 6, "सात": 7, "आठ": 8, "नौ": 9, "दस": 10,
        "पचास": 50, "सौ": 100, "हज़ार": 1000,
    };

    function extractNumber(text) {
        // First check for digit
        const digitMatch = text.match(/\b(\d+(?:\.\d+)?)\b/);
        if (digitMatch) return parseFloat(digitMatch[1]);

        // Check Hindi number words
        const lower = text.toLowerCase();
        for (const [word, num] of Object.entries(HINDI_NUMBERS)) {
            if (new RegExp(`\\b${word}\\b`, "i").test(lower)) return num;
        }

        return null;
    }

    // ============================================================
    // 5. INTENT DETECTION
    // ============================================================

    // Intent patterns covering English, Hindi, Hinglish
    // Each pattern maps to an intent and optional entity extractor
    const INTENT_PATTERNS = [
        // OPEN_APP / OPEN_WEBSITE
        {
            intent: "OPEN_WEBSITE",
            test: (t) => {
                const site = findSite(t);
                if (!site) return null;
                if (/\b(?:open|kholo|khol|go to|visit|launch|chalao|chalu|start)\b/i.test(t) ||
                    /(?:खोलो|खोल|चलाओ|चला\s+दो|खुलवाओ|चालू|शुरू)/.test(t)) {
                    return { site: site.name, url: site.url };
                }
                // Bare "youtube kholo" or just "youtube"
                if (/\b(?:kholo|khol|chalao)\b/i.test(t)) {
                    return { site: site.name, url: site.url };
                }
                return null;
            },
        },
        {
            intent: "OPEN_APP",
            test: (t) => {
                const app = findApp(t);
                if (!app) return null;
                if (/\b(?:open|launch|start|run|kholo|chalao|chalu|start)\b/i.test(t) ||
                    /\b(?:खोलो|चलाओ)\b/i.test(t)) {
                    return { app };
                }
                return null;
            },
        },
        // SEARCH_WEB
        {
            intent: "SEARCH_WEB",
            test: (t) => {
                const site = findSite(t);
                // Check Devanagari search first (no  issues)
                if (/(?:खोजो|ढूँढो|ढूंढो|खोज\s*करो)/.test(t)) {
                    const devMatch = t.match(/(.+?)(?:खोजो|ढूँढो|ढूंढो|खोज\s*करो)/);
                    if (devMatch && devMatch[1]) {
                        let devQuery = devMatch[1].trim()
                            .replace(/(?:पर|के\s*लिए|करो|बताओ|please)/g, "")
                            .replace(/\s+/g, " ").trim();
                        if (devQuery.length > 1) {
                            if (site && site.name === "YouTube") {
                                return { query: devQuery, engine: "youtube", site: "YouTube" };
                            }
                            return { query: devQuery, engine: "google" };
                        }
                    }
                }
                const searchPatterns = [
                    // Topic-first voice phrasing: "Minecraft find on Google".
                    /\b(.+?)\s+(?:find|search)\s+(?:on|in)\s+(?:google|the web|the internet|the browser)$/i,
                    /\b(?:find|search)\s+(?:for\s+)?(.+?)\s+(?:on|in)\s+(?:google|the web|the internet|the browser)$/i,
                    /\b(?:search|find|dhoondo|dhundo|khojo)\s+(?:google\s+)?(?:par|pe|pe|on)?\s*(?:for|ke\s+liye)?\s*(.+)$/i,
                    /\b(?:google)\s+(?:par|pe)?\s*(.+)\s+(?:search|dhoondo|khojo)\b/i,
                    /\b(?:search\s+karo|search\s+kar|google\s+karo)\b.*\b(?:for|ke\s+liye)?\s*(.+)$/i,
                    /\b(.+?)\s+(?:ko\s+)?(?:search|google)\s+karo?\b/i,
                ];
                for (const re of searchPatterns) {
                    const m = t.match(re);
                    if (m && m[1]) {
                        let query = m[1].trim()
                            .replace(/\b(?:par|pe|on|for|karo|kar|batao|please|ke\s+liye)\b/gi, "")
                            .replace(/\s+/g, " ").trim();
                        if (query.length > 1) {
                            // If YouTube is mentioned, it's a YouTube search
                            if (site && site.name === "YouTube") {
                                return { query, engine: "youtube", site: "YouTube" };
                            }
                            return { query, engine: "google" };
                        }
                    }
                }
                return null;
            },
        },
        // WEATHER
        {
            intent: "WEATHER",
            test: (t) => {
                if (!hasExplicitWeatherRequest(t)) return null;
                const location = findLocation(t);
                return { location };
            },
        },
        // TIME
        {
            intent: "TIME",
            test: (t) => {
                if (!isDirectTimeRequest(t)) return null;
                const location = findLocation(t);
                return { location };
            },
        },
        // DATE
        {
            intent: "DATE",
            test: (t) => isDirectDateRequest(t) ? { scope: "today" } : null,
        },
        // CURRENCY
        {
            intent: "CURRENCY",
            test: (t) => {
                if (!/\b(?:convert|exchange|currency|dollar|rupee|rupees|euro|pound|yen|डॉलर|रुपये|रुपया)\b/i.test(t)) return null;
                const amount = extractNumber(t);
                return { amount };
            },
        },
        // NEWS
        {
            intent: "NEWS",
            test: (t) => {
                if (!hasExplicitNewsRequest(t)) return null;
                let topic = t.replace(/\b(?:latest|today|aaj|current|breaking)\b/gi, "")
                    .replace(/\b(?:news|khabar|samachar|न्यूज़|खबर|समाचार)\b/gi, "")
                    .replace(/\b(?:batao|do|dijiye|please|de)\b/gi, "")
                    .replace(/\s+/g, " ").trim();
                return { topic: topic || "India" };
            },
        },
        // KNOWLEDGE / WIKIPEDIA
        {
            intent: "KNOWLEDGE",
            test: (t) => {
                // "Chrome kya hai?" vs "Chrome kholo" — distinguish question from action
                if (/\b(?:kya\s+hai|kya\s+hota|kaise|kaun|koun|who\s+is|what\s+is|what's|tell\s+me\s+about|explain)\b/i.test(t) || /(?:क्या\s*है|कैसे|कौन|क्या\s*होता|बताओ|के\s*बारे\s*में|बताइए|जानकारी|ke\s+baare\s+mein|ke\s+bare\s+mein)/i.test(t)) {
                    // Extract topic
                    let topic = t
                        .replace(/\b(?:kya\s+hai|kya\s+hota|kaise\s+hai|kaun\s+hai|koun\s+hai|who\s+is|what\s+is|what's|tell\s+me\s+about|explain|ke\s+baare\s+mein|ke\s+bare\s+mein|बताओ|क्या\s+है|कैसे|कौन|information|info|do|batao|please)\b/gi, "")
                        .replace(/\s+/g, " ").trim();
                    if (topic.length > 1) return { topic };
                }
                return null;
            },
        },
        // SYSTEM CONTROL
        {
            intent: "SYSTEM_CONTROL",
            test: (t) => {
                if (!hasExplicitSystemControl(t)) return null;
                if (/\b(?:shutdown|shut\s+down|power\s+off|turn\s+off|बंद\s+करो|बंद\s+कर\s+दो)\b/i.test(t)) return { action: "shutdown" };
                if (/\b(?:restart|reboot|रिस्टार्ट|रीस्टार्ट)\b/i.test(t)) return { action: "restart" };
                if (/\b(?:sleep|suspend|सुलाओ|स्लीप)\b/i.test(t)) return { action: "sleep" };
                if (/\b(?:lock|लॉक|ताला)\b/i.test(t)) return { action: "lock" };
                if (/\b(?:sign\s+out|log\s+off|logoff|log\s+out|लॉग\s+आउट|साइन\s+आउट)\b/i.test(t)) return { action: "logoff" };
                return null;
            },
        },
        // SYSTEM STATUS
        {
            intent: "SYSTEM_STATUS",
            test: (t) => {
                if (/\b(?:cpu|ram|disk|memory|system\s+status|system\s+check|सिस्टम|सीपीयू|रैम)\b/i.test(t)) {
                    if (/\b(?:usage|status|check|kitni|kitna|कितनी|कितना|इस्तेमाल)\b/i.test(t)) {
                        const resource = t.match(/\b(cpu|ram|disk|memory)\b/i)?.[1]?.toLowerCase();
                        return { resource: resource || "all" };
                    }
                }
                return null;
            },
        },
        // VOLUME CONTROL
        {
            intent: "VOLUME_CONTROL",
            test: (t) => {
                if (/\b(?:volume|आवाज़|aawaz|awaz|sound)\b/i.test(t)) {
                    if (/\b(?:kam|kam\s+karo|down|lower|decrease|कम|कम\s+करो|neeche)\b/i.test(t)) return { action: "down" };
                    if (/\b(?:badhao|badhao|badhao|up|increase|raise|बढ़ाओ|ऊपर|ज़्यादा)\b/i.test(t)) return { action: "up" };
                    if (/\b(?:mute|stop|band|चुप)\b/i.test(t)) return { action: "mute" };
                }
                return null;
            },
        },
        // SCREENSHOT
        {
            intent: "SCREENSHOT",
            test: (t) => {
                if (/\b(?:screenshot|screen\s+shot|स्क्रीनशॉट|स्क्रीन\s+शॉट)\b/i.test(t)) return {};
                return null;
            },
        },
        // BROWSER TABS
        {
            intent: "BROWSER_NEW_TAB",
            test: (t) => {
                if (/\b(?:new\s+tab|naya\s+tab|नया\s+टैब|नई\s+टैब)\b/i.test(t)) return {};
                return null;
            },
        },
        {
            intent: "BROWSER_CLOSE_TAB",
            test: (t) => {
                if (/\b(?:close\s+tab|tab\s+band|tab\s+close|ये\s+टैब\s+बंद|यह\s+टैब\s+बंद|टैब\s+बंद\s+करो)\b/i.test(t)) return {};
                return null;
            },
        },
        {
            intent: "BROWSER_BACK",
            test: (t) => {
                if (/\b(?:back|peeche|पीछे|वापस)\b/i.test(t) && !/\b(?:comeback|feedback|background)\b/i.test(t)) return {};
                return null;
            },
        },
        {
            intent: "BROWSER_FORWARD",
            test: (t) => {
                if (/\b(?:forward|aage|आगे)\b/i.test(t) && !/\b(?:lookforward|forwarding)\b/i.test(t)) return {};
                return null;
            },
        },
        {
            intent: "BROWSER_RELOAD",
            test: (t) => {
                if (/\b(?:reload|refresh|refresh\s+karo|ताज़ा|रीलोड|रिफ्रेश)\b/i.test(t)) return {};
                return null;
            },
        },
        {
            intent: "BROWSER_SCROLL",
            test: (t) => {
                if (/\b(?:scroll)\b/i.test(t) || /(?:स्क्रॉल|खिसकाओ|नीचे|ऊपर)/.test(t)) {
                    if (/\b(?:down|neeche)\b/i.test(t) || /(?:नीचे)/.test(t)) return { direction: "down" };
                    if (/\b(?:up|upar)\b/i.test(t) || /(?:ऊपर)/.test(t)) return { direction: "up" };
                }
                return null;
            },
        },
        // GREETING
        {
            intent: "GREETING",
            test: (t) => {
                if (/^\s*(?:hi|hello|hey|namaste|namaskar|नमस्ते|प्रणाम)\s*$/i.test(t)) return {};
                return null;
            },
        },
        // PLAY MEDIA
        {
            intent: "PLAY_MEDIA",
            test: (t) => {
                if (/\b(?:play|chalu|chalao|बजाओ|चलाओ|चालू)\b/i.test(t) &&
                    /\b(?:music|song|gana|गाना|गाने|video|media)\b/i.test(t)) {
                    return { type: "media" };
                }
                return null;
            },
        },
        // LANGUAGE SWITCH
        {
            intent: "LANGUAGE_SWITCH",
            test: (t) => {
                if (/\b(?:hindi\s+mein|hindi\s+me|हिंदी\s+में|हिन्दी\s+में)\b/i.test(t) &&
                    /\b(?:bat|bol|speak|talk|answer|बात|बोलो|बोल)\b/i.test(t)) return { language: "hi" };
                if (/\b(?:english\s+me|english\s+mein)\b/i.test(t) &&
                    /\b(?:bat|bol|speak|talk|answer)\b/i.test(t)) return { language: "en" };
                if (/\b(?:hinglish\s+me|hinglish\s+mein)\b/i.test(t) &&
                    /\b(?:bat|bol|speak|talk|answer)\b/i.test(t)) return { language: "hinglish" };
                return null;
            },
        },
    ];

    // ============================================================
    // 6. CONFIDENCE SCORING
    // ============================================================

    function calculateConfidence(intent, entities, originalText, normalizedText) {
        let base = 0.85;

        // Boost for entity matches
        if (entities && Object.keys(entities).length > 0) base += 0.05;

        // Boost for exact action word matches
        if (/\b(?:open|kholo|search|weather|time|batao|bata)\b/i.test(normalizedText)) base += 0.05;

        // Penalize very short input (ambiguous)
        if (normalizedText.split(/\s+/).length < 2) base -= 0.15;

        // Penalize if no entities found for entity-requiring intents
        const entityIntents = ["WEATHER", "CURRENCY", "KNOWLEDGE", "SEARCH_WEB"];
        if (entityIntents.includes(intent) && (!entities || Object.keys(entities).length === 0)) {
            base -= 0.10;
        }

        return Math.max(0.30, Math.min(0.99, Math.round(base * 100) / 100));
    }

    // ============================================================
    // 7. CONTEXT RESOLUTION
    // ============================================================

    function resolveContext(text, conversationContext) {
        if (!conversationContext) return text;

        // Short follow-up resolution
        const wordCount = text.split(/\s+/).length;
        if (wordCount > 12) return text;

        // "aur kal?" → "weather in <previous_location> kal"
        if (/^(?:aur\s+)?kal$/i.test(text) || /^(?:और\s+)?कल$/i.test(text)) {
            const topic = conversationContext.activeTopic;
            if (topic && topic.intent === "WEATHER") {
                return `${topic.subject || "weather"} kal ka weather batao`;
            }
        }

        // "aur parso?" similar
        if (/^(?:aur\s+)?parso$/i.test(text) || /^(?:और\s+)?परसो$/i.test(text)) {
            const topic = conversationContext.activeTopic;
            if (topic && topic.intent === "WEATHER") {
                return `${topic.subject || "weather"} parso ka weather batao`;
            }
        }

        // "ab AI ke videos search karo" → search on previously opened YouTube
        if (/\b(?:ab|phir|abhi|fir)\b/i.test(text) && /\b(?:search|dhoondo|khojo)\b/i.test(text)) {
            const topic = conversationContext.activeTopic;
            if (topic && topic.subject === "YouTube") {
                // Add "youtube" to the search command
                return `youtube par ${text.replace(/\b(?:ab|phir|abhi|fir)\b/gi, "").trim()}`;
            }
        }

        // "ise kholo" / "isko open karo" → open previous topic
        if (/\b(?:ise|isko|isako|इसे|इसको)\b/i.test(text) && /\b(?:kholo|open|chalao)\b/i.test(text)) {
            const topic = conversationContext.activeTopic;
            if (topic && topic.subject) {
                return `${topic.subject} kholo`;
            }
        }

        // "ise band karo" / "isko close karo" → close previous app
        if (/\b(?:ise|isko|isako|इसे|इसको)\b/i.test(text) && /\b(?:band|close)\b/i.test(text)) {
            const topic = conversationContext.activeTopic;
            if (topic && topic.subject) {
                return `${topic.subject} band karo`;
            }
        }

        // "phir se" / "dobara" → repeat previous command
        if (/^(?:phir\s+se|dobara|दोबारा|फिर\s+से)\b/i.test(text)) {
            const recent = conversationContext.turns;
            if (recent && recent.length >= 2) {
                const lastUserTurn = [...recent].reverse().find(t => t.role === "user");
                if (lastUserTurn) return lastUserTurn.text;
            }
        }

        return text;
    }

    // ============================================================
    // 8. RESPONSE LANGUAGE DETECTION
    // ============================================================

    function getResponseLanguage(inputLanguage, text, conversationPreference) {
        // Check for explicit language switch in the text
        if (/\b(?:hindi\s+me|hindi\s+mein|हिंदी\s+में)\b/i.test(text) &&
            /\b(?:bat|bol|speak|talk|answer|बात|बोल)\b/i.test(text)) return "hi";

        if (/\b(?:english\s+me|english\s+mein)\b/i.test(text) &&
            /\b(?:bat|bol|speak|talk|answer)\b/i.test(text)) return "en";

        if (/\b(?:hinglish\s+me|hinglish\s+mein)\b/i.test(text) &&
            /\b(?:bat|bol|speak|talk|answer)\b/i.test(text)) return "hinglish";

        // Use stored conversation preference
        if (conversationPreference) return conversationPreference;

        // Match input language
        if (inputLanguage === "hi") return "hi";
        if (inputLanguage === "hinglish") return "hinglish";
        return "en";
    }

    // ============================================================
    // 9. MAIN ANALYZE FUNCTION
    // ============================================================

    function analyze(text, options = {}) {
        const original = String(text || "").trim();
        if (!original) {
            return {
                language: "en",
                mode: "ENGLISH",
                normalizedText: "",
                intent: "unknown",
                confidence: 0,
                entities: {},
                originalText: original,
                ambiguous: false,
                responseLanguage: "en",
            };
        }

        // Step 1: Language detection
        const language = detectLanguage(original);
        const mode = getLanguageMode(original);

        // Step 2: Normalize
        const normalized = normalize(original);
        const cleanedForIntent = stripFillers(normalized);

        // Step 3: Context resolution
        const context = options.conversationContext || null;
        const contextResolved = resolveContext(cleanedForIntent, context);

        // Step 4: Intent detection
        let bestIntent = "unknown";
        let bestEntities = {};
        let bestConfidence = 0;

        for (const pattern of INTENT_PATTERNS) {
            try {
                const result = pattern.test(contextResolved);
                if (result !== null) {
                    const conf = calculateConfidence(pattern.intent, result, original, contextResolved);
                    if (conf > bestConfidence) {
                        bestIntent = pattern.intent;
                        bestEntities = result;
                        bestConfidence = conf;
                    }
                }
            } catch (_) {}
        }

        // Step 5: Response language
        const responseLanguage = getResponseLanguage(language, original, options.conversationPreference);

        // Step 6: Confidence check
        const ambiguous = bestConfidence < 0.50;

        return {
            language,
            mode,
            normalizedText: contextResolved,
            originalText: original,
            intent: bestIntent,
            confidence: bestConfidence,
            entities: bestEntities,
            ambiguous,
            responseLanguage,
            contextResolved: contextResolved !== cleanedForIntent,
        };
    }

    // ============================================================
    // 10. EXPORT
    // ============================================================

    window.JARVISLanguageCore = Object.freeze({
        version: "LI-V1",
        detectLanguage,
        getLanguageMode,
        normalize,
        normalizeRomanHindi,
        stripFillers,
        analyze,
        resolveContext,
        getResponseLanguage,
        findSite,
        findApp,
        findLocation,
        extractNumber,
    });

    console.log("🌐 JARVIS Language Intelligence LI-V1 READY");

})();
