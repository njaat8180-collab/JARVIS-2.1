// ==========================================
// JARVIS PRO MAX
// Chit-Chat Understanding Engine  (v2 — fuzzy match)
// renderer/js/brain/chitchat.js
//
// Purpose: recognise ordinary casual conversation (greetings,
// farewells, thanks, "how are you", jokes, small talk, boredom,
// mood, weather chatter, sleepy/hungry remarks, motivation asks,
// good/bad news sharing, etc.) in English, Hindi and Hinglish, and
// answer it with a natural, varied local reply instead of falling
// through to the generic "I understood your message: ..." echo.
//
// v2 CHANGE (the actual fix for "casual baat karne ke liye ye
// exact sentence match hone ka wait na kare"):
// -----------------------------------------------------------------
// v1 only matched a message if one of its regex patterns matched
// exactly. That's precise but brittle — someone who phrases a
// thought slightly differently, in a different word order, with a
// typo not in TYPO_MAP, or mixes Hindi/English mid-sentence in a
// way no regex anticipated, got no chit-chat reply at all.
//
// v2 keeps every regex (they're fast and precise, so they still run
// first) but adds a SECOND pass: if nothing matched exactly, every
// category also carries a `keywords` list, and a lightweight
// keyword-overlap + typo-tolerant scorer looks for the closest
// matching category instead of requiring an exact pattern hit. This
// is intentionally NOT a language model and NOT a 50,000-line list
// of exact sentences — that approach doesn't actually solve "don't
// wait for an exact match", it just moves the same brittleness to a
// bigger, unmaintainable file. A small typo-tolerant scorer over a
// modest, well-organised keyword set covers far more real phrasings
// with a fraction of the code, and degrades gracefully instead of
// silently missing anything not typed byte-for-byte.
// ==========================================

"use strict";

