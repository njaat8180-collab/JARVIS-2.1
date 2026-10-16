// ==========================================
// JARVIS PRO MAX
// Browser V6
// Smart Multi Search Engine
// browserMultiSearch.js
// PART 1
// ==========================================

"use strict";

window.BrowserMultiSearch = {

    version: "6.0",

    running: false,

    queue: [],

    engines: {

        google: "google",
        youtube: "youtube",
        github: "github",
        reddit: "reddit",
        amazon: "amazon",
        flipkart: "flipkart",
        wikipedia: "wikipedia",
        mdn: "mdn",
        stackoverflow: "stackoverflow"

    },



    // =====================================
    // SINGLE SEARCH
    // =====================================

    search(engine, query) {

        if (!engine || !query)
            return false;

        if (
            !window.BrowserSearch ||
            typeof BrowserSearch[engine] !== "function"
        ) {

            console.warn(
                "❌ Search Engine Not Found:",
                engine
            );

            return false;

        }

        // Session duplicate protection
        if (
            window.BrowserSession &&
            BrowserSession.getLastSearch
        ) {

            const last =
                BrowserSession.getLastSearch();

            if (
                last &&
                last.engine === engine &&
                last.query === query
            ) {

                console.log(
                    "⚠ Duplicate Search Blocked:",
                    engine,
                    query
                );

                return false;

            }

        }

        console.log(
            "🔍 Searching:",
            engine,
            query
        );

        if (window.BrowserSession) {

            BrowserSession.saveSearch(
                engine,
                query
            );

        }

        BrowserSearch[engine](query);

        return true;

    },
        // =====================================
    // MULTI SEARCH
    // =====================================

    multiSearch(engineList, query) {

        if (
            !Array.isArray(engineList) ||
            engineList.length === 0 ||
            !query
        ) {
            return false;
        }

        // Remove duplicate engines
        const uniqueEngines = [
            ...new Set(engineList)
        ];

        // Clear old queue
        this.queue = [];

        uniqueEngines.forEach(engine => {

            this.queue.push({

                engine,
                query

            });

        });

        if (!this.running) {

            this.processQueue();

        }

        return true;

    },



    // =====================================
    // PROCESS QUEUE
    // =====================================

    processQueue() {

        if (this.queue.length === 0) {

            this.running = false;

            console.log(
                "✅ Multi Search Completed"
            );

            return;

        }

        this.running = true;

        const item = this.queue.shift();

        this.search(
            item.engine,
            item.query
        );

        setTimeout(() => {

            this.processQueue();

        }, 800);

    },



    // =====================================
    // STOP
    // =====================================

    stop() {

        this.running = false;

        this.queue = [];

        console.log(
            "🛑 Multi Search Stopped"
        );

    },



    // =====================================
    // STATUS
    // =====================================

    status() {

        return {

            version: this.version,

            running: this.running,

            pending: this.queue.length,

            engines: Object.keys(
                this.engines
            )

        };

    }

};



console.log(
    "✅ BrowserMultiSearch V6 Loaded"
);