// Timbre fixo da clínica, embutido no código (decisão do design doc — não é
// configurável por conta agora). O logo entra como PNG base64: sem request
// extra, monta offline, não depende de img-src do CSP para asset local.
//
// logoPngBase64 fica vazio até o usuário fornecer public/logo/silvana-lopes.png.
// Com a string vazia, buildConsentPdf desenha só a linha do timbre com o nome
// da clínica em texto (ver pdf.ts). Para preencher depois:
//   node -e "console.log(require('fs').readFileSync('public/logo/silvana-lopes.png').toString('base64'))"
// e colar o resultado abaixo.
export const LETTERHEAD = {
  logoPngBase64: "",
  footer: "(66) 99672-0888  ·  @enfsilvanalopes  ·  Av. das Acácias, 697 — Jardim Botânico",
  empresaRazaoSocial: "CICATRIZE MAIS FERIDAS",
  empresaCnpj: "31.693.471/0001-56",
} as const;
