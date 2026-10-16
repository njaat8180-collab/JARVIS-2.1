"use strict";

const wikipedia = require("../src/services/wikipedia");

async function main() {
    const query = process.argv.slice(2).join(" ").trim() || "Mahatma Gandhi";
    const lang = process.env.JARVIS_WIKI_LANG || "hi";
    console.log(`[Wikipedia Test] query="${query}" lang=${lang}`);

    const result = await wikipedia.summary(query, lang);
    if (!result || result.success !== true || !result.extract) {
        console.error("[Wikipedia Test] FAILED:", result && result.error ? result.error : result);
        process.exitCode = 1;
        return;
    }

    console.log(`[Wikipedia Test] PASS: ${result.title}`);
    console.log(`[Wikipedia Test] URL: ${result.url}`);
    console.log(`[Wikipedia Test] Extract: ${result.extract.slice(0, 500)}`);
}

main().catch((error) => {
    console.error("[Wikipedia Test] FATAL:", error && error.stack ? error.stack : error);
    process.exitCode = 1;
});
