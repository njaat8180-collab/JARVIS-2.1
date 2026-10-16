"use strict";

(function () {
    let items = [];
    let filter = "ALL";

    function api() { return window.jarvis?.notifications || window.JarvisBridge?.notifications || null; }
    function esc(v) {
        const d = document.createElement("div"); d.textContent = String(v ?? ""); return d.innerHTML;
    }

    async function refresh() {
        const a = api(); if (!a) return;
        try {
            const r = await a.list({ category: filter, limit: 100 });
            if (r?.success) items = r.notifications || [];
            render();
            const u = await a.unreadCount();
            const badge = document.getElementById("notificationUnreadCount");
            if (badge) { badge.textContent = String(u?.count || 0); badge.hidden = !(u?.count); }
        } catch (e) { console.warn("[NotificationCenter] refresh failed:", e); }
    }

    function render() {
        const box = document.getElementById("notificationList");
        if (!box) return;
        if (!items.length) {
            box.innerHTML = '<div class="notification-empty">No notifications</div>';
            return;
        }
        box.innerHTML = items.map(n => `
            <button class="notification notification-${esc(n.type).toLowerCase()} ${n.read ? "is-read" : "is-unread"}"
                data-notification-id="${esc(n.id)}" title="Mark as read">
                <span class="notification-dot"></span>
                <span class="notification-body">
                    <strong>${esc(n.title)}</strong>
                    <span>${esc(n.message)}</span>
                    <small>${esc(new Date(n.timestamp).toLocaleString())} · ${esc(n.category)}</small>
                </span>
            </button>`).join("");
        box.querySelectorAll("[data-notification-id]").forEach(el => {
            el.addEventListener("click", async () => {
                await api()?.markRead(el.dataset.notificationId);
                await refresh();
            });
        });
    }

    async function markAll() { await api()?.markAllRead(); await refresh(); }
    async function clearAll() { await api()?.clear(); await refresh(); }

    function bind() {
        document.getElementById("notificationMarkAll")?.addEventListener("click", markAll);
        document.getElementById("notificationClearAll")?.addEventListener("click", clearAll);
        document.getElementById("notificationRefresh")?.addEventListener("click", refresh);
        document.querySelectorAll("[data-notification-filter]").forEach(b => {
            b.addEventListener("click", async () => {
                filter = b.dataset.notificationFilter || "ALL";
                document.querySelectorAll("[data-notification-filter]").forEach(x => x.classList.toggle("active", x === b));
                await refresh();
            });
        });
    }

    window.NotificationEngine = Object.freeze({
        add(message, type = "info") {
            // Backward-compatible UI-only helper; real persisted notifications
            // are emitted by the main process from actual events.
            console.info("[Notification]", message, type);
            refresh();
        },
        refresh, markAll, clearAll
    });

    document.addEventListener("DOMContentLoaded", () => { bind(); refresh(); });
    window.addEventListener("jarvis:user-switched", refresh);
})();
