# ArkDoctor — Tratamento + Relatório Clínico — Design Doc

Status: em design
Última atualização: 2026-08-27

## Contexto

A usuária real (enfermeira) faz **ozonioterapia para cicatrização de feridas**. Ela precisa de um **relatório por paciente** que mostre: tipos de ferida, início e fim do tratamento, número de sessões realizadas, tipo de tratamento, tempo total, uma avaliação geral da profissional e a percepção do paciente.

Hoje o sistema não tem nada disso de forma estruturada:

- A entidade `Appointment` (`src/modules/scheduling`) tem contato, procedimento, data/hora, status e um campo `notes` de texto livre ("prontuário simples"). "Sessões" são esses agendamentos.
- Não existe entidade que agrupe sessões num curso de tratamento.
- O único "relatório" que existe é a impressão da tela de Dashboard (financeiro/agregado), via `window.print()` — ver `docs/superpowers/specs/2026-08-24-relatorio-impressao-design.md`. Não há relatório por paciente.
- O deploy roda em Cloudflare Workers (`opennextjs-cloudflare`): **não há geração de PDF no servidor** (sem Chrome headless). O padrão do projeto é `window.print()` + "Salvar como PDF" do navegador.

Enquadramento legal (pesquisa 2026-08-27): a **Lei 14.648/2023** autoriza a ozonioterapia como tratamento complementar e o **Parecer Normativo COFEN 01/2023** obriga a enfermeira a manter Termo de Consentimento Livre e Esclarecido e a documentar o procedimento. Este doc cobre a **documentação clínica e o relatório**. A **assinatura eletrônica dos termos** é uma feature separada (ver "Decisões em Aberto" e Fora de Escopo).

## Decisões confirmadas no brainstorming (2026-08-27)

Respostas da profissional (via intermediário), que fixam o design:

1. **Um tratamento por ferida.** Várias feridas ao mesmo tempo → tratamentos separados. Mais de um tratamento ativo por paciente é raro, mas o sistema permite.
2. **Ferida nova depois da alta = tratamento novo** (o antigo fica no histórico).
3. **Identificação do tratamento na lista: pela data de início** + tipos de ferida. Sem título obrigatório.
4. **Início: data definida manualmente por ela** (default = hoje no formulário). Ela pode registrar um tratamento que começou antes de usar o sistema.
5. **Fim: alta dada por ela OU cicatrização completa.** Registrar o motivo do fim (cicatrização / alta / abandono / encaminhamento).
6. **Sem pausa/retomada.** Duração = do início até o fim, direto.
7. **Nº de sessões é aberto** (vai até cicatrizar; sem pacote fixo). Frequência varia. **Contagem sempre derivada dos agendamentos**, nunca digitada.
8. **Relatório de sessões: resumo + opção de detalhar** a lista sessão a sessão.
9. **Tipo de ferida: campo livre.** A profissional classifica em tipos conhecidos (lesão por diabetes, úlcera venosa, úlcera arterial, lesão por trauma, lesão por pressão), mas quer liberdade para escrever o que achar melhor de cada caso. Detalhes da ferida (local no corpo, lado, aspecto) também em **campo de texto livre**, sem campos fixos obrigatórios.
10. **Medidas da ferida ao longo do tempo: fora** (ela achou desnecessário) — pendente de confirmação.
11. **Fotos: sim.** Guardar no tratamento e incluir no relatório. ~1 foto por sessão, varia (5 a 15 por tratamento). iPhone (fotos HEIC).
12. **Feedback geral: dois campos** — avaliação escrita pela profissional + percepção do próprio paciente.
13. **Uso do relatório: entregar ao paciente + arquivo/prontuário dela.**
14. **Sempre ela** atende — não é preciso registrar "quem fez cada sessão".

### Decisões sobre fotos (brainstorming)

