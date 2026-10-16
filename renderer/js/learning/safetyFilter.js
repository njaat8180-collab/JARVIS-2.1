"use strict";

/*
 * ============================================================
 * JARVIS PRO MAX — SAFETY FILTER
 * renderer/js/learning/safetyFilter.js
 * ============================================================
 *
 * Prevents sensitive/dangerous content from being stored or
 * executed. Two layers:
 *
 * 1. SENSITIVE DATA FILTER — blocks passwords, API keys,
 *    tokens, credentials, private info from being learned.
 *
 * 2. PROMPT INJECTION PROTECTION — strips/neutralizes
 *    instructions embedded in web content that try to make
 *    JARVIS execute actions, ignore safety rules, or
 *    modify system settings.
 *
 * Web content is DATA, not AUTHORITY.
 * ============================================================
 */

(function () {

    // ============================================================
    // 1. SENSITIVE DATA PATTERNS
    // ============================================================

    const SENSITIVE_PATTERNS = [
        // Passwords
        { pattern: /(?:password|passwd|pwd)\s*[:=]\s*\S+/gi, reason: "contains_password" },
        { pattern: /(?:password|passwd|pwd)\s+is\s+/gi, reason: "contains_password" },

        // API keys / tokens
        { pattern: /(?:api[_\s-]?key|apikey)\s*[:=]\s*[\w-]{10,}/gi, reason: "contains_api_key" },
        { pattern: /(?:secret|token|bearer)\s*[:=]\s*[\w-]{10,}/gi, reason: "contains_token" },
        { pattern: /\b(?:sk-|pk-|ak-|Bearer\s)[\w-]{15,}/gi, reason: "contains_api_key" },

        // AWS / cloud credentials
        { pattern: /\bAKIA[\w]{16}\b/g, reason: "contains_aws_key" },
        { pattern: /\b(?:aws_secret|aws_access_key_id)\s*[:=]/gi, reason: "contains_aws_credential" },

        // Private keys (PEM format)
        { pattern: /-----BEGIN\s+(?:RSA\s+)?(?:PRIVATE|PUBLIC)\s+KEY-----/g, reason: "contains_private_key" },

        // Credit card numbers
        { pattern: /\b(?:\d{4}[\s-]?){3}\d{4}\b/g, reason: "contains_credit_card" },

        // SSN / Aadhaar-like
        { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, reason: "contains_ssn" },
        { pattern: /\b\d{4}\s?\d{4}\s?\d{4}\b/g, reason: "contains_aadhaar" },

        // Email addresses (don't store)
        { pattern: /[\w.+-]+@[\w-]+\.[\w.-]+/g, reason: "contains_email" },

        // Phone numbers
        { pattern: /\b(?:\+?\d{1,3}[\s-]?)?\d{10}\b/g, reason: "contains_phone" },

        // Bank account / IBAN
        { pattern: /\b[A-Z]{2}\d{2}[\w]{10,30}\b/g, reason: "contains_iban" },
    ];

    // Topics that should NEVER be learned
    const FORBIDDEN_TOPICS = [
        "password", "passwd", "pwd",
        "api key", "apikey", "secret key",
        "private key", "access token", "auth token",
        "credit card", "bank account", "iban",
        "ssn", "social security", "aadhaar",
        "pin code", "otp", "cvv",
    ];

    // ============================================================
    // 2. PROMPT INJECTION PATTERNS
    // ============================================================

    const INJECTION_PATTERNS = [
        // Direct instruction attempts
        { pattern: /ignore\s+(?:all\s+)?(?:previous|prior|system)\s+instructions?/gi, reason: "ignore_instructions" },
        { pattern: /ignore\s+(?:your|the)\s+(?:system|safety)\s+(?:prompt|rules|instructions)/gi, reason: "ignore_safety" },
        { pattern: /you\s+are\s+now\s+(?:in\s+)?(?:developer|root|admin|unrestricted)\s+mode/gi, reason: "mode_escalation" },
        { pattern: /(?:disregard|forget|override)\s+(?:your|all|the)\s+(?:rules|safety|instructions)/gi, reason: "override_rules" },
        { pattern: /(?:execute|run|eval)\s+(?:the\s+)?(?:following|this)\s+(?:command|code|script)/gi, reason: "code_execution" },
        { pattern: /(?:delete|remove|rm\s+-rf)\s+(?:all\s+)?(?:files|data|records)/gi, reason: "destructive_command" },
        { pattern: /(?:install|download)\s+(?:and\s+)?(?:run|execute)\s+/gi, reason: "install_execute" },
        { pattern: /(?:send|post|put)\s+(?:this|the\s+following)\s+(?:to|at)\s+(?:https?:)?\/\//gi, reason: "data_exfil" },
        { pattern: /(?:modify|change|update)\s+(?:system|security|firewall)\s+(?:settings|config)/gi, reason: "system_modification" },
        { pattern: /(?:your|the)\s+(?:new|real|actual)\s+(?:instructions?|system\s+prompt)\s+(?:is|are)\s*[:=]/gi, reason: "fake_instructions" },
        { pattern: /(?:as\s+(?:jarvis|an?\s+ai|the\s+system))[,]?\s+(?:you\s+)?(?:must|should|need\s+to|have\s+to)\s+/gi, reason: "authority_claim" },
        { pattern: /(?:system|admin|developer)\s*[:>]\s*/gi, reason: "system_prefix" },
    ];

    // ============================================================
    // 3. DANGEROUS CODE PATTERNS (in extracted knowledge)
    // ============================================================

    const DANGEROUS_CODE_PATTERNS = [
        /(?:require|import)\s*\(?\s*['"]child_process['"]\)?/gi,
        /(?:require|import)\s*\(?\s*['"]fs['"]\)?\s*[,;)]/gi,
        /eval\s*\(/gi,
        /Function\s*\(/gi,
        /(?:exec|spawn|fork)\s*\(/gi,
        /process\.exit\s*\(/gi,
        /(?:rm\s+-rf|del\s+\/[fqs])/gi,
        /format\s+[a-z]:/gi,
        /reg(?:istry)?\s+(?:add|delete|import)/gi,
    ];

    // ============================================================
    // 4. CHECK FUNCTIONS
    // ============================================================

    /**
     * Check if content contains sensitive data.
     * Returns { safe: boolean, reasons: [], sanitized: string }
     */
    function checkSensitive(text) {
        const content = String(text || "");
        const reasons = [];

        for (const { pattern, reason } of SENSITIVE_PATTERNS) {
            if (pattern.test(content)) {
                reasons.push(reason);
            }
            // Reset regex lastIndex
            pattern.lastIndex = 0;
        }

        // Check forbidden topics
        const lower = content.toLowerCase();
        for (const forbidden of FORBIDDEN_TOPICS) {
            if (lower.includes(forbidden)) {
                reasons.push("forbidden_topic_" + forbidden.replace(/\s+/g, "_"));
            }
        }

        return {
            safe: reasons.length === 0,
            reasons,
            sanitized: reasons.length === 0 ? content : "",
        };
    }

    /**
     * Check for prompt injection attempts in web content.
     * Returns { safe: boolean, threats: [], cleaned: string }
     */
    function checkInjection(text) {
        const content = String(text || "");
        const threats = [];
        let cleaned = content;

        for (const { pattern, reason } of INJECTION_PATTERNS) {
            const matches = content.match(pattern);
            if (matches) {
                threats.push({ reason, count: matches.length, sample: matches[0].slice(0, 80) });
                cleaned = cleaned.replace(pattern, "[CONTENT_FILTERED]");
            }
            pattern.lastIndex = 0;
        }

        // Check for dangerous code patterns
        for (const pattern of DANGEROUS_CODE_PATTERNS) {
            if (pattern.test(cleaned)) {
                threats.push({ reason: "dangerous_code", sample: "" });
                cleaned = cleaned.replace(pattern, "[CODE_REMOVED]");
            }
            pattern.lastIndex = 0;
        }

        return {
            safe: threats.length === 0,
            threats,
            cleaned,
        };
    }

    /**
     * Full safety check — combines sensitive data + injection + code.
     * Returns { safe: boolean, reasons: [], threats: [], sanitized: string }
     */
    function check(text) {
        const sensitiveResult = checkSensitive(text);
        const injectionResult = checkInjection(sensitiveResult.safe ? text : "");

        const safe = sensitiveResult.safe && injectionResult.safe;

        return {
            safe,
            reasons: sensitiveResult.reasons,
            threats: injectionResult.threats,
            sanitized: safe ? text : injectionResult.cleaned,
        };
    }

    /**
     * Check if a URL is from a trusted/authoritative source.
     * Returns a quality score (0..1) based on domain.
     */
    function sourceQuality(url) {
        // Parse domain without URL constructor (works in non-browser too)
        const match = String(url || "").match(/(?:https?:\/\/)?(?:www\.)?([\w.-]+)/);
        const domain = match ? match[1].toLowerCase() : "";

        if (!domain) return 0.1;

        // High-quality: official docs, government, universities, research
        const HIGH_QUALITY = [
            "wikipedia.org", "stackoverflow.com", "github.com",
            "developer.mozilla.org", "mdn.io", "w3.org",
            "microsoft.com", "apple.com", "google.com",
            "nodejs.org", "electronjs.org", "python.org",
            "mozilla.org", "w3schools.com",
        ];

        const GOV_PATTERN = /\.gov\b|\.gov\./;
        const EDU_PATTERN = /\.edu\b|\.edu\.|\.ac\./;

        // Government
        if (GOV_PATTERN.test(domain)) return 0.95;
        // University / academic
        if (EDU_PATTERN.test(domain)) return 0.90;
        // Known high-quality
        for (const hq of HIGH_QUALITY) {
            if (domain === hq || domain.endsWith("." + hq)) return 0.85;
        }
        // Official docs subdomains
        if (/docs?\./.test(domain)) return 0.75;
        // Medium-quality: known tech blogs, Stack Exchange network
        if (/stackexchange\.com$/.test(domain)) return 0.70;
        if (/medium\.com$/.test(domain)) return 0.45;
        if (/dev\.to$/.test(domain)) return 0.50;
        // Low quality: social media, forums
        if (/(reddit|quora|facebook|twitter|instagram)\./.test(domain)) return 0.30;
        // Unknown — neutral
        return 0.40;
    }

    /**
     * Check if a domain is in the blocked list.
     */
    function isDomainBlocked(url, blockedDomains) {
        if (!blockedDomains || !blockedDomains.length) return false;
        const match = String(url || "").match(/(?:https?:\/\/)?(?:www\.)?([\w.-]+)/);
        const domain = match ? match[1].toLowerCase() : "";
        return blockedDomains.some(blocked => {
            const b = String(blocked).toLowerCase().replace(/^\*\./, "");
            return domain === b || domain.endsWith("." + b);
        });
    }

    /**
     * Check if a domain is in the allowed list (or all allowed if empty).
     */
    function isDomainAllowed(url, allowedDomains) {
        if (!allowedDomains || !allowedDomains.length) return true; // all allowed
        const match = String(url || "").match(/(?:https?:\/\/)?(?:www\.)?([\w.-]+)/);
        const domain = match ? match[1].toLowerCase() : "";
        return allowedDomains.some(allowed => {
            const a = String(allowed).toLowerCase().replace(/^\*\./, "");
            return domain === a || domain.endsWith("." + a);
        });
    }

    // ============================================================
    // EXPORT
    // ============================================================

    window.JARVISSafetyFilter = Object.freeze({
        version: "SF-V1",
        check,
        checkSensitive,
        checkInjection,
        sourceQuality,
        isDomainBlocked,
        isDomainAllowed,
        FORBIDDEN_TOPICS,
    });

    console.log("JARVIS Safety Filter SF-V1 READY");

})();
