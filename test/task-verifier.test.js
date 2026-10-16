"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { STATUSES, verifyStep, verifyTask } = require("../src/assistant/taskVerifier");
const { AssistantOrchestrator } = require("../src/assistant/assistantOrchestrator");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createPptxBuffer } = require("../src/presentation/pptxGenerator");

function tempFile() { return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-task-agent-")), "tasks.json"); }

test("document verification rejects counterfeit PDF and DOCX content", async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-invalid-docs-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const pdf = path.join(directory, "fake.pdf");
    fs.writeFileSync(pdf, "%PDF-1.7\nThis is not a PDF document.");
    const docx = path.join(directory, "fake.docx");
    const zip = new (require("jszip"))();
    zip.file("word/document.xml", "not a Word document");
    fs.writeFileSync(docx, await zip.generateAsync({ type: "nodebuffer" }));
    for (const file of [pdf, docx]) {
        const result = await verifyStep({}, { action: "create_document", status: "completed", result: { path: file } }, { allowedFileRoots: [directory] });
        assert.equal(result.status, STATUSES.FAILED, file);
    }
});

test("document verification reads generated Word and Excel files", async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-office-verify-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const docx = path.join(directory, "report.docx");
    fs.writeFileSync(docx, await require("../src/documents/officeFileGenerator").buildDocxBuffer({ title: "Verified report", content: "A readable report with actual content." }));
    const xlsx = path.join(directory, "expenses.xlsx");
    await require("../src/documents/spreadsheetGenerator").writeWorkbook("monthly expenses", xlsx);
    for (const file of [docx, xlsx]) {
        const result = await verifyStep({}, { action: "create_document", status: "completed", result: { path: file } }, { allowedFileRoots: [directory] });
        assert.equal(result.status, STATUSES.VERIFIED, result.reason);
    }
});

test("verifier never trusts a successful app tool result without independent process evidence", async () => {
    const result = await verifyStep({}, { action: "execute_application_action", status: "completed", result: { success: true, app: "Explorer" } });
    assert.equal(result.status, STATUSES.UNKNOWN);
});

test("verifier confirms application process state when PID can be checked", async () => {
    const result = await verifyStep({}, { action: "execute_application_action", status: "completed", result: { pid: 81 } }, { processExists: async () => true });
    assert.equal(result.status, STATUSES.VERIFIED);
    assert.deepEqual(result.evidence[0], { type: "process", pid: 81, exists: true });
});

test("research verification requires source-backed findings", async () => {
    const good = await verifyStep({}, { action: "run_research", status: "completed", result: { findings: ["fact"], results: [{ success: true }] } });
    const incomplete = await verifyStep({}, { action: "run_research", status: "completed", result: { findings: ["fact"], results: [] } });
    assert.equal(good.status, STATUSES.VERIFIED);
    assert.equal(incomplete.status, STATUSES.PARTIALLY_VERIFIED);
});

test("PPTX file verifier checks the real ZIP package and slide parts", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-pptx-verify-"));
    const filePath = path.join(directory, "sample.pptx");
    const deck = { title: "Minecraft", subtitle: "Research", slides: [{ title: "How it works", points: ["A real detail from the topic.", "A second useful detail about the topic."] }, { title: "Key takeaway", points: ["A clear conclusion for the audience.", "A practical application of the idea."] }] };
    await fs.promises.writeFile(filePath, await createPptxBuffer(deck, 3));
    const result = await verifyStep({}, { action: "create_presentation", status: "completed", result: { path: filePath } }, { allowedFileRoots: [directory] });
    assert.equal(result.status, STATUSES.VERIFIED);
    assert.equal(result.evidence[0].slideCount, 3);
    assert.equal(result.evidence[0].readableSlides, 3);
});

test("a nonexistent presentation path cannot be verified as a created file", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-missing-pptx-"));
    const result = await verifyStep({}, { action: "create_presentation", status: "completed", result: { path: path.join(directory, "missing.pptx") } }, { allowedFileRoots: [directory] });
    assert.equal(result.status, STATUSES.FAILED);
    assert.match(result.reason, /ENOENT|no such file/i);
});

test("task verification remains unknown if any outcome cannot be independently checked", async () => {
    const result = await verifyTask({ steps: [
        { action: "record_result", status: "completed" },
        { action: "unknown_action", status: "completed" }
    ] });
    assert.equal(result.status, STATUSES.PARTIALLY_VERIFIED);
});

test("Hindi/Hinglish application and browser instructions are classified and planned", async () => {
    const agent = new AssistantOrchestrator({ storagePath: tempFile(), systemAdapter: { openApplication: async () => ({ success: true }) } });
    const appTask = await agent.handleRequest("जार्विस फाइल एक्सप्लोरर खोलो");
    const webTask = await agent.handleRequest("Minecraft गूगल पर ढूँढो");
    assert.equal(appTask.category, "application_action");
    assert.match(appTask.steps[1].description, /file explorer/i);
    assert.equal(webTask.category, "browser_action");
    assert.match(webTask.steps[0].description, /Minecraft/i);
    const hinglishTask = await agent.handleRequest("Jarvis, File Explorer kholo");
    assert.equal(hinglishTask.category, "application_action");
    assert.match(hinglishTask.steps[1].description, /File Explorer/i);
});

test("provider-assisted intent only selects a fixed, allowlisted workflow", async () => {
    let opened = "";
    const agent = new AssistantOrchestrator({
        storagePath: tempFile(),
        classifyRequest: async () => ({ category: "conversation", action: "delete_everything" }),
        systemAdapter: { openApplication: async (name) => { opened = name; return { success: true }; } }
    });
    const task = await agent.handleRequest("please help me with this request");
    assert.equal(task.category, "conversation");
    assert.equal(task.steps.some((step) => step.action === "delete_everything"), false);
    assert.equal(opened, "");
});

test("read-only research retries once and records both attempts", async () => {
    const { run } = require("../src/assistant/taskExecutor");
    let attempts = 0;
    const task = { taskId: "TASK-000009", status: "pending", currentStep: 0, requiresApproval: false, steps: [
        { action: "run_research", status: "pending", description: "research", result: null }
    ] };
    const result = await run(task, { research: { research: async () => {
        attempts++;
        if (attempts === 1) throw new Error("temporary source error");
        return { findings: ["fact"], results: [{ success: true }] };
    } } });
    assert.equal(result.status, "completed");
    assert.equal(attempts, 2);
    assert.equal(result.steps[0].retryHistory.length, 2);
});

test("cancellation during an action prevents issuing the next step", async () => {
    let taskRecord = { taskId: "TASK-000001", status: "running" };
    let called = 0;
    const task = { taskId: taskRecord.taskId, status: "running", currentStep: 0, requiresApproval: false, steps: [
        { action: "execute_application_action", status: "pending", description: "open: Explorer", result: null },
        { action: "execute_application_action", status: "pending", description: "open: Explorer", result: null }
    ] };
    const { run } = require("../src/assistant/taskExecutor");
    const result = await run(task, {
        getTaskState: () => taskRecord,
        persist: (next) => { taskRecord = { ...next }; },
        systemAdapter: { openApplication: async () => { called++; taskRecord.status = "cancelled"; return { success: true }; } }
    });
    assert.equal(called, 1, "cancellation should stop subsequent actions");
    assert.equal(result.status, "cancelled");
});