- **Uma versão só por foto**, comprimida no navegador **antes do upload**: alvo ~800px no lado maior / ~150 KB, com **compressão iterativa** (reduz qualidade em passos até ficar abaixo do teto). Piso de segurança: não abaixo de ~1000px / qualidade 50%; se ainda passar, aceita se < 400 KB, senão recusa com aviso.
- **Conversão HEIC→JPEG no navegador** (iPhone) antes de comprimir.
- O arquivo original **nunca sobe** — só o resultado comprimido.
- Uma foto de ~800px/~150 KB é nítida o suficiente para o relatório impresso e para arquivo. Com isso, o custo de armazenamento é baixo (~1,6 MB por tratamento de 15 sessões) e **não há rotina de "baixar tudo e limpar"** — o botão de remover fotos existe só para caso pontual (privacidade, liberar espaço).
- **Indicador de uso de armazenamento** numa tela de configuração, para a profissional acompanhar sozinha (ex.: "Fotos: 340 MB de 1 GB").

## Modelo de Dados

Novo módulo `src/modules/treatments/`. Migração `supabase/migrations/0011_treatments.sql`.

### Tabela `treatments`

```sql
create table treatments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  wound_types text not null,              -- tipos de ferida (texto livre)
  wound_details text,                     -- local no corpo, lado, aspecto (texto livre)
  treatment_type text,                    -- ex.: "ozonioterapia — bagging"
  started_on date not null,               -- definida pela profissional
  status text not null default 'em_andamento'
    check (status in ('em_andamento', 'concluido')),
  discharged_on date,                     -- preenchida ao concluir
  outcome text
    check (outcome in ('cicatrizacao', 'alta', 'abandono', 'encaminhamento')),
  professional_assessment text,           -- avaliação geral escrita pela profissional
  patient_perception text,                -- percepção relatada pelo paciente
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index treatments_account_contact_idx on treatments (account_id, contact_id);
```

- Sem "interrompido" como status: `abandono` e `encaminhamento` são valores de `outcome` com `status = 'concluido'`.
- Sem constraint de unicidade: mais de um tratamento `em_andamento` por paciente é permitido.
- Ao concluir: `status = 'concluido'`, `discharged_on` obrigatório (default hoje no form), `outcome` obrigatório.

### Coluna nova em `appointments`

```sql
alter table appointments
  add column treatment_id uuid references treatments(id) on delete set null;

create index appointments_treatment_idx on appointments (treatment_id);
```

`ON DELETE SET NULL`: excluir um tratamento **não** apaga o histórico dos agendamentos — só desvincula. Mesma filosofia do `deal_id` (vínculo fraco).

### Tabela `treatment_photos`

```sql
create table treatment_photos (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  treatment_id uuid not null references treatments(id) on delete cascade,
  storage_path text not null,            -- caminho no bucket 'treatment-photos'
  bytes integer not null,               -- tamanho do arquivo comprimido (para o indicador de uso)
  caption text,                          -- ex.: "Sessão 3"
  taken_on date,
  created_at timestamptz not null default now()
);

create index treatment_photos_treatment_idx on treatment_photos (treatment_id);
create index treatment_photos_account_idx on treatment_photos (account_id);
```

### Storage

Bucket **privado** `treatment-photos` (foto de ferida = dado de saúde; nunca URL pública):

```sql
insert into storage.buckets (id, name, public)
values ('treatment-photos', 'treatment-photos', false);
```

Objetos com caminho `{account_id}/{treatment_id}/{uuid}.jpg`. Política em `storage.objects` restringindo por prefixo de conta (mesma lógica de escopo das outras tabelas):

```sql
create policy "account members manage treatment photos"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'treatment-photos'
    and (storage.foldername(name))[1] in (
      select account_id::text from account_users where user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'treatment-photos'
    and (storage.foldername(name))[1] in (
      select account_id::text from account_users where user_id = auth.uid()
    )
  );
```

Acesso de leitura na aplicação: **signed URLs de curta duração** (ex.: 1 h) geradas no servidor ao montar a tela/relatório. Nunca `getPublicUrl`.

### RLS de `treatments` e `treatment_photos`

