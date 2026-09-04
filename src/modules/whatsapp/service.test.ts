import { describe, it, expect, vi, afterEach } from "vitest";
import { createInMemoryWhatsappRepository } from "./repository.memory";
import { createInMemoryCrmRepository } from "../crm/repository.memory";
import { createFakeWhatsappProvider } from "./provider.fake";
import { createFakeWhatsappMediaStorage } from "./storage.fake";
import { MAX_MEDIA_BYTES } from "./media";
import * as crm from "../crm/service";
import {
  startConversation,
  logMessage,
  sendMediaMessage,
  runMediaRetention,
  getConversationMessages,
  handleInboundMessage,
  importWhatsappHistory,
  getConnectionStatus,
  connectWhatsapp,
  disconnectWhatsapp,
  resetUnreadCount,
  isValidWebhookSecret,
  parseWebhookPayload,
  personalizeMessage,
  sendBulkMessages,
} from "./service";
import type { UazapiChat } from "./provider.uazapi";

describe("whatsapp service", () => {
  it("rejects logging a message on a conversation that doesn't exist", async () => {
    const repo = createInMemoryWhatsappRepository();
    const provider = createFakeWhatsappProvider(repo);
    await expect(
      logMessage(repo, provider, "acc-1", "does-not-exist", { direction: "outbound", body: "oi" }),
    ).rejects.toThrow("Conversa não encontrada");
  });

  it("updates the conversation preview when a message is logged", async () => {
    const repo = createInMemoryWhatsappRepository();
    const provider = createFakeWhatsappProvider(repo);
    const conversation = await startConversation(repo, "acc-1", {
      contactId: null,
      contactName: "Carla Souza",
      contactPhone: "51991234477",
    });
    await logMessage(repo, provider, "acc-1", conversation.id, {
      direction: "outbound",
      body: "Confirmado!",
    });
    const messages = await getConversationMessages(repo, "acc-1", conversation.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].body).toBe("Confirmado!");
  });

  it("calls the provider to send an outbound message before logging it", async () => {
    const repo = createInMemoryWhatsappRepository();
    const provider = createFakeWhatsappProvider(repo);
    const conversation = await startConversation(repo, "acc-1", {
      contactId: null,
      contactName: "Carla Souza",
      contactPhone: "51991234477",
    });

    const sendSpy = vi.spyOn(provider, "sendMessage");

    await logMessage(repo, provider, "acc-1", conversation.id, {
      direction: "outbound",
      body: "Confirmado!",
    });

    expect(sendSpy).toHaveBeenCalledWith("acc-1", "51991234477", "Confirmado!");
  });

  it("blocks an outbound message when the connection exists but is not connected", async () => {
    const repo = createInMemoryWhatsappRepository();
    const provider = createFakeWhatsappProvider(repo);
    await repo.upsertConnectionStatus("acc-1", "disconnected", null);
    const conversation = await startConversation(repo, "acc-1", {
      contactId: null,
      contactName: "Carla Souza",
      contactPhone: "51991234477",
    });
    const sendSpy = vi.spyOn(provider, "sendMessage");

    const result = await logMessage(repo, provider, "acc-1", conversation.id, {
      direction: "outbound",
      body: "Confirmado!",
    });

    expect(result).toEqual({
      ok: false,
      error: "WhatsApp desconectado. Conecte para enviar mensagens.",
    });
    expect(sendSpy).not.toHaveBeenCalled();
    const messages = await getConversationMessages(repo, "acc-1", conversation.id);
    expect(messages).toHaveLength(0);
  });

  it("allows an outbound message when the connection is connected", async () => {
    const repo = createInMemoryWhatsappRepository();
    const provider = createFakeWhatsappProvider(repo);
    await repo.upsertConnectionStatus("acc-1", "connected", new Date().toISOString());
    const conversation = await startConversation(repo, "acc-1", {
      contactId: null,
      contactName: "Carla Souza",
      contactPhone: "51991234477",
    });

    const result = await logMessage(repo, provider, "acc-1", conversation.id, {
      direction: "outbound",
      body: "Confirmado!",
    });

    expect(result.ok).toBe(true);
    const messages = await getConversationMessages(repo, "acc-1", conversation.id);
    expect(messages).toHaveLength(1);
  });

  it("returns the provider send failure as data instead of throwing", async () => {
    const repo = createInMemoryWhatsappRepository();
    const provider = createFakeWhatsappProvider(repo);
    await repo.upsertConnectionStatus("acc-1", "connected", new Date().toISOString());
    const conversation = await startConversation(repo, "acc-1", {
      contactId: null,
      contactName: "Carla Souza",
      contactPhone: "51991234477",
    });
    vi.spyOn(provider, "sendMessage").mockRejectedValue(new Error("Falha ao enviar mensagem pela Uazapi"));

    const result = await logMessage(repo, provider, "acc-1", conversation.id, {
      direction: "outbound",
      body: "Confirmado!",
    });

    expect(result).toEqual({ ok: false, error: "Falha ao enviar mensagem pela Uazapi" });
    const messages = await getConversationMessages(repo, "acc-1", conversation.id);
    expect(messages).toHaveLength(0);
  });

  it("still returns a success result shape on the happy path", async () => {
    const repo = createInMemoryWhatsappRepository();
    const provider = createFakeWhatsappProvider(repo);
    const conversation = await startConversation(repo, "acc-1", {
      contactId: null,
      contactName: "Carla Souza",
      contactPhone: "51991234477",
    });

    const result = await logMessage(repo, provider, "acc-1", conversation.id, {
      direction: "outbound",
      body: "Oi",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message.body).toBe("Oi");
      expect(result.message.direction).toBe("outbound");
    }
  });

  function mediaDepsFake() {
    const storage = createFakeWhatsappMediaStorage();
    const downloadMedia = vi.fn(async () => ({ bytes: new Uint8Array([9, 9, 9]), mime: "image/jpeg" }));
    return { storage, downloadMedia };
  }

  it("ingestão de mídia: baixa, sobe no bucket e grava a mensagem como stored", async () => {
    const repo = createInMemoryWhatsappRepository();
    const crmDeps = buildCrmDeps(createInMemoryCrmRepository());
    const deps = mediaDepsFake();

    const msg = await handleInboundMessage(repo, crmDeps, "acc-1", {
      fromPhone: "5511988887777",
      fromName: "Carla",
      body: "Ola amigo",
      media: { providerMessageId: "MID-1", type: "image", mime: "image/jpeg", filename: null, fileLength: 3 },
    }, deps);

    expect(deps.downloadMedia).toHaveBeenCalledWith("acc-1", "MID-1");
    const stored = await getConversationMessages(repo, "acc-1", msg.conversationId);
    expect(stored[0].mediaType).toBe("image");
    expect(stored[0].mediaStatus).toBe("stored");
    expect(stored[0].body).toBe("Ola amigo");
    expect(deps.storage.objects.get(stored[0].mediaStoragePath!)).toBeDefined();
  });

  it("ingestão de mídia: arquivo acima de 16 MB entra como too_large sem baixar", async () => {
    const repo = createInMemoryWhatsappRepository();
    const crmDeps = buildCrmDeps(createInMemoryCrmRepository());
    const deps = mediaDepsFake();

    const msg = await handleInboundMessage(repo, crmDeps, "acc-1", {
      fromPhone: "5511988887777",
      body: "",
      media: { providerMessageId: "MID-2", type: "video", mime: "video/mp4", filename: null, fileLength: MAX_MEDIA_BYTES + 1 },
    }, deps);

    expect(deps.downloadMedia).not.toHaveBeenCalled();
    const stored = await getConversationMessages(repo, "acc-1", msg.conversationId);
    expect(stored[0].mediaStatus).toBe("too_large");
    expect(stored[0].mediaStoragePath).toBeNull();
  });

  it("ingestão de mídia: corpo baixado acima de 16 MB entra como too_large mesmo com fileLength subestimado", async () => {
    const repo = createInMemoryWhatsappRepository();
    const crmDeps = buildCrmDeps(createInMemoryCrmRepository());
    const storage = createFakeWhatsappMediaStorage();
    const downloadMedia = vi.fn(async () => ({
      bytes: new Uint8Array(MAX_MEDIA_BYTES + 1),
      mime: "image/jpeg",
    }));

    const msg = await handleInboundMessage(repo, crmDeps, "acc-1", {
      fromPhone: "5511988887777",
      body: "",
      media: { providerMessageId: "MID-4", type: "image", mime: "image/jpeg", filename: null, fileLength: 10 },
    }, { storage, downloadMedia });

    const stored = await getConversationMessages(repo, "acc-1", msg.conversationId);
    expect(stored[0].mediaStatus).toBe("too_large");
    expect(stored[0].mediaStoragePath).toBeNull();
    expect(storage.objects.size).toBe(0);
  });

  it("ingestão de mídia: falha de download deixa a mensagem como expired, não lança", async () => {
    const repo = createInMemoryWhatsappRepository();
    const crmDeps = buildCrmDeps(createInMemoryCrmRepository());
    const storage = createFakeWhatsappMediaStorage();
    const downloadMedia = vi.fn(async () => { throw new Error("rede caiu"); });

    const msg = await handleInboundMessage(repo, crmDeps, "acc-1", {
      fromPhone: "5511988887777",
      body: "",
      media: { providerMessageId: "MID-3", type: "audio", mime: "audio/ogg", filename: null, fileLength: 10 },
    }, { storage, downloadMedia });

    const stored = await getConversationMessages(repo, "acc-1", msg.conversationId);
    expect(stored[0].mediaStatus).toBe("expired");
    expect(stored[0].mediaType).toBe("audio");
  });

  it("sem media no input, handleInboundMessage grava texto puro como antes", async () => {
    const repo = createInMemoryWhatsappRepository();
    const crmDeps = buildCrmDeps(createInMemoryCrmRepository());
    const msg = await handleInboundMessage(repo, crmDeps, "acc-1", {
      fromPhone: "5511988887777",
      body: "oi",
    });
    const stored = await getConversationMessages(repo, "acc-1", msg.conversationId);
    expect(stored[0].mediaType).toBeNull();
    expect(stored[0].body).toBe("oi");
  });
});

