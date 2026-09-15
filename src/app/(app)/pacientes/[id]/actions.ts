"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getAccountProfessionalIdentity,
  getCurrentAccountId,
} from "@/lib/supabase/account";
import { createSupabaseCrmRepository } from "@/modules/crm/repository.supabase";
import { createSupabaseSchedulingRepository } from "@/modules/scheduling/repository.supabase";
import { createSupabaseTreatmentsRepository } from "@/modules/treatments/repository.supabase";
import * as treatments from "@/modules/treatments/service";
import { assembleReport } from "@/modules/treatments/service";
import type { TreatmentSession } from "@/modules/treatments/types";
import { createSupabaseConsentsRepository } from "@/modules/consents/repository.supabase";
import * as consents from "@/modules/consents/service";
import { CONSENT_KINDS, type ConsentKind } from "@/modules/consents/schemas";
import { renderTemplate, formatBrDate, ageFromIsoDate } from "@/modules/consents/templates";
import { docFieldsToContactUpdate } from "@/modules/consents/patient-doc-sync";
import { signConsentToken } from "@/modules/consents/token";

const SIGNED_URL_TTL = 3600;
const CONSENT_BUCKET = "signed-consents";
const CONSENT_LINK_TTL_SECONDS = 48 * 60 * 60;
const MAX_CONSENT_PDF_BYTES = 2 * 1024 * 1024;

async function ctx() {
  const supabase = await createServerSupabaseClient();
  const accountId = await getCurrentAccountId(supabase);
  return {
    supabase,
    accountId,
    treatmentsRepo: createSupabaseTreatmentsRepository(supabase),
    schedulingRepo: createSupabaseSchedulingRepository(supabase),
    crmRepo: createSupabaseCrmRepository(supabase),
  };
}

async function ownedTreatment(
  c: Awaited<ReturnType<typeof ctx>>,
  treatmentId: string,
) {
  const treatment = await c.treatmentsRepo.getTreatment(c.accountId, treatmentId);
  if (!treatment) throw new Error("Tratamento não encontrado");
  return treatment;
}

export async function getPatientAction(contactId: string) {
  const { crmRepo, accountId } = await ctx();
  const contact = await crmRepo.getContact(accountId, contactId);
  if (!contact) throw new Error("Paciente não encontrado");
  return contact;
}

export async function listTreatmentsAction(contactId: string) {
  const { treatmentsRepo, accountId } = await ctx();
  return treatments.listTreatmentsForContact(treatmentsRepo, accountId, contactId);
}

export async function createTreatmentAction(input: unknown) {
  const { treatmentsRepo, accountId } = await ctx();
  const created = await treatments.createTreatment(treatmentsRepo, accountId, input);
  revalidatePath(`/pacientes/${created.contactId}`);
  return created;
}

export async function getTreatmentAction(treatmentId: string) {
  const { treatmentsRepo, accountId } = await ctx();
  return treatmentsRepo.getTreatment(accountId, treatmentId);
}

export async function updateTreatmentAction(treatmentId: string, input: unknown) {
  const { treatmentsRepo, accountId } = await ctx();
  const updated = await treatments.updateTreatment(treatmentsRepo, accountId, treatmentId, input);
  revalidatePath(`/pacientes/${updated.contactId}/tratamentos/${treatmentId}`);
  return updated;
}

export async function concludeTreatmentAction(treatmentId: string, input: unknown) {
  const { treatmentsRepo, accountId } = await ctx();
  const done = await treatments.concludeTreatment(treatmentsRepo, accountId, treatmentId, input);
  revalidatePath(`/pacientes/${done.contactId}/tratamentos/${treatmentId}`);
  return done;
}

export async function deleteTreatmentAction(treatmentId: string) {
  const c = await ctx();
  const treatment = await ownedTreatment(c, treatmentId);
  await treatments.deleteTreatment(c.treatmentsRepo, c.accountId, treatmentId);
  revalidatePath(`/pacientes/${treatment.contactId}`);
}

export async function listTreatmentSessionsAction(
  treatmentId: string,
): Promise<{ count: number; sessions: TreatmentSession[] }> {
  const { schedulingRepo, accountId } = await ctx();
  const [count, appointments] = await Promise.all([
    schedulingRepo.countConcludedAppointmentsByTreatment(accountId, treatmentId),
    schedulingRepo.listConcludedAppointmentsByTreatment(accountId, treatmentId),
  ]);
  return {
    count,
    sessions: appointments.map((a) => ({
      appointmentId: a.id,
      date: a.startsAt,
      notes: a.notes,
    })),
  };
}

export async function getTreatmentReportDataAction(treatmentId: string) {
  const c = await ctx();
  const treatment = await ownedTreatment(c, treatmentId);
  const [contact, identity, sessionsData] = await Promise.all([
    c.crmRepo.getContact(c.accountId, treatment.contactId),
    getAccountProfessionalIdentity(c.supabase, c.accountId),
    listTreatmentSessionsAction(treatmentId),
  ]);
  if (!contact) throw new Error("Paciente não encontrado");

  return assembleReport({
    treatment,
    contact: { name: contact.name, birthDate: contact.birthDate, cpf: contact.cpf },
    professional: {
      clinicName: identity.name,
      name: identity.professionalName,
      councilId: identity.councilId,
    },
    sessionCount: sessionsData.count,
    sessions: sessionsData.sessions,
    now: new Date().toISOString(),
  });
}

function assertConsentKind(kind: string): asserts kind is ConsentKind {
  if (!CONSENT_KINDS.includes(kind as ConsentKind)) throw new Error("Documento inválido.");
}

