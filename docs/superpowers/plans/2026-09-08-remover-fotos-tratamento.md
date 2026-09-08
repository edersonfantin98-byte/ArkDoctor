# Remover fotos de feridas/atendimento — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover por completo a funcionalidade de fotos de evolução dos tratamentos (upload, armazenamento, exibição, relatório e o painel de uso de armazenamento), sem tocar no resto da feature de Tratamento.

**Architecture:** Remoção em duas frentes independentes. (1) Código: apaga os 3 arquivos exclusivos de foto e retira as referências a foto de ~13 arquivos (camada de dados → server actions → páginas → UI → CSP → deps), num único commit atômico, verificado por `tsc` + `vitest` + `next build` + `eslint`. (2) Banco: migração nova que dropa a tabela `treatment_photos`, remove o bucket privado `treatment-photos` (objetos + policy + bucket), aplicada só em dev agora — em produção só depois do deploy do código.

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript, Vitest, Supabase (Postgres + Storage), Tailwind.

**Spec:** Design aprovado em chat em 2026-09-08 (resumido na seção "Contexto" abaixo). Decisões fechadas com o usuário: (a) dropar tabela + bucket + fotos existentes; (b) escopo = só fotos, resto de Tratamento/Relatório intacto.

## Global Constraints

- **Respostas e mensagens de UI em pt-BR.** Nada de inglês em texto visível.
- **Mudanças cirúrgicas:** tocar só no que é foto. Não "melhorar" código adjacente, não refatorar o que não está quebrado, seguir o estilo existente. Cada linha alterada tem que rastrear para "remover fotos".
- **Remover órfãos que a remoção criar** (imports, consts, tipos que ficaram sem uso). Não remover código morto pré-existente não relacionado.
- **Deploy está congelado** (Worker > 3 MiB, plano Free Cloudflare) — o commit do código entra em `main` local e **não é pushado**. A migração é aplicada **só em dev**. Ver [[arkdoctor_deploy_readiness]] e [[dogfood_correcoes_status]].
- **Verificação por evidência:** cada task termina com os comandos de verificação rodados e a saída conferida antes do commit. Baseline atual: **358 testes, 34 arquivos** verdes; `tsc` limpo; `next build` limpo.

---

## Contexto — o que existe hoje (para quem não tem contexto)

A feature "Tratamento + Relatório clínico" (migração `0011_treatments.sql`) tem uma parte de **fotos de evolução da ferida**:

- **Tabela `treatment_photos`** (`storage_path`, `bytes`, `caption`, `taken_on`) + índices + RLS por `account_id`.
- **Bucket privado `treatment-photos`** no Supabase Storage, com policy `"account members manage treatment photo objects"` em `storage.objects` (prefixo = `account_id`).
- **Processamento no cliente** (`src/components/treatments/prepare-photo.ts`): valida (imagem, ≤ 25 MB), converte HEIC de iPhone → JPEG via `heic-to/csp` num Web Worker, comprime para ≤ 400 KB com `browser-image-compression`.
- **UI** (`src/components/treatments/treatment-photos.tsx`): grade de fotos no detalhe do tratamento; adicionar/remover/editar legenda e data.
- **4 server actions** em `src/app/(app)/pacientes/[id]/actions.ts`: `listTreatmentPhotosAction`, `uploadTreatmentPhotoAction`, `updatePhotoMetaAction`, `deleteTreatmentPhotoAction`.
- **Relatório clínico** (`src/components/treatments/treatment-report-view.tsx`): uma `<section>` "Fotos".
- **Configurações** (`src/components/settings/settings-client.tsx`): card "Armazenamento de fotos" com `Meter` (limite 1 GB), alimentado por `treatmentsRepo.sumPhotoBytes()` em `src/app/(app)/configuracoes/actions.ts`.
- **CSP** (`src/middleware.ts`): a linha `worker-src 'self' blob:` foi adicionada **exclusivamente** para o Web Worker do `heic-to/csp` (confirmado: `grep -rniE "new Worker|Worker\(" src/` → vazio).
- **Deps** (`package.json`): `browser-image-compression`, `heic-to` — usadas **só** em `prepare-photo.ts`/`.test.ts`.

O que **NÃO muda:** entidade `treatments`, `updateTreatment`, `concludeTreatment`, sessões, o relatório (menos a seção de fotos), o vínculo `appointments.treatment_id`, os campos `professional_name`/`professional_council_id` em `accounts`.

---

## Estrutura de arquivos

