"use strict";
(function () {
    const KEY = "jarvis.workflow-recipes.v1";
    const read = () => { try { const value = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(value) ? value : []; } catch (_) { return []; } };
    const write = value => { try { localStorage.setItem(KEY, JSON.stringify(value.slice(0, 30))); } catch (_) {} };
    function captureCompleted(task) {
        if (!task?.plan?.length) return { success: false, error: "No completed workflow plan is available." };
        const recipes = read();
        const name = String(task.workflow || "workflow").trim();
        if (!recipes.some(item => item.name === name)) write([{ name, plan: task.plan, createdAt: new Date().toISOString(), source: "verified-task" }, ...recipes]);
        return { success: true, name };
    }
    function saveLast(name) {
        const last = window.JARVISVisualWorkflow?.getTaskMemory?.(1)?.[0];
        if (!last?.plan?.length) return { success: false, error: "No completed workflow is available to save." };
        const recipes = read(); const recipe = { name: String(name || last.workflow || "saved workflow").trim().slice(0, 80), plan: last.plan, createdAt: new Date().toISOString(), source: "user-saved" };
        write([recipe, ...recipes.filter(item => item.name !== recipe.name)]); return { success: true, name: recipe.name };
    }
    function list() { return read().map(({ name, createdAt, source }) => ({ name, createdAt, source })); }
    function get(name) { return read().find(item => item.name.toLowerCase() === String(name || "").trim().toLowerCase()) || null; }
    window.JARVISWorkflowRecorder = Object.freeze({ captureCompleted, saveLast, list, get });
})();
