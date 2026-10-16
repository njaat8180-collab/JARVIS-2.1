"use strict";

/*
 * ============================================================
 * JARVIS PRO MAX — USER PANEL UPGRADE (Renderer)
 * renderer/js/users/userPanelUpgrade.js
 * ============================================================
 *
 * Extends the existing UserPanel with:
 *   - Avatar display (initials + color circles)
 *   - Role badges (admin/member/guest)
 *   - Activity stats (login count, messages, voice commands)
 *   - Storage usage per user
 *   - PIN lock indicator + PIN management modal
 *   - Quick-switch dropdown (Ctrl+Shift+U)
 *   - Merge users dialog
 *   - Session lock/unlock indicator
 *
 * Loaded after userPanel.js — augments JARVISUserPanel.
 * ============================================================
 */

(function () {
    const API = () => window.jarvis?.users;
    const $ = (id) => document.getElementById(id);
    const speak = (text) => {
        try {
            if (window.VoiceEngine?.speak) window.VoiceEngine.speak(text);
        } catch (_) {}
    };

    let userList = [];
    let pinModalOpen = false;

    // ============================================================
    // AVATAR RENDERING
    // ============================================================

    function createAvatar(user, size) {
        const s = size || 40;
        const initials = user.avatarInitials || (user.name || "?").slice(0, 2).toUpperCase();
        const color = user.avatarColor || "#00E5FF";
        const div = document.createElement("div");
        div.className = "user-avatar";
        div.style.cssText = `width:${s}px;height:${s}px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:${Math.round(s * 0.4)}px;text-transform:uppercase;flex-shrink:0;`;
        div.textContent = initials;
        if (user.hasPin) {
            const lock = document.createElement("span");
            lock.className = "user-pin-badge";
            lock.textContent = "🔒";
            lock.style.cssText = "position:absolute;bottom:-2px;right:-2px;font-size:10px;";
            div.style.position = "relative";
            div.appendChild(lock);
        }
        return div;
    }

    function roleBadge(role) {
        const labels = { admin: "ADMIN", member: "MEMBER", guest: "GUEST" };
        const colors = { admin: "#FF6B35", member: "#00E5FF", guest: "#888" };
        const span = document.createElement("span");
        span.className = "user-role-badge user-role-" + (role || "member");
        span.textContent = labels[role || "member"] || "MEMBER";
        span.style.cssText = `font-size:0.6rem;padding:2px 6px;border-radius:4px;background:${colors[role || "member"]}20;color:${colors[role || "member"]};border:1px solid ${colors[role || "member"]}40;font-family:"Orbitron",sans-serif;letter-spacing:0.05em;`;
        return span;
    }

    // ============================================================
    // ENHANCED REFRESH — patch avatar into existing card
    // ============================================================

    function enhanceCurrentCard() {
        const card = $("userPanelCurrentCard");
        if (!card) return;

        // Find the existing name/status elements
        const nameEl = $("userPanelCurrentName");
        const statusEl = $("userPanelCurrentStatus");
        const detailEl = $("userPanelCurrentDetail");
        const badgeEl = $("userPanelCurrentBadge");

        if (!nameEl) return;

        // Get user data from existing panel or fetch fresh
        API()?.getActive().then((res) => {
            if (!res?.success || !res.user) return;
            const user = res.user;
            const profile = res.profile || {};

            // Replace badge with avatar
            if (badgeEl) {
                badgeEl.innerHTML = "";
                const avatar = createAvatar({
                    avatarInitials: profile.avatarInitials || (user.name || "?").slice(0, 2).toUpperCase(),
                    avatarColor: profile.avatarColor,
                    hasPin: user.hasPin,
                }, 36);
                badgeEl.appendChild(avatar);
                badgeEl.style.background = "transparent";
            }

            // Add role badge next to name
            if (nameEl && !nameEl.querySelector(".user-role-badge")) {
                nameEl.style.display = "flex";
                nameEl.style.alignItems = "center";
                nameEl.style.gap = "8px";
                nameEl.appendChild(roleBadge(user.role || (user.isGuest ? "guest" : "member")));
            }

            // Show activity in detail
            if (detailEl) {
                API()?.getActivity(user.userId).then((actRes) => {
                    if (actRes?.success && actRes.activity) {
                        const a = actRes.activity;
                        const parts = [];
                        if (a.loginCount) parts.push(`Logins: ${a.loginCount}`);
                        if (a.messageCount) parts.push(`Messages: ${a.messageCount}`);
                        if (a.voiceCommandCount) parts.push(`Voice: ${a.voiceCommandCount}`);
                        detailEl.textContent = parts.join(" · ") || "New user";
                    }
                }).catch(() => {});
                API()?.getStorage(user.userId).then((stoRes) => {
                    if (stoRes?.success && stoRes.formatted) {
                        detailEl.textContent = (detailEl.textContent || "") + " · " + stoRes.formatted;
                    }
                }).catch(() => {});
            }
        }).catch(() => {});
    }

    // ============================================================
    // ENHANCED USER SELECTOR — with avatars + roles + PIN
    // ============================================================

    function openEnhancedUserSelector() {
        closeAllModals();
        Promise.all([API()?.list(), API()?.getActive()]).then(([res, activeRes]) => {
            if (!res?.success || !res.users) return;
            userList = res.users;
            const activeUser = activeRes?.user || null;
            const canRemoveOthers = activeUser?.role === "admin";

            const modal = createModal("jarvis-user-selector", "Switch User");

            const list = document.createElement("div");
            list.className = "user-selector-list";

            res.users.forEach((user) => {
                const item = document.createElement("div");
                item.className = "user-selector-item";
                if (user.isActive) item.classList.add("user-selector-active");
                item.style.cssText = "display:flex;align-items:center;gap:12px;padding:10px 14px;cursor:pointer;border-radius:8px;transition:background 0.2s;" + (user.isActive ? "background:rgba(0,229,255,0.08);" : "");

                const avatar = createAvatar(user, 36);
                item.appendChild(avatar);

                const info = document.createElement("div");
                info.style.cssText = "flex:1;";

                const nameLine = document.createElement("div");
                nameLine.style.cssText = "display:flex;align-items:center;gap:8px;";
                const name = document.createElement("strong");
                name.textContent = user.name;
                name.style.color = "rgba(220,235,245,0.95)";
                nameLine.appendChild(name);
                nameLine.appendChild(roleBadge(user.role));
                info.appendChild(nameLine);

                const sub = document.createElement("small");
                sub.style.cssText = "color:rgba(140,160,180,0.5);font-size:0.72rem;";
                const parts = [];
                if (user.lastActiveAt) parts.push("Last: " + new Date(user.lastActiveAt).toLocaleDateString());
                if (user.storageFormatted) parts.push(user.storageFormatted);
                sub.textContent = parts.join(" · ") || "";
                info.appendChild(sub);
                item.appendChild(info);

                if (user.hasPin) {
                    const lock = document.createElement("span");
                    lock.textContent = "🔒";
                    lock.style.fontSize = "0.8rem";
                    item.appendChild(lock);
                }

                if (!user.isGuest && (user.isActive || canRemoveOthers)) {
                    const removeBtn = document.createElement("button");
                    removeBtn.type = "button";
                    removeBtn.className = "jarvis-btn jarvis-btn-danger user-remove-button";
                    removeBtn.textContent = "Remove";
                    removeBtn.title = `Remove ${user.name}`;
                    removeBtn.addEventListener("click", async (event) => {
                        event.stopPropagation();
                        if (!window.confirm(`Permanently remove ${user.name} and this profile's local data?`)) return;
                        try {
                            const result = await API()?.delete(user.userId, true);
                            if (!result?.success) {
                                showNotification(result?.error || "Could not remove this user.");
                                return;
                            }
                            closeAllModals();
                            window.dispatchEvent(new CustomEvent("jarvis:user-changed"));
                            showNotification(`Removed ${user.name}.`);
                            setTimeout(() => location.reload(), 250);
                        } catch (error) {
                            showNotification("Could not remove user: " + (error?.message || "unknown error"));
                        }
                    });
                    item.appendChild(removeBtn);
                }

                item.addEventListener("click", () => selectUserWithPin(user));
                item.addEventListener("mouseenter", () => { if (!user.isActive) item.style.background = "rgba(0,229,255,0.05)"; });
                item.addEventListener("mouseleave", () => { if (!user.isActive) item.style.background = "transparent"; });
                list.appendChild(item);
            });

            modal.body.appendChild(list);

            const guestUser = res.users.find(user => user.isGuest);
            if (guestUser) {
                const guestButton = createBtn("Continue as Guest", "ghost");
                guestButton.type = "button";
                guestButton.style.cssText = "width:100%;margin-top:10px;";
                guestButton.addEventListener("click", () => selectUserWithPin(guestUser));
                modal.body.appendChild(guestButton);
            }

            // Quick-switch hint
            const hint = document.createElement("p");
            hint.style.cssText = "text-align:center;color:rgba(140,160,180,0.4);font-size:0.7rem;margin-top:10px;";
            hint.textContent = "Ctrl+Shift+U to quick-switch";
            modal.body.appendChild(hint);
        }).catch((error) => {
            closeAllModals();
            showNotification("Could not load users: " + (error?.message || "user service unavailable"));
        });
    }

    function selectUserWithPin(user) {
        if (user.isActive) { closeAllModals(); return; }
        if (user.hasPin && !user.isGuest) {
            showPinPrompt(user, (pin) => {
                API()?.switch(user.userId, pin).then((res) => {
                    if (res?.success) {
                        window.MistakeLearningControl?.resetContext?.();
                        window.dispatchEvent(new CustomEvent("jarvis:user-changed"));
                        closeAllModals();
                        speak("Switched to " + user.name);
                        setTimeout(() => location.reload(), 250);
                    } else {
                        showNotification(res?.error || "Could not switch user. Check the PIN and try again.");
                    }
                }).catch(() => showNotification("Switch failed."));
            });
        } else {
            API()?.switch(user.userId).then((res) => {
                if (res?.success) {
                    window.MistakeLearningControl?.resetContext?.();
                    window.dispatchEvent(new CustomEvent("jarvis:user-changed"));
                    closeAllModals();
                    speak("Switched to " + user.name);
                    setTimeout(() => location.reload(), 250);
                } else {
                    showNotification(res?.error || "Could not switch user.");
                }
            }).catch(() => showNotification("Switch failed."));
        }
    }

    // ============================================================
    // PIN PROMPT MODAL
    // ============================================================

    function showPinPrompt(user, callback) {
        closeAllModals();
        pinModalOpen = true;
        const modal = createModal("jarvis-pin-prompt", "Enter PIN for " + (user?.name || "User"));

        const input = document.createElement("input");
        input.type = "password";
        input.placeholder = "Enter PIN";
        input.maxLength = 20;
        input.style.cssText = "width:100%;padding:12px;font-size:1.2rem;text-align:center;letter-spacing:0.3em;border-radius:8px;background:rgba(0,0,0,0.4);border:1px solid rgba(0,229,255,0.2);color:#fff;";
        input.autofocus = true;
        modal.body.appendChild(input);

        const btnRow = document.createElement("div");
        btnRow.style.cssText = "display:flex;gap:10px;margin-top:16px;";
        const okBtn = document.createElement("button");
        okBtn.className = "jarvis-btn jarvis-btn-primary";
        okBtn.textContent = "Unlock";
        const cancelBtn = document.createElement("button");
        cancelBtn.className = "jarvis-btn jarvis-btn-ghost";
        cancelBtn.textContent = "Cancel";
        btnRow.appendChild(okBtn);
        btnRow.appendChild(cancelBtn);
        modal.body.appendChild(btnRow);

        okBtn.addEventListener("click", () => {
            pinModalOpen = false;
            closeAllModals();
            callback(input.value);
        });
        cancelBtn.addEventListener("click", () => {
            pinModalOpen = false;
            closeAllModals();
        });
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") okBtn.click();
            if (e.key === "Escape") cancelBtn.click();
        });
        setTimeout(() => input.focus(), 100);
    }

    // ============================================================
    // PIN MANAGEMENT MODAL
    // ============================================================

    function openPinManager() {
        closeAllModals();
        const modal = createModal("jarvis-pin-manager", "PIN Management");

        API()?.getActive().then((res) => {
            if (!res?.success || !res.user) return;
            const userId = res.user.userId;

            API()?.hasPin(userId).then((pinRes) => {
                const hasPin = pinRes?.success && pinRes.hasPin;

                if (hasPin) {
                    // Change PIN
                    const oldInput = createInput("Current PIN", "password");
                    const newInput = createInput("New PIN (min 4 chars)", "password");
                    const confirmInput = createInput("Confirm New PIN", "password");
                    modal.body.appendChild(oldInput.wrapper);
                    modal.body.appendChild(newInput.wrapper);
                    modal.body.appendChild(confirmInput.wrapper);

                    const btnRow = document.createElement("div");
                    btnRow.style.cssText = "display:flex;gap:10px;margin-top:16px;";
                    const updateBtn = createBtn("Update PIN", "primary");
                    const removeBtn = createBtn("Remove PIN", "danger");
                    btnRow.appendChild(updateBtn);
                    btnRow.appendChild(removeBtn);
                    modal.body.appendChild(btnRow);

                    updateBtn.addEventListener("click", () => {
                        if (newInput.input.value !== confirmInput.input.value) { showNotification("PINs do not match."); return; }
                        if (newInput.input.value.length < 4) { showNotification("PIN must be at least 4 characters."); return; }
                        API()?.updatePin(userId, oldInput.input.value, newInput.input.value).then((r) => {
                            if (r?.success) { closeAllModals(); showNotification("PIN updated."); }
                            else showNotification("Failed: " + (r?.error || ""));
                        });
                    });
                    removeBtn.addEventListener("click", () => {
                        API()?.removePin(userId, oldInput.input.value).then((r) => {
                            if (r?.success) { closeAllModals(); showNotification("PIN removed."); }
                            else showNotification("Failed: " + (r?.error || ""));
                        });
                    });
                } else {
                    // Set PIN
                    const newInput = createInput("New PIN (min 4 chars)", "password");
                    const confirmInput = createInput("Confirm PIN", "password");
                    modal.body.appendChild(newInput.wrapper);
                    modal.body.appendChild(confirmInput.wrapper);

                    const setBtn = createBtn("Set PIN", "primary");
                    setBtn.style.cssText = "width:100%;margin-top:16px;";
                    modal.body.appendChild(setBtn);

                    setBtn.addEventListener("click", () => {
                        if (newInput.input.value !== confirmInput.input.value) { showNotification("PINs do not match."); return; }
                        if (newInput.input.value.length < 4) { showNotification("PIN must be at least 4 characters."); return; }
                        API()?.setPin(userId, newInput.input.value).then((r) => {
                            if (r?.success) { closeAllModals(); showNotification("PIN set successfully."); }
                            else showNotification("Failed: " + (r?.error || ""));
                        });
                    });
                }
            });
        });
    }

    // ============================================================
    // MERGE USERS MODAL
    // ============================================================

    function openMergeUsers() {
        closeAllModals();
        API()?.list().then((res) => {
            if (!res?.success || !res.users) return;
            const realUsers = res.users.filter((u) => !u.isGuest);
            if (realUsers.length < 2) {
                showNotification("Need at least 2 non-guest users to merge.");
                return;
            }

            const modal = createModal("jarvis-merge-users", "Merge Users");
            const warning = document.createElement("p");
            warning.style.cssText = "color:rgba(255,170,50,0.8);font-size:0.8rem;padding:8px 12px;background:rgba(255,170,50,0.08);border-radius:6px;margin-bottom:12px;";
            warning.textContent = "⚠ Merging copies source user's data into target, then deletes the source. This cannot be undone.";
            modal.body.appendChild(warning);

            const sourceLabel = document.createElement("label");
            sourceLabel.textContent = "Source (will be deleted):";
            sourceLabel.style.cssText = "display:block;margin:8px 0 4px;font-size:0.8rem;color:rgba(140,160,180,0.7);";
            modal.body.appendChild(sourceLabel);
            const sourceSelect = createUserSelect(realUsers);
            modal.body.appendChild(sourceSelect);

            const targetLabel = document.createElement("label");
            targetLabel.textContent = "Target (will receive merged data):";
            targetLabel.style.cssText = "display:block;margin:12px 0 4px;font-size:0.8rem;color:rgba(140,160,180,0.7);";
            modal.body.appendChild(targetLabel);
            const targetSelect = createUserSelect(realUsers);
            modal.body.appendChild(targetSelect);

            const mergeBtn = createBtn("Merge Users", "danger");
            mergeBtn.style.cssText = "width:100%;margin-top:16px;";
            modal.body.appendChild(mergeBtn);

            mergeBtn.addEventListener("click", () => {
                const src = sourceSelect.value;
                const tgt = targetSelect.value;
                if (!src || !tgt) { showNotification("Select both users."); return; }
                if (src === tgt) { showNotification("Cannot merge a user with itself."); return; }
                if (!confirm("Are you sure? This will delete the source user permanently.")) return;

                API()?.getActive().then((activeRes) => {
                    const requestingId = activeRes?.user?.userId || "";
                    API()?.merge(src, tgt, requestingId).then((r) => {
                        if (r?.success) { closeAllModals(); showNotification("Users merged successfully."); setTimeout(() => location.reload(), 500); }
                        else showNotification("Merge failed: " + (r?.error || ""));
                    });
                });
            });
        });
    }

    // ============================================================
    // QUICK-SWITCH DROPDOWN (Ctrl+Shift+U)
    // ============================================================

    let quickSwitchOpen = false;

    function toggleQuickSwitch() {
        if (quickSwitchOpen) { closeQuickSwitch(); return; }
        quickSwitchOpen = true;

        API()?.list().then((res) => {
            if (!res?.success || !res.users) { quickSwitchOpen = false; return; }

            const dropdown = document.createElement("div");
            dropdown.id = "jarvis-quick-switch";
            dropdown.style.cssText = "position:fixed;top:50px;right:20px;z-index:99999;background:rgba(8,14,24,0.95);border:1px solid rgba(0,229,255,0.2);border-radius:12px;padding:8px;min-width:220px;backdrop-filter:blur(12px);box-shadow:0 8px 32px rgba(0,0,0,0.4);";

            const header = document.createElement("div");
            header.style.cssText = "padding:4px 8px 8px;font-size:0.7rem;color:rgba(0,229,255,0.6);font-family:Orbitron,sans-serif;letter-spacing:0.1em;";
            header.textContent = "QUICK SWITCH";
            dropdown.appendChild(header);

            res.users.forEach((user) => {
                const item = document.createElement("div");
                item.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer;border-radius:6px;" + (user.isActive ? "background:rgba(0,229,255,0.08);" : "");
                item.appendChild(createAvatar(user, 28));

                const name = document.createElement("span");
                name.textContent = user.name;
                name.style.cssText = "flex:1;color:rgba(220,235,245,0.9);font-size:0.85rem;";
                item.appendChild(name);

                if (user.isActive) {
                    const dot = document.createElement("span");
                    dot.style.cssText = "width:6px;height:6px;border-radius:50%;background:#00ff8c;";
                    item.appendChild(dot);
                }

                item.addEventListener("click", () => {
                    closeQuickSwitch();
                    selectUserWithPin(user);
                });
                item.addEventListener("mouseenter", () => { if (!user.isActive) item.style.background = "rgba(0,229,255,0.05)"; });
                item.addEventListener("mouseleave", () => { if (!user.isActive) item.style.background = "transparent"; });
                dropdown.appendChild(item);
            });

            // Add PIN manager link
            const pinLink = document.createElement("div");
            pinLink.style.cssText = "padding:6px 8px;cursor:pointer;border-top:1px solid rgba(0,229,255,0.1);margin-top:4px;font-size:0.8rem;color:rgba(0,229,255,0.7);";
            pinLink.textContent = "🔒 Manage PIN";
            pinLink.addEventListener("click", () => { closeQuickSwitch(); openPinManager(); });
            dropdown.appendChild(pinLink);

            // Merge link
            const mergeLink = document.createElement("div");
            mergeLink.style.cssText = "padding:6px 8px;cursor:pointer;font-size:0.8rem;color:rgba(255,170,50,0.7);";
            mergeLink.textContent = "⊕ Merge Users";
            mergeLink.addEventListener("click", () => { closeQuickSwitch(); openMergeUsers(); });
            dropdown.appendChild(mergeLink);

            document.body.appendChild(dropdown);

            // Close on outside click
            setTimeout(() => {
                document.addEventListener("click", outsideClickHandler);
            }, 100);
        }).catch(() => { quickSwitchOpen = false; });
    }

    function closeQuickSwitch() {
        const el = $("jarvis-quick-switch");
        if (el) el.remove();
        quickSwitchOpen = false;
        document.removeEventListener("click", outsideClickHandler);
    }

    function outsideClickHandler(e) {
        const el = $("jarvis-quick-switch");
        if (el && !el.contains(e.target)) closeQuickSwitch();
    }

    // ============================================================
    // HELPER FUNCTIONS
    // ============================================================

    function createModal(id, title) {
        closeAllModals();
        const backdrop = document.createElement("div");
        backdrop.id = "jarvisUserModalBackdrop";
        backdrop.className = "user-modal-backdrop";
        backdrop.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99998;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);";

        const modal = document.createElement("div");
        modal.id = id;
        modal.className = "user-modal";
        modal.style.cssText = "background:rgba(12,18,30,0.98);border:1px solid rgba(0,229,255,0.15);border-radius:16px;padding:24px;max-width:460px;width:90%;max-height:80vh;overflow-y:auto;";

        const header = document.createElement("div");
        header.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;";
        const h3 = document.createElement("h3");
        h3.textContent = title;
        h3.style.cssText = "color:rgba(0,229,255,0.9);font-family:Orbitron,sans-serif;font-size:1rem;letter-spacing:0.08em;margin:0;";
        const closeBtn = document.createElement("button");
        closeBtn.textContent = "×";
        closeBtn.style.cssText = "background:none;border:none;color:rgba(140,160,180,0.5);font-size:1.5rem;cursor:pointer;";
        closeBtn.addEventListener("click", closeAllModals);
        header.appendChild(h3);
        header.appendChild(closeBtn);
        modal.appendChild(header);

        const body = document.createElement("div");
        body.className = "user-modal-body";
        modal.appendChild(body);

        backdrop.appendChild(modal);
        backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeAllModals(); });
        document.body.appendChild(backdrop);

        return { modal, body, backdrop };
    }

    function closeAllModals() {
        const backdrop = $("jarvisUserModalBackdrop");
        if (backdrop) backdrop.remove();
        // FIX: also close the base panel's modal (userModalRoot) and cancel
        // any in-flight onboarding, so Escape/backdrop clicks close BOTH
        // modal systems instead of leaving the other one stuck open.
        if (window.JARVISUserPanel?.closeAllModals) {
            window.JARVISUserPanel.closeAllModals();
        }
    }

    function createInput(labelText, type) {
        const wrapper = document.createElement("div");
        wrapper.style.cssText = "margin-bottom:10px;";
        const label = document.createElement("label");
        label.textContent = labelText;
        label.style.cssText = "display:block;margin-bottom:4px;font-size:0.8rem;color:rgba(140,160,180,0.7);";
        wrapper.appendChild(label);
        const input = document.createElement("input");
        input.type = type || "text";
        input.style.cssText = "width:100%;padding:10px;border-radius:6px;background:rgba(0,0,0,0.3);border:1px solid rgba(0,229,255,0.15);color:#fff;font-size:0.9rem;";
        wrapper.appendChild(input);
        return { wrapper, input };
    }

    function createBtn(text, style) {
        const btn = document.createElement("button");
        btn.className = "jarvis-btn" + (style === "primary" ? " jarvis-btn-primary" : style === "danger" ? " jarvis-btn-danger" : " jarvis-btn-ghost");
        btn.textContent = text;
        return btn;
    }

    function createUserSelect(users) {
        const select = document.createElement("select");
        select.style.cssText = "width:100%;padding:10px;border-radius:6px;background:rgba(0,0,0,0.3);border:1px solid rgba(0,229,255,0.15);color:#fff;font-size:0.9rem;";
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "— Select user —";
        select.appendChild(placeholder);
        users.forEach((u) => {
            const opt = document.createElement("option");
            opt.value = u.userId;
            opt.textContent = u.name + (u.role ? ` (${u.role})` : "");
            select.appendChild(opt);
        });
        return select;
    }

    function showNotification(text) {
        if (window.JARVISUserPanel?.showNotification) {
            window.JARVISUserPanel.showNotification(text);
        } else {
            const toast = document.createElement("div");
            toast.style.cssText = "position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(0,229,255,0.15);border:1px solid rgba(0,229,255,0.3);color:#fff;padding:10px 20px;border-radius:8px;z-index:99999;font-size:0.85rem;";
            toast.textContent = text;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        }
    }

    // ============================================================
    // KEYBOARD SHORTCUT: Ctrl+Shift+U
    // ============================================================

    function setupKeyboardShortcuts() {
        document.addEventListener("keydown", (e) => {
            // Ctrl+Shift+U — Quick switch user
            if (e.ctrlKey && e.shiftKey && (e.key === "U" || e.key === "u")) {
                e.preventDefault();
                e.stopPropagation();
                toggleQuickSwitch();
            }
            // Escape closes any open modal
            if (e.key === "Escape" && !pinModalOpen) {
                closeQuickSwitch();
                closeAllModals();
            }
        });
    }

    // ============================================================
    // INTEGRATE INTO EXISTING PANEL
    // ============================================================

    function integrate() {
        // Hook into existing refresh
        const origRefresh = window.JARVISUserPanel?.refresh;
        if (origRefresh) {
            window.JARVISUserPanel.refresh = async function () {
                await origRefresh.call(this);
                enhanceCurrentCard();
            };
        }

        // Hook into existing openUserSelector
        const origSelector = window.JARVISUserPanel?.openUserSelector;
        if (origSelector) {
            window.JARVISUserPanel.openUserSelector = openEnhancedUserSelector;
        }

        // Add PIN manager button to existing panel
        const settingsBtn = $("userPanelSettingsBtn");
        if (settingsBtn && settingsBtn.parentNode) {
            const pinBtn = document.createElement("button");
            pinBtn.className = "user-card user-card-action";
            pinBtn.id = "userPanelPinBtn";
            pinBtn.innerHTML = "<strong>🔒</strong><small>PIN Lock</small>";
            pinBtn.addEventListener("click", openPinManager);
            settingsBtn.parentNode.insertBefore(pinBtn, settingsBtn.nextSibling);
        }

        setupKeyboardShortcuts();
        enhanceCurrentCard();

        console.log("[UserPanelUpgrade] Initialized — Ctrl+Shift+U for quick switch");
    }

    // Initialize after DOM ready + existing panel
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => setTimeout(integrate, 2000));
    } else {
        setTimeout(integrate, 2000);
    }

    // Expose for programmatic use
    window.JARVISUserPanelUpgrade = Object.freeze({
        openPinManager,
        openMergeUsers,
        toggleQuickSwitch,
        openEnhancedUserSelector,
        enhanceCurrentCard,
        createAvatar,
        roleBadge,
    });

    console.log("JARVIS User Panel Upgrade loaded");
})();