**Apagados por inteiro (3):**
- `src/components/treatments/prepare-photo.ts`
- `src/components/treatments/prepare-photo.test.ts`
- `src/components/treatments/treatment-photos.tsx`

**Criado (1):**
- `supabase/migrations/0017_drop_treatment_photos.sql` — dropa tabela + bucket + policy de storage. (Se o número `0017` já tiver sido usado por outra migração ao executar, usar o próximo livre.)

**Editados — retirar só o que é foto (13):**
| Arquivo | O que sai |
|---|---|
| `src/modules/treatments/types.ts` | `interface TreatmentPhoto`; campo `photos` de `TreatmentReport` e `AssembleReportInput` |
| `src/modules/treatments/schemas.ts` | `updatePhotoMetaInputSchema` + `UpdatePhotoMetaInput` |
| `src/modules/treatments/repository.ts` | import `TreatmentPhoto`; 6 assinaturas: `insertPhoto`, `listPhotos`, `getPhoto`, `updatePhotoMeta`, `deletePhoto`, `sumPhotoBytes` |
| `src/modules/treatments/repository.supabase.ts` | import `TreatmentPhoto`; `toPhoto`; as 6 implementações |
| `src/modules/treatments/repository.memory.ts` | import `TreatmentPhoto`; store interno de fotos; as 6 implementações |
| `src/modules/treatments/repository.memory.test.ts` | blocos de teste de foto |
| `src/modules/treatments/service.ts` | import `updatePhotoMetaInputSchema`; import `TreatmentPhoto`; função `updatePhotoMeta`; linha `photos: input.photos` em `assembleReport` |
| `src/modules/treatments/service.test.ts` | `photos` na fixture do relatório + asserção |
| `src/app/(app)/pacientes/[id]/actions.ts` | import `MAX_OUTPUT_BYTES`; const `BUCKET`; as 4 actions de foto; bloco de storage em `deleteTreatmentAction`; `photos` em `getTreatmentReportDataAction` (Promise.all + arg do `assembleReport`) |
| `src/app/(app)/pacientes/[id]/tratamentos/[treatmentId]/page.tsx` | import + chamada de `listTreatmentPhotosAction`; prop `photos` |
| `src/components/treatments/treatment-detail-client.tsx` | import `TreatmentPhotos`; prop `photos` (+ tipo); o `<Card>` "Fotos da evolução" |
| `src/components/treatments/treatment-report-view.tsx` | a `<section>` `{report.photos.length > 0 && (...)}` |
| `src/app/(app)/configuracoes/actions.ts` | import `createSupabaseTreatmentsRepository`; `treatmentsRepo`; `sumPhotoBytes`; `storageBytes` no retorno |
| `src/components/settings/settings-client.tsx` | import `Meter`; const `GB`; `storageBytes` no tipo `initial`; `usedMb`/`usedPct`/`nearLimit`; o `<Card>` "Armazenamento de fotos" |
| `src/app/(app)/configuracoes/page.tsx` | trecho "e uso de armazenamento" / "uso de armazenamento" da `description` do `PageHeader` |
| `src/lib/supabase/database.types.ts` | bloco `treatment_photos: { ... }` (≈ linhas 559–605) |
| `src/middleware.ts` | linha `"worker-src 'self' blob:"` + comentário acima dela |
| `package.json` | deps `browser-image-compression` e `heic-to` |

(São 17 no total contando os 4 últimos utilitários; a tabela lista todos.)

---

## Task 1: Remover a feature de fotos do código

Remoção atômica em um único commit — um revisor não consegue aprovar "removido de `repository.ts`" e rejeitar "removido de `actions.ts`" sem deixar o `tsc` quebrado. Por isso é uma task só, com verificação no fim.

**Files:** ver a tabela da seção "Estrutura de arquivos". Nenhum arquivo novo nesta task.

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `TreatmentsRepository` sem os 6 métodos de foto; `TreatmentReport`/`AssembleReportInput` sem `photos`; `getClinicSettingsAction()` retornando `{ name, professionalName, councilId }` (sem `storageBytes`). A Task 2 não depende de nomes daqui.

- [ ] **Step 1: Apagar os 3 arquivos exclusivos de foto**

```bash
git rm src/components/treatments/prepare-photo.ts \
       src/components/treatments/prepare-photo.test.ts \
       src/components/treatments/treatment-photos.tsx
```

- [ ] **Step 2: `src/modules/treatments/types.ts` — remover tipos de foto**

