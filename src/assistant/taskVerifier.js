"use strict";

// Independent, evidence-based checks. Adapter success is never enough by itself.
const STATUSES = Object.freeze({
    PENDING: "PENDING", RUNNING: "RUNNING", VERIFIED: "VERIFIED", FAILED: "FAILED",
    PARTIALLY_VERIFIED: "PARTIALLY_VERIFIED", NEEDS_USER_ACTION: "NEEDS_USER_ACTION",
    CANCELLED: "CANCELLED", UNKNOWN: "UNKNOWN"
});
const fs = require("fs");
const path = require("path");
const os = require("os");
const JSZip = require("jszip");

async function verifyGeneratedFile(task, step, deps = {}) {
    const output = step.result || task.result || {};
    const filePath = String(output.path || output.filePath || output.outputPath || "").trim();
    if (!filePath) return { status: STATUSES.UNKNOWN, evidence: [], reason: "The action did not return a file path." };
    const allowedRoots = (Array.isArray(deps.allowedFileRoots) ? deps.allowedFileRoots : [
        path.join(os.homedir(), "Documents", "JARVIS Presentations"),
        path.join(os.homedir(), "Documents", "JARVIS Documents")
    ]).map((item) => path.resolve(item) + path.sep);
    const resolved = path.resolve(filePath);
    if (!allowedRoots.some((root) => resolved.startsWith(root))) {
        return { status: STATUSES.NEEDS_USER_ACTION, evidence: [], reason: "The generated-file path is outside JARVIS output folders." };
    }
    try {
        const stat = await fs.promises.stat(resolved);
        if (!stat.isFile() || stat.size <= 0) return { status: STATUSES.FAILED, evidence: [{ type: "file", path: resolved, size: stat.size }], reason: "The output file is empty or not a regular file." };
        let realFile = resolved;
        let realRoots = allowedRoots;
        let pathResolutionWarning = null;
        try {
            realFile = await fs.promises.realpath(resolved);
            realRoots = await Promise.all(allowedRoots.map(root => fs.promises.realpath(root).catch(() => null)));
        } catch (resolutionError) {
            // Some managed Windows sandboxes deny realpath() even though
            // stat/read are allowed. Keep the already-validated lexical root
            // check instead of falsely marking a real generated file failed.
            if (!(["EPERM", "EACCES"].includes(resolutionError?.code))) throw resolutionError;
            pathResolutionWarning = `Canonical path check unavailable (${resolutionError.code}); lexical output-root check used.`;
        }
        if (!realRoots.some(root => {
            if (!root) return false;
            const relative = path.relative(root, realFile);
            return relative && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
        })) return { status: STATUSES.NEEDS_USER_ACTION, evidence: [], reason: "The generated file resolves outside JARVIS output folders." };
        if (stat.size > 64 * 1024 * 1024) return { status: STATUSES.NEEDS_USER_ACTION, evidence: [], reason: "The output exceeds the 64 MiB automatic verification limit." };
        const ext = path.extname(resolved).toLowerCase();
        if (ext === ".pptx" || ext === ".docx") {
            const zip = await JSZip.loadAsync(await fs.promises.readFile(resolved), { checkCRC32: true });
            const names = Object.keys(zip.files);
            const required = ext === ".pptx" ? "ppt/presentation.xml" : "word/document.xml";
            const hasMain = Boolean(zip.file(required));
            if (!hasMain) return { status: STATUSES.FAILED, evidence: [{ type: "office-package", path: resolved, requiredPart: required, present: false }], reason: `Required ${ext.toUpperCase()} package part is missing.` };
            if (ext === ".pptx") {
                const presentationXml = await zip.file(required).async("string");
                const declaredSlides = (presentationXml.match(/<p:sldId\b/g) || []).length;
                const slideNames = names.filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name));
                if (!/<p:presentation\b/.test(presentationXml) || declaredSlides < 1 || declaredSlides !== slideNames.length) {
                    return { status: STATUSES.FAILED, evidence: [{ type: "pptx-slides", declared: declaredSlides, packaged: slideNames.length }], reason: "The PowerPoint package has missing or inconsistent slide parts." };
                }
                let readableSlides = 0;
                for (const name of slideNames) {
                    const xml = await zip.file(name).async("string");
                    if (!/<p:sld\b/.test(xml) || !/<p:spTree\b/.test(xml) || !/<a:t>[^<]*\S[^<]*<\/a:t>/.test(xml)) {
                        return { status: STATUSES.FAILED, evidence: [{ type: "pptx-slide", name, readable: false }], reason: `Slide ${name} is missing readable text or slide structure.` };
                    }
                    readableSlides += 1;
                }
                return { status: STATUSES.VERIFIED, evidence: [{ type: "pptx-package", path: resolved, size: stat.size, requiredPart: required, slideCount: declaredSlides, readableSlides, ...(pathResolutionWarning ? { warning: pathResolutionWarning } : {}) }] };
            }
            const document = await require("mammoth").extractRawText({ buffer: await fs.promises.readFile(resolved) });
            if (!document.value.trim()) return { status: STATUSES.FAILED, evidence: [], reason: "The Word document contains no readable text." };
            return { status: STATUSES.VERIFIED, evidence: [{ type: "docx-content", path: resolved, size: stat.size, textCharacters: document.value.trim().length }] };
        }
        if (ext === ".pdf") {
            const document = await require("pdf-parse")(await fs.promises.readFile(resolved));
            if (!Number.isInteger(document.numpages) || document.numpages < 1) return { status: STATUSES.FAILED, evidence: [], reason: "The PDF has no readable pages." };
            return { status: STATUSES.VERIFIED, evidence: [{ type: "pdf-content", path: resolved, size: stat.size, pages: document.numpages, textCharacters: document.text.trim().length }] };
        }
        if (ext === ".xlsx") {
            const bytes = await fs.promises.readFile(resolved);
            const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
            if (!zip.file("xl/workbook.xml")) throw new Error("The Excel package is missing its workbook part.");
            const workbook = require("xlsx").read(bytes, { type: "buffer", cellFormula: true });
            const populated = workbook.SheetNames.filter(name => Object.entries(workbook.Sheets[name]).some(([key, cell]) => !key.startsWith("!") && (cell?.v != null || cell?.f)));
            if (!populated.length) throw new Error("The Excel workbook contains no populated sheets.");
            return { status: STATUSES.VERIFIED, evidence: [{ type: "xlsx-content", path: resolved, size: stat.size, sheets: populated }] };
        }
        return { status: STATUSES.NEEDS_USER_ACTION, evidence: [{ type: "file", path: resolved, size: stat.size }], reason: `File exists, but ${ext || "this format"} has no content parser configured.` };
    } catch (error) {
        return { status: STATUSES.FAILED, evidence: [{ type: "file-check", path: resolved }], reason: String(error?.message || error) };
    }
}

