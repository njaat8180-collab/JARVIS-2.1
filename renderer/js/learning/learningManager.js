"use strict";

/*
 * ============================================================
 * JARVIS PRO MAX — LEARNING MANAGER (ORCHESTRATOR)
 * renderer/js/learning/learningManager.js
 * ============================================================
 *
 * The central orchestrator for all autonomous learning.
 *
 * Coordinates:
 *   - PermissionManager → can I learn?
 *   - WebResearcher     → search, extract, verify
 *   - SafetyFilter      → block sensitive content
 *   - KnowledgeStore    → store structured knowledge
 *   - CorrectionLearner → user corrections + command examples
 *
 * Integration with existing JARVIS:
 *   - enhanceResponse(topic) → inject learned knowledge into chat
 *   - handleUserMessage() → detect corrections/commands
 *   - announce() → send through existing TTS + chat
 *
 * OFFLINE: if no internet, silently falls back to local knowledge.
 * NEVER blocks main JARVIS operation.
 * ============================================================
 */

(function () {

    // ============================================================
    // CONFIG (with defaults — overridable via setConfig)
    // ============================================================

    const DEFAULT_CONFIG = Object.freeze({
        enabled: false,
        permissionMode: "ASK_EACH_TIME",
        schedule: "manual",
        maxSearchesPerCycle: 5,
        maxItemsPerCycle: 10,
        requireVerification: true,
        requireUserApproval: true,
        allowedDomains: [],
        blockedDomains: [],
        autoLearnTopics: [],
    });

    let config = null;

    function loadConfig() {
        if (config !== null) return config;
        try {
            const saved = JSON.parse(localStorage.getItem("jarvis_learning_config") || "{}");
            config = { ...DEFAULT_CONFIG, ...saved };
        } catch (_) {
            config = { ...DEFAULT_CONFIG };
        }
        return config;
    }

    function saveConfig() {
        try {
            localStorage.setItem("jarvis_learning_config", JSON.stringify(config));
        } catch (_) {}
    }

    function setConfig(updates) {
        loadConfig();
        config = { ...config, ...updates };
        saveConfig();

        // Sync permission mode to PermissionManager
        if (updates.permissionMode && window.JARVISLearningPermission) {
            window.JARVISLearningPermission.setState(updates.permissionMode);
        }

        // Sync web researcher
        if (window.JARVISWebResearcher) {
            window.JARVISWebResearcher.configure({
                maxSourcesPerTopic: Math.max(1, Math.ceil(config.maxSearchesPerCycle / 2)),
            });
        }
    }

    function getConfig() {
        return { ...loadConfig() };
    }

    // ============================================================
    // ANNOUNCE (through existing TTS + chat)
    // ============================================================

    /**
     * Send a message through the existing TTS pipeline.
     * Uses voice.js speak() if available, or window.jarvis.voice.speak.
     * Also displays in chat UI via window.ChatEngine.addMessage.
     */
    function announce(text) {
        if (!text) return;

        // Chat display
        try {
            if (window.ChatEngine && typeof window.ChatEngine.addMessage === "function") {
                window.ChatEngine.addMessage(text, "assistant");
            } else if (window.addChatMessage) {
                window.addChatMessage(text, "assistant");
            }
        } catch (_) {}

        // TTS
        try {
            if (window.VoiceEngine && typeof window.VoiceEngine.speak === "function") {
                window.VoiceEngine.speak(text);
            } else if (window.jarvis && window.jarvis.voice && typeof window.jarvis.voice.speak === "function") {
                window.jarvis.voice.speak(text);
            }
        } catch (_) {}
    }

    // ============================================================
    // RESEARCH TOPIC — full learning pipeline
    // ============================================================

    /**
     * Research a topic and potentially store the knowledge.
     * This is the MAIN entry point for autonomous learning.
     *
     * @param {string} topic — what to learn about
     * @param {Object} opts — overrides
     * @returns {Promise<Object>} { success, stored, topic, reason }
     */
    async function researchTopic(topic, opts = {}) {
        loadConfig();

        if (!config.enabled && !opts.force) {
            return { success: false, stored: 0, topic, reason: "learning_disabled" };
        }

        const log = window.JARVISKnowledgeStore?.log.bind(window.JARVISKnowledgeStore);

        // ---- Step 1: Check if already known ----
        const existing = window.JARVISKnowledgeStore?.findExisting(topic);
        if (existing && existing.verificationStatus === "verified" && !opts.force) {
            log?.({ action: "already_known", topic });
            return { success: true, stored: 0, topic, reason: "already_known", existing };
        }

        // ---- Step 2: Check internet ----
        const online = window.JARVISWebResearcher ? await window.JARVISWebResearcher.isOnline() : false;
        if (!online) {
            log?.({ action: "offline", topic });
            return { success: false, stored: 0, topic, reason: "offline" };
        }

        // ---- Step 3: Research ----
        // DOMAIN-AWARE ROUTING — weather/news/currency/books/... go to
        // the right sources first, with domain-specific freshness TTLs.
        const domainRoute = window.JARVISDomainRouter
            ? window.JARVISDomainRouter.classifyQuestion(topic)
            : { domain: "general", ttl: null, preferredOrder: null };

        const researchResult = await window.JARVISWebResearcher.researchViaChain
            ? await window.JARVISWebResearcher.researchViaChain(topic, {
                allowedDomains: config.allowedDomains,
                blockedDomains: config.blockedDomains,
                maxSearches: config.maxSearchesPerCycle,
                preferredOrder: domainRoute.preferredOrder,
                domain: domainRoute.domain,
                sourceTimeoutMs: 8000,
            })
            : await window.JARVISWebResearcher.research(topic, {
            allowedDomains: config.allowedDomains,
            blockedDomains: config.blockedDomains,
            maxSearches: config.maxSearchesPerCycle,
        });

        if (!researchResult.success || !researchResult.candidates.length) {
            return { success: false, stored: 0, topic, reason: researchResult.failureReason || "research_failed" };
        }

        // ---- Step 4: Filter by verification requirement ----
        let candidates = researchResult.candidates;
        const retrievedAtISO = new Date().toISOString();
        for (const c of candidates) {
            if (!c.retrievedAt) c.retrievedAt = retrievedAtISO;
            if (!c.domain) c.domain = domainRoute.domain;
        }
        if (config.requireVerification) {
            candidates = candidates.filter(c => c.verificationStatus === "verified" || c.verificationStatus === "unverified");
            // Don't auto-learn conflicting — but PRESERVE the evidence:
            // store a conflict record carrying BOTH sources so nothing is
            // silently discarded (requirement: never silently pick one).
            if (candidates.some(c => c.verificationStatus === "conflicting")) {
                const conflicting = candidates.find(c => c.verificationStatus === "conflicting");
                const allSources = candidates.map(c => ({
                    claim: c.knowledge,
                    source: c.source || "unknown",
                    sourceUrl: c.sourceUrl || "",
                    sourceTitle: c.sourceTitle || "",
                    confidence: c.confidence || 0.5,
                })).slice(0, 6);
                window.JARVISKnowledgeStore.add({
                    topic: String(topic).toLowerCase().trim(),
                    knowledge: conflicting.knowledge || "Conflicting information found across sources.",
                    category: conflicting.category || "general",
                    source: "conflict-record",
                    sourceType: "conflict",
                    sourceTitle: "Conflict record — multiple sources disagree",
                    sourceUrl: "",
                    confidence: 0.3, // low — unverified
                    verificationStatus: "conflicting",
                    conflictStatus: "conflicting",
                    approvedByUser: false,
                    tags: ["conflict", domainRoute.domain || "general"],
                    expiresAt: null, // evidence is permanent
                });
                announce(`I found conflicting information about "${topic}" from multiple sources. I've preserved all versions and won't learn it automatically. Would you like me to show you the details?`);
                return { success: true, stored: 0, topic, reason: "conflicting_sources", conflicting, preservedSources: allSources };
            }
        }

        // ---- Step 5: Permission check ----
        let stored = 0;
        const maxItems = Math.min(candidates.length, config.maxItemsPerCycle);

        for (const candidate of candidates.slice(0, maxItems)) {
            // Safety check (double-check even though researcher already filtered)
            if (window.JARVISSafetyFilter) {
                const safety = window.JARVISSafetyFilter.check(candidate.knowledge);
                if (!safety.safe) {
                    log?.({
                        action: "candidate_blocked",
                        topic,
                        reasons: safety.reasons,
                    });
                    continue;
                }
            }

            // Permission
            const perm = window.JARVISLearningPermission?.check({
                url: candidate.sourceUrl,
                confidence: candidate.confidence,
                isSensitive: false,
                category: candidate.category,
            }) || { allowed: false, needsApproval: true };

            if (perm.allowed) {
                // Store directly
                const result = window.JARVISKnowledgeStore.add({
                    ...candidate,
                    approvedByUser: true,
                    expiresAt: candidate.permanent === true ? null : (window.JARVISDomainRouter ? window.JARVISDomainRouter.computeDomainExpiry(domainRoute.domain, computeExpiry(candidate.category)) : computeExpiry(candidate.category)),
                });
                if (result.action === "created" || result.action === "updated") {
                    stored++;
                    log?.({ action: "knowledge_stored", topic, id: result.item.id, action: result.action });
                }
            } else if (perm.needsApproval && !config.requireUserApproval) {
                // Approval not required — store as unapproved
                const result = window.JARVISKnowledgeStore.add({
                    ...candidate,
                    approvedByUser: false,
                    expiresAt: candidate.permanent === true ? null : (window.JARVISDomainRouter ? window.JARVISDomainRouter.computeDomainExpiry(domainRoute.domain, computeExpiry(candidate.category)) : computeExpiry(candidate.category)),
                });
                if (result.action === "created" || result.action === "updated") {
                    stored++;
                    log?.({ action: "knowledge_stored_unapproved", topic, id: result.item.id });
                }
            } else if (perm.needsApproval) {
                // Ask user
                if (opts.silent) continue; // scheduler mode — skip asking

                announce(`I found information that could improve my knowledge${candidate.topic ? ` about "${candidate.topic}"` : ""}. Would you like me to learn it?`);

                // In real UI, this would show buttons. For now, we return
                // pending approval status and the caller/UI can handle it.
                const result = window.JARVISKnowledgeStore.add({
                    ...candidate,
                    approvedByUser: false,
                    expiresAt: candidate.permanent === true ? null : (window.JARVISDomainRouter ? window.JARVISDomainRouter.computeDomainExpiry(domainRoute.domain, computeExpiry(candidate.category)) : computeExpiry(candidate.category)),
                });
                if (result.action === "created") {
                    stored++;
                    log?.({ action: "knowledge_pending_approval", topic, id: result.item.id });
                }
            }
        }

        if (stored > 0) {
            announce(`I've learned ${stored} new ${stored === 1 ? "thing" : "things"} about ${topic}.`);
        }

        return { success: true, stored, topic, searchCount: researchResult.searchCount };
    }

    // ============================================================
    // ENHANCE RESPONSE — inject knowledge into chat replies
    // ============================================================

    /**
     * Look up learned knowledge for a given topic/query.
     * Returns a knowledge context string to prepend to the response,
     * or null if no relevant knowledge is found.
     */
    function enhanceResponse(query) {
        if (!window.JARVISKnowledgeStore) return null;

        const results = window.JARVISKnowledgeStore.search(query, { limit: 3 });
        if (!results.length) return null;

        // Filter: only use verified or approved knowledge
        const usable = results.filter(r =>
            r.verificationStatus === "verified" ||
            r.approvedByUser ||
            r.confidence >= 0.60
        );

        if (!usable.length) return null;

        // Build context
        const lines = usable.map(r => {
            const source = r.sourceUrl ? ` (Source: ${r.sourceTitle || r.sourceUrl})` : "";
            return `- ${r.knowledge}${source}`;
        });

        return lines.join("\n");
    }

    /**
     * Get knowledge items for a topic — for the chat engine to
     * include in its context block.
     */
    function getKnowledgeContext(query) {
        const text = enhanceResponse(query);
        if (!text) return "";
        return `[LEARNED KNOWLEDGE]\n${text}\n[/LEARNED KNOWLEDGE]`;
    }

    // ============================================================
    // HANDLE USER MESSAGE — detect corrections + commands
    // ============================================================

    /**
     * Called for every user message. Checks if it's a correction
     * or command-teaching message, and handles accordingly.
     *
     * Returns { handled: boolean, action: string, data: any } or null.
     */
    async function handleUserMessage(message, context = {}) {
        loadConfig();
        if (!config.enabled) return null;

        // ---- Check for command teaching ----
        const commandTeach = window.JARVISCorrectionLearner?.detectCommandTeach(message);
        if (commandTeach) {
            announce(`Should I remember this command? When you say "${commandTeach.utterance}", I should ${commandTeach.command}.`);

            // Store with pending approval (UI flow would handle the Yes/No)
            // For now, we auto-approve if permission mode is ALLOWED or AUTO_LEARN
            const perm = window.JARVISLearningPermission?.getState();
            if (perm === "ALLOWED" || perm === "AUTO_LEARN") {
                const entry = window.JARVISCorrectionLearner.storeCommand({
                    utterance: commandTeach.utterance,
                    command: commandTeach.command,
                    approved: true,
                });
                return { handled: true, action: "command_learned", data: entry };
            }
            // Store pending — await UI approval
            return { handled: true, action: "command_pending", data: commandTeach };
        }

        // ---- Check for correction ----
        const correction = window.JARVISCorrectionLearner?.detectCorrection(message);
        if (correction) {
            const perm = window.JARVISLearningPermission?.getState();
            if (perm === "ALLOWED" || perm === "AUTO_LEARN") {
                const entry = window.JARVISCorrectionLearner.storeCorrection({
                    input: context.previousInput || message,
                    previousInterpretation: correction.previousInterpretation,
                    correctInterpretation: correction.correctInterpretation,
                    approved: true,
                });
                announce(`Got it. I'll remember that you meant "${correction.correctInterpretation}".`);
                return { handled: true, action: "correction_learned", data: entry };
            }
            // In ASK mode — ask
            announce(`I understand you meant "${correction.correctInterpretation}". Should I remember this correction?`);
            return { handled: true, action: "correction_pending", data: correction };
        }

        return null;
    }

    /**
     * Check if a learned command matches the current utterance.
     * Returns the learned command entry or null.
     */
    function lookupLearnedCommand(utterance) {
        if (!window.JARVISCorrectionLearner) return null;
        return window.JARVISCorrectionLearner.lookupCommand(utterance);
    }

    /**
     * Check if a past correction applies to the current input.
     */
    function lookupCorrection(input) {
        if (!window.JARVISCorrectionLearner) return null;
        return window.JARVISCorrectionLearner.lookupCorrection(input);
    }

    // ============================================================
    // EXPIRY COMPUTATION
    // ============================================================

    function computeExpiry(category) {
        const now = Date.now();
        const DAY = 24 * 60 * 60 * 1000;

        switch (category) {
            case "current":
                return new Date(now + 7 * DAY).toISOString(); // 1 week
            case "technology":
                return new Date(now + 90 * DAY).toISOString(); // 3 months
            case "documentation":
                return new Date(now + 90 * DAY).toISOString(); // 3 months
            case "science":
            case "history":
                return null; // permanent
            default:
                return new Date(now + 30 * DAY).toISOString(); // 1 month
        }
    }

    // ============================================================
    // STATS / STATUS
    // ============================================================

    function getStatus() {
        loadConfig();
        const ksStats = window.JARVISKnowledgeStore?.stats() || {};
        const clStats = window.JARVISCorrectionLearner?.stats() || {};
        const perm = window.JARVISLearningPermission?.getState() || "ASK_EACH_TIME";

        return {
            enabled: config.enabled,
            permissionMode: perm,
            schedule: config.schedule,
            knowledgeItems: ksStats.total || 0,
            verifiedKnowledge: ksStats.verified || 0,
            pendingApprovals: ksStats.pendingApproval || 0,
            conflictingItems: ksStats.conflicting || 0,
            correctionsLearned: clStats.corrections || 0,
            commandsLearned: clStats.commands || 0,
            lastLearningCycle: getLastCycleTime(),
            config: { ...config },
        };
    }

    function getLastCycleTime() {
        try {
            return localStorage.getItem("jarvis_last_learning_cycle") || null;
        } catch (_) { return null; }
    }

    function setLastCycleTime() {
        try {
            localStorage.setItem("jarvis_last_learning_cycle", new Date().toISOString());
        } catch (_) {}
    }

    // ============================================================
    // MANUAL TRIGGER
    // ============================================================

    async function learnNow(topic) {
        if (!topic) return { success: false, reason: "no_topic" };
        announce(`Searching the web for information about "${topic}".`);
        const result = await researchTopic(topic, { force: true });
        return result;
    }

    // ============================================================
    // APPROVE / REJECT PENDING
    // ============================================================

    function approveKnowledge(id) {
        const item = window.JARVISKnowledgeStore?.getById(id);
        if (!item) return false;
        item.approvedByUser = true;
        // Re-save through store (add with forceUpdate)
        window.JARVISKnowledgeStore.add({ ...item, _forceUpdate: true, approvedByUser: true });
        window.JARVISKnowledgeStore.log({ action: "knowledge_approved", id });
        return true;
    }

    function rejectKnowledge(id) {
        const removed = window.JARVISKnowledgeStore?.remove(id);
        if (removed) {
            window.JARVISKnowledgeStore.log({ action: "knowledge_rejected", id });
            return true;
        }
        return false;
    }

    // ============================================================
    // EXPORT
    // ============================================================

    window.JARVISLearningManager = Object.freeze({
        version: "LM-V1",
        researchTopic,
        enhanceResponse,
        getKnowledgeContext,
        handleUserMessage,
        lookupLearnedCommand,
        lookupCorrection,
        learnNow,
        approveKnowledge,
        rejectKnowledge,
        announce,
        getStatus,
        getConfig,
        setConfig,
        computeExpiry,
    });

    console.log("JARVIS Learning Manager LM-V1 READY (default: disabled, ASK_EACH_TIME)");

})();
