import { z } from "zod";

export const createProcedureInputSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(200),
  defaultPrice: z.number().nonnegative(),
  defaultDurationMinutes: z.number().int().positive(),
});
export type CreateProcedureInput = z.infer<typeof createProcedureInputSchema>;

export const updateProcedureInputSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  defaultPrice: z.number().nonnegative().optional(),
  defaultDurationMinutes: z.number().int().positive().optional(),
});
export type UpdateProcedureInput = z.infer<typeof updateProcedureInputSchema>;

export const createAppointmentInputSchema = z
  .object({
    contactId: z.string().uuid(),
    procedureId: z.string().uuid(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime().optional(),
    notes: z.string().trim().max(5000).optional(),
  })
  .refine((data) => !data.endsAt || new Date(data.endsAt) > new Date(data.startsAt), {
    message: "O fim deve ser depois do início",
    path: ["endsAt"],
  });
export type CreateAppointmentInput = z.infer<typeof createAppointmentInputSchema>;

export const createAvailabilityBlockInputSchema = z
  .object({
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    reason: z.string().trim().max(200).optional(),
  })
  .refine((data) => new Date(data.endsAt) > new Date(data.startsAt), {
    message: "O fim deve ser depois do início",
    path: ["endsAt"],
  });
export type CreateAvailabilityBlockInput = z.infer<typeof createAvailabilityBlockInputSchema>;

export const createAvailabilityRuleInputSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida"),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida"),
    reason: z.string().trim().max(200).optional(),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: "O fim deve ser depois do início",
    path: ["endTime"],
  });
export type CreateAvailabilityRuleInput = z.infer<typeof createAvailabilityRuleInputSchema>;
