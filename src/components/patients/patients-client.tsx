"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listPatientsAction, searchPatientsAction, deletePatientAction } from "@/app/(app)/pacientes/actions";
import { PatientFormDialog } from "./patient-form-dialog";
import { BulkMessageDialog } from "./bulk-message-dialog";
import type { Contact } from "@/modules/crm/types";

function calculateAge(birthDate: string | null): string {
  if (!birthDate) return "—";
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return "—";
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const hasHadBirthdayThisYear =
    now.getMonth() > birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return String(age);
}

export function PatientsClient({ initialPatients }: { initialPatients: Contact[] }) {
  const [patients, setPatients] = useState(initialPatients);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Contact | null>(null);
  const [bulkMessageOpen, setBulkMessageOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  async function handleSearch(value: string) {
    setQuery(value);
    setError(null);
    try {
      const results = value.trim() ? await searchPatientsAction(value) : await listPatientsAction();
      setPatients(results);
      setSelectedIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao buscar pacientes");
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) =>
      prev.size === patients.length ? new Set() : new Set(patients.map((p) => p.id)),
    );
  }

  function openNewPatientForm() {
    setEditingPatient(null);
    setFormOpen(true);
  }

  function openEditPatientForm(patient: Contact) {
    setEditingPatient(patient);
    setFormOpen(true);
  }

  function handleSaved(saved: Contact) {
    setPatients((prev) => {
      const exists = prev.some((p) => p.id === saved.id);
      const next = exists ? prev.map((p) => (p.id === saved.id ? saved : p)) : [...prev, saved];
      return next.sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  async function handleDelete(id: string) {
    if (confirmingDeleteId !== id) {
      setConfirmingDeleteId(id);
      return;
    }
    setConfirmingDeleteId(null);
    setError(null);
    try {
      await deletePatientAction(id);
      setPatients((prev) => prev.filter((p) => p.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover paciente");
    }
  }

  return (
    <div className="space-y-4 px-6 pb-6">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-2">
        <Input
          placeholder="Buscar por nome ou telefone"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          className="max-w-sm"
        />
        <Button type="button" onClick={openNewPatientForm}>
          Novo paciente
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={selectedIds.size === 0}
          onClick={() => setBulkMessageOpen(true)}
        >
          Enviar mensagem ({selectedIds.size})
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="w-10 p-2">
                <input
                  type="checkbox"
                  checked={patients.length > 0 && selectedIds.size === patients.length}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="p-2">Nome</th>
              <th className="p-2">Telefone</th>
              <th className="p-2">E-mail</th>
              <th className="p-2">Idade</th>
              <th className="w-24 p-2"></th>
            </tr>
          </thead>
          <tbody>
            {patients.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-muted-foreground">
                  Nenhum paciente encontrado.
                </td>
              </tr>
            )}
            {patients.map((patient) => (
              <tr key={patient.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="p-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(patient.id)}
                    onChange={() => toggleSelected(patient.id)}
                  />
                </td>
                <td className="cursor-pointer p-2" onClick={() => openEditPatientForm(patient)}>
                  {patient.name}
                </td>
                <td className="p-2">{patient.phone}</td>
                <td className="p-2">{patient.email ?? "—"}</td>
                <td className="p-2">{calculateAge(patient.birthDate)}</td>
                <td className="p-2 text-right">
                  {confirmingDeleteId === patient.id ? (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setConfirmingDeleteId(null)}>
                        Cancelar
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(patient.id)}>
                        Confirmar exclusão
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(patient.id)}>
                      Remover
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PatientFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editingPatient={editingPatient}
        onSaved={handleSaved}
      />

      <BulkMessageDialog
        open={bulkMessageOpen}
        onOpenChange={setBulkMessageOpen}
        selectedCount={selectedIds.size}
        contactIds={[...selectedIds]}
        onSent={() => setSelectedIds(new Set())}
      />
    </div>
  );
}
