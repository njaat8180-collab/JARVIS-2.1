"use strict";

/**
 * JARVIS — OLLAMA LOCAL AI CLIENT TESTS
 * test/ollama-client.test.js
 * ------------------------------------------------------------
 * Real HTTP tests: the client is exercised against an actual local
 * HTTP server that implements the Ollama API surface (/api/tags,
 * /api/chat). No function mocking — full request/response over the
 * wire, including failure modes (server down, malformed response,
 * model missing, timeout).
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ollamaClient = require("../src/ai/ollamaClient");

const AI_SETTINGS = path.join(__dirname, "..", "config", "ai_settings.json");

// Back up / restore the real ai_settings.json so the tests never
// leak a model selection into the user's config.
let savedSettings = null;
try { savedSettings = fs.readFileSync(AI_SETTINGS, "utf8"); } catch (_) { /* none */ }
test.after(() => {
    try {
        if (savedSettings === null) fs.rmSync(AI_SETTINGS, { force: true });
        else fs.writeFileSync(AI_SETTINGS, savedSettings);
    } catch (_) { /* best-effort */ }
});

/** Start a local server that mimics the Ollama REST API. */
function startFakeOllamaServer({ models = [], chatReply = null, malformedTags = false, malformedChat = false, hang = false, chatStatus = 200 } = {}) {
    const server = http.createServer((req, res) => {
        if (req.url === "/api/tags") {
            if (malformedTags) {
                res.writeHead(200, { "Content-Type": "application/json" });
                return res.end("{not json");
            }
            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ models: models.map((name) => ({ name, size: 1234 })) }));
        }
        if (req.url === "/api/chat") {
            if (hang) return; // never respond — for timeout testing
            res.writeHead(chatStatus, { "Content-Type": "application/json" });
            if (malformedChat) return res.end("{not json");
            return res.end(JSON.stringify({
                model: "test-model",
                message: { role: "assistant", content: chatReply ?? "Hello, sir." },
                eval_count: 42
            }));
        }
        res.writeHead(404); res.end("{}");
    });
    return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port })));
}

function withBase(port) { process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${port}`; }
function clearBase() { delete process.env.OLLAMA_BASE_URL; }

let loopbackBlockReason = null;
test.before(async () => {
    const { server, port } = await startFakeOllamaServer();
    const error = await new Promise((resolve) => {
        const request = http.get(`http://127.0.0.1:${port}/api/tags`, (response) => {
            response.resume();
            resolve(null);
        });
        request.setTimeout(1000, () => request.destroy(new Error("loopback probe timed out")));
        request.on("error", resolve);
    });
    await new Promise((resolve) => server.close(resolve));
    if (error) {
        loopbackBlockReason = `Blocked in this environment: localhost HTTP test requests are unavailable (${error.code || error.message}).`;
    }
});

function skipIfLoopbackBlocked(t) {
    if (!loopbackBlockReason) return false;
    t.skip(loopbackBlockReason);
    return true;
}

/** Prime the client's health cache against the just-started server so
    chat() sees THIS server's state (the cache is shared per-process). */
async function prime(port) {
    withBase(port);
    return ollamaClient.getStatus({ force: true });
}

test("status: server DOWN is reported honestly (no fake ONLINE)", async () => {
    withBase(59999); // nothing listens here
    try {
        const status = await ollamaClient.getStatus({ force: true });
        assert.equal(status.running, false);
        assert.ok(status.error, "must carry a diagnostic error");
        assert.match(status.error, /not reachable|not running|not installed/i);
        assert.equal(status.selectedModel, null);
    } finally { clearBase(); }
});

test("status: running server with models is detected via real probe", async (t) => {
    if (skipIfLoopbackBlocked(t)) return;
    const { server, port } = await startFakeOllamaServer({ models: ["llama3.2", "mistral"] });
    withBase(port);
    try {
        const status = await ollamaClient.getStatus({ force: true });
        assert.equal(status.running, true);
        assert.equal(typeof status.installed, "boolean"); // CLI presence is environment-dependent.
        assert.deepEqual(status.models.map((m) => m.name).sort(), ["llama3.2", "mistral"]);
        // preference order picks llama3.2 over mistral
        assert.equal(status.selectedModel, "llama3.2");
        assert.equal(status.error, null);
    } finally {
        clearBase();
        server.close();
    }
});

test("status: running server WITHOUT models reports the dedicated error", async (t) => {
    if (skipIfLoopbackBlocked(t)) return;
    const { server, port } = await startFakeOllamaServer({ models: [] });
    withBase(port);
    try {
        const status = await ollamaClient.getStatus({ force: true });
        assert.equal(status.running, true);
        assert.equal(status.models.length, 0);
        assert.equal(status.selectedModel, null);
        assert.match(status.error, /No Ollama model is installed/);
    } finally {
        clearBase();
        server.close();
    }
});

test("requested qwen coder model is selected when installed", async (t) => {
    if (skipIfLoopbackBlocked(t)) return;
    const { server, port } = await startFakeOllamaServer({ models: ["llama3.2", "qwen2.5-coder:1.5b"] });
    const previousModel = process.env.OLLAMA_MODEL;
    process.env.OLLAMA_MODEL = "qwen2.5-coder:1.5b";
    withBase(port);
    try {
        const status = await ollamaClient.getStatus({ force: true });
        assert.equal(status.selectedModel, "qwen2.5-coder:1.5b");
    } finally {
        if (previousModel === undefined) delete process.env.OLLAMA_MODEL;
        else process.env.OLLAMA_MODEL = previousModel;
        clearBase();
        server.close();
    }
});

