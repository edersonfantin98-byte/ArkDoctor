import { z } from "zod";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
const longText = z.string().trim().max(5000);
const shortText = z.string().trim().max(200);

export const createTreatmentInputSchema = z.object({
  contactId: z.string().uuid(),
  woundTypes: z.string().trim().min(1, "Informe ao menos um tipo de ferida").max(200),
  woundDetails: longText.optional(),
  treatmentType: shortText.optional(),
  startedOn: dateString,
  professionalAssessment: longText.optional(),
  patientPerception: longText.optional(),
});
export type CreateTreatmentInput = z.infer<typeof createTreatmentInputSchema>;

export const updateTreatmentInputSchema = z.object({
  woundTypes: z.string().trim().min(1, "Informe ao menos um tipo de ferida").max(200).optional(),
  woundDetails: longText.nullable().optional(),
  treatmentType: shortText.nullable().optional(),
  startedOn: dateString.optional(),
  professionalAssessment: longText.nullable().optional(),
  patientPerception: longText.nullable().optional(),
});
export type UpdateTreatmentInput = z.infer<typeof updateTreatmentInputSchema>;

export const concludeTreatmentInputSchema = z.object({
  dischargedOn: dateString,
  outcome: z.enum(["cicatrizacao", "alta", "abandono", "encaminhamento"]),
});
export type ConcludeTreatmentInput = z.infer<typeof concludeTreatmentInputSchema>;

export const updatePhotoMetaInputSchema = z.object({
  caption: shortText.nullable(),
  takenOn: dateString.nullable(),
});
export type UpdatePhotoMetaInput = z.infer<typeof updatePhotoMetaInputSchema>;
