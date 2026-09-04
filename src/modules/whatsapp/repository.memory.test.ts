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

  it("finds a conversation by exact phone match, scoped to the account", async () => {
    const repo = createInMemoryWhatsappRepository();
    const conversation = await repo.insertConversation("acc-1", {
      contactId: null,
      contactName: "Carla Souza",
      contactPhone: "51991234477",
    });

    const found = await repo.getConversationByPhone("acc-1", "51991234477");
    expect(found?.id).toBe(conversation.id);

    const notFound = await repo.getConversationByPhone("acc-1", "00000000000");
    expect(notFound).toBeNull();
  });

  // Supabase's .maybeSingle() throws on duplicate phone numbers (no unique
  // constraint on contact_phone), so the Supabase repo orders by created_at
  // ascending and takes the first row. This test pins the in-memory repo's
  // existing .find() behavior (first in insertion order) so both repos agree
  // on which row wins when phones collide. The Supabase repo itself can't be
  // tested here (no live DB in this environment).
  it("returns the first-inserted conversation when multiple share a phone", async () => {
    const repo = createInMemoryWhatsappRepository();
    const first = await repo.insertConversation("acc-1", {
      contactId: null,
      contactName: "Carla Souza",
      contactPhone: "51991234477",
    });
    await repo.insertConversation("acc-1", {
      contactId: null,
      contactName: "Carla Duplicada",
      contactPhone: "51991234477",
    });

    const found = await repo.getConversationByPhone("acc-1", "51991234477");
    expect(found?.id).toBe(first.id);
  });

  it("increments and resets the unread count for a conversation", async () => {
    const repo = createInMemoryWhatsappRepository();
    const conversation = await repo.insertConversation("acc-1", {
      contactId: null,
      contactName: "Carla Souza",
      contactPhone: "51991234477",
    });

    await repo.incrementUnreadCount("acc-1", conversation.id);
    await repo.incrementUnreadCount("acc-1", conversation.id);
    const afterIncrement = await repo.getConversation("acc-1", conversation.id);
    expect(afterIncrement?.unreadCount).toBe(2);

    await repo.resetUnreadCount("acc-1", conversation.id);
    const afterReset = await repo.getConversation("acc-1", conversation.id);
    expect(afterReset?.unreadCount).toBe(0);
  });

  it("links a conversation to a contact", async () => {
    const repo = createInMemoryWhatsappRepository();
    const conversation = await repo.insertConversation("acc-1", {
      contactId: null,
      contactName: "Carla Souza",
      contactPhone: "51991234477",
    });

    await repo.linkConversationContact("acc-1", conversation.id, "contact-1");

    const updated = await repo.getConversation("acc-1", conversation.id);
    expect(updated?.contactId).toBe("contact-1");
  });

  it("does not link a conversation belonging to another account", async () => {
    const repo = createInMemoryWhatsappRepository();
    const conversation = await repo.insertConversation("acc-1", {
      contactId: null,
      contactName: "Carla Souza",
      contactPhone: "51991234477",
    });

    await repo.linkConversationContact("acc-2", conversation.id, "contact-1");

    const unchanged = await repo.getConversation("acc-1", conversation.id);
    expect(unchanged?.contactId).toBeNull();
  });

  it("returns null for a connection that hasn't been set up, then reflects upserts", async () => {
    const repo = createInMemoryWhatsappRepository();

    expect(await repo.getConnection("acc-1")).toBeNull();

    const connected = await repo.upsertConnectionStatus(
      "acc-1",
      "connected",
      "2026-08-21T10:00:00.000Z",
    );
    expect(connected.status).toBe("connected");
    expect(connected.connectedAt).toBe("2026-08-21T10:00:00.000Z");

    const disconnected = await repo.upsertConnectionStatus("acc-1", "disconnected", null);
    expect(disconnected.status).toBe("disconnected");
    expect(disconnected.connectedAt).toBeNull();
  });

  it("stores and returns provider config, and preserves it across status updates", async () => {
    const repo = createInMemoryWhatsappRepository();

    const withConfig = await repo.updateConnectionConfig("acc-1", "uazapi", {
      subdomain: "minhaclinica",
      token: "abc123",
      webhookSecret: "sekret",
    });
    expect(withConfig.provider).toBe("uazapi");
    expect(withConfig.config).toEqual({
      subdomain: "minhaclinica",
      token: "abc123",
      webhookSecret: "sekret",
    });

    await repo.upsertConnectionStatus("acc-1", "connecting", null);
    const afterStatusChange = await repo.getConnection("acc-1");
    expect(afterStatusChange?.config).toEqual({
      subdomain: "minhaclinica",
      token: "abc123",
      webhookSecret: "sekret",
    });
  });

  it("stores and clears the QR code", async () => {
    const repo = createInMemoryWhatsappRepository();

    const withQr = await repo.updateConnectionQrCode("acc-1", "data:image/png;base64,abc");
    expect(withQr.qrCode).toBe("data:image/png;base64,abc");

    const cleared = await repo.updateConnectionQrCode("acc-1", null);
    expect(cleared.qrCode).toBeNull();
  });

  it("insertMessage uses the provided sentAt instead of now", async () => {
    const repo = createInMemoryWhatsappRepository();
    const conversation = await repo.insertConversation("acc-1", {
      contactId: null,
      contactName: "Carla",
      contactPhone: "5511999999999",
    });
    const message = await repo.insertMessage("acc-1", conversation.id, {
      direction: "inbound",
      body: "mensagem antiga",
      sentAt: "2026-01-01T10:00:00.000Z",
    });
    expect(message.sentAt).toBe("2026-01-01T10:00:00.000Z");
  });

  it("markHistoryImported sets historyImportedAt on the conversation", async () => {
    const repo = createInMemoryWhatsappRepository();
    const conversation = await repo.insertConversation("acc-1", {
      contactId: null,
      contactName: "Carla",
      contactPhone: "5511999999999",
    });
    expect(conversation.historyImportedAt).toBeNull();

    await repo.markHistoryImported("acc-1", conversation.id, "2026-09-04T12:00:00.000Z");

    const updated = await repo.getConversation("acc-1", conversation.id);
    expect(updated?.historyImportedAt).toBe("2026-09-04T12:00:00.000Z");
  });

  it("markHistoryImported does nothing for a conversation from another account", async () => {
    const repo = createInMemoryWhatsappRepository();
    const conversation = await repo.insertConversation("acc-1", {
      contactId: null,
      contactName: "Carla",
      contactPhone: "5511999999999",
    });
    await repo.markHistoryImported("acc-2", conversation.id, "2026-09-04T12:00:00.000Z");
    const updated = await repo.getConversation("acc-1", conversation.id);
    expect(updated?.historyImportedAt).toBeNull();
  });
});

describe("listStoredMediaOlderThan", () => {
  it("devolve só mídia 'stored' com caminho e sent_at anterior ao corte", async () => {
    const repo = createInMemoryWhatsappRepository();
    const conv = await repo.insertConversation("acc-1", {
      contactId: null,
      contactName: "C",
      contactPhone: "551199",
    });
    const stored = await repo.insertMessage("acc-1", conv.id, {
      direction: "inbound",
      body: "",
      media: { type: "image", status: "stored", mime: "image/jpeg", filename: null, storagePath: "acc-1/x/y.jpg" },
    });
    await repo.insertMessage("acc-1", conv.id, {
      direction: "inbound",
      body: "",
      media: { type: "image", status: "too_large", mime: "image/jpeg", filename: null, storagePath: null },
    });
    await repo.insertMessage("acc-1", conv.id, { direction: "inbound", body: "texto" });

    const future = new Date(Date.now() + 86_400_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();

    const hits = await repo.listStoredMediaOlderThan(future);
    expect(hits).toEqual([
      { id: stored.id, accountId: "acc-1", mediaStoragePath: "acc-1/x/y.jpg" },
    ]);
    expect(await repo.listStoredMediaOlderThan(past)).toEqual([]);
  });
});
