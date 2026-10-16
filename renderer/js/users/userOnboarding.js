"use strict";

/*
 * ============================================================
 * JARVIS PRO MAX — USER ONBOARDING (Renderer)
 * renderer/js/users/userOnboarding.js
 * ============================================================
 *
 * Conversational user onboarding — JARVIS asks questions,
 * user answers via VOICE (STT) or TEXT input. Each optional
 * question has a Skip button.
 *
 * Flow:
 *   1. Welcome ("Hello. I'm JARVIS...")
 *   2. Name ("What should I call you?")
 *   3. DOB (optional)
 *   4. Language preference (English/Hindi/Hinglish/Auto)
 *   5. Interests (multi-select)
 *   6. JARVIS personality (multi-select)
 *   7. Memory consent (Enable/Disable)
 *   8. Confirm & Create
 *
 * Uses existing TTS (speak callback) and optionally the
 * existing STT (VoiceEngine.startListening).
 * ============================================================
 */

(function () {

    // ============================================================
    // QUESTION DEFINITIONS
    // ============================================================

    const PROFILE_FIELDS = [
        {
            id: "preferredName", label: "What should I call you?", type: "text", required: true, placeholder: "Your name", maxLength: 100,
        },
        {
            id: "name", label: "Full name (optional)", type: "text", required: false, placeholder: "Full name", maxLength: 100,
        },
        {
            id: "dateOfBirth", label: "Date of birth", type: "date", required: false,
        },
        {
            id: "email", label: "Email address", type: "email", required: false, placeholder: "name@example.com", maxLength: 160,
        },
        {
            id: "phone", label: "Phone number", type: "tel", required: false, placeholder: "Phone number", maxLength: 40,
        },
        {
            id: "address", label: "Address", type: "text", required: false, placeholder: "Street / locality", maxLength: 240,
        },
        {
            id: "city", label: "City", type: "text", required: false, placeholder: "City", maxLength: 100,
        },
        {
            id: "occupation", label: "Occupation", type: "text", required: false, placeholder: "Occupation", maxLength: 100,
        },
        {
            id: "education", label: "Education", type: "text", required: false, placeholder: "Education", maxLength: 100,
        },
    ];

    const QUESTIONS = [
        {
            id: "profile",
            question: "Tell me a little about yourself",
            hint: "Your profile stays on this device. Only the name you want JARVIS to use is required.",
            type: "profile",
            required: true,
        },
        {
            id: "language",
            question: "How would you like me to communicate with you?",
            hint: "You can change this anytime in User Settings.",
            type: "choice",
            required: false,
            field: "language",
            options: [
                { value: "en", label: "English" },
                { value: "hi", label: "Hindi" },
                { value: "hinglish", label: "Hinglish" },
                { value: "auto", label: "Automatic" },
            ],
            default: "auto",
        },
        {
            id: "interests",
            question: "What are your interests?",
            hint: "Select all that apply — this helps me give better answers.",
            type: "multi",
            required: false,
            field: "interests",
            options: [
                "AI", "Technology", "Programming", "Space",
                "Gaming", "Business", "Science", "Music",
                "Movies", "Sports", "Reading", "Other",
            ],
        },
        {
            id: "personality",
            question: "How would you like JARVIS to behave with you?",
            hint: "Pick one or more styles.",
            type: "multi",
            required: false,
            field: "personality",
            options: [
                "Professional", "Friendly", "Casual", "Technical",
                "Concise", "Detailed", "Adaptive",
            ],
        },
        {
            id: "memory",
            question: "Would you like me to remember useful information about you between conversations?",
            hint: "Memory means I'll store facts like your name, preferences, and things you tell me to remember — locally on your computer only.",
            type: "choice",
            required: true,
            field: "memoryConsent",
            options: [
                { value: "true", label: "Enable Memory" },
                { value: "false", label: "Disable Memory" },
            ],
            default: "true",
        },
        {
            id: "pin",
            question: "Would you like to protect this profile with a PIN?",
            hint: "Optional. Choose 4–20 digits. You will need it when switching to this profile.",
            type: "pin",
            required: false,
            field: "pin",
        },
    ];

    // ============================================================
    // STATE
    // ============================================================

    let active = false;
    let currentStep = 0;
    let answers = {};
    let callbacks = {};
    let listening = false;
    // Re-entrancy guard: confirm() is wired to a plain onclick, so two fast
    // clicks (or a click + Enter keypress) can both fire before the modal
    // closes. Without this, each call reaches userPanel's onComplete
    // handler and creates a duplicate user. See also completeSimpleOnboarding()
    // in userPanel.js, which has the same guard for its own "Create Profile"
    // button.
    let submitting = false;

    // ============================================================
    // START / CANCEL
    // ============================================================

    function start(opts = {}) {
        callbacks = {
            onComplete: opts.onComplete || (() => {}),
            speak: opts.speak || (() => {}),
        };
        active = true;
        submitting = false;
        currentStep = 0;
        answers = {};
        renderWelcome();
    }

    function cancel() {
        active = false;
        submitting = false;
        listening = false;
        try { stopListening(); } catch (_) {}
    }

    // ============================================================
    // STT — voice input using existing VoiceEngine
    // ============================================================

    function startListening() {
        try {
            if (window.VoiceEngine?.startListening) {
                listening = true;
                updateVoiceState("LISTENING");
                // Set up one-shot transcript capture
                if (window.VoiceEngine.onTranscript) {
                    // will be handled by global handler
                }
                window.VoiceEngine.startListening();
            }
        } catch (_) {
            updateVoiceState("STT UNAVAILABLE");
        }
    }

    function stopListening() {
        try {
            if (listening && window.VoiceEngine?.stopListening) {
                window.VoiceEngine.stopListening();
            }
        } catch (_) {}
        listening = false;
    }

    function updateVoiceState(state) {
        const el = document.getElementById("onboardVoiceState");
        if (el) {
            el.textContent = state;
            el.className = "onboard-voice-state " + state.toLowerCase().replace(/\s+/g, "-");
        }
    }

    // ============================================================
    // RENDER — welcome screen
    // ============================================================

    function renderWelcome() {
        const html = `
            <div class="onboard-welcome">
                <div class="onboard-avatar">🤖</div>
                <div class="onboard-speech">
                    <p>Hello. I'm <strong>JARVIS</strong>.</p>
                    <p>Before we begin, I'd like to create your personal profile.</p>
                    <p class="onboard-sub">This takes about a minute. All optional questions can be skipped.</p>
                </div>
                <div class="user-modal-actions">
                    <button type="button" class="jarvis-btn jarvis-btn-primary" data-onboard-action="next">[ START SETUP ]</button>
                    <button type="button" class="jarvis-btn jarvis-btn-ghost" data-onboard-action="cancel">Not now</button>
                </div>
            </div>
        `;
        setModalContent("INITIALIZING USER PROFILE...", html);
        callbacks.speak?.("Hello. I'm JARVIS. Before we begin, I'd like to create your personal profile. Press start setup to begin.");
    }

    // ============================================================
    // RENDER — question step
    // ============================================================

    function renderQuestion() {
        if (currentStep >= QUESTIONS.length) {
            renderConfirm();
            return;
        }

        const q = QUESTIONS[currentStep];
        let inputHtml = "";

        if (q.type === "profile") {
            inputHtml = `
                <div class="onboard-profile-form">
                    ${PROFILE_FIELDS.map(field => `
                        <label class="onboard-profile-field">
                            <span>${escapeHtml(field.label)}${field.required ? " *" : ""}</span>
                            <input type="${field.type}" id="onboard-${field.id}" class="onboard-input"
                                ${field.required ? "required" : ""} ${field.maxLength ? `maxlength="${field.maxLength}"` : ""}
                                placeholder="${escapeHtml(field.placeholder || "")}" value="${escapeHtml(answers[field.id] || "")}">
                        </label>
                    `).join("")}
                </div>
            `;
        } else if (q.type === "text" || q.type === "date") {
            inputHtml = `
                <input type="${q.type}" id="onboardAnswer" class="onboard-input"
                    placeholder="${escapeHtml(q.placeholder || "")}" value="${escapeHtml(answers[q.field] || "")}"
                    data-onboard-enter="true">
                <div class="onboard-voice-row">
                    <button type="button" class="jarvis-btn jarvis-btn-sm" data-onboard-action="voice" id="onboardVoiceBtn">🎙 Voice Answer</button>
                    <span id="onboardVoiceState" class="onboard-voice-state"></span>
                </div>
            `;
        } else if (q.type === "pin") {
            inputHtml = `
                <input type="password" id="onboardPin" class="onboard-input" inputmode="numeric" autocomplete="new-password" maxlength="20" placeholder="Optional PIN">
                <input type="password" id="onboardPinConfirm" class="onboard-input" inputmode="numeric" autocomplete="new-password" maxlength="20" placeholder="Confirm PIN">
            `;
        } else if (q.type === "choice") {
            inputHtml = `
                <div class="onboard-choices">
                    ${q.options.map(opt => `
                        <button type="button" class="onboard-choice ${answers[q.field] === opt.value ? "is-selected" : ""}"
                            data-onboard-action="choice" data-onboard-value="${escapeHtml(opt.value)}">
                            ${opt.label}
                        </button>
                    `).join("")}
                </div>
            `;
        } else if (q.type === "multi") {
            const selected = answers[q.field] || [];
            inputHtml = `
                <div class="onboard-multi">
                    ${q.options.map(opt => `
                        <button type="button" class="onboard-chip ${selected.includes(opt) ? "is-selected" : ""}"
                            data-onboard-action="multi" data-onboard-value="${escapeHtml(opt)}">
                            ${opt}
                        </button>
                    `).join("")}
                </div>
            `;
        }

        const html = `
            <div class="onboard-question">
                <div class="onboard-progress">
                    <span class="onboard-step">${currentStep + 1} / ${QUESTIONS.length}</span>
                    <div class="onboard-progress-bar"><span style="width: ${((currentStep / QUESTIONS.length) * 100)}%"></span></div>
                </div>
                <h4 class="onboard-q">${escapeHtml(q.question)}</h4>
                <p class="onboard-hint">${escapeHtml(q.hint || "")}</p>
                ${inputHtml}
                <div class="user-modal-actions">
                    <button type="button" class="jarvis-btn jarvis-btn-primary" data-onboard-action="submit">
                        ${q.type === "multi" || q.type === "profile" ? "Continue" : "Answer"}
                    </button>
                    ${!q.required ? '<button type="button" class="jarvis-btn jarvis-btn-ghost" data-onboard-action="skip">Skip</button>' : ""}
                    ${currentStep > 0 ? '<button type="button" class="jarvis-btn jarvis-btn-ghost" data-onboard-action="back">Back</button>' : ""}
                </div>
            </div>
        `;
        setModalContent("USER PROFILE SETUP", html);
        callbacks.speak?.(q.question);

        // Focus the first field on the multi-field profile form.
        setTimeout(() => {
            const input = document.getElementById(q.type === "profile" ? "onboard-preferredName" : "onboardAnswer");
            if (input) input.focus();
        }, 100);
    }

    // ============================================================
    // RENDER — confirmation
    // ============================================================

    function renderConfirm() {
        const name = answers.preferredName || answers.name || "User";
        const lang = answers.language || "auto";
        const memory = answers.memoryConsent !== "false";
        const interests = answers.interests || [];
        const personality = answers.personality || [];

        const html = `
            <div class="onboard-confirm">
                <div class="onboard-checkmark">✓</div>
                <h4>Ready to create your profile?</h4>
                <div class="onboard-summary">
                    <div class="onboard-summary-row"><span>Name</span><strong>${escapeHtml(answers.preferredName || name)}</strong></div>
                    ${answers.name ? `<div class="onboard-summary-row"><span>Full name</span><strong>${escapeHtml(answers.name)}</strong></div>` : ""}
                    ${answers.dateOfBirth ? `<div class="onboard-summary-row"><span>DOB</span><strong>${escapeHtml(answers.dateOfBirth)}</strong></div>` : ""}
                    <div class="onboard-summary-row"><span>Language</span><strong>${lang.toUpperCase()}</strong></div>
                    ${interests.length ? `<div class="onboard-summary-row"><span>Interests</span><strong>${escapeHtml(interests.join(", "))}</strong></div>` : ""}
                    ${personality.length ? `<div class="onboard-summary-row"><span>JARVIS Style</span><strong>${escapeHtml(personality.join(", "))}</strong></div>` : ""}
                    <div class="onboard-summary-row"><span>Memory</span><strong>${memory ? "Enabled" : "Disabled"}</strong></div>
                </div>
                <div class="user-modal-actions">
                    <button type="button" id="onboardConfirmBtn" class="jarvis-btn jarvis-btn-primary" data-onboard-action="confirm">Create Profile</button>
                    <button type="button" class="jarvis-btn jarvis-btn-ghost" data-onboard-action="back">Back</button>
                </div>
            </div>
        `;
        setModalContent("CONFIRM PROFILE", html);
        callbacks.speak?.(`Ready to create your profile, ${name}? Press create profile to finish.`);
    }

    // ============================================================
    // ANSWER HANDLING
    // ============================================================

    function submitAnswer() {
        const q = QUESTIONS[currentStep];
        if (!q) return;

        if (q.type === "profile") {
            for (const field of PROFILE_FIELDS) {
                const input = document.getElementById(`onboard-${field.id}`);
                const value = input?.value?.trim() || "";
                if (field.required && !value) {
                    input?.focus();
                    showFieldError(`${field.label} is required`, input);
                    return;
                }
                if (field.id === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                    input?.focus();
                    showFieldError("Enter a valid email address", input);
                    return;
                }
                answers[field.id] = value;
            }
        } else if (q.type === "text" || q.type === "date") {
            const input = document.getElementById("onboardAnswer");
            const value = input?.value?.trim();
            if (!value && q.required) {
                showFieldError("This field is required");
                return;
            }
            if (value) {
                answers[q.field] = value;
                // Acknowledge
                if (q.field === "preferredName") {
                    callbacks.speak?.(`Understood. I'll call you ${value}.`);
                }
            }
        } else if (q.type === "choice") {
            if (!answers[q.field] && q.required) {
                showFieldError("Please select an option");
                return;
            }
        } else if (q.type === "pin") {
            const pin = document.getElementById("onboardPin")?.value || "";
            const confirm = document.getElementById("onboardPinConfirm")?.value || "";
            if (pin && !/^\d{4,20}$/.test(pin)) { showFieldError("PIN must contain 4–20 digits"); return; }
            if (pin !== confirm) { showFieldError("PIN entries do not match"); return; }
            if (pin) answers.pin = pin;
        }
        // multi type: answers already stored via toggleMulti

        next();
    }

    function selectChoice(value) {
        const q = QUESTIONS[currentStep];
        if (!q) return;
        answers[q.field] = value;
        // Auto-advance for single-choice
        renderQuestion(); // re-render to show selection
        setTimeout(() => next(), 300);
    }

    function toggleMulti(option) {
        const q = QUESTIONS[currentStep];
        if (!q) return;
        if (!answers[q.field]) answers[q.field] = [];
        const idx = answers[q.field].indexOf(option);
        if (idx >= 0) answers[q.field].splice(idx, 1);
        else answers[q.field].push(option);
        renderQuestion(); // re-render to show selection state
    }

    function skip() {
        const q = QUESTIONS[currentStep];
        if (q && !q.required) {
            if (q.default !== undefined) answers[q.field] = q.default;
            next();
        }
    }

    function back() {
        if (currentStep > 0) {
            currentStep--;
            renderQuestion();
        }
    }

    function next() {
        currentStep++;
        if (currentStep >= QUESTIONS.length) {
            renderConfirm();
        } else {
            renderQuestion();
        }
    }

    // ============================================================
    // VOICE TOGGLE
    // ============================================================

    function toggleVoice() {
        if (listening) {
            stopListening();
            updateVoiceState("IDLE");
        } else {
            startListening();
        }
    }

    // ============================================================
    // CONFIRM — build the final profile
    // ============================================================

    function confirm() {
        // Re-entrancy guard — see the `submitting` declaration above.
        // A second click/keypress while the first submission is still in
        // flight is silently ignored instead of creating a duplicate user.
        if (submitting) return;
        submitting = true;
        try {
            const btn = document.getElementById("onboardConfirmBtn");
            if (btn) { btn.disabled = true; btn.textContent = "Creating…"; }
        } catch (_) {}
        // Safety net: userPanel's onComplete handler reports failure via a
        // notification, not an exception, so confirm() can't always tell
        // success from failure. If nothing has torn this modal down within
        // a few seconds (i.e. creation failed), unlock the button again
        // instead of leaving it stuck on "Creating…" forever.
        setTimeout(() => {
            submitting = false;
            try {
                const btn = document.getElementById("onboardConfirmBtn");
                if (btn) { btn.disabled = false; btn.textContent = "Create Profile"; }
            } catch (_) {}
        }, 8000);

        const name = answers.name || answers.preferredName || "User";
        const memory = answers.memoryConsent !== "false";

        const profile = {
            name,
            preferredName: answers.preferredName || name,
            dateOfBirth: answers.dateOfBirth || "",
            email: answers.email || "",
            phone: answers.phone || "",
            address: answers.address || "",
            city: answers.city || "",
            occupation: answers.occupation || "",
            education: answers.education || "",
            language: answers.language || "auto",
            interests: answers.interests || [],
        };

        const preferences = {
            personality: answers.personality || [],
            responseStyle: (answers.personality || []).includes("Concise") ? "concise"
                : (answers.personality || []).includes("Detailed") ? "detailed"
                : (answers.personality || []).includes("Professional") ? "professional"
                : (answers.personality || []).includes("Friendly") ? "friendly"
                : "default",
            useNameInResponses: true,
        };

        const privacy = {
            saveConversationMemory: memory,
            saveLearningData: false,
        };
        const options = answers.pin ? { pin: answers.pin } : {};

        active = false;
        callbacks.onComplete?.(profile, preferences, privacy, options);
    }

    // ============================================================
    // HELPERS
    // ============================================================

    function setModalContent(title, html) {
        // Reuse the user panel modal
        if (window.JARVISUserPanel) {
            const modal = document.getElementById("userModalRoot");
            if (modal) {
                const titleEl = modal.querySelector("#userModalTitle");
                const bodyEl = modal.querySelector("#userModalBody");
                if (titleEl) titleEl.textContent = title;
                if (bodyEl) bodyEl.innerHTML = html;
                modal.classList.add("is-open");
                return;
            }
            // FIX: on the very FIRST "Add User" click the modal root does
            // not exist yet (userPanel.showModal() creates it lazily), so
            // the onboarding UI silently never appeared — the button looked
            // dead. Delegate to the panel's showModal() which creates
            // the root on demand, then fill it.
            if (typeof window.JARVISUserPanel.showModal === "function") {
                window.JARVISUserPanel.showModal(title, html);
                return;
            }
        }
        console.warn("[Onboarding] Modal not available");
    }

    function showFieldError(message, target = null) {
        const existing = document.getElementById("onboardError");
        if (existing) existing.remove();
        const input = target || document.getElementById("onboardAnswer");
        if (input) {
            const err = document.createElement("div");
            err.id = "onboardError";
            err.className = "onboard-error";
            err.textContent = message;
            input.parentNode.insertBefore(err, input.nextSibling);
        }
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/[&<>]/g, (ch) => {
                if (ch === String.fromCharCode(38)) return String.fromCharCode(38) + "amp;";
                if (ch === String.fromCharCode(60)) return String.fromCharCode(38) + "lt;";
                return String.fromCharCode(38) + "gt;";
            });
    }

    // Use delegated listeners instead of inline onclick/onkeydown attributes.
    // The app's renderer security policy may disable inline handlers, which
    // left both the welcome buttons and subsequent onboarding steps inert.
    document.addEventListener("click", (event) => {
        const button = event.target?.closest?.("[data-onboard-action]");
        if (!button || !active) return;
        event.preventDefault();
        event.stopPropagation();
        switch (button.dataset.onboardAction) {
            case "next": next(); break;
            case "cancel": window.JARVISUserPanel?.closeAllModals?.(); break;
            case "voice": toggleVoice(); break;
            case "choice": selectChoice(button.dataset.onboardValue); break;
            case "multi": toggleMulti(button.dataset.onboardValue); break;
            case "submit": submitAnswer(); break;
            case "skip": skip(); break;
            case "back": back(); break;
            case "confirm": confirm(); break;
        }
    }, true);

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || !active || !event.target?.matches?.("[data-onboard-enter]")) return;
        event.preventDefault();
        submitAnswer();
    }, true);

    // ============================================================
    // EXPORT
    // ============================================================

    window.JARVISUserOnboarding = Object.freeze({
        version: "UO-V1",
        start,
        cancel,
        next,
        back,
        skip,
        submitAnswer,
        selectChoice,
        toggleMulti,
        toggleVoice,
        confirm,
    });

    console.log("JARVIS User Onboarding UO-V1 READY");

})();
