"use strict";

/*
 * ============================================================
 * JARVIS PRO MAX
 * MAIN PROCESS
 * V14.2 PRODUCTION — PART 1
 * ============================================================
 *
 * Electron Main Process — Core Foundation
 *
 * PART 1 FEATURES:
 * - Electron imports
 * - Environment loading
 * - Version
 * - Global state
 * - Chat state
 * - IPC registry
 * - Logging
 * - Safe result helpers
 * - IPC validation
 * - Safe IPC handler registration
 * - Safe IPC listener registration
 * - Renderer communication
 * - Main window validation
 * - Renderer path helpers
 * - External URL validation
 * - Safe external URL opening
 * - Main process diagnostics
 *
 * ============================================================
 */

/* ============================================================
 * CONSOLE ENCODING FIX (Windows mojibake)
 * ============================================================
 *
 * On Windows, cmd.exe / PowerShell default to a legacy codepage
 * (437 / 1252 / etc). Node writes UTF-8 bytes to stdout/stderr,
 * so anything non-ASCII (emoji, Hindi/Devanagari text from
 * Wikipedia, etc.) gets misdecoded into garbled symbols like
 * "αñ«αñ╛..." even though the underlying data is correct.
 *
 * Switching the console codepage to UTF-8 (65001) before any
 * logging happens fixes this at the terminal level. This must
 * run as early as possible, before any console.log/warn/error.
 * ============================================================
 */
if (process.platform === "win32") {
    try {
        require("child_process").execSync("chcp 65001", { stdio: "ignore" });
    } catch (_) {
        // Non-fatal: if this fails (e.g. no console attached, packaged
        // app with no stdio), JARVIS just continues without the fix.
    }
}
try {
    if (process.stdout && process.stdout.setEncoding) process.stdout.setEncoding("utf8");
    if (process.stderr && process.stderr.setEncoding) process.stderr.setEncoding("utf8");
} catch (_) {
    // Non-fatal.
}

require("dotenv").config();

const {
    app,
    BrowserWindow,
    net,
    // FIX: the embedded tabbed browser creates tabs with `new BrowserView(...)`
    // (see registerEmbeddedBrowserIPC / "browser:new-tab") but BrowserView was
    // never imported here, so opening any tab threw
    // "ReferenceError: BrowserView is not defined" and killed that IPC call.
    BrowserView,
    WebContentsView,
    desktopCapturer,
    dialog,
    ipcMain,
    shell,
    session,
    safeStorage,
    clipboard
} = require("electron");

// The embedded browser is restricted to Google/YouTube. Allow YouTube's
// voice-requested first result to start playback without a second click.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

const path = require("path");
const fs = require("fs");

// Electron may start with a working directory outside the project (for
// example from a shortcut or the packaged launcher). Load the project-local
// .env explicitly so online Sarvam, ElevenLabs, and Grok credentials are
// available to the voice providers in every launch mode.
try {
    require("dotenv").config({ path: path.join(__dirname, ".env") });
} catch (_) {}
const os = require("os");
const crypto = require("crypto");
const JSZip = require("jszip");
const { pathToFileURL } = require("url");
const { spawn, execFile } = require("child_process");
const { writeJsonAtomic } = require("./src/utils/atomicJson");
const { createAppCatalog } = require("./src/system/appCatalog");

let installedAppCatalog;
function getInstalledAppCatalog() {
    if (!installedAppCatalog) installedAppCatalog = createAppCatalog({
        shell,
        launchExecutable: spawnDetached,
        roots: [
            ...getStartMenuRoots().map(root => ({ path: root, source: "Start Menu", depth: 5 })),
            { path: app.getPath("desktop"), source: "Desktop", depth: 0 },
            { path: path.join(process.env.PUBLIC || "C:\\Users\\Public", "Desktop"), source: "Desktop", depth: 0 },
            // Some portable and Store-adjacent apps do not create a Start Menu
            // shortcut. Search only bounded, conventional install locations;
            // never scan the whole disk and never execute a discovered path
            // until the catalog has resolved an unambiguous user request.
            { path: process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs"), source: "Local Programs", depth: 4, extensions: [".exe"] },
            { path: process.env.ProgramFiles, source: "Program Files", depth: 2, extensions: [".exe"] },
            { path: process.env["ProgramFiles(x86)"], source: "Program Files (x86)", depth: 2, extensions: [".exe"] },
            { path: process.env.USERPROFILE && path.join(process.env.USERPROFILE, "Downloads"), source: "Downloads", depth: 1, extensions: [".exe"] }
        ],
        readCustom: () => {
            try { const entries = JSON.parse(fs.readFileSync(path.join(app.getPath("userData"), "added-apps.json"), "utf8")); return Array.isArray(entries) ? entries : []; }
            catch (_) { return []; }
        }
    });
    return installedAppCatalog;
}

// Install crash tracing before loading the rest of the application modules.
// Electron is often launched without a terminal, so startup failures need a
// durable local diagnostic even when a later dependency throws during import.
function recordStartupEvent(event, details = {}) {
    try {
        const directory = path.join(app.getPath("userData"), "logs");
        fs.mkdirSync(directory, { recursive: true });
        const file = path.join(directory, "startup.log");
        try {
            if (fs.statSync(file).size > 256 * 1024) {
                fs.renameSync(file, `${file}.previous-${Date.now()}`);
            }
        } catch (_) { /* first boot or no previous trace */ }
        fs.appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), event, ...details })}\n`, "utf8");
    } catch (_) {
        // Logging must never prevent JARVIS from starting.
    }
}

process.on("uncaughtExceptionMonitor", error => {
    recordStartupEvent("uncaught-exception", {
        name: String(error?.name || "Error").slice(0, 80),
        message: String(error?.message || error || "unknown").slice(0, 300)
    });
});

process.on("unhandledRejection", reason => {
    recordStartupEvent("unhandled-rejection", {
        message: String(reason?.message || reason || "unknown").slice(0, 300)
    });
});

// Sarvam handles AI requests when available; Ollama and JARVIS local
// knowledge provide automatic fallbacks when the online service is down.
// ============================================================
// AUTHORITATIVE LOCAL COGNITION / MEMORY SINGLETONS
// ============================================================
// The renderer has an old compatibility consciousness adapter, but the
// authoritative state lives here so IPC, chat and HUD all see the same data.
const { ConsciousnessLayer } = require("./src/ai/consciousness");
const { MemoryEngine } = require("./src/ai/memory");
const userManager = require("./src/users/userManager");
const userMemory = require("./src/users/userMemory");
const notificationCenter = require("./src/services/notificationCenter");
const { WindowsVolumeController } = require("./src/system/windowsVolume");
const windowsVolumeController = new WindowsVolumeController();
const { WindowsComputerUse } = require("./src/system/windowsComputerUse");
const windowsComputerUse = new WindowsComputerUse();
const windowsWindowController = require("./src/system/windowsWindowController");
const { createChangePlan } = require("./src/system/changePlanner");
const { createPhotoOrganizer } = require("./src/media/photoOrganizer");
const photoOrganizer = createPhotoOrganizer({ allowedRoots: [app.getPath("pictures"), app.getPath("downloads"), app.getPath("desktop"), app.getPath("documents")] });
const { createFileOperationsPlanner } = require("./src/system/fileOperationsPlanner");
const fileOperationsPlanner = createFileOperationsPlanner({ metadataPath: path.join(app.getPath("userData"), "photo-labels.json"), allowedRoots: [app.getPath("pictures"), app.getPath("downloads"), app.getPath("desktop"), app.getPath("documents")] });
const { createPCDoctor } = require("./src/system/pcDoctor");
const pcDoctor = createPCDoctor({ userDataPath: app.getPath("userData"), homePath: app.getPath("home") });

// FIX: voiceSTT was used throughout registerVoiceIPC() (voice:start,
// voice:stop, voice:transcribe) without ever being required, which threw
// "voiceSTT is not defined" and crashed the process on any voice action.
// The app does not silently fetch speech models at startup. Local models
// must already be installed; permission-gated knowledge lookup is the only
// app-initiated external request path.
process.env.WHISPER_NO_DOWNLOAD = "1";
const voiceSTT = require("./voiceSTT");
const sttEngine = require("./src/speech/stt");
const { createVoiceEngineMigration } = require("./src/speech/voiceEngineMigration");
// Ollama — optional LOCAL AI conversation engine (no cloud, no API key).
// Conversation only: Ollama NEVER receives OS execution capability; all
// PC actions go through the deterministic Action Engine / SafetyGate.
const ollamaClient = require("./src/ai/ollamaClient");
// Keep model/provider preferences writable after packaging (app.asar is
// read-only) so the selected local model survives app restarts.
ollamaClient.configureSettingsPath(app.getPath("userData"));
const { createOpenAICompatibleClient } = require("./src/ai/openAICompatibleClient");
const openAICompatibleClient = createOpenAICompatibleClient({ app, safeStorage });

// All generated artifacts and task classification use the provider selected
// in Settings. This keeps PPT/PDF/DOCX generation aligned with normal chat
// instead of silently sending those requests to Sarvam.
async function chatSelectedProvider(messages, options = {}) {
    const config = openAICompatibleClient.getConfig();
    if (config.provider === "ollama") {
        const status = await ollamaClient.getStatus({ force: true });
        if (!status?.running || !status.selectedModel) return { success: false, error: "The selected Ollama model is not running." };
        return ollamaClient.chat(messages, options);
    }
    if (["sarvam", "grok", "groq", "openai-compatible"].includes(config.provider)) {
        return openAICompatibleClient.chat(messages, options);
    }
    return openAICompatibleClient.chatSarvam(messages, options);
}
const { createPptxBuffer, validateDeck, validateSlideCount, verifyPptxBuffer } = require("./src/presentation/pptxGenerator");
const { resolvePresentationOutputDirectory } = require("./src/presentation/outputDirectory");
const { writeWorkbook: writeSpreadsheetWorkbook } = require("./src/documents/spreadsheetGenerator");
const { buildDocxBuffer, createCsv, createZipBuffer } = require("./src/documents/officeFileGenerator");
const { writePresentationPreview } = require("./src/presentation/previewHtml");
const { buildPresentationImageTargets, choosePresentationImages } = require("./src/presentation/imageAssets");
const { getCachedPresentationImages, cachePresentationImage } = require("./src/presentation/imageLibrary");
const { createImageSearchService } = require("./src/presentation/imageSearchService");
const wikipediaServiceRaw = require("./src/services/wikipedia");
const dataSourcesServiceRaw = require("./src/services/dataSources");
const presentationImageSearch = createImageSearchService({
    requestJson: (url, options) => dataSourcesServiceRaw.httpGetJSON(url, options),
    wikimediaSearch: (query, limit, options) => dataSourcesServiceRaw.commonsImageSearch(query, limit, options),
    getPexelsApiKey: () => process.env.PEXELS_API_KEY || ""
});

// ------------------------------------------------------------
// OFFLINE KNOWLEDGE CACHE
// Wraps wikipediaService / dataSourcesService so every successful
// live answer (text + images) is saved to disk, and — if there is
// no internet next time — the same question is answered from the
// local cache instead of failing. See src/services/offlineCache.js
// and initOfflineKnowledgeCache() below (called once app is ready,
// since it needs app.getPath("userData")).
// ------------------------------------------------------------
const offlineCache = require("./src/services/offlineCache");
// Use Chromium's network stack for online data and image assets. It honors
// Windows proxy/system network configuration that Node's raw https client can
// bypass, which otherwise makes API search succeed in the browser but fail in
// the desktop assistant's background process.
const fetchWithDesktopNetwork = (url, options = {}) => {
    const timeoutSignal = AbortSignal.timeout(Math.max(1000, Number(options.timeoutMs) || 15000));
    const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;
    return net.fetch(url, { headers: options.headers || {}, signal });
};
dataSourcesServiceRaw.setNetworkFetch(fetchWithDesktopNetwork);
offlineCache.setNetworkFetch(fetchWithDesktopNetwork);
const mistakeLearning = require("./src/services/mistakeLearning");
const suggestionEngine = require("./src/services/suggestionEngine");
const { BackgroundKnowledgeLearning, EVENTS: BACKGROUND_LEARNING_EVENTS } = require("./src/services/backgroundKnowledgeLearning");

// Phase 2 of the Persistent Self-Improvement / Background Evolution
// System (see PHASE1_ARCHITECTURE_AUDIT.md). Same singleton-module
// shape as mistakeLearning/offlineCache above — plain JSON on disk,
// no electron-store, no database.
const goalRegistry = require("./src/evolution/goalRegistry");

// Phase 3: the resumable checkpoint (currentGoal/currentPhase/
// progress/nextAction) built the exact same way as goalRegistry.
const evolutionCheckpoint = require("./src/evolution/checkpoint");

// Phase 4: the Background Evolution Engine itself (observe -> select ->
// analyze -> decide/update -> checkpoint). Consumes goalRegistry +
// evolutionCheckpoint above; does not duplicate either. See
// src/evolution/EvolutionEngine.js for the full state machine and
// safety constraints (no AI, no network, no arbitrary code execution,
// approval-gated apply only).
const evolutionEngineModule = require("./src/evolution/EvolutionEngine");

// Phase 5: the real, read-only research boundary. Reuses whatever
// wikipediaService/dataSourcesService already are at the moment
// initEvolutionEngine() runs — by then initOfflineKnowledgeCache() has
// already reassigned those two `let`s to the offlineCache.wrapModule(...)
// wrapped versions, so Phase 5 research automatically gets the same
// cache-through / offline-fallback behavior as every other command that
// uses those services, with no separate cache of its own.
const { MultiSourceResearchProvider } = require("./src/evolution/researchProvider");
const { AssistantOrchestrator } = require("./src/assistant/assistantOrchestrator");

let wikipediaService = wikipediaServiceRaw;
let dataSourcesService = dataSourcesServiceRaw;
let offlineKnowledgeReady = false;
let backgroundKnowledgeWorker = null;
let assistantOrchestrator = null;
const pendingTaskPresentationRequests = new Map();

function requestPresentationFromRenderer(topic, context = {}) {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
        return Promise.resolve({ success: false, error: "The JARVIS window is unavailable; the presentation request was not started." });
    }
    const requestId = crypto.randomUUID();
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            pendingTaskPresentationRequests.delete(requestId);
            resolve({ success: false, error: "The existing presentation workflow did not return a result before its timeout." });
        }, 8 * 60 * 1000);
        pendingTaskPresentationRequests.set(requestId, { resolve, timeout });
        try {
            mainWindow.webContents.send("assistant:presentation:request", {
                requestId,
                topic,
                userRequest: String(context.userRequest || "").slice(0, 1000),
                research: context.research || null,
                sources: Array.isArray(context.sources) ? context.sources.slice(0, 8) : []
            });
        } catch (error) {
            clearTimeout(timeout);
            pendingTaskPresentationRequests.delete(requestId);
            resolve({ success: false, error: `Could not hand the request to the existing presentation workflow: ${String(error?.message || error).slice(0, 240)}` });
        }
    });
}

function initAssistantOrchestrator() {
    if (assistantOrchestrator) return assistantOrchestrator;
    const research = new MultiSourceResearchProvider({ wikipediaService, dataSourcesService });
    assistantOrchestrator = new AssistantOrchestrator({
        storagePath: path.join(app.getPath("userData"), "database", "assistant", "tasks.json"),
        allowedFileRoots: ["JARVIS Presentations", "JARVIS Documents", "JARVIS PDFs", "JARVIS Spreadsheets"].map(folder => path.join(app.getPath("documents"), folder)),
        research,
        presentation: { create: requestPresentationFromRenderer },
        systemAdapter: { openApplication: (name) => launchApplication(name) },
        browser: { open: (target) => {
            const name = String(target || "").trim().toLowerCase();
            const sites = { youtube: "https://www.youtube.com", google: "https://www.google.com", wikipedia: "https://www.wikipedia.org" };
            return createBrowserTab(sites[name] || target, { activate: true });
        } },
        getBrowserState: async () => getAllBrowserTabsSerialized(),
        verifyStep: async (task, step) => {
            if (step.action === "create_presentation" || step.action === "create_pdf" || step.action === "create_document") {
                return require("./src/assistant/taskVerifier").verifyGeneratedFile(task, step, {
                    allowedFileRoots: ["JARVIS Presentations", "JARVIS Documents", "JARVIS PDFs", "JARVIS Spreadsheets"].map(folder => path.join(app.getPath("documents"), folder))
                });
            }
            return null;
        },
        classifyRequest: async (request) => {
            const reply = await chatSelectedProvider([
                { role: "system", content: "Classify the user's request into exactly one category from: conversation, system_command, application_action, browser_action, research, memory, goal, evolution, unsupported. Reply with JSON only: {\"category\":\"...\"}. Do not provide steps or commands. If uncertain, use unsupported. This label only selects a fixed JARVIS allowlisted workflow; it cannot authorize destructive actions." },
                { role: "user", content: request }
            ], { temperature: 0, maxTokens: 80, timeoutMs: 12000, includeConversationHistory: false });
            if (!reply?.success || !reply.text) return null;
            const json = reply.text.match(/\{[^{}]{1,180}\}/)?.[0];
            if (!json) return null;
            try { return JSON.parse(json); } catch (_) { return null; }
        },
        processExists: async (pid) => {
            try { process.kill(pid, 0); return true; } catch (_) { return false; }
        },
        onUpdate: (task) => sendToRenderer("assistant:task-updated", task)
    });
    log("[TASK-AGENT] Persistent task agent and verifier initialized.");
    return assistantOrchestrator;
}

function registerAssistantTaskIPC() {
    const ownRenderer = (event) => !!(
        mainWindow && !mainWindow.isDestroyed() &&
        event?.sender === mainWindow.webContents &&
        (!event.senderFrame || event.senderFrame === mainWindow.webContents.mainFrame)
    );
    const emitTask = (task) => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("assistant:task-updated", task);
    };
    const guarded = (event, operation) => safeIPC("assistant task", async () => {
        if (!ownRenderer(event)) return failure("Task request rejected: renderer is not authorized.");
        return operation(initAssistantOrchestrator());
    });
    registerHandler("assistant:tasks:list", (event) => guarded(event, (agent) => ({ success: true, tasks: agent.getHistory() })));
    registerHandler("assistant:tasks:get", (event, taskId) => guarded(event, (agent) => {
        if (typeof taskId !== "string" || !/^TASK-\\d{6}$/.test(taskId)) return failure("Invalid task ID.");
        return { success: true, task: agent.getTask(taskId) };
    }));
    registerHandler("assistant:tasks:create", async (event, request) => guarded(event, async (agent) => {
        if (typeof request !== "string" || !request.trim() || request.length > 1000) return failure("Enter a task between 1 and 1000 characters.");
        const normalizedTaskRequest = request.trim().replace(/जेमिनाई/gi, "Gemini");
        const task = await agent.handleRequest(normalizedTaskRequest);
        emitTask(task);
        return { success: true, task };
    }));
    registerHandler("assistant:tasks:presentation-result", (event, requestId, result = {}) => {
        if (!ownRenderer(event)) return failure("Presentation task reply rejected: renderer is not authorized.");
        if (typeof requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(requestId)) return failure("Invalid presentation request ID.");
        const pending = pendingTaskPresentationRequests.get(requestId);
        if (!pending) return failure("This presentation request is no longer active.");
        clearTimeout(pending.timeout);
        pendingTaskPresentationRequests.delete(requestId);
        const safeResult = result && typeof result === "object" ? {
            success: result.success === true,
            path: String(result.path || result.filePath || "").slice(0, 1000),
            title: String(result.title || "").slice(0, 160),
            slideCount: Number.isFinite(Number(result.slideCount)) ? Number(result.slideCount) : undefined,
            verified: result.verified === true,
            opened: result.opened === true,
            error: String(result.error || "").slice(0, 500),
            aiProvider: String(result.aiProvider || "").slice(0, 80),
            usedLocalFallback: result.usedLocalFallback === true,
            jobId: String(result.jobId || "").slice(0, 80)
        } : { success: false, error: "The presentation workflow returned an invalid result." };
        pending.resolve(safeResult);
        return { success: true };
    });
    registerHandler("assistant:tasks:approve", async (event, taskId) => guarded(event, async (agent) => {
        if (typeof taskId !== "string" || !/^TASK-\\d{6}$/.test(taskId)) return failure("Invalid task ID.");
        const result = await agent.approveTask(taskId);
        if (result.task) emitTask(result.task);
        return result;
    }));
    registerHandler("assistant:tasks:cancel", (event, taskId) => guarded(event, (agent) => {
        if (typeof taskId !== "string" || !/^TASK-\\d{6}$/.test(taskId)) return failure("Invalid task ID.");
        const result = agent.cancelTask(taskId);
        if (result.task) emitTask(result.task);
        return result;
    }));
    log("[TASK-AGENT] Secure task IPC registered.");
}

function initBackgroundKnowledgeWorker() {
    if (backgroundKnowledgeWorker) return backgroundKnowledgeWorker;

    try {
        initOfflineKnowledgeCache();

        backgroundKnowledgeWorker = new BackgroundKnowledgeLearning({
            offlineCache,
            wikipediaService,
            dataSourcesService,
            emit: (event) => {
                // Renderer receives only structured events produced by the
                // real worker. No demo/activity strings are generated here.
                sendToRenderer("background-learning:event", event);
            }
        });

        log("[BACKGROUND-LEARNING] Worker initialized (OFF by default).");
    } catch (error) {
        errorLog("[BACKGROUND-LEARNING] Failed to initialize:", error);
        backgroundKnowledgeWorker = null;
    }

    return backgroundKnowledgeWorker;
}

function registerBackgroundLearningIPC() {
    registerHandler("background-learning:status", async () =>
        safeIPC("background-learning:status", async () =>
            (initBackgroundKnowledgeWorker() || { getDashboard: async () => ({ success: false, error: "Worker unavailable." }) }).getDashboard()
        )
    );

    registerHandler("background-learning:start", async () =>
        safeIPC("background-learning:start", async () => {
            const worker = initBackgroundKnowledgeWorker();
            if (!worker) return failure("Background learning worker is unavailable.");
            return worker.start();
        })
    );

    registerHandler("background-learning:stop", async () =>
        safeIPC("background-learning:stop", async () => {
            const worker = initBackgroundKnowledgeWorker();
            if (!worker) return failure("Background learning worker is unavailable.");
            return worker.stop(true);
        })
    );

    registerHandler("background-learning:enable", async () =>
        safeIPC("background-learning:enable", async () => {
            const worker = initBackgroundKnowledgeWorker();
            if (!worker) return failure("Background learning worker is unavailable.");
            return worker.start({ persist: true });
        })
    );

    registerHandler("background-learning:disable", async () =>
        safeIPC("background-learning:disable", async () => {
            const worker = initBackgroundKnowledgeWorker();
            if (!worker) return failure("Background learning worker is unavailable.");
            worker.setEnabled(false);
            return worker.getStatus();
        })
    );

    registerHandler("background-learning:cycle", async () =>
        safeIPC("background-learning:cycle", async () => {
            const worker = initBackgroundKnowledgeWorker();
            if (!worker) return failure("Background learning worker is unavailable.");
            return worker.cycleNow();
        })
    );

    registerHandler("background-learning:configure", async (_event, config = {}) =>
        safeIPC("background-learning:configure", async () => {
            const worker = initBackgroundKnowledgeWorker();
            if (!worker) return failure("Background learning worker is unavailable.");
            return worker.configure(config);
        })
    );

    registerHandler("background-learning:knowledge-search", async (_event, query = "", limit = 20) =>
        safeIPC("background-learning:knowledge-search", async () => ({
            success: true,
            results: offlineCache.searchKnowledge(query, limit)
        }))
    );

    log("[BACKGROUND-LEARNING] IPC registered.");
}

function initOfflineKnowledgeCache() {
    if (offlineKnowledgeReady) return;

    // Keep the cache as a fallback, while allowing live data providers.
    offlineCache.setOfflineOnly(false);

    try {
        offlineCache.init(app.getPath("userData"));
        mistakeLearning.init(app.getPath("userData"));

        wikipediaService = offlineCache.wrapModule(wikipediaServiceRaw, "wikipedia");
        dataSourcesService = offlineCache.wrapModule(dataSourcesServiceRaw, "dataSources");

        offlineKnowledgeReady = true;

        log("📦 Offline knowledge cache + mistake-learning store ready.");
    } catch (error) {
        errorLog("[OFFLINE-CACHE] Failed to initialise:", error);
        // Keep the offline gate even when disk cache initialization fails.
        wikipediaService = offlineCache.wrapModule(wikipediaServiceRaw, "wikipedia");
        dataSourcesService = offlineCache.wrapModule(dataSourcesServiceRaw, "dataSources");
    }
}

let consciousnessLayer = null;
let memoryEngine = null;
let evolutionRegistryReady = false;

/**
 * Final Goal Registry (Phase 2 of the Self-Improvement system).
 * Lazily initialized the same way initMemory()/initConsciousness()
 * are below — safe to call repeatedly, only sets up storage once.
 *
 * NOTE: this only loads/persists the 39-goal registry itself. It
 * does NOT start any background research/evolution activity — that
 * is the Background Evolution Engine, a later phase, and it will be
 * gated behind the per-session Self-Improvement permission dialog
 * described in the project brief. Phase 2 is data + persistence only.
 */
function initGoalRegistry() {
    if (!evolutionRegistryReady) {
        const result = goalRegistry.init(
            path.join(__dirname, "src", "database", "evolution", "goalRegistry.json")
        );

        evolutionRegistryReady = true;

        if (result.recovered) {
            warn("[EVOLUTION] Goal registry file was invalid and has been re-seeded.", result);
        } else {
            log("[EVOLUTION] Final Goal Registry initialized.", {
                seeded: result.seeded,
                goals: result.goals
            });
        }
    }
    return goalRegistry;
}

let evolutionCheckpointReady = false;

/**
 * Persistent Evolution Checkpoint (Phase 3). Lazily initialized the
 * same way initGoalRegistry() is above. Loading this never resets
 * existing progress — see src/evolution/checkpoint.js for the
 * restart-safety guarantees.
 */
function initEvolutionCheckpoint() {
    if (!evolutionCheckpointReady) {
        const result = evolutionCheckpoint.init(
            path.join(__dirname, "src", "database", "evolution", "checkpoint.json")
        );

        evolutionCheckpointReady = true;

        if (result.recovered) {
            warn("[EVOLUTION] Checkpoint file was invalid and has been re-seeded.", result);
        } else {
            log("[EVOLUTION] Checkpoint restored.", {
                created: result.created,
                checkpointId: result.checkpoint.checkpointId,
                currentGoal: result.checkpoint.currentGoal,
                currentPhase: result.checkpoint.currentPhase,
                progress: result.checkpoint.progress
            });
        }
    }
    return evolutionCheckpoint;
}

let evolutionEngineReady = false;

/**
 * Background Evolution Engine (Phase 4). Lazily initialized the same
 * way initGoalRegistry()/initEvolutionCheckpoint() are above, and only
 * after both of those have run since the engine consumes them directly.
 * Constructing it does NOT start any activity by itself — it only
 * resumes whatever state the Phase 3 checkpoint already recorded
 * (idle, if nothing was in progress). Actually running a cycle requires
 * an explicit evolution:start call, and applying a change additionally
 * requires the per-session permission gate to be turned on and the
 * specific proposal to be approved — see EvolutionEngine.js.
 */
function initEvolutionEngine() {
    if (!evolutionEngineReady) {
        initGoalRegistry();
        initEvolutionCheckpoint();

        evolutionEngineModule.getInstance({
            goalRegistry,
            checkpoint: evolutionCheckpoint,
            storageDir: path.join(__dirname, "src", "database", "evolution"),
            // Phase 5: real, read-only research via the project's existing
            // Wikipedia/Wikidata services (already offline-cache-wrapped by
            // initOfflineKnowledgeCache() above, which always runs first).
            researchProvider: new MultiSourceResearchProvider({
                wikipediaService,
                dataSourcesService
            })
        });

        evolutionEngineReady = true;
        log("[EVOLUTION] Background Evolution Engine ready (Phase 4 + Phase 5 research).");
    }
    return evolutionEngineModule.getInstance();
}

function initConsciousness() {
    if (!consciousnessLayer) {
        consciousnessLayer = new ConsciousnessLayer({
            storagePath: path.join(__dirname, "src", "database", "consciousness.json")
        });
        log("Consciousness layer initialized.");
    }
    return consciousnessLayer;
}

function initMemory() {
    if (!memoryEngine) {
        memoryEngine = new MemoryEngine({
            storagePath: path.join(app.getPath("userData"), "database", "memory.json")
        });

        // FIX: saveToAvailableMemory()/readFromAvailableMemory() (the
        // "memory bridge" used elsewhere in this file) only ever look
        // at global.MemoryManager / global.MemoryManagerAgent /
        // global.JARVISMemory — none of which were ever set, so every
        // call through that bridge silently failed with "Memory engine
        // is not available." Wire the real, disk-persisted engine in.
        global.JARVISMemory = {
            save: (key, value) => {
                memoryEngine.remember(key, value, { source: "bridge" });
                return true;
            },
            get: (key) => memoryEngine.recall(key)
        };

        log("Memory engine initialized.");
    }
    return memoryEngine;
}

// ============================================================
// USER SYSTEM — initialize multi-user architecture on startup.
// Migrates legacy memory if needed, ensures guest, sets active.
// ============================================================
function initUserSystem() {
    try {
        const userDataRoot = path.join(app.getPath("userData"), "database");
        userManager.configureDataDirectory(userDataRoot, {
            migrateFrom: app.isPackaged ? null : path.join(__dirname, "src", "database")
        });
        const result = userManager.initialize();
        log(`User system initialized: ${result.userCount} user(s), active: ${result.activeUserId}`);
        return result;
    } catch (userError) {
        console.warn("[UserSystem] init failed (non-fatal):", userError?.message || userError);
        return { activeUserId: null, userCount: 0 };
    }
}


function getActiveUserMemory() {
    initUserSystem();
    const userId = userManager.getActiveUserId();
    if (!userId) return null;
    return userMemory.getEngine(userId);
}

 /* ============================================================
  * VERSION
  * ============================================================
  */

 const MAIN_VERSION = "14.2.0";


 /* ============================================================
  * GLOBAL STATE
  * ============================================================
  */

 let mainWindow = null;

 let appReady = false;

 let shuttingDown = false;

 let startupComplete = false;

 // BUG FIX (ERROR_LOG E012): this was previously never declared with
 // let/var/const anywhere, but was both assigned (inside a dead
 // app.whenReady() block — see E012) and read inside the always-live
 // "before-quit" handler further down. Under "use strict" (top of this
 // file), reading an undeclared identifier throws a ReferenceError,
 // which meant every real app quit crashed inside before-quit and
 // skipped saveChatHistoryToDisk() (the final safety flush). Declaring
 // it here fixes that regardless of where the interval itself is set.
 let consciousnessHeartbeat = null;


 /* ============================================================
  * CHAT STATE
  * ============================================================
  */

 let chatHistory = [];

 const MAX_CHAT_HISTORY = 500;

 /* ============================================================
  * PERMANENT CHAT MEMORY (disk-backed)
  * ============================================================
  * FIX: chatHistory previously lived only in this in-memory array.
  * Every registerChatIPC() implementation in this file (there were
  * two, and the later declaration silently shadowed the first)
  * only ever mutated this array — nothing wrote it to disk, and
  * nothing loaded it back on the next launch, so "JARVIS memory"
  * was wiped every time the app closed. This makes it permanent:
  * every save is flushed to src/database/chat_history.json, and
  * it is read back in immediately below, before any window opens.
  */

 const CHAT_HISTORY_FILE = path.join(
     __dirname, "src", "database", "chat_history.json"
 );

 function loadChatHistoryFromDisk() {
     try {
         if (fs.existsSync(CHAT_HISTORY_FILE)) {
             const raw = fs.readFileSync(CHAT_HISTORY_FILE, "utf8").trim();
             if (raw) {
                 const parsed = JSON.parse(raw);
                 if (Array.isArray(parsed)) {
                     chatHistory = parsed.slice(-MAX_CHAT_HISTORY);
                 }
             }
         }
     } catch (error) {
         console.error(
             "[MEMORY] Failed to load chat_history.json, starting clean:",
             error.message
         );
         chatHistory = [];
     }
     return chatHistory;
 }

 function saveChatHistoryToDisk() {
     try {
         fs.mkdirSync(path.dirname(CHAT_HISTORY_FILE), { recursive: true });
         fs.writeFileSync(
             CHAT_HISTORY_FILE,
             JSON.stringify(chatHistory.slice(-MAX_CHAT_HISTORY), null, 2),
             "utf8"
         );
         return true;
     } catch (error) {
         console.error(
             "[MEMORY] Failed to save chat_history.json:",
             error.message
         );
         return false;
     }
 }

 // Restore past conversations immediately — before any window is
 // created — so JARVIS "remembers" as soon as it starts up.
 loadChatHistoryFromDisk();


 /* ============================================================
  * IPC REGISTRATION STATE
  * ============================================================
  *
  * Prevents duplicate ipcMain.handle() / ipcMain.on()
  * registrations.
  *
  * This is important because duplicate handlers can cause:
  *
  * "Attempted to register a second handler"
  *
  * ============================================================
  */

 const registeredHandlers = new Set();

 const registeredListeners = new Set();


 /* ============================================================
  * LOGGING
  * ============================================================
  */

 function log(...args) {
     console.log("[JARVIS MAIN]", ...args);
 }

 function warn(...args) {
     console.warn("[JARVIS MAIN]", ...args);
 }

 function errorLog(...args) {
     console.error("[JARVIS MAIN]", ...args);
 }



 /* ============================================================
  * SAFE ERROR SERIALIZATION
  * ============================================================
  *
  * Electron IPC responses should contain predictable,
  * serializable values.
  *
  * ============================================================
  */

 function getErrorMessage(error) {
     if (!error) {
         return "Unknown error";
     }

     if (error instanceof Error) {
         return error.message || "Unknown error";
     }

     if (typeof error === "object") {
         try {
             return JSON.stringify(error);
         } catch {
             return "Unknown error";
         }
     }

     return String(error);
 }


 /* ============================================================
  * SAFE RESULT HELPERS
  * ============================================================
  */

 function success(data = {}) {
     return {
         success: true,
         ...data
     };
 }

 function failure(message, extra = {}) {
     return {
         success: false,
         error: String(message || "Unknown error"),
         ...extra
     };
 }

 /* ============================================================
  * SAFE STRING
  * ============================================================ */

 function safeString(value) {
     return String(value ?? "").trim();
 }


 /* ============================================================
  * IPC CHANNEL VALIDATION
  * ============================================================
  */

 function isValidChannel(channel) {
     return (
         typeof channel === "string" &&
         channel.trim().length > 0 &&
         channel.length <= 200
     );
 }


 /* ============================================================
  * SAFE IPC HANDLER REGISTRATION
  * ============================================================
  */


 /* ============================================================
  * SAFE IPC EVENT REGISTRATION
  * ============================================================
  */


 /* ============================================================
  * REMOVE IPC HANDLER SAFELY
  * ============================================================
  *
  * Useful during development/reload or future module
  * reinitialization.
  *
  * ============================================================
  */

 function removeHandler(channel) {

     if (!isValidChannel(channel)) {
         return false;
     }

     try {

         ipcMain.removeHandler(channel);

         registeredHandlers.delete(channel);

         log(
             `IPC handler removed: ${channel}`
         );

         return true;

     } catch (error) {

         errorLog(
             `Failed to remove IPC handler: ${channel}`,
             error
         );

         return false;
     }
 }


 /* ============================================================
  * REMOVE IPC LISTENER SAFELY
  * ============================================================
  */

 function removeListener(channel, listener) {

     if (!isValidChannel(channel)) {
         return false;
     }

     try {

         if (typeof listener === "function") {

             ipcMain.removeListener(
                 channel,
                 listener
             );

         } else {

             ipcMain.removeAllListeners(
                 channel
             );
         }

         registeredListeners.delete(channel);

         log(
             `IPC listener removed: ${channel}`
         );

         return true;

     } catch (error) {

         errorLog(
             `Failed to remove IPC listener: ${channel}`,
             error
         );

         return false;
     }
 }


 /* ============================================================
  * RENDERER COMMUNICATION
  * ============================================================
  */


 /* ============================================================
  * MAIN WINDOW VALIDATION
  * ============================================================
  */


 /* ============================================================
  * APPLICATION PATH HELPERS
  * ============================================================
  */

 function getPreloadPath() {

     return path.join(
         __dirname,
         "preload.js"
     );
 }




 function preloadExists() {

     return fs.existsSync(
         getPreloadPath()
     );
 }


 /* ============================================================
  * PATH INFORMATION
  * ============================================================
  */

 function getApplicationPaths() {

     try {

         return {
             appPath: app.getAppPath(),

             userData: app.getPath(
                 "userData"
             ),

             documents: app.getPath(
                 "documents"
             ),

             downloads: app.getPath(
                 "downloads"
             ),

             desktop: app.getPath(
                 "desktop"
             ),

             pictures: app.getPath(
                 "pictures"
             ),

             music: app.getPath(
                 "music"
             ),

             videos: app.getPath(
                 "videos"
             ),

             temp: app.getPath(
                 "temp"
             )
         };

     } catch (error) {

         errorLog(
             "Unable to read application paths:",
             error
         );

         return {};
     }
 }


 /* ============================================================
  * EXTERNAL URL VALIDATION
  * ============================================================
  */


 /* ============================================================
  * SAFE EXTERNAL URL OPEN
  * ============================================================
  */


 /* ============================================================
  * MAIN PROCESS DIAGNOSTICS
  * ============================================================
  */


 /* ============================================================
  * BASIC DIAGNOSTICS IPC
  * ============================================================
  *
  * This channel is intentionally kept in Part 1 because it is
  * useful for testing whether main.js itself is alive before
  * the remaining JARVIS modules are loaded.
  *
  * ============================================================
  */

 function registerDiagnosticsStatusIPC() {

     registerHandler(
         "diagnostics:main-status",
         async () => {

             return success({
                 data: getMainStatus()
             });

         }
     );

 }


 /* ============================================================
  * GLOBAL JARVIS MAIN ACCESS
  * ============================================================
  *
  * Other MAIN-process modules can use:
  *
  * global.JARVISMain
  *
  * Renderer should NEVER access this object directly.
  *
  * Renderer communication must go through preload.js.
  *
  * ============================================================
  */

 function createMainAPI() {

     return {

         version: MAIN_VERSION,

         status: () =>
             getMainStatus(),

         send: (
             channel,
             ...args
         ) =>
             sendToRenderer(
                 channel,
                 ...args
             ),

         window: {

             get:
                 () => mainWindow,

             exists:
                 () => hasValidMainWindow()

         },

         chat: {

             getHistory:
                 () => [...chatHistory],

             getCount:
                 () => chatHistory.length,

             clear:
                 () => {
                     chatHistory = [];
                 }

         },

         engines: () => ({
             // REAL deterministic health — the brain is a deterministic
             // module (no LLM), memory is the file-backed MemoryEngine.
             ai: typeof deterministicBrain.compose === "function",
             memory: Boolean(initMemory())
         })
     };
 }


 /* ============================================================
  * GLOBAL JARVIS MAIN OBJECT
  * ============================================================
  */

 global.JARVISMain = createMainAPI();


 /* ============================================================
  * PART 1 INITIALIZATION REPORT
  * ============================================================
  */

 function printPart1Report() {

     log(
         "============================================================"
     );

     log(
         "JARVIS PRO MAX — MAIN PROCESS PART 1"
     );

     log(
         "============================================================"
     );

     log(
         "Version:",
         MAIN_VERSION
     );

     log(
         "Electron:",
         process.versions.electron
     );

     log(
         "Node:",
         process.versions.node
     );

     log(
         "Platform:",
         process.platform
     );

     log(
         "Architecture:",
         process.arch
     );

     log(
         "Preload:",
         preloadExists()
     );

     log(
         "Renderer:",
         rendererExists()
     );

     log(
         "IPC Handlers:",
         registeredHandlers.size
     );

     log(
         "IPC Listeners:",
         registeredListeners.size
     );

     log(
         "============================================================"
     );

     log(
         "PART 1 CORE INITIALIZED"
     );

     log(
         "============================================================"
     );
 }


 /* ============================================================
  * PART 1 BASIC STARTUP
  * ============================================================
  *
  * IMPORTANT:
  *
  * Do NOT create BrowserWindow here.
  *
  * BrowserWindow + security configuration will be added in
  * PART 2.
  *
  * ============================================================
  */

 app.whenReady()
     .then(() => {

         if (shuttingDown) {

             warn(
                 "Startup cancelled because shutdown is active."
             );

             return;
         }

         appReady = true;
         recordStartupEvent("electron-ready");

         log(
             "Electron app is ready."
         );

         registerDiagnosticsIPC();

// Register Wikipedia at the earliest safe point as well.
// registerHandler() makes this idempotent with central startup.
         initOfflineKnowledgeCache();
        registerWikipediaIPC();
        registerDataSourcesIPC();
        registerOfflineKnowledgeIPC();
        registerMistakeLearningIPC();
        registerSuggestionsIPC();

        // Phase 2 — Final Goal Registry: load/seed at startup so its
        // state is available as soon as the renderer asks for it.
        initGoalRegistry();
        registerGoalRegistryIPC();

        // Phase 3 — Persistent Checkpoint: restore (never reset) the
        // engine's last known goal/phase/progress/next-action.
        initEvolutionCheckpoint();
        registerEvolutionCheckpointIPC();

        // Phase 4 — Background Evolution Engine: constructing it only
        // resumes existing checkpoint/registry state, it never starts a
        // cycle by itself (see initEvolutionEngine() above).
        initEvolutionEngine();
        registerEvolutionEngineIPC();

         printPart1Report();

     })
     .catch(error => {

         errorLog(
             "JARVIS PART 1 startup failed:",
             error
         );

     });


 /* ============================================================
  * BASIC APPLICATION LIFECYCLE
  * ============================================================
  */

 app.on(
     "window-all-closed",
     () => {

         log(
             "All application windows closed."
         );

         if (process.platform !== "darwin") {

             app.quit();

         }

     }
 );


 app.on(
     "before-quit",
     () => {

         if (shuttingDown) {
             return;
         }

         shuttingDown = true;

         if (backgroundKnowledgeWorker) {
             backgroundKnowledgeWorker.shutdown().catch((error) => errorLog("[BACKGROUND-LEARNING] Shutdown error:", error));
         }

         log(
             "JARVIS shutdown requested."
         );

         sendToRenderer(
             "system:shutdown",
             {
                 timestamp: Date.now()
             }
         );

     }
 );


 app.on(
     "will-quit",
     () => {

         log(
             "JARVIS will quit."
         );

         appReady = false;

         startupComplete = false;

     }
 );


 /* ============================================================
  * PROCESS ERROR HANDLING
  * ============================================================
  */

 process.on(
     "uncaughtException",
     error => {

         errorLog(
             "UNCAUGHT EXCEPTION:",
             error
         );

         if (hasValidMainWindow()) {

             sendToRenderer(
                 "system:main-error",
                 {
                     type: "uncaughtException",

                     message:
                         getErrorMessage(error),

                     timestamp:
                         Date.now()
                 }
             );

         }

     }
 );


 process.on(
     "unhandledRejection",
     reason => {

         errorLog(
             "UNHANDLED PROMISE REJECTION:",
             reason
         );

         if (hasValidMainWindow()) {

             sendToRenderer(
                 "system:main-error",
                 {
                     type: "unhandledRejection",

                     message:
                         getErrorMessage(reason),

                     timestamp:
                         Date.now()
                 }
             );

         }

     }
 );


 /* ============================================================
  * PART 1 EXPORTS FOR MAIN-PROCESS MODULES
  * ============================================================
  *
  * These functions are exposed through global.JARVISMainCore
  * for other MAIN-process modules.
  *
  * They are NOT exposed to renderer.
  *
  * ============================================================
  */

 global.JARVISMainCore = {

     version:
         MAIN_VERSION,

     log,

     warn,

     errorLog,

     success,

     failure,

     getErrorMessage,

     isValidChannel,

     registerHandler,

     registerListener,

     removeHandler,

     removeListener,

     sendToRenderer,

     hasValidMainWindow,

     getPreloadPath,

     getRendererPath,

     rendererExists,

     preloadExists,

     getApplicationPaths,

     isAllowedExternalURL,

     openExternalURL,

     getMainStatus,

     getMainWindow:
         () => mainWindow,

     setMainWindow:
         window => {
             mainWindow = window;
         },

     getChatHistory:
         () => [...chatHistory],

     setAppReady:
         value => {
             appReady = Boolean(value);
         },

     setStartupComplete:
         value => {
             startupComplete = Boolean(value);
         },

     isShuttingDown:
         () => shuttingDown
 };


 /* ============================================================
  * JARVIS PRO MAX V14.2 — PART 1 END
  * ============================================================
  */

 "use strict";

 /* ============================================================
  * JARVIS PRO MAX
  * MAIN PROCESS
  * V14.1.1 PRODUCTION — PART 2
  * ============================================================
  *
  * PART 2:
  * - Window Security
  * - Renderer Navigation Protection
  * - External URL Handling
  * - Window Controls
  * - Safe IPC Wrapper
  * - Window IPC
  * ============================================================ */


 /* ============================================================
  * WINDOW CONFIGURATION
  * ============================================================ */

 const WINDOW_CONFIG = {
     width: 1400,
     height: 900,

     minWidth: 1000,
     minHeight: 650,

     show: false,

     backgroundColor: "#05080d",

     webPreferences: {
         preload: path.join(__dirname, "preload.js"),

         contextIsolation: true,

         nodeIntegration: false,

         sandbox: true,

         webSecurity: true,

         allowRunningInsecureContent: false,

         spellcheck: true
     }
 };


 /* ============================================================
  * RENDERER PATH
  * ============================================================ */

 function getRendererPath() {
     return path.join(
         __dirname,
         "renderer",
         "index.html"
     );
 }


 function rendererExists() {
     return fs.existsSync(
         getRendererPath()
     );
 }


 /* ============================================================
  * WINDOW VALIDATION
  * ============================================================ */

 function hasValidMainWindow() {

     return Boolean(
         mainWindow &&
         !mainWindow.isDestroyed()
     );
 }


 function validateWindowConfig() {

     const preloadPath =
         WINDOW_CONFIG.webPreferences.preload;

     if (!fs.existsSync(preloadPath)) {

         errorLog(
             "❌ Preload script not found:",
             preloadPath
         );

         return false;
     }


     const rendererPath =
         getRendererPath();

     if (!fs.existsSync(rendererPath)) {

         errorLog(
             "❌ Renderer index.html not found:",
             rendererPath
         );

         return false;
     }


     return true;
 }


 /* ============================================================
  * EXTERNAL URL VALIDATION
  * ============================================================ */


 /* ============================================================
  * OPEN EXTERNAL URL
  * ============================================================ */


 /* ============================================================
  * CREATE MAIN WINDOW
  * ============================================================ */

 function createMainWindow() {

     /* --------------------------------------------------------
      * Prevent duplicate windows
      * -------------------------------------------------------- */

     if (hasValidMainWindow()) {

         warn(
             "⚠ Main window already exists."
         );

         try {

             mainWindow.show();
             mainWindow.focus();

         } catch (error) {

             errorLog(
                 "Unable to focus existing window:",
                 error
             );
         }


         return mainWindow;
     }


     /* --------------------------------------------------------
      * Validate required files
      * -------------------------------------------------------- */

     if (!validateWindowConfig()) {

         errorLog(
             "❌ Window validation failed."
         );

         return null;
     }


     try {

         log(
             "🪟 Creating JARVIS main window..."
         );
         recordStartupEvent("main-window-create-begin");


         mainWindow =
             new BrowserWindow(
                 WINDOW_CONFIG
             );


         log(
             "✅ BrowserWindow created."
         );
         recordStartupEvent("main-window-created");


         /* ====================================================
          * READY TO SHOW
          * ==================================================== */

         mainWindow.once(
             "ready-to-show",
             () => {

                 if (
                     !mainWindow ||
                     mainWindow.isDestroyed()
                 ) {
                     return;
                 }


                 try {

                     mainWindow.show();
                     recordStartupEvent("main-window-visible", { reason: "ready-to-show" });

                     log(
                         "🟢 JARVIS window shown."
                     );

                 } catch (error) {

                     errorLog(
                         "Window show failed:",
                         error
                     );
                 }
             }
         );


         /* ====================================================
          * WINDOW CLOSED
          * ==================================================== */

         mainWindow.on(
             "closed",
             () => {

                 log(
                     "🔴 JARVIS main window closed."
                 );

                 mainWindow = null;
             }
         );


         /* ====================================================
          * RENDERER UNRESPONSIVE
          * ==================================================== */

         mainWindow.on(
             "unresponsive",
             () => {

                 warn(
                     "⚠ JARVIS renderer became unresponsive."
                 );


                 sendToRenderer(
                     "system:renderer-unresponsive",
                     {
                         timestamp: Date.now()
                     }
                 );
             }
         );


         /* ====================================================
          * RENDERER RESPONSIVE
          * ==================================================== */

         mainWindow.on(
             "responsive",
             () => {

                 log(
                     "🟢 JARVIS renderer responsive again."
                 );


                 sendToRenderer(
                     "system:renderer-responsive",
                     {
                         timestamp: Date.now()
                     }
                 );
             }
         );


         /* ====================================================
          * LOAD START
          * ==================================================== */

         mainWindow.webContents.on(
             "did-start-loading",
             () => {
                 recordStartupEvent("renderer-load-started");

                 log(
                     "📥 Renderer loading started."
                 );
             }
         );


         /* ====================================================
          * LOAD COMPLETE
          * ==================================================== */

         mainWindow.webContents.on(
             "did-stop-loading",
             () => {
                 recordStartupEvent("renderer-load-finished");

                 log(
                     "📦 Renderer loading finished."
                 );
             }
         );

         mainWindow.webContents.on("did-finish-load", () => {
             recordStartupEvent("renderer-ready", { urlScheme: mainWindow?.webContents?.getURL?.().startsWith("file:") ? "file" : "other" });
             // A renderer that finishes loading should not remain hidden if a
             // platform-specific ready-to-show event was missed.
             if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
                 mainWindow.show();
                 recordStartupEvent("main-window-visible", { reason: "did-finish-load" });
             }
         });

         mainWindow.webContents.on("preload-error", (_event, preloadPath, error) => {
             recordStartupEvent("preload-error", {
                 preload: path.basename(String(preloadPath || "preload.js")),
                 message: String(error?.message || error || "unknown").slice(0, 240)
             });
             errorLog("JARVIS preload failed:", String(error?.message || error || "unknown"));
         });

         const startupWindow = mainWindow;
         const showFallbackTimer = setTimeout(() => {
             if (mainWindow === startupWindow && !startupWindow.isDestroyed() && !startupWindow.isVisible()) {
                 startupWindow.show();
                 recordStartupEvent("main-window-visible", { reason: "startup-timeout-fallback" });
             }
         }, 12000);
         if (typeof showFallbackTimer.unref === "function") showFallbackTimer.unref();


         /* ====================================================
          * RENDERER LOAD FAILURE
          * ==================================================== */

         mainWindow.webContents.on(
             "did-fail-load",
             (
                 event,
                 errorCode,
                 errorDescription,
                 validatedURL,
                 isMainFrame
             ) => {

                 if (!isMainFrame) {
                     return;
                 }


                 errorLog(
                     "❌ Renderer failed to load."
                 );

                 errorLog(
                     "Error Code:",
                     errorCode
                 );

                 errorLog(
                     "Description:",
                     errorDescription
                 );

                 errorLog(
                     "URL:",
                     validatedURL
                 );
                 recordStartupEvent("renderer-load-failed", {
                     errorCode: Number(errorCode),
                     errorDescription: String(errorDescription || "").slice(0, 200),
                     mainFrame: Boolean(isMainFrame)
                 });
                 if (Number(errorCode) !== -3) {
                     if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show();
                     dialog.showErrorBox(
                         "JARVIS interface could not load",
                         String(errorDescription || "Renderer loading failed").slice(0, 300) +
                             "\n\nCheck the startup log at " +
                             path.join(app.getPath("userData"), "logs", "startup.log")
                     );
                 }
             }
         );


         /* ====================================================
          * RENDER PROCESS GONE
          * ==================================================== */

         mainWindow.webContents.on(
             "render-process-gone",
             (
                 event,
                 details
             ) => {

                 errorLog(
                     "❌ Renderer process terminated."
                 );


                 errorLog(
                     "Reason:",
                     details?.reason
                 );


                 errorLog(
                     "Exit Code:",
                     details?.exitCode
                 );
                 recordStartupEvent("renderer-process-gone", {
                     reason: String(details?.reason || "unknown"),
                     exitCode: Number.isFinite(details?.exitCode) ? details.exitCode : null
                 });


                 sendToRenderer(
                     "system:renderer-gone",
                     {
                         reason:
                             details?.reason ||
                             "unknown",

                         exitCode:
                             details?.exitCode ??
                             null,

                         timestamp:
                             Date.now()
                     }
                 );
             }
         );


         /* ====================================================
          * RENDERER CONSOLE BRIDGE
          * ==================================================== */

         mainWindow.webContents.on(
             "console-message",
             (
                 event,
                 level,
                 message,
                 line,
                 sourceId
             ) => {

                 const levelNames = [
                     "INFO",
                     "WARNING",
                     "ERROR",
                     "DEBUG"
                 ];


                 const levelName =
                     levelNames[level] ||
                     "INFO";


                 if (level >= 2) {

                     recordStartupEvent("renderer-console-error", {
                         source: path.basename(String(sourceId || "renderer")),
                         line: Number(line) || 0,
                         level: Number(level)
                     });

                     warn(
                         `[Renderer ${levelName}]`,
                         message,
                         `(${sourceId}:${line})`
                     );

                 } else {

                     log(
                         `[Renderer ${levelName}]`,
                         message
                     );
                 }
             }
         );


         /* ====================================================
          * DEVTOOLS OPENED
          * ==================================================== */

         mainWindow.webContents.on(
             "devtools-opened",
             () => {

                 log(
                     "🛠 Developer Tools opened."
                 );
             }
         );


         /* ====================================================
          * DEVTOOLS CLOSED
          * ==================================================== */

         mainWindow.webContents.on(
             "devtools-closed",
             () => {

                 log(
                     "🛠 Developer Tools closed."
                 );
             }
         );


         /* ====================================================
          * NAVIGATION SECURITY
          * ==================================================== */

         mainWindow.webContents.on(
             "will-navigate",
             (
                 event,
                 navigationUrl
             ) => {

                 const url =
                     String(
                         navigationUrl || ""
                     );


                 /*
                  * Local renderer navigation is allowed.
                  */

                 if (
                     url.startsWith(
                         "file://"
                     )
                 ) {

                     return;
                 }


                 /*
                  * Block every non-local
                  * renderer navigation.
                  */

                 event.preventDefault();


                 warn(
                     "🚫 Blocked renderer navigation:",
                     url
                 );


                 /*
                  * HTTP/HTTPS links are opened
                  * externally.
                  */

                 if (
                     isAllowedExternalURL(url)
                 ) {

                     openExternalURL(url)
                         .catch(error => {

                             errorLog(
                                 "External navigation failed:",
                                 error
                             );
                         });
                 }
             }
         );


         /* ====================================================
          * WINDOW.OPEN SECURITY
          * ==================================================== */

         mainWindow.webContents.setWindowOpenHandler(
             ({ url }) => {

                 log(
                     "Window open request:",
                     url
                 );


                 if (
                     isAllowedExternalURL(url)
                 ) {

                     openExternalURL(url)
                         .catch(error => {

                             errorLog(
                                 "External window open failed:",
                                 error
                             );
                         });
                 }


                 /*
                  * Never create an uncontrolled
                  * Electron child window.
                  */

                 return {
                     action: "deny"
                 };
             }
         );


         /* ====================================================
          * LOAD RENDERER
          * ==================================================== */

         const rendererPath =
             getRendererPath();


         log(
             "📂 Loading renderer:",
             rendererPath
         );


         mainWindow
             .loadFile(rendererPath)
             .catch(error => {

                 errorLog(
                     "❌ Renderer loadFile() failed:",
                     error
                 );
             });


         log(
             "✅ Main window initialization complete."
         );


         return mainWindow;

     } catch (error) {

         errorLog(
             "🔥 FATAL: Main window creation failed:",
             error
         );


         mainWindow = null;


         return null;
     }
 }


 /* ============================================================
  * WINDOW CONTROL FUNCTIONS
  * ============================================================ */

 function reloadRenderer() {

     if (!hasValidMainWindow()) {

         return failure(
             "Main window is not available."
         );
     }


     try {

         mainWindow.webContents.reload();


         log(
             "🔄 Renderer reload requested."
         );


         return success();

     } catch (error) {

         errorLog(
             "Renderer reload failed:",
             error
         );


         return failure(
             error?.message ||
             String(error)
         );
     }
 }


 /* ============================================================
  * SHOW WINDOW
  * ============================================================ */

 function showMainWindow() {

     if (!hasValidMainWindow()) {

         return failure(
             "Main window is not available."
         );
     }


     try {

         if (
             mainWindow.isMinimized()
         ) {

             mainWindow.restore();
         }


         mainWindow.show();
         mainWindow.focus();


         return success();

     } catch (error) {

         errorLog(
             "Unable to show main window:",
             error
         );


         return failure(
             error?.message ||
             String(error)
         );
     }
 }


 /* ============================================================
  * HIDE WINDOW
  * ============================================================ */

 function hideMainWindow() {

     if (!hasValidMainWindow()) {

         return failure(
             "Main window is not available."
         );
     }


     try {

         mainWindow.hide();


         return success();

     } catch (error) {

         errorLog(
             "Unable to hide main window:",
             error
         );


         return failure(
             error?.message ||
             String(error)
         );
     }
 }


 /* ============================================================
  * MINIMIZE WINDOW
  * ============================================================ */

 function minimizeMainWindow() {

     if (!hasValidMainWindow()) {

         return failure(
             "Main window is not available."
         );
     }


     try {

         mainWindow.minimize();


         return success();

     } catch (error) {

         errorLog(
             "Unable to minimize main window:",
             error
         );


         return failure(
             error?.message ||
             String(error)
         );
     }
 }


 /* ============================================================
  * MAXIMIZE / RESTORE
  * ============================================================ */

 function toggleMaximizeMainWindow() {

     if (!hasValidMainWindow()) {

         return failure(
             "Main window is not available."
         );
     }


     try {

         if (
             mainWindow.isMaximized()
         ) {

             mainWindow.unmaximize();

         } else {

             mainWindow.maximize();
         }


         return success({
             maximized:
                 mainWindow.isMaximized()
         });

     } catch (error) {

         errorLog(
             "Unable to toggle maximize:",
             error
         );


         return failure(
             error?.message ||
             String(error)
         );
     }
 }


 /* ============================================================
  * SAFE IPC OPERATION WRAPPER
  * ============================================================ */

const backgroundJobs = new Map();
const backgroundJobControllers = new Map();
let backgroundJobsRestored = false;

function persistBackgroundJobs() {
    try {
        const filePath = path.join(app.getPath("userData"), "background-jobs.json");
        const snapshot = [...backgroundJobs.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 100);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), "utf8");
    } catch (error) { console.warn("[JOBS] Could not save job history:", error?.message || error); }
}

function restoreBackgroundJobs() {
    if (backgroundJobsRestored) return;
    backgroundJobsRestored = true;
    try {
        const filePath = path.join(app.getPath("userData"), "background-jobs.json");
        const items = JSON.parse(fs.readFileSync(filePath, "utf8"));
        if (!Array.isArray(items)) return;
        for (const item of items.slice(0, 100)) {
            if (!item || typeof item.id !== "string" || typeof item.type !== "string") continue;
            const restored = { ...item, cancelRequested: false };
            if (["queued", "running", "cancelling"].includes(restored.state)) {
                restored.state = "failed";
                const canResume = (restored.type === "presentation" && restored.payload?.checkpoint?.stage === "deck-ready") || (restored.type === "pdf" && ["references-ready", "content-ready"].includes(restored.payload?.checkpoint?.stage));
                restored.stage = canResume ? "Interrupted · safe checkpoint ready" : "Interrupted by app restart";
                restored.error = canResume
                    ? restored.type === "pdf" ? "The saved research and document content are ready. Resume to render the PDF without repeating those steps." : "The slide content and saved visuals are ready. Resume from the checkpoint to finish the PPTX."
                    : "This job stopped when JARVIS closed. Retry from the start in the job center.";
                restored.updatedAt = Date.now();
            }
            backgroundJobs.set(restored.id, restored);
        }
        persistBackgroundJobs();
    } catch (_) { /* No saved jobs yet. */ }
}

function publishBackgroundJobs() {
    const jobs = [...backgroundJobs.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 50);
    sendToRenderer("background-jobs:update", { jobs });
}

function createBackgroundJob(type, title, payload = {}) {
    const now = Date.now();
    const record = {
        id: crypto.randomUUID(), type, title: String(title || type).slice(0, 160), payload,
        state: "queued", progress: 0, stage: "Queued", createdAt: now, updatedAt: now,
        cancelRequested: false, error: "", resultPath: ""
    };
    backgroundJobs.set(record.id, record);
    backgroundJobControllers.set(record.id, new AbortController());
    persistBackgroundJobs();
    publishBackgroundJobs();
    return record;
}

function updateBackgroundJob(id, patch = {}) {
    const record = backgroundJobs.get(id);
    if (!record) return null;
    const previousState = record.state;
    Object.assign(record, patch, { updatedAt: Date.now() });
    persistBackgroundJobs();
    if (["completed", "failed", "cancelled"].includes(record.state)) backgroundJobControllers.delete(id);
    if (previousState !== record.state && ["completed", "failed"].includes(record.state)) {
        try {
            notificationCenter.add({
                category: "TASK",
                type: record.state === "completed" ? "SUCCESS" : "ERROR",
                title: record.state === "completed" ? "JARVIS task completed" : "JARVIS task failed",
                message: `${record.title}${record.error ? ` · ${record.error}` : ""}`,
                priority: record.state === "failed" ? "high" : "normal",
                source: "background-job"
            });
        } catch (error) { console.warn("[JOBS] Could not notify task status:", error?.message || error); }
    }
    publishBackgroundJobs();
    return record;
}

function assertBackgroundJobActive(id) {
    const record = backgroundJobs.get(id);
    if (record?.cancelRequested) {
        const error = new Error("Job cancelled by user.");
        error.code = "JOB_CANCELLED";
        error.jobId = id;
        throw error;
    }
}

function backgroundJobSignal(id) { return backgroundJobControllers.get(id)?.signal; }

 async function safeIPC(
     operationName,
     operation
 ) {

     try {

         if (
             typeof operation !==
             "function"
         ) {

             return failure(
                 `Invalid IPC operation: ${operationName}`
             );
         }


         return await operation();

     } catch (error) {

         if (error?.jobId && backgroundJobs.has(error.jobId)) {
             updateBackgroundJob(error.jobId, {
                 state: error.code === "JOB_CANCELLED" ? "cancelled" : "failed",
                 stage: error.code === "JOB_CANCELLED" ? "Cancelled" : "Failed",
                 error: error.code === "JOB_CANCELLED" ? "" : String(error?.message || error).slice(0, 400)
             });
         }

         errorLog(
             `IPC operation failed: ${operationName}`,
             error
         );


         return failure(
             error?.message ||
             String(error)
         );
     }
 }

function runTrackedBackgroundJob(event, type, title, payload, operation) {
    const job = createBackgroundJob(type, title, payload);
    updateBackgroundJob(job.id, { state: "running", progress: 5, stage: "Starting" });
    const progress = (stage, percent = 40) => {
        assertBackgroundJobActive(job.id);
        updateBackgroundJob(job.id, { state: "running", stage: String(stage || "Working"), progress: Math.max(0, Math.min(99, Number(percent) || 0)) });
        try { if (event?.sender && !event.sender.isDestroyed()) event.sender.send("background-jobs:update", { jobs: [...backgroundJobs.values()] }); } catch (_) {}
    };
    return safeIPC(type, async () => {
        assertBackgroundJobActive(job.id);
        const result = await operation({ job, progress, check: () => assertBackgroundJobActive(job.id), signal: backgroundJobSignal(job.id) });
        assertBackgroundJobActive(job.id);
        if (result?.success === false) {
            updateBackgroundJob(job.id, { state: "failed", stage: "Failed", error: String(result.error || "The request failed.").slice(0, 400) });
            return { ...result, jobId: job.id };
        }
        updateBackgroundJob(job.id, { state: "completed", progress: 100, stage: "Completed" });
        return result && typeof result === "object" ? { ...result, jobId: job.id } : success({ result, jobId: job.id });
    }).then(result => {
        if (job.cancelRequested) updateBackgroundJob(job.id, { state: "cancelled", stage: "Cancelled", error: "" });
        else if (!result?.success && backgroundJobs.get(job.id)?.state !== "failed") updateBackgroundJob(job.id, { state: "failed", stage: "Failed", error: String(result?.error || "The request failed.").slice(0, 400) });
        return result;
    });
}


 /* ============================================================
  * WINDOW IPC
  * ============================================================ */

 function registerWindowControlsIPC() {

     /* --------------------------------------------------------
      * SHOW
      * -------------------------------------------------------- */

     registerHandler(
         "window:show",
         async () =>
             safeIPC(
                 "window:show",
                 async () =>
                     showMainWindow()
             )
     );


     /* --------------------------------------------------------
      * HIDE
      * -------------------------------------------------------- */

     registerHandler(
         "window:hide",
         async () =>
             safeIPC(
                 "window:hide",
                 async () =>
                     hideMainWindow()
             )
     );


     /* --------------------------------------------------------
      * MINIMIZE
      * -------------------------------------------------------- */

     registerHandler(
         "window:minimize",
         async () =>
             safeIPC(
                 "window:minimize",
                 async () =>
                     minimizeMainWindow()
             )
     );


     /* --------------------------------------------------------
      * MAXIMIZE
      * -------------------------------------------------------- */

     registerHandler(
         "window:toggle-maximize",
         async () =>
             safeIPC(
                 "window:toggle-maximize",
                 async () =>
                     toggleMaximizeMainWindow()
             )
     );


     /* --------------------------------------------------------
      * CLOSE
      * -------------------------------------------------------- */

     registerHandler(
         "window:close",
         async () =>
             safeIPC(
                 "window:close",
                 async () => {

                     if (
                         !hasValidMainWindow()
                     ) {

                         return failure(
                             "Main window is not available."
                         );
                     }


                     mainWindow.close();


                     return success();
                 }
             )
     );


     /* --------------------------------------------------------
      * WINDOW STATE
      * -------------------------------------------------------- */

     registerHandler(
         "window:get-state",
         async () =>
             safeIPC(
                 "window:get-state",
                 async () => {

                     if (
                         !hasValidMainWindow()
                     ) {

                         return failure(
                             "Main window is not available."
                         );
                     }


                     return success({

                         data: {

                             visible:
                                 mainWindow.isVisible(),

                             minimized:
                                 mainWindow.isMinimized(),

                             maximized:
                                 mainWindow.isMaximized(),

                             fullscreen:
                                 mainWindow.isFullScreen(),

                             focused:
                                 mainWindow.isFocused(),

                             destroyed:
                                 mainWindow.isDestroyed()
                         }
                     });
                 }
             )
     );


     /* --------------------------------------------------------
      * RELOAD
      * -------------------------------------------------------- */

     registerHandler(
         "window:reload",
         async () =>
             safeIPC(
                 "window:reload",
                 async () =>
                     reloadRenderer()
             )
     );


     log(
         "✅ Window IPC registered."
     );
 }


 /* ============================================================
  * APPLICATION WINDOW EVENTS
  * ============================================================ */

 function registerWindowEvents() {

     app.on(
         "window-all-closed",
         () => {

             log(
                 "All application windows closed."
             );


             /*
              * Windows/Linux:
              * quit the application.
              *
              * macOS:
              * keep application alive.
              */

             if (
                 process.platform !==
                 "darwin"
             ) {

                 app.quit();
             }
         }
     );


     app.on(
         "before-quit",
         () => {

             if (shuttingDown) {
                 return;
             }


             shuttingDown = true;


             log(
                 "🛑 JARVIS shutdown requested."
             );


             sendToRenderer(
                 "system:shutdown",
                 {
                     timestamp: Date.now()
                 }
             );
         }
     );


     app.on(
         "will-quit",
         () => {
         recordStartupEvent("electron-will-quit", { startupComplete: Boolean(startupComplete) });

             log(
                 "JARVIS will quit."
             );


             appReady = false;
         }
     );


     log(
         "✅ Window lifecycle events registered."
     );
 }


 /* ============================================================
  * PART 2 COMPLETE
  * ============================================================ */

 log(
     "============================================================"
 );

 log(
     "JARVIS MAIN PROCESS V14.1.1 — PART 2 LOADED"
 );

 log(
     "Window Security: ENABLED"
 );

 log(
     "Context Isolation: ENABLED"
 );

 log(
     "Node Integration: DISABLED"
 );

 log(
     "Sandbox: ENABLED"
 );

 log(
     "External Navigation Protection: ENABLED"
 );

 log(
     "Window IPC: READY"
 );

 log(
     "============================================================"
 );
 "use strict";

 /* ============================================================
  * JARVIS PRO MAX
  * MAIN PROCESS
  * V14.1.1 PRODUCTION — PART 3
  * ============================================================
  *
  * PART 3:
  * - System Information IPC
  * - External URL IPC
  * - Safe Root Directories
  * - Path Traversal Protection
  * - Symlink Protection
  * - File Exists
  * - Directory Exists
  * - File Read
  * - File Write
  * - File Delete
  * ============================================================ */


 /* ============================================================
  * SYSTEM INFORMATION
  * ============================================================ */

 function getMainStatus() {

     return {

         status:
             appReady && !shuttingDown
                 ? "online"
                 : "offline",

         version:
             MAIN_VERSION,

         electron:
             process.versions.electron,

         node:
             process.versions.node,

         platform:
             process.platform,

         arch:
             process.arch,

         appReady:
             appReady,

         windowReady:
             hasValidMainWindow(),

         registeredHandlers:
             registeredHandlers.size,

         registeredListeners:
             registeredListeners.size,

         timestamp:
             Date.now()
     };
 }


 /* ============================================================
  * SYSTEM IPC
  * ============================================================ */

 function registerSystemStatusIPC() {

     /* --------------------------------------------------------
      * SYSTEM STATUS
      * -------------------------------------------------------- */

     registerHandler(
         "system:get-status",
         async () =>
             safeIPC(
                 "system:get-status",
                 async () =>
                     success({
                         data:
                             getMainStatus()
                     })
             )
     );


     /* --------------------------------------------------------
      * PLATFORM INFORMATION
      * -------------------------------------------------------- */

     registerHandler(
         "system:get-platform",
         async () =>
             safeIPC(
                 "system:get-platform",
                 async () =>
                     success({

                         data: {

                             platform:
                                 process.platform,

                             arch:
                                 process.arch,

                             node:
                                 process.versions.node,

                             electron:
                                 process.versions.electron,

                             chrome:
                                 process.versions.chrome,

                             v8:
                                 process.versions.v8
                         }
                     })
             )
     );


     /* --------------------------------------------------------
      * VERSION
      * -------------------------------------------------------- */

     registerHandler(
         "system:get-version",
         async () =>
             safeIPC(
                 "system:get-version",
                 async () =>
                     success({

                         version:
                             MAIN_VERSION,

                         electron:
                             process.versions.electron,

                         node:
                             process.versions.node
                     })
             )
     );


     /* --------------------------------------------------------
      * MEMORY USAGE
      * -------------------------------------------------------- */

     registerHandler(
         "system:get-memory",
         async () =>
             safeIPC(
                 "system:get-memory",
                 async () => {

                     const memory =
                         process.memoryUsage();


                     return success({

                         data: {

                             rss:
                                 memory.rss,

                             heapTotal:
                                 memory.heapTotal,

                             heapUsed:
                                 memory.heapUsed,

                             external:
                                 memory.external,

                             arrayBuffers:
                                 memory.arrayBuffers
                         }
                     });
                 }
             )
     );


     /* --------------------------------------------------------
      * PROCESS UPTIME
      * -------------------------------------------------------- */

     registerHandler(
         "system:get-uptime",
         async () =>
             safeIPC(
                 "system:get-uptime",
                 async () =>
                     success({
                         uptime:
                             process.uptime()
                     })
             )
     );


     log(
         "✅ System IPC registered."
     );
 }


 /* ============================================================
  * EXTERNAL URL IPC
  * ============================================================ */

 function registerExternalIPC() {

     registerHandler(
         "external:open-url",
         async (
             event,
             url
         ) =>
             safeIPC(
                 "external:open-url",
                 async () =>
                     openExternalURL(url)
             )
     );


     log(
         "✅ External URL IPC registered."
     );
 }


 /* ============================================================
  * SAFE ROOT DIRECTORIES
  * ============================================================ */

 /*
  * JARVIS file operations are restricted to these
  * application/user-owned locations.
  *
  * This prevents renderer code from requesting:
  *
  * C:\Windows\...
  * C:\Program Files\...
  * arbitrary system files
  *
  * or paths outside approved directories.
  */

 function getSafeRootDirs() {

     const roots = [

         app.getPath(
             "userData"
         ),

         app.getPath(
             "documents"
         ),

         app.getPath(
             "downloads"
         ),

         app.getPath(
             "desktop"
         ),

         app.getPath(
             "pictures"
         ),

         app.getPath(
             "music"
         ),

         app.getPath(
             "videos"
         ),

         app.getPath(
             "temp"
         )
     ];


     /*
      * Normalize and remove duplicates.
      */

     return [
         ...new Set(
             roots
                 .filter(Boolean)
                 .map(
                     item =>
                         path.resolve(item)
                 )
         )
     ];
 }


 /* ============================================================
  * PATH CONTAINMENT CHECK
  * ============================================================ */

 function isPathInsideRoot(
     candidate,
     root
 ) {

     const relative =
         path.relative(
             root,
             candidate
         );


     return (
         relative === "" ||
         (
             !relative.startsWith("..") &&
             !path.isAbsolute(relative)
         )
     );
 }


 /* ============================================================
  * SAFE PATH RESOLUTION
  * ============================================================ */

 /*
  * This is the central security function for all
  * filesystem IPC operations.
  *
  * Protection:
  *
  * 1. Absolute path normalization
  * 2. ".." traversal protection
  * 3. Safe-root containment
  * 4. Existing-path realpath validation
  * 5. Symlink escape protection
  * 6. New-file ancestor validation
  */

 function resolveSafePath(
     rawPath,
     options = {}
 ) {

     const target =
         String(
             rawPath || ""
         ).trim();


     /* --------------------------------------------------------
      * Empty path
      * -------------------------------------------------------- */

     if (!target) {

         return {

             ok: false,

             error:
                 "File path is required."
         };
     }


     /* --------------------------------------------------------
      * Resolve lexical path
      * -------------------------------------------------------- */

     const resolved =
         path.resolve(target);


     /* --------------------------------------------------------
      * Get safe roots
      * -------------------------------------------------------- */

     const roots =
         getSafeRootDirs();


     /* --------------------------------------------------------
      * Find matching root
      * -------------------------------------------------------- */

     const matchedRoot =
         roots.find(
             root =>
                 isPathInsideRoot(
                     resolved,
                     root
                 )
         );


     if (!matchedRoot) {

         return {

             ok: false,

             error:
                 "Access denied: path is outside allowed application directories."
         };
     }


     /* ========================================================
      * EXISTING PATH
      * ======================================================== */

     if (
         fs.existsSync(
             resolved
         )
     ) {

         try {

             /*
              * Resolve real path so symlinks
              * cannot escape the safe root.
              */

             const realPath =
                 fs.realpathSync(
                     resolved
                 );


             const realRoot =
                 fs.realpathSync(
                     matchedRoot
                 );


             if (
                 !isPathInsideRoot(
                     realPath,
                     realRoot
                 )
             ) {

                 return {

                     ok: false,

                     error:
                         "Access denied: resolved path escapes allowed directory."
                 };
             }


             return {

                 ok: true,

                 path:
                     realPath
             };

         } catch (error) {

             return {

                 ok: false,

                 error:
                     `Unable to validate file path: ${error.message}`
             };
         }
     }


     /* ========================================================
      * NON-EXISTING PATH
      * ======================================================== */

     if (
         options.allowNonExisting === true
     ) {

         let parent =
             path.dirname(
                 resolved
             );


         /*
          * Find nearest existing ancestor.
          */

         while (
             !fs.existsSync(parent)
         ) {

             const next =
                 path.dirname(
                     parent
                 );


             if (
                 next === parent
             ) {
                 break;
             }


             parent =
                 next;
         }


         try {

             const realParent =
                 fs.realpathSync(
                     parent
                 );


             const realRoot =
                 fs.realpathSync(
                     matchedRoot
                 );


             /*
              * Verify real parent remains
              * inside safe root.
              */

             if (
                 !isPathInsideRoot(
                     realParent,
                     realRoot
                 )
             ) {

                 return {

                     ok: false,

                     error:
                         "Access denied: parent directory escapes allowed directory."
                 };
             }


             return {

                 ok: true,

                 path:
                     resolved
             };

         } catch (error) {

             return {

                 ok: false,

                 error:
                     `Unable to validate parent directory: ${error.message}`
             };
         }
     }


     /* ========================================================
      * NON-EXISTING PATH WITHOUT WRITE REQUEST
      * ======================================================== */

     return {

         ok: true,

         path:
             resolved
     };
 }


 /* ============================================================
  * FILE IPC
  * ============================================================ */

 function registerFileOpsIPC() {

     /* ========================================================
      * FILE EXISTS
      * ======================================================== */

     registerHandler(
         "file:exists",
         async (
             event,
             filePath
         ) =>
             safeIPC(
                 "file:exists",
                 async () => {

                     const resolved =
                         resolveSafePath(
                             filePath
                         );


                     if (
                         !resolved.ok
                     ) {

                         return failure(
                             resolved.error
                         );
                     }


                     const exists =
                         fs.existsSync(
                             resolved.path
                         );


                     return success({

                         exists,

                         path:
                             resolved.path
                     });
                 }
             )
     );


     /* ========================================================
      * DIRECTORY EXISTS
      * ======================================================== */

     registerHandler(
         "directory:exists",
         async (
             event,
             directoryPath
         ) =>
             safeIPC(
                 "directory:exists",
                 async () => {

                     const resolved =
                         resolveSafePath(
                             directoryPath
                         );


                     if (
                         !resolved.ok
                     ) {

                         return failure(
                             resolved.error
                         );
                     }


                     if (
                         !fs.existsSync(
                             resolved.path
                         )
                     ) {

                         return success({

                             exists: false,

                             directory: false,

                             path:
                                 resolved.path
                         });
                     }


                     const stats =
                         fs.statSync(
                             resolved.path
                         );


                     return success({

                         exists:
                             stats.isDirectory(),

                         directory:
                             stats.isDirectory(),

                         path:
                             resolved.path
                     });
                 }
             )
     );


     /* ========================================================
      * READ TEXT FILE
      * ======================================================== */

     registerHandler(
         "file:read-text",
         async (
             event,
             filePath
         ) =>
             safeIPC(
                 "file:read-text",
                 async () => {

                     const resolved =
                         resolveSafePath(
                             filePath
                         );


                     if (
                         !resolved.ok
                     ) {

                         return failure(
                             resolved.error
                         );
                     }


                     if (
                         !fs.existsSync(
                             resolved.path
                         )
                     ) {

                         return failure(
                             "File does not exist."
                         );
                     }


                     const stats =
                         fs.statSync(
                             resolved.path
                         );


                     if (
                         !stats.isFile()
                     ) {

                         return failure(
                             "Specified path is not a file."
                         );
                     }


                     const content =
                         fs.readFileSync(
                             resolved.path,
                             "utf8"
                         );


                     return success({

                         path:
                             resolved.path,

                         content
                     });
                 }
             )
     );


     /* ========================================================
      * WRITE TEXT FILE
      * ======================================================== */

     registerHandler(
         "file:write-text",
         async (
             event,
             filePath,
             content
         ) =>
             safeIPC(
                 "file:write-text",
                 async () => {

                     /*
                      * New files are allowed, but only after
                      * the safe ancestor validation.
                      */

                     const resolved =
                         resolveSafePath(
                             filePath,
                             {
                                 allowNonExisting:
                                     true
                             }
                         );


                     if (
                         !resolved.ok
                     ) {

                         return failure(
                             resolved.error
                         );
                     }


                     const text =
                         String(
                             content ?? ""
                         );


                     const parentDir =
                         path.dirname(
                             resolved.path
                         );


                     /*
                      * Create missing directories.
                      */

                     if (
                         !fs.existsSync(
                             parentDir
                         )
                     ) {

                         fs.mkdirSync(
                             parentDir,
                             {
                                 recursive: true
                             }
                         );
                     }


                     /*
                      * Write UTF-8 text.
                      */

                     fs.writeFileSync(
                         resolved.path,
                         text,
                         "utf8"
                     );


                     return success({

                         path:
                             resolved.path,

                         bytes:
                             Buffer.byteLength(
                                 text,
                                 "utf8"
                             )
                     });
                 }
             )
     );


     /* ========================================================
      * DELETE FILE
      * ======================================================== */


     log(
         "✅ File System IPC registered."
     );

     /* ========================================================
      * FILES LIST (for File Explorer panel)
      * ======================================================== */

     registerHandler(
         "files:list",
         async (event, dirPath) =>
             safeIPC(
                 "files:list",
                 async () => {
                     const fs = require("fs");
                     const target = dirPath || app.getPath("documents");
                     const targetCheck = resolveSafePath(target);
                     if (!targetCheck.ok) throw new Error(targetCheck.error);

                     const entries = await fs.promises.readdir(targetCheck.path, {
                         withFileTypes: true
                     });

                     return entries
                         .filter(e => !e.name.startsWith("."))
                         .map(e => ({
                             name: e.name,
                             path: path.join(targetCheck.path, e.name),
                             isDirectory: e.isDirectory(),
                             isFile: e.isFile(),
                             size: e.isFile() ?
                                 fs.statSync(path.join(targetCheck.path, e.name)).size :
                                 0
                         }))
                         .sort((a, b) => {
                             if (a.isDirectory !== b.isDirectory) {
                                 return a.isDirectory ? -1 : 1;
                             }
                             return a.name.localeCompare(b.name);
                         });
                 }
             )
     );

     registerHandler(
         "platform:info",
         async () =>
             safeIPC(
                 "platform:info",
                 async () => {
                     const os = require("os");
                     return {
                         platform: process.platform,
                         home: os.homedir(),
                         documents: app.getPath("documents"),
                         hostname: os.hostname(),
                         arch: process.arch
                     };
                 }
             )
     );

     log(
         "✅ Files Explorer IPC registered."
     );
 }


 /* ============================================================
  * APPLICATION PATH IPC
  * ============================================================ */

 function registerPathIPC() {

     registerHandler(
         "app:get-paths",
         async () =>
             safeIPC(
                 "app:get-paths",
                 async () =>
                     success({

                         data: {

                             appPath:
                                 app.getAppPath(),

                             userData:
                                 app.getPath(
                                     "userData"
                                 ),

                             documents:
                                 app.getPath(
                                     "documents"
                                 ),

                             downloads:
                                 app.getPath(
                                     "downloads"
                                 ),

                             desktop:
                                 app.getPath(
                                     "desktop"
                                 ),

                             music:
                                 app.getPath(
                                     "music"
                                 ),

                             pictures:
                                 app.getPath(
                                     "pictures"
                                 ),

                             videos:
                                 app.getPath(
                                     "videos"
                                 ),

                             temp:
                                 app.getPath(
                                     "temp"
                                 )
                         }
                     })
             )
     );


     log(
         "✅ Application Path IPC registered."
     );
 }


 /* ============================================================
  * PART 3 COMPLETE
  * ============================================================ */

 log(
     "============================================================"
 );

 log(
     "JARVIS MAIN PROCESS V14.1.1 — PART 3 LOADED"
 );

 log(
     "System IPC: READY"
 );

 log(
     "External URL IPC: READY"
 );

 log(
     "File System IPC: HARDENED"
 );

 log(
     "Path Traversal Protection: ENABLED"
 );

 log(
     "Symlink Escape Protection: ENABLED"
 );

 log(
     "Safe Root Directory Protection: ENABLED"
 );

 log(
     "Application Path IPC: READY"
 );

 log(
     "============================================================"
 );
 "use strict";

 /* ============================================================
  * JARVIS PRO MAX
  * MAIN PROCESS
  * V14.1.1 PRODUCTION — PART 4
  * ============================================================
  *
  * PART 4:
  * - Chat State
  * - Chat Message Normalization
  * - Chat History Management
  * - Chat Save
  * - Chat Load
  * - Chat Clear
  * - Chat Remove Last
  * - Renderer Ready
  * - Renderer Ping/Pong
  * - Renderer Notification Bridge
  * - Core IPC Registration
  * ============================================================ */


 /* ============================================================
  * CHAT CONFIGURATION
  * ============================================================ */

 const CHAT_CONFIG = {

     /*
      * Maximum messages kept in the active
      * in-memory chat session.
      */

     maxMessages: 500,

     /*
      * Maximum allowed message content.
      * Prevents accidental huge IPC payloads.
      */

     maxContentLength: 100000
 };


 /* ============================================================
  * NORMALIZE CHAT MESSAGE
  * ============================================================ */

 function normalizeChatMessage(message) {

     if (
         !message ||
         typeof message !== "object"
     ) {

         return null;
     }


     const role =
         String(
             message.role ||
             "user"
         )
         .trim()
         .toLowerCase();


     const content =
         String(
             message.content ??
             message.message ??
             ""
         );


     if (
         !content.trim()
     ) {

         return null;
     }


     if (
         content.length >
         CHAT_CONFIG.maxContentLength
     ) {

         return null;
     }


     /*
      * Keep roles predictable.
      */

     const allowedRoles =
         new Set([
             "user",
             "assistant",
             "system",
             "tool"
         ]);


     const safeRole =
         allowedRoles.has(role)
             ? role
             : "user";


     /*
      * Use supplied ID when valid.
      * Otherwise generate one.
      */

     const id =
         String(
             message.id ||
             `${Date.now()}-${Math.random()
                 .toString(36)
                 .slice(2, 9)}`
         );


     const timestamp =
         Number(
             message.timestamp
         ) || Date.now();


     return {

         id,

         role:
             safeRole,

         content,

         timestamp
     };
 }


 /* ============================================================
  * ADD CHAT MESSAGE
  * ============================================================ */

 function pushChatMessage(
     normalized
 ) {

     if (!normalized) {
         return false;
     }


     chatHistory.push(
         normalized
     );


     /*
      * Keep only the latest messages.
      */

     if (
         chatHistory.length >
         CHAT_CONFIG.maxMessages
     ) {

         chatHistory =
             chatHistory.slice(
                 -CHAT_CONFIG.maxMessages
             );
     }


     return true;
 }


 /* ============================================================
  * ADD CHAT MESSAGE SAFELY
  * ============================================================ */

 function addChatMessage(
     message
 ) {

     const normalized =
         normalizeChatMessage(
             message
         );


     if (!normalized) {

         return failure(
             "Invalid chat message."
         );
     }


     pushChatMessage(
         normalized
     );


     return success({

         message:
             normalized,

         count:
             chatHistory.length
     });
 }


 /* ============================================================
  * CHAT HISTORY SNAPSHOT
  * ============================================================ */

 function getChatHistory() {

     /*
      * Return a copy so callers cannot
      * directly mutate internal state.
      */

     return chatHistory.map(
         message => ({
             ...message
         })
     );
 }


 /* ============================================================
  * CHAT HISTORY CLEAR
  * ============================================================ */

 function clearChatHistory() {

     const previousCount =
         chatHistory.length;


     chatHistory = [];


     return {

         previousCount,

         count: 0
     };
 }


 /* ============================================================
  * CHAT HISTORY REMOVE LAST
  * ============================================================ */

 function removeLastChatMessage() {

     if (
         chatHistory.length === 0
     ) {

         return failure(
             "Chat history is empty."
         );
     }


     const removed =
         chatHistory.pop();


     return success({

         removed,

         count:
             chatHistory.length
     });
 }


 /* ============================================================
  * SAVE CHAT HISTORY TO MEMORY ENGINE
  * ============================================================ */

 async function saveChatHistory() {

     /*
      * This function intentionally uses the
      * existing memory bridge when available.
      *
      * saveToAvailableMemory() is defined later
      * in the complete Main Process.
      */

     try {

         if (
             typeof saveToAvailableMemory !==
             "function"
         ) {

             return failure(
                 "Memory bridge is not available."
             );
         }


         const result =
             await saveToAvailableMemory(
                 "chat:history",
                 getChatHistory()
             );


         if (
             !result ||
             result.success !== true
         ) {

             return failure(
                 result?.error ||
                 "Unable to save chat history."
             );
         }


         return success({

             saved: true,

             count:
                 chatHistory.length
         });

     } catch (error) {

         errorLog(
             "Chat history save failed:",
             error
         );


         return failure(
             error?.message ||
             String(error)
         );
     }
 }


 /* ============================================================
  * LOAD CHAT HISTORY FROM MEMORY ENGINE
  * ============================================================ */

 async function loadChatHistory() {

     try {

         if (
             typeof readFromAvailableMemory !==
             "function"
         ) {

             return failure(
                 "Memory bridge is not available."
             );
         }


         const result =
             await readFromAvailableMemory(
                 "chat:history"
             );


         if (
             !result ||
             result.success !== true
         ) {

             return failure(
                 result?.error ||
                 "Unable to read chat history."
             );
         }


         const stored =
             result.value;


         if (
             !Array.isArray(stored)
         ) {

             /*
              * No valid stored history.
              */

             chatHistory = [];


             return success({

                 loaded: true,

                 count: 0,

                 history: []
             });
         }


         /*
          * Re-normalize every stored message.
          * This protects the active state from
          * malformed old memory data.
          */

         const normalizedHistory = [];


         for (
             const message of stored
         ) {

             const normalized =
                 normalizeChatMessage(
                     message
                 );


             if (normalized) {

                 normalizedHistory.push(
                     normalized
                 );
             }
         }


         /*
          * Keep only latest configured amount.
          */

         chatHistory =
             normalizedHistory.slice(
                 -CHAT_CONFIG.maxMessages
             );


         return success({

             loaded: true,

             count:
                 chatHistory.length,

             history:
                 getChatHistory()
         });

     } catch (error) {

         errorLog(
             "Chat history load failed:",
             error
         );


         return failure(
             error?.message ||
             String(error)
         );
     }
 }


 /* ============================================================
  * CHAT IPC
  * ============================================================ */

 function registerChatHistoryIPC() {

     /* ========================================================
      * ADD MESSAGE
      * ======================================================== */

     registerHandler(
         "chat:add-message",
         async (
             event,
             message
         ) =>
             safeIPC(
                 "chat:add-message",
                 async () =>
                     addChatMessage(
                         message
                     )
             )
     );


     /* ========================================================
      * SAVE CHAT
      * ======================================================== */


     /* ========================================================
      * GET HISTORY
      * ======================================================== */

     registerHandler(
         "chat:get-history",
         async () =>
             safeIPC(
                 "chat:get-history",
                 async () =>
                     success({

                         history:
                             getChatHistory(),

                         count:
                             chatHistory.length
                     })
             )
     );


     /* ========================================================
      * LOAD HISTORY
      * ======================================================== */

     registerHandler(
         "chat:load-history",
         async () =>
             safeIPC(
                 "chat:load-history",
                 async () =>
                     loadChatHistory()
             )
     );


     /* ========================================================
      * CLEAR HISTORY
      * ======================================================== */

     registerHandler(
         "chat:clear-history",
         async () =>
             safeIPC(
                 "chat:clear-history",
                 async () => {

                     const result =
                         clearChatHistory();


                     /*
                      * Notify renderer.
                      */

                     sendToRenderer(
                         "chat:history-cleared",
                         {
                             timestamp:
                                 Date.now(),

                             previousCount:
                                 result.previousCount
                         }
                     );


                     return success({

                         count: 0,

                         previousCount:
                             result.previousCount
                     });
                 }
             )
     );


     /* ========================================================
      * REMOVE LAST
      * ======================================================== */

     registerHandler(
         "chat:remove-last",
         async () =>
             safeIPC(
                 "chat:remove-last",
                 async () =>
                     removeLastChatMessage()
             )
     );


     /* ========================================================
      * GET COUNT
      * ======================================================== */

     registerHandler(
         "chat:get-count",
         async () =>
             safeIPC(
                 "chat:get-count",
                 async () =>
                     success({

                         count:
                             chatHistory.length
                     })
             )
     );


     log(
         "✅ Chat IPC registered."
     );
 }


 /* ============================================================
  * RENDERER EVENT IPC
  * ============================================================ */

 function registerRendererIPC() {

     /* ========================================================
      * RENDERER READY
      * ======================================================== */

     registerListener(
         "renderer:ready",
         (
             event,
             payload
         ) => {

             log(
                 "🟢 Renderer reported READY."
             );


             log(
                 "Renderer payload:",
                 payload || {}
             );


             sendToRenderer(
                 "main:ready",
                 {

                     version:
                         MAIN_VERSION,

                     status:
                         "ready",

                     timestamp:
                         Date.now()
                 }
             );
         }
     );


     /* ========================================================
      * RENDERER PING
      * ======================================================== */

     registerListener(
         "renderer:ping",
         (
             event,
             payload
         ) => {

             sendToRenderer(
                 "main:pong",
                 {

                     timestamp:
                         Date.now(),

                     payload:
                         payload ?? null
                 }
             );
         }
     );


     log(
         "✅ Renderer IPC registered."
     );
 }


 /* ============================================================
  * SYSTEM EVENT IPC
  * ============================================================ */

 function registerSystemEventsIPC() {

     registerListener(
         "system:notify-renderer",
         (
             event,
             channel,
             payload
         ) => {

             /*
              * Only valid non-empty channel
              * names are accepted.
              */

             if (
                 !isValidChannel(
                     channel
                 )
             ) {

                 warn(
                     "⚠ Invalid renderer notification channel."
                 );

                 return;
             }


             /*
              * Forward event to renderer.
              */

             sendToRenderer(
                 channel,
                 payload
             );
         }
     );


     log(
         "✅ System Event IPC registered."
     );
 }


 /* ============================================================
  * JARVIS RENDERER READY EVENT
  * ============================================================ */

 function registerJarvisRendererReadyIPC() {

     registerListener(
         "jarvis:renderer-ready",
         (
             event,
             payload
         ) => {

             log(
                 "============================================================"
             );


             log(
                 "🟢 JARVIS RENDERER READY"
             );


             log(
                 "Payload:",
                 payload || {}
             );


             log(
                 "============================================================"
             );


             sendToRenderer(
                 "jarvis:main-ready",
                 {

                     version:
                         MAIN_VERSION,

                     status:
                         "online",

                     timestamp:
                         Date.now()
                 }
             );
         }
     );


     log(
         "✅ JARVIS Renderer Ready IPC registered."
     );
 }


 /* ============================================================
  * CORE IPC REGISTRATION
  * ============================================================ */

 function registerCoreIPC() {

     log(
         "============================================================"
     );


     log(
         "🔗 Registering Core IPC Modules..."
     );


     /* --------------------------------------------------------
      * Window
      * -------------------------------------------------------- */

     registerWindowIPC();


     /* --------------------------------------------------------
      * System
      * -------------------------------------------------------- */

     registerSystemIPC();


     /* --------------------------------------------------------
      * External URL
      * -------------------------------------------------------- */

     registerExternalIPC();


     /* --------------------------------------------------------
      * File System
      * -------------------------------------------------------- */

     registerFileIPC();


     /* --------------------------------------------------------
      * Application Paths
      * -------------------------------------------------------- */

     registerPathIPC();


     /* --------------------------------------------------------
      * Chat
      * -------------------------------------------------------- */

     registerChatIPC();

    // ---- RESTORED v1 CHANNEL SETS (were silently disabled by the
    // duplicate-function hoisting bug — see registerChatHistoryIPC etc.) ----
    registerChatHistoryIPC();
    registerFileOpsIPC();
    registerSystemStatusIPC();
    registerWindowControlsIPC();
    registerAIChatBridgeIPC();
    registerDiagnosticsStatusIPC();


     /* --------------------------------------------------------
      * Renderer
      * -------------------------------------------------------- */

     registerRendererIPC();


     /* --------------------------------------------------------
      * System Events
      * -------------------------------------------------------- */

     registerSystemEventsIPC();


     /* --------------------------------------------------------
      * JARVIS Renderer Ready
      * -------------------------------------------------------- */

     registerJarvisRendererReadyIPC();


     log(
         "============================================================"
     );


     log(
         "✅ Core IPC registration complete."
     );


     log(
         "Registered handlers:",
         registeredHandlers.size
     );


     log(
         "Registered listeners:",
         registeredListeners.size
     );


     log(
         "============================================================"
     );
 }


 /* ============================================================
  * IPC REGISTRATION DIAGNOSTICS
  * ============================================================ */

 function getIPCStatus() {

     return {

         handlers:
             registeredHandlers.size,

         listeners:
             registeredListeners.size,

         handlerChannels:
             [...registeredHandlers],

         listenerChannels:
             [...registeredListeners],

         timestamp:
             Date.now()
     };
 }


 /* ============================================================
  * IPC STATUS IPC
  * ============================================================ */

 function registerIPCStatus() {

     registerHandler(
         "diagnostics:ipc-status",
         async () =>
             safeIPC(
                 "diagnostics:ipc-status",
                 async () =>
                     success({

                         data:
                             getIPCStatus()
                     })
             )
     );


     log(
         "✅ IPC Diagnostics registered."
     );
 }


 /* ============================================================
  * PART 4 COMPLETE
  * ============================================================ */

 log(
     "============================================================"
 );

 log(
     "JARVIS MAIN PROCESS V14.1.1 — PART 4 LOADED"
 );

 log(
     "Chat History: READY"
 );

 log(
     "Chat Save Bridge: READY"
 );

 log(
     "Chat Load Bridge: READY"
 );

 log(
     "Chat Clear Bridge: READY"
 );

 log(
     "Renderer Ready IPC: READY"
 );

 log(
     "Renderer Ping/Pong: READY"
 );

 log(
     "System Event Bridge: READY"
 );

 log(
     "Core IPC Registration: READY"
 );

 log(
     "IPC Diagnostics: READY"
 );

 log(
     "============================================================"
 );
 /* ============================================================
    JARVIS PRO MAX
    MAIN PROCESS
    V14.1.1 PRODUCTION
    PART 5/5
    AI • MEMORY • STATUS • VALIDATION • STARTUP
    ============================================================ */

 /* ============================================================
    CHAT / AI BRIDGE
    ============================================================ */

 async function callAvailableAI(message, context = {}) {
     const text = String(message || "").trim();

     if (!text) {
         return failure("Message is required.");
     }

     try {
         // DETERMINISTIC PIPELINE — no AI/LLM engine is ever loaded.
         // Delegates to the same deterministic brain that powers ai:ask.
         const result = await enqueueAIRequest(() => handleAIAsk(text, context));

         if (result && result.success) {
             return success({
                 response: result.response,
                 text: result.text,
                 language: result.language,
                 source: result.source
             });
         }

         return failure("Deterministic brain could not answer.");

     } catch (error) {
         errorLog("AI bridge error:", error);

         return failure(
             error?.message || String(error)
         );
     }
 }


 /* ============================================================
    AI IPC
    ============================================================ */

 function registerAIChatBridgeIPC() {

     registerHandler(
         "ai:chat",
         async (event, message, context) => {

             return safeIPC(
                 "ai:chat",
                 async () => {

                     const result =
                         await callAvailableAI(
                             message,
                             context
                         );

                     if (result.success) {

                         const userMessage =
                             normalizeChatMessage({
                                 role: "user",
                                 content: message,
                                 timestamp: Date.now()
                             });

                         if (userMessage) {
                             pushChatMessage(userMessage);
                         }

                         let responseText;

                         if (
                             typeof result.response ===
                             "string"
                         ) {
                             responseText =
                                 result.response;
                         } else {
                             responseText =
                                 JSON.stringify(
                                     result.response
                                 );
                         }

                         const assistantMessage =
                             normalizeChatMessage({
                                 role: "assistant",
                                 content: responseText,
                                 timestamp: Date.now()
                             });

                         if (assistantMessage) {
                             pushChatMessage(
                                 assistantMessage
                             );
                         }
                     }

                     return result;
                 }
             );
         }
     );
 }


 /* ============================================================
    MEMORY BRIDGE
    ============================================================ */

 async function saveToAvailableMemory(key, value) {

     const memoryKey =
         String(key || "").trim();

     if (!memoryKey) {
         return failure(
             "Memory key is required."
         );
     }

     try {

         if (
             global.MemoryManager &&
             typeof global.MemoryManager.set ===
                 "function"
         ) {
             await global.MemoryManager.set(
                 memoryKey,
                 value
             );

             return success({
                 key: memoryKey
             });
         }


         if (
             global.MemoryManagerAgent &&
             typeof global.MemoryManagerAgent.remember ===
                 "function"
         ) {
             await global.MemoryManagerAgent.remember(
                 memoryKey,
                 value
             );

             return success({
                 key: memoryKey
             });
         }


         if (
             global.JARVISMemory &&
             typeof global.JARVISMemory.save ===
                 "function"
         ) {
             await global.JARVISMemory.save(
                 memoryKey,
                 value
             );

             return success({
                 key: memoryKey
             });
         }


         return failure(
             "Memory engine is not available."
         );

     } catch (error) {

         errorLog(
             "Memory save error:",
             error
         );

         return failure(
             error?.message || String(error)
         );
     }
 }


 /* ============================================================
    MEMORY READ
    ============================================================ */

 async function readFromAvailableMemory(key) {

     const memoryKey =
         String(key || "").trim();

     if (!memoryKey) {
         return failure(
             "Memory key is required."
         );
     }

     try {

         if (
             global.MemoryManager &&
             typeof global.MemoryManager.get ===
                 "function"
         ) {

             const value =
                 await global.MemoryManager.get(
                     memoryKey
                 );

             return success({
                 key: memoryKey,
                 value
             });
         }


         if (
             global.MemoryManagerAgent &&
             typeof global.MemoryManagerAgent.recall ===
                 "function"
         ) {

             const value =
                 await global.MemoryManagerAgent.recall(
                     memoryKey
                 );

             return success({
                 key: memoryKey,
                 value
             });
         }


         if (
             global.JARVISMemory &&
             typeof global.JARVISMemory.get ===
                 "function"
         ) {

             const value =
                 await global.JARVISMemory.get(
                     memoryKey
                 );

             return success({
                 key: memoryKey,
                 value
             });
         }


         return failure(
             "Memory engine is not available."
         );

     } catch (error) {

         errorLog(
             "Memory read error:",
             error
         );

         return failure(
             error?.message || String(error)
         );
     }
 }


 /* ============================================================
    MEMORY IPC
    ============================================================ */

 function registerMemoryIPC() {

     registerHandler(
         "memory:save",
         async (event, key, value) => {

             return safeIPC(
                 "memory:save",
                 async () =>
                     saveToAvailableMemory(
                         key,
                         value
                     )
             );
         }
     );


     registerHandler(
         "memory:read",
         async (event, key) => {

             return safeIPC(
                 "memory:read",
                 async () =>
                     readFromAvailableMemory(
                         key
                     )
             );
         }
     );
 }


 /* ============================================================
    ENGINE STATUS
    ============================================================ */

 function getEngineStatus() {

     // REAL health checks — no fake "ready" status.
     let brainOk = false;
     try {
         brainOk = typeof deterministicBrain.compose === "function";
     } catch (_) {}
     let memoryOk = false;
     try {
         memoryOk = Boolean(initMemory());
     } catch (_) {}

     return {

         ai: brainOk, // deterministic brain (src/ai/deterministicBrain.js)

         memory: memoryOk,

         timestamp: Date.now()
     };
 }


 /* ============================================================
    ENGINE STATUS IPC
    ============================================================ */

 function registerEngineIPC() {

     registerHandler(
         "engine:get-status",
         async () => {

             return safeIPC(
                 "engine:get-status",
                 async () =>
                     success({
                         data:
                             getEngineStatus()
                     })
             );
         }
     );
 }


 /* ============================================================
    FINAL JARVIS STATUS
    ============================================================ */

 function getJarvisStatus() {

     return {

         name: "JARVIS PRO MAX",

         version: MAIN_VERSION,

         status:
             appReady && !shuttingDown
                 ? "online"
                 : "offline",

         appReady,

         shuttingDown,

         windowReady:
             hasValidMainWindow(),

         renderer:
             hasValidMainWindow()
                 ? "available"
                 : "unavailable",

         engines:
             getEngineStatus(),

         chatMessages:
             chatHistory.length,

         ipc: {

             handlers:
                 registeredHandlers.size,

             listeners:
                 registeredListeners.size
         },

         process: {

             platform:
                 process.platform,

             arch:
                 process.arch,

             node:
                 process.versions.node,

             electron:
                 process.versions.electron
         },

         timestamp:
             Date.now()
     };
 }


 /* ============================================================
    JARVIS STATUS IPC
    ============================================================ */

 function registerJarvisStatusIPC() {

     registerHandler(
         "jarvis:get-status",
         async () => {

             return safeIPC(
                 "jarvis:get-status",
                 async () =>
                     success({
                         data:
                             getJarvisStatus()
                     })
             );
         }
     );
 }


 /* ============================================================
    FINAL RENDERER EVENTS
    ============================================================ */

 function registerFinalRendererEvents() {

     registerListener(
         "jarvis:renderer-ready",
         (event, payload) => {

             log(
                 "============================================================"
             );

             log(
                 "JARVIS RENDERER READY"
             );

             log(
                 "Payload:",
                 payload || {}
             );

             log(
                 "============================================================"
             );

             sendToRenderer(
                 "jarvis:main-ready",
                 {
                     version:
                         MAIN_VERSION,

                     status:
                         getJarvisStatus(),

                     timestamp:
                         Date.now()
                 }
             );
         }
     );
 }


 /* ============================================================
    EXTENDED IPC REGISTRATION
    ============================================================ */

 function registerExtendedIPC() {

     log(
         "Registering extended IPC modules..."
     );

     registerAIIPC();

     registerMemoryIPC();

     // FIX: registerWikipediaIPC() was previously only called from
     // inside registerIPC(), which is invoked by the THIRD
     // app.whenReady() block below — but that block bails out
     // immediately ("if (appReady) return;") because appReady was
     // already set true by THIS block. That third block never runs,
     // so wikipedia:summary / wikipedia:on-this-day were never
     // actually registered with ipcMain. Calling it here, from the
     // block that genuinely creates the window, fixes that.
     initOfflineKnowledgeCache();
        registerWikipediaIPC();
        registerDataSourcesIPC();
        registerOfflineKnowledgeIPC();
        registerMistakeLearningIPC();
        registerSuggestionsIPC();
        registerBackgroundLearningIPC();

        // Restore the user's persistent learning preference. The worker
        // remains a singleton and starts only when the saved preference is
        // enabled; network state is checked by the worker itself.
        const backgroundWorker = initBackgroundKnowledgeWorker();
        if (backgroundWorker?.enabled) {
            backgroundWorker.start({ persist: false });
        }

     registerEngineIPC();

     registerJarvisStatusIPC();

     registerFinalRendererEvents();

     /* --------------------------------------------------------
      * FIX: this app has THREE separate app.whenReady() blocks
      * (legacy leftovers from earlier merges). Only the second
      * one (which calls registerCoreIPC + registerExtendedIPC,
      * i.e. this function) actually runs — the third block,
      * which defined registerBrowserIPC(), registerEmbeddedBrowserIPC()
      * (the in-app tabbed browser: new-tab/navigate/back/forward/
      * reload/zoom/find/etc), registerBookmarksIPC(), registerHistoryIPC(),
      * registerPageToolsIPC(), registerDownloadsIPC(), registerVoiceIPC(),
      * and registerSystemInfoIPC(), is skipped because it checks
      * `if (appReady) return;` and appReady is already true by the
      * time it runs. That's why the browser feature (and voice,
      * and system:info) never worked: their IPC handlers were
      * simply never registered. Wiring them in here instead.
      * -------------------------------------------------------- */

     registerBrowserIPC();

     registerEmbeddedBrowserIPC();

     registerAssistantTaskIPC();

     registerBookmarksIPC();

     registerHistoryIPC();

     registerPageToolsIPC();

     registerDownloadsIPC();

     registerVoiceIPC();

     // Ollama (optional local AI) — safe to register even when Ollama
     // is absent; every handler degrades gracefully.
     registerNotificationIPC();
    registerOllamaIPC();

     // BUG FIX (voice/STT reliability, ERROR_LOG E007): start downloading/loading
     // the Whisper model as soon as the app is ready instead of waiting for
     // the user's first mic tap. Fire-and-forget — must not block window
     // creation or any other startup step. (whisper.cpp runtime + GGML model
     // are validated/downloaded once here; the transformers.js Whisper
     // fallback is pre-loaded only if whisper.cpp can't be made available.)
     voiceSTT.setProgressListener((info) => {
         // Forward Whisper setup/download progress to the UI.
         sendToRenderer("voice:model-download", info);
     });

     voiceSTT.warmUp();

     registerSystemInfoIPC();

     // BUG FIX (ERROR_LOG E012): registerChatFileIPC(), registerPowerIPC(),
     // registerSecurityHandlers(), and the embedded offline brain's
     // warmUp() were previously ONLY called from inside the THIRD
     // app.whenReady() block (near the bottom of this file), which never
     // actually runs — it checks `if (appReady) return;` and appReady is
     // already true by the time it fires (same root cause already
     // documented for registerWikipediaIPC() above). That silently meant:
     // chat file attach/read IPC never worked, power (sleep/restart/
     // shutdown) IPC never worked, mic permission gating + window-open +
     // navigation protection were never enforced at all, and the embedded
     // brain never pre-warmed (so the first real question always paid a
     // cold-start cost, the same class of bug already fixed for the STT engine
     // in E007). Wiring all four in here, where startup genuinely runs.
     registerChatFileIPC();

     registerPowerIPC();

     registerSecurityHandlers();

     log(
         "Extended IPC registration complete."
     );

     log(
         "Total IPC handlers:",
         registeredHandlers.size
     );

     log(
         "Total IPC listeners:",
         registeredListeners.size
     );
 }


 /* ============================================================
    FINAL VALIDATION
    ============================================================ */

 function performFinalValidation() {

     const checks = {

         electron:
             Boolean(app),

         browserWindow:
             Boolean(BrowserWindow),

         ipcMain:
             Boolean(ipcMain),

         shell:
             Boolean(shell),

         path:
             Boolean(path),

         filesystem:
             Boolean(fs),

         preload:
             fs.existsSync(
                 path.join(
                     __dirname,
                     "preload.js"
                 )
             ),

         renderer:
             rendererExists(),

         mainVersion:
             MAIN_VERSION === "14.2.0"
     };


     const passed =
         Object.values(checks)
             .every(Boolean);


     return {

         passed,

         checks,

         timestamp:
             Date.now()
     };
 }


 /* ============================================================
    VALIDATION IPC
    ============================================================ */

 function registerValidationIPC() {

     registerHandler(
         "jarvis:validate",
         async () => {

             return safeIPC(
                 "jarvis:validate",
                 async () =>
                     success({
                         data:
                             performFinalValidation()
                     })
             );
         }
     );
 }


 /* ============================================================
    FINAL CLEANUP
    ============================================================ */

 function performFinalCleanup() {

     log(
         "Starting final JARVIS cleanup..."
     );


     try {

         chatHistory = [];

     } catch (error) {

         errorLog(
             "Chat cleanup failed:",
             error
         );
     }


     try {

         registeredHandlers.clear();

         registeredListeners.clear();

     } catch (error) {

         errorLog(
             "IPC registry cleanup failed:",
             error
         );
     }


     mainWindow = null;

     appReady = false;

     log(
         "Final JARVIS cleanup complete."
     );
 }


 /* ============================================================
    PROCESS EXIT
    ============================================================ */

 process.on(
     "exit",
     () => {

         performFinalCleanup();
     }
 );


  /* ============================================================
     GLOBAL JARVIS MAIN OBJECT
    ============================================================ */

 global.JARVISMain = {

     version:
         MAIN_VERSION,


     status: () =>
         getJarvisStatus(),


     send:
         (channel, ...args) =>
             sendToRenderer(
                 channel,
                 ...args
             ),


     window: {

         show: () =>
             showMainWindow(),

         hide: () =>
             hideMainWindow(),

         minimize: () =>
             minimizeMainWindow(),

         toggleMaximize: () =>
             toggleMaximizeMainWindow(),

         reload: () =>
             reloadRenderer()
     },


     chat: {

         getHistory: () =>
             [...chatHistory],

         clear: () => {
             chatHistory = [];
         }
     },


     engines: () =>
         getEngineStatus()
 };


 /* ============================================================
    STARTUP REPORT
    ============================================================ */

 function printFinalStartupReport() {

     const validation =
         performFinalValidation();


     log(
         "============================================================"
     );

     log(
         "       JARVIS PRO MAX V14.1.1 PRODUCTION"
     );

     log(
         "       MAIN PROCESS"
     );

     log(
         "============================================================"
     );


     log(
         "Version:",
         MAIN_VERSION
     );

     log(
         "Electron:",
         process.versions.electron
     );

     log(
         "Node:",
         process.versions.node
     );

     log(
         "Platform:",
         process.platform
     );

     log(
         "Renderer:",
         validation.checks.renderer
     );

     log(
         "Preload:",
         validation.checks.preload
     );

     log(
         "Sandbox:",
         WINDOW_CONFIG
             .webPreferences
             .sandbox
     );

     log(
         "IPC Handlers:",
         registeredHandlers.size
     );

     log(
         "IPC Listeners:",
         registeredListeners.size
     );

     log(
         "Validation:",
         validation.passed
             ? "PASSED"
             : "FAILED"
     );

     log(
         "============================================================"
     );
 }


 /* ============================================================
    CENTRAL APPLICATION STARTUP
    ============================================================ */

 app.whenReady()
     .then(async () => {

         if (shuttingDown) {

             warn(
                 "Startup cancelled because shutdown is active."
             );

             return;
         }


         log(
             "Electron app is ready."
         );
         recordStartupEvent("central-startup-begin");


         appReady = true;


         try {

             /* ------------------------------------------------
                STEP 1
                DIAGNOSTICS IPC
                ------------------------------------------------ */

             registerDiagnosticsIPC();


             /* ------------------------------------------------
                STEP 2
                CORE IPC
                ------------------------------------------------ */

             registerCoreIPC();


             /* ------------------------------------------------
                STEP 3
                EXTENDED IPC
                ------------------------------------------------ */

             registerExtendedIPC();


             /* ------------------------------------------------
                STEP 4
                VALIDATION IPC
                ------------------------------------------------ */

             registerValidationIPC();


             /* ------------------------------------------------
                STEP 5
                CREATE MAIN WINDOW
                ------------------------------------------------ */

             const window =
                 createMainWindow();


             if (!window) {

                 recordStartupEvent("main-window-create-failed");

                 errorLog(
                     "JARVIS failed to create main window."
                 );

                 dialog.showErrorBox(
                     "JARVIS could not open",
                     `The desktop window could not be created. Check the startup log at ${path.join(app.getPath("userData"), "logs", "startup.log")}.`
                 );
                 app.quit();

                 return;
             }


             /* ------------------------------------------------
                STEP 5b
                CONSCIOUSNESS HEARTBEAT
                (BUG FIX ERROR_LOG E012 — moved here from the dead
                third app.whenReady() block, which never ran; see
                the comment on the `consciousnessHeartbeat`
                declaration near the top of this file)

                Periodically calls tick() so energy/confidence/mood
                drift back toward resting baselines during idle
                stretches, instead of the state only ever changing
                on the next chat turn (see src/ai/consciousness.js).
                ------------------------------------------------ */

             try {
                 const consciousnessLayer = initConsciousness();

                 consciousnessLayer.on("stateChanged", ({ reason }) => {
                     log(`[COGNITION] stateChanged (${reason}) -> mode=${consciousnessLayer.state.mode}`);
                 });

                 consciousnessHeartbeat = setInterval(() => {
                     try {
                         initConsciousness().tick();
                     } catch (error) {
                         errorLog("Consciousness heartbeat tick failed:", error);
                     }
                 }, 30000);
             } catch (error) {
                 errorLog("Consciousness heartbeat setup failed:", error);
             }

             /* ------------------------------------------------
                STEP 6
                ACTIVATE EVENT
                ------------------------------------------------ */

             app.on(
                 "activate",
                 () => {

                     if (
                         BrowserWindow
                             .getAllWindows()
                             .length === 0
                     ) {

                         createMainWindow();

                     } else if (
                         hasValidMainWindow()
                     ) {

                         mainWindow.show();

                         mainWindow.focus();
                     }
                 }
             );


             /* ------------------------------------------------
                STEP 7
                FINAL REPORT
                ------------------------------------------------ */

             printFinalStartupReport();


             log(
                 "JARVIS Main Process startup complete."
             );
             recordStartupEvent("main-startup-complete");


         } catch (error) {

             recordStartupEvent("main-startup-error", { message: String(error?.message || error).slice(0, 300) });

             errorLog(
                 "JARVIS startup initialization failed:",
                 error
             );
             if (!hasValidMainWindow()) {
                 dialog.showErrorBox(
                     "JARVIS startup failed",
                     `${String(error?.message || error).slice(0, 500)}\n\nDetails: ${path.join(app.getPath("userData"), "logs", "startup.log")}`
                 );
                 app.quit();
             }
         }

     })
     .catch(error => {

         recordStartupEvent("electron-ready-error", { message: String(error?.message || error).slice(0, 300) });

         errorLog(
             "Electron startup failed:",
             error
         );
         if (app.isReady()) {
             dialog.showErrorBox(
                 "JARVIS startup failed",
                 `${String(error?.message || error).slice(0, 500)}\n\nDetails: ${path.join(app.getPath("userData"), "logs", "startup.log")}`
             );
             app.quit();
         }
     });


 /* ============================================================
    MAIN.JS V14.1.1 — PART 5/5 END
    ============================================================ */

/* ============================================================
   IPC HANDLER REGISTRATION
============================================================ */

function registerHandler(channel, handler) {

    if (!channel) {
        throw new TypeError(
            "IPC channel is required."
        );
    }

    if (typeof handler !== "function") {
        throw new TypeError(
            `IPC handler for "${channel}" must be a function.`
        );
    }

    if (registeredHandlers.has(channel)) {

        warn(
            `IPC handler already registered: ${channel}`
        );

        return false;
    }

    try {

        ipcMain.handle(
            channel,
            require("./src/security/ipcPolicy").guardIPCHandler(channel, handler, {
                getWindow: () => mainWindow,
                rendererURL: pathToFileURL(path.join(__dirname, "renderer", "index.html")).href,
                confirm: async (window, options) => (await dialog.showMessageBox(window, options)).response === 1,
                onDenied: (name, reason) => warn(`[IPC SECURITY] Rejected ${name}: ${reason}`)
            })
        );

        registeredHandlers.add(
            channel
        );

        log(
            `IPC handler registered: ${channel}`
        );

        return true;

    } catch (error) {

        errorLog(
            `Failed to register IPC handler: ${channel}`,
            error
        );

        throw error;
    }
}

/* ============================================================
   IPC EVENT REGISTRATION
============================================================ */

function registerListener(channel, listener) {

    if (!channel) {
        throw new TypeError(
            "IPC channel is required."
        );
    }

    if (typeof listener !== "function") {
        throw new TypeError(
            `IPC listener for "${channel}" must be a function.`
        );
    }

    if (registeredListeners.has(channel)) {

        warn(
            `IPC listener already registered: ${channel}`
        );

        return false;
    }

    try {

        ipcMain.on(
            channel,
            require("./src/security/ipcPolicy").guardIPCHandler(channel, listener, {
                getWindow: () => mainWindow,
                rendererURL: pathToFileURL(path.join(__dirname, "renderer", "index.html")).href,
                eventOnly: true,
                onDenied: (name, reason) => warn(`[IPC SECURITY] Rejected ${name}: ${reason}`)
            })
        );

        registeredListeners.add(
            channel
        );

        log(
            `IPC listener registered: ${channel}`
        );

        return true;

    } catch (error) {

        errorLog(
            `Failed to register IPC listener: ${channel}`,
            error
        );

        throw error;
    }
}

/* ============================================================
   SEND TO RENDERER
============================================================ */

function sendToRenderer(channel, ...args) {

    if (
        !mainWindow ||
        mainWindow.isDestroyed()
    ) {
        return false;
    }

    try {

        mainWindow.webContents.send(
            channel,
            ...args
        );

        return true;

    } catch (error) {

        errorLog(
            `Renderer send failed: ${channel}`,
            error
        );

        return false;
    }
}

/* ============================================================
   EXTERNAL URL VALIDATION
============================================================ */

function isAllowedExternalURL(url) {

    try {

        const parsed = new URL(
            safeString(url)
        );

        return (
            parsed.protocol === "http:" ||
            parsed.protocol === "https:"
        );

    } catch {

        return false;
    }
}

/* ============================================================
   OPEN EXTERNAL URL
============================================================ */

async function openExternalURL(url) {

    let target = safeString(url);

    if (!target) {

        return failure(
            "URL is required."
        );
    }

    if (
        !/^https?:\/\//i.test(target)
    ) {

        target =
            "https://" +
            target;
    }

    if (
        !isAllowedExternalURL(target)
    ) {

        return failure(
            "Only HTTP and HTTPS URLs are allowed."
        );
    }

    try {

        await shell.openExternal(
            target
        );

        log(
            "External URL opened:",
            target
        );

        return success({
            url: target
        });

    } catch (error) {

        errorLog(
            "External URL open error:",
            error
        );

        return failure(
            error?.message ||
            String(error)
        );
    }
}

/* ============================================================
   CREATE BROWSER WINDOW
============================================================ */

function createWindow() {

    if (
        mainWindow &&
        !mainWindow.isDestroyed()
    ) {

        return mainWindow;
    }

    log(
        "Creating main BrowserWindow..."
    );

    const preloadPath = path.join(
        __dirname,
        "preload.js"
    );

    const indexPath = path.join(
        __dirname,
        "renderer",
        "index.html"
    );

    /* --------------------------------------------------------
       FILE VALIDATION
    -------------------------------------------------------- */

    if (!fs.existsSync(preloadPath)) {

        errorLog(
            "CRITICAL: preload.js not found:",
            preloadPath
        );
    }

    if (!fs.existsSync(indexPath)) {

        errorLog(
            "CRITICAL: renderer/index.html not found:",
            indexPath
        );
    }

    /* --------------------------------------------------------
       BROWSER WINDOW
    -------------------------------------------------------- */

    mainWindow = new BrowserWindow({

        width: 1400,

        height: 900,

        minWidth: 1100,

        minHeight: 700,

        show: false,

        autoHideMenuBar: true,

        backgroundColor: "#000000",

        webPreferences: {

            preload: preloadPath,

            contextIsolation: true,

            nodeIntegration: false,

            sandbox: true,

            webSecurity: true,

            allowRunningInsecureContent: false
        }
    });

    /* --------------------------------------------------------
       LOAD UI
    -------------------------------------------------------- */

    if (fs.existsSync(indexPath)) {

        mainWindow.loadFile(
            indexPath
        ).catch((error) => {

            errorLog(
                "Failed to load renderer:",
                error
            );
        });

    } else {

        errorLog(
            "Renderer file missing. Window cannot load UI."
        );
    }

    /* --------------------------------------------------------
       READY TO SHOW
    -------------------------------------------------------- */

    mainWindow.once(
        "ready-to-show",
        () => {

            if (
                !mainWindow ||
                mainWindow.isDestroyed()
            ) {
                return;
            }

            mainWindow.show();

            log(
                "Main Window Ready"
            );

            log(
                `JARVIS MAIN V${MAIN_VERSION} ONLINE`
            );
        }
    );

    /* --------------------------------------------------------
       RENDERER LOAD ERROR
    -------------------------------------------------------- */

    mainWindow.webContents.on(
        "did-fail-load",
        (
            event,
            errorCode,
            errorDescription,
            validatedURL
        ) => {

            errorLog(
                "Renderer failed to load:",
                {
                    errorCode,
                    errorDescription,
                    validatedURL
                }
            );
        }
    );

    /* --------------------------------------------------------
       RENDERER CONSOLE
    -------------------------------------------------------- */

    mainWindow.webContents.on(
        "console-message",
        (
            event,
            level,
            message,
            line,
            sourceId
        ) => {

            /*
             * Keep renderer console messages visible
             * during development/debugging.
             */

            if (level >= 2) {

                console.error(
                    "[JARVIS RENDERER]",
                    message,
                    `(${sourceId}:${line})`
                );

            }
        }
    );

    /* --------------------------------------------------------
       WINDOW CLOSED
    -------------------------------------------------------- */

    mainWindow.on(
        "closed",
        () => {
                 recordStartupEvent("main-window-closed");

            destroyAllBrowserTabs();

            mainWindow = null;

            log(
                "Main Window Closed"
            );
        }
    );

    return mainWindow;
}

/* ============================================================
   CHAT IPC
============================================================ */

function registerChatIPC() {

    registerHandler(
        "chat:save",
        async (event, data) => {

            try {

                if (Array.isArray(data)) {

                    chatHistory = data;

                } else if (
                    data !== undefined &&
                    data !== null
                ) {

                    chatHistory.push(
                        data
                    );
                }

                if (
                    chatHistory.length >
                    MAX_CHAT_HISTORY
                ) {

                    chatHistory =
                        chatHistory.slice(
                            -MAX_CHAT_HISTORY
                        );
                }

                // PERMANENT MEMORY: flush every save to disk so the
                // conversation survives an app restart, not just this
                // process's lifetime.
                saveChatHistoryToDisk();

                log(
                    "Chat saved:",
                    chatHistory.length
                );

                return success({
                    data: chatHistory
                });

            } catch (error) {

                errorLog(
                    "Chat save error:",
                    error
                );

                return failure(
                    error?.message ||
                    String(error)
                );
            }
        }
    );

    registerHandler(
        "chat:load",
        async () => {

            // If this process hasn't got anything in RAM yet
            // (e.g. it was cleared, or the in-memory copy is
            // somehow behind), fall back to the on-disk copy
            // before answering.
            if (chatHistory.length === 0) {
                loadChatHistoryFromDisk();
            }

            return success({
                data: chatHistory
            });
        }
    );

    registerHandler(
        "chat:clear",
        async () => {

            chatHistory = [];

            saveChatHistoryToDisk();

            log(
                "Chat history cleared"
            );

            return success({
                data: []
            });
        }
    );
}

/* ============================================================
   FILE MANAGEMENT IPC
============================================================ */

function registerFileIPC() {

    registerHandler("photo:pick-reference", async () => safeIPC("photo:pick-reference", async () => {
        const selection = await dialog.showOpenDialog(mainWindow, { title: "Choose a reference photo for JARVIS", properties: ["openFile"], filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "bmp", "tif", "tiff"] }] });
        return selection.canceled || !selection.filePaths[0] ? { success: false, cancelled: true } : { success: true, path: selection.filePaths[0] };
    }));
    registerHandler("photo:pick-folder", async () => safeIPC("photo:pick-folder", async () => {
        const selection = await dialog.showOpenDialog(mainWindow, { title: "Choose a folder to search", properties: ["openDirectory"] });
        return selection.canceled || !selection.filePaths[0] ? { success: false, cancelled: true } : { success: true, path: selection.filePaths[0] };
    }));

    registerHandler("photo:match-preview", async (_event, options = {}) => safeIPC("photo:match-preview", () => photoOrganizer.preview(options)));
    registerHandler("photo:organize-matches", async (_event, options = {}) => safeIPC("photo:organize-matches", () => photoOrganizer.organize(options)));

    registerHandler(
        "file:search",
        async (event, query, options = {}) => {

            const term = safeString(query).toLowerCase();

            if (!term) {
                return failure("Search query is required.");
            }

            const baseOption = options && options.baseDir
                ? options.baseDir
                : "";

            const baseCheck = resolveSafePath(baseOption || ".");

            if (!baseCheck.ok) {
                return failure(baseCheck.error);
            }

            const maxResults = Math.min(
                Number(options.maxResults) || 50,
                200
            );

            const results = [];

            async function walk(dir, depth) {
                if (results.length >= maxResults || depth > 6) {
                    return;
                }

                let entries;

                try {
                    entries = await fs.promises.readdir(dir, {
                        withFileTypes: true
                    });
                } catch {
                    return;
                }

                for (const entry of entries) {
                    if (results.length >= maxResults) {
                        return;
                    }

                    const fullPath = path.join(dir, entry.name);

                    if (entry.name.toLowerCase().includes(term)) {
                        results.push({
                            name: entry.name,
                            path: fullPath,
                            isDirectory: entry.isDirectory()
                        });
                    }

                    if (entry.isDirectory()) {
                        await walk(fullPath, depth + 1);
                    }
                }
            }

            try {
                await walk(baseCheck.resolved, 0);

                return success({
                    data: results
                });
            } catch (error) {
                return failure(error.message);
            }
        }
    );

    registerHandler(
        "file:open",
        async (event, filePath) => {

            const check = resolveSafePath(filePath);

            if (!check.ok) {
                return failure(check.error);
            }

            try {
                const result = await shell.openPath(check.resolved);

                if (result) {
                    // shell.openPath resolves with an error string
                    // on failure, empty string on success.
                    return failure(result);
                }

                return success({});
            } catch (error) {
                return failure(error.message);
            }
        }
    );

    registerHandler(
        "file:create",
        async (event, filePath, content = "") => {

            const check = resolveSafePath(filePath);

            if (!check.ok) {
                return failure(check.error);
            }

            try {
                await fs.promises.access(check.resolved).then(
                    () => { throw new Error("ALREADY_EXISTS"); },
                    () => {}
                );

                await fs.promises.mkdir(
                    path.dirname(check.resolved),
                    { recursive: true }
                );

                await fs.promises.writeFile(
                    check.resolved,
                    safeString(content),
                    "utf-8"
                );

                return success({ path: check.resolved });
            } catch (error) {
                if (error.message === "ALREADY_EXISTS") {
                    return failure("A file already exists at that path.");
                }
                return failure(error.message);
            }
        }
    );

    registerHandler(
        "file:create-folder",
        async (event, folderPath) => {

            const check = resolveSafePath(folderPath);

            if (!check.ok) {
                return failure(check.error);
            }

            try {
                await fs.promises.mkdir(check.resolved, { recursive: true });
                const created = await fs.promises.stat(check.resolved);
                if (!created.isDirectory()) {
                    return failure("The requested path exists but is not a folder.");
                }
                return success({ path: check.resolved });
            } catch (error) {
                return failure(error.message);
            }
        }
    );

    registerHandler(
        "file:rename",
        async (event, oldPath, newName) => {

            const oldCheck = resolveSafePath(oldPath);

            if (!oldCheck.ok) {
                return failure(oldCheck.error);
            }

            const cleanName = safeString(newName);

            if (!cleanName || /[\\/]/.test(cleanName)) {
                return failure("A valid new file name is required.");
            }

            const newCheck = resolveSafePath(
                path.join(path.dirname(oldCheck.resolved), cleanName)
            );

            if (!newCheck.ok) {
                return failure(newCheck.error);
            }

            try {
                await fs.promises.rename(oldCheck.resolved, newCheck.resolved);
                return success({ path: newCheck.resolved });
            } catch (error) {
                return failure(error.message);
            }
        }
    );

    registerHandler(
        "file:move",
        async (event, sourcePath, destinationPath) => {

            const sourceCheck = resolveSafePath(sourcePath);
            const destCheck = resolveSafePath(destinationPath);

            if (!sourceCheck.ok) {
                return failure(sourceCheck.error);
            }

            if (!destCheck.ok) {
                return failure(destCheck.error);
            }

            try {
                await fs.promises.mkdir(
                    path.dirname(destCheck.resolved),
                    { recursive: true }
                );

                await fs.promises.rename(
                    sourceCheck.resolved,
                    destCheck.resolved
                );

                return success({ path: destCheck.resolved });
            } catch (error) {
                return failure(error.message);
            }
        }
    );

    registerHandler(
        "file:delete",
        async (event, filePath, confirm = false) => {

            const check = resolveSafePath(filePath);

            if (!check.ok) {
                return failure(check.error);
            }

            if (confirm !== true) {
                return failure(
                    "Deletion requires explicit confirmation (confirm:true)."
                );
            }

            try {
                await fs.promises.rm(check.resolved, {
                    recursive: true,
                    force: false
                });

                return success({ path: check.resolved });
            } catch (error) {
                return failure(error.message);
            }
        }
    );

    registerHandler(
        "file:read",
        async (event, filePath) => {

            const check = resolveSafePath(filePath);

            if (!check.ok) {
                return failure(check.error);
            }

            const ext = path.extname(check.resolved).toLowerCase();

            if (!FILE_READ_EXTENSIONS.has(ext)) {
                return failure(
                    `Reading "${ext || "this file type"}" is not supported.`
                );
            }

            try {
                const stat = await fs.promises.stat(check.resolved);

                if (stat.size > FILE_READ_MAX_BYTES) {
                    return failure("File is too large to read.");
                }

                const content = await fs.promises.readFile(
                    check.resolved,
                    "utf-8"
                );

                return success({ content, path: check.resolved });
            } catch (error) {
                return failure(error.message);
            }
        }
    );
}

/* ============================================================
   BROWSER IPC
============================================================ */

function registerBrowserIPC() {

    registerHandler(
        "browser:open-url",
        async (event, url) => {

            return openExternalURL(
                url
            );
        }
    );
}

/* ============================================================
   EMBEDDED BROWSER — IN-APP TABBED BROWSER (Phase 1)
   ------------------------------------------------------------
   Real multi-tab browsing surface backed by Electron BrowserView.
   A BrowserView is a native layer painted on top of the host
   BrowserWindow at explicit pixel bounds — it is NOT a DOM
   element, so the renderer must tell us where to position it
   (see "browser:set-bounds", sent whenever the on-screen browser
   panel resizes or the user switches nav tabs away from Browser).

   Security posture (see .claude/rules/10-security-rules.md and
   08-browser-rules.md):
   - Every tab's webContents: contextIsolation true, nodeIntegration
     false, sandbox true, no preload script (arbitrary web pages
     get zero access to Node/Electron APIs or the JARVIS bridge).
   - Public HTTP(S) browsing is scoped to a persistent isolated session;
     the privileged JARVIS page remains local-only. Any other
     scheme (file:, javascript:, data:, chrome:, etc.) is rejected.
   - window.open()/target=_blank/middle-click "new window" attempts
     are intercepted and opened as a new managed tab instead of a
     raw, unmanaged native BrowserWindow.
   - In-page navigation to a disallowed scheme is prevented
     (will-navigate / will-redirect guards).
   - Tab failures are isolated: a crashed/unresponsive tab reports
     a structured error to the renderer and does not touch any
     other JARVIS module (chat, voice, brain, etc.).
============================================================ */

const browserTabs = new Map(); // id -> { view, id, title, url, favicon, loading, canGoBack, canGoForward, pinned, muted }

let browserTabCounter = 0;
let activeBrowserTabId = null;
let browserPanelBounds = { x: 0, y: 0, width: 0, height: 0 };
let browserPanelVisible = false;
let attachedBrowserTabId = null;

const BROWSER_HOME_URL = "https://www.google.com";
const BROWSER_SESSION_PARTITION = "persist:jarvis-browser";
let browserNetworkPolicyInstalled = false;

function configureBrowserSession(browserSession) {
    if (browserNetworkPolicyInstalled) return;
    browserNetworkPolicyInstalled = true;
    browserSession.webRequest.onBeforeRequest((details, callback) => {
        let allowed = false;
        try {
            const url = new URL(details.url);
            allowed = ["https:", "http:", "about:", "data:", "blob:"].includes(url.protocol) &&
                (url.protocol !== "about:" || url.href === "about:blank");
        } catch (_) {}
        callback(allowed ? {} : { cancel: true });
    });
}

function isLoopbackURL(rawUrl) {
    try {
        const parsed = new URL(String(rawUrl || ""));
        const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
        const octets = host.split(".");
        const ipv4Loopback = octets.length === 4 && octets[0] === "127" &&
            octets.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255);
        return (parsed.protocol === "http:" || parsed.protocol === "https:") &&
            (host === "localhost" || host === "::1" || ipv4Loopback);
    } catch {
        return false;
    }
}

function isNavigableURL(rawUrl) {

    try {

        const parsed = new URL(String(rawUrl || ""));

        return (
            parsed.protocol === "http:" ||
            parsed.protocol === "https:" ||
            parsed.protocol === "about:" && parsed.href === "about:blank"
        );

    } catch {

        return false;
    }
}

// The embedded browser is intentionally open to public websites. Restrict
// navigation by URL scheme and malformed/credential-bearing URLs, not by a
// short provider allowlist, so ordinary search result links work.
function isSafeBrowserDestination(rawUrl) {
    try {
        const parsed = new URL(String(rawUrl || ""));
        return (parsed.protocol === "http:" || parsed.protocol === "https:") &&
            Boolean(parsed.hostname) && !parsed.username && !parsed.password;
    } catch {
        return false;
    }
}

function explainBrowserNavigationError(error) {
    const raw = String(error?.message || error || "");
    const code = raw.match(/net::(ERR_[A-Z_]+)/i)?.[1]?.toUpperCase() || "";
    const hints = {
        ERR_NAME_NOT_RESOLVED: "The website address could not be found. Check the spelling or your internet connection.",
        ERR_INTERNET_DISCONNECTED: "The computer appears to be offline. Reconnect and try again.",
        ERR_CONNECTION_REFUSED: "The website refused the connection. It may be unavailable or blocking this browser.",
        ERR_CONNECTION_TIMED_OUT: "The website took too long to respond. Try again or open it in your regular browser.",
        ERR_TIMED_OUT: "The website took too long to respond. Try again or open it in your regular browser.",
        ERR_CERT_AUTHORITY_INVALID: "The website's security certificate could not be verified. JARVIS stopped navigation for your safety.",
        ERR_CERT_DATE_INVALID: "The website's security certificate is expired or not yet valid. JARVIS stopped navigation for your safety.",
        ERR_BLOCKED_BY_CLIENT: "The request was blocked by a browser rule or extension. Try the page in your regular browser.",
        ERR_ABORTED: "Navigation was interrupted before the page finished opening. Try again."
    };
    return { code, message: hints[code] || raw || "The page could not be opened. Check the address and try again." };
}

function looksLikeURL(input) {

    const value = safeString(input);

    if (!value) {
        return false;
    }

    // Already has an explicit scheme.
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
        return true;
    }

    // No spaces + contains a dot + plausible domain/TLD, OR a bare
    // "localhost"/"localhost:port" — treat as a navigable host.
    if (/\s/.test(value)) {
        return false;
    }

    if (/^localhost(:\d+)?(\/.*)?$/i.test(value)) {
        return true;
    }

    return /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/.*)?$/i.test(value);
}

/*
 * Smart-search resolution: decide whether the address-bar text is
 * a URL to navigate to, or a query to search for.
 * NOTE: this is a deliberately small, self-contained heuristic —
 * it does NOT go through the much larger renderer/js/brain/browser/*
 * intent-understanding stack (BrowserBrain/BrowserAgent/etc). Wiring
 * voice-driven "Jarvis, <do something> on Google" style commands
 * through that stack is future work (Phase 2+); this function only
 * has to answer "is this text a URL or a search?" for the address bar.
 */
function resolveSmartSearchTarget(input) {

    const value = safeString(input);

    if (value.toLowerCase() === "about:blank") return "about:blank";

    if (!value) {
        return BROWSER_HOME_URL;
    }

    if (looksLikeURL(value)) {

        return /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
            ? value
            : `https://${value}`;
    }

    return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

function serializeBrowserTab(tab) {

    if (!tab) {
        return null;
    }

    return {
        id: tab.id,
        title: tab.title || "New Tab",
        url: tab.url || "",
        favicon: tab.favicon || null,
        loading: Boolean(tab.loading),
        canGoBack: Boolean(tab.canGoBack),
        canGoForward: Boolean(tab.canGoForward),
        active: tab.id === activeBrowserTabId,
        pinned: Boolean(tab.pinned),
        muted: Boolean(tab.muted),
        error: tab.error || null
    };
}

function emitBrowserTabEvent(type, tabId, extra = {}) {

    if (
        !mainWindow ||
        mainWindow.isDestroyed()
    ) {
        return;
    }

    try {

        mainWindow.webContents.send(
            "browser:tab-event",
            {
                type,
                tabId,
                tabs: getAllBrowserTabsSerialized(),
                ...extra
            }
        );

    } catch (error) {

        errorLog(
            "Failed to emit browser tab event:",
            error
        );
    }
}

function getAllBrowserTabsSerialized() {

    return Array.from(browserTabs.values())
        .map(serializeBrowserTab);
}

function layoutActiveBrowserView() {

    const tab = activeBrowserTabId ? browserTabs.get(activeBrowserTabId) : null;

    if (!mainWindow || mainWindow.isDestroyed()) return;

    const detach = (oldTab) => {
        if (!oldTab) return;
        try {
            if (oldTab.viewKind === "webcontents" && mainWindow.contentView) {
                mainWindow.contentView.removeChildView(oldTab.view);
            } else if (typeof mainWindow.removeBrowserView === "function") {
                mainWindow.removeBrowserView(oldTab.view);
            }
        } catch (_) {}
    };

    const currentAttached = attachedBrowserTabId
        ? browserTabs.get(attachedBrowserTabId)
        : null;

    if (!tab || !browserPanelVisible) {
        detach(currentAttached);
        attachedBrowserTabId = null;
        return;
    }

    if (attachedBrowserTabId !== tab.id) {
        detach(currentAttached);

        try {
            if (tab.viewKind === "webcontents" && mainWindow.contentView) {
                mainWindow.contentView.addChildView(tab.view);
            } else {
                mainWindow.addBrowserView(tab.view);
            }
            attachedBrowserTabId = tab.id;
        } catch (error) {
            errorLog("Failed to attach browser view:", error);
            attachedBrowserTabId = null;
            return;
        }
    }

    try {
        tab.view.setBounds({
            x: Math.round(browserPanelBounds.x || 0),
            y: Math.round(browserPanelBounds.y || 0),
            width: Math.max(1, Math.round(browserPanelBounds.width || 0)),
            height: Math.max(1, Math.round(browserPanelBounds.height || 0))
        });

        if (typeof tab.view.setAutoResize === "function") {
            tab.view.setAutoResize({ width: true, height: true });
        }

        // Force the webContents to repaint after bounds update
        try {
            tab.view.webContents.setZoomFactor(tab.zoomFactor || 1.0);
        } catch (_) {}
    } catch (error) {
        errorLog("Failed to layout browser view:", error);
    }
}

function attachBrowserTabEvents(tab) {

    const wc = tab.view.webContents;

    wc.on("page-title-updated", (event, title) => {

        tab.title = title || tab.title;
        emitBrowserTabEvent("title", tab.id);

        recordHistoryEntry(tab);
    });

    wc.on("page-favicon-updated", (event, favicons) => {

        tab.favicon = (favicons && favicons[0]) || null;
        emitBrowserTabEvent("favicon", tab.id);
    });

    wc.on("did-start-loading", () => {

        tab.loading = true;
        tab.error = null;
        emitBrowserTabEvent("loading", tab.id);
    });

    wc.on("did-stop-loading", () => {

        tab.loading = false;
        tab.canGoBack = wc.canGoBack();
        tab.canGoForward = wc.canGoForward();
        emitBrowserTabEvent("loading", tab.id);
    });

    wc.on("did-navigate", (event, url) => {

        tab.url = url;
        tab.canGoBack = wc.canGoBack();
        tab.canGoForward = wc.canGoForward();
        emitBrowserTabEvent("navigate", tab.id);

        recordHistoryEntry(tab);
    });

    wc.on("did-navigate-in-page", (event, url) => {

        tab.url = url;
        tab.canGoBack = wc.canGoBack();
        tab.canGoForward = wc.canGoForward();
        emitBrowserTabEvent("navigate", tab.id);
    });

    wc.on("did-fail-load", (event, errorCode, errorDescription, validatedURL, isMainFrame) => {

        if (!isMainFrame || errorCode === -3) {
            // -3 = ERR_ABORTED (e.g. user navigated away mid-load) — not a real error.
            return;
        }

        tab.loading = false;
        tab.error = errorDescription || `Failed to load (code ${errorCode})`;
        emitBrowserTabEvent("error", tab.id);
    });

    wc.on("did-finish-load", () => {

        // Re-sync bounds after page finishes loading — fixes blank/black
        // viewport issue where the BrowserView was attached with 0x0 bounds
        // before the renderer sent the correct viewport rect.
        setTimeout(() => layoutActiveBrowserView(), 50);
    });

    wc.on("render-process-gone", (event, details) => {

        tab.loading = false;
        tab.error = `Page crashed (${details?.reason || "unknown"})`;
        emitBrowserTabEvent("error", tab.id);

        errorLog(
            `Browser tab ${tab.id} renderer process gone:`,
            details
        );
    });

    wc.on("found-in-page", (event, result) => {

        emitBrowserTabEvent("find-result", tab.id, {
            activeMatchOrdinal: result.activeMatchOrdinal,
            matches: result.matches
        });
    });

    // Intercept new-window / target=_blank / window.open() —
    // open as a managed tab instead of an unmanaged native window.
    wc.setWindowOpenHandler(({ url }) => {

        if (isNavigableURL(url) && (url === "about:blank" || isSafeBrowserDestination(url))) {
            createBrowserTab(url, { activate: true });
        }

        return { action: "deny" };
    });

    // Block navigation to disallowed schemes inside the page itself.
    wc.on("will-navigate", (event, url) => {

        if (!isNavigableURL(url) || (url !== "about:blank" && !isSafeBrowserDestination(url))) {

            event.preventDefault();

            warn(
                `Blocked in-page navigation to disallowed URL: ${url}`
            );
        }
    });

    wc.on("will-redirect", (event, url) => {

        if (!isNavigableURL(url) || (url !== "about:blank" && !isSafeBrowserDestination(url))) {
            event.preventDefault();
        }
    });
}

function createBrowserTab(initialUrl, options = {}) {

    if (
        !mainWindow ||
        mainWindow.isDestroyed()
    ) {
        return failure("Main window is not available.");
    }

    const target = resolveSmartSearchTarget(
        safeString(initialUrl) || BROWSER_HOME_URL
    );
    if (!isNavigableURL(target) || (target !== "about:blank" && !isSafeBrowserDestination(target))) {
        return failure("Enter a valid HTTP or HTTPS website address.");
    }

    const id = `tab-${++browserTabCounter}`;

    // Electron 37+ recommends WebContentsView over the deprecated BrowserView.
    // Use it when available, with BrowserView as a compatibility fallback.
    const viewOptions = {
        webPreferences: {
            partition: BROWSER_SESSION_PARTITION,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
            backgroundColor: "#ffffff"
        }
    };
    const useWebContentsView = typeof WebContentsView === "function";
    const view = useWebContentsView
        ? new WebContentsView(viewOptions)
        : new BrowserView(viewOptions);
    configureBrowserSession(view.webContents.session);

    const tab = {
        id,
        view,
        viewKind: useWebContentsView ? "webcontents" : "browserview",
        title: "New Tab",
        url: "",
        favicon: null,
        loading: false,
        canGoBack: false,
        canGoForward: false,
        pinned: false,
        muted: false,
        zoomFactor: 1.0,
        error: null
    };

    browserTabs.set(id, tab);
    attachBrowserTabEvents(tab);
    attachDownloadHandling(view.webContents.session);

    view.webContents.loadURL(target).catch((error) => {

        tab.error = error?.message || String(error);
        emitBrowserTabEvent("error", id);
    });

    tab.url = target;

    if (options.activate !== false) {
        activeBrowserTabId = id;
        layoutActiveBrowserView();
    }

    emitBrowserTabEvent("created", id);

    return success({
        tabId: id,
        tabs: getAllBrowserTabsSerialized()
    });
}

function closeBrowserTab(id) {

    const tab = browserTabs.get(id);

    if (!tab) {
        return failure("Tab not found.");
    }

    try {

        if (mainWindow && !mainWindow.isDestroyed() && attachedBrowserTabId === id) {
            try {
                if (tab.viewKind === "webcontents" && mainWindow.contentView) {
                    mainWindow.contentView.removeChildView(tab.view);
                } else {
                    mainWindow.removeBrowserView(tab.view);
                }
            } catch (_) {}
            attachedBrowserTabId = null;
        }

        if (!tab.view.webContents.isDestroyed()) {
            tab.view.webContents.destroy();
        }

    } catch (error) {

        errorLog(
            "Error destroying browser tab:",
            error
        );
    }

    browserTabs.delete(id);

    if (activeBrowserTabId === id) {

        const remaining = Array.from(browserTabs.keys());
        activeBrowserTabId = remaining.length
            ? remaining[remaining.length - 1]
            : null;

        layoutActiveBrowserView();
    }

    emitBrowserTabEvent("closed", id);

    return success({
        tabs: getAllBrowserTabsSerialized(),
        activeTabId: activeBrowserTabId
    });
}

function destroyAllBrowserTabs() {

    Array.from(browserTabs.keys()).forEach((id) => {
        closeBrowserTab(id);
    });
}

function switchBrowserTab(id) {

    if (!browserTabs.has(id)) {
        return failure("Tab not found.");
    }

    activeBrowserTabId = id;
    layoutActiveBrowserView();

    emitBrowserTabEvent("switched", id);

    return success({
        tabId: id,
        tabs: getAllBrowserTabsSerialized()
    });
}

function registerEmbeddedBrowserIPC() {

    registerHandler(
        "browser:new-tab",
        async (event, url) => {
            return createBrowserTab(url, { activate: true });
        }
    );

    registerHandler(
        "browser:close-tab",
        async (event, tabId) => {
            return closeBrowserTab(tabId);
        }
    );

    registerHandler(
        "browser:switch-tab",
        async (event, tabId) => {
            return switchBrowserTab(tabId);
        }
    );

    registerHandler(
        "browser:navigate",
        async (event, tabId, input) => {

            const tab = browserTabs.get(tabId);

            if (!tab) {
                return failure("Tab not found.");
            }

            const target = resolveSmartSearchTarget(input);

            if (!isNavigableURL(target)) {
                return failure("Only HTTP/HTTPS URLs can be opened.");
            }

            if (target !== "about:blank" && !isSafeBrowserDestination(target)) {
                return failure("Enter a valid HTTP or HTTPS website address.");
            }

            try {

                await tab.view.webContents.loadURL(target);
                tab.url = target;

                return success({ url: target });

            } catch (error) {

                tab.error = error?.message || String(error);
                emitBrowserTabEvent("error", tabId);
                const diagnostic = explainBrowserNavigationError(error);
                return failure(diagnostic.message, { code: diagnostic.code, detail: tab.error, url: target });
            }
        }
    );

    // Voice playback is deliberately limited to YouTube. JARVIS opens its
    // own search-results page, selects the first video result, then loads it.
    registerHandler("browser:youtube-play", async (event, rawQuery) => {
        const raw = safeString(rawQuery).trim();
        const useCurrentPage = raw === "__CURRENT__";
        const query = useCurrentPage ? "" : raw.slice(0, 240);
        if (!useCurrentPage && !query) return failure("Tell me which video or song to play.");

        const searchUrl = query ? `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}` : "";
        let tab = activeBrowserTabId ? browserTabs.get(activeBrowserTabId) : null;
        if (!tab) {
            if (useCurrentPage) return failure("Open a YouTube video in JARVIS browser first.");
            const created = createBrowserTab(searchUrl, { activate: true });
            if (!created?.success) return created || failure("Could not open JARVIS browser.");
            tab = browserTabs.get(created.tabId);
        }
        if (!tab?.view?.webContents) return failure("JARVIS browser tab is unavailable.");

        try {
            if (useCurrentPage) {
                const currentUrl = new URL(tab.view.webContents.getURL());
                if (!/^(www\.)?youtube\.com$/i.test(currentUrl.hostname)) return failure("Open YouTube in JARVIS browser first.");
                if (currentUrl.pathname === "/watch") {
                    const started = await tab.view.webContents.executeJavaScript(`(() => {
                        const player = document.querySelector("video");
                        if (!player) return false;
                        const result = player.play();
                        return result && typeof result.then === "function" ? result.then(() => true).catch(() => false) : true;
                    })()`);
                    return started ? success({ url: currentUrl.toString() }) : failure("YouTube could not start playback.");
                }
            } else {
                await tab.view.webContents.loadURL(searchUrl);
            }
            const resultHref = await tab.view.webContents.executeJavaScript(`(() => new Promise(resolve => {
                let tries = 0;
                const find = () => {
                    const renderers = [...document.querySelectorAll('ytd-video-renderer')];
                    const organic = renderers.find(renderer => {
                        if (renderer.matches('[is-ad], [is-promoted]')) return false;
                        if (renderer.closest('ytd-ad-slot-renderer, ytd-promoted-sparkles-web-renderer, ytd-promoted-video-renderer')) return false;
                        if (renderer.querySelector('ytd-ad-badge-renderer, ytd-display-ad-renderer, .badge-style-type-ad, ytd-promoted-sparkles-text-search-renderer')) return false;
                        const labels = [...renderer.querySelectorAll('[aria-label], yt-formatted-string')]
                            .map(node => (node.getAttribute('aria-label') || node.textContent || '').trim().toLowerCase());
                        if (labels.some(label => /^(sponsored|ad|advertisement)$/.test(label))) return false;
                        return Boolean(renderer.querySelector('a#video-title[href*="/watch"], a#thumbnail[href*="/watch"]'));
                    });
                    const link = organic?.querySelector('a#video-title[href*="/watch"], a#thumbnail[href*="/watch"]');
                    if (link?.href) return resolve(link.href);
                    if (++tries >= 48) return resolve("");
                    setTimeout(find, 250);
                };
                find();
            }))()`);

            if (!resultHref) return failure("YouTube did not show a video result for that search.");
            const parsed = new URL(resultHref);
            if (!/^(www\.)?youtube\.com$/i.test(parsed.hostname) || parsed.pathname !== "/watch" || !parsed.searchParams.get("v")) {
                return failure("YouTube returned an invalid video link.");
            }

            const playUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(parsed.searchParams.get("v"))}&autoplay=1`;
            await tab.view.webContents.loadURL(playUrl);
            tab.url = playUrl;
            return success({ url: playUrl, query });
        } catch (error) {
            tab.error = error?.message || String(error);
            return failure(tab.error);
        }
    });

    // Read visible Google Shopping offer cards from JARVIS's own embedded
    // browser. The page must be a Google Shopping results page; renderer
    // input cannot provide script or arbitrary URLs to this extractor.
    registerHandler("browser:compare-shopping", async (_event, rawTabId) => {
        const tabId = safeString(rawTabId);
        const tab = browserTabs.get(tabId);
        if (!tab?.view?.webContents) return failure("Shopping results tab is unavailable.");

        try {
            const pageUrl = new URL(tab.view.webContents.getURL());
            if (!/(^|\.)google\.(com|co\.in)$/i.test(pageUrl.hostname) || pageUrl.searchParams.get("tbm") !== "shop") {
                return failure("Open Google Shopping results in the JARVIS Browser before comparing offers.");
            }

            const offers = await tab.view.webContents.executeJavaScript(`(() => new Promise(resolve => {
                const deadline = Date.now() + 12000;
                const clean = value => String(value || '').replace(/\\s+/g, ' ').trim();
                const merchantUrl = href => {
                    try {
                        let url = new URL(href, location.href);
                        for (const key of ['url', 'q', 'adurl']) {
                            const redirected = url.searchParams.get(key);
                            if (redirected && /^https?:\\/\\//i.test(redirected)) { url = new URL(redirected); break; }
                        }
                        if (!/^https?:$/.test(url.protocol) || /(^|\\.)google\\.(com|co\\.in)$/i.test(url.hostname) || /googleusercontent|gstatic/i.test(url.hostname)) return '';
                        return url.href;
                    } catch { return ''; }
                };
                const scan = () => {
                    const roots = [...document.querySelectorAll('.sh-dgr__grid-result, .sh-dlr__list-result, [data-docid]')];
                    const found = [];
                    for (const root of roots) {
                        const text = clean(root.innerText || root.textContent);
                        const priceMatch = text.match(/(?:₹|Rs\\.?\\s?|INR\\s?)[\\s]*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)/i);
                        if (!priceMatch) continue;
                        const price = Number(priceMatch[1].replace(/,/g, ''));
                        if (!Number.isFinite(price) || price <= 0 || price > 100000000) continue;
                        const titleNode = root.querySelector('h3, [role="heading"], .tAxDx, .Xjkr3b, .sh-np__product-title');
                        const title = clean(titleNode?.innerText || titleNode?.textContent || '');
                        if (!title || title.length < 5) continue;
                        const links = [...root.querySelectorAll('a[href]')].map(anchor => ({
                            url: merchantUrl(anchor.href),
                            label: clean(anchor.innerText || anchor.getAttribute('aria-label'))
                        })).filter(link => link.url);
                        if (!links.length) continue;
                        const link = links.find(item => /shop|visit|buy|store|website/i.test(item.label)) || links[0];
                        let merchant = '';
                        try { merchant = new URL(link.url).hostname.replace(/^www\\./, ''); } catch {}
                        found.push({ title, price, currency: 'INR', merchant, url: link.url });
                    }
                    const unique = [...new Map(found.map(item => [item.url + '|' + item.price, item])).values()]
                        .sort((a, b) => a.price - b.price).slice(0, 12);
                    if (unique.length || Date.now() >= deadline) return resolve(unique);
                    setTimeout(scan, 350);
                };
                scan();
            }))()`);

            if (!Array.isArray(offers) || offers.length === 0) {
                return failure("Google Shopping loaded, but JARVIS could not read reliable prices and merchant purchase links from the visible listings.");
            }
            return success({ offers, checkedAt: new Date().toISOString(), source: "Google Shopping", url: pageUrl.href });
        } catch (error) {
            return failure(error?.message || "Could not compare the visible shopping offers.");
        }
    });

    registerHandler(
        "browser:go-back",
        async (event, tabId) => {

            const tab = browserTabs.get(tabId);

            if (!tab) {
                return failure("Tab not found.");
            }

            if (tab.view.webContents.canGoBack()) {
                tab.view.webContents.goBack();
            }

            return success();
        }
    );

    registerHandler(
        "browser:go-forward",
        async (event, tabId) => {

            const tab = browserTabs.get(tabId);

            if (!tab) {
                return failure("Tab not found.");
            }

            if (tab.view.webContents.canGoForward()) {
                tab.view.webContents.goForward();
            }

            return success();
        }
    );

    registerHandler(
        "browser:reload",
        async (event, tabId) => {

            const tab = browserTabs.get(tabId);

            if (!tab) {
                return failure("Tab not found.");
            }

            tab.view.webContents.reload();

            return success();
        }
    );

    registerHandler(
        "browser:stop",
        async (event, tabId) => {

            const tab = browserTabs.get(tabId);

            if (!tab) {
                return failure("Tab not found.");
            }

            tab.view.webContents.stop();

            return success();
        }
    );

    registerHandler(
        "browser:get-tabs",
        async () => {

            return success({
                tabs: getAllBrowserTabsSerialized(),
                activeTabId: activeBrowserTabId
            });
        }
    );

    registerHandler(
        "browser:set-bounds",
        async (event, rect) => {

            browserPanelBounds = {
                x: Number(rect?.x) || 0,
                y: Number(rect?.y) || 0,
                width: Number(rect?.width) || 0,
                height: Number(rect?.height) || 0
            };

            layoutActiveBrowserView();

            return success();
        }
    );

    registerHandler(
        "browser:set-visible",
        async (event, visible) => {

            browserPanelVisible = Boolean(visible);
            layoutActiveBrowserView();

            return success({ visible: browserPanelVisible });
        }
    );
}

/* ============================================================
   BOOKMARKS & HISTORY — DISK-PERSISTED STORE (Phase 3)
   ------------------------------------------------------------
   Plain JSON files under app.getPath("userData") — deliberately
   NOT electron-store: package.json lists electron-store@^10,
   which ships ESM-only, and this file is CommonJS (`require`)
   throughout, so `require("electron-store")` would throw at
   runtime. fs.promises + a small in-memory cache is simpler,
   has zero extra runtime dependency risk, and matches the
   pattern already used elsewhere in this file (FILE_SAFE_ROOT
   etc).
============================================================ */

const BOOKMARKS_FILE = () => path.join(app.getPath("userData"), "bookmarks.json");
const HISTORY_FILE = () => path.join(app.getPath("userData"), "history.json");

const HISTORY_MAX_ENTRIES = 2000;

let bookmarksStore = null; // [{ id, url, title, createdAt }]
let historyStore = null;   // [{ id, url, title, visitedAt }]

async function loadJSONStore(filePath, fallback) {

    try {

        const raw = await fs.promises.readFile(filePath, "utf-8");
        const parsed = JSON.parse(raw);

        return Array.isArray(parsed) ? parsed : fallback;

    } catch {

        // Missing file on first run, or corrupt JSON — start clean
        // rather than crash the browser feature.
        return fallback;
    }
}

async function saveJSONStore(filePath, data) {

    try {

        await fs.promises.mkdir(
            path.dirname(filePath),
            { recursive: true }
        );

        await fs.promises.writeFile(
            filePath,
            JSON.stringify(data, null, 2),
            "utf-8"
        );

        return true;

    } catch (error) {

        errorLog(
            `Failed to save store to ${filePath}:`,
            error
        );

        return false;
    }
}

async function ensureBookmarksLoaded() {

    if (bookmarksStore === null) {
        bookmarksStore = await loadJSONStore(BOOKMARKS_FILE(), []);
    }

    return bookmarksStore;
}

async function ensureHistoryLoaded() {

    if (historyStore === null) {
        historyStore = await loadJSONStore(HISTORY_FILE(), []);
    }

    return historyStore;
}

function makeStoreId() {

    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/*
 * Called from attachBrowserTabEvents' did-navigate handler
 * (Phase 1 code) to auto-record visited pages. Fire-and-forget —
 * a history-write failure must never affect browsing itself.
 */
async function recordHistoryEntry(tab) {

    try {

        const url = tab?.url;

        if (!url || !isNavigableURL(url) || url === "about:blank") {
            return;
        }

        await ensureHistoryLoaded();

        const last = historyStore[historyStore.length - 1];

        // Collapse consecutive duplicate visits (e.g. title updating
        // after load fires a second did-navigate-in-page) into one entry.
        if (last && last.url === url) {
            last.title = tab.title || last.title;
            last.visitedAt = Date.now();
        } else {

            historyStore.push({
                id: makeStoreId(),
                url,
                title: tab.title || url,
                visitedAt: Date.now()
            });

            if (historyStore.length > HISTORY_MAX_ENTRIES) {
                historyStore.splice(0, historyStore.length - HISTORY_MAX_ENTRIES);
            }
        }

        await saveJSONStore(HISTORY_FILE(), historyStore);

    } catch (error) {

        errorLog(
            "Failed to record history entry:",
            error
        );
    }
}

function registerBookmarksIPC() {

    registerHandler(
        "bookmarks:add",
        async (event, { url, title } = {}) => {

            const target = safeString(url);

            if (!target || !isNavigableURL(target)) {
                return failure("A valid http(s) URL is required.");
            }

            await ensureBookmarksLoaded();

            if (bookmarksStore.some(b => b.url === target)) {
                return success({ bookmarks: bookmarksStore, alreadyExists: true });
            }

            bookmarksStore.push({
                id: makeStoreId(),
                url: target,
                title: safeString(title) || target,
                createdAt: Date.now()
            });

            await saveJSONStore(BOOKMARKS_FILE(), bookmarksStore);

            return success({ bookmarks: bookmarksStore });
        }
    );

    registerHandler(
        "bookmarks:remove",
        async (event, { id, url } = {}) => {

            await ensureBookmarksLoaded();

            bookmarksStore = bookmarksStore.filter(
                b => b.id !== id && b.url !== url
            );

            await saveJSONStore(BOOKMARKS_FILE(), bookmarksStore);

            return success({ bookmarks: bookmarksStore });
        }
    );

    registerHandler(
        "bookmarks:list",
        async () => {

            await ensureBookmarksLoaded();

            return success({ bookmarks: bookmarksStore });
        }
    );

    registerHandler(
        "bookmarks:is-bookmarked",
        async (event, url) => {

            await ensureBookmarksLoaded();

            const target = safeString(url);

            return success({
                bookmarked: bookmarksStore.some(b => b.url === target)
            });
        }
    );
}

function registerHistoryIPC() {

    registerHandler(
        "history:list",
        async (event, options = {}) => {

            await ensureHistoryLoaded();

            const limit = Math.min(
                Number(options?.limit) || 200,
                HISTORY_MAX_ENTRIES
            );

            const items = historyStore
                .slice()
                .reverse()
                .slice(0, limit);

            return success({ history: items });
        }
    );

    registerHandler(
        "history:search",
        async (event, query) => {

            await ensureHistoryLoaded();

            const q = safeString(query).toLowerCase();

            if (!q) {
                return success({ history: [] });
            }

            const items = historyStore
                .filter(h =>
                    h.url.toLowerCase().includes(q) ||
                    (h.title || "").toLowerCase().includes(q)
                )
                .slice()
                .reverse()
                .slice(0, 200);

            return success({ history: items });
        }
    );

    registerHandler(
        "history:delete",
        async (event, id) => {

            await ensureHistoryLoaded();

            historyStore = historyStore.filter(h => h.id !== id);

            await saveJSONStore(HISTORY_FILE(), historyStore);

            return success({ history: historyStore });
        }
    );

    registerHandler(
        "history:clear",
        async () => {

            historyStore = [];

            await saveJSONStore(HISTORY_FILE(), historyStore);

            return success({ history: [] });
        }
    );
}

/* ============================================================
   PAGE TOOLS — zoom, print, find-in-page, save page (Phase 4)
============================================================ */

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3.0;
const ZOOM_STEP = 0.1;

function clampZoom(value) {

    return Math.min(
        ZOOM_MAX,
        Math.max(ZOOM_MIN, value)
    );
}

function registerPageToolsIPC() {

    registerHandler(
        "browser:zoom-in",
        async (event, tabId) => {

            const tab = browserTabs.get(tabId);

            if (!tab) {
                return failure("Tab not found.");
            }

            tab.zoomFactor = clampZoom(tab.zoomFactor + ZOOM_STEP);
            tab.view.webContents.setZoomFactor(tab.zoomFactor);

            return success({ zoomFactor: tab.zoomFactor });
        }
    );

    registerHandler(
        "browser:zoom-out",
        async (event, tabId) => {

            const tab = browserTabs.get(tabId);

            if (!tab) {
                return failure("Tab not found.");
            }

            tab.zoomFactor = clampZoom(tab.zoomFactor - ZOOM_STEP);
            tab.view.webContents.setZoomFactor(tab.zoomFactor);

            return success({ zoomFactor: tab.zoomFactor });
        }
    );

    registerHandler(
        "browser:zoom-reset",
        async (event, tabId) => {

            const tab = browserTabs.get(tabId);

            if (!tab) {
                return failure("Tab not found.");
            }

            tab.zoomFactor = 1.0;
            tab.view.webContents.setZoomFactor(1.0);

            return success({ zoomFactor: 1.0 });
        }
    );

    registerHandler(
        "browser:get-zoom",
        async (event, tabId) => {

            const tab = browserTabs.get(tabId);

            if (!tab) {
                return failure("Tab not found.");
            }

            return success({ zoomFactor: tab.zoomFactor });
        }
    );

    registerHandler(
        "browser:print",
        async (event, tabId) => {

            const tab = browserTabs.get(tabId);

            if (!tab) {
                return failure("Tab not found.");
            }

            try {

                tab.view.webContents.print({ silent: false });
                return success();

            } catch (error) {

                return failure(error?.message || String(error));
            }
        }
    );

    registerHandler(
        "browser:save-page",
        async (event, tabId) => {

            const tab = browserTabs.get(tabId);

            if (!tab) {
                return failure("Tab not found.");
            }

            try {

                const defaultName =
                    (tab.title || "page").replace(/[\\/:*?"<>|]/g, "_") + ".html";

                const { canceled, filePath } = await dialog.showSaveDialog(
                    mainWindow,
                    {
                        defaultPath: path.join(app.getPath("downloads"), defaultName),
                        filters: [
                            { name: "Webpage, Complete", extensions: ["html"] }
                        ]
                    }
                );

                if (canceled || !filePath) {
                    return success({ saved: false });
                }

                await tab.view.webContents.savePage(filePath, "HTMLComplete");

                return success({ saved: true, filePath });

            } catch (error) {

                return failure(error?.message || String(error));
            }
        }
    );

    registerHandler(
        "browser:find",
        async (event, tabId, text, options = {}) => {

            const tab = browserTabs.get(tabId);

            if (!tab) {
                return failure("Tab not found.");
            }

            if (!text) {

                tab.view.webContents.stopFindInPage("clearSelection");
                return success({ stopped: true });
            }

            tab.view.webContents.findInPage(text, {
                forward: options.forward !== false,
                findNext: Boolean(options.findNext)
            });

            return success();
        }
    );

    registerHandler(
        "browser:find-stop",
        async (event, tabId) => {

            const tab = browserTabs.get(tabId);

            if (!tab) {
                return failure("Tab not found.");
            }

            tab.view.webContents.stopFindInPage("clearSelection");

            return success();
        }
    );
}

/* ============================================================
   DOWNLOAD MANAGER (Phase 4)
   ------------------------------------------------------------
   Hooked into each BrowserView tab's session ('will-download').
   All browser tabs currently share Electron's default session
   (no partition was set when creating the BrowserView), so the
   listener is attached once per unique session via
   `hookedDownloadSessions` to avoid double-firing.

   Security posture (08-browser-rules.md — "download protection"):
   downloads are auto-saved to app.getPath("downloads") with a
   collision-safe filename (never silently overwritten, never
   written outside that folder) rather than trusting a
   page-supplied path.
============================================================ */

const hookedDownloadSessions = new WeakSet();
const downloadItems = new Map(); // id -> Electron DownloadItem (not serializable)
let downloadRecords = [];        // serializable snapshot, id-matched to downloadItems

function uniqueDownloadPath(dir, filename) {

    let target = path.join(dir, filename);
    let counter = 1;

    const ext = path.extname(filename);
    const base = filename.slice(0, filename.length - ext.length);

    while (fs.existsSync(target)) {

        target = path.join(dir, `${base} (${counter})${ext}`);
        counter += 1;
    }

    return target;
}

function serializeDownload(id) {

    const record = downloadRecords.find(d => d.id === id);
    return record || null;
}

function emitDownloadsEvent() {

    if (!mainWindow || mainWindow.isDestroyed()) {
        return;
    }

    try {

        mainWindow.webContents.send(
            "downloads:event",
            { downloads: downloadRecords.slice().reverse() }
        );

    } catch (error) {

        errorLog(
            "Failed to emit downloads event:",
            error
        );
    }
}

function attachDownloadHandling(ses) {

    if (!ses || hookedDownloadSessions.has(ses)) {
        return;
    }

    hookedDownloadSessions.add(ses);

    ses.on("will-download", (event, item) => {

        const id = makeStoreId();
        const dir = app.getPath("downloads");
        const savePath = uniqueDownloadPath(dir, item.getFilename());

        item.setSavePath(savePath);

        const record = {
            id,
            filename: path.basename(savePath),
            url: item.getURL(),
            savePath,
            state: "progressing",
            receivedBytes: 0,
            totalBytes: item.getTotalBytes(),
            startedAt: Date.now()
        };

        downloadRecords.push(record);
        downloadItems.set(id, item);
        emitDownloadsEvent();

        item.on("updated", (updEvent, state) => {

            record.state = state === "interrupted" ? "interrupted" : "progressing";
            record.receivedBytes = item.getReceivedBytes();
            record.totalBytes = item.getTotalBytes();
            record.canPause = item.canResume ? !item.isPaused() : false;
            record.paused = item.isPaused ? item.isPaused() : false;

            emitDownloadsEvent();
        });

        item.once("done", (doneEvent, state) => {

            record.state = state; // "completed" | "cancelled" | "interrupted"
            record.receivedBytes = item.getReceivedBytes();

            downloadItems.delete(id);
            emitDownloadsEvent();
        });
    });
}

function registerDownloadsIPC() {

    registerHandler(
        "downloads:list",
        async () => {

            return success({
                downloads: downloadRecords.slice().reverse()
            });
        }
    );

    registerHandler(
        "downloads:pause",
        async (event, id) => {

            const item = downloadItems.get(id);

            if (item && item.canResume) {
                item.pause();
            }

            return success();
        }
    );

    registerHandler(
        "downloads:resume",
        async (event, id) => {

            const item = downloadItems.get(id);

            if (item && item.isPaused && item.isPaused()) {
                item.resume();
            }

            return success();
        }
    );

    registerHandler(
        "downloads:cancel",
        async (event, id) => {

            const item = downloadItems.get(id);

            if (item) {
                item.cancel();
            }

            return success();
        }
    );

    registerHandler(
        "downloads:open-file",
        async (event, id) => {

            const record = serializeDownload(id);

            if (!record || record.state !== "completed") {
                return failure("File is not available.");
            }

            const openError = await shell.openPath(record.savePath);

            if (openError) {
                return failure(openError);
            }

            return success();
        }
    );

    registerHandler(
        "downloads:show-in-folder",
        async (event, id) => {

            const record = serializeDownload(id);

            if (!record) {
                return failure("Download not found.");
            }

            shell.showItemInFolder(record.savePath);

            return success();
        }
    );

    registerHandler(
        "downloads:clear",
        async () => {

            downloadRecords = downloadRecords.filter(
                d => d.state === "progressing"
            );

            emitDownloadsEvent();

            return success({ downloads: downloadRecords });
        }
    );
}

/* ============================================================
   WINDOWS PROCESS LAUNCHER
============================================================ */

function spawnDetached(
    executable,
    args = []
) {

    return new Promise(
        (resolve) => {

            if (
                process.platform !== "win32"
            ) {

                resolve(
                    failure(
                        "Windows application launcher is only available on Windows."
                    )
                );

                return;
            }

            let child;

            try {

                child = spawn(
                    executable,
                    args,
                    {
                        detached: true,
                        stdio: "ignore",
                        windowsHide: true
                    }
                );

            } catch (error) {

                resolve(
                    failure(
                        error?.message ||
                        String(error),
                        {
                            executable
                        }
                    )
                );

                return;
            }

            let settled = false;

            const finish = (
                result
            ) => {

                if (settled) {
                    return;
                }

                settled = true;

                try {
                    child.unref();
                } catch {}

                resolve(
                    result
                );
            };

            child.once(
                "error",
                (error) => {

                    errorLog(
                        `${executable} launch error:`,
                        error
                    );

                    finish(
                        failure(
                            error?.message ||
                            String(error),
                            {
                                executable
                            }
                        )
                    );
                }
            );

            /*
             * Detached GUI applications normally do not
             * provide a useful exit event to us.
             *
             * Give Node a short window to catch spawn errors.
             */

            setTimeout(
                () => {

                    finish(
                        success({
                            executable
                        })
                    );

                },
                200
            );
        }
    );
}

/* ============================================================
   GENERIC PATH SEARCH HELPERS
   Shared by the expanded application launcher below.
============================================================ */

function findFirstExistingPath(paths) {

    return (paths || []).find(
        (p) => p && fs.existsSync(p)
    ) || "";
}

async function openFromPathCandidates(paths, appLabel) {

    const found = findFirstExistingPath(paths);

    if (!found) {
        return null; // signal: not found here, caller should try the next strategy
    }

    return spawnDetached(found);
}

/* ============================================================
   START MENU SHORTCUT SEARCH (generic app launcher fallback)

   Almost every Windows installer registers a .lnk shortcut under
   one of the two Start Menu "Programs" folders (per-user or
   machine-wide). Searching these by fuzzy name match lets JARVIS
   open apps it has no hardcoded path for — Discord, Telegram,
   Spotify, Teams, WhatsApp, Zoom, Slack, VLC, Steam, OBS, or any
   other installed app — instead of failing with "Unknown
   application" the moment something isn't hand-listed.
============================================================ */

function getStartMenuRoots() {

    const roots = [];

    if (process.env.PROGRAMDATA) {
        roots.push(path.join(process.env.PROGRAMDATA, "Microsoft", "Windows", "Start Menu", "Programs"));
    }

    if (process.env.APPDATA) {
        roots.push(path.join(process.env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs"));
    }

    return roots.filter((p) => {
        try {
            return fs.existsSync(p);
        } catch {
            return false;
        }
    });
}

function walkForShortcuts(root, depth = 0, maxDepth = 4) {

    const results = [];

    if (depth > maxDepth) return results;

    let entries;
    try {
        entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
        return results;
    }

    for (const entry of entries) {
        const fullPath = path.join(root, entry.name);
        if (entry.isDirectory()) {
            results.push(...walkForShortcuts(fullPath, depth + 1, maxDepth));
        } else if (entry.isFile() && /\.lnk$/i.test(entry.name)) {
            results.push(fullPath);
        }
    }

    return results;
}

function normalizeAppSearchName(name) {
    return String(name || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

/**
 * Fuzzy-find a Start Menu shortcut matching `name` and launch it via
 * Electron's shell.openPath (equivalent to double-clicking it).
 * Returns a success()/failure() result, or null if nothing matched
 * so the caller can produce its own "not found" message.
 */
async function launchByStartMenuShortcut(name) {

    if (process.platform !== "win32") {
        return null;
    }

    const target = normalizeAppSearchName(name);
    if (!target) return null;

    const roots = getStartMenuRoots();
    let candidates = [];

    for (const root of roots) {
        candidates.push(...walkForShortcuts(root));
    }

    if (!candidates.length) return null;

    // Exact (normalized) filename match first, then "contains" match
    // in either direction, so "vs code" also finds
    // "Visual Studio Code.lnk" and "discord" finds "Discord.lnk".
    let match = candidates.find((p) => normalizeAppSearchName(path.basename(p, ".lnk")) === target);

    if (!match) {
        match = candidates.find((p) => {
            const base = normalizeAppSearchName(path.basename(p, ".lnk"));
            return base.includes(target) || target.includes(base);
        });
    }

    if (!match) return null;

    try {
        const openError = await shell.openPath(match);
        if (openError) {
            return failure(openError, { app: name, shortcut: match });
        }
        return success({ app: name, shortcut: match });
    } catch (error) {
        return failure(error?.message || String(error), { app: name });
    }
}

// Store-installed Windows apps do not always have a .lnk under either
// Start Menu folder. Resolve their registered AppUserModelID and launch
// through the normal AppsFolder shell, with a strict name whitelist at
// each call site below.
async function launchWindowsStoreAppByName(name) {
    if (process.platform !== "win32") return null;
    const appName = String(name || "").trim();
    if (!/^[A-Za-z0-9 .'+-]{1,80}$/.test(appName)) return null;
    const psName = appName.replace(/'/g, "''");
    const command = `$app = Get-StartApps | Where-Object { $_.Name -ieq '${psName}' } | Select-Object -First 1; if ($app) { $app.AppID }`;

    return new Promise((resolve) => {
        execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
            windowsHide: true,
            timeout: 5000,
            maxBuffer: 64 * 1024
        }, async (error, stdout) => {
            if (error) return resolve(null);
            const appId = String(stdout || "").trim();
            if (!/^[A-Za-z0-9_.!{}-]+$/.test(appId)) return resolve(null);
            const result = await spawnDetached("explorer.exe", [`shell:AppsFolder\\${appId}`]);
            resolve(result?.success ? success({ app: appName, appId }) : result);
        });
    });
}

async function launchInstalledWindowsApp(names) {
    let lastFailure = null;
    for (const name of names) {
        const result = await getInstalledAppCatalog().launch(name);
        if (result?.success) return result;
        lastFailure = result;
    }
    return lastFailure;
}

async function openGeneratedPresentationInPptPlus(filePath) {
    if (process.platform !== "win32") return failure("PPT + file activation is only available on Windows.");
    const outputRoot = path.resolve(app.getPath("documents"), "JARVIS Presentations");
    const resolved = path.resolve(String(filePath || ""));
    if (!resolved.toLowerCase().endsWith(".pptx") || !resolved.toLowerCase().startsWith(`${outputRoot}${path.sep}`.toLowerCase()) || !fs.existsSync(resolved)) {
        return failure("The presentation file is missing or outside the JARVIS Presentations folder.");
    }

    // If Windows already associates .pptx with PPT +, opening the document
    // itself skips the app's welcome/recent-files screen. Keep the explicit
    // Store file activation below for machines without that association.
    try {
        const openError = await shell.openPath(resolved);
        if (!openError) return success({ app: "PPT +", openedUsingDefaultHandler: true });
    } catch (_) { /* Continue with explicit PPT + file activation. */ }

    // Windows' supported file-activation contract opens the file in the named
    // Store app, without changing the user's global .pptx default handler.
    const encodedPath = Buffer.from(resolved, "utf8").toString("base64");
    const script = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$InformationPreference = 'SilentlyContinue'
$WarningPreference = 'SilentlyContinue'
$app = Get-StartApps | Where-Object { $_.Name -ieq 'PPT +' } | Select-Object -First 1
if (-not $app) { throw 'PPT + is not registered in Windows Apps.' }
$filePath = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedPath}'))
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace Jarvis.AppActivation {
  [ComImport, Guid("b63ea76d-1f85-456f-a19c-48159efa858b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IShellItemArray { }
  [ComImport, Guid("2e941141-7f97-4756-ba1d-9decde894a3d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IApplicationActivationManager {
    [PreserveSig] int ActivateApplication([MarshalAs(UnmanagedType.LPWStr)] string appUserModelId, [MarshalAs(UnmanagedType.LPWStr)] string arguments, uint options, out uint processId);
    [PreserveSig] int ActivateForFile([MarshalAs(UnmanagedType.LPWStr)] string appUserModelId, IShellItemArray itemArray, [MarshalAs(UnmanagedType.LPWStr)] string verb, out uint processId);
    [PreserveSig] int ActivateForProtocol([MarshalAs(UnmanagedType.LPWStr)] string appUserModelId, IShellItemArray itemArray, out uint processId);
  }
  [ComImport, Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")] public class ApplicationActivationManager { }
  public static class ShellItems {
    [DllImport("shell32.dll", CharSet=CharSet.Unicode, PreserveSig=true)]
    public static extern int SHCreateShellItemArrayFromPaths(uint count, [MarshalAs(UnmanagedType.LPArray, ArraySubType=UnmanagedType.LPWStr, SizeParamIndex=0)] string[] paths, out IShellItemArray items);
    public static uint OpenInStoreApp(string appUserModelId, string filePath) {
      IShellItemArray items;
      int hr = SHCreateShellItemArrayFromPaths(1, new string[] { filePath }, out items);
      if (hr < 0) Marshal.ThrowExceptionForHR(hr);
      var manager = (IApplicationActivationManager)new ApplicationActivationManager();
      uint processId;
      hr = manager.ActivateForFile(appUserModelId, items, "open", out processId);
      if (Marshal.IsComObject(items)) Marshal.ReleaseComObject(items);
      if (Marshal.IsComObject(manager)) Marshal.ReleaseComObject(manager);
      if (hr < 0) Marshal.ThrowExceptionForHR(hr);
      return processId;
    }
  }
}
'@
$processId = [Jarvis.AppActivation.ShellItems]::OpenInStoreApp($app.AppID, $filePath)
Write-Output ('Activated PPT + with process ' + $processId)
`;

    const encodedCommand = Buffer.from(script, "utf16le").toString("base64");
    return new Promise(resolve => {
        execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-EncodedCommand", encodedCommand], {
            windowsHide: true,
            timeout: 30000,
            maxBuffer: 1024 * 1024
        }, async (error, stdout, stderr) => {
            if (error) {
                // Windows PowerShell serializes first-run module progress as
                // CLIXML on stderr. That diagnostic is not an actionable
                // launch error and should never leak into the chat reply.
                const details = String(stderr || "").trim();
                const usefulDetails = details && !/^#< CLIXML\b/i.test(details)
                    ? details.replace(/#< CLIXML[\s\S]*$/i, "").trim()
                    : "";
                // If Store app activation fails, use the Windows .pptx file
                // association to open the saved deck visibly as a fallback.
                try {
                    const openError = await shell.openPath(resolved);
                    if (!openError) return resolve(success({ app: "PPT +", openedUsingDefaultHandler: true }));
                } catch (_) { /* Report the activation failure below. */ }
                return resolve(failure((usefulDetails || error.message || "PPT + could not open the file.").slice(0, 500)));
            }
            resolve(success({ app: "PPT +", processId: Number(String(stdout).match(/process\s+(\d+)/i)?.[1]) || null }));
        });
    });
}

async function openGeneratedPdfInEdge(filePath) {
    if (process.platform !== "win32") return failure("Microsoft Edge PDF activation is only available on Windows.");
    const outputRoot = path.resolve(app.getPath("documents"), "JARVIS PDFs");
    const resolved = path.resolve(String(filePath || ""));
    if (!resolved.toLowerCase().endsWith(".pdf") || !resolved.toLowerCase().startsWith(`${outputRoot}${path.sep}`.toLowerCase()) || !fs.existsSync(resolved)) {
        return failure("The PDF is missing or outside the JARVIS PDFs folder.");
    }
    try {
        const fd = fs.openSync(resolved, "r");
        const header = Buffer.alloc(5);
        try { fs.readSync(fd, header, 0, header.length, 0); } finally { fs.closeSync(fd); }
        if (header.toString("ascii") !== "%PDF-") return failure("The saved file is not a valid PDF.");
    } catch (error) {
        return failure(error?.message || "The saved PDF could not be read.");
    }

    const edgePaths = [
        path.join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe"),
        path.join(process.env.PROGRAMFILES || "", "Microsoft", "Edge", "Application", "msedge.exe")
    ].filter(candidate => candidate && fs.existsSync(candidate));
    for (const executable of edgePaths) {
        const opened = await spawnDetached(executable, ["--new-window", resolved]);
        if (opened?.success) return success({ app: "Microsoft Edge", path: resolved });
    }
    const onPath = await spawnDetached("msedge.exe", ["--new-window", resolved]);
    if (onPath?.success) return success({ app: "Microsoft Edge", path: resolved });

    // If Edge isn't installed, preserve the Windows default PDF viewer fallback.
    const openError = await shell.openPath(resolved);
    return openError
        ? failure(`Microsoft Edge could not open the PDF: ${openError}`, { path: resolved })
        : success({ app: "Windows PDF viewer", path: resolved, openedUsingDefaultHandler: true });
}

/* ============================================================
   CHROME
============================================================ */

async function openChrome(options = {}) {

    if (
        process.platform !== "win32"
    ) {

        return openExternalURL(
            "https://www.google.com"
        );
    }

    const chromePaths = [

        path.join(
            process.env.PROGRAMFILES || "",
            "Google",
            "Chrome",
            "Application",
            "chrome.exe"
        ),

        path.join(
            process.env["PROGRAMFILES(X86)"] || "",
            "Google",
            "Chrome",
            "Application",
            "chrome.exe"
        ),

        path.join(
            process.env.LOCALAPPDATA || "",
            "Google",
            "Chrome",
            "Application",
            "chrome.exe"
        )
    ];

    const chromePath =
        chromePaths.find(
            (file) =>
                file &&
                fs.existsSync(file)
        );

    if (!chromePath) {

        warn(
            "Chrome executable not found. Opening Google in default browser."
        );

        return openExternalURL(
            "https://www.google.com"
        );
    }

    const searchQuery = safeString(options?.searchQuery).trim().slice(0, 160);
    const args = ["--no-first-run", "--no-default-browser-check"];
    if (searchQuery) {
        args.push(`https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`);
    }
    const launched = await spawnDetached(chromePath, args);
    return launched?.success
        ? { ...launched, app: "Google Chrome", searchHandled: Boolean(searchQuery), searchQuery }
        : launched;
}

/* ============================================================
   EDGE
============================================================ */

async function openEdge() {

    if (process.platform !== "win32") {
        return failure("Edge launcher is configured for Windows.");
    }

    const edgePaths = [
        path.join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe"),
        path.join(process.env.PROGRAMFILES || "", "Microsoft", "Edge", "Application", "msedge.exe")
    ];

    const result = await openFromPathCandidates(edgePaths);
    if (result) return result;

    warn("Edge executable not found at expected paths, trying msedge.exe on PATH.");
    return spawnDetached("msedge.exe");
}

/* ============================================================
   FIREFOX
============================================================ */

async function openFirefox() {

    if (process.platform !== "win32") {
        return failure("Firefox launcher is configured for Windows.");
    }

    const firefoxPaths = [
        path.join(process.env.PROGRAMFILES || "", "Mozilla Firefox", "firefox.exe"),
        path.join(process.env["PROGRAMFILES(X86)"] || "", "Mozilla Firefox", "firefox.exe")
    ];

    const result = await openFromPathCandidates(firefoxPaths);
    if (result) return result;

    return (await launchByStartMenuShortcut("firefox")) || failure("Firefox executable not found. Is it installed?");
}

/* ============================================================
   BRAVE
============================================================ */

async function openBrave() {

    if (process.platform !== "win32") {
        return failure("Brave launcher is configured for Windows.");
    }

    const bravePaths = [
        path.join(process.env.PROGRAMFILES || "", "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
        path.join(process.env["PROGRAMFILES(X86)"] || "", "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
        path.join(process.env.LOCALAPPDATA || "", "BraveSoftware", "Brave-Browser", "Application", "brave.exe")
    ];

    const result = await openFromPathCandidates(bravePaths);
    if (result) return result;

    return (await launchByStartMenuShortcut("brave")) || failure("Brave executable not found. Is it installed?");
}

/* ============================================================
   MICROSOFT OFFICE (Word / Excel / PowerPoint / Outlook / OneNote)
============================================================ */

async function openOfficeApp(exeName, friendlyName) {

    if (process.platform !== "win32") {
        return failure(`${friendlyName} launcher is configured for Windows.`);
    }

    const officeRoots = [
        path.join(process.env.PROGRAMFILES || "", "Microsoft Office", "root", "Office16"),
        path.join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft Office", "root", "Office16"),
        path.join(process.env.PROGRAMFILES || "", "Microsoft Office", "Office16"),
        path.join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft Office", "Office16")
    ];

    const paths = officeRoots.map((root) => path.join(root, exeName));
    const result = await openFromPathCandidates(paths);
    if (result) return result;

    return (await launchInstalledWindowsApp([friendlyName])) ||
        failure(`${friendlyName} executable not found. Is it installed?`);
}

/* ============================================================
   VS CODE
============================================================ */

async function openVSCode() {

    if (
        process.platform !== "win32"
    ) {

        return failure(
            "VS Code launcher is configured for Windows."
        );
    }

    return spawnDetached(
        "code.cmd"
    );
}

/* ============================================================
   NOTEPAD
============================================================ */

async function openNotepad() {

    // The executable alias can exit successfully without creating a window.
    // Prefer Windows app registration; downstream UIA must still verify the
    // target window before sending input.
    const registered = await launchInstalledWindowsApp(["Notepad", "Windows Notepad"]);
    if (registered?.success) return registered;
    return spawnDetached("notepad.exe");
}

/* ============================================================
   CALCULATOR
============================================================ */

function openCalculator() {

    return spawnDetached(
        "calc.exe"
    );
}

/* ============================================================
   FILE EXPLORER
============================================================ */

function openExplorer() {

    return spawnDetached(
        "explorer.exe"
    );
}

/* ============================================================
   WINDOWS SETTINGS
============================================================ */

async function openSettings() {

    if (
        process.platform !== "win32"
    ) {

        return failure(
            "Windows Settings is only available on Windows."
        );
    }

    try {

        const child = spawn(
            "cmd.exe",
            [
                "/c",
                "start",
                "",
                "ms-settings:"
            ],
            {
                detached: true,
                stdio: "ignore",
                windowsHide: true
            }
        );

        child.unref();

        return success({
            app: "settings"
        });

    } catch (error) {

        return failure(
            error?.message ||
            String(error)
        );
    }
}

/* ============================================================
   APPLICATION LAUNCHER
============================================================ */

async function launchApplication(
    application,
    options = {}
) {

    const name =
        safeString(
            application
        ).toLowerCase();

    log(
        `Launch application request: "${name}"`
    );

    switch (name) {

        case "chrome":
        case "google chrome":
            return openChrome(options);

        case "edge":
        case "microsoft edge":
            return openEdge();

        case "firefox":
        case "mozilla firefox":
            return openFirefox();

        case "brave":
        case "brave browser":
            return openBrave();

        case "vscode":
        case "vs code":
        case "visual studio code":
            return openVSCode();

        case "notepad":
            return openNotepad();

        case "calculator":
        case "calc":
            return openCalculator();

        case "explorer":
        case "file explorer":
        case "windows explorer":
            return openExplorer();

        case "settings":
        case "windows settings":
            return openSettings();

        case "paint":
        case "ms paint":
        case "microsoft paint":
            return spawnDetached("mspaint.exe");

        case "cmd":
        case "command prompt":
            return spawnDetached("cmd.exe");

        case "terminal":
        case "windows terminal":
        case "wt": {
            const terminal = await spawnDetached("wt.exe");
            return terminal?.success ? terminal : (await launchByStartMenuShortcut(name)) || terminal;
        }

        case "microsoft store":
        case "store":
            if (process.platform === "win32") {
                if (options && String(options.searchQuery || "").trim()) {
                    const query = String(options.searchQuery).trim();
                    try {
                        await shell.openExternal(`ms-windows-store://search/?query=${encodeURIComponent(query)}`);
                        return success({ app: "Microsoft Store", searchQuery: query, searchHandled: true });
                    } catch (error) {
                        return failure(error?.message || String(error), { app: "Microsoft Store", searchQuery: query });
                    }
                }
                const registeredStore = await launchWindowsStoreAppByName("Microsoft Store");
                if (registeredStore?.success) return registeredStore;
                try {
                    await shell.openExternal("ms-windows-store:");
                    return success({ app: "Microsoft Store" });
                } catch (error) {
                    return (await launchByStartMenuShortcut("Microsoft Store")) || failure(error?.message || String(error));
                }
            }
            return failure("Microsoft Store is only available on Windows.");

        case "clock":
        case "windows clock":
        case "alarm":
        case "alarms":
            if (process.platform !== "win32") return failure("Windows Clock is only available on Windows.");
            return (await launchInstalledWindowsApp(["Clock"])) || failure("Windows Clock was not found in the Start Menu or installed Windows apps.");

        case "powershell":
        case "power shell":
            return spawnDetached("powershell.exe");

        case "task manager":
        case "taskmanager":
            return spawnDetached("taskmgr.exe");

        case "control panel":
        case "controlpanel":
            return spawnDetached("control.exe");

        case "word":
        case "ms word":
        case "microsoft word":
            return openOfficeApp("WINWORD.EXE", "Word");

        case "excel":
        case "ms excel":
        case "microsoft excel":
            return openOfficeApp("EXCEL.EXE", "Excel");

        case "powerpoint":
        case "power point":
        case "ms powerpoint":
        case "microsoft powerpoint":
            return openOfficeApp("POWERPNT.EXE", "PowerPoint");

        case "ppt":
        case "ppt+":
        case "ppt plus":
        case "ppt plus plus":
            if (process.platform !== "win32") return failure("PPT + is only available on Windows.");
            return (await launchInstalledWindowsApp(["PPT +"])) || failure("PPT + was not found in the Start Menu or installed Windows apps.");

        case "outlook":
        case "ms outlook":
        case "microsoft outlook":
            return openOfficeApp("OUTLOOK.EXE", "Outlook");

        case "gemini":
        case "gemini desktop": {
            return (await launchInstalledWindowsApp(["Gemini", "Google Gemini"])) ||
                failure("Gemini desktop app was not found. Say ‘open Gemini on Google’ to open the website.");
        }

        case "minecraft":
        case "minecraft launcher": {
            const catalog = getInstalledAppCatalog();
            const related = await catalog.launchAny?.([
                "Minecraft Launcher", "Minecraft", "SKLauncher", "SK Launcher",
                "Prism Launcher", "MultiMC", "ATLauncher", "Lunar Client", "Badlion Client"
            ]);
            return related?.success ? related : failure(related?.error || "No installed Minecraft launcher was found.", related);
        }

        case "sklauncher":
        case "sk launcher": {
            return (await launchInstalledWindowsApp(["SKLauncher", "SK Launcher"])) ||
                failure("SKLauncher was not found in the Start Menu or installed apps.");
        }

        case "league":
        case "lee":
        case "league of legends": {
            return (await launchInstalledWindowsApp(["League of Legends", "Riot Client"])) ||
                failure("League of Legends was not found in the Start Menu or installed apps.");
        }

        case "onenote":
        case "one note":
            return openOfficeApp("ONENOTE.EXE", "OneNote");

        default: {
            // GENERIC FALLBACK: not one of the apps we have a direct
            // path/executable for. Try to find and open it via its
            // Start Menu shortcut before giving up — this covers
            // Discord, Telegram, WhatsApp, Teams, Spotify, Skype,
            // Zoom, Slack, VLC, Steam, OBS, GitHub Desktop, and
            // virtually any other installed app the user names.
            return getInstalledAppCatalog().launch(name);
        }
    }
}

/* ============================================================
   SYSTEM IPC
============================================================ */

function registerSystemIPC() {

    registerHandler("system:paths", async () => safeIPC("system:paths", async () => ({ success: true, paths: getApplicationPaths() })));
    registerHandler("system:pc-doctor-scan", async () =>
        safeIPC("system:pc-doctor-scan", async () => success(await pcDoctor.scan())));
    registerHandler("system:pc-doctor-apply", async (_event, fixIds = [], approved = false) =>
        safeIPC("system:pc-doctor-apply", async () => {
            const result = await pcDoctor.apply(Array.isArray(fixIds) ? fixIds : [], approved === true);
            return result.success || result.requiresApproval ? success(result) : failure(result.error || "PC Doctor could not apply the selected fix.", result);
        }));

    registerHandler("system:downloads-cleanup-plan", async (_event, options = {}) => safeIPC("system:downloads-cleanup-plan", () => fileOperationsPlanner.downloadsCleanup(options)));
    registerHandler("system:backup-plan", async (_event, options = {}) => safeIPC("system:backup-plan", () => fileOperationsPlanner.backupPlan(options)));
    registerHandler("system:photo-label", async (_event, options = {}) => safeIPC("system:photo-label", () => fileOperationsPlanner.labelPhoto(options)));
    registerHandler("system:organize-desktop-images", async (_event, options = {}) => safeIPC("system:organize-desktop-images", async () => {
        const desktop = path.resolve(app.getPath("desktop"));
        const cleanName = safeString(options.folderName || "Nakul").replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "Nakul";
        const destination = path.join(desktop, cleanName);
        const imageExt = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".heic"]);
        const candidates = [];
        async function walkDesktopImages(dir, depth = 0) {
            if (depth > 3 || candidates.length >= 500) return;
            let entries = [];
            try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch (_) { return; }
            for (const entry of entries) {
                if (candidates.length >= 500) break;
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (path.resolve(full).toLowerCase() === path.resolve(destination).toLowerCase()) continue;
                    await walkDesktopImages(full, depth + 1);
                } else if (entry.isFile() && imageExt.has(path.extname(entry.name).toLowerCase())) candidates.push(full);
            }
        }
        await walkDesktopImages(desktop);
        if (String(options.mode || "preview").toLowerCase() === "preview") return success({ count: candidates.length, destination, files: candidates.slice(0, 100).map(file => path.basename(file)) });
        if (options.approved !== true) return failure("Approval is required before copying Desktop images.");
        await fs.promises.mkdir(destination, { recursive: true });
        let copiedCount = 0;
        for (const source of candidates) {
            let target = path.join(destination, path.basename(source));
            if (path.resolve(source).toLowerCase() === path.resolve(target).toLowerCase()) continue;
            const ext = path.extname(target); const stem = path.basename(target, ext);
            let suffix = 2;
            while (fs.existsSync(target)) target = path.join(destination, `${stem} (${suffix++})${ext}`);
            try { await fs.promises.copyFile(source, target); copiedCount++; } catch (_) {}
        }
        return success({ count: candidates.length, copiedCount, destination, originalsPreserved: true });
    }));

    registerHandler("system:change-plan", async (_event, change = {}) =>
        safeIPC("system:change-plan", () => createChangePlan(change)));

    registerHandler("system:list-apps", async (_event, refresh = false) =>
        safeIPC("system:list-apps", () => getInstalledAppCatalog().list(refresh === true)));
    registerHandler("system:launch-app-entry", async (_event, id) =>
        safeIPC("system:launch-app-entry", () => getInstalledAppCatalog().launch(String(id || ""), { byId: true })));
    registerHandler("system:add-app", async () => safeIPC("system:add-app", async () => {
        const selection = await dialog.showOpenDialog({ title: "Add an app to JARVIS", properties: ["openFile"], filters: [{ name: "Windows apps and shortcuts", extensions: ["exe", "lnk"] }] });
        if (selection.canceled || !selection.filePaths[0]) return { success: false, cancelled: true };
        const target = selection.filePaths[0];
        if (!/\.(exe|lnk)$/i.test(target) || !fs.statSync(target).isFile() || /^\\\\/.test(target)) return failure("Choose a local Windows app or shortcut.");
        const file = path.join(app.getPath("userData"), "added-apps.json");
        let entries = [];
        try { entries = JSON.parse(fs.readFileSync(file, "utf8")); } catch (error) { if (error.code !== "ENOENT") return failure("Saved apps could not be read; no changes were made."); }
        if (!Array.isArray(entries)) return failure("Saved app list needs repair; no changes were made.");
        const entry = { name: path.basename(target, path.extname(target)), target, kind: /\.lnk$/i.test(target) ? "shortcut" : "executable", source: "Added by you" };
        if (!entries.some(item => item.target?.toLowerCase() === target.toLowerCase())) entries.push(entry);
        writeJsonAtomic(file, entries);
        await getInstalledAppCatalog().list(true);
        return { success: true, name: entry.name };
    }));

    registerHandler("computer-use:start", async () =>
        safeIPC("computer-use:start", async () => success(windowsComputerUse.startSession()))
    );

    registerHandler("computer-use:stop", async () =>
        safeIPC("computer-use:stop", async () => success(windowsComputerUse.stopSession()))
    );

    registerHandler("computer-use:status", async () =>
        safeIPC("computer-use:status", async () => success(windowsComputerUse.getStatus()))
    );

    registerHandler("computer-use:inspect-ui", async () =>
        safeIPC("computer-use:inspect-ui", async () => {
            const result = await windowsComputerUse.inspectAccessibility();
            return result.success ? success(result) : failure(result.error || "Accessibility inspection failed.", result);
        })
    );

    registerHandler("screen-share:capture", async () =>
        safeIPC("screen-share:capture", async () => {
            if (process.platform !== "win32") return failure("Desktop capture is currently supported on Windows only.");
            const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 1600, height: 1000 }, fetchWindowIcons: false });
            const source = sources.find(item => item?.thumbnail && !item.name?.toLowerCase().includes("jarvis")) || sources[0];
            if (!source?.thumbnail || source.thumbnail.isEmpty?.()) return failure("Windows did not return a desktop frame.");
            return success({ image: source.thumbnail.toJPEG(78).toString("base64"), source: source.name || "desktop" });
        })
    );

    registerHandler("computer-use:action", async (_event, action, params = {}, approved = false) =>
        safeIPC("computer-use:action", async () => {
            // Pasting a validated text payload is both faster and more
            // reliable than launching one Unicode SendInput event per
            // character. Keep the old path available as a fallback.
            if (String(action || "") === "typeText" && approved === true && clipboard && typeof params?.text === "string" && params.text.length <= 2000) {
                const previousClipboard = clipboard.readText();
                try {
                    clipboard.writeText(params.text);
                    const pasted = await windowsComputerUse.perform("hotkey", { keys: ["CTRL", "V"] }, { approved: true });
                    setTimeout(() => { try { clipboard.writeText(previousClipboard); } catch (_) {} }, 80);
                    if (pasted.success) return success({ ...pasted, action: "typeText", data: { pasted: true, characterCount: params.text.length } });
                } catch (_) {
                    try { clipboard.writeText(previousClipboard); } catch (_) {}
                }
            }
            const result = await windowsComputerUse.perform(String(action || ""), params, { approved: approved === true });
            return result.success || result.requiresApproval ? success(result) : failure(result.error || "Computer Use action failed.", result);
        })
    );

    registerHandler("system:set-volume", async (_event, percent) =>
        safeIPC("system:set-volume", async () => {
            if (typeof percent !== "number" || !Number.isInteger(percent) || percent < 0 || percent > 100) {
                return failure("Volume must be a whole number from 0 to 100.");
            }
            const result = await windowsVolumeController.setVolume(percent);
            if (!result.success) return failure(result.error || "System volume could not be changed.", result);
            return success({ ...result });
        })
    );

    /*
     * ========================================================
     * CRITICAL HANDLER
     * ========================================================
     *
     * This is the handler for:
     *
     *   system:open-app
     *
     * FIX: this used to be registered twice — once here (as a
     * broken empty no-op) and once as dangling top-level code
     * that executed at module-load time because a closing brace
     * for this function was misplaced right after the first,
     * broken registration. That meant this whole function body
     * (the real system:open-app logic, plus system:chrome,
     * system:vscode, system:notepad, system:calculator,
     * system:explorer, system:settings) was never actually
     * running as part of registerIPC() — it ran once at require()
     * time instead, before app.whenReady(), which is fragile and
     * could silently stop registering handlers if anything earlier
     * in module load ever threw. It is now registered exactly
     * once, in the correct scope.
     */

    registerHandler(
        "system:open-app",
        async (event, appName, options = {}) => {

            const name =
                safeString(
                    appName
                ).toLowerCase();

            log(
                `IPC system:open-app received: "${name}"`
            );

            if (!name) {

                return failure(
                    "Application name is required."
                );
            }

            try {

                const result =
                    await launchApplication(
                        name,
                        options && typeof options === "object" ? options : {}
                    );

                if (result?.success) {

                    log(
                        `Application launched: ${name}`
                    );

                } else {

                    warn(
                        `Application failed: ${name}`,
                        result?.error
                    );
                }

                return {
                    ...result,
                    app: name
                };

            } catch (error) {

                errorLog(
                    "system:open-app error:",
                    error
                );

                return failure(
                    error?.message ||
                    String(error),
                    {
                        app: name
                    }
                );
            }
        }
    );

    registerHandler(
        "system:close-apps",
        async (_event, options = {}) => safeIPC("system:close-apps", async () => {
            const request = options && typeof options === "object" ? options : {};
            const result = await windowsWindowController.closeWindows({
                targets: Array.isArray(request.targets) ? request.targets.slice(0, 8) : [],
                except: Array.isArray(request.except) ? request.except.slice(0, 8) : [],
                all: request.all === true
            });
            return result.success ? success(result) : failure(result.error || "Windows did not close the requested application.", result);
        })
    );

    /* --------------------------------------------------------
       DIRECT APPLICATION CHANNELS
    -------------------------------------------------------- */

    registerHandler(
        "system:chrome",
        async () => {

            return openChrome();
        }
    );

    registerHandler(
        "system:vscode",
        async () => {

            return openVSCode();
        }
    );

    registerHandler(
        "system:notepad",
        async () => {

            return openNotepad();
        }
    );

    registerHandler(
        "system:calculator",
        async () => {

            return openCalculator();
        }
    );

    registerHandler(
        "system:explorer",
        async () => {

            return openExplorer();
        }
    );

    registerHandler(
        "system:settings",
        async () => {

            return openSettings();
        }
    );
}

/* ============================================================
   POWER COMMAND
============================================================ */

function runPowerCommand(
    executable,
    args
) {

    return new Promise(
        (resolve) => {

            if (
                process.platform !== "win32"
            ) {

                resolve(
                    failure(
                        "Power commands are only available on Windows."
                    )
                );

                return;
            }

            try {

                execFile(
                    executable,
                    args,
                    {
                        windowsHide: true
                    },
                    (error) => {

                        if (error) {

                            errorLog(
                                "Power command error:",
                                error
                            );

                            resolve(
                                failure(
                                    error.message
                                )
                            );

                            return;
                        }

                        resolve(
                            success()
                        );
                    }
                );

            } catch (error) {

                resolve(
                    failure(
                        error?.message ||
                        String(error)
                    )
                );
            }
        }
    );
}

/* ============================================================
   POWER IPC
============================================================ */

function registerPowerIPC() {

    registerHandler("system:schedule-shutdown", async (_event, delayMs) => {
        if (process.platform !== "win32") return failure("Scheduled shutdown is currently supported on Windows only.");
        if (!Number.isSafeInteger(delayMs) || delayMs < 60000 || delayMs > 7 * 24 * 60 * 60 * 1000) {
            return failure("Shutdown delay must be between 1 minute and 7 days.");
        }

        const seconds = Math.ceil(delayMs / 1000);
        const scheduledAt = Date.now();
        const shutdownAt = scheduledAt + seconds * 1000;
        const recordPath = path.join(app.getPath("userData"), "scheduled-shutdown.json");
        const record = { scheduledAt: new Date(scheduledAt).toISOString(), shutdownAt: new Date(shutdownAt).toISOString(), seconds };
        try {
            fs.writeFileSync(recordPath, JSON.stringify(record, null, 2), "utf8");
        } catch (error) {
            return failure(`Could not save the shutdown timer: ${error?.message || String(error)}`);
        }

        log(`Shutdown scheduled for ${record.shutdownAt} (${seconds} seconds from now).`);
        const shutdownExe = path.join(process.env.SystemRoot || process.env.WINDIR || "C:\\Windows", "System32", "shutdown.exe");
        const result = await runPowerCommand(shutdownExe, ["/s", "/f", "/t", String(seconds)]);
        if (!result?.success) {
            try { fs.unlinkSync(recordPath); } catch (_) {}
            return result;
        }
        return success({ scheduledAt: record.scheduledAt, shutdownAt: record.shutdownAt, seconds });
    });

    registerHandler("system:get-scheduled-shutdown", async () => {
        const recordPath = path.join(app.getPath("userData"), "scheduled-shutdown.json");
        try {
            if (!fs.existsSync(recordPath)) return success({ scheduled: false });
            const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
            const shutdownAt = Date.parse(record.shutdownAt);
            if (!Number.isFinite(shutdownAt) || shutdownAt <= Date.now()) {
                try { fs.unlinkSync(recordPath); } catch (_) {}
                return success({ scheduled: false });
            }
            return success({ scheduled: true, shutdownAt: record.shutdownAt, seconds: Math.ceil((shutdownAt - Date.now()) / 1000) });
        } catch (error) {
            return failure(`Could not read the shutdown timer: ${error?.message || String(error)}`);
        }
    });

    registerHandler("system:cancel-scheduled-shutdown", async () => {
        if (process.platform !== "win32") return failure("Scheduled shutdown cancellation is currently supported on Windows only.");
        const recordPath = path.join(app.getPath("userData"), "scheduled-shutdown.json");
        const shutdownExe = path.join(process.env.SystemRoot || process.env.WINDIR || "C:\\Windows", "System32", "shutdown.exe");
        const result = await runPowerCommand(shutdownExe, ["/a"]);
        if (!result?.success) return result;
        try { if (fs.existsSync(recordPath)) fs.unlinkSync(recordPath); } catch (error) {
            warn(`Could not remove scheduled shutdown record: ${error?.message || String(error)}`);
        }
        log("Scheduled shutdown cancelled.");
        return success();
    });

    registerHandler(
        "system:shutdown",
        async () => {

            log(
                "Shutdown requested"
            );

            return runPowerCommand(
                "shutdown",
                [
                    "/s",
                    "/t",
                    "0"
                ]
            );
        }
    );

    registerHandler(
        "system:restart",
        async () => {

            log(
                "Restart requested"
            );

            return runPowerCommand(
                "shutdown",
                [
                    "/r",
                    "/t",
                    "0"
                ]
            );
        }
    );

    registerHandler(
        "system:sleep",
        async () => {

            log(
                "Sleep requested"
            );

            return runPowerCommand(
                "rundll32.exe",
                [
                    "powrprof.dll,SetSuspendState",
                    "0,1,0"
                ]
            );
        }
    );

    registerHandler(
        "system:lock",
        async () => {

            log(
                "Lock requested"
            );

            return runPowerCommand(
                "rundll32.exe",
                [
                    "user32.dll,LockWorkStation"
                ]
            );
        }
    );

    registerHandler(
        "system:logoff",
        async () => {

            log(
                "Log off requested"
            );

            return runPowerCommand(
                "shutdown",
                [
                    "/l"
                ]
            );
        }
    );
}

/* ============================================================
   VOICE IPC
============================================================ */

let activeTTSProcess = null;
let indicParlerProcess = null;
const ttsQueue = [];
let ttsProcessing = false;

/* ============================================================
   TEXT-TO-SPEECH
   ------------------------------------------------------------
   Microsoft Edge neural TTS is the requested online primary voice.
   Windows SAPI remains the local fallback when Edge is unavailable;
   optional XTTS-v2 remains selectable for the local cloned voice.
   ============================================================ */

const XTTS_SERVER_URL = () => {
    try {
        const configPath = path.join(app.getPath("userData"), "xtts-settings.json");
        const raw = fs.readFileSync(configPath, "utf-8");
        return JSON.parse(raw).serverUrl || "http://127.0.0.1:5055";
    } catch { return "http://127.0.0.1:5055"; }
};

const DEFAULT_XTTS_SETTINGS = {
    enabled: true,
    ttsEngine: "sarvam",
    sttEngine: "sarvam",
    voiceLanguagePipeline: "sarvam-native-v1",
    serverUrl: "http://127.0.0.1:5055",
    indicParlerServerUrl: "http://127.0.0.1:5056",
    speed: 0.95,
    languageMode: "auto",   // auto | hi | en | hinglish
    fallbackToSAPI: true,
    fallbackToBrowser: false,
    sapiVoice: "Microsoft David",
    edgeVoice: "auto",
    voiceProfile: "edge-auto",
};

let _xttsSettingsCache = null;

async function loadXttsSettings() {
    if (_xttsSettingsCache) return _xttsSettingsCache;
    try {
        const configPath = path.join(app.getPath("userData"), "xtts-settings.json");
        const raw = await fs.promises.readFile(configPath, "utf-8");
        const savedSettings = JSON.parse(raw);
        _xttsSettingsCache = { ...DEFAULT_XTTS_SETTINGS, ...savedSettings };
        // The previous default path could keep offline Whisper + Edge TTS
        // selected indefinitely, even when the user expects Sarvam. Migrate
        // that old implicit selection once; later explicit Settings changes
        // are preserved because the migration marker is persisted.
        if (savedSettings.voiceLanguagePipeline !== "sarvam-native-v1") {
            _xttsSettingsCache.sttEngine = "sarvam";
            _xttsSettingsCache.ttsEngine = "sarvam";
            _xttsSettingsCache.voiceLanguagePipeline = "sarvam-native-v1";
            writeJsonAtomic(configPath, _xttsSettingsCache);
        }
        let migratedVoice = false;
        // Migrate the old default female voice, but preserve any other voice
        // the user selected explicitly.
        if (/microsoft\s+(?:liz|zira|aria|jenny|heera)/i.test(String(_xttsSettingsCache.sapiVoice || ""))) {
            _xttsSettingsCache.sapiVoice = DEFAULT_XTTS_SETTINGS.sapiVoice;
            migratedVoice = true;
        }
        if (migratedVoice) {
            writeJsonAtomic(configPath, _xttsSettingsCache);
        }
    } catch {
        _xttsSettingsCache = { ...DEFAULT_XTTS_SETTINGS };
    }
    if (!isLoopbackURL(_xttsSettingsCache.serverUrl)) {
        _xttsSettingsCache.serverUrl = DEFAULT_XTTS_SETTINGS.serverUrl;
    }
    if (!isLoopbackURL(_xttsSettingsCache.indicParlerServerUrl)) _xttsSettingsCache.indicParlerServerUrl = DEFAULT_XTTS_SETTINGS.indicParlerServerUrl;
    if (!["offline", "sarvam", "elevenlabs"].includes(_xttsSettingsCache.sttEngine)) _xttsSettingsCache.sttEngine = "offline";
    if (!["auto", "madhur", "swara", "prabhat", "neerja", "guy", "ryan"].includes(String(_xttsSettingsCache.edgeVoice || "auto").toLowerCase())) _xttsSettingsCache.edgeVoice = "auto";
    return _xttsSettingsCache;
}

async function saveXttsSettings(next) {
    const current = await loadXttsSettings();
    const incoming = next && typeof next === "object" ? { ...next } : {};
    const sarvamKey = String(incoming.sarvamApiKey || "").trim();
    const elevenLabsKey = String(incoming.elevenLabsApiKey || "").trim();
    delete incoming.sarvamApiKey;
    delete incoming.elevenLabsApiKey;
    _xttsSettingsCache = { ...current, ...incoming };
    if (sarvamKey) _xttsSettingsCache.sarvamApiKeyEncrypted = encryptVoiceSecret(sarvamKey);
    if (elevenLabsKey) _xttsSettingsCache.elevenLabsApiKeyEncrypted = encryptVoiceSecret(elevenLabsKey);
    if (!isLoopbackURL(_xttsSettingsCache.serverUrl)) {
        _xttsSettingsCache.serverUrl = DEFAULT_XTTS_SETTINGS.serverUrl;
        return failure("Offline-only mode allows voice servers on this computer only.");
    }
    if (!isLoopbackURL(_xttsSettingsCache.indicParlerServerUrl)) { _xttsSettingsCache.indicParlerServerUrl = DEFAULT_XTTS_SETTINGS.indicParlerServerUrl; return failure("Offline-only mode allows voice servers on this computer only."); }
    if (!["edge", "sarvam", "elevenlabs", "sapi", "xtts", "indic-parler"].includes(_xttsSettingsCache.ttsEngine)) _xttsSettingsCache.ttsEngine = "edge";
    if (!["auto", "madhur", "swara", "prabhat", "neerja", "guy", "ryan"].includes(String(_xttsSettingsCache.edgeVoice || "auto").toLowerCase())) _xttsSettingsCache.edgeVoice = "auto";
    if (!["offline", "sarvam", "elevenlabs"].includes(_xttsSettingsCache.sttEngine)) _xttsSettingsCache.sttEngine = "offline";
    try {
        const configPath = path.join(app.getPath("userData"), "xtts-settings.json");
        await fs.promises.mkdir(path.dirname(configPath), { recursive: true });
        writeJsonAtomic(configPath, _xttsSettingsCache);
    } catch (error) {
        errorLog("Failed to save xtts-settings.json:", error);
    }
    return _xttsSettingsCache;
}

async function getSarvamApiKey() {
    const settings = await loadXttsSettings();
    return decryptVoiceSecret(settings.sarvamApiKeyEncrypted) || String(process.env.SARVAM_API_KEY || "").trim();
}

async function getElevenLabsApiKey() {
    const settings = await loadXttsSettings();
    return decryptVoiceSecret(settings.elevenLabsApiKeyEncrypted) || String(process.env.ELEVENLABS_API_KEY || "").trim();
}

function decryptVoiceSecret(value) {
    try {
        if (!value || !safeStorage?.isEncryptionAvailable?.()) return "";
        return safeStorage.decryptString(Buffer.from(String(value), "base64")).trim();
    } catch (_) { return ""; }
}

function encryptVoiceSecret(value) {
    const secret = String(value || "").trim();
    if (!secret) return "";
    if (!safeStorage?.isEncryptionAvailable?.()) throw new Error("Secure local key storage is unavailable on this device.");
    return safeStorage.encryptString(secret).toString("base64");
}

function publicVoiceSettings(settings = {}) {
    const safe = { ...settings };
    delete safe.sarvamApiKeyEncrypted;
    delete safe.elevenLabsApiKeyEncrypted;
    return safe;
}

function getElevenLabsVoiceId() {
    return String(process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM").trim();
}

function requestElevenLabs(pathname, method, body, contentType, accept = "application/json", apiKey = "") {
    const https = require("https");
    return new Promise((resolve, reject) => {
        const req = https.request({ hostname: "api.elevenlabs.io", path: pathname, method,
            headers: { "xi-api-key": apiKey || process.env.ELEVENLABS_API_KEY || "", "content-type": contentType, accept, "content-length": body.length }, timeout: 30000 }, (res) => {
            const chunks = []; let size = 0;
            res.on("data", chunk => { size += chunk.length; if (size > 16 * 1024 * 1024) req.destroy(new Error("ElevenLabs response exceeded size limit.")); else chunks.push(chunk); });
            res.on("end", () => {
                const data = Buffer.concat(chunks);
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    let message = `ElevenLabs returned HTTP ${res.statusCode}`;
                    try { const parsed = JSON.parse(data.toString("utf8")); message = parsed.detail?.message || parsed.detail || parsed.message || message; } catch (_) {}
                    reject(new Error(String(message).slice(0, 400))); return;
                }
                resolve(data);
            });
        });
        req.on("timeout", () => req.destroy(new Error("ElevenLabs request timed out.")));
        req.on("error", reject); req.end(body);
    });
}

async function transcribeWithElevenLabs(samples) {
    const apiKey = await getElevenLabsApiKey();
    if (!apiKey) return { success: false, error: "Save an ElevenLabs API key in JARVIS Settings before selecting ElevenLabs STT." };
    try {
        const wav = makeSarvamWav(samples);
        const boundary = `----JarvisElevenLabs${require("node:crypto").randomBytes(12).toString("hex")}`;
        const parts = [Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="model_id"\r\n\r\nscribe_v2\r\n`), Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="jarvis-voice.wav"\r\nContent-Type: audio/wav\r\n\r\n`), wav, Buffer.from(`\r\n--${boundary}--\r\n`)];
        const result = JSON.parse((await requestElevenLabs("/v1/speech-to-text", "POST", Buffer.concat(parts), `multipart/form-data; boundary=${boundary}`, "application/json", apiKey)).toString("utf8"));
        const transcript = safeString(result.text);
        if (!transcript) return { success: false, error: "ElevenLabs did not return a transcript." };
        const language = safeString(result.language_code).toLowerCase();
        const detectedLanguage = language.startsWith("hi") ? "hi" : language.startsWith("en") ? "en" : sttEngine.detectLanguage(transcript);
        return { success: true, text: transcript, rawText: transcript, detectedLanguage, language: detectedLanguage === "hi" ? "hi" : detectedLanguage === "en" ? "en" : undefined, confidence: Number.isFinite(Number(result.language_probability)) ? Number(result.language_probability) : null, timestamp: Date.now(), engine: "ElevenLabs Scribe v2 (online)" };
    } catch (error) { return { success: false, error: `ElevenLabs STT failed: ${getErrorMessage(error)}` }; }
}

async function speakWithElevenLabs(text, language, speed) {
    const apiKey = await getElevenLabsApiKey();
    if (!apiKey) throw new Error("Save an ElevenLabs API key in JARVIS Settings before selecting ElevenLabs TTS.");
    const voiceId = getElevenLabsVoiceId();
    const body = Buffer.from(JSON.stringify({ text: String(text), model_id: "eleven_multilingual_v2", ...(language === "hi" ? { language_code: "hi" } : {}), voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0, use_speaker_boost: true } }), "utf8");
    const audio = await requestElevenLabs(`/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, "POST", body, "application/json", "audio/mpeg", apiKey);
    if (!audio.length) throw new Error("ElevenLabs TTS returned empty audio.");
    return { success: true, audioBase64: audio.toString("base64"), mime: "audio/mpeg", engine: "ElevenLabs Multilingual v2", local: false, audioFormat: "mp3" };
}

function requestSarvam(pathname, apiKey, body, contentType, diagnosticLabel = "") {
    const https = require("https");
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: "api.sarvam.ai", path: pathname, method: "POST",
            headers: {
                "api-subscription-key": apiKey,
                "content-type": contentType,
                "content-length": body.length,
            }, timeout: 30000,
        }, (res) => {
            const chunks = [];
            let size = 0;
            res.on("data", (chunk) => {
                size += chunk.length;
                if (size > 8 * 1024 * 1024) { req.destroy(new Error("Sarvam response exceeded size limit.")); return; }
                chunks.push(chunk);
            });
            res.on("end", () => {
                const responseBuffer = Buffer.concat(chunks);
                if (diagnosticLabel) {
                    console.info(`[${diagnosticLabel}] HTTP ${res.statusCode}; Content-Type=${String(res.headers["content-type"] || "unknown")}; response bytes=${responseBuffer.length}`);
                }
                const raw = responseBuffer.toString("utf8");
                let data;
                try { data = JSON.parse(raw); } catch { data = {}; }
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    const message = data?.error?.message || data?.message || `Sarvam returned HTTP ${res.statusCode}`;
                    reject(new Error(String(message).slice(0, 400)));
                    return;
                }
                resolve(data);
            });
        });
        req.on("timeout", () => req.destroy(new Error("Sarvam request timed out.")));
        req.on("error", reject);
        req.end(body);
    });
}

function makeSarvamWav(samples) {
    const input = samples instanceof Float32Array ? samples : Float32Array.from(samples || []);
    if (!input.length) throw new Error("No microphone audio was captured.");
    if (input.length > 480000) throw new Error("Sarvam REST STT accepts audio up to 30 seconds.");
    const pcm = Buffer.alloc(input.length * 2);
    for (let i = 0; i < input.length; i++) {
        const sample = Math.max(-1, Math.min(1, Number(input[i]) || 0));
        pcm.writeInt16LE(Math.round(sample < 0 ? sample * 32768 : sample * 32767), i * 2);
    }
    const wav = Buffer.alloc(44 + pcm.length);
    wav.write("RIFF", 0); wav.writeUInt32LE(36 + pcm.length, 4); wav.write("WAVE", 8);
    wav.write("fmt ", 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28);
    wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36);
    wav.writeUInt32LE(pcm.length, 40); pcm.copy(wav, 44);
    return wav;
}

async function transcribeWithSarvam(samples) {
    const apiKey = await getSarvamApiKey();
    if (!apiKey) return { success: false, error: "Save a Sarvam API key in JARVIS Voice Settings before selecting online STT." };
    try {
        const wav = makeSarvamWav(samples);
        const boundary = `----JarvisSarvam${require("node:crypto").randomBytes(12).toString("hex")}`;
        const parts = [];
        for (const [name, value] of [["model", "saaras:v4"], ["mode", "transcribe"]]) {
            parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
        }
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="jarvis-voice.wav"\r\nContent-Type: audio/wav\r\n\r\n`));
        parts.push(wav, Buffer.from(`\r\n--${boundary}--\r\n`));
        const result = await requestSarvam("/speech-to-text", apiKey, Buffer.concat(parts), `multipart/form-data; boundary=${boundary}`);
        const transcript = safeString(result.transcript);
        if (!transcript) return { success: false, error: "Sarvam did not return a transcript." };
        const languageCode = safeString(result.language_code).toLowerCase();
        // Saaras codemix can occasionally label a Devanagari transcript as
        // English. Prefer the actual transcript script for Hindi so downstream
        // routing and speech output do not treat a Hindi utterance as English.
        const transcriptLanguage = sttEngine.detectLanguage(transcript);
        const detectedLanguage = transcriptLanguage === "hi" || transcriptLanguage === "hinglish"
            ? transcriptLanguage
            : languageCode.startsWith("hi") ? "hi" : languageCode.startsWith("en") ? "en" : transcriptLanguage;
        return { success: true, text: transcript, rawText: transcript, detectedLanguage, language: detectedLanguage === "hi" ? "hi" : detectedLanguage === "en" ? "en" : undefined, timestamp: Date.now(), engine: "Sarvam Saaras v4 (online)" };
    } catch (error) {
        return { success: false, error: `Sarvam STT failed: ${getErrorMessage(error)}` };
    }
}

async function speakWithSarvam(text, language, speed) {
    const apiKey = await getSarvamApiKey();
    if (!apiKey) throw new Error("Save a Sarvam API key in JARVIS Voice Settings before selecting online TTS.");
    if (String(text).length > 2500) throw new Error("Sarvam Bulbul v3 accepts up to 2,500 characters per request.");
    console.info(`[SARVAM TTS] Request started; chars=${String(text).length}`);
    const lang = language === "hi" || language === "hinglish" ? "hi-IN" : "en-IN";
    const pace = Math.max(0.5, Math.min(2, Number(speed) || 1));
    const body = Buffer.from(JSON.stringify({ text: String(text), model: "bulbul:v3", language_code: lang, speaker: "aditya", pace, speech_sample_rate: 24000, output_audio_codec: "wav" }), "utf8");
    const result = await requestSarvam("/text-to-speech", apiKey, body, "application/json", "SARVAM TTS");
    const audioBase64 = Array.isArray(result.audios) ? result.audios[0] : "";
    if (!audioBase64) throw new Error("Sarvam TTS returned no audio.");
    if (typeof audioBase64 !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(audioBase64) || audioBase64.length % 4 === 1) {
        throw new Error("Sarvam TTS returned malformed base64 audio.");
    }
    const audio = Buffer.from(audioBase64, "base64");
    if (audio.length < 44 || audio.toString("ascii", 0, 4) !== "RIFF" || audio.toString("ascii", 8, 12) !== "WAVE") {
        throw new Error("Sarvam TTS response is not a valid WAV audio file.");
    }
    const wavInfo = { bytes: audio.length, sampleRate: audio.readUInt32LE(24), channels: audio.readUInt16LE(22), bitsPerSample: audio.readUInt16LE(34) };
    console.info(`[SARVAM TTS] Audio validated; format=RIFF/WAVE; decoded bytes=${wavInfo.bytes}; sampleRate=${wavInfo.sampleRate}; channels=${wavInfo.channels}; bits=${wavInfo.bitsPerSample}`);
    return { success: true, audioBase64, mime: "audio/wav", engine: "Sarvam Bulbul v3", local: false, audioFormat: "wav" };
}

/**
 * Check whether the XTTS-v2 server is reachable and ready.
 * Returns { available, status, health }.
 */
async function checkXttsHealth() {
    const settings = await loadXttsSettings();
    const http = require("http");
    const { URL } = require("url");
    let target;
    try { target = new URL("/health", settings.serverUrl); }
    catch { return { available: false, status: "ERROR", error: "Invalid server URL" }; }

    return new Promise((resolve) => {
        const req = http.request(target, { method: "GET", timeout: 3000 }, (res) => {
            let body = "";
            res.on("data", c => body += c);
            res.on("end", () => {
                if (res.statusCode !== 200) {
                    resolve({ available: false, status: "ERROR", error: `HTTP ${res.statusCode}` });
                    return;
                }
                try {
                    const health = JSON.parse(body);
                    resolve({
                        available: health.model_loaded === true,
                        status: health.tts_status || "READY",
                        health,
                    });
                } catch {
                    resolve({ available: false, status: "ERROR", error: "Invalid health response" });
                }
            });
        });
        req.on("timeout", () => { req.destroy(); resolve({ available: false, status: "LOADING", error: "timeout" }); });
        req.on("error", (e) => resolve({ available: false, status: "STOPPED", error: e.message }));
        req.end();
    });
}

/**
 * Send text to the XTTS-v2 server for synthesis.
 * Returns { success, audioBase64, mime } on success.
 */
function speakWithXtts(text, language, speed) {
    const settings = _xttsSettingsCache || DEFAULT_XTTS_SETTINGS;
    const http = require("http");
    const https = require("https");
    const { URL } = require("url");
    let target;
    try { target = new URL("/speak", settings.serverUrl); }
    catch { return Promise.resolve({ success: false, error: "Invalid XTTS server URL" }); }

    const client = target.protocol === "https:" ? https : http;
    const payload = JSON.stringify({
        text,
        language: language || settings.languageMode || "auto",
        speed: speed || settings.speed || 0.95,
    });

    return new Promise((resolve) => {
        const req = client.request(target, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
            },
            timeout: 60000,
        }, (res) => {
            if (res.statusCode !== 200) {
                let body = "";
                res.on("data", c => body += c);
                res.on("end", () => resolve({ success: false, error: `XTTS server returned ${res.statusCode}: ${body.slice(0, 200)}` }));
                return;
            }
            const chunks = [];
            res.on("data", c => chunks.push(c));
            res.on("end", () => {
                const audioBuffer = Buffer.concat(chunks);
                resolve({
                    success: true,
                    audioBase64: audioBuffer.toString("base64"),
                    mime: "audio/wav",
                    engine: "XTTS-v2",
                });
            });
        });
        req.on("timeout", () => { req.destroy(); resolve({ success: false, error: "XTTS server timed out. Is scripts/xtts_v2_server.py running?" }); });
        req.on("error", (e) => resolve({ success: false, error: `Could not reach XTTS server at ${settings.serverUrl}. (${e.message})` }));
        req.write(payload);
        req.end();
    });
}

function speakWithIndicParler(text, language, speed) {
    const settings = _xttsSettingsCache || DEFAULT_XTTS_SETTINGS;
    const http = require("http"); const { URL } = require("url");
    let target;
    try { target = new URL("/speak", settings.indicParlerServerUrl || DEFAULT_XTTS_SETTINGS.indicParlerServerUrl); }
    catch { return Promise.resolve({ success: false, error: "Invalid Indic Parler-TTS server URL" }); }
    if (!indicParlerProcess || indicParlerProcess.killed) {
        const scriptPath = path.join(__dirname, "scripts", "indic_parler_tts_server.py");
        const modelCache = path.join(__dirname, "models", "indic-parler");
        indicParlerProcess = spawn("python", [scriptPath], { windowsHide: true, env: { ...process.env, HF_HOME: modelCache, TRANSFORMERS_CACHE: modelCache, JARVIS_INDIC_PARLER_PORT: "5056" } });
        indicParlerProcess.on("error", error => console.warn(`[TTS] Indic Parler-TTS server failed to start: ${error.message}`));
        indicParlerProcess.on("exit", () => { indicParlerProcess = null; });
    }
    const payload = JSON.stringify({ text, language: language || "auto", speed: speed || settings.speed || 0.95 });
    return new Promise(resolve => {
        const req = http.request(target, { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }, timeout: 90000 }, res => {
            const chunks = []; res.on("data", c => chunks.push(c)); res.on("end", () => {
                const body = Buffer.concat(chunks);
                if (res.statusCode !== 200) { let message = body.toString("utf8").slice(0, 400); try { message = JSON.parse(message).error || message; } catch (_) {} resolve({ success: false, error: `Indic Parler-TTS returned HTTP ${res.statusCode}: ${message}` }); return; }
                resolve(body.length ? { success: true, audioBase64: body.toString("base64"), mime: "audio/wav", engine: "Indic Parler-TTS", local: true } : { success: false, error: "Indic Parler-TTS returned empty audio." });
            });
        });
        req.on("timeout", () => { req.destroy(); resolve({ success: false, error: "Indic Parler-TTS timed out. Start scripts/indic_parler_tts_server.py." }); });
        req.on("error", error => resolve({ success: false, error: `Could not reach Indic Parler-TTS: ${error.message}` })); req.write(payload); req.end();
    });
}

/**
 * Request a test voice sample from the XTTS server.
 */
function testXttsVoice(language) {
    const settings = _xttsSettingsCache || DEFAULT_XTTS_SETTINGS;
    const http = require("http");
    const { URL } = require("url");
    let target;
    try { target = new URL("/test", settings.serverUrl); }
    catch { return Promise.resolve({ success: false, error: "Invalid XTTS server URL" }); }

    const payload = JSON.stringify({ language: language || "auto" });
    return new Promise((resolve) => {
        const req = http.request(target, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
            timeout: 60000,
        }, (res) => {
            if (res.statusCode !== 200) {
                let body = "";
                res.on("data", c => body += c);
                res.on("end", () => resolve({ success: false, error: `XTTS test returned ${res.statusCode}: ${body.slice(0, 200)}` }));
                return;
            }
            const chunks = [];
            res.on("data", c => chunks.push(c));
            res.on("end", () => {
                const audioBuffer = Buffer.concat(chunks);
                resolve({ success: true, audioBase64: audioBuffer.toString("base64"), mime: "audio/wav" });
            });
        });
        req.on("timeout", () => { req.destroy(); resolve({ success: false, error: "XTTS test timed out" }); });
        req.on("error", (e) => resolve({ success: false, error: `XTTS test error: ${e.message}` }));
        req.write(payload);
        req.end();
    });
}

/**
 * Update XTTS server runtime settings (speed, language_mode).
 */
function updateXttsServerSettings(patch) {
    const settings = _xttsSettingsCache || DEFAULT_XTTS_SETTINGS;
    const http = require("http");
    const { URL } = require("url");
    let target;
    try { target = new URL("/settings", settings.serverUrl); }
    catch { return Promise.resolve({ success: false, error: "Invalid server URL" }); }

    const payload = JSON.stringify(patch);
    return new Promise((resolve) => {
        const req = http.request(target, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
            timeout: 5000,
        }, (res) => {
            let body = "";
            res.on("data", c => body += c);
            res.on("end", () => {
                try { resolve({ success: true, ...JSON.parse(body) }); }
                catch { resolve({ success: res.statusCode === 200 }); }
            });
        });
        req.on("timeout", () => { req.destroy(); resolve({ success: false, error: "timeout" }); });
        req.on("error", (e) => resolve({ success: false, error: e.message }));
        req.write(payload);
        req.end();
    });
}

function speakWithWindowsSAPI(value, culture, preferredVoice = "Microsoft David", speed = 0.95) {
    return new Promise((resolve) => {
        const script =
            "Add-Type -AssemblyName System.Speech; " +
            "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; " +
            "$lang = $env:JARVIS_TTS_LANG; $preferred = $env:JARVIS_TTS_VOICE; " +
            "$speed = [double]$env:JARVIS_TTS_SPEED; $s.Rate = [int][Math]::Max(-10, [Math]::Min(10, [Math]::Round(($speed - 1) * 20))); " +
            "$voices = @($s.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo }); " +
            "$v = $voices | Where-Object { $_.Name -like ('*' + $preferred + '*') -and $_.Culture.Name -like ($lang.Substring(0,2) + '*') } | Select-Object -First 1; " +
            "if (-not $v) { $v = $voices | Where-Object { $_.Gender -eq 'Male' -and ($_.Culture.Name -like ($lang.Substring(0,2) + '*')) } | Select-Object -First 1 }; " +
            "if (-not $v) { $v = $voices | Where-Object { $_.Gender -eq 'Male' } | Select-Object -First 1 }; " +
            "if (-not $v) { $v = $voices | Where-Object { $_.Culture.Name -eq $lang -or $_.Culture.Name -like ($lang + '*') } | Select-Object -First 1 }; " +
            "if ($v) { $s.SelectVoice($v.Name); Write-Output ('VOICE_OK:' + $v.Name) } " +
            "else { Write-Output ('VOICE_FALLBACK:' + $s.Voice.Name) }; " +
            "$t = [Console]::In.ReadToEnd(); $s.Speak($t);";

        const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
            windowsHide: true,
            env: { ...process.env, JARVIS_TTS_LANG: culture, JARVIS_TTS_VOICE: String(preferredVoice || "Microsoft David").slice(0, 80), JARVIS_TTS_SPEED: String(Math.max(0.5, Math.min(2, Number(speed) || 0.95))) }
        });
        activeTTSProcess = child;
        let stderrOutput = "";
        let stdoutOutput = "";
        child.stdout.on("data", chunk => { stdoutOutput += chunk.toString(); });
        child.stderr.on("data", chunk => { stderrOutput += chunk.toString(); });
        child.on("error", error => {
            if (activeTTSProcess === child) activeTTSProcess = null;
            resolve(failure(error.message));
        });
        child.on("close", code => {
            if (activeTTSProcess === child) activeTTSProcess = null;
            if (code !== 0) return resolve(failure(stderrOutput || `SAPI exited with code ${code}`));
            const fellBack = stdoutOutput.includes("VOICE_FALLBACK:");
            if (fellBack) {
                const usedVoice = (stdoutOutput.split("VOICE_FALLBACK:")[1] || "").trim();
                return resolve(success({ voiceMismatch: true, requestedCulture: culture, requestedVoice: preferredVoice, usedVoice }));
            }
            const usedVoice = (stdoutOutput.split("VOICE_OK:")[1] || "").trim();
            resolve(success({ local: true, culture, requestedVoice: preferredVoice, voice: usedVoice, voiceMismatch: Boolean(usedVoice && !usedVoice.toLowerCase().includes(String(preferredVoice).toLowerCase())) }));
        });
        child.stdin.write(value + "\n");
        child.stdin.end();
    });
}

async function processNextTTS() {
    if (ttsProcessing) return;
    ttsProcessing = true;
    while (ttsQueue.length) {
        const item = ttsQueue.shift();
        try {
            item.resolve(await speakWithWindowsSAPI(item.text, item.culture, item.preferredVoice, item.speed));
        } catch (error) {
            item.resolve(failure(error?.message || String(error)));
        }
    }
    ttsProcessing = false;
}

function enqueueLocalSAPI(text, culture, preferredVoice, speed) {
    return new Promise(resolve => {
        ttsQueue.push({ text, culture, preferredVoice, speed, resolve });
        processNextTTS();
    });
}

function clearTTSQueue() {
    while (ttsQueue.length) ttsQueue.shift().resolve(success({ stopped: true, queued: true }));
}

let edgeTTSGeneration = 0;

async function speakWithEdgeTTS(text, language, speed, preferredVoice = "auto") {
    const { EdgeTTS } = require("node-edge-tts");
    const hindi = language === "hi" || language === "hinglish";
    const voiceMap = { madhur: "hi-IN-MadhurNeural", swara: "hi-IN-SwaraNeural", prabhat: "en-IN-PrabhatNeural", neerja: "en-IN-NeerjaNeural", guy: "en-US-GuyNeural", ryan: "en-GB-RyanNeural" };
    const requested = String(preferredVoice || "auto").toLowerCase();
    // Auto prefers the clearer female neural voices for hands-free listening.
    const voice = requested === "auto" ? (hindi ? "hi-IN-SwaraNeural" : "en-IN-NeerjaNeural") : (voiceMap[requested] || preferredVoice);
    const lang = voice.startsWith("hi-") ? "hi-IN" : "en-IN";
    const filename = `jarvis-edge-${process.pid}-${Date.now()}-${require("node:crypto").randomBytes(6).toString("hex")}.mp3`;
    const audioPath = path.join(app.getPath("temp"), filename);
    const rate = `${Math.round((Math.max(0.5, Math.min(2, Number(speed) || 0.95)) - 1) * 100)}%`;
    try {
        const tts = new EdgeTTS({
            voice, lang, outputFormat: "audio-24khz-96kbitrate-mono-mp3",
            rate, timeout: 20000,
        });
        await tts.ttsPromise(text, audioPath);
        const audio = await fs.promises.readFile(audioPath);
        if (!audio.length) throw new Error("Edge TTS returned empty audio.");
        return { success: true, audioBase64: audio.toString("base64"), mime: "audio/mpeg", engine: "Microsoft Edge TTS", voice, lang };
    } finally {
        try { await fs.promises.unlink(audioPath); } catch (_) {}
    }
}

// Run voice output through an ordered provider chain. The selected engine is
// always attempted first, then every other configured fallback is tried in a
// deterministic order so a transient network or local-engine failure does not
// leave JARVIS silent.
async function speakWithTtsFallbackChain(text, language, settings, options, generation) {
    const selected = String(settings.ttsEngine || "edge").toLowerCase();
    const speed = options?.speed || settings.speed;
    const order = [selected, "edge", "sarvam", "elevenlabs", "indic-parler", "sapi", "xtts"]
        .filter((engine, index, all) => all.indexOf(engine) === index);
    const failures = [];
    for (const engine of order) {
        if (generation !== edgeTTSGeneration) return { success: true, stopped: true };
        try {
            let result;
            if (engine === "edge") {
                result = await speakWithEdgeTTS(text, language, speed, settings.edgeVoice || "auto");
            } else if (engine === "sarvam") {
                result = await speakWithSarvam(text, language, speed);
            } else if (engine === "elevenlabs") {
                result = await speakWithElevenLabs(text, language, speed);
            } else if (engine === "indic-parler") {
                result = await speakWithIndicParler(text, language, speed);
                if (!result?.success) throw new Error(result?.error || "Indic Parler-TTS failed.");
            } else if (engine === "sapi") {
                if (process.platform !== "win32" || settings.fallbackToSAPI === false) {
                    throw new Error("Windows SAPI is unavailable.");
                }
                const culture = ["hi", "hinglish"].includes(language) ? "hi-IN" : "en-IN";
                result = await enqueueLocalSAPI(text, culture, settings.sapiVoice, speed);
                if (result?.success === false) throw new Error(result.error || "Windows SAPI failed.");
                result = { ...result, engine: result.engine || "SAPI", local: true };
            } else if (engine === "xtts") {
                if (!settings.enabled) throw new Error("XTTS-v2 is disabled.");
                result = await speakWithXtts(text, language, speed);
                if (!result?.success) throw new Error(result?.error || "XTTS-v2 failed.");
                result = {
                    audioBase64: result.audioBase64,
                    mime: result.mime,
                    engine: "XTTS-v2",
                    local: true,
                };
            } else {
                throw new Error(`Unknown TTS engine: ${engine}`);
            }
            if (generation !== edgeTTSGeneration) return { success: true, stopped: true };
            if (failures.length) {
                result.fallbackReason = `Selected ${selected} failed; used ${engine}.`;
                result.fallbackAttempts = failures.map(item => item.engine);
            }
            return result;
        } catch (error) {
            if (generation !== edgeTTSGeneration) return { success: true, stopped: true };
            const message = getErrorMessage(error);
            failures.push({ engine, error: message });
            console.warn(`[TTS] ${engine} failed; trying next fallback: ${message}`);
        }
    }
    return failure(`All TTS engines failed. ${failures.map(item => `${item.engine}: ${item.error}`).join(" | ")}`, {
        fallbackAttempts: failures.map(item => item.engine),
    });
}

function registerVoiceIPC() {
    const voiceEngineMigration = createVoiceEngineMigration({
        getSettings: loadXttsSettings,
        saveSettings: saveXttsSettings
    });

    registerListener(
        "voice:start",
        () => {

            log(
                "Voice start requested"
            );

            const result = voiceSTT.startListening();
            console.log("🎤 [STT] startListening result:", result);

            if (!result.started) {
                errorLog(
                    "Voice start failed:",
                    result.reason
                );
            }

            sendToRenderer(
                "voice:start-requested"
            );
        }
    );

    registerHandler(
        "voice:stop",
        async () => {

            log(
                "Voice stop requested"
            );

            const result = await voiceSTT.stopListeningAndTranscribe();
            console.log("📝 [STT] stop/transcribe result:", result);

            if (result.success) {
                sendToRenderer(
                    "voice:transcript",
                    result.text
                );
                return success({ text: result.text });
            }

            return failure(result.error || "Transcription failed.");
        }
    );

    registerHandler(
        "voice:model-status",
        async () => {
            return success(voiceSTT.getModelStatus());
        }
    );

    registerHandler(
        "voice:transcribe",
        async (event, samples, options = {}) => {
            const sttStartedAt = Date.now();
            console.log("[IPC] voice:transcribe — audio received from renderer");
            log("Voice audio received for transcription");

            // BUG FIX (Hindi/Hinglish STT quality): this used to always force
            // whatever language the renderer's JARVISVoice.language was set
            // to (renderer/js/voice.js hardcodes "en-IN" and nothing in the
            // app ever changes it — there is no language switch in the UI).
            // That meant EVERY utterance — English, Hindi, or Hinglish — was
            // transcribed with language forced to "en", so Hindi/code-switched
            // speech came out as English gibberish no matter what was said.
            //
            // We only honor an explicit language if the caller truly asked
            // for one (e.g. a future manual language picker). Otherwise we
            // route through sttEngine.transcribeWithLanguageDetection, which
            // lets the STT engine auto-detect the language on a first pass, then
            // re-transcribes once more with that detected language (hi for
            // both Hindi and Hinglish, en for English) for better accuracy —
            // this module already existed in src/speech/stt.js but was never
            // wired into the actual IPC handler, so it never ran.
            const explicitLanguage = safeString(options?.language) || undefined;

            const voiceSettings = await loadXttsSettings();
            let result;
            if (voiceSettings.sttEngine === "sarvam" || voiceSettings.sttEngine === "elevenlabs") {
                const onlineResult = voiceSettings.sttEngine === "elevenlabs"
                    ? await transcribeWithElevenLabs(samples)
                    : await transcribeWithSarvam(samples);
                if (onlineResult.success) {
                    result = onlineResult;
                } else {
                    console.warn(`[STT] ${voiceSettings.sttEngine} failed; falling back to local Whisper: ${onlineResult.error}`);
                    const localResult = explicitLanguage
                        ? await voiceSTT.transcribeSamples(samples, { language: explicitLanguage })
                        : await sttEngine.transcribeWithLanguageDetection(samples, options);
                    result = localResult.success
                        ? { ...localResult, engine: "Whisper (offline fallback)", fallbackReason: onlineResult.error }
                        : { ...onlineResult, error: `${onlineResult.error} Local Whisper fallback also failed: ${localResult.error || "unknown local STT error"}` };
                }
            } else {
                result = explicitLanguage
                    ? await voiceSTT.transcribeSamples(samples, { language: explicitLanguage })
                    : await sttEngine.transcribeWithLanguageDetection(samples, options);
            }

            if (!result.success) {
                console.warn(`[STT] Recognition failed after ${Date.now() - sttStartedAt}ms: ${result.error || "unknown"}`);
                return failure(result.error || "Transcription failed.");
            }

            const engine = result.engine || "whisper";
            console.log(
                `[STT] Transcript in ${Date.now() - sttStartedAt}ms: "${result.text}" ` +
                `(engine: ${engine}, detected: ${result.detectedLanguage || "auto"})`
            );
            console.log("[IPC] transcript → renderer");

            // Full STT result contract: rawText (before correction),
            // normalizedText (after the STT tolerance/correction layer),
            // language, confidence (null when the engine provides none —
            // never invented), and a timestamp.
            return success({
                text: result.text,
                rawText: result.rawText !== undefined ? result.rawText : result.text,
                normalizedText: result.text,
                detectedLanguage: result.detectedLanguage,
                language: result.language,
                confidence: typeof result.confidence === "number" ? result.confidence : null,
                timestamp: result.timestamp || Date.now(),
                engine,
                fallbackReason: result.fallbackReason || undefined
            });
        }
    );

    registerListener(
        "voice:send",
        (event, text) => {

            const value =
                safeString(
                    text
                );

            log(
                "Voice text received:",
                value
            );

            if (!value) {
                return;
            }

            sendToRenderer(
                "voice:text",
                value
            );
        }
    );

    // ============================================================
    // VOICE SPEAK — selected engine with ordered automatic fallbacks
    // ------------------------------------------------------------
    // The selected provider is tried first. If it is unavailable, the
    // fallback chain moves through the other configured online engines and
    // then local Windows SAPI/XTTS so a transient failure does not go silent.
    //
    // The SAPI path still writes text to stdin (never interpolated
    // into the PowerShell command) so it is always treated as data.
    // ============================================================

    registerHandler(
        "voice:speak",
        async (event, text, options = {}) => {
            const value = safeString(text);
            if (!value) return failure("Text to speak is required.");

            // Stop invalidates every in-flight provider, including a pending
            // Sarvam/XTTS request that has not returned audio yet.
            const generation = ++edgeTTSGeneration;
            const settings = await loadXttsSettings();
            if (generation !== edgeTTSGeneration) return success({ stopped: true });
            const requestedLanguage = safeString(options?.language || "").toLowerCase();
            // Map to XTTS language code (hi for Hindi/Hinglish, en for English)
            let xttsLang = settings.languageMode || "auto";
            if (requestedLanguage === "hi" || requestedLanguage.startsWith("hi-")) xttsLang = "hi";
            else if (requestedLanguage === "en" || requestedLanguage.startsWith("en-")) xttsLang = "en";
            else if (requestedLanguage === "hinglish") xttsLang = "hinglish";

            console.log(`[TTS] voice:speak — engine=${settings.ttsEngine}, lang=${xttsLang}, edgeVoice=${settings.edgeVoice || "auto"}, ${value.length} chars`);
            const result = await speakWithTtsFallbackChain(value, xttsLang, settings, options, generation);
            if (generation !== edgeTTSGeneration) return success({ stopped: true });
            if (result?.stopped) return success(result);
            if (result?.success === false) return result;
            return success(result);
        }
    );

    registerHandler(
        "voice:stop-speaking",
        async () => {
            edgeTTSGeneration++;
            clearTTSQueue();
            if (activeTTSProcess && !activeTTSProcess.killed) {
                try { activeTTSProcess.kill(); } catch (_) {}
                activeTTSProcess = null;
            }
            if (indicParlerProcess && !indicParlerProcess.killed) {
                try { indicParlerProcess.kill(); } catch (_) {}
                indicParlerProcess = null;
            }
            // Signal the XTTS server to stop (sets status to STOPPED)
            const settings = await loadXttsSettings();
            const http = require("http");
            const { URL } = require("url");
            try {
                const target = new URL("/stop", settings.serverUrl);
                http.request(target, { method: "POST", timeout: 2000 }, () => {}).on("error", () => {}).end();
            } catch {}
            return success({ stopped: true });
        }
    );

    // ============================================================
    // XTTS-v2 STATUS, SETTINGS, AND TEST ENDPOINTS
    // ============================================================

    registerHandler("voice:xtts-status", async () => {
        const health = await checkXttsHealth();
        const settings = await loadXttsSettings();
        const sarvamConfigured = Boolean(await getSarvamApiKey());
        const elevenLabsConfigured = Boolean(await getElevenLabsApiKey());
        const engineNames = { edge: "Microsoft Edge TTS", sarvam: "Sarvam Bulbul v3", elevenlabs: "ElevenLabs", "indic-parler": "Indic Parler-TTS", sapi: "Windows SAPI", xtts: "XTTS-v2" };
        return success({
            engine: engineNames[settings.ttsEngine] || "Microsoft Edge TTS",
            ttsEngine: settings.ttsEngine || "edge",
            sttEngine: settings.sttEngine || "offline",
            sarvamConfigured,
            elevenLabsConfigured,
            elevenLabsVoiceId: getElevenLabsVoiceId(),
            status: settings.ttsEngine === "sarvam" ? (sarvamConfigured ? "CONFIGURED" : "NEEDS API KEY") : settings.ttsEngine === "elevenlabs" ? (elevenLabsConfigured ? "CONFIGURED" : "NEEDS API KEY") : ["edge", "sapi"].includes(settings.ttsEngine) ? "READY" : (health.status || "STOPPED"),
            available: settings.ttsEngine === "edge" || settings.ttsEngine === "sapi" || settings.ttsEngine === "indic-parler" || (settings.ttsEngine === "sarvam" && sarvamConfigured) || (settings.ttsEngine === "elevenlabs" && elevenLabsConfigured) || health.available,
            device: settings.ttsEngine === "edge" ? "Microsoft Edge service" : settings.ttsEngine === "sarvam" ? "Sarvam API" : settings.ttsEngine === "elevenlabs" ? "ElevenLabs API" : settings.ttsEngine === "indic-parler" ? "This computer (Hugging Face model)" : settings.ttsEngine === "sapi" ? "This computer" : (health.health?.device || "unknown"),
            voice: settings.ttsEngine === "edge" ? "Edge Neural" : settings.ttsEngine === "sarvam" ? "Sarvam Aditya" : settings.ttsEngine === "elevenlabs" ? `ElevenLabs voice ${getElevenLabsVoiceId()}` : settings.ttsEngine === "indic-parler" ? "Male Indian voice (Hindi / English)" : settings.ttsEngine === "sapi" ? settings.sapiVoice : "JARVIS",
            referenceVoice: health.health?.reference_loaded ? "jarvis_reference.wav" : null,
            referenceLoaded: health.health?.reference_loaded || false,
            referenceDuration: health.health?.reference_duration || 0,
            speed: settings.speed,
            edgeVoice: settings.edgeVoice || "auto",
            voiceProfile: settings.voiceProfile || "edge-auto",
            sapiVoice: settings.sapiVoice || "Microsoft David",
            languageMode: settings.language_mode || settings.languageMode || "auto",
            speakerCached: health.health?.speaker_cached || false,
            totalGenerations: health.health?.total_generations || 0,
            error: health.error || null,
        });
    });

    registerHandler("voice:engine-migration-status", async () => success(await voiceEngineMigration.status()));
    registerHandler("voice:engine-migration-preflight", async (_event, target) => success(await voiceEngineMigration.preflight(target)));
    registerHandler("voice:engine-migration-request", async (_event, target, options = {}) => success(await voiceEngineMigration.request(target, options)));
    registerHandler("voice:engine-migration-cleanup", async (_event, engine, options = {}) => success(await voiceEngineMigration.cleanup(engine, options)));

    registerHandler("voice:sapi-voices", async () => {
        if (process.platform !== "win32") return success({ available: false, voices: [], preferred: "Microsoft David" });
        const script = "Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { [PSCustomObject]@{ name=$_.VoiceInfo.Name; culture=$_.VoiceInfo.Culture.Name; gender=$_.VoiceInfo.Gender.ToString() } } | ConvertTo-Json -Compress";
        return new Promise((resolve) => {
            const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true });
            let stdout = "";
            let stderr = "";
            child.stdout.on("data", chunk => { stdout += chunk.toString(); });
            child.stderr.on("data", chunk => { stderr += chunk.toString(); });
            child.on("error", error => resolve(failure(error.message)));
            child.on("close", code => {
                if (code !== 0) return resolve(failure(stderr || `SAPI voice query exited with code ${code}`));
                try {
                    const voices = stdout.trim() ? JSON.parse(stdout.trim()) : [];
                    resolve(success({ available: true, voices: Array.isArray(voices) ? voices : [voices], preferred: ( _xttsSettingsCache || DEFAULT_XTTS_SETTINGS).sapiVoice || "Microsoft David" }));
                } catch (error) { resolve(failure(`Could not read installed voices: ${error.message}`)); }
            });
        });
    });

    registerHandler("voice:duplex-config", async () => ({
        enabled: process.env.JARVIS_FULL_DUPLEX_ENABLED !== "false"
    }));
    registerHandler("voice:xtts-settings", async (_event, next = {}) => {
        if (next && typeof next === "object" && Object.keys(next).length > 0) {
            const safeNext = { ...next };
            if (safeNext.sapiVoice !== undefined) safeNext.sapiVoice = safeString(safeNext.sapiVoice).slice(0, 80) || "Microsoft David";
            const settings = await saveXttsSettings(safeNext);
            // Push runtime settings to the server too
            const serverPatch = {};
            if (next.speed !== undefined) serverPatch.speed = next.speed;
            if (next.languageMode !== undefined) serverPatch.language_mode = next.languageMode;
            if (Object.keys(serverPatch).length > 0) {
                await updateXttsServerSettings(serverPatch);
            }
            return success(publicVoiceSettings(settings));
        }
        return success(publicVoiceSettings(await loadXttsSettings()));
    });

    registerHandler("voice:xtts-test", async (_event, language = "auto") => {
        return success(await testXttsVoice(language));
    });

    // ============================================================
    // MY VOICE (LOCAL CLONED VOICE) — Phase X
    // ------------------------------------------------------------
    // Fully offline: talks to a local HTTP server the user runs
    // themselves (see scripts/voice_clone_server.py) which does the
    // actual voice cloning with a locally-downloaded model. JARVIS
    // itself never uploads audio anywhere — it just POSTs text to
    // 127.0.0.1 and plays back whatever WAV bytes come back.
    // Settings are a small JSON file, same pattern as bookmarks/
    // history above (no electron-store, see note there).
    // ============================================================

    const MY_VOICE_SETTINGS_FILE = () =>
        path.join(app.getPath("userData"), "my-voice-settings.json");

    const DEFAULT_MY_VOICE_SETTINGS = {
        enabled: false,
        serverUrl: "http://127.0.0.1:5055"
    };

    let myVoiceSettings = null;

    async function loadMyVoiceSettings() {
        if (myVoiceSettings) return myVoiceSettings;
        try {
            const raw = await fs.promises.readFile(MY_VOICE_SETTINGS_FILE(), "utf-8");
            myVoiceSettings = { ...DEFAULT_MY_VOICE_SETTINGS, ...JSON.parse(raw) };
        } catch {
            myVoiceSettings = { ...DEFAULT_MY_VOICE_SETTINGS };
        }
        if (!isLoopbackURL(myVoiceSettings.serverUrl)) {
            myVoiceSettings.serverUrl = DEFAULT_MY_VOICE_SETTINGS.serverUrl;
        }
        return myVoiceSettings;
    }

    async function saveMyVoiceSettings(next) {
        myVoiceSettings = { ...DEFAULT_MY_VOICE_SETTINGS, ...next };
        if (!isLoopbackURL(myVoiceSettings.serverUrl)) {
            myVoiceSettings.serverUrl = DEFAULT_MY_VOICE_SETTINGS.serverUrl;
            return failure("Offline-only mode allows voice servers on this computer only.");
        }
        try {
            await fs.promises.mkdir(path.dirname(MY_VOICE_SETTINGS_FILE()), { recursive: true });
            await fs.promises.writeFile(
                MY_VOICE_SETTINGS_FILE(),
                JSON.stringify(myVoiceSettings, null, 2),
                "utf-8"
            );
        } catch (error) {
            errorLog("Failed to save my-voice-settings.json:", error);
        }
        return myVoiceSettings;
    }

    registerHandler("voice:get-my-voice-settings", async () =>
        success(await loadMyVoiceSettings())
    );

    registerHandler("voice:set-my-voice-settings", async (_event, next = {}) => {
        const settings = await saveMyVoiceSettings({
            enabled: Boolean(next.enabled),
            serverUrl: safeString(next.serverUrl) || DEFAULT_MY_VOICE_SETTINGS.serverUrl
        });
        return success(settings);
    });

    // Calls the local Python voice-cloning server's POST /speak
    // endpoint and returns the resulting WAV audio as base64 so the
    // renderer can play it with a plain <audio>/Audio() element.
    // Never touches the network beyond localhost.
    registerHandler("voice:speak-cloned", async (_event, text, options = {}) => {
        const value = safeString(text);
        if (!value) return failure("Text to speak is required.");

        const settings = await loadMyVoiceSettings();
        if (!settings.enabled) {
            return failure("My-voice mode is not enabled.");
        }

        const http = require("http");
        const https = require("https");
        const { URL } = require("url");

        let target;
        try {
            target = new URL("/speak", settings.serverUrl);
        } catch {
            return failure(`Invalid voice server URL: ${settings.serverUrl}`);
        }

        const client = target.protocol === "https:" ? https : http;
        const payload = JSON.stringify({
            text: value,
            language: safeString(options?.language) || "auto"
        });

        return new Promise((resolve) => {
            const req = client.request(
                target,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Content-Length": Buffer.byteLength(payload)
                    },
                    timeout: 30000
                },
                (res) => {
                    if (res.statusCode !== 200) {
                        let body = "";
                        res.on("data", (c) => (body += c));
                        res.on("end", () =>
                            resolve(failure(
                                `Voice server returned ${res.statusCode}: ${body.slice(0, 200)}`
                            ))
                        );
                        return;
                    }

                    const chunks = [];
                    res.on("data", (c) => chunks.push(c));
                    res.on("end", () => {
                        const audioBuffer = Buffer.concat(chunks);
                        resolve(success({
                            audioBase64: audioBuffer.toString("base64"),
                            mime: "audio/wav"
                        }));
                    });
                }
            );

            req.on("timeout", () => {
                req.destroy();
                resolve(failure(
                    "Voice server timed out. Is scripts/voice_clone_server.py running?"
                ));
            });

            req.on("error", (error) => {
                resolve(failure(
                    `Could not reach local voice server at ${settings.serverUrl}. ` +
                    `Start it with: python scripts/voice_clone_server.py (${error.message})`
                ));
            });

            req.write(payload);
            req.end();
        });
    });

    // Phase 9: cloud/network TTS removed. Local Windows SAPI is the only
    // default system TTS path; optional localhost voice-clone remains separate.
}

/* ============================================================
   OLLAMA IPC — LOCAL AI (optional, conversation only)
   ------------------------------------------------------------
   Ollama is the local AI backend. It is strictly OPTIONAL:
   - not installed        → JARVIS keeps running, deterministic
                            commands + memory + TTS all work
   - installed, not running → "LOCAL AI OFFLINE" status, no crash
   - running, no model    → "No Ollama model is installed."

   SAFETY: the ollama:chat channel is a conversational passthrough.
   It never executes anything Ollama produces and never grants
   Ollama OS access. Destructive PC actions remain exclusively in
   the deterministic Action Engine / SafetyGate pipeline.
============================================================ */



function registerNotificationIPC() {
    registerHandler("notifications:list", async (_event, options = {}) =>
        safeIPC("notifications:list", async () => {
            const active = userManager.getActiveUserId();
            const clean = options && typeof options === "object" ? options : {};
            return success({ notifications: notificationCenter.list({
                ...clean, userId: active
            })});
        })
    );
    registerHandler("notifications:unread-count", async () =>
        safeIPC("notifications:unread-count", async () =>
            success({ count: notificationCenter.unreadCount(userManager.getActiveUserId()) })
        )
    );
    registerHandler("notifications:mark-read", async (_event, id) =>
        safeIPC("notifications:mark-read", async () =>
            notificationCenter.markRead(safeString(id)) ? success({}) : failure("Notification not found.")
        )
    );
    registerHandler("notifications:mark-all-read", async () =>
        safeIPC("notifications:mark-all-read", async () => {
            notificationCenter.markAllRead(userManager.getActiveUserId());
            return success({});
        })
    );
    registerHandler("notifications:clear", async () =>
        safeIPC("notifications:clear", async () => {
            notificationCenter.clear(userManager.getActiveUserId());
            return success({});
        })
    );
    registerHandler("notifications:stats", async () =>
        safeIPC("notifications:stats", async () =>
            success(notificationCenter.stats(userManager.getActiveUserId()))
        )
    );
}

let lastAiProviderTest = null;

function registerOllamaIPC() {

    restoreBackgroundJobs();

    registerHandler("documents:generated-list", async () => safeIPC("documents:generated-list", async () => {
        const roots = [
            { directory: path.join(app.getPath("documents"), "JARVIS Presentations"), type: "presentation", extension: ".pptx" },
            { directory: path.join(app.getPath("documents"), "JARVIS PDFs"), type: "pdf", extension: ".pdf" },
            { directory: path.join(app.getPath("documents"), "JARVIS Spreadsheets"), type: "spreadsheet", extension: ".xlsx" },
            { directory: path.join(app.getPath("documents"), "JARVIS Documents"), type: "document", extension: ".docx" },
            { directory: path.join(app.getPath("documents"), "JARVIS Documents"), type: "csv", extension: ".csv" },
            { directory: path.join(app.getPath("documents"), "JARVIS Documents"), type: "archive", extension: ".zip" }
        ];
        const documents = [];
        for (const root of roots) {
            let names = [];
            try { names = await fs.promises.readdir(root.directory); } catch (_) { continue; }
            for (const name of names) {
                if (path.extname(name).toLowerCase() !== root.extension) continue;
                const filePath = path.join(root.directory, name);
                try {
                    const stat = await fs.promises.stat(filePath);
                    if (!stat.isFile()) continue;
                    const previewPath = root.type === "presentation" ? filePath.replace(/\.pptx$/i, ".preview.html") : "";
                    const thumbnailPath = root.type === "presentation" ? filePath.replace(/\.pptx$/i, ".thumb.png") : "";
                    const manifestPath = root.type === "presentation" ? filePath.replace(/\.pptx$/i, ".assets.json") : filePath.replace(/\.pdf$/i, ".quality.json");
                    let imageCredits = [];
                    let qualityReport = null;
                    try {
                        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
                        imageCredits = manifest?.images || (manifest?.coverImage ? [manifest.coverImage] : []);
                        qualityReport = manifest?.qualityReport || null;
                        if (manifest?.officeRender) qualityReport = { ...(qualityReport || {}), officeRender: manifest.officeRender };
                    } catch (_) {}
                    documents.push({ title: path.basename(name, root.extension).replace(/-\d{4}-\d{2}-\d{2}T.*$/, "").replace(/[-_]/g, " "), type: root.type, path: filePath, size: stat.size, modifiedAt: stat.mtimeMs, previewPath: previewPath && fs.existsSync(previewPath) ? previewPath : "", thumbnailPath: thumbnailPath && fs.existsSync(thumbnailPath) ? thumbnailPath : "", imageCredits: Array.isArray(imageCredits) ? imageCredits : [], qualityReport });
                } catch (_) { /* Skip files that disappear while listing. */ }
            }
        }
        documents.sort((a, b) => b.modifiedAt - a.modifiedAt);
        const versionCounts = new Map();
        for (const doc of documents) {
            const key = `${doc.type}|${doc.title.toLocaleLowerCase()}`;
            versionCounts.set(key, (versionCounts.get(key) || 0) + 1);
        }
        const versionIndex = new Map();
        for (const doc of documents) {
            const key = `${doc.type}|${doc.title.toLocaleLowerCase()}`;
            const next = (versionIndex.get(key) || 0) + 1;
            versionIndex.set(key, next);
            doc.version = next;
            doc.versionCount = versionCounts.get(key) || 1;
        }
        return success({ documents: documents.slice(0, 200) });
    }));
    registerHandler("documents:generated-open", async (_event, input = {}) => {
        const filePath = path.resolve(String(input.path || ""));
        const roots = ["JARVIS Presentations", "JARVIS PDFs", "JARVIS Spreadsheets", "JARVIS Documents"].map(name => path.resolve(app.getPath("documents"), name));
        const root = roots.find(candidate => filePath.toLowerCase().startsWith(`${candidate}${path.sep}`.toLowerCase())) || "";
        const ext = path.extname(filePath).toLowerCase();
        if (!root || ![".pptx", ".pdf", ".xlsx", ".docx", ".csv", ".zip"].includes(ext) || !fs.existsSync(filePath)) return failure("This file is not in JARVIS's generated documents folders.");
        const openError = await shell.openPath(filePath);
        return openError ? failure(openError) : success({ path: filePath });
    });
    registerHandler("documents:generated-restore-version", async (_event, input = {}) => safeIPC("documents:generated-restore-version", async () => {
        const source = path.resolve(String(input.path || ""));
        const presentationRoot = path.resolve(app.getPath("documents"), "JARVIS Presentations");
        const pdfRoot = path.resolve(app.getPath("documents"), "JARVIS PDFs");
        const ext = path.extname(source).toLowerCase();
        const root = ext === ".pptx" ? presentationRoot : ext === ".pdf" ? pdfRoot : "";
        if (!root || !source.toLowerCase().startsWith(`${root}${path.sep}`.toLowerCase())) return failure("Choose a generated JARVIS document version to restore.");
        const stat = await fs.promises.stat(source).catch(() => null);
        if (!stat?.isFile() || stat.size > 100 * 1024 * 1024) return failure("The selected document is missing or exceeds the 100 MB restore limit.");
        const base = path.basename(source, ext).replace(/-\d{4}-\d{2}-\d{2}T.*$/, "").replace(/-Restored$/, "") || "Document";
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const restored = path.join(root, `${base}-${stamp}${ext}`);
        const createdFiles = [];
        const restoredRenderDir = restored.replace(/\.pptx$/i, ".rendered");
        try {
            await fs.promises.copyFile(source, restored, fs.constants.COPYFILE_EXCL);
            createdFiles.push(restored);
            const sidecars = ext === ".pptx" ? [".preview.html", ".thumb.png", ".assets.json"] : [".quality.json"];
            for (const suffix of sidecars) {
                const from = source.replace(new RegExp(`${ext.replace(".", "\\.")}$`, "i"), suffix);
                const to = restored.replace(new RegExp(`${ext.replace(".", "\\.")}$`, "i"), suffix);
                try { await fs.promises.copyFile(from, to, fs.constants.COPYFILE_EXCL); createdFiles.push(to); } catch (error) { if (error.code !== "ENOENT") throw error; }
            }
            if (ext === ".pptx") {
                const fromDir = source.replace(/\.pptx$/i, ".rendered");
                try { await fs.promises.cp(fromDir, restoredRenderDir, { recursive: true, errorOnExist: true }); } catch (error) { if (error.code !== "ENOENT") throw error; }
                const manifestPath = restored.replace(/\.pptx$/i, ".assets.json");
                try {
                    const manifest = JSON.parse(await fs.promises.readFile(manifestPath, "utf8"));
                    if (manifest.officeRender?.slides?.length && fs.existsSync(restoredRenderDir)) {
                        manifest.officeRender.slides = manifest.officeRender.slides.map(file => path.join(restoredRenderDir, path.basename(file)));
                        await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
                    }
                } catch (_) {}
            }
        } catch (error) {
            for (const created of createdFiles.reverse()) await fs.promises.unlink(created).catch(() => {});
            await fs.promises.rm(restoredRenderDir, { recursive: true, force: true }).catch(() => {});
            throw error;
        }
        return success({ path: restored, restoredFrom: source });
    }));
    registerHandler("documents:generated-preview", async (_event, input = {}) => {
        const filePath = path.resolve(String(input.path || ""));
        const root = path.resolve(app.getPath("documents"), "JARVIS Presentations");
        if (!filePath.startsWith(root + path.sep) || !filePath.endsWith(".preview.html") || !fs.existsSync(filePath)) return failure("No saved slide preview exists for this presentation.");
        const opened = await openPresentationPreviewWindow(filePath);
        return opened?.opened ? success({ path: filePath, layoutCheck: opened.layoutCheck }) : failure(opened?.error || "The saved slide preview could not be opened.");
    });
    registerHandler("documents:generated-render", async (_event, input = {}) => safeIPC("documents:generated-render", async () => {
        const filePath = path.resolve(String(input.path || ""));
        const root = path.resolve(app.getPath("documents"), "JARVIS Presentations");
        if (!filePath.toLowerCase().startsWith(`${root}${path.sep}`.toLowerCase()) || !filePath.toLowerCase().endsWith(".pptx") || !fs.existsSync(filePath)) return failure("Choose a generated PPTX in the JARVIS Presentations folder.");
        let expectedSlides = 0;
        try {
            const packageZip = await JSZip.loadAsync(await fs.promises.readFile(filePath));
            const presentationXml = await packageZip.file("ppt/presentation.xml")?.async("string");
            expectedSlides = (presentationXml?.match(/<p:sldId\s/g) || []).length;
        } catch (_) {}
        const officeRender = await renderPptxWithPowerPoint(filePath, expectedSlides);
        if (officeRender.rendered && officeRender.slides?.[0]) fs.copyFileSync(officeRender.slides[0], filePath.replace(/\.pptx$/i, ".thumb.png"));
        const manifestPath = filePath.replace(/\.pptx$/i, ".assets.json");
        let manifest = {};
        try { manifest = JSON.parse(await fs.promises.readFile(manifestPath, "utf8")); } catch (_) {}
        manifest.officeRender = officeRender;
        try { await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8"); } catch (error) { return failure(`Render completed, but its report could not be saved: ${error.message}`); }
        return officeRender.rendered ? success({ officeRender, thumbnailPath: filePath.replace(/\.pptx$/i, ".thumb.png") }) : failure(officeRender.reason || "PowerPoint rendering is unavailable.", { officeRender });
    }));
    registerHandler("documents:generated-compare", async (_event, selectedPaths = []) => safeIPC("documents:generated-compare", async () => {
        if (!Array.isArray(selectedPaths) || selectedPaths.length !== 2) return failure("Select exactly two generated documents to compare.");
        const roots = [path.resolve(app.getPath("documents"), "JARVIS Presentations"), path.resolve(app.getPath("documents"), "JARVIS PDFs")];
        const files = selectedPaths.map(raw => path.resolve(String(raw || "")));
        for (const file of files) {
            if (!roots.some(root => file.startsWith(root + path.sep)) || ![".pptx", ".pdf"].includes(path.extname(file).toLowerCase())) return failure("Comparison is limited to files generated in JARVIS's Documents folders.");
            const stat = await fs.promises.stat(file).catch(() => null);
            if (!stat?.isFile() || stat.size > 100 * 1024 * 1024) return failure("A selected document is missing or exceeds the 100 MB comparison limit.");
        }
        const extract = async file => {
            if (path.extname(file).toLowerCase() === ".pptx") {
                const zip = await JSZip.loadAsync(await fs.promises.readFile(file));
                const entries = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name)).sort((a, b) => Number(a.match(/slide(\d+)/i)[1]) - Number(b.match(/slide(\d+)/i)[1]));
                const pages = [];
                for (const name of entries) {
                    const xml = await zip.file(name).async("string");
                    pages.push([...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(match => match[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")).join(" ").trim());
                }
                const renderDirectory = file.replace(/\.pptx$/i, ".rendered");
                let renderedSlides = [];
                try { renderedSlides = (await fs.promises.readdir(renderDirectory)).filter(name => /^slide\d*\.png$/i.test(name)).sort((a, b) => Number(a.match(/\d+/)?.[0] || 0) - Number(b.match(/\d+/)?.[0] || 0)).map(name => path.join(renderDirectory, name)); } catch (_) {}
                return { type: "pptx", pages, imageCount: Object.keys(zip.files).filter(name => /^ppt\/media\/image/i.test(name)).length, renderedSlides };
            }
            const parsePdf = require("pdf-parse");
            const result = await parsePdf(await fs.promises.readFile(file));
            return { type: "pdf", pages: String(result.text || "").split("\f").map(text => text.trim()), imageCount: null };
        };
        const results = await Promise.all(files.map(extract));
        const [left, right] = results;
        const pageDiffs = [];
        let addedWords = 0;
        let removedWords = 0;
        for (let index = 0; index < Math.max(left.pages.length, right.pages.length); index += 1) {
            const before = left.pages[index] || "";
            const after = right.pages[index] || "";
            if (before === after) continue;
            const beforeWords = new Set(before.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
            const afterWords = new Set(after.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
            const removed = [...beforeWords].filter(word => !afterWords.has(word)).length;
            const added = [...afterWords].filter(word => !beforeWords.has(word)).length;
            removedWords += removed;
            addedWords += added;
            pageDiffs.push({ page: index + 1, before: before.slice(0, 900), after: after.slice(0, 900), removedWords: removed, addedWords: added, addedPage: !before, removedPage: !after });
        }
        return success({
            documents: files.map(file => ({ path: file, title: path.basename(file, path.extname(file)), type: path.extname(file).slice(1).toUpperCase(), modifiedAt: fs.statSync(file).mtimeMs })),
            textChangedPages: pageDiffs.length, pageDiffs: pageDiffs.slice(0, 80), addedWords, removedWords,
            imageCounts: [left.imageCount, right.imageCount],
            renderedSlides: [left.renderedSlides || [], right.renderedSlides || []],
            visualCompare: left.renderedSlides?.length && right.renderedSlides?.length
                ? "Actual Microsoft PowerPoint slide renders are shown side by side for visual comparison."
                : "PowerPoint-rendered slide comparison is unavailable for one or both files. Chromium preview thumbnails may appear instead; they are not the PowerPoint rendering."
        });
    }));

    registerHandler("background-jobs:list", async () => success({ jobs: [...backgroundJobs.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 50) }));
    registerHandler("background-jobs:cancel", async (_event, id) => {
        const record = backgroundJobs.get(String(id || ""));
        if (!record) return failure("That job is no longer available.");
        if (!["queued", "running"].includes(record.state)) return failure("Only queued or running jobs can be cancelled.");
        record.cancelRequested = true;
        backgroundJobControllers.get(record.id)?.abort();
        updateBackgroundJob(record.id, { state: "cancelling", stage: "Cancellation requested" });
        return success({ requested: true });
    });
    registerHandler("ai-provider:get", async () => success(openAICompatibleClient.getConfig()));
    registerHandler("ai-provider:health", async () => safeIPC("ai-provider:health", async () => {
        const [online, ollama, powerPointRenderer] = await Promise.all([offlineCache.isOnline(), ollamaClient.getStatus(), isPowerPointAutomationAvailable()]);
        const config = openAICompatibleClient.getConfig();
        const creditError = /credit|quota|billing/i.test(String(lastAiProviderTest?.error || ""));
        return success({
            sarvam: {
                keyConfigured: config.hasSarvamApiKey,
                internet: online,
                model: config.model,
                lastTest: lastAiProviderTest,
                creditStatus: creditError ? "Provider reported a credit or quota error." : "Credit balance is not exposed by the configured API."
            },
            grok: {
                keyConfigured: config.provider === "grok" ? config.hasApiKey : Boolean(process.env.XAI_API_KEY),
                model: config.provider === "grok" ? config.model : (process.env.XAI_MODEL || "grok-4.1-fast"),
                endpoint: "https://api.x.ai/v1"
            },
            groq: {
                keyConfigured: config.provider === "groq" ? config.hasApiKey : Boolean(process.env.GROQ_API_KEY),
                model: config.provider === "groq" ? config.model : (process.env.GROQ_MODEL || "openai/gpt-oss-120b"),
                endpoint: "https://api.groq.com/openai/v1"
            },
            ollama: {
                installed: ollama.installed,
                running: ollama.running,
                enabled: ollama.enabled,
                selectedModel: ollama.selectedModel || "",
                modelCount: ollama.models.length,
                visionModels: ollama.models.map(model => model.name).filter(name => /llava|qwen(?:2\.5|3)(?:[-:]?vl)|gemma3|moondream|minicpm-v|bakllava/i.test(name)),
                error: ollama.error || ""
            },
            documentRenderer: { powerPoint: powerPointRenderer, detail: powerPointRenderer ? "Microsoft PowerPoint automation is available for slide export and visual comparison." : "No Microsoft PowerPoint automation is registered. JARVIS will use the Chromium preview; this is not PowerPoint rendering." },
            hardware: { memoryGb: Math.round(os.totalmem() / (1024 ** 3) * 10) / 10, logicalCores: os.cpus().length, platform: process.platform }
        });
    }));
    registerHandler("ai-provider:privacy-save", async (_event, input = {}) => {
        const result = openAICompatibleClient.savePrivacySettings(input);
        return result.success ? success({ config: result.config }) : failure(result.error);
    });
    registerHandler("ai-provider:privacy-clear", async () => {
        const activeMemory = getActiveUserMemory();
        if (!activeMemory || typeof activeMemory.clearWorkingMemory !== "function") return failure("No active chat context is available to clear.");
        activeMemory.clearWorkingMemory();
        return success({ cleared: true });
    });
    registerHandler("ai-provider:privacy-preview", async () => {
        const config = openAICompatibleClient.getConfig();
        const activeMemory = getActiveUserMemory();
        const turns = Math.max(0, Math.min(8, Number(config.sarvamHistoryTurns ?? 8) || 0));
        const available = (activeMemory?.getWorkingMemory?.() || [])
            .filter(turn => (turn?.role === "user" || turn?.role === "assistant") && String(turn.text || "").trim())
            .filter(turn => turn.timestamp && Date.now() - Number(turn.timestamp) <= 30 * 60 * 1000);
        const included = turns ? available.slice(-turns) : [];
        return success({ historyTurns: turns, messages: included.map(turn => ({ role: turn.role, content: String(turn.text).slice(0, 1400) })), currentPrompt: "The prompt you send next will also be included (up to 4,000 characters).", systemInstruction: "JARVIS response/language instructions are also sent." });
    });
    registerHandler("ai-provider:save", async (_event, config) => {
        const result = openAICompatibleClient.saveConfig(config || {});
        return result.success ? success({ config: result.config }) : failure(result.error);
    });
    registerHandler("ai-provider:grok-sarvam-voice", async () => {
        const current = openAICompatibleClient.getConfig();
        const providerResult = openAICompatibleClient.saveConfig({
            provider: "grok",
            providerName: "Grok",
            endpoint: "https://api.x.ai/v1",
            model: process.env.XAI_MODEL || "grok-4.1-fast"
        });
        if (!providerResult.success) return failure(providerResult.error);
        const voiceSettings = await saveXttsSettings({
            ttsEngine: "sarvam",
            sttEngine: "sarvam",
            voiceLanguagePipeline: "sarvam-native-v1",
            voiceProfile: "sarvam-grok"
        });
        if (voiceSettings?.success === false) return failure(voiceSettings.error);
        return success({ config: providerResult.config, voice: voiceSettings, previousProvider: current.provider });
    });
    registerHandler("ai-provider:test", async () => {
        const config = openAICompatibleClient.getConfig();
        const messages = [
            { role: "system", content: "This is a connection check. Reply with exactly OK in one language, with no translation or extra text." },
            { role: "user", content: "Reply with OK." }
        ];
        // JARVIS automatically prefers Sarvam whenever its credential is
        // saved, even when the local fallback selector currently shows Ollama.
        const result = await openAICompatibleClient.chat(messages, { timeoutMs: 20000, maxTokens: 32, temperature: 0 });
        lastAiProviderTest = { at: new Date().toISOString(), success: Boolean(result.success), error: result.success ? "" : String(result.error || "Connection test failed.").slice(0, 320), statusCode: result.statusCode || null, provider: config.provider };
        return result.success
            ? success({ model: result.model, text: result.text, statusCode: result.statusCode, provider: config.provider })
            : failure(result.error, { statusCode: result.statusCode || null, errorCode: result.errorCode || "", provider: config.provider });
    });
    registerHandler("ai-provider:vision", async (_event, prompt, imageBase64, options = {}) => safeIPC("ai-provider:vision", async () => {
        const image = String(imageBase64 || "").trim();
        if (!image || !/^[A-Za-z0-9+/]+={0,2}$/.test(image) || image.length > 8_000_000) return failure("The shared screen image is invalid or too large.");
        const config = openAICompatibleClient.getConfig();
        const messages = [{
            role: "user",
            content: [
                { type: "text", text: String(prompt || "Inspect the current screen.").slice(0, 2000) },
                { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } }
            ]
        }];
        if (config.provider === "ollama") {
            const status = await ollamaClient.getStatus({ force: true });
            if (!status?.running || !status.selectedModel) return failure("The selected Ollama model is not running.");
            return ollamaClient.chat([{ role: "user", content: String(prompt || "Inspect the current screen.").slice(0, 2000), images: [image] }], { ...options, model: status.selectedModel, timeoutMs: Math.min(Number(options.timeoutMs) || 45000, 120000) });
        }
        if (!["sarvam", "grok", "groq", "openai-compatible"].includes(config.provider)) return failure("Select an AI provider before starting Autopilot screen watch.");
        return openAICompatibleClient.chat(messages, { ...options, vision: true, timeoutMs: Math.min(Number(options.timeoutMs) || 45000, 120000), maxTokens: Math.min(Number(options.maxTokens) || 1200, 1200) });
    }));
    registerHandler("ai-provider:generate-image", async (_event, prompt, options = {}) => safeIPC("ai-provider:generate-image", async () => {
        const result = await openAICompatibleClient.generateImage(prompt, options);
        if (!result?.success) return failure(result?.error || "HoldAPI image generation failed.");
        let image;
        if (result.b64Json) {
            if (!/^[A-Za-z0-9+/]+={0,2}$/.test(result.b64Json)) return failure("HoldAPI returned invalid image data.");
            image = Buffer.from(result.b64Json, "base64");
        } else if (result.url) {
            const response = await net.fetch(result.url, { signal: AbortSignal.timeout(120000) });
            if (!response.ok) return failure(`HoldAPI image download failed (HTTP ${response.status}).`);
            image = Buffer.from(await response.arrayBuffer());
        }
        if (!image?.length || image.length > 20_000_000) return failure("HoldAPI returned an empty or oversized image.");
        const directory = path.join(app.getPath("documents"), "JARVIS Images");
        fs.mkdirSync(directory, { recursive: true });
        const baseName = safeString(prompt).normalize("NFKC").replace(/[^\p{L}\p{N} _-]/gu, "").trim().replace(/\s+/g, "-").slice(0, 70) || "Generated-Image";
        const outputPath = path.join(directory, `${baseName}-${Date.now()}.png`);
        fs.writeFileSync(outputPath, image, { flag: "wx" });
        const openError = await shell.openPath(outputPath);
        return success({ path: outputPath, opened: !openError, openError: openError || undefined, model: result.model, revisedPrompt: result.revisedPrompt || "", size: image.length });
    }));

    // Full health: installed / running / models / selectedModel / error.
    // "running" is verified by a REAL /api/tags probe of the local
    // server — never just the executable being present.
    registerHandler(
        "ollama:status",
        async (_event, force = false) => {
            try {
                const status = await ollamaClient.getStatus({ force: force === true });
                return success({
                    installed: status.installed,
                    version: status.version,
                    running: status.running,
                    baseUrl: status.baseUrl,
                    models: status.models,
                    selectedModel: status.selectedModel,
                    enabled: status.enabled,
                    connected: status.connected,
                    error: status.error
                });
            } catch (error) {
                return failure(`Ollama status check failed: ${getErrorMessage(error)}`);
            }
        }
    );

    // Installed model list (convenience alias over ollama:status).
    registerHandler(
        "ollama:models",
        async () => {
            try {
                const status = await ollamaClient.getStatus();
                return success({ models: status.models, selectedModel: status.selectedModel });
            } catch (error) {
                return failure(`Ollama model detection failed: ${getErrorMessage(error)}`);
            }
        }
    );

    // Select + persist which installed model to use.
    registerHandler(
        "ollama:set-model",
        async (_event, model) => {
            const name = safeString(model);
            if (!name) return failure("Model name is required.");
            const result = ollamaClient.setSelectedModel(name);
            return result.success
                ? success({ model: result.model })
                : failure(result.error);
        }
    );

    registerHandler(
        "ollama:set-enabled",
        async (_event, enabled) => success(ollamaClient.setEnabled(enabled === true))
    );

    // Direct conversational chat (used by the UI/diagnostics — the main
    // conversation path flows through ai:ask, which layers memory +
    // deterministic priority on top of the same client).
    registerHandler(
        "ollama:chat",
        async (_event, messages, options = {}) => {
            if (!Array.isArray(messages) || messages.length === 0) {
                return failure("Messages array is required.");
            }
            // Validate payload shape — same contract as ollamaClient.chat.
            for (const m of messages) {
                const role = safeString(m?.role);
                const content = typeof m?.content === "string" ? m.content : null;
                const images = m?.images;
                const validImages = images === undefined || (Array.isArray(images) && images.length <= 2 &&
                    images.every(image => typeof image === "string" && image.length <= 7_000_000 && /^[A-Za-z0-9+/]+={0,2}$/.test(image)));
                if (!content || !["system", "user", "assistant"].includes(role) || !validImages) {
                    return failure("Each message needs a role (system|user|assistant) and string content.");
                }
            }
            const opts = {};
            if (safeString(options?.model)) opts.model = safeString(options.model);
            if (Number.isFinite(options?.temperature)) opts.temperature = Number(options.temperature);
            if (Number.isFinite(options?.timeoutMs) && Number(options.timeoutMs) > 0) opts.timeoutMs = Number(options.timeoutMs);

            const result = await ollamaClient.chat(messages, opts);
            return result.success
                ? success({ text: result.text, model: result.model, durationMs: result.durationMs })
                : failure(result.error);
        }
    );
}

/* ============================================================
   WINDOW IPC
============================================================ */

function registerWindowIPC() {

    registerListener(
        "window:minimize",
        () => {

            if (
                mainWindow &&
                !mainWindow.isDestroyed()
            ) {

                mainWindow.minimize();
            }
        }
    );

    registerListener(
        "window:maximize",
        () => {

            if (
                !mainWindow ||
                mainWindow.isDestroyed()
            ) {

                return;
            }

            if (
                mainWindow.isMaximized()
            ) {

                mainWindow.unmaximize();

            } else {

                mainWindow.maximize();
            }
        }
    );

    registerListener(
        "window:close",
        () => {

            if (
                mainWindow &&
                !mainWindow.isDestroyed()
            ) {

                mainWindow.close();
            }
        }
    );
}

/* ============================================================
   SYSTEM INFO IPC
============================================================ */

function registerSystemInfoIPC() {

    registerHandler(
        "system:info",
        async () => {

            const cpus = os.cpus() || [];

            const cpuPercent = await measureCpuUsagePercent();

            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const usedMem = totalMem - freeMem;
            const gpuUsagePercent = await measureGpuUsagePercent();
            let gpu = {
                available: false,
                usagePercent: gpuUsagePercent,
                model: "Unavailable",
                status: "GPU telemetry unavailable"
            };

            try {
                const gpuInfo = await app.getGPUInfo("basic");
                const device = Array.isArray(gpuInfo.gpuDevice)
                    ? gpuInfo.gpuDevice[0]
                    : null;
                const model = device && (
                    device.deviceString ||
                    device.device ||
                    device.description
                );

                gpu = {
                    available: Boolean(device || gpuInfo),
                    usagePercent: gpuUsagePercent,
                    model: model || "Electron GPU process available",
                    status: Number.isFinite(gpuUsagePercent)
                        ? "Windows GPU engine counter"
                        : "GPU available; usage counter unavailable"
                };
            } catch {
                // GPU information is optional on headless or unsupported systems.
            }

            const data = {
                platform: process.platform,
                osType: os.type(),
                osVersion: os.release(),
                arch: process.arch,
                uptimeSeconds: os.uptime(),
                cpu: {
                    model: cpus[0] ? cpus[0].model : "Unknown",
                    cores: cpus.length,
                    percent: cpuPercent
                },
                memory: {
                    totalBytes: totalMem,
                    freeBytes: freeMem,
                    usedBytes: usedMem,
                    percent: totalMem
                        ? Math.round((usedMem / totalMem) * 100)
                        : 0
                },
                gpu,
                network: Object.entries(os.networkInterfaces() || {})
                    .flatMap(([name, addrs]) =>
                        (addrs || [])
                            .filter((a) => !a.internal)
                            .map((a) => ({
                                interface: name,
                                address: a.address,
                                family: a.family
                            }))
                    ),
                storage: null,
                battery: null
            };

            // Live subsystem facts used by the Health screen. Secrets are
            // never exposed; only provider readiness and local capabilities.
            try {
                const [ollama, online] = await Promise.all([
                    ollamaClient.getStatus(),
                    offlineCache.isOnline()
                ]);
                const ai = openAICompatibleClient.getConfig();
                const selectedAiReady = ai.provider === "ollama"
                    ? Boolean(ollama.running && ollama.selectedModel)
                    : Boolean(ai.hasApiKey && online);
                const selectedAiLabel = ai.provider === "ollama" ? "Ollama" : (ai.providerName || ai.provider || "AI provider");
                data.subsystems = {
                    chat: {
                        status: selectedAiReady ? "ready" : "limited",
                        detail: selectedAiReady ? `${selectedAiLabel} ready · ${ai.model || ollama.selectedModel || "model configured"}` : `${selectedAiLabel} is not ready`
                    },
                    voice: (() => {
                        const stt = voiceSTT.getModelStatus();
                        return { status: stt.ready ? "ready" : stt.loading ? "fallback" : "limited", detail: `${stt.engine || "Whisper"}${stt.model ? ` · ${path.basename(stt.model)}` : ""}${stt.error ? ` · ${stt.error}` : ""}` };
                    })(),
                    browser: { status: "ready", detail: `${browserTabs.size} open tab(s) · HTTP/HTTPS navigation enabled` },
                    documents: { status: "ready", detail: "PPTX and PDF generation routes loaded" },
                    screenVision: (() => {
                        const hasVision = ollama.models.some(model => /llava|qwen(?:2\.5|3)(?:[-:]?vl)|gemma3|moondream|minicpm-v|bakllava/i.test(model.name));
                        const lowResources = os.totalmem() < 8 * 1024 ** 3 || os.cpus().length < 4;
                        return {
                            status: !hasVision ? "setup" : lowResources ? "limited" : "ready",
                            detail: !hasVision ? "Install a vision model, e.g. ollama pull gemma3:4b" : lowResources ? "Vision model detected; this PC has limited RAM/CPU, so image analysis may be slow." : "A local vision model is installed"
                        };
                    })(),
                    computerUse: {
                        status: process.platform === "win32" ? "ready" : "limited",
                        detail: process.platform === "win32" ? "Mouse/keyboard primitives loaded · explicit session start required" : "Computer Use is currently supported on Windows only"
                    }
                };
            } catch (subsystemError) {
                data.subsystems = { status: "unavailable", detail: getErrorMessage(subsystemError) };
            }

            try {
                const stat = await fs.promises.statfs(app.getPath("home"));
                const totalStorage = stat.blocks * stat.bsize;
                const freeStorage = stat.bfree * stat.bsize;
                data.storage = {
                    totalBytes: totalStorage,
                    freeBytes: freeStorage,
                    usedBytes: Math.max(0, totalStorage - freeStorage),
                    percent: totalStorage
                        ? Math.round(
                            ((totalStorage - freeStorage) / totalStorage) * 100
                        )
                        : 0
                };
            } catch {
                // statfs unsupported/failed — leave storage as null
            }

            if (process.platform === "win32") {
                try {
                    data.battery = await getWindowsBatteryInfo();
                } catch {
                    // battery query failed — leave as null
                }
            }

            return success({ data });
        }
    );
}

function cpuTimesSnapshot() {
    const cpus = os.cpus() || [];

    let idle = 0;
    let total = 0;

    for (const cpu of cpus) {
        const times = cpu.times;
        idle += times.idle;
        total += times.user + times.nice + times.sys + times.idle + times.irq;
    }

    return { idle, total };
}

function measureCpuUsagePercent() {
    return new Promise((resolve) => {
        const start = cpuTimesSnapshot();

        setTimeout(() => {
            const end = cpuTimesSnapshot();

            const idleDelta = end.idle - start.idle;
            const totalDelta = end.total - start.total;

            if (totalDelta <= 0) {
                resolve(0);
                return;
            }

            const usedPercent = Math.round(
                (1 - idleDelta / totalDelta) * 100
            );

            resolve(Math.max(0, Math.min(100, usedPercent)));
        }, 200);
    });
}

function measureGpuUsagePercent() {
    return new Promise((resolve) => {
        if (process.platform !== "win32") {
            resolve(null);
            return;
        }

        const command = [
            "$samples = Get-Counter -Counter '\\GPU Engine(*)\\Utilization Percentage' ",
            "-ErrorAction SilentlyContinue | ",
            "Select-Object -ExpandProperty CounterSamples; ",
            "if (-not $samples) { 'NA'; exit }; ",
            "($samples | Measure-Object -Property CookedValue -Maximum).Maximum"
        ].join("");

        execFile(
            "powershell.exe",
            [
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                command
            ],
            {
                windowsHide: true,
                timeout: 2500,
                maxBuffer: 1024 * 1024
            },
            (error, stdout) => {
                if (error) {
                    resolve(null);
                    return;
                }

                const value = Number.parseFloat(String(stdout || "").trim());
                resolve(Number.isFinite(value)
                    ? Math.max(0, Math.min(100, Math.round(value)))
                    : null);
            }
        );
    });
}

function getWindowsBatteryInfo() {

    return new Promise((resolve, reject) => {

        const script =
            "Get-CimInstance -ClassName Win32_Battery | " +
            "Select-Object EstimatedChargeRemaining, BatteryStatus | " +
            "ConvertTo-Json -Compress";

        execFile(
            "powershell.exe",
            ["-NoProfile", "-NonInteractive", "-Command", script],
            { windowsHide: true, timeout: 5000 },
            (error, stdout) => {

                if (error) {
                    reject(error);
                    return;
                }

                const trimmed = safeString(stdout);

                if (!trimmed) {
                    resolve(null);
                    return;
                }

                try {
                    const parsed = JSON.parse(trimmed);
                    resolve({
                        percent: parsed.EstimatedChargeRemaining ?? null,
                        status: parsed.BatteryStatus ?? null
                    });
                } catch {
                    resolve(null);
                }
            }
        );
    });
}

/* ============================================================
   IPC DIAGNOSTICS
============================================================ */

function registerDiagnosticsIPC() {

    registerHandler(
        "system:ipc-status",
        async () => {

            return success({

                handlers:
                    Array.from(
                        registeredHandlers
                    ),

                listeners:
                    Array.from(
                        registeredListeners
                    ),

                criticalHandler:
                    registeredHandlers.has(
                        "system:open-app"
                    ),

                mainVersion:
                    MAIN_VERSION,

                electron:
                    process.versions.electron,

                node:
                    process.versions.node,

                platform:
                    process.platform
            });
        }
    );
}

/* ============================================================
   WIKIPEDIA IPC
============================================================ */
// Answers "is mahine/saal/aaj kya hua", "wikipedia pe X batao" type
// requests. No API key needed — Wikipedia's public REST API is free.

function registerWikipediaIPC() {

    registerHandler("wikipedia:summary", async (_event, query, lang) =>
        safeIPC("wikipedia:summary", async () =>
            wikipediaService.summary(query, lang)
        )
    );

    registerHandler("wikipedia:on-this-day", async (_event, options = {}) =>
        safeIPC("wikipedia:on-this-day", async () =>
            wikipediaService.onThisDay(options)
        )
    );
}

/* ============================================================
   EXTERNAL DATA SOURCES IPC
============================================================ */
// One handler per free/key-less public API (see src/services/dataSources.js).
// All requests run here in the main process via Node's https, so none of
// this is subject to the renderer's Content-Security-Policy.

function registerDataSourcesIPC() {

    registerHandler("product:research", async (_event, query) =>
        safeIPC("product:research", async () => {
            const cleanQuery = safeString(query).trim().slice(0, 180);
            if (!cleanQuery) return failure("Product name is required.");
            return dataSourcesServiceRaw.productResearch(cleanQuery);
        })
    );

    registerHandler("wikidata:search", async (_event, query, lang) =>
        safeIPC("wikidata:search", async () =>
            dataSourcesService.wikidataSearch(query, lang)
        )
    );

    registerHandler("country:info", async (_event, name) =>
        safeIPC("country:info", async () =>
            dataSourcesService.countryInfo(name)
        )
    );

    registerHandler("location:search", async (_event, query, limit) =>
        safeIPC("location:search", async () =>
            dataSourcesService.locationSearch(query, limit)
        )
    );

    registerHandler("weather:current", async (_event, location) =>
        safeIPC("weather:current", async () =>
            dataSourcesService.weatherByLocation(location)
        )
    );

    registerHandler("weather:forecast", async (_event, location, daysAhead) =>
        safeIPC("weather:forecast", async () =>
            dataSourcesService.weatherForecastByLocation(location, daysAhead)
        )
    );

    registerHandler("books:search", async (_event, query) =>
        safeIPC("books:search", async () =>
            dataSourcesService.bookSearch(query)
        )
    );

    registerHandler("tv:search", async (_event, query) =>
        safeIPC("tv:search", async () =>
            dataSourcesService.tvShowSearch(query)
        )
    );

    registerHandler("recipe:search", async (_event, query) =>
        safeIPC("recipe:search", async () =>
            dataSourcesService.recipeSearch(query)
        )
    );

    registerHandler("pokemon:info", async (_event, name) =>
        safeIPC("pokemon:info", async () =>
            dataSourcesService.pokemonInfo(name)
        )
    );

    registerHandler("news:search", async (_event, query, limit) =>
        safeIPC("news:search", async () =>
            dataSourcesService.newsSearch(query, limit)
        )
    );

    registerHandler("currency:convert", async (_event, amount, from, to) =>
        safeIPC("currency:convert", async () =>
            dataSourcesService.currencyConvert(amount, from, to)
        )
    );

    registerHandler("time:zone", async (_event, zone) =>
        safeIPC("time:zone", async () =>
            dataSourcesService.timeForZone(zone)
        )
    );

    registerHandler("commons:image-search", async (_event, query, limit) =>
        safeIPC("commons:image-search", async () =>
            dataSourcesService.commonsImageSearch(query, limit)
        )
    );

    registerHandler("commons:video-search", async (_event, query, limit) =>
        safeIPC("commons:video-search", async () =>
            dataSourcesService.commonsVideoSearch(query, limit)
        )
    );

    registerHandler("github:search-repos", async (_event, query, limit) =>
        safeIPC("github:search-repos", async () =>
            dataSourcesService.githubRepoSearch(query, limit)
        )
    );

    registerHandler("github:user", async (_event, username) =>
        safeIPC("github:user", async () =>
            dataSourcesService.githubUserInfo(username)
        )
    );

    registerHandler("dbpedia:lookup", async (_event, term) =>
        safeIPC("dbpedia:lookup", async () =>
            dataSourcesService.dbpediaLookup(term)
        )
    );

    registerHandler("geonames:info", async (_event, place) =>
        safeIPC("geonames:info", async () =>
            dataSourcesService.geoNamesInfo(place)
        )
    );

    registerHandler("air:quality", async (_event, city) =>
        safeIPC("air:quality", async () =>
            dataSourcesService.airQuality(city)
        )
    );

    registerHandler("earthquakes:recent", async (_event, minMagnitude, limit) =>
        safeIPC("earthquakes:recent", async () =>
            dataSourcesService.recentEarthquakes(minMagnitude, limit)
        )
    );

    registerHandler("nasa:apod", async () =>
        safeIPC("nasa:apod", async () =>
            dataSourcesService.nasaApod()
        )
    );

    registerHandler("worldbank:indicator", async (_event, countryCode, indicator) =>
        safeIPC("worldbank:indicator", async () =>
            dataSourcesService.worldBankIndicator(countryCode, indicator)
        )
    );

    registerHandler("research:search", async (event, query, limit) => {
        const topic = safeString(query).trim().slice(0, 180);
        return runTrackedBackgroundJob(event, "research", `Research · ${topic || "Search"}`, { query: topic, limit: Number(limit) || 10, source: "openalex" }, async ({ progress, check, signal }) => {
            check(); progress("Searching research papers", 28);
            const result = await dataSourcesService.researchPaperSearch(query, limit, { signal });
            check(); return result;
        });
    });

    registerHandler("crossref:search", async (event, query, limit) => {
        const topic = safeString(query).trim().slice(0, 180);
        return runTrackedBackgroundJob(event, "research", `Crossref · ${topic || "Search"}`, { query: topic, limit: Number(limit) || 10, source: "crossref" }, async ({ progress, check, signal }) => {
            check(); progress("Searching Crossref records", 30);
            const result = await dataSourcesService.crossrefSearch(query, limit, { signal });
            check(); return result;
        });
    });

    registerHandler("anime:search", async (_event, query, limit) =>
        safeIPC("anime:search", async () =>
            dataSourcesService.animeSearch(query, limit)
        )
    );

    registerHandler("anilist:search", async (_event, query, limit) =>
        safeIPC("anilist:search", async () =>
            dataSourcesService.anilistSearch(query, limit)
        )
    );

    registerHandler("food:search", async (_event, query, limit) =>
        safeIPC("food:search", async () =>
            dataSourcesService.foodProductSearch(query, limit)
        )
    );

    registerHandler("gitlab:search", async (_event, query, limit) =>
        safeIPC("gitlab:search", async () =>
            dataSourcesService.gitlabProjectSearch(query, limit)
        )
    );

    registerHandler("npm:package", async (_event, name) =>
        safeIPC("npm:package", async () =>
            dataSourcesService.npmPackageInfo(name)
        )
    );

    registerHandler("pypi:package", async (_event, name) =>
        safeIPC("pypi:package", async () =>
            dataSourcesService.pypiPackageInfo(name)
        )
    );

    registerHandler("stackoverflow:search", async (_event, query, limit) =>
        safeIPC("stackoverflow:search", async () =>
            dataSourcesService.stackOverflowSearch(query, limit)
        )
    );

    registerHandler("hackernews:search", async (_event, query, limit) =>
        safeIPC("hackernews:search", async () =>
            dataSourcesService.hackerNewsSearch(query, limit)
        )
    );

    registerHandler("flights:near", async (_event, lat, lon, radiusDeg) =>
        safeIPC("flights:near", async () =>
            dataSourcesService.flightsNear(lat, lon, radiusDeg)
        )
    );

    registerHandler("dnd:search", async (_event, kind, name) =>
        safeIPC("dnd:search", async () =>
            dataSourcesService.dndSearch(kind, name)
        )
    );

    registerHandler("archive:search", async (_event, query, limit) =>
        safeIPC("archive:search", async () =>
            dataSourcesService.archiveSearch(query, limit)
        )
    );

    registerHandler("globalevents:search", async (_event, query, limit) =>
        safeIPC("globalevents:search", async () =>
            dataSourcesService.globalEventsSearch(query, limit)
        )
    );
}

/* ============================================================
   OFFLINE KNOWLEDGE CACHE IPC
   Lets the renderer browse/search everything Jarvis has already
   learned from the internet (Wikipedia + all dataSources.js
   sources) and see it without any connection, plus basic
   maintenance (size, clear).
============================================================ */

function registerOfflineKnowledgeIPC() {

    registerHandler("knowledge:is-online", async () =>
        safeIPC("knowledge:is-online", async () => ({
            success: true,
            online: await offlineCache.isOnline()
        }))
    );

    registerHandler("knowledge:cache-search", async (_event, query, limit) =>
        safeIPC("knowledge:cache-search", async () => ({
            success: true,
            results: offlineCache.searchLibrary(query, limit)
        }))
    );

    registerHandler("knowledge:cache-stats", async () =>
        safeIPC("knowledge:cache-stats", async () => offlineCache.stats())
    );

    registerHandler("knowledge:structured-stats", async () =>
        safeIPC("knowledge:structured-stats", async () => offlineCache.knowledgeStats())
    );

    registerHandler("knowledge:cache-clear", async () =>
        safeIPC("knowledge:cache-clear", async () => offlineCache.clearCache())
    );
}

/* ============================================================
   MISTAKE-LEARNING IPC
   Jarvis "apni galtiyon se seekhna" — a disk-backed ledger of
   past mistakes + user corrections (see src/services/
   mistakeLearning.js), so the next time a similar question is
   asked, Jarvis uses the corrected answer instead of repeating
   the same mistake.
============================================================ */

function registerMistakeLearningIPC() {

    const setCurrentLearningUser = () =>
        mistakeLearning.setActiveUser(userManager.getActiveUserId() || "guest");

    registerHandler("learning:record-mistake", async (_event, data = {}) =>
        safeIPC("learning:record-mistake", async () => {
            setCurrentLearningUser();
            const userMessage = safeString(data.userMessage).slice(0, 2000);
            const jarvisResponse = safeString(data.jarvisResponse).slice(0, 4000);
            const correction = safeString(data.correction).slice(0, 4000);
            if (!userMessage || !correction) return failure("The question and correction are required.");
            return mistakeLearning.recordMistake({ userMessage, jarvisResponse, correction });
        })
    );

    registerHandler("learning:find-lesson", async (_event, message) =>
        safeIPC("learning:find-lesson", async () => {
            setCurrentLearningUser();
            return mistakeLearning.findLesson(message);
        })
    );

    registerHandler("learning:get-all", async (_event, limit) =>
        safeIPC("learning:get-all", async () => {
            setCurrentLearningUser();
            return mistakeLearning.getAll(limit);
        })
    );

    registerHandler("learning:clear", async () =>
        safeIPC("learning:clear", async () => {
            setCurrentLearningUser();
            return mistakeLearning.clearAll();
        })
    );

    registerHandler("learning:research-once", async (_event, config = {}) =>
        safeIPC("learning:research-once", async () => {
            const topicPool = [
                "octopus intelligence", "how auroras form", "ancient Library of Alexandria",
                "how the James Webb Space Telescope works", "history of the zero numeral",
                "why the Moon has phases", "deep sea hydrothermal vents", "how bees communicate",
                "the Voyager Golden Record", "how semiconductors work", "the history of the Silk Road",
                "how trees exchange nutrients", "the first photograph", "Saturn's rings"
            ];
            const topic = topicPool[Math.floor(Math.random() * topicPool.length)];
            const hasGoogle = Boolean(config.googleApiKey && config.googleCx);
            const message = `JARVIS would like to send the topic “${topic}” to Wikipedia${hasGoogle ? " and Google Custom Search" : ""} to learn one general fact. The result will be saved on this device. Allow this lookup?`;
            const options = {
                type: "question",
                title: "Allow JARVIS to learn online?",
                message,
                detail: "Only this one topic will be searched. JARVIS will ask again before the next lookup.",
                buttons: ["Allow once", "Cancel"],
                defaultId: 1,
                cancelId: 1,
                noLink: true
            };
            const answer = mainWindow && !mainWindow.isDestroyed()
                ? await dialog.showMessageBox(mainWindow, options)
                : await dialog.showMessageBox(options);
            if (answer.response !== 0) return { success: false, denied: true, error: "Online learning was not allowed." };

            let wiki = null;
            let google = null;
            try { wiki = await wikipediaServiceRaw.summary(topic, "en"); } catch (_) {}

            const key = String(config.googleApiKey || "").trim();
            const cx = String(config.googleCx || "").trim();
            if (/^[A-Za-z0-9_-]{20,120}$/.test(key) && /^[A-Za-z0-9_.:-]{5,200}$/.test(cx)) {
                try {
                    const https = require("https");
                    const endpoint = new URL("https://www.googleapis.com/customsearch/v1");
                    endpoint.searchParams.set("key", key);
                    endpoint.searchParams.set("cx", cx);
                    endpoint.searchParams.set("q", topic);
                    endpoint.searchParams.set("num", "1");
                    google = await new Promise((resolve, reject) => {
                        const req = https.get(endpoint, { headers: { "User-Agent": "JARVIS-Local-Assistant/1.0" }, timeout: 8000 }, res => {
                            let raw = "";
                            res.setEncoding("utf8");
                            res.on("data", chunk => { raw += chunk; if (raw.length > 1024 * 1024) req.destroy(new Error("Search response too large.")); });
                            res.on("end", () => {
                                if (res.statusCode !== 200) return reject(new Error(`Google search returned HTTP ${res.statusCode}.`));
                                try { resolve(JSON.parse(raw).items?.[0] || null); } catch { reject(new Error("Google search response was invalid.")); }
                            });
                        });
                        req.on("timeout", () => req.destroy(new Error("Google search timed out.")));
                        req.on("error", reject);
                    });
                } catch (error) { log("[LEARNING] Google lookup unavailable:", getErrorMessage(error)); }
            }

            const wikiContent = safeString(wiki?.extract || wiki?.summary).slice(0, 5000);
            const googleSnippet = safeString(google?.snippet).slice(0, 900);
            const content = [wikiContent, googleSnippet && `Google Search excerpt: ${googleSnippet}`]
                .filter(Boolean).join("\n\n").slice(0, 6000);
            if (!content) return failure("Could not retrieve this fact. Check the connection and try again.");
            const sourceUrl = safeString((wikiContent && wiki?.url) || google?.link) || `https://en.wikipedia.org/wiki/${encodeURIComponent(topic.replace(/ /g, "_"))}`;
            const source = wikiContent ? "Wikipedia" : "Google Custom Search";
            const saved = offlineCache.upsertKnowledge({
                topic,
                content,
                source,
                sourceUrl,
                category: "General knowledge",
                timestamp: new Date().toISOString(),
                confidence: wikiContent ? 0.86 : 0.62,
                verified: false,
                permanent: true
            });
            if (!saved?.success) return failure(saved?.error || "Could not save the researched fact locally.");
            return { success: true, topic, source, content, sourceUrl, saved: saved.action !== "duplicate", action: saved.action };
        })
    );
}

/* ============================================================
   EVOLUTION / FINAL GOAL REGISTRY IPC (Phase 2)
   ============================================================
   Read/update access to the 39-goal registry for the renderer.
   This is intentionally read/update only in Phase 2 — no research,
   no scheduling, no autonomous writes happen here yet. Those are
   later phases (Background Evolution Engine, Phase 4+).
============================================================ */

function registerGoalRegistryIPC() {

    registerHandler("evolution:get-goals", async () =>
        safeIPC("evolution:get-goals", async () =>
            success({ goals: initGoalRegistry().getAll() })
        )
    );

    registerHandler("evolution:get-goal", async (_event, goalId) =>
        safeIPC("evolution:get-goal", async () => {
            const goal = initGoalRegistry().getById(safeString(goalId));
            return goal ? success({ goal }) : failure(`Unknown goalId: ${goalId}`);
        })
    );

    registerHandler("evolution:get-summary", async () =>
        safeIPC("evolution:get-summary", async () =>
            success({ summary: initGoalRegistry().getSummary() })
        )
    );

    registerHandler("evolution:update-goal", async (_event, goalId, updates) =>
        safeIPC("evolution:update-goal", async () => {
            const result = initGoalRegistry().updateGoal(safeString(goalId), updates || {});
            return result.success
                ? success({ goal: result.goal })
                : failure(result.error || "Failed to update goal.");
        })
    );
}

/* ============================================================
   EVOLUTION CHECKPOINT IPC (Phase 3)
   ============================================================
   Read/update/reset access to the single resumable checkpoint.
   "evolution:reset-checkpoint" is a deliberate, explicit action
   (e.g. a future "start evolution over" control) — it is never
   triggered automatically by startup or reload.
============================================================ */

function registerEvolutionCheckpointIPC() {

    registerHandler("evolution:get-checkpoint", async () =>
        safeIPC("evolution:get-checkpoint", async () =>
            success({ checkpoint: initEvolutionCheckpoint().getCheckpoint() })
        )
    );

    registerHandler("evolution:update-checkpoint", async (_event, updates) =>
        safeIPC("evolution:update-checkpoint", async () => {
            const result = initEvolutionCheckpoint().updateCheckpoint(updates || {});
            return result.success
                ? success({ checkpoint: result.checkpoint })
                : failure(result.error || "Failed to update checkpoint.");
        })
    );

    registerHandler("evolution:reset-checkpoint", async () =>
        safeIPC("evolution:reset-checkpoint", async () => {
            const result = initEvolutionCheckpoint().resetCheckpoint();
            return result.success
                ? success({ checkpoint: result.checkpoint })
                : failure("Failed to reset checkpoint.");
        })
    );
}

/* ============================================================
   BACKGROUND EVOLUTION ENGINE IPC (Phase 4)
   ============================================================
   Every handler here goes through the single initEvolutionEngine()
   instance and validates its own input before touching the engine.
   Applying a change is still gated behind the per-session permission
   toggle + an explicit approve on the specific proposal inside the
   engine itself (see EvolutionEngine.approveProposal) — this IPC layer
   adds no separate bypass of that gate.
============================================================ */

function registerEvolutionEngineIPC() {

    registerHandler("evolution:get-state", async () =>
        safeIPC("evolution:get-state", async () =>
            success({ state: initEvolutionEngine().getState() })
        )
    );

    registerHandler("evolution:start", async () =>
        safeIPC("evolution:start", async () => {
            // Phase 5: start() now performs read-only research (Wikipedia /
            // Wikidata via MultiSourceResearchProvider) before a proposal is
            // built, so it must be awaited rather than called synchronously.
            const result = await initEvolutionEngine().start();
            return result.success ? success(result) : failure(result.error || "Failed to start evolution cycle.");
        })
    );

    registerHandler("evolution:pause", async () =>
        safeIPC("evolution:pause", async () => {
            const result = initEvolutionEngine().pause();
            return result.success ? success(result) : failure(result.error || "Failed to pause.");
        })
    );

    registerHandler("evolution:resume", async () =>
        safeIPC("evolution:resume", async () => {
            const result = initEvolutionEngine().resume();
            return result.success ? success(result) : failure(result.error || "Failed to resume.");
        })
    );

    registerHandler("evolution:enable-permission", async () =>
        safeIPC("evolution:enable-permission", async () =>
            success(initEvolutionEngine().enableSessionPermission())
        )
    );

    registerHandler("evolution:disable-permission", async () =>
        safeIPC("evolution:disable-permission", async () =>
            success(initEvolutionEngine().disableSessionPermission())
        )
    );

    registerHandler("evolution:approve-proposal", async (_event, proposalId) =>
        safeIPC("evolution:approve-proposal", async () => {
            const result = initEvolutionEngine().approveProposal(safeString(proposalId));
            return result.success ? success(result) : failure(result.error || "Failed to approve proposal.");
        })
    );

    registerHandler("evolution:reject-proposal", async (_event, proposalId, reason) =>
        safeIPC("evolution:reject-proposal", async () => {
            const result = initEvolutionEngine().rejectProposal(safeString(proposalId), safeString(reason));
            return result.success ? success(result) : failure(result.error || "Failed to reject proposal.");
        })
    );

    registerHandler("evolution:get-proposals", async () =>
        safeIPC("evolution:get-proposals", async () =>
            success({ proposals: initEvolutionEngine().getProposals() })
        )
    );

    registerHandler("evolution:get-history", async () =>
        safeIPC("evolution:get-history", async () =>
            success({ history: initEvolutionEngine().getHistory() })
        )
    );
}

/* ============================================================
   SUGGESTION ENGINE IPC
   Jarvis proactively suggests useful next things to ask, based
   on the current conversation and time of day (see
   src/services/suggestionEngine.js). Pure text-pattern logic,
   no network calls, so it works fully offline too.
============================================================ */

function registerSuggestionsIPC() {

    registerHandler("suggestions:get", async (_event, context = {}) =>
        safeIPC("suggestions:get", async () =>
            suggestionEngine.getSuggestions(context)
        )
    );
}

/* ============================================================
   REGISTER ALL IPC
============================================================ */

function registerAIIPC() {
    registerHandler("ai:ask", async (event, message, context = {}) => {
        const text = safeString(message);
        if (!text) return failure("Message is required.");
        if (!context || typeof context !== "object") context = {};

        // Serialize concurrent requests instead of letting them race
        // against shared chatHistory/memory/consciousness state, and
        // instead of silently dropping the second one.
        const requestID = safeString(context.requestID);
        const requestContext = {
            ...context,
            onReplyToken: requestID && event?.sender && !event.sender.isDestroyed()
                ? (token) => {
                    if (!event.sender.isDestroyed()) event.sender.send("ai:reply-token", {
                        requestID,
                        source: safeString(context.source),
                        token
                    });
                }
                : undefined
        };
        return enqueueAIRequest(() => handleAIAsk(text, requestContext));
    });

    registerHandler("presentations:create", async (event, topicInput, options = {}) => {
        const jobTopic = safeString(topicInput).trim().slice(0, 120);
        let slideCount;
        try { slideCount = validateSlideCount(options?.slideCount ?? 10); }
        catch (error) { return failure(error.message); }
        const requestedImageCount = Number.isInteger(Number(options?.imageCount)) && Number(options.imageCount) > 0
            ? Math.min(30, Number(options.imageCount)) : 0;
        const userRequest = safeString(options?.userRequest).trim().slice(0, 1200);
        const designPreferences = Array.isArray(options?.designPreferences)
            ? options.designPreferences.map(value => safeString(value).trim().slice(0, 48)).filter(Boolean).slice(0, 6) : [];
        console.info("[PRESENTATION] Existing generator route accepted request", {
            topic: jobTopic, slideCount, requestedImageCount,
            wantsImages: options?.wantsImages === true, designPreferences
        });
        const language = /^(hi|hinglish|en)$/i.test(String(options?.language || "")) ? String(options.language).toLowerCase() : "en";
        const previousJob = options?.resumeJobId ? backgroundJobs.get(String(options.resumeJobId)) : null;
        const savedCheckpoint = previousJob?.type === "presentation" && previousJob?.payload?.checkpoint?.stage === "deck-ready" ? previousJob.payload.checkpoint : null;
        const job = createBackgroundJob("presentation", `Create PPT · ${jobTopic || "Untitled"}`, { topic: jobTopic, options: { slideCount, language, ...(requestedImageCount ? { imageCount: requestedImageCount } : {}) }, ...(savedCheckpoint ? { checkpoint: savedCheckpoint } : {}) });
        updateBackgroundJob(job.id, { state: "running", progress: 2, stage: "Starting" });
        return safeIPC("presentations:create", async () => {
        const topic = safeString(topicInput).trim().slice(0, 120);
        if (!topic) return failure("Tell JARVIS what the presentation should cover.");
        let usedLocalFallback = false;
        let localFallbackMode = "";
        let deck = null;
        const sendProgress = stage => {
            assertBackgroundJobActive(job.id);
            const normalized = String(stage || "Working");
            const percent = /completed/i.test(normalized) ? 100 : /verif|saving|opening|creating/i.test(normalized) ? 88 : /image|visual|embedded/i.test(normalized) ? 55 : /generat|content|outline/i.test(normalized) ? 20 : 5;
            updateBackgroundJob(job.id, { state: "running", progress: percent, stage: normalized });
            try {
                if (event?.sender && !event.sender.isDestroyed()) event.sender.send("presentations:progress", { stage: normalized, topic, slideCount, jobId: job.id });
            } catch (error) { console.warn("[PRESENTATION] Could not publish progress:", error?.message || error); }
        };
        const checkpoint = job.payload.checkpoint;
        if (checkpoint?.stage === "deck-ready") {
            try {
                deck = validateDeck(checkpoint.deck, slideCount);
                usedLocalFallback = Boolean(checkpoint.usedLocalFallback);
                localFallbackMode = String(checkpoint.localFallbackMode || "");
                sendProgress("Resuming from saved slide content and image checkpoint");
            } catch (error) {
                console.warn("[PRESENTATION] Saved checkpoint is invalid; restarting from the request:", error?.message || error);
                deck = null;
                delete job.payload.checkpoint;
                updateBackgroundJob(job.id, { payload: job.payload });
            }
        }
        if (deck) deck.language = language;
        if (!deck) {
        sendProgress("Understanding request");
        const source = options?.source && typeof options.source === "object" ? options.source : {};
        const sourceTitle = safeString(source.title).trim().slice(0, 120);
        const sourceExtract = safeString(source.extract).trim().slice(0, 9000);
        const sourceCitations = Array.isArray(source.sources) ? source.sources.slice(0, 8).flatMap(item => {
            if (!item || typeof item !== "object") return [];
            let parsed;
            try { parsed = new URL(String(item.url || "")); } catch (_) { return []; }
            if (parsed.protocol !== "https:") return [];
            return [{ title: safeString(item.title || item.source || "Research source").trim().slice(0, 160), url: parsed.href.slice(0, 500) }];
        }) : [];
        let sourceUrl = "";
        let sourceThumbnail = "";
        try {
            const parsedSourceUrl = new URL(String(source.url || ""));
            if (parsedSourceUrl.protocol === "https:" && /(^|\.)wikipedia\.org$/i.test(parsedSourceUrl.hostname)) sourceUrl = parsedSourceUrl.href.slice(0, 500);
        } catch (_) { /* Ignore untrusted or malformed source links. */ }
        try {
            const parsedThumbnail = new URL(String(source.thumbnail || ""));
            const ext = path.extname(parsedThumbnail.pathname).toLowerCase();
            if (parsedThumbnail.protocol === "https:" && parsedThumbnail.hostname.toLowerCase() === "upload.wikimedia.org" && /^\/wikipedia\/(?:commons|en|hi)\//i.test(parsedThumbnail.pathname) && [".jpg", ".jpeg", ".png"].includes(ext)) {
                sourceThumbnail = parsedThumbnail.href.slice(0, 1200);
            }
        } catch (_) { /* A missing or unsupported thumbnail is fine. */ }

        const contentSlideCount = slideCount - 1;
        const messages = [
            {
                role: "system",
                content: [
                    "Create a premium, professional presentation with a restrained futuristic visual style as strict JSON only, with no markdown fences or commentary.",
                    "Return strict JSON with this schema: {\"title\":string,\"subtitle\":string,\"slides\":[{\"title\":string,\"points\":[string,string,string],\"layout\":\"feature|process|comparison|grid|takeaway|chart\",\"visualCue\":string,\"callout\":string,\"leftTitle\":string,\"rightTitle\":string,\"chart\":null|{\"type\":\"bar|line|doughnut\",\"title\":string,\"labels\":[string,string],\"values\":[number,number],\"source\":string},\"notes\":string}] }.",
                    `Write exactly ${contentSlideCount} content slides. The generated deck adds one title slide, for exactly ${slideCount} total. Build a board-ready story, not a repeated list: orient the audience, explain how the subject works, compare meaningful options, show a process where useful, apply it to real situations, and finish with a clear takeaway. Give every slide a takeaway-style heading and 2 to 4 short, concrete, accurate points. Each point should communicate useful information, not instructions to the audience or generic filler. Select the best layout per slide from feature (photo and concise explanation), grid (organized concepts), process (ordered steps), comparison (two genuinely comparable sides with leftTitle/rightTitle), takeaway (one strong callout with supporting facts), or chart (only for sourced comparable numeric data). Vary layouts where the content supports it; never force a chart or comparison. Use a short, distinct visualCue of 3 to 8 concrete nouns naming both the image subject and visible scene on that specific slide. Avoid vague cues such as only “school”, “technology”, “people”, “history”, or “product”. For school topics, select varied real scenes where appropriate: school exterior, active classroom, teacher and students, science lab, library, computer room, or sports ground. Use official product logos or genuine interface screenshots for software, real product photos for devices, and authentic in-game or subject-specific imagery for other topics. For physical objects, request realistic studio photographs or photorealistic three-quarter product renders that clearly show the object; for Minecraft and other games, name the actual in-game assets and environments for each slide. For process slides, prefer a relevant animated GIF where an openly licensed one exists; otherwise use a clear still image. Never use clipart, generic images, invented metrics, or unsupported claims. Include a chart only if its values are explicitly supported by the supplied source extract, and state that source. Add short presenter notes when they clarify the slide. Keep the language natural, readable and age-appropriate. No slogans, markdown or text outside JSON.`,
                    sourceExtract ? `Use these retrieved research extracts as the factual source. Cite the supplied source references in slide notes. Do not add unsupported exact dates, version numbers, or statistics. If an extract does not support a detail, omit it.\nSource title: ${sourceTitle || topic}\nResearch extracts: ${sourceExtract}` : "Use stable, widely established facts only. If a detail is uncertain or time-sensitive, leave it out rather than guess.",
                    language === "hi" ? "Write all slide copy in natural Hindi using Devanagari." : language === "hinglish" ? "Write all slide copy in natural Hindi/Hinglish, matching the user's mixed-language request." : "Write all slide copy in clear English."
                ].join("\n")
            },
            { role: "user", content: `Create a production-ready, professional presentation about: ${topic}. Make the deck useful to its intended audience even though this is the user's entire prompt. Infer a sensible audience and scope from the topic. Use a clean editorial layout with a light canvas, strong typography, concise facts, generous spacing, varied but consistent slides, and relevant photographic or product imagery. Include a specific, slide-specific image search cue on every slide, including the cover. Choose each slide's layout for its content. Use actual chart data only when the supplied source extract supports every value; otherwise use a comparison, process, annotated concepts, or other non-numeric layout. For software products show authentic official logos or interface imagery. For physical objects, request a sharp real photograph or photorealistic 3D render with a clear three-quarter view, never cartoon art. For process slides, request suitable animated imagery when available. ${designPreferences.length ? `Follow these requested design preferences where they fit: ${designPreferences.join(", ")}.` : ""} ${userRequest ? `Preserve applicable topic, image, slide-count and style requirements from this quoted user command: ${JSON.stringify(userRequest)}` : ""} Return only the requested JSON.` }
        ];
        sendProgress("Generating slide content");
        const generationOptions = {
            temperature: 0.35,
            numPredict: Math.min(8000, 1200 + contentSlideCount * 260),
            maxTokens: Math.min(8000, 1200 + contentSlideCount * 260),
            numContext: 12288,
            reasoningEffort: null,
            responseFormat: { type: "json_object" },
            timeoutMs: 180000,
            signal: backgroundJobSignal(job.id)
        };
        const generateLocally = async () => {
            const localStatus = await ollamaClient.getStatus({ force: true });
            if (!localStatus?.running || !localStatus?.selectedModel) {
                return { success: false, error: localStatus?.error || "Ollama is not running with an installed model. Start Ollama and install a model, then try again." };
            }
            const restoreDisconnectedState = localStatus.enabled !== true;
            if (restoreDisconnectedState) ollamaClient.setEnabled(true);
            try { return await ollamaClient.chat(messages, generationOptions); }
            finally { if (restoreDisconnectedState) ollamaClient.setEnabled(false); }
        };
        const generateLocalOutline = () => {
            const learned = offlineCache.findRelevantKnowledge(topic, Math.max(8, contentSlideCount * 2));
            const sourceText = [sourceExtract, ...learned.map(item => item.content)].filter(Boolean).join(" ");
            const facts = sourceText
                .split(/(?<=[.!?।])\s+|\n+/u)
                .map(value => value.trim().replace(/\s+/g, " "))
                .filter(value => value.length >= 35)
                .slice(0, 80);
                // Do not label a generic outline as a completed topic deck.
                // Every generated content point must come from usable local
                // knowledge when both remote providers are unavailable.
                if (facts.length < contentSlideCount * 2) {
                    return {
                        success: false,
                        error: `JARVIS could not find enough topic-specific information to create a reliable ${slideCount}-slide presentation about ${topic}. Check the selected AI provider and retry.`
                    };
                }
            const englishTitles = ["Overview", "Background", "Core ideas", "How it works", "Key features", "Examples", "Uses and impact", "Benefits and limits", "What to remember"];
            const hindiTitles = ["परिचय", "पृष्ठभूमि", "मुख्य विचार", "यह कैसे काम करता है", "मुख्य विशेषताएँ", "उदाहरण", "उपयोग और प्रभाव", "लाभ और सीमाएँ", "मुख्य बातें"];
            const englishFallbackPoints = [
                [`Define ${topic} and set its scope.`, `Explain why this topic matters to its audience.`],
                [`Summarize the background and context of ${topic}.`, `Identify the questions that help explain it.`],
                [`Introduce the main ideas or parts of ${topic}.`, `Show how those ideas relate to one another.`],
                [`Describe the main process or principles involved.`, `Use a simple example to make the process clear.`],
                [`Highlight the features that distinguish ${topic}.`, `Connect each feature to a practical effect.`],
                [`Choose examples that represent different parts of ${topic}.`, `Explain what each example helps the audience understand.`],
                [`Describe where ${topic} is used or encountered.`, `Explain who is affected and in what way.`],
                [`Weigh the useful outcomes alongside the limitations.`, `Separate verified evidence from open questions.`],
                [`Restate the central idea in one sentence.`, `List the most useful points for further learning.`]
            ];
            const hindiFallbackPoints = [
                [`${topic} की परिभाषा और इसका दायरा बताइए।`, `समझाइए कि यह विषय अपने पाठकों के लिए क्यों मायने रखता है।`],
                [`${topic} की पृष्ठभूमि और संदर्भ का सार दें।`, `इसे समझने में मदद करने वाले मुख्य सवाल पहचानें।`],
                [`${topic} के मुख्य विचार या हिस्से बताइए।`, `दिखाइए कि ये विचार एक-दूसरे से कैसे जुड़े हैं।`],
                [`इसमें शामिल मुख्य प्रक्रिया या सिद्धांत समझाइए।`, `प्रक्रिया स्पष्ट करने के लिए एक सरल उदाहरण दें।`],
                [`${topic} की अलग पहचान बनाने वाली विशेषताएँ बताइए।`, `हर विशेषता को उसके व्यावहारिक असर से जोड़ें।`],
                [`${topic} के अलग-अलग हिस्सों को दिखाने वाले उदाहरण चुनें।`, `बताइए कि हर उदाहरण से क्या समझ आता है।`],
                [`बताइए कि ${topic} का उपयोग कहाँ होता है।`, `समझाइए कि किस पर और कैसे असर पड़ता है।`],
                [`इसके उपयोगी नतीजों और सीमाओं, दोनों को रखें।`, `सत्यापित जानकारी और खुले सवालों को अलग रखें।`],
                [`मुख्य विचार को एक वाक्य में दोहराएँ।`, `आगे सीखने के लिए सबसे उपयोगी बातें सूचीबद्ध करें।`]
            ];
            const titles = language === "hi" ? hindiTitles : englishTitles;
            const slides = Array.from({ length: contentSlideCount }, (_, index) => {
                const fallbackPoints = (language === "hi" ? hindiFallbackPoints : englishFallbackPoints)[index % englishFallbackPoints.length];
                const points = [facts[index * 2] || fallbackPoints[0], facts[index * 2 + 1] || fallbackPoints[1]];
                return { title: titles[index % titles.length], points, notes: "Generated with JARVIS local knowledge because the online and Ollama providers were unavailable." };
            });
            const title = language === "hi" ? `${topic} का परिचय` : topic;
            return {
                success: true,
                text: JSON.stringify({ title, subtitle: language === "hi" ? "JARVIS की उपलब्ध स्थानीय जानकारी पर आधारित" : "Prepared from information available locally on this device", slides }),
                model: "JARVIS local knowledge",
                usedLocalFallback: true
            };
        };
        const generate = async () => {
            if (usedLocalFallback) {
                if (localFallbackMode === "ollama") return generateLocally();
                return generateLocalOutline();
            }

            // Use the provider selected in Settings for the artifact draft.
            let remoteResult;
            try { remoteResult = await chatSelectedProvider(messages, generationOptions); }
            catch (error) { remoteResult = { success: false, error: error?.message || "The selected AI provider request failed." }; }
            assertBackgroundJobActive(job.id);
            if (remoteResult?.success && remoteResult.text) return remoteResult;

            // Any unavailable Sarvam endpoint, credential, or service error
            // falls through to Ollama. If Ollama is missing too, JARVIS uses
            // its local learned knowledge and deterministic deck composer.
            let localStatus;
            try { localStatus = await ollamaClient.getStatus({ force: true }); }
            catch (error) { localStatus = { running: false, error: error?.message || "Ollama status could not be checked." }; }
            if (localStatus?.running && localStatus?.selectedModel) {
                sendProgress(`Selected AI unavailable · using local model ${localStatus.selectedModel}`);
                const localResult = await generateLocally();
                assertBackgroundJobActive(job.id);
                if (localResult?.success && localResult.text) {
                    usedLocalFallback = true;
                    localFallbackMode = "ollama";
                    return { ...localResult, usedLocalFallback: true };
                }
                console.warn("[PRESENTATION] Ollama fallback failed:", localResult?.error || "empty reply");
            }

            usedLocalFallback = true;
            localFallbackMode = "jarvis-local";
            sendProgress("Selected AI unavailable · using JARVIS local knowledge");
            return generateLocalOutline();
        };
        let aiResult = await generate();
        if (!aiResult?.success || typeof aiResult.text !== "string") {
            return failure(aiResult?.error || "The selected AI provider could not draft the presentation. Check its connection in JARVIS settings.");
        }

        const parseOutline = result => {
            let raw = result.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
            const firstBrace = raw.indexOf("{");
            const lastBrace = raw.lastIndexOf("}");
            if (firstBrace >= 0 && lastBrace > firstBrace) raw = raw.slice(firstBrace, lastBrace + 1);
            try {
                const outline = JSON.parse(raw);
                console.log("[PRESENTATION] Outline structure", { hasTitle: !!outline?.title, contentSlides: Array.isArray(outline?.slides) ? outline.slides.length : null, expectedContentSlides: contentSlideCount });
                return outline;
            }
            catch (_) { throw new Error("The selected AI returned an unreadable slide outline."); }
        };
                try { deck = validateDeck({ ...parseOutline(aiResult), sourceTitle, sourceUrl, sourceCitations, language }, slideCount); }
        catch (firstError) {
            sendProgress("Correcting slide outline to match requested count");
            messages.push({ role: "assistant", content: aiResult.text });
            messages.push({ role: "user", content: `Correct the previous response and return valid JSON only. Include exactly ${contentSlideCount} content slides. Each needs a clear takeaway heading, 2 to 4 useful factual points, one layout from feature/process/comparison/grid/takeaway/chart, and a different concise authentic topic-specific visualCue. Use a chart only if every value and its source are explicitly supported by the supplied extract. Do not invent facts or numbers. No markdown or explanation.` });
            aiResult = await generate();
            if (!aiResult?.success || typeof aiResult.text !== "string") return failure(aiResult?.error || firstError.message);
                try { deck = validateDeck({ ...parseOutline(aiResult), sourceTitle, sourceUrl, sourceCitations, language }, slideCount); }
            catch (error) { return failure(error?.message || firstError.message); }
        }

        // Add and persist relevant topic imagery. Saved images are loaded
        // before searching, so repeat decks reuse the on-device library.
        let selectedVisualCount = 0;
        const imageDiagnostics = [];
        try {
            // Honor an explicit visual target by searching every supported
            // slide when requested; the generator places one image per slide.
            const allImageTargets = buildPresentationImageTargets(deck, deck.slides.length, topic);
            const defaultImageBudget = Math.min(deck.slides.length, 5, Math.max(4, Math.ceil(deck.slides.length * 0.5)));
            const imageBudget = Math.min(deck.slides.length, requestedImageCount || defaultImageBudget);
            const imageTargets = buildPresentationImageTargets(deck, imageBudget, topic);
            const imageCacheDirectory = path.join(app.getPath("userData"), "jarvis_offline_cache", "presentation-image-library");
            const imageKey = String(topic || deck.title).trim();
            const cachedVisuals = getCachedPresentationImages(imageCacheDirectory, imageKey, allImageTargets);
            const cachedTargetIds = new Set(cachedVisuals.map(item => item.target.kind === "cover" ? "cover" : `slide-${item.target.index}`));
            const missingTargets = imageTargets.filter(target => !cachedTargetIds.has(target.kind === "cover" ? "cover" : `slide-${target.index}`));
            let selectedImages = [];
            // Per slide: configured Google image search -> Openverse ->
            // Wikimedia Commons -> Pexels. A text-only deck is blocked below.
            if (missingTargets.length) {
                sendProgress("Finding relevant images");
                const searchOneTarget = async target => {
                    // Search by the slide's concrete visual cue first. A broad
                    // title-only query often returns logos or no useful art.
                    const query = target.searchQueries?.[0] || target.searchQueries?.[1] || target.query || imageKey;
                    let found = [];
                    try {
                        const result = await presentationImageSearch.searchImages(query, { limit: 10, query, topic, visualCue: target.visualCue || target.query, signal: backgroundJobSignal(job.id) });
                        found = Array.isArray(result?.images) ? result.images : [];
                        if (!found.length) {
                            const reason = result?.error || "image search returned no eligible results";
                            imageDiagnostics.push(`${query}: ${reason}`);
                            console.warn(`[PRESENTATION] No usable images for ${target.kind === "cover" ? "cover" : `slide ${Number(target.index) + 1}`} (${query}):`, reason);
                        }
                    } catch (error) {
                        imageDiagnostics.push(`${query}: ${error?.message || error}`);
                        console.warn(`[PRESENTATION] Image lookup failed for "${query}":`, error?.message || error);
                    }
                    const seen = new Set();
                    return { success: found.length > 0, images: found.filter(image => {
                        const url = String(image?.thumbUrl || image?.url || "");
                        if (!url || seen.has(url)) return false;
                        seen.add(url);
                        return true;
                    }) };
                };
                const imageSearches = [];
                // Wikimedia and custom search endpoints throttle large decks
                // when every slide fires simultaneously. Keep the requests
                // bounded so the API can return usable thumbnails reliably.
                for (let offset = 0; offset < missingTargets.length; offset += 4) {
                    imageSearches.push(...await Promise.all(missingTargets.slice(offset, offset + 4).map(searchOneTarget)));
                }
                selectedImages = choosePresentationImages(missingTargets, imageSearches)
                    .map(item => ({ ...item, imageUrl: String(item.image.thumbUrl || item.image.url || "") }));
                const selectedTargetIds = new Set(selectedImages.map(item => item.target.kind === "cover" ? "cover" : `slide-${item.target.index}`));
                const unresolvedTargets = missingTargets.filter(target => !selectedTargetIds.has(target.kind === "cover" ? "cover" : `slide-${target.index}`));
                if (unresolvedTargets.length) {
                    // Retry only slides that still lack an image, using the
                    // alternate cue/title searches rather than duplicating a
                    // successful slide's image.
                    const recoverOneTarget = async target => {
                        // One alternate, slide-specific query is enough. Three
                        // sequential retries per missing slide made weak search
                        // results turn into a long multi-minute presentation job.
                        const recoveryQuery = String(target.searchQueries?.[1] || `${topic} ${target.visualCue || target.query}`).slice(0, 120);
                        try {
                            const result = await presentationImageSearch.searchImages(recoveryQuery, { limit: 10, query: recoveryQuery, topic, visualCue: target.visualCue || target.query, signal: backgroundJobSignal(job.id) });
                            const found = Array.isArray(result?.images) ? result.images : [];
                            if (!found.length) imageDiagnostics.push(`${recoveryQuery}: ${result?.error || "image search returned no eligible results"}`);
                            return { success: found.length > 0, images: found };
                        } catch (error) {
                            imageDiagnostics.push(`${recoveryQuery}: ${error?.message || error}`);
                            return { success: false, images: [] };
                        }
                    };
                    const recoverySets = [];
                    for (let offset = 0; offset < unresolvedTargets.length; offset += 4) {
                        recoverySets.push(...await Promise.all(unresolvedTargets.slice(offset, offset + 4).map(recoverOneTarget)));
                    }
                    const combinedTargets = [...missingTargets];
                    const combinedSets = missingTargets.map((target, index) => ({ success: imageSearches[index]?.success, images: [...(imageSearches[index]?.images || []), ...(recoverySets[unresolvedTargets.findIndex(candidate => candidate === target)]?.images || [])] }));
                    selectedImages = choosePresentationImages(combinedTargets, combinedSets)
                        .map(item => ({ ...item, imageUrl: String(item.image.thumbUrl || item.image.url || "") }));
                }
            }
            // Wikipedia has already resolved this exact subject and often
            // supplies a matching article image. Use it for the cover when
            // Commons/Google has no acceptable result.
            const hasCoverVisual = [...cachedVisuals, ...selectedImages].some(item => item.target?.kind === "cover");
            if (sourceThumbnail && !hasCoverVisual) {
                const coverTarget = missingTargets.find(target => target.kind === "cover") || imageTargets.find(target => target.kind === "cover");
                if (coverTarget) {
                    const ext = path.extname(new URL(sourceThumbnail).pathname).toLowerCase();
                    selectedImages.push({
                        target: coverTarget,
                        imageUrl: sourceThumbnail,
                        image: { url: sourceThumbnail, thumbUrl: sourceThumbnail, mime: ext === ".png" ? "image/png" : "image/jpeg", title: sourceTitle || topic, sourceUrl, provider: "Wikipedia" }
                    });
                }
            }
            const cacheImageTarget = async item => {
                try {
                    const reportImageDownloadError = error => imageDiagnostics.push(`${item.image?.title || item.target?.query}: download failed (${error?.message || error})`);
                    const originalImageUrl = String(item.image?.url || "");
                    const candidateUrls = [...new Set([String(item.imageUrl || ""), originalImageUrl].filter(Boolean))];
                    let localPath = "";
                    let actualExtension = "";
                    for (const candidateUrl of candidateUrls) {
                        const declaredMime = String(item.image.mime || "").toLowerCase();
                        const declaredExtension = declaredMime === "image/png" ? ".png" : declaredMime === "image/gif" ? ".gif" : ".jpg";
                        const cached = await offlineCache.cacheImage(candidateUrl, { maxBytes: 12 * 1024 * 1024, extension: declaredExtension, signal: backgroundJobSignal(job.id), onError: reportImageDownloadError });
                        if (!cached?.localPath || !fs.existsSync(cached.localPath)) continue;
                        const stat = fs.statSync(cached.localPath);
                        if (!stat.isFile() || stat.size < 3000 || stat.size > 12 * 1024 * 1024) continue;
                        const fd = fs.openSync(cached.localPath, "r");
                        const head = Buffer.alloc(8);
                        try { fs.readSync(fd, head, 0, 8, 0); } finally { fs.closeSync(fd); }
                        const validJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
                        const validPng = head.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
                        const validGif = /^GIF8[79]a$/.test(head.subarray(0, 6).toString("ascii"));
                        if (!validJpeg && !validPng && !validGif) {
                            imageDiagnostics.push(`${item.image?.title || item.target?.query}: downloaded file was not JPEG/PNG/GIF`);
                            continue;
                        }
                        actualExtension = validPng ? ".png" : validGif ? ".gif" : ".jpg";
                        localPath = cached.localPath;
                        if (path.extname(localPath).toLowerCase() !== actualExtension) {
                            const crypto = require("crypto");
                            const downloadsDirectory = path.join(imageCacheDirectory, "downloads");
                            fs.mkdirSync(downloadsDirectory, { recursive: true });
                            const identifier = crypto.createHash("sha1").update(`${candidateUrl}|${item.target.kind}|${item.target.index ?? "cover"}`).digest("hex");
                            const correctedPath = path.join(downloadsDirectory, `${identifier}${actualExtension}`);
                            fs.copyFileSync(localPath, correctedPath);
                            localPath = correctedPath;
                        }
                        break;
                    }
                    if (!localPath) {
                        console.warn(`[PRESENTATION] Image download did not produce a local file for ${item.target?.kind === "cover" ? "cover" : `slide ${Number(item.target?.index) + 1}`}.`);
                        return null;
                    }
                    const image = item.image;
                    const creator = image.creator || image.artist || "";
                    const attribution = [
                        creator ? `Author: ${creator}` : "",
                        image.license ? `License: ${image.license}` : "",
                        image.sourceUrl ? `Source: ${image.sourceUrl}` : "",
                        image.licenseUrl ? `License terms: ${image.licenseUrl}` : ""
                    ].filter(Boolean).join("\n");
                    const imageAttribution = image.provider === "Pexels"
                        ? `Photo by ${creator || "Pexels contributor"} · Pexels`
                        : creator ? `${creator} · ${image.license || image.provider} · ${image.provider}` : `${image.provider}${image.license ? ` · ${image.license}` : ""}`;
                    const visual = { target: item.target, imagePath: localPath, imageTitle: image.title || item.target.query, imageCredit: attribution, imageAttribution, imageSourceUrl: image.sourceUrl || "", imageRelevanceScore: Number.isFinite(item.score) ? item.score : null };
                    const saved = cachePresentationImage(imageCacheDirectory, imageKey, visual);
                    return saved || visual;
                } catch (error) {
                    console.warn(`[PRESENTATION] Could not download image for ${item.target?.kind === "cover" ? "cover" : `slide ${Number(item.target?.index) + 1}`}:`, error?.message || error);
                    return null;
                }
            };
            let cachedImages = await Promise.all(selectedImages.map(cacheImageTarget));
            let allVisuals = [...cachedVisuals, ...cachedImages.filter(Boolean)];
            const minContentImages = Math.min(deck.slides.length, imageBudget, Math.ceil(deck.totalSlides * 0.5));
            const contentImageIndexes = new Set(allVisuals.filter(item => item.target?.kind === "slide").map(item => Number(item.target.index)));
            const fallbackTargets = allImageTargets.filter(target => target.kind === "slide" && !contentImageIndexes.has(Number(target.index)));
            const neededFallbacks = Math.max(0, minContentImages - contentImageIndexes.size);
            if (neededFallbacks && fallbackTargets.length) {
                sendProgress(`Finding images for ${neededFallbacks} more slides`);
                const fallbackSearchTargets = Array.from({ length: Math.min(neededFallbacks, fallbackTargets.length) }, (_, index) => {
                    const spreadIndex = Math.round(index * (fallbackTargets.length - 1) / Math.max(1, Math.min(neededFallbacks, fallbackTargets.length) - 1));
                    return fallbackTargets[spreadIndex];
                });
                const fallbackSets = [];
                for (let offset = 0; offset < fallbackSearchTargets.length; offset += 4) {
                    fallbackSets.push(...await Promise.all(fallbackSearchTargets.slice(offset, offset + 4).map(async target => {
                        const query = target.searchQueries?.[0] || target.query || imageKey;
                        try {
                            const result = await presentationImageSearch.searchImages(query, { limit: 10, query, topic, visualCue: target.visualCue || query, signal: backgroundJobSignal(job.id) });
                            return { success: Boolean(result?.images?.length), images: Array.isArray(result?.images) ? result.images : [] };
                        } catch (error) {
                            imageDiagnostics.push(`${query}: ${error?.message || error}`);
                            return { success: false, images: [] };
                        }
                    })));
                }
                const usedImageUrls = [...selectedImages.flatMap(item => [item.imageUrl, item.image?.url, item.image?.thumbUrl]), ...cachedVisuals.map(item => item.imageSourceUrl)].filter(Boolean);
                const extraImages = choosePresentationImages(fallbackSearchTargets, fallbackSets, usedImageUrls)
                    .slice(0, neededFallbacks)
                    .map(item => ({ ...item, imageUrl: String(item.image.thumbUrl || item.image.url || "") }));
                const extraVisuals = (await Promise.all(extraImages.map(cacheImageTarget))).filter(Boolean);
                cachedImages = [...cachedImages, ...extraVisuals];
                allVisuals = [...cachedVisuals, ...cachedImages.filter(Boolean)];
            }
            selectedVisualCount = allVisuals.length;
            const contentImageCount = allVisuals.filter(item => item.target?.kind === "slide").length;
            console.info(`[PRESENTATION] Found ${contentImageCount} slide images plus cover imagery for ${deck.totalSlides} slides.`);
            for (const visual of allVisuals) {
                if (visual.target.kind === "cover") deck.coverImage = visual;
                else deck.slides[visual.target.index] = { ...deck.slides[visual.target.index], ...visual };
            }
            const missingVisuals = allImageTargets.filter(target => {
                if (target.kind === "cover") return !deck.coverImage?.imagePath;
                return !deck.slides[target.index]?.imagePath;
            });
            if (missingVisuals.length) {
                const missingLabels = missingVisuals.map(target => target.kind === "cover" ? "cover" : `slide ${target.index + 2}`).join(", ");
                console.warn(`[PRESENTATION] ${selectedVisualCount}/${imageTargets.length} slide visuals were downloaded. Text layout will fill slides without images: ${missingLabels}.`, imageDiagnostics.slice(0, 3));
            }
            sendProgress(`Embedded ${contentImageCount} topic images; filling remaining slides`);
        } catch (error) {
            console.warn("[PRESENTATION] Image search/cache pipeline failed:", error?.message || error);
            sendProgress("Image search unavailable; continuing with a text-first layout");
        }

        // Save the validated outline and downloaded image paths before the
        // local PPTX write/render steps. A restart can resume from here without
        // repeating paid AI generation or image searches.
        job.payload.checkpoint = { stage: "deck-ready", deck, usedLocalFallback, localFallbackMode, savedAt: Date.now() };
        updateBackgroundJob(job.id, { payload: job.payload, progress: 70, stage: "Safe checkpoint saved · presentation content and visuals" });
        }

        const outputTarget = resolvePresentationOutputDirectory(options?.userRequest || topic, {
            documents: app.getPath("documents"),
            downloads: app.getPath("downloads"),
            desktop: app.getPath("desktop")
        }, options?.outputLocation);
        const outputDirectory = outputTarget.directory;
        fs.mkdirSync(outputDirectory, { recursive: true });
        const baseName = deck.title.normalize("NFKC").replace(/[^\p{L}\p{N} _-]/gu, "").trim().replace(/\s+/g, "-").slice(0, 64) || "Presentation";
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        let outputPath = path.join(outputDirectory, `${baseName}-${stamp}.pptx`);
        let suffix = 1;
        while (fs.existsSync(outputPath)) outputPath = path.join(outputDirectory, `${baseName}-${stamp}-${suffix++}.pptx`);
        sendProgress("Creating PowerPoint slides");
        const buffer = await createPptxBuffer(deck, slideCount);
        sendProgress("Saving presentation file");
        fs.writeFileSync(outputPath, buffer, { flag: "wx" });
        sendProgress("Verifying saved presentation");
        const savedBuffer = fs.readFileSync(outputPath);
        const verification = await verifyPptxBuffer(savedBuffer, slideCount, deck);
        const fileStats = fs.statSync(outputPath);
        if (!fileStats.isFile() || fileStats.size !== verification.size || fileStats.size < 6000) {
            throw new Error("The presentation file did not pass its final saved-file verification.");
        }
        const assetsManifestPath = outputPath.replace(/\.pptx$/i, ".assets.json");
        const imageCredits = [
            ...(deck.coverImage?.imagePath ? [{ slide: 1, title: deck.coverImage.imageTitle || deck.title, source: deck.coverImage.imageAttribution || "", creator: deck.coverImage.imageCredit || "", sourceUrl: deck.coverImage.imageSourceUrl || "" }] : []),
            ...(deck.slides || []).flatMap((slide, index) => slide?.imagePath ? [{ slide: index + 2, title: slide.imageTitle || slide.title, source: slide.imageAttribution || "", creator: slide.imageCredit || "", sourceUrl: slide.imageSourceUrl || "" }] : [])
        ];
        const assetsManifest = { title: deck.title, createdAt: new Date().toISOString(), images: imageCredits };
        try { fs.writeFileSync(assetsManifestPath, JSON.stringify(assetsManifest, null, 2), { flag: "wx" }); }
        catch (manifestError) { console.warn("[PRESENTATION] Image credit manifest could not be saved:", manifestError?.message || manifestError); }
        let previewPath = "";
        let previewLayoutCheck = null;
        let officeRender = null;
        try {
            previewPath = writePresentationPreview(outputPath, deck, verification);
            sendProgress("Preparing the slide preview and quality report");
        } catch (previewError) {
            console.warn("[PRESENTATION] Preview generation failed; PPTX remains available:", previewError?.message || previewError);
        }
        try {
            sendProgress("Checking for an installed PowerPoint rendering engine");
            officeRender = await renderPptxWithPowerPoint(outputPath, slideCount);
            if (officeRender?.rendered && officeRender.slides?.length) {
                const renderedThumbnail = outputPath.replace(/\.pptx$/i, ".thumb.png");
                fs.copyFileSync(officeRender.slides[0], renderedThumbnail);
            }
        } catch (renderError) {
            officeRender = { available: true, renderer: "Microsoft PowerPoint", rendered: false, reason: String(renderError?.message || renderError).slice(0, 350) };
        }
        verification.powerPointRender = officeRender;
        if (!officeRender?.rendered) verification.warnings.push(`PowerPoint visual verification unavailable: ${officeRender?.reason || "renderer not installed"}`);
        else if (officeRender.warnings?.length) verification.warnings.push(...officeRender.warnings);
        if (previewPath) {
            try {
                writePresentationPreview(outputPath, deck, verification);
                sendProgress("Opening slide preview and quality report");
                const previewResult = await openPresentationPreviewWindow(previewPath);
                previewLayoutCheck = previewResult?.layoutCheck || null;
            } catch (previewError) {
                console.warn("[PRESENTATION] Final preview verification failed; PPTX remains available:", previewError?.message || previewError);
            }
        }
        try { fs.writeFileSync(assetsManifestPath, JSON.stringify({ ...assetsManifest, qualityReport: { slidesWithImages: verification.slidesWithImages, slidesWithoutImages: verification.slidesWithoutImages, imageCoverage: verification.imageCoverage, duplicateImageCount: verification.duplicateImageCount, outOfBoundsSlides: verification.outOfBoundsSlides, emptySlides: verification.emptySlides, slideReports: verification.slideReports, visualCheck: verification.visualCheck, previewLayoutCheck, warnings: verification.warnings }, officeRender }, null, 2)); }
        catch (manifestError) { console.warn("[PRESENTATION] Quality/render report could not be saved:", manifestError?.message || manifestError); }
        sendProgress("Opening presentation in PPT +");
        const openResult = await openGeneratedPresentationInPptPlus(outputPath);
        sendProgress("Completed");
        const selectedProvider = openAICompatibleClient.getConfig?.()?.provider || "unknown";
        const result = success({ title: deck.title, path: outputPath, previewPath, opened: openResult.success === true, openError: openResult.success ? undefined : openResult.error, slideCount: slideCount, size: fileStats.size, imageCount: verification.imageCount, qualityReport: { slidesWithImages: verification.slidesWithImages, slidesWithoutImages: verification.slidesWithoutImages, imageCoverage: verification.imageCoverage, duplicateImageCount: verification.duplicateImageCount, outOfBoundsSlides: verification.outOfBoundsSlides, emptySlides: verification.emptySlides, slideReports: verification.slideReports, visualCheck: verification.visualCheck, previewLayoutCheck, warnings: verification.warnings, powerPointRender: officeRender }, verified: true, usedLocalFallback, aiProvider: usedLocalFallback ? localFallbackMode : selectedProvider, jobId: job.id });
        updateBackgroundJob(job.id, { state: "completed", progress: 100, stage: "Completed", resultPath: outputPath });
        return result;
        }).then(result => {
            if (job.cancelRequested) updateBackgroundJob(job.id, { state: "cancelled", stage: "Cancelled", progress: job.progress, error: "" });
            else if (!result?.success) updateBackgroundJob(job.id, { state: "failed", stage: "Failed", error: String(result?.error || "Presentation generation failed.").slice(0, 400) });
            return result;
        });
    });

    registerHandler("documents:create-spreadsheet", async (_event, requestInput) => {
        const request = safeString(requestInput).trim().slice(0, 180);
        if (!request) return failure("Tell JARVIS what kind of spreadsheet to create, such as a monthly budget or study planner.");
        const job = createBackgroundJob("spreadsheet", `Create spreadsheet · ${request.slice(0, 80)}`, { request });
        updateBackgroundJob(job.id, { state: "running", progress: 8, stage: "Preparing workbook" });
        return safeIPC("documents:create-spreadsheet", async () => {
            assertBackgroundJobActive(job.id);
            const directory = path.join(app.getPath("documents"), "JARVIS Spreadsheets");
            await fs.promises.mkdir(directory, { recursive: true });
            const safeTitle = request.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 52) || "smart-tracker";
            const stamp = new Date().toISOString().replace(/[:.]/g, "-");
            const outputPath = path.join(directory, `${safeTitle}-${stamp}.xlsx`);
            updateBackgroundJob(job.id, { progress: 35, stage: "Building dashboard, formulas, chart and tracker" });
            const workbook = await writeSpreadsheetWorkbook(request, outputPath);
            assertBackgroundJobActive(job.id);
            const openError = await shell.openPath(outputPath);
            const result = success({ ...workbook, opened: !openError, openError: openError || undefined, jobId: job.id });
            updateBackgroundJob(job.id, { state: "completed", progress: 100, stage: "Completed", resultPath: outputPath, result });
            return result;
        }).then(result => {
            if (job.cancelRequested) updateBackgroundJob(job.id, { state: "cancelled", stage: "Cancelled", progress: job.progress, error: "" });
            else if (!result?.success) updateBackgroundJob(job.id, { state: "failed", stage: "Failed", error: String(result?.error || "Spreadsheet generation failed.").slice(0, 400) });
            return result;
        });
    });

    registerHandler("documents:create-office-file", async (_event, formatInput, requestInput, options = {}) => {
        const format = safeString(formatInput).toLowerCase();
        const request = safeString(requestInput).trim().slice(0, 180);
        if (!["docx", "csv", "zip"].includes(format)) return failure("Choose DOCX, CSV, or ZIP as the output format.");
        if (format !== "zip" && !request) return failure(`Tell JARVIS what the ${format.toUpperCase()} should contain.`);
        const language = /^(hi|hinglish|en)$/i.test(String(options?.language || "")) ? String(options.language).toLowerCase() : "en";
        const location = ["downloads", "desktop", "documents"].includes(String(options?.outputLocation || "").toLowerCase()) ? String(options.outputLocation).toLowerCase() : "documents";
        const requestedName = safeString(options?.fileName).trim().replace(/\.(?:docx|csv|zip)$/i, "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").replace(/\.{2,}/g, "-").replace(/[ .]+$/g, "").slice(0, 80);
        const job = createBackgroundJob("office-file", `Create ${format.toUpperCase()} · ${request || "Selected files"}`, { format, request, options: { language, fileName: requestedName, outputLocation: location } });
        updateBackgroundJob(job.id, { state: "running", progress: 4, stage: "Preparing output" });
        return safeIPC("documents:create-office-file", async () => {
            assertBackgroundJobActive(job.id);
            const directory = path.join(app.getPath("documents"), "JARVIS Documents");
            await fs.promises.mkdir(directory, { recursive: true });
            const outputDirectory = location === "downloads" ? app.getPath("downloads") : location === "desktop" ? app.getPath("desktop") : directory;
            await fs.promises.mkdir(outputDirectory, { recursive: true });
            const fileStem = requestedName || request.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || format;
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const suggestedPath = path.join(outputDirectory, `${fileStem}${requestedName ? "" : `-${timestamp}`}.${format}`);
            let buffer;
            let outputPath;
            if (format === "zip") {
                const selection = await dialog.showOpenDialog(mainWindow, { title: "Select files to include in the ZIP archive", properties: ["openFile", "multiSelections"] });
                if (selection.canceled || !selection.filePaths?.length) {
                    updateBackgroundJob(job.id, { state: "cancelled", progress: 0, stage: "Cancelled by user", error: "" });
                    return success({ cancelled: true });
                }
                assertBackgroundJobActive(job.id);
                const saved = await dialog.showSaveDialog(mainWindow, { title: "Save ZIP archive", defaultPath: suggestedPath, filters: [{ name: "ZIP archive", extensions: ["zip"] }] });
                if (saved.canceled || !saved.filePath) {
                    updateBackgroundJob(job.id, { state: "cancelled", progress: 0, stage: "Cancelled by user", error: "" });
                    return success({ cancelled: true });
                }
                outputPath = path.resolve(saved.filePath);
                updateBackgroundJob(job.id, { progress: 25, stage: `Compressing ${selection.filePaths.length} selected file(s)` });
                buffer = await createZipBuffer(selection.filePaths);
                assertBackgroundJobActive(job.id);
                const inspect = await require("jszip").loadAsync(buffer);
                const archivedFiles = Object.values(inspect.files).filter(entry => !entry.dir);
                if (archivedFiles.length !== selection.filePaths.length) return failure("The ZIP archive did not contain every selected file; no archive was saved.");
            } else if (format === "csv") {
                updateBackgroundJob(job.id, { progress: 40, stage: "Building a clean UTF-8 CSV template" });
                buffer = Buffer.from(createCsv(request), "utf8");
                if (!buffer.length || !buffer.toString("utf8").includes(",")) return failure("The CSV did not pass its structure check.");
            } else {
                updateBackgroundJob(job.id, { progress: 12, stage: "Drafting the document with the configured AI provider" });
                const languageName = language === "hi" ? "Hindi" : language === "hinglish" ? "natural Hinglish" : "English";
                const generated = await chatSelectedProvider([
                    { role: "system", content: "Write accurate, useful Word document content from the user's request. Return only clean Markdown: a short title is supplied separately, use clear headings, short paragraphs and bullets where helpful. Never invent citations, quotes, personal facts, or precise statistics. Do not return HTML, code, or commentary." },
                    { role: "user", content: `Create a polished, practical Word document in ${languageName} about this request: ${request}. Keep it focused and useful for the user's likely purpose. If the topic needs current facts that are not supplied, clearly avoid exact current claims.` }
                ], { temperature: 0.25, maxTokens: 1500, timeoutMs: 90000, reasoningEffort: null, signal: backgroundJobSignal(job.id) });
                if (!generated?.success || !String(generated.text || "").trim()) return failure(generated?.error || "The selected AI provider returned no document content.");
                updateBackgroundJob(job.id, { progress: 72, stage: "Formatting and validating the DOCX package" });
                buffer = await buildDocxBuffer({ title: request, content: generated.text });
                const packageZip = await require("jszip").loadAsync(buffer);
                const documentXml = await packageZip.file("word/document.xml")?.async("string");
                if (!documentXml?.includes("<w:body>") || !documentXml.includes("<w:sectPr>")) return failure("The generated DOCX failed its package check.");
                const extracted = await require("mammoth").extractRawText({ buffer });
                if (String(extracted?.value || "").trim().length < 80) return failure("The DOCX did not pass its readable-content check.");
            }

            assertBackgroundJobActive(job.id);
            if (!outputPath) {
                outputPath = suggestedPath;
                if (fs.existsSync(outputPath)) outputPath = path.join(outputDirectory, `${fileStem}-${timestamp}.${format}`);
            }
            updateBackgroundJob(job.id, { progress: 88, stage: "Saving and verifying the generated file" });
            await fs.promises.writeFile(outputPath, buffer, { flag: "wx" });
            const stat = await fs.promises.stat(outputPath);
            if (!stat.isFile() || stat.size !== buffer.length || stat.size < 30) {
                await fs.promises.unlink(outputPath).catch(() => {});
                return failure(`The ${format.toUpperCase()} did not pass file verification.`);
            }
            if (format === "zip") {
                const savedZip = await require("jszip").loadAsync(await fs.promises.readFile(outputPath));
                if (!Object.values(savedZip.files).some(entry => !entry.dir)) {
                    await fs.promises.unlink(outputPath).catch(() => {});
                    return failure("The saved ZIP archive is empty.");
                }
            }
            const openError = await shell.openPath(outputPath);
            const result = success({ format, path: outputPath, size: stat.size, verified: true, opened: !openError, openError: openError || undefined, jobId: job.id });
            updateBackgroundJob(job.id, { state: "completed", progress: 100, stage: "Completed", resultPath: outputPath, result });
            return result;
        }).then(result => {
            if (job.cancelRequested) updateBackgroundJob(job.id, { state: "cancelled", stage: "Cancelled", progress: job.progress, error: "" });
            else if (!result?.success) updateBackgroundJob(job.id, { state: "failed", stage: "Failed", error: String(result?.error || "Office file generation failed.").slice(0, 400) });
            return result;
        });
    });

    registerHandler("documents:create-pdf", async (_event, topicInput, options = {}) => {
        const jobTopic = safeString(topicInput).trim().slice(0, 120);
        const jobLanguage = /^(hi|hinglish|en)$/i.test(String(options?.language || "")) ? String(options.language).toLowerCase() : "en";
        const previousJob = options?.resumeJobId ? backgroundJobs.get(String(options.resumeJobId)) : null;
        const savedCheckpoint = previousJob?.type === "pdf" && previousJob?.payload?.checkpoint?.stage ? previousJob.payload.checkpoint : null;
        const job = createBackgroundJob("pdf", `Create PDF · ${jobTopic || "Untitled"}`, { topic: jobTopic, options: { language: jobLanguage }, ...(savedCheckpoint ? { checkpoint: savedCheckpoint } : {}) });
        updateBackgroundJob(job.id, { state: "running", progress: 2, stage: "Starting" });
        return safeIPC("documents:create-pdf", async () => {
        const topic = safeString(topicInput).trim().slice(0, 120);
        if (!topic) return failure("Tell JARVIS what topic the PDF should cover.");
        const language = jobLanguage;
        assertBackgroundJobActive(job.id);
        updateBackgroundJob(job.id, { state: "running", progress: 8, stage: "Gathering an optional reference and image" });
        // Keep durable checkpoints small: image bytes remain in the local cache,
        // while the job history stores only their path and attribution.
        let checkpoint = savedCheckpoint ? { ...savedCheckpoint } : {};
        let verifiedSource = checkpoint.verifiedSource || null;
        let imageCandidate = checkpoint.imageCandidate || null;
        let coverImage = null;
        if (checkpoint.coverImage?.localPath && fs.existsSync(checkpoint.coverImage.localPath)) {
            try {
                const localPath = checkpoint.coverImage.localPath;
                const extension = path.extname(localPath).toLowerCase();
                const mime = extension === ".png" ? "image/png" : extension === ".gif" ? "image/gif" : "image/jpeg";
                coverImage = { ...checkpoint.coverImage, localPath, dataUrl: `data:${mime};base64,${fs.readFileSync(localPath).toString("base64")}` };
            } catch (error) { console.warn("[PDF] Cached cover could not be restored:", error?.message || error); }
        }
        if (!checkpoint.stage && !checkpoint.generatedText) {
            // Both lookups are optional; a provider outage must never prevent the PDF.
            const [wikiResult, imageResult] = await Promise.all([
                Promise.race([
                    wikipediaService.summary(topic, language === "hi" ? "hi" : "en"),
                    new Promise(resolve => setTimeout(() => resolve({ success: false, error: "Source lookup timed out." }), 6500))
                ]).catch(() => ({ success: false })),
                Promise.race([
                    presentationImageSearch.searchImages(topic, { limit: 6, query: topic, topic, visualCue: topic, signal: backgroundJobSignal(job.id) }),
                    new Promise(resolve => setTimeout(() => resolve({ success: false, images: [] }), 6500))
                ]).catch(() => ({ success: false, images: [] }))
            ]);
            verifiedSource = wikiResult?.success && wikiResult.extract
                ? { title: wikiResult.title, extract: String(wikiResult.extract).slice(0, 3500), url: wikiResult.url }
                : null;
            imageCandidate = (imageResult?.images || []).find(image => image?.downloadUrl && image?.sourceUrl) || null;
        }
        assertBackgroundJobActive(job.id);
        if (!coverImage && imageCandidate?.downloadUrl) {
            const cached = await offlineCache.cacheImage(imageCandidate.downloadUrl, { maxBytes: 8 * 1024 * 1024, signal: backgroundJobSignal(job.id) });
            if (cached?.localPath && fs.existsSync(cached.localPath)) {
                const extension = path.extname(cached.localPath).toLowerCase();
                const mime = extension === ".png" ? "image/png" : extension === ".gif" ? "image/gif" : "image/jpeg";
                const bytes = fs.readFileSync(cached.localPath);
                coverImage = {
                    dataUrl: `data:${mime};base64,${bytes.toString("base64")}`,
                    title: imageCandidate.title || "Topic image",
                    source: imageCandidate.source || imageCandidate.provider || "Image source",
                    sourceUrl: imageCandidate.sourceUrl,
                    creator: imageCandidate.creator || "",
                    license: imageCandidate.license || "",
                    licenseUrl: imageCandidate.licenseUrl || "",
                    localPath: cached.localPath
                };
            }
        }
        if (!checkpoint.generatedText && checkpoint.stage !== "references-ready") {
            checkpoint = {
                stage: "references-ready", verifiedSource, imageCandidate: imageCandidate ? {
                    title: imageCandidate.title, source: imageCandidate.source || imageCandidate.provider || "Image source",
                    sourceUrl: imageCandidate.sourceUrl, creator: imageCandidate.creator || "", license: imageCandidate.license || "", licenseUrl: imageCandidate.licenseUrl || ""
                } : null,
                coverImage: coverImage ? { localPath: coverImage.localPath, title: coverImage.title, source: coverImage.source, sourceUrl: coverImage.sourceUrl, creator: coverImage.creator, license: coverImage.license, licenseUrl: coverImage.licenseUrl } : null,
                savedAt: Date.now()
            };
            job.payload.checkpoint = checkpoint;
            updateBackgroundJob(job.id, { payload: job.payload, progress: 28, stage: "Safe checkpoint · source and cover image saved" });
        }
        const sourceContext = verifiedSource
            ? `\n\nUse this retrieved source for factual grounding. Do not claim details beyond it unless they are established general knowledge. Source title: ${verifiedSource.title}\nSource extract: ${verifiedSource.extract}\nSource URL: ${verifiedSource.url}`
            : "\n\nNo reference article was available. Do not invent citations or precise statistics.";
        const prompt = language === "hi"
            ? `इस विषय पर स्पष्ट, भरोसेमंद अध्ययन PDF सामग्री लिखें: ${topic}. छोटा परिचय, 4-6 उपयोगी सेक्शन, उदाहरण, मुख्य बातें और निष्कर्ष दें। तथ्य न गढ़ें। लगभग 700-900 शब्द रखें। केवल सामग्री और markdown headings दें.${sourceContext}`
            : `Write concise, accurate study-document content about: ${topic}. Include an overview, 4-6 useful sections, practical examples, takeaways, and a conclusion. Do not invent precise statistics. Aim for 700-900 words. Return only the content with markdown headings.${sourceContext}`;
        assertBackgroundJobActive(job.id);
        updateBackgroundJob(job.id, { progress: 34, stage: "Writing document content" });
        let generatedText = String(checkpoint.generatedText || "").trim();
        if (!generatedText) {
            const documentMessages = [
                { role: "system", content: "You write concise, accurate educational documents. Never include HTML, scripts, or commentary about creating the file." },
                { role: "user", content: prompt }
            ];
            let generated = null;
            try { generated = await chatSelectedProvider(documentMessages, { temperature: 0.3, maxTokens: 1800, timeoutMs: 90000, reasoningEffort: null, signal: backgroundJobSignal(job.id) }); }
            catch (error) { generated = { success: false, error: error?.message || "The selected AI provider request failed." }; }
            // A provider outage must not make the artifact command unusable.
            // Try the installed Ollama model before using the retrieved local
            // article as a deterministic, fully offline document body.
            if (!generated?.success || !String(generated.text || "").trim()) {
                let localStatus = null;
                try { localStatus = await ollamaClient.getStatus({ force: true }); } catch (_) {}
                if (localStatus?.running && localStatus?.selectedModel) {
                    try {
                        generated = await ollamaClient.chat(documentMessages, { temperature: 0.3, numPredict: 2200, maxTokens: 2200, timeoutMs: 90000, signal: backgroundJobSignal(job.id) });
                    } catch (_) { generated = null; }
                }
            }
            if (generated?.success && String(generated.text || "").trim()) {
                generatedText = String(generated.text).trim();
            } else {
                const extract = String(verifiedSource?.extract || "").trim();
                const fallbackIntro = language === "hi"
                    ? `यह PDF ${topic} के बारे में उपलब्ध स्थानीय संदर्भ पर आधारित है।`
                    : `This PDF is based on the locally available reference material about ${topic}.`;
                const fallbackHeading = language === "hi" ? "मुख्य संदर्भ" : "Key reference";
                const fallbackTakeaway = language === "hi" ? "मुख्य बातें" : "Key takeaways";
                generatedText = [
                    `# ${topic}`,
                    fallbackIntro,
                    `## ${fallbackHeading}`,
                    extract || (language === "hi" ? `${topic} पर भरोसेमंद सामग्री उपलब्ध नहीं मिली। अधिक जानकारी मिलने पर दस्तावेज़ दोबारा बनाया जा सकता है।` : `No reference article was available for ${topic}. The document can be regenerated after a source is available.`),
                    `## ${fallbackTakeaway}`,
                    language === "hi" ? `• विषय की परिभाषा और दायरा स्पष्ट रखें।\n• किसी भी समय-संवेदनशील तथ्य को स्रोत के साथ जाँचें।` : `- Keep the definition and scope of the topic clear.\n- Verify time-sensitive facts against a current source.`
                ].join("\n\n");
            }
            checkpoint = { ...checkpoint, stage: "content-ready", generatedText, savedAt: Date.now() };
            job.payload.checkpoint = checkpoint;
            updateBackgroundJob(job.id, { payload: job.payload, progress: 62, stage: "Safe checkpoint · document content saved" });
        }
        assertBackgroundJobActive(job.id);
        updateBackgroundJob(job.id, { progress: 67, stage: "Formatting and rendering PDF pages" });
        const escapeHtml = value => String(value).replace(/[&<>\"]/g, char => char === "&" ? "&amp;" : char === "<" ? "&lt;" : char === ">" ? "&gt;" : "&quot;").replace(/'/g, "&#39;");
        const lines = generatedText.replace(/^```(?:markdown|md|text)?\s*/i, "").replace(/\s*```$/, "").split(/\r?\n/);
        const sections = [];
        let current = { title: "Overview", blocks: [] };
        const flushSection = () => { if (current.blocks.length) sections.push(current); };
        for (const line of lines) {
            const value = line.trim();
            if (!value) continue;
            const heading = value.match(/^#{1,3}\s+(.+)$/);
            if (heading) {
                flushSection();
                current = { title: heading[1].trim(), blocks: [] };
                continue;
            }
            if (/^[-*+]\s+/.test(value)) current.blocks.push({ type: "li", text: value.replace(/^[-*+]\s+/, "") });
            else if (/^\d+[.)]\s+/.test(value)) current.blocks.push({ type: "oli", text: value.replace(/^\d+[.)]\s+/, "") });
            else if (/^>\s?/.test(value)) current.blocks.push({ type: "quote", text: value.replace(/^>\s?/, "") });
            else current.blocks.push({ type: "p", text: value.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1") });
        }
        flushSection();
        const slug = value => `section-${Buffer.from(String(value)).toString("hex").slice(0, 40)}`;
        const body = sections.map(section => {
            let listType = "";
            let listItems = [];
            const blocks = [];
            const closeList = () => {
                if (!listItems.length) return;
                blocks.push(`<${listType}>${listItems.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</${listType}>`);
                listItems = []; listType = "";
            };
            for (const block of section.blocks) {
                if (block.type === "li" || block.type === "oli") {
                    const nextType = block.type === "li" ? "ul" : "ol";
                    if (listType && listType !== nextType) closeList();
                    listType = nextType; listItems.push(block.text); continue;
                }
                closeList();
                if (block.type === "quote") blocks.push(`<blockquote>${escapeHtml(block.text)}</blockquote>`);
                else blocks.push(`<p>${escapeHtml(block.text)}</p>`);
            }
            closeList();
            return `<section><h2 id="${slug(section.title)}">${escapeHtml(section.title)}</h2>${blocks.join("\n")}</section>`;
        }).join("\n");
        const toc = sections.length > 1
            ? `<nav class="contents"><h2>In this guide</h2><ol>${sections.map(section => `<li><a href="#${slug(section.title)}">${escapeHtml(section.title)}</a></li>`).join("")}</ol></nav>`
            : "";
        const dateLabel = new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
        const sourceSection = verifiedSource || coverImage
            ? `<section class="sources"><h2>Sources & image credits</h2>${verifiedSource ? `<p><a href="${escapeHtml(verifiedSource.url)}">${escapeHtml(verifiedSource.title)} — Wikipedia</a></p>` : ""}${coverImage ? `<p>${escapeHtml(coverImage.title)}${coverImage.creator ? ` · ${escapeHtml(coverImage.creator)}` : ""} · ${escapeHtml(coverImage.source)}${coverImage.license ? ` · ${escapeHtml(coverImage.license)}` : ""} · <a href="${escapeHtml(coverImage.sourceUrl)}">View image source</a></p>` : ""}</section>`
            : "";
        const coverImageMarkup = coverImage
            ? `<figure class="cover-visual"><img src="${coverImage.dataUrl}" alt="${escapeHtml(coverImage.title)}"><figcaption>${escapeHtml(coverImage.title)} · ${escapeHtml(coverImage.source)}</figcaption></figure>`
            : "";
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(topic)} — JARVIS Guide</title><style>
@page{size:A4;margin:19mm 20mm 22mm;@bottom-left{content:"JARVIS  /  ${escapeHtml(topic.slice(0, 45))}";font:8pt Arial;color:#778596}@bottom-right{content:"PAGE " counter(page);font:8pt Arial;color:#778596}}
*{box-sizing:border-box}body{font:10.5pt/1.62 "Aptos",Arial,sans-serif;color:#253344;margin:0} .cover{min-height:240mm;display:flex;flex-direction:column;justify-content:flex-end;padding:18mm 8mm 25mm;page-break-after:always;background:linear-gradient(145deg,#0d233a,#164b64 68%,#2d8390);color:white;position:relative}.cover:before{content:"";position:absolute;left:8mm;top:18mm;width:18mm;height:3px;background:#76d3c2}.eyebrow{text-transform:uppercase;letter-spacing:2.4px;font-size:9pt;color:#9be2d5;font-weight:bold}.cover h1{font-size:35pt;line-height:1.12;margin:10mm 0 7mm;max-width:155mm}.cover .subtitle{font-size:14pt;line-height:1.45;color:#d3e4eb;max-width:145mm}.cover .meta{margin-top:12mm;border-top:1px solid #628092;padding-top:6mm;color:#ccdae1;font-size:9pt}.cover-visual{margin:0 0 12mm;max-width:150mm;max-height:86mm;overflow:hidden;border-radius:4mm;border:1px solid rgba(255,255,255,.28);box-shadow:0 8mm 16mm rgba(0,0,0,.25)}.cover-visual img{display:block;width:100%;height:76mm;object-fit:cover}.cover-visual figcaption{padding:2mm 3mm;background:rgba(4,16,28,.72);color:#d3e4eb;font-size:8pt}.contents{padding:8mm 10mm;margin:0 0 12mm;background:#f1f6f7;border-left:3px solid #258b88;break-after:page}.contents h2{margin:0 0 5mm}.contents ol{columns:2;column-gap:14mm;padding-left:5mm}.contents li{padding:1.4mm 0;break-inside:avoid}.contents a{color:#17687a;text-decoration:none}h2{font-size:19pt;line-height:1.2;color:#153c58;margin:12mm 0 5mm;padding-bottom:3mm;border-bottom:1px solid #cddde3;break-after:avoid}section:first-of-type h2{margin-top:0}h3{font-size:13pt;color:#216a75;margin:7mm 0 2mm;break-after:avoid}p{margin:0 0 4mm;text-align:left;orphans:3;widows:3}ul,ol{margin:1mm 0 5mm;padding-left:7mm}li{margin:1.6mm 0;padding-left:1mm}li::marker{color:#21868a}blockquote{margin:5mm 0;padding:4mm 6mm;background:#edf6f5;border-left:3px solid #2b9990;color:#24515b;font-size:11pt}section{break-inside:auto}section p+ p{margin-top:1mm}.sources{margin-top:10mm;padding:5mm 7mm;background:#f1f6f7;border-left:3px solid #258b88;font-size:9pt;break-inside:avoid}.sources a{color:#17687a}.closing{margin-top:12mm;padding:6mm;background:#f3f6f8;color:#566878;border-radius:3mm;font-size:9pt}
</style></head><body><header class="cover"><div class="eyebrow">JARVIS · Study guide</div>${coverImageMarkup}<h1>${escapeHtml(topic)}</h1><div class="subtitle">A clear, structured guide with key ideas, useful context, and takeaways.</div><div class="meta">Prepared ${escapeHtml(dateLabel)}<br>For learning and reference</div></header>${toc}${body}${sourceSection}<div class="closing">Prepared by JARVIS · ${escapeHtml(dateLabel)}</div></body></html>`;
        const window = new BrowserWindow({ show: false, width: 900, height: 1200, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
        let pdfBuffer;
        try {
            await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
            pdfBuffer = await window.webContents.printToPDF({ printBackground: true, pageSize: "A4", margins: { top: 0.65, bottom: 0.65, left: 0.7, right: 0.7 } });
        } finally { if (!window.isDestroyed()) window.destroy(); }
        if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length < 1000 || pdfBuffer.subarray(0, 5).toString() !== "%PDF-") return failure("The generated document did not pass PDF verification.");
        let qualityReport = null;
        try {
            const parsedPdf = await require("pdf-parse")(pdfBuffer);
            const pageCount = Math.max(1, Number(parsedPdf.numpages) || 1);
            const extractedPages = String(parsedPdf.text || "").split("\f").map(page => page.trim()).slice(0, pageCount);
            while (extractedPages.length < pageCount) extractedPages.push("");
            const pages = extractedPages.map((text, index) => ({ page: index + 1, characters: text.length, words: (text.match(/[\p{L}\p{N}]+/gu) || []).length, hasText: text.length >= 40 }));
            const emptyPages = pages.filter(page => !page.hasText).map(page => page.page);
            const densePages = pages.filter(page => page.characters > 2600).map(page => page.page);
            const shortPages = pages.filter(page => page.hasText && page.characters < 180).map(page => page.page);
            const normalized = extractedPages.map(text => text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()).filter(Boolean);
            const duplicatePageCount = normalized.length - new Set(normalized).size;
            const warnings = [];
            if (emptyPages.length) warnings.push(`Little or no searchable text was extracted from page(s): ${emptyPages.join(", ")}. This may be intentional for visual pages.`);
            if (shortPages.length) warnings.push(`Very little searchable text was extracted from page(s): ${shortPages.join(", ")}. Check whether these pages are intentionally visual or missing content.`);
            if (densePages.length) warnings.push(`High text density may affect readability on page(s): ${densePages.join(", ")}.`);
            if (duplicatePageCount) warnings.push(`${duplicatePageCount} page(s) contain duplicate extracted text.`);
            const textCoveragePercent = Math.round((pages.filter(page => page.hasText).length / pageCount) * 100);
            qualityReport = { pageCount, pages, emptyPages, shortPages, densePages, duplicatePageCount, textCoveragePercent, warnings, method: "PDF page-by-page text and duplication checks. Text extraction cannot verify visual clipping, typography, or image quality." };
        } catch (error) {
            qualityReport = { pageCount: null, pages: [], warnings: [`PDF text quality inspection was unavailable: ${String(error?.message || error).slice(0, 180)}`], method: "PDF structure verification only." };
        }
        assertBackgroundJobActive(job.id);
        const directory = path.join(app.getPath("documents"), "JARVIS PDFs");
        fs.mkdirSync(directory, { recursive: true });
        const baseName = topic.normalize("NFKC").replace(/[^\p{L}\p{N} _-]/gu, "").trim().replace(/\s+/g, "-").slice(0, 64) || "Study-Guide";
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const outputPath = path.join(directory, `${baseName}-${stamp}.pdf`);
        fs.writeFileSync(outputPath, pdfBuffer, { flag: "wx" });
        const qualityManifest = {
            title: topic,
            createdAt: new Date().toISOString(),
            qualityReport,
            coverImage: coverImage ? { slide: 1, title: coverImage.title || "Topic image", source: coverImage.source || "Image source", creator: coverImage.creator || "", license: coverImage.license || "", licenseUrl: coverImage.licenseUrl || "", sourceUrl: coverImage.sourceUrl || "" } : null
        };
        try { fs.writeFileSync(outputPath.replace(/\.pdf$/i, ".quality.json"), JSON.stringify(qualityManifest, null, 2), { flag: "wx" }); }
        catch (error) { console.warn("[PDF] Could not save quality/source manifest:", error?.message || error); }
        const openResult = await openGeneratedPdfInEdge(outputPath);
        updateBackgroundJob(job.id, { state: "completed", progress: 100, stage: "Completed", resultPath: outputPath });
        return success({ path: outputPath, opened: openResult.success === true, app: openResult.app, error: openResult.success ? undefined : openResult.error, size: pdfBuffer.length, qualityReport, jobId: job.id });
        }).then(result => {
            if (job.cancelRequested) updateBackgroundJob(job.id, { state: "cancelled", stage: "Cancelled", error: "" });
            else if (!result?.success) updateBackgroundJob(job.id, { state: "failed", stage: "Failed", error: String(result?.error || "PDF generation failed.").slice(0, 400) });
            return result;
        });
    });

    registerHandler("consciousness:state", async () => {
        const layer = initConsciousness();
        const memory = initMemory();
        return success({
            consciousness: layer.getPublicState(),
            health: layer.getHealthSummary({
                memoryStatus: "ACTIVE",
                memoryFactCount: Object.keys(memory.allFacts()).length
            })
        });
    });

    registerHandler("consciousness:respond", async (_event, userMessage) => {
        const text = safeString(userMessage);
        if (!text) return failure("Message is required.");

        const layer = initConsciousness();
        const memory = getActiveUserMemory();
        if (!memory) return failure("No active user session is available.");

        try {
            layer.setMode("THINKING");

            const facts = Object.values(memory.allFacts ? memory.allFacts() : {})
                .slice(0, 8)
                .map(f => ({ key: f.key, value: f.value }));

            const response = layer.respond(text, { memoryFacts: facts });
            if (!response) {
                layer.setMode("ERROR");
                return failure("Consciousness layer could not produce a response.");
            }

            // BUG FIX (reported by user as "memory not working"): this
            // handler answers any plain statement that doesn't match a
            // more specific route — including bare declarations like
            // "My name is Nakul." with no "remember that" prefix. It
            // was pushing turns into working memory but NEVER calling
            // memory.extractFromMessage(), so structured facts (Test 4/5
            // in the brief) were silently never saved for any message
            // that ended up answered here. renderer/js/chat.js
            // deliberately skips its OWN fallback recordTurn() call
            // for responses from this route (response.consciousnessRecorded
            // = true) to avoid double-pushing the turn — which means
            // extraction must happen here, at the source, not rely on
            // the renderer calling back in. See
            // JARVIS_MEMORY_IMPLEMENTATION_STATUS.md for the full
            // writeup of this bug and fix.
            const storedFacts = userMemory.canRecordConversation(userManager.getActiveUserId())
                ? memory.extractFromMessage(text, { source: "conversation" }) : [];
            if (storedFacts.length > 0) {
                log(`[MEMORY] Stored ${storedFacts.length} fact(s) via consciousness:respond: ${storedFacts.map(f => f.key).join(", ")}`);
            }

            memory.pushTurn("user", text);
            memory.pushTurn("assistant", response);

            return success({
                handled: true,
                source: "consciousness",
                response,
                text: response,
                consciousness: layer.getPublicState(),
                language: layer.detectLanguage(text)
            });
        } catch (error) {
            layer.setMode("ERROR");
            errorLog("[COGNITION] Response generation failed:", error);
            return failure(getErrorMessage(error), { source: "consciousness" });
        }
    });

    registerHandler("consciousness:set-goal", async (_event, goal) => {
        const layer = initConsciousness();
        return success({ activeGoal: layer.setGoal(safeString(goal)) });
    });

    registerHandler("consciousness:complete-goal", async () => {
        const layer = initConsciousness();
        return success({ completedGoal: layer.completeGoal() });
    });

    // PERSONALITY RESPONSE STYLES — user-chosen tone (professional/
    // friendly/witty/concise/formal), separate from the automatic mood
    // system. Applies to both the deterministic consciousness.respond()
    // path and (via getStyleInstruction()) the embedded-brain LLM path.
    registerHandler("consciousness:set-style", async (_event, style) => {
        const layer = initConsciousness();
        const result = layer.setResponseStyle(safeString(style));
        return result && result.success ? success(result) : failure(result && result.error, result);
    });

    registerHandler("consciousness:get-style", async () => {
        const layer = initConsciousness();
        return success({ style: layer.getResponseStyle() });
    });

    registerHandler("consciousness:thoughts", async (_event, limit) => {
        const layer = initConsciousness();
        return success({ thoughts: layer.getThoughtStream(Number(limit) || undefined) });
    });

    // Used by the local (deterministic, zero-AI) chat router in
    // renderer/js/chat.js after it has already produced a response on
    // its own (memory/knowledge/tasks/goals/offline-commands/brain/
    // agents). No part of the consciousness layer (mood, trust,
    // continuity, thought stream, goal detection) needs any AI engine.
    registerHandler("consciousness:record-turn", async (_event, userMessage, response) => {
        const layer = initConsciousness();
        const memory = getActiveUserMemory();
        if (!memory) return failure("No active user session is available.");
        const text = safeString(userMessage);
        const reply = safeString(response);

        if (!text) return failure("Message is required.");

        const storedFacts = userMemory.canRecordConversation(userManager.getActiveUserId())
            ? memory.extractFromMessage(text, { source: "conversation" }) : [];
        if (storedFacts.length > 0) {
            log(`[MEMORY] Stored ${storedFacts.length} fact(s): ${storedFacts.map(f => f.key).join(", ")}`);
        }
        memory.pushTurn("user", text);
        if (reply) memory.pushTurn("assistant", reply);

        const goalMatch = text.match(
            /^(?:set a goal to|my goal is to|my goal is|mera goal hai)\s+(.+)$/i
        );
        if (goalMatch && goalMatch[1]) {
            const goalTitle = goalMatch[1].trim().slice(0, 200);
            layer.setGoal(goalTitle);
            log(`[COGNITION] Goal set: ${goalTitle}`);
        }

        const detectedLanguage = layer.detectLanguage(text);

        return success({
            consciousness: layer.update({ userMessage: text, response: reply || undefined }),
            language: detectedLanguage
        });
    });

    // ============================================================
    // USER SYSTEM IPC — multi-user management
    // All inputs validated; userId always checked for path safety
    // ============================================================

    registerHandler("user:list", async () =>
        safeIPC("user:list", async () => {
            initUserSystem();
            return success({ users: userManager.listUsers() });
        })
    );

    registerHandler("user:get-active", async () =>
        safeIPC("user:get-active", async () => {
            initUserSystem();
            const activeId = userManager.getActiveUserId();
            if (!activeId) return success({ userId: null, user: null });
            const user = userManager.getActiveUser();
            const profile = userManager.getProfile(activeId);
            const preferences = userManager.getPreferences(activeId);
            return success({ userId: activeId, user, profile, preferences });
        })
    );

    registerHandler("user:create", async (_event, profile, preferences, privacy, options) => {
        return safeIPC("user:create", async () => {
            const result = userManager.createUser(
                profile && typeof profile === "object" ? profile : {},
                preferences && typeof preferences === "object" ? preferences : {},
                privacy && typeof privacy === "object" ? privacy : {},
                options && typeof options === "object" ? options : {}
            );
            if (result.success) {
                notificationCenter.add({
                    category: "JARVIS", type: "SUCCESS", title: "User created",
                    message: `User ${result.user?.name || "User"} created`,
                    priority: "normal", userId: result.userId, source: "user-system"
                });
                return success(result);
            }
            notificationCenter.add({
                category: "ERROR", type: "ERROR", title: "User creation failed",
                message: result.error || "Create failed", priority: "high", source: "user-system"
            });
            return failure(result.error || "Create failed");
        });
    });

    registerHandler("user:switch", async (_event, userId, pin) => {
        const cleanId = safeString(userId);
        if (!userManager.isValidUserId(cleanId)) return failure("Invalid user ID");
        return safeIPC("user:switch", async () => {
            const result = userManager.switchUser(cleanId, pin);
            if (!result.success) return failure(result.error || "User not found", result);
            // Evict memory cache for clean reload
            userMemory.evictAll();
            notificationCenter.add({
                category: "JARVIS", type: "SUCCESS", title: "User switched",
                message: `Switched to ${result.user?.name || "User"}`,
                priority: "normal", userId: result.user?.userId || cleanId, source: "user-system"
            });
            return success(result);
        });
    });

    registerHandler("user:get-profile", async (_event, userId) => {
        const cleanId = safeString(userId);
        if (!userManager.isValidUserId(cleanId)) return failure("Invalid user ID");
        const profile = userManager.getProfile(cleanId);
        return profile ? success({ profile }) : failure("User not found");
    });

    registerHandler("user:update-profile", async (_event, userId, updates) => {
        const cleanId = safeString(userId);
        if (!userManager.isValidUserId(cleanId)) return failure("Invalid user ID");
        return safeIPC("user:update-profile", async () => {
            const result = userManager.updateProfile(cleanId, updates && typeof updates === "object" ? updates : {});
            return result.success ? success(result) : failure(result.error);
        });
    });

    registerHandler("user:get-preferences", async (_event, userId) => {
        const cleanId = safeString(userId);
        if (!userManager.isValidUserId(cleanId)) return failure("Invalid user ID");
        const prefs = userManager.getPreferences(cleanId);
        return prefs ? success({ preferences: prefs }) : success({ preferences: {} });
    });

    registerHandler("user:update-preferences", async (_event, userId, updates) => {
        const cleanId = safeString(userId);
        if (!userManager.isValidUserId(cleanId)) return failure("Invalid user ID");
        return safeIPC("user:update-preferences", async () => {
            const result = userManager.updatePreferences(cleanId, updates && typeof updates === "object" ? updates : {});
            return result.success ? success(result) : failure(result.error);
        });
    });

    registerHandler("user:get-privacy", async (_event, userId) => {
        const cleanId = safeString(userId);
        if (!userManager.isValidUserId(cleanId)) return failure("Invalid user ID");
        const privacy = userManager.getPrivacy(cleanId);
        return success({ privacy: privacy || {} });
    });

    registerHandler("user:update-privacy", async (_event, userId, updates) => {
        const cleanId = safeString(userId);
        if (!userManager.isValidUserId(cleanId)) return failure("Invalid user ID");
        return safeIPC("user:update-privacy", async () => {
            const result = userManager.updatePrivacy(cleanId, updates && typeof updates === "object" ? updates : {});
            return result.success ? success(result) : failure(result.error);
        });
    });

    registerHandler("user:delete", async (_event, userId, confirm) => {
        const cleanId = safeString(userId);
        if (!userManager.isValidUserId(cleanId)) return failure("Invalid user ID");
        return safeIPC("user:delete", async () => {
            const result = userManager.deleteUser(cleanId, confirm === true, userManager.getActiveUserId());
            if (!result.success) return failure(result.error || "Delete failed");
            userMemory.evict(cleanId);
            return success(result);
        });
    });

    registerHandler("user:export", async (_event, userId) => {
        const cleanId = safeString(userId);
        if (!userManager.isValidUserId(cleanId)) return failure("Invalid user ID");
        return safeIPC("user:export", async () => {
            const result = userManager.exportUser(cleanId);
            return result.success ? success(result) : failure(result.error);
        });
    });

    registerHandler("user:import", async (_event, data) => {
        if (!data || typeof data !== "object") return failure("Invalid import data");
        return safeIPC("user:import", async () => {
            const result = userManager.importUser(data);
            return result.success ? success(result) : failure(result.error || "Import failed");
        });
    });

    registerHandler("user:memory-facts", async (_event, userId) => {
        const cleanId = safeString(userId);
        if (!userManager.isValidUserId(cleanId)) return failure("Invalid user ID");
        return safeIPC("user:memory-facts", async () => {
            try {
                return success({ facts: userMemory.allFacts(cleanId) });
            } catch (memError) {
                return failure(memError?.message || "Memory unavailable");
            }
        });
    });

    registerHandler("user:memory-remember", async (_event, userId, message) => {
        const cleanId = safeString(userId);
        if (!userManager.isValidUserId(cleanId)) return failure("Invalid user ID");
        const text = safeString(message);
        if (!text) return failure("Memory message is required.");
        return safeIPC("user:memory-remember", async () => {
            // Privacy check — skip if user disabled memory
            if (!userMemory.canWrite(cleanId)) {
                return failure("Memory storage is disabled for this user.");
            }
            const stored = userMemory.extractFromMessage(cleanId, text, { source: "memory-command" });
            return stored.length ? success({ stored }) : failure("I could not find a safe, explicit fact to remember.");
        });
    });

    registerHandler("user:memory-search", async (_event, userId, query, limit) => {
        const cleanId = safeString(userId);
        if (!userManager.isValidUserId(cleanId)) return failure("Invalid user ID");
        return safeIPC("user:memory-search", async () => {
            try {
                return success({ records: userMemory.search(cleanId, safeString(query), { limit }) });
            } catch (memError) {
                return failure(memError?.message || "Memory unavailable");
            }
        });
    });

    registerHandler("user:memory-forget", async (_event, userId, key) => {
        const cleanId = safeString(userId);
        if (!userManager.isValidUserId(cleanId)) return failure("Invalid user ID");
        return safeIPC("user:memory-forget", async () => {
            const forgotten = userMemory.forgetByKey(cleanId, safeString(key));
            return forgotten ? success({ key, count: 1 }) : failure("No such fact.");
        });
    });

    registerHandler("user:memory-forget-all", async (_event, userId, confirm) => {
        const cleanId = safeString(userId);
        if (!userManager.isValidUserId(cleanId)) return failure("Invalid user ID");
        return safeIPC("user:memory-forget-all", async () => {
            const result = userMemory.forgetAll(cleanId, confirm === true);
            return result.success ? success(result) : failure(result.error);
        });
    });

    registerHandler("user:memory-stats", async (_event, userId) => {
        const cleanId = safeString(userId);
        if (!userManager.isValidUserId(cleanId)) return failure("Invalid user ID");
        return safeIPC("user:memory-stats", async () => {
            try {
                return success({ stats: userMemory.stats(cleanId) });
            } catch (memError) {
                return failure(memError?.message || "Memory unavailable");
            }
        });
    });

    registerHandler("user:context", async () =>
        safeIPC("user:context", async () => {
            // Full user context for the Brain: profile + prefs + memory of ACTIVE user
            initUserSystem();
            const activeId = userManager.getActiveUserId();
            if (!activeId) return success({ userId: null, context: null });
            const context = userManager.getUserContext(activeId);
            let memoryBlock = "";
            try { memoryBlock = userMemory.buildContextBlock(activeId); } catch (_) {}
            return success({ userId: activeId, context, memoryBlock });
        })
    );

    // ========================================================
    // UPGRADED USER SYSTEM — PIN, Roles, Activity, Sessions, Merge
    // ========================================================

    registerHandler("user:verify-pin", async (_event, userId, pin) => {
        const cleanId = safeString(userId);
        if (!userManager.isValidUserId(cleanId)) return failure("Invalid user ID");
        return safeIPC("user:verify-pin", async () => {
            const result = userManager.verifyUserPin(cleanId, pin);
            return result.success ? success(result) : failure(result.error);
        });
    });

    registerHandler("user:set-pin", async (_event, userId, pin) => {
        const cleanId = safeString(userId);
        if (!userManager.isValidUserId(cleanId)) return failure("Invalid user ID");
        return safeIPC("user:set-pin", async () => {
            const result = userManager.setPin(cleanId, pin);
            return result.success ? success(result) : failure(result.error);
        });
    });

    registerHandler("user:update-pin", async (_event, userId, oldPin, newPin) => {
        const cleanId = safeString(userId);
        if (!userManager.isValidUserId(cleanId)) return failure("Invalid user ID");
        return safeIPC("user:update-pin", async () => {
            const result = userManager.updatePin(cleanId, oldPin, newPin);
            return result.success ? success(result) : failure(result.error);
        });
    });

    registerHandler("user:remove-pin", async (_event, userId, pin) => {
        const cleanId = safeString(userId);
        if (!userManager.isValidUserId(cleanId)) return failure("Invalid user ID");
        return safeIPC("user:remove-pin", async () => {
            const result = userManager.removePin(cleanId, pin);
            return result.success ? success(result) : failure(result.error);
        });
    });

    registerHandler("user:has-pin", async (_event, userId) => {
        const cleanId = safeString(userId);
        if (!userManager.isValidUserId(cleanId)) return failure("Invalid user ID");
        return success({ hasPin: userManager.hasPin(cleanId) });
    });

    registerHandler("user:get-role", async (_event, userId) => {
        const cleanId = safeString(userId);
        if (!userManager.isValidUserId(cleanId)) return failure("Invalid user ID");
        return success({ role: userManager.getRole(cleanId) });
    });

    registerHandler("user:set-role", async (_event, userId, role, requestingUserId) => {
        const cleanId = safeString(userId);
        if (!userManager.isValidUserId(cleanId)) return failure("Invalid user ID");
        return safeIPC("user:set-role", async () => {
            const actor = userManager.getActiveUserId();
            if (!actor || !userManager.isAdmin(actor) || userManager.isSessionLocked(actor)) return failure("An unlocked administrator session is required.");
            const result = userManager.setRole(cleanId, role, actor);
            return result.success ? success(result) : failure(result.error);
        });
    });

    registerHandler("user:get-activity", async (_event, userId) => {
        const cleanId = safeString(userId);
        if (!userManager.isValidUserId(cleanId)) return failure("Invalid user ID");
        return success({ activity: userManager.getActivity(cleanId) });
    });

    registerHandler("user:record-message", async (_event, userId) => {
        const cleanId = safeString(userId);
        if (!userManager.isValidUserId(cleanId)) return success({ recorded: false });
        userManager.recordMessage(cleanId);
        userManager.touchSession(cleanId);
        return success({ recorded: true });
    });

    registerHandler("user:record-voice", async (_event, userId) => {
        const cleanId = safeString(userId);
        if (!userManager.isValidUserId(cleanId)) return success({ recorded: false });
        userManager.recordVoiceCommand(cleanId);
        return success({ recorded: true });
    });

    registerHandler("user:record-command", async (_event, userId) => {
        const cleanId = safeString(userId);
        if (!userManager.isValidUserId(cleanId)) return success({ recorded: false });
        userManager.recordCommand(cleanId);
        return success({ recorded: true });
    });

    registerHandler("user:get-storage", async (_event, userId) => {
        const cleanId = safeString(userId);
        if (!userManager.isValidUserId(cleanId)) return failure("Invalid user ID");
        const bytes = userManager.getStorageUsage(cleanId);
        return success({ bytes, formatted: userManager.formatBytes(bytes) });
    });

    registerHandler("user:merge", async (_event, sourceId, targetId, requestingUserId) => {
        const srcId = safeString(sourceId);
        const tgtId = safeString(targetId);
        if (!userManager.isValidUserId(srcId) || !userManager.isValidUserId(tgtId)) {
            return failure("Invalid user IDs");
        }
        return safeIPC("user:merge", async () => {
            const actor = userManager.getActiveUserId();
            if (!actor || !userManager.isAdmin(actor) || userManager.isSessionLocked(actor)) return failure("An unlocked administrator session is required.");
            const result = userManager.mergeUsers(srcId, tgtId, actor);
            return result.success ? success(result) : failure(result.error);
        });
    });

    registerHandler("user:lock-session", async (_event, userId) => {
        const cleanId = safeString(userId);
        userManager.lockSession(cleanId);
        return success({ locked: true });
    });

    registerHandler("user:unlock-session", async (_event, userId, pin) => {
        const cleanId = safeString(userId);
        return safeIPC("user:unlock-session", async () => {
            const result = userManager.unlockSession(cleanId, pin);
            return result.success ? success(result) : failure(result.error);
        });
    });

    registerHandler("user:get-session", async (_event, userId) => {
        const cleanId = safeString(userId);
        const session = userManager.getSession(cleanId);
        return success({ session, locked: userManager.isSessionLocked(cleanId) });
    });

    // ========================================================
    // FEATURE UPGRADE v2.1 — MEMORY IMPORTANCE ENGINE
    // ========================================================

    registerHandler("user:memory-top", async (_event, userId, limit) => {
        const cleanId = safeString(userId);
        if (!userManager.isValidUserId(cleanId)) return failure("Invalid user ID");
        return safeIPC("user:memory-top", async () => {
            try {
                const memoryImportance = require("./src/users/memoryImportance");
                return success({ top: memoryImportance.topFacts(cleanId, Number(limit) || 10) });
            } catch (memError) {
                return failure(memError?.message || "Memory importance unavailable");
            }
        });
    });

    registerHandler("user:memory-reinforce", async (_event, userId, key) => {
        const cleanId = safeString(userId);
        if (!userManager.isValidUserId(cleanId)) return failure("Invalid user ID");
        return safeIPC("user:memory-reinforce", async () => {
            try {
                const memoryImportance = require("./src/users/memoryImportance");
                const ok = memoryImportance.reinforce(cleanId, safeString(key));
                return ok ? success({ reinforced: true }) : failure("Could not reinforce");
            } catch (memError) {
                return failure(memError?.message || "Memory importance unavailable");
            }
        });
    });

    registerHandler("user:memory-stale", async (_event, userId, days) => {
        const cleanId = safeString(userId);
        if (!userManager.isValidUserId(cleanId)) return failure("Invalid user ID");
        return safeIPC("user:memory-stale", async () => {
            try {
                const memoryImportance = require("./src/users/memoryImportance");
                return success({ stale: memoryImportance.staleFacts(cleanId, Number(days) || 30) });
            } catch (memError) {
                return failure(memError?.message || "Memory importance unavailable");
            }
        });
    });

    registerHandler("user:memory-score", async (_event, userId, key, value) => {
        const cleanId = safeString(userId);
        if (!userManager.isValidUserId(cleanId)) return failure("Invalid user ID");
        return safeIPC("user:memory-score", async () => {
            try {
                const memoryImportance = require("./src/users/memoryImportance");
                return success({ scored: memoryImportance.scoreFact(safeString(key), safeString(value), cleanId) });
            } catch (memError) {
                return failure(memError?.message || "Memory importance unavailable");
            }
        });
    });

    registerHandler("user:touch-session", async (_event, userId) => {
        const cleanId = safeString(userId);
        userManager.touchSession(cleanId);
        userManager.touchUser(cleanId);
        return success({ touched: true });
    });

    // End of user IPC
    registerHandler("memory:get-facts", async () =>
        success({ facts: getActiveUserMemory().allFacts() })
    );

    registerHandler("memory:remember-message", async (_event, message) => {
        const text = safeString(message);
        if (!text) return failure("Memory message is required.");
        const userId = userManager.getActiveUserId();
        if (!userId || !userMemory.canWrite(userId)) return failure("Persistent memory is disabled in Privacy settings.");

        return safeIPC("memory:remember-message", async () => {
            const engine = getActiveUserMemory();
            const classification = engine.classifyMessage(text);
            if (classification.blocked) return failure("This looks like sensitive information, so JARVIS did not save it.");
            let stored = engine.extractFromMessage(text, { source: "memory-command" });
            const project = /\b(project|progress|bug|next task|तक काम|प्रोजेक्ट)\b/i.test(text);
            if (!stored.length || project) {
                const readField = (...labels) => {
                    const label = labels.join("|");
                    const match = text.match(new RegExp(`(?:^|[;\\n,])\\s*(?:${label})\\s*[:=]\\s*([^;\\n,]+)`, "i"));
                    return match?.[1]?.trim().slice(0, 500) || null;
                };
                const projectName = readField("project(?:\\s*name)?", "प्रोजेक्ट(?:\\s*का\\s*नाम)?");
                const detail = {
                    explicitlyRequested: true,
                    verifiedProgress: false,
                    projectName,
                    directory: readField("directory", "folder", "path"),
                    stack: readField("stack", "technology(?:\\s*stack)?", "tech"),
                    currentState: readField("current\\s*state", "status", "progress", "अभी\\s*की\\s*स्थिति"),
                    completedFeatures: readField("completed(?:\\s*features)?", "done", "पूरा"),
                    knownBugs: readField("bugs?", "issues?", "समस्याएँ"),
                    lastVerifiedProgress: readField("last\\s*verified(?:\\s*progress)?", "verified"),
                    decisions: readField("decisions?", "निर्णय"),
                    nextTask: readField("next\\s*task", "next", "अगला\\s*काम")
                };
                const slug = projectName ? projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) : "";
                const fingerprint = crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
                const key = project ? `project.note.${slug || fingerprint}` : `user.note.${fingerprint}`;
                const record = engine.remember(key, text, {
                    source: "explicit-memory-command",
                    type: project ? "USER_PROJECT" : "USER_FACT",
                    category: project ? "project" : "personal_note",
                    tags: ["explicit-save", ...(project ? ["project-progress"] : [])],
                    metadata: project ? detail : { explicitlyRequested: true }
                });
                if (record) stored = [...stored.filter(item => item.key !== record.key), record];
            }
            return stored.length ? success({ stored }) : failure("I could not safely save that memory.");
        });
    });

    registerHandler("memory:search", async (_event, query, limit) =>
        safeIPC("memory:search", async () =>
            success({ records: getActiveUserMemory().search(safeString(query), { limit }) })
        )
    );

    registerHandler("memory:forget-statement", async (_event, statement) =>
        safeIPC("memory:forget-statement", async () => {
            const text = safeString(statement);
            const classification = getActiveUserMemory().classifyMessage(text);
            const keys = [...new Set(classification.candidates.map(item => item.key))];
            let count = 0;
            for (const key of keys) {
                if (getActiveUserMemory().forgetByKey(key)) count++;
            }
            return success({ keys, count });
        })
    );

    registerHandler("memory:forget-key", async (_event, key) => {
        const cleanKey = safeString(key);
        const forgotten = getActiveUserMemory().forgetByKey(cleanKey);
        return forgotten ? success({ key: cleanKey, count: 1 }) : failure("No such fact.");
    });

    registerHandler("memory:forget-type", async (_event, type) =>
        safeIPC("memory:forget-type", async () => {
            const cleanType = safeString(type);
            const count = getActiveUserMemory().forgetByType(cleanType);
            return success({ type: cleanType, count });
        })
    );

    registerHandler("memory:forget-all", async (_event, confirm) =>
        safeIPC("memory:forget-all", async () => {
            // PHASE 8: broad "forget everything" deletion must never
            // happen silently — require an explicit confirm flag from
            // the renderer (which is expected to have already asked
            // the user) before touching any records.
            if (confirm !== true) {
                const wouldRemove = getActiveUserMemory().allRecords().length;
                return failure(
                    `This will forget ${wouldRemove} stored fact(s). Call again with confirm=true to proceed.`
                );
            }
            return success({ count: getActiveUserMemory().forgetAll() });
        })
    );

    // PHASE 8 — additive memory IPC surface. Reuses the single
    // memoryEngine singleton; no new persistence layer, no new
    // filesystem access, all inputs validated by MemoryEngine itself.
    registerHandler("memory:list", async (_event, options) =>
        safeIPC("memory:list", async () =>
            success({ records: getActiveUserMemory().list(options && typeof options === "object" ? options : {}) })
        )
    );

    registerHandler("memory:get", async (_event, key) =>
        safeIPC("memory:get", async () => {
            const record = getActiveUserMemory().get(safeString(key));
            return record ? success({ record }) : failure("No such fact.");
        })
    );

    registerHandler("memory:stats", async () =>
        safeIPC("memory:stats", async () =>
            success({ stats: getActiveUserMemory().stats() })
        )
    );

    registerHandler("memory:update", async (_event, key, patch) =>
        safeIPC("memory:update", async () => {
            const userId = userManager.getActiveUserId();
            if (!userId || !userMemory.canWrite(userId)) return failure("Persistent memory is disabled in Privacy settings.");
            const engine = getActiveUserMemory();
            const cleanKey = safeString(key);
            const updates = patch && typeof patch === "object" ? patch : {};
            const existing = engine.get(cleanKey);
            const record = existing && updates.value !== undefined
                ? engine.remember(cleanKey, updates.value, {
                    source: "memory-manager-edit", type: existing.type, category: updates.category || existing.category,
                    tags: updates.tags || existing.tags, importance: existing.importance,
                    metadata: { ...existing.metadata, ...(updates.metadata || {}), editedInMemoryManager: true }
                })
                : engine.update(cleanKey, updates);
            return record ? success({ record }) : failure("No such fact.");
        })
    );

    registerHandler("memory:clear", async (_event, confirm) =>
        safeIPC("memory:clear", async () => {
            const result = getActiveUserMemory().clear({ confirm: confirm === true });
            return result.cleared ? success(result) : failure(result.message, result);
        })
    );

    registerHandler("memory:forget-fact", async (_event, key) => {
        const forgotten = getActiveUserMemory().forget(safeString(key));
        return forgotten ? success({ key }) : failure("No such fact.");
    });
}

// DETERMINISTIC BRAIN — ZERO AI / ZERO LLM (see src/ai/deterministicBrain.js).
// No language model, no cloud API, no local LLM server. Replies are
// composed deterministically from the offline knowledge cache, memory
// and language templates. Unknown topics are queued for background
// research by the learning system.
const deterministicBrain = require("./src/ai/deterministicBrain");

let cachedPersonalityPrompt = null;
function getPersonalityPrompt() {
    if (cachedPersonalityPrompt !== null) return cachedPersonalityPrompt;
    try {
        const p = path.join(__dirname, "prompts", "personality.txt");
        cachedPersonalityPrompt = fs.readFileSync(p, "utf8").trim();
    } catch (_e) {
        cachedPersonalityPrompt = "You are JARVIS, a helpful offline personal assistant.";
    }
    return cachedPersonalityPrompt;
}

/* ============================================================
   AI REQUEST SERIALIZATION QUEUE
============================================================
 * Serializes concurrent AI requests instead of letting them race
 * against shared chatHistory / memory / consciousness state (and
 * instead of silently dropping the second one).
 *
 * FIX: enqueueAIRequest() was called from registerAIIPC() ("ai:ask")
 * and callAvailableAI() ("ai:chat") but was never defined, so EVERY
 * chat/brain request failed with "enqueueAIRequest is not defined".
 * */
let aiRequestQueueTail = Promise.resolve();

function enqueueAIRequest(taskFn) {
    if (typeof taskFn !== "function") {
        return Promise.reject(
            new TypeError("enqueueAIRequest requires a function")
        );
    }

    // Run after the previous request settles — success or failure.
    const run = aiRequestQueueTail.then(taskFn, taskFn);

    // Keep the queue usable even when a request rejects: the tail
    // itself never rejects, so one failed request can never wedge
    // the queue and leave JARVIS stuck "thinking".
    aiRequestQueueTail = run.then(() => {}, () => {});

    return run;
}

/* ============================================================
   OLLAMA MESSAGE BUILDER
   ------------------------------------------------------------
   Assembles the chat message list for the local Ollama model:
     - JARVIS persona (prompts/personality.txt — offline, warm,
       language-matching assistant)
     - remembered user facts (memory context — only what the user
       explicitly asked JARVIS to remember; nothing fabricated)
     - recent working-memory turns for continuity
     - offline local knowledge when the network is down
   The user's language instruction (Hindi / English / Hinglish /
       Devanagari) is honored so the assistant replies in the same
   language/style the user spoke in.
   Output is CONVERSATION ONLY — never interpreted as an OS command.
============================================================ */
function getResponseStyleInstruction() {
    try { return initConsciousness().getStyleInstruction() || ""; }
    catch (_) { return ""; }
}

function buildOllamaMessages(text, { language, memoryContext, workingMemory, localKnowledge, activeUserName } = {}) {
    let persona;
    try {
        persona = fs.readFileSync(path.join(__dirname, "prompts", "personality.txt"), "utf8").trim();
    } catch (_) {
        persona = "You are JARVIS, a warm, witty personal AI assistant running entirely on the user's own computer, fully offline.";
    }

    const languageRule = {
        hindi: "The user is writing in Hindi (Devanagari). Reply in natural Hindi.",
        hi: "The user is writing in Hindi (Devanagari). Reply in natural Hindi.",
        hinglish: "The user writes Hinglish (romanized Hindi mixed with English). Reply naturally in the same Hinglish style.",
        en: "The user is writing in English. Reply in English."
    }[String(language || "").toLowerCase()] || "Reply in the same language and style the user used (Hindi, Hinglish or English).";

    const responseStyleInstruction = getResponseStyleInstruction();

    const systemParts = [
        persona,
        languageRule,
        responseStyleInstruction,
        activeUserName ? `CURRENT ACTIVE USER: ${activeUserName}. Use this name only when contextually appropriate.` : "",
        "You are the conversational half of JARVIS: deterministic PC commands (opening apps, locking, volume, shutdown, etc.) are handled by a separate engine — never claim to have performed an action. If the user asks you to DO something on the computer, tell them to phrase it as a direct JARVIS command instead.",
        "Keep replies concise and speech-friendly (JARVIS speaks them aloud with TTS): usually 1–4 sentences."
    ];

    if (memoryContext && String(memoryContext).trim()) {
        systemParts.push(String(memoryContext).trim().slice(0, 1600));
    }

    if (Array.isArray(localKnowledge) && localKnowledge.length > 0) {
        const facts = localKnowledge
            .slice(0, 3)
            .map((k) => `- ${k.content} (Source: ${k.source})`)
            .join("\n");
        systemParts.push(`OFFLINE LOCAL KNOWLEDGE (verified, learned earlier — prefer these if relevant):\n${facts}`);
    }

    const messages = [{ role: "system", content: systemParts.join("\n\n") }];

    // Recent conversation for continuity (excluding this very turn, which
    // is appended as the final user message below).
    if (Array.isArray(workingMemory)) {
        for (const turn of workingMemory.slice(-4)) {
            if (turn && (turn.role === "user" || turn.role === "assistant") && turn.text && turn.text !== text) {
                messages.push({ role: turn.role, content: String(turn.text).slice(0, 900) });
            }
        }
    }

    messages.push({ role: "user", content: String(text || "").slice(0, 4000) });
    return messages;
}

async function openPresentationPreviewWindow(previewPath) {
    if (!previewPath || !fs.existsSync(previewPath)) return false;
    const previewWindow = new BrowserWindow({
        width: 1180, height: 860, minWidth: 720, minHeight: 520,
        title: "JARVIS · Presentation preview",
        parent: mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
        show: false,
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
    });
    previewWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    try {
        await previewWindow.loadFile(previewPath);
        await previewWindow.webContents.executeJavaScript("document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
        const layoutCheck = await previewWindow.webContents.executeJavaScript(`(() => {
            const slides = [...document.querySelectorAll('.slide')];
            const issues = [];
            for (const [index, slide] of slides.entries()) {
                const content = slide.querySelector('.slide-content');
                if (!content) { issues.push({ slide: index + 1, reason: 'slide content is missing' }); continue; }
                // Shrink long Hindi/English headings to fit the actual preview
                // box before measuring it. CSS alone cannot predict script
                // fallback metrics (notably Devanagari on Windows).
                for (const heading of slide.querySelectorAll('h2')) {
                    const minSize = heading.closest('.cover') ? 18 : 16;
                    let size = Number.parseFloat(getComputedStyle(heading).fontSize) || 32;
                    while (size > minSize && (heading.scrollWidth > heading.clientWidth + 2 || heading.scrollHeight > heading.clientHeight + 2)) {
                        size -= 1;
                        heading.style.fontSize = size + 'px';
                    }
                }
                const frame = content.getBoundingClientRect();
                for (const element of content.querySelectorAll('*')) {
                    const rect = element.getBoundingClientRect();
                    if (rect.width && rect.height && (rect.left < frame.left - 3 || rect.right > frame.right + 3 || rect.top < frame.top - 3 || rect.bottom > frame.bottom + 3)) {
                        issues.push({ slide: index + 1, reason: 'content extends outside the slide content area' }); break;
                    }
                    if (element.clientHeight > 0 && (element.scrollHeight > element.clientHeight + 8 || element.scrollWidth > element.clientWidth + 8) && /^(P|H1|H2|H3|LI)$/.test(element.tagName)) {
                        issues.push({ slide: index + 1, reason: 'text may be clipped in the preview' }); break;
                    }
                }
            }
            const status = document.getElementById('layoutCheckStatus');
            if (status) { status.dataset.state = issues.length ? 'warning' : 'passed'; status.textContent = issues.length ? 'Preview layout check found possible issue(s): ' + [...new Set(issues.map(item => 'slide ' + item.slide))].join(', ') + '. Review those slides.' : 'Preview layout check passed for ' + slides.length + ' slides. This is a Chromium preview check, not a PowerPoint rendering check.'; }
            return { checkedSlides: slides.length, issueCount: issues.length, issues: issues.slice(0, 20) };
        })()`);
        try {
            await previewWindow.webContents.executeJavaScript("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => { document.querySelector('.grid')?.scrollIntoView(); resolve(true); })))");
            const image = await previewWindow.webContents.capturePage({ x: 0, y: 0, width: 1180, height: 560 });
            const thumbnailPath = previewPath.replace(/\.preview\.html$/i, ".thumb.png");
            if (!image.isEmpty() && !fs.existsSync(thumbnailPath)) fs.writeFileSync(thumbnailPath, image.resize({ width: 760 }).toPNG());
        } catch (thumbnailError) {
            console.warn("[PRESENTATION] Preview thumbnail could not be saved:", thumbnailError?.message || thumbnailError);
        }
        previewWindow.show();
        return { opened: true, layoutCheck };
    } catch (error) {
        if (!previewWindow.isDestroyed()) previewWindow.destroy();
        console.warn("[PRESENTATION] Slide preview could not be opened:", error?.message || error);
        return { opened: false, error: error?.message || String(error), layoutCheck: null };
    }
}

// When Microsoft PowerPoint is installed, use its own rendering engine to
// export the saved PPTX slides. The HTML preview remains the safe fallback;
// it is never reported as an Office render.
async function isPowerPointAutomationAvailable() {
    if (process.platform !== "win32") return false;
    const script = "$ErrorActionPreference='Stop'; if (Test-Path 'Registry::HKEY_CLASSES_ROOT\\PowerPoint.Application\\CLSID') { 'available' } else { 'unavailable' }";
    return new Promise(resolve => execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script], { windowsHide: true, timeout: 5000, maxBuffer: 16 * 1024 }, (error, stdout) => resolve(!error && String(stdout || "").trim() === "available")));
}

async function renderPptxWithPowerPoint(pptxPath, expectedSlides = 0) {
    if (process.platform !== "win32") return { available: false, renderer: "none", reason: "PowerPoint rendering is supported only on Windows." };
    const input = path.resolve(String(pptxPath || ""));
    const presentationRoot = path.resolve(app.getPath("documents"), "JARVIS Presentations");
    if (!input.toLowerCase().startsWith(`${presentationRoot}${path.sep}`.toLowerCase()) || !input.toLowerCase().endsWith(".pptx") || !fs.existsSync(input)) {
        return { available: false, renderer: "none", reason: "The presentation is outside the generated documents folder." };
    }
    const registered = await isPowerPointAutomationAvailable();
    if (!registered) return { available: false, renderer: "none", reason: "Microsoft PowerPoint rendering is not installed or registered. The Chromium slide preview is available instead." };
    const renderDir = input.replace(/\.pptx$/i, ".rendered");
    fs.mkdirSync(renderDir, { recursive: true });
    const encode = value => Buffer.from(value, "utf8").toString("base64");
    const inputB64 = encode(input);
    const outputB64 = encode(renderDir);
    const command = [
        "$ErrorActionPreference='Stop'",
        `$inputPath=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${inputB64}'))`,
        `$outputDir=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${outputB64}'))`,
        "$ppt=$null; $deck=$null",
        "try { $ppt=New-Object -ComObject PowerPoint.Application; $ppt.DisplayAlerts=0; $deck=$ppt.Presentations.Open($inputPath,$true,$false,$false); $deck.Export((Join-Path $outputDir 'slide'),'PNG',1440,810); $deck.Close(); $deck=$null; $ppt.Quit(); $ppt=$null; Get-ChildItem -LiteralPath $outputDir -Filter '*.png' -File | Sort-Object Name | Select-Object -ExpandProperty FullName | ConvertTo-Json -Compress }",
        "finally { if ($deck) { try { $deck.Close() } catch {} }; if ($ppt) { try { $ppt.Quit() } catch {} } }"
    ].join("\r\n");
    const encoded = Buffer.from(command, "utf16le").toString("base64");
    const output = await new Promise(resolve => execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-EncodedCommand", encoded], { windowsHide: true, timeout: 90000, maxBuffer: 128 * 1024 }, (error, stdout, stderr) => resolve({ error, stdout: String(stdout || "").trim(), stderr: String(stderr || "").trim() })));
    if (output.error) return { available: true, renderer: "Microsoft PowerPoint", rendered: false, reason: String(output.stderr || output.error.message || "PowerPoint could not render the presentation.").slice(0, 400) };
    let files = [];
    try { const parsed = JSON.parse(output.stdout || "[]"); files = (Array.isArray(parsed) ? parsed : [parsed]).filter(file => typeof file === "string" && fs.existsSync(file)); } catch (_) {}
    files.sort((a, b) => Number(a.match(/slide(\d+)/i)?.[1] || a.match(/(\d+)(?=\.png$)/i)?.[1] || 0) - Number(b.match(/slide(\d+)/i)?.[1] || b.match(/(\d+)(?=\.png$)/i)?.[1] || 0));
    if (!files.length) return { available: true, renderer: "Microsoft PowerPoint", rendered: false, reason: "PowerPoint opened, but no slide image exports were found." };
    const slideReports = [];
    const renderedHashes = new Set();
    for (let index = 0; index < files.length; index += 1) {
        try {
            const sharp = require("sharp");
            const image = sharp(files[index]);
            const [metadata, stats, raw] = await Promise.all([image.metadata(), image.stats(), image.clone().ensureAlpha().raw().toBuffer()]);
            const hash = crypto.createHash("sha256").update(raw).digest("hex");
            const duplicate = renderedHashes.has(hash);
            renderedHashes.add(hash);
            slideReports.push({ slide: index + 1, width: metadata.width || 0, height: metadata.height || 0, entropy: Number(stats.entropy.toFixed(3)), duplicate });
        } catch (error) {
            slideReports.push({ slide: index + 1, error: String(error?.message || error).slice(0, 160) });
        }
    }
    const warnings = [];
    const renderErrors = slideReports.filter(item => item.error).map(item => item.slide);
    const smallSlides = slideReports.filter(item => !item.error && (item.width < 1000 || item.height < 560)).map(item => item.slide);
    const lowDetailSlides = slideReports.filter(item => !item.error && item.entropy < 0.04).map(item => item.slide);
    const duplicateSlides = slideReports.filter(item => item.duplicate).map(item => item.slide);
    if (expectedSlides && files.length !== expectedSlides) warnings.push(`PowerPoint exported ${files.length} of ${expectedSlides} requested slides.`);
    if (renderErrors.length) warnings.push(`Could not inspect rendered pixels for slide(s): ${renderErrors.join(", ")}.`);
    if (smallSlides.length) warnings.push(`Rendered image resolution is low on slide(s): ${smallSlides.join(", ")}.`);
    if (lowDetailSlides.length) warnings.push(`Rendered slide(s) appear blank or nearly blank: ${lowDetailSlides.join(", ")}.`);
    if (duplicateSlides.length) warnings.push(`Rendered slides are visually identical at the pixel level: ${duplicateSlides.join(", ")}.`);
    return { available: true, renderer: "Microsoft PowerPoint", rendered: true, slideCount: files.length, slides: files, slideReports, warnings };
}

async function handleAIAsk(text, context = {}) {
    const __trace = {
        requestId: "req_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8),
        startedAt: new Date().toISOString(),
    };
    const layer = initConsciousness();
    // IMPORTANT: conversational memory is strictly scoped to the active user.
    // The legacy global MemoryEngine remains available for legacy APIs, but
    // this user-facing conversation path must never mix users.
    initUserSystem();
    const activeUserId = userManager.getActiveUserId();
    const memory = activeUserId ? userMemory.getEngine(activeUserId) : null;
    if (!memory) {
        layer.setMode("ERROR");
        return { success: false, handled: false, source: "ai", response: null,
            error: "No active user session is available." };
    }

    layer.setMode("THINKING");

    // MEMORY — only store facts that are explicitly present in this
    // message; never invent anything (see src/ai/memory.js).
    const storedFacts = userMemory.canRecordConversation(activeUserId)
        ? memory.extractFromMessage(text, { source: "conversation" }) : [];
    if (storedFacts.length > 0) {
        log(`[MEMORY] Stored ${storedFacts.length} fact(s): ${storedFacts.map(f => f.key).join(", ")}`);
    }

    // GOAL DETECTION — same "only act on what was explicitly said" rule
    // as memory extraction above. Matches an explicit goal-setting phrase
    // in English or Hinglish; never infers a goal from general chit-chat.
    const goalMatch = text.match(
        /^(?:set a goal to|my goal is to|my goal is|mera goal hai)\s+(.+)$/i
    );
    if (goalMatch && goalMatch[1]) {
        const goalTitle = goalMatch[1].trim().slice(0, 200);
        layer.setGoal(goalTitle);
        log(`[COGNITION] Goal set: ${goalTitle}`);
    }

    // Consciousness.detectLanguage() uses the canonical codes `hi`,
    // `hinglish`, and `en`. Older chat branches compared against the word
    // `hindi`, so Hindi was detected correctly but local greetings/fallbacks
    // silently took their English branch. Normalize once here and use `hi`
    // consistently through this response pipeline.
    const detectedLanguageRaw = layer.detectLanguage(text);
    const detectedLanguageByText = String(detectedLanguageRaw || "en").toLowerCase() === "hindi"
        ? "hi"
        : String(detectedLanguageRaw || "en").toLowerCase();
    const requestedResponseLanguage = String(context.responseLanguage || "").toLowerCase();
    const detectedLanguage = ["hi", "hinglish", "en"].includes(requestedResponseLanguage)
        ? requestedResponseLanguage
        : detectedLanguageByText;

    // OFFLINE FALLBACK — when the network is unavailable, stable/general
    // facts already collected by the real background learner are supplied
    // to the existing local answer pipeline. Time-sensitive questions are
    // deliberately excluded so stale cached data is never presented as
    // current.
    let localKnowledge = [];
    let offline = false;
    const chatProviderConfig = openAICompatibleClient.getConfig();
    // The provider selected in Settings is authoritative for normal chat.
    // A failed selected provider falls back to local memory only; it must not
    // silently switch the user's request to a different AI provider.
    let ollamaStatus = { running: false, selectedModel: "", connected: false, enabled: false };
    try {
        ollamaStatus = await ollamaClient.getStatus();
        if (!ollamaStatus.enabled) ollamaStatus.connected = false;
        if (!ollamaStatus.connected) offline = !(await offlineCache.isOnline());
        const timeSensitive = /\b(today|now|currently|current|latest|live|aaj|abhi|filhaal|taaza|taza)\b/i.test(text);
        if (offline && !timeSensitive) {
            localKnowledge = offlineCache.findRelevantKnowledge(text, 3);
            if (localKnowledge.length > 0) {
                log(`[BACKGROUND-LEARNING] Offline fallback found ${localKnowledge.length} local knowledge record(s).`);
            }
        }
    } catch (offlineError) {
        log("[BACKGROUND-LEARNING] Offline knowledge lookup skipped:", getErrorMessage(offlineError));
    }

    try {
        // DETERMINISTIC COMPOSITION — no LLM call, ever. This runs FIRST:
        // commands and knowledge-based answers are deterministic.
        const greetingMatch = /^(?:hello|hi|hey|good\s+morning|good\s+afternoon|good\s+evening|namaste|namaskar|नमस्ते|नमस्कार)(?:\s+jarvis)?[!., ]*$/iu.test(String(text || "").trim());
        const activeName = userManager.getActiveUser()?.name || "";
        const result = greetingMatch
            ? {
                reply: detectedLanguage === "hi"
                    ? `नमस्ते${activeName ? ` ${activeName}` : ""}! मैं यहाँ हूँ। आज मैं आपकी किस तरह मदद करूँ?`
                    : `Hello${activeName ? ` ${activeName}` : ""}! I'm here and ready to help. What would you like to do?`,
                source: "deterministic-brain/greeting",
                topic: "greeting",
                usedKnowledge: true,
                researchQueued: false
            }
            : deterministicBrain.compose({
                text,
                language: detectedLanguage,
                localKnowledge,
            });

        // Last-resort local recall: rank saved personal facts against the
        // user's meaningful words. This stays on-device and never invents
        // a fact when neither AI service is reachable.
        const localMemoryMatches = (() => {
            try {
                const ignored = new Set(["the", "and", "for", "that", "this", "with", "what", "when", "where", "which", "who", "how", "about", "from", "have", "does", "did", "will", "would", "could", "should", "you", "your", "are", "was", "were", "में", "क्या", "कैसे", "कहाँ", "कब", "मुझे", "बताओ", "अभी", "और", "का", "की", "के", "है", "हैं", "था", "थी", "हो", "कर", "दो", "जार्विस"]);
                const terms = [...new Set((String(text || "").toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []).filter(term => !ignored.has(term)))];
                if (!terms.length || typeof memory.allRecords !== "function") return [];
                return memory.allRecords()
                    .map(record => {
                        const haystack = [record.key, record.type, record.category, record.value, ...(record.tags || [])].join(" ").toLocaleLowerCase();
                        const score = terms.reduce((count, term) => count + (haystack.includes(term) ? 1 : 0), 0);
                        return { record, score };
                    })
                    .filter(item => item.score > 0)
                    .sort((a, b) => (b.score - a.score) || ((b.record.importance || 0) - (a.record.importance || 0)))
                    .slice(0, 3)
                    .map(item => item.record);
            } catch (error) {
                console.warn("[MEMORY] Local fallback recall failed:", getErrorMessage(error));
                return [];
            }
        })();
        const localMemoryReply = () => {
            if (localKnowledge.length) {
                const best = localKnowledge[0];
                return `${best.content}${best.source ? `\n\nSource: ${best.source}` : ""}${best.sourceUrl ? `\n${best.sourceUrl}` : ""}`;
            }
            if (!localMemoryMatches.length) return result.reply || "मुझे इसका जवाब अपनी लोकल मेमोरी में नहीं मिला।";
            const facts = localMemoryMatches.map(item => `${item.key}: ${item.value}`).join("\n");
            return detectedLanguage === "hi"
                ? `मेरी लोकल मेमोरी में यह जानकारी मिली है:\n${facts}`
                : detectedLanguage === "hinglish"
                    ? `Meri local memory mein yeh jaankari mili hai:\n${facts}`
                    : `I found this in my local memory:\n${facts}`;
        };

        // ------------------------------------------------------------
        // SELECTED CHAT PROVIDER — the configured provider is authoritative;
        // Ollama is used here only when Ollama itself is selected.
        // This handler is reached after ChatEngine's deterministic command
        // routes. When neither service can answer, use local memory/knowledge.
        // This remains local conversation only — Ollama cannot execute PC
        // actions, which are handled by the separate safety-gated engine.
        // Ollama NEVER controls the computer: its output is plain text,
        // shown/spoken to the user. All PC actions remain in the
        // deterministic Action Engine / SafetyGate pipeline.
        // ------------------------------------------------------------
    let reply = result.reply;
    let source = result.usedKnowledge ? "deterministic-brain/knowledge" : "deterministic-brain/unknown";
    let ollamaUsed = false;
    let remoteProviderUsed = false;
    let remoteProviderModel = "";
        let remoteProviderError = "";

        // Reuse an exact prior local-model answer before paying for another
        // inference. The disk-backed offline cache survives restarts.
        const answerCacheKey = `ollama-answer:${String(text).toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, " ").trim().slice(0, 500)}`;
        let cachedOllamaAnswer = null;
        if (chatProviderConfig.provider !== "ollama") {
            // Never surface a cached Ollama answer while another provider is selected.
            cachedOllamaAnswer = null;
        } else if (ollamaStatus.connected && answerCacheKey.endsWith(":")) {
            // Empty prompts are never cached.
            cachedOllamaAnswer = null;
        } else if (ollamaStatus.connected) {
            try {
                const cached = offlineCache.getText(answerCacheKey);
                const value = cached?.value;
                if (value && typeof value.text === "string" && value.text.trim()) {
                    cachedOllamaAnswer = value;
                    reply = value.text;
                    source = value.model ? `ollama-cache/${value.model}` : "ollama-cache";
                    ollamaUsed = true;
                    log("[OLLAMA] Reused an exact cached answer.");
                }
            } catch (cacheError) {
                console.warn("[OLLAMA] Answer cache lookup failed:", getErrorMessage(cacheError));
            }
        }

        // The selected remote provider is authoritative; its request drives
        // fallback, even when a generic reachability probe is inconclusive.
        if (chatProviderConfig.hasApiKey && ["sarvam", "grok", "groq", "openai-compatible"].includes(chatProviderConfig.provider)) {
            try {
                const styleInstruction = getResponseStyleInstruction();
                // Keep conversational context scoped to this active user. Send
                // only the eight most recent user/assistant turns, with a
                // per-turn size cap, followed by the current message.
                const configuredHistoryTurns = Math.max(0, Math.min(8, Number(chatProviderConfig.sarvamHistoryTurns ?? 8) || 0));
                const availableTurns = (memory.getWorkingMemory?.() || [])
                    .filter(turn => (turn?.role === "user" || turn?.role === "assistant") && String(turn.text || "").trim())
                    .filter(turn => turn.timestamp && Date.now() - Number(turn.timestamp) <= 30 * 60 * 1000);
                const recentTurns = configuredHistoryTurns > 0 ? availableTurns.slice(-configuredHistoryTurns) : [];
                const conversationHistoryMessages = recentTurns.map(turn => ({ role: turn.role, content: String(turn.text).slice(0, 1400) }));
                const languageInstruction = detectedLanguage === "hi"
                    ? "The current user is speaking Hindi. Reply only in natural Hindi written in Devanagari. Do not translate the user's message into English and do not answer in English. Keep product names, app names, and technical terms in their standard spelling when needed."
                    : detectedLanguage === "hinglish"
                        ? "The current user is speaking Hinglish. Reply in natural Hinglish in the same script/style as the user's message; do not translate the whole message into English."
                        : "The current user is speaking English. Reply in English.";
                const conversationMessages = [
                    { role: "system", content: `You are JARVIS, a concise desktop assistant. ${languageInstruction} Give one answer only. Never claim to have performed computer actions; those are handled by local command tools.${styleInstruction ? ` ${styleInstruction}` : ""}` },
                    ...conversationHistoryMessages,
                    { role: "user", content: text.slice(0, 4000) }
                ];
                const remoteReply = await openAICompatibleClient.chat(
                    conversationMessages,
                    { temperature: 0.55, maxTokens: 900, timeoutMs: 45000, includeConversationHistory: true }
                );
                if (remoteReply.success && remoteReply.text) {
                    reply = remoteReply.text;
                    remoteProviderModel = String(remoteReply.model || chatProviderConfig.model || "");
                    source = `${chatProviderConfig.provider}/${remoteReply.model}`;
                    remoteProviderUsed = true;
                    log(`[CHAT] ${chatProviderConfig.provider} answered in ${remoteReply.durationMs}ms (model: ${remoteReply.model}).`);
                    notificationCenter.add({
                        category: "CHAT", type: "SUCCESS", title: `${chatProviderConfig.providerName || chatProviderConfig.provider} response`,
                        message: `Model ${remoteReply.model} answered successfully`, priority: "low", source: "remote-chat"
                    });
                } else {
                    remoteProviderError = remoteReply.error || "The remote API returned no response.";
                }
            } catch (remoteError) {
                remoteProviderError = getErrorMessage(remoteError);
            }
            if (remoteProviderError) {
                console.error(`[CHAT] ${chatProviderConfig.provider} request failed: ${remoteProviderError}`);
                source = `${chatProviderConfig.provider}-error`;
            }
        } else {
            remoteProviderError = !chatProviderConfig.hasApiKey
                ? `${chatProviderConfig.providerName || "Remote AI"} API key is not configured.`
                : "Internet connection is unavailable.";
        }

        if (!remoteProviderUsed && !localKnowledge.length) {
            try { localKnowledge = offlineCache.findRelevantKnowledge(text, 3); }
            catch (error) { console.warn("[MEMORY] Cached knowledge lookup before Ollama failed:", getErrorMessage(error)); }
        }

        const allowOllamaFallback = chatProviderConfig.provider === "ollama";
        if (allowOllamaFallback && ollamaStatus.connected && ollamaStatus.selectedModel) {
            if (!remoteProviderUsed && !cachedOllamaAnswer) {
            const restoreDisconnectedState = ollamaStatus.enabled !== true;
            if (restoreDisconnectedState) ollamaClient.setEnabled(true);
            try {
                if (ollamaStatus.running && ollamaStatus.selectedModel) {
                    const ollamaReply = await ollamaClient.chat(
                        buildOllamaMessages(text, {
                            language: detectedLanguage,
                            memoryContext: memory.buildContextBlock(),
                            workingMemory: memory.getWorkingMemory(),
                            localKnowledge,
                            activeUserName: userManager.getActiveUser()?.name || null
                        }),
                        {
                            temperature: 0.55,
                            numPredict: 160,
                            numContext: 2048,
                            keepAlive: "30m",
                            onToken: typeof context.onReplyToken === "function" ? context.onReplyToken : undefined
                        }
                    );
                    if (ollamaReply.success && ollamaReply.text) {
                        reply = ollamaReply.text;
                        source = `ollama/${ollamaReply.model}`;
                        ollamaUsed = true;
                        try {
                            offlineCache.setText(answerCacheKey, {
                                text: ollamaReply.text,
                                model: ollamaReply.model || null
                            }, {
                                type: "ollama-answer",
                                title: String(text).slice(0, 160),
                                snippet: String(ollamaReply.text).slice(0, 240)
                            });
                        } catch (cacheError) {
                            console.warn("[OLLAMA] Answer cache save failed:", getErrorMessage(cacheError));
                        }
                        log(`[OLLAMA] Local AI answered in ${ollamaReply.durationMs}ms (model: ${ollamaReply.model}).`);
                        notificationCenter.add({
                            category: "OLLAMA", type: "SUCCESS", title: "Ollama response",
                            message: `Local model ${ollamaReply.model} answered successfully`,
                            priority: "low", source: "ollama"
                        });
                    } else if (ollamaReply.error) {
                        console.warn(`[OLLAMA] Local AI failed (${ollamaReply.error}).`);
                        reply = localMemoryReply();
                        source = localMemoryMatches.length ? "local-memory" : "local-fallback";
                        notificationCenter.add({
                            category: "OLLAMA", type: "WARNING", title: "Qwen reply failed",
                            message: String(ollamaReply.error).slice(0, 300),
                            priority: "normal", source: "ollama"
                        });
                    }
                }
            } catch (ollamaError) {
                console.warn("[OLLAMA] Integration error:", getErrorMessage(ollamaError));
                reply = localMemoryReply();
                source = localMemoryMatches.length ? "local-memory" : "local-fallback";
            } finally {
                if (restoreDisconnectedState) ollamaClient.setEnabled(false);
            }
            }
        }

        if (!remoteProviderUsed && !ollamaUsed && !cachedOllamaAnswer) {
            try { localKnowledge = offlineCache.findRelevantKnowledge(text, 3); }
            catch (error) { console.warn("[MEMORY] Cached knowledge lookup failed:", getErrorMessage(error)); }
            reply = localMemoryReply();
            source = localKnowledge.length ? "local-knowledge" : localMemoryMatches.length ? "local-memory" : "local-fallback";
        }

        // Keep the visible reply provider-neutral. Diagnostics remain in the
        // developer log and provider health panel, without naming another AI.

        memory.pushTurn("user", text);
        memory.pushTurn("assistant", reply);
        layer.update({ userMessage: text, response: reply });
        layer.setMode("IDLE");

        if (remoteProviderUsed) {
            log(`[CHAT] Reply delivered from ${source}.`);
        } else if (ollamaUsed) {
            log(`[OLLAMA] Reply delivered from ${source}.`);
        } else if (!ollamaUsed && !remoteProviderUsed) {
            log("[CHAT] Local fallback response delivered after remote provider was unavailable.");
        }

        return {
            success: true,
            handled: true,
            source,
            response: reply,
            text: reply,
            language: detectedLanguage,
            ollama: ollamaUsed,
            aiProvider: remoteProviderUsed ? chatProviderConfig.provider : ollamaUsed ? "ollama" : "local-fallback",
            aiProviderName: remoteProviderUsed ? (chatProviderConfig.providerName || chatProviderConfig.provider) : ollamaUsed ? "Ollama" : "JARVIS",
            aiModel: remoteProviderUsed ? remoteProviderModel : ollamaUsed ? String(ollamaStatus.selectedModel || "") : "",
            fallbackReason: !remoteProviderUsed && remoteProviderError ? remoteProviderError : undefined,
            researchQueued: result.researchQueued,
            researchTopic: result.researchQueued ? result.topic : null,
            trace: {
                requestId: __trace.requestId,
                startedAt: __trace.startedAt,
                finishedAt: new Date().toISOString(),
                durationMs: Date.now() - Date.parse(__trace.startedAt),
                language: detectedLanguage,
                usedKnowledge: result.usedKnowledge,
                knowledgeSources: localKnowledge.map((k) => k.source).filter(Boolean),
            }
        };
    } catch (error) {
        layer.setMode("IDLE");
        errorLog("[COGNITION] Deterministic brain failed to answer:", error);
        memory.pushTurn("user", text);
        // Let the router fall through to the old rule-based/consciousness
        // reply instead of pretending we produced a smart answer. This
        // only happens if the model is still downloading/loading, or if
        // something is wrong with the local model files.
        if (localKnowledge.length > 0) {
            const fallback = localKnowledge[0];
            const response = `${fallback.content}\n\n[Offline local knowledge · Source: ${fallback.source}]`;
            memory.pushTurn("assistant", response);
            layer.update({ userMessage: text, response });
            return {
                success: true,
                handled: true,
                source: "local-knowledge",
                response,
                text: response,
                language: detectedLanguage,
                offline: true,
                knowledge: fallback
            };
        }

        return { success: false, handled: false, source: "ai", response: null, language: detectedLanguage, error: getErrorMessage(error) };
    }
}


/* ============================================================
   CHAT FILE CONTEXT IPC
   Native file picker + local text extraction.
   No cloud/AI processing is performed here.
============================================================ */

function registerChatFileIPC() {
    registerHandler("chat:file-pick-read", async () => {
        try {
            if (!mainWindow || mainWindow.isDestroyed()) {
                return failure("JARVIS window is not ready.");
            }

            const result = await dialog.showOpenDialog(mainWindow, {
                title: "Attach a file to JARVIS",
                properties: ["openFile"],
                filters: [
                    { name: "Documents and images", extensions: ["txt", "md", "markdown", "json", "csv", "log", "xml", "html", "htm", "css", "js", "jsx", "ts", "tsx", "py", "java", "c", "cpp", "h", "hpp", "cs", "php", "rb", "go", "rs", "sql", "yaml", "yml", "ini", "conf", "env", "pdf", "docx", "xlsx", "xls", "jpg", "jpeg", "png", "webp", "bmp", "tif", "tiff"] },
                    { name: "All Files", extensions: ["*"] }
                ]
            });

            if (result.canceled || !result.filePaths?.length) {
                return { success: true, canceled: true };
            }

            const filePath = result.filePaths[0];
            const stat = await fs.promises.stat(filePath);
            const MAX_BYTES = 10 * 1024 * 1024;

            if (!stat.isFile()) {
                return failure("The selected item is not a file.");
            }

            if (stat.size > MAX_BYTES) {
                return failure("File is too large. Please choose a file up to 10 MB.");
            }

            const ext = path.extname(filePath).toLowerCase();
            const name = path.basename(filePath);
            const size = stat.size;
            const textExts = new Set([
                ".txt", ".md", ".markdown", ".json", ".csv", ".log", ".xml",
                ".html", ".htm", ".css", ".js", ".jsx", ".ts", ".tsx", ".py",
                ".java", ".c", ".cpp", ".h", ".hpp", ".cs", ".php", ".rb", ".go",
                ".rs", ".sql", ".yaml", ".yml", ".ini", ".conf", ".env"
            ]);

            let content = "";
            let contentType = "binary";
            let parser = "none";

            const imageExts = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"]);
            if (imageExts.has(ext)) {
                contentType = "image";
                parser = "reference-photo";
            } else if (textExts.has(ext)) {
                content = await fs.promises.readFile(filePath, "utf8");
                contentType = "text";
                parser = "plain-text";
            } else if (ext === ".pdf") {
                try {
                    const pdfParse = require("pdf-parse");
                    const buffer = await fs.promises.readFile(filePath);
                    const parsed = await pdfParse(buffer);
                    content = String(parsed.text || "");
                    contentType = "text";
                    parser = "pdf-parse";
                } catch (error) {
                    return failure("PDF text extraction is unavailable. Run npm install and try again.");
                }
            } else if (ext === ".docx") {
                try {
                    const mammoth = require("mammoth");
                    const result = await mammoth.extractRawText({ path: filePath });
                    content = String(result.value || "");
                    contentType = "text";
                    parser = "mammoth";
                } catch (error) {
                    return failure("DOCX text extraction is unavailable. Run npm install and try again.");
                }
            } else if (ext === ".xlsx" || ext === ".xls") {
                try {
                    const XLSX = require("xlsx");
                    const workbook = XLSX.readFile(filePath, { cellDates: true });
                    const chunks = [];
                    for (const sheetName of workbook.SheetNames) {
                        const sheet = workbook.Sheets[sheetName];
                        chunks.push(`SHEET: ${sheetName}`);
                        chunks.push(XLSX.utils.sheet_to_csv(sheet));
                    }
                    content = chunks.join("\n\n");
                    contentType = "text";
                    parser = "xlsx";
                } catch (error) {
                    return failure("Excel text extraction is unavailable. Run npm install and try again.");
                }
            } else {
                contentType = "binary";
            }

            const MAX_CONTEXT_CHARS = 250000;
            const truncated = content.length > MAX_CONTEXT_CHARS;
            const safeContent = content.slice(0, MAX_CONTEXT_CHARS);

            return success({
                file: {
                    name,
                    path: filePath,
                    extension: ext || "",
                    size,
                    contentType,
                    parser,
                    truncated,
                    content: safeContent,
                    loadedAt: Date.now()
                }
            });
        } catch (error) {
            return failure(error?.message || "Unable to attach the selected file.");
        }
    });

    console.log("📎 Chat File Context IPC registered.");
}

function registerIPC() {

    log(
        "=============================================="
    );

    log(
        "REGISTERING JARVIS IPC"
    );

    log(
        "=============================================="
    );

    try {

        registerChatIPC();

        registerAIIPC();


        initOfflineKnowledgeCache();
        registerWikipediaIPC();
        registerDataSourcesIPC();
        registerOfflineKnowledgeIPC();
        registerMistakeLearningIPC();
        registerSuggestionsIPC();

        registerBrowserIPC();

        registerEmbeddedBrowserIPC();

        registerBookmarksIPC();

        registerHistoryIPC();

        registerPageToolsIPC();

        registerDownloadsIPC();

        registerFileIPC();
        registerChatFileIPC();

        registerSystemInfoIPC();

        registerSystemIPC();

        registerPowerIPC();

        registerVoiceIPC();

        registerWindowIPC();

        registerDiagnosticsIPC();

    } catch (error) {

        errorLog(
            "FATAL IPC REGISTRATION ERROR:",
            error
        );

        throw error;
    }

    /* --------------------------------------------------------
       CRITICAL VERIFICATION
    -------------------------------------------------------- */

    const criticalChannels = [

        "system:open-app",

        "system:chrome",

        "system:vscode",

        "system:notepad",

        "system:calculator",

        "system:explorer",

        "system:settings",
        "wikipedia:summary",
        "wikipedia:on-this-day",
        "weather:current",
        "weather:forecast",
        "country:info"
    ];

    let allCriticalReady = true;

    for (
        const channel of criticalChannels
    ) {

        const registered =
            registeredHandlers.has(
                channel
            );

        if (registered) {

            log(
                `✅ IPC READY: ${channel}`
            );

        } else {

            allCriticalReady = false;

            errorLog(
                `❌ IPC MISSING: ${channel}`
            );
        }
    }

    log(
        "=============================================="
    );

    log(
        `IPC Handlers: ${registeredHandlers.size}`
    );

    log(
        `IPC Listeners: ${registeredListeners.size}`
    );

    log(
        `system:open-app registered = ${
            registeredHandlers.has(
                "system:open-app"
            )
        }`
    );

    log(
        `Critical IPC Status = ${
            allCriticalReady
                ? "READY"
                : "FAILED"
        }`
    );

    log(
        "=============================================="
    );

    if (!allCriticalReady) {

        throw new Error(
            "Critical JARVIS IPC registration failed."
        );
    }

    log(
        "🟢 IPC REGISTRATION COMPLETE"
    );
}

/* ============================================================
   SECURITY
============================================================ */

function registerSecurityHandlers() {

    // Keep the privileged renderer local-only. In-app browser tabs use a
    // separate persistent session with their own HTTP(S)-only request rule.
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
        const scheme = String(details.url || "").slice(0, String(details.url || "").indexOf(":") + 1).toLowerCase();
        const localResource = ["file:", "data:", "blob:", "about:", "devtools:"].includes(scheme);
        callback(localResource || isLoopbackURL(details.url) ? {} : { cancel: true });
    });

    // The renderer owns microphone capture. Grant media permission only to
    // this app's local file page; all other permission requests stay denied.
    // "media" is what Chromium requests for getUserMedia on Windows;
    // "audioCapture" is the equivalent on some Electron/Chromium builds —
    // both are allowed so the mic never silently fails on an update.
    const isMicPermission = (p) => p === "media" || p === "audioCapture";

    session.defaultSession.setPermissionRequestHandler(
        (webContents, permission, callback) => {
            const isLocalPage =
                webContents.getURL().startsWith("file://");
            const granted = isMicPermission(permission) && isLocalPage;
            // One clear log line per mic permission decision so a blocked
            // mic is visible in the main-process console instead of failing
            // silently in the renderer.
            if (isMicPermission(permission)) {
                console.log(`[MIC] Permission ${granted ? "GRANTED" : "DENIED"}: "${permission}" (${webContents.getURL()})`);
            }
            callback(granted);
        }
    );

    session.defaultSession.setPermissionCheckHandler(
        (webContents, permission) => {
            const isLocalPage =
                webContents.getURL().startsWith("file://");

            return isMicPermission(permission) && isLocalPage;
        }
    );

    app.on(
        "web-contents-created",
        (event, contents) => {

            /* ------------------------------------------------
               WINDOW.OPEN
            ------------------------------------------------ */

            contents.setWindowOpenHandler(
                ({ url }) => {
                    const managedBrowserTab = Array.from(browserTabs.values())
                        .some((tab) => tab.view.webContents === contents);
                    if (managedBrowserTab && isNavigableURL(url) && (url === "about:blank" || isSafeBrowserDestination(url))) {
                        createBrowserTab(url, { activate: true });
                    }

                    return {
                        action: "deny"
                    };
                }
            );

            /* ------------------------------------------------
               NAVIGATION PROTECTION
            ------------------------------------------------ */

            contents.on(
                "will-navigate",
                (
                    navigationEvent,
                    url
                ) => {

                    const managedBrowserTab = Array.from(browserTabs.values())
                        .some((tab) => tab.view.webContents === contents);
                    const allowed = managedBrowserTab
                        ? isNavigableURL(url) && (url === "about:blank" || isSafeBrowserDestination(url))
                        : url.startsWith("file://");

                    if (!allowed) {

                        navigationEvent.preventDefault();

                    }
                }
            );
        }
    );
}

/* ============================================================
   APP READY
   (DEAD CODE — DOCUMENTED, NOT DELETED, SEE ERROR_LOG E012)

   This is the THIRD app.whenReady() block in this file. It never
   runs: appReady is already true by the time Electron resolves
   whenReady() here, because the first block (near the top of this
   file) sets it synchronously as soon as the app is ready, so the
   `if (appReady) return;` guard below fires immediately every time.

   This used to silently swallow real functionality:
   registerIPC() (chat file IPC, power IPC, embedded-brain warm-up —
   see registerExtendedIPC() near the top of this file, where those
   are now actually called), registerSecurityHandlers() (mic
   permission gating, window-open + navigation protection — also
   moved to registerExtendedIPC()), and the consciousness idle-decay
   heartbeat (moved into the live app.whenReady() block, right after
   the window is created). createWindow() below is likewise
   unreachable from here; the app boots through createMainWindow()
   in the live block instead.

   Left in place rather than deleted, per this project's convention
   of documenting dead code instead of silently removing it (see
   ERROR_LOG E009 for the same rationale on a different function).
============================================================ */

app.whenReady()
    .then(
        () => {

            if (appReady) {

                warn(
                    "app.whenReady already executed."
                );

                return;
            }

            appReady = true;

            log(
                "=============================================="
            );

            log(
                `JARVIS PRO MAX MAIN V${MAIN_VERSION}`
            );

            log(
                "Main Process Starting..."
            );

            log(
                `Platform: ${process.platform}`
            );

            log(
                `Electron: ${process.versions.electron}`
            );

            log(
                `Node: ${process.versions.node}`
            );

            log(
                `Chrome: ${process.versions.chrome}`
            );

            log(
                "=============================================="
            );

            /* ------------------------------------------------
               IPC FIRST
            ------------------------------------------------ */

            registerIPC();

            /* ------------------------------------------------
               SECURITY
            ------------------------------------------------ */

            registerSecurityHandlers();

            /* ------------------------------------------------
               WINDOW
            ------------------------------------------------ */

            createWindow();

            /* ------------------------------------------------
               CONSCIOUSNESS HEARTBEAT
               Periodically calls tick() so energy/confidence/mood
               drift back toward resting baselines during idle
               stretches, instead of the state only ever changing
               on the next chat turn (see src/ai/consciousness.js).
               Also emits a stateChanged event other code can log —
               nothing currently subscribes beyond the debug log
               below, so this is purely additive.
            ------------------------------------------------ */

            try {
                const layer = initConsciousness();

                layer.on("stateChanged", ({ reason }) => {
                    log(`[COGNITION] stateChanged (${reason}) -> mode=${layer.state.mode}`);
                });

                consciousnessHeartbeat = setInterval(() => {
                    try {
                        initConsciousness().tick();
                    } catch (error) {
                        errorLog("Consciousness heartbeat tick failed:", error);
                    }
                }, 30000);
            } catch (error) {
                errorLog("Consciousness heartbeat setup failed:", error);
            }

            log(
                "=============================================="
            );

            log(
                "🟢 JARVIS MAIN PROCESS ONLINE"
            );

            log(
                "=============================================="
            );
        }
    )
    .catch(
        (error) => {

            errorLog(
                "FATAL APPLICATION STARTUP ERROR:",
                error
            );

            app.quit();
        }
    );

/* ============================================================
   MACOS ACTIVATE
============================================================ */

app.on(
    "activate",
    () => {

        if (
            BrowserWindow
                .getAllWindows()
                .length === 0
        ) {

            createWindow();
        }
    }
);

/* ============================================================
   ALL WINDOWS CLOSED
============================================================ */

app.on(
    "window-all-closed",
    () => {

        if (
            process.platform !== "darwin"
        ) {

            app.quit();
        }
    }
);

/* ============================================================
   BEFORE QUIT
============================================================ */

app.on(
    "before-quit",
    () => {

        if (shuttingDown) {
            return;
        }

        shuttingDown = true;

        if (consciousnessHeartbeat) {
            clearInterval(consciousnessHeartbeat);
            consciousnessHeartbeat = null;
        }

        // Final safety flush — guarantees the last few messages of
        // the session are on disk even if the renderer never called
        // chat:save again before quitting.
        saveChatHistoryToDisk();

        log(
            "JARVIS shutting down..."
        );
    }
);

/* ============================================================
   FINAL LOAD
============================================================ */

log(
    `🛡️ JARVIS MAIN V${MAIN_VERSION} LOADED`
);

