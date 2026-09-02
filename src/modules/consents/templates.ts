import type { ConsentKind } from "./schemas";

// Clínica em Cuiabá (UTC-4, sem horário de verão). O Worker roda em UTC, então
// carimbamos a data/hora do consentimento no fuso local.
const CLINIC_TIME_ZONE = "America/Cuiaba";

export type Block =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "field"; label: string; value: string | null; key?: string }
  | { type: "checkbox"; label: string; checked: boolean; key?: string }
  | { type: "signature"; who: "electronic" | "blank" | "fixed"; label: string };

export interface TemplateContext {
  pacienteNome: string;
  pacienteCpf: string | null;
  pacienteNascimento: string | null; // YYYY-MM-DD
  pacienteTelefone: string | null;
  pacienteRg: string | null;
  pacienteEndereco: string | null;
  pacienteCidadeUf: string | null;
  pacienteIdade: string | number | null;
  clinicaNome: string;
  profissionalNome: string | null;
  profissionalConselho: string | null;
  data: string; // DD/MM/AAAA
  // Preenchidos pela enfermeira / por quem assina — só no TCLE de feridas:
  tipoFerida?: string | null;
  autoriza?: boolean | null;
  responsavelNome?: string | null;
  responsavelRg?: string | null;
  responsavelTelefone?: string | null;
}

// Título tal como aparece no topo do documento da profissional (literal).
const TITLES: Record<ConsentKind, string> = {
  tcle: "TERMO DE COMPROMISSO/CONSENTIMENTO LIVRE ESCLARECIDO",
  imagem: "TERMO DE AUTORIZAÇÃO DE USO DE IMAGEM E VOZ",
  laser: "PROTOCOLO DE LASERTERAPIA",
};

