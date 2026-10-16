"use strict";

const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

function escapeXml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[ch]));
}

function markdownToWordXml(markdown) {
    const paragraphs = [];
    const lines = String(markdown || "").replace(/^```(?:markdown|md|text)?\s*/i, "").replace(/\s*```\s*$/, "").split(/\r?\n/);
    let inList = false;
    for (const raw of lines) {
        const line = raw.trim();
        if (!line) { inList = false; continue; }
        const heading = line.match(/^(#{1,3})\s+(.+)$/);
        if (heading) {
            const level = heading[1].length;
            paragraphs.push(`<w:p><w:pPr><w:pStyle w:val="Heading${level}"/></w:pPr><w:r><w:t xml:space="preserve">${escapeXml(heading[2])}</w:t></w:r></w:p>`);
            inList = false;
            continue;
        }
        const bullet = line.match(/^(?:[-*•])\s+(.+)$/);
        const ordered = line.match(/^\d+[.)]\s+(.+)$/);
        if (bullet || ordered) {
            const text = (bullet || ordered)[1];
            paragraphs.push(`<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:ind w:left="420" w:hanging="220"/></w:pPr><w:r><w:rPr><w:color w:val="243A4A"/></w:rPr><w:t xml:space="preserve">${bullet ? "• " : `${line.match(/^\d+/)[0]}. `}${escapeXml(text)}</w:t></w:r></w:p>`);
            inList = true;
            continue;
        }
        const pieces = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map(piece => {
            const bold = /^\*\*([^*]+)\*\*$/.exec(piece);
            const content = escapeXml(bold ? bold[1] : piece.replace(/`([^`]+)`/g, "$1"));
            return `<w:r>${bold ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${content}</w:t></w:r>`;
        }).join("");
        paragraphs.push(`<w:p><w:pPr><w:spacing w:after="140" w:line="300" w:lineRule="auto"/>${inList ? "<w:pStyle w:val=\"ListParagraph\"/>" : ""}</w:pPr>${pieces}</w:p>`);
        inList = false;
    }
    if (!paragraphs.length) throw new Error("The document content was empty.");
    return paragraphs.join("");
}

function buildDocxBuffer({ title, content, author = "JARVIS" }) {
    const safeTitle = String(title || "JARVIS Document").trim().slice(0, 180) || "JARVIS Document";
    const body = markdownToWordXml(content);
    const zip = new JSZip();
    zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
    zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
    zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    zip.file("word/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="22"/><w:color w:val="243A4A"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="160"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="102B3A"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="20"/><w:color w:val="607383"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="300" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="126D72"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="220" w:after="100"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="24566B"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="180" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/><w:color w:val="3E6172"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="80"/></w:pPr></w:style></w:styles>`);
    zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t xml:space="preserve">${escapeXml(safeTitle)}</w:t></w:r></w:p>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="540" w:footer="540" w:gutter="0"/><w:cols w:space="720"/><w:docGrid w:linePitch="360"/></w:sectPr></w:body></w:document>`);
    zip.file("docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(safeTitle)}</dc:title><dc:creator>${escapeXml(author)}</dc:creator><cp:lastModifiedBy>${escapeXml(author)}</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified></cp:coreProperties>`);
    return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

const CSV_TEMPLATES = {
    budget: ["Date", "Category", "Description", "Amount (INR)", "Type", "Payment Method", "Notes"],
    study: ["Date", "Subject", "Topic", "Planned Minutes", "Completed Minutes", "Status", "Notes"],
    shopping: ["Product", "Required Specifications", "Store", "Item Price (INR)", "Delivery (INR)", "Total Price (INR)", "Buy Link", "Rating / Notes"],
    tasks: ["Task", "Project / Area", "Priority", "Due Date", "Status", "Estimate Hours", "Actual Hours", "Next Step"],
    habits: ["Date", "Habit", "Target", "Completed", "Status", "Duration Minutes", "Notes"],
    inventory: ["Item", "Category", "SKU / ID", "Quantity", "Reorder Level", "Unit Cost (INR)", "Supplier", "Notes"],
    tracker: ["Date", "Item / Activity", "Category", "Value", "Status", "Priority", "Notes"]
};

function classifyCsvRequest(request) {
    const text = String(request || "").toLowerCase();
    if (/budget|expense|spend|खर्च|बजट|income|saving/.test(text)) return "budget";
    if (/study|school|class|exam|subject|पढ़|परीक्षा|स्कूल|timetable/.test(text)) return "study";
    if (/shopping|compare|price|product|खरीद|कीमत|दाम/.test(text)) return "shopping";
    if (/habit|routine|fitness|workout|आदत|व्यायाम/.test(text)) return "habits";
    if (/task|project|todo|कार्य|प्रोजेक्ट/.test(text)) return "tasks";
    if (/inventory|stock|सामान|इन्वेंटरी/.test(text)) return "inventory";
    return "tracker";
}

function createCsv(request) {
    const customColumns = String(request || "").match(/\b(?:columns?|headers?|fields?)\s*(?:are|:|=)?\s*(.+)$/i)?.[1];
    const requestedHeaders = customColumns ? customColumns.split(/[,;|]/).map(value => value.trim()).filter(Boolean).slice(0, 32) : [];
    const headers = requestedHeaders.length ? requestedHeaders : CSV_TEMPLATES[classifyCsvRequest(request)];
    const escape = value => {
        const text = String(value ?? "");
        return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    return `\uFEFF${headers.map(escape).join(",")}\r\n`;
}

async function createZipBuffer(filePaths, options = {}) {
    if (!Array.isArray(filePaths) || !filePaths.length) throw new Error("Choose at least one file to include in the ZIP archive.");
    if (filePaths.length > 100) throw new Error("Choose no more than 100 files for one ZIP archive.");
    const maxTotalBytes = Math.max(1024 * 1024, Number(options.maxTotalBytes) || 500 * 1024 * 1024);
    let totalBytes = 0;
    const zip = new JSZip();
    const usedNames = new Set();
    for (const filePath of filePaths) {
        const resolved = path.resolve(String(filePath || ""));
        const stat = await fs.promises.stat(resolved).catch(() => null);
        if (!stat?.isFile()) throw new Error(`This selection is not a regular file: ${path.basename(resolved) || "unknown file"}`);
        totalBytes += stat.size;
        if (totalBytes > maxTotalBytes) throw new Error("The selected files exceed the 500 MB archive limit.");
        let name = path.basename(resolved);
        const extension = path.extname(name);
        const stem = path.basename(name, extension);
        let serial = 2;
        while (usedNames.has(name.toLowerCase())) name = `${stem} (${serial++})${extension}`;
        usedNames.add(name.toLowerCase());
        zip.file(name, fs.createReadStream(resolved), { binary: true, streamFiles: true });
    }
    return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 }, streamFiles: true });
}

module.exports = { buildDocxBuffer, classifyCsvRequest, createCsv, createZipBuffer, markdownToWordXml };
