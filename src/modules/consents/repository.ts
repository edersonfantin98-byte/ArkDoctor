import type { ConsentKind, SignedVia } from "./schemas";
import type { SignedConsent } from "./types";

export interface ConsentsRepository {
  insertConsent(
    accountId: string,
    input: {
      contactId: string;
      kind: ConsentKind;
      storagePath: string;
      signerName: string;
      signedVia: SignedVia;
    },
  ): Promise<SignedConsent>;
  listConsentsForContact(accountId: string, contactId: string): Promise<SignedConsent[]>;
  getConsent(accountId: string, id: string): Promise<SignedConsent | null>;
  deleteConsent(accountId: string, id: string): Promise<void>;
}
