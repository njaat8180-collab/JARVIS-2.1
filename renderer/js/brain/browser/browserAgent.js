// ==========================================
// JARVIS PRO MAX
// Browser AI Agent V7 PROFESSIONAL
// PART 1A / 4
// Core + Platform Database
// renderer/js/brain/browser/browserAgent.js
// ==========================================

"use strict";

(function () {

const BrowserAgent = {

    // ======================================
    // BASIC INFO
    // ======================================

    version: "7.0",

    name: "Browser AI Agent",

    initialized: false,

    busy: false,

    // ======================================
    // PLATFORM DATABASE
    // ======================================

    platforms: {

        youtube: [
            "youtube",
            "yt"
        ],

        google: [
            "google",
            "google search",
            "web",
            "internet"
        ],

        github: [
            "github",
            "git hub"
        ],

        wikipedia: [
            "wikipedia",
            "wiki"
        ],

        reddit: [
            "reddit"
        ],

        amazon: [
            "amazon"
        ],

        flipkart: [
            "flipkart"
        ],

        stackoverflow: [
            "stackoverflow",
            "stack overflow"
        ],

        chatgpt: [
            "chatgpt",
            "chat gpt",
            "openai"
        ],

        gemini: [
            "gemini",
            "google gemini"
        ],

        linkedin: [
            "linkedin",
            "linkedin"
        ],

        instagram: [
            "instagram",
            "insta"
        ],

        facebook: [
            "facebook",
            "fb"
        ],

        netflix: [
            "netflix"
        ],

        spotify: [
            "spotify"
        ],

        gmail: [
            "gmail",
            "google mail"
        ],

        drive: [
            "google drive",
            "drive"
        ],

        maps: [
            "google maps",
            "maps"
        ],

        discord: [
            "discord"
        ],

        steam: [
            "steam"
        ],

        whatsapp: [
            "whatsapp",
            "whats app"
        ],

        telegram: [
            "telegram"
        ],

        quora: [
            "quora"
        ],

        pinterest: [
            "pinterest"
        ],

        canva: [
            "canva"
        ],

        paytm: [
            "paytm"
        ],

        phonepe: [
            "phonepe",
            "phone pe"
        ],

        zomato: [
            "zomato"
        ],

        swiggy: [
            "swiggy"
        ],

        hotstar: [
            "hotstar",
            "disney hotstar",
            "disney plus hotstar"
        ],

        primevideo: [
            "prime video",
            "amazon prime",
            "prime"
        ],

        jiocinema: [
            "jio cinema",
            "jiocinema"
        ],

        bing: [
            "bing"
        ],

        duckduckgo: [
            "duckduckgo",
            "duck duck go"
        ],

        myntra: [
            "myntra"
        ],

        meesho: [
            "meesho"
        ],

        twitter: [
            "twitter",
            "x.com",
            "x app"
        ],

        yahoo: [
            "yahoo"
        ]

    },
    // ======================================
    // APPLICATION DATABASE
    // ======================================

    apps: {

        chrome: [
            "chrome",
            "google chrome"
        ],

        edge: [
            "edge",
            "microsoft edge"
        ],

        firefox: [
            "firefox",
            "mozilla firefox"
        ],

        brave: [
            "brave",
            "brave browser"
        ],

        opera: [
            "opera",
            "opera browser"
        ],

        vscode: [
            "vs code",
            "visual studio code",
            "vscode"
        ],

        cursor: [
            "cursor",
            "cursor ai"
        ],

        androidStudio: [
            "android studio"
        ],

        intellij: [
            "intellij",
            "intellij idea"
        ],

        pycharm: [
            "pycharm"
        ],

        eclipse: [
            "eclipse"
        ],

        sublime: [
            "sublime",
            "sublime text"
        ],

        notepad: [
            "notepad",
            "note pad"
        ],

        notepadpp: [
            "notepad++",
            "notepad plus plus"
        ],

        word: [
            "word",
            "microsoft word"
        ],

        excel: [
            "excel",
            "microsoft excel"
        ],

        powerpoint: [
            "powerpoint",
            "power point"
        ],

        calculator: [
            "calculator",
            "calc"
        ],

        explorer: [
            "file explorer",
            "windows explorer",
            "explorer"
        ],

        taskManager: [
            "task manager"
        ],

        terminal: [
            "terminal",
            "cmd",
            "command prompt"
        ],

        powershell: [
            "powershell",
            "power shell"
        ],

        settings: [
            "settings",
            "windows settings"
        ]

    },

    // ======================================
    // ACTION DATABASE
    // ======================================

    actions: {

        open: [
            "open",
            "launch",
            "start",
            "run"
        ],

        close: [
            "close",
            "exit",
            "quit",
            "stop"
        ],

        search: [
            "search",
            "find",
            "lookup",
            "look for",
            "search for"
        ],

        play: [
            "play",
            "watch",
            "stream",
            "listen"
        ],

        compare: [
            "compare",
            "vs",
            "versus",
            "difference"
        ],

        review: [
            "review",
            "reviews",
            "rating",
            "ratings",
            "feedback"
        ],

        learn: [
            "learn",
            "tutorial",
            "guide",
            "course",
            "documentation",
            "docs"
        ],

        news: [
            "news",
            "latest",
            "update",
            "updates",
            "headline",
            "headlines"
        ],

        product: [
            "buy",
            "purchase",
            "price",
            "cost",
            "cheap",
            "shop",
            "order"
        ]

    },
        // ======================================
    // INITIALIZE
    // ======================================

    init() {

        if (this.initialized)
            return;

        this.initialized = true;

        console.log(
            "🤖 BrowserAgent Initialized"
        );

    },



    // ======================================
    // ANALYZE ENTRY
    // ======================================

    analyze(input) {

        if (
            input === undefined ||
            input === null
        ) {
            return null;
        }

        const text = String(input)
            .trim()
            .toLowerCase();

        if (!text.length)
            return null;

        console.log(
            "🤖 BrowserAgent Analyze:",
            text
        );

        const task =
            this.detectTask(text);

        if (!task)
            return null;

        task.original = input;

        task.cleaned =
            this.cleanQuery(text);

        task.timestamp =
            Date.now();

        return task;

    },



    // ======================================
    // MAIN ROUTER
    // ======================================

    detectTask(text) {

        // Implemented in Part 2

        return null;

    },



    // ======================================
    // CLEAN QUERY
    // ======================================

    cleanQuery(query) {

        if (!query)
            return "";

        return String(query)

            // Wake words
            .replace(/\bhey\s+jarvis\b/gi, "")
            .replace(/\bok\s+jarvis\b/gi, "")
            .replace(/\bhello\s+jarvis\b/gi, "")
            .replace(/\bjarvis\b/gi, "")

            // Actions
            .replace(/\bopen\b/gi, "")
            .replace(/\blaunch\b/gi, "")
            .replace(/\bstart\b/gi, "")
            .replace(/\brun\b/gi, "")

            .replace(/\bsearch\b/gi, "")
            .replace(/\bsearch\s+for\b/gi, "")
            .replace(/\bfind\b/gi, "")
            .replace(/\blookup\b/gi, "")
            .replace(/\blook\s+for\b/gi, "")

            .replace(/\bplay\b/gi, "")
            .replace(/\bwatch\b/gi, "")
            .replace(/\blisten\b/gi, "")

            // Fillers
            .replace(/\bon\b/gi, "")
            .replace(/\bin\b/gi, "")
            .replace(/\bat\b/gi, "")
            .replace(/\bfor\b/gi, "")
            .replace(/\bthe\b/gi, "")
            .replace(/\bplease\b/gi, "")

            // Symbols
            .replace(/[^\w\s-]/g, " ")

            // Multiple spaces
            .replace(/\s+/g, " ")

            .trim();

    },



    // ======================================
    // WORD MATCH
    // ======================================

    hasWord(text, words) {

        if (
            !text ||
            !Array.isArray(words)
        ) {
            return false;
        }

        return words.some(word => {

            const pattern = new RegExp(

                "\\b" +

                word
                    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
                    .replace(/\s+/g, "\\s+")

                +

                "\\b",

                "i"

            );

            return pattern.test(text);

        });

    },



    // ======================================
    // PLATFORM DETECTOR
    // ======================================

    detectPlatform(text) {

        for (const platform in this.platforms) {

            if (
                this.hasWord(
                    text,
                    this.platforms[platform]
                )
            ) {

                return platform;

            }

        }

        return null;

    },



    // ======================================
    // APPLICATION DETECTOR
    // ======================================

    detectApp(text) {

        for (const app in this.apps) {

            if (
                this.hasWord(
                    text,
                    this.apps[app]
                )
            ) {

                return app;

            }

        }

        return null;

    },
        // ======================================
    // PLATFORM URL
    // ======================================

    getPlatformUrl(platform) {

        const urls = {

            youtube: "https://youtube.com",

            google: "https://google.com",

            github: "https://github.com",

            wikipedia: "https://wikipedia.org",

            reddit: "https://reddit.com",

            amazon: "https://amazon.in",

            flipkart: "https://flipkart.com",

            stackoverflow: "https://stackoverflow.com",

            chatgpt: "https://chat.openai.com",

            gemini: "https://gemini.google.com",

            linkedin: "https://linkedin.com",

            twitter: "https://x.com",

            instagram: "https://instagram.com",

            facebook: "https://facebook.com",

            netflix: "https://netflix.com",

            spotify: "https://spotify.com",

            gmail: "https://mail.google.com",

            drive: "https://drive.google.com",

            maps: "https://maps.google.com",

            discord: "https://discord.com",

            steam: "https://store.steampowered.com",

            whatsapp: "https://web.whatsapp.com",

            telegram: "https://web.telegram.org",

            quora: "https://www.quora.com",

            pinterest: "https://www.pinterest.com",

            canva: "https://www.canva.com",

            paytm: "https://paytm.com",

            phonepe: "https://www.phonepe.com",

            zomato: "https://www.zomato.com",

            swiggy: "https://www.swiggy.com",

            hotstar: "https://www.hotstar.com",

            primevideo: "https://www.primevideo.com",

            jiocinema: "https://www.jiocinema.com",

            bing: "https://www.bing.com",

            duckduckgo: "https://duckduckgo.com",

            myntra: "https://www.myntra.com",

            meesho: "https://www.meesho.com",

            yahoo: "https://www.yahoo.com"

        };

        return urls[platform] || "";

    },



    // ======================================
    // NORMALIZE TEXT
    // ======================================

    normalize(text) {

        if (!text)
            return "";

        return String(text)

            .toLowerCase()

            .trim()

            .replace(/[^\w\s]/g, " ")

            .replace(/\s+/g, " ");

    },



    // ======================================
    // VALIDATE TASK
    // ======================================

    validateTask(task) {

        if (!task)
            return false;

        if (typeof task !== "object")
            return false;

        if (!task.intent)
            return false;

        return true;

    },



    // ======================================
    // VERSION
    // ======================================

    getVersion() {

        return this.version;

    },



    // ======================================
    // RESET
    // ======================================

    reset() {

        this.busy = false;

        this.initialized = false;

        console.log(
            "♻ BrowserAgent Reset"
        );

    }

}; // <-- BrowserAgent Object End



// ======================================
// EXPORT
// ======================================

window.BrowserAgent = BrowserAgent;



// ======================================
// AUTO INIT
// ======================================

BrowserAgent.init();



console.log(
    "🤖 BrowserAgent V7 PART-1 Loaded"
);

})();

