"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listWorkingHoursAction, saveWorkingHoursAction } from "@/app/(app)/agenda/actions";

const weekdayLabels = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

interface DayState {
  open: boolean;
  startTime: string;
  endTime: string;
}

const defaultDays: DayState[] = weekdayLabels.map(() => ({
  open: false,
  startTime: "08:00",
  endTime: "18:00",
}));

export function WorkingHoursDialog({ onChanged }: { onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<DayState[]>(defaultDays);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    listWorkingHoursAction().then((saved) => {
      setDays(
        defaultDays.map((base, index) => {
          const found = saved.find((w) => w.dayOfWeek === index);
          return found ? { open: true, startTime: found.startTime, endTime: found.endTime } : base;
        }),
      );
    });
  }, [open]);

  function update(index: number, patch: Partial<DayState>) {
    setDays((current) => current.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  const invalid = days.some((d) => d.open && (!d.startTime || !d.endTime || d.endTime <= d.startTime));

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      await saveWorkingHoursAction(
        days
          .map((d, dayOfWeek) => ({ ...d, dayOfWeek }))
          .filter((d) => d.open)
          .map(({ dayOfWeek, startTime, endTime }) => ({ dayOfWeek, startTime, endTime })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar os horários.");
      setSaving(false);
      return;
    }
    setSaving(false);
    setOpen(false);
    onChanged();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline">Horários de atendimento</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Horários de atendimento</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Marque os dias em que você atende. Dias desmarcados ficam indisponíveis para agendamento.
          Se nenhum dia estiver marcado, não há restrição de horário.
        </p>
        <div className="space-y-2">
          {days.map((day, index) => (
            <div key={weekdayLabels[index]} className="flex flex-wrap items-center gap-2">
              <label className="flex w-28 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={day.open}
                  onChange={(e) => update(index, { open: e.target.checked })}
                />
                {weekdayLabels[index]}
              </label>
              <Input
                type="time"
                className="w-28"
                aria-label={`${weekdayLabels[index]} início`}
                value={day.startTime}
                disabled={!day.open}
                onChange={(e) => update(index, { startTime: e.target.value })}
              />
              <span className="text-sm">às</span>
              <Input
                type="time"
                className="w-28"
                aria-label={`${weekdayLabels[index]} fim`}
                value={day.endTime}
                disabled={!day.open}
                onChange={(e) => update(index, { endTime: e.target.value })}
              />
            </div>
          ))}
        </div>
        {invalid && <p className="text-sm text-destructive">O fim deve ser depois do início.</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={handleSave} disabled={invalid || saving}>
          Salvar
        </Button>
      </DialogContent>
    </Dialog>
  );
}
