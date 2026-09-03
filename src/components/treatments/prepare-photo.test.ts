import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MAX_OUTPUT_BYTES,
  assertAcceptableInput,
  assertAcceptableOutput,
  prepareTreatmentPhoto,
} from "./prepare-photo";

const heicTo = vi.fn();
vi.mock("heic-to/csp", () => ({ heicTo: (args: unknown) => heicTo(args) }));

const compress = vi.fn();
vi.mock("browser-image-compression", () => ({ default: (file: unknown) => compress(file) }));

function fakeFile(name: string, type: string, size: number): File {
  const f = new File([new Uint8Array(1)], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

describe("assertAcceptableInput", () => {
  it("accepts a normal image", () => {
    expect(() => assertAcceptableInput(fakeFile("a.jpg", "image/jpeg", 2_000_000))).not.toThrow();
  });

  it("accepts a HEIC file even with an empty MIME type", () => {
    expect(() => assertAcceptableInput(fakeFile("IMG_1.HEIC", "", 3_000_000))).not.toThrow();
  });

  it("rejects a non-image file", () => {
    expect(() => assertAcceptableInput(fakeFile("notes.pdf", "application/pdf", 1000))).toThrow(
      /não é uma imagem/i,
    );
  });

  it("rejects an input larger than 25 MB", () => {
    expect(() => assertAcceptableInput(fakeFile("huge.jpg", "image/jpeg", 30 * 1024 * 1024))).toThrow(
      /muito grande/i,
    );
  });
});

describe("assertAcceptableOutput", () => {
  it("accepts a result at or below 400 KB", () => {
    expect(() => assertAcceptableOutput(MAX_OUTPUT_BYTES)).not.toThrow();
    expect(() => assertAcceptableOutput(120_000)).not.toThrow();
  });

  it("rejects a result above 400 KB", () => {
    expect(() => assertAcceptableOutput(MAX_OUTPUT_BYTES + 1)).toThrow(/reduzir/i);
  });
});

describe("prepareTreatmentPhoto", () => {
  beforeEach(() => {
    heicTo.mockReset();
    compress.mockReset();
    compress.mockResolvedValue(fakeFile("out.jpg", "image/jpeg", 100_000));
  });

  it("converts a HEIC input via heic-to/csp before compressing", async () => {
    const converted = fakeFile("mid.jpg", "image/jpeg", 5_000_000);
    heicTo.mockResolvedValue(converted);

    await prepareTreatmentPhoto(fakeFile("IMG_1.HEIC", "", 3_000_000));

    expect(heicTo).toHaveBeenCalledWith(
      expect.objectContaining({ type: "image/jpeg", quality: 0.9 }),
    );
    expect(compress).toHaveBeenCalledWith(converted);
  });

  it("skips heic-to/csp for a normal JPEG", async () => {
    const jpeg = fakeFile("a.jpg", "image/jpeg", 2_000_000);

    await prepareTreatmentPhoto(jpeg);

    expect(heicTo).not.toHaveBeenCalled();
    expect(compress).toHaveBeenCalledWith(jpeg);
  });

  it("surfaces a friendly error when conversion fails", async () => {
    heicTo.mockRejectedValue(new Error("worker blocked"));

    await expect(
      prepareTreatmentPhoto(fakeFile("IMG_2.heic", "image/heic", 3_000_000)),
    ).rejects.toThrow(/Exporte como JPEG/i);
  });
});
