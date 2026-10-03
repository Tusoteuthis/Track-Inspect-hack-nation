/** Magic-byte sniffing and dimension reading for PNG and JPEG (no native deps; see research R3). */
export type ImageInfo = {
  mime: "image/png" | "image/jpeg";
  ext: "png" | "jpg";
  width_px: number;
  height_px: number;
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IHDR = [0x49, 0x48, 0x44, 0x52];

const u16 = (b: Uint8Array, i: number): number => (b[i] << 8) | b[i + 1];
const u32 = (b: Uint8Array, i: number): number => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;

function startsWith(bytes: Uint8Array, prefix: number[], offset = 0): boolean {
  return bytes.length >= offset + prefix.length && prefix.every((v, i) => bytes[offset + i] === v);
}

function sniffPng(bytes: Uint8Array): ImageInfo | null {
  if (bytes.length < 24 || !startsWith(bytes, IHDR, 12)) return null;
  const width = u32(bytes, 16);
  const height = u32(bytes, 20);
  if (width === 0 || height === 0) return null;
  return { mime: "image/png", ext: "png", width_px: width, height_px: height };
}

function isSof(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function isStandalone(marker: number): boolean {
  return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9);
}

function sniffJpeg(bytes: Uint8Array): ImageInfo | null {
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    while (i < bytes.length && bytes[i] === 0xff) i++;
    if (i >= bytes.length) return null;
    const marker = bytes[i++];
    if (marker === 0xd9 || marker === 0xda) return null; // EOI / SOS before any frame header
    if (isStandalone(marker)) continue;
    if (i + 2 > bytes.length) return null;
    const length = u16(bytes, i);
    if (length < 2) return null;
    if (isSof(marker)) {
      if (i + 7 > bytes.length) return null;
      const height = u16(bytes, i + 3);
      const width = u16(bytes, i + 5);
      if (width === 0 || height === 0) return null;
      return { mime: "image/jpeg", ext: "jpg", width_px: width, height_px: height };
    }
    i += length;
  }
  return null;
}

export function sniffImage(bytes: Uint8Array): ImageInfo | null {
  if (startsWith(bytes, PNG_SIGNATURE)) return sniffPng(bytes);
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return sniffJpeg(bytes);
  return null;
}
