"use strict";

/**
 * ============================================================
 * JARVIS SUGGESTION ENGINE
 * ============================================================
 *
 * Purpose (as requested):
 *   Jarvis sirf sawaalon ka jawab na de, balki khud se bhi user ko
 *   kuch useful suggestions de — jaise "aap yeh bhi pooch sakte
 *   hain", based on abhi ki baatcheet aur samay (subah/dopahar/
 *   raat) par.
 *
 * Design goals:
 *   - Har suggestion ek REAL, already-working Jarvis feature ki
 *     taraf point kare (weather, wikipedia, recipes, pokemon,
 *     news, currency, country info, github, on-this-day, etc. —
 *     see src/services/wikipedia.js aur src/services/
 *     dataSources.js), taaki click karne par sach me jawab mile,
 *     koi khaali vaada nahi.
 *   - Runs in the MAIN process (no network calls itself, purely
 *     text-pattern based), so it's instant and works even
 *     completely offline.
 *   - Stateless per call — caller (renderer) passes the last
 *     exchange as context each time.
 * ============================================================
 */

/* ============================================================
   FOLLOW-UP RULES
   If the last exchange was about a known topic, suggest a
   natural next step in that same topic first.
============================================================ */

const TOPIC_RULES = [
    {
        name: "weather",
        test: /\b(mausam|weather|temperature|forecast|barish|rain|humidity)\b/i,
        suggestions: () => [
            { label: "🌦️ Kal ka mausam bhi batao", run: "kal ka mausam batao" },
            { label: "🌍 Kisi aur shahar ka mausam poochein", run: "Mumbai ka mausam batao" }
        ]
    },
    {
        name: "recipe",
        test: /\b(recipe|khana|banaye|banta hai|meal)\b/i,
        suggestions: () => [
            { label: "🍲 Ek aur recipe try karein", run: "paneer recipe batao" },
            { label: "🥗 Kisi ingredient se recipe dhoondein", run: "chicken recipe batao" }
        ]
    },
    {
        name: "pokemon",
        test: /\bpok[eé]mon\b/i,
        suggestions: () => [
            { label: "⚡ Kisi aur Pokémon ke baare mein poochein", run: "pikachu ke baare mein batao" }
        ]
    },
    {
        name: "news",
        test: /\b(news|khabar|samachar)\b/i,
        suggestions: () => [
            { label: "📰 Kisi aur topic ki news dekhein", run: "technology news batao" },
            { label: "🌐 Aaj ki top headlines dekhein", run: "aaj ki top news batao" }
        ]
    },
    {
        name: "currency",
        test: /\b(currency|convert|exchange rate|dollar|rupee|rupay)\b/i,
        suggestions: () => [
            { label: "🔁 Reverse mein convert karke dekhein", run: "100 rupees ko dollar mein convert karo" }
        ]
    },
    {
        name: "country",
        test: /\b(capital of|population of|country info|country information)\b/i,
        suggestions: () => [
            { label: "🌏 Kisi aur desh ki jaankari lein", run: "Japan ke baare mein country info batao" }
        ]
    },
    {
        name: "wikipedia",
        test: /\b(wikipedia|history|itihaas|aaj kya hua|is mahine|is saal)\b/i,
        suggestions: () => [
            { label: "📜 Aaj history mein kya hua tha, dekhein", run: "aaj kya hua tha" },
            { label: "📚 Kisi topic ke baare mein Wikipedia se poochein", run: "wikipedia pe Bharat ke baare mein batao" }
        ]
    },
    {
        name: "github",
        test: /\b(github|repository|repo)\b/i,
        suggestions: () => [
            { label: "📦 Kisi npm package ke baare mein poochein", run: "express npm package ke baare mein batao" }
        ]
    }
];

/* ============================================================
   DISCOVERY POOL
   Used when nothing specific was detected in the last exchange —
   rotates so it doesn't feel repetitive.
============================================================ */

const DISCOVERY_POOL = [
    { label: "📜 Aaj history mein kya hua tha?", run: "aaj kya hua tha" },
    { label: "🌦️ Aaj ka mausam jaanein", run: "aaj ka mausam batao" },
    { label: "📚 Kisi topic ke baare mein Wikipedia se poochein", run: "wikipedia pe Mahatma Gandhi ke baare mein batao" },
    { label: "🍲 Koi recipe suggest karayein", run: "paneer recipe batao" },
    { label: "⚡ Kisi Pokémon ke baare mein poochein", run: "pikachu ke baare mein batao" },
    { label: "📰 Aaj ki top news sunein", run: "aaj ki top news batao" },
    { label: "🌏 Kisi desh ki jaankari lein", run: "France ke baare mein country info batao" },
    { label: "🔁 Currency convert karke dekhein", run: "100 dollar ko rupees mein convert karo" },
    { label: "📦 GitHub par koi repo dhoondein", run: "electron github repo dhoondo" }
];

/* ============================================================
   TIME-OF-DAY SUGGESTIONS
============================================================ */

function timeOfDaySuggestion() {
    const hour = new Date().getHours();

    if (hour >= 5 && hour < 12) {
        return { label: "☀️ Good morning! Aaj ka mausam batau?", run: "aaj ka mausam batao" };
    }
    if (hour >= 12 && hour < 17) {
        return { label: "📰 Dopahar ki top news dekhna chahenge?", run: "aaj ki top news batao" };
    }
    if (hour >= 17 && hour < 21) {
        return { label: "📜 Shaam ho gayi — aaj history mein kya hua tha, dekhein?", run: "aaj kya hua tha" };
    }
    return { label: "🌙 Raat ko koi halki-phulki jaankari chahiye?", run: "wikipedia pe koi interesting fact batao" };
}

/* ============================================================
   DEDUPE + LIMIT HELPER
============================================================ */

function finalize(list, limit) {
    const seen = new Set();
    const out = [];

    for (const item of list) {
        if (!item || !item.run) continue;
        const key = item.run.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
        if (out.length >= limit) break;
    }

    return out;
}

/* ============================================================
   PUBLIC API
============================================================ */

/**
 * Returns 2–3 suggestions for what the user could ask next.
 *
 * context:
 *   lastUserMessage   - what the user just typed/said
 *   lastJarvisResponse - Jarvis's reply to that
 *   limit             - how many suggestions to return (default 3)
 */
function getSuggestions(context = {}) {
    const {
        lastUserMessage = "",
        lastJarvisResponse = "",
        limit = 3
    } = context;

    const combined = `${lastUserMessage} ${lastJarvisResponse}`.trim();

    const matchedTopics = TOPIC_RULES.filter((rule) => rule.test.test(combined));

    let suggestions = [];

    for (const rule of matchedTopics) {
        suggestions = suggestions.concat(rule.suggestions());
    }

    // Always round it out with the time-aware pick + a couple of
    // rotating discovery items so there's always something fresh.
    suggestions.push(timeOfDaySuggestion());

    const rotationSeed = new Date().getMinutes() % DISCOVERY_POOL.length;
    const rotated = [
        ...DISCOVERY_POOL.slice(rotationSeed),
        ...DISCOVERY_POOL.slice(0, rotationSeed)
    ];
    suggestions = suggestions.concat(rotated);

    return {
        success: true,
        suggestions: finalize(suggestions, limit)
    };
}

module.exports = {
    getSuggestions
};
