import type { TreatmentsRepository } from "./repository";
import type { Treatment } from "./types";

export function createInMemoryTreatmentsRepository(): TreatmentsRepository {
  const treatments = new Map<string, Treatment>();

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
    },
  };
}
