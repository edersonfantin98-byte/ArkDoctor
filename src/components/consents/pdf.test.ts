import { describe, it, expect } from "vitest";
import { wrapLine, layoutParagraphs, paginate } from "./pdf";

// medida fake: 1 unidade por caractere
const measure = (s: string) => s.length;

describe("wrapLine", () => {
  it("wraps on word boundaries at maxWidth", () => {
    expect(wrapLine("aaa bbb ccc", 7, measure)).toEqual(["aaa bbb", "ccc"]);
  });

  it("keeps a single over-long word on its own line", () => {
    expect(wrapLine("supercalifragilistic word", 5, measure)).toEqual([
      "supercalifragilistic",
      "word",
    ]);
  });

  it("returns a single blank line for empty input", () => {
    expect(wrapLine("", 5, measure)).toEqual([""]);
  });
});

describe("layoutParagraphs", () => {
  it("flattens paragraphs with a blank separator between them", () => {
    expect(layoutParagraphs(["ab cd", "ef"], 5, measure)).toEqual(["ab cd", "", "ef"]);
  });
});

describe("paginate", () => {
  it("chunks lines into pages", () => {
    expect(paginate(["a", "b", "c", "d", "e"], 2)).toEqual([["a", "b"], ["c", "d"], ["e"]]);
  });
});
