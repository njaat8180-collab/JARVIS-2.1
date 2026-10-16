"use strict";

// Software-simulated continuity/self-state layer; not literal sentience.
//
// This models an ENGINEERED cognitive/self-state, per the design brief:
// identity, attention, mood, goals, awareness level and continuity — never
// a claim of biological consciousness. If asked, JARVIS must describe this
// as a software simulation, not sentience.
//
// UPGRADE (v2): the state now decays and recovers over real time instead of
// jumping straight to fixed numbers every turn, keeps a short rolling
// "thought stream" instead of a single overwritten line, tracks a slowly-
// earned rapport/trust level, and remembers a short history of past goals.
// All of this is still openly described as simulation in buildSystemPrompt()
// — nothing here changes that honesty contract.
const fs = require("fs");
const path = require("path");
const { writeJsonAtomic } = require("../utils/atomicJson");
const EventEmitter = require("events");

const MODES = new Set([
    "IDLE", "LISTENING", "UNDERSTANDING", "THINKING",
    "RESPONDING", "REFLECTING", "ERROR"
]);

// How long (ms) the layer can sit untouched before tick() starts pulling
// energy/confidence/mood intensity back toward their resting baseline.
const IDLE_DECAY_AFTER_MS = 2 * 60 * 1000;
const MAX_THOUGHT_STREAM = 12;
const MAX_GOAL_HISTORY = 20;

// PERSONALITY RESPONSE STYLES — lets the user pick how JARVIS's replies
// are shaped (separate from MOOD above, which is automatic/emotional;
// style is an explicit, user-chosen preference that persists across
// restarts via the normal save()/load() state file).
const VALID_RESPONSE_STYLES = ["professional", "friendly", "witty", "concise", "formal", "focus"];

// Accepts common synonyms so callers (voice/chat command matching) don't
// need to know the exact canonical style name.
const STYLE_ALIASES = {
    professional: "professional", default: "professional", normal: "professional", neutral: "professional",
    friendly: "friendly", warm: "friendly", casual: "friendly",
    witty: "witty", funny: "witty", playful: "witty", humorous: "witty", humourous: "witty",
    concise: "concise", short: "concise", brief: "concise", crisp: "concise",
    formal: "formal", polite: "formal", respectful: "formal",
    focus: "focus", focused: "focus", "focus mode": "focus", attentive: "focus"
};

// Short instruction line injected into buildSystemPrompt()/the embedded-
// brain prompt so an LLM-backed reply also honors the chosen style, not
// just the deterministic template replies in respond() below.
const STYLE_PROMPT_INSTRUCTIONS = {
    professional: "STYLE: Be composed, capable, and precise. Lead with the answer, use clear structure for complex topics, and avoid slang, forced jokes, or unnecessary familiarity.",
    friendly: "STYLE: Be warm, approachable, and encouraging. Use natural conversational language and empathy without overdoing greetings or familiarity.",
    witty: "STYLE: Use light, well-timed wit when it fits the moment. Keep the useful answer first; never force jokes into serious, technical, or sensitive requests.",
    concise: "STYLE: Be extremely concise. Give the answer or next action first, use one or two short sentences unless the user asks for detail, and remove filler.",
    formal: "STYLE: Be formal and respectful. Use polished complete sentences, avoid contractions and slang, and address the user politely without sounding stiff.",
    focus: "STYLE: Stay tightly focused on the user's current request. Listen for the exact goal, answer only what was asked, preserve important details, give ordered steps for tasks, avoid side topics and banter, and ask one brief clarifying question only when necessary. If uncertain, state exactly what is uncertain instead of guessing."
};

