import type { Treatment, WoundOutcome } from "./types";

export interface TreatmentsRepository {
  insertTreatment(
    accountId: string,
    input: {
      contactId: string;
      woundTypes: string;
      woundDetails: string | null;
      treatmentType: string | null;
      startedOn: string;
      professionalAssessment: string | null;
      patientPerception: string | null;
    },
  ): Promise<Treatment>;
  updateTreatment(
    accountId: string,
    id: string,
    input: Partial<{
      woundTypes: string;
      woundDetails: string | null;
      treatmentType: string | null;
      startedOn: string;
      professionalAssessment: string | null;
      patientPerception: string | null;
    }>,
  ): Promise<Treatment>;
  concludeTreatment(
    accountId: string,
    id: string,
    input: { dischargedOn: string; outcome: WoundOutcome },
  ): Promise<Treatment>;
  getTreatment(accountId: string, id: string): Promise<Treatment | null>;
  listTreatmentsForContact(accountId: string, contactId: string): Promise<Treatment[]>;
  deleteTreatment(accountId: string, id: string): Promise<void>;
}
