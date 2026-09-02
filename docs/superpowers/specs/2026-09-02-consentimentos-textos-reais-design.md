# ArkDoctor — Consentimentos: textos reais + PDF estruturado — Design Doc

Status: em design
Última atualização: 2026-09-02

## Contexto

A Feature 2 (assinatura eletrônica dos consentimentos,
`docs/superpowers/specs/2026-08-30-assinatura-consentimentos-design.md`) foi
implementada e mergeada (`0eb3dae`) com **textos de placeholder**
(`"[Texto do TCLE a ser fornecido pela profissional]"`). A profissional (Silvana)
forneceu agora o PDF real com os 3 termos (`termos de consentimentos PDF 02.pdf`,
na raiz do repo).

Este doc cobre:

1. Transcrever os 3 textos reais.
2. Trocar o 3º documento: `lgpd` (placeholder) → `laser` (Protocolo de Laserterapia).
3. Reescrever o gerador de PDF: de texto corrido para um layout estruturado
   (campos rotulados, caixas de seleção, timbre fixo da clínica, dois blocos de
   assinatura por termo).
4. Coletar os campos extras do TCLE de Feridas (tipo de ferida, autorização,
   responsável legal) nos fluxos inline e link.

Restrições herdadas (não mudam): sem geração de PDF no servidor (Cloudflare
Workers, sem Chrome headless) — tudo client-side com `pdf-lib`; assinatura
desenhada no `<canvas>` com `signature_pad`; um PDF por documento; guardar só o
PDF assinado, sem colunas de status estruturado.

## Decisões confirmadas (brainstorming 2026-09-02)

1. **Os 3 documentos são:**
   - `tcle` — TCLE / Termo de Compromisso — Tratamento de Feridas
   - `imagem` — Termo de Autorização de Uso de Imagem e Voz
   - `laser` — Protocolo de Laserterapia — TCLE

   Os três são fixos e oferecidos a todo paciente. `laser` **substitui** o antigo
   `lgpd` (que só existiu como placeholder).
2. **Fidelidade:** layout limpo com o mesmo conteúdo — todo o texto legal, os
   campos, as caixas Autorizo / Não autorizo, os dois blocos de assinatura.
   Estilo próprio do ArkDoctor; **não** é cópia pixel a pixel do arquivo Word.
3. **Timbre fixo da clínica**, embutido no código (não vira campo configurável
   agora): logo + rodapé (telefone, @instagram, endereço) + o CNPJ da CICATRIZE
   MAIS FERIDAS no corpo do termo de imagem.
4. **Campos extras só no PDF.** Nenhuma coluna nova em `signed_consents` além do
   que já existe.
5. **Recusa bloqueia.** Se quem assina marcar "Não autorizo o tratamento
   proposto", o sistema não gera nem guarda PDF — só um aviso na tela.
6. **Campos do TCLE de Feridas:**
   - Nome, CPF, data de nascimento, telefone → do cadastro do paciente
     (`contacts`), impressos no PDF; linha em branco quando faltarem.
   - **Endereço residencial** → não existe coluna em `contacts`; o campo sai
     sempre como linha em branco no PDF.
   - **Tipo de ferida** → a enfermeira digita. Fluxo inline: no diálogo de
     assinar. Fluxo link: no diálogo "Enviar link" (viaja assinado dentro do
     token; ver seção Token).
   - **Autorizo / Não autorizo** → escolha de quem assina, na tela, nos dois
     fluxos. Obrigatória.
   - **Responsável legal (nome + RG)** → quem assina liga um toggle "assino como
     responsável legal" e informa nome + RG, nos dois fluxos.
   - Bloco "Assinatura e carimbo do profissional de saúde" → linha em branco no
     PDF (a profissional assina/carimba fora do sistema, se quiser).
7. **Fluxo do PDF:** gerador baseado em **blocos genéricos** (não uma função de
   desenho por termo). Cada termo é uma lista de blocos; um motor único desenha e
   pagina.

## Modelo de dados — migração 0014

