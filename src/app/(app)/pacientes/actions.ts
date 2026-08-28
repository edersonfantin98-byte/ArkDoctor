"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentAccountId } from "@/lib/supabase/account";
import { createSupabaseCrmRepository } from "@/modules/crm/repository.supabase";
import { createSupabaseWhatsappRepository } from "@/modules/whatsapp/repository.supabase";
import { getWhatsappProvider } from "@/modules/whatsapp/provider";
import * as crm from "@/modules/crm/service";
import { sendBulkMessages } from "@/modules/whatsapp/service";
import { createSupabaseTreatmentsRepository } from "@/modules/treatments/repository.supabase";

async function getCrmRepoAndAccount() {
  const supabase = await createServerSupabaseClient();
  const accountId = await getCurrentAccountId(supabase);
  const repo = createSupabaseCrmRepository(supabase);
  return { repo, accountId, supabase };
}

export async function listPatientsAction() {
  const { repo, accountId } = await getCrmRepoAndAccount();
  return repo.listContacts(accountId);
}

export async function searchPatientsAction(query: string) {
  const { repo, accountId } = await getCrmRepoAndAccount();
  return crm.searchContacts(repo, accountId, query);
}

export async function createPatientAction(input: unknown) {
  const { repo, accountId } = await getCrmRepoAndAccount();
  const contact = await crm.createContact(repo, accountId, input);
  revalidatePath("/pacientes");
  return contact;
}

export async function updatePatientAction(id: string, input: unknown) {
  const { repo, accountId } = await getCrmRepoAndAccount();
  const contact = await crm.updateContact(repo, accountId, id, input);
  revalidatePath("/pacientes");
  return contact;
}

export async function deletePatientAction(id: string) {
  const { repo, accountId, supabase } = await getCrmRepoAndAccount();

  const treatmentsRepo = createSupabaseTreatmentsRepository(supabase);
  const treatmentsForContact = await treatmentsRepo.listTreatmentsForContact(accountId, id);
  const paths: string[] = [];
  for (const t of treatmentsForContact) {
    const photos = await treatmentsRepo.listPhotos(accountId, t.id);
    for (const p of photos) paths.push(p.storagePath);
  }
  if (paths.length > 0) {
    const { error } = await supabase.storage.from("treatment-photos").remove(paths);
    if (error) {
      console.error("[pacientes/actions] storage remove", error);
      throw new Error("Não foi possível remover as fotos do armazenamento. Tente novamente.");
    }
  }

  await crm.deleteContact(repo, accountId, id);
  revalidatePath("/pacientes");
}

export async function sendBulkMessageAction(input: { contactIds: string[]; message: string }) {
  const { repo: crmRepo, accountId, supabase } = await getCrmRepoAndAccount();
  const allContacts = await crmRepo.listContacts(accountId);
  const targets = allContacts.filter((c) => input.contactIds.includes(c.id));

  const whatsappRepo = createSupabaseWhatsappRepository(supabase);
  const connection = await whatsappRepo.getConnection(accountId);
  const provider = getWhatsappProvider(connection?.provider ?? "fake", whatsappRepo);

  const result = await sendBulkMessages(
    whatsappRepo,
    provider,
    accountId,
    targets.map((c) => ({ id: c.id, name: c.name, phone: c.phone })),
    input.message,
  );

  revalidatePath("/pacientes");
  return result;
}
