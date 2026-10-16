"use strict";
(function (root) {
    const normalize = value => String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
    function match(request, items) {
        const query = normalize(request);
        const candidates = (items || []).filter(item => item.enabled !== false && item.offscreen !== true && item.width > 0 && item.height > 0);
        let matches;
        if (query.startsWith("the text ")) {
            const literal = query.slice(9);
            matches = candidates.filter(item => literal && normalize(item.value).includes(literal));
        } else if (/^the (?:focused )?editable text area in /.test(query)) {
            const app = query.replace(/^the (?:focused )?editable text area in /, "");
            const editors = candidates.filter(item => /\.(Edit|Document|Text)$/.test(item.controlType || "") && item.keyboardFocusable !== false);
            const inApp = editors.filter(item => normalize(item.windowName).includes(app));
            // Some packaged apps expose an empty host window name. Only use
            // the single-editor fallback when there is no contradictory app
            // label; an editor explicitly belonging to another app remains
            // ambiguous and must not be selected.
            const unlabeled = editors.filter(item => !normalize(item.windowName));
            const focused = query.startsWith("the focused ") ? editors.filter(item => item.keyboardFocused === true) : [];
            matches = focused.length === 1 ? focused : (inApp.length ? inApp : (unlabeled.length === 1 && editors.length === 1 ? unlabeled : []));
        } else if (/^(?:the )?(?:search field|address bar)(?: in .+)?$/.test(query)) {
            const app = query.replace(/^(?:the )?(?:search field|address bar)(?: in )?/, "");
            const editors = candidates.filter(item => /\.(Edit|Document|Text)$/.test(item.controlType || "") && item.keyboardFocusable !== false);
            const named = editors.filter(item => /search|address|omnibox|url/i.test(`${item.name || ""} ${item.automationId || ""}`));
            const inApp = app ? named.filter(item => normalize(item.windowName).includes(app)) : named;
            matches = inApp.length ? inApp : (named.length === 1 ? named : (editors.length === 1 ? editors : []));
        } else {
            const label = query.replace(/^the /, "").replace(/ button$/, "");
            const exact = candidates.filter(item => normalize(item.name) === label);
            if (exact.length) matches = exact;
            else {
                const words = label.split(/\s+/).filter(word => word.length > 1);
                const fuzzy = candidates.filter(item => {
                    const name = normalize(item.name);
                    return words.length > 0 && words.every(word => name.includes(word));
                });
                matches = fuzzy;
            }
        }
        // Ambiguous controls require visual disambiguation, not the first match.
        return matches.length === 1 ? matches[0] : null;
    }
    if (typeof module !== "undefined" && module.exports) module.exports = { match };
    else root.JARVISAccessibilityTargets = { match };
})(typeof window !== "undefined" ? window : globalThis);
