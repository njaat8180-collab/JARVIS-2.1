"use strict";

/*
 * ============================================================
 * JARVIS PRO MAX — USER MANAGER v2.0 (Main Process)
 * src/users/userManager.js
 * ============================================================
 *
 * UPGRADED: PIN auth, roles, avatars, personality,
 * activity tracking, guest restrictions, merge, sessions.
 *
 * STORAGE:
 *   <Electron userData>/database/users/
 *     users.json              ← registry (id, name, role, pin, createdAt, active)
 *     user_xxx/
 *       profile.json           ← name, DOB, language, location, avatar, etc.
 *       preferences.json       ← voice, personality, response style, theme
 *       privacy.json           ← data consent controls
 *       activity.json          ← login count, last seen, message count
 *       memory.json            ← per-user MemoryEngine store
 *
 * SECURITY:
 *   - PINs hashed with PBKDF2 + per-user salt (never plaintext)
 *   - Unique IDs, input sanitization, path traversal prevention
 *   - Strict isolation — User A never sees User B's data
 *   - Session lock after configurable timeout
 * ============================================================
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { writeJsonAtomic } = require("../utils/atomicJson");

const DEFAULT_DATA_DIR = path.join(__dirname, "..", "database");
let DATA_DIR = DEFAULT_DATA_DIR;
let USERS_DIR = path.join(DATA_DIR, "users");
let REGISTRY_PATH = path.join(USERS_DIR, "users.json");
let LEGACY_MEMORY = path.join(DATA_DIR, "memory.json");

// Electron packages application code in a read-only ASAR archive. Keep all
// user records under app.getPath('userData'); migrate the old source-tree
// database once when running an unpackaged checkout.
function configureDataDirectory(dataDirectory, { migrateFrom = null } = {}) {
    if (typeof dataDirectory !== "string" || !dataDirectory.trim()) throw new Error("A writable data directory is required.");
    const destination = path.resolve(dataDirectory);
    const previousDataDir = DATA_DIR;
    DATA_DIR = destination;
    USERS_DIR = path.join(DATA_DIR, "users");
    REGISTRY_PATH = path.join(USERS_DIR, "users.json");
    LEGACY_MEMORY = path.join(DATA_DIR, "memory.json");
    fs.mkdirSync(USERS_DIR, { recursive: true });
    if (!fs.existsSync(REGISTRY_PATH) && migrateFrom) {
        const source = path.resolve(migrateFrom);
        if (source !== destination && fs.existsSync(source)) {
            const sourceUsers = path.join(source, "users");
            if (fs.existsSync(sourceUsers)) fs.cpSync(sourceUsers, USERS_DIR, { recursive: true, errorOnExist: false, force: false });
            const sourceMemory = path.join(source, "memory.json");
            if (!fs.existsSync(LEGACY_MEMORY) && fs.existsSync(sourceMemory)) fs.copyFileSync(sourceMemory, LEGACY_MEMORY);
        }
    }
    return { dataDir: DATA_DIR, previousDataDir };
}

const ROLES = ["admin", "member", "guest"];
const AVATAR_COLORS = [
    "#00E5FF", "#FF6B35", "#7C4DFF", "#00E676", "#FF4081",
    "#FFD600", "#00B0FF", "#69F0AE", "#FF5252", "#B388FF",
    "#FFAB40", "#18FFFF", "#B9F6CA", "#FF80AB", "#82B1FF",
];

// Session state (in-memory, not persisted)
const sessions = new Map();

// ============================================================
// ID GENERATION
// ============================================================

function genUserId() {
    return "u_" + Date.now().toString(36) + "_" + crypto.randomBytes(3).toString("hex");
}

// ============================================================
// PIN / PASSWORD HASHING (PBKDF2)
// ============================================================

function hashPin(pin) {
    const salt = crypto.randomBytes(16).toString("hex");
    const iterations = 100000;
    const keylen = 32;
    const digest = "sha256";
    const hash = crypto.pbkdf2Sync(String(pin), salt, iterations, keylen, digest).toString("hex");
    return `pbkdf2$${digest}$${iterations}$${salt}$${hash}`;
}

function verifyPin(pin, stored) {
    if (!stored || typeof stored !== "string") return false;
    const parts = stored.split("$");
    if (parts.length !== 5 || parts[0] !== "pbkdf2") return false;
    const [, digest, iterations, salt, hash] = parts;
    const testHash = crypto.pbkdf2Sync(String(pin), salt, parseInt(iterations), 32, digest).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(testHash, "hex"));
}

// ============================================================
// INPUT SANITIZATION
// ============================================================

function sanitizeString(value, maxLength = 200) {
    if (typeof value !== "string") return "";
    let v = value.trim().slice(0, maxLength);
    v = v.replace(/[.]{2,}/g, "").replace(/[\\\/]/g, "");
    v = v.replace(/<script[^>]*>/gi, "").replace(/<\/script>/gi, "");
    return v;
}

function sanitizeAddress(value, maxLength = 240) {
    if (typeof value !== "string") return "";
    return value.trim().slice(0, maxLength)
        .replace(/<script[^>]*>/gi, "")
        .replace(/<\/script>/gi, "");
}

function sanitizeProfile(profile) {
    if (!profile || typeof profile !== "object") return {};
    return {
        name: sanitizeString(profile.name, 100),
        preferredName: sanitizeString(profile.preferredName, 100),
        email: sanitizeString(profile.email, 160),
        phone: sanitizeString(profile.phone, 40),
        address: sanitizeAddress(profile.address, 240),
        dateOfBirth: sanitizeString(profile.dateOfBirth, 20),
        language: sanitizeString(profile.language, 30),
        secondaryLanguage: sanitizeString(profile.secondaryLanguage, 30),
        autoLanguageDetect: Boolean(profile.autoLanguageDetect),
        country: sanitizeString(profile.country, 100),
        region: sanitizeString(profile.region, 100),
        city: sanitizeString(profile.city, 100),
        timezone: sanitizeString(profile.timezone, 100),
        occupation: sanitizeString(profile.occupation, 100),
        education: sanitizeString(profile.education, 100),
        interests: Array.isArray(profile.interests)
            ? profile.interests.map(i => sanitizeString(i, 50)).filter(Boolean).slice(0, 20)
            : [],
        hobbies: Array.isArray(profile.hobbies)
            ? profile.hobbies.map(h => sanitizeString(h, 50)).filter(Boolean).slice(0, 20)
            : [],
        avatarColor: sanitizeString(profile.avatarColor, 30) || null,
        avatarInitials: sanitizeString(profile.avatarInitials, 4) || null,
    };
}

function sanitizePreferences(prefs) {
    if (!prefs || typeof prefs !== "object") return {};
    return {
        voice: sanitizeString(prefs.voice, 50),
        voiceSpeed: Number(prefs.voiceSpeed) || 1.0,
        voicePitch: Number(prefs.voicePitch) || 1.0,
        ttsEngine: sanitizeString(prefs.ttsEngine, 50),
        responseStyle: sanitizeString(prefs.responseStyle, 30),
        responseLength: sanitizeString(prefs.responseLength, 20),
        personality: Array.isArray(prefs.personality)
            ? prefs.personality.map(p => sanitizeString(p, 30)).filter(Boolean).slice(0, 10)
            : [],
        formality: sanitizeString(prefs.formality, 20),
        proactiveBehavior: Boolean(prefs.proactiveBehavior),
        greetingBehavior: sanitizeString(prefs.greetingBehavior, 20),
        adaptiveMode: Boolean(prefs.adaptiveMode),
        useNameInResponses: prefs.useNameInResponses !== false,
        theme: sanitizeString(prefs.theme, 30) || "default",
        accentColor: sanitizeString(prefs.accentColor, 30) || null,
        personalityTone: sanitizeString(prefs.personalityTone, 30) || "balanced",
        humor: sanitizeString(prefs.humor, 20) || "moderate",
        technicalDepth: sanitizeString(prefs.technicalDepth, 20) || "medium",
    };
}

function sanitizePrivacy(privacy) {
    if (!privacy || typeof privacy !== "object") return {};
    return {
        memoryEnabled: privacy.memoryEnabled !== false,
        saveProfile: privacy.saveProfile !== false,
        saveConversationMemory: privacy.saveConversationMemory !== false,
        savePreferences: privacy.savePreferences !== false,
        saveLearningData: privacy.saveLearningData === true,
        saveVoiceData: privacy.saveVoiceData !== false,
        saveBrowserActivity: privacy.saveBrowserActivity === true,
        saveSearchHistory: privacy.saveSearchHistory === true,
        saveBackgroundLearning: privacy.saveBackgroundLearning === true,
    };
}

function sanitizeActivity(activity) {
    if (!activity || typeof activity !== "object") return {};
    return {
        loginCount: Number(activity.loginCount) || 0,
        lastLoginAt: activity.lastLoginAt || null,
        lastSeenAt: activity.lastSeenAt || null,
        messageCount: Number(activity.messageCount) || 0,
        voiceCommandCount: Number(activity.voiceCommandCount) || 0,
        commandsExecuted: Number(activity.commandsExecuted) || 0,
        firstSeenAt: activity.firstSeenAt || new Date().toISOString(),
        sessionsCount: Number(activity.sessionsCount) || 0,
        totalSessionMinutes: Number(activity.totalSessionMinutes) || 0,
    };
}

// Settings screens save one field at a time. Applying a full sanitizer to
// each small patch used to replace every omitted field with its default,
// silently erasing the rest of a user's profile/preferences/privacy choices.
function mergeSanitizedPatch(existing, updates, sanitized) {
    const merged = { ...(existing || {}) };
    for (const key of Object.keys(updates || {})) {
        if (Object.prototype.hasOwnProperty.call(sanitized, key)) {
            merged[key] = sanitized[key];
        }
    }
    return merged;
}

// ============================================================
// AVATAR HELPERS
// ============================================================

function getInitials(name) {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function pickAvatarColor(userId) {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ============================================================
// ROLE / PERMISSION CHECKS
// ============================================================

function getRole(userId) {
    const registry = loadRegistry();
    const user = registry.users.find(u => u.userId === userId);
    if (!user) return "guest";
    if (user.isGuest) return "guest";
    return user.role || "member";
}

function hasPermission(userId, permission) {
    const role = getRole(userId);
    const PERMISSIONS = {
        admin: ["switch_user", "create_user", "delete_user", "export_data", "import_data",
                "clear_memory", "manage_settings", "merge_users", "view_all_users", "manage_roles"],
        member: ["switch_user", "export_data", "manage_settings", "clear_memory"],
        guest: [],
    };
    return (PERMISSIONS[role] || []).includes(permission);
}

function isGuest(userId) {
    return getRole(userId) === "guest";
}

function isAdmin(userId) {
    return getRole(userId) === "admin";
}

// ============================================================
// GUEST RESTRICTIONS
// ============================================================

const GUEST_RESTRICTIONS = {
    canExport: false,
    canClearMemory: false,
    canDeleteUsers: false,
    canManageSettings: false,
    canImport: false,
    canMerge: false,
    canUseLearning: false,
    maxMemoryEntries: 50,
};

function checkGuestRestriction(userId, action) {
    const role = getRole(userId);
    if (role !== "guest") return { allowed: true };
    const restrictionMap = {
        export: "canExport",
        clear_memory: "canClearMemory",
        delete_user: "canDeleteUsers",
        manage_settings: "canManageSettings",
        import: "canImport",
        merge: "canMerge",
        learning: "canUseLearning",
    };
    const key = restrictionMap[action];
    if (key && GUEST_RESTRICTIONS[key] === false) {
        return { allowed: false, reason: `Guest users cannot ${action.replace(/_/g, " ")}. Please create a profile.` };
    }
    return { allowed: true };
}

// ============================================================
// REGISTRY
// ============================================================

function ensureDirs() {
    try { fs.mkdirSync(USERS_DIR, { recursive: true }); } catch (_) {}
}

function loadRegistry() {
    ensureDirs();
    try {
        const raw = fs.readFileSync(REGISTRY_PATH, "utf8").trim();
        if (!raw) return { users: [], activeUserId: null, version: 2 };
        const parsed = JSON.parse(raw);
        if (!parsed.users) parsed.users = [];
        // Migrate v1 → v2: add role field
        let changed = false;
        for (const u of parsed.users) {
            if (!u.role) { u.role = u.isGuest ? "guest" : "member"; changed = true; }
            if (u.pinHash === undefined) { u.pinHash = null; changed = true; }
        }
        if (changed) saveRegistry(parsed);
        return parsed;
    } catch (_) {
        return { users: [], activeUserId: null, version: 2 };
    }
}

function saveRegistry(registry) {
    ensureDirs();
    writeJsonAtomic(REGISTRY_PATH, registry);
}

// ============================================================
// USER DIRECTORY MANAGEMENT
// ============================================================

function userDir(userId) {
    return path.join(USERS_DIR, userId);
}

function ensureUserDir(userId) {
    const dir = userDir(userId);
    ensureDirs();
    try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
    return dir;
}

function loadUserFile(userId, filename) {
    try {
        const filePath = path.join(userDir(userId), filename);
        if (!fs.existsSync(filePath)) return null;
        const raw = fs.readFileSync(filePath, "utf8").trim();
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (error) {
        try {
            const filePath = path.join(userDir(userId), filename);
            const backupPath = filePath + ".corrupt-" + Date.now() + ".bak";
            if (fs.existsSync(filePath)) {
                fs.copyFileSync(filePath, backupPath);
                console.warn(`[UserManager] Corrupted ${filename} for ${userId} — backed up`);
            }
        } catch (_) {}
        return null;
    }
}

function saveUserFile(userId, filename, data) {
    const dir = ensureUserDir(userId);
    const filePath = path.join(dir, filename);
    writeJsonAtomic(filePath, data);
}

// ============================================================
// DIRECTORY SIZE (for storage usage)
// ============================================================

function dirSize(dirPath) {
    if (!fs.existsSync(dirPath)) return 0;
    let total = 0;
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                total += dirSize(fullPath);
            } else {
                try { total += fs.statSync(fullPath).size; } catch (_) {}
            }
        }
    } catch (_) {}
    return total;
}

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

// ============================================================
// USER CRUD
// ============================================================

function createUser(profile = {}, preferences = {}, privacy = {}, options = {}) {
    if (options && options.pin && !/^\d{4,20}$/.test(String(options.pin))) {
        return { success: false, error: "PIN must contain 4–20 digits" };
    }
    const registry = loadRegistry();

    let userId = genUserId();
    // Defense in depth: genUserId() (timestamp + random bytes) is already
    // effectively collision-free, but if two calls ever landed in the same
    // millisecond with the same random suffix, re-roll rather than silently
    // overwrite an existing user's directory.
    let guard = 0;
    while ((registry.users.some(u => u.userId === userId) || fs.existsSync(userDir(userId))) && guard < 5) {
        userId = genUserId();
        guard++;
    }
    if (registry.users.some(u => u.userId === userId) || fs.existsSync(userDir(userId))) {
        return { success: false, error: "Could not allocate a unique profile ID." };
    }
    const cleanProfile = sanitizeProfile(profile);
    const cleanPrefs = sanitizePreferences(preferences);
    const cleanPrivacy = sanitizePrivacy(privacy);

    if (!cleanProfile.name) {
        const userCount = registry.users.length;
        cleanProfile.name = `User ${userCount + 1}`;
    }
    if (!cleanProfile.preferredName) cleanProfile.preferredName = cleanProfile.name;
    if (!cleanProfile.language) cleanProfile.language = "en";
    if (!cleanProfile.avatarColor) cleanProfile.avatarColor = pickAvatarColor(userId);
    if (!cleanProfile.avatarInitials) cleanProfile.avatarInitials = getInitials(cleanProfile.name);

    const role = options.role && ROLES.includes(options.role) ? options.role :
                 (registry.users.filter(u => !u.isGuest).length === 0 ? "admin" : "member");

    const pinHash = options.pin ? hashPin(options.pin) : null;

    const userRecord = {
        userId,
        name: cleanProfile.name,
        isGuest: false,
        role,
        pinHash,
        hasPin: !!pinHash,
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
    };

    try {
        // Persist all per-user data before publishing the account in the
        // registry. A failed write must not leave a selectable half-profile.
        saveUserFile(userId, "profile.json", { ...cleanProfile, userId, version: 2 });
        saveUserFile(userId, "preferences.json", { ...cleanPrefs, userId, version: 2 });
        saveUserFile(userId, "privacy.json", { ...cleanPrivacy, userId, version: 2 });
        saveUserFile(userId, "activity.json", sanitizeActivity({ firstSeenAt: new Date().toISOString() }));

        registry.users.push(userRecord);
        const realUsers = registry.users.filter(u => !u.isGuest);
        if (realUsers.length === 1 && !registry.activeUserId) {
            registry.activeUserId = userId;
        }
        saveRegistry(registry);
    } catch (error) {
        const failedDir = userDir(userId);
        for (const filename of ["profile.json", "preferences.json", "privacy.json", "activity.json"]) {
            try { fs.rmSync(path.join(failedDir, filename), { force: true }); } catch (_) {}
        }
        try { fs.rmdirSync(failedDir); } catch (_) {}
        return { success: false, error: `Could not save the new profile: ${error.message || error}` };
    }

    return { success: true, userId, user: userRecord };
}

function ensureGuest() {
    const registry = loadRegistry();
    let guest = registry.users.find(u => u.isGuest);
    if (guest) return { success: true, userId: guest.userId, user: guest };

    const result = createUser(
        { name: "Guest", preferredName: "Guest", language: "en" },
        { responseStyle: "concise", useNameInResponses: false },
        { memoryEnabled: true, saveConversationMemory: false, saveLearningData: false },
        { role: "guest" }
    );

    const reg = loadRegistry();
    const idx = reg.users.findIndex(u => u.userId === result.userId);
    if (idx >= 0) {
        reg.users[idx].isGuest = true;
        reg.users[idx].role = "guest";
        saveRegistry(reg);
    }

    return result;
}

function getProfile(userId) {
    if (!userId) return null;
    return loadUserFile(userId, "profile.json");
}

function updateProfile(userId, updates) {
    if (!userId || !isValidUserId(userId)) return { success: false, error: "Valid userId required" };
    if (!updates || typeof updates !== "object" || Array.isArray(updates)) return { success: false, error: "Profile updates must be an object" };
    const existing = getProfile(userId);
    if (!existing) return { success: false, error: "User profile not found" };
    const sanitized = sanitizeProfile(updates);
    if (Object.prototype.hasOwnProperty.call(updates, "name") && !sanitized.name) return { success: false, error: "Name cannot be empty" };
    const merged = { ...mergeSanitizedPatch(existing, updates, sanitized), userId, version: (existing.version || 1) + 1 };
    saveUserFile(userId, "profile.json", merged);

    // Update name in registry if changed
    if (updates && updates.name) {
        const registry = loadRegistry();
        const idx = registry.users.findIndex(u => u.userId === userId);
        if (idx >= 0) {
            registry.users[idx].name = sanitizeString(updates.name, 100);
            saveRegistry(registry);
        }
    }
    return { success: true, profile: merged };
}

function getPreferences(userId) {
    if (!userId) return null;
    return loadUserFile(userId, "preferences.json");
}

function updatePreferences(userId, updates) {
    if (!userId || !isValidUserId(userId)) return { success: false, error: "Valid userId required" };
    if (!updates || typeof updates !== "object" || Array.isArray(updates)) return { success: false, error: "Preference updates must be an object" };
    const existing = getPreferences(userId);
    if (!existing) return { success: false, error: "User preferences not found" };
    const merged = { ...mergeSanitizedPatch(existing, updates, sanitizePreferences(updates)), userId, version: (existing.version || 1) + 1 };
    saveUserFile(userId, "preferences.json", merged);
    return { success: true, preferences: merged };
}

function getPrivacy(userId) {
    if (!userId) return null;
    return loadUserFile(userId, "privacy.json");
}

function updatePrivacy(userId, updates) {
    if (!userId || !isValidUserId(userId)) return { success: false, error: "Valid userId required" };
    if (!updates || typeof updates !== "object" || Array.isArray(updates)) return { success: false, error: "Privacy updates must be an object" };
    const existing = getPrivacy(userId);
    if (!existing) return { success: false, error: "User privacy settings not found" };
    const merged = { ...mergeSanitizedPatch(existing, updates, sanitizePrivacy(updates)), userId, version: (existing.version || 1) + 1 };
    saveUserFile(userId, "privacy.json", merged);
    return { success: true, privacy: merged };
}

// ============================================================
// ACTIVITY TRACKING
// ============================================================

function getActivity(userId) {
    if (!userId) return null;
    return loadUserFile(userId, "activity.json") || sanitizeActivity({});
}

function recordLogin(userId) {
    if (!userId || !isValidUserId(userId)) return;
    const activity = getActivity(userId) || {};
    activity.loginCount = (activity.loginCount || 0) + 1;
    activity.lastLoginAt = new Date().toISOString();
    activity.lastSeenAt = new Date().toISOString();
    activity.sessionsCount = (activity.sessionsCount || 0) + 1;
    saveUserFile(userId, "activity.json", sanitizeActivity(activity));
}

function recordMessage(userId) {
    if (!userId || !isValidUserId(userId)) return;
    const activity = getActivity(userId) || {};
    activity.messageCount = (activity.messageCount || 0) + 1;
    activity.lastSeenAt = new Date().toISOString();
    saveUserFile(userId, "activity.json", sanitizeActivity(activity));
}

function recordVoiceCommand(userId) {
    if (!userId || !isValidUserId(userId)) return;
    const activity = getActivity(userId) || {};
    activity.voiceCommandCount = (activity.voiceCommandCount || 0) + 1;
    activity.lastSeenAt = new Date().toISOString();
    saveUserFile(userId, "activity.json", sanitizeActivity(activity));
}

function recordCommand(userId) {
    if (!userId || !isValidUserId(userId)) return;
    const activity = getActivity(userId) || {};
    activity.commandsExecuted = (activity.commandsExecuted || 0) + 1;
    activity.lastSeenAt = new Date().toISOString();
    saveUserFile(userId, "activity.json", sanitizeActivity(activity));
}

function touchUser(userId) {
    if (!userId || !isValidUserId(userId)) return;
    const activity = getActivity(userId) || {};
    activity.lastSeenAt = new Date().toISOString();
    saveUserFile(userId, "activity.json", sanitizeActivity(activity));

    // Also update registry lastActiveAt
    const registry = loadRegistry();
    const idx = registry.users.findIndex(u => u.userId === userId);
    if (idx >= 0) {
        registry.users[idx].lastActiveAt = new Date().toISOString();
        saveRegistry(registry);
    }
}

function getStorageUsage(userId) {
    if (!userId || !isValidUserId(userId)) return 0;
    return dirSize(userDir(userId));
}

// ============================================================
// PIN AUTHENTICATION
// ============================================================

function setPin(userId, pin) {
    if (!userId || !isValidUserId(userId)) return { success: false, error: "Invalid userId" };
    if (!pin || String(pin).length < 4) return { success: false, error: "PIN must be at least 4 characters" };
    const pinHash = hashPin(pin);
    const registry = loadRegistry();
    const idx = registry.users.findIndex(u => u.userId === userId);
    if (idx < 0) return { success: false, error: "User not found" };
    registry.users[idx].pinHash = pinHash;
    registry.users[idx].hasPin = true;
    saveRegistry(registry);
    return { success: true };
}

function updatePin(userId, oldPin, newPin) {
    if (!userId || !isValidUserId(userId)) return { success: false, error: "Invalid userId" };
    const registry = loadRegistry();
    const user = registry.users.find(u => u.userId === userId);
    if (!user) return { success: false, error: "User not found" };
    if (user.pinHash && !verifyPin(oldPin, user.pinHash)) {
        return { success: false, error: "Current PIN is incorrect" };
    }
    return setPin(userId, newPin);
}

function removePin(userId, pin) {
    if (!userId || !isValidUserId(userId)) return { success: false, error: "Invalid userId" };
    const registry = loadRegistry();
    const user = registry.users.find(u => u.userId === userId);
    if (!user) return { success: false, error: "User not found" };
    if (!user.pinHash) return { success: false, error: "No PIN set" };
    if (!verifyPin(pin, user.pinHash)) return { success: false, error: "PIN is incorrect" };
    const idx = registry.users.findIndex(u => u.userId === userId);
    registry.users[idx].pinHash = null;
    registry.users[idx].hasPin = false;
    saveRegistry(registry);
    return { success: true };
}

function verifyUserPin(userId, pin) {
    if (!userId || !isValidUserId(userId)) return { success: false, error: "Invalid userId" };
    const registry = loadRegistry();
    const user = registry.users.find(u => u.userId === userId);
    if (!user) return { success: false, error: "User not found" };
    if (user.isGuest) return { success: true, message: "Guest users do not need PIN" };
    if (!user.pinHash) return { success: true, message: "No PIN set" };
    if (!verifyPin(pin, user.pinHash)) return { success: false, error: "Incorrect PIN" };
    return { success: true };
}

function hasPin(userId) {
    if (!userId || !isValidUserId(userId)) return false;
    const registry = loadRegistry();
    const user = registry.users.find(u => u.userId === userId);
    return !!(user && user.pinHash);
}

// ============================================================
// SESSION MANAGEMENT
// ============================================================

function createSession(userId, options = {}) {
    if (!userId || !isValidUserId(userId)) return null;
    const session = {
        userId,
        sessionId: crypto.randomBytes(8).toString("hex"),
        startedAt: Date.now(),
        lastActivity: Date.now(),
        timeoutMs: options.timeoutMs || (30 * 60 * 1000), // 30 min default
        locked: false,
    };
    sessions.set(userId, session);
    return session;
}

function getSession(userId) {
    return sessions.get(userId) || null;
}

function touchSession(userId) {
    const session = sessions.get(userId);
    if (session && !isSessionLocked(userId)) {
        session.lastActivity = Date.now();
    }
}

function isSessionLocked(userId) {
    const session = sessions.get(userId);
    if (!session) return false;
    if (session.locked) return true;
    // Auto-lock check
    const elapsed = Date.now() - session.lastActivity;
    if (elapsed > session.timeoutMs) {
        session.locked = true;
        return true;
    }
    return false;
}

function lockSession(userId) {
    const session = sessions.get(userId);
    if (session) session.locked = true;
}

function unlockSession(userId, pin) {
    const session = sessions.get(userId);
    if (!session) return { success: false, error: "No active session" };
    const result = verifyUserPin(userId, pin);
    if (result.success) {
        session.locked = false;
        session.lastActivity = Date.now();
    }
    return result;
}

function destroySession(userId) {
    const session = sessions.get(userId);
    if (session) {
        const duration = Math.round((Date.now() - session.startedAt) / 60000);
        if (duration > 0) {
            const activity = getActivity(userId) || {};
            activity.totalSessionMinutes = (activity.totalSessionMinutes || 0) + duration;
            saveUserFile(userId, "activity.json", sanitizeActivity(activity));
        }
        sessions.delete(userId);
    }
}

// ============================================================
// LIST USERS (with activity + storage)
// ============================================================

function listUsers() {
    const registry = loadRegistry();
    return registry.users.map(u => {
        const { pinHash, ...publicUser } = u;
        const activity = getActivity(u.userId) || {};
        const storageBytes = dirSize(userDir(u.userId));
        return {
            ...publicUser,
            isActive: u.userId === registry.activeUserId,
            role: u.role || (u.isGuest ? "guest" : "member"),
            hasPin: !!u.pinHash,
            avatarColor: u.avatarColor || pickAvatarColor(u.userId),
            avatarInitials: getInitials(u.name),
            activity: {
                loginCount: activity.loginCount || 0,
                lastLoginAt: activity.lastLoginAt,
                lastSeenAt: activity.lastSeenAt,
                messageCount: activity.messageCount || 0,
                voiceCommandCount: activity.voiceCommandCount || 0,
            },
            storageBytes,
            storageFormatted: formatBytes(storageBytes),
        };
    });
}

function getActiveUserId() {
    return loadRegistry().activeUserId;
}

function getActiveUser() {
    const registry = loadRegistry();
    if (!registry.activeUserId) return null;
    const user = registry.users.find(u => u.userId === registry.activeUserId);
    if (!user) return null;
    const { pinHash, ...publicUser } = user;
    return { ...publicUser, hasPin: !!pinHash };
}

// ============================================================
// SWITCH USER (with PIN check + session)
// ============================================================

function switchUser(userId, pin) {
    const registry = loadRegistry();
    const user = registry.users.find(u => u.userId === userId);
    if (!user) return { success: false, error: "User not found" };

    // PIN verification
    if (user.pinHash && !user.isGuest) {
        if (!pin) return { success: false, error: "PIN required", requiresPin: true };
        if (!verifyPin(pin, user.pinHash)) {
            return { success: false, error: "Incorrect PIN", requiresPin: true };
        }
    }

    const oldActive = registry.activeUserId;

    // Destroy old session
    if (oldActive) destroySession(oldActive);

    registry.activeUserId = userId;
    user.lastActiveAt = new Date().toISOString();
    saveRegistry(registry);

    // Create new session + record login
    createSession(userId);
    if (!user.isGuest) recordLogin(userId);

    const { pinHash, ...publicUser } = user;
    return { success: true, user: { ...publicUser, hasPin: !!pinHash }, previousUserId: oldActive };
}

// ============================================================
// DELETE USER (with permission check)
// ============================================================

function deleteUser(userId, confirm = false, requestingUserId) {
    if (!confirm) return { success: false, error: "Confirmation required" };

    const registry = loadRegistry();
    const idx = registry.users.findIndex(u => u.userId === userId);
    if (idx < 0) return { success: false, error: "User not found" };

    const user = registry.users[idx];
    if (user.isGuest) return { success: false, error: "Cannot delete guest user" };

    // Permission check (if requestingUserId provided)
    if (requestingUserId && requestingUserId !== userId && !isAdmin(requestingUserId)) {
        return { success: false, error: "Only admins can delete other users" };
    }

    // Don't allow deleting the last admin
    if (user.role === "admin") {
        const adminCount = registry.users.filter(u => u.role === "admin").length;
        if (adminCount <= 1) return { success: false, error: "Cannot delete the last admin" };
    }

    // Destroy session
    destroySession(userId);

    try {
        const dir = userDir(userId);
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) {
        console.warn("[UserManager] Error deleting user dir:", e.message);
    }

    registry.users.splice(idx, 1);

    if (registry.activeUserId === userId) {
        const guest = ensureGuest();
        registry.activeUserId = guest.userId;
    }

    saveRegistry(registry);
    return { success: true, deletedUserId: userId };
}

// ============================================================
// EXPORT / IMPORT (with guest restriction)
// ============================================================

function exportUser(userId, requestingUserId) {
    // Guest restriction
    if (requestingUserId && isGuest(requestingUserId)) {
        const check = checkGuestRestriction(requestingUserId, "export");
        if (!check.allowed) return { success: false, error: check.reason };
    }

    const profile = getProfile(userId);
    const preferences = getPreferences(userId);
    const privacy = getPrivacy(userId);
    const activity = getActivity(userId);
    if (!profile) return { success: false, error: "User not found" };

    const registry = loadRegistry();
    const userMeta = registry.users.find(u => u.userId === userId);

    return {
        success: true,
        export: {
            version: 2,
            exportedAt: new Date().toISOString(),
            user: {
                name: userMeta?.name || profile.name,
                role: userMeta?.role || "member",
                profile,
                preferences,
                privacy,
                activity: activity ? {
                    loginCount: activity.loginCount,
                    messageCount: activity.messageCount,
                    voiceCommandCount: activity.voiceCommandCount,
                } : null,
            },
        },
    };
}

function importUser(data, options = {}) {
    if (!data || !data.user || !data.user.profile) {
        return { success: false, error: "Invalid import format" };
    }

    const { profile, preferences, privacy } = data.user;

    if (profile.name && /[.]{2,}|[\\\/]/.test(profile.name)) {
        return { success: false, error: "Invalid characters in profile name" };
    }

    const result = createUser(profile, preferences, privacy, {
        role: options.role,
        pin: options.pin,
    });
    return result;
}

// ============================================================
// MERGE USERS
// ============================================================

function mergeUsers(sourceUserId, targetUserId, requestingUserId) {
    if (!sourceUserId || !targetUserId) return { success: false, error: "Both source and target userId required" };
    if (sourceUserId === targetUserId) return { success: false, error: "Cannot merge a user with itself" };

    // Permission check
    if (requestingUserId && !isAdmin(requestingUserId)) {
        return { success: false, error: "Only admins can merge users" };
    }

    const sourceProfile = getProfile(sourceUserId);
    const targetProfile = getProfile(targetUserId);
    if (!sourceProfile || !targetProfile) return { success: false, error: "Source or target user not found" };

    // Merge profile (target takes precedence, source fills gaps)
    const mergedProfile = { ...sourceProfile, ...targetProfile, userId: targetUserId };
    // But keep interests/hobbies combined
    mergedProfile.interests = [...new Set([...(sourceProfile.interests || []), ...(targetProfile.interests || [])])];
    mergedProfile.hobbies = [...new Set([...(sourceProfile.hobbies || []), ...(targetProfile.hobbies || [])])];
    saveUserFile(targetUserId, "profile.json", mergedProfile);

    // Merge preferences (target takes precedence)
    const sourcePrefs = getPreferences(sourceUserId) || {};
    const targetPrefs = getPreferences(targetUserId) || {};
    const mergedPrefs = { ...sourcePrefs, ...targetPrefs, userId: targetUserId };
    mergedPrefs.personality = [...new Set([...(sourcePrefs.personality || []), ...(targetPrefs.personality || [])])];
    saveUserFile(targetUserId, "preferences.json", mergedPrefs);

    // Merge activity (sum counts)
    const sourceActivity = getActivity(sourceUserId) || {};
    const targetActivity = getActivity(targetUserId) || {};
    const mergedActivity = {
        loginCount: (sourceActivity.loginCount || 0) + (targetActivity.loginCount || 0),
        lastLoginAt: targetActivity.lastLoginAt || sourceActivity.lastLoginAt,
        lastSeenAt: new Date().toISOString(),
        messageCount: (sourceActivity.messageCount || 0) + (targetActivity.messageCount || 0),
        voiceCommandCount: (sourceActivity.voiceCommandCount || 0) + (targetActivity.voiceCommandCount || 0),
        commandsExecuted: (sourceActivity.commandsExecuted || 0) + (targetActivity.commandsExecuted || 0),
        firstSeenAt: sourceActivity.firstSeenAt || targetActivity.firstSeenAt,
        sessionsCount: (sourceActivity.sessionsCount || 0) + (targetActivity.sessionsCount || 0),
        totalSessionMinutes: (sourceActivity.totalSessionMinutes || 0) + (targetActivity.totalSessionMinutes || 0),
    };
    saveUserFile(targetUserId, "activity.json", sanitizeActivity(mergedActivity));

    // Merge memory.json (append source facts to target)
    try {
        const sourceMemPath = path.join(userDir(sourceUserId), "memory.json");
        const targetMemPath = path.join(userDir(targetUserId), "memory.json");
        if (fs.existsSync(sourceMemPath)) {
            const sourceMem = JSON.parse(fs.readFileSync(sourceMemPath, "utf8"));
            let targetMem = {};
            if (fs.existsSync(targetMemPath)) {
                targetMem = JSON.parse(fs.readFileSync(targetMemPath, "utf8"));
            }
            // Merge facts arrays
            const sourceFacts = sourceMem.facts || sourceMem.records || [];
            const targetFacts = targetMem.facts || targetMem.records || [];
            const mergedFacts = [...targetFacts, ...sourceFacts];
            if (targetMem.facts) targetMem.facts = mergedFacts;
            else if (targetMem.records) targetMem.records = mergedFacts;
            else targetMem.facts = mergedFacts;
            fs.writeFileSync(targetMemPath, JSON.stringify(targetMem, null, 2));
        }
    } catch (e) {
        console.warn("[UserManager] Memory merge error:", e.message);
    }

    // Delete source user
    try {
        const dir = userDir(sourceUserId);
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    } catch (_) {}

    const registry = loadRegistry();
    const idx = registry.users.findIndex(u => u.userId === sourceUserId);
    if (idx >= 0) registry.users.splice(idx, 1);
    if (registry.activeUserId === sourceUserId) registry.activeUserId = targetUserId;
    saveRegistry(registry);

    destroySession(sourceUserId);

    return { success: true, mergedInto: targetUserId, deletedSource: sourceUserId };
}

// ============================================================
// ROLE MANAGEMENT
// ============================================================

function setRole(userId, role, requestingUserId) {
    if (!ROLES.includes(role)) return { success: false, error: "Invalid role" };
    if (!userId || !isValidUserId(userId)) return { success: false, error: "Invalid userId" };

    // Permission check
    if (requestingUserId && !isAdmin(requestingUserId)) {
        return { success: false, error: "Only admins can change roles" };
    }

    const registry = loadRegistry();
    const idx = registry.users.findIndex(u => u.userId === userId);
    if (idx < 0) return { success: false, error: "User not found" };

    // Don't demote the last admin
    if (registry.users[idx].role === "admin" && role !== "admin") {
        const adminCount = registry.users.filter(u => u.role === "admin").length;
        if (adminCount <= 1) return { success: false, error: "Cannot demote the last admin" };
    }

    registry.users[idx].role = role;
    registry.users[idx].isGuest = (role === "guest");
    saveRegistry(registry);
    return { success: true, role };
}

// ============================================================
// GET FULL USER CONTEXT (for Brain)
// ============================================================

function getUserContext(userId) {
    if (!userId) return null;
    const profile = getProfile(userId) || {};
    const preferences = getPreferences(userId) || {};
    const privacy = getPrivacy(userId) || {};
    const activity = getActivity(userId) || {};
    const role = getRole(userId);

    return {
        userId,
        role,
        profile,
        preferences,
        privacy,
        activity: {
            loginCount: activity.loginCount || 0,
            messageCount: activity.messageCount || 0,
            lastSeenAt: activity.lastSeenAt,
        },
        memoryPath: path.join(userDir(userId), "memory.json"),
        avatar: {
            initials: profile.avatarInitials || getInitials(profile.name),
            color: profile.avatarColor || pickAvatarColor(userId),
        },
        personality: {
            tone: preferences.personalityTone || "balanced",
            formality: preferences.formality || "neutral",
            humor: preferences.humor || "moderate",
            technicalDepth: preferences.technicalDepth || "medium",
            responseStyle: preferences.responseStyle || "balanced",
            responseLength: preferences.responseLength || "medium",
            useName: preferences.useNameInResponses !== false,
        },
        restrictions: role === "guest" ? GUEST_RESTRICTIONS : null,
    };
}

// ============================================================
// BACKWARD COMPATIBILITY — migrate legacy memory
// ============================================================

function migrateLegacyMemory() {
    const registry = loadRegistry();
    if (registry.users.length > 0) return { migrated: false, reason: "users_exist" };
    if (!fs.existsSync(LEGACY_MEMORY)) return { migrated: false, reason: "no_legacy" };

    try {
        const result = createUser({
            name: "Default User",
            preferredName: "Default User",
            language: "en",
        });

        const newUserMemoryPath = path.join(userDir(result.userId), "memory.json");
        fs.copyFileSync(LEGACY_MEMORY, newUserMemoryPath);
        fs.renameSync(LEGACY_MEMORY, LEGACY_MEMORY + ".migrated-" + Date.now() + ".bak");

        return { migrated: true, userId: result.userId };
    } catch (error) {
        console.warn("[UserManager] Legacy migration error:", error.message);
        return { migrated: false, reason: "error", error: error.message };
    }
}

// ============================================================
// INITIALIZE
// ============================================================

function initialize() {
    ensureDirs();
    migrateLegacyMemory();
    ensureGuest();

    const registry = loadRegistry();
    if (!registry.activeUserId) {
        const firstReal = registry.users.find(u => !u.isGuest);
        if (firstReal) {
            registry.activeUserId = firstReal.userId;
        } else {
            const guest = registry.users.find(u => u.isGuest);
            if (guest) registry.activeUserId = guest.userId;
        }
        saveRegistry(registry);
    }

    // Create session for active user
    if (registry.activeUserId && !getSession(registry.activeUserId)) {
        createSession(registry.activeUserId);
        if (hasPin(registry.activeUserId)) lockSession(registry.activeUserId);
    }

    return {
        activeUserId: registry.activeUserId,
        userCount: registry.users.length,
    };
}

// ============================================================
// VALIDATE USER ID
// ============================================================

function isValidUserId(userId) {
    if (!userId || typeof userId !== "string") return false;
    return /^u_[a-z0-9]+_[a-f0-9]+$/.test(userId) || userId === "guest";
}

// ============================================================
// MODULE EXPORTS
// ============================================================

module.exports = {
    // Core CRUD
    configureDataDirectory,
    initialize,
    createUser,
    ensureGuest,
    getProfile,
    updateProfile,
    getPreferences,
    updatePreferences,
    getPrivacy,
    updatePrivacy,
    listUsers,
    getActiveUserId,
    getActiveUser,
    switchUser,
    deleteUser,
    exportUser,
    importUser,
    getUserContext,
    isValidUserId,
    userDir,
    migrateLegacyMemory,

    // NEW: PIN Authentication
    setPin,
    updatePin,
    removePin,
    verifyUserPin,
    hasPin,

    // NEW: Roles & Permissions
    getRole,
    setRole,
    hasPermission,
    isAdmin,
    isGuest,
    checkGuestRestriction,
    GUEST_RESTRICTIONS,

    // NEW: Activity Tracking
    getActivity,
    recordLogin,
    recordMessage,
    recordVoiceCommand,
    recordCommand,
    touchUser,
    getStorageUsage,
    formatBytes,

    // NEW: Session Management
    createSession,
    getSession,
    touchSession,
    isSessionLocked,
    lockSession,
    unlockSession,
    destroySession,

    // NEW: Merge
    mergeUsers,

    // NEW: Avatars
    getInitials,
    pickAvatarColor,
    AVATAR_COLORS,

    // Constants
    ROLES,
};
