# WhatsApp — bloquear envio quando desconectado (Plano 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O envio de mensagem pela inbox do WhatsApp para de falhar com erro cru: a UI bloqueia o compositor quando a conexão não está ativa e mostra uma faixa, e o servidor devolve o erro como dado (nunca lança) tanto no caso "já sei que está desconectado" quanto na falha real do provider.

**Architecture:** `service.logMessage` passa a devolver uma união discriminada `{ ok: true; message } | { ok: false; error }` em vez de `Message`. Ganha dois guards para `direction: "outbound"`: (1) pré-checagem barata do status persistido da conexão; (2) `try/catch` em volta de `provider.sendMessage`. `logMessageAction` repassa a união. `whatsapp-client.tsx` desabilita campo/botões e mostra a faixa quando `connection.status !== "connected"`, e passa a atualizar o status da conexão no polling de 5s que já existe.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, TypeScript, Vitest, módulo `src/modules/whatsapp/` (service + repositório em memória para testes).

**Spec:** `docs/superpowers/specs/2026-09-03-whatsapp-midia-historico-design.md` (seção "Item 3 — Bloquear envio quando desconectado")

## Global Constraints

- Todas as respostas e textos de UI em **português do Brasil**.
- Erro de envio **nunca** propaga como exceção da Server Action — sempre retorna como `{ ok: false, error }` (o Next.js redige exceções em produção, virando "Minified React error" genérico).
- Mudanças cirúrgicas: só tocar no que o Item 3 exige. Sem mudança de banco. Sem mexer em `sendBulkMessages`, `handleInboundMessage` ou no fluxo de mídia (planos futuros).
- Comando de teste: `npm test` (roda `vitest run`). Typecheck: `npx tsc --noEmit`. Lint: `npm run lint`.
- Texto único para o estado desconectado, usado na faixa da UI e no erro do servidor: **"WhatsApp desconectado. Conecte para enviar mensagens."**

---

## File Structure

- `src/modules/whatsapp/service.ts` — modificar `logMessage`: novo tipo de retorno + 2 guards. Adicionar e exportar o tipo `LogMessageResult`.
- `src/modules/whatsapp/service.test.ts` — novos testes para os guards; ajustar nada nos testes existentes (eles continuam passando — ver Task 1, Step 1).
- `src/app/(app)/whatsapp/actions.ts` — `logMessageAction` repassa `LogMessageResult` em vez do `Message`.
- `src/components/whatsapp/whatsapp-client.tsx` — `handleSend` trata `{ ok: false }`; campo e botões desabilitados quando desconectado; faixa de aviso; `getWhatsappConnectionAction` entra no `setInterval` de 5s que já existe.

Nenhum arquivo novo.

---

### Task 1: Guards de conexão e falha de envio em `logMessage`

**Files:**
- Modify: `src/modules/whatsapp/service.ts` (função `logMessage`, linhas ~27-45)
- Test: `src/modules/whatsapp/service.test.ts` (bloco `describe("whatsapp service")`, após a linha ~65)

**Interfaces:**
- Consumes: `WhatsappRepository.getConnection(accountId) => Promise<WhatsappConnection | null>` (já existe); `WhatsappConnection.status: "disconnected" | "connecting" | "connected"`; `WhatsappProvider.sendMessage(accountId, toPhone, body) => Promise<{ providerMessageId: string }>` (já existe, pode lançar).
- Produces:
  - `export type LogMessageResult = { ok: true; message: Message } | { ok: false; error: string }`
  - `logMessage(repo, provider, accountId, conversationId, rawInput): Promise<LogMessageResult>` — antes era `Promise<Message>`. Continua lançando `Error("Conversa não encontrada")` quando a conversa não existe (isso **não** vira `{ ok: false }`).
  - Regra do guard de status: bloqueia somente quando **existe** linha de conexão para a conta **e** `connection.status !== "connected"`. Sem linha de conexão (cenário de teste/fake) → não bloqueia.

- [ ] **Step 1: Ler os testes existentes de `logMessage` e confirmar que não quebram**

Abrir `src/modules/whatsapp/service.test.ts`. Os três testes existentes que chamam `logMessage` (linhas ~22-64) usam `createInMemoryWhatsappRepository()` **sem** criar linha de conexão. Pela regra do guard (bloqueia só quando existe conexão e não está `connected`), eles continuam passando sem alteração:
- "rejects logging a message on a conversation that doesn't exist" → continua lançando `"Conversa não encontrada"` (o guard de status roda depois da checagem de conversa).
- "updates the conversation preview when a message is logged" → sem conexão, não bloqueia, insere normalmente.
- "calls the provider to send an outbound message before logging it" → idem.

Não alterar esses testes.

- [ ] **Step 2: Escrever os testes que falham**

Adicionar ao final do bloco `describe("whatsapp service", () => { ... })` em `src/modules/whatsapp/service.test.ts`:

```ts
it("blocks an outbound message when the connection exists but is not connected", async () => {
  const repo = createInMemoryWhatsappRepository();
  const provider = createFakeWhatsappProvider(repo);
  await repo.upsertConnectionStatus("acc-1", "disconnected", null);
  const conversation = await startConversation(repo, "acc-1", {
    contactId: null,
    contactName: "Carla Souza",
    contactPhone: "51991234477",
  });
  const sendSpy = vi.spyOn(provider, "sendMessage");

  const result = await logMessage(repo, provider, "acc-1", conversation.id, {
    direction: "outbound",
    body: "Confirmado!",
  });

  expect(result).toEqual({
    ok: false,
    error: "WhatsApp desconectado. Conecte para enviar mensagens.",
  });
  expect(sendSpy).not.toHaveBeenCalled();
  const messages = await getConversationMessages(repo, "acc-1", conversation.id);
  expect(messages).toHaveLength(0);
});

it("allows an outbound message when the connection is connected", async () => {
  const repo = createInMemoryWhatsappRepository();
  const provider = createFakeWhatsappProvider(repo);
  await repo.upsertConnectionStatus("acc-1", "connected", new Date().toISOString());
  const conversation = await startConversation(repo, "acc-1", {
    contactId: null,
    contactName: "Carla Souza",
    contactPhone: "51991234477",
  });

  const result = await logMessage(repo, provider, "acc-1", conversation.id, {
    direction: "outbound",
    body: "Confirmado!",
  });

  expect(result.ok).toBe(true);
  const messages = await getConversationMessages(repo, "acc-1", conversation.id);
  expect(messages).toHaveLength(1);
});

it("returns the provider send failure as data instead of throwing", async () => {
  const repo = createInMemoryWhatsappRepository();
  const provider = createFakeWhatsappProvider(repo);
  await repo.upsertConnectionStatus("acc-1", "connected", new Date().toISOString());
  const conversation = await startConversation(repo, "acc-1", {
    contactId: null,
    contactName: "Carla Souza",
    contactPhone: "51991234477",
  });
  vi.spyOn(provider, "sendMessage").mockRejectedValue(new Error("Falha ao enviar mensagem pela Uazapi"));

  const result = await logMessage(repo, provider, "acc-1", conversation.id, {
    direction: "outbound",
    body: "Confirmado!",
  });

  expect(result).toEqual({ ok: false, error: "Falha ao enviar mensagem pela Uazapi" });
  const messages = await getConversationMessages(repo, "acc-1", conversation.id);
  expect(messages).toHaveLength(0);
});

it("still returns a success result shape on the happy path", async () => {
  const repo = createInMemoryWhatsappRepository();
  const provider = createFakeWhatsappProvider(repo);
  const conversation = await startConversation(repo, "acc-1", {
    contactId: null,
    contactName: "Carla Souza",
    contactPhone: "51991234477",
  });

  const result = await logMessage(repo, provider, "acc-1", conversation.id, {
    direction: "outbound",
    body: "Oi",
  });

  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.message.body).toBe("Oi");
    expect(result.message.direction).toBe("outbound");
  }
});
```

- [ ] **Step 3: Rodar os testes novos e confirmar que falham**

Run: `npx vitest run src/modules/whatsapp/service.test.ts -t "blocks an outbound message when the connection exists"`
Expected: FAIL — hoje `logMessage` insere a mensagem e retorna um `Message` (sem `ok`), então `result` não bate com `{ ok: false, ... }`.

- [ ] **Step 4: Implementar os guards em `logMessage`**

Em `src/modules/whatsapp/service.ts`, adicionar o tipo exportado logo após os imports (perto do topo do arquivo):

```ts
export type LogMessageResult =
  | { ok: true; message: import("./types").Message }
  | { ok: false; error: string };
```

> Se já houver um import de `Message` de `./types` no arquivo, use `{ ok: true; message: Message }` e não repita o `import(...)` inline. Hoje o arquivo importa `WhatsappConnection` de `./types` (linha 4) — adicione `Message` a esse import e use a forma curta.

Substituir a função `logMessage` inteira (atualmente linhas ~27-45):

```ts
const DISCONNECTED_ERROR = "WhatsApp desconectado. Conecte para enviar mensagens.";

export async function logMessage(
  repo: WhatsappRepository,
  provider: WhatsappProvider,
  accountId: string,
  conversationId: string,
  rawInput: unknown,
): Promise<LogMessageResult> {
  const input = parseOrThrow(logMessageInputSchema, rawInput);
  const conversation = await repo.getConversation(accountId, conversationId);
  if (!conversation) throw new Error("Conversa não encontrada");

  if (input.direction === "outbound") {
    const connection = await repo.getConnection(accountId);
    if (connection && connection.status !== "connected") {
      return { ok: false, error: DISCONNECTED_ERROR };
    }
    try {
      await provider.sendMessage(accountId, conversation.contactPhone, input.body);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Falha ao enviar mensagem" };
    }
  }

  const message = await repo.insertMessage(accountId, conversationId, input);
  await repo.touchConversation(accountId, conversationId, input.body, message.sentAt);
  return { ok: true, message };
}
```

- [ ] **Step 5: Rodar toda a suíte do módulo e confirmar verde**

Run: `npx vitest run src/modules/whatsapp/`
Expected: PASS — os 4 testes novos passam e os 3 testes existentes de `logMessage` continuam passando (sem linha de conexão → não bloqueiam).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: FALHA esperada e única em `src/app/(app)/whatsapp/actions.ts` (`logMessageAction` ainda trata o retorno como `Message`). Nenhum outro erro. Essa falha é resolvida na Task 2. Se aparecer erro em qualquer outro arquivo, pare e investigue antes de commitar.

- [ ] **Step 7: Commit**

```bash
git add src/modules/whatsapp/service.ts src/modules/whatsapp/service.test.ts
git commit -m "$(cat <<'EOF'
feat(whatsapp): logMessage bloqueia envio desconectado e retorna erro como dado

logMessage passa a devolver { ok: true; message } | { ok: false; error }.
Guards para outbound: status de conexão persistido != connected, e try/catch
no provider.sendMessage. Conversa inexistente continua lançando.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012PwSVih6ksQx4hjTZRSPxN
EOF
)"
```

---

### Task 2: `logMessageAction` repassa o resultado e a UI reage à conexão

**Files:**
- Modify: `src/app/(app)/whatsapp/actions.ts` (`logMessageAction`, linhas ~36-43)
- Modify: `src/components/whatsapp/whatsapp-client.tsx` (`handleSend` ~286-303; `setInterval` de conversas ~277-284; JSX do compositor ~426-439)

**Interfaces:**
- Consumes: `LogMessageResult` de `src/modules/whatsapp/service.ts` (Task 1); `getWhatsappConnectionAction() => Promise<{ provider, status, isConfigured } | null>` (já existe em `actions.ts`); `connection?.status` no client já é o status persistido.
- Produces: `logMessageAction(conversationId, input): Promise<LogMessageResult>` — antes `Promise<Message>`.

- [ ] **Step 1: Ajustar `logMessageAction` para repassar a união**

Em `src/app/(app)/whatsapp/actions.ts`, substituir o corpo de `logMessageAction`:

```ts
export async function logMessageAction(conversationId: string, input: unknown) {
  const { repo, accountId } = await getRepoAndAccount();
  const connection = await repo.getConnection(accountId);
  const provider = getWhatsappProvider(connection?.provider ?? "fake", repo);
  const result = await whatsapp.logMessage(repo, provider, accountId, conversationId, input);
  if (result.ok) revalidatePath("/whatsapp");
  return result;
}
```

(Só revalida quando de fato gravou. `result` é serializável — union de objetos planos.)

- [ ] **Step 2: Rodar typecheck e confirmar que o erro da Task 1 sumiu**

Run: `npx tsc --noEmit`
Expected: PASS. O único erro pendente (o de `actions.ts`) foi resolvido. Se `whatsapp-client.tsx` acusar erro de tipo no uso de `logMessageAction`, é esperado — resolvido no Step 3.

- [ ] **Step 3: `handleSend` trata `{ ok: false }` na UI**

Em `src/components/whatsapp/whatsapp-client.tsx`, substituir o corpo de `handleSend`:

```ts
async function handleSend() {
  if (!selectedConversationId || !draft.trim() || sending) return;
  setSending(true);
  setSendError(null);
  try {
    const result = await logMessageAction(selectedConversationId, {
      direction: "outbound",
      body: draft.trim(),
    });
    if (!result.ok) {
      setSendError(result.error);
      return;
    }
    setDraft("");
    const updated = await getConversationMessagesAction(selectedConversationId);
    setMessages(updated);
  } catch (err) {
    setSendError(err instanceof Error ? err.message : "Erro ao enviar mensagem");
  } finally {
    setSending(false);
  }
}
```

- [ ] **Step 4: Atualizar o status da conexão no polling de 5s**

Ainda em `whatsapp-client.tsx`, no `useEffect` que hoje só recarrega conversas (o do `setInterval` de 5s que chama `listConversationsAction`), acrescentar a busca do status da conexão:

```ts
useEffect(() => {
  const interval = setInterval(() => {
    listConversationsAction()
      .then(setConversations)
      .catch(() => {});
    getWhatsappConnectionAction()
      .then(setConnection)
      .catch(() => {});
  }, 5000);
  return () => clearInterval(interval);
}, []);
```

(`getWhatsappConnectionAction` só lê a linha do banco — barato. Não chama a API da Uazapi.)

- [ ] **Step 5: Desabilitar o compositor e mostrar a faixa quando desconectado**

Ainda em `whatsapp-client.tsx`, dentro do componente `WhatsappClient`, adicionar perto de `selectedConversation`:

```ts
const isConnected = connection?.status === "connected";
```

No JSX do compositor (o bloco `<div className="flex items-center gap-2 border-t p-3">` e o que vem antes dele), trocar por:

```tsx
{!isConnected && (
  <p className="px-3 pt-2 text-sm text-amber-700">
    WhatsApp desconectado. Conecte para enviar mensagens.
  </p>
)}
{sendError && <p className="px-3 text-sm text-red-600">{sendError}</p>}
<div className="flex items-center gap-2 border-t p-3">
  <Input
    value={draft}
    onChange={(e) => setDraft(e.target.value)}
    onKeyDown={(e) => {
      if (e.key === "Enter") handleSend();
    }}
    placeholder="Digite uma mensagem"
    disabled={sending || !isConnected}
  />
  <Button onClick={handleSend} disabled={sending || !draft.trim() || !isConnected}>
    Enviar
  </Button>
</div>
```

(A linha `{sendError && ...}` já existe hoje logo antes do `<div ...border-t p-3>` — mantê-la, só garantir que a faixa de desconectado fique acima dela.)

- [ ] **Step 6: Typecheck + lint + testes**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: PASS em tudo. Nenhum teste novo aqui (é UI/action fina); a cobertura de comportamento está na Task 1.

- [ ] **Step 7: Verificação manual rápida**

Run: `npm run dev`, abrir `/whatsapp`.
Conferir:
1. Com a conexão desconectada (badge "Desconectado"): a faixa "WhatsApp desconectado. Conecte para enviar mensagens." aparece acima do compositor, o campo e o botão "Enviar" ficam desabilitados.
2. Conectando o WhatsApp (badge "Conectado"): a faixa some, campo e botão reativam.
3. Enviar uma mensagem numa conta cuja instância Uazapi está configurada mas o celular caiu: a mensagem **não** entra na lista e aparece o texto de erro do provider em vermelho — sem tela de erro do Next.js.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/whatsapp/actions.ts" src/components/whatsapp/whatsapp-client.tsx
git commit -m "$(cat <<'EOF'
feat(whatsapp): UI bloqueia envio e mostra falha quando desconectado

logMessageAction repassa o LogMessageResult; handleSend mostra o erro em vez
de engolir. Compositor desabilitado + faixa de aviso quando a conexão não
está ativa; status da conexão entra no polling de 5s.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012PwSVih6ksQx4hjTZRSPxN
EOF
)"
```

---

## Self-Review

**1. Spec coverage** (seção "Item 3" da spec):
- "campo de mensagem e botão Enviar desabilitados quando `status !== connected` + faixa" → Task 2, Steps 5.
- "vale para o anexo de mídia" → anexo de mídia não existe ainda (Plano 2); quando existir, herda o mesmo `disabled={... || !isConnected}`. Nada a fazer neste plano.
- "`service.logMessage` verifica status antes de enviar; retorna `{ error }`, não lança" → Task 1, Step 4.
- "`logMessageAction` propaga o `{ error }`" → Task 2, Step 1.
- "Fora de escopo: fila de mensagens" → respeitado, não implementado.
- "Banco: nenhuma mudança" → respeitado.
- Testes da spec: "status `disconnected` retorna `{ error }` e não chama `sendMessage`" → Task 1 Step 2 (teste 1). "status `connected` segue o fluxo" → Task 1 Step 2 (teste 2).

**2. Placeholder scan:** sem TBD/TODO. Todos os steps de código têm bloco de código concreto. Textos de erro/faixa são literais e idênticos entre server e UI.

**3. Type consistency:** `LogMessageResult` definido na Task 1 (`{ ok: true; message: Message } | { ok: false; error: string }`), consumido com o mesmo nome e forma na Task 2 (`result.ok`, `result.error`, `result.message`). `logMessageAction` passa a retornar `LogMessageResult` (Task 2 Interfaces) e é isso que `handleSend` consome (Task 2 Step 3). `getWhatsappConnectionAction` já existe e já é importado no client (linha 30). Sem divergência de nomes.

## Execução

Depois deste plano, os Planos 2 (mídia) e 3 (histórico) só podem ser escritos após a etapa de **validação ao vivo dos payloads da Uazapi** descrita na spec.
