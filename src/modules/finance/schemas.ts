import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");

export const createProcedureInputSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(200),
  defaultPrice: z.number().positive("Valor deve ser maior que zero"),
  category: z.string().trim().min(1).max(200).optional(),
});
export type CreateProcedureInput = z.infer<typeof createProcedureInputSchema>;

export const updateProcedureInputSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  defaultPrice: z.number().positive().optional(),
  category: z.string().trim().max(200).nullable().optional(),
  active: z.boolean().optional(),
});
export type UpdateProcedureInput = z.infer<typeof updateProcedureInputSchema>;

export const createFinancialEntryInputSchema = z.object({
  type: z.enum(["revenue", "expense"]),
  amount: z.number().positive("Valor deve ser maior que zero"),
  category: z.string().trim().min(1).max(200).optional(),
  procedureId: z.string().uuid().optional(),
  description: z.string().trim().max(2000).optional(),
  occurredAt: isoDate,
});
export type CreateFinancialEntryInput = z.infer<typeof createFinancialEntryInputSchema>;

export const dashboardPeriodSchema = z.object({
  from: isoDate,
  to: isoDate,
});
export type DashboardPeriod = z.infer<typeof dashboardPeriodSchema>;
