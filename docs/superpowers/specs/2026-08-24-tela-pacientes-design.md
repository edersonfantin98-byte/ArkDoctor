# ArkDoctor — Tela de Pacientes — Design Doc

Status: em design
Última atualização: 2026-08-24

## Contexto

Primeira de três iniciativas solicitadas nesta sessão (as outras duas — autoagendamento do paciente e correção da exportação de relatório — são specs separadas, tratadas depois desta).

Hoje o CRM (`docs/superpowers/specs/2026-08-20-arkdoctor-crm-pipeline-design.md`) já tem um cadastro de `Contact` usado no kanban `/pipeline`, mas não existe uma tela dedicada de cadastro/listagem de pacientes, nem capacidade de envio de mensagem em massa via WhatsApp. Esta spec cobre as duas coisas: (1) estender o cadastro de Contact com campos clínicos e uma tela `/pacientes` dedicada, e (2) envio de mensagem em massa para pacientes selecionados via WhatsApp.

Decisão confirmada com a usuária: **não** criar uma entidade `Patient` separada — a tela de Pacientes reaproveita a entidade `Contact` já existente (mesmo cadastro usado pelo Pipeline), apenas com campos adicionais e uma superfície de UI própria.

## Modelo de Dados

Estende `contacts` (não cria tabela nova):

- `email` (nullable, texto livre — sem validação de formato além de "parece um email" no client)
- `birth_date` (nullable, `date`)
- `cpf` (nullable, texto livre — sem validação de dígito verificador; não foi pedido e adicionaria complexidade sem necessidade clara)
- `sex` (nullable, `'M' | 'F'`)
- `guardian_name` (nullable, texto livre)
- `guardian_phone` (nullable, texto livre)
- `guardian_relationship` (nullable, texto livre — ex: "mãe", "filho", "tutor legal")

`notes` (já existente) é reaproveitado como "Observações" na tela de Pacientes — não é um campo novo. `origin` (já existente, usado pelo Pipeline para indicar origem do lead) continua existindo no schema mas não aparece no formulário de Pacientes, que é focado em dados clínicos/contato, não em funil de vendas.

Migração Supabase: `ALTER TABLE contacts ADD COLUMN ...` para os 6 campos acima, todos nullable — não quebra dados existentes, sem backfill necessário.

## Repositório (`modules/crm`)

- `insertContact` / `updateContact`: assinatura estendida para aceitar os novos campos (todos opcionais).
- Novo método `listContacts(accountId): Promise<Contact[]>` — retorna todos os contatos da conta, ordenados por nome. Hoje o repositório só tem `searchContacts(accountId, query)` (exige termo de busca) e `getDealsWithContactsByStage` (agrupado por estágio do pipeline, não serve para listar todos os contatos direto). Implementado em `repository.memory.ts` e `repository.supabase.ts`.
- Demais métodos (`searchContacts`, `findContactByPhone`, `deleteContact`) não mudam de assinatura.

## Server Actions

Novo arquivo `src/app/(app)/pacientes/actions.ts`:

- `listPatientsAction()` → `listContacts`.
- `searchPatientsAction(query)` → reaproveita `searchContactsAction` do CRM (mesma função, sem duplicar lógica).
- `createPatientAction(input)` / `updatePatientAction(id, input)` → reaproveitam `createContactAction`/`updateContactAction` do CRM (schemas Zod estendidos com os novos campos, todos opcionais exceto `name`/`phone`).
- `deletePatientAction(id)` → reaproveita `deleteContactAction`.
- `sendBulkMessageAction(input: { contactIds: string[]; message: string })` → nova lógica de envio em massa (ver seção seguinte).

Os schemas Zod em `modules/crm/schemas.ts` ganham os 6 campos novos como opcionais.

## UI / Rotas

