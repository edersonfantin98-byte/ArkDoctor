import { describe, it, expect, vi } from "vitest";
import { createInMemoryWhatsappRepository } from "./repository.memory";
import { createInMemoryCrmRepository } from "../crm/repository.memory";
import { createFakeWhatsappProvider } from "./provider.fake";
import * as crm from "../crm/service";
import { normalizeWhatsappJid } from "./provider.uazapi";
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
});
