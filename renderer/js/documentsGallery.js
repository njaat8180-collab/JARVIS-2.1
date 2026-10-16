"use strict";

(() => {
    const list = document.getElementById("generatedDocumentsList");
    if (!list) return;
    const escape = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
    const fileUrl = path => `file:///${String(path || "").replace(/\\/g, "/").replace(/^\/+/, "")}`;
    let documents = [];
    const selected = new Set();
    const compareButton = document.getElementById("documentsCompare");
    const compareOutput = document.getElementById("documentCompareResult");

    function updateCompareButton() {
        if (!compareButton) return;
        compareButton.disabled = selected.size !== 2;
        compareButton.textContent = `Compare selected (${Math.min(2, selected.size)}/2)`;
    }

    async function refresh() {
        list.innerHTML = '<div class="panel-empty">Loading generated documents…</div>';
        try {
            const response = (await window.jarvis?.documents?.listGenerated?.())?.data || {};
            documents = Array.isArray(response.documents) ? response.documents : [];
            selected.clear(); updateCompareButton();
            if (!documents.length) {
                list.innerHTML = '<div class="panel-empty">No generated files yet.<br>Ask JARVIS for a PPT, PDF, Excel workbook, Word document, CSV template, or ZIP archive.</div>';
                return;
            }
            list.innerHTML = documents.map((doc, index) => {
                const preview = doc.type === "presentation" && doc.previewPath;
                const thumbnail = doc.thumbnailPath ? `<img class="generated-document-thumb" src="${escape(fileUrl(doc.thumbnailPath))}" alt="${escape(doc.title)} slide preview" loading="lazy">` : `<div class="generated-document-placeholder">${doc.type === "presentation" ? "▤" : doc.type === "spreadsheet" ? "▦" : "▧"}<span>${doc.type === "presentation" ? "PRESENTATION" : doc.type === "spreadsheet" ? "EXCEL WORKBOOK" : "PDF DOCUMENT"}</span></div>`;
                const size = doc.size >= 1048576 ? `${(doc.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(doc.size / 1024))} KB`;
                const versionLabel = (doc.versionCount || 1) > 1 ? ` · Version ${doc.version} of ${doc.versionCount}${doc.version === 1 ? " · Latest" : ""}` : "";
                const credits = doc.type === "presentation" || doc.imageCredits?.length
                    ? `<details class="generated-document-credits"><summary>Image sources & licenses · ${doc.imageCredits?.length || 0}</summary>${doc.imageCredits?.length ? `<ul>${doc.imageCredits.map(item => `<li><strong>${doc.type === "presentation" ? `Slide ${Number(item.slide) || "—"}:` : "Cover image:"}</strong> ${escape(item.title || "Topic image")}<br><span>${escape(item.source || "Source details unavailable")}${item.license ? ` · ${escape(item.license)}` : ""}</span>${item.creator ? `<br><small>${escape(item.creator)}</small>` : ""}${item.sourceUrl ? `<br><code>${escape(item.sourceUrl)}</code>` : ""}${item.licenseUrl ? `<br><a href="${escape(item.licenseUrl)}" target="_blank" rel="noopener">License terms</a>` : ""}</li>`).join("")}</ul>` : "<p>No image-credit manifest is available for this file.</p>"}</details>`
                    : "";
                const quality = doc.type === "pdf" && doc.qualityReport
                    ? `<details class="generated-document-credits"><summary>PDF quality · ${Number(doc.qualityReport.pageCount) || "?"} pages · ${Number(doc.qualityReport.textCoveragePercent) || 0}% text coverage${doc.qualityReport.warnings?.length ? ` · ${doc.qualityReport.warnings.length} note(s)` : " · checked"}</summary><p>${escape(doc.qualityReport.method || "Text extraction check")}</p>${doc.qualityReport.warnings?.length ? `<ul>${doc.qualityReport.warnings.map(warning => `<li>${escape(warning)}</li>`).join("")}</ul>` : "<p>No low-text, dense-page, or duplicate-text warnings found.</p>"}</details>`
                    : "";
                const renderReport = doc.type === "presentation" && doc.qualityReport?.officeRender
                    ? `<details class="generated-document-credits"><summary>PowerPoint render · ${doc.qualityReport.officeRender.rendered ? `${doc.qualityReport.officeRender.slideCount} slides exported` : "not available"}</summary><p>${escape(doc.qualityReport.officeRender.reason || "Rendered by Microsoft PowerPoint.")}</p>${doc.qualityReport.officeRender.warnings?.length ? `<ul>${doc.qualityReport.officeRender.warnings.map(warning => `<li>${escape(warning)}</li>`).join("")}</ul>` : ""}</details>`
                    : "";
                const renderedPreview = doc.qualityReport?.officeRender?.rendered && Array.isArray(doc.qualityReport.officeRender.slides)
                    ? `<details class="generated-rendered-preview"><summary>Actual PowerPoint slides · ${doc.qualityReport.officeRender.slides.length}</summary><div>${doc.qualityReport.officeRender.slides.map((file, slideIndex) => `<figure><img src="${escape(fileUrl(file))}" alt="${escape(doc.title)} slide ${slideIndex + 1}" loading="lazy"><figcaption>Slide ${slideIndex + 1}</figcaption></figure>`).join("")}</div></details>`
                    : "";
                const kind = ({ presentation: "PPTX", pdf: "PDF", spreadsheet: "XLSX", document: "DOCX", csv: "CSV", archive: "ZIP" })[doc.type] || String(doc.type || "FILE").toUpperCase();
                const canCompare = ["presentation", "pdf"].includes(doc.type);
                return `<article class="generated-document-card" data-document-index="${index}">${thumbnail}<div class="generated-document-info">${canCompare ? `<label class="document-compare-select"><input type="checkbox" data-doc-select="${index}">Select for version compare</label>` : ""}<span class="generated-document-kind">${kind} · ${size}${versionLabel}</span><strong>${escape(doc.title)}</strong><small>${new Date(doc.modifiedAt).toLocaleString()}</small>${credits}${quality}${renderReport}${renderedPreview}<div class="generated-document-actions"><button type="button" data-doc-action="open">Open</button>${preview ? '<button type="button" data-doc-action="preview">Slide preview</button>' : ""}${doc.type === "presentation" ? '<button type="button" data-doc-action="render">Check PowerPoint render</button>' : ""}${canCompare && doc.versionCount > 1 && doc.version !== 1 ? '<button type="button" data-doc-action="restore">Restore as latest</button>' : ""}</div></div></article>`;
            }).join("");
        } catch (error) {
            list.innerHTML = `<div class="panel-empty">Document gallery could not load · ${escape(error?.message || "unknown error")}</div>`;
        }
    }

    list.addEventListener("change", event => {
        const checkbox = event.target.closest("[data-doc-select]");
        if (!checkbox) return;
        const doc = documents[Number(checkbox.dataset.docSelect)];
        if (!doc) return;
        if (checkbox.checked && selected.size >= 2) { checkbox.checked = false; return; }
        if (checkbox.checked) selected.add(doc.path); else selected.delete(doc.path);
        updateCompareButton();
    });

    compareButton?.addEventListener("click", async () => {
        if (selected.size !== 2) return;
        compareButton.disabled = true; compareButton.textContent = "Comparing…";
        if (compareOutput) { compareOutput.hidden = false; compareOutput.textContent = "Extracting document text and comparing versions…"; }
        try {
            const result = (await window.jarvis?.documents?.compareGenerated?.([...selected]))?.data || {};
            if (result.success === false) throw new Error(result.error || "Comparison failed.");
            const left = documents.find(doc => doc.path === result.documents?.[0]?.path);
            const right = documents.find(doc => doc.path === result.documents?.[1]?.path);
            const visual = [left, right].map(doc => doc?.thumbnailPath ? `<figure><img src="${escape(fileUrl(doc.thumbnailPath))}" alt="${escape(doc.title)} preview"><figcaption>${escape(doc.title)}</figcaption></figure>` : `<div class="compare-no-thumb">${escape(doc?.title || "Document")} · preview unavailable</div>`).join("");
            const renderedSets = result.renderedSlides || [[], []];
            const renderedSlideCount = Math.min(8, Math.max(renderedSets[0]?.length || 0, renderedSets[1]?.length || 0));
            const actualRenders = renderedSlideCount ? `<section class="compare-rendered-slides"><h4>PowerPoint rendered slides</h4>${Array.from({ length: renderedSlideCount }, (_, index) => `<div class="compare-rendered-row"><strong>Slide ${index + 1}</strong><div>${[0, 1].map(side => renderedSets[side]?.[index] ? `<figure><img src="${escape(fileUrl(renderedSets[side][index]))}" alt="${escape(side === 0 ? left?.title || "First version" : right?.title || "Second version")} slide ${index + 1}"><figcaption>${escape(side === 0 ? left?.title || "First version" : right?.title || "Second version")}</figcaption></figure>` : `<div class="compare-no-thumb">${escape(side === 0 ? left?.title || "First version" : right?.title || "Second version")} · slide unavailable</div>`).join("")}</div></div>`).join("")}</section>` : "";
            const diffs = (result.pageDiffs || []).map(diff => `<article class="compare-page-diff"><strong>Page/slide ${diff.page}${diff.addedPage ? " · added" : diff.removedPage ? " · removed" : ""}</strong><div><section><small>First version · −${diff.removedWords} words</small><p>${escape(diff.before || "(empty)")}</p></section><section><small>Second version · +${diff.addedWords} words</small><p>${escape(diff.after || "(empty)")}</p></section></div></article>`).join("");
            compareOutput.innerHTML = `<header><strong>Document comparison</strong><button type="button" data-compare-close>Close</button></header><p>${result.textChangedPages} page(s)/slide(s) with text changes · ${result.removedWords} removed words · ${result.addedWords} added words.</p><div class="compare-visuals">${visual}</div><p class="compare-limit">${escape(result.visualCompare || "Text and image counts compared; rendered pixel comparison unavailable.")}</p>${actualRenders}${diffs || "<p>The extracted text is identical.</p>"}`;
        } catch (error) { if (compareOutput) compareOutput.textContent = `Comparison failed · ${error?.message || "unknown error"}`; }
        finally { updateCompareButton(); }
    });

    compareOutput?.addEventListener("click", event => {
        if (event.target.closest("[data-compare-close]")) compareOutput.hidden = true;
    });

    list.addEventListener("click", async event => {
        const button = event.target.closest("[data-doc-action]");
        if (!button) return;
        const doc = documents[Number(button.closest("[data-document-index]")?.dataset.documentIndex)];
        if (!doc) return;
        button.disabled = true;
        try {
            if (button.dataset.docAction === "restore" && !window.confirm(`Create a new latest copy from “${doc.title}” version ${doc.version}? The original file will remain unchanged.`)) return;
            const result = (await (button.dataset.docAction === "preview"
                ? window.jarvis?.documents?.previewGenerated?.(doc.previewPath)
                : button.dataset.docAction === "render"
                    ? window.jarvis?.documents?.renderGenerated?.(doc.path)
                    : button.dataset.docAction === "restore"
                        ? window.jarvis?.documents?.restoreVersion?.(doc.path)
                    : window.jarvis?.documents?.openGenerated?.(doc.path)))?.data || {};
            if (result.success === false) throw new Error(result.error || "Could not open this document.");
            button.closest(".generated-document-card")?.querySelector(".document-action-error")?.remove();
            if (["render", "restore"].includes(button.dataset.docAction)) await refresh();
        } catch (error) {
            const card = button.closest(".generated-document-card");
            let feedback = card?.querySelector(".document-action-error");
            if (card && !feedback) { feedback = document.createElement("small"); feedback.className = "document-action-error"; feedback.setAttribute("role", "alert"); card.querySelector(".generated-document-info")?.append(feedback); }
            if (feedback) feedback.textContent = error?.message || "JARVIS could not open this document.";
            if (button.dataset.docAction === "render") await refresh();
        }
        finally { button.disabled = false; }
    });

    document.getElementById("documentsRefresh")?.addEventListener("click", refresh);
    window.JARVISDocumentsGallery = Object.freeze({ refresh });
    refresh();
})();
