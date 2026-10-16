"use strict";

/**
 * ============================================================
 * JARVIS ASSISTANT TASK PLANNER (Phase 6)
 * ============================================================
 *
 * Turns a classified request into a deterministic list of steps.
 * No AI/LLM involved: every plan below is a fixed template keyed
 * only on `category` (and, for browser/application actions, simple
 * substring extraction of the target/query — never invented).
 *
 * Each step: { stepId, action, description, status, result, error }
 * status starts "pending" and is mutated in place by TaskExecutor.
 * ============================================================
 */

function step(action, description) {
    return {
        action,
        description,
        status: "pending",
        result: null,
        error: null
    };
}

/** Best-effort, non-fabricating extraction of a search/browse target from raw text. */
function extractTarget(text) {
    const cleaned = String(text || "").trim();
    const openInBrowser = cleaned.match(/(?:open|go to)\s+(.+?)\s+(?:in|on)\s+(?:the\s+)?(?:browser|chrome|edge)$/i);
    if (openInBrowser?.[1]) return openInBrowser[1].trim();
    const findOnSite = cleaned.match(/(?:find|search)(?:\s+for)?\s+(.+?)\s+(?:on|in)\s+(?:google|wikipedia|youtube|the web|the browser)$/i);
    if (findOnSite?.[1]) return findOnSite[1].trim();
    const topicFirstSearch = cleaned.match(/(.+?)\s+(?:find|search)\s+(?:on|in)\s+(?:google|wikipedia|youtube|the web|the browser)$/i);
    if (topicFirstSearch?.[1]) return topicFirstSearch[1].trim();
    // "open chrome and search minecraft" -> "minecraft"
    const searchMatch = cleaned.match(/(?:search|find) (?:for )?(.+?)(?:\s+(?:on|in)\s+(?:google|chrome|the browser|the web))?$/i);
    if (searchMatch && searchMatch[1]) return searchMatch[1].trim();

    // "navigate to https://example.com" / "go to example.com"
    const urlMatch = cleaned.match(/(?:navigate to|go to|browse to)\s+(.+)$/i);
    if (urlMatch && urlMatch[1]) return urlMatch[1].trim();

    return cleaned;
}

/** Best-effort extraction of an application name for application_action. */
function extractAppName(text) {
    const cleaned = String(text || "").trim();
    const match = cleaned.match(/\b(open|launch|start|close)\s+(?:the\s+)?(.+)$/i);
    return match && match[2] ? match[2].trim() : cleaned;
}

/** Detects one of the Phase 7 fine-grained browser sub-actions, or null
 * to fall back to the original Phase 6 generic open/search flow. */
function detectBrowserSubAction(text) {
    const t = String(text || "").toLowerCase();
    if (/\bnew tab\b/.test(t)) return "newTab";
    if (/\bclose (this |the )?tab\b/.test(t)) return "closeTab";
    if (/\bswitch (to )?tab\b/.test(t)) return "switchTab";
    if (/\b(go back|navigate back)\b/.test(t)) return "back";
    if (/\b(go forward|navigate forward)\b/.test(t)) return "forward";
    if (/\breload\b|\brefresh (the )?page\b/.test(t)) return "reload";
    if (/\bstop loading\b/.test(t)) return "stop";
    if (/\bclear (my )?downloads\b/.test(t)) return "clearDownloads";
    if (/\bclear (my )?(browser )?history\b/.test(t)) return "clearHistory";
    return null;
}

/**
 * Builds a plan (array of steps) for a classified task.
 *
 * @param {{category:string, userRequest:string, destructiveAction?:string|null}} task
 * @returns {Array<object>}
 */
function plan(task) {
    const { category, userRequest, destructiveAction } = task;

    switch (category) {
        case "conversation":
            return [step("respond_conversationally", "Generate a deterministic conversational acknowledgement.")];

        case "system_command":
            return [
                step("validate_system_request", "Validate the requested system command."),
                step(
                    `system_${destructiveAction || "command"}`,
                    `Execute system command (${destructiveAction || "unspecified"}) — requires approval first.`
                )
            ];

        case "application_action": {
            const app = extractAppName(userRequest);
            return [
                step("validate_application_request", `Validate requested application: ${app}.`),
                step("execute_application_action", `Perform application action on: ${app}.`),
                step("record_result", "Record the outcome of the application action.")
            ];
        }

        case "browser_action": {
            const subAction = detectBrowserSubAction(userRequest);
            if (subAction) {
                const destructive = subAction === "clearHistory" || subAction === "clearDownloads";
                return [
                    step("validate_browser_request", `Validate browser sub-action: ${subAction}.`),
                    step(
                        `browser_${subAction}`,
                        destructive
                            ? `Execute destructive browser action (${subAction}) — requires approval first.`
                            : `Execute browser sub-action: ${subAction}.`
                    ),
                    step("record_result", "Record the outcome of the browser action.")
                ];
            }

            const target = extractTarget(userRequest);
            return [
                step("validate_browser_request", `Validate browser target: ${target}.`),
                step("execute_browser_action", `Use the existing browser system to act on: ${target}.`),
                step("record_result", "Record the outcome of the browser action.")
            ];
        }

        case "research":
        case "information": {
            const query = extractTarget(userRequest);
            return [
                step("validate_research_request", `Validate research query: ${query}.`),
                step("run_research", "Query the existing Phase 5 Research Provider."),
                step("normalize_result", "Normalize the research result (provenance preserved)."),
                step("record_result", "Record the research outcome in task history.")
            ];
        }

        case "presentation": {
            const topic = require("./classifier").extractPresentationTopic(userRequest) || extractTarget(userRequest);
            return [
                step("validate_research_request", `Validate research query: ${topic}.`),
                step("run_research", `Research ${topic} using the existing read-only research sources; keep source URLs and failures.`),
                step("normalize_result", "Prepare source-backed research context for the requested presentation."),
                step("create_presentation", `Create and save a verified PPTX about: ${topic}.`)
            ];
        }

        case "memory":
            return [
                step("validate_memory_request", "Validate the requested memory operation (remember/recall/forget)."),
                step("execute_memory_action", "Perform the operation via the existing MemoryEngine."),
                step("record_result", "Record the outcome of the memory operation.")
            ];

        case "task":
            return [
                step("locate_task", "Locate the referenced task in task history."),
                step("resume_or_report", "Resume the task from its last completed step, or report its status.")
            ];

        case "goal":
            return [
                step("query_goal_registry", "Read goal state from the existing goalRegistry."),
                step("record_result", "Record the goal information for the user.")
            ];

        case "evolution":
            return [
                step("delegate_to_evolution_engine", "Delegate to the existing EvolutionEngine (observe -> select -> analyze -> propose)."),
                step("await_or_report_approval", "Report proposal status; approval remains gated by EvolutionEngine's own approval system.")
            ];

        case "unsupported":
        default:
            return [step("reject_unsupported", "Request category is not supported by the deterministic assistant.")];
    }
}

module.exports = { plan, extractTarget, extractAppName };
