# Consentimentos: textos reais + PDF estruturado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir os textos placeholder dos 3 termos de consentimento pelos textos reais fornecidos pela profissional, trocar o 3º documento (`lgpd` → `laser` / Protocolo de Laserterapia) e reescrever o gerador de PDF de texto corrido para um layout estruturado por blocos (campos rotulados, caixas de seleção, timbre fixo da clínica, dois blocos de assinatura por termo), coletando os campos extras do TCLE de Feridas.

**Architecture:** `renderTemplate` passa a devolver uma árvore de `Block[]` (heading / paragraph / field / checkbox / signature) em vez de `paragraphs: string[]`. Um motor único em `pdf.ts` (`measureBlock` + `layoutBlocks`) desenha e pagina qualquer termo. O timbre da clínica (logo em base64 + rodapé + CNPJ) vive num `letterhead.ts` fixo. Os campos do TCLE de Feridas preenchidos na hora (tipo de ferida, Autorizo/Não autorizo, responsável legal) são fundidos nos blocos por `applyTcleFields` no cliente, antes de montar o PDF; no fluxo por link o "tipo de ferida" viaja assinado dentro do token HMAC.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, TypeScript 5, Zod 4, Supabase (Postgres + Storage + RLS), Cloudflare Workers (`@opennextjs/cloudflare`, `nodejs_compat`), Vitest 4 + Testing Library, Base UI para dialogs. Deps já no projeto: `pdf-lib`, `signature_pad`, `qrcode`. **Nenhuma dependência nova.**

**Spec:** `docs/superpowers/specs/2026-09-02-consentimentos-textos-reais-design.md`

## Global Constraints

- **Sem geração de PDF no servidor.** Cloudflare Workers não tem Chrome headless. Todo PDF é montado client-side com `pdf-lib` via `import()` dinâmico.
- **Alias de import:** `@/` → `src/`.
- **Web Crypto, não `node:crypto`.** `token.ts` usa `crypto.subtle` e `Buffer` (`nodejs_compat`).
- **Fuso da clínica:** `America/Cuiaba` (UTC-4, sem horário de verão). `formatBrDate` / `formatBrDateTime` já implementam isso — não alterar a assinatura nem o comportamento.
- **Fonte do PDF:** `StandardFonts.Helvetica` / `HelveticaBold` (codificação WinAnsi cobre acentos e `ç`). Sem arquivo de fonte embutido.
- **`database.types.ts` é editado à mão.** Não usar `supabase gen types`.
- **Migração:** próxima livre é a **0014**. A 0013 já está aplicada em produção (`remote: 0013`).
- **Mensagens de erro em português.**
- **Comandos:** testes `npx vitest run <path>`; typecheck `npx tsc --noEmit`; lint `npx eslint <paths>`.
- **`contacts` não tem coluna de endereço.** O campo "Endereço residencial" do TCLE sai sempre como linha em branco.
- **Trailers de commit** (obrigatórios em todo commit deste plano):

  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HijpUqTjZNjnN2XpG6wzko
  ```

- **Estado do typecheck durante o plano:** a mudança de `paragraphs` → `blocks` é transversal. `npx tsc --noEmit` do projeto inteiro só volta a passar na **Task 8**. Cada task roda apenas o vitest do seu próprio módulo; onde uma task deixa `tsc` vermelho por causa de consumidores ainda não migrados, isso está anotado no passo e a task que restaura o verde é nomeada.

---

## File Structure

**Criar:**

- `supabase/migrations/0014_consent_kind_laser.sql` — renomeia `kind` `lgpd` → `laser` no `CHECK`.
- `src/components/consents/letterhead.ts` — timbre fixo (logo base64, rodapé, razão social + CNPJ da empresa).

**Modificar:**

- `src/modules/consents/schemas.ts` — `CONSENT_KINDS = ["tcle", "imagem", "laser"]`.
- `src/modules/consents/templates.ts` — modelo `Block`, `TemplateContext` (+ `pacienteTelefone`, campos opcionais do TCLE), `renderTemplate` → `{ title, blocks }`, `applyTcleFields`, os 3 termos com texto real. `formatBrDate` / `formatBrDateTime` mantidos.
- `src/modules/consents/templates.test.ts` — reescrito para o modelo de blocos.
- `src/modules/consents/token.ts` — `ConsentClaims.tipoFerida?`, payload `t?`.
- `src/modules/consents/token.test.ts` — casos de `tipoFerida`.
- `src/components/consents/pdf.ts` — `Block`-reexport, `measureBlock`, `layoutBlocks`, `buildConsentPdf` (nova assinatura), timbre por página. `wrapLine` mantido; `layoutParagraphs` / `paginate` removidos.
- `src/components/consents/pdf.test.ts` — reescrito para `measureBlock` / `layoutBlocks`.
- `src/components/consents/consent-sign-form.tsx` — props `kind` + `blocks` + `tipoFerida?`, campos do TCLE, bloqueio na recusa, `applyTcleFields`.
- `src/components/consents/consent-sign-form.test.tsx` — reescrito.
- `src/components/consents/consent-cards.tsx` — `Doc` com `blocks`, sem `headerLines`, campo "tipo de ferida" no diálogo de link.
- `src/components/consents/public-consent-form.tsx` — props `kind` + `blocks` + `tipoFerida?`.
- `src/app/(app)/pacientes/[id]/documentos/page.tsx` — sem `headerLines`.
- `src/app/(app)/pacientes/[id]/actions.ts` — `getConsentPageDataAction` (blocos + `pacienteTelefone`), `createConsentLinkAction(contactId, kind, extra?)`.
- `src/app/assinar/[token]/page.tsx` — `tipoFerida` do token → `renderTemplate` + form.

---

## Task 1: Migração 0014 — `kind` `lgpd` → `laser`

**Files:**
- Create: `supabase/migrations/0014_consent_kind_laser.sql`

**Interfaces:**
- Consumes: nada.
- Produces: constraint `signed_consents_kind_check` passa a aceitar `('tcle', 'imagem', 'laser')`.

- [ ] **Step 1: Escrever a migração**

Criar `supabase/migrations/0014_consent_kind_laser.sql`:

```sql
-- Renomeia o 3º consentimento: 'lgpd' (placeholder, nunca usado em produção)
-- vira 'laser' (Protocolo de Laserterapia — TCLE). O update deixa a migração
-- idempotente mesmo não havendo linhas 'lgpd'.
alter table signed_consents drop constraint signed_consents_kind_check;

update signed_consents set kind = 'laser' where kind = 'lgpd';

alter table signed_consents
  add constraint signed_consents_kind_check check (kind in ('tcle', 'imagem', 'laser'));
```

> O nome real da constraint em produção é `signed_consents_kind_check` (nome
> gerado pelo Postgres para o `check` inline da migração 0013). Se `drop
> constraint` falhar por nome divergente, rodar
> `select conname from pg_constraint where conrelid = 'signed_consents'::regclass and contype = 'c';`
> e ajustar.

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0014_consent_kind_laser.sql
git commit -m "$(printf 'feat(consents): migração 0014 — kind lgpd vira laser\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01HijpUqTjZNjnN2XpG6wzko')"
```

> **Nota de operação (não é passo de código):** a migração é aplicada pelo
> usuário (`npx supabase db push` pede senha interativa). O fluxo end-to-end
> com `kind = 'laser'` só funciona após isso; todas as tasks seguintes podem
> ser implementadas e testadas antes (repositório memory + unidades puras +
> componentes com mock).

---

## Task 2: `templates.ts` — modelo de blocos + os 3 termos reais

**Files:**
- Create: `src/components/consents/letterhead.ts`
- Modify: `src/modules/consents/schemas.ts`
- Modify: `src/modules/consents/templates.ts`
- Test: `src/modules/consents/templates.test.ts` (reescrito)

**Interfaces:**
- Consumes: `ConsentKind` de `./schemas`.
- Produces:
  - `src/components/consents/letterhead.ts`: `export const LETTERHEAD: { logoPngBase64: string; footer: string; empresaRazaoSocial: string; empresaCnpj: string }`
  - `schemas.ts`: `CONSENT_KINDS = ["tcle", "imagem", "laser"] as const`
  - `templates.ts`:
    - `export type Block = { type: "heading"; text: string } | { type: "paragraph"; text: string } | { type: "field"; label: string; value: string | null; key?: string } | { type: "checkbox"; label: string; checked: boolean; key?: string } | { type: "signature"; who: "electronic" | "blank"; label: string }`
    - `export interface TemplateContext { pacienteNome: string; pacienteCpf: string | null; pacienteNascimento: string | null; pacienteTelefone: string | null; clinicaNome: string; profissionalNome: string | null; profissionalConselho: string | null; data: string; tipoFerida?: string | null; autoriza?: boolean | null; responsavelNome?: string | null; responsavelRg?: string | null }`
    - `export function renderTemplate(kind: ConsentKind, ctx: TemplateContext): { title: string; blocks: Block[] }`
    - `export interface TcleFieldValues { tipoFerida: string | null; autoriza: boolean; responsavelNome: string | null; responsavelRg: string | null }`
    - `export function applyTcleFields(blocks: Block[], v: TcleFieldValues): Block[]`
    - `export function formatBrDate(date: Date): string` — **inalterado**
    - `export function formatBrDateTime(date: Date): string` — **inalterado**

- [ ] **Step 1: Criar `letterhead.ts`**

Criar `src/components/consents/letterhead.ts`:

```ts
// Timbre fixo da clínica, embutido no código (decisão do design doc — não é
// configurável por conta agora). O logo entra como PNG base64: sem request
// extra, monta offline, não depende de img-src do CSP para asset local.
//
// logoPngBase64 fica vazio até o usuário fornecer public/logo/silvana-lopes.png.
// Com a string vazia, buildConsentPdf desenha só a linha do timbre com o nome
// da clínica em texto (ver pdf.ts). Para preencher depois:
//   node -e "console.log(require('fs').readFileSync('public/logo/silvana-lopes.png').toString('base64'))"
// e colar o resultado abaixo.
export const LETTERHEAD = {
  logoPngBase64: "",
  footer: "(66) 99672-0888  ·  @enfsilvanalopes  ·  Av. das Acácias, 697 — Jardim Botânico",
  empresaRazaoSocial: "CICATRIZE MAIS FERIDAS",
  empresaCnpj: "31.693.471/0001-56",
} as const;
```

- [ ] **Step 2: Trocar `CONSENT_KINDS` em `schemas.ts`**

Em `src/modules/consents/schemas.ts`, trocar a linha:

```ts
export const CONSENT_KINDS = ["tcle", "imagem", "laser"] as const;
```

(o resto do arquivo — `ConsentKind`, `SignedVia`, `recordConsentInputSchema` — fica igual.)

- [ ] **Step 3: Escrever o teste reescrito (falhando)**

