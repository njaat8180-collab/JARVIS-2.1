"use strict";

/*
===========================================================
 JARVIS PRO MAX
 IntentEngine.js

 V13 PRO MAX FINAL
 PART 1/5

 CORE KERNEL
 - State Manager
 - Input Normalization
 - Language Detection
 - Alias/Synonym Foundation
 - Safe Utilities
 - Diagnostics Foundation

 IMPORTANT:
 This is PART 1/5.
 Do NOT create another IntentEngine class in later parts.
 Later parts extend this SAME class.
===========================================================
*/


class JARVISIntentEngine {

    constructor(options = {}) {

        // =================================================
        // IDENTITY
        // =================================================

        this.name = "IntentEngine";

        this.version = "V13 PRO MAX";

        this.build = "CLEAN REWRITE";

        this.initialized = false;

        this.status = "offline";


        // =================================================
        // CONFIGURATION
        // =================================================

        this.config = {

            defaultLanguage: "en",

            supportedLanguages: [
                "en",
                "hi",
                "hinglish"
            ],

            minimumConfidence: 0.45,

            ambiguityThreshold: 0.08,

            maxHistory: 100,

            enableContext: true,

            enableHistory: true,

            enableDiagnostics: true,

            ...options

        };


        // =================================================
        // RUNTIME STATE
        // =================================================

        this.state = {

            lastInput: "",

            lastIntent: null,

            lastResult: null,

            lastLanguage: "en",

            lastConfidence: 0,

            processing: false,

            requestCount: 0,

            successCount: 0,

            failedCount: 0

        };


        // =================================================
        // CONTEXT
        // =================================================

        this.context = {

            activeIntent: null,

            activeTarget: null,

            activeApp: null,

            activeQuery: null,

            previousInput: "",

            previousIntent: null,

            previousResult: null

        };


        // =================================================
        // HISTORY
        // =================================================

        this.history = [];


        // =================================================
        // INTENT DEFINITIONS
        // =================================================

        this.intents = {};


        // =================================================
        // ALIASES
        // =================================================

        this.aliases = {};


        // =================================================
        // SYNONYMS
        // =================================================

        this.synonyms = {};


        // =================================================
        // APPLICATION MAP
        // =================================================

        this.appAliases = {};


        // =================================================
        // LANGUAGE MAP
        // =================================================

        this.languagePatterns = {

            hindi: [

                "karo",
                "karo",
                "kholo",
                "khol",
                "batao",
                "dikhao",
                "chalao",
                "band",
                "samay",
                "tarikh",
                "aaj",
                "kal",
                "kaise",
                "kya",
                "kaun",
                "kahan",
                "mujhe",
                "mera",
                "meri",
                "mein",
                "hai",
                "ho",
                "do"

            ],

            hinglish: [

                "open karo",
                "search karo",
                "google karo",
                "batao",
                "dikhao",
                "chalao",
                "band karo",
                "khol do",
                "start karo",
                "close karo",
                "mujhe",
                "ke baare mein",
                "ko search karo"

            ]

        };


        // =================================================
        // BUILT-IN APP ALIASES
        // =================================================

        this.registerDefaultAppAliases();


        // =================================================
        // BUILT-IN SYNONYMS
        // =================================================

        this.registerDefaultSynonyms();


        console.log(
            "🎯 IntentEngine V13 PRO MAX Kernel Created"
        );

    }


    // =====================================================
    // INITIALIZE
    // =====================================================

    async init() {

        try {

            if (this.initialized) {

                return true;

            }


            console.log(
                "⚡ IntentEngine Initializing..."
            );


            this.initialized = true;

            this.status = "ready";


            console.log(
                "✅ IntentEngine Ready"
            );


            return true;

        }

        catch (error) {

            this.status = "error";

            console.error(
                "❌ IntentEngine Init Error:",
                error
            );

            return false;

        }

    }


    // =====================================================
    // NORMALIZE INPUT
    // =====================================================

