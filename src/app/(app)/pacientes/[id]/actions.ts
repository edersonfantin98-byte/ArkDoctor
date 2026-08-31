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
import { MAX_OUTPUT_BYTES } from "@/components/treatments/prepare-photo";
import type { TreatmentSession } from "@/modules/treatments/types";
import { createSupabaseConsentsRepository } from "@/modules/consents/repository.supabase";
import * as consents from "@/modules/consents/service";
import { CONSENT_KINDS, type ConsentKind } from "@/modules/consents/schemas";
import { renderTemplate, formatBrDate } from "@/modules/consents/templates";
import { signConsentToken } from "@/modules/consents/token";

const BUCKET = "treatment-photos";
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
  const photos = await c.treatmentsRepo.listPhotos(c.accountId, treatmentId);
  if (photos.length > 0) {
    const { error } = await c.supabase.storage
      .from(BUCKET)
      .remove(photos.map((p) => p.storagePath));
    if (error) {
      console.error("[pacientes/[id]/actions] storage remove", error);
      throw new Error("Não foi possível remover as fotos do armazenamento. Tente novamente.");
    }
  }
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

export async function listTreatmentPhotosAction(treatmentId: string) {
  const c = await ctx();
  const photos = await c.treatmentsRepo.listPhotos(c.accountId, treatmentId);
  if (photos.length === 0) return [];
  const { data, error } = await c.supabase.storage
    .from(BUCKET)
    .createSignedUrls(photos.map((p) => p.storagePath), SIGNED_URL_TTL);
  if (error) throw new Error("Não foi possível carregar as fotos.");
  return photos.map((p, i) => ({
    id: p.id,
    url: data[i]?.signedUrl ?? "",
    caption: p.caption,
    takenOn: p.takenOn,
  }));
}

export async function uploadTreatmentPhotoAction(treatmentId: string, formData: FormData) {
  const c = await ctx();
  await ownedTreatment(c, treatmentId);

  const file = formData.get("file");
  if (!(file instanceof Blob)) throw new Error("Arquivo inválido.");
  if (!file.type.startsWith("image/")) throw new Error("O arquivo não é uma imagem.");
  if (file.size > MAX_OUTPUT_BYTES) throw new Error("A foto excede o tamanho permitido.");

  const caption = (formData.get("caption") as string | null)?.trim() || null;
  const takenOnRaw = (formData.get("takenOn") as string | null)?.trim() || null;
  const takenOn = takenOnRaw && /^\d{4}-\d{2}-\d{2}$/.test(takenOnRaw) ? takenOnRaw : null;

  const path = `${c.accountId}/${treatmentId}/${crypto.randomUUID()}.jpg`;
  const { error: uploadError } = await c.supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: "image/jpeg", upsert: false });
  if (uploadError) {
    console.error("[pacientes/[id]/actions] upload", uploadError);
    throw new Error("Não foi possível enviar a foto. Tente novamente.");
  }

  await c.treatmentsRepo.insertPhoto(c.accountId, {
    treatmentId,
    storagePath: path,
    bytes: file.size,
    caption,
    takenOn,
  });
  const treatment = await ownedTreatment(c, treatmentId);
  revalidatePath(`/pacientes/${treatment.contactId}/tratamentos/${treatmentId}`);
}

export async function updatePhotoMetaAction(photoId: string, input: unknown) {
  const { treatmentsRepo, accountId } = await ctx();
  await treatments.updatePhotoMeta(treatmentsRepo, accountId, photoId, input);
}

export async function deleteTreatmentPhotoAction(photoId: string) {
  const c = await ctx();
  const photo = await c.treatmentsRepo.getPhoto(c.accountId, photoId);
  if (!photo) throw new Error("Foto não encontrada");
  await c.supabase.storage.from(BUCKET).remove([photo.storagePath]);
  await c.treatmentsRepo.deletePhoto(c.accountId, photoId);
}

export async function getTreatmentReportDataAction(treatmentId: string) {
  const c = await ctx();
  const treatment = await ownedTreatment(c, treatmentId);
  const [contact, identity, sessionsData, photos] = await Promise.all([
    c.crmRepo.getContact(c.accountId, treatment.contactId),
    getAccountProfessionalIdentity(c.supabase, c.accountId),
    listTreatmentSessionsAction(treatmentId),
    listTreatmentPhotosAction(treatmentId),
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
    photos: photos.map((p) => ({ url: p.url, caption: p.caption, takenOn: p.takenOn })),
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

export async function createConsentLinkAction(contactId: string, kind: string) {
  assertConsentKind(kind);
  const c = await ctx();
  const contact = await c.crmRepo.getContact(c.accountId, contactId);
  if (!contact) throw new Error("Paciente não encontrado");
  const token = await signConsentToken(
    { accountId: c.accountId, contactId, kind },
    CONSENT_LINK_TTL_SECONDS,
  );
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "";
  return { url: `${proto}://${host}/assinar/${token}` };
}

export async function getConsentPageDataAction(contactId: string) {
  const c = await ctx();
  const [contact, identity, consentRows] = await Promise.all([
    c.crmRepo.getContact(c.accountId, contactId),
    getAccountProfessionalIdentity(c.supabase, c.accountId),
    listConsentsAction(contactId),
  ]);
  if (!contact) throw new Error("Paciente não encontrado");

  const templateCtx = {
    pacienteNome: contact.name,
    pacienteCpf: contact.cpf,
    pacienteNascimento: contact.birthDate,
    clinicaNome: identity.name,
    profissionalNome: identity.professionalName,
    profissionalConselho: identity.councilId,
    data: formatBrDate(new Date()),
  };

  const docs = CONSENT_KINDS.map((kind) => {
    const t = renderTemplate(kind, templateCtx);
    return { kind, title: t.title, paragraphs: t.paragraphs };
  });

  const headerLines = [
    identity.name,
    identity.professionalName
      ? `${identity.professionalName}${identity.councilId ? ` - ${identity.councilId}` : ""}`
      : null,
    `Paciente: ${contact.name}`,
  ].filter((l): l is string => Boolean(l));

  return {
    patientName: contact.name,
    professionalMissing: !identity.professionalName,
    headerLines,
    docs,
    consents: consentRows,
  };
}
