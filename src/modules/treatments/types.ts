export type TreatmentStatus = "em_andamento" | "concluido";
export type WoundOutcome = "cicatrizacao" | "alta" | "abandono" | "encaminhamento";

export interface Treatment {
  id: string;
  accountId: string;
  contactId: string;
  woundTypes: string;
  woundDetails: string | null;
  treatmentType: string | null;
  startedOn: string; // YYYY-MM-DD
  status: TreatmentStatus;
  dischargedOn: string | null; // YYYY-MM-DD
  outcome: WoundOutcome | null;
  professionalAssessment: string | null;
  patientPerception: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TreatmentSession {
  appointmentId: string;
  date: string; // appointment starts_at (ISO)
  notes: string | null;
}

export interface TreatmentReport {
  treatment: Treatment;
  contact: { name: string; birthDate: string | null; cpf: string | null };
  professional: { clinicName: string; name: string | null; councilId: string | null };
  sessionCount: number;
  sessions: TreatmentSession[];
  durationLabel: string; // derived: (dischargedOn ?? today) − startedOn
  generatedAt: string; // ISO
}

export interface AssembleReportInput {
  treatment: Treatment;
  contact: { name: string; birthDate: string | null; cpf: string | null };
  professional: { clinicName: string; name: string | null; councilId: string | null };
  sessionCount: number;
  sessions: TreatmentSession[];
  now: string; // ISO — injected for testability
}
