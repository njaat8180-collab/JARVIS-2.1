"use strict";

const path = require("path");

function inferDestination(request, explicit) {
    const normalize = value => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
    const chosen = normalize(explicit);
    if (["documents", "document", "downloads", "download", "desktop"].includes(chosen)) {
        return chosen.startsWith("download") ? "downloads" : chosen.startsWith("document") ? "documents" : "desktop";
    }
    const text = String(request || "");
    const match = text.match(/\b(?:save|store|put|place|write)(?:\s+(?:it|the\s+(?:file|presentation|pptx)))?\s+(?:in|to)\s+(?:my\s+)?(downloads?|desktop|documents?)\b|\b(?:in|to)\s+(?:my\s+)?(downloads?|desktop|documents?)\b/i);
    const location = normalize(match?.[1] || match?.[2]);
    if (!location) return "documents";
    return location.startsWith("download") ? "downloads" : location.startsWith("document") ? "documents" : "desktop";
}

function resolvePresentationOutputDirectory(request, folders = {}, explicit) {
    const destination = inferDestination(request, explicit);
    const root = folders[destination] || folders.documents;
    if (!root) throw new Error("The Documents output folder is unavailable.");
    return { destination, directory: path.join(path.resolve(root), "JARVIS Presentations") };
}

module.exports = { inferDestination, resolvePresentationOutputDirectory };
