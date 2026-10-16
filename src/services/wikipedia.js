"use strict";

/**
 * ============================================================
 * JARVIS WIKIPEDIA SERVICE
 * ============================================================
 *
 * No API key required — Wikipedia's REST/action APIs are public.
 * Runs in the main process (Node's built-in https), used by
 * commands like:
 *   "is mahine kya hua"   -> onThisDay() for today's date
 *   "aaj kya hua"         -> onThisDay() for today's date
 *   "is saal kya hua"     -> onThisDay() filtered/summarised
 *   "wikipedia pe X batao" -> summary(query)
 *
 * Supports both English and Hindi Wikipedia (lang: "en" | "hi").
 * ============================================================
 */

const https = require("https");

const DEFAULT_LANG = "hi"; // Hindi first, since the app is bilingual
const REQUEST_TIMEOUT_MS = 10000;
const MAX_EXTRACT_LENGTH = 12000;

function httpGetJSON(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(
            url,
            {
                headers: {
                    // Wikipedia's API asks for a descriptive UA.
                    "User-Agent": "JARVIS-PRO-MAX/1.0 (local desktop assistant)"
                }
            },
            (res) => {
                // Explicit UTF-8 decoding for Hindi/Unicode Wikipedia text.
                res.setEncoding("utf8");

                if (res.statusCode && res.statusCode >= 400) {
                    res.resume();
                    reject(new Error(`Wikipedia request failed (${res.statusCode})`));
                    return;
                }

                let raw = "";
                res.on("data", (chunk) => { raw += chunk; });
                res.on("end", () => {
                    try {
                        resolve(JSON.parse(raw));
                    } catch (error) {
                        reject(new Error("Wikipedia returned invalid JSON."));
                    }
                });
            }
        );

        req.setTimeout(REQUEST_TIMEOUT_MS, () => {
            req.destroy(new Error("Wikipedia request timed out."));
        });

        req.on("error", reject);
    });
}

/**
 * Find the best-matching article title for a free-text query,
 * then fetch its plain-text summary.
 */
async function summary(query, lang = DEFAULT_LANG) {
    const cleanQuery = String(query || "").trim();

    if (!cleanQuery) {
        return { success: false, error: "No search term given." };
    }

    const safeLang =
        /^(?:en|hi)$/i.test(String(lang || ""))
            ? String(lang).toLowerCase()
            : DEFAULT_LANG;

    try {
        // 1) Resolve the query to a real article title via the search API.
        const searchUrl =
            `https://${safeLang}.wikipedia.org/w/api.php` +
            `?action=query&list=search&format=json&srlimit=1` +
            `&srsearch=${encodeURIComponent(cleanQuery)}`;

        const searchResult = await httpGetJSON(searchUrl);
        const hit =
            searchResult &&
            searchResult.query &&
            Array.isArray(searchResult.query.search) &&
            searchResult.query.search[0];

        if (!hit) {
            return {
                success: false,
                error: `"${cleanQuery}" ke liye Wikipedia par kuch nahi mila.`
            };
        }

        // 2) Fetch the REST summary for that exact title.
        const summaryUrl =
            `https://${safeLang}.wikipedia.org/api/rest_v1/page/summary/` +
            encodeURIComponent(hit.title);

        const page = await httpGetJSON(summaryUrl);

        return {
            success: true,
            title: page.title || hit.title,
            extract: String(page.extract || "").slice(0, MAX_EXTRACT_LENGTH),
            url:
                (page.content_urls &&
                    page.content_urls.desktop &&
                    page.content_urls.desktop.page) ||
                `https://${safeLang}.wikipedia.org/wiki/${encodeURIComponent(hit.title)}`,
            thumbnail: (page.thumbnail && page.thumbnail.source) || null,
            lang: safeLang
        };
    } catch (error) {
        return { success: false, error: error.message || String(error) };
    }
}

/**
 * "On this day" — historical events that happened on today's
 * calendar date (any year). Used for "aaj kya hua", "is mahine
 * kya hua", "history me aaj ke din kya hua", etc.
 *
 * type: "events" | "births" | "deaths" | "holidays"
 */
async function onThisDay(options = {}) {
    const {
        lang = DEFAULT_LANG,
        type = "events",
        date = new Date(),
        limit = 5
    } = options;

    const safeLang =
        /^(?:en|hi)$/i.test(String(lang || ""))
            ? String(lang).toLowerCase()
            : DEFAULT_LANG;
    const safeType = ["events", "births", "deaths", "holidays"].includes(type)
        ? type
        : "events";

    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");

    const url =
        `https://${safeLang}.wikipedia.org/api/rest_v1/feed/onthisday/` +
        `${safeType}/${mm}/${dd}`;

    try {
        const data = await httpGetJSON(url);
        const list = Array.isArray(data[safeType]) ? data[safeType] : [];

        // Most notable/recent first.
        const items = list
            .slice()
            .sort((a, b) => (b.year || 0) - (a.year || 0))
            .slice(0, limit)
            .map((item) => ({
                year: item.year,
                text: item.text,
                url:
                    item.pages &&
                    item.pages[0] &&
                    item.pages[0].content_urls &&
                    item.pages[0].content_urls.desktop &&
                    item.pages[0].content_urls.desktop.page
            }));

        return {
            success: true,
            type: safeType,
            date: `${mm}/${dd}`,
            items,
            lang: safeLang
        };
    } catch (error) {
        return { success: false, error: error.message || String(error) };
    }
}

module.exports = {
    summary,
    onThisDay
};