// ==========================================
// JARVIS PRO MAX
// Browser AI Agent V7 PROFESSIONAL
// PART 2A / 2
// Smart Intent Detection Core
// renderer/js/brain/browser/browserAgent.js
// ==========================================


// ==========================================
// DETECT TASK ENGINE
// ==========================================

BrowserAgent.detectTask = function (input) {


    if (!input)
        return null;



    const text =
        this.normalize(input);



    console.log(
        "🧠 BrowserAgent Detect:",
        text
    );



    const platform =
        this.detectPlatform(text);



    const app =
        this.detectApp(text);




    // =====================================
    // OPEN APPLICATION
    // =====================================

    if (

        app &&

        this.hasWord(
            text,
            this.actions.open
        )

    ) {


        return {

            intent:"open_app",

            app:app,

            query:app,

            timestamp:
            Date.now()

        };


    }




    // =====================================
    // OPEN WEBSITE
    // =====================================

    if (

        platform &&

        this.hasWord(
            text,
            this.actions.open
        )

    ) {


        return {

            intent:"open_website",

            site:platform,

            url:
            this.getPlatformUrl(platform),

            query:platform,

            timestamp:
            Date.now()

        };


    }





    // =====================================
    // YOUTUBE SEARCH
    // =====================================

    if (

        platform === "youtube"

        &&

        (

            this.hasWord(
                text,
                this.actions.search
            )

            ||

            this.hasWord(
                text,
                this.actions.play
            )

        )

    ) {


        return {


            intent:"youtube_search",

            site:"youtube",

            query:

            this.cleanQuery(

                text

                .replace(
                    /\byoutube\b/gi,
                    ""
                )

                .replace(
                    /\byt\b/gi,
                    ""
                )

            ),


            timestamp:
            Date.now()


        };


    }





    // =====================================
    // GOOGLE SEARCH
    // =====================================

    if (

        platform === "google"

        &&

        this.hasWord(
            text,
            this.actions.search
        )

    ) {


        return {


            intent:"google_search",

            site:"google",

            query:

            this.cleanQuery(

                text.replace(
                    /\bgoogle\b/gi,
                    ""
                )

            ),


            timestamp:
            Date.now()


        };


    }





    // =====================================
    // GITHUB SEARCH
    // =====================================

    if (

        platform === "github"

    ) {


        return {


            intent:"github_search",

            site:"github",

            query:

            this.cleanQuery(

                text.replace(
                    /\bgithub\b/gi,
                    ""
                )

            ),


            timestamp:
            Date.now()


        };


    }





    // =====================================
    // WIKIPEDIA SEARCH
    // =====================================

    if (

        platform === "wikipedia"

    ) {


        return {


            intent:"wikipedia_search",

            site:"wikipedia",

            query:

            this.cleanQuery(

                text

                .replace(
                    /\bwikipedia\b/gi,
                    ""
                )

                .replace(
                    /\bwiki\b/gi,
                    ""
                )

            ),


            timestamp:
            Date.now()


        };


    }





    // =====================================
    // REDDIT SEARCH
    // =====================================

    if (

        platform === "reddit"

    ) {


        return {


            intent:"reddit_search",

            site:"reddit",

            query:

            this.cleanQuery(

                text.replace(
                    /\breddit\b/gi,
                    ""
                )

            ),


            timestamp:
            Date.now()


        };


    }





    // =====================================
    // PART 2B CONTINUE
    // Product / Compare / Review
    // =====================================


 // =====================================
// DEFAULT SEARCH FALLBACK
// =====================================

return {

    intent:"search",

    query:
    this.cleanQuery(text),

    timestamp:
    Date.now()

};


// ==========================================
// PART 2B COMPLETE
// ==========================================

console.log(
    "✅ BrowserAgent V7 Part 2B Loaded"
);


};







