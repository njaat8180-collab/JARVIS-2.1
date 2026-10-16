"use strict";
(function () {
    const KEY = "jarvis.permission-profile.v1";
    const PROFILES = Object.freeze({
        SAFE: { name: "Safe", destructive: false, computerUse: true, requireApproval: true },
        TRUSTED: { name: "Trusted", destructive: false, computerUse: true, requireApproval: true },
        RESTRICTED: { name: "Restricted", destructive: false, computerUse: false, requireApproval: true }
    });
    function current() { try { return String(localStorage.getItem(KEY) || "SAFE").toUpperCase(); } catch (_) { return "SAFE"; } }
    function set(name) { const key = String(name || "").toUpperCase(); if (!PROFILES[key]) return { success: false, error: "Choose Safe, Trusted, or Restricted." }; localStorage.setItem(KEY, key); window.dispatchEvent?.(new CustomEvent("jarvis:permission-profile", { detail: PROFILES[key] })); return { success: true, ...PROFILES[key], profile: PROFILES[key] }; }
    function get() { const key = current(); return { key, ...PROFILES[key] }; }
    function allows(action) { const profile = get(); if (profile.key === "RESTRICTED" && /click|type|drag|write|delete|backup|install|download/i.test(String(action || ""))) return false; return true; }
    window.JARVISPermissionProfiles = Object.freeze({ profiles: PROFILES, get, set, allows });
})();