- Apagar a `interface TreatmentPhoto { ... }` inteira (bloco `id`/`accountId`/`treatmentId`/`storagePath`/`bytes`/`caption`/`takenOn`/`createdAt`).
- Em `interface TreatmentReport`: apagar a linha
  `photos: { url: string; caption: string | null; takenOn: string | null }[];`
- Em `interface AssembleReportInput`: apagar a linha
  `photos: { url: string; caption: string | null; takenOn: string | null }[];`

- [ ] **Step 3: `src/modules/treatments/schemas.ts` — remover schema de meta da foto**

Apagar:
```ts
export const updatePhotoMetaInputSchema = z.object({
  caption: z.string().trim().max(500).nullable(),
  takenOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});
export type UpdatePhotoMetaInput = z.infer<typeof updatePhotoMetaInputSchema>;
```
(As linhas exatas podem diferir levemente; remover a `const` e o `type` de `updatePhotoMetaInputSchema`.)

- [ ] **Step 4: `src/modules/treatments/repository.ts` — remover 6 assinaturas**

- No import do topo: `import type { Treatment, TreatmentPhoto, WoundOutcome } from "./types";` → `import type { Treatment, WoundOutcome } from "./types";`
- Apagar da interface `TreatmentsRepository` os 6 membros: `insertPhoto(...)`, `listPhotos(...)`, `getPhoto(...)`, `updatePhotoMeta(...)`, `deletePhoto(...)`, `sumPhotoBytes(...)` — do `insertPhoto(` até o `sumPhotoBytes(accountId: string): Promise<number>;` inclusive.

- [ ] **Step 5: `src/modules/treatments/repository.supabase.ts` — remover implementações**

- No import: remover `TreatmentPhoto` de `import type { Treatment, TreatmentPhoto, TreatmentStatus, WoundOutcome } from "./types";`
- Apagar a função helper `function toPhoto(row: Database["public"]["Tables"]["treatment_photos"]["Row"]): TreatmentPhoto { ... }`.
- Apagar os 6 métodos do objeto retornado: `async insertPhoto(...)`, `async listPhotos(...)`, `async getPhoto(...)`, `async updatePhotoMeta(...)`, `async deletePhoto(...)`, `async sumPhotoBytes(...)`.

- [ ] **Step 6: `src/modules/treatments/repository.memory.ts` — remover implementações**

- Remover `TreatmentPhoto` do import de `./types`.
- Remover o array/Map interno que guarda as fotos (ex.: `const photos: TreatmentPhoto[] = [];` ou similar) e qualquer contador de id de foto.
- Apagar os 6 métodos `insertPhoto`/`listPhotos`/`getPhoto`/`updatePhotoMeta`/`deletePhoto`/`sumPhotoBytes` do objeto retornado.

- [ ] **Step 7: `src/modules/treatments/repository.memory.test.ts` — remover testes de foto**

Apagar os `describe(...)`/`it(...)` que exercitam `insertPhoto`, `listPhotos`, `getPhoto`, `updatePhotoMeta`, `deletePhoto`, `sumPhotoBytes`. Se algum `beforeEach`/helper ficar sem uso depois disso, remover também.

- [ ] **Step 8: `src/modules/treatments/service.ts` — remover `updatePhotoMeta` e `photos` do relatório**

- Import de `./schemas`: remover `updatePhotoMetaInputSchema` da lista.
- Import de `./types`: remover `TreatmentPhoto` de `import type { AssembleReportInput, Treatment, TreatmentPhoto, TreatmentReport } from "./types";`
- Apagar a função `export async function updatePhotoMeta(repo, accountId, photoId, rawInput) { ... }` inteira.
- Em `assembleReport`, no objeto retornado, apagar a linha `photos: input.photos,`.

- [ ] **Step 9: `src/modules/treatments/service.test.ts` — remover foto da fixture do relatório**

- Remover a linha `photos: [{ url: "https://signed/x", caption: "Sessão 1", takenOn: "2026-08-03" }],` do input do `assembleReport`.
- Remover qualquer `expect(...).photos...` correspondente.

- [ ] **Step 10: `src/app/(app)/pacientes/[id]/actions.ts` — remover 4 actions e refs a foto**

