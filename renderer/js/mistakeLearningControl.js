"use strict";

/* ============================================================
   JARVIS PRO MAX — MISTAKE LEARNING CONTROL
   ------------------------------------------------------------
   "Jarvis apni galtiyon se seekhe" — a small, self-contained
   fast path, same pattern/placement as BrowserVoiceControl:

   Pipeline: Chat text → MistakeLearningControl.handle() →
             window.jarvis.learning (main-process ledger) → result

   What it does:
   1. Remembers the last (user message, Jarvis reply) pair.
   2. If the user's new message is a correction ("galat hai",
      "wrong", "not correct", "ye sahi nahi hai", ...), it saves
      {question, wrongAnswer, correction} to the disk-backed
      ledger in src/services/mistakeLearning.js — either from
      the rest of that same message ("galat hai, sahi jawab X
      hai") or, if none was given, by asking for it and using
      the very next message as the correction.
   3. Before any other message is handled normally, it checks
      the ledger for a close-enough past mistake and, if found,
      answers with the learned correction instead of repeating
      the same wrong answer.

   Consumed by renderer/js/renderer.js (sendChatMessage), exactly
   like BrowserVoiceControl — isolated so a failure here can
   never break the normal ChatEngine pipeline.
============================================================ */

const MistakeLearningControl = (() => {

    let lastExchange = null;       // { userMessage, jarvisResponse }
    let pendingCorrectionFor = null; // exchange awaiting a correction reply

    const CORRECTION_PATTERNS = [
        /(?:नहीं\s*)?(?:जार्विस|jarvis)[^.!?]{0,80}(?:गलत|ग़लत|ghalat|galat)[^.!?]{0,100}(?:सही\s*(?:जवाब|उत्तर)|correct\s+answer)/iu,
        /(?:उत्तर|जवाब)\s+गलत\s+है/iu,
        /\bgalat\b/i,
        /\bghalat\b/i,
        /\bwrong\b/i,
        /\bincorrect\b/i,
        /\bnot\s+correct\b/i,
        /\bsahi\s+nahi\b/i,
        /\bthik\s+nahi\b/i,
        /\bthee?k\s+nahi\b/i,
        /\bno,?\s+that'?s\s+(not\s+)?(right|correct)\b/i,
        /गलत|ग़लत/iu
    ];

    // Splits "galat hai, sahi jawab X hai" into a correction body
    // if the user gave one in the same message.
    const INLINE_CORRECTION_SPLIT =
        /(?:galat|ghalat|wrong|incorrect|गलत|ग़लत)[^,.:–-]*[,.:–-]\s*(.+)/iu;

    function cleanCorrection(text) {
        return String(text || "").trim()
            .replace(/^(?:लेकिन\s*)?(?:इसका\s*)?(?:सही\s*(?:जवाब|उत्तर)\s*(?:(?:यह|ये)\s*)?(?:है\s*)?[:,-]?\s*)/iu, "")
            .replace(/^(?:lekin\s*)?(?:iska\s*)?(?:sahi\s*(?:jawab|uttar|answer)\s*(?:ye\s*)?(?:hai\s*)?[:,-]?\s*)/i, "")
            .replace(/^(?:the\s+)?(?:correct\s+answer\s*(?:is)?|it\s+is)\s*[:,-]?\s*/i, "")
            .trim();
    }

    function isCorrectionMessage(text) {
        return CORRECTION_PATTERNS.some((re) => re.test(text));
    }

    function extractInlineCorrection(text) {
        const match = text.match(INLINE_CORRECTION_SPLIT);
        return match && match[1] && cleanCorrection(match[1]).length > 2
            ? cleanCorrection(match[1])
            : null;
    }

    function hasLearningAPI() {
        return !!(window.jarvis && window.jarvis.learning);
    }

    // Called by renderer.js right after every normal reply, so we
    // always know what the last exchange was.
    function noteExchange(userMessage, jarvisResponse) {
        lastExchange = { userMessage, jarvisResponse };
    }

    function resetContext() {
        lastExchange = null;
        pendingCorrectionFor = null;
    }

    async function handle(text) {
        const trimmed = String(text || "").trim();
        if (!trimmed || !hasLearningAPI()) {
            return { handled: false };
        }

        try {

            // ---- Step 1: were we waiting for a correction? ----
            if (pendingCorrectionFor) {
                const target = pendingCorrectionFor;
                pendingCorrectionFor = null;

                const saved = await window.jarvis.learning.recordMistake({
                    userMessage: target.userMessage,
                    jarvisResponse: target.jarvisResponse,
                    correction: trimmed
                });

                if (!saved?.success) {
                    pendingCorrectionFor = target;
                    return { handled: true, reply: "I couldn't save that correction. Please tell me once more." };
                }
                window.dispatchEvent(new CustomEvent("jarvis:correction-saved"));

                return {
                    handled: true,
                    reply:
                        "Samajh gaya, yaad rakh liya. Agli baar isi tarah ka sawaal " +
                        "poochenge to main sahi jawab dunga. Dhanyavaad!"
                };
            }

            // ---- Step 2: is this message a correction? ----
            if (isCorrectionMessage(trimmed) && lastExchange) {
                const inlineCorrection = extractInlineCorrection(trimmed);

                if (inlineCorrection) {
                    const saved = await window.jarvis.learning.recordMistake({
                        userMessage: lastExchange.userMessage,
                        jarvisResponse: lastExchange.jarvisResponse,
                        correction: inlineCorrection
                    });

                    if (!saved?.success) return { handled: true, reply: "I couldn't save that correction. Please try again." };
                    window.dispatchEvent(new CustomEvent("jarvis:correction-saved"));

                    return {
                        handled: true,
                        reply:
                            "Thank you, note kar liya — agli baar sahi jawab dunga."
                    };
                }

                // No correction supplied yet — ask for it, and treat
                // the user's very next message as the correction.
                pendingCorrectionFor = lastExchange;

                return {
                    handled: true,
                    reply:
                        "Sorry, mujhse galti hui. Sahi jawab kya hai, please bata dijiye " +
                        "taaki main agli baar wahi bataun."
                };
            }

            // ---- Step 3: have we made this mistake before? ----
            const lesson = await window.jarvis.learning.findLesson(trimmed);

            if (lesson && lesson.found && lesson.confidence >= 0.45) {
                return {
                    handled: true,
                    reply: lesson.correction,
                    fromLesson: true
                };
            }

            return { handled: false };

        } catch (error) {
            console.error("❌ MistakeLearningControl error (falling back):", error);
            return { handled: false };
        }
    }

    return {
        handle,
        noteExchange,
        resetContext
    };
})();

window.MistakeLearningControl = MistakeLearningControl;
