import { z } from "zod";

export const createContactInputSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(200),
  phone: z.string().trim().min(8, "Telefone inválido").max(30),
  origin: z.string().trim().min(1).max(200).optional(),
  notes: z.string().trim().min(1).max(5000).optional(),
  email: z.string().trim().email("E-mail inválido").max(200).optional(),
  birthDate: z.string().trim().min(1).max(30).optional(),
  cpf: z.string().trim().min(1).max(20).optional(),
  sex: z.enum(["M", "F"]).optional(),
  guardianName: z.string().trim().min(1).max(200).optional(),
  guardianPhone: z.string().trim().min(1).max(30).optional(),
  guardianRelationship: z.string().trim().min(1).max(100).optional(),
  rg: z.string().trim().min(1).max(40).optional(),
  address: z.string().trim().min(1).max(300).optional(),
  cityState: z.string().trim().min(1).max(120).optional(),
  guardianRg: z.string().trim().min(1).max(40).optional(),
});

export type CreateContactInput = z.infer<typeof createContactInputSchema>;

export const updateContactInputSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  phone: z.string().trim().min(8).max(30).optional(),
  origin: z.string().trim().max(200).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  email: z.string().trim().email("E-mail inválido").max(200).nullable().optional(),
  birthDate: z.string().trim().max(30).nullable().optional(),
  cpf: z.string().trim().max(20).nullable().optional(),
  sex: z.enum(["M", "F"]).nullable().optional(),
  guardianName: z.string().trim().max(200).nullable().optional(),
  guardianPhone: z.string().trim().max(30).nullable().optional(),
  guardianRelationship: z.string().trim().max(100).nullable().optional(),
  rg: z.string().trim().max(40).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  cityState: z.string().trim().max(120).nullable().optional(),
  guardianRg: z.string().trim().max(40).nullable().optional(),
});

export type UpdateContactInput = z.infer<typeof updateContactInputSchema>;