Mesmo padrão das tabelas existentes (`0004_scheduling.sql`): `enable row level security` + policy `for all to authenticated` com
`account_id in (select account_id from account_users where user_id = auth.uid())` em `using` e `with check`.

### Identidade profissional na conta (ver Decisões em Aberto #2)

O relatório precisa identificar a profissional (nome + registro no conselho). Proposta:

```sql
alter table accounts
  add column professional_name text,
  add column professional_council_id text;   -- ex.: "COREN-SP 123456"
```

Ambos nullable. Se ausentes, o relatório usa só `accounts.name` e mantém a linha de assinatura manual.

### Valores derivados (nunca armazenados)

- **Nº de sessões realizadas** = `count(appointments where treatment_id = t.id and status = 'concluido')`.
- **Duração** (só exibição no relatório) = `(discharged_on ?? hoje) − started_on`, formatada em semanas/dias.
- **Linha do tempo das sessões** = agendamentos `concluido` vinculados, ordenados por `starts_at`, com `starts_at` + `notes`.

## Módulo `treatments`

Estrutura espelhando os módulos existentes (`crm`, `scheduling`, `finance`): `types.ts`, `repository.ts`, `repository.supabase.ts`, `repository.memory.ts`, `service.ts`, `schemas.ts` + testes.

### `types.ts`

```ts
export type TreatmentStatus = "em_andamento" | "concluido";
export type WoundOutcome = "cicatrizacao" | "alta" | "abandono" | "encaminhamento";

export interface Treatment {
  id: string;
  accountId: string;
  contactId: string;
  woundTypes: string;
  woundDetails: string | null;
  treatmentType: string | null;
  startedOn: string;              // YYYY-MM-DD
  status: TreatmentStatus;
  dischargedOn: string | null;
  outcome: WoundOutcome | null;
  professionalAssessment: string | null;
  patientPerception: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TreatmentPhoto {
  id: string;
  treatmentId: string;
  storagePath: string;
  bytes: number;
  caption: string | null;
  takenOn: string | null;
  createdAt: string;
}

export interface TreatmentSession {           // projeção de um Appointment concluído
  appointmentId: string;
  date: string;                               // starts_at
  notes: string | null;
}

export interface TreatmentReport {
  treatment: Treatment;
  contact: { name: string; birthDate: string | null; cpf: string | null };
  professional: { clinicName: string; name: string | null; councilId: string | null };
  sessionCount: number;
  sessions: TreatmentSession[];
  photos: { url: string; caption: string | null; takenOn: string | null }[];  // url = signed URL
  generatedAt: string;
}
```

### `repository.ts`

```ts
export interface TreatmentsRepository {
  insertTreatment(accountId: string, input: {
    contactId: string; woundTypes: string; woundDetails?: string | null;
    treatmentType?: string | null; startedOn: string;
    professionalAssessment?: string | null; patientPerception?: string | null;
  }): Promise<Treatment>;
  updateTreatment(accountId: string, id: string, input: Partial<{
    woundTypes: string; woundDetails: string | null; treatmentType: string | null;
    startedOn: string; professionalAssessment: string | null; patientPerception: string | null;
  }>): Promise<Treatment>;
  concludeTreatment(accountId: string, id: string, input: {
    dischargedOn: string; outcome: WoundOutcome;
  }): Promise<Treatment>;
  getTreatment(accountId: string, id: string): Promise<Treatment | null>;
  listTreatmentsForContact(accountId: string, contactId: string): Promise<Treatment[]>;   // ordenado por started_on desc
  deleteTreatment(accountId: string, id: string): Promise<void>;

  insertPhoto(accountId: string, input: {
    treatmentId: string; storagePath: string; bytes: number;
    caption?: string | null; takenOn?: string | null;
  }): Promise<TreatmentPhoto>;
  listPhotos(accountId: string, treatmentId: string): Promise<TreatmentPhoto[]>;
  getPhoto(accountId: string, photoId: string): Promise<TreatmentPhoto | null>;
  deletePhoto(accountId: string, photoId: string): Promise<void>;
  sumPhotoBytes(accountId: string): Promise<number>;
}
```

