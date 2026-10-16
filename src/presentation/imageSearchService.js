"use strict";

const LICENSE_FILTER = "cc0,pdm,by,by-sa,by-nd";

function safeHttpUrl(value) {
    try {
        const url = new URL(String(value || ""));
        return url.protocol === "https:" ? url.href : "";
    } catch (_) { return ""; }
}

function cleanText(value, limit = 240) {
    return String(value || "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0*39;/g, "'").replace(/\s+/g, " ").trim().slice(0, limit);
}

function mimeFromUrl(value) {
    const pathname = (() => { try { return new URL(value).pathname.toLowerCase(); } catch (_) { return ""; } })();
    if (/\.png$/.test(pathname)) return "image/png";
    if (/\.gif$/.test(pathname)) return "image/gif";
    if (/\.(?:jpe?g)$/.test(pathname)) return "image/jpeg";
    return "";
}

function normalizeOpenverse(item) {
    const url = safeHttpUrl(item?.url);
    const downloadUrl = safeHttpUrl(item?.thumbnail) || url;
    if (!url || !downloadUrl) return null;
    return {
        url, downloadUrl, thumbUrl: downloadUrl,
        title: cleanText(item.title || item.foreign_landing_url || "Openverse image"),
        source: "Openverse", provider: "Openverse",
        sourceUrl: safeHttpUrl(item.foreign_landing_url),
        creator: cleanText(item.creator || item.creator_username || "", 160),
        license: cleanText([item.license, item.license_version].filter(Boolean).join(" "), 80),
        licenseUrl: safeHttpUrl(item.license_url),
        // Openverse often omits mimetype and returns an extensionless thumbnail
        // endpoint, while the original photo URL still identifies JPEG/PNG.
        // Without this fallback the selector rejects every such result.
        mime: String(item.mimetype || item.mime_type || mimeFromUrl(downloadUrl) || mimeFromUrl(url)).toLowerCase(),
        width: Number(item.width) || 0,
        height: Number(item.height) || 0,
        byteSize: Number(item.filesize) || 0
    };
}

function normalizeCommons(item) {
    const url = safeHttpUrl(item?.url);
    const downloadUrl = safeHttpUrl(item?.thumbUrl) || url;
    if (!url || !downloadUrl) return null;
    return {
        url, downloadUrl, thumbUrl: downloadUrl,
        title: cleanText(item.title || "Wikimedia Commons image"),
        source: "Wikimedia Commons", provider: "Wikimedia Commons",
        sourceUrl: safeHttpUrl(item.sourceUrl),
        creator: cleanText(item.artist || item.creator || "", 160),
        license: cleanText(item.license || "", 80),
        licenseUrl: safeHttpUrl(item.licenseUrl || ""),
        mime: String(item.mime || "").toLowerCase(),
        sourceMime: String(item.sourceMime || item.originalMime || item.mime || "").toLowerCase(),
        width: Number(item.width) || 0,
        height: Number(item.height) || 0,
        byteSize: Number(item.byteSize) || 0
    };
}

function normalizePexels(photo) {
    const downloadUrl = safeHttpUrl(photo?.src?.large2x || photo?.src?.large || photo?.src?.original);
    const sourceUrl = safeHttpUrl(photo?.url);
    if (!downloadUrl || !sourceUrl) return null;
    return {
        url: safeHttpUrl(photo?.src?.original) || downloadUrl,
        downloadUrl, thumbUrl: downloadUrl,
        title: cleanText(photo.alt || `Photo by ${photo.photographer || "Pexels contributor"}`),
        source: "Pexels", provider: "Pexels", sourceUrl,
        creator: cleanText(photo.photographer || "", 160),
        creatorUrl: safeHttpUrl(photo.photographer_url),
        license: "Pexels License", licenseUrl: "https://www.pexels.com/license/",
        mime: "image/jpeg", width: Number(photo.width) || 0, height: Number(photo.height) || 0
    };
}

function normalizeGoogleImage(item) {
    const downloadUrl = safeHttpUrl(item?.image?.thumbnailLink) || safeHttpUrl(item?.link);
    const url = safeHttpUrl(item?.link);
    if (!downloadUrl || !url) return null;
    return {
        url, downloadUrl, thumbUrl: downloadUrl,
        title: cleanText(item.title || item.snippet || "Google Images result"),
        source: "Google Images", provider: "Google Images",
        sourceUrl: safeHttpUrl(item?.image?.contextLink),
        mime: String(item?.mime || mimeFromUrl(downloadUrl) || mimeFromUrl(url)).toLowerCase(),
        width: Number(item?.image?.width || item?.image?.thumbnailWidth) || 0,
        height: Number(item?.image?.height || item?.image?.thumbnailHeight) || 0,
        byteSize: Number(item?.image?.byteSize) || 0,
        license: "Creative Commons image search"
    };
}

function isUsableImage(image, options = {}) {
    if (!image?.url || !image?.downloadUrl) return false;
    const width = Number(image.width) || 0;
    const height = Number(image.height) || 0;
    if (width < 320 || height < 320 || width * height < 250_000) return false;
    const logoQuery = /\b(?:logo|icon|brand mark)\b/i.test(String(options.query || ""));
    if (!logoQuery && options.requireLandscape !== false && width / height < 1.1) return false;
    const mime = String(image.mime || "").toLowerCase();
    // Openverse may omit MIME metadata. The downloaded file is signature-checked
    // before use; explicit unsupported types are still rejected here.
    return !mime || /^image\/(?:jpeg|png|jpg|gif)$/.test(mime);
}

function relevantScore(image, query) {
    const tokens = [...new Set(String(query || "").toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])];
    if (!tokens.length) return 0;
    const text = `${image.title} ${image.sourceUrl} ${image.creator}`.toLocaleLowerCase();
    return tokens.reduce((score, token) => score + (text.includes(token) ? (token.length > 5 ? 2 : 1) : 0), 0);
}

