import type { ZodError, ZodSchema } from "zod";

function friendlyMessage(error: ZodError): string {
  return error.issues[0]?.message ?? "Dados inválidos";
}

export function parseOrThrow<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(friendlyMessage(result.error));
  }
  return result.data;
}
