const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "renderer", "index.html"), "utf8").replace(/<!--[\s\S]*?-->/g, "");
const voidTags = new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr","path","circle","rect","line","polygon","polyline","use","stop","ellipse"]);
const tokens = html.match(/<\/?[a-zA-Z][^>]*>/g) || [];
let depth = 0; let out = [];
for (const t of tokens) {
  const closing = t.startsWith("</");
  const m = t.match(/^<\/?([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)\/?>$/);
  if (!m) continue;
  const tag = m[1].toLowerCase();
  const attrs = m[2] || "";
  const selfClose = t.endsWith("/>") || voidTags.has(tag);
  if (closing) { depth = Math.max(0, depth - 1); continue; }
  if (["script","style","head","meta","link","title"].includes(tag)) { if(!selfClose) depth++; continue; }
  const id = (attrs.match(/\bid="([^"]*)"/) || [])[1] || "";
  const cls = (attrs.match(/\bclass="([^"]*)"/) || [])[1] || "";
  const dataView = (attrs.match(/\bdata-view="([^"]*)"/) || [])[1] || "";
  if (depth <= 4 && (id || cls)) {
    out.push("  ".repeat(depth) + "<" + tag + (id ? " #" + id : "") + (cls ? " ." + cls.trim().split(/\s+/).join(".") : "") + (dataView ? " [view=" + dataView + "]" : "") + ">");
  }
  if (!selfClose) depth++;
}
console.log(out.join("\n"));