A migração 0013 já está aplicada em produção (`remote: 0013`), com
`check (kind in ('tcle', 'imagem', 'lgpd'))`. Renomear exige nova migração.

`supabase/migrations/0014_consent_kind_laser.sql`:

```sql
-- Renomeia o 3º consentimento: 'lgpd' (placeholder, nunca usado) vira 'laser'
-- (Protocolo de Laserterapia — TCLE). O update deixa a migração idempotente
-- mesmo não havendo linhas 'lgpd' em produção.
alter table signed_consents drop constraint signed_consents_kind_check;
update signed_consents set kind = 'laser' where kind = 'lgpd';
alter table signed_consents
  add constraint signed_consents_kind_check check (kind in ('tcle', 'imagem', 'laser'));
```

- Nenhuma assinatura real foi feita ainda → sem objetos `.../lgpd-*.pdf` no
  Storage para migrar.
- `src/lib/supabase/database.types.ts`: `kind` é `string`, não muda.
- Aplicação da migração é passo do usuário (`npx supabase db push` pede senha).

## `src/modules/consents/schemas.ts`

```ts
export const CONSENT_KINDS = ["tcle", "imagem", "laser"] as const;
```

Resto do arquivo igual. `assertConsentKind` em `actions.ts` passa a recusar
`lgpd` automaticamente. `recordConsentInputSchema` continua com
`z.enum(CONSENT_KINDS)`.

## `src/modules/consents/templates.ts` — de parágrafos para blocos

### Tipo `Block`

```ts
export type Block =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "field"; label: string; value: string | null } // "Label: valor" ou "Label: __________"
  | { type: "checkbox"; label: string; checked: boolean }
  | { type: "signature"; who: "electronic" | "blank"; label: string };
```

### `TemplateContext` (cresce)

```ts
export interface TemplateContext {
  pacienteNome: string;
  pacienteCpf: string | null;
  pacienteNascimento: string | null; // YYYY-MM-DD
  pacienteTelefone: string | null;   // novo — de contacts.phone (endereço não existe no cadastro)
  clinicaNome: string;
  profissionalNome: string | null;
  profissionalConselho: string | null;
  data: string; // DD/MM/AAAA
  // preenchidos pela enfermeira / por quem assina (só tcle):
  tipoFerida?: string | null;
  autoriza?: boolean | null;
  responsavelNome?: string | null;
  responsavelRg?: string | null;
}
```

### `renderTemplate`

```ts
export function renderTemplate(
  kind: ConsentKind,
  ctx: TemplateContext,
): { title: string; blocks: Block[] };
```

- Some o mecanismo de tokens `{{...}}` — os valores entram direto nos blocos
  `field`. `renderTemplate` só monta a árvore de blocos a partir de `ctx`.
- Cada `kind` tem uma função `(ctx) => Block[]`. O texto legal (declarações,
  responsabilidades, cláusula LGPD com o CNPJ, benefícios/riscos do laser) é
  **transcrição literal** do PDF, mantida como string nesse arquivo.
- `imagem` e `laser` **não** têm campos preenchidos pela enfermeira. Só `tcle`.
- `formatBrDate` / `formatBrDateTime` continuam iguais (fuso `America/Cuiaba`).

### Estrutura de cada termo (blocos, na ordem)

**`tcle` — "TCLE — Tratamento de Feridas"** (corresponde às 2 páginas do PDF):

