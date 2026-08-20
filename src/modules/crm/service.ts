import type { CrmRepository } from "./repository";
import { createContactInputSchema } from "./schemas";
import type { Contact } from "./types";

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
