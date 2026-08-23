import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createInMemoryWhatsappRepository } from "./repository.memory";
import { createEvolutionProvider } from "./provider.evolution";

describe("EvolutionProvider", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function seedConfig(repo: ReturnType<typeof createInMemoryWhatsappRepository>) {
    await repo.updateConnectionConfig("acc-1", "evolution", {
      baseUrl: "https://evolution.minhaclinica.com",
      instanceName: "arkdoctor",
      apiKey: "global-key-123",
      webhookSecret: "sekret",
    });
  }

  it("throws when connect is called without a saved config", async () => {
    const repo = createInMemoryWhatsappRepository();
    const provider = createEvolutionProvider(repo);
    await expect(provider.connect("acc-1")).rejects.toThrow();
  });

  it("creates the instance and saves its QR code when it doesn't exist yet", async () => {
    const repo = createInMemoryWhatsappRepository();
    await seedConfig(repo);
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith("/webhook/set/arkdoctor")) return Promise.reject(new Error("network error"));
      if (url.endsWith("/instance/connectionState/arkdoctor")) {
        return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
      }
      if (url.endsWith("/instance/create")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ qrcode: { base64: "data:image/png;base64,new-instance" } }),
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const provider = createEvolutionProvider(repo);
    await provider.connect("acc-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://evolution.minhaclinica.com/instance/create",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ apikey: "global-key-123" }),
        body: JSON.stringify({
          instanceName: "arkdoctor",
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
        }),
      }),
    );
    expect(await provider.getQrCode("acc-1")).toBe("data:image/png;base64,new-instance");
    const connection = await repo.getConnection("acc-1");
    expect(connection?.status).toBe("connecting");
  });

  it("fetches a fresh QR code when the instance already exists", async () => {
    const repo = createInMemoryWhatsappRepository();
    await seedConfig(repo);
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith("/webhook/set/arkdoctor")) return Promise.resolve({ ok: true, json: async () => ({}) });
      if (url.endsWith("/instance/connectionState/arkdoctor")) {
        return Promise.resolve({ ok: true, json: async () => ({ instance: { state: "close" } }) });
      }
      if (url.endsWith("/instance/connect/arkdoctor")) {
        return Promise.resolve({ ok: true, json: async () => ({ qrcode: "data:image/png;base64,existing" }) });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const provider = createEvolutionProvider(repo);
    await provider.connect("acc-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://evolution.minhaclinica.com/instance/connect/arkdoctor",
      expect.objectContaining({ method: "GET", headers: expect.objectContaining({ apikey: "global-key-123" }) }),
    );
    expect(await provider.getQrCode("acc-1")).toBe("data:image/png;base64,existing");
  });

  it("still connects when webhook registration fails at the transport level", async () => {
    const repo = createInMemoryWhatsappRepository();
    await seedConfig(repo);
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith("/webhook/set/arkdoctor")) return Promise.reject(new Error("getaddrinfo ENOTFOUND"));
      if (url.endsWith("/instance/connectionState/arkdoctor")) {
        return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
      }
      if (url.endsWith("/instance/create")) {
        return Promise.resolve({ ok: true, json: async () => ({ qrcode: { base64: "data:image/png;base64,ok" } }) });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const provider = createEvolutionProvider(repo);
    await provider.connect("acc-1");

    const connection = await repo.getConnection("acc-1");
    expect(connection?.status).toBe("connecting");
  });

  it("maps connection states: open to connected, close to disconnected, connecting to connecting", async () => {
    const repo = createInMemoryWhatsappRepository();
    await seedConfig(repo);
    const provider = createEvolutionProvider(repo);

    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ instance: { state: "open" } }) });
    expect(await provider.getConnectionStatus("acc-1")).toBe("connected");

    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ instance: { state: "close" } }) });
    expect(await provider.getConnectionStatus("acc-1")).toBe("disconnected");

    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ instance: { state: "connecting" } }) });
    expect(await provider.getConnectionStatus("acc-1")).toBe("connecting");
  });

  it("clears the QR code once the status comes back connected", async () => {
    const repo = createInMemoryWhatsappRepository();
    await seedConfig(repo);
    await repo.updateConnectionQrCode("acc-1", "data:image/png;base64,stale");
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ instance: { state: "open" } }) });

    const provider = createEvolutionProvider(repo);
    await provider.getConnectionStatus("acc-1");

    expect(await provider.getQrCode("acc-1")).toBeNull();
  });

  it("sends a text message and returns the providerMessageId from the response", async () => {
    const repo = createInMemoryWhatsappRepository();
    await seedConfig(repo);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: "msg-123", remoteJid: "5511999999999@s.whatsapp.net" } }),
    });

    const provider = createEvolutionProvider(repo);
    const result = await provider.sendMessage("acc-1", "5511999999999", "Olá!");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://evolution.minhaclinica.com/message/sendText/arkdoctor",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ apikey: "global-key-123" }),
        body: JSON.stringify({ number: "5511999999999", text: "Olá!" }),
      }),
    );
    expect(result.providerMessageId).toBe("msg-123");
  });

  it("clears the connection status and QR code on disconnect", async () => {
    const repo = createInMemoryWhatsappRepository();
    await seedConfig(repo);
    await repo.updateConnectionQrCode("acc-1", "data:image/png;base64,abc");
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

    const provider = createEvolutionProvider(repo);
    await provider.disconnect("acc-1");

    const connection = await repo.getConnection("acc-1");
    expect(connection?.status).toBe("disconnected");
    expect(connection?.qrCode).toBeNull();
  });
});