function isoToBr(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

function nonEmpty(s: string | null | undefined): string | null {
  return s != null && s.trim() !== "" ? s : null;
}

// Idade em anos completos a partir de uma data ISO (YYYY-MM-DD), calculada
// contra `ref` (default: agora). Fora do fluxo de template para manter os
// builders puros/determinísticos.
export function ageFromIsoDate(iso: string | null | undefined, ref: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = ref.getFullYear() - y;
  if (ref.getMonth() + 1 < mo || (ref.getMonth() + 1 === mo && ref.getDate() < d)) age -= 1;
  return age >= 0 && age < 150 ? age : null;
}

// IMPORTANTE: o texto das cláusulas abaixo é cópia LITERAL do documento que a
// profissional desenvolveu com o advogado dela (public/… / "termos de
// consentimentos PDF 02.pdf"). Não corrigir gramática, pontuação, caixa,
// concordância nem formatação de CNPJ. Só os campos de dados (Nome, RG, CPF,
// endereço) são separados/rotulados para o preenchimento automático.
function buildTcle(ctx: TemplateContext): Block[] {
  const asResponsavel = Boolean(nonEmpty(ctx.responsavelNome));
  return [
    { type: "heading", text: "TCLE - TRATAMENTO DE FERIDAS" },

    { type: "field", label: "Nome", value: nonEmpty(ctx.pacienteNome) },
    { type: "field", label: "Data de nascimento", value: isoToBr(ctx.pacienteNascimento) },
    { type: "field", label: "Idade", value: nonEmpty(ctx.pacienteIdade == null ? null : String(ctx.pacienteIdade)) },
    { type: "field", label: "Procedimento", value: "Tratamento de Feridas" },
    { type: "field", label: "Tipo de ferida", value: nonEmpty(ctx.tipoFerida), key: "tipoFerida" },

    { type: "paragraph", text: "Declaro que fui claramente informado sobre:" },
    { type: "paragraph", text: "Serei informado (a) qual tipo de cobertura será utilizada assim como as possíveis contraindicações e reações adversas mediante classificação da lesão após a avaliação do Enfermeiro." },
    { type: "paragraph", text: "Ser de responsabilidade do Serviço de Saúde:" },
    { type: "paragraph", text: "Avaliar e acompanhar e orientar o paciente e acompanhante/cuidador;" },
    { type: "paragraph", text: "Encaminhar paciente para outros profissionais quando se fizer necessário;" },
    { type: "paragraph", text: "Propiciar condições que facilitem a cicatrização da ferida;" },
    { type: "paragraph", text: "Orientar e estimular o autocuidado." },
    { type: "paragraph", text: "Ser de minha responsabilidade e/ou do meu cuidador os cuidados como segue:" },
    { type: "paragraph", text: "Não faltar aos retornos agendados por duas vezes consecutivas ou três alternadas sem comunicação prévia;" },
    { type: "paragraph", text: "Respeitar e seguir todas as orientações fornecidas pelos profissionais de saúde;" },
    { type: "paragraph", text: "Não retirar ou trocar o curativo no domicílio sem a autorização do profissional;" },
    { type: "paragraph", text: "Procurar o Serviço de Saúde fora da data agendada em caso de intercorrências ou complicações;" },
    { type: "paragraph", text: "Assumir as atividades relativas à limpeza e higiene pessoal;" },
    { type: "paragraph", text: "Expor minhas dúvidas ao longo do tratamento." },
    { type: "paragraph", text: "Sempre informar qualquer alteração evidenciada por mim e manter o meu histórico de saúde referente a alergias sempre atualizado." },
    { type: "paragraph", text: "Quando houver necessidade de coletar materiais relacionadas ao procedimento, autorizo o envio do material coletado ao serviço pertinente a realizar o exame necessário e terei acesso ao resultado." },
    { type: "paragraph", text: "Autorizo a fazer uso de informações relativas ao meu tratamento, desde que assegurado o anonimato." },

    { type: "heading", text: "TCLE - TRATAMENTO DE FERIDAS" },
    { type: "heading", text: "PREENCHIMENTO EXCLUSIVO PELO(A) PACIENTE OU PELO (A) RESPONSÁVEL LEGAL" },
    { type: "paragraph", text: "Declaro, portanto, que fui devidamente informado (a) quanto ao procedimento que será realizado, assim como os benefícios, riscos,contraindicações e principais efeitos adversos relacionados, sendo concedida a oportunidade de esclarecer todas as dúvidas antes da assinatura deste documento e ciente de que em qualquer tempo, posso mudar de opinião e desistir da realização do procedimento." },
    { type: "paragraph", text: "Mediante estas informações:" },
    { type: "checkbox", label: "Autorizo a realização do tratamento proposto.", checked: ctx.autoriza === true, key: "autorizo" },
    { type: "checkbox", label: "Não autorizo a realização do tratamento proposto.", checked: false, key: "naoAutorizo" },

    { type: "field", label: "Nome do paciente", value: nonEmpty(ctx.pacienteNome) },
    { type: "field", label: "Contato telefônico", value: nonEmpty(ctx.pacienteTelefone) },
    { type: "field", label: "Endereço residencial", value: nonEmpty(ctx.pacienteEndereco), key: "pacienteEndereco" },
    { type: "field", label: "Nome do responsável legal", value: nonEmpty(ctx.responsavelNome), key: "responsavelNome" },
    { type: "field", label: "RG do responsável legal", value: nonEmpty(ctx.responsavelRg), key: "responsavelRg" },
    { type: "field", label: "Contato telefônico do responsável", value: nonEmpty(ctx.responsavelTelefone), key: "responsavelTelefone" },

    { type: "signature", who: "electronic", label: "Assinatura" },
    { type: "checkbox", label: "paciente", checked: !asResponsavel, key: "assinaComoPaciente" },
    { type: "checkbox", label: "responsável legal", checked: asResponsavel, key: "assinaComoResponsavel" },

    { type: "heading", text: "PREENCHIMENTO EXCLUSIVO PROFISSIONAL DE SAÚDE" },
    { type: "paragraph", text: "Afirmo, para os devidos fins legais, que expliquei detalhadamente todos os esclarecimentos necessários e que paciente e/ou acompanhante compreendeu sobre benefícios, riscos e alternativas, tendo respondido às perguntas formuladas pelo(s) mesmo(s) e assegurei-me de que houve um período de reflexão suficiente para a tomada da decisão. De acordo com o meu entendimento, o(a) paciente e/ou seu responsável, está em condições de compreender o que lhes foi informado e que a qualquer tempo, pode mudar de opinião e desistir da realização do procedimento." },
    { type: "field", label: "Data", value: nonEmpty(ctx.data) },
    { type: "signature", who: "fixed", label: "Assinatura e Carimbo do Profissional da Saúde" },
  ];
}

function buildImagem(ctx: TemplateContext): Block[] {
  return [
    { type: "field", label: "Eu", value: nonEmpty(ctx.pacienteNome) },
    { type: "field", label: "RG", value: nonEmpty(ctx.pacienteRg), key: "pacienteRg" },
    { type: "field", label: "CPF", value: nonEmpty(ctx.pacienteCpf), key: "pacienteCpf" },
    { type: "field", label: "Endereço", value: nonEmpty(ctx.pacienteEndereco), key: "pacienteEndereco" },
    { type: "field", label: "Município / UF", value: nonEmpty(ctx.pacienteCidadeUf), key: "pacienteCidadeUf" },

    { type: "paragraph", text: "AUTORIZO a coleta e uso de minha imagem e/ou voz, presente(s) em foto(s), gravação(ões) de áudio e/ou vídeo, realizada(s) em consulta(s) e/ou avaliação(ões) em que participei, com a finalidade de confecção de ata(s), registro(s), histórico(s), criação de conteúdo em redes sociais e replicação em outro(s) treinamento(s), eventos, reunião(ões) e afins, pela empresa CICATRIZE MAIS FERIDAS, inscrita sob o CNPJ 31693471/0001-56, conforme Lei 13.709/2018 (LGPD – Lei Geral de Proteção de Dados)." },
    { type: "paragraph", text: "As imagens, filmes e gravação de voz serão mantidos durante o período em que eles forem pertinentes ao alcance das finalidades acima citadas." },
    { type: "paragraph", text: "Quando publicado(s) o(s) vídeo(s) e/ou foto(s) em mídia social, a ação será realizada sem possibilitar o download, ou seja, apenas caráter informativo." },
    { type: "paragraph", text: "A presente autorização é concedida a título gratuito, abrangendo o uso da imagem e/ou voz acima mencionada em todo território nacional e no exterior, em todas as suas modalidades e, em destaque, das seguintes formas: (I) home page; (II) mídias sociais; (III) divulgação em geral; (IV) material didático, inclusive para cessão de direitos de veiculação." },
    { type: "paragraph", text: "Este documento registra a manifestação livre, informada e inequívoca, conforme disposto no Art. 5º, XII, Lei 13.709/2018 (LGPD – Lei Geral de Proteção de Dados), e poderá ser revogado pelo titular, a qualquer momento, mediante solicitação via e-mail à empresa." },
    { type: "paragraph", text: "Por esta ser a expressão da minha vontade declaro que autorizo o uso acima descrito sem que nada haja a ser reclamado a título de direitos conexos à minha imagem ou a qualquer outro." },

    { type: "signature", who: "electronic", label: "Assinatura do Responsável" },
    { type: "signature", who: "fixed", label: "Assinatura do Responsável da Empresa" },
  ];
}

function buildLaser(ctx: TemplateContext): Block[] {
  return [
    { type: "heading", text: "TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO" },

    { type: "field", label: "Eu", value: nonEmpty(ctx.pacienteNome) },
    { type: "field", label: "CPF", value: nonEmpty(ctx.pacienteCpf), key: "pacienteCpf" },

    { type: "paragraph", text: "Por este instrumento de consentimento informado e esclarecido, como paciente em pleno gozo de minhas faculdades mentais, livre e voluntariamente autorizo o tratamento de laserterapia de baixa frequência e ou terapia fotodinâmica." },
    { type: "paragraph", text: "Os benefícios esperados pelo uso do tipo de terapia são, segundo estudos prévios:" },
    { type: "paragraph", text: "Diminuição da sintomatologia dolorosa dos músculos acometidos;" },
    { type: "paragraph", text: "Uso de uma terapia indolor, de curto prazo, sem custos e riscos eminentes aos pacientes e operador;" },
    { type: "paragraph", text: "Melhora na qualidade de vida ;" },
    { type: "paragraph", text: "Os riscos que podem surgir ao longo do tratamento são:" },
    { type: "paragraph", text: "Sintomatologia dolorosa persistente mesmo após o tratamento com o laser de baixa frequência ( Casos onde não se consegue a analgesia pretendida)" },
    { type: "paragraph", text: "Os procedimentos realizados e número de sessões serão a critério do especialista mas em média podem ser realizados a partir de 3 sessões a 6 sessões clínicas com aplicação do laser: 2 a 3 vezes na semana, durante 2 semanas consecutivas sendo que a sensibilidade a dor será analisada de acordo com uma escala, antes de iniciarmos o tratamento inicial, depois de cada sessão e após 30 dias da última sessão clínica." },
    { type: "paragraph", text: "As normas de Biossegurança e uso de EPIs serão adotadas durante todas as etapas do tratamento, tanto para o operador quanto para o paciente." },

    { type: "signature", who: "electronic", label: "Assinatura do paciente" },
    { type: "signature", who: "fixed", label: "Assinatura do Profissional — Silvana Lopes | Enfermeira | Especialista em Feridas | COREN-MT nº 481743" },
  ];
}

const BUILDERS: Record<ConsentKind, (ctx: TemplateContext) => Block[]> = {
  tcle: buildTcle,
  imagem: buildImagem,
  laser: buildLaser,
};

export function renderTemplate(
  kind: ConsentKind,
  ctx: TemplateContext,
): { title: string; blocks: Block[] } {
  return { title: TITLES[kind], blocks: BUILDERS[kind](ctx) };
}

// Campos de documento do paciente que a tela de assinatura coleta/edita e
// grava de volta no cadastro. A key liga o bloco do template ao input e à
// coluna do contato.
export const PATIENT_DOC_KEYS = [
  "pacienteCpf",
  "pacienteRg",
  "pacienteEndereco",
  "pacienteCidadeUf",
] as const;
export type PatientDocKey = (typeof PATIENT_DOC_KEYS)[number];

export function applyDocFields(
  blocks: Block[],
  values: Partial<Record<string, string | null>>,
): Block[] {
  return blocks.map((b): Block => {
    if (b.type === "field" && b.key && b.key in values) {
      return { ...b, value: nonEmpty(values[b.key] ?? null) };
    }
    return b;
  });
}

export interface TcleFieldValues {
  tipoFerida: string | null;
  autoriza: boolean;
  responsavelNome: string | null;
  responsavelRg: string | null;
  responsavelTelefone?: string | null;
}

export function applyTcleFields(blocks: Block[], v: TcleFieldValues): Block[] {
  const asResponsavel = Boolean(nonEmpty(v.responsavelNome));
  return blocks.map((b): Block => {
    if (b.type === "field" && b.key === "tipoFerida") return { ...b, value: nonEmpty(v.tipoFerida) };
    if (b.type === "field" && b.key === "responsavelNome") return { ...b, value: nonEmpty(v.responsavelNome) };
    if (b.type === "field" && b.key === "responsavelRg") return { ...b, value: nonEmpty(v.responsavelRg) };
    if (b.type === "field" && b.key === "responsavelTelefone") return { ...b, value: nonEmpty(v.responsavelTelefone) };
    if (b.type === "checkbox" && b.key === "autorizo") return { ...b, checked: v.autoriza };
    if (b.type === "checkbox" && b.key === "assinaComoPaciente") return { ...b, checked: !asResponsavel };
    if (b.type === "checkbox" && b.key === "assinaComoResponsavel") return { ...b, checked: asResponsavel };
    return b;
  });
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
