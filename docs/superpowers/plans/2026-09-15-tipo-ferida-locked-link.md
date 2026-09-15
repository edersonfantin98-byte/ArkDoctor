# Tipo de ferida travado no fluxo de link — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No fluxo de link do TCLE (paciente assina no próprio celular), o campo "Tipo de ferida" deixa de ser digitável pelo paciente — a enfermeira o define antes de gerar o link, e o valor viaja travado dentro do token assinado.

**Architecture:** O valor entra como campo opcional no payload HMAC já existente (`ConsentClaims`/token de `src/modules/consents/token.ts`). A UI de geração de link (`ConsentCards`) ganha um dialog que pede o valor antes de chamar `createConsentLinkAction`, pré-preenchido com o `woundTypes` do tratamento ativo do paciente. Na página pública, o `ConsentSignForm` ganha uma prop que, quando presente, substitui o `<input>` de "Tipo de ferida" por texto fixo. O fluxo presencial (inline) não muda em nenhum arquivo de UI de assinatura fora do necessário para não quebrar o que já existe.

**Tech Stack:** Next.js (App Router) + TypeScript, Vitest + Testing Library, Supabase (service-role no lado público), Web Crypto (`crypto.subtle`) para o HMAC do token.

**Spec:** `docs/superpowers/specs/2026-09-15-tipo-ferida-locked-link-design.md`

## Global Constraints

- Escopo travado ao `kind: 'tcle'`. `imagem` e `laser` não são tocados.
- Fluxo presencial (inline) preserva o comportamento atual: `<input>` livre para "Tipo de ferida".
- Nenhuma tabela nova, nenhuma dependência nova — só o payload do token existente ganha um campo.
- Token continua HMAC-SHA256 via `crypto.subtle` (Web Crypto), não o módulo `crypto` do Node.
- Todo código/comentário/UI novo em português, seguindo o padrão do resto do módulo `consents`.

---

### Task 1: Token carrega `tipoFerida`

**Files:**
- Modify: `src/modules/consents/token.ts`
- Test: `src/modules/consents/token.test.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores (primeira task).
- Produces: `ConsentClaims` com `tipoFerida?: string` — usado pela Task 2 (`createConsentLinkAction`) e pela Task 4 (`assinar/[token]/page.tsx`).

- [ ] **Step 1: Escrever o teste de roundtrip com `tipoFerida`**

Adicionar ao final de `src/modules/consents/token.test.ts`, dentro do `describe("consent token", ...)`:

```ts
  it("round-trips claims com tipoFerida", async () => {
    const claimsComFerida: ConsentClaims = { ...claims, tipoFerida: "Lesão por pressão" };
    const token = await signConsentToken(claimsComFerida, 3600);
    expect(await verifyConsentToken(token)).toEqual(claimsComFerida);
  });

  it("round-trip sem tipoFerida não inclui a chave no resultado", async () => {
    const token = await signConsentToken(claims, 3600);
    const result = await verifyConsentToken(token);
    expect(result).toEqual(claims);
    expect(result?.tipoFerida).toBeUndefined();
  });
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/modules/consents/token.test.ts`
Expected: FAIL — o primeiro novo teste falha porque `verifyConsentToken` hoje nunca devolve `tipoFerida` (a comparação `toEqual` falha por causa da chave a mais em `claimsComFerida`).

- [ ] **Step 3: Implementar o campo no payload**

Em `src/modules/consents/token.ts`, editar `ConsentClaims`, `TokenPayload`, `signConsentToken` e `verifyConsentToken`:

```ts
export interface ConsentClaims {
  accountId: string;
  contactId: string;
  kind: ConsentKind;
  tipoFerida?: string;
}

