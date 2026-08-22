import { describe, it, expect, vi } from "vitest";
import { createInMemoryWhatsappRepository } from "./repository.memory";
import { createInMemoryCrmRepository } from "../crm/repository.memory";
import * as crm from "../crm/service";
import { startConversation, logMessage, getConversationMessages, handleInboundMessage } from "./service";

describe("whatsapp service", () => {
  it("rejects logging a message on a conversation that doesn't exist", async () => {
    const repo = createInMemoryWhatsappRepository();
    await expect(
      logMessage(repo, "acc-1", "does-not-exist", { direction: "outbound", body: "oi" }),
    ).rejects.toThrow("Conversa não encontrada");
  });

  it("updates the conversation preview when a message is logged", async () => {
    const repo = createInMemoryWhatsappRepository();
    const conversation = await startConversation(repo, "acc-1", {
      contactId: null,
      contactName: "Carla Souza",
      contactPhone: "51991234477",
    });
    await logMessage(repo, "acc-1", conversation.id, { direction: "outbound", body: "Confirmado!" });
    const messages = await getConversationMessages(repo, "acc-1", conversation.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].body).toBe("Confirmado!");
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
