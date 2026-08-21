# ArkDoctor — Agendamento/Calendário (Fase 2) — Design Doc

Status: aprovado
Última atualização: 2026-08-20

## Contexto

Segunda fase de implementação do ArkDoctor, conforme ordem definida no PRD (`docs/prd/arkdoctor-prd.md`) e no design doc compartilhado (`docs/superpowers/specs/2026-08-20-arkdoctor-design.md`). Depende da spec de arquitetura (`docs/superpowers/specs/2026-08-20-arkdoctor-arquitetura-design.md`) para stack, modelo de conta/auth e convenções de repositório, e do módulo `crm` (Fase 1) para `Contact`, `Deal` e `PipelineStage`.

Cobre as user stories 11–18 do PRD (visualização em calendário, criar/editar/cancelar agendamento, bloqueio de horários, impedir conflito, status do agendamento, notas por atendimento, destaque de agendamentos sem status definido).

O cadastro completo de `Procedure` (categoria, uso no dashboard financeiro) pertence à Fase 3, mas o subconjunto necessário para o Agendamento funcionar (nome, valor padrão, duração padrão) é construído nesta fase — a Fase 3 estende a mesma tabela, sem retrabalho de schema.

## Modelo de Dados

- **`procedures`**: `id`, `account_id`, `name`, `default_price` (numeric), `default_duration_minutes` (int), `created_at`.
- **`appointments`**: `id`, `account_id`, `contact_id`, `procedure_id`, `deal_id` (nullable — vínculo opcional de volta ao Deal do Pipeline), `starts_at` (timestamptz), `ends_at` (timestamptz), `status` (`'agendado' | 'confirmado' | 'concluido' | 'nao_compareceu' | 'cancelado'`, default `'agendado'`), `notes` (texto livre, prontuário simples), `created_at`, `updated_at`.
- **`availability_blocks`**: bloqueios pontuais. `id`, `account_id`, `starts_at` (timestamptz), `ends_at` (timestamptz), `reason` (texto livre, opcional).
- **`availability_rules`**: bloqueios recorrentes semanais. `id`, `account_id`, `day_of_week` (int 0–6, domingo=0), `start_time` (time), `end_time` (time), `reason` (texto livre, opcional).

Duas tabelas separadas para bloqueio pontual vs. recorrente em vez de uma tabela única com colunas condicionais — os dois formatos têm forma diferente (intervalo absoluto vs. regra semanal relativa) e consultá-los juntos na checagem de conflito já exige tratamento separado de qualquer forma.

Regras de negócio:
- `ends_at` de um `appointment` é derivado da duração padrão do `procedure` no momento da criação, mas é um campo editável independente — mudar a duração de um `Procedure` depois não altera agendamentos já criados.
- Um novo agendamento (ou edição de horário de um existente) não pode sobrepor: (a) outro agendamento da mesma conta com `status <> 'cancelado'`, (b) um `availability_block` cuja janela sobreponha, (c) um `availability_rule` cujo `day_of_week` bata com o dia de `starts_at` e cuja janela `start_time`–`end_time` (hora local) sobreponha o horário pedido. Um agendamento `cancelado` libera o horário. Ao editar um agendamento existente, ele é excluído da própria checagem de conflito.
- Todas as tabelas seguem RLS por `account_id`, conforme spec de arquitetura.

## Integração com o Pipeline (`crm`)

Ao criar um `appointment` para um `contact` que tem um `Deal` aberto (`getOpenDealForContact`), o sistema busca no pipeline da conta um `pipeline_stage` com `name = 'Agendado'` (comparação exata) e, se existir, chama `moveDeal` para movê-lo. Se não existir tal estágio (foi renomeado ou removido pela usuária — é um estágio `kind = 'normal'`, não protegido), nada acontece: sem erro, sem bloqueio da criação do agendamento. O `deal_id` resultante (se houve Deal movido) é salvo em `appointments.deal_id`.

Esse é o único ponto de acoplamento entre os módulos `scheduling` e `crm`; `scheduling` importa e chama funções exportadas de `modules/crm/service.ts` (mesmo padrão de reuso já estabelecido para `createContact`), nunca acessa as tabelas do CRM diretamente. `modules/crm/service.ts` ganha um pequeno export novo, `getStages(repo, accountId)` (hoje só existe `listPipeline`, que já traz os Deals de cada estágio — desnecessário para essa checagem), reutilizado pela busca do estágio "Agendado".

## Server Actions (`modules/scheduling`)

