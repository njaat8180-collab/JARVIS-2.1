import { describe, it } from 'node:test';
import assert from 'node:assert';

// Mock the ChatRouter class for testing consciousness-aware fallback responses
class MockChatRouter {
    generateConsciousnessAwareFallback(message, consciousnessState) {
        const { mood, trustLevel, userRelationship, activeGoal, lastLanguage, continuity } = consciousnessState;
        
        // Language-specific responses
        const responses = {
            en: {
                calm: {
                    base: "I received your message, but no JARVIS engine is currently available to answer it.",
                    warm: "I appreciate your message, but I don't have an active AI engine to respond properly right now.",
                    goal: "I understand your request, but I don't have an active AI engine to work on your goal right now."
                },
                warm: {
                    base: "Thank you for your message! Unfortunately, I don't have an active AI engine to provide a proper response at the moment.",
                    warm: "I really appreciate you reaching out! I'm currently without an active AI engine to respond as I'd like.",
                    goal: "I'd love to help with your goal, but I don't have an active AI engine available right now."
                },
                focused: {
                    base: "I understand your message, but no JARVIS engine is currently available to address this.",
                    warm: "I recognize the importance of your request, but I don't have an active AI engine to handle it right now.",
                    goal: "I see this is important for your goal, but I don't have an active AI engine to proceed."
                },
                curious: {
                    base: "I'm curious about your message, but I don't have an active AI engine to explore it properly.",
                    warm: "That's an interesting question! Unfortunately, I don't have an active AI engine to investigate it right now.",
                    goal: "I'm interested in helping with your goal, but I don't have an active AI engine to research it."
                },
                playful: {
                    base: "I got your message, but no JARVIS engine is currently available to play along.",
                    warm: "Fun message! I wish I had an active AI engine to respond in kind right now.",
                    goal: "I'd be happy to help with your goal, but I don't have an active AI engine available."
                },
                concerned: {
                    base: "I understand your concern, but I don't have an active AI engine to help properly.",
                    warm: "I recognize this is important to you, but I don't have an active AI engine to provide the assistance you need.",
                    goal: "I understand this relates to your goal, but I don't have an active AI engine to help with it."
                }
            },
            hi: {
                calm: {
                    base: "मैंने आपका संदेश प्राप्त किया, लेकिन अभी कोई JARVIS इंजन उपलब्ध नहीं है।",
                    warm: "आपके संदेश के लिए धन्यवाद, लेकिन अभी अभी समय उत्तर देने के लिए कोई AI इंजन उपलब्ध नहीं है।",
                    goal: "मैं आपके लक्ष्य को समझता हूँ, लेकिन अभी इस पर काम करने के लिए कोई AI इंजन उपलब्ध नहीं है।"
                },
                warm: {
                    base: "आपके संदेश के लिए धन्यवाद! दुर्भाग से, मैं अभी ठीक से उत्तर देने के लिए कोई AI इंजन उपलब्ध नहीं है।",
                    warm: "मैं आपके संदेश की सराहना करता हूँ! लेकिन अभी अभी समय उत्तर देने के लिए कोई AI इंजन उपलब्ध नहीं है।",
                    goal: "मैं आपके लक्ष्य में मदद करना चाहूँगा, लेकिन अभी इसके लिए कोई AI इंजन उपलब्ध नहीं है।"
                },
                focused: {
                    base: "मैं आपके संदेश को समझता हूँ, लेकिन इसे संबोधित करने के लिए कोई JARVIS इंजन उपलब्ध नहीं है।",
                    warm: "मैं समझता हूँ कि यह महत्वपूर्ण है, लेकिन इसे संभालने के लिए कोई AI इंजन उपलब्ध नहीं है।",
                    goal: "मैं देखता हूँ कि यह आपके लक्ष्य के लिए महत्वपूर्ण है, लेकिन इस पर काम करने के लिए कोई AI इंजन उपलब्ध नहीं है।"
                },
                curious: {
                    base: "मैं आपके संदेश में रुचि रखता हूँ, लेकिन इसकी जांच के लिए कोई AI इंजन उपलब्ध नहीं है।",
                    warm: "यह दिलचस्प प्रश्न है! दुर्भाग से, मैं इसकी जांच के लिए कोई AI इंजन उपलब्ध नहीं है।",
                    goal: "मैं आपके लक्ष्य में रुचि रखता हूँ, लेकिन इसके बारे में जानकारी के लिए कोई AI इंजन उपलब्ध नहीं है।"
                },
                playful: {
                    base: "मैंने आपका संदेश प्राप्त किया, लेकिन मज़ा करने के लिए कोई JARVIS इंजन उपलब्ध नहीं है।",
                    warm: "मज़ेदार संदेश! मैं इसी तरह में जवाब देना चाहूँगा, लेकिन अभी कोई AI इंजन उपलब्ध नहीं है।",
                    goal: "मैं आपके लक्ष्य में मज़ा करना चाहूँगा, लेकिन अभी कोई AI इंजन उपलब्ध नहीं है।"
                },
                concerned: {
                    base: "मैं आपकी चिंता को समझता हूँ, लेकिन मदद करने के लिए कोई AI इंजन उपलब्ध नहीं है।",
                    warm: "मैं समझता हूँ कि यह आपके लिए महत्वपूर्ण है, लेकिन आवश्यक सहायता देने के लिए कोई AI इंजन उपलब्ध नहीं है।",
                    goal: "मैं समझता हूँ कि यह आपके लक्ष्य से संबंधित है, लेकिन इसमें मदद करने के लिए कोई AI इंजन उपलब्ध नहीं है।"
                }
            },
            hinglish: {
                calm: {
                    base: "Maine aapka message receive kiya, lekin currently koi JARVIS engine available nahi hai.",
                    warm: "Aapke message ke liye thank you, lekin abhi koi AI engine proper response dene ke liye available nahi hai.",
                    goal: "Main aapka goal samajhta hoon, lekin us par kaam karne ke liye koi AI engine available nahi hai."
                },
                warm: {
                    base: "Aapke message ke liye thank you! Unfortunately, main abhi proper response dene ke liye koi AI engine nahi hoon.",
                    warm: "Main aapki baat appreciate karta hoon! Par abhi koi AI engine available nahi hai response dene ke liye.",
                    goal: "Main aapke goal mein madad karna chahta hoon, lekin koi AI engine available nahi hai."
                },
                focused: {
                    base: "Main aapka message samajhta hoon, lekin isko handle karne ke liye koi JARVIS engine available nahi hai.",
                    warm: "Main samajhta hoon ki ye important hai, lekin is handle karne ke liye koi AI engine available nahi hai.",
                    goal: "Main dekh raha hoon ki ye aapke goal ke liye important hai, lekin is par kaam karne ke liye koi AI engine available nahi hai."
                },
                curious: {
                    base: "Main aapke message mein interested hoon, lekin is explore karne ke liye koi AI engine available nahi hai.",
                    warm: "Ye interesting question hai! Unfortunately, main is investigate karne ke liye koi AI engine available nahi hoon.",
                    goal: "Main aapke goal mein interested hoon, lekin iske baare mein research karne ke liye koi AI engine available nahi hai."
                },
                playful: {
                    base: "Main aapka message liya, lekin maze karne ke liye koi JARVIS engine available nahi hai.",
                    warm: "Mazedar message! Main aisay mein respond karna chahta hoon, lekin koi AI engine available nahi hai.",
                    goal: "Main aapke goal mein maza karna chahta hoon, lekin koi AI engine available nahi hai."
                },
                concerned: {
                    base: "Main aapki concern samajhta hoon, lekin properly help karne ke liye koi AI engine available nahi hai.",
                    warm: "Main samajhta hoon ki ye aapke liye important hai, lekin necessary help dene ke liye koi AI engine available nahi hai.",
                    goal: "Main samajhta hoon ki ye aapke goal se related hai, lekin isme madad karne ke liye koi AI engine available nahi hai."
                }
            }
        };

        // Get language-specific responses
        const langResponses = responses[lastLanguage] || responses.en;
        const moodResponses = langResponses[mood] || langResponses.calm;

        // Adjust response based on trust level and relationship
        let finalResponse = moodResponses.base;
        
        // Add warmth based on trust level
        if (trustLevel > 0.5) {
            finalResponse = moodResponses.warm;
        }
        
        // Add goal awareness if there's an active goal
        if (activeGoal && moodResponses.goal) {
            finalResponse = moodResponses.goal;
        }

        // Add continuity context for long-term users
        if (continuity > 10 && userRelationship !== "new acquaintance") {
            const relationshipPrefix = {
                en: `As ${userRelationship}, `,
                hi: `${userRelationship} के रूप में, `,
                hinglish: `${userRelationship} ke naate, `
            };
            finalResponse = relationshipPrefix[lastLanguage] || relationshipPrefix.en + finalResponse;
        }

        return finalResponse;
    }
}

