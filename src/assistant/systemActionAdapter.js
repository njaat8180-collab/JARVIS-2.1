"use strict";

/**
 * ============================================================
 * JARVIS SYSTEM ACTION ADAPTER (Phase 7)
 * ============================================================
 *
 * A small, explicit allowlist of system actions the deterministic
 * Assistant is permitted to perform, mirroring the *kind* of safe
 * primitives main.js's existing system:* IPC handlers already use
 * (see PHASE7_ARCHITECTURE_INSPECTION.md, section 1.1):
 *   - every process launch uses a FIXED executable name plus a
 *     fixed argument ARRAY via child_process.spawn/execFile
 *     (`shell` is never set to true; there is no string
 *     concatenation into a shell command anywhere in this file)
 *   - there is NO generic execute(command) method — only one
 *     method per allowlisted action
 *   - an unknown/uninstalled application returns a deterministic
 *     failure; nothing is ever fabricated
 *
 * Defense in depth (STEP 6 of the Phase 7 brief): destructive
 * actions (shutdown/restart/sleep/lock/logoff/terminateProcess)
 * refuse to run unless the caller explicitly passes
 * `{ approved: true }` — this is checked HERE, independently of
 * whatever AssistantOrchestrator/safetyGate.js already checked, so
 * a caller can never reach real OS effects by calling this adapter
 * directly and skipping the assistant layer.
 *
 * The actual OS-level command runner is injected (`runner`) so this
 * module is fully Node-testable: tests supply a mock runner and
 * assert on which fixed executable/args were requested, without any
 * real process ever being spawned. Production wiring (out of scope
 * for this phase — see the architecture doc) would inject a runner
 * backed by child_process.spawn/execFile, i.e. the same primitives
 * main.js already uses.
 * ============================================================
 */

const os = require("os");

/** Every application alias this adapter recognizes, mapped to a fixed executable/args. */
const APPLICATION_ALLOWLIST = {
    chrome: { win32: { executable: "chrome.exe", args: [] } },
    notepad: { win32: { executable: "notepad.exe", args: [] } },
    calculator: { win32: { executable: "calc.exe", args: [] } },
    explorer: { win32: { executable: "explorer.exe", args: [] } },
    vscode: { win32: { executable: "code.cmd", args: [] } },
    cmd: { win32: { executable: "cmd.exe", args: [] } },
    powershell: { win32: { executable: "powershell.exe", args: [] } }
};

/** Aliases -> canonical allowlist key. Never expands to an arbitrary/unknown name. */
const APPLICATION_ALIASES = {
    "google chrome": "chrome",
    "vs code": "vscode",
    "visual studio code": "vscode",
    calc: "calculator",
    "file explorer": "explorer",
    "windows explorer": "explorer",
    terminal: "cmd",
    "command prompt": "cmd",
    "power shell": "powershell"
};

/** Fixed power-command mappings — identical shape to main.js's runPowerCommand table. */
const POWER_COMMANDS = {
    shutdown: { win32: { executable: "shutdown", args: ["/s", "/t", "0"] } },
    restart: { win32: { executable: "shutdown", args: ["/r", "/t", "0"] } },
    sleep: { win32: { executable: "rundll32.exe", args: ["powrprof.dll,SetSuspendState", "0,1,0"] } },
    lock: { win32: { executable: "rundll32.exe", args: ["user32.dll,LockWorkStation"] } },
    logoff: { win32: { executable: "shutdown", args: ["/l"] } }
};

/** Actions that must never run without explicit, out-of-band approval. */
const DESTRUCTIVE_SYSTEM_ACTIONS = new Set(["shutdown", "restart", "sleep", "lock", "logoff", "terminateProcess"]);

function ok(data = {}) {
    return { success: true, action: null, message: null, data, error: null, requiresApproval: false, ...data, };
}

function result({ success, action, message = null, data = null, error = null, requiresApproval = false }) {
    return { success, action, message, data, error, requiresApproval };
}

function resolveAppKey(name) {
    const normalized = String(name || "").trim().toLowerCase();
    if (!normalized) return null;
    if (APPLICATION_ALLOWLIST[normalized]) return normalized;
    if (APPLICATION_ALIASES[normalized]) return APPLICATION_ALIASES[normalized];
    return null;
}

class SystemActionAdapter {
    /**
     * @param {object} [options]
     * @param {function} [options.runner] - (executable, args) => Promise<{success, error?}>.
     *   Defaults to a safe stub that never actually spawns a process (so importing this
     *   module in a non-Electron/non-Windows Node process, e.g. under `node --test`,
     *   can never have a real OS side effect unless a real runner is explicitly injected).
     * @param {string} [options.platform] - defaults to process.platform; injectable for tests.
     */
    constructor(options = {}) {
        this.platform = options.platform || process.platform;
        this.runner =
            options.runner ||
            (async () => ({
                success: false,
                error: "No process runner was injected into SystemActionAdapter; this is a safe no-op stub."
            }));
    }

