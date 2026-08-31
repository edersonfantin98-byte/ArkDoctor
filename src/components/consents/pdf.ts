import type { PDFFont } from "pdf-lib";

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

export function layoutParagraphs(
  paragraphs: string[],
  maxWidth: number,
  measure: (s: string) => number,
): string[] {
  const out: string[] = [];
  paragraphs.forEach((paragraph, index) => {
    if (index > 0) out.push("");
    out.push(...wrapLine(paragraph, maxWidth, measure));
  });
  return out;
}

export function paginate(lines: string[], linesPerPage: number): string[][] {
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += linesPerPage) {
    pages.push(lines.slice(i, i + linesPerPage));
  }
  return pages;
}

export interface ConsentPdfInput {
  documentTitle: string;
  headerLines: string[];
  paragraphs: string[];
  signatureDataUrl: string; // PNG data URL
  signerName: string;
  signedAtLabel: string;
}

const PAGE_WIDTH = 595.28; // A4 pt
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const BODY_SIZE = 11;
const LINE_HEIGHT = 16;

export async function buildConsentPdf(input: ConsentPdfInput): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const contentWidth = PAGE_WIDTH - MARGIN * 2;
  const measure = (s: string) => font.widthOfTextAtSize(s, BODY_SIZE);
  const bodyLines = layoutParagraphs(input.paragraphs, contentWidth, measure);

  // primeira página reserva espaço p/ título + cabeçalho; usamos um cálculo
  // conservador de linhas por página e deixamos a última página com a assinatura.
  const linesPerPage = Math.floor((PAGE_HEIGHT - MARGIN * 2 - 120) / LINE_HEIGHT);
  const pages = paginate(bodyLines, Math.max(linesPerPage, 1));

  pages.forEach((pageLines, pageIndex) => {
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;

    if (pageIndex === 0) {
      page.drawText(input.documentTitle, { x: MARGIN, y, size: 15, font: bold });
      y -= 26;
      for (const line of input.headerLines) {
        page.drawText(line, { x: MARGIN, y, size: 9, font, color: rgb(0.3, 0.3, 0.3) });
        y -= 13;
      }
      y -= 12;
    }

    for (const line of pageLines) {
      page.drawText(line, { x: MARGIN, y, size: BODY_SIZE, font });
      y -= LINE_HEIGHT;
    }
  });

  // assinatura no rodapé da última página
  const last = doc.getPage(doc.getPageCount() - 1);
  const png = await doc.embedPng(input.signatureDataUrl);
  const sigWidth = 180;
  const sigHeight = (png.height / png.width) * sigWidth;
  last.drawImage(png, { x: MARGIN, y: MARGIN + 24, width: sigWidth, height: sigHeight });
  last.drawLine({
    start: { x: MARGIN, y: MARGIN + 20 },
    end: { x: MARGIN + 260, y: MARGIN + 20 },
    thickness: 0.5,
    color: rgb(0.2, 0.2, 0.2),
  });
  last.drawText(
    `Assinado eletronicamente por ${input.signerName} em ${input.signedAtLabel}`,
    { x: MARGIN, y: MARGIN + 6, size: 8, font, color: rgb(0.3, 0.3, 0.3) },
  );

  return doc.save();
}

// re-export do tipo para consumidores que só querem a medida
export type { PDFFont };
