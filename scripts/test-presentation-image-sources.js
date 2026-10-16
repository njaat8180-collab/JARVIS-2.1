"use strict";

require("dotenv").config();

let electronApp = null;
let electronNet = null;
if (process.versions.electron) {
    ({ app: electronApp, net: electronNet } = require("electron"));
}
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const JSZip = require("jszip");
const dataSources = require("../src/services/dataSources");
const offlineCache = require("../src/services/offlineCache");
const { createImageSearchService } = require("../src/presentation/imageSearchService");
const { createPptxBuffer, validateDeck, verifyPptxBuffer } = require("../src/presentation/pptxGenerator");

const service = createImageSearchService({
    requestJson: (url, options) => dataSources.httpGetJSON(url, options),
    wikimediaSearch: (query, limit) => dataSources.commonsImageSearch(query, limit),
    getPexelsApiKey: () => process.env.PEXELS_API_KEY || ""
});

function validImageFile(file, mime) {
    const buffer = fs.readFileSync(file);
    if (/png/i.test(mime)) return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

async function runTopic(topic, query, tempRoot) {
    const result = await service.searchImages(query, { limit: 10, topic, query });
    if (!result.success || !result.images.length) throw new Error(`${topic}: no live image provider result (${result.error || result.providersTried.join(", ")}).`);
    const image = result.images[0];
    const extension = /png/i.test(image.mime) ? ".png" : ".jpg";
    const cached = await offlineCache.cacheImage(image.downloadUrl, { maxBytes: 12 * 1024 * 1024, extension });
    if (!cached?.localPath || !validImageFile(cached.localPath, image.mime)) throw new Error(`${topic}: selected ${image.provider} image did not download as a valid local image.`);
    const deck = {
        title: topic,
        subtitle: `Live image provider: ${image.provider}`,
        slides: [
            { title: `${topic}: overview`, points: [`An overview of ${topic}.`, "Real image inserted from a live provider."], visualCue: query, imagePath: cached.localPath, imageTitle: image.title, imageAttribution: `${image.creator || image.provider} · ${image.license || image.provider}`, imageSourceUrl: image.sourceUrl, imageCredit: image.sourceUrl },
            { title: `${topic}: key details`, points: [`Key elements of ${topic}.`, "This slide verifies multi-slide export remains valid."], visualCue: query }
        ],
        coverImage: { imagePath: cached.localPath, imageTitle: image.title, imageAttribution: `${image.creator || image.provider} · ${image.license || image.provider}`, imageSourceUrl: image.sourceUrl, imageCredit: image.sourceUrl }
    };
    const checkedDeck = validateDeck(deck, 3);
    if (!checkedDeck.coverImage?.imagePath || !checkedDeck.slides[0]?.imagePath) {
        throw new Error(`${topic}: PPT validation rejected the downloaded image path.`);
    }
    const buffer = await createPptxBuffer(deck, 3);
    const checked = await verifyPptxBuffer(buffer, 3);
    if (!checked.valid || checked.imageCount < 1) {
        const zip = await JSZip.loadAsync(buffer);
        const media = Object.keys(zip.files).filter(name => name.startsWith("ppt/media/") && !name.endsWith("/"));
        const firstSlide = await zip.file("ppt/slides/slide1.xml").async("string");
        throw new Error(`${topic}: generated PPTX did not embed an image (imagePath=${checkedDeck.coverImage.imagePath}; media=${media.join(",")}; slidePicture=${firstSlide.includes("<p:pic")}).`);
    }
    console.log(`${topic}: provider=${image.provider}; downloaded=valid; embedded=${checked.imageCount}; license=${image.license || "not supplied"}`);
}

async function run() {
    if (electronApp) {
        await electronApp.whenReady();
        const fetchWithDesktopNetwork = (url, options = {}) => electronNet.fetch(url, {
            headers: options.headers || {},
            signal: AbortSignal.timeout(Math.max(1000, Number(options.timeoutMs) || 15000))
        });
        dataSources.setNetworkFetch(fetchWithDesktopNetwork);
        offlineCache.setNetworkFetch(fetchWithDesktopNetwork);
    }
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-live-image-smoke-"));
    try {
        offlineCache.init(path.join(tempRoot, "profile"));
        await runTopic("Minecraft", "Minecraft gameplay landscape screenshot", tempRoot);
        await runTopic("Solar System", "Solar System planets landscape NASA", tempRoot);
        if (process.env.PEXELS_API_KEY) console.log("Pexels: server-side key detected; fallback is available.");
        else console.log("Pexels: skipped live authorization test (PEXELS_API_KEY is not configured).");
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
}

run().catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
}).finally(() => electronApp?.quit());
