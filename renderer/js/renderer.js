"use strict";

/*
====================================================
JARVIS PRO MAX
renderer.js
Part 1
Renderer Bootstrap
====================================================
*/

function createProductOffersCard(richContent) {
    if (richContent?.type === "shoppingSearch" && richContent.url) {
        let target;
        try { target = new URL(String(richContent.url)); } catch { return null; }
        if (!/^https?:$/.test(target.protocol)) return null;
        const card = document.createElement("section");
        card.className = "chat-product-offers";
        const heading = document.createElement("h3");
        heading.textContent = richContent.title || "Shopping results";
        const detail = document.createElement("p");
        detail.textContent = richContent.query || "Open product search";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "chat-product-buy";
        button.textContent = `Open ${richContent.marketplace || "shopping results"}`;
        button.addEventListener("click", async () => {
            if (window.BrowserUI?.showPanel && window.BrowserUI?.navigate) {
                await window.BrowserUI.showPanel();
                await window.BrowserUI.navigate(target.href);
            } else window.jarvis?.openURL?.(target.href);
        });
        card.append(heading, detail, button);
        return card;
    }
    if (richContent?.type !== "productOffers" || !Array.isArray(richContent.offers)) return null;
    const card = document.createElement("section");
    card.className = "chat-product-offers";
    const heading = document.createElement("h3");
    heading.textContent = richContent.title || "Price comparison";
    card.appendChild(heading);
    richContent.offers.forEach((offer, index) => {
        let target;
        try {
            target = new URL(String(offer?.url || ""));
            if (!/^https?:$/.test(target.protocol)) return;
        } catch { return; }
        const row = document.createElement("article");
        row.className = `chat-product-offer${index === 0 ? " is-cheapest" : ""}`;
        const summary = document.createElement("div");
        summary.className = "chat-product-offer-summary";
        const title = document.createElement("strong");
        title.textContent = String(offer.title || "Product listing");
        const merchant = document.createElement("span");
        merchant.textContent = String(offer.merchant || "Seller");
        const price = document.createElement("b");
        price.textContent = `${offer.currency === "INR" ? "₹" : ""}${Number(offer.price).toLocaleString("en-IN")}`;
        summary.append(title, merchant, price);
        const buy = document.createElement("button");
        buy.type = "button";
        buy.className = "chat-product-buy";
        buy.textContent = index === 0 ? "Lowest price · Buy" : "Buy from seller";
        buy.addEventListener("click", async () => {
            if (window.BrowserUI?.showPanel && window.BrowserUI?.navigate) {
                await window.BrowserUI.showPanel();
                await window.BrowserUI.navigate(target.href);
            } else {
                window.jarvis?.openURL?.(target.href);
            }
        });
        row.append(summary, buy);
        card.appendChild(row);
    });
    return card.children.length > 1 ? card : null;
}

class JARVISRenderer {

    constructor() {

        this.initialized = false;

        this.elements = {};

        this.status = {

            ai: "OFFLINE",

            voice: "OFFLINE",

            internet: "UNKNOWN"

        };

    }

    // ==========================================
    // INIT
    // ==========================================

    init() {

        console.log("🖥 Initializing Renderer...");

        this.cacheDOM();

        this.bindWindowButtons();

        this.initialized = true;

        console.log("✅ Renderer Ready");

    }

    // ==========================================
    // CACHE DOM
    // ==========================================

    cacheDOM() {

        this.elements = {

            chatMessages:

                document.getElementById("chatMessages"),

            chatInput:

                document.getElementById("chatInput"),

            sendBtn:

                document.getElementById("sendBtn"),

            fileUploadBtn:

                document.getElementById("fileUploadBtn"),

            voiceBtn:

                document.getElementById("voiceBtn"),

            voiceInterruptBtn:

                document.getElementById("voiceInterruptBtn"),

            vmInterruptBtn:

                document.getElementById("vmInterruptBtn"),

            orb:

                document.getElementById("orb"),

            footerStatus:

                document.getElementById("footerStatus"),

            systemStatus:

                document.getElementById("systemStatus"),

            aiStatus:

                document.getElementById("aiStatus"),

            voiceStatus:

                document.getElementById("voiceStatus"),

            micStatus:

                document.getElementById("micStatus"),

            whisperStatus:

                document.getElementById("whisperStatus"),

            ollamaStatus:

                document.getElementById("ollamaStatus"),

            ollamaModel:

                document.getElementById("ollamaModel"),

            internetStatus:

                document.getElementById("internetStatus"),

            minimize:

                document.getElementById("minimize"),

            maximize:

                document.getElementById("maximize"),

            close:

                document.getElementById("close")

        };

    }

    // ==========================================
    // SAFE GET
    // ==========================================

    get(id) {

        return document.getElementById(id);

    }

    // ==========================================
    // SAFE TEXT
    // ==========================================

    setText(element, value) {

        if (!element) return;

        element.textContent = value;

    }

    // ==========================================
    // SAFE CLASS
    // ==========================================

    addClass(element, className) {

        if (!element) return;

        element.classList.add(className);

    }

