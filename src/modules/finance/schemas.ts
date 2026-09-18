import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");

export const createFinancialEntryInputSchema = z.object({
  type: z.enum(["revenue", "expense"]),
  amount: z.number().positive("Valor deve ser maior que zero"),
  category: z.string().trim().min(1).max(200).optional(),
  procedureId: z.string().uuid().optional(),
  appointmentId: z.string().uuid().optional(),
  description: z.string().trim().max(2000).optional(),
  occurredAt: isoDate,
});
export type CreateFinancialEntryInput = z.infer<typeof createFinancialEntryInputSchema>;

export const createInstallmentPurchaseInputSchema = z.object({
  description: z.string().trim().max(2000).optional(),
  category: z.string().trim().min(1, "Categoria é obrigatória").max(200),
  totalAmount: z.number().positive("Valor deve ser maior que zero"),
  installments: z.number().int().min(2, "Mínimo de 2 parcelas").max(48, "Máximo de 48 parcelas"),
  firstDueDate: isoDate,
});
export type CreateInstallmentPurchaseInput = z.infer<typeof createInstallmentPurchaseInputSchema>;

export const updateFinancialEntryInputSchema = z.object({
  amount: z.number().positive("Valor deve ser maior que zero"),
  category: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  occurredAt: isoDate,
});
export type UpdateFinancialEntryInput = z.infer<typeof updateFinancialEntryInputSchema>;

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
