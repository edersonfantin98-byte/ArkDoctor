import { z } from "zod";

export const createContactInputSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório"),
  phone: z.string().trim().min(8, "Telefone inválido"),
  origin: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
});

export type CreateContactInput = z.infer<typeof createContactInputSchema>;

export const updateContactInputSchema = z.object({
  name: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(8).optional(),
  origin: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
});

export type UpdateContactInput = z.infer<typeof updateContactInputSchema>;
