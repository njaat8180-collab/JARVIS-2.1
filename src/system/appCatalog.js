"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");

function normalizeName(value) {
    return String(value || "").normalize("NFKC").toLowerCase()
        .replace(/(?:एस\s*के|एसके|s\s+k)\s*(?:लॉन्चर|लांचर|launcher)/gu, "sklauncher")
        .replace(/लॉन्चर|लांचर/gu, "launcher")
        .replace(/\.exe$/i, "").replace(/[^\p{L}\p{M}\p{N}+]/gu, "");
}
const aliases = { vscode: "visualstudiocode", msword: "word", msexcel: "excel", mspaint: "paint", calc: "calculator" };
const canonical = value => aliases[normalizeName(value)] || normalizeName(value);
const maintenance = name => /(?:^|\s)(?:uninstall|uninstaller|remove|repair|setup|installer|help|readme)(?:\s|$)/i.test(name);

function similarity(a, b) {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let diagonal = row[0]; row[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const previous = row[j];
            row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
            diagonal = previous;
        }
    }
    return 1 - row[b.length] / Math.max(a.length, b.length, 1);
}

function rankApps(apps, query) {
    const key = canonical(query);
    if (!key) return [];
    return apps.map(app => {
        const candidate = canonical(app.name);
        const score = key === candidate ? 1
            : key.length >= 3 && candidate.startsWith(key) ? 0.92
            : key.length >= 3 && candidate.includes(key) ? 0.87
            : key.length >= 4 ? similarity(key, candidate) * 0.85 : 0;
        return { app, score };
    }).filter(item => item.score >= 0.58).sort((a, b) => b.score - a.score || a.app.name.localeCompare(b.app.name));
}

// Fixed script only: no user text, executable names, or paths are interpolated.
const INVENTORY_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$items = @()
$warnings = @()
try { $items += @(Get-StartApps | ForEach-Object { @{ name=$_.Name; kind='appId'; target=$_.AppID; source='Windows apps' } }) } catch { $warnings += 'Windows app registration scan unavailable' }
$keys = @('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths')
foreach ($key in $keys) {
  if (Test-Path -LiteralPath $key) {
    Get-ChildItem -LiteralPath $key -ErrorAction SilentlyContinue | ForEach-Object {
      $target = $_.GetValue('')
      if ($target -is [string] -and $target) { $items += @{ name=$_.PSChildName; kind='executable'; target=$target.Trim('"'); source='Registered app' } }
    }
  }
}
@{ items=$items; warnings=$warnings } | ConvertTo-Json -Depth 4 -Compress
`;

function readWindowsInventory() {
    return new Promise(resolve => execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", INVENTORY_SCRIPT],
        { windowsHide: true, timeout: 12000, maxBuffer: 2 * 1024 * 1024, encoding: "utf8" }, (error, stdout) => {
            if (error) return resolve({ items: [], warnings: ["Windows registration scan unavailable; shortcuts are still searchable."] });
            try { resolve(JSON.parse(stdout.replace(/^\uFEFF/, ""))); }
            catch (_) { resolve({ items: [], warnings: ["Windows app inventory could not be read."] }); }
        }));
}

function createAppCatalog({ roots = [], shell, launchExecutable, readInventory = readWindowsInventory, readCustom = () => [], platform = process.platform, now = Date.now } = {}) {
    let cache = null;
    let pending = null;
    let cachedAt = 0;
    const publicApp = app => ({ id: app.id, name: app.name, source: app.source });

    async function scan() {
        const items = []; const warnings = [];
        let entriesVisited = 0;
        async function walk(folder, depth, limit, source, extensions = [".lnk"]) {
            if (depth > limit || entriesVisited > 6000) return;
            let entries;
            try { entries = await fs.promises.readdir(folder, { withFileTypes: true }); }
            catch (error) { if (error.code !== "ENOENT") warnings.push(`${source} could not be fully scanned.`); return; }
            for (const entry of entries) {
                if (++entriesVisited > 6000) break;
                if (entry.isSymbolicLink()) continue;
                const target = path.join(folder, entry.name);
                if (entry.isDirectory() && depth < limit) await walk(target, depth + 1, limit, source, extensions);
                else if (entry.isFile()) {
                    const extension = path.extname(entry.name).toLowerCase();
                    if (extensions.includes(extension)) {
                        const kind = extension === ".exe" ? "executable" : "shortcut";
                        items.push({ name: entry.name.slice(0, -extension.length), kind, target, source });
                    }
                }
            }
        }
        await Promise.all(roots.filter(root => root.path).map(root => walk(
            root.path, 0, root.depth ?? 4, root.source || "Start Menu", root.extensions || [".lnk"]
        )));
        const inventory = platform === "win32" ? await readInventory() : { items: [], warnings: ["Application discovery requires Windows."] };
        items.push(...(Array.isArray(inventory.items) ? inventory.items : []));
        warnings.push(...(inventory.warnings || []));
        try { items.push(...readCustom()); } catch (_) { warnings.push("Saved app shortcuts could not be read."); }
        const groups = new Map();
        for (const raw of items) {
            const name = String(raw.name || "").replace(/\.exe$/i, "").trim();
            const target = String(raw.target || "").trim();
            if (!name || name.length > 140 || maintenance(name)) continue;
            if (raw.kind === "appId") {
                if (!/^[\p{L}\p{N}_.!{} -]{1,240}$/u.test(target)) continue;
            } else {
                if (!["shortcut", "executable"].includes(raw.kind) || !path.isAbsolute(target) || /^\\\\/.test(target)) continue;
                if (!(raw.kind === "shortcut" ? /\.lnk$/i : /\.exe$/i).test(target) || !fs.existsSync(target)) continue;
            }
            const key = normalizeName(name);
            if (!key) continue;
            if (!groups.has(key)) groups.set(key, { id: crypto.createHash("sha256").update(key).digest("hex").slice(0, 24), name, source: raw.source || "Added by you", targets: [] });
            const entry = groups.get(key);
            if (!entry.targets.some(item => item.target.toLowerCase() === target.toLowerCase())) entry.targets.push({ kind: raw.kind, target });
        }
        return { apps: [...groups.values()].sort((a, b) => a.name.localeCompare(b.name)), warnings: [...new Set(warnings)], scannedAt: new Date(now()).toISOString() };
    }

    async function inventory(refresh = false) {
        if (pending) return pending;
        if (!refresh && cache && now() - cachedAt < 120000) return cache;
        pending = scan().then(result => { cache = result; cachedAt = now(); return result; }).finally(() => { pending = null; });
        return pending;
    }

    async function list(refresh = false) {
        const result = await inventory(refresh);
        return { success: true, apps: result.apps.map(publicApp), warnings: result.warnings, scannedAt: result.scannedAt };
    }

    async function resolve(query) {
        const name = typeof query === "string" ? query.trim() : "";
        if (!name || name.length > 140 || /[\\/:;&|<>`$\r\n]/.test(name)) return { success: false, code: "INVALID_APP_NAME", error: "Choose an app name from App Library." };
        let found = rankApps((await inventory()).apps, name);
        // A newly installed app should not require restarting JARVIS.
        if (!found.length) found = rankApps((await inventory(true)).apps, name);
        const strong = found.filter(item => item.score >= 0.92);
        const exact = found.filter(item => item.score === 1);
        const match = exact.length === 1 ? exact[0] : strong.length === 1 ? strong[0] : null;
        if (match) return { success: true, app: match.app };
        const suggestions = found.slice(0, 5).map(item => publicApp(item.app));
        return { success: false, code: suggestions.length ? "APP_CHOICE_REQUIRED" : "APP_NOT_FOUND", suggestions,
            error: suggestions.length ? `Which app did you mean: ${suggestions.map(item => item.name).join(", ")}? Choose it in App Library.`
                : `I couldn't find “${name}”. Open App Library to refresh the list or add its shortcut.` };
    }

    async function launch(query, { byId = false } = {}) {
        let result = byId ? { app: (await inventory()).apps.find(item => item.id === query) } : await resolve(query);
        if (!result.app) return result.error ? result : { success: false, error: "This app entry is no longer available. Refresh App Library." };
        const entry = result.app;
        let error = "Windows could not launch this app.";
        for (const item of entry.targets) {
            try {
                if (item.kind === "shortcut") {
                    if (!fs.existsSync(item.target)) { error = "The shortcut no longer exists. Refresh App Library."; continue; }
                    const detail = shell.readShortcutLink?.(item.target);
                    if (detail?.target && path.isAbsolute(detail.target) && !fs.existsSync(detail.target)) { error = "The app's shortcut points to a missing file. Repair or reinstall the app."; continue; }
                    const failure = await shell.openPath(item.target);
                    if (failure) { error = failure; continue; }
                } else {
                    const launched = item.kind === "appId" ? await launchExecutable("explorer.exe", [`shell:AppsFolder\\${item.target}`]) : await launchExecutable(item.target, []);
                    if (launched?.success !== true) { error = launched?.error || error; continue; }
                }
                return { success: true, app: entry.name, data: { app: entry.name, status: "launch-requested", source: entry.source } };
            } catch (failure) { error = failure.message || error; }
        }
        return { success: false, app: entry.name, error };
    }
    async function launchAny(queries) {
        const candidates = Array.isArray(queries) ? queries.map(value => String(value || "").trim()).filter(Boolean).slice(0, 12) : [];
        if (!candidates.length) return { success: false, code: "NO_APP_CANDIDATES", error: "No related application candidates were provided." };
        const inventoryResult = await inventory();
        for (const query of candidates) {
            const match = rankApps(inventoryResult.apps, query).find(item => item.score >= 0.92);
            if (!match) continue;
            const result = await launch(match.app.id, { byId: true });
            if (result.success) return { ...result, matchedQuery: query, candidates };
        }
        await inventory(true);
        return { success: false, code: "RELATED_APP_NOT_FOUND", candidates,
            error: `I couldn't find an installed app matching: ${candidates.slice(0, 4).join(", ")}. Open App Library to refresh or add its shortcut.` };
    }
    return Object.freeze({ list, resolve, launch, launchAny });
}
module.exports = { createAppCatalog, normalizeName, rankApps };
