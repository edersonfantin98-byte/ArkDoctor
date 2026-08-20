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
import { Label } from "@/components/ui/label";
import {
  createAvailabilityBlockAction,
  createAvailabilityRuleAction,
  deleteAvailabilityBlockAction,
  deleteAvailabilityRuleAction,
  listAvailabilityBlocksAction,
  listAvailabilityRulesAction,
} from "@/app/(app)/agenda/actions";
import type { AvailabilityBlock, AvailabilityRule } from "@/modules/scheduling/types";

const weekdayLabels = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export function AvailabilityDialog({ onChanged }: { onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  const [rules, setRules] = useState<AvailabilityRule[]>([]);

  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [blockReason, setBlockReason] = useState("");

  const [ruleDay, setRuleDay] = useState("1");
  const [ruleStart, setRuleStart] = useState("12:00");
  const [ruleEnd, setRuleEnd] = useState("13:00");
  const [ruleReason, setRuleReason] = useState("");

  async function refresh() {
    setBlocks(await listAvailabilityBlocksAction());
    setRules(await listAvailabilityRulesAction());
  }

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  async function handleCreateBlock() {
    await createAvailabilityBlockAction({
      startsAt: new Date(blockStart).toISOString(),
      endsAt: new Date(blockEnd).toISOString(),
      reason: blockReason || undefined,
    });
    setBlockStart("");
    setBlockEnd("");
    setBlockReason("");
    await refresh();
    onChanged();
  }

  async function handleCreateRule() {
    await createAvailabilityRuleAction({
      dayOfWeek: Number(ruleDay),
      startTime: ruleStart,
      endTime: ruleEnd,
      reason: ruleReason || undefined,
    });
    setRuleReason("");
    await refresh();
    onChanged();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline">Bloqueios de agenda</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bloqueios de agenda</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <h3 className="font-semibold">Recorrentes (semanais)</h3>
          {rules.map((rule) => (
            <div key={rule.id} className="flex items-center justify-between rounded border p-2 text-sm">
              <span>
                {weekdayLabels[rule.dayOfWeek]}, {rule.startTime}–{rule.endTime}
                {rule.reason ? ` (${rule.reason})` : ""}
              </span>
              <Button
                size="sm"
                variant="destructive"
                onClick={async () => {
                  await deleteAvailabilityRuleAction(rule.id);
                  await refresh();
                  onChanged();
                }}
              >
                Remover
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="ruleDay">Dia</Label>
              <select
                id="ruleDay"
                className="rounded border p-1.5 text-sm"
                value={ruleDay}
                onChange={(e) => setRuleDay(e.target.value)}
              >
                {weekdayLabels.map((label, index) => (
                  <option key={label} value={index}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ruleStart">Início</Label>
              <Input id="ruleStart" type="time" value={ruleStart} onChange={(e) => setRuleStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ruleEnd">Fim</Label>
              <Input id="ruleEnd" type="time" value={ruleEnd} onChange={(e) => setRuleEnd(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ruleReason">Motivo</Label>
              <Input id="ruleReason" value={ruleReason} onChange={(e) => setRuleReason(e.target.value)} />
            </div>
            <Button onClick={handleCreateRule}>Adicionar</Button>
          </div>
        </div>

        <div className="space-y-2 border-t pt-3">
          <h3 className="font-semibold">Pontuais</h3>
          {blocks.map((block) => (
            <div key={block.id} className="flex items-center justify-between rounded border p-2 text-sm">
              <span>
                {new Date(block.startsAt).toLocaleString()} – {new Date(block.endsAt).toLocaleString()}
                {block.reason ? ` (${block.reason})` : ""}
              </span>
              <Button
                size="sm"
                variant="destructive"
                onClick={async () => {
                  await deleteAvailabilityBlockAction(block.id);
                  await refresh();
                  onChanged();
                }}
              >
                Remover
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="blockStart">Início</Label>
              <Input
                id="blockStart"
                type="datetime-local"
                value={blockStart}
                onChange={(e) => setBlockStart(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="blockEnd">Fim</Label>
              <Input
                id="blockEnd"
                type="datetime-local"
                value={blockEnd}
                onChange={(e) => setBlockEnd(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="blockReason">Motivo</Label>
              <Input id="blockReason" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} />
            </div>
            <Button onClick={handleCreateBlock}>Adicionar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
