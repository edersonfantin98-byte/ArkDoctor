"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, MessageCircle, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { RowActionsMenu } from "@/components/ui/row-actions";
import { SelectionBar } from "@/components/ui/selection-bar";
import { Table, THead, TH, TBody, TR, TD, RowActionsCell } from "@/components/ui/table";
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

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function PatientsClient({ initialPatients }: { initialPatients: Contact[] }) {
  const router = useRouter();
  const [patients, setPatients] = useState(initialPatients);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Contact | null>(null);
  const [bulkMessageOpen, setBulkMessageOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  function handleSaved(saved: Contact) {
    setPatients((prev) => {
      const exists = prev.some((p) => p.id === saved.id);
      const next = exists ? prev.map((p) => (p.id === saved.id ? saved : p)) : [...prev, saved];
      return next.sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  async function deletePatientNow(id: string) {
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
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou telefone"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {patients.length} {patients.length === 1 ? "paciente" : "pacientes"}
        </span>
        <Button type="button" className="ml-auto" onClick={openNewPatientForm}>
          <Plus /> Novo paciente
        </Button>
      </div>

      <SelectionBar
        count={selectedIds.size}
        actionLabel="Enviar mensagem"
        onAction={() => setBulkMessageOpen(true)}
        onClear={() => setSelectedIds(new Set())}
      />

      <Table>
        <THead>
          <TR>
            <TH className="w-10">
              <input
                type="checkbox"
                className="accent-primary size-4"
                checked={patients.length > 0 && selectedIds.size === patients.length}
                onChange={toggleSelectAll}
                aria-label="Selecionar todos"
              />
            </TH>
            <TH>Paciente</TH>
            <TH>E-mail</TH>
            <TH className="w-[70px]">Idade</TH>
            <TH className="w-[190px]">Último tratamento</TH>
            <TH className="w-13" />
          </TR>
        </THead>
        <TBody>
          {patients.length === 0 && (
            <TR>
              <TD colSpan={6} className="p-0">
                <EmptyState
                  icon={Users}
                  title="Nenhum paciente encontrado"
                  description={query ? "Tente outro termo de busca." : undefined}
                />
              </TD>
            </TR>
          )}
          {patients.map((patient) => (
            <TR key={patient.id} selected={selectedIds.has(patient.id)}>
              <TD>
                <input
                  type="checkbox"
                  className="accent-primary size-4"
                  checked={selectedIds.has(patient.id)}
                  onChange={() => toggleSelected(patient.id)}
                  aria-label={`Selecionar ${patient.name}`}
                />
              </TD>
              <TD>
                <div className="flex items-center gap-3">
                  <Avatar size="sm">
                    <AvatarFallback>{initials(patient.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <Link href={`/pacientes/${patient.id}`} className="block font-medium hover:underline">
                      {patient.name}
                    </Link>
                    <span className="block text-xs text-muted-foreground tabular-nums">{patient.phone}</span>
                  </div>
                </div>
              </TD>
              <TD>{patient.email ?? "—"}</TD>
              <TD className="tabular-nums">{calculateAge(patient.birthDate)}</TD>
              {/* TODO: status/data do último tratamento — Contact não traz esse dado hoje */}
              <TD>—</TD>
              <RowActionsCell>
                <RowActionsMenu
                  actions={[
                    {
                      label: "Ver paciente",
                      icon: ExternalLink,
                      onSelect: () => router.push(`/pacientes/${patient.id}`),
                    },
                    {
                      label: "Editar dados",
                      icon: Pencil,
                      onSelect: () => {
                        setEditingPatient(patient);
                        setFormOpen(true);
                      },
                    },
                    {
                      label: "Enviar mensagem",
                      icon: MessageCircle,
                      onSelect: () => {
                        setSelectedIds(new Set([patient.id]));
                        setBulkMessageOpen(true);
                      },
                    },
                  ]}
                  destructive={{
                    label: "Excluir",
                    icon: Trash2,
                    confirmText: `Excluir ${patient.name} e todo o histórico? Esta ação não pode ser desfeita.`,
                    confirmLabel: "Excluir",
                    onConfirm: () => deletePatientNow(patient.id),
                  }}
                />
              </RowActionsCell>
            </TR>
          ))}
        </TBody>
      </Table>

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