Substituir todo o conteúdo de `src/modules/consents/templates.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  applyTcleFields,
  formatBrDate,
  formatBrDateTime,
  type Block,
  type TemplateContext,
} from "./templates";

const ctx: TemplateContext = {
  pacienteNome: "Maria Silva",
  pacienteCpf: "123.456.789-00",
  pacienteNascimento: "1980-05-09",
  pacienteTelefone: "(66) 90000-0000",
  clinicaNome: "Clínica Silvana Lopes",
  profissionalNome: "Silvana Lopes",
  profissionalConselho: "COREN-MT 481743",
  data: "12/03/2026",
};

function types(blocks: Block[]): string[] {
  return blocks.map((b) => b.type);
}
function byKey(blocks: Block[], key: string): Block | undefined {
  return blocks.find((b) => (b.type === "field" || b.type === "checkbox") && b.key === key);
}

describe("renderTemplate", () => {
  it("tcle: título + primeiro bloco heading + campos + assinaturas", () => {
    const { title, blocks } = renderTemplate("tcle", ctx);
    expect(title).toMatch(/Tratamento de Feridas/);
    expect(blocks[0]).toEqual({ type: "heading", text: expect.stringMatching(/Consentimento/i) });

    const nome = blocks.find((b) => b.type === "field" && b.label === "Nome");
    expect(nome).toMatchObject({ type: "field", value: "Maria Silva" });

    const sigs = blocks.filter((b) => b.type === "signature");
    expect(sigs.map((s) => (s as Extract<Block, { type: "signature" }>).who)).toEqual([
      "electronic",
      "blank",
    ]);
  });

  it("tcle: tipo de ferida e autorização entram por ctx", () => {
    const { blocks } = renderTemplate("tcle", { ...ctx, tipoFerida: "úlcera venosa", autoriza: true });
    expect(byKey(blocks, "tipoFerida")).toMatchObject({ value: "úlcera venosa" });
    expect(byKey(blocks, "autorizo")).toMatchObject({ checked: true });
    expect(byKey(blocks, "naoAutorizo")).toMatchObject({ checked: false });
  });

  it("tcle: campos sem valor viram field com value null", () => {
    const { blocks } = renderTemplate("tcle", ctx);
    const endereco = blocks.find((b) => b.type === "field" && b.label === "Endereço residencial");
    expect(endereco).toMatchObject({ value: null });
    expect(byKey(blocks, "tipoFerida")).toMatchObject({ value: null });
  });

  it("imagem: sem campos preenchidos por enfermeira; CNPJ no corpo; 2 assinaturas", () => {
    const { title, blocks } = renderTemplate("imagem", ctx);
    expect(title).toMatch(/Imagem e Voz/);
    expect(byKey(blocks, "tipoFerida")).toBeUndefined();
    expect(byKey(blocks, "autorizo")).toBeUndefined();
    const corpo = blocks.filter((b) => b.type === "paragraph").map((b) => (b as Extract<Block, { type: "paragraph" }>).text).join("\n");
    expect(corpo).toContain("31.693.471/0001-56");
    expect(corpo).toContain("CICATRIZE MAIS FERIDAS");
    expect(blocks.filter((b) => b.type === "signature")).toHaveLength(2);
  });

  it("laser: sem campos de enfermeira; 2 assinaturas; corpo menciona laserterapia", () => {
    const { title, blocks } = renderTemplate("laser", ctx);
    expect(title).toMatch(/Laserterapia/);
    expect(byKey(blocks, "autorizo")).toBeUndefined();
    const corpo = blocks.filter((b) => b.type === "paragraph").map((b) => (b as Extract<Block, { type: "paragraph" }>).text).join("\n");
    expect(corpo).toMatch(/laserterapia/i);
    expect(blocks.filter((b) => b.type === "signature")).toHaveLength(2);
  });

  it("data de nascimento é formatada DD/MM/AAAA no field", () => {
    const { blocks } = renderTemplate("tcle", ctx);
    const nasc = blocks.find((b) => b.type === "field" && b.label === "Data de nascimento");
    expect(nasc).toMatchObject({ value: "09/05/1980" });
  });
});

describe("applyTcleFields", () => {
  it("funde tipo de ferida, autorização e responsável nos blocos com key", () => {
    const { blocks } = renderTemplate("tcle", ctx);
    const out = applyTcleFields(blocks, {
      tipoFerida: "deiscência cirúrgica",
      autoriza: true,
      responsavelNome: "João Silva",
      responsavelRg: "MT-1234567",
    });
    expect(byKey(out, "tipoFerida")).toMatchObject({ value: "deiscência cirúrgica" });
    expect(byKey(out, "autorizo")).toMatchObject({ checked: true });
    expect(byKey(out, "responsavelNome")).toMatchObject({ value: "João Silva" });
    expect(byKey(out, "responsavelRg")).toMatchObject({ value: "MT-1234567" });
    expect(byKey(out, "assinaComoResponsavel")).toMatchObject({ checked: true });
    expect(byKey(out, "assinaComoPaciente")).toMatchObject({ checked: false });
  });

  it("sem responsável: marca 'assina como paciente' e deixa os campos de responsável null", () => {
    const { blocks } = renderTemplate("tcle", ctx);
    const out = applyTcleFields(blocks, {
      tipoFerida: "x",
      autoriza: true,
      responsavelNome: null,
      responsavelRg: null,
    });
    expect(byKey(out, "assinaComoPaciente")).toMatchObject({ checked: true });
    expect(byKey(out, "assinaComoResponsavel")).toMatchObject({ checked: false });
    expect(byKey(out, "responsavelNome")).toMatchObject({ value: null });
  });

  it("não toca em blocos sem key (parágrafos, headings)", () => {
    const { blocks } = renderTemplate("tcle", ctx);
    const out = applyTcleFields(blocks, { tipoFerida: "x", autoriza: true, responsavelNome: null, responsavelRg: null });
    expect(types(out)).toEqual(types(blocks));
    expect(out.filter((b) => b.type === "paragraph")).toEqual(blocks.filter((b) => b.type === "paragraph"));
  });
});

describe("date formatters", () => {
  it("formata data como DD/MM/AAAA no fuso da clínica", () => {
    expect(formatBrDate(new Date("2026-03-09T13:05:00Z"))).toBe("09/03/2026");
  });
  it("formata data-hora como DD/MM/AAAA HH:mm no fuso da clínica", () => {
    expect(formatBrDateTime(new Date("2026-03-09T13:05:00Z"))).toBe("09/03/2026 09:05");
  });
  it("volta ao dia anterior quando o UTC passou da meia-noite", () => {
    expect(formatBrDateTime(new Date("2026-03-10T02:30:00Z"))).toBe("09/03/2026 22:30");
  });
});
```

- [ ] **Step 4: Rodar o teste e ver falhar**

Run: `npx vitest run src/modules/consents/templates.test.ts`
Expected: FAIL — `renderTemplate` ainda devolve `{ title, paragraphs }`; `applyTcleFields` / `type Block` não existem.

- [ ] **Step 5: Reescrever `templates.ts`**

Substituir todo o conteúdo de `src/modules/consents/templates.ts`:

