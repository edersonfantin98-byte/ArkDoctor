import type { Treatment, TreatmentPhoto, WoundOutcome } from "./types";

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

  insertPhoto(
    accountId: string,
    input: {
      treatmentId: string;
      storagePath: string;
      bytes: number;
      caption: string | null;
      takenOn: string | null;
    },
  ): Promise<TreatmentPhoto>;
  listPhotos(accountId: string, treatmentId: string): Promise<TreatmentPhoto[]>;
  getPhoto(accountId: string, photoId: string): Promise<TreatmentPhoto | null>;
  updatePhotoMeta(
    accountId: string,
    photoId: string,
    input: { caption: string | null; takenOn: string | null },
  ): Promise<TreatmentPhoto>;
  deletePhoto(accountId: string, photoId: string): Promise<void>;
  sumPhotoBytes(accountId: string): Promise<number>;
}
