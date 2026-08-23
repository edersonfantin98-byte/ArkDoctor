# ArkDoctor — Financeiro/Dashboard (Fase 3) — Design Doc

Status: implementado, com divergências — ver notas inline ("**Nota (implementação real)**") nas seções Modelo de Dados, Rotas e UI, e Testes
Última atualização: 2026-08-22

## Contexto

Complementa o PRD (`docs/prd/arkdoctor-prd.md`, stories 19-29) e o design doc de arquitetura compartilhada (`docs/superpowers/specs/2026-08-20-arkdoctor-arquitetura-design.md`). Cobre o schema, módulo de domínio, rotas e componentes específicos do Financeiro/Dashboard.

**Desenvolvimento em paralelo com Agendamento (Fase 2)**: esta fase está sendo construída em uma branch separada (`feature/financeiro-dashboard`), ao mesmo tempo em que o Agendamento está sendo construído em outra sessão/terminal. No momento em que esta spec é escrita, `docs/superpowers/specs/2026-08-20-arkdoctor-agendamento-design.md` já existe, mas nenhum código, módulo `scheduling` ou tabela `Appointment` foi implementado ainda.

O PRD descreve o Financeiro como dependente do Agendamento (o fluxo principal de receita nasce de "marcar Appointment como concluído → sugerir FinancialEntry"). Para viabilizar o trabalho em paralelo sem acoplar as duas branches, esta fase é construída **desacoplada de `Appointment`**:

- `Procedure` e `FinancialEntry` são construídos e funcionam de ponta a ponta com lançamento **manual** de receita/despesa.
- O schema já reserva a coluna `appointment_id` (nullable) em `FinancialEntry`, para que a integração futura (Appointment concluído → sugestão de FinancialEntry) seja apenas a adição de uma função de serviço + chamada no módulo `scheduling`, sem migration nova.
- A métrica de taxa de cancelamento/não comparecimento (story 26), que depende de status de `Appointment`, é implementada como card de estado "indisponível" no dashboard (ver seção Dashboard) em vez de omitida — evita retrabalho de layout quando a integração for feita.

## Modelo de Dados

### `procedures`

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `account_id` | uuid FK → `accounts` | obrigatório, RLS por `account_id` |
| `name` | text | obrigatório |
| `default_price` | numeric(10,2) | obrigatório |
| `category` | text | livre |
| `active` | boolean | default `true`; desativar em vez de apagar (preserva histórico de `financial_entries`) |
| `created_at` | timestamptz | default `now()` |

**Nota (implementação real):** a tabela `procedures` acabou nascendo em `0004_scheduling.sql` (módulo `scheduling`, não `finance` — ver `docs/superpowers/specs/2026-08-20-arkdoctor-agendamento-design.md`), sem os campos `active` nem `category` descritos acima. A remoção é hard delete bloqueado quando há agendamento vinculado (`deleteProcedure`), não soft-delete via `active`.

### `financial_entries`

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `account_id` | uuid FK → `accounts` | obrigatório, RLS por `account_id` |
| `type` | text (`'revenue'` \| `'expense'`) | check constraint |
| `amount` | numeric(10,2) | valor efetivamente lançado |
| `default_amount` | numeric(10,2) nullable | snapshot do `procedure.default_price` no momento do lançamento; permite análise de desconto ao longo do tempo (story 22/PRD "Preservação de valor"); `null` para despesas ou receitas sem procedimento vinculado |
| `category` | text | obrigatório para despesas; para receitas, herda a `category` do procedimento se houver |
| `procedure_id` | uuid FK → `procedures`, nullable | só para `type = 'revenue'` |
| `appointment_id` | uuid, nullable | reservado para integração futura com `scheduling`; sem FK ainda (tabela não existe) |
| `description` | text nullable | |
| `occurred_at` | date | data do lançamento (não `created_at` — usuária pode lançar retroativo) |
| `created_at` | timestamptz | default `now()` |

Migration: `supabase/migrations/0004_finance.sql`, RLS habilitada seguindo o padrão de `0002_crm.sql`/`0003_security_hardening.sql`.

## Módulo `src/modules/finance/`

Segue exatamente a estrutura já estabelecida por `src/modules/crm/`:

- `types.ts` — `Procedure`, `FinancialEntry`
- `schemas.ts` — Zod: `createProcedureInputSchema`, `updateProcedureInputSchema`, `createFinancialEntryInputSchema`
- `repository.ts` — interface `FinanceRepository`
- `repository.memory.ts` — implementação em memória (testes)
- `repository.supabase.ts` — implementação real
- `service.ts` — regras de negócio (ver abaixo) + `service.test.ts`

### Regras de negócio (`service.ts`)

