"use strict";

(() => {
    const list = document.getElementById("backgroundJobList");
    if (!list) return;
    const refreshButton = document.getElementById("backgroundJobsRefresh");
    const escape = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
    const unwrap = value => value?.data || value || {};
    let jobs = [];
    let knownJobStates = new Map();

    function render() {
        if (!jobs.length) {
            list.innerHTML = '<div class="background-empty">No document, research, or scheduled tasks are active.<br><button type="button" data-open-chat-job>Start a task in Chat</button></div>';
            return;
        }
        list.innerHTML = jobs.map(job => {
            const percent = Math.max(0, Math.min(100, Number(job.progress) || 0));
            const active = ["queued", "running", "cancelling"].includes(job.state);
            const scheduled = job.id === "scheduled-shutdown";
            const error = job.error ? `<small class="job-error">${escape(job.error)}</small>` : "";
            const buttons = [
                active || scheduled ? `<button type="button" data-job-action="cancel" data-job-id="${escape(job.id)}">Cancel</button>` : "",
                !active && !scheduled && ["failed", "cancelled"].includes(job.state) ? `<button type="button" data-job-action="retry" data-job-id="${escape(job.id)}" title="${job.payload?.checkpoint?.stage ? "Continue with saved work" : "Restart this job from the beginning"}">${job.payload?.checkpoint?.stage ? "Resume saved work" : "Retry from start"}</button>` : ""
            ].filter(Boolean).join("");
            return `<article class="background-job-row"><div class="background-job-heading"><div><strong>${escape(job.title)}</strong><small>${escape(job.type)} · ${escape(job.stage || job.state)}</small></div><span class="job-state ${escape(job.state)}">${escape(job.state).toUpperCase()}</span></div><div class="background-job-progress"><span style="width:${percent}%"></span></div><div class="background-job-bottom"><small>${scheduled ? `Scheduled for ${new Date(job.shutdownAt).toLocaleString()}` : `${percent}% · updated ${new Date(job.updatedAt || Date.now()).toLocaleTimeString()}`}</small><div class="background-job-actions">${buttons}</div></div>${error}</article>`;
        }).join("");
    }

    async function refresh() {
        try {
            const response = unwrap(await window.jarvis?.jobs?.list?.());
            jobs = Array.isArray(response.jobs) ? response.jobs : [];
            knownJobStates = new Map(jobs.map(job => [job.id, job.state]));
            const shutdown = unwrap(await window.jarvis?.system?.getScheduledShutdown?.());
            if (shutdown.scheduled) {
                jobs.unshift({ id: "scheduled-shutdown", type: "scheduled task", title: "System shutdown timer", state: "scheduled", stage: "Waiting for scheduled time", progress: 0, shutdownAt: shutdown.shutdownAt, payload: { delayMs: Math.max(60000, Number(shutdown.seconds) * 1000) } });
            }
            render();
        } catch (error) {
            list.innerHTML = `<div class="background-empty">Job list unavailable · ${escape(error?.message || "refresh failed")}</div>`;
        }
    }

    async function retry(job) {
        const payload = job.payload || {};
        if (job.type === "presentation") return window.jarvis?.presentations?.create?.(payload.topic, { ...(payload.options || {}), ...(payload.checkpoint?.stage === "deck-ready" ? { resumeJobId: job.id } : {}) });
        if (job.type === "pdf") return window.jarvis?.documents?.createPdf?.(payload.topic, { ...(payload.options || {}), ...(payload.checkpoint?.stage ? { resumeJobId: job.id } : {}) });
        if (job.type === "spreadsheet") return window.jarvis?.documents?.createSpreadsheet?.(payload.request || "Smart personal tracker");
        if (job.type === "office-file") return window.jarvis?.documents?.createOfficeFile?.(payload.format, payload.request || "", payload.options || {});
        if (job.type === "research") {
            return payload.source === "crossref"
                ? window.jarvis?.data?.crossrefSearch?.(payload.query, payload.limit)
                : window.jarvis?.data?.researchSearch?.(payload.query, payload.limit);
        }
        throw new Error("This job does not have a retry action.");
    }

    list.addEventListener("click", async event => {
        const button = event.target.closest("[data-job-action]");
        if (!button) {
            if (event.target.closest("[data-open-chat-job]")) {
                document.querySelector('.menu-item[data-view="chat"]')?.click();
                window.setTimeout(() => document.getElementById("chatInput")?.focus(), 120);
            }
            return;
        }
        button.disabled = true;
        const id = button.dataset.jobId;
        const job = jobs.find(item => item.id === id);
        try {
            if (button.dataset.jobAction === "cancel" && id === "scheduled-shutdown") {
                const response = unwrap(await window.jarvis?.system?.cancelScheduledShutdown?.());
                if (response.success === false) throw new Error(response.error || "Could not cancel scheduled shutdown.");
            } else if (button.dataset.jobAction === "cancel") {
                const response = unwrap(await window.jarvis?.jobs?.cancel?.(id));
                if (response.success === false) throw new Error(response.error || "Could not cancel this job.");
            } else if (button.dataset.jobAction === "retry" && job) {
                const response = unwrap(await retry(job));
                if (response.success === false) throw new Error(response.error || "Retry failed.");
            }
            await refresh();
        } catch (error) {
            button.disabled = false;
            const feedback = document.createElement("small");
            feedback.className = "job-action-feedback";
            feedback.setAttribute("role", "alert");
            feedback.textContent = error?.message || "JARVIS could not complete that task action.";
            button.closest(".background-job-row")?.querySelector(".job-action-feedback")?.remove();
            button.closest(".background-job-row")?.append(feedback);
        }
    });
    refreshButton?.addEventListener("click", refresh);
    const unsubscribe = window.jarvis?.jobs?.onUpdate?.(event => {
        const changed = (event?.jobs || []).some(job =>
            ["completed", "failed"].includes(job.state) && knownJobStates.get(job.id) !== job.state
        );
        if (Array.isArray(event?.jobs)) knownJobStates = new Map(event.jobs.map(job => [job.id, job.state]));
        if (changed) window.NotificationEngine?.refresh?.();
        refresh();
    });
    window.JARVISBackgroundJobs = Object.freeze({ refresh });
    refresh();
    setInterval(() => {
        if (document.body.classList.contains("background-events-view-active")) refresh();
    }, 3000);
    window.addEventListener("beforeunload", () => { try { unsubscribe?.(); } catch (_) {} }, { once: true });
})();