- Remover o import `import { MAX_OUTPUT_BYTES } from "@/components/treatments/prepare-photo";`
- Remover a const `const BUCKET = "treatment-photos";` (manter `SIGNED_URL_TTL`, `CONSENT_BUCKET`, etc. — usados por consentimentos).
- Apagar por inteiro: `listTreatmentPhotosAction`, `uploadTreatmentPhotoAction`, `updatePhotoMetaAction`, `deleteTreatmentPhotoAction`.
- Em `deleteTreatmentAction`: remover o bloco
  ```ts
  const photos = await c.treatmentsRepo.listPhotos(c.accountId, treatmentId);
  if (photos.length > 0) {
    const { error } = await c.supabase.storage.from(BUCKET).remove(photos.map((p) => p.storagePath));
    if (error) { console.error(...); throw new Error("Não foi possível remover as fotos do armazenamento. Tente novamente."); }
  }
  ```
  A função fica: `ownedTreatment` → `treatments.deleteTreatment(...)` → `revalidatePath(...)`.
- Em `getTreatmentReportDataAction`: tirar `listTreatmentPhotosAction(treatmentId)` do `Promise.all` e o `photos` da desestruturação; remover a linha `photos: photos.map((p) => ({ url: p.url, caption: p.caption, takenOn: p.takenOn })),` do argumento de `assembleReport`. Ajustar o `Promise.all` para 3 itens (`contact`, `identity`, `sessionsData`).

- [ ] **Step 11: `src/app/(app)/pacientes/[id]/tratamentos/[treatmentId]/page.tsx` — remover carga de fotos**

- No import de `actions`, tirar `listTreatmentPhotosAction`.
- Trocar `const [sessionsData, photos] = await Promise.all([ listTreatmentSessionsAction(treatmentId), listTreatmentPhotosAction(treatmentId) ]);` por
  `const sessionsData = await listTreatmentSessionsAction(treatmentId);`
- No `<TreatmentDetailClient ... />`, remover a prop `photos={photos}`.

- [ ] **Step 12: `src/components/treatments/treatment-detail-client.tsx` — remover card de fotos**

- Remover `import { TreatmentPhotos } from "./treatment-photos";`
- Nas props do componente: remover `photos` do objeto desestruturado e a linha de tipo
  `photos: { id: string; url: string; caption: string | null; takenOn: string | null }[];`
- Apagar o bloco JSX inteiro:
  ```tsx
  <div className="px-6">
    <Card>
      <CardHeader><CardTitle>Fotos da evolução</CardTitle></CardHeader>
      <CardContent><TreatmentPhotos treatmentId={treatment.id} initialPhotos={photos} /></CardContent>
    </Card>
  </div>
  ```
- Se `CardHeader`/`CardTitle` ficarem sem uso no arquivo, remover do import de `@/components/ui/card`. (Conferir: o card "Sessões realizadas" ainda usa os dois — provavelmente permanecem.)

- [ ] **Step 13: `src/components/treatments/treatment-report-view.tsx` — remover seção Fotos**

Apagar o bloco:
```tsx
{report.photos.length > 0 && (
  <section className="space-y-2">
    <h2 className="font-semibold">Fotos</h2>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {report.photos.map((p, i) => ( ... ))}
    </div>
  </section>
)}
```
Se a função `formatDate` ficar sem uso depois, conferir com o `tsc`/`eslint` e remover só se realmente órfã (ela pode ser usada em outras seções — provavelmente permanece).

- [ ] **Step 14: `src/app/(app)/configuracoes/actions.ts` — parar de somar bytes de foto**

- Remover `import { createSupabaseTreatmentsRepository } from "@/modules/treatments/repository.supabase";`
- Em `getClinicSettingsAction`: remover `const treatmentsRepo = createSupabaseTreatmentsRepository(supabase);` e `const storageBytes = await treatmentsRepo.sumPhotoBytes(accountId);`
- `return { ...identity, storageBytes };` → `return identity;`

- [ ] **Step 15: `src/components/settings/settings-client.tsx` — remover card de armazenamento**

- Remover `import { Meter } from "@/components/ui/meter";`
- Remover `const GB = 1024 * 1024 * 1024;`
- No tipo de `initial`: remover `storageBytes: number;` (fica `professionalName`, `councilId`).
- Remover `const usedMb = ...;`, `const usedPct = ...;`, `const nearLimit = ...;`
- Apagar o `<Card>` inteiro do "Armazenamento de fotos" (do `<Card>` que contém `<CardTitle>Armazenamento de fotos</CardTitle>` até o `</Card>` correspondente).
- Deixar o comentário `{/* TODO card Conta: ... */}` como está, **mas** ajustar a menção a `storageBytes` nele para não citar um campo que não existe mais: trocar `professionalName/councilId/storageBytes` por `professionalName/councilId`.

