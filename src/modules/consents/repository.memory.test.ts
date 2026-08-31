import { describe, it, expect } from "vitest";
import { createInMemoryConsentsRepository } from "./repository.memory";

function baseInput(overrides: Partial<Parameters<
  ReturnType<typeof createInMemoryConsentsRepository>["insertConsent"]
>[1]> = {}) {
  return {
    contactId: "contact-1",
    kind: "tcle" as const,
    storagePath: "acc-1/contact-1/tcle-1.pdf",
    signerName: "Maria Silva",
    signedVia: "inline" as const,
    ...overrides,
  };
}

describe("createInMemoryConsentsRepository", () => {
  it("inserts and reads a consent scoped to its account", async () => {
    const repo = createInMemoryConsentsRepository();
    const c = await repo.insertConsent("acc-1", baseInput());

    expect(c.kind).toBe("tcle");
    expect(c.signerName).toBe("Maria Silva");
    expect(c.signedVia).toBe("inline");
    expect(await repo.getConsent("acc-1", c.id)).not.toBeNull();
    expect(await repo.getConsent("acc-2", c.id)).toBeNull();
  });

  it("lists a contact's consents newest-signed first", async () => {
    const repo = createInMemoryConsentsRepository();
    const a = await repo.insertConsent("acc-1", baseInput({ kind: "tcle" }));
    await new Promise((r) => setTimeout(r, 2));
    const b = await repo.insertConsent("acc-1", baseInput({ kind: "imagem" }));
    await repo.insertConsent("acc-1", baseInput({ contactId: "other" }));

    const list = await repo.listConsentsForContact("acc-1", "contact-1");
    expect(list.map((c) => c.id)).toEqual([b.id, a.id]);
  });

  it("deletes a consent scoped to its account", async () => {
    const repo = createInMemoryConsentsRepository();
    const c = await repo.insertConsent("acc-1", baseInput());
    await expect(repo.deleteConsent("acc-2", c.id)).rejects.toThrow();
    await repo.deleteConsent("acc-1", c.id);
    expect(await repo.getConsent("acc-1", c.id)).toBeNull();
  });
});
