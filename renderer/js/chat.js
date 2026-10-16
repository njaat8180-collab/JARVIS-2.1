"use strict";

/*
=========================================================
 JARVIS PRO MAX
 CHAT ENGINE V12 PROFESSIONAL
 FIXED / MERGED SINGLE FILE
 (Parts 1-4 combined into one valid class)
=========================================================
*/

class JARVISChat {

    constructor(options = {}) {

        // =================================================
        // IDENTITY
        // =================================================

        this.name = options.name || "JARVIS";
        this.version = "V12 PROFESSIONAL";
        this.author = "JARVIS";

        // =================================================
        // STATUS
        // =================================================

        this.status = "created";
        this.initialized = false;
        this.processing = false;
        this.booted = false;

        // =================================================
        // SESSION
        // =================================================

        this.sessionID =
            "JARVIS-" +
            Date.now().toString(36) +
            "-" +
            Math.random().toString(36).slice(2, 8);

        this.createdAt = Date.now();
        this.lastActivity = Date.now();

        // =================================================
        // CHAT MEMORY
        // =================================================

        this.history = [];
        this._exactAnswerDbPromise = null;
        this.context = {};
        this.memoryKey = "JARVIS_CHAT_MEMORY_V12";
        this.maxHistory = 500;

        // =================================================
        // ENGINES
        // =================================================

        this.engines = {
            brain: null,
            browser: null,
            reasoning: null,
            planning: null,
            decision: null,
            action: null,
            memory: null,
            knowledge: null,
            vision: null,
            taskPlanner: null,
            goals: null,
            executor: null,
            monitor: null,
            learning: null,
            voice: null,
            manager: null,
            registry: null,
            bus: null
        };

        // =================================================
        // ENGINE ALIASES
        // =================================================

        this.engineAliases = {
            brain: ["JARVISBrain", "BrainController"],
            browser: ["BrowserBrain", "BrowserAgent", "BrowserController"],
            reasoning: ["ReasoningAgent", "ReasoningEngine"],
            planning: ["PlanningAgent", "PlanningEngine"],
            decision: ["DecisionAgent", "DecisionEngine"],
            action: ["ActionAgent", "ActionEngine"],
            memory: ["MemoryManagerAgent", "MemoryManager", "JARVISMemory"],
            knowledge: ["KnowledgeAgent"],
            vision: ["VisionAgent"],
            taskPlanner: ["TaskPlanner"],
            goals: ["GoalManager"],
            executor: ["AgentExecutor"],
            monitor: ["AgentMonitor"],
            learning: ["SelfLearningAgent", "LearningAgent"],
            voice: ["VoiceAgent", "VoiceEngine", "TTSEngine"],
            manager: ["AgentManager"],
            registry: ["AgentRegistry"],
            bus: ["AgentBus", "JARVISBus"]
        };

        // =================================================
        // CONFIGURATION
        // =================================================

        this.config = {
            maxHistory: 500,

            autoSave: true,
            // "immediate": save after every message (safest, slowest)
            // "debounced": coalesce saves within autoSaveDebounceMs (default, fast)
            // "manual": never auto-save — caller must call flushSaveMemory()
            autoSaveMode: "debounced",
            autoSaveDebounceMs: 1500,

            voice: true,
            debug: true,

            memoryFirst: true,
            browserFirst: true,
            offlineFirst: true,
            // FALSE — this is the fix for "JARVIS only gives fixed/canned
            // replies instead of thinking for itself". ROUTE 4 (below)
            // used to run the huge legacy renderer/js/brain/* scripted
            // engine (JARVISBrain) BEFORE the AI fallback, and it always
            // returned handled:true — even for generic/broken replies
            // like "I am still processing your previous request." —
            // which meant ROUTE 6 (the real, self-thinking embedded model
            // in src/ai/embeddedBrain.js) was NEVER reached for ordinary
            // conversation. With this off, ROUTE 4 is skipped entirely so
            // general chit-chat/questions fall through to ROUTE 6 and get
            // a genuine, freshly-generated answer instead.
            brainFirst: false,

            // CONVERSATION CONTEXT / PENDING INTENT (Phase 1 of the
            // memory + conversation context upgrade). When true, a new
            // message is first checked against any pending follow-up
            // question (e.g. "Kis city ka weather?") before any other
            // route runs. See renderer/js/context/PendingIntentManager.js
            // and JARVIS_MEMORY_IMPLEMENTATION_STATUS.md. Set to false to
            // fully disable and fall back to old (no-follow-up) behavior.
            pendingIntentFirst: true,
            contextWindowSize: 20,

            // REFERENCE RESOLUTION / TOPIC CONTINUITY (Phase 5). When
            // true, a short follow-up like "When was it founded?" has
            // "it" substituted with the active topic (e.g. "NASA")
            // BEFORE normal routing runs, so existing routes see a
            // fully-specified sentence. See
            // renderer/js/context/ReferenceResolver.js and
            // JARVIS_MEMORY_IMPLEMENTATION_STATUS.md, Phase 5. Set to
            // false to fully disable (kill switch), matching the
            // pendingIntentFirst pattern above.
            referenceResolutionFirst: true,

            // YES/NO CONFIRMATION (Phase 6). When true: (1) a
            // permission-asking question about opening a known site
            // ("Should I open YouTube?" / "Kya main YouTube khol
            // doon?") is answered by asking back for a yes/no instead
            // of opening the site immediately, and (2) the very next
            // message is checked against that pending confirmation
            // (via haan/nahi/yes/no word lists shared with
            // PendingIntentManager.js) BEFORE any other route,
            // including pending-intent parameter resolution, runs.
            // See ConversationContextManager.setConfirmation()/
            // getConfirmation() (storage since Phase 1) and
            // JARVIS_MEMORY_IMPLEMENTATION_STATUS.md, Phase 6. Set to
            // false to fully disable (kill switch), matching the
            // pendingIntentFirst/referenceResolutionFirst pattern.
            confirmationFirst: true,

            // FULL API / SKILL INTEGRATION (Phase 13). The natural-intent
            // engine is the shared adapter for the existing skills below.
            // This flag gates the new context/pending wiring only; it does
            // not replace any existing skill implementation.
            apiIntegrationFirst: true,
            memoryContextLimit: 5,

            // Deterministic skills still get first refusal, while unmatched
            // conversation reaches the configured local Ollama model.
            aiFallback: true,
            universalAIFallback: true,
            // Normal conversational replies go through the configured chat
            // provider (Sarvam by default); keep system commands routed above.
            chitChatLocalFirst: false,

            // -------------------------------------------------------
            // MEMORY ENGINE CONTRACT
            // -------------------------------------------------------
            // saveMemory() (full session state) and saveMemoryFact()/
            // readMemoryFacts() (individual remembered facts) talk to
            // very different shapes of data, and there is no single
            // universal method signature every MemoryManagerAgent
            // implementation will accept. Rather than have the engine
            // silently GUESS via duck-typing (which can silently call
            // the wrong method with the wrong arguments on a real
            // MemoryManagerAgent), you can wire the exact contract your
            // memory engine expects here. When set, these override the
            // duck-typed fallback entirely for their respective calls:
            //
            //   memoryAdapter: {
            //       saveState: async (key, data) => { ... },   // full session state
            //       loadState: async (key) => data,            // full session state
            //       saveFact:  async (fact, metadata) => { ... },
            //       readFacts: async (metadata) => [ "fact 1", "fact 2" ],
            //       clear:     async (key) => { ... }
            //   }
            //
            // Any function you omit falls back to the duck-typed method
            // search (this.engines.memory.save/remember/recall/etc).
            memoryAdapter: null,

            // "first-match": stop at the first agent that returns handled=true (default)
            // "pipeline": run every agent in order, passing accumulated context along
            agentMode: "first-match",

            preventDuplicate: true,
            maxInputLength: 10000,
            responseTimeout: 30000
        };

        // =================================================
        // RUNTIME
        // =================================================

        this.runtime = {
            requestID: 0,
            lastRequest: null,
            lastResponse: null,
            lastError: null,
            requests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            timedOutRequests: 0,
            cancelledRequests: 0,
            startedAt: Date.now(),
            // How many send() calls are currently in flight. this.processing
            // is derived from this count so concurrent requests (via
            // options.allowConcurrent) don't clobber each other's state —
            // one request finishing no longer wrongly flips `processing`
            // to false while a sibling request is still running.
            activeRequests: 0,
            // Cancel tokens for every in-flight request, keyed by requestID.
            // cancel(requestID) cancels one specific request; cancel() with
            // no argument cancels ALL currently in-flight requests.
            cancelTokens: new Map()
        };

        // Pending debounced-save timer handle (see queueSaveMemory()).
        this._saveTimer = null;

        // =================================================
        // EVENT HANDLERS
        // =================================================

        this.listeners = {};

        // =================================================
        // INITIALIZATION PROMISE
        // =================================================

        this._bootPromise = null;

        // =================================================
        // SAFETY
        // =================================================

        this._destroyed = false;

        // =================================================
        // MANUAL ENGINE INJECTION
        // (needed for Node / module bundlers where engines
        //  are not exposed as browser globals)
        // =================================================

        if (options.engines && typeof options.engines === "object") {

            for (const key of Object.keys(this.engines)) {

                if (options.engines[key]) {
                    this.engines[key] = options.engines[key];
                }
            }
        }

        console.log("🧠 JARVIS Chat Kernel V12 Created");
    }

    // =====================================================
    // SAFE GLOBAL ACCESS
    // (checks window first, then falls back to globalThis
    //  so this also works in Node / worker / SSR contexts)
    // =====================================================

    getGlobal(name) {
        try {
            if (typeof window !== "undefined" && window && name in window) {
                return window[name];
            }

            if (
                typeof globalThis !== "undefined" &&
                globalThis &&
                name in globalThis
            ) {
                return globalThis[name];
            }
        } catch (error) {
            this.debug("Global access failed:", name, error);
        }
        return null;
    }

    // =====================================================
    // MANUAL ENGINE REGISTRATION
    // Use this when an engine isn't exposed as a global
    // (e.g. imported as a module) — it survives
    // connectEngines()/reconnectEngines() calls.
    // =====================================================

    useEngine(key, instance) {

        if (!key || !(key in this.engines)) {
            this.debug("useEngine: unknown engine key:", key);
            return false;
        }

        this.engines[key] = instance || null;

        this.emit("engineRegistered", { key, connected: Boolean(instance) });

        return true;
    }

    // =====================================================
    // SAFE FUNCTION CHECK
    // =====================================================

    isFunction(value) {
        return typeof value === "function";
    }

    // =====================================================
    // SAFE METHOD CALL
    // =====================================================

    async safeCall(target, method, args = [], fallback = null) {
        try {
            if (!target) {
                return fallback;
            }
            if (!this.isFunction(target[method])) {
                return fallback;
            }
            return await target[method](...args);
        } catch (error) {
            this.debug("safeCall failed:", method, error);
            this.runtime.lastError = error;
            return fallback;
        }
    }

    // =====================================================
    // INITIALIZE SYSTEM
    // =====================================================

    async init() {
        if (this.initialized) {
            return true;
        }

        if (this._destroyed) {
            console.warn("⚠ Chat Engine has been destroyed.");
            return false;
        }

        try {
            console.log("⚡ Chat Engine V12 Initializing...");

            this.connectEngines();

            await this.loadMemory();

            this.replayHistoryToUI();

            this.initialized = true;
            this.status = "ready";
            this.lastActivity = Date.now();

            this.emit("initialized", this.getStatus());

            console.log("✅ Chat Engine V12 Initialized");

            return true;
        } catch (error) {
            console.error("❌ Chat Init Failed:", error);
            this.runtime.lastError = error;
            this.status = "error";
            this.initialized = false;
            return false;
        }
    }

    // =====================================================
    // CONNECT ALL ENGINES
    // =====================================================

    connectEngines() {
        let connected = 0;

        for (const key of Object.keys(this.engineAliases)) {
            const aliases = this.engineAliases[key];

            let engine = null;
            let selectedName = null;

            for (const engineName of aliases) {
                const candidate = this.getGlobal(engineName);

                if (candidate) {
                    engine = candidate;
                    selectedName = engineName;
                    break;
                }
            }

            // Keep a manually-injected engine (via useEngine / constructor
            // options.engines) alive if no global candidate was found —
            // only overwrite with null when there was never an engine set.
            this.engines[key] = engine || this.engines[key] || null;

            if (engine) {
                connected++;
                console.log("✔ Connected:", key, "→", selectedName);
            } else {
                console.warn("⚠ Missing:", key, "→", aliases.join(" / "));
            }
        }

        this.debug("Engine connection complete:", connected);

        return connected;
    }

    // =====================================================
    // RECONNECT ENGINES
    // =====================================================

    reconnectEngines() {
        console.log("🔄 Reconnecting Chat Engines...");

        const count = this.connectEngines();

        this.emit("enginesReconnected", count);

        return count;
    }

    // =====================================================
    // GET ENGINE
    // =====================================================

    getEngine(name) {
        if (!name) {
            return null;
        }
        return this.engines[name] || null;
    }

    // =====================================================
    // ENGINE COUNT
    // =====================================================

    getConnectedEngineCount() {
        return Object.values(this.engines).filter(Boolean).length;
    }

    // =====================================================
    // ENGINE STATUS
    // =====================================================

    getEngineStatus() {
        const result = {};

        for (const key of Object.keys(this.engines)) {
            result[key] = {
                connected: Boolean(this.engines[key]),
                type: this.engines[key] ? typeof this.engines[key] : "null"
            };
        }

        return result;
    }

    // =====================================================
    // BOOT
    // =====================================================

    async boot() {
        if (this.booted) {
            return true;
        }

        if (this._bootPromise) {
            return this._bootPromise;
        }

        this._bootPromise = this._performBoot();

        return this._bootPromise;
    }

    // =====================================================
    // INTERNAL BOOT
    // =====================================================

    async _performBoot() {
        try {
            console.log("🚀 Chat Engine V12 Boot Starting...");

            const initialized = await this.init();

            if (!initialized) {
                throw new Error("Chat Engine initialization failed.");
            }

            this.connectEngines();

            this.status = "online";
            this.booted = true;

            console.log("🟢 Chat Engine V12 ONLINE");
            console.log("🔗 Connected Engines:", this.getConnectedEngineCount());

            this.emit("online", this.getStatus());

            return true;
        } catch (error) {
            console.error("❌ Chat Boot Error:", error);

            this.runtime.lastError = error;
            this.status = "error";
            this.booted = false;

            this.emit("error", error);

            return false;
        } finally {
            this._bootPromise = null;
        }
    }

    // =====================================================
    // STATUS
    // =====================================================

    getStatus() {
        return {
            name: this.name,
            version: this.version,
            author: this.author,
            status: this.status,
            initialized: this.initialized,
            booted: this.booted,
            processing: this.processing,
            session: this.sessionID,
            messages: this.history.length,
            connectedEngines: this.getConnectedEngineCount(),
            memoryFirst: this.config.memoryFirst,
            browserFirst: this.config.browserFirst,
            brainFirst: this.config.brainFirst,
            aiFallback: this.config.aiFallback,
            requests: this.runtime.requests,
            successfulRequests: this.runtime.successfulRequests,
            failedRequests: this.runtime.failedRequests,
            lastActivity: this.lastActivity
        };
    }

    // =====================================================
    // EVENT SYSTEM
    // =====================================================

    on(event, callback) {
        if (!event || !this.isFunction(callback)) {
            return () => {};
        }

        if (!Array.isArray(this.listeners[event])) {
            this.listeners[event] = [];
        }

        this.listeners[event].push(callback);

        return () => {
            this.off(event, callback);
        };
    }

    // =====================================================
    // OFF
    // =====================================================

    off(event, callback) {
        const list = this.listeners[event];

        if (!Array.isArray(list)) {
            return;
        }

        this.listeners[event] = list.filter(fn => fn !== callback);
    }

    // =====================================================
    // EMIT
    // =====================================================

    emit(event, data) {
        const list = this.listeners[event];

        if (!Array.isArray(list)) {
            return;
        }

        for (const callback of [...list]) {
            try {
                callback(data);
            } catch (error) {
                console.error("❌ Chat Event Error:", event, error);
            }
        }
    }

    // =====================================================
    // DEBUG
    // =====================================================

    debug(...args) {
        if (!this.config.debug) return;
        console.log("🧠 JARVIS CHAT:", ...args);
        if (window.JARVISDiagnostics) {
            window.JARVISDiagnostics.record("DEBUG", args.map((item) => typeof item === "string" ? item : JSON.stringify(item)).join(" "));
        }
    }

    // =====================================================
    // ERROR
    // =====================================================

    error(...args) {
        console.error("❌ JARVIS CHAT:", ...args);
    }

    // =====================================================
    // DESTROY
    // =====================================================

    destroy() {
        // Cancel anything still in flight before tearing down.
        this.cancel();

        this._destroyed = true;
        this.processing = false;
        this.status = "destroyed";
        this.booted = false;
        this.initialized = false;

        this.runtime.activeRequests = 0;
        this.runtime.cancelTokens.clear();

        this.listeners = {};

        console.log("🛑 JARVIS Chat Engine Destroyed");
    }

    // =====================================================
    // NORMALIZE USER INPUT
    // =====================================================

    normalizeInput(message) {
        if (message === null || message === undefined) {
            return "";
        }
        return String(message).replace(/\s+/g, " ").trim();
    }

    // =====================================================
    // VALIDATE INPUT
    // =====================================================

    validateInput(message) {
        const text = this.normalizeInput(message);

        if (!text) {
            return { valid: false, text: "", reason: "empty" };
        }

        if (text.length > this.config.maxInputLength) {
            return {
                valid: false,
                text: text.slice(0, this.config.maxInputLength),
                reason: "too_long"
            };
        }

        return { valid: true, text, reason: null };
    }

    // =====================================================
    // CREATE REQUEST ID
    // =====================================================

    createRequestID() {
        this.runtime.requestID++;
        return "CHAT-" + Date.now().toString(36) + "-" + this.runtime.requestID;
    }

    // =====================================================
    // COMMAND TEXT
    // =====================================================

    getCommandText(message) {
        return this.normalizeInput(message)
            .toLowerCase()
            .replace(/[?!.,;:]+$/g, "")
            .trim();
    }

    // =====================================================
    // BROWSER COMMAND DETECTOR
    // =====================================================

    isBrowserCommand(message) {
        const text = this.getCommandText(message);

        if (!text) {
            return false;
        }

        const browserPatterns = [
            /\b(search|google|look up|find)\b/,
            /\b(youtube|yt)\b/,
            /\b(open|launch|go to|visit)\b.*\b(website|site|url)\b/,
            /\b(open|launch|start)\b.*\b(browser|chrome|edge)\b/,
            /\b(search the web|web search|browse the web)\b/,
            /\b(google maps|maps|map location)\b/,
            /\b(search online|search internet|search on internet)\b/,
            // Named sites/apps people ask to open directly, e.g. "gmail
            // kholo" or "open telegram" — without needing to also say
            // "website"/"site" as the older patterns above required.
            /\b(open|launch|go to|visit|kholo|khol do|chalao|dikhao)\b.*\b(gmail|whatsapp|telegram|instagram|facebook|twitter|linkedin|reddit|discord|netflix|spotify|amazon|flipkart|myntra|meesho|paytm|phonepe|zomato|swiggy|hotstar|primevideo|jiocinema|wikipedia|wiki|chatgpt|gemini|github|stackoverflow|quora|pinterest|canva|bing|duckduckgo|drive|steam)\b/,
            /\b(gmail|whatsapp|telegram|paytm|zomato|swiggy|hotstar|myntra|meesho|flipkart)\s+(kholo|khol do|chalao|dikhao|open|karo)\b/
        ];

        return browserPatterns.some(pattern => pattern.test(text));
    }

    // =====================================================
    // OFFLINE / LOCAL COMMAND DETECTOR
    // =====================================================

