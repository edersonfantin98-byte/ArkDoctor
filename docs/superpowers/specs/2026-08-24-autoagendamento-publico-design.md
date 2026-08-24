# ArkDoctor — Autoagendamento Público — Design Doc

Status: em design
Última atualização: 2026-08-24

## Contexto

Segunda de três iniciativas solicitadas nesta sessão (a primeira, tela de pacientes, está em `docs/superpowers/specs/2026-08-24-tela-pacientes-design.md`; a terceira, correção da exportação de relatório, vem depois).

Hoje existe um wizard de autoagendamento em `/agendamento` (`src/components/agendamento/booking-wizard.tsx`), mas ele vive dentro do grupo de rotas `(app)`, que exige login (`src/app/(app)/layout.tsx` busca a sessão do usuário e o `accountId` a partir dela). Além disso, o passo de identificação do paciente é uma busca no CRM (`searchContactsAction`) que só encontra contatos já cadastrados — não há como um paciente novo, de fora, se identificar e agendar sozinho. O PRD (`docs/prd/arkdoctor-prd.md`) já registrava isso como gap conhecido, pendente de decisão.

Decisão confirmada com a usuária: o link de agendamento será **enviado manualmente** pela dona da clínica via WhatsApp (fora do sistema) — não há automação de disparo nesta fase. O sistema só precisa fornecer (1) uma página pública de agendamento e (2) um jeito fácil de copiar o link dela.

## Modelo de Acesso

- Nova rota pública `/agendar/[accountId]`, **fora** do grupo `(app)` — não passa pelo layout autenticado, então não exige login.
- `accountId` (UUID da conta) na URL identifica a clínica. Não há slug amigável — YAGNI, o app hoje é de uso interno de uma única clínica por conta, e o UUID já é suficientemente não-adivinhável para esse propósito.
- Sem CAPTCHA, sem rate-limiting. **Risco conhecido e aceito**: é um endpoint de escrita público (cria contato + agendamento), então tecnicamente qualquer pessoa com o link pode enviar múltiplas submissões. Mitigação fica para uma iteração futura caso vire problema real (o link não é divulgado publicamente, só enviado 1:1 pela dona).

## Backend — ações públicas

Segue exatamente o padrão já usado pelo webhook do WhatsApp (`src/app/api/whatsapp/webhook/[accountId]/route.ts`): usa `createServiceRoleSupabaseClient()` (já existe em `src/lib/supabase/service-role.ts`) em vez de `getCurrentAccountId`/sessão, recebendo `accountId` explicitamente como argumento.

Novo arquivo `src/app/agendar/actions.ts`, todas as funções recebendo `accountId` como primeiro parâmetro (nenhuma delas lê sessão):

- `listPublicProceduresAction(accountId)` → `scheduling.listProcedures`.
- `checkPublicConflictAction(accountId, startsAt, endsAt)` → `scheduling.checkConflict`.
- `createPublicBookingAction(accountId, { name, phone, procedureId, startsAt })`:
  1. Busca contato existente por telefone (`crm.findContactByPhone`); se não existir, cria (`crm.createContact({ name, phone })`) — mesma lógica já usada em `whatsapp.handleInboundMessage` para mensagens inbound de números desconhecidos.
  2. Chama `scheduling.createAppointment({ scheduling: schedulingRepo, crm: crmRepo }, accountId, { contactId, procedureId, startsAt })` — reaproveitada sem alterações; internamente já valida conflito, calcula `endsAt` a partir da duração do procedimento, e resolve/move o Deal do contato pro estágio "Agendado" se houver um Deal aberto (mesmo comportamento do agendamento feito pela equipe).

Nenhuma mudança é necessária em `modules/scheduling` ou `modules/crm` — é composição pura de funções já existentes, só trocando a fonte do `accountId`/cliente Supabase.

## UI — Wizard Público

Novo componente `src/components/agendamento/public-booking-wizard.tsx` e página `src/app/agendar/[accountId]/page.tsx`.

Decisão de implementação: **não** reaproveitar/alterar o `BookingWizard` interno existente — evita risco de regressão no fluxo já em produção usado pela equipe. O novo componente duplica a estrutura visual de 3 passos (procedimento → dia/horário → confirmação), mas:
- Passo 2 substitui a busca de contato por dois campos: "Nome" e "Telefone" (obrigatórios, sem busca/autocomplete).
- Usa as ações públicas do parágrafo anterior em vez das ações internas (`listProceduresAction`, `checkConflictAction`, `createAppointmentAction`).
- Sem sidebar/menu (a página não usa o layout `(app)`) — cabeçalho simples com nome da clínica (busca `accounts.name` via o mesmo cliente service-role) e o wizard abaixo.
- Ao confirmar com sucesso, mostra uma tela de confirmação simples ("Agendamento confirmado! Você receberá a confirmação por WhatsApp.") em vez de redirecionar para `/agenda` (que é uma rota interna).

## UI — Botão "Copiar link" (tela interna)

Em `src/app/(app)/agendamento/page.tsx` / `BookingWizard`: adiciona um botão "Copiar link de agendamento" que monta `${window.location.origin}/agendar/${accountId}` e copia via `navigator.clipboard.writeText`. Precisa do `accountId` da sessão atual, hoje não passado para o componente — a página passa a buscar e repassar como prop.

## Casos de Borda

- Telefone já cadastrado no CRM → reaproveita o contato existente (mesmo comportamento do inbound de WhatsApp), não cria duplicata.
- Conflito de horário detectado no submit → mensagem de erro no wizard público, paciente escolhe outro horário (mesma UX do wizard interno).
- Conta (`accountId`) inexistente na URL → página pública mostra mensagem de erro genérica ("Link inválido ou expirado"), sem vazar detalhes internos.
- Sem procedimentos cadastrados para a conta → wizard mostra "Nenhum procedimento disponível no momento", igual ao comportamento já existente no wizard interno.
- Envio duplicado (paciente clica confirmar duas vezes) → sem proteção especial; o segundo submit vai falhar naturalmente no `checkConflict` (o primeiro agendamento já ocupa o horário) — comportamento aceitável, não é o foco desta iteração.

## Decisões de Teste (Vitest)

Como a lógica de negócio (`createAppointment`, `checkConflict`, `findContactByPhone`/`createContact`) já é 100% reaproveitada e já tem cobertura de teste em `modules/scheduling` e `modules/crm`, não há lógica nova para testar em `modules/`. As únicas adições são:
- `src/app/agendar/actions.ts`: sem teste dedicado, mesmo padrão do resto do repositório (arquivos `actions.ts` são composição fina, não testados isoladamente — verificados por type-check + verificação manual, igual às demais rotas).
- Verificação manual do fluxo completo (abrir link em aba anônima, preencher, confirmar, checar que o agendamento aparece em `/agenda` e o contato em `/pacientes`/`/pipeline`) é o critério de aceite desta spec.

## Fora de Escopo

- Slug amigável / URL customizável por clínica.
- CAPTCHA, rate-limiting ou qualquer proteção anti-abuso no endpoint público.
- Envio automático do link (por gatilho, campanha, etc.) — a dona envia manualmente pelo WhatsApp.
- Confirmação por e-mail ou notificação automática ao paciente após o agendamento (o texto da tela de sucesso menciona "confirmação por WhatsApp", mas isso é responsabilidade da dona enviar manualmente, não uma automação do sistema).
- Cancelamento/reagendamento pelo próprio paciente via link público.

## Decisões em Aberto

- Nenhuma.