1. `heading` "Termo de Compromisso / Consentimento Livre e Esclarecido"
2. `field` Nome / Data de nascimento / Idade / Procedimento (fixo "Tratamento de
   Feridas") / **Tipo de ferida**
3. `paragraph` × N — "Declaro que fui claramente informado sobre…",
   responsabilidades do serviço de saúde, responsabilidades do paciente/cuidador,
   coleta de material, uso anônimo de informações (texto literal do PDF)
4. `heading` "Preenchimento exclusivo pelo(a) paciente ou responsável legal"
5. `paragraph` "Declaro, portanto, que fui devidamente informado(a)…"
6. `checkbox` "Autorizo a realização do tratamento proposto." (checked = `ctx.autoriza === true`)
7. `checkbox` "Não autorizo a realização do tratamento proposto." (checked = `false` — ver decisão #5: recusa bloqueia, PDF só existe com "Autorizo")
8. `field` Nome do paciente / Contato telefônico / Endereço residencial
9. `field` Nome do responsável legal / RG do responsável legal / Contato (valores
   só quando o toggle responsável está ligado; senão linha em branco)
10. `signature` `electronic` — "Assinatura de quem consente"
11. `checkbox` "paciente" / `checkbox` "responsável legal" (marca conforme o toggle)
12. `heading` "Preenchimento exclusivo — profissional de saúde"
13. `paragraph` "Afirmo, para os devidos fins legais, que expliquei…"
14. `field` Data
15. `signature` `blank` — "Assinatura e carimbo do profissional de saúde"

**`imagem` — "Termo de Autorização de Uso de Imagem e Voz"**:

1. `heading` do termo
2. `field` Eu (nome) / RG / CPF / Endereço / Município-UF
3. `paragraph` × N — texto literal da autorização LGPD, incluindo
   "…pela empresa CICATRIZE MAIS FERIDAS, inscrita sob o CNPJ 31.693.471/0001-56,
   conforme Lei 13.709/2018…"
4. `signature` `electronic` — "Assinatura do responsável"
5. `signature` `blank` — "Assinatura do responsável da empresa"

**`laser` — "Protocolo de Laserterapia — TCLE"**:

1. `heading` "Protocolo de Laserterapia — Termo de Consentimento Livre e Esclarecido"
2. `field` Eu (nome) / CPF
3. `paragraph` × N — autorização, benefícios esperados, riscos, número de sessões,
   biossegurança (texto literal do PDF)
4. `signature` `electronic` — "Assinatura do paciente"
5. `signature` `blank` — "Assinatura do profissional — Silvana Lopes, Enfermeira · Especialista em Feridas · COREN-MT nº 481743"

## `src/components/consents/letterhead.ts` — timbre fixo (novo)

```ts
export const LETTERHEAD = {
  logoPngBase64: "...",            // PNG do logo "ENF. SILVANA LOPES", embutido
  footer: "(66) 99672-0888  ·  @enfsilvanalopes  ·  Av. das Acácias, 697 — Jardim Botânico",
  empresaRazaoSocial: "CICATRIZE MAIS FERIDAS",
  empresaCnpj: "31.693.471/0001-56",
};
```

- **Logo embutido em base64**, não `fetch('/logo/...')`: sem request extra, o PDF
  monta mesmo offline, e não depende de `img-src` do CSP para asset local.
- Asset de origem: `public/logo/silvana-lopes.png` (a fornecer pelo usuário). Um
  passo do plano converte para base64 dentro de `letterhead.ts`.
- `empresaRazaoSocial` / `empresaCnpj` são consumidos pelo template `imagem`.

## `src/components/consents/pdf.ts` — motor de blocos

Substitui o fluxo baseado em `paragraphs`. Mantém o espírito das funções puras
atuais (`wrapLine`, `paginate`) — cada uma com teste unitário.

### Funções puras

- `measureBlock(block: Block, geom): Line[]` — quebra um bloco em linhas
  desenháveis com estilo (`{ text, size, bold, kind: "text" | "checkbox" | "rule" }`).
  - `field` → `"Tipo de ferida: valor"`; sem valor → `"Tipo de ferida: " + régua`.
  - `checkbox` → linha `kind: "checkbox"` com `checked` (o glifo `[X]` / `[ ]` é
    **desenhado** — retângulo + tique —, não caractere Unicode; WinAnsi não tem ☑).
  - `signature` → reserva altura fixa (imagem + linha + rótulo).
  - `heading` → maior + bold, com folga acima.
- `layoutBlocks(blocks: Block[], geom): Page[]` — empilha as linhas de todos os
  blocos, paginando A4 com margem reservada para o **timbre** (topo) e o **rodapé
  fixo** (base). Um bloco `signature` **nunca** se divide entre páginas: se não
  cabe, empurra o bloco inteiro para a próxima.

### `buildConsentPdf(input): Promise<Uint8Array>`

```ts
export interface ConsentPdfInput {
  title: string;
  blocks: Block[];
  signatureDataUrl: string; // PNG data URL da assinatura desenhada
  signerName: string;
  signedAtLabel: string;    // "DD/MM/AAAA HH:MM"
}
```

1. Em **toda página**: desenha o timbre (logo PNG de `LETTERHEAD.logoPngBase64` +
   linha divisória) no topo e o rodapé (`LETTERHEAD.footer`) na base.
2. Desenha o título + os blocos via `layoutBlocks`.
3. No bloco `signature: "electronic"`: carimba a imagem PNG da assinatura + a
   linha `Assinado eletronicamente por {signerName} em {signedAtLabel}`.
4. No bloco `signature: "blank"`: só a linha horizontal + o rótulo.
5. `doc.save()`.

- Fonte `Helvetica` / `HelveticaBold` (WinAnsi cobre acentos e `ç`), como hoje.
- Sem logo disponível no build → desenha só a linha divisória com o nome da
  clínica em texto. Não quebra (teste cobre).

## `src/components/consents/consent-sign-form.tsx`

`ConsentSignFormProps`:

- Troca `paragraphs: string[]` por `blocks: Block[]`.
- Remove `headerLines` (o timbre agora é fixo no `buildConsentPdf`).
- Ganha `kind: ConsentKind`.
- Ganha `tipoFerida?: string` — quando presente (fluxo link, veio do token),
  os campos do TCLE já vêm preenchidos e o "tipo de ferida" aparece read-only;
  quando ausente (fluxo inline), a enfermeira digita.

Comportamento:

- Preview rolável renderiza `blocks` (heading / paragraph / field com valor /
  checkbox) em vez de `paragraphs`.
- **Só quando `kind === "tcle"`**, acima da assinatura:
  - "Tipo de ferida" — `<input>` (editável no inline; read-only se veio por prop).
  - Rádio obrigatório **"Autorizo / Não autorizo o tratamento proposto"**.
  - Toggle "Assino como responsável legal" → revela "Nome do responsável" + "RG".
- Ao confirmar:
  - `kind === "tcle"` e "Não autorizo" → **não** monta PDF; mostra
    "Sem autorização do tratamento, o documento não é registrado."; diálogo fica
    aberto.
  - Senão → `applyTcleFields(blocks, { tipoFerida, autoriza: true, responsavelNome,
    responsavelRg })` funde os valores nos blocos `field` / `checkbox` → `buildConsentPdf`
    → `onComplete({ pdfBytes, signerName })`.
  - `signerName` default = nome do responsável quando o toggle está ligado; senão
    nome do paciente.
- "Confirmar" desabilitado enquanto: assinatura vazia; nome vazio; (TCLE) rádio
  de autorização não escolhido; (TCLE) toggle responsável ligado sem nome/RG.

`applyTcleFields(blocks, values): Block[]` é função pura em `templates.ts` (opera
sobre a árvore de blocos), com teste.

## `src/components/consents/consent-cards.tsx` + `documentos/page.tsx`

- `Doc` type: `{ kind: ConsentKind; title: string; blocks: Block[] }`.
- `ConsentCards` perde a prop `headerLines`.
- Diálogo **"Enviar link"**: quando `doc.kind === "tcle"`, mostra um campo
  "Tipo de ferida" antes do botão gerar. Chama
  `createConsentLinkAction(contactId, kind, { tipoFerida })`.
- Diálogo "Assinar": passa `kind={doc.kind}` e `blocks={doc.blocks}` ao
  `ConsentSignForm` (sem `tipoFerida` — inline a enfermeira digita lá).
- Resto igual (Ver PDF, Excluir com confirmação, Assinar novamente).
- `getConsentPageDataAction`: `templateCtx` ganha `pacienteTelefone`
  (`contact.phone`); `docs = CONSENT_KINDS.map(k => { const t =
  renderTemplate(k, ctx); return { kind: k, title: t.title, blocks: t.blocks }; })`.

## `src/modules/consents/token.ts`

`ConsentClaims` ganha `tipoFerida?: string` (usado só quando `kind === "tcle"`).

- Entra no payload como `t` (chave curta), coberto pelo mesmo HMAC-SHA256.
- `verifyConsentToken` devolve `tipoFerida` quando presente; token sem `t`
  continua válido.
- Impacto no QR: +30–60 chars na URL. O `qrcode` (nível de correção padrão)
  suporta centenas de bytes sem problema.

## Server actions (`src/app/(app)/pacientes/[id]/actions.ts`)

- `createConsentLinkAction(contactId: string, kind: string, extra?: { tipoFerida?: string })`
  — repassa `tipoFerida` para `signConsentToken({ accountId, contactId, kind, tipoFerida })`.
- `uploadConsentAction` / `deleteConsentAction` — **sem mudança** (recebem o PDF
  pronto + `signerName`; nada de campo novo persistido).
- `getConsentPageDataAction` — ver seção acima.
- `listConsentsAction` — sem mudança.

## Rota pública `/assinar/[token]`

- `loadPage`: lê `claims.tipoFerida`; monta `renderTemplate("tcle", ctx)` com
  `tipoFerida` no `ctx`. Para `imagem` / `laser`, `ctx` sem campos de enfermeira.
- `PublicConsentForm`: repassa `kind` e `tipoFerida` (read-only) ao
  `ConsentSignForm`. O paciente ainda escolhe Autorizo / Não autorizo e o toggle
  de responsável.
- `submitPublicConsentAction`: **sem mudança estrutural** (PDF pronto +
  `signerName`; `signed_via = 'link'`).

## Tratamento de erros (casos novos / alterados)

| Situação | Comportamento |
|---|---|
| "Não autorizo" marcado (TCLE) | Não monta nem salva PDF. Mensagem "Sem autorização do tratamento, o documento não é registrado." Diálogo continua aberto. |
| Rádio Autorizo/Não autorizo não escolhido (TCLE) | Botão "Confirmar" desabilitado. |
| Toggle responsável ligado sem nome ou RG | Botão "Confirmar" desabilitado. |
| Logo PNG ausente no build | `buildConsentPdf` desenha só a linha divisória com o nome da clínica em texto. Não quebra. |
| Tipo de ferida vazio (inline) | Permitido — sai como linha em branco no PDF. |
| Bloco de assinatura não cabe no fim da página | `layoutBlocks` empurra o bloco inteiro para a página nova. |
| Telefone / nascimento ausentes em `contacts` (e endereço, que nunca existe) | `field` sai como "Label: __________". |
| Token adulterado no `tipoFerida` | HMAC não bate → `verifyConsentToken` devolve `null` → tela "link expirado ou inválido". |

Casos herdados da Feature 2 (upload falha, insert falha após upload, PDF > 2 MB,
rate limit em `/assinar`, reassinar) continuam valendo sem alteração.

## Testes

### Automatizados (`vitest`)

| Arquivo | Cobre |
|---|---|
| `modules/consents/templates.test.ts` (reescrito) | `renderTemplate` devolve os blocos certos por `kind` e na ordem certa; `field` com valor vs. `null`; `imagem` / `laser` sem blocos de campo preenchidos por enfermeira; `checkbox` de autorização reflete `ctx.autoriza`; títulos corretos; `CONSENT_KINDS` tem os 3 valores novos |
| `modules/consents/token.test.ts` (+casos) | roundtrip com `tipoFerida`; token sem `tipoFerida` válido; `tipoFerida` adulterado rejeitado pelo HMAC |
| `components/consents/pdf.test.ts` (reescrito) | `measureBlock` por tipo de bloco; `layoutBlocks` pagina e nunca parte um `signature`; caminho sem logo |
| `modules/consents/templates.test.ts` (mesmo arquivo) | `applyTcleFields` funde tipo de ferida / autorização / responsável nos blocos certos e deixa os demais intactos |
| `components/consents/consent-sign-form.test.tsx` (+casos) | campos do TCLE só aparecem com `kind === "tcle"`; "Não autorizo" bloqueia e não chama `onComplete`; toggle responsável exige nome + RG; `imagem` / `laser` não mostram campos extras; `tipoFerida` por prop vem read-only |

### Smoke-test manual (usuário)

- Inline, `tcle`: digitar tipo de ferida, marcar Autorizo, assinar → PDF com
  timbre (logo + rodapé), campos preenchidos, caixa "Autorizo" marcada,
  assinatura carimbada + linha em branco do profissional.
- Inline, `tcle`, "Não autorizo" → aviso, nada salvo, card segue "Pendente".
- Inline, `tcle`, toggle responsável → nome + RG no PDF; rodapé
  "Assinado eletronicamente por {responsável}".
- Link, `tcle`: enfermeira digita tipo de ferida no "Enviar link" → abrir no
  celular → tipo de ferida já aparece read-only → paciente marca Autorizo e
  assina → PDF completo, `signed_via = 'link'`.
- `imagem` e `laser`, inline e link → sem campos extras; dois blocos de
  assinatura (um carimbado, um em branco).
- Ver PDF / Excluir / Assinar novamente / excluir paciente → como na Feature 2.

### Não testado de propósito

Saída visual do `pdf-lib` (posição exata de cada linha), canvas do
`signature_pad`, geração do QR (dep externa).

## Fora de escopo

- Campos configuráveis de timbre / branding por conta (decisão #3 — fixo no código).
- Persistir tipo de ferida / decisão de autorização em colunas de `signed_consents`
  (decisão #4 — só no PDF).
- "Baixar em branco" / cópia para leitura prévia — a profissional envia o PDF
  dela mesma.
- Assinatura do profissional dentro do sistema (bloco fica sempre em branco).
- Reproduzir o arquivo Word ao pixel (decisão #2 — layout próprio).
- Versionar template — trocar o texto vale para os próximos, não re-emite os já
  assinados (o PDF assinado é imutável, por design).
- Fluxo remoto / assíncrono do link (o link continua sendo uso presencial).

## Dependências

Nenhuma nova. `pdf-lib`, `signature_pad`, `qrcode` já estão no projeto. Um asset
novo: `public/logo/silvana-lopes.png`, convertido para base64 em
`src/components/consents/letterhead.ts`.

## Arquivos tocados

**Criar:**
- `supabase/migrations/0014_consent_kind_laser.sql`
- `src/components/consents/letterhead.ts`

**Modificar:**
- `src/modules/consents/schemas.ts` — `CONSENT_KINDS`
- `src/modules/consents/templates.ts` — blocos, `TemplateContext`, os 3 termos
- `src/modules/consents/templates.test.ts` — reescrito
- `src/modules/consents/token.ts` — `tipoFerida` nas claims
- `src/modules/consents/token.test.ts` — casos novos
- `src/components/consents/pdf.ts` — motor de blocos, `applyTcleFields`
- `src/components/consents/pdf.test.ts` — reescrito
- `src/components/consents/consent-sign-form.tsx` — blocos + campos do TCLE
- `src/components/consents/consent-sign-form.test.tsx` — casos novos
- `src/components/consents/consent-cards.tsx` — `Doc.blocks`, tipo de ferida no "Enviar link"
- `src/components/consents/public-consent-form.tsx` — repassa `kind` + `tipoFerida`
- `src/app/(app)/pacientes/[id]/documentos/page.tsx` — sem `headerLines`
- `src/app/(app)/pacientes/[id]/actions.ts` — `createConsentLinkAction` com `extra`; `getConsentPageDataAction` com `pacienteTelefone` e `blocks`
- `src/app/assinar/[token]/page.tsx` — `tipoFerida` do token para o `renderTemplate` / form