```ts
import { LETTERHEAD } from "@/components/consents/letterhead";
import type { ConsentKind } from "./schemas";

// Clínica em Cuiabá (UTC-4, sem horário de verão). O Worker roda em UTC, então
// carimbamos a data/hora do consentimento no fuso local.
const CLINIC_TIME_ZONE = "America/Cuiaba";

export type Block =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "field"; label: string; value: string | null; key?: string }
  | { type: "checkbox"; label: string; checked: boolean; key?: string }
  | { type: "signature"; who: "electronic" | "blank"; label: string };

export interface TemplateContext {
  pacienteNome: string;
  pacienteCpf: string | null;
  pacienteNascimento: string | null; // YYYY-MM-DD
  pacienteTelefone: string | null;
  clinicaNome: string;
  profissionalNome: string | null;
  profissionalConselho: string | null;
  data: string; // DD/MM/AAAA
  // Preenchidos pela enfermeira / por quem assina — só no TCLE de feridas:
  tipoFerida?: string | null;
  autoriza?: boolean | null;
  responsavelNome?: string | null;
  responsavelRg?: string | null;
}

const TITLES: Record<ConsentKind, string> = {
  tcle: "Consentimento Livre e Esclarecido — Tratamento de Feridas",
  imagem: "Termo de Autorização de Uso de Imagem e Voz",
  laser: "Protocolo de Laserterapia — Consentimento Livre e Esclarecido",
};

function isoToBr(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

function nonEmpty(s: string | null | undefined): string | null {
  return s != null && s.trim() !== "" ? s : null;
}

function buildTcle(ctx: TemplateContext): Block[] {
  const asResponsavel = Boolean(nonEmpty(ctx.responsavelNome));
  return [
    { type: "heading", text: "Termo de Compromisso / Consentimento Livre e Esclarecido — TCLE — Tratamento de Feridas" },

    { type: "field", label: "Nome", value: nonEmpty(ctx.pacienteNome) },
    { type: "field", label: "Data de nascimento", value: isoToBr(ctx.pacienteNascimento) },
    { type: "field", label: "Idade", value: null },
    { type: "field", label: "Procedimento", value: "Tratamento de Feridas" },
    { type: "field", label: "Tipo de ferida", value: nonEmpty(ctx.tipoFerida), key: "tipoFerida" },

    { type: "paragraph", text: "Declaro que fui claramente informado(a) sobre:" },
    { type: "paragraph", text: "Serei informado(a) qual tipo de cobertura será utilizada, assim como as possíveis contraindicações e reações adversas, mediante classificação da lesão após a avaliação do enfermeiro." },
    { type: "paragraph", text: "É de responsabilidade do Serviço de Saúde: avaliar, acompanhar e orientar o paciente e acompanhante/cuidador; encaminhar o paciente a outros profissionais quando necessário; propiciar condições que facilitem a cicatrização da ferida; orientar e estimular o autocuidado." },
    { type: "paragraph", text: "É de minha responsabilidade e/ou do meu cuidador: não faltar aos retornos agendados por duas vezes consecutivas ou três alternadas sem comunicação prévia; respeitar e seguir todas as orientações fornecidas pelos profissionais de saúde; não retirar ou trocar o curativo no domicílio sem autorização do profissional; procurar o Serviço de Saúde fora da data agendada em caso de intercorrências ou complicações; assumir as atividades relativas à limpeza e higiene pessoal; expor minhas dúvidas ao longo do tratamento." },
    { type: "paragraph", text: "Comprometo-me a sempre informar qualquer alteração evidenciada por mim e a manter meu histórico de saúde referente a alergias sempre atualizado." },
    { type: "paragraph", text: "Quando houver necessidade de coletar materiais relacionados ao procedimento, autorizo o envio do material coletado ao serviço pertinente para realização do exame necessário e terei acesso ao resultado." },
    { type: "paragraph", text: "Autorizo o uso de informações relativas ao meu tratamento, desde que assegurado o anonimato." },

    { type: "heading", text: "Preenchimento exclusivo pelo(a) paciente ou pelo(a) responsável legal" },
    { type: "paragraph", text: "Declaro, portanto, que fui devidamente informado(a) quanto ao procedimento que será realizado, assim como os benefícios, riscos, contraindicações e principais efeitos adversos relacionados, sendo-me concedida a oportunidade de esclarecer todas as dúvidas antes da assinatura deste documento, e ciente de que, em qualquer tempo, posso mudar de opinião e desistir da realização do procedimento." },
    { type: "paragraph", text: "Mediante estas informações:" },
    { type: "checkbox", label: "Autorizo a realização do tratamento proposto.", checked: ctx.autoriza === true, key: "autorizo" },
    { type: "checkbox", label: "Não autorizo a realização do tratamento proposto.", checked: false, key: "naoAutorizo" },

    { type: "field", label: "Nome do paciente", value: nonEmpty(ctx.pacienteNome) },
    { type: "field", label: "Contato telefônico", value: nonEmpty(ctx.pacienteTelefone) },
    { type: "field", label: "Endereço residencial", value: null },
    { type: "field", label: "Nome do responsável legal", value: nonEmpty(ctx.responsavelNome), key: "responsavelNome" },
    { type: "field", label: "RG do responsável legal", value: nonEmpty(ctx.responsavelRg), key: "responsavelRg" },
    { type: "field", label: "Contato telefônico do responsável", value: null },

    { type: "signature", who: "electronic", label: "Assinatura de quem consente" },
    { type: "checkbox", label: "Assino como paciente.", checked: !asResponsavel, key: "assinaComoPaciente" },
    { type: "checkbox", label: "Assino como responsável legal.", checked: asResponsavel, key: "assinaComoResponsavel" },

    { type: "heading", text: "Preenchimento exclusivo — profissional de saúde" },
    { type: "paragraph", text: "Afirmo, para os devidos fins legais, que expliquei detalhadamente todos os esclarecimentos necessários e que o paciente e/ou acompanhante compreendeu sobre benefícios, riscos e alternativas, tendo respondido às perguntas formuladas e assegurando-me de que houve período de reflexão suficiente para a tomada de decisão. De acordo com o meu entendimento, o(a) paciente e/ou seu responsável está em condições de compreender o que lhe foi informado e de que, a qualquer tempo, pode mudar de opinião e desistir da realização do procedimento." },
    { type: "field", label: "Data", value: nonEmpty(ctx.data) },
    { type: "signature", who: "blank", label: "Assinatura e carimbo do profissional de saúde" },
  ];
}

function buildImagem(ctx: TemplateContext): Block[] {
  return [
    { type: "heading", text: "Termo de Autorização de Uso de Imagem e Voz" },

    { type: "field", label: "Eu", value: nonEmpty(ctx.pacienteNome) },
    { type: "field", label: "RG", value: null },
    { type: "field", label: "CPF", value: nonEmpty(ctx.pacienteCpf) },
    { type: "field", label: "Endereço", value: null },
    { type: "field", label: "Município / UF", value: null },

    { type: "paragraph", text: `Autorizo a coleta e o uso de minha imagem e/ou voz, presentes em fotos, gravações de áudio e/ou vídeo realizadas em consultas e/ou avaliações em que participei, com a finalidade de confecção de atas, registros e históricos, criação de conteúdo em redes sociais e replicação em treinamentos, eventos, reuniões e afins, pela empresa ${LETTERHEAD.empresaRazaoSocial}, inscrita sob o CNPJ ${LETTERHEAD.empresaCnpj}, conforme a Lei 13.709/2018 (LGPD — Lei Geral de Proteção de Dados).` },
    { type: "paragraph", text: "As imagens, filmes e gravações de voz serão mantidos durante o período em que forem pertinentes ao alcance das finalidades acima citadas." },
    { type: "paragraph", text: "Quando publicados os vídeos e/ou fotos em mídia social, a ação será realizada sem possibilitar o download, ou seja, apenas em caráter informativo." },
    { type: "paragraph", text: "A presente autorização é concedida a título gratuito, abrangendo o uso da imagem e/ou voz acima mencionada em todo o território nacional e no exterior, em todas as suas modalidades e, em destaque, das seguintes formas: (I) home page; (II) mídias sociais; (III) divulgação em geral; (IV) material didático, inclusive para cessão de direitos de veiculação." },
    { type: "paragraph", text: "Este documento registra a manifestação livre, informada e inequívoca, conforme o disposto no Art. 5º, XII, da Lei 13.709/2018 (LGPD), e poderá ser revogado pelo titular, a qualquer momento, mediante solicitação por e-mail à empresa." },
    { type: "paragraph", text: "Por esta ser a expressão da minha vontade, declaro que autorizo o uso acima descrito sem que nada haja a ser reclamado a título de direitos conexos à minha imagem ou a qualquer outro." },

    { type: "signature", who: "electronic", label: "Assinatura do responsável" },
    { type: "signature", who: "blank", label: "Assinatura do responsável da empresa" },
  ];
}

function buildLaser(ctx: TemplateContext): Block[] {
  return [
    { type: "heading", text: "Protocolo de Laserterapia — Termo de Consentimento Livre e Esclarecido" },

    { type: "field", label: "Eu", value: nonEmpty(ctx.pacienteNome) },
    { type: "field", label: "CPF", value: nonEmpty(ctx.pacienteCpf) },

    { type: "paragraph", text: "Por este instrumento de consentimento informado e esclarecido, como paciente em pleno gozo de minhas faculdades mentais, livre e voluntariamente autorizo o tratamento de laserterapia de baixa frequência e/ou terapia fotodinâmica." },
    { type: "paragraph", text: "Os benefícios esperados pelo uso desse tipo de terapia são, segundo estudos prévios: diminuição da sintomatologia dolorosa dos músculos acometidos; uso de uma terapia indolor, de curto prazo, sem custos e sem riscos eminentes ao paciente e ao operador; melhora na qualidade de vida." },
    { type: "paragraph", text: "Os riscos que podem surgir ao longo do tratamento são: sintomatologia dolorosa persistente mesmo após o tratamento com o laser de baixa frequência (casos em que não se consegue a analgesia pretendida)." },
    { type: "paragraph", text: "Os procedimentos realizados e o número de sessões serão a critério do especialista, mas em média podem ser realizadas de 3 a 6 sessões clínicas com aplicação do laser: 2 a 3 vezes por semana, durante 2 semanas consecutivas, sendo que a sensibilidade à dor será analisada de acordo com uma escala, antes do tratamento inicial, depois de cada sessão e após 30 dias da última sessão clínica." },
    { type: "paragraph", text: "As normas de biossegurança e o uso de EPIs serão adotados durante todas as etapas do tratamento, tanto para o operador quanto para o paciente." },

    { type: "signature", who: "electronic", label: "Assinatura do paciente" },
    { type: "signature", who: "blank", label: "Assinatura do profissional — Silvana Lopes · Enfermeira · Especialista em Feridas · COREN-MT nº 481743" },
  ];
}

const BUILDERS: Record<ConsentKind, (ctx: TemplateContext) => Block[]> = {
  tcle: buildTcle,
  imagem: buildImagem,
  laser: buildLaser,
};

export function renderTemplate(
  kind: ConsentKind,
  ctx: TemplateContext,
): { title: string; blocks: Block[] } {
  return { title: TITLES[kind], blocks: BUILDERS[kind](ctx) };
}

export interface TcleFieldValues {
  tipoFerida: string | null;
  autoriza: boolean;
  responsavelNome: string | null;
  responsavelRg: string | null;
}

export function applyTcleFields(blocks: Block[], v: TcleFieldValues): Block[] {
  const asResponsavel = Boolean(nonEmpty(v.responsavelNome));
  return blocks.map((b): Block => {
    if (b.type === "field" && b.key === "tipoFerida") return { ...b, value: nonEmpty(v.tipoFerida) };
    if (b.type === "field" && b.key === "responsavelNome") return { ...b, value: nonEmpty(v.responsavelNome) };
    if (b.type === "field" && b.key === "responsavelRg") return { ...b, value: nonEmpty(v.responsavelRg) };
    if (b.type === "checkbox" && b.key === "autorizo") return { ...b, checked: v.autoriza };
    if (b.type === "checkbox" && b.key === "assinaComoPaciente") return { ...b, checked: !asResponsavel };
    if (b.type === "checkbox" && b.key === "assinaComoResponsavel") return { ...b, checked: asResponsavel };
    return b;
  });
}

function pad2(n: string): string {
  return n.length < 2 ? `0${n}` : n;
}

export function formatBrDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CLINIC_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${pad2(get("day"))}/${pad2(get("month"))}/${get("year")}`;
}

export function formatBrDateTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CLINIC_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${formatBrDate(date)} ${pad2(hour)}:${pad2(get("minute"))}`;
}
```

- [ ] **Step 6: Rodar o teste e ver passar**

Run: `npx vitest run src/modules/consents/templates.test.ts`
Expected: PASS.

- [ ] **Step 7: Verificar o módulo consents inteiro (memory/service/token intactos)**

Run: `npx vitest run src/modules/consents/`
Expected: PASS — `repository.memory.test.ts`, `service.test.ts`, `token.test.ts` não dependem de `templates.ts`.

> `npx tsc --noEmit` do projeto **falha** aqui: `pdf.ts`, `consent-sign-form.tsx`,
> `consent-cards.tsx`, `actions.ts` e `assinar/[token]/page.tsx` ainda importam
> `paragraphs` / `headerLines`. Restaurado na Task 8.

- [ ] **Step 8: Commit**

```bash
git add src/components/consents/letterhead.ts src/modules/consents/schemas.ts src/modules/consents/templates.ts src/modules/consents/templates.test.ts
git commit -m "$(printf 'feat(consents): templates por blocos + textos reais dos 3 termos\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01HijpUqTjZNjnN2XpG6wzko')"
```

---

## Task 3: `pdf.ts` — motor de blocos

**Files:**
- Modify: `src/components/consents/pdf.ts`
- Test: `src/components/consents/pdf.test.ts` (reescrito)

**Interfaces:**
- Consumes: `Block` de `@/modules/consents/templates`; `LETTERHEAD` de `./letterhead`; `pdf-lib` (dynamic import).
- Produces:
  - `export function wrapLine(text: string, maxWidth: number, measure: (s: string) => number): string[]` — **mantido, inalterado**
  - `export interface Geom { contentWidth: number; bodySize: number; lineHeight: number; usableHeight: number }`
  - `export type Prim = { kind: "text"; text: string; size: number; bold: boolean } | { kind: "checkbox"; text: string; checked: boolean } | { kind: "space"; h: number } | { kind: "sig"; who: "electronic" | "blank"; label: string; h: number }`
  - `export function measureBlock(block: Block, geom: Geom): Prim[]`
  - `export function layoutBlocks(blocks: Block[], geom: Geom, firstPageReserve: number): Prim[][]`
  - `export interface ConsentPdfInput { title: string; blocks: Block[]; signatureDataUrl: string; signerName: string; signedAtLabel: string }`
  - `export function buildConsentPdf(input: ConsentPdfInput): Promise<Uint8Array>`
