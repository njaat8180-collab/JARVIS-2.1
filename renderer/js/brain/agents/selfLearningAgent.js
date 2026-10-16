"use strict";

/*
============================================================
JARVIS V10
Autonomous Agent Core
SelfLearningAgent V4 STABLE
PART 1/5
Core + Init + Memory + Engine Integration
============================================================

FILE:
renderer/js/brain/agents/selfLearningAgent.js

IMPORTANT:
- Safe repeated boot
- Safe repeated engine connection
- Safe AgentBus connection
- No duplicate listeners
- No duplicate engine connection logs
- Compatible with existing Learning Engines
============================================================
*/

(function () {

    /* ======================================================
       GLOBAL SAFETY
    ====================================================== */

    const root =
        typeof window !== "undefined"
            ? window
            : globalThis;


    /* ======================================================
       SELF LEARNING AGENT
    ====================================================== */

    const SelfLearningAgent = {

        version: "4.0.0 STABLE",

        name: "SelfLearningAgent",

        status: "idle",

        initialized: false,

        booted: false,

        registered: false,

        busConnected: false,

        backgroundLearningStarted: false,

        storageKey: "jarvis_self_learning_v4",

        backupKey: "jarvis_learning_backup_v4",


        /* ==================================================
           MEMORY CORE
        ================================================== */

        experiences: [],

        knowledge: [],

        feedback: [],

        patterns: [],

        maxMemory: 5000,


        /* ==================================================
           STATS
        ================================================== */

        stats: {

            learned: 0,

            feedback: 0,

            predictions: 0,

            improvements: 0,

            errors: 0

        },


        /* ==================================================
           ENGINE CACHE
        ================================================== */

        engines: {},

        analyticsEngine: null,

        backupEngine: null,

        healthMonitor: null,

        memoryAgent: null,

        knowledgeAgent: null,


        /* ==================================================
           INTERNAL FLAGS
        ================================================== */

        _engineConnectionLogged: {},

        _subscriptions: {},

        _lastBootTime: 0,


        /* ==================================================
           INIT
        ================================================== */

        init() {

            if (this.initialized) {

                return true;

            }


            this.load();

            this.initialized = true;

            this.status = "ready";


            console.log(
                "🧠 SelfLearningAgent Core Initialized"
            );


            return true;

        },


        /* ==================================================
           RUN
        ================================================== */

        run(task = {}) {

            this.status = "working";

            let result;


            try {

                const action =
                    String(
                        task.action || ""
                    )
                    .toLowerCase()
                    .trim();


                switch (action) {

                    case "learn":

                        result =
                            this.learn(
                                task.data
                            );

                        break;


                    case "experience":

                        result =
                            this.storeExperience(
                                task.data
                            );

                        break;


                    case "feedback":

                        result =
                            this.addFeedback(
                                task.data
                            );

                        break;


                    case "status":

                        result =
                            this.getStatus();

                        break;


                    case "health":

                        result =
                            this.health();

                        break;


                    case "analytics":

                        result =
                            this.getAnalytics();

                        break;


                    case "save":

                        result =
                            this.save();

                        break;


                    case "load":

                        result =
                            this.load();

                        break;


                    case "predict":

                        result =
                            this.predict(
                                task.data
                            );

                        break;


                    case "replay":

                        result =
                            this.replay();

                        break;


                    case "improve":

                        result =
                            this.improve();

                        break;


                    case "optimize":

                        result =
                            this.optimize();

                        break;


                    case "backup":

                        result =
                            this.createBackup();

                        break;


                    default:

                        result = {

                            success: false,

                            error:
                                "Unknown Learning Action",

                            action

                        };

                }


            }
            catch (error) {

                this.stats.errors++;

                console.error(
                    "❌ SelfLearningAgent Run Error:",
                    error
                );


                result = {

                    success: false,

                    error:
                        error?.message ||
                        String(error)

                };

            }


            this.status = "idle";


            return result;

        },


        /* ==================================================
           RECEIVE
        ================================================== */

        receive(message = {}) {

            return this.run(
                message
            );

        },


        /* ==================================================
           LEARN
        ================================================== */

        learn(data = {}) {

            if (
                !data ||
                typeof data !== "object"
            ) {

                data = {};

            }


            const experience = {

                id:
                    this.generateID(),

                input:
                    data.input ?? "",

                output:
                    data.output ?? "",

                category:
                    data.category ||
                    "general",

                metadata:
                    data.metadata || {},

                time:
                    Date.now()

            };


            this.experiences.push(
                experience
            );


            this.stats.learned++;


            this.optimizeMemory();


            this.save();


            return {

                success: true,

                experience

            };

        },


        /* ==================================================
           STORE EXPERIENCE
        ================================================== */

        storeExperience(data = {}) {

            if (
                data === null ||
                data === undefined
            ) {

                return {

                    success: false,

                    error:
                        "Experience data missing"

                };

            }


            const item = {

                id:
                    this.generateID(),

                data,

                time:
                    Date.now()

            };


            this.experiences.push(
                item
            );


            this.stats.learned++;


            this.optimizeMemory();


            return {

                success: true,

                experience: item

            };

        },


        /* ==================================================
           FEEDBACK
        ================================================== */

        addFeedback(data = {}) {

            const item = {

                id:
                    this.generateID(),

                data,

                time:
                    Date.now()

            };


            this.feedback.push(
                item
            );


            this.stats.feedback++;


            this.optimizeMemory();


            this.save();


            return {

                success: true,

                feedback: item

            };

        },


        /* ==================================================
           MEMORY OPTIMIZER
        ================================================== */

        optimizeMemory() {

            while (
                this.experiences.length >
                this.maxMemory
            ) {

                this.experiences.shift();

            }


            while (
                this.feedback.length >
                this.maxMemory
            ) {

                this.feedback.shift();

            }


            while (
                this.knowledge.length >
                this.maxMemory
            ) {

                this.knowledge.shift();

            }


            return true;

        },


        /* ==================================================
           SEARCH MEMORY
        ================================================== */

        searchMemory(query = "") {

            const text =
                String(query || "")
                    .toLowerCase()
                    .trim();


            if (!text) {

                return [];

            }


            return this.experiences.filter(
                item => {

                    try {

                        return JSON
                            .stringify(item)
                            .toLowerCase()
                            .includes(text);

                    }
                    catch {

                        return false;

                    }

                }
            );

        },


        /* ==================================================
           ADD KNOWLEDGE
        ================================================== */

        addKnowledge(data = {}) {

            const item = {

                id:
                    this.generateID(),

                data,

                time:
                    Date.now()

            };


            this.knowledge.push(
                item
            );


            this.optimizeMemory();


            return {

                success: true,

                knowledge: item

            };

        },


        /* ==================================================
           GENERATE ID
        ================================================== */

        generateID() {

            return (

                "LEARN_" +

                Date.now() +

                "_" +

                Math.floor(
                    Math.random() * 999999
                )

            );

        },


        /* ==================================================
           LEARNING ENGINE CONNECTION
        ================================================== */

        connectLearningEngines() {

            const modules = [

                "ReinforcementEngine",

                "PredictionEngine",

                "ExperienceReplayEngine",

                "AdaptiveIntelligence",

                "SelfOptimisationEngine",

                "BackgroundLearningEngine",

                "BackupRecoveryEngine",

                "AnalyticsEngine",

                "HealthMonitor"

            ];


            let connected = 0;


            modules.forEach(
                name => {

                    const engine =
                        root[name];


                    if (
                        !engine
                    ) {

                        return;

                    }


                    /*
                    ------------------------------------------------
                    IMPORTANT:
                    Do not replace an already connected engine.
                    This prevents duplicate reconnect logs.
                    ------------------------------------------------
                    */

                    if (
                        this.engines[name] ===
                        engine
                    ) {

                        connected++;

                        return;

                    }


                    this.engines[name] =
                        engine;


                    connected++;


                    if (
                        !this._engineConnectionLogged[name]
                    ) {

                        console.log(
                            "🔗 Learning Engine Connected:",
                            name
                        );


                        this._engineConnectionLogged[name] =
                            true;

                    }

                }
            );


            /*
            ------------------------------------------------
            Save important engine references
            ------------------------------------------------
            */

            if (
                this.engines.AnalyticsEngine
            ) {

                this.analyticsEngine =
                    this.engines.AnalyticsEngine;

            }


            if (
                this.engines.BackupRecoveryEngine
            ) {

                this.backupEngine =
                    this.engines.BackupRecoveryEngine;

            }


            if (
                this.engines.HealthMonitor
            ) {

                this.healthMonitor =
                    this.engines.HealthMonitor;

            }


            return Object.keys(
                this.engines
            ).length;

        },


        /* ==================================================
           SAFE ENGINE RUNNER
        ================================================== */

        runEngine(
            engineName,
            payload = {}
        ) {

            const engine =
                this.engines[
                    engineName
                ];


            if (!engine) {

                return null;

            }


            try {

                if (
                    typeof engine.run ===
                    "function"
                ) {

                    return engine.run(
                        payload
                    );

                }


                if (
                    typeof engine.execute ===
                    "function"
                ) {

                    return engine.execute(
                        payload
                    );

                }


                if (
                    typeof engine.process ===
                    "function"
                ) {

                    return engine.process(
                        payload
                    );

                }


                return null;

            }
            catch (error) {

                this.stats.errors++;


                console.error(
                    `❌ ${engineName} Error:`,
                    error
                );


                return null;

            }

        },


        /* ==================================================
           REINFORCEMENT
        ================================================== */

        reinforce(data = {}) {

            if (
                !this.engines.ReinforcementEngine
            ) {

                return null;

            }


            this.stats.improvements++;


            return this.runEngine(
                "ReinforcementEngine",
                {

                    action: "reward",

                    data

                }
            );

        },


        /* ==================================================
           PREDICTION
        ================================================== */

        predict(data = {}) {

            if (
                !this.engines.PredictionEngine
            ) {

                return null;

            }


            this.stats.predictions++;


            return this.runEngine(
                "PredictionEngine",
                {

                    action: "predict",

                    data

                }
            );

        },


        /* ==================================================
           EXPERIENCE REPLAY
        ================================================== */

        replay() {

            if (
                !this.engines.ExperienceReplayEngine
            ) {

                return false;

            }


            return this.runEngine(
                "ExperienceReplayEngine",
                {

                    action: "replay",

                    data:
                        this.experiences

                }
            );

        },


        /* ==================================================
           ADAPTIVE INTELLIGENCE
        ================================================== */

        adapt(data = {}) {

            if (
                !this.engines.AdaptiveIntelligence
            ) {

                return false;

            }


            return this.runEngine(
                "AdaptiveIntelligence",
                {

                    action: "adapt",

                    data

                }
            );

        },


        /* ==================================================
           SELF OPTIMIZATION
        ================================================== */

        optimize() {

            if (
                !this.engines.SelfOptimisationEngine
            ) {

                return false;

            }


            return this.runEngine(
                "SelfOptimisationEngine",
                {

                    action: "optimize",

                    data: {

                        memory:
                            this.experiences.length,

                        stats:
                            this.stats

                    }

                }
            );

        },


        /* ==================================================
           AUTO IMPROVEMENT
        ================================================== */

        improve() {

            const result = {

                prediction:
                    this.predict({

                        recent:
                            this.experiences
                                .slice(-20)

                    }),


                replay:
                    this.replay(),


                adaptive:
                    this.adapt({

                        memory:
                            this.experiences.length

                    }),


                optimization:
                    this.optimize()

            };


            this.stats.improvements++;


            this.save();


            return result;

        },


        /* ==================================================
           BACKGROUND LEARNING
        ================================================== */

        startBackgroundLearning() {

            if (
                this.backgroundLearningStarted
            ) {

                return true;

            }


            if (
                !this.engines
                    .BackgroundLearningEngine
            ) {

                return false;

            }


            const result =
                this.runEngine(
                    "BackgroundLearningEngine",
                    {

                        action: "start",

                        data: {

                            source:
                                this.name

                        }

                    }
                );


            this.backgroundLearningStarted =
                true;


            console.log(
                "♻ Background Learning Started"
            );


            return result ?? true;

        },


        /* ==================================================
           LEARNING CYCLE
        ================================================== */

        learningCycle(data = {}) {

            const experience =
                this.storeExperience(
                    data
                );


            const prediction =
                this.predict(
                    data
                );


            const improvement =
                this.improve();


            return {

                experience,

                prediction,

                improvement

            };

        },


        /* ==================================================
           AGENT BUS CONNECTION
        ================================================== */

        connectBus() {

            if (
                this.busConnected
            ) {

                return true;

            }


            const bus =
                root.AgentBus;


            if (!bus) {

                console.warn(
                    "⚠ AgentBus Missing"
                );

                return false;

            }


            if (
                typeof bus.subscribe !==
                "function"
            ) {

                console.warn(
                    "⚠ AgentBus.subscribe Missing"
                );

                return false;

            }


            const subscribe =
                (
                    event,
                    handler
                ) => {

                    const key =
                        `${this.name}:${event}`;


                    if (
                        this._subscriptions[key]
                    ) {

                        return;

                    }


                    bus.subscribe(
                        event,
                        this.name,
                        handler
                    );


                    this._subscriptions[key] =
                        true;


                    console.log(
                        "📡 Listening:",
                        this.name,
                        event
                    );

                };


            subscribe(
                "learning",
                data => {

                    this.receiveLearningEvent(
                        data
                    );

                }
            );


            subscribe(
                "task.completed",
                data => {

                    this.learnFromTask(
                        data
                    );

                }
            );


            subscribe(
                "task.failed",
                data => {

                    this.learnFromFailure(
                        data
                    );

                }
            );


            subscribe(
                "knowledge.update",
                data => {

                    this.addKnowledge(
                        data
                    );

                }
            );


            this.busConnected = true;


            console.log(
                "📡 SelfLearningAgent Connected To AgentBus"
            );


            return true;

        },


        /* ==================================================
           RECEIVE LEARNING EVENT
        ================================================== */

        receiveLearningEvent(data = {}) {

            const payload =
                data?.data ||
                data ||
                {};


            return this.learn({

                input:
                    payload.input || "",

                output:
                    payload.output || "",

                category:
                    "bus_event",

                metadata: {

                    source:
                        data?.source ||
                        "unknown"

                }

            });

        },


        /* ==================================================
           TASK SUCCESS
        ================================================== */

        learnFromTask(data = {}) {

            const experience = {

                task:
                    data.task || "",

                result:
                    data.result || "",

                success: true,

                time:
                    Date.now()

            };


            this.storeExperience(
                experience
            );


            this.reinforce({

                reward: 1,

                experience

            });


            this.broadcastLearning({

                type:
                    "task_success",

                experience

            });


            return true;

        },


        /* ==================================================
           TASK FAILURE
        ================================================== */

        learnFromFailure(data = {}) {

            const experience = {

                task:
                    data.task || "",

                error:
                    data.error || "",

                success: false,

                time:
                    Date.now()

            };


            this.storeExperience(
                experience
            );


            this.reinforce({

                reward: -1,

                experience

            });


            this.stats.errors++;


            this.broadcastLearning({

                type:
                    "task_failure",

                experience

            });


            return true;

        },


        /* ==================================================
           BROADCAST
        ================================================== */

        broadcastLearning(data = {}) {

            const bus =
                root.AgentBus;


            if (
                !bus ||
                typeof bus.emit !==
                "function"
            ) {

                return false;

            }


            try {

                bus.emit(
                    "learning",
                    {

                        source:
                            this.name,

                        data

                    }
                );


                return true;

            }
            catch (error) {

                console.error(
                    "❌ Learning Broadcast Error:",
                    error
                );


                return false;

            }

        },


        /* ==================================================
           FEEDBACK PIPELINE
        ================================================== */

        processFeedback(data = {}) {

            const feedback =
                this.addFeedback(
                    data
                );


            if (
                data &&
                data.reward !==
                undefined
            ) {

                this.reinforce({

                    reward:
                        data.reward,

                    feedback

                });

            }


            return feedback;

        },


        /* ==================================================
           RECEIVE FEEDBACK
        ================================================== */

        receiveFeedback(data = {}) {

            return this.processFeedback(
                data
            );

        },


        /* ==================================================
           AUTO LEARNING
        ================================================== */

        autoLearn(data = {}) {

            const result = {

                experience:
                    this.storeExperience(
                        data
                    ),


                feedback:
                    this.processFeedback({

                        source: "auto",

                        data

                    }),


                prediction:
                    this.predict(
                        data
                    ),


                improvement:
                    this.improve()

            };


            this.broadcastLearning({

                type:
                    "auto_learning_complete",

                result

            });


            return result;

        },


        /* ==================================================
           ANALYTICS CONNECTION
        ================================================== */

        connectAnalytics() {

            const engine =
                this.engines.AnalyticsEngine;


            if (!engine) {

                return false;

            }


            this.analyticsEngine =
                engine;


            return true;

        },


        /* ==================================================
           ANALYTICS
        ================================================== */

        getAnalytics() {

            return {

                memory: {

                    experiences:
                        this.experiences.length,

                    feedback:
                        this.feedback.length,

                    knowledge:
                        this.knowledge.length

                },

                learning: {

                    learned:
                        this.stats.learned,

                    predictions:
                        this.stats.predictions,

                    improvements:
                        this.stats.improvements,

                    errors:
                        this.stats.errors

                },

                engines:
                    Object.keys(
                        this.engines || {}
                    ).length,

                timestamp:
                    Date.now()

            };

        },


        /* ==================================================
           SEND ANALYTICS
        ================================================== */

        sendAnalytics() {

            if (
                !this.analyticsEngine
            ) {

                return false;

            }


            return this.runEngine(
                "AnalyticsEngine",
                {

                    action: "collect",

                    data:
                        this.getAnalytics()

                }
            );

        },


        /* ==================================================
           CREATE BACKUP
        ================================================== */

        createBackup() {

            try {

                const backup = {

                    version:
                        this.version,

                    experiences:
                        this.experiences,

                    knowledge:
                        this.knowledge,

                    feedback:
                        this.feedback,

                    stats:
                        this.stats,

                    created:
                        Date.now()

                };


                if (
                    typeof localStorage ===
                    "undefined"
                ) {

                    return false;

                }


                localStorage.setItem(

                    this.backupKey,

                    JSON.stringify(
                        backup
                    )

                );


                console.log(
                    "💾 Self Learning Backup Created"
                );


                return true;

            }
            catch (error) {

                console.error(
                    "❌ Backup Error:",
                    error
                );


                return false;

            }

        },


        /* ==================================================
           RESTORE BACKUP
        ================================================== */

        restoreBackup() {

            try {

                if (
                    typeof localStorage ===
                    "undefined"
                ) {

                    return false;

                }


                const data =
                    localStorage.getItem(
                        this.backupKey
                    );


                if (!data) {

                    return false;

                }


                const backup =
                    JSON.parse(
                        data
                    );


                this.experiences =
                    Array.isArray(
                        backup.experiences
                    )
                        ? backup.experiences
                        : [];


                this.knowledge =
                    Array.isArray(
                        backup.knowledge
                    )
                        ? backup.knowledge
                        : [];


                this.feedback =
                    Array.isArray(
                        backup.feedback
                    )
                        ? backup.feedback
                        : [];


                if (
                    backup.stats &&
                    typeof backup.stats ===
                    "object"
                ) {

                    this.stats = {

                        ...this.stats,

                        ...backup.stats

                    };

                }


                this.optimizeMemory();


                console.log(
                    "♻ Learning Backup Restored"
                );


                return true;

            }
            catch (error) {

                console.error(
                    "❌ Restore Backup Error:",
                    error
                );


                return false;

            }

        },


        /* ==================================================
           BACKUP ENGINE CONNECTION
        ================================================== */

        connectBackupEngine() {

            const engine =
                this.engines
                    .BackupRecoveryEngine;


            if (!engine) {

                return false;

            }


            this.backupEngine =
                engine;


            return true;

        },


        /* ==================================================
           AUTO BACKUP
        ================================================== */

        autoBackup() {

            this.createBackup();


            if (
                this.backupEngine
            ) {

                this.runEngine(
                    "BackupRecoveryEngine",
                    {

                        action: "backup",

                        data:
                            this.getAnalytics()

                    }
                );

            }


            return true;

        },


        /* ==================================================
           HEALTH MONITOR
        ================================================== */

        connectHealthMonitor() {

            const engine =
                this.engines.HealthMonitor;


            if (!engine) {

                return false;

            }


            this.healthMonitor =
                engine;


            return true;

        },


        /* ==================================================
           HEALTH
        ================================================== */

        health() {

            return {

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

                busConnected:
                    this.busConnected,

                memory: {

                    experiences:
                        this.experiences.length,

                    feedback:
                        this.feedback.length,

                    knowledge:
                        this.knowledge.length

                },

                engines:
                    Object.keys(
                        this.engines || {}
                    ).length,

                analytics:
                    this.getAnalytics()

            };

        },


        /* ==================================================
           REPORT STATUS
        ================================================== */

        reportStatus() {

            const status =
                this.health();


            if (
                this.healthMonitor
            ) {

                this.runEngine(
                    "HealthMonitor",
                    {

                        action: "report",

                        data:
                            status

                    }
                );

            }


            return status;

        },


        /* ==================================================
           CLEANUP
        ================================================== */

        cleanup() {

            this.optimizeMemory();

            return true;

        },


        /* ==================================================
           MEMORY AGENT
        ================================================== */

        connectMemory() {

            if (
                !root.MemoryManagerAgent
            ) {

                return false;

            }


            this.memoryAgent =
                root.MemoryManagerAgent;


            console.log(
                "🧠 Memory Manager Connected"
            );


            return true;

        },


        /* ==================================================
           SAVE TO MEMORY AGENT
        ================================================== */

        saveMemory(data = {}) {

            if (
                !this.memoryAgent
            ) {

                return false;

            }


            try {

                if (
                    typeof this.memoryAgent.run !==
                    "function"
                ) {

                    return false;

                }


                return this.memoryAgent.run({

                    action: "remember",

                    data: {

                        type:
                            "learning",

                        content:
                            JSON.stringify(
                                data
                            ),

                        source:
                            this.name

                    }

                });

            }
            catch (error) {

                console.error(
                    "❌ Memory Agent Error:",
                    error
                );


                return false;

            }

        },


        /* ==================================================
           KNOWLEDGE AGENT
        ================================================== */

        connectKnowledge() {

            if (
                !root.KnowledgeAgent
            ) {

                return false;

            }


            this.knowledgeAgent =
                root.KnowledgeAgent;


            console.log(
                "📚 Knowledge Agent Connected"
            );


            return true;

        },


        /* ==================================================
           STORE KNOWLEDGE
        ================================================== */

        storeKnowledge(data = {}) {

            if (
                !this.knowledgeAgent
            ) {

                return false;

            }


            try {

                if (
                    typeof this.knowledgeAgent.run !==
                    "function"
                ) {

                    return false;

                }


                return this.knowledgeAgent.run({

                    action: "add",

                    data: {

                        title:
                            "Learning Knowledge",

                        content:
                            JSON.stringify(
                                data
                            ),

                        category:
                            "self_learning",

                        source:
                            this.name

                    }

                });

            }
            catch (error) {

                console.error(
                    "❌ Knowledge Agent Error:",
                    error
                );


                return false;

            }

        },


        /* ==================================================
           REGISTER AGENT
        ================================================== */

        register() {

            if (
                this.registered
            ) {

                return true;

            }


            const registry =
                root.AgentRegistry;


            if (!registry) {

                console.warn(
                    "⚠ AgentRegistry Missing"
                );

                return false;

            }


            if (
                typeof registry.register !==
                "function"
            ) {

                console.warn(
                    "⚠ AgentRegistry.register Missing"
                );

                return false;

            }


            try {

                registry.register(

                    this.name,

                    this,

                    {

                        type:
                            "learning",

                        group:
                            "intelligence",

                        priority:
                            15,

                        tags: [

                            "learning",

                            "memory",

                            "prediction",

                            "optimization"

                        ]

                    }

                );


                this.registered = true;


                console.log(
                    "🤖 SelfLearningAgent Registered"
                );


                return true;

            }
            catch (error) {

                console.error(
                    "❌ Agent Registration Error:",
                    error
                );


                return false;

            }

        },


        /* ==================================================
           STATUS
        ================================================== */

        getStatus() {

            return {

                version:
                    this.version,

                name:
                    this.name,

                status:
                    this.status,

                initialized:
                    this.initialized,

                booted:
                    this.booted,

                memory: {

                    experiences:
                        this.experiences.length,

                    knowledge:
                        this.knowledge.length,

                    feedback:
                        this.feedback.length

                },

                engines:
                    Object.keys(
                        this.engines || {}
                    ).length,

                stats: {

                    ...this.stats

                }

            };

        },


        /* ==================================================
           SAVE
        ================================================== */

        save() {

            try {

                if (
                    typeof localStorage ===
                    "undefined"
                ) {

                    return false;

                }


                const data = {

                    version:
                        this.version,

                    experiences:
                        this.experiences,

                    knowledge:
                        this.knowledge,

                    feedback:
                        this.feedback,

                    patterns:
                        this.patterns,

                    stats:
                        this.stats

                };


                localStorage.setItem(

                    this.storageKey,

                    JSON.stringify(
                        data
                    )

                );


                return true;

            }
            catch (error) {

                console.error(
                    "❌ Learning Save Error:",
                    error
                );


                return false;

            }

        },


        /* ==================================================
           LOAD
        ================================================== */

        load() {

            try {

                if (
                    typeof localStorage ===
                    "undefined"
                ) {

                    return false;

                }


                const data =
                    localStorage.getItem(
                        this.storageKey
                    );


                if (!data) {

                    return false;

                }


                const parsed =
                    JSON.parse(
                        data
                    );


                this.experiences =
                    Array.isArray(
                        parsed.experiences
                    )
                        ? parsed.experiences
                        : [];


                this.knowledge =
                    Array.isArray(
                        parsed.knowledge
                    )
                        ? parsed.knowledge
                        : [];


                this.feedback =
                    Array.isArray(
                        parsed.feedback
                    )
                        ? parsed.feedback
                        : [];


                this.patterns =
                    Array.isArray(
                        parsed.patterns
                    )
                        ? parsed.patterns
                        : [];


                if (
                    parsed.stats &&
                    typeof parsed.stats ===
                    "object"
                ) {

                    this.stats = {

                        ...this.stats,

                        ...parsed.stats

                    };

                }


                this.optimizeMemory();


                return true;

            }
            catch (error) {

                console.error(
                    "❌ Learning Load Error:",
                    error
                );


                return false;

            }

        },


        /* ==================================================
           RESET
        ================================================== */

        reset() {

            this.experiences = [];

            this.knowledge = [];

            this.feedback = [];

            this.patterns = [];


            this.stats = {

                learned: 0,

                feedback: 0,

                predictions: 0,

                improvements: 0,

                errors: 0

            };


            this.save();


            return true;

        },


        /* ==================================================
           BOOT
        ================================================== */

        boot() {

            /*
            ------------------------------------------------
            IMPORTANT:
            Prevent duplicate boot.
            ------------------------------------------------
            */

            if (
                this.booted
            ) {

                return true;

            }


            this._lastBootTime =
                Date.now();


            this.init();


            this.register();


            /*
            ------------------------------------------------
            Connect whatever is already available.
            Missing modules are NOT fatal.
            ------------------------------------------------
            */

            this.connectLearningEngines();

            this.connectBus();

            this.connectMemory();

            this.connectKnowledge();

            this.connectAnalytics();

            this.connectBackupEngine();

            this.connectHealthMonitor();

            this.restoreBackup();

            this.startBackgroundLearning();


            this.booted = true;

            this.status = "online";


            console.log(
                "🧠 SelfLearningAgent V4 STABLE Online"
            );


            return true;

        },


        /* ==================================================
           REFRESH CONNECTIONS
           Called by runtimeBootstrap AFTER all modules load.
        ================================================== */

        refreshConnections() {

            this.connectLearningEngines();

            this.connectBus();

            this.connectMemory();

            this.connectKnowledge();

            this.connectAnalytics();

            this.connectBackupEngine();

            this.connectHealthMonitor();


            return {

                engines:
                    Object.keys(
                        this.engines || {}
                    ).length,

                bus:
                    this.busConnected,

                memory:
                    !!this.memoryAgent,

                knowledge:
                    !!this.knowledgeAgent

            };

        }

    };


    /* ======================================================
       EXPORT
    ====================================================== */

    root.SelfLearningAgent =
        SelfLearningAgent;


    /* ======================================================
       START
    ====================================================== */

    SelfLearningAgent.boot();


    /*
    ========================================================
    IMPORTANT CHANGE

    OLD CODE:
        setTimeout(() => {
            SelfLearningAgent.connectLearningEngines();
        }, 1500);

    REMOVED.

    runtimeBootstrap / learningLoader should call:

        SelfLearningAgent.refreshConnections();

    after all learning modules are loaded.

    This prevents the repeated:

        🔗 Learning Engine Connected
        🧠 Learning Engines Reconnected

    spam.
    ========================================================
    */


    console.log(
        "✅ SelfLearningAgent V4 STABLE Loaded"
    );


})();