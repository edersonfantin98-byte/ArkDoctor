import { LETTERHEAD } from "@/components/consents/letterhead";
import type { ConsentKind } from "./schemas";

// Clínica em Cuiabá (UTC-4, sem horário de verão). O Worker roda em UTC, então
// carimbamos a data/hora do consentimento no fuso local.
const CLINIC_TIME_ZONE = "America/Cuiaba";

export type Block =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "field"; label: string; value: string | null; key?: string }
  | { type: "checkbox"; label: string; checked: boolean; key?: string }
  | { type: "signature"; who: "electronic" | "blank"; label: string };

export interface TemplateContext {
  pacienteNome: string;
  pacienteCpf: string | null;
  pacienteNascimento: string | null; // YYYY-MM-DD
  pacienteTelefone: string | null;
  clinicaNome: string;
  profissionalNome: string | null;
  profissionalConselho: string | null;
  data: string; // DD/MM/AAAA
  // Preenchidos pela enfermeira / por quem assina — só no TCLE de feridas:
  tipoFerida?: string | null;
  autoriza?: boolean | null;
  responsavelNome?: string | null;
  responsavelRg?: string | null;
}

const TITLES: Record<ConsentKind, string> = {
  tcle: "Consentimento Livre e Esclarecido — Tratamento de Feridas",
  imagem: "Termo de Autorização de Uso de Imagem e Voz",
  laser: "Protocolo de Laserterapia — Consentimento Livre e Esclarecido",
};