function buildCrmDeps(crmRepo: ReturnType<typeof createInMemoryCrmRepository>) {
  return {
    findContactByPhone: (accountId: string, phone: string) =>
      crm.findContactByPhone(crmRepo, accountId, phone),
    createContact: (accountId: string, input: { name: string; phone: string }) =>
      crm.createContact(crmRepo, accountId, input),
  };
}

describe("handleInboundMessage", () => {
  it("creates a new contact and conversation for an unknown phone number", async () => {
    const whatsappRepo = createInMemoryWhatsappRepository();
    const crmRepo = createInMemoryCrmRepository();

    const message = await handleInboundMessage(whatsappRepo, buildCrmDeps(crmRepo), "acc-1", {
      fromPhone: "51991234477",
      fromName: "Carla Souza",
      body: "Oi, gostaria de agendar uma consulta",
    });

    expect(message.direction).toBe("inbound");
    expect(message.body).toBe("Oi, gostaria de agendar uma consulta");

    const contacts = await crmRepo.searchContacts("acc-1", "Carla");
    expect(contacts).toHaveLength(1);
    expect(contacts[0].phone).toBe("51991234477");

    const stages = await crmRepo.getStages("acc-1");
    const dealsByStage = await crmRepo.getDealsWithContactsByStage("acc-1");
    expect(dealsByStage.get(stages[0].id) ?? []).toHaveLength(1);

    const conversation = await whatsappRepo.getConversationByPhone("acc-1", "51991234477");
    expect(conversation?.unreadCount).toBe(1);
  });

  it("reuses an existing contact and conversation for a known phone number", async () => {
    const whatsappRepo = createInMemoryWhatsappRepository();
    const crmRepo = createInMemoryCrmRepository();
    const existingContact = await crmRepo.insertContact("acc-1", {
      name: "Rafael Prado",
      phone: "51998765432",
    });
    const existingConversation = await whatsappRepo.insertConversation("acc-1", {
      contactId: existingContact.id,
      contactName: existingContact.name,
      contactPhone: existingContact.phone,
    });

    await handleInboundMessage(whatsappRepo, buildCrmDeps(crmRepo), "acc-1", {
      fromPhone: "51998765432",
      body: "Posso remarcar?",
    });

    const contacts = await crmRepo.searchContacts("acc-1", "Rafael");
    expect(contacts).toHaveLength(1);

    const conversation = await whatsappRepo.getConversation("acc-1", existingConversation.id);
    expect(conversation?.unreadCount).toBe(1);

    const messages = await whatsappRepo.listMessages("acc-1", existingConversation.id);
    expect(messages).toHaveLength(1);
  });

  it("links an existing contactless conversation to the resolved contact", async () => {
    const whatsappRepo = createInMemoryWhatsappRepository();
    const crmRepo = createInMemoryCrmRepository();
    const existingConversation = await whatsappRepo.insertConversation("acc-1", {
      contactId: null,
      contactName: "Carla Souza",
      contactPhone: "51991234477",
    });

    await handleInboundMessage(whatsappRepo, buildCrmDeps(crmRepo), "acc-1", {
      fromPhone: "51991234477",
      fromName: "Carla Souza",
      body: "Oi, gostaria de agendar uma consulta",
    });

    const contacts = await crmRepo.searchContacts("acc-1", "Carla");
    expect(contacts).toHaveLength(1);

    const conversation = await whatsappRepo.getConversation("acc-1", existingConversation.id);
    expect(conversation?.contactId).toBe(contacts[0].id);
  });

  it("falls back to the phone number as the contact name when none is given", async () => {
    const whatsappRepo = createInMemoryWhatsappRepository();
    const crmRepo = createInMemoryCrmRepository();

    await handleInboundMessage(whatsappRepo, buildCrmDeps(crmRepo), "acc-1", {
      fromPhone: "51999998888",
      body: "Oi",
    });

    const contacts = await crmRepo.searchContacts("acc-1", "51999998888");
    expect(contacts[0].name).toBe("51999998888");
  });
});