interface TokenPayload {
  a: string;
  c: string;
  k: string;
  e: number; // expiry, epoch seconds
  t?: string; // tipoFerida, só quando kind === 'tcle' e informado no link
}
```

Em `signConsentToken`, ao montar `payload`, incluir `t` só quando presente:

```ts
export async function signConsentToken(
  claims: ConsentClaims,
  ttlSeconds: number,
  now: number = Date.now(),
): Promise<string> {
  const payload: TokenPayload = {
    a: claims.accountId,
    c: claims.contactId,
    k: claims.kind,
    e: Math.floor(now / 1000) + ttlSeconds,
    ...(claims.tipoFerida !== undefined ? { t: claims.tipoFerida } : {}),
  };
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(await hmac(body, getSecret()));
  return `${body}.${sig}`;
}
```

Em `verifyConsentToken`, no `return` final, incluir `tipoFerida` só quando presente no payload:

```ts
  return {
    accountId: payload.a,
    contactId: payload.c,
    kind: payload.k as ConsentKind,
    ...(typeof payload.t === "string" ? { tipoFerida: payload.t } : {}),
  };
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/modules/consents/token.test.ts`
Expected: PASS (todos os testes, incluindo os 4 já existentes de tampering/expiração/garbage).

- [ ] **Step 5: Commit**

```bash
git add src/modules/consents/token.ts src/modules/consents/token.test.ts
git commit -m "feat(consentimentos): token de link carrega tipo de ferida opcional"
```

---

### Task 2: `createConsentLinkAction` exige e embute `tipoFerida` no TCLE

**Files:**
- Modify: `src/app/(app)/pacientes/[id]/actions.ts`

**Interfaces:**
- Consumes: `ConsentClaims` com `tipoFerida?: string` (Task 1); `signConsentToken` (já existente, sem mudança de assinatura).
- Produces: `createConsentLinkAction(contactId: string, kind: string, tipoFerida?: string): Promise<{ url: string }>` — usado pela Task 3 (`ConsentCards`). Lança `Error("Informe o tipo de ferida.")` quando `kind === 'tcle'` e `tipoFerida` ausente/vazio.
- Produces: `getConsentPageDataAction` passa a devolver também `activeTreatmentWoundTypes: string | null` — usado pela Task 3.

Não há teste automatizado para server actions neste módulo (padrão do arquivo — `actions.ts` não tem `.test.ts` companheiro; a cobertura vem dos testes de `service`/`token` mais o smoke-test manual do plano). Esta task segue o padrão do arquivo.

- [ ] **Step 1: Editar `createConsentLinkAction`**

Em `src/app/(app)/pacientes/[id]/actions.ts`, localizar (por volta da linha 213):

```ts
export async function createConsentLinkAction(contactId: string, kind: string) {
  assertConsentKind(kind);
  const c = await ctx();
  const contact = await c.crmRepo.getContact(c.accountId, contactId);
  if (!contact) throw new Error("Paciente não encontrado");
  const token = await signConsentToken(
    { accountId: c.accountId, contactId, kind },
    CONSENT_LINK_TTL_SECONDS,
  );
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "";
  return { url: `${proto}://${host}/assinar/${token}` };
}
```

Substituir por:

```ts
export async function createConsentLinkAction(contactId: string, kind: string, tipoFerida?: string) {
  assertConsentKind(kind);
  const c = await ctx();
  const contact = await c.crmRepo.getContact(c.accountId, contactId);
  if (!contact) throw new Error("Paciente não encontrado");

  const tipoFeridaTrimmed = tipoFerida?.trim();
  if (kind === "tcle" && !tipoFeridaTrimmed) {
    throw new Error("Informe o tipo de ferida.");
  }

  const token = await signConsentToken(
    {
      accountId: c.accountId,
      contactId,
      kind,
      ...(kind === "tcle" ? { tipoFerida: tipoFeridaTrimmed } : {}),
    },
    CONSENT_LINK_TTL_SECONDS,
  );
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "";
  return { url: `${proto}://${host}/assinar/${token}` };
}
```

- [ ] **Step 2: Editar `getConsentPageDataAction` para devolver o tratamento ativo**

Localizar (por volta da linha 228):

```ts
export async function getConsentPageDataAction(contactId: string) {
  const c = await ctx();
  const [contact, identity, consentRows] = await Promise.all([
    c.crmRepo.getContact(c.accountId, contactId),
    getAccountProfessionalIdentity(c.supabase, c.accountId),
    listConsentsAction(contactId),
  ]);
  if (!contact) throw new Error("Paciente não encontrado");
```

Substituir o `Promise.all` para incluir as treatments do paciente, e adicionar a lógica de escolha do tratamento ativo logo depois:

```ts
export async function getConsentPageDataAction(contactId: string) {
  const c = await ctx();
  const [contact, identity, consentRows, patientTreatments] = await Promise.all([
    c.crmRepo.getContact(c.accountId, contactId),
    getAccountProfessionalIdentity(c.supabase, c.accountId),
    listConsentsAction(contactId),
    treatments.listTreatmentsForContact(c.treatmentsRepo, c.accountId, contactId),
  ]);
  if (!contact) throw new Error("Paciente não encontrado");

  const activeTreatmentWoundTypes =
    [...patientTreatments]
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "em_andamento" ? -1 : 1;
        return b.startedOn.localeCompare(a.startedOn);
      })[0]?.woundTypes ?? null;