- Removed: `layoutParagraphs`, `paginate`, `ConsentPdfInput.headerLines`, `ConsentPdfInput.paragraphs`.

- [ ] **Step 1: Escrever o teste reescrito (falhando)**

Substituir todo o conteúdo de `src/components/consents/pdf.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { wrapLine, measureBlock, layoutBlocks, type Geom } from "./pdf";
import type { Block } from "@/modules/consents/templates";

const measure = (s: string) => s.length; // 1 unidade por caractere

const geom: Geom = { contentWidth: 40, bodySize: 1, lineHeight: 1, usableHeight: 10 };

describe("wrapLine", () => {
  it("quebra em limites de palavra no maxWidth", () => {
    expect(wrapLine("aaa bbb ccc", 7, measure)).toEqual(["aaa bbb", "ccc"]);
  });
  it("mantém palavra longa sozinha na linha", () => {
    expect(wrapLine("supercalifragilistic word", 5, measure)).toEqual(["supercalifragilistic", "word"]);
  });
  it("string vazia vira uma linha em branco", () => {
    expect(wrapLine("", 5, measure)).toEqual([""]);
  });
});

describe("measureBlock", () => {
  const g: Geom = { contentWidth: 100, bodySize: 10, lineHeight: 14, usableHeight: 700 };

  it("field com valor: 'Label: valor'", () => {
    const prims = measureBlock({ type: "field", label: "Nome", value: "Maria" }, g);
    expect(prims.some((p) => p.kind === "text" && p.text.includes("Nome: Maria"))).toBe(true);
  });

  it("field sem valor: 'Label:' seguido de régua de sublinhados", () => {
    const prims = measureBlock({ type: "field", label: "Endereço", value: null }, g);
    const text = prims.find((p) => p.kind === "text");
    expect(text && "text" in text ? text.text : "").toMatch(/^Endereço:\s_+$/);
  });

  it("checkbox: um prim kind=checkbox com o estado", () => {
    const prims = measureBlock({ type: "checkbox", label: "Autorizo.", checked: true }, g);
    expect(prims.filter((p) => p.kind === "checkbox")).toEqual([
      { kind: "checkbox", text: "Autorizo.", checked: true },
    ]);
  });

  it("signature: um único prim atômico kind=sig com altura embutida", () => {
    const prims = measureBlock({ type: "signature", who: "electronic", label: "Assinatura" }, g);
    expect(prims).toHaveLength(1);
    expect(prims[0]).toMatchObject({ kind: "sig", who: "electronic", label: "Assinatura" });
    expect((prims[0] as { h: number }).h).toBeGreaterThan(g.lineHeight);
  });

  it("heading: prim de texto bold", () => {
    const prims = measureBlock({ type: "heading", text: "Título" }, g);
    expect(prims.some((p) => p.kind === "text" && "bold" in p && p.bold)).toBe(true);
  });
});

describe("layoutBlocks", () => {
  it("quebra em páginas quando a altura acumulada passa de usableHeight", () => {
    const blocks: Block[] = [
      { type: "paragraph", text: "a" },
      { type: "paragraph", text: "b" },
      { type: "paragraph", text: "c" },
    ];
    // usableHeight 10, cada parágrafo ~ lineHeight(1) + space; força >1 página
    const g: Geom = { contentWidth: 40, bodySize: 1, lineHeight: 4, usableHeight: 9 };
    const pages = layoutBlocks(blocks, g, 0);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flat().filter((p) => p.kind === "text" && p.text === "a")).toHaveLength(1);
  });

  it("nunca divide um bloco signature entre páginas", () => {
    const blocks: Block[] = [
      { type: "paragraph", text: "x" },
      { type: "paragraph", text: "y" },
      { type: "signature", who: "electronic", label: "Assinatura" },
    ];
    const g: Geom = { contentWidth: 40, bodySize: 1, lineHeight: 4, usableHeight: 12 };
    const pages = layoutBlocks(blocks, g, 0);
    const sigPage = pages.find((page) => page.some((p) => p.kind === "sig"));
    expect(sigPage).toBeDefined();
    // o prim sig aparece exatamente uma vez, numa única página
    expect(pages.flat().filter((p) => p.kind === "sig")).toHaveLength(1);
  });

  it("firstPageReserve reduz o espaço da primeira página", () => {
    const blocks: Block[] = [{ type: "paragraph", text: "a" }, { type: "paragraph", text: "b" }];
    const g: Geom = { contentWidth: 40, bodySize: 1, lineHeight: 4, usableHeight: 20 };
    const semReserva = layoutBlocks(blocks, g, 0);
    const comReserva = layoutBlocks(blocks, g, 18);
    expect(semReserva).toHaveLength(1);
    expect(comReserva.length).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npx vitest run src/components/consents/pdf.test.ts`
Expected: FAIL — `measureBlock` / `layoutBlocks` / `type Geom` não existem.

- [ ] **Step 3: Reescrever `pdf.ts`**

Substituir todo o conteúdo de `src/components/consents/pdf.ts`:

```ts
import type { PDFFont } from "pdf-lib";
import type { Block } from "@/modules/consents/templates";
import { LETTERHEAD } from "./letterhead";

export function wrapLine(
  text: string,
  maxWidth: number,
  measure: (s: string) => number,
): string[] {
  if (text === "") return [""];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && measure(candidate) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

export interface Geom {
  contentWidth: number;
  bodySize: number;
  lineHeight: number;
  usableHeight: number;
}

export type Prim =
  | { kind: "text"; text: string; size: number; bold: boolean }
  | { kind: "checkbox"; text: string; checked: boolean }
  | { kind: "space"; h: number }
  | { kind: "sig"; who: "electronic" | "blank"; label: string; h: number };

const HEADING_EXTRA = 3; // pt acima do bodySize para heading
const PARA_GAP = 6;
const FIELD_GAP = 4;
const HEADING_GAP_BEFORE = 12;
const HEADING_GAP_AFTER = 4;
const SIG_HEIGHT = 78; // gap de topo + imagem/linha + rótulo, atômico
const FIELD_RULE = " ____________________________";

function primHeight(prim: Prim, geom: Geom): number {
  switch (prim.kind) {
    case "text":
    case "checkbox":
      return geom.lineHeight;
    case "space":
      return prim.h;
    case "sig":
      return prim.h;
  }
}

export function measureBlock(block: Block, geom: Geom): Prim[] {
  const measureAt = (size: number) => (s: string) => s.length * size * 0.5;

  if (block.type === "heading") {
    return [
      { kind: "space", h: HEADING_GAP_BEFORE },
      ...wrapLine(block.text, geom.contentWidth, measureAt(geom.bodySize + HEADING_EXTRA)).map(
        (t): Prim => ({ kind: "text", text: t, size: geom.bodySize + HEADING_EXTRA, bold: true }),
      ),
      { kind: "space", h: HEADING_GAP_AFTER },
    ];
  }

  if (block.type === "paragraph") {
    return [
      ...wrapLine(block.text, geom.contentWidth, measureAt(geom.bodySize)).map(
        (t): Prim => ({ kind: "text", text: t, size: geom.bodySize, bold: false }),
      ),
      { kind: "space", h: PARA_GAP },
    ];
  }

  if (block.type === "field") {
    const line = block.value != null ? `${block.label}: ${block.value}` : `${block.label}:${FIELD_RULE}`;
    return [
      ...wrapLine(line, geom.contentWidth, measureAt(geom.bodySize)).map(
        (t): Prim => ({ kind: "text", text: t, size: geom.bodySize, bold: false }),
      ),
      { kind: "space", h: FIELD_GAP },
    ];
  }

  if (block.type === "checkbox") {
    return [
      { kind: "checkbox", text: block.label, checked: block.checked },
      { kind: "space", h: FIELD_GAP },
    ];
  }

  // signature — um único prim atômico
  return [{ kind: "sig", who: block.who, label: block.label, h: SIG_HEIGHT }];
}

export function layoutBlocks(blocks: Block[], geom: Geom, firstPageReserve: number): Prim[][] {
  const pages: Prim[][] = [[]];
  let used = firstPageReserve;

  const pushPrim = (prim: Prim) => {
    const h = primHeight(prim, geom);
    const cur = pages[pages.length - 1];
    // só pagina se a página atual já tem conteúdo (nunca cria página vazia)
    if (used + h > geom.usableHeight && cur.length > 0) {
      pages.push([]);
      used = 0;
      if (prim.kind === "space") return; // descarta o gap no topo da nova página
    }
    pages[pages.length - 1].push(prim);
    used += h;
  };

  for (const block of blocks) {
    for (const prim of measureBlock(block, geom)) pushPrim(prim);
  }
  return pages;
}

export interface ConsentPdfInput {
  title: string;
  blocks: Block[];
  signatureDataUrl: string; // PNG data URL
  signerName: string;
  signedAtLabel: string;
}

const PAGE_WIDTH = 595.28; // A4 pt
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const HEADER_H = 64; // faixa do timbre no topo
const FOOTER_H = 34; // faixa do rodapé
const BODY_SIZE = 10.5;
const LINE_HEIGHT = 15;
const TITLE_SIZE = 15;

export async function buildConsentPdf(input: ConsentPdfInput): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let logo: Awaited<ReturnType<typeof doc.embedPng>> | null = null;
  if (LETTERHEAD.logoPngBase64) {
    try {
      logo = await doc.embedPng(`data:image/png;base64,${LETTERHEAD.logoPngBase64}`);
    } catch {
      logo = null;
    }
  }

  const contentWidth = PAGE_WIDTH - MARGIN * 2;
  const geom: Geom = {
    contentWidth,
    bodySize: BODY_SIZE,
    lineHeight: LINE_HEIGHT,
    usableHeight: PAGE_HEIGHT - MARGIN * 2 - HEADER_H - FOOTER_H,
  };

  // reserva na 1ª página para o título do documento
  const titleLines = wrapLine(input.title, contentWidth, (s) => bold.widthOfTextAtSize(s, TITLE_SIZE));
  const firstPageReserve = titleLines.length * (TITLE_SIZE + 4) + 12;

  const pages = layoutBlocks(input.blocks, geom, firstPageReserve);

  const drawFrame = () => {
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    // timbre
    if (logo) {
      const w = 150;
      const h = (logo.height / logo.width) * w;
      page.drawImage(logo, { x: MARGIN, y: PAGE_HEIGHT - MARGIN - h, width: w, height: Math.min(h, HEADER_H) });
    } else {
      page.drawText(LETTERHEAD.empresaRazaoSocial, {
        x: MARGIN,
        y: PAGE_HEIGHT - MARGIN - 12,
        size: 11,
        font: bold,
        color: rgb(0.2, 0.2, 0.2),
      });
    }
    page.drawLine({
      start: { x: MARGIN, y: PAGE_HEIGHT - MARGIN - HEADER_H + 8 },
      end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - MARGIN - HEADER_H + 8 },
      thickness: 0.5,
      color: rgb(0.75, 0.75, 0.75),
    });
    // rodapé
    page.drawText(LETTERHEAD.footer, {
      x: MARGIN,
      y: MARGIN - 4,
      size: 7.5,
      font,
      color: rgb(0.45, 0.45, 0.45),
    });
    return page;
  };

  let page = drawFrame();
  let y = PAGE_HEIGHT - MARGIN - HEADER_H;

  // título só na 1ª página
  for (const line of titleLines) {
    page.drawText(line, { x: MARGIN, y: y - TITLE_SIZE, size: TITLE_SIZE, font: bold });
    y -= TITLE_SIZE + 4;
  }
  y -= 12;

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const pagePrims = pages[pageIndex];
    if (pageIndex > 0) {
      page = drawFrame();
      y = PAGE_HEIGHT - MARGIN - HEADER_H;
    }
    for (const prim of pagePrims) {
      if (prim.kind === "space") {
        y -= prim.h;
      } else if (prim.kind === "text") {
        page.drawText(prim.text, {
          x: MARGIN,
          y: y - prim.size,
          size: prim.size,
          font: prim.bold ? bold : font,
        });
        y -= LINE_HEIGHT;
      } else if (prim.kind === "checkbox") {
        const box = 9;
        const top = y - BODY_SIZE;
        page.drawRectangle({
          x: MARGIN,
          y: top,
          width: box,
          height: box,
          borderColor: rgb(0.2, 0.2, 0.2),
          borderWidth: 0.8,
        });
        if (prim.checked) {
          page.drawLine({ start: { x: MARGIN + 1.5, y: top + 4 }, end: { x: MARGIN + 3.5, y: top + 1.5 }, thickness: 1, color: rgb(0.1, 0.1, 0.1) });
          page.drawLine({ start: { x: MARGIN + 3.5, y: top + 1.5 }, end: { x: MARGIN + 7.5, y: top + 7.5 }, thickness: 1, color: rgb(0.1, 0.1, 0.1) });
        }
        page.drawText(prim.text, { x: MARGIN + box + 6, y: y - BODY_SIZE, size: BODY_SIZE, font });
        y -= LINE_HEIGHT;
      } else {
        // sig
        y -= 16; // gap de topo do bloco
        if (prim.who === "electronic" && input.signatureDataUrl) {
          try {
            const png = await doc.embedPng(input.signatureDataUrl);
            const w = 170;
            const h = Math.min((png.height / png.width) * w, 44);
            page.drawImage(png, { x: MARGIN, y: y - h, width: w, height: h });
            y -= h + 2;
          } catch {
            y -= 20;
          }
        } else {
          y -= 24;
        }
        page.drawLine({
          start: { x: MARGIN, y },
          end: { x: MARGIN + 280, y },
          thickness: 0.5,
          color: rgb(0.2, 0.2, 0.2),
        });
        y -= 12;
        page.drawText(prim.label, { x: MARGIN, y: y - 8, size: 8, font, color: rgb(0.3, 0.3, 0.3) });
        if (prim.who === "electronic") {
          y -= 20;
          page.drawText(
            `Assinado eletronicamente por ${input.signerName} em ${input.signedAtLabel}`,
            { x: MARGIN, y: y - 8, size: 7.5, font, color: rgb(0.35, 0.35, 0.35) },
          );
        }
        y -= 14;
      }
    }
  }

  return doc.save();
}

export type { PDFFont };
```

