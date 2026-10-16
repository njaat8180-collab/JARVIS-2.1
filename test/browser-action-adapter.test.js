"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { BrowserActionAdapter } = require("../src/assistant/browserActionAdapter");

function makeEngine(overrides = {}) {
    const calls = [];
    return {
        calls,
        async navigate(url) { calls.push(["navigate", url]); return { url }; },
        async newTab(url) { calls.push(["newTab", url]); return { tabId: "tab-2", url }; },
        async closeTab(tabId) { calls.push(["closeTab", tabId]); return { closed: tabId }; },
        async switchTab(tabId) { calls.push(["switchTab", tabId]); return { active: tabId }; },
        back() { calls.push(["back"]); return { url: "back" }; },
        forward() { calls.push(["forward"]); return { url: "forward" }; },
        reload() { calls.push(["reload"]); return { reloaded: true }; },
        stop() { calls.push(["stop"]); return { stopped: true }; },
        zoomIn() { calls.push(["zoomIn"]); return { zoom: 1.1 }; },
        zoomOut() { calls.push(["zoomOut"]); return { zoom: 0.9 }; },
        resetZoom() { calls.push(["resetZoom"]); return { zoom: 1 }; },
        findInPage(query) { calls.push(["findInPage", query]); return { matches: 3, query }; },
        stopFindInPage() { calls.push(["stopFindInPage"]); return { stopped: true }; },
        getBookmarks() { calls.push(["getBookmarks"]); return []; },
        addBookmark(url) { calls.push(["addBookmark", url]); return { url }; },
        getHistory() { calls.push(["getHistory"]); return []; },
        clearHistory() { calls.push(["clearHistory"]); return { cleared: true }; },
        getDownloads() { calls.push(["getDownloads"]); return []; },
        clearDownloads() { calls.push(["clearDownloads"]); return { cleared: true }; },
        printPage() { calls.push(["printPage"]); return { printed: true }; },
        savePage(p) { calls.push(["savePage", p]); return { saved: p }; },
        ...overrides
    };
}

/* ---------------- basic navigation ---------------- */

test("open() navigates via the engine for a valid https URL", async () => {
    const engine = makeEngine();
    const adapter = new BrowserActionAdapter({ engine });
    const result = await adapter.open("https://example.com");

    assert.equal(result.success, true);
    assert.deepEqual(engine.calls[0], ["navigate", "https://example.com"]);
});

test("open() rejects a non-http(s) URL without touching the engine", async () => {
    const engine = makeEngine();
    const adapter = new BrowserActionAdapter({ engine });
    const result = await adapter.open("javascript:alert(1)");

    assert.equal(result.success, false);
    assert.equal(engine.calls.length, 0);
});

test("open() with no engine returns a structured failure, never throws", async () => {
    const adapter = new BrowserActionAdapter({});
    const result = await adapter.open("https://example.com");
    assert.equal(result.success, false);
    assert.match(result.error, /No browser engine/);
});

test("open() preserves engine failures and catches navigation errors", async () => {
    const failed = new BrowserActionAdapter({
        engine: makeEngine({ navigate: async () => ({ success: false, error: "navigation blocked" }) })
    });
    const failedResult = await failed.open("https://example.com");
    assert.equal(failedResult.success, false);
    assert.equal(failedResult.error, "navigation blocked");

    const rejected = new BrowserActionAdapter({
        engine: makeEngine({ navigate: async () => { throw new Error("network unavailable"); } })
    });
    const rejectedResult = await rejected.open("https://example.com");
    assert.equal(rejectedResult.success, false);
    assert.equal(rejectedResult.error, "network unavailable");
});

/* ---------------- tabs ---------------- */

test("newTab / closeTab / switchTab delegate to the engine", async () => {
    const engine = makeEngine();
    const adapter = new BrowserActionAdapter({ engine });

    const opened = await adapter.newTab("https://example.com");
    assert.equal(opened.success, true);

    const closed = await adapter.closeTab("tab-2");
    assert.equal(closed.success, true);
    assert.deepEqual(engine.calls[1], ["closeTab", "tab-2"]);

    const switched = await adapter.switchTab("tab-1");
    assert.equal(switched.success, true);
});

/* ---------------- back / forward / reload / stop ---------------- */

