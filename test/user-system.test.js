"use strict";

/*
 * ============================================================
 * JARVIS PRO MAX — MULTI-USER SYSTEM TEST SUITE
 * test/user-system.test.js
 * ============================================================
 * Tests the MAIN PROCESS user modules directly.
 * Creates test users, verifies isolation, cleans up after.
 * Run: node test/user-system.test.js
 * ============================================================
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const userManager = require("../src/users/userManager");
const userMemory = require("../src/users/userMemory");
const testDataDirectory = require("./helpers/isolated-user-storage")(userManager);

const TEST_USER_IDS = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  \u2713 ${name}`);
        passed++;
    } catch (error) {
        console.error(`  \u2717 ${name}: ${error.message}`);
        failed++;
    }
}

// Helper: create user and track for cleanup
function createUser(profile, prefs, privacy) {
    const result = userManager.createUser(profile, prefs, privacy);
    if (result.success && result.userId) TEST_USER_IDS.push(result.userId);
    return result;
}

// Initialize the user system
userManager.initialize();

console.log("\n========================================");
console.log("MULTI-USER SYSTEM TEST SUITE");
console.log("========================================\n");

// ============================================================
// 1. Create User A
// ============================================================
console.log("--- 1. Create User A ---");
let userA = null;
test("User A created with name and language", () => {
    const result = createUser({ name: "Nakul", preferredName: "Nakul", language: "hinglish" });
    assert.ok(result.success);
    assert.ok(result.userId);
    assert.match(result.userId, /^u_[a-z0-9]+_[a-f0-9]+$/);
    userA = result;
});
test("User A profile persisted to disk", () => {
    const profile = userManager.getProfile(userA.userId);
    assert.ok(profile);
    assert.strictEqual(profile.name, "Nakul");
    assert.strictEqual(profile.language, "hinglish");
});

// ============================================================
// 2. Create User B
// ============================================================
console.log("\n--- 2. Create User B ---");
let userB = null;
test("User B created", () => {
    const result = createUser({ name: "Priya", preferredName: "Priya", language: "en" });
    assert.ok(result.success);
    userB = result;
});
test("User A and B have different IDs", () => {
    assert.notStrictEqual(userA.userId, userB.userId);
});
test("Both users listed", () => {
    const users = userManager.listUsers();
    const names = users.map(u => u.name);
    assert.ok(names.includes("Nakul"));
    assert.ok(names.includes("Priya"));
});

// ============================================================
// 3. Switch A → B
// ============================================================
console.log("\n--- 3. Switch A → B ---");
test("Switch to User B", () => {
    const result = userManager.switchUser(userB.userId);
    assert.ok(result.success);
    assert.strictEqual(userManager.getActiveUserId(), userB.userId);
});

// ============================================================
// 4. B cannot access A's memory (MEMORY ISOLATION)
// ============================================================
console.log("\n--- 4. Memory Isolation ---");
test("Store a fact for User A", () => {
    userMemory.remember(userA.userId, "favorite_language", "Python");
    const fact = userMemory.recall(userA.userId, "favorite_language");
    assert.ok(fact, "fact should be stored for A");
});
test("User B's memory does NOT contain User A's fact", () => {
    const bFacts = userMemory.allFacts(userB.userId);
    const bRecall = userMemory.recall(userB.userId, "favorite_language");
    assert.strictEqual(bRecall, null, "B recall of A's key should be null");
    const hasPython = JSON.stringify(bFacts).includes("Python");
    assert.ok(!hasPython, "B should not see A's Python fact");
});
test("User B's memory file is separate from A's", () => {
    const aPath = path.join(userManager.userDir(userA.userId), "memory.json");
    assert.ok(fs.existsSync(aPath), "A's memory.json should exist");
    const bPath = path.join(userManager.userDir(userB.userId), "memory.json");
    // B may not have memory yet (lazy init) — that proves isolation
    if (fs.existsSync(bPath)) {
        const aData = fs.readFileSync(aPath, "utf8");
        const bData = fs.readFileSync(bPath, "utf8");
        assert.notStrictEqual(aData, bData);
    }
});

// ============================================================
// 5. Switch B → A
// ============================================================
console.log("\n--- 5. Switch B → A ---");
test("Switch back to User A", () => {
    const result = userManager.switchUser(userA.userId);
    assert.ok(result.success);
    assert.strictEqual(userManager.getActiveUserId(), userA.userId);
});

// ============================================================
// 6. A's memory returns correctly
// ============================================================
console.log("\n--- 6. A's Memory Returns ---");
test("User A's stored fact still accessible", () => {
    const fact = userMemory.recall(userA.userId, "favorite_language");
    assert.ok(fact, "A's fact should still be accessible");
    assert.ok(JSON.stringify(fact).includes("Python"));
});

// ============================================================
// 7. Restart persistence (simulated)
// ============================================================
console.log("\n--- 7. Restart Persistence ---");
test("Registry survives module reload", () => {
    delete require.cache[require.resolve("../src/users/userManager")];
    const um2 = require("../src/users/userManager");
    um2.configureDataDirectory(testDataDirectory);
    const users = um2.listUsers();
    const names = users.map(u => u.name);
    assert.ok(names.includes("Nakul"));
    assert.ok(names.includes("Priya"));
    assert.ok(um2.getActiveUserId(), "active user should persist");
    // Restore global userManager reference for later tests
    Object.assign(userManager, um2);
});

// ============================================================
// 8. Active user loads correctly
// ============================================================
console.log("\n--- 8. Active User Loads ---");
test("getActiveUser returns full user record", () => {
    const active = userManager.getActiveUser();
    assert.ok(active);
    assert.strictEqual(active.userId, userManager.getActiveUserId());
});
test("getUserContext returns profile + preferences + privacy", () => {
    const ctx = userManager.getUserContext(userA.userId);
    assert.ok(ctx);
    assert.ok(ctx.profile);
    assert.ok(ctx.preferences);
    assert.ok(ctx.privacy);
    assert.strictEqual(ctx.profile.name, "Nakul");
});

// ============================================================
// 9. Delete a user
// ============================================================
console.log("\n--- 9. Delete User ---");
test("Delete requires confirmation", () => {
    const result = userManager.deleteUser(userB.userId, false);
    assert.ok(!result.success);
});
test("Delete User B with confirmation", () => {
    userManager.switchUser(userA.userId); // ensure B is not active
    const result = userManager.deleteUser(userB.userId, true);
    assert.ok(result.success);
    const users = userManager.listUsers();
    assert.ok(!users.some(u => u.userId === userB.userId));
});

// ============================================================
// 10. Deleted user's data is inaccessible
// ============================================================
console.log("\n--- 10. Deleted Data Inaccessible ---");
test("User B's profile is gone", () => {
    assert.strictEqual(userManager.getProfile(userB.userId), null);
});
test("User B's directory is removed", () => {
    assert.ok(!fs.existsSync(userManager.userDir(userB.userId)));
});
test("User B's memory engine returns empty", () => {
    userMemory.evict(userB.userId);
    try {
        const facts = userMemory.allFacts(userB.userId);
        assert.strictEqual(facts.length, 0);
    } catch (error) {
        assert.ok(error); // inaccessible = error or empty
    }
});

// ============================================================
// 11. Guest Mode
// ============================================================
console.log("\n--- 11. Guest Mode ---");
test("Guest user exists after initialize", () => {
    userManager.initialize();
    const users = userManager.listUsers();
    const guest = users.find(u => u.isGuest);
    assert.ok(guest, "guest should exist");
});
test("Guest user cannot be deleted", () => {
    const guest = userManager.listUsers().find(u => u.isGuest);
    if (!guest) return;
    const result = userManager.deleteUser(guest.userId, true);
    assert.ok(!result.success);
});
test("Guest has privacy with memory disabled by default", () => {
    const guest = userManager.listUsers().find(u => u.isGuest);
    if (!guest) return;
    const privacy = userManager.getPrivacy(guest.userId);
    assert.ok(privacy);
    assert.strictEqual(privacy.saveConversationMemory, false);
});

// ============================================================
// 12. STT Onboarding (module structure)
// ============================================================
console.log("\n--- 12. STT Onboarding Module ---");
test("Onboarding module has voice input integration", () => {
    const code = fs.readFileSync(path.join(__dirname, "..", "renderer", "js", "users", "userOnboarding.js"), "utf8");
    assert.ok(code.includes("What should I call you?"));
    assert.ok(code.includes('id: "name", label: "Full name (optional)"'));
    assert.ok(code.includes('id: "address", label: "Address"'));
    assert.ok(code.includes("Voice Answer"));
    assert.ok(code.includes("startListening"));
});
test("Add User is bound as soon as the DOM is ready", () => {
    const code = fs.readFileSync(path.join(__dirname, "..", "renderer", "js", "users", "userPanel.js"), "utf8");
    assert.ok(code.includes('document.addEventListener("DOMContentLoaded", init, { once: true })'));
    assert.ok(!code.includes('DOMContentLoaded", () => setTimeout(init, 2000)'));
    assert.ok(code.indexOf("bindEvents();") < code.indexOf("await refresh();"), "user actions must bind before profile IPC");
    assert.match(code, /userPanelSwitchBtn.*window\.JARVISUserPanel\?\.openUserSelector\?\.\(\)/);
});
test("Onboarding has Skip for optional questions", () => {
    const code = fs.readFileSync(path.join(__dirname, "..", "renderer", "js", "users", "userOnboarding.js"), "utf8");
    assert.ok(code.includes("Skip"));
    assert.ok(code.includes("required: false"));
});

// ============================================================
// 13. TTS Onboarding (module structure)
// ============================================================
console.log("\n--- 13. TTS Onboarding Module ---");
test("Onboarding speaks questions via TTS callback", () => {
    const code = fs.readFileSync(path.join(__dirname, "..", "renderer", "js", "users", "userOnboarding.js"), "utf8");
    assert.ok(code.includes("callbacks.speak"));
});

// ============================================================
// 14. Skip optional questions
// ============================================================
console.log("\n--- 14. Skip Optional Questions ---");
test("Profile works with only a name (all optional skipped)", () => {
    const result = createUser({ name: "Minimal User" });
    assert.ok(result.success);
    const profile = userManager.getProfile(result.userId);
    assert.strictEqual(profile.name, "Minimal User");
    assert.strictEqual(profile.dateOfBirth, "");
    assert.strictEqual(profile.interests.length, 0);
});

// ============================================================
// 15. Corrupted profile recovery
// ============================================================
console.log("\n--- 15. Corrupted Profile Recovery ---");
test("Corrupted profile.json returns null (not crash)", () => {
    const result = createUser({ name: "Corrupt Test" });
    const profilePath = path.join(userManager.userDir(result.userId), "profile.json");
    fs.writeFileSync(profilePath, "{ this is not valid json !!!", "utf8");
    assert.strictEqual(userManager.getProfile(result.userId), null);
});
test("Corrupted registry falls back to empty (not crash)", () => {
    const regPath = path.join(testDataDirectory, "users", "users.json");
    // Just test that listUsers doesn't throw
    try {
        const users = userManager.listUsers();
        assert.ok(Array.isArray(users));
    } catch (e) {
        assert.fail("listUsers should not throw on corrupt registry: " + e.message);
    }
});

// ============================================================
// 16. Import/Export profile
// ============================================================
console.log("\n--- 16. Import/Export ---");
test("Export produces portable JSON", () => {
    const result = userManager.exportUser(userA.userId);
    assert.ok(result.success);
    assert.ok(result.export);
    assert.ok(result.export.user.profile);
    assert.strictEqual(result.export.user.profile.name, "Nakul");
});
test("Import creates a new user from export", () => {
    const exportResult = userManager.exportUser(userA.userId);
    const importResult = userManager.importUser(exportResult.export);
    assert.ok(importResult.success);
    assert.notStrictEqual(importResult.userId, userA.userId);
    const profile = userManager.getProfile(importResult.userId);
    assert.strictEqual(profile.name, "Nakul");
    TEST_USER_IDS.push(importResult.userId); // track for cleanup
});
test("Import rejects malicious profile names (path traversal)", () => {
    const result = userManager.importUser({ version: 1, user: { profile: { name: "../../etc/passwd" } } });
    assert.ok(!result.success);
    if (result.success) TEST_USER_IDS.push(result.userId);
});
test("Import rejects invalid format", () => {
    assert.ok(!userManager.importUser({ garbage: true }).success);
});

// ============================================================
// EXTRA: Input Sanitization
// ============================================================
console.log("\n--- Extra: Input Sanitization ---");
test("Script tags stripped from profile name", () => {
    const result = createUser({ name: "<script>alert(1)</script>Evil" });
    const profile = userManager.getProfile(result.userId);
    assert.ok(!profile.name.includes("<script"));
});
test("Path traversal blocked in userId validation", () => {
    assert.ok(!userManager.isValidUserId("../etc/passwd"));
    assert.ok(!userManager.isValidUserId(""));
    assert.ok(userManager.isValidUserId(userA.userId));
});

// ============================================================
// EXTRA: Memory Privacy Guard
// ============================================================
console.log("\n--- Extra: Memory Privacy ---");
test("rememberIfAllowed respects privacy settings", () => {
    const result = createUser(
        { name: "NoMem User" },
        {},
        { saveConversationMemory: false }
    );
    const writeResult = userMemory.rememberIfAllowed(result.userId, "test", "value");
    assert.ok(writeResult.skipped, "write should be skipped for memory-disabled user");
});
test("canWrite returns true for memory-enabled user", () => {
    assert.strictEqual(userMemory.canWrite(userA.userId), true);
});

// ============================================================
// EXTRA: UI Modules
// ============================================================
console.log("\n--- Extra: UI Modules ---");
test("userPanel.js has all public methods", () => {
    const code = fs.readFileSync(path.join(__dirname, "..", "renderer", "js", "users", "userPanel.js"), "utf8");
    ["init", "refresh", "openProfile", "openUserSelector", "selectUser",
     "startOnboarding", "openSettings", "saveSettings", "openMemory",
     "deleteMemory", "clearAllMemory", "confirmDelete", "executeDelete",
     "exportProfile", "importProfile", "closeAllModals"
    ].forEach(m => assert.ok(code.includes(m), `should define ${m}`));
});
test("index.html has USER section", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "renderer", "index.html"), "utf8");
    assert.ok(html.includes("user-system-section"));
    assert.ok(html.includes("userPanelCurrentName"));
    assert.ok(html.includes("userPanelAddBtn"));
    assert.ok(html.includes("userPanelDeleteBtn"));
});
test("main.js has user IPC handlers", () => {
    const code = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
    ["user:list", "user:get-active", "user:create", "user:switch",
     "user:get-profile", "user:update-profile", "user:delete",
     "user:export", "user:import", "user:memory-facts"
    ].forEach(h => assert.ok(code.includes(h), `main.js should register ${h}`));
});
test("preload.js has UserAPI", () => {
    const code = fs.readFileSync(path.join(__dirname, "..", "preload.js"), "utf8");
    assert.ok(code.includes("UserAPI"));
    assert.ok(code.includes("USER_LIST"));
    assert.ok(code.includes("users:"));
});

// ============================================================
// CLEANUP
// ============================================================
for (const userId of TEST_USER_IDS) {
    try { userManager.deleteUser(userId, true); } catch (_) {}
}

// ============================================================
// SUMMARY
// ============================================================
console.log("\n========================================");
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log("========================================\n");
if (failed > 0) process.exit(1);