    removeClass(element, className) {

        if (!element) return;

        element.classList.remove(className);

    }


// ==========================================
// WINDOW BUTTONS
// ==========================================

bindWindowButtons() {

    if (this.elements.minimize) {

        this.elements.minimize.addEventListener("click", () => {

            window.jarvis?.window?.minimize?.() ||
            window.jarvis?.minimize?.();

        });

    }

    if (this.elements.maximize) {

        this.elements.maximize.addEventListener("click", () => {

            window.jarvis?.window?.maximize?.() ||
            window.jarvis?.maximize?.();

        });

    }

    if (this.elements.close) {

        this.elements.close.addEventListener("click", () => {

            window.jarvis?.window?.close?.() ||
            window.jarvis?.close?.();

        });

    }

}

// ==========================================
// STATUS UPDATE
// ==========================================

setAIStatus(status = "OFFLINE") {

    this.status.ai = status;

    this.setText(this.elements.aiStatus, status);

    this.setText(this.elements.systemStatus, status);

}

setVoiceStatus(status = "OFFLINE") {

    this.status.voice = status;

    this.setText(this.elements.voiceStatus, status);

}

setMicStatus(status = "OFFLINE") {

    this.setText(this.elements.micStatus, status);

}

setWhisperStatus(status = "OFFLINE") {

    this.setText(this.elements.whisperStatus, status);

}

setOllamaStatus(status = "OFFLINE") {

    this.status.ollama = status;

    this.setText(this.elements.ollamaStatus, status);

}

setOllamaModel(name) {

    this.setText(this.elements.ollamaModel, name || "—");

}

setInternetStatus(status = "UNKNOWN") {

    this.status.internet = status;

    this.setText(this.elements.internetStatus, status);

}

// ==========================================
// FOOTER
// ==========================================

setFooter(text) {

    this.setText(

        this.elements.footerStatus,

        text

    );

}

// ==========================================
// ORB
// ==========================================

setOrbState(active = false) {

    if (!this.elements.orb) return;

    if (active) {

        this.addClass(

            this.elements.orb,

            "active"

        );

    } else {

        this.removeClass(

            this.elements.orb,

            "active"

        );

    }

    // Voice.js still calls this with a boolean. Map it to the HUD
    // orb engine without inventing a fake timer-driven state.
    if (window.OrbEngine && typeof window.OrbEngine.setOrb === "function") {
        const voice = window.VoiceEngine || window.JARVISVoiceEngine || null;
        if (voice && voice.isSpeaking) {
            window.OrbEngine.setOrb("speaking");
        } else if (active) {
            window.OrbEngine.setOrb("listening");
        } else {
            window.OrbEngine.setOrb("ready");
        }
    }

}

// ==========================================
// CHAT
// ==========================================

addUserMessage(text) {

    if (!this.elements.chatMessages) return;

    const div = document.createElement("div");

    div.className = "message user-message";

    div.textContent = text;

    this.elements.chatMessages.appendChild(div);

    this.scrollChat();

}

addJarvisMessage(text, richContent = null, providerInfo = null) {

    if (!this.elements.chatMessages) return;

    const div = document.createElement("div");
    div.className = "message jarvis-message";

    const textNode = document.createElement("div");
    textNode.className = "message-text";
    textNode.textContent = String(text || "");
    div.appendChild(textNode);

    if (richContent?.type === "notes" && Array.isArray(richContent.sections)) {
        const card = document.createElement("section");
        card.className = "chat-notes-card";
        const title = document.createElement("h3");
        title.textContent = richContent.title || "Notes";
        card.appendChild(title);
        richContent.sections.forEach(section => {
            const part = document.createElement("section");
            const heading = document.createElement("h4");
            heading.textContent = section.heading || "";
            part.appendChild(heading);
            if (section.body) {
                const body = document.createElement("p");
                body.textContent = section.body;
                part.appendChild(body);
            }
            if (Array.isArray(section.items) && section.items.length) {
                const list = document.createElement("ul");
                section.items.forEach(item => { const li = document.createElement("li"); li.textContent = item; list.appendChild(li); });
                part.appendChild(list);
            }
            card.appendChild(part);
        });
        div.appendChild(card);
    }

    const productOffersCard = createProductOffersCard(richContent);
    if (productOffersCard) div.appendChild(productOffersCard);

    if (richContent?.type === "images" && Array.isArray(richContent.images)) {
        const gallery = document.createElement("div");
        gallery.className = "chat-image-gallery";
        richContent.images.forEach((image, index) => {
            if (!image?.url && !image?.thumbUrl) return;
            const figure = document.createElement("figure");
            figure.className = "chat-image-card";
            const img = document.createElement("img");
            img.src = image.url || image.thumbUrl;
            img.alt = image.title || richContent.title || `Image ${index + 1}`;
            img.loading = "lazy";
            img.referrerPolicy = "no-referrer";
            img.onerror = () => { if (image.url && img.src !== image.url) img.src = image.url; else figure.remove(); };
            const caption = document.createElement("figcaption");
            caption.textContent = image.title || richContent.title || `Image ${index + 1}`;
            figure.append(img, caption);
            gallery.appendChild(figure);
        });
        if (gallery.children.length) div.appendChild(gallery);
        if (richContent.searchUrl) {
            const moreImages = document.createElement("button");
            moreImages.type = "button";
            moreImages.className = "chat-gallery-search-link";
            moreImages.textContent = "More image results on Google";
            moreImages.addEventListener("click", () => {
                window.jarvis?.openURL?.(richContent.searchUrl);
            });
            div.appendChild(moreImages);
        }
    }



        if (richContent?.type === "videos" && Array.isArray(richContent.videos)) {
            const gallery = document.createElement("div");
            gallery.className = "chat-video-gallery";

            richContent.videos.forEach((video, index) => {
                if (!video?.url) return;
                const card = document.createElement("figure");
                card.className = "chat-video-card";

                const player = document.createElement("video");
                player.controls = true;
                player.preload = "metadata";
                player.playsInline = true;
                player.src = video.url;
                player.setAttribute("aria-label", video.title || `Video ${index + 1}`);

                player.addEventListener("error", () => card.classList.add("media-error"), { once: true });

                const caption = document.createElement("figcaption");
                caption.textContent = video.title || richContent.title || `Video ${index + 1}`;

                card.append(player, caption);
                gallery.appendChild(card);
            });

            if (gallery.children.length) div.appendChild(gallery);
        }
    const time = document.createElement("span");
    time.className = "msg-time";
    time.textContent = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    div.appendChild(time);

    this.elements.chatMessages.appendChild(div);
    this.scrollChat();

    return div;

}

scrollChat() {

    if (!this.elements.chatMessages) return;

    this.elements.chatMessages.scrollTop =

        this.elements.chatMessages.scrollHeight;

}
// ==========================================
// CHAT INPUT EVENTS
// ==========================================

bindChatEvents() {

    if (this.elements.sendBtn) {

        this.elements.sendBtn.addEventListener("click", () => {

            this.sendMessage();

        });

    }

    if (this.elements.fileUploadBtn) {

        this.elements.fileUploadBtn.addEventListener("click", async () => {
            try {
                const result = await window.JARVISFileContext?.pickAndRead?.();
                if (result?.success && result.file) {
                    this.setFooter(`Attached: ${result.file.name}`);
                    this.elements.chatInput?.focus();
                } else if (result && !result.canceled && result.error) {
                    this.setFooter("File attach failed");
                    console.error("❌ File attach failed:", result.error);
                }
            } catch (error) {
                this.setFooter("File attach failed");
                console.error("❌ File attach error:", error);
            }
        });

    }

    if (this.elements.chatInput) {

        this.elements.chatInput.addEventListener("keydown", (e) => {

            if (e.key === "Enter") {

                this.sendMessage();

            }

        });

    }

    if (this.elements.voiceBtn) {

        this.elements.voiceBtn.addEventListener("click", () => {

            // The mic listens continuously on its own once JARVIS is
            // started — tapping this button again just mutes/unmutes
            // it, instead of a separate mute button.
            const voice =
                window.VoiceEngine ||
                window.JARVISVoiceEngine ||
                window.VoiceAgent;

            if (!voice || typeof voice.toggleMute !== "function") {
                console.error("Voice engine is not available.");
                return;
            }

            voice.toggleMute();

        });

    }

    if (this.elements.voiceInterruptBtn) {
        this.elements.voiceInterruptBtn.addEventListener("click", event => this.interruptSpeechAndListen(event.currentTarget));
    }
    if (this.elements.vmInterruptBtn) {
        this.elements.vmInterruptBtn.addEventListener("click", event => this.interruptSpeechAndListen(event.currentTarget));
    }

    // NOTE: there is no separate mute button anymore — tapping the
    // mic button itself (voiceBtn / vmMicBtn) toggles mute. See the
    // click handler above and bindVoiceModeOverlay() below.

}

async interruptSpeechAndListen(button = this.elements.voiceInterruptBtn) {
    const voice = window.VoiceEngine || window.JARVISVoiceEngine || window.VoiceAgent;
    if (!voice) {
        this.setFooter("Voice input is unavailable");
        return false;
    }

    if (button) {
        button.disabled = true;
        button.classList.add("is-active");
    }
    try {
        // Stop the active provider in the main process first (including
        // queued/network TTS), then clear any renderer-side speech.
        await window.jarvis?.voice?.stopSpeaking?.();
        window.ChatEngine?.stopSpeaking?.();
        await window.TTSEngine?.stop?.();

        if (voice.muted && typeof voice.unmute === "function") voice.unmute();
        if (!voice.isListening && typeof voice.startListening === "function") {
            const started = await voice.startListening();
            if (started === false) throw new Error(voice.lastError || "Microphone could not start.");
        } else if (voice.isListening) {
            voice.updateStatus?.("LISTENING");
        }
        this.setFooter("JARVIS stopped speaking · Listening now");
        return true;
    } catch (error) {
        this.setFooter(error?.message || "Could not start voice input");
        console.error("Interrupt-and-listen failed:", error);
        if (button) button.classList.remove("is-active");
        return false;
    } finally {
        if (button) {
            button.disabled = false;
            button.classList.remove("is-active");
        }
    }
}

// ==========================================
// SEND MESSAGE
// ==========================================

async sendMessage() {

    const input = this.elements.chatInput;

    if (!input) return;

    const text = input.value.trim();

    if (!text) return;
    if (window.ChatEngine?.processing) {
        this.setFooter("Still processing the previous request…");
        return;
    }

    let streamedMessage = null;
    let streamedText = "";
    const stopReplyStream = window.jarvis?.ai?.onReplyToken?.((event) => {
        if (event?.source !== "chat-panel" || typeof event.token !== "string") return;
        streamedText += event.token;
        if (!streamedMessage) streamedMessage = this.addJarvisMessage(streamedText);
        else {
            const textNode = streamedMessage.querySelector(".message-text");
            if (textNode) textNode.textContent = streamedText;
        }
        this.scrollChat();
    });

    this.addUserMessage(text);

    input.value = "";

    this.setFooter("Thinking...");

    try {

        let response = "No response";
        let richContent = null;
        let providerInfo = null;

        if (window.ChatEngine && typeof window.ChatEngine.send === "function") {
            const result = await window.ChatEngine.send(text, { source: "chat-panel" });

            response = result?.response ?? result?.text ?? result?.reply ?? result?.answer ?? result?.error ?? "JARVIS could not produce a reply.";
            richContent = result?.richContent || null;
            providerInfo = result?.aiProviderName ? { providerName: result.aiProviderName, model: result.aiModel, fallbackReason: result.fallbackReason } : null;
        }
        else {
            throw new Error("The JARVIS ChatEngine is unavailable.");
        }

        if (streamedMessage) {
            const textNode = streamedMessage.querySelector(".message-text");
            if (textNode) textNode.textContent = response;
            const productOffersCard = createProductOffersCard(richContent);
            if (productOffersCard) streamedMessage.appendChild(productOffersCard);
        } else {
            this.addJarvisMessage(response, richContent, providerInfo);
        }

    }

    catch (err) {

        console.error(err);

        const errorText = "Sorry, an internal error occurred.";
        if (streamedMessage) streamedMessage.querySelector(".message-text").textContent = errorText;
        else this.addJarvisMessage(errorText);

    }

    if (typeof stopReplyStream === "function") stopReplyStream();
    this.setFooter("Ready");

}

// ==========================================
// START RENDERER
// ==========================================

start() {

    if (this.initialized) return;

    this.init();

    this.bindChatEvents();

    // No CLOUD AI is bundled. The local stack is the active conversational
    // engine: deterministic commands + knowledge first, and the OPTIONAL
    // Ollama local AI (when installed/running) for natural conversation.
    // initLocalAIStatus() keeps the UI honest about what is actually up.
    this.initLocalAIStatus();
    this.initOllamaConnector();

    this.setVoiceStatus("READY");

    this.setInternetStatus(

        navigator.onLine ?

        "ONLINE" : "OFFLINE"

    );

    this.setFooter("SYSTEM READY");

    console.log("🚀 Renderer Started");

}

// ==========================================
// LOCAL AI / VOICE ENGINE PRESENCE POLLING
// ==========================================

initOllamaConnector() {
    const stateEl = document.getElementById("ollamaConnectorState");
    const modelSelect = document.getElementById("ollamaModelSelect");
    const connectBtn = document.getElementById("ollamaConnectButton");
    const disconnectBtn = document.getElementById("ollamaDisconnectButton");
    const api = window.jarvis?.ollama;
    if (!stateEl || !modelSelect || !connectBtn || !disconnectBtn || !api) return;

    const refresh = async () => {
        stateEl.textContent = "Checking local model…";
        try {
            const result = await api.status(true);
            const status = result?.data || result;
            if (!result?.success && !status?.running) {
                stateEl.textContent = status?.error || result?.error || "Ollama unavailable";
                modelSelect.disabled = true;
                connectBtn.disabled = true;
                disconnectBtn.hidden = true;
                return;
            }

            const models = Array.isArray(status.models) ? status.models : [];
            const previous = status.selectedModel || modelSelect.value;
            modelSelect.replaceChildren();
            for (const model of models) {
                const option = document.createElement("option");
                option.value = model.name;
                option.textContent = model.name;
                modelSelect.appendChild(option);
            }
            if (!models.length) {
                const option = document.createElement("option");
                option.value = "";
                option.textContent = "No model installed";
                modelSelect.appendChild(option);
            }
            if (models.some(model => model.name === previous)) modelSelect.value = previous;
            modelSelect.disabled = !status.running || models.length === 0;
            const hasModel = Boolean(status.selectedModel && models.length);
            connectBtn.disabled = !status.running || !hasModel || status.connected === true;
            disconnectBtn.hidden = status.connected !== true;

            if (!status.running) stateEl.textContent = "Ollama server is offline";
            else if (!models.length) stateEl.textContent = "Ollama is running · no model installed";
            else if (status.connected) stateEl.textContent = `Connected · ${status.selectedModel}`;
            else stateEl.textContent = `Disconnected · ${status.selectedModel} available`;
        } catch (error) {
            stateEl.textContent = error?.message || "Could not check Ollama";
            modelSelect.disabled = true;
            connectBtn.disabled = true;
            disconnectBtn.hidden = true;
        }
    };

    if (!this._ollamaConnectorBound) {
        this._ollamaConnectorBound = true;
        modelSelect.addEventListener("change", async () => {
            modelSelect.disabled = true;
            stateEl.textContent = "Saving model…";
            const result = await api.selectModel(modelSelect.value);
            if (!result?.success) stateEl.textContent = result?.error || "Could not select model";
            await refresh();
        });
        connectBtn.addEventListener("click", async () => {
            connectBtn.disabled = true;
            const result = await api.setConnected(true);
            if (!result?.success) stateEl.textContent = result?.error || "Could not connect Ollama";
            await refresh();
        });
        disconnectBtn.addEventListener("click", async () => {
            disconnectBtn.disabled = true;
            const result = await api.setConnected(false);
            if (!result?.success) stateEl.textContent = result?.error || "Could not disconnect Ollama";
            await refresh();
        });
    }

    refresh();
    if (this._ollamaConnectorTimer) clearInterval(this._ollamaConnectorTimer);
    this._ollamaConnectorTimer = setInterval(refresh, 30000);
}

// Polls the real states of the Whisper STT engine and the online Sarvam
// provider / local Ollama fallback, and reflects them in the status box:
//   MIC      ● READY / UNAVAILABLE
//   WHISPER  ● READY / DOWNLOADING… / VOICE ENGINE OFFLINE
//   OLLAMA   ● ONLINE / OFFLINE
//   MODEL    <selected chat provider/model>
// The AI row reports the selected remote provider or local fallback.
initLocalAIStatus() {

    if (this._localAIPollTimer) clearInterval(this._localAIPollTimer);

    const update = async () => {

        // ---- Mic (browser capture capability) ----
        try {
            const micAvailable = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
            this.setMicStatus(micAvailable ? "READY" : "UNAVAILABLE");
        } catch (_) {
            this.setMicStatus("UNKNOWN");
        }

        // ---- Whisper STT engine (main-process status) ----
        try {
            if (window.jarvis && window.jarvis.voice && window.jarvis.voice.modelStatus) {
                const response = await window.jarvis.voice.modelStatus();
                const status = response && response.success ? response : response && response.data;
                const whisper = status && status.whisper;
                if (whisper) {
                    if (status.ready) {
                        this.setWhisperStatus("READY" + (whisper.model && whisper.model.name ? ` (${whisper.model.name})` : ""));
                    } else if (whisper.model && whisper.model.status === "DOWNLOADING") {
                        this.setWhisperStatus("DOWNLOADING…");
                    } else if (status.loading) {
                        this.setWhisperStatus("LOADING…");
                    } else {
                        this.setWhisperStatus("VOICE ENGINE OFFLINE");
                    }
                }
            }
        } catch (_) {
            this.setWhisperStatus("UNKNOWN");
        }

        // ---- Selected chat provider (Sarvam by default, Ollama fallback) ----
        try {
            const providerResponse = await window.jarvis?.aiProvider?.get?.();
            const providerResult = providerResponse && (providerResponse.data || providerResponse);
            const provider = providerResult?.config || providerResult;
            if (provider?.provider === "sarvam") {
                this.setOllamaStatus(provider.hasSarvamApiKey ? "SARVAM READY" : "SARVAM KEY NEEDED");
                this.setOllamaModel(`${provider.providerName || "Sarvam AI"} · ${provider.model || "sarvam-105b"}`);
                this.setAIStatus(provider.hasSarvamApiKey ? "SARVAM ONLINE" : "SARVAM NEEDS API KEY");
            } else if (window.jarvis?.ollama?.status) {
                const response = await window.jarvis.ollama.status();
                const status = response && response.success ? (response.data || response) : null;
                if (status) {
                    if (status.connected && status.selectedModel) {
                        this.setOllamaStatus("CONNECTED");
                        this.setOllamaModel(status.selectedModel);
                        this.setAIStatus("LOCAL AI ONLINE");
                    } else if (status.running && status.selectedModel) {
                        this.setOllamaStatus("DISCONNECTED");
                        this.setOllamaModel(status.selectedModel);
                        this.setAIStatus("LOCAL AI DISCONNECTED");
                    } else if (status.running) {
                        this.setOllamaStatus("NO MODEL");
                        this.setOllamaModel("—");
                        this.setAIStatus("LOCAL AI OFFLINE");
                    } else {
                        this.setOllamaStatus("OFFLINE");
                        this.setOllamaModel("—");
                        this.setAIStatus(status.installed ? "LOCAL AI OFFLINE" : "LOCAL ONLY");
                    }
                }
            }
        } catch (_) {
            // status stays as-is; JARVIS works fully without Ollama
        }
    };

    update();

    // Re-probe every 30s — Ollama can be started/stopped while JARVIS runs
    // (the client caches server probes briefly, so this stays cheap).
    this._localAIPollTimer = setInterval(update, 30000);

}

} // ✅ CLASS END

