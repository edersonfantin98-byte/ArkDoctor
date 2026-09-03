# WhatsApp — mídia, importação de histórico e robustez de envio

Data: 2026-09-03
Status: design aprovado no brainstorm — pronto para virar planos de implementação

## Contexto

Depois de estabilizar conexão e recebimento de mensagens da Uazapi (commits de
2026-09-01 em `src/modules/whatsapp/`), o módulo hoje só lida com texto e só vê
mensagens novas (via webhook). Três lacunas foram levantadas com a usuária:

1. Não existe importação do histórico de conversas anterior à conexão.
2. Mídia (imagem, áudio, vídeo, documento) é ignorada — no envio e no recebimento.
3. O botão "Enviar" da inbox não checa se o WhatsApp está conectado; a falha
   aparece só como erro cru na hora.

Um quarto ponto — a inbox usa polling de 5s em vez de realtime — foi discutido e
**adiado** (ver seção "Realtime — adiado").

Este documento cobre os três itens num único design porque mídia e histórico
compartilham decisões de modelo de dados e de interface do provider. A
implementação é sequenciada em três planos independentes (ver "Sequência de
implementação").

## Princípios de escopo

- **Sem grupos, em lugar nenhum.** Só conversas diretas 1:1 com paciente/lead.
  O webhook já descarta `isGroup`; a importação filtra `wa_isGroup = false`.
- **YAGNI.** Nada de configurabilidade não pedida. Limites são constantes no
  código, não settings.
- **Validação contra a API real antes de implementar** os pontos 1 e 2 — o bug
  do webhook de 2026-09-01 foi causado por suposição de payload não validada; não
  pode repetir.

---

## Item 3 — Bloquear envio quando desconectado

### Comportamento

- `src/components/whatsapp/whatsapp-client.tsx`: quando
  `connection?.status !== "connected"`, o campo de mensagem e o botão "Enviar"
  ficam desabilitados e aparece uma faixa acima do compositor:
  "WhatsApp desconectado — conecte para enviar mensagens."
- O mesmo vale para o anexo de mídia (item 2).
- `src/modules/whatsapp/service.ts` — `logMessage`: antes de chamar
  `provider.sendMessage`/`sendMedia` para `direction: "outbound"`, verifica o
  status da conexão (via `provider.getConnectionStatus` ou o status persistido no
  repo). Se não estiver `connected`, **retorna `{ error: "..." }` como dado** —
  não lança. `logMessageAction` propaga o `{ error }` para a UI, seguindo o
  padrão já adotado em `connectWhatsappAction`.

### Fora de escopo

- Fila de mensagens para enviar quando reconectar. Se está desconectado, a
  mensagem simplesmente não é aceita.

### Banco

Nenhuma mudança.

### Testes

- `service.logMessage` com status `disconnected` retorna `{ error }` e **não**
  chama `provider.sendMessage`.
- `service.logMessage` com status `connected` segue o fluxo atual.

---

## Item 2 — Mídia (imagem, áudio, vídeo, documento)

Direção: enviar e receber. Todos os quatro tipos.

### Modelo de dados — migração `0016`

> A última migração aplicada é `0015_contacts_document_fields.sql`. Esta é a
> `0016`. Seguir o padrão das demais (RLS por `account_id`, `search_path`
> explícito em funções — ver `0012`).

Colunas novas em `whatsapp_messages`:

| coluna | tipo | observação |
|---|---|---|
| `media_type` | `text` null | `image` \| `audio` \| `video` \| `document`. `null` = mensagem de texto puro. |
| `media_status` | `text` null | `stored` \| `too_large` \| `expired`. `null` quando `media_type` é `null`. |
| `media_storage_path` | `text` null | caminho do objeto no bucket. `null` quando `media_status` ≠ `stored`. |
| `media_mime` | `text` null | ex: `image/jpeg`, `audio/ogg`. |
| `media_filename` | `text` null | nome original, relevante para `document`. |

- `body` continua existindo e passa a guardar a **legenda** (caption) da mídia,
  ou string vazia quando não há legenda.
- Constraint de check: se `media_type is not null` então `media_status is not
  null`; valores de `media_type` e `media_status` restritos aos enumerados acima.
- Índice parcial para o cron de retenção:
  `create index ... on whatsapp_messages (sent_at) where media_status = 'stored'`.

Coluna nova em `whatsapp_conversations` (usada pelo item 1, criada na mesma
migração):

| coluna | tipo | observação |
|---|---|---|
| `history_imported_at` | `timestamptz` null | marca de idempotência da importação. |

### Supabase Storage

- Bucket **privado** `whatsapp-media` (criado na migração `0016` via
  `storage.create_bucket` ou no painel — decidir no plano; preferir migração para
  rastreabilidade).
- Path do objeto: `{accountId}/{conversationId}/{messageId}.{ext}`.
- Políticas: acesso só pelo **service role**. O app nunca expõe o path cru nem dá
  acesso anônimo ao bucket. O cliente recebe apenas **URLs assinadas** geradas no
  servidor, com TTL de 1 hora.
- Teto por arquivo: **16 MB**. Acima disso o arquivo **não é baixado**; a
  mensagem é gravada com `media_type` preenchido e `media_status = 'too_large'`.

### CSP

As URLs assinadas do Supabase Storage (domínio
`https://<project-ref>.supabase.co/storage/v1/...`) precisam entrar em `img-src`
e `media-src` do CSP. Verificar onde o CSP é montado (`src/middleware.ts` e/ou
config de headers do Next) e ajustar. Ponto explícito no plano — CSP restrito já
quebrou funcionalidade neste projeto antes.

### Provider Uazapi — métodos novos

Uazapi-específicos, fora da interface genérica `WhatsappProvider`, no mesmo
padrão do `getQrCode` já existente em `UazapiProvider`:

- `sendMedia(accountId, toPhone, input)` — `input` com `{ type, dataBase64 |
  url, filename?, caption? }`. Chama o endpoint de envio de mídia da Uazapi
  (`/send/media` ou equivalente — **confirmar contra a API real**).
- `downloadMedia(accountId, ref)` — baixa os bytes de uma mídia recebida a partir
  da referência que vem no payload do webhook (chave/URL — **confirmar formato
  real**). Retorna `{ bytes, mime, filename? }` ou lança.

### Recebimento (webhook)

`src/app/api/whatsapp/webhook/[accountId]/route.ts` +
`src/modules/whatsapp/service.ts`:

1. `parseWebhookPayload` passa a reconhecer mensagens de mídia no payload
   `{ EventType: "messages", message: {...} }`. Além do texto, extrai:
   `media_type` (a partir do tipo/mimetype da Uazapi), referência para download,
   `media_mime`, `media_filename` (quando documento), e a legenda (vira `body`).
   Continua descartando `fromMe` e `isGroup`.
2. Nova etapa de ingestão de mídia (no route ou numa função de serviço dedicada,
   ex. `ingestInboundMedia`):
   - baixa via `provider.downloadMedia`;
   - se o tamanho > 16 MB → grava mensagem com `media_status = 'too_large'`,
     sem baixar/subir;
   - senão sobe no bucket e grava a mensagem com `media_status = 'stored'` e o
     `media_storage_path`;
   - **se o download ou upload falhar**, grava a mensagem mesmo assim com
     `media_type` preenchido e `media_status = 'expired'` — a mensagem não some e
     a UI já renderiza `expired` como conteúdo indisponível. Não se cria um
     quarto valor `failed`: a UX é idêntica (mídia que não abre) e o cron de
     retenção converge esses registros para `expired` de qualquer forma.
3. `handleInboundMessage` continua criando lead/paciente automaticamente quando o
   telefone não bate com nenhum contato.

### Envio (UI)

`whatsapp-client.tsx`, no compositor:

- Botão de anexo (ícone de clipe) ao lado do campo de texto.
- Ao escolher um arquivo: abre um preview (miniatura para imagem, ícone + nome
  para os demais), um campo opcional de legenda e um botão "Enviar".
- **Um arquivo por vez.**
- Validação de tamanho no cliente (16 MB) antes de subir, com mensagem clara.
- `logMessageAction` ganha um caminho para mídia: recebe o arquivo (via
  `FormData`), sobe no bucket, chama `provider.sendMedia`, grava a mensagem
  `outbound` com os campos de mídia preenchidos e `media_status = 'stored'`.

### Renderização (UI)

Ao listar mensagens, a server action devolve, para cada mensagem com
`media_status = 'stored'`, uma **URL assinada** já pronta (gerada no servidor).
A UI então renderiza:

| `media_type` | render |
|---|---|
| `image` | miniatura clicável que abre a imagem em tamanho real |
| `audio` | `<audio controls>` |
| `video` | `<video controls>` |
| `document` | cartão com ícone, `media_filename` e botão "Baixar" |

- `media_status = 'too_large'` → marcador "[arquivo muito grande — não salvo]"
  com o ícone do tipo.
- `media_status = 'expired'` → marcador "[mídia expirada]" com o ícone do tipo.
- Legenda (`body`) é mostrada abaixo da mídia quando presente.

### Testes

- `parseWebhookPayload`: fixtures reais de payload de mídia (imagem, áudio,
  vídeo, documento) capturados na validação ao vivo → extração correta de
  `media_type`, mime, filename, legenda; ainda descarta `fromMe`/`isGroup`.
- Ingestão: arquivo > 16 MB → `too_large`, não sobe nada; arquivo ok →
  `stored` + path; falha de download → mensagem gravada, não lança.
- `service.logMessage` para mídia outbound: sobe no bucket, chama `sendMedia`,
  grava com os campos certos.
- Provider Uazapi: `sendMedia`/`downloadMedia` com `fetch` fakeado, no padrão dos
  testes existentes.

---

## Item 1 — Importar histórico de conversas

### Gatilho

Dois pontos de entrada (decisão "C" do brainstorm):

1. **Aviso pós-conexão.** Quando o status passa a `connected` e ainda não há
   nenhuma conversa com `history_imported_at` preenchido, a tela do WhatsApp
   mostra um aviso: "Conexão feita. Importar as conversas recentes?"
   com botões **[Importar]** e **[Agora não]**.
2. **Botão fixo** "Importar histórico" sempre visível na tela do WhatsApp
   (área de conexão), para rodar depois — cobre "conectei com pressa" e
   "desconectei e reconectei".

### Escopo da importação

Constantes no código:

- Só conversas **diretas** — filtro `wa_isGroup = false` no `/chat/find`.
- Conversas com mensagem nos **últimos 60 dias** (por `wa_lastMsgTimestamp`).
- No máximo **50 conversas** por execução.
- **30 mensagens** por conversa (`/message/find`, `limit: 30`, mais recentes).
- Telefone que não bate com nenhum paciente/lead → **cria lead novo**, reusando a
  lógica de auto-criação de `handleInboundMessage`.
- **Mídia:** só mensagens com menos de 30 dias baixam o arquivo (regra única de
  retenção — ver "Janela de retenção"). Mensagens de mídia mais antigas entram
  com `media_type` preenchido e `media_status = 'expired'`, sem baixar. Texto e
  legenda entram sempre.

### Idempotência e limite do Worker

- `whatsapp_conversations.history_imported_at` (timestamptz). A importação
  **pula** qualquer conversa já marcada.
- A marca é gravada **logo após** processar cada conversa. Se a Server Action
  estourar o limite de CPU/tempo do Cloudflare Worker no meio, clicar no botão de
  novo **retoma de onde parou**.
- O plano de implementação avalia, medindo contra a instância real, se 50
  conversas num clique é seguro. Se não for, o fallback é processar em **lotes**
  (ex.: 15 conversas por clique) e o botão passa a "Continuar importação"
  enquanto houver conversas não marcadas. Decisão fina fica para o plano — o
  modelo de dados já suporta as duas opções.

### Robustez

- Erro numa conversa (rede, payload inesperado) **não trava** o restante: registra
  e segue.
- Ao final, a action retorna `{ importadas, puladas, erros }` e a UI mostra um
  resumo ("12 conversas importadas, 3 já existentes, 1 com erro").

### Provider Uazapi — métodos novos

Uazapi-específicos, junto de `getQrCode`/`sendMedia`/`downloadMedia`:

- `findChats(accountId, { onlyDirect: true, sinceTimestamp, limit })` →
  `POST /chat/find`. Retorna lista de chats com `phone`, `wa_isGroup`,
  `wa_lastMsgTimestamp`, `wa_contactName`/nome, etc.
- `findMessages(accountId, { chatId, limit })` → `POST /message/find`. Retorna
  mensagens da mais recente para a mais antiga.

### Mapeamento de mensagem

Reaproveita o parsing já corrigido para o webhook:

- `fromMe` → `direction` (`outbound` / `inbound`).
- Remetente: `sender_pn` preferencial sobre `sender` (que vem como `@lid`).
- Texto/legenda, timestamp, tipo de mídia — mesma extração do `parseWebhookPayload`.
- Refatorar a extração comum para uma função pura reutilizável pelos dois
  caminhos (webhook e importação), em vez de duplicar.

### Validação ao vivo obrigatória (antes de implementar)

Contra a instância real `arkscrapper.uazapi.com` (conta `silvana@arkdoctor.com`),
com o Monitor de Eventos / chamadas `curl` diretas:

- formato exato do payload de `/chat/find` (campos usados: grupo, telefone,
  timestamp, nome);
- formato exato do payload de `/message/find` (campos de cada mensagem: `fromMe`,
  texto, timestamp, remetente, e como a mídia aparece);
- formato da mídia no payload do **webhook** de mensagens recebidas;
- endpoints e formato de `sendMedia` e do download de mídia.

Os payloads capturados viram fixtures dos testes.

### Testes

- Filtro de escopo: grupos descartados; conversa fora dos 60 dias descartada;
  corte em 50 conversas; 30 mensagens por conversa.
- Idempotência: conversa com `history_imported_at` preenchido é pulada;
  reexecução após "interrupção" continua nas não marcadas.
- Robustez: erro numa conversa não derruba o lote; resumo final correto.
- Mídia no histórico: mensagem < 30 dias baixa; ≥ 30 dias entra como `expired`
  sem baixar.
- Auto-criação de lead quando o telefone não tem contato.

---

## Cron de retenção de mídia (30 dias)

A janela de 30 dias conta pela **data da mensagem** (`sent_at`), não pela data em
que o arquivo foi guardado. Regra única: "o app guarda mídia dos últimos 30
dias".

- **Cloudflare Cron Trigger** diário chamando uma rota interna
  `POST /api/whatsapp/media-retention`, protegida por um secret (query string ou
  header, mesmo padrão do webhook — comparar com um valor em env var).
- Config do cron no arquivo de configuração do Cloudflare Workers do projeto
  (`wrangler.toml` / equivalente — confirmar no plano como o deploy atual é
  configurado, já que é automático via integração Git).
- Lógica da rota:
  - seleciona `whatsapp_messages` com `media_status = 'stored'` e
    `sent_at < now() - interval '30 days'` (usa o índice parcial);
  - para cada: apaga o objeto do bucket (`media_storage_path`), depois seta
    `media_storage_path = null`, `media_status = 'expired'`;
  - erro ao apagar um objeto não trava os demais; loga e segue.
- Idempotente: rodar duas vezes no mesmo dia não causa problema (a segunda não
  encontra mais nada com `status = 'stored'` vencido).

### Testes

- Seleção pega só `stored` vencido; não toca em `stored` recente nem em
  `expired`/`too_large`.
- Após processar, a mensagem fica `expired` com `media_storage_path = null`.

---

## Realtime — adiado

A inbox atualiza por polling de 5s (conversas + mensagens da conversa aberta).
Funciona para o uso de uma clínica única. **Não** entra nesta rodada.

Revisitar quando: houver uma segunda clínica usando o produto, **ou** houver
reclamação concreta de atraso na inbox. Caminho provável quando for a hora: canal
Realtime do Supabase escutando `postgres_changes` em `whatsapp_messages`,
substituindo os `setInterval` do `whatsapp-client.tsx`.

---

## Sequência de implementação

Três planos independentes, nesta ordem:

1. **Bloquear envio quando desconectado** (item 3). Pequeno, sem banco, risco
   baixo. Sai primeiro.
2. **Mídia** (item 2). Inclui a migração `0016` (colunas de mídia + bucket +
   `history_imported_at`), os métodos `sendMedia`/`downloadMedia` do provider, a
   ingestão no webhook, o envio e a renderização na UI, o ajuste de CSP, e o
   **cron de retenção**.
3. **Importar histórico** (item 1). Depende da migração `0016` e do mapeamento de
   mídia já prontos do plano 2.

Cada plano começa com a etapa de **validação ao vivo** dos payloads que ele usa,
antes de escrever código de produção.

## Arquivos afetados (visão geral)

- `supabase/migrations/0016_whatsapp_media.sql` — novo
- `src/modules/whatsapp/types.ts` — campos de mídia em `Message`,
  `history_imported_at` em `Conversation`
- `src/modules/whatsapp/repository.ts` + `repository.supabase.ts` +
  `repository.memory.ts` — inserir/ler mídia, marcar `history_imported_at`,
  query de retenção
- `src/modules/whatsapp/provider.uazapi.ts` — `sendMedia`, `downloadMedia`,
  `findChats`, `findMessages`
- `src/modules/whatsapp/service.ts` — validação de status no envio, ingestão de
  mídia, importação de histórico, extração de mensagem compartilhada
- `src/app/(app)/whatsapp/actions.ts` — action de envio com mídia (FormData),
  action de importar histórico, URLs assinadas na listagem de mensagens
- `src/components/whatsapp/whatsapp-client.tsx` — faixa de desconectado, anexo +
  preview no compositor, renderização de mídia, aviso pós-conexão, botão e resumo
  de importação
- `src/app/api/whatsapp/webhook/[accountId]/route.ts` — ingestão de mídia recebida
- `src/app/api/whatsapp/media-retention/route.ts` — novo, cron de retenção
- CSP (`src/middleware.ts` / config de headers) — domínio do Supabase Storage
- Config do Cloudflare Workers — Cron Trigger diário