// ==========================================
// PART 2A COMPLETE
// ==========================================

console.log(
    "✅ BrowserAgent V7 Part 2A Loaded"
);




























// ==========================================
// JARVIS PRO MAX
// Browser AI Agent V7 PROFESSIONAL
// PART 3A / 4
// Execution Engine
// ==========================================

BrowserAgent.execute = function (task) {

    // ======================================
    // VALIDATION
    // ======================================

    if (!this.validateTask(task)) {

        console.error(
            "❌ Invalid Browser Task",
            task
        );

        return false;

    }

    // ======================================
    // BUSY CHECK
    // ======================================

    if (
        window.BrowserExecution &&
        typeof BrowserExecution.isRunning === "function" &&
        BrowserExecution.isRunning()
    ) {

        console.warn(
            "⚠ BrowserExecution Busy"
        );

        return false;

    }

    // ======================================
    // PLANNER CHECK
    // ======================================

    if (
        !window.BrowserPlanner ||
        typeof BrowserPlanner.createPlan !== "function"
    ) {

        console.error(
            "❌ BrowserPlanner Missing"
        );

        return false;

    }

    let plan = null;

    // ======================================
    // PLAN GENERATOR
    // ======================================

    switch (task.intent) {

        // -----------------------------
        // OPEN APPLICATION
        // -----------------------------

        case "open_app":

            plan = BrowserPlanner.createPlan(
                "open_app",
                task.app
            );

            break;

        // -----------------------------
        // OPEN WEBSITE
        // -----------------------------

        case "open_website":

            plan = BrowserPlanner.createPlan(
                "open_website",
                task.site
            );

            break;

        // -----------------------------
        // YOUTUBE SEARCH
        // -----------------------------

        case "youtube_search":

            plan = BrowserPlanner.createPlan(
                "youtube_search",
                task.query
            );

            break;

        // -----------------------------
        // GOOGLE SEARCH
        // -----------------------------

        case "google_search":

            plan = BrowserPlanner.createPlan(
                "google_search",
                task.query
            );

            break;

        // -----------------------------
        // GITHUB SEARCH
        // -----------------------------

        case "github_search":

            plan = BrowserPlanner.createPlan(
                "github_search",
                task.query
            );

            break;

        // -----------------------------
        // WIKIPEDIA SEARCH
        // -----------------------------

        case "wikipedia_search":

            plan = BrowserPlanner.createPlan(
                "wikipedia_search",
                task.query
            );

            break;

        // -----------------------------
        // AMAZON SEARCH
        // -----------------------------

        case "amazon_search":

            plan = BrowserPlanner.createPlan(
                "amazon_search",
                task.query
            );

            break;

        // -----------------------------
        // FLIPKART SEARCH
        // -----------------------------

        case "flipkart_search":

            plan = BrowserPlanner.createPlan(
                "flipkart_search",
                task.query
            );

            break;

        // -----------------------------
        // PRODUCT
        // -----------------------------

        case "product":

            plan = BrowserPlanner.createPlan(
                "product",
                task.query
            );

            break;

        // -----------------------------
        // COMPARE
        // -----------------------------

        case "compare":

            plan = BrowserPlanner.createPlan(
                "compare",
                task.query
            );

            break;

        // -----------------------------
        // REVIEW
        // -----------------------------

        case "review":

            plan = BrowserPlanner.createPlan(
                "review",
                task.query
            );

            break;

        // -----------------------------
        // LEARN
        // -----------------------------

        case "learn":

            plan = BrowserPlanner.createPlan(
                "learn",
                task.query
            );

            break;

        // -----------------------------
        // NEWS
        // -----------------------------

        case "news":

            plan = BrowserPlanner.createPlan(
                "news",
                task.query
            );

            break;

        // -----------------------------
        // DEFAULT SEARCH
        // -----------------------------

        default:

            plan = BrowserPlanner.createPlan(
                "search",
                task.query
            );

    }

    // ======================================
    // PLAN CHECK
    // ======================================

    if (!plan) {

        console.error(
            "❌ Failed To Create Plan"
        );

        return false;

    }

    console.log(
        "📋 Browser Plan Created",
        plan
    );

    // ======================================
    // EXECUTE USING PLANNER
    // ======================================

    if (
        typeof BrowserPlanner.execute === "function"
    ) {

        return BrowserPlanner.execute(plan);

    }

    // ======================================
    // FALLBACK EXECUTION
    // ======================================

    if (
        window.BrowserExecution &&
        typeof BrowserExecution.start === "function"
    ) {

        return BrowserExecution.start(plan);

    }

    console.error(
        "❌ No Browser Execution Engine Available"
    );

    return false;

};
// ==========================================
// JARVIS PRO MAX
// Browser AI Agent V7 PROFESSIONAL
// PART 3B / 4
// Validation + Status + Busy
// ==========================================

