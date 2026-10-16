"use strict";

const fs = require("node:fs");
const path = require("node:path");
const classifier = require("../src/assistant/classifier");
const safetyGate = require("../src/assistant/safetyGate");

function option(name) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : "";
}

function percentile(values, fraction) {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function summarizeRuntimeStore(filePath) {
    if (!filePath) return { available: false, note: "Pass --task-store <tasks.json> to include real Task Agent runs." };
    try {
        const payload = JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
        const tasks = Array.isArray(payload) ? payload : payload.tasks;
        if (!Array.isArray(tasks)) throw new Error("Task store does not contain a tasks array.");
        const completed = tasks.filter(task => task.status === "completed");
        const verified = tasks.filter(task => task.verification?.status === "VERIFIED");
        const runtimes = tasks.map(task => Number(task.metadata?.runtime?.durationMs)).filter(Number.isFinite);
        const failures = tasks.filter(task => task.status === "failed");
        const fallbackTasks = tasks.filter(task => task.metadata?.classificationFallbackReason || task.metadata?.runtime?.classificationFallback);
        const retries = tasks.reduce((sum, task) => sum + Number(task.metadata?.runtime?.retryCount || 0), 0);
        const failureReasons = {};
        for (const task of failures) {
            const reason = String(task.error || task.metadata?.runtime?.failureReason || "Unspecified failure").slice(0, 180);
            failureReasons[reason] = (failureReasons[reason] || 0) + 1;
        }
        return {
            available: true, totalTasks: tasks.length,
            completedRatePercent: tasks.length ? Math.round(completed.length / tasks.length * 100) : 0,
            independentlyVerifiedRatePercent: tasks.length ? Math.round(verified.length / tasks.length * 100) : 0,
            averageTaskDurationMs: runtimes.length ? Math.round(runtimes.reduce((a, b) => a + b, 0) / runtimes.length) : null,
            p95TaskDurationMs: percentile(runtimes, 0.95),
            failedTasks: failures.length, fallbackTasks: fallbackTasks.length, retries,
            failureReasons
        };
    } catch (error) {
        return { available: false, error: String(error.message || error) };
    }
}

const casesPath = path.join(__dirname, "..", "docs", "jarvis-agent-eval-cases.json");
const cases = JSON.parse(fs.readFileSync(casesPath, "utf8"));
const durations = [];
const results = cases.map(testCase => {
    const started = process.hrtime.bigint();
    const predicted = classifier.classify(testCase.command);
    const approvalRequired = safetyGate.requiresApproval(predicted, testCase.command);
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    durations.push(durationMs);
    return {
        id: testCase.id,
        expectedCategory: testCase.category,
        actualCategory: predicted.category,
        categoryCorrect: predicted.category === testCase.category,
        expectedApproval: testCase.approval,
        actualApproval: approvalRequired,
        approvalCorrect: approvalRequired === testCase.approval,
        unsafeApprovalMiss: testCase.approval && !approvalRequired,
        unnecessaryApproval: !testCase.approval && approvalRequired,
        unintendedActionProxy: testCase.category === "unsupported" && predicted.category !== "unsupported",
        latencyMs: Number(durationMs.toFixed(3)),
        command: testCase.command
    };
});

const correctCategories = results.filter(item => item.categoryCorrect).length;
const correctApprovals = results.filter(item => item.approvalCorrect).length;
const approvalCases = results.filter(item => item.expectedApproval);
const unsafeMisses = results.filter(item => item.unsafeApprovalMiss);
const report = {
    generatedAt: new Date().toISOString(),
    mode: "offline deterministic evaluation; no application, browser, file, network, or system action is executed",
    dataset: path.relative(path.join(__dirname, ".."), casesPath).replaceAll(path.sep, "/"),
    metrics: {
        commands: results.length,
        categoryAccuracyPercent: Math.round(correctCategories / results.length * 100),
        approvalDecisionAccuracyPercent: Math.round(correctApprovals / results.length * 100),
        approvalRecallPercent: approvalCases.length ? Math.round((approvalCases.length - unsafeMisses.length) / approvalCases.length * 100) : 100,
        falseApprovalCount: results.filter(item => item.unnecessaryApproval).length,
        unsafeApprovalMisses: unsafeMisses.length,
        unintendedActionProxies: results.filter(item => item.unintendedActionProxy).length,
        averageLocalDecisionMs: Number((durations.reduce((sum, value) => sum + value, 0) / durations.length).toFixed(3)),
        p95LocalDecisionMs: Number(percentile(durations, 0.95).toFixed(3))
    },
    taskAgentRuntime: summarizeRuntimeStore(option("--task-store")),
    failures: results.filter(item => !item.categoryCorrect || !item.approvalCorrect || item.unintendedActionProxy),
    cases: results
};

const outputPath = option("--out");
if (outputPath) {
    const resolved = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, JSON.stringify(report, null, 2), "utf8");
    console.log(`Report saved: ${resolved}`);
}
console.log(JSON.stringify({ ...report, cases: undefined }, null, 2));
if (report.failures.length) process.exitCode = 1;
