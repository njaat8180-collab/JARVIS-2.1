"use strict";

const {
    contextBridge,
    ipcRenderer
} = require("electron");

// ============================================================
// JARVIS PRO MAX
// PRELOAD.JS
// V13.1 PRODUCTION CLEAN SECURE BRIDGE
//
// AI: REMOVED
// contextIsolation: SUPPORTED
// nodeIntegration: NOT REQUIRED
//
// FEATURES:
// - Chat
// - Voice
// - Browser
// - System
// - Applications
// - Window Controls
// - Memory
// - Diagnostics
// - Events
// - Legacy Compatibility
// ============================================================

const PRELOAD_VERSION = "13.1.0";

let preloadReady = false;

// ============================================================
// IPC CHANNELS
// SINGLE SOURCE OF TRUTH
// ============================================================

const IPC = Object.freeze({

    // Chat
    CHAT_SAVE: "chat:save",
    CHAT_LOAD: "chat:load",
    CHAT_CLEAR: "chat:clear",

    AI_ASK: "ai:ask",
    CONSCIOUSNESS_STATE: "consciousness:state",
    CONSCIOUSNESS_RESPOND: "consciousness:respond",
    CONSCIOUSNESS_SET_GOAL: "consciousness:set-goal",
    CONSCIOUSNESS_COMPLETE_GOAL: "consciousness:complete-goal",
    CONSCIOUSNESS_THOUGHTS: "consciousness:thoughts",
    CONSCIOUSNESS_SET_STYLE: "consciousness:set-style",
    CONSCIOUSNESS_GET_STYLE: "consciousness:get-style",
    // Lets the local chat pipeline feed a finished user+response
    // turn into the consciousness layer, so mood/trust/goal-tracking/thought
    // stream keep working even with no cloud AI key configured at all.
    CONSCIOUSNESS_RECORD_TURN: "consciousness:record-turn",
    MEMORY_GET_FACTS: "memory:get-facts",
    MEMORY_REMEMBER_MESSAGE: "memory:remember-message",
    MEMORY_SEARCH: "memory:search",
    MEMORY_FORGET_STATEMENT: "memory:forget-statement",
    MEMORY_FORGET_KEY: "memory:forget-key",
    MEMORY_FORGET_TYPE: "memory:forget-type",
    MEMORY_FORGET_ALL: "memory:forget-all",
    MEMORY_FORGET_FACT: "memory:forget-fact",
    // PHASE 8 — additive long-term memory channels
    MEMORY_LIST: "memory:list",
    MEMORY_GET: "memory:get",
    MEMORY_STATS: "memory:stats",
    MEMORY_UPDATE: "memory:update",
    MEMORY_CLEAR: "memory:clear",

    // User System — multi-user management
    USER_LIST: "user:list",
    USER_GET_ACTIVE: "user:get-active",
    USER_CREATE: "user:create",
    USER_SWITCH: "user:switch",
    USER_GET_PROFILE: "user:get-profile",
    USER_UPDATE_PROFILE: "user:update-profile",
    USER_GET_PREFERENCES: "user:get-preferences",
    USER_UPDATE_PREFERENCES: "user:update-preferences",
    USER_GET_PRIVACY: "user:get-privacy",
    USER_UPDATE_PRIVACY: "user:update-privacy",
    USER_DELETE: "user:delete",
    USER_EXPORT: "user:export",
    USER_IMPORT: "user:import",
    USER_VERIFY_PIN: "user:verify-pin",
    USER_SET_PIN: "user:set-pin",
    USER_UPDATE_PIN: "user:update-pin",
    USER_REMOVE_PIN: "user:remove-pin",
    USER_HAS_PIN: "user:has-pin",
    USER_GET_ROLE: "user:get-role",
    USER_SET_ROLE: "user:set-role",
    USER_GET_ACTIVITY: "user:get-activity",
    USER_RECORD_MESSAGE: "user:record-message",
    USER_RECORD_VOICE: "user:record-voice",
    USER_RECORD_COMMAND: "user:record-command",
    USER_GET_STORAGE: "user:get-storage",
    USER_MERGE: "user:merge",
    USER_LOCK_SESSION: "user:lock-session",
    USER_UNLOCK_SESSION: "user:unlock-session",
    USER_GET_SESSION: "user:get-session",
    USER_TOUCH_SESSION: "user:touch-session",
    USER_MEMORY_TOP: "user:memory-top",
    USER_MEMORY_REINFORCE: "user:memory-reinforce",
    USER_MEMORY_STALE: "user:memory-stale",
    USER_MEMORY_SCORE: "user:memory-score",
    USER_MEMORY_FACTS: "user:memory-facts",
    USER_MEMORY_REMEMBER: "user:memory-remember",
    USER_MEMORY_SEARCH: "user:memory-search",
    USER_MEMORY_FORGET: "user:memory-forget",
    USER_MEMORY_FORGET_ALL: "user:memory-forget-all",
    USER_MEMORY_STATS: "user:memory-stats",
    USER_CONTEXT: "user:context",

    // Wikipedia
    WIKIPEDIA_SUMMARY: "wikipedia:summary",
    WIKIPEDIA_ON_THIS_DAY: "wikipedia:on-this-day",

    // Offline knowledge cache (text + images from any web source)
    KNOWLEDGE_IS_ONLINE: "knowledge:is-online",
    KNOWLEDGE_CACHE_SEARCH: "knowledge:cache-search",
    KNOWLEDGE_CACHE_STATS: "knowledge:cache-stats",
    KNOWLEDGE_STRUCTURED_STATS: "knowledge:structured-stats",
    KNOWLEDGE_CACHE_CLEAR: "knowledge:cache-clear",

    // File explorer
    FILES_LIST: "files:list",
    PLATFORM_INFO: "platform:info",

    // Mistake-learning ledger
    LEARNING_RECORD_MISTAKE: "learning:record-mistake",
    LEARNING_FIND_LESSON: "learning:find-lesson",
    LEARNING_GET_ALL: "learning:get-all",
    LEARNING_CLEAR: "learning:clear",
    LEARNING_RESEARCH_ONCE: "learning:research-once",

    // Autonomous background knowledge learning
    BACKGROUND_LEARNING_STATUS: "background-learning:status",
    BACKGROUND_LEARNING_START: "background-learning:start",
    BACKGROUND_LEARNING_STOP: "background-learning:stop",
    BACKGROUND_LEARNING_ENABLE: "background-learning:enable",
    BACKGROUND_LEARNING_DISABLE: "background-learning:disable",
    BACKGROUND_LEARNING_CYCLE: "background-learning:cycle",
    BACKGROUND_LEARNING_CONFIGURE: "background-learning:configure",
    BACKGROUND_LEARNING_KNOWLEDGE_SEARCH: "background-learning:knowledge-search",
    BACKGROUND_LEARNING_EVENT: "background-learning:event",

    // Proactive suggestions
    SUGGESTIONS_GET: "suggestions:get",

    // Evolution / Self-Improvement system (Phase 2 goal registry, Phase 3
    // checkpoint, Phase 4 Background Evolution Engine). None of these were
    // previously exposed to the renderer — added here so SystemController's
    // `evolution` module slot has something real to call.
    EVOLUTION_GET_GOALS: "evolution:get-goals",
    EVOLUTION_GET_GOAL: "evolution:get-goal",
    EVOLUTION_GET_SUMMARY: "evolution:get-summary",
    EVOLUTION_UPDATE_GOAL: "evolution:update-goal",
    EVOLUTION_GET_CHECKPOINT: "evolution:get-checkpoint",
    EVOLUTION_UPDATE_CHECKPOINT: "evolution:update-checkpoint",
    EVOLUTION_RESET_CHECKPOINT: "evolution:reset-checkpoint",
    EVOLUTION_GET_STATE: "evolution:get-state",
    EVOLUTION_START: "evolution:start",
    EVOLUTION_PAUSE: "evolution:pause",
    EVOLUTION_RESUME: "evolution:resume",
    EVOLUTION_ENABLE_PERMISSION: "evolution:enable-permission",
    EVOLUTION_DISABLE_PERMISSION: "evolution:disable-permission",
    EVOLUTION_APPROVE_PROPOSAL: "evolution:approve-proposal",
    EVOLUTION_REJECT_PROPOSAL: "evolution:reject-proposal",
    EVOLUTION_GET_PROPOSALS: "evolution:get-proposals",
    EVOLUTION_GET_HISTORY: "evolution:get-history",

    // External data sources
    WIKIDATA_SEARCH: "wikidata:search",
    COUNTRY_INFO: "country:info",
    LOCATION_SEARCH: "location:search",
    WEATHER_CURRENT: "weather:current",
    WEATHER_FORECAST: "weather:forecast",
    BOOKS_SEARCH: "books:search",
    TV_SEARCH: "tv:search",
    RECIPE_SEARCH: "recipe:search",
    POKEMON_INFO: "pokemon:info",
    NEWS_SEARCH: "news:search",
    CURRENCY_CONVERT: "currency:convert",
    TIME_ZONE: "time:zone",
    COMMONS_IMAGE_SEARCH: "commons:image-search",
    COMMONS_VIDEO_SEARCH: "commons:video-search",
    GITHUB_SEARCH_REPOS: "github:search-repos",
    GITHUB_USER: "github:user",
    DBPEDIA_LOOKUP: "dbpedia:lookup",
    GEONAMES_INFO: "geonames:info",
    AIR_QUALITY: "air:quality",
    EARTHQUAKES_RECENT: "earthquakes:recent",
    NASA_APOD: "nasa:apod",
    WORLDBANK_INDICATOR: "worldbank:indicator",
    RESEARCH_SEARCH: "research:search",
    PRODUCT_RESEARCH: "product:research",
    CROSSREF_SEARCH: "crossref:search",
    ANIME_SEARCH: "anime:search",
    ANILIST_SEARCH: "anilist:search",
    FOOD_SEARCH: "food:search",
    GITLAB_SEARCH: "gitlab:search",
    NPM_PACKAGE: "npm:package",
    PYPI_PACKAGE: "pypi:package",
    STACKOVERFLOW_SEARCH: "stackoverflow:search",
    HACKERNEWS_SEARCH: "hackernews:search",
    FLIGHTS_NEAR: "flights:near",
    DND_SEARCH: "dnd:search",
    ARCHIVE_SEARCH: "archive:search",
    GLOBALEVENTS_SEARCH: "globalevents:search",

    // Voice
    VOICE_START: "voice:start",
    VOICE_STOP: "voice:stop",
    VOICE_TRANSCRIBE: "voice:transcribe",
    VOICE_MODEL_STATUS: "voice:model-status",
    VOICE_SEND: "voice:send",
    VOICE_TRANSCRIPT: "voice:transcript",
    VOICE_SPEAK: "voice:speak",
    VOICE_STOP_SPEAKING: "voice:stop-speaking",
    VOICE_SPEAK_CLONED: "voice:speak-cloned",
    VOICE_GET_MY_VOICE_SETTINGS: "voice:get-my-voice-settings",
    VOICE_SET_MY_VOICE_SETTINGS: "voice:set-my-voice-settings",

    // XTTS-v2 (primary offline TTS engine)
    VOICE_XTTS_STATUS: "voice:xtts-status",
    VOICE_XTTS_SETTINGS: "voice:xtts-settings",
    VOICE_XTTS_TEST: "voice:xtts-test",
    VOICE_SAPI_VOICES: "voice:sapi-voices",
    VOICE_ENGINE_MIGRATION_STATUS: "voice:engine-migration-status",
    VOICE_ENGINE_MIGRATION_PREFLIGHT: "voice:engine-migration-preflight",
    VOICE_ENGINE_MIGRATION_REQUEST: "voice:engine-migration-request",
    VOICE_ENGINE_MIGRATION_CLEANUP: "voice:engine-migration-cleanup",

    // Whisper setup/download progress (main → renderer events)
    VOICE_MODEL_DOWNLOAD: "voice:model-download",

    // Ollama (optional LOCAL AI — conversation only)
    OLLAMA_STATUS: "ollama:status",
    OLLAMA_MODELS: "ollama:models",
    OLLAMA_SET_MODEL: "ollama:set-model",
    OLLAMA_SET_ENABLED: "ollama:set-enabled",
    OLLAMA_CHAT: "ollama:chat",
    AI_PROVIDER_GET: "ai-provider:get",
    AI_PROVIDER_HEALTH: "ai-provider:health",
    AI_PROVIDER_SAVE: "ai-provider:save",
    AI_PROVIDER_GROK_SARVAM_VOICE: "ai-provider:grok-sarvam-voice",
    AI_PROVIDER_TEST: "ai-provider:test",
    AI_PROVIDER_VISION: "ai-provider:vision",
    AI_PROVIDER_GENERATE_IMAGE: "ai-provider:generate-image",
    AI_PROVIDER_PRIVACY_SAVE: "ai-provider:privacy-save",
    AI_PROVIDER_PRIVACY_CLEAR: "ai-provider:privacy-clear",
    BACKGROUND_JOBS_LIST: "background-jobs:list",
    BACKGROUND_JOBS_CANCEL: "background-jobs:cancel",

    // Persistent local Notification Center
    NOTIFICATIONS_LIST: "notifications:list",
    NOTIFICATIONS_UNREAD: "notifications:unread-count",
    NOTIFICATIONS_MARK_READ: "notifications:mark-read",
    NOTIFICATIONS_MARK_ALL_READ: "notifications:mark-all-read",
    NOTIFICATIONS_CLEAR: "notifications:clear",
    NOTIFICATIONS_STATS: "notifications:stats",

    // Info Utilities
    SYSTEM_INFO: "system:info",
    SYSTEM_SET_VOLUME: "system:set-volume",

    // Browser (external — opens in the OS default browser)
    BROWSER_OPEN_URL: "browser:open-url",

    // Browser (embedded — in-app tabbed browser, BrowserView-backed)
    BROWSER_NEW_TAB: "browser:new-tab",
    BROWSER_CLOSE_TAB: "browser:close-tab",
    BROWSER_SWITCH_TAB: "browser:switch-tab",
    BROWSER_NAVIGATE: "browser:navigate",
    BROWSER_YOUTUBE_PLAY: "browser:youtube-play",
    BROWSER_COMPARE_SHOPPING: "browser:compare-shopping",
    BROWSER_GO_BACK: "browser:go-back",
    BROWSER_GO_FORWARD: "browser:go-forward",
    BROWSER_RELOAD: "browser:reload",
    BROWSER_STOP: "browser:stop",
    BROWSER_GET_TABS: "browser:get-tabs",
    BROWSER_SET_BOUNDS: "browser:set-bounds",
    BROWSER_SET_VISIBLE: "browser:set-visible",
    BROWSER_TAB_EVENT: "browser:tab-event",

    // Bookmarks
    BOOKMARKS_ADD: "bookmarks:add",
    BOOKMARKS_REMOVE: "bookmarks:remove",
    BOOKMARKS_LIST: "bookmarks:list",
    BOOKMARKS_IS_BOOKMARKED: "bookmarks:is-bookmarked",

    // History
    HISTORY_LIST: "history:list",
    HISTORY_SEARCH: "history:search",
    HISTORY_DELETE: "history:delete",
    HISTORY_CLEAR: "history:clear",

    // Page tools
    BROWSER_ZOOM_IN: "browser:zoom-in",
    BROWSER_ZOOM_OUT: "browser:zoom-out",
    BROWSER_ZOOM_RESET: "browser:zoom-reset",
    BROWSER_GET_ZOOM: "browser:get-zoom",
    BROWSER_PRINT: "browser:print",
    BROWSER_SAVE_PAGE: "browser:save-page",
    BROWSER_FIND: "browser:find",
    BROWSER_FIND_STOP: "browser:find-stop",

    // Downloads
    DOWNLOADS_LIST: "downloads:list",
    DOWNLOADS_PAUSE: "downloads:pause",
    DOWNLOADS_RESUME: "downloads:resume",
    DOWNLOADS_CANCEL: "downloads:cancel",
    DOWNLOADS_OPEN_FILE: "downloads:open-file",
    DOWNLOADS_SHOW_IN_FOLDER: "downloads:show-in-folder",
    DOWNLOADS_CLEAR: "downloads:clear",
    DOWNLOADS_EVENT: "downloads:event",

    // File Management
    FILE_SEARCH: "file:search",
    FILE_OPEN: "file:open",
    FILE_CREATE: "file:create",
    FILE_CREATE_FOLDER: "file:create-folder",
    FILE_RENAME: "file:rename",
    FILE_MOVE: "file:move",
    FILE_DELETE: "file:delete",
    FILE_READ: "file:read",
    PHOTO_MATCH_PREVIEW: "photo:match-preview",
    PHOTO_ORGANIZE_MATCHES: "photo:organize-matches",
    PHOTO_PICK_REFERENCE: "photo:pick-reference",
    PHOTO_PICK_FOLDER: "photo:pick-folder",
    CHAT_FILE_PICK_READ: "chat:file-pick-read",

    // System
    SYSTEM_OPEN_APP: "system:open-app",
    SYSTEM_CLOSE_APPS: "system:close-apps",
    SYSTEM_LIST_APPS: "system:list-apps",
    SYSTEM_LAUNCH_APP_ENTRY: "system:launch-app-entry",
    SYSTEM_ADD_APP: "system:add-app",
    SYSTEM_CHROME: "system:chrome",
    SYSTEM_VSCODE: "system:vscode",
    SYSTEM_NOTEPAD: "system:notepad",
    SYSTEM_CALCULATOR: "system:calculator",
    SYSTEM_EXPLORER: "system:explorer",
    SYSTEM_SETTINGS: "system:settings",
    SYSTEM_CHANGE_PLAN: "system:change-plan",
    SYSTEM_DOWNLOADS_CLEANUP_PLAN: "system:downloads-cleanup-plan",
    SYSTEM_BACKUP_PLAN: "system:backup-plan",
    SYSTEM_PHOTO_LABEL: "system:photo-label",
    SYSTEM_PC_DOCTOR_SCAN: "system:pc-doctor-scan",
    SYSTEM_PC_DOCTOR_APPLY: "system:pc-doctor-apply",
    SYSTEM_ORGANIZE_DESKTOP_IMAGES: "system:organize-desktop-images",
    SYSTEM_PATHS: "system:paths",

    // Bounded Computer Use — mouse/keyboard primitives, session-gated.
    COMPUTER_USE_START: "computer-use:start",
    COMPUTER_USE_STOP: "computer-use:stop",
    COMPUTER_USE_STATUS: "computer-use:status",
    COMPUTER_USE_ACTION: "computer-use:action",
    COMPUTER_USE_INSPECT_UI: "computer-use:inspect-ui",
    SCREEN_SHARE_CAPTURE: "screen-share:capture",

    // Power
    SYSTEM_SHUTDOWN: "system:shutdown",
    SYSTEM_SCHEDULE_SHUTDOWN: "system:schedule-shutdown",
    SYSTEM_GET_SCHEDULED_SHUTDOWN: "system:get-scheduled-shutdown",
    SYSTEM_CANCEL_SCHEDULED_SHUTDOWN: "system:cancel-scheduled-shutdown",
    SYSTEM_RESTART: "system:restart",
    SYSTEM_SLEEP: "system:sleep",
    SYSTEM_LOCK: "system:lock",
    SYSTEM_LOGOFF: "system:logoff",

    // Window
    WINDOW_MINIMIZE: "window:minimize",
    WINDOW_MAXIMIZE: "window:maximize",
    WINDOW_CLOSE: "window:close"
});