// ==========================================
// VALIDATE TASK
// ==========================================

BrowserAgent.validateTask = function (task) {

    if (!task)
        return false;

    if (typeof task !== "object")
        return false;

    if (!task.intent)
        return false;

    return true;

};

// ==========================================
// BUSY STATE
// ==========================================

BrowserAgent.isBusy = function () {

    if (
        window.BrowserExecution &&
        typeof BrowserExecution.isRunning === "function"
    ) {

        return BrowserExecution.isRunning();

    }

    return false;

};

// ==========================================
// SUPPORTED INTENTS
// ==========================================

BrowserAgent.supportedIntents = function () {

    return [

        "search",

        "youtube_search",

        "google_search",

        "github_search",

        "wikipedia_search",

        "reddit_search",

        "amazon_search",

        "flipkart_search",

        "product",

        "compare",

        "review",

        "learn",

        "news",

        "open_app",

        "open_website"

    ];

};

// ==========================================
// CAN HANDLE
// ==========================================

BrowserAgent.canHandle = function (intent) {

    return this.supportedIntents().includes(intent);

};

// ==========================================
// TASK SUMMARY
// ==========================================

BrowserAgent.getTaskSummary = function (task) {

    if (!task)
        return null;

    return {

        intent: task.intent,

        target:
            task.site ||
            task.app ||
            "",

        query:
            task.query ||
            "",

        timestamp:
            task.timestamp ||
            Date.now()

    };

};

