"use strict";

(() => {
    const api = window.jarvis?.system;
    let apps = [], loading = false, launching = false, filter = "", lastTrigger;
    let browserWasVisible = false;
    const modal = document.createElement("dialog");
    modal.className = "app-library-dialog";
    modal.setAttribute("aria-labelledby", "appLibraryTitle");
    modal.innerHTML = `<header><div><span class="library-kicker">YOUR WINDOWS WORKSPACE</span><h2 id="appLibraryTitle">App Library</h2><p>Find it here. Open it by name.</p></div><button data-library-close type="button" aria-label="Close App Library">✕</button></header>
        <div class="library-search"><span aria-hidden="true">⌕</span><input id="appLibrarySearch" type="search" placeholder="Search apps… e.g. SKLauncher" aria-label="Search installed apps" autocomplete="off"><kbd>Esc</kbd></div>
        <div class="library-toolbar"><span data-library-count>Discovering apps…</span><div><button type="button" data-library-add>＋ Add app</button><button type="button" data-library-refresh>↻ Refresh</button></div></div>
        <div class="library-results" data-library-results></div>
        <p class="library-feedback" data-library-feedback role="status" aria-live="polite"></p>
        <footer>Start Menu · Desktop · Windows apps<span>Portable app missing? Use Add app.</span></footer>`;
    document.body.appendChild(modal);
    const by = name => modal.querySelector(`[data-library-${name}]`);
    const search = modal.querySelector("input");
    const key = value => String(value).normalize("NFKC").toLowerCase().replace(/(?:एस\s*के|एसके|s\s+k)\s*(?:लॉन्चर|लांचर|launcher)/gu, "sklauncher").replace(/लॉन्चर|लांचर/gu, "launcher").replace(/[^\p{L}\p{M}\p{N}+]/gu, "");
    const feedback = (text, error = false) => { by("feedback").textContent = text; by("feedback").dataset.error = String(error); };
    function makeAppButton(app, compact = false) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = compact ? "workspace-app-button" : "library-app";
        button.dataset.appEntry = app.id;
        button.disabled = launching;
        button.title = `Open ${app.name}`;
        const icon = document.createElement("span"); icon.className = "library-app-icon"; icon.setAttribute("aria-hidden", "true");
        icon.textContent = app.name.slice(0, 2).toUpperCase();
        const copy = document.createElement("span"); copy.className = "library-app-copy";
        const name = document.createElement("strong"); name.textContent = app.name; copy.appendChild(name);
        if (!compact) { const source = document.createElement("small"); source.textContent = app.source; copy.appendChild(source); }
        button.append(icon, copy);
        if (!compact) { const arrow = document.createElement("span"); arrow.className = "library-open-arrow"; arrow.textContent = "↗"; button.appendChild(arrow); }
        return button;
    }
    function render() {
        const matches = apps.filter(app => key(app.name).includes(key(filter)));
        const list = by("results"); list.replaceChildren();
        by("count").textContent = loading ? "Discovering apps…" : `${matches.length} of ${apps.length} apps`;
        by("refresh").disabled = loading || launching;
        by("add").disabled = loading || launching;
        list.setAttribute("aria-busy", String(loading));
        if (loading && !apps.length) {
            const p = document.createElement("p"); p.className = "library-empty"; p.textContent = "Reading your Windows app library…"; list.appendChild(p);
        } else if (!matches.length) {
            const p = document.createElement("p"); p.className = "library-empty";
            p.textContent = filter ? "No matching app. Try its full name, refresh, or add its shortcut." : "No apps discovered yet. Refresh or add an app to get started.";
            list.appendChild(p);
        } else matches.forEach(app => list.appendChild(makeAppButton(app)));
        const quick = document.getElementById("workspaceAppShortcuts");
        if (quick) {
            quick.replaceChildren();
            const preferred = ["sklauncher", "googlechrome", "visualstudiocode", "notepad", "calculator", "spotify"];
            const sorted = [...apps].sort((a, b) => (preferred.indexOf(key(a.name)) < 0 ? 99 : preferred.indexOf(key(a.name))) - (preferred.indexOf(key(b.name)) < 0 ? 99 : preferred.indexOf(key(b.name))));
            sorted.slice(0, 6).forEach(app => quick.appendChild(makeAppButton(app, true)));
            if (!apps.length) { const p = document.createElement("p"); p.className = "mission-empty"; p.textContent = loading ? "Discovering your installed apps…" : "Open App Library to refresh or add your apps."; quick.appendChild(p); }
        }
        const count = document.getElementById("workspaceAppCount");
        if (count) count.textContent = loading ? "Scanning your computer…" : `${apps.length} apps discovered · local on your PC`;
    }
    async function refresh(force = false) {
        if (loading) return;
        loading = true; render();
        try {
            const result = await api?.listApps?.(force);
            const data = result?.data || result;
            if (result?.success === false || !Array.isArray(data?.apps)) throw new Error(result?.error || "App discovery is unavailable. Restart the updated JARVIS build.");
            apps = data.apps;
            feedback(data.warnings?.join(" ") || `Your app library is up to date. ${apps.length} apps found.`);
        } catch (error) { feedback(error.message, true); }
        finally { loading = false; render(); }
    }
    async function open(query = "") {
        // Electron's BrowserView is a native surface and can paint above a
        // DOM <dialog> regardless of CSS z-index. Temporarily hide it while
        // App Library is open, then restore it only if the Browser view is
        // still the active workspace.
        const browserPanel = document.getElementById("browserPanel");
        browserWasVisible = document.body.classList.contains("browser-view-active") &&
            browserPanel && browserPanel.style.display !== "none";
        if (browserWasVisible) await window.jarvis?.browser?.setVisible?.(false);
        if (!modal.open) { lastTrigger = document.activeElement; modal.showModal(); }
        filter = query; search.value = filter; render(); search.focus();
        if (!apps.length && !loading) await refresh();
    }
    modal.addEventListener("close", async () => {
        if (browserWasVisible && document.body.classList.contains("browser-view-active")) {
            await window.jarvis?.browser?.setVisible?.(true);
        }
        browserWasVisible = false;
        lastTrigger?.focus?.();
    });
    by("close").addEventListener("click", () => modal.close());
    modal.addEventListener("click", event => { if (event.target === modal && (event.clientX < modal.getBoundingClientRect().left || event.clientX > modal.getBoundingClientRect().right || event.clientY < modal.getBoundingClientRect().top || event.clientY > modal.getBoundingClientRect().bottom)) modal.close(); });
    search.addEventListener("input", () => { filter = search.value; render(); });
    by("refresh").addEventListener("click", () => refresh(true));
    by("add").addEventListener("click", async () => {
        by("add").disabled = true;
        try { const result = await api.addApp(); const data = result?.data || result; if (data?.cancelled) return; if (result?.success === false || data?.success === false) throw new Error(data.error || result.error); await refresh(true); }
        catch (error) { feedback(error.message || "Could not add this app.", true); }
        finally { by("add").disabled = false; }
    });
    document.addEventListener("click", async event => {
        if (event.target.closest("[data-open-app-library]")) { await open(); return; }
        const button = event.target.closest("[data-app-entry]");
        if (!button || launching) return;
        const app = apps.find(app => app.id === button.dataset.appEntry);
        if (!app) return;
        launching = true; render(); feedback(`Opening ${app.name}…`);
        try {
            const result = await api.launchAppEntry(app.id);
            const data = result?.data || result;
            if (result?.success !== true || data?.success === false) throw new Error(data?.error || result?.error || "Windows did not accept the launch request.");
            feedback(`Launch requested for ${app.name}.`);
            const count = document.getElementById("workspaceAppCount"); if (count) count.textContent = `Opening ${app.name}…`;
        } catch (error) { await open(); feedback(error.message, true); }
        finally { launching = false; render(); }
    });
    document.addEventListener("keydown", event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); open(); }
    });
    window.JARVISAppLibrary = Object.freeze({ open, refresh });
    refresh();
})();
