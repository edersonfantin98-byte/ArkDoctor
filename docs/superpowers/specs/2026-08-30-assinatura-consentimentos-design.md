# ArkDoctor — Assinatura Eletrônica dos Consentimentos — Design Doc

Status: em design
Última atualização: 2026-08-30

## Contexto

A usuária real (enfermeira) faz ozonioterapia para cicatrização de feridas. O **Parecer Normativo COFEN 01/2023** a obriga a manter Termo de Consentimento Livre e Esclarecido do paciente. Hoje ela coleta isso em papel.

A Feature 1 (Tratamento + Relatório Clínico, `docs/superpowers/specs/2026-08-27-tratamento-relatorio-clinico-design.md`, já implementada e em produção) cobriu a documentação clínica e o relatório. Esta feature cobre a **assinatura eletrônica dos termos pelo paciente**, que ficou explicitamente fora daquele doc.

O deploy roda em Cloudflare Workers (`opennextjs-cloudflare`): **não há geração de PDF no servidor** (sem Chrome headless). O padrão do projeto para saída em PDF é client-side.

## Decisões confirmadas no brainstorming (2026-08-28 e 2026-08-30)

1. **Assinatura sempre presencial.** O paciente assina na hora, com a enfermeira presente. Não existe cenário remoto/assíncrono. A identidade é verificada pela presença da profissional.
2. **Contra o que protege: exigência genérica.** Não há cenário concreto de disputa judicial em vista — a Silvana apenas disse que "precisa assinar". Isso torna a assinatura eletrônica simples (MP 2.200-2 §2º + Lei 14.063/2020) suficiente, e afasta a necessidade de plataforma externa com carimbo de tempo de terceiro.
3. **3 documentos distintos**, com **texto fixo** igual para todos os pacientes. O sistema preenche nome/data/dados; o corpo não varia por paciente. Os textos serão fornecidos pela Silvana — até lá entram como placeholder no repo.
4. **Guardar só o PDF assinado**, anexado ao paciente, para baixar/imprimir. Sem rastreio de status estruturado, sem dashboard de pendências, sem bloqueio de agenda.
5. **Assinatura desenhada na tela** (dedo/caneta), carimbada no PDF com data/hora.
6. **Funciona em dois aparelhos:** normalmente no dispositivo da enfermeira (fluxo inline, autenticado); com opção de gerar um link/QR para o celular do próprio paciente (rota pública tokenizada).
7. **Uma assinatura por documento.** 3 assinaturas → 3 PDFs separados. Permite assinar depois só o que faltou.

## Abordagem escolhida

**Construir no app (in-app), client-side, sem serviço externo.** Descartadas:

- **Plataforma externa (ZapSign / Autentique):** ~R$30–50/mês + custo por documento, cada signatário costuma exigir e-mail para a trilha da plataforma (atrito com o fluxo presencial rápido), e adiciona API key + webhook + dependência de fornecedor. Compraria um carimbo de tempo de terceiro que a decisão #2 não justifica hoje.
- **In-app com templates editáveis + rastreio de link (tabelas `consent_templates` e `signature_links`):** YAGNI dado #2 e #4. Fácil de adicionar depois se a necessidade aparecer, sem retrabalho do que está aqui.

Se no futuro a Silvana ou um advogado exigir ICP-Brasil / assinatura qualificada, aí sim reabre-se a discussão de plataforma externa. Nada no brainstorming aponta para isso.

## Modelo de dados — migração 0013

> A migração 0012 já está ocupada por `0012_function_search_path.sql` (hardening). Esta é a **0013**.

```sql
create table signed_consents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  kind text not null check (kind in ('tcle', 'imagem', 'lgpd')),
  storage_path text not null,
  signer_name text not null,
  signed_via text not null check (signed_via in ('inline', 'link')),
  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index signed_consents_account_contact_idx
  on signed_consents (account_id, contact_id);

alter table signed_consents enable row level security;

create policy "account members can manage signed_consents"
  on signed_consents for all
  to authenticated
  using (account_id in (select account_id from account_users where user_id = auth.uid()))
  with check (account_id in (select account_id from account_users where user_id = auth.uid()));

insert into storage.buckets (id, name, public)
values ('signed-consents', 'signed-consents', false)
on conflict (id) do nothing;

create policy "account members manage signed consent objects"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'signed-consents'
    and (storage.foldername(name))[1] in (
      select account_id::text from account_users where user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'signed-consents'
    and (storage.foldername(name))[1] in (
      select account_id::text from account_users where user_id = auth.uid()
    )
  );
```

