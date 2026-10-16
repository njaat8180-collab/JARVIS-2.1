/**
 * JARVIS Bilingual Consciousness Integration Module
 * This module provides the bilingual consciousness features that can be
 * integrated into the existing JARVIS main.js without replacing it
 */

const { ConsciousnessLayer } = require("./src/ai/consciousness");
const { BilingualJarvis } = require("./src/index");
const path = require("path");

class BilingualIntegration {
    constructor(electronApp) {
        this.app = electronApp;
        this.consciousness = null;
        this.bilingualJarvis = null;
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) {
            console.log("Bilingual consciousness already initialized");
            return true;
        }

        try {
            const userDataPath = this.app.getPath("userData");
            const consciousnessStoragePath = path.join(userDataPath, "consciousness-state.json");
            
            this.consciousness = new ConsciousnessLayer({ storagePath: consciousnessStoragePath });
            this.bilingualJarvis = new BilingualJarvis(consciousnessStoragePath);
            
            this.initialized = true;
            console.log("🧠 Bilingual consciousness initialized successfully");
            
            // Start consciousness heartbeat
            this.startHeartbeat();
            
            return true;
        } catch (error) {
            console.error("❌ Failed to initialize bilingual consciousness:", error);
            return false;
        }
    }

    startHeartbeat() {
        if (!this.consciousness) return;
        
        setInterval(() => {
            if (this.consciousness) {
                this.consciousness.tick();
            }
        }, 30000); // Every 30 seconds
    }

    registerIPCHandlers(ipcMain) {
        if (!this.initialized) {
            console.warn("Cannot register IPC handlers - bilingual consciousness not initialized");
            return;
        }

        // Get consciousness state
        ipcMain.handle("get-consciousness-state", () => {
            if (!this.consciousness) return { error: "Consciousness not initialized" };
            return this.consciousness.getPublicState();
        });

        // Process message with bilingual consciousness
        ipcMain.handle("process-message", async (event, userMessage, aiResponse) => {
            try {
                if (!this.bilingualJarvis) throw new Error("Bilingual JARVIS not initialized");
                const result = await this.bilingualJarvis.processMessage(userMessage, aiResponse);
                return { success: true, ...result };
            } catch (error) {
                console.error("Message processing error:", error);
                return { success: false, error: error.message };
            }
        });

        // Get health summary
        ipcMain.handle("get-health-summary", async (event, memoryInfo) => {
            try {
                if (!this.bilingualJarvis) throw new Error("Bilingual JARVIS not initialized");
                const summary = this.bilingualJarvis.getHealthSummary(memoryInfo || {});
                return { success: true, summary };
            } catch (error) {
                console.error("Health summary error:", error);
                return { success: false, error: error.message };
            }
        });

        // Get system prompt with language persona
        ipcMain.handle("get-system-prompt", (event, extraContext) => {
            try {
                if (!this.consciousness) throw new Error("Consciousness not initialized");
                const prompt = this.consciousness.buildSystemPrompt(extraContext || "");
                return { success: true, prompt };
            } catch (error) {
                console.error("System prompt error:", error);
                return { success: false, error: error.message };
            }
        });

        console.log("🔗 Bilingual consciousness IPC handlers registered");
    }

    shutdown() {
        if (this.consciousness) {
            this.consciousness.save();
            console.log("💾 Bilingual consciousness state saved");
        }
    }

    getConsciousness() {
        return this.consciousness;
    }

    getBilingualJarvis() {
        return this.bilingualJarvis;
    }
}

module.exports = { BilingualIntegration };