test("back/forward/reload/stop all succeed and call the matching engine method exactly once", async () => {
    const engine = makeEngine();
    const adapter = new BrowserActionAdapter({ engine });

    await adapter.back();
    await adapter.forward();
    await adapter.reload();
    await adapter.stop();

    assert.deepEqual(engine.calls.map((c) => c[0]), ["back", "forward", "reload", "stop"]);
});

/* ---------------- zoom / find ---------------- */

test("zoom controls and find/findStop work and reject an empty query", async () => {
    const engine = makeEngine();
    const adapter = new BrowserActionAdapter({ engine });

    await adapter.zoomIn();
    await adapter.zoomOut();
    await adapter.zoomReset();

    const found = await adapter.find("cats");
    assert.equal(found.success, true);
    assert.deepEqual(engine.calls.at(-1), ["findInPage", "cats"]);

    const emptyQuery = await adapter.find("   ");
    assert.equal(emptyQuery.success, false);

    await adapter.findStop();
});

/* ---------------- bookmarks / history / downloads ---------------- */

test("bookmarks and history read/write operate through the engine", async () => {
    const engine = makeEngine();
    const adapter = new BrowserActionAdapter({ engine });

    await adapter.addBookmark("https://example.com");
    await adapter.getBookmarks();
    await adapter.getHistory();
    await adapter.getDownloads();

    assert.equal(engine.calls.filter((c) => c[0] === "addBookmark").length, 1);
});

test("addBookmark rejects a non-http(s) URL", async () => {
    const engine = makeEngine();
    const adapter = new BrowserActionAdapter({ engine });
    const result = await adapter.addBookmark("file:///etc/passwd");
    assert.equal(result.success, false);
});

/* ---------------- destructive browser actions ---------------- */

test("clearHistory and clearDownloads are blocked without approved:true", async () => {
    const engine = makeEngine();
    const adapter = new BrowserActionAdapter({ engine });

    const h = await adapter.clearHistory();
    assert.equal(h.success, false);
    assert.equal(h.requiresApproval, true);

    const d = await adapter.clearDownloads();
    assert.equal(d.success, false);
    assert.equal(d.requiresApproval, true);

    assert.equal(engine.calls.filter((c) => c[0].startsWith("clear")).length, 0);
});

test("clearHistory/clearDownloads run exactly once when explicitly approved", async () => {
    const engine = makeEngine();
    const adapter = new BrowserActionAdapter({ engine });

    const h = await adapter.clearHistory({ approved: true });
    assert.equal(h.success, true);
    const d = await adapter.clearDownloads({ approved: true });
    assert.equal(d.success, true);

    assert.equal(engine.calls.filter((c) => c[0] === "clearHistory").length, 1);
    assert.equal(engine.calls.filter((c) => c[0] === "clearDownloads").length, 1);
});

/* ---------------- print / save ---------------- */

test("print and savePage delegate to the engine", async () => {
    const engine = makeEngine();
    const adapter = new BrowserActionAdapter({ engine });

    const printed = await adapter.print();
    assert.equal(printed.success, true);

    const saved = await adapter.savePage("/tmp/page.html");
    assert.equal(saved.success, true);
    assert.deepEqual(engine.calls.at(-1), ["savePage", "/tmp/page.html"]);
});

/* ---------------- unsupported operation / missing engine method ---------------- */

test("an engine missing a method returns a structured failure instead of throwing", async () => {
    const engine = makeEngine();
    delete engine.zoomIn;
    const adapter = new BrowserActionAdapter({ engine });
    const result = await adapter.zoomIn();
    assert.equal(result.success, false);
    assert.match(result.error, /does not support zoomIn/);
});

/* ---------------- no arbitrary JavaScript execution ---------------- */

test("BrowserActionAdapter exposes no executeScript/runJs/eval-style method", () => {
    const adapter = new BrowserActionAdapter({ engine: makeEngine() });
    assert.equal(typeof adapter.executeScript, "undefined");
    assert.equal(typeof adapter.runJs, "undefined");
    assert.equal(typeof adapter.evaluate, "undefined");
    assert.equal(typeof adapter.eval, "undefined");
});

test("an engine result containing script-like text is returned as plain data only, never evaluated", async () => {
    const engine = makeEngine({
        findInPage: () => ({ matches: 1, snippet: "<script>global.PWNED = true;</script>" })
    });
    const adapter = new BrowserActionAdapter({ engine });
    const result = await adapter.find("cats");

    assert.equal(result.success, true);
    assert.equal(typeof result.data.snippet, "string");
    assert.equal(global.PWNED, undefined);
});