- Cópia literal do padrão de RLS de `treatments` e do bucket privado de `treatment_photos` (migração 0011).
- **Path no Storage:** `{account_id}/{contact_id}/{kind}-{timestamp}.pdf`.
- **Visualização:** signed URLs com TTL de ~1h (`createSignedUrls`), igual às fotos de tratamento.
- **Sem constraint de unicidade** por `(contact_id, kind)`: reassinar gera uma linha nova. A tela mostra a mais recente por `kind` e permite excluir as antigas.
- **Nomes de `kind` (`tcle | imagem | lgpd`) são provisórios.** Ajustar para os nomes reais quando a Silvana enviar os 3 documentos. A migração ainda não foi escrita nem aplicada.
- **Exclusão de paciente:** as linhas caem por cascade. Os objetos no Storage **não** — replicar o purge de prefixo que a Feature 1 já faz para fotos (commit `b96793d`), removendo `signed-consents/{account_id}/{contact_id}/` na server action de exclusão de paciente.

## Módulo `src/modules/consents/`

Espelha `src/modules/treatments/` — mesmos 8 arquivos: `types.ts`, `schemas.ts`, `repository.ts`, `repository.supabase.ts`, `repository.memory.ts`, `service.ts` + `repository.memory.test.ts` e `service.test.ts`.

### Superfície

| Função | Descrição |
|---|---|
| `listConsents(repo, accountId, contactId)` | Linhas do paciente, `signed_at` desc |
| `getConsent(repo, accountId, id)` | Uma linha (para excluir / gerar signed URL) |
| `recordConsent(repo, accountId, input)` | Valida `kind`, `signerName`, `signedVia` via zod; insere |
| `deleteConsent(repo, accountId, id)` | Remove a linha (o caller remove o objeto do Storage antes) |