describe("connection status", () => {
  it("connects, reports connected, then disconnects", async () => {
    const repo = createInMemoryWhatsappRepository();
    const provider = createFakeWhatsappProvider(repo);

    expect(await getConnectionStatus(provider, "acc-1")).toBe("disconnected");
    await connectWhatsapp(provider, "acc-1");
    expect(await getConnectionStatus(provider, "acc-1")).toBe("connected");
    await disconnectWhatsapp(provider, "acc-1");
    expect(await getConnectionStatus(provider, "acc-1")).toBe("disconnected");
  });
});

describe("resetUnreadCount", () => {
  it("zeroes the unread count for a conversation", async () => {
    const repo = createInMemoryWhatsappRepository();
    const conversation = await startConversation(repo, "acc-1", {
      contactId: null,
      contactName: "Carla Souza",
      contactPhone: "51991234477",
    });
    await repo.incrementUnreadCount("acc-1", conversation.id);

    await resetUnreadCount(repo, "acc-1", conversation.id);

    const updated = await repo.getConversation("acc-1", conversation.id);
    expect(updated?.unreadCount).toBe(0);
  });
});

describe("isValidWebhookSecret", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows the request through when no secret has been configured yet", () => {
    expect(isValidWebhookSecret(null, null)).toBe(true);
    expect(
      isValidWebhookSecret(
        {
          accountId: "acc-1",
          provider: "fake",
          status: "disconnected",
          connectedAt: null,
          qrCode: null,
          config: null,
        },
        null,
      ),
    ).toBe(true);
  });

  it("rejects when no secret has been configured yet in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isValidWebhookSecret(null, null)).toBe(false);
    expect(
      isValidWebhookSecret(
        {
          accountId: "acc-1",
          provider: "fake",
          status: "disconnected",
          connectedAt: null,
          qrCode: null,
          config: null,
        },
        null,
      ),
    ).toBe(false);
  });

  it("rejects when a secret is configured but missing or wrong", () => {
    const connection = {
      accountId: "acc-1",
      provider: "uazapi",
      status: "connected" as const,
      connectedAt: null,
      qrCode: null,
      config: { subdomain: "x", token: "y", webhookSecret: "correct-secret" },
    };
    expect(isValidWebhookSecret(connection, null)).toBe(false);
    expect(isValidWebhookSecret(connection, "wrong-secret")).toBe(false);
    expect(isValidWebhookSecret(connection, "correct-secret")).toBe(true);
  });
});

