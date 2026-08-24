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

  it("counts contacts created on or after the given date, scoped to the account", async () => {
    const repo = createInMemoryCrmRepository();
    await repo.insertContact("acc-1", { name: "Ana", phone: "11999990000" });
    await repo.insertContact("acc-1", { name: "Beatriz", phone: "11988887777" });
    await repo.insertContact("acc-2", { name: "Carla", phone: "11977776666" });

    const futureCount = await repo.countNewContacts("acc-1", "2999-01-01T00:00:00.000Z");
    expect(futureCount).toBe(0);

    const pastCount = await repo.countNewContacts("acc-1", "2000-01-01T00:00:00.000Z");
    expect(pastCount).toBe(2);
  });

  it("counts contacts within a bounded [sinceIso, untilIso) window when untilIso is given", async () => {
    const repo = createInMemoryCrmRepository();
    await repo.insertContact("acc-1", { name: "Ana", phone: "11999990000" });
    await repo.insertContact("acc-1", { name: "Beatriz", phone: "11988887777" });

    const all = await repo.countNewContacts("acc-1", "2000-01-01T00:00:00.000Z");
    expect(all).toBe(2);

    const noneInPast = await repo.countNewContacts(
      "acc-1",
      "2000-01-01T00:00:00.000Z",
      "2000-01-02T00:00:00.000Z",
    );
    expect(noneInPast).toBe(0);

    const bothInWideWindow = await repo.countNewContacts(
      "acc-1",
      "2000-01-01T00:00:00.000Z",
      "2999-01-01T00:00:00.000Z",
    );
    expect(bothInWideWindow).toBe(2);
  });

  it("finds a contact by exact phone match, scoped to the account", async () => {
    const repo = createInMemoryCrmRepository();
    await repo.insertContact("acc-1", { name: "Ana", phone: "11999990000" });

    const found = await repo.findContactByPhone("acc-1", "11999990000");
    expect(found?.name).toBe("Ana");

    const notFound = await repo.findContactByPhone("acc-1", "00000000000");
    expect(notFound).toBeNull();

    const wrongAccount = await repo.findContactByPhone("acc-2", "11999990000");
    expect(wrongAccount).toBeNull();
  });

  // Supabase's .maybeSingle() throws on duplicate phone numbers (no unique
  // constraint on contacts.phone), so the Supabase repo orders by created_at
  // ascending and takes the first row. This test pins the in-memory repo's
  // existing .find() behavior (first in insertion order) so both repos agree
  // on which row wins when phones collide. The Supabase repo itself can't be
  // tested here (no live DB in this environment).
  it("returns the first-inserted contact when multiple share a phone", async () => {
    const repo = createInMemoryCrmRepository();
    const first = await repo.insertContact("acc-1", { name: "Ana", phone: "11999990000" });
    await repo.insertContact("acc-1", { name: "Ana Duplicada", phone: "11999990000" });

    const found = await repo.findContactByPhone("acc-1", "11999990000");
    expect(found?.id).toBe(first.id);
  });

  it("persists the new patient fields on insert and defaults them to null when omitted", async () => {
    const repo = createInMemoryCrmRepository();

    const withFields = await repo.insertContact("acc-1", {
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
    expect(withFields.email).toBe("ana@example.com");
    expect(withFields.birthDate).toBe("1990-05-10");
    expect(withFields.cpf).toBe("12345678900");
    expect(withFields.sex).toBe("F");
    expect(withFields.guardianName).toBe("Maria");
    expect(withFields.guardianPhone).toBe("11988887777");
    expect(withFields.guardianRelationship).toBe("mãe");

    const withoutFields = await repo.insertContact("acc-1", { name: "Beatriz", phone: "11988887777" });
    expect(withoutFields.email).toBeNull();
    expect(withoutFields.birthDate).toBeNull();
    expect(withoutFields.cpf).toBeNull();
    expect(withoutFields.sex).toBeNull();
    expect(withoutFields.guardianName).toBeNull();
    expect(withoutFields.guardianPhone).toBeNull();
    expect(withoutFields.guardianRelationship).toBeNull();
  });

  it("updates the new patient fields, including clearing them with null", async () => {
    const repo = createInMemoryCrmRepository();
    const contact = await repo.insertContact("acc-1", {
      name: "Ana",
      phone: "11999990000",
      email: "ana@example.com",
    });

    const updated = await repo.updateContact("acc-1", contact.id, {
      email: "nova@example.com",
      sex: "F",
    });
    expect(updated.email).toBe("nova@example.com");
    expect(updated.sex).toBe("F");

    const cleared = await repo.updateContact("acc-1", contact.id, { email: null });
    expect(cleared.email).toBeNull();
  });

  it("listContacts returns all contacts for the account, sorted by name", async () => {
    const repo = createInMemoryCrmRepository();
    await repo.insertContact("acc-1", { name: "Carla", phone: "11977776666" });
    await repo.insertContact("acc-1", { name: "Ana", phone: "11999990000" });
    await repo.insertContact("acc-2", { name: "Zeca", phone: "11955554444" });

    const result = await repo.listContacts("acc-1");
    expect(result.map((c) => c.name)).toEqual(["Ana", "Carla"]);
  });
});
