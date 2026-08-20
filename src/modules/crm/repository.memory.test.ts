import { describe, it, expect } from "vitest";
import { createInMemoryCrmRepository } from "./repository.memory";

describe("createInMemoryCrmRepository", () => {
  it("seeds the 6 default stages for an account and returns them ordered by position", async () => {
    const repo = createInMemoryCrmRepository();
    const stages = await repo.getStages("acc-1");

    expect(stages.map((s) => s.name)).toEqual([
      "Novo Lead",
      "Em Negociação",
      "Agendado",
      "Atendido",
      "Follow-up",
      "Perdido",
    ]);
    expect(stages.map((s) => s.kind)).toEqual([
      "normal",
      "normal",
      "normal",
      "normal",
      "follow_up",
      "lost",
    ]);
  });

  it("inserts and retrieves a contact scoped to its account", async () => {
    const repo = createInMemoryCrmRepository();
    const contact = await repo.insertContact("acc-1", { name: "Ana", phone: "11999990000" });

    expect(contact.name).toBe("Ana");
    expect(contact.accountId).toBe("acc-1");

    const found = await repo.searchContacts("acc-1", "Ana");
    expect(found).toHaveLength(1);

    const foundOtherAccount = await repo.searchContacts("acc-2", "Ana");
    expect(foundOtherAccount).toHaveLength(0);
  });
});
