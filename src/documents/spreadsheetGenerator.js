"use strict";

const XLSX = require("xlsx");
const JSZip = require("jszip");

const MAX_ROWS = 200;
const DATA_SHEET = "Tracker";

function classifyRequest(request) {
    const text = String(request || "").toLowerCase();
    if (/budget|expense|spend|खर्च|बजट|आय|income|saving|बचत/.test(text)) return "budget";
    if (/study|school|class|exam|subject|पढ़|पढ़|परीक्षा|स्कूल|अध्ययन|timetable|टाइम.?टेबल/.test(text)) return "study";
    if (/shopping|compare|price|product|खरीद|कीमत|दाम|तुलना|shopping list/.test(text)) return "shopping";
    if (/habit|routine|fitness|workout|habit tracker|आदत|व्यायाम|फिटनेस/.test(text)) return "habits";
    if (/task|project|todo|to-do|कार्य|कामों की सूची|प्रोजेक्ट/.test(text)) return "tasks";
    if (/inventory|stock|सामान|इन्वेंटरी|स्टॉक/.test(text)) return "inventory";
    if (/reading|books|पुस्तक|किताब/.test(text)) return "reading";
    return "tracker";
}

const TEMPLATES = {
    budget: {
        title: "Monthly Budget & Expense Tracker", headers: ["Date", "Category", "Description", "Amount (₹)", "Type", "Payment Method", "Notes"],
        categories: ["Housing", "Food", "Transport", "Utilities", "Health", "Education", "Shopping", "Entertainment", "Savings", "Other"],
        kpis: [["Total income", "income"], ["Total expenses", "expenses"], ["Net balance", "net"], ["Transactions", "count"]],
        amountColumn: 4, categoryColumn: 2, statusColumn: 5, statusValues: ["Expense", "Income", "Savings"], currencyColumns: [4], dateColumns: [1],
        formula: "=SUMIFS(Tracker!$D$2:$D$201,Tracker!$E$2:$E$201,\"Income\")",
        formula2: "=SUMIFS(Tracker!$D$2:$D$201,Tracker!$E$2:$E$201,\"Expense\")",
        summaryFormula: category => `=SUMIFS(Tracker!$D$2:$D$201,Tracker!$B$2:$B$201,A11,Tracker!$E$2:$E$201,\"Expense\")`, chartTitle: "Spending by category", chartColumn: "B"
    },
    study: {
        title: "Study Planner & Progress Tracker", headers: ["Date", "Subject", "Topic / Task", "Planned (min)", "Completed (min)", "Status", "Notes"],
        categories: ["Mathematics", "Science", "English", "Social Studies", "Computer / IT", "Other"],
        kpis: [["Planned study time", "planned"], ["Completed study time", "completed"], ["Completion rate", "rate"], ["Study sessions", "count"]],
        amountColumn: 5, categoryColumn: 2, statusColumn: 6, statusValues: ["Not started", "In progress", "Done", "Skipped"], dateColumns: [1],
        formula: "=SUM(Tracker!$D$2:$D$201)", formula2: "=SUM(Tracker!$E$2:$E$201)",
        summaryFormula: () => `=SUMIFS(Tracker!$E$2:$E$201,Tracker!$B$2:$B$201,A11)`, chartTitle: "Completed minutes by subject", chartColumn: "B"
    },
    shopping: {
        title: "Shopping & Price Comparison", headers: ["Product", "Required specifications", "Store", "Item price (₹)", "Delivery (₹)", "Total price (₹)", "Buy link", "Rating / notes"],
        categories: ["Store 1", "Store 2", "Store 3", "Store 4", "Store 5"],
        kpis: [["Offers tracked", "count"], ["Lowest total price", "lowest"], ["Average total price", "average"], ["Best offer store", "best"]],
        amountColumn: 6, categoryColumn: 3, currencyColumns: [4, 5, 6], statusValues: [],
        formula: "=MIN(Tracker!$F$2:$F$201)", formula2: "=AVERAGEIF(Tracker!$F$2:$F$201,\">0\")",
        summaryFormula: (_, row) => `=COUNTIF(Tracker!$C$2:$C$201,A${row})`, chartTitle: "Total price by store", chartColumn: "B"
    },
    habits: {
        title: "Habit & Routine Tracker", headers: ["Date", "Habit", "Target", "Completed", "Status", "Duration (min)", "Notes"],
        categories: ["Exercise", "Reading", "Water", "Sleep", "Study", "Other"],
        kpis: [["Habits logged", "count"], ["Completed", "done"], ["Completion rate", "rate"], ["Total minutes", "minutes"]],
        amountColumn: 6, categoryColumn: 2, statusColumn: 5, statusValues: ["Done", "Partial", "Missed"], dateColumns: [1],
        formula: "=COUNTA(Tracker!$B$2:$B$201)", formula2: "=COUNTIF(Tracker!$E$2:$E$201,\"Done\")",
        summaryFormula: (_, row) => `=COUNTIFS(Tracker!$B$2:$B$201,A${row},Tracker!$E$2:$E$201,\"Done\")`, chartTitle: "Completed habits by type", chartColumn: "B"
    },
    tasks: {
        title: "Tasks & Project Tracker", headers: ["Task", "Project / Area", "Priority", "Due date", "Status", "Estimate (hrs)", "Actual (hrs)", "Next step"],
        categories: ["High", "Medium", "Low"],
        kpis: [["Open tasks", "open"], ["Completed tasks", "done"], ["Overdue tasks", "overdue"], ["Tracked hours", "hours"]],
        amountColumn: 6, categoryColumn: 3, statusColumn: 5, statusValues: ["Not started", "In progress", "Blocked", "Done"], dateColumns: [4],
        formula: "=COUNTIFS(Tracker!$A$2:$A$201,\"<>\",Tracker!$E$2:$E$201,\"<>Done\")", formula2: "=COUNTIF(Tracker!$E$2:$E$201,\"Done\")",
        summaryFormula: (_, row) => `=COUNTIFS(Tracker!$C$2:$C$201,A${row},Tracker!$E$2:$E$201,\"<>Done\",Tracker!$A$2:$A$201,\"<>\")`, chartTitle: "Open tasks by priority", chartColumn: "B"
    },
    inventory: {
        title: "Inventory & Stock Tracker", headers: ["Item", "Category", "SKU / ID", "Quantity", "Reorder level", "Unit cost (₹)", "Stock value (₹)", "Supplier / notes"],
        categories: ["Electronics", "Office", "Home", "Food", "Other"],
        kpis: [["Items tracked", "count"], ["Total units", "units"], ["Total stock value", "value"], ["Items to reorder", "reorder"]],
        amountColumn: 7, categoryColumn: 2, currencyColumns: [6, 7], statusValues: [],
        formula: "=COUNTA(Tracker!$A$2:$A$201)", formula2: "=SUM(Tracker!$D$2:$D$201)",
        summaryFormula: (_, row) => `=SUMIFS(Tracker!$G$2:$G$201,Tracker!$B$2:$B$201,A${row})`, chartTitle: "Stock value by category", chartColumn: "B"
    },
    reading: {
        title: "Reading List & Book Tracker", headers: ["Book", "Author", "Category", "Pages", "Pages read", "Status", "Rating", "Notes"],
        categories: ["Fiction", "Non-fiction", "Science", "Technology", "Study", "Other"],
        kpis: [["Books tracked", "count"], ["Finished", "done"], ["Pages read", "pages"], ["Average rating", "rating"]],
        amountColumn: 5, categoryColumn: 3, statusColumn: 6, statusValues: ["Want to read", "Reading", "Finished", "Paused"],
        formula: "=COUNTA(Tracker!$A$2:$A$201)", formula2: "=COUNTIF(Tracker!$F$2:$F$201,\"Finished\")",
        summaryFormula: (_, row) => `=COUNTIFS(Tracker!$C$2:$C$201,A${row},Tracker!$F$2:$F$201,\"Finished\")`, chartTitle: "Finished books by category", chartColumn: "B"
    },
    tracker: {
        title: "Smart Personal Tracker", headers: ["Date", "Item / Activity", "Category", "Value", "Status", "Priority", "Notes"],
        categories: ["Personal", "Work", "Study", "Home", "Other"],
        kpis: [["Items logged", "count"], ["Completed", "done"], ["Total value", "value"], ["Categories", "categories"]],
        amountColumn: 4, categoryColumn: 3, statusColumn: 5, statusValues: ["Not started", "In progress", "Done", "On hold"], dateColumns: [1],
        formula: "=COUNTA(Tracker!$B$2:$B$201)", formula2: "=COUNTIF(Tracker!$E$2:$E$201,\"Done\")",
        summaryFormula: (_, row) => `=COUNTIF(Tracker!$C$2:$C$201,A${row})`, chartTitle: "Items by category", chartColumn: "B"
    }
};