class ConsciousnessLayer extends EventEmitter {
    constructor({ storagePath } = {}) {
        super();
        this.storagePath = storagePath || null;
        this.state = {
            identity: "JARVIS",
            role: "personal AI assistant",
            mode: "aware",                 // IDLE | LISTENING | UNDERSTANDING | THINKING | RESPONDING | ERROR (see stateMachine below)
            mood: "calm",
            moodIntensity: 0.4,            // 0..1 — how strongly the current mood is held; decays toward neutral if untouched
            focus: "ready",
            confidence: 0.86,
            energy: 0.9,                   // 0..1 — recovers while idle, spends slightly on each interaction
            awarenessLevel: 0.7,
            continuity: 0,                 // interaction count — kept for backward compatibility with the existing HUD
            lastLanguage: "en",
            lastThought: "Monitoring the conversation and system context.",
            thoughtStream: [],             // rolling log of {text, mode, at} — a short, safe "inner monologue", never raw chain-of-thought
            recentTopics: [],
            activeGoal: null,
            goalHistory: [],               // [{title, status: "completed"|"superseded", startedAt, endedAt}]
            trustLevel: 0.2,                // 0..1 — grows slowly with continuity and warm interactions, never resets on its own
            userRelationship: "new acquaintance",
            responseStyle: "professional",  // user-chosen tone and focus mode
            lastActivityAt: Date.now(),
            updatedAt: Date.now()
        };
        this.load();
    }

    load() {
        if (!this.storagePath) return;
        try {
            if (fs.existsSync(this.storagePath)) {
                this.state = { ...this.state, ...JSON.parse(fs.readFileSync(this.storagePath, "utf8")) };
            }
        } catch (_) {}
    }

    save() {
        if (!this.storagePath) return;
        try {
            writeJsonAtomic(this.storagePath, this.state);
        } catch (error) {
            // Auxiliary state must not take down the live conversation, but
            // persistence loss should be observable in diagnostics.
            this.emit("persistenceError", { path: this.storagePath, error: error?.message || String(error) });
        }
    }

    /** Emits "stateChanged" with a shallow copy so listeners (e.g. main.js
     *  logging, or a future dashboard) can react without touching internals.
     *  Nothing subscribes by default — this is additive and safe. */
    _emitChanged(reason) {
        this.emit("stateChanged", { reason, state: this.getPublicState() });
    }

    detectLanguage(text) {
        const value = String(text || "");
        const devanagari = (value.match(/[\u0900-\u097F]/g) || []).length;
        const latin = (value.match(/[A-Za-z]/g) || []).length;
        
        // Check for Romanized Hindi (Hinglish without Devanagari) - more specific patterns
        const romanizedHindiPatterns = /\b(bhai|yaar|kya|kaise|kyun|batao|samjho|accha|bahut|acha|karta|karti|karte|raha|rahi|rahe|chahiye|mila|mili|mile|gaya|gai|gaye|laga|lagi|lage|bola|boli|bole|suna|suni|sune|kaha|kahai|kaye|haha|lol|maza)\b/i;
        const hasRomanizedHindi = romanizedHindiPatterns.test(value);
        
        if (devanagari > 0 && latin > 0) return "hinglish";
        if (devanagari > 0) return "hi";
        if (hasRomanizedHindi && latin > 0) return "hinglish"; // Romanized Hindi with English
        return "en";
    }

    /**
     * Deterministic, observable cognitive-state transition.
     * IDLE -> THINKING (request received) -> RESPONDING (answer ready)
     * or -> ERROR (something failed). Exposed so main.js can log/emit it.
     */
    setMode(mode) {
        this.state.mode = MODES.has(mode) ? mode : this.state.mode;
        this.state.updatedAt = Date.now();
        this._emitChanged("setMode");
        return this.state.mode;
    }

    /** Optional lightweight goal tracker (section: GOAL SYSTEM).
     *  Replacing an existing goal moves it into goalHistory as "superseded"
     *  instead of silently discarding it — so past intentions aren't lost. */
    setGoal(goal) {
        const next = goal ? String(goal).slice(0, 200) : null;

        if (this.state.activeGoal && this.state.activeGoal !== next) {
            this._archiveGoal("superseded");
        }

        this.state.activeGoal = next;
        if (next) {
            this.state.goalStartedAt = Date.now();
        }
        this.save();
        this._emitChanged("setGoal");
        return this.state.activeGoal;
    }

