"use strict";

/*
 * ============================================================
 * JARVIS PRO MAX — HINDI TRANSLITERATION & COMMAND PARITY
 * renderer/js/language/HindiTranslit.js
 * ============================================================
 *
 * GOAL: Jo command English mein kaam karta hai, wahi command
 * Hindi (Devanagari) mein bola jaaye to BHI wahi kaam kare.
 *
 * STRATEGY:
 *   Devanagari input
 *     → Word-level command map (खोलो→kholo, बताओ→batao, ...)
 *     → Entity transliteration (यूट्यूब→youtube, गूगल→google, ...)
 *     → Character-level Devanagari→Roman fallback
 *     → Roman Hinglish text that existing English/Hinglish
 *       command routers (BrowserVoiceControl, NaturalCommandEngine,
 *       matcher, Brain) already understand.
 *
 * Nothing existing is replaced — this module only pre-processes
 * the text so every existing matcher ALSO understands Hindi.
 * ============================================================
 */

(function () {

    // ============================================================
    // 1. HIGH-FREQUENCY HINDI COMMAND WORDS (word-level map)
    // ============================================================

    const WORD_MAP = {
        // ----- Verbs: open/close/start/stop -----
        "खोलो": "kholo", "खोल": "khol", "खोलोगे": "kholo",
        "खोलदो": "kholo", "खोल दो": "kholo", "खोलना": "kholo",
        "खुलवाओ": "kholo", "खोलवाओ": "kholo",
        "बंद": "band", "बंदकरो": "band karo", "बंद करो": "band karo",
        "बंदकरदो": "band karo", "बंद कर दो": "band karo",
        "बंदकरदीजिए": "band karo", "बंदहोजाओ": "band karo",
        "चलाओ": "chalao", "चला": "chala", "चलादो": "chalao",
        "चला दो": "chalao", "चालू": "chalu", "चालूकरो": "chalu karo",
        "चालू करो": "chalu karo", "बजाओ": "chalao",
        "रोको": "roko", "रोकदो": "roko", "रोक दो": "roko",
        "शुरू": "shuru", "शुरूकरो": "shuru karo", "शुरू करो": "shuru karo",
        "स्टॉप": "stop", "पॉज़": "pause",

        // ----- Verbs: tell/show/find/search -----
        "बताओ": "batao", "बता": "bata", "बतादो": "batao",
        "बता दो": "batao", "बताइए": "batao", "बताओगे": "batao",
        "दिखाओ": "dikhao", "दिखा": "dikha", "दिखादो": "dikhao",
        "दिखा दो": "dikhao", "दिखाइए": "dikhao",
        "खोजो": "dhoondo", "खोज": "khoj",
        "ढूँढो": "dhoondo", "ढूंढो": "dhoondo", "ढूँढ़ो": "dhoondo",
        "खोजकरो": "dhoondo", "खोज करो": "dhoondo",
        "सर्चकरो": "search karo", "सर्च करो": "search karo",
        "सर्च": "search",
        "पढ़ो": "padho", "पढ़": "padh",
        "सुनाओ": "sunao",

        // ----- Verbs: do/make/put -----
        "करो": "karo", "कर": "kar", "करदो": "karo", "कर दो": "karo",
        "करदीजिए": "karo", "करिए": "karo", "करना": "karna",
        "करता": "karta", "करती": "karti", "करते": "karte",
        "बनाओ": "bao", "बना": "ba", "बनादो": "bao",
        "लगाओ": "lagao", "हटाओ": "hatao", "हटा": "hata",
        "मिटाओ": "mitao", "डालो": "dalo", "रखो": "rakho",
        "लाओ": "lao", "भेजो": "bhejo",

        // ----- Question words -----
        "क्या": "kya", "कैसे": "kaise", "क्यों": "kyun",
        "कहाँ": "kahan", "कहां": "kahan", "कहापर": "kahan",
        "कहाँपर": "kahan", "कहाँहै": "kahan hai",
        "कब": "kab", "कौन": "kaun", "कौनसा": "konsa",
        "कौनसी": "konsi", "कौनसे": "konse", "कितना": "kitna",
        "कितनी": "kitni", "कितने": "kitne", "किसने": "kisne",
        "किसको": "kisko", "किसका": "kiska", "किस": "kis",

        // ----- Common words -----
        "है": "hai", "हैं": "hain", "हूँ": "hoon", "हूं": "hoon",
        "था": "tha", "थी": "thi", "थे": "the",
        "होगा": "hoga", "होगी": "hogi", "होंगे": "honge",
        "रहा": "raha", "रही": "rahi", "रहे": "rahe",
        "गया": "gaya", "गई": "gayi", "गए": "gaye",
        "गयाहै": "gaya hai", "गयीहै": "gayi hai",
        "होगया": "ho gaya", "होगयी": "ho gayi", "होगये": "ho gaye",
        "होगयाहै": "ho gaya hai", "होगयीहै": "ho gayi hai",
        "नहीं": "nahi", "ना": "na", "हाँ": "haan", "हां": "haan",
        "जी": "ji", "अच्छा": "accha", "ठीक": "theek",
        "बिल्कुल": "bilkul", "ज़रूर": "zaroor", "जरूर": "zaroor",
        "मतलब": "matlab",

        // ----- Pronouns/possessives -----
        "मुझे": "mujhe", "मुझको": "mujhe", "मेरा": "mera",
        "मेरी": "meri", "मेरे": "mere", "हमें": "hume",
        "हमको": "humko", "हमारा": "hamara", "हमारी": "hamari",
        "आप": "aap", "तुम": "tum", "तुम्हारा": "tumhara",
        "तुम्हें": "tumhe", "इसे": "ise", "इसको": "isko",
        "इसका": "iska", "इसकी": "iski", "उसे": "use",
        "उसको": "usko", "वो": "wo", "वह": "wo", "ये": "ye",
        "यह": "ye", "वहाँ": "wahan", "यहाँ": "yahan",

        // ----- Time words -----
        "अभी": "abhi", "आज": "aaj", "कल": "kal", "परसों": "parso",
        "सुबह": "subah", "दोपहर": "dopahar", "शाम": "shaam",
        "रात": "raat", "रातको": "raat ko", "आजरात": "aaj raat",
        "कलसुबह": "kal subah", "कलरात": "kal raat",
        "समय": "samay", "टाइम": "time", "वक्त": "waqt",
        "बजे": "baje", "बज": "baj", "कितनेबजे": "kitne baje",
        "कितनेबजेहैं": "kitne baje hain", "कितनेबजेहै": "kitne baje hai",
        "मिनट": "minute", "मिनटका": "minute ka", "मिनटकी": "minute ki",
        "घंटा": "hour", "घंटे": "hour", "घंटेका": "hour ka",
        "सेकंड": "second", "आधा": "half",

        // ----- Connectors -----
        "और": "aur", "या": "ya", "फिर": "phir", "पर": "par",
        "लेकिन": "lekin", "मगर": "lekin", "तो": "to",
        "भी": "bhi", "ही": "hi", "से": "se", "को": "ko",
        "का": "ka", "की": "ki", "के": "ke", "ने": "ne",
        "केलिए": "ke liye", "के लिए": "ke liye",
        "केबारेमें": "ke baare mein", "के बारे में": "ke baare mein",
        "में": "mein", "परका": "par ka", "परकी": "par ki",
        "परके": "par ke", "अंदर": "andar", "बाहर": "bahar",
        "ऊपर": "upar", "नीचे": "neeche", "आगे": "aage",
        "पीछे": "peeche", "वापस": "wapas", "दोबारा": "dobara",
        "फिरसे": "phir se", "तुरंत": "turant", "जल्दी": "jaldi",
        "एक": "ek", "दो": "do", "दुसरा": "dusra", "पहला": "pehla",
        "पहली": "pehli", "दूसरी": "dusri", "आखिरी": "aakhri",

        // ----- System/domain words -----
        "मौसम": "mausam", "तापमान": "temperature", "ताप": "temperature",
        "गर्मी": "garmi", "ठंड": "thand", "बारिश": "barish",
        "हवा": "hawa", "नमी": "nami",
        "समाचार": "news", "खबर": "news", "ख़बर": "news",
        "न्यूज़": "news", "न्यूज": "news", "ताज़ा": "latest",
        "ताजा": "latest", "लेटेस्ट": "latest",
        "भाषा": "language", "आवाज़": "aawaz", "आवाज": "aawaz",
        "वॉल्यूम": "volume", "ध्वनि": "sound",
        "स्क्रीन": "screen", "स्क्रीनशॉट": "screenshot",
        "ब्राइटनेस": "brightness", "कंप्यूटर": "computer",
        "कंप्यूटरका": "computer ka", "सिस्टम": "system",
        "सिस्टमका": "system ka", "लैपटॉप": "laptop",
        "फ़ाइल": "file", "फाइल": "file", "फोल्डर": "folder",
        "फोटो": "photo", "तस्वीर": "photo", "वीडियो": "video",
        "गाना": "gana", "गाने": "gane",
        "म्यूज़िक": "music", "म्यूजिक": "music", "सॉन्ग": "song",
        "इंटरनेट": "internet", "वाईफाई": "wifi",
        "ब्लूटूथ": "bluetooth", "बैटरी": "battery",
        "रैम": "ram", "सीपीयू": "cpu", "मेमोरी": "memory",
        "स्टोरेज": "storage", "डिस्क": "disk",
        "डाउनलोड": "download", "अपलोड": "upload",
        "लिंक": "link", "पेज": "page", "टैब": "tab",
        "वेबसाइट": "website", "साइट": "site",
        "ब्राउज़र": "browser", "ब्राउजर": "browser",
        "ऐप": "app", "एप": "app", "एप्लीकेशन": "application",
        "याद": "yaad", "याददिलाओ": "remind", "याद दिलाओ": "remind",
        "रिमाइंडर": "reminder", "टाइमर": "timer",
        "अलार्म": "alarm", "लिस्ट": "list", "सूची": "list",
        "जानकारी": "information", "मदद": "help", "मददकरो": "help karo",

        // ----- Politeness/fillers -----
        "प्लीज़": "please", "प्लीज": "please", "ज़रा": "zara",
        "जरा": "zara", "कृपया": "please", "नमस्ते": "namaste",
        "नमस्कार": "namaskar", "प्रणाम": "pranam",
        "हेलो": "hello", "धन्यवाद": "thanks", "शुक्रिया": "thanks",
    };

    // ============================================================
    // 2. ENTITY TRANSLITERATION (brands, cities, tech terms)
    // ============================================================

    const ENTITY_MAP = {
        // Websites/brands
        "यूट्यूब": "youtube", "यूटुब": "youtube", "उट्यूब": "youtube",
        "गूगल": "google", "गुगल": "google", "गूगलपर": "google par",
        "जीमेल": "gmail", "फेसबुक": "facebook", "इंस्टाग्राम": "instagram",
        "इंस्टा": "insta", "व्हाट्सएप": "whatsapp", "वाट्सएप": "whatsapp",
        "ट्विटर": "twitter", "लिंकडिन": "linkedin",
        "गिटहब": "github", "रेडिट": "reddit",
        "नेटफ्लिक्स": "netflix", "स्पॉटिफ़ाई": "spotify",
        "स्पॉटिफाई": "spotify", "अमेज़न": "amazon", "अमेजन": "amazon",
        "फ्लिपकार्ट": "flipkart", "विकिपीडिया": "wikipedia",
        "विकीपीडिया": "wikipedia",
        "क्रोम": "chrome", "एज": "edge", "फ़ायरफ़ॉक्स": "firefox",
        "फायरफॉक्स": "firefox", "ब्रेव": "brave", "ओपेरा": "opera",
        "चैटजीपीटी": "chatgpt", "ओपनएआई": "openai",
        "माइक्रोसॉफ्ट": "microsoft", "एंड्रॉइड": "android",
        "आईफोन": "iphone", "विंडोज़": "windows", "विंडोज": "windows",
        "लिनक्स": "linux", "उबंटू": "ubuntu",
        "माइनक्राफ्ट": "minecraft",

        // Apps
        "वीएसकोड": "vscode", "विएसकोड": "vscode",
        "नोटपैड": "notepad", "कैलकुलेटर": "calculator",
        "कैल्कुलेटर": "calculator", "पेंट": "paint",
        "टेलीग्राम": "telegram", "डिस्कॉर्ड": "discord",
        "स्काइप": "skype", "ज़ूम": "zoom", "जूम": "zoom",
        "स्लैक": "slack", "टीम्स": "teams", "स्टीम": "steam",
        "एक्सेल": "excel", "वर्ड": "word", "पावरपॉइंट": "powerpoint",
        "आउटलुक": "outlook", "टास्कमैनेजर": "task manager",
        "कमांडप्रॉम्प्ट": "cmd", "कमांड प्रॉम्प्ट": "cmd",
        "पावरशेल": "powershell", "टर्मिनल": "terminal",
        "एक्सप्लोरर": "explorer", "सेटिंग्स": "settings",
        "सेटिंग": "settings",

        // Indian cities
        "दिल्ली": "delhi", "मुंबई": "mumbai", "बॉम्बे": "mumbai",
        "बंगलौर": "bangalore", "बेंगलुरु": "bangalore",
        "कोलकाता": "kolkata", "चेन्नई": "chennai", "मद्रास": "chennai",
        "हैदराबाद": "hyderabad", "पुणे": "pune", "अहमदाबाद": "ahmedabad",
        "जयपुर": "jaipur", "लखनऊ": "lucknow", "कानपुर": "kanpur",
        "नागपुर": "nagpur", "इंदौर": "indore", "भोपाल": "bhopal",
        "पटना": "patna", "सूरत": "surat", "वाराणसी": "varanasi",
        "बनारस": "varanasi", "आगरा": "agra", "अमृतसर": "amritsar",
        "चंडीगढ़": "chandigarh", "देहरादून": "dehradun",
        "शिमला": "shimla", "गोआ": "goa", "रायपुर": "raipur",
        "रांची": "ranchi", "गुड़गांव": "gurgaon", "गुरुग्राम": "gurgaon",
        "नोएडा": "noida", "फरीदाबाद": "faridabad",

        // World cities
        "लंदन": "london", "टोक्यो": "tokyo", "पेरिस": "paris",
        "न्यूयॉर्क": "new york", "दुबई": "dubai", "सिंगापुर": "singapore",
        "सिडनी": "sydney", "बर्लिन": "berlin", "टोरंटो": "toronto",
        "शिकागो": "chicago", "मॉस्को": "moscow", "बीजिंग": "beijing",

        // Countries
        "भारत": "india", "इंडिया": "india", "हिंदुस्तान": "india",
        "अमेरिका": "america", "यूएसए": "usa", "इंग्लैंड": "england",
        "जापान": "japan", "चीन": "china", "रूस": "russia",
        "जर्मनी": "germany", "फ्रांस": "france", "ऑस्ट्रेलिया": "australia",
        "कनाडा": "canada", "नेपाल": "nepal",

        // Currencies
        "रुपया": "rupee", "रुपये": "rupees", "रुपए": "rupees",
        "डॉलर": "dollar", "डालर": "dollar", "यूरो": "euro",
        "पाउंड": "pound", "येन": "yen",

        // Tech terms
        "सर्वर": "server", "डेटाबेस": "database", "कोड": "code",
        "कोडिंग": "coding", "प्रोग्रामिंग": "programming",
        "रोबोट": "robot", "मॉडल": "model", "डेटा": "data",
    };

    // ============================================================
    // 3. CHARACTER-LEVEL DEVANAGARI→ROMAN (fallback)
    // ============================================================

    const CONSONANTS = {
        "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "ng",
        "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "ny",
        "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
        "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
        "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
        "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh",
        "ष": "sh", "स": "s", "ह": "h", "ळ": "l",
        "क्ष": "ksh", "ज्ञ": "gy", "श्र": "shr",
    };

    const MATRAS = {
        "ा": "a", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo",
        "ृ": "ri", "े": "e", "ै": "ai", "ो": "o", "ौ": "au",
        "ं": "n", "ँ": "n", "ः": "h", "्": "", "़": "",
    };

    const VOWELS = {
        "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u",
        "ऊ": "oo", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au",
    };

    const DIGITS = {
        "०": "0", "१": "1", "२": "2", "३": "3", "४": "4",
        "५": "5", "६": "6", "७": "7", "८": "8", "९": "9",
    };

    function transliterateChar(text) {
        let result = "";
        let i = 0;
        while (i < text.length) {
            const ch = text[i];
            const two = ch + (text[i + 1] || "");
            if (CONSONANTS[two]) {
                result += CONSONANTS[two];
                i += 2;
                continue;
            }
            if (CONSONANTS[ch]) {
                result += CONSONANTS[ch];
                const following = text[i + 1];
                if (!following || (!MATRAS[following] && following !== "्")) {
                    result += "a";
                }
                i++;
                continue;
            }
            if (MATRAS[ch]) { result += MATRAS[ch]; i++; continue; }
            if (VOWELS[ch]) { result += VOWELS[ch]; i++; continue; }
            if (DIGITS[ch]) { result += DIGITS[ch]; i++; continue; }
            if (ch === "।") { result += "."; i++; continue; }
            result += ch;
            i++;
        }
        return result;
    }

    // ============================================================
    // 4. MAIN TRANSLITERATION
    // ============================================================

    function hasDevanagari(text) {
        return /[\u0900-\u097F]/.test(String(text || ""));
    }

    function transliterate(input) {
        const text = String(input || "").trim();
        if (!text) return text;
        if (!hasDevanagari(text)) return text;

        const tokens = text.split(/(\s+)/);
        const out = [];

        for (const token of tokens) {
            if (/^\s+$/.test(token)) { out.push(token); continue; }

            const bare = token.replace(/[।.,!?;:]+$/g, "");
            const punct = token.slice(bare.length);

            if (WORD_MAP[bare]) { out.push(WORD_MAP[bare] + punct); continue; }
            if (ENTITY_MAP[bare]) { out.push(ENTITY_MAP[bare] + punct); continue; }
            if (hasDevanagari(bare)) {
                out.push(transliterateChar(bare) + punct);
                continue;
            }
            out.push(token);
        }

        return out.join("").replace(/\s+/g, " ").trim();
    }

    // ============================================================
    // 5. ROMAN VARIANT NORMALIZATION
    // ============================================================

    const ROMAN_VARIANTS = {
        "khol do": "kholo", "kholna": "kholo", "khol": "kholo",
        "kardo": "karo", "kar do": "karo", "krdo": "karo", "kro": "karo",
        "btao": "batao", "bata do": "batao", "batado": "batao",
        "dikhado": "dikhao", "dikha do": "dikhao",
        "dhundo": "dhoondo",
        "band kar do": "band karo", "bandkaro": "band karo",
        "chalwa do": "chalao",
    };

    function normalizeRoman(input) {
        let text = String(input || "").trim().toLowerCase();
        const entries = Object.entries(ROMAN_VARIANTS)
            .sort((a, b) => b[0].length - a[0].length);
        for (const [variant, canonical] of entries) {
            text = text.replace(
                new RegExp(`\\b${variant.replace(/ /g, "\\s+")}\\b`, "g"),
                canonical
            );
        }
        return text.replace(/\s+/g, " ").trim();
    }

    // Full pipeline: any language → canonical roman
    function toCanonical(input) {
        let text = String(input || "").trim();
        if (!text) return text;
        text = transliterate(text);
        text = normalizeRoman(text);
        return text;
    }

    // ============================================================
    // 6. EXPORT
    // ============================================================

    window.JARVISHindiTranslit = Object.freeze({
        version: "HT-V1",
        hasDevanagari,
        transliterate,
        transliterateChar,
        normalizeRoman,
        toCanonical,
        WORD_MAP,
        ENTITY_MAP,
    });

    console.log("🔤 JARVIS Hindi Transliteration HT-V1 READY");

})();
