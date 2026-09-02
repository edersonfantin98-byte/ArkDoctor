import type { PDFFont } from "pdf-lib";
import type { Block } from "@/modules/consents/templates";
import { LETTERHEAD } from "./letterhead";

export function wrapLine(
  text: string,
  maxWidth: number,
  measure: (s: string) => number,
): string[] {
  if (text === "") return [""];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && measure(candidate) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

export interface Geom {
  contentWidth: number;
  bodySize: number;
  lineHeight: number;
  usableHeight: number;
  measure: (text: string, size: number, bold: boolean) => number;
}

export type Prim =
  | { kind: "text"; text: string; size: number; bold: boolean }
  | { kind: "checkbox"; text: string; checked: boolean }
  | { kind: "space"; h: number }
  | { kind: "sig"; who: "electronic" | "blank"; label: string; h: number };

const HEADING_EXTRA = 3; // pt acima do bodySize para heading
const PARA_GAP = 6;
const FIELD_GAP = 4;
const HEADING_GAP_BEFORE = 12;
const HEADING_GAP_AFTER = 4;
const SIG_HEIGHT_ELECTRONIC = 116; // gap topo + imagem + linha + rótulo + linha "assinado eletronicamente"
const SIG_HEIGHT_BLANK = 74; // gap topo + linha + rótulo
const FIELD_RULE = " ____________________________";

function primHeight(prim: Prim, geom: Geom): number {
  switch (prim.kind) {
    case "text":
    case "checkbox":
      return geom.lineHeight;
    case "space":
      return prim.h;
    case "sig":
      return prim.h;
  }
}

export function measureBlock(block: Block, geom: Geom): Prim[] {
  if (block.type === "heading") {
    const size = geom.bodySize + HEADING_EXTRA;
    return [
      { kind: "space", h: HEADING_GAP_BEFORE },
      ...wrapLine(block.text, geom.contentWidth, (s) => geom.measure(s, size, true)).map(
        (t): Prim => ({ kind: "text", text: t, size, bold: true }),
      ),
      { kind: "space", h: HEADING_GAP_AFTER },
    ];
  }

  if (block.type === "paragraph") {
    return [
      ...wrapLine(block.text, geom.contentWidth, (s) => geom.measure(s, geom.bodySize, false)).map(
        (t): Prim => ({ kind: "text", text: t, size: geom.bodySize, bold: false }),
      ),
      { kind: "space", h: PARA_GAP },
    ];
  }

  if (block.type === "field") {
    const line = block.value != null ? `${block.label}: ${block.value}` : `${block.label}:${FIELD_RULE}`;
    return [
      ...wrapLine(line, geom.contentWidth, (s) => geom.measure(s, geom.bodySize, false)).map(
        (t): Prim => ({ kind: "text", text: t, size: geom.bodySize, bold: false }),
      ),
      { kind: "space", h: FIELD_GAP },
    ];
  }

  if (block.type === "checkbox") {
    return [
      { kind: "checkbox", text: block.label, checked: block.checked },
      { kind: "space", h: FIELD_GAP },
    ];
  }

  // signature — um único prim atômico
  return [
    {
      kind: "sig",
      who: block.who,
      label: block.label,
      h: block.who === "electronic" ? SIG_HEIGHT_ELECTRONIC : SIG_HEIGHT_BLANK,
    },
  ];
}

export function layoutBlocks(blocks: Block[], geom: Geom, firstPageReserve: number): Prim[][] {
  const pages: Prim[][] = [[]];
  let used = firstPageReserve;

  const pushPrim = (prim: Prim) => {
    const h = primHeight(prim, geom);
    const cur = pages[pages.length - 1];
    // só pagina se a página atual já tem conteúdo (nunca cria página vazia)
    if (used + h > geom.usableHeight && cur.length > 0) {
      pages.push([]);
      used = 0;
      if (prim.kind === "space") return; // descarta o gap no topo da nova página
    }
    pages[pages.length - 1].push(prim);
    used += h;
  };

  for (const block of blocks) {
    for (const prim of measureBlock(block, geom)) pushPrim(prim);
  }
  return pages;
}

export interface ConsentPdfInput {
  title: string;
  blocks: Block[];
  signatureDataUrl: string; // PNG data URL
  signerName: string;
  signedAtLabel: string;
}

const PAGE_WIDTH = 595.28; // A4 pt
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const HEADER_H = 64; // faixa do timbre no topo
const FOOTER_H = 34; // faixa do rodapé
const BODY_SIZE = 10.5;
const LINE_HEIGHT = 15;
const TITLE_SIZE = 15;

export async function buildConsentPdf(input: ConsentPdfInput): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let logo: Awaited<ReturnType<typeof doc.embedPng>> | null = null;
  if (LETTERHEAD.logoPngBase64) {
    try {
      logo = await doc.embedPng(`data:image/png;base64,${LETTERHEAD.logoPngBase64}`);
    } catch {
      logo = null;
    }
  }

  const contentWidth = PAGE_WIDTH - MARGIN * 2;
  const geom: Geom = {
    contentWidth,
    bodySize: BODY_SIZE,
    lineHeight: LINE_HEIGHT,
    usableHeight: PAGE_HEIGHT - MARGIN * 2 - HEADER_H - FOOTER_H,
    measure: (t, size, isBold) => (isBold ? bold : font).widthOfTextAtSize(t, size),
  };

  // reserva na 1ª página para o título do documento
  const titleLines = wrapLine(input.title, contentWidth, (s) => bold.widthOfTextAtSize(s, TITLE_SIZE));
  const firstPageReserve = titleLines.length * (TITLE_SIZE + 4) + 12;

  const pages = layoutBlocks(input.blocks, geom, firstPageReserve);

  const drawFrame = () => {
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    // timbre
    if (logo) {
      const w = 150;
      const h = (logo.height / logo.width) * w;
      page.drawImage(logo, { x: MARGIN, y: PAGE_HEIGHT - MARGIN - h, width: w, height: Math.min(h, HEADER_H) });
    } else {
      page.drawText(LETTERHEAD.empresaRazaoSocial, {
        x: MARGIN,
        y: PAGE_HEIGHT - MARGIN - 12,
        size: 11,
        font: bold,
        color: rgb(0.2, 0.2, 0.2),
      });
    }
    page.drawLine({
      start: { x: MARGIN, y: PAGE_HEIGHT - MARGIN - HEADER_H + 8 },
      end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - MARGIN - HEADER_H + 8 },
      thickness: 0.5,
      color: rgb(0.75, 0.75, 0.75),
    });
    // rodapé
    page.drawText(LETTERHEAD.footer, {
      x: MARGIN,
      y: MARGIN - 4,
      size: 7.5,
      font,
      color: rgb(0.45, 0.45, 0.45),
    });
    return page;
  };

  let page = drawFrame();
  let y = PAGE_HEIGHT - MARGIN - HEADER_H;

  // título só na 1ª página
  for (const line of titleLines) {
    page.drawText(line, { x: MARGIN, y: y - TITLE_SIZE, size: TITLE_SIZE, font: bold });
    y -= TITLE_SIZE + 4;
  }
  y -= 12;

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const pagePrims = pages[pageIndex];
    if (pageIndex > 0) {
      page = drawFrame();
      y = PAGE_HEIGHT - MARGIN - HEADER_H;
    }
    for (const prim of pagePrims) {
      if (prim.kind === "space") {
        y -= prim.h;
      } else if (prim.kind === "text") {
        page.drawText(prim.text, {
          x: MARGIN,
          y: y - prim.size,
          size: prim.size,
          font: prim.bold ? bold : font,
        });
        y -= LINE_HEIGHT;
      } else if (prim.kind === "checkbox") {
        const box = 9;
        const top = y - BODY_SIZE;
        page.drawRectangle({
          x: MARGIN,
          y: top,
          width: box,
          height: box,
          borderColor: rgb(0.2, 0.2, 0.2),
          borderWidth: 0.8,
        });
        if (prim.checked) {
          page.drawLine({ start: { x: MARGIN + 1.5, y: top + 4 }, end: { x: MARGIN + 3.5, y: top + 1.5 }, thickness: 1, color: rgb(0.1, 0.1, 0.1) });
          page.drawLine({ start: { x: MARGIN + 3.5, y: top + 1.5 }, end: { x: MARGIN + 7.5, y: top + 7.5 }, thickness: 1, color: rgb(0.1, 0.1, 0.1) });
        }
        page.drawText(prim.text, { x: MARGIN + box + 6, y: y - BODY_SIZE, size: BODY_SIZE, font });
        y -= LINE_HEIGHT;
      } else {
        // sig
        y -= 16; // gap de topo do bloco
        if (prim.who === "electronic" && input.signatureDataUrl) {
          try {
            const png = await doc.embedPng(input.signatureDataUrl);
            const w = 170;
            const h = Math.min((png.height / png.width) * w, 44);
            page.drawImage(png, { x: MARGIN, y: y - h, width: w, height: h });
            y -= h + 2;
          } catch {
            y -= 20;
          }
        } else {
          y -= 24;
        }
        page.drawLine({
          start: { x: MARGIN, y },
          end: { x: MARGIN + 280, y },
          thickness: 0.5,
          color: rgb(0.2, 0.2, 0.2),
        });
        y -= 12;
        page.drawText(prim.label, { x: MARGIN, y: y - 8, size: 8, font, color: rgb(0.3, 0.3, 0.3) });
        if (prim.who === "electronic") {
          y -= 20;
          page.drawText(
            `Assinado eletronicamente por ${input.signerName} em ${input.signedAtLabel}`,
            { x: MARGIN, y: y - 8, size: 7.5, font, color: rgb(0.35, 0.35, 0.35) },
          );
        }
        y -= 14;
      }
    }
  }

  return doc.save();
}

export type { PDFFont };
