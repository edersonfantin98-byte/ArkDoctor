import { z } from "zod";

export const CONSENT_KINDS = ["tcle", "imagem", "lgpd"] as const;
export type ConsentKind = (typeof CONSENT_KINDS)[number];
export type SignedVia = "inline" | "link";

export const recordConsentInputSchema = z.object({
  contactId: z.string().uuid(),
  kind: z.enum(CONSENT_KINDS),
  storagePath: z.string().trim().min(1),
  signerName: z.string().trim().min(1, "Informe o nome de quem assina").max(200),
  signedVia: z.enum(["inline", "link"]),
});
export type RecordConsentInput = z.infer<typeof recordConsentInputSchema>;
