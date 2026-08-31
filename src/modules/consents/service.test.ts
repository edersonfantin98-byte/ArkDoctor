import { describe, it, expect } from "vitest";
import { createInMemoryConsentsRepository } from "./repository.memory";
import { recordConsent, listConsentsForContact, getConsent, deleteConsent } from "./service";

const validConsent = {
  contactId: "11111111-1111-4111-8111-111111111111",
  kind: "tcle",
  storagePath: "/path/to/consent.pdf",
  signerName: "Maria Silva",
  signedVia: "link" as const,
};

describe("recordConsent", () => {
  it("persists consent with all fields", async () => {
    const repo = createInMemoryConsentsRepository();
    const consent = await recordConsent(repo, "acc-1", validConsent);
    expect(consent.contactId).toBe(validConsent.contactId);
    expect(consent.kind).toBe("tcle");
    expect(consent.signerName).toBe("Maria Silva");
    expect(consent.signedVia).toBe("link");
    expect(consent.storagePath).toBe("/path/to/consent.pdf");
    expect(consent.accountId).toBe("acc-1");
  });

  it("trims signerName", async () => {
    const repo = createInMemoryConsentsRepository();
    const consent = await recordConsent(repo, "acc-1", {
      ...validConsent,
      signerName: "  João Santos  ",
    });
    expect(consent.signerName).toBe("João Santos");
  });

  it("rejects an empty signerName with 'Informe o nome de quem assina'", async () => {
    const repo = createInMemoryConsentsRepository();
    await expect(
      recordConsent(repo, "acc-1", { ...validConsent, signerName: "   " }),
    ).rejects.toThrow(/Informe o nome de quem assina/);
  });

  it("rejects an unknown kind", async () => {
    const repo = createInMemoryConsentsRepository();
    await expect(
      recordConsent(repo, "acc-1", { ...validConsent, kind: "unknown" } as Record<string, unknown>),
    ).rejects.toThrow();
  });

  it("rejects an invalid signedVia", async () => {
    const repo = createInMemoryConsentsRepository();
    await expect(
      recordConsent(repo, "acc-1", { ...validConsent, signedVia: "invalid" } as Record<string, unknown>),
    ).rejects.toThrow();
  });
});

describe("listConsentsForContact", () => {
  it("lists all consents for a contact sorted by signedAt descending", async () => {
    const repo = createInMemoryConsentsRepository();
    const c1 = await recordConsent(repo, "acc-1", {
      ...validConsent,
      kind: "tcle",
    });
    await new Promise((r) => setTimeout(r, 2));
    const c2 = await recordConsent(repo, "acc-1", {
      ...validConsent,
      kind: "imagem",
    });
    const consents = await listConsentsForContact(repo, "acc-1", validConsent.contactId);
    expect(consents).toHaveLength(2);
    expect(consents[0].id).toBe(c2.id);
    expect(consents[1].id).toBe(c1.id);
  });

  it("returns empty list when contact has no consents", async () => {
    const repo = createInMemoryConsentsRepository();
    const consents = await listConsentsForContact(repo, "acc-1", validConsent.contactId);
    expect(consents).toHaveLength(0);
  });
});

describe("getConsent", () => {
  it("retrieves a consent by id", async () => {
    const repo = createInMemoryConsentsRepository();
    const created = await recordConsent(repo, "acc-1", validConsent);
    const retrieved = await getConsent(repo, "acc-1", created.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(created.id);
    expect(retrieved!.signerName).toBe(created.signerName);
  });

  it("returns null for a non-existent consent", async () => {
    const repo = createInMemoryConsentsRepository();
    const result = await getConsent(repo, "acc-1", "non-existent-id");
    expect(result).toBeNull();
  });

  it("returns null for a consent from another account", async () => {
    const repo = createInMemoryConsentsRepository();
    const created = await recordConsent(repo, "acc-1", validConsent);
    const result = await getConsent(repo, "acc-2", created.id);
    expect(result).toBeNull();
  });
});

describe("deleteConsent", () => {
  it("deletes a consent by id", async () => {
    const repo = createInMemoryConsentsRepository();
    const created = await recordConsent(repo, "acc-1", validConsent);
    await deleteConsent(repo, "acc-1", created.id);
    const result = await getConsent(repo, "acc-1", created.id);
    expect(result).toBeNull();
  });

  it("throws when trying to delete a non-existent consent", async () => {
    const repo = createInMemoryConsentsRepository();
    await expect(deleteConsent(repo, "acc-1", "non-existent-id")).rejects.toThrow();
  });

  it("throws when trying to delete a consent from another account", async () => {
    const repo = createInMemoryConsentsRepository();
    const created = await recordConsent(repo, "acc-1", validConsent);
    await expect(deleteConsent(repo, "acc-2", created.id)).rejects.toThrow();
  });
});
