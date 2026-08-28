import { parseOrThrow } from "@/lib/zod-error";
import type { TreatmentsRepository } from "./repository";
import {
  concludeTreatmentInputSchema,
  createTreatmentInputSchema,
  updatePhotoMetaInputSchema,
  updateTreatmentInputSchema,
} from "./schemas";
import type { AssembleReportInput, Treatment, TreatmentPhoto, TreatmentReport } from "./types";

export async function createTreatment(
  repo: TreatmentsRepository,
  accountId: string,
  rawInput: unknown,
): Promise<Treatment> {
  const input = parseOrThrow(createTreatmentInputSchema, rawInput);
  return repo.insertTreatment(accountId, {
    contactId: input.contactId,
    woundTypes: input.woundTypes,
    woundDetails: input.woundDetails ?? null,
    treatmentType: input.treatmentType ?? null,
    startedOn: input.startedOn,
    professionalAssessment: input.professionalAssessment ?? null,
    patientPerception: input.patientPerception ?? null,
  });
}

export async function updateTreatment(
  repo: TreatmentsRepository,
  accountId: string,
  id: string,
  rawInput: unknown,
): Promise<Treatment> {
  const input = parseOrThrow(updateTreatmentInputSchema, rawInput);
  return repo.updateTreatment(accountId, id, input);
}

export async function concludeTreatment(
  repo: TreatmentsRepository,
  accountId: string,
  id: string,
  rawInput: unknown,
): Promise<Treatment> {
  const input = parseOrThrow(concludeTreatmentInputSchema, rawInput);
  return repo.concludeTreatment(accountId, id, input);
}

export async function listTreatmentsForContact(
  repo: TreatmentsRepository,
  accountId: string,
  contactId: string,
): Promise<Treatment[]> {
  return repo.listTreatmentsForContact(accountId, contactId);
}

export async function deleteTreatment(
  repo: TreatmentsRepository,
  accountId: string,
  id: string,
): Promise<void> {
  await repo.deleteTreatment(accountId, id);
}

export async function updatePhotoMeta(
  repo: TreatmentsRepository,
  accountId: string,
  photoId: string,
  rawInput: unknown,
): Promise<TreatmentPhoto> {
  const input = parseOrThrow(updatePhotoMetaInputSchema, rawInput);
  return repo.updatePhotoMeta(accountId, photoId, input);
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function formatDurationLabel(startedOn: string, endOn: string): string {
  const start = new Date(`${startedOn}T00:00:00.000Z`).getTime();
  const end = new Date(`${endOn}T00:00:00.000Z`).getTime();
  const days = Math.max(0, Math.round((end - start) / DAY_MS));
  if (days < 7) return `${days} ${days === 1 ? "dia" : "dias"}`;
  const weeks = Math.round(days / 7);
  return `${weeks} ${weeks === 1 ? "semana" : "semanas"}`;
}

export function assembleReport(input: AssembleReportInput): TreatmentReport {
  const endOn = input.treatment.dischargedOn ?? input.now.slice(0, 10);
  return {
    treatment: input.treatment,
    contact: input.contact,
    professional: input.professional,
    sessionCount: input.sessionCount,
    sessions: [...input.sessions].sort((a, b) => a.date.localeCompare(b.date)),
    photos: input.photos,
    durationLabel: formatDurationLabel(input.treatment.startedOn, endOn),
    generatedAt: input.now,
  };
}
