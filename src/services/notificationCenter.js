"use strict";

/**
 * Persistent, local Notification Center.
 * Data is intentionally small and append-only-ish: newest 200 records retained.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "database");
const FILE = path.join(ROOT, "notifications.json");
const MAX = 200;

function ensure() { fs.mkdirSync(ROOT, { recursive: true }); }
function load() {
    ensure();
    try {
        const parsed = JSON.parse(fs.readFileSync(FILE, "utf8"));
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
}
function save(items) {
    ensure();
    const tmp = FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(items.slice(-MAX), null, 2), "utf8");
    fs.renameSync(tmp, FILE);
}
function normalize(n = {}) {
    return {
        id: String(n.id || `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`),
        type: String(n.type || "INFO").toUpperCase(),
        category: String(n.category || "JARVIS").toUpperCase(),
        title: String(n.title || "JARVIS"),
        message: String(n.message || ""),
        timestamp: n.timestamp || new Date().toISOString(),
        read: n.read === true,
        priority: String(n.priority || "normal").toLowerCase(),
        source: String(n.source || "system"),
        userId: n.userId ? String(n.userId) : null,
        metadata: n.metadata && typeof n.metadata === "object" ? n.metadata : {}
    };
}
function add(notification) {
    const items = load();
    const item = normalize(notification);
    items.push(item);
    save(items);
    return item;
}
function list(options = {}) {
    let items = load().slice().reverse();
    if (options.userId) items = items.filter(n => !n.userId || n.userId === options.userId);
    if (options.category && options.category !== "ALL") items = items.filter(n => n.category === String(options.category).toUpperCase());
    if (Number.isFinite(options.limit)) items = items.slice(0, Math.max(1, Math.min(100, Number(options.limit))));
    return items;
}
function markRead(id) {
    const items = load();
    const item = items.find(n => n.id === id);
    if (!item) return false;
    item.read = true; save(items); return true;
}
function markAllRead(userId) {
    const items = load();
    for (const n of items) if (!userId || !n.userId || n.userId === userId) n.read = true;
    save(items); return true;
}
function clear(userId) {
    const items = load();
    save(userId ? items.filter(n => n.userId && n.userId !== userId) : []);
    return true;
}
function unreadCount(userId) {
    return list({ userId }).filter(n => !n.read).length;
}
function stats(userId) {
    const items = list({ userId });
    return { total: items.length, unread: items.filter(n => !n.read).length };
}
module.exports = { add, list, markRead, markAllRead, clear, unreadCount, stats, FILE };
