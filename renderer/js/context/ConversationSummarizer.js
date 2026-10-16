"use strict";

/*
=========================================================
 JARVIS — DETERMINISTIC CONVERSATION SUMMARIZER
 Phase 12: Conversation Summarization.
=========================================================

This module intentionally does NOT call an AI/LLM. It compresses older
conversation turns into a small structured summary using conservative,
local heuristics. The summary is designed to preserve the information
that matters for continuity: decisions, unresolved tasks, technical
context, user context, and topics.
=========================================================
*/

const MAX_ITEMS = 8;
const MAX_ITEM_LENGTH = 180;
const MAX_TOPICS = 8;

const SENSITIVE_PATTERNS = [
    /password\s*(?:is|:)?\s*\S+/i,
    /api\s*key\s*(?:is|:)?\s*\S+/i,
    /access\s*token\s*(?:is|:)?\s*\S+/i,
    /auth(?:entication)?\s*token\s*(?:is|:)?\s*\S+/i,
    /secret\s*(?:is|:)?\s*\S+/i,
    /\b(?:sk|pk)_[a-z0-9_-]{10,}\b/i
];

const TECHNICAL_TERMS = [
    "javascript", "typescript", "node", "electron", "ipc", "preload",
    "renderer", "api", "json", "sqlite", "database", "memory", "context",
    "pending intent", "intent", "router", "browser", "stt", "tts",
    "github", "wikipedia", "weather", "currency", "product search",
    "react", "next.js", "python", "html", "css", "npm", "package.json"
];

function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function isSensitive(text) {
    return SENSITIVE_PATTERNS.some((pattern) => pattern.test(text));
}

function compact(text) {
    const clean = cleanText(text);
    if (clean.length <= MAX_ITEM_LENGTH) return clean;
    return `${clean.slice(0, MAX_ITEM_LENGTH - 1).trimEnd()}…`;
}

function uniquePush(list, value, limit = MAX_ITEMS) {
    const clean = compact(value);
    if (!clean || isSensitive(clean)) return;
    const normalized = clean.toLowerCase();
    if (list.some((item) => item.toLowerCase() === normalized)) return;
    list.push(clean);
    if (list.length > limit) list.splice(0, list.length - limit);
}

function addTurnFacts(summary, turn) {
    const text = cleanText(turn?.text);
    if (!text || isSensitive(text)) return;

    const lower = text.toLowerCase();

    if (turn.role === "user") {
        if (/\b(?:decided|decide|choose|chose|selected|selecting|use|using|going with|we will|let's use|i'll use)\b/i.test(text)) {
            uniquePush(summary.decisions, text);
        }

        if (/\b(?:todo|to-do|pending|unfinished|need to|needs to|still need|not finished|fix|implement|add|build|create|continue|next phase|working on|want to build)\b/i.test(text)) {
            uniquePush(summary.unresolvedTasks, text);
        }

        if (/\b(?:my|i am|i'm|i want|i prefer|i use|i'm building|mera|meri|mujhe)\b/i.test(text)) {
            uniquePush(summary.userContext, text);
        }
    }

    const matchedTerms = TECHNICAL_TERMS.filter((term) => lower.includes(term));
    for (const term of matchedTerms.slice(0, 3)) {
        uniquePush(summary.technicalContext, `${term}: ${text}`);
    }

    if (/\b(?:discuss|talk|topic|about|regarding|working on|phase)\b/i.test(text)) {
        const topic = text
            .replace(/^(?:tell me about|what about|let's discuss|discuss|talk about)\s+/i, "")
            .replace(/[?.!]+$/, "")
            .trim();
        if (topic && topic.length <= 80) uniquePush(summary.topics, topic, MAX_TOPICS);
    }
}

function normalizeSummary(previous) {
    const base = previous && typeof previous === "object" ? previous : {};
    return {
        version: 1,
        decisions: Array.isArray(base.decisions) ? base.decisions.slice(-MAX_ITEMS) : [],
        unresolvedTasks: Array.isArray(base.unresolvedTasks) ? base.unresolvedTasks.slice(-MAX_ITEMS) : [],
        technicalContext: Array.isArray(base.technicalContext) ? base.technicalContext.slice(-MAX_ITEMS) : [],
        userContext: Array.isArray(base.userContext) ? base.userContext.slice(-MAX_ITEMS) : [],
        topics: Array.isArray(base.topics) ? base.topics.slice(-MAX_TOPICS) : [],
        summarizedTurns: Number(base.summarizedTurns) > 0 ? Number(base.summarizedTurns) : 0,
        updatedAt: Number(base.updatedAt) > 0 ? Number(base.updatedAt) : null
    };
}

function buildSummaryText(summary) {
    const sections = [];
    if (summary.decisions.length) sections.push(`Decisions: ${summary.decisions.join(" | ")}`);
    if (summary.unresolvedTasks.length) sections.push(`Unresolved tasks: ${summary.unresolvedTasks.join(" | ")}`);
    if (summary.technicalContext.length) sections.push(`Technical context: ${summary.technicalContext.join(" | ")}`);
    if (summary.userContext.length) sections.push(`Relevant user context: ${summary.userContext.join(" | ")}`);
    if (summary.topics.length) sections.push(`Topics: ${summary.topics.join(" | ")}`);
    return sections.join("\n");
}

function buildConversationSummary(turns, previousSummary = null) {
    const summary = normalizeSummary(previousSummary);
    const sourceTurns = Array.isArray(turns) ? turns : [];

    for (const turn of sourceTurns) addTurnFacts(summary, turn);

    summary.summarizedTurns += sourceTurns.length;
    summary.updatedAt = Date.now();
    summary.text = buildSummaryText(summary);
    return summary;
}

if (typeof window !== "undefined") {
    window.JARVISConversationSummarizer = { summarizeTurns: buildConversationSummary };
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { summarizeTurns: buildConversationSummary };
}
