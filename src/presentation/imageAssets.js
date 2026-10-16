"use strict";

const STOP_WORDS = new Set([
    "about", "after", "also", "and", "are", "as", "at", "be", "best", "by", "can", "for", "from", "how", "in", "into",
    "is", "it", "its", "of", "on", "or", "the", "their", "this", "to", "was", "what", "when", "with", "why", "will",
    "overview", "introduction", "understanding", "guide", "explained", "basics", "key", "main", "important", "features",
    "और", "का", "की", "के", "को", "में", "पर", "से", "यह", "है", "एक", "इस", "तथा", "लिए", "कैसे", "क्या",
    // These words describe a deck rather than its subject, so they should not
    // make a valid single-name topic such as "Claude: A New Era of AI" fail.
    "new", "era", "overview", "introduction", "guide", "explained", "future", "outlook", "ai", "model", "models", "technology"
]);

function words(value) {
    return [...new Set(String(value || "").normalize("NFKC").toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [])]
        .filter(word => word.length > 1 && !STOP_WORDS.has(word));
}

function topicSpecificCue(topic, title, cue, index) {
    const text = `${topic || ""} ${title || ""} ${cue || ""}`.toLocaleLowerCase();
    if (/\bminecraft\b/.test(text)) {
        if (/combat|pvp|fight|weapon/.test(text)) return "Minecraft in-game PvP combat diamond sword shield";
        if (/\b(?:mining|ore|resource|diamond)\b/.test(text)) return "Minecraft in-game mining cave diamond ore pickaxe";
        if (/\b(?:craft|crafting|tool|progression)\b/.test(text)) return "Minecraft in-game crafting table tools inventory";
        if (/build|architecture|creative|structure/.test(text)) return "Minecraft in-game creative building block structure";
        if (/redstone|circuit|automation/.test(text)) return "Minecraft in-game redstone circuit piston mechanism";
        if (/nether|dimension|portal|end\b|dragon/.test(text)) return "Minecraft in-game Nether End portal dimension";
        if (/mob|creeper|skeleton|zombie/.test(text)) return "Minecraft in-game mobs creeper skeleton survival";
        if (/survival|food|shelter|mode/.test(text)) return "Minecraft in-game survival mode shelter night";
        return "Minecraft in-game gameplay screenshot world";
    }
    if (/\bschool|education|classroom|student|teacher\b/.test(text)) {
        const scenes = [
            "school classroom students learning with teacher",
            "school campus building exterior students",
            "school science laboratory students experiment",
            "school library students reading books",
            "school computer lab students digital learning",
            "school sports field students team practice",
            "teacher explaining lesson to students classroom",
            "students collaborating on school project"
        ];
        if (/laboratory|lab|experiment|science|microscope/.test(text)) return "school science laboratory students doing experiment";
        if (/library|reading|book/.test(text)) return "school library students reading books";
        if (/sport|play|fitness|team|field/.test(text)) return "school sports field students playing team sport";
        if (/computer|digital|technology|coding/.test(text)) return "students using computers in school computer lab";
        if (/building|campus|facility|architecture|entrance/.test(text)) return "school campus building exterior students";
        if (/teacher|lesson|classroom|learning|teach/.test(text)) return "teacher teaching students in bright school classroom";
        return scenes[Math.max(0, Number(index) || 0) % scenes.length];
    }
    return String(cue || title || topic || "").trim();
}

function buildPresentationImageTargets(deck, maxContentImages = Number.MAX_SAFE_INTEGER, requestedTopic = "") {
    const slides = Array.isArray(deck?.slides) ? deck.slides : [];
    const topic = String(requestedTopic || deck?.title || "").trim();
    const coverWords = [...words(deck?.title).slice(0, 4), ...words(deck?.subtitle).slice(0, 2)];
    const topicTokens = words(topic).slice(0, 5);
    const coverCue = topicSpecificCue(topic, deck?.title, "", -1);
    const coverQuery = [...new Set([...coverWords, ...words(coverCue).slice(0, 5)])].join(" ");
    const targets = [{ kind: "cover", query: coverQuery, searchQueries: [coverCue, coverQuery], visualCue: coverCue, topicTokens }];
    const count = Math.min(Math.max(0, Number(maxContentImages) || 0), slides.length);
    const indexes = count >= slides.length || count <= 1
        ? Array.from({ length: count }, (_, index) => index)
        : Array.from({ length: count }, (_, index) => Math.round(index * (slides.length - 1) / (count - 1)));

    for (const index of indexes) {
        const slide = slides[index];
        // Keep Commons queries focused: long prose and bullets tend to make
        // file search return no photographic matches at all.
        const cue = topicSpecificCue(topic, slide?.title, slide?.visualCue, index);
        const slideTitle = String(slide?.title || "").trim();
        const deckTitle = String(deck?.title || topic).trim();
        const searchQueries = [...new Set([
            cue,
            `${deckTitle} ${slideTitle} ${cue}`,
            `${deckTitle} ${slideTitle}`
        ].map(value => value.replace(/\s+/g, " ").trim().slice(0, 120)).filter(Boolean))];
        const queryWords = [...new Set([...words(deck?.title).slice(0, 3), ...words(slideTitle).slice(0, 5), ...words(cue).slice(0, 7)])].slice(0, 14);
        targets.push({
            kind: "slide",
            index,
            query: queryWords.join(" "),
            searchQueries,
            visualCue: cue.slice(0, 180),
            animationWanted: String(slide?.layout || "").toLowerCase() === "process" || /\b(?:process|motion|cycle|sequence|animation)\b/i.test(`${slide?.title || ""} ${cue}`),
            topicTokens
        });
    }
    return targets;
}

