"use strict";

// ==========================================
// JARVIS PRO MAX — Memory / Settings / Files Panels
// renderer/js/panels.js
//
// Wires the three sidebar nav views that were previously
// "(not yet built)" — Memory Viewer, Settings, Files.
// Each uses existing IPC APIs already exposed in preload.js.
// ==========================================

(function () {

    function showPanelMessage(container, message) {
        if (!container) return;
        const paragraph = document.createElement("p");
        paragraph.className = "panel-empty";
        paragraph.textContent = String(message || "");
        container.replaceChildren(paragraph);
    }

    // ==========================================
    // MEMORY VIEWER
    // ==========================================

    const MemoryPanel = {

        async show() {
            await this.refresh();
        },

        hide() {},

        renderConstellation(records) {
            const svg = document.getElementById("memoryConstellationSvg");
            const summary = document.getElementById("memoryConstellationSummary");
            if (!svg) return;
            const NS = "http://www.w3.org/2000/svg";
            const data = (Array.isArray(records) ? records : []).slice(0, 40);
            svg.replaceChildren();
            if (summary) summary.textContent = `${data.length} saved memories · all links are generated locally`;
            const make = (tag, attrs = {}) => {
                const node = document.createElementNS(NS, tag);
                for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
                return node;
            };
            const center = { x: 450, y: 225 };
            const colors = { USER_PROJECT: "#a78bfa", USER_PREFERENCE: "#38dcff", USER_PROFILE: "#34d399", USER_WORKFLOW: "#fbbf24", USER_INTEREST: "#fb7185", USER_FACT: "#60a5fa" };
            const groups = new Map();
            for (const record of data) {
                const group = record.type || "USER_FACT";
                if (!groups.has(group)) groups.set(group, []);
                groups.get(group).push(record);
            }
            const positions = new Map();
            const groupEntries = [...groups.entries()];
            groupEntries.forEach(([type, items], groupIndex) => {
                const angle = -Math.PI / 2 + (groupIndex * Math.PI * 2 / Math.max(1, groupEntries.length));
                const groupCenter = { x: center.x + Math.cos(angle) * 150, y: center.y + Math.sin(angle) * 150 };
                items.forEach((record, index) => {
                    const ring = 26 + Math.floor(index / 8) * 24;
                    const localAngle = index * 2.399963229728653;
                    positions.set(record.key, {
                        x: groupCenter.x + Math.cos(localAngle) * ring,
                        y: groupCenter.y + Math.sin(localAngle) * ring,
                        type
                    });
                });
            });
            for (const record of data) {
                const p = positions.get(record.key);
                svg.appendChild(make("line", { x1: center.x, y1: center.y, x2: p.x, y2: p.y, class: "memory-constellation-link" }));
            }
            for (const [type, items] of groupEntries) {
                for (let i = 1; i < items.length; i++) {
                    const a = positions.get(items[i - 1].key), b = positions.get(items[i].key);
                    svg.appendChild(make("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: "memory-constellation-link memory-constellation-link-soft" }));
                }
                const first = positions.get(items[0].key);
                const label = make("text", { x: first.x, y: first.y - 31, class: "memory-constellation-group" });
                label.textContent = type.replace(/^USER_/, "").replaceAll("_", " ");
                svg.appendChild(label);
            }
            const hub = make("g", { class: "memory-constellation-hub" });
            hub.appendChild(make("circle", { cx: center.x, cy: center.y, r: 28 }));
            const hubLabel = make("text", { x: center.x, y: center.y + 47, class: "memory-constellation-hub-label" });
            hubLabel.textContent = "JARVIS";
            hub.appendChild(hubLabel);
            svg.appendChild(hub);
            for (const record of data) {
                const p = positions.get(record.key);
                const color = colors[p.type] || "#94a3b8";
                const group = make("g", { class: "memory-constellation-node", tabindex: "0", role: "button", "aria-label": `${record.key}: ${record.value || "saved memory"}`, "data-key": record.key });
                group.style.color = color;
                group.appendChild(make("circle", { cx: p.x, cy: p.y, r: 7, fill: color }));
                const label = make("text", { x: p.x + 11, y: p.y + 4 });
                const raw = String(record.key || record.value || "memory").replace(/^user\.|^project\./, "").replace(/[._-]+/g, " ");
                label.textContent = raw.length > 21 ? raw.slice(0, 20) + "…" : raw;
                const title = make("title");
                title.textContent = `${record.key}\n${record.value || ""}`;
                group.append(title, label);
                const open = () => {
                    const input = document.getElementById("memorySearchInput");
                    if (input) input.value = record.key;
                    this.search(record.key);
                };
                group.addEventListener("click", open);
                group.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } });
                svg.appendChild(group);
            }
        },

        applyFilters(records) {
            const category = document.getElementById("memoryCategoryFilter")?.value || "";
            const date = document.getElementById("memoryDateFilter")?.value || "";
            return (Array.isArray(records) ? records : []).filter(record => {
                if (category && record.type !== category) return false;
                if (date) {
                    const stamp = Number(record.updatedAt || record.createdAt || 0);
                    if (!stamp || new Date(stamp).toISOString().slice(0, 10) !== date) return false;
                }
                return true;
            });
        },

        async refresh() {
            try {
                const keyInput = document.getElementById("settingsGoogleCseKey");
                const cxInput = document.getElementById("settingsGoogleCseCx");
                if (keyInput) keyInput.value = localStorage.getItem("jarvis_google_cse_key") || "";
                if (cxInput) cxInput.value = localStorage.getItem("jarvis_google_cse_cx") || "";
            } catch (_) { /* local search is optional */ }

            const list = document.getElementById("memoryList");
            const statsEl = document.getElementById("memoryStats");
            if (!list) return;

            list.innerHTML = '<p class="panel-empty">Loading...</p>';

            try {
                if (!window.jarvis || !window.jarvis.memory) {
                    list.innerHTML = '<p class="panel-empty">Memory API not available.</p>';
                    return;
                }

                const stats = await window.jarvis.memory.getMemoryStats();
                const facts = this.applyFilters(await window.jarvis.memory.getMemoryFacts());
                this.renderConstellation(facts);
                await this.refreshPrivacy();

                if (stats && statsEl) {
                    statsEl.textContent =
                        (stats.count != null ? stats.count : (facts ? facts.length : 0)) +
                        " memories stored";
                }

                if (!facts || facts.length === 0) {
                    list.innerHTML = '<p class="panel-empty">No memories yet. Tell JARVIS something to remember.</p>';
                    return;
                }

                list.innerHTML = "";
                for (const fact of facts) {
                    const item = document.createElement("div");
                    item.className = "memory-item";

                    const key = document.createElement("span");
                    key.className = "memory-item-key";
                    key.textContent = fact.key || fact.type || "memory";

                    const value = document.createElement("span");
                    value.className = "memory-item-value";
                    value.textContent = fact.value || fact.statement || JSON.stringify(fact);

                    const type = document.createElement("span");
                    type.className = "memory-item-type";
                    const date = fact.updatedAt || fact.createdAt;
                    type.textContent = [fact.category || fact.type || "fact", date ? new Date(date).toLocaleDateString() : ""].filter(Boolean).join(" · ");

                    const edit = document.createElement("button");
                    edit.className = "panel-btn memory-item-edit";
                    edit.textContent = "Edit";
                    edit.addEventListener("click", async () => {
                        const next = prompt("Edit this saved memory:", fact.value || fact.statement || "");
                        if (next == null || !next.trim()) return;
                        const result = await window.jarvis.memory.updateMemory(fact.key, { value: next.trim() });
                        if (result?.success === false) alert(result.error || "Memory could not be updated.");
                        await this.refresh();
                    });

                    const forget = document.createElement("button");
                    forget.className = "memory-item-forget";
                    forget.textContent = "✕";
                    forget.title = "Forget this memory";
                    forget.addEventListener("click", async () => {
                        try {
                            const result = await window.jarvis.memory.forgetMemoryFact(fact.key);
                            if (result?.success === false) throw new Error(result.error || "Delete failed.");
                            item.remove();
                        } catch (e) {
                            console.error("Forget failed:", e);
                            alert(e.message || "Memory could not be deleted.");
                        }
                    });

                    item.appendChild(key);
                    item.appendChild(value);
                    item.appendChild(type);
                    item.appendChild(edit);
                    item.appendChild(forget);
                    list.appendChild(item);
                }
            } catch (e) {
                showPanelMessage(list, `Error loading memories: ${e?.message || e}`);
            }
        },

        async search(query) {
            const list = document.getElementById("memoryList");
            if (!list || !query) { return this.refresh(); }

            try {
                const results = this.applyFilters(await window.jarvis.memory.searchMemory(query, 50));
                this.renderConstellation(results);
                if (!results || results.length === 0) {
                    showPanelMessage(list, `No memories match "${query}".`);
                    return;
                }

                list.innerHTML = "";
                for (const fact of results) {
                    const item = document.createElement("div");
                    item.className = "memory-item";

                    const key = document.createElement("span");
                    key.className = "memory-item-key";
                    key.textContent = fact.key || fact.type || "memory";

                    const value = document.createElement("span");
                    value.className = "memory-item-value";
                    value.textContent = fact.value || fact.statement || JSON.stringify(fact);

                    const type = document.createElement("span");
                    type.className = "memory-item-type";
                    type.textContent = fact.type || "fact";

                    item.appendChild(key);
                    item.appendChild(value);
                    item.appendChild(type);
                    list.appendChild(item);
                }
            } catch (e) {
                console.error("Memory search failed:", e);
            }
        },

        async refreshPrivacy() {
            const enabled = document.getElementById("memoryEnabledToggle");
            const autoSave = document.getElementById("memoryAutoSaveToggle");
            const status = document.getElementById("memoryPrivacyStatus");
            const active = await window.jarvis?.users?.getActive?.();
            const userId = active?.userId || active?.user?.userId;
            if (!userId || !window.jarvis?.users) {
                if (status) status.textContent = "Privacy settings unavailable.";
                return;
            }
            const result = await window.jarvis.users.getPrivacy(userId);
            const privacy = result?.privacy || {};
            if (enabled) enabled.checked = privacy.memoryEnabled !== false;
            if (autoSave) autoSave.checked = privacy.saveConversationMemory !== false;
            if (status) status.textContent = "Explicit ‘remember this’ saves are separate from automatic chat capture.";
        },

        async clearAll() {
            if (!confirm("Forget ALL memories? This cannot be undone.")) return;
            try {
                const result = await window.jarvis.memory.clearAllMemory(true);
                if (result?.success === false) throw new Error(result.error || "Clear failed.");
                await this.refresh();
            } catch (e) {
                console.error("Clear all failed:", e);
                alert(e.message || "Saved memories could not be cleared.");
            }
        },

        init() {
            const refreshBtn = document.getElementById("memoryRefreshBtn");
            const clearBtn = document.getElementById("memoryClearBtn");
            const searchInput = document.getElementById("memorySearchInput");
            const categoryFilter = document.getElementById("memoryCategoryFilter");
            const dateFilter = document.getElementById("memoryDateFilter");
            const constellationButton = document.getElementById("memoryConstellationBtn");
            const constellation = document.getElementById("memoryConstellation");
            constellationButton?.addEventListener("click", () => {
                const open = constellation?.hidden !== false;
                if (constellation) constellation.hidden = !open;
                constellationButton.setAttribute("aria-expanded", String(open));
                constellationButton.textContent = open ? "✦ Hide Constellation" : "✦ Memory Constellation";
            });
            const bindPrivacyToggle = (id, field) => {
                const toggle = document.getElementById(id);
                if (!toggle) return;
                toggle.addEventListener("change", async () => {
                    const active = await window.jarvis?.users?.getActive?.();
                    const userId = active?.userId || active?.user?.userId;
                    if (!userId) return;
                    const result = await window.jarvis.users.updatePrivacy(userId, { [field]: toggle.checked });
                    if (result?.success === false) {
                        alert(result.error || "Privacy setting could not be saved.");
                        await this.refreshPrivacy();
                    }
                });
            };
            bindPrivacyToggle("memoryEnabledToggle", "memoryEnabled");
            bindPrivacyToggle("memoryAutoSaveToggle", "saveConversationMemory");
            for (const filter of [categoryFilter, dateFilter]) {
                filter?.addEventListener("change", () => {
                    if (searchInput?.value.trim()) this.search(searchInput.value.trim());
                    else this.refresh();
                });
            }

            if (refreshBtn) {
                refreshBtn.addEventListener("click", () => this.refresh());
            }
            if (clearBtn) {
                clearBtn.addEventListener("click", () => this.clearAll());
            }
            if (searchInput) {
                let timer = null;
                searchInput.addEventListener("input", () => {
                    clearTimeout(timer);
                    timer = setTimeout(() => {
                        if (searchInput.value.trim()) {
                            this.search(searchInput.value.trim());
                        } else {
                            this.refresh();
                        }
                    }, 300);
                });
            }
        }
    };

    // ==========================================
    // SETTINGS
    // ==========================================

    const SettingsPanel = {

        async show() {
            await this.refresh();
        },

        hide() {},

        async refresh() {
            // Show which intelligence features are installed locally. The
            // assistant remains functional through its deterministic brain
            // when no local language model is present.
            try {
                const modelEl = document.getElementById("settingsLocalModelStatus");
                if (modelEl && window.jarvis?.ollama?.status) {
                    const status = await window.jarvis.ollama.status();
                    if (status?.running && status?.selectedModel) {
                        modelEl.textContent = `Ready · ${status.selectedModel}`;
                        modelEl.dataset.state = "ready";
                    } else {
                        modelEl.textContent = "Deterministic local brain active · install/run Ollama and a model for richer offline conversation.";
                        modelEl.dataset.state = "pending";
                    }
                }
            } catch (_) { /* local model is optional */ }

            try {
                const speechEl = document.getElementById("settingsLocalSpeechStatus");
                if (speechEl && window.jarvis?.voice?.modelStatus) {
                    const response = await window.jarvis.voice.modelStatus();
                    const status = response?.status || response;
                    if (status?.ready || status?.modelCached || status?.whisperCached) {
                        speechEl.textContent = status.ready ? "Ready · on-device Whisper" : "Installed · ready when used";
                        speechEl.dataset.state = "ready";
                    } else {
                        speechEl.textContent = "Local speech model not installed · voice may use the configured Windows speech engine.";
                        speechEl.dataset.state = "pending";
                    }
                }
            } catch (_) { /* speech is optional */ }

            // Personality style
            try {
                if (window.jarvis && window.jarvis.ai && window.jarvis.ai.getPersonalityStyle) {
                    const style = await window.jarvis.ai.getPersonalityStyle();
                    const select = document.getElementById("settingsPersonality");
                    if (select && style && style.style) {
                        select.value = style.style;
                    }
                }
            } catch (e) { /* non-critical */ }

            // Voice model status
            try {
                const statusEl = document.getElementById("settingsVoiceModelStatus");
                if (statusEl && window.jarvis && window.jarvis.voice && window.jarvis.voice.modelStatus) {
                    const status = await window.jarvis.voice.modelStatus();
                    if (status && status.ready) {
                        statusEl.textContent = "Ready (model loaded)";
                        statusEl.style.color = "#4ade80";
                    } else if (status && status.loading) {
                        statusEl.textContent = "Loading model...";
                        statusEl.style.color = "#fbbf24";
                    } else {
                        statusEl.textContent = "Not loaded";
                        statusEl.style.color = "#8aa0b5";
                    }
                }
            } catch (e) { /* non-critical */ }

            // Background learning status
            try {
                if (window.jarvis && window.jarvis.backgroundLearning) {
                    const status = await window.jarvis.backgroundLearning.status();
                    const btn = document.getElementById("settingsBgLearnToggle");
                    if (btn && status) {
                        if (status.enabled || status.running) {
                            btn.textContent = "Disable";
                            btn.onclick = () => window.jarvis.backgroundLearning.disable();
                        } else {
                            btn.textContent = "Enable";
                            btn.onclick = () => window.jarvis.backgroundLearning.enable();
                        }
                    }
                }
            } catch (e) { /* non-critical */ }

            // Evolution status
            try {
                if (window.jarvis && window.jarvis.evolution) {
                    // FIX: preload exposes getEngineState() (not getState()).
                    // The engine state comes back as { success, state: {...} }
                    // with state.state === "running" when the engine is active.
                    const result = await window.jarvis.evolution.getEngineState();
                    const engineState = (result && result.success && result.state) || {};
                    const running = engineState.state === "running";
                    const btn = document.getElementById("settingsEvolutionToggle");
                    if (btn) {
                        if (running) {
                            btn.textContent = "Pause";
                            btn.onclick = () => window.jarvis.evolution.pause();
                        } else {
                            btn.textContent = "Start";
                            btn.onclick = () => window.jarvis.evolution.start();
                        }
                    }
                }
            } catch (e) { /* non-critical */ }
        },

        init() {
            const cseSave = document.getElementById("settingsGoogleCseSave");
            if (cseSave && cseSave.dataset.bound !== "true") {
                cseSave.dataset.bound = "true";
                cseSave.addEventListener("click", () => {
                    const key = String(document.getElementById("settingsGoogleCseKey")?.value || "").trim();
                    const cx = String(document.getElementById("settingsGoogleCseCx")?.value || "").trim();
                    const status = document.getElementById("settingsGoogleCseStatus");
                    if (Boolean(key) !== Boolean(cx)) {
                        if (status) status.textContent = "Enter both values, or leave both blank.";
                        return;
                    }
                    try {
                        if (key) {
                            localStorage.setItem("jarvis_google_cse_key", key);
                            localStorage.setItem("jarvis_google_cse_cx", cx);
                        } else {
                            localStorage.removeItem("jarvis_google_cse_key");
                            localStorage.removeItem("jarvis_google_cse_cx");
                        }
                        if (status) status.textContent = key ? "Google Search is configured. JARVIS still asks before every lookup." : "Google Search settings cleared.";
                    } catch (_) {
                        if (status) status.textContent = "Could not save local settings.";
                    }
                });
            }

            const select = document.getElementById("settingsPersonality");
            if (select) {
                select.addEventListener("change", async () => {
                    try {
                        if (window.jarvis && window.jarvis.ai && window.jarvis.ai.setPersonalityStyle) {
                            const result = await window.jarvis.ai.setPersonalityStyle(select.value);
                            if (result?.success !== false) {
                                document.dispatchEvent(new CustomEvent("jarvis:personality-style-changed", { detail: { style: select.value } }));
                            }
                        }
                    } catch (e) {
                        console.error("Personality change failed:", e);
                    }
                });
            }

            const cacheBtn = document.getElementById("settingsCacheClearBtn");
            if (cacheBtn) {
                cacheBtn.addEventListener("click", async () => {
                    if (!confirm("Clear the offline knowledge cache?")) return;
                    try {
                        if (window.jarvis && window.jarvis.knowledge) {
                            // FIX: KnowledgeCacheAPI exposes clear() — clearCache() never existed.
                            await window.jarvis.knowledge.clear();
                        }
                    } catch (e) {
                        console.error("Cache clear failed:", e);
                    }
                });
            }
        }
    };

    // ==========================================
    // FILES
    // ==========================================

    const FilesPanel = {

        currentPath: null,
        rootPath: null,

        async show() {
            if (!this.currentPath) {
                // Default to user home
                try {
                    const info = await window.jarvis.platform.info();
                    this.currentPath = info && info.documents ? info.documents : ".";
                } catch (e) {
                    this.currentPath = ".";
                }
                this.rootPath = this.currentPath;
            }
            await this.refresh();
        },

        hide() {},

        async refresh() {
            const list = document.getElementById("filesList");
            const pathEl = document.getElementById("filesPath");
            if (!list) return;

            list.innerHTML = '<p class="panel-empty">Loading...</p>';

            try {
                if (!window.jarvis || !window.jarvis.files) {
                    list.innerHTML = '<p class="panel-empty">File API not available.</p>';
                    return;
                }

                const response = await window.jarvis.files.list(this.currentPath);
                if (response?.success === false) throw new Error(response.error || "Folder could not be read.");
                const entries = Array.isArray(response) ? response : response?.entries || response?.data || [];

                if (pathEl) {
                    pathEl.textContent = this.currentPath || "/";
                }

                if (!entries || entries.length === 0) {
                    list.innerHTML = '<p class="panel-empty">Empty folder.</p>';
                    return;
                }

                list.innerHTML = "";
                for (const entry of entries) {
                    const item = document.createElement("div");
                    item.className = "files-item";

                    const icon = document.createElement("span");
                    icon.className = "files-item-icon";
                    icon.textContent = entry.isDirectory ? "▸" : "·";

                    const name = document.createElement("span");
                    name.className = "files-item-name";
                    name.textContent = entry.name;

                    const size = document.createElement("span");
                    size.className = "files-item-size";
                    if (entry.isDirectory) {
                        size.textContent = "";
                    } else if (entry.size != null) {
                        const kb = Math.round(entry.size / 1024);
                        size.textContent = kb > 0 ? kb + " KB" : entry.size + " B";
                    }

                    item.appendChild(icon);
                    item.appendChild(name);
                    item.appendChild(size);

                    if (entry.isDirectory) {
                        item.addEventListener("click", () => {
                            this.currentPath = entry.path;
                            this.refresh();
                        });
                    } else if (entry.isFile) {
                        item.title = "Open with the default desktop app";
                        item.addEventListener("click", async () => {
                            try {
                                const result = await window.jarvis.files.open(entry.path);
                                if (!result || result.success === false) {
                                    alert(result?.error || "This file could not be opened.");
                                }
                            } catch (error) {
                                alert(error?.message || "This file could not be opened.");
                            }
                        });
                    }

                    list.appendChild(item);
                }
            } catch (e) {
                showPanelMessage(list, `Error: ${e?.message || e}`);
            }
        },

        goUp() {
            if (!this.currentPath || this.currentPath === "/" || this.currentPath === "." || this.currentPath.toLowerCase() === String(this.rootPath || "").toLowerCase()) return;
            const parts = this.currentPath.replace(/\\/g, "/").split("/");
            parts.pop();
            const parent = parts.join("/") || "/";
            if (parent.length < String(this.rootPath || "").replace(/\\/g, "/").length) return;
            this.currentPath = parent;
            this.refresh();
        },

        async goHome() {
            try {
                const info = await window.jarvis.platform.info();
                this.currentPath = info && info.documents ? info.documents : ".";
            } catch (e) {
                this.currentPath = ".";
            }
            this.rootPath = this.currentPath;
            this.refresh();
        },

        init() {
            const upBtn = document.getElementById("filesUpBtn");
            const homeBtn = document.getElementById("filesHomeBtn");
            const refreshBtn = document.getElementById("filesRefreshBtn");

            if (upBtn) {
                upBtn.addEventListener("click", () => this.goUp());
            }
            if (homeBtn) {
                homeBtn.addEventListener("click", () => this.goHome());
            }
            if (refreshBtn) {
                refreshBtn.addEventListener("click", () => this.refresh());
            }
        }
    };

    // ==========================================
    // INIT
    // ==========================================

    window.JarvisPanels = {
        Memory: MemoryPanel,
        Settings: SettingsPanel,
        Files: FilesPanel,

        init() {
            MemoryPanel.init();
            SettingsPanel.init();
            FilesPanel.init();
            console.log("✅ Jarvis Panels (Memory/Settings/Files) Loaded");
        }
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => window.JarvisPanels.init());
    } else {
        window.JarvisPanels.init();
    }

})();

