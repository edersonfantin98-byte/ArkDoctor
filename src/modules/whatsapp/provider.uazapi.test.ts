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

  it("includes the response status and body when connect fails", async () => {
    const repo = createInMemoryWhatsappRepository();
    await seedConfig(repo);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Invalid token",
    });

    const provider = createUazapiProvider(repo);
    await expect(provider.connect("acc-1")).rejects.toThrow(/401/);
    await expect(provider.connect("acc-1")).rejects.toThrow(/Invalid token/);
  });

  it("saves the QR code and sets status to connecting on connect", async () => {
    const repo = createInMemoryWhatsappRepository();
    await seedConfig(repo);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        connected: false,
        instance: { status: "connecting", qrcode: "data:image/png;base64,abc" },
      }),
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

  it("marks the connection as connected when the instance is already connected", async () => {
    const repo = createInMemoryWhatsappRepository();
    await seedConfig(repo);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        connected: true,
        instance: { status: "connected", qrcode: "" },
        response: "Already connected",
      }),
    });

    const provider = createUazapiProvider(repo);
    await provider.connect("acc-1");

    const connection = await repo.getConnection("acc-1");
    expect(connection?.status).toBe("connected");
    expect(connection?.qrCode).toBeNull();
  });

  it("still connects and produces a QR code when webhook registration fails at the transport level", async () => {
    const repo = createInMemoryWhatsappRepository();
    await seedConfig(repo);
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith("/webhook")) return Promise.reject(new Error("getaddrinfo ENOTFOUND"));
      return Promise.resolve({
        ok: true,
        json: async () => ({
          connected: false,
          instance: { status: "connecting", qrcode: "data:image/png;base64,abc" },
        }),
      });
    });

    const provider = createUazapiProvider(repo);
    await provider.connect("acc-1");

    expect(await provider.getQrCode("acc-1")).toBe("data:image/png;base64,abc");
    const connection = await repo.getConnection("acc-1");
    expect(connection?.status).toBe("connecting");
  });

  it("maps the hibernated status to disconnected", async () => {
    const repo = createInMemoryWhatsappRepository();
    await seedConfig(repo);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ instance: { status: "hibernated" } }),
    });

    const provider = createUazapiProvider(repo);
    const status = await provider.getConnectionStatus("acc-1");

    expect(status).toBe("disconnected");
  });

  it("reads the connected status from the nested instance object", async () => {
    const repo = createInMemoryWhatsappRepository();
    await seedConfig(repo);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ instance: { status: "connected" }, status: { connected: true } }),
    });

    const provider = createUazapiProvider(repo);
    const status = await provider.getConnectionStatus("acc-1");

    expect(status).toBe("connected");
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

async function repoWithUazapi() {
  const repo = createInMemoryWhatsappRepository();
  await repo.updateConnectionConfig("acc-1", "uazapi", {
    subdomain: "arkscrapper",
    token: "tok-1",
    webhookSecret: "sec-1",
  });
  return repo;
}

describe("UazapiProvider.downloadMedia", () => {
  afterEach(() => vi.restoreAllMocks());

  it("chama /message/download e baixa o fileURL retornado", async () => {
    const repo = await repoWithUazapi();
    const provider = createUazapiProvider(repo);
    const bytes = new Uint8Array([1, 2, 3, 4]);

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.endsWith("/message/download")) {
        expect(JSON.parse(String(init?.body))).toEqual({ id: "MID-1" });
        return new Response(
          JSON.stringify({
            fileURL: "https://arkscrapper.uazapi.com/files/abc.jpg",
            mimetype: "image/jpeg",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (u === "https://arkscrapper.uazapi.com/files/abc.jpg") {
        return new Response(bytes, { status: 200, headers: { "content-type": "image/jpeg" } });
      }
      throw new Error("URL inesperada: " + u);
    });

    const result = await provider.downloadMedia("acc-1", "MID-1");
    expect(Array.from(result.bytes)).toEqual([1, 2, 3, 4]);
    expect(result.mime).toBe("image/jpeg");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("lança quando /message/download não devolve fileURL", async () => {
    const repo = await repoWithUazapi();
    const provider = createUazapiProvider(repo);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "not found" }), { status: 200 }),
    );
    await expect(provider.downloadMedia("acc-1", "MID-x")).rejects.toThrow("Falha ao baixar mídia");
  });
});

describe("UazapiProvider.sendMedia", () => {
  afterEach(() => vi.restoreAllMocks());

  it("faz POST em /send/media com base64 e devolve o messageid", async () => {
    const repo = await repoWithUazapi();
    const provider = createUazapiProvider(repo);

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messageid: "MID-1", id: "556:MID-1" }), { status: 200 }),
    );

    const result = await provider.sendMedia("acc-1", "556696746676", {
      type: "image",
      dataBase64: "QUJD",
      filename: null,
      caption: "legenda",
    });

    expect(result.providerMessageId).toBe("MID-1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://arkscrapper.uazapi.com/send/media");
    expect(JSON.parse(String(init?.body))).toEqual({
      number: "556696746676",
      type: "image",
      file: "QUJD",
      text: "legenda",
    });
  });

  it("inclui docName quando é documento com filename", async () => {
    const repo = await repoWithUazapi();
    const provider = createUazapiProvider(repo);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messageid: "MID-2" }), { status: 200 }),
    );

    await provider.sendMedia("acc-1", "556696746676", {
      type: "document",
      dataBase64: "QUJD",
      filename: "relatorio.pdf",
      caption: "",
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      type: "document",
      docName: "relatorio.pdf",
    });
  });

  it("lança com a mensagem de erro da Uazapi quando o status não é 2xx", async () => {
    const repo = await repoWithUazapi();
    const provider = createUazapiProvider(repo);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "failed to process file" }), { status: 500 }),
    );

    await expect(
      provider.sendMedia("acc-1", "556696746676", {
        type: "image",
        dataBase64: "QUJD",
        filename: null,
        caption: "",
      }),
    ).rejects.toThrow("failed to process file");
  });
});
