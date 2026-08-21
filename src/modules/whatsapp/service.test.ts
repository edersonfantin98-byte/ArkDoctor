import { describe, it, expect } from "vitest";
import { createInMemoryWhatsappRepository } from "./repository.memory";
import { startConversation, logMessage, getConversationMessages } from "./service";

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