```

E no `return` final do mesmo action (mais abaixo), adicionar o novo campo:

```ts
  return {
    patientName: contact.name,
    professionalMissing: !identity.professionalName,
    docs,
    consents: consentRows,
    activeTreatmentWoundTypes,
  };
```

- [ ] **Step 3: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos relacionados a `actions.ts` (o `sort` usa só campos já tipados em `Treatment`: `status`, `startedOn`, `woundTypes`).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/pacientes/[id]/actions.ts"
git commit -m "feat(consentimentos): exige tipo de ferida ao gerar link do TCLE"
```

---

### Task 3: `ConsentCards` pede o tipo de ferida antes de gerar o link do TCLE

**Files:**
- Modify: `src/components/consents/consent-cards.tsx`
- Modify: `src/app/(app)/pacientes/[id]/documentos/page.tsx`

**Interfaces:**
- Consumes: `createConsentLinkAction(contactId, kind, tipoFerida?)` e `activeTreatmentWoundTypes: string | null` de `getConsentPageDataAction` (Task 2).
- Produces: nenhuma interface nova consumida por outra task — esta é a ponta de UI do fluxo de geração de link.

- [ ] **Step 1: Repassar `activeTreatmentWoundTypes` da page pro componente**

Em `src/app/(app)/pacientes/[id]/documentos/page.tsx`, adicionar a prop na chamada de `<ConsentCards>`:

```tsx
        <ConsentCards
          contactId={id}
          patientName={data.patientName}
          professionalMissing={data.professionalMissing}
          docs={data.docs}
          initialConsents={data.consents}
          activeTreatmentWoundTypes={data.activeTreatmentWoundTypes}
        />
```

- [ ] **Step 2: Aceitar a prop e adicionar o estado do dialog em `ConsentCards`**

Em `src/components/consents/consent-cards.tsx`, editar a assinatura do componente:

```tsx
export function ConsentCards({
  contactId,
  patientName,
  professionalMissing,
  docs,
  initialConsents,
  activeTreatmentWoundTypes,
}: {
  contactId: string;
  patientName: string;
  professionalMissing: boolean;
  docs: Doc[];
  initialConsents: ConsentRow[];
  activeTreatmentWoundTypes: string | null;
}) {
```

Adicionar estado novo junto aos `useState` existentes:

```tsx
  const [tipoFeridaPrompt, setTipoFeridaPrompt] = useState<{ doc: Doc; value: string } | null>(null);
  const [tipoFeridaError, setTipoFeridaError] = useState<string | null>(null);
```

- [ ] **Step 3: Ajustar `handleLink` para abrir o dialog quando `kind === 'tcle'`**

Substituir a função `handleLink` atual:

```tsx
  async function handleLink(doc: Doc) {
    setError(null);
    try {
      const { url } = await createConsentLinkAction(contactId, doc.kind);
      setLinkState({ doc, url });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar link");
    }
  }
```

por:

```tsx
  async function handleLink(doc: Doc) {
    setError(null);
    if (doc.kind === "tcle") {
      setTipoFeridaError(null);
      setTipoFeridaPrompt({ doc, value: activeTreatmentWoundTypes ?? "" });
      return;
    }
    try {
      const { url } = await createConsentLinkAction(contactId, doc.kind);
      setLinkState({ doc, url });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar link");
    }
  }

  async function handleConfirmTipoFeridaLink() {
    if (!tipoFeridaPrompt) return;
    const value = tipoFeridaPrompt.value.trim();
    if (!value) {
      setTipoFeridaError("Informe o tipo de ferida.");
      return;
    }
    try {
      const { url } = await createConsentLinkAction(contactId, tipoFeridaPrompt.doc.kind, value);
      setLinkState({ doc: tipoFeridaPrompt.doc, url });
      setTipoFeridaPrompt(null);
    } catch (err) {
      setTipoFeridaError(err instanceof Error ? err.message : "Erro ao gerar link");
    }
  }
```

- [ ] **Step 4: Renderizar o dialog de "Tipo de ferida"**

Adicionar, logo depois do `</Dialog>` do `linkState` (antes do fechamento do `return` do componente, antes de `</div>` final), um novo `Dialog`:

