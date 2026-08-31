import type { ConsentKind } from "./schemas";

// Clínica em Cuiabá (UTC-4, sem horário de verão). O Worker roda em UTC, então
// carimbamos a data/hora do consentimento no fuso local — é a linha
// juridicamente relevante do PDF. `treatments/service.ts` usa a mesma convenção
// mas não exporta a const, então duplicamos o literal aqui.
const CLINIC_TIME_ZONE = "America/Cuiaba";

export interface TemplateContext {
  pacienteNome: string;
  pacienteCpf: string | null;
  pacienteNascimento: string | null; // YYYY-MM-DD
  clinicaNome: string;
  profissionalNome: string | null;
  profissionalConselho: string | null;
  data: string; // DD/MM/AAAA
}

interface TemplateDef {
  title: string;
  body: string;
}

// TEXTOS PROVISÓRIOS — a profissional (Silvana) vai fornecer o conteúdo real
// dos 3 documentos. Só a estrutura de placeholders é definitiva.
const TEMPLATES: Record<ConsentKind, TemplateDef> = {
  tcle: {
    title: "Termo de Consentimento Livre e Esclarecido",
    body: `[Texto do TCLE a ser fornecido pela profissional.]

Paciente: {{pacienteNome}}
Profissional responsável: {{profissionalNome}} ({{profissionalConselho}})
Clínica: {{clinicaNome}}
Data: {{data}}`,
  },
  imagem: {
    title: "Autorização de Uso de Imagem",
    body: `[Texto da autorização de uso de imagem a ser fornecido pela profissional.]

Paciente: {{pacienteNome}}
Data: {{data}}`,
  },
  lgpd: {
    title: "Consentimento para Tratamento de Dados Pessoais (LGPD)",
    body: `[Texto do consentimento LGPD a ser fornecido pela profissional.]

Paciente: {{pacienteNome}}
Clínica: {{clinicaNome}}
Data: {{data}}`,
  },
};

const TOKEN_RE = /\{\{(\w+)\}\}/g;

const FIELDS: Record<string, keyof TemplateContext> = {
  pacienteNome: "pacienteNome",
  pacienteCpf: "pacienteCpf",
  pacienteNascimento: "pacienteNascimento",
  clinicaNome: "clinicaNome",
  profissionalNome: "profissionalNome",
  profissionalConselho: "profissionalConselho",
  data: "data",
};

export function renderTemplate(
  kind: ConsentKind,
  ctx: TemplateContext,
): { title: string; paragraphs: string[] } {
  const def = TEMPLATES[kind];
  const filled = def.body.replace(TOKEN_RE, (_match, name: string) => {
    const key = FIELDS[name];
    if (!key) return "—";
    const value = ctx[key];
    return value == null || value === "" ? "—" : String(value);
  });
  const paragraphs = filled
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return { title: def.title, paragraphs };
}

function pad2(n: string): string {
  return n.length < 2 ? `0${n}` : n;
}

export function formatBrDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CLINIC_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${pad2(get("day"))}/${pad2(get("month"))}/${get("year")}`;
}

export function formatBrDateTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CLINIC_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${formatBrDate(date)} ${pad2(hour)}:${pad2(get("minute"))}`;
}
