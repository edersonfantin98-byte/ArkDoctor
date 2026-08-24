import { describe, it, expect } from "vitest";
import { createInMemoryCrmRepository } from "./repository.memory";
import {
  countNewContacts,
  createContact,
  createStage,
  deleteStage,
  findContactByPhone,
  getOpenDealForContact,
  getStages,
  listPipeline,
  moveDeal,
  renameStage,
  reorderStages,
  reopenDeal,
  searchContacts,
  updateContact,
} from "./service";

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

  it("accepts the optional patient fields and passes them through to the repository", async () => {
    const repo = createInMemoryCrmRepository();

    const contact = await createContact(repo, "acc-1", {
      name: "Ana",
      phone: "11999990000",
      email: "ana@example.com",
      birthDate: "1990-05-10",
      cpf: "12345678900",
      sex: "F",
      guardianName: "Maria",
      guardianPhone: "11988887777",
      guardianRelationship: "mãe",
    });

    expect(contact.email).toBe("ana@example.com");
    expect(contact.sex).toBe("F");
    expect(contact.guardianRelationship).toBe("mãe");
  });

  it("rejects an invalid sex value", async () => {
    const repo = createInMemoryCrmRepository();
    await expect(
      createContact(repo, "acc-1", { name: "Ana", phone: "11999990000", sex: "X" }),
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

describe("listPipeline", () => {
  it("returns every stage in position order, each with its deals", async () => {
    const repo = createInMemoryCrmRepository();
    await createContact(repo, "acc-1", { name: "Ana", phone: "11999990000" });

    const pipeline = await listPipeline(repo, "acc-1");

    expect(pipeline).toHaveLength(6);
    expect(pipeline[0].stage.name).toBe("Novo Lead");
    expect(pipeline[0].deals).toHaveLength(1);
    expect(pipeline[1].deals).toHaveLength(0);
  });
});

describe("moveDeal", () => {
  async function setup() {
    const repo = createInMemoryCrmRepository();
    const contact = await createContact(repo, "acc-1", { name: "Ana", phone: "11999990000" });
    const stages = await repo.getStages("acc-1");
    const dealsByStage = await repo.getDealsWithContactsByStage("acc-1");
    const deal = (dealsByStage.get(stages[0].id) ?? [])[0];
    return { repo, contact, stages, deal };
  }

  it("moves a deal to a new stage and records history", async () => {
    const { repo, stages, deal } = await setup();

    const moved = await moveDeal(repo, "acc-1", deal.id, stages[1].id);

    expect(moved.stageId).toBe(stages[1].id);
    const history = await repo.getDealHistory(deal.id);
    expect(history).toHaveLength(2); // initial creation + this move
    expect(history[1].fromStageId).toBe(stages[0].id);
    expect(history[1].toStageId).toBe(stages[1].id);
  });

  it("is a no-op when moving to the same stage", async () => {
    const { repo, stages, deal } = await setup();

    await moveDeal(repo, "acc-1", deal.id, stages[0].id);

    const history = await repo.getDealHistory(deal.id);
    expect(history).toHaveLength(1); // only the initial creation entry
  });

  it("sets closedAt when the deal enters the lost stage", async () => {
    const { repo, stages, deal } = await setup();
    const lostStage = stages.find((s) => s.kind === "lost")!;

    const moved = await moveDeal(repo, "acc-1", deal.id, lostStage.id);

    expect(moved.closedAt).not.toBeNull();
  });

  it("clears closedAt when the deal leaves the lost stage", async () => {
    const { repo, stages, deal } = await setup();
    const lostStage = stages.find((s) => s.kind === "lost")!;

    await moveDeal(repo, "acc-1", deal.id, lostStage.id);
    const reopened = await moveDeal(repo, "acc-1", deal.id, stages[0].id);

    expect(reopened.closedAt).toBeNull();
  });
});

describe("createStage", () => {
  it("appends a new normal stage after the last normal stage, before Follow-up", async () => {
    const repo = createInMemoryCrmRepository();

    const stage = await createStage(repo, "acc-1", "Retorno de Orçamento");

    const stages = await repo.getStages("acc-1");
    const followUpIndex = stages.findIndex((s) => s.kind === "follow_up");
    const newStageIndex = stages.findIndex((s) => s.id === stage.id);

    expect(newStageIndex).toBeLessThan(followUpIndex);
  });

  it("keeps two consecutively created stages before Follow-up regardless of position collisions", async () => {
    const repo = createInMemoryCrmRepository();

    const stage1 = await createStage(repo, "acc-1", "Retorno de Orçamento");
    const stage2 = await createStage(repo, "acc-1", "Reagendamento");

    const stages = await repo.getStages("acc-1");
    const followUpIndex = stages.findIndex((s) => s.kind === "follow_up");
    const stage1Index = stages.findIndex((s) => s.id === stage1.id);
    const stage2Index = stages.findIndex((s) => s.id === stage2.id);

    expect(stage1Index).toBeLessThan(followUpIndex);
    expect(stage2Index).toBeLessThan(followUpIndex);
  });
});

describe("renameStage", () => {
  it("renames any stage, including special kinds", async () => {
    const repo = createInMemoryCrmRepository();
    const stages = await repo.getStages("acc-1");
    const lostStage = stages.find((s) => s.kind === "lost")!;

    const renamed = await renameStage(repo, "acc-1", lostStage.id, "Sem Interesse");

    expect(renamed.name).toBe("Sem Interesse");
    expect(renamed.kind).toBe("lost");
  });
});

describe("reorderStages", () => {
  it("rejects a special-kind stage id in the reorder list", async () => {
    const repo = createInMemoryCrmRepository();
    const stages = await repo.getStages("acc-1");
    const lostStage = stages.find((s) => s.kind === "lost")!;

    await expect(reorderStages(repo, "acc-1", [lostStage.id])).rejects.toThrow();
  });
});

describe("deleteStage", () => {
  it("blocks deletion when the stage has an open deal", async () => {
    const repo = createInMemoryCrmRepository();
    await createContact(repo, "acc-1", { name: "Ana", phone: "11999990000" });
    const stages = await repo.getStages("acc-1");

    await expect(deleteStage(repo, "acc-1", stages[0].id)).rejects.toThrow();
  });

  it("allows deletion when the stage has no open deals", async () => {
    const repo = createInMemoryCrmRepository();
    const contact = await createContact(repo, "acc-1", { name: "Ana", phone: "11999990000" });
    const stages = await repo.getStages("acc-1");
    const dealsByStage = await repo.getDealsWithContactsByStage("acc-1");
    const deal = (dealsByStage.get(stages[0].id) ?? [])[0];
    await moveDeal(repo, "acc-1", deal.id, stages[1].id);

    await expect(deleteStage(repo, "acc-1", stages[0].id)).resolves.toBeUndefined();
  });
});

describe("reopenDeal", () => {
  it("creates a new deal for a contact with no open deal", async () => {
    const repo = createInMemoryCrmRepository();
    const contact = await createContact(repo, "acc-1", { name: "Ana", phone: "11999990000" });
    const stages = await repo.getStages("acc-1");
    const dealsByStage = await repo.getDealsWithContactsByStage("acc-1");
    const firstDeal = (dealsByStage.get(stages[0].id) ?? [])[0];
    await moveDeal(repo, "acc-1", firstDeal.id, stages.find((s) => s.kind === "lost")!.id);

    const newDeal = await reopenDeal(repo, "acc-1", contact.id);

    expect(newDeal.id).not.toBe(firstDeal.id);
    expect(newDeal.stageId).toBe(stages[0].id);

    const allDeals = await repo.getDealsForContact("acc-1", contact.id);
    expect(allDeals).toHaveLength(2);
  });

  it("rejects reopening when a deal is already open", async () => {
    const repo = createInMemoryCrmRepository();
    const contact = await createContact(repo, "acc-1", { name: "Ana", phone: "11999990000" });

    await expect(reopenDeal(repo, "acc-1", contact.id)).rejects.toThrow();
  });
});

describe("getStages", () => {
  it("returns the account's stages in position order", async () => {
    const repo = createInMemoryCrmRepository();
    const stages = await getStages(repo, "acc-1");
    expect(stages.map((s) => s.name)).toEqual([
      "Novo Lead",
      "Em Negociação",
      "Agendado",
      "Atendido",
      "Follow-up",
      "Perdido",
    ]);
  });
});

describe("countNewContacts", () => {
  it("counts contacts created on or after the given date", async () => {
    const repo = createInMemoryCrmRepository();
    await createContact(repo, "acc-1", { name: "Ana", phone: "11999990000" });

    expect(await countNewContacts(repo, "acc-1", "2000-01-01T00:00:00.000Z")).toBe(1);
    expect(await countNewContacts(repo, "acc-1", "2999-01-01T00:00:00.000Z")).toBe(0);
  });

  it("respects an optional upper bound", async () => {
    const repo = createInMemoryCrmRepository();
    await createContact(repo, "acc-1", { name: "Ana", phone: "11999990000" });

    expect(
      await countNewContacts(
        repo,
        "acc-1",
        "2000-01-01T00:00:00.000Z",
        "2000-01-02T00:00:00.000Z",
      ),
    ).toBe(0);
  });
});

describe("getOpenDealForContact", () => {
  it("returns the contact's open deal, or null if none", async () => {
    const repo = createInMemoryCrmRepository();
    const contact = await createContact(repo, "acc-1", { name: "Ana", phone: "11999990000" });

    const openDeal = await getOpenDealForContact(repo, "acc-1", contact.id);
    expect(openDeal).not.toBeNull();

    const noneForOtherContact = await getOpenDealForContact(repo, "acc-1", "no-such-contact");
    expect(noneForOtherContact).toBeNull();
  });
});

describe("findContactByPhone", () => {
  it("delegates to the repository", async () => {
    const repo = createInMemoryCrmRepository();
    await createContact(repo, "acc-1", { name: "Ana", phone: "11999990000" });

    const found = await findContactByPhone(repo, "acc-1", "11999990000");
    expect(found?.name).toBe("Ana");

    const notFound = await findContactByPhone(repo, "acc-1", "00000000000");
    expect(notFound).toBeNull();
  });
});

describe("updateContact patient fields", () => {
  it("updates and clears patient fields via null", async () => {
    const repo = createInMemoryCrmRepository();
    const contact = await createContact(repo, "acc-1", { name: "Ana", phone: "11999990000" });

    const updated = await updateContact(repo, "acc-1", contact.id, { cpf: "12345678900" });
    expect(updated.cpf).toBe("12345678900");

    const cleared = await updateContact(repo, "acc-1", contact.id, { cpf: null });
    expect(cleared.cpf).toBeNull();
  });
});
