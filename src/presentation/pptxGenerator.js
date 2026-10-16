"use strict";

const PptxGenJS = require("pptxgenjs");
const JSZip = require("jszip");
const fs = require("fs");
const path = require("path");

const MIN_SLIDES = 3;
const MAX_SLIDES = 30;

function cleanText(value, max = 500) {
    return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
}

function containsDevanagari(value) {
    return /[\u0900-\u097f]/u.test(String(value || ""));
}

function estimatedTextWidthInEm(value) {
    const text = Array.from(String(value || ""));
    return text.reduce((width, character) => {
        if (/\s/u.test(character)) return width + 0.28;
        if (/[\u0900-\u097f]/u.test(character)) return width + 0.68;
        if (/[ilI.,'!|]/u.test(character)) return width + 0.3;
        if (/[MW@#%&]/u.test(character)) return width + 0.82;
        return width + 0.54;
    }, 0);
}

function fontSizeForWidth(value, widthInches, preferred, minimum = 12) {
    const widthPoints = Math.max(1, Number(widthInches) * 72 * 0.88);
    const estimatedEm = Math.max(1, estimatedTextWidthInEm(value));
    return Math.max(minimum, Math.min(preferred, Math.floor(widthPoints / estimatedEm)));
}

function validatedImagePath(value) {
    const filePath = typeof value === "string" ? value.slice(0, 1000) : "";
    if (!filePath || !/\.(?:png|jpe?g|gif)$/i.test(path.extname(filePath))) return "";
    try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile() || stat.size < 3000 || stat.size > 12 * 1024 * 1024) return "";
        const fd = fs.openSync(filePath, "r");
        const head = Buffer.alloc(8);
        try { fs.readSync(fd, head, 0, 8, 0); } finally { fs.closeSync(fd); }
        const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
        const isPng = head.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        const isGif = head.subarray(0, 6).toString("ascii").match(/^GIF8[79]a$/);
        const ext = path.extname(filePath).toLowerCase();
        return (ext === ".png" && isPng) || ((ext === ".jpg" || ext === ".jpeg") && isJpeg) || (ext === ".gif" && isGif) ? filePath : "";
    } catch (_) { return ""; }
}

function validateSlideCount(value = 10) {
    const count = Number(value);
    if (!Number.isInteger(count) || count < MIN_SLIDES || count > MAX_SLIDES) {
        throw new Error(`Choose between ${MIN_SLIDES} and ${MAX_SLIDES} total slides, including the title slide.`);
    }
    return count;
}

function validateDeck(value, requestedSlideCount = 10) {
    const totalSlides = validateSlideCount(requestedSlideCount);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The AI returned an invalid presentation outline.");
    const title = cleanText(value.title, 100);
    const subtitle = cleanText(value.subtitle, 180);
    const expectedContentSlides = totalSlides - 1;
    if (!title || !Array.isArray(value.slides) || value.slides.length !== expectedContentSlides) {
        throw new Error(`The presentation needs a title and exactly ${expectedContentSlides} content slides (${totalSlides} slides total).`);
    }
    const slides = value.slides.map((slide, index) => {
        if (!slide || typeof slide !== "object") throw new Error(`Slide ${index + 2} is invalid.`);
        const slideTitle = cleanText(slide.title, 100);
        const points = Array.isArray(slide.points) ? slide.points.map(point => cleanText(point, 240)).filter(Boolean).slice(0, 5) : [];
        if (!slideTitle || points.length < 2) throw new Error(`Slide ${index + 2} needs a heading and at least two concise points.`);
        const imagePath = validatedImagePath(slide.imagePath);
        const imageTitle = cleanText(slide.imageTitle, 240);
        const imageCredit = cleanText(slide.imageCredit, 500);
        const layouts = new Set(["feature", "process", "comparison", "grid", "takeaway", "chart"]);
        const chartInput = slide.chart && typeof slide.chart === "object" ? slide.chart : null;
        const chartLabels = Array.isArray(chartInput?.labels) ? chartInput.labels.map(label => cleanText(label, 42)).filter(Boolean).slice(0, 6) : [];
        const chartValues = Array.isArray(chartInput?.values) ? chartInput.values.slice(0, 6).map(Number) : [];
        const chartType = ["bar", "line", "doughnut"].includes(String(chartInput?.type || "").toLowerCase()) ? String(chartInput.type).toLowerCase() : "bar";
        const chart = chartLabels.length >= 2 && chartLabels.length === chartValues.length && chartValues.every(number => Number.isFinite(number) && number >= 0) && cleanText(chartInput?.source, 160)
            ? { title: cleanText(chartInput.title || slideTitle, 80), labels: chartLabels, values: chartValues, type: chartType, source: cleanText(chartInput.source, 160) }
            : null;
        return {
            title: slideTitle,
            points,
            notes: cleanText(slide.notes, 1200),
            visualCue: cleanText(slide.visualCue, 180),
            layout: layouts.has(String(slide.layout || "").toLowerCase()) && (String(slide.layout).toLowerCase() !== "chart" || chart) ? String(slide.layout).toLowerCase() : "",
            callout: cleanText(slide.callout, 220),
            leftTitle: cleanText(slide.leftTitle, 50),
            rightTitle: cleanText(slide.rightTitle, 50),
            chart,
            imagePath,
            imageTitle,
            imageCredit,
            imageAttribution: cleanText(slide.imageAttribution, 240),
            imageSourceUrl: /^https:\/\//i.test(String(slide.imageSourceUrl || "")) ? cleanText(slide.imageSourceUrl, 500) : "",
            imageRelevanceScore: Number.isFinite(slide.imageRelevanceScore) ? Math.max(0, Math.min(10, Number(slide.imageRelevanceScore))) : null
        };
    });
    const sourceUrl = /^https?:\/\//i.test(String(value.sourceUrl || "")) ? cleanText(value.sourceUrl, 500) : "";
    const sourceTitle = cleanText(value.sourceTitle || "", 120);
    const sourceCitations = Array.isArray(value.sourceCitations) ? value.sourceCitations.slice(0, 8).flatMap(item => {
        if (!item || typeof item !== "object") return [];
        const title = cleanText(item.title || item.source || "Research source", 160);
        const url = /^https:\/\//i.test(String(item.url || "")) ? cleanText(item.url, 500) : "";
        return url ? [{ title, url }] : [];
    }) : [];
    const coverImage = value.coverImage && typeof value.coverImage === "object" ? {
        imagePath: validatedImagePath(value.coverImage.imagePath),
        imageTitle: cleanText(value.coverImage.imageTitle, 240),
        imageCredit: cleanText(value.coverImage.imageCredit, 500),
        imageAttribution: cleanText(value.coverImage.imageAttribution, 240),
        imageSourceUrl: /^https:\/\//i.test(String(value.coverImage.imageSourceUrl || "")) ? cleanText(value.coverImage.imageSourceUrl, 500) : "",
        imageRelevanceScore: Number.isFinite(value.coverImage.imageRelevanceScore) ? Math.max(0, Math.min(10, Number(value.coverImage.imageRelevanceScore))) : null
    } : null;
    const language = /^(hi|hinglish|en)$/i.test(String(value.language || ""))
        ? String(value.language).toLowerCase()
        : (containsDevanagari([title, subtitle, ...slides.flatMap(slide => [slide.title, ...slide.points])].join(" ")) ? "hi" : "en");
    return { title, subtitle, slides, sourceTitle, sourceUrl, sourceCitations, totalSlides, coverImage, language };
}

function themeFor(topic) {
    const text = String(topic || "").toLowerCase();
    if (/minecraft|gaming|game|pvp|esports/.test(text)) return { bg: "F5F7F3", panel: "FFFFFF", line: "D9E2D8", accent: "327A58", accent2: "B47A3C", text: "1E2C25", muted: "627268", label: "GAME DESIGN  /  BRIEFING" };
    if (/cyber|security|privacy|network|software|technology|artificial intelligence|\bai\b/.test(text)) return { bg: "F4F7FA", panel: "FFFFFF", line: "D9E2EA", accent: "236A8A", accent2: "B27D36", text: "182B39", muted: "5D7180", label: "TECHNOLOGY  /  BRIEFING" };
    if (/class\s*\d|school|student|education|science|solar system|pollution|history/.test(text)) return { bg: "F7F8F6", panel: "FFFFFF", line: "E0E4DF", accent: "376C69", accent2: "B47A3C", text: "22312F", muted: "687774", label: "LEARNING  /  PRESENTATION" };
    if (/business|market|company|project|strategy|finance/.test(text)) return { bg: "F6F7F9", panel: "FFFFFF", line: "DEE3E8", accent: "2C5D78", accent2: "B18445", text: "1F2D39", muted: "65727D", label: "STRATEGY  /  OVERVIEW" };
    return { bg: "F5F7F9", panel: "FFFFFF", line: "DCE3E8", accent: "316B72", accent2: "B27D42", text: "202D38", muted: "64727C", label: "JARVIS  /  PRESENTATION" };
}

function addBackground(slide, color) {
    slide.background = { color };
    slide.addShape("rect", { x: 0, y: 0, w: 13.333, h: 0.12, line: { color, transparency: 100 }, fill: { color } });
}

function addFooter(slide, index, total, theme) {
    slide.addShape("line", { x: 0.72, y: 7.03, w: 11.88, h: 0, line: { color: theme.accent, transparency: 70, width: 0.8 } });
    slide.addText("JARVIS  /  KNOWLEDGE, CLEARLY PRESENTED", { x: 0.74, y: 7.1, w: 7.5, h: 0.18, margin: 0, fontFace: theme.bodyFontFace, fontSize: 8, charSpacing: 1, color: theme.muted, breakLine: false });
    slide.addText(`${String(index).padStart(2, "0")}  /  ${String(total).padStart(2, "0")}`, { x: 11.45, y: 7.07, w: 1.1, h: 0.22, margin: 0, align: "right", fontFace: theme.bodyFontFace, fontSize: 9, bold: true, color: theme.accent });
}

function addSmartImage(slide, item, x, y, w, h, theme, altText) {
    // Keep a consistent visual frame while preserving the source aspect ratio.
    // `cover` made portraits and square assets crop unpredictably; `contain`
    // keeps the whole image visible and lets the frame provide the alignment.
    slide.addShape("roundRect", { x, y, w, h, rectRadius: 0.06, line: { color: theme.line, width: 0.7 }, fill: { color: theme.panel } });
    slide.addImage({ path: item.imagePath, x: x + 0.06, y: y + 0.06, w: Math.max(0.1, w - 0.12), h: Math.max(0.1, h - 0.12), sizing: { type: "contain", w: Math.max(0.1, w - 0.12), h: Math.max(0.1, h - 0.12) }, altText });
}

// Visual artwork must come from a validated, locally embedded topic image.

function addCover(pptx, deck, theme) {
    const slide = pptx.addSlide();
    addBackground(slide, theme.bg);
    slide.addShape("rect", { x: 0.84, y: 1.14, w: 0.08, h: 4.25, line: { color: theme.accent, transparency: 100 }, fill: { color: theme.accent } });
    slide.addText(theme.label, { x: 1.18, y: 1.2, w: 9.8, h: 0.3, margin: 0, fontFace: theme.bodyFontFace, fontSize: 10, bold: true, charSpacing: 1.6, color: theme.accent });
    if (deck.coverImage?.imagePath) {
        addSmartImage(slide, deck.coverImage, 7.12, 1.42, 5.28, 3.88, theme, deck.coverImage.imageTitle || deck.title);
        if (deck.coverImage.imageTitle) slide.addText(deck.coverImage.imageTitle.slice(0, 84), { x: 7.14, y: 5.35, w: 5.2, h: 0.18, margin: 0, fontFace: theme.bodyFontFace, fontSize: 8, color: theme.muted, breakLine: false, fit: "shrink" });
        if (deck.coverImage.imageAttribution) slide.addText(deck.coverImage.imageAttribution.slice(0, 120), { x: 7.14, y: 5.55, w: 5.2, h: 0.18, margin: 0, fontFace: theme.bodyFontFace, fontSize: 7, color: theme.muted, breakLine: false, fit: "shrink", ...(deck.coverImage.imageSourceUrl ? { hyperlink: { url: deck.coverImage.imageSourceUrl } } : {}) });
    }
    const coverHasImage = Boolean(deck.coverImage?.imagePath);
    const coverTextWidth = coverHasImage ? 5.45 : 10.5;
    const subtitleText = deck.subtitle || `A clear, practical introduction to ${deck.title}`;
    slide.addText(deck.title, { x: 1.18, y: 2.0, w: coverTextWidth, h: 1.55, margin: 0, fontFace: theme.headFontFace, fontSize: fontSizeForWidth(deck.title, coverTextWidth, 38, 20), bold: true, color: theme.text, breakLine: false, valign: "mid", fit: "shrink", charSpacing: 0 });
    slide.addText(subtitleText, { x: 1.2, y: 3.76, w: coverHasImage ? 5.35 : 9.5, h: 0.82, margin: 0, fontFace: theme.bodyFontFace, fontSize: fontSizeForWidth(subtitleText, coverHasImage ? 5.35 : 9.5, 18, 11), color: theme.muted, breakLine: false, valign: "top", fit: "shrink", charSpacing: 0 });
    slide.addShape("line", { x: 1.2, y: 5.18, w: coverHasImage ? 5.5 : 9.2, h: 0, line: { color: theme.accent2, transparency: 25, width: 2 } });
    addFooter(slide, 1, deck.totalSlides, theme);
    const imageNotes = deck.coverImage?.imageTitle ? `Cover image: ${deck.coverImage.imageTitle}${deck.coverImage.imageAttribution ? `\n${deck.coverImage.imageAttribution}` : ""}${deck.coverImage.imageCredit ? `\n${deck.coverImage.imageCredit}` : ""}` : "";
    const sourceNotes = (deck.sourceCitations || []).map(source => `${source.title}\n${source.url}`);
    const notes = [deck.sourceTitle && deck.sourceUrl ? `Source: ${deck.sourceTitle}\n${deck.sourceUrl}` : "", sourceNotes.length ? `Research sources:\n${sourceNotes.join("\n\n")}` : "", imageNotes, "Presentation content prepared by JARVIS."].filter(Boolean).join("\n\n");
    if (notes) slide.addNotes(notes);
}

function addPoint(slide, point, index, x, y, w, h, theme, options = {}) {
    const text = cleanText(point, 240);
    const split = text.match(/^([^:]{3,44}):\s*(.+)$/);
    const title = options.title || (split ? split[1] : "");
    const body = options.body || (split ? split[2] : text);
    if (options.card) {
        slide.addShape("roundRect", { x, y, w, h, rectRadius: 0.08, line: { color: theme.line, width: 0.8 }, fill: { color: theme.panel } });
        slide.addShape("rect", { x, y, w: 0.07, h, line: { color: theme.accent, transparency: 100 }, fill: { color: theme.accent } });
        if (title) {
            slide.addText(title, { x: x + 0.22, y: y + 0.16, w: w - 0.4, h: 0.35, margin: 0, fontFace: theme.headFontFace, fontSize: fontSizeForWidth(title, w - 0.4, 16, 11), bold: true, color: theme.text, fit: "shrink" });
            slide.addText(body, { x: x + 0.22, y: y + 0.58, w: w - 0.4, h: h - 0.72, margin: 0, fontFace: theme.bodyFontFace, fontSize: 12, color: theme.muted, valign: "top", fit: "shrink" });
        } else {
            slide.addText(body, { x: x + 0.22, y: y + 0.18, w: w - 0.42, h: h - 0.34, margin: 0, fontFace: theme.bodyFontFace, fontSize: fontSizeForWidth(body, w - 0.42, 15, 10), color: theme.text, valign: "mid", fit: "shrink" });
        }
        return;
    }
    slide.addShape("ellipse", { x, y: y + 0.08, w: 0.34, h: 0.34, line: { color: theme.accent, width: 1.3 }, fill: { color: theme.bg } });
    slide.addText(String(index + 1).padStart(2, "0"), { x, y: y + 0.17, w: 0.34, h: 0.13, margin: 0, align: "center", fontFace: theme.bodyFontFace, fontSize: 7, bold: true, color: theme.accent });
    slide.addText(title || body, { x: x + 0.52, y, w: w - 0.52, h: title ? 0.32 : h, margin: 0, fontFace: title ? theme.headFontFace : theme.bodyFontFace, fontSize: fontSizeForWidth(title || body, w - 0.52, title ? 15 : 14, 10), bold: Boolean(title), color: theme.text, valign: "mid", fit: "shrink" });
    if (title) slide.addText(body, { x: x + 0.52, y: y + 0.38, w: w - 0.52, h: Math.max(0.28, h - 0.38), margin: 0, fontFace: theme.bodyFontFace, fontSize: fontSizeForWidth(body, w - 0.52, 12, 9), color: theme.muted, valign: "top", fit: "shrink" });
}

function addSlideImage(slide, item, x, y, w, h, theme) {
    if (!item.imagePath) return false;
    addSmartImage(slide, item, x, y, w, h, theme, item.imageTitle || item.title);
    if (item.imageTitle) slide.addText(item.imageTitle.slice(0, 80), { x, y: y + h + 0.07, w, h: 0.16, margin: 0, fontFace: theme.bodyFontFace, fontSize: 7.5, color: theme.muted, breakLine: false, fit: "shrink" });
    if (item.imageAttribution) slide.addText(item.imageAttribution.slice(0, 100), { x, y: y + h + 0.24, w, h: 0.14, margin: 0, fontFace: theme.bodyFontFace, fontSize: 6.5, color: theme.muted, breakLine: false, fit: "shrink", ...(item.imageSourceUrl ? { hyperlink: { url: item.imageSourceUrl } } : {}) });
    return true;
}

function addContentSlide(pptx, item, index, deck, theme) {
    const slide = pptx.addSlide();
    const fallbackLayouts = ["feature", "grid", "process", "comparison", "takeaway"];
    const layout = item.layout || fallbackLayouts[(index - 2) % fallbackLayouts.length];
    addBackground(slide, theme.bg);
    slide.addText(theme.label, { x: 0.78, y: 0.45, w: 9.8, h: 0.2, margin: 0, fontFace: theme.bodyFontFace, fontSize: 8, bold: true, charSpacing: 1.6, color: theme.accent });
    slide.addText(item.title, { x: 0.76, y: 0.82, w: 11.8, h: 0.72, margin: 0, fontFace: theme.headFontFace, fontSize: fontSizeForWidth(item.title, 11.8, 27, 17), bold: true, color: theme.text, fit: "shrink", valign: "mid", charSpacing: 0 });
    slide.addShape("line", { x: 0.78, y: 1.68, w: 1.05, h: 0, line: { color: theme.accent, width: 2.4 } });
    const points = item.points.slice(0, 5);
    if (layout === "process") {
        const gap = 0.22;
        const cardW = (11.76 - gap * (points.length - 1)) / points.length;
        const nodeY = 2.25;
        slide.addShape("line", { x: 1.2, y: nodeY + 0.18, w: 10.9, h: 0, line: { color: theme.line, width: 2 } });
        points.forEach((point, i) => addPoint(slide, point, i, 0.78 + i * (cardW + gap), 2.48, cardW, 1.42, theme, { card: true }));
        if (item.imagePath) addSlideImage(slide, item, 0.82, 4.35, 11.7, 1.55, theme);
    } else if (layout === "grid") {
        const hasImage = Boolean(item.imagePath);
        const imgX = 8.55;
        const gridW = hasImage ? 7.45 : 11.76;
        const gapX = 0.18;
        const cardW = (gridW - gapX) / 2;
        const cardH = points.length > 2 ? 1.48 : 1.8;
        points.forEach((point, i) => {
            const col = i % 2;
            const row = Math.floor(i / 2);
            addPoint(slide, point, i, 0.82 + col * (cardW + gapX), 2.08 + row * (cardH + 0.18), cardW, cardH, theme, { card: true });
        });
        if (hasImage) addSlideImage(slide, item, imgX, 2.1, 3.95, 3.65, theme);
    } else if (layout === "comparison") {
        const halfW = 5.72;
        const split = Math.ceil(points.length / 2);
        const left = points.slice(0, split);
        const right = points.slice(split);
        slide.addText(item.leftTitle || "CORE IDEA", { x: 0.92, y: 2.05, w: halfW, h: 0.3, margin: 0, fontFace: theme.bodyFontFace, fontSize: 10, bold: true, charSpacing: 1, color: theme.accent });
        slide.addText(item.rightTitle || "IN PRACTICE", { x: 6.98, y: 2.05, w: halfW, h: 0.3, margin: 0, fontFace: theme.bodyFontFace, fontSize: 10, bold: true, charSpacing: 1, color: theme.accent });
        slide.addShape("roundRect", { x: 0.82, y: 2.42, w: halfW, h: item.imagePath ? 2.86 : 3.24, rectRadius: 0.08, line: { color: theme.line, width: 0.8 }, fill: { color: theme.panel } });
        slide.addShape("roundRect", { x: 6.82, y: 2.42, w: halfW, h: item.imagePath ? 2.86 : 3.24, rectRadius: 0.08, line: { color: theme.line, width: 0.8 }, fill: { color: theme.panel } });
        left.forEach((point, i) => addPoint(slide, point, i, 1.12, 2.72 + i * 1.05, 5.15, 0.9, theme));
        right.forEach((point, i) => addPoint(slide, point, i + split, 7.12, 2.72 + i * 1.05, 5.15, 0.9, theme));
        if (item.imagePath) addSlideImage(slide, item, 0.82, 5.55, 11.72, 0.92, theme);
    } else if (layout === "takeaway") {
        const hasImage = Boolean(item.imagePath);
        if (hasImage) addSlideImage(slide, item, 0.86, 2.08, 5.42, 3.58, theme);
        const callout = item.callout || points[0] || item.title;
        const copyX = hasImage ? 6.72 : 1.05;
        const copyW = hasImage ? 5.62 : 11.1;
        slide.addText(callout, { x: copyX, y: 2.13, w: copyW, h: 1.38, margin: 0, fontFace: theme.headFontFace, fontSize: fontSizeForWidth(callout, copyW, 24, 14), bold: true, color: theme.accent, valign: "mid", fit: "shrink" });
        points.slice(1).forEach((point, i) => addPoint(slide, point, i, copyX + 0.04, 3.78 + i * 0.75, copyW - 0.08, 0.66, theme));
    } else if (layout === "chart" && item.chart) {
        const chartW = item.imagePath ? 7.25 : 8.25;
        const chartType = item.chart.type === "line" ? pptx.ChartType.line : item.chart.type === "doughnut" ? pptx.ChartType.doughnut : pptx.ChartType.bar;
        const chartData = [{ name: item.chart.title, labels: item.chart.labels, values: item.chart.values }];
        slide.addChart(chartType, chartData, {
            x: 0.82, y: 2.0, w: chartW, h: 4.45,
            showTitle: false, showLegend: false, showValue: true,
            showCatName: false, showSerName: false,
            catAxisLabelFontFace: "Aptos", catAxisLabelFontSize: 10, catAxisLabelColor: theme.muted,
            valAxisLabelFontFace: "Aptos", valAxisLabelFontSize: 9, valAxisLabelColor: theme.muted,
            valAxisLineShow: false, valGridLine: { color: theme.line, width: 0.7 },
            chartColors: [theme.accent, theme.accent2, "7197A1", "9AB7A5", "D4B679", "90A6C2"],
            showBorder: false, showCatName: false,
            dataLabelPosition: "outEnd", dataLabelColor: theme.text, dataLabelFormatCode: "0.##",
            showLeaderLines: item.chart.type === "doughnut",
            showPercent: item.chart.type === "doughnut",
            chartArea: { fill: { color: theme.bg, transparency: 100 }, border: { color: theme.bg, transparency: 100 } },
            plotArea: { fill: { color: theme.bg, transparency: 100 }, border: { color: theme.bg, transparency: 100 } }
        });
        if (item.imagePath) addSlideImage(slide, item, 8.42, 2.12, 4.05, 2.48, theme);
        points.slice(0, 3).forEach((point, i) => addPoint(slide, point, i, 8.48, (item.imagePath ? 4.93 : 2.12) + i * 0.62, 3.95, 0.56, theme));
        slide.addText(`Source: ${item.chart.source}`, { x: 0.84, y: 6.58, w: 8.0, h: 0.18, margin: 0, fontFace: theme.bodyFontFace, fontSize: 8, color: theme.muted, fit: "shrink" });
    } else {
        const hasImage = Boolean(item.imagePath);
        const imageOnLeft = index % 2 === 0;
        const imageX = imageOnLeft ? 0.82 : 7.62;
        const textX = hasImage ? (imageOnLeft ? 6.55 : 1.18) : 1.18;
        const textW = hasImage ? (imageOnLeft ? 5.8 : 5.95) : 11.0;
        if (hasImage) addSlideImage(slide, item, imageX, 2.08, 4.85, 3.42, theme);
        const rowGap = points.length > 3 ? 0.87 : 1.04;
        points.forEach((point, i) => addPoint(slide, point, i, textX, 2.12 + i * rowGap, textW, rowGap - 0.04, theme));
    }
    addFooter(slide, index, deck.totalSlides, theme);
    const sourceNotes = (deck.sourceCitations || []).map(source => `${source.title}\n${source.url}`);
    const notes = [item.notes, item.chart ? `Chart source: ${item.chart.source}` : "", deck.sourceTitle && deck.sourceUrl ? `Source: ${deck.sourceTitle}\n${deck.sourceUrl}` : "", sourceNotes.length ? `Research sources:\n${sourceNotes.join("\n\n")}` : "", item.imageTitle ? `Slide image: ${item.imageTitle}${item.imageAttribution ? `\n${item.imageAttribution}` : ""}${item.imageCredit ? `\n${item.imageCredit}` : ""}${item.imageSourceUrl ? `\n${item.imageSourceUrl}` : ""}` : ""].filter(Boolean).join("\n\n");
    if (notes) slide.addNotes(notes);
}

async function verifyPptxBuffer(buffer, expectedSlides, deck = null) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 6000) throw new Error("The generated PPTX is empty or too small to be a valid presentation.");
    let zip;
    try { zip = await JSZip.loadAsync(buffer, { checkCRC32: true }); }
    catch (error) { throw new Error(`The generated PPTX archive could not be opened: ${error.message}`); }
    const contentTypes = zip.file("[Content_Types].xml");
    const presentation = zip.file("ppt/presentation.xml");
    if (!contentTypes || !presentation) throw new Error("The generated file is missing required PowerPoint package parts.");
    const [contentXml, presentationXml] = await Promise.all([contentTypes.async("string"), presentation.async("string")]);
    if (!contentXml.includes("presentationml.presentation.main+xml") || !presentationXml.includes("<p:presentation")) {
        throw new Error("The generated file is not a readable PowerPoint presentation.");
    }
    const slideCount = (presentationXml.match(/<p:sldId\s/g) || []).length;
    if (slideCount !== expectedSlides) throw new Error(`The saved package contains ${slideCount} slides; ${expectedSlides} were requested.`);
    let transitionCount = 0;
    let slidesWithImages = 0;
    const slideReports = [];
    const slideWidthEmu = 12192000;
    const slideHeightEmu = 6858000;
    const outOfBoundsSlides = [];
    const emptySlides = [];
    for (let index = 1; index <= slideCount; index += 1) {
        const slide = zip.file(`ppt/slides/slide${index}.xml`);
        if (!slide) throw new Error(`PowerPoint package is missing slide ${index}.`);
        const xml = await slide.async("string");
        if (!xml.includes("<p:sld") || !xml.includes("</p:sld>")) throw new Error(`PowerPoint slide ${index} is not readable.`);
        if (/<p:transition\b/.test(xml)) transitionCount += 1;
        const hasImage = /<a:blip\b/.test(xml);
        if (hasImage) slidesWithImages += 1;
        const textValues = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(match => match[1]
            .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
            .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))));
        const textCharacters = textValues.join(" ").trim().length;
        const visual = index === 1 ? deck?.coverImage : deck?.slides?.[index - 2];
        const imageRelevanceScore = Number.isFinite(visual?.imageRelevanceScore) ? visual.imageRelevanceScore : null;
        // Inspect authored shape geometry in the PPTX package. This catches
        // objects positioned beyond the 16:9 canvas without claiming to be a
        // substitute for a real PowerPoint render.
        const slideTree = xml.match(/<p:spTree\b[\s\S]*?<\/p:spTree>/)?.[0] || "";
        let geometryIssues = 0;
        for (const shape of slideTree.matchAll(/<(?:p:sp|p:pic|p:graphicFrame)\b[\s\S]*?<\/p:(?:sp|pic|graphicFrame)>/g)) {
            const transform = shape[0].match(/<a:xfrm\b[\s\S]*?<\/a:xfrm>/)?.[0];
            const offset = transform?.match(/<a:off\b[^>]*\bx="(-?\d+)"[^>]*\by="(-?\d+)"/);
            const extent = transform?.match(/<a:ext\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/);
            if (!offset || !extent) continue;
            const x = Number(offset[1]), y = Number(offset[2]);
            const width = Number(extent[1]), height = Number(extent[2]);
            if (x < 0 || y < 0 || x + width > slideWidthEmu || y + height > slideHeightEmu) geometryIssues += 1;
        }
        if (geometryIssues) outOfBoundsSlides.push({ slide: index, objects: geometryIssues });
        if (!textCharacters && !hasImage) emptySlides.push(index);
        slideReports.push({ slide: index, hasImage, textCharacters, textBoxCount: textValues.length, imageRelevanceScore, geometryIssues });
    }
    if (transitionCount !== slideCount) throw new Error(`PowerPoint contains transitions on ${transitionCount} of ${slideCount} slides.`);
    // PptxGenJS versions use both image1.png and image-1.png naming. Count
    // both forms so actual embedded images are not misreported as missing.
    const mediaFiles = Object.keys(zip.files).filter(name => /^ppt\/media\/image(?:-?\d+)(?:-\d+)*\.(?:png|jpe?g|gif)$/i.test(name));
    const imageHashes = new Set();
    let duplicateImageCount = 0;
    for (const name of mediaFiles) {
        const media = await zip.file(name).async("nodebuffer");
        const isJpeg = media.length >= 3 && media[0] === 0xff && media[1] === 0xd8 && media[2] === 0xff;
        const isPng = media.length >= 8 && media.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        const isGif = media.length >= 6 && /^GIF8[79]a$/.test(media.subarray(0, 6).toString("ascii"));
        if (!isJpeg && !isPng && !isGif) throw new Error(`PowerPoint image ${name} is not a valid JPEG, PNG, or GIF.`);
        const hash = require("node:crypto").createHash("sha256").update(media).digest("hex");
        if (imageHashes.has(hash)) duplicateImageCount += 1;
        imageHashes.add(hash);
    }
    const slidesWithoutImages = slideCount - slidesWithImages;
    const warnings = [];
    if (!mediaFiles.length) warnings.push("No images were embedded; the presentation is still readable.");
    if (slidesWithImages < Math.ceil(slideCount * 0.35)) warnings.push(`Images appear on only ${slidesWithImages} of ${slideCount} slides.`);
    const denseSlides = slideReports.filter(item => item.textCharacters > 420);
    if (denseSlides.length) warnings.push(`Possible text-density issue on slide(s): ${denseSlides.map(item => item.slide).join(", ")}.`);
    const weakMatchSlides = slideReports.filter(item => item.hasImage && item.imageRelevanceScore !== null && item.imageRelevanceScore < 7);
    if (weakMatchSlides.length) warnings.push(`Image search estimated a weak topic match on slide(s): ${weakMatchSlides.map(item => item.slide).join(", ")}; review them in the preview.`);
    if (duplicateImageCount) warnings.push(`${duplicateImageCount} duplicate embedded image file(s) detected.`);
    if (outOfBoundsSlides.length) warnings.push(`Possible off-slide objects detected on slide(s): ${outOfBoundsSlides.map(item => item.slide).join(", ")}. Review the rendered preview.`);
    if (emptySlides.length) warnings.push(`No text or image content was detected on slide(s): ${emptySlides.join(", ")}.`);
    return {
        valid: true, slideCount, size: buffer.length, imageCount: mediaFiles.length, transitionCount,
        slidesWithImages, slidesWithoutImages, imageCoverage: slideCount ? Math.round((slidesWithImages / slideCount) * 100) : 0,
        duplicateImageCount, outOfBoundsSlides, emptySlides, slideReports,
        visualCheck: "PPTX object bounds and content were inspected. This structural check cannot confirm final typography, clipping, or image appearance; use the PowerPoint-rendered preview when available.", warnings
    };
}

async function addProfessionalTransitions(buffer, slideCount) {
    const zip = await JSZip.loadAsync(buffer, { checkCRC32: true });
    // Keep the motion quiet and consistent across the deck. Mixing unrelated
    // wipes, pushes and covers made the presentation feel less polished.
    const transition = '<p:transition spd="fast"><p:fade/></p:transition>';
    for (let index = 1; index <= slideCount; index += 1) {
        const filename = `ppt/slides/slide${index}.xml`;
        const entry = zip.file(filename);
        if (!entry) throw new Error(`PowerPoint package is missing slide ${index} while adding transitions.`);
        let xml = await entry.async("string");
        if (!/<p:transition\b/.test(xml)) {
            const colorMap = /(<p:clrMapOvr\b[\s\S]*?<\/p:clrMapOvr>)/;
            const commonSlideData = /(<p:cSld\b[\s\S]*?<\/p:cSld>)/;
            if (colorMap.test(xml)) xml = xml.replace(colorMap, `$1${transition}`);
            else if (commonSlideData.test(xml)) xml = xml.replace(commonSlideData, `$1${transition}`);
            else throw new Error(`Could not add a slide transition to slide ${index}.`);
            zip.file(filename, xml);
        }
    }
    return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

async function createPptxBuffer(input, requestedSlideCount = 10) {
    const deck = validateDeck(input, requestedSlideCount);
    const theme = themeFor(deck.title);
    const hasDevanagari = containsDevanagari([deck.title, deck.subtitle, ...deck.slides.flatMap(slide => [slide.title, ...slide.points])].join(" "));
    theme.headFontFace = hasDevanagari ? "Nirmala UI" : "Aptos Display";
    theme.bodyFontFace = hasDevanagari ? "Nirmala UI" : "Aptos";
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    pptx.author = "JARVIS";
    pptx.subject = `Presentation about ${deck.title}`;
    pptx.title = deck.title;
    pptx.company = "JARVIS";
    const officeLanguage = deck.language === "hi" || hasDevanagari ? "hi-IN" : "en-US";
    pptx.lang = officeLanguage;
    pptx.theme = { headFontFace: theme.headFontFace, bodyFontFace: theme.bodyFontFace, lang: officeLanguage };
    pptx.defineSlideMaster({
        title: "JARVIS_BASE",
        background: { color: theme.bg },
        objects: [{ rect: { x: 0, y: 0, w: 0.16, h: 7.5, line: { color: theme.bg, transparency: 100 }, fill: { color: theme.bg } } }],
        slideNumber: { x: 12.1, y: 7.08, w: 0.35, h: 0.16, color: theme.accent, fontFace: theme.bodyFontFace, fontSize: 8 }
    });
    addCover(pptx, deck, theme);
    deck.slides.forEach((item, index) => addContentSlide(pptx, item, index + 2, deck, theme));
    const output = await pptx.write({ outputType: "nodebuffer", compression: true });
    const initialBuffer = Buffer.isBuffer(output) ? output : Buffer.from(output);
    const buffer = await addProfessionalTransitions(initialBuffer, deck.totalSlides);
    await verifyPptxBuffer(buffer, deck.totalSlides);
    return buffer;
}

module.exports = { createPptxBuffer, validateDeck, validateSlideCount, verifyPptxBuffer, addProfessionalTransitions, MIN_SLIDES, MAX_SLIDES };
