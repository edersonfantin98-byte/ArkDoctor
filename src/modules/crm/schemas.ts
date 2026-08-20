import { z } from "zod";

export const createContactInputSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(200),
  phone: z.string().trim().min(8, "Telefone inválido").max(30),
  origin: z.string().trim().min(1).max(200).optional(),
  notes: z.string().trim().min(1).max(5000).optional(),
});

export type CreateContactInput = z.infer<typeof createContactInputSchema>;

export const updateContactInputSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  phone: z.string().trim().min(8).max(30).optional(),
  origin: z.string().trim().max(200).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

export type UpdateContactInput = z.infer<typeof updateContactInputSchema>;
