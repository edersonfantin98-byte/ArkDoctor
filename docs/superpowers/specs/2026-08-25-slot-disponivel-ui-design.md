# Exibir horários ocupados na UI de agendamento

## Problema

O backend (`checkConflict` em `src/modules/scheduling/service.ts`) já impede de forma confiável a criação de agendamentos sobrepostos — nenhum dado inconsistente pode ser gravado. Mas nenhuma das três telas de agendamento comunica isso *antes* do usuário chegar ao fim do fluxo:

- **`booking-wizard.tsx`** (agenda interna) e **`public-booking-wizard.tsx`** (agendamento público, `/agendar/[accountId]`): a grade de horários fixos (08h–18h, 30 em 30 min) é sempre exibida inteira, clicável, sem indicar quais já estão ocupados. O conflito só é checado (`checkConflictAction`/`checkPublicConflictAction`) na etapa de confirmação, depois que o usuário já preencheu contato/procedimento.
- **`appointment-dialog.tsx`** (dialog de criar/editar direto no calendário da agenda): usa um input `datetime-local` livre. Não há checagem de conflito nenhuma antes de submeter — o erro só aparece depois do clique em "Salvar", vindo do backend.

Isso gera fricção: preencher tudo para só então descobrir que o horário está ocupado, especialmente ruim no fluxo público, onde o paciente está sozinho.

Esse é um problema de UX, não de integridade de dados — o backend já garante que nada quebra. O objetivo aqui é só antecipar essa informação na interface.

## Fora de escopo

- Constraint de exclusão no banco (`EXCLUDE USING gist`) para fechar a race condition teórica entre duas requisições concorrentes.
- Dimensão médico/sala nos conflitos (hoje o conflito é por `account_id`, sem recurso separado).

## Design

### 1. Serviço: calcular intervalos ocupados de um dia

Nova função em `src/modules/scheduling/service.ts`:

```ts
export interface OccupiedInterval {
  startsAt: string;
  endsAt: string;
}

export async function listOccupiedIntervals(
  repo: SchedulingRepository,
  accountId: string,
  range: { from: string; to: string }, // início e fim do dia, em ISO
): Promise<OccupiedInterval[]>
```

Implementação: reutiliza os métodos de repositório já existentes (nenhum método novo no repositório é necessário):

- `repo.listAppointmentsOverlapping(accountId, range.from, range.to)` → filtra `status !== "cancelado"` → cada um vira `{ startsAt, endsAt }`.
- `repo.listAvailabilityBlocksOverlapping(accountId, range.from, range.to)` → cada bloco vira `{ startsAt, endsAt }`.
- `repo.listAvailabilityRules(accountId)` → para as regras cujo `dayOfWeek` bate com o dia de `range.from`, converte `startTime`/`endTime` (HH:mm) em `{ startsAt, endsAt }` ISO daquele dia específico.

Retorna a união simples dessas três listas (sem merge de intervalos sobrepostos — não é necessário, o cálculo de colisão no cliente trata cada intervalo independentemente).

Não inclui nenhum dado de contato/paciente — só os horários.

### 2. Server actions

Duas actions finas, espelhando o padrão de `checkConflictAction`/`checkPublicConflictAction`:

- `src/app/(app)/agenda/actions.ts`: `listOccupiedIntervalsAction(from: string, to: string)` — autenticada, usa `getReposAndAccount()`.
- `src/app/agendar/actions.ts`: `listPublicOccupiedIntervalsAction(accountId: string, from: string, to: string)` — usa `getPublicRepos()`, sem autenticação (mesmo padrão de `checkPublicConflictAction`).

### 3. Wizards — grade de horários desabilita slots ocupados

Em `booking-wizard.tsx` e `public-booking-wizard.tsx`:

- Novo estado `occupiedIntervals: OccupiedInterval[]`.
- Novo `useEffect` disparado quando `date` muda: calcula o início/fim do dia selecionado em ISO e chama a action correspondente, populando `occupiedIntervals`.
- Nova função `isSlotBusy(slot: string): boolean` — dado o horário do slot e a duração do procedimento selecionado (`selectedProcedure.defaultDurationMinutes`), calcula `[slotStart, slotEnd)` e verifica se colide com algum item de `occupiedIntervals` (mesma lógica de overlap usada no backend: `slotStart < end && slotEnd > start`).
- Na renderização da grade de horários, cada botão de slot passa a receber `disabled={isSlotBusy(s)}`, com classe visual adicional para o estado desabilitado (`opacity-50 line-through cursor-not-allowed`, sem `hover:bg-muted`).
- A checagem de conflito existente na etapa de confirmação (`checkConflictAction`/`checkPublicConflictAction`) permanece inalterada, como segunda camada de proteção contra corrida entre dois usuários.
- Se nenhum procedimento estiver selecionado ainda (não é o caso aqui, já que a etapa de procedimento vem antes — mas por robustez), `isSlotBusy` usa uma duração default de 30 min para não quebrar o cálculo.

### 4. Dialog da agenda interna — checagem inline antes de submeter

Em `appointment-dialog.tsx`:

- Novo estado: `checkingConflict`, `conflictReason`, `conflictCheckError` (mesmos nomes usados nos wizards, para consistência).
- Novo `useEffect` disparado quando `startsAt` (ou, ao criar, `procedureId`) muda: monta `startsAtIso`/`endsAtIso` (usando a duração do procedimento selecionado ao criar, ou a duração original do agendamento ao editar) e chama `checkConflictAction(startsAtIso, endsAtIso, editingAppointment?.id)` — o terceiro argumento (`excludeAppointmentId`) evita que o próprio agendamento em edição conflite consigo mesmo.
- Exibe `conflictReason` como texto de erro inline (mesmo padrão visual do `error` já existente no componente).
- O botão "Salvar" ganha `|| checkingConflict || !!conflictReason` na condição de `disabled`.

### Testes

- `listOccupiedIntervals`: teste unitário cobrindo agendamento não-cancelado incluído, agendamento cancelado excluído, bloco pontual incluído, regra recorrente do dia da semana certo incluído e de dia errado excluído.
- `isSlotBusy` (ou função equivalente extraída para teste, se fizer sentido isolar): overlap parcial no início, no fim, contido, slot livre.
- Não é necessário teste E2E de UI para este ajuste — os testes de unidade cobrem a lógica de decisão; a renderização (disabled/estilo) é validação visual manual.
