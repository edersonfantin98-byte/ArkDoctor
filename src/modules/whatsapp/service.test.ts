import { describe, it, expect, vi, afterEach } from "vitest";
import { createInMemoryWhatsappRepository } from "./repository.memory";
import { createInMemoryCrmRepository } from "../crm/repository.memory";
import { createFakeWhatsappProvider } from "./provider.fake";
import * as crm from "../crm/service";
import {
  startConversation,
  logMessage,
  getConversationMessages,
  handleInboundMessage,
  getConnectionStatus,
  connectWhatsapp,
  disconnectWhatsapp,
  resetUnreadCount,
  isValidWebhookSecret,
  parseWebhookPayload,
  personalizeMessage,
  sendBulkMessages,
} from "./service";

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
      event: "messages",
      instance: "inst-1",
      data: {
        sender: "5511999999999@s.whatsapp.net",
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

  it("ignores messages sent by the API itself", () => {
    const result = parseWebhookPayload({
      event: "messages",
      data: { sender: "5511999999999@s.whatsapp.net", text: "oi", fromMe: true, isGroup: false },
    });
    expect(result).toBeNull();
  });

  it("ignores group messages", () => {
    const result = parseWebhookPayload({
      event: "messages",
      data: { sender: "123@g.us", text: "oi", fromMe: false, isGroup: true },
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
});
