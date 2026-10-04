// Writes the two labelled placeholder PNGs used by web/fixtures/ws6 (WS6 S0, T015).
// They are synthetic test images, NOT real captures. Run: `npx tsx scripts/make-fixture-pngs.mts`
// If you regenerate them, update sha256/width/height in fixtures/ws6/evidence-asset.json.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const WIDTH = 320;
const HEIGHT = 180;
const COMMENT = "FIXTURE placeholder, not real capture";
/** Highlight box in pixels; matches region {x:0.25, y:0.3, width:0.25, height:0.4} in pointing-event.json. */
const HIGHLIGHT = { x: 80, y: 54, w: 80, h: 72 };

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "ws6");

type Rgb = readonly [number, number, number];
const GRAY: Rgb = [200, 200, 200];
const DARK: Rgb = [40, 40, 40];
const RED: Rgb = [220, 0, 0];

// 5x7 block glyphs for the banner text.
const GLYPHS: Record<string, string[]> = {
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
};

function makeCanvas(): Uint8Array {
  const px = new Uint8Array(WIDTH * HEIGHT * 3);
  for (let i = 0; i < WIDTH * HEIGHT; i++) px.set(GRAY, i * 3);
  return px;
}

function setPx(px: Uint8Array, x: number, y: number, c: Rgb): void {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
  px.set(c, (y * WIDTH + x) * 3);
}

function fillRect(px: Uint8Array, x: number, y: number, w: number, h: number, c: Rgb): void {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) setPx(px, i, j, c);
}

function drawBanner(px: Uint8Array, text: string): void {
  const scale = 4;
  const glyphW = 5 * scale + scale; // glyph + 1-col gap
  const totalW = text.length * glyphW - scale;
  const x0 = Math.floor((WIDTH - totalW) / 2);
  const y0 = 8;
  fillRect(px, x0 - scale, y0 - scale, totalW + 2 * scale, 7 * scale + 2 * scale, [235, 235, 235]);
  [...text].forEach((ch, k) => {
    GLYPHS[ch].forEach((row, r) =>
      [...row].forEach((bit, col) => {
        if (bit === "1") fillRect(px, x0 + k * glyphW + col * scale, y0 + r * scale, scale, scale, DARK);
      }),
    );
  });
}

function drawPattern(px: Uint8Array): void {
  // Simple neutral checker band so the image is not uniform; carries no trace meaning.
  for (let j = 60; j < 170; j += 10) for (let i = 10; i < 310; i += 20) fillRect(px, i + ((j / 10) % 2) * 10, j, 10, 10, [170, 170, 170]);
}

function strokeRect(px: Uint8Array, x: number, y: number, w: number, h: number, c: Rgb, t: number): void {
  fillRect(px, x, y, w, t, c);
  fillRect(px, x, y + h - t, w, t, c);
  fillRect(px, x, y, t, h, c);
  fillRect(px, x + w - t, y, t, h, c);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(px: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const raw = Buffer.alloc(HEIGHT * (1 + WIDTH * 3));
  for (let y = 0; y < HEIGHT; y++) {
    raw[y * (1 + WIDTH * 3)] = 0; // filter: none
    Buffer.from(px.subarray(y * WIDTH * 3, (y + 1) * WIDTH * 3)).copy(raw, y * (1 + WIDTH * 3) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("tEXt", Buffer.from(`Comment\0${COMMENT}`, "latin1")),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

const base = makeCanvas();
drawPattern(base);
drawBanner(base, "FIXTURE");

const highlighted = base.slice();
strokeRect(highlighted, HIGHLIGHT.x, HIGHLIGHT.y, HIGHLIGHT.w, HIGHLIGHT.h, RED, 3);

mkdirSync(outDir, { recursive: true });
for (const [name, px] of [
  ["fixture-frame.png", base],
  ["fixture-frame-highlighted.png", highlighted],
] as const) {
  const png = encodePng(px);
  writeFileSync(join(outDir, name), png);
  const sha256 = createHash("sha256").update(png).digest("hex");
  console.log(`${name}  ${WIDTH}x${HEIGHT}  ${png.length} bytes  sha256=${sha256}`);
}
