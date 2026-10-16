"use strict";

(() => {
    function organizeSettings() {
        const body = document.querySelector("#settingsPanel > .settings-body");
        if (!body || body.dataset.organized === "true") return;
        body.dataset.organized = "true";
        const categories = [
            { id: "ai", title: "AI & search", hint: "Choose your AI provider, check connections, and manage information sources.", open: true },
            { id: "voice", title: "Voice & appearance", hint: "Adjust JARVIS’s speaking style, text size, and contrast." },
            { id: "browser", title: "Browser", hint: "Check browser navigation and tab controls." },
            { id: "privacy", title: "Privacy & history", hint: "Control conversation context sent online and local history retention." },
            { id: "system", title: "Background & storage", hint: "Manage learning, evolution, and local cache." }
        ];
        const groups = new Map(categories.map(item => {
            const section = document.createElement("details");
            section.className = "settings-category";
            section.dataset.category = item.id;
            section.open = Boolean(item.open);
            const summary = document.createElement("summary");
            summary.textContent = item.title;
            const hint = document.createElement("p");
            hint.className = "settings-category-hint";
            hint.textContent = item.hint;
            const content = document.createElement("div");
            content.className = "settings-category-content";
            section.append(summary, hint, content);
            body.append(section);
            return [item.id, content];
        }));
        [...body.querySelectorAll(":scope > .settings-group[data-setting-category]")].forEach(group => {
            groups.get(group.dataset.settingCategory)?.append(group);
        });
        const privacy = body.querySelector(".settings-privacy-card");
        if (privacy) groups.get("privacy")?.append(privacy);
        const browserCheck = body.querySelector(".browser-diagnostic-card");
        if (browserCheck) groups.get("browser")?.append(browserCheck);
        const appearance = document.createElement("div");
        appearance.className = "settings-group settings-appearance-shortcut";
        appearance.innerHTML = '<strong class="settings-label">Color theme</strong><p class="settings-category-hint">Choose Dark, Light, Midnight, or Aurora from the theme menu in Chat.</p><button type="button" class="panel-btn" data-open-theme>Open appearance controls</button><label class="settings-label" for="settingsTextScale">Text size</label><select id="settingsTextScale" class="settings-select" aria-label="Application text size"><option value="1">Standard</option><option value="1.1">Larger</option><option value="1.2">Largest</option></select><label class="settings-accessibility-toggle"><input id="settingsHighContrast" type="checkbox"> Higher contrast</label>';
        groups.get("voice")?.append(appearance);
        const accessibilityKey = "jarvis.accessibility.v1";
        let accessibility = {};
        try { accessibility = JSON.parse(localStorage.getItem(accessibilityKey) || "{}"); } catch (_) {}
        const scale = appearance.querySelector("#settingsTextScale");
        const contrast = appearance.querySelector("#settingsHighContrast");
        const applyAccessibility = () => {
            const value = ["1", "1.1", "1.2"].includes(scale?.value) ? scale.value : "1";
            document.documentElement.style.setProperty("--jarvis-text-scale", value);
            document.body.classList.toggle("jarvis-high-contrast", Boolean(contrast?.checked));
            try { localStorage.setItem(accessibilityKey, JSON.stringify({ scale: value, contrast: Boolean(contrast?.checked) })); } catch (_) {}
        };
        if (scale) scale.value = ["1", "1.1", "1.2"].includes(String(accessibility.scale)) ? String(accessibility.scale) : "1";
        if (contrast) contrast.checked = accessibility.contrast === true;
        scale?.addEventListener("change", applyAccessibility);
        contrast?.addEventListener("change", applyAccessibility);
        applyAccessibility();
        appearance.querySelector("[data-open-theme]")?.addEventListener("click", () => {
            document.querySelector('.menu-item[data-view="chat"]')?.click();
            window.setTimeout(() => document.getElementById("appThemeSelect")?.focus(), 100);
        });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", organizeSettings, { once: true });
    else organizeSettings();
})();
