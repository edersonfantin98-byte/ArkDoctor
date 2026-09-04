import { describe, it, expect } from "vitest";
import { mapUazapiMessage } from "./message-mapping";

describe("mapUazapiMessage", () => {
  it("parses a plain text message", () => {
    const result = mapUazapiMessage({
      fromMe: false,
      messageType: "Conversation",
      messageTimestamp: 1788445013000,
      sender_pn: "556696604575@s.whatsapp.net",
      senderName: "Ederson Fernandes",
      text: "oi",
    });
    expect(result).toEqual({
      fromMe: false,
      body: "oi",
      timestampMs: 1788445013000,
      senderJid: "556696604575@s.whatsapp.net",
      senderName: "Ederson Fernandes",
      media: null,
    });
  });

  it("parses an image message with caption", () => {
    const result = mapUazapiMessage({
      fromMe: false,
      messageType: "ImageMessage",
      messageTimestamp: 1788445100000,
      messageid: "3AFC432F36B07600E616",
      sender_pn: "556696604575@s.whatsapp.net",
      senderName: "Ederson Fernandes",
      text: "Ola amigo",
      content: { mimetype: "image/jpeg", caption: "Ola amigo", fileLength: 125831 },
    });
    expect(result).toEqual({
      fromMe: false,
      body: "Ola amigo",
      timestampMs: 1788445100000,
      senderJid: "556696604575@s.whatsapp.net",
      senderName: "Ederson Fernandes",
      media: {
        providerMessageId: "3AFC432F36B07600E616",
        type: "image",
        mime: "image/jpeg",
        filename: null,
        fileLength: 125831,
      },
    });
  });

  it("parses a document message with fileName and fromMe true", () => {
    const result = mapUazapiMessage({
      fromMe: true,
      messageType: "DocumentMessage",
      messageTimestamp: 1788445200000,
      messageid: "3AAED69C92FBA6BAE2C1",
      text: "",
      content: {
        mimetype: "application/pdf",
        fileName: "processo.pdf",
        fileLength: 2413752,
      },
    });
    expect(result?.fromMe).toBe(true);
    expect(result?.media).toEqual({
      providerMessageId: "3AAED69C92FBA6BAE2C1",
      type: "document",
      mime: "application/pdf",
      filename: "processo.pdf",
      fileLength: 2413752,
    });
  });

  it("returns null for a non-media message without a text field", () => {
    expect(mapUazapiMessage({ fromMe: false, messageType: "Conversation" })).toBeNull();
  });

  it("returns senderJid and timestampMs null when absent (webhook fixtures não têm messageTimestamp)", () => {
    const result = mapUazapiMessage({ fromMe: false, text: "oi sem sender" });
    expect(result).toEqual({
      fromMe: false,
      body: "oi sem sender",
      timestampMs: null,
      senderJid: null,
      senderName: null,
      media: null,
    });
  });

  it("returns null for non-object input", () => {
    expect(mapUazapiMessage(null)).toBeNull();
    expect(mapUazapiMessage("oi")).toBeNull();
    expect(mapUazapiMessage(undefined)).toBeNull();
  });
});
