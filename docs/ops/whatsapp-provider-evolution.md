# Religar a Evolution API

A Evolution foi desativada em 2026-08-27. O sistema usa apenas a Uazapi (exibida
como "WhatsApp" na interface). O código da Evolution continua no repositório,
apenas desligado da fiação:

- `src/modules/whatsapp/provider.evolution.ts` — implementação (intacta)
- `src/modules/whatsapp/provider.evolution.test.ts` — testes (continuam passando)
- `src/modules/whatsapp/service.ts` — `parseWebhookPayload` ainda aceita o
  envelope `messages.upsert` da Evolution

Para reativar, desfazer os 3 pontos de fiação abaixo.

## 1. `src/modules/whatsapp/provider.ts`

```ts
import { createEvolutionProvider } from "./provider.evolution";
// ...
if (providerName === "evolution") return createEvolutionProvider(repo);
```

## 2. `src/app/(app)/whatsapp/actions.ts`

```ts
import { createEvolutionProvider } from "@/modules/whatsapp/provider.evolution";

export async function saveEvolutionConfigAction(baseUrl: string, instanceName: string, apiKey: string) {
  const { repo, accountId } = await getRepoAndAccount();
  const existing = await repo.getConnection(accountId);
  const webhookSecret = existing?.config?.webhookSecret ?? crypto.randomUUID();
  await repo.updateConnectionConfig(accountId, "evolution", {
    baseUrl,
    instanceName,
    apiKey,
    webhookSecret,
  });
  await repo.upsertConnectionStatus(accountId, "disconnected", null);
  await repo.updateConnectionQrCode(accountId, null);
  revalidatePath("/whatsapp");
}

export async function getEvolutionQrCodeAction() {
  const { repo, accountId } = await getRepoAndAccount();
  const provider = createEvolutionProvider(repo);
  return provider.getQrCode(accountId);
}
```

## 3. `src/components/whatsapp/whatsapp-client.tsx`

- Reimportar `saveEvolutionConfigAction` e `getEvolutionQrCodeAction`.
- Restaurar o componente `EvolutionConfigDialog` (ver histórico do git: commit que
  criou este arquivo) e renderizá-lo ao lado de `<UazapiConfigDialog />`.
- Em `refreshConnection`, voltar o ramo:

  ```ts
  } else if (status === "connecting" && conn?.provider === "evolution") {
    setQrCode(await getEvolutionQrCodeAction());
  }
  ```

- Em `isRealProvider`, voltar `|| connection?.provider === "evolution"`.

O diff completo da desativação está no histórico do git — `git log -p --
src/components/whatsapp/whatsapp-client.tsx` mostra o `EvolutionConfigDialog`
original para copiar de volta.