- **`/pacientes`**, novo item "Pacientes" no menu principal (`src/components/layout`).
- **Listagem**: tabela com nome, telefone, e-mail (se houver), idade calculada a partir de `birth_date` (se houver). Busca por nome/telefone no topo (reaproveita `searchContacts`).
- **Checkbox por linha** + "selecionar todos (filtrados)" no cabeçalho da tabela.
- **"Novo paciente"**: abre formulário com nome*, telefone* (obrigatórios) e email, nascimento, sexo, CPF, responsável (nome/telefone/parentesco), observações (todos opcionais). Clicar em uma linha da tabela abre o mesmo formulário para edição.
- **"Enviar mensagem"**: habilitado quando ≥1 paciente selecionado. Abre um diálogo com textarea de mensagem, aceitando o placeholder literal `{{nome}}` (substituído pelo nome do paciente no envio). Botão "Enviar para N pacientes" dispara o envio e mostra progresso (barra ou contador "X de N enviados").

## Envio em Massa

`sendBulkMessageAction`:

1. Valida que todos os `contactIds` pertencem à conta autenticada.
2. Para cada contato, sequencialmente (não em paralelo):
   - Substitui `{{nome}}` pelo `contact.name` no texto da mensagem.
   - Envia via `provider.sendMessage(accountId, contact.phone, textoPersonalizado)` (mesma função já usada no envio 1:1) e registra a mensagem como outbound na conversa do contato via `logMessage`, reaproveitando a lógica existente (cria a conversa se ainda não existir).
   - Aguarda um intervalo aleatório entre 5 e 10 segundos antes do próximo envio (não fixo — evita padrão detectável de automação). Exceção: não aguarda após o último envio do lote.
   - Se um envio individual falhar (provider lança erro), registra a falha e **continua** para o próximo contato — uma falha isolada não aborta o lote inteiro.
3. Retorna `{ sent: string[], failed: { contactId: string; error: string }[] }` para a UI exibir o resultado final.

Como o lote pode levar minutos (dezenas de contatos × ~7.5s médios), a action roda como Server Action de streaming/polling simples: a UI dispara o envio e faz polling do progresso, **ou** — mais simples e suficiente para o volume esperado (uso interno de uma clínica, não milhares de contatos) — a Server Action processa tudo e só retorna ao final, com um indicador de "enviando..." na UI enquanto aguarda. Optamos pela segunda abordagem (sem polling) por simplicidade; se o volume real exigir feedback incremental depois, isso vira uma iteração futura.

## Casos de Borda

- Paciente sem telefone válido nunca deveria existir (telefone é obrigatório no cadastro), então o envio em massa não precisa tratar telefone ausente.
- Selecionar 0 pacientes → botão "Enviar mensagem" fica desabilitado.
- Mensagem vazia → bloqueada no client antes de habilitar "Enviar".
- Provider indisponível (WhatsApp desconectado) → todos os envios falham individualmente, lote conclui com `sent: []` e todos em `failed`; UI mostra erro agregado.
- Edição de paciente não altera `origin`/estágio do Pipeline — permanece responsabilidade exclusiva da tela `/pipeline`.

## Decisões de Teste (Vitest)

- `listContacts`: retorna todos os contatos da conta, ordenados por nome, escopado por `accountId`.
- `createContact`/`updateContact`: aceitam e persistem os novos campos opcionais; continuam funcionando quando os novos campos são omitidos (não quebra o fluxo do Pipeline).
- Lógica de envio em massa (função pura de "montar lista de envios com substituição de `{{nome}}`" extraída do server action para ser testável sem depender de `setTimeout`/provider real): substitui `{{nome}}` corretamente; mensagem sem placeholder permanece igual para todos.
- Lógica de agregação de resultado (`sent`/`failed`): uma falha em um contato não impede os demais de serem processados.

## Fora de Escopo

- Entidade `Patient` separada do `Contact` (decisão explícita: reaproveitar `Contact`).
- Templates de mensagem reutilizáveis / campanhas com histórico próprio (mencionado como alternativa mais robusta, descartada por ora — ver conversa de brainstorming).
- Validação formal de CPF (dígito verificador) e de formato de e-mail no servidor.
- Deduplicação automática de pacientes por telefone (mesmo comportamento já aceito no Pipeline).
- Feedback de progresso incremental (streaming) durante o envio em massa — action síncrona por ora.
- Opt-out/descadastro de mensagens em massa por parte do paciente.

## Decisões em Aberto

- Nenhuma.