describe("parseWebhookPayload", () => {
  it("parses the real Uazapi messages envelope", () => {
    const result = parseWebhookPayload({
      EventType: "messages",
      instanceName: "inst-1",
      message: {
        sender: "257208528953502@lid",
        sender_pn: "5511999999999@s.whatsapp.net",
        senderName: "Carla Souza",
        text: "Oi, gostaria de agendar",
        fromMe: false,
        isGroup: false,
      },
    });
    expect(result).toEqual({
      fromPhone: "5511999999999",
      fromName: "Carla Souza",
      body: "Oi, gostaria de agendar",
    });
  });

  it("falls back to sender when sender_pn is absent", () => {
    const result = parseWebhookPayload({
      EventType: "messages",
      message: {
        sender: "5511999999999@s.whatsapp.net",
        text: "Oi",
        fromMe: false,
        isGroup: false,
      },
    });
    expect(result).toEqual({ fromPhone: "5511999999999", fromName: undefined, body: "Oi" });
  });

  it("ignores messages sent by the API itself", () => {
    const result = parseWebhookPayload({
      EventType: "messages",
      message: { sender: "5511999999999@s.whatsapp.net", text: "oi", fromMe: true, isGroup: false },
    });
    expect(result).toBeNull();
  });

  it("ignores group messages", () => {
    const result = parseWebhookPayload({
      EventType: "messages",
      message: { sender: "123@g.us", text: "oi", fromMe: false, isGroup: true },
    });
    expect(result).toBeNull();
  });

  it("parses the flat shape used for manual/fake-provider testing", () => {
    const result = parseWebhookPayload({
      fromPhone: "5511999999999",
      fromName: "Carla Souza",
      body: "Oi",
    });
    expect(result).toEqual({ fromPhone: "5511999999999", fromName: "Carla Souza", body: "Oi" });
  });

  it("returns null for an unrecognized shape", () => {
    expect(parseWebhookPayload({ foo: "bar" })).toBeNull();
    expect(parseWebhookPayload(null)).toBeNull();
  });

  it("parses the Evolution API messages.upsert envelope", () => {
    const result = parseWebhookPayload({
      event: "messages.upsert",
      instance: "arkdoctor",
      data: {
        key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: false, id: "3EB0XXXXX" },
        message: { conversation: "Oi, gostaria de agendar" },
        pushName: "Carla Souza",
      },
    });
    expect(result).toEqual({
      fromPhone: "5511999999999",
      fromName: "Carla Souza",
      body: "Oi, gostaria de agendar",
    });
  });

  it("ignores messages.upsert events sent by the API itself", () => {
    const result = parseWebhookPayload({
      event: "messages.upsert",
      data: {
        key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: true },
        message: { conversation: "oi" },
      },
    });
    expect(result).toBeNull();
  });

  it("ignores messages.upsert events from groups", () => {
    const result = parseWebhookPayload({
      event: "messages.upsert",
      data: {
        key: { remoteJid: "123456789@g.us", fromMe: false },
        message: { conversation: "oi" },
      },
    });
    expect(result).toBeNull();
  });

  it("returns null for a messages.upsert event with no text content", () => {
    const result = parseWebhookPayload({
      event: "messages.upsert",
      data: {
        key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: false },
        message: { imageMessage: {} },
      },
    });
    expect(result).toBeNull();
  });

  it("parses text from extendedTextMessage (replies and link-preview messages)", () => {
    const result = parseWebhookPayload({
      event: "messages.upsert",
      data: {
        key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: false },
        message: { extendedTextMessage: { text: "Respondendo sua mensagem" } },
        pushName: "Carla Souza",
      },
    });
    expect(result).toEqual({
      fromPhone: "5511999999999",
      fromName: "Carla Souza",
      body: "Respondendo sua mensagem",
    });
  });

  const imageWebhook = {
    EventType: "messages",
    message: {
      fromMe: false,
      isGroup: false,
      messageType: "ImageMessage",
      messageid: "3AFC432F36B07600E616",
      sender: "257208528953502@lid",
      sender_pn: "556696604575@s.whatsapp.net",
      senderName: "Ederson Fernandes",
      text: "Ola amigo",
      content: {
        mimetype: "image/jpeg",
        caption: "Ola amigo",
        fileLength: 125831,
        URL: "https://mmg.whatsapp.net/o1/v/t24/enc?mms3=true",
      },
    },
  };

  const documentWebhook = {
    EventType: "messages",
    message: {
      fromMe: false,
      isGroup: false,
      messageType: "DocumentMessage",
      messageid: "3AAED69C92FBA6BAE2C1",
      sender: "257208528953502@lid",
      sender_pn: "556696604575@s.whatsapp.net",
      senderName: "Ederson Fernandes",
      text: "",
      content: {
        mimetype: "application/pdf",
        fileName: "1004239-53.2025.8.11.0040-processo.pdf",
        fileLength: 2413752,
      },
    },
  };

  const audioWebhook = {
    EventType: "messages",
    message: {
      fromMe: false,
      isGroup: false,
      messageType: "AudioMessage",
      messageid: "3AD9DA24C6DECE028736",
      sender_pn: "556696604575@s.whatsapp.net",
      text: "",
      content: { mimetype: "audio/ogg; codecs=opus", fileLength: 11705, PTT: true },
    },
  };

  it("extrai mídia de imagem com legenda", () => {
    const parsed = parseWebhookPayload(imageWebhook);
    expect(parsed).toEqual({
      fromPhone: "556696604575",
      fromName: "Ederson Fernandes",
      body: "Ola amigo",
      media: {
        providerMessageId: "3AFC432F36B07600E616",
        type: "image",
        mime: "image/jpeg",
        filename: null,
        fileLength: 125831,
      },
    });
  });

  it("extrai mídia de documento com fileName e legenda vazia", () => {
    const parsed = parseWebhookPayload(documentWebhook);
    expect(parsed?.media).toEqual({
      providerMessageId: "3AAED69C92FBA6BAE2C1",
      type: "document",
      mime: "application/pdf",
      filename: "1004239-53.2025.8.11.0040-processo.pdf",
      fileLength: 2413752,
    });
    expect(parsed?.body).toBe("");
  });

  it("extrai mídia de áudio (mime com parâmetros)", () => {
    const parsed = parseWebhookPayload(audioWebhook);
    expect(parsed?.media?.type).toBe("audio");
    expect(parsed?.media?.mime).toBe("audio/ogg; codecs=opus");
  });

  it("descarta mídia de grupo e fromMe", () => {
    expect(
      parseWebhookPayload({ ...imageWebhook, message: { ...imageWebhook.message, isGroup: true } }),
    ).toBeNull();
    expect(
      parseWebhookPayload({ ...imageWebhook, message: { ...imageWebhook.message, fromMe: true } }),
    ).toBeNull();
  });

  it("mensagem de texto puro continua sem campo media", () => {
    const parsed = parseWebhookPayload({
      EventType: "messages",
      message: {
        fromMe: false,
        isGroup: false,
        messageType: "Conversation",
        sender_pn: "556696604575@s.whatsapp.net",
        text: "oi",
      },
    });
    expect(parsed).toEqual({ fromPhone: "556696604575", fromName: undefined, body: "oi" });
    expect("media" in (parsed ?? {})).toBe(false);
  });
});