> **Nota:** `buildConsentPdf` não tem teste unitário — a saída visual do
> `pdf-lib` é "não testada de propósito" (design doc). O loop de páginas é um
> `for` indexado (não `forEach`) de propósito: o ramo `sig` usa `await
> doc.embedPng(...)` para a imagem da assinatura, e `forEach` engoliria a
> Promise.

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npx vitest run src/components/consents/pdf.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck só do arquivo**

Run: `npx tsc --noEmit`
Expected: continua falhando em `consent-sign-form.tsx`, `consent-cards.tsx`, `actions.ts`, `assinar/[token]/page.tsx` (consumidores). **NÃO deve haver erro novo em `pdf.ts` nem `pdf.test.ts`.** Restaurado na Task 8.

- [ ] **Step 6: Commit**

```bash
git add src/components/consents/pdf.ts src/components/consents/pdf.test.ts
git commit -m "$(printf 'feat(consents): motor de PDF por blocos + timbre por página\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01HijpUqTjZNjnN2XpG6wzko')"
```

---

## Task 4: `token.ts` — `tipoFerida` nas claims do link

**Files:**
- Modify: `src/modules/consents/token.ts`
- Test: `src/modules/consents/token.test.ts`

**Interfaces:**
- Consumes: `CONSENT_KINDS`, `ConsentKind` de `./schemas`.
- Produces:
  - `ConsentClaims` passa a ter `tipoFerida?: string`
  - `signConsentToken(claims: ConsentClaims, ttlSeconds: number, now?: number): Promise<string>` — mesma assinatura; grava `t` no payload quando `claims.tipoFerida` presente
  - `verifyConsentToken(token: string, now?: number): Promise<ConsentClaims | null>` — devolve `tipoFerida` quando o payload tem `t`

- [ ] **Step 1: Adicionar os casos de teste (falhando)**

Em `src/modules/consents/token.test.ts`, adicionar ao final do `describe("consent token", ...)`:

```ts
  it("round-trips tipoFerida quando presente", async () => {
    const token = await signConsentToken({ ...claims, tipoFerida: "úlcera venosa" }, 3600);
    expect(await verifyConsentToken(token)).toEqual({ ...claims, tipoFerida: "úlcera venosa" });
  });

  it("token sem tipoFerida continua válido e não devolve a chave", async () => {
    const token = await signConsentToken(claims, 3600);
    const out = await verifyConsentToken(token);
    expect(out).toEqual(claims);
    expect(out && "tipoFerida" in out).toBe(false);
  });

  it("tipoFerida adulterado quebra o HMAC", async () => {
    const token = await signConsentToken({ ...claims, tipoFerida: "a" }, 3600);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString("utf8")), t: "b" }),
    ).toString("base64url");
    expect(await verifyConsentToken(`${forged}.${sig}`)).toBeNull();
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/consents/token.test.ts`
Expected: FAIL — `verifyConsentToken` não devolve `tipoFerida`.

- [ ] **Step 3: Editar `token.ts`**

`ConsentClaims`:

```ts
export interface ConsentClaims {
  accountId: string;
  contactId: string;
  kind: ConsentKind;
  tipoFerida?: string;
}
```

`TokenPayload`:

```ts
interface TokenPayload {
  a: string;
  c: string;
  k: string;
  e: number; // expiry, epoch seconds
  t?: string; // tipoFerida (só no TCLE via link)
}
```

Em `signConsentToken`, montar o payload assim:

```ts
  const payload: TokenPayload = {
    a: claims.accountId,
    c: claims.contactId,
    k: claims.kind,
    e: Math.floor(now / 1000) + ttlSeconds,
  };
  if (claims.tipoFerida) payload.t = claims.tipoFerida;
```

Em `verifyConsentToken`, no `return` final:

```ts
  const out: ConsentClaims = {
    accountId: payload.a,
    contactId: payload.c,
    kind: payload.k as ConsentKind,
  };
  if (typeof payload.t === "string" && payload.t !== "") out.tipoFerida = payload.t;
  return out;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/consents/token.test.ts`
Expected: PASS (inclusive os testes antigos).

- [ ] **Step 5: Commit**

```bash
git add src/modules/consents/token.ts src/modules/consents/token.test.ts
git commit -m "$(printf 'feat(consents): tipoFerida nas claims do token de link\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01HijpUqTjZNjnN2XpG6wzko')"
```

---

## Task 5: `consent-sign-form.tsx` — props de bloco + campos do TCLE + bloqueio na recusa

**Files:**
- Modify: `src/components/consents/consent-sign-form.tsx`
- Test: `src/components/consents/consent-sign-form.test.tsx` (reescrito)

**Interfaces:**
- Consumes: `applyTcleFields`, `formatBrDateTime`, `type Block`, `type TcleFieldValues` de `@/modules/consents/templates`; `type ConsentKind` de `@/modules/consents/schemas`; `buildConsentPdf` de `./pdf`; `SignaturePad` de `./signature-pad`; `Button` de `@/components/ui/button`.
- Produces:
  - `export interface ConsentSignFormProps { kind: ConsentKind; documentTitle: string; blocks: Block[]; defaultSignerName: string; submitLabel: string; tipoFerida?: string; onComplete: (args: { pdfBytes: Uint8Array; signerName: string }) => Promise<{ ok: boolean; error?: string }>; onDone?: () => void }`
  - `export function ConsentSignForm(props: ConsentSignFormProps)`
- Removed: `headerLines`, `paragraphs`.

- [ ] **Step 1: Escrever o teste reescrito (falhando)**

