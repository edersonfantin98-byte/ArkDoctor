import { z } from "zod";

export const startConversationInputSchema = z.object({
  contactId: z.string().uuid().nullable(),
  contactName: z.string().min(1, "Nome é obrigatório"),
  contactPhone: z.string().min(1, "Telefone é obrigatório"),
});

export const logMessageInputSchema = z.object({
  direction: z.enum(["inbound", "outbound"]),
  body: z.string().min(1, "Mensagem não pode ser vazia"),
});