function cell(value, format) {
    const result = { v: value };
    if (format) result.z = format;
    return result;
}

function buildWorkbook(request) {
    const kind = classifyRequest(request);
    const template = TEMPLATES[kind];
    const wb = XLSX.utils.book_new();
    wb.Props = { Title: template.title, Subject: `Created by JARVIS from: ${String(request || "").slice(0, 180)}`, Author: "JARVIS", Company: "JARVIS", CreatedDate: new Date() };
    const dashboard = [
        [template.title],
        [String(request || "Personal spreadsheet").slice(0, 240)],
        ["Update the Tracker sheet; dashboard totals and chart recalculate in Excel."],
        ["KEY METRICS", "CURRENT"],
        ...template.kpis.map(([label]) => [label, null]),
        [],
        [kind === "budget" ? "Category" : kind === "shopping" ? "Store" : kind === "tasks" ? "Priority" : kind === "tracker" ? "Category" : "Category", kind === "budget" ? "Expenses (₹)" : kind === "shopping" ? "Offers" : kind === "study" ? "Minutes" : "Count"]
    ];
    const data = [template.headers];
    for (let row = 2; row <= MAX_ROWS + 1; row++) {
        data.push(template.headers.map((_, col) => {
            if (kind === "shopping" && col === 5) return { f: `IF(COUNTA(A${row},C${row},D${row},E${row})=0,\"\",D${row}+E${row})` };
            if (kind === "inventory" && col === 6) return { f: `IF(OR(D${row}=\"\",F${row}=\"\"),\"\",D${row}*F${row})` };
            if (kind === "budget" && col === 0) return cell(null, "dd-mmm-yyyy");
            if ((kind === "study" && (col === 0)) || (kind === "habits" && col === 0) || (kind === "tasks" && col === 3) || (kind === "tracker" && col === 0)) return cell(null, "dd-mmm-yyyy");
            if (template.currencyColumns?.includes(col + 1)) return cell(null, '₹#,##0.00;[Red]-₹#,##0.00;–');
            if (/min\)|hrs\)|pages|quantity|level|rating|value|price|cost|\(₹\)/i.test(template.headers[col])) return cell(null, "#,##0.##;[Red]-#,##0.##;–");
            return cell(null);
        }));
    }
    const dashboardSheet = XLSX.utils.aoa_to_sheet(dashboard);
    const trackerSheet = XLSX.utils.aoa_to_sheet(data);
    dashboardSheet["!merges"] = [XLSX.utils.decode_range("A1:H1"), XLSX.utils.decode_range("A2:H2"), XLSX.utils.decode_range("A3:H3")];
    dashboardSheet["!cols"] = [{ wch: 31 }, { wch: 21 }, { wch: 16 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
    dashboardSheet["!rows"] = [{ hpt: 31 }, { hpt: 23 }, { hpt: 23 }, { hpt: 22 }, ...Array.from({ length: template.kpis.length }, () => ({ hpt: 28 }))];
    const dataLastRow = MAX_ROWS + 1;
    const setFormula = (address, formula, format) => { dashboardSheet[address] = { t: "n", f: formula.replace(/^=/, ""), ...(format ? { z: format } : {}) }; };
    const listSep = ",";
    const formulas = {
        budget: [template.formula, template.formula2, `=B5-B6`, `=COUNTA(Tracker!$A$2:$A$${dataLastRow})`],
        study: [template.formula, template.formula2, `=IFERROR(B6/B5,0)`, `=COUNT(Tracker!$A$2:$A$${dataLastRow})`],
        shopping: [`=COUNTIF(Tracker!$A$2:$A$${dataLastRow},"<>")`, template.formula, template.formula2, `=IFERROR(INDEX(Tracker!$C$2:$C$${dataLastRow},MATCH(B6,Tracker!$F$2:$F$${dataLastRow},0)),"")`],
        habits: [template.formula, template.formula2, `=IFERROR(B6/B5,0)`, `=SUM(Tracker!$F$2:$F$${dataLastRow})`],
        tasks: [template.formula, template.formula2, `=COUNTIFS(Tracker!$D$2:$D$${dataLastRow},"<"&TODAY(),Tracker!$D$2:$D$${dataLastRow},">0",Tracker!$E$2:$E$${dataLastRow},"<>Done")`, `=SUM(Tracker!$F$2:$G$${dataLastRow})`],
        inventory: [template.formula, template.formula2, `=SUM(Tracker!$G$2:$G$${dataLastRow})`, `=SUMPRODUCT((Tracker!$D$2:$D$${dataLastRow}<=Tracker!$E$2:$E$${dataLastRow})*(Tracker!$A$2:$A$${dataLastRow}<>""))`],
        reading: [template.formula, template.formula2, `=SUM(Tracker!$E$2:$E$${dataLastRow})`, `=IFERROR(AVERAGE(Tracker!$G$2:$G$${dataLastRow}),0)`],
        tracker: [template.formula, template.formula2, `=SUM(Tracker!$D$2:$D$${dataLastRow})`, `=COUNTA(Tracker!$C$2:$C$${dataLastRow})`]
    }[kind];
    formulas.forEach((formula, index) => setFormula(`B${5 + index}`, formula));
    if (kind === "budget") {
        setFormula("B7", `=B5-B6`, '₹#,##0.00;[Red]-₹#,##0.00;–');
        setFormula("B5", formulas[0], '₹#,##0.00;[Red]-₹#,##0.00;–');
        setFormula("B6", formulas[1], '₹#,##0.00;[Red]-₹#,##0.00;–');
    }
    if (kind === "study" || kind === "habits") setFormula("B7", formulas[2], "0%");
    if (kind === "shopping") { setFormula("B6", formulas[1], '₹#,##0.00;[Red]-₹#,##0.00;–'); setFormula("B7", formulas[2], '₹#,##0.00;[Red]-₹#,##0.00;–'); }
    if (kind === "inventory") { setFormula("B7", formulas[2], '₹#,##0.00;[Red]-₹#,##0.00;–'); }
    if (kind === "reading") setFormula("B8", formulas[3], "0.0");

    const labelColumn = kind === "shopping" ? "Store" : kind === "budget" ? "Category" : kind === "tasks" ? "Priority" : "Category";
    template.categories.forEach((category, index) => {
        const row = 11 + index;
        dashboardSheet[`A${row}`] = cell(category);
        const formula = kind === "budget"
            ? `SUMIFS(Tracker!$D$2:$D$${dataLastRow},Tracker!$B$2:$B$${dataLastRow},A${row},Tracker!$E$2:$E$${dataLastRow},"Expense")`
            : kind === "shopping" ? `COUNTIF(Tracker!$C$2:$C$${dataLastRow},A${row})`
                : kind === "study" ? `SUMIFS(Tracker!$E$2:$E$${dataLastRow},Tracker!$B$2:$B$${dataLastRow},A${row})`
                    : kind === "habits" ? `COUNTIFS(Tracker!$B$2:$B$${dataLastRow},A${row},Tracker!$E$2:$E$${dataLastRow},"Done")`
                        : kind === "tasks" ? `COUNTIFS(Tracker!$C$2:$C$${dataLastRow},A${row},Tracker!$E$2:$E$${dataLastRow},"<>Done",Tracker!$A$2:$A$${dataLastRow},"<>")`
                            : kind === "inventory" ? `SUMIFS(Tracker!$G$2:$G$${dataLastRow},Tracker!$B$2:$B$${dataLastRow},A${row})`
                                : kind === "reading" ? `COUNTIFS(Tracker!$C$2:$C$${dataLastRow},A${row},Tracker!$F$2:$F$${dataLastRow},"Finished")`
                                    : `COUNTIF(Tracker!$C$2:$C$${dataLastRow},A${row})`;
        setFormula(`B${row}`, `=${formula}`, kind === "budget" || kind === "inventory" ? '₹#,##0.00;[Red]-₹#,##0.00;–' : "0.##");
    });
    // Directly assigned cells do not expand SheetJS's serialized worksheet range.
    // Keep every category and formula in the file, including the chart source rows.
    dashboardSheet["!ref"] = `A1:H${10 + template.categories.length}`;
    dashboardSheet["!autofilter"] = { ref: `A10:B${10 + template.categories.length}` };
    trackerSheet["!cols"] = template.headers.map(header => ({ wch: Math.min(34, Math.max(15, header.length + 4)) }));
    trackerSheet["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" };
    trackerSheet["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(template.headers.length - 1)}${dataLastRow}` };
    trackerSheet["!rows"] = [{ hpt: 28 }, ...Array.from({ length: MAX_ROWS }, () => ({ hpt: 21 }))];
    trackerSheet["!dataValidation"] = template.statusColumn ? [{ type: "list", allowBlank: true, sqref: `${XLSX.utils.encode_col(template.statusColumn - 1)}2:${XLSX.utils.encode_col(template.statusColumn - 1)}${dataLastRow}`, formula1: `"${template.statusValues.join(listSep)}"` }] : [];
    XLSX.utils.book_append_sheet(wb, dashboardSheet, "Dashboard");
    XLSX.utils.book_append_sheet(wb, trackerSheet, DATA_SHEET);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ["JARVIS SPREADSHEET · QUICK START"],
        ["1. Open the Tracker tab and enter your own information in the blank rows."],
        ["2. Use the dropdowns for status fields where available."],
        ["3. Return to Dashboard for live totals, category breakdowns and chart."],
        ["4. Formulas recalculate when you open the workbook in Excel or compatible spreadsheet software."],
        ["5. This file contains no invented personal records or financial figures."],
        ["Created by JARVIS", new Date().toISOString()],
        ["Original request", String(request || "").slice(0, 240)]
    ]), "Start Here");
    wb.SheetNames.forEach(name => { if (name === "Dashboard") wb.Sheets[name]["!sheetViews"] = [{ showGridLines: false }]; });
    return { wb, kind, template, dashboardSheet, trackerSheet };
}