Substituir todo o conteúdo de `src/components/consents/consent-sign-form.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConsentSignForm } from "./consent-sign-form";
import type { Block } from "@/modules/consents/templates";

const buildConsentPdf = vi.fn(async () => new Uint8Array([1, 2, 3]));
vi.mock("./pdf", () => ({ buildConsentPdf: (...a: unknown[]) => buildConsentPdf(...a) }));
vi.mock("./signature-pad", () => ({
  SignaturePad: () => <div data-testid="pad" />,
}));

const tcleBlocks: Block[] = [
  { type: "heading", text: "TCLE" },
  { type: "paragraph", text: "Corpo do termo." },
  { type: "field", label: "Tipo de ferida", value: null, key: "tipoFerida" },
  { type: "checkbox", label: "Autorizo a realização do tratamento proposto.", checked: false, key: "autorizo" },
  { type: "checkbox", label: "Não autorizo a realização do tratamento proposto.", checked: false, key: "naoAutorizo" },
  { type: "field", label: "Nome do responsável legal", value: null, key: "responsavelNome" },
  { type: "field", label: "RG do responsável legal", value: null, key: "responsavelRg" },
  { type: "signature", who: "electronic", label: "Assinatura de quem consente" },
];
const laserBlocks: Block[] = [
  { type: "heading", text: "Laser" },
  { type: "paragraph", text: "Corpo do laser." },
  { type: "signature", who: "electronic", label: "Assinatura do paciente" },
];

// signature_pad é mockado; para os testes que precisam de traço, força isEmpty=false
function stubPadNotEmpty() {
  // o componente usa padRef.current?.isEmpty(); o mock não expõe ref, então
  // esses testes cobrem só o caminho de validação anterior ao pad.
}

beforeEach(() => {
  buildConsentPdf.mockClear();
});

describe("ConsentSignForm — TCLE", () => {
  it("mostra os campos extras do TCLE", () => {
    render(
      <ConsentSignForm
        kind="tcle"
        documentTitle="TCLE"
        blocks={tcleBlocks}
        defaultSignerName="Maria"
        submitLabel="Confirmar"
        onComplete={async () => ({ ok: true })}
      />,
    );
    expect(screen.getByLabelText(/Tipo de ferida/i)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Autorizo o tratamento/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Não autorizo/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Assino como responsável legal/i)).toBeInTheDocument();
  });

  it("'Não autorizo' bloqueia: mostra aviso e não chama onComplete", async () => {
    const onComplete = vi.fn(async () => ({ ok: true }));
    render(
      <ConsentSignForm
        kind="tcle"
        documentTitle="TCLE"
        blocks={tcleBlocks}
        defaultSignerName="Maria"
        submitLabel="Confirmar"
        onComplete={onComplete}
      />,
    );
    await userEvent.click(screen.getByRole("radio", { name: /Não autorizo/i }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(
      screen.getByText("Sem autorização do tratamento, o documento não é registrado."),
    ).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
    expect(buildConsentPdf).not.toHaveBeenCalled();
  });

  it("botão fica desabilitado enquanto a autorização não é escolhida", () => {
    render(
      <ConsentSignForm
        kind="tcle"
        documentTitle="TCLE"
        blocks={tcleBlocks}
        defaultSignerName="Maria"
        submitLabel="Confirmar"
        onComplete={async () => ({ ok: true })}
      />,
    );
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
  });

  it("toggle de responsável exige nome e RG (botão desabilitado sem eles)", async () => {
    render(
      <ConsentSignForm
        kind="tcle"
        documentTitle="TCLE"
        blocks={tcleBlocks}
        defaultSignerName="Maria"
        submitLabel="Confirmar"
        onComplete={async () => ({ ok: true })}
      />,
    );
    await userEvent.click(screen.getByRole("radio", { name: /Autorizo o tratamento/i }));
    await userEvent.click(screen.getByLabelText(/Assino como responsável legal/i));
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Nome do responsável/i), "João");
    await userEvent.type(screen.getByLabelText(/RG do responsável/i), "MT-1");
    // ainda pode faltar o traço da assinatura, mas os campos de responsável já não bloqueiam
    expect(screen.getByLabelText(/Nome do responsável/i)).toHaveValue("João");
  });

  it("tipoFerida vindo por prop aparece somente leitura", () => {
    render(
      <ConsentSignForm
        kind="tcle"
        documentTitle="TCLE"
        blocks={tcleBlocks}
        defaultSignerName="Maria"
        submitLabel="Confirmar"
        tipoFerida="úlcera venosa"
        onComplete={async () => ({ ok: true })}
      />,
    );
    const input = screen.getByLabelText(/Tipo de ferida/i);
    expect(input).toHaveValue("úlcera venosa");
    expect(input).toHaveAttribute("readonly");
  });
});

describe("ConsentSignForm — imagem/laser", () => {
  it("não mostra campos do TCLE", () => {
    render(
      <ConsentSignForm
        kind="laser"
        documentTitle="Laser"
        blocks={laserBlocks}
        defaultSignerName="Maria"
        submitLabel="Confirmar"
        onComplete={async () => ({ ok: true })}
      />,
    );
    expect(screen.queryByLabelText(/Tipo de ferida/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("mostra o texto do documento a partir dos blocos", () => {
    render(
      <ConsentSignForm
        kind="laser"
        documentTitle="Laser"
        blocks={laserBlocks}
        defaultSignerName="Maria"
        submitLabel="Confirmar"
        onComplete={async () => ({ ok: true })}
      />,
    );
    expect(screen.getByText("Corpo do laser.")).toBeInTheDocument();
  });

  it("bloqueia submit quando o nome está vazio", async () => {
    const onComplete = vi.fn(async () => ({ ok: true }));
    render(
      <ConsentSignForm
        kind="laser"
        documentTitle="Laser"
        blocks={laserBlocks}
        defaultSignerName=""
        submitLabel="Confirmar"
        onComplete={onComplete}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(screen.getByText("Informe o nome de quem assina.")).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/components/consents/consent-sign-form.test.tsx`
Expected: FAIL — `ConsentSignForm` ainda usa `paragraphs`/`headerLines` e não tem campos do TCLE.

- [ ] **Step 3: Reescrever `consent-sign-form.tsx`**

Substituir todo o conteúdo de `src/components/consents/consent-sign-form.tsx`:

```tsx
"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  applyTcleFields,
  formatBrDateTime,
  type Block,
  type TcleFieldValues,
} from "@/modules/consents/templates";
import type { ConsentKind } from "@/modules/consents/schemas";
import { buildConsentPdf } from "./pdf";
import { SignaturePad, type SignaturePadHandle } from "./signature-pad";

export interface ConsentSignFormProps {
  kind: ConsentKind;
  documentTitle: string;
  blocks: Block[];
  defaultSignerName: string;
  submitLabel: string;
  tipoFerida?: string;
  onComplete: (args: {
    pdfBytes: Uint8Array;
    signerName: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  onDone?: () => void;
}

function BlockPreview({ block }: { block: Block }) {
  switch (block.type) {
    case "heading":
      return <p className="mt-2 font-semibold">{block.text}</p>;
    case "paragraph":
      return <p className="whitespace-pre-wrap">{block.text}</p>;
    case "field":
      return (
        <p className="text-muted-foreground">
          {block.label}: {block.value ?? "—"}
        </p>
      );
    case "checkbox":
      return (
        <p className="text-muted-foreground">
          {block.checked ? "☑" : "☐"} {block.label}
        </p>
      );
    case "signature":
      return <p className="text-muted-foreground">— {block.label} —</p>;
  }
}

export function ConsentSignForm(props: ConsentSignFormProps) {
  const isTcle = props.kind === "tcle";
  const tipoFeridaLocked = isTcle && typeof props.tipoFerida === "string";

  const [signerName, setSignerName] = useState(props.defaultSignerName);
  const [tipoFerida, setTipoFerida] = useState(props.tipoFerida ?? "");
  const [autoriza, setAutoriza] = useState<"" | "sim" | "nao">("");
  const [comoResponsavel, setComoResponsavel] = useState(false);
  const [responsavelNome, setResponsavelNome] = useState("");
  const [responsavelRg, setResponsavelRg] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const padRef = useRef<SignaturePadHandle>(null);

  const effectiveSignerName = (comoResponsavel ? responsavelNome : signerName).trim();

  const canSubmit = useMemo(() => {
    if (busy || !effectiveSignerName) return false;
    if (isTcle) {
      if (autoriza === "") return false;
      if (comoResponsavel && (!responsavelNome.trim() || !responsavelRg.trim())) return false;
    }
    return true;
  }, [busy, effectiveSignerName, isTcle, autoriza, comoResponsavel, responsavelNome, responsavelRg]);

  async function handleSubmit() {
    if (busy) return;
    if (isTcle && autoriza === "nao") {
      setError("Sem autorização do tratamento, o documento não é registrado.");
      return;
    }
    if (!effectiveSignerName) {
      setError("Informe o nome de quem assina.");
      return;
    }
    if (isTcle && autoriza === "") {
      setError("Escolha se autoriza ou não o tratamento.");
      return;
    }
    if (isTcle && comoResponsavel && (!responsavelNome.trim() || !responsavelRg.trim())) {
      setError("Informe nome e RG do responsável legal.");
      return;
    }
    if (padRef.current?.isEmpty() ?? true) {
      setError("Assine no quadro antes de confirmar.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const finalBlocks = isTcle
        ? applyTcleFields(props.blocks, {
            tipoFerida: tipoFerida.trim() || null,
            autoriza: true,
            responsavelNome: comoResponsavel ? responsavelNome.trim() : null,
            responsavelRg: comoResponsavel ? responsavelRg.trim() : null,
          } satisfies TcleFieldValues)
        : props.blocks;

      const pdfBytes = await buildConsentPdf({
        title: props.documentTitle,
        blocks: finalBlocks,
        signatureDataUrl: padRef.current!.toDataURL(),
        signerName: effectiveSignerName,
        signedAtLabel: formatBrDateTime(new Date()),
      });
      const res = await props.onComplete({ pdfBytes, signerName: effectiveSignerName });
      if (!res.ok) {
        setError(res.error ?? "Não foi possível salvar. Tente novamente.");
        return;
      }
      props.onDone?.();
    } catch {
      setError("Não foi possível gerar o documento neste aparelho.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border bg-muted/20 p-3 text-sm">
        {props.blocks.map((b, i) => (
          <BlockPreview key={i} block={b} />
        ))}
      </div>

      {isTcle && (
        <div className="space-y-3 rounded-md border p-3">
          <label className="block text-sm">
            <span className="text-muted-foreground">Tipo de ferida</span>
            <input
              value={tipoFerida}
              readOnly={tipoFeridaLocked}
              onChange={(e) => setTipoFerida(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1 read-only:bg-muted/40"
            />
          </label>

          <fieldset className="space-y-1 text-sm">
            <legend className="text-muted-foreground">Sobre o tratamento proposto</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="autoriza"
                checked={autoriza === "sim"}
                onChange={() => setAutoriza("sim")}
              />
              <span>Autorizo o tratamento proposto</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="autoriza"
                checked={autoriza === "nao"}
                onChange={() => setAutoriza("nao")}
              />
              <span>Não autorizo o tratamento proposto</span>
            </label>
          </fieldset>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={comoResponsavel}
              onChange={(e) => setComoResponsavel(e.target.checked)}
            />
            <span>Assino como responsável legal</span>
          </label>

          {comoResponsavel && (
            <div className="space-y-2">
              <label className="block text-sm">
                <span className="text-muted-foreground">Nome do responsável legal</span>
                <input
                  value={responsavelNome}
                  onChange={(e) => setResponsavelNome(e.target.value)}
                  className="mt-1 w-full rounded border px-2 py-1"
                />
              </label>
              <label className="block text-sm">
                <span className="text-muted-foreground">RG do responsável legal</span>
                <input
                  value={responsavelRg}
                  onChange={(e) => setResponsavelRg(e.target.value)}
                  className="mt-1 w-full rounded border px-2 py-1"
                />
              </label>
            </div>
          )}
        </div>
      )}

      {!comoResponsavel && (
        <label className="block text-sm">
          <span className="text-muted-foreground">Nome de quem assina</span>
          <input
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            className="mt-1 w-full rounded border px-2 py-1"
          />
        </label>
      )}

      <div className="space-y-1">
        <span className="text-sm text-muted-foreground">Assinatura</span>
        <SignaturePad ref={padRef} className="h-40 w-full touch-none rounded-md border bg-white" />
        <button
          type="button"
          className="text-xs text-muted-foreground hover:underline"
          onClick={() => padRef.current?.clear()}
        >
          Limpar
        </button>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <Button type="button" disabled={!canSubmit} onClick={handleSubmit}>
        {busy ? "Salvando…" : props.submitLabel}
      </Button>
    </div>
  );
}
```

