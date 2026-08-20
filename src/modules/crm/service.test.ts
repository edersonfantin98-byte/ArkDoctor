import { describe, it, expect } from "vitest";
import { createInMemoryCrmRepository } from "./repository.memory";
import { createContact } from "./service";

describe("createContact", () => {
  it("creates a contact and an initial deal in the first stage", async () => {
    const repo = createInMemoryCrmRepository();

    const contact = await createContact(repo, "acc-1", {
      name: "Ana",
      phone: "11999990000",
    });

    expect(contact.name).toBe("Ana");

    const stages = await repo.getStages("acc-1");
    const dealsByStage = await repo.getDealsWithContactsByStage("acc-1");
    const firstStageDeals = dealsByStage.get(stages[0].id) ?? [];

    expect(firstStageDeals).toHaveLength(1);
    expect(firstStageDeals[0].contact.id).toBe(contact.id);
  });

  it("rejects a contact with an empty name", async () => {
    const repo = createInMemoryCrmRepository();

    await expect(
      createContact(repo, "acc-1", { name: "", phone: "11999990000" }),
    ).rejects.toThrow();
  });
});