- `createProcedure({ name, defaultPrice, defaultDurationMinutes })`, `updateProcedure(id, { name?, defaultPrice?, defaultDurationMinutes? })`, `listProcedures()`, `deleteProcedure(id)` — `deleteProcedure` é bloqueado se houver `appointment` (passado ou futuro) referenciando o procedimento; a usuária deve manter o cadastro em vez de apagar histórico.
- `createAppointment({ contactId, procedureId, startsAt, endsAt?, notes? })` — `endsAt` default = `startsAt + procedure.defaultDurationMinutes`. Valida conflito (rejeita com erro descritivo se houver sobreposição). Aciona a integração com o Pipeline descrita acima.
- `updateAppointmentTime(id, { startsAt, endsAt })` — revalida conflito excluindo o próprio agendamento.
- `updateAppointmentStatus(id, status)` — transição livre entre os 5 estados (sem máquina de estados restritiva no MVP; a usuária corrige manualmente se errar).
- `updateAppointmentNotes(id, notes)`.
- `cancelAppointment(id)` — atalho para `updateAppointmentStatus(id, 'cancelado')`.
- `listAppointments({ from, to })` — agendamentos no intervalo, para popular o calendário; inclui dados do `Contact` e `Procedure` (join) para exibição direta no card do evento.
- `listPendingStatusAppointments()` — agendamentos com `status = 'agendado'` e `ends_at < now()`, para o destaque do PRD #18.
- `createAvailabilityBlock({ startsAt, endsAt, reason? })`, `deleteAvailabilityBlock(id)`.
- `createAvailabilityRule({ dayOfWeek, startTime, endTime, reason? })`, `deleteAvailabilityRule(id)`.
- `checkConflict({ startsAt, endsAt, excludeAppointmentId? })` — usada internamente por `createAppointment`/`updateAppointmentTime`, também exposta para a UI pré-validar antes de submeter (evita round-trip de erro no formulário).

## UI / Rotas / Componentes

- **`/agenda`**: calendário via `react-big-calendar`, com alternância dia/semana/mês. Eventos coloridos por status (confirmado = azul, concluído = verde, não compareceu/cancelado = vermelho, agendado/pendente = âmbar — paleta semântica do design system). Bloqueios (pontuais e recorrentes materializados na janela visível) aparecem em cinza, não-clicáveis para criar agendamento por cima.
- **Criar/editar agendamento**: modal com busca de Contact (reaproveita `searchContacts` do CRM), seleção de Procedure (preenche duração sugerida), data/hora início (fim ajustável), campo de notas. Erro de conflito é mostrado inline, sem submeter.
- **Alterar status**: menu no card do evento (mesmo padrão de "mover para" usado no Pipeline para mobile/touch).
- **Configuração de bloqueios**: painel simples para listar/criar/remover bloqueios pontuais e regras recorrentes.
- **Cadastro de Procedimentos**: painel simples (lista + formulário nome/valor/duração) — acessível a partir de `/agenda` nesta fase; a Fase 3 adiciona campo de categoria e o move para dentro do módulo Financeiro se fizer mais sentido na navegação naquele momento.
- Sidebar: módulo "Agenda" passa de desabilitado para ativo.

## Casos de Borda

- Criar agendamento sobrepondo outro agendamento, bloqueio pontual ou regra recorrente → rejeitado com mensagem indicando o motivo (ex.: "Conflita com bloqueio de agenda").
- Cancelar um agendamento libera o horário para novos agendamentos.
- Editar o horário de um agendamento para um slot que ele mesmo já ocupa (sem mudança real) → não deve se autobloquear.
- Contact sem Deal aberto ao criar agendamento → agendamento criado normalmente, sem tentativa de mover estágio.
- Estágio "Agendado" renomeado/removido → agendamento criado normalmente, sem mover nenhum Deal, sem erro.
- Remover um Procedure referenciado por agendamentos existentes → bloqueado.
- Timezone: MVP assume fuso único (o da profissional); sem suporte a múltiplos fusos. Essa suposição depende de `TZ` estar fixado no ambiente de deployment para o fuso da profissional (ex.: `America/Sao_Paulo`) — `checkConflict` usa `Date.getDay()`/`getHours()`/`getMinutes()`, que resolvem contra o fuso do processo Node. Isso precisa ser configurado no deployment do Cloudflare Pages/OpenNext quando a Fase 2 for para produção (fora do escopo desta fase de fixes).

## Decisões de Teste (Vitest)

- `checkConflict`: detecta sobreposição com outro agendamento, com bloqueio pontual, e com regra recorrente no dia da semana correto; não detecta conflito com agendamento `cancelado`; não se autobloqueia ao excluir o próprio id.
- `createAppointment`: usa a duração padrão do Procedure quando `endsAt` não é informado; rejeita quando há conflito; mistura corretamente com a integração do Pipeline (verifica que `moveDeal` é chamado quando existe estágio "Agendado" e Deal aberto; não é chamado quando não existe o estágio).
- `updateAppointmentTime`: revalida conflito excluindo o próprio agendamento da checagem.
- `deleteProcedure`: bloqueia quando há agendamento referenciando; permite quando não há.
- `listPendingStatusAppointments`: retorna apenas agendamentos `agendado` com `ends_at` no passado.

## Fora de Escopo (Fase 2)

- Campo `category` em `Procedure` e qualquer vínculo com `FinancialEntry` (Fase 3).
- Lembretes/confirmações automáticas via WhatsApp.
- Suporte a múltiplos fusos horários.
- Máquina de estados restritiva para transição de status do agendamento (qualquer status pode ir para qualquer outro no MVP).
- Recorrência de bloqueio além de "semanal" (ex.: quinzenal, mensal, datas específicas de exceção dentro de uma regra recorrente).

## Decisões em Aberto

- Nenhuma.
