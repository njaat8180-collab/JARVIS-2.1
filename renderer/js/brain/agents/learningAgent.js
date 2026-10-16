// ==========================================
// JARVIS V10
// Autonomous Agent Core
// Learning Agent V2 PRO
// PART 1/3
//
// renderer/js/brain/agents/learningAgent.js
//
// CORE + INIT + LEARNING + KNOWLEDGE
// ==========================================

"use strict";

(function () {

    // ==========================================
    // GLOBAL SAFETY
    // ==========================================

    const root =
        typeof window !== "undefined"
            ? window
            : globalThis;

    // ==========================================
    // LEARNING AGENT
    // ==========================================

    const LearningAgent = {

        version: "2.0.0 PRO",
        name: "LearningAgent",

        status: "idle",
        initialized: false,
        booted: false,

        storageKey: "jarvis_learning_v2",

        maxHistory: 1000,
        maxPatternItems: 500,

        // ======================================
        // MEMORY
        // ======================================

        patterns: new Map(),

        knowledge: {
            commands: {},
            preferences: {},
            failures: {},
            success: {}
        },

        history: [],

        stats: {
            learned: 0,
            predictions: 0,
            successes: 0,
            failures: 0,
            feedback: 0,
            errors: 0
        },

        // ======================================
        // INTERNAL FLAGS
        // ======================================

        _saving: false,
        _loading: false,
        _registered: false,
        _busConnected: false,

        // ==========================================
        // INIT
        // ==========================================

        init() {

            if (this.initialized) {
                return true;
            }

            this.status = "initializing";

            try {

                this.load();

                this.initialized = true;
                this.status = "idle";

                console.log(
                    "🧠 LearningAgent V2 Core Initialized"
                );

                return true;

            } catch (error) {

                this.stats.errors++;

                this.status = "error";

                console.error(
                    "❌ LearningAgent Init Error:",
                    error
                );

                return false;
            }
        },

        // ==========================================
        // RUN
        // ==========================================

        run(task = {}) {

            if (!task || typeof task !== "object") {

                return {
                    success: false,
                    error: "Invalid learning task"
                };
            }

            this.status = "working";

            let result;

            try {

                switch (String(task.action || "").toLowerCase()) {

                    case "learn":

                        result = this.learn(
                            task.data || {}
                        );

                        break;

                    case "analyze":

                        result = this.analyze();

                        break;

                    case "predict":

                        result = this.predict(
                            task.query || ""
                        );

                        break;

                    case "smartpredict":

                    case "smart_predict":

                        result = this.smartPredict(
                            task.query || ""
                        );

                        break;

                    case "feedback":

                        result = this.feedback(
                            task.data || {}
                        );

                        break;

                    case "reward":

                        result = this.reward(
                            task.actionName ||
                            task.value ||
                            task.target ||
                            ""
                        );

                        break;

                    case "penalty":

                        result = this.penalty(
                            task.actionName ||
                            task.value ||
                            task.target ||
                            ""
                        );

                        break;

                    case "status":

                        result = this.getStatus();

                        break;

                    case "data":

                    case "learning_data":

                        result = this.getLearningData();

                        break;

                    case "save":

                        result = this.save();

                        break;

                    case "load":

                        result = this.load();

                        break;

                    case "reset":

                        result = this.reset();

                        break;

                    default:

                        result = {
                            success: false,
                            error:
                                "Unknown Learning Action",
                            action:
                                task.action || null
                        };
                }

            } catch (error) {

                this.stats.errors++;

                console.error(
                    "❌ LearningAgent Run Error:",
                    error
                );

                result = {
                    success: false,
                    error: error.message || String(error)
                };

            } finally {

                this.status = "idle";
            }

            return result;
        },

        // ==========================================
        // RECEIVE MESSAGE
        // ==========================================

        receive(message = {}) {

            return this.run(message);
        },

        // ==========================================
        // LEARN
        // ==========================================

        learn(data = {}) {

            if (!data || typeof data !== "object") {

                return {
                    success: false,
                    error: "Invalid learning data"
                };
            }

            const type =
                String(data.type || "")
                    .trim()
                    .toLowerCase();

            if (!type) {

                return {
                    success: false,
                    error: "Learning type is required"
                };
            }

            const value =
                this.normalizeValue(
                    data.value
                );

            const item = {

                id: this.generateID(),

                type,

                value,

                result:
                    data.result || "",

                metadata:
                    data.metadata || {},

                time: Date.now()
            };

            // ==================================
            // CREATE PATTERN GROUP
            // ==================================

            if (!this.patterns.has(type)) {

                this.patterns.set(
                    type,
                    []
                );
            }

            const patternList =
                this.patterns.get(type);

            patternList.push(item);

            // ==================================
            // LIMIT PATTERN MEMORY
            // ==================================

            while (
                patternList.length >
                this.maxPatternItems
            ) {

                patternList.shift();
            }

            // ==================================
            // UPDATE KNOWLEDGE
            // ==================================

            this.updateKnowledge(item);

            // ==================================
            // HISTORY
            // ==================================

            this.log(
                "learn",
                item
            );

            this.stats.learned++;

            // ==================================
            // SAVE
            // ==================================

            this.save();

            return {

                success: true,

                learned: item,

                type,

                totalLearned:
                    this.stats.learned
            };
        },

        // ==========================================
        // NORMALIZE VALUE
        // ==========================================

        normalizeValue(value) {

            if (
                value === null ||
                value === undefined
            ) {

                return "";
            }

            if (
                typeof value === "string"
            ) {

                return value.trim();
            }

            try {

                return JSON.stringify(value);

            } catch {

                return String(value);
            }
        },

        // ==========================================
        // UPDATE KNOWLEDGE
        // ==========================================

        updateKnowledge(item) {

            if (!item) {
                return false;
            }

            const value =
                String(
                    item.value || ""
                ).trim();

            if (!value) {
                return false;
            }

            switch (item.type) {

                // ==================================
                // COMMAND
                // ==================================

                case "command":

                    this.knowledge.commands[value] =
                        (
                            this.knowledge.commands[value] ||
                            0
                        ) + 1;

                    break;

                // ==================================
                // SUCCESS
                // ==================================

                case "success":

                    this.knowledge.success[value] =
                        (
                            this.knowledge.success[value] ||
                            0
                        ) + 1;

                    this.stats.successes++;

                    break;

                // ==================================
                // FAILURE
                // ==================================

                case "failure":

                    this.knowledge.failures[value] =
                        (
                            this.knowledge.failures[value] ||
                            0
                        ) + 1;

                    this.stats.failures++;

                    break;

                // ==================================
                // PREFERENCE
                // ==================================

                case "preference":

                    this.knowledge.preferences[value] =
                        true;

                    break;

                // ==================================
                // MEMORY
                // ==================================

                case "memory":

                    if (
                        !this.knowledge.memory
                    ) {

                        this.knowledge.memory = {};
                    }

                    this.knowledge.memory[value] =
                        true;

                    break;

                default:

                    // Unknown learning types are
                    // intentionally preserved in
                    // patterns/history.
                    break;
            }

            return true;
        },

        // ==========================================
        // ANALYZE PATTERNS
        // ==========================================

        analyze() {

            const patternSummary = {};

            this.patterns.forEach(
                (items, type) => {

                    patternSummary[type] =
                        Array.isArray(items)
                            ? items.length
                            : 0;
                }
            );

            return {

                success: true,

                patterns:
                    patternSummary,

                commands:
                    Object.keys(
                        this.knowledge.commands || {}
                    ),

                preferences:
                    Object.keys(
                        this.knowledge.preferences || {}
                    ),

                failures:
                    Object.keys(
                        this.knowledge.failures || {}
                    ),

                successActions:
                    Object.keys(
                        this.knowledge.success || {}
                    ),

                statistics:
                    {
                        ...this.stats
                    },

                timestamp:
                    Date.now()
            };
        },

        // ==========================================
        // BASIC PREDICTION
        // ==========================================

        predict(query = "") {

            const text =
                String(query || "")
                    .trim()
                    .toLowerCase();

            if (!text) {

                return {
                    prediction: null,
                    confidence: 0,
                    success: false
                };
            }

            this.stats.predictions++;

            let best = null;
            let bestScore = 0;

            const commands =
                this.knowledge.commands || {};

            Object.keys(commands)
                .forEach(command => {

                    const normalized =
                        command
                            .toLowerCase()
                            .trim();

                    if (!normalized) {
                        return;
                    }

                    let score = 0;

                    // Exact match
                    if (normalized === text) {

                        score = 1000;

                    }

                    // Query contains command
                    else if (
                        text.includes(normalized)
                    ) {

                        score = 500 +
                            normalized.length;

                    }

                    // Command contains query
                    else if (
                        normalized.includes(text)
                    ) {

                        score = 300 +
                            text.length;

                    }

                    if (score > bestScore) {

                        bestScore = score;
                        best = command;
                    }
                });

            return {

                success: true,

                prediction: best,

                confidence:
                    best
                        ? this.convertScoreToConfidence(
                            bestScore
                        )
                        : 0,

                score: bestScore
            };
        },

        // ==========================================
        // SCORE → CONFIDENCE
        // ==========================================

        convertScoreToConfidence(score) {

            if (!score || score <= 0) {
                return 0;
            }

            if (score >= 1000) {
                return 100;
            }

            if (score >= 500) {
                return 90;
            }

            if (score >= 300) {
                return 75;
            }

            return Math.min(
                70,
                Math.max(
                    1,
                    Math.round(score / 5)
                )
            );
        },

        // ==========================================
        // LOG
        // ==========================================

        log(action, data) {

            this.history.push({

                id:
                    this.generateID(),

                action:
                    String(action || "unknown"),

                data,

                time:
                    Date.now()
            });

            while (
                this.history.length >
                this.maxHistory
            ) {

                this.history.shift();
            }

            return true;
        },

        // ==========================================
        // GENERATE ID
        // ==========================================

        generateID() {

            return (
                "LA_" +
                Date.now() +
                "_" +
                Math.random()
                    .toString(36)
                    .slice(2, 8)
            );
        },

        // ==========================================
        // SAFE OBJECT
        // ==========================================

        ensureKnowledgeStructure() {

            if (
                !this.knowledge ||
                typeof this.knowledge !== "object"
            ) {

                this.knowledge = {};
            }

            if (
                !this.knowledge.commands ||
                typeof this.knowledge.commands !== "object"
            ) {

                this.knowledge.commands = {};
            }

            if (
                !this.knowledge.preferences ||
                typeof this.knowledge.preferences !== "object"
            ) {

                this.knowledge.preferences = {};
            }

            if (
                !this.knowledge.failures ||
                typeof this.knowledge.failures !== "object"
            ) {

                this.knowledge.failures = {};
            }

            if (
                !this.knowledge.success ||
                typeof this.knowledge.success !== "object"
            ) {

                this.knowledge.success = {};
            }

            return true;
        },

        // ==========================================
        // END PART 1
        // ==========================================
// ==========================================
// JARVIS V10
// Autonomous Agent Core
// Learning Agent V2 PRO
// PART 2/3
//
// FEEDBACK + REWARD + PREDICTION
// MEMORY + AUTO LEARNING + ANALYTICS
// ==========================================


// ==========================================
// FEEDBACK LEARNING
// ==========================================

feedback(data = {}) {

    if (!data || typeof data !== "object") {

        return {
            success: false,
            error: "Invalid feedback data"
        };
    }

    const action =
        String(
            data.action ||
            data.command ||
            data.value ||
            ""
        ).trim();

    if (!action) {

        return {
            success: false,
            error: "Feedback action is required"
        };
    }

    const success =
        data.success === true;

    const type =
        success
            ? "success"
            : "failure";

    const learningData = {

        type,

        value: action,

        result:
            data.result || "",

        metadata: {

            source:
                data.source ||
                "feedback",

            originalData:
                data.metadata ||
                {}
        }
    };

    const learned =
        this.learn(
            learningData
        );

    this.stats.feedback++;

    this.log(
        "feedback",
        learningData
    );

    return {

        success: true,

        feedback:
            learningData,

        learned,

        patternStrength:
            this.getPatternStrength(
                action
            )
    };
},


// ==========================================
// REWARD SYSTEM
// ==========================================

reward(action) {

    const value =
        String(action || "").trim();

    if (!value) {

        return {
            success: false,
            error: "Reward action is required"
        };
    }

    this.ensureKnowledgeStructure();

    if (
        !this.knowledge.success[value]
    ) {

        this.knowledge.success[value] = 0;
    }

    this.knowledge.success[value]++;

    this.stats.successes++;

    this.log(
        "reward",
        value
    );

    this.save();

    return {

        success: true,

        action: value,

        reward:
            this.knowledge.success[value],

        strength:
            this.getPatternStrength(
                value
            )
    };
},


// ==========================================
// PENALTY SYSTEM
// ==========================================

penalty(action) {

    const value =
        String(action || "").trim();

    if (!value) {

        return {
            success: false,
            error: "Penalty action is required"
        };
    }

    this.ensureKnowledgeStructure();

    if (
        !this.knowledge.failures[value]
    ) {

        this.knowledge.failures[value] = 0;
    }

    this.knowledge.failures[value]++;

    this.stats.failures++;

    this.log(
        "penalty",
        value
    );

    this.save();

    return {

        success: true,

        action: value,

        penalty:
            this.knowledge.failures[value],

        strength:
            this.getPatternStrength(
                value
            )
    };
},


// ==========================================
// PATTERN STRENGTH
// ==========================================

getPatternStrength(value) {

    const key =
        String(value || "").trim();

    if (!key) {
        return 0;
    }

    this.ensureKnowledgeStructure();

    const success =
        Number(
            this.knowledge.success[key] || 0
        );

    const failure =
        Number(
            this.knowledge.failures[key] || 0
        );

    const total =
        success + failure;

    if (total <= 0) {
        return 0;
    }

    return Math.round(
        (
            success /
            total
        ) * 100
    );
},


// ==========================================
// BEST LEARNED ACTION
// ==========================================

getBestAction() {

    this.ensureKnowledgeStructure();

    const actions =
        new Set([
            ...Object.keys(
                this.knowledge.success
            ),
            ...Object.keys(
                this.knowledge.commands
            )
        ]);

    let best = null;
    let bestScore = -1;

    actions.forEach(action => {

        const strength =
            this.getPatternStrength(
                action
            );

        const usage =
            Number(
                this.knowledge.commands[action] ||
                0
            );

        const successCount =
            Number(
                this.knowledge.success[action] ||
                0
            );

        const failureCount =
            Number(
                this.knowledge.failures[action] ||
                0
            );

        /*
         * Balanced score:
         *
         * - success strength
         * - command usage
         * - success history
         * - failure penalty
         */

        const score =
            (
                strength * 2
            ) +
            (
                usage * 0.5
            ) +
            (
                successCount * 2
            ) -
            (
                failureCount * 1.5
            );

        if (
            score > bestScore
        ) {

            bestScore = score;
            best = action;
        }
    });

    return {

        success: true,

        action: best,

        confidence:
            best
                ? this.getPatternStrength(
                    best
                )
                : 0,

        score:
            bestScore > 0
                ? Math.round(
                    bestScore * 100
                ) / 100
                : 0
    };
},


// ==========================================
// ADVANCED SMART PREDICTION
// ==========================================

smartPredict(query) {

    const text =
        String(query || "")
            .trim()
            .toLowerCase();

    if (!text) {

        return {
            success: false,
            prediction: null,
            matches: []
        };
    }

    this.ensureKnowledgeStructure();

    const words =
        text
            .split(/\s+/)
            .filter(Boolean);

    const commands =
        Object.keys(
            this.knowledge.commands
        );

    const matches = [];

    commands.forEach(command => {

        const normalized =
            command
                .toLowerCase()
                .trim();

        if (!normalized) {
            return;
        }

        let wordScore = 0;

        words.forEach(word => {

            if (
                word.length < 2
            ) {
                return;
            }

            if (
                normalized === word
            ) {

                wordScore += 10;

            } else if (
                normalized.includes(word)
            ) {

                wordScore += 5;
            }
        });

        let exactBonus = 0;

        if (
            normalized === text
        ) {

            exactBonus = 100;
        }

        else if (
            normalized.includes(text)
        ) {

            exactBonus = 50;
        }

        else if (
            text.includes(normalized)
        ) {

            exactBonus = 35;
        }

        const strength =
            this.getPatternStrength(
                command
            );

        const usage =
            Number(
                this.knowledge.commands[command] ||
                0
            );

        const successCount =
            Number(
                this.knowledge.success[command] ||
                0
            );

        const failureCount =
            Number(
                this.knowledge.failures[command] ||
                0
            );

        const finalScore =
            exactBonus +
            (
                wordScore * 10
            ) +
            (
                strength * 0.5
            ) +
            (
                usage * 0.25
            ) +
            (
                successCount * 0.5
            ) -
            (
                failureCount * 0.25
            );

        if (
            finalScore > 0
        ) {

            matches.push({

                command,

                score:
                    Math.round(
                        finalScore * 100
                    ) / 100,

                strength,

                usage,

                success:
                    successCount,

                failures:
                    failureCount
            });
        }
    });

    matches.sort(
        (a, b) =>
            b.score - a.score
    );

    const best =
        matches[0] || null;

    return {

        success: true,

        query: text,

        prediction:
            best
                ? best.command
                : null,

        confidence:
            best
                ? Math.min(
                    100,
                    Math.round(
                        (
                            best.strength * 0.6
                        ) +
                        (
                            Math.min(
                                best.score,
                                100
                            ) * 0.4
                        )
                    )
                )
                : 0,

        matches:
            matches.slice(
                0,
                10
            )
    };
},


// ==========================================
// MEMORY AGENT CONNECTION
// ==========================================

syncMemory() {

    const memoryAgent =
        root.MemoryAgent ||
        root.MemoryManagerAgent;

    if (!memoryAgent) {

        console.warn(
            "⚠ Memory Agent Missing"
        );

        return {
            success: false,
            reason: "Memory Agent Missing"
        };
    }

    try {

        let memory = null;

        /*
         * Try modern MemoryManagerAgent
         */

        if (
            root.MemoryManagerAgent &&
            typeof root.MemoryManagerAgent.run ===
            "function"
        ) {

            memory =
                root.MemoryManagerAgent.run({

                    action: "recall",

                    query: "learning"
                });
        }

        /*
         * Fallback to old MemoryAgent
         */

        else if (
            root.MemoryAgent &&
            typeof root.MemoryAgent.run ===
            "function"
        ) {

            memory =
                root.MemoryAgent.run({

                    action: "recall",

                    query: "learning"
                });
        }

        /*
         * Handle Promise safely.
         */

        if (
            memory &&
            typeof memory.then ===
            "function"
        ) {

            return memory
                .then(result => {

                    return this.importMemory(
                        result
                    );

                })
                .catch(error => {

                    this.stats.errors++;

                    console.error(
                        "❌ Learning Memory Sync Error:",
                        error
                    );

                    return {
                        success: false,
                        error:
                            error.message ||
                            String(error)
                    };
                });
        }

        return this.importMemory(
            memory
        );

    } catch (error) {

        this.stats.errors++;

        console.error(
            "❌ Memory Sync Error:",
            error
        );

        return {
            success: false,
            error:
                error.message ||
                String(error)
        };
    }
},


// ==========================================
// IMPORT MEMORY
// ==========================================

importMemory(memory) {

    if (!memory) {

        return {
            success: false,
            imported: 0
        };
    }

    /*
     * Normalize possible memory formats.
     */

    let items = memory;

    if (
        memory &&
        Array.isArray(memory.data)
    ) {

        items = memory.data;
    }

    else if (
        memory &&
        Array.isArray(memory.memories)
    ) {

        items = memory.memories;
    }

    else if (
        memory &&
        Array.isArray(memory.results)
    ) {

        items = memory.results;
    }

    if (!Array.isArray(items)) {

        items = [items];
    }

    let imported = 0;

    items.forEach(item => {

        if (!item) {
            return;
        }

        let content =
            item.content ||
            item.value ||
            item.text ||
            item.data;

        if (
            content === null ||
            content === undefined
        ) {

            return;
        }

        if (
            typeof content === "object"
        ) {

            try {

                content =
                    JSON.stringify(
                        content
                    );

            } catch {

                content =
                    String(content);
            }
        }

        const result =
            this.learn({

                type: "memory",

                value:
                    String(content),

                metadata: {

                    source:
                        "MemoryAgent"
                }
            });

        if (
            result &&
            result.success
        ) {

            imported++;
        }
    });

    return {

        success: true,

        imported
    };
},


// ==========================================
// AUTO LEARNING CYCLE
// ==========================================

autoLearn(options = {}) {

    if (
        !this.initialized
    ) {

        this.init();
    }

    const result = {

        success: true,

        memory: null,

        analysis: null,

        bestAction: null,

        saved: false,

        timestamp:
            Date.now()
    };

    try {

        /*
         * Memory sync can return a Promise.
         * Do not break the synchronous engine.
         */

        result.memory =
            this.syncMemory();

        result.analysis =
            this.analyze();

        result.bestAction =
            this.getBestAction();

        result.saved =
            this.save();

        this.log(
            "auto_learning",
            {
                options,
                result: {
                    analysis:
                        result.analysis,
                    bestAction:
                        result.bestAction
                }
            }
        );

        return result;

    } catch (error) {

        this.stats.errors++;

        console.error(
            "❌ Auto Learning Error:",
            error
        );

        return {

            success: false,

            error:
                error.message ||
                String(error),

            timestamp:
                Date.now()
        };
    }
},


// ==========================================
// LEARNING DATABASE
// ==========================================

getLearningData() {

    return {

        version:
            this.version,

        name:
            this.name,

        patterns:
            Array.from(
                this.patterns.entries()
            ),

        knowledge:
            this.knowledge,

        history:
            this.history,

        stats:
            this.stats,

        timestamp:
            Date.now()
    };
},


// ==========================================
// PRIORITY CALCULATION
// ==========================================

getPriority(value) {

    const key =
        String(value || "").trim();

    if (!key) {

        return {

            value: "",

            priority: 0
        };
    }

    this.ensureKnowledgeStructure();

    const strength =
        this.getPatternStrength(
            key
        );

    const usage =
        Number(
            this.knowledge.commands[key] ||
            0
        );

    const success =
        Number(
            this.knowledge.success[key] ||
            0
        );

    const failures =
        Number(
            this.knowledge.failures[key] ||
            0
        );

    const priority =
        (
            strength * 2
        ) +
        (
            usage
        ) +
        (
            success * 2
        ) -
        (
            failures
        );

    return {

        value: key,

        priority:
            Math.round(
                priority * 100
            ) / 100,

        strength,

        usage,

        success,

        failures
    };
},


// ==========================================
// TOP LEARNED ITEMS
// ==========================================

getTopLearning(limit = 10) {

    let safeLimit =
        Number(limit);

    if (
        !Number.isFinite(
            safeLimit
        ) ||
        safeLimit <= 0
    ) {

        safeLimit = 10;
    }

    safeLimit =
        Math.min(
            Math.floor(
                safeLimit
            ),
            100
        );

    this.ensureKnowledgeStructure();

    const items =
        new Set([
            ...Object.keys(
                this.knowledge.commands
            ),
            ...Object.keys(
                this.knowledge.success
            )
        ]);

    const list = [];

    items.forEach(item => {

        list.push(
            this.getPriority(
                item
            )
        );
    });

    list.sort(
        (a, b) =>
            b.priority -
            a.priority
    );

    return list.slice(
        0,
        safeLimit
    );
},


// ==========================================
// FORGET OLD LEARNING
// ==========================================

forgetOld(days = 30) {

    let safeDays =
        Number(days);

    if (
        !Number.isFinite(
            safeDays
        ) ||
        safeDays < 0
    ) {

        safeDays = 30;
    }

    const limit =
        Date.now() -
        (
            safeDays *
            24 *
            60 *
            60 *
            1000
        );

    let removed = 0;

    this.patterns.forEach(
        (items, key) => {

            if (
                !Array.isArray(items)
            ) {

                this.patterns.set(
                    key,
                    []
                );

                return;
            }

            const filtered =
                items.filter(
                    item => {

                        const time =
                            Number(
                                item &&
                                item.time
                            );

                        const keep =
                            time >= limit;

                        if (!keep) {
                            removed++;
                        }

                        return keep;
                    }
                );

            this.patterns.set(
                key,
                filtered
            );
        }
    );

    this.log(
        "cleanup",
        {
            days: safeDays,
            removed
        }
    );

    this.save();

    return {

        success: true,

        days:
            safeDays,

        removed
    };
},


// ==========================================
// PART 2 END
// ==========================================












// ==========================================
// JARVIS V10
// Autonomous Agent Core
// Learning Agent V2 PRO
// PART 3/3 FINAL
//
// AGENT BUS + REGISTRY
// SAVE + LOAD + STATUS
// RESET + BOOT + EXPORT
// ==========================================


// ==========================================
// SEND TO AGENT BUS
// ==========================================

sendToBus(message = {}) {

    const bus = root.AgentBus;

    if (!bus) {

        console.warn(
            "⚠ AgentBus Missing"
        );

        return false;
    }

    try {

        const payload = {

            from:
                this.name,

            source:
                this.name,

            type:
                "learning",

            data:
                message,

            time:
                Date.now()
        };

        // ==================================
        // Preferred API
        // ==================================

        if (
            typeof bus.emit ===
            "function"
        ) {

            bus.emit(
                "learning",
                payload
            );

            return true;
        }

        // ==================================
        // Legacy API
        // ==================================

        if (
            typeof bus.send ===
            "function"
        ) {

            bus.send(
                payload
            );

            return true;
        }

        console.warn(
            "⚠ AgentBus has no emit/send API"
        );

        return false;

    } catch (error) {

        this.stats.errors++;

        console.error(
            "❌ AgentBus Send Error:",
            error
        );

        return false;
    }
},


// ==========================================
// RECEIVE BUS MESSAGE
// ==========================================

onBusMessage(message = {}) {

    if (
        !message ||
        typeof message !== "object"
    ) {

        return false;
    }

    try {

        /*
         * Ignore our own broadcast.
         * This prevents a learning feedback loop.
         */

        if (
            message.source ===
            this.name
        ) {

            return false;
        }

        const type =
            String(
                message.type ||
                ""
            ).toLowerCase();

        const data =
            message.data ||
            message.payload ||
            message;

        // ==================================
        // FEEDBACK
        // ==================================

        if (
            type === "feedback"
        ) {

            return this.feedback(
                data || {}
            );
        }

        // ==================================
        // LEARNING
        // ==================================

        if (
            type === "learning" ||
            type === "learn"
        ) {

            return this.learn(
                data || {}
            );
        }

        // ==================================
        // MEMORY UPDATE
        // ==================================

        if (
            type === "memory_update" ||
            type === "memory.update"
        ) {

            return this.learn({

                type:
                    "memory",

                value:
                    data
            });
        }

        // ==================================
        // TASK SUCCESS
        // ==================================

        if (
            type === "task.completed" ||
            type === "task_success"
        ) {

            return this.feedback({

                action:
                    data.action ||
                    data.task ||
                    "",

                success:
                    true,

                result:
                    data.result ||
                    data.output ||
                    "",

                source:
                    "AgentBus"
            });
        }

        // ==================================
        // TASK FAILURE
        // ==================================

        if (
            type === "task.failed" ||
            type === "task_failure"
        ) {

            return this.feedback({

                action:
                    data.action ||
                    data.task ||
                    "",

                success:
                    false,

                result:
                    data.error ||
                    data.result ||
                    "",

                source:
                    "AgentBus"
            });
        }

        return false;

    } catch (error) {

        this.stats.errors++;

        console.error(
            "❌ AgentBus Message Error:",
            error
        );

        return false;
    }
},


// ==========================================
// CONNECT AGENT BUS
// ==========================================

connectBus() {

    const bus =
        root.AgentBus;

    if (!bus) {

        console.warn(
            "⚠ AgentBus Missing"
        );

        return false;
    }

    /*
     * Prevent duplicate subscriptions.
     */

    if (
        this._busConnected
    ) {

        return true;
    }

    try {

        let connected = false;

        // ==================================
        // MODERN / V10 SUBSCRIBE
        // ==================================

        if (
            typeof bus.subscribe ===
            "function"
        ) {

            /*
             * Different JARVIS AgentBus versions
             * use different subscribe signatures.
             *
             * Try the current 3-argument style first.
             */

            try {

                bus.subscribe(
                    "learning",
                    this.name,
                    (message) => {

                        this.onBusMessage(
                            message
                        );
                    }
                );

                connected = true;

            } catch (error) {

                /*
                 * Fallback:
                 * event + callback
                 */

                try {

                    bus.subscribe(
                        "learning",
                        (message) => {

                            this.onBusMessage(
                                message
                            );
                        }
                    );

                    connected = true;

                } catch (fallbackError) {

                    console.warn(
                        "⚠ AgentBus Subscribe Failed:",
                        fallbackError
                    );
                }
            }
        }

        // ==================================
        // EVENT LISTENER FALLBACK
        // ==================================

        if (
            !connected &&
            typeof bus.on ===
            "function"
        ) {

            bus.on(
                "learning",
                (message) => {

                    this.onBusMessage(
                        message
                    );
                }
            );

            connected = true;
        }

        if (connected) {

            this._busConnected = true;

            console.log(
                "📡 LearningAgent Connected To AgentBus"
            );

            return true;
        }

        return false;

    } catch (error) {

        this.stats.errors++;

        console.error(
            "❌ LearningAgent Bus Connection Error:",
            error
        );

        return false;
    }
},


// ==========================================
// REGISTER WITH AGENT REGISTRY
// ==========================================

register() {

    const registry =
        root.AgentRegistry;

    if (!registry) {

        console.warn(
            "⚠ AgentRegistry Missing"
        );

        return false;
    }

    if (
        this._registered
    ) {

        return true;
    }

    try {

        if (
            typeof registry.register !==
            "function"
        ) {

            console.warn(
                "⚠ AgentRegistry.register Missing"
            );

            return false;
        }

        const metadata = {

            type:
                "core",

            group:
                "learning",

            priority:
                20,

            version:
                this.version,

            tags: [

                "learning",

                "patterns",

                "prediction",

                "feedback",

                "self-improvement"
            ]
        };

        registry.register(

            this.name,

            this,

            metadata
        );

        this._registered = true;

        console.log(
            "🤖 LearningAgent Registered"
        );

        return true;

    } catch (error) {

        /*
         * Some older registries may throw
         * when the same agent already exists.
         */

        const message =
            String(
                error &&
                error.message
                    ? error.message
                    : error
            ).toLowerCase();

        if (
            message.includes(
                "already"
            ) ||
            message.includes(
                "exist"
            ) ||
            message.includes(
                "duplicate"
            )
        ) {

            this._registered = true;

            console.warn(
                "⚠ LearningAgent Already Registered"
            );

            return true;
        }

        this.stats.errors++;

        console.error(
            "❌ LearningAgent Registration Error:",
            error
        );

        return false;
    }
},


// ==========================================
// SAVE LEARNING DATA
// ==========================================

save() {

    if (
        this._saving
    ) {

        return false;
    }

    try {

        if (
            typeof localStorage ===
            "undefined"
        ) {

            return false;
        }

        this._saving = true;

        const data = {

            version:
                this.version,

            patterns:
                Array.from(
                    this.patterns.entries()
                ),

            knowledge:
                this.knowledge,

            history:
                this.history,

            stats:
                this.stats,

            saved:
                Date.now()
        };

        localStorage.setItem(

            this.storageKey,

            JSON.stringify(
                data
            )
        );

        return true;

    } catch (error) {

        this.stats.errors++;

        console.error(
            "❌ Learning Save Error:",
            error
        );

        return false;

    } finally {

        this._saving = false;
    }
},


// ==========================================
// LOAD LEARNING DATA
// ==========================================

load() {

    if (
        this._loading
    ) {

        return false;
    }

    try {

        if (
            typeof localStorage ===
            "undefined"
        ) {

            return false;
        }

        this._loading = true;

        const raw =
            localStorage.getItem(
                this.storageKey
            );

        if (!raw) {

            return false;
        }

        let parsed;

        try {

            parsed =
                JSON.parse(
                    raw
                );

        } catch (parseError) {

            console.warn(
                "⚠ Learning data corrupted. Resetting safely."
            );

            localStorage.removeItem(
                this.storageKey
            );

            return false;
        }

        // ==================================
        // PATTERNS
        // ==================================

        if (
            Array.isArray(
                parsed.patterns
            )
        ) {

            this.patterns.clear();

            parsed.patterns.forEach(
                entry => {

                    if (
                        !Array.isArray(
                            entry
                        )
                    ) {

                        return;
                    }

                    const key =
                        String(
                            entry[0] ||
                            ""
                        );

                    const items =
                        Array.isArray(
                            entry[1]
                        )
                            ? entry[1]
                            : [];

                    if (key) {

                        this.patterns.set(
                            key,
                            items
                        );
                    }
                }
            );
        }

        // ==================================
        // KNOWLEDGE
        // ==================================

        if (
            parsed.knowledge &&
            typeof parsed.knowledge ===
            "object"
        ) {

            this.knowledge =
                parsed.knowledge;
        }

        this.ensureKnowledgeStructure();

        // ==================================
        // HISTORY
        // ==================================

        if (
            Array.isArray(
                parsed.history
            )
        ) {

            this.history =
                parsed.history.slice(
                    -this.maxHistory
                );
        }

        // ==================================
        // STATS
        // ==================================

        if (
            parsed.stats &&
            typeof parsed.stats ===
            "object"
        ) {

            this.stats = {

                learned:
                    Number(
                        parsed.stats.learned ||
                        0
                    ),

                predictions:
                    Number(
                        parsed.stats.predictions ||
                        0
                    ),

                successes:
                    Number(
                        parsed.stats.successes ||
                        0
                    ),

                failures:
                    Number(
                        parsed.stats.failures ||
                        0
                    ),

                feedback:
                    Number(
                        parsed.stats.feedback ||
                        0
                    ),

                errors:
                    Number(
                        parsed.stats.errors ||
                        0
                    )
            };
        }

        console.log(
            "💾 LearningAgent Data Loaded"
        );

        return true;

    } catch (error) {

        this.stats.errors++;

        console.error(
            "❌ Learning Load Error:",
            error
        );

        return false;

    } finally {

        this._loading = false;
    }
},


// ==========================================
// STATUS
// ==========================================

getStatus() {

    this.ensureKnowledgeStructure();

    return {

        success:
            true,

        name:
            this.name,

        version:
            this.version,

        status:
            this.status,

        initialized:
            this.initialized,

        booted:
            this.booted,

        registered:
            this._registered,

        busConnected:
            this._busConnected,

        patterns:
            this.patterns.size,

        commands:
            Object.keys(
                this.knowledge.commands
            ).length,

        preferences:
            Object.keys(
                this.knowledge.preferences
            ).length,

        successes:
            Object.keys(
                this.knowledge.success
            ).length,

        failures:
            Object.keys(
                this.knowledge.failures
            ).length,

        history:
            this.history.length,

        stats:
            {
                ...this.stats
            },

        timestamp:
            Date.now()
    };
},


// ==========================================
// RESET
// ==========================================

reset(options = {}) {

    const clearStorage =
        options.clearStorage !== false;

    try {

        this.patterns.clear();

        this.knowledge = {

            commands: {},

            preferences: {},

            failures: {},

            success: {}
        };

        this.history = [];

        this.stats = {

            learned: 0,

            predictions: 0,

            successes: 0,

            failures: 0,

            feedback: 0,

            errors: 0
        };

        if (
            clearStorage &&
            typeof localStorage !==
            "undefined"
        ) {

            localStorage.removeItem(
                this.storageKey
            );
        }

        console.log(
            "♻ LearningAgent Reset Complete"
        );

        return true;

    } catch (error) {

        this.stats.errors++;

        console.error(
            "❌ LearningAgent Reset Error:",
            error
        );

        return false;
    }
},


// ==========================================
// HEALTH
// ==========================================

health() {

    const status =
        this.getStatus();

    return {

        healthy:
            Boolean(
                this.initialized &&
                this.status !== "error"
            ),

        agent:
            this.name,

        version:
            this.version,

        status:
            this.status,

        initialized:
            this.initialized,

        registered:
            this._registered,

        bus:
            this._busConnected,

        patterns:
            this.patterns.size,

        history:
            this.history.length,

        errors:
            this.stats.errors,

        timestamp:
            Date.now()
    };
},


// ==========================================
// REPORT STATUS
// ==========================================

reportStatus() {

    const status =
        this.health();

    console.log(
        "📊 LearningAgent Status:",
        status
    );

    return status;
},


// ==========================================
// BOOT
// ==========================================

boot() {

    /*
     * Prevent duplicate boot.
     */

    if (
        this.booted
    ) {

        console.warn(
            "⚠ LearningAgent Already Booted"
        );

        return true;
    }

    try {

        console.log(
            "🚀 LearningAgent Boot Starting..."
        );

        // ==================================
        // 1. INIT
        // ==================================

        if (
            !this.init()
        ) {

            console.error(
                "❌ LearningAgent Init Failed"
            );

            return false;
        }

        // ==================================
        // 2. REGISTRY
        // ==================================

        this.register();

        // ==================================
        // 3. AGENT BUS
        // ==================================

        this.connectBus();

        // ==================================
        // 4. ENSURE STRUCTURE
        // ==================================

        this.ensureKnowledgeStructure();

        // ==================================
        // 5. FINAL STATE
        // ==================================

        this.booted = true;
        this.status = "idle";

        console.log(
            "🟢 LearningAgent ONLINE"
        );

        console.log(
            "📊 LearningAgent Status:",
            this.getStatus()
        );

        return true;

    } catch (error) {

        this.stats.errors++;

        this.status = "error";

        console.error(
            "❌ LearningAgent Boot Error:",
            error
        );

        return false;
    }
}


// ==========================================
// END OBJECT
// ==========================================

};


// ==========================================
// GLOBAL EXPORT
// ==========================================

if (
    root.LearningAgent &&
    root.LearningAgent !== LearningAgent
) {

    console.warn(
        "⚠ Existing LearningAgent detected. Replacing with V2."
    );
}

root.LearningAgent =
    LearningAgent;


// ==========================================
// START
// ==========================================

LearningAgent.boot();


// ==========================================
// FINAL LOG
// ==========================================

console.log(
    "✅ LearningAgent V2 PRO FINAL Loaded"
);





    
})();
