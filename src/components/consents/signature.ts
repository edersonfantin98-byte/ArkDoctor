// Assinatura fixa da profissional, embutida em base64 (PNG com fundo
// transparente) — sem request extra, monta offline, não depende de img-src
// do CSP. buildConsentPdf desenha essa imagem acima da linha nos blocos de
// assinatura `who: "fixed"` dos 3 termos.
//
// PLACEHOLDER: enquanto `pngBase64` estiver vazio, o PDF cai no comportamento
// antigo (só a linha em branco). Basta colar aqui o base64 do PNG da Silvana
// (miolo, sem o prefixo `data:image/png;base64,`).
export const PROFESSIONAL_SIGNATURE = {
  pngBase64: "",
} as const;