    normalize(input) {

        try {

            if (
                input === null ||
                input === undefined
            ) {

                return "";

            }


            let text = String(input);


            // Remove control characters

            text = text.replace(
                /[\u0000-\u001F\u007F]/g,
                " "
            );


            // Normalize Unicode

            if (
                typeof text.normalize === "function"
            ) {

                text = text.normalize("NFKC");

            }


            // Normalize apostrophes

            text = text.replace(
                /[’‘`]/g,
                "'"
            );


            // Normalize quotes

            text = text.replace(
                /[“”]/g,
                '"'
            );


            // Collapse whitespace

            text = text.replace(
                /\s+/g,
                " "
            );


            // Remove unnecessary punctuation

            text = text.replace(
                /[!?.,;:]+$/g,
                ""
            );


            return text.trim();

        }

        catch (error) {

            console.error(
                "Intent Normalize Error:",
                error
            );

            return "";

        }

    }


    // =====================================================
    // LOWERCASE NORMALIZATION
    // =====================================================

    normalizeForMatching(input) {

        const text =
            this.normalize(input);


        return text
            .toLowerCase()
            .trim()
            .replace(/\s+/g, " ");

    }


    // =====================================================
    // TOKENIZE
    // =====================================================

    tokenize(input) {

        const text =
            this.normalizeForMatching(input);


        if (!text) {

            return [];

        }


        return text.split(/\s+/);

    }


    // =====================================================
    // LANGUAGE DETECTION
    // =====================================================

    detectLanguage(input) {

        try {

            const text =
                this.normalizeForMatching(input);


            if (!text) {

                return {

                    language:
                        this.config.defaultLanguage,

                    confidence: 0

                };

            }


            // ---------------------------------------------
            // Hindi Unicode
            // ---------------------------------------------

            if (
                /[\u0900-\u097F]/.test(text)
            ) {

                return {

                    language: "hi",

                    confidence: 0.99

                };

            }


            // ---------------------------------------------
            // Hinglish
            // ---------------------------------------------

            let hinglishScore = 0;

            const hinglishWords = [

                "karo",
                "karo",
                "kholo",
                "khol",
                "batao",
                "dikhao",
                "chalao",
                "band",
                "mujhe",
                "mera",
                "meri",
                "kaise",
                "kya",
                "kaun",
                "kahan",
                "aaj",
                "kal",
                "samay",
                "tarikh",
                "baare",
                "mein",
                "ko",
                "hai"

            ];


            const tokens =
                this.tokenize(text);


            for (
                const token of tokens
            ) {

                if (
                    hinglishWords.includes(token)
                ) {

                    hinglishScore++;

                }

            }


            if (
                hinglishScore >= 2
            ) {

                return {

                    language: "hinglish",

                    confidence:
                        Math.min(
                            0.95,
                            0.55 +
                            (
                                hinglishScore *
                                0.08
                            )
                        )

                };

            }


            // ---------------------------------------------
            // English fallback
            // ---------------------------------------------

            return {

                language: "en",

                confidence: 0.70

            };

        }

        catch (error) {

            console.error(
                "Language Detection Error:",
                error
            );


            return {

                language:
                    this.config.defaultLanguage,

                confidence: 0

            };

        }

    }


    // =====================================================
    // REGISTER APP ALIASES
    // =====================================================

    registerApp(name, aliases = []) {

        try {

            const canonical =
                this.normalizeForMatching(name);


            if (!canonical) {

                return false;

            }


            this.appAliases[canonical] =
                canonical;


            for (
                const alias of aliases
            ) {

                const normalized =
                    this.normalizeForMatching(alias);


                if (normalized) {

                    this.appAliases[normalized] =
                        canonical;

                }

            }


            return true;

        }

        catch (error) {

            console.error(
                "App Alias Error:",
                error
            );

            return false;

        }

    }


    // =====================================================
    // DEFAULT APPLICATION ALIASES
    // =====================================================

    registerDefaultAppAliases() {

        this.registerApp(
            "chrome",
            [
                "google chrome",
                "chrome browser",
                "google browser"
            ]
        );


        this.registerApp(
            "edge",
            [
                "microsoft edge",
                "edge browser"
            ]
        );


        this.registerApp(
            "firefox",
            [
                "mozilla firefox",
                "fire fox",
                "firefox browser"
            ]
        );


        this.registerApp(
            "vscode",
            [
                "visual studio code",
                "vs code",
                "vs-code",
                "code editor"
            ]
        );


        this.registerApp(
            "notepad",
            [
                "note pad",
                "text editor"
            ]
        );


        this.registerApp(
            "calculator",
            [
                "calc",
                "calculate",
                "calculator app"
            ]
        );


        this.registerApp(
            "explorer",
            [
                "file explorer",
                "windows explorer",
                "file manager"
            ]
        );


        this.registerApp(
            "settings",
            [
                "windows settings",
                "system settings"
            ]
        );


        this.registerApp(
            "discord",
            [
                "discord app"
            ]
        );


        this.registerApp(
            "spotify",
            [
                "spotify app",
                "music app"
            ]
        );


        this.registerApp(
            "youtube",
            [
                "youtube app",
                "yt"
            ]
        );


        this.registerApp(
            "whatsapp",
            [
                "whatsapp app",
                "whatsapp desktop"
            ]
        );

    }


    // =====================================================
    // REGISTER SYNONYM
    // =====================================================

    registerSynonym(canonical, words = []) {

        try {

            const key =
                this.normalizeForMatching(
                    canonical
                );


            if (!key) {

                return false;

            }


            if (!Array.isArray(words)) {

                words = [words];

            }


            if (!this.synonyms[key]) {

                this.synonyms[key] = [];

            }


            for (
                const word of words
            ) {

                const normalized =
                    this.normalizeForMatching(
                        word
                    );


                if (
                    normalized &&
                    !this.synonyms[key].includes(
                        normalized
                    )
                ) {

                    this.synonyms[key].push(
                        normalized
                    );

                }

            }


            return true;

        }

        catch (error) {

            console.error(
                "Synonym Registration Error:",
                error
            );

            return false;

        }

    }


    // =====================================================
    // DEFAULT SYNONYMS
    // =====================================================

    registerDefaultSynonyms() {

        this.registerSynonym(
            "open",
            [
                "launch",
                "start",
                "run",
                "execute",
                "khol",
                "kholo",
                "khol do",
                "chalao",
                "start karo"
            ]
        );


        this.registerSynonym(
            "close",
            [
                "exit",
                "quit",
                "terminate",
                "stop",
                "band",
                "band karo",
                "close karo"
            ]
        );


        this.registerSynonym(
            "search",
            [
                "google",
                "find",
                "look for",
                "search for",
                "dhundo",
                "dhoondo",
                "talash karo",
                "search karo",
                "google karo"
            ]
        );


        this.registerSynonym(
            "time",
            [
                "current time",
                "what time",
                "samay",
                "kitne baje",
                "kitna baja hai"
            ]
        );


        this.registerSynonym(
            "date",
            [
                "today date",
                "current date",
                "tarikh",
                "aaj ki date",
                "aaj ki tarikh"
            ]
        );


        this.registerSynonym(
            "play",
            [
                "start playing",
                "chalao",
                "bajao",
                "play karo"
            ]
        );


        this.registerSynonym(
            "stop",
            [
                "halt",
                "pause",
                "rok",
                "roko",
                "band karo"
            ]
        );

    }


    // =====================================================
    // RESOLVE APP ALIAS
    // =====================================================

    resolveAppAlias(input) {

        const text =
            this.normalizeForMatching(input);


        if (!text) {

            return null;

        }


        if (
            this.appAliases[text]
        ) {

            return this.appAliases[text];

        }


        const aliases =
            Object.keys(
                this.appAliases
            );


        for (
            const alias of aliases
        ) {

            if (
                text.includes(alias)
            ) {

                return this.appAliases[alias];

            }

        }


        return null;

    }


    // =====================================================
    // HAS WORD / PHRASE
    // =====================================================

    contains(input, phrase) {

        const text =
            this.normalizeForMatching(input);


        const target =
            this.normalizeForMatching(phrase);


        if (
            !text ||
            !target
        ) {

            return false;

        }


        return text.includes(target);

    }


    // =====================================================
    // SAFE NUMBER
    // =====================================================

    toNumber(value, fallback = null) {

        const number =
            Number(value);


        return Number.isFinite(number)
            ? number
            : fallback;

    }


    // =====================================================
    // SAFE OBJECT
    // =====================================================

    isObject(value) {

        return (
            value !== null &&
            typeof value === "object" &&
            !Array.isArray(value)
        );

    }


    // =====================================================
    // ADD HISTORY
    // =====================================================

    addHistory(entry) {

        if (
            !this.config.enableHistory
        ) {

            return;

        }


        this.history.push({

            timestamp:
                Date.now(),

            ...entry

        });


        if (
            this.history.length >
            this.config.maxHistory
        ) {

            this.history.shift();

        }

    }


    // =====================================================
    // UPDATE CONTEXT
    // =====================================================

    updateContext(data = {}) {

        if (
            !this.config.enableContext
        ) {

            return;

        }


        if (
            this.isObject(data)
        ) {

            this.context = {

                ...this.context,

                ...data

            };

        }

    }


    // =====================================================
    // GET STATUS
    // =====================================================

    getStatus() {

        return {

            name:
                this.name,

            version:
                this.version,

            status:
                this.status,

            initialized:
                this.initialized,

            requests:
                this.state.requestCount,

            successes:
                this.state.successCount,

            failures:
                this.state.failedCount,

            lastIntent:
                this.state.lastIntent,

            lastLanguage:
                this.state.lastLanguage,

            lastConfidence:
                this.state.lastConfidence,

            historySize:
                this.history.length,

            contextEnabled:
                this.config.enableContext

        };

    }


    // =====================================================
    // DIAGNOSTICS
    // =====================================================

    diagnostics() {

        return {

            engine:
                this.name,

            version:
                this.version,

            status:
                this.status,

            initialized:
                this.initialized,

            apps:
                Object.keys(
                    this.appAliases
                ).length,

            synonymGroups:
                Object.keys(
                    this.synonyms
                ).length,

            intents:
                Object.keys(
                    this.intents
                ).length,

            history:
                this.history.length,

            timestamp:
                new Date().toISOString()

        };

    }

}
// =========================================================
// GLOBAL SINGLETON
// =========================================================

if (typeof window !== "undefined") {

    // Create / expose the main IntentEngine instance
    if (!window.JARVISIntentEngine) {

        window.JARVISIntentEngine =
            new JARVISIntentEngine();

        console.log(
            "🎯 JARVISIntentEngine Singleton Created"
        );
    }

    // Compatibility alias
    window.IntentEngine =
        window.JARVISIntentEngine;

    console.log(
        "🎯 IntentEngine Compatibility Alias Ready:",
        !!window.IntentEngine
    );

    console.log(
        "🎯 IntentEngine V13 Part 1/5 Loaded"
    );
}

/*
===========================================================
 JARVIS PRO MAX
 IntentEngine.js

 V13 PRO MAX FINAL
 PART 2/5

 ADVANCED INTENT DEFINITIONS
 - Intent Registry
 - Intent Aliases
 - Pattern Matching
 - Keyword Matching
 - Hindi / Hinglish Patterns
 - Command Classification
===========================================================
*/


// =========================================================
// INTENT REGISTRATION
// =========================================================

JARVISIntentEngine.prototype.registerIntent = function (
    name,
    options = {}
) {

    try {

        const intentName =
            this.normalizeForMatching(name);

        if (!intentName) {
            return false;
        }

        this.intents[intentName] = {

            name: intentName,

            aliases: Array.isArray(options.aliases)
                ? options.aliases
                : [],

            keywords: Array.isArray(options.keywords)
                ? options.keywords
                : [],

            patterns: Array.isArray(options.patterns)
                ? options.patterns
                : [],

            priority:
                Number.isFinite(options.priority)
                    ? options.priority
                    : 0,

            confidence:
                Number.isFinite(options.confidence)
                    ? options.confidence
                    : 0.5,

            description:
                options.description || "",

            enabled:
                options.enabled !== false

        };

        return true;

    }

    catch (error) {

        console.error(
            "Intent Registration Error:",
            error
        );

        return false;

    }

};


// =========================================================
// REGISTER DEFAULT INTENTS
// =========================================================

JARVISIntentEngine.prototype.registerDefaultIntents =
function () {

    // -----------------------------------------------------
    // GREETING
    // -----------------------------------------------------

    this.registerIntent(
        "greeting",
        {

            aliases: [

                "hi",
                "hello",
                "hey",
                "hey jarvis",
                "hello jarvis",
                "hi jarvis",
                "namaste",
                "namaskar"

            ],

            keywords: [

                "hello",
                "hi",
                "hey",
                "namaste",
                "namaskar"

            ],

            patterns: [

                /^hi$/i,
                /^hello$/i,
                /^hey$/i,
                /^hi jarvis$/i,
                /^hello jarvis$/i,
                /^hey jarvis$/i,
                /^namaste$/i

            ],

            priority: 100,

            confidence: 0.95,

            description:
                "Greeting or wake interaction"

        }
    );


    // -----------------------------------------------------
    // OPEN APPLICATION
    // -----------------------------------------------------

    this.registerIntent(
        "open_app",
        {

            aliases: [

                "open",
                "launch",
                "start",
                "run",
                "execute",
                "khol",
                "kholo",
                "khol do",
                "chalao",
                "start karo"

            ],

            keywords: [

                "open",
                "launch",
                "start",
                "run",
                "execute",
                "khol",
                "kholo",
                "chalao"

            ],

            patterns: [

                /^open\s+(.+)$/i,

                /^launch\s+(.+)$/i,

                /^start\s+(.+)$/i,

                /^run\s+(.+)$/i,

                /^execute\s+(.+)$/i,

                /^khol\s+(.+)$/i,

                /^kholo\s+(.+)$/i,

                /^khol\s+do\s+(.+)$/i,

                /^(.+)\s+khol\s+do$/i,

                /^(.+)\s+chalao$/i,

                /^(.+)\s+start\s+karo$/i

            ],

            priority: 90,

            confidence: 0.92,

            description:
                "Open or launch an application"

        }
    );


    // -----------------------------------------------------
    // CLOSE APPLICATION
    // -----------------------------------------------------

    this.registerIntent(
        "close_app",
        {

            aliases: [

                "close",
                "exit",
                "quit",
                "terminate",
                "stop",
                "band",
                "band karo",
                "close karo"

            ],

            keywords: [

                "close",
                "exit",
                "quit",
                "terminate",
                "stop",
                "band"

            ],

            patterns: [

                /^close\s+(.+)$/i,

                /^exit\s+(.+)$/i,

                /^quit\s+(.+)$/i,

                /^terminate\s+(.+)$/i,

                /^stop\s+(.+)$/i,

                /^band\s+(.+)$/i,

                /^band\s+karo\s+(.+)$/i,

                /^(.+)\s+band\s+karo$/i,

                /^(.+)\s+close\s+karo$/i

            ],

            priority: 88,

            confidence: 0.90,

            description:
                "Close or terminate an application"

        }
    );


    // -----------------------------------------------------
    // SEARCH
    // -----------------------------------------------------

    this.registerIntent(
        "search",
        {

            aliases: [

                "search",
                "google",
                "find",
                "look for",
                "search for",
                "search karo",
                "google karo",
                "dhundo",
                "dhoondo"

            ],

            keywords: [

                "search",
                "google",
                "find",
                "look",
                "dhundo",
                "dhoondo"

            ],

            patterns: [

                /^search\s+(.+)$/i,

                /^search\s+for\s+(.+)$/i,

                /^google\s+(.+)$/i,

                /^find\s+(.+)$/i,

                /^look\s+for\s+(.+)$/i,

                /^(.+)\s+search\s+karo$/i,

                /^(.+)\s+ko\s+search\s+karo$/i,

                /^(.+)\s+ko\s+google\s+karo$/i,

                /^(.+)\s+ke\s+baare\s+mein\s+search\s+karo$/i,

                /^(.+)\s+ke\s+baare\s+mein\s+batao$/i

            ],

            priority: 85,

            confidence: 0.90,

            description:
                "Search the web or retrieve information"

        }
    );


    // -----------------------------------------------------
    // TIME
    // -----------------------------------------------------

    this.registerIntent(
        "time",
        {

            aliases: [

                "time",
                "current time",
                "what time",
                "samay",
                "kitne baje",
                "kitna baja hai"

            ],

            keywords: [

                "time",
                "samay",
                "baje",
                "baja"

            ],

            patterns: [

                /what\s+(is\s+)?the\s+time/i,

                /what\s+time\s+is\s+it/i,

                /current\s+time/i,

                /time\s+please/i,

                /samay\s+(kya|batao)/i,

                /kitne\s+baje/i,

                /kitna\s+baja\s+hai/i

            ],

            priority: 80,

            confidence: 0.88,

            description:
                "Get current system time"

        }
    );


    // -----------------------------------------------------
    // DATE
    // -----------------------------------------------------

    this.registerIntent(
        "date",
        {

            aliases: [

                "date",
                "today date",
                "current date",
                "tarikh",
                "aaj ki date",
                "aaj ki tarikh"

            ],

            keywords: [

                "date",
                "today",
                "tarikh"

            ],

            patterns: [

                /what\s+(is\s+)?the\s+date/i,

                /what\s+date\s+is\s+it/i,

                /today('s)?\s+date/i,

                /current\s+date/i,

                /aaj\s+ki\s+date/i,

                /aaj\s+ki\s+tarikh/i

            ],

            priority: 79,

            confidence: 0.88,

            description:
                "Get current date"

        }
    );


    // -----------------------------------------------------
    // PLAY
    // -----------------------------------------------------

    this.registerIntent(
        "play",
        {

            aliases: [

                "play",
                "play karo",
                "chalao",
                "bajao",
                "start playing"

            ],

            keywords: [

                "play",
                "chalao",
                "bajao"

            ],

            patterns: [

                /^play\s+(.+)$/i,

                /^(.+)\s+play\s+karo$/i,

                /^(.+)\s+chalao$/i,

                /^(.+)\s+bajao$/i

            ],

            priority: 70,

            confidence: 0.82,

            description:
                "Play media or content"

        }
    );


    // -----------------------------------------------------
    // STOP
    // -----------------------------------------------------

    this.registerIntent(
        "stop",
        {

            aliases: [

                "stop",
                "halt",
                "pause",
                "rok",
                "roko",
                "band karo"

            ],

            keywords: [

                "stop",
                "halt",
                "pause",
                "rok",
                "roko"

            ],

            patterns: [

                /^stop$/i,

                /^stop\s+(.+)$/i,

                /^pause$/i,

                /^pause\s+(.+)$/i,

                /^(.+)\s+roko$/i,

                /^(.+)\s+band\s+karo$/i

            ],

            priority: 69,

            confidence: 0.80,

            description:
                "Stop or pause an active task"

        }
    );


    // -----------------------------------------------------
    // SHUTDOWN
    // -----------------------------------------------------

    this.registerIntent(
        "shutdown",
        {

            aliases: [

                "shutdown",
                "shut down",
                "turn off",
                "power off",
                "system shutdown",
                "pc shutdown"

            ],

            keywords: [

                "shutdown",
                "shut",
                "power",
                "off"

            ],

            patterns: [

                /^shutdown$/i,

                /^shut\s+down$/i,

                /^turn\s+off\s+(the\s+)?(pc|computer|system)?$/i,

                /^power\s+off$/i,

                /^shutdown\s+(the\s+)?(pc|computer|system)$/i

            ],

            priority: 95,

            confidence: 0.94,

            description:
                "Shutdown the computer"

        }
    );


    // -----------------------------------------------------
    // RESTART
    // -----------------------------------------------------

    this.registerIntent(
        "restart",
        {

            aliases: [

                "restart",
                "reboot",
                "restart pc",
                "restart computer",
                "reboot pc"

            ],

            keywords: [

                "restart",
                "reboot"

            ],

            patterns: [

                /^restart$/i,

                /^reboot$/i,

                /^restart\s+(the\s+)?(pc|computer|system)$/i,

                /^reboot\s+(the\s+)?(pc|computer|system)$/i

            ],

            priority: 94,

            confidence: 0.94,

            description:
                "Restart the computer"

        }
    );


    // -----------------------------------------------------
    // HELP
    // -----------------------------------------------------

    this.registerIntent(
        "help",
        {

            aliases: [

                "help",
                "what can you do",
                "what can you do for me",
                "commands",
                "show commands"

            ],

            keywords: [

                "help",
                "commands"

            ],

            patterns: [

                /^help$/i,

                /^what\s+can\s+you\s+do/i,

                /^show\s+(me\s+)?commands$/i,

                /^commands$/i

            ],

            priority: 60,

            confidence: 0.85,

            description:
                "Show available capabilities"

        }
    );


    // -----------------------------------------------------
    // CHAT
    // -----------------------------------------------------

    this.registerIntent(
        "chat",
        {

            aliases: [

                "chat",
                "talk",
                "conversation"

            ],

            keywords: [

                "tell",
                "explain",
                "why",
                "how",
                "what",
                "who",
                "can",
                "please"

            ],

            patterns: [],

            priority: 10,

            confidence: 0.50,

            description:
                "General conversation or AI request"

        }
    );

};


// =========================================================
// ALIAS MATCHING
// =========================================================

JARVISIntentEngine.prototype.matchAlias =
function (text, intent) {

    const normalized =
        this.normalizeForMatching(text);

    if (!normalized) {
        return false;
    }

    const aliases =
        Array.isArray(intent.aliases)
            ? intent.aliases
            : [];

    for (const alias of aliases) {

        const normalizedAlias =
            this.normalizeForMatching(alias);

        if (!normalizedAlias) {
            continue;
        }

        if (
            normalized === normalizedAlias
        ) {
            return true;
        }

        if (
            normalized.includes(
                normalizedAlias
            )
        ) {
            return true;
        }

    }

    return false;

};


// =========================================================
// KEYWORD MATCHING
// =========================================================

JARVISIntentEngine.prototype.matchKeywords =
function (text, intent) {

    const normalized =
        this.normalizeForMatching(text);

    if (!normalized) {
        return 0;
    }

    const keywords =
        Array.isArray(intent.keywords)
            ? intent.keywords
            : [];

    if (!keywords.length) {
        return 0;
    }

    let matched = 0;

    for (const keyword of keywords) {

        const normalizedKeyword =
            this.normalizeForMatching(keyword);

        if (
            normalizedKeyword &&
            normalized.includes(
                normalizedKeyword
            )
        ) {

            matched++;

        }

    }

    return Math.min(
        1,
        matched / keywords.length
    );

};


// =========================================================
// REGEX / PATTERN MATCHING
// =========================================================

JARVISIntentEngine.prototype.matchPatterns =
function (text, intent) {

    const normalized =
        this.normalizeForMatching(text);

    const patterns =
        Array.isArray(intent.patterns)
            ? intent.patterns
            : [];

    for (const pattern of patterns) {

        try {

            if (
                pattern instanceof RegExp &&
                pattern.test(normalized)
            ) {

                return true;

            }

        }

        catch (error) {

            console.warn(
                "Invalid Intent Pattern:",
                error
            );

        }

    }

    return false;

};


// =========================================================
// INTENT SCORING FOUNDATION
// =========================================================

JARVISIntentEngine.prototype.calculateIntentScore =
function (text, intent) {

    let score = 0;

    // Exact alias = strongest signal

    if (
        this.matchAlias(text, intent)
    ) {

        score += 0.65;

    }


    // Pattern match

    if (
        this.matchPatterns(text, intent)
    ) {

        score += 0.30;

    }


    // Keyword match

    score +=
        this.matchKeywords(
            text,
            intent
        ) * 0.25;


    // Priority bonus

    score +=
        Math.min(
            0.10,
            intent.priority / 1000
        );


    // Confidence weighting

    score *=
        Math.max(
            0.5,
            Math.min(
                1,
                intent.confidence
            )
        );


    return Math.min(
        1,
        score
    );

};


// =========================================================
// INITIALIZE DEFAULT INTENTS
// =========================================================

const _intentEngineOriginalInit =
    JARVISIntentEngine.prototype.init;


JARVISIntentEngine.prototype.init =
async function () {

    try {

        if (
            this.initialized
        ) {

            return true;

        }


        this.registerDefaultIntents();


        const result =
            await _intentEngineOriginalInit.call(
                this
            );


        return result;

    }

    catch (error) {

        console.error(
            "IntentEngine Init Extension Error:",
            error
        );

        this.status = "error";

        return false;

    }

};


// =========================================================
// LOAD MESSAGE
// =========================================================

console.log(
    "🎯 IntentEngine V13 Part 2/5 Loaded"
);
"use strict";

/*
========================================================
JARVIS PRO MAX
IntentEngine.js
V12 PRO MAX
PART 3/5

ADVANCED NATURAL LANGUAGE INTELLIGENCE

Features:
- English
- Hindi
- Hinglish
- Synonym matching
- Safe word matching
- Target detection
- Search query extraction
- Entity extraction
- Command classification
- Confidence scoring
- Diagnostics
- No duplicate global declarations
========================================================
*/

class JARVISIntentEngineAdvanced {

    constructor(engine = null) {

        this.engine = engine;

        this.version = "V12 PRO MAX";
        this.part = "3/5";

        // ==================================================
        // LANGUAGE PATTERNS
        // ==================================================

        this.languagePatterns = {

            english: [
                "open",
                "close",
                "launch",
                "start",
                "run",
                "search",
                "find",
                "play",
                "stop",
                "tell",
                "show"
            ],

            hindi: [
                "खोलो",
                "खोल",
                "चलाओ",
                "बंद करो",
                "बंद",
                "ढूंढो",
                "खोजो",
                "बताओ",
                "दिखाओ",
                "बजाओ",
                "रोको"
            ],

            hinglish: [
                "kholo",
                "khol",
                "chalao",
                "band karo",
                "band kar",
                "dhundo",
                "khojo",
                "batao",
                "dikhao",
                "bajao",
                "roko",
                "open kar",
                "search kar",
                "start kar"
            ]

        };

        // ==================================================
        // ACTION SYNONYMS
        // ==================================================

        this.synonyms = {

            open: [
                "open",
                "launch",
                "start",
                "run",
                "execute",
                "खोलो",
                "खोल",
                "चलाओ",
                "kholo",
                "khol",
                "chalao",
                "open kar",
                "start kar"
            ],

            close: [
                "close",
                "exit",
                "quit",
                "terminate",
                "बंद करो",
                "बंद",
                "band karo",
                "band kar"
            ],

            search: [
                "search",
                "search for",
                "find",
                "lookup",
                "google",
                "खोजो",
                "ढूंढो",
                "dhundo",
                "khojo",
                "search kar",
                "google par"
            ],

            play: [
                "play",
                "चलाओ",
                "बजाओ",
                "chalao",
                "bajao",
                "play karo"
            ],

            stop: [
                "stop",
                "रोक",
                "रोको",
                "rok",
                "roko"
            ],

            tell: [
                "tell",
                "show",
                "give",
                "बताओ",
                "दिखाओ",
                "batao",
                "dikhao"
            ]

        };

        // ==================================================
        // APPLICATION / TARGET ALIASES
        // ==================================================

        this.targetAliases = {

            chrome: [
                "chrome",
                "google chrome",
                "chrome browser",
                "क्रोम"
            ],

            browser: [
                "browser",
                "web browser",
                "internet browser",
                "ब्राउज़र"
            ],

            vscode: [
                "vscode",
                "vs code",
                "visual studio code",
                "visual studio",
                "code editor",
                "वीएस कोड"
            ],

            notepad: [
                "notepad",
                "text editor",
                "notes",
                "नोटपैड"
            ],

            calculator: [
                "calculator",
                "calc",
                "कैलकुलेटर",
                "हिसाब"
            ],

            explorer: [
                "explorer",
                "file explorer",
                "file manager",
                "windows explorer",
                "files",
                "फाइल एक्सप्लोरर"
            ],

            settings: [
                "settings",
                "setting",
                "windows settings",
                "सेटिंग",
                "सेटिंग्स"
            ],

            youtube: [
                "youtube",
                "yt",
                "यूट्यूब"
            ],

            google: [
                "google",
                "गूगल"
            ],

            spotify: [
                "spotify",
                "स्पॉटिफाई"
            ]

        };

        // ==================================================
        // SEARCH PREFIXES
        // ==================================================

        this.searchPrefixes = [

            "search for",
            "search",
            "google for",
            "google",
            "find",
            "lookup",
            "look up",

            "खोजो",
            "ढूंढो",

            "dhundo",
            "dhundho",
            "khojo",

            "search kar",
            "search karo",

            "google par",
            "google pe"

        ];

        // ==================================================
        // COMMAND ALIASES
        // ==================================================

        this.commandAliases = {

            open_app: [
                "open",
                "launch",
                "start",
                "run",
                "खोलो",
                "खोल",
                "kholo",
                "khol",
                "chalao"
            ],

            close_app: [
                "close",
                "exit",
                "quit",
                "terminate",
                "बंद करो",
                "बंद",
                "band karo",
                "band kar"
            ],

            web_search: [
                "search",
                "search for",
                "find",
                "lookup",
                "google",
                "खोजो",
                "ढूंढो",
                "dhundo",
                "khojo"
            ],

            media_play: [
                "play",
                "चलाओ",
                "बजाओ",
                "chalao",
                "bajao"
            ],

            media_stop: [
                "stop",
                "रोक",
                "रोको",
                "rok",
                "roko"
            ]

        };

        console.log(
            "🧠 Intent Advanced Engine V12 Part 3 Created"
        );

    }


    // ==================================================
    // NORMALIZE TEXT
    // ==================================================

    normalize(text) {

        if (
            typeof text !== "string"
        ) {

            return "";

        }

        try {

            return text

                .normalize("NFKC")

                .toLowerCase()

                .replace(/[“”‘’]/g, "'")

                .replace(/[^\p{L}\p{N}\s._-]/gu, " ")

                .replace(/\s+/g, " ")

                .trim();

        }

        catch (error) {

            console.warn(
                "Intent Normalize Error:",
                error
            );

            return String(text)
                .toLowerCase()
                .trim();

        }

    }


    // ==================================================
    // TOKENIZE
    // ==================================================

    tokenize(text) {

        const normalized =
            this.normalize(text);

        if (!normalized) {

            return [];

        }

        return normalized
            .split(/\s+/)
            .filter(Boolean);

    }


    // ==================================================
    // SAFE PHRASE MATCH
    // ==================================================

    phraseMatches(text, phrase) {

        const normalizedText =
            this.normalize(text);

        const normalizedPhrase =
            this.normalize(phrase);

        if (
            !normalizedText ||
            !normalizedPhrase
        ) {

            return false;

        }

        const escaped =
            normalizedPhrase
                .replace(
                    /[.*+?^${}()|[\]\\]/g,
                    "\\$&"
                );

        const regex =
            new RegExp(
                `(?:^|\\s)${escaped}(?=\\s|$)`,
                "u"
            );

        return regex.test(
            normalizedText
        );

    }


    // ==================================================
    // SYNONYM MATCH
    // ==================================================

    matchesSynonym(text, type) {

        const list =
            this.synonyms[type] || [];

        for (
            const synonym of list
        ) {

            if (
                this.phraseMatches(
                    text,
                    synonym
                )
            ) {

                return true;

            }

        }

        return false;

    }


    // ==================================================
    // DETECT ACTION
    // ==================================================

    detectAction(text) {

        const normalized =
            this.normalize(text);

        if (!normalized) {

            return null;

        }

        const actions = [

            "open",
            "close",
            "search",
            "play",
            "stop"

        ];

        for (
            const action of actions
        ) {

            if (
                this.matchesSynonym(
                    normalized,
                    action
                )
            ) {

                return action;

            }

        }

        return null;

    }


    // ==================================================
    // TARGET DETECTION
    // ==================================================

    detectTarget(text) {

        const normalized =
            this.normalize(text);

        if (!normalized) {

            return null;

        }

        let bestTarget = null;
        let bestScore = 0;

        for (
            const target of Object.keys(
                this.targetAliases
            )
        ) {

            const aliases =
                this.targetAliases[target];

            for (
                const alias of aliases
            ) {

                const normalizedAlias =
                    this.normalize(alias);

                if (
                    !this.phraseMatches(
                        normalized,
                        normalizedAlias
                    )
                ) {

                    continue;

                }

                /*
                Prefer the most specific /
                longest matching alias.
                */

                const score =
                    normalizedAlias.length;

                if (
                    score > bestScore
                ) {

                    bestTarget =
                        target;

                    bestScore =
                        score;

                }

            }

        }

        return bestTarget;

    }


    // ==================================================
    // SEARCH QUERY EXTRACTION
    // ==================================================

    extractSearchQuery(text) {

        let normalized =
            this.normalize(text);

        if (!normalized) {

            return "";

        }

        /*
        Longest prefixes first.
        */

        const prefixes =
            [...this.searchPrefixes]
                .sort(
                    (a, b) =>
                        this.normalize(b).length -
                        this.normalize(a).length
                );

        for (
            const prefix of prefixes
        ) {

            const normalizedPrefix =
                this.normalize(prefix);

            if (
                normalized ===
                normalizedPrefix
            ) {

                return "";

            }

            if (
                normalized.startsWith(
                    normalizedPrefix + " "
                )
            ) {

                normalized =
                    normalized
                        .slice(
                            normalizedPrefix.length
                        )
                        .trim();

                break;

            }

        }

        return normalized;

    }


    // ==================================================
    // TARGET EXTRACTION
    // ==================================================

    extractTarget(text) {

        const normalized =
            this.normalize(text);

        if (!normalized) {

            return null;

        }

        const knownTarget =
            this.detectTarget(normalized);

        if (knownTarget) {

            return knownTarget;

        }

        /*
        Unknown target fallback.

        Example:
        "open photoshop"

        returns:
        "photoshop"
        */

        const patterns = [

            /^(?:open|launch|start|run)\s+(.+)$/u,

            /^(?:kholo|khol|chalao)\s+(.+)$/u,

            /^(?:खोलो|खोल|चलाओ)\s+(.+)$/u,

            /^(?:open kar|start kar)\s+(.+)$/u

        ];

        for (
            const pattern of patterns
        ) {

            const match =
                normalized.match(pattern);

            if (
                match &&
                match[1]
            ) {

                return match[1]
                    .trim();

            }

        }

        return null;

    }


    // ==================================================
    // ENTITY EXTRACTION
    // ==================================================

    extractEntities(text) {

        const normalized =
            this.normalize(text);

        const action =
            this.detectAction(normalized);

        const target =
            this.extractTarget(normalized);

        const query =
            action === "search"

                ? this.extractSearchQuery(
                    normalized
                )

                : "";

        return {

            action,

            target,

            query,

            text: normalized

        };

    }


    // ==================================================
    // COMMAND TYPE
    // ==================================================

    detectCommandType(
        text,
        action,
        target
    ) {

        if (
            action === "open" &&
            target
        ) {

            return "open_app";

        }

        if (
            action === "close" &&
            target
        ) {

            return "close_app";

        }

        if (
            action === "search"
        ) {

            return "web_search";

        }

        if (
            action === "play"
        ) {

            return "media_play";

        }

        if (
            action === "stop"
        ) {

            return "media_stop";

        }

        return null;

    }


    // ==================================================
    // CONFIDENCE
    // ==================================================

    calculateConfidence(data) {

        let score = 0.20;

        if (
            data.action
        ) {

            score += 0.25;

        }

        if (
            data.target
        ) {

            score += 0.25;

        }

        if (
            data.commandType
        ) {

            score += 0.20;

        }

        if (
            data.query
        ) {

            score += 0.10;

        }

        return Math.min(
            0.99,
            Number(
                score.toFixed(2)
            )
        );

    }


    // ==================================================
    // BUILD INTENT
    // ==================================================

    buildIntent(text) {

        const normalized =
            this.normalize(text);

        if (!normalized) {

            return {

                name: "unknown",

                intent: "unknown",

                action: null,

                target: null,

                query: "",

                confidence: 0,

                entities: {},

                text: "",

                source:
                    "AdvancedIntentEngine",

                version:
                    this.version

            };

        }

        const action =
            this.detectAction(
                normalized
            );

        const target =
            this.extractTarget(
                normalized
            );

        const query =
            action === "search"

                ? this.extractSearchQuery(
                    normalized
                )

                : "";

        const commandType =
            this.detectCommandType(
                normalized,
                action,
                target
            );

        const entities = {

            action,

            target,

            query,

            text: normalized

        };

        const confidence =
            this.calculateConfidence({

                action,

                target,

                query,

                commandType

            });

        return {

            name:
                commandType || "chat",

            intent:
                commandType || "chat",

            action,

            target,

            query,

            confidence,

            entities,

            text:
                normalized,

            source:
                "AdvancedIntentEngine",

            version:
                this.version

        };

    }


    // ==================================================
    // RESOLVE
    // ==================================================

    resolve(text) {

        try {

            return this.buildIntent(
                text
            );

        }

        catch (error) {

            console.error(
                "❌ Advanced Intent Resolve Error:",
                error
            );

            return {

                name: "unknown",

                intent: "unknown",

                action: null,

                target: null,

                query: "",

                confidence: 0,

                entities: {},

                text:
                    this.normalize(text),

                source:
                    "AdvancedIntentEngine",

                version:
                    this.version,

                error:
                    error.message

            };

        }

    }


    // ==================================================
    // TEST
    // ==================================================

    test(text) {

        const result =
            this.resolve(text);

        console.log(
            "🧪 Intent Test:",
            result
        );

        return result;

    }


    // ==================================================
    // DIAGNOSTICS
    // ==================================================

    diagnostics() {

        let synonymCount = 0;

        for (
            const key of Object.keys(
                this.synonyms
            )
        ) {

            synonymCount +=
                this.synonyms[key].length;

        }

        let targetCount = 0;

        for (
            const key of Object.keys(
                this.targetAliases
            )
        ) {

            targetCount +=
                this.targetAliases[key].length;

        }

        return {

            engine:
                "JARVIS Advanced Intent Engine",

            version:
                this.version,

            part:
                this.part,

            status:
                "online",

            languages: [

                "English",
                "Hindi",
                "Hinglish"

            ],

            actionTypes:
                Object.keys(
                    this.synonyms
                ).length,

            synonymCount,

            targetTypes:
                Object.keys(
                    this.targetAliases
                ).length,

            targetAliasCount:
                targetCount

        };

    }

}


// ======================================================
// SAFE GLOBAL EXPORT
// ======================================================

if (
    typeof window !== "undefined"
) {

    /*
    Do NOT overwrite an existing
    main IntentEngine.
    */

    if (
        !window.JARVISIntentAdvanced
    ) {

        window.JARVISIntentAdvanced =
            new JARVISIntentEngineAdvanced(
                window.IntentEngine || null
            );

    }


    // ==================================================
    // HELPER
    // ==================================================

    if (
        typeof window.detectAdvancedIntent !==
        "function"
    ) {

        window.detectAdvancedIntent =
            function(text) {

                return window
                    .JARVISIntentAdvanced
                    .resolve(text);

            };

    }


    // ==================================================
    // READY EVENT
    // ==================================================

    try {

        window.dispatchEvent(

            new CustomEvent(
                "JARVIS_INTENT_ADVANCED_READY",
                {

                    detail:
                        window
                            .JARVISIntentAdvanced
                            .diagnostics()

                }

            )

        );

    }

    catch (error) {

        console.warn(
            "Intent Ready Event Error:",
            error
        );

    }

}


// ======================================================
// FINAL LOG
// ======================================================

console.log(
    "✅ IntentEngine.js V12 PART 3/5 READY"
);
"use strict";

/*
========================================================
JARVIS PRO MAX
IntentEngine.js
V12 PRO MAX
PART 4/5

Context-Aware Intent Layer
Ambiguity Resolution
Intent Candidate Scoring
Context Correction
Target / Action Reinforcement
Production Safe Integration
========================================================
*/

class JARVISIntentContextLayer {

    constructor(advancedEngine) {

        this.engine = advancedEngine || null;

        this.version = "V12 PRO MAX PART 4";

        this.context = {

            lastIntent: null,
            lastAction: null,
            lastTarget: null,
            lastQuery: null,
            lastText: null,

            history: []

        };

        this.maxHistory = 20;

        /*
        ------------------------------------------------
        Intent scoring weights
        ------------------------------------------------
        */

        this.weights = {

            exactAction: 0.30,
            targetMatch: 0.30,
            commandType: 0.15,
            contextMatch: 0.10,
            queryMatch: 0.05,
            languageMatch: 0.05,
            fallback: 0.05

        };

        /*
        ------------------------------------------------
        Context continuation phrases
        ------------------------------------------------
        */

        this.contextPhrases = [

            "it",
            "that",
            "this",
            "there",
            "again",
            "same",
            "same one",

            "इसे",
            "वही",
            "फिर से",
            "उसको",
            "उससे",
            "वह"

        ];

        /*
        ------------------------------------------------
        Ambiguous words
        ------------------------------------------------
        */

        this.ambiguousTargets = {

            browser: [
                "browser",
                "ब्राउज़र"
            ],

            code: [
                "code",
                "coding",
                "editor"
            ],

            files: [
                "files",
                "file",
                "documents"
            ],

            settings: [
                "settings",
                "setting"
            ]

        };

        console.log(
            "🧠 Intent Context Layer V12 Part 4 Created"
        );

    }


    // ==================================================
    // NORMALIZE SAFE
    // ==================================================

    normalize(text) {

        if (
            this.engine &&
            typeof this.engine.normalize === "function"
        ) {

            return this.engine.normalize(text);

        }

        if (typeof text !== "string") {

            return "";

        }

        return text
            .normalize("NFKC")
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s._-]/gu, " ")
            .replace(/\s+/g, " ")
            .trim();

    }


    // ==================================================
    // CHECK CONTEXT PHRASE
    // ==================================================

    hasContextReference(text) {

        const normalized =
            this.normalize(text);

        if (!normalized) {

            return false;

        }

        return this.contextPhrases.some(
            phrase => {

                const p =
                    this.normalize(phrase);

                return (
                    p &&
                    normalized.includes(p)
                );

            }
        );

    }


    // ==================================================
    // SAVE CONTEXT
    // ==================================================

    remember(intent) {

        if (!intent) {

            return;

        }

        this.context.lastIntent =
            intent.name || intent.intent || null;

        this.context.lastAction =
            intent.action || null;

        this.context.lastTarget =
            intent.target || null;

        this.context.lastQuery =
            intent.query || null;

        this.context.lastText =
            intent.text || null;

        this.context.history.push({

            name:
                intent.name || null,

            action:
                intent.action || null,

            target:
                intent.target || null,

            query:
                intent.query || null,

            text:
                intent.text || null,

            timestamp:
                Date.now()

        });

        if (
            this.context.history.length >
            this.maxHistory
        ) {

            this.context.history.shift();

        }

    }


    // ==================================================
    // GET PREVIOUS INTENT
    // ==================================================

    getPreviousIntent() {

        const history =
            this.context.history;

        if (!history.length) {

            return null;

        }

        return history[
            history.length - 1
        ];

    }


    // ==================================================
    // CONTEXT TARGET RESOLUTION
    // ==================================================

    resolveContextTarget(
        text,
        target
    ) {

        if (target) {

            return target;

        }

        if (
            !this.hasContextReference(text)
        ) {

            return null;

        }

        return (
            this.context.lastTarget ||
            null
        );

    }


    // ==================================================
    // CONTEXT ACTION RESOLUTION
    // ==================================================

    resolveContextAction(
        text,
        action
    ) {

        if (action) {

            return action;

        }

        if (
            !this.hasContextReference(text)
        ) {

            return null;

        }

        return (
            this.context.lastAction ||
            null
        );

    }


    // ==================================================
    // CONTEXT QUERY RESOLUTION
    // ==================================================

    resolveContextQuery(
        text,
        query
    ) {

        if (query) {

            return query;

        }

        const normalized =
            this.normalize(text);

        /*
        ------------------------------------------------
        Follow-up search phrases
        ------------------------------------------------
        */

        const followUps = [

            "more",
            "more about it",
            "search more",
            "find more",
            "और बताओ",
            "और जानकारी",
            "इसके बारे में",
            "और खोजो"

        ];

        const isFollowUp =
            followUps.some(
                phrase =>
                    normalized.includes(
                        this.normalize(phrase)
                    )
            );

        if (!isFollowUp) {

            return null;

        }

        return (
            this.context.lastQuery ||
            null
        );

    }


    // ==================================================
    // LANGUAGE DETECTION
    // ==================================================

    detectLanguage(text) {

        const normalized =
            this.normalize(text);

        if (!normalized) {

            return "unknown";

        }

        const hindiChars =
            (normalized.match(
                /[\u0900-\u097F]/g
            ) || []).length;

        const latinChars =
            (normalized.match(
                /[a-zA-Z]/g
            ) || []).length;

        if (
            hindiChars > 0 &&
            latinChars > 0
        ) {

            return "hinglish";

        }

        if (hindiChars > 0) {

            return "hindi";

        }

        if (latinChars > 0) {

            return "english";

        }

        return "unknown";

    }


    // ==================================================
    // TARGET CONFIDENCE
    // ==================================================

    targetScore(
        text,
        target
    ) {

        if (!target) {

            return 0;

        }

        const normalized =
            this.normalize(text);

        if (!normalized) {

            return 0;

        }

        /*
        ------------------------------------------------
        Use Part 3 target detector
        ------------------------------------------------
        */

        if (
            this.engine &&
            typeof this.engine.detectTarget === "function"
        ) {

            const detected =
                this.engine.detectTarget(
                    normalized
                );

            if (detected === target) {

                return 1;

            }

        }

        return 0.5;

    }


    // ==================================================
    // ACTION CONFIDENCE
    // ==================================================

    actionScore(
        text,
        action
    ) {

        if (!action) {

            return 0;

        }

        if (
            this.engine &&
            typeof this.engine.detectAction === "function"
        ) {

            const detected =
                this.engine.detectAction(
                    text
                );

            if (detected === action) {

                return 1;

            }

        }

        return 0.4;

    }


    // ==================================================
    // COMMAND SCORE
    // ==================================================

    commandScore(commandType) {

        if (!commandType) {

            return 0;

        }

        return 1;

    }


    // ==================================================
    // CONTEXT SCORE
    // ==================================================

    contextScore(
        text,
        candidate
    ) {

        if (!this.hasContextReference(text)) {

            return 0;

        }

        let score = 0;

        if (
            candidate.target &&
            candidate.target ===
            this.context.lastTarget
        ) {

            score += 0.5;

        }

        if (
            candidate.action &&
            candidate.action ===
            this.context.lastAction
        ) {

            score += 0.3;

        }

        if (
            candidate.name &&
            candidate.name ===
            this.context.lastIntent
        ) {

            score += 0.2;

        }

        return Math.min(
            1,
            score
        );

    }


    // ==================================================
    // QUERY SCORE
    // ==================================================

    queryScore(query) {

        if (!query) {

            return 0;

        }

        return Math.min(
            1,
            query.length / 20
        );

    }


    // ==================================================
    // CALCULATE CANDIDATE SCORE
    // ==================================================

    scoreCandidate(
        text,
        candidate
    ) {

        if (!candidate) {

            return 0;

        }

        const action =
            this.actionScore(
                text,
                candidate.action
            );

        const target =
            this.targetScore(
                text,
                candidate.target
            );

        const command =
            this.commandScore(
                candidate.commandType
            );

        const context =
            this.contextScore(
                text,
                candidate
            );

        const query =
            this.queryScore(
                candidate.query
            );

        const language =
            this.detectLanguage(text) !==
            "unknown"
                ? 1
                : 0;

        let score = 0;

        score +=
            action *
            this.weights.exactAction;

        score +=
            target *
            this.weights.targetMatch;

        score +=
            command *
            this.weights.commandType;

        score +=
            context *
            this.weights.contextMatch;

        score +=
            query *
            this.weights.queryMatch;

        score +=
            language *
            this.weights.languageMatch;

        if (
            candidate.name === "chat"
        ) {

            score +=
                this.weights.fallback;

        }

        return Number(
            Math.min(
                0.99,
                score
            ).toFixed(3)
        );

    }


    // ==================================================
    // BUILD CANDIDATE
    // ==================================================

    buildCandidate(
        text,
        action,
        target,
        query
    ) {

        let commandType = null;

        if (
            this.engine &&
            typeof this.engine.detectCommandType ===
            "function"
        ) {

            commandType =
                this.engine.detectCommandType(
                    text,
                    action,
                    target
                );

        }

        const candidate = {

            name:
                commandType || "chat",

            intent:
                commandType || "chat",

            action:
                action || null,

            target:
                target || null,

            query:
                query || "",

            commandType:
                commandType || null,

            text:
                this.normalize(text)

        };

        candidate.score =
            this.scoreCandidate(
                text,
                candidate
            );

        return candidate;

    }


    // ==================================================
    // GENERATE CANDIDATES
    // ==================================================

    generateCandidates(text) {

        const normalized =
            this.normalize(text);

        if (!normalized) {

            return [];

        }

        const candidates = [];

        let detectedAction = null;
        let detectedTarget = null;
        let detectedQuery = "";

        if (
            this.engine &&
            typeof this.engine.detectAction ===
            "function"
        ) {

            detectedAction =
                this.engine.detectAction(
                    normalized
                );

        }

        if (
            this.engine &&
            typeof this.engine.detectTarget ===
            "function"
        ) {

            detectedTarget =
                this.engine.detectTarget(
                    normalized
                );

        }

        if (
            this.engine &&
            typeof this.engine.extractSearchQuery ===
            "function"
        ) {

            detectedQuery =
                this.engine.extractSearchQuery(
                    normalized
                );

        }

        /*
        ------------------------------------------------
        Candidate 1 — direct detection
        ------------------------------------------------
        */

        candidates.push(
            this.buildCandidate(
                normalized,
                detectedAction,
                detectedTarget,
                detectedQuery
            )
        );


        /*
        ------------------------------------------------
        Candidate 2 — context corrected
        ------------------------------------------------
        */

        const contextAction =
            this.resolveContextAction(
                normalized,
                detectedAction
            );

        const contextTarget =
            this.resolveContextTarget(
                normalized,
                detectedTarget
            );

        const contextQuery =
            this.resolveContextQuery(
                normalized,
                detectedQuery
            );

        if (
            contextAction !== detectedAction ||
            contextTarget !== detectedTarget ||
            contextQuery !== detectedQuery
        ) {

            candidates.push(
                this.buildCandidate(
                    normalized,
                    contextAction,
                    contextTarget,
                    contextQuery
                )
            );

        }


        /*
        ------------------------------------------------
        Candidate 3 — chat fallback
        ------------------------------------------------
        */

        candidates.push({

            name: "chat",

            intent: "chat",

            action: null,

            target: null,

            query: "",

            commandType: null,

            text: normalized,

            score: 0.05

        });


        return candidates;

    }


    // ==================================================
    // REMOVE DUPLICATES
    // ==================================================

    removeDuplicates(candidates) {

        const unique = [];

        const seen =
            new Set();

        for (
            const candidate of candidates
        ) {

            const key = [

                candidate.name,
                candidate.action,
                candidate.target,
                candidate.query

            ].join("|");

            if (seen.has(key)) {

                continue;

            }

            seen.add(key);

            unique.push(candidate);

        }

        return unique;

    }


    // ==================================================
    // SORT CANDIDATES
    // ==================================================

    rankCandidates(candidates) {

        return candidates

            .slice()

            .sort(
                (a, b) =>
                    (b.score || 0) -
                    (a.score || 0)
            );

    }


    // ==================================================
    // AMBIGUITY CHECK
    // ==================================================

    detectAmbiguity(candidates) {

        if (!candidates || candidates.length < 2) {

            return {

                ambiguous: false,

                difference: 1

            };

        }

        const ranked =
            this.rankCandidates(
                candidates
            );

        const first =
            ranked[0]?.score || 0;

        const second =
            ranked[1]?.score || 0;

        const difference =
            Number(
                (first - second).toFixed(3)
            );

        /*
        ------------------------------------------------
        Very close candidates = ambiguity
        ------------------------------------------------
        */

        return {

            ambiguous:
                difference < 0.10 &&
                first < 0.80,

            difference,

            topScore: first,

            secondScore: second

        };

    }


    // ==================================================
    // RESOLVE AMBIGUITY
    // ==================================================

    resolveAmbiguity(
        text,
        candidates
    ) {

        const ranked =
            this.rankCandidates(
                candidates
            );

        if (!ranked.length) {

            return null;

        }

        const ambiguity =
            this.detectAmbiguity(
                ranked
            );

        if (!ambiguity.ambiguous) {

            return ranked[0];

        }

        /*
        ------------------------------------------------
        Prefer explicit action
        ------------------------------------------------
        */

        const explicit =
            ranked.find(
                item =>
                    item.action &&
                    item.target
            );

        if (explicit) {

            return explicit;

        }

        /*
        ------------------------------------------------
        Prefer context continuation
        ------------------------------------------------
        */

        if (
            this.hasContextReference(text)
        ) {

            const contextual =
                ranked.find(
                    item =>
                        item.target ===
                        this.context.lastTarget
                );

            if (contextual) {

                return contextual;

            }

        }

        /*
        ------------------------------------------------
        Otherwise top ranked
        ------------------------------------------------
        */

        return ranked[0];

    }


    // ==================================================
    // FINAL RESOLVE
    // ==================================================

    resolve(text) {

        try {

            const normalized =
                this.normalize(text);

            if (!normalized) {

                return {

                    name: "unknown",

                    intent: "unknown",

                    action: null,

                    target: null,

                    query: "",

                    confidence: 0,

                    ambiguous: false,

                    text: ""

                };

            }

            let candidates =
                this.generateCandidates(
                    normalized
                );

            candidates =
                this.removeDuplicates(
                    candidates
                );

            candidates =
                this.rankCandidates(
                    candidates
                );

            const selected =
                this.resolveAmbiguity(
                    normalized,
                    candidates
                );

            if (!selected) {

                return {

                    name: "unknown",

                    intent: "unknown",

                    confidence: 0,

                    candidates: []

                };

            }

            const ambiguity =
                this.detectAmbiguity(
                    candidates
                );

            const language =
                this.detectLanguage(
                    normalized
                );

            const result = {

                ...selected,

                confidence:
                    selected.score || 0,

                language,

                ambiguous:
                    ambiguity.ambiguous,

                ambiguityDifference:
                    ambiguity.difference,

                candidates,

                context: {

                    used:
                        this.hasContextReference(
                            normalized
                        ),

                    previousIntent:
                        this.context.lastIntent,

                    previousAction:
                        this.context.lastAction,

                    previousTarget:
                        this.context.lastTarget

                },

                source:
                    "IntentContextLayer",

                version:
                    this.version

            };

            /*
            ------------------------------------------------
            Remember successful resolution
            ------------------------------------------------
            */

            if (
                result.confidence >= 0.30
            ) {

                this.remember(result);

            }

            return result;

        }

        catch (error) {

            console.error(
                "❌ Intent Context Resolve Error:",
                error
            );

            return {

                name: "unknown",

                intent: "unknown",

                action: null,

                target: null,

                query: "",

                confidence: 0,

                ambiguous: false,

                text:
                    this.normalize(text),

                error:
                    error.message,

                source:
                    "IntentContextLayer"

            };

        }

    }


    // ==================================================
    // RESET CONTEXT
    // ==================================================

    clearContext() {

        this.context = {

            lastIntent: null,
            lastAction: null,
            lastTarget: null,
            lastQuery: null,
            lastText: null,

            history: []

        };

        return true;

    }


    // ==================================================
    // DIAGNOSTICS
    // ==================================================

    diagnostics() {

        return {

            engine:
                "JARVIS Intent Context Layer",

            version:
                this.version,

            history:
                this.context.history.length,

            lastIntent:
                this.context.lastIntent,

            lastAction:
                this.context.lastAction,

            lastTarget:
                this.context.lastTarget,

            status:
                "online"

        };

    }

}


// ======================================================
// CONNECT PART 4 TO PART 3
// ======================================================

window.JARVISIntentContext =

    new JARVISIntentContextLayer(
        window.JARVISIntentAdvanced || null
    );


// ======================================================
// MAIN HELPER
// ======================================================

window.resolveIntent = function(text) {

    return window.JARVISIntentContext.resolve(
        text
    );

};


// ======================================================
// CLEAR CONTEXT HELPER
// ======================================================

window.clearIntentContext = function() {

    return window.JARVISIntentContext.clearContext();

};


// ======================================================
// DIAGNOSTICS HELPER
// ======================================================

window.getIntentDiagnostics = function() {

    return window.JARVISIntentContext.diagnostics();

};


// ======================================================
// READY EVENT
// ======================================================

window.dispatchEvent(
    new CustomEvent(
        "JARVIS_INTENT_CONTEXT_READY",
        {

            detail:
                window.JARVISIntentContext.diagnostics()

        }
    )
);


console.log(
    "✅ IntentEngine.js PART 4/5 READY"
);
"use strict";

/*
========================================================
JARVIS PRO MAX
IntentEngine.js
V12 PRO MAX
PART 5/5

FINAL INTENT RESOLVER

Features:
- Final Resolver
- Advanced Intent Integration
- Context Integration
- Alias / Synonym Integration
- Confidence Normalization
- Ambiguity Handling
- Intent Correction
- Compatibility API
- Diagnostics
- Safe Production Export
========================================================
*/


class JARVISIntentFinalResolver {

    constructor() {

        this.version = "V12 PRO MAX FINAL";

        this.status = "initializing";

        this.advanced =
            window.JARVISIntentAdvanced || null;

        this.context =
            window.JARVISIntentContext || null;

        this.base =
            window.IntentEngine || null;

        this.stats = {

            total: 0,

            successful: 0,

            failed: 0,

            ambiguous: 0,

            corrected: 0

        };

        this.lastResult = null;

        console.log(
            "🧠 JARVIS Final Intent Resolver Created"
        );

    }


    // ==================================================
    // SAFE NORMALIZE
    // ==================================================

    normalize(text) {

        if (
            this.advanced &&
            typeof this.advanced.normalize ===
            "function"
        ) {

            return this.advanced.normalize(text);

        }

        if (
            this.context &&
            typeof this.context.normalize ===
            "function"
        ) {

            return this.context.normalize(text);

        }

        if (typeof text !== "string") {

            return "";

        }

        return text
            .normalize("NFKC")
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s._-]/gu, " ")
            .replace(/\s+/g, " ")
            .trim();

    }


    // ==================================================
    // SAFE BASE INTENT
    // ==================================================

    getBaseIntent(text) {

        try {

            if (
                this.base &&
                typeof this.base.detect ===
                "function"
            ) {

                return this.base.detect(text);

            }

        }

        catch (error) {

            console.warn(
                "Base Intent Engine Error:",
                error
            );

        }

        return null;

    }


    // ==================================================
    // ADVANCED INTENT
    // ==================================================

    getAdvancedIntent(text) {

        try {

            if (
                this.advanced &&
                typeof this.advanced.resolve ===
                "function"
            ) {

                return this.advanced.resolve(text);

            }

        }

        catch (error) {

            console.warn(
                "Advanced Intent Error:",
                error
            );

        }

        return null;

    }


    // ==================================================
    // CONTEXT INTENT
    // ==================================================

    getContextIntent(text) {

        try {

            if (
                this.context &&
                typeof this.context.resolve ===
                "function"
            ) {

                return this.context.resolve(text);

            }

        }

        catch (error) {

            console.warn(
                "Context Intent Error:",
                error
            );

        }

        return null;

    }


    // ==================================================
    // CONFIDENCE NORMALIZER
    // ==================================================

    normalizeConfidence(value) {

        let confidence =
            Number(value);

        if (
            Number.isNaN(confidence)
        ) {

            confidence = 0;

        }

        /*
        ------------------------------------------------
        Support percentage values
        ------------------------------------------------
        */

        if (confidence > 1) {

            confidence =
                confidence / 100;

        }

        confidence =
            Math.max(
                0,
                Math.min(
                    0.99,
                    confidence
                )
            );

        return Number(
            confidence.toFixed(3)
        );

    }


    // ==================================================
    // INTENT VALIDATION
    // ==================================================

    validateIntent(intent) {

        if (!intent) {

            return false;

        }

        if (
            typeof intent !== "object"
        ) {

            return false;

        }

        return Boolean(

            intent.name ||
            intent.intent ||
            intent.action

        );

    }


    // ==================================================
    // INTENT QUALITY SCORE
    // ==================================================

    qualityScore(intent) {

        if (!intent) {

            return 0;

        }

        let score = 0;

        if (
            intent.action
        ) {

            score += 0.25;

        }

        if (
            intent.target
        ) {

            score += 0.25;

        }

        if (
            intent.commandType
        ) {

            score += 0.20;

        }

        if (
            intent.query
        ) {

            score += 0.10;

        }

        if (
            intent.context &&
            intent.context.used
        ) {

            score += 0.10;

        }

        if (
            intent.source
        ) {

            score += 0.05;

        }

        if (
            intent.confidence
        ) {

            score +=
                this.normalizeConfidence(
                    intent.confidence
                ) * 0.05;

        }

        return Math.min(
            0.99,
            Number(score.toFixed(3))
        );

    }


    // ==================================================
    // MERGE INTENTS
    // ==================================================

    mergeIntent(
        base,
        advanced,
        contextual
    ) {

        const candidates = [

            base,
            advanced,
            contextual

        ].filter(
            intent =>
                this.validateIntent(intent)
        );

        if (!candidates.length) {

            return null;

        }

        /*
        ------------------------------------------------
        Prefer contextual result when strong
        ------------------------------------------------
        */

        const sorted =
            candidates
                .slice()
                .sort(
                    (a, b) => {

                        const scoreA =
                            this.normalizeConfidence(
                                a.confidence
                            ) +
                            this.qualityScore(a);

                        const scoreB =
                            this.normalizeConfidence(
                                b.confidence
                            ) +
                            this.qualityScore(b);

                        return scoreB - scoreA;

                    }
                );

        const best =
            sorted[0];

        return {

            ...best,

            action:
                best.action ||
                advanced?.action ||
                contextual?.action ||
                base?.action ||
                null,

            target:
                best.target ||
                advanced?.target ||
                contextual?.target ||
                base?.target ||
                null,

            query:
                best.query ||
                contextual?.query ||
                advanced?.query ||
                base?.query ||
                "",

            commandType:
                best.commandType ||
                advanced?.commandType ||
                contextual?.commandType ||
                base?.commandType ||
                null

        };

    }


    // ==================================================
    // CONTEXT CORRECTION
    // ==================================================

    applyContextCorrection(
        text,
        intent
    ) {

        if (
            !intent ||
            !this.context
        ) {

            return {

                intent,

                corrected: false

            };

        }

        if (
            typeof this.context.hasContextReference !==
            "function"
        ) {

            return {

                intent,

                corrected: false

            };

        }

        const hasContext =
            this.context.hasContextReference(
                text
            );

        if (!hasContext) {

            return {

                intent,

                corrected: false

            };

        }

        let corrected = false;

        const previous =
            typeof this.context.getPreviousIntent ===
            "function"
                ? this.context.getPreviousIntent()
                : null;

        if (
            previous &&
            !intent.target &&
            previous.target
        ) {

            intent.target =
                previous.target;

            corrected = true;

        }

        if (
            previous &&
            !intent.action &&
            previous.action
        ) {

            intent.action =
                previous.action;

            corrected = true;

        }

        if (
            previous &&
            !intent.query &&
            previous.query
        ) {

            intent.query =
                previous.query;

            corrected = true;

        }

        if (
            corrected
        ) {

            this.stats.corrected++;

            intent.contextCorrection =
                true;

        }

        return {

            intent,

            corrected

        };

    }


    // ==================================================
    // FINAL COMMAND TYPE
    // ==================================================

    resolveCommandType(intent) {

        if (!intent) {

            return "chat";

        }

        if (
            intent.commandType
        ) {

            return intent.commandType;

        }

        const action =
            intent.action;

        const target =
            intent.target;

        if (
            action === "open" &&
            target
        ) {

            return "open_app";

        }

        if (
            action === "close" &&
            target
        ) {

            return "close_app";

        }

        if (
            action === "search"
        ) {

            return "web_search";

        }

        if (
            action === "play"
        ) {

            return "media_play";

        }

        if (
            action === "stop"
        ) {

            return "media_stop";

        }

        return "chat";

    }


    // ==================================================
    // FINAL CONFIDENCE
    // ==================================================

    calculateFinalConfidence(intent) {

        if (!intent) {

            return 0;

        }

        let confidence =
            this.normalizeConfidence(
                intent.confidence
            );

        /*
        ------------------------------------------------
        Strong explicit command
        ------------------------------------------------
        */

        if (
            intent.action &&
            intent.target
        ) {

            confidence += 0.15;

        }

        /*
        ------------------------------------------------
        Known command type
        ------------------------------------------------
        */

        if (
            intent.commandType
        ) {

            confidence += 0.10;

        }

        /*
        ------------------------------------------------
        Context correction
        ------------------------------------------------
        */

        if (
            intent.contextCorrection
        ) {

            confidence += 0.05;

        }

        /*
        ------------------------------------------------
        Ambiguous result penalty
        ------------------------------------------------
        */

        if (
            intent.ambiguous
        ) {

            confidence -= 0.10;

        }

        return Number(
            Math.max(
                0,
                Math.min(
                    0.99,
                    confidence
                )
            ).toFixed(3)
        );

    }


    // ==================================================
    // AMBIGUITY FINAL CHECK
    // ==================================================

    checkAmbiguity(intent) {

        if (!intent) {

            return false;

        }

        if (
            intent.ambiguous === true
        ) {

            return true;

        }

        if (
            typeof intent.ambiguityDifference ===
            "number"
        ) {

            return (
                intent.ambiguityDifference <
                0.10
            );

        }

        return false;

    }


    // ==================================================
    // BUILD FINAL RESULT
    // ==================================================

    buildResult(
        text,
        base,
        advanced,
        contextual
    ) {

        let merged =
            this.mergeIntent(
                base,
                advanced,
                contextual
            );

        if (!merged) {

            return {

                name: "chat",

                intent: "chat",

                action: null,

                target: null,

                query: "",

                commandType: "chat",

                confidence: 0,

                text,

                source:
                    "JARVISIntentFinalResolver",

                version:
                    this.version

            };

        }

        /*
        ------------------------------------------------
        Apply context correction
        ------------------------------------------------
        */

        const correction =
            this.applyContextCorrection(
                text,
                merged
            );

        merged =
            correction.intent;

        /*
        ------------------------------------------------
        Resolve final command type
        ------------------------------------------------
        */

        merged.commandType =
            this.resolveCommandType(
                merged
            );

        /*
        ------------------------------------------------
        Resolve final intent name
        ------------------------------------------------
        */

        merged.name =
            merged.commandType ||
            merged.intent ||
            "chat";

        merged.intent =
            merged.commandType ||
            merged.intent ||
            "chat";

        /*
        ------------------------------------------------
        Final confidence
        ------------------------------------------------
        */

        merged.confidence =
            this.calculateFinalConfidence(
                merged
            );

        /*
        ------------------------------------------------
        Final ambiguity
        ------------------------------------------------
        */

        merged.ambiguous =
            this.checkAmbiguity(
                merged
            );

        /*
        ------------------------------------------------
        Final metadata
        ------------------------------------------------
        */

        return {

            ...merged,

            text,

            normalizedText:
                this.normalize(text),

            language:
                merged.language ||
                this.detectLanguage(text),

            contextCorrection:
                Boolean(
                    merged.contextCorrection
                ),

            source:
                "JARVISIntentFinalResolver",

            version:
                this.version,

            timestamp:
                Date.now()

        };

    }


    // ==================================================
    // LANGUAGE DETECTION
    // ==================================================

    detectLanguage(text) {

        if (
            this.context &&
            typeof this.context.detectLanguage ===
            "function"
        ) {

            return this.context.detectLanguage(
                text
            );

        }

        return "unknown";

    }


    // ==================================================
    // FINAL RESOLVE
    // ==================================================

    resolve(text) {

        this.stats.total++;

        try {

            const normalized =
                this.normalize(text);

            if (!normalized) {

                this.stats.failed++;

                return {

                    success: false,

                    name: "unknown",

                    intent: "unknown",

                    action: null,

                    target: null,

                    query: "",

                    confidence: 0,

                    text: "",

                    source:
                        "JARVISIntentFinalResolver"

                };

            }


            /*
            ------------------------------------------------
            Get all available intent layers
            ------------------------------------------------
            */

            const base =
                this.getBaseIntent(
                    normalized
                );

            const advanced =
                this.getAdvancedIntent(
                    normalized
                );

            const contextual =
                this.getContextIntent(
                    normalized
                );


            /*
            ------------------------------------------------
            Build final result
            ------------------------------------------------
            */

            const result =
                this.buildResult(
                    normalized,
                    base,
                    advanced,
                    contextual
                );


            /*
            ------------------------------------------------
            Statistics
            ------------------------------------------------
            */

            if (
                result.ambiguous
            ) {

                this.stats.ambiguous++;

            }


            if (
                result.confidence >= 0.30
            ) {

                this.stats.successful++;

            }
            else {

                this.stats.failed++;

            }


            this.lastResult =
                result;


            return {

                success: true,

                ...result

            };

        }

        catch (error) {

            this.stats.failed++;

            console.error(
                "❌ FINAL INTENT RESOLUTION ERROR:",
                error
            );

            const fallback = {

                success: false,

                name: "unknown",

                intent: "unknown",

                action: null,

                target: null,

                query: "",

                commandType: null,

                confidence: 0,

                ambiguous: false,

                text:
                    this.normalize(text),

                source:
                    "JARVISIntentFinalResolver",

                version:
                    this.version,

                error:
                    error.message

            };

            this.lastResult =
                fallback;

            return fallback;

        }

    }


    // ==================================================
    // COMPATIBILITY DETECT
    // ==================================================

    detect(text) {

        return this.resolve(
            text
        );

    }


    // ==================================================
    // COMPATIBILITY PROCESS
    // ==================================================

    process(text) {

        return this.resolve(
            text
        );

    }


    // ==================================================
    // LAST RESULT
    // ==================================================

    getLastResult() {

        return this.lastResult;

    }


    // ==================================================
    // RESET
    // ==================================================

    reset() {

        this.lastResult = null;

        this.stats = {

            total: 0,

            successful: 0,

            failed: 0,

            ambiguous: 0,

            corrected: 0

        };

        return true;

    }


    // ==================================================
    // DIAGNOSTICS
    // ==================================================

    diagnostics() {

        return {

            engine:
                "JARVIS Intent Final Resolver",

            version:
                this.version,

            status:
                this.status,

            baseEngine:
                Boolean(this.base),

            advancedEngine:
                Boolean(this.advanced),

            contextEngine:
                Boolean(this.context),

            statistics: {

                ...this.stats

            },

            lastIntent:
                this.lastResult?.name ||
                null,

            lastConfidence:
                this.lastResult?.confidence ||
                0

        };

    }


    // ==================================================
    // START
    // ==================================================

    start() {

        this.status =
            "online";

        console.log(
            "🟢 JARVIS Final Intent Resolver ONLINE"
        );

        return true;

    }

}


// ======================================================
// CREATE FINAL ENGINE
// ======================================================

window.JARVISIntentFinal =

    new JARVISIntentFinalResolver();


// ======================================================
// START ENGINE
// ======================================================

window.JARVISIntentFinal.start();


// ======================================================
// GLOBAL RESOLVE API
// ======================================================

window.resolveJARVISIntent = function(text) {

    return window.JARVISIntentFinal.resolve(
        text
    );

};


// ======================================================
// GLOBAL DETECT API
// ======================================================

window.detectJARVISIntent = function(text) {

    return window.JARVISIntentFinal.detect(
        text
    );

};


// ======================================================
// GLOBAL PROCESS API
// ======================================================

window.processJARVISIntent = function(text) {

    return window.JARVISIntentFinal.process(
        text
    );

};


// ======================================================
// DIAGNOSTICS API
// ======================================================

window.getJARVISIntentDiagnostics =
    function() {

        return window.JARVISIntentFinal
            .diagnostics();

    };


// ======================================================
// EVENT
// ======================================================

try {

    window.dispatchEvent(

        new CustomEvent(
            "JARVIS_INTENT_FINAL_READY",
            {

                detail:
                    window.JARVISIntentFinal
                        .diagnostics()

            }

        )

    );

}
catch (error) {

    console.warn(
        "Intent Ready Event Error:",
        error
    );

}


// ======================================================
// FINAL LOG
// ======================================================

console.log(
    "✅ IntentEngine.js V12 PRO MAX PART 5/5 READY"
);

console.log(
    "🎯 Final Intent Resolver Online"
);