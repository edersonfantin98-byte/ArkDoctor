import type { CrmRepository } from "./repository";
import type {
  Contact,
  Deal,
  DealStageHistoryEntry,
  DealWithContact,
  PipelineStage,
  StageKind,
} from "./types";

const DEFAULT_STAGES: { name: string; kind: StageKind }[] = [
  { name: "Novo Lead", kind: "normal" },
  { name: "Em Negociação", kind: "normal" },
  { name: "Agendado", kind: "normal" },
  { name: "Atendido", kind: "normal" },
  { name: "Follow-up", kind: "follow_up" },
  { name: "Perdido", kind: "lost" },
];

export function createInMemoryCrmRepository(): CrmRepository {
  const stages = new Map<string, PipelineStage>();
  const contacts = new Map<string, Contact>();
  const deals = new Map<string, Deal>();
  const history: DealStageHistoryEntry[] = [];
  const seededAccounts = new Set<string>();

  function ensureSeeded(accountId: string) {
    if (seededAccounts.has(accountId)) return;
    seededAccounts.add(accountId);
    DEFAULT_STAGES.forEach((stage, index) => {
      const id = crypto.randomUUID();
      stages.set(id, { id, accountId, name: stage.name, kind: stage.kind, position: index });
    });
  }

  const KIND_ORDER: Record<StageKind, number> = { normal: 0, follow_up: 1, lost: 2 };

  function stagesForAccount(accountId: string): PipelineStage[] {
    ensureSeeded(accountId);
    return [...stages.values()]
      .filter((s) => s.accountId === accountId)
      .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.position - b.position);
  }

  return {
    async getStages(accountId) {
      return stagesForAccount(accountId);
    },

    async getStage(accountId, stageId) {
      const stage = stages.get(stageId);
      return stage && stage.accountId === accountId ? stage : null;
    },

    async insertStage(accountId, name, position) {
      ensureSeeded(accountId);
      const id = crypto.randomUUID();
      const stage: PipelineStage = { id, accountId, name, kind: "normal", position };
      stages.set(id, stage);
      return stage;
    },

    async renameStage(accountId, stageId, name) {
      const stage = stages.get(stageId);
      if (!stage || stage.accountId !== accountId) throw new Error("Stage not found");
      const updated = { ...stage, name };
      stages.set(stageId, updated);
      return updated;
    },

    async reorderNormalStages(accountId, orderedIds) {
      orderedIds.forEach((id, index) => {
        const stage = stages.get(id);
        if (!stage || stage.accountId !== accountId || stage.kind !== "normal") {
          throw new Error("Invalid stage in reorder list");
        }
        stages.set(id, { ...stage, position: index });
      });
    },

    async deleteStage(accountId, stageId) {
      const stage = stages.get(stageId);
      if (!stage || stage.accountId !== accountId) throw new Error("Stage not found");
      stages.delete(stageId);
    },

    async countOpenDealsInStage(accountId, stageId) {
      return [...deals.values()].filter(
        (d) => d.accountId === accountId && d.stageId === stageId && d.closedAt === null,
      ).length;
    },

    async insertContact(accountId, input) {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const contact: Contact = {
        id,
        accountId,
        name: input.name,
        phone: input.phone,
        origin: input.origin ?? null,
        notes: input.notes ?? null,
        createdAt: now,
        updatedAt: now,
      };
      contacts.set(id, contact);
      return contact;
    },

    async updateContact(accountId, contactId, input) {
      const contact = contacts.get(contactId);
      if (!contact || contact.accountId !== accountId) throw new Error("Contact not found");
      const updated: Contact = {
        ...contact,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.origin !== undefined ? { origin: input.origin } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        updatedAt: new Date().toISOString(),
      };
      contacts.set(contactId, updated);
      return updated;
    },

    async searchContacts(accountId, query) {
      const q = query.trim().toLowerCase();
      return [...contacts.values()].filter(
        (c) =>
          c.accountId === accountId &&
          (c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q)),
      );
    },

    async countNewContacts(accountId, sinceIso, untilIso) {
      return [...contacts.values()].filter(
        (c) =>
          c.accountId === accountId &&
          c.createdAt >= sinceIso &&
          (untilIso === undefined || c.createdAt < untilIso),
      ).length;
    },

    async insertDeal(accountId, contactId, stageId) {
      const id = crypto.randomUUID();
      const deal: Deal = {
        id,
        accountId,
        contactId,
        stageId,
        createdAt: new Date().toISOString(),
        closedAt: null,
      };
      deals.set(id, deal);
      return deal;
    },

    async getDeal(accountId, dealId) {
      const deal = deals.get(dealId);
      return deal && deal.accountId === accountId ? deal : null;
    },

    async getOpenDealForContact(accountId, contactId) {
      return (
        [...deals.values()].find(
          (d) => d.accountId === accountId && d.contactId === contactId && d.closedAt === null,
        ) ?? null
      );
    },

    async getDealsForContact(accountId, contactId) {
      return [...deals.values()].filter(
        (d) => d.accountId === accountId && d.contactId === contactId,
      );
    },

    async updateDealStage(accountId, dealId, stageId, closedAt) {
      const deal = deals.get(dealId);
      if (!deal || deal.accountId !== accountId) throw new Error("Deal not found");
      const updated: Deal = { ...deal, stageId, closedAt };
      deals.set(dealId, updated);
      return updated;
    },

    async getDealsWithContactsByStage(accountId) {
      const result = new Map<string, DealWithContact[]>();
      for (const deal of deals.values()) {
        if (deal.accountId !== accountId) continue;
        const contact = contacts.get(deal.contactId);
        if (!contact) continue;
        const list = result.get(deal.stageId) ?? [];
        list.push({ ...deal, contact });
        result.set(deal.stageId, list);
      }
      return result;
    },

    async insertDealHistory(dealId, fromStageId, toStageId) {
      const entry: DealStageHistoryEntry = {
        id: crypto.randomUUID(),
        dealId,
        fromStageId,
        toStageId,
        movedAt: new Date().toISOString(),
      };
      history.push(entry);
      return entry;
    },

    async getDealHistory(dealId) {
      return history.filter((h) => h.dealId === dealId).sort((a, b) => a.movedAt.localeCompare(b.movedAt));
    },
  };
}
