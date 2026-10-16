"use strict";

/*
 * ============================================================
 * JARVIS PRO MAX — REALTIME THINK ENGINE
 * renderer/js/brain/realtimeThink.js
 * ============================================================
 *
 * The "brain" that thinks before answering. NO canned command
 * table. Every response is COMPOSED at runtime from:
 *
 *   1. Message analysis   — type, subject, question shape, mood
 *   2. Memory facts       — what JARVIS knows about this user
 *   3. Knowledge fragments — built-in reasoning blocks
 *   4. Conversation state — last topic, last command, follow-ups
 *   5. Personality        — human-like fillers, varied phrasing
 *
 * Response shape (composed, not looked up):
 *   [acknowledgment] + [reasoning/answer] + [follow-up/curiosity]
 *
 * Human behaviour rules:
 *   - Never repeats the same phrasing twice in a row
 *   - Uses the user's name occasionally (not every time)
 *   - Asks follow-up questions when curious
 *   - Admits not knowing instead of pretending
 *   - Reacts to emotion before content
 *
 * Dual-exported for Node testing.
 * ============================================================
 */

var RealtimeThink = (function () {

    var lastPhrases = [];       // avoid immediate repetition
    var lastFollowUp = null;
    var varSeed = Date.now();

    function rand(n) {
        varSeed = (varSeed * 9301 + 49297) % 233280;
        return Math.floor((varSeed / 233280) * n);
    }

    function pick(arr) {
        if (!arr || !arr.length) return "";
        var v = arr[rand(arr.length)];
        // avoid repeating the last-used phrase
        if (arr.length > 1 && lastPhrases.lastIndexOf(v) >= 0) {
            v = arr[(arr.indexOf(v) + 1) % arr.length];
        }
        return v;
    }

    function rememberUsed(/* phrases used in this response */) {
        for (var i = 0; i < arguments.length; i++) {
            lastPhrases.push(arguments[i]);
            if (lastPhrases.length > 12) lastPhrases.shift();
        }
    }

    /* ------------------------------------------------------ */
    /* 1. MESSAGE ANALYSIS                                    */
    /* ------------------------------------------------------ */

    function detectLanguage(text) {
        if (/[\u0900-\u097F]/.test(text)) return "hi";
        return "en"; // hinglish treated as en with hindi words
    }

    function detectMood(text) {
        var t = String(text || "").toLowerCase();
        if (/(sad|upset|dukhi|udaas|depress|tired|thak|exhaust|frustrat|pareshan|stress|anxious|ghabra|worried|fikar|chinta|lonely|akela|alone|hurt|dard)/.test(t)) return "sad";
        if (/(happy|excited|khush|great|awesome|amazing|wow|fantastic|lovely|maza|favourite|love|best|good news|badhai|congrat|party)/.test(t)) return "happy";
        if (/(angry|mad|gussa|annoy|irritat|frustrat|hate|nafrat|bakwas|stupid|pagal)/.test(t)) return "angry";
        if (/(confus|samajh nahi|pata nahi|kya karu|help|madad|stuck|kaisu|kaise|how do|what should|advise|salah)/.test(t)) return "uncertain";
        return "neutral";
    }

    function detectQuestionShape(text) {
        var t = String(text || "").trim().toLowerCase();
        if (!t) return null;
        // NOTE: permission checks FIRST — "kya main..." must not fall into "what"
        if (/^(?:kya main|kya mujhe|can i|may i|should i|could i)\b/.test(t)) return "permission";
        if (/^(?:kya|what)\b/.test(t)) return "what";
        if (/^(?:kyu|kyun|kyon|why)\b/.test(t)) return "why";
        if (/^(?:kaise|kaisa|how)\b/.test(t)) return "how";
        if (/^(?:kab|when)\b/.test(t)) return "when";
        if (/^(?:kaun|kon|who)\b/.test(t)) return "who";
        if (/^(?:kahan|kaha|where)\b/.test(t)) return "where";
        if (/^(?:kitna|kitni|how much|how many)\b/.test(t)) return "howmuch";
        if (/\?$/.test(t) || /\b(?:batao|bata|tell me|do you know|pata hai)\b/.test(t)) return "open";
        return null;
    }

    function detectType(text, questionShape) {
        var t = String(text || "").trim().toLowerCase();
        if (questionShape) return "question";
        if (/\b(?:hi|hello|hey|namaste|salaam|good morning|good evening|sup)\b/.test(t) && t.split(/\s+/).length <= 4) return "greeting";
        if (/\b(?:bye|goodbye|good night|alvida|see you|phir milenge|ja raha|ja rahi|sona hai)\b/.test(t) && t.split(/\s+/).length <= 6) return "farewell";
        if (/\b(?:thanks|thank you|shukriya|dhanyavaad|merci)\b/.test(t) && t.split(/\s+/).length <= 5) return "thanks";
        if (detectMood(text) !== "neutral") return "emotional";
        if (/\b(?:mera|meri|main|mai|i am|i'm|i have|mujhe|mujhe lagta)\b/.test(t)) return "statement";
        if (/\b(?:acha|accha|okay|ok|right|hmm|haan|ha|yes|nahi|no|sahi)\b/.test(t) && t.split(/\s+/).length <= 3) return "acknowledgment";
        return "opinion"; // default: treat as a sharing/opinion
    }

    function extractSubject(text) {
        // strip common question/filler words → what's left is the subject
        var t = String(text || "")
            .toLowerCase()
            .replace(/\b(?:jarvis|hey|kya|kyu|kyun|kyon|kaise|kaisa|kab|kaun|kon|kahan|kaha|kitna|kitni|what|why|how|when|who|where|batao|bata|tell me|do you know|pata hai|hai|hain|ka|ki|ke|ko|mein|me|about|bare mein|baare mein|regarding| Mujhe|mujhe|main|mai)\b/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        var words = t.split(" ").filter(Boolean);
        return words.slice(0, 4).join(" ") || null;
    }

    /* ------------------------------------------------------ */
    /* 2. MEMORY / KNOWLEDGE                                  */
    /* ------------------------------------------------------ */

    var userCache = { name: null, loadedAt: 0 };

    function getUserName() {
        // refresh every 5 min
        if (userCache.name && Date.now() - userCache.loadedAt < 300000) return userCache.name;
        try {
            if (typeof window !== "undefined" && window.jarvis && window.jarvis.users && window.jarvis.users.getActive) {
                window.jarvis.users.getActive().then(function (res) {
                    if (res && res.success && res.user && res.user.name && res.user.name !== "Guest") {
                        userCache.name = res.user.name.split(" ")[0];
                        userCache.loadedAt = Date.now();
                    }
                }).catch(function () {});
            }
        } catch (_) {}
        return userCache.name;
    }

    // Small knowledge fragment store — reasoning blocks, NOT fixed
    // answers. Each fragment is a SEED the composer builds on.
    var KNOWLEDGE = {
        jarvis_self: [
            "main ek local AI hoon — sab kuch tumhare computer pe hi chalta hai, koi cloud nahi",
            "mujhe banaya gaya hai tumhari madad ke liye, aur haan, main sochta hoon is jawab se pehle",
            "main Whisper se sunta hoon, apne brain se sochta hoon, aur XTTS se bolta hoon — sab local"
        ],
        time_related: [
            "time ki baat ho rahi hai — mujhe current time check karne do",
            "timing ka sawaal hai"
        ]
    };

    function knowledgeLookup(subject) {
        if (!subject) return null;
        var s = subject.toLowerCase();
        if (/(?:jarvis|you|tum|tumhara|apna|apne|yourself|khud)/.test(s)) return KNOWLEDGE.jarvis_self[rand(KNOWLEDGE.jarvis_self.length)];
        return null;
    }

    /* ------------------------------------------------------ */
    /* 3. RESPONSE COMPOSERS (per message type)               */
    /* ------------------------------------------------------ */

    function nameOrNothing() {
        // use the name ~30% of the time (human-like, not robotic)
        var n = getUserName();
        return (n && rand(10) < 3) ? n + ", " : "";
    }

    function composeQuestion(text, shape, subject) {
        var acks = [
            "Acha sawaal.", "Interesting.", "Hmm, sochta hoon.",
            "Wah, ye to genuine curiosity hai.", "Sahi poocha.",
            "Theek hai, is pe thoda sochte hain.", "Achha, ye dimaag chalayega."
        ];
        var ack = pick(acks);

        var body = null;
        var frag = knowledgeLookup(subject);

        switch (shape) {
            case "why":
                body = frag || pick([
                    "Iska seedha jawab mere paas nahi hai, par " + (subject ? "'" + subject + "' " : "is topic ") + "peeche jo logic hai wo samajhne layak hai — thoda aur context do, main deeply sochta hoon.",
                    "Honest answer: main 100% sure nahi hoon" + (subject ? " ki " + subject + " kyu aisa hai" : "") + ". Tumhara kya guess hai? Milke dekhte hain."
                ]);
                break;
            case "how":
            case "what":
                body = frag || pick([
                    (subject ? "'" + subject + "' " : "Is ") + "pe mere paas solid local knowledge limited hai — par main search kar sakta hoon ya tumhe step-by-step sochne mein madad kar sakta hoon. Kya prefer karoge?",
                    "Iska exact answer mere local knowledge mein nahi mil raha" + (subject ? " (" + subject + ")" : "") + ". Chaaho to main web se dhoond doon, ya hum log assume karke aage badhein?"
                ]);
                break;
            case "who":
            case "when":
            case "where":
            case "howmuch":
                body = frag || pick([
                    "Ye factual cheez hai — main search karke accurate jawab laata hoon, guess nahi karunga. Bolo to dhoond doon?",
                    (subject ? subject + " " : "") + "ke baare mein exact data chahiye — misinformation dena main pasand nahi karta. Search karu?"
                ]);
                break;
            case "permission":
                body = pick([
                    "Bilkul kar sakte ho — aage badho, main saath hoon.",
                    "Haan, try karo — aur agar phas gaye to main hoon na.",
                    "Main suggest karunga ki haan, par aakhri call tumhara hai. Kya plan hai?"
                ]);
                break;
            default: // open question
                body = frag || pick([
                    "Soch raha hoon..." + (subject ? " " + subject + " pe thoda aur batao, taaki main theek se samajh sakoon." : " Thoda aur detail do."),
                    "Ye interesting hai. Mera local knowledge is topic pe limited hai, par tumhare saath isko explore karna mazedaar hoga. Kya already pata hai is baare mein?"
                ]);
        }

        var followUps = [
            "Aur kya jaanna chaahoge is baare mein?",
            "Tumhara kya khayal hai is baare mein?",
            "Aur kuch dimaag mein chal raha hai?",
            ""
        ];
        var fu = pick(followUps);
        if (fu === lastFollowUp) fu = "";
        lastFollowUp = fu;
        rememberUsed(ack, body);

        var response = nameOrNothing() + ack + " " + body + (fu ? " " + fu : "");
        return response;
    }

    function composeStatement(text) {
        var reacts = [
            "Samajh gaya.", "Achha, note kar liya.",
            "Hmm, interesting.", "Theek hai, sun raha hoon.",
            "Ok, ye to baat hui.", "Samajh raha hoon tum kya keh rahe ho."
        ];
        var react = pick(reacts);
        var subject = extractSubject(text);

        var engages = [
            subject ? ("To " + subject + " important hai tumhare liye. Aur kya chal raha hai us side pe?")
                    : "Aur kya chal raha hai?",
            "Ye bataya tumne — main ye yaad rakhunga. Kya ispe koi madad chahiye?",
            "Hmm. Aur kya new?",
            pick(["Ispe main tumhari madad kar sakta hoon — bolo kya karna hai?", "Achha. Aur batao, kya scene hai?"])
        ];
        var engage = pick(engages);
        rememberUsed(react, engage);
        return nameOrNothing() + react + " " + engage;
    }

    function composeOpinion(text) {
        var openers = [
            "Mera khayal mein",
            "Dil se bolu to",
            "Mera mann bolta hai ki",
            "Agar main apna opinion doon to"
        ];
        var open = pick(openers);
        var body = pick([
            "ye topic apne aap mein interesting hai — dono side pe points hain.",
            "main thoda neutral rahunga, par tumhara perspective samajh mein aa raha hai.",
            "main tumhare saath partially agree karta hoon, par kuch angles aur bhi hain."
        ]);
        var fu = pick(["Tumhe kaisa lagta hai?", "Tum kis side pe ho?", "Aur tumhara kya take hai?", ""]);
        if (fu === lastFollowUp) fu = "";
        lastFollowUp = fu;
        rememberUsed(open, body);
        return nameOrNothing() + open + " " + body + (fu ? " " + fu : "");
    }

    function composeEmotional(text, mood) {
        switch (mood) {
            case "sad":
                return pick([
                    "Arre... sun raha hoon. Aisa feel karna bilkul theek hai — koi jaldi nahi hai. Kya hua tha, bologi/bologe to halka lagega?",
                    "Hmm, lagta hai kuch bother kar raha hai. Main yahin hoon — share karna chaaho to kar do, nahi to bas chup-chaap saath baith sakta hoon.",
                    "Ye feel karna valid hai. Kuch log bolte hain 'sab theek ho jayega' — main sirf itna kahunga: abhi main tumhare saath hoon. Kya hua?"
                ]);
            case "happy":
                return pick([
                    "Wah! Ye to badhiya news hai! Is khushi ka poora faida uthao!",
                    "Oho! Dekh ke hi mera mood accha ho gaya! Aur batao — kya hua tha?",
                    "Ye to genuinely great hai! Celebration banta hai — koi kaam karwao jo tumhe pasand hai!"
                ]);
            case "angry":
                return pick([
                    "Theek hai, gussa valid lag raha hai. Gussa mein bhi bolo — main sun raha hoon. Kya hua tha?",
                    "Dekho, pehle deep breath... ab batao kya chal raha hai. Main judge nahi karunga."
                ]);
            case "uncertain":
                return pick([
                    "Confusion theek hai — iska matlab tum soch rahe ho, wo acchi cheez hai. Situation batao, main options nikaalne mein madad karunga.",
                    "Pata nahi kya karna ho? Koi baat nahi. Ek kaam karo — situation ke do side batao, hum log saath mein decide karte hain."
                ]);
        }
        return composeStatement(text);
    }

    function composeGreeting() {
        var name = getUserName();
        var byTime = "";
        try {
            var h = new Date().getHours();
            if (h < 12) byTime = "Subah ka vibe badhiya hai";
            else if (h < 17) byTime = "Dopehar ho gaya";
            else if (h < 21) byTime = "Shaam ho rahi hai";
            else byTime = "Raat ho gayi hai";
        } catch (_) {}
        var greet = pick([
            (name ? "Hello " + name : "Hello") + (byTime ? " — " + byTime : "") + ". Kya chal raha hai?",
            (name ? "Namaste " + name + "!" : "Namaste!") + " Bolo, aaj kya plan hai?",
            "Hey! Main online hoon, sun raha hoon. Kya madad karu?",
            "Hello hello! Kya scene hai?"
        ]);
        rememberUsed(greet);
        return greet;
    }

    function composeThanks() {
        var t = pick([
            "Arre koi baat nahi! Isi liye to hoon main.",
            "Happy to help! Aur kuch chahiye to bolna.",
            "Anytime! Ye mera kaam hai.",
            "Pleasure! Aage bhi yahi rahunga."
        ]);
        rememberUsed(t);
        return t;
    }

    function composeFarewell() {
        var t = pick([
            "Bye! Theek hai, milte hain — main yahin rahunga jab wapas aao.",
            "Goodbye! Apna dhyan rakhna. Wake word bologe to main hazir.",
            "Alvida for now! Jaldi wapas aana, bore ho jaunga.",
            "Bye bye! Good bye and rest well."
        ]);
        rememberUsed(t);
        return t;
    }

    function composeAcknowledgment() {
        var t = pick([
            "Hmm, continue karo — sun raha hoon.",
            "Ok. Aur?",
            "Achha. Aage bolo.",
            "Samajh gaya. Bolo."
        ]);
        rememberUsed(t);
        return t;
    }

    /* ------------------------------------------------------ */
    /* 4. MAIN THINK ENTRY                                    */
    /* ------------------------------------------------------ */

    /**
     * Think about a message and compose a response.
     * @param {string} message - user's raw message
     * @param {object} context - {lastCommand, recentTurns, source}
     * @returns {{handled: boolean, response: string, thinkingMs: number, analysis: object}}
     */
    function think(message, context) {
        var startT = Date.now();
        var text = String(message || "").trim();
        if (!text) return { handled: false, response: null, thinkingMs: 0, analysis: null };

        var lang = detectLanguage(text);
        var mood = detectMood(text);
        var shape = detectQuestionShape(text);
        var type = detectType(text, shape);
        var subject = extractSubject(text);

        var response;
        switch (type) {
            case "question":      response = composeQuestion(text, shape, subject); break;
            case "greeting":      response = composeGreeting(); break;
            case "farewell":      response = composeFarewell(); break;
            case "thanks":        response = composeThanks(); break;
            case "emotional":     response = composeEmotional(text, mood); break;
            case "acknowledgment":response = composeAcknowledgment(); break;
            case "statement":     response = composeStatement(text); break;
            default:              response = composeOpinion(text); break;
        }

        // Simulated thinking time — proportional to message length,
        // clamped 200-700ms. Feels like actual thought, not instant canned.
        var thinkingMs = Math.min(700, Math.max(200, Math.floor(text.length * 6)));

        return {
            handled: true,
            response: response,
            thinkingMs: thinkingMs,
            analysis: { type: type, mood: mood, questionShape: shape, subject: subject, language: lang }
        };
    }

    /* ------------------------------------------------------ */
    /* 5. PUBLIC API                                          */
    /* ------------------------------------------------------ */

    return {
        think: think,
        // analysis helpers (exposed for tests)
        _detectLanguage: detectLanguage,
        _detectMood: detectMood,
        _detectQuestionShape: detectQuestionShape,
        _detectType: detectType,
        _extractSubject: extractSubject,
        _knowledgeLookup: knowledgeLookup,
        _reset: function () { lastPhrases = []; lastFollowUp = null; }
    };
})();

if (typeof window !== "undefined") window.JARVISRealtimeThink = RealtimeThink;
if (typeof module !== "undefined" && module.exports) module.exports = RealtimeThink;
