"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createImageSearchService, normalizeOpenverse, normalizeCommons, normalizePexels, hasTopicRelevance } = require("../src/presentation/imageSearchService");
const { choosePresentationImages } = require("../src/presentation/imageAssets");

const landscape = {
    url: "https://cdn.example.test/minecraft-world.jpg",
    thumbnail: "https://cdn.example.test/minecraft-world-thumb.jpg",
    foreign_landing_url: "https://openverse.example.test/minecraft-world",
    title: "Minecraft world landscape", creator: "JARVIS image contributor",
    license: "by-sa", license_version: "4.0", license_url: "https://creativecommons.org/licenses/by-sa/4.0/",
    mimetype: "image/jpeg", width: 1600, height: 900
};

test("Openverse results normalize source, download URL, author, license, and landscape metadata", () => {
    const image = normalizeOpenverse(landscape);
    assert.equal(image.provider, "Openverse");
    assert.equal(image.downloadUrl, landscape.thumbnail);
    assert.equal(image.sourceUrl, landscape.foreign_landing_url);
    assert.equal(image.creator, landscape.creator);
    assert.equal(image.license, "by-sa 4.0");
    assert.equal(image.width, 1600);
});

test("Openverse MIME falls back to the original file URL when the API omits it", () => {
    const image = normalizeOpenverse({ ...landscape, mimetype: "", mime_type: "", thumbnail: "https://api.openverse.org/v1/images/example/thumb/" });
    assert.equal(image.mime, "image/jpeg");
});

