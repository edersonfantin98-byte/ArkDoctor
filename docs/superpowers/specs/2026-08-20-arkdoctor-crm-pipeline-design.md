# ArkDoctor — CRM/Pipeline (Fase 1) — Design Doc

Status: implementado (com uma adição pós-implementação: exclusão de contato — ver seção Server Actions)
Última atualização: 2026-08-22

## Contexto

Primeira fase de implementação do ArkDoctor, conforme ordem definida no PRD (`docs/prd/arkdoctor-prd.md`). Depende da spec de arquitetura compartilhada (`docs/superpowers/specs/2026-08-20-arkdoctor-arquitetura-design.md`) para stack, modelo de conta/auth e convenções de repositório — este documento assume aquelas decisões e detalha apenas o módulo `crm`.

Cobre as user stories 1–10 do PRD (cadastro de contato, pipeline visual, movimentação entre estágios, histórico, follow-up, perdido, busca, notas, estágios configuráveis). A criação automática de Contact a partir de mensagem de WhatsApp (user story 9) é responsabilidade da Fase 4 — esta fase apenas expõe a função (`createContact`) que a Fase 4 vai reutilizar.

## Modelo de Dados

- **`contacts`**: `id`, `account_id`, `name`, `phone`, `origin` (texto livre), `notes`, `created_at`, `updated_at`.
- **`pipeline_stages`**: `id`, `account_id`, `name`, `kind` (`'normal' | 'follow_up' | 'lost'`), `position` (int).
- **`deals`**: `id`, `account_id`, `contact_id`, `stage_id`, `created_at`, `closed_at` (nullable).
- **`deal_stage_history`**: `id`, `deal_id`, `from_stage_id` (nullable), `to_stage_id`, `moved_at`.

Regras de negócio:
- Cada conta tem, desde a criação (seed), os 6 estágios padrão do PRD: Novo Lead → Em Negociação → Agendado → Atendido → Follow-up → Perdido. Follow-up (`kind = 'follow_up'`) e Perdido (`kind = 'lost'`) sempre existem, têm posição fixa ao final da ordem, e só podem ser renomeados (não removidos, não reordenados). Estágios `kind = 'normal'` podem ser criados, renomeados, reordenados e removidos.
- Remover um estágio `normal` é bloqueado se houver algum Deal aberto (`closed_at IS NULL`) nele.
- No máximo um Deal aberto por Contact ao mesmo tempo.
- Entrar em um estágio `kind = 'lost'` seta `closed_at = now()` no Deal automaticamente. O histórico em `deal_stage_history` nunca é apagado, mesmo para Deals fechados.
- Todas as tabelas seguem RLS por `account_id`, conforme spec de arquitetura.

## Server Actions (`modules/crm`)

- `createContact({ name, phone, origin?, notes? })` — cria Contact e um Deal inicial no primeiro estágio (`position = 0`). Reutilizada pelo módulo de WhatsApp na Fase 4.
- `updateContact(id, { name?, phone?, origin?, notes? })`
- `searchContacts({ query })` — busca por nome (parcial) ou telefone.
- `listPipeline()` — estágios com seus Deals (join Contact), para o kanban.
- `moveDeal(dealId, toStageId)` — valida, grava `deal_stage_history`, atualiza `stage_id`; no-op se `toStageId === stage_id` atual; seta `closed_at` se o estágio destino é `kind = 'lost'`.
- `createStage({ name, position })`, `renameStage(id, name)`, `reorderStages(orderedIds)`, `deleteStage(id)` — as três últimas só operam sobre estágios `kind = 'normal'`; `deleteStage` retorna erro se houver Deal aberto no estágio.
- `reopenDeal(contactId)` — cria novo Deal (nova negociação) para um Contact sem Deal aberto no momento; erro se já existir um Deal aberto para o contato.
- `deleteContact(contactId)` — **adicionado após a implementação inicial, não fazia parte desta spec original.** Exclusão definitiva: `deals.contact_id` e `appointments.contact_id` têm `on delete cascade` no schema, então apagar um Contact apaga automaticamente seus Deals, `deal_stage_history` (via cascade de `deals`) e Appointments vinculados. Não afeta `financial_entries` (sem FK para Contact). Sem teste automatizado ainda — ver Decisões de Teste.

## UI / Rotas / Componentes

- **`/pipeline`**: kanban com uma coluna por `pipeline_stage` (ordenadas por `position`). Cards mostram nome/telefone do Contact e tempo no estágio atual. Drag-and-drop via `dnd-kit`; em telas pequenas, menu "mover para" no card como alternativa ao arraste.
- **Busca**: barra no topo da página, filtra cards visíveis via `searchContacts`.
- **Painel de detalhe do Contact** (abre ao clicar no card): dados do contato, campo de notas editável, histórico de movimentação do Deal atual (nome do estágio, resolvido a partir do `stageId`), lista de Deals anteriores (se houver, com opção de ver quando foram fechados). Botão "Excluir contato" com confirmação em duas etapas (clicar → "Confirmar exclusão"/"Cancelar").
- **Botão "Novo contato"**: formulário (nome, telefone, origem, notas) → `createContact`.
- **Configuração de estágios**: painel acessível a partir de `/pipeline` para renomear/reordenar/criar/remover estágios `normal`; estágios especiais aparecem só com opção de renomear.

## Casos de Borda

- Mover Deal para o estágio em que já está → no-op, sem novo registro de histórico.
- Remover estágio `normal` com Deals ativos → bloqueado, com mensagem indicando que é preciso mover os Deals primeiro.
- Contact com telefone duplicado → permitido (não bloqueado automaticamente); a busca por telefone ajuda a usuária a notar duplicatas manualmente.
- `reopenDeal` quando já existe um Deal aberto para o Contact → erro.
- Excluir um Contact com negociações, histórico e agendamentos vinculados → tudo é removido em cascata pelo banco; sem confirmação adicional além da UI (duas etapas).

## Decisões de Teste (Vitest)

- `moveDeal`: grava histórico corretamente; seta `closed_at` ao entrar em estágio `kind = 'lost'`; no-op ao mover para o mesmo estágio.
- `deleteStage`: bloqueia remoção quando há Deal aberto no estágio; permite quando não há.
- `createContact`: cria Contact e Deal inicial no primeiro estágio (`position = 0`).
- `reopenDeal`: cria novo Deal apenas quando não há um já aberto para o Contact.
- `searchContacts`: casa por nome parcial e por telefone.
- `deleteContact`: **gap conhecido** — sem teste automatizado cobrindo o cascade de deleção (deals/histórico/agendamentos).

## Fora de Escopo (Fase 1)

- Criação automática de Contact a partir de mensagem de WhatsApp (Fase 4 — esta fase só expõe `createContact` para reuso).
- Agendamento, financeiro e qualquer vínculo com Appointment/FinancialEntry (fases 2 e 3).
- Deduplicação automática de contatos por telefone.

## Decisões em Aberto

- Nenhuma.
