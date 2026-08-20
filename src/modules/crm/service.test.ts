import { describe, it, expect } from "vitest";
import { createInMemoryCrmRepository } from "./repository.memory";
import { createContact, searchContacts, updateContact } from "./service";

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

describe("searchContacts", () => {
  it("matches by partial name and by phone", async () => {
    const repo = createInMemoryCrmRepository();
    await createContact(repo, "acc-1", { name: "Ana Silva", phone: "11999990000" });
    await createContact(repo, "acc-1", { name: "Beatriz", phone: "11988887777" });

    expect(await searchContacts(repo, "acc-1", "ana")).toHaveLength(1);
    expect(await searchContacts(repo, "acc-1", "11988887777")).toHaveLength(1);
    expect(await searchContacts(repo, "acc-1", "carla")).toHaveLength(0);
  });
});

describe("updateContact", () => {
  it("updates the provided fields only", async () => {
    const repo = createInMemoryCrmRepository();
    const contact = await createContact(repo, "acc-1", { name: "Ana", phone: "11999990000" });

    const updated = await updateContact(repo, "acc-1", contact.id, { notes: "Prefere manhã" });

    expect(updated.name).toBe("Ana");
    expect(updated.notes).toBe("Prefere manhã");
  });
});