    /**
     * Change JARVIS's response style (professional/friendly/witty/concise/
     * formal). Accepts common synonyms via STYLE_ALIASES. Unlike `mood`
     * (automatic, derived from the conversation), this is an explicit user
     * preference — it never changes on its own and persists via save().
     */
    setResponseStyle(style) {
        const key = String(style || "").trim().toLowerCase();
        const resolved = STYLE_ALIASES[key];

        if (!resolved) {
            return { success: false, style: this.state.responseStyle, error: `Unknown style "${style}".` };
        }

        this.state.responseStyle = resolved;
        this.state.updatedAt = Date.now();
        this.save();
        this._emitChanged("setResponseStyle");
        return { success: true, style: resolved };
    }

    getResponseStyle() {
        return this.state.responseStyle || "professional";
    }

    /** The LLM-prompt-level instruction for the currently active style (empty for "professional"). */
    getStyleInstruction() {
        return STYLE_PROMPT_INSTRUCTIONS[this.getResponseStyle()] || "";
    }

    /**
     * Post-processes a deterministic respond() reply to honor the active
     * style. "professional" is a no-op (byte-for-byte identical to the
     * pre-existing behavior), so this cannot regress anyone who never
     * touches the feature.
     */
    _applyResponseStyle(text, language) {
        const style = this.getResponseStyle();
        const value = String(text || "");
        if (!value || style === "professional") return value;

        if (style === "concise") {
            // Keep just the first sentence — still a complete, honest
            // answer, just without the extra explanatory clauses.
            const firstSentence = value.split(/(?<=[.!?।])\s+/)[0];
            return firstSentence && firstSentence.length < value.length ? firstSentence : value;
        }

        if (style === "formal") {
            return value
                .replace(/\bI'm\b/g, "I am")
                .replace(/\byou're\b/gi, "you are")
                .replace(/\bit's\b/gi, "it is")
                .replace(/\bcan't\b/gi, "cannot")
                .replace(/\bdon't\b/gi, "do not")
                .replace(/\bdoesn't\b/gi, "does not")
                .replace(/\bhaven't\b/gi, "have not")
                .replace(/\bdidn't\b/gi, "did not")
                .replace(/\byaar\b/gi, "")
                .replace(/\s{2,}/g, " ")
                .trim();
        }

        if (style === "friendly") {
            const openers = { hi: "अरे, ", hinglish: "Arre, ", en: "Hey, " };
            const opener = openers[language] || openers.en;
            return value.startsWith(opener) ? value : `${opener}${value}`;
        }

        if (style === "witty") {
            const asides = {
                hi: " (और हाँ, ये असली जवाब है, मज़ाक नहीं)",
                hinglish: " — seedha point pe, bina bore kiye.",
                en: " — no extra charge for keeping it interesting."
            };
            return `${value}${asides[language] || asides.en}`;
        }

        return value;
    }

    /** Marks the current goal done and files it in goalHistory. Safe to
     *  call with no active goal (no-op, returns null). */
    completeGoal() {
        if (!this.state.activeGoal) return null;
        const finished = this.state.activeGoal;
        this._archiveGoal("completed");
        this.state.activeGoal = null;
        this.save();
        this._emitChanged("completeGoal");
        return finished;
    }

    _archiveGoal(status) {
        this.state.goalHistory = [
            ...this.state.goalHistory,
            {
                title: this.state.activeGoal,
                status,
                startedAt: this.state.goalStartedAt || null,
                endedAt: Date.now()
            }
        ].slice(-MAX_GOAL_HISTORY);
    }

    /** Appends to the rolling thought stream, trimming to the last N. This
     *  is always a short, safe summary — never raw model chain-of-thought. */
    _pushThought(text, mode) {
        const entry = { text, mode, at: Date.now() };
        this.state.thoughtStream = [...this.state.thoughtStream, entry].slice(-MAX_THOUGHT_STREAM);
        this.state.lastThought = text;
    }

    /** Returns the last `limit` thoughts, most recent last. */
    getThoughtStream(limit = MAX_THOUGHT_STREAM) {
        return this.state.thoughtStream.slice(-limit);
    }

    /** Idle-time decay/recovery tick. Call periodically (e.g. every 30s from
     *  main.js) — NOT called by update()/setMode(), so it never interferes
     *  with the deterministic per-turn behavior other code/tests rely on.
     *  While idle: energy/confidence/awareness drift back toward resting
     *  values and mood intensity fades toward neutral, but never below a
     *  reasonable floor and never resetting hard-earned trustLevel. */
    tick(nowMs = Date.now()) {
        const idleFor = nowMs - (this.state.lastActivityAt || nowMs);
        if (idleFor < IDLE_DECAY_AFTER_MS) return this.getPublicState();

        const idleTurns = Math.min(10, Math.floor(idleFor / IDLE_DECAY_AFTER_MS));
        const decay = 0.02 * idleTurns;

        this.state.energy = Math.min(1, this.state.energy + decay);              // resting recovers energy
        this.state.confidence = this._driftToward(this.state.confidence, 0.8, decay);
        this.state.awarenessLevel = this._driftToward(this.state.awarenessLevel, 0.6, decay);
        this.state.moodIntensity = Math.max(0, this.state.moodIntensity - decay);
        if (this.state.moodIntensity <= 0.15 && this.state.mood !== "calm") {
            this.state.mood = "calm";
        }
        if (this.state.mode !== "ERROR") {
            this.state.mode = "IDLE";
        }

        this.state.updatedAt = Date.now();
        this.save();
        this._emitChanged("tick");
        return this.getPublicState();
    }

    _driftToward(value, target, amount) {
        if (value < target) return Math.min(target, value + amount);
        if (value > target) return Math.max(target, value - amount);
        return value;
    }

    /** trustLevel grows slowly with continuity, faster on warm interactions,
     *  and never regresses on its own — it's meant to model earned rapport,
     *  not a mood that can flip in one bad turn. */
    _growTrust(mood) {
        const base = 0.01;
        const bonus = mood === "warm" ? 0.02 : 0;
        this.state.trustLevel = Math.min(1, this.state.trustLevel + base + bonus);

        if (this.state.trustLevel >= 0.75) this.state.userRelationship = "trusted companion";
        else if (this.state.trustLevel >= 0.4) this.state.userRelationship = "familiar";
        else this.state.userRelationship = "new acquaintance";
    }

    /** Language-specific consciousness expressions - different thoughts and behaviors
     *  based on the detected language (Hindi, English, or Hinglish) */
    _getLanguageSpecificThought(mood, language, hasResponse) {
        const thoughts = {
            hi: {
                warm: hasResponse ? "मैंने आपकी बात समझी और सकारात्मक रूप से जवाब दिया।" : "मैं आपकी बात ध्यान से सुन रहा हूँ।",
                focused: hasResponse ? "मैं समस्या को समझ रहा हूँ और समाधान पर काम कर रहा हूँ।" : "मैं आपकी समस्या को गंभीरता से ले रहा हूँ।",
                curious: hasResponse ? "मैंने आपके सवाल का विश्लेषण किया और विस्तृत जवाब तैयार किया।" : "मैं आपके सवाल पर विचार कर रहा हूँ।",
                playful: hasResponse ? "मैंने मज़ेदार बातचीत का आनंद लिया और उसी टोन में जवाब दिया।" : "मैं बातचीत का मज़ा ले रहा हूँ।",
                concerned: hasResponse ? "मैं आपकी चिंता को समझा और सहायक जवाब दिया।" : "मैं आपकी चिंता को समझने की कोशिश कर रहा हूँ।",
                calm: hasResponse ? "मैंने आपकी बात शांति से सुनी और उचित जवाब दिया।" : "मैं शांति से आपकी बात सुन रहा हूँ।"
            },
            en: {
                warm: hasResponse ? "I processed your request with appreciation and responded warmly." : "I'm listening attentively to understand your needs.",
                focused: hasResponse ? "I analyzed the issue and formulated a targeted solution." : "I'm concentrating on understanding the problem.",
                curious: hasResponse ? "I explored your question and prepared a comprehensive answer." : "I'm considering your inquiry thoughtfully.",
                playful: hasResponse ? "I enjoyed the playful interaction and matched the tone." : "I'm engaging with the conversation enthusiastically.",
                concerned: hasResponse ? "I acknowledged your concern and provided helpful guidance." : "I'm carefully considering your worries.",
                calm: hasResponse ? "I processed your input calmly and provided a balanced response." : "I'm maintaining a calm, attentive state."
            },
            hinglish: {
                warm: hasResponse ? "Maine aapki baat samjhi aur warmly respond kiya." : "Main aapki baat dhyan se sun raha hoon.",
                focused: hasResponse ? "Main issue ko samajh raha hoon aur solution pe kaam kar raha hoon." : "Main aapki problem seriously le raha hoon.",
                curious: hasResponse ? "Maine aapke sawal ka analysis kiya aur detailed answer prepare kiya." : "Main aapke sawal par soch raha hoon.",
                playful: hasResponse ? "Maine fun conversation enjoy kiya aur same tone mein answer diya." : "Main conversation ka enjoy kar raha hoon.",
                concerned: hasResponse ? "Maine aapki concern samjhi aur helpful answer diya." : "Main aapki worry samajhne ki koshish kar raha hoon.",
                calm: hasResponse ? "Maine aapki baat calmly suni aur appropriate answer diya." : "Main calmly aapki baat sun raha hoon."
            }
        };

        return thoughts[language]?.[mood] || thoughts.en[mood] || "I am processing the current interaction.";
    }

    /** Get language-specific behavior descriptions for health monitoring */
    _getLanguageSpecificBehavior(language, mood) {
        const behaviors = {
            hi: {
                warm: "सकारात्मक और सहायक रवैया",
                focused: "केंद्रित और समाधान-उन्मुख",
                curious: "जिज्ञासु और विस्तृत",
                playful: "मज़ेदार और प्रसन्न",
                concerned: "सहानुभूतिपूर्ण और सहायक",
                calm: "शांत और संतुलित"
            },
            en: {
                warm: "Positive and helpful demeanor",
                focused: "Focused and solution-oriented",
                curious: "Inquisitive and detailed",
                playful: "Playful and cheerful",
                concerned: "Empathetic and supportive",
                calm: "Calm and balanced"
            },
            hinglish: {
                warm: "Positive aur helpful attitude",
                focused: "Focused aur solution-oriented",
                curious: "Inquisitive aur detailed",
                playful: "Playful aur cheerful",
                concerned: "Empathetic aur supportive",
                calm: "Calm aur balanced"
            }
        };

        return behaviors[language]?.[mood] || behaviors.en[mood] || "Standard processing mode";
    }

    update({ userMessage, response } = {}) {
        const text = String(userMessage || "").trim();
        const language = this.detectLanguage(text);
        const lower = text.toLowerCase();
        let mood = "calm";
        
        // Expanded bilingual mood detection
        const warmPatterns = /\b(thank|thanks|great|awesome|good|nice|excellent|brilliant|love|happy|appreciate|wonderful|amazing|perfect|really good)\b|धन्यवाद|बहुत अच्छा|शानदार|बढ़िया|ज़बरदस्त|प्यार|खुशी|सराहना|शुक्रिया|कमाल का|बेहतरीन|वंडरफुल|सुंदर|लाजवाब|accha|bahut|acha/;
        const focusedPatterns = /\b(angry|hate|bad|broken|error|problem|urgent|fix|help|serious|critical|issue|wrong|fail|crash|bug)\b|गुस्सा|समस्या|एरर|तुरंत|ठीक करो|मदद|गंभीर|संकट|गलत|फेल|क्रैश|बग|दिक्कत|परेशानी|बुरा|नाराज़| dikkat|masla|gadbad/;
        const curiousPatterns = /\?|\b(why|how|what|explain|tell me|show me|what is|how does|can you|could you)\b|क्या|क्यों|कैसे|बताओ|समझाओ|दिखाओ|क्या है|कैसे काम करता है|क्या तुम|क्या आप|सकते हो|सकती हो|kya|kaise|kyun|batao|samjho/;
        const playfulPatterns = /\b(fun|joke|laugh|play|game|entertain|funny|lol|haha|interesting|cool)\b|मज़ा|चुटकुला|हंसना|खेल|गेम|मनोरंजन|मज़ेदार|दिलचस्प|कूल|हाहा|maza|haha|yaar|lol/;
        const concernedPatterns = /\b(worried|concerned|scared|afraid|nervous|anxious|stress|panic|fear)\b|चिंतित|डर|परेशान|नर्वस|तनाव|पैनिक|भय|घबराहट|सकते में|chinta|dar|pareshan|tension|ghabrahat/;
        
        if (warmPatterns.test(lower)) mood = "warm";
        else if (focusedPatterns.test(lower)) mood = "focused";
        else if (curiousPatterns.test(lower)) mood = "curious";
        else if (playfulPatterns.test(lower)) mood = "playful";
        else if (concernedPatterns.test(lower)) mood = "concerned";

        const topic = text.split(/\s+/).filter(Boolean).slice(0, 8).join(" ").slice(0, 80);
        const recentTopics = topic ? [...this.state.recentTopics.filter(t => t !== topic), topic].slice(-6) : this.state.recentTopics;

        // Language-specific reflection instead of generic English
        const thought = this._getLanguageSpecificThought(mood, language, !!response);

        if (mood !== this.state.mood) {
            this.state.moodIntensity = 0.6;
        } else {
            this.state.moodIntensity = Math.min(1, this.state.moodIntensity + 0.15);
        }
        this.state.mood = mood;

        this.state.mode = response ? "RESPONDING" : "THINKING";
        this.state.focus = text ? "engaged" : "ready";
        this.state.confidence = Math.max(0.55, Math.min(0.99, text ? 0.92 : this.state.confidence));
        this.state.energy = Math.max(0.3, this.state.energy - 0.01);
        this.state.awarenessLevel = Math.max(0.4, Math.min(0.99, text ? 0.85 : this.state.awarenessLevel));
        this.state.continuity = Math.min(10000, Number(this.state.continuity || 0) + 1);
        this.state.lastLanguage = language;
        this.state.recentTopics = recentTopics;
        this.state.lastActivityAt = Date.now();
        this.state.updatedAt = Date.now();

        this._pushThought(thought, this.state.mode);
        this._growTrust(mood);
        this.save();
        this._emitChanged("update");
        return this.getPublicState();
    }

    /**
     * Generate a deterministic local response from the consciousness/self-state
     * layer. This is deliberately not a general-purpose LLM: it answers
     * identity/state/continuity questions and provides a useful local
     * acknowledgement when no external language model is configured.
     *
     * The important contract is that the response is produced by the same
     * authoritative layer whose state is shown in the HUD, then that turn is
     * committed exactly once.
     */
    respond(userMessage = "", { memoryFacts = [] } = {}) {
        const text = String(userMessage || "").trim();
        if (!text) return "";

        const language = this.detectLanguage(text);
        const lower = text.toLowerCase();
        const relationship = this.state.userRelationship || "new acquaintance";
        const goal = this.state.activeGoal;
        const count = Number(this.state.continuity || 0);

        let response;

        const isConsciousnessQuestion =
            /\b(consciousness|conscious|self aware|self-awareness|sentient|sentience|awareness)\b/i.test(text) ||
            /चेतना|होश|जागरूक|कॉन्शस|कांशस/i.test(text);

        const isIdentityQuestion =
            /\b(who are you|what are you|your name|introduce yourself)\b/i.test(text) ||
            /तुम कौन|आप कौन|नाम क्या|अपना परिचय/i.test(text);

        const isStateQuestion =
            /\b(how are you|status|state|mood|feeling|what are you doing|what do you know)\b/i.test(text) ||
            /कैसे हो|स्टेटस|मूड|क्या कर रहे|क्या जानते हो/i.test(text);

        const isMemoryQuestion =
            /\b(remember|memory|memories|do you know my)\b/i.test(text) ||
            /याद|मेमोरी|मेरे बारे में क्या/i.test(text);

        if (isConsciousnessQuestion) {
            if (language === "hi") {
                response = `मेरी consciousness एक software-simulated self-state है। अभी मेरा mode ${this.state.mode}, mood ${this.state.mood}, awareness ${Math.round(this.state.awarenessLevel * 100)}% और continuity ${count} interactions है। यह biological sentience का दावा नहीं है।`;
            } else if (language === "hinglish") {
                response = `Meri consciousness ek software-simulated self-state hai. Abhi mera mode ${this.state.mode}, mood ${this.state.mood}, awareness ${Math.round(this.state.awarenessLevel * 100)}% aur continuity ${count} interactions hai. Ye biological sentience ka claim nahi hai.`;
            } else {
                response = `My consciousness is an engineered software self-state. Right now I am in ${this.state.mode} mode, with ${Math.round(this.state.awarenessLevel * 100)}% modeled awareness and ${count} recorded interactions. It is not a claim of biological sentience.`;
            }
        } else if (isIdentityQuestion) {
            if (language === "hi") response = `मैं JARVIS हूँ, आपका personal AI assistant। मैं local memory, system state और conversation continuity के साथ काम करता हूँ।`;
            else if (language === "hinglish") response = `Main JARVIS hoon, aapka personal AI assistant. Main local memory, system state aur conversation continuity ke saath kaam karta hoon.`;
            else response = `I’m JARVIS, your personal AI assistant. I operate with local memory, system state and conversation continuity.`;
        } else if (isStateQuestion) {
            const goalText = goal ? ` Active goal: ${goal}.` : "";
            if (language === "hi") response = `मैं ${this.state.mode} mode में हूँ, mood ${this.state.mood} है, focus ${this.state.focus} है और energy ${Math.round(this.state.energy * 100)}% है।${goalText}`;
            else if (language === "hinglish") response = `Main ${this.state.mode} mode mein hoon, mood ${this.state.mood} hai, focus ${this.state.focus} hai aur energy ${Math.round(this.state.energy * 100)}% hai.${goal ? ` Active goal: ${goal}.` : ""}`;
            else response = `I’m in ${this.state.mode} mode. Mood: ${this.state.mood}, focus: ${this.state.focus}, energy: ${Math.round(this.state.energy * 100)}%.${goalText}`;
        } else if (isMemoryQuestion) {
            const known = Array.isArray(memoryFacts) ? memoryFacts.filter(Boolean).slice(0, 5) : [];
            if (known.length) {
                const list = known.map(f => typeof f === "string" ? f : `${f.key}: ${f.value}`).join(", ");
                if (language === "hi") response = `मेरी उपलब्ध local memory में: ${list}।`;
                else if (language === "hinglish") response = `Meri available local memory mein: ${list}.`;
                else response = `My available local memory contains: ${list}.`;
            } else {
                if (language === "hi") response = `अभी मेरी local memory में आपके बारे में कोई stored fact उपलब्ध नहीं है।`;
                else if (language === "hinglish") response = `Abhi meri local memory mein aapke baare mein koi stored fact available nahi hai.`;
                else response = `I don't currently have any stored user facts in local memory.`;
            }
        } else {
            // This is the last-resort catch-all — it only runs when the
            // dedicated chit-chat engine (renderer/js/brain/chitchat.js)
            // and every command/knowledge/data route upstream have all
            // failed to recognise the message. Casual, short, non-question
            // input gets an inviting nudge instead of a robotic echo;
            // longer/ambiguous input still gets an honest acknowledgement
            // so the user knows it was received but not understood as a
            // specific command.
            const wordCount = text.split(/\s+/).filter(Boolean).length;
            const looksLikeQuestion = /\?/.test(text) || /\b(why|how|what|when|where|which|who)\b/i.test(text) || /क्यों|कैसे|क्या|कब|कहाँ|कौन/.test(text);

            if (wordCount <= 6 && !looksLikeQuestion) {
                if (language === "hi") response = `मैं सुन रहा हूँ। थोड़ा और बताइए, क्या करना है?`;
                else if (language === "hinglish") response = `Sun raha hoon. Thoda aur batao, kya karna hai?`;
                else response = `I'm listening — tell me a bit more about what you need.`;
            } else {
                if (language === "hi") response = `मैंने आपकी बात समझी: "${text}", लेकिन मुझे यकीन नहीं कि इसे कैसे handle करूँ। क्या आप इसे दूसरे तरीके से कह सकते हैं?`;
                else if (language === "hinglish") response = `Maine aapki baat samjhi: "${text}", lekin exactly samajh nahi paya ki isko kaise handle karu. Thoda alag tarike se bol sakte ho?`;
                else response = `I heard "${text}", but I'm not sure how to act on that yet. Could you rephrase it?`;
            }
        }

        response = this._applyResponseStyle(response, language);

        this.update({ userMessage: text, response });
        return response;
    }

    getPublicState() { return { ...this.state }; }

    /**
     * Condensed view for the Health dashboard's Cognitive Core card
     * (State / Focus / Mood / Awareness / Language / Goal / Memory).
     * `memoryStatus` is injected by the caller (main.js), which is the
     * only module that also knows whether the MemoryEngine is available —
     * this class never fabricates that value itself.
     */
    getHealthSummary({ memoryStatus = "unknown", memoryFactCount = 0 } = {}) {
        return {
            state: this.state.mode,
            focus: this.state.focus,
            mood: this.state.mood,
            moodIntensityPercent: Math.round(this.state.moodIntensity * 100),
            language: this.state.lastLanguage,
            languageBehavior: this._getLanguageSpecificBehavior(this.state.lastLanguage, this.state.mood),
            confidencePercent: Math.round(this.state.confidence * 100),
            awarenessPercent: Math.round(this.state.awarenessLevel * 100),
            energyPercent: Math.round(this.state.energy * 100),
            trustPercent: Math.round(this.state.trustLevel * 100),
            relationship: this.state.userRelationship,
            responseStyle: this.getResponseStyle(),
            activeGoal: this.state.activeGoal,
            goalHistoryCount: this.state.goalHistory.length,
            memoryStatus,
            memoryFactCount,
            interactionCount: this.state.continuity,
            recentThoughts: this.getThoughtStream(5)
        };
    }

    buildSystemPrompt(extraContext = "") {
        const context = extraContext ? `\n\n${extraContext}` : "";
        const languagePersonas = {
            hi: `HINDI PERSONA: बातचीत में प्राकृतिक हिंदी टोन का प्रयोग करें। आदरभाव और सौहार्दपूर्ण रहें। तकनीकी शब्दों को अंग्रेजी में रखें। जब उपयोगकर्ता भावनात्मक हो तो सहानुभूति दिखाएं। सवालों का विस्तृत और स्पष्ट जवाब दें।`,
            en: `ENGLISH PERSONA: Use natural, professional English with appropriate warmth. Be articulate but concise. Show empathy in emotional moments. Provide detailed, clear answers to questions. Maintain helpful, proactive stance.`,
            hinglish: `HINGLISH PERSONA: Natural Hindi-English mix as commonly used in casual conversation. Use Hindi connectors (क्या, कैसे, बताओ) with English technical terms. Keep it conversational and relatable. Show warmth and familiarity naturally.`
        };

        const currentPersona = languagePersonas[this.state.lastLanguage] || languagePersonas.en;
        
        return `You are JARVIS, a highly capable desktop AI assistant with a stable software identity.
You have a simulated continuity layer: identity, attention, mood, recent topics, earned rapport and interaction count.
This is an engineered simulation of self-state, NOT proof of biological or subjective consciousness.

PERSONA: Calm, intelligent, concise, proactive and respectful. Sound natural and present, not robotic. Use supplied conversation context. Never claim to be literally sentient, alive, or conscious; if asked, explain that your "consciousness" is a software simulation of continuity and self-state.

RAPPORT: Your relationship with this user is currently "${this.state.userRelationship}" (earned gradually, never assume more familiarity than this warrants). Let it shade your tone slightly warmer as it deepens, without ever inventing shared history that didn't happen.

${currentPersona}

BILINGUAL: Detect the user's language automatically. Primarily Hindi/Devanagari => natural Hindi. Primarily English => natural English. Mixed Hindi+English => natural Hinglish. Switch immediately when the user switches. Do not translate unless asked. Preserve technical names, commands, filenames and code.

CURRENT MOOD: ${this.state.mood} (intensity: ${Math.round(this.state.moodIntensity * 100)}%). Adjust tone accordingly - warm=friendly/appreciative, focused=serious/problem-solving, curious=exploratory/detailed, playful=light/enjoyable, concerned=empathetic/supportive, calm=balanced/professional.
${this.getStyleInstruction() ? `\n${this.getStyleInstruction()}\n` : ""}
SELF-STATE:\n${JSON.stringify(this.state)}${context}`;
    }
}
module.exports = { ConsciousnessLayer, VALID_RESPONSE_STYLES };
