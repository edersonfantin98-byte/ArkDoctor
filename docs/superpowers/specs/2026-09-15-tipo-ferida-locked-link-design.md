# ArkDoctor — Tipo de ferida travado no fluxo de link do TCLE — Design Doc

Status: aprovado
Última atualização: 2026-09-15

## Contexto

A Feature de assinatura eletrônica de consentimentos (`docs/superpowers/specs/2026-08-30-assinatura-consentimentos-design.md`, já implementada) usa o mesmo formulário (`ConsentSignForm`) tanto para o fluxo presencial (enfermeira com o próprio aparelho) quanto para o fluxo de link (paciente assina no próprio celular).

O TCLE (`kind: 'tcle'`) tem um campo "Tipo de ferida" que hoje é um `<input>` de texto livre nos dois fluxos. Isso é um problema no fluxo de link: é um dado clínico que só a enfermeira sabe — o paciente não deveria conseguir escrevê-lo no próprio celular antes de assinar — nem por engano, preenchendo o campo errado.

## Decisão

Escopo: **só o TCLE**, **só o campo "Tipo de ferida"**. Os outros dois documentos (`imagem`, `laser`) não têm esse campo e não são afetados.

1. Ao clicar **"Enviar link"** no card do TCLE, abre um dialog pedindo "Tipo de ferida" antes de gerar o link. Campo obrigatório, pré-preenchido (sugestão editável) com o `woundTypes` do tratamento ativo do paciente, se existir.
2. O valor informado entra **dentro do token assinado** (HMAC-SHA256, já existente em `src/modules/consents/token.ts`) — o paciente não pode adulterá-lo sem invalidar a assinatura.
3. Na página pública `/assinar/[token]`, o campo deixa de ser um `<input>` — aparece como texto fixo na prévia do documento, vindo do token.
4. **Fluxo presencial não muda.** A enfermeira continua digitando livremente no dialog de assinatura (ela mesma que preenche, presente com o paciente).

## Mudanças por arquivo

### `src/modules/consents/token.ts`

- `ConsentClaims` ganha `tipoFerida?: string`.
- `TokenPayload` (formato interno serializado) ganha campo opcional correspondente (ex.: `t`).
- `signConsentToken` inclui o campo quando presente; `verifyConsentToken` devolve de volta em `ConsentClaims`. Roundtrip coberto pelos testes já existentes em `token.test.ts` (adicionar um caso com `tipoFerida`).

### `src/app/(app)/pacientes/[id]/actions.ts`

- `createConsentLinkAction(contactId, kind, tipoFerida?)`: quando `kind === 'tcle'`, `tipoFerida` passa a ser obrigatório (string não vazia) — lança erro se ausente/vazio. Para os outros kinds, parâmetro é ignorado. Valor entra em `signConsentToken`.
- `getConsentPageDataAction`: passa a buscar as treatments do paciente (já dá pra usar `treatmentsRepo.listTreatmentsForContact`, já importado no arquivo) e devolver `activeTreatmentWoundTypes: string | null` — preferindo o tratamento com `status === 'em_andamento'` mais recente por `startedOn`; se não houver nenhum em andamento, usa o mais recente (por `startedOn`) entre todos. `null` se o paciente não tiver nenhum tratamento.

### `src/components/consents/consent-cards.tsx`

- Recebe a nova prop `activeTreatmentWoundTypes: string | null` (repassada da page).
- `handleLink(doc)`: se `doc.kind === 'tcle'`, em vez de gerar o link direto, abre um dialog novo pedindo "Tipo de ferida" (input de texto, pré-preenchido com `activeTreatmentWoundTypes ?? ""`). Confirmar chama `createConsentLinkAction(contactId, 'tcle', valor)` só se o campo não estiver vazio (senão mostra erro inline, sem fechar o dialog). Para `imagem`/`laser`, comportamento atual mantido (gera o link direto).

### `src/app/assinar/[token]/page.tsx`

- Repassa `claims.tipoFerida ?? null` para o `TemplateContext` (`ctx.tipoFerida` já existe no tipo) e para o novo prop de `PublicConsentForm`/`ConsentSignForm` que trava o campo (ver abaixo).

### `src/components/consents/public-consent-form.tsx` e `consent-sign-form.tsx`

- `ConsentSignForm` ganha prop opcional `lockedTipoFerida?: string`.
  - Quando presente (fluxo de link do TCLE): o estado interno de `tipoFerida` inicializa com esse valor e **não** renderiza o `<input>` — mostra o valor como texto fixo (mesmo estilo dos demais campos do documento, ex. "Tipo de ferida: `<valor>`"). Não editável pelo paciente.
  - Quando ausente (fluxo inline, como hoje): comportamento atual, `<input>` livre.
  - `PublicConsentForm` recebe `tipoFerida: string | null` da page e repassa como `lockedTipoFerida` (ausente/undefined quando `null`, deixando o form cair no caminho "sem valor travado" — ver Casos de borda).

## Casos de borda

| Situação | Comportamento |
|---|---|
| Token de link antigo, gerado antes desta mudança (sem `tipoFerida`) | `claims.tipoFerida` vem `undefined`. Página pública trata como campo travado vazio (mostra "Tipo de ferida: —"), nunca reabre o `<input>` pro paciente. Esses links expiram em 48h — o caso desaparece sozinho. |
| Paciente sem tratamento cadastrado (`activeTreatmentWoundTypes === null`) | Dialog de "Enviar link" abre com o campo vazio; enfermeira digita na hora. Continua obrigatório. |
| Enfermeira cancela o dialog de "Tipo de ferida" | Nenhum link é gerado, nenhuma chamada ao servidor. |
| `imagem` / `laser` — "Enviar link" | Sem mudança nenhuma: gera o link direto, como hoje. |

## Fora de escopo

- Qualquer alteração nos campos "Autoriza tratamento", "Responsável legal" etc. do TCLE — continuam preenchidos por quem assina (paciente/responsável), inclusive no fluxo de link, porque são declarações do próprio signatário, não dado clínico.
- Vínculo estrutural entre `treatments.woundTypes` e o TCLE além do prefill do dialog (ex.: travar o TCLE ao tratamento, sincronizar edições). O prefill é só conveniência; o valor gravado no PDF é o que a enfermeira confirmar no dialog.
- Mudança no fluxo presencial.
- Validação server-side do conteúdo do PDF assinado contra o valor do token — o PDF é montado no cliente e enviado como bytes opacos (arquitetura pré-existente da feature de consentimentos); o token trava o que aparece na tela e impede adulteração do valor em trânsito, mas não impede alguém com acesso ao devtools de montar um PDF diferente do que a tela mostrou.

## Testes

- `token.test.ts`: roundtrip com `tipoFerida` presente e ausente.
- `service.test.ts` / ação de link: `createConsentLinkAction` rejeita `tipoFerida` vazio para `kind: 'tcle'`; aceita e embute para `tcle`; ignora para `imagem`/`laser`.
- Componente `ConsentSignForm`: com `lockedTipoFerida` definido, não renderiza `<input>` de tipo de ferida e usa o valor travado na prévia/submissão; sem a prop, comportamento atual (teste já existente, `consent-sign-form.test.tsx`).

### Smoke-test manual

- Card do TCLE → "Enviar link" → dialog pede tipo de ferida pré-preenchido do tratamento ativo → confirmar → abrir link no celular → campo aparece fixo, não editável → assinar → PDF sai com o tipo de ferida certo.
- Mesmo card → "Assinar agora" (inline) → campo continua editável como hoje.