    /**
     * Launches an allowlisted application. Never accepts or executes an
     * arbitrary path/command — only a name already present on
     * APPLICATION_ALLOWLIST/APPLICATION_ALIASES.
     */
    async openApplication(name) {
        const key = resolveAppKey(name);
        if (!key) {
            return result({
                success: false,
                action: "openApplication",
                error: `"${name}" is not on the allowlisted application list.`
            });
        }

        const mapping = APPLICATION_ALLOWLIST[key][this.platform];
        if (!mapping) {
            return result({
                success: false,
                action: "openApplication",
                error: `"${key}" has no launcher for platform "${this.platform}".`
            });
        }

        const outcome = await this.runner(mapping.executable, mapping.args);
        return result({
            success: !!outcome.success,
            action: "openApplication",
            message: outcome.success ? `Launched ${key}.` : null,
            data: { app: key },
            error: outcome.success ? null : outcome.error || "Launch failed."
        });
    }

    async openUrl(url, browserAdapter) {
        if (!/^https:\/\//i.test(String(url || ""))) {
            return result({ success: false, action: "openUrl", error: "Only https:// URLs may be opened." });
        }
        if (!browserAdapter || typeof browserAdapter.open !== "function") {
            return result({ success: false, action: "openUrl", error: "No browser adapter available." });
        }
        try {
            const outcome = await browserAdapter.open(url);
            if (outcome && outcome.success === false) {
                return result({
                    success: false,
                    action: "openUrl",
                    data: outcome,
                    error: outcome.error || "Browser failed to open the URL."
                });
            }
            return result({ success: true, action: "openUrl", data: outcome });
        } catch (error) {
            return result({
                success: false,
                action: "openUrl",
                error: error && error.message ? error.message : String(error)
            });
        }
    }

    /**
     * @param {string} action - one of DESTRUCTIVE_SYSTEM_ACTIONS.
     * @param {object} [options]
     * @param {boolean} [options.approved] - MUST be true for this to run.
     */
    async runPowerCommand(action, { approved = false } = {}) {
        if (DESTRUCTIVE_SYSTEM_ACTIONS.has(action) && approved !== true) {
            return result({
                success: false,
                action,
                requiresApproval: true,
                error: `"${action}" is a destructive action and requires explicit approval (approved !== true).`
            });
        }

        const mapping = POWER_COMMANDS[action];
        if (!mapping) {
            return result({ success: false, action, error: `"${action}" is not an allowlisted power command.` });
        }

        const platformMapping = mapping[this.platform];
        if (!platformMapping) {
            return result({
                success: false,
                action,
                error: `Power command "${action}" is not available on platform "${this.platform}".`
            });
        }

        const outcome = await this.runner(platformMapping.executable, platformMapping.args);
        return result({
            success: !!outcome.success,
            action,
            message: outcome.success ? `${action} executed.` : null,
            error: outcome.success ? null : outcome.error || `${action} failed.`
        });
    }

    async shutdown(options) {
        return this.runPowerCommand("shutdown", options);
    }
    async restart(options) {
        return this.runPowerCommand("restart", options);
    }
    async sleep(options) {
        return this.runPowerCommand("sleep", options);
    }
    async lock(options) {
        return this.runPowerCommand("lock", options);
    }
    async logoff(options) {
        return this.runPowerCommand("logoff", options);
    }

    /**
     * Terminates a process by exact name only (no wildcard/PID-sweep, no
     * shell glob) — still requires explicit approval, same as power
     * commands, since killing the wrong process is irreversible/disruptive.
     */
    async terminateProcess(processName, { approved = false } = {}) {
        if (approved !== true) {
            return result({
                success: false,
                action: "terminateProcess",
                requiresApproval: true,
                error: "terminateProcess requires explicit approval (approved !== true)."
            });
        }
        const name = String(processName || "").trim();
        if (!name || /[^a-zA-Z0-9_.\-]/.test(name)) {
            return result({
                success: false,
                action: "terminateProcess",
                error: "Process name must be a plain executable name (no paths, wildcards, or shell metacharacters)."
            });
        }
        const executable = this.platform === "win32" ? "taskkill" : "kill";
        const args = this.platform === "win32" ? ["/IM", name, "/F"] : ["-9", name];
        const outcome = await this.runner(executable, args);
        return result({
            success: !!outcome.success,
            action: "terminateProcess",
            message: outcome.success ? `Terminated ${name}.` : null,
            data: { processName: name },
            error: outcome.success ? null : outcome.error || "Termination failed."
        });
    }

    /** Reads real values off Node's os module — never fabricated, never estimated. */
    getSystemInfo() {
        try {
            return result({
                success: true,
                action: "getSystemInfo",
                data: {
                    platform: os.platform(),
                    arch: os.arch(),
                    uptimeSeconds: os.uptime(),
                    totalMemoryBytes: os.totalmem(),
                    freeMemoryBytes: os.freemem(),
                    cpuCount: os.cpus().length
                }
            });
        } catch (error) {
            return result({
                success: false,
                action: "getSystemInfo",
                error: error && error.message ? error.message : String(error)
            });
        }
    }
}

module.exports = {
    SystemActionAdapter,
    APPLICATION_ALLOWLIST,
    APPLICATION_ALIASES,
    POWER_COMMANDS,
    DESTRUCTIVE_SYSTEM_ACTIONS,
    resolveAppKey
};
