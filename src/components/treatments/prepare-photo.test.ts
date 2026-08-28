import { describe, it, expect } from "vitest";
import {
  MAX_OUTPUT_BYTES,
  assertAcceptableInput,
  assertAcceptableOutput,
} from "./prepare-photo";

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
