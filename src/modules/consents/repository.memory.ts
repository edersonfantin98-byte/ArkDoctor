import type { ConsentsRepository } from "./repository";
import type { SignedConsent } from "./types";

export function createInMemoryConsentsRepository(): ConsentsRepository {
  const rows = new Map<string, SignedConsent>();

  function owned(row: SignedConsent | undefined, accountId: string): SignedConsent | null {
    return row && row.accountId === accountId ? row : null;
  }

  return {
    async insertConsent(accountId, input) {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const row: SignedConsent = {
        id,
        accountId,
        contactId: input.contactId,
        kind: input.kind,
        storagePath: input.storagePath,
        signerName: input.signerName,
        signedVia: input.signedVia,
        signedAt: now,
        createdAt: now,
      };
      rows.set(id, row);
      return row;
    },

    async listConsentsForContact(accountId, contactId) {
      return [...rows.values()]
        .filter((r) => r.accountId === accountId && r.contactId === contactId)
        .sort((a, b) => b.signedAt.localeCompare(a.signedAt));
    },

    async getConsent(accountId, id) {
      return owned(rows.get(id), accountId);
    },

    async deleteConsent(accountId, id) {
      const current = owned(rows.get(id), accountId);
      if (!current) throw new Error("Consent not found");
      rows.delete(id);
    },
  };
}
