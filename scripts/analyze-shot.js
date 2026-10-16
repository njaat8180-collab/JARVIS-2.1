const sharp = require("sharp");
const path = require("path");
const dir = path.join(__dirname, "..", "artifacts", "desktop-verification");
const file = process.argv[2] || "dashboard.png";
const cols = 110;
(async () => {
  const img = sharp(path.join(dir, file));
  const meta = await img.metadata();
  const rows = Math.round(cols * (meta.height / meta.width) * 0.5);
  const { data, info } = await sharp(path.join(dir, file))
    .resize(cols, rows, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const chars = " .:-=+*#%@";
  let out = "";
  for (let y = 0; y < info.height; y++) {
    let line = "";
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      const l = (0.299*data[i] + 0.587*data[i+1] + 0.114*data[i+2]) / 255;
      line += chars[Math.min(chars.length-1, Math.floor(l * chars.length))];
    }
    out += line + "\n";
  }
  console.log("== LUMINANCE " + file + " (" + meta.width + "x" + meta.height + ") ==");
  console.log(out);
  // color grid 10 x 12
  const cg = 10, cw = 12;
  const s2 = await sharp(path.join(dir, file)).resize(cg, cw, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  console.log("== COLOR GRID (x=col left->right, y=row top->bottom) ==");
  for (let y = 0; y < s2.info.height; y++) {
    let line = "";
    for (let x = 0; x < s2.info.width; x++) {
      const i = (y * s2.info.width + x) * s2.info.channels;
      line += "#" + [s2.data[i],s2.data[i+1],s2.data[i+2]].map(v=>v.toString(16).padStart(2,"0")).join("") + " ";
    }
    console.log(line);
  }
})();
