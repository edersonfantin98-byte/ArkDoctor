# Evolution API Provider — Design

Status: proposto
Última atualização: 2026-08-23

## Contexto

Hoje o único provider real do WhatsApp é a Uazapi (`docs/superpowers/specs/2026-08-21-uazapi-provider-design.md`), um serviço pago. A usuária quer uma alternativa **sem custo mensal** para uso diário/organização (baixo volume, conversas 1:1, sem disparo em massa — mesmo escopo de sempre).

Decisão desta rodada, após brainstorm (comparando com o ArkScrapper, projeto local separado que já usa `whatsapp-web.js`): construir um novo provider baseado na **Evolution API** (open-source, usa Baileys por baixo — a mesma família de tecnologia que a própria Uazapi usa), **self-hosted pela própria usuária** num servidor sempre ligado e gratuito, em vez de reaproveitar o ArkScrapper local. Motivos (já discutidos e fechados, não reabrir):

- `whatsapp-web.js` (o que o ArkScrapper usa) roda um Chromium real — pesado demais pros limites de RAM de um free-tier, o que causaria reconexões frequentes (risco de bloqueio) e instabilidade.
- Depender do PC da usuária ligado é um ponto de falha estrutural pra um inbox de clínica — mensagens de pacientes não podem depender de o computador estar ligado.
- Acoplar o WhatsApp do ArkDoctor ao ciclo de vida do ArkScrapper (produto separado, propósito diferente) é frágil.

**Hospedagem recomendada:** Oracle Cloud Free Tier (único free-tier permanente, sem prazo de validade, com specs suficientes pra rodar a Evolution API + Postgres/Redis de forma estável via Docker Compose). Alternativa mais simples de configurar, com allowance menor: Fly.io free. A escolha final do host é uma tarefa operacional da usuária (fora do código do ArkDoctor) — o provider é escrito contra a API HTTP da Evolution API, funciona com qualquer host que a sirva.

## Pesquisa da API (fontes: doc.evolution-api.com, docs.evoapicloud.com, gist.github.com/dantetesta/b8b7e7e2d6196beae968c8b0a61afb7a, lidas em 2026-08-23 — documentação oficial parcialmente indisponível no momento da pesquisa; detalhes marcados como suposição abaixo devem ser confirmados contra uma instância real na implementação)

- **Base URL:** definida pela usuária ao hospedar (ex.: `https://evolution.seu-dominio.com`, exposta via Cloudflare Tunnel ou IP público do servidor).
- **Autenticação:** header `apikey` — uma chave global definida na variável de ambiente `AUTHENTICATION_API_KEY` ao subir o servidor. Usada tanto pra criar/gerenciar instâncias quanto pra enviar mensagens (não há separação de token por instância nesse fluxo simples).
- **Criar instância** (uma vez, por conta): `POST /instance/create` — corpo `{ instanceName, integration: "WHATSAPP-BAILEYS", qrcode: true }`. Resposta inclui `qrcode.base64` (já como data URL) quando a instância ainda não está conectada.
- **Obter/renovar QR code de uma instância existente:** `GET /instance/connect/{instanceName}` — resposta `{ qrcode: "<base64 ou data URL>" }`.
- **Status da conexão:** `GET /instance/connectionState/{instanceName}` — resposta `{ instance: { state } }`. Estados possíveis: `open` (conectado), `close` (desconectado), `connecting`.
- **Enviar texto:** `POST /message/sendText/{instanceName}` — corpo `{ number, text }`. Resposta inclui `key.id` (ID da mensagem).
- **Configurar webhook** (suposição a validar): `POST /webhook/set/{instanceName}` — corpo aproximado `{ webhook: { url, events: ["MESSAGES_UPSERT"], webhook_by_events: false } }`. O formato exato varia entre versões da Evolution API — confirmar contra a versão realmente instalada durante a implementação.
- **Payload do webhook de mensagem recebida** (evento `messages.upsert`): `{ event: "messages.upsert", instance, data: { key: { remoteJid, fromMe, id }, message: { conversation }, pushName } }`. `remoteJid` vem como JID completo (`5511999999999@s.whatsapp.net` para contato individual, `...@g.us` para grupo) — mesmo padrão já tratado pelo `normalizeWhatsappJid` existente.

## Decisões desta rodada

- **Onde guardar credenciais:** `whatsapp_connections.config` (jsonb, já reservado, mesmo campo usado pela Uazapi) — `{ baseUrl: string; instanceName: string; apiKey: string; webhookSecret: string }`. Sem criptografia adicional, mesma decisão já tomada e registrada para a Uazapi (`docs/superpowers/specs/2026-08-21-uazapi-provider-design.md`) — não reabrir essa discussão aqui.
- **Criação da instância na Evolution API:** feita automaticamente pelo `connect()` do provider na primeira vez (não é um passo manual separado da usuária) — ver fluxo abaixo.
- **Mapeamento de estado:** `open` (Evolution) → `"connected"`; `close` → `"disconnected"`; `connecting` → `"connecting"`.
- **Detecção de mensagem própria/de grupo:** `fromMe === true` é ignorado (evita loop, mesmo tratamento da Uazapi); JID terminando em `@g.us` é tratado como grupo e ignorado (a Evolution API não expõe um campo `isGroup` explícito como a Uazapi — a detecção é pelo sufixo do JID).
- **Segurança do webhook:** reaproveita o mecanismo já existente (`?secret=<webhookSecret>` na URL registrada, validado em `isValidWebhookSecret`) — nenhuma mudança nesse mecanismo, só um novo provider que o alimenta com sua própria `webhookSecret`.
- **UI de QR code:** mesmo padrão já implementado para a Uazapi (polling a cada poucos segundos, timeout de 2 minutos) — reaproveitado sem mudança de comportamento, só trocando o provider por trás.