> **Nota de teste:** o teste "botão desabilitado enquanto a autorização não é
> escolhida" depende de `canSubmit` incluir `autoriza === ""`. O teste do
> "Não autorizo" clica no rádio e no botão — como `autoriza === "nao"` deixa
> `canSubmit` **true** (nome ok, autorização escolhida), o clique dispara
> `handleSubmit`, que curto-circuita no topo com a mensagem de bloqueio antes
> de tocar no pad. Confirme essa ordem ao implementar.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/components/consents/consent-sign-form.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/consents/consent-sign-form.tsx src/components/consents/consent-sign-form.test.tsx
git commit -m "$(printf 'feat(consents): campos do TCLE no form de assinatura + bloqueio na recusa\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01HijpUqTjZNjnN2XpG6wzko')"
```

---

## Task 6: `consent-cards.tsx` + página de documentos + `getConsentPageDataAction`

**Files:**
- Modify: `src/components/consents/consent-cards.tsx`
- Modify: `src/app/(app)/pacientes/[id]/documentos/page.tsx`
- Modify: `src/app/(app)/pacientes/[id]/actions.ts` (`getConsentPageDataAction`, `createConsentLinkAction`)

**Interfaces:**
- Consumes: `renderTemplate` (agora `{ title, blocks }`) e `formatBrDate` de `@/modules/consents/templates`; `CONSENT_KINDS`, `ConsentKind` de `@/modules/consents/schemas`; `type Block` de `@/modules/consents/templates`.
- Produces:
  - `getConsentPageDataAction(contactId)` retorna `{ patientName: string; professionalMissing: boolean; docs: { kind: ConsentKind; title: string; blocks: Block[] }[]; consents: ... }` — **sem `headerLines`**
  - `createConsentLinkAction(contactId: string, kind: string, extra?: { tipoFerida?: string }): Promise<{ url: string }>`
  - `ConsentCards` props: `{ contactId, patientName, professionalMissing, docs, initialConsents }` — **sem `headerLines`**; `Doc = { kind: ConsentKind; title: string; blocks: Block[] }`

- [ ] **Step 1: Editar `getConsentPageDataAction` em `actions.ts`**

Substituir o corpo de `getConsentPageDataAction` (mantendo o nome e a assinatura):

```ts
export async function getConsentPageDataAction(contactId: string) {
  const c = await ctx();
  const [contact, identity, consentRows] = await Promise.all([
    c.crmRepo.getContact(c.accountId, contactId),
    getAccountProfessionalIdentity(c.supabase, c.accountId),
    listConsentsAction(contactId),
  ]);
  if (!contact) throw new Error("Paciente não encontrado");

  const templateCtx = {
    pacienteNome: contact.name,
    pacienteCpf: contact.cpf,
    pacienteNascimento: contact.birthDate,
    pacienteTelefone: contact.phone ?? null,
    clinicaNome: identity.name,
    profissionalNome: identity.professionalName,
    profissionalConselho: identity.councilId,
    data: formatBrDate(new Date()),
  };

  const docs = CONSENT_KINDS.map((kind) => {
    const t = renderTemplate(kind, templateCtx);
    return { kind, title: t.title, blocks: t.blocks };
  });

  return {
    patientName: contact.name,
    professionalMissing: !identity.professionalName,
    docs,
    consents: consentRows,
  };
}
```

- [ ] **Step 2: Editar `createConsentLinkAction` em `actions.ts`**

```ts
export async function createConsentLinkAction(
  contactId: string,
  kind: string,
  extra?: { tipoFerida?: string },
) {
  assertConsentKind(kind);
  const c = await ctx();
  const contact = await c.crmRepo.getContact(c.accountId, contactId);
  if (!contact) throw new Error("Paciente não encontrado");
  const tipoFerida = extra?.tipoFerida?.trim();
  const token = await signConsentToken(
    { accountId: c.accountId, contactId, kind, ...(tipoFerida ? { tipoFerida } : {}) },
    CONSENT_LINK_TTL_SECONDS,
  );
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "";
  return { url: `${proto}://${host}/assinar/${token}` };
}
```

- [ ] **Step 3: Editar `documentos/page.tsx`**

Remover `headerLines={data.headerLines}` do `<ConsentCards>`. O JSX fica:

```tsx
        <ConsentCards
          contactId={id}
          patientName={data.patientName}
          professionalMissing={data.professionalMissing}
          docs={data.docs}
          initialConsents={data.consents}
        />
```

- [ ] **Step 4: Editar `consent-cards.tsx`**

Mudanças:

1. Import: trocar por
   ```ts
   import { formatBrDate } from "@/modules/consents/templates";
   import type { Block } from "@/modules/consents/templates";
   import type { ConsentKind } from "@/modules/consents/schemas";
   ```
2. `type Doc = { kind: ConsentKind; title: string; blocks: Block[] };`
3. Props: remover `headerLines: string[];` da desestruturação e da assinatura.
4. Estado de link — substituir `const [linkFor, setLinkFor] = useState<{ doc: Doc; url: string } | null>(null);` por:
   ```ts
   const [linkState, setLinkState] = useState<
     | { doc: Doc; phase: "form"; tipoFerida: string }
     | { doc: Doc; phase: "done"; url: string }
     | null
   >(null);
   ```
5. `handleLink` vira:
   ```ts
   async function handleLink(doc: Doc) {
     setError(null);
     if (doc.kind === "tcle") {
       setLinkState({ doc, phase: "form", tipoFerida: "" });
       return;
     }
     try {
       const { url } = await createConsentLinkAction(contactId, doc.kind);
       setLinkState({ doc, phase: "done", url });
     } catch (err) {
       setError(err instanceof Error ? err.message : "Erro ao gerar link");
     }
   }

   async function generateTcleLink(doc: Doc, tipoFerida: string) {
     setError(null);
     try {
       const { url } = await createConsentLinkAction(contactId, doc.kind, { tipoFerida });
       setLinkState({ doc, phase: "done", url });
     } catch (err) {
       setError(err instanceof Error ? err.message : "Erro ao gerar link");
     }
   }
   ```
6. Diálogo "Assinar" — trocar as props passadas ao `ConsentSignForm`:
   ```tsx
   {signing && (
     <ConsentSignForm
       kind={signing.kind}
       documentTitle={signing.title}
       blocks={signing.blocks}
       defaultSignerName={patientName}
       submitLabel="Confirmar assinatura"
       onComplete={({ pdfBytes, signerName }) =>
         handleComplete(signing.kind, pdfBytes, signerName)
       }
       onDone={async () => {
         setSigning(null);
         await refresh();
       }}
     />
   )}
   ```
7. Diálogo de link — substituir o bloco `<Dialog open={linkFor !== null} ...>` por:
   ```tsx
   <Dialog open={linkState !== null} onOpenChange={(open) => !open && setLinkState(null)}>
     <DialogContent>
       <DialogHeader>
         <DialogTitle>
           {linkState ? `Link para ${linkState.doc.title}` : ""}
         </DialogTitle>
       </DialogHeader>
       {linkState?.phase === "form" && (
         <div className="space-y-3">
           <label className="block text-sm">
             <span className="text-muted-foreground">Tipo de ferida</span>
             <input
               value={linkState.tipoFerida}
               onChange={(e) =>
                 setLinkState({ ...linkState, tipoFerida: e.target.value })
               }
               className="mt-1 w-full rounded border px-2 py-1"
             />
           </label>
           <Button
             type="button"
             size="sm"
             onClick={() => generateTcleLink(linkState.doc, linkState.tipoFerida)}
           >
             Gerar link
           </Button>
         </div>
       )}
       {linkState?.phase === "done" && (
         <div className="space-y-3">
           <QrCode url={linkState.url} />
           <input
             readOnly
             value={linkState.url}
             onFocus={(e) => e.currentTarget.select()}
             className="w-full rounded border px-2 py-1 text-xs"
           />
           <p className="text-xs text-muted-foreground">
             O link expira em 48 horas. Mostre o QR ou envie pelo WhatsApp.
           </p>
         </div>
       )}
     </DialogContent>
   </Dialog>
   ```

(`QrCode`, `handleComplete`, `handleDelete`, a lista de cards e o `<Dialog>` de assinatura seguem iguais, exceto o que está acima.)

- [ ] **Step 5: Rodar os testes de componente do módulo**

Run: `npx vitest run src/components/consents/`
Expected: PASS (nenhum teste novo aqui; garante que `consent-sign-form.test.tsx` e `pdf.test.ts` seguem verdes com os imports atualizados).

- [ ] **Step 6: Commit**

```bash
git add src/components/consents/consent-cards.tsx "src/app/(app)/pacientes/[id]/documentos/page.tsx" "src/app/(app)/pacientes/[id]/actions.ts"
git commit -m "$(printf 'feat(consents): cards e page-data por blocos + tipo de ferida no link\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01HijpUqTjZNjnN2XpG6wzko')"
```

---

## Task 7: Rota pública `/assinar/[token]` + `public-consent-form.tsx`

**Files:**
- Modify: `src/app/assinar/[token]/page.tsx`
- Modify: `src/components/consents/public-consent-form.tsx`

**Interfaces:**
- Consumes: `verifyConsentToken` (agora devolve `tipoFerida?`), `renderTemplate` (`{ title, blocks }`), `type Block`, `ConsentKind`.
- Produces:
  - `PublicConsentForm` props: `{ token: string; kind: ConsentKind; documentTitle: string; blocks: Block[]; tipoFerida?: string; defaultSignerName: string }` — **`paragraphs` e `headerLines` removidos**

- [ ] **Step 1: Editar `assinar/[token]/page.tsx`**

No `loadPage`, retornar o `kind`+`tipoFerida` das claims e o nome do paciente (já faz). Trocar a montagem do template + o JSX final:

```tsx
  const { kind, patientName, identity, tipoFerida } = loaded;

  const t = renderTemplate(kind, {
    pacienteNome: patientName,
    pacienteCpf: null,
    pacienteNascimento: null,
    pacienteTelefone: null,
    clinicaNome: identity.name,
    profissionalNome: identity.professionalName,
    profissionalConselho: identity.councilId,
    data: formatBrDate(new Date()),
    tipoFerida: tipoFerida ?? null,
  });

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-xl font-bold">{t.title}</h1>
      <PublicConsentForm
        token={token}
        kind={kind}
        documentTitle={t.title}
        blocks={t.blocks}
        tipoFerida={tipoFerida}
        defaultSignerName={patientName}
      />
    </div>
  );
