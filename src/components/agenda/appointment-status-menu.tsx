"use client";

import { updateAppointmentStatusAction } from "@/app/(app)/agenda/actions";
import type { AppointmentStatus } from "@/modules/scheduling/types";

const statusLabels: Record<AppointmentStatus, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  concluido: "Concluído",
  nao_compareceu: "Não compareceu",
  cancelado: "Cancelado",
};

export function AppointmentStatusMenu({
  appointmentId,
  currentStatus,
  onChanged,
}: {
  appointmentId: string;
  currentStatus: AppointmentStatus;
  onChanged: () => void;
}) {
  return (
    <select
      className="w-full rounded border p-1 text-sm"
      value={currentStatus}
      onChange={async (e) => {
        await updateAppointmentStatusAction(appointmentId, e.target.value as AppointmentStatus);
        onChanged();
      }}
    >
      {Object.entries(statusLabels).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}