const STYLE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="₹#,##0.00;[Red]-₹#,##0.00;–"/><numFmt numFmtId="165" formatCode="dd-mmm-yyyy"/></numFmts><fonts count="4"><font><sz val="11"/><name val="Aptos"/><color rgb="FF263746"/></font><font><b/><sz val="19"/><name val="Aptos Display"/><color rgb="FFFFFFFF"/></font><font><sz val="10"/><name val="Aptos"/><color rgb="FF607383"/></font><font><b/><sz val="10"/><name val="Aptos"/><color rgb="FFFFFFFF"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF122635"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF2F6"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F7FA"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFE0E9EE"/></left><right style="thin"><color rgb="FFE0E9EE"/></right><top style="thin"><color rgb="FFE0E9EE"/></top><bottom style="thin"><color rgb="FFE0E9EE"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="12"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/><xf numFmtId="165" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/><xf numFmtId="10" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/><xf numFmtId="164" fontId="3" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function addStyle(cellXml, style) { return cellXml.replace(/<c\b([^>]*)>/, (_match, attrs) => `<c${attrs.replace(/\s+s="\d+"/, "")} s="${style}">`); }
function styleSheetXml(xml, sheetName, template, kind) {
    if (sheetName === "Dashboard") {
        xml = xml.replace(/<c\b[^>]*r="A1"[^>]*>.*?<\/c>/, match => addStyle(match, 1));
        for (const address of ["A2", "A3"]) { const re = new RegExp(`<c\\b[^>]*r="${address}"[^>]*>.*?<\\/c>`); xml = xml.replace(re, match => addStyle(match, 2)); }
        for (const address of ["A4", "B4", "A10", "B10"]) { const re = new RegExp(`<c\\b[^>]*r="${address}"[^>]*>.*?<\\/c>`); xml = xml.replace(re, match => addStyle(match, 3)); }
        xml = xml.replace(/<c\b[^>]*r="(?:A|B)[5-8]"[^>]*>.*?<\/c>/g, match => addStyle(match, /r="B\d+"/.test(match) ? 7 : 6));
        const emphasized = kind === "budget" ? ["B5", "B6", "B7"] : kind === "shopping" ? ["B6", "B7"] : kind === "inventory" ? ["B7"] : [];
        for (const address of emphasized) { const re = new RegExp(`<c\\b[^>]*r="${address}"[^>]*>.*?<\\/c>`); xml = xml.replace(re, match => addStyle(match, 11)); }
        if (kind === "study" || kind === "habits") xml = xml.replace(/<c\b[^>]*r="B7"[^>]*>.*?<\/c>/, match => addStyle(match, 10));
        xml = xml.replace(/<c\b[^>]*r="[AB](?:1[1-9]|20)"[^>]*>.*?<\/c>/g, match => addStyle(match, /r="B\d+"/.test(match) ? 5 : 4));
        if (kind === "budget" || kind === "inventory") xml = xml.replace(/<c\b[^>]*r="B(?:1[1-9]|20)"[^>]*>.*?<\/c>/g, match => addStyle(match, 8));
    } else if (sheetName === "Tracker") {
        const header = /<row\b[^>]*r="1"[^>]*>.*?<\/row>/s;
        xml = xml.replace(header, row => row.replace(/<c\b[^>]*>.*?<\/c>/g, match => addStyle(match, 3)));
        xml = xml.replace(/<c\b[^>]*r="[A-Z]+\d+"[^>]*>.*?<\/c>/g, match => {
            const address = match.match(/r="([A-Z]+)(\d+)"/);
            if (!address || Number(address[2]) < 2) return match;
            const col = XLSX.utils.decode_col(address[1]);
            if (template.currencyColumns?.includes(col + 1)) return addStyle(match, 8);
            if (template.dateColumns?.includes(col + 1)) return addStyle(match, 9);
            if (/min\)|hrs\)|pages|quantity|level|rating|value|price|cost/i.test(template.headers[col] || "")) return addStyle(match, 10);
            return addStyle(match, Number(address[2]) % 2 === 0 ? 4 : 5);
        });
    }
    return xml;
}

