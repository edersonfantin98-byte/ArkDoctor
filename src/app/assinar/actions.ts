"use server";

import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import { createSupabaseConsentsRepository } from "@/modules/consents/repository.supabase";
import { createSupabaseCrmRepository } from "@/modules/crm/repository.supabase";
import * as consents from "@/modules/consents/service";
import { docFieldsToContactUpdate } from "@/modules/consents/patient-doc-sync";
import { verifyConsentToken } from "@/modules/consents/token";
import { withinConsentSignRateLimit } from "@/lib/rate-limit";

const CONSENT_BUCKET = "signed-consents";
const MAX_CONSENT_PDF_BYTES = 2 * 1024 * 1024;

export async function submitPublicConsentAction(
  token: string,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await withinConsentSignRateLimit())) {
    return { ok: false, error: "Muitas tentativas. Aguarde um minuto e tente novamente." };
  }

  const claims = await verifyConsentToken(token);
  if (!claims) return { ok: false, error: "Este link expirou ou é inválido." };

  const file = formData.get("file");
  if (!(file instanceof Blob)) return { ok: false, error: "Arquivo inválido." };
  if (file.type !== "application/pdf") return { ok: false, error: "O arquivo não é um PDF." };
  if (file.size > MAX_CONSENT_PDF_BYTES) {
    return { ok: false, error: "O documento excede o tamanho permitido." };
  }
  const signerName = (formData.get("signerName") as string | null)?.trim();
  if (!signerName) return { ok: false, error: "Informe o nome de quem assina." };

  const supabase = createServiceRoleSupabaseClient();
  const path = `${claims.accountId}/${claims.contactId}/${claims.kind}-${Date.now()}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from(CONSENT_BUCKET)
    .upload(path, file, { contentType: "application/pdf", upsert: false });
  if (uploadError) {
    console.error("[assinar/actions] upload", uploadError);
    return { ok: false, error: "Não foi possível salvar o documento. Tente novamente." };
  }

  try {
    await consents.recordConsent(createSupabaseConsentsRepository(supabase), claims.accountId, {
      contactId: claims.contactId,
      kind: claims.kind,
      storagePath: path,
      signerName,
      signedVia: "link",
    });
  } catch (err) {
    console.error("[assinar/actions] recordConsent", err);
    const { error: rollbackError } = await supabase.storage
      .from(CONSENT_BUCKET)
      .remove([path]);
    if (rollbackError) {
      console.error("[assinar/actions] recordConsent rollback", rollbackError);
    }
    return { ok: false, error: "Não foi possível registrar a assinatura. Tente novamente." };
  }

  const docFieldsRaw = formData.get("docFields");
  if (typeof docFieldsRaw === "string" && docFieldsRaw) {
    try {
      const update = docFieldsToContactUpdate(JSON.parse(docFieldsRaw) as Record<string, string>);
      if (Object.values(update).some((v) => v !== undefined)) {
        await createSupabaseCrmRepository(supabase).updateContact(
          claims.accountId,
          claims.contactId,
          update,
        );
      }
    } catch (err) {
      // A assinatura já está registrada; sincronizar o cadastro é best-effort.
      console.error("[assinar/actions] updateContact", err);
    }
  }

  return { ok: true };
}
