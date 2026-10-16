"use strict";

/*
 * ============================================================
 * JARVIS PRO MAX — USER PANEL (Renderer)
 * renderer/js/users/userPanel.js
 * ============================================================
 *
 * UI logic for the USER section of the main JARVIS interface:
 *   - Current user card (click to open profile)
 *   - Add User → onboarding flow
 *   - Open/Switch User → user selector
 *   - User Settings → profile/preference editor
 *   - User Memory → view/edit/delete memories
 *   - Delete User → with strong confirmation
 *
 * All data operations go through window.jarvis.users.* (IPC).
 * TTS via existing JARVISLearningManager.announce-like path.
 * ============================================================
 */

(function () {

    const API = () => window.jarvis?.users;
    const speak = (text) => {
        try {
            if (window.VoiceEngine?.speak) window.VoiceEngine.speak(text);
            else if (window.jarvis?.voice?.speak) window.jarvis.voice.speak(text);
        } catch (_) {}
    };

    let currentUser = null;
    let currentProfile = null;
    let currentPreferences = null;
    // Re-entrancy guard for the simple-onboarding fallback's "Create Profile"
    // button (mirrors the guard in JARVISUserOnboarding.confirm()) so a
    // rapid double-click can't create two users.
    let simpleOnboardingSubmitting = false;

    // ============================================================
    // INIT
    // ============================================================

    async function init() {
        try {
            // Bind actions before awaiting profile IPC. A slow or unavailable
            // user store must not make Add User / Switch User appear dead.
            bindEvents();
            await refresh();
            // First-launch check: if no users (only guest), auto-suggest onboarding
            const users = await API()?.list();
            if (users?.success && users.users) {
                const realUsers = users.users.filter(u => !u.isGuest);
                if (realUsers.length === 0) {
                    // First launch — show onboarding hint
                    const card = document.getElementById("userPanelCurrentName");
                    if (card) {
                        card.textContent = "No User";
                        const hint = document.getElementById("userPanelCurrentStatus");
                        if (hint) hint.textContent = "Tap Add User to create your profile";
                    }
                }
            }
        } catch (error) {
            console.warn("[UserPanel] init failed (non-fatal):", error?.message || error);
        }
    }

    // ============================================================
    // REFRESH — update the USER panel with the active user
    // ============================================================

    async function refresh() {
        const api = API();
        if (!api) return;

        try {
            const result = await api.getActive();
            if (result?.success && result.userId) {
                currentUser = result.user;
                currentProfile = result.profile;
                currentPreferences = result.preferences;

                // Update UI
                const nameEl = document.getElementById("userPanelCurrentName");
                const statusEl = document.getElementById("userPanelCurrentStatus");
                const detailEl = document.getElementById("userPanelCurrentDetail");

                if (nameEl) {
                    nameEl.textContent = currentProfile?.preferredName || currentUser?.name || "Guest";
                }
                if (statusEl) {
                    const isGuest = currentUser?.isGuest;
                    statusEl.textContent = isGuest ? "Guest Session" : "Active";
                }
                if (detailEl) {
                    const lang = currentProfile?.language || "en";
                    const memory = currentPreferences !== null ? "ON" : "ON";
                    const style = currentPreferences?.responseStyle || "default";
                    detailEl.textContent = `Language: ${lang} | Style: ${style}`;
                }
            }
        } catch (error) {
            console.warn("[UserPanel] refresh failed:", error?.message);
        }
    }

    // ============================================================
    // EVENT BINDING
    // ============================================================

    function bindEvents() {
        const bind = (id, handler) => {
            const el = document.getElementById(id);
            if (el && !el._jarvisUserBound) {
                el.addEventListener("click", handler);
                el._jarvisUserBound = true;
            }
        };

        bind("userPanelCurrentCard", () => openProfile());
        bind("userPanelAddBtn", () => startOnboarding());
        // Resolve through the public hook at click time so the PIN-aware
        // selector installed by userPanelUpgrade.js is actually used.
        bind("userPanelSwitchBtn", () => window.JARVISUserPanel?.openUserSelector?.());
        bind("userPanelSettingsBtn", () => openSettings());
        bind("userPanelMemoryBtn", () => openMemory());
        bind("userPanelDeleteBtn", () => confirmDelete());
        bind("userPanelExportBtn", () => exportProfile());
        bind("userPanelImportBtn", () => importProfile());

        // Modal close buttons
        bind("userModalClose", () => closeAllModals());
        bind("userModalBackdrop", () => closeAllModals());
    }

    // ============================================================
    // PROFILE VIEW
    // ============================================================

    async function openProfile() {
        if (!currentProfile) {
            showModal("USER PROFILE", "<p>No profile loaded. Add a user first.</p>");
            return;
        }

        const p = currentProfile;
        const rows = [
            ["Name", p.name],
            ["Preferred Name", p.preferredName],
            ["Date of Birth", p.dateOfBirth],
            ["Email", p.email],
            ["Phone", p.phone],
            ["Address", p.address],
            ["Language", p.language],
            ["Secondary Language", p.secondaryLanguage],
            ["Country", p.country],
            ["Region", p.region],
            ["City", p.city],
            ["Timezone", p.timezone],
            ["Occupation", p.occupation],
            ["Education", p.education],
            ["Interests", (p.interests || []).join(", ")],
            ["Hobbies", (p.hobbies || []).join(", ")],
        ].filter(([, v]) => v);

        const html = `
            <div class="user-profile-grid">
                ${rows.map(([k, v]) => `
                    <div class="user-profile-row">
                        <span class="user-profile-label">${k}</span>
                        <span class="user-profile-value">${escapeHtml(v)}</span>
                    </div>
                `).join("")}
            </div>
            <div class="user-modal-actions">
                <button class="jarvis-btn" onclick="JARVISUserPanel.openSettings()">Edit Profile</button>
                <button class="jarvis-btn jarvis-btn-ghost" onclick="JARVISUserPanel.closeAllModals()">Close</button>
            </div>
        `;
        showModal("USER PROFILE", html);
    }

    // ============================================================
    // USER SELECTOR — switch user
    // ============================================================

    async function openUserSelector() {
        const api = API();
        if (!api) return;

        try {
            const result = await api.list();
            if (!result?.success) return;

            const users = result.users || [];
            const html = `
                <div class="user-selector-list">
                    ${users.map(u => `
                        <div class="user-selector-item ${u.isActive ? "is-active" : ""}" data-userid="${u.userId}" onclick="JARVISUserPanel.selectUser('${u.userId}')">
                            <span class="user-selector-avatar">${u.isGuest ? "👤" : "👤"}</span>
                            <span class="user-selector-info">
                                <strong>${escapeHtml(u.name)}</strong>
                                <small>${u.isActive ? "Active" : u.isGuest ? "Guest" : "Available"}</small>
                            </span>
                            ${u.isActive ? '<span class="user-selector-badge">●</span>' : ""}
                        </div>
                    `).join("")}
                </div>
                <div class="user-modal-actions">
                    <button class="jarvis-btn" onclick="JARVISUserPanel.startOnboarding()">+ Add User</button>
                </div>
            `;
            showModal("SELECT USER", html);
        } catch (error) {
            showModal("SELECT USER", `<p class="user-error">Failed to load users: ${escapeHtml(error?.message || "unknown")}</p>`);
        }
    }

    async function selectUser(userId) {
        const api = API();
        if (!api) return;

        try {
            const result = await api.switch(userId);
            if (result?.success) {
                closeAllModals();
                const name = result.user?.name || "User";
                const msg = `Welcome back, ${name}. Your profile is now active.`;
                speak(msg);
                showNotification(msg);
                await refresh();
                const usernameEl = document.getElementById("username");
                if (usernameEl) usernameEl.textContent = name;
                // Notify every renderer subsystem that the identity changed.
                window.dispatchEvent(new CustomEvent("jarvis:user-switched", {
                    detail: { userId: result.user?.userId || userId, name }
                }));
                // Do not leave the previous user's visible conversation in the
                // active session UI. Per-user memory remains on disk and is
                // reloaded by the main-process user-scoped memory engine.
                const chatMessages = document.getElementById("chatMessages");
                if (chatMessages) chatMessages.innerHTML = "";
                // Reload learning config for the new user context
                if (window.JARVISLearningManager) {
                    try { window.JARVISLearningManager.getStatus(); } catch (_) {}
                }
            } else {
                showNotification(result?.error || "Switch failed");
            }
        } catch (error) {
            showNotification("User switch failed: " + (error?.message || "unknown"));
        }
    }

    // ============================================================
    // ONBOARDING — delegate to onboarding module
    // ============================================================

    function startOnboarding() {
        if (window.JARVISUserOnboarding?.start) {
            window.JARVISUserOnboarding.start({
                onComplete: async (profile, preferences, privacy, options) => {
                    const api = API();
                    if (!api) return;
                    try {
                        const result = await api.create(profile, preferences, privacy, options);
                        if (result?.success) {
                            // Auto-switch to the new user
                            const switched = await api.switch(result.userId, options?.pin);
                            if (!switched?.success) {
                                closeAllModals();
                                showNotification(`Profile created, but could not switch: ${switched?.error || "unknown error"}`);
                                await refresh();
                                return;
                            }
                            await refresh();
                            const name = profile.preferredName || profile.name || "User";
                            document.getElementById("username")?.replaceChildren(document.createTextNode(name));
                            window.dispatchEvent(new CustomEvent("jarvis:user-switched", {
                                detail: { userId: result.userId, name }
                            }));
                            speak(`Welcome, ${name}. Your profile is now active.`);
                            closeAllModals();
                            showNotification(`✓ User profile created: ${name}`);
                            setTimeout(() => location.reload(), 250);
                        } else {
                            showNotification("Failed to create user: " + (result?.error || "unknown"));
                        }
                    } catch (error) {
                        showNotification("Create failed: " + (error?.message || "unknown"));
                    }
                },
                speak,
            });
        } else {
            // Fallback — simple form-based onboarding
            simpleOnboarding();
        }
    }

    // Simple fallback onboarding (no onboarding module)
    function simpleOnboarding() {
        simpleOnboardingSubmitting = false;
        const html = `
            <div class="user-onboarding-simple">
                <p class="user-onboarding-intro">Hello. I'm JARVIS. Before we begin, I'd like to create your personal profile.</p>
                <div class="user-form">
                    <label>What should I call you?</label>
                    <input type="text" id="simpleOnboardName" placeholder="Your name" maxlength="50">
                    <label>Preferred language</label>
                    <select id="simpleOnboardLang">
                        <option value="en">English</option>
                        <option value="hi">Hindi</option>
                        <option value="hinglish">Hinglish</option>
                        <option value="auto">Automatic</option>
                    </select>
                    <label>Would you like me to remember useful information about you?</label>
                    <select id="simpleOnboardMemory">
                        <option value="true">Enable Memory</option>
                        <option value="false">Disable Memory</option>
                    </select>
                    <label>Optional profile PIN (4–20 digits)</label>
                    <input type="password" id="simpleOnboardPin" inputmode="numeric" maxlength="20" autocomplete="new-password" placeholder="Leave blank for no PIN">
                    <input type="password" id="simpleOnboardPinConfirm" inputmode="numeric" maxlength="20" autocomplete="new-password" placeholder="Confirm PIN">
                </div>
                <div class="user-modal-actions">
                    <button id="simpleOnboardConfirmBtn" class="jarvis-btn" onclick="JARVISUserPanel.completeSimpleOnboarding()">Create Profile</button>
                    <button class="jarvis-btn jarvis-btn-ghost" onclick="JARVISUserPanel.closeAllModals()">Cancel</button>
                </div>
            </div>
        `;
        showModal("INITIALIZING USER PROFILE", html);
    }

    async function completeSimpleOnboarding() {
        // Re-entrancy guard — ignore a second click while the first
        // submission is still in flight (prevents duplicate users from a
        // rapid double-click on "Create Profile").
        if (simpleOnboardingSubmitting) return;
        simpleOnboardingSubmitting = true;

        const name = document.getElementById("simpleOnboardName")?.value?.trim();
        const lang = document.getElementById("simpleOnboardLang")?.value || "en";
        const memory = document.getElementById("simpleOnboardMemory")?.value === "true";
        const pin = document.getElementById("simpleOnboardPin")?.value || "";
        const pinConfirm = document.getElementById("simpleOnboardPinConfirm")?.value || "";

        if (!name) {
            showNotification("Please enter a name");
            simpleOnboardingSubmitting = false;
            return;
        }
        if (pin && !/^\d{4,20}$/.test(pin)) {
            showNotification("PIN must contain 4–20 digits");
            simpleOnboardingSubmitting = false;
            return;
        }
        if (pin !== pinConfirm) {
            showNotification("PIN entries do not match");
            simpleOnboardingSubmitting = false;
            return;
        }

        const api = API();
        if (!api) { simpleOnboardingSubmitting = false; return; }

        const btn = document.getElementById("simpleOnboardConfirmBtn");
        if (btn) { btn.disabled = true; btn.textContent = "Creating…"; }

        try {
            const result = await api.create(
                { name, preferredName: name, language: lang },
                {},
                { saveConversationMemory: memory },
                pin ? { pin } : {}
            );
            if (result?.success) {
                const switched = await api.switch(result.userId, pin);
                if (!switched?.success) {
                    await refresh();
                    closeAllModals();
                    showNotification(`Profile created, but could not switch: ${switched?.error || "unknown error"}`);
                    simpleOnboardingSubmitting = false;
                    return;
                }
                await refresh();
                document.getElementById("username")?.replaceChildren(document.createTextNode(name));
                window.dispatchEvent(new CustomEvent("jarvis:user-switched", {
                    detail: { userId: result.userId, name }
                }));
                closeAllModals();
                speak(`Welcome, ${name}. Your profile is now active.`);
                showNotification(`✓ User profile created: ${name}`);
            } else {
                showNotification("Failed to create user: " + (result?.error || "unknown"));
                simpleOnboardingSubmitting = false;
                if (btn) { btn.disabled = false; btn.textContent = "Create Profile"; }
            }
        } catch (error) {
            showNotification("Create failed: " + (error?.message || "unknown"));
            simpleOnboardingSubmitting = false;
            if (btn) { btn.disabled = false; btn.textContent = "Create Profile"; }
        }
    }

    // ============================================================
    // USER SETTINGS
    // ============================================================

    async function openSettings() {
        if (!currentProfile) {
            showNotification("No active user profile. Add a user first.");
            return;
        }

        const p = currentProfile;
        const prefs = currentPreferences || {};
        const privacy = await API()?.getPrivacy(currentUser.userId).then(r => r?.privacy).catch(() => ({}));

        const html = `
            <div class="user-settings">
                <div class="user-settings-section">
                    <h4>PROFILE</h4>
                    <label>Name</label>
                    <input type="text" id="userSetName" value="${escapeHtml(p.name || "")}" maxlength="50">
                    <label>Preferred Name</label>
                    <input type="text" id="userSetPreferred" value="${escapeHtml(p.preferredName || "")}" maxlength="50">
                    <label>Date of Birth</label>
                    <input type="date" id="userSetDob" value="${escapeHtml(p.dateOfBirth || "")}">
                    <label>Email</label>
                    <input type="email" id="userSetEmail" value="${escapeHtml(p.email || "")}" maxlength="160">
                    <label>Phone</label>
                    <input type="tel" id="userSetPhone" value="${escapeHtml(p.phone || "")}" maxlength="40">
                    <label>Address</label>
                    <input type="text" id="userSetAddress" value="${escapeHtml(p.address || "")}" maxlength="240">
                    <label>City</label>
                    <input type="text" id="userSetCity" value="${escapeHtml(p.city || "")}" maxlength="100">
                    <label>Language</label>
                    <select id="userSetLang">
                        ${["en", "hi", "hinglish", "auto"].map(l =>
                            `<option value="${l}" ${p.language === l ? "selected" : ""}>${l.toUpperCase()}</option>`
                        ).join("")}
                    </select>
                    <label>Occupation</label>
                    <input type="text" id="userSetOccupation" value="${escapeHtml(p.occupation || "")}" maxlength="100">
                    <label>Education</label>
                    <input type="text" id="userSetEducation" value="${escapeHtml(p.education || "")}" maxlength="100">
                    <label>Interests (comma-separated)</label>
                    <input type="text" id="userSetInterests" value="${escapeHtml((p.interests || []).join(", "))}" maxlength="200">
                </div>

                <div class="user-settings-section">
                    <h4>JARVIS BEHAVIOR</h4>
                    <label>Response Style</label>
                    <select id="userSetStyle">
                        ${["default", "professional", "friendly", "casual", "concise", "detailed", "adaptive"].map(s =>
                            `<option value="${s}" ${prefs.responseStyle === s ? "selected" : ""}>${s}</option>`
                        ).join("")}
                    </select>
                    <label>Use my name in responses</label>
                    <select id="userSetUseName">
                        <option value="true" ${prefs.useNameInResponses !== false ? "selected" : ""}>Yes</option>
                        <option value="false" ${prefs.useNameInResponses === false ? "selected" : ""}>No</option>
                    </select>
                </div>

                <div class="user-settings-section">
                    <h4>PRIVACY</h4>
                    <label class="user-toggle">
                        <input type="checkbox" id="userPrivMemory" ${privacy?.saveConversationMemory !== false ? "checked" : ""}>
                        Save conversation memory
                    </label>
                    <label class="user-toggle">
                        <input type="checkbox" id="userPrivLearning" ${privacy?.saveLearningData === true ? "checked" : ""}>
                        Save learning data
                    </label>
                    <label class="user-toggle">
                        <input type="checkbox" id="userPrivVoice" ${privacy?.saveVoiceData !== false ? "checked" : ""}>
                        Save voice data
                    </label>
                </div>
            </div>
            <div class="user-modal-actions">
                <button class="jarvis-btn" onclick="JARVISUserPanel.saveSettings()">Save Settings</button>
                <button class="jarvis-btn jarvis-btn-ghost" onclick="JARVISUserPanel.closeAllModals()">Cancel</button>
            </div>
        `;
        showModal("USER SETTINGS", html);
    }

    async function saveSettings() {
        if (!currentUser) return;
        const api = API();
        if (!api) return;

        try {
            const getVal = (id) => document.getElementById(id)?.value;
            const getChecked = (id) => document.getElementById(id)?.checked;

            const profileUpdates = {
                name: getVal("userSetName"),
                preferredName: getVal("userSetPreferred"),
                dateOfBirth: getVal("userSetDob"),
                email: getVal("userSetEmail"),
                phone: getVal("userSetPhone"),
                address: getVal("userSetAddress"),
                city: getVal("userSetCity"),
                language: getVal("userSetLang"),
                occupation: getVal("userSetOccupation"),
                education: getVal("userSetEducation"),
                interests: (getVal("userSetInterests") || "").split(",").map(s => s.trim()).filter(Boolean),
            };

            const prefUpdates = {
                responseStyle: getVal("userSetStyle"),
                useNameInResponses: getVal("userSetUseName") === "true",
            };

            const privacyUpdates = {
                saveConversationMemory: getChecked("userPrivMemory"),
                saveLearningData: getChecked("userPrivLearning"),
                saveVoiceData: getChecked("userPrivVoice"),
            };

            const [p1, p2, p3] = await Promise.all([
                api.updateProfile(currentUser.userId, profileUpdates),
                api.updatePreferences(currentUser.userId, prefUpdates),
                api.updatePrivacy(currentUser.userId, privacyUpdates),
            ]);

            if (p1?.success || p2?.success || p3?.success) {
                closeAllModals();
                showNotification("✓ Settings saved");
                await refresh();
                const activeName = currentProfile?.preferredName || currentUser?.name || "User";
                const usernameEl = document.getElementById("username");
                if (usernameEl) usernameEl.textContent = activeName;
                window.dispatchEvent(new CustomEvent("jarvis:user-profile-updated", {
                    detail: { userId: currentUser.userId, name: activeName }
                }));
            } else {
                showNotification("Save failed");
            }
        } catch (error) {
            showNotification("Save failed: " + (error?.message || "unknown"));
        }
    }

    // ============================================================
    // MEMORY VIEWER
    // ============================================================

    async function openMemory() {
        if (!currentUser) {
            showNotification("No active user");
            return;
        }
        const api = API();
        if (!api) return;

        try {
            const result = await api.memoryFacts(currentUser.userId);
            const facts = result?.facts || [];

            if (!facts.length) {
                showModal("MY MEMORY", `
                    <p class="user-empty">I don't have any stored memories yet.</p>
                    <p class="user-empty-hint">You can tell me things like "Remember that I prefer Hinglish" and I'll store them here.</p>
                `);
                return;
            }

            const html = `
                <div class="user-memory-list">
                    ${facts.map((fact, idx) => `
                        <div class="user-memory-item">
                            <span class="user-memory-text">${escapeHtml(fact.fact || fact.value || String(fact))}</span>
                            <span class="user-memory-actions">
                                <button class="user-icon-btn" title="Delete" onclick="JARVISUserPanel.deleteMemory('${escapeHtml(fact.key || fact.id || idx)}')">✕</button>
                            </span>
                        </div>
                    `).join("")}
                </div>
                <div class="user-modal-actions">
                    <button class="jarvis-btn jarvis-btn-danger" onclick="JARVISUserPanel.clearAllMemory()">Clear All Memory</button>
                    <button class="jarvis-btn jarvis-btn-ghost" onclick="JARVISUserPanel.closeAllModals()">Close</button>
                </div>
            `;
            showModal("MY MEMORY", html);
        } catch (error) {
            showModal("MY MEMORY", `<p class="user-error">Memory load failed: ${escapeHtml(error?.message || "unknown")}</p>`);
        }
    }

    async function deleteMemory(key) {
        if (!currentUser || !key) return;
        const api = API();
        if (!api) return;
        try {
            const result = await api.memoryForget(currentUser.userId, key);
            if (result?.success) {
                showNotification("Memory deleted");
                openMemory(); // refresh
            }
        } catch (_) {}
    }

    async function clearAllMemory() {
        if (!currentUser) return;
        if (!confirm("This will permanently delete ALL your stored memories. Continue?")) return;
        const api = API();
        if (!api) return;
        try {
            const result = await api.memoryForgetAll(currentUser.userId, true);
            if (result?.success) {
                closeAllModals();
                showNotification(`✓ Cleared ${result.count || 0} memories`);
            }
        } catch (_) {}
    }

    // ============================================================
    // DELETE USER
    // ============================================================

    async function confirmDelete() {
        if (!currentUser) {
            showNotification("No active user");
            return;
        }
        if (currentUser.isGuest) {
            showNotification("Cannot delete the guest user");
            return;
        }

        const name = currentProfile?.name || currentUser?.name || "this user";
        const html = `
            <div class="user-delete-confirm">
                <p class="user-delete-warning">⚠ This will permanently delete this user's profile, personal memory, preferences and associated local data.</p>
                <p><strong>${escapeHtml(name)}</strong> — all data will be removed. This cannot be undone.</p>
            </div>
            <div class="user-modal-actions">
                <button class="jarvis-btn jarvis-btn-danger" onclick="JARVISUserPanel.executeDelete()">Delete Permanently</button>
                <button class="jarvis-btn jarvis-btn-ghost" onclick="JARVISUserPanel.closeAllModals()">Cancel</button>
            </div>
        `;
        showModal("DELETE USER", html);
    }

    async function executeDelete() {
        if (!currentUser) return;
        const api = API();
        if (!api) return;
        try {
            const result = await api.delete(currentUser.userId, true);
            if (result?.success) {
                closeAllModals();
                showNotification("User deleted. Switched to Guest.");
                speak("User deleted.");
                currentUser = null;
                currentProfile = null;
                await refresh();
            } else {
                showNotification(result?.error || "Delete failed");
            }
        } catch (error) {
            showNotification("Delete failed: " + (error?.message || "unknown"));
        }
    }

    // ============================================================
    // EXPORT / IMPORT
    // ============================================================

    async function exportProfile() {
        if (!currentUser) {
            showNotification("No active user");
            return;
        }
        const api = API();
        if (!api) return;
        try {
            const result = await api.export(currentUser.userId);
            if (result?.success && result.export) {
                const name = currentProfile?.name || "User";
                const blob = new Blob([JSON.stringify(result.export, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `JARVIS_User_Profile_${name.replace(/\s+/g, "_")}.json`;
                a.click();
                URL.revokeObjectURL(url);
                showNotification("✓ Profile exported");
            }
        } catch (error) {
            showNotification("Export failed: " + (error?.message || "unknown"));
        }
    }

    async function importProfile() {
        // Create hidden file input
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                if (!data?.user?.profile) {
                    showNotification("Invalid profile file format");
                    return;
                }
                // Confirm
                if (!confirm(`Import user "${data.user.profile.name || "Unknown"}"? This will create a new user profile.`)) {
                    return;
                }
                const api = API();
                const result = await api.import(data);
                if (result?.success) {
                    showNotification(`✓ User imported: ${data.user.profile.name}`);
                    await refresh();
                } else {
                    showNotification(result?.error || "Import failed");
                }
            } catch (error) {
                showNotification("Import failed: " + (error?.message || "invalid file"));
            }
        };
        input.click();
    }

    // ============================================================
    // MODAL SYSTEM — reuse existing JARVIS design
    // ============================================================

    function showModal(title, contentHtml) {
        let modal = document.getElementById("userModalRoot");
        if (!modal) {
            modal = document.createElement("div");
            modal.id = "userModalRoot";
            modal.className = "user-modal-root";
            modal.innerHTML = `
                <div class="user-modal-backdrop" id="userModalBackdrop"></div>
                <div class="user-modal">
                    <div class="user-modal-header">
                        <span class="user-modal-kicker">JARVIS PRO MAX / USER SYSTEM</span>
                        <h3 id="userModalTitle"></h3>
                        <button class="user-modal-close" id="userModalClose">✕</button>
                    </div>
                    <div class="user-modal-body" id="userModalBody"></div>
                </div>
            `;
            document.body.appendChild(modal);
            // Bind close events
            modal.querySelector("#userModalClose").addEventListener("click", closeAllModals);
            modal.querySelector("#userModalBackdrop").addEventListener("click", closeAllModals);
        }

        const titleEl = modal.querySelector("#userModalTitle");
        const bodyEl = modal.querySelector("#userModalBody");
        if (titleEl) titleEl.textContent = title;
        if (bodyEl) bodyEl.innerHTML = contentHtml;

        modal.classList.add("is-open");
        document.body.classList.add("user-modal-open");
    }

    function closeAllModals() {
        const modal = document.getElementById("userModalRoot");
        if (modal) modal.classList.remove("is-open");
        document.body.classList.remove("user-modal-open");
        if (window.JARVISUserOnboarding?.cancel) {
            window.JARVISUserOnboarding.cancel();
        }
    }

    // ============================================================
    // NOTIFICATIONS — reuse existing system or fall back
    // ============================================================

    function showNotification(text) {
        try {
            if (window.JARVISNotifications?.show) {
                window.JARVISNotifications.show(text);
                return;
            }
            // Fallback: use status pill
            const el = document.getElementById("footerStatus");
            if (el) {
                const orig = el.textContent;
                el.textContent = text;
                setTimeout(() => { el.textContent = orig; }, 4000);
            }
        } catch (_) {}
    }

    function escapeHtml(value) {
        const map = { 38: "AMP", 60: "LT", 62: "GT", 34: "QUOT" };
        return String(value || "").replace(/[&<>"]/g, (ch) => {
            if (ch === String.fromCharCode(38)) return String.fromCharCode(38) + "amp;";
            if (ch === String.fromCharCode(60)) return String.fromCharCode(38) + "lt;";
            if (ch === String.fromCharCode(62)) return String.fromCharCode(38) + "gt;";
            return String.fromCharCode(38) + "quot;";
        });
    }

    // ============================================================
    // PUBLIC API
    // ============================================================

    // NOTE: deliberately NOT Object.freeze'd. userPanelUpgrade.js patches
    // refresh()/openUserSelector() on this object at runtime (strict-mode
    // assignment to a frozen object throws, which silently killed the whole
    // upgrade module — PIN manager, quick-switch and keyboard shortcuts
    // never installed). The public surface below stays stable.
    window.JARVISUserPanel = {
        version: "UP-V1",
        init,
        refresh,
        showModal,
        openProfile,
        openUserSelector,
        selectUser,
        startOnboarding,
        openSettings,
        saveSettings,
        openMemory,
        deleteMemory,
        clearAllMemory,
        confirmDelete,
        executeDelete,
        exportProfile,
        importProfile,
        completeSimpleOnboarding,
        closeAllModals,
    };

    // Auto-init on DOM ready
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }

    console.log("JARVIS User Panel UP-V1 READY");

})();