describe('Consciousness-Aware Fallback Responses', () => {
    const router = new MockChatRouter();

    it('produces different responses for different moods in English', () => {
        const message = "Hello Jarvis";
        
        const calmState = { mood: 'calm', trustLevel: 0.3, userRelationship: 'new acquaintance', activeGoal: null, lastLanguage: 'en', continuity: 5 };
        const warmState = { mood: 'warm', trustLevel: 0.3, userRelationship: 'new acquaintance', activeGoal: null, lastLanguage: 'en', continuity: 5 };
        const focusedState = { mood: 'focused', trustLevel: 0.3, userRelationship: 'new acquaintance', activeGoal: null, lastLanguage: 'en', continuity: 5 };
        
        const calmResponse = router.generateConsciousnessAwareFallback(message, calmState);
        const warmResponse = router.generateConsciousnessAwareFallback(message, warmState);
        const focusedResponse = router.generateConsciousnessAwareFallback(message, focusedState);
        
        assert.notEqual(calmResponse, warmResponse, 'Calm and warm responses should differ');
        assert.notEqual(calmResponse, focusedResponse, 'Calm and focused responses should differ');
        assert.notEqual(warmResponse, focusedResponse, 'Warm and focused responses should differ');
    });

    it('produces different responses for different languages', () => {
        const message = "Hello Jarvis";
        
        const englishState = { mood: 'calm', trustLevel: 0.3, userRelationship: 'new acquaintance', activeGoal: null, lastLanguage: 'en', continuity: 5 };
        const hindiState = { mood: 'calm', trustLevel: 0.3, userRelationship: 'new acquaintance', activeGoal: null, lastLanguage: 'hi', continuity: 5 };
        const hinglishState = { mood: 'calm', trustLevel: 0.3, userRelationship: 'new acquaintance', activeGoal: null, lastLanguage: 'hinglish', continuity: 5 };
        
        const englishResponse = router.generateConsciousnessAwareFallback(message, englishState);
        const hindiResponse = router.generateConsciousnessAwareFallback(message, hindiState);
        const hinglishResponse = router.generateConsciousnessAwareFallback(message, hinglishState);
        
        assert.notEqual(englishResponse, hindiResponse, 'English and Hindi responses should differ');
        assert.notEqual(englishResponse, hinglishResponse, 'English and Hinglish responses should differ');
        assert.notEqual(hindiResponse, hinglishResponse, 'Hindi and Hinglish responses should differ');
    });

    it('produces warmer responses when trust level is high', () => {
        const message = "Hello Jarvis";
        
        const lowTrustState = { mood: 'calm', trustLevel: 0.3, userRelationship: 'new acquaintance', activeGoal: null, lastLanguage: 'en', continuity: 5 };
        const highTrustState = { mood: 'calm', trustLevel: 0.7, userRelationship: 'new acquaintance', activeGoal: null, lastLanguage: 'en', continuity: 5 };
        
        const lowTrustResponse = router.generateConsciousnessAwareFallback(message, lowTrustState);
        const highTrustResponse = router.generateConsciousnessAwareFallback(message, highTrustState);
        
        assert.notEqual(lowTrustResponse, highTrustResponse, 'Low and high trust responses should differ');
        assert.ok(highTrustResponse.includes('appreciate') || highTrustResponse.includes('recognize'), 'High trust response should be warmer');
    });

    it('produces goal-aware responses when an active goal exists', () => {
        const message = "Hello Jarvis";
        
        const noGoalState = { mood: 'calm', trustLevel: 0.3, userRelationship: 'new acquaintance', activeGoal: null, lastLanguage: 'en', continuity: 5 };
        const withGoalState = { mood: 'calm', trustLevel: 0.3, userRelationship: 'new acquaintance', activeGoal: 'Learn programming', lastLanguage: 'en', continuity: 5 };
        
        const noGoalResponse = router.generateConsciousnessAwareFallback(message, noGoalState);
        const withGoalResponse = router.generateConsciousnessAwareFallback(message, withGoalState);
        
        assert.notEqual(noGoalResponse, withGoalResponse, 'No-goal and with-goal responses should differ');
        assert.ok(withGoalResponse.includes('goal') || withGoalResponse.includes('request'), 'Goal-aware response should mention goal');
    });

    it('adds relationship context for long-term users', () => {
        const message = "Hello Jarvis";
        
        const newUserState = { mood: 'calm', trustLevel: 0.6, userRelationship: 'new acquaintance', activeGoal: null, lastLanguage: 'en', continuity: 5 };
        const longTermUserState = { mood: 'calm', trustLevel: 0.6, userRelationship: 'trusted partner', activeGoal: null, lastLanguage: 'en', continuity: 15 };
        
        const newUserResponse = router.generateConsciousnessAwareFallback(message, newUserState);
        const longTermUserResponse = router.generateConsciousnessAwareFallback(message, longTermUserState);
        
        assert.notEqual(newUserResponse, longTermUserResponse, 'New user and long-term user responses should differ');
        assert.ok(longTermUserResponse.includes('As trusted partner'), 'Long-term user response should include relationship context');
    });

    it('combines mood, trust, and goal factors correctly', () => {
        const message = "Hello Jarvis";
        
        const baseState = { mood: 'calm', trustLevel: 0.3, userRelationship: 'new acquaintance', activeGoal: null, lastLanguage: 'en', continuity: 5 };
        const complexState = { mood: 'warm', trustLevel: 0.7, userRelationship: 'trusted partner', activeGoal: 'Complete project', lastLanguage: 'en', continuity: 20 };
        
        const baseResponse = router.generateConsciousnessAwareFallback(message, baseState);
        const complexResponse = router.generateConsciousnessAwareFallback(message, complexState);
        
        assert.notEqual(baseResponse, complexResponse, 'Base and complex state responses should differ significantly');
        assert.ok(complexResponse.includes('As trusted partner'), 'Complex response should include relationship context');
    });

    it('handles missing consciousness state gracefully', () => {
        const message = "Hello Jarvis";
        const emptyState = {};
        
        const response = router.generateConsciousnessAwareFallback(message, emptyState);
        
        assert.ok(response, 'Should produce a response even with empty state');
        assert.ok(typeof response === 'string', 'Response should be a string');
    });
});