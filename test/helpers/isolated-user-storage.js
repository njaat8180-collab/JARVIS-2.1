"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Configure before any account operations, including initialization. Legacy
// suites run as standalone scripts as well as under node:test.
module.exports = function isolateUserStorage(userManager) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-user-test-"));
    userManager.configureDataDirectory(directory);
    process.once("exit", () => {
        fs.rmSync(directory, { recursive: true, force: true });
    });
    return directory;
};