A contagem e a lista de sessões **não** ficam neste repositório — pertencem a `scheduling` (dono de `appointments`). Ver abaixo.

### `service.ts`

- `createTreatment(repo, accountId, rawInput)` — valida com Zod, insere.
- `updateTreatment(repo, accountId, id, rawInput)` — valida, atualiza campos editáveis.
- `concludeTreatment(repo, accountId, id, rawInput)` — exige `outcome` válido e `dischargedOn`; rejeita se já `concluido`.
- `assembleReport(treatmentsRepo, schedulingRepo, storage, accountRepo, accountId, treatmentId)` — compõe `TreatmentReport`: busca o tratamento, `schedulingRepo.countConcludedAppointmentsByTreatment` + `listConcludedAppointmentsByTreatment`, `listPhotos` + gera signed URLs, dados do contato e identidade profissional da conta. Calcula `generatedAt`.

### `schemas.ts`

Zod para create / update / conclude. `woundTypes` obrigatório (min 1). `startedOn` / `dischargedOn` como `YYYY-MM-DD`. `outcome` como `z.enum([...])`. Textos com `max` generoso (ex.: 5000).

## Mudanças no módulo `scheduling`

- `Appointment` ganha `treatmentId: string | null`; `toAppointment` mapeia `treatment_id`.
- `SchedulingRepository.insertAppointment` input ganha `treatmentId?: string | null` (default `null`).
- Novo `updateAppointmentTreatment(accountId, appointmentId, treatmentId: string | null): Promise<Appointment>`.
- Novo `countConcludedAppointmentsByTreatment(accountId, treatmentId): Promise<number>`.
- Novo `listConcludedAppointmentsByTreatment(accountId, treatmentId): Promise<Appointment[]>` (ordenado por `starts_at`).
- `repository.supabase.ts` e `repository.memory.ts` implementam os três.

Serviço de scheduling: função fina `linkAppointmentToTreatment(schedulingRepo, treatmentsRepo, accountId, appointmentId, treatmentId | null)` que valida que o agendamento e o tratamento são da **mesma conta e do mesmo contato** antes de gravar.

## Server Actions

Novo `src/app/(app)/pacientes/[id]/actions.ts`:

- `listTreatmentsAction(contactId)`
- `createTreatmentAction(input)` → `revalidatePath("/pacientes/[id]", "page")`
- `updateTreatmentAction(id, input)`
- `concludeTreatmentAction(id, { dischargedOn, outcome })`
- `deleteTreatmentAction(id)` — antes de apagar a linha, remove os objetos do Storage do tratamento (lista `listPhotos`, `storage.remove`).
- `getTreatmentReportAction(treatmentId)` → `TreatmentReport` (com signed URLs).
- `uploadTreatmentPhotoAction(treatmentId, formData)` — recebe o Blob **já comprimido**; revalida no servidor: `type` começa com `image/`, `size <= 400 KB`; grava em `treatment-photos/{accountId}/{treatmentId}/{uuid}.jpg` com o client autenticado; insere `treatment_photos` com `bytes`.
- `deleteTreatmentPhotoAction(photoId)` — remove objeto do Storage + linha.
- `updatePhotoMetaAction(photoId, { caption, takenOn })`.
- `getPhotoStorageUsageAction()` → `{ bytes: number }` (via `sumPhotoBytes`).

Novo `src/app/(app)/agenda/actions.ts` (adicionar):

- `linkAppointmentToTreatmentAction(appointmentId, treatmentId | null)`.
- `listTreatmentsForContactAction(contactId)` — para popular o seletor no diálogo de agendamento.

Padrão idêntico ao existente: `"use server"`, helper que monta repo + `accountId` a partir de `createServerSupabaseClient()` / `getCurrentAccountId`, chama o serviço, `revalidatePath`.

## UI / Rotas

### `/pacientes/[id]` — nova página de detalhe do paciente

