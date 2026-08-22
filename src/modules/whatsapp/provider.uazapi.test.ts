import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createInMemoryWhatsappRepository } from "./repository.memory";
import { createUazapiProvider, normalizeWhatsappJid } from "./provider.uazapi";

describe("normalizeWhatsappJid", () => {
  it("strips the JID suffix, leaving only the phone number", () => {
    expect(normalizeWhatsappJid("5511999999999@s.whatsapp.net")).toBe("5511999999999");
    expect(normalizeWhatsappJid("5511999999999")).toBe("5511999999999");
  });
});

describe("UazapiProvider", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function seedConfig(repo: ReturnType<typeof createInMemoryWhatsappRepository>) {
    await repo.updateConnectionConfig("acc-1", "uazapi", {
      subdomain: "minhaclinica",
      token: "abc123",
      webhookSecret: "sekret",
    });
  }

  it("throws when connect is called without a saved config", async () => {
    const repo = createInMemoryWhatsappRepository();
    const provider = createUazapiProvider(repo);
    await expect(provider.connect("acc-1")).rejects.toThrow();
  });

  it("saves the QR code and sets status to connecting on connect", async () => {
    const repo = createInMemoryWhatsappRepository();
    await seedConfig(repo);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ qrcode: "data:image/png;base64,abc" }),
    });

    const provider = createUazapiProvider(repo);
    await provider.connect("acc-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://minhaclinica.uazapi.com/instance/connect",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ token: "abc123" }),
      }),
    );
    expect(await provider.getQrCode("acc-1")).toBe("data:image/png;base64,abc");
    const connection = await repo.getConnection("acc-1");
    expect(connection?.status).toBe("connecting");
  });

  it("maps the hibernated status to disconnected", async () => {
    const repo = createInMemoryWhatsappRepository();
    await seedConfig(repo);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: "hibernated" }) });

    const provider = createUazapiProvider(repo);
    const status = await provider.getConnectionStatus("acc-1");

    expect(status).toBe("disconnected");
  });

  it("sends a text message and returns the providerMessageId from the response", async () => {
    const repo = createInMemoryWhatsappRepository();
    await seedConfig(repo);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "msg-123" }) });

    const provider = createUazapiProvider(repo);
    const result = await provider.sendMessage("acc-1", "5511999999999", "Olá!");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://minhaclinica.uazapi.com/send/text",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ number: "5511999999999", text: "Olá!" }),
      }),
    );
    expect(result.providerMessageId).toBe("msg-123");
  });

  it("clears the connection status and QR code on disconnect", async () => {
    const repo = createInMemoryWhatsappRepository();
    await seedConfig(repo);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    await repo.updateConnectionQrCode("acc-1", "data:image/png;base64,abc");

    const provider = createUazapiProvider(repo);
    await provider.disconnect("acc-1");

    const connection = await repo.getConnection("acc-1");
    expect(connection?.status).toBe("disconnected");
    expect(connection?.qrCode).toBeNull();
  });
});
