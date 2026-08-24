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
    input: {
      name: string;
      phone: string;
      origin?: string;
      notes?: string;
      email?: string;
      birthDate?: string;
      cpf?: string;
      sex?: "M" | "F";
      guardianName?: string;
      guardianPhone?: string;
      guardianRelationship?: string;
    },
  ): Promise<Contact>;
  updateContact(
    accountId: string,
    contactId: string,
    input: {
      name?: string;
      phone?: string;
      origin?: string | null;
      notes?: string | null;
      email?: string | null;
      birthDate?: string | null;
      cpf?: string | null;
      sex?: "M" | "F" | null;
      guardianName?: string | null;
      guardianPhone?: string | null;
      guardianRelationship?: string | null;
    },
  ): Promise<Contact>;
  searchContacts(accountId: string, query: string): Promise<Contact[]>;
  findContactByPhone(accountId: string, phone: string): Promise<Contact | null>;
  deleteContact(accountId: string, contactId: string): Promise<void>;
  countNewContacts(accountId: string, sinceIso: string, untilIso?: string): Promise<number>;
  listContacts(accountId: string): Promise<Contact[]>;

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
