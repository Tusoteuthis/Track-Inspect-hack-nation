import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sniffImage } from "./image-info";

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(path.join(process.cwd(), "fixtures", "ws6", name)));

/** SOI + APP0 (JFIF) + fill byte + SOF0 (height 0x01F4 = 500, width 0x0280 = 640) + EOI. */
function tinyJpeg(sofMarker = 0xc0): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xff, sofMarker, 0x00, 0x11, 0x08, 0x01, 0xf4, 0x02, 0x80, 0x03,
    0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xff, 0xd9,
  ]);
}

describe("sniffImage", () => {
  it("reads PNG dimensions from IHDR", () => {
    expect(sniffImage(fixture("fixture-frame.png"))).toEqual({
      mime: "image/png",
      ext: "png",
      width_px: 320,
      height_px: 180,
    });
  });

  it("reads JPEG dimensions from the first SOF marker, skipping APP segments and fill bytes", () => {
    expect(sniffImage(tinyJpeg())).toEqual({ mime: "image/jpeg", ext: "jpg", width_px: 640, height_px: 500 });
    expect(sniffImage(tinyJpeg(0xc2))).toMatchObject({ width_px: 640, height_px: 500 });
  });

  it("does not treat DHT (C4) as a frame header", () => {
    const bytes = tinyJpeg(0xc4);
    expect(sniffImage(bytes)).toBeNull();
  });

  it("skips standalone markers", () => {
    const jpeg = tinyJpeg();
    const withRst = Uint8Array.from([...jpeg.slice(0, 2), 0xff, 0xd0, 0xff, 0x01, ...jpeg.slice(2)]);
    expect(sniffImage(withRst)).toMatchObject({ width_px: 640, height_px: 500 });
  });

  it.each([
    ["GIF", Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00])],
    ["WebP", new TextEncoder().encode("RIFF\x10\x00\x00\x00WEBPVP8 ")],
    ["garbage", new TextEncoder().encode("hello world, not an image at all")],
    ["empty", new Uint8Array(0)],
    ["truncated PNG", fixture("fixture-frame.png").slice(0, 20)],
    ["truncated JPEG", tinyJpeg().slice(0, 26)],
    ["JPEG without SOF", Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])],
  ])("returns null for %s", (_name, bytes) => {
    expect(sniffImage(bytes)).toBeNull();
  });

  it("rejects a PNG signature without an IHDR chunk", () => {
    const png = fixture("fixture-frame.png").slice(0, 32);
    png[12] = 0x58;
    expect(sniffImage(png)).toBeNull();
  });

  it("rejects zero dimensions", () => {
    const png = fixture("fixture-frame.png").slice(0, 32);
    png.fill(0, 16, 20);
    expect(sniffImage(png)).toBeNull();
  });
});
