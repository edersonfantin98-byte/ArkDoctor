import { describe, it, expect } from "vitest";
import { buildContactInput, type ContactFormFields } from "./build-contact-input";

const emptyFields: ContactFormFields = {
  name: "Ana",
  phone: "11999990000",
  email: "",
  birthDate: "",
  cpf: "",
  sex: "",
  guardianName: "",
  guardianPhone: "",
  guardianRelationship: "",
  notes: "",
};

describe("buildContactInput", () => {
  it("sends null for emptied optional fields when editing", () => {
    const input = buildContactInput(emptyFields, true);

    expect(input).toMatchObject({
      name: "Ana",
      phone: "11999990000",
      email: null,
      birthDate: null,
      cpf: null,
      sex: null,
      guardianName: null,
      guardianPhone: null,
      guardianRelationship: null,
      notes: null,
    });
  });

  it("sends undefined for empty optional fields when creating", () => {
    const input = buildContactInput(emptyFields, false);

    expect(input).toMatchObject({
      name: "Ana",
      phone: "11999990000",
      email: undefined,
      birthDate: undefined,
      cpf: undefined,
      sex: undefined,
      guardianName: undefined,
      guardianPhone: undefined,
      guardianRelationship: undefined,
      notes: undefined,
    });
  });

  it("passes through a filled field unchanged in both modes", () => {
    const filled: ContactFormFields = {
      ...emptyFields,
      email: "ana@example.com",
      sex: "F",
    };

    expect(buildContactInput(filled, true)).toMatchObject({
      email: "ana@example.com",
      sex: "F",
    });
    expect(buildContactInput(filled, false)).toMatchObject({
      email: "ana@example.com",
      sex: "F",
    });
  });
});
