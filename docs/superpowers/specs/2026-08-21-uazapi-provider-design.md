# Uazapi Provider — Design

Status: aprovado para implementação
Última atualização: 2026-08-21

## Contexto

`docs/superpowers/specs/2026-08-21-whatsapp-provider-adapter-design.md` definiu a interface `WhatsappProvider` e implementou só um provider `fake` (sem credenciais reais disponíveis naquele momento). A usuária agora tem conta criada na Uazapi (ainda sem o token da instância em mãos). Esta spec documenta um segundo provider real — `UazapiProvider` — implementando a mesma interface, sem nenhuma mudança no resto do sistema.

**Pré-requisito:** o plano `docs/superpowers/plans/2026-08-21-whatsapp-provider-adapter.md` (adapter + fake provider + webhook + auto-criação de contato) precisa estar implementado antes deste. Esta spec só adiciona uma segunda implementação de `WhatsappProvider` e a UI de conexão real; toda a lógica de negócio (auto-criar contato/lead, marcar como lida, etc.) já existe e é reaproveitada sem alteração.

## Pesquisa da API (fonte: https://docs.uazapi.com/, lida em 2026-08-21)

- **Base URL:** `https://{subdomain}.uazapi.com`
- **Autenticação:** header `token` com o token da instância (endpoints administrativos usam `admintoken`, não usado aqui).
- **Estados da instância:** `disconnected`, `connecting`, `connected`, `hibernated`.
- **Conectar:** `POST /instance/connect` — corpo opcional (`browser`, `systemName`, etc.); omitir o campo `phone` gera QR code. Estado muda para `connecting`. QR code expira em 2 minutos.
- **Status:** `GET /instance/status` — retorna o estado atual da instância e o QR code atualizado enquanto `connecting`.
- **Enviar texto:** `POST /send/text` — corpo `{ "number": "<telefone ou JID>", "text": "<mensagem>" }`. Resposta inclui os campos do schema `Message` (`id`, `messageid`).
- **Configurar webhook:** `POST /webhook` — modo simples: `{ "url": "...", "events": ["messages"], "excludeMessages": ["wasSentByApi"] }`. `excludeMessages: ["wasSentByApi"]` evita que a própria API gere um loop recebendo de volta as mensagens que ela mesma enviou.
- **Payload do webhook** (schema `WebhookEvent`): `{ "event": string, "instance": string, "data": object }`. Para o evento `"messages"`, `data` segue o schema `Message`: `sender` (ID do remetente), `senderName` (nome exibido), `text`, `fromMe` (boolean), `isGroup` (boolean), `messageType`, entre outros.

**Suposição a validar na implementação** (não confirmada na documentação lida): o campo `sender` provavelmente vem como um JID completo (ex.: `5511999999999@s.whatsapp.net`), seguindo o padrão comum de APIs baseadas em Baileys/Evolution, não como um telefone puro. O adapter deve extrair só a parte numérica antes do `@` ao normalizar para `fromPhone`. Confirmar contra um payload real assim que o token estiver disponível (Task de verificação manual no plano).

## Decisões desta rodada

- **Onde guardar credenciais:** `whatsapp_connections.config` (jsonb, já reservado) — `{ subdomain: string; token: string; webhookSecret: string }`. Protegido por RLS, mesmo nível dos demais dados da conta. Sem criptografia adicional nesta rodada — decisão explícita da usuária após avaliar o trade-off (nenhum local de armazenamento é inquebrável; o ponto fraco real é a infraestrutura comprometida, não o local específico).
- **Mapeamento de estado:** `hibernated` (Uazapi) → `"disconnected"` (nosso modelo de 3 estados) — simplificação deliberada, não exposta na UI.
- **Segurança do webhook:** a rota `/api/whatsapp/webhook/[accountId]` hoje só confia no UUID da conta na URL. Como a Uazapi é um serviço real na internet, a URL de webhook registrada passa a incluir um segredo por conta como query param (`?secret=<webhookSecret>`), gerado automaticamente ao conectar e guardado em `config.webhookSecret`. A rota rejeita (401) qualquer chamada sem o segredo correto.
- **UI de QR code:** obrigatória nesta rodada (diferente do fake provider, que não precisava). Fluxo: usuária clica "Conectar via Uazapi" → sistema chama `connect` → mostra o QR code retornado → faz polling do status a cada poucos segundos → assim que `connected`, esconde o QR e mostra o badge normal.

## Arquitetura

`src/modules/whatsapp/provider.uazapi.ts` exporta `createUazapiProvider(repo: WhatsappRepository): WhatsappProvider` — mesma assinatura de `createFakeWhatsappProvider`. Cada método busca `repo.getConnection(accountId)` para ler `config.subdomain`/`config.token` antes de chamar a API da Uazapi via `fetch`. `getWhatsappProvider` (fábrica já existente) ganha um novo branch: `if (providerName === "uazapi") return createUazapiProvider(repo)`.

Como `connect()` da Uazapi retorna um QR code (não um simples "conectado"), o método `connect(accountId)` do `UazapiProvider` chama `POST /instance/connect`, extrai o QR code da resposta, salva em `whatsapp_connections` (novo campo — ver abaixo) e marca o status como `"connecting"`. Um novo método `getQrCode(accountId): Promise<string | null>` (fora da interface `WhatsappProvider` — específico do Uazapi, chamado diretamente pela action de UI, não pelo resto do sistema) permite à UI buscar o QR code atual.

### Novo dado

Coluna nova em `whatsapp_connections`: `qr_code text` — guarda o QR code (string base64/data-URL) retornado durante o `connecting`. Nula fora desse estado.

## UI

Na página do WhatsApp, quando `provider === "uazapi"` e `status === "connecting"`, mostra a imagem do QR code (via `<img src={qrCode} />`, já que a Uazapi retorna como data URL) com um botão "Verificar novamente" e polling automático a cada 3 segundos chamando `getConnectionStatusAction` até `connected` ou até passar 2 minutos (timeout — mostra mensagem para tentar reconectar).

Configuração da conta (subdomínio + token da Uazapi): tela simples em "Configurações" (nova, mínima) com dois campos de texto e um botão "Salvar" — grava em `config` via uma action dedicada. Sem essa configuração salva, o botão "Conectar via Uazapi" fica desabilitado com uma dica explicando o motivo.

## Testes

- `UazapiProvider`: testável via mock do `fetch` global (`vi.stubGlobal("fetch", ...)`) — sem chamar a API real. Casos: `connect` salva QR code e status `connecting`; `sendMessage` monta a URL/headers corretos e retorna `providerMessageId` a partir da resposta; `getConnectionStatus` mapeia `hibernated` para `"disconnected"`.
- Webhook: teste do segredo — requisição sem `?secret=` correto retorna 401 antes de chamar `handleInboundMessage`.
- Normalização do `sender` (JID → telefone puro): função pura, testável isoladamente com múltiplos formatos de entrada.

## Fora de escopo

- Adapter da API oficial da Meta — ainda não avaliado.
- Envio de mídia (imagem, áudio, documento) via Uazapi — só texto, mesmo escopo do fake provider.
- Múltiplas instâncias Uazapi por conta — uma conexão por conta, como já modelado.
- Criptografia do token em repouso — avaliada e descartada nesta rodada por decisão explícita da usuária.
