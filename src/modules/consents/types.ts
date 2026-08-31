import type { ConsentKind, SignedVia } from "./schemas";

export interface SignedConsent {
  id: string;
  accountId: string;
  contactId: string;
  kind: ConsentKind;
  storagePath: string;
  signerName: string;
  signedVia: SignedVia;
  signedAt: string; // ISO
  createdAt: string; // ISO
}
