import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");

export const createFinancialEntryInputSchema = z.object({
  type: z.enum(["revenue", "expense"]),
  amount: z.number().positive("Valor deve ser maior que zero"),
  category: z.string().trim().min(1).max(200).optional(),
  procedureId: z.string().uuid().optional(),
  description: z.string().trim().max(2000).optional(),
  occurredAt: isoDate,
});
export type CreateFinancialEntryInput = z.infer<typeof createFinancialEntryInputSchema>;

export const dashboardPeriodSchema = z
  .object({
    from: isoDate,
    to: isoDate,
  })
  .refine((period) => period.from <= period.to, {
    message: "A data inicial deve ser anterior ou igual à data final",
    path: ["to"],
  });
export type DashboardPeriod = z.infer<typeof dashboardPeriodSchema>;
