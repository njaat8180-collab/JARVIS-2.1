// ==========================================
// JARVIS PRO MAX
// Browser Session Manager V6
// browserSession.js
// PART 1 / 2
// ==========================================

"use strict";

window.BrowserSession = {

    version: "6.0",

    data: {

        tabs: [],

        currentTab: null,

        lastQuery: "",

        lastEngine: "",

        researchMode: false,

        history: []

    },

    // =====================================
    // SEARCH ENGINES
    // =====================================

    engines: {

        google(query) {
            return "https://www.google.com/search?q=" +
                encodeURIComponent(query);
        },

        youtube(query) {
            return "https://www.youtube.com/results?search_query=" +
                encodeURIComponent(query);
        },

        amazon(query) {
            return "https://www.amazon.in/s?k=" +
                encodeURIComponent(query);
        },

        flipkart(query) {
            return "https://www.flipkart.com/search?q=" +
                encodeURIComponent(query);
        },

        reddit(query) {
            return "https://www.reddit.com/search/?q=" +
                encodeURIComponent(query);
        },

        github(query) {
            return "https://github.com/search?q=" +
                encodeURIComponent(query);
        },

        stackoverflow(query) {
            return "https://stackoverflow.com/search?q=" +
                encodeURIComponent(query);
        },

        mdn(query) {
            return "https://developer.mozilla.org/search?q=" +
                encodeURIComponent(query);
        }

    },

    // =====================================
    // SEARCH
    // =====================================

    search(engine, query) {

        if (!engine || !query)
            return false;

        engine = engine.toLowerCase();

        if (!this.engines[engine]) {

            console.warn(
                "Unknown Engine:",
                engine
            );

            engine = "google";

        }

        this.saveSearch(engine, query);

        const url =
            this.engines[engine](query);

        console.log(
            "🌐 Opening:",
            engine,
            query
        );

        if (window.open) {

            window.open(
                url,
                "_blank"
            );

        }

        this.addTab(engine);

        return true;

    },

    // =====================================
    // ADD TAB
    // =====================================

    addTab(site) {

        if (!site)
            return false;

        if (
            this.data.tabs.includes(site)
        ) {

            this.data.currentTab = site;

            console.log(
                "📄 Switched Tab:",
                site
            );

            return false;

        }

        this.data.tabs.push(site);

        this.data.currentTab = site;

        console.log(
            "➕ New Tab:",
            site
        );

        return true;

    },

    // =====================================
    // HAS TAB
    // =====================================

    hasTab(site) {

        return this.data.tabs.includes(site);

    },

    // =====================================
    // SAVE SEARCH
    // =====================================

    saveSearch(engine, query) {

        this.data.lastEngine = engine;

        this.data.lastQuery = query;

        this.data.history.push({

            engine,

            query,

            time: Date.now()

        });

        console.log(
            "💾 Session Search:",
            engine,
            query
        );

    },
        // ==========================================
    // SEARCH ENGINE
    // ==========================================

    search(engine, query) {

        if (!engine || !query)
            return false;

        // Same search already executed
        if (
            this.data.lastEngine === engine &&
            this.data.lastQuery === query
        ) {

            console.log(
                "⚠ Duplicate Search Ignored:",
                engine,
                query
            );

            return false;

        }

        this.data.lastEngine = engine;
        this.data.lastQuery = query;

        console.log(
            "🔍 Session Search:",
            engine,
            query
        );

        // Save Browser Memory
        if (window.BrowserMemory) {

            BrowserMemory.save({

                type: "search",

                engine,

                query,

                time: Date.now()

            });

        }

        // Execute Search
        if (
            window.BrowserMultiSearch &&
            typeof BrowserMultiSearch.search === "function"
        ) {

            BrowserMultiSearch.search(
                engine,
                query
            );

        }

        return true;

    },



    // ==========================================
    // SAVE SEARCH
    // ==========================================

    saveSearch(engine, query) {

        return this.search(
            engine,
            query
        );

    },



    // ==========================================
    // GET LAST SEARCH
    // ==========================================

    getLastSearch() {

        return {

            engine:
                this.data.lastEngine,

            query:
                this.data.lastQuery

        };

    },



    // ==========================================
    // RESEARCH MODE
    // ==========================================

    startResearch() {

        this.data.researchMode = true;

        console.log(
            "📚 Research Mode Enabled"
        );

    },



    stopResearch() {

        this.data.researchMode = false;

        console.log(
            "📚 Research Mode Disabled"
        );

    },
        // ==========================================
    // REMOVE TAB
    // ==========================================

    removeTab(site) {

        if (!site)
            return false;

        const index =
            this.data.tabs.indexOf(site);

        if (index === -1)
            return false;

        this.data.tabs.splice(index, 1);

        if (this.data.currentTab === site) {

            this.data.currentTab =
                this.data.tabs.length
                    ? this.data.tabs[this.data.tabs.length - 1]
                    : null;

        }

        console.log(
            "❌ Tab Removed:",
            site
        );

        return true;

    },



    // ==========================================
    // GET TABS
    // ==========================================

    getTabs() {

        return [
            ...this.data.tabs
        ];

    },



    // ==========================================
    // GET CURRENT TAB
    // ==========================================

    getCurrentTab() {

        return this.data.currentTab;

    },



    // ==========================================
    // CLOSE ALL TABS
    // ==========================================

    closeAllTabs() {

        this.data.tabs = [];

        this.data.currentTab = null;

        console.log(
            "🗑 All Tabs Closed"
        );

    },



    // ==========================================
    // RESET SESSION
    // ==========================================

    reset() {

        this.data = {

            tabs: [],

            currentTab: null,

            lastQuery: null,

            lastEngine: null,

            researchMode: false

        };

        console.log(
            "♻ Browser Session Reset"
        );

    },



    // ==========================================
    // CLEAR SESSION
    // ==========================================

    clear() {

        this.reset();

    },



    // ==========================================
    // STATUS
    // ==========================================

    status() {

        return {

            version: "6.0",

            tabs:
                this.data.tabs.length,

            currentTab:
                this.data.currentTab,

            lastSearch: {

                engine:
                    this.data.lastEngine,

                query:
                    this.data.lastQuery

            },

            researchMode:
                this.data.researchMode

        };

    }

};



console.log(
    "✅ BrowserSession V6 Loaded"
);