export type StageKind = "normal" | "follow_up" | "lost";

export interface PipelineStage {
  id: string;
  accountId: string;
  name: string;
  kind: StageKind;
  position: number;
}

export interface Contact {
  id: string;
  accountId: string;
  name: string;
  phone: string;
  origin: string | null;
  notes: string | null;
  email: string | null;
  birthDate: string | null;
  cpf: string | null;
  sex: "M" | "F" | null;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianRelationship: string | null;
  rg: string | null;
  address: string | null;
  cityState: string | null;
  guardianRg: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Deal {
  id: string;
  accountId: string;
  contactId: string;
  stageId: string;
  createdAt: string;
  closedAt: string | null;
}

export interface DealStageHistoryEntry {
  id: string;
  dealId: string;
  fromStageId: string | null;
  toStageId: string;
  movedAt: string;
}

export interface DealWithContact extends Deal {
  contact: Contact;
}