    isOfflineCommand(message) {
        const text = this.getCommandText(message);

        if (!text) {
            return false;
        }

        const patterns = [
            /\b(start|run|begin)\s+(?:system\s+)?diagnos(?:is|tics?)\b/,
            /\b(self\s+diagnosis|self\s+diagnostics|diagnose\s+jarvis|agent\s+(?:status|health|count)|how\s+many\s+agents|agents?\s+(?:working|running|active))\b/,
            /डायग्नोसिस|डायग्नोस्टिक्स|कितने.*एजेंट|एजेंट.*काम कर|एजेंट्स की स्थिति/,
            /\bfocus\s*(sprint|timer|session)\b/,
            /\b(start|pause|resume|cancel|stop)\s+focus\b/,
            /फोकस\s*(स्प्रिंट|टाइमर)/,
            /\b(brief me|daily briefing|system briefing|morning briefing|give me a briefing)\b/,
            /स्थिति बताओ|आज की जानकारी दो|डेली ब्रीफिंग/,
            /\b(notes?|short notes?|summary|revision notes?)\b.*\b(working with windows 7|windows 7)\b/,
            /\b(working with windows 7|windows 7)\b.*\b(notes?|short notes?|summary|revision notes?)\b/,
            /नोट्स.*विंडोज़? 7|विंडोज़? 7.*नोट्स/,
            /\b(research|compare prices?|check prices?|price of|how much is)\b.*\b(for|of)?\s*[a-z0-9][a-z0-9 -]{1,100}$/,

            /\b(what('?s| is) the time)\b/,
            /\b(current time)\b/,
            /\b(time now)\b/,
            /\b(tell me the time)\b/,
            /\btime\s+(?:batao|bata\s+do)\b/i,
            /\b(?:samay|waqt)\s+(?:batao|bata\s+do)\b/i,

            /\b(what('?s| is) today('?s)? date)\b/,
            /\b(current date)\b/,
            /\b(today('?s)? date)\b/,
            /\b(what day is it)\b/,

            /\b(system status)\b/,
            /\b(system information)\b/,
            /\b(pc status)\b/,
            /\b(computer status)\b/,

            /\b(open|launch|start)\b.*\b(notepad)\b/,
            /\b(open|launch|start)\b.*\b(calculator)\b/,
            /\b(open|launch|start)\b.*\b(vs code|visual studio code|code editor)\b/,
            /\b(open|launch|start)\b.*\b(file explorer|explorer)\b/,

            /\b(jarvis status)\b/,
            /\b(system diagnostics)\b/,
            /\b(are you online)\b/,
            /\b(are you there)\b/,

            /\b(remember that)\b/,
            /\b(remember this)\b/,
            /\b(don'?t forget)\b/,
            /\b(do not forget)\b/,

            /\b(what do you remember)\b/,
            /\b(show my memory)\b/,
            /\b(my memories)\b/
        ];

        return patterns.some(pattern => pattern.test(text));
    }

    // =====================================================
    // MEMORY SAVE MATCH
    //
    // Anchored regex (not startsWith/includes) so that things like
    // "I don't remember where I put my keys" or "remembering the day"
    // do NOT get misclassified as a save command. Requires actual
    // content after the trigger phrase — "remember" alone with
    // nothing to save is not treated as a memory command.
    // Returns the extracted fact text, or null if this isn't a
    // save-style memory command.
    // =====================================================

    getMemorySaveMatch(message) {

        const text = this.normalizeInput(message);

        if (!text) {
            return null;
        }

        const pattern =
            /^(?:please\s+)?(?:remember(?:\s+(?:that|this))?|don'?t forget(?:\s+(?:that|this))?|do not forget(?:\s+(?:that|this))?|(?:ye|is)\s+baat\s+yaad\s+rakh(?:na|o)|yaad\s+rakh(?:na|o)|(?:ये|इस)\s+बात\s+याद\s+रख(?:ना|ो)|याद रखना|याद रखो)\s*[:,-]?\s+(.+)$/i;

        const match = text.match(pattern);

        if (match && match[1] && match[1].trim()) {
            return match[1].trim();
        }

        const projectProgress = text.match(/^(?:save|remember)\s+(?:my\s+)?(?:current\s+)?project\s+progress\s*[:,-]\s*(.+)$/i)
            || text.match(/^mere\s+project\s+ki\s+current\s+progress\s+save\s+kar\s+do\s*[:,-]\s*(.+)$/i)
            || text.match(/^मेरे\s+प्रोजेक्ट\s+की\s+प्रोग्रेस\s+सेव\s+कर\s+दो\s*[:,-]\s*(.+)$/i);
        if (projectProgress?.[1]?.trim()) return `Project progress: ${projectProgress[1].trim()}`;

        return null;
    }

    getMemoryUpdateMatch(message) {
        const text = this.getCommandText(message);
        if (!text) return null;
        const match = text.match(/^(?:please\s+)?update\s+(?:the\s+)?memory\s+(?:about\s+)?(.+?)\s+(?:to|as)\s+(.+)$/i)
            || text.match(/^is\s+memory\s+ko\s+update\s+kar\s+do\s+(.+?)\s+(?:to|as)\s+(.+)$/i);
        if (match) return { query: match[1].trim(), value: match[2].trim() };
        if (/^(?:update|change)\s+(?:this|that|the)\s+memory|^is\s+memory\s+ko\s+update\s+kar\s+do$/i.test(text)) return { needsDetails: true };
        return null;
    }

    // =====================================================
    // MEMORY READ MATCH
    // =====================================================

    isMemoryReadCommand(message) {

        const text = this.getCommandText(message);

        if (!text) {
            return false;
        }

        const readPatterns = [
            /\bwhat do you remember\b/,
            /\bwhat you remember\b/,
            /\bshow my memory\b/,
            /\bshow memories\b/,
            /\bmy memories\b/,
            /\bwhat is in your memory\b/,
            /^(?:what(?:'s| is)\s+)?(?:my\s+name|mera\s+naam)\s*(?:hai|is)?\s*\?*$/i,
            /क्या याद है/,
            /मेरी यादें/,
            /पिछली बार.*कहाँ तक.*काम/,
            /प्रोजेक्ट.*(क्या याद|याद है)/,
            /coding preferences/i,
            /meri coding preferences/i,
            /where did i leave off/,
            /what was i working on last time/,
            /my project progress/i
        ];

        return readPatterns.some(pattern => pattern.test(text));
    }

    // =====================================================
    // OFFLINE COMMAND PROCESSOR
    // Actually answers the categories isOfflineCommand() detects,
    // instead of just detecting them and doing nothing.
    // =====================================================

    // === LEARNING: enhance response with learned knowledge ===
    // (moved inside processOfflineCommand to avoid floating code)

    async processOfflineCommand(message, metadata = {}) {

        // === LEARNING: enhance response with learned knowledge ===
        try {
            if (window.JARVISLearningManager) {
                var learnedContext = window.JARVISLearningManager.getKnowledgeContext(message);
                if (learnedContext) {
                    console.log("[Learning] Found relevant knowledge for:", message);
                    metadata.learnedKnowledge = learnedContext;
                }
            }
        } catch(_leErr) {}
        // === END LEARNING ===

        // Fast local command layer: system controls, real telemetry and common desktop actions.
        try {
            if (window.JARVISCommandCenter?.handle) {
                const commandResult = await window.JARVISCommandCenter.handle(message);
                if (commandResult?.handled) return commandResult;
            }
        } catch (commandError) {
            console.error("❌ JARVIS CommandCenter error:", commandError);
        }

        const text = this.getCommandText(message);
// ---- GREETINGS ----

if (
    /^(hi|hello|hey|hey jarvis|hello jarvis|hi jarvis|good morning|good afternoon|good evening)$/i.test(text)
) {

    return {
        handled: true,
        source: "offline",
        response: "Hello. I am JARVIS. How may I assist you?"
    };
}
        // ---- TIME ----
        if (window.JARVISNaturalCommandEngine?.detect?.(text)?.intent === "TIME" ||
            /^(?:please\s+)?(?:time\s+(?:batao|bata\s+do)|(?:samay|waqt)\s+(?:batao|bata\s+do)|time\s+in\b|timezone\b|what(?:'s|\s+is)\s+(?:the\s+)?time\b|current\s+time\b|time\s+now\b|tell\s+me\s+(?:the\s+)?time\b)\s*.*$/i.test(text.trim())) {

            const now = new Date();

            return {
                handled: true,
                source: "offline",
                response: `The current time is ${now.toLocaleTimeString()}.`
            };
        }

        // ---- DATE ----
        if (
            window.JARVISNaturalCommandEngine?.detect?.(text)?.intent === "DATE"
        ) {

            const now = new Date();

            return {
                handled: true,
                source: "offline",
                response: `Today's date is ${now.toLocaleDateString()}.`
            };
        }

        // ---- SYSTEM / JARVIS STATUS ----
        if (
            /\b(system status|system information|pc status|computer status|jarvis status|system diagnostics|are you online|are you there)\b/.test(
                text
            )
        ) {

            const status = this.getStatus();

            return {
                handled: true,
                source: "offline",
                response:
                    `JARVIS is ${status.status}. ` +
                    `Connected engines: ${status.connectedEngines}. ` +
                    `Messages this session: ${status.messages}.`
            };
        }

        // ---- OPEN APP COMMANDS ----
        // Detected locally, but execution is delegated to the action
        // engine if one is connected (this engine has no OS access itself).
        const opensApp =
            /\b(open|launch|start)\b.*\b(notepad|calculator|vs code|visual studio code|code editor|file explorer|explorer)\b/.test(
                text
            );

        if (opensApp) {

            const action = this.engines.action;

            if (action) {
                return await this.processAgent(action, message, metadata, "offline-action");
            }

            return {
                handled: true,
                source: "offline",
                response:
                    "I recognized that command, but no action engine is connected to execute it."
            };
        }

        return { handled: false, source: "offline", response: null };
    }

    // =====================================================
    // MEMORY COMMAND DETECTOR
    // =====================================================

    isMemoryCommand(message) {
        return Boolean(
            this.getMemorySaveMatch(message) ||
            this.getMemoryUpdateMatch(message) ||
            this.getMemoryForgetMatch(message) ||
            this.isMemoryReadCommand(message)
        );
    }

    // =====================================================
    // MEMORY FORGET MATCH
    // =====================================================

    getMemoryForgetMatch(message) {
        const text = this.getCommandText(message);
        if (!text) return null;

        if (/^(?:please\s+)?(?:forget|delete|remove)\s+(?:everything|all)(?:\s+(?:about|from))?\s*(?:my\s+)?(?:memories|memory)?$/.test(text)) {
            return { action: "all" };
        }

        const typeMap = [
            [/^(?:forget|delete|remove)\s+(?:everything|all)\s+(?:about\s+)?(?:my\s+)?preferences?$/, "USER_PREFERENCE"],
            [/^(?:forget|delete|remove)\s+(?:everything|all)\s+(?:about\s+)?(?:my\s+)?projects?$/, "USER_PROJECT"],
            [/^(?:forget|delete|remove)\s+(?:everything|all)\s+(?:about\s+)?(?:my\s+)?interests?$/, "USER_INTEREST"],
            [/^(?:forget|delete|remove)\s+(?:everything|all)\s+(?:about\s+)?(?:my\s+)?workflows?$/, "USER_WORKFLOW"]
        ];
        for (const [pattern, type] of typeMap) {
            if (pattern.test(text)) return { action: "type", type };
        }

        const keyMap = [
            [/^(?:forget|delete|remove)\s+(?:my\s+)?name$/, "user.name"],
            [/^(?:forget|delete|remove)\s+(?:my\s+)?(?:city|location)$/, "user.location"],
            [/^(?:forget|delete|remove)\s+(?:my\s+)?occupation$/, "user.occupation"],
            [/^(?:forget|delete|remove)\s+(?:my\s+)?project$/, "user.project"],
            [/^(?:forget|delete|remove)\s+(?:my\s+)?interest$/, "user.interest"],
            [/^(?:forget|delete|remove)\s+(?:my\s+)?workflow$/, "user.workflow"]
        ];
        for (const [pattern, key] of keyMap) {
            if (pattern.test(text)) return { action: "key", key };
        }

        // Phase 11: resolve an explicit deictic target such as
        // "forget this", "forget that", "forget it", or
        // "forget the previous one" against the active conversation
        // topic. The actual memory target is resolved later and is
        // deleted only when the topic maps to exactly one active memory.
        if (/^(?:forget|delete|remove)\s+(?:it|this|that|the\s+(?:same|previous)\s+one|same|previous\s+one)$/i.test(text)) {
            return { action: "reference" };
        }

        const statement = text.match(/^(?:forget|delete|remove)(?:\s+(?:that|this))?\s+(.+)$/i);
        if (statement && statement[1]) {
            return { action: "statement", statement: statement[1].trim() };
        }

        return null;
    }

    // =====================================================
    // MEMORY TOPIC READ MATCH (Phase 11)
    // =====================================================

    getMemoryTopicReadMatch(message) {
        const text = this.getCommandText(message);
        if (!text) return null;

        const match = text.match(/^(?:what\s+(?:do\s+you\s+)?remember|what\s+is\s+in\s+your\s+memory|show\s+my\s+memory)\s+(?:about|regarding)\s+(.+)$/i);
        if (!match || !match[1]) return null;

        return { action: "topic-search", topic: match[1].trim() };
    }

    // =====================================================
    // KNOWLEDGE QUERY MATCH
    // Distinct from memory read: memory ("what do you remember")
    // returns the flat, timestamped fact list; knowledge search
    // queries KnowledgeAgent's structured, tagged, titled entries
    // (which saveMemoryFact() also dual-writes into — see below).
    // =====================================================

    getKnowledgeQueryMatch(message) {
        const text = this.getCommandText(message);

        if (!text) {
            return null;
        }

        const pattern =
            /^(?:what do you know about|tell me what you know about|search (?:your )?knowledge (?:for|about)?|do you know (?:anything )?about)\s+(.+)$|(.+?)\s+ke bare mein kya pata hai$|(.+?)\s+ke baare mein kya pata hai$/i;

        const match = text.match(pattern);

        if (!match) {
            return null;
        }

        const topic = (match[1] || match[2] || match[3] || "").trim();
        return topic || null;
    }

    isKnowledgeCommand(message) {
        return Boolean(this.getKnowledgeQueryMatch(message));
    }

    // =====================================================
    // PROCESS KNOWLEDGE COMMAND
    // Only reports handled:true when something is actually found —
    // an empty knowledge base falls through to routes further down
    // (offline/AI) instead of dead-ending the conversation.
    // =====================================================

    async processKnowledgeCommand(message, metadata = {}) {
        const topic = this.getKnowledgeQueryMatch(message);

        if (!topic) {
            return { handled: false, source: "knowledge", response: null };
        }

        const knowledge = this.engines.knowledge;

        if (!knowledge || !this.isFunction(knowledge.run)) {
            return { handled: false, source: "knowledge", response: null };
        }

        let results = [];

        try {
            results = await knowledge.run({ action: "search", query: topic });
        } catch (error) {
            this.debug("KnowledgeAgent search failed:", error);
            return { handled: false, source: "knowledge", response: null, error };
        }

        if (!Array.isArray(results) || !results.length) {
            // Nothing saved on this topic yet — let AI/offline routes try instead.
            return { handled: false, source: "knowledge", response: null };
        }

        const top = results.slice(0, 3).map(item => item.content || item.title).filter(Boolean);

        // Phase 5: this answer was about `topic` — remember it so a
        // follow-up like "tell me more about it" can resolve "it".
        try {
            window.JARVISConversationContext?.setTopic(topic, { source: "knowledge" });
        } catch (error) {
            this.debug("Topic set (knowledge) failed:", error);
        }

        return {
            handled: true,
            source: "knowledge",
            response: `Here's what I know about "${topic}": ${top.join(" | ")}`
        };
    }

    // =====================================================
    // WIKIPEDIA COMMAND MATCH
    // Handles "is mahine/saal/aaj kya hua", "on this day", and
    // explicit "wikipedia pe <topic> batao" requests by calling
    // the free Wikipedia API through window.jarvis.wikipedia
    // (main-process bridge — see src/services/wikipedia.js).
    // =====================================================

    isWikipediaCommand(message) {
        const text = this.getCommandText(message);
        if (!text) return false;

        return (
            /\bis\s+(mahine|maheene|mahina|mahiney)\b.*\bkya\s+hua\b/i.test(text) ||
            /\bis\s+(saal|sal|varsh|year)\b.*\bkya\s+(hua|bada)\b/i.test(text) ||
            /\baaj\b.*\bkya\s+hua\b/i.test(text) ||
            /\bhistory\s+me[in]?\s+aaj\b/i.test(text) ||
            /\bon\s+this\s+day\b/i.test(text) ||
            /\bwhat\s+happened\s+(today|this\s+month|this\s+year)\b/i.test(text) ||
            /\b(?:wikipedia|wiki)\b|विकिपीडिया|विकिपिडिया/iu.test(text)
        );
    }

    async processWikipediaCommand(message, metadata = {}) {
        const text = this.getCommandText(message) || "";
        const lower = text.toLowerCase();

        if (!window.jarvis || !window.jarvis.wikipedia) {
            return { handled: false, source: "wikipedia", response: null };
        }

        try {

            const isDateEventQuery =
                /\bkya\s+hua\b/i.test(lower) ||
                /\bkya\s+bada\b/i.test(lower) ||
                /\bwhat\s+happened\b/i.test(lower) ||
                /\bon\s+this\s+day\b/i.test(lower) ||
                /\bhistory\s+me[in]?\s+aaj\b/i.test(lower);

            // Explicit "wikipedia" mention that isn't a date/event
            // query -> straight topic summary lookup.
            if (/\b(?:wikipedia|wiki)\b|विकिपीडिया|विकिपिडिया/iu.test(lower) && !isDateEventQuery) {

                const topic = text
                    .replace(/\b(?:wikipedia|wiki)\b|विकिपीडिया|विकिपिडिया/giu, " ")
                    .replace(/\b(?:please|mujhe|tell\s+me|what\s+is|who\s+is|information|info|details?|about|from|using|on|search|look\s+up|find|for|pe|par|se|ke|baare|mein|main|me|karo|batao|bata|do|dijiye)\b/gi, " ")
                    .replace(/(?:के\s+बारे\s+में|के\s+लिए|कृपया|मुझे|बताइए|बताओ|बता\s+दो|क्या\s+है|कौन\s+है|जानकारी|की|का|के|से|में|पर|खोजो|ढूंढो)/gu, " ")
                    .replace(/[,:;]+/g, " ")
                    .replace(/\s+/g, " ")
                    .trim();

                if (topic) {
                    // Devanagari script or an explicit "hindi" request -> Hindi.
                    // Everything else (including plain Hinglish topics like
                    // "Minecraft on wikipedia") defaults to English, since
                    // defaulting to Hindi silently produced Devanagari text
                    // (and mis-pronounced TTS) for ordinary English topics.
                    const hasDevanagari = /[\u0900-\u097F]/.test(topic);
                    const explicitHindiRequest =
                        /\bhindi\b/i.test(topic) || /\bhindi\s+m(e|ai)n\b/i.test(lower);
                    const requestedLanguage = String(metadata.responseLanguage || "").toLowerCase();
                    const lang = (requestedLanguage === "hi" || hasDevanagari || explicitHindiRequest) ? "hi" : "en";

                    const result = await window.jarvis.wikipedia.summary(topic, lang);
                    const data = (result && result.data) || result;

                    if (data && data.success !== false && data.extract) {
                        const prefix = data.lang === "hi"
                            ? "विकिपीडिया के अनुसार"
                            : "According to Wikipedia";

                        // Phase 5: use Wikipedia's own canonical title
                        // (proper capitalization, e.g. "NASA" rather
                        // than the lowercased raw entity) as the topic
                        // subject — the best-quality subject available
                        // for a future "it"/"that" follow-up.
                        try {
                            window.JARVISConversationContext?.setTopic(data.title || topic, {
                                source: "wikipedia"
                            });
                        } catch (error) {
                            this.debug("Topic set (wikipedia) failed:", error);
                        }

                        return {
                            handled: true,
                            source: "wikipedia",
                            response: `${prefix}, ${data.title}: ${data.extract}`
                        };
                    }

                    return {
                        handled: true,
                        source: "wikipedia",
                        response: lang === "hi"
                            ? `विकिपीडिया पर “${topic}” के बारे में जानकारी नहीं मिली।`
                            : `No Wikipedia information was found for “${topic}”.`
                    };
                }

                if (!topic) {
                    return { handled: true, source: "wikipedia", response: "किस विषय के बारे में Wikipedia से जानकारी चाहिए?" };
                }
            }

            // "is mahine kya hua" / "is saal kya hua" / "aaj kya hua" /
            // "on this day" -> Wikipedia's On This Day historical feed.
            const isThisMonth = /\b(mahine|maheene|mahina|mahiney|this\s+month)\b/i.test(lower);
            const isThisYear = /\b(saal|sal|varsh|year)\b/i.test(lower);

            const otdResult = await window.jarvis.wikipedia.onThisDay({ type: "events", limit: 5 });
            const otdData = (otdResult && otdResult.data) || otdResult;
            const items = (otdData && otdData.items) || [];

            if (!items.length) {
                return {
                    handled: true,
                    source: "wikipedia",
                    response: "Aaj ke din Wikipedia par koi bada event record nahi mila, sir."
                };
            }

            const lines = items.map(item => `- ${item.year}: ${item.text}`).join("\n");

            let intro = "Wikipedia (On This Day) ke mutabik, aaj ke din itihaas mein kuch aisa hua tha:";
            if (isThisMonth) {
                intro = "Poore mahine ka data Wikipedia se ek baar mein nahi milta, is liye aaj ki tareekh ke bade historical events bata raha hoon:";
            } else if (isThisYear) {
                intro = "Poore saal ka summary Wikipedia se seedha nahi milta, is liye aaj ki tareekh par itihaas mein hui bade events bata raha hoon:";
            }

            return {
                handled: true,
                source: "wikipedia",
                response: `${intro}\n${lines}`
            };

        } catch (error) {
            this.debug("Wikipedia command failed:", error);
            return { handled: false, source: "wikipedia", response: null, error };
        }
    }

    // =====================================================
    // EXTERNAL DATA SOURCES — facts, countries, places,
    // weather, books, TV shows, recipes, Pokémon, news,
    // currency, time, Wikimedia images, GitHub. All free/
    // key-less public APIs via window.jarvis.data (main
    // process bridge — see src/services/dataSources.js).
    // =====================================================

    // Strips a leading trigger phrase and common Hindi/English
    // filler words, leaving just the topic/entity the user asked
    // about (e.g. "weather in Mumbai batao" -> "Mumbai").
    _extractDataTopic(text, triggerRegex) {
        return text
            .replace(triggerRegex, "")
            .replace(/\b(in|of|for|about|ka|ki|ke|ko|mein|me|batao|bata|do|dijiye|kya|hai|please|pe|par|search|karo)\b/gi, "")
            .replace(/\s{2,}/g, " ")
            .trim();
    }

    isDataSourceCommand(message) {
        const text = this.getCommandText(message);
        if (!text) return false;

        return (
            /\b(weather|mausam)\b/i.test(text) ||
            /\b(capital of|population of|currency of|desh\s+ke\s+baare|country\s+info)\b/i.test(text) ||
            /\b(near me|address of|location of|kahan\s+hai|coordinates\s+of)\b/i.test(text) ||
            /\b(book|kitab)\b.*\b(about|by|search|likhi)\b/i.test(text) ||
            /\b(tv\s+show|episode\s+of|serial)\b/i.test(text) ||
            /\brecipe\b|\bkaise\s+banaye\b|\bkhana\s+kaise\s+banta\b/i.test(text) ||
            /\bpokemon\b|\bpok[ée]mon\b/i.test(text) ||
            /\b(news|khabar|samachar)\b/i.test(text) ||
            /\b(exchange\s+rate|currency\s+convert|convert)\b.*\b(usd|inr|eur|gbp|jpy|cny|chf|krw|aed|rupees?|rupaye|rupaya|dollars?|euros?|pounds?|yen|yuan|renminbi|francs?|won|dirhams?)\b/i.test(text) ||
            /\btime\s+in\b|\bkitne\s+baje\s+hai\b.*\b(mein|me)\b|\btimezone\b|\btime\s+batao\b|\bsamay\s+batao\b|\bworld\s+clock\b|\bkitne\s+baje\s+(?:hai|hain)\b/i.test(text) ||
            /\bimages?\s+(?:of|for)\b|\bphotos?\s+(?:of|for)\b|\bpictures?\s+(?:of|for)\b|\btasveer\b.*\bdikhao\b/i.test(text) ||
            /\b(?:video|videos|clip|clips)\b.*\b(?:of|for|dikhao|dikhado|search|find|chahiye)?\b/i.test(text) ||
            /\bgithub\b.*\b(repo|repos|repository|user|information|info|details?|about|find|search|project|projects)\b/i.test(text) ||
            /\bwikidata\b/i.test(text)
        );
    }

    // =====================================================
    // PENDING INTENT RESOLUTION (ROUTE -1 handler)
    //
    // Called only when window.JARVISPendingIntent.hasPending() is
    // true. Tries the new message as the answer to whatever JARVIS
    // last asked, and if resolved, dispatches straight to the skill
    // that asked the question — skipping normal intent detection
    // entirely, since the intent is already known.
    //
    // Skills register themselves in _pendingIntentExecutors(). Only
    // WEATHER is wired in this phase; unresolved/unknown intents fall
    // through to normal routing untouched.
    // =====================================================
    async _resolvePendingIntent(text, metadata = {}) {
        if (!window.JARVISPendingIntent) {
            return { handled: false, source: "pending-intent", response: null };
        }

        const result = window.JARVISPendingIntent.tryResolve(text);

        if (result.reason === "cancelled") {
            return {
                handled: true,
                source: "pending-intent",
                response: "ओके, कोई बात नहीं।"
            };
        }

        if (!result.resolved) {
            // "no-pending" or "no-match" — nothing to do here, let the
            // normal routes below try this message instead.
            return { handled: false, source: "pending-intent", response: null };
        }

        try {
            const executor = this._pendingIntentExecutors()[result.intent];

            if (typeof executor === "function") {
                const executed = await executor(result.parameters, result);
                this._recordActiveIntent(executed, 'pending-intent');
                return executed;
            }

            // Phase 13: every natural-intent skill can now use the same
            // pending architecture without a duplicate per-skill executor.
            return await this._executeNaturalPending(text, result);
        } catch (error) {
            console.error("[PENDING-INTENT] Execution failed:", error);
            return {
                handled: true,
                source: "pending-intent",
                response: "Sorry, I couldn't complete that."
            };
        }

        // Resolved, but no executor registered yet for this intent —
        // should not normally happen since only skills that register an
        // executor here are allowed to call setPending() in the first
        // place, but fail safe rather than throw.
        return { handled: false, source: "pending-intent", response: null };
    }

    // =====================================================
    // YES/NO CONFIRMATION RESOLUTION (ROUTE -1.2 handler, Phase 6)
    //
    // Called only when window.JARVISConversationContext.hasConfirmation()
    // is true. Tries the new message as an affirmative/negative/cancel
    // answer to whatever yes/no question JARVIS last asked (currently
    // only the OPEN_CONFIRMATION site-open flow registers one — see
    // _startOpenConfirmation() below), reusing the exact same
    // haan/nahi/yes/no/cancel word lists PendingIntentManager.js
    // already built and uses for its own cancel-phrase handling.
    // =====================================================
    async _resolveConfirmation(text, metadata = {}) {
        const context = window.JARVISConversationContext;

        if (!context || !context.hasConfirmation()) {
            return { handled: false, source: "confirmation", response: null };
        }

        // getCommandText() lowercases and strips trailing
        // punctuation ("Yes." -> "yes") — the shared helpers below do
        // an exact-match lookup against plain word lists, so a
        // trailing "." on a real yes/no answer must not prevent a
        // match.
        const normalized = this.getCommandText(text);
        const helpers = window.JARVISPendingIntentHelpers || {};
        const affirmative =
            typeof helpers.isAffirmative === "function" && helpers.isAffirmative(normalized);
        const negative =
            typeof helpers.isNegative === "function" && helpers.isNegative(normalized);
        const cancelled =
            typeof helpers.isCancelPhrase === "function" && helpers.isCancelPhrase(normalized);

        if (!affirmative && !negative && !cancelled) {
            // Doesn't look like yes/no/cancel — leave the confirmation
            // pending (same "no-match, fall through" behavior as
            // PendingIntentManager.tryResolve()) and let normal
            // routing try this message instead, so a genuinely new
            // command still works while JARVIS is "waiting".
            return { handled: false, source: "confirmation", response: null };
        }

        // getConfirmation() returns a debug-safe copy without
        // onYes/onNo (see ConversationContextManager.getConfirmation()).
        // Read the actual callback functions from the raw stored
        // object instead — the same documented exception
        // PendingIntentManager.tryResolve() uses for its resolver
        // function.
        const pendingRaw = context.pendingConfirmation;
        context.clearConfirmation();

        try {
            const callback = affirmative ? pendingRaw && pendingRaw.onYes : pendingRaw && pendingRaw.onNo;

            if (typeof callback === "function") {
                const result = await callback();
                if (result && typeof result === "object") {
                    return { source: "confirmation", ...result, handled: true };
                }
            }

            return {
                handled: true,
                source: "confirmation",
                response: affirmative ? "Okay." : "ओके, कोई बात नहीं।"
            };
        } catch (error) {
            console.error("[CONFIRMATION] Execution failed:", error);
            return {
                handled: true,
                source: "confirmation",
                response: "Sorry, I couldn't complete that."
            };
        }
    }

    // =====================================================
    // TOPIC CONTINUITY (Phase 5)
    //
    // Maps a NaturalCommandEngine intent to the entity key that best
    // represents "the thing this answer was about", so a follow-up
    // like "When was it founded?" has something to resolve "it"
    // against. Only intents whose answer is genuinely about a single
    // named subject are listed here — WEATHER/TIME/CURRENCY are
    // deliberately excluded (their pending-intent flow already
    // handles follow-ups, and "it" after a weather report is
    // ambiguous/unlikely to be useful).
    // =====================================================
    _resolveContextualFollowup(rawText) {
        const text = String(rawText || '').trim();
        const ctx = window.JARVISConversationContext;
        const active = ctx?.getActiveIntent?.();
        const topic = ctx?.getTopic?.();
        const subject = String(topic?.subject || '').trim();
        if (!text || !subject) return { resolved: false, reason: 'no-topic' };

        const intent = String(active?.intent || topic?.intent || '').toUpperCase();
        const lower = text.toLowerCase();
        const cleanSubject = subject.replace(/^the\s+/i, '').trim();

        if (intent === 'WEATHER') {
            if (/^(?:aur\s+)?(?:kal|tomorrow)(?:\s*\?)?$/i.test(text)) {
                return { resolved: true, text: `weather tomorrow in ${cleanSubject}`, kind: 'weather-tomorrow' };
            }
            if (/^(?:aur\s+)?(?:aaj|today)(?:\s+ka)?\s*(?:weather|mausam)?\s*\?*$/i.test(text)) {
                return { resolved: true, text: `weather in ${cleanSubject}`, kind: 'weather-today' };
            }
            if (/^(?:aur\s+)?(?:temperature|temp)(?:\s+kitna|kitni|how much)?\s*\?*$/i.test(text)) {
                return { resolved: true, text: `temperature in ${cleanSubject}`, kind: 'weather-temperature' };
            }
            if (/^(?:aur\s+)?(?:humidity|rain|baarish|wind|hawa)(?:\s+ka)?\s*\?*$/i.test(text)) {
                return { resolved: true, text: `${lower.replace(/\?+$/,'')} in ${cleanSubject}`, kind: 'weather-detail' };
            }
            if (/^(?:wahan|wahaan|there)\s+(?:ka|ki|ke)?\s*(?:weather|mausam|temperature|temp|forecast)\s*\?*$/i.test(text)) {
                return { resolved: true, text: `weather in ${cleanSubject}`, kind: 'weather-place-reference' };
            }
        }

        if (intent === 'TIME' && /^(?:aur\s+)?(?:abhi|now|time|kitne\s+baje)(?:\s*\?)?$/i.test(text)) {
            return { resolved: true, text: `time in ${cleanSubject}`, kind: 'time-followup' };
        }

        return { resolved: false, reason: 'no-context-pattern' };
    }

    _TOPIC_ENTITY_BY_INTENT() {
        return {
            KNOWLEDGE: "topic",
            COUNTRY_INFO: "capital",
            LOCATION: "place",
            POKEMON: "pokemon",
            BOOK_SEARCH: "query",
            TV_SEARCH: "query",
            RECIPE_SEARCH: "query",
            GITHUB_SEARCH: "username"
        };
    }

    // Best-effort — never allowed to affect the actual chat response
    // if ConversationContext isn't available or something is off
    // about the result shape (see JARVIS_MEMORY_IMPLEMENTATION_STATUS.md
    // section on error handling: memory/context failures must never
    // break normal routing).
    _maybeSetTopicFromNaturalResult(result) {
        try {
            if (!result || !result.handled || result.clarification) {
                return;
            }

            const entityKey = this._TOPIC_ENTITY_BY_INTENT()[result.intent];
            if (!entityKey) {
                return;
            }

            const entities = result.entities || {};
            let subject = entities[entityKey];
            if (!subject && result.intent === "COUNTRY_INFO") subject = entities.country;

            // GITHUB_SEARCH can be a repo search (query) instead of a
            // user lookup (username) — fall back to query if username
            // wasn't the one actually used.
            if (!subject && result.intent === "GITHUB_SEARCH") {
                subject = entities.query;
            }

            subject = String(subject || "").trim();
            if (!subject) {
                return;
            }

            // NaturalCommandEngine's entities are extracted from an
            // already-lowercased normalized string (e.g. "nasa", not
            // "NASA"). Title-case it for a slightly better-quality
            // topic subject (Wikipedia/knowledge lookups tend to
            // tolerate imperfect casing anyway). Not a full proper-
            // noun/acronym detector — a known, documented limitation.
            const titleCased = subject.replace(/\b\w/g, (ch) => ch.toUpperCase());

            window.JARVISConversationContext?.setTopic(titleCased, {
                source: "natural-intent",
                intent: result.intent
            });
        } catch (error) {
            this.debug("Topic set (natural-intent) failed:", error);
        }
    }

    // Registry of { INTENT_NAME: async (parameters, rawResult) => routeResult }.
    // Add an entry here whenever a new skill is upgraded to use
    // window.JARVISPendingIntent.setPending() instead of guessing/
    // defaulting a missing parameter.
    _pendingIntentExecutors() {
        return {
            WEATHER: (parameters) => this._executeWeatherLookup(parameters.city),
            TIME: (parameters) => this._executeTimeLookup(parameters.city),
            CURRENCY: (parameters) => {
                const q = parameters.conversionQuery;
                return this._executeCurrencyConversion(q.amount, q.from, q.to);
            },
            PRODUCT_SEARCH: (parameters, rawResult) => this._continueProductSearch(parameters, rawResult)
        };
    }

    /**
     * Phase 13 fallback executor for natural-intent skills that were not
     * previously registered with the dedicated pending-intent registry.
     * The original request is combined with the user's missing parameter,
     * then sent back through the SAME natural-command engine. This avoids
     * duplicating service/API implementations for BOOK_SEARCH, TV_SEARCH,
     * RECIPE_SEARCH, POKEMON, IMAGE_SEARCH, VIDEO_SEARCH, GITHUB_SEARCH,
     * NEWS, LOCATION, COUNTRY_INFO, KNOWLEDGE and similar skills.
     */
    async _executeNaturalPending(rawText, result) {
        const original = String(result?.originalRequest || '').trim();
        const answer = String(rawText || '').trim();
        const combined = [original, answer].filter(Boolean).join(' ');

        if (!combined || !window.JARVISNaturalCommandEngine?.process) {
            return { handled: false, source: 'pending-intent', response: null };
        }

        try {
            const next = await window.JARVISNaturalCommandEngine.process(combined);
            if (next?.handled) {
                this._recordActiveIntent(next, 'natural-intent-pending');
            }
            return next || { handled: false, source: 'natural-intent', response: null };
        } catch (error) {
            console.error('[PENDING-INTENT] Natural skill execution failed:', error);
            return {
                handled: true,
                source: 'pending-intent',
                response: 'Sorry, I could not complete that request.'
            };
        }
    }

    _recordActiveIntent(result, source = 'router') {
        if (!result?.intent || !window.JARVISConversationContext?.setActiveIntent) {
            return null;
        }

        try {
            const active = window.JARVISConversationContext.setActiveIntent(result.intent, {
                confidence: result.confidence ?? null,
                entities: result.entities || {},
                source
            });
            if (window.JARVISDiagnostics) window.JARVISDiagnostics.record("CONTEXT", "📌 CONTEXT UPDATED: ACTIVE INTENT", { intent: active && active.intent, source });
            return active;
        } catch (error) {
            this.debug('Active intent update failed:', error);
            return null;
        }
    }

    async _retrieveRelevantMemory(text) {
        const limit = Math.max(1, Number(this.config.memoryContextLimit) || 5);
        const searchMemory = window.jarvis?.ai?.searchMemory;
        if (typeof searchMemory !== 'function') return [];

        try {
            const result = await searchMemory(String(text || ''), limit);
            const records = result?.data?.records || result?.records || [];
            const activeRecords = Array.isArray(records)
                ? records.filter(record => record && String(record.status || 'ACTIVE').toUpperCase() === 'ACTIVE').slice(0, limit)
                : [];
            if (window.JARVISDiagnostics) window.JARVISDiagnostics.record("MEMORY", "💾 MEMORY RETRIEVED", { query: String(text || ''), count: activeRecords.length, limit });
            return activeRecords.map(record => ({
                key: record.key,
                value: record.value,
                type: record.type,
                importance: record.importance
            }));
        } catch (error) {
            this.debug('Relevant memory retrieval failed:', error);
            return [];
        }
    }

    _naturalMissingParameter(result) {
        const e = result?.entities || {};
        const missingByIntent = {
            WEATHER: ['location'], TIME: ['location'],
            CURRENCY: ['amount', 'fromCurrency', 'toCurrency'],
            BOOK_SEARCH: ['query'], TV_SEARCH: ['query'], RECIPE_SEARCH: ['query'],
            POKEMON: ['pokemon'], IMAGE_SEARCH: ['query'], VIDEO_SEARCH: ['query'],
            GITHUB_SEARCH: ['query', 'username'], NEWS: ['topic'], LOCATION: ['place'],
            COUNTRY_INFO: ['country'], KNOWLEDGE: ['topic'], SEARCH_WEB: ['query'], SITE_SEARCH: ['query'],
            OPEN_APP: ['app'], OPEN_WEBSITE: ['url']
        };
        const candidates = missingByIntent[result?.intent] || [];
        return candidates.find(key => e[key] === undefined || e[key] === null || e[key] === '') || null;
    }

    _registerNaturalPending(result, originalText) {
        const prompt = result?.response;
        const missingParameter = this._naturalMissingParameter(result);
        if (!prompt || !missingParameter || !window.JARVISPendingIntent?.setPending) {
            return false;
        }

        const pending = window.JARVISPendingIntent.setPending({
            intent: result.intent,
            skill: `natural.${result.intent}`,
            missingParameter,
            collectedParameters: result.entities || {},
            originalRequest: originalText,
            prompt,
            resolver: (rawText) => {
                const value = String(rawText || '').trim();
                if (!value || value.split(/\s+/).length > 10) return null;
                return value;
            }
        });

        if (window.JARVISDiagnostics && pending) window.JARVISDiagnostics.record("PENDING", "⏳ PENDING INTENT CREATED", { intent: pending.intent, missingParameter: pending.missingParameter, skill: pending.skill });
        return Boolean(pending);
    }

    async _processNaturalIntent(text, metadata = {}) {
        const engine = window.JARVISNaturalCommandEngine;
        if (!engine?.detect || !engine?.process) return { handled: false };

        let detected;
        try {
            detected = engine.detect(text);
        } catch (error) {
            this.debug('Natural intent detection failed:', error);
            return { handled: false, source: 'natural-intent', response: null };
        }

        if (detected?.intent === 'CREATE_PRESENTATION') {
            this.debug('[PPT ROUTE] Natural intent matched; preparing existing PPT workflow:', {
                topic: detected.entities?.topic,
                slideCount: detected.entities?.slideCount,
                imageCount: detected.entities?.imageCount,
                wantsImages: detected.entities?.wantsImages,
                language: detected.entities?.language
            });
        }

        if (this.config.apiIntegrationFirst && detected?.intent && detected.intent !== 'unknown') {
            this._recordActiveIntent(detected, 'natural-intent');
        }

        const memoryContext = this.config.apiIntegrationFirst
            ? await this._retrieveRelevantMemory(text)
            : [];

        const result = await engine.process(text);

        if (detected?.intent === 'CREATE_PRESENTATION') {
            this.debug('[PPT ROUTE] Natural intent execution returned:', {
                handled: result?.handled === true,
                intent: result?.intent,
                source: result?.source,
                error: result?.error || null
            });
        }

        if (this.config.apiIntegrationFirst && result?.handled && result.intent) {
            this._recordActiveIntent(result, 'natural-intent');
        }

        if (result?.clarification && this.config.apiIntegrationFirst) {
            this._registerNaturalPending(result, text);
            if (window.JARVISDiagnostics) window.JARVISDiagnostics.record("PENDING", "❓ SKILL NEEDS PARAMETER", { intent: result.intent, missingParameter: this._naturalMissingParameter(result) });
        }

        if (memoryContext.length) {
            result.memoryContext = memoryContext;
        }

        return result;
    }

    // Shared by the normal WEATHER route and the pending-intent
    // executor above, so both paths return an identical response shape.
    async _executeWeatherLookup(place) {
        const r = await window.jarvis.data.weather(place);
        const d = (r && r.data) || r;

        if (d && d.success) {
            try {
                const placeName = String(d.place || place || '').trim();
                if (placeName) window.JARVISConversationContext?.setTopic(placeName, { source: 'weather', intent: 'WEATHER' });
            } catch (_) {}
            return {
                handled: true,
                source: "data",
                intent: "WEATHER",
                entities: { location: d.place || place },
                response: `${d.place} mein abhi ${d.temperature}${d.unit} (feels like ${d.feelsLike}${d.unit}), ${d.condition}, humidity ${d.humidity}%, wind ${d.windSpeed} km/h.`
            };
        }

        return {
            handled: true,
            source: "data",
            response: (d && d.error) || `"${place}" ka weather nahi mila.`
        };
    }

    // Dedicated resolver for WEATHER's pending intent — tighter than the
    // generic default resolver in PendingIntentManager.js, since "looks
    // like a place name" is a meaningfully stronger check than "is a
    // short reply". Bound with an arrow function where it's registered
    // so `this` isn't needed (kept as a plain function here so it stays
    // easy to unit-test in isolation).
    _resolvePlaceNameReply(rawText) {
        const text = String(rawText || "").trim();

        if (!text) {
            return null;
        }

        const wordCount = text.split(/\s+/).filter(Boolean).length;
        if (wordCount > 4) {
            return null;
        }

        // Place names are letters/spaces/hyphens/apostrophes only
        // (covers Hindi/Devanagari too) — rejects anything with digits
        // or punctuation that a real place name wouldn't have.
        if (!/^[a-zA-Z\u0900-\u097F][a-zA-Z\u0900-\u097F\s.'-]{0,60}$/.test(text)) {
            return null;
        }

        // Common non-place command words that would otherwise slip
        // through the shape check above (e.g. "time", "status").
        const NON_PLACE_WORDS = new Set([
            "time", "date", "today", "status", "weather", "news",
            "system", "jarvis", "recipe", "pokemon", "browser", "youtube"
        ]);

        const lowerWords = text.toLowerCase().split(/\s+/);
        if (lowerWords.some((word) => NON_PLACE_WORDS.has(word))) {
            return null;
        }

        return text;
    }

    // Time requests always report Delhi, regardless of city names in speech.
    _executeTimeLookup() {
        const time = new Intl.DateTimeFormat("en-IN", {
            timeZone: "Asia/Kolkata",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hourCycle: "h23"
        }).format(new Date());
        return Promise.resolve({
            handled: true,
            source: "data",
            response: `दिल्ली में अभी ${time} बजे हैं।`
        });
    }

    // Common currency words -> ISO 4217 codes. Frankfurter (the actual
    // conversion API — see src/services/dataSources.js ->
    // currencyConvert()) needs ISO codes, but isDataSourceCommand()'s
    // own trigger regex already accepts words like "dollar"/"rupaye",
    // so the parser below needs to understand them too, not just
    // "USD"/"INR" codes typed directly.
    static CURRENCY_ALIASES = {
        dollar: "USD",
        dollars: "USD",
        usd: "USD",
        rupee: "INR",
        rupees: "INR",
        rupaya: "INR",
        rupaye: "INR",
        inr: "INR",
        euro: "EUR",
        euros: "EUR",
        eur: "EUR",
        pound: "GBP",
        pounds: "GBP",
        gbp: "GBP",
        yen: "JPY",
        jpy: "JPY",
        yuan: "CNY",
        renminbi: "CNY",
        cny: "CNY",
        franc: "CHF",
        francs: "CHF",
        chf: "CHF",
        won: "KRW",
        krw: "KRW",
        dirham: "AED",
        dirhams: "AED",
        aed: "AED"
    };

    // Parses a currency-conversion request into { amount, from, to },
    // or returns null if it can't. Understands both ISO codes ("100
    // USD to INR") and common currency words/plurals ("100 dollars to
    // rupees", "dollars to rupees"). Amount defaults to 1 when only a
    // currency pair is given. Used both for the direct CURRENCY route
    // and as the pending-intent resolver, so both paths stay in sync.
    _parseCurrencyQuery(rawText) {
        const text = String(rawText || "").trim();
        if (!text) return null;

        const codeOrWord = "[a-z]{3,10}";
        const withAmount = text.match(
            new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${codeOrWord})\\s*(?:to|into|mein|me|ke)\\s*(${codeOrWord})`, "i")
        );
        const withoutAmount = text.match(
            new RegExp(`(${codeOrWord})\\s*(?:to|into|mein|me)\\s*(${codeOrWord})`, "i")
        );

        const match = withAmount || withoutAmount;
        if (!match) return null;

        const amount = withAmount ? match[1] : 1;
        const fromRaw = withAmount ? match[2] : match[1];
        const toRaw = withAmount ? match[3] : match[2];

        const from = JARVISChat.CURRENCY_ALIASES[fromRaw.toLowerCase()] || fromRaw.toUpperCase();
        const to = JARVISChat.CURRENCY_ALIASES[toRaw.toLowerCase()] || toRaw.toUpperCase();

        // Reject anything that isn't a recognized 3-letter-ish code
        // after alias resolution — avoids sending garbage like "MEI"
        // (accidentally captured from filler words) to the API.
        if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) {
            return null;
        }

        return { amount, from, to };
    }

    // Shared by the normal CURRENCY route and the pending-intent
    // executor, so both paths return an identical response shape.
    async _executeCurrencyConversion(amount, from, to) {
        const r = await window.jarvis.data.currencyConvert(amount, from, to);
        const d = (r && r.data) || r;

        if (d && d.success) {
            return {
                handled: true,
                source: "data",
                response: `${d.amount} ${d.from} = ${d.converted} ${d.to} (rate: ${d.rate}, as of ${d.date}).`
            };
        }

        return {
            handled: true,
            source: "data",
            response: (d && d.error) || "Currency conversion nahi ho paya."
        };
    }

    // Purchase/price research should be a direct, one-turn browser action.
    // Keep the trigger category + shopping intent based so ordinary topic
    // searches (e.g. "search RAM installation") still use normal web search.
    static PRODUCT_SEARCH_CATEGORIES =
        /\b(ram|memory|ddr[345]|ssd|nvme|hard ?drive|hdd|gpu|graphics ?card|rtx|geforce|radeon|processor|cpu|motherboard|laptops?|phones?|mobile|smartphone|cameras?|headphones?|earphones?|television|\btv\b|watches?|tablets?|monitor|keyboard|mouse|router|printer|chair|desk|fridge|refrigerator|washing machine)\b|रैम|मेमोरी/i;

    static PRODUCT_BUY_INTENT =
        /\b(buy|purchase|price|prices|cheapest|cheaper|lowest|cost|where can i get|where to buy|find (?:me )?(?:the )?(?:lowest|cheapest|best)?)\b|\b(kharid|khareed|chahiye|sabse sasta|sasta|kam keemat|kam daam|price batao|kahan milega|kahan milegi|dhoondh|dhundh)\b|खरीद|चाहिए|चाहिये|सबसे सस्ता|सबसे सस्ती|सबसे कम कीमत|सबसे कम दाम|कहाँ मिलेगा|कहाँ मिलेगी/i;

    static BARE_PRODUCT_LOOKUP =
        /^\s*(?:please\s+)?(?:search|find)\s+(?:for\s+)?(?:a\s+)?(?:good\s+)?(?:laptops?|phones?|cameras?|tablets?)\s*[.!?]?\s*$/i;

    _isProductSearchQuery(text) {
        const value = String(text || "");
        const marketplace = /\b(?:amazon(?:\s*(?:pay|india|in))?|flipkart|myntra|meesho|croma|reliance\s*digital)\b/i.test(value);
        const marketplaceAction = /\b(?:find|search|look\s*up|open|show|give|send|buy|get)\b|ढूँढ|ढूंढ|खोल|दिखा|दे दो|देना/i.test(value);
        return (JARVISChat.PRODUCT_SEARCH_CATEGORIES.test(value) && (JARVISChat.PRODUCT_BUY_INTENT.test(value) || JARVISChat.BARE_PRODUCT_LOOKUP.test(value))) || (marketplace && marketplaceAction);
    }

    // Kicks off a multi-parameter collection chain: category is
    // already known (from the message itself); budget and use-case
    // are collected one at a time over the next two turns, via
    // _continueProductSearch() below (registered as PRODUCT_SEARCH's
    // pending-intent executor).
    _startProductSearch(text) {
        return this._executeProductSearch(text);
    }

    // Called once budget (or use case) resolves. Chains a SECOND
    // pending intent for whichever parameter is still missing, using
    // the exact same setPending()/tryResolve() architecture as the
    // first question — nothing new needed to support multi-parameter
    // collection, `collectedParameters` (built in Phase 1) already
    // carries prior answers forward. Only once both budget AND use
    // case are known does it actually execute the search.
    _continueProductSearch(parameters, rawResult) {
        const originalRequest = (rawResult && rawResult.originalRequest) || null;

        if (parameters.useCase === undefined) {
            if (window.JARVISPendingIntent) {
                window.JARVISPendingIntent.setPending({
                    intent: "PRODUCT_SEARCH",
                    skill: "browser.productSearch",
                    missingParameter: "useCase",
                    collectedParameters: parameters,
                    originalRequest,
                    prompt: "Kis use ke liye chahiye?"
                    // No custom resolver — use case is free text, so the
                    // shared generic default resolver in
                    // PendingIntentManager.js (short reply, not a new
                    // command) is exactly what's needed here. Reusing it
                    // is the point of the generic architecture.
                });
            }

            return {
                handled: true,
                source: "product-search",
                response: "Kis use ke liye chahiye?"
            };
        }

        return this._executeProductSearch(
            parameters.category,
            parameters.budget,
            parameters.useCase
        );
    }

    // Numeric budget resolver — accepts "80000", "80,000", "80k",
    // "1.5 lakh" and similar. Returns null (no match, pending kept)
    // for anything that isn't recognizably a number, which also
    // naturally rejects unrelated new commands ("open youtube" has no
    // digits to match).
    _resolveBudgetReply(rawText) {
        const text = String(rawText || "").trim();
        if (!text) return null;

        const match = text.match(/(\d+(?:[.,]\d+)?)\s*(k|thousand|lakh|lac|l)?/i);
        if (!match) return null;

        let value = parseFloat(match[1].replace(/,/g, ""));
        if (!Number.isFinite(value)) return null;

        const unit = (match[2] || "").toLowerCase();
        if (unit === "k" || unit === "thousand") value *= 1_000;
        if (unit === "lakh" || unit === "lac" || unit === "l") value *= 100_000;

        return Math.round(value);
    }

    // Final step — all three parameters are known. Builds a refined
    // search query and delegates to the EXISTING browser engine
    // (this.processBrowser(), same one ROUTE 2 uses) rather than
    // creating a separate search implementation. Falls back to a
    // plain summary if no browser engine is available (e.g. in tests,
    // or if BrowserBrain failed to initialize) so the user still gets
    // a real answer instead of a dead end.
    async _executeProductSearch(requestText) {
        const raw = String(requestText || "").trim();
        const marketplaceMatch = raw.match(/\b(amazon(?:\s*(?:pay|india|in))?|flipkart|myntra|meesho|croma|reliance\s*digital)\b/i);
        const marketplace = marketplaceMatch ? marketplaceMatch[1].toLowerCase().replace(/\s+/g, "") : "";
        const query = raw
            .replace(/^\s*(?:hey\s+)?jarvis[,:\s-]*/i, "")
            .replace(/\b(?:please|find me|find|search for|search|look for|where can i buy|where to buy|buy|purchase|cheapest|lowest price|lowest|best price|price|open|on|in|from|browser|jarvis|amazon(?:\s*(?:pay|india|in))?|flipkart|myntra|meesho|croma|reliance\s*digital|and give it to me|give it to me|give me|show me|you|do|thanks|hain|hai|it|to|and)\b/gi, " ")
            .replace(/\b(?:mujhe|mere liye|kharidna hai|kharidni hai|khareedna hai|chahiye|sabse sasta|sabse sasti|sabse kam daam|sabse kam keemat|dhoondh do|dhundh do|batao|pe|par|mein|me|kholo|khol do|de do|de dena)\b/gi, " ")
            .replace(/(?:जार्विस|मुझे|मेरे लिए|खरीदना है|खरीदनी है|खरीदना|खरीदनी|चाहिए|चाहिये|सबसे सस्ता|सबसे सस्ती|सबसे कम कीमत|सबसे कम दाम|ढूँढ दो|ढूंढ दो|ढूँढो|ढूंढो|खोल दो|खोलो|पर|पे|में|दे दो|दे देना|मुझे दे|बता दो|बता देना|बता)/g, " ")
            .replace(/[?!,]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        if (!query) return { handled: true, source: "product-search", response: /[\u0900-\u097f]/.test(raw) ? "कौन-सा product ढूँढूँ? उसका नाम बताइए।" : "Which product should I find? Please tell me its name." };
        const encodedQuery = encodeURIComponent(query);
        const marketplaceUrls = {
            amazon: `https://www.amazon.in/s?k=${encodedQuery}`, amazonpay: `https://www.amazon.in/s?k=${encodedQuery}`,
            amazonindia: `https://www.amazon.in/s?k=${encodedQuery}`, amazonin: `https://www.amazon.in/s?k=${encodedQuery}`,
            flipkart: `https://www.flipkart.com/search?q=${encodedQuery}`,
            myntra: `https://www.myntra.com/${encodedQuery.replace(/%20/g, "-")}`,
            meesho: `https://www.meesho.com/search?q=${encodedQuery}`,
            croma: `https://www.croma.com/searchB?q=${encodedQuery}`,
            reliancedigital: `https://www.reliancedigital.in/search?q=${encodedQuery}`
        };
        const shoppingUrl = marketplace ? marketplaceUrls[marketplace] : `https://www.google.com/search?tbm=shop&q=${encodedQuery}`;
        try {
            let tabId = "";
            if (window.BrowserUI?.showPanel && window.BrowserUI?.navigate) {
                await window.BrowserUI.showPanel();
                const navigation = await window.BrowserUI.navigate(shoppingUrl);
                if (navigation?.success === false) throw new Error(navigation.error || "Shopping results could not be opened.");
                const tabs = await window.jarvis?.browser?.getTabs?.();
                tabId = tabs?.activeTabId || "";
            } else if (window.jarvis?.browser?.newTab) {
                const result = await window.jarvis.browser.newTab(shoppingUrl);
                if (result?.success === false) throw new Error(result.error || "Browser could not open the shopping results.");
                tabId = result?.tabId || "";
            } else {
                const result = await this.processBrowser(`open ${shoppingUrl}`, {});
                if (!result?.handled) throw new Error("JARVIS browser is unavailable.");
                const tabs = await window.jarvis?.browser?.getTabs?.();
                tabId = tabs?.activeTabId || "";
            }

            const hindi = /[\u0900-\u097F]/.test(raw);
            const comparison = !marketplace && tabId
                ? await window.jarvis?.browser?.compareShoppingResults?.(tabId)
                : null;
            const offers = comparison?.success && Array.isArray(comparison.offers)
                ? comparison.offers.slice().sort((a, b) => Number(a.price) - Number(b.price))
                : [];
            if (offers.length) {
                const shown = offers.slice(0, 5);
                const money = value => `₹${Number(value).toLocaleString("en-IN")}`;
                const lines = shown.map((offer, index) =>
                    `${index + 1}. ${offer.title} — ${money(offer.price)}${offer.merchant ? ` (${offer.merchant})` : ""}\n   Buy: ${offer.url}`
                );
                return {
                    handled: true,
                    source: "product-search",
                    response: hindi
                        ? `Google Shopping पर मिले offers की कीमत के अनुसार तुलना (जाँच: ${new Date(comparison.checkedAt).toLocaleString("hi-IN")}):\nसबसे कम दिखा: ${lines[0]}\n\nदूसरे offers:\n${lines.slice(1).join("\n")}\n\nखरीदने से पहले shipping, exact specs और seller की पुष्टि करें।`
                        : `Google Shopping offers sorted by listed price (checked ${new Date(comparison.checkedAt).toLocaleString()}):\nLowest found: ${lines[0]}\n\nOther offers:\n${lines.slice(1).join("\n")}\n\nConfirm shipping, exact specifications, and seller before buying.`,
                    data: { query, offers: shown, shoppingUrl },
                    richContent: { type: "productOffers", title: hindi ? "मूल्य तुलना" : "Price comparison", offers: shown }
                };
            }

            return {
                handled: true,
                source: "product-search",
                response: hindi
                    ? `मैंने “${query}” के ${marketplaceMatch ? marketplaceMatch[1] : "Google Shopping"} search results JARVIS Browser में खोल दिए हैं। यह सीधा खरीदारी/search link है; सही variant, seller और कीमत पेज पर जाँच लें।`
                    : `I opened the ${marketplaceMatch ? marketplaceMatch[1] : "Google Shopping"} results for “${query}” in the JARVIS Browser. This is a direct shopping search link; check the exact variant, seller, and price on the page.`,
                data: { query, shoppingUrl, compareError: comparison?.error || null },
                richContent: { type: "shoppingSearch", title: hindi ? "खरीदारी के परिणाम" : "Shopping results", query, marketplace: marketplaceMatch ? marketplaceMatch[1] : "Google Shopping", url: shoppingUrl }
            };
        } catch (error) {
            this.debug("Product search browser delegation failed:", error);
            return {
                handled: true,
                source: "product-search",
                response: `Could not open live shopping results: ${error?.message || "JARVIS Browser is unavailable."}`
            };
        }
    }

    // =====================================================
    // OPEN CONFIRMATION (Phase 6 — Yes/No confirmation wiring)
    //
    // Curated, narrow trigger (same philosophy as
    // PRODUCT_SEARCH_CATEGORIES above): only a specific list of named
    // sites people commonly ask JARVIS to open, so ordinary questions
    // that merely mention a site's name in passing aren't affected.
    // =====================================================
    static OPEN_CONFIRMATION_SITES = {
        youtube: "YouTube",
        yt: "YouTube",
        gmail: "Gmail",
        whatsapp: "WhatsApp",
        telegram: "Telegram",
        instagram: "Instagram",
        facebook: "Facebook",
        twitter: "Twitter",
        linkedin: "LinkedIn",
        reddit: "Reddit",
        discord: "Discord",
        netflix: "Netflix",
        spotify: "Spotify",
        amazon: "Amazon",
        flipkart: "Flipkart",
        wikipedia: "Wikipedia",
        github: "GitHub",
        chatgpt: "ChatGPT",
        gemini: "Gemini"
    };

    // Only fires on a PERMISSION-ASKING phrasing ("should I", "shall
    // I", "kya main", "want me to", ...) about opening one of the
    // curated sites above — a plain direct "open youtube" has none of
    // these phrases and is correctly left for ROUTE 2 (the normal
    // browser route) to handle exactly as before this phase existed.
    // Returns `{ key, label }` for the first matching site, or null.
    _isOpenConfirmationQuery(text) {
        const lower = String(text || "").toLowerCase();

        const asksPermission =
            /\b(should i|shall i|kya main|kya mai|kya mujhe|want me to|do you want me to|should we)\b/.test(
                lower
            );
        if (!asksPermission) {
            return null;
        }

        const mentionsOpening = /\b(open|launch|kholu|khol doon|khol du|khol dun|start)\b/.test(lower);
        if (!mentionsOpening) {
            return null;
        }

        for (const [key, label] of Object.entries(JARVISChat.OPEN_CONFIRMATION_SITES)) {
            if (new RegExp(`\\b${key}\\b`, "i").test(lower)) {
                return { key, label };
            }
        }

        return null;
    }

    // Registers a pending YES/NO confirmation (via
    // ConversationContextManager.setConfirmation(), storage since
    // Phase 1) instead of opening the site immediately, and asks back
    // for a yes/no. The next message is tried against this via
    // ROUTE -1.2 in processBrainRouter() -> _resolveConfirmation().
    _startOpenConfirmation(text, site) {
        const question = `Kya main ${site.label} khol doon?`;

        if (window.JARVISConversationContext) {
            window.JARVISConversationContext.setConfirmation({
                question,
                onYes: () => this._executeOpenSite(site),
                onNo: () => ({
                    handled: true,
                    source: "confirmation",
                    response: "ओके, कोई बात नहीं।"
                }),
                meta: { site: site.key, originalRequest: text }
            });
        }

        return { handled: true, source: "confirmation", response: question };
    }

    // Called once the user confirms with "yes"/"haan"/etc. Delegates
    // to the EXISTING browser engine (this.processBrowser(), the same
    // one ROUTE 2 uses) rather than inventing a separate open path —
    // same pattern _executeProductSearch() above uses to delegate to
    // the real browser.
    async _executeOpenSite(site) {
        try {
            const browserResult = await this.processBrowser(`open ${site.label}`, {});
            if (browserResult && browserResult.handled) {
                return {
                    handled: true,
                    source: "confirmation",
                    response: browserResult.response || `${site.label} khol raha hoon.`
                };
            }
        } catch (error) {
            this.debug("Open-confirmation browser delegation failed:", error);
        }

        return {
            handled: true,
            source: "confirmation",
            response: `${site.label} khol raha hoon (browser abhi available nahi hai).`
        };
    }

    async processDataSourceCommand(message, metadata = {}) {
        const text = this.getCommandText(message) || "";
        const lower = text.toLowerCase();

        if (!window.jarvis || !window.jarvis.data) {
            return { handled: false, source: "data", response: null };
        }

        try {
            // ---- Weather (Open-Meteo) ----
            if (/\b(weather|mausam)\b/i.test(lower)) {
                let place = this._extractDataTopic(text, /\b(weather|mausam)\b/i);

                if (!place && this.config.pendingIntentFirst && window.JARVISPendingIntent) {
                    // PENDING INTENT — ask which city instead of silently
                    // guessing "Delhi" (see JARVIS_MEMORY_IMPLEMENTATION_STATUS.md,
                    // Phase 1). The next message is tried against this via
                    // ROUTE -1 in processBrainRouter(). A dedicated resolver
                    // is supplied (rather than relying on the generic
                    // default) since "looks like a place name" is a
                    // tighter check than "looks like a short reply".
                    window.JARVISPendingIntent.setPending({
                        intent: "WEATHER",
                        skill: "data.weather",
                        missingParameter: "city",
                        originalRequest: text,
                        prompt: "Kis city ya region ka weather bataun?",
                        resolver: this._resolvePlaceNameReply
                    });

                    return {
                        handled: true,
                        source: "data",
                        response: "Kis city ya region ka weather bataun?"
                    };
                }

                // pendingIntentFirst disabled (kill switch) — fall back to
                // the original, pre-Phase-1 behavior exactly.
                if (!place) {
                    place = "Delhi";
                }

                if (/\b(?:tomorrow|kal)\b/i.test(lower)) {
                    if (typeof window.jarvis.data.weatherForecast === 'function') {
                        const forecast = await window.jarvis.data.weatherForecast(place, 1);
                        const fd = (forecast && forecast.data) || forecast;
                        if (fd?.success) {
                            return { handled: true, source: 'data', intent: 'WEATHER', entities: { location: fd.place || place }, response: `${fd.place || place} mein kal ka forecast: ${fd.condition || 'weather conditions'}, temperature ${fd.temperatureMin}${fd.unit || '°C'} se ${fd.temperatureMax}${fd.unit || '°C'}, rain chance ${fd.precipitationProbability ?? 'N/A'}%.` };
                        }
                        return { handled: true, source: 'data', response: fd?.error || `Kal ka weather nahi mila.` };
                    }
                }

                return await this._executeWeatherLookup(place);
            }

            // ---- Currency conversion (Frankfurter) ----
            const currencyQuery = this._parseCurrencyQuery(text);
            const hasCurrencyWord = Object.keys(JARVISChat.CURRENCY_ALIASES || {}).some(alias => new RegExp(`\\b${alias}\\b`, "i").test(lower));
            const explicitCurrencyOperation = /\b(?:exchange\s+rate|currency\s+(?:convert|conversion|exchange)|convert\s+(?:currency|money))\b/i.test(lower)
                || (/\bconvert\b/i.test(lower) && hasCurrencyWord);
            if (currencyQuery || explicitCurrencyOperation) {
                const parsed = currencyQuery;

                if (parsed) {
                    return await this._executeCurrencyConversion(parsed.amount, parsed.from, parsed.to);
                }

                if (this.config.pendingIntentFirst && window.JARVISPendingIntent) {
                    // PENDING INTENT — ask for the missing currency pair
                    // instead of silently dead-ending (pre-Phase-3, an
                    // unparseable request like "convert dollars to
                    // rupees" or bare "exchange rate" fell through with
                    // no response at all). Unlike WEATHER/TIME this
                    // resolves a small composite object (amount/from/to)
                    // in one go rather than a single string value — the
                    // architecture supports that without changes, since
                    // a resolver can return any value type.
                    window.JARVISPendingIntent.setPending({
                        intent: "CURRENCY",
                        skill: "data.currency",
                        missingParameter: "conversionQuery",
                        originalRequest: text,
                        prompt: "Kitni amount, kis currency se kis currency mein convert karna hai? (jaise: 100 USD to INR)",
                        resolver: (rawText) => this._parseCurrencyQuery(rawText)
                    });

                    return {
                        handled: true,
                        source: "data",
                        response: "Kitni amount, kis currency se kis currency mein convert karna hai? (jaise: 100 USD to INR)"
                    };
                }

                // pendingIntentFirst disabled (kill switch) — fall
                // through with no response, exactly like pre-Phase-3
                // behavior (an unparseable request was simply dropped).
            }

            // Time is deliberately Delhi-only: ignore any city named in
            // the request and never ask for a timezone or formatting.
            if (window.JARVISNaturalCommandEngine?.detect?.(text)?.intent === "TIME" ||
                /^(?:please\s+)?(?:time\s+(?:batao|bata\s+do)|(?:samay|waqt)\s+(?:batao|bata\s+do)|time\s+in\b|timezone\b|what(?:'s|\s+is)\s+(?:the\s+)?time\b|current\s+time\b|time\s+now\b|tell\s+me\s+(?:the\s+)?time\b)\s*.*$/i.test(text.trim())) {
                return await this._executeTimeLookup();
            }

            // ---- Country info (REST Countries) ----
            if (/\b(capital of|population of|currency of|country\s+info)\b/i.test(lower)) {
                const country = this._extractDataTopic(text, /\b(capital of|population of|currency of|country\s+info)\b/i);
                const r = await window.jarvis.data.countryInfo(country);
                const d = (r && r.data) || r;
                if (d && d.success) {
                    return {
                        handled: true,
                        source: "data",
                        response: `${d.name}: Capital ${d.capital}, Region ${d.region}, Population ${d.population?.toLocaleString?.() || d.population}, Currency ${d.currencies.join(", ")}, Languages ${d.languages.join(", ")}.`
                    };
                }
                return { handled: true, source: "data", response: (d && d.error) || `"${country}" ke baare mein info nahi mili.` };
            }

            // ---- Location / nearby places (Nominatim) ----
            if (/\b(near me|address of|location of|coordinates\s+of)\b/i.test(lower)) {
                const place = this._extractDataTopic(text, /\b(near me|address of|location of|coordinates\s+of)\b/i);
                const r = await window.jarvis.data.locationSearch(place || text, 1);
                const d = (r && r.data) || r;
                const hit = d && d.results && d.results[0];
                if (hit) {
                    return {
                        handled: true,
                        source: "data",
                        response: `${hit.name} (lat: ${hit.lat}, lon: ${hit.lon}).`
                    };
                }
                return { handled: true, source: "data", response: (d && d.error) || "Location nahi mili." };
            }

            // ---- Books (Open Library) ----
            if (/\b(book|kitab)\b/i.test(lower)) {
                const topic = this._extractDataTopic(text, /\b(book|kitab)\b/i);
                const r = await window.jarvis.data.bookSearch(topic);
                const d = (r && r.data) || r;
                if (d && d.success) {
                    return {
                        handled: true,
                        source: "data",
                        response: `"${d.title}" by ${d.author} (${d.firstPublishYear || "year unknown"}).`
                    };
                }
                return { handled: true, source: "data", response: (d && d.error) || "Koi book nahi mili." };
            }

            // ---- TV shows (TVmaze) ----
            if (/\b(tv\s+show|episode\s+of|serial)\b/i.test(lower)) {
                const topic = this._extractDataTopic(text, /\b(tv\s+show|episode\s+of|serial)\b/i);
                const r = await window.jarvis.data.tvSearch(topic);
                const d = (r && r.data) || r;
                if (d && d.success) {
                    return {
                        handled: true,
                        source: "data",
                        response: `${d.name} (${d.status}, premiered ${d.premiered}, rating ${d.rating ?? "N/A"}): ${d.summary}`
                    };
                }
                return { handled: true, source: "data", response: (d && d.error) || "Koi show nahi mila." };
            }

            // ---- Recipes (TheMealDB) ----
            if (/\brecipe\b|\bkaise\s+banaye\b|\bkhana\s+kaise\s+banta\b/i.test(lower)) {
                const topic = this._extractDataTopic(text, /\brecipe\b|\bkaise\s+banaye\b|\bkhana\s+kaise\s+banta\b/i);
                const r = await window.jarvis.data.recipeSearch(topic);
                const d = (r && r.data) || r;
                if (d && d.success) {
                    return {
                        handled: true,
                        source: "data",
                        response: `${d.name} (${d.area} ${d.category}). Ingredients: ${d.ingredients.slice(0, 8).join(", ")}. ${d.instructions.slice(0, 400)}`
                    };
                }
                return { handled: true, source: "data", response: (d && d.error) || "Koi recipe nahi mili." };
            }

            // ---- Pokémon (PokéAPI) ----
            if (/\bpok[ée]mon\b/i.test(lower)) {
                const topic = this._extractDataTopic(text, /\bpok[ée]mon\b/i);
                const r = await window.jarvis.data.pokemonInfo(topic);
                const d = (r && r.data) || r;
                if (d && d.success) {
                    return {
                        handled: true,
                        source: "data",
                        response: `${d.name} (#${d.id}) — Types: ${d.types.join(", ")}, Height ${d.height}, Weight ${d.weight}, Abilities: ${d.abilities.join(", ")}.`
                    };
                }
                return { handled: true, source: "data", response: (d && d.error) || "Koi Pokémon nahi mila." };
            }

            // ---- News (Google News RSS) ----
            if (/\b(news|khabar|samachar)\b/i.test(lower)) {
                const topic = this._extractDataTopic(text, /\b(news|khabar|samachar)\b/i) || "India";
                const r = await window.jarvis.data.newsSearch(topic, 5);
                const d = (r && r.data) || r;
                if (d && d.success) {
                    const lines = d.items.map(i => `- ${i.title} (${i.source})`).join("\n");
                    return { handled: true, source: "data", response: `"${topic}" par latest news:\n${lines}` };
                }
                return { handled: true, source: "data", response: (d && d.error) || "Koi news nahi mili." };
            }

            // ---- Wikimedia Commons videos ----
            if (/\b(?:video|videos|clip|clips)\b/i.test(lower)) {
                const topic = this._extractDataTopic(
                    text,
                    /\b(?:videos?|clips?)\s+(?:of|for|about)?\s*/i
                ) || this._extractDataTopic(
                    text,
                    /\b(.+?)\s+(?:ke|ki|ka)\s+(?:videos?|clips?)\b/i
                ) || this._extractDataTopic(text, /\b(?:video|videos|clip|clips)\b/i);
                const r = await window.jarvis.data.videoSearch(topic, 4);
                const d = (r && r.data) || r;
                if (d && d.success) {
                    const videos = Array.isArray(d.videos) ? d.videos : [];
                    const lines = videos.map(v => v.title).join("\n");
                    return {
                        handled: true,
                        source: "data",
                        response: `"${topic}" ke liye ${videos.length} videos mil gaye.`,
                        richContent: {
                            type: "videos",
                            title: `${topic} — Videos`,
                            videos: videos.map(v => ({
                                url: v.url,
                                title: v.title,
                                mime: v.mime,
                                description: v.description || ""
                            }))
                        }
                    };
                }
                return { handled: true, source: "data", response: (d && d.error) || "Koi video nahi mila." };
            }

            // ---- Wikimedia Commons images ----
            if (/\bimages?\s+(?:of|for)\b|\bphotos?\s+(?:of|for)\b|\bpictures?\s+(?:of|for)\b/i.test(lower)) {
                const topic = this._extractDataTopic(text, /\bimages?\s+(?:of|for)\b|\bphotos?\s+(?:of|for)\b|\bpictures?\s+(?:of|for)\b/i);
                const r = await window.jarvis.data.imageSearch(topic, 3);
                const d = (r && r.data) || r;
                return {
                    handled: true,
                    source: "data",
                    response: d?.success
                        ? `"${topic}" ke liye ${d.images.length} images mil gayi hain.`
                        : `Image previews load nahi hue. "${topic}" ke results neeche Google Images link se dekhein.`,
                    richContent: {
                        type: "images",
                        title: `${topic} — Images`,
                        searchUrl: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(topic)}`,
                        images: (d?.images || []).map(i => ({ url: i.url, thumbUrl: i.thumbUrl || i.url, title: i.title || topic }))
                    }
                };
            }

            // ---- GitHub ----
            if (/\bgithub\b/i.test(lower)) {
                if (/\buser\b/i.test(lower)) {
                    const username = this._extractDataTopic(text, /\bgithub\b|\buser\b/gi);
                    const r = await window.jarvis.data.githubUser(username);
                    const d = (r && r.data) || r;
                    if (d && d.success) {
                        return {
                            handled: true,
                            source: "data",
                            response: `${d.name || d.login} — ${d.bio || "no bio"}. Repos: ${d.publicRepos}, Followers: ${d.followers}. ${d.profileUrl}`
                        };
                    }
                    return { handled: true, source: "data", response: (d && d.error) || "GitHub user nahi mila." };
                }

                const topic = text
                    .replace(/\b(?:github|git\s+hub|repo(?:s|sitory)?|projects?)\b/gi, " ")
                    .replace(/\b(?:find|search|information|info|details?|about|from|on|in|please|tell\s+me|for|se|par|pe|batao|bata|do|dijiye)\b/gi, " ")
                    .replace(/(?:के\s+बारे\s+में|जानकारी|बताइए|बताओ|से|पर)/gu, " ")
                    .replace(/\s+/g, " ")
                    .trim();
                const r = await window.jarvis.data.githubSearchRepos(topic, 3);
                const d = (r && r.data) || r;
                if (d && d.success) {
                    const lines = d.repos.map(rp => `- ${rp.fullName} ⭐${rp.stars} — ${rp.description || ""}`).join("\n");
                    return { handled: true, source: "data", response: `"${topic}" ke top GitHub repos:\n${lines}` };
                }
                return { handled: true, source: "data", response: (d && d.error) || "Koi GitHub repo nahi mila." };
            }

            // ---- Wikidata (explicit mention only; general facts default to Wikipedia route) ----
            if (/\bwikidata\b/i.test(lower)) {
                const topic = this._extractDataTopic(text, /\bwikidata\b/i);
                const r = await window.jarvis.data.wikidataSearch(topic);
                const d = (r && r.data) || r;
                if (d && d.success) {
                    return {
                        handled: true,
                        source: "data",
                        response: `${d.label}: ${d.description || "no description"}. ${d.url}`
                    };
                }
                return { handled: true, source: "data", response: (d && d.error) || "Wikidata par kuch nahi mila." };
            }

            return { handled: false, source: "data", response: null };

        } catch (error) {
            this.debug("Data source command failed:", error);
            return { handled: false, source: "data", response: null, error };
        }
    }

    // =====================================================
    // TASK COMMAND MATCH
    // Backed by TaskPlanner (renderer/js/brain/agents/taskPlanner.js).
    // Supports English + Hinglish create/list/next phrasing.
    // =====================================================

    getTaskCreateMatch(message) {
        const text = this.getCommandText(message);

        if (!text) {
            return null;
        }

        const pattern =
            /^(?:add task|create task|new task|remind me to|naya task banao|naya task add karo)\s+(.+)$|^(.+?)\s+(?:ka|ke liye)?\s*task (?:banao|add karo)$/i;

        const match = text.match(pattern);

        if (!match) {
            return null;
        }

        const title = (match[1] || match[2] || "").trim();
        return title || null;
    }

    isTaskListCommand(message) {
        const text = this.getCommandText(message);

        if (!text) {
            return false;
        }

        const patterns = [
            /\bmy tasks\b/,
            /\blist (?:my )?tasks\b/,
            /\bshow (?:my )?tasks\b/,
            /\btasks dikhao\b/,
            /\bmere tasks batao\b/
        ];

        return patterns.some(pattern => pattern.test(text));
    }

    isTaskNextCommand(message) {
        const text = this.getCommandText(message);

        if (!text) {
            return false;
        }

        const patterns = [
            /\bwhat'?s next\b/,
            /\bnext task\b/,
            /\bagla task kya hai\b/
        ];

        return patterns.some(pattern => pattern.test(text));
    }

    isTaskCommand(message) {
        return Boolean(this.getTaskCreateMatch(message)) ||
            this.isTaskListCommand(message) ||
            this.isTaskNextCommand(message);
    }

    // =====================================================
    // PROCESS TASK COMMAND
    // =====================================================

    async processTaskCommand(message, metadata = {}) {
        const planner = this.engines.taskPlanner;

        if (!planner || !this.isFunction(planner.run)) {
            return { handled: false, source: "taskPlanner", response: null };
        }

        const createTitle = this.getTaskCreateMatch(message);

        if (createTitle) {
            let result;

            try {
                result = await planner.run({ action: "create", data: { title: createTitle } });
            } catch (error) {
                this.debug("TaskPlanner create failed:", error);
                return { handled: false, source: "taskPlanner", response: null, error };
            }

            if (result && result.success === false) {
                return {
                    handled: true,
                    source: "taskPlanner",
                    response: `Couldn't add that task: ${result.error || "unknown error"}`
                };
            }

            // Best-effort: hand the new task to AgentExecutor so it can
            // pick a specialized agent (selectAgent() keyword-matches the
            // title, e.g. "browser"/"file"/"app") and dispatch it over
            // AgentBus. Never blocks the task-created reply above if
            // AgentExecutor isn't connected or dispatch fails.
            const executor = this.engines.executor;
            const createdTask = result && result.task ? result.task : null;

            if (executor && this.isFunction(executor.run) && createdTask && createdTask.id) {
                try {
                    await executor.run({ action: "execute", data: { id: createdTask.id, title: createdTask.title } });
                } catch (error) {
                    this.debug("AgentExecutor dispatch failed:", error);
                }
            }

            return {
                handled: true,
                source: "taskPlanner",
                response: `Added to your tasks: "${createTitle}"`
            };
        }

        if (this.isTaskListCommand(message)) {
            let tasks = [];

            try {
                tasks = await planner.run({ action: "list" });
            } catch (error) {
                this.debug("TaskPlanner list failed:", error);
                return { handled: false, source: "taskPlanner", response: null, error };
            }

            if (!Array.isArray(tasks) || !tasks.length) {
                return { handled: true, source: "taskPlanner", response: "You don't have any tasks yet." };
            }

            const summary = tasks.slice(0, 10).map(t => `- ${t.title} (${t.status})`).join("\n");
            return { handled: true, source: "taskPlanner", response: `Your tasks:\n${summary}` };
        }

        if (this.isTaskNextCommand(message)) {
            let queue = [];

            try {
                queue = await planner.run({ action: "queue" });
            } catch (error) {
                this.debug("TaskPlanner queue failed:", error);
                return { handled: false, source: "taskPlanner", response: null, error };
            }

            if (!Array.isArray(queue) || !queue.length) {
                return { handled: true, source: "taskPlanner", response: "Nothing queued up next." };
            }

            return { handled: true, source: "taskPlanner", response: `Next up: "${queue[0].title}"` };
        }

        return { handled: false, source: "taskPlanner", response: null };
    }

    // =====================================================
    // GOAL COMMAND MATCH
    // Backed by GoalManager (renderer/js/brain/agents/goalManager.js).
    // Deliberately separate from TaskPlanner: goals are higher-level,
    // longer-running intentions; TaskPlanner.syncGoals() (already
    // present in taskPlanner.js, previously dormant with no GoalManager
    // loaded to sync from) turns active goals into concrete tasks
    // automatically once GoalManager emits a "goal_update" bus event.
    // =====================================================

    getGoalCreateMatch(message) {
        const text = this.getCommandText(message);

        if (!text) {
            return null;
        }

        const pattern =
            /^(?:set a goal to|add goal|create goal|new goal|naya goal banao|naya goal add karo)\s+(.+)$|^(.+?)\s+(?:ka|ke liye)?\s*goal (?:banao|add karo)$/i;

        const match = text.match(pattern);

        if (!match) {
            return null;
        }

        const title = (match[1] || match[2] || "").trim();
        return title || null;
    }

    isGoalListCommand(message) {
        const text = this.getCommandText(message);

        if (!text) {
            return false;
        }

        const patterns = [
            /\bmy goals\b/,
            /\blist (?:my )?goals\b/,
            /\bshow (?:my )?goals\b/,
            /\bgoals dikhao\b/,
            /\bmere goals batao\b/
        ];

        return patterns.some(pattern => pattern.test(text));
    }

    isGoalCommand(message) {
        return Boolean(this.getGoalCreateMatch(message)) || this.isGoalListCommand(message);
    }

    async processGoalCommand(message, metadata = {}) {
        const goalManager = this.engines.goals;

        if (!goalManager || !this.isFunction(goalManager.run)) {
            return { handled: false, source: "goals", response: null };
        }

        const createTitle = this.getGoalCreateMatch(message);

        if (createTitle) {
            let result;

            try {
                result = await goalManager.run({ action: "create", data: { title: createTitle } });
            } catch (error) {
                this.debug("GoalManager create failed:", error);
                return { handled: false, source: "goals", response: null, error };
            }

            if (result && result.success === false) {
                return {
                    handled: true,
                    source: "goals",
                    response: `Couldn't add that goal: ${result.error || "unknown error"}`
                };
            }

            // Best-effort: let GoalManager notify TaskPlanner so
            // syncGoals() can turn this into a concrete task right away,
            // instead of waiting for some other future bus event.
            if (this.isFunction(goalManager.sendToBus)) {
                try {
                    goalManager.sendToBus({ id: result && result.goal ? result.goal.id : null });
                } catch (error) {
                    this.debug("GoalManager.sendToBus failed:", error);
                }
            }

            return {
                handled: true,
                source: "goals",
                response: `Set a new goal: "${createTitle}"`
            };
        }

        if (this.isGoalListCommand(message)) {
            let goals = [];

            try {
                goals = await goalManager.run({ action: "list" });
            } catch (error) {
                this.debug("GoalManager list failed:", error);
                return { handled: false, source: "goals", response: null, error };
            }

            if (!Array.isArray(goals) || !goals.length) {
                return { handled: true, source: "goals", response: "You don't have any goals set yet." };
            }

            const summary = goals.slice(0, 10).map(g => `- ${g.title} (${g.status})`).join("\n");
            return { handled: true, source: "goals", response: `Your goals:\n${summary}` };
        }

        return { handled: false, source: "goals", response: null };
    }

    // =====================================================
    // PERSONALITY RESPONSE STYLE COMMAND
    // Lets the user switch JARVIS's response tone (professional/friendly/
    // witty/concise/formal) via chat/voice. Backed by the main-process
    // ConsciousnessLayer (src/ai/consciousness.js) via window.jarvis.ai,
    // not a renderer "engine" — it's a global preference, not per-agent.
    // =====================================================

    getPersonalityStyleMatch(message) {
        const text = this.getCommandText(message);
        if (!text) return null;

        const aliases = {
            professional: "professional", default: "professional", normal: "professional", neutral: "professional",
            friendly: "friendly", warm: "friendly", casual: "friendly",
            witty: "witty", funny: "witty", playful: "witty", humorous: "witty", humourous: "witty",
            concise: "concise", short: "concise", brief: "concise", crisp: "concise",
            formal: "formal", polite: "formal", respectful: "formal",
            focus: "focus", focused: "focus", attentive: "focus"
        };

        const patterns = [
            /\b(?:switch|set|change|make)\s+(?:your\s+)?personality\s*(?:to|style to)?\s*(\w+)/i,
            /\bpersonality\s+(?:mode\s+|style\s+)?(\w+)/i,
            /\bbe\s+more\s+(\w+)/i,
            /\b(\w+)\s+mode\s+(?:on|karo|kar do|kardo)\b/i,
            /\bpersonality\s+(\w+)\s+(?:kar do|kardo|kar den|karo)\b/i,
            /\bab\s+(?:thoda\s+)?(\w+)\s+ban\s*jao\b/i
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match && match[1] && aliases[match[1].toLowerCase()]) {
                return aliases[match[1].toLowerCase()];
            }
        }

        return null;
    }

    isPersonalityStyleCommand(message) {
        return Boolean(this.getPersonalityStyleMatch(message));
    }

    async processPersonalityStyleCommand(message, metadata = {}) {
        const style = this.getPersonalityStyleMatch(message);

        if (!style) {
            return { handled: false, source: "personalityStyle", response: null };
        }

        if (!window.jarvis || !window.jarvis.ai || !this.isFunction(window.jarvis.ai.setPersonalityStyle)) {
            return { handled: false, source: "personalityStyle", response: null };
        }

        let result;
        try {
            result = await window.jarvis.ai.setPersonalityStyle(style);
        } catch (error) {
            this.debug("setPersonalityStyle failed:", error);
            return { handled: false, source: "personalityStyle", response: null, error };
        }

        if (!result || result.success === false) {
            return {
                handled: true,
                source: "personalityStyle",
                response: `Couldn't change personality style: ${(result && result.error) || "unknown error"}`
            };
        }

        // Sync the previously-unused IdentityManager field (renderer/js/
        // brain/consciousness/identity.js) so it actually reflects the
        // real active style instead of always reading "professional".
        if (window.Identity && window.Identity.state) {
            window.Identity.state.personality = style;
        }

        const labels = { professional: "Professional", friendly: "Friendly", witty: "Witty", concise: "Concise", formal: "Formal", focus: "Focus" };
        if (typeof document !== "undefined" && this.isFunction(document.dispatchEvent)) {
            document.dispatchEvent(new CustomEvent("jarvis:personality-style-changed", { detail: { style } }));
        }

        return {
            handled: true,
            source: "personalityStyle",
            response: `Personality style set to ${labels[style] || style}.`
        };
    }

    // =====================================================
    // SYSTEM / AGENT HEALTH COMMAND
    // Backed by AgentMonitor, which in turn depends on AgentRegistry
    // actually having entries -- see AgentManager.registerKnownAgents()
    // (renderer/js/brain/agents/AgentManager.js), added specifically so
    // this reports real data instead of an always-empty scan.
    // =====================================================

    isAgentHealthCommand(message) {
        const text = this.getCommandText(message);

        if (!text) {
            return false;
        }

        return /\b(agent health|system health|health check)\b/.test(text);
    }

    async processAgentHealthCommand(message, metadata = {}) {
        const monitor = this.engines.monitor;

        if (!monitor || !this.isFunction(monitor.run)) {
            return { handled: false, source: "monitor", response: null };
        }

        let report = [];

        try {
            report = await monitor.run({ action: "scan" });
        } catch (error) {
            this.debug("AgentMonitor scan failed:", error);
            return { handled: false, source: "monitor", response: null, error };
        }

        if (!Array.isArray(report) || !report.length) {
            return {
                handled: true,
                source: "monitor",
                response: "No agents are currently registered to check."
            };
        }

        const online = report.filter(r => r.online).length;

        return {
            handled: true,
            source: "monitor",
            response: `${online}/${report.length} agents online. ` +
                report.map(r => `${r.agent}: ${r.status}`).join(", ")
        };
    }

    // =====================================================
    // VISION STATUS COMMAND
    // VisionAgent is connected and reachable, but no camera/image
    // source is wired to it yet (that needs getUserMedia or Electron
    // desktopCapturer in main.js — separate, larger feature, out of
    // scope for this pass). This only reports the agent's own state
    // honestly, rather than pretending image capture/analysis works.
    // =====================================================

    isVisionStatusCommand(message) {
        const text = this.getCommandText(message);

        if (!text) {
            return false;
        }

        return /\b(camera|vision) status\b/.test(text);
    }

    async processVisionStatusCommand(message, metadata = {}) {
        const vision = this.engines.vision;

        if (!vision || !this.isFunction(vision.run)) {
            return { handled: false, source: "vision", response: null };
        }

        let status;

        try {
            status = await vision.run({ action: "status" });
        } catch (error) {
            this.debug("VisionAgent status failed:", error);
            return { handled: false, source: "vision", response: null, error };
        }

        return {
            handled: true,
            source: "vision",
            response: `Vision agent is ${status && status.status ? status.status : "idle"}. ` +
                `No camera is connected yet, so I can't actually see anything — that needs a separate camera integration.`
        };
    }

    // =====================================================
    // AI FALLBACK REQUIRED?
    // =====================================================

    getCommandRoute(message) {
        try {
            return window.JARVISCommandRoutePolicy?.decide?.(message) || { route: "conversation", confidence: 0, reason: "policy-unavailable" };
        } catch (error) {
            this.debug("Command route policy unavailable:", error);
            return { route: "conversation", confidence: 0, reason: "policy-error" };
        }
    }

    shouldUseAI(message, routeDecision = null) {
        if (!this.config.aiFallback) {
            return false;
        }

        const text = this.normalizeInput(message);

        if (!text) {
            return false;
        }

        const route = routeDecision || this.getCommandRoute(text);
        if (route.route === "local" || route.route === "online") {
            return false;
        }
        if (route.route === "ai") {
            return true;
        }

        const aiPatterns = [
            /\b(ask ai)\b/i,
            /\b(ask artificial intelligence)\b/i,
            /\b(explain)\b/i,
            /\b(why)\b/i,
            /\b(how)\b/i,
            /\b(what is)\b/i,
            /\b(who is)\b/i,
            /\b(tell me about)\b/i
        ];

        if (aiPatterns.some(pattern => pattern.test(text))) {
            return true;
        }

        // Only fall through to AI as a universal catch-all when explicitly
        // allowed. Offline-first architectures should set this to false.
        return Boolean(this.config.universalAIFallback);
    }

    // =====================================================
    // FIND BRAIN METHOD
    // =====================================================

    getBrainMethod(brain) {
        if (!brain) {
            return null;
        }

        const methods = [
            "process",
            "processMessage",
            "handle",
            "handleMessage",
            "execute",
            "run",
            "think",
            "query",
            "ask",
            "respond"
        ];

        for (const method of methods) {
            if (this.isFunction(brain[method])) {
                return method;
            }
        }

        return null;
    }

    // =====================================================
    // EXECUTE BRAIN
    // =====================================================

    async processBrain(message, metadata = {}) {
        const brain = this.engines.brain;

        if (!brain) {
            this.debug("Brain engine unavailable.");
            return { handled: false, source: "brain", response: null };
        }

        const method = this.getBrainMethod(brain);

        if (!method) {
            this.debug("Brain has no compatible processing method.");
            return { handled: false, source: "brain", response: null };
        }

        try {
            const result = await brain[method](message, metadata);
            return this.normalizeEngineResult(result, "brain");
        } catch (error) {
            this.debug("Brain processing failed:", error);
            return { handled: false, source: "brain", response: null, error };
        }
    }

    // =====================================================
    // PROCESS BROWSER
    // =====================================================

    async processBrowser(message, metadata = {}) {
        const browser = this.engines.browser;

        if (!browser) {
            this.debug("Browser engine unavailable.");
            return { handled: false, source: "browser", response: null };
        }

        const methods = [
            "process",
            "processMessage",
            "handle",
            "handleMessage",
            "execute",
            "run",
            "search",
            "browse",
            "open"
        ];

        let method = null;

        for (const candidate of methods) {
            if (this.isFunction(browser[candidate])) {
                method = candidate;
                break;
            }
        }

        if (!method) {
            return { handled: false, source: "browser", response: null };
        }

        try {
            const result = await browser[method](message, metadata);
            return this.normalizeEngineResult(result, "browser");
        } catch (error) {
            this.debug("Browser processing failed:", error);
            return { handled: false, source: "browser", response: null, error };
        }
    }

    // =====================================================
    // PROCESS AGENT
    // =====================================================

    async processAgent(agent, message, metadata = {}, source = "agent") {
        if (!agent) {
            return { handled: false, source, response: null };
        }

        // Generic names first (unchanged), then each agent's actual
        // real method name (verified against the live agent files —
        // these were previously never matched, so reasoning/planning/
        // decision were silently skipped on every message).
        const perSourceMethods = {
            reasoning: ["reason"],
            planning: ["createPlan"],
            decision: ["decide"]
        };

        const methods = [
            "process",
            "processMessage",
            "handle",
            "handleMessage",
            "execute",
            "run",
            "act",
            "respond",
            ...(perSourceMethods[source] || [])
        ];

        let method = null;

        for (const candidate of methods) {
            if (this.isFunction(agent[candidate])) {
                method = candidate;
                break;
            }
        }

        if (!method) {
            return { handled: false, source, response: null };
        }

        try {
            const result = await agent[method](message, metadata);

            // Reasoning, planning and decision agents return internal
            // analysis (thought/plan/decision), not user-facing answers.
            // Treating those fields as a response short-circuits the AI
            // fallback and leaks prompts such as "Understand user intent".
            if (result && typeof result === "object" && result.response === undefined) {
                if (["reasoning", "planning", "decision"].includes(source)) {
                    result.handled = false;
                }
            }

            return this.normalizeEngineResult(result, source);
        } catch (error) {
            this.debug(source + " processing failed:", error);
            return { handled: false, source, response: null, error };
        }
    }

    // =====================================================
    // PROCESS THROUGH AGENTS
    //
    // Two modes (config.agentMode):
    //  - "first-match" (default, original behavior): stop at the
    //    first agent in reasoning → planning → decision → action
    //    order that returns handled=true.
    //  - "pipeline": run every connected agent in order regardless
    //    of earlier results, passing an accumulating "pipelineContext"
    //    object through metadata so later agents can see what earlier
    //    ones produced. The final handled result (if any) wins, and
    //    unhandled intermediate steps are collected in pipelineSteps.
    // =====================================================

    async processAgents(message, metadata = {}) {
        const agentOrder = ["reasoning", "planning", "decision", "action"];

        if (this.config.agentMode !== "pipeline") {

            // ---- first-match mode (original behavior) ----
            for (const key of agentOrder) {

                if (metadata.cancelToken && metadata.cancelToken.cancelled) {
                    break;
                }

                const agent = this.engines[key];

                if (!agent) {
                    continue;
                }

                const result = await this.processAgent(agent, message, metadata, key);

                if (result && result.handled) {
                    return result;
                }
            }

            return { handled: false, source: "agents", response: null };
        }

        // ---- pipeline mode ----
        const pipelineContext = { ...(metadata.pipelineContext || {}) };
        const pipelineSteps = [];
        let lastHandledResult = null;

        for (const key of agentOrder) {

            if (metadata.cancelToken && metadata.cancelToken.cancelled) {
                break;
            }

            const agent = this.engines[key];

            if (!agent) {
                continue;
            }

            const stepMetadata = { ...metadata, pipelineContext };

            const result = await this.processAgent(agent, message, stepMetadata, key);

            pipelineSteps.push(result);

            // Let each agent contribute to shared context for the next one,
            // e.g. a "reasoning" agent's output can inform "planning".
            if (result && result.context && typeof result.context === "object") {
                Object.assign(pipelineContext, result.context);
            }

            if (result && result.handled) {
                lastHandledResult = result;
            }
        }

        if (lastHandledResult) {
            return { ...lastHandledResult, pipelineSteps };
        }

        return { handled: false, source: "agents", response: null, pipelineSteps };
    }

    // =====================================================
    // NORMALIZE ENGINE RESULT
    // =====================================================

    normalizeEngineResult(result, source = "unknown") {
        if (result === null || result === undefined) {
            return { handled: false, source, response: null };
        }

        if (typeof result === "string") {
            const text = result.trim();
            return { handled: Boolean(text), source, response: text };
        }

        if (typeof result === "boolean") {
            return {
                handled: result,
                source,
                response: result ? "Done." : null
            };
        }

        if (typeof result === "object") {
            const response =
                result.response ??
                result.reply ??
                result.message ??
                result.text ??
                result.answer ??
                result.output ??
                null;

            const handled =
                result.handled !== undefined
                    ? Boolean(result.handled)
                    : Boolean(response);

            return { ...result, handled, source, response };
        }

        return { handled: false, source, response: null };
    }

    // =====================================================
    // PROCESS ROUTER
    // =====================================================

    // Diagnostic wrapper — logs how long each router step took so a
    // hung route is visible in DevTools instead of just showing up
    // as "I am still processing your previous request." Purely
    // observational: it does not change timeouts or behavior.
    async _timedRoute(name, requestID, fn) {
        const startedAt = Date.now();
        const task = String(this.runtime?.lastRequest?.message || "").trim().slice(0, 140);
        const activity = this._activityForRoute(name);
        this._publishActivity({ requestID, phase: "working", state: activity.state, task, tool: activity.tool, operation: activity.operation });
        if (window.JARVISDiagnostics) window.JARVISDiagnostics.record("ROUTE", `⏳ ${name} start`, { requestID });

        try {
            const result = await fn();
            const elapsedMs = Date.now() - startedAt;
            if (window.JARVISDiagnostics) window.JARVISDiagnostics.record("ROUTE", `✅ ${name} done`, { requestID, elapsedMs, handled: !!(result && result.handled), source: result && result.source });
            if (result?.handled) this._publishActivity({ requestID, phase: "completed", state: "success", task, tool: activity.tool, operation: activity.operation });
            return result;
        } catch (error) {
            const elapsedMs = Date.now() - startedAt;
            if (window.JARVISDiagnostics) window.JARVISDiagnostics.record("ERROR", `❌ ${name} failed`, { requestID, elapsedMs, error: String(error && error.message || error) });
            this._publishActivity({ requestID, phase: "failed", state: "error", task, tool: activity.tool, operation: activity.operation });
            throw error;
        }
    }

    _activityForRoute(routeName) {
        const route = String(routeName || "").toLowerCase();
        if (/browser|wikipedia|product-search|site-search|search|image/.test(route)) return { state: "searching", tool: "Browser & Search", operation: "Searching the web" };
        if (/file-context|file/.test(route)) return { state: "reading", tool: "File Context", operation: "Reading file context" };
        if (/memory/.test(route)) return { state: "understanding", tool: "Memory", operation: "Checking saved context" };
        if (/tasks|goals|natural-intent|system|offline/.test(route)) return { state: "executing", tool: "JARVIS Tools", operation: "Executing a command" };
        if (/planning|confirmation-start/.test(route)) return { state: "planning", tool: "JARVIS Router", operation: "Preparing the next step" };
        return { state: "thinking", tool: "JARVIS Intelligence", operation: "Processing the request" };
    }

    _publishActivity(detail) {
        try {
            if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
                window.dispatchEvent(new CustomEvent("jarvis:activity", { detail: { timestamp: Date.now(), ...detail } }));
            }
        } catch (error) {
            this.debug("Activity HUD update skipped:", error);
        }
    }

    async processBrainRouter(message, metadata = {}) {
        const input = this.validateInput(message);

        if (!input.valid) {
            return {
                handled: false,
                source: "router",
                response: null,
                reason: input.reason
            };
        }

        let text = input.text;

        const requestID = metadata.requestID || this.createRequestID();

        const routeMetadata = {
            ...metadata,
            requestID,
            sessionID: this.sessionID,
            timestamp: Date.now()
        };
        routeMetadata.routeDecision = this.getCommandRoute(text);

        this.debug("Routing message:", text);
        console.log(`[BRAIN] Processing "${text}"`);
        if (window.JARVISDiagnostics) window.JARVISDiagnostics.record("ROUTE", "🧩 ROUTER INPUT", { requestID, text });

        // Use one fresh shared frame with an installed local vision model.
        // The captured frame is sent only to the user's local Ollama server.
        const appTask = window.JARVISNaturalCommandEngine?.detect?.(text);
        // Deterministic local commands must win before browser search, screen
        // questions, or the general AI route. This is especially important in
        // Autopilot, where “Open Notepad” must launch the Windows app even if
        // the app name contains a site-like word (for example Chrome).
        const localPriorityIntents = new Set([
            "OPEN_APP", "APP_TASK_FLOW", "CREATE_PRESENTATION", "CREATE_PDF", "CREATE_IMAGE",
            "CREATE_SPREADSHEET", "CREATE_OFFICE_FILE", "OPEN_ALARM",
            "CREATE_FOLDER", "FILE_OPERATIONS", "WINDOW_CONTROL",
            "MINECRAFT_WORLD_FLOW", "MINECRAFT_LAUNCH_FLOW", "COMPUTER_USE"
        ]);
        if (appTask?.intent && localPriorityIntents.has(appTask.intent)) {
            return window.JARVISNaturalCommandEngine.execute(appTask);
        }
        if (window.JARVISScreenShare?.shouldAnalyzeQuestion?.(text)) {
            const vision = await window.JARVISScreenShare.analyze(text);
            return { handled: true, source: "screen-vision", response: vision.success ? vision.text : vision.error };
        }

        // NOTE: ROUTE -0.5 (reference resolution) runs further below,
        // after ROUTE -1, and may reassign `text`/populate
        // `resolvedReference` — routeMetadata is built above that
        // point deliberately, since metadata should reflect the
        // request as received, not the internally-rewritten text.

        // ROUTE -1.2 — YES/NO CONFIRMATION RESOLUTION
        // If JARVIS just asked a yes/no confirmation question ("Kya
        // main YouTube khol doon?"), try this new message as an
        // affirmative/negative/cancel answer BEFORE anything else
        // runs — including ROUTE -1's pending-intent resolution just
        // below, since a bare "yes"/"haan" answering a confirmation
        // should never be mistaken for the answer to an unrelated
        // pending parameter question. A reply that doesn't look like
        // yes/no/cancel leaves the confirmation in place (same
        // "no-match, fall through" philosophy as PendingIntentManager
        // below) so a genuinely new command still works. See
        // ConversationContextManager.setConfirmation()/
        // getConfirmation() and JARVIS_MEMORY_IMPLEMENTATION_STATUS.md,
        // Phase 6.
        if (
            this.config.confirmationFirst &&
            window.JARVISConversationContext &&
            window.JARVISConversationContext.hasConfirmation()
        ) {
            const confirmationResult = await this._timedRoute("confirmation", requestID, () =>
                this._resolveConfirmation(text, routeMetadata)
            );
            if (confirmationResult && confirmationResult.handled) {
                return confirmationResult;
            }
        }

        // ROUTE -1 — PENDING INTENT RESOLUTION
        // If JARVIS just asked a follow-up question ("Kis city ka
        // weather?"), try this new message as the answer BEFORE any
        // other route runs. If it doesn't look like an answer, the
        // pending intent is left in place and this message falls
        // through to normal routing below (so a genuinely new command
        // still works while JARVIS is "waiting").
        // See renderer/js/context/PendingIntentManager.js.
        if (
            this.config.pendingIntentFirst &&
            window.JARVISPendingIntent &&
            window.JARVISPendingIntent.hasPending()
        ) {
            const pendingResult = await this._timedRoute("pending-intent", requestID, () =>
                this._resolvePendingIntent(text, routeMetadata)
            );
            if (pendingResult && pendingResult.handled) {
                return pendingResult;
            }
        }

        // The renderer text composer handles this fast path before calling
        // ChatEngine. Recheck here for voice and direct-API turns so lessons
        // and correction follow-ups work consistently across input modes.
        try {
            const learning = await window.MistakeLearningControl?.handle?.(text);
            if (learning?.handled) {
                return { handled: true, source: learning.fromLesson ? "user-correction-memory" : "user-correction", response: learning.reply };
            }
        } catch (error) {
            this.debug("Correction memory unavailable; continuing normally:", error);
        }

        // Common greetings should never fall through to the generic
        // unknown-topic response, even when no local language model exists.
        if (/^(?:hello|hi|hey|good\s+morning|good\s+afternoon|good\s+evening|namaste|namaskar|नमस्ते|नमस्कार)(?:\s+jarvis)?[!., ]*$/iu.test(text.trim())) {
            return {
                handled: true,
                source: "local-greeting",
                response: /^(?:नमस्ते|नमस्कार)/u.test(text.trim())
                    ? "नमस्ते! मैं यहाँ हूँ। आज मैं आपकी किस तरह मदद करूँ?"
                    : "Hello! I'm here and ready to help. What would you like to do?"
            };
        }

        // ROUTE -0.5 — REFERENCE RESOLUTION / TOPIC CONTINUITY
        // If JARVIS has an active topic ("Tell me about NASA" ->
        // topic = NASA) and this message is a short follow-up using a
        // pronoun/deictic word ("it", "that", "iske", ...), substitute
        // the reference word with the topic subject BEFORE any other
        // route runs, so "When was it founded?" is routed exactly as
        // if the user had typed "When was NASA founded?". No match ->
        // `text` is left completely untouched and normal routing
        // proceeds exactly as before this phase existed. See
        // renderer/js/context/ReferenceResolver.js.
        let resolvedReference = null;
        if (this.config.referenceResolutionFirst && window.JARVISReferenceResolver) {
            try {
                const referenceResult = window.JARVISReferenceResolver.resolve(text);
                if (referenceResult && referenceResult.resolved) {
                    this.debug(
                        `CONTEXT RESOLVED: "${text}" -> "${referenceResult.text}" (topic: ${referenceResult.subject})`
                    );
                    resolvedReference = referenceResult;
                    text = referenceResult.text;
                }
            } catch (referenceError) {
                this.debug("Reference resolution failed:", referenceError);
            }
        }

        // ROUTE -0.25 — EXPLICIT MEMORY PRIORITY
        // Memory commands must beat NLU entities (e.g. "remember that I like
        // dark futuristic interfaces" must not become the TV show "Dark").
        if (this.config.memoryFirst && this.isMemoryCommand(text)) {
            const result = await this._timedRoute("memory", requestID, () => this.processMemoryCommand(text, routeMetadata));
            if (result && result.handled) {
                return result;
            }
        }

        // ROUTE -0.2 — CONTEXTUAL FOLLOW-UP REWRITE
        // Handles natural follow-ups that are not literal pronoun references:
        // "Aur kal?", "Aur temperature?", and "Wahan ka weather?". The
        // rewrite is intentionally limited to an active WEATHER/TIME topic.
        const contextualFollowup = this._resolveContextualFollowup(text);
        if (contextualFollowup?.resolved) {
            this.debug(`CONTEXT FOLLOW-UP: "${text}" -> "${contextualFollowup.text}"`);
            text = contextualFollowup.text;
        }

        // ROUTE 0 — LOCAL FILE CONTEXT
        // If the user attached a readable file, common questions about that
        // file are answered locally before external data/browser routes.
        if (window.JARVISFileContext && window.JARVISFileContext.canHandle(text)) {
            const fileResult = await this._timedRoute("file-context", requestID, () =>
                window.JARVISFileContext.answer(text)
            );
            if (fileResult && fileResult.handled) {
                return fileResult;
            }
        }

        // ROUTE 0.5 — UNIVERSAL LANGUAGE INTELLIGENCE
        // Pre-processes the text through the multilingual layer:
        // language detection, roman Hindi normalization, context
        // resolution, and semantic intent analysis. If the Language
        // Core recognizes the intent with high confidence, it can
        // pass enriched text + metadata to the NaturalCommandEngine.
        if (window.JARVISLanguageCore) {
            try {
                const langResult = window.JARVISLanguageCore.analyze(text, {
                    conversationContext: window.JARVISConversationContext || null,
                });
                if (langResult) {
                    this.debug(`LANGUAGE: ${langResult.mode} | INTENT: ${langResult.intent} | CONF: ${langResult.confidence}`);
                    if (window.JARVISDiagnostics) {
                        window.JARVISDiagnostics.record("LANG", `Language: ${langResult.mode}`, {
                            input: langResult.originalText,
                            normalized: langResult.normalizedText,
                            intent: langResult.intent,
                            confidence: langResult.confidence,
                            entities: langResult.entities,
                            responseLanguage: langResult.responseLanguage,
                        });
                    }
                    // Use the context-resolved text for downstream routes
                    if (langResult.contextResolved && langResult.normalizedText) {
                        text = langResult.normalizedText;
                        this.debug(`CONTEXT RESOLVED → "${text}"`);
                    }
                    // Store the analysis for response-language matching later
                    routeMetadata.languageAnalysis = langResult;
                    routeMetadata.responseLanguage = routeMetadata.responseLanguage || langResult.responseLanguage;
                }
            } catch (langError) {
                this.debug("Language intelligence error:", langError);
            }
        }

        // ROUTE 1 — NATURAL INTENT + ENTITY ENGINE
        // Handles natural English/Hindi/Hinglish and short/paraphrased
        // commands before legacy regex routes, while preserving every
        // existing router as a fallback.
        if (window.JARVISNaturalCommandEngine) {
            const naturalResult = await this._timedRoute("natural-intent", requestID, () =>
                this._processNaturalIntent(text, routeMetadata)
            );
            if (naturalResult && naturalResult.handled) {
                this._maybeSetTopicFromNaturalResult(naturalResult);
                return naturalResult;
            }
        }

        // FAST CONSCIOUSNESS PATH
        // Questions about JARVIS awareness/presence must never wait for
        // the Brain/agent pipeline. This also prevents a slow/stuck brain
        // request from blocking simple consciousness replies.
        if (this.isConsciousnessPriorityMessage(text)) {
            const result = await this._timedRoute("consciousness-priority", requestID, () =>
                this.processConsciousness(text, routeMetadata)
            );
            if (result && result.handled) {
                return result;
            }
        }

        // ROUTE 1.1 — CHIT-CHAT UNDERSTANDING
        // Ordinary casual conversation (greetings, farewells, thanks,
        // "how are you", jokes, small talk, agreement/mood check-ins,
        // etc.) in English/Hindi/Hinglish. Runs after real commands
        // (natural-intent) and the consciousness fast-path, but before
        // memory/knowledge/offline/brain routes, so banter gets a
        // natural reply instead of falling all the way through to the
        // generic "I understood your message: ..." echo.
        if (this.config.chitChatLocalFirst && window.JARVISChitChat) {
            const chitchatResult = await this._timedRoute("chitchat", requestID, () =>
                window.JARVISChitChat.process(text)
            );
            if (chitchatResult && chitchatResult.handled) {
                return chitchatResult;
            }
        }

        // ---------------------------------------------------------
        // ROUTE TIMING WATCHDOG
        // Every route below is wrapped with _timedRoute() so the
        // console shows exactly how long each step took, e.g.:
        //   [ROUTE mem] 2ms
        //   [ROUTE brain] 28110ms  <-- this is the one that's stuck
        // Open DevTools (Ctrl+Shift+I) and reproduce the "still
        // processing" issue — the last route that prints a huge
        // number (or never prints "done") is the one hanging.
        // ---------------------------------------------------------

        // ROUTE 1.5 — KNOWLEDGE (KnowledgeAgent-backed "what do you know about X")
        if (this.isKnowledgeCommand(text)) {
            const result = await this._timedRoute("knowledge", requestID, () => this.processKnowledgeCommand(text, routeMetadata));
            if (result && result.handled) {
                return result;
            }
        }

        // ROUTE 1.6 — TASKS (TaskPlanner-backed add/list/next-up)
        if (this.isTaskCommand(text)) {
            const result = await this._timedRoute("tasks", requestID, () => this.processTaskCommand(text, routeMetadata));
            if (result && result.handled) {
                return result;
            }
        }

        // ROUTE 1.65 — GOALS (GoalManager-backed set/list)
        if (this.isGoalCommand(text)) {
            const result = await this._timedRoute("goals", requestID, () => this.processGoalCommand(text, routeMetadata));
            if (result && result.handled) {
                return result;
            }
        }

        // ROUTE 1.68 — PERSONALITY STYLE (switch JARVIS's response tone)
        if (this.isPersonalityStyleCommand(text)) {
            const result = await this._timedRoute("personalityStyle", requestID, () => this.processPersonalityStyleCommand(text, routeMetadata));
            if (result && result.handled) {
                return result;
            }
        }

        // ROUTE 1.66 — AGENT/SYSTEM HEALTH (AgentMonitor-backed)
        if (this.isAgentHealthCommand(text)) {
            const result = await this._timedRoute("agentHealth", requestID, () => this.processAgentHealthCommand(text, routeMetadata));
            if (result && result.handled) {
                return result;
            }
        }

        // ROUTE 1.7 — VISION STATUS (honest agent-state report only)
        if (this.isVisionStatusCommand(text)) {
            const result = await this._timedRoute("visionStatus", requestID, () => this.processVisionStatusCommand(text, routeMetadata));
            if (result && result.handled) {
                return result;
            }
        }

        // ROUTE 1.75 — WIKIPEDIA ("is mahine/saal/aaj kya hua",
        // "on this day", "wikipedia pe X batao"). Runs before the
        // browser/offline/AI routes so these questions are always
        // answered from live Wikipedia data first.
        if (this.isWikipediaCommand(text)) {
            const result = await this._timedRoute("wikipedia", requestID, () => this.processWikipediaCommand(text, routeMetadata));
            if (result && result.handled) {
                return result;
            }
        }

        // ROUTE 1.76 — EXTERNAL DATA SOURCES (weather, country info,
        // location, books, TV shows, recipes, Pokémon, news, currency,
        // time/timezone, Wikimedia images, GitHub, Wikidata). Free/
        // key-less public APIs — see src/services/dataSources.js.
        if (this.isDataSourceCommand(text)) {
            const result = await this._timedRoute("data", requestID, () => this.processDataSourceCommand(text, routeMetadata));
            if (result && result.handled) {
                return result;
            }
        }

        // ROUTE 1.85 — direct product price research in the embedded browser.
        if (this._isProductSearchQuery(text)) {
            const result = await this._timedRoute("product-search", requestID, () =>
                this._startProductSearch(text)
            );
            if (result && result.handled) {
                return result;
            }
        }

        // ROUTE 1.95 — OPEN CONFIRMATION (Yes/No gate before opening a site)
        // A permission-asking question ("Should I open YouTube?" /
        // "Kya main YouTube khol doon?") about a known site is treated
        // as asking for permission, NOT as a command to open it
        // immediately — without this, ROUTE 2 below would have opened
        // YouTube right away just because the word "youtube" appears
        // in the sentence (see JARVIS_MEMORY_IMPLEMENTATION_STATUS.md,
        // Phase 6). Narrow, curated trigger (OPEN_CONFIRMATION_SITES +
        // a curated "asking permission" phrase list), matching the
        // same curated-trigger philosophy as WEATHER/PRODUCT_SEARCH —
        // an ordinary direct "open youtube" (no permission-asking
        // phrasing) still goes straight to ROUTE 2, completely
        // unaffected.
        if (this.config.confirmationFirst) {
            const openSite = this._isOpenConfirmationQuery(text);
            if (openSite) {
                const result = await this._timedRoute("confirmation-start", requestID, () =>
                    this._startOpenConfirmation(text, openSite)
                );
                if (result && result.handled) {
                    return result;
                }
            }
        }

        // ROUTE 2 — BROWSER
        if (this.config.browserFirst && this.getCommandRoute(text).route !== "local" && this.isBrowserCommand(text)) {
            const result = await this._timedRoute("browser", requestID, () => this.processBrowser(text, routeMetadata));
            if (result && result.handled) {
                return result;
            }
        }

        if (routeMetadata.cancelToken && routeMetadata.cancelToken.cancelled) {
            return { handled: false, source: "cancelled", response: null, requestID };
        }

        // ROUTE 3 — OFFLINE / LOCAL COMMANDS (time, date, system status, etc.)
        if (this.config.offlineFirst && this.isOfflineCommand(text)) {
            const result = await this._timedRoute("offline", requestID, () => this.processOfflineCommand(text, routeMetadata));
            if (result && result.handled) {
                return result;
            }
        }

        if (routeMetadata.cancelToken && routeMetadata.cancelToken.cancelled) {
            return { handled: false, source: "cancelled", response: null, requestID };
        }

        // ROUTE 4 — OFFLINE BRAIN
        if (this.config.brainFirst) {
            const result = await this._timedRoute("brain", requestID, () => this.processBrain(text, routeMetadata));
            if (result && result.handled) {
                return result;
            }
        }

        if (routeMetadata.cancelToken && routeMetadata.cancelToken.cancelled) {
            return { handled: false, source: "cancelled", response: null, requestID };
        }

        // ROUTE 5 — SPECIALIZED AGENTS
        const agentResult = await this._timedRoute("agents", requestID, () => this.processAgents(text, routeMetadata));
        if (agentResult && agentResult.handled) {
            return agentResult;
        }

        if (routeMetadata.cancelToken && routeMetadata.cancelToken.cancelled) {
            return { handled: false, source: "cancelled", response: null, requestID };
        }

        // ROUTE 5.5 — LOCAL ROUTE FIREWALL
        // A recognized local intent is fail-closed.  If the local executor
        // could not handle it, never hand it to AI as a conversational
        // question; that can make an action look like it completed.
        const routeDecision = this.getCommandRoute(text);
        routeMetadata.routeDecision = routeDecision;
        if (routeDecision.route === "local") {
            return {
                handled: true,
                source: "local-route-firewall",
                response: "I recognized this as a local computer command, but the local action did not run. I will not send it to AI."
            };
        }

        // ROUTE 6 — AI FALLBACK
        if (this.shouldUseAI(text, routeDecision)) {
            const aiResult = await this._timedRoute("ai", requestID, () => this.processAI(text, routeMetadata));
            if (aiResult && aiResult.handled) {
                return aiResult;
            }
        }

        // ROUTE 6.5 — REALTIME THINK (v2.2 SMART BRAIN)
        // Nothing above matched — instead of a canned "could not produce
        // a response", THINK about the message and compose a dynamic,
        // human-like reply. Question decomposition, mood detection,
        // memory, varied phrasing — every response is composed fresh.
        if (window.JARVISRealtimeThink) {
            const thinkResult = await this._timedRoute("realtime-think", requestID, () => {
                const analysis = window.JARVISRealtimeThink.think(text, {
                    // Legacy conversationContext.js API (renamed global — see
                    // the collision fix in that file). Kept so the old engine's
                    // follow-up resolution keeps working where available.
                    lastCommand: window.JARVISLegacyConversationContext?.getLastCommand?.() || null,
                    recentTurns: window.JARVISLegacyConversationContext?.getRecent?.(5) || []
                });
                if (analysis && analysis.handled && analysis.response) {
                    // Simulate real thinking delay (200-700ms) — the typing
                    // indicator is already showing at this point, so the
                    // pause FEELS like actual thought, not an instant canned reply.
                    return new Promise((resolve) => {
                        setTimeout(() => resolve({
                            handled: true,
                            source: "realtime-think",
                            response: analysis.response,
                            text: analysis.response,
                            thinkingMs: analysis.thinkingMs,
                            analysis: analysis.analysis,
                            requestID
                        }), analysis.thinkingMs || 300);
                    });
                }
                return { handled: false, source: "realtime-think", response: null };
            });
            if (thinkResult && thinkResult.handled) {
                return thinkResult;
            }
        }

  // =====================================================
        // ROUTE 7 — AUTHORITATIVE LOCAL CONSCIOUSNESS
        // Final local response path. The response comes from the same
        // main-process state rendered by the consciousness HUD.
        const consciousnessResult = await this.processConsciousness(text, {
            ...routeMetadata,
            requestID
        });

        if (consciousnessResult?.handled) {
            return consciousnessResult;
        }

        return {
            handled: false,
            source: "router",
            response: "JARVIS could not produce a local response.",
            requestID
        };
    }

    // =====================================================
    // CONSCIOUSNESS PRIORITY DETECTOR
    // =====================================================
    isConsciousnessPriorityMessage(message) {
        const text = String(message || "").trim();
        if (!text) return false;
        return /\b(are you conscious|are you self[- ]aware|are you sentient|do you have consciousness|do you have awareness|do you know (?:that )?i(?:'m| am) talking to you|do you know (?:that )?we(?:'re| are) talking|are you there|can you hear me|are you listening|who are you|what is your (?:current )?(?:state|mood)|what are you doing right now|what do you remember|what do you know about me)\b/i.test(text)
            || /चेतना|जागरूक|होश|तुम कौन हो|आप कौन हो|क्या तुम सुन रहे|क्या आप सुन रहे|क्या तुम्हें पता है कि मैं तुमसे बात कर रहा|क्या आपको पता है कि मैं आपसे बात कर रहा|अभी तुम्हारी स्थिति|अभी आपकी स्थिति|क्या याद है/.test(text);
    }

    // =====================================================
    // CONSCIOUSNESS PROCESSOR
    // =====================================================
    async processConsciousness(message, metadata = {}) {
        const text = String(message || "").trim();
        if (!text) return { handled: false, source: "consciousness", response: null };

        try {
            if (metadata.cancelToken?.cancelled) {
                return { handled: false, source: "cancelled", response: null };
            }

            const api = typeof window !== "undefined" ? window.jarvis?.ai : null;

            if (api && typeof api.consciousnessRespond === "function") {
                const result = await api.consciousnessRespond(text);
                if (result?.success && result.response) {
                    return {
                        handled: true,
                        source: "consciousness",
                        response: String(result.response),
                        text: String(result.response),
                        consciousness: result.consciousness,
                        consciousnessRecorded: true,
                        requestID: metadata.requestID
                    };
                }
            }

            // Renderer fallback for degraded/offline IPC.
            const stateResult = api && typeof api.consciousnessState === "function"
                ? await api.consciousnessState()
                : null;
            const state = stateResult?.data?.consciousness || stateResult?.consciousness ||
                window.JARVISConsciousnessLocal?.getPublicState?.();

            if (state) {
                return {
                    handled: true,
                    source: "consciousness-fallback",
                    response: this.generateConsciousnessAwareFallback(text, state),
                    requestID: metadata.requestID
                };
            }
        } catch (error) {
            this.debug("Consciousness response failed:", error);
        }

        return { handled: false, source: "consciousness", response: null, requestID: metadata.requestID };
    }

    // =====================================================
    // AI PROCESSOR
    // =====================================================

    async processAI(message, metadata = {}) {
        try {
            // DETERMINISTIC BRAIN (ZERO AI / ZERO LLM) — main-process
            // knowledge composer: offline learned knowledge + language
            // templates. See src/ai/deterministicBrain.js.
            if (
                typeof window !== "undefined" &&
                window.jarvis &&
                this.isFunction(window.jarvis.askBrain)
            ) {
                const result = await window.jarvis.askBrain(metadata.spokenText || message, metadata);
                return this.normalizeEngineResult(result, "brain");
            }

            this.debug("Deterministic brain bridge unavailable.");

            // Generate consciousness-aware fallback response
            let consciousnessAwareResponse = "No compatible AI engine found.";
            try {
                if (typeof window !== "undefined" && window.jarvis && window.jarvis.ai && window.jarvis.ai.consciousnessState) {
                    const consciousnessResult = await window.jarvis.ai.consciousnessState();
                    if (consciousnessResult && consciousnessResult.success && consciousnessResult.data) {
                        const state = consciousnessResult?.data?.consciousness || consciousnessResult?.consciousness;
                        consciousnessAwareResponse = this.generateConsciousnessAwareFallback(message, state);
                        
                        // Record this interaction in consciousness layer for continuity
                        if (window.jarvis.ai.recordTurn) {
                            await window.jarvis.ai.recordTurn(message, consciousnessAwareResponse);
                        }
                    }
                }
            } catch (error) {
                console.error("Failed to get consciousness state for AI fallback:", error);
            }

            return { handled: false, source: "ai", response: consciousnessAwareResponse };
        } catch (error) {
            console.error("❌ AI Processing Error:", error);
            return { handled: false, source: "ai", response: null, error };
        }
    }

    // =====================================================
    // CONSCIOUSNESS-AWARE FALLBACK RESPONSE GENERATION
    // =====================================================

    generateConsciousnessAwareFallback(message, consciousnessState) {
        const { mood, trustLevel, userRelationship, activeGoal, lastLanguage, continuity } = consciousnessState;
        
        // Language-specific responses
        const responses = {
            en: {
                calm: {
                    base: "I received your message, but no JARVIS engine is currently available to answer it.",
                    warm: "I appreciate your message, but I don't have an active AI engine to respond properly right now.",
                    goal: "I understand your request, but I don't have an active AI engine to work on your goal right now."
                },
                warm: {
                    base: "Thank you for your message! Unfortunately, I don't have an active AI engine to provide a proper response at the moment.",
                    warm: "I really appreciate you reaching out! I'm currently without an active AI engine to respond as I'd like.",
                    goal: "I'd love to help with your goal, but I don't have an active AI engine available right now."
                },
                focused: {
                    base: "I understand your message, but no JARVIS engine is currently available to address this.",
                    warm: "I recognize the importance of your request, but I don't have an active AI engine to handle it right now.",
                    goal: "I see this is important for your goal, but I don't have an active AI engine to proceed."
                },
                curious: {
                    base: "I'm curious about your message, but I don't have an active AI engine to explore it properly.",
                    warm: "That's an interesting question! Unfortunately, I don't have an active AI engine to investigate it right now.",
                    goal: "I'm interested in helping with your goal, but I don't have an active AI engine to research it."
                },
                playful: {
                    base: "I got your message, but no JARVIS engine is currently available to play along.",
                    warm: "Fun message! I wish I had an active AI engine to respond in kind right now.",
                    goal: "I'd be happy to help with your goal, but I don't have an active AI engine available."
                },
                concerned: {
                    base: "I understand your concern, but I don't have an active AI engine to help properly.",
                    warm: "I recognize this is important to you, but I don't have an active AI engine to provide the assistance you need.",
                    goal: "I understand this relates to your goal, but I don't have an active AI engine to help with it."
                }
            },
            hi: {
                calm: {
                    base: "मैंने आपका संदेश प्राप्त किया, लेकिन अभी कोई JARVIS इंजन उपलब्ध नहीं है।",
                    warm: "आपके संदेश के लिए धन्यवाद, लेकिन अभी अभी समय उत्तर देने के लिए कोई AI इंजन उपलब्ध नहीं है।",
                    goal: "मैं आपके लक्ष्य को समझता हूँ, लेकिन अभी इस पर काम करने के लिए कोई AI इंजन उपलब्ध नहीं है।"
                },
                warm: {
                    base: "आपके संदेश के लिए धन्यवाद! दुर्भाग से, मैं अभी ठीक से उत्तर देने के लिए कोई AI इंजन उपलब्ध नहीं है।",
                    warm: "मैं आपके संदेश की सराहना करता हूँ! लेकिन अभी अभी समय उत्तर देने के लिए कोई AI इंजन उपलब्ध नहीं है।",
                    goal: "मैं आपके लक्ष्य में मदद करना चाहूँगा, लेकिन अभी इसके लिए कोई AI इंजन उपलब्ध नहीं है।"
                },
                focused: {
                    base: "मैं आपके संदेश को समझता हूँ, लेकिन इसे संबोधित करने के लिए कोई JARVIS इंजन उपलब्ध नहीं है।",
                    warm: "मैं समझता हूँ कि यह महत्वपूर्ण है, लेकिन इसे संभालने के लिए कोई AI इंजन उपलब्ध नहीं है।",
                    goal: "मैं देखता हूँ कि यह आपके लक्ष्य के लिए महत्वपूर्ण है, लेकिन इस पर काम करने के लिए कोई AI इंजन उपलब्ध नहीं है।"
                },
                curious: {
                    base: "मैं आपके संदेश में रुचि रखता हूँ, लेकिन इसकी जांच के लिए कोई AI इंजन उपलब्ध नहीं है।",
                    warm: "यह दिलचस्प प्रश्न है! दुर्भाग से, मैं इसकी जांच के लिए कोई AI इंजन उपलब्ध नहीं है।",
                    goal: "मैं आपके लक्ष्य में रुचि रखता हूँ, लेकिन इसके बारे में जानकारी के लिए कोई AI इंजन उपलब्ध नहीं है।"
                },
                playful: {
                    base: "मैंने आपका संदेश प्राप्त किया, लेकिन मज़ा करने के लिए कोई JARVIS इंजन उपलब्ध नहीं है।",
                    warm: "मज़ेदार संदेश! मैं इसी तरह में जवाब देना चाहूँगा, लेकिन अभी कोई AI इंजन उपलब्ध नहीं है।",
                    goal: "मैं आपके लक्ष्य में मज़ा करना चाहूँगा, लेकिन अभी कोई AI इंजन उपलब्ध नहीं है।"
                },
                concerned: {
                    base: "मैं आपकी चिंता को समझता हूँ, लेकिन मदद करने के लिए कोई AI इंजन उपलब्ध नहीं है।",
                    warm: "मैं समझता हूँ कि यह आपके लिए महत्वपूर्ण है, लेकिन आवश्यक सहायता देने के लिए कोई AI इंजन उपलब्ध नहीं है।",
                    goal: "मैं समझता हूँ कि यह आपके लक्ष्य से संबंधित है, लेकिन इसमें मदद करने के लिए कोई AI इंजन उपलब्ध नहीं है।"
                }
            },
            hinglish: {
                calm: {
                    base: "Maine aapka message receive kiya, lekin currently koi JARVIS engine available nahi hai.",
                    warm: "Aapke message ke liye thank you, lekin abhi koi AI engine proper response dene ke liye available nahi hai.",
                    goal: "Main aapka goal samajhta hoon, lekin us par kaam karne ke liye koi AI engine available nahi hai."
                },
                warm: {
                    base: "Aapke message ke liye thank you! Unfortunately, main abhi proper response dene ke liye koi AI engine nahi hoon.",
                    warm: "Main aapki baat appreciate karta hoon! Par abhi koi AI engine available nahi hai response dene ke liye.",
                    goal: "Main aapke goal mein madad karna chahta hoon, lekin koi AI engine available nahi hai."
                },
                focused: {
                    base: "Main aapka message samajhta hoon, lekin isko handle karne ke liye koi JARVIS engine available nahi hai.",
                    warm: "Main samajhta hoon ki ye important hai, lekin is handle karne ke liye koi AI engine available nahi hai.",
                    goal: "Main dekh raha hoon ki ye aapke goal ke liye important hai, lekin is par kaam karne ke liye koi AI engine available nahi hai."
                },
                curious: {
                    base: "Main aapke message mein interested hoon, lekin is explore karne ke liye koi AI engine available nahi hai.",
                    warm: "Ye interesting question hai! Unfortunately, main is investigate karne ke liye koi AI engine available nahi hoon.",
                    goal: "Main aapke goal mein interested hoon, lekin iske baare mein research karne ke liye koi AI engine available nahi hai."
                },
                playful: {
                    base: "Main aapka message liya, lekin maze karne ke liye koi JARVIS engine available nahi hai.",
                    warm: "Mazedar message! Main aisay mein respond karna chahta hoon, lekin koi AI engine available nahi hai.",
                    goal: "Main aapke goal mein maza karna chahta hoon, lekin koi AI engine available nahi hai."
                },
                concerned: {
                    base: "Main aapki concern samajhta hoon, lekin properly help karne ke liye koi AI engine available nahi hai.",
                    warm: "Main samajhta hoon ki ye aapke liye important hai, lekin necessary help dene ke liye koi AI engine available nahi hai.",
                    goal: "Main samajhta hoon ki ye aapke goal se related hai, lekin isme madad karne ke liye koi AI engine available nahi hai."
                }
            }
        };

        // Get language-specific responses
        const langResponses = responses[lastLanguage] || responses.en;
        const moodResponses = langResponses[mood] || langResponses.calm;

        // Adjust response based on trust level and relationship
        let finalResponse = moodResponses.base;
        
        // Add warmth based on trust level
        if (trustLevel > 0.5) {
            finalResponse = moodResponses.warm;
        }
        
        // Add goal awareness if there's an active goal
        if (activeGoal && moodResponses.goal) {
            finalResponse = moodResponses.goal;
        }

        // Add continuity context for long-term users
        if (continuity > 10 && userRelationship !== "new acquaintance") {
            const relationshipPrefix = {
                en: `As ${userRelationship}, `,
                hi: `${userRelationship} के रूप में, `,
                hinglish: `${userRelationship} ke naate, `
            };
            finalResponse = relationshipPrefix[lastLanguage] || relationshipPrefix.en + finalResponse;
        }

        return finalResponse;
    }

    // =====================================================
    // MEMORY COMMAND PROCESSOR
    // Dispatches to save or read logic based on which pattern matched.
    // =====================================================

    async processMemoryCommand(message, metadata = {}) {

        const text = this.getCommandText(message) || '';
        if (/^(?:what(?:'s| is)\s+)?(?:my\s+name|mera\s+naam)\s*(?:hai|is)?\s*\?*$/i.test(text)) {
            return await this.readUserName(metadata);
        }

        const saveContent = this.getMemorySaveMatch(message);

        if (saveContent) {
            return await this.saveMemoryFact(saveContent, metadata);
        }

        const update = this.getMemoryUpdateMatch(message);
        if (update) {
            if (update.needsDetails) return { handled: true, source: "memory", response: "Tell me which saved memory to update and the new value, for example: ‘update memory about my coding preference to Python’." };
            try {
                const found = await window.jarvis.ai.searchMemory(update.query, 10);
                const records = (found?.records || []).filter(record => !record.status || record.status === "ACTIVE");
                if (records.length !== 1) return { handled: true, source: "memory", response: records.length ? "I found more than one matching memory. Please name the exact one to update." : `I couldn't find a saved memory about “${update.query}”.` };
                const result = await window.jarvis.ai.updateMemory(records[0].key, { value: update.value });
                if (!result || result.success === false) return { handled: true, source: "memory", response: result?.error || "I couldn't update that memory." };
                return { handled: true, source: "memory", response: "Updated that saved memory. The previous value is retained in memory history." };
            } catch (error) {
                return { handled: true, source: "memory", response: `I couldn't update that memory: ${error.message || error}` };
            }
        }

        const forgetMatch = this.getMemoryForgetMatch(message);
        if (forgetMatch) {
            if (forgetMatch.action === "all") return this.confirmForgetAllMemory();
            return await this.forgetMemoryFact(forgetMatch, metadata);
        }

        const topicReadMatch = this.getMemoryTopicReadMatch(message);
        if (topicReadMatch) {
            return await this.readMemoryTopic(topicReadMatch.topic, metadata);
        }

        if (/where did i leave off|what was i working on last time|my project progress|पिछली बार.*कहाँ तक.*काम/i.test(text)) {
            return await this.readMemoryTopic("project", metadata);
        }
        if (/coding preferences|meri coding preferences|मेरी कोडिंग पसंद/i.test(text)) {
            return await this.readMemoryTopic("coding preference", metadata);
        }
        if (/project.*(what do you remember|what.*remember|क्या याद|याद है)|प्रोजेक्ट.*(क्या याद|याद है)/i.test(text)) {
            return await this.readMemoryTopic("project", metadata);
        }

        if (this.isMemoryReadCommand(message)) {
            return await this.readMemoryFacts(metadata);
        }

        return { handled: false, source: "memory", response: null };
    }

    confirmForgetAllMemory() {
        const question = "This will permanently delete all saved memories and their history. Should I delete them?";
        if (!window.JARVISConversationContext?.setConfirmation) {
            return { handled: true, source: "memory", response: "Open Memory and use Clear All to permanently delete saved memories." };
        }
        window.JARVISConversationContext.setConfirmation({
            question,
            onYes: async () => {
                const result = await window.jarvis?.ai?.clearAllMemory?.(true);
                if (!result || result.success === false) throw new Error(result?.error || "Memory store unavailable.");
                return { handled: true, source: "memory", response: `Done. I permanently deleted ${Number(result.removed ?? result.count) || 0} saved memories.` };
            },
            onNo: () => ({ handled: true, source: "confirmation", response: "Okay, I kept your saved memories." }),
            meta: { action: "forget-all-memories" }
        });
        return { handled: true, source: "confirmation", response: question };
    }

    // =====================================================
    // SAVE A REMEMBERED FACT
    // Always persists locally to this.context.facts (works even with
    // no external memory engine connected), and additionally forwards
    // to a connected memory engine if it exposes a save-like method.
    // =====================================================

    async saveMemoryFact(fact, metadata = {}) {
        // In Electron, send the explicit natural-language statement to the
        // main-process MemoryEngine. That keeps structured extraction and
        // contradiction handling in one authoritative store.
        if (window?.jarvis?.ai?.rememberMemoryMessage) {
            try {
                const result = await window.jarvis.ai.rememberMemoryMessage(fact);
                if (result?.success) {
                    const stored = Array.isArray(result.stored) ? result.stored : [];
                    const labels = stored.map(item => item.value || item.key).filter(Boolean);
                    if (window.JARVISDiagnostics) window.JARVISDiagnostics.record("MEMORY", stored.length ? "💾 MEMORY CREATED/UPDATED" : "💾 MEMORY RETRIEVAL: NO SAFE FACT", { count: stored.length });
                    return {
                        handled: true,
                        source: "memory",
                        response: labels.length
                            ? `Okay, I'll remember that: "${labels.join("; ")}"`
                            : `I couldn't find a safe, explicit fact to remember.`
                    };
                }
                return { handled: true, source: "memory", response: result?.error || "I couldn't save that to persistent memory." };
            } catch (error) {
                this.debug("Main MemoryEngine save failed:", error);
                return { handled: true, source: "memory", response: "I couldn't save that to persistent memory. Please check the Memory panel and try again." };
            }
        }

        // Prefer an explicit, documented contract when the integrator has
        // provided one (fallback for non-Electron/embedded integrations).
        const adapter = this.config.memoryAdapter;

        if (adapter && this.isFunction(adapter.saveFact)) {

            try {
                await adapter.saveFact(fact, metadata);
            } catch (error) {
                this.debug("memoryAdapter.saveFact failed:", error);
            }

        } else {

            // Fallback: best-effort duck-typing against whatever the
            // connected memory engine happens to expose. This is a guess —
            // verify it matches your actual MemoryManagerAgent's contract,
            // or provide config.memoryAdapter.saveFact to remove the guess.
            const memory = this.engines.memory;

            if (memory) {

                const methods = ["remember", "save", "saveMemory", "store", "setMemory"];

                for (const method of methods) {

                    if (this.isFunction(memory[method])) {

                        try {
                            await memory[method](fact, metadata);
                        } catch (error) {
                            this.debug("External memory save failed:", error);
                        }

                        break;
                    }
                }
            }
        }

        return {
            handled: true,
            source: "memory",
            response: `Okay, I'll remember that: "${fact}"`
        };
    }

    // =====================================================
    // FORGET REMEMBERED FACTS
    // =====================================================

    async forgetMemoryFact(match, metadata = {}) {
        try {
            const ai = window?.jarvis?.ai;
            if (ai) {
                let result = null;

                // Phase 11: resolve "forget this/that/it" only when the
                // active topic maps to exactly one active memory record.
                // Ambiguous topics are never guessed or mass-deleted.
                if (match.action === "reference") {
                    const topic = window.JARVISConversationContext?.getTopic?.();
                    if (!topic?.subject) {
                        return { handled: true, source: "memory", response: "I don't have an active topic to use for that reference." };
                    }

                    if (!ai.searchMemory || !ai.forgetMemoryKey) {
                        return { handled: true, source: "memory", response: "I can't safely resolve that memory reference right now." };
                    }

                    const search = await ai.searchMemory(topic.subject, 10);
                    const records = Array.isArray(search?.records)
                        ? search.records
                        : Array.isArray(search?.results)
                            ? search.results
                            : [];
                    const active = records.filter(record => !record?.status || record.status === "ACTIVE");

                    if (active.length !== 1 || !active[0]?.key) {
                        return {
                            handled: true,
                            source: "memory",
                            response: active.length > 1
                                ? `I found multiple memories related to "${topic.subject}". Please tell me which one to forget.`
                                : `I couldn't find a single stored memory related to "${topic.subject}" to forget safely.`
                        };
                    }

                    result = await ai.forgetMemoryKey(active[0].key);
                } else if (match.action === "all" && ai.forgetAllMemory) {
                    result = await ai.forgetAllMemory();
                } else if (match.action === "type" && ai.forgetMemoryType) {
                    result = await ai.forgetMemoryType(match.type);
                } else if (match.action === "key" && ai.forgetMemoryKey) {
                    result = await ai.forgetMemoryKey(match.key);
                } else if (match.action === "statement" && ai.forgetMemoryStatement) {
                    result = await ai.forgetMemoryStatement(match.statement);
                }

                if (result) {
                    const count = Number(result.count || 0);
                    if (window.JARVISDiagnostics) window.JARVISDiagnostics.record("MEMORY", "💾 MEMORY DELETED", { action: match.action, count });
                    return {
                        handled: true,
                        source: "memory",
                        response: count > 0
                            ? `Done. I forgot ${count} memor${count === 1 ? "y" : "ies"}.`
                            : "I couldn't find a matching active memory to forget."
                    };
                }
            }
        } catch (error) {
            this.debug("Main MemoryEngine forget failed:", error);
        }

        // Local fallback: remove matching timestamped facts from the
        // renderer's session memory without throwing if unavailable.
        if (match.action === "all") {
            this.context.facts = [];
            this.queueSaveMemory();
            return { handled: true, source: "memory", response: "Done. I forgot the locally stored memories." };
        }

        return { handled: true, source: "memory", response: "I couldn't find a matching active memory to forget." };
    }

    // =====================================================
    // READ MEMORY ABOUT A TOPIC (Phase 11)
    // Bounded topic search used after reference resolution has turned
    // "What do you remember about it?" into a concrete topic query.
    // =====================================================

    async readMemoryTopic(topic, metadata = {}) {
        const cleanTopic = String(topic || "").trim();
        if (!cleanTopic) {
            return { handled: false, source: "memory", response: null };
        }

        try {
            const ai = window?.jarvis?.ai;
            if (ai?.searchMemory) {
                const result = await ai.searchMemory(cleanTopic, 10);
                const records = Array.isArray(result?.records)
                    ? result.records
                    : Array.isArray(result?.results)
                        ? result.results
                        : [];
                const active = records.filter(record => !record?.status || record.status === "ACTIVE");
                if (window.JARVISDiagnostics) window.JARVISDiagnostics.record("MEMORY", "💾 MEMORY RETRIEVED", { query: cleanTopic, count: active.length, limit: 10 });

                if (!active.length) {
                    return { handled: true, source: "memory", response: `I don't have a stored memory about "${cleanTopic}".` };
                }

                return {
                    handled: true,
                    source: "memory",
                    response: `Here is what I remember about "${cleanTopic}":\n` +
                        active.slice(0, 10).map((item, index) => `${index + 1}. ${item.value || item.key || item}`).join("\n")
                };
            }
        } catch (error) {
            this.debug("Main MemoryEngine topic search failed:", error);
        }

        return { handled: true, source: "memory", response: `I couldn't search memory for "${cleanTopic}" right now.` };
    }

    // =====================================================
    // READ REMEMBERED FACTS
    // Prefers an external memory engine's own recall/list method if
    // it returns something; otherwise falls back to locally stored facts.
    // =====================================================

    async readUserName(metadata = {}) {
        try {
            const ai = window?.jarvis?.ai;
            if (ai?.getMemoryFacts) {
                const result = await ai.getMemoryFacts();
                const facts = result?.success ? result.facts : null;
                const name = facts?.['user.name']?.value || facts?.['user.name'];
                if (name) return { handled: true, source: 'memory', response: `Aapka naam ${name} hai.` };
            }
        } catch (error) {
            this.debug('User-name memory read failed:', error);
        }
        const local = Array.isArray(this.context?.facts) ? this.context.facts : [];
        const hit = local.find(item => /(?:my name is|mera naam)/i.test(String(item?.text || '')));
        if (hit) {
            const m = String(hit.text).match(/(?:my name is|mera naam)\s+(.+?)(?:\s+hai)?$/i);
            if (m?.[1]) return { handled: true, source: 'memory', response: `Aapka naam ${m[1].trim()} hai.` };
        }
        return { handled: true, source: 'memory', response: `Mujhe abhi aapka naam yaad nahi hai.` };
    }

    async readMemoryFacts(metadata = {}) {

        try {
            const ai = window?.jarvis?.ai;
            if (ai?.getMemoryFacts) {
                const result = await ai.getMemoryFacts();
                const facts = result?.success ? result.facts : null;
                if (facts && typeof facts === "object") {
                    const entries = Object.values(facts).filter(Boolean);
                    if (!entries.length) {
                        return { handled: true, source: "memory", response: "I don't have anything remembered yet." };
                    }
                    return {
                        handled: true,
                        source: "memory",
                        response: "Here is what I remember:\n" +
                            entries.slice(0, 20).map((item, index) => `${index + 1}. ${item.value || item}`).join("\n")
                    };
                }
            }
        } catch (error) {
            this.debug("Main MemoryEngine read failed:", error);
        }

        const adapter = this.config.memoryAdapter;

        let externalFacts = null;

        if (adapter && this.isFunction(adapter.readFacts)) {

            try {
                externalFacts = await adapter.readFacts(metadata);
            } catch (error) {
                this.debug("memoryAdapter.readFacts failed:", error);
            }

        } else {

            // Fallback: best-effort duck-typing. Verify against your real
            // MemoryManagerAgent's contract, or provide
            // config.memoryAdapter.readFacts to remove the guess.
            const memory = this.engines.memory;

            if (memory) {

                const methods = ["recall", "getAll", "getFacts", "list"];

                for (const method of methods) {

                    if (this.isFunction(memory[method])) {

                        try {
                            externalFacts = await memory[method](metadata);
                        } catch (error) {
                            this.debug("External memory read failed:", error);
                        }

                        break;
                    }
                }
            }
        }

        const localFacts = Array.isArray(this.context.facts)
            ? this.context.facts.map(item => item.text)
            : [];

        const combined =
            Array.isArray(externalFacts) && externalFacts.length
                ? externalFacts
                : localFacts;

        if (!combined.length) {

            return {
                handled: true,
                source: "memory",
                response: "I don't have anything remembered yet."
            };
        }

        const response =
            "Here is what I remember:\n" +
            combined.map((item, index) => `${index + 1}. ${item}`).join("\n");

        return { handled: true, source: "memory", response };
    }

    // =====================================================
    // SEND MESSAGE
    // =====================================================

    openExactAnswerDb() {
        if (this._exactAnswerDbPromise) return this._exactAnswerDbPromise;
        if (typeof indexedDB === "undefined") return Promise.resolve(null);
        this._exactAnswerDbPromise = new Promise((resolve) => {
            const request = indexedDB.open("jarvis-ai-answer-memory", 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains("answers")) {
                    db.createObjectStore("answers", { keyPath: "key" });
                }
            };
            request.onsuccess = () => {
                const db = request.result;
                db.onversionchange = () => db.close();
                resolve(db);
            };
            request.onerror = () => resolve(null);
            request.onblocked = () => resolve(null);
        }).catch(() => null);
        return this._exactAnswerDbPromise;
    }

    async getExactAIAnswer(key) {
        try {
            const db = await this.openExactAnswerDb();
            if (db) {
                const hit = await new Promise((resolve) => {
                    const request = db.transaction("answers", "readonly").objectStore("answers").get(key);
                    request.onsuccess = () => resolve(request.result || null);
                    request.onerror = () => resolve(null);
                });
                if (hit?.answer) return hit.answer;
            }
            // One-time compatibility with answers saved by the old capped
            // localStorage cache; future records are stored in IndexedDB.
            const legacy = JSON.parse(localStorage.getItem("jarvis:exact-answer-cache:v1") || "{}");
            const answer = legacy[key]?.answer || null;
            if (answer && db) await this.saveExactAIAnswer(key, legacy[key]);
            return answer;
        } catch (_) {
            return null;
        }
    }

    async saveExactAIAnswer(key, entry) {
        const db = await this.openExactAnswerDb();
        if (!db) {
            try {
                const entries = JSON.parse(localStorage.getItem("jarvis:exact-answer-cache:v1") || "{}");
                entries[key] = entry;
                localStorage.setItem("jarvis:exact-answer-cache:v1", JSON.stringify(entries));
                return true;
            } catch (_) {
                return false;
            }
        }
        return new Promise((resolve) => {
            try {
                const tx = db.transaction("answers", "readwrite");
                tx.objectStore("answers").put({ key, ...entry });
                tx.oncomplete = () => resolve(true);
                tx.onerror = tx.onabort = () => resolve(false);
            } catch (_) {
                resolve(false);
            }
        });
    }

    _splitCompoundCommand(message) {
        const text = String(message || "").trim();
        if (!text) return [text];
        // Resolve the whole request before splitting: the payload may itself
        // contain verbs, conjunctions, or the assistant's wake word.
        if (window.JARVISNaturalCommandEngine?.detect?.(text)?.intent === "APP_TASK_FLOW") return [text];
        // Keep an app-plus-search request together. Splitting
        // “Open Microsoft Store and search cloud” into two commands sends
        // the second half to generic web search instead of the local app
        // workflow, so it must reach NaturalCommandEngine atomically.
        if (/^(?:please\s+)?(?:open|launch|start)\s+.+?\s+(?:and\s+)?(?:search|find)(?:\s+for)?\s+.+$/iu.test(text)) {
            return [text];
        }
        const actionStart = String.raw`(?:please\s+)?(?:create|make|build|prepare|generate|play|open|launch|start|search|find|look\s+for|watch|close|switch|go\s+to|set|turn|mute|unmute|lock|restart|shutdown|download|convert|summarize|research|compare|बनाओ|बना\s+दो|तैयार\s+करो|चलाओ|चला\s+दो|खोलो|खोल\s+दो|ढूँढो|ढूंढो|खोजो|बंद\s+करो|सेट\s+करो|दिखाओ)`;
        const youtubeStart = String.raw`(?:youtube|यूट्यूब)(?=.{0,100}(?:video|song|music|गेमिंग|वीडियो|गाना|म्यूजिक|चलाओ|चलाएँ))`;
        const separator = new RegExp(String.raw`\s+(?:and\s+then|and\s+also|after\s+that|then|also|and|और\s+फिर|फिर|और)\s+(?=(?:${actionStart}|${youtubeStart}))`, "giu");
        const parts = text.split(separator).map(part => part.trim()).filter(Boolean);
        return parts.length > 1 && parts.length <= 8 ? parts : [text];
    }

    _isYouTubePlaybackCommand(text) {
        return /(?:youtube|यूट्यूब)/iu.test(String(text || "")) &&
            /(?:\b(?:play|watch|start)\b|चलाओ|चला\s+दो|चलाएँ|बजाओ)/iu.test(String(text || "")) &&
            /(?:\b(?:video|song|music|gameplay|gaming)\b|वीडियो|गाना|म्यूजिक|गेमप्ले|गेमिंग)/iu.test(String(text || ""));
    }

    async _executeCompoundCommand(parts, routeMetadata = {}) {
        const completed = [];
        const lang = window.JARVISLanguageCore?.detectLanguage?.(parts.join(" ")) || "en";
        for (const [index, part] of parts.entries()) {
            if (routeMetadata.cancelToken?.cancelled) {
                completed.push({ command: part, success: false, response: "Cancelled." });
                break;
            }
            try {
                let result;
                if (this._isYouTubePlaybackCommand(part)) {
                    const query = part
                        .replace(/^\s*(?:hey\s+)?jarvis[,:\s-]*/iu, "")
                        .replace(/\b(?:please|play|watch|start|my|the|a|an|on|in|youtube)\b/giu, " ")
                        .replace(/(?:जार्विस|यूट्यूब|पर|मेरी|मेरा|मेरे|चलाओ|चला\s+दो|बजाओ)/giu, " ")
                        .replace(/[?!,]+/g, " ").replace(/\s+/g, " ").trim();
                    const searchQuery = query || (lang === "hi" ? "ट्रेंडिंग गेमिंग वीडियो" : "trending gaming videos");
                    const played = await window.jarvis?.browser?.playTopYouTubeResult?.(searchQuery);
                    result = played?.success
                        ? { handled: true, response: lang === "hi" ? `YouTube पर “${searchQuery}” का पहला वीडियो चला दिया।` : `Playing the top YouTube video for “${searchQuery}”.` }
                        : { handled: true, response: played?.error || (lang === "hi" ? "YouTube वीडियो नहीं चला पाया।" : "I couldn't play the YouTube video.") };
                } else {
                    const detected = window.JARVISNaturalCommandEngine?.detect?.(part);
                    if (["CREATE_PRESENTATION", "CREATE_PDF", "CREATE_IMAGE", "CREATE_SPREADSHEET", "CREATE_OFFICE_FILE"].includes(detected?.intent)) {
                        result = await window.JARVISNaturalCommandEngine.execute(detected);
                    } else {
                        result = await this.processBrainRouter(part, {
                            ...routeMetadata,
                            compoundCommand: true,
                            compoundIndex: index + 1,
                            compoundTotal: parts.length,
                            originalText: part,
                            spokenText: part
                        });
                    }
                }
                completed.push({ command: part, success: result?.handled !== false && !result?.error, response: result?.response || result?.error || (lang === "hi" ? "पूरा हुआ।" : "Done."), source: result?.source || "command" });
            } catch (error) {
                completed.push({ command: part, success: false, response: error?.message || (lang === "hi" ? "यह काम पूरा नहीं हो पाया।" : "This action failed.") });
            }
        }
        const lines = completed.map((item, index) => `${index + 1}. ${item.success ? "✓" : "✗"} ${item.response}`);
        return {
            handled: true,
            source: "multi-action",
            response: (lang === "hi" ? "कमांड क्रम से पूरी की गईं:\n" : "Completed the requested actions in order:\n") + lines.join("\n"),
            actions: completed
        };
    }

    async send(message, options = {}) {
        const input = this.validateInput(message);

        if (!input.valid) {
            return this.createErrorResponse(
                input.reason === "empty"
                    ? "Please provide a message."
                    : "Your message is too long."
            );
        }

        // AUTO BOOT
        if (!this.booted) {
            const bootResult = await this.boot();

            if (!bootResult) {
                return this.createErrorResponse(
                    "JARVIS Chat Engine is unable to start."
                );
            }
        }

        // PROCESSING LOCK
        if (this.processing && !options.allowConcurrent) {
            this.debug("Message ignored because another request is processing.");

            return {
                success: false,
                handled: false,
                response: "I am still processing your previous request.",
                source: "chat",
                busy: true
            };
        }

        const text = input.text;
        const compoundCommands = this._splitCompoundCommand(text);
        // Generated documents use their dedicated artifact workflows and must
        // not fall through to a conversational AI response.
        let artifactIntent = null;
        try {
            if (compoundCommands.length === 1) {
                // Voice Tolerance may rewrite a spoken utterance before it
                // reaches ChatEngine. Prefer the untouched transcript for
                // artifact intent detection, while still falling back to the
                // canonical input if it is the clearer version.
                const spokenText = String(options.spokenText || "").trim();
                const isArtifactIntent = value => ["CREATE_PRESENTATION", "CREATE_PDF", "CREATE_IMAGE", "CREATE_SPREADSHEET", "CREATE_OFFICE_FILE"].includes(value?.intent);
                const spokenDetected = spokenText ? window.JARVISNaturalCommandEngine?.detect?.(spokenText) : null;
                const canonicalDetected = isArtifactIntent(spokenDetected) ? null : window.JARVISNaturalCommandEngine?.detect?.(text);
                const detected = isArtifactIntent(spokenDetected) ? spokenDetected : canonicalDetected;
                if (isArtifactIntent(detected)) {
                    artifactIntent = detected;
                    if (spokenText && detected !== spokenDetected) {
                        artifactIntent = {
                            ...detected,
                            originalText: spokenText,
                            entities: { ...detected.entities, userRequest: spokenText }
                        };
                    }
                }
                if (artifactIntent?.intent === "CREATE_PRESENTATION") {
                    this.debug("[PPT ROUTE] Voice/chat artifact dispatch selected", {
                        inputText: text,
                        originalRequest: artifactIntent.originalText,
                        topic: artifactIntent.entities?.topic,
                        wantsImages: artifactIntent.entities?.wantsImages,
                        slideCount: artifactIntent.entities?.slideCount,
                        imageCount: artifactIntent.entities?.imageCount,
                        handler: "existing-presentations:create"
                    });
                }
            }
        } catch (error) { this.debug("Presentation command detection skipped:", error); }
        const normalizeQuestion = (value) => String(value || "")
            .normalize("NFKC")
            .toLocaleLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, " ")
            .trim();
        const questionKey = normalizeQuestion(text);
        const screenQuestion = !!window.JARVISScreenShare?.shouldAnalyzeQuestion?.(text);
        let cachedAnswer = null;
        if (!screenQuestion && this.shouldUseAI(text) && questionKey.length >= 3) {
            cachedAnswer = await this.getExactAIAnswer(questionKey);
        }
        const requestID = this.createRequestID();
        const startedAt = Date.now();

        this.runtime.requests++;
        this.runtime.lastRequest = { id: requestID, message: text, timestamp: startedAt };
        this.lastActivity = startedAt;

        // DUPLICATE PROTECTION
        if (this.config.preventDuplicate && !options.allowDuplicate) {
            const duplicate = this.isDuplicateMessage(text);

            // A repeated natural-language question is usually accidental, but
            // repeating a local action is intentional surprisingly often:
            // users retry a launch/search after an app is still waking up.
            // Do not let the chat-level duplicate guard swallow those second
            // attempts; the action router and its own safety gates remain in
            // charge of execution and approval.
            const repeatableLocalAction = this.isRepeatableLocalAction(text);

            if (duplicate && !cachedAnswer && !repeatableLocalAction) {
                this.debug("Duplicate message prevented:", text);

                return {
                    success: false,
                    handled: false,
                    duplicate: true,
                    response: "I already received that message.",
                    source: "duplicate",
                    requestID
                };
            }
        }

        // activeRequests-based tracking so concurrent requests (via
        // options.allowConcurrent) don't stomp on each other's state.
        this.runtime.activeRequests++;
        this.processing = true;

        // Cancellation token for THIS specific request, keyed by requestID.
        // cancel(requestID) flips one token; cancel() with no argument
        // flips all currently in-flight tokens. Router/agent loops check
        // their own token between steps and stop early.
        const cancelToken = { cancelled: false };

        this.runtime.cancelTokens.set(requestID, cancelToken);

        this.emit("processingStart", { requestID, message: text, inputSource: options.source || "unknown" });
        this._publishActivity({ requestID, phase: "working", state: "understanding", task: String(text).trim().slice(0, 140), tool: "JARVIS Router", operation: "Understanding the request" });

        try {
            // SAVE USER MESSAGE
            this.addHistory("user", options.spokenText || text, { requestID });

            // CONVERSATION CONTEXT FOUNDATION (Phase 1) — best-effort,
            // never allowed to affect the actual chat response. Keeps a
            // short rolling window of turns for future reference-
            // resolution work ("it", "that", "the previous one").
            try {
                window.JARVISConversationContext?.pushTurn("user", options.spokenText || text);
            } catch (contextError) {
                this.debug("ConversationContext pushTurn(user) failed:", contextError);
            }

            // FEATURE UPGRADE v2.1 — pre-router enrichment (best-effort,
            // never blocks the message):
            //   1. Command Aliases — learn "jab main 'x' bolu to 'y'" phrasing,
            //      then expand user-taught shortcuts
            //   2. Conversation Context — resolve follow-ups like
            //      "usko band karo" / "wapas chalao" into full commands
            let routedText = text;
            try {
                const learn = window.JARVISCommandAliases?.tryLearnFromMessage?.(text);
                if (learn && learn.success) {
                    this.debug("Command alias learned:", learn.alias);
                routedText = window.JARVISCommandAliases?.resolve?.(routedText) || routedText;
                }
            } catch (aliasError) {
                this.debug("CommandAliases resolve failed:", aliasError);
            }
            try {
                // Legacy conversationContext.js follow-up resolution ("usko
                // band karo") — see the global-rename collision fix in that
                // file. Optional-chained: a no-op when the legacy engine has
                // no turn history; topic-based ROUTE -0.5 (ReferenceResolver)
                // is the primary path.
                const resolved = window.JARVISLegacyConversationContext?.resolve?.(routedText);
                if (resolved && resolved !== routedText) {
                    this.debug("Context resolved:", JSON.stringify({ from: routedText, to: resolved }));
                    routedText = resolved;
                }
            } catch (resolveError) {
                this.debug("ConversationContext resolve failed:", resolveError);
            }

            // ROUTE MESSAGE — raced against the configured response timeout.
            // Note: this stops the *pipeline* at its next checkpoint and
            // prevents side effects (saving/emitting) on timeout/cancel —
            // it can't forcibly abort a single engine call that doesn't
            // itself support cancellation, since JS promises can't be
            // externally killed once started.
            // Local Ollama models can need nearly two minutes for their
            // first response. Keep deterministic routes snappy, while
            // letting conversational requests reach Ollama's own timeout.
            const compoundHasLongJob = compoundCommands.length > 1 && compoundCommands.some(part => {
                const intent = window.JARVISNaturalCommandEngine?.detect?.(part)?.intent;
                return intent === "CREATE_PRESENTATION" || intent === "CREATE_PDF" || intent === "CREATE_IMAGE";
            });
            const timeoutMs = Number(options.responseTimeoutMs) ||
                (compoundHasLongJob ? 15 * 60 * 1000 :
                    (screenQuestion || this.shouldUseAI(routedText) ? 135000 : (Number(this.config.responseTimeout) || 30000)));

            // Keep completed AI answers locally so an identical repeat can
            // be answered immediately without another provider round-trip.
            // Commands and deterministic service results continue through
            // their normal handlers and are never served from this cache.
            if (!screenQuestion && !cachedAnswer && this.shouldUseAI(routedText) && questionKey.length >= 3) {
                cachedAnswer = await this.getExactAIAnswer(questionKey);
            }

            let timeoutHandle = null;

            const timeoutPromise = new Promise(resolve => {
                timeoutHandle = setTimeout(() => {
                    resolve({ handled: false, source: "timeout", response: null, timedOut: true });
                }, timeoutMs);
            });

            const routerPromise = compoundCommands.length > 1
                ? this._executeCompoundCommand(compoundCommands, {
                    ...options,
                    requestID,
                    sessionID: this.sessionID,
                    cancelToken,
                    originalText: text,
                    spokenText: options.spokenText || text,
                    responseLanguage: options.responseLanguage
                })
                : artifactIntent && window.JARVISNaturalCommandEngine?.execute
                ? window.JARVISNaturalCommandEngine.execute(artifactIntent)
                : cachedAnswer
                ? Promise.resolve({ handled: true, source: "local-answer-cache", response: cachedAnswer })
                : this.processBrainRouter(routedText, {
                ...options,
                requestID,
                sessionID: this.sessionID,
                cancelToken,
                originalText: options.spokenText || text,
                spokenText: options.spokenText || text,
                responseLanguage: options.responseLanguage
            });

            const result = await Promise.race([routerPromise, timeoutPromise]);

            clearTimeout(timeoutHandle);

            if (result && result.timedOut) {

                // Signal the still-running router to stop at its next checkpoint.
                cancelToken.cancelled = true;

                this.runtime.timedOutRequests++;
                this.runtime.failedRequests++;

                const timeoutResult = this.createErrorResponse(
                    "The request timed out. Please try again.",
                    null,
                    requestID
                );

                this.emit("messageTimeout", timeoutResult);

                return timeoutResult;
            }

            if (cancelToken.cancelled) {

                this.runtime.cancelledRequests++;

                const cancelledResult = {
                    success: false,
                    handled: false,
                    response: null,
                    text: null,
                    source: "cancelled",
                    requestID,
                    cancelled: true,
                    timestamp: Date.now()
                };

                this.emit("messageCancelled", cancelledResult);

                return cancelledResult;
            }

            // NORMALIZE RESPONSE
            const response = this.finalizeResponse(result);

            if (
                questionKey.length >= 3 &&
                !screenQuestion &&
                this.shouldUseAI(routedText) &&
                response.text &&
                !["fallback", "timeout", "error", "local-answer-cache", "router"].includes(response.source) &&
                !result?.error &&
                !/no compatible ai engine|no .*engine.*available|could not produce a local response/i.test(response.text)
            ) {
                const saved = await this.saveExactAIAnswer(questionKey, {
                    question: text,
                    answer: response.text,
                    source: response.source,
                    savedAt: Date.now()
                });
                if (!saved) this.debug("Exact answer could not be saved to local IndexedDB.");
            }

            // SAVE ASSISTANT RESPONSE
            if (response.text) {
                this.addHistory("assistant", response.text, {
                    requestID,
                    source: response.source,
                    aiProviderName: response.aiProviderName || "",
                    aiModel: response.aiModel || "",
                    fallbackReason: response.fallbackReason || "",
                    ...(response.richContent ? { richContent: response.richContent } : {})
                });

                // CONVERSATION CONTEXT FOUNDATION (Phase 1) — see the
                // matching pushTurn("user", ...) call above.
                try {
                    window.JARVISConversationContext?.pushTurn("assistant", response.text);
                } catch (contextError) {
                    this.debug("ConversationContext pushTurn(assistant) failed:", contextError);
                }

                try { window.MistakeLearningControl?.noteExchange?.(text, response.text); }
                catch (_) { /* correction memory is optional */ }
            }

            // MEME SOUND — non-blocking and never allowed to delay TTS.
            try { window.JARVIS_MemeSounds?.triggerFromResponse?.(text, response.text || "", response.source); } catch (memeError) { this.debug("Meme sound failed:", memeError); }

            // FEED THE CONSCIOUSNESS LAYER — best-effort, fire-and-forget.
            // This is what keeps mood/trust/continuity/thought-stream moving
            // from ordinary local (non-AI) replies too, not just from a
            // cloud AI call. Never blocks or fails the actual chat response.
            if (text && !response.consciousnessRecorded) {
                try {
                    // Local engine first (restored old build, no API key,
                    // no IPC round-trip). Also feed the IPC bridge if it's
                    // there, so nothing that was relying on it breaks.
                    window.JARVISConsciousnessLocal?.recordTurn?.(text, response.text || "");
                    window.jarvis?.ai?.recordTurn?.(text, response.text || "");
                } catch (error) {
                    this.debug("Consciousness recordTurn failed:", error);
                }
            }

            // UPDATE RUNTIME
            this.runtime.lastResponse = {
                id: requestID,
                text: response.text,
                source: response.source,
                aiProvider: response.aiProvider || "",
                aiProviderName: response.aiProviderName || "",
                aiModel: response.aiModel || "",
                fallbackReason: response.fallbackReason || "",
                inputSource: options.source || "unknown",
                duration: Date.now() - startedAt
            };

            this.runtime.successfulRequests++;
            this.lastActivity = Date.now();

            // AUTO SAVE (debounced by default — see queueSaveMemory())
            if (this.config.autoSave) {
                this.queueSaveMemory();
            }

            // VOICE
            if (response.text && options.speak === true) {
                // Start TTS immediately, but DO NOT await it. Keeping the chat request
                // open until SAPI finishes caused the next voice turn to be rejected as busy.
                Promise.resolve().then(() => this.speak(response.text)).catch((speechError) => {
                    console.warn("⚠ Non-blocking TTS error:", speechError);
                }).finally(() => {
                    try {
                        window.JARVISDeferredShutdown?.onReplyDelivered?.({
                            success: Boolean(response.text), response: response.text, source: response.source,
                            aiProvider: response.aiProvider, aiProviderName: response.aiProviderName, aiModel: response.aiModel
                        });
                    } catch (deferredError) { console.warn("Deferred provider shutdown check failed:", deferredError); }
                });
            }

            // COMPLETE
            const finalResult = {
                success: Boolean(response.text),
                handled: Boolean(response.handled),
                response: response.text,
                text: response.text,
                source: response.source,
                ...(response.aiProvider ? { aiProvider: response.aiProvider } : {}),
                ...(response.aiProviderName ? { aiProviderName: response.aiProviderName } : {}),
                ...(response.aiModel ? { aiModel: response.aiModel } : {}),
                ...(response.fallbackReason ? { fallbackReason: response.fallbackReason } : {}),
                inputSource: options.source || "unknown",
                ...(response.richContent ? { richContent: response.richContent } : {}),
                ...(response.intent ? { intent: response.intent } : {}),
                ...(response.entities ? { entities: response.entities } : {}),
                requestID,
                duration: Date.now() - startedAt,
                timestamp: Date.now()
            };

            this.emit("messageComplete", finalResult);
            if (!(response.text && options.speak === true)) {
                try { window.JARVISDeferredShutdown?.onReplyDelivered?.(finalResult); }
                catch (deferredError) { console.warn("Deferred provider shutdown check failed:", deferredError); }
            }
            this._publishActivity({ requestID, phase: "completed", state: "success", task: String(text).trim().slice(0, 140), tool: finalResult.source || "JARVIS", operation: "Task completed" });

            // CONVERSATION MODE (v2.2) — if this exchange came from voice,
            // keep listening WITHOUT requiring the wake word again. Every
            // reply extends the conversation window; idle timeout (45s)
            // returns to ambient wake-word mode. Best-effort, never blocks.
            try {
                if (options.source === "voice" || options.speak === true) {
                    window.JARVISConversationMode?.afterJarvisReplied?.();
                }
            } catch (convoError) {
                this.debug("ConversationMode continue failed:", convoError);
            }

            return finalResult;
        } catch (error) {
            this.runtime.failedRequests++;
            this.runtime.lastError = error;

            console.error("❌ Chat Send Error:", error);

            const errorResult = this.createErrorResponse(
                "I encountered an error while processing your request.",
                error,
                requestID
            );

            this.emit("messageError", errorResult);
            this._publishActivity({ requestID, phase: "failed", state: "error", task: String(text).trim().slice(0, 140), tool: "JARVIS", operation: "Request failed" });

            return errorResult;
        } finally {
            this.runtime.activeRequests = Math.max(0, this.runtime.activeRequests - 1);
            this.processing = this.runtime.activeRequests > 0;

            this.lastActivity = Date.now();

            this.runtime.cancelTokens.delete(requestID);

            this.emit("processingEnd", { requestID });
        }
    }

    // =====================================================
    // SEND MESSAGE ALIAS
    // =====================================================

    async sendMessage(message, options = {}) {
        return await this.send(message, options);
    }

    // =====================================================
    // CHAT ALIAS
    // =====================================================

    async chat(message, options = {}) {
        return await this.send(message, options);
    }

    // =====================================================
    // PROCESS MESSAGE ALIAS
    // =====================================================

    async processMessage(message, options = {}) {
        return await this.send(message, options);
    }

    // =====================================================
    // VOICE MESSAGE
    // =====================================================

    async sendVoice(message, options = {}) {
        return await this.send(message, { ...options, speak: true, source: "voice" });
    }

    // =====================================================
    // DUPLICATE MESSAGE CHECK
    // =====================================================

    isDuplicateMessage(message) {
        const text = this.normalizeInput(message).toLowerCase();

        if (!text) {
            return false;
        }

        if (!Array.isArray(this.history)) {
            return false;
        }

        const recentMessages = this.history
            .filter(item => item && item.role === "user")
            .slice(-3);

        return recentMessages.some(
            item => this.normalizeInput(item.content).toLowerCase() === text
        );
    }

    isRepeatableLocalAction(message) {
        const text = this.normalizeInput(message).toLocaleLowerCase();
        if (!text) return false;

        return /\b(?:open|launch|start|run|search|find|download|install|click|type|select|join|play|stop|close|delete|remove|copy|move|backup|restart|shutdown|diagnose|fix|autopilot|accessos|access\s+mode|microsoft\s+store|store)\b|(?:खोल|चल|शुरू|सर्च|ढूंढ|डाउनलोड|इंस्टॉल|क्लिक|सेलेक्ट|जॉइन|प्ले|रोक|बंद|डिलीट|हट|कॉपी|मूव|बैकअप|रीस्टार्ट|शटडाउन|डायग्नोस|फिक्स|ऑटोपायलट|एक्सेस)/iu.test(text);
    }

    // =====================================================
    // FINALIZE RESPONSE
    // =====================================================
// =====================================================
// FINALIZE RESPONSE — V12 FIXED
// =====================================================

finalizeResponse(result) {

    // -----------------------------------------
    // NULL / UNDEFINED RESULT
    // -----------------------------------------

    if (!result) {

        return {
            handled: false,
            source: "fallback",
            text: "I could not process that request."
        };
    }

    // -----------------------------------------
    // EXTRACT RESPONSE
    // -----------------------------------------

    let text =
        result.response ??
        result.reply ??
        result.message ??
        result.text ??
        result.answer ??
        result.output ??
        "";

    text = this.cleanAIResponse(text);

    // -----------------------------------------
    // FALLBACK WHEN ENGINE RETURNS NOTHING
    // -----------------------------------------

    if (!text) {

        // If engine explicitly failed
        if (result.error) {

            this.debug(
                "Engine returned no usable response:",
                result.source,
                result.error
            );

            text =
                "I was unable to get a response from the active JARVIS engine.";
        }

        // Router reached the end without handling
        else if (
            result.source === "router" ||
            result.source === "brain" ||
            result.source === "agents" ||
            result.source === "ai"
        ) {

            text =
                "I understand your message, but I don't have a connected engine that can answer it yet.";
        }

        // Generic safety fallback
        else {

            text =
                "I could not process that request.";
        }
    }

    // -----------------------------------------
    // FINAL HANDLED STATE
    // -----------------------------------------

    const handled =
        result.handled !== undefined
            ? Boolean(result.handled)
            : Boolean(text);

    return {
        ...result,
        handled,
        source: result.source || "chat",
        text
    };
}

    // =====================================================
    // CLEAN AI / ENGINE RESPONSE
    // =====================================================

    cleanAIResponse(response) {
        if (response === null || response === undefined) {
            return "";
        }

        let text = String(response).trim();

        if (!text) {
            return "";
        }

        const blockedPatterns = [
            "api key is invalid",
            "invalid api key",
            "authentication failed",
            "unauthorized",
            "internal server error",
            "rate limit exceeded",
            "failed to fetch",
            "network error"
        ];

        const lower = text.toLowerCase();

        if (blockedPatterns.some(pattern => lower.includes(pattern))) {
            this.debug("Blocked technical AI response:", text);
            return "";
        }

        text = text.replace(/^```(?:text|markdown)?\s*/i, "");
        text = text.replace(/\s*```$/i, "");
        text = text.replace(/[ \t]+/g, " ");
        text = text.replace(/\n{3,}/g, "\n\n");

        return text.trim();
    }

    // =====================================================
    // SPEAK
    // =====================================================

    async speak(text) {
        if (!text || !this.config.voice) {
            return false;
        }

        const voice = this.engines.voice;

        // Voice Engine
        if (voice) {
            const methods = ["speak", "say", "talk", "synthesize"];

            for (const method of methods) {
                if (this.isFunction(voice[method])) {
                    try {
                        const devanagariCount = (String(text).match(/[\u0900-\u097F]/g) || []).length;
                        const language = devanagariCount > 0 ? "hi-IN" : "en-IN";
                        await voice[method](text, { language });
                        return true;
                    } catch (error) {
                        this.debug("Voice engine failed:", error);
                    }
                }
            }
        }

        // Existing TTS Engine
        const tts = this.getGlobal("TTSEngine");

        if (tts) {
            const methods = ["speak", "say", "talk"];

            for (const method of methods) {
                if (this.isFunction(tts[method])) {
                    try {
                        const devanagariCount = (String(text).match(/[\u0900-\u097F]/g) || []).length;
                        const language = devanagariCount > 0 ? "hi-IN" : "en-IN";
                        await tts[method](text, { language });
                        return true;
                    } catch (error) {
                        this.debug("TTSEngine failed:", error);
                    }
                }
            }
        }

        return false;
    }

    // =====================================================
    // STOP SPEAKING
    // =====================================================

    stopSpeaking() {
        try {
            const voice = this.engines.voice;

            if (voice) {
                if (this.isFunction(voice.stopSpeaking)) {
                    voice.stopSpeaking();
                } else if (this.isFunction(voice.stop)) {
                    voice.stop();
                }
            }

            const tts = this.getGlobal("TTSEngine");

            if (tts && this.isFunction(tts.stop)) {
                tts.stop();
            }

            if (typeof window !== "undefined" && window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }

            return true;
        } catch (error) {
            this.debug("Stop speaking failed:", error);
            return false;
        }
    }

    // =====================================================
    // ERROR RESPONSE
    // =====================================================

    createErrorResponse(message, error = null, requestID = null) {
        if (error) {
            this.runtime.lastError = error;
            this.debug("Request error:", error);
        }

        return {
            success: false,
            handled: false,
            response: message || "Something went wrong.",
            text: message || "Something went wrong.",
            source: "error",
            requestID,
            error: this.config.debug ? error : undefined,
            timestamp: Date.now()
        };
    }

    // =====================================================
    // CANCEL CURRENT PROCESSING
    // =====================================================

    cancel(requestID = null) {

        // Signal the in-flight request's pipeline to stop at its next
        // checkpoint (between routes / between pipeline agents). This
        // can't forcibly abort a single already-started engine call that
        // doesn't support cancellation itself — full interruption of an
        // arbitrary in-flight promise isn't possible in JS — but it does
        // stop the router from proceeding to the next stage and prevents
        // the eventual result from being saved or emitted as a real reply.
        //
        // Cancellation is cooperative and per-request:
        //  - cancel("CHAT-abc-1") cancels only that specific request.
        //  - cancel() with no argument cancels every request currently
        //    in flight (useful for the common single-request case, and
        //    for "stop everything" style UI actions).
        //
        // Note: this.processing is intentionally NOT touched here. It's
        // derived from runtime.activeRequests inside send()'s finally
        // block, so it always reflects reality even when multiple
        // requests are running concurrently via options.allowConcurrent —
        // writing to it directly here would race with that.

        let cancelledCount = 0;

        if (requestID) {

            const token = this.runtime.cancelTokens.get(requestID);

            if (token) {
                token.cancelled = true;
                cancelledCount = 1;
            }

        } else {

            for (const token of this.runtime.cancelTokens.values()) {
                token.cancelled = true;
                cancelledCount++;
            }
        }

        this.stopSpeaking();

        this.emit("cancelled", { timestamp: Date.now(), requestID, cancelledCount });

        return cancelledCount > 0;
    }

    // =====================================================
    // GET LAST RESPONSE
    // =====================================================

    getLastResponse() {
        return this.runtime.lastResponse || null;
    }

    // =====================================================
    // GET LAST REQUEST
    // =====================================================

    getLastRequest() {
        return this.runtime.lastRequest || null;
    }

    // =====================================================
    // GET PROCESSING STATUS
    // =====================================================

    isProcessing() {
        return Boolean(this.processing);
    }

    // =====================================================
    // RESET RUNTIME
    // =====================================================

    resetRuntime() {
        // Cancel anything still in flight before wiping runtime state.
        this.cancel();

        this.processing = false;

        this.runtime.lastRequest = null;
        this.runtime.lastResponse = null;
        this.runtime.lastError = null;
        this.runtime.requests = 0;
        this.runtime.successfulRequests = 0;
        this.runtime.failedRequests = 0;
        this.runtime.timedOutRequests = 0;
        this.runtime.cancelledRequests = 0;
        this.runtime.activeRequests = 0;
        this.runtime.cancelTokens.clear();

        return true;
    }

    // =====================================================
    // LOAD MEMORY
    // =====================================================

    async loadMemory() {
        try {
            // 1. EXPLICIT ADAPTER CONTRACT (preferred — see config.memoryAdapter)
            const adapter = this.config.memoryAdapter;

            if (adapter && this.isFunction(adapter.loadState)) {

                try {
                    const result = await adapter.loadState(this.memoryKey);

                    if (result) {
                        this.restoreMemoryData(result);
                        this.debug("Memory restored using memoryAdapter.loadState.");
                        return true;
                    }
                } catch (error) {
                    this.debug("memoryAdapter.loadState failed:", error);
                }
            }

            // 2. MEMORY ENGINE (duck-typed fallback)
            const memory = this.engines.memory;

            if (memory) {
                const methods = ["load", "loadMemory", "restore", "restoreMemory", "getHistory"];

                for (const method of methods) {
                    if (this.isFunction(memory[method])) {
                        try {
                            const result = await memory[method](this.memoryKey);

                            if (result) {
                                this.restoreMemoryData(result);
                                this.debug("Memory restored from Memory Engine.");
                                return true;
                            }
                        } catch (error) {
                            this.debug("Memory engine load failed:", error);
                        }
                    }
                }
            }

            // 3. LOCAL STORAGE FALLBACK
            if (typeof localStorage !== "undefined") {
                const raw = localStorage.getItem(this.memoryKey);

                if (raw) {
                    try {
                        const data = JSON.parse(raw);

                        this.restoreMemoryData(data);

                        this.debug("Memory restored from localStorage.");

                        return true;
                    } catch (error) {
                        console.warn("⚠ Invalid JARVIS chat memory:", error);

                        // Corrupt memory should not crash the Chat Engine.
                        try {
                            localStorage.removeItem(this.memoryKey);
                        } catch (_) {}
                    }
                }
            }

            this.debug("No previous chat memory found.");

            return false;
        } catch (error) {
            console.error("❌ Load Memory Error:", error);
            this.runtime.lastError = error;
            return false;
        }
    }

    // =====================================================
    // RESTORE MEMORY DATA
    // =====================================================

    // =====================================================
    // REPLAY RESTORED HISTORY INTO THE VISIBLE CHAT UI
    // loadMemory()/restoreMemoryData() only restore this.history
    // in memory (for context/AI use) — they never touch the DOM,
    // so without this the chat window appeared empty after every
    // restart even though history was actually persisted.
    // =====================================================

    replayHistoryToUI() {
        try {
            if (!Array.isArray(this.history) || !this.history.length) {
                return;
            }

            if (!window.Renderer) {
                this.debug("Renderer not available yet; skipping history replay.");
                return;
            }

            for (const entry of this.history) {
                if (!entry || !entry.content) continue;

                if (entry.role === "user") {
                    if (typeof window.Renderer.addUserMessage === "function") {
                        window.Renderer.addUserMessage(entry.content);
                    }
                } else {
                    if (typeof window.Renderer.addJarvisMessage === "function") {
                        window.Renderer.addJarvisMessage(entry.content, entry.richContent || null, {
                            providerName: entry.aiProviderName || "",
                            model: entry.aiModel || "",
                            fallbackReason: entry.fallbackReason || ""
                        });
                    }
                }
            }

            this.debug(`Replayed ${this.history.length} restored message(s) into chat UI.`);
        } catch (error) {
            console.error("❌ Replay History To UI Failed:", error);
        }
    }

    restoreMemoryData(data) {
        if (!data) {
            return false;
        }

        try {
            // New memory format
            if (Array.isArray(data.history)) {
                this.history = this.sanitizeHistory(data.history);
            }

            // Context
            if (data.context && typeof data.context === "object") {
                this.context = { ...data.context };
            }

            // Old format compatibility
            if (Array.isArray(data)) {
                this.history = this.sanitizeHistory(data);
            }

            // Limit history
            this.trimHistory();

            return true;
        } catch (error) {
            console.error("❌ Restore Memory Failed:", error);
            return false;
        }
    }

    // =====================================================
    // SAVE MEMORY
    // =====================================================

    async saveMemory() {
        if (!this.config.autoSave) {
            return false;
        }

        try {
            const data = {
                version: this.version,
                sessionID: this.sessionID,
                savedAt: Date.now(),
                history: this.history,
                context: this.context
            };

            // 1. EXPLICIT ADAPTER CONTRACT (preferred — see config.memoryAdapter)
            // Note this is a DIFFERENT contract than saveMemoryFact()/
            // adapter.saveFact: this one persists the *entire session
            // state* (key + full data blob), not a single remembered fact.
            const adapter = this.config.memoryAdapter;

            if (adapter && this.isFunction(adapter.saveState)) {

                try {
                    await adapter.saveState(this.memoryKey, data);

                    this.debug("Memory saved using memoryAdapter.saveState.");

                    return true;
                } catch (error) {
                    this.debug("memoryAdapter.saveState failed:", error);
                }
            }

            // 2. MEMORY ENGINE (duck-typed fallback — verify this matches
            // your real MemoryManagerAgent's contract, or provide
            // config.memoryAdapter.saveState to remove the guess)
            const memory = this.engines.memory;

            if (memory) {
                const methods = ["save", "saveMemory", "store", "setMemory", "remember"];

                for (const method of methods) {
                    if (this.isFunction(memory[method])) {
                        try {
                            await memory[method](this.memoryKey, data);

                            this.debug("Memory saved using Memory Engine.");

                            return true;
                        } catch (error) {
                            this.debug("Memory engine save failed:", error);
                        }
                    }
                }
            }

            // 3. LOCAL STORAGE FALLBACK
            if (typeof localStorage !== "undefined") {
                localStorage.setItem(this.memoryKey, JSON.stringify(data));

                this.debug("Memory saved to localStorage.");

                return true;
            }

            return false;
        } catch (error) {
            console.error("❌ Save Memory Error:", error);
            this.runtime.lastError = error;
            return false;
        }
    }

    // =====================================================
    // QUEUE SAVE MEMORY (debounced auto-save)
    // Called after every message instead of an eager `await saveMemory()`
    // so a slow/heavy Memory Engine doesn't add latency to every chat
    // turn. Multiple calls within the debounce window coalesce into a
    // single save. Governed by config.autoSaveMode:
    //   "immediate" -> saves right away (old behavior, fire-and-forget)
    //   "debounced" -> waits config.autoSaveDebounceMs of quiet time (default)
    //   "manual"    -> does nothing; caller must call flushSaveMemory()
    // =====================================================

    queueSaveMemory() {

        if (!this.config.autoSave) {
            return;
        }

        if (this.config.autoSaveMode === "immediate") {
            // Fire-and-forget so callers don't have to await this path.
            this.saveMemory();
            return;
        }

        if (this.config.autoSaveMode === "manual") {
            return;
        }

        // "debounced" (default)
        if (this._saveTimer) {
            clearTimeout(this._saveTimer);
        }

        const delay = Number(this.config.autoSaveDebounceMs) || 1500;

        this._saveTimer = setTimeout(() => {
            this._saveTimer = null;
            this.saveMemory();
        }, delay);
    }

    // =====================================================
    // FLUSH SAVE MEMORY
    // Cancels any pending debounced save and saves immediately.
    // Used before shutdown, clearHistory, clearMemory, resetSession,
    // and importHistory so a debounced save is never silently lost.
    // =====================================================

    async flushSaveMemory() {

        if (this._saveTimer) {
            clearTimeout(this._saveTimer);
            this._saveTimer = null;
        }

        return await this.saveMemory();
    }

    // =====================================================
    // ADD HISTORY
    // =====================================================

    addHistory(role, content, metadata = {}) {
        const validRoles = ["user", "assistant", "system", "tool", "error"];

        if (!validRoles.includes(role)) {
            role = "system";
        }

        const text = this.normalizeInput(content);

        if (!text) {
            return null;
        }

        const entry = {
            id: "MSG-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7),
            role,
            content: text,
            timestamp: Date.now(),
            sessionID: this.sessionID,
            ...metadata
        };

        this.history.push(entry);

        this.trimHistory();

        this.emit("historyAdded", entry);

        // Keep the visible COMMAND HISTORY panel synchronized immediately,
        // including voice-originated messages that bypass renderer.js send().
        if (role === "user") {
            try {
                window.HistoryEngine?.add?.(text, { persist: true });
            } catch (error) {
                this.debug("History UI update failed:", error);
            }
        }

        return entry;
    }

    // =====================================================
    // SANITIZE HISTORY
    // =====================================================

    sanitizeHistory(history) {
        if (!Array.isArray(history)) {
            return [];
        }

        const validRoles = ["user", "assistant", "system", "tool", "error"];

        return history
            .filter(item => item && typeof item === "object")
            .map(item => {

                const role = validRoles.includes(item.role) ? item.role : "user";

                // IMPORTANT: raw imported fields are spread FIRST, then the
                // normalized/validated fields are applied on top — so an
                // imported document can't smuggle in a bogus id/role/content/
                // timestamp/sessionID that silently overrides the sanitized
                // values (the original bug had this backwards).
                return {
                    ...item,
                    id:
                        item.id ||
                        "MSG-" +
                            Date.now().toString(36) +
                            "-" +
                            Math.random().toString(36).slice(2, 7),
                    role,
                    content: this.normalizeInput(item.content ?? item.text ?? item.message ?? ""),
                    timestamp: item.timestamp || Date.now(),
                    sessionID: item.sessionID || this.sessionID
                };
            })
            .filter(item => Boolean(item.content));
    }

    // =====================================================
    // TRIM HISTORY
    // =====================================================

    trimHistory() {
        const limit = Number(this.config.maxHistory) || 500;

        if (this.history.length > limit) {
            this.history = this.history.slice(-limit);
        }
    }

    // =====================================================
    // GET HISTORY
    // =====================================================

    getHistory(limit = null) {
        if (!Array.isArray(this.history)) {
            return [];
        }

        if (!limit || limit <= 0) {
            return [...this.history];
        }

        return this.history.slice(-Number(limit));
    }

    // =====================================================
    // GET CHAT CONTEXT
    // =====================================================

    getChatContext(limit = 20) {
        return this.getHistory(limit).map(message => ({
            role: message.role,
            content: message.content
        }));
    }

    // =====================================================
    // CLEAR HISTORY
    // =====================================================

    async clearHistory(save = true) {
        this.history = [];

        this.runtime.lastResponse = null;
        this.runtime.lastRequest = null;

        if (save) {
            await this.flushSaveMemory();
        }

        this.emit("historyCleared", { timestamp: Date.now() });

        return true;
    }

    // =====================================================
    // CLEAR MEMORY
    // =====================================================

    async clearMemory() {
        try {
            this.history = [];
            this.context = {};

            // Explicit adapter contract (preferred)
            const adapter = this.config.memoryAdapter;

            if (adapter && this.isFunction(adapter.clear)) {

                try {
                    await adapter.clear(this.memoryKey);
                } catch (error) {
                    this.debug("memoryAdapter.clear failed:", error);
                }

            } else {

                // Memory Engine (duck-typed fallback)
                const memory = this.engines.memory;

                if (memory) {
                    const methods = ["clear", "clearMemory", "remove", "delete", "forget"];

                    for (const method of methods) {
                        if (this.isFunction(memory[method])) {
                            try {
                                await memory[method](this.memoryKey);
                                break;
                            } catch (error) {
                                this.debug("Memory clear method failed:", error);
                            }
                        }
                    }
                }
            }

            // localStorage
            if (typeof localStorage !== "undefined") {
                try {
                    localStorage.removeItem(this.memoryKey);
                } catch (_) {}
            }

            this.emit("memoryCleared", { timestamp: Date.now() });

            console.log("🧹 JARVIS Chat Memory Cleared");

            return true;
        } catch (error) {
            console.error("❌ Clear Memory Error:", error);
            return false;
        }
    }

    // =====================================================
    // EXPORT HISTORY
    // =====================================================

    exportHistory(format = "json") {
        const data = {
            name: this.name,
            version: this.version,
            sessionID: this.sessionID,
            exportedAt: Date.now(),
            history: this.history,
            context: this.context
        };

        // JSON
        if (String(format).toLowerCase() === "json") {
            return JSON.stringify(data, null, 2);
        }

        // TEXT
        if (String(format).toLowerCase() === "txt") {
            return this.history
                .map(
                    item =>
                        `[${new Date(item.timestamp).toLocaleString()}] ` +
                        `${item.role.toUpperCase()}: ` +
                        item.content
                )
                .join("\n\n");
        }

        // CSV
        if (String(format).toLowerCase() === "csv") {
            const escapeCSV = value => `"${String(value ?? "").replace(/"/g, '""')}"`;

            const rows = [
                ["ID", "Role", "Content", "Timestamp"],
                ...this.history.map(item => [
                    item.id,
                    item.role,
                    item.content,
                    new Date(item.timestamp).toISOString()
                ])
            ];

            return rows.map(row => row.map(escapeCSV).join(",")).join("\n");
        }

        return JSON.stringify(data, null, 2);
    }

    // =====================================================
    // IMPORT HISTORY
    // =====================================================

    async importHistory(input) {
        try {
            let data = input;

            if (typeof input === "string") {
                data = JSON.parse(input);
            }

            if (!data) {
                return false;
            }

            if (Array.isArray(data)) {
                this.history = this.sanitizeHistory(data);
            } else {
                this.restoreMemoryData(data);
            }

            this.trimHistory();

            await this.flushSaveMemory();

            this.emit("historyImported", { count: this.history.length });

            return true;
        } catch (error) {
            console.error("❌ Import History Error:", error);
            return false;
        }
    }

    // =====================================================
    // CONTEXT SET
    // =====================================================

    setContext(key, value, save = true) {
        if (!key) {
            return false;
        }

        this.context[String(key)] = value;

        if (save) {
            this.queueSaveMemory();
        }

        return true;
    }

    // =====================================================
    // CONTEXT GET
    // =====================================================

    getContext(key) {
        if (!key) {
            return { ...this.context };
        }

        return this.context[String(key)] ?? null;
    }

    // =====================================================
    // CONTEXT DELETE
    // =====================================================

    deleteContext(key, save = true) {
        if (!key) {
            return false;
        }

        delete this.context[String(key)];

        if (save) {
            this.queueSaveMemory();
        }

        return true;
    }

    // =====================================================
    // RESET CHAT SESSION
    // =====================================================

    async resetSession() {
        this.sessionID =
            "JARVIS-" +
            Date.now().toString(36) +
            "-" +
            Math.random().toString(36).slice(2, 8);

        this.createdAt = Date.now();
        this.lastActivity = Date.now();

        this.history = [];
        this.context = {};

        this.resetRuntime();

        await this.flushSaveMemory();

        this.emit("sessionReset", { sessionID: this.sessionID });

        console.log("🔄 JARVIS Chat Session Reset");

        return true;
    }

    // =====================================================
    // HEALTH CHECK
    // =====================================================

    healthCheck() {
        const connected = this.getConnectedEngineCount();

        return {
            healthy: this.initialized && !this._destroyed,
            online: this.booted,
            status: this.status,
            engines: connected,
            history: this.history.length,
            processing: this.processing,
            activeRequests: this.runtime.activeRequests,
            memory: {
                // Whether ANY durable persistence path exists at all.
                available: Boolean(
                    this.engines.memory ||
                    this.config.memoryAdapter ||
                    (typeof localStorage !== "undefined")
                ),
                adapterConfigured: Boolean(this.config.memoryAdapter),
                engineConnected: Boolean(this.engines.memory),
                localStorageAvailable: typeof localStorage !== "undefined",
                autoSaveMode: this.config.autoSaveMode,
                pendingSave: Boolean(this._saveTimer),
                historyEntries: this.history.length,
                factsStored: Array.isArray(this.context.facts) ? this.context.facts.length : 0
            },
            session: this.sessionID
        };
    }

    // =====================================================
    // FINAL SHUTDOWN
    // =====================================================

    async shutdown() {
        try {
            console.log("🛑 Shutting down Chat Engine...");

            this.cancel();
            this.stopSpeaking();

            await this.flushSaveMemory();

            this.processing = false;
            this.runtime.activeRequests = 0;
            this.runtime.cancelTokens.clear();

            this.booted = false;
            this.initialized = false;
            this.status = "offline";

            this.emit("shutdown", { timestamp: Date.now() });

            console.log("🔴 Chat Engine V12 OFFLINE");

            return true;
        } catch (error) {
            console.error("❌ Chat Shutdown Error:", error);
            return false;
        }
    }
}

// =========================================================
// GLOBAL EXPORT
// =========================================================

if (typeof window !== "undefined") {
    window.JARVISChat = JARVISChat;
}

// =========================================================
// SAFE SINGLETON CREATION
// =========================================================

if (typeof window !== "undefined") {
    try {
        if (!window.ChatEngine) {
            window.ChatEngine = new JARVISChat();
            console.log("✅ ChatEngine V12 Global Instance Created");
        }
    } catch (error) {
        console.error("❌ ChatEngine Global Creation Failed:", error);
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = JARVISChat;
}
