"use strict";

(() => {
    const list = document.getElementById("assistantTaskList");
    const form = document.getElementById("assistantTaskForm");
    const input = document.getElementById("assistantTaskInput");
    if (!list || !form || !input) return;

    const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
    const stateLabel = (value) => String(value || "UNKNOWN").replaceAll("_", " ");

    function render(tasks) {
        if (!Array.isArray(tasks) || !tasks.length) {
            list.innerHTML = '<div class="background-empty">No agent tasks yet. Describe a supported task above to begin.</div>';
            return;
        }
        list.innerHTML = tasks.slice().reverse().map((task) => {
            const steps = Array.isArray(task.steps) ? task.steps : [];
            const verification = task.verification || { status: "PENDING", steps: [] };
            const runtime = task.metadata?.runtime || {};
            const checkByStep = new Map((verification.steps || []).map((entry) => [entry.stepId, entry]));
            const actions = [];
            if (task.status === "waiting_approval") actions.push(`<button type="button" data-action="approve" data-id="${escapeHtml(task.taskId)}">APPROVE</button>`);
            if (["pending", "planning", "running", "waiting_approval"].includes(task.status)) actions.push(`<button type="button" data-action="cancel" data-id="${escapeHtml(task.taskId)}">CANCEL</button>`);
            const resultSummary = task.result && typeof task.result === "object"
                ? String(task.result.title || task.result.path || task.result.filePath || task.result.url || task.result.message || task.result.summary || "").slice(0, 360)
                : String(task.result || "").slice(0, 360);
            const researchStep = steps.find(step => step.action === "run_research" && step.status === "completed");
            const researchFindings = Array.isArray(researchStep?.result?.findings) ? researchStep.result.findings.slice(0, 4) : [];
            const failedSources = Array.isArray(researchStep?.result?.failedSources) ? researchStep.result.failedSources : (Array.isArray(researchStep?.result?.results) ? researchStep.result.results.filter(source => source?.success === false) : []);
            return `<article class="background-job-item assistant-task-item">
                <div class="background-job-top"><strong>${escapeHtml(task.userRequest || task.category)}</strong><span class="background-status-badge">${escapeHtml(stateLabel(task.status))} · CHECK ${escapeHtml(stateLabel(verification.status))}</span></div>
                <small>${escapeHtml(task.taskId)} · ${escapeHtml(task.category)} · ${escapeHtml(task.updatedAt || task.createdAt)}${Number.isFinite(runtime.durationMs) ? ` · ${Math.max(0, runtime.durationMs)} ms` : ""}${runtime.classificationSource ? ` · routed by ${escapeHtml(runtime.classificationSource)}` : ""}</small>
                ${runtime.classificationFallback ? `<small class="assistant-task-fallback">Fallback: ${escapeHtml(runtime.classificationFallback)}</small>` : ""}
                ${task.error ? `<p class="assistant-task-error">${escapeHtml(task.error)}</p>` : ""}
                ${task.status === "waiting_approval" ? `<p class="assistant-task-approval"><strong>Approval required:</strong> ${escapeHtml(task.metadata?.approvalReason || "Review this action before it runs.")}</p>` : ""}
                ${resultSummary ? `<p class="assistant-task-result"><strong>Action result:</strong> ${escapeHtml(resultSummary)}</p>` : ""}
                ${researchFindings.length ? `<div class="assistant-task-result"><strong>Source-backed findings</strong><ul>${researchFindings.map(finding => `<li>${escapeHtml(String(finding).slice(0, 500))}</li>`).join("")}</ul></div>` : ""}
                ${failedSources.length ? `<div class="assistant-task-fallback"><strong>Research source status</strong><ul>${failedSources.map(source => `<li>${escapeHtml(source.source || "Research source")} · ${escapeHtml(stateLabel(source.errorType || "unavailable"))}: ${escapeHtml(String(source.error || "No result returned.").slice(0, 360))}</li>`).join("")}</ul><small>The requested presentation continues with available evidence and the configured content provider.</small></div>` : ""}
                <ol class="assistant-task-steps">${steps.map((step) => {
                    const check = checkByStep.get(step.stepId || step.action) || checkByStep.get(step.action);
                    const evidence = (check?.evidence || []).map((item) => item.type + (item.count ? ` (${item.count})` : "")).join(", ");
                    const reason = check?.reason || step.error || evidence;
                    const proof = (check?.evidence || []).map((item) => {
                        if (item.type === "source" && /^https?:\/\//i.test(String(item.url || ""))) {
                            return `<button type="button" class="assistant-evidence-link" data-open-evidence="${escapeHtml(item.url)}">${escapeHtml(item.title || item.provider || "Open source")}</button>`;
                        }
                        if (item.type === "browser-tab" && /^https?:\/\//i.test(String(item.url || ""))) {
                            return `<button type="button" class="assistant-evidence-link" data-open-evidence="${escapeHtml(item.url)}">Opened: ${escapeHtml(item.title || item.url)}</button>`;
                        }
                        if (item.type === "file" || item.type === "pptx-package" || item.type === "docx-package" || item.type === "pdf-signature") {
                            const file = item.path || "";
                            return file ? `<span class="assistant-evidence-file">Verified file: ${escapeHtml(file)}${item.size ? ` · ${Math.round(item.size / 1024)} KB` : ""}</span>` : "";
                        }
                        return "";
                    }).filter(Boolean).join("");
                    return `<li><span>${escapeHtml(step.description || step.action)}</span><small>${escapeHtml(stateLabel(step.status))} · ${escapeHtml(stateLabel(check?.status || "PENDING"))}${reason ? ` · ${escapeHtml(reason)}` : ""}</small>${proof ? `<div class="assistant-task-proof">${proof}</div>` : ""}</li>`;
                }).join("")}</ol>
                ${task.result?.filePath ? `<p>File: ${escapeHtml(task.result.filePath)}</p>` : ""}
                ${actions.length ? `<div class="assistant-task-actions">${actions.join("")}</div>` : ""}
            </article>`;
        }).join("");
    }

    async function refresh() {
        if (!window.jarvis?.tasks) return;
        const result = await window.jarvis.tasks.list();
        if (result?.success) render(result.tasks);
        else list.innerHTML = `<div class="background-empty">Task list unavailable: ${escapeHtml(result?.error || "IPC unavailable")}</div>`;
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const request = input.value.trim();
        if (!request || !window.jarvis?.tasks) return;
        const button = form.querySelector("button[type=submit]");
        button.disabled = true;
        button.textContent = "WORKING…";
        const result = await window.jarvis.tasks.create(request);
        if (result?.success) {
            input.value = "";
            await refresh();
        } else {
            list.innerHTML = `<div class="background-empty">${escapeHtml(result?.error || "Task could not be started.")}</div>`;
        }
        button.disabled = false;
        button.textContent = "RUN TASK";
    });

    list.addEventListener("click", async (event) => {
        const evidence = event.target.closest("[data-open-evidence]");
        if (evidence) {
            const url = evidence.dataset.openEvidence;
            if (!/^https?:\/\//i.test(url || "")) return;
            evidence.disabled = true;
            try {
                const result = await window.jarvis?.browser?.open?.(url);
                if (result?.success === false) evidence.title = result.error || "Could not open source";
            } catch (error) { evidence.title = error?.message || "Could not open source"; }
            finally { evidence.disabled = false; }
            return;
        }
        const button = event.target.closest("button[data-action]");
        if (!button) return;
        button.disabled = true;
        const result = button.dataset.action === "approve"
            ? await window.jarvis.tasks.approve(button.dataset.id)
            : await window.jarvis.tasks.cancel(button.dataset.id);
        if (!result?.success) button.title = result?.error || "Action failed";
        await refresh();
    });

    document.getElementById("assistantTasksRefresh")?.addEventListener("click", refresh);
    window.jarvis?.tasks?.onUpdate?.(() => refresh());
    window.jarvis?.presentations?.onTaskRequest?.(async (request) => {
        const requestId = String(request?.requestId || "");
        let result = { success: false, error: "The presentation workflow could not be started." };
        try {
            if (!requestId || typeof window.jarvis?.presentations?.create !== "function") {
                throw new Error("The existing presentation generator is unavailable.");
            }
            const sources = Array.isArray(request.sources) ? request.sources.filter(item => item?.success && /^https:\/\//i.test(String(item.url || ""))) : [];
            const wikipedia = sources.find(item => /wikipedia/i.test(String(item.source || item.provider || "")) || /(^|\.)wikipedia\.org\//i.test(String(item.url || "")));
            const extract = sources.slice(0, 6).map(item => `${item.title || item.source || "Research source"}: ${item.summary || ""}${item.url ? `\nSource URL: ${item.url}` : ""}`).join("\n\n").slice(0, 9000);
            const language = String(window.JARVISLanguageCore?.detectLanguage?.(request.userRequest || "") || "en").toLowerCase();
            result = await window.jarvis.presentations.create(request.topic, {
                language: ["hi", "hinglish", "en"].includes(language) ? language : "en",
                userRequest: String(request.userRequest || "").slice(0, 1000),
                source: {
                    title: wikipedia?.title || sources[0]?.title || request.topic,
                    extract,
                    url: wikipedia?.url || "",
                    thumbnail: wikipedia?.metadata?.thumbnail || "",
                    sources: sources.map(item => ({ title: item.title || item.source, source: item.source, url: item.url }))
                }
            });
            if (result?.data && typeof result.data === "object") result = result.data;
        } catch (error) {
            result = { success: false, error: String(error?.message || error).slice(0, 500) };
        }
        try { await window.jarvis?.tasks?.completePresentation?.(requestId, result); }
        catch (error) { console.error("Could not return the presentation result to the task agent:", error); }
        await refresh();
    });
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden && document.body.classList.contains("background-events-view-active")) refresh();
    });
})();
