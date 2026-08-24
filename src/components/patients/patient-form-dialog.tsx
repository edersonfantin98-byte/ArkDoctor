"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createPatientAction, updatePatientAction } from "@/app/(app)/pacientes/actions";
import type { Contact } from "@/modules/crm/types";

const SEX_OPTIONS = [
  { value: "M", label: "Masculino" },
  { value: "F", label: "Feminino" },
];

export function PatientFormDialog({
  open,
  onOpenChange,
  editingPatient,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingPatient: Contact | null;
  onSaved: (patient: Contact) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [cpf, setCpf] = useState("");
  const [sex, setSex] = useState<string>("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [guardianRelationship, setGuardianRelationship] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resyncs the form when a different patient is opened in this persistent dialog
    setName(editingPatient?.name ?? "");
    setPhone(editingPatient?.phone ?? "");
    setEmail(editingPatient?.email ?? "");
    setBirthDate(editingPatient?.birthDate ?? "");
    setCpf(editingPatient?.cpf ?? "");
    setSex(editingPatient?.sex ?? "");
    setGuardianName(editingPatient?.guardianName ?? "");
    setGuardianPhone(editingPatient?.guardianPhone ?? "");
    setGuardianRelationship(editingPatient?.guardianRelationship ?? "");
    setNotes(editingPatient?.notes ?? "");
    setError(null);
  }, [open, editingPatient]);

  async function handleSubmit() {
    setError(null);
    const input = {
      name,
      phone,
      email: email || undefined,
      birthDate: birthDate || undefined,
      cpf: cpf || undefined,
      sex: sex === "M" || sex === "F" ? sex : undefined,
      guardianName: guardianName || undefined,
      guardianPhone: guardianPhone || undefined,
      guardianRelationship: guardianRelationship || undefined,
      notes: notes || undefined,
    };

    try {
      const saved = editingPatient
        ? await updatePatientAction(editingPatient.id, input)
        : await createPatientAction(input);
      onOpenChange(false);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar paciente");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingPatient ? "Editar paciente" : "Novo paciente"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="space-y-1">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="phone">Telefone</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="birthDate">Data de nascimento</Label>
            <Input
              id="birthDate"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="sex">Sexo</Label>
            <Select
              value={sex}
              onValueChange={(value) => setSex(value ?? "")}
              items={SEX_OPTIONS}
            >
              <SelectTrigger id="sex">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {SEX_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="cpf">CPF</Label>
            <Input id="cpf" value={cpf} onChange={(e) => setCpf(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="guardianName">Responsável — nome</Label>
            <Input
              id="guardianName"
              value={guardianName}
              onChange={(e) => setGuardianName(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="guardianPhone">Responsável — telefone</Label>
            <Input
              id="guardianPhone"
              value={guardianPhone}
              onChange={(e) => setGuardianPhone(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="guardianRelationship">Responsável — parentesco</Label>
            <Input
              id="guardianRelationship"
              value={guardianRelationship}
              onChange={(e) => setGuardianRelationship(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="notes">Observações</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <Button
            type="button"
            className="w-full"
            onClick={handleSubmit}
            disabled={!name.trim() || !phone.trim()}
          >
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
