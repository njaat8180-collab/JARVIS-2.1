"use strict";

/*
 * ============================================================
 * JARVIS PRO MAX — PERMISSION MANAGER
 * renderer/js/learning/permissionManager.js
 * ============================================================
 *
 * Controls when JARVIS is allowed to learn from the web.
 *
 * Permission states:
 *   DENIED         — never learn, never ask
 *   ASK_EACH_TIME  — ask user every time (DEFAULT)
 *   ALLOWED        — learn from web, but sensitive topics still ask
 *   AUTO_LEARN     — learn automatically from approved-quality sources
 *
 * User approval actions:
 *   Allow Once / Allow This Source / Allow Web Learning / Deny
 * ============================================================
 */

(function () {

    const PERM_KEY = "jarvis_learning_permission";
    const APPROVED_SOURCES_KEY = "jarvis_learning_approved_sources";

    // Permission states (ordered by restrictiveness)
    const STATES = Object.freeze({
        DENIED: "DENIED",
        ASK_EACH_TIME: "ASK_EACH_TIME",
        ALLOWED: "ALLOWED",
        AUTO_LEARN: "AUTO_LEARN",
    });

    let state = null;
    let approvedSources = null;

    // ============================================================
    // LOAD / SAVE
    // ============================================================

    function load() {
        if (state !== null) return state;
        try {
            state = localStorage.getItem(PERM_KEY) || STATES.ASK_EACH_TIME;
        } catch (_) {
            state = STATES.ASK_EACH_TIME;
        }
        if (!Object.values(STATES).includes(state)) state = STATES.ASK_EACH_TIME;
        return state;
    }

    function save() {
        try {
            localStorage.setItem(PERM_KEY, state);
        } catch (_) {}
    }

    function loadApprovedSources() {
        if (approvedSources !== null) return approvedSources;
        try {
            approvedSources = JSON.parse(localStorage.getItem(APPROVED_SOURCES_KEY) || "[]");
        } catch (_) {
            approvedSources = [];
        }
        return approvedSources;
    }

    function saveApprovedSources() {
        try {
            localStorage.setItem(APPROVED_SOURCES_KEY, JSON.stringify(approvedSources));
        } catch (_) {}
    }

    // ============================================================
    // GET / SET STATE
    // ============================================================

    function getState() {
        return load();
    }

    function setState(newState) {
        if (!Object.values(STATES).includes(newState)) {
            console.warn("[LearningPermission] Invalid state:", newState);
            return false;
        }
        state = newState;
        save();
        window.JARVISKnowledgeStore?.log({
            action: "permission_changed",
            from: load(),
            to: newState,
        });
        return true;
    }

    // ============================================================
    // SOURCE APPROVAL
    // ============================================================

    function approveSource(url) {
        const sources = loadApprovedSources();
        const domain = extractDomain(url);
        if (domain && !sources.includes(domain)) {
            sources.push(domain);
            saveApprovedSources();
        }
    }

    function isSourceApproved(url) {
        const domain = extractDomain(url);
        return loadApprovedSources().includes(domain);
    }

    function getApprovedSources() {
        return [...loadApprovedSources()];
    }

    function clearApprovedSources() {
        approvedSources = [];
        saveApprovedSources();
    }

    function extractDomain(url) {
        const match = String(url || "").match(/(?:https?:\/\/)?(?:www\.)?([\w.-]+)/);
        return match ? match[1].toLowerCase() : "";
    }

    // ============================================================
    // PERMISSION CHECK — should JARVIS learn this?
    // ============================================================

    /**
     * Determines whether learning can proceed for a given piece
     * of knowledge from a given source.
     *
     * Returns {
     *   allowed: boolean,      — can store immediately
     *   needsApproval: boolean — must ask user first
     *   reason: string
     * }
     */
    function check(options = {}) {
        const current = load();
        const { url = "", confidence = 0.5, isSensitive = false, category = "general" } = options;

        // DENIED — nothing is learned, ever
        if (current === STATES.DENIED) {
            return { allowed: false, needsApproval: false, reason: "permission_denied" };
        }

        // Sensitive info ALWAYS requires explicit approval
        if (isSensitive) {
            return { allowed: false, needsApproval: true, reason: "sensitive_requires_approval" };
        }

        // ASK_EACH_TIME — always ask (unless source pre-approved)
        if (current === STATES.ASK_EACH_TIME) {
            if (url && isSourceApproved(url)) {
                return { allowed: true, needsApproval: false, reason: "source_pre_approved" };
            }
            return { allowed: false, needsApproval: true, reason: "ask_each_time" };
        }

        // ALLOWED — learn from web, but low-confidence still asks
        if (current === STATES.ALLOWED) {
            if (url && isSourceApproved(url)) {
                return { allowed: true, needsApproval: false, reason: "source_pre_approved" };
            }
            if (confidence >= 0.80) {
                return { allowed: true, needsApproval: false, reason: "allowed_high_confidence" };
            }
            return { allowed: false, needsApproval: true, reason: "low_confidence_needs_approval" };
        }

        // AUTO_LEARN — learn automatically from good sources
        if (current === STATES.AUTO_LEARN) {
            if (confidence >= 0.75) {
                return { allowed: true, needsApproval: false, reason: "auto_learn_qualified" };
            }
            return { allowed: false, needsApproval: true, reason: "below_auto_learn_threshold" };
        }

        return { allowed: false, needsApproval: true, reason: "unknown_state" };
    }

    // ============================================================
    // USER PROMPT — "Would you like me to learn it?"
    // ============================================================

    /**
     * Ask the user for permission via the existing chat + TTS.
     * Uses a callback-based flow (renderer's chat UI is synchronous).
     *
     * Returns a Promise<boolean> — resolves true if allowed.
     */
    function requestApproval(options = {}) {
        const {
            topic = "",
            sourceTitle = "",
            preview = "",
            onAnnounce,  // callback(text) — sends to chat + TTS
        } = options;

        return new Promise((resolve) => {
            // Announce the question via existing TTS + chat
            const question = buildQuestion(topic, sourceTitle, preview);
            if (typeof onAnnounce === "function") {
                onAnnounce(question, {
                    buttons: [
                        { id: "allow_once", label: "Allow Once" },
                        { id: "allow_source", label: "Allow This Source" },
                        { id: "allow_web", label: "Allow Web Learning" },
                        { id: "deny", label: "Deny" },
                    ],
                    onAnswer: (answerId) => {
                        resolve(handleUserResponse(answerId, options));
                    },
                });
            } else {
                // No announce mechanism — default to deny (safe)
                console.warn("[LearningPermission] No announce callback — defaulting to deny");
                resolve({ allowed: false, permanent: false });
            }
        });
    }

    function buildQuestion(topic, sourceTitle, preview) {
        let q = "I found information";
        if (topic) q += ` about "${topic}"`;
        if (sourceTitle) q += ` from ${sourceTitle}`;
        q += " that could improve my knowledge. ";
        if (preview) q += `Here's a preview: "${preview.slice(0, 100)}..." `;
        q += "Would you like me to learn it?";
        return q;
    }

    function handleUserResponse(answerId, options = {}) {
        const { url = "" } = options;
        switch (answerId) {
            case "allow_once":
                return { allowed: true, permanent: false };
            case "allow_source":
                approveSource(url);
                return { allowed: true, permanent: "source" };
            case "allow_web":
                setState(STATES.ALLOWED);
                return { allowed: true, permanent: "web" };
            case "deny":
            default:
                return { allowed: false, permanent: false };
        }
    }

    // ============================================================
    // EXPORT
    // ============================================================

    window.JARVISLearningPermission = Object.freeze({
        version: "PM-V1",
        STATES,
        getState,
        setState,
        check,
        requestApproval,
        approveSource,
        isSourceApproved,
        getApprovedSources,
        clearApprovedSources,
        extractDomain,
    });

    console.log("JARVIS Learning Permission PM-V1 READY (default: ASK_EACH_TIME)");

})();
