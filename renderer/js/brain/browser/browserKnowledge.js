// ==========================================
// JARVIS PRO MAX
// Browser V3
// Knowledge Graph & Preference Learning
// browserKnowledge.js
// ==========================================

"use strict";

window.BrowserKnowledge = {

    graph: {

        interests: {},
        categories: {},
        budgets: {},
        sources: {}

    },

    // ==================================
    // INIT
    // ==================================

    init() {

        const data = localStorage.getItem(
            "JARVIS_KNOWLEDGE_GRAPH"
        );

        if (data) {

            try {

                this.graph = JSON.parse(data);

            }

            catch (e) {

                console.error(
                    "Knowledge Load Error",
                    e
                );

            }

        }

        console.log(
            "Knowledge Graph Ready"
        );

    },

    // ==================================
    // LEARN
    // ==================================

    learn(data) {

        if (!data)
            return;

        let text = "";

        // String
        if (typeof data === "string") {

            text = data;

        }

        // Browser Command Object
        else if (typeof data === "object") {

            if (typeof data.query === "string") {

                text = data.query;

            }

            else if (typeof data.text === "string") {

                text = data.text;

            }

            else {

                return;

            }

        }

        else {

            return;

        }

        text = text
            .trim()
            .toLowerCase();

        if (!text)
            return;

        this.detectCategory(text);

        this.detectBudget(text);

        this.detectInterest(text);

        this.save();

    },

    // ==================================
    // CATEGORY
    // ==================================

    detectCategory(text) {

        const categories = [

            "gaming",
            "laptop",
            "mobile",
            "pc",
            "mouse",
            "keyboard",
            "software",
            "coding",
            "camera",
            "youtube",
            "google",
            "github",
            "amazon",
            "flipkart"

        ];

        categories.forEach(item => {

            if (text.includes(item)) {

                this.graph.categories[item] =
                    (this.graph.categories[item] || 0) + 1;

            }

        });

    },

    // ==================================
    // INTEREST
    // ==================================

    detectInterest(text) {

        text.split(/\s+/).forEach(word => {

            if (word.length > 3) {

                this.graph.interests[word] =
                    (this.graph.interests[word] || 0) + 1;

            }

        });

    },

    // ==================================
    // BUDGET
    // ==================================

    detectBudget(text) {

        const match =
            text.match(/\d{3,6}/);

        if (!match)
            return;

        const amount = match[0];

        this.graph.budgets[amount] =
            (this.graph.budgets[amount] || 0) + 1;

    },

    // ==================================
    // SOURCE
    // ==================================

    learnSource(source) {

        if (!source)
            return;

        this.graph.sources[source] =
            (this.graph.sources[source] || 0) + 1;

        this.save();

    },

    // ==================================
    // PROFILE
    // ==================================

    getProfile() {

        return this.graph;

    },

    // ==================================
    // SAVE
    // ==================================

    save() {

        localStorage.setItem(

            "JARVIS_KNOWLEDGE_GRAPH",

            JSON.stringify(this.graph)

        );

    }

};

BrowserKnowledge.init();