// ==========================================
// JARVIS PRO MAX V30
// Consciousness Controller V3 PRO
// IIFE Architecture
// renderer/js/brain/consciousness/consciousnessController.js
// ==========================================

"use strict";

(function () {

const ConsciousnessController = {

    version: "3.0.0 PRO",

    initialized: false,

    connected: false,

    modules: {

        identity: null,

        selfModel: null,

        awareness: null,

        emotionEngine: null,

        metacognition: null,

        motivationEngine: null,

        valueSystem: null,

        thinkingEngine: null,

        internalMonologue: null

    },

// ==========================================
// INITIALIZE
// ==========================================

init() {

    if (this.initialized) {

        return true;

    }

    this.connectModules();

    this.startModules();

    this.connectEvents();

    this.initialized = true;

    console.log("🧠 Consciousness Controller Online");

    return true;

},

// ==========================================
// CONNECT MODULES
// ==========================================

connectModules() {

    this.modules.identity =
        window.Identity || null;

    this.modules.selfModel =
        window.SelfModel || null;

    this.modules.awareness =
        window.Awareness || null;

    this.modules.emotionEngine =
        window.EmotionEngine || null;

    this.modules.metacognition =
        window.Metacognition || null;

    this.modules.motivationEngine =
        window.MotivationEngine || null;

    this.modules.valueSystem =
        window.ValueSystem || null;

    this.modules.thinkingEngine =
        window.ThinkingEngine || null;

    this.modules.internalMonologue =
        window.InternalMonologue || null;

},

// ==========================================
// START MODULES
// ==========================================

startModules() {

    Object.values(this.modules).forEach(module => {

        if (
            module &&
            typeof module.init === "function"
        ) {

            try {

                module.init();

            }
            catch (error) {

                console.error(error);

            }

        }

    });

},

// ==========================================
// CONNECT EVENTS
// ==========================================

connectEvents() {

    if (this.connected) {

        return;

    }

    const emotion =
        this.modules.emotionEngine;

    const motivation =
        this.modules.motivationEngine;

    const awareness =
        this.modules.awareness;

    const meta =
        this.modules.metacognition;

    const values =
        this.modules.valueSystem;

    if (
        emotion &&
        motivation &&
        typeof emotion.on === "function"
    ) {

        emotion.on(

            "emotion.updated",

            data => {

                if (
                    typeof motivation._onEmotionUpdate === "function"
                ) {

                    motivation._onEmotionUpdate(data);

                }

            }

        );

    }

    if (
        awareness &&
        motivation &&
        typeof awareness.on === "function"
    ) {

        awareness.on(

            "percept",

            data => {

                if (
                    typeof motivation._onPercept === "function"
                ) {

                    motivation._onPercept(data);

                }

            }

        );

    }

    if (
        meta &&
        motivation &&
        typeof meta.on === "function"
    ) {

        meta.on(

            "reflection",

            data => {

                if (
                    typeof motivation._onReflection === "function"
                ) {

                    motivation._onReflection(data);

                }

            }

        );

    }

    if (
        motivation &&
        values &&
        typeof motivation.on === "function"
    ) {

        motivation.on(

            "need.high",

            decision => {

                if (
                    decision &&
                    decision.suggestion &&
                    typeof values.evaluateValue === "function"
                ) {

                    values.evaluateValue(
                        decision.suggestion
                    );

                }

            }

        );

    }

    this.connected = true;

    console.log("🔗 Consciousness Controller Connected");

},

// ==========================================
// STATUS
// ==========================================

getStatus() {

    return {

        initialized: this.initialized,

        connected: this.connected,

        modules: {

            identity:
                !!this.modules.identity,

            selfModel:
                !!this.modules.selfModel,

            awareness:
                !!this.modules.awareness,

            emotionEngine:
                !!this.modules.emotionEngine,

            metacognition:
                !!this.modules.metacognition,

            motivationEngine:
                !!this.modules.motivationEngine,

            valueSystem:
                !!this.modules.valueSystem,

            thinkingEngine:
                !!this.modules.thinkingEngine,

            internalMonologue:
                !!this.modules.internalMonologue

        }

    };

},

// ==========================================
// RESET
// ==========================================

reset() {

    this.connected = false;

    this.initialized = false;

    console.log("♻️ Consciousness Controller Reset");

}

};

// ==========================================
// EXPORT
// ==========================================

window.ConsciousnessController =
    ConsciousnessController;

// ==========================================
// AUTO START
// ==========================================

ConsciousnessController.init();

console.log(
    "✅ Consciousness Controller V3 PRO Loaded"
);

})();