function imageDimensionsValid(image) {
    const width = Number(image?.width) || 0;
    const height = Number(image?.height) || 0;
    // byteSize returned by Commons describes the full original, not the
    // resized thumbUrl that JARVIS downloads. Large originals can still have
    // perfectly small, usable thumbnails, so enforce the limit after download.
    // Permit square app/logo artwork as well as landscape photography, while
    // still rejecting tiny thumbnails and oversized originals.
    return width >= 320 && height >= 320 && width * height >= 250_000;
}

function canonicalImageUrl(value) {
    try {
        const url = new URL(String(value || ""));
        url.hash = "";
        url.search = "";
        return `${url.hostname.toLowerCase()}${url.pathname.toLowerCase()}`;
    } catch (_) {
        return "";
    }
}

function scorePresentationImage(image, target, rank = 0) {
    if (!image || !imageDimensionsValid(image)) return null;
    const mime = String(image.mime || "").toLowerCase();
    // Some Openverse CDN records omit MIME and file extensions. They may reach
    // the downloader, whose signature check still rejects non-image bytes.
    if (mime && !/^image\/(?:jpeg|png|gif)$/.test(mime)) return null;
    const isAnimatedAsset = mime === "image/gif";
    if (isAnimatedAsset && target.animationWanted !== true) return null;

    let parsed;
    try { parsed = new URL(String(image.url || image.thumbUrl || "")); }
    catch (_) { return null; }
    if (parsed.protocol !== "https:" || !parsed.hostname || parsed.hostname === "localhost" || parsed.hostname.endsWith(".local")) return null;
    if (image.provider === "Google Images" && !/^https:\/\//i.test(image.sourceUrl || "")) return null;

    const candidateText = [image.title, image.sourceUrl, parsed.pathname].join(" ").toLocaleLowerCase();
    const queryTokens = [...new Set(words(`${target.query || ""} ${target.title || ""} ${target.visualCue || ""}`))];
    const topicTokens = target.topicTokens || [];
    const matchedTopicTokens = topicTokens.filter(token => candidateText.includes(token));
    const matchedQueryTokens = queryTokens.filter(token => candidateText.includes(token));
    // Each slide is searched with its own visual cue. One distinctive match is
    // enough to keep real, relevant photos eligible; requiring two matches
    // disproportionately rejected valid single-name subjects and logos.
    if (!matchedTopicTokens.length && !matchedQueryTokens.length) return null;

    const titleTokens = words(image.title);
    const sourceTokens = words(image.sourceUrl);
    const cueTokens = words(target.visualCue || "");
    // Search hints such as "in-game screenshot" describe the medium, not a
    // scene. Providers commonly title an authentic image simply "Minecraft".
    // Requiring those hints in its title discarded all otherwise relevant
    // cover/overview results. Concrete cues (sword, classroom, redstone, etc.)
    // still require a match and keep unrelated topic images off those slides.
    const mediumWords = new Set(["game", "gameplay", "screenshot", "screenshots", "world", "image", "photo", "photograph", "photography", "official", "authentic", "render", "rendering", "illustration"]);
    const sceneTokens = cueTokens.filter(token => !topicTokens.includes(token) && !mediumWords.has(token));
    const matchedSceneTokens = sceneTokens.filter(token => titleTokens.includes(token) || sourceTokens.includes(token));
    // A generic image that merely repeats the deck topic (for example, a
    // "Minecraft coffee shop" for a slide about PvP) is not a slide-specific
    // visual. Require at least one non-topic cue match whenever one exists.
    if (sceneTokens.length && !matchedSceneTokens.length) return null;
    const titleMatches = queryTokens.filter(token => titleTokens.includes(token)).length;
    const sourceMatches = queryTokens.filter(token => sourceTokens.includes(token)).length;
    const area = Number(image.width) * Number(image.height);
    const ratio = Number(image.width) / Number(image.height);
    const preferredRatio = target.kind === "cover" ? 16 / 9 : 4 / 3;
    const ratioPenalty = Math.min(4, Math.abs(Math.log(Math.max(0.1, ratio) / preferredRatio)) * 1.5);
    const resolutionBonus = Math.min(4, Math.log2(Math.max(1, area / (640 * 400))));
    const sourceBonus = image.provider === "Google Images" ? 1.5 : 0.5;
    const cueMatches = matchedSceneTokens.length;
    const animationBonus = isAnimatedAsset && target.animationWanted ? 5 : 0;
    const score = matchedTopicTokens.length * 3 + matchedQueryTokens.length + cueMatches * 5 + titleMatches * 2 + sourceMatches + resolutionBonus + sourceBonus + animationBonus - ratioPenalty - rank * 0.12;
    return { image, score, canonicalUrl: canonicalImageUrl(image.url || image.thumbUrl) };
}

function choosePresentationImages(targets, resultSets, excludedUrls = []) {
    const used = new Set((Array.isArray(excludedUrls) ? excludedUrls : []).map(canonicalImageUrl).filter(Boolean));
    return targets.map((target, index) => {
        const candidates = (Array.isArray(resultSets?.[index]?.images) ? resultSets[index].images : [])
            .map((image, rank) => scorePresentationImage(image, target, rank))
            .filter(candidate => candidate && candidate.canonicalUrl && !used.has(candidate.canonicalUrl))
            .sort((a, b) => b.score - a.score);
        const choice = candidates[0];
        if (!choice) return null;
        used.add(choice.canonicalUrl);
        return { target, image: choice.image, score: choice.score };
    }).filter(Boolean);
}

module.exports = { buildPresentationImageTargets, scorePresentationImage, choosePresentationImages };