describe("personalizeMessage", () => {
  it("replaces {{nome}} with the contact's name", () => {
    expect(personalizeMessage("Olá {{nome}}, tudo bem?", "Ana")).toBe("Olá Ana, tudo bem?");
  });

  it("leaves the message unchanged when there's no placeholder", () => {
    expect(personalizeMessage("Mensagem fixa", "Ana")).toBe("Mensagem fixa");
  });

  it("replaces every occurrence of the placeholder", () => {
    expect(personalizeMessage("{{nome}}, oi {{nome}}", "Ana")).toBe("Ana, oi Ana");
  });
});

describe("sendBulkMessages", () => {
  const noWait = async () => {};
  const noDelay = () => 0;

  it("sends a personalized message to every contact and logs it as an outbound message", async () => {
    const repo = createInMemoryWhatsappRepository();
    const provider = createFakeWhatsappProvider(repo);
    const sendSpy = vi.spyOn(provider, "sendMessage");

    const result = await sendBulkMessages(
      repo,
      provider,
      "acc-1",
      [
        { id: "contact-1", name: "Ana", phone: "11999990000" },
        { id: "contact-2", name: "Beatriz", phone: "11988887777" },
      ],
      "Olá {{nome}}!",
      noWait,
      noDelay,
    );

    expect(result.sent).toEqual(["contact-1", "contact-2"]);
    expect(result.failed).toEqual([]);
    expect(sendSpy).toHaveBeenNthCalledWith(1, "acc-1", "11999990000", "Olá Ana!");
    expect(sendSpy).toHaveBeenNthCalledWith(2, "acc-1", "11988887777", "Olá Beatriz!");

    const conversation = await repo.getConversationByPhone("acc-1", "11999990000");
    expect(conversation).not.toBeNull();
    const messages = await repo.listMessages("acc-1", conversation!.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].body).toBe("Olá Ana!");
    expect(messages[0].direction).toBe("outbound");
  });

  it("reuses an existing conversation instead of creating a duplicate", async () => {
    const repo = createInMemoryWhatsappRepository();
    const provider = createFakeWhatsappProvider(repo);
    const existing = await repo.insertConversation("acc-1", {
      contactId: "contact-1",
      contactName: "Ana",
      contactPhone: "11999990000",
    });

    await sendBulkMessages(
      repo,
      provider,
      "acc-1",
      [{ id: "contact-1", name: "Ana", phone: "11999990000" }],
      "Oi {{nome}}",
      noWait,
      noDelay,
    );

    const conversations = await repo.listConversations("acc-1");
    expect(conversations).toHaveLength(1);
    expect(conversations[0].id).toBe(existing.id);
  });

  it("continues sending to the remaining contacts when one send fails", async () => {
    const repo = createInMemoryWhatsappRepository();
    const provider = createFakeWhatsappProvider(repo);
    vi.spyOn(provider, "sendMessage").mockImplementation(async (_accountId, toPhone) => {
      if (toPhone === "11988887777") throw new Error("Falha no provedor");
      return { providerMessageId: "msg-1" };
    });

    const result = await sendBulkMessages(
      repo,
      provider,
      "acc-1",
      [
        { id: "contact-1", name: "Ana", phone: "11999990000" },
        { id: "contact-2", name: "Beatriz", phone: "11988887777" },
        { id: "contact-3", name: "Carla", phone: "11977776666" },
      ],
      "Oi {{nome}}",
      noWait,
      noDelay,
    );

    expect(result.sent).toEqual(["contact-1", "contact-3"]);
    expect(result.failed).toEqual([{ contactId: "contact-2", error: "Falha no provedor" }]);
  });

  it("waits between sends but not after the last one", async () => {
    const repo = createInMemoryWhatsappRepository();
    const provider = createFakeWhatsappProvider(repo);
    const waitSpy = vi.fn(async () => {});

    await sendBulkMessages(
      repo,
      provider,
      "acc-1",
      [
        { id: "contact-1", name: "Ana", phone: "11999990000" },
        { id: "contact-2", name: "Beatriz", phone: "11988887777" },
      ],
      "Oi {{nome}}",
      waitSpy,
      () => 7000,
    );

    expect(waitSpy).toHaveBeenCalledTimes(1);
    expect(waitSpy).toHaveBeenCalledWith(7000);
  });

  it("insertMessage grava campos de mídia e updateMessageMedia troca o status", async () => {
    const repo = createInMemoryWhatsappRepository();
    const conversation = await startConversation(repo, "acc-1", {
      contactId: null,
      contactName: "Carla",
      contactPhone: "5511999990000",
    });
    const msg = await repo.insertMessage("acc-1", conversation.id, {
      direction: "inbound",
      body: "Ola amigo",
      media: {
        type: "image",
        status: "expired",
        mime: "image/jpeg",
        filename: null,
        storagePath: null,
      },
    });
    expect(msg.mediaType).toBe("image");
    expect(msg.mediaStatus).toBe("expired");

    await repo.updateMessageMedia("acc-1", msg.id, {
      status: "stored",
      storagePath: "acc-1/" + conversation.id + "/" + msg.id + ".jpg",
    });
    const [read] = await getConversationMessages(repo, "acc-1", conversation.id);
    expect(read.mediaStatus).toBe("stored");
    expect(read.mediaStoragePath).toBe("acc-1/" + conversation.id + "/" + msg.id + ".jpg");
    expect(read.mediaMime).toBe("image/jpeg");
  });
});

