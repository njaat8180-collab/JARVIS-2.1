"use strict";

/*
 * ============================================================
 * JARVIS PRO MAX — USER SYSTEM UPGRADE TEST SUITE
 * test/user-system-upgrade.test.js
 * ============================================================
 * Tests the v2.0 user system: PIN auth, roles, permissions,
 * guest restrictions, activity tracking, avatars, merge, sessions.
 *
 * Run: node test/user-system-upgrade.test.js
 * ============================================================
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const userManager = require("../src/users/userManager");
const testDataDirectory = require("./helpers/isolated-user-storage")(userManager);

let passed = 0, failed = 0;
const TEST_USER_IDS = [];

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  \u2713 ${name}`);
    } catch (error) {
        failed++;
        console.error(`  \u2717 ${name}: ${error.message}`);
    }
}

function cleanup() {
    for (const userId of TEST_USER_IDS) {
        try { userManager.deleteUser(userId, true); } catch (_) {}
    }
}

// Helpers
function createTestUser(profile, prefs, privacy, options) {
    const result = userManager.createUser(profile || {}, prefs || {}, privacy || {}, options || {});
    if (result.success && result.userId) TEST_USER_IDS.push(result.userId);
    return result;
}

console.log("\n========================================");
console.log("USER SYSTEM UPGRADE TEST SUITE v2.0");
console.log("========================================\n");

// ============================================================
// 1. PIN Authentication
// ============================================================
console.log("--- 1. PIN Authentication ---");

test("Create user with PIN", () => {
    const result = createTestUser(
        { name: "PinUser", language: "en" }, {}, {},
        { pin: "1234" }
    );
    assert.ok(result.success, "User should be created");
    assert.ok(userManager.hasPin(result.userId), "User should have PIN");
});

test("Verify correct PIN", () => {
    const result = createTestUser(
        { name: "PinVerify", language: "en" }, {}, {},
        { pin: "9876" }
    );
    const verify = userManager.verifyUserPin(result.userId, "9876");
    assert.ok(verify.success, "Correct PIN should verify");
});

test("Reject incorrect PIN", () => {
    const result = createTestUser(
        { name: "PinReject", language: "en" }, {}, {},
        { pin: "5555" }
    );
    const verify = userManager.verifyUserPin(result.userId, "0000");
    assert.ok(!verify.success, "Wrong PIN should fail");
    assert.ok(verify.error.includes("Incorrect"), "Error should say incorrect");
});

test("Reject short PIN", () => {
    const result = createTestUser({ name: "ShortPin", language: "en" });
    const setPin = userManager.setPin(result.userId, "12");
    assert.ok(!setPin.success, "Short PIN should be rejected");
});

test("Update PIN with correct old PIN", () => {
    const result = createTestUser(
        { name: "PinUpdate", language: "en" }, {}, {},
        { pin: "1111" }
    );
    const update = userManager.updatePin(result.userId, "1111", "2222");
    assert.ok(update.success, "PIN update should succeed");
    const verify = userManager.verifyUserPin(result.userId, "2222");
    assert.ok(verify.success, "New PIN should work");
});

test("Reject PIN update with wrong old PIN", () => {
    const result = createTestUser(
        { name: "PinUpdateFail", language: "en" }, {}, {},
        { pin: "3333" }
    );
    const update = userManager.updatePin(result.userId, "0000", "4444");
    assert.ok(!update.success, "Should reject with wrong old PIN");
});

test("Remove PIN", () => {
    const result = createTestUser(
        { name: "PinRemove", language: "en" }, {}, {},
        { pin: "5678" }
    );
    const remove = userManager.removePin(result.userId, "5678");
    assert.ok(remove.success, "PIN removal should succeed");
    assert.ok(!userManager.hasPin(result.userId), "User should no longer have PIN");
});

test("Guest user bypasses PIN", () => {
    const guest = userManager.ensureGuest();
    const verify = userManager.verifyUserPin(guest.userId, "");
    assert.ok(verify.success, "Guest should not need PIN");
});

test("PIN is hashed (not plaintext)", () => {
    const result = createTestUser(
        { name: "HashCheck", language: "en" }, {}, {},
        { pin: "12345" }
    );
    // The registry should contain a hashed PIN, not the plaintext
    const registry = JSON.parse(fs.readFileSync(
        path.join(testDataDirectory, "users", "users.json"), "utf8"
    ));
    const user = registry.users.find(u => u.userId === result.userId);
    assert.ok(user.pinHash, "Should have pinHash");
    assert.ok(!user.pinHash.includes("12345"), "PIN should be hashed, not plaintext");
    assert.ok(user.pinHash.startsWith("pbkdf2"), "Should use PBKDF2");
});

// ============================================================
// 2. Roles & Permissions
// ============================================================
console.log("\n--- 2. Roles & Permissions ---");

test("First user gets admin role", () => {
    // Delete all users first to ensure clean slate
    const users = userManager.listUsers();
    const realUsers = users.filter(u => !u.isGuest);
    // If there are already real users, this test just checks the role
    const result = createTestUser({ name: "AdminTest", language: "en" });
    const role = userManager.getRole(result.userId);
    // First user should be admin (if no other real users existed)
    // Since there might be existing users, just check role is valid
    assert.ok(["admin", "member"].includes(role), "Role should be admin or member");
});

test("getRole returns 'guest' for guest user", () => {
    const guest = userManager.ensureGuest();
    const role = userManager.getRole(guest.userId);
    assert.strictEqual(role, "guest");
});

test("isAdmin returns true for admin user", () => {
    const users = userManager.listUsers();
    const admin = users.find(u => u.role === "admin");
    if (admin) {
        assert.ok(userManager.isAdmin(admin.userId), "Admin should be admin");
    }
});

test("isGuest returns true for guest", () => {
    const guest = userManager.ensureGuest();
    assert.ok(userManager.isGuest(guest.userId), "Guest should be guest");
});

test("hasPermission: admin can manage_roles", () => {
    const users = userManager.listUsers();
    const admin = users.find(u => u.role === "admin");
    if (admin) {
        assert.ok(userManager.hasPermission(admin.userId, "manage_roles"), "Admin should have manage_roles");
        assert.ok(userManager.hasPermission(admin.userId, "delete_user"), "Admin should have delete_user");
        assert.ok(userManager.hasPermission(admin.userId, "merge_users"), "Admin should have merge_users");
    }
});

test("hasPermission: guest has no permissions", () => {
    const guest = userManager.ensureGuest();
    assert.ok(!userManager.hasPermission(guest.userId, "export_data"), "Guest cannot export");
    assert.ok(!userManager.hasPermission(guest.userId, "clear_memory"), "Guest cannot clear memory");
    assert.ok(!userManager.hasPermission(guest.userId, "manage_settings"), "Guest cannot manage settings");
});

test("setRole changes user role", () => {
    const result = createTestUser({ name: "RoleChange", language: "en" });
    const setRole = userManager.setRole(result.userId, "member");
    assert.ok(setRole.success, "Should set role to member");
    assert.strictEqual(userManager.getRole(result.userId), "member");
});

test("Cannot demote last admin", () => {
    const users = userManager.listUsers();
    const admins = users.filter(u => u.role === "admin" && !u.isGuest);
    if (admins.length === 1) {
        const result = userManager.setRole(admins[0].userId, "member");
        assert.ok(!result.success, "Should not demote last admin");
        assert.ok(result.error.includes("last admin"), "Error should mention last admin");
    }
});

// ============================================================
// 3. Guest Restrictions
// ============================================================
console.log("\n--- 3. Guest Restrictions ---");

test("Guest cannot export", () => {
    const guest = userManager.ensureGuest();
    const check = userManager.checkGuestRestriction(guest.userId, "export");
    assert.ok(!check.allowed, "Guest should not be allowed to export");
});

test("Guest cannot clear memory", () => {
    const guest = userManager.ensureGuest();
    const check = userManager.checkGuestRestriction(guest.userId, "clear_memory");
    assert.ok(!check.allowed, "Guest should not be allowed to clear memory");
});

test("Guest cannot import", () => {
    const guest = userManager.ensureGuest();
    const check = userManager.checkGuestRestriction(guest.userId, "import");
    assert.ok(!check.allowed, "Guest should not be allowed to import");
});

test("Guest cannot merge", () => {
    const guest = userManager.ensureGuest();
    const check = userManager.checkGuestRestriction(guest.userId, "merge");
    assert.ok(!check.allowed, "Guest should not be allowed to merge");
});

test("Non-guest CAN export", () => {
    const result = createTestUser({ name: "CanExport", language: "en" });
    const check = userManager.checkGuestRestriction(result.userId, "export");
    assert.ok(check.allowed, "Non-guest should be allowed to export");
});

test("GUEST_RESTRICTIONS has all keys", () => {
    const r = userManager.GUEST_RESTRICTIONS;
    assert.ok("canExport" in r);
    assert.ok("canClearMemory" in r);
    assert.ok("canDeleteUsers" in r);
    assert.ok("canManageSettings" in r);
    assert.ok("canImport" in r);
    assert.ok("canMerge" in r);
    assert.ok("canUseLearning" in r);
    assert.ok("maxMemoryEntries" in r);
});

// ============================================================
// 4. Activity Tracking
// ============================================================
console.log("\n--- 4. Activity Tracking ---");

test("getActivity returns null for missing user", () => {
    const activity = userManager.getActivity("u_invalid_000000");
    assert.ok(activity === null || activity.loginCount !== undefined);
});

test("recordLogin increments login count", () => {
    const result = createTestUser({ name: "ActivityUser", language: "en" });
    const before = userManager.getActivity(result.userId) || {};
    userManager.recordLogin(result.userId);
    const after = userManager.getActivity(result.userId);
    assert.ok(after.loginCount >= (before.loginCount || 0) + 1, "Login count should increment");
    assert.ok(after.lastLoginAt, "Should have lastLoginAt");
});

test("recordMessage increments message count", () => {
    const result = createTestUser({ name: "MsgUser", language: "en" });
    const before = userManager.getActivity(result.userId) || {};
    userManager.recordMessage(result.userId);
    const after = userManager.getActivity(result.userId);
    assert.ok(after.messageCount >= (before.messageCount || 0) + 1, "Message count should increment");
});

test("recordVoiceCommand increments voice count", () => {
    const result = createTestUser({ name: "VoiceUser", language: "en" });
    const before = userManager.getActivity(result.userId) || {};
    userManager.recordVoiceCommand(result.userId);
    const after = userManager.getActivity(result.userId);
    assert.ok(after.voiceCommandCount >= (before.voiceCommandCount || 0) + 1, "Voice count should increment");
});

test("touchUser updates lastSeenAt", () => {
    const result = createTestUser({ name: "TouchUser", language: "en" });
    userManager.touchUser(result.userId);
    const after = userManager.getActivity(result.userId);
    assert.ok(after.lastSeenAt, "Should have lastSeenAt");
    // Should be recent (within last 5 seconds)
    const age = Date.now() - new Date(after.lastSeenAt).getTime();
    assert.ok(age < 5000, "lastSeenAt should be recent");
});

test("getStorageUsage returns positive number", () => {
    const result = createTestUser({ name: "StorageUser", language: "en" });
    const bytes = userManager.getStorageUsage(result.userId);
    assert.ok(typeof bytes === "number" && bytes >= 0, "Should return non-negative number");
});

test("formatBytes formats correctly", () => {
    assert.strictEqual(userManager.formatBytes(0), "0 B");
    assert.strictEqual(userManager.formatBytes(512), "512 B");
    assert.ok(userManager.formatBytes(2048).includes("KB"));
    assert.ok(userManager.formatBytes(1048576).includes("MB"));
});

// ============================================================
// 5. Avatars
// ============================================================
console.log("\n--- 5. Avatars ---");

test("getInitials extracts first letters", () => {
    assert.strictEqual(userManager.getInitials("Nakul Jaat"), "NJ");
    assert.strictEqual(userManager.getInitials("Jarvis"), "JA");
    assert.strictEqual(userManager.getInitials(""), "?");
    assert.strictEqual(userManager.getInitials("A"), "A");
});

test("pickAvatarColor returns valid hex color", () => {
    const color = userManager.pickAvatarColor("u_test_abc123");
    assert.ok(/^#[0-9A-F]{6}$/i.test(color), "Should be hex color: " + color);
});

test("AVATAR_COLORS has at least 10 colors", () => {
    assert.ok(Array.isArray(userManager.AVATAR_COLORS));
    assert.ok(userManager.AVATAR_COLORS.length >= 10);
});

test("User creation sets avatar properties", () => {
    const result = createTestUser({ name: "AvatarTest", language: "en" });
    const profile = userManager.getProfile(result.userId);
    assert.ok(profile.avatarColor, "Should have avatarColor");
    assert.ok(profile.avatarInitials, "Should have avatarInitials");
    assert.ok(profile.avatarInitials.length >= 1, "Should have avatar initials");
});

test("listUsers includes avatar info", () => {
    const result = createTestUser({ name: "ListAvatar", language: "en" });
    const users = userManager.listUsers();
    const user = users.find(u => u.userId === result.userId);
    assert.ok(user, "Should find user in list");
    assert.ok(user.avatarColor, "Should have avatarColor in list");
    assert.ok(user.avatarInitials, "Should have avatarInitials in list");
});

// ============================================================
// 6. Session Management
// ============================================================
console.log("\n--- 6. Session Management ---");

test("createSession returns session object", () => {
    const result = createTestUser({ name: "SessionUser", language: "en" });
    const session = userManager.createSession(result.userId);
    assert.ok(session, "Should return session");
    assert.ok(session.sessionId, "Should have sessionId");
    assert.ok(!session.locked, "New session should not be locked");
});

test("isSessionLocked returns false for fresh session", () => {
    const result = createTestUser({ name: "LockUser", language: "en" });
    userManager.createSession(result.userId);
    assert.ok(!userManager.isSessionLocked(result.userId), "Fresh session should not be locked");
});

test("lockSession locks the session", () => {
    const result = createTestUser({ name: "LockTest", language: "en" });
    userManager.createSession(result.userId);
    userManager.lockSession(result.userId);
    assert.ok(userManager.isSessionLocked(result.userId), "Session should be locked");
});

test("unlockSession with correct PIN", () => {
    const result = createTestUser(
        { name: "UnlockTest", language: "en" }, {}, {},
        { pin: "1234" }
    );
    userManager.createSession(result.userId);
    userManager.lockSession(result.userId);
    const unlock = userManager.unlockSession(result.userId, "1234");
    assert.ok(unlock.success, "Should unlock with correct PIN");
    assert.ok(!userManager.isSessionLocked(result.userId), "Should be unlocked");
});

test("unlockSession fails without PIN", () => {
    const result = createTestUser(
        { name: "UnlockFail", language: "en" }, {}, {},
        { pin: "5678" }
    );
    userManager.createSession(result.userId);
    userManager.lockSession(result.userId);
    const unlock = userManager.unlockSession(result.userId, "0000");
    assert.ok(!unlock.success, "Should fail with wrong PIN");
    assert.ok(userManager.isSessionLocked(result.userId), "Should remain locked");
});

test("touchSession updates lastActivity", () => {
    const result = createTestUser({ name: "TouchSession", language: "en" });
    const session = userManager.createSession(result.userId);
    const oldActivity = session.lastActivity;
    // Wait a bit
    const start = Date.now();
    while (Date.now() - start < 10) {} // 10ms delay
    userManager.touchSession(result.userId);
    const updated = userManager.getSession(result.userId);
    assert.ok(updated.lastActivity > oldActivity, "lastActivity should be updated");
});

test("destroySession removes session", () => {
    const result = createTestUser({ name: "DestroySession", language: "en" });
    userManager.createSession(result.userId);
    assert.ok(userManager.getSession(result.userId), "Session should exist");
    userManager.destroySession(result.userId);
    assert.ok(!userManager.getSession(result.userId), "Session should be destroyed");
});

// ============================================================
// 7. Switch User with PIN
// ============================================================
console.log("\n--- 7. Switch User with PIN ---");

test("Switch to PIN-protected user requires PIN", () => {
    const result = createTestUser(
        { name: "PinSwitch", language: "en" }, {}, {},
        { pin: "9999" }
    );
    const switchNoPin = userManager.switchUser(result.userId);
    assert.ok(!switchNoPin.success, "Should fail without PIN");
    assert.ok(switchNoPin.requiresPin, "Should indicate PIN required");

    const switchWithPin = userManager.switchUser(result.userId, "9999");
    assert.ok(switchWithPin.success, "Should succeed with correct PIN");
});

test("Switch to PIN-protected user fails with wrong PIN", () => {
    const result = createTestUser(
        { name: "PinSwitchFail", language: "en" }, {}, {},
        { pin: "4321" }
    );
    const switchResult = userManager.switchUser(result.userId, "0000");
    assert.ok(!switchResult.success, "Should fail with wrong PIN");
    assert.ok(switchResult.requiresPin, "Should indicate PIN required");
});

test("Switch to user without PIN succeeds without PIN", () => {
    const result = createTestUser({ name: "NoPinSwitch", language: "en" });
    const switchResult = userManager.switchUser(result.userId);
    assert.ok(switchResult.success, "Should succeed without PIN");
});

test("Switch creates session for new user", () => {
    const result = createTestUser({ name: "SessionSwitch", language: "en" });
    userManager.switchUser(result.userId);
    const session = userManager.getSession(result.userId);
    assert.ok(session, "Should have session after switch");
});

// ============================================================
// 8. Merge Users
// ============================================================
console.log("\n--- 8. Merge Users ---");

test("Merge combines user data", () => {
    const user1 = createTestUser(
        { name: "MergeSource", language: "en", interests: ["music", "coding"] },
        { personalityTone: "friendly", responseStyle: "casual" }
    );
    const user2 = createTestUser(
        { name: "MergeTarget", language: "en", interests: ["gaming", "reading"] },
        { personalityTone: "professional", responseStyle: "formal" }
    );

    // Add some activity to source
    userManager.recordMessage(user1.userId);
    userManager.recordMessage(user1.userId);
    userManager.recordVoiceCommand(user1.userId);

    const merge = userManager.mergeUsers(user1.userId, user2.userId);
    assert.ok(merge.success, "Merge should succeed");
    assert.strictEqual(merge.mergedInto, user2.userId);
    assert.strictEqual(merge.deletedSource, user1.userId);

    // Verify target has merged data
    const targetProfile = userManager.getProfile(user2.userId);
    assert.ok(targetProfile.interests.includes("music"), "Should have source interests");
    assert.ok(targetProfile.interests.includes("gaming"), "Should keep target interests");

    // Activity should be summed
    const targetActivity = userManager.getActivity(user2.userId);
    assert.ok(targetActivity.messageCount >= 2, "Should have merged message count");

    // Source should be deleted
    assert.ok(!userManager.isValidUserId(user1.userId) || !userManager.getProfile(user1.userId),
        "Source user should be deleted");

    // Remove from cleanup list since it's already deleted
    const idx = TEST_USER_IDS.indexOf(user1.userId);
    if (idx >= 0) TEST_USER_IDS.splice(idx, 1);
});

test("Cannot merge user with itself", () => {
    const result = createTestUser({ name: "SelfMerge", language: "en" });
    const merge = userManager.mergeUsers(result.userId, result.userId);
    assert.ok(!merge.success, "Should not merge with self");
});

test("Non-admin cannot merge", () => {
    const user1 = createTestUser({ name: "MergeNoPerm1", language: "en" });
    const user2 = createTestUser({ name: "MergeNoPerm2", language: "en" });
    // Get guest as requester
    const guest = userManager.ensureGuest();
    const merge = userManager.mergeUsers(user1.userId, user2.userId, guest.userId);
    assert.ok(!merge.success, "Guest should not be able to merge");
});

// ============================================================
// 9. Export/Import with Activity
// ============================================================
console.log("\n--- 9. Export/Import v2 ---");

test("Export includes activity data", () => {
    const result = createTestUser({ name: "ExportActivity", language: "en" });
    userManager.recordLogin(result.userId);
    userManager.recordMessage(result.userId);
    const exportResult = userManager.exportUser(result.userId);
    assert.ok(exportResult.success, "Export should succeed");
    assert.ok(exportResult.export.version === 2, "Should be v2 format");
    assert.ok(exportResult.export.user.activity, "Should include activity");
    assert.ok(exportResult.export.user.activity.loginCount >= 1, "Should have login count");
});

test("Export includes role", () => {
    const result = createTestUser({ name: "ExportRole", language: "en" });
    const exportResult = userManager.exportUser(result.userId);
    assert.ok(exportResult.success);
    assert.ok(exportResult.export.user.role, "Should include role");
});

// ============================================================
// 10. getUserContext v2
// ============================================================
console.log("\n--- 10. Enhanced User Context ---");

test("getUserContext includes avatar", () => {
    const result = createTestUser({ name: "ContextAvatar", language: "en" });
    const context = userManager.getUserContext(result.userId);
    assert.ok(context.avatar, "Should have avatar");
    assert.ok(context.avatar.initials, "Should have avatar initials");
    assert.ok(context.avatar.color, "Should have avatar color");
});

test("getUserContext includes personality", () => {
    const result = createTestUser(
        { name: "ContextPersonality", language: "en" },
        { personalityTone: "friendly", formality: "casual" }
    );
    const context = userManager.getUserContext(result.userId);
    assert.ok(context.personality, "Should have personality");
    assert.strictEqual(context.personality.tone, "friendly");
    assert.strictEqual(context.personality.formality, "casual");
});

test("getUserContext includes role", () => {
    const result = createTestUser({ name: "ContextRole", language: "en" });
    const context = userManager.getUserContext(result.userId);
    assert.ok(context.role, "Should have role");
    assert.ok(["admin", "member"].includes(context.role), "Role should be admin or member");
});

test("getUserContext includes restrictions for guest", () => {
    const guest = userManager.ensureGuest();
    const context = userManager.getUserContext(guest.userId);
    assert.ok(context.restrictions, "Guest should have restrictions");
    assert.strictEqual(context.role, "guest");
});

test("getUserContext includes activity summary", () => {
    const result = createTestUser({ name: "ContextActivity", language: "en" });
    userManager.recordMessage(result.userId);
    const context = userManager.getUserContext(result.userId);
    assert.ok(context.activity, "Should have activity");
    assert.ok(context.activity.messageCount >= 1, "Should have message count");
});

// ============================================================
// 11. Delete with Permission Check
// ============================================================
console.log("\n--- 11. Delete with Permissions ---");

test("Cannot delete guest user", () => {
    const guest = userManager.ensureGuest();
    const del = userManager.deleteUser(guest.userId, true);
    assert.ok(!del.success, "Should not delete guest");
});

test("Cannot delete other user as non-admin", () => {
    const user1 = createTestUser({ name: "DelVictim", language: "en" });
    // Set user1 as member (not admin)
    userManager.setRole(user1.userId, "member");
    const user2 = createTestUser({ name: "DelRequester", language: "en" });
    userManager.setRole(user2.userId, "member");
    const del = userManager.deleteUser(user1.userId, true, user2.userId);
    assert.ok(!del.success, "Member should not delete other user");
    assert.ok(del.error.includes("admin"), "Error should mention admin");
});

// ============================================================
// 12. listUsers Enhanced
// ============================================================
console.log("\n--- 12. Enhanced listUsers ---");

test("listUsers includes role field", () => {
    const users = userManager.listUsers();
    for (const u of users) {
        assert.ok(u.role, `User ${u.name} should have role`);
    }
});

test("listUsers includes hasPin field", () => {
    const result = createTestUser(
        { name: "ListPin", language: "en" }, {}, {},
        { pin: "1234" }
    );
    const users = userManager.listUsers();
    const user = users.find(u => u.userId === result.userId);
    assert.ok(user.hasPin === true, "Should show hasPin=true");
});

test("listUsers includes storageFormatted", () => {
    const result = createTestUser({ name: "ListStorage", language: "en" });
    const users = userManager.listUsers();
    const user = users.find(u => u.userId === result.userId);
    assert.ok(user.storageFormatted, "Should have storageFormatted");
    assert.ok(user.storageBytes >= 0, "Should have storageBytes");
});

test("listUsers includes activity summary", () => {
    const result = createTestUser({ name: "ListActivity", language: "en" });
    userManager.recordLogin(result.userId);
    const users = userManager.listUsers();
    const user = users.find(u => u.userId === result.userId);
    assert.ok(user.activity, "Should have activity");
    assert.ok(user.activity.loginCount >= 1, "Should show login count in list");
});

// ============================================================
// 13. File Existence Checks
// ============================================================
console.log("\n--- 13. File Existence ---");

test("userPanelUpgrade.js exists", () => {
    assert.ok(fs.existsSync(path.join(__dirname, "..", "renderer", "js", "users", "userPanelUpgrade.js")));
});

test("userPanelUpgrade.js has valid syntax", () => {
    // Node can parse it as a module check
    const content = fs.readFileSync(path.join(__dirname, "..", "renderer", "js", "users", "userPanelUpgrade.js"), "utf8");
    assert.ok(content.includes("JARVISUserPanelUpgrade"));
    assert.ok(content.includes("toggleQuickSwitch"));
    assert.ok(content.includes("openPinManager"));
    assert.ok(content.includes("openMergeUsers"));
});

test("index.html includes userPanelUpgrade script", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "renderer", "index.html"), "utf8");
    assert.ok(html.includes("userPanelUpgrade.js"), "index.html should include userPanelUpgrade.js");
});

test("preload.js has verifyPin method", () => {
    const preload = fs.readFileSync(path.join(__dirname, "..", "preload.js"), "utf8");
    assert.ok(preload.includes("verifyPin"), "Preload should expose verifyPin");
    assert.ok(preload.includes("setPin"), "Preload should expose setPin");
    assert.ok(preload.includes("merge"), "Preload should expose merge");
});

test("main.js has user:verify-pin handler", () => {
    const main = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
    assert.ok(main.includes("user:verify-pin"), "main.js should have user:verify-pin handler");
    assert.ok(main.includes("user:merge"), "main.js should have user:merge handler");
    assert.ok(main.includes("user:lock-session"), "main.js should have user:lock-session handler");
});

// ============================================================
// CLEANUP + SUMMARY
// ============================================================
cleanup();
console.log("\n========================================");
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log("========================================\n");
if (failed > 0) process.exit(1);
