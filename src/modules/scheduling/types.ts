import type { Contact } from "@/modules/crm/types";

export type AppointmentStatus =
  | "agendado"
  | "confirmado"
  | "concluido"
  | "nao_compareceu"
  | "cancelado";

export interface Procedure {
  id: string;
  accountId: string;
  name: string;
  defaultPrice: number;
  defaultDurationMinutes: number;
  createdAt: string;
}

export interface Appointment {
  id: string;
  accountId: string;
  contactId: string;
  procedureId: string;
  dealId: string | null;
  treatmentId: string | null;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentWithDetails extends Appointment {
  contact: Contact;
  procedure: Procedure;
}

export interface AvailabilityBlock {
  id: string;
  accountId: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

export interface AvailabilityRule {
  id: string;
  accountId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  reason: string | null;
}