- [ ] **Step 16: `src/app/(app)/configuracoes/page.tsx` — ajustar a descrição**

- `description="Identidade profissional e uso de armazenamento."` → `description="Identidade profissional."`

- [ ] **Step 17: `src/lib/supabase/database.types.ts` — remover o tipo da tabela**

Apagar o bloco `treatment_photos: { Row: {...}; Insert: {...}; Update: {...}; Relationships: [...] }` inteiro (≈ linhas 559–605). Conferir que a vírgula/estrutura do objeto `Tables` continua válida (a chave seguinte, provavelmente `treatments:`, deve ficar bem formada).

- [ ] **Step 18: `src/middleware.ts` — apertar o CSP de volta**

Remover as duas linhas:
```ts
    // heic-to/csp converte foto de iPhone (HEIC) num Web Worker criado via blob:
    "worker-src 'self' blob:",
```
(Sem outra fonte de Worker no app, `worker-src` volta a herdar de `default-src 'self'`.)

- [ ] **Step 19: `package.json` — remover deps**

Remover as linhas `"browser-image-compression": "...",` e `"heic-to": "...",` de `dependencies`. Depois:
```bash
npm install
```
Espera-se: `package-lock.json` atualizado, sem erro (as libs saem da árvore).

- [ ] **Step 20: Verificar tipos**

```bash
npx tsc --noEmit
```
Esperado: **sem erros.** Se aparecer "Cannot find name / module" referente a foto, é órfão que passou — voltar e limpar.

- [ ] **Step 21: Rodar a suíte**

```bash
npm test -- --run
```
Esperado: **verde.** Contagem cai (~15 testes de foto a menos → ~343 testes; arquivos: 34 → 33 por causa do `prepare-photo.test.ts` removido). Nenhum teste **falhando**; só a contagem menor.

- [ ] **Step 22: Build de produção**

```bash
npm run build
```
Esperado: **compila sem erro.** As rotas `/pacientes/[id]/tratamentos/[treatmentId]` e `/configuracoes` continuam no output.

- [ ] **Step 23: Lint**

```bash
npm run lint
```
Esperado: sem **novos** erros/warnings além dos 4 pré-existentes já conhecidos (fora dos arquivos tocados).

- [ ] **Step 24: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(tratamentos): remove fotos de evolução da ferida

Remove upload/armazenamento/exibição de fotos dos tratamentos e o painel
de uso de armazenamento em Configurações. Tira as libs browser-image-compression
e heic-to e a diretiva worker-src do CSP (só o HEIC as usava). A tabela
treatment_photos e o bucket são dropados na migração 0017.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vYVZNNSMsBDJp1x9mh9tL
EOF
)"
```

---

## Task 2: Migração `0017` — dropar tabela e bucket

**Files:**
- Create: `supabase/migrations/0017_drop_treatment_photos.sql`

**Interfaces:**
- Consumes: nada (independe da Task 1 no nível de código; mas só aplicar em prod **depois** do deploy da Task 1).
- Produces: schema sem `treatment_photos`, sem bucket `treatment-photos`.

- [ ] **Step 1: Escrever a migração**

Criar `supabase/migrations/0017_drop_treatment_photos.sql` com:

```sql
-- Remove a funcionalidade de fotos de evolução dos tratamentos:
-- tabela treatment_photos + bucket privado treatment-photos (objetos + policy).
-- O código que lia isso saiu no commit "feat(tratamentos): remove fotos de evolução da ferida".

drop table if exists treatment_photos;

drop policy if exists "account members manage treatment photo objects" on storage.objects;

delete from storage.objects where bucket_id = 'treatment-photos';

