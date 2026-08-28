"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getAccountProfessionalIdentity,
  getCurrentAccountId,
} from "@/lib/supabase/account";
import { createSupabaseTreatmentsRepository } from "@/modules/treatments/repository.supabase";
import { parseOrThrow } from "@/lib/zod-error";

const identitySchema = z.object({
  professionalName: z.string().trim().max(200).nullable(),
  councilId: z.string().trim().max(100).nullable(),
});

export async function getClinicSettingsAction() {
  const supabase = await createServerSupabaseClient();
  const accountId = await getCurrentAccountId(supabase);
  const identity = await getAccountProfessionalIdentity(supabase, accountId);
  const treatmentsRepo = createSupabaseTreatmentsRepository(supabase);
  const storageBytes = await treatmentsRepo.sumPhotoBytes(accountId);
  return { ...identity, storageBytes };
}

export async function updateProfessionalIdentityAction(input: unknown) {
  const supabase = await createServerSupabaseClient();
  const accountId = await getCurrentAccountId(supabase);
  const parsed = parseOrThrow(identitySchema, input);
  const { error } = await supabase
    .from("accounts")
    .update({
      professional_name: parsed.professionalName || null,
      professional_council_id: parsed.councilId || null,
    })
    .eq("id", accountId);
  if (error) {
    console.error("[configuracoes/actions] updateProfessionalIdentity", error);
    throw new Error("Não foi possível salvar as configurações. Tente novamente.");
  }
  revalidatePath("/configuracoes");
}
