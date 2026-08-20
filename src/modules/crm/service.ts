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

export async function createStage(
  repo: CrmRepository,
  accountId: string,
  name: string,
): Promise<PipelineStage> {
  const stages = await repo.getStages(accountId);
  const normalStages = stages.filter((s) => s.kind === "normal");

  const stage = await repo.insertStage(accountId, name, normalStages.length);
  await repo.reorderNormalStages(accountId, [...normalStages.map((s) => s.id), stage.id]);

  return stage;
}

export async function renameStage(
  repo: CrmRepository,
  accountId: string,
  stageId: string,
  name: string,
): Promise<PipelineStage> {
  return repo.renameStage(accountId, stageId, name);
}

export async function reorderStages(
  repo: CrmRepository,
  accountId: string,
  orderedIds: string[],
): Promise<void> {
  const stages = await repo.getStages(accountId);
  const byId = new Map(stages.map((s) => [s.id, s]));

  for (const id of orderedIds) {
    const stage = byId.get(id);
    if (!stage || stage.kind !== "normal") {
      throw new Error("reorderStages only accepts normal stages");
    }
  }

  await repo.reorderNormalStages(accountId, orderedIds);
}

export async function deleteStage(
  repo: CrmRepository,
  accountId: string,
  stageId: string,
): Promise<void> {
  const stage = await repo.getStage(accountId, stageId);
  if (!stage) throw new Error("Stage not found");
  if (stage.kind !== "normal") throw new Error("Only normal stages can be deleted");

  const openCount = await repo.countOpenDealsInStage(accountId, stageId);
  if (openCount > 0) {
    throw new Error("Cannot delete a stage with open deals");
  }

  await repo.deleteStage(accountId, stageId);
}

export async function reopenDeal(
  repo: CrmRepository,
  accountId: string,
  contactId: string,
): Promise<Deal> {
  const openDeal = await repo.getOpenDealForContact(accountId, contactId);
  if (openDeal) throw new Error("Contact already has an open deal");

  const stages = await repo.getStages(accountId);
  const firstStage = stages[0];
  const deal = await repo.insertDeal(accountId, contactId, firstStage.id);
  await repo.insertDealHistory(deal.id, null, firstStage.id);

  return deal;
}

export async function getStages(
  repo: CrmRepository,
  accountId: string,
): Promise<PipelineStage[]> {
  return repo.getStages(accountId);
}

export async function getOpenDealForContact(
  repo: CrmRepository,
  accountId: string,
  contactId: string,
): Promise<Deal | null> {
  return repo.getOpenDealForContact(accountId, contactId);
}