function xmlEscape(value) { return String(value || "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]); }
function addDashboardChart(zip, template) {
    const lastCategoryRow = 10 + template.categories.length;
    const chartTitle = template.chartTitle || "Dashboard summary";
    const chartXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:lang val="en-IN"/><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1400" b="1"/></a:pPr><a:r><a:rPr lang="en-IN"/><a:t>${xmlEscape(chartTitle)}</a:t></a:r><a:endParaRPr lang="en-IN"/></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:strRef><c:f>Dashboard!$B$10</c:f></c:strRef></c:tx><c:spPr><a:solidFill><a:srgbClr val="39B7AD"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr><c:cat><c:strRef><c:f>Dashboard!$A$11:$A$${lastCategoryRow}</c:f></c:strRef></c:cat><c:val><c:numRef><c:f>Dashboard!$B$11:$B$${lastCategoryRow}</c:f></c:numRef></c:val></c:ser><c:gapWidth val="75"/><c:axId val="48650112"/><c:axId val="48672768"/></c:barChart><c:catAx><c:axId val="48650112"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:tickLblPos val="nextTo"/><c:crossAx val="48672768"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/></c:catAx><c:valAx><c:axId val="48672768"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines/><c:numFmt formatCode="General" sourceLinked="1"/><c:tickLblPos val="nextTo"/><c:crossAx val="48650112"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx></c:plotArea><c:legend><c:legendPos val="b"/><c:layout/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/><c:showDLblsOverMax val="0"/></c:chart><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr><c:printSettings><c:headerFooter/><c:pageMargins b="0.75" l="0.7" r="0.7" t="0.75"/><c:pageSetup/></c:printSettings></c:chartSpace>`;
    const drawingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:twoCellAnchor><xdr:from><xdr:col>3</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>3</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>12</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>20</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="JARVIS Dashboard Chart"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`;
    zip.file("xl/charts/chart1.xml", chartXml);
    zip.file("xl/drawings/drawing1.xml", drawingXml);
    zip.file("xl/drawings/_rels/drawing1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/></Relationships>`);
    zip.file("xl/worksheets/_rels/sheet1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`);
    const contentTypesPath = "[Content_Types].xml";
    let types = "";
    return zip.file("xl/worksheets/sheet1.xml").async("string").then(xml => {
        const updated = xml.replace(/<worksheet\b([^>]*)>/, (_match, attrs) => `<worksheet${attrs.includes("xmlns:r=") ? attrs : `${attrs} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`}>`).replace(/<\/worksheet>/, '<drawing r:id="rId1"/></worksheet>');
        zip.file("xl/worksheets/sheet1.xml", updated);
        return zip.file(contentTypesPath).async("string");
    }).then(xml => {
        types = xml.replace("</Types>", '<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>');
        zip.file(contentTypesPath, types);
        return true;
    });
}

async function writeWorkbook(request, outputPath) {
    const model = buildWorkbook(request);
    const raw = XLSX.write(model.wb, { type: "buffer", bookType: "xlsx", compression: true, bookSST: true });
    let zip = await JSZip.loadAsync(raw);
    const workbookXml = await zip.file("xl/workbook.xml").async("string");
    const sheetMatches = [...workbookXml.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="(rId\d+)"/g)];
    const relationships = await zip.file("xl/_rels/workbook.xml.rels").async("string");
    const relTargets = new Map([...relationships.matchAll(/<Relationship\b[^>]*Id="(rId\d+)"[^>]*Target="([^"]+)"/g)].map(match => [match[1], `xl/${match[2].replace(/^\//, "")}`]));
    for (const match of sheetMatches) {
        const sheetName = match[1];
        const target = relTargets.get(match[2]);
        if (!target || !zip.file(target)) continue;
        let xml = await zip.file(target).async("string");
        if (sheetName === "Dashboard" || sheetName === DATA_SHEET) xml = styleSheetXml(xml, sheetName, model.template, model.kind);
        if (sheetName === DATA_SHEET && (model.template.statusColumn || model.template.categoryColumn)) {
            const validations = [];
            if (model.template.statusColumn && model.template.statusValues.length) {
                const col = XLSX.utils.encode_col(model.template.statusColumn - 1);
                validations.push(`<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${col}2:${col}${MAX_ROWS + 1}"><formula1>"${xmlEscape(model.template.statusValues.join(","))}"</formula1></dataValidation>`);
            }
            if (model.template.categories?.length && model.kind !== "shopping") {
                const categoryCol = XLSX.utils.encode_col(model.template.categoryColumn - 1);
                validations.push(`<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${categoryCol}2:${categoryCol}${MAX_ROWS + 1}"><formula1>"${xmlEscape(model.template.categories.join(","))}"</formula1></dataValidation>`);
            }
            const validation = `<dataValidations count="${validations.length}">${validations.join("")}</dataValidations>`;
            // OOXML places dataValidations after autoFilter/mergeCells and before
            // page margins. Inserting it immediately after sheetData can cause
            // strict spreadsheet readers to repair or discard the dropdowns.
            xml = /<pageMargins\b/.test(xml)
                ? xml.replace(/<pageMargins\b/, `${validation}<pageMargins`)
                : xml.replace(/<\/worksheet>/, `${validation}</worksheet>`);
        }
        zip.file(target, xml);
    }
    zip.file("xl/styles.xml", STYLE_XML);
    await addDashboardChart(zip, model.template);
    const output = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
    require("fs").writeFileSync(outputPath, output, { flag: "wx" });
    return { path: outputPath, size: output.length, type: model.kind, title: model.template.title, rows: MAX_ROWS, sheets: ["Dashboard", DATA_SHEET, "Start Here"], chart: true };
}

module.exports = { buildWorkbook, classifyRequest, writeWorkbook };
