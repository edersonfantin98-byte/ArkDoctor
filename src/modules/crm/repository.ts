import type {
  Contact,
  Deal,
  DealStageHistoryEntry,
  DealWithContact,
  PipelineStage,
} from "./types";

export interface CrmRepository {
  getStages(accountId: string): Promise<PipelineStage[]>;
  getStage(accountId: string, stageId: string): Promise<PipelineStage | null>;
  insertStage(accountId: string, name: string, position: number): Promise<PipelineStage>;
  renameStage(accountId: string, stageId: string, name: string): Promise<PipelineStage>;
  reorderNormalStages(accountId: string, orderedIds: string[]): Promise<void>;
  deleteStage(accountId: string, stageId: string): Promise<void>;
  countOpenDealsInStage(accountId: string, stageId: string): Promise<number>;

  insertContact(
    accountId: string,
    input: { name: string; phone: string; origin?: string; notes?: string },
  ): Promise<Contact>;
  updateContact(
    accountId: string,
    contactId: string,
    input: { name?: string; phone?: string; origin?: string | null; notes?: string | null },
  ): Promise<Contact>;
  searchContacts(accountId: string, query: string): Promise<Contact[]>;

  insertDeal(accountId: string, contactId: string, stageId: string): Promise<Deal>;
  getDeal(accountId: string, dealId: string): Promise<Deal | null>;
  getOpenDealForContact(accountId: string, contactId: string): Promise<Deal | null>;
  getDealsForContact(accountId: string, contactId: string): Promise<Deal[]>;
  updateDealStage(
    accountId: string,
    dealId: string,
    stageId: string,
    closedAt: string | null,
  ): Promise<Deal>;
  getDealsWithContactsByStage(accountId: string): Promise<Map<string, DealWithContact[]>>;

  insertDealHistory(
    dealId: string,
    fromStageId: string | null,
    toStageId: string,
  ): Promise<DealStageHistoryEntry>;
  getDealHistory(dealId: string): Promise<DealStageHistoryEntry[]>;
}