delete from storage.buckets where id = 'treatment-photos';
```

Notas:
- `drop table` já leva junto os índices (`treatment_photos_treatment_idx`, `treatment_photos_account_idx`) e a policy `"account members can manage treatment_photos"` da própria tabela.
- A ordem importa: objetos antes do bucket (FK `storage.objects.bucket_id → storage.buckets.id`).
- Se `0017` já existir no diretório quando esta task rodar, renomear para o próximo número livre e ajustar o texto.

- [ ] **Step 2: Aplicar em dev**

```bash
npx supabase db push
```
Esperado: aplica `0017` sem erro. `npx supabase migration list` mostra `0017` como aplicada (local/linked de dev).

> ⚠️ **Não aplicar em produção agora.** Produção ainda roda o código com fotos (deploy congelado). A ordem em prod, quando o Cloudflare for atualizado: `git push origin main` → deploy conclui → **depois** `npx supabase db push`. Anotar isso em [[dogfood_correcoes_status]] / [[arkdoctor_deploy_readiness]].

- [ ] **Step 3: Smoke test no dev**

`npm run dev` e conferir, logado como `silvana@arkdoctor.com`:
- Abrir um tratamento existente (ex.: paciente Ana) → a página carrega, **sem** o card "Fotos da evolução", sem erro no console nem no log do server.
- `/configuracoes` → carrega sem o card "Armazenamento de fotos".
- Não há request 500 no log do dev referente a `treatment_photos` ou ao bucket.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0017_drop_treatment_photos.sql
git commit -m "$(cat <<'EOF'
feat(db): migração 0017 dropa treatment_photos e o bucket de fotos

Aplicada em dev. Em produção, aplicar só após o deploy do código que
parou de referenciar a tabela/bucket.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011vYVZNNSMsBDJp1x9mh9tL
EOF
)"
```

---

## Task 3: Verificação manual e fechamento

**Files:** nenhum (só verificação e, se estiver em worktree, merge).

- [ ] **Step 1: Checklist manual no dev** (`npm run dev`, login `silvana@arkdoctor.com`)

- [ ] Detalhe do tratamento: sem card de fotos; editar campos da ferida/tratamento/avaliação e **Salvar alterações** funciona.
- [ ] **Concluir tratamento** funciona (dialog → alta + desfecho).
- [ ] **Imprimir relatório**: abre `/pacientes/[id]/tratamentos/[treatmentId]/relatorio`, renderiza sem a seção "Fotos", sem erro.
- [ ] **Excluir tratamento** (menu ⋯ → confirmar): remove e volta para o paciente, sem erro de storage.
- [ ] **Excluir paciente** que tinha tratamento: funciona sem tentar limpar bucket.
- [ ] `/configuracoes`: sem card de armazenamento; salvar nome/conselho ainda funciona.
- [ ] Console do browser e log do `next dev` limpos (fora ruído de extensão).

- [ ] **Step 2: Verificação final da suíte**

```bash
npm test -- --run && npx tsc --noEmit && npm run build
```
Esperado: tudo verde/limpo.

- [ ] **Step 3: Fechar a branch**

Se o trabalho foi feito em worktree/branch isolada, usar `superpowers:finishing-a-development-branch` para mergear em `main` local. **Não** `git push` (deploy congelado). Confirmar com o usuário antes de mergear.

- [ ] **Step 4: Atualizar memória**

Atualizar `dogfood_correcoes_status.md` / criar nota curta: fotos de tratamento removidas (commits locais, não pushados); migração `0017` aplicada em dev, **pendente em prod** (aplicar após deploy); deps `browser-image-compression`/`heic-to` e `worker-src` do CSP removidas.

---

## Self-Review (feito na escrita do plano)

- **Cobertura do design:** todos os pontos da superfície aprovada em chat viraram step — 3 arquivos apagados (Step 1.1), camada de dados (1.2–1.9), actions/páginas (1.10–1.11, 1.14), UI (1.12–1.13, 1.15–1.16), `database.types.ts` (1.17), CSP (1.18), deps (1.19), migração (Task 2). ✅
- **Placeholders:** nenhum "TBD/TODO meu"; o `{/* TODO card Conta */}` pré-existente é do código e o Step 1.15 diz explicitamente para mantê-lo (só ajustar a menção a `storageBytes`). ✅
- **Consistência de nomes:** `treatment_photos` (tabela), `treatment-photos` (bucket), `"account members manage treatment photo objects"` (policy de `storage.objects`), `sumPhotoBytes`/`storageBytes` (Configurações), `MAX_OUTPUT_BYTES` (import órfão em `actions.ts`) — batem entre os steps e com o código lido. ✅
- **Escopo:** só fotos; entidade Tratamento, sessões, relatório (sem seção de fotos), conclusão e vínculo com agendamentos intactos, conforme decisão do usuário. ✅
- **Risco anotado:** `formatDate` em `treatment-report-view.tsx` e `CardHeader/CardTitle` em `treatment-detail-client.tsx` podem ou não ficar órfãos — os steps mandam conferir via `tsc`/`eslint` e só remover se realmente sem uso. Número da migração pode colidir com um `0017` do WhatsApp ainda não escrito — step manda usar o próximo livre.
