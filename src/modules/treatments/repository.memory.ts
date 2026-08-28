import type { TreatmentsRepository } from "./repository";
import type { Treatment, TreatmentPhoto } from "./types";

export function createInMemoryTreatmentsRepository(): TreatmentsRepository {
  const treatments = new Map<string, Treatment>();
  const photos = new Map<string, TreatmentPhoto>();

  function owned<T extends { accountId: string }>(row: T | undefined, accountId: string): T | null {
    return row && row.accountId === accountId ? row : null;
  }

  return {
    async insertTreatment(accountId, input) {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const treatment: Treatment = {
        id,
        accountId,
        contactId: input.contactId,
        woundTypes: input.woundTypes,
        woundDetails: input.woundDetails,
        treatmentType: input.treatmentType,
        startedOn: input.startedOn,
        status: "em_andamento",
        dischargedOn: null,
        outcome: null,
        professionalAssessment: input.professionalAssessment,
        patientPerception: input.patientPerception,
        createdAt: now,
        updatedAt: now,
      };
      treatments.set(id, treatment);
      return treatment;
    },

    async updateTreatment(accountId, id, input) {
      const current = owned(treatments.get(id), accountId);
      if (!current) throw new Error("Treatment not found");
      const updated: Treatment = {
        ...current,
        ...(input.woundTypes !== undefined ? { woundTypes: input.woundTypes } : {}),
        ...(input.woundDetails !== undefined ? { woundDetails: input.woundDetails } : {}),
        ...(input.treatmentType !== undefined ? { treatmentType: input.treatmentType } : {}),
        ...(input.startedOn !== undefined ? { startedOn: input.startedOn } : {}),
        ...(input.professionalAssessment !== undefined
          ? { professionalAssessment: input.professionalAssessment }
          : {}),
        ...(input.patientPerception !== undefined
          ? { patientPerception: input.patientPerception }
          : {}),
        updatedAt: new Date().toISOString(),
      };
      treatments.set(id, updated);
      return updated;
    },

    async concludeTreatment(accountId, id, input) {
      const current = owned(treatments.get(id), accountId);
      if (!current) throw new Error("Treatment not found");
      if (current.status === "concluido") throw new Error("Tratamento já foi concluído");
      const updated: Treatment = {
        ...current,
        status: "concluido",
        dischargedOn: input.dischargedOn,
        outcome: input.outcome,
        updatedAt: new Date().toISOString(),
      };
      treatments.set(id, updated);
      return updated;
    },

    async getTreatment(accountId, id) {
      return owned(treatments.get(id), accountId);
    },

    async listTreatmentsForContact(accountId, contactId) {
      return [...treatments.values()]
        .filter((t) => t.accountId === accountId && t.contactId === contactId)
        .sort((a, b) => b.startedOn.localeCompare(a.startedOn));
    },

    async deleteTreatment(accountId, id) {
      const current = owned(treatments.get(id), accountId);
      if (!current) throw new Error("Treatment not found");
      treatments.delete(id);
      for (const [photoId, p] of photos) {
        if (p.treatmentId === id) photos.delete(photoId);
      }
    },

    async insertPhoto(accountId, input) {
      const id = crypto.randomUUID();
      const photo: TreatmentPhoto = {
        id,
        accountId,
        treatmentId: input.treatmentId,
        storagePath: input.storagePath,
        bytes: input.bytes,
        caption: input.caption,
        takenOn: input.takenOn,
        createdAt: new Date().toISOString(),
      };
      photos.set(id, photo);
      return photo;
    },

    async listPhotos(accountId, treatmentId) {
      return [...photos.values()]
        .filter((p) => p.accountId === accountId && p.treatmentId === treatmentId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    async getPhoto(accountId, photoId) {
      return owned(photos.get(photoId), accountId);
    },

    async updatePhotoMeta(accountId, photoId, input) {
      const current = owned(photos.get(photoId), accountId);
      if (!current) throw new Error("Photo not found");
      const updated: TreatmentPhoto = {
        ...current,
        caption: input.caption,
        takenOn: input.takenOn,
      };
      photos.set(photoId, updated);
      return updated;
    },

    async deletePhoto(accountId, photoId) {
      const current = owned(photos.get(photoId), accountId);
      if (!current) throw new Error("Photo not found");
      photos.delete(photoId);
    },

    async sumPhotoBytes(accountId) {
      return [...photos.values()]
        .filter((p) => p.accountId === accountId)
        .reduce((sum, p) => sum + p.bytes, 0);
    },
  };
}
