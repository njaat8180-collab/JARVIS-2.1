"use strict";

(() => {
    const STORAGE_KEY = "jarvis-app-theme";
    const THEMES = new Set(["dark", "light", "midnight", "aurora"]);

    function setTheme(theme, persist = true) {
        const selected = THEMES.has(theme) ? theme : "dark";
        document.body.dataset.theme = selected;
        const picker = document.getElementById("appThemeSelect");
        if (picker) picker.value = selected;
        if (persist) {
            try { localStorage.setItem(STORAGE_KEY, selected); } catch (_) {}
        }
    }

    function init() {
        let saved = "dark";
        try { saved = localStorage.getItem(STORAGE_KEY) || saved; } catch (_) {}
        setTheme(saved, false);
        document.getElementById("appThemeSelect")?.addEventListener("change", (event) => {
            setTheme(event.currentTarget.value);
        });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
})();