// ============================================================
// SAFE IPC INVOKE
// ============================================================

async function invoke(channel, ...args) {

    try {

        if (!channel) {
            throw new Error("IPC channel is required.");
        }

        return await ipcRenderer.invoke(
            channel,
            ...args
        );

    } catch (error) {

        console.error(
            "❌ IPC Invoke Error:",
            channel,
            error
        );

        return {
            success: false,
            error: error?.message || String(error),
            channel
        };
    }
}

// ============================================================
// SAFE IPC SEND
// ============================================================

function send(channel, ...args) {

    try {

        if (!channel) {
            throw new Error("IPC channel is required.");
        }

        ipcRenderer.send(
            channel,
            ...args
        );

        return true;

    } catch (error) {

        console.error(
            "❌ IPC Send Error:",
            channel,
            error
        );

        return false;
    }
}

// ============================================================
// SAFE IPC LISTENER
// ============================================================

function listen(channel, callback) {

    if (
        !channel ||
        typeof callback !== "function"
    ) {
        return () => {};
    }

    const listener = (
        event,
        ...args
    ) => {

        try {

            callback(...args);

        } catch (error) {

            console.error(
                "❌ IPC Event Callback Error:",
                channel,
                error
            );
        }
    };

    ipcRenderer.on(
        channel,
        listener
    );

    return () => {

        try {

            ipcRenderer.removeListener(
                channel,
                listener
            );

        } catch (error) {

            console.error(
                "❌ IPC Listener Remove Error:",
                error
            );
        }
    };
}