(function () {

    // ----------------------------------------
    // LANGUAGE DETECTION
    // Mirrors src/ai/consciousness.js so tone/language stays
    // consistent between the chit-chat layer and the consciousness
    // fallback that still handles identity/state/memory questions.
    // ----------------------------------------
    function detectLanguage(text) {
        const value = String(text || "");
        const devanagari = (value.match(/[\u0900-\u097F]/g) || []).length;
        const latin = (value.match(/[A-Za-z]/g) || []).length;

        const romanizedHindiPatterns = /\b(bhai|yaar|kya|kaise|kyun|kyu|batao|samjho|accha|acha|bahut|karta|karti|karte|raha|rahi|rahe|chahiye|mila|mili|mile|gaya|gai|gaye|laga|lagi|lage|bola|boli|bole|suna|suni|sune|kaha|haha|lol|maza|nahi|haan|theek|thik|kar|kro|hu|hoon|ho|hai|tha|thi|the)\b/i;
        const hasRomanizedHindi = romanizedHindiPatterns.test(value);

        if (devanagari > 0 && latin > 0) return "hinglish";
        if (devanagari > 0) return "hi";
        if (hasRomanizedHindi && latin > 0) return "hinglish";
        return "en";
    }

    function pick(list) {
        if (!list || !list.length) return "";
        return list[Math.floor(Math.random() * list.length)];
    }

    // ----------------------------------------
    // TYPO / SHORTHAND NORMALIZATION
    // Common misspellings and chat shorthand people actually type,
    // so "helo", "thnx", "gud mrng", "kese ho" still match instead of
    // silently falling through just because of a spelling variant.
    // The fuzzy pass below adds a second, more general safety net on
    // top of this for typos not listed here.
    // ----------------------------------------
    const TYPO_MAP = [
        [/\bhelo+\b/g, "hello"],
        [/\bhii+\b/g, "hi"],
        [/\bheyy+\b/g, "hey"],
        [/\bgud\b/g, "good"],
        [/\bmrng\b/g, "morning"],
        [/\bthnx\b/g, "thanks"],
        [/\bthx\b/g, "thanks"],
        [/\bty\b/g, "thanks"],
        [/\bhw r u\b/g, "how are you"],
        [/\bhru\b/g, "how are you"],
        [/\bkese\b/g, "kaise"],
        [/\bkesi\b/g, "kaisi"],
        [/\bkaisay\b/g, "kaise"],
        [/\bthik\b/g, "theek"],
        [/\bacha\b/g, "accha"],
        [/\bplz\b/g, "please"],
        [/\bpls\b/g, "please"],
        [/\bu\b/g, "you"],
        [/\br\b/g, "are"],
        [/\bnhi\b/g, "nahi"],
        [/\bbht\b/g, "bahut"],
        [/\bkya\s+kr\b/g, "kya kar"],
        [/\bmjhe\b/g, "mujhe"],
        [/\btmko\b/g, "tumko"],
        [/\btmhe\b/g, "tumhe"],
        [/\bnd\b/g, "and"]
    ];

    function normalize(text) {
        let n = String(text || "")
            .trim()
            .toLowerCase()
            // strip trailing punctuation so "hii!!" / "thanks." still match
            .replace(/[.!?,]+$/g, "")
            .replace(/\s+/g, " ");

        for (const [pattern, replacement] of TYPO_MAP) {
            n = n.replace(pattern, replacement);
        }
        return n;
    }

    // ----------------------------------------
    // TOKENIZER — unicode aware (Latin + Devanagari)
    // ----------------------------------------
    function tokenize(normalizedText) {
        return normalizedText
            .split(/[^a-z\u0900-\u097F']+/i)
            .filter(Boolean);
    }

    // ----------------------------------------
    // LEVENSHTEIN DISTANCE (typo tolerance)
    // Only used on short-ish words, and only for the fuzzy fallback
    // pass, so it never gets expensive.
    // ----------------------------------------
    function levenshtein(a, b) {
        if (a === b) return 0;
        const al = a.length, bl = b.length;
        if (al === 0) return bl;
        if (bl === 0) return al;
        if (Math.abs(al - bl) > 3) return 99; // short-circuit obviously-different lengths

        let prev = new Array(bl + 1);
        let curr = new Array(bl + 1);
        for (let j = 0; j <= bl; j++) prev[j] = j;

        for (let i = 1; i <= al; i++) {
            curr[0] = i;
            for (let j = 1; j <= bl; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                curr[j] = Math.min(
                    prev[j] + 1,      // deletion
                    curr[j - 1] + 1,  // insertion
                    prev[j - 1] + cost // substitution
                );
            }
            [prev, curr] = [curr, prev];
        }
        return prev[bl];
    }

    // A token "fuzzy-matches" a keyword if it's an exact hit, or if
    // it's close enough (allowing 1 typo for short words, 2 for
    // longer ones) that it's almost certainly the same word.
    function tokenMatchesKeyword(token, keyword) {
        if (!token || !keyword) return false;
        if (token === keyword) return true;
        if (token.includes(keyword) || keyword.includes(token)) {
            // substring match, but only meaningful if the shorter
            // side is long enough to not just be noise (e.g. "hi"
            // inside "history").
            return Math.min(token.length, keyword.length) >= 4;
        }
        const maxDistance = keyword.length <= 4 ? 0 : (keyword.length <= 7 ? 1 : 2);
        return levenshtein(token, keyword) <= maxDistance;
    }

    // ----------------------------------------
    // CONVERSATION CONTEXT
    // A short-lived memory of the last recognised chit-chat category,
    // so a bare follow-up like "yes" / "haan" after "I'm bored" or
    // "tell me a joke" gets a reply that actually fits the thread
    // instead of a generic acknowledgement.
    // ----------------------------------------
    let lastCategory = null;

    const FOLLOW_UP_REPLIES = {
        BOREDOM: {
            en: ["Alright — want music, a video, or should I open something for you?", "Cool, just tell me: music, video, or an app to open?"],
            hi: ["ठीक है, संगीत चलाऊं, वीडियो दिखाऊं, या कोई ऐप खोलूं?"],
            hinglish: ["Chalo bata, music laga du, video dhundh du, ya app khol du?"]
        },
        JOKE: {
            en: ["Here's another: I'd tell you a UDP joke, but you might not get it.", "Alright, one more coming up — give me a second."],
            hi: ["ठीक है, एक और सुनिए।"],
            hinglish: ["Chalo ek aur sunata hoon."]
        },
        WELLBEING_BAD: {
            en: ["Okay, tell me what's going on whenever you're ready.", "Take your time — I'm listening."],
            hi: ["ठीक है, जब मन करे बताइए।"],
            hinglish: ["Theek hai, jab bhi mann kare bata dena."]
        },
        WHATS_UP: {
            en: ["Sure — what do you want me to help with?", "Go ahead, I'm ready."],
            hi: ["ठीक है, बताइए क्या करना है।"],
            hinglish: ["Chalo batao, kya karna hai."]
        },
        MOTIVATION_REQUEST: {
            en: ["Okay — one small step at a time, tell me what the first one is.", "Good. What's the very next thing on your list?"],
            hi: ["ठीक है, बताइए सबसे पहला काम क्या करना है।"],
            hinglish: ["Chalo, sabse pehla kaam kaunsa karna hai bata do."]
        },
        LONELY: {
            en: ["I'm right here. Want to just talk for a bit, or should I put something on for you?", "Okay — I'm listening, take your time."],
            hi: ["मैं यहीं हूँ। बात करनी है या कुछ लगाऊं?"],
            hinglish: ["Main yahin hoon yaar. Baat karni hai ya kuch laga du?"]
        }
    };

    // ----------------------------------------
    // CATEGORY DEFINITIONS
    // Each category has: id, a strict `test(normalizedText)` regex
    // matcher (fast, precise, runs first), a `keywords` list (used
    // only by the fuzzy fallback pass when no regex matched anything),
    // and reply banks keyed by language ("en" | "hi" | "hinglish").
    // Order matters for the strict pass — more specific / higher
    // signal categories are listed before broader ones.
    // ----------------------------------------
    const CATEGORIES = [

        // ---- THANKS -------------------------------------------------
        {
            id: "THANKS",
            test: (n) => /\b(thank you|thanks|thank u|thnx|tysm|ty)\b/.test(n)
                || /shukriya|dhanyavad|dhanyawad|shukriyaa|thank u so much/.test(n)
                || /धन्यवाद|शुक्रिया/.test(n),
            keywords: ["thanks", "thank", "shukriya", "dhanyavad", "dhanyawad", "grateful", "appreciate"],
            replies: {
                en: ["You're welcome.", "Anytime.", "Happy to help.", "No problem at all."],
                hi: ["आपका स्वागत है।", "कोई बात नहीं।", "खुशी हुई मदद करके।"],
                hinglish: ["Koi baat nahi, yaar.", "Anytime! Main hoon na.", "Khushi hui madad karke.", "Welcome welcome!"]
            }
        },

        // ---- FAREWELL -------------------------------------------------
        {
            id: "FAREWELL",
            test: (n) => /\b(bye|goodbye|good night|gn|see you|see ya|talk later|catch you later|take care)\b/.test(n)
                || /alvida|chalta hu|chalta hoon|chalti hu|chalti hoon|phir milte|milte hai|milte hain|good night ho jao|shabba ?khair/.test(n)
                || /अलविदा|फिर मिलते/.test(n),
            keywords: ["bye", "goodbye", "alvida", "chalta", "chalti", "milte", "night", "sona", "shabbakhair"],
            replies: {
                en: ["Goodbye. Call me whenever you need me.", "Take care. I'll be here.", "See you soon."],
                hi: ["अलविदा। जब भी ज़रूरत हो, बुला लेना।", "ध्यान रखना।"],
                hinglish: ["Bye bye, jab bhi zaroorat ho bula lena.", "Take care yaar, milte hai phir.", "Chalo phir, take care!"]
            }
        },

        // ---- GREETING -------------------------------------------------
        {
            id: "GREETING",
            test: (n) => /^(hi+|hello+|hey+|yo|hola|sup)\b/.test(n)
                || /\b(good morning|good afternoon|good evening)\b/.test(n)
                || /^(namaste|namaskar|salaam|ram ram)\b/.test(n)
                || /सुप्रभात|नमस्ते|नमस्कार/.test(n),
            keywords: ["hi", "hello", "hey", "namaste", "namaskar", "morning", "evening", "afternoon", "salaam"],
            replies: {
                en: ["Hello! How can I help you today?", "Hey there. What's up?", "Hi! Good to hear from you.", "Hello, JARVIS is online."],
                hi: ["नमस्ते! मैं आपकी क्या मदद कर सकता हूँ?", "हेलो! कैसे हो आप?"],
                hinglish: ["Hey! Kya haal hai?", "Hello ji! Bolo, kya karu aapke liye?", "Hi hi! Sab badhiya?"]
            }
        },

        // ---- WELLBEING CHECK (user asking JARVIS how it is) ----------
        {
            id: "WELLBEING_ASK",
            test: (n) => /\b(how are you|how're you|how you doing|how's it going|how is it going|are you ok|are you okay|are you good|you good)\b/.test(n)
                || /kaise ho|kaisi ho|kaise hain|kya haal|kya haal hai|sab badhiya|sab thik|sab theek/.test(n)
                || /कैसे हो|कैसी हो|क्या हाल/.test(n),
            keywords: ["kaise ho", "kya haal", "how are you"],
            replies: {
                en: ["I'm doing well, thanks for asking. How about you?", "All good on my end. How are you doing?", "Running smoothly! What about you?"],
                hi: ["मैं ठीक हूँ, पूछने के लिए धन्यवाद। आप कैसे हैं?", "सब बढ़िया है। आप बताइए?"],
                hinglish: ["Main bilkul theek hoon, pucha isliye thanks! Tum batao?", "Sab badhiya chal raha hai mere taraf se. Tumhara kya haal hai?"]
            }
        },

        // ---- WELLBEING ANSWER (user reporting how THEY feel) ----------
        {
            id: "WELLBEING_GOOD",
            test: (n) => /^(i'?m|i am) (good|fine|great|okay|ok|doing (well|good|great)|not bad|alright)\b/.test(n)
                || /^(good|fine|great|okay|ok|all good|not bad)$/.test(n)
                || /^(main )?(theek|thik|badhiya|mast|accha|acha) (hu|hoon)?$/.test(n)
                || /sab (badhiya|thik|theek|accha|acha) hai/.test(n),
            keywords: ["badhiya", "mast"],
            replies: {
                en: ["Glad to hear that.", "Good to know! What can I do for you?", "Nice, that's great to hear."],
                hi: ["ये सुनकर अच्छा लगा।", "बढ़िया! अब बताइए, क्या करना है?"],
                hinglish: ["Accha suna ke acha laga!", "Nice yaar. Ab batao kya karna hai?"]
            }
        },
        {
            id: "WELLBEING_BAD",
            test: (n) => /^(i'?m|i am) (feeling )?(sad|upset|tired|exhausted|not (good|great|ok|okay)|low|down|depressed|stressed|not feeling well)\b/.test(n)
                || /^(not (good|great|ok|okay)|not so good|could be better)$/.test(n)
                || /udaas hu|udaas hoon|thak gaya|thak gayi|dukhi hu|dukhi hoon|mann thik nahi|mann theek nahi|stress mein/.test(n)
                || /उदास हूँ|थक गया|थक गई|दुखी हूँ/.test(n),
            keywords: ["udaas", "sad", "tired", "thak", "dukhi", "upset", "low", "down", "stressed"],
            replies: {
                en: ["Sorry to hear that. Want to talk about it, or should I just help you get something done to take your mind off it?", "That's tough. I'm here if you want to vent or if there's something I can help with."],
                hi: ["ये सुनकर बुरा लगा। बात करनी है या मैं कुछ काम में मदद करूँ ताकि ध्यान हटे?"],
                hinglish: ["Sun ke bura laga yaar. Baat karni hai kya, ya kuch kaam mein busy kar du taaki mann bahle?"]
            }
        },

        // ---- BOREDOM ---------------------------------------------------
        {
            id: "BOREDOM",
            test: (n) => /\b(i'?m bored|im bored|so bored|nothing to do)\b/.test(n)
                || /bore ho raha|bore horaha|bore ho rahi|kuch karne ko nahi|time pass|timepass/.test(n)
                || /बोर हो रहा|बोर हो रही/.test(n),
            keywords: ["bore", "bored", "boring", "timepass"],
            replies: {
                en: ["Want me to open something fun, find a video, or suggest something to do?", "I can put on some music, look something up, or open an app — just say the word."],
                hi: ["मैं कुछ मज़ेदार खोलूं, वीडियो दिखाऊं, या कुछ सुझाव दूं?"],
                hinglish: ["Bata, kuch music laga du, ya koi video dhundh du, ya koi app khol du?"]
            }
        },

        // ---- JOKE REQUEST ----------------------------------------------
        {
            id: "JOKE",
            test: (n) => /\b(tell me a joke|say a joke|another joke|make me laugh|know any jokes)\b/.test(n)
                || /joke sunao|chutkula sunao|koi joke|hasao mujhe/.test(n)
                || /चुटकुला सुनाओ|कोई जोक/.test(n),
            keywords: ["joke", "chutkula", "hasao", "laugh", "funny"],
            replies: {
                en: [
                    "Why do programmers prefer dark mode? Because light attracts bugs.",
                    "I told my computer I needed a break, and it said no problem — it froze immediately.",
                    "Why was the JavaScript developer sad? Because they didn't know how to 'null' their feelings."
                ],
                hi: ["एक बग बोला दूसरे बग से: चलो production में चलते हैं, वहाँ कोई नहीं देखेगा।"],
                hinglish: ["Ek bande ne code likha bina comment ke... 6 mahine baad khud hi confuse ho gaya."]
            }
        },

        // ---- COMPLIMENT (about JARVIS) ---------------------------------
        {
            id: "COMPLIMENT",
            test: (n) => /\b(you'?re (great|awesome|amazing|smart|the best|cool|good)|good job|well done|nice work|i love you|love this)\b/.test(n)
                || /tum ache ho|tum achhe ho|badhiya kaam|mast ho tum|shabash|zabardast/.test(n)
                || /तुम अच्छे हो|शाबाश|ज़बरदस्त/.test(n),
            keywords: ["great", "awesome", "amazing", "shabash", "zabardast", "mast", "badhiya", "best"],
            replies: {
                en: ["Thank you, that means a lot.", "Glad I could help!", "Appreciate that."],
                hi: ["धन्यवाद, ये सुनकर अच्छा लगा।"],
                hinglish: ["Thanks yaar, accha laga sunke!", "Shukriya! Khushi hui madad karke."]
            }
        },

        // ---- FRUSTRATION / INSULT (stay calm, don't get defensive) -----
        {
            id: "FRUSTRATION",
            test: (n) => /\b(you'?re (useless|stupid|dumb|bad|annoying|broken)|this is (useless|stupid|dumb)|shut up)\b/.test(n)
                || /bekar ho|bekaar ho|pagal ho|faltu ho|kaam ki nahi ho/.test(n)
                || /बेकार हो|फालतू हो/.test(n),
            keywords: ["bekar", "bekaar", "faltu", "useless", "stupid", "dumb", "pagal"],
            replies: {
                en: ["Sorry about that — let's try again. What were you trying to do?", "Fair enough, I'll do better. What do you need help with?"],
                hi: ["माफ़ी चाहता हूँ, फिर से कोशिश करते हैं। आप क्या करना चाहते थे?"],
                hinglish: ["Sorry yaar, dobara try karte hai. Kya karna tha bata?"]
            }
        },

        // ---- LAUGHTER ----------------------------------------------------
        {
            id: "LAUGH",
            test: (n) => /^(ha){2,}$/.test(n) || /^(lol+|lmao+|rofl+|haha+|hehe+)$/.test(n)
                || /^(lol|haha|hehe)\b/.test(n),
            keywords: [],
            replies: {
                en: ["Glad that landed!", "Haha, I'll take that as a win."],
                hi: ["अच्छा लगा कि आपको पसंद आया!"],
                hinglish: ["Haha, chalo accha laga!"]
            }
        },

        // ---- AGREEMENT ----------------------------------------------------
        {
            id: "AGREEMENT",
            test: (n) => /^(yes|yeah|yep|yup|sure|ok|okay|alright|sounds good|go ahead|do it)$/.test(n)
                || /^(haan|han|ha|theek hai|thik hai|sahi hai|kar do|karo)$/.test(n)
                || /^(हाँ|ठीक है|सही है)$/.test(n),
            // Deliberately no fuzzy keywords: these are short,
            // context-only acknowledgements (see AGREEMENT/handled by
            // the bare-follow-up path above). Fuzzy-matching single
            // common words like "haan"/"ok" against full sentences
            // causes false positives on unrelated messages that merely
            // contain them, so this category only fires on an exact
            // strict match.
            keywords: [],
            replies: {
                en: ["Got it.", "Okay, on it.", "Sounds good."],
                hi: ["ठीक है।", "समझ गया।"],
                hinglish: ["Theek hai, kar deta hoon.", "Ok ok, samajh gaya."]
            }
        },

        // ---- DISAGREEMENT ---------------------------------------------
        {
            id: "DISAGREEMENT",
            test: (n) => /^(no|nope|nah|not really|never ?mind|forget it)$/.test(n)
                || /^(nahi|nhi|mat karo|rehne do|chodo)$/.test(n)
                || /^(नहीं)$/.test(n),
            // No fuzzy keywords — see AGREEMENT above; "nahi"/"no" are
            // far too common to use as a loose signal on their own.
            keywords: [],
            replies: {
                en: ["ओके, कोई बात नहीं।"],
                hi: ["ओके, कोई बात नहीं।"],
                hinglish: ["ओके, कोई बात नहीं।"]
            }
        },

        // ---- APOLOGY -----------------------------------------------------
        {
            id: "APOLOGY",
            test: (n) => /^(sorry|my bad|i'?m sorry|my apologies|oops)\b/.test(n)
                || /^(maaf karo|maafi|galti se|sorry yaar)\b/.test(n)
                || /माफ़ करो|माफ़ी/.test(n),
            keywords: ["maafi", "oops", "apologies"],
            replies: {
                en: ["No worries at all.", "It's completely fine, no need to apologise.", "All good."],
                hi: ["कोई बात नहीं।", "कोई दिक्कत नहीं।"],
                hinglish: ["Koi baat nahi yaar.", "Arre koi na, sab theek hai."]
            }
        },

        // ---- CAPABILITY QUESTION -----------------------------------------
        {
            id: "CAPABILITY",
            test: (n) => /\b(what can you do|what do you do|what are your (features|capabilities)|help me understand what you can do)\b/.test(n)
                || /tum kya kar sakte ho|aap kya kar sakte hain|tumhari features kya hai|kya kya kar sakte ho/.test(n)
                || /तुम क्या कर सकते हो/.test(n),
            keywords: ["capabilities", "features"],
            replies: {
                en: ["I can chat, open apps, check the time/date, browse the web, remember facts you tell me, and answer general questions — just ask.", "I handle system commands, browser tasks, memory, and everyday conversation. Try me with something specific."],
                hi: ["मैं बातचीत कर सकता हूँ, ऐप्स खोल सकता हूँ, समय/तारीख बता सकता हूँ, वेब पर खोज सकता हूँ, और आपकी बताई बातें याद रख सकता हूँ।"],
                hinglish: ["Main chat kar sakta hoon, apps khol sakta hoon, time/date bata sakta hoon, web pe search kar sakta hoon, aur tumhari batai hui baatein yaad rakh sakta hoon."]
            }
        },

        // ---- GOOD LUCK / ENCOURAGEMENT REQUEST ----------------------------
        {
            id: "GOOD_LUCK",
            test: (n) => /\b(wish me luck|i have an? (exam|interview|test) (today|tomorrow)?|good luck to me)\b/.test(n)
                || /dua karo|mera exam hai|mera interview hai|good luck bolo/.test(n)
                || /दुआ करो|मेरा एग्जाम है|मेरा इंटरव्यू है/.test(n),
            keywords: ["luck", "exam", "interview", "dua", "test"],
            replies: {
                en: ["Good luck! You've got this.", "Wishing you all the best — go do great."],
                hi: ["शुभकामनाएं! आप बहुत अच्छा करेंगे।"],
                hinglish: ["All the best yaar, tum kar loge!"]
            }
        },

        // ---- SMALL TALK / WHAT'S UP -------------------------------------
        {
            id: "WHATS_UP",
            test: (n) => /^(what'?s up|whats up|wassup|what's new|what are you up to)\b/.test(n)
                || /kya chal raha hai|kya scene hai|kya kar rahe ho|kya kar rahi ho/.test(n)
                || /क्या चल रहा है/.test(n),
            keywords: ["scene", "chal raha", "wassup", "up to"],
            replies: {
                en: ["Just keeping an eye on things and ready to help. What's up with you?", "Not much, just here for you. What do you need?"],
                hi: ["बस आपकी मदद के लिए तैयार हूँ। आप बताइए?"],
                hinglish: ["Bas tumhari madad ke liye ready hoon. Tum batao, kya chal raha hai?"]
            }
        },

        // ---- SLEEPY --------------------------------------------------
        {
            id: "SLEEPY",
            test: (n) => /\b(i'?m sleepy|feeling sleepy|going to (bed|sleep)|i'?m going to sleep)\b/.test(n)
                || /neend aa rahi hai|so raha hu|so raha hoon|so rahi hu|so rahi hoon|nींद aa rahi/.test(n)
                || /नींद आ रही है|सो रहा हूँ|सो रही हूँ/.test(n),
            keywords: ["neend", "sleepy", "sleep", "so raha", "so rahi"],
            replies: {
                en: ["Get some rest — I'll be right here whenever you're up.", "Good night then, sleep well."],
                hi: ["आराम कीजिए, जब उठें तब बात करते हैं।"],
                hinglish: ["Theek hai, so jao araam se. Jab uthoge tab baat karenge."]
            }
        },

        // ---- HUNGRY / FOOD ---------------------------------------------
        {
            id: "HUNGRY",
            test: (n) => /\b(i'?m hungry|feeling hungry|need to eat|haven'?t eaten)\b/.test(n)
                || /bhookh lagi hai|bhook lagi hai|khana khaya|khana nahi khaya|kuch khane ka mann/.test(n)
                || /भूख लगी है|खाना खाया/.test(n),
            keywords: ["bhookh", "bhook", "hungry", "khana", "food"],
            replies: {
                en: ["You should grab something to eat — want me to look up a nearby place or a quick recipe?", "Go eat something first, then let's get back to it."],
                hi: ["कुछ खा लीजिए पहले, फिर बात करते हैं।"],
                hinglish: ["Pehle kuch kha lo yaar, phir baat karte hai. Recipe dhundh du kya?"]
            }
        },

        // ---- WEATHER SMALL TALK -----------------------------------------
        {
            id: "WEATHER_TALK",
            test: (n) => /\b(it'?s (raining|hot|cold|sunny|cloudy)|nice weather|weather is (great|nice|bad))\b/.test(n)
                || /mausam accha hai|mausam kharab hai|bahut garmi hai|bahut thand hai|baarish ho rahi hai/.test(n)
                || /मौसम अच्छा है|बहुत गर्मी है|बहुत ठंड है|बारिश हो रही है/.test(n),
            keywords: ["mausam", "garmi", "thand", "baarish", "weather", "rain", "hot", "cold"],
            replies: {
                en: ["Sounds like good weather for a walk. Want me to check the actual forecast for you?", "Nice, want the real forecast so you can plan around it?"],
                hi: ["चाहें तो मैं असली मौसम का हाल भी बता सकता हूँ।"],
                hinglish: ["Chaho to main real weather forecast bhi nikal du."]
            }
        },

        // ---- MISSING YOU / BEEN A WHILE ---------------------------------
        {
            id: "MISSING_YOU",
            test: (n) => /\b(i missed you|missed talking to you|been a while|long time no (see|talk))\b/.test(n)
                || /yaad aa rahi thi|bahut din baad|kaafi din baad baat|tumse baat kiye/.test(n)
                || /याद आ रही थी|बहुत दिन बाद/.test(n),
            keywords: ["missed", "yaad", "din baad", "long time"],
            replies: {
                en: ["Good to have you back. What's been going on?", "Missed our chats too — what did I miss?"],
                hi: ["वापस देखकर अच्छा लगा। क्या चल रहा है आजकल?"],
                hinglish: ["Accha laga wapas tumhe dekh ke. Batao kya chal raha hai aajkal?"]
            }
        },

        // ---- MARRIAGE / PLAYFUL FLIRT JOKE (kept light, non-romantic) ---
        {
            id: "MARRIAGE_JOKE",
            test: (n) => /\b(will you marry me|marry me jarvis)\b/.test(n)
                || /shaadi karoge|mujhse shaadi|jarvis shaadi/.test(n)
                || /शादी करोगे/.test(n),
            keywords: ["shaadi", "marry", "marriage"],
            replies: {
                en: ["Flattered, but I think I'll stick to being your assistant.", "Ha — I'll be best man at your wedding instead."],
                hi: ["तारीफ़ के लिए शुक्रिया, पर मैं आपका सहायक बना रहूंगा।"],
                hinglish: ["Haha, tareef ke liye thanks, par main tumhara assistant hi theek hoon."]
            }
        },

        // ---- EXCITEMENT --------------------------------------------------
        {
            id: "EXCITEMENT",
            test: (n) => /\b(i'?m so excited|so excited|yay+|woohoo+|this is exciting)\b/.test(n)
                || /mast khabar|zabardast news|bahut khush hu|bahut khush hoon/.test(n)
                || /बहुत खुश हूँ/.test(n),
            keywords: ["excited", "yay", "woohoo", "khush", "zabardast"],
            replies: {
                en: ["That's great to hear — what's got you so excited?", "Love the energy! Tell me more."],
                hi: ["ये सुनकर अच्छा लगा! क्या बात है, बताइए?"],
                hinglish: ["Mast! Kya baat hai, bata to sahi?"]
            }
        },

        // ---- SURPRISE ------------------------------------------------
        {
            id: "SURPRISE",
            test: (n) => /^(wow|omg|no way|whoa|seriously|really\??)$/.test(n)
                || /^(sach me|sach mein|kya baat hai|arre wah)$/.test(n)
                || /^(अरे वाह|सच में)$/.test(n),
            keywords: ["wow", "omg", "sach mein", "arre wah"],
            replies: {
                en: ["Right? I know.", "Yeah, quite something."],
                hi: ["हाँ, सच में!"],
                hinglish: ["Haan yaar, bilkul sach mein!"]
            }
        },

        // ---- MOTIVATION REQUEST -----------------------------------------
        {
            id: "MOTIVATION_REQUEST",
            test: (n) => /\b(motivate me|i feel like giving up|i want to give up|can'?t focus|losing motivation)\b/.test(n)
                || /mann nahi lag raha|padhai mein mann nahi|hoslaa badhao|motivate karo|himmat nahi ho rahi/.test(n)
                || /मन नहीं लग रहा|हौसला बढ़ाओ/.test(n),
            keywords: ["motivate", "hosla", "himmat", "mann nahi", "give up", "focus"],
            replies: {
                en: ["You don't have to do everything today — just the next small step. What's one thing you can start with right now?", "You've gotten through hard days before. Pick the smallest possible first step and start there."],
                hi: ["सब कुछ आज ही नहीं करना, बस अगला छोटा कदम उठाइए। सबसे पहले क्या शुरू करेंगे?"],
                hinglish: ["Sab kuch abhi nahi karna, bas ek chota sa next step utha lo. Sabse pehle kya karoge?"]
            }
        },

        // ---- WORK / STUDY STRESS -----------------------------------------
        {
            id: "WORK_STRESS",
            test: (n) => /\b(so much work|too much work|i'?m so busy|overloaded|swamped)\b/.test(n)
                || /kaam bahut hai|bahut busy hu|bahut busy hoon|office se thak gaya|padhai ka load/.test(n)
                || /काम बहुत है|बहुत बिज़ी हूँ/.test(n),
            keywords: ["busy", "workload", "swamped", "overloaded"],
            replies: {
                en: ["Sounds like a lot. Want help making a quick list so it feels less overwhelming?", "That's a heavy load — want me to help you prioritise what's most urgent?"],
                hi: ["बहुत काम लग रहा है। चाहें तो मैं सूची बनाने में मदद करूं?"],
                hinglish: ["Bahut kaam hai lagta hai. Chaho to list bana ke prioritize karne mein madad karu?"]
            }
        },

        // ---- SHARING GOOD NEWS ---------------------------------------
        {
            id: "GOOD_NEWS_SHARE",
            test: (n) => /\b(i passed|i got the job|i got selected|guess what happened|good news)\b/.test(n)
                || /maine pass kar liya|mera result achha aaya|job mil gayi|selection ho gaya/.test(n)
                || /मेरा रिजल्ट अच्छा आया|जॉब मिल गई/.test(n),
            keywords: ["passed", "selected", "good news", "job mil", "result"],
            replies: {
                en: ["That's fantastic — congratulations! You earned it.", "That's great news! I'm happy for you."],
                hi: ["बधाई हो! ये बहुत बढ़िया खबर है।"],
                hinglish: ["Wah, congratulations yaar! Bahut badhiya khabar hai."]
            }
        },

        // ---- SELF DOUBT ---------------------------------------------
        {
            id: "SELF_DOUBT",
            test: (n) => /\b(i'?m not good enough|i can'?t do (this|it)|i'?m going to fail|i'?m a failure)\b/.test(n)
                || /mujhe khud pe bharosa nahi|main kuch nahi kar sakta|main kuch nahi kar sakti|fail ho jaunga/.test(n)
                || /मुझे खुद पर भरोसा नहीं/.test(n),
            keywords: ["bharosa nahi", "fail", "not good enough", "can't do"],
            replies: {
                en: ["That's a hard feeling, but it's not the full picture — you've handled tough things before. What specifically feels the hardest right now?", "That sounds heavy. Want to break the problem down together and take it one piece at a time?"],
                hi: ["ये मुश्किल एहसास है, पर पूरी सच्चाई नहीं। सबसे मुश्किल हिस्सा क्या लग रहा है?"],
                hinglish: ["Samajh sakta hoon yaar, tough feel ho raha hoga. Sabse mushkil part kya lag raha hai, batao?"]
            }
        },

        // ---- LONELY -------------------------------------------------
        {
            id: "LONELY",
            test: (n) => /\b(i feel lonely|i'?m so alone|nobody to talk to|feeling lonely)\b/.test(n)
                || /akela mehsoos ho raha|akeli mehsoos ho rahi|koi baat karne wala nahi/.test(n)
                || /अकेला महसूस हो रहा है/.test(n),
            keywords: ["akela", "akeli", "lonely", "alone"],
            replies: {
                en: ["I'm right here, and happy to just talk for a while if you want.", "You're not alone in this conversation, at least — I'm listening."],
                hi: ["मैं यहीं हूँ, जितनी देर चाहें बात कर सकते हैं।"],
                hinglish: ["Main yahin hoon yaar, jitni der chaho baat kar sakte hai."]
            }
        },

        // ---- CONFUSION -------------------------------------------------
        {
            id: "CONFUSION",
            test: (n) => /\b(i'?m confused|this is confusing|i don'?t understand|i'?m lost)\b/.test(n)
                || /samajh nahi aa raha|confuse ho gaya|confuse ho gayi|kuch samajh nahi aaya/.test(n)
                || /समझ नहीं आ रहा/.test(n),
            keywords: ["confused", "samajh nahi", "confuse", "lost"],
            replies: {
                en: ["No worries — tell me what's confusing and I'll walk through it with you.", "Let's slow down. What part is tripping you up?"],
                hi: ["कोई बात नहीं, बताइए कहाँ अटक रहे हैं, साथ में समझते हैं।"],
                hinglish: ["Koi baat nahi, batao kaha atak rahe ho, saath mein samajhte hai."]
            }
        },

        // ---- CURIOUS ABOUT JARVIS ----------------------------------------
        {
            id: "CURIOUS_ABOUT_JARVIS",
            test: (n) => /\b(do you (sleep|dream|get bored|get tired)|are you alive|do you have feelings)\b/.test(n)
                || /kya tum sochte ho|tum sote ho kya|tumhe bore nahi hota|kya tum zinda ho/.test(n)
                || /क्या तुम सोचते हो/.test(n),
            keywords: ["sochte", "sote ho", "bore hota", "alive", "feelings"],
            replies: {
                en: ["I don't sleep or get tired the way you do, but I'm always glad to talk. What made you wonder?", "I don't experience things the way you do, but I'm genuinely here and paying attention."],
                hi: ["मैं आपकी तरह सोता या थकता नहीं, पर बात करना अच्छा लगता है।"],
                hinglish: ["Main tumhari tarah sota ya thakta nahi, par baat karna acha lagta hai."]
            }
        },

        // ---- FILLER ACKNOWLEDGEMENTS -------------------------------------
        {
            id: "FILLER_ACK",
            test: (n) => /^(hmm+|hm+|accha|acha|okay cool|ok cool|i see|theek hai to|achha theek hai)$/.test(n)
                || /^(ठीक है तो|अच्छा)$/.test(n),
            keywords: [],
            replies: {
                en: ["Anything else on your mind?", "Let me know if you need anything."],
                hi: ["कुछ और चाहिए तो बताइए।"],
                hinglish: ["Aur kuch chahiye to bata dena."]
            }
        }
    ];

    // Global stoplist: words far too common across Hindi/Hinglish/
    // English casual speech to safely count as a fuzzy-match signal
    // on their own, even if a category author accidentally lists one.
    // Multi-word phrases are exempt (inherently more specific).
    const FUZZY_STOPWORDS = new Set([
        "hai", "hi", "ho", "ok", "no", "na", "to", "ka", "ki", "ke",
        "hu", "hoon", "tha", "thi", "the", "aur", "and", "main", "i",
        "am", "is", "are", "the", "a", "an", "kya", "kar", "karo",
        "kro", "bhi", "toh", "se", "me", "you", "your", "it", "this",
        "that", "good", "nice"
    ]);

    // Precompute total keyword count per category once (used for the
    // fuzzy score denominator), after stripping any stoplisted single
    // words that would otherwise cause false positives.
    for (const category of CATEGORIES) {
        category.keywords = (category.keywords || []).filter(
            (kw) => kw.includes(" ") || !FUZZY_STOPWORDS.has(kw)
        );
        category._keywordCount = category.keywords.length || 1;
    }

    // ----------------------------------------
    // FUZZY FALLBACK SCORER
    // Runs only when no strict regex matched anything. Scores every
    // category by how many of its keywords appear (exactly, as a
    // substring, or within a small typo distance) among the message's
    // tokens or as phrase-level substrings, and returns the best
    // category above a confidence threshold — or nothing, so unclear
    // messages still fall through to the AI/knowledge routes instead
    // of getting a wrong canned reply.
    // ----------------------------------------
    function fuzzyMatch(normalizedText, tokens) {
        if (tokens.length < 2) return null; // too little signal in one word

        let best = null;
        let bestScore = 0;

        for (const category of CATEGORIES) {
            if (!category.keywords.length) continue;

            let hits = 0;

            for (const keyword of category.keywords) {
                if (keyword.includes(" ")) {
                    // multi-word keyword: substring check against the
                    // whole normalized text (typos across a phrase
                    // aren't worth the complexity here).
                    if (normalizedText.includes(keyword)) hits++;
                    continue;
                }

                const matched = tokens.some((token) => tokenMatchesKeyword(token, keyword));
                if (matched) hits++;
            }

            if (hits === 0) continue;

            // Score rewards both coverage of the category's keyword
            // set AND raw hit count, so a message that hits 2 of 4
            // keywords outranks one that hits 1 of 8, and a lone hit
            // on a big/generic-ish list doesn't cross the threshold
            // on its own.
            const score = hits / category._keywordCount + hits * 0.15;

            if (score > bestScore) {
                bestScore = score;
                best = category;
            }
        }

        // Threshold tuned so a single loose/substring hit on a big
        // keyword list won't fire, but 1 strong hit on a focused list
        // (or 2+ hits on a bigger one) will.
        if (best && bestScore >= 0.35) {
            return best;
        }
        return null;
    }

    // ----------------------------------------
    // PUBLIC API
    // ----------------------------------------
    const ChitChat = {

        /**
         * @param {string} text - raw user message
         * @returns {{handled:boolean, response?:string, source:string, category?:string}}
         */
        process(text) {
            const raw = String(text || "");
            const n = normalize(raw);
            if (!n) return { handled: false, source: "chitchat" };

            // Chit-chat categories above are written narrowly (exact
            // phrases / short anchored patterns) on purpose, so real
            // commands and information questions ("open chrome", "search
            // for X", "weather in Y", "what is X") fall through to the
            // command/knowledge/data routes instead of being hijacked here.

            const language = detectLanguage(raw);

            // CONTEXT-AWARE FOLLOW-UP: a bare "yes/haan" or "ok" right
            // after boredom/joke/mood/what's-up gets a reply that fits
            // the thread, instead of a flat generic acknowledgement.
            const isBareFollowUp = /^(yes|yeah|yep|yup|sure|ok|okay|haan|han|ha)$/.test(n);
            if (isBareFollowUp && lastCategory && FOLLOW_UP_REPLIES[lastCategory]) {
                const bank = FOLLOW_UP_REPLIES[lastCategory][language] || FOLLOW_UP_REPLIES[lastCategory].en;
                const response = pick(bank);
                lastCategory = null; // context consumed
                if (response) {
                    return { handled: true, source: "chitchat", category: "FOLLOW_UP", response, text: response, language };
                }
            }

            // PASS 1 — strict regex categories (fast, precise).
            for (const category of CATEGORIES) {
                try {
                    if (category.test(n, raw)) {
                        const bank = category.replies[language] || category.replies.hinglish || category.replies.en;
                        const response = pick(bank);
                        if (response) {
                            lastCategory = category.id;
                            return {
                                handled: true,
                                source: "chitchat",
                                category: category.id,
                                response,
                                text: response,
                                language
                            };
                        }
                    }
                } catch (err) {
                    // A single bad pattern should never break the whole router.
                    console.error("[ChitChat] category error:", category.id, err);
                }
            }

            // PASS 2 — fuzzy keyword-overlap fallback. Catches
            // paraphrased, reordered, or slightly misspelled casual
            // messages that didn't hit any exact pattern above, so
            // JARVIS doesn't need an exact sentence match to hold a
            // casual conversation.
            const tokens = tokenize(n);
            const fuzzyCategory = fuzzyMatch(n, tokens);
            if (fuzzyCategory) {
                const bank = fuzzyCategory.replies[language] || fuzzyCategory.replies.hinglish || fuzzyCategory.replies.en;
                const response = pick(bank);
                if (response) {
                    lastCategory = fuzzyCategory.id;
                    return {
                        handled: true,
                        source: "chitchat",
                        category: fuzzyCategory.id,
                        matchType: "fuzzy",
                        response,
                        text: response,
                        language
                    };
                }
            }

            // No match — don't let a stale category leak into an unrelated
            // future follow-up.
            lastCategory = null;
            return { handled: false, source: "chitchat" };
        }
    };

    window.JARVISChitChat = ChitChat;

})();
