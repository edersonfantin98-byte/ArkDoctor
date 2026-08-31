import { parseOrThrow } from "@/lib/zod-error";
import type { ConsentsRepository } from "./repository";
import { recordConsentInputSchema } from "./schemas";
import type { SignedConsent } from "./types";

export async function recordConsent(
  repo: ConsentsRepository,
  accountId: string,
  rawInput: unknown,
): Promise<SignedConsent> {
  const input = parseOrThrow(recordConsentInputSchema, rawInput);
  return repo.insertConsent(accountId, {
    contactId: input.contactId,
    kind: input.kind,
    storagePath: input.storagePath,
    signerName: input.signerName,
    signedVia: input.signedVia,
  });
}

export async function listConsentsForContact(
  repo: ConsentsRepository,
  accountId: string,
  contactId: string,
): Promise<SignedConsent[]> {
  return repo.listConsentsForContact(accountId, contactId);
}

export async function getConsent(
  repo: ConsentsRepository,
  accountId: string,
  id: string,
): Promise<SignedConsent | null> {
  return repo.getConsent(accountId, id);
}

export async function deleteConsent(
  repo: ConsentsRepository,
  accountId: string,
  id: string,
): Promise<void> {
  await repo.deleteConsent(accountId, id);
}
