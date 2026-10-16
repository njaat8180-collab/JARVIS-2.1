"use strict";

/*
 * ============================================================
 * JARVIS PRO MAX — SMART REPLY VARIATION ENGINE
 * renderer/js/language/SmartReplies.js
 * ============================================================
 *
 * GOAL: JARVIS har baar ALAG reply de — bina kisi AI ke.
 * Every reply sounds fresh and smart, never repetitive.
 *
 * HOW (fully offline):
 *   1. Template pools — every response type has 3-8 variations
 *   2. Shuffled-bag rotation (no immediate repeats, full coverage)
 *   3. Time-of-day awareness (subah/shaam/raat references)
 *   4. Language matching (en / hi / hinglish variants)
 *   5. Acknowledgement diversity ("Sure", "हो गया", ...)
 *   6. Occasional personality touches (sir, boss, ji)
 *
 * API:
 *   JARVISSmartReplies.get("OPEN_APP", { lang, APP: "Chrome" })
 *   JARVISSmartReplies.ack("hinglish")        → varied prefix
 *   JARVISSmartReplies.vary(baseResponse, lang) → wraps fixed-data
 *       replies (weather, time) in varied phrasing
 * ============================================================
 */

(function () {

    // ============================================================
    // SHUFFLED BAG — no immediate repeats, full pool coverage
    // ============================================================

    const bags = new Map();

    function pick(pool, poolId) {
        if (!pool || !pool.length) return "";
        if (pool.length === 1) return pool[0];

        let bag = bags.get(poolId);
        if (!bag || !bag.length) {
            bag = [...pool];
            for (let i = bag.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [bag[i], bag[j]] = [bag[j], bag[i]];
            }
        }
        const value = bag.pop();
        bags.set(poolId, bag);
        return value;
    }

    // ============================================================
    // TIME-OF-DAY CONTEXT
    // ============================================================

    function getTimeOfDay() {
        const hour = new Date().getHours();
        if (hour >= 5 && hour < 12) return "morning";
        if (hour >= 12 && hour < 17) return "afternoon";
        if (hour >= 17 && hour < 21) return "evening";
        return "night";
    }

    // ============================================================
    // ACKNOWLEDGEMENT POOLS
    // ============================================================

    const ACKS = {
        en: [
            "Sure.", "Done.", "On it.", "Right away.", "Consider it done.",
            "Of course.", "Absolutely.", "At once.", "No problem.", "Got it.",
        ],
        hi: [
            "ज़रूर।", "हो गया।", "अभी करता हूँ।", "बिल्कुल।", "एकदम।",
            "ठीक है।", "अभी कर देता हूँ।", "जी बिल्कुल।",
        ],
        hinglish: [
            "Sure.", "Ho gaya.", "Abhi karta hoon.", "Bilkul.", "Ekdam.",
            "Theek hai.", "Abhi kar deta hoon.", "Zaroor.",
        ],
    };

    const ADDRESS = {
        en: ["sir", "boss", "chief"],
        hi: ["सर", "जी"],
        hinglish: ["sir", "bhai", "boss", "ji"],
    };

    function ack(lang) {
        const l = (lang === "hi" || lang === "hinglish") ? lang : "en";
        let base = pick(ACKS[l], "ack-" + l);
        if (Math.random() < 0.30) {
            const addr = pick(ADDRESS[l], "addr-" + l);
            base = base.replace(/[.।]$/, "") + " " + addr + (l === "hi" ? "।" : ".");
        }
        return base;
    }

    // ============================================================
    // RESPONSE TEMPLATE POOLS PER INTENT
    // ============================================================

    const TEMPLATES = {

        OPEN_APP: {
            en: [
                "Opening {APP}.",
                "Launching {APP} for you.",
                "{APP} is on its way.",
                "Starting {APP} now.",
                "Done — {APP} is opening.",
                "Getting {APP} ready.",
            ],
            hi: [
                "{APP} खोल रहा हूँ।",
                "{APP} शुरू कर रहा हूँ।",
                "ले आया {APP}।",
                "{APP} खुल रहा है।",
                "अभी खोलता हूँ {APP}।",
            ],
            hinglish: [
                "{APP} khol raha hoon.",
                "{APP} chalu kar raha hoon.",
                "Ho gaya — {APP} khul raha hai.",
                "{APP} launch kar diya.",
                "Abhi kholta hoon {APP}.",
            ],
        },

        OPEN_WEBSITE: {
            en: [
                "Opening {SITE}.",
                "Taking you to {SITE}.",
                "{SITE} is loading up.",
                "Pulling up {SITE} now.",
                "Done — {SITE} coming right up.",
            ],
            hi: [
                "{SITE} खोल रहा हूँ।",
                "{SITE} पर ले चलता हूँ।",
                "{SITE} खुल रहा है।",
                "अभी खोलता हूँ {SITE}।",
            ],
            hinglish: [
                "{SITE} khol raha hoon.",
                "{SITE} pe le chal raha hoon.",
                "{SITE} khul raha hai.",
                "Done — {SITE} khol diya.",
            ],
        },

        SEARCH_WEB: {
            en: [
                "Searching for {QUERY}.",
                "Looking up {QUERY} now.",
                "Let me find {QUERY} for you.",
                "On it — searching {QUERY}.",
                "Searching the web for {QUERY}.",
                "Finding {QUERY}, one moment.",
            ],
            hi: [
                "{QUERY} खोज रहा हूँ।",
                "{QUERY} ढूँढता हूँ।",
                "अभी खोजता हूँ {QUERY}।",
                "{QUERY} के लिए सर्च कर रहा हूँ।",
            ],
            hinglish: [
                "{QUERY} search kar raha hoon.",
                "{QUERY} dhoond raha hoon.",
                "Abhi dhoondta hoon {QUERY}.",
                "{QUERY} ke liye search kar diya.",
            ],
        },

        SEARCH_YOUTUBE: {
            en: [
                "Searching YouTube for {QUERY}.",
                "Finding {QUERY} on YouTube.",
                "Looking for {QUERY} videos on YouTube.",
            ],
            hi: [
                "YouTube पर {QUERY} खोज रहा हूँ।",
                "{QUERY} के वीडियो YouTube पर ढूँढ रहा हूँ।",
            ],
            hinglish: [
                "YouTube par {QUERY} search kar raha hoon.",
                "{QUERY} ke videos dhoond raha hoon YouTube pe.",
            ],
        },

        GET_WEATHER: {
            en: [
                "Checking the weather in {PLACE}.",
                "Let me pull up the forecast for {PLACE}.",
                "Getting current conditions for {PLACE}.",
                "One moment — checking {PLACE}'s weather.",
            ],
            hi: [
                "{PLACE} का मौसम देखता हूँ।",
                "{PLACE} का मौसम जाँच रहा हूँ।",
                "अभी देखता हूँ {PLACE} का मौसम।",
            ],
            hinglish: [
                "{PLACE} ka weather check kar raha hoon.",
                "{PLACE} ka mausam dekh raha hoon.",
                "Ek second — {PLACE} ka weather nikalta hoon.",
            ],
        },

        GET_TIME: {
            en: [
                "The time is {TIME}.",
                "It's {TIME} right now.",
                "Right now? {TIME}.",
                "Current time: {TIME}.",
                "My clock says {TIME}.",
                "It's exactly {TIME}.",
            ],
            hi: [
                "अभी {TIME} बजे हैं।",
                "समय है {TIME}।",
                "अभी का समय {TIME} है।",
                "घड़ी के हिसाब से {TIME} बजे हैं।",
            ],
            hinglish: [
                "Abhi {TIME} baje hain.",
                "Time hai {TIME}.",
                "Right now {TIME}.",
                "Abhi ka time {TIME} hai.",
            ],
        },

        GET_DATE: {
            en: ["Today is {DATE}.", "It's {DATE} today.", "The date is {DATE}."],
            hi: ["आज {DATE} है।", "आज की तारीख़ {DATE} है।"],
            hinglish: ["Aaj {DATE} hai.", "Aaj ki date {DATE} hai."],
        },

        GET_NEWS: {
            en: [
                "Fetching the latest news.",
                "Let me get today's headlines.",
                "Pulling up current news for you.",
                "Getting the news now.",
            ],
            hi: [
                "ताज़ा ख़बरें लाता हूँ।",
                "आज की ख़बरें देखता हूँ।",
                "अभी न्यूज़ लाता हूँ।",
            ],
            hinglish: [
                "Latest news la raha hoon.",
                "Aaj ki khabrein laata hoon.",
                "Abhi news fetch karta hoon.",
            ],
        },

        CLOSE_APP: {
            en: [
                "Closing {APP}.",
                "{APP} is being shut down.",
                "Shutting {APP} down now.",
                "Done — {APP} is closing.",
            ],
            hi: [
                "{APP} बंद कर रहा हूँ।",
                "{APP} बंद कर दिया।",
                "अभी बंद करता हूँ {APP}।",
            ],
            hinglish: [
                "{APP} band kar raha hoon.",
                "{APP} band kar diya.",
                "Ho gaya — {APP} band.",
            ],
        },

        VOLUME_CONTROL: {
            en: ["Adjusting the volume.", "Volume adjusted.", "Done — volume changed."],
            hi: ["आवाज़ ठीक कर दी।", "वॉल्यूम एडजस्ट कर दिया।"],
            hinglish: ["Aawaz adjust kar di.", "Volume set kar diya."],
        },

        BRIGHTNESS_CONTROL: {
            en: ["Adjusting the brightness.", "Brightness adjusted."],
            hi: ["ब्राइटनेस ठीक कर दी।", "स्क्रीन की रोशनी एडजस्ट कर दी।"],
            hinglish: ["Brightness adjust kar di.", "Screen ki light set kar di."],
        },

        SCREENSHOT: {
            en: ["Taking a screenshot.", "Capturing the screen now.", "Screenshot incoming.", "Say cheese — capturing."],
            hi: ["स्क्रीनशॉट ले रहा हूँ।", "स्क्रीन कैप्चर कर रहा हूँ।"],
            hinglish: ["Screenshot le raha hoon.", "Screen capture kar raha hoon."],
        },

        SYSTEM_CONTROL: {
            shutdown: {
                en: ["Shutting down the computer.", "Powering off now.", "Computer is shutting down."],
                hi: ["कंप्यूटर बंद कर रहा हूँ।", "सिस्टम शट डाउन हो रहा है।"],
                hinglish: ["Computer band kar raha hoon.", "System shut down ho raha hai."],
            },
            restart: {
                en: ["Restarting the computer.", "Rebooting now.", "Computer is restarting."],
                hi: ["कंप्यूटर रीस्टार्ट कर रहा हूँ।", "सिस्टम रीस्टार्ट हो रहा है।"],
                hinglish: ["Computer restart kar raha hoon.", "Reboot ho raha hai."],
            },
            lock: {
                en: ["Locking your computer.", "Securing your workstation.", "Computer locked."],
                hi: ["कंप्यूटर लॉक कर रहा हूँ।", "सिस्टम लॉक कर दिया।"],
                hinglish: ["Computer lock kar raha hoon.", "Lock kar diya."],
            },
            sleep: {
                en: ["Putting the computer to sleep.", "System going to sleep."],
                hi: ["कंप्यूटर सुला रहा हूँ।", "सिस्टम स्लीप मोड में जा रहा है।"],
                hinglish: ["Computer sula raha hoon.", "Sleep mode on."],
            },
        },

        BROWSER_ACTION: {
            new_tab: {
                en: ["Opened a new tab.", "New tab is up.", "There you go — fresh tab."],
                hi: ["नया टैब खोल दिया।", "नई टैब खुल गई।"],
                hinglish: ["Naya tab khol diya.", "Fresh tab ready hai."],
            },
            close_tab: {
                en: ["Tab closed.", "Closed it.", "Tab shut down."],
                hi: ["टैब बंद कर दिया।", "टैब बंद हो गया।"],
                hinglish: ["Tab band kar diya.", "Band ho gaya."],
            },
            back: {
                en: ["Going back.", "Back it is.", "Navigating back."],
                hi: ["पीछे जा रहा हूँ।", "वापस चला गया।"],
                hinglish: ["Wapas ja raha hoon.", "Back kar diya."],
            },
            forward: {
                en: ["Going forward.", "Moving ahead."],
                hi: ["आगे बढ़ रहा हूँ।", "आगे चला गया।"],
                hinglish: ["Aage badh raha hoon.", "Forward kar diya."],
            },
            reload: {
                en: ["Reloading the page.", "Refreshing now.", "Page reloaded."],
                hi: ["पेज ताज़ा कर रहा हूँ।", "रीलोड कर दिया।"],
                hinglish: ["Page reload kar raha hoon.", "Refresh kar diya."],
            },
        },

        GREETING: {
            en: [
                "Hello. JARVIS is online and ready.",
                "Hi there. What can I do for you?",
                "Hello. All systems operational.",
                "Hey. Good to hear from you.",
                "Greetings. Standing by for your command.",
            ],
            hi: [
                "नमस्ते। मैं JARVIS हूँ, तैयार हूँ।",
                "नमस्ते। बताइए क्या मदद करूँ?",
                "हैलो। सभी सिस्टम चालू हैं।",
                "प्रणाम। आपकी क्या सेवा करूँ?",
            ],
            hinglish: [
                "Hello. JARVIS online hai, bolo kya karna hai.",
                "Namaste. Sab systems ready hain.",
                "Hey. Bolo, kya kaam karna hai?",
                "Hello ji. Ready hoon aapki sewa mein.",
            ],
        },

        HOW_ARE_YOU: {
            en: [
                "All systems running perfectly, thank you.",
                "Operating at full capacity.",
                "Running smoothly. How are you?",
                "Everything's in order on my end.",
            ],
            hi: [
                "सब कुछ ठीक चल रहा है, धन्यवाद।",
                "मैं बिल्कुल ठीक हूँ। आप कैसे हैं?",
                "सभी सिस्टम बढ़िया चल रहे हैं।",
            ],
            hinglish: [
                "Sab badhiya chal raha hai, thanks.",
                "Main bilkul theek hoon. Aap kaise ho?",
                "Sab systems perfect hain.",
            ],
        },

        UNKNOWN: {
            en: [
                "I didn't quite catch that.",
                "Sorry, could you say that again?",
                "Hmm, I didn't understand. Try once more?",
                "I'm not sure I followed. Rephrase it for me?",
            ],
            hi: [
                "माफ़ कीजिए, समझ नहीं आया।",
                "क्या आप दोबारा बता सकते हैं?",
                "एक बार फिर बोलिएगा?",
                "मुझे समझ नहीं आया, थोड़ा और साफ़ बोलिए।",
            ],
            hinglish: [
                "Samajh nahi aaya, dobara bolo?",
                "Ek baar phir se bolna padega.",
                "Sorry, samajh nahi aaya.",
                "Thoda saaf bolenge?",
            ],
        },

        ERROR: {
            en: [
                "Hmm, something went wrong there.",
                "That didn't work as expected. Let me try again.",
                "Ran into a problem — trying another way.",
            ],
            hi: [
                "कुछ गड़बड़ हो गई। दोबारा कोशिश करता हूँ।",
                "काम पूरा नहीं हो पाया।",
            ],
            hinglish: [
                "Kuch gadbad ho gayi. Dobara try karta hoon.",
                "Kaam pura nahi ho paya.",
            ],
        },

        MEMORY_SAVED: {
            en: [
                "Noted. I'll remember that.",
                "Saved to memory.",
                "Got it — stored for later.",
                "Locked in. You can count on me.",
            ],
            hi: [
                "याद रख लिया।",
                "मेमोरी में सेव कर दिया।",
                "नोट कर लिया, भूलूँगा नहीं।",
            ],
            hinglish: [
                "Yaad rakh liya.",
                "Memory me save kar diya.",
                "Note kar liya, bhoolunga nahi.",
            ],
        },
    };

    // ============================================================
    // SLOT SUBSTITUTION
    // ============================================================

    function fill(template, slots) {
        if (!slots) return template;
        return template.replace(/\{(\w+)\}/g, (m, key) => {
            return slots[key] !== undefined && slots[key] !== null
                ? String(slots[key]) : m;
        });
    }

    // ============================================================
    // MAIN API
    // ============================================================

    function get(key, opts = {}) {
        const lang = (opts.lang === "hi" || opts.lang === "hinglish") ? opts.lang : "en";

        let node = TEMPLATES;
        for (const part of String(key).split(".")) {
            node = node?.[part];
            if (!node) return "";
        }

        let pool = node[lang] || node.en || [];
        if (!Array.isArray(pool) || !pool.length) return "";

        const template = pick(pool, `${key}.${lang}`);
        return fill(template, opts);
    }

    /**
     * Wrap a plain/fixed-data response with varied phrasing.
     * ~50% chance to prefix an ack — so it feels natural,
     * not mechanically prefixed on every line.
     */
    function vary(baseResponse, lang) {
        if (!baseResponse) return baseResponse;
        const l = (lang === "hi" || lang === "hinglish") ? lang : "en";
        if (Math.random() < 0.5) {
            return `${ack(l)} ${baseResponse}`;
        }
        return baseResponse;
    }

    function timeGreeting(lang) {
        const tod = getTimeOfDay();
        const map = {
            morning:   { en: "Good morning", hi: "सुप्रभात", hinglish: "Good morning" },
            afternoon: { en: "Good afternoon", hi: "नमस्कार", hinglish: "Namaste" },
            evening:   { en: "Good evening", hi: "शुभ संध्या", hinglish: "Good evening" },
            night:     { en: "Working late I see", hi: "इतनी रात को भी काम?", hinglish: "Raat itni bhi kaam?" },
        };
        return map[tod]?.[lang] || map[tod]?.en || "";
    }

    // ============================================================
    // EXPORT
    // ============================================================

    window.JARVISSmartReplies = Object.freeze({
        version: "SR-V1",
        get,
        vary,
        ack,
        timeGreeting,
        getTimeOfDay,
        fill,
    });

    console.log("🎭 JARVIS Smart Replies SR-V1 READY");

})();