// ==========================================
// EXPORT TASK
// ==========================================

BrowserAgent.exportTask = function (task) {

    return JSON.parse(
        JSON.stringify(task)
    );

};

console.log(
    "✅ BrowserAgent Part 3B Loaded"
);
// ==========================================
// JARVIS PRO MAX
// Browser AI Agent V7 PROFESSIONAL
// PART 3C / 4
// Final Export + Status + Auto Init
// ==========================================

// ==========================================
// RESET
// ==========================================

BrowserAgent.reset = function () {

    this.initialized = false;

    this.busy = false;

    console.log(
        "♻ BrowserAgent Reset"
    );

};

// ==========================================
// VERSION
// ==========================================

BrowserAgent.getVersion = function () {

    return this.version;

};

// ==========================================
// EXPORT
// ==========================================

BrowserAgent.export = function () {

    return {

        name: this.name,

        version: this.version,

        initialized: this.initialized,

        busy: this.isBusy(),

        supportedIntents:
            this.supportedIntents(),

        plannerLoaded:
            !!window.BrowserPlanner,

        executionLoaded:
            !!window.BrowserExecution,

        parserLoaded:
            !!window.BrowserParser,

        timestamp:
            Date.now()

    };

};

// ==========================================
// STATUS
// ==========================================

BrowserAgent.status = function () {

    return {

        name: this.name,

        version: this.version,

        initialized: this.initialized,

        busy: this.isBusy(),

        plannerLoaded:
            !!window.BrowserPlanner,

        executionLoaded:
            !!window.BrowserExecution,

        parserLoaded:
            !!window.BrowserParser,

        supportedIntents:
            this.supportedIntents(),

        state:
            this.initialized
                ? "ONLINE"
                : "OFFLINE"

    };

};

// ==========================================
// INIT
// ==========================================

BrowserAgent.init = function () {

    if (this.initialized)
        return;

    this.initialized = true;

    console.log(
        "🤖 BrowserAgent Initialized"
    );

};

// ==========================================
// DESTROY
// ==========================================

BrowserAgent.destroy = function () {

    this.busy = false;

    this.initialized = false;

    console.log(
        "🛑 BrowserAgent Destroyed"
    );

};

// ==========================================
// RELOAD
// ==========================================

BrowserAgent.reload = function () {

    this.reset();

    this.init();

    return this.status();

};

// ==========================================
// EXPORT TO WINDOW
// ==========================================

window.BrowserAgent = BrowserAgent;

// ==========================================
// AUTO INIT
// ==========================================

BrowserAgent.init();

// ==========================================
// FINAL LOG
// ==========================================

console.log(
    "🤖 BrowserAgent V7 PROFESSIONAL Loaded"
);