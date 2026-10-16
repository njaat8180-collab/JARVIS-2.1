"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const JSZip = require("jszip");
const { createPptxBuffer, validateDeck, verifyPptxBuffer } = require("../src/presentation/pptxGenerator");
const { buildPresentationImageTargets, choosePresentationImages } = require("../src/presentation/imageAssets");
const { cachePresentationImage, getCachedPresentationImages } = require("../src/presentation/imageLibrary");
const { writePresentationPreview } = require("../src/presentation/previewHtml");
const { resolvePresentationOutputDirectory } = require("../src/presentation/outputDirectory");

test("presentation image layout preserves aspect ratios inside consistent frames", () => {
    const source = fs.readFileSync(path.join(__dirname, "../src/presentation/pptxGenerator.js"), "utf8");
    assert.match(source, /function addSmartImage/);
    assert.match(source, /type: "contain"/);
    assert.doesNotMatch(source, /addSlideImage[\s\S]{0,400}type: "cover"/);
});

function makeDeck(totalSlides, title = "Cybersecurity") {
    return {
        title,
        subtitle: "A practical overview",
        slides: Array.from({ length: totalSlides - 1 }, (_, index) => ({
            title: `Section ${index + 1}`,
            points: ["A clear explanation of the main idea.", "A useful example and practical application."],
            notes: `Presenter notes for section ${index + 1}.`
        }))
    };
}

test("PptxGenJS creates readable PPTX packages with the exact requested slide counts", async () => {
    for (const slideCount of [5, 10, 15]) {
        const buffer = await createPptxBuffer(makeDeck(slideCount), slideCount);
        const verification = await verifyPptxBuffer(buffer, slideCount);
        assert.equal(verification.valid, true);
        assert.equal(verification.slideCount, slideCount);
        assert.ok(verification.size > 6000);
    }
});

test("validated presentation preserves only safe HTTPS research source citations", () => {
    const deck = validateDeck({
        ...makeDeck(3),
        sourceCitations: [
            { title: "Wikipedia", url: "https://en.wikipedia.org/wiki/Minecraft" },
            { title: "Unsafe", url: "javascript:alert(1)" },
            { title: "HTTP", url: "http://example.org" }
        ]
    }, 3);
    assert.deepEqual(deck.sourceCitations, [{ title: "Wikipedia", url: "https://en.wikipedia.org/wiki/Minecraft" }]);
});

test("Hindi cover text uses a Devanagari-capable font and a width-aware title size", async () => {
    const deck = makeDeck(3, "माइनक्राफ्ट के ऊपर एक शानदार प्रस्तुति");
    deck.subtitle = "खोज, निर्माण और जीवित रहने की रचनात्मक दुनिया";
    deck.language = "hi";
    const buffer = await createPptxBuffer(deck, 3);
    const zip = await JSZip.loadAsync(buffer);
    const cover = await zip.file("ppt/slides/slide1.xml").async("string");
    const theme = await zip.file("ppt/theme/theme1.xml").async("string");
    assert.match(cover, /Nirmala UI/);
    assert.match(theme, /Nirmala UI/);
    const titleRun = cover.match(/माइनक्राफ्ट[\s\S]{0,500}?sz="(\d+)"/u);
    assert.ok(!titleRun || Number(titleRun[1]) <= 3800, "long Hindi title should use a smaller font than the 38pt default");
});

test("HTML slide preview infers the total slide count when it is omitted", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-preview-count-"));
    try {
        const previewPath = writePresentationPreview(path.join(directory, "deck.pptx"), makeDeck(3), {});
        const html = fs.readFileSync(previewPath, "utf8");
        assert.match(html, /01 \/ 03/);
        assert.match(html, /03 \/ 03/);
        assert.doesNotMatch(html, /undefined/);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test("presentation output defaults to Documents and honors standard requested folders", () => {
    const folders = { documents: "C:/Users/test/Documents", downloads: "C:/Users/test/Downloads", desktop: "C:/Users/test/Desktop" };
    assert.equal(resolvePresentationOutputDirectory("Create a PPT on Minecraft", folders).directory, path.join(folders.documents, "JARVIS Presentations"));
    assert.equal(resolvePresentationOutputDirectory("Create a PPT on Minecraft and save it to Downloads", folders).directory, path.join(folders.downloads, "JARVIS Presentations"));
    assert.equal(resolvePresentationOutputDirectory("Create a PPT on Minecraft", folders, "desktop").destination, "desktop");
});

test("saved PPTX file can be reopened and verified", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-pptx-"));
    try {
        const buffer = await createPptxBuffer(makeDeck(5, "Minecraft PvP"), 5);
        const file = path.join(directory, "minecraft-pvp.pptx");
        fs.writeFileSync(file, buffer, { flag: "wx" });
        const stats = fs.statSync(file);
        assert.ok(stats.isFile());
        assert.equal(stats.size, buffer.length);
        const checked = await verifyPptxBuffer(fs.readFileSync(file), 5);
        assert.equal(checked.slideCount, 5);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test("selected images are actually embedded on multiple content slides", async () => {
    const deck = makeDeck(5, "Solar System");
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-multi-slide-images-"));
    try {
        const sharp = require("sharp");
        const width = 1000;
        const height = 700;
        const raw = Buffer.alloc(width * height * 3);
        let seed = 7;
        for (let i = 0; i < raw.length; i++) {
            seed = (seed * 48271) % 2147483647;
            raw[i] = seed & 0xff;
        }
        const imagePath = path.join(tempDirectory, "topic.jpg");
        await sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 82 }).toFile(imagePath);
        deck.coverImage = { imagePath, imageTitle: "Solar System" };
        deck.slides.forEach((slide, index) => {
            slide.imagePath = imagePath;
            slide.imageTitle = `Planet scene ${index + 1}`;
        });
        const buffer = await createPptxBuffer(deck, 5);
        const zip = await JSZip.loadAsync(buffer);
        const verification = await verifyPptxBuffer(buffer, 5);
        const pictureSlides = [];
        const transitionSlides = [];
        for (let index = 1; index <= 5; index++) {
            const xml = await zip.file(`ppt/slides/slide${index}.xml`).async("string");
            if (xml.includes("<p:pic")) pictureSlides.push(index);
            if (xml.includes("<p:transition") && xml.includes("<p:fade")) transitionSlides.push(index);
        }
        assert.deepEqual(pictureSlides, [1, 2, 3, 4, 5]);
        assert.deepEqual(transitionSlides, [1, 2, 3, 4, 5]);
        assert.equal(verification.transitionCount, 5);
    } finally {
        fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
});

test("presentation uses a clean photo-first fallback instead of generated cartoon objects", async () => {
    const minecraftDeck = makeDeck(5, "Minecraft PvP");
    minecraftDeck.slides[0].visualCue = "Minecraft diamond sword PvP combat";
    const buffer = await createPptxBuffer(minecraftDeck, 5);
    const checked = await verifyPptxBuffer(buffer, 5);
    const zip = await JSZip.loadAsync(buffer);
    const cover = await zip.file("ppt/slides/slide1.xml").async("string");
    const content = await zip.file("ppt/slides/slide2.xml").async("string");
    assert.equal(checked.valid, true);
    assert.equal(checked.slideCount, 5);
    assert.doesNotMatch(cover, /prst="cube"/);
    assert.doesNotMatch(content, /prst="cube"/);
    assert.doesNotMatch(content, /MINECRAFT.*DIAMOND SWORD/);

    const blocksBuffer = await createPptxBuffer(makeDeck(5, "Minecraft Blocks"), 5);
    const blocksZip = await JSZip.loadAsync(blocksBuffer);
    const blocksSlide = await blocksZip.file("ppt/slides/slide2.xml").async("string");
    assert.doesNotMatch(blocksSlide, /MINECRAFT.*VOXEL BLOCKS/);

    const chairBuffer = await createPptxBuffer(makeDeck(5, "Chair Design"), 5);
    const chairZip = await JSZip.loadAsync(chairBuffer);
    const chairSlide = await chairZip.file("ppt/slides/slide2.xml").async("string");
    assert.doesNotMatch(chairSlide, /FURNITURE.*3D CHAIR MODEL/);
});

test("every slide gets its own topic-specific image search targets", () => {
    const deck = {
        title: "Minecraft",
        slides: [
            { title: "Combat", visualCue: "Minecraft diamond sword PvP combat" },
            { title: "Building", visualCue: "Minecraft grass blocks and crafting table" },
            { title: "Mining", visualCue: "Minecraft diamond pickaxe mining ore" }
        ]
    };
    const targets = buildPresentationImageTargets(deck, deck.slides.length);
    assert.equal(targets.length, 4);
    assert.deepEqual(targets.slice(1).map(target => target.index), [0, 1, 2]);
    assert.match(targets[1].searchQueries[1], /diamond sword/);
    assert.match(targets[2].searchQueries[1], /crafting table/);
    assert.match(targets[3].searchQueries[1], /pickaxe/);
    assert.equal(new Set(targets.slice(1).map(target => target.searchQueries[0])).size, 3);
});

test("square official app logos are accepted as presentation images", () => {
    const target = {
        kind: "slide", index: 0, query: "visual studio code logo",
        visualCue: "Visual Studio Code official logo", topicTokens: ["visual", "studio", "code"]
    };
    const image = {
        title: "Visual Studio Code logo",
        url: "https://upload.wikimedia.org/wikipedia/commons/9/9a/Visual_Studio_Code_1.35_icon.svg.png",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Visual_Studio_Code_1.35_icon.svg.png",
        mime: "image/png", width: 512, height: 512, provider: "Wikimedia Commons"
    };
    const selected = choosePresentationImages([target], [{ images: [image] }]);
    assert.equal(selected.length, 1);
    assert.equal(selected[0].image.title, image.title);
});

test("image placement ranks slide-specific art above a broad topic image", () => {
    const target = {
        kind: "slide", index: 2, query: "minecraft diamond sword pvp combat",
        visualCue: "Minecraft diamond sword PvP combat", topicTokens: ["minecraft"]
    };
    const generic = {
        title: "Minecraft logo", url: "https://images.example.test/minecraft-logo.jpg",
        sourceUrl: "https://example.test/minecraft", mime: "image/jpeg", width: 1600, height: 900
    };
    const specific = {
        ...generic, title: "Minecraft diamond sword combat", url: "https://images.example.test/diamond-sword.jpg"
    };
    const selected = choosePresentationImages([target], [{ images: [generic, specific] }]);
    assert.equal(selected.length, 1);
    assert.equal(selected[0].image.title, specific.title);
});

test("Minecraft slide imagery rejects a broad coffee-shop match when the cue asks for gameplay combat", () => {
    const target = {
        kind: "slide", index: 0, query: "Minecraft in-game PvP combat diamond sword shield",
        visualCue: "Minecraft in-game PvP combat diamond sword shield", topicTokens: ["minecraft"]
    };
    const unrelatedScene = {
        title: "Minecraft Coffee Shop", url: "https://images.example.test/coffee.jpg",
        sourceUrl: "https://flickr.com/photos/minecraft-coffee", mime: "image/jpeg", width: 1600, height: 900
    };
    const matchingScene = {
        ...unrelatedScene, title: "Minecraft PvP combat diamond sword", url: "https://images.example.test/combat.jpg"
    };
    const selected = choosePresentationImages([target], [{ images: [unrelatedScene, matchingScene] }]);
    assert.equal(selected.length, 1);
    assert.equal(selected[0].image.title, matchingScene.title);
});

test("cached Minecraft coffee-shop image is rejected for a gameplay-only slide cue", async () => {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-image-relevance-"));
    try {
        const sharp = require("sharp");
        const imagePath = path.join(cacheDir, "coffee.jpg");
        const raw = Buffer.alloc(400 * 400 * 3, 120);
        await sharp(raw, { raw: { width: 400, height: 400, channels: 3 } }).jpeg().toFile(imagePath);
        const target = {
            kind: "slide", index: 0, query: "minecraft gameplay combat",
            visualCue: "Minecraft gameplay combat screenshot", topicTokens: ["minecraft"]
        };
        cachePresentationImage(path.join(cacheDir, "library"), "Minecraft", {
            target, imagePath, imageTitle: "Minecraft Coffee Shop",
            imageSourceUrl: "https://example.test/minecraft-coffee-shop"
        });
        assert.deepEqual(getCachedPresentationImages(path.join(cacheDir, "library"), "Minecraft", [target]), []);
    } finally {
        fs.rmSync(cacheDir, { recursive: true, force: true });
    }
});

test("Commons resized images are not rejected for large original size or opaque upload names", () => {
    const target = { kind: "slide", index: 0, query: "minecraft gameplay", visualCue: "Minecraft gameplay screenshot", topicTokens: ["minecraft"] };
    const image = {
        title: "File:Screenshot 2024 05 01.png", url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Screenshot.png",
        thumbUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Screenshot.png/1280px-Screenshot.png",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Minecraft_Screenshot.png", mime: "image/jpeg", width: 1280, height: 720,
        byteSize: 80 * 1024 * 1024, provider: "Wikimedia Commons"
    };
    assert.equal(choosePresentationImages([target], [{ images: [image] }]).length, 1);
});

test("deck validation rejects a slide count mismatch and invalid count", () => {
    assert.throws(() => validateDeck(makeDeck(5), 6), /exactly 5 content slides/);
    assert.throws(() => validateDeck(makeDeck(5), 2), /between 3 and 30/);
});