test("status: malformed /api/tags body is reported, not crashed", async (t) => {
    if (skipIfLoopbackBlocked(t)) return;
    const { server, port } = await startFakeOllamaServer({ malformedTags: true });
    withBase(port);
    try {
        const status = await ollamaClient.getStatus({ force: true });
        assert.equal(status.running, false);
        assert.match(status.error, /malformed/i);
    } finally {
        clearBase();
        server.close();
    }
});

test("chat: real round trip returns the assistant text", async (t) => {
    if (skipIfLoopbackBlocked(t)) return;
    const { server, port } = await startFakeOllamaServer({ models: ["mistral"], chatReply: "Theek hai, sir." });
    await prime(port);
    try {
        const result = await ollamaClient.chat([
            { role: "system", content: "You are JARVIS." },
            { role: "user", content: "Jarvis aaj kya scene hai?" }
        ]);
        assert.equal(result.success, true);
        assert.equal(result.text, "Theek hai, sir.");
        assert.equal(result.model, "test-model");
        assert.ok(typeof result.durationMs === "number");
    } finally {
        clearBase();
        server.close();
    }
});

test("chat: malformed response body is reported, not crashed", async (t) => {
    if (skipIfLoopbackBlocked(t)) return;
    const { server, port } = await startFakeOllamaServer({ models: ["mistral"], malformedChat: true });
    await prime(port);
    try {
        const result = await ollamaClient.chat([{ role: "user", content: "hi" }]);
        assert.equal(result.success, false);
        assert.match(result.error, /malformed response/i);
    } finally {
        clearBase();
        server.close();
    }
});

test("chat: HTTP error surfaces as a failure, not a throw", async (t) => {
    if (skipIfLoopbackBlocked(t)) return;
    const { server, port } = await startFakeOllamaServer({ models: ["mistral"], chatStatus: 500 });
    await prime(port);
    try {
        const result = await ollamaClient.chat([{ role: "user", content: "hi" }]);
        assert.equal(result.success, false);
        assert.match(result.error, /HTTP 500/);
    } finally {
        clearBase();
        server.close();
    }
});

test("chat: request times out gracefully when the server hangs", async (t) => {
    if (skipIfLoopbackBlocked(t)) return;
    const { server, port } = await startFakeOllamaServer({ models: ["mistral"], hang: true });
    await prime(port);
    try {
        const result = await ollamaClient.chat([{ role: "user", content: "hi" }], { timeoutMs: 700 });
        assert.equal(result.success, false);
        assert.match(result.error, /timed out/i);
    } finally {
        clearBase();
        server.close();
    }
});

test("chat: rejects malformed message payloads with a failure result", async () => {
    const badRole = await ollamaClient.chat([{ role: "hacker", content: "rm -rf" }]);
    assert.equal(badRole.success, false);
    assert.match(badRole.error, /Malformed messages/);

    const empty = await ollamaClient.chat([]);
    assert.equal(empty.success, false);
    assert.match(empty.error, /Messages array is required/);
});

test("chat: refuses to run when no model is installed", async (t) => {
    if (skipIfLoopbackBlocked(t)) return;
    const { server, port } = await startFakeOllamaServer({ models: [] });
    await prime(port);
    try {
        const result = await ollamaClient.chat([{ role: "user", content: "hi" }]);
        assert.equal(result.success, false);
        assert.equal(result.noModel, true);
        assert.match(result.error, /No Ollama model is installed/);
    } finally {
        clearBase();
        server.close();
    }
});

test("model selection: explicit choice wins and persists", async (t) => {
    if (skipIfLoopbackBlocked(t)) return;
    const { server, port } = await startFakeOllamaServer({ models: ["llama3.2", "mistral"] });
    withBase(port);
    try {
        const set = ollamaClient.setSelectedModel("mistral");
        assert.equal(set.success, true);
        const status = await ollamaClient.getStatus({ force: true });
        assert.equal(status.selectedModel, "mistral");

        // A configured model that is NOT installed falls back with a warning
        ollamaClient.setSelectedModel("gpt5-gigantic");
        const fallback = await ollamaClient.getStatus({ force: true });
        assert.ok(["llama3.2", "mistral"].includes(fallback.selectedModel));
    } finally {
        clearBase();
        server.close();
        // restore (also done in test.after)
        try {
            if (savedSettings === null) fs.rmSync(AI_SETTINGS, { force: true });
            else fs.writeFileSync(AI_SETTINGS, savedSettings);
        } catch (_) { /* best-effort */ }
    }
});

test("health cache: repeated status calls do not re-probe within TTL", async (t) => {
    if (skipIfLoopbackBlocked(t)) return;
    let probes = 0;
    const server = http.createServer((req, res) => {
        if (req.url === "/api/tags") {
            probes += 1;
            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ models: [{ name: "llama3.2", size: 1 }] }));
        }
        res.writeHead(404); res.end();
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    withBase(server.address().port);
    try {
        await ollamaClient.getStatus({ force: true });
        await ollamaClient.getStatus();
        await ollamaClient.getStatus();
        assert.equal(probes, 1, "cached probe must be reused within TTL");
        const fresh = await ollamaClient.getStatus({ force: true });
        assert.equal(fresh.running, true);
        assert.equal(probes, 2, "force must re-probe");
    } finally {
        clearBase();
        server.close();
    }
});
