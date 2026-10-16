const fs = require('fs');

// Create a minimal working main.js that integrates bilingual consciousness
const mainJsContent = `'use strict';

require("dotenv").config();

const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");

const MAIN_VERSION = "15.0.0";
let mainWindow = null;
let appReady = false;
let shuttingDown = false;

let consciousness = null;
let bilingualJarvis = null;

function log(...args) {
    console.log("[JARVIS MAIN]", ...args);
}

function errorLog(...args) {
    console.error("[JARVIS MAIN ERROR]", ...args);
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

    if (process.env.NODE_ENV === "development") {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on("closed", () => {
        mainWindow = null;
    });

    log("Main window created successfully");
}

function registerIPCHandlers() {
    ipcMain.handle("get-consciousness-state", () => {
        if (!consciousness) return { error: "Consciousness not initialized" };
        return consciousness.getPublicState();
    });

    ipcMain.handle("process-message", async (event, userMessage, aiResponse) => {
        try {
            if (!bilingualJarvis) throw new Error("Bilingual JARVIS not initialized");
            const result = await bilingualJarvis.processMessage(userMessage, aiResponse);
            return { success: true, ...result };
        } catch (error) {
            errorLog("Message processing error:", error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle("get-health-summary", async (event, memoryInfo) => {
        try {
            if (!bilingualJarvis) throw new Error("Bilingual JARVIS not initialized");
            const summary = bilingualJarvis.getHealthSummary(memoryInfo || {});
            return { success: true, summary };
        } catch (error) {
            errorLog("Health summary error:", error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle("get-system-prompt", (event, extraContext) => {
        try {
            if (!consciousness) throw new Error("Consciousness not initialized");
            const prompt = consciousness.buildSystemPrompt(extraContext || "");
            return { success: true, prompt };
        } catch (error) {
            errorLog("System prompt error:", error);
            return { success: false, error: error.message };
        }
    });
}

app.whenReady().then(() => {
    if (appReady) {
        log("app.whenReady already executed.");
        return;
    }

    appReady = true;

    log("==============================================");
    log("JARVIS PRO MAX NEXT LEVEL V" + MAIN_VERSION);
    log("Main Process Starting...");
    log("Platform: " + process.platform);
    log("Electron: " + process.versions.electron);
    log("Node: " + process.versions.node);
    log("Chrome: " + process.versions.chrome);
    log("==============================================");

    const userDataPath = app.getPath("userData");
    const consciousnessStoragePath = path.join(userDataPath, "consciousness-state.json");
    
    try {
        const { ConsciousnessLayer } = require("./src/ai/consciousness");
        const { BilingualJarvis } = require("./src/index");
        
        consciousness = new ConsciousnessLayer({ storagePath: consciousnessStoragePath });
        bilingualJarvis = new BilingualJarvis(consciousnessStoragePath);
        
        log("Bilingual consciousness initialized");
    } catch (error) {
        errorLog("Failed to initialize bilingual consciousness:", error);
    }

    createWindow();
    registerIPCHandlers();

    if (consciousness) {
        setInterval(() => {
            if (!shuttingDown) {
                consciousness.tick();
            }
        }, 30000);
    }

    log("JARVIS Main Process startup complete.");
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on("before-quit", () => {
    shuttingDown = true;
    if (consciousness) {
        consciousness.save();
    }
    log("JARVIS shutting down gracefully");
});

process.on("uncaughtException", (error) => {
    errorLog("Uncaught Exception:", error);
});

process.on("unhandledRejection", (reason, promise) => {
    errorLog("Unhandled Rejection at:", promise, "reason:", reason);
});
`;

fs.writeFileSync('main.js', mainJsContent);
console.log('Fixed main.js created successfully');