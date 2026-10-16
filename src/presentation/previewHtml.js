"use strict";

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function imageMarkup(image, alt) {
    if (!image?.imagePath || !fs.existsSync(image.imagePath)) return `<div class="image-placeholder">Topic image unavailable</div>`;
    return `<img src="${escapeHtml(pathToFileURL(image.imagePath).href)}" alt="${escapeHtml(image.imageTitle || alt)}">`;
}

function slideMarkup(item, index, deck, isCover = false) {
    const title = isCover ? deck.title : item.title;
    const points = isCover ? [] : (item.points || []).slice(0, 5);
    const image = isCover ? deck.coverImage : item;
    const imageHtml = imageMarkup(image, title);
    const pointHtml = points.map((point, position) => `<div class="point"><span>${String(position + 1).padStart(2, "0")}</span><p>${escapeHtml(point)}</p></div>`).join("");
    const subtitle = isCover ? `<p class="subtitle">${escapeHtml(deck.subtitle || `A clear introduction to ${deck.title}`)}</p>` : "";
    const label = isCover ? "JARVIS · PRESENTATION" : escapeHtml(item.layout || "FEATURE").toUpperCase();
    const body = isCover
        ? `<div class="cover-copy"><small>${label}</small><h2>${escapeHtml(title)}</h2>${subtitle}</div>${imageHtml}`
        : `<small>${label}</small><h2>${escapeHtml(title)}</h2><div class="content-layout ${image?.imagePath ? "with-image" : "text-only"}"><div class="points">${pointHtml}</div>${image?.imagePath ? `<figure>${imageHtml}<figcaption>${escapeHtml(image.imageTitle || "Topic image")}</figcaption></figure>` : ""}</div>`;
    return `<article class="slide ${isCover ? "cover" : ""}"><div class="slide-content">${body}</div><footer><span>JARVIS · ${escapeHtml(deck.title)}</span><b>${String(index + 1).padStart(2, "0")} / ${String(deck.totalSlides).padStart(2, "0")}</b></footer></article>`;
}

function writePresentationPreview(outputPath, deck, quality) {
    const totalSlides = Number.isInteger(Number(deck?.totalSlides)) && Number(deck.totalSlides) > 0
        ? Number(deck.totalSlides)
        : (Array.isArray(deck?.slides) ? deck.slides.length : 0) + 1;
    const previewDeck = { ...deck, totalSlides };
    const warnings = Array.isArray(quality?.warnings) ? quality.warnings : [];
    const warningMarkup = warnings.length
        ? `<ul class="warnings">${warnings.map(warning => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`
        : `<p class="good">No structural or image coverage warnings.</p>`;
    const slideReports = Array.isArray(quality?.slideReports) ? quality.slideReports : [];
    const previewIssues = Array.isArray(quality?.previewLayoutCheck?.issues) ? quality.previewLayoutCheck.issues : [];
    const previewIssueSlides = new Set(previewIssues.map(item => Number(item.slide)));
    const slideReportMarkup = slideReports.length
        ? `<details class="slide-report"><summary>Slide-by-slide quality · ${slideReports.length} slides</summary><div class="report-table-wrap"><table><thead><tr><th>Slide</th><th>Image</th><th>Match estimate</th><th>Text length</th><th>Layout check</th><th>Off-slide objects</th></tr></thead><tbody>${slideReports.map(item => `<tr><td>${item.slide}</td><td>${item.hasImage ? "Added" : "None"}</td><td>${item.imageRelevanceScore === null ? "Not scored" : `${Math.round(item.imageRelevanceScore)} · ${item.imageRelevanceScore < 7 ? "Review match" : "Candidate selected"}`}</td><td>${item.textCharacters} characters</td><td>${previewIssueSlides.has(Number(item.slide)) ? "Review preview warning" : item.textCharacters > 420 ? "Review dense text" : "Within heuristic"}</td><td>${item.geometryIssues ? `${item.geometryIssues} beyond canvas` : "None detected"}</td></tr>`).join("")}</tbody></table></div><p>Object bounds are checked from the PPTX structure, not from a PowerPoint render. Match estimates are based on search-result text; they cannot guarantee visual relevance. Text length is a layout heuristic.</p></details>`
        : "";
    const slides = [slideMarkup({}, 0, previewDeck, true), ...(previewDeck.slides || []).map((slide, index) => slideMarkup(slide, index + 1, previewDeck))].join("");
    const hasDevanagari = /[\u0900-\u097f]/u.test([previewDeck.title, previewDeck.subtitle, ...(previewDeck.slides || []).flatMap(slide => [slide.title, ...(slide.points || [])])].join(" "));
    const slideFont = hasDevanagari ? '"Nirmala UI","Noto Sans Devanagari","Segoe UI",sans-serif' : '"Segoe UI",Arial,sans-serif';
    const html = `<!doctype html><html lang="${hasDevanagari ? "hi" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(deck.title)} · Slide preview</title><style>
*{box-sizing:border-box}body{margin:0;background:#0a111a;color:#eaf1f5;font:14px/1.5 "Segoe UI",Arial,sans-serif}.top{position:sticky;top:0;z-index:2;padding:20px clamp(18px,4vw,54px);background:rgba(10,17,26,.94);border-bottom:1px solid #263746;backdrop-filter:blur(10px)}h1{margin:0;font-size:22px}.top p{margin:4px 0 0;color:#9fb0bc}.report{margin:18px auto 28px;max-width:1120px;padding:0 20px}.metrics{display:flex;gap:12px;flex-wrap:wrap}.metric{min-width:150px;padding:12px 15px;border:1px solid #273b48;border-radius:10px;background:#111d28}.metric b{display:block;font-size:20px}.metric span{color:#9fb0bc;font-size:11px}.warnings{color:#f2c46b}.good{color:#95d9b7}.slide-report{margin-top:14px;border:1px solid #263746;border-radius:10px;background:#111d28;padding:12px 15px}.slide-report summary{cursor:pointer;color:#a9dfe5;font-weight:600}.report-table-wrap{overflow:auto}.slide-report table{width:100%;margin-top:12px;border-collapse:collapse;text-align:left}.slide-report th,.slide-report td{padding:8px;border-bottom:1px solid #263746;color:#c5d3d9}.slide-report p{margin:10px 0 0;color:#91a5af;font-size:11px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,500px),1fr));gap:22px;max-width:1120px;margin:0 auto 48px;padding:0 20px}.slide{position:relative;aspect-ratio:16/9;overflow:hidden;background:#f5f7f9;color:#202d38;border-radius:10px;box-shadow:0 14px 36px #0007;font-family:${slideFont}}.slide-content{height:calc(100% - 30px);padding:6% 7%}.slide small{color:#316b72;font-weight:700;letter-spacing:1.2px;font-size:clamp(7px,1vw,11px)}.slide h2{font-size:clamp(18px,3vw,34px);line-height:1.14;margin:4% 0;color:#202d38;max-width:100%;overflow-wrap:anywhere;word-break:normal;letter-spacing:normal;max-height:2.3em;overflow:hidden}.cover .slide-content{display:grid;grid-template-columns:1.1fr .9fr;align-items:center;gap:5%;padding:8%}.cover .cover-copy{min-width:0}.cover .cover-copy h2{font-size:clamp(24px,4vw,46px);line-height:1.12;margin:6% 0;max-height:2.25em}.cover .subtitle{font-size:clamp(10px,1.5vw,17px);color:#64727c;max-width:100%;overflow-wrap:anywhere;line-height:1.35}.cover img{width:100%;height:100%;max-height:85%;object-fit:cover;border-radius:6px}.content-layout{height:75%;display:grid;grid-template-columns:1fr .8fr;gap:5%;align-items:center}.content-layout.text-only{grid-template-columns:1fr}.points{display:grid;gap:8px}.point{display:flex;align-items:flex-start;gap:10px;padding:8px 10px;border:1px solid #dce3e8;border-radius:7px;background:#fff}.point span{color:#316b72;font-size:10px;font-weight:bold}.point p{margin:0;font-size:clamp(9px,1.2vw,14px)}figure{margin:0;min-height:0;height:88%;display:flex;flex-direction:column;gap:4px}figure img{width:100%;height:100%;min-height:0;object-fit:cover;border-radius:7px}figcaption{font-size:9px;color:#64727c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.image-placeholder{height:100%;min-height:100px;background:linear-gradient(145deg,#1c3543,#263343);border:1px dashed #738591;border-radius:7px;display:grid;place-items:center;color:#bcc9d1;font-size:12px}.slide footer{height:30px;padding:0 7%;display:flex;justify-content:space-between;align-items:center;border-top:1px solid #dce3e8;color:#64727c;font-size:clamp(7px,.8vw,10px)}#layoutCheckStatus[data-state="warning"]{color:#ffd27a}#layoutCheckStatus[data-state="passed"]{color:#95d9b7}@media(max-width:640px){.cover .slide-content{grid-template-columns:1fr .8fr}.content-layout{grid-template-columns:1fr .7fr}.point{padding:5px}.points{gap:4px}}
</style></head><body><header class="top"><h1>${escapeHtml(previewDeck.title)} · Slide preview</h1><p>Layout preview and quality report · the editable presentation is saved separately as PPTX.</p><p id="layoutCheckStatus">Rendered preview layout and PPTX object bounds are checked separately. A PowerPoint render is used when the desktop renderer is available.</p></header><section class="report"><div class="metrics"><div class="metric"><b>${quality?.slideCount || totalSlides}</b><span>slides</span></div><div class="metric"><b>${quality?.imageCount || 0}</b><span>embedded images</span></div><div class="metric"><b>${quality?.imageCoverage ?? 0}%</b><span>slides with images</span></div><div class="metric"><b>${quality?.duplicateImageCount || 0}</b><span>duplicate image files</span></div><div class="metric"><b>${quality?.outOfBoundsSlides?.length || 0}</b><span>slides with off-canvas objects</span></div></div>${warningMarkup}${slideReportMarkup}</section><main class="grid">${slides}</main></body></html>`;
    const previewPath = outputPath.replace(/\.pptx$/i, ".preview.html");
    fs.writeFileSync(previewPath, html);
    return previewPath;
}

module.exports = { writePresentationPreview };