Hoje a tela `/pacientes` é uma tabela cujas linhas abrem um **diálogo de edição** (`PatientsClient` → `PatientFormDialog`). Mudança: o clique no nome passa a **navegar** para `/pacientes/[id]`. O diálogo de edição continua existindo, acionado por um botão "Editar dados" dentro da página.

Conteúdo da página:

- **Dados do paciente** (nome, telefone, e-mail, idade, CPF…) + botão "Editar dados" (reusa `PatientFormDialog`).
- **Tratamentos** — lista, cada item rotulado `"Tratamento iniciado em DD/MM/AAAA — {tipos de ferida}"` + badge de status (Em andamento / Concluído). Botão "Novo tratamento" abre formulário (campos: tipos de ferida com os 5 tipos conhecidos como sugestões clicáveis + texto livre; detalhes da ferida; tipo de tratamento; data de início com default hoje; avaliação; percepção). Clicar num tratamento → `/pacientes/[id]/tratamentos/[treatmentId]`.

### `/pacientes/[id]/tratamentos/[treatmentId]` — detalhe do tratamento

- Cabeçalho: tipos de ferida, tipo de tratamento, data de início, status.
- Campos editáveis (inline ou diálogo): tipos de ferida, detalhes, tipo de tratamento, avaliação da profissional, percepção do paciente. Botão "Salvar".
- **"Concluir tratamento"** → diálogo com `outcome` (rádio: cicatrização / alta / abandono / encaminhamento) + `dischargedOn` (default hoje). Depois de concluído, some o botão e aparece a data + desfecho; ainda editável via "Reabrir" (opcional — ver Decisões em Aberto? não: manter simples, sem reabrir; correção só por suporte).
- **Sessões**: contador ("8 sessões realizadas") + lista dos agendamentos `concluido` vinculados (data + trecho das notas), cada linha com link para abrir na Agenda. Somente leitura.
- **Fotos**: grade de miniaturas (signed URLs). Botão "Adicionar foto" dispara o pipeline de compressão (ver abaixo) e o upload. Cada foto tem legenda + data editáveis e botão remover.
- **"Imprimir relatório"** → navega para `/pacientes/[id]/tratamentos/[treatmentId]/relatorio`.

### `/pacientes/[id]/tratamentos/[treatmentId]/relatorio` — página de impressão

Rota dedicada (server component) que monta o `TreatmentReport` e renderiza um layout otimizado para papel. `window.print()` disparado por um botão "Imprimir / Salvar PDF" (e opcionalmente no `onload`). Sidebar e botões com `print:hidden`; `@page { margin: … }` em `globals.css`.

Conteúdo:

1. **Cabeçalho**: nome da clínica + nome e registro da profissional (ou só o nome da clínica se os campos não existirem) + nome do paciente (+ idade/CPF se preenchidos) + data/hora de geração.
2. **Dados do tratamento**: tipos de ferida; detalhes (local/lado/aspecto); tipo de tratamento; data de início; data de alta **ou** "Em andamento"; duração ("6 semanas"); nº de sessões realizadas; desfecho.
3. **Avaliação da profissional** (texto).
4. **Percepção do paciente** (texto).
5. **Linha do tempo das sessões**: tabela data + anotação. Um checkbox "ocultar detalhe das sessões" (só na tela, `print:hidden`) permite imprimir só o resumo — atende ao "resumo + opção de detalhar".
6. **Fotos**: grade 2–3 por linha com legenda/data; `break-inside: avoid` para não cortar foto entre páginas.
7. **Rodapé**: linha "Assinatura: __________  {nome} — {registro}". (Assinatura eletrônica é a Feature 2.)

Signed URLs das fotos geradas no servidor no momento do render, validade ~1 h (tempo de sobra para imprimir).

### Diálogo de agendamento (`src/components/agenda/appointment-dialog.tsx`)

No ramo `editingAppointment` (contato/procedimento já não são editáveis ali hoje):