describe("sendMediaMessage", () => {
  async function setup() {
    const repo = createInMemoryWhatsappRepository();
    const storage = createFakeWhatsappMediaStorage();
    await repo.upsertConnectionStatus("acc-1", "connected", new Date().toISOString());
    const conversation = await repo.insertConversation("acc-1", {
      contactId: null,
      contactName: "Carla",
      contactPhone: "5511988887777",
    });
    return { repo, storage, conversationId: conversation.id };
  }

  it("envia pela Uazapi, grava a mensagem outbound e sobe o arquivo no bucket", async () => {
    const { repo, storage, conversationId } = await setup();
    const sendMedia = vi.fn().mockResolvedValue({ providerMessageId: "MID-1" });
    const bytes = new Uint8Array([1, 2, 3]);

    const result = await sendMediaMessage(repo, storage, sendMedia, "acc-1", conversationId, {
      type: "image",
      bytes,
      mime: "image/jpeg",
      filename: "foto.jpg",
      caption: "olha isso",
    });

    expect(result.ok).toBe(true);
    expect(sendMedia).toHaveBeenCalledWith("acc-1", "5511988887777", {
      type: "image",
      dataBase64: Buffer.from(bytes).toString("base64"),
      filename: "foto.jpg",
      caption: "olha isso",
    });
    const messages = await repo.listMessages("acc-1", conversationId);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      direction: "outbound",
      body: "olha isso",
      mediaType: "image",
      mediaStatus: "stored",
    });
    expect(messages[0].mediaStoragePath).toBeTruthy();
    expect(storage.objects.has(messages[0].mediaStoragePath as string)).toBe(true);
  });

  it("usa o rótulo do tipo como preview quando não há legenda", async () => {
    const { repo, storage, conversationId } = await setup();
    const sendMedia = vi.fn().mockResolvedValue({ providerMessageId: "MID-2" });
    await sendMediaMessage(repo, storage, sendMedia, "acc-1", conversationId, {
      type: "document",
      bytes: new Uint8Array([9]),
      mime: "application/pdf",
      filename: "x.pdf",
      caption: "",
    });
    const conv = await repo.getConversation("acc-1", conversationId);
    expect(conv?.lastMessagePreview).toContain("Documento");
  });

  it("retorna { ok: false } e não chama o provider quando desconectado", async () => {
    const { repo, storage, conversationId } = await setup();
    await repo.upsertConnectionStatus("acc-1", "disconnected", null);
    const sendMedia = vi.fn();

    const result = await sendMediaMessage(repo, storage, sendMedia, "acc-1", conversationId, {
      type: "image",
      bytes: new Uint8Array([1]),
      mime: "image/jpeg",
      filename: null,
      caption: "",
    });

    expect(result).toEqual({ ok: false, error: expect.stringContaining("desconectado") });
    expect(sendMedia).not.toHaveBeenCalled();
  });

  it("retorna { ok: false } quando o arquivo passa de 16 MB, sem chamar o provider", async () => {
    const { repo, storage, conversationId } = await setup();
    const sendMedia = vi.fn();
    const big = new Uint8Array(MAX_MEDIA_BYTES + 1);

    const result = await sendMediaMessage(repo, storage, sendMedia, "acc-1", conversationId, {
      type: "video",
      bytes: big,
      mime: "video/mp4",
      filename: null,
      caption: "",
    });

    expect(result.ok).toBe(false);
    expect(sendMedia).not.toHaveBeenCalled();
  });

  it("retorna { ok: false } e não grava mensagem quando o provider falha", async () => {
    const { repo, storage, conversationId } = await setup();
    const sendMedia = vi.fn().mockRejectedValue(new Error("failed to process file"));

    const result = await sendMediaMessage(repo, storage, sendMedia, "acc-1", conversationId, {
      type: "image",
      bytes: new Uint8Array([1]),
      mime: "image/jpeg",
      filename: null,
      caption: "",
    });

    expect(result).toEqual({ ok: false, error: expect.stringContaining("failed to process file") });
    expect(await repo.listMessages("acc-1", conversationId)).toHaveLength(0);
  });

  it("mantém a mensagem como 'expired' quando o envio dá certo mas o upload local falha", async () => {
    const { repo, conversationId } = await setup();
    const storage = createFakeWhatsappMediaStorage();
    storage.upload = vi.fn().mockRejectedValue(new Error("storage down"));
    const sendMedia = vi.fn().mockResolvedValue({ providerMessageId: "MID-3" });

    const result = await sendMediaMessage(repo, storage, sendMedia, "acc-1", conversationId, {
      type: "image",
      bytes: new Uint8Array([1]),
      mime: "image/jpeg",
      filename: null,
      caption: "",
    });

    expect(result.ok).toBe(true);
    const messages = await repo.listMessages("acc-1", conversationId);
    expect(messages[0].mediaStatus).toBe("expired");
    expect(messages[0].mediaStoragePath).toBeNull();
  });
});

