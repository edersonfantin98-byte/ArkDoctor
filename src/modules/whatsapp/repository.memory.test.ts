import { describe, it, expect } from "vitest";
import { createInMemoryWhatsappRepository } from "./repository.memory";

describe("createInMemoryWhatsappRepository", () => {
  it("lists conversations for an account sorted by most recent message first", async () => {
    const repo = createInMemoryWhatsappRepository();
    const a = await repo.insertConversation("acc-1", {
      contactId: null,
      contactName: "Carla Souza",
      contactPhone: "51991234477",
    });
    const b = await repo.insertConversation("acc-1", {
      contactId: null,
      contactName: "Rafael Prado",
      contactPhone: "51998765432",
    });
    await repo.insertConversation("acc-2", {
      contactId: null,
      contactName: "Outra conta",
      contactPhone: "0000",
    });

    await repo.touchConversation("acc-1", a.id, "oi", "2026-08-20T10:00:00.000Z");
    await repo.touchConversation("acc-1", b.id, "posso remarcar?", "2026-08-20T11:00:00.000Z");

    const list = await repo.listConversations("acc-1");
    expect(list.map((c) => c.contactName)).toEqual(["Rafael Prado", "Carla Souza"]);
  });

  it("scopes messages to conversation and account", async () => {
    const repo = createInMemoryWhatsappRepository();
    const conversation = await repo.insertConversation("acc-1", {
      contactId: null,
      contactName: "Carla Souza",
      contactPhone: "51991234477",
    });
    await repo.insertMessage("acc-1", conversation.id, { direction: "inbound", body: "Oi!" });
    await repo.insertMessage("acc-1", conversation.id, { direction: "outbound", body: "Olá, tudo bem?" });

    const msgs = await repo.listMessages("acc-1", conversation.id);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].body).toBe("Oi!");
  });
});
