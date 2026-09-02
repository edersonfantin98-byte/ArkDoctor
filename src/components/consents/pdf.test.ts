import { describe, it, expect } from "vitest";
import { wrapLine, measureBlock, layoutBlocks, type Geom } from "./pdf";
import type { Block } from "@/modules/consents/templates";

const measure = (s: string) => s.length; // 1 unidade por caractere

const geom: Geom = { contentWidth: 40, bodySize: 1, lineHeight: 1, usableHeight: 10 };

describe("wrapLine", () => {
  it("quebra em limites de palavra no maxWidth", () => {
    expect(wrapLine("aaa bbb ccc", 7, measure)).toEqual(["aaa bbb", "ccc"]);
  });
  it("mantém palavra longa sozinha na linha", () => {
    expect(wrapLine("supercalifragilistic word", 5, measure)).toEqual(["supercalifragilistic", "word"]);
  });
  it("string vazia vira uma linha em branco", () => {
    expect(wrapLine("", 5, measure)).toEqual([""]);
  });
});

describe("measureBlock", () => {
  const g: Geom = { contentWidth: 100, bodySize: 10, lineHeight: 14, usableHeight: 700 };

  it("field com valor: 'Label: valor'", () => {
    const prims = measureBlock({ type: "field", label: "Nome", value: "Maria" }, g);
    expect(prims.some((p) => p.kind === "text" && p.text.includes("Nome: Maria"))).toBe(true);
  });

  it("field sem valor: 'Label:' seguido de régua de sublinhados", () => {
    const prims = measureBlock({ type: "field", label: "Endereço", value: null }, g);
    // Ajuste (Pre-flight Ruling 1): a régua de sublinhados mede ~190 com este Geom
    // e quebra em vários prims de texto; juntamos todos e checamos o padrão.
    const joined = prims
      .filter((p): p is Extract<typeof p, { kind: "text" }> => p.kind === "text")
      .map((p) => p.text)
      .join(" ");
    expect(joined).toMatch(/Endereço:\s*_+/);
  });

  it("checkbox: um prim kind=checkbox com o estado", () => {
    const prims = measureBlock({ type: "checkbox", label: "Autorizo.", checked: true }, g);
    expect(prims.filter((p) => p.kind === "checkbox")).toEqual([
      { kind: "checkbox", text: "Autorizo.", checked: true },
    ]);
  });

  it("signature: um único prim atômico kind=sig com altura embutida", () => {
    const prims = measureBlock({ type: "signature", who: "electronic", label: "Assinatura" }, g);
    expect(prims).toHaveLength(1);
    expect(prims[0]).toMatchObject({ kind: "sig", who: "electronic", label: "Assinatura" });
    expect((prims[0] as { h: number }).h).toBeGreaterThan(g.lineHeight);
  });

  it("heading: prim de texto bold", () => {
    const prims = measureBlock({ type: "heading", text: "Título" }, g);
    expect(prims.some((p) => p.kind === "text" && "bold" in p && p.bold)).toBe(true);
  });
});

describe("layoutBlocks", () => {
  it("quebra em páginas quando a altura acumulada passa de usableHeight", () => {
    const blocks: Block[] = [
      { type: "paragraph", text: "a" },
      { type: "paragraph", text: "b" },
      { type: "paragraph", text: "c" },
    ];
    // usableHeight 10, cada parágrafo ~ lineHeight(1) + space; força >1 página
    const g: Geom = { contentWidth: 40, bodySize: 1, lineHeight: 4, usableHeight: 9 };
    const pages = layoutBlocks(blocks, g, 0);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flat().filter((p) => p.kind === "text" && p.text === "a")).toHaveLength(1);
  });

  it("nunca divide um bloco signature entre páginas", () => {
    const blocks: Block[] = [
      { type: "paragraph", text: "x" },
      { type: "paragraph", text: "y" },
      { type: "signature", who: "electronic", label: "Assinatura" },
    ];
    const g: Geom = { contentWidth: 40, bodySize: 1, lineHeight: 4, usableHeight: 12 };
    const pages = layoutBlocks(blocks, g, 0);
    const sigPage = pages.find((page) => page.some((p) => p.kind === "sig"));
    expect(sigPage).toBeDefined();
    // o prim sig aparece exatamente uma vez, numa única página
    expect(pages.flat().filter((p) => p.kind === "sig")).toHaveLength(1);
  });

  it("firstPageReserve reduz o espaço da primeira página", () => {
    const blocks: Block[] = [{ type: "paragraph", text: "a" }, { type: "paragraph", text: "b" }];
    const g: Geom = { contentWidth: 40, bodySize: 1, lineHeight: 4, usableHeight: 20 };
    const semReserva = layoutBlocks(blocks, g, 0);
    const comReserva = layoutBlocks(blocks, g, 18);
    expect(semReserva).toHaveLength(1);
    expect(comReserva.length).toBeGreaterThan(1);
  });
});