```tsx
      <Dialog
        open={tipoFeridaPrompt !== null}
        onOpenChange={(open) => !open && setTipoFeridaPrompt(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tipo de ferida</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Esse dado vai travado no link — o paciente não poderá alterá-lo ao assinar pelo celular.
            </p>
            <label className="block text-sm">
              <span className="text-muted-foreground">Tipo de ferida</span>
              <input
                autoFocus
                value={tipoFeridaPrompt?.value ?? ""}
                onChange={(e) =>
                  setTipoFeridaPrompt((prev) => (prev ? { ...prev, value: e.target.value } : prev))
                }
                className="mt-1 w-full rounded border px-2 py-1"
              />
            </label>
            {tipoFeridaError && (
              <p role="alert" className="text-sm text-red-600">{tipoFeridaError}</p>
            )}
            <Button type="button" onClick={handleConfirmTipoFeridaLink}>
              Gerar link
            </Button>
          </div>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 5: Checar tipos e rodar a suíte de componentes existente**

Run: `npx tsc --noEmit && npx vitest run src/components/consents`
Expected: sem erros de tipo; testes existentes de `consent-sign-form.test.tsx` continuam passando (esta task não toca nesse arquivo).

- [ ] **Step 6: Commit**

```bash
git add src/components/consents/consent-cards.tsx "src/app/(app)/pacientes/[id]/documentos/page.tsx"
git commit -m "feat(consentimentos): dialog pede tipo de ferida antes de gerar o link do TCLE"
```

---

### Task 4: Página pública repassa `tipoFerida` do token; `ConsentSignForm` trava o campo

**Files:**
- Modify: `src/app/assinar/[token]/page.tsx`
- Modify: `src/components/consents/public-consent-form.tsx`
- Modify: `src/components/consents/consent-sign-form.tsx`
- Test: `src/components/consents/consent-sign-form.test.tsx`

**Interfaces:**
- Consumes: `ConsentClaims.tipoFerida` (Task 1).
- Produces: `ConsentSignForm` ganha prop opcional `lockedTipoFerida?: string`. Quando presente e `kind === 'tcle'`, o form não renderiza o `<input>` de "Tipo de ferida" — usa o valor fixo na prévia e na submissão. `PublicConsentForm` ganha prop `tipoFerida: string | null` e repassa como `lockedTipoFerida` (omitindo a prop quando `null`).

- [ ] **Step 1: Escrever o teste do campo travado**

Adicionar em `src/components/consents/consent-sign-form.test.tsx`, dentro do `describe("ConsentSignForm — TCLE", ...)`:

```tsx
  it("com lockedTipoFerida, não mostra o input e usa o valor travado", () => {
    render(
      <ConsentSignForm
        kind="tcle"
        documentTitle="TCLE"
        blocks={tcleBlocks}
        defaultSignerName="Maria"
        submitLabel="Confirmar"
        lockedTipoFerida="Lesão por pressão"
        onComplete={async () => ({ ok: true })}
      />,
    );
    expect(screen.queryByLabelText(/^Tipo de ferida$/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Tipo de ferida:\s*Lesão por pressão/i)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/components/consents/consent-sign-form.test.tsx`
Expected: FAIL — `lockedTipoFerida` ainda não existe como prop; hoje o `<input>` de "Tipo de ferida" sempre aparece pra `kind="tcle"`, então `queryByLabelText` encontra o input (assert falha) e o texto travado não existe.

- [ ] **Step 3: Implementar `lockedTipoFerida` em `ConsentSignForm`**

Em `src/components/consents/consent-sign-form.tsx`, adicionar o campo na interface de props:

```ts
export interface ConsentSignFormProps {
  kind: ConsentKind;
  documentTitle: string;
  blocks: Block[];
  defaultSignerName: string;
  submitLabel: string;
  lockedTipoFerida?: string;
  onComplete: (args: {
    pdfBytes: Uint8Array;
    signerName: string;
    docFields: Record<string, string>;
  }) => Promise<{ ok: boolean; error?: string }>;
  onDone?: () => void;
}
```

Trocar a inicialização do estado `tipoFerida` (hoje `useState("")`) para partir do valor travado quando existir:

```ts
  const [tipoFerida, setTipoFerida] = useState(props.lockedTipoFerida ?? "");
```

No JSX, dentro do bloco `{isTcle && (...)}`, trocar o input de "Tipo de ferida" por uma renderização condicional. Hoje é:

```tsx
          <label className="block text-sm">
            <span className="text-muted-foreground">Tipo de ferida</span>
            <input
              value={tipoFerida}
              onChange={(e) => setTipoFerida(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1"
            />
          </label>
```

Substituir por:

```tsx
          {props.lockedTipoFerida !== undefined ? (
            <p className="text-sm">
              <span className="text-muted-foreground">Tipo de ferida:</span> {props.lockedTipoFerida || "—"}
            </p>
          ) : (
            <label className="block text-sm">
              <span className="text-muted-foreground">Tipo de ferida</span>
              <input
                value={tipoFerida}
                onChange={(e) => setTipoFerida(e.target.value)}
                className="mt-1 w-full rounded border px-2 py-1"
              />
            </label>
          )}
```

Nenhuma outra mudança é necessária: `tipoFerida` (o state) já entra em `previewBlocks` e na submissão via `applyTcleFields`, e agora nasce pré-preenchido com o valor travado sem ninguém poder editá-lo pela UI.

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/components/consents/consent-sign-form.test.tsx`
Expected: PASS (todos os testes, incluindo o novo e os que já existiam — em especial o `"mostra os campos extras do TCLE"`, que não passa `lockedTipoFerida` e continua vendo o `<input>`).

- [ ] **Step 5: Propagar o valor a partir da página pública**

Em `src/app/assinar/[token]/page.tsx`, no tipo de retorno de `loadPage`, incluir `tipoFerida`:

```ts
async function loadPage(
  token: string,
): Promise<{ kind: ConsentKind; tipoFerida: string | null; patient: PatientData; identity: Identity } | null> {
```

No `return` de sucesso dentro de `loadPage`, adicionar o campo:

```ts
    return {
      kind: claims.kind,
      tipoFerida: claims.tipoFerida ?? null,
      patient: { /* ...como já está... */ },
      identity,
    };
```

No corpo do componente `PublicConsentPage`, desestruturar e repassar:

```ts
  const { kind, tipoFerida, patient, identity } = loaded;

  const t = renderTemplate(kind, {
    /* ...campos já existentes... */
    data: formatBrDate(new Date()),
    tipoFerida,
  });

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-xl font-bold">{t.title}</h1>
      <PublicConsentForm
        token={token}
        kind={kind}
        documentTitle={t.title}
        blocks={t.blocks}
        defaultSignerName={patient.name}
        tipoFerida={tipoFerida}
      />
    </div>
  );
```

- [ ] **Step 6: Repassar em `PublicConsentForm`**

Em `src/components/consents/public-consent-form.tsx`, adicionar a prop e repassar como `lockedTipoFerida` só quando `kind === 'tcle'`:

```tsx
export function PublicConsentForm(props: {
  token: string;
  kind: ConsentKind;
  documentTitle: string;
  blocks: Block[];
  defaultSignerName: string;
  tipoFerida: string | null;
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
      defaultSignerName={props.defaultSignerName}
      submitLabel="Confirmar assinatura"
      {...(props.kind === "tcle" ? { lockedTipoFerida: props.tipoFerida ?? "" } : {})}
      onComplete={async ({ pdfBytes, signerName, docFields }) => {
        const fd = new FormData();
        fd.set("file", new Blob([pdfBytes as BlobPart], { type: "application/pdf" }), "consent.pdf");
        fd.set("signerName", signerName);
        fd.set("docFields", JSON.stringify(docFields));
        return submitPublicConsentAction(props.token, fd);
      }}
      onDone={() => setDone(true)}
    />
  );
}
```

(`props.tipoFerida ?? ""` cobre o caso de borda de um link antigo sem `tipoFerida` no token — vira campo travado vazio, "—" na tela, nunca reabre o `<input>` pro paciente.)

- [ ] **Step 7: Checar tipos e rodar a suíte completa de consents**

Run: `npx tsc --noEmit && npx vitest run src/modules/consents src/components/consents`
Expected: PASS em tudo — inclui `token.test.ts` (Task 1), os testes já existentes de `consent-sign-form.test.tsx` e o novo.

- [ ] **Step 8: Commit**

```bash
git add src/app/assinar/[token]/page.tsx src/components/consents/public-consent-form.tsx src/components/consents/consent-sign-form.tsx src/components/consents/consent-sign-form.test.tsx
git commit -m "feat(consentimentos): trava tipo de ferida na tela pública de assinatura"
```

---

### Task 5: Smoke-test manual

**Files:** nenhum (verificação manual, sem alteração de código).

- [ ] **Step 1: Rodar a suíte completa**

Run: `npx vitest run`
Expected: PASS em todos os arquivos (nenhuma regressão fora do módulo `consents`).

- [ ] **Step 2: Smoke-test local**

Com o app rodando localmente (`npm run dev`), num paciente com um tratamento em andamento cadastrado:

1. Abrir `/pacientes/{id}/documentos`.
2. No card do TCLE, clicar "Enviar link" → confirmar que o dialog abre com "Tipo de ferida" pré-preenchido com o `woundTypes` do tratamento ativo.
3. Apagar o campo e tentar "Gerar link" → confirmar que aparece o erro "Informe o tipo de ferida." e nenhum link é gerado.
4. Preencher de novo e confirmar → link/QR aparece.
5. Abrir o link (outra aba ou celular) → confirmar que "Tipo de ferida" aparece como texto fixo (não input) com o valor certo.
6. Assinar → PDF final mostra o tipo de ferida certo.
7. Voltar ao card, clicar "Assinar agora" (fluxo inline) → confirmar que "Tipo de ferida" continua sendo um `<input>` editável, como antes.
8. Clicar "Enviar link" nos cards de "Autorização de Uso de Imagem" e "Laserterapia" → confirmar que gera o link direto, sem dialog nenhum (comportamento inalterado).

- [ ] **Step 3: Commit (se algum ajuste for necessário durante o smoke-test)**

Se o smoke-test não pedir nenhum ajuste, não há commit nesta task.