// ============================================================
// CHAT API
// ============================================================

const ChatAPI = Object.freeze({

    save(data) {

        return invoke(
            IPC.CHAT_SAVE,
            data
        );
    },

    load() {

        return invoke(
            IPC.CHAT_LOAD
        );
    },

    clear() {

        return invoke(
            IPC.CHAT_CLEAR
        );
    }
});

// ============================================================
// AI / CONSCIOUSNESS API
// ============================================================
const AIAPI = Object.freeze({
    ask(message, context = {}) { return invoke(IPC.AI_ASK, String(message || ""), context); },
    onReplyToken(callback) { return listen("ai:reply-token", callback); },
    consciousnessState() { return invoke(IPC.CONSCIOUSNESS_STATE); },
    consciousnessRespond(message) { return invoke(IPC.CONSCIOUSNESS_RESPOND, String(message || "")); },
    setGoal(goal) { return invoke(IPC.CONSCIOUSNESS_SET_GOAL, String(goal || "")); },
    completeGoal() { return invoke(IPC.CONSCIOUSNESS_COMPLETE_GOAL); },
    getThoughts(limit) { return invoke(IPC.CONSCIOUSNESS_THOUGHTS, limit); },
    // Personality response styles: "professional" | "friendly" | "witty" | "concise" | "formal"
    setPersonalityStyle(style) { return invoke(IPC.CONSCIOUSNESS_SET_STYLE, String(style || "")); },
    getPersonalityStyle() { return invoke(IPC.CONSCIOUSNESS_GET_STYLE); },
    // No cloud call — just tells the consciousness layer "this
    // user message + this response happened" so mood/trust/continuity/
    // thought-stream advance from the LOCAL brain/router's own replies too.
    recordTurn(userMessage, response) {
        return invoke(IPC.CONSCIOUSNESS_RECORD_TURN, String(userMessage || ""), String(response || ""));
    },
    getMemoryFacts() { return invoke(IPC.MEMORY_GET_FACTS); },
    rememberMemoryMessage(message) { return invoke(IPC.MEMORY_REMEMBER_MESSAGE, String(message || "")); },
    searchMemory(query, limit) { return invoke(IPC.MEMORY_SEARCH, String(query || ""), limit); },
    forgetMemoryStatement(statement) { return invoke(IPC.MEMORY_FORGET_STATEMENT, String(statement || "")); },
    forgetMemoryKey(key) { return invoke(IPC.MEMORY_FORGET_KEY, String(key || "")); },
    forgetMemoryType(type) { return invoke(IPC.MEMORY_FORGET_TYPE, String(type || "")); },
    forgetAllMemory(confirm) { return invoke(IPC.MEMORY_FORGET_ALL, confirm === true); },
    forgetMemoryFact(key) { return invoke(IPC.MEMORY_FORGET_FACT, String(key || "")); },
    // PHASE 8 — additive long-term memory API
    listMemory(options) { return invoke(IPC.MEMORY_LIST, options && typeof options === "object" ? options : {}); },
    getMemory(key) { return invoke(IPC.MEMORY_GET, String(key || "")); },
    getMemoryStats() { return invoke(IPC.MEMORY_STATS); },
    updateMemory(key, patch) { return invoke(IPC.MEMORY_UPDATE, String(key || ""), patch && typeof patch === "object" ? patch : {}); },
    clearAllMemory(confirm) { return invoke(IPC.MEMORY_CLEAR, confirm === true); }
});

// ============================================================
// WIKIPEDIA API
// ============================================================

const WikipediaAPI = Object.freeze({

    summary(query, lang) {
        return invoke(IPC.WIKIPEDIA_SUMMARY, String(query || ""), lang);
    },

    onThisDay(options = {}) {
        return invoke(IPC.WIKIPEDIA_ON_THIS_DAY, options);
    }
});

// ============================================================
// OFFLINE KNOWLEDGE CACHE API
// Everything Jarvis has ever fetched from Wikipedia or any of
// the sources in dataSources.js (text + images) gets saved to
// disk automatically. This lets the UI check connectivity,
// browse/search that saved-for-offline library, and manage it.
// ============================================================

const KnowledgeCacheAPI = Object.freeze({
    isOnline() {
        return invoke(IPC.KNOWLEDGE_IS_ONLINE);
    },

    search(query, limit) {
        return invoke(IPC.KNOWLEDGE_CACHE_SEARCH, String(query || ""), limit);
    },

    stats() {
        return invoke(IPC.KNOWLEDGE_CACHE_STATS);
    },

    structuredStats() {
        return invoke(IPC.KNOWLEDGE_STRUCTURED_STATS);
    },

    clear() {
        return invoke(IPC.KNOWLEDGE_CACHE_CLEAR);
    }
});

// ============================================================
// MISTAKE-LEARNING API
// "Jarvis apni galtiyon se seekhe" — records corrections and
// looks them up so the same mistake isn't repeated.
// ============================================================

const LearningAPI = Object.freeze({
    recordMistake(data = {}) {
        return invoke(IPC.LEARNING_RECORD_MISTAKE, data);
    },

    findLesson(message) {
        return invoke(IPC.LEARNING_FIND_LESSON, String(message || ""));
    },

    getAll(limit) {
        return invoke(IPC.LEARNING_GET_ALL, limit);
    },

    clear() {
        return invoke(IPC.LEARNING_CLEAR);
    },

    researchOnce(options = {}) {
        return invoke(IPC.LEARNING_RESEARCH_ONCE, {
            googleApiKey: String(options.googleApiKey || "").slice(0, 120),
            googleCx: String(options.googleCx || "").slice(0, 200)
        });
    }
});

// ============================================================
// BACKGROUND LEARNING API
// ============================================================

const BackgroundLearningAPI = Object.freeze({

    status() {
        return invoke(IPC.BACKGROUND_LEARNING_STATUS);
    },

    start() {
        return invoke(IPC.BACKGROUND_LEARNING_START);
    },

    stop() {
        return invoke(IPC.BACKGROUND_LEARNING_STOP);
    },

    enable() {
        return invoke(IPC.BACKGROUND_LEARNING_ENABLE);
    },

    disable() {
        return invoke(IPC.BACKGROUND_LEARNING_DISABLE);
    },

    cycle() {
        return invoke(IPC.BACKGROUND_LEARNING_CYCLE);
    },

    configure(config = {}) {
        return invoke(IPC.BACKGROUND_LEARNING_CONFIGURE, config);
    },

    searchKnowledge(query = "", limit = 20) {
        return invoke(
            IPC.BACKGROUND_LEARNING_KNOWLEDGE_SEARCH,
            String(query || ""),
            limit
        );
    },

    onEvent(callback) {
        return listen(IPC.BACKGROUND_LEARNING_EVENT, callback);
    }
});

// ============================================================
// SUGGESTIONS API
// Jarvis proactively suggests useful next questions, based on
// the current conversation and time of day.
// ============================================================

const SuggestionsAPI = Object.freeze({
    get(context = {}) {
        return invoke(IPC.SUGGESTIONS_GET, context);
    }
});

// ============================================================
// EVOLUTION / SELF-IMPROVEMENT API
// Read/update access to the Phase 2 goal registry + Phase 3
// checkpoint, and control of the Phase 4 Background Evolution
// Engine (start/pause/resume, the per-session approval gate, and
// proposal approve/reject). Applying a change ALWAYS requires the
// session permission to be enabled AND the specific proposal to
// be approved — this bridge does not add any way around that.
// ============================================================