```

E no tipo de retorno / corpo de `loadPage`, incluir `tipoFerida: claims.tipoFerida` no objeto retornado:

```ts
async function loadPage(
  token: string,
): Promise<{ kind: ConsentKind; patientName: string; identity: Identity; tipoFerida?: string } | null> {
  const claims = await verifyConsentToken(token);
  if (!claims) return null;
  // ... (query de contacts inalterada) ...
    return { kind: claims.kind, patientName: data.name, identity, tipoFerida: claims.tipoFerida };
```

Remover a construção de `headerLines` (não é mais usada).

- [ ] **Step 2: Editar `public-consent-form.tsx`**

```tsx
"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { submitPublicConsentAction } from "@/app/assinar/actions";
import type { Block } from "@/modules/consents/templates";
import type { ConsentKind } from "@/modules/consents/schemas";

const ConsentSignForm = dynamic(
  () => import("./consent-sign-form").then((m) => m.ConsentSignForm),
  { ssr: false },
);

export function PublicConsentForm(props: {
  token: string;
  kind: ConsentKind;
  documentTitle: string;
  blocks: Block[];
  tipoFerida?: string;
  defaultSignerName: string;
}) {
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <p className="rounded-md bg-green-50 p-4 text-sm text-green-800">
        Assinatura registrada. Você já pode devolver o aparelho à profissional.
      </p>
    );
  }

  return (
    <ConsentSignForm
      kind={props.kind}
      documentTitle={props.documentTitle}
      blocks={props.blocks}
      tipoFerida={props.tipoFerida}
      defaultSignerName={props.defaultSignerName}
      submitLabel="Confirmar assinatura"
      onComplete={async ({ pdfBytes, signerName }) => {
        const fd = new FormData();
        fd.set("file", new Blob([pdfBytes as BlobPart], { type: "application/pdf" }), "consent.pdf");
        fd.set("signerName", signerName);
        return submitPublicConsentAction(props.token, fd);
      }}
      onDone={() => setDone(true)}
    />
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/assinar/[token]/page.tsx" src/components/consents/public-consent-form.tsx
git commit -m "$(printf 'feat(consents): rota pública de assinatura por blocos + tipoFerida do token\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01HijpUqTjZNjnN2XpG6wzko')"
```

---

## Task 8: Integração — typecheck, lint e suíte completa

**Files:**
- Nenhum arquivo novo. Correções pontuais onde `tsc`/`eslint` apontarem.

**Interfaces:**
- Consumes: tudo das Tasks 2–7.
- Produces: `npx tsc --noEmit`, `npx vitest run` e `npx eslint` limpos.

- [ ] **Step 1: Typecheck do projeto inteiro**

Run: `npx tsc --noEmit`
Expected: PASS. Se aparecer erro, é consumidor de `renderTemplate`/`ConsentSignForm`/`buildConsentPdf` que passou despercebido — corrigir para o novo shape (blocos, sem `headerLines`/`paragraphs`). Locais prováveis já cobertos: `actions.ts`, `documentos/page.tsx`, `consent-cards.tsx`, `assinar/[token]/page.tsx`, `public-consent-form.tsx`, `consent-sign-form.tsx`.

- [ ] **Step 2: Suíte de testes completa**

Run: `npx vitest run`
Expected: PASS. Atenção especial a `src/modules/consents/**` e `src/components/consents/**`.

- [ ] **Step 3: Lint**

Run: `npx eslint src/modules/consents src/components/consents "src/app/(app)/pacientes/[id]/actions.ts" "src/app/(app)/pacientes/[id]/documentos/page.tsx" "src/app/assinar/[token]/page.tsx"`
Expected: PASS. Corrigir `no-unused-vars` (ex.: imports de `headerLines` / `renderTemplate` antigos) e `react-hooks/exhaustive-deps` se surgir no `useMemo` de `canSubmit`.

- [ ] **Step 4: Build de produção (sanidade do bundle client)**

Run: `npx next build`
Expected: PASS. O `import()` dinâmico de `pdf-lib` deve manter as páginas de assinatura fora do bundle principal (comportamento já existente; só confirma que a mudança não quebrou o code-split).

- [ ] **Step 5: Commit (se houve correções)**

```bash
git add -A
git commit -m "$(printf 'chore(consents): typecheck, lint e testes verdes após migração para blocos\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01HijpUqTjZNjnN2XpG6wzko')"
```

---

## Task 9: Logo do timbre (bloqueada por asset do usuário)

**Files:**
- Modify: `src/components/consents/letterhead.ts`
- Add: `public/logo/silvana-lopes.png` (fornecido pelo usuário)

**Interfaces:**
- Consumes: `public/logo/silvana-lopes.png`.
- Produces: `LETTERHEAD.logoPngBase64` preenchido.

> **Pré-requisito:** o usuário coloca `public/logo/silvana-lopes.png` no repo.
> Até lá, o PDF já funciona com o fallback de texto (Task 3). Esta task pode
> ser feita a qualquer momento após a Task 2.

- [ ] **Step 1: Converter o PNG para base64**

Run: `node -e "process.stdout.write(require('fs').readFileSync('public/logo/silvana-lopes.png').toString('base64'))"`
Expected: imprime a string base64 (sem quebras de linha).

- [ ] **Step 2: Colar em `letterhead.ts`**

Substituir `logoPngBase64: ""` pela string do passo 1:

```ts
  logoPngBase64: "<base64 aqui>",
```

- [ ] **Step 3: Smoke manual — gerar um PDF e conferir o timbre**

Rodar o app (`npx next dev`), abrir `/pacientes/<id>/documentos`, assinar o `laser` (menos campos) e abrir o PDF: o logo deve aparecer no topo de todas as páginas, a linha divisória e o rodapé com telefone/@instagram/endereço.

- [ ] **Step 4: Commit**

```bash
git add public/logo/silvana-lopes.png src/components/consents/letterhead.ts
git commit -m "$(printf 'feat(consents): logo real no timbre do PDF\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01HijpUqTjZNjnN2XpG6wzko')"
```

---

## Task 10: Smoke-test manual completo (usuário)

Após a Task 8 (e idealmente a Task 9) e **com a migração 0014 aplicada** (`npx supabase db push`):

- [ ] Inline, `tcle`: digitar tipo de ferida, marcar "Autorizo", assinar → PDF com timbre, campos preenchidos (nome, telefone, data), caixa "Autorizo" marcada, "Assino como paciente" marcada, assinatura carimbada com "Assinado eletronicamente por … em DD/MM/AAAA HH:MM" + linha em branco "Assinatura e carimbo do profissional de saúde".
- [ ] Inline, `tcle`, marcar "Não autorizo" → aviso "Sem autorização do tratamento, o documento não é registrado."; nada salvo; card segue "Pendente".
- [ ] Inline, `tcle`, ligar "Assino como responsável legal", preencher nome + RG → PDF com esses campos; caixa "Assino como responsável legal" marcada; rodapé "Assinado eletronicamente por {responsável}".
- [ ] Link, `tcle`: clicar "Enviar link" → digitar tipo de ferida → "Gerar link" → abrir o link no celular → o "Tipo de ferida" aparece somente leitura já preenchido → paciente marca "Autorizo" e assina → PDF completo no card do paciente, `signed_via = 'link'`.
- [ ] `imagem` e `laser`, inline e link → sem campos de TCLE; dois blocos de assinatura (um carimbado, um em branco); CNPJ `31.693.471/0001-56` visível no corpo do `imagem`.
- [ ] "Ver PDF", "Excluir" (com confirmação), "Assinar novamente" (gera 2ª linha, card mostra a mais recente), excluir paciente (PDFs somem do bucket) → tudo como antes da mudança.
- [ ] PDF de um termo longo (`tcle`) tem 2+ páginas; o timbre e o rodapé aparecem em **todas**; nenhum bloco de assinatura fica partido no fim de página.

---

## Self-Review

**1. Spec coverage:**

| Seção do design doc | Task |
|---|---|
| Migração 0014 (`lgpd`→`laser`) | Task 1 |
| `schemas.ts` `CONSENT_KINDS` | Task 2 (Step 2) |
| `templates.ts` — `Block`, `TemplateContext`, `renderTemplate`, `applyTcleFields`, 3 termos com texto real | Task 2 |
| `letterhead.ts` (timbre fixo, CNPJ) | Task 2 (Step 1) + Task 9 (logo real) |
| `pdf.ts` — `measureBlock`, `layoutBlocks`, `buildConsentPdf`, timbre por página, fallback sem logo, `signature` atômico | Task 3 |
| `token.ts` — `tipoFerida` nas claims | Task 4 |
| `consent-sign-form.tsx` — props `kind`/`blocks`/`tipoFerida`, campos do TCLE, recusa bloqueia, `applyTcleFields`, preview por blocos | Task 5 |
| `consent-cards.tsx` + `documentos/page.tsx` — `Doc.blocks`, sem `headerLines`, tipo de ferida no "Enviar link" | Task 6 |
| `getConsentPageDataAction` — `pacienteTelefone`, `blocks` | Task 6 (Step 1) |
| `createConsentLinkAction(contactId, kind, extra?)` | Task 6 (Step 2) |
| Rota pública — `tipoFerida` do token → template + form | Task 7 |
| `public-consent-form.tsx` — props novas | Task 7 (Step 2) |
| Tratamento de erros (recusa, autorização não escolhida, responsável sem nome/RG, sem logo, bloco de assinatura não cabe, token adulterado) | Tasks 3, 4, 5 (testes) |
| Testes automatizados (templates, token, pdf, sign-form) | Tasks 2–5 |
| Smoke-test manual | Task 10 |
| Fora de escopo (sem colunas novas, sem "baixar em branco", assinatura do profissional em branco) | respeitado — nenhuma task cria coluna, rota de download ou captura de assinatura do profissional |

**2. Placeholder scan:** sem "TBD"/"TODO"/"add error handling" genéricos. Todo código está inline. O único `""` intencional é `LETTERHEAD.logoPngBase64` (preenchido na Task 9, com fallback funcional na Task 3).

**3. Type consistency:**
- `Block` definido na Task 2, importado com o mesmo shape em `pdf.ts` (Task 3), `consent-sign-form.tsx` (Task 5), `consent-cards.tsx` (Task 6), `public-consent-form.tsx` (Task 7).
- `renderTemplate` → `{ title, blocks }` em toda parte (Tasks 2, 6, 7).
- `ConsentSignFormProps` da Task 5 (`kind`, `documentTitle`, `blocks`, `defaultSignerName`, `submitLabel`, `tipoFerida?`, `onComplete`, `onDone?`) é exatamente o que `consent-cards.tsx` (Task 6) e `public-consent-form.tsx` (Task 7) passam.
- `createConsentLinkAction(contactId, kind, extra?)` — assinatura idêntica na definição (Task 6) e nas chamadas em `consent-cards.tsx` (Task 6).
- `ConsentClaims.tipoFerida?: string` (Task 4) — lido em `assinar/[token]/page.tsx` (Task 7) e escrito em `createConsentLinkAction` (Task 6).
- `TcleFieldValues` (Task 2) — usado em `applyTcleFields` (Task 2) e no `satisfies` do `consent-sign-form.tsx` (Task 5).
- `formatBrDate` / `formatBrDateTime` — assinatura preservada; consumidores (`actions.ts`, `consent-cards.tsx`, `consent-sign-form.tsx`) não mudam a forma de chamar.
