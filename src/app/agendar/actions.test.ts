import { describe, expect, it } from "vitest";
import { normalizePhone } from "./actions";

describe("normalizePhone", () => {
  it("strips formatting characters", () => {
    expect(normalizePhone("(11) 99999-8888")).toBe("5511999998888");
  });

  it("prepends the Brazil country code to a local mobile number (11 digits)", () => {
    expect(normalizePhone("11999998888")).toBe("5511999998888");
  });

  it("prepends the Brazil country code to a local landline number (10 digits)", () => {
    expect(normalizePhone("1199998888")).toBe("551199998888");
  });

  it("leaves an already-prefixed number unchanged", () => {
    expect(normalizePhone("5511999998888")).toBe("5511999998888");
  });
});
