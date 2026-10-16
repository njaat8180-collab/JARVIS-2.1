"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const JSZip = require("jszip");
const mammoth = require("mammoth");
const { buildDocxBuffer, createCsv, createZipBuffer } = require("../src/documents/officeFileGenerator");
const { writeWorkbook } = require("../src/documents/spreadsheetGenerator");
const XLSX = require("xlsx");
const os = require("node:os");

test("DOCX is a readable Office package with styled headings and real text", async () => {
    const buffer = await buildDocxBuffer({ title: "Class 9 IT", content: "# Working with Windows\nWindows manages files and apps.\n\n## Key ideas\n- Use File Explorer\n- Organize folders" });
    const archive = await JSZip.loadAsync(buffer);
    assert.ok(await archive.file("word/document.xml").async("string"));
    assert.ok(await archive.file("word/styles.xml").async("string"));
    const extracted = await mammoth.extractRawText({ buffer });
    assert.match(extracted.value, /Class 9 IT/);
    assert.match(extracted.value, /Working with Windows/);
    assert.match(extracted.value, /Organize folders/);
});

test("CSV templates are UTF-8 compatible and match the requested everyday task", () => {
    const csv = createCsv("monthly expenses budget");
    assert.ok(csv.startsWith("\uFEFF"));
    assert.match(csv, /Date,Category,Description,Amount \(INR\),Type/);
    assert.match(createCsv("study planner"), /Subject,Topic,Planned Minutes/);
    assert.match(createCsv("columns: Name, Age, City"), /Name,Age,City/);
});

test("ZIP builder includes each selected file and keeps duplicate basenames distinct", async () => {
    const scratch = path.join(__dirname, `.office-file-test-${process.pid}-${Date.now()}`);
    fs.mkdirSync(path.join(scratch, "a"), { recursive: true });
    fs.mkdirSync(path.join(scratch, "b"), { recursive: true });
    try {
        const one = path.join(scratch, "a", "notes.txt");
        const two = path.join(scratch, "b", "notes.txt");
        fs.writeFileSync(one, "first file");
        fs.writeFileSync(two, "second file");
        const buffer = await createZipBuffer([one, two]);
        const archive = await JSZip.loadAsync(buffer);
        const files = Object.values(archive.files).filter(file => !file.dir);
        assert.equal(files.length, 2);
        assert.deepEqual(files.map(file => file.name).sort(), ["notes (2).txt", "notes.txt"]);
        assert.deepEqual((await Promise.all(files.map(file => file.async("string")))).sort(), ["first file", "second file"]);
    } finally {
        fs.rmSync(scratch, { recursive: true, force: true });
    }
});

test("saved XLSX includes every dashboard category, source formula, chart and valid dropdown order", async () => {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-workbook-"));
    try {
        for (const [request, lastRow, lastCategory] of [["monthly budget", 20, "Other"], ["study planner", 16, "Other"], ["project task tracker", 13, "Low"]]) {
            const outputPath = path.join(scratch, `${lastRow}.xlsx`);
            await writeWorkbook(request, outputPath);
            const bytes = fs.readFileSync(outputPath);
            // Formula-only cells have no cached value until a spreadsheet app calculates them.
            const workbook = XLSX.read(bytes, { type: "buffer", cellFormula: true, sheetStubs: true });
            assert.deepEqual(workbook.SheetNames, ["Dashboard", "Tracker", "Start Here"]);
            const dashboard = workbook.Sheets.Dashboard;
            assert.ok(dashboard.A10?.v, "category table must have a visible header");
            assert.ok(dashboard.B10?.v, "chart series title must not point at an empty cell");
            assert.equal(dashboard[`A${lastRow}`]?.v, lastCategory);
            assert.ok(dashboard[`B${lastRow}`]?.f?.includes(`A${lastRow}`), "last category formula must survive serialization");
            const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
            const chart = await zip.file("xl/charts/chart1.xml").async("string");
            assert.ok(chart.includes(`Dashboard!$B$11:$B$${lastRow}`));
            const tracker = await zip.file("xl/worksheets/sheet2.xml").async("string");
            assert.ok(tracker.indexOf("<dataValidations") > tracker.indexOf("<autoFilter"), "dropdowns must follow autoFilter in worksheet schema order");
            assert.ok(tracker.includes('type="list"'));
        }
    } finally {
        fs.rmSync(scratch, { recursive: true, force: true });
    }
});