export async function listConsentsAction(contactId: string) {
  const c = await ctx();
  const repo = createSupabaseConsentsRepository(c.supabase);
  const rows = await consents.listConsentsForContact(repo, c.accountId, contactId);
  if (rows.length === 0) return [];
  const { data, error } = await c.supabase.storage
    .from(CONSENT_BUCKET)
    .createSignedUrls(rows.map((r) => r.storagePath), SIGNED_URL_TTL);
  if (error) throw new Error("Não foi possível carregar os documentos.");
  return rows.map((r, i) => ({
    id: r.id,
    kind: r.kind,
    signerName: r.signerName,
    signedAt: r.signedAt,
    url: data[i]?.signedUrl ?? "",
  }));
}

export async function uploadConsentAction(contactId: string, kind: string, formData: FormData) {
  assertConsentKind(kind);
  const c = await ctx();
  const contact = await c.crmRepo.getContact(c.accountId, contactId);
  if (!contact) throw new Error("Paciente não encontrado");

  const file = formData.get("file");
  if (!(file instanceof Blob)) throw new Error("Arquivo inválido.");
  if (file.type !== "application/pdf") throw new Error("O arquivo não é um PDF.");
  if (file.size > MAX_CONSENT_PDF_BYTES) throw new Error("O documento excede o tamanho permitido.");
  const signerName = (formData.get("signerName") as string | null)?.trim();
  if (!signerName) throw new Error("Informe o nome de quem assina.");

  const docFieldsRaw = formData.get("docFields");
  if (typeof docFieldsRaw === "string" && docFieldsRaw) {
    const update = docFieldsToContactUpdate(JSON.parse(docFieldsRaw) as Record<string, string>);
    if (Object.values(update).some((v) => v !== undefined)) {
      await c.crmRepo.updateContact(c.accountId, contactId, update);
    }
  }

  const repo = createSupabaseConsentsRepository(c.supabase);
  const path = `${c.accountId}/${contactId}/${kind}-${Date.now()}.pdf`;
  const { error: uploadError } = await c.supabase.storage
    .from(CONSENT_BUCKET)
    .upload(path, file, { contentType: "application/pdf", upsert: false });
  if (uploadError) {
    console.error("[pacientes/[id]/actions] consent upload", uploadError);
    throw new Error("Não foi possível salvar o documento. Tente novamente.");
  }
  try {
    await consents.recordConsent(repo, c.accountId, {
      contactId,
      kind,
      storagePath: path,
      signerName,
      signedVia: "inline",
    });
  } catch (err) {
    await c.supabase.storage.from(CONSENT_BUCKET).remove([path]);
    throw err;
  }
  revalidatePath(`/pacientes/${contactId}/documentos`);
}

export async function deleteConsentAction(consentId: string) {
  const c = await ctx();
  const repo = createSupabaseConsentsRepository(c.supabase);
  const row = await consents.getConsent(repo, c.accountId, consentId);
  if (!row) throw new Error("Documento não encontrado");
  await c.supabase.storage.from(CONSENT_BUCKET).remove([row.storagePath]);
  await consents.deleteConsent(repo, c.accountId, consentId);
  revalidatePath(`/pacientes/${row.contactId}/documentos`);
}

export async function createConsentLinkAction(contactId: string, kind: string, tipoFerida?: string) {
  assertConsentKind(kind);
  const c = await ctx();
  const contact = await c.crmRepo.getContact(c.accountId, contactId);
  if (!contact) throw new Error("Paciente não encontrado");

  const tipoFeridaTrimmed = tipoFerida?.trim();
  if (kind === "tcle" && !tipoFeridaTrimmed) {
    throw new Error("Informe o tipo de ferida.");
  }

  const token = await signConsentToken(
    {
      accountId: c.accountId,
      contactId,
      kind,
      ...(kind === "tcle" ? { tipoFerida: tipoFeridaTrimmed } : {}),
    },
    CONSENT_LINK_TTL_SECONDS,
  );
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "";
  return { url: `${proto}://${host}/assinar/${token}` };
}

export async function getConsentPageDataAction(contactId: string) {
  const c = await ctx();
  const [contact, identity, consentRows, patientTreatments] = await Promise.all([
    c.crmRepo.getContact(c.accountId, contactId),
    getAccountProfessionalIdentity(c.supabase, c.accountId),
    listConsentsAction(contactId),
    treatments.listTreatmentsForContact(c.treatmentsRepo, c.accountId, contactId),
  ]);
  if (!contact) throw new Error("Paciente não encontrado");

  const activeTreatmentWoundTypes =
    [...patientTreatments]
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "em_andamento" ? -1 : 1;
        return b.startedOn.localeCompare(a.startedOn);
      })[0]?.woundTypes ?? null;

  const templateCtx = {
    pacienteNome: contact.name,
    pacienteCpf: contact.cpf,
    pacienteNascimento: contact.birthDate,
    pacienteTelefone: contact.phone ?? null,
    pacienteRg: contact.rg,
    pacienteEndereco: contact.address,
    pacienteCidadeUf: contact.cityState,
    pacienteIdade: ageFromIsoDate(contact.birthDate),
    clinicaNome: identity.name,
    profissionalNome: identity.professionalName,
    profissionalConselho: identity.councilId,
    data: formatBrDate(new Date()),
  };

  const docs = CONSENT_KINDS.map((kind) => {
    const t = renderTemplate(kind, templateCtx);
    return { kind, title: t.title, blocks: t.blocks };
  });

  return {
    patientName: contact.name,
    professionalMissing: !identity.professionalName,
    docs,
    consents: consentRows,
    activeTreatmentWoundTypes,
  };
}
