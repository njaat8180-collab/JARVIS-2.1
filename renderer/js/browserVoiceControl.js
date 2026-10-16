"use strict";

/* ============================================================
   JARVIS PRO MAX — BROWSER VOICE CONTROL (Phase 2)
   ------------------------------------------------------------
   Pipeline: Voice/Chat text → BrowserVoiceControl.handle() →
             BrowserUI / window.jarvis.browser → result

   Deliberately self-contained and dependency-free (no coupling
   to renderer/js/brain/browser/* — that ~23k-line intent stack
   is a separate, not-yet-integrated effort; see
   CURRENT_STATE_CHANGELOG.md). This module only needs to answer
   two questions: "is this text a browser command?" and if so,
   "what do I do about it?" — matched against the phrase set from
   the original Browser Module spec (English + Hinglish).

   Consumed by:
   - renderer/js/voice.js        (sendToChat, spoken commands)
   - renderer/js/renderer.js     (sendChatMessage, typed commands)

   Both call `window.BrowserVoiceControl.handle(text)` and, if the
   returned result has `handled: true`, skip the normal ChatEngine
   pipeline entirely for that message — keeping this fast path
   fully isolated from (and unable to break) the existing chat/
   agent system.
============================================================ */

const BrowserVoiceControl = (() => {

    const SITE_ALIASES = {
        youtube: "https://www.youtube.com",
        यूट्यूब: "https://www.youtube.com",
        google: "https://www.google.com",
        gmail: "https://mail.google.com",
        email: "https://mail.google.com",
        github: "https://github.com",
        facebook: "https://www.facebook.com",
        instagram: "https://www.instagram.com",
        twitter: "https://twitter.com",
        x: "https://twitter.com",
        whatsapp: "https://web.whatsapp.com",
        netflix: "https://www.netflix.com",
        amazon: "https://www.amazon.com",
        wikipedia: "https://www.wikipedia.org",
        maps: "https://maps.google.com",
        drive: "https://drive.google.com",
        spotify: "https://open.spotify.com",
        chatgpt: "https://chatgpt.com",
        gemini: "https://gemini.google.com",
        जिमनी: "https://gemini.google.com",
        जेमिनी: "https://gemini.google.com",
        linkedin: "https://www.linkedin.com",
        reddit: "https://www.reddit.com"
    };

    const SEARCH_ENGINES = {
        google: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
        youtube: (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
        wikipedia: (q) => `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}`,
        amazon: (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}`,
        github: (q) => `https://github.com/search?q=${encodeURIComponent(q)}`
    };

    function normalize(text) {

        return String(text || "")
            .trim()
            .toLowerCase()
            .replace(/^(?:jarvis|जार्विस)[,\s]+/iu, "")
            .replace(/\s+/g, " ");
    }

    function resolveSiteTarget(rawName) {

        const key = String(rawName || "")
            .trim()
            .toLowerCase();

        for (const alias of Object.keys(SITE_ALIASES)) {

            if (key === alias) {
                return SITE_ALIASES[alias];
            }
        }

        // Opening an unknown app is not permission to search the web.
        // Only explicit domains and exact website aliases belong here.
        return /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#]\S*)?$/i.test(key)
            ? (/^https?:\/\//i.test(key) ? key : `https://${key}`)
            : null;
    }

    function buildSearchTarget(engine, query) {

        const builder =
            SEARCH_ENGINES[String(engine || "google").toLowerCase()] ||
            SEARCH_ENGINES.google;

        return builder(query);
    }

    /* ============================================================
       INPUT LANGUAGE DETECTION (EN / HI / HINGLISH)
       Drives the reply language so JARVIS answers in the user's
       language. Mirrors voice.js classifyInputLanguage().
    ============================================================ */
    const ROMAN_HINDI_STRONG = /\b(kholo|khol|batao|dikhao|chalao|chalu|shuru|nikalo|lao|dhoondo|dhundo|rakho|dijiye|chahiye|mujhe|humne|tumne|nahin|nahi|kya|kyun|kyu|kahaan|kaise|kyunki|kyuki|kitna|abhi|bilkul|zaroor|theek|thik|achha|accha|karo|karke|raha|rahi|rahe|hoon|hain|jaldi|yaar|bhai|suno|bolo|jao|aao|band)\b/i;
    const ROMAN_HINDI_WEAK = /\b(hai|hain|hoon|tha|thi|the|gaya|mera|meri|hum|hume|aap|tum|kaun|kab|kaisa|kaisi|sakta|sakte|ek|kuch|sab|bas|mat|bata|dena|lo|par|pe|aur|ya|se|ko|ka|ki|ke|ne|toh|bhi|kal|aaj|phir|agar)\b/gi;
    const DEVANAGARI = /[\u0900-\u097F]/;

    function detectInputLang(text) {
        const v = String(text || "").trim();
        if (!v) return "en";
        const hasDev = DEVANAGARI.test(v);
        const hasLat = /[A-Za-z]/.test(v);
        if (hasDev && hasLat) return "hinglish";
        if (hasDev) return "hi";
        if (ROMAN_HINDI_STRONG.test(v)) return "hinglish";
        const weak = new Set((v.match(ROMAN_HINDI_WEAK) || []).map(w => w.toLowerCase())).size;
        return weak >= 2 ? "hinglish" : "en";
    }

    // Pick a reply string in the user's language.
    // en = English, hi = Hindi (Devanagari), hinglish = romanized Hindi.
    function say(lang, en, hi, hinglish) {
        let reply;
        if (lang === "hi") reply = hi || hinglish || en;
        else if (lang === "hinglish") reply = hinglish || hi || en;
        else reply = en || hinglish || hi;
        // Smart Reply variation: 40% chance to prefix a varied ack
        // so browser command replies also sound fresh each time.
        if (window.JARVISSmartReplies && Math.random() < 0.40) {
            reply = window.JARVISSmartReplies.ack(lang) + " " + reply;
        }
        return reply;
    }

    /* ============================================================
       PARSE — returns { action, ...params } or null if no match.
    ============================================================ */

    function parse(rawText) {
        // Voice reaches this fast path before ChatEngine. Never consume an
        // app workflow as the generic "open <search query>" browser action.
        const local = window.JARVISNaturalCommandEngine?.detect?.(rawText);
        if (["OPEN_APP", "APP_TASK_FLOW", "COMPUTER_USE", "MINECRAFT_WORLD_FLOW", "MINECRAFT_LAUNCH_FLOW", "CREATE_PRESENTATION", "CREATE_PDF", "CREATE_IMAGE", "CREATE_SPREADSHEET", "CREATE_OFFICE_FILE"].includes(local?.intent)) return null;

        const text = normalize(rawText);

        if (!text) {
            return null;
        }

        if (/^(?:open|launch|go\s*to)\s+outlook(?:\.com|\s+dot\s+com)$/i.test(text)) {
            return { action: "open-url", url: "https://outlook.live.com/mail/", appLabel: "Outlook.com" };
        }
        if (/^(?:open|launch|start)\s+(?:google\s+)?gemini\s+(?:on\s+google|in\s+(?:the\s+)?browser|website|web)$/i.test(text)) {
            return { action: "open-url", url: "https://gemini.google.com" };
        }
        if (/^(?:open|launch|start)\s+(?:google\s+)?gemini(?:\s+desktop)?$/i.test(text) ||
            /^(?:gemini|google\s+gemini)\s+(?:desktop\s+)?(?:kholo|khol\s*do)$/i.test(text)) {
            return { action: "launch-app", app: "gemini" };
        }

        const localApp = text.match(/^(?:open|launch|start|run)\s+(?:the\s+)?(microsoft\s+store|windows\s+store|store|league(?:\s+of\s+legends)?|lee|minecraft(?:\s+launcher)?|outlook(?:\s+desktop)?|file\s+explorer|windows\s+explorer|explorer)$/i);
        if (localApp) {
            const key = localApp[1].toLowerCase();
            const canonical = /^(?:store|windows store|microsoft store)$/.test(key) ? "microsoft store"
                : /^(?:league|lee|league of legends)$/.test(key) ? "league of legends"
                : /^(?:file explorer|windows explorer|explorer)$/.test(key) ? "explorer"
                : key.replace(/\s+desktop$/, "");
            return { action: "launch-app", app: canonical };
        }

        const channelSearch = text.match(/^(?:find|search\s+for|look\s+for|dhoondo|dhundo|खोजो|ढूंढो)\s+(.+?)\s+(?:youtube\s+)?channel(?:\s+(?:on\s+)?youtube)?$/iu);
        if (channelSearch) {
            const channel = channelSearch[1].replace(/\s+(?:on|in)\s+youtube$/i, "").trim();
            if (channel) return { action: "youtube-channel-search", query: channel };
        }

        // Play the first YouTube result inside JARVIS's own browser.
        // Commands such as "play Minecraft gameplay video on YouTube" and
        // "play this song" are handled here before generic web searching.
        const playMatch = text.match(/^(?:please\s+)?(?:play|watch|chalao|bajao|चलाओ|बजाओ)\s+(.+)$/iu);
        if (playMatch) {
            const originalRequest = playMatch[1];
            let query = playMatch[1]
                .replace(/\s+(?:(?:on|in|par|pe)\s+)?(?:the\s+)?youtube(?:\s+(?:par|pe))?$/i, "")
                .replace(/\s+(?:(?:ki|ka|ke)\s+)?(?:video|videos|song|songs|music|track|gameplay video)$/i, "")
                .replace(/^(?:the\s+)?(?:song|video|music)\s+/i, "")
                .replace(/^(?:(?:this|that|ye|woh|this is|that is)\s+|(?:ये|यह|वो|वह)\s+)/iu, "")
                .replace(/\s+(?:ki|ka|ke)$/i, "")
                .replace(/\s+(?:ho\s+gaya|ho\s+gya|hogaya|hogya)$/iu, " gameplay")
                .trim();
            if (/^(?:this|that|it|ye|woh|ये|यह|वो|वह)$/iu.test(query)) query = "";
            if (/^(?:|a|some|random|trending|music|song|songs|koi|kuch)$/iu.test(query) && /(?:music|song|gaana|gana|गाना|गाने|म्यूजिक)/iu.test(originalRequest)) {
                query = "trending music hits";
            } else if (/^(?:|a|some|random|trending|video|videos|कोई वीडियो|वीडियो)$/iu.test(query)) {
                query = "trending videos";
            }
            if (!query && /video|वीडियो/iu.test(originalRequest)) return { action: "youtube-play-current" };
            if (!query) return { action: "youtube-play-needs-query" };
            return { action: "youtube-play", query };
        }

        // Local actions must be recognized before the generic "open <site>"
        // rule below; otherwise app names such as Chrome are sent to search.
        if (/^(?:open|launch|start)\s+(?:google\s+)?chrome$/.test(text) ||
            /^(?:google\s+)?chrome\s+(?:kholo|khol\s*do|open\s*karo)$/.test(text) ||
            /^(?:गूगल\s+)?क्रोम\s+(?:खोलो|खोल\s*दो)$/.test(text)) {
            return { action: "launch-app", app: "chrome" };
        }

        if (/^(?:open|launch|start)\s+(?:the\s+)?sql\s+launcher$/.test(text) ||
            /^sql\s+launcher\s+(?:chalao|chala\s*do|run\s*karo)$/.test(text) ||
            /^sql\s+लॉन्चर\s+(?:चलाओ|चला\s*दो)$/.test(text) ||
            /^एस\s*क्यू\s*एल\s+लॉन्चर\s+(?:चलाओ|चला\s*दो)$/.test(text)) {
            return { action: "launch-app", app: "sql launcher" };
        }

        if (/^(?:open|launch|start)\s+(?:the\s+)?(?:file explorer|windows explorer|explorer)$/.test(text) ||
            /^(?:file explorer|windows explorer|explorer)\s+(?:kholo|khol\s*do|open\s*karo|खोलो|खोल\s*दो)$/iu.test(text)) {
            return { action: "launch-app", app: "explorer" };
        }

        if (/^(?:open|launch|start)\s+(?:minecraft|minecraft\s+launcher)$/.test(text) ||
            /^minecraft\s+(?:chalao|chala\s*do|kholo|khol\s*do)$/.test(text) ||
            /^माइनक्राफ्ट\s+(?:चलाओ|चला\s*दो|खोलो|खोल\s*दो)$/.test(text)) {
            return { action: "launch-app", app: "minecraft" };
        }

        if (/^(?:lock|lock\s+(?:the\s+)?(?:system|computer|pc)|system\s+lock)$/.test(text) ||
            /^(?:system|computer|pc)\s+lock\s+(?:karo|kar\s*do)$/.test(text) ||
            /^सिस्टम\s+लॉक\s+(?:करो|कर\s*दो)$/.test(text)) {
            return { action: "system-lock" };
        }

        if (/^(?:shutdown|shut\s+down)(?:\s+(?:the\s+)?(?:system|computer|pc))?$/.test(text) ||
            /^(?:system|computer|pc)\s+shutdown\s+(?:karo|kar\s*do)$/.test(text) ||
            /^सिस्टम\s+शटडाउन\s+(?:करो|कर\s*दो)$/.test(text)) {
            return { action: "system-shutdown" };
        }

        if (/^(?:what\s+time\s+is\s+it|tell\s+me\s+the\s+time|current\s+time|time\s+now)$/.test(text) ||
            /^(?:time|samay)\s+batao$/.test(text) ||
            /^(?:टाइम|समय)\s+(?:बताओ|बता\s*दो)$/.test(text)) {
            return { action: "tell-time" };
        }

        // ---- Browser panel itself ----

        if (/^(close|hide)\s+browser$/.test(text) ||
            /^browser\s+(band\s*karo|band\s*kar\s*do|close\s*karo)$/.test(text) ||
            /^ब्राउज़र\s+(बंद\s*करो|बंद\s*कर\s*दो)$/.test(text)) {
            return { action: "close-browser" };
        }

        if (/^open\s+browser$/.test(text) ||
            /^browser\s+(kholo|khol\s*do|open\s*karo)$/.test(text) ||
            /^ब्राउज़र\s+(खोलो|खोल\s*दो)$/.test(text)) {
            return { action: "open-browser" };
        }

        // ---- Tabs ----

        if (/^(?:(?:open|create|make)\s+)?(?:a\s+)?new\s+tab(?:\s+(?:in|on)\s+(?:the\s+)?browser)?$/.test(text) ||
            /^open\s+(?:a\s+)?new\s+tab\s+(?:inside\s+)?(?:the\s+)?browser$/.test(text) ||
            /^new\s+tab\s+(?:kholo|khol\s*do)\s+(?:in|on|inside)\s+(?:the\s+)?browser$/.test(text) ||
            /^new\s+tab\s+(?:kholo|khol\s*do)\s+browser\s+(?:mein|me)$/.test(text) ||
            /^open\s+new\s+tab\s+browser$/.test(text) ||
            /^(?:new|naya|nayi|nai)\s+tab$/.test(text) ||
            /^(naya|nayi|nai)\s+tab\s+(kholo|khol\s*do)$/.test(text) ||
            /^(?:browser\s+(?:mein|me)\s+)?(?:naya|nayi|nai)\s+tab\s+(?:kholo|khol\s*do)$/.test(text) ||
            /^(नया|नई)\s+टैब$/.test(text) ||
            /^(नया|नई)\s+टैब\s+(खोलो|खोल\s*दो)$/.test(text)) {
            return { action: "new-tab" };
        }

        if (/^(?:close|shut|remove)\s+(?:the\s+)?(?:previous|prev|old|last)\s+tab(?:\s+(?:in|on)\s+(?:the\s+)?browser)?$/.test(text) ||
            /^(?:previous|prev|old|last)\s+tab\s+(?:close(?:\s*karo|\s*kar\s*(?:do|de))?|band\s*karo|band\s*kar\s*(?:do|de)|बंद\s*कर\s*(?:दो|दे))$/.test(text) ||
            /^(?:pichhla|pichla|purana|purana\s+wala)\s+tab\s+(?:band\s*karo|band\s*kar\s*(?:do|de)|close\s*(?:karo|kar\s*(?:do|de)))$/.test(text) ||
            /^(?:पिछला|पुराना)\s+टैब\s+(?:बंद\s*करो|बंद\s*कर\s*(?:दो|दे))$/.test(text) ||
            /^(?:पिछला|पुराना|pichhla|pichla|purana)\s+(?:टैब|tab)\s+(?:बंद\s*कर\s*(?:दो|दे)|band\s*kar\s*(?:do|de))$/iu.test(text) ||
            /^(?:pichhla|pichla)\s+tab\s+(?:को\s+)?बंद\s*कर\s*(?:दो|दे)$/u.test(text)) {
            return { action: "close-previous-tab" };
        }

        if (/^close\s+(this\s+)?tab$/.test(text) ||
            /^(is\s+)?tab\s+(ko\s+)?(band\s*karo|band\s*kar\s*do)$/.test(text) ||
            /^(इस\s+)?टैब\s+(को\s+)?(बंद\s*करो|बंद\s*कर\s*दो)$/.test(text)) {
            return { action: "close-tab" };
        }

        if (/^next\s+tab$/.test(text) || /^agla\s+tab$/.test(text)) {
            return { action: "next-tab" };
        }

        if (/^(previous|prev)\s+tab$/.test(text) ||
            /^(pichla|pichhla)\s+tab$/.test(text)) {
            return { action: "prev-tab" };
        }

        // ---- Navigation ----

        if (/^(go\s*back|back)$/.test(text) ||
            /^(wapas|peeche)\s+(jao|chalo)$/.test(text) ||
            /^(वापस|पीछे)\s+(जाओ|चलो)$/.test(text)) {
            return { action: "back" };
        }

        if (/^(go\s*forward|forward)$/.test(text) ||
            /^aage\s+(jao|chalo)$/.test(text) ||
            /^आगे\s+(जाओ|चलो)$/.test(text)) {
            return { action: "forward" };
        }

        if (/^(reload|refresh)(\s+page)?$/.test(text) ||
            /^(page\s+)?reload\s*karo$/.test(text) ||
            /^(पेज\s+)?(रीलोड|रिफ्रेश)\s+करो$/.test(text) ||
            /^ताज़ा\s+करो$/.test(text)) {
            return { action: "reload" };
        }

        if (/^stop(\s+loading)?$/.test(text) ||
            /^loading\s+rok\s*do$/.test(text)) {
            return { action: "stop" };
        }

        // ---- Bookmarks & History ----

        if (/^bookmark\s+(this\s+)?page$/.test(text) ||
            /^(is\s+)?page\s+ko\s+bookmark\s+karo$/.test(text)) {
            return { action: "bookmark-page" };
        }

        if (/^show\s+bookmarks$/.test(text) ||
            /^bookmarks\s+(dikhao|dikha\s*do)$/.test(text)) {
            return { action: "show-bookmarks" };
        }

        if (/^show\s+(my\s+)?history$/.test(text) ||
            /^history\s+(dikhao|dikha\s*do)$/.test(text)) {
            return { action: "show-history" };
        }

        if (/^clear\s+(my\s+)?history$/.test(text) ||
            /^history\s+(clear\s*karo|saaf\s*karo)$/.test(text)) {
            return { action: "clear-history" };
        }

        // ---- Page tools ----

        if (/^zoom\s*in$/.test(text) || /^zoom\s+badhao$/.test(text)) {
            return { action: "zoom-in" };
        }

        if (/^zoom\s*out$/.test(text) || /^zoom\s+kam\s*karo$/.test(text)) {
            return { action: "zoom-out" };
        }

        if (/^(reset\s*zoom|zoom\s*reset)$/.test(text)) {
            return { action: "zoom-reset" };
        }

        if (/^print(\s+(this\s+)?page)?$/.test(text) ||
            /^page\s+print\s*karo$/.test(text)) {
            return { action: "print" };
        }

        if (/^save\s+(this\s+)?page$/.test(text) ||
            /^page\s+save\s*karo$/.test(text)) {
            return { action: "save-page" };
        }

        if (/^find\s+(.+?)\s+(?:on|in)\s+(?:this\s+)?page$/.test(text)) {

            const found = text.match(/^find\s+(.+?)\s+(?:on|in)\s+(?:this\s+)?page$/);
            return { action: "find", query: found[1] };
        }

        if (/^show\s+downloads$/.test(text) ||
            /^downloads\s+(dikhao|dikha\s*do)$/.test(text)) {
            return { action: "show-downloads" };
        }

        // ---- Search: "<engine> par <query> search karo" ----

        let m = text.match(
            /^(\w+)\s+par\s+(.+?)\s+search\s*karo$/
        );

        if (m) {
            return { action: "search", engine: m[1], query: m[2] };
        }

        // ---- Search: "<query> search karo" ----

        m = text.match(/^(.+?)\s+search\s*karo$/);
        if (m) {
            return { action: "search", engine: "google", query: m[1] };
        }
        m = text.match(/^(.+?)\s+(?:खोजो|ढूंढो|सर्च\s*करो)$/);
        if (m) {
            return { action: "search", engine: "google", query: m[1] };
        }

        // ---- Search: "search for <query> on/in <engine>" ----

        m = text.match(
            /^(?:search|find)\s+(?:for\s+)?(.+?)\s+(?:on|in)\s+(\w+)$/
        );

        if (m) {
            return { action: "search", engine: m[2], query: m[1] };
        }

        // ---- Search: "search <query>" / "<engine> search <query>" ----

        m = text.match(/^(\w+)\s+(?:par|pe)\s+search\s+(.+)$/);

        if (m) {
            return { action: "search", engine: m[1], query: m[2] };
        }

        m = text.match(/^(?:search|find)\s+(.+)$/);

        if (m) {
            return { action: "search", engine: "google", query: m[1] };
        }

        // ---- Open: "open <site>" / "<site> kholo" / "<site> खोलो" ----

        m = text.match(/^(?:open|launch|go\s*to)\s+(.+)$/);
        if (m) {
            return resolveSiteTarget(m[1]) ? { action: "open", site: m[1] } : null;
        }

        m = text.match(/^(?:खोलो|खोल\s*दो|खोलिए)\s+(.+)$/);
        if (m) {
            return resolveSiteTarget(m[1]) ? { action: "open", site: m[1] } : null;
        }

        m = text.match(/^(.+?)\s+(?:kholo|khol\s*do|खोलो|खोल\s*दो|खोलिए)$/);
        if (m) {
            return resolveSiteTarget(m[1]) ? { action: "open", site: m[1] } : null;
        }

        return null;
    }

    /* ============================================================
       EXECUTE
    ============================================================ */

    async function ensureBrowserReady() {

        if (window.BrowserUI && typeof window.BrowserUI.showPanel === "function") {
            await window.BrowserUI.showPanel();
        }
    }

    async function switchRelativeTab(direction) {

        if (!window.jarvis?.browser?.getTabs) {
            return false;
        }

        const result = await window.jarvis.browser.getTabs();

        if (!result?.success || !Array.isArray(result.tabs) || result.tabs.length < 2) {
            return false;
        }

        const tabs = result.tabs;
        const currentIndex = tabs.findIndex(t => t.id === result.activeTabId);

        if (currentIndex === -1) {
            return false;
        }

        const nextIndex =
            ((currentIndex + direction) % tabs.length + tabs.length) % tabs.length;

        await window.BrowserUI.switchTab(tabs[nextIndex].id);

        return true;
    }

    async function execute(intent) {

        switch (intent.action) {

            case "youtube-channel-search": {
                await ensureBrowserReady();
                const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${intent.query} channel`)}&sp=EgIQAg%3D%3D`;
                const result = await window.BrowserUI?.navigateActiveTab?.(url);
                return { handled: true, reply: result?.success === false
                    ? say(intent.lang, result.error || "I couldn't find that YouTube channel.", result.error || "YouTube चैनल नहीं खोज पाया।", result.error || "YouTube channel nahi dhoondh paya.")
                    : say(intent.lang, `Searching YouTube for the ${intent.query} channel.`, `YouTube पर ${intent.query} चैनल खोज रहा हूँ।`, `YouTube par ${intent.query} channel dhoondh raha hoon.`) };
            }

            case "open-url": {
                await ensureBrowserReady();
                const result = await window.BrowserUI?.navigateActiveTab?.(intent.url);
                const pageName = intent.appLabel || "Gemini";
                return { handled: true, reply: result?.success === false
                    ? say(intent.lang, result.error || "I couldn't open that page.", result.error || "वेबसाइट नहीं खुल पाई।", result.error || "Website nahi khul payi.")
                    : say(intent.lang, `Opening ${pageName} in JARVIS browser.`, `${pageName} JARVIS ब्राउज़र में खोल रहा हूँ।`, `${pageName} JARVIS browser mein khol raha hoon.`) };
            }

            case "youtube-play": {
                await ensureBrowserReady();
                const result = await window.jarvis?.browser?.playTopYouTubeResult?.(intent.query);
                const ok = result?.success === true;
                return {
                    handled: true,
                    reply: ok
                        ? say(intent.lang, "Playing the top YouTube result in JARVIS browser.", "JARVIS ब्राउज़र में YouTube का पहला वीडियो चला रहा हूँ।", "JARVIS browser mein YouTube ka pehla video chala raha hoon.")
                        : say(intent.lang, result?.error || "I couldn't play a YouTube result.", result?.error || "YouTube वीडियो नहीं चला पाया।", result?.error || "YouTube video nahi chala paya.")
                };
            }

            case "youtube-play-current": {
                await ensureBrowserReady();
                const result = await window.jarvis?.browser?.playCurrentYouTubeVideo?.();
                return {
                    handled: true,
                    reply: result?.success
                        ? say(intent.lang, "Playing the current YouTube video in JARVIS browser.", "JARVIS ब्राउज़र में यह YouTube वीडियो चला रहा हूँ।", "JARVIS browser mein ye YouTube video chala raha hoon.")
                        : say(intent.lang, result?.error || "Open a YouTube video first.", result?.error || "पहले JARVIS ब्राउज़र में YouTube वीडियो खोलें।", result?.error || "Pehle JARVIS browser mein YouTube video kholen.")
                };
            }

            case "youtube-play-needs-query":
                return { handled: true, reply: say(intent.lang, "Which video or song should I play?", "कौन-सा वीडियो या गाना चलाऊँ?", "Kaunsa video ya gaana chalaun?") };

            case "launch-app": {
                const result = await window.jarvis?.system?.openApp?.(intent.app);
                const ok = result?.success === true;
                const names = { chrome: "Chrome", "sql launcher": "SQL Launcher", minecraft: "Minecraft", explorer: "File Explorer" };
                const name = names[intent.app] || intent.app;
                return {
                    handled: true,
                    reply: ok
                        ? say(intent.lang, `Opening ${name}.`, `${name} खोल रहा हूँ।`, `${name} khol raha hoon.`)
                        : say(intent.lang, `I couldn't find ${name} installed.`, `${name} इस कंप्यूटर पर नहीं मिला।`, `${name} is computer par nahi mila.`)
                };
            }

            case "system-lock": {
                const result = await window.jarvis?.system?.lock?.();
                return { handled: true, reply: result?.success === false
                    ? say(intent.lang, "I couldn't lock the system.", "सिस्टम लॉक नहीं हो पाया।", "System lock nahi ho paya.")
                    : say(intent.lang, "Locking the system.", "सिस्टम लॉक कर रहा हूँ।", "System lock kar raha hoon.") };
            }

            case "system-shutdown": {
                const confirmed = typeof window.confirm === "function" && window.confirm("Shut down this computer now?");
                if (!confirmed) return { handled: true, reply: say(intent.lang, "Shutdown cancelled.", "शटडाउन रद्द कर दिया।", "Shutdown cancel kar diya.") };
                const result = await window.jarvis?.system?.shutdown?.();
                return { handled: true, reply: result?.success === false
                    ? say(intent.lang, "I couldn't shut down the system.", "सिस्टम शटडाउन नहीं हो पाया।", "System shutdown nahi ho paya.")
                    : say(intent.lang, "Shutting down the system.", "सिस्टम शटडाउन कर रहा हूँ।", "System shutdown kar raha hoon.") };
            }

            case "tell-time": {
                const time = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date());
                return { handled: true, reply: say(intent.lang, `In Delhi, it is ${time}.`, `दिल्ली में अभी ${time} बजे हैं।`, `Delhi mein abhi ${time} baje hain.`) };
            }

            case "open-browser": {

                await ensureBrowserReady();
                return { handled: true, reply: say(intent.lang, "Opening the browser, sir.", "ब्राउज़र खोल रहा हूँ।", "Browser khol raha hoon.") };
            }

            case "close-browser": {

                if (window.BrowserUI?.hidePanel) {
                    await window.BrowserUI.hidePanel();
                }

                return { handled: true, reply: say(intent.lang, "Closing the browser.", "ब्राउज़र बंद कर रहा हूँ।", "Browser band kar raha hoon.") };
            }

            case "new-tab": {

                await ensureBrowserReady();
                await window.BrowserUI.newTab();

                return { handled: true, reply: say(intent.lang, "Opened a new tab.", "नया टैब खोल दिया।", "Naya tab khol diya.") };
            }

            case "close-tab": {

                if (!window.jarvis?.browser?.getTabs) {
                    return { handled: false };
                }

                const result = await window.jarvis.browser.getTabs();

                if (!result?.success || !result.activeTabId) {
                    return { handled: true, reply: say(intent.lang, "There is no open tab to close.", "बंद करने के लिए कोई टैब खुला नहीं है।", "Band karne ke liye koi tab khula nahi hai.") };
                }
                const closed = await window.BrowserUI.closeTab(result.activeTabId);
                return { handled: true, reply: say(intent.lang,
                    closed?.success === false ? "I couldn't close that tab." : "Tab closed.",
                    closed?.success === false ? "टैब बंद नहीं हो पाया।" : "टैब बंद कर दिया।",
                    closed?.success === false ? "Tab band nahi ho paya." : "Tab band kar diya.") };
            }

            case "close-previous-tab": {
                const result = await window.jarvis.browser.getTabs();
                const tabs = result?.tabs || [];
                const activeIndex = tabs.findIndex((tab) => tab.id === result?.activeTabId);
                if (activeIndex <= 0) {
                    return { handled: true, reply: say(intent.lang, "There is no previous tab to close.", "बंद करने के लिए इससे पुराना कोई टैब नहीं है।", "Band karne ke liye isse purana tab nahi hai.") };
                }
                const closed = await window.BrowserUI.closeTab(tabs[activeIndex - 1].id);
                return { handled: true, reply: say(intent.lang,
                    closed?.success === false ? "I couldn't close the previous tab." : "Closed the previous tab.",
                    closed?.success === false ? "पिछला टैब बंद नहीं हो पाया।" : "पिछला टैब बंद कर दिया।",
                    closed?.success === false ? "Pichhla tab band nahi ho paya." : "Pichhla tab band kar diya.") };
            }

            case "next-tab": {

                await ensureBrowserReady();
                const switched = await switchRelativeTab(1);

                return {
                    handled: true,
                    reply: say(intent.lang,
                        switched ? "Switched to the next tab." : "There's only one tab open.",
                        switched ? "अगले टैब पर चले गए।" : "सिर्फ़ एक टैब खुला है।",
                        switched ? "Agle tab par chale gaye." : "Sirf ek tab khula hai.")
                };
            }

            case "prev-tab": {

                await ensureBrowserReady();
                const switched = await switchRelativeTab(-1);

                return {
                    handled: true,
                    reply: say(intent.lang,
                        switched ? "Switched to the previous tab." : "There's only one tab open.",
                        switched ? "पिछले टैब पर चले गए।" : "सिर्फ़ एक टैब खुला है।",
                        switched ? "Pichhle tab par chale gaye." : "Sirf ek tab khula hai.")
                };
            }

            case "back": {

                await ensureBrowserReady();

                const result = await window.jarvis.browser.getTabs();

                if (result?.success && result.activeTabId) {
                    await window.jarvis.browser.goBack(result.activeTabId);
                }

                return { handled: true, reply: say(intent.lang, "Going back.", "वापस जा रहा हूँ।", "Wapas ja raha hoon.") };
            }

            case "forward": {

                await ensureBrowserReady();

                const result = await window.jarvis.browser.getTabs();

                if (result?.success && result.activeTabId) {
                    await window.jarvis.browser.goForward(result.activeTabId);
                }

                return { handled: true, reply: say(intent.lang, "Going forward.", "आगे बढ़ रहा हूँ।", "Aage badh raha hoon.") };
            }

            case "reload": {

                const result = await window.jarvis.browser.getTabs();

                if (result?.success && result.activeTabId) {
                    await window.jarvis.browser.reload(result.activeTabId);
                }

                return { handled: true, reply: say(intent.lang, "Reloading the page.", "पेज ताज़ा कर रहा हूँ।", "Page taza kar raha hoon.") };
            }

            case "stop": {

                const result = await window.jarvis.browser.getTabs();

                if (result?.success && result.activeTabId) {
                    await window.jarvis.browser.stop(result.activeTabId);
                }

                return { handled: true, reply: say(intent.lang, "Stopped loading.", "लोडिंग रोक दी।", "Loading rok di.") };
            }

            case "bookmark-page": {

                await ensureBrowserReady();

                if (window.BrowserUI?.toggleBookmarkForActiveTab) {
                    await window.BrowserUI.toggleBookmarkForActiveTab();
                }

                return { handled: true, reply: "Bookmarked this page." };
            }

            case "show-bookmarks": {

                await ensureBrowserReady();

                if (window.BrowserUI?.showBookmarksPanel) {
                    await window.BrowserUI.showBookmarksPanel();
                }

                return { handled: true, reply: "Here are your bookmarks." };
            }

            case "show-history": {

                await ensureBrowserReady();

                if (window.BrowserUI?.showHistoryPanel) {
                    await window.BrowserUI.showHistoryPanel();
                }

                return { handled: true, reply: "Here's your browsing history." };
            }

            case "clear-history": {

                if (window.jarvis?.history?.clear) {
                    await window.jarvis.history.clear();
                }

                return { handled: true, reply: "Your browsing history has been cleared." };
            }

            case "zoom-in": {

                await ensureBrowserReady();

                if (window.BrowserUI?.zoomIn) {
                    await window.BrowserUI.zoomIn();
                }

                return { handled: true, reply: "Zoomed in." };
            }

            case "zoom-out": {

                await ensureBrowserReady();

                if (window.BrowserUI?.zoomOut) {
                    await window.BrowserUI.zoomOut();
                }

                return { handled: true, reply: "Zoomed out." };
            }

            case "zoom-reset": {

                if (window.BrowserUI?.zoomReset) {
                    await window.BrowserUI.zoomReset();
                }

                return { handled: true, reply: "Zoom reset to 100 percent." };
            }

            case "print": {

                if (window.BrowserUI?.printActiveTab) {
                    await window.BrowserUI.printActiveTab();
                }

                return { handled: true, reply: "Opening the print dialog." };
            }

            case "save-page": {

                if (window.BrowserUI?.savePageActiveTab) {
                    await window.BrowserUI.savePageActiveTab();
                }

                return { handled: true, reply: "Opening the save dialog." };
            }

            case "find": {

                await ensureBrowserReady();

                if (window.BrowserUI?.findInPage) {
                    await window.BrowserUI.findInPage(intent.query);
                }

                return {
                    handled: true,
                    reply: `Searching this page for "${intent.query}".`
                };
            }

            case "show-downloads": {

                await ensureBrowserReady();

                if (window.BrowserUI?.showDownloadsPanel) {
                    await window.BrowserUI.showDownloadsPanel();
                }

                return { handled: true, reply: "Here are your downloads." };
            }

            case "search": {

                await ensureBrowserReady();

                const target = buildSearchTarget(intent.engine, intent.query);

                const result = await window.BrowserUI.navigateActiveTab(target);

                if (result?.success === false) {
                    return { handled: true, reply: say(intent.lang, "I couldn't complete that search.", "सर्च पूरा नहीं हो पाया।", "Search poora nahi ho paya.") };
                }

                return {
                    handled: true,
                    reply: say(intent.lang,
                        `Searching for "${intent.query}".`,
                        `"${intent.query}" खोज रहा हूँ।`,
                        `Sure, "${intent.query}" search kar raha hoon.`)
                };
            }

            case "open": {
                const target = resolveSiteTarget(intent.site);
                if (!target) return { handled: false };
                await ensureBrowserReady();

                const result = await window.BrowserUI.navigateActiveTab(target);

                if (result?.success === false) {
                    return { handled: true, reply: say(intent.lang, `I couldn't open ${intent.site}.`, `${intent.site} नहीं खुल पाया।`, `${intent.site} nahi khul paya.`) };
                }

                return {
                    handled: true,
                    reply: say(intent.lang,
                        `Opening ${intent.site} for you, sir.`,
                        `${intent.site} खोल रहा हूँ।`,
                        `Sure, ${intent.site} open kar raha hoon.`)
                };
            }

            default:
                return { handled: false };
        }
    }

    /* ============================================================
       PUBLIC: handle(text) — parse + execute in one call.
    ============================================================ */

    async function handle(rawText) {

        if (
            !window.BrowserUI ||
            !window.jarvis?.browser
        ) {
            // Embedded browser isn't available in this build — never
            // claim to handle a command we can't actually carry out.
            return { handled: false };
        }

        const normalized = normalize(rawText);
        // Explicit GitHub/Wikipedia information requests belong to the live
        // data APIs in ChatEngine, not the address bar's website search.
        if (/\b(?:github|git hub)\b/i.test(normalized) &&
            /\b(?:search|find|repo|repos|repository|project|projects|information|info|details?|tell me about)\b/i.test(normalized)) {
            return { handled: false };
        }
        if (/\b(?:wikipedia|wiki)\b|विकिपीडिया|विकिपिडिया/iu.test(normalized) &&
            /\b(?:search|find|information|info|details?|tell me about|what is|who is|about|from)\b|जानकारी|बताओ|बताइए|के बारे/iu.test(normalized)) {
            return { handled: false };
        }

        const intent = parse(rawText);

        if (!intent) {
            return { handled: false };
        }

        intent.lang = detectInputLang(rawText);

        try {

            return await execute(intent);

        } catch (error) {

            console.error(
                "❌ BrowserVoiceControl execute error:",
                error
            );

            return {
                handled: true,
                reply: say(intent.lang || "en", "I ran into a problem controlling the browser.", "ब्राउज़र कंट्रोल में कुछ दिक्कत आई।", "Browser control mein kuch dikkat aa gayi.")
            };
        }
    }

    return {
        parse,
        execute,
        handle
    };
})();

window.BrowserVoiceControl = BrowserVoiceControl;
