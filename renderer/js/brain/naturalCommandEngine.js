"use strict";

/*
 * JARVIS PRO MAX — Natural Command Engine
 *
 * Offline-first, deterministic NLU layer for typed commands and STT text.
 * No cloud/AI calls. Uses reusable intent scoring + entity extraction and
 * routes live-data intents through the existing secure window.jarvis.data
 * bridge. Existing browser/Brain/agent systems remain available as fallback.
 */

(function () {
    const VERSION = "NCE-V1";
    let awaitingAlarmTime = false;
    let lastOpenedApp = "";
    let lastOpenedQuery = "";

    const APP_ALIASES = {
        // Browsers
        chrome: ["chrome", "google chrome"],
        edge: ["edge", "microsoft edge"],
        firefox: ["firefox", "mozilla firefox", "fire fox"],
        brave: ["brave", "brave browser"],
        opera: ["opera", "opera browser"],

        // Dev tools
        vscode: ["vscode", "vs code", "visual studio code", "code editor"],
        "notepad++": ["notepad++", "notepad plus plus", "notepadpp"],
        "git bash": ["git bash", "gitbash"],
        cmd: ["cmd", "command prompt"],
        terminal: ["terminal", "windows terminal", "wt"],
        "microsoft store": ["microsoft store", "windows store"],
        powershell: ["powershell", "power shell"],

        // Office / productivity
        word: ["word", "ms word", "microsoft word"],
        excel: ["excel", "ms excel", "microsoft excel"],
        powerpoint: ["powerpoint", "power point", "ms powerpoint", "microsoft powerpoint"],
        ppt: ["ppt", "ppt app", "ppt plus", "ppt plus plus", "ppt++", "ppt +"],
        clock: ["clock", "windows clock", "alarm app", "alarms app"],
        outlook: ["outlook", "ms outlook", "microsoft outlook"],
        gemini: ["gemini", "gemini desktop", "google gemini desktop"],
        teams: ["teams", "microsoft teams", "ms teams"],
        onenote: ["onenote", "one note"],

        // Built-in Windows apps
        notepad: ["notepad", "note pad"],
        calculator: ["calculator", "calc"],
        explorer: ["explorer", "file explorer", "windows explorer", "file manager"],
        settings: ["settings", "windows settings", "system settings"],
        paint: ["paint", "ms paint", "microsoft paint"],
        "task manager": ["task manager", "taskmanager"],
        "control panel": ["control panel", "controlpanel"],
        camera: ["camera", "windows camera"],
        photos: ["photos", "windows photos"],
        "snipping tool": ["snipping tool", "snip tool", "screenshot tool"],
        mail: ["mail", "windows mail"],
        calendar: ["calendar", "windows calendar"],

        // Communication
        discord: ["discord", "discord app"],
        whatsapp: ["whatsapp", "whatsapp desktop", "whatsapp app"],
        telegram: ["telegram", "telegram desktop"],
        skype: ["skype", "skype app"],
        slack: ["slack", "slack app"],
        zoom: ["zoom", "zoom app"],

        // Media / entertainment
        spotify: ["spotify", "spotify app"],
        vlc: ["vlc", "vlc player", "vlc media player"],
        "media player": ["media player", "windows media player", "wmp"],
        steam: ["steam", "steam app"],
        obs: ["obs", "obs studio"],
        "sql launcher": ["sql launcher", "sql launcher app"],
        sklauncher: ["sklauncher", "sk launcher", "s k launcher", "sk लॉन्चर", "sk लांचर", "एसके लॉन्चर", "एस के लॉन्चर", "एसकेल लॉन्चर"],
        minecraft: ["minecraft", "minecraft launcher", "माइनक्राफ्ट", "माइनक्राफ्ट लॉन्चर"],
        "league of legends": ["league of legends", "league", "lee"],

        // Other
        "github desktop": ["github desktop", "github app"]
    };

    const CURRENCY_ALIASES = {
        usd: "USD", dollar: "USD", dollars: "USD", "$": "USD",
        inr: "INR", rupee: "INR", rupees: "INR", rupay: "INR", rupaye: "INR", "₹": "INR",
        eur: "EUR", euro: "EUR", euros: "EUR",
        gbp: "GBP", pound: "GBP", pounds: "GBP",
        jpy: "JPY", yen: "JPY", yens: "JPY",
        aud: "AUD", cad: "CAD", chf: "CHF", cny: "CNY", aed: "AED", sgd: "SGD"
    };

    const KNOWN_POKEMON = new Set([
        "pikachu", "charizard", "mewtwo", "bulbasaur", "ivysaur", "venusaur", "charmander",
        "squirtle", "wartortle", "blastoise", "eevee", "snorlax", "gengar", "lucario",
        "greninja", "gyarados", "jigglypuff", "meowth", "psyduck", "ditto", "mew"
    ]);

    const KNOWN_LANDMARKS = ["india gate", "taj mahal", "new delhi", "red fort", "qutub minar", "gateway of india", "eiffel tower", "statue of liberty"];

    const KNOWN_SHOWS = [
        "breaking bad", "stranger things", "game of thrones", "house of the dragon",
        "the boys", "the office", "friends", "dark", "money heist", "squid game",
        "wednesday", "peaky blinders", "better call saul", "one piece"
    ];

    function normalize(input) {
        let text = String(input || "").normalize("NFKC").toLowerCase().trim();
        text = text.replace(/^(?:hey|okay|ok)?\s*jarvis[\s,:-]*/i, "");
        text = text.replace(/[०-९]/g, (digit) => String(digit.charCodeAt(0) - 0x0966));
        text = text.replace(/[“”‘’]/g, "'");
        // Keep Unicode combining marks (especially Hindi vowel signs/nukta)
        // attached to their letters so Devanagari commands remain parseable.
        text = text.replace(/[^\p{L}\p{M}\p{N}\s.$₹-]/gu, " ");
        text = text.replace(/\s+/g, " ").trim();
        // Whisper/Saaras can phoneticize common Hindi presentation words in
        // Roman script. Canonicalize only these high-confidence variants so
        // the existing presentation route receives the same intent as typed
        // Hinglish. Keep the caller's original utterance in `originalText` and
        // `entities.userRequest` for generation and diagnostics.
        text = text
            .replace(/\b(?:peepeetee|peepitee|peepti|peepee?tee)\b/giu, "ppt")
            .replace(/\bachchhee\b/giu, "achhi")
            .replace(/\bbao\b/giu, "banao")
            .replace(/\busamen\b/giu, "usmein")
            .replace(/\bbut\s+saree\b/giu, "bahut saari")
            .replace(/\bimejes\b/giu, "images")
            .replace(/\blagan\b/giu, "lagana")
            .replace(/\bjanaret\b|\bjanret\b/giu, "generate")
            .replace(/\besake\b/giu, "sklauncher")
            .replace(/जनरेट/gu, "generate");
        return text;
    }

    function parseComputerUseCommand(text) {
        const value = String(text || "").trim();
        const accessAlias = /(?:access\s*(?:os|mode)?|axis\s*os|aksis\s*os|ek\s*sis\s*os|autopilot\s*(?:mode)?|जार्विस\s*ऑटोपायलट\s*(?:मोड)?|एक्सेसोस|एक्सिस\s*(?:ओएस|मोड)?|एसिस\s*(?:ओएस|मोड)?|ऐक्सेस\s*(?:ओएस|मोड)?)/iu;
        if (accessAlias.test(value) && /(?:pause|hold|wait|रुको|ठहरो|पॉज़|पॉज)/iu.test(value)) return { action: "access-pause" };
        if (accessAlias.test(value) && /(?:resume|continue|फिर\s+से|जारी|जारी\s+रखो|दोबारा\s+चालू)/iu.test(value)) return { action: "access-resume" };
        if (accessAlias.test(value) && /(?:start|enable|turn\s+on|activate|open|on|चालू|शुरू|खोल(?:ो|ना)?)/iu.test(value)) return { action: "access-start" };
        if (accessAlias.test(value) && /(?:stop|disable|turn\s+off|off|deactivate|बंद|रोक|बन्द)/iu.test(value)) return { action: "access-stop" };
        if (/^(?:start|enable|turn on|activate)\s+(?:computer\s+use|computer\s+control|desktop\s+control)|^(?:कंप्यूटर|डेस्कटॉप)\s+(?:कंट्रोल|कंट्रोल मोड)\s+(?:शुरू|चालू)/iu.test(value)) return { action: "start" };
        if (/^(?:stop|disable|turn off|deactivate|emergency stop)\s+(?:computer\s+use|computer\s+control|desktop\s+control)|^(?:कंप्यूटर|डेस्कटॉप)\s+(?:कंट्रोल|कंट्रोल मोड)\s+(?:बंद|रोक)/iu.test(value)) return { action: "stop" };
        if (/^(?:next|move to next|अगला|अगले)\s+(?:button|field|control|बटन|फील्ड|कंट्रोल)?$/iu.test(value)) return { action: "pressKey", params: { key: "TAB" } };
        if (/^(?:go back|back|पीछे जाओ|वापस जाओ)$/iu.test(value)) return { action: "hotkey", params: { keys: ["ALT", "LEFT"] } };
        if (/^(?:go forward|forward|next page|आगे जाओ|अगले पेज पर जाओ)$/iu.test(value)) return { action: "hotkey", params: { keys: ["ALT", "RIGHT"] } };
        if (/^(?:reload|refresh|page refresh|रीलोड|रिफ्रेश)$/iu.test(value)) return { action: "hotkey", params: { keys: ["CTRL", "R"] } };
        if (/^(?:zoom in|make it bigger|बड़ा करो|ज़ूम करो|जूम करो)$/iu.test(value)) return { action: "hotkey", params: { keys: ["CTRL", "PLUS"] } };
        if (/^(?:zoom out|make it smaller|छोटा करो)$/iu.test(value)) return { action: "hotkey", params: { keys: ["CTRL", "MINUS"] } };
        if (/^(?:reset zoom|zoom reset|ज़ूम रीसेट|जूम रीसेट)$/iu.test(value)) return { action: "hotkey", params: { keys: ["CTRL", "0"] } };
        const semanticClick = value.match(/^(?:click|tap|select|choose|press|ढूंढकर\s+क्लिक|क्लिक\s+करो|क्लिक)\s+(?:the\s+|उस\s+|उसके\s+)?(.+?)(?:\s+button|\s+पर|\s+पे)?$/iu)
            || value.match(/^(.+?)(?:\s+button)?\s+(?:पर\s+)?(?:click|tap|select|choose|क्लिक|क्लिक\s+करो)$/iu);
        if (semanticClick && semanticClick[1]) {
            const target = semanticClick[1].trim().replace(/\s+button$/iu, "").trim();
            if (target.length >= 2 && target.length <= 120 && !/^(?:open|launch|start)\s+(?:the\s+)?(?:app|browser|website)$/iu.test(target)) {
                return { action: "locateClick", params: { target } };
            }
        }
        const coordinates = value.match(/(?:at|on|पर|पे)\s*(\d{1,5})\s*[, ]\s*(\d{1,5})/iu);
        const dragCoordinates = value.match(/(?:from|से)\s*(\d{1,5})\s*[, ]\s*(\d{1,5})\s+(?:to|तक)\s*(\d{1,5})\s*[, ]\s*(\d{1,5})/iu);
        const typeMatch = value.match(/^(?:computer\s+)?(?:type|write(?!\s+(?:me|a|an|the|study|guide|document|notes)\b)|टाइप|लिखो)\s+(?:text\s+)?["“]?(.+?)["”]?$/iu);
        if (typeMatch && typeMatch[1]) return { action: "typeText", params: { text: typeMatch[1].trim() } };
        const hasControlWord = /\b(?:computer|desktop|mouse|screen|कंप्यूटर|डेस्कटॉप|माउस|स्क्रीन)\b/iu.test(value);
        if (dragCoordinates && /\bdrag|खींच/iu.test(value)) return { action: "drag", params: { x: Number(dragCoordinates[1]), y: Number(dragCoordinates[2]), x2: Number(dragCoordinates[3]), y2: Number(dragCoordinates[4]) } };
        if (!hasControlWord && !coordinates) return null;
        if (coordinates && /\bdouble\s*click|\bdbl\b|डबल\s*क्लिक/iu.test(value)) return { action: "doubleClick", params: { x: Number(coordinates[1]), y: Number(coordinates[2]) } };
        if (coordinates && /\bright\s*click|राइट\s*क्लिक/iu.test(value)) return { action: "rightClick", params: { x: Number(coordinates[1]), y: Number(coordinates[2]) } };
        if (coordinates && /\b(?:click|tap)|क्लिक|टैप/iu.test(value)) return { action: "click", params: { x: Number(coordinates[1]), y: Number(coordinates[2]) } };
        if (/\bscroll\s+(?:down|below)|नीचे\s+स्क्रोल/iu.test(value)) return { action: "scroll", params: { x: Number(coordinates?.[1] || 500), y: Number(coordinates?.[2] || 400), delta: -700 } };
        if (/\bscroll\s+(?:up|above)|ऊपर\s+स्क्रोल/iu.test(value)) return { action: "scroll", params: { x: Number(coordinates?.[1] || 500), y: Number(coordinates?.[2] || 400), delta: 700 } };
        const keyMatch = value.match(/^(?:computer\s+)?(?:press|hit|दबाओ|प्रेस)\s+(?:the\s+)?([a-z0-9]+)$/iu);
        if (keyMatch) return { action: "pressKey", params: { key: keyMatch[1] } };
        return null;
    }

    function parseTaskMemoryCommand(text) {
        const value = String(text || "").trim();
        if (/^(?:repeat|rerun|run|do)\s+(?:the\s+)?(?:last|previous)\s+(?:task|workflow)(?:\s+again)?$|^(?:do|run)\s+(?:that|it)\s+again$|^पिछला\s+(?:काम|टास्क)\s+(?:फिर|दोबारा)(?:\s+से)?\s+करो(?:\s+दो)?$|^पिछला\s+(?:काम|टास्क)\s+(?:फिर|दोबारा)(?:\s+से)?\s+करना$/iu.test(value)) {
            return { action: "replay-last" };
        }
        if (/^(?:what did you do|show|list)\s+(?:the\s+)?(?:last|recent)\s+(?:task|workflow)|(?:पिछले|आखिरी)\s+(?:काम|टास्क)\s+बताओ/iu.test(value)) {
            return { action: "show" };
        }
        if (/^(?:forget|remove|clear)\s+(?:the\s+)?(?:last|previous)\s+(?:task|workflow)|(?:आखिरी|पिछला)\s+(?:काम|टास्क)\s+भूल\s+जाओ/iu.test(value)) {
            return { action: "forget-last" };
        }
        return null;
    }

    function parseFoundationCommand(text) {
        const value = String(text || "").trim();
        const save = value.match(/^(?:save|remember|store)\s+(?:this|the\s+last|last|current)\s+(?:workflow|task)(?:\s+as\s+|\s+नाम\s+से\s+)(.+)$/iu)
            || value.match(/^(?:इस|पिछले|आखिरी)\s+(?:workflow|काम|टास्क)\s+(?:को\s+)?(.+?)\s+नाम\s+से\s+(?:save|सेव)\s+(?:करो|कर\s+दो)$/iu);
        if (save?.[1]) return { kind: "workflow", action: "save", name: save[1].trim().replace(/["“”]/g, "").slice(0, 80) };
        if (/^(?:show|list|what are|बताओ|दिखाओ)\s+(?:my\s+|saved\s+|the\s+)?(?:saved\s+)?(?:workflows|recipes|workflow recipes|सेव्ड workflow|saved workflow)/iu.test(value)) {
            return { kind: "workflow", action: "list" };
        }
        const run = value.match(/^(?:run|replay|start|चलाओ|चलाओ\s+मेरा)\s+(?:workflow|recipe|काम)\s+(.+)$/iu);
        if (run?.[1]) return { kind: "workflow", action: "run", name: run[1].trim().replace(/["“”]/g, "").slice(0, 80) };
        const mode = value.match(/(?:set|change|switch|use|करो|रखो|बदलकर)\s+(?:permission\s+)?(?:profile|mode|permission\s+mode)?\s*(safe|trusted|restricted|सेफ|ट्रस्टेड|रिस्ट्रिक्टेड)/iu)
            || value.match(/(?:permission|अनुमति)\s+(?:profile|mode|मोड|प्रोफाइल)\s*(?:को\s*)?(safe|trusted|restricted|सेफ|ट्रस्टेड|रिस्ट्रिक्टेड)/iu);
        if (mode?.[1]) return { kind: "permission", action: "set", profile: mode[1].toLowerCase() };
        if (/(?:what is|show|tell me|बताओ|क्या है).*(?:permission|अनुमति).*(?:mode|profile|मोड|प्रोफाइल)|(?:permission|अनुमति).*(?:mode|profile|मोड|प्रोफाइल).*(?:status|स्थिति|क्या)/iu.test(value)) {
            return { kind: "permission", action: "status" };
        }
        return null;
    }

    function parseVoiceEngineMigrationCommand(text) {
        const value = String(text || "").trim();
        const mentionsMigration = /(?:switch|change|replace|use|install|हटा(?:के|कर)?|बदल(?:कर|के)?|लगा(?:कर|के)?|यूज़|इस्तेमाल)/iu.test(value);
        const mentionsWhisper = /\bwhisper\b|व्हिस्पर/iu.test(value);
        const mentionsVosk = /\bvosk\b|वॉस्क|वोसक/iu.test(value);
        const asksStatus = /(?:voice\s+engine|speech\s+engine).*(?:status|स्थिति)|(?:status|स्थिति).*(?:voice|speech)/iu.test(value);
        if (asksStatus) return { action: "status" };
        if (mentionsMigration && mentionsWhisper && mentionsVosk) {
            return { action: "migrate", from: "whisper", target: "vosk", approvalRequired: true };
        }
        return null;
    }

    function parseGenericChangeCommand(text) {
        const value = String(text || "").trim();
        const match = value.match(/^(?:please\s+|jarvis\s+)?(?:remove|uninstall|delete)\s+(.+?)\s+(?:and\s+|और\s+)?(?:लगा|install|add|use|replace\s+with|बदल\s+कर)\s+(.+?)(?:\s+(?:करो|कर\s+दो|do|please))?$/iu)
            || value.match(/^(?:please\s+|jarvis\s+)?(.+?)\s+(?:हटा\s*(?:के|कर)?|remove|uninstall|delete)\s+(?:and\s+|और\s+)?(?:यह|this|that)?\s*(?:लगा|install|add|use|replace\s+with|बदल\s+कर)\s+(.+?)(?:\s+(?:करो|कर\s+दो|do|please))?$/iu)
            || value.match(/^(?:switch|replace|change|बदल(?:ो|ना)?|बदलो)\s+(?:from\s+)?(.+?)\s+(?:to|with|से|को)\s+(.+)$/iu);
        if (!match) return null;
        const from = String(match[1] || "").trim();
        const to = String(match[2] || "").trim();
        if (from.length < 2 || to.length < 2 || from.length > 80 || to.length > 80) return null;
        if (/^(?:the|this|it|system|jarvis)$/iu.test(from) || /^(?:the|this|it|system|jarvis)$/iu.test(to)) return null;
        return { action: "plan", from, to, request: value, approvalRequired: true };
    }

    function parsePhotoOrganizerCommand(text) {
        const value = String(text || "").trim();
        const hasPhoto = /\b(?:photo|photos|image|images|picture|pictures)\b|फोटो|तस्वीर|इमेज/iu.test(value);
        const hasMatch = /\b(?:match|matching|similar|same|find|देखो|मिलती|मिलती-जुलती|जैसी|जैसे)\b|मिलान/iu.test(value);
        const hasFolder = /\b(?:folder|directory|album)\b|फोल्डर|अलग\s+फोल्डर/iu.test(value);
        if (!hasPhoto || !hasMatch || !hasFolder) return null;
        const folder = value.match(/(?:named|called|name\s+it|नाम\s+(?:से|का|रखकर)|नाम)\s+["“]?([^"”]+?)["”]?(?:\s+folder|\s+फोल्डर|$)/iu)?.[1]?.trim() || "Matched Photos";
        return { action: "preview", folderName: folder.slice(0, 80), approvalRequired: true, identityInference: false };
    }

    function parseFileOperationsCommand(text) {
        const value = String(text || "").trim();
        const desktopImages = /(?:desktop|डेस्कटॉप)/iu.test(value) && /(?:folder|directory|फोल्डर)/iu.test(value) && /(?:images?|photos?|pictures?|इमेज(?:ेस)?|फोटो|तस्वीर(?:ें)?)/iu.test(value);
        if (desktopImages) {
            const named = value.match(/(?:named|called|name\s+it|नाम\s+(?:से|का|रखकर)|नाम)\s+["“]?([^"”]+?)["”]?(?:\s+folder|\s+फोल्डर|$)/iu);
            const possessive = value.match(/([\p{L}\p{N}][\p{L}\p{N} _-]{0,50}?)\s+(?:के\s+नाम\s+से|का\s+नाम|की\s+नाम)\s+(?:एक\s+)?(?:folder|फोल्डर)/iu);
            const folderName = (named?.[1] || possessive?.[1] || "Nakul").trim().replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").slice(0, 60) || "Nakul";
            return { action: "desktop-organize-images", folderName, approvalRequired: true, mode: "copy" };
        }
        if (/(?:downloads?|डाउनलोड).*(?:delete|remove|clear|साफ|डिलीट|हटा)|(?:delete|remove|clear|साफ|डिलीट|हटा).*(?:downloads?|डाउनलोड)/iu.test(value)) {
            const preserve = /(?:except|छोड़कर|बिना).*(?:minecraft|sklauncher|launcher)/iu.test(value) ? ["minecraft launcher", "sklauncher"] : [];
            return { action: "downloads-cleanup", preserveNames: preserve, approvalRequired: true };
        }
        const backup = value.match(/(?:backup|बैकअप).*(?:drive|disk|डिस्क)\s*([a-z])\s*(?:to|में|पर|से)\s*(?:drive|disk|डिस्क)\s*([a-z])/iu);
        if (backup) return { action: "backup-plan", sourceDrive: `${backup[1].toUpperCase()}:\\`, destinationDrive: `${backup[2].toUpperCase()}:\\`, approvalRequired: true };
        if (/(?:label|tag|किसकी\s+(?:फोटो|तस्वीर)|नाम\s+(?:लिखो|लिख\s+दो|दे\s+दो)).*(?:photo|photos|फोटो|तस्वीर)|(?:photo|photos|फोटो|तस्वीर).*(?:किसकी\s+है|label\s+(?:it|them)|tag\s+(?:it|them))/iu.test(value)) return { action: "photo-label", approvalRequired: true };
        return null;
    }

    function parseCreateFolderCommand(text) {
        const value = String(text || "").trim();
        if (!/(?:create|make|new|bana(?:o|do|de|dena)?|banao|बना(?:ओ|ना)?|बनाकर|बन\s+दो|बनाओ)/iu.test(value) || !/(?:folder|directory|फोल्डर|डायरेक्टरी)/iu.test(value)) return null;
        const nameValue = value.replace(/(?:desktop|डेस्कटॉप|downloads?|डाउनलोड|documents?|डॉक्यूमेंट)\s*(?:पर|में|पे|in|on)?/iu, " ");
        const nameMatch = value.match(/(?:folder|directory|फोल्डर|डायरेक्टरी)\s+(?:named?|called|name(?:\s+it)?|का\s+नाम|के\s+नाम\s+से|नाम\s+से)\s+["“]?([^"”]+?)(?=\s+(?:on|in)\s+(?:your\s+)?(?:desktop|downloads?|documents?|डेस्कटॉप|डाउनलोड|डॉक्यूमेंट)\s*$|\s*$)["”]?\s*$/iu)
            || value.match(/["“]([^"”]+)["”]\s*(?:का\s+)?(?:folder|फोल्डर)/iu)
            || nameValue.match(/(?:^|\s)([^\r\n]{1,60}?)\s+(?:के\s+नाम\s+से|का\s+नाम|नाम\s+का|के\s+नाम\s+का|naam\s+ka|naam\s+se)\s+(?:एक\s+)?(?:folder|directory|फोल्डर|डायरेक्टरी)/iu)
            || value.match(/(?:folder|directory|फोल्डर|डायरेक्टरी)\s+(?:का\s+नाम|नाम)\s+["“]?([^"”]+?)["”]?\s*$/iu);
        if (!nameMatch?.[1]) return null;
        const folderName = nameMatch[1].trim().replace(/^(?:desktop|डेस्कटॉप|downloads?|डाउनलोड|documents?|डॉक्यूमेंट)\s*(?:पर|में|पे|in|on)?\s*/iu, "").replace(/\s+(?:on|in)\s+(?:your\s+)?(?:desktop|downloads?|documents?|डेस्कटॉप|डाउनलोड|डॉक्यूमेंट)\s*$/iu, "").replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").slice(0, 60);
        if (!folderName || /^(?:a|an|the|एक|एक\s+नया)$/iu.test(folderName)) return null;
        const location = /downloads?|डाउनलोड/iu.test(value) ? "downloads" : /documents?|डॉक्यूमेंट/iu.test(value) ? "documents" : "desktop";
        return { action: "create-folder", folderName, location };
    }

    function parsePCDoctorCommand(text) {
        const value = String(text || "").trim();
        const doctor = /(?:pc|computer|system|कंप्यूटर|पीसी|सिस्टम).*(?:doctor|diagnos|health|problem|issue|समस्या|जांच|चेक)|(?:doctor|diagnos|health|समस्या|जांच|चेक).*(?:pc|computer|system|कंप्यूटर|पीसी|सिस्टम)/iu.test(value)
            || /smart\s*pc\s*doctor|स्मार्ट\s*पीसी\s*डॉक्टर/iu.test(value);
        if (!doctor) return null;
        if (/(?:apply|run|do|लागू|अप्लाई|ठीक|fix).*(?:safe|approved|सुरक्षित|फिक्स)|(?:safe|approved|सुरक्षित).*(?:fix|फिक्स|लागू)/iu.test(value)) return { action: "apply-safe" };
        if (/(?:status|report|रिपोर्ट|स्थिति|क्या मिला)/iu.test(value)) return { action: "status" };
        return { action: "scan" };
    }

    function parseMinecraftWorldFlow(text) {
        const value = String(text || "").trim();
        const mentionsLauncher = /(?:\b(?:sk\s*launcher|sklauncher)\b|एसके\s*लॉन्चर|एसकेएल\s*लॉन्चर)/iu.test(value);
        const mentionsMinecraft = /(?:\bminecraft\b|माइनक्राफ्ट)/iu.test(value);
        const firstSurvival = /(?:first|1st|pehla|pehli|पहला|पहली)\b.{0,70}(?:survival\b.{0,20}(?:world|var.{0,3}l)|(?:world|var.{0,3}l))|survival\s+(?:world|var.{0,3}l)?\s*(?:number\s+)?(?:one|1|first|pehla|पहला)|पहला\s+survival\s+(?:world|वर्ल्ड)/iu.test(value);
        const joinWorld = /\b(?:join|j.{0,2}in|open|load|enter|play)\b.{0,70}\b(?:world|survival|var.{0,3}l)\b|\b(?:world|survival|var.{0,3}l)\b.{0,70}\b(?:join|j.{0,2}in|open|load|enter|play)\b|जॉइन|जुड़ो|खोलो|चलाओ/iu.test(value);
        if (mentionsMinecraft && firstSurvival && joinWorld) return { launcher: mentionsLauncher ? "named" : "auto", game: "minecraft", world: "first-survival" };
        return null;
    }

    function parseMinecraftLaunchFlow(text) {
        const value = String(text || "").trim();
        const mentionsMinecraft = /(?:\bminecraft\b|माइनक्राफ्ट)/iu.test(value);
        const launchVerb = /\b(?:open|launch|start|run|play|load|khol(?:o|na|ne)?|chalao|chala\s*do)\b|खोल(?:ो|ना|ने)?|चल(?:ाओ|ाना)|लॉन्च|ओपन/iu.test(value);
        const asksForWorld = /(?:world|survival|join|first|pehla|पहला|जॉइन|जुड़ो)/iu.test(value);
        if (mentionsMinecraft && launchVerb && !asksForWorld) return { launcher: "auto", game: "minecraft", mode: "launch" };
        return null;
    }

    function parseAppTaskFlow(text) {
        const value = String(text || "").trim();
        const hindiSearchCopy = value.match(/^(.+?)\s+(?:खोल(?:ो|कर|के)?|ओपन\s+करो|khol(?:o|kar|ke)?)\s+(.+?)\s+(?:search|सर्च|खोज)\s*(?:करो|करके|karo|karke)?\s+(?:और\s+)?(?:पहले|पहला|first|top)\s+(?:result|रिजल्ट|नतीजे?)\s+(?:का\s+)?(?:text|टेक्स्ट)\s+(?:copy|कॉपी)\s*(?:करो|कर\s+दो|karo|kar\s+do)?$/iu);
        if (hindiSearchCopy) {
            const app = String(hindiSearchCopy[1] || "").trim();
            const query = String(hindiSearchCopy[2] || "").trim();
            if (!app || !query || app.length > 100 || query.length > 120) return null;
            return { app, query, action: "searchCopyFirst", approvalRequired: true };
        }
        const searchCopy = value.match(/^(?:open|launch|start)\s+(.+?)\s+(?:and\s+)?(?:search|find)(?:\s+for)?\s+(.+?)\s+(?:and\s+)?copy\s+(?:the\s+)?(?:text\s+of\s+)?(?:the\s+)?(?:first|top)\s+(?:result|link|search\s+result)(?:\s+text)?\s*$/iu);
        if (searchCopy) {
            const app = String(searchCopy[1] || "").trim();
            const query = String(searchCopy[2] || "").trim().replace(/^[\s"“”‘’]+|[\s"“”‘’]+$/gu, "");
            if (!app || !query || app.length > 100 || query.length > 120) return null;
            return { app, query, action: "searchCopyFirst", approvalRequired: true };
        }
        const englishType = value.match(/^(?:open|launch|start)\s+(.+?)\s+(?:and\s+)?(?:type|write)\s+(.+)$/iu);
        const hindiType = !englishType && value.match(/^(.+?)\s+(?:खोल(?:ो|कर|के)?|khol(?:o|kar|ke)?)\s+(?:और\s+)?(?:टाइप|लिखो|type|write)\s+(.+)$/iu);
        if (englishType || hindiType) {
            const match = englishType || hindiType;
            const app = String(match[1] || "").trim();
            const textToType = String(match[2] || "")
                .trim()
                .replace(/^[\s"“”‘’]+|[\s"“”‘’]+$/gu, "")
                .trim();
            if (!app || !textToType || app.length > 100 || textToType.length > 2000) return null;
            return { app, action: "type", text: textToType, approvalRequired: true };
        }
        const english = value.match(/^(?:open|launch|start)\s+(.+?)\s+(?:and\s+)?(?:search|find)\s+(.+?)\s+(?:and\s+)?(?:download|install)\b/iu);
        const englishSearchOnly = !english && value.match(/^(?:open|launch|start)\s+(.+?)\s+(?:and\s+)?(?:search|find)\s+(.+?)$/iu);
        const directStore = value.match(/^(?:please\s+)?(?:download|install)\s+(.+?)(?:\s+please)?$/iu)
            || value.match(/^(?:कृपया\s+)?(.+?)\s+(?:डाउनलोड|इंस्टॉल)\s+(?:करो|कर\s+दो)$/iu);
        let app = english?.[1] || englishSearchOnly?.[1] || "";
        let query = english?.[2] || englishSearchOnly?.[2] || "";
        let action = englishSearchOnly ? "search" : "download";
        if (!english && directStore) {
            app = "Microsoft Store";
            query = directStore[1];
        }

        // Hindi/Hinglish speech often places the query before the verb:
        // “Microsoft Store खोल के उधर cloud search करके cloud download कर दो”.
        // Parse the open phrase and the download intent first, then recognize
        // both “search cloud” and “cloud search” word orders.
        if (!english && !directStore) {
            const hindi = value.match(/^(.+?)\s+(?:खोल\s*(?:कर|के)?|khol\s*(?:kar|ke)?)\s+(?:उधर\s+)?(.+?)\s+(?:download|install|डाउनलोड|इंस्टॉल)\b/iu);
            const hindiSearchOnly = !hindi && value.match(/^(.+?)\s+(?:खोल\s*(?:कर|के)?|khol\s*(?:kar|ke)?)\s+(?:उधर\s+)?(.+?)\s+(?:search|find|सर्च|खोज)\s*(?:करो|करके|karo|karke)?$/iu);
            if (hindiSearchOnly) { app = hindiSearchOnly[1]; query = hindiSearchOnly[2].trim(); action = "search"; }
            if (!hindi && !hindiSearchOnly) return null;
            if (hindi) {
                app = hindi[1];
                const middle = hindi[2].trim();
                const queryBeforeVerb = middle.match(/^(.+?)\s+(?:search|find|सर्च|खोज)\s*(?:करके|karke|and|then|और)?\b/iu);
                const queryAfterVerb = middle.match(/(?:search|find|सर्च|खोज)\s+(.+?)(?:\s+करके|\s+karke|\s+and|\s+then|\s+और|$)/iu);
                query = queryBeforeVerb?.[1] || queryAfterVerb?.[1] || "";
            }
        }

        app = String(app).trim();
        query = String(query)
            .trim()
            .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/gu, "")
            .replace(/\s+(?:and\s+)?(?:download|install)\s+(?:it|this|that|इसे|कर\s+दो)$/iu, "")
            .replace(/\s+(?:it|this|इसे|कर\s+दो)$/iu, "")
            .trim();
        if (!app || !query || app.length > 100 || query.length > 120) return null;
        return { app, query, action, approvalRequired: true };
    }

    function parseAppFollowUp(text) {
        const value = String(text || "").trim();
        if (!lastOpenedApp) return null;
        if (/^(?:what(?:'s| is)\s+on\s+(?:the\s+)?screen|inspect\s+(?:this|the\s+app)|स्क्रीन\s+पर\s+क्या\s+है|स्क्रीन\s+देखो)$/iu.test(value)) {
            return { app: lastOpenedApp, query: "", action: "inspect", approvalRequired: false, contextual: true };
        }
        // Follow-ups are often spoken as a second sentence.  Keep the app
        // context, but strip conversational fillers before matching the
        // actual operation ("now type cloud", "new tab pe click karo").
        const followUp = value
            .replace(/^(?:now|then|next|okay|ok|ab|phir|अब|फिर|ठीक है)\s+/iu, "")
            .replace(/\s+(?:please|karo|kar\s+do|करो|कर\s+दो|करना)$/iu, "")
            .trim();
        if (/^(?:go\s+)?(?:back|previous\s+page|last\s+page|पीछे|पिछले\s+पेज)\b/iu.test(followUp)) {
            return { app: lastOpenedApp, query: "", action: "hotkey", keys: ["ALT", "LEFT"], approvalRequired: true, contextual: true };
        }
        if (/^(?:go\s+)?(?:forward|next\s+page|अगले\s+पेज|आगे)\b/iu.test(followUp)) {
            return { app: lastOpenedApp, query: "", action: "hotkey", keys: ["ALT", "RIGHT"], approvalRequired: true, contextual: true };
        }
        if (/^(?:reload|refresh|रीलोड|रिफ्रेश)\b/iu.test(followUp)) {
            return { app: lastOpenedApp, query: "", action: "hotkey", keys: ["CTRL", "R"], approvalRequired: true, contextual: true };
        }
        if (/^(?:zoom\s+in|make\s+it\s+bigger|बड़ा\s+करो|ज़ूम\s+करो|जूम\s+करो)\b/iu.test(followUp)) {
            return { app: lastOpenedApp, query: "", action: "hotkey", keys: ["CTRL", "PLUS"], approvalRequired: true, contextual: true };
        }
        if (/^(?:zoom\s+out|make\s+it\s+smaller|छोटा\s+करो)\b/iu.test(followUp)) {
            return { app: lastOpenedApp, query: "", action: "hotkey", keys: ["CTRL", "MINUS"], approvalRequired: true, contextual: true };
        }
        if (/^(?:reset\s+zoom|zoom\s+reset|ज़ूम\s+रीसेट|जूम\s+रीसेट)\b/iu.test(followUp)) {
            return { app: lastOpenedApp, query: "", action: "hotkey", keys: ["CTRL", "0"], approvalRequired: true, contextual: true };
        }
        if (/^(?:open\s+|create\s+|new\s+)?(?:a\s+)?new\s+tab|new\s+tab\s+(?:pe|par|on|in)\s+click|^(?:click|tap)\s+(?:on\s+)?(?:the\s+)?new\s+tab/iu.test(followUp)) {
            return { app: lastOpenedApp, query: "", action: "hotkey", keys: ["CTRL", "T"], approvalRequired: true, contextual: true };
        }
        const search = followUp.match(/^(?:search|find|look\s+for|सर्च|ढूंढो|खोजो)(?:\s+for)?\s+(.+?)(?:\s+(?:please|karo|kar\s+do|करो|कर\s+दो))?$/iu);
        if (search?.[1]) return { app: lastOpenedApp, query: search[1].trim(), action: "search", approvalRequired: true, contextual: true };
        const key = followUp.match(/^(?:press|hit|दबाओ|प्रेस)\s+(?:the\s+)?([a-z0-9]+)$/iu);
        if (key?.[1]) return { app: lastOpenedApp, query: "", action: "pressKey", key: key[1].toUpperCase(), approvalRequired: true, contextual: true };
        const click = followUp.match(/^(?:click|tap|select|choose|press|क्लिक|टैप|सेलेक्ट|चुनो|दबाओ)\s+(?:on\s+|the\s+|उस\s+|उसके\s+)?(.+?)\s*$/iu);
        if (click?.[1]) {
            const target = click[1].trim().replace(/\s+(?:button|पर|पे)$/iu, "").trim();
            if (target.length >= 2 && target.length <= 120) return { app: lastOpenedApp, query: "", action: "click", target, approvalRequired: true, contextual: true };
        }
        const type = followUp.match(/^(?:type|write|टाइप|लिखो)\s+(?:text\s+)?["“]?(.+?)["”]?$/iu)
            || followUp.match(/^(.+?)\s+(?:type|लिखो|टाइप\s+करो)$/iu);
        if (type?.[1]) {
            const textToType = type[1].trim();
            if (textToType.length >= 1 && textToType.length <= 2000) return { app: lastOpenedApp, query: "", action: "type", text: textToType, approvalRequired: true, contextual: true };
        }
        if (/^(?:download|install|update|डाउनलोड|इंस्टॉल|अपडेट)\s+(?:it|this|that|इसे|इसे\s+ही)?$/iu.test(value) && lastOpenedQuery) {
            return { app: lastOpenedApp, query: lastOpenedQuery, action: /update|अपडेट/i.test(value) ? "update" : "download", approvalRequired: true, contextual: true };
        }
        return null;
    }

    function cleanTopic(value) {
        return String(value || "")
            .replace(/^\s*(?:please|mujhe|can you|could you|would you|jarvis)\s+/i, "")
            .replace(/^\s*(?:the|an?|a)\s+/i, "")
            .replace(/\b(?:please|batao|bata|bataiye|do|dijiye|karo|kar do|karo na|dikhao|dhoondo|dhundo|search karo|information do|info do)\b/gi, " ")
            .replace(/\s+/g, " ").trim();
    }

    function pickAfter(text, patterns) {
        for (const re of patterns) {
            const match = text.match(re);
            if (match && match[1]) return cleanTopic(match[1]);
        }
        return "";
    }

    function confidence(base, modifiers) {
        let value = base;
        for (const modifier of modifiers || []) value += modifier;
        return Math.max(0, Math.min(0.99, Number(value.toFixed(3))));
    }

    function entityMap(entries) {
        const entities = {};
        for (const [key, value] of entries) {
            if (value !== undefined && value !== null && value !== "") entities[key] = value;
        }
        return entities;
    }

    function parseShutdownDelay(text) {
        const amountPattern = "(\\d+|one|a|an|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|ek|do|teen|char|chaar|paanch|panch|chhe|che|saat|aath|nau|das|terah|chaudah|pandrah|solah|satrah|atharah|unnis|bees|एक|दो|तीन|चार|पांच|पाँच|छह|सात|आठ|नौ|दस|ग्यारह|बारह|तेरह|चौदह|पंद्रह|सोलह|सत्रह|अठारह|उन्नीस|बीस)";
        const unitPattern = "(seconds?|secs?|minutes?|mins?|hours?|hrs?|सेकंड|सेकण्ड|मिनट|मिनिट|घंटा|घंटे|घंटों|घण्टा|घण्टे|ghanta|ghante|ghanto)";
        const before = new RegExp(`\\b(?:in|after|within)\\s+${amountPattern}\\s*${unitPattern}`, "iu").exec(text);
        const after = new RegExp(`(?:^|\\s)${amountPattern}\\s*${unitPattern}\\s*(?:later|from now|baad|bad|mein|me|ke baad|बाद|में)(?=$|\\s)`, "iu").exec(text);
        const match = before || after;
        if (!match) return null;

        const numberWords = {
            one: 1, a: 1, an: 1, ek: 1, एक: 1,
            two: 2, do: 2, दो: 2, three: 3, teen: 3, तीन: 3,
            four: 4, char: 4, chaar: 4, चार: 4,
            five: 5, paanch: 5, panch: 5, पांच: 5, पाँच: 5,
            six: 6, chhe: 6, che: 6, छह: 6,
            seven: 7, saat: 7, सात: 7, eight: 8, aath: 8, आठ: 8,
            nine: 9, nau: 9, नौ: 9, ten: 10, das: 10, दस: 10,
            eleven: 11, ग्यारह: 11, twelve: 12, बारह: 12,
            thirteen: 13, terah: 13, तेरह: 13, fourteen: 14, chaudah: 14, चौदह: 14,
            fifteen: 15, pandrah: 15, पंद्रह: 15, sixteen: 16, solah: 16, सोलह: 16,
            seventeen: 17, satrah: 17, सत्रह: 17, eighteen: 18, atharah: 18, अठारह: 18,
            nineteen: 19, unnis: 19, उन्नीस: 19, twenty: 20, bees: 20, बीस: 20
        };
        const rawAmount = match[1].toLowerCase();
        const amount = Number.isFinite(Number(rawAmount)) ? Number(rawAmount) : numberWords[rawAmount];
        const unit = match[2].toLowerCase();
        const multiplier = /hour|hr|घंट|घण्ट|ghant/.test(unit) ? 3600000 : /minute|min|मिनट|मिनिट/.test(unit) ? 60000 : 1000;
        const delayMs = amount * multiplier;
        if (!Number.isFinite(delayMs) || delayMs < 60000 || delayMs > 7 * 24 * 60 * 60 * 1000) return null;
        return { delayMs, amount, unit, multiplier };
    }

    function findApp(text) {
        const ordered = Object.entries(APP_ALIASES).sort((a, b) =>
            Math.max(...b[1].map(x => x.length)) - Math.max(...a[1].map(x => x.length))
        );
        for (const [canonical, aliases] of ordered) {
            if (aliases.some(alias => new RegExp(`(?:^|\\s)${escapeRegExp(alias)}(?:$|\\s)`, "i").test(text))) {
                return canonical;
            }
        }
        return "";
    }

    function appRequest(text) {
        const value = String(text).replace(/^(?:(?:please|can you|could you|would you|mujhe|jara|zara|कृपया|जरा|ज़रा)\s+)+/iu, "")
            .replace(/\s+(?:please|प्लीज|प्लीज़)$/iu, "").trim();
        const match = value.match(/^(?:(?:on\s+)?(?:my\s+)?(?:pc|computer|system)\s+)?(?:open|launch|start|run|execute|ओपन|लॉन्च|लांच|खोलो)\s+(.+?)(?:\s+(?:on\s+)?(?:my\s+)?(?:pc|computer|system))?$/iu)
            || value.match(/^(.+?)\s+(?:ko\s+|को\s+)?(?:khol(?:o)?(?:\s+do)?|chalao|खोलो|खोल\s+दो|चलाओ|चला\s+दो|(?:open|launch|start|ओपन|लॉन्च|लांच)\s+(?:karo|kar\s*do|करो|कर\s*दो))$/iu);
        let name = (match?.[1] || "").replace(/\s+(?:ko|को)$/iu, "").replace(/\s+(?:open|launch|start)?\s*(?:kar\s*do|karo|कर\s*दो|करो)$/iu, "").trim();
        if (!name || name.length > 100 || /^(?:source|a discussion|a conversation|your mind)\b/i.test(name) || /\b(?:and then|then|karke|because|means)\b/i.test(name)) return null;
        const compact = name.replace(/[\s.-]/g, "");
        for (const [app, names] of Object.entries(APP_ALIASES)) {
            if (names.some(alias => alias.replace(/[\s.-]/g, "") === compact)) return { app };
        }
        // Confidence describes the user's request to launch, not whether the app exists.
        return { app: name, generic: true };
    }

    function escapeRegExp(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function extractLocation(text) {
        let value = pickAfter(text, [
            /^(?:abhi\s+)?(.+?)\s+(?:ka|ki|ke)\s+(?:weather|वेदर|mausam|मौसम)(?:\s+(?:batao|bata|बताओ|बता\s+दो|please))?$/iu,
            /\b(.+?)\s+(?:ka|ke)\s+(?:weather|mausam|temperature|forecast)(?:\s+(?:batao|bata|please|check karo))?$/i,
            /^(.+?)\s+(?:weather|mausam|temperature|forecast)(?:\s+(?:batao|bata|please))?$/i,
            /\bweather\s+(?:in|for|at)\s+(.+)$/i,
            /\b(?:temperature|forecast)\s+(?:in|for|at)\s+(.+)$/i,
            /\b(?:mausam|weather)\s+(.+)$/i,
            /\b(?:in|for)\s+([\p{L} .'-]+?)(?:\s+(?:batao|please|today|tomorrow))?$/iu
        ]);
        if (/^(?:what is the|what is|the|today|please|temperature|temp|weather|mausam)$/i.test(value)) return "";
        value = String(value || "").replace(/^(?:abhi|अभी)\s+/iu, "").replace(/\s+(?:बताओ|बता\s+दो|बताना|please)$/iu, "").trim();
        const aliases = { "दिल्ली": "Delhi", "नई दिल्ली": "New Delhi", "मेरठ": "Meerut", "यूरोप": "Europe" };
        value = aliases[value.toLowerCase()] || value;
        return value;
    }

    function extractCurrency(text) {
        const aliases = Object.keys(CURRENCY_ALIASES).sort((a, b) => b.length - a.length);
        const tokenPattern = aliases.map(escapeRegExp).join("|");
        const amountMatch = text.match(/(?:^|\s)(\d+(?:\.\d+)?)(?=\s|$)/);
        const amount = amountMatch ? Number(amountMatch[1]) : null;
        let from = "", to = "";

        const pair = text.match(new RegExp(`(?:${tokenPattern})\\s+(?:to|in|into|mein|me|ko)\\s+(?:${tokenPattern})`, "i"));
        if (pair) {
            const parts = pair[0].split(/\s+(?:to|in|into|mein|me|ko)\s+/i);
            from = CURRENCY_ALIASES[String(parts[0]).toLowerCase()];
            to = CURRENCY_ALIASES[String(parts[1]).toLowerCase()];
        }

        if (!from || !to) {
            const compact = text.match(new RegExp(`(\\d+(?:\\.\\d+)?)?\\s*(${tokenPattern})\\s*(?:to|in|into|mein|me|ko)\\s*(${tokenPattern})`, "i"));
            if (compact) {
                from = CURRENCY_ALIASES[compact[2].toLowerCase()];
                to = CURRENCY_ALIASES[compact[3].toLowerCase()];
            }
        }

        if (!from || !to) {
            const codePair = text.match(/\b([a-z]{3})\s*(?:to|in|into|mein|me|ko)\s*([a-z]{3})\b/i);
            if (codePair) {
                from = CURRENCY_ALIASES[codePair[1].toLowerCase()] || codePair[1].toUpperCase();
                to = CURRENCY_ALIASES[codePair[2].toLowerCase()] || codePair[2].toUpperCase();
            }
        }

        return { amount, from, to };
    }

    function extractPresentationTopic(text) {
        const action = String.raw`(?:create|make|build|prepare|generate|bana(?:o|\s+do|\s+dijiye)?|तैयार\s+कर(?:ो|\s+दो|\s+दीजिए)?|बना(?:ओ|\s+दो|\s+दीजिए)?)`;
        const format = String.raw`(?:pptx?|power\s*point|presentation|slides|पीपीटी|प्रेजेंटेशन|स्लाइड्स?)`;
        const finish = String.raw`(?:please|now|bana(?:o|\s+do|\s+dijiye)?|तैयार\s+कर(?:ो|\s+दो|\s+दीजिए)?|बना(?:ओ|\s+दो|\s+दीजिए)?)`;
        const relation = String.raw`(?:about|on|for|of|regarding|covering|के\s+ऊपर|के\s+बारे\s+में|पर)`;
        const subjectText = String(text || "")
            .replace(/\s+(?:i\s+need|i\s+want|need|want|mujhe|मुझे|mere\s+liye|मेरे\s+लिए)\s+\d{1,2}\s*(?:[-–]\s*\d{1,2}\s*)?(?:images?|photos?|pictures?|इमेज(?:ेस)?|तस्वीर(?:ें)?).*$/iu, "")
            .replace(/\s+\d{1,2}\s*(?:[-–]\s*\d{1,2}\s*)?(?:slides?|स्लाइड(?:्स)?).*$/iu, "");
        const patterns = [
            new RegExp(`^${action}\\s+(?:me\\s+)?(?:a\\s+|an\\s+|the\\s+|ek\\s+|एक\\s+)?${format}\\s+${relation}\\s+(.+?)(?:\\s+${finish})?$`, "iu"),
            new RegExp(`^${action}\\s+(?:me\\s+)?(?:a\\s+|an\\s+|the\\s+)?(.+?)\\s+(?:pptx?|power\\s*point|presentation|slides)\\s+(?:about|on|for|of)\\s+(.+?)(?:\\s+${finish})?$`, "iu"),
            new RegExp(`^(.+?)\\s+(?:ke\\s+upar|ke\\s+baare\\s+mein|par|पर|के\\s+ऊपर|के\\s+बारे\\s+में)\\s+(?:ek\\s+|एक\\s+)?${format}\\s+${finish}$`, "iu"),
            new RegExp(`^${action}\\s+(?:me\\s+)?(?:a\\s+|an\\s+|the\\s+|ek\\s+|एक\\s+)?(.+?)\\s+${format}(?:\\s+${finish})?$`, "iu"),
            new RegExp(`^${action}\\s+(?:me\\s+)?(?:a\\s+|an\\s+|the\\s+|ek\\s+|एक\\s+)?${format}\\s+(?:(?:about|on|for|of|regarding|covering)\\s+)?(.+?)(?:\\s+${finish})?$`, "iu")
        ];
        for (let index = 0; index < patterns.length; index++) {
            const match = patterns[index].exec(subjectText);
            if (!match) continue;
            const topic = cleanTopic(match[index === 1 ? 2 : 1])
                .replace(/^(?:about|on|for|of|regarding|covering|के\s+ऊपर|के\s+बारे\s+में|पर)\s+/iu, "")
                .replace(/\s+(?:pptx?|power\s*point|presentation|slides|पीपीटी|प्रेजेंटेशन|स्लाइड्स?)$/iu, "")
                .trim();
            if (topic && topic.length <= 120) return topic;
        }
        return "";
    }

    function extractPresentationOptions(text) {
        const value = String(text || "");
        const range = (unit) => {
            const match = value.match(new RegExp(`\\b(\\d{1,2})(?:\\s*[-–]\\s*(\\d{1,2}))?\\s*-?\\s*${unit}\\b`, "iu"));
            return match ? Math.max(Number(match[1]), Number(match[2] || match[1])) : 0;
        };
        const slideCount = Math.max(range("slides?"), range("स्लाइड"));
        const imageCount = Math.max(range("images?"), range("photos?"), range("pictures?"), range("इमेज(?:ेस)?"), range("तस्वीर(?:ें)?"));
        return {
            slideCount: slideCount >= 3 && slideCount <= 30 ? slideCount : 10,
            imageCount: imageCount >= 1 ? Math.min(imageCount, 30) : 0
        };
    }

    function extractFlexiblePresentationTopic(text) {
        const format = String.raw`(?:pptx?|power\s*point|presentation|slides|पीपीटी|प्रेजेंटेशन|स्लाइड्स?)`;
        const action = String.raw`(?:create|make|build|prepare|generate|draft|bana(?:o|na|\s+do|\s+kar\s+(?:do|dijiye))?|taiya?r\s+kar(?:o|na|\s+do)?|तैयार\s+कर(?:ो|ना|\s+दो|\s+दीजिए)?|बना(?:ओ|ना|\s+दो|\s+कर\s+दो)?)`;
        const relation = String.raw`(?:about|on|for|of|ke\s+upar|ke\s+baare\s+mein|par|के\s+ऊपर|के\s+बारे\s+में|पर)`;
        const filler = String.raw`(?:(?:a|an|the|ek|एक|achhi|achha|si|se|sa|detailed|professional|beautiful|amazing|shandaar|शानदार|अच्छी|अच्छा|बेहतरीन|विस्तृत)\s+)*`;
        let request = String(text || "")
            .replace(/^(?:tum|तुम)\s+(?:mere\s+liye|मेरे\s+लिए)\s+/iu, "")
            .replace(/^(?:(?:mere\s+liye|मेरे\s+लिए)\s+)?(?:na|ना|please|कृपया)?\s*(?:tum|aap|आप)\s+/iu, "")
            .replace(/\s+(?:and|aur|और)\s+(?:(?:usmein|usamein|usame|usme|us\s+mein|jisme(?:in)?|जिसमें)\s+)?(?:(?:har|every)\s+(?:slide|स्लाइड)\s+(?:mein|में)\s+)?(?:(?:i\s+)?(?:need|want|include|add)\s+|mujhe\s+|मुझे\s+)?(?:bahut\s+saari|bahut\s+saare|lots\s+of|a\s+lot\s+of|many)?\s*(?:images?|photos?|pictures?|इमेज(?:ेस)?|तस्वीर(?:ें)?).*$/iu, "")
            .replace(/\s+(?:and|aur|और)\s+(?:(?:i\s+)?(?:need|want|include|add)|mujhe|मुझे)?\s*(?:bahut\s+saari|bahut\s+saare|lots\s+of|a\s+lot\s+of|many)?\s*(?:images?|photos?|pictures?|इमेज(?:ेस)?|तस्वीर(?:ें)?).*$/iu, "")
            .replace(/\s+(?:i\s+need|i\s+want|need|want|mujhe|मुझे)\s+\d{1,2}\s*(?:[-–]\s*\d{1,2}\s*)?(?:images?|photos?|pictures?|इमेज(?:ेस)?|तस्वीर(?:ें)?).*$/iu, "")
            .replace(/\s+(?:jisme(?:in)?|जिसमें)\s+.*$/iu, "")
            .replace(/\s+(?:images?|photos?|pictures?|इमेज(?:ेस)?|तस्वीर(?:ें)?|design|डिजाइन)\b.*$/iu, "")
            .replace(/\s+(?:with|aur|और)\s+(?:images?|photos?|pictures?|achhe\s+design|good\s+design|अच्छे\s+डिजाइन).*$/iu, "")
            .replace(/[,;].*$/u, " ")
            .trim();
        // Conversational voice form: “mere liye ek PPT bana do How to use
        // ChatGPT”. Keep the topic after the action instead of treating the
        // article “ek” as the subject.
        const conversational = new RegExp(`^(?:(?:mere\\s+liye|mujhe|मुझे|मेरे\\s+लिए)\\s+)?(?:a|an|the|ek|एक)\\s+${format}\\s+${action}\\s+(.+)$`, "iu").exec(request);
        if (conversational?.[1]) {
            const conversationalTopic = cleanTopic(conversational[1])
                .replace(/^(?:about|on|for|of|के\\s+ऊपर|के\\s+बारे\\s+में|पर)\\s+/iu, "")
                .trim();
            if (conversationalTopic && conversationalTopic.length <= 120) return conversationalTopic;
        }
        // Hindi STT often says “Mujhe [topic] ke upar 10 slides ki PPT bana kar do”.
        const topicBeforeRelation = new RegExp(`^(.+?)\\s+${relation}\\s+(?:(?:\\d{1,2}(?:\\s*[-–]\\s*\\d{1,2})?)\\s+(?:slides?|स्लाइड(?:्स)?)\\s+(?:ki|की)\\s+)?${filler}${format}(?:\\s+(?:${action}).*)?$`, "iu").exec(request);
        const actionFirst = new RegExp(`^(?:please\\s+|jarvis[, ]+)?${action}\\s+(?:(?:me|mujhe|mere\\s+liye|मुझे|मेरे\\s+लिए)\\s+)?(?:a\\s+|an\\s+|the\\s+|ek\\s+|एक\\s+)?${format}\\s+(?:${relation}\\s+)?(.+?)$`, "iu").exec(request);
        const formatThenAction = new RegExp(`^(?:a\\s+|an\\s+|the\\s+|ek\\s+|एक\\s+)?${format}\\s+${action}\\s+(.+?)$`, "iu").exec(request);
        const topicFirst = new RegExp(`^(.+?)\\s+${format}\\s+(?:${action})(?:\\s+.*)?$`, "iu").exec(request);
        const candidate = topicBeforeRelation?.[1] || actionFirst?.[1] || formatThenAction?.[1] || topicFirst?.[1] || "";
        const topic = cleanTopic(candidate)
            .replace(/^(?:(?:please|jarvis|mujhe|मुझे|mere\s+liye|मेरे\s+लिए|tum|aap|my)\s+)+/iu, "")
            .replace(/^(?:about|on|for|of|के\\s+ऊपर|के\\s+बारे\\s+में|पर)\\s+/iu, "")
            .trim();
        return topic.length <= 120 ? topic : "";
    }

    function extractPresentationPreferences(text, slideCount) {
        const value = String(text || "");
        const wantsImages = !/\b(?:no|without|don't|do not)\s+(?:images?|photos?|pictures?)\b|बिना\s+(?:इमेज|तस्वीर)/iu.test(value) &&
            /\b(?:images?|photos?|pictures?)\b|इमेज|तस्वीर|चित्र/iu.test(value);
        const imageCount = extractPresentationOptions(value).imageCount;
        const styles = [
            [/\b(?:detailed|in.depth|comprehensive|विस्तृत|डिटेल्ड)\b/iu, "detailed"],
            [/\b(?:professional|प्रोफेशनल|व्यावसायिक)\b/iu, "professional"],
            [/\b(?:beautiful|attractive|achhi|achha|shandaar|अच्छी|अच्छा|शानदार|सुंदर|बेहतरीन)\b/iu, "polished design"],
            [/\b(?:design|डिजाइन|डिज़ाइन|layout|लेआउट)\b/iu, "good visual design"]
        ].filter(([pattern]) => pattern.test(value)).map(([, label]) => label);
        const language = /\p{Script=Devanagari}/u.test(value) ? "hi"
            : /\b(?:banao|bana|bana\s+kar|taiyar|achhi|achha|bahut|ke\s+upar|ke\s+baare\s+mein|lagao)\b/iu.test(value) ? "hinglish" : "en";
        return { wantsImages, imageCount: imageCount || (wantsImages ? Math.max(1, Number(slideCount) - 1) : 0), designPreferences: [...new Set(styles)], language };
    }

    function extractPdfTopic(text) {
        const action = String.raw`(?:create|make|build|prepare|generate|bana(?:o|na|\s+do)?|तैयार\s+कर(?:ो|\s+दो|\s+दीजिए)?|बना(?:ओ|\s+दो|\s+दीजिए)?)`;
        const finish = String.raw`(?:please|now|बना(?:ओ|\s+दो|\s+दीजिए)?)`;
        const value = String(text || "")
            .replace(/^(?:(?:mere\s+liye|मेरे\s+लिए)\s+)?(?:na|ना|please|कृपया)?\s*(?:tum|aap|आप)\s+/iu, "")
            .trim();
        const pdfFormat = String.raw`(?:pdf|पीडीएफ)`;
        const conversational = new RegExp(`^(?:(?:mere\\s+liye|mujhe|मुझे|मेरे\\s+लिए)\\s+)?(?:a|an|the|ek|एक)\\s+${pdfFormat}\\s+${action}\\s+(.+)$`, "iu").exec(value);
        if (conversational?.[1]) {
            const topic = cleanTopic(conversational[1]).replace(/^(?:about|on|for|of|के\\s+ऊपर|के\\s+बारे\\s+में|पर)\\s+/iu, "").trim();
            if (topic && topic.length <= 120) return topic;
        }
        const patterns = [
            new RegExp(`^${action}\\s+(?:(?:me|a|an|the|एक)\\s+)?(?:smart\\s+)?${pdfFormat}\\s+(?:(?:about|on|for|of|के\\s+ऊपर|के\\s+बारे\\s+में|पर)\\s+)?(.+?)(?:\\s+${finish})?$`, "iu"),
            new RegExp(`^(?:a\\s+|an\\s+|the\\s+|ek\\s+|एक\\s+)?${pdfFormat}\\s+${action}\\s+(.+?)(?:\\s+${finish})?$`, "iu"),
            new RegExp(`^(.+?)\\s+(?:की\\s+)?${pdfFormat}\\s+${finish}$`, "iu")
        ];
        for (const pattern of patterns) {
            const match = pattern.exec(value);
            const topic = cleanTopic(match?.[1] || "").replace(/\s+(?:pdf|पीडीएफ)$/iu, "").trim();
            if (topic && topic.length <= 120) return topic;
        }
        return "";
    }

    function extractSpreadsheetRequest(text) {
        const action = String.raw`(?:create|make|build|prepare|generate|बना(?:ओ|ना|\s+दो|\s+दीजिए)?|तैयार\s+कर(?:ो|ना|\s+दो|\s+दीजिए)?)`;
        const format = String.raw`(?:smart\s+)?(?:excel\s+(?:spread\s*sheet|sheet|workbook)|spread\s*sheet|excel|workbook|xlsx|स्प्रेडशीट|एक्सेल\s*(?:शीट|वर्कबुक)?|शीट)`;
        const relation = String.raw`(?:about|on|for|of|मेरे\s+लिए|के\s+लिए|पर|का|की|के)`;
        const patterns = [
            new RegExp(`^${action}\\s+(?:(?:me|a|an|the|एक|मेरे\s+लिए)\\s+)?${format}\\s*(?:${relation}\\s+)?(.*?)$`, "iu"),
            new RegExp(`^${action}\\s+(?:(?:me|a|an|the|एक)\\s+)?(.+?)\\s+${format}(?:\\s+(?:please|now|बना(?:ओ|ना|\\s+दो)?))?$`, "iu"),
            new RegExp(`^(.+?)\\s+${format}\\s+${action}$`, "iu")
        ];
        for (const pattern of patterns) {
            const match = pattern.exec(String(text || "").trim());
            if (!match) continue;
            const request = cleanTopic(match[1] || "")
                .replace(/^(?:about|on|for|of|my|मेरे\s+लिए|के\s+लिए|के\s+ऊपर|पर|का|की|के)\s+/iu, "")
                .replace(/\s+(?:please|now|please\s+do|बना(?:ओ|ना|\s+दो)?|तैयार\s+कर(?:ो|ना|\s+दो)?)$/iu, "")
                .replace(/^(?:please|now)\s+/iu, "")
                .trim();
            return request.slice(0, 180) || "Smart personal tracker";
        }
        return "";
    }

    function extractOfficeFileCommand(text) {
        const action = String.raw`(?:create|make|build|prepare|generate|write|draft|compose|बना(?:ओ|ना|\s+दो|\s+दीजिए)?|लिख(?:ो|ना|\s+दो|\s+दीजिए)?|तैयार\s+कर(?:ो|ना|\s+दो|\s+दीजिए)?)`;
        const format = String.raw`(?:word\s+document|study\s+guide|revision\s+guide|study\s+notes|class\s+notes|notes|guide|document|docx|doc|csv(?:\s+file)?|zip(?:\s+(?:file|archive))?|archive)`;
        const relation = String.raw`(?:about|on|for|of|as|regarding|के\s+बारे\s+में|के\s+ऊपर|के\s+लिए|पर)`;
        const patterns = [
            new RegExp(`^(?:(?:please|jarvis)\\s+)*(?:can\\s+you\\s+)?${action}\\s+(?:(?:me|a|an|the|please|एक|मेरे\\s+लिए)\\s+)*${format}\\s*(?:${relation}\\s+)?(.*?)$`, "iu"),
            new RegExp(`^${action}\\s+(?:(?:me|a|an|the|एक)\\s+)?(.+?)\\s+${format}(?:\\s+(?:please|now|बना(?:ओ|ना|\\s+दो)?))?$`, "iu"),
            new RegExp(`^(.+?)\\s+${format}\\s+${action}$`, "iu")
        ];
        for (const pattern of patterns) {
            const match = pattern.exec(String(text || "").trim());
            if (!match) continue;
            const formatText = match[0].toLowerCase();
            const outputFormat = /\bzip\b|\barchive\b/i.test(formatText) ? "zip" : /\bcsv\b/i.test(formatText) ? "csv" : "docx";
            const request = cleanTopic(match[1] || "")
                .replace(/^(?:about|on|for|of|my|मेरे\s+लिए|के\s+लिए|के\s+ऊपर|पर)\s+/iu, "")
                .replace(/\s+(?:please|now|please\s+do|बना(?:ओ|ना|\s+दो)?|तैयार\s+कर(?:ो|ना|\s+दो)?)$/iu, "")
                .trim();
            return { format: outputFormat, request: outputFormat === "zip" ? "" : request.slice(0, 180) };
        }

        // Speech recognition may miss the article or slightly misspell one
        // word in "study guide". Accept a close match only when the request
        // still starts with a clear file-creation verb, avoiding false hits
        // in ordinary conversation.
        const looseStudy = String(text || "").trim().match(new RegExp(`^(?:(?:please|jarvis)\\s+)*(?:can\\s+you\\s+)?${action}\\s+(?:(?:me|a|an|the|please|एक|मेरे\\s+लिए)\\s+)*([^\\s]+)\\s+([^\\s]+)(?:\\s+(.+))?$`, "iu"));
        const withinOneEdit = (left, right) => {
            left = String(left || "").toLocaleLowerCase(); right = String(right || "").toLocaleLowerCase();
            if (left === right) return true;
            if (Math.abs(left.length - right.length) > 1) return false;
            let i = 0, j = 0, edits = 0;
            while (i < left.length && j < right.length) {
                if (left[i] === right[j]) { i++; j++; continue; }
                if (++edits > 1) return false;
                if (left.length > right.length) i++;
                else if (right.length > left.length) j++;
                else { i++; j++; }
            }
            return edits + (i < left.length || j < right.length ? 1 : 0) <= 1;
        };
        if (looseStudy && withinOneEdit(looseStudy[1], "study") && withinOneEdit(looseStudy[2], "guide")) {
            const request = cleanTopic(looseStudy[3] || "")
                .replace(new RegExp(`^(?:${relation})\\s+`, "iu"), "")
                .replace(/\s+(?:please|now|save\s+(?:it\s+)?as\s+.+)$/iu, "")
                .trim();
            return { format: "docx", request: request.slice(0, 180) };
        }
        return null;
    }

    function extractPresentationSlideCount(text) {
        return extractPresentationOptions(text).slideCount;
    }

    function extractAlarmTime(text) {
        const western = text.match(/\b(?:at|for|set\s+(?:it\s+)?to)?\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/iu);
        const hindi = text.match(/(?:सुबह|सवेरे|दोपहर|शाम|रात)?\s*(\d{1,2})(?::(\d{2}))?\s*बजे(?:\s*(सुबह|दोपहर|शाम|रात))?/iu);
        const match = western || hindi;
        if (!match) return "";
        const hour = Number(match[1]);
        const minute = Number(match[2] || 0);
        const rawPeriod = String(western ? match[3] : (hindi?.[3] || hindi?.[0] || "")).toLowerCase();
        if (!Number.isInteger(hour) || hour < 1 || hour > 12 || !Number.isInteger(minute) || minute > 59) return "";
        const period = rawPeriod.startsWith("p") || /दोपहर|शाम|रात/.test(rawPeriod) ? "PM" : /a\.?m\.?|सुबह|सवेरे/.test(rawPeriod) ? "AM" : "";
        return `${hour}:${String(minute).padStart(2, "0")}${period ? ` ${period}` : ""}`;
    }

    // A noun such as "time", "weather" or "news" is not, by itself, a
    // command.  These guards keep the scripted live-data routes from
    // hijacking ordinary conversation ("the meeting time changed", "news is
    // hard to follow", etc.).  Keep the allow-list deliberately small: when
    // intent is ambiguous, the normal conversational model should answer.
    function isDirectTimeRequest(text) {
        const value = String(text || "").trim();
        if (!value || /\b(?:meeting|runtime|run|response|release|limit|management|school|class|work|travel|arrival|departure)\s+time\b/i.test(value)) return false;
        return /^(?:(?:please|hey|okay|ok|jarvis)[,\s]*)?(?:what(?:'s| is)\s+(?:the\s+)?(?:current\s+)?time(?:\s+is\s+it)?|what\s+time\s+is\s+it|current\s+time|local\s+time|tell\s+me\s+(?:the\s+)?time|show\s+me\s+(?:the\s+)?time|time\s+(?:batao|bata\s+do|बताओ|बता\s+दो)|samay\s+(?:batao|bata\s+do)|waqt\s+(?:batao|bata\s+do)|(?:abhi\s+)?kitn(?:e|a)\s+baje(?:\s+(?:hain|hai))?|अभी\s+कितने\s+बजे|समय\s+(?:बताओ|बता\s+दो)|टाइम\s+(?:बताओ|बता\s+दो))\s*$/iu.test(value)
            || /^(?:[\p{L}][\p{L}\s.'-]{1,50})\s+time$/iu.test(value)
            || /^(?:what(?:'s| is)\s+the\s+)?(?:current\s+|local\s+)?time\s+in\s+[\p{L}][\p{L}\s.'-]{1,50}$/iu.test(value);
    }

    function isDirectDateRequest(text) {
        const value = String(text || "").trim();
        if (!value || /\b(?:birth|release|due|start|end|expiry|expiration|deadline|payment|joining|event)\s+date\b/i.test(value)) return false;
        const compact = value.replace(/[\u0027\u2019]/g, "").replace(/\b(what|today)\s+s\b/giu, "$1s");
        return /^(?:(?:please|hey|okay|ok|jarvis)[,\s]*)?(?:what(?:s| is)\s+(?:todays\s+date|the\s+current\s+date|the\s+date)|todays\s+date|current\s+date|tell\s+me\s+(?:todays\s+date|the\s+current\s+date|the\s+date)|show\s+me\s+(?:todays\s+date|the\s+current\s+date|the\s+date)|date\s+(?:batao|bata\s+do|बताओ|बता\s+दो)|aaj\s+ki\s+date|आज\s+की\s+तारीख|आज\s+की\s+डेट|तारीख\s+(?:बताओ|बता\s+दो))\s*$/iu.test(compact);
    }

    function hasExplicitWeatherRequest(text) {
        const value = String(text || "").trim();
        return /^(?:(?:please|hey|okay|ok|jarvis)[,\s]*)?(?:what(?:'s| is)\s+(?:the\s+)?(?:weather|temperature)|(?:check|tell|show|give|get)\s+(?:me\s+)?(?:the\s+)?(?:weather|temperature|forecast)|(?:weather|mausam|मौसम)\s+(?:in|of|for|ka|का|बताओ|batao)|(?:[\p{L}][\p{L}\s.'-]{1,50})\s+(?:weather|mausam|मौसम)|(?:[\p{L}\u0900-\u097F][\p{L}\u0900-\u097F\s.'-]{1,50})\s+(?:का|के|की)\s+(?:मौसम|weather)\s*(?:बताओ|बता\s+दो|batao)?)(?:\s+.*)?$/iu.test(value);
    }

    function detect(text) {
        const normalized = normalize(text);
        if (!normalized) return {
            intent: "unknown", confidence: 0, entities: {}, originalText: String(text || ""), normalizedText: ""
        };

        const candidates = [];
        const add = (intent, score, entities = {}, reason = "") => candidates.push({ intent, score, entities, reason });

        const rawCommand = String(text || "").normalize("NFKC").trim().replace(/^(?:hey|okay|ok)?\s*jarvis[\s,:-]*/i, "").trim();
        // App payload is literal content, not another intent (e.g. typing
        // "minecraft खेलेगा" must not launch Minecraft).
        const literalAppTask = parseAppTaskFlow(rawCommand.replace(/^please\s+/i, "")) || parseAppFollowUp(rawCommand.replace(/^please\s+/i, ""));
        if (literalAppTask) return { intent: "APP_TASK_FLOW", confidence: 1, entities: literalAppTask, originalText: String(text || ""), normalizedText: normalized };
        const queueSequence = rawCommand.match(/^(?:send|queue|add)\s+(?:these\s+)?messages?(?:\s+(?:to|for)\s+(chat\s*gpt|gemini|ollama))?\s*[:,-]\s*(.+)$/iu);
        if (queueSequence) {
            const messages = String(queueSequence[2] || "").split(/\s+(?:and\s+then|then|phir|uske\s+baad)\s+(?:(?:send|message|bhej(?:o)?)\s+)?/iu).map(value => value.trim()).filter(Boolean);
            if (messages.length > 1) add("AI_MESSAGE_QUEUE", 1.0, { action: "add-sequence", messages, provider: queueSequence[1] || "" }, "queue several messages to send one after another");
            else if (messages.length === 1) add("AI_MESSAGE_QUEUE", 1.0, { action: "add", message: messages[0], provider: queueSequence[1] || "" }, "add one prompt to the AI message queue");
        }
        const queueAdd = !queueSequence && (rawCommand.match(/^(?:add|queue|save)\s+(?:this\s+)?message\s+(?:to\s+(?:the\s+)?(?:ai\s+)?queue|for\s+(chat\s*gpt|gemini|ollama)(?:\s+queue)?)\s*(?:[:,-]\s*|\s+)(.+)$/iu)
            || rawCommand.match(/^queue\s+this\s+for\s+(chat\s*gpt|gemini|ollama)\s*(?:[:,-]\s*|\s+)(.+)$/iu));
        if (queueAdd) {
            const explicitTarget = queueAdd[1] && queueAdd[2] ? queueAdd[1] : "";
            const payload = queueAdd[1] && queueAdd[2] ? queueAdd[2] : queueAdd[2] || queueAdd[1];
            add("AI_MESSAGE_QUEUE", 1.0, { action: "add", message: String(payload || "").trim(), provider: explicitTarget }, "add prompt to AI message queue");
        } else if (/^(?:open|show)\s+(?:(?:the|my)\s+)?(?:ai\s+)?message\s+queue$/iu.test(normalized)) {
            add("AI_MESSAGE_QUEUE", 1.0, { action: "open" }, "open AI message queue");
        } else if (/^(?:start|send|resume|run)\s+(?:the\s+)?(?:ai\s+)?message\s+queue(?:\s+(?:to|for)\s+(chat\s*gpt|gemini|ollama))?$/iu.test(normalized)) {
            const match = normalized.match(/\b(?:to|for)\s+(chat\s*gpt|gemini|ollama)$/iu);
            add("AI_MESSAGE_QUEUE", 1.0, { action: "start", provider: match?.[1] || "" }, "start sequential AI message queue");
        } else if (/^(?:pause|stop)\s+(?:(?:the|ai)\s+)?message\s+queue$/iu.test(normalized)) {
            add("AI_MESSAGE_QUEUE", 1.0, { action: "pause" }, "pause AI message queue");
        } else if (/^(?:clear|empty)\s+(?:(?:the|ai)\s+)?message\s+queue$/iu.test(normalized)) {
            add("AI_MESSAGE_QUEUE", 1.0, { action: "clear" }, "clear AI message queue");
        }

        const presentationTopic = extractFlexiblePresentationTopic(normalized) || extractPresentationTopic(normalized);
        if (presentationTopic) {
            const options = extractPresentationOptions(normalized);
            const preferences = extractPresentationPreferences(normalized, options.slideCount);
            const missingTopic = /^(?:a|an|the|ek|एक)?\s*(?:good|great|nice|beautiful|achhi|achha|अच्छी|अच्छा|बेहतरीन|शानदार|si|se|सी|से)?\s*$/iu.test(presentationTopic.trim());
            add("CREATE_PRESENTATION", 0.998, { topic: missingTopic ? "" : presentationTopic, missingTopic, ...options, ...preferences, userRequest: String(text || "") }, "create an editable PPTX presentation");
            console.info("[NCE] PPT intent candidate", { topic: presentationTopic, slideCount: options.slideCount, imageCount: preferences.imageCount, wantsImages: preferences.wantsImages, language: preferences.language });
        }
        const pdfTopic = extractPdfTopic(normalized);
        if (pdfTopic) add("CREATE_PDF", 0.997, { topic: pdfTopic }, "create a researched topic PDF");
        const imageCreate = normalized.match(/^(?:(?:please|jarvis)\s+)*(?:create|generate|make|draw|बनाओ|बना\s+दो|तैयार\s+करो)\s+(?:an?\s+)?(?:ai\s+)?(?:image|picture|photo|इमेज|तस्वीर|फोटो)\s+(?:of|about|for|जिसमें|पर|का|की|के)?\s*(.+)$/iu);
        if (imageCreate?.[1]?.trim()) add("CREATE_IMAGE", 0.998, { prompt: cleanTopic(imageCreate[1]).slice(0, 4000) }, "generate an image with the configured HoldAPI provider");
        const spreadsheetRequest = extractSpreadsheetRequest(rawCommand);
        if (spreadsheetRequest) add("CREATE_SPREADSHEET", 0.997, { request: spreadsheetRequest }, "create a formatted Excel workbook with dashboard, formulas and chart");
        const officeOutputLocationRaw = rawCommand.match(/\b(?:in|to)\s+(downloads?|desktop|documents?)\s*$/iu)?.[1]?.toLowerCase() || "";
        const officeOutputLocation = officeOutputLocationRaw.startsWith("download") ? "downloads" : officeOutputLocationRaw.startsWith("document") ? "documents" : officeOutputLocationRaw ? "desktop" : "";
        const officeFilenameMatch = rawCommand.match(/\b(?:named|called|filename|save\s+(?:it\s+)?as)\s+([\p{L}\p{N} _.-]{1,80}?)(?=\s+(?:in|to)\s+(?:downloads?|desktop|documents?)\s*$|$)/iu);
        const officeCoreCommand = rawCommand.replace(officeFilenameMatch?.[0] || "", "").replace(/\b(?:in|to)\s+(?:downloads?|desktop|documents?)\s*$/iu, "").replace(/\s+(?:and|then|&|और)\s*$/iu, "").trim();
        const officeFile = extractOfficeFileCommand(officeCoreCommand);
        if (officeFile) add("CREATE_OFFICE_FILE", 0.998, { ...officeFile, fileName: officeFilenameMatch?.[1]?.trim() || "", outputLocation: officeOutputLocation }, `create a verified ${officeFile.format.toUpperCase()} file`);

        if (/\b(?:set|open|create)\s+(?:an?\s+)?alarms?\b|\balarms?\s+(?:set|open|lagao|laga\s+do|banao|kholo)\b|अलार्म\s*(?:सेट|लगाओ|लगा\s+दो|खोलो)?/iu.test(normalized)) {
            add("OPEN_ALARM", 0.997, { time: extractAlarmTime(normalized) }, "open Windows Clock for alarm setup");
        } else if (awaitingAlarmTime) {
            const time = extractAlarmTime(normalized);
            if (time) add("OPEN_ALARM", 0.997, { time }, "continue alarm setup with the supplied time");
        }

        const requestedProvider = normalized.match(/\b(chat\s*gpt|chatgpt|gemini)\b/i)?.[1];
        const mentionsReply = /\b(?:repl(?:y|ies)|responses?|answers?|jawab)\b|जवाब|रिप्लाई|उत्तर/iu.test(normalized);
        const mentionsShutdown = /\b(?:shutdown|shut\s+down|turn\s+off|power\s+off|band\s+(?:kar|kardo)|bandh\s+(?:kar|kardo)|system\s+off)\b|बंद\s+(?:कर|कर\s+दो|करना)|शटडाउन/iu.test(normalized);
        const replyRelation = /\b(?:after|once|when|ke\s+baad|baad|aane\s+ke\s+baad|aa\s+jaane\s+ke\s+baad)\b|के\s+बाद|बाद\s+में/iu.test(normalized);
        const mentionsSharedScreen = /\b(?:screen|visible|share|shared|on\s+display)\b|स्क्रीन|दिख/iu.test(normalized);
        const asksCancelReplyShutdown = /\b(?:cancel|cancelled|stop|रद्द|रोक|कैंसल)\b/iu.test(normalized);
        if (requestedProvider && mentionsSharedScreen && mentionsShutdown && asksCancelReplyShutdown) {
            add("SYSTEM_CONTROL", 1.0, { action: "cancel-deferred-provider-shutdown" }, "cancel screen-watched provider shutdown");
        } else if (requestedProvider && mentionsReply && mentionsShutdown && replyRelation && mentionsSharedScreen) {
            const provider = /chat\s*gpt|chatgpt/i.test(normalized) && /gemini/i.test(normalized) ? "ChatGPT and Gemini" : /gemini/i.test(requestedProvider) ? "Gemini" : "ChatGPT";
            add("SYSTEM_CONTROL", 1.0, { action: "watch-screen-reply-shutdown", provider }, "watch the shared screen for a completed provider reply, then shut down");
        } else if (requestedProvider && mentionsReply && mentionsShutdown && replyRelation && asksCancelReplyShutdown) {
            add("SYSTEM_CONTROL", 1.0, { action: "cancel-deferred-provider-shutdown" }, "cancel deferred provider shutdown");
        } else if (requestedProvider && mentionsReply && mentionsShutdown && replyRelation) {
            const provider = /gemini/i.test(requestedProvider) ? "Gemini" : "ChatGPT";
            add("SYSTEM_CONTROL", 1.0, { action: "shutdown-after-provider-reply", provider }, "deferred provider shutdown");
        }

        if (/\b(?:cancel|abort|stop)\s+(?:the\s+)?(?:scheduled\s+)?shutdown\b|(?:शटडाउन|बंद)\s+(?:टाइमर\s+)?(?:रद्द|कैंसल|रोक)/iu.test(normalized)) {
            add("SYSTEM_CONTROL", 0.999, { action: "cancel-scheduled-shutdown" }, "cancel scheduled shutdown");
        }

        const shutdownDelay = parseShutdownDelay(normalized);
        if (shutdownDelay && /shutdown|\bshut\b.{0,30}\bdown\b|power\s+(?:off|down)|turn\s+.{0,20}\boff\b|switch\s+.{0,20}\boff\b|\boff\b|बंद|शटडाउन|\bbandh?\b/iu.test(normalized)) {
            add("SYSTEM_CONTROL", 0.999, { action: "schedule-shutdown", ...shutdownDelay }, "delayed shutdown");
        }

        const computerUse = parseComputerUseCommand(rawCommand);
        if (computerUse) add("COMPUTER_USE", 1.0, computerUse, "approval-gated Windows mouse and keyboard control");
        const voiceEngineMigration = parseVoiceEngineMigrationCommand(rawCommand);
        if (voiceEngineMigration) add("VOICE_ENGINE_MIGRATION", 1.0, voiceEngineMigration, "approval-gated voice engine migration");
        else {
            const genericChange = parseGenericChangeCommand(rawCommand);
            if (genericChange) add("SYSTEM_CHANGE_PLAN", 0.995, genericChange, "reviewable and approval-gated system change plan");
        }
        const photoOrganizer = parsePhotoOrganizerCommand(rawCommand);
        if (photoOrganizer) add("PHOTO_ORGANIZER", 1.0, photoOrganizer, "local visual-similarity photo organizer");
        const fileOperations = parseFileOperationsCommand(rawCommand);
        if (fileOperations) add("FILE_OPERATIONS", 0.999, fileOperations, "approval-gated local file operation planner");
        const createFolder = parseCreateFolderCommand(rawCommand);
        if (createFolder) add("CREATE_FOLDER", 0.999, createFolder, "create a verified local folder");
        const pcDoctor = parsePCDoctorCommand(rawCommand);
        if (pcDoctor) add("PC_DOCTOR", 1.0, pcDoctor, "offline-first local computer diagnosis and approval-gated safe fixes");
        const taskMemory = parseTaskMemoryCommand(rawCommand);
        if (taskMemory) add("TASK_MEMORY", 1.0, taskMemory, "local task memory and safe replay");
        const foundation = parseFoundationCommand(rawCommand);
        if (foundation) add(foundation.kind === "workflow" ? "WORKFLOW_RECORDER" : "PERMISSION_PROFILE", 1.0, foundation, foundation.kind === "workflow" ? "local reusable workflow recipes" : "local permission profile");
        const appTaskFlow = parseAppTaskFlow(rawCommand);
        if (appTaskFlow) add("APP_TASK_FLOW", 1.0, appTaskFlow, "approval-gated multi-step app task");

        const closeAllWindows = normalized.match(/^(?:close|exit|बंद(?:\s+करो|\s+कर\s+दो)?)\s+(?:all|every|सभी)\s+(?:open\s+)?(?:windows?|apps?|applications?|विंडो|ऐप्स?)(?:\s+(?:except|excluding|सिवाय|छोड़कर)\s+(.+))?$/iu);
        if (closeAllWindows) {
            const except = String(closeAllWindows[1] || "").split(/\s*(?:,|and|और|तथा)\s*/iu).map(value => value.trim()).filter(Boolean);
            add("WINDOW_CONTROL", 1.0, { action: "close-apps", all: true, except, targets: [] }, "close all open application windows");
        } else {
            const closeOne = normalized.match(/^(?:close|exit|quit|बंद\s+करो|बंद\s+कर\s+दो)\s+(?:the\s+)?(.+?)\s*$/iu);
            if (closeOne && !/^(?:jarvis|this\s+window|browser\s+tab|tab)$/iu.test(closeOne[1].trim())) {
                const target = closeOne[1].trim().replace(/\s+(?:app|application|window)$/iu, "").trim();
                if (/^(?:notepad|chrome|google\s+chrome|edge|microsoft\s+edge|vscode|vs\s+code|visual\s+studio\s+code|calculator|calc|explorer|file\s+explorer)$/iu.test(target)) {
                    add("WINDOW_CONTROL", 1.0, { action: "close-apps", all: false, except: [], targets: [target] }, "close a named application window");
                }
            }
        }
        const minecraftWorldFlow = parseMinecraftWorldFlow(rawCommand);
        if (minecraftWorldFlow) add("MINECRAFT_WORLD_FLOW", 1.0, minecraftWorldFlow, "approval-gated SKLauncher and Minecraft world workflow");
        else {
            const minecraftLaunchFlow = parseMinecraftLaunchFlow(rawCommand);
            if (minecraftLaunchFlow) add("MINECRAFT_LAUNCH_FLOW", 1.0, minecraftLaunchFlow, "find a related Minecraft launcher and press Play after approval");
        }

        // Safety / high-priority local actions first.
        if (/^(?:shutdown|shut down|power off|turn off)(?: the)?(?: pc| computer| system)?$/i.test(normalized) ||
            /\b(?:shutdown|shut down|power off)\s+(?:my\s+)?(?:pc|computer|system)\b/i.test(normalized) ||
            /^(?:सिस्टम|कंप्यूटर|पीसी)\s+(?:शटडाउन|बंद)\s+(?:करो|कर\s+दो)$/u.test(normalized) ||
            /\b(?:pc|computer|system)\s+(?:band|bandh)\s+(?:kar\s+do|karo|kardo)\b/i.test(normalized)) {
            add("SYSTEM_CONTROL", 0.98, { action: "shutdown" }, "explicit shutdown");
        }
        if (/^(?:restart|reboot)(?: the)?(?: pc| computer| system)?$/i.test(normalized) ||
            /\b(?:restart|reboot)\s+(?:my\s+)?(?:pc|computer|system)\b/i.test(normalized) ||
            /^(?:सिस्टम|कंप्यूटर|पीसी)\s+रीस्टार्ट\s+(?:करो|कर\s+दो)$/u.test(normalized) ||
            /\b(?:pc|computer|system)\s+(?:restart|reboot)\s+(?:kar\s+do|karo|kardo)\b/i.test(normalized)) {
            add("SYSTEM_CONTROL", 0.98, { action: "restart" }, "explicit restart");
        }
        if (/^(?:sleep|go to sleep|suspend)(?: the)?(?: pc| computer| system)?$/i.test(normalized) ||
            /\bsleep\s+(?:my\s+)?(?:pc|computer|system)\b/i.test(normalized) ||
            /\b(?:put|send)\s+(?:my\s+)?(?:pc|computer|system)\s+to\s+sleep\b/i.test(normalized) ||
            /\b(?:pc|computer|system)\s+(?:sleep|suspend)\s+(?:kar\s+do|karo|kardo)\b/i.test(normalized) ||
            /\bsulao\b/i.test(normalized)) {
            add("SYSTEM_CONTROL", 0.98, { action: "sleep" }, "explicit sleep");
        }
        if (/^(?:lock)(?: the)?(?: pc| computer| system)?$/i.test(normalized) ||
            /\block\s+(?:my\s+)?(?:pc|computer|system)\b/i.test(normalized) ||
            /^(?:मेरे|मेरा)\s+(?:कंप्यूटर|पीसी|सिस्टम)\s+लॉक\s+(?:करो|कर\s+दो)$/u.test(normalized) ||
            /^(?:सिस्टम|कंप्यूटर|पीसी)\s+लॉक\s+(?:करो|कर\s+दो)$/u.test(normalized) ||
            /\b(?:pc|computer|system)\s+lock\s+(?:kar\s+do|karo|kardo)\b/i.test(normalized) ||
            /\bpc\s+lock\s+karo\b|\bcomputer\s+lock\s+karo\b/i.test(normalized)) {
            add("SYSTEM_CONTROL", 0.98, { action: "lock" }, "explicit lock");
        }
        if (/^(?:sign out|log off|logoff|log out)(?: of| from)?(?: windows)?$/i.test(normalized) ||
            /\blog\s*(?:off|out)\s+(?:my\s+)?(?:pc|computer|windows|system)\b/i.test(normalized)) {
            add("SYSTEM_CONTROL", 0.98, { action: "logoff" }, "explicit logoff");
        }

        if (/^(?:mute|mute volume|awaaz band(?: karo| kar do)?)$/i.test(normalized)) {
            add("SET_VOLUME", 0.98, { percent: 0 }, "explicit mute");
        } else {
            const volumeMatch = normalized.match(/^(?:(?:set|change|adjust)\s+)?(?:the\s*)?(?:volume|sound|awaaz|awaz|आवाज़|आवाज)\s*(?:ko\s*)?(?:(?:to|at)\s*)?(\d{1,3})\s*(?:%|percent(?:age)?|प्रतिशत)?(?:\s*(?:kar\s*do|karo|कर\s*दो))?$/i);
            if (volumeMatch) {
                add("SET_VOLUME", 0.97, { percent: Number(volumeMatch[1]) }, "explicit volume level");
            }
        }

        const geminiOnGoogle = /^(?:open|launch|start)\s+(?:google\s+)?gemini\s+(?:on\s+google|in\s+(?:the\s+)?browser|website|web)$/i.test(normalized);
        if (geminiOnGoogle) {
            add("OPEN_WEBSITE", 0.995, { site: "Gemini", url: "https://gemini.google.com" }, "Gemini website requested");
        }

        // Parse app-plus-search commands before the generic app opener so
        // the query is not swallowed into the app name.
        const combinedAppSearch = normalized.match(/^(?:open|launch|start)\s+(.+?)\s+(?:and\s+)?(?:search|find)(?:\s+for)?\s+(.+)$/iu);
        if (combinedAppSearch) {
            const rawQuery = combinedAppSearch[2].trim();
            const wantsDownload = /\s+(?:and\s+)?(?:download|install)\s+(?:it|this|that)?\s*$/iu.test(rawQuery);
            const query = rawQuery
                .replace(/\s+(?:and\s+)?(?:download|install)\s+(?:it|this|that)?\s*$/iu, "")
                .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/gu, "")
                .trim();
            add("APP_TASK_FLOW", 1.0, {
                app: combinedAppSearch[1].trim(),
                query,
                action: wantsDownload ? "download" : "search",
                approvalRequired: true
            }, "open an app and search inside it");
        }

        const requestedApp = combinedAppSearch ? null : appRequest(normalized);
        if (requestedApp && (!requestedApp.generic || !findSite(requestedApp.app))) {
            add("OPEN_APP", 0.96, requestedApp, "explicit application request");
        }

        // Music requests go straight to YouTube playback/search results. A
        // named track stays intact; generic/random requests favor trending.
        const musicMatch = normalized.match(/^(?:please\s+)?(?:play|start|put on|listen to)\s+(.+?)\s*$/i);
        const hindiMusicMatch = normalized.match(/^(?:music|gaana|गाना|म्यूजिक)\s+(?:chalao|bajao|play karo|चलाओ|बजाओ)$/iu);
        if (musicMatch || hindiMusicMatch) {
            let requested = (musicMatch?.[1] || "").replace(/^(?:some\s+)?/i, "").trim();
            const isGeneric = /^(?:music|some music|a song|songs|a playlist|random music|trending music|koi gaana|kuch gaane|गाना|गाने|म्यूजिक|रैंडम म्यूजिक)$/iu.test(requested);
            const query = isGeneric || !requested
                ? "trending music hits"
                : `${requested.replace(/^(?:the song|song|music)\s+/i, "")} official music`;
            add("SITE_SEARCH", 0.99, { site: "youtube", query }, "music playback search");
        }

        // Browser navigation/opening MUST beat knowledge/search.
        const site = findSite(normalized);
        // Combined spoken commands such as “Amazon kholo aur mouse search
        // karo” must stay on the deterministic site-search route. Without
        // this explicit pattern, the trailing “search karo” could fall into
        // generic web search or the AI fallback.
        const combinedSiteSearch = normalized.match(/^(?:open|go\s+to|visit|launch|खोलो|खोल\s+दो|खोलकर|खोलकर)\s+(amazon|flipkart|wikipedia|reddit|github|youtube)\s+(?:and|aur|और|then|फिर)\s+(?:search|find|खोजो|ढूंढो|ढूंढकर)\s+(?:for\s+)?(.+?)(?:\s+(?:karo|kar\s+do|करो|कर\s+दो))?$/iu)
            || normalized.match(/^(amazon|flipkart|wikipedia|reddit|github|youtube)\s+(?:khol(?:o)?|खोलो|खोल\s+दो)\s+(?:aur|और|and|फिर|then)\s+(.+?)\s+(?:search|find|खोजो|ढूंढो)(?:\s+(?:karo|kar\s+do|करो|कर\s+दो))?$/iu);
        if (combinedSiteSearch) {
            const combinedSite = combinedSiteSearch[1].toLowerCase();
            const combinedQuery = cleanTopic(combinedSiteSearch[2]).replace(/^(?:search|find|खोजो|ढूंढो)\s+/iu, "").trim();
            if (combinedQuery) add("SITE_SEARCH", 1.0, { site: combinedSite, query: combinedQuery }, "combined local site open and search");
        }
        const explicitNativeApp = /\b(?:google\s+chrome|chrome|microsoft\s+edge|edge|firefox|notepad|calculator|file\s+explorer|minecraft|sklauncher|vlc|discord|steam)\b/iu.test(normalized);
        if ((/^(?:open|go to|visit|launch|khol|kholo)\b/i.test(normalized) || /\s+(?:kholo|khol do|खोलो|खोल दो)$/iu.test(normalized)) && site && !explicitNativeApp && !(site === "Gemini" && !geminiOnGoogle)) {
            add("OPEN_WEBSITE", 0.98, { site, url: siteUrl(site) }, "explicit website open");
        } else if (/^(?:go to|open|visit)\s+https?:\/\//i.test(normalized)) {
            const url = normalized.match(/(?:go to|open|visit)\s+(https?:\/\/\S+)/i)?.[1];
            if (url) add("OPEN_WEBSITE", 0.99, { url }, "explicit URL");
        } else if (/^(?:go to|open|visit)\s+[\w.-]+\.[a-z]{2,}(?:\/\S*)?$/i.test(normalized)) {
            const domain = normalized.replace(/^(?:go to|open|visit)\s+/i, "");
            add("OPEN_WEBSITE", 0.99, { url: `https://${domain}` }, "domain URL");
        }

        // Specialized live-data intents.
        const weatherLocation = extractLocation(normalized);
        if (hasExplicitWeatherRequest(normalized)) {
            add("WEATHER", weatherLocation ? 0.96 : 0.90, entityMap([["location", weatherLocation]]), "weather vocabulary");
        }

        const currency = extractCurrency(normalized);
        const hasCurrencyPair = Boolean(currency.from && currency.to);
        const hasCurrencyWord = Object.keys(CURRENCY_ALIASES).some(alias => new RegExp(`\\b${escapeRegExp(alias)}\\b`, "i").test(normalized));
        const explicitRateRequest = /\b(?:exchange\s+rate|currency\s+(?:conversion|convert|exchange)|convert\s+(?:currency|money))\b/i.test(normalized);
        const convertWithCurrencyWord = /\bconvert\b/i.test(normalized) && hasCurrencyWord;
        if (hasCurrencyPair || explicitRateRequest || convertWithCurrencyWord) {
            add("CURRENCY", hasCurrencyPair ? 0.98 : 0.96, entityMap([
                ["amount", currency.amount], ["fromCurrency", currency.from], ["toCurrency", currency.to]
            ]), "currency vocabulary");
        }

        const timeLocation = "Delhi";
        if (isDirectTimeRequest(normalized)) {
            add("TIME", 0.99, entityMap([["location", timeLocation], ["timezone", "Asia/Kolkata"]]), "Delhi time vocabulary");
        }

        if (isDirectDateRequest(normalized)) {
            add("DATE", 0.99, {}, "current date request");
        }

        const recipeQuery = pickAfter(normalized, [
            /\b(?:recipe|recipes)\s+(?:for|of|about)?\s*(.+)$/i,
            /^(.+?)\s+(?:recipe|recipes)$/i,
            /\bhow\s+(?:do|can)\s+i\s+(?:make|cook)\s+(.+)$/i,
            /\bhow\s+to\s+(?:make|cook)\s+(.+)$/i,
            /\b(?:kaise\s+banaye|khana\s+kaise\s+banta)\s+(.+)$/i
        ]);
        if (/\b(?:recipe|recipes|kaise banaye|khana kaise banta)\b/i.test(normalized) ||
            /\bhow\s+(?:do|can)\s+i\s+(?:make|cook)\b/i.test(normalized) ||
            /\bhow\s+to\s+(?:make|cook)\b/i.test(normalized)) {
            add("RECIPE_SEARCH", recipeQuery ? 0.96 : 0.75, entityMap([["query", recipeQuery]]), "recipe vocabulary");
        }

        let pokemon = "";
        for (const name of KNOWN_POKEMON) if (new RegExp(`\\b${escapeRegExp(name)}\\b`, "i").test(normalized)) pokemon = name;
        if (pokemon || /\bpok[eé]mon\b/i.test(normalized)) {
            if (!pokemon) pokemon = pickAfter(normalized, [/\bpok[eé]mon\s+(.+)$/i]);
            add("POKEMON", pokemon ? 0.97 : 0.72, entityMap([["pokemon", pokemon]]), "pokemon entity");
        }

        const show = KNOWN_SHOWS.find(name => normalized.includes(name));
        const tvQuery = show || pickAfter(normalized, [
            /\b(?:tv show|tv series|series|serial|episode(?:s)?\s+of)\s+(.+)$/i,
            /\b(?:search|find)\s+(.+)\s+(?:tv show|series)$/i
        ]);
        if (show || /\b(?:tv show|tv series|episode|episodes|serial|series)\b/i.test(normalized)) {
            add("TV_SEARCH", tvQuery ? 0.96 : 0.74, entityMap([["query", tvQuery]]), "tv vocabulary/title");
        }

        const bookQuery = pickAfter(normalized, [
            /\b(?:books?|kitab|kitabein)\s+(?:about|on|by|for)?\s*(.+)$/i,
            /^(.+?)\s+(?:books?|kitab|kitabein)$/i,
            /\bfind\s+books?\s+(?:about|by|for)?\s*(.+)$/i
        ]);
        if (/\b(?:books?|kitab|kitabein)\b/i.test(normalized)) {
            add("BOOK_SEARCH", bookQuery ? 0.95 : 0.73, entityMap([["query", bookQuery]]), "book vocabulary");
        }

        const imageQuery = pickAfter(normalized, [
            /\b(?:show|find|search)\s+(?:me\s+)?(?:an?\s+)?(?:images?|pictures?|photos?|pics?)\s+(?:of|for|about)?\s*(.+)$/i,
            /\b(?:images?|pictures?|photos?|pics?)\s+(?:of|for)?\s*(.+)$/i,
            /\b(?:tasveer|tasveerein|photo)\b.*?\b(?:of|ki|ke|ka)\s+(.+)$/i,
            /\b(?:show|find|search)\s+(?:me\s+)?(.+?)\s+(?:images?|pictures?|photos?|pics?)$/i
        ]);
        if (/\b(?:images?|pictures?|photos?|pics?|tasveer|tasveerein)\b/i.test(normalized)) {
            add("IMAGE_SEARCH", imageQuery ? 0.95 : 0.72, entityMap([["query", imageQuery]]), "image vocabulary");
        }
        const videoQuery = pickAfter(normalized, [
            /\b(?:videos?|clips?)\s+(?:of|for|about)?\s*(.+)$/i,
            /\b(?:video|videos)\s+(?:dikhao|dikhado|search|find)\s*(?:of|for)?\s*(.+)$/i,
            /\b(.+?)\s+(?:ke|ki|ka)\s+(?:videos?|clips?)\b/i,
            /\b(.+?)\s+(?:videos?|clips?)\s+(?:dikhao|dikhado|search|find)\b/i
        ]);
        if (/\b(?:videos?|clips?)\b/i.test(normalized)) {
            add("VIDEO_SEARCH", videoQuery ? 0.97 : 0.74, entityMap([["query", videoQuery]]), "video vocabulary");
        }


        const githubQuery = pickAfter(normalized, [
            /\b(?:github|git hub)\s+(?:information|info|details?|repositories|repos|projects?)\s+(?:about|for|on|regarding)?\s*(.+)$/i,
            /\b(?:information|info|details?)\s+(?:about|on|for)\s+(.+?)\s+(?:from|on|in)\s+(?:github|git hub)\b/i,
            /\b(?:tell me about|explain|what is)\s+(.+?)\s+(?:on|from|in)\s+(?:github|git hub)\b/i,
            /\b(?:find|search)\s+(.+?)\s+(?:on|from|in)\s+(?:github|git hub)\b/i,
            /\b(?:github|git hub)\s+(?:se|par|pe)\s+(.+)$/i,
            /\b(?:github|git hub)\s+(?:ke\s+)?baare\s+mein\s+(.+)$/i,
            /\b(.+?)\s+(?:ki|ka|ke)\s+(?:information|info|jaankari)\s+(?:github|git hub)\s+(?:se|par|pe)$/i,
            /\bgithub\s+(?:for|about|search|repositories?|repos?)\s*(.*)$/i,
            /\b(?:search|find)\s+github\s+(?:for)?\s*(.+)$/i,
            /\b(?:find|search)\s+(.+?)\s+(?:projects?|repositories?|repos?)\s+on\s+github\b/i,
            /^(.+?)\s+github\s+(?:repositories?|repos?)$/i,
            /\b(?:find|search)\s+(?:github\s+)?(?:repositories|repos|projects)\s+(?:for|about)?\s*(.+)$/i
        ]);
        if (/\bgithub\b/i.test(normalized) && !/^(?:open|go to|visit)\s+github$/i.test(normalized)) {
            if (/\b(?:user|username|profile)\b/i.test(normalized)) {
                const username = pickAfter(normalized, [/\bgithub\s+(?:user|username|profile)\s+([\w-]+)/i]);
                add("GITHUB_SEARCH", username ? 0.97 : 0.75, entityMap([["username", username]]), "github user");
            } else if (githubQuery || /\b(?:repo|repos|repository|project|projects)\b/i.test(normalized)) {
                const githubTopic = String(githubQuery || "").replace(/\b(?:information|info|details?|about|from|on|in|please|mujhe|search|find|tell me|repositories|repos|projects?)\b/gi, " ").replace(/(?:के\s+बारे\s+में|जानकारी|बताओ|बताइए|मुझे|की|का|के|से|पर)/gu, " ").replace(/\s+/g, " ").trim();
                add("GITHUB_SEARCH", githubTopic ? 0.96 : 0.74, entityMap([["query", githubTopic]]), "github repository search");
            }
        }

        const newsQuery = pickAfter(normalized, [
            /\b(?:latest|today(?:'s)?|current)\s+(.+?)\s+news\b/i,
            /\bnews\s+(?:about|on|for)\s+(.+)$/i,
            /\b(?:khabar|samachar)\s+(?:about|on|ke baare mein)\s+(.+)$/i
        ]);
        if (newsQuery || /^(?:(?:latest|today'?s|current)\s+)?(?:news|khabar|samachar)\s+(?:batao|dikhाओ|dikhao|about|on|के बारे में|के बारे मे)\b/iu.test(normalized)) {
            add("NEWS", newsQuery ? 0.95 : 0.73, entityMap([["topic", cleanTopic(newsQuery || "India")], ["timeRange", /\b(?:latest|today|today's|current)\b/i.test(normalized) ? "latest" : "recent"]]), "news vocabulary");
        }

        // Search directly on the named site. Keep this above generic web
        // search so "search headphones on Amazon" doesn't go to Google.
        const siteSearch = normalized.match(/\b(?:search|find)\s+(?:(?:on|in|from)\s+)?(wikipedia|amazon|flipkart|reddit|github|youtube)\s+(?:for\s+)?(.+)$/i)
            || normalized.match(/\b(?:search|find)\s+(.+?)\s+(?:on|in)\s+(wikipedia|amazon|flipkart|reddit|github|youtube)\b/i)
            || normalized.match(/\b(wikipedia|amazon|flipkart|reddit|github|youtube)\s+(?:search|search for)\s+(.+)$/i);
        if (siteSearch) {
            const reversed = /^(?:wikipedia|amazon|flipkart|reddit)$/i.test(siteSearch[1]);
            const site = (reversed ? siteSearch[1] : siteSearch[2]).toLowerCase();
            const query = cleanTopic(reversed ? siteSearch[2] : siteSearch[1]);
            if (query && site === "wikipedia") {
                add("SITE_SEARCH", 0.98, { site, query }, "targeted Wikipedia search");
            } else if (query && site === "github") {
                const githubTopic = query.replace(/\b(?:information|info|details?|about|from|on|in|please|mujhe|repositories|repos|projects?)\b/gi, " ").replace(/(?:के\s+बारे\s+में|जानकारी|बताओ|बताइए|मुझे|की|का|के)/gu, " ").replace(/\s+/g, " ").trim();
                if (githubTopic) add("GITHUB_SEARCH", 0.98, { query: githubTopic }, "GitHub API search");
            } else if (query) {
                add("SITE_SEARCH", 0.98, { site, query }, "targeted site search");
            }
        }

        const locationQuery = pickAfter(normalized, [
            /\b(?:where is|locate|find|location of|address of|coordinates of)\s+(.+)$/i,
            /\b(.+?)\s+(?:kahan hai|kahan hai batao)\b/i
        ]);
        const landmark = KNOWN_LANDMARKS.find(name => normalized.includes(name));
        if (landmark && /^find\s+/i.test(normalized) && !/\b(?:images?|pictures?|photos?|pics?)\b/i.test(normalized)) {
            add("LOCATION", 0.96, { place: landmark }, "known landmark");
        } else if (/\b(?:where is|locate|location of|address of|coordinates of|kahan hai|coordinates)\b/i.test(normalized)) {
            add("LOCATION", locationQuery ? 0.95 : 0.72, entityMap([["place", locationQuery]]), "location vocabulary");
        }

        const countryQuery = pickAfter(normalized, [
            /\b(?:capital|population|currency)\s+(?:of)\s+(.+)$/i,
            /\bcountry\s+(?:info|information)\s+(?:for|about)?\s*(.+)$/i
        ]);
        if (/\b(?:capital of|population of|currency of|country info|country information)\b/i.test(normalized)) {
            add("COUNTRY_INFO", countryQuery ? 0.96 : 0.72, entityMap([["country", countryQuery]]), "country vocabulary");
        }

        // Explicit web search is lower priority than open-site commands.
        const searchQuery = pickAfter(normalized, [
            // Accept natural word orders such as "Minecraft find on Google"
            // and "RTX 5090 etc find on Google"; otherwise the generic
            // find-prefix rule below incorrectly searches for "on Google".
            /\b(.+?)\s+(?:find|search)\s+(?:on|in)\s+(?:google|the web|the internet|the browser)$/i,
            /\b(?:find|search)\s+(?:for\s+)?(.+?)\s+(?:on|in)\s+(?:google|the web|the internet|the browser)$/i,
            /\bsearch\s+(?:the\s+web\s+)?(?:google|youtube|github)?\s*(?:for)?\s*(.+)$/i,
            /\bgoogle\s+(?:for)?\s*(.+)$/i,
            /\b(?:find|look for)\s+(.+)$/i,
            /\b(.+?)\s+(?:ko\s+)?(?:search|google)\s+karo\b/i
        ]);
        if (searchQuery) add("SEARCH_WEB", 0.88, { query: searchQuery }, "explicit search");

        const knowledgeTopic = pickAfter(normalized, [
            /^(.+?)\s+(?:ke baare mein|ke bare mein)\s+(?:batao|bata|information do|info do)$/i,
            /\b(?:tell me about|what is|what's|who is|explain)\s+(.+)$/i,
            /\b(?:information|info)\s+(?:about|on)?\s*(.+)$/i,
            /\b(.+?)\s+(?:information|info)$/i,
            /\b(.+?)\s+(?:kya hai)\b/i
        ]);
        if (knowledgeTopic) add("KNOWLEDGE", 0.86, { topic: knowledgeTopic }, "knowledge question");

        if (/^\s*(?:hi|hello|hey|namaste|namaskar)\s*$/i.test(normalized)) {
            add("GREETING", 0.99, {}, "greeting");
        }

        candidates.sort((a, b) => b.score - a.score);
        const best = candidates[0];
        const second = candidates[1];
        if (!best) {
            return { intent: "unknown", confidence: 0, entities: {}, originalText: String(text || ""), normalizedText: normalized, ambiguous: false, candidates: [] };
        }

        const difference = second ? best.score - second.score : 1;
        const ambiguous = best.score < 0.70 || (second && difference < 0.08 && best.score < 0.90);

        return {
            intent: best.intent,
            confidence: confidence(best.score, []),
            entities: best.entities || {},
            originalText: String(text || ""),
            normalizedText: normalized,
            ambiguous: Boolean(ambiguous),
            ambiguityDifference: Number(difference.toFixed(3)),
            candidates: candidates.slice(0, 4).map(c => ({ intent: c.intent, confidence: Number(c.score.toFixed(3)) })),
            reason: best.reason,
            version: VERSION
        };
    }

    function findSite(text) {
        const sites = {
            youtube: "YouTube", gmail: "Gmail", google: "Google", github: "GitHub", "outlook.com": "Outlook.com",
            chatgpt: "ChatGPT", gemini: "Gemini",
            reddit: "Reddit", amazon: "Amazon", flipkart: "Flipkart", wikipedia: "Wikipedia",
            facebook: "Facebook", instagram: "Instagram", twitter: "Twitter", x: "X",
            linkedin: "LinkedIn", netflix: "Netflix", spotify: "Spotify"
        };
        for (const key of Object.keys(sites)) if (new RegExp(`(?:^|\\s)${escapeRegExp(key)}(?:$|\\s)`, "i").test(text)) return sites[key];
        return "";
    }

    function siteUrl(site) {
        const map = {
            YouTube: "https://www.youtube.com", Gmail: "https://mail.google.com", Google: "https://www.google.com",
            GitHub: "https://github.com", Reddit: "https://www.reddit.com", Amazon: "https://www.amazon.com",
            Flipkart: "https://www.flipkart.com", Wikipedia: "https://www.wikipedia.org", Facebook: "https://www.facebook.com",
            Instagram: "https://www.instagram.com", Twitter: "https://x.com", X: "https://x.com",
            LinkedIn: "https://www.linkedin.com", Netflix: "https://www.netflix.com", Spotify: "https://open.spotify.com",
            ChatGPT: "https://chatgpt.com", Gemini: "https://gemini.google.com", "Outlook.com": "https://outlook.live.com/mail/"
        };
        return map[site] || Object.entries(map).find(([name]) => name.toLowerCase() === String(site || "").toLowerCase())?.[1] || "";
    }

    function clarification(result, rawText = "") {
        const e = result.entities || {};
        const lang = window.JARVISLanguageCore?.detectLanguage?.(rawText) || "en";
        const hi = lang === "hi" || lang === "hinglish";
        switch (result.intent) {
            case "WEATHER":
                if (!e.location) return hi ? "किस शहर या देश का मौसम बताऊँ?" : "Which city or country’s weather should I check?";
                if (/^(?:europe|यूरोप)(?:\b|\s)/iu.test(e.location) || /\b(?:any|kisi bhi)\s+(?:european\s+)?(?:country|desh)\b/i.test(rawText)) {
                    return hi ? "यूरोप में किस देश या शहर का मौसम देखूँ? उदाहरण के लिए: दिल्ली, पेरिस या फ्रांस।" : "Which European country or city should I check? For example, Paris or France.";
                }
                return null;
            case "CURRENCY":
                if (e.amount == null && !e.fromCurrency && !e.toCurrency) return "Sure. How much would you like to convert, and to which currency?";
                if (e.amount == null) return "How much would you like to convert?";
                if (!e.fromCurrency || !e.toCurrency) return "Which currencies should I convert between?";
                return null;
            case "BOOK_SEARCH": return e.query ? null : "Which books or author should I search for?";
            case "TV_SEARCH": return e.query ? null : "Which TV show should I search for?";
            case "RECIPE_SEARCH": return e.query ? null : "What dish or ingredient should I find a recipe for?";
            case "POKEMON": return e.pokemon ? null : "Which Pokémon should I look up?";
            case "IMAGE_SEARCH": return e.query ? null : "What should I search images for?";
            case "VIDEO_SEARCH": return e.query ? null : "What should I search videos for?";
            case "GITHUB_SEARCH": return e.query || e.username ? null : "What should I search for on GitHub?";
            case "TIME":
                if (!e.location) return null;
                if (/^(?:europe|यूरोप)$/iu.test(e.location)) return hi ? "यूरोप के किस शहर या देश का समय बताऊँ?" : "Which European city or country should I check the time for?";
                return null;
            case "SITE_SEARCH": return e.query ? null : "What should I search for?";
            case "LOCATION": return e.place ? null : "Which place should I locate?";
            case "KNOWLEDGE": return e.topic ? null : "What would you like me to explain?";
            case "NEWS": return e.topic ? null : "What news topic should I check?";
            case "COUNTRY_INFO": return e.country ? null : "Which country should I look up?";
            default: return null;
        }
    }

    async function execute(result) {
        const data = window.jarvis && window.jarvis.data;
        const system = window.jarvis && window.jarvis.system;
        const browser = window.jarvis && window.jarvis.browser;
        const e = result.entities || {};
        const ensureAccessOS = async () => {
            const computer = window.JARVISComputerUse;
            if (!computer) return "JARVIS Autopilot Mode controls are unavailable in this build.";
            if (!computer.isActive?.()) {
                const started = await computer.start?.();
                if (started?.success === false) return started.error || "JARVIS Autopilot Mode could not start.";
            }
            const access = await computer.setAccessMode?.(true);
            if (access?.success === false) return access.error || "Autopilot could not start screen sharing.";
            return null;
        };
        const detectStoreOffer = async (vision) => {
            if (!vision?.locateTarget || !vision.isActive?.()) return { status: "unknown" };
            const paid = await vision.locateTarget("a visible price, Buy, Purchase, paid, or payment label").catch(() => null);
            const free = await vision.locateTarget("a visible Free, Get, Install, or Trial label").catch(() => null);
            if (paid?.success === true && paid.visible === true && !(free?.success === true && free.visible === true)) return { status: "paid" };
            if (free?.success === true && free.visible === true) return { status: "free" };
            return { status: "unknown" };
        };
        // Keep the original request available to language and smart-reply
        // helpers. Several intent branches used an out-of-scope `input` name,
        // which turned otherwise successful answers into service errors.
        const input = result.originalText || result.normalizedText || "";
        let preserveResponse = false;

        const log = (...args) => console.log("[NCE]", ...args);
        log("🎤 STT Transcript:", result.originalText);
        log("🧹 Normalized:", result.normalizedText);
        log("🧠 Intent:", result.intent);
        log("📊 Confidence:", result.confidence);
        log("📦 Entities:", e);

        const clarificationText = clarification(result, result.originalText || "");
        if (clarificationText) {
            log("❓ Clarification:", clarificationText);
            return { handled: true, source: "natural-intent", response: clarificationText, intent: result.intent, confidence: result.confidence, entities: e, clarification: true };
        }

        if (result.ambiguous && result.confidence < 0.90) {
            const response = "I’m not fully sure what you mean. Could you be a little more specific?";
            log("❓ Ambiguous:", result.candidates);
            return { handled: true, source: "natural-intent", response, intent: result.intent, confidence: result.confidence, entities: e, clarification: true, candidates: result.candidates };
        }

        try {
            let response = "";
            // Rich UI payload is optional. Keep it defined for every intent
            // so non-image services can never fail with ReferenceError.
            let richContent = null;
            switch (result.intent) {
                case "VOICE_ENGINE_MIGRATION": {
                    const migration = window.jarvis?.voice?.engineMigrationPreflight;
                    const status = window.jarvis?.voice?.engineMigrationStatus;
                    if (e.action === "status") {
                        const current = status ? unwrap(await status()) : null;
                        response = current?.success === false ? (current.error || "Voice engine status is unavailable.") : `The active voice engine is ${current?.activeEngine || "unknown"}. Whisper rollback is preserved.`;
                        preserveResponse = true;
                        break;
                    }
                    if (typeof migration !== "function") {
                        response = "Voice engine migration is unavailable in this build.";
                        break;
                    }
                    const check = unwrap(await migration(e.target));
                    response = check?.success
                        ? `I can prepare the ${e.target} migration, but I will ask for approval before installing or switching it.`
                        : (check?.error || "I could not safely prepare that voice engine migration. The current engine is unchanged.");
                    preserveResponse = true;
                    break;
                }
                case "SYSTEM_CHANGE_PLAN": {
                    const planner = window.jarvis?.system?.changePlan;
                    if (typeof planner !== "function") {
                        response = "The safe change planner is unavailable in this build.";
                        break;
                    }
                    const plan = unwrap(await planner({ from: e.from, to: e.to, request: e.request }));
                    response = plan?.success
                        ? `I prepared a safe change plan from ${e.from} to ${e.to}. I will check compatibility, ask before installing, test the replacement, preserve rollback, and ask separately before cleanup. Nothing has changed yet.`
                        : (plan?.error || "I could not prepare that change safely.");
                    preserveResponse = true;
                    break;
                }
                case "PHOTO_ORGANIZER": {
                    const organizer = window.jarvis?.photoOrganizer;
                    const attached = window.JARVISFileContext?.getFile?.();
                    if (!organizer?.preview || !organizer?.pickFolder || !organizer?.organize) {
                        response = "The local photo organizer is unavailable in this build.";
                        break;
                    }
                    if (!attached || attached.contentType !== "image" || !attached.path) {
                        response = "Chat में reference photo attach करो, फिर बोलो: इस photo जैसी सारी photos अलग folder में डाल दो।";
                        break;
                    }
                    const folderResult = await organizer.pickFolder();
                    if (!folderResult?.success || !folderResult.path) {
                        response = "Search करने के लिए कोई folder select नहीं हुआ; मैंने कोई file नहीं बदली।";
                        break;
                    }
                    const destination = `${folderResult.path}\\${e.folderName || "Matched Photos"}`;
                    const preview = unwrap(await organizer.preview({ referencePath: attached.path, searchRoot: folderResult.path, destinationFolder: destination, threshold: 0.86 }));
                    if (preview?.success === false) {
                        response = preview.error || "Photo matching safely complete नहीं हो पाया।";
                        break;
                    }
                    const approved = window.confirm(`JARVIS को ${preview?.count || 0} similar photos मिलीं। क्या इन्हें “${e.folderName || "Matched Photos"}” folder में copy कर दूँ? Originals सुरक्षित रहेंगी।`);
                    if (!approved) {
                        response = "ठीक है, preview के बाद copying cancel कर दी। Originals में कोई बदलाव नहीं हुआ।";
                        break;
                    }
                    const organized = unwrap(await organizer.organize({ referencePath: attached.path, searchRoot: folderResult.path, destinationFolder: destination, threshold: 0.86, approved: true }));
                    response = organized?.success === false
                        ? (organized.error || "Photos copy नहीं हो पाईं; originals सुरक्षित हैं।")
                        : `${organized?.copiedCount || 0} similar photos को अलग folder में copy कर दिया। Originals सुरक्षित हैं।`;
                    preserveResponse = true;
                    break;
                }
                case "PC_DOCTOR": {
                    const doctor = window.jarvis?.system;
                    if (!doctor?.pcDoctorScan) { response = "Smart PC Doctor is unavailable in this build."; break; }
                    if (e.action === "apply-safe") {
                        const report = unwrap(await doctor.pcDoctorScan());
                        const fixes = report?.safeFixes || [];
                        if (!fixes.length) { response = "Offline scan में कोई approved safe fix available नहीं है।"; break; }
                        const approved = window.confirm(`JARVIS को ${fixes.length} safe fix(s) apply करने की permission दें? सिर्फ app-owned data बदलेगा।`);
                        if (!approved) { response = "ठीक है, safe fixes apply नहीं किए।"; break; }
                        const applied = unwrap(await doctor.pcDoctorApply(fixes.map(fix => fix.id), true));
                        response = applied?.success === false ? (applied.error || "Safe fixes apply नहीं हो पाए।") : "Approved safe fixes apply हो गए। अब verification के लिए offline scan फिर से चला दिया है।";
                        break;
                    }
                    const report = unwrap(await doctor.pcDoctorScan());
                    if (report?.success === false) { response = report.error || "Offline PC scan पूरा नहीं हो पाया।"; break; }
                    const issueCount = (report.issues || []).length;
                    response = issueCount
                        ? `Offline PC Doctor scan पूरा हुआ: ${report.summary} ${report.safeFixes?.length || 0} safe fix(s) approval के लिए ready हैं।`
                        : "Offline PC Doctor scan पूरा हुआ। कोई actionable local issue नहीं मिला।";
                    preserveResponse = true;
                    break;
                }
                case "FILE_OPERATIONS": {
                    const systemOps = window.jarvis?.system;
                    if (!systemOps) { response = "The local file operations planner is unavailable in this build."; break; }
                    if (e.action === "downloads-cleanup") {
                        const plan = unwrap(await systemOps.downloadsCleanupPlan({ preserveNames: e.preserveNames }));
                        response = plan?.code === "APPROVAL_REQUIRED"
                            ? `I found ${plan.candidateCount || 0} Downloads items to review and preserved ${plan.preserved?.length || 0} launcher item(s). I will not permanently delete them automatically.`
                            : (plan?.error || "Downloads cleanup was not executed.");
                    } else if (e.action === "backup-plan") {
                        const plan = unwrap(await systemOps.backupPlan({ source: e.sourceDrive, destination: e.destinationDrive }));
                        response = plan?.success ? `Backup plan prepared from ${e.sourceDrive} to ${e.destinationDrive}. Nothing has been copied yet; approval and free-space verification are required.` : (plan?.error || "Backup plan could not be prepared safely.");
                    } else if (e.action === "desktop-organize-images") {
                        const organizer = systemOps.organizeDesktopImages;
                        if (typeof organizer !== "function") { response = "Desktop image organization is unavailable in this JARVIS build."; break; }
                        const preview = unwrap(await organizer({ folderName: e.folderName, mode: "preview" }));
                        if (!preview?.success) { response = preview?.error || "I couldn't scan the Desktop safely."; break; }
                        if (!preview.count) { response = "Desktop पर कोई image नहीं मिली; मैंने कोई folder या file नहीं बदली।"; break; }
                        const approved = window.confirm(`Desktop पर ${preview.count} images मिलीं। क्या इन्हें “${e.folderName}” folder में copy कर दूँ? Originals सुरक्षित रहेंगी।`);
                        if (!approved) { response = "ठीक है, मैंने कुछ नहीं बदला।"; break; }
                        const organized = unwrap(await organizer({ folderName: e.folderName, mode: "copy", approved: true }));
                        response = organized?.success === false
                            ? (organized.error || "Images copy नहीं हो पाईं; originals सुरक्षित हैं।")
                            : `${organized.copiedCount || 0} images को Desktop के “${e.folderName}” folder में copy कर दिया। Originals सुरक्षित हैं।`;
                    } else {
                        response = "Photo labels can be saved locally when a specific photo and label are provided. JARVIS will not guess who a person is from a photo.";
                    }
                    preserveResponse = true;
                    break;
                }
                case "CREATE_FOLDER": {
                    const files = window.jarvis?.files;
                    const systemPaths = window.jarvis?.system?.paths;
                    if (!files?.createFolder || !systemPaths) { response = "The local folder service is unavailable in this build."; break; }
                    const pathResult = unwrap(await systemPaths());
                    const base = pathResult?.paths?.[e.location] || pathResult?.[e.location];
                    if (!base) { response = "I could not resolve the requested folder location safely."; break; }
                    const separator = /[\\/]$/.test(base) ? "" : "\\";
                    const target = `${base}${separator}${e.folderName}`;
                    const created = unwrap(await files.createFolder(target));
                    const responseLang = window.JARVISLanguageCore?.detectLanguage?.(input) || "en";
                    response = created?.success === false
                        ? (created.error || (responseLang === "hi" || responseLang === "hinglish" ? "Folder नहीं बन सका।" : "The folder could not be created."))
                        : (responseLang === "hi" || responseLang === "hinglish"
                            ? `“${e.folderName}” नाम का folder ${e.location === "desktop" ? "Desktop" : e.location} पर बना दिया है।`
                            : `Folder “${e.folderName}” created in ${e.location}.`);
                    preserveResponse = true;
                    break;
                }
                case "GREETING":
                    {
                        const lang = (window.JARVISLanguageCore && window.JARVISLanguageCore.detectLanguage(input)) || "en";
                        const identity = await getActiveIdentity();
                        if (identity?.name) {
                            const key = `jarvis:introduced:${identity.userId || "guest"}`;
                            let firstGreeting = false;
                            try {
                                firstGreeting = localStorage.getItem(key) !== "true";
                                if (firstGreeting) localStorage.setItem(key, "true");
                            } catch (_) {}
                            if (lang === "hi" || lang === "hinglish") {
                                response = firstGreeting
                                    ? `नमस्ते ${identity.name}, मैं JARVIS हूँ। बताइए, मैं आपकी क्या मदद करूँ?`
                                    : `नमस्ते ${identity.name}, बताइए मैं क्या करूँ?`;
                            } else {
                                response = firstGreeting
                                    ? `Hello ${identity.name}. I am JARVIS, your local assistant. How can I help?`
                                    : `Hello again, ${identity.name}. How can I help?`;
                            }
                            preserveResponse = true;
                        } else if (window.JARVISSmartReplies) {
                            response = window.JARVISSmartReplies.get("GREETING", { lang }) || "Hello. JARVIS is online.";
                        } else {
                            response = "Hello. JARVIS is online. How may I assist you?";
                        }
                    }
                    break;
                case "OPEN_APP":
                    if (!system?.openApp) return { handled: false };
                    log("🧭 Router: system.openApp", e.app);
                    log("🔌 Service: SystemController");
                    const autopilot = window.JARVISComputerUse?.isAutopilotActive?.() === true;
                    if (autopilot) {
                        const accessError = await ensureAccessOS();
                        if (accessError) { response = accessError; break; }
                    }
                    const appResult = await system.openApp(e.app);
                    if (appResult?.success === true) lastOpenedApp = String(e.app || "").trim();
                    if (appResult?.success !== true) {
                        response = appResult?.error || `Windows did not confirm the launch request for ${e.app}. Try App Library.`;
                        preserveResponse = true;
                        break;
                    }
                    if (autopilot && window.JARVISScreenShare?.understandState) {
                        // Do not block the voice command on a second vision
                        // round after Windows has already launched the app.
                        // The background Autopilot watcher continues the same
                        // inspection asynchronously while the user can issue
                        // the next command immediately.
                        const openedName = appResult.data?.app || appResult.app || e.app;
                        const inspect = () => window.JARVISScreenShare
                            .understandState(`Inspect the newly opened ${e.app} window. Report the app, visible screen, blockers, and visible controls. Do not perform any action and do not guess unreadable text.`)
                            .catch(() => null);
                        if (typeof window.setTimeout === "function") window.setTimeout(inspect, 0);
                        else inspect();
                        response = `I opened ${openedName}. Screen inspection is running; tell me the next action.`;
                    } else response = `Opening ${appResult.data?.app || appResult.app || e.app}.`;
                    preserveResponse = true;
                    break;
                case "MINECRAFT_WORLD_FLOW": {
                    if (!system?.openApp) { response = "The Windows app launcher is unavailable in this build."; break; }
                    const computer = window.JARVISComputerUse;
                    const vision = window.JARVISScreenShare;
                    const accessError = await ensureAccessOS();
                    if (accessError) { response = accessError; break; }
                    const launchResult = unwrap(await system.openApp("minecraft launcher"));
                    if (launchResult?.success === false) {
                        response = launchResult.error || "I couldn't open SKLauncher.";
                        break;
                    }
                    if (!computer?.isActive?.()) { response = "Computer Use could not be activated safely."; break; }
                    if (typeof computer.locateAndApproveClick !== "function") {
                        response = "SKLauncher is open, but Autopilot computer control is unavailable.";
                        break;
                    }
                    const workflow = window.JARVISVisualWorkflow;
                    if (!workflow?.run) { response = "The adaptive visual workflow engine is unavailable in this build."; break; }
                    await new Promise(resolve => setTimeout(resolve, 2500));
                    const flowResult = await workflow.run({
                        name: "minecraft-first-survival",
                        steps: [
                            {
                                label: "Minecraft launch",
                                target: "the Minecraft launch or Play button in SKLauncher",
                                alternatives: ["the Minecraft Play button", "the Launch button", "the Start button"],
                                verify: { target: "the Minecraft main menu with its Play button or world selection screen", attempts: 2 },
                                stateQuestion: "Is SKLauncher still loading, or did Minecraft reach its main menu/world selection screen?",
                                afterMs: 5000
                            },
                            {
                                label: "first Survival world",
                                target: "the first visible Survival world entry in Minecraft",
                                alternatives: ["the first world in the Survival list", "the top Survival world entry"],
                                verify: { target: "a selected Minecraft Survival world entry with its world action controls", attempts: 2 },
                                stateQuestion: "Is the first Survival world visible and selected, or did Minecraft show a different screen?",
                                afterMs: 1200
                            },
                            {
                                label: "world join",
                                target: "the Play or Join button for the selected Survival world",
                                alternatives: ["the Join button", "the Play selected world button", "the Enter world button"],
                                verify: { target: "Minecraft gameplay HUD, crosshair, or the world loading screen", attempts: 2 },
                                stateQuestion: "Did Minecraft enter the selected world, or is a loading/error screen still visible?",
                                afterMs: 800
                            }
                        ]
                    }, { maxAttempts: 2 });
                    response = flowResult?.success
                        ? "Minecraft is open and the first Survival world join sequence completed with your approval."
                        : (flowResult?.error || "The visual workflow paused safely and did not guess the next action.");
                    break;
                }
                case "APP_TASK_FLOW": {
                    preserveResponse = true;
                    const contextual = e.contextual === true;
                    if (!contextual && !system?.openApp) { response = "The Windows app launcher is unavailable in this build."; break; }
                    const computer = window.JARVISComputerUse;
                    const vision = window.JARVISScreenShare;
                    let sourceApp = String(e.app || lastOpenedApp || "").trim();
                    const accessError = await ensureAccessOS();
                    if (accessError) { response = accessError; break; }
                    let opened = { success: true };
                    if (!contextual) {
                        const launchOptions = /^(?:google\s+)?chrome$/i.test(String(sourceApp || "")) ||
                            /^(?:microsoft\s+store|store)$/i.test(String(sourceApp || ""))
                            ? { searchQuery: e.query }
                            : {};
                        const launchResponse = await system.openApp(sourceApp, launchOptions);
                        opened = { ...unwrap(launchResponse), success: launchResponse?.success === true };
                        if (opened?.success === false) {
                            response = opened.error || (e.action === "type"
                                ? `I couldn't open ${sourceApp}.`
                                : `I couldn't find an official source for ${e.query}.`);
                            break;
                        }
                        lastOpenedApp = sourceApp || lastOpenedApp;
                        if (e.query) lastOpenedQuery = String(e.query).trim();
                    }
                    if (e.action === "inspect") {
                        const observed = await vision?.understandState?.(`Inspect the currently opened ${sourceApp} window. Report the visible screen, blockers, and controls. Do not perform an action or guess unreadable text.`).catch(() => null);
                        response = observed?.success
                            ? `${sourceApp} is open. Visible screen: ${observed.screen || "unknown"}. Controls: ${(observed.visibleControls || []).join(", ") || "none clearly identified"}. Tell me the next action.`
                            : (observed?.error || `I opened ${sourceApp}, but could not inspect its screen yet.`);
                        break;
                    }
                    if (contextual && (e.action === "click" || e.action === "type" || e.action === "pressKey" || e.action === "hotkey")) {
                        if (!computer?.isActive?.()) {
                            response = `${sourceApp} is open, but Autopilot computer control is not active.`;
                            break;
                        }
                        // Fast native-first path: standard Windows controls do
                        // not need a vision plan or a second screen analysis.
                        // This keeps voice actions responsive and avoids a
                        // vision retry sending the same input twice.
                        let nativeResult = null;
                        if (e.action === "click" && typeof computer.locateAndApproveClick === "function") {
                            nativeResult = await computer.locateAndApproveClick(e.target);
                        } else if (e.action === "type" && typeof computer.locateAndApproveType === "function") {
                            nativeResult = await computer.locateAndApproveType(`the focused editable text area in ${sourceApp}`, e.text);
                        } else if ((e.action === "pressKey" || e.action === "hotkey") && typeof computer.performFocusedAction === "function") {
                            nativeResult = await computer.performFocusedAction(e.action, e.action === "hotkey" ? { keys: e.keys } : { key: e.key }, `Voice ${e.action}`);
                        }
                        const nativeSummary = e.action === "click" ? `Selected ${e.target}`
                            : e.action === "type" ? `Typed “${e.text}”`
                            : e.action === "hotkey" ? `Pressed ${e.keys.join("+")}`
                            : `Pressed ${e.key}`;
                        if (nativeResult?.success) {
                            response = `${nativeSummary} in ${sourceApp}.`;
                            break;
                        }
                        if (nativeResult?.actionAttempted || nativeResult?.retryable === false) {
                            response = nativeResult?.error || `I could not complete ${nativeSummary.toLowerCase()} safely.`;
                            break;
                        }
                        const workflow = window.JARVISVisualWorkflow;
                        if (!workflow?.run) { response = "The adaptive typing workflow is unavailable in this build."; break; }
                        let steps;
                        if (e.action === "click") {
                            steps = [{ label: `Select ${e.target}`, target: e.target, action: "click", afterMs: 350 }];
                        } else if (e.action === "hotkey") {
                            steps = [{ label: `Press ${e.keys.join("+")}`, action: "hotkey", keys: e.keys, afterMs: 80 }];
                        } else if (e.action === "pressKey") {
                            steps = [{ label: `Press ${e.key}`, action: "pressKey", key: e.key, afterMs: 250 }];
                        } else {
                            const app = sourceApp || "the current app";
                            steps = [{
                                label: "Text input",
                                target: `the focused editable text area in ${app}`,
                                alternatives: [`the search field in ${app}`, "the address bar", `the editable text area in ${app}`],
                                action: "typeText",
                                text: e.text,
                                verify: { target: `the text ${e.text}`, attempts: 2, minConfidence: 0.55 },
                                afterMs: 90
                            }];
                        }
                        const contextualResult = await workflow.run({ name: `contextual-${e.action}-${sourceApp}`, steps }, { maxAttempts: 2 });
                        if (!contextualResult?.success) {
                            response = contextualResult?.error || `I could not complete that ${sourceApp} action safely.`;
                            break;
                        }
                        const observed = typeof vision?.understandState === "function"
                            ? await vision.understandState(`Re-inspect the current ${sourceApp} window after the last action. Report only visible controls and screen state; do not perform another action.`).catch(() => null)
                            : null;
                        const actionSummary = e.action === "click" ? `Selected ${e.target}`
                            : e.action === "type" ? `Typed “${e.text}”`
                            : e.action === "hotkey" ? `Pressed ${e.keys.join("+")}`
                            : `Pressed ${e.key}`;
                        response = observed?.success
                            ? `${actionSummary} in ${sourceApp}. The screen was re-inspected; tell me the next action.`
                            : `${actionSummary} in ${sourceApp}.`;
                        break;
                    }
                    if (e.action === "search" && opened?.searchHandled === true) {
                        response = `Windows accepted the ${sourceApp} search for ${e.query}.`;
                        break;
                    }
                    if (e.action === "type") {
                        if (!computer?.isActive?.() || typeof computer.locateAndApproveType !== "function") {
                            response = `${sourceApp} was found, but Autopilot computer control is unavailable.`;
                            break;
                        }
                        // Combined launch-and-type commands use the native
                        // editor path first. This avoids waiting for the
                        // visual planner when Notepad or another native app
                        // is already focused after launch.
                        const directType = await computer.locateAndApproveType(`the editable text area in ${sourceApp}`, e.text);
                        if (directType?.success) {
                            response = directType.nativeOnly
                                ? `I opened ${sourceApp} and entered the requested text.`
                                : `I opened ${sourceApp} and entered the requested text.`;
                            break;
                        }
                        if (directType?.actionAttempted || directType?.retryable === false) {
                            response = directType.error || `I opened ${sourceApp}, but Windows did not accept the text input.`;
                            break;
                        }
                        const workflow = window.JARVISVisualWorkflow;
                        if (!workflow?.run) { response = "The adaptive typing workflow is unavailable in this build."; break; }
                        // The launch promise already resolves after the app is
                        // ready. A short settle delay is enough; the old 1.2s
                        // pause made simple voice typing feel unusably slow.
                        await new Promise(resolve => setTimeout(resolve, 40));
                        const typeResult = await workflow.run({
                            name: `app-type-${sourceApp}`,
                            steps: [{
                                label: "Text editor input",
                                target: `the editable text area in ${sourceApp}`,
                                alternatives: ["the document editing area", "the main text area", "the blank editor"],
                                action: "typeText",
                                text: e.text,
                                verify: { target: `the text ${e.text}`, attempts: 2, minConfidence: 0.55 },
                                afterMs: 90
                            }]
                        }, { maxAttempts: 2 });
                        response = typeResult?.success
                            ? (typeResult.nativeOnly
                                ? `I opened ${sourceApp} and entered the requested text into its focused editor. Windows accepted the input; this app does not expose its editor for a second UI Automation text check.`
                                : `I opened ${sourceApp} and verified the requested text was entered.`)
                            : (typeResult?.error || `I opened ${sourceApp}, but could not verify the text entry.`);
                        break;
                    }
                    if (e.action === "searchCopyFirst") {
                        if (!computer?.isActive?.() || typeof computer.locateAndApproveType !== "function") {
                            response = `${sourceApp} is open, but Autopilot computer control is unavailable.`;
                            break;
                        }
                        const workflow = window.JARVISVisualWorkflow;
                        if (!workflow?.run) { response = "The adaptive app workflow engine is unavailable in this build."; break; }
                        // The workflow verifies each state itself; a fixed
                        // 1.4s pause here only delays voice commands after the
                        // app is already foregrounded.
                        await new Promise(resolve => setTimeout(resolve, 250));
                        const copyResult = await workflow.run({
                            name: `search-copy-first-${sourceApp}`,
                            steps: [
                                { label: "Search field", target: `the search field in ${sourceApp}`, alternatives: ["Address bar", "Search", "Search box"], action: "typeText", text: e.query, afterMs: 200 },
                                { label: "Submit search", action: "pressKey", key: "ENTER", verify: { target: `search results for ${e.query}`, attempts: 3 }, afterMs: 1200 },
                                { label: "First search result", target: `the first search result for ${e.query}`, alternatives: ["the top result", "the first result link"], verify: { target: `the page opened from the first search result for ${e.query}`, attempts: 2 }, afterMs: 1000 },
                                { label: "Page content", target: "the main article text in the opened page", alternatives: ["the page body text"], afterMs: 200 },
                                { label: "Select page text", action: "hotkey", keys: ["CTRL", "A"], afterMs: 200 },
                                { label: "Copy first result text", action: "hotkey", keys: ["CTRL", "C"], afterMs: 300 }
                            ]
                        }, { maxAttempts: 2 });
                        response = copyResult?.success
                            ? `I searched ${e.query} in ${sourceApp}, opened the first result, and sent Select All and Copy to its page. Clipboard contents have not been verified.`
                            : (copyResult?.error || "The search-and-copy workflow paused safely before an unverified action.");
                        break;
                    }
                    if (!computer?.isActive?.() || typeof computer.locateAndApproveType !== "function") {
                        response = `${sourceApp} is open, but Autopilot computer control is unavailable.`;
                        break;
                    }
                    const workflow = window.JARVISVisualWorkflow;
                    if (!workflow?.run) { response = "The adaptive app workflow engine is unavailable in this build."; break; }
                    // Let readiness/verification drive waiting instead of
                    // imposing a fixed 1.8s delay on every app search.
                    await new Promise(resolve => setTimeout(resolve, 250));
                    const flowResult = await workflow.run({
                        name: `official-app-search-${sourceApp}`,
                        steps: [
                            { label: "Search field", target: `the search field in ${sourceApp}`, alternatives: ["Search", "Search apps", "Find"], action: "typeText", text: e.query, afterMs: 200 },
                            { label: "Submit search", action: "pressKey", key: "ENTER", verify: { target: `search results for ${e.query}`, attempts: 3 }, afterMs: 900 },
                            { label: "Search result", target: `the official store listing matching ${e.query}`, alternatives: [`${e.query} result`, `the first result for ${e.query}`], verify: { target: `the official listing page for ${e.query}`, attempts: 2 }, afterMs: 700 }
                        ]
                    }, { maxAttempts: 2 });
                    if (!flowResult?.success) {
                        response = flowResult?.error || "The app workflow paused safely before an unverified action.";
                        break;
                    }
                    if (e.action === "search") {
                        response = `I opened ${sourceApp}, searched for ${e.query}, and verified the result screen. I stopped before any download or install.`;
                        break;
                    }
                    if (e.action === "update") {
                        const updateResult = await workflow.run({
                            name: `app-update-${sourceApp}`,
                            steps: [{ label: "Update app", target: `the official Update button or available update control in ${sourceApp}`, alternatives: ["Update", "Install update", "Get updates"], verify: { target: `the updated or up-to-date state in ${sourceApp}`, attempts: 2 }, afterMs: 900 }]
                        }, { maxAttempts: 2 });
                        response = updateResult?.success
                            ? `${sourceApp} update control completed and the new state was verified.`
                            : (updateResult?.error || "The update workflow paused safely before an unverified action.");
                        break;
                    }
                    const offer = await detectStoreOffer(vision);
                    if (offer.status === "paid") {
                        response = `${e.query} appears to be a paid listing. I stopped before download. Say “download it” only if you want to continue with the store's official purchase or install flow.`;
                        break;
                    }
                    if (offer.status !== "free") {
                        response = `I found the official ${e.query} listing, but could not reliably verify whether it is free or paid. I stopped before download.`;
                        break;
                    }
                    const downloadResult = await workflow.run({
                        name: `app-download-${e.query}`,
                        steps: [{ label: "Download or install", target: `the official Download, Install, or Get button for ${e.query}`, alternatives: ["Download", "Install", "Get"], verify: { target: `download progress or installed state for ${e.query}`, attempts: 2 }, afterMs: 800 }]
                    }, { maxAttempts: 2 });
                    response = downloadResult?.success
                        ? `${e.query} is free and the official download workflow completed with your approval.`
                        : (downloadResult?.error || "The download paused safely before an unverified action.");
                    break;
                }
                case "MINECRAFT_LAUNCH_FLOW": {
                    if (!system?.openApp) { response = "The Windows app launcher is unavailable in this build."; break; }
                    const computer = window.JARVISComputerUse;
                    const vision = window.JARVISScreenShare;
                    const accessError = await ensureAccessOS();
                    if (accessError) { response = accessError; break; }
                    // Resolve the installed launcher through App Library rather
                    // than assuming a fixed Minecraft installation exists.
                    const launchResult = unwrap(await system.openApp("minecraft launcher"));
                    if (launchResult?.success === false) {
                        response = launchResult.error || "I couldn't find an installed Minecraft launcher. Open App Library to add one.";
                        break;
                    }
                    if (!computer?.isActive?.()) { response = "Computer Use could not be activated safely."; break; }
                    if (typeof computer.locateAndApproveClick !== "function") {
                        response = "The Minecraft launcher is open, but Autopilot computer control is unavailable.";
                        break;
                    }
                    const workflow = window.JARVISVisualWorkflow;
                    if (!workflow?.run) { response = "The adaptive visual workflow engine is unavailable in this build."; break; }
                    await new Promise(resolve => setTimeout(resolve, 2500));
                    const flowResult = await workflow.run({
                        name: "minecraft-launch",
                        steps: [{
                            label: "Minecraft Play",
                            target: "the primary Play button in the installed Minecraft launcher; do not change the selected version",
                            alternatives: ["the Launch button in the installed Minecraft launcher", "the Start button in the installed Minecraft launcher"],
                            readyWhen: { target: "the installed Minecraft launcher with its current version selector and Play button", attempts: 3, minConfidence: 0.62 },
                            verify: { target: "Minecraft main menu, loading screen, or gameplay window", attempts: 3, minConfidence: 0.58 },
                            stateQuestion: "Is the installed Minecraft launcher ready with its current version selected, or is it still loading or showing an error?",
                            afterMs: 5000
                        }]
                    }, { maxAttempts: 2 });
                    response = flowResult?.success
                        ? "Minecraft is launching with the currently selected version."
                        : (flowResult?.error || "The launcher was found, but Play was not safely verified; I stopped without guessing.");
                    break;
                }
                case "SET_VOLUME": {
                    if (typeof system?.setVolume !== "function") {
                        response = "System volume control is unavailable in this build.";
                        break;
                    }
                    const volumeResult = await system.setVolume(e.percent);
                    const volumeData = unwrap(volumeResult);
                    response = volumeResult?.success === false || volumeData?.success === false
                        ? (volumeData?.error || volumeResult?.error || "I couldn't change the system volume.")
                        : `System volume set to ${volumeData?.volume ?? e.percent}%.`;
                    break;
                }
                case "AI_MESSAGE_QUEUE": {
                    const queue = window.JARVISAIMessageQueue;
                    if (!queue) { response = "The AI message queue is unavailable in this build."; break; }
                    if (e.action === "open") {
                        queue.show();
                        if (typeof document !== "undefined") document.getElementById("navAIQueue")?.click();
                        response = "Opening the AI Message Queue.";
                    } else if (e.action === "add") {
                        const count = queue.enqueue(e.message, e.provider || "");
                        response = count
                            ? `${count} message${count === 1 ? "" : "s"} added to the AI queue. Choose a model and say “send message queue” when ready.`
                            : "I couldn't add that message. Check the queue status and selected model.";
                    } else if (e.action === "add-sequence") {
                        const count = queue.enqueue((e.messages || []).join("\n"), e.provider || "");
                        if (count) {
                            queue.show();
                            if (typeof document !== "undefined") document.getElementById("navAIQueue")?.click();
                            Promise.resolve(queue.start(e.provider || "")).catch(error => console.error("Sequential message flow failed:", error));
                            response = `Added ${count} messages. JARVIS will send each after the previous reply. The queue uses the model configured in JARVIS; a local Ollama model does not require a ChatGPT or Gemini API key.`;
                        } else response = "I couldn't add those messages. Check the selected model and message list.";
                    } else if (e.action === "start") {
                        queue.show();
                        if (typeof document !== "undefined") document.getElementById("navAIQueue")?.click();
                        Promise.resolve(queue.start(e.provider || "")).catch(error => console.error("AI queue start failed:", error));
                        response = "Starting the message queue. Each next message will be sent after the selected model replies to the previous one.";
                    } else if (e.action === "pause") {
                        response = queue.pause() ? "Okay, I’ll pause after the current model reply." : "The message queue is not running.";
                    } else if (e.action === "clear") {
                        response = queue.clear() ? "The AI message queue is clear." : "I can’t clear the queue while a message is being sent.";
                    }
                    break;
                }
                case "CREATE_PRESENTATION": {
                    if (e.missingTopic || !String(e.topic || "").trim()) {
                        preserveResponse = true;
                        response = (e.language === "hi" || e.language === "hinglish") ? "ज़रूर। किस विषय पर PPT बनाऊँ?" : "Sure. What topic should the PPT cover?";
                        break;
                    }
                    if (typeof window.jarvis?.presentations?.create !== "function") {
                        response = "Presentation creation is unavailable in this JARVIS build.";
                        break;
                    }
                    const lang = (e.language || window.JARVISLanguageCore?.detectLanguage(input) || "en").toLowerCase();
                    response = lang === "hi" || lang === "hinglish" ? `${e.slideCount || 10} slides की PPT तैयार कर रहा हूँ…` : `I'm preparing a ${e.slideCount || 10}-slide PPT…`;
                    log("PPT action route → existing presentations.create bridge", { topic: e.topic, slideCount: e.slideCount || 10, imageCount: e.imageCount || 0, wantsImages: e.wantsImages === true, designPreferences: e.designPreferences || [], language: lang });
                    let source = {};
                    try {
                        const article = unwrap(await window.jarvis?.wikipedia?.summary?.(e.topic, lang === "hi" ? "hi" : "en"));
                    if (article?.success && article.extract) source = { title: article.title || e.topic, extract: article.extract, url: article.url || "", thumbnail: article.thumbnail || "" };
                    } catch (_) { /* The selected AI provider can still draft the deck without a Wikipedia result. */ }
                    const onProgress = window.jarvis?.presentations?.onProgress;
                    const removeProgress = typeof onProgress === "function" ? onProgress(detail => {
                        const stage = String(detail?.stage || "Preparing presentation").slice(0, 90);
                        window.dispatchEvent(new CustomEvent("jarvis:activity", { detail: { timestamp: Date.now(), phase: "working", state: "thinking", task: `Creating ${e.slideCount || 10}-slide PPT: ${stage}`, tool: "Presentation", operation: e.topic } }));
                    }) : null;
                    let result;
                    try { result = unwrap(await window.jarvis.presentations.create(e.topic, { language: lang, source, slideCount: e.slideCount || 10, imageCount: e.imageCount || undefined, wantsImages: e.wantsImages === true, designPreferences: e.designPreferences || [], userRequest: e.userRequest || input })); }
                    finally { if (typeof removeProgress === "function") removeProgress(); }
                    preserveResponse = true;
                    const verifiedPptx = result?.success === true && result?.verified === true && typeof result?.path === "string" && result.path.trim().length > 0;
                    response = !verifiedPptx
                        ? ((lang === "hi" || lang === "hinglish") ? `PPT नहीं बन पाई। ${String(result?.error || "Presentation service ने saved और verified PPTX file की पुष्टि नहीं की।").slice(0, 500)}` : `I couldn't create the PPT. ${String(result?.error || "The presentation service did not confirm that a PPTX file was saved and verified.").slice(0, 500)}`)
                        : ((lang === "hi" || lang === "hinglish")
                            ? (result.opened ? "PPT बन गई है।" : "PPT बन गई है, लेकिन खुल नहीं सकी।")
                            : (result.opened ? "The PPT is ready." : "The PPT is ready, but I couldn't open it."));
                    break;
                }
                case "CREATE_PDF": {
                    if (typeof window.jarvis?.documents?.createPdf !== "function") {
                        response = "PDF creation is unavailable in this JARVIS build.";
                        break;
                    }
                    const lang = (window.JARVISLanguageCore?.detectLanguage(input) || "en").toLowerCase();
                    response = lang === "hi" || lang === "hinglish" ? `${e.topic} पर PDF तैयार कर रहा हूँ…` : `I'm preparing a PDF about ${e.topic}…`;
                    let result;
                    try { result = unwrap(await window.jarvis.documents.createPdf(e.topic, { language: lang })); }
                    catch (error) { result = { success: false, error: error?.message || "PDF generation failed." }; }
                    preserveResponse = true;
                    response = result.success === false
                        ? (lang === "hi" || lang === "hinglish" ? `PDF नहीं बन पाई। ${String(result.error || "कारण उपलब्ध नहीं है।").slice(0, 400)}` : `I couldn't create the PDF. ${String(result.error || "No further error details were returned.").slice(0, 400)}`)
                        : (lang === "hi" || lang === "hinglish" ? "PDF बन गई है।" : "The PDF is ready.");
                    break;
                }
                case "CREATE_IMAGE": {
                    if (typeof window.jarvis?.aiProvider?.generateImage !== "function") { response = "Image generation is unavailable in this JARVIS build."; break; }
                    const lang = (window.JARVISLanguageCore?.detectLanguage(input) || "en").toLowerCase();
                    response = lang === "hi" || lang === "hinglish" ? "Image तैयार कर रहा हूँ…" : "Generating your image…";
                    let result;
                    try { result = unwrap(await window.jarvis.aiProvider.generateImage(e.prompt, {})); }
                    catch (error) { result = { success: false, error: error?.message || "Image generation failed." }; }
                    preserveResponse = true;
                    response = result?.success === false
                        ? (lang === "hi" || lang === "hinglish" ? `Image नहीं बन पाई। ${String(result.error || "HoldAPI settings जाँचें।").slice(0, 400)}` : `I couldn't create the image. ${String(result.error || "Check HoldAPI settings.").slice(0, 400)}`)
                        : (result.opened ? (lang === "hi" || lang === "hinglish" ? "Image बन गई है और खोल दी गई है।" : "The image is ready and open.") : (lang === "hi" || lang === "hinglish" ? `Image बन गई है। सेव स्थान: ${result.path}` : `The image is ready. Saved at: ${result.path}`));
                    break;
                }
                case "CREATE_SPREADSHEET": {
                    if (typeof window.jarvis?.documents?.createSpreadsheet !== "function") {
                        response = "Spreadsheet creation is unavailable in this JARVIS build.";
                        break;
                    }
                    const lang = (window.JARVISLanguageCore?.detectLanguage(input) || "en").toLowerCase();
                    response = lang === "hi" || lang === "hinglish" ? "आपकी Excel workbook बना रहा हूँ…" : "I'm building your Excel workbook…";
                    let result;
                    try { result = unwrap(await window.jarvis.documents.createSpreadsheet(e.request || input, { language: lang })); }
                    catch (error) { result = { success: false, error: error?.message || "Spreadsheet creation failed." }; }
                    preserveResponse = true;
                    response = result.success === false
                        ? (lang === "hi" || lang === "hinglish" ? `Spreadsheet नहीं बन पाई। ${String(result.error || "कारण उपलब्ध नहीं है।").slice(0, 400)}` : `I couldn't create the spreadsheet. ${String(result.error || "No further error details were returned.").slice(0, 400)}`)
                        : (lang === "hi" || lang === "hinglish" ? "आपकी Excel workbook तैयार है।" : "Your Excel workbook is ready.");
                    break;
                }
                case "CREATE_OFFICE_FILE": {
                    if (typeof window.jarvis?.documents?.createOfficeFile !== "function") {
                        response = "DOCX, CSV, and ZIP creation is unavailable in this JARVIS build.";
                        break;
                    }
                    const lang = (window.JARVISLanguageCore?.detectLanguage(input) || "en").toLowerCase();
                    const format = String(e.format || "").toUpperCase();
                    if (e.format !== "zip" && !String(e.request || "").trim()) {
                        response = lang === "hi" || lang === "hinglish" ? `किस विषय की ${format} बनानी है?` : `What should the ${format} contain?`;
                        break;
                    }
                    response = e.format === "zip"
                        ? (lang === "hi" || lang === "hinglish" ? "ZIP archive के लिए files चुनें…" : "Choose files for the ZIP archive…")
                        : (lang === "hi" || lang === "hinglish" ? `${format} तैयार कर रहा हूँ…` : `Preparing your ${format}…`);
                    let result;
                    try { result = unwrap(await window.jarvis.documents.createOfficeFile(e.format, e.request || "", { language: lang, fileName: e.fileName || "", outputLocation: e.outputLocation || "" })); }
                    catch (error) { result = { success: false, error: error?.message || `${format} creation failed.` }; }
                    preserveResponse = true;
                    if (result.success && e.format !== "zip" && (result.verified !== true || !result.path)) {
                        result = { ...result, success: false, error: "JARVIS did not receive a verified saved-file path, so it cannot confirm that the document was created." };
                    }
                    if (result.success && result.path) {
                        try { await window.JARVISDocumentsGallery?.refresh?.(); } catch (_) { /* The saved document remains valid if gallery refresh is unavailable. */ }
                    }
                    response = result.cancelled
                        ? (lang === "hi" || lang === "hinglish" ? "ठीक है, रद्द कर दिया।" : "Okay, cancelled.")
                        : result.success === false
                            ? (lang === "hi" || lang === "hinglish" ? `${format} नहीं बन पाई। ${String(result.error || "कारण उपलब्ध नहीं है।").slice(0, 400)}` : `I couldn't create the ${format}. ${String(result.error || "No further error details were returned.").slice(0, 400)}`)
                            : result.opened === false
                                ? (lang === "hi" || lang === "hinglish" ? `${format} फ़ाइल बनाकर जाँच ली है, लेकिन कोई उपयुक्त ऐप उसे खोल नहीं सका। फ़ाइल यहाँ सेव है: ${result.path}` : `The ${format} was created and verified, but Windows couldn't open it in an app. Saved here: ${result.path}`)
                                : (lang === "hi" || lang === "hinglish" ? `${format} फ़ाइल बन गई है और जाँच ली है। सेव स्थान: ${result.path}` : `The ${format} was created and verified. Saved here: ${result.path}`);
                    break;
                }
                case "OPEN_ALARM": {
                    const appLaunch = unwrap(await system?.openApp?.("clock"));
                    if (appLaunch?.success === false || !system?.openApp) {
                        response = appLaunch?.error || "I couldn't open the Windows Clock app.";
                        break;
                    }
                    awaitingAlarmTime = !e.time;
                    if (e.time) {
                        response = `Windows Clock is open. I can't insert ${e.time} into the Clock app because it doesn't expose a supported alarm-creation API. Set ${e.time} in its Alarms tab.`;
                    } else {
                        response = "Windows Clock is open. What time should the alarm be for?";
                    }
                    break;
                }
                case "WINDOW_CONTROL": {
                    const closeApps = window.jarvis?.system?.closeApps;
                    if (typeof closeApps !== "function") {
                        response = "Windows app closing is unavailable in this JARVIS build.";
                        break;
                    }
                    const isBulk = e.all === true;
                    if (isBulk && typeof window.confirm === "function" && !window.confirm("Close all open application windows except the selected exclusions? Unsaved work may be lost.")) {
                        response = "Closing the application windows was cancelled.";
                        break;
                    }
                    const closed = await closeApps({ all: isBulk, targets: e.targets || [], except: ["jarvis", ...(e.except || [])] });
                    const count = Array.isArray(closed?.closed) ? closed.closed.length : 0;
                    response = closed?.success === false
                        ? (closed.error || "Windows did not close the requested application.")
                        : (count ? `Closed ${count} application window${count === 1 ? "" : "s"}.` : "No matching application window was open.");
                    break;
                }
                case "SYSTEM_CONTROL": {
                    if (!system) return { handled: false };
                    log("🧭 Router: system", e.action);
                    if (e.action === "watch-screen-reply-shutdown") {
                        const watch = window.JARVISScreenShare?.watchForProviderReply;
                        if (typeof watch !== "function") {
                            response = "Screen reply monitoring is unavailable in this JARVIS build.";
                            break;
                        }
                        const result = await watch(e.provider);
                        const lang = window.JARVISLanguageCore?.detectLanguage(input) || "en";
                        response = result?.success
                            ? (lang === "hi" ? `ठीक है। साझा की गई स्क्रीन पर ${e.provider} का नया जवाब पूरा होते ही सिस्टम बंद कर दूँगा। यह स्थानीय vision model से चलेगा, API key की ज़रूरत नहीं है। रोकने के लिए कहें: cancel ${e.provider} screen shutdown.` : `Okay. I’ll shut down when a new ${e.provider} reply is visible and complete on the shared screen. This uses your local vision model and needs no API key. Say “cancel ${e.provider} screen shutdown” to cancel.`)
                            : (result?.error || "Share the ChatGPT or Gemini window first, then repeat the command.");
                        break;
                    }
                    if (e.action === "shutdown-after-provider-reply") {
                        const arm = window.JARVISDeferredShutdown?.arm;
                        if (typeof arm !== "function") {
                            response = "Reply-triggered shutdown is unavailable in this build.";
                            break;
                        }
                        const armed = arm(e.provider);
                        const lang = window.JARVISLanguageCore?.detectLanguage(input) || "en";
                        response = armed
                            ? (lang === "hi" ? `${e.provider} के अगले जवाब के बाद सिस्टम अपने आप बंद हो जाएगा। इसे रोकने के लिए कहें: cancel shutdown after ${e.provider} reply.` : lang === "hinglish" ? `${e.provider} ke next reply ke baad system automatically band ho jayega. Rokne ke liye bolo: cancel shutdown after ${e.provider} reply.` : `The system will shut down after the next reply from ${e.provider}. Say “cancel shutdown after ${e.provider} reply” to cancel.`)
                            : "I couldn't set the reply-triggered shutdown.";
                        break;
                    }
                    if (e.action === "cancel-deferred-provider-shutdown") {
                        const cancelled = (window.JARVISDeferredShutdown?.cancel?.() || false) || (window.JARVISScreenShare?.cancelReplyWatch?.() || false);
                        response = cancelled ? "Okay, I cancelled the shutdown after the provider reply." : "There is no reply-triggered shutdown waiting.";
                        break;
                    }
                    if (e.action === "schedule-shutdown") {
                        if (typeof system.scheduleShutdown !== "function") {
                            response = "Scheduled shutdown is unavailable in this build.";
                            break;
                        }
                        const scheduled = await system.scheduleShutdown(e.delayMs);
                        if (scheduled?.success === false) {
                            response = scheduled.error || "I couldn't schedule the shutdown.";
                            break;
                        }
                        window.JARVISDashboard?.setScheduledShutdown?.(scheduled?.shutdownAt || (Date.now() + e.delayMs));
                        const count = Math.round(e.delayMs / e.multiplier);
                        const unit = /hour|hr|घंट|घण्ट|ghant/.test(e.unit) ? (count === 1 ? "hour" : "hours")
                            : /minute|min|मिनट|मिनिट/.test(e.unit) ? (count === 1 ? "minute" : "minutes") : "seconds";
                        const hiUnit = /hour|hr|घंट|घण्ट|ghant/.test(e.unit) ? "घंटे" : /minute|min|मिनट|मिनिट/.test(e.unit) ? "मिनट" : "सेकंड";
                        const lang = window.JARVISLanguageCore?.detectLanguage(input) || "en";
                        response = lang === "hi"
                            ? `ठीक है, ${count} ${hiUnit} बाद सिस्टम अपने आप बंद होगा। उस समय खुले ऐप्स भी बंद कर दिए जाएंगे।`
                            : lang === "hinglish"
                                ? `Theek hai, ${count} ${hiUnit} baad system apne aap band hoga. Us waqt khule apps bhi band kar diye jayenge.`
                                : `Okay, the system will shut down in ${count} ${unit}. Open apps will be forced closed then.`;
                        break;
                    }
                    if (e.action === "cancel-scheduled-shutdown") {
                        const cancelled = await system.cancelScheduledShutdown?.();
                        if (cancelled?.success !== false) window.JARVISDashboard?.clearScheduledShutdown?.();
                        response = cancelled?.success === false
                            ? (cancelled.error || "I couldn't cancel the scheduled shutdown.")
                            : (window.JARVISLanguageCore?.detectLanguage(input) === "hi" ? "ठीक है, scheduled shutdown रद्द कर दिया।" : "Okay, the scheduled shutdown has been cancelled.");
                        break;
                    }
                    if (["shutdown", "restart", "logoff"].includes(e.action)) {
                        const labels = { shutdown: "shut down", restart: "restart", logoff: "sign out" };
                        if (typeof window.confirm !== "function" || !window.confirm(`Are you sure you want to ${labels[e.action]} this computer?`)) {
                            response = `${labels[e.action][0].toUpperCase()}${labels[e.action].slice(1)} cancelled.`;
                            break;
                        }
                    }
                    const actionMap = {
                        shutdown: { fn: () => system.shutdown(), text: "Shutting down the computer." },
                        restart: { fn: () => system.restart(), text: "Restarting the computer." },
                        sleep: { fn: () => system.sleep && system.sleep(), text: "Putting the computer to sleep." },
                        lock: { fn: () => (system.lock ? system.lock() : (system.lockPC && system.lockPC())), text: "Locking your computer." },
                        logoff: { fn: () => (system.logoff ? system.logoff() : null), text: "Signing you out." }
                    };
                    const chosen = actionMap[e.action] || actionMap.shutdown;
                    if (typeof chosen.fn === "function") {
                        const controlResult = await chosen.fn();
                        if (controlResult && controlResult.success === false) {
                            response = controlResult.error || `I couldn't ${e.action} the computer.`;
                            break;
                        }
                    }
                    response = chosen.text;
                    break;
                }
                case "TASK_MEMORY": {
                    const workflow = window.JARVISVisualWorkflow;
                    const lang = window.JARVISLanguageCore?.detectLanguage(input) || "en";
                    if (!workflow) { response = "Task Memory is unavailable in this JARVIS build."; break; }
                    if (e.action === "replay-last") {
                        const replay = await workflow.replayLast?.({ maxAttempts: 2 });
                        response = replay?.success === false
                            ? (replay.error || "The last task could not be replayed safely.")
                            : (lang === "hi" || lang === "hinglish" ? "पिछला verified task fresh approval के साथ फिर से चल गया।" : "The last verified task ran again with fresh approvals.");
                    } else if (e.action === "show") {
                        const recent = workflow.getTaskMemory?.(5) || [];
                        response = recent.length
                            ? recent.map((task, index) => `${index + 1}. ${task.workflow} (${task.completed?.length || 0} verified steps)`).join(". ")
                            : (lang === "hi" || lang === "hinglish" ? "अभी कोई completed task memory में नहीं है।" : "There are no completed tasks in memory yet.");
                    } else {
                        const forgotten = workflow.forgetLastTask?.();
                        response = forgotten?.success
                            ? (lang === "hi" || lang === "hinglish" ? "आखिरी task memory से हटा दिया।" : "The last task was removed from memory.")
                            : (forgotten?.error || "There is no task to forget.");
                    }
                    break;
                }
                case "WORKFLOW_RECORDER": {
                    const recorder = window.JARVISWorkflowRecorder;
                    const visual = window.JARVISVisualWorkflow;
                    const lang = window.JARVISLanguageCore?.detectLanguage(input) || "en";
                    if (!recorder) { response = "Workflow Recorder is unavailable in this JARVIS build."; break; }
                    if (e.action === "save") {
                        const saved = recorder.saveLast?.(e.name);
                        response = saved?.success === false
                            ? (saved.error || "I could not save the last verified workflow.")
                            : (lang === "hi" || lang === "hinglish" ? `Verified workflow “${saved.name}” save कर दिया।` : `Saved the verified workflow “${saved.name}”.`);
                    } else if (e.action === "list") {
                        const recipes = recorder.list?.() || [];
                        response = recipes.length
                            ? recipes.map((recipe, index) => `${index + 1}. ${recipe.name} (${recipe.steps?.length || 0} steps)`).join(". ")
                            : (lang === "hi" || lang === "hinglish" ? "अभी कोई saved workflow नहीं है।" : "There are no saved workflows yet.");
                    } else {
                        const recipe = recorder.get?.(e.name);
                        if (!recipe) { response = lang === "hi" || lang === "hinglish" ? `“${e.name}” नाम का workflow नहीं मिला।` : `I could not find a workflow named “${e.name}”.`; break; }
                        if (!visual?.run) { response = "Visual workflow execution is unavailable in this JARVIS build."; break; }
                        const result = await visual.run({ name: recipe.name, steps: recipe.steps }, { maxAttempts: 2 });
                        response = result?.success === false
                            ? (result.error || "The saved workflow stopped safely.")
                            : (lang === "hi" || lang === "hinglish" ? `Saved workflow “${recipe.name}” fresh approval और verification के साथ चला।` : `The saved workflow “${recipe.name}” ran with fresh approval and verification.`);
                    }
                    break;
                }
                case "PERMISSION_PROFILE": {
                    const profiles = window.JARVISPermissionProfiles;
                    const lang = window.JARVISLanguageCore?.detectLanguage(input) || "en";
                    if (!profiles) { response = "Permission Profiles are unavailable in this JARVIS build."; break; }
                    if (e.action === "set") {
                        const changed = profiles.set?.(e.profile);
                        response = changed?.success === false
                            ? (changed.error || "That permission profile is not available.")
                            : (lang === "hi" || lang === "hinglish" ? `Permission mode ${changed.name} कर दिया। Risky actions पर approval gates बने रहेंगे।` : `Permission mode is now ${changed.name}. Risky actions still require approval.`);
                    } else {
                        const current = profiles.get?.();
                        response = lang === "hi" || lang === "hinglish"
                            ? `Current permission mode ${current?.name || "Safe"} है।`
                            : `The current permission mode is ${current?.name || "Safe"}.`;
                    }
                    break;
                }
                case "COMPUTER_USE": {
                    const control = window.JARVISComputerUse;
                    const lang = window.JARVISLanguageCore?.detectLanguage(input) || "en";
                    if (!control) {
                        response = "Computer Use controls are unavailable in this JARVIS build.";
                        break;
                    }
                    if (e.action === "access-pause") {
                        control.setAccessMode?.(false);
                        response = lang === "hi" || lang === "hinglish" ? "Autopilot pause है। मैं कोई नया action नहीं चलाऊँगा। Resume बोलकर जारी करें।" : "Autopilot is paused. No new action will run. Say resume to continue.";
                        break;
                    }
                    if (e.action === "access-resume") {
                        if (!control.isActive?.()) {
                            const started = await control.start?.();
                            if (started?.success === false) { response = started.error || "Computer Use could not resume."; break; }
                        }
                        control.setAccessMode?.(true);
                        response = lang === "hi" || lang === "hinglish" ? "Autopilot फिर से active है।" : "Autopilot has resumed.";
                        break;
                    }
                    if (e.action === "access-start") {
                        const started = await control.start();
                        if (started?.success === false) {
                            response = started.error || "AccessOS could not start Computer Use.";
                            break;
                        }
                        control.setAccessMode?.(true);
                        response = lang === "hi" || lang === "hinglish"
                            ? "JARVIS Autopilot Mode is active. Just speak naturally; I will find apps, ask for approval, and verify actions."
                            : "JARVIS Autopilot Mode is active. Speak naturally to open apps, search, and approve actions.";
                        break;
                    }
                    if (e.action === "access-stop") {
                        control.setAccessMode?.(false);
                        response = "JARVIS Autopilot Mode is off.";
                        break;
                    }
                    if (e.action === "start") {
                        const started = await control.start();
                        response = started?.success === false
                            ? (started.error || "Computer Use could not start.")
                            : (lang === "hi" || lang === "hinglish" ? "Computer Use mode चालू है। अब मैं screen पर mouse और keyboard actions कर सकता हूँ।" : "Computer Use mode is active. I can now control the visible desktop with approval gates.");
                        break;
                    }
                    if (e.action === "stop") {
                        const stopped = await control.stop();
                        response = stopped?.success === false
                            ? (stopped.error || "Computer Use could not stop cleanly.")
                            : (lang === "hi" || lang === "hinglish" ? "Computer Use mode बंद कर दिया।" : "Computer Use mode is stopped.");
                        break;
                    }
                    if (e.action === "locateClick") {
                        const actionResult = await control.locateAndApproveClick(e.params?.target || "the requested control");
                        response = actionResult?.success === false
                            ? (actionResult.error || "I could not safely locate that control.")
                            : (lang === "hi" || lang === "hinglish" ? "Target मिल गया और action पूरा हो गया।" : "The target was located and the action completed.");
                        break;
                    }
                    const actionResult = e.action === "typeText" && typeof control.typeFocusedText === "function"
                        ? await control.typeFocusedText(e.params?.text || "")
                        : await control.perform(e.action, e.params || {});
                    response = actionResult?.success === false
                        ? (actionResult.error || "The Computer Use action could not run.")
                        : (lang === "hi" || lang === "hinglish" ? "Computer action पूरा हो गया।" : "Computer action completed.");
                    break;
                }
                case "OPEN_WEBSITE":
                    if (!browser?.open && !window.jarvis?.openURL) return { handled: false };
                    log("🧭 Router: browser.open");
                    const openResult = browser?.open ? await browser.open(e.url) : await window.jarvis.openURL(e.url);
                    response = openResult?.success === false
                    ? (openResult.error || "I couldn't open that website.")
                    : (window.JARVISSmartReplies
                        ? window.JARVISSmartReplies.get("OPEN_WEBSITE", { lang: (window.JARVISLanguageCore?.detectLanguage(input) || "en"), SITE: (e.site || e.url) })
                        : `Opening ${e.site || e.url}.`);
                    break;
                case "SITE_SEARCH": {
                    const query = encodeURIComponent(e.query);
                    const urls = {
                        wikipedia: `https://en.wikipedia.org/w/index.php?search=${query}`,
                        amazon: `https://www.amazon.in/s?k=${query}`,
                        flipkart: `https://www.flipkart.com/search?q=${query}`,
                        reddit: `https://www.reddit.com/search/?q=${query}`,
                        github: `https://github.com/search?q=${query}&type=repositories`,
                        youtube: `https://m.youtube.com/results?search_query=${query}`
                    };
                    const url = urls[e.site];
                    if (!url) return { handled: false };
                    const result = browser?.open ? await browser.open(url) : await window.jarvis.openURL(url);
                    response = result?.success === false
                        ? (result.error || `I couldn't search ${e.site}.`)
                        : `Searching ${e.site} for ${e.query}.`;
                    break;
                }
                case "WEATHER":
                    log("🧭 Router: weatherService"); log("🔌 Service: Open-Meteo");
                    if (/\b(tomorrow|kal|कल|आने वाला कल)\b/iu.test(input) && typeof data.weatherForecast === "function") {
                        const forecast = unwrap(await data.weatherForecast(e.location, 1));
                        response = forecast.success
                            ? `${forecast.place} mein kal ka forecast: ${forecast.condition}, ${forecast.temperatureMin}–${forecast.temperatureMax}${forecast.unit || "°C"}, rain chance ${forecast.precipitationProbability ?? "N/A"}%.`
                            : (forecast.error || "I couldn't get tomorrow's forecast.");
                    } else if (/\b(today|aaj|आज|आज का)\b/iu.test(input) && typeof data.weatherForecast === "function") {
                        const forecast = unwrap(await data.weatherForecast(e.location, 0));
                        response = forecast.success
                            ? `${forecast.place} mein aaj ka forecast: ${forecast.condition}, ${forecast.temperatureMin}–${forecast.temperatureMax}${forecast.unit || "°C"}, rain chance ${forecast.precipitationProbability ?? "N/A"}%.`
                            : formatWeather(await data.weather(e.location));
                    } else {
                        response = formatWeather(await data.weather(e.location));
                    }
                    break;
                case "CURRENCY":
                    log("🧭 Router: currencyService"); log("🔌 Service: Frankfurter");
                    const converted = await data.currencyConvert(e.amount, e.fromCurrency, e.toCurrency);
                    response = formatCurrency(converted);
                    break;
                case "TIME":
                    log("🧭 Router: timeService"); log("🔌 Service: WorldTimeAPI");
                    response = `दिल्ली में अभी ${new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date())} बजे हैं।`;
                    break;
                case "DATE":
                    log("🧭 Router: dateService");
                    response = `आज की तारीख ${new Intl.DateTimeFormat("hi-IN", { timeZone: "Asia/Kolkata", dateStyle: "long" }).format(new Date())} है।`;
                    break;
                case "LOCATION":
                    log("🧭 Router: locationService"); log("🔌 Service: Nominatim");
                    const location = await data.locationSearch(e.place, 1);
                    response = formatLocation(location);
                    break;
                case "COUNTRY_INFO":
                    log("🧭 Router: countryService"); log("🔌 Service: REST Countries");
                    const country = await data.countryInfo(e.country);
                    const countryData = unwrap(country);
                    if (countryData?.success && countryData.capital) e.capital = countryData.capital;
                    response = formatCountry(country);
                    break;
                case "KNOWLEDGE":
                    log("🧭 Router: knowledgeService"); log("🔌 Service: Wikipedia");
                    const wiki = window.jarvis.wikipedia?.summary ? await window.jarvis.wikipedia.summary(e.topic, "en") : await data.wikidataSearch(e.topic, "en");
                    response = formatKnowledge(wiki);
                    break;
                case "BOOK_SEARCH":
                    log("🧭 Router: booksService"); log("🔌 Service: Open Library");
                    response = formatBook(await data.bookSearch(e.query));
                    break;
                case "TV_SEARCH":
                    log("🧭 Router: tvService"); log("🔌 Service: TVmaze");
                    response = formatTV(await data.tvSearch(e.query));
                    break;
                case "RECIPE_SEARCH":
                    log("🧭 Router: recipeService"); log("🔌 Service: TheMealDB");
                    response = formatRecipe(await data.recipeSearch(e.query));
                    break;
                case "POKEMON":
                    log("🧭 Router: pokemonService"); log("🔌 Service: PokéAPI");
                    response = formatPokemon(await data.pokemonInfo(e.pokemon));
                    break;
                case "NEWS":
                    log("🧭 Router: newsService"); log("🔌 Service: Google News RSS");
                    response = formatNews(await data.newsSearch(e.topic, 5));
                    break;
                case "VIDEO_SEARCH":
                    log("🧭 Router: videoService"); log("🔌 Service: Wikimedia Commons");
                    {
                        const videoResult = await data.videoSearch(e.query, 4);
                        const videoData = unwrap(videoResult);
                        if (!videoData.success) {
                            response = videoData.error || "I couldn't find any videos.";
                            break;
                        }
                        const videos = Array.isArray(videoData.videos) ? videoData.videos : [];
                        response = videos.length
                            ? `"${e.query}" ke liye ${videos.length} videos mil gaye.`
                            : `"${e.query}" ke liye koi video nahi mila.`;
                        richContent = videos.length ? {
                            type: "videos",
                            title: e.query || "Video Search",
                            videos: videos.map(video => ({
                                url: video.url,
                                title: video.title || e.query || "Video",
                                mime: video.mime || "video/mp4",
                                description: video.description || ""
                            }))
                        } : null;
                    }
                    break;
                case "IMAGE_SEARCH":
                    log("🧭 Router: imageService"); log("🔌 Service: Wikimedia Commons");
                    {
                        const imageResult = await data.imageSearch(e.query, 5);
                        response = formatImages(imageResult);
                        const imageData = unwrap(imageResult);
                        if (!imageData.success) {
                            response = `I couldn't load image previews for "${e.query || "your search"}". Use the Google Images link below to view results.`;
                        }
                        richContent = {
                            type: "images",
                            title: e.query || "Image Search",
                            source: imageData.source || "Wikimedia Commons",
                            searchUrl: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(e.query || "")}`,
                            images: (imageData.images || []).map(image => ({
                                url: image.url,
                                thumbUrl: image.thumbUrl || image.url,
                                title: image.title || e.query || "Image"
                            }))
                        };
                    }
                    break;
                case "GITHUB_SEARCH":
                    log("🧭 Router: githubService"); log("🔌 Service: GitHub");
                    response = e.username ? formatGithubUser(await data.githubUser(e.username)) : formatGithub(await data.githubSearchRepos(e.query, 5));
                    break;
                case "SEARCH_WEB":
                    log("🧭 Router: browser search");
                    const url = `https://www.google.com/search?q=${encodeURIComponent(e.query)}`;
                    const searchResult = browser?.open ? await browser.open(url) : await window.jarvis.openURL(url);
                    response = searchResult?.success === false ? (searchResult.error || "I couldn't perform that search.") : `Searching the web for ${e.query}.`;
                    break;
                default:
                    return { handled: false };
            }

            log("🌐 API Request completed");
            // Smart Reply variation: wrap data responses (weather, time, etc.)
            // with varied phrasing so JARVIS never sounds repetitive.
            if (window.JARVISSmartReplies && response && !preserveResponse) {
                const lang = (window.JARVISLanguageCore && window.JARVISLanguageCore.detectLanguage(input)) || "en";
                response = window.JARVISSmartReplies.vary(response, lang);
            }
            log("🗣️ TTS Response:", response);
            return {
                handled: Boolean(response),
                source: "natural-intent",
                response,
                richContent,
                intent: result.intent,
                confidence: result.confidence,
                entities: e,
                structured: result
            };
        } catch (error) {
            console.error("[NCE] Service error:", result.intent, error);
            return {
                handled: true,
                source: "natural-intent",
                response: friendlyError(result.intent, error),
                intent: result.intent,
                confidence: result.confidence,
                entities: e,
                error: error?.message || String(error)
            };
        }
    }

    async function getActiveIdentity() {
        try {
            const result = await window.jarvis?.users?.getActive?.();
            if (!result || result.success === false) return null;
            const data = result.data || result;
            const user = data.user || {};
            const profile = data.profile || user.profile || user;
            const name = String(profile.preferredName || profile.name || user.preferredName || user.name || "").trim();
            const userId = String(data.userId || user.userId || profile.userId || "guest").trim();
            return name ? { name, userId: userId || "guest" } : null;
        } catch (_) {
            return null;
        }
    }

    function unwrap(result) { return result?.data || result || {}; }
    function formatWeather(r) { const d = unwrap(r); return d.success ? `${d.place} mein abhi ${d.temperature}${d.unit} (feels like ${d.feelsLike}${d.unit}), ${d.condition}, humidity ${d.humidity}%, wind ${d.windSpeed} km/h.` : (d.error || "I couldn't get that weather information."); }
    function formatCurrency(r) { const d = unwrap(r); return d.success ? `${d.amount} ${d.from} = ${d.converted} ${d.to} (rate: ${d.rate}, as of ${d.date}).` : (d.error || "Currency conversion nahi ho paya."); }
    function formatLocation(r) { const d = unwrap(r); const h = d.results?.[0]; return h ? `${h.name || h.displayName || "Location"} (lat: ${h.lat}, lon: ${h.lon}).` : (d.error || "Location nahi mili."); }
    function formatCountry(r) { const d = unwrap(r); return d.success ? `${d.name}: Capital ${d.capital}, Region ${d.region}, Population ${d.population?.toLocaleString?.() || d.population}, Currency ${(d.currencies || []).join(", ") || "N/A"}, Languages ${(d.languages || []).join(", ") || "N/A"}.` : (d.error || "Country information nahi mili."); }
    function formatKnowledge(r) { const d = unwrap(r); if (d.extract) return d.extract; if (d.summary) return d.summary; if (d.success) return `${d.label || d.title}: ${d.description || d.extract || "No description available."}`; return d.error || "I couldn't find reliable information on that topic."; }
    function formatBook(r) { const d = unwrap(r); return d.success ? `"${d.title}" by ${d.author} (${d.firstPublishYear || "year unknown"}).` : (d.error || "Koi book nahi mili."); }
    function formatTV(r) { const d = unwrap(r); return d.success ? `${d.name} (${d.status}, premiered ${d.premiered || "unknown"}, rating ${d.rating ?? "N/A"}): ${stripHtml(d.summary || "No summary available.")}` : (d.error || "Koi show nahi mila."); }
    function formatRecipe(r) { const d = unwrap(r); return d.success ? `${d.name} (${d.area || ""} ${d.category || ""}). Ingredients: ${(d.ingredients || []).slice(0, 8).join(", ")}. ${d.instructions || ""}` : (d.error || "Koi recipe nahi mili."); }
    function formatPokemon(r) { const d = unwrap(r); return d.success ? `${d.name} (#${d.id}) — Types: ${(d.types || []).join(", ")}, Height ${d.height}, Weight ${d.weight}, Abilities: ${(d.abilities || []).join(", ")}.` : (d.error || "Koi Pokémon nahi mila."); }
    function formatNews(r) { const d = unwrap(r); return d.success ? `Latest news:\n${(d.items || []).map(i => `- ${i.title} (${i.source})`).join("\n")}` : (d.error || "Koi news nahi mili."); }
    function formatImages(r) {
        const d = unwrap(r);
        return d.success
            ? `I found ${(d.images || []).length} image${(d.images || []).length === 1 ? "" : "s"} for ${d.query || "your search"}${d.source ? ` from ${d.source}` : ""}.`
            : (d.error || "Koi image nahi mili.");
    }
    function formatGithub(r) { const d = unwrap(r); return d.success ? `Top GitHub repositories:\n${(d.repos || []).map(x => `- ${x.fullName} ⭐${x.stars} — ${x.description || ""}`).join("\n")}` : (d.error || "Koi GitHub repo nahi mila."); }
    function formatGithubUser(r) { const d = unwrap(r); return d.success ? `${d.name || d.login} — ${d.bio || "no bio"}. Repos: ${d.publicRepos}, Followers: ${d.followers}. ${d.profileUrl || ""}` : (d.error || "GitHub user nahi mila."); }
    function stripHtml(value) { return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(); }
    function friendlyError(intent, error) { return `I couldn't complete ${String(intent || "that request").toLowerCase().replace(/_/g, " ")} right now. ${error?.message || "The service may be unavailable."}`; }

    window.JARVISNaturalCommandEngine = Object.freeze({
        version: VERSION,
        normalize,
        detect,
        clarification,
        execute,
        async process(input) {
            const result = detect(input);
            return execute(result);
        }
    });

    window.addEventListener("JARVIS_INTENT_FINAL_READY", () => console.log("✅ Natural Command Engine ready alongside existing IntentEngine"), { once: true });
    console.log(`🧠 JARVIS Natural Command Engine ${VERSION} READY`);
})();