- `createProcedure` / `updateProcedure` / `deactivateProcedure` — CRUD simples (stories 19-20). Sem hard delete (usa `active`).
- `createFinancialEntry(repo, accountId, rawInput)`:
  - Valida via Zod.
  - Se `type === 'revenue'` e `procedureId` informado: busca o `Procedure`, preenche `defaultAmount = procedure.defaultPrice` e `category = procedure.category` (se `category` não vier explícita no input) — implementa a "sugestão editável" da story 21/22 no fluxo manual (a usuária escolhe o procedimento, o valor vem pré-preenchido, mas ela confirma/edita antes de salvar — a UI faz esse preenchimento client-side chamando uma função exposta pelo service, `getProcedureDefaults`, e o valor final vai no `createFinancialEntry`).
  - Se `type === 'expense'`: `procedureId` deve ser `null` (rejeitar caso contrário).
- `updateFinancialEntry(repo, accountId, id, { amount, category?, description?, occurredAt })` e `deleteFinancialEntry(repo, accountId, id)` — **adicionados após a implementação inicial, não faziam parte desta spec.** Edição não permite trocar `type` nem `procedureId` (só valor, categoria, descrição e data); exclusão é definitiva, sem confirmação além da UI (duas etapas). Sem teste automatizado ainda — ver seção Testes.
- `getDashboardMetrics(repo, accountId, { from, to })`:
  - Busca `FinancialEntry` do período `[from, to]` e do período anterior equivalente (mesma duração, imediatamente anterior a `from`).
  - Calcula: receita total, despesa total, saldo, variação percentual de receita vs. período anterior (story 24).
  - Agrupa receitas por `procedureId`, soma `amount` e conta ocorrências, ordena desc (story 25).
  - Ticket médio = média de `amount` das entradas de receita no período (story 27).
  - Taxa de cancelamento (story 26): retorna `{ available: false }` — não há dado de `Appointment` ainda. Campo tipado desde já como union (`{ available: true, rate: number } | { available: false }`) para a integração futura não quebrar o contrato. **Nota (2026-08-22): o módulo `scheduling` já foi implementado e mesclado, mas essa integração continua retornando `{ available: false }` — ficou pendente e não foi retomada.**
  - Todo cálculo de receita usa exclusivamente `financial_entries` já confirmadas — não há conceito de "agendamento não concluído" nesta fase, então a story 28 (não entrar em métricas sem status de conclusão) já é satisfeita trivialmente: só existe lançamento manual confirmado.

## Rotas e UI

```
src/app/(app)/financeiro/
  page.tsx                 # dashboard: cards de métrica + gráfico + tabela de procedimentos mais vendidos
  lancamentos/
    page.tsx                # lista de financial_entries + botão "novo lançamento"
  actions.ts                # Server Actions, chamam src/modules/finance/service.ts
```

**Nota (implementação real):** `procedimentos/` não ficou dentro de `financeiro/` — é uma rota própria em `src/app/(app)/procedimentos/`, com item próprio na sidebar (ver `docs/superpowers/specs/2026-08-20-arkdoctor-agendamento-design.md`).

- Sidebar (`src/components/layout/sidebar.tsx`): item "Financeiro" passa de `enabled: false` para `enabled: true`.
- Filtro de período (semana / mês / customizado) como pílulas no topo do dashboard, controla as chamadas de `getDashboardMetrics`.
- Cards de métrica: ícone em chip pastel + valor grande (28-34px bold) + comparação textual com período anterior, conforme design system (`2026-08-20-arkdoctor-visual-design.md`, seção "Financeiro/Dashboard").
- Card de taxa de cancelamento: mesmo formato dos demais, mas com estado vazio ("Disponível quando a Agenda estiver conectada") em vez de número, usando a cor neutra/cinza da paleta semântica.
- Gráfico receita × despesa por período: Recharts, verde para receita e vermelho para despesa (paleta semântica already-approved).
- Formulário de novo lançamento: campo tipo (receita/despesa) → se receita, seletor de procedimento (opcional) que pré-preenche valor e categoria via `getProcedureDefaults`, editável antes de salvar.
- **Adicionado após a implementação inicial**: cada linha da lista de lançamentos é clicável e abre um diálogo de edição (valor, categoria, descrição, data — não permite trocar tipo/procedimento) com botão "Excluir lançamento" (confirmação em duas etapas).

## Testes

- `service.test.ts` (módulo `finance`): prioridade alta, conforme decisão de teste do PRD — cobre cálculo de métricas do dashboard (receita/despesa por período, comparação com período anterior, ticket médio, agrupamento por procedimento), snapshot de `defaultAmount`, rejeição de `procedureId` em despesa.
- `repository.memory.test.ts`: cobre a implementação em memória usada pelos testes de serviço.
- Sem testes E2E (decisão já fechada no PRD/arquitetura).
- **Gap conhecido**: `updateFinancialEntry`/`deleteFinancialEntry` (adicionados após a implementação inicial) ainda sem cobertura em `service.test.ts`.

## Fora de Escopo (desta spec)

- Integração real Appointment → FinancialEntry (fica para quando `scheduling` for mesclado; é a próxima spec pequena, não esta).
- Taxa de cancelamento com dado real.
- Exportação de relatórios/PDF (não mencionado no PRD).

## Decisões em Aberto

- Nenhuma.
