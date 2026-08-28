import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { TreatmentsRepository } from "./repository";
import type { Treatment, TreatmentPhoto, TreatmentStatus, WoundOutcome } from "./types";

function throwDbError(error: PostgrestError): never {
  console.error("[treatments/repository.supabase]", error);
  throw new Error("Erro ao acessar o banco de dados. Tente novamente.");
}

function toTreatment(row: Database["public"]["Tables"]["treatments"]["Row"]): Treatment {
  return {
    id: row.id,
    accountId: row.account_id,
    contactId: row.contact_id,
    woundTypes: row.wound_types,
    woundDetails: row.wound_details,
    treatmentType: row.treatment_type,
    startedOn: row.started_on,
    status: row.status as TreatmentStatus,
    dischargedOn: row.discharged_on,
    outcome: row.outcome as WoundOutcome | null,
    professionalAssessment: row.professional_assessment,
    patientPerception: row.patient_perception,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPhoto(row: Database["public"]["Tables"]["treatment_photos"]["Row"]): TreatmentPhoto {
  return {
    id: row.id,
    accountId: row.account_id,
    treatmentId: row.treatment_id,
    storagePath: row.storage_path,
    bytes: row.bytes,
    caption: row.caption,
    takenOn: row.taken_on,
    createdAt: row.created_at,
  };
}

export function createSupabaseTreatmentsRepository(
  supabase: SupabaseClient<Database>,
): TreatmentsRepository {
  return {
    async insertTreatment(accountId, input) {
      const { data, error } = await supabase
        .from("treatments")
        .insert({
          account_id: accountId,
          contact_id: input.contactId,
          wound_types: input.woundTypes,
          wound_details: input.woundDetails,
          treatment_type: input.treatmentType,
          started_on: input.startedOn,
          professional_assessment: input.professionalAssessment,
          patient_perception: input.patientPerception,
        })
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toTreatment(data);
    },

    async updateTreatment(accountId, id, input) {
      const { data, error } = await supabase
        .from("treatments")
        .update({
          ...(input.woundTypes !== undefined ? { wound_types: input.woundTypes } : {}),
          ...(input.woundDetails !== undefined ? { wound_details: input.woundDetails } : {}),
          ...(input.treatmentType !== undefined ? { treatment_type: input.treatmentType } : {}),
          ...(input.startedOn !== undefined ? { started_on: input.startedOn } : {}),
          ...(input.professionalAssessment !== undefined
            ? { professional_assessment: input.professionalAssessment }
            : {}),
          ...(input.patientPerception !== undefined
            ? { patient_perception: input.patientPerception }
            : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("account_id", accountId)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toTreatment(data);
    },

    async concludeTreatment(accountId, id, input) {
      const { data: current, error: readError } = await supabase
        .from("treatments")
        .select("status")
        .eq("account_id", accountId)
        .eq("id", id)
        .maybeSingle();
      if (readError) throwDbError(readError);
      if (!current) throw new Error("Tratamento não encontrado");
      if (current.status === "concluido") throw new Error("Tratamento já foi concluído");

      const { data, error } = await supabase
        .from("treatments")
        .update({
          status: "concluido",
          discharged_on: input.dischargedOn,
          outcome: input.outcome,
          updated_at: new Date().toISOString(),
        })
        .eq("account_id", accountId)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toTreatment(data);
    },

    async getTreatment(accountId, id) {
      const { data, error } = await supabase
        .from("treatments")
        .select("*")
        .eq("account_id", accountId)
        .eq("id", id)
        .maybeSingle();
      if (error) throwDbError(error);
      return data ? toTreatment(data) : null;
    },

    async listTreatmentsForContact(accountId, contactId) {
      const { data, error } = await supabase
        .from("treatments")
        .select("*")
        .eq("account_id", accountId)
        .eq("contact_id", contactId)
        .order("started_on", { ascending: false });
      if (error) throwDbError(error);
      return data.map(toTreatment);
    },

    async deleteTreatment(accountId, id) {
      const { error } = await supabase
        .from("treatments")
        .delete()
        .eq("account_id", accountId)
        .eq("id", id);
      if (error) throwDbError(error);
    },

    async insertPhoto(accountId, input) {
      const { data, error } = await supabase
        .from("treatment_photos")
        .insert({
          account_id: accountId,
          treatment_id: input.treatmentId,
          storage_path: input.storagePath,
          bytes: input.bytes,
          caption: input.caption,
          taken_on: input.takenOn,
        })
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toPhoto(data);
    },

    async listPhotos(accountId, treatmentId) {
      const { data, error } = await supabase
        .from("treatment_photos")
        .select("*")
        .eq("account_id", accountId)
        .eq("treatment_id", treatmentId)
        .order("created_at", { ascending: true });
      if (error) throwDbError(error);
      return data.map(toPhoto);
    },

    async getPhoto(accountId, photoId) {
      const { data, error } = await supabase
        .from("treatment_photos")
        .select("*")
        .eq("account_id", accountId)
        .eq("id", photoId)
        .maybeSingle();
      if (error) throwDbError(error);
      return data ? toPhoto(data) : null;
    },

    async updatePhotoMeta(accountId, photoId, input) {
      const { data, error } = await supabase
        .from("treatment_photos")
        .update({ caption: input.caption, taken_on: input.takenOn })
        .eq("account_id", accountId)
        .eq("id", photoId)
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toPhoto(data);
    },

    async deletePhoto(accountId, photoId) {
      const { error } = await supabase
        .from("treatment_photos")
        .delete()
        .eq("account_id", accountId)
        .eq("id", photoId);
      if (error) throwDbError(error);
    },

    async sumPhotoBytes(accountId) {
      const { data, error } = await supabase
        .from("treatment_photos")
        .select("bytes")
        .eq("account_id", accountId);
      if (error) throwDbError(error);
      return data.reduce((sum, row) => sum + row.bytes, 0);
    },
  };
}