// ==========================================
// GLOBAL INSTANCE
// ==========================================

window.Renderer = new JARVISRenderer();

window.addEventListener("DOMContentLoaded", () => {

    window.Renderer.start();

    console.log("✅ renderer.js Loaded");

});

// =========================================================
// JARVIS PRO MAX
// UI BRIDGE FIX V1
// Start + Stop + Chat + TTS
// =========================================================

(function () {

    console.log("🔧 JARVIS UI Bridge Initializing...");

    // =====================================================
    // HELPERS
    // =====================================================

    function getChatEngine() {
        return window.ChatEngine || null;
    }

    function getSystemController() {
        return window.SystemController || null;
    }

    function getVoiceEngine() {
        return (
            window.VoiceEngine ||
            window.TTSEngine ||
            null
        );
    }

    function setStatus(text) {

        const status =
            document.getElementById("chatStatus");

        if (status) {
            status.textContent = String(text);
        }

        console.log("📡 JARVIS UI STATUS:", text);
    }


    // =====================================================
    // ADD UI MESSAGE
    // =====================================================

    function addUIMessage(role, text, richContent = null, providerInfo = null) {

        const box = document.getElementById("chatMessages");

        if (!box || (!text && !richContent)) return;

        const div = document.createElement("div");
        div.className = role === "user" ? "message user-message" : "message jarvis-message";

        if (text) {
            const textNode = document.createElement("div");
            textNode.className = "message-text";
            textNode.textContent = String(text);
            div.appendChild(textNode);
        }

        if (role !== "user" && richContent?.type === "notes" && Array.isArray(richContent.sections)) {
            const card = document.createElement("section");
            card.className = "chat-notes-card";
            const title = document.createElement("h3");
            title.textContent = richContent.title || "Notes";
            card.appendChild(title);
            richContent.sections.forEach(section => {
                const part = document.createElement("section");
                const heading = document.createElement("h4");
                heading.textContent = section.heading || "";
                part.appendChild(heading);
                if (section.body) { const body = document.createElement("p"); body.textContent = section.body; part.appendChild(body); }
                if (Array.isArray(section.items) && section.items.length) {
                    const list = document.createElement("ul");
                    section.items.forEach(item => { const li = document.createElement("li"); li.textContent = item; list.appendChild(li); });
                    part.appendChild(list);
                }
                card.appendChild(part);
            });
            div.appendChild(card);
        }

        const productOffersCard = role !== "user" ? createProductOffersCard(richContent) : null;
        if (productOffersCard) div.appendChild(productOffersCard);

        if (role !== "user" && richContent?.type === "images" && Array.isArray(richContent.images)) {
            const gallery = document.createElement("div");
            gallery.className = "chat-image-gallery";

            richContent.images.forEach((image, index) => {
                if (!image?.url && !image?.thumbUrl) return;

                const figure = document.createElement("figure");
                figure.className = "chat-image-card";

                const img = document.createElement("img");
                img.src = image.url || image.thumbUrl;
                img.alt = image.title || richContent.title || `Image ${index + 1}`;
                img.loading = "lazy";
                img.decoding = "async";
                img.referrerPolicy = "no-referrer";

                img.addEventListener("error", () => {
                    if (image.url && img.src !== image.url) img.src = image.url;
                    else figure.remove();
                }, { once: true });

                const caption = document.createElement("figcaption");
                caption.textContent = image.title || richContent.title || `Image ${index + 1}`;

                figure.append(img, caption);
                gallery.appendChild(figure);
            });

            if (gallery.children.length) div.appendChild(gallery);
        }



        if (richContent?.type === "videos" && Array.isArray(richContent.videos)) {
            const gallery = document.createElement("div");
            gallery.className = "chat-video-gallery";

            richContent.videos.forEach((video, index) => {
                if (!video?.url) return;
                const card = document.createElement("figure");
                card.className = "chat-video-card";

                const player = document.createElement("video");
                player.controls = true;
                player.preload = "metadata";
                player.playsInline = true;
                player.src = video.url;
                player.setAttribute("aria-label", video.title || `Video ${index + 1}`);

                player.addEventListener("error", () => card.classList.add("media-error"), { once: true });

                const caption = document.createElement("figcaption");
                caption.textContent = video.title || richContent.title || `Video ${index + 1}`;

                card.append(player, caption);
                gallery.appendChild(card);
            });

            if (gallery.children.length) div.appendChild(gallery);
        }
        const time = document.createElement("span");
        time.className = "msg-time";
        time.textContent = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
        div.appendChild(time);

        box.appendChild(div);
        box.scrollTop = box.scrollHeight;
    }


    // =====================================================
    // PROACTIVE SUGGESTIONS
    // Jarvis khud se bhi kuch useful "next things to ask" suggest
    // karta hai (see src/services/suggestionEngine.js). Purely
    // additive UI — agar bridge missing ho ya call fail ho jaaye,
    // chat normally kaam karta rehta hai.
    // =====================================================

    function renderSuggestionChips(suggestions) {

        const box = document.getElementById("chatMessages");

        if (!box || !Array.isArray(suggestions) || !suggestions.length) {
            return;
        }

        const wrap = document.createElement("div");
        wrap.className = "jarvis-suggestions";

        suggestions.forEach((item) => {

            if (!item || !item.run) return;

            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "suggestion-chip";
            chip.textContent = item.label || item.run;

            chip.addEventListener("click", () => {

                const input = document.getElementById("chatInput");

                if (input) {
                    input.value = item.run;
                }

                wrap.remove();

                sendChatMessage();
            });

            wrap.appendChild(chip);
        });

        if (wrap.children.length) {
            box.appendChild(wrap);
            box.scrollTop = box.scrollHeight;
        }
    }

    async function showJarvisSuggestions(userMessage, jarvisResponse) {

        try {

            if (!window.jarvis || !window.jarvis.suggestions) {
                return;
            }

            const result =
                await window.jarvis.suggestions.get({
                    lastUserMessage: userMessage,
                    lastJarvisResponse: jarvisResponse,
                    limit: 3
                });

            if (result && result.success) {
                renderSuggestionChips(result.suggestions);
            }

        } catch (error) {

            console.error(
                "❌ Suggestion Engine error (non-fatal):",
                error
            );
        }
    }


    // =====================================================
    // CHAT ENGINE → UI EVENT BRIDGE
    // Keeps typed + voice conversations visible immediately.
    // =====================================================

    let __chatUIEventsBound = false;

    function bindChatEngineUIEvents(chat) {
        if (__chatUIEventsBound || !chat || typeof chat.on !== "function") return;
        __chatUIEventsBound = true;

        chat.on("processingStart", payload => {
            if (payload?.message && payload.inputSource !== "chat-panel") {
                addUIMessage("user", payload.message);
            }
        });

        chat.on("messageComplete", payload => {
            // The chat panel renders its own final reply. Do not mirror the
            // same reply into the dashboard a second time.
            const inputSource = payload?.inputSource || payload?.source;
            if ((payload?.response || payload?.text) && inputSource !== "chat-panel") {
                addUIMessage("jarvis", payload.response || payload.text, payload.richContent || null, {
                    providerName: payload.aiProviderName || payload.aiProvider || "",
                    model: payload.aiModel || "",
                    fallbackReason: payload.fallbackReason || ""
                });
            }
        });

        chat.on("messageError", payload => {
            const inputSource = payload?.inputSource || payload?.source;
            if ((payload?.response || payload?.text) && inputSource !== "chat-panel") {
                addUIMessage("jarvis", payload.response || payload.text, null, {
                    providerName: payload.aiProviderName || payload.aiProvider || "",
                    model: payload.aiModel || "",
                    fallbackReason: payload.fallbackReason || ""
                });
            }
        });

        console.log("✅ ChatEngine UI event bridge connected");
    }

    // =====================================================
    // START JARVIS
    // =====================================================

    async function startJARVIS(event) {

        if (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }

        console.log("▶️ UI: START JARVIS clicked");

        setStatus("Starting...");

        try {

            const controller =
                getSystemController();

            // ---------------------------------------------
            // 1. SYSTEM CONTROLLER
            // ---------------------------------------------

            if (
                controller &&
                typeof controller.start === "function"
            ) {

                console.log(
                    "🚀 Starting through SystemController..."
                );

                try {
                    await controller.start();
                }
                catch (error) {
                    console.warn(
                        "⚠ SystemController.start failed:",
                        error
                    );
                }
            }

            // ---------------------------------------------
            // 2. CHAT ENGINE
            // ---------------------------------------------

            const chat =
                getChatEngine();

            if (!chat) {

                console.error(
                    "❌ ChatEngine not available"
                );

                setStatus("Chat Engine Offline");

                return false;
            }

            // Bind before boot so no early processing events are missed.
            bindChatEngineUIEvents(chat);

            // Boot ChatEngine if required

            if (
                typeof chat.boot === "function" &&
                !chat.booted
            ) {

                console.log(
                    "🧠 Booting ChatEngine..."
                );

                await chat.boot();
            }

            // ---------------------------------------------
            // 3. VOICE ENGINE
            // ---------------------------------------------

            const voice =
                getVoiceEngine();

            if (voice) {

                try {

                    if (
                        typeof voice.init === "function"
                    ) {
                        await voice.init();
                    }

                    voice.muted = false;

                    // If ambient Wake Word mode is enabled (wakeWord.js,
                    // default OFF, toggled via the header button or
                    // WakeWordEngine.setEnabled(true)), JARVIS sits
                    // silent until "Hey Jarvis" is heard, instead of
                    // always-on continuous listening. This preserves
                    // the pre-existing always-on behavior for anyone
                    // who hasn't opted in.
                    const wakeWordOn =
                        window.WakeWordEngine &&
                        typeof window.WakeWordEngine.isEnabled === "function" &&
                        window.WakeWordEngine.isEnabled();

                    if (wakeWordOn) {

                        voice.autoListen = false;
                        window.WakeWordEngine.start();

                    } else {

                        // Continuous "no button needed" mode: JARVIS starts
                        // listening on its own as soon as it comes online,
                        // and keeps re-listening after every command/reply.
                        voice.autoListen = true;

                        if (
                            typeof voice.startListening === "function"
                        ) {
                            await voice.startListening();
                        }
                    }

                }
                catch (voiceError) {

                    console.warn(
                        "⚠ Voice init warning:",
                        voiceError
                    );
                }
            }

            // ---------------------------------------------
            // READY
            // ---------------------------------------------

            setStatus("Online");

            console.log(
                "🟢 JARVIS UI START COMPLETE"
            );

            // ---------------------------------------------
            // GREETING
            // ---------------------------------------------

            let activeUserName = "there";
            try {
                const userApi = window.jarvis?.users || window.JarvisBridge?.users;
                const active = await userApi?.getActive?.();
                activeUserName = active?.profile?.preferredName || active?.user?.name || "there";
            } catch (_) {}
            const greeting = activeUserName === "there"
                ? "Hello. JARVIS is online. How may I assist you?"
                : `Hello ${activeUserName}. JARVIS is online. How may I assist you?`;
            const usernameEl = document.getElementById("username");
            if (usernameEl) usernameEl.textContent = activeUserName === "there" ? "Guest" : activeUserName;

            // Show greeting only if chat is empty-ish

            const messages =
                document.getElementById("chatMessages");

            if (
                messages &&
                messages.children.length === 0
            ) {

                addUIMessage(
                    "jarvis",
                    greeting
                );
            }

            // Speak greeting

            if (
                typeof chat.speak === "function"
            ) {

                try {

                    await chat.speak(
                        greeting
                    );

                }
                catch (error) {

                    console.warn(
                        "⚠ Greeting TTS failed:",
                        error
                    );
                }
            }

            return true;

        }
        catch (error) {

            console.error(
                "❌ JARVIS START ERROR:",
                error
            );

            setStatus("Start Failed");

            return false;
        }
    }


    // =====================================================
    // STOP JARVIS
    // =====================================================

    // A few varied phrasings so it doesn't say the exact same line
    // every single time, while keeping the wording the user asked
    // for ("Jarvis is now shut down" / "Jarvis is now stopped").
    const SHUTDOWN_LINES = [
        "Jarvis is now shut down. Goodbye.",
        "Jarvis is now stopped. See you next time.",
        "Jarvis is now shutting down. Take care."
    ];

    function pickShutdownLine() {
        return SHUTDOWN_LINES[
            Math.floor(Math.random() * SHUTDOWN_LINES.length)
        ];
    }

    async function stopJARVIS(event) {

        if (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }

        console.log(
            "⏹ UI: STOP JARVIS clicked"
        );

        try {

            const voice =
                getVoiceEngine();

            if (voice) {

                // Turn continuous listening off so the mic doesn't
                // silently restart itself after JARVIS has stopped.
                voice.autoListen = false;

                if (
                    typeof voice.stopListening === "function"
                ) {
                    voice.stopListening();
                }
            }

            // ---------------------------------------------
            // SHUTDOWN ANNOUNCEMENT
            // Speak the goodbye line (via XTTS-v2 — see
            // voice.speakSmart()) and let it actually finish
            // playing BEFORE stopSpeaking()/shutdown() run below,
            // since those cancel any in-progress audio.
            // ---------------------------------------------

            const shutdownLine =
                pickShutdownLine();

            if (
                voice &&
                typeof voice.speakSmart === "function"
            ) {

                try {

                    // Safety timeout: never let a stuck TTS call hold
                    // up shutdown indefinitely.
                    await Promise.race([
                        voice.speakSmart(shutdownLine),
                        new Promise(resolve => setTimeout(resolve, 8000))
                    ]);

                }
                catch (error) {
                    console.warn(
                        "⚠ Shutdown announcement failed:",
                        error
                    );
                }
            }

            const chat =
                getChatEngine();

            if (
                chat &&
                typeof chat.stopSpeaking === "function"
            ) {

                chat.stopSpeaking();
            }

            if (
                chat &&
                typeof chat.shutdown === "function"
            ) {

                await chat.shutdown();
            }

            const controller =
                getSystemController();

            if (
                controller &&
                typeof controller.stop === "function"
            ) {

                try {
                    await controller.stop();
                }
                catch (error) {
                    console.warn(
                        "⚠ SystemController.stop failed:",
                        error
                    );
                }
            }

            setStatus("Offline");

            console.log(
                "🔴 JARVIS UI STOP COMPLETE"
            );

            return true;

        }
        catch (error) {

            console.error(
                "❌ JARVIS STOP ERROR:",
                error
            );

            return false;
        }
    }


    // =====================================================
    // SEND CHAT MESSAGE
    // =====================================================

    async function sendChatMessage(event) {

        if (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }

        const input =
            document.getElementById("chatInput");

        if (!input) {

            console.error(
                "❌ chatInput not found"
            );

            return;
        }

        const text =
            String(input.value || "")
                .trim();

        if (!text) {
            return;
        }

        const chat =
            getChatEngine();

        if (!chat) {

            console.error(
                "❌ ChatEngine not found"
            );

            setStatus("Chat Offline");

            return;
        }

        console.log(
            "💬 UI → ChatEngine:",
            text
        );

        // Clear input immediately

        input.value = "";

        setStatus("Thinking...");

        // ---------------------------------------------
        // MISTAKE LEARNING — fast path
        // Checks: (a) is this message correcting Jarvis's last
        // reply? if so, save the correction. (b) has Jarvis made
        // this same mistake before? if so, answer with the
        // learned correction instead of repeating it. Isolated:
        // any failure falls through to the normal path untouched.
        // ---------------------------------------------

        if (
            window.MistakeLearningControl &&
            typeof window.MistakeLearningControl.handle === "function"
        ) {

            let learningResult = null;

            try {

                learningResult =
                    await window.MistakeLearningControl.handle(text);

            } catch (mlcError) {

                console.error(
                    "❌ MistakeLearningControl error (falling back to ChatEngine):",
                    mlcError
                );
            }

            if (learningResult && learningResult.handled) {

                addUIMessage("user", text);
                window.HistoryEngine?.add?.(text, { persist: true });
                addUIMessage("jarvis", learningResult.reply);

                window.MistakeLearningControl.noteExchange(
                    text,
                    learningResult.reply
                );

                showJarvisSuggestions(text, learningResult.reply);

                const voice = getVoiceEngine();

                if (voice && typeof voice.speak === "function") {
                    voice.speak(learningResult.reply);
                }

                setStatus("Online");

                return;
            }
        }

        // ---------------------------------------------
        // BROWSER VOICE/TEXT CONTROL — fast path
        // Same interceptor used by voice.js's sendToChat, so typed
        // browser commands ("open youtube", "youtube kholo") behave
        // identically to spoken ones. Isolated: any failure falls
        // through to the normal ChatEngine path untouched.
        // ---------------------------------------------

        if (
            window.BrowserVoiceControl &&
            typeof window.BrowserVoiceControl.handle === "function"
        ) {

            let browserResult = null;

            try {

                browserResult =
                    await window.BrowserVoiceControl.handle(text);

            } catch (bvcError) {

                console.error(
                    "❌ BrowserVoiceControl error (falling back to ChatEngine):",
                    bvcError
                );
            }

            if (browserResult && browserResult.handled) {

                addUIMessage("user", text);
                window.HistoryEngine?.add?.(text, { persist: true });
                addUIMessage("jarvis", browserResult.reply);

                showJarvisSuggestions(text, browserResult.reply);

                const voice = getVoiceEngine();

                if (voice && typeof voice.speak === "function") {
                    voice.speak(browserResult.reply);
                }

                setStatus("Online");

                return;
            }
        }

        try {

            // ---------------------------------------------
            // SEND THROUGH THE REAL V12/V11 ENGINE API
            // ---------------------------------------------

            let result;

            if (
                typeof chat.send === "function"
            ) {

                result =
                    await chat.send(
                        text,
                        {
                            speak: true,
                            source: "ui"
                        }
                    );

            }
            else if (
                typeof chat.receive === "function"
            ) {

                result =
                    await chat.receive(
                        text
                    );

            }
            else if (
                typeof chat.process === "function"
            ) {

                result =
                    await chat.process(
                        text
                    );

            }
            else {

                throw new Error(
                    "ChatEngine has no send/receive/process method"
                );
            }

            console.log(
                "📨 UI ← ChatEngine:",
                result
            );

            // ---------------------------------------------
            // RESPONSE EXTRACTION
            // ---------------------------------------------

            const response =
                result?.response ||
                result?.text ||
                result?.reply ||
                result?.message ||
                "";

            if (!response) {

                console.warn(
                    "⚠ ChatEngine returned no response:",
                    result
                );

                addUIMessage(
                    "jarvis",
                    "I could not generate a response."
                );

                setStatus("Ready");

                return;
            }

            // ---------------------------------------------
            // IMPORTANT:
            // Latest ChatEngine already renders replies
            // through reply() → addMessage().
            //
            // Therefore DON'T blindly add duplicate
            // messages here.
            // ---------------------------------------------

            // Remember this exchange so MistakeLearningControl can
            // recognise a correction on the user's next message.
            window.MistakeLearningControl?.noteExchange?.(text, response);

            showJarvisSuggestions(text, response);

            setStatus("Online");

            console.log(
                "✅ UI Chat Response:",
                response
            );

        }
        catch (error) {

            console.error(
                "❌ UI CHAT ERROR:",
                error
            );

            addUIMessage(
                "jarvis",
                "Sorry, I encountered an error while processing that."
            );

            setStatus("Ready");
        }
    }


    // =====================================================
    // ENTER KEY
    // =====================================================

    function chatKeyDown(event) {

        if (
            event.key === "Enter" &&
            !event.shiftKey
        ) {

            event.preventDefault();

            sendChatMessage(event);
        }
    }


    // =====================================================
    // MIC / VOICE
    // =====================================================

    async function startVoice(event) {

        if (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }

        console.log(
            "🎤 UI: MIC clicked"
        );

        const chat =
            getChatEngine();

        if (!chat) {
            console.error(
                "❌ ChatEngine unavailable"
            );
            return;
        }

        setStatus("Listening...");

        try {

            // ---------------------------------------------
            // VoiceEngine
            // ---------------------------------------------

            const voice =
                window.VoiceEngine;

            if (
                voice &&
                typeof voice.listen === "function"
            ) {

                const text =
                    await voice.listen();

                if (text) {

                    console.log(
                        "🎤 Heard:",
                        text
                    );

                    // Re-enter through VoiceEngine's single normalization
                    // path so Hindi stays available as the original utterance
                    // while command matching can use its private canonical
                    // form. ChatEngine owns the one visible user message.
                    if (typeof voice.sendToChat === "function") {
                        await voice.sendToChat(text);
                    } else if (typeof chat.sendVoice === "function") {
                        await chat.sendVoice(text);
                    } else {

                        await chat.send(
                            text,
                            {
                                speak: true,
                                source: "voice"
                            }
                        );
                    }

                    setStatus("Online");

                    return;
                }
            }

            // Phase 9: browser/cloud SpeechRecognition fallback is disabled.
            // Voice input is handled exclusively by the local VoiceEngine/STT bridge.

            console.warn(
                "⚠ Local voice recognition engine unavailable"
            );

            setStatus("Voice Unavailable");

        }
        catch (error) {

            console.error(
                "❌ Voice Input Error:",
                error
            );

            setStatus("Ready");
        }
    }


    // =====================================================
    // VOICE MODE OVERLAY
    // Fullscreen "just talk to JARVIS" view: big orb, bottom
    // bar with type box / mute / mic / close — mic starts
    // listening automatically the moment it opens.
    // =====================================================

    function openVoiceMode() {

        const overlay =
            document.getElementById("voiceModeOverlay");

        if (!overlay) return;

        overlay.classList.add("open");

        const voice = getVoiceEngine();

        if (voice) {

            voice.autoListen = true;

            if (typeof voice.init === "function" && !voice.initialized) {
                voice.init();
            }

            if (!voice.muted && typeof voice.startListening === "function") {
                voice.startListening();
            }
        }
    }

    function closeVoiceMode() {

        const overlay =
            document.getElementById("voiceModeOverlay");

        if (!overlay) return;

        overlay.classList.remove("open");

        const voice = getVoiceEngine();

        if (voice) {
            voice.autoListen = false;

            if (typeof voice.stopListening === "function") {
                voice.stopListening();
            }
        }

        // Closing voice mode returns to the redesigned Dashboard instead
        // of revealing the legacy ARC-reactor controls behind the overlay.
        document.querySelector('.menu-item[data-view="dashboard"]')?.click();
    }

    function bindVoiceModeOverlay() {

        const closeBtn =
            document.getElementById("vmCloseBtn");

        if (closeBtn && closeBtn.dataset.jarvisUIBound !== "true") {
            closeBtn.dataset.jarvisUIBound = "true";
            closeBtn.addEventListener("click", closeVoiceMode);
        }

        const micBtn =
            document.getElementById("vmMicBtn");

        if (micBtn && micBtn.dataset.jarvisUIBound !== "true") {
            micBtn.dataset.jarvisUIBound = "true";
            micBtn.addEventListener("click", () => {
                // Mic listens continuously by itself — tapping again
                // just mutes/unmutes it (no separate mute button).
                const voice = getVoiceEngine();
                if (voice && typeof voice.toggleMute === "function") {
                    voice.toggleMute();
                }
            });
        }

        const thinkToggle =
            document.getElementById("vmThinkToggle");

        if (thinkToggle && thinkToggle.dataset.jarvisUIBound !== "true") {
            thinkToggle.dataset.jarvisUIBound = "true";
            thinkToggle.addEventListener("click", () => {
                thinkToggle.classList.toggle("active");
            });
        }

        const typeInput =
            document.getElementById("vmTypeInput");

        const chatToggle = document.getElementById("vmChatToggle");
        if (chatToggle && chatToggle.dataset.jarvisUIBound !== "true") {
            chatToggle.dataset.jarvisUIBound = "true";
            chatToggle.addEventListener("click", () => {
                closeVoiceMode();
                document.querySelector('.menu-item[data-view="chat"]')?.click();
            });
        }

        if (typeInput && typeInput.dataset.jarvisUIBound !== "true") {
            typeInput.dataset.jarvisUIBound = "true";
            typeInput.addEventListener("keydown", (e) => {

                if (e.key !== "Enter") return;

                const text = typeInput.value.trim();

                if (!text) return;

                const chatInput =
                    document.getElementById("chatInput");

                if (chatInput) {
                    chatInput.value = text;
                }

                typeInput.value = "";

                const sendBtn =
                    document.getElementById("sendBtn");

                if (sendBtn) {
                    sendBtn.click();
                } else if (
                    window.JARVISRendererInstance &&
                    typeof window.JARVISRendererInstance.sendMessage === "function"
                ) {
                    window.JARVISRendererInstance.sendMessage();
                }
            });
        }
    }


    // =====================================================
    // BIND UI
    // =====================================================

    function bindJARVISUI() {

        console.log(
            "🔗 Binding JARVIS UI..."
        );

        // ---------------------------------------------
        // START BUTTONS
        // There are TWO start buttons in current HTML:
        // #startJarvis
        // #start-btn
        // ---------------------------------------------

        const startButtons =
            document.querySelectorAll(
                "#startJarvis, #start-btn"
            );

        startButtons.forEach(button => {

            if (
                button.dataset.jarvisUIBound === "true"
            ) {
                return;
            }

            button.dataset.jarvisUIBound =
                "true";

            button.addEventListener(
                "click",
                startJARVIS,
                true
            );

            console.log(
                "✅ Start button bound:",
                button.id
            );
        });


        // ---------------------------------------------
        // STOP BUTTONS
        // ---------------------------------------------

        const stopButtons =
            document.querySelectorAll(
                "#stopJarvis, #stop-btn"
            );

        stopButtons.forEach(button => {

            if (
                button.dataset.jarvisUIBound === "true"
            ) {
                return;
            }

            button.dataset.jarvisUIBound =
                "true";

            button.addEventListener(
                "click",
                stopJARVIS,
                true
            );

            console.log(
                "✅ Stop button bound:",
                button.id
            );
        });


        // ---------------------------------------------
        // VOICE MODE OVERLAY (fullscreen talk-to-JARVIS)
        // ---------------------------------------------

        bindVoiceModeOverlay();


        // ---------------------------------------------
        // NAV MENU (sidebar tabs)
        // Only "Voice" currently triggers real behavior
        // (start/stop listening, using the existing voice
        // engine). Dashboard/Chat both point at the single
        // existing view (no separate views exist for them).
        // Browser/Files/Memory/Settings have no dedicated
        // view built yet — clicking them updates the active
        // state and current-task label honestly, without
        // pretending a feature exists that isn't built.
        // ---------------------------------------------

        const navButtons =
            document.querySelectorAll(
                ".menu-item[data-view]"
            );

        const minimizeChatButton = document.getElementById("minimizeChatPanelBtn");
        const restoreChatButton = document.getElementById("restoreChatPanelBtn");
        const setChatPanelMinimized = (minimized) => {
            document.body.classList.toggle("chat-panel-minimized", Boolean(minimized));
            document.body.classList.toggle("chat-view-active", !minimized);
            document.body.classList.toggle("dashboard-view-active", Boolean(minimized));
            document.querySelector('.menu-item[data-view="chat"]')?.classList.toggle("active", !minimized);
            if (minimized) document.querySelector('.menu-item[data-view="dashboard"]')?.classList.add("active");
            else document.querySelector('.menu-item[data-view="dashboard"]')?.classList.remove("active");
            if (restoreChatButton) restoreChatButton.hidden = !minimized;
            if (minimizeChatButton) {
                minimizeChatButton.setAttribute("aria-label", minimized ? "Restore chat panel" : "Minimize chat panel");
                minimizeChatButton.title = minimized ? "Restore chat panel" : "Minimize chat panel";
                minimizeChatButton.textContent = minimized ? "+" : "−";
            }
        };
        if (minimizeChatButton && minimizeChatButton.dataset.jarvisUIBound !== "true") {
            minimizeChatButton.dataset.jarvisUIBound = "true";
            minimizeChatButton.addEventListener("click", () => setChatPanelMinimized(!document.body.classList.contains("chat-panel-minimized")));
        }
        if (restoreChatButton && restoreChatButton.dataset.jarvisUIBound !== "true") {
            restoreChatButton.dataset.jarvisUIBound = "true";
            restoreChatButton.addEventListener("click", () => {
                setChatPanelMinimized(false);
                document.getElementById("chatInput")?.focus();
            });
        }

        const currentTaskEl =
            document.getElementById(
                "currentTask"
            );

        const navLabels = {
            dashboard: "Waiting For Command...",
            chat: "Chat Ready",
            voice: "Voice Ready",
            browser: "Browser Ready",
            files: "File Explorer Ready",
            documents: "Document Gallery",
            memory: "Memory Viewer Ready",
            settings: "Settings Ready",
            health: "Health Matrix",
            "background-events": "Background Events",
            lab: "JARVIS Lab",
            "ai-queue": "AI Message Queue"
        };

        navButtons.forEach(button => {

            if (
                button.dataset.jarvisUIBound === "true"
            ) {
                return;
            }

            button.dataset.jarvisUIBound =
                "true";

            button.addEventListener(
                "click",
                () => {

                    const containingGroup = button.closest(".menu-group");
                    if (containingGroup) containingGroup.open = true;

                    navButtons.forEach(b =>
                        b.classList.remove("active")
                    );

                    button.classList.add("active");

                    const view = button.dataset.view;
                    if (view !== "chat" && document.body.classList.contains("chat-panel-minimized")) {
                        setChatPanelMinimized(false);
                    }

                    // Electron's BrowserView/WebContentsView is outside the
                    // renderer DOM. Hide it explicitly on every non-browser
                    // navigation or it remains layered over Voice/Chat.
                    if (view !== "browser") window.BrowserUI?.hidePanel?.();

                    if (currentTaskEl && navLabels[view]) {
                        currentTaskEl.textContent = navLabels[view];
                    }

                    if (window.JarvisHealth) {
                        if (view === "health") {
                            window.JarvisHealth.show();
                        } else {
                            window.JarvisHealth.hide();
                        }
                    }

                    if (window.JarvisBackgroundEvents) {
                        if (view === "background-events") {
                            window.JarvisBackgroundEvents.show();
                        } else {
                            window.JarvisBackgroundEvents.hide();
                        }
                    }

                    if (window.JARVISLab) {
                        if (view === "lab") {
                            window.JARVISLab.show();
                        } else {
                            window.JARVISLab.hide();
                        }
                    }

                    if (window.JARVISAIMessageQueue) {
                        if (view === "ai-queue") window.JARVISAIMessageQueue.show();
                        else window.JARVISAIMessageQueue.hide();
                    }

                    document.body.classList.toggle("background-events-view-active", view === "background-events");
                    document.body.classList.toggle("lab-view-active", view === "lab");
                    document.body.classList.toggle("ai-queue-view-active", view === "ai-queue");

                    document.body.classList.toggle("dashboard-view-active", view === "dashboard");
                    document.body.classList.toggle("chat-view-active", view === "chat");
                    document.body.classList.toggle("browser-view-active", view === "browser");

                    if (view === "chat") {
                        setChatPanelMinimized(false);
                        const chatPanel = document.querySelector(".chat-panel");
                        const chatInput = document.getElementById("chatInput");
                        if (chatPanel) {
                            chatPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
                        }
                        setTimeout(() => chatInput?.focus(), 120);
                    }

                    if (view === "dashboard") {
                        document.body.classList.remove("chat-view-active");
                    }

                    // Show/hide memory panel
                    const memPanel = document.getElementById("memoryPanel");
                    if (memPanel) {
                        memPanel.hidden = (view !== "memory");
                        if (view === "memory" && window.JarvisPanels) {
                            window.JarvisPanels.Memory.show();
                        }
                    }

                    // Show/hide settings panel
                    const setPanel = document.getElementById("settingsPanel");
                    if (setPanel) {
                        setPanel.hidden = (view !== "settings");
                        if (view === "settings" && window.JarvisPanels) {
                            window.JarvisPanels.Settings.show();
                        }
                    }

                    // Show/hide files panel
                    const filesPanel = document.getElementById("filesPanel");
                    if (filesPanel) {
                        filesPanel.hidden = (view !== "files");
                        if (view === "files" && window.JarvisPanels) {
                            window.JarvisPanels.Files.show();
                        }
                    }

                    const documentsPanel = document.getElementById("documentsPanel");
                    if (documentsPanel) {
                        documentsPanel.hidden = view !== "documents";
                        if (view === "documents") window.JARVISDocumentsGallery?.refresh?.();
                    }

                    document.body.classList.toggle("memory-view-active", view === "memory");
                    document.body.classList.toggle("settings-view-active", view === "settings");
                    document.body.classList.toggle("files-view-active", view === "files");
                    document.body.classList.toggle("documents-view-active", view === "documents");

                    if (view === "voice") {
                        openVoiceMode();
                    }
                }
            );
        });


        // ---------------------------------------------
        // SEND
        // ---------------------------------------------

        const sendButton =
            document.getElementById(
                "sendButton"
            );

        if (
            sendButton &&
            sendButton.dataset.jarvisUIBound !== "true"
        ) {

            sendButton.dataset.jarvisUIBound =
                "true";

            sendButton.addEventListener(
                "click",
                sendChatMessage,
                true
            );

            console.log(
                "✅ Send button bound"
            );
        }


        // ---------------------------------------------
        // CHAT INPUT
        // ---------------------------------------------

        const input =
            document.getElementById(
                "chatInput"
            );

        if (
            input &&
            input.dataset.jarvisUIBound !== "true"
        ) {

            input.dataset.jarvisUIBound =
                "true";

            input.addEventListener(
                "keydown",
                chatKeyDown,
                true
            );

            console.log(
                "✅ Chat input bound"
            );
        }


        // ---------------------------------------------
        // MIC
        // ---------------------------------------------

        const micButton =
            document.getElementById(
                "micButton"
            );

        if (
            micButton &&
            micButton.dataset.jarvisUIBound !== "true"
        ) {

            micButton.dataset.jarvisUIBound =
                "true";

            micButton.addEventListener(
                "click",
                startVoice,
                true
            );

            console.log(
                "✅ Mic button bound"
            );
        }


        console.log(
            "🟢 JARVIS UI Bridge Ready"
        );
    }


    // =====================================================
    // DOM READY
    // =====================================================

    if (
        document.readyState === "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            bindJARVISUI,
            {
                once: true
            }
        );

    }
    else {

        bindJARVISUI();
    }


    // =====================================================
    // DELAYED REBIND
    // Useful when UI is injected dynamically
    // =====================================================

    setTimeout(
        bindJARVISUI,
        500
    );

    setTimeout(
        bindJARVISUI,
        1500
    );


    // =====================================================
    // AUTO-START
    // JARVIS now goes fully online — chat engine, mic
    // listening, greeting — on its own as soon as the UI is
    // ready. No click on the START button required; it stays
    // "always online" for the rest of the session exactly
    // like pressing START would, until STOP is clicked or the
    // mic is muted.
    // =====================================================

    let __jarvisAutoStarted = false;

    function autoStartJARVIS() {

        if (__jarvisAutoStarted) return;
        __jarvisAutoStarted = true;

        console.log("⚡ Auto-starting JARVIS (always-on mode)...");

        startJARVIS().catch((error) => {
            console.warn("⚠ JARVIS auto-start failed:", error);
            // Allow a retry — a transient failure (mic permission
            // dialog still pending, engine not attached yet, etc.)
            // shouldn't permanently block startup.
            __jarvisAutoStarted = false;
        });
    }

    if (
        document.readyState === "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            () => setTimeout(autoStartJARVIS, 800),
            { once: true }
        );
    } else {
        setTimeout(autoStartJARVIS, 800);
    }


    // =====================================================
    // GLOBAL DEBUG API
    // =====================================================

    window.JARVISUI = {

        start: startJARVIS,

        stop: stopJARVIS,

        send: sendChatMessage,

        voice: startVoice,

        bind: bindJARVISUI,

        status: function () {

            const chat =
                getChatEngine();

            return {

                chatEngine:
                    !!chat,

                booted:
                    chat
                        ? !!chat.booted
                        : false,

                initialized:
                    chat
                        ? !!chat.initialized
                        : false,

                status:
                    chat
                        ? chat.status
                        : "missing"

            };
        }

    };


    console.log(
        "✅ JARVIS UI Bridge Loaded"
    );

})();
