import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const RES = path.resolve("resources");
// 两套母版：<=32px 用简化加粗版，保证任务栏小图标还能看清天秤符号
const masters = {
  full: fs.readFileSync(path.join(RES, "icon.svg")),
  small: fs.readFileSync(path.join(RES, "icon-small.svg"))
};
const pick = (size) => (size <= 32 ? masters.small : masters.full);

const OUT = path.join(RES, "icons");
fs.mkdirSync(OUT, { recursive: true });

const SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const pngs = {};

for (const size of SIZES) {
  const buffer = await sharp(pick(size), { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
  pngs[size] = buffer;
  // 只有 1024 需要落盘（electron-builder 用它转 mac .icns），其余尺寸只进 .ico
  if (size === 1024) fs.writeFileSync(path.join(OUT, `icon-${size}.png`), buffer)
}

fs.writeFileSync(path.join(RES, "icon.png"), pngs[512]);

function buildIco(entries) {
  const count = entries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  let offset = 6 + count * 16;
  const dir = Buffer.alloc(count * 16);

  entries.forEach(({ size, data }, index) => {
    const base = index * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, base);
    dir.writeUInt8(size >= 256 ? 0 : size, base + 1);
    dir.writeUInt8(0, base + 2);
    dir.writeUInt8(0, base + 3);
    dir.writeUInt16LE(1, base + 4);
    dir.writeUInt16LE(32, base + 6);
    dir.writeUInt32LE(data.length, base + 8);
    dir.writeUInt32LE(offset, base + 12);
    offset += data.length;
  });

  return Buffer.concat([header, dir, ...entries.map((entry) => entry.data)]);
}

const ico = buildIco([16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, data: pngs[size] })));
fs.mkdirSync(path.resolve("build"), { recursive: true });
fs.writeFileSync(path.resolve("build/icon.ico"), ico);

console.log("icons:", SIZES.map((s) => `${s}px`).join(", "));
console.log("ico bytes:", ico.length);
