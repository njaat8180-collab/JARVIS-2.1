"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const users = require("../src/users/userManager");
require("./helpers/isolated-user-storage")(users);

test("public account responses never expose the PIN verifier", () => {
    const account = users.createUser({ name: "Private account" }, {}, {}, { pin: "9182" });
    const switched = users.switchUser(account.userId, "9182");
    assert.equal(switched.success, true);
    for (const result of [users.listUsers(), users.getActiveUser(), switched]) {
        assert.doesNotMatch(JSON.stringify(result), /pinHash|pbkdf2\$/);
    }
    assert.equal(users.getActiveUser().hasPin, true);
});

test("activity cannot unlock an explicitly locked or expired session", () => {
    const id = users.getActiveUserId();
    users.lockSession(id);
    users.touchSession(id);
    assert.equal(users.isSessionLocked(id), true);
    users.initialize();
    assert.equal(users.isSessionLocked(id), true, "reading account state must not recreate an unlocked session");
    assert.equal(users.unlockSession(id, "wrong").success, false);
    assert.equal(users.unlockSession(id, "9182").success, true);
    const session = users.getSession(id);
    session.lastActivity = Date.now() - session.timeoutMs - 1000;
    users.touchSession(id);
    assert.equal(users.isSessionLocked(id), true);
});

test("initializing a saved PIN account requires authentication", () => {
    const id = users.getActiveUserId();
    users.destroySession(id);
    users.initialize();
    assert.equal(users.isSessionLocked(id), true);
});