## Arquitetura

### `src/modules/whatsapp/provider.evolution.ts` (novo)

Exporta `createEvolutionProvider(repo: WhatsappRepository): EvolutionProvider extends WhatsappProvider`, mesma forma que `provider.uazapi.ts`:

- `connect(accountId)`: lê `config` (erro se ausente, mesma validação da Uazapi). Registra o webhook (`POST /webhook/set/{instanceName}`, best-effort, mesmo padrão da Uazapi — falha de configurar webhook não impede conectar). Chama `GET /instance/connectionState/{instanceName}`; se a resposta for 404 (instância não existe ainda), chama `POST /instance/create` para criar e pega o QR code da resposta de criação; caso contrário chama `GET /instance/connect/{instanceName}` para obter um QR code novo. Salva `status: "connecting"` e o QR code.
- `disconnect(accountId)`: `DELETE /instance/logout/{instanceName}` (encerra a sessão sem apagar a instância, permitindo reconectar depois sem recriar — **suposição a confirmar na implementação**, não verificada na pesquisa da API). Marca `status: "disconnected"`, limpa QR code independentemente da resposta da chamada (mesmo padrão best-effort da Uazapi).
- `getConnectionStatus(accountId)`: `GET /instance/connectionState/{instanceName}`, mapeia estado conforme a tabela acima, persiste no repositório (mesmo padrão da Uazapi, incluindo limpar o QR code ao chegar em `connected`).
- `sendMessage(accountId, toPhone, body)`: `POST /message/sendText/{instanceName}`, retorna `providerMessageId` a partir de `key.id`.
- `getQrCode(accountId)`: lê `qrCode` do repositório (idêntico à Uazapi — não bate na API a cada chamada).

`getWhatsappProvider` (`src/modules/whatsapp/provider.ts`) ganha um novo branch: `if (providerName === "evolution") return createEvolutionProvider(repo)`.

### `parseWebhookPayload` (`src/modules/whatsapp/service.ts`) — estendido, não duplicado

Hoje essa função já reconhece o formato `{ event: "messages", data: {...} }` da Uazapi e o formato simples do fake provider. Ganha um terceiro ramo para `{ event: "messages.upsert", data: { key, message, pushName } }`: ignora se `data.key.fromMe === true` ou se `data.key.remoteJid` termina em `@g.us`; extrai `fromPhone` via `normalizeWhatsappJid(data.key.remoteJid)`, `fromName` de `data.pushName`, `body` de `data.message.conversation`. Nenhuma mudança na rota do webhook (`src/app/api/whatsapp/webhook/[accountId]/route.ts`) — ela já delega inteiramente pra essa função, já é agnóstica de provider.

### Dado

Nenhuma migration nova — reaproveita `whatsapp_connections.config` (jsonb) e `qr_code` (já existe, adicionado na spec da Uazapi) sem alteração de schema.

## UI

Mesmo padrão já implementado para a Uazapi, sem mudança de fluxo — só um novo provider selecionável:

- Dialog "Configurar Evolution API" (mesmo padrão do dialog "Configurar Uazapi" já existente) com três campos: URL do servidor, nome da instância, API key. Grava em `config` via uma action dedicada (nova, espelhando a de configurar Uazapi).
- Um seletor de provider (ou dois botões "Conectar via Uazapi" / "Conectar via Evolution API") na página do WhatsApp — a usuária escolhe qual está configurado/ativo pra conta. Sem suporte a dois providers conectados simultaneamente na mesma conta (mesma limitação já existente: uma linha em `whatsapp_connections` por conta).
- QR code, polling e timeout: reaproveitados sem alteração visual — o componente já existente não sabe (nem precisa saber) qual provider está por trás.

## Testes

Mesmo padrão de teste já usado para `UazapiProvider` (`provider.uazapi.test.ts`):

- `EvolutionProvider`: testável via mock do `fetch` global. Casos: `connect` cria a instância quando ainda não existe (404 em `connectionState`) vs. só busca QR novo quando já existe; `sendMessage` monta URL/headers corretos e retorna `providerMessageId` a partir de `key.id`; `getConnectionStatus` mapeia `open`/`close`/`connecting` corretamente.
- `parseWebhookPayload`: novo caso de teste para o formato `messages.upsert` — mensagem individual válida, mensagem própria (`fromMe: true`) ignorada, mensagem de grupo (`remoteJid` com `@g.us`) ignorada.

## Fora de escopo

- Hospedar/configurar o servidor da Evolution API em si (Oracle Cloud Free Tier, Docker, Cloudflare Tunnel se necessário) — trabalho operacional da usuária, fora do repositório do ArkDoctor.
- Migrar contas que já usam Uazapi — os dois providers coexistem na fábrica (`getWhatsappProvider`); trocar de provider numa conta existente é uma reconfiguração manual (trocar `config` e reconectar), não uma migração automática.
- Envio de mídia (imagem, áudio, documento) — só texto, mesmo escopo dos outros providers.
- Múltiplas instâncias Evolution por conta — uma conexão por conta, como já modelado.
