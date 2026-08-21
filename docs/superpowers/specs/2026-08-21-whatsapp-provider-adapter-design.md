# WhatsApp Provider Adapter — Design

Status: aprovado para implementação
Última atualização: 2026-08-21

## Contexto

O módulo WhatsApp hoje (`src/modules/whatsapp/`) é só um log manual de conversas: a usuária digita nome/telefone pra abrir uma conversa e digita cada mensagem manualmente — não existe envio nem recebimento reais. O PRD (`docs/prd/arkdoctor-prd.md`, stories 9 e 30-35) descreve uma integração real via camada de adapter, desacoplando o resto do sistema do provedor de mensageria específico, com dois provedores possíveis (API oficial da Meta, ou não-oficial tipo Evolution API/Baileys/Uazapi via QR code), configurável por conta.

**Decisão desta rodada:** a usuária ainda não tem conta/credenciais em nenhum provedor real (está avaliando a Uazapi). Construir agora a interface do adapter e um **provider fake/local, 100% funcional e testado**, deixando os adapters reais como um adapter novo a implementar quando houver credenciais pra validar contra a API de verdade — evita escrever integração de rede não-testável e potencialmente incorreta.

## Arquitetura

### Adapter interface

`src/modules/whatsapp/provider.ts`:

```ts
export interface WhatsappProvider {
  connect(accountId: string): Promise<void>;
  disconnect(accountId: string): Promise<void>;
  getConnectionStatus(accountId: string): Promise<"disconnected" | "connecting" | "connected">;
  sendMessage(accountId: string, toPhone: string, body: string): Promise<{ providerMessageId: string }>;
}
```

Uma fábrica `getWhatsappProvider(providerName: string): WhatsappProvider` seleciona a implementação. Hoje só existe `"fake"`; é o ponto de extensão para adapters reais depois, sem mudar nada ao redor.

### Fake provider

`src/modules/whatsapp/provider.fake.ts` — `connect()` marca a conta como `"connected"` imediatamente (sem QR real); `sendMessage()` retorna sucesso simulado sem chamada de rede, apenas gerando um `providerMessageId` local (`crypto.randomUUID()`).

### Dado novo: `whatsapp_connections`

Uma linha por conta:

```sql
create table whatsapp_connections (
  account_id uuid primary key references accounts(id) on delete cascade,
  provider text not null default 'fake',
  status text not null default 'disconnected' check (status in ('disconnected', 'connecting', 'connected')),
  connected_at timestamptz,
  config jsonb,
  updated_at timestamptz not null default now()
);
```

`config` fica reservada (nula, sem uso hoje) para credenciais de provedores reais no futuro — mesmo padrão da coluna `appointment_id` já reservada em `financial_entries` antes de ser usada.

RLS segue o padrão das outras tabelas do módulo (`account_users`).

## Fluxo de mensagens

### Saída (envio)

O campo de envio no inbox (`whatsapp-client.tsx`) hoje só grava no banco via `logMessageAction`. Esse action passa a:
1. Chamar `provider.sendMessage(accountId, conversation.contactPhone, body)`.
2. Gravar a mensagem (como já faz), agora incluindo o `providerMessageId` retornado.

Sem mudança de UI — o comportamento observável (mensagem aparece na conversa) é o mesmo; a diferença é que agora passa pelo adapter.

### Entrada (recebimento) — novo

Rota `POST /api/whatsapp/webhook/[accountId]/route.ts`. A rota faz só o parsing específico do payload do provedor (para o fake provider, um payload de teste simples: `{ fromPhone, fromName?, body }`) e delega para uma função de service pura:

```ts
async function handleInboundMessage(
  deps: { crm: CrmRepository; whatsapp: WhatsappRepository },
  accountId: string,
  input: { fromPhone: string; fromName?: string; body: string },
): Promise<Message>
```

Passos:
1. Busca `Contact` por telefone exato (`crm.findContactByPhone` — método novo no repositório CRM; hoje só existe busca fuzzy por nome/telefone).
2. Se não existir, chama `crm.createContact(repo, accountId, { name: fromName ?? fromPhone, phone: fromPhone })` — **essa função já cria automaticamente um Deal no primeiro estágio do pipeline** (`src/modules/crm/service.ts:5-19`), então a story #9 do PRD ("nova conversa de número desconhecido cria lead no pipeline") fica resolvida sem código novo nessa parte.
3. Busca `Conversation` por telefone (`whatsapp.getConversationByPhone` — método novo) ou cria uma nova vinculada ao contato.
4. Insere a `Message` (`direction: "inbound"`) e atualiza preview + incrementa `unreadCount` da conversa (`incrementUnreadCount` — método novo; o campo já existe e já é exibido na UI, mas nunca foi incrementado — hoje sempre fica 0).

Essa separação (rota HTTP fina + função de service pura) segue a decisão de teste do PRD: testável sem provedor real, batendo direto na função ou simulando um POST no webhook via `curl`/teste de integração.

### Marcar como lida

Ao abrir uma conversa (`whatsapp-client.tsx`, efeito que busca mensagens ao trocar `selectedConversationId`), chama `resetUnreadCountAction` — zera `unreadCount` daquela conversa.

## UI

No topo do inbox (`src/app/(app)/whatsapp/page.tsx` ou `whatsapp-client.tsx`), um indicador de status — "Conectado" (verde) / "Desconectado" (cinza) — com botão "Conectar" / "Desconectar" chamando `connectWhatsappAction`/`disconnectWhatsappAction`. Com o fake provider, "Conectar" já mostra "Conectado" na hora — não há tela de QR code nesta fase (só faz sentido para um provedor real; fica para quando um adapter real for implementado).

## Resiliência (stories #33/#34)

O módulo WhatsApp já não é importado por nenhum outro módulo (`crm`, `scheduling`, `finance`, `dashboard`) — confirmado por leitura do código atual. "Desconectar" ou qualquer erro do provider não tem como afetar as outras telas, estruturalmente, sem trabalho adicional nesta spec.

## Testes

Prioridade (conforme decisão de teste do PRD — lógica de vínculo com Contact/Conversation testável sem infraestrutura real):
- `handleInboundMessage`: cria contato+deal quando telefone é desconhecido; reusa contato existente quando telefone já é conhecido; cria conversa nova vs. reusa conversa existente; incrementa `unreadCount`.
- Fake provider: `connect`/`disconnect`/`getConnectionStatus` refletem o estado esperado; `sendMessage` retorna um `providerMessageId`.
- Repository em memória: `findContactByPhone`, `getConversationByPhone`, `incrementUnreadCount`, `resetUnreadCount`.

## Fora de escopo

- Adapter real da Uazapi, Evolution API ou API oficial da Meta — implementação futura, quando houver credenciais para validar.
- Tela/fluxo de QR code (específico de provedor real).
- Lembretes/confirmações automáticas de agendamento via WhatsApp (já fora de escopo do PRD).
- Envio de mídia (imagem, áudio, documento) — só texto, como hoje.