const EvolutionAPI = Object.freeze({
    // Phase 2 — goal registry
    getGoals() { return invoke(IPC.EVOLUTION_GET_GOALS); },
    getGoal(goalId) { return invoke(IPC.EVOLUTION_GET_GOAL, String(goalId || "")); },
    getSummary() { return invoke(IPC.EVOLUTION_GET_SUMMARY); },
    updateGoal(goalId, updates = {}) { return invoke(IPC.EVOLUTION_UPDATE_GOAL, String(goalId || ""), updates); },

    // Phase 3 — checkpoint
    getCheckpoint() { return invoke(IPC.EVOLUTION_GET_CHECKPOINT); },
    updateCheckpoint(updates = {}) { return invoke(IPC.EVOLUTION_UPDATE_CHECKPOINT, updates); },
    resetCheckpoint() { return invoke(IPC.EVOLUTION_RESET_CHECKPOINT); },

    // Phase 4 — Background Evolution Engine
    getEngineState() { return invoke(IPC.EVOLUTION_GET_STATE); },
    start() { return invoke(IPC.EVOLUTION_START); },
    pause() { return invoke(IPC.EVOLUTION_PAUSE); },
    resume() { return invoke(IPC.EVOLUTION_RESUME); },
    enablePermission() { return invoke(IPC.EVOLUTION_ENABLE_PERMISSION); },
    disablePermission() { return invoke(IPC.EVOLUTION_DISABLE_PERMISSION); },
    approveProposal(proposalId) { return invoke(IPC.EVOLUTION_APPROVE_PROPOSAL, String(proposalId || "")); },
    rejectProposal(proposalId, reason) {
        return invoke(IPC.EVOLUTION_REJECT_PROPOSAL, String(proposalId || ""), String(reason || ""));
    },
    getProposals() { return invoke(IPC.EVOLUTION_GET_PROPOSALS); },
    getHistory() { return invoke(IPC.EVOLUTION_GET_HISTORY); }
});

// ============================================================
// EXTERNAL DATA SOURCES API
// (Wikidata, REST Countries, OSM/Nominatim, Open-Meteo,
//  Open Library, TVmaze, TheMealDB, PokéAPI, News RSS,
//  Frankfurter, WorldTimeAPI, Wikimedia Commons, GitHub)
// ============================================================

const DataSourcesAPI = Object.freeze({

    productResearch(query) {
        return invoke(IPC.PRODUCT_RESEARCH, String(query || "").slice(0, 180));
    },

    // Wikidata — facts / people / places / entities
    wikidataSearch(query, lang) {
        return invoke(IPC.WIKIDATA_SEARCH, String(query || ""), lang);
    },

    // REST Countries — country information
    countryInfo(name) {
        return invoke(IPC.COUNTRY_INFO, String(name || ""));
    },

    // OpenStreetMap / Nominatim — location / address / nearby places
    locationSearch(query, limit) {
        return invoke(IPC.LOCATION_SEARCH, String(query || ""), limit);
    },

    // Open-Meteo — weather
    weather(location) {
        return invoke(IPC.WEATHER_CURRENT, String(location || ""));
    },

    weatherForecast(location, daysAhead) {
        return invoke(IPC.WEATHER_FORECAST, String(location || ""), daysAhead);
    },

    // Open Library — books / authors
    bookSearch(query) {
        return invoke(IPC.BOOKS_SEARCH, String(query || ""));
    },

    // TVmaze — TV shows / episodes
    tvSearch(query) {
        return invoke(IPC.TV_SEARCH, String(query || ""));
    },

    // TheMealDB — recipes / meals
    recipeSearch(query) {
        return invoke(IPC.RECIPE_SEARCH, String(query || ""));
    },

    // PokéAPI — Pokémon information
    pokemonInfo(name) {
        return invoke(IPC.POKEMON_INFO, String(name || ""));
    },

    // Google News RSS — news search
    newsSearch(query, limit) {
        return invoke(IPC.NEWS_SEARCH, String(query || ""), limit);
    },

    // Frankfurter — currency exchange (ECB data)
    currencyConvert(amount, from, to) {
        return invoke(IPC.CURRENCY_CONVERT, amount, String(from || ""), String(to || ""));
    },

    // WorldTimeAPI — time / timezone
    timeForZone(zone) {
        return invoke(IPC.TIME_ZONE, String(zone || ""));
    },

    // Wikimedia Commons — images
    imageSearch(query, limit) {
        return invoke(IPC.COMMONS_IMAGE_SEARCH, String(query || ""), limit);
    },

    videoSearch(query, limit) {
        return invoke(IPC.COMMONS_VIDEO_SEARCH, String(query || ""), limit);
    },

    // GitHub API — repositories / users
    githubSearchRepos(query, limit) {
        return invoke(IPC.GITHUB_SEARCH_REPOS, String(query || ""), limit);
    },

    githubUser(username) {
        return invoke(IPC.GITHUB_USER, String(username || ""));
    },

    // DBpedia — Wikipedia structured data
    dbpediaLookup(term) {
        return invoke(IPC.DBPEDIA_LOOKUP, String(term || ""));
    },

    // GeoNames — geographical information (needs GEONAMES_USERNAME env)
    geoNamesInfo(place) {
        return invoke(IPC.GEONAMES_INFO, String(place || ""));
    },

    // OpenAQ — air quality
    airQuality(city) {
        return invoke(IPC.AIR_QUALITY, String(city || ""));
    },

    // USGS — earthquakes / geology
    recentEarthquakes(minMagnitude, limit) {
        return invoke(IPC.EARTHQUAKES_RECENT, minMagnitude, limit);
    },

    // NASA — Astronomy Picture of the Day
    nasaApod() {
        return invoke(IPC.NASA_APOD);
    },

    // World Bank — world economy / development
    worldBankIndicator(countryCode, indicator) {
        return invoke(IPC.WORLDBANK_INDICATOR, String(countryCode || ""), indicator);
    },

    // OpenAlex — research papers
    researchSearch(query, limit) {
        return invoke(IPC.RESEARCH_SEARCH, String(query || ""), limit);
    },

    // Crossref — academic publications
    crossrefSearch(query, limit) {
        return invoke(IPC.CROSSREF_SEARCH, String(query || ""), limit);
    },

    // Jikan — anime / manga
    animeSearch(query, limit) {
        return invoke(IPC.ANIME_SEARCH, String(query || ""), limit);
    },

    // AniList — anime / manga database
    anilistSearch(query, limit) {
        return invoke(IPC.ANILIST_SEARCH, String(query || ""), limit);
    },

    // Open Food Facts — food products / ingredients
    foodSearch(query, limit) {
        return invoke(IPC.FOOD_SEARCH, String(query || ""), limit);
    },

    // GitLab — projects
    gitlabSearch(query, limit) {
        return invoke(IPC.GITLAB_SEARCH, String(query || ""), limit);
    },

    // NPM Registry — package info
    npmPackage(name) {
        return invoke(IPC.NPM_PACKAGE, String(name || ""));
    },

    // PyPI — Python package info
    pypiPackage(name) {
        return invoke(IPC.PYPI_PACKAGE, String(name || ""));
    },

    // Stack Exchange — Stack Overflow Q&A search
    stackOverflowSearch(query, limit) {
        return invoke(IPC.STACKOVERFLOW_SEARCH, String(query || ""), limit);
    },

    // Hacker News (Algolia) — tech news / discussions
    hackerNewsSearch(query, limit) {
        return invoke(IPC.HACKERNEWS_SEARCH, String(query || ""), limit);
    },

    // OpenSky Network — live flight / aircraft tracking
    flightsNear(lat, lon, radiusDeg) {
        return invoke(IPC.FLIGHTS_NEAR, lat, lon, radiusDeg);
    },

    // Open5e — D&D 5e SRD content
    dndSearch(kind, name) {
        return invoke(IPC.DND_SEARCH, String(kind || ""), String(name || ""));
    },

    // Internet Archive — archived media / text search
    archiveSearch(query, limit) {
        return invoke(IPC.ARCHIVE_SEARCH, String(query || ""), limit);
    },

    // GDELT — global news / world events
    globalEventsSearch(query, limit) {
        return invoke(IPC.GLOBALEVENTS_SEARCH, String(query || ""), limit);
    }
});

// ============================================================
// VOICE API
// ============================================================