- Novo `<Select>` "Tratamento" listando os tratamentos daquele paciente (`listTreatmentsForContactAction`), ativos primeiro, incluindo a opção "— Nenhum —". Valor = `treatment_id` atual. `onChange` → `linkAppointmentToTreatmentAction`.
- Em `handleStatusChange`: quando o status vira `concluido`, o paciente tem **exatamente um** tratamento `em_andamento` e o agendamento ainda **não** está vinculado, abrir um diálogo curto "Vincular esta sessão ao tratamento em andamento?" (espelha `RevenueSuggestionDialog`: componente novo `TreatmentLinkSuggestionDialog`). A sugestão de receita e a de vínculo podem aparecer em sequência.

### Menu

Sem item novo no menu lateral — tratamentos são acessados pelo paciente. O **indicador de armazenamento** e os **campos de identidade profissional** vão numa página nova `/configuracoes` (grupo "Clínica" no `sidebar.tsx`), se a Decisão em Aberto #2 for aprovada. Caso contrário, o indicador vai no topo da tela `/pacientes`.

## Pipeline de Compressão de Fotos (cliente)

Dependências novas (client-only): `browser-image-compression` (~15 KB) e `heic2any` (fallback HEIC).

Função `prepareTreatmentPhoto(file: File): Promise<Blob>` em `src/components/treatments/prepare-photo.ts`:

1. Rejeita cedo: `!file.type.startsWith("image/")` **e** extensão não-HEIC → erro "arquivo não é uma imagem"; `file.size > 25 * 1024 * 1024` → erro "imagem muito grande".
2. Se HEIC/HEIF (por `type` ou extensão) → `heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 })`. Se falhar → erro "não foi possível processar esta foto; exporte como JPEG e tente de novo".
3. `imageCompression(jpeg, { maxWidthOrHeight: 800, maxSizeMB: 0.2, initialQuality: 0.8, useWebWorker: true })`. A lib reduz a qualidade em passos internamente até atingir `maxSizeMB` ou o piso.
4. Se o resultado ainda > 400 KB → erro "não foi possível reduzir esta foto o suficiente".
5. Retorna o `Blob` (JPEG). Só ele é enviado via `uploadTreatmentPhotoAction`.

O `uploadTreatmentPhotoAction` revalida `size <= 400 KB` e `type` no servidor (defesa em profundidade).

**Cloudflare Workers**: o Blob (~150 KB) trafega no payload da server action — muito abaixo do limite de corpo de requisição do Workers. A geração de signed URL é uma chamada Supabase no servidor, sem custo de CPU relevante. Nenhuma infraestrutura nova além do bucket de Storage. Nenhuma mudança de plano do Cloudflare.

**Supabase**: por capacidade, o plano grátis (500 MB de banco, 1 GB de Storage) comporta anos de uso neste volume. Recomenda-se o plano Pro (backup diário automático; o grátis não faz backup) por causa do valor legal do prontuário — decisão de operação, não bloqueia a implementação.

## Casos de Borda

- **Tratamento sem sessões concluídas**: nº de sessões = 0; duração calculada de `started_on`. Relatório continua válido.
- **Tratamento em andamento no relatório**: campo "fim" mostra "Em andamento"; duração calculada até hoje.
- **Excluir tratamento com sessões vinculadas**: permitido. As sessões têm `treatment_id` zerado (`ON DELETE SET NULL`); o histórico dos agendamentos permanece. O diálogo de confirmação avisa: "N sessões deixarão de estar vinculadas".
- **Excluir paciente** (hoje já é cascade no CRM): `treatments` e `treatment_photos` caem por `ON DELETE CASCADE`, mas os **objetos no Storage não**. A server action de exclusão de paciente (`deletePatientAction` em `src/app/(app)/pacientes/actions.ts`) passa a, antes de excluir, listar os tratamentos do paciente e remover os objetos `treatment-photos/{accountId}/...` correspondentes.
- **Falha de conversão HEIC** ou **compressão não atinge o teto**: mensagens específicas no pipeline (acima). O upload não acontece.
- **Storage perto do limite**: o indicador fica em vermelho acima de 80%. Não bloqueia upload — a profissional gerencia.
- **Concluir um tratamento já concluído**: `concludeTreatment` rejeita.
- **Sugestão de vínculo com múltiplos tratamentos ativos**: não sugere automaticamente (ambíguo) — ela escolhe no `<Select>` do diálogo de agendamento.
- **Signed URL expirada ao imprimir muito depois de abrir a página**: recarregar a página regenera as URLs. Validade de 1 h cobre o uso normal.
- **Dois profissionais atendendo**: fora de escopo (confirmado: sempre ela). O relatório assume uma identidade profissional por conta.