// ==========================================
// GREETING CARD + QUICK ACCESS WIRING
// ==========================================

(function setupGreetingCard() {
    function updateGreeting() {
        const now = new Date();
        const timeEl = document.getElementById("greetingTime");
        if (timeEl) {
            const hh = String(now.getHours()).padStart(2, "0");
            const mm = String(now.getMinutes()).padStart(2, "0");
            const ss = String(now.getSeconds()).padStart(2, "0");
            timeEl.textContent = `${hh}:${mm}:${ss}`;
        }

        const quoteEl = document.getElementById("greetingQuote");
        if (quoteEl) {
            quoteEl.textContent = "VOICE · MEMORY · DESKTOP CONTROL";
        }
    }

    async function loadActiveUserGreeting() {
        try {
            const result = await window.jarvis?.users?.getActive?.();
            if (!result || result.success === false) return;
            const data = result.data || result;
            const user = data.user || {};
            const profile = data.profile || user.profile || user;
            const name = String(profile.preferredName || profile.name || user.preferredName || user.name || "").trim();
            if (!name) return;
            const title = document.getElementById("greetingName");
            const subtitle = document.querySelector("#greetingCard .hud-subtext");
            const userLabel = document.getElementById("username");
            if (title) title.textContent = `Hello, ${name}`;
            if (subtitle) subtitle.textContent = "Your local desktop assistant is ready.";
            if (userLabel) userLabel.textContent = name;
        } catch (error) {
            console.debug("Active profile greeting unavailable:", error);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", updateGreeting);
    } else {
        updateGreeting();
    }

    loadActiveUserGreeting();

    // Update clock every second
    setInterval(updateGreeting, 1000);
})();

// Wire quick access buttons to nav views
(function setupQuickAccess() {
    function bind() {
        document.querySelectorAll(".qa-btn[data-view]").forEach(btn => {
            if (btn.dataset.qaBound === "true") return;
            btn.dataset.qaBound = "true";
            btn.addEventListener("click", () => {
                const view = btn.dataset.view;
                const navBtn = document.getElementById("nav" +
                    view.charAt(0).toUpperCase() + view.slice(1));
                if (navBtn) navBtn.click();
            });
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bind);
    } else {
        bind();
    }
})();
