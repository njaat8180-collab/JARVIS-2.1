"use strict";

/* ============================================================
   JARVIS LOCAL FILE CONTEXT ENGINE
   - Native file picker through secure preload IPC
   - Keeps the selected file in renderer memory only
   - No cloud/AI processing
   - Provides deterministic local questions about the file
============================================================ */

(function () {
    const state = {
        file: null
    };

    const $ = id => document.getElementById(id);

    function formatBytes(bytes) {
        const n = Number(bytes) || 0;
        if (n < 1024) return `${n} B`;
        if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
        return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    }

    function render() {
        const bar = $("fileAttachmentBar");
        const name = $("fileAttachmentName");
        const meta = $("fileAttachmentMeta");
        if (!bar) return;

        if (!state.file) {
            bar.hidden = true;
            if (name) name.textContent = "No file";
            if (meta) meta.textContent = "";
            return;
        }

        bar.hidden = false;
        if (name) name.textContent = state.file.name;
        if (meta) {
            const type = state.file.extension || "file";
            meta.textContent = `${type} • ${formatBytes(state.file.size)}`;
        }
    }

    function setFile(file) {
        state.file = file || null;
        render();
        return state.file;
    }

    function clear() {
        state.file = null;
        render();
    }

    function normalizeQuestion(text) {
        return String(text || "")
            .replace(/\s+/g, " ")
            .trim();
    }

    function getStats(content) {
        const text = String(content || "");
        const lines = text ? text.split(/\r?\n/).length : 0;
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        const chars = text.length;
        return { lines, words, chars };
    }

    function makePreview(content, max = 900) {
        const cleaned = String(content || "")
            .replace(/\r/g, "")
            .replace(/[ \t]+\n/g, "\n")
            .trim();
        if (!cleaned) return "No readable text was extracted from this file.";
        return cleaned.length > max ? cleaned.slice(0, max).trimEnd() + "…" : cleaned;
    }

    function extractHeadings(content) {
        return String(content || "")
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => /^(#{1,6}\s+|SHEET:\s+|(?:chapter|section|title)\s*[:\-])/i.test(line))
            .slice(0, 12);
    }

    function searchContent(content, term) {
        const needle = String(term || "").trim();
        if (!needle) return [];
        const lower = String(content || "").toLowerCase();
        const target = needle.toLowerCase();
        const results = [];
        let from = 0;
        while (results.length < 8) {
            const index = lower.indexOf(target, from);
            if (index < 0) break;
            const start = Math.max(0, index - 100);
            const end = Math.min(content.length, index + needle.length + 160);
            results.push(String(content).slice(start, end).replace(/\s+/g, " ").trim());
            from = index + Math.max(1, needle.length);
        }
        return results;
    }

    function canHandle(question) {
        if (!state.file) return false;
        const q = normalizeQuestion(question).toLowerCase();
        return /\b(this file|the file|attached file|uploaded file|ye file|yeh file|file me|file mein|file ke|is file|iss file|attached document|document me|document mein|document ke|iske baare|iske bare|summari[sz]e|summary|key points|main points|how many lines|how many words|word count|line count|characters|find .* in (the )?file|search .* in (the )?file|contains|what is (this|the|ye|yeh) file|what's (this|the|ye|yeh) file|what does (this|the|ye|yeh) file|file ka|file ke baare|file ke bare)/i.test(q);
    }

    function answer(question) {
        if (!state.file) {
            return { handled: false };
        }

        const q = normalizeQuestion(question);
        const lower = q.toLowerCase();
        const file = state.file;
        const content = String(file.content || "");
        const stats = getStats(content);
        const label = `**${file.name}**`;

        if (file.contentType !== "text" || !content.trim()) {
            if (/what|which|type|file|about|details|info|information/i.test(lower)) {
                return {
                    handled: true,
                    source: "file-context",
                    response: `${label} is a ${file.extension || "file"} (${formatBytes(file.size)}). I could attach it, but this file does not contain readable text for my local file-analysis engine.`,
                    fileContext: true
                };
            }
            return { handled: false };
        }

        if (/\b(how many lines|line count|lines?)\b/i.test(lower)) {
            return { handled: true, source: "file-context", response: `${label} has ${stats.lines.toLocaleString()} lines.`, fileContext: true };
        }

        if (/\b(how many words|word count|words?)\b/i.test(lower)) {
            return { handled: true, source: "file-context", response: `${label} has approximately ${stats.words.toLocaleString()} words.`, fileContext: true };
        }

        if (/\b(characters?|chars?)\b/i.test(lower)) {
            return { handled: true, source: "file-context", response: `${label} contains ${stats.chars.toLocaleString()} characters.`, fileContext: true };
        }

        const searchMatch = lower.match(/(?:find|search for|look for|contains?)\s+["“]?(.+?)["”]?\s+(?:in|inside)\s+(?:the\s+)?(?:file|document)$/i);
        if (searchMatch) {
            const term = searchMatch[1].trim();
            const hits = searchContent(content, term);
            if (!hits.length) {
                return { handled: true, source: "file-context", response: `I couldn't find “${term}” in ${file.name}.`, fileContext: true };
            }
            return {
                handled: true,
                source: "file-context",
                response: `I found “${term}” in ${file.name}. Here are the first ${hits.length} matches:\n\n${hits.map((h, i) => `${i + 1}. ${h}`).join("\n")}`,
                fileContext: true
            };
        }

        if (/\b(summar|summary|key points|main points|what does|what is this|what's this|about this|about the file|file ke baare|file ke bare|file mein kya|file me kya)/i.test(lower)) {
            const headings = extractHeadings(content);
            const headingText = headings.length ? `\n\nDetected headings:\n${headings.map(h => `• ${h}`).join("\n")}` : "";
            return {
                handled: true,
                source: "file-context",
                response: `Here is a local summary of ${file.name}:\n\n${makePreview(content)}${headingText}`,
                fileContext: true
            };
        }

        if (/\b(read|show|open|tell me about)\b.*\b(file|document)\b/i.test(lower)) {
            return {
                handled: true,
                source: "file-context",
                response: `${label} contains ${stats.lines.toLocaleString()} lines and ${stats.words.toLocaleString()} words.\n\n${makePreview(content)}`,
                fileContext: true
            };
        }

        return { handled: false };
    }

    async function pickAndRead() {
        const api = window.jarvis?.files;
        if (!api || typeof api.pickAndRead !== "function") {
            return { success: false, error: "File attachment bridge is unavailable." };
        }
        const result = await api.pickAndRead();
        if (result?.success && result.file) {
            setFile(result.file);
        }
        return result;
    }

    document.addEventListener("DOMContentLoaded", () => {
        $("fileAttachmentClear")?.addEventListener("click", clear);
        render();
    });

    window.JARVISFileContext = Object.freeze({
        getFile: () => state.file,
        setFile,
        clear,
        canHandle,
        answer,
        pickAndRead,
        formatBytes
    });
})();