function hasTopicRelevance(image, topic) {
    const terms = [...new Set(String(topic || "").toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])]
        .filter(term => !["the", "and", "for", "with", "about", "from", "into", "overview", "introduction", "new", "era", "future", "outlook", "technology", "model", "models"].includes(term));
    if (!terms.length) return true;
    const text = `${image.title} ${image.sourceUrl} ${image.creator}`.toLocaleLowerCase();
    const matchedTerms = terms.filter(term => text.includes(term)).length;
    // Search callers pass the per-slide title and visual cue here. One useful
    // matching term is enough because the query itself is already slide-specific.
    return matchedTerms >= 1;
}

function createImageSearchService({ requestJson, wikimediaSearch, getPexelsApiKey = () => process.env.PEXELS_API_KEY || "", getGoogleSearchConfig = () => ({ apiKey: process.env.GOOGLE_API_KEY || process.env.GOOGLE_CSE_API_KEY || "", cx: process.env.GOOGLE_CX || process.env.GOOGLE_CSE_CX || "" }) } = {}) {
    if (typeof requestJson !== "function" || typeof wikimediaSearch !== "function") {
        throw new TypeError("Image search service needs requestJson and wikimediaSearch providers.");
    }
    const responseCache = new Map();

    async function searchOpenverse(query, limit, page = 1, signal) {
        const endpoint = new URL("https://api.openverse.org/v1/images/");
        endpoint.searchParams.set("q", query);
        endpoint.searchParams.set("page_size", String(Math.max(1, Math.min(20, limit))));
        endpoint.searchParams.set("page", String(Math.max(1, Number(page) || 1)));
        endpoint.searchParams.set("license", LICENSE_FILTER);
        if (!/\b(?:logo|icon|brand mark)\b/i.test(query)) endpoint.searchParams.set("aspect_ratio", "wide");
        const payload = await requestJson(endpoint.href, { timeoutMs: 7000, signal });
        return (Array.isArray(payload?.results) ? payload.results : []).map(normalizeOpenverse).filter(Boolean);
    }

    async function searchWikimedia(query, limit, signal) {
        const payload = await wikimediaSearch(query, limit, { signal });
        return (Array.isArray(payload?.images) ? payload.images : []).map(normalizeCommons).filter(Boolean);
    }

    async function searchPexels(query, limit, signal) {
        const apiKey = String(getPexelsApiKey() || "").trim();
        if (!apiKey) return [];
        const endpoint = new URL("https://api.pexels.com/v1/search");
        endpoint.searchParams.set("query", query);
        endpoint.searchParams.set("per_page", String(Math.max(1, Math.min(20, limit))));
        endpoint.searchParams.set("orientation", "landscape");
        const payload = await requestJson(endpoint.href, { headers: { Authorization: apiKey }, timeoutMs: 7000, signal });
        return (Array.isArray(payload?.photos) ? payload.photos : []).map(normalizePexels).filter(Boolean);
    }

    async function searchGoogleImages(query, limit, signal) {
        const config = getGoogleSearchConfig?.() || {};
        const apiKey = String(config.apiKey || "").trim();
        const cx = String(config.cx || "").trim();
        if (!apiKey || !cx) return [];
        const endpoint = new URL("https://www.googleapis.com/customsearch/v1");
        endpoint.searchParams.set("key", apiKey);
        endpoint.searchParams.set("cx", cx);
        endpoint.searchParams.set("q", query);
        endpoint.searchParams.set("num", String(Math.max(1, Math.min(10, limit))));
        endpoint.searchParams.set("searchType", "image");
        endpoint.searchParams.set("imgSize", "large");
        endpoint.searchParams.set("safe", "active");
        endpoint.searchParams.set("rights", "cc_publicdomain,cc_attribute,cc_sharealike");
        const payload = await requestJson(endpoint.href, { timeoutMs: 7000, signal });
        return (Array.isArray(payload?.items) ? payload.items : []).map(normalizeGoogleImage).filter(Boolean);
    }

    async function searchImages(query, options = {}) {
        const assertNotCancelled = () => {
            if (!options.signal?.aborted) return;
            const error = new Error("Image search was cancelled.");
            error.name = "AbortError";
            throw error;
        };
        assertNotCancelled();
        const q = cleanText(query, 180);
        if (!q) return { success: false, images: [], error: "No image search query was supplied.", providersTried: [] };
        const limit = Math.max(1, Math.min(20, Number(options.limit) || 10));
        const topicKey = cleanText(`${options.topic || ""}|${options.visualCue || ""}`, 180).toLocaleLowerCase();
        const cacheKey = `${q.toLocaleLowerCase()}|${topicKey}|${limit}|${options.requireLandscape !== false}`;
        const cached = responseCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) return { ...cached.value, cached: true };
        const providersTried = [];
        const errors = [];
        const collected = [];
        const seen = new Set();
        const providersTriedSet = new Set();
        let primarySource = "";
        const topic = cleanText(options.topic || "", 120);
        const cue = cleanText(options.visualCue || "", 120);
        // Try the precise slide cue first. If it yields nothing usable, broaden
        // to the topic and then a compact topic+cue query instead of failing the
        // whole slide/deck because one provider interpreted a long query poorly.
        const queryVariants = [...new Set([q, cue, topic, [topic, cue].filter(Boolean).join(" ")]
            .map(value => cleanText(value, 160)).filter(Boolean))];
        const searchVariant = async (query) => {
            const googleConfig = getGoogleSearchConfig?.() || {};
            const providers = [
                ...(googleConfig.apiKey && googleConfig.cx ? [["Google Images", () => searchGoogleImages(query, limit, options.signal)]] : []),
                ["Openverse", () => searchOpenverse(cleanText(query, 120), limit, 1, options.signal)],
                ["Wikimedia Commons", () => searchWikimedia(query, limit, options.signal)],
                ...(String(getPexelsApiKey() || "").trim() ? [["Pexels", () => searchPexels(query, limit, options.signal)]] : [])
            ];
            const settled = await Promise.allSettled(providers.map(([, search]) => search()));
            assertNotCancelled();
            settled.forEach((result, providerIndex) => {
                const [name] = providers[providerIndex];
                providersTriedSet.add(name);
                if (result.status !== "fulfilled") {
                    errors.push(`${name}: ${String(result.reason?.message || result.reason).slice(0, 180)}`);
                    return;
                }
                const results = result.value.filter(image => {
                    const originalMime = String(image.sourceMime || image.mime || "").toLowerCase();
                    const imageFile = !originalMime || /^image\/(?:jpeg|png|jpg|gif|svg\+xml)$/.test(originalMime);
                    return imageFile && isUsableImage(image, { ...options, query }) && hasTopicRelevance(image, topic || cue || query);
                }).map((image, index) => ({ ...image, relevance: relevantScore(image, topic ? `${topic} ${cue}` : query), _rank: index }))
                    .sort((a, b) => b.relevance - a.relevance || a._rank - b._rank)
                    .map(({ _rank, ...image }) => image);
                if (results.length && !primarySource) primarySource = name;
                for (const image of results) {
                    let identity = "";
                    try {
                        const url = new URL(image.url || image.downloadUrl);
                        url.search = "";
                        url.hash = "";
                        identity = url.href.toLowerCase();
                    } catch (_) { /* Invalid URLs were rejected by the provider. */ }
                    if (!identity || seen.has(identity)) continue;
                    seen.add(identity);
                    collected.push(image);
                }
            });
        };
        for (const query of queryVariants) {
            await searchVariant(query);
            if (collected.length >= Math.min(3, limit)) break;
        }
        providersTried.push(...providersTriedSet);
        collected.sort((a, b) => b.relevance - a.relevance);
        const value = collected.length
            ? { success: true, query: q, images: collected.slice(0, limit), source: primarySource, providersTried, candidateCount: collected.length }
            : { success: false, query: q, images: [], providersTried, error: errors.join("; ") || "No suitable openly reusable image was found." };
        responseCache.set(cacheKey, { value, expiresAt: Date.now() + (collected.length ? 10 * 60_000 : 60_000) });
        return value;
    }

    return { searchImages, isUsableImage };
}

module.exports = { createImageSearchService, normalizeOpenverse, normalizeCommons, normalizePexels, normalizeGoogleImage, isUsableImage, relevantScore, hasTopicRelevance };
