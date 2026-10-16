// ==========================================
// JARVIS V10 PRODUCTION
// Autonomous Agent Core
// Agent Registry V3 PRO (syntax-fixed, all 6 parts merged)
// renderer/js/brain/agents/agentRegistry.js
// ==========================================

"use strict";


(function () {


class AgentRegistry {


    constructor() {

        // ==================================
        // VERSION
        // ==================================

        this.version = "3.0.0 PRO";

        this.initialized = false;

        this.debug = false;


        // ==================================
        // AGENT DATABASE
        // ==================================

        this.agents = new Map();


        // ==================================
        // GROUP INDEX
        // ==================================

        this.groups = new Map();


        // ==================================
        // TAG INDEX
        // ==================================

        this.tags = new Map();


        // ==================================
        // DEPENDENCY MAP
        // ==================================

        this.dependencies = new Map();


        // ==================================
        // EVENT SYSTEM
        // ==================================

        this.listeners = new Map();


        // ==================================
        // CACHE (invalidated on register/remove/tag/group changes)
        // ==================================

        this.cache = {

            search: new Map()

        };


        // ==================================
        // STATISTICS
        // ==================================

        this.stats = {

            registered: 0,
            removed: 0,
            duplicates: 0,
            failed: 0,
            errors: 0,
            executions: 0

        };


        // ==================================
        // START TIME
        // ==================================

        this.created = Date.now();

        console.log("📦 AgentRegistry V3 PRO Created");

    }


    // ==========================================
    // INITIALIZE REGISTRY
    // ==========================================

    init() {

        if (this.initialized) {
            return true;
        }

        this.initialized = true;

        console.log("🚀 AgentRegistry V3 PRO Initialized");

        return true;

    }


    // ==========================================
    // DEBUG MODE
    // ==========================================

    setDebug(state = false) {

        this.debug = Boolean(state);

        return this.debug;

    }


    // ==========================================
    // LOG SYSTEM
    // ==========================================

    log(...args) {

        if (this.debug) {

            console.log("[AgentRegistry]", ...args);

        }

    }


    // ==========================================
    // CREATE AGENT META OBJECT
    // ==========================================

    createMeta(name, agent, options = {}) {

        return {

            name: name,
            agent: agent,
            version: options.version || "1.0.0",
            type: options.type || "generic",
            status: "idle",
            priority: options.priority || 5,
            group: options.group || "general",
            tags: Array.isArray(options.tags) ? options.tags : [],
            dependencies: options.dependencies || [],
            created: Date.now(),
            lastActive: null,
            lastRun: null,
            lastHeartbeat: null,
            runs: 0,
            errors: 0,
            enabled: true,

            // Structured permissions (read/write/execute), overridable per-agent.
            // canAccess() still accepts a plain array for backward compatibility.
            permissions: options.permissions || {
                read: true,
                write: true,
                execute: true
            }

        };

    }


    // ==========================================
    // VALIDATE AGENT (name + agent instance)
    // ==========================================

    validate(name, agent) {

        if (typeof name !== "string" || !name.trim()) {
            return false;
        }

        if (!agent || typeof agent !== "object") {
            return false;
        }

        return true;

    }


    // ==========================================
    // GET TOTAL AGENTS
    // ==========================================

    count() {

        return this.agents.size;

    }


    // ==========================================
    // CHECK EXISTS
    // ==========================================

    has(name) {

        return this.agents.has(name);

    }


    // ==========================================
    // LIST AGENT NAMES
    // ==========================================

    list() {

        return [...this.agents.keys()];

    }


    // ==========================================
    // GET REGISTRY VERSION
    // ==========================================

    getVersion() {

        return this.version;

    }


    // ==========================================
    // PRIORITY QUEUE (VIEW ONLY)
    // Returns registered agents sorted by priority,
    // highest first. This is just an ordered view —
    // actual scheduling/execution belongs in a
    // separate AgentScheduler module (next phase),
    // which can consume this list to decide run order.
    // ==========================================

    getPriorityQueue() {

        return [...this.agents.values()]
            .filter(data => data.enabled !== false)
            .sort((a, b) => b.priority - a.priority);

    }


    // ==========================================
    // BASIC STATUS
    // ==========================================

    status() {

        return {

            version: this.version,
            initialized: this.initialized,
            total: this.agents.size,
            groups: this.groups.size,
            tags: this.tags.size,
            uptime: Date.now() - this.created,
            stats: this.stats

        };

    }


    // ==========================================
    // PART 2 / 6
    // Register + Remove + Agent Lifecycle Management
    // ==========================================


    // ==========================================
    // REGISTER AGENT
    // ==========================================

    register(name, agent, options = {}) {

        try {

            if (!this.validate(name, agent)) {

                throw new Error("Invalid Agent");

            }

            if (this.has(name)) {

                this.stats.duplicates++;

                console.warn("⚠ Agent Already Exists:", name);

                return false;

            }

            const meta = this.createMeta(name, agent, options);

            this.agents.set(name, meta);

            // GROUP INDEX
            this.addToGroupIndex(meta);

            // TAG INDEX
            this.addToTagIndex(meta);

            // DEPENDENCY SAVE
            this.dependencies.set(name, meta.dependencies);

            this.stats.registered++;

            this.cache.search.clear();

            this.emit("agent.registered", meta);

            console.log("🤖 Agent Registered:", name);

            return true;

        }
        catch (error) {

            this.stats.failed++;

            console.error("❌ Agent Register Failed:", error);

            return false;

        }

    }


    // ==========================================
    // CHECK DEPENDENCIES
    // Verifies that every dependency an agent declares
    // (e.g. BrowserAgent -> ["BrowserSession", "BrowserParser"])
    // is actually present in the registry.
    // ==========================================

    checkDependencies(name) {

        const data = this.agents.get(name);

        if (!data) {

            return {
                satisfied: false,
                missing: [],
                reason: "Agent Not Found"
            };

        }

        const required = this.dependencies.get(name) || data.dependencies || [];

        const missing = required.filter(dep => !this.has(dep));

        return {

            satisfied: missing.length === 0,
            missing,
            required

        };

    }


    // ==========================================
    // CHECK ALL DEPENDENCIES
    // ==========================================

    checkAllDependencies() {

        const report = {};

        this.agents.forEach((data, name) => {

            report[name] = this.checkDependencies(name);

        });

        return report;

    }


    // ==========================================
    // GET AGENT INSTANCE
    // ==========================================

    get(name) {

        const data = this.agents.get(name);

        return data ? data.agent : null;

    }


    // ==========================================
    // GET FULL DATA
    // ==========================================

    getInfo(name) {

        return this.agents.get(name) || null;

    }


    // ==========================================
    // REPLACE AGENT
    // Swaps in a real agent instance for whatever is
    // currently registered under `name` — most useful
    // right after restore()/importSnapshot() created a
    // stub `{}` placeholder that now needs to become the
    // actual booted agent, while keeping its saved
    // metadata (status, tags, group, permissions, etc).
    // ==========================================

    replace(name, newAgent, options = {}) {

        const old = this.agents.get(name);

        if (!old)
            return false;

        // Mutate the existing meta in place instead of rebuilding it via
        // createMeta() — createMeta() only knows about a handful of
        // "configuration" fields (version/type/priority/group/tags/
        // dependencies/permissions) and has no idea about runtime history
        // like runs/errors/created/lastRun, so it would silently reset
        // them to defaults. This keeps that history intact across the
        // swap and only overwrites what the caller explicitly passed.
        old.agent = newAgent;

        Object.assign(old, options);

        old.lastActive = Date.now();

        this.agents.set(name, old);

        this.rebuildIndexes();

        this.emit("agent.replaced", old);

        console.log("♻ Agent Replaced:", name);

        return true;

    }


    // ==========================================
    // REMOVE AGENT
    // ==========================================

    remove(name) {

        const data = this.agents.get(name);

        if (!data) {
            return false;
        }

        // REMOVE GROUP INDEX
        this.removeFromGroupIndex(data);

        // REMOVE TAG INDEX
        this.removeFromTagIndex(data);

        // REMOVE DEPENDENCY
        this.dependencies.delete(name);

        this.agents.delete(name);

        this.stats.removed++;

        this.cache.search.clear();

        this.emit("agent.removed", data);

        console.log("🗑 Agent Removed:", name);

        return true;

    }


    // ==========================================
    // UPDATE STATUS
    // ==========================================

    setStatus(name, status) {

        const data = this.agents.get(name);

        if (!data)
            return false;

        data.status = status;

        data.lastActive = Date.now();

        this.emit("agent.status", data);

        return true;

    }


    // ==========================================
    // AGENT ERROR HANDLER
    // Used by start()/stop() (and available for any
    // other method) when an agent throws during a
    // lifecycle call.
    // ==========================================

    error(name, error) {

        console.error("❌ Agent Error:", name, error);

        this.trackError(name);

        this.emit("agent.error", {

            name,
            error

        });

    }


    // ==========================================
    // START AGENT
    // ==========================================

    start(name) {

        const data = this.agents.get(name);

        if (!data)
            return false;

        try {

            if (typeof data.agent.start === "function") {

                data.agent.start();

            }

            this.setStatus(name, "running");

            return true;

        }
        catch (error) {

            this.error(name, error);

            return false;

        }

    }


    // ==========================================
    // STOP AGENT
    // ==========================================

    stop(name) {

        const data = this.agents.get(name);

        if (!data)
            return false;

        try {

            if (typeof data.agent.stop === "function") {

                data.agent.stop();

            }

            this.setStatus(name, "stopped");

            return true;

        }
        catch (error) {

            this.error(name, error);

            return false;

        }

    }


    // ==========================================
    // TRACK EXECUTION
    // ==========================================

    trackRun(name) {

        const data = this.agents.get(name);

        if (!data)
            return false;

        data.runs++;

        data.lastRun = Date.now();

        data.lastActive = Date.now();

        this.stats.executions++;

        return true;

    }


    // ==========================================
    // TRACK ERROR
    // ==========================================

    trackError(name) {

        const data = this.agents.get(name);

        if (!data)
            return false;

        data.errors++;

        this.stats.errors++;

        return true;

    }


    // ==========================================
    // PART 3 / 6
    // Group Manager + Tag Engine + Search System
    // ==========================================


    // ==========================================
    // ADD GROUP INDEX
    // ==========================================

    addToGroupIndex(data) {

        const group = data.group;

        if (!this.groups.has(group)) {

            this.groups.set(group, []);

        }

        const list = this.groups.get(group);

        if (!list.includes(data.name)) {

            list.push(data.name);

        }

    }


    // ==========================================
    // REMOVE GROUP INDEX
    // ==========================================

    removeFromGroupIndex(data) {

        const group = data.group;

        if (!this.groups.has(group))
            return false;

        const list = this.groups.get(group);

        const index = list.indexOf(data.name);

        if (index !== -1) {

            list.splice(index, 1);

        }

        if (list.length === 0) {

            this.groups.delete(group);

        }

        return true;

    }


    // ==========================================
    // CREATE GROUP
    // ==========================================

    createGroup(name) {

        if (!name)
            return false;

        if (!this.groups.has(name)) {

            this.groups.set(name, []);

        }

        return true;

    }


    // ==========================================
    // GET GROUP AGENTS
    // ==========================================

    getGroup(group) {

        return this.groups.get(group) || [];

    }


    // ==========================================
    // LIST GROUPS
    // ==========================================

    groupsList() {

        return [...this.groups.keys()];

    }


    // ==========================================
    // MOVE AGENT GROUP
    // ==========================================

    moveToGroup(name, newGroup) {

        const data = this.agents.get(name);

        if (!data)
            return false;

        this.removeFromGroupIndex(data);

        data.group = newGroup;

        this.addToGroupIndex(data);

        this.cache.search.clear();

        this.emit("agent.groupChanged", data);

        return true;

    }


    // ==========================================
    // ADD TAG INDEX
    // ==========================================

    addToTagIndex(data) {

        if (!Array.isArray(data.tags))
            return;

        data.tags.forEach(tag => {

            if (!this.tags.has(tag)) {

                this.tags.set(tag, []);

            }

            const list = this.tags.get(tag);

            if (!list.includes(data.name)) {

                list.push(data.name);

            }

        });

    }


    // ==========================================
    // REMOVE TAG INDEX
    // ==========================================

    removeFromTagIndex(data) {

        if (!Array.isArray(data.tags))
            return;

        data.tags.forEach(tag => {

            const list = this.tags.get(tag);

            if (!list)
                return;

            const index = list.indexOf(data.name);

            if (index !== -1) {

                list.splice(index, 1);

            }

            if (list.length === 0) {

                this.tags.delete(tag);

            }

        });

    }


    // ==========================================
    // ADD TAG TO AGENT
    // ==========================================

    addTag(name, tag) {

        const data = this.agents.get(name);

        if (!data || !tag)
            return false;

        if (!data.tags.includes(tag)) {

            data.tags.push(tag);

        }

        this.addToTagIndex(data);

        this.cache.search.clear();

        return true;

    }


    // ==========================================
    // REMOVE TAG
    // ==========================================

    removeTag(name, tag) {

        const data = this.agents.get(name);

        if (!data)
            return false;

        const index = data.tags.indexOf(tag);

        if (index !== -1) {

            data.tags.splice(index, 1);

        }

        this.removeFromTagIndex({

            ...data,
            tags: [tag]

        });

        this.cache.search.clear();

        return true;

    }


    // ==========================================
    // GET BY TAG
    // ==========================================

    getByTag(tag) {

        return this.tags.get(tag) || [];

    }


    // ==========================================
    // LIST TAGS
    // ==========================================

    tagsList() {

        return [...this.tags.keys()];

    }


    // ==========================================
    // SEARCH AGENTS
    // ==========================================

    search(query) {

        if (!query)
            return [];

        const text = query.toString().toLowerCase();

        // Serve from cache if nothing changed since last search.
        if (this.cache.search.has(text)) {

            return [...this.cache.search.get(text)];

        }

        const result = [];

        this.agents.forEach(data => {

            const target = (

                data.name + " " +
                data.type + " " +
                data.group + " " +
                data.tags.join(" ")

            ).toLowerCase();

            if (target.includes(text)) {

                result.push(data);

            }

        });

        this.cache.search.set(text, [...result]);

        return result;

    }


    // ==========================================
    // FILTER AGENTS
    // ==========================================

    filter(options = {}) {

        const result = [];

        this.agents.forEach(data => {

            let match = true;

            if (options.status && data.status !== options.status) {

                match = false;

            }

            if (options.group && data.group !== options.group) {

                match = false;

            }

            if (options.type && data.type !== options.type) {

                match = false;

            }

            if (match) {

                result.push(data);

            }

        });

        return result;

    }


    // ==========================================
    // PART 4 / 6
    // Event System + Health Monitoring + Recovery Hooks
    // ==========================================


    // ==========================================
    // EVENT LISTENER ADD
    // ==========================================

    on(event, callback) {

        if (!event || typeof callback !== "function") {

            return false;

        }

        if (!this.listeners.has(event)) {

            this.listeners.set(event, []);

        }

        if (!this.listeners.get(event).includes(callback)) {

            this.listeners.get(event).push(callback);

        }

        this.log("Listener Added:", event);

        return true;

    }


    // ==========================================
    // EVENT REMOVE
    // ==========================================

    off(event, callback) {

        if (!this.listeners.has(event)) {

            return false;

        }

        if (!callback) {

            this.listeners.delete(event);

            return true;

        }

        const list = this.listeners.get(event);

        const filtered = list.filter(fn => fn !== callback);

        this.listeners.set(event, filtered);

        return true;

    }


    // ==========================================
    // EVENT EMIT
    // ==========================================

    emit(event, data = {}) {

        const list = this.listeners.get(event);

        if (!list) {

            return false;

        }

        list.forEach(fn => {

            try {

                fn(data);

            }
            catch (error) {

                console.error("❌ Event Callback Error", error);

                this.stats.errors++;

            }

        });

        return true;

    }


    // ==========================================
    // AGENT HEALTH CHECK
    // ==========================================

    health(name) {

        const data = this.agents.get(name);

        if (!data) {

            return null;

        }

        return {

            name: data.name,
            status: data.status,
            priority: data.priority,
            type: data.type,
            group: data.group,
            runs: data.runs,
            errors: data.errors,
            lastRun: data.lastRun,
            created: data.created

        };

    }


    // ==========================================
    // ALL HEALTH REPORT
    // ==========================================

    healthReport() {

        const report = [];

        this.agents.forEach(data => {

            report.push({

                name: data.name,
                status: data.status,
                runs: data.runs,
                errors: data.errors

            });

        });

        return {

            total: this.agents.size,
            agents: report

        };

    }


    // ==========================================
    // HEARTBEAT
    // Call this whenever an agent responds/does work,
    // so liveness can be checked independently of runs/errors.
    // ==========================================

    heartbeat(name) {

        const data = this.agents.get(name);

        if (!data)
            return false;

        const now = Date.now();

        if (data.lastHeartbeat) {

            data.lastResponseTime = now - data.lastHeartbeat;

        }

        data.lastHeartbeat = now;

        return true;

    }


    // ==========================================
    // IS ALIVE
    // An agent is considered alive if it has sent a
    // heartbeat within `timeout` ms (default 30s).
    // ==========================================

    isAlive(name, timeout = 30000) {

        const data = this.agents.get(name);

        if (!data || !data.lastHeartbeat)
            return false;

        return (Date.now() - data.lastHeartbeat) <= timeout;

    }


    // ==========================================
    // HEARTBEAT REPORT (ALL AGENTS)
    // ==========================================

    heartbeatReport(timeout = 30000) {

        const report = [];

        this.agents.forEach(data => {

            report.push({

                name: data.name,
                alive: this.isAlive(data.name, timeout),
                lastHeartbeat: data.lastHeartbeat,
                lastResponseTime: data.lastResponseTime || null

            });

        });

        return report;

    }


    // ==========================================
    // CHECK AGENT FAILURE
    // ==========================================

    isHealthy(name) {

        const data = this.agents.get(name);

        if (!data)
            return false;

        return (

            data.status !== "error"
            &&
            data.errors < 10

        );

    }


    // ==========================================
    // RECOVERY MODE
    // ==========================================

    recover(name) {

        const data = this.agents.get(name);

        if (!data) {

            return false;

        }

        try {

            data.status = "recovering";

            this.emit("agent.recovering", data);

            if (typeof data.agent.restart === "function") {

                data.agent.restart();

            }

            data.status = "running";

            data.errors = 0;

            this.emit("agent.recovered", data);

            console.log("♻ Agent Recovered:", name);

            return true;

        }
        catch (error) {

            data.status = "error";

            this.stats.errors++;

            console.error("❌ Recovery Failed:", name, error);

            return false;

        }

    }


    // ==========================================
    // RESET AGENT STATS
    // ==========================================

    resetStats(name) {

        const data = this.agents.get(name);

        if (!data)
            return false;

        data.runs = 0;

        data.errors = 0;

        data.lastRun = null;

        return true;

    }


    // ==========================================
    // ENABLE AGENT
    // ==========================================

    enable(name) {

        const data = this.agents.get(name);

        if (!data)
            return false;

        data.enabled = true;

        data.status = "idle";

        this.emit("agent.enabled", data);

        return true;

    }


    // ==========================================
    // DISABLE AGENT
    // ==========================================

    disable(name) {

        const data = this.agents.get(name);

        if (!data)
            return false;

        data.enabled = false;

        data.status = "disabled";

        this.emit("agent.disabled", data);

        return true;

    }


    // ==========================================
    // PART 5 / 6
    // Persistence + Backup + Restore + Export System
    // ==========================================


    // ==========================================
    // EXPORT REGISTRY DATA
    // ==========================================

    exportData() {

        const agents = [];

        this.agents.forEach(data => {

            agents.push({

                name: data.name,
                type: data.type,
                version: data.version,
                status: data.status,
                priority: data.priority,
                group: data.group,
                tags: data.tags,
                created: data.created,
                lastRun: data.lastRun,
                runs: data.runs,
                errors: data.errors,
                permissions: data.permissions,
                dependencies: data.dependencies,
                enabled: data.enabled

            });

        });

        return {

            version: this.version,
            timestamp: Date.now(),
            stats: this.stats,
            agents: agents

        };

    }


    // ==========================================
    // SERIALIZE REGISTRY
    // ==========================================

    serialize() {

        try {

            return JSON.stringify(this.exportData());

        }
        catch (error) {

            console.error("❌ Serialize Failed", error);

            return null;

        }

    }


    // ==========================================
    // RESTORE REGISTRY
    // ==========================================

    restore(data) {

        try {

            if (typeof data === "string") {

                data = JSON.parse(data);

            }

            if (!data.agents) {

                return false;

            }

            data.agents.forEach(item => {

                const existing = this.agents.get(item.name);

                if (existing) {

                    Object.assign(existing, item);

                }
                else {

                    // Agent isn't live yet (e.g. fresh JARVIS restart with an
                    // empty registry). A real agent instance/class can't be
                    // recovered from serialized JSON, so register a stub
                    // object as a placeholder that carries over the saved
                    // metadata (status, tags, stats, etc). Whatever module
                    // actually owns this agent should call register() again
                    // with the real instance to replace the stub once it
                    // boots — createMeta() below fills in any fields item
                    // doesn't provide.
                    this.register(item.name, {}, item);

                }

            });

            this.cache.search.clear();

            this.rebuildDependencies();

            console.log("♻ Registry Restored");

            return true;

        }
        catch (error) {

            console.error("❌ Restore Error", error);

            this.stats.errors++;

            return false;

        }

    }


    // ==========================================
    // BACKUP CREATE
    // ==========================================

    backup() {

        const backup = {

            id: "BACKUP_" + Date.now(),
            created: Date.now(),
            data: this.exportData()

        };

        this.lastBackup = backup;

        console.log("💾 Registry Backup Created:", backup.id);

        return backup;

    }


    // ==========================================
    // RESTORE BACKUP
    // ==========================================

    restoreBackup(backup) {

        if (!backup || !backup.data) {

            return false;

        }

        return this.restore(backup.data);

    }


    // ==========================================
    // SAVE LOCAL STORAGE
    // ==========================================

    save(key = "jarvis_agent_registry") {

        try {

            if (typeof localStorage === "undefined") {

                console.warn("⚠ localStorage not available, skipping save");

                return false;

            }

            const data = this.serialize();

            localStorage.setItem(key, data);

            console.log("💾 Registry Saved");

            return true;

        }
        catch (error) {

            console.error("❌ Save Failed", error);

            return false;

        }

    }


    // ==========================================
    // LOAD LOCAL STORAGE
    // ==========================================

    load(key = "jarvis_agent_registry") {

        try {

            if (typeof localStorage === "undefined") {

                console.warn("⚠ localStorage not available, skipping load");

                return false;

            }

            const data = localStorage.getItem(key);

            if (!data)
                return false;

            return this.restore(data);

        }
        catch (error) {

            console.error("❌ Load Failed", error);

            return false;

        }

    }


    // ==========================================
    // AUTO SAVE
    // ==========================================

    enableAutoSave(interval = 60000) {

        if (this.autoSaveTimer) {

            clearInterval(this.autoSaveTimer);

        }

        this.autoSaveTimer = setInterval(() => {

            this.save();

        }, interval);

        console.log("⏱ Auto Save Enabled");

        return true;

    }


    // ==========================================
    // DISABLE AUTO SAVE
    // ==========================================

    disableAutoSave() {

        if (this.autoSaveTimer) {

            clearInterval(this.autoSaveTimer);

            this.autoSaveTimer = null;

        }

        console.log("⛔ Auto Save Disabled");

        return true;

    }


    // ==========================================
    // CLONE REGISTRY
    // ==========================================

    clone() {

        return JSON.parse(JSON.stringify(this.exportData()));

    }


    // ==========================================
    // IMPORT AGENT SNAPSHOT
    // ==========================================

    importSnapshot(snapshot) {

        if (!snapshot || !snapshot.agents) {

            return false;

        }

        snapshot.agents.forEach(item => {

            const data = this.agents.get(item.name);

            if (data) {

                Object.assign(data, item);

            }
            else {

                this.register(item.name, {}, item);

            }

        });

        this.cache.search.clear();

        this.rebuildDependencies();

        this.emit("snapshot.loaded", snapshot);

        return true;

    }


    // ==========================================
    // PART 6 / 6 FINAL
    // Security + Diagnostics + Shutdown + Export
    // ==========================================


    // ==========================================
    // PERMISSION CHECK
    // ==========================================

    canAccess(name, permission) {

        const agent = this.agents.get(name);

        if (!agent)
            return false;

        if (!agent.permissions) {

            // Fail closed: no permissions object means no access,
            // rather than silently granting full access.
            return false;

        }

        // Structured shape: { read: true, write: false, execute: true }
        if (!Array.isArray(agent.permissions)) {

            return agent.permissions[permission] === true;

        }

        // Legacy shape: ["read", "execute"]
        return agent.permissions.includes(permission);

    }


    // ==========================================
    // SET PERMISSIONS
    // Accepts either the structured object shape
    // ({read,write,execute}) or a legacy array.
    // ==========================================

    setPermissions(name, permissions = { read: true, write: true, execute: true }) {

        const agent = this.agents.get(name);

        if (!agent)
            return false;

        agent.permissions = permissions;

        this.emit("permissions.updated", agent);

        return true;

    }


    // ==========================================
    // VALIDATE AGENT BY NAME (health/consistency check)
    // NOTE: this intentionally overrides the earlier
    // validate(name, agent) from Part 1 — same as in
    // the original file, the later definition wins.
    // ==========================================

    validateEntry(name) {

        const data = this.agents.get(name);

        if (!data) {

            return {
                valid: false,
                reason: "Agent Not Found"
            };

        }

        const checks = {

            name: !!data.name,
            agent: !!data.agent,
            status: !!data.status

        };

        const valid = Object.values(checks).every(item => item === true);

        return {

            valid,
            checks

        };

    }


    // ==========================================
    // RUN DIAGNOSTIC
    // ==========================================

    diagnostics() {

        const report = {

            version: this.version,
            initialized: this.initialized,
            totalAgents: this.agents.size,
            groups: this.groups.size,
            tags: this.tags.size,
            stats: this.stats,
            timestamp: Date.now()

        };

        const problems = [];

        this.agents.forEach(data => {

            if (data.status === "error") {

                problems.push({
                    agent: data.name,
                    issue: "Agent Error State"
                });

            }

            if (data.errors > 10) {

                problems.push({
                    agent: data.name,
                    issue: "High Error Count"
                });

            }

        });

        report.problems = problems;

        return report;

    }


    // ==========================================
    // REPAIR REGISTRY
    // ==========================================

    repair() {

        let fixed = 0;

        this.agents.forEach(data => {

            if (!data.tags) {

                data.tags = [];
                fixed++;

            }

            if (!data.group) {

                data.group = "general";
                fixed++;

            }

            if (!data.status) {

                data.status = "idle";
                fixed++;

            }

        });

        this.rebuildIndexes();

        console.log("🔧 Registry Repair Completed:", fixed);

        return fixed;

    }


    // ==========================================
    // REBUILD INDEXES
    // ==========================================

    rebuildIndexes() {

        this.groups.clear();

        this.tags.clear();

        this.agents.forEach(data => {

            this.addToGroupIndex(data);

            this.addToTagIndex(data);

        });

        this.cache.search.clear();

        return true;

    }


    // ==========================================
    // REBUILD DEPENDENCY MAP
    // register() is the only other place that writes to
    // this.dependencies — if restore()/importSnapshot()
    // loads corrupted or partial data, the dependency map
    // can drift out of sync with the actual agents. Call
    // this to resync it straight from each agent's own
    // meta.dependencies.
    // ==========================================

    rebuildDependencies() {

        this.dependencies.clear();

        this.agents.forEach(data => {

            this.dependencies.set(data.name, data.dependencies || []);

        });

        return true;

    }


    // ==========================================
    // SAFE SHUTDOWN
    // ==========================================

    shutdown() {

        try {

            this.save();

            this.disableAutoSave();

            this.listeners.clear();

            console.log("🔻 AgentRegistry Shutdown");

            return true;

        }
        catch (error) {

            console.error("❌ Shutdown Failed", error);

            return false;

        }

    }


    // ==========================================
    // FINAL SUMMARY
    // ==========================================

    summary() {

        return {

            version: this.version,
            initialized: this.initialized,
            agents: this.list(),
            total: this.count(),
            health: this.healthReport()

        };

    }


    // ==========================================
    // FINAL EXPORT
    // ==========================================

    export() {

        return this.exportData();

    }


    // ==========================================
    // CLASS END
    // ==========================================

}


// ==========================================
// GLOBAL INSTANCE
// ==========================================

window.AgentRegistryClass = AgentRegistry;

window.AgentRegistry = new AgentRegistry();

window.AgentRegistry.init();

console.log("✅ AgentRegistry V3 PRO FINAL Loaded");


})();