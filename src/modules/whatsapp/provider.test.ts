import { describe, it, expect } from "vitest";
import { createInMemoryWhatsappRepository } from "./repository.memory";
import { createFakeWhatsappProvider } from "./provider.fake";
import { getWhatsappProvider } from "./provider";

describe("fake whatsapp provider", () => {
  it("reflects connected/disconnected status after connect/disconnect", async () => {
    const repo = createInMemoryWhatsappRepository();
    const provider = createFakeWhatsappProvider(repo);

    expect(await provider.getConnectionStatus("acc-1")).toBe("disconnected");

    await provider.connect("acc-1");
    expect(await provider.getConnectionStatus("acc-1")).toBe("connected");

    await provider.disconnect("acc-1");
    expect(await provider.getConnectionStatus("acc-1")).toBe("disconnected");
  });

  it("returns a providerMessageId when sending", async () => {
    const repo = createInMemoryWhatsappRepository();
    const provider = createFakeWhatsappProvider(repo);

    const result = await provider.sendMessage("acc-1", "51991234477", "Olá!");
    expect(result.providerMessageId).toBeTruthy();
  });
});

describe("getWhatsappProvider", () => {
  it("resolves the fake provider by name", async () => {
    const repo = createInMemoryWhatsappRepository();
    const provider = getWhatsappProvider("fake", repo);
    expect(await provider.getConnectionStatus("acc-1")).toBe("disconnected");
  });

  it("throws for an unknown provider name", () => {
    const repo = createInMemoryWhatsappRepository();
    expect(() => getWhatsappProvider("unknown", repo)).toThrow();
  });
});