async function verifyStep(task, step, deps = {}) {
    const at = new Date().toISOString();
    if (!step) return { status: STATUSES.UNKNOWN, evidence: [], verifiedAt: at };
    if (step.status === "failed") return { status: STATUSES.FAILED, evidence: [{ type: "execution-error", message: String(step.error || "Action failed.").slice(0, 300) }], verifiedAt: at };
    if (step.status === "cancelled") return { status: STATUSES.CANCELLED, evidence: [], verifiedAt: at };
    if (step.status !== "completed") return { status: ["running", "paused"].includes(step.status) ? STATUSES.RUNNING : STATUSES.PENDING, evidence: [], verifiedAt: at };
    try {
        if (typeof deps.verifyStep === "function") {
            const result = await deps.verifyStep(task, step);
            if (result && Object.values(STATUSES).includes(result.status)) return { ...result, verifiedAt: result.verifiedAt || at };
        }
        if (["create_file", "create_presentation", "create_pdf", "create_document"].includes(step.action)) {
            return { ...(await verifyGeneratedFile(task, step, deps)), verifiedAt: at };
        }
        if (step.action === "execute_application_action") {
            const result = step.result || {};
            const pid = Number(result.pid || result.processId || result.data?.pid);
            if (Number.isInteger(pid) && pid > 0 && typeof deps.processExists === "function") {
                const exists = await deps.processExists(pid);
                return { status: exists ? STATUSES.VERIFIED : STATUSES.FAILED, evidence: [{ type: "process", pid, exists }], verifiedAt: at };
            }
            return { status: STATUSES.UNKNOWN, evidence: [], reason: "Application launch returned no independently checkable process ID.", verifiedAt: at };
        }
        if (step.action === "execute_browser_action" && typeof deps.getBrowserState === "function") {
            const state = await deps.getBrowserState();
            const tabId = step.result?.tabId || step.result?.id || step.result?.data?.tabId;
            const tabs = Array.isArray(state) ? state : state?.tabs;
            const match = Array.isArray(tabs) && (tabId ? tabs.find((tab) => tab.id === tabId || tab.tabId === tabId) : tabs[0]);
            const url = String(match?.url || "");
            const safeUrl = /^https?:\/\//i.test(url) ? url : "";
            return { status: match ? STATUSES.VERIFIED : STATUSES.UNKNOWN, evidence: match ? [{ type: "browser-tab", tabId: tabId || match.id || null, title: String(match.title || "").slice(0, 180), url: safeUrl }] : [], reason: match ? null : "Current browser state could not confirm the requested tab.", verifiedAt: at };
        }
        if (step.action === "run_research") {
            const findings = step.result?.findings;
            const sources = step.result?.results || step.result?.sources;
            if (Array.isArray(findings) && findings.length && Array.isArray(sources) && sources.some((source) => source?.success === true)) {
                const sourceEvidence = sources.filter((source) => source?.success === true && /^https?:\/\//i.test(String(source.url || "")))
                    .slice(0, 6).map((source) => ({
                        type: "source",
                        title: String(source.title || source.name || source.provider || "Research source").slice(0, 180),
                        provider: String(source.provider || source.source || "").slice(0, 80),
                        url: String(source.url).slice(0, 1000)
                    }));
                return { status: STATUSES.VERIFIED, evidence: [{ type: "research-sources", count: sources.length, findings: findings.length }, ...sourceEvidence], verifiedAt: at };
            }
            return { status: STATUSES.PARTIALLY_VERIFIED, evidence: [], reason: "Research returned no source-backed findings to verify.", verifiedAt: at };
        }
        if (["validate_system_request", "validate_application_request", "validate_browser_request", "validate_research_request", "validate_memory_request", "record_result", "record_result_from_research", "normalize_result"].includes(step.action)) {
            return { status: STATUSES.VERIFIED, evidence: [{ type: "task-record", step: step.action }], verifiedAt: at };
        }
        return { status: STATUSES.UNKNOWN, evidence: [], reason: "No independent verifier is available for this action.", verifiedAt: at };
    } catch (error) {
        return { status: STATUSES.UNKNOWN, evidence: [], reason: String(error?.message || error), verifiedAt: at };
    }
}

async function verifyTask(task, deps = {}) {
    const steps = Array.isArray(task?.steps) ? task.steps : [];
    if (!steps.length) return { status: STATUSES.UNKNOWN, evidence: [], reason: "Task has no executable steps.", verifiedAt: new Date().toISOString() };
    const results = [];
    for (const step of steps) results.push({ stepId: step.stepId || step.action, ...(await verifyStep(task, step, deps)) });
    const statuses = results.map((entry) => entry.status);
    let status = STATUSES.UNKNOWN;
    if (statuses.every((item) => item === STATUSES.VERIFIED)) status = STATUSES.VERIFIED;
    else if (statuses.includes(STATUSES.FAILED)) status = statuses.includes(STATUSES.VERIFIED) ? STATUSES.PARTIALLY_VERIFIED : STATUSES.FAILED;
    else if (statuses.includes(STATUSES.NEEDS_USER_ACTION)) status = STATUSES.NEEDS_USER_ACTION;
    else if (statuses.includes(STATUSES.CANCELLED)) status = STATUSES.CANCELLED;
    else if (statuses.includes(STATUSES.PENDING) || statuses.includes(STATUSES.RUNNING)) status = STATUSES.RUNNING;
    else if (statuses.includes(STATUSES.VERIFIED)) status = STATUSES.PARTIALLY_VERIFIED;
    return { status, steps: results, evidence: results.flatMap((entry) => entry.evidence || []), verifiedAt: new Date().toISOString() };
}

module.exports = { STATUSES, verifyStep, verifyTask, verifyGeneratedFile };
