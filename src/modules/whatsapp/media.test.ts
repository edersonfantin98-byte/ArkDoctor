import { describe, it, expect } from "vitest";
import {
  mediaTypeFromUazapi,
  extFromMime,
  storagePathFor,
  safeContentType,
} from "./media";

describe("mediaTypeFromUazapi", () => {
  it("maps the four known Uazapi message types", () => {
    expect(mediaTypeFromUazapi("ImageMessage")).toBe("image");
    expect(mediaTypeFromUazapi("AudioMessage")).toBe("audio");
    expect(mediaTypeFromUazapi("VideoMessage")).toBe("video");
    expect(mediaTypeFromUazapi("DocumentMessage")).toBe("document");
  });

  it("returns null for an unknown type", () => {
    expect(mediaTypeFromUazapi("Conversation")).toBeNull();
  });
});

describe("extFromMime", () => {
  it("maps common mimes to friendly extensions", () => {
    expect(extFromMime("image/jpeg")).toBe("jpg");
    expect(extFromMime("audio/ogg; codecs=opus")).toBe("ogg");
    expect(extFromMime("application/pdf")).toBe("pdf");
  });

  it("falls back to the subtype for an unknown mime", () => {
    expect(extFromMime("application/x-weird")).toBe("x-weird");
  });

  it("falls back to bin for garbage", () => {
    expect(extFromMime("???")).toBe("bin");
  });
});

describe("storagePathFor", () => {
  it("builds an account/conversation/message.ext path", () => {
    expect(storagePathFor("a", "b", "c", "image/jpeg")).toBe("a/b/c.jpg");
  });
});

describe("safeContentType", () => {
  it("keeps a provider mime that matches the declared media type", () => {
    expect(safeContentType("image", "image/png")).toBe("image/png");
    expect(safeContentType("audio", "audio/ogg; codecs=opus")).toBe("audio/ogg; codecs=opus");
    expect(safeContentType("video", "video/mp4")).toBe("video/mp4");
  });

  it("rejects a mismatched mime for media with a fixed family", () => {
    expect(safeContentType("image", "text/html")).toBe("application/octet-stream");
    expect(safeContentType("audio", "application/pdf")).toBe("application/octet-stream");
    expect(safeContentType("video", "image/gif")).toBe("application/octet-stream");
  });

  it("trusts the provider mime for documents", () => {
    expect(safeContentType("document", "application/pdf")).toBe("application/pdf");
    expect(safeContentType("document", "")).toBe("application/octet-stream");
  });
});