function isoToBr(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

function nonEmpty(s: string | null | undefined): string | null {
  return s != null && s.trim() !== "" ? s : null;
}

function buildTcle(ctx: TemplateContext): Block[] {
  const asResponsavel = Boolean(nonEmpty(ctx.responsavelNome));
  return [
    { type: "heading", text: "Termo de Compromisso / Consentimento Livre e Esclarecido — TCLE — Tratamento de Feridas" },

    { type: "field", label: "Nome", value: nonEmpty(ctx.pacienteNome) },
    { type: "field", label: "Data de nascimento", value: isoToBr(ctx.pacienteNascimento) },
    { type: "field", label: "Idade", value: null },
    { type: "field", label: "Procedimento", value: "Tratamento de Feridas" },
    { type: "field", label: "Tipo de ferida", value: nonEmpty(ctx.tipoFerida), key: "tipoFerida" },

    { type: "paragraph", text: "Declaro que fui claramente informado(a) sobre:" },
    { type: "paragraph", text: "Serei informado(a) qual tipo de cobertura será utilizada, assim como as possíveis contraindicações e reações adversas, mediante classificação da lesão após a avaliação do enfermeiro." },
    { type: "paragraph", text: "É de responsabilidade do Serviço de Saúde: avaliar, acompanhar e orientar o paciente e acompanhante/cuidador; encaminhar o paciente a outros profissionais quando necessário; propiciar condições que facilitem a cicatrização da ferida; orientar e estimular o autocuidado." },
    { type: "paragraph", text: "É de minha responsabilidade e/ou do meu cuidador: não faltar aos retornos agendados por duas vezes consecutivas ou três alternadas sem comunicação prévia; respeitar e seguir todas as orientações fornecidas pelos profissionais de saúde; não retirar ou trocar o curativo no domicílio sem autorização do profissional; procurar o Serviço de Saúde fora da data agendada em caso de intercorrências ou complicações; assumir as atividades relativas à limpeza e higiene pessoal; expor minhas dúvidas ao longo do tratamento." },
    { type: "paragraph", text: "Comprometo-me a sempre informar qualquer alteração evidenciada por mim e a manter meu histórico de saúde referente a alergias sempre atualizado." },
    { type: "paragraph", text: "Quando houver necessidade de coletar materiais relacionados ao procedimento, autorizo o envio do material coletado ao serviço pertinente para realização do exame necessário e terei acesso ao resultado." },
    { type: "paragraph", text: "Autorizo o uso de informações relativas ao meu tratamento, desde que assegurado o anonimato." },

    { type: "heading", text: "Preenchimento exclusivo pelo(a) paciente ou pelo(a) responsável legal" },
    { type: "paragraph", text: "Declaro, portanto, que fui devidamente informado(a) quanto ao procedimento que será realizado, assim como os benefícios, riscos, contraindicações e principais efeitos adversos relacionados, sendo-me concedida a oportunidade de esclarecer todas as dúvidas antes da assinatura deste documento, e ciente de que, em qualquer tempo, posso mudar de opinião e desistir da realização do procedimento." },
    { type: "paragraph", text: "Mediante estas informações:" },
    { type: "checkbox", label: "Autorizo a realização do tratamento proposto.", checked: ctx.autoriza === true, key: "autorizo" },
    { type: "checkbox", label: "Não autorizo a realização do tratamento proposto.", checked: false, key: "naoAutorizo" },

    { type: "field", label: "Nome do paciente", value: nonEmpty(ctx.pacienteNome) },
    { type: "field", label: "Contato telefônico", value: nonEmpty(ctx.pacienteTelefone) },
    { type: "field", label: "Endereço residencial", value: null },
    { type: "field", label: "Nome do responsável legal", value: nonEmpty(ctx.responsavelNome), key: "responsavelNome" },
    { type: "field", label: "RG do responsável legal", value: nonEmpty(ctx.responsavelRg), key: "responsavelRg" },
    { type: "field", label: "Contato telefônico do responsável", value: null },

    { type: "signature", who: "electronic", label: "Assinatura de quem consente" },
    { type: "checkbox", label: "Assino como paciente.", checked: !asResponsavel, key: "assinaComoPaciente" },
    { type: "checkbox", label: "Assino como responsável legal.", checked: asResponsavel, key: "assinaComoResponsavel" },

    { type: "heading", text: "Preenchimento exclusivo — profissional de saúde" },
    { type: "paragraph", text: "Afirmo, para os devidos fins legais, que expliquei detalhadamente todos os esclarecimentos necessários e que o paciente e/ou acompanhante compreendeu sobre benefícios, riscos e alternativas, tendo respondido às perguntas formuladas e assegurando-me de que houve período de reflexão suficiente para a tomada de decisão. De acordo com o meu entendimento, o(a) paciente e/ou seu responsável está em condições de compreender o que lhe foi informado e de que, a qualquer tempo, pode mudar de opinião e desistir da realização do procedimento." },
    { type: "field", label: "Data", value: nonEmpty(ctx.data) },
    { type: "signature", who: "blank", label: "Assinatura e carimbo do profissional de saúde" },
  ];
}

function buildImagem(ctx: TemplateContext): Block[] {
  return [
    { type: "heading", text: "Termo de Autorização de Uso de Imagem e Voz" },

    { type: "field", label: "Eu", value: nonEmpty(ctx.pacienteNome) },
    { type: "field", label: "RG", value: null },
    { type: "field", label: "CPF", value: nonEmpty(ctx.pacienteCpf) },
    { type: "field", label: "Endereço", value: null },
    { type: "field", label: "Município / UF", value: null },

    { type: "paragraph", text: `Autorizo a coleta e o uso de minha imagem e/ou voz, presentes em fotos, gravações de áudio e/ou vídeo realizadas em consultas e/ou avaliações em que participei, com a finalidade de confecção de atas, registros e históricos, criação de conteúdo em redes sociais e replicação em treinamentos, eventos, reuniões e afins, pela empresa ${LETTERHEAD.empresaRazaoSocial}, inscrita sob o CNPJ ${LETTERHEAD.empresaCnpj}, conforme a Lei 13.709/2018 (LGPD — Lei Geral de Proteção de Dados).` },
    { type: "paragraph", text: "As imagens, filmes e gravações de voz serão mantidos durante o período em que forem pertinentes ao alcance das finalidades acima citadas." },
    { type: "paragraph", text: "Quando publicados os vídeos e/ou fotos em mídia social, a ação será realizada sem possibilitar o download, ou seja, apenas em caráter informativo." },
    { type: "paragraph", text: "A presente autorização é concedida a título gratuito, abrangendo o uso da imagem e/ou voz acima mencionada em todo o território nacional e no exterior, em todas as suas modalidades e, em destaque, das seguintes formas: (I) home page; (II) mídias sociais; (III) divulgação em geral; (IV) material didático, inclusive para cessão de direitos de veiculação." },
    { type: "paragraph", text: "Este documento registra a manifestação livre, informada e inequívoca, conforme o disposto no Art. 5º, XII, da Lei 13.709/2018 (LGPD), e poderá ser revogado pelo titular, a qualquer momento, mediante solicitação por e-mail à empresa." },
    { type: "paragraph", text: "Por esta ser a expressão da minha vontade, declaro que autorizo o uso acima descrito sem que nada haja a ser reclamado a título de direitos conexos à minha imagem ou a qualquer outro." },

    { type: "signature", who: "electronic", label: "Assinatura do responsável" },
    { type: "signature", who: "blank", label: "Assinatura do responsável da empresa" },
  ];
}

function buildLaser(ctx: TemplateContext): Block[] {
  return [
    { type: "heading", text: "Protocolo de Laserterapia — Termo de Consentimento Livre e Esclarecido" },

    { type: "field", label: "Eu", value: nonEmpty(ctx.pacienteNome) },
    { type: "field", label: "CPF", value: nonEmpty(ctx.pacienteCpf) },

    { type: "paragraph", text: "Por este instrumento de consentimento informado e esclarecido, como paciente em pleno gozo de minhas faculdades mentais, livre e voluntariamente autorizo o tratamento de laserterapia de baixa frequência e/ou terapia fotodinâmica." },
    { type: "paragraph", text: "Os benefícios esperados pelo uso desse tipo de terapia são, segundo estudos prévios: diminuição da sintomatologia dolorosa dos músculos acometidos; uso de uma terapia indolor, de curto prazo, sem custos e sem riscos eminentes ao paciente e ao operador; melhora na qualidade de vida." },
    { type: "paragraph", text: "Os riscos que podem surgir ao longo do tratamento são: sintomatologia dolorosa persistente mesmo após o tratamento com o laser de baixa frequência (casos em que não se consegue a analgesia pretendida)." },
    { type: "paragraph", text: "Os procedimentos realizados e o número de sessões serão a critério do especialista, mas em média podem ser realizadas de 3 a 6 sessões clínicas com aplicação do laser: 2 a 3 vezes por semana, durante 2 semanas consecutivas, sendo que a sensibilidade à dor será analisada de acordo com uma escala, antes do tratamento inicial, depois de cada sessão e após 30 dias da última sessão clínica." },
    { type: "paragraph", text: "As normas de biossegurança e o uso de EPIs serão adotados durante todas as etapas do tratamento, tanto para o operador quanto para o paciente." },

    { type: "signature", who: "electronic", label: "Assinatura do paciente" },
    { type: "signature", who: "blank", label: "Assinatura do profissional — Silvana Lopes · Enfermeira · Especialista em Feridas · COREN-MT nº 481743" },
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

export interface TcleFieldValues {
  tipoFerida: string | null;
  autoriza: boolean;
  responsavelNome: string | null;
  responsavelRg: string | null;
}

export function applyTcleFields(blocks: Block[], v: TcleFieldValues): Block[] {
  const asResponsavel = Boolean(nonEmpty(v.responsavelNome));
  return blocks.map((b): Block => {
    if (b.type === "field" && b.key === "tipoFerida") return { ...b, value: nonEmpty(v.tipoFerida) };
    if (b.type === "field" && b.key === "responsavelNome") return { ...b, value: nonEmpty(v.responsavelNome) };
    if (b.type === "field" && b.key === "responsavelRg") return { ...b, value: nonEmpty(v.responsavelRg) };
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
