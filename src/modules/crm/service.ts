import type { CrmRepository } from "./repository";
import { createContactInputSchema, updateContactInputSchema } from "./schemas";
import type { Contact, Deal, DealWithContact, PipelineStage } from "./types";

export async function createContact(
  repo: CrmRepository,
  accountId: string,
  rawInput: unknown,
): Promise<Contact> {
  const input = createContactInputSchema.parse(rawInput);
  const contact = await repo.insertContact(accountId, input);

  const stages = await repo.getStages(accountId);
  const firstStage = stages[0];
  const deal = await repo.insertDeal(accountId, contact.id, firstStage.id);
  await repo.insertDealHistory(deal.id, null, firstStage.id);

  return contact;
}

export async function searchContacts(
  repo: CrmRepository,
  accountId: string,
  query: string,
): Promise<Contact[]> {
  return repo.searchContacts(accountId, query);
}

export async function updateContact(
  repo: CrmRepository,
  accountId: string,
  contactId: string,
  rawInput: unknown,
): Promise<Contact> {
  const input = updateContactInputSchema.parse(rawInput);
  return repo.updateContact(accountId, contactId, input);
}

export async function listPipeline(
  repo: CrmRepository,
  accountId: string,
): Promise<{ stage: PipelineStage; deals: DealWithContact[] }[]> {
  const stages = await repo.getStages(accountId);
  const dealsByStage = await repo.getDealsWithContactsByStage(accountId);

  return stages.map((stage) => ({
    stage,
    deals: dealsByStage.get(stage.id) ?? [],
  }));
}

export async function moveDeal(
  repo: CrmRepository,
  accountId: string,
  dealId: string,
  toStageId: string,
): Promise<Deal> {
  const deal = await repo.getDeal(accountId, dealId);
  if (!deal) throw new Error("Deal not found");

  if (deal.stageId === toStageId) {
    return deal;
  }

  const toStage = await repo.getStage(accountId, toStageId);
  if (!toStage) throw new Error("Stage not found");

  const closedAt = toStage.kind === "lost" ? new Date().toISOString() : null;
  const updated = await repo.updateDealStage(accountId, dealId, toStageId, closedAt);
  await repo.insertDealHistory(dealId, deal.stageId, toStageId);

  return updated;
}