## Decisões de Teste (Vitest)

Comportamento externo, seguindo o padrão do projeto (`repository.memory` espelha o Supabase):

- **`treatments/service.test.ts`**
  - `createTreatment` persiste todos os campos; `woundTypes` vazio é rejeitado.
  - `concludeTreatment` exige `outcome` válido e `dischargedOn`; seta `status = 'concluido'`; rejeita segunda conclusão.
  - `assembleReport`: `sessionCount` conta só agendamentos `concluido` vinculados àquele tratamento (escopo por `accountId`); `sessions` vem ordenado por data; duração = `(dischargedOn ?? hoje) − startedOn`; tratamento em andamento não quebra o cálculo.
- **`scheduling` (repo + serviço)**
  - `insertAppointment` aceita e persiste `treatmentId`; omitido → `null`.
  - `updateAppointmentTreatment` altera o vínculo; `countConcludedAppointmentsByTreatment` e `listConcludedAppointmentsByTreatment` filtram por status e por tratamento, escopados por conta.
  - `linkAppointmentToTreatment` rejeita quando o agendamento e o tratamento pertencem a contatos/contas diferentes.
- **Pipeline de foto**: função pura que decide aceitar/recusar pelo tamanho final (sem canvas) — recusa acima de 400 KB, aceita abaixo. O restante (canvas/HEIC/web worker) é verificação manual.
- **Verificação manual**: imprimir a rota de relatório e conferir que sidebar/botões somem, que cabeçalho, resumo, sessões e fotos aparecem legíveis, e que fotos não são cortadas entre páginas.

## Fora de Escopo

- **Feature 2 — assinatura eletrônica dos termos de consentimento** (doc próprio).
- **Medição da ferida ao longo do tempo** (comprimento × largura × profundidade) — pendente de confirmação; hoje fora.
- **Múltiplos profissionais** / registrar quem fez cada sessão.
- **Vincular tratamento no wizard `/agendamento`** e no **autoagendamento público `/agendar/[accountId]`** (público não tem contexto clínico).
- **Geração de PDF no servidor** (inviável no runtime Cloudflare Workers).
- **Rotina automática de limpeza de fotos** / lembrete de retenção.
- **Relatório consolidado de vários tratamentos** num único documento — o relatório é por tratamento.
- **Editar o conteúdo do relatório antes de imprimir**, além do toggle "ocultar detalhe das sessões".
- **Reabrir um tratamento concluído** pela UI — correção só via suporte/banco.

## Decisões em Aberto

1. **Medidas da ferida ao longo do tempo** — confirmar com a profissional se quer registrar (hoje: fora de escopo). Se sim, vira uma tabela `treatment_measurements` (data + dimensões) e um mini-gráfico/tabela no relatório — incremento isolado, não altera o resto do design.
2. **Identidade profissional na conta** (`professional_name`, `professional_council_id`) + página `/configuracoes` para esses campos e para o indicador de armazenamento — confirmar se entra agora. O relatório precisa identificar a profissional; sem os campos, usa só `accounts.name` e mantém a linha de assinatura manual.
3. **Feature 2 (assinatura eletrônica dos termos)**: plataforma externa (ZapSign/Autentique/Clicksign) vs. construir no app vs. comparar plataformas primeiro. Recomendação atual: plataforma externa, pela exigência de risco jurídico mínimo. Tratada em doc separado.
