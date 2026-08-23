import type { WhatsappRepository } from "./repository";
import type { ConnectionStatus } from "./types";
import { createFakeWhatsappProvider } from "./provider.fake";
import { createUazapiProvider } from "./provider.uazapi";
import { createEvolutionProvider } from "./provider.evolution";

export interface WhatsappProvider {
  connect(accountId: string): Promise<void>;
  disconnect(accountId: string): Promise<void>;
  getConnectionStatus(accountId: string): Promise<ConnectionStatus>;
  sendMessage(
    accountId: string,
    toPhone: string,
    body: string,
  ): Promise<{ providerMessageId: string }>;
}

export function getWhatsappProvider(
  providerName: string,
  repo: WhatsappRepository,
): WhatsappProvider {
  if (providerName === "fake") return createFakeWhatsappProvider(repo);
  if (providerName === "uazapi") return createUazapiProvider(repo);
  if (providerName === "evolution") return createEvolutionProvider(repo);
  throw new Error(`Provedor de WhatsApp desconhecido: ${providerName}`);
}
