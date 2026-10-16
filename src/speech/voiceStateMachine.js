"use strict";

const STATES = Object.freeze([
    "idle", "wake_detected", "listening", "processing", "responding", "speaking", "error", "recovery"
]);

const ALLOWED = {
    idle: ["wake_detected", "listening", "error"],
    wake_detected: ["listening", "processing", "error"],
    listening: ["processing", "idle", "error"],
    processing: ["responding", "speaking", "idle", "error"],
    responding: ["speaking", "idle", "error"],
    speaking: ["listening", "idle", "error"],
    error: ["recovery", "idle"],
    recovery: ["idle", "listening", "error"]
};

class VoiceStateMachine {
    constructor(onChange = null) {
        this.state = "idle";
        this.onChange = typeof onChange === "function" ? onChange : null;
    }
    transition(next, meta = {}) {
        if (!STATES.includes(next)) throw new Error(`Unknown voice state: ${next}`);
        if (next !== this.state && !ALLOWED[this.state].includes(next)) {
            throw new Error(`Invalid voice transition: ${this.state} -> ${next}`);
        }
        const previous = this.state;
        this.state = next;
        if (this.onChange) this.onChange({ previous, state: next, meta });
        return this.state;
    }
    reset() {
        this.state = "idle";
        return this.state;
    }
}

module.exports = { STATES, VoiceStateMachine };