const VoiceAPI = Object.freeze({

    getDuplexConfig() { return invoke("voice:duplex-config"); },

    start() {

        return send(
            IPC.VOICE_START
        );
    },

    stop() {

        return invoke(
            IPC.VOICE_STOP
        );
    },

    transcribe(samples, options = {}) {

        return invoke(
            IPC.VOICE_TRANSCRIBE,
            samples,
            options
        );
    },

    modelStatus() {

        return invoke(
            IPC.VOICE_MODEL_STATUS
        );
    },

    send(text) {

        return send(
            IPC.VOICE_SEND,
            String(text || "")
        );
    },

    onTranscript(callback) {

        return listen(
            IPC.VOICE_TRANSCRIPT,
            callback
        );
    },

    // Whisper runtime/model setup + download progress events
    // (payload: { type: "whisper-model"|"whisper-exe",
    //             status: "DOWNLOADING"|"READY"|"ERROR"|"EXTRACTING",
    //             percent?, detail? })
    onModelDownload(callback) {
        return listen(IPC.VOICE_MODEL_DOWNLOAD, callback);
    },

    transcript(callback) {

        return listen(
            IPC.VOICE_TRANSCRIPT,
            callback
        );
    },

    speak(text, options = {}) {

        return invoke(
            IPC.VOICE_SPEAK,
            String(text || ""),
            options
        );
    },

    stopSpeaking() {
        return invoke(IPC.VOICE_STOP_SPEAKING);
    },

    // ------------------------------------------------------------
    // MY VOICE (local cloned voice) — see scripts/voice_clone_server.py
    // ------------------------------------------------------------

    speakCloned(text, options = {}) {
        return invoke(
            IPC.VOICE_SPEAK_CLONED,
            String(text || ""),
            options
        );
    },

    getMyVoiceSettings() {
        return invoke(IPC.VOICE_GET_MY_VOICE_SETTINGS);
    },

    setMyVoiceSettings(settings = {}) {
        return invoke(IPC.VOICE_SET_MY_VOICE_SETTINGS, settings);
    },

    // ------------------------------------------------------------
    // XTTS-v2 — Primary offline TTS engine with voice cloning
    // ------------------------------------------------------------
    xttsStatus() {
        return invoke(IPC.VOICE_XTTS_STATUS);
    },

    xttsSettings(settings) {
        return invoke(IPC.VOICE_XTTS_SETTINGS, settings);
    },

    xttsTest(language = "auto") {
        return invoke(IPC.VOICE_XTTS_TEST, String(language || "auto"));
    },

    sapiVoices() {
        return invoke(IPC.VOICE_SAPI_VOICES);
    },

    engineMigrationStatus() { return invoke(IPC.VOICE_ENGINE_MIGRATION_STATUS); },
    engineMigrationPreflight(target) { return invoke(IPC.VOICE_ENGINE_MIGRATION_PREFLIGHT, String(target || "")); },
    engineMigrationRequest(target, options = {}) { return invoke(IPC.VOICE_ENGINE_MIGRATION_REQUEST, String(target || ""), options); },
    engineMigrationCleanup(engine, options = {}) { return invoke(IPC.VOICE_ENGINE_MIGRATION_CLEANUP, String(engine || ""), options); }
});

// ============================================================
// OLLAMA API — OPTIONAL LOCAL AI (conversation only)
// ------------------------------------------------------------
// No cloud, no API key. Every method degrades gracefully when
// Ollama is absent: the renderer shows "LOCAL AI OFFLINE" and the
// deterministic JARVIS pipeline keeps working.
// chat() output is plain text — never executed, never an OS action.
// ============================================================

const OllamaAPI = Object.freeze({

    // Health: { installed, running, models, selectedModel, error }
    // "running" is a REAL server probe, not an executable check.
    status(force = false) {
        return invoke(IPC.OLLAMA_STATUS, force === true);
    },

    // Installed model list + current selection
    models() {
        return invoke(IPC.OLLAMA_MODELS);
    },

    // Explicitly select which installed model to use
    selectModel(name) {
        const value = String(name || "").trim();
        if (!value) {
            return Promise.resolve({ success: false, error: "Model name is required." });
        }
        return invoke(IPC.OLLAMA_SET_MODEL, value);
    },

    setConnected(connected) {
        return invoke(IPC.OLLAMA_SET_ENABLED, connected === true);
    },

    // Direct conversational chat (diagnostics / settings preview).
    // messages: [{ role: "system"|"user"|"assistant", content: string }]
    chat(messages, options = {}) {
        if (!Array.isArray(messages) || messages.length === 0) {
            return Promise.resolve({ success: false, error: "Messages array is required." });
        }
        return invoke(IPC.OLLAMA_CHAT, messages, options);
    }
});

const AIProviderAPI = Object.freeze({
    get() { return invoke(IPC.AI_PROVIDER_GET); },
    health() { return invoke(IPC.AI_PROVIDER_HEALTH); },
    save(config) { return invoke(IPC.AI_PROVIDER_SAVE, config && typeof config === "object" ? config : {}); },
    useGrokWithSarvamVoice() { return invoke(IPC.AI_PROVIDER_GROK_SARVAM_VOICE); },
    test() { return invoke(IPC.AI_PROVIDER_TEST); },
    vision(prompt, imageBase64, options = {}) {
        return invoke(IPC.AI_PROVIDER_VISION, String(prompt || "").slice(0, 2000), String(imageBase64 || "").slice(0, 8_000_000), options && typeof options === "object" ? options : {});
    },
    generateImage(prompt, options = {}) {
        return invoke(IPC.AI_PROVIDER_GENERATE_IMAGE, String(prompt || "").slice(0, 4000), options && typeof options === "object" ? options : {});
    },
    savePrivacy(config) { return invoke(IPC.AI_PROVIDER_PRIVACY_SAVE, config && typeof config === "object" ? config : {}); },
    clearRecentHistory() { return invoke(IPC.AI_PROVIDER_PRIVACY_CLEAR); },
    previewRecentHistory() { return invoke("ai-provider:privacy-preview"); }
});

const PresentationsAPI = Object.freeze({
    create(topic, options = {}) {
        return invoke("presentations:create", String(topic || "").slice(0, 120), options && typeof options === "object" ? options : {});
    },
    onProgress(callback) { return listen("presentations:progress", callback); },
    onTaskRequest(callback) { return listen("assistant:presentation:request", callback); }
});

const BackgroundJobsAPI = Object.freeze({
    list() { return invoke(IPC.BACKGROUND_JOBS_LIST); },
    cancel(id) { return invoke(IPC.BACKGROUND_JOBS_CANCEL, String(id || "")); },
    onUpdate(callback) { return listen("background-jobs:update", callback); }
});

const AssistantTasksAPI = Object.freeze({
    list() { return invoke("assistant:tasks:list"); },
    get(taskId) { return invoke("assistant:tasks:get", String(taskId || "")); },
    create(request) { return invoke("assistant:tasks:create", String(request || "").slice(0, 1000)); },
    completePresentation(requestId, result) { return invoke("assistant:tasks:presentation-result", String(requestId || ""), result && typeof result === "object" ? result : {}); },
    approve(taskId) { return invoke("assistant:tasks:approve", String(taskId || "")); },
    cancel(taskId) { return invoke("assistant:tasks:cancel", String(taskId || "")); },
    onUpdate(callback) { return listen("assistant:task-updated", callback); }
});

// ============================================================
// BROWSER API
// ============================================================

const BrowserAPI = Object.freeze({

    open(url) {

        const target = String(
            url || ""
        ).trim();

        if (!target) {

            return Promise.resolve({

                success: false,
                error: "URL is required."
            });
        }

        return invoke(
            IPC.BROWSER_OPEN_URL,
            target
        );
    },

    openURL(url) {

        return BrowserAPI.open(url);
    },

    // --------------------------------------------------------
    // EMBEDDED BROWSER (in-app tabs — BrowserView-backed)
    // --------------------------------------------------------

    newTab(url) {

        return invoke(
            IPC.BROWSER_NEW_TAB,
            String(url || "").trim()
        );
    },

    closeTab(tabId) {

        return invoke(
            IPC.BROWSER_CLOSE_TAB,
            tabId
        );
    },

    switchTab(tabId) {

        return invoke(
            IPC.BROWSER_SWITCH_TAB,
            tabId
        );
    },

    navigate(tabId, input) {

        return invoke(
            IPC.BROWSER_NAVIGATE,
            tabId,
            String(input || "").trim()
        );
    },

    playTopYouTubeResult(query) {
        return invoke(IPC.BROWSER_YOUTUBE_PLAY, String(query || "").slice(0, 240));
    },

    compareShoppingResults(tabId) {
        return invoke(IPC.BROWSER_COMPARE_SHOPPING, String(tabId || ""));
    },

    playCurrentYouTubeVideo() {
        return invoke(IPC.BROWSER_YOUTUBE_PLAY, "__CURRENT__");
    },

    goBack(tabId) {

        return invoke(
            IPC.BROWSER_GO_BACK,
            tabId
        );
    },

    goForward(tabId) {

        return invoke(
            IPC.BROWSER_GO_FORWARD,
            tabId
        );
    },

    reload(tabId) {

        return invoke(
            IPC.BROWSER_RELOAD,
            tabId
        );
    },

    stop(tabId) {

        return invoke(
            IPC.BROWSER_STOP,
            tabId
        );
    },

    getTabs() {

        return invoke(
            IPC.BROWSER_GET_TABS
        );
    },

    setBounds(rect) {

        return invoke(
            IPC.BROWSER_SET_BOUNDS,
            rect
        );
    },

    setVisible(visible) {

        return invoke(
            IPC.BROWSER_SET_VISIBLE,
            Boolean(visible)
        );
    },

    onTabEvent(callback) {

        return listen(
            IPC.BROWSER_TAB_EVENT,
            callback
        );
    },

    // --------------------------------------------------------
    // PAGE TOOLS (Phase 4)
    // --------------------------------------------------------

    zoomIn(tabId) {
        return invoke(IPC.BROWSER_ZOOM_IN, tabId);
    },

    zoomOut(tabId) {
        return invoke(IPC.BROWSER_ZOOM_OUT, tabId);
    },

    zoomReset(tabId) {
        return invoke(IPC.BROWSER_ZOOM_RESET, tabId);
    },

    getZoom(tabId) {
        return invoke(IPC.BROWSER_GET_ZOOM, tabId);
    },

    print(tabId) {
        return invoke(IPC.BROWSER_PRINT, tabId);
    },

    savePage(tabId) {
        return invoke(IPC.BROWSER_SAVE_PAGE, tabId);
    },

    find(tabId, text, options) {
        return invoke(IPC.BROWSER_FIND, tabId, String(text || ""), options || {});
    },

    findStop(tabId) {
        return invoke(IPC.BROWSER_FIND_STOP, tabId);
    }
});

// ============================================================
// BOOKMARKS API
// ============================================================

const BookmarksAPI = Object.freeze({

    add(url, title) {

        return invoke(
            IPC.BOOKMARKS_ADD,
            { url: String(url || "").trim(), title: String(title || "").trim() }
        );
    },

    remove(idOrOptions) {

        const options =
            typeof idOrOptions === "string"
                ? { id: idOrOptions }
                : (idOrOptions || {});

        return invoke(
            IPC.BOOKMARKS_REMOVE,
            options
        );
    },

    list() {

        return invoke(
            IPC.BOOKMARKS_LIST
        );
    },

    isBookmarked(url) {

        return invoke(
            IPC.BOOKMARKS_IS_BOOKMARKED,
            String(url || "").trim()
        );
    }
});

// ============================================================
// HISTORY API
// ============================================================

const HistoryAPI = Object.freeze({

    list(options = {}) {

        return invoke(
            IPC.HISTORY_LIST,
            options
        );
    },

    search(query) {

        return invoke(
            IPC.HISTORY_SEARCH,
            String(query || "").trim()
        );
    },

    delete(id) {

        return invoke(
            IPC.HISTORY_DELETE,
            id
        );
    },

    clear() {

        return invoke(
            IPC.HISTORY_CLEAR
        );
    }
});

// ============================================================
// DOWNLOADS API
// ============================================================

const DownloadsAPI = Object.freeze({

    list() {
        return invoke(IPC.DOWNLOADS_LIST);
    },

    pause(id) {
        return invoke(IPC.DOWNLOADS_PAUSE, id);
    },

    resume(id) {
        return invoke(IPC.DOWNLOADS_RESUME, id);
    },

    cancel(id) {
        return invoke(IPC.DOWNLOADS_CANCEL, id);
    },

    openFile(id) {
        return invoke(IPC.DOWNLOADS_OPEN_FILE, id);
    },

    showInFolder(id) {
        return invoke(IPC.DOWNLOADS_SHOW_IN_FOLDER, id);
    },

    clear() {
        return invoke(IPC.DOWNLOADS_CLEAR);
    },

    onEvent(callback) {
        return listen(IPC.DOWNLOADS_EVENT, callback);
    }
});

// ============================================================
// SYSTEM API
// ============================================================

const SystemAPI = Object.freeze({

    changePlan(change = {}) { return invoke(IPC.SYSTEM_CHANGE_PLAN, change && typeof change === "object" ? change : {}); },
    downloadsCleanupPlan(options = {}) { return invoke(IPC.SYSTEM_DOWNLOADS_CLEANUP_PLAN, options); },
    backupPlan(options = {}) { return invoke(IPC.SYSTEM_BACKUP_PLAN, options); },
    labelPhoto(options = {}) { return invoke(IPC.SYSTEM_PHOTO_LABEL, options); },
    pcDoctorScan() { return invoke(IPC.SYSTEM_PC_DOCTOR_SCAN); },
    pcDoctorApply(fixIds = [], approved = false) { return invoke(IPC.SYSTEM_PC_DOCTOR_APPLY, Array.isArray(fixIds) ? fixIds.slice(0, 10) : [], approved === true); },
    organizeDesktopImages(options = {}) { return invoke(IPC.SYSTEM_ORGANIZE_DESKTOP_IMAGES, options && typeof options === "object" ? options : {}); },
    paths() { return invoke(IPC.SYSTEM_PATHS); },

    listApps(refresh = false) { return invoke(IPC.SYSTEM_LIST_APPS, refresh === true); },
    launchAppEntry(id) { return invoke(IPC.SYSTEM_LAUNCH_APP_ENTRY, String(id || "")); },
    addApp() { return invoke(IPC.SYSTEM_ADD_APP); },

    openApp(name, options = {}) {

        const appName = String(
            name || ""
        ).trim();

        if (!appName) {

            return Promise.resolve({

                success: false,
                error: "Application name is required."
            });
        }

        const safeOptions = options && typeof options === "object" ? {
            searchQuery: String(options.searchQuery || "").trim().slice(0, 160)
        } : {};
        return invoke(IPC.SYSTEM_OPEN_APP, appName, safeOptions);
    },

    closeApps(options = {}) {
        const input = options && typeof options === "object" ? options : {};
        return invoke(IPC.SYSTEM_CLOSE_APPS, {
            targets: Array.isArray(input.targets) ? input.targets.slice(0, 8).map(String) : [],
            except: Array.isArray(input.except) ? input.except.slice(0, 8).map(String) : [],
            all: input.all === true
        });
    },

    shutdown() {

        return invoke(
            IPC.SYSTEM_SHUTDOWN
        );
    },

    scheduleShutdown(delayMs) {
        const value = Number(delayMs);
        if (!Number.isFinite(value) || !Number.isInteger(value)) {
            return Promise.resolve({ success: false, error: "Shutdown delay must be a whole number of milliseconds." });
        }
        return invoke(IPC.SYSTEM_SCHEDULE_SHUTDOWN, value);
    },

    getScheduledShutdown() {
        return invoke(IPC.SYSTEM_GET_SCHEDULED_SHUTDOWN);
    },

    cancelScheduledShutdown() {
        return invoke(IPC.SYSTEM_CANCEL_SCHEDULED_SHUTDOWN);
    },

    restart() {

        return invoke(
            IPC.SYSTEM_RESTART
        );
    },

    sleep() {

        return invoke(
            IPC.SYSTEM_SLEEP
        );
    },

    lock() {

        return invoke(
            IPC.SYSTEM_LOCK
        );
    },

    lockPC() {

        return SystemAPI.lock();
    },

    logoff() {

        return invoke(
            IPC.SYSTEM_LOGOFF
        );
    }
});

// ============================================================
// COMPUTER USE API
// ============================================================

const ComputerUseAPI = Object.freeze({
    start() { return invoke(IPC.COMPUTER_USE_START); },
    stop() { return invoke(IPC.COMPUTER_USE_STOP); },
    status() { return invoke(IPC.COMPUTER_USE_STATUS); },
    inspectAccessibility() { return invoke(IPC.COMPUTER_USE_INSPECT_UI); },
    perform(action, params = {}, approved = false) {
        return invoke(IPC.COMPUTER_USE_ACTION, String(action || ""), params && typeof params === "object" ? params : {}, approved === true);
    }
});

const ScreenShareAPI = Object.freeze({
    capture() { return invoke(IPC.SCREEN_SHARE_CAPTURE); }
});

// ============================================================
// APPLICATION API
// ============================================================

const AppsAPI = Object.freeze({

    chrome() {

        return invoke(
            IPC.SYSTEM_CHROME
        );
    },

    setVolume(percent) {
        if (typeof percent !== "number" || !Number.isInteger(percent) || percent < 0 || percent > 100) {
            return Promise.resolve({ success: false, error: "Volume must be a whole number from 0 to 100." });
        }
        return invoke(IPC.SYSTEM_SET_VOLUME, percent);
    },

    vscode() {

        return invoke(
            IPC.SYSTEM_VSCODE
        );
    },

    notepad() {

        return invoke(
            IPC.SYSTEM_NOTEPAD
        );
    },

    calculator() {

        return invoke(
            IPC.SYSTEM_CALCULATOR
        );
    },

    explorer() {

        return invoke(
            IPC.SYSTEM_EXPLORER
        );
    },

    settings() {

        return invoke(
            IPC.SYSTEM_SETTINGS
        );
    }
});

// ============================================================
// FILE MANAGEMENT API
// All operations are validated + path-safety-checked on the
// main-process side (see main.js file:* handlers) — the
// renderer never touches Node's fs module directly.
// ============================================================

const FileAPI = Object.freeze({

    list(dirPath) {
        return invoke(IPC.FILES_LIST, String(dirPath || ""));
    },

    search(query, options = {}) {

        return invoke(
            IPC.FILE_SEARCH,
            query,
            options
        );
    },

    open(filePath) {

        return invoke(
            IPC.FILE_OPEN,
            filePath
        );
    },

    create(filePath, content = "") {

        return invoke(
            IPC.FILE_CREATE,
            filePath,
            content
        );
    },

    createFolder(folderPath) {

        return invoke(
            IPC.FILE_CREATE_FOLDER,
            folderPath
        );
    },

    rename(oldPath, newName) {

        return invoke(
            IPC.FILE_RENAME,
            oldPath,
            newName
        );
    },

    move(sourcePath, destinationPath) {

        return invoke(
            IPC.FILE_MOVE,
            sourcePath,
            destinationPath
        );
    },

    delete(filePath, confirm = false) {

        return invoke(
            IPC.FILE_DELETE,
            filePath,
            confirm
        );
    },

    read(filePath) {

        return invoke(
            IPC.FILE_READ,
            filePath
        );
    },

    pickAndRead() {
        return invoke(IPC.CHAT_FILE_PICK_READ);
    }
});

const PhotoOrganizerAPI = Object.freeze({
    pickReference() { return invoke(IPC.PHOTO_PICK_REFERENCE); },
    pickFolder() { return invoke(IPC.PHOTO_PICK_FOLDER); },
    preview(options = {}) { return invoke(IPC.PHOTO_MATCH_PREVIEW, options); },
    organize(options = {}) { return invoke(IPC.PHOTO_ORGANIZE_MATCHES, options); }
});

// ============================================================
// SYSTEM INFO API
// Time/date come from the renderer's own clock (no IPC needed);
// everything else is main-process-only data (battery, CPU, RAM,
// storage, network), fetched on demand.
// ============================================================

const SystemInfoAPI = Object.freeze({

    // REAL IPC round-trip health check (used by the boot sequence).
    // system:info is handled in the main process — success proves the
    // full preload → contextBridge → ipcMain pipeline is alive.
    ipcPing() {
        return invoke(IPC.SYSTEM_INFO);
    },

    now() {

        const d = new Date();

        return {
            time: d.toLocaleTimeString(),
            date: d.toLocaleDateString(),
            day: d.toLocaleDateString(undefined, { weekday: "long" })
        };
    },

    info() {

        return invoke(
            IPC.SYSTEM_INFO
        );
    }
});

// ============================================================
// WINDOW API
// ============================================================

const WindowAPI = Object.freeze({

    minimize() {

        return send(
            IPC.WINDOW_MINIMIZE
        );
    },

    maximize() {

        return send(
            IPC.WINDOW_MAXIMIZE
        );
    },

    close() {

        return send(
            IPC.WINDOW_CLOSE
        );
    }
});

// ============================================================
// MEMORY API
// ============================================================

const MemoryAPI = Object.freeze({

    async save(key, value) {

        try {

            const storageKey = String(
                key || "JARVIS_MEMORY"
            );

            const serialized =
                typeof value === "string"
                    ? value
                    : JSON.stringify(value);

            localStorage.setItem(
                storageKey,
                serialized
            );

            return true;

        } catch (error) {

            console.error(
                "❌ Memory Save Error:",
                error
            );

            return false;
        }
    },

    async load(key) {

        try {

            const storageKey = String(
                key || "JARVIS_MEMORY"
            );

            return localStorage.getItem(
                storageKey
            );

        } catch (error) {

            console.error(
                "❌ Memory Load Error:",
                error
            );

            return null;
        }
    },

    async clear(key) {

        try {

            const storageKey = String(
                key || "JARVIS_MEMORY"
            );

            localStorage.removeItem(
                storageKey
            );

            return true;

        } catch (error) {

            console.error(
                "❌ Memory Clear Error:",
                error
            );

            return false;
        }
    },

    // --------------------------------------------------------
    // LONG-TERM MEMORY ENGINE (main process)
    //
    // FIX: the Memory Viewer panel (renderer/js/panels.js) calls
    // window.jarvis.memory.getMemoryStats / getMemoryFacts /
    // forgetMemoryFact / searchMemory / clearAllMemory, but this API
    // only exposed localStorage save/load/clear — every panel call
    // threw "is not a function". These bridge the ALREADY-REGISTERED
    // main-process channels (memory:stats, memory:get-facts,
    // memory:forget-fact, memory:search, memory:forget-all) and
    // normalize responses to the shapes the panel renders.
    // --------------------------------------------------------

    async getMemoryStats() {

        const result = await invoke(IPC.MEMORY_STATS);

        if (!result || result.success === false) {
            return null;
        }

        const stats = result.stats || {};

        return {
            ...stats,
            count: stats.active != null
                ? stats.active
                : (stats.totalRecords || 0)
        };
    },

    async getMemoryFacts() {

        const result = await invoke(IPC.MEMORY_LIST, { limit: 500 });

        if (!result || result.success === false) {
            return [];
        }

        return Array.isArray(result.records) ? result.records : [];
    },

    forgetMemoryFact(key) {
        return invoke(
            IPC.MEMORY_FORGET_FACT,
            String(key || "")
        );
    },

    async searchMemory(query, limit) {

        const result = await invoke(
            IPC.MEMORY_SEARCH,
            String(query || ""),
            limit
        );

        if (!result || result.success === false) {
            return [];
        }

        return result.records || [];
    },

    clearAllMemory(confirm) {

        return invoke(
            IPC.MEMORY_CLEAR,
            confirm === true
        );
    },
    updateMemory(key, patch) {
        return invoke(IPC.MEMORY_UPDATE, String(key || ""), patch && typeof patch === "object" ? patch : {});
    }
});

// ============================================================
// DIAGNOSTICS API
// ============================================================

const DiagnosticsAPI = Object.freeze({

    ping() {

        return true;
    },

    getStatus() {

        return {

            status: "online",

            bridge:
                "Electron Secure Bridge",

            preload:
                PRELOAD_VERSION,

            ai:
                false,

            timestamp:
                Date.now()
        };
    },

    getVersion() {

        return PRELOAD_VERSION;
    },

    isReady() {

        return preloadReady;
    }
});

// ============================================================
// PLATFORM API
// ============================================================

const PlatformAPI = Object.freeze({

    platform:
        process.platform,

    versions: {

        node:
            process.versions.node,

        electron:
            process.versions.electron,

        chrome:
            process.versions.chrome
    },

    async info() {
        return invoke(IPC.PLATFORM_INFO || "platform:info");
    }
});

// ============================================================
// FILES API
// ============================================================

const FilesAPI = Object.freeze({

    async list(dirPath) {
        return invoke(IPC.FILES_LIST, String(dirPath || "."));
    }
});

// ============================================================
// EVENT API
// ============================================================

const EventAPI = Object.freeze({

    on(channel, callback) {

        return listen(
            channel,
            callback
        );
    },

    removeAll(channel) {

        try {

            if (!channel) {
                return false;
            }

            ipcRenderer.removeAllListeners(
                channel
            );

            return true;

        } catch (error) {

            console.error(
                "❌ Event Remove Error:",
                error
            );

            return false;
        }
    }
});

// ============================================================
// LEGACY COMPATIBILITY
// ============================================================

// ============================================================
// USER API — multi-user management
// ============================================================

const NotificationAPI = Object.freeze({
    list(options = {}) { return invoke(IPC.NOTIFICATIONS_LIST, options && typeof options === "object" ? options : {}); },
    unreadCount() { return invoke(IPC.NOTIFICATIONS_UNREAD); },
    markRead(id) { return invoke(IPC.NOTIFICATIONS_MARK_READ, String(id || "")); },
    markAllRead() { return invoke(IPC.NOTIFICATIONS_MARK_ALL_READ); },
    clear() { return invoke(IPC.NOTIFICATIONS_CLEAR); },
    stats() { return invoke(IPC.NOTIFICATIONS_STATS); }
});

const UserAPI = Object.freeze({
    list() { return invoke(IPC.USER_LIST); },
    getActive() { return invoke(IPC.USER_GET_ACTIVE); },
    create(profile, preferences, privacy, options) {
        return invoke(
            IPC.USER_CREATE,
            profile && typeof profile === "object" ? profile : {},
            preferences && typeof preferences === "object" ? preferences : {},
            privacy && typeof privacy === "object" ? privacy : {},
            options && typeof options === "object" ? options : {}
        );
    },
    switch(userId, pin) { return invoke(IPC.USER_SWITCH, String(userId || ""), String(pin || "")); },
    getProfile(userId) { return invoke(IPC.USER_GET_PROFILE, String(userId || "")); },
    updateProfile(userId, updates) {
        return invoke(IPC.USER_UPDATE_PROFILE, String(userId || ""),
            updates && typeof updates === "object" ? updates : {});
    },
    getPreferences(userId) { return invoke(IPC.USER_GET_PREFERENCES, String(userId || "")); },
    updatePreferences(userId, updates) {
        return invoke(IPC.USER_UPDATE_PREFERENCES, String(userId || ""),
            updates && typeof updates === "object" ? updates : {});
    },
    getPrivacy(userId) { return invoke(IPC.USER_GET_PRIVACY, String(userId || "")); },
    updatePrivacy(userId, updates) {
        return invoke(IPC.USER_UPDATE_PRIVACY, String(userId || ""),
            updates && typeof updates === "object" ? updates : {});
    },
    delete(userId, confirm) { return invoke(IPC.USER_DELETE, String(userId || ""), confirm === true); },
    export(userId) { return invoke(IPC.USER_EXPORT, String(userId || "")); },
    import(data) {
        if (!data || typeof data !== "object") {
            return Promise.resolve({ success: false, error: "Invalid import data" });
        }
        return invoke(IPC.USER_IMPORT, data);
    },
    // Per-user memory
    memoryFacts(userId) { return invoke(IPC.USER_MEMORY_FACTS, String(userId || "")); },
    memoryRemember(userId, message) { return invoke(IPC.USER_MEMORY_REMEMBER, String(userId || ""), String(message || "")); },
    memorySearch(userId, query, limit) { return invoke(IPC.USER_MEMORY_SEARCH, String(userId || ""), String(query || ""), limit); },
    memoryForget(userId, key) { return invoke(IPC.USER_MEMORY_FORGET, String(userId || ""), String(key || "")); },
    memoryForgetAll(userId, confirm) { return invoke(IPC.USER_MEMORY_FORGET_ALL, String(userId || ""), confirm === true); },
    memoryStats(userId) { return invoke(IPC.USER_MEMORY_STATS, String(userId || "")); },

    // PIN Authentication
    verifyPin(userId, pin) { return invoke(IPC.USER_VERIFY_PIN, String(userId || ""), String(pin || "")); },
    setPin(userId, pin) { return invoke(IPC.USER_SET_PIN, String(userId || ""), String(pin || "")); },
    updatePin(userId, oldPin, newPin) { return invoke(IPC.USER_UPDATE_PIN, String(userId || ""), String(oldPin || ""), String(newPin || "")); },
    removePin(userId, pin) { return invoke(IPC.USER_REMOVE_PIN, String(userId || ""), String(pin || "")); },
    hasPin(userId) { return invoke(IPC.USER_HAS_PIN, String(userId || "")); },
    // Roles
    getRole(userId) { return invoke(IPC.USER_GET_ROLE, String(userId || "")); },
    setRole(userId, role, requestingUserId) { return invoke(IPC.USER_SET_ROLE, String(userId || ""), String(role || ""), String(requestingUserId || "")); },
    // Activity
    getActivity(userId) { return invoke(IPC.USER_GET_ACTIVITY, String(userId || "")); },
    recordMessage(userId) { return invoke(IPC.USER_RECORD_MESSAGE, String(userId || "")); },
    recordVoice(userId) { return invoke(IPC.USER_RECORD_VOICE, String(userId || "")); },
    recordCommand(userId) { return invoke(IPC.USER_RECORD_COMMAND, String(userId || "")); },
    getStorage(userId) { return invoke(IPC.USER_GET_STORAGE, String(userId || "")); },
    // Merge
    merge(sourceId, targetId, requestingUserId) { return invoke(IPC.USER_MERGE, String(sourceId || ""), String(targetId || ""), String(requestingUserId || "")); },
    // Sessions
    lockSession(userId) { return invoke(IPC.USER_LOCK_SESSION, String(userId || "")); },
    unlockSession(userId, pin) { return invoke(IPC.USER_UNLOCK_SESSION, String(userId || ""), String(pin || "")); },
    getSession(userId) { return invoke(IPC.USER_GET_SESSION, String(userId || "")); },
    touchSession(userId) { return invoke(IPC.USER_TOUCH_SESSION, String(userId || "")); },
    // Memory importance engine (v2.1)
    memoryTop(userId, limit) { return invoke(IPC.USER_MEMORY_TOP, String(userId || ""), limit); },
    memoryReinforce(userId, key) { return invoke(IPC.USER_MEMORY_REINFORCE, String(userId || ""), String(key || "")); },
    memoryStale(userId, days) { return invoke(IPC.USER_MEMORY_STALE, String(userId || ""), days); },
    memoryScore(userId, key, value) { return invoke(IPC.USER_MEMORY_SCORE, String(userId || ""), String(key || ""), String(value || "")); },
    // Full context for the Brain
    context() { return invoke(IPC.USER_CONTEXT); },
});

const JarvisBridge = {

    // --------------------------------------------------------
    // MODERN APIs
    // --------------------------------------------------------

    ai:
        AIAPI,

    // Deterministic knowledge-brain bridge (main-process ai:ask — ZERO LLM)
    askBrain(message, context = {}) { return AIAPI.ask(message, context); },

    chat:
        ChatAPI,

    voice:
        VoiceAPI,

    // Optional LOCAL AI (Ollama) — conversation only, no cloud
    ollama:
        OllamaAPI,

    aiProvider:
        AIProviderAPI,

    presentations:
        PresentationsAPI,

    jobs:
        BackgroundJobsAPI,

    tasks:
        AssistantTasksAPI,

    documents: {
        createPdf: (topic, options = {}) => invoke("documents:create-pdf", String(topic || "").slice(0, 120), options && typeof options === "object" ? options : {}),
        createSpreadsheet: (request, options = {}) => invoke("documents:create-spreadsheet", String(request || "").slice(0, 180), options && typeof options === "object" ? options : {}),
        createOfficeFile: (format, request, options = {}) => invoke("documents:create-office-file", String(format || "").slice(0, 12), String(request || "").slice(0, 180), options && typeof options === "object" ? options : {}),
        listGenerated: () => invoke("documents:generated-list"),
        openGenerated: path => invoke("documents:generated-open", { path: String(path || "") }),
        restoreVersion: path => invoke("documents:generated-restore-version", { path: String(path || "") }),
        previewGenerated: path => invoke("documents:generated-preview", { path: String(path || "") }),
        renderGenerated: path => invoke("documents:generated-render", { path: String(path || "") }),
        compareGenerated: paths => invoke("documents:generated-compare", Array.isArray(paths) ? paths.slice(0, 2).map(String) : [])
    },

    notifications:
        NotificationAPI,

    browser:
        BrowserAPI,

    bookmarks:
        BookmarksAPI,

    history:
        HistoryAPI,

    downloads:
        DownloadsAPI,

    system:
        SystemAPI,

    computerUse:
        ComputerUseAPI,

    screenShare:
        ScreenShareAPI,

    apps:
        AppsAPI,

    files:
        FileAPI,

    photoOrganizer:
        PhotoOrganizerAPI,

    info:
        SystemInfoAPI,

    window:
        WindowAPI,

    memory:
        MemoryAPI,

    wikipedia:
        WikipediaAPI,

    data:
        DataSourcesAPI,

    knowledge:
        KnowledgeCacheAPI,

    learning:
        LearningAPI,

    users:
        UserAPI,

    backgroundLearning:
        BackgroundLearningAPI,

    suggestions:
        SuggestionsAPI,

    evolution:
        EvolutionAPI,

    diagnostics:
        DiagnosticsAPI,

    events:
        EventAPI,

    platform:
        PlatformAPI,

    files:
        FilesAPI,

    // --------------------------------------------------------
    // CHAT
    // --------------------------------------------------------

    saveChat(data) {

        return ChatAPI.save(data);
    },

    loadChat() {

        return ChatAPI.load();
    },

    clearChat() {

        return ChatAPI.clear();
    },

    // --------------------------------------------------------
    // VOICE
    // --------------------------------------------------------

    startListening() {

        return VoiceAPI.start();
    },

    stopListening() {

        return VoiceAPI.stop();
    },

    onTranscript(callback) {

        return VoiceAPI.onTranscript(
            callback
        );
    },

    sendVoice(text) {

        return VoiceAPI.send(text);
    },

    // --------------------------------------------------------
    // BROWSER
    // --------------------------------------------------------

    openURL(url) {

        return BrowserAPI.open(url);
    },

    // --------------------------------------------------------
    // SYSTEM
    // --------------------------------------------------------

    openApp(name, options = {}) {

        return SystemAPI.openApp(name, options);
    },

    shutdown() {

        return SystemAPI.shutdown();
    },

    restart() {

        return SystemAPI.restart();
    },

    sleep() {

        return SystemAPI.sleep();
    },

    lockPC() {

        return SystemAPI.lock();
    },

    // --------------------------------------------------------
    // APPLICATIONS
    // --------------------------------------------------------

    openChrome() {

        return AppsAPI.chrome();
    },

    openVSCode() {

        return AppsAPI.vscode();
    },

    openNotepad() {

        return AppsAPI.notepad();
    },

    openCalculator() {

        return AppsAPI.calculator();
    },

    openExplorer() {

        return AppsAPI.explorer();
    },

    openSettings() {

        return AppsAPI.settings();
    },

    // --------------------------------------------------------
    // WINDOW
    // --------------------------------------------------------

    minimize() {

        return WindowAPI.minimize();
    },

    maximize() {

        return WindowAPI.maximize();
    },

    close() {

        return WindowAPI.close();
    },

    // --------------------------------------------------------
    // MEMORY
    // --------------------------------------------------------

    saveMemory(key, value) {

        return MemoryAPI.save(
            key,
            value
        );
    },

    loadMemory(key) {

        return MemoryAPI.load(
            key
        );
    },

    clearMemory(key) {

        return MemoryAPI.clear(
            key
        );
    }
};

// ============================================================
// FREEZE BRIDGE
// ============================================================

Object.freeze(
    JarvisBridge
);

// ============================================================
// EXPOSE BRIDGES
// ============================================================

try {

    // Main JARVIS bridge
    contextBridge.exposeInMainWorld(
        "jarvis",
        JarvisBridge
    );

    // Version information
    contextBridge.exposeInMainWorld(
        "JARVIS_VERSION",
        Object.freeze({

            version:
                PRELOAD_VERSION,

            name:
                "JARVIS PRO MAX",

            bridge:
                "Electron Secure Bridge",

            status:
                "stable",

            ai:
                false
        })
    );

    // Diagnostics
    contextBridge.exposeInMainWorld(
        "DiagnosticsAPI",
        DiagnosticsAPI
    );

    // Electron compatibility API
    contextBridge.exposeInMainWorld(
        "electronAPI",
        Object.freeze({

            ping() {

                return DiagnosticsAPI.ping();
            },

            platform:
                PlatformAPI.platform,

            versions:
                PlatformAPI.versions
        })
    );

    preloadReady = true;

    // ========================================================
    // STARTUP LOG
    // ========================================================

    console.log(
        "=================================================="
    );

    console.log(
        "🛡️ JARVIS PRELOAD V13.1 PRODUCTION"
    );

    console.log(
        "=================================================="
    );

    console.log(
        "✅ contextBridge initialized"
    );

    console.log(
        "✅ window.jarvis exposed"
    );

    console.log(
        "✅ DiagnosticsAPI exposed"
    );

    console.log(
        "✅ Chat API ready"
    );

    console.log(
        "✅ Voice API ready"
    );

    console.log(
        "✅ Browser API ready"
    );

    console.log(
        "✅ System API ready"
    );

    console.log(
        "✅ Application API ready"
    );

    console.log(
        "✅ Window API ready"
    );

    console.log(
        "✅ Memory API ready"
    );

    console.log(
        "✅ Legacy compatibility enabled"
    );

    console.log(
        "🚫 AI API completely removed"
    );

    console.log(
        "🔗 IPC channel: system:open-app"
    );

    console.log(
        "🟢 PRELOAD READY"
    );

    console.log(
        "=================================================="
    );

} catch (error) {

    preloadReady = false;

    console.error(
        "❌ PRELOAD BRIDGE INITIALIZATION FAILED:",
        error
    );
}