describe("runMediaRetention", () => {
  async function seedStored(
    repo: ReturnType<typeof createInMemoryWhatsappRepository>,
    storage: ReturnType<typeof createFakeWhatsappMediaStorage>,
    convId: string,
    path: string,
  ) {
    const msg = await repo.insertMessage("acc-1", convId, {
      direction: "inbound",
      body: "",
      media: { type: "image", status: "stored", mime: "image/jpeg", filename: null, storagePath: path },
    });
    await storage.upload(path, new Uint8Array([1]), "image/jpeg");
    return msg;
  }

  it("apaga o objeto e marca a mensagem como 'expired' para mídia vencida", async () => {
    const repo = createInMemoryWhatsappRepository();
    const storage = createFakeWhatsappMediaStorage();
    const conv = await repo.insertConversation("acc-1", {
      contactId: null, contactName: "C", contactPhone: "551199",
    });
    const a = await seedStored(repo, storage, conv.id, "acc-1/c/a.jpg");
    const b = await seedStored(repo, storage, conv.id, "acc-1/c/b.jpg");

    // nowIso 40 dias no futuro => corte (now - 30d) fica depois das mensagens
    const nowIso = new Date(Date.now() + 40 * 86_400_000).toISOString();
    const result = await runMediaRetention(repo, storage, nowIso);

    expect(result).toEqual({ expired: 2, errors: 0 });
    expect(storage.objects.size).toBe(0);
    const msgs = await repo.listMessages("acc-1", conv.id);
    for (const id of [a.id, b.id]) {
      const m = msgs.find((x) => x.id === id)!;
      expect(m.mediaStatus).toBe("expired");
      expect(m.mediaStoragePath).toBeNull();
    }
  });

  it("não toca em mídia 'stored' recente", async () => {
    const repo = createInMemoryWhatsappRepository();
    const storage = createFakeWhatsappMediaStorage();
    const conv = await repo.insertConversation("acc-1", {
      contactId: null, contactName: "C", contactPhone: "551199",
    });
    await seedStored(repo, storage, conv.id, "acc-1/c/a.jpg");

    const result = await runMediaRetention(repo, storage, new Date().toISOString());
    expect(result).toEqual({ expired: 0, errors: 0 });
    expect(storage.objects.size).toBe(1);
  });

  it("conta erro e mantém 'stored' quando falha ao remover um objeto", async () => {
    const repo = createInMemoryWhatsappRepository();
    const storage = createFakeWhatsappMediaStorage();
    const conv = await repo.insertConversation("acc-1", {
      contactId: null, contactName: "C", contactPhone: "551199",
    });
    const a = await seedStored(repo, storage, conv.id, "acc-1/c/a.jpg");
    storage.remove = vi.fn().mockRejectedValue(new Error("storage down"));

    const nowIso = new Date(Date.now() + 40 * 86_400_000).toISOString();
    const result = await runMediaRetention(repo, storage, nowIso);

    expect(result).toEqual({ expired: 0, errors: 1 });
    const m = (await repo.listMessages("acc-1", conv.id)).find((x) => x.id === a.id)!;
    expect(m.mediaStatus).toBe("stored");
  });
});