Sem lógica de negócio pesada no `service` — não há status estruturado (decisão #4) nem derivações. É quase CRUD, como o slice de fotos de `treatments`.

### Templates — `src/modules/consents/templates.ts`

```ts
export const CONSENT_TEMPLATES = [
  { kind: "tcle",   title: "Termo de Consentimento Livre e Esclarecido",      body: "..." },
  { kind: "imagem", title: "Autorização de Uso de Imagem",                    body: "..." },
  { kind: "lgpd",   title: "Consentimento para Tratamento de Dados (LGPD)",   body: "..." },
];

export function renderTemplate(
  kind: string,
  ctx: TemplateContext,
): { title: string; paragraphs: string[] };
```

- `body` é texto puro com `{{placeholders}}`. `renderTemplate` substitui os tokens e quebra em parágrafos (`\n\n`).
- **Placeholders disponíveis** = apenas dados que já existem:
  - `{{paciente_nome}}` e demais campos de paciente de `contacts` (migração 0010)
  - `{{clinica_nome}}` (`accounts.name`)
  - `{{profissional_nome}}` (`accounts.professional_name`), `{{profissional_conselho}}` (`accounts.professional_council_id`) — identidade profissional da Feature 1
  - `{{data}}` — data corrente na assinatura
- Token desconhecido no template renderiza como `—` (não quebra).
- **Conteúdo fixo no repo.** Atualizar o texto exige deploy — aceitável para um TCLE que muda raramente. Editor em `/configuracoes` fica para uma iteração futura, se necessário.
- Até a Silvana fornecer os textos, `body` é `"[Silvana vai fornecer o texto]"` — o resto do sistema funciona e é testável.

## Geração do PDF — client-side

Nenhum PDF no servidor. `buildConsentPdf`, o helper de quebra/paginação e o componente de dialog com o `<canvas>` ficam em `src/components/consents/` (espelha `src/components/treatments/`). Duas dependências novas, pequenas, carregadas via `import()` dinâmico apenas nas páginas de assinatura (fora do bundle principal):

- **`pdf-lib`** — monta o PDF em memória no browser.
- **`signature_pad`** (~5 KB) — captura o traço num `<canvas>` (ponteiro/touch, suavização).

### `buildConsentPdf(template, ctx, signaturePng): Uint8Array`

1. Página A4, fonte `StandardFonts.Helvetica` — a codificação WinAnsi cobre acentos e `ç` do português; sem necessidade de embutir arquivo de fonte.
2. Cabeçalho: título do documento + clínica + profissional (nome + conselho) + paciente + data.
3. Corpo: parágrafos de `renderTemplate`, com helper de quebra de linha por largura (`font.widthOfTextAtSize`) e paginação. É a única lógica não-trivial do client; tem teste unitário (`pdf-wrap.test.ts`).
4. Rodapé da última página: imagem PNG da assinatura + linha `Assinado eletronicamente por {nome} em {DD/MM/AAAA HH:MM}`.
5. `doc.save()` → `Uint8Array`.

### Após montar

O client faz upload dos bytes:

- **Fluxo inline:** direto pro bucket com o client Supabase autenticado da enfermeira, depois chama a server action que registra a linha.
- **Fluxo link:** via server action pública (service-role) — Seção "Fluxo link".

A server action **revalida** `content-type = application/pdf` e tamanho (< 2 MB) antes de aceitar — espelha `uploadTreatmentPhotoAction`.

### Visualizar depois

"Ver PDF" faz `window.open(signedUrl)` numa aba nova. Evita ter de liberar `frame-src`/`object-src` para o domínio do Supabase no CSP. `img-src`/`connect-src` já incluem `supabaseUrl` no `src/middleware.ts`.

## Fluxo inline (dispositivo da enfermeira, autenticado)

**Rota nova:** `src/app/(app)/pacientes/[id]/documentos/page.tsx` — mesmo padrão das sub-rotas de tratamento. Ponto de entrada a partir de `src/app/(app)/pacientes/[id]/page.tsx` (seção ou botão "Documentos").

A página lista **3 cards**, um por documento:

- **Pendente** → botão "Assinar".
- **Assinado em DD/MM** → botões "Ver PDF" e "Assinar novamente".
- Estado derivado apenas da existência de linha em `signed_consents` (a mais recente por `kind`). Não é status estruturado — é "tem PDF ou não tem".

Ao clicar **"Assinar"**, abre um dialog (Base UI, padrão do projeto) com:

1. Campo "Nome de quem assina" — pré-preenchido com `contact.name`, editável (pode ser responsável legal).
2. Texto renderizado do documento, rolável.
3. `<canvas>` do `signature_pad` + botão "Limpar".
4. "Confirmar" — habilita apenas com traço presente e nome preenchido → `buildConsentPdf` → upload → `recordConsent` → fecha; card passa a "Assinado".

### Server actions (`src/app/(app)/pacientes/[id]/actions.ts`, junto das de tratamento)

| Action | Descrição |
|---|---|
| `listConsentsAction(contactId)` | Linhas + signed URLs (`createSignedUrls`, TTL ~1h) |
| `uploadConsentAction(contactId, kind, formData)` | Valida auth + `application/pdf` + tamanho → upload no bucket → `recordConsent(signedVia: 'inline')` |
| `deleteConsentAction(consentId)` | `getConsent` → `storage.remove` → `deleteConsent` (espelha `deleteTreatmentPhotoAction`) |

Contexto autenticado; RLS aplica normalmente.

## Fluxo link (celular do paciente, rota pública)

### Token stateless — sem tabela

- Payload: `{ accountId, contactId, kind, exp }` com `exp = agora + 48h`.
- Assinatura HMAC-SHA256 com segredo de servidor.
- **Env var nova:** `CONSENT_LINK_SECRET`. Precisa ser configurada no Cloudflare — o manejo de env var mudou com a Git integration (ver memória `arkdoctor_deploy_readiness`). Documentar em `docs/ops/`.
- Formato: `base64url(payload).base64url(hmac)`.
- Helpers `signConsentToken` / `verifyConsentToken` em `src/modules/consents/token.ts`, com testes. Usar `crypto.subtle` (Web Crypto) — disponível no runtime do Workers e no Node; **não** o módulo `crypto` do Node.

### Geração do link

No card "Pendente" da página autenticada, botão **"Enviar link"** → `createConsentLinkAction(contactId, kind)` retorna a URL `/{origin}/assinar/{token}` + um QR.

- QR: dependência **`qrcode`** (~20 KB gzip), lazy-load só na página `/pacientes/[id]/documentos`, saída como **string SVG inline** (`toString({ type: 'svg' })`) — sem canvas, sem problema de CSP.
- A enfermeira mostra o QR na tela ou envia o link pelo WhatsApp (integração Uazapi já existente) — envio por WhatsApp não requer código novo, é copiar o link.

### Rota pública

`src/app/assinar/[token]/page.tsx` (fora do grupo `(app)`, sem auth) + `src/app/assinar/actions.ts` com `createServiceRoleSupabaseClient` — precedente direto de `src/app/agendar/[accountId]`.

- A página decodifica o token no servidor. Inválido/expirado/adulterado → tela neutra: "Link expirado ou inválido. Peça um novo à clínica." Sem vazar se o token existiu.
- Válido → carrega nome do paciente + template, exibe **a mesma UI de assinatura** (texto + canvas + nome), sem os cards/gestão.
- "Confirmar" → `buildConsentPdf` no browser do paciente → `submitPublicConsentAction(token, formData)`:
  1. Revalida o token.
  2. Valida `application/pdf` + tamanho.
  3. Upload via service-role no path `{accountId}/{contactId}/{kind}-{timestamp}.pdf`.
  4. `recordConsent(signedVia: 'link')`.

### Proteção da rota pública

- O token HMAC de 256 bits é o portão — não é adivinhável por força bruta.
- **Rate limit por IP** reaproveitando `withinBookingRateLimit` (ou variante).
- **Sem Turnstile** — não há incentivo de bot-farming; a enfermeira controla quando os links existem. Pior caso de token vazado: um PDF assinado inesperado que ela vê na tela e exclui.
- **Single-use não é aplicado** (token stateless, sem onde marcar "usado"). O `exp` de 48h limita a janela; reassinar dentro do prazo apenas gera outra linha, resolvida na tela. Trade-off consciente para manter zero tabela de tokens.

## Tratamento de erros

| Situação | Comportamento |
|---|---|
| Upload pro Storage falha | Server action retorna `{ ok: false, error }`; dialog mostra "Não foi possível salvar. Tente novamente." A linha não é inserida. |
| Insert falha após upload OK | Remove o objeto recém-subido (best-effort) e retorna erro — evita PDF órfão. |
| PDF > 2 MB ou `content-type` ≠ `application/pdf` | Server action rejeita antes de subir. |
| Token inválido / adulterado / expirado | Tela neutra "Link expirado ou inválido". |
| Rate limit estourado em `/assinar` | "Muitas tentativas. Aguarde um minuto." |
| `signature_pad` vazio ou nome em branco | Botão "Confirmar" desabilitado. |
| `pdf-lib` falha ao montar (browser antigo) | Catch no client: "Não foi possível gerar o documento neste aparelho." |
| `accounts.professional_name` nulo | PDF sai com a linha do profissional vazia; **não bloqueia**. Aviso discreto no card sugerindo preencher em `/configuracoes`. |
| Dados de paciente faltando no template | Placeholder vira `—`; não quebra. |
| Reassinar (2ª linha do mesmo `kind`) | Permitido; card mostra a mais recente; a antiga fica acessível para excluir. |
| Excluir paciente | Linhas caem por cascade + purge do prefixo no Storage. |

## Testes

### Automatizados (`vitest`)

| Arquivo | Cobre |
|---|---|
| `modules/consents/repository.memory.test.ts` | Paridade insert / list (ordem desc) / get / delete |
| `modules/consents/service.test.ts` | `recordConsent` valida `kind` fora da lista, `signedVia` inválido, nome vazio; monta `storagePath` no formato certo |
| `modules/consents/templates.test.ts` | `renderTemplate` substitui todos os `{{placeholders}}`; token desconhecido vira `—`; quebra em parágrafos |
| `modules/consents/token.test.ts` | `sign`/`verify` roundtrip; token expirado rejeitado; payload adulterado rejeitado; segredo diferente rejeitado |
| `components/consents/pdf-wrap.test.ts` | Helper de quebra de linha/paginação: linha longa quebra na largura certa; parágrafo estoura para página nova |

### Smoke-test manual (usuário, junto com o da Feature 1)

- Assinar inline no desktop → PDF aparece no card → "Ver PDF" abre.
- "Enviar link" → abrir no celular → assinar → PDF cai no paciente com `signed_via = 'link'`.
- Token expirado → tela neutra.
- Reassinar → 2ª linha; card mostra a mais recente.
- Excluir → some da tela e do Storage.
- Excluir paciente → PDFs somem do bucket.

### Não testado de propósito

Saída visual do `pdf-lib`, canvas do `signature_pad`, geração do SVG do QR (dep externa testada).

## Fora de escopo

- Status estruturado / dashboard de pendências / coluna na lista de pacientes (decisão #4).
- Bloqueio de agenda por documento não assinado (decisão #4).
- Versionamento de template — trocar o texto vale para os próximos, não re-emite os já assinados (o PDF assinado é imutável, por design).
- Verificação de identidade além da presença da enfermeira (decisões #1 e #2).
- Carimbo de tempo de terceiro (trade-off consciente do in-app vs. plataforma externa).
- Editor de templates em `/configuracoes`.
- Assinatura remota/assíncrona real (o "link" é para uso presencial, no celular do paciente ali na hora).

## Dependências novas

| Pacote | Tamanho | Uso | Carregamento |
|---|---|---|---|
| `pdf-lib` | ~100 KB gzip | Montar o PDF | `import()` dinâmico nas páginas de assinatura |
| `signature_pad` | ~5 KB | Captura do traço | `import()` dinâmico nas páginas de assinatura |
| `qrcode` | ~20 KB gzip | QR do link | `import()` dinâmico em `/pacientes/[id]/documentos` |

Nenhuma infra nova além do bucket de Storage. Uma env var nova (`CONSENT_LINK_SECRET`).