test("Wikimedia and Pexels records normalize into the shared attribution schema", () => {
    const commons = normalizeCommons({ url: landscape.url, thumbUrl: landscape.thumbnail, sourceUrl: landscape.foreign_landing_url, artist: "Commons author", license: "CC BY-SA", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", mime: "image/jpeg", width: 1600, height: 900 });
    const pexels = normalizePexels({ url: "https://www.pexels.com/photo/42/", photographer: "Pexels author", photographer_url: "https://www.pexels.com/@author/", width: 1600, height: 900, src: { large2x: landscape.url, original: landscape.url } });
    assert.equal(commons.creator, "Commons author");
    assert.equal(commons.licenseUrl, "https://creativecommons.org/licenses/by-sa/4.0/");
    assert.equal(pexels.provider, "Pexels");
    assert.equal(pexels.creator, "Pexels author");
    assert.equal(pexels.license, "Pexels License");
});

test("parallel image providers reject unrelated results and broaden a thin result set", async () => {
    const calls = [];
    const service = createImageSearchService({
        requestJson: async url => {
            calls.push(new URL(url).hostname);
            if (new URL(url).hostname === "api.openverse.org") return { results: [{ ...landscape, title: "Black mouse pointer icon", url: "https://cdn.example.test/mouse.jpg", thumbnail: "https://cdn.example.test/mouse-thumb.jpg", foreign_landing_url: "https://openverse.example.test/mouse-pointer" }] };
            throw new Error("Unexpected API provider");
        },
        wikimediaSearch: async query => {
            calls.push("commons");
            return { success: true, images: [{ title: "File:Minecraft world screenshot.jpg", url: "https://upload.wikimedia.org/minecraft.jpg", thumbUrl: "https://upload.wikimedia.org/minecraft-thumb.jpg", sourceUrl: "https://commons.wikimedia.org/wiki/File:Minecraft_world_screenshot.jpg", artist: "Commons author", license: "CC BY-SA", mime: "image/jpeg", width: 1600, height: 900 }] };
        },
        getPexelsApiKey: () => "", getGoogleSearchConfig: () => ({})
    });
    const result = await service.searchImages("Minecraft world screenshot", { topic: "Minecraft", limit: 10 });
    assert.equal(result.success, true);
    assert.equal(result.source, "Wikimedia Commons");
    assert.equal(result.images[0].creator, "Commons author");
    assert.deepEqual(calls, ["api.openverse.org", "commons", "api.openverse.org", "commons"]);
    assert.equal(result.images.length, 1, "duplicate fallback results must be deduplicated");
    assert.ok(result.images.every(image => !image.title.includes("mouse")));
});

test("image search fills a thin Openverse result set from later providers for multi-slide decks", async () => {
    const hosts = [];
    let commonsCalled = false;
    const makeCommons = index => ({
        title: `Minecraft environment ${index}`,
        url: `https://upload.wikimedia.org/minecraft-${index}.jpg`,
        thumbUrl: `https://upload.wikimedia.org/minecraft-${index}-thumb.jpg`,
        sourceUrl: `https://commons.wikimedia.org/wiki/File:Minecraft_${index}.jpg`,
        artist: "Commons author", license: "CC BY-SA", mime: "image/jpeg", width: 1600, height: 900
    });
    const service = createImageSearchService({
        requestJson: async (url, options = {}) => {
            const host = new URL(url).hostname;
            hosts.push(host);
            if (host === "api.openverse.org") return { results: [{ ...landscape }] };
            if (host === "api.pexels.com") return { photos: [] };
            throw new Error(`Unexpected provider ${host} ${Boolean(options.headers?.Authorization)}`);
        },
        wikimediaSearch: async () => { commonsCalled = true; return { images: [makeCommons(1), makeCommons(2)] }; },
        getPexelsApiKey: () => "", getGoogleSearchConfig: () => ({})
    });
    const result = await service.searchImages("Minecraft PvP arena gameplay", { topic: "Minecraft", limit: 6 });
    assert.equal(result.success, true);
    assert.equal(result.source, "Openverse");
    assert.equal(result.images.length, 3);
    assert.equal(commonsCalled, true);
    assert.deepEqual(hosts, ["api.openverse.org"], "enough candidates should avoid a second search round");
});

test("Pexels is a server-side final fallback and no-key mode skips it cleanly", async () => {
    const calls = [];
    let receivedAuthorization = "";
    const service = createImageSearchService({
        requestJson: async (url, options = {}) => {
            const host = new URL(url).hostname;
            calls.push(host);
            if (host === "api.pexels.com") {
                receivedAuthorization = options.headers.Authorization;
                return { photos: [{ url: "https://www.pexels.com/photo/42/", photographer: "Photographer", width: 1600, height: 900, src: { large2x: landscape.url, original: landscape.url }, alt: "Minecraft landscape" }] };
            }
            return { results: [] };
        },
        wikimediaSearch: async () => ({ success: true, images: [] }),
        getPexelsApiKey: () => "server-only-test-key", getGoogleSearchConfig: () => ({})
    });
    const result = await service.searchImages("Minecraft landscape", { topic: "Minecraft" });
    assert.equal(result.source, "Pexels");
    assert.equal(receivedAuthorization, "server-only-test-key");
    assert.equal(JSON.stringify(result).includes("server-only-test-key"), false);

    const countBeforeNoKey = calls.length;
    const noKeyService = createImageSearchService({
        requestJson: async url => { calls.push(new URL(url).hostname); return { results: [] }; },
        wikimediaSearch: async () => ({ success: true, images: [] }),
        getPexelsApiKey: () => "", getGoogleSearchConfig: () => ({})
    });
    const noKeyResult = await noKeyService.searchImages("Solar System", { topic: "Solar System" });
    assert.equal(noKeyResult.success, false);
    assert.equal(calls.slice(countBeforeNoKey).includes("api.pexels.com"), false);
    assert.deepEqual(noKeyResult.providersTried, ["Openverse", "Wikimedia Commons"]);
});

test("square app logos survive search filtering without a landscape-only provider query", async () => {
    const endpoints = [];
    const service = createImageSearchService({
        requestJson: async url => {
            endpoints.push(new URL(url));
            return { results: [{ ...landscape, title: "Visual Studio Code logo", width: 512, height: 512 }] };
        },
        wikimediaSearch: async () => ({ images: [] }),
        getPexelsApiKey: () => "", getGoogleSearchConfig: () => ({})
    });
    const result = await service.searchImages("Visual Studio Code logo", { topic: "Visual Studio Code", limit: 1 });
    assert.equal(result.success, true);
    assert.equal(result.images[0].width, 512);
    assert.equal(endpoints[0].searchParams.has("aspect_ratio"), false);
});

test("unknown image MIME remains eligible for download signature validation", async () => {
    const service = createImageSearchService({
        requestJson: async () => ({ results: [{ ...landscape, mimetype: "", url: "https://cdn.example.test/image/123", thumbnail: "https://cdn.example.test/thumb/123" }] }),
        wikimediaSearch: async () => ({ images: [] }),
        getPexelsApiKey: () => "", getGoogleSearchConfig: () => ({})
    });
    const result = await service.searchImages("Minecraft landscape", { limit: 1 });
    assert.equal(result.success, true);
    assert.equal(result.images[0].mime, "");
    const selected = choosePresentationImages([{ kind: "cover", query: "Minecraft landscape", topicTokens: ["minecraft"], visualCue: "Minecraft landscape" }], [result]);
    assert.equal(selected.length, 1, "missing metadata must not be discarded before the byte-signature check");
});

test("cancelled image searches propagate cancellation and do not cache an empty failure", async () => {
    const controller = new AbortController();
    let requests = 0;
    const service = createImageSearchService({
        requestJson: async () => {
            requests++;
            if (requests === 1) { controller.abort(); throw new Error("cancelled"); }
            return { results: [landscape] };
        },
        wikimediaSearch: async () => ({ images: [] }),
        getPexelsApiKey: () => "", getGoogleSearchConfig: () => ({})
    });
    await assert.rejects(service.searchImages("Minecraft", { signal: controller.signal, limit: 1 }), { name: "AbortError" });
    const retry = await service.searchImages("Minecraft", { limit: 1 });
    assert.equal(retry.success, true);
    assert.equal(requests, 2);
});

test("topic relevance rejects the known irrelevant pointer result", () => {
    assert.equal(hasTopicRelevance({ title: "Black mouse pointer small icon", sourceUrl: "https://example.test/pointer" }, "Minecraft"), false);
    assert.equal(hasTopicRelevance({ title: "Minecraft gameplay screenshot", sourceUrl: "https://example.test/game" }, "Minecraft"), true);
});

test("medium hints allow topic images while concrete scene cues still require relevance", () => {
    const image = { title: "Minecraft coffee shop", url: "https://example.test/minecraft.jpg", sourceUrl: "https://example.test/minecraft", width: 1280, height: 720, mime: "image/jpeg" };
    const target = { kind: "cover", query: "Minecraft", topicTokens: ["minecraft"], visualCue: "in-game gameplay screenshot world" };
    assert.equal(choosePresentationImages([target], [{ images: [image] }]).length, 1);
    assert.equal(choosePresentationImages([{ ...target, visualCue: "Minecraft sword combat" }], [{ images: [image] }]).length, 0);
    assert.equal(choosePresentationImages([{ ...target, topicTokens: ["school"], query: "school", visualCue: "school classroom" }], [{ images: [image] }]).length, 0);
});