describe("importWhatsappHistory", () => {
  const NOW = "2026-09-04T12:00:00.000Z";

  function fakeChat(overrides: Partial<UazapiChat> = {}): UazapiChat {
    return {
      chatId: "5511999999999@s.whatsapp.net",
      phone: "5511999999999",
      name: "Carla Souza",
      isGroup: false,
      lastMessageTimestampMs: Date.parse(NOW) - 24 * 60 * 60 * 1000,
      ...overrides,
    };
  }

  function makeCrmDeps() {
    const crmRepo = createInMemoryCrmRepository();
    return {
      findContactByPhone: (accId: string, phone: string) => crm.findContactByPhone(crmRepo, accId, phone),
      createContact: (accId: string, input: { name: string; phone: string }) =>
        crm.createContact(crmRepo, accId, input),
    };
  }

  it("creates a conversation and a lead for a new phone, imports its messages", async () => {
    const repo = createInMemoryWhatsappRepository();
    const uazapiDeps = {
      findChats: vi.fn().mockResolvedValue([fakeChat()]),
      findMessages: vi.fn().mockResolvedValue([
        {
          fromMe: false,
          text: "Oi, gostaria de agendar",
          messageTimestamp: Date.parse(NOW) - 60 * 60 * 1000,
        },
        { fromMe: true, text: "Claro, qual dia?", messageTimestamp: Date.parse(NOW) - 30 * 60 * 1000 },
      ]),
      downloadMedia: vi.fn(),
    };
    const storage = createFakeWhatsappMediaStorage();

    const result = await importWhatsappHistory(
      repo,
      makeCrmDeps(),
      uazapiDeps,
      storage,
      "acc-1",
      NOW,
    );

    expect(result).toEqual({ imported: 1, skipped: 0, errors: 0, hasMore: false });

    const conversation = await repo.getConversationByPhone("acc-1", "5511999999999");
    expect(conversation?.historyImportedAt).toBe(NOW);
    expect(conversation?.contactId).not.toBeNull();
    expect(conversation?.lastMessagePreview).toBe("Claro, qual dia?");

    const messages = await repo.listMessages("acc-1", conversation!.id);
    expect(messages).toHaveLength(2);
    expect(messages.find((m) => m.direction === "inbound")?.body).toBe("Oi, gostaria de agendar");
    expect(messages.find((m) => m.direction === "outbound")?.body).toBe("Claro, qual dia?");
  });

  it("skips a conversation already marked as imported", async () => {
    const repo = createInMemoryWhatsappRepository();
    const conversation = await repo.insertConversation("acc-1", {
      contactId: null,
      contactName: "Carla Souza",
      contactPhone: "5511999999999",
    });
    await repo.markHistoryImported("acc-1", conversation.id, "2026-09-01T00:00:00.000Z");

    const uazapiDeps = {
      findChats: vi.fn().mockResolvedValue([fakeChat()]),
      findMessages: vi.fn(),
      downloadMedia: vi.fn(),
    };

    const result = await importWhatsappHistory(
      repo,
      makeCrmDeps(),
      uazapiDeps,
      createFakeWhatsappMediaStorage(),
      "acc-1",
      NOW,
    );

    expect(result).toEqual({ imported: 0, skipped: 1, errors: 0, hasMore: false });
    expect(uazapiDeps.findMessages).not.toHaveBeenCalled();
  });

  it("discards chats outside the 60-day window and groups", async () => {
    const repo = createInMemoryWhatsappRepository();
    const uazapiDeps = {
      findChats: vi.fn().mockResolvedValue([
        fakeChat({
          phone: "5511111111111",
          chatId: "5511111111111@s.whatsapp.net",
          lastMessageTimestampMs: Date.parse(NOW) - 61 * 24 * 60 * 60 * 1000,
        }),
        fakeChat({ phone: "5511222222222", chatId: "123@g.us", isGroup: true }),
      ]),
      findMessages: vi.fn(),
      downloadMedia: vi.fn(),
    };

    const result = await importWhatsappHistory(
      repo,
      makeCrmDeps(),
      uazapiDeps,
      createFakeWhatsappMediaStorage(),
      "acc-1",
      NOW,
    );

    expect(result).toEqual({ imported: 0, skipped: 0, errors: 0, hasMore: false });
    expect(uazapiDeps.findMessages).not.toHaveBeenCalled();
  });

  it("processes at most HISTORY_BATCH_SIZE conversations and reports hasMore", async () => {
    const repo = createInMemoryWhatsappRepository();
    const chats = Array.from({ length: 16 }, (_, i) =>
      fakeChat({ phone: `551199999${String(i).padStart(4, "0")}`, chatId: `551199999${String(i).padStart(4, "0")}@s.whatsapp.net` }),
    );
    const uazapiDeps = {
      findChats: vi.fn().mockResolvedValue(chats),
      findMessages: vi.fn().mockResolvedValue([]),
      downloadMedia: vi.fn(),
    };

    const result = await importWhatsappHistory(
      repo,
      makeCrmDeps(),
      uazapiDeps,
      createFakeWhatsappMediaStorage(),
      "acc-1",
      NOW,
    );

    expect(result.imported).toBe(15);
    expect(result.hasMore).toBe(true);
    expect(uazapiDeps.findMessages).toHaveBeenCalledTimes(15);
  });

  it("keeps going when one conversation fails, and does not mark it as imported", async () => {
    const repo = createInMemoryWhatsappRepository();
    const uazapiDeps = {
      findChats: vi.fn().mockResolvedValue([
        fakeChat({ phone: "5511111111111", chatId: "5511111111111@s.whatsapp.net" }),
        fakeChat({ phone: "5511222222222", chatId: "5511222222222@s.whatsapp.net" }),
      ]),
      findMessages: vi
        .fn()
        .mockRejectedValueOnce(new Error("timeout"))
        .mockResolvedValueOnce([]),
      downloadMedia: vi.fn(),
    };

    const result = await importWhatsappHistory(
      repo,
      makeCrmDeps(),
      uazapiDeps,
      createFakeWhatsappMediaStorage(),
      "acc-1",
      NOW,
    );

    expect(result).toEqual({ imported: 1, skipped: 0, errors: 1, hasMore: false });
    const failedConversation = await repo.getConversationByPhone("acc-1", "5511111111111");
    expect(failedConversation?.historyImportedAt).toBeNull();
  });

  it("downloads media newer than 30 days and marks older media as expired without downloading", async () => {
    const repo = createInMemoryWhatsappRepository();
    const uazapiDeps = {
      findChats: vi.fn().mockResolvedValue([fakeChat()]),
      findMessages: vi.fn().mockResolvedValue([
        {
          fromMe: false,
          messageType: "ImageMessage",
          messageid: "recent-img",
          messageTimestamp: Date.parse(NOW) - 10 * 24 * 60 * 60 * 1000,
          text: "",
          content: { mimetype: "image/jpeg", fileLength: 1000 },
        },
        {
          fromMe: false,
          messageType: "ImageMessage",
          messageid: "old-img",
          messageTimestamp: Date.parse(NOW) - 40 * 24 * 60 * 60 * 1000,
          text: "",
          content: { mimetype: "image/jpeg", fileLength: 1000 },
        },
      ]),
      downloadMedia: vi.fn().mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]), mime: "image/jpeg" }),
    };
    const storage = createFakeWhatsappMediaStorage();

    await importWhatsappHistory(repo, makeCrmDeps(), uazapiDeps, storage, "acc-1", NOW);

    expect(uazapiDeps.downloadMedia).toHaveBeenCalledTimes(1);
    expect(uazapiDeps.downloadMedia).toHaveBeenCalledWith("acc-1", "recent-img");

    const conversation = await repo.getConversationByPhone("acc-1", "5511999999999");
    const messages = await repo.listMessages("acc-1", conversation!.id);
    const recent = messages.find((m) => m.mediaStoragePath !== null);
    const old = messages.find((m) => m.mediaStoragePath === null);
    expect(recent?.mediaStatus).toBe("stored");
    expect(old?.mediaStatus).toBe("expired");
  });
});
