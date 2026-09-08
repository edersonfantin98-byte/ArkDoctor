# Plano — Correções do teste de ponta a ponta (dogfood 2026-09-08)

Origem: `dogfood-output/report.md`. 16 achados (0 crítico, 3 altos, 6 médios, 7 baixos).
ISSUE-008 foi descartada (a empresa CICATRIZE MAIS FERIDAS é da Silvana — engano meu).

Regra que vale para o plano todo: **o texto das cláusulas dos termos em `src/modules/consents/templates.ts`
é cópia literal do documento jurídico da Dra. — não corrigir gramática/pontuação/caixa.** Onde um
achado é "de conteúdo", o alvo é o que o app faz em volta do texto (render de prévia, campos de
identidade, layout do PDF), nunca o texto.

Nada aqui vai pra produção antes do upgrade da Cloudflare (deploy automático está quebrado).

---

## Decisões (fechadas com o usuário — 2026-09-08)

1. **Identidade nos termos (ISSUE-009/010).** Manter rodapé, timbre e logo **fixos**. Só fazer o
   rótulo de assinatura dos termos puxar de Configurações: `profissionalNome` e
   `profissionalConselho` do `TemplateContext` (que já existem), no formato
   `{nome} — {conselho}` (ex.: `Silvana Lopes — COREN-MT nº 481743`), com fallback para o texto
   fixo atual quando os campos estiverem vazios. **Não** adicionar campos de contato nem upload
   de logo agora.
2. **CPF (ISSUE-002).** **Bloquear** o salvar quando o CPF estiver preenchido e inválido
   (11 dígitos + dígitos verificadores). Vazio continua permitido.
3. **Campos de data (ISSUE-004).** Manter `<input type="date">` nativo (simples, acessível, bom
   no celular; no navegador em pt-BR da Dra. já mostra DD/MM/AAAA — o MM/DD que apareceu no teste
   é porque o navegador da automação está em inglês). Fix mínimo: `<html lang="pt-BR">` no layout
   raiz + trocar as mensagens de validação nativas relevantes (e-mail, valor mínimo) por checagem
   própria em pt-BR. Sem date picker custom.

---

## Fase 1 — Bugs que quebram / alto risco

### 1.1 — Server action de bloqueio de agenda faz `throw` em input inválido (ISSUE-013)

- **Problema:** `createAvailabilityRuleAction` → `scheduling.createAvailabilityRule` chama
  `parseOrThrow`, que faz `throw new Error(...)`. O `.refine` do schema já dá a mensagem certa
  ("O fim deve ser depois do início"), mas como é `throw` não tratado numa server action, vira
  tela vermelha de Runtime Error (dev) / rejeição silenciosa (prod). Vale para
  `createAvailabilityRuleAction` **e** `createAvailabilityBlockAction` (mesmo padrão, linha 293).
- **Mudança:**
  - Client (`src/components/agenda/*bloqueios*`): validar antes de chamar a action —
    `fim > início` nos dois formulários (recorrente e pontual); desabilitar "Adicionar" enquanto
    inválido; mostrar erro inline.
  - Action: envolver a chamada em try/catch e retornar `{ ok: false, error }` em vez de deixar
    propagar (padrão que o resto do app já usa, ex. `submitPublicConsentAction`).
- **Arquivos:** `src/app/(app)/agenda/actions.ts` (~136, e o de block ~110),
  `src/modules/scheduling/service.ts` (321, 293), componente de "Bloqueios de agenda" em
  `src/components/agenda/`.
- **Verificar:** submeter recorrente com 12:00→11:00 e motivo vazio → mensagem inline
  "O fim deve ser depois do início", **sem** overlay, bloqueio não criado. Recorrente válido
  (09:00→10:00 + motivo) → cria normal. Idem para bloqueio pontual.

### 1.2 — Identidade da profissional inconsistente entre documentos (ISSUE-009)

- **Problema:** o relatório clínico usa `professionalName`/`councilId` das Configurações; o termo
  de Laserterapia tem `{ type: "signature", who: "fixed", label: "Assinatura do Profissional —
  Silvana Lopes | Enfermeira | Especialista em Feridas | COREN-MT nº 481743" }` **fixo**
  (`templates.ts:161`); o TCLE usa rótulo genérico sem nome. Mudar Configurações não reflete nos
  termos.
- **Mudança:** trocar o `label` fixo do bloco de assinatura por um montado como
  `{ctx.profissionalNome} — {ctx.profissionalConselho}`, com fallback para o texto fixo atual
  quando os campos estiverem vazios. Aplicar o mesmo no TCLE (hoje sem nome). Não mexer no texto
  das cláusulas. Rodapé/timbre/logo continuam fixos (decisão 1).
- **Arquivos:** `src/modules/consents/templates.ts` (blocos de assinatura dos 3 kinds),
  `src/modules/consents/templates.test.ts` (o teste "assinatura da profissional é fixa" muda).
- **Verificar:** Configurações → trocar nome/registro → gerar de novo o PDF de cada termo +
  relatório clínico → o valor novo aparece nos 4. Campos vazios → cai no texto atual.

### 1.3 — "Confirmar assinatura" habilitado sem traço no quadro (ISSUE-007)

- **Problema:** `canSubmit` (`consent-sign-form.tsx:100`) não olha a assinatura; só
  `handleSubmit:131` trava (com `setError`). Botão parece clicável e falha no clique.
  Não é falha de dados — é UX.
- **Mudança:** `signature-pad.tsx` passa a aceitar `onEnd` (o `signature_pad` emite esse evento)
  e a expor via ref o estado atual; `consent-sign-form.tsx` guarda `hasSignature` em `useState`,
  seta no `onEnd`, zera no handler do "Limpar" (`:293`) e inclui no `canSubmit`.
- **Arquivos:** `src/components/consents/signature-pad.tsx`,
  `src/components/consents/consent-sign-form.tsx`.
- **Verificar:** abrir "Assinar de novo", preencher nome + radio → botão continua desabilitado;
  desenhar → habilita; "Limpar" → volta a desabilitar; desenhar de novo → habilita e assina ok.

---

## Fase 2 — Integridade de dados e documentos (médio)

### 2.1 — CPF do paciente sem validação (ISSUE-002)

- **Mudança:** validador de CPF (11 dígitos + DV) reaproveitável em `src/lib/cpf.ts`; aplicar no
  schema Zod do paciente (server, com `message` pt-BR) e no client (erro inline, **bloqueia o
  salvar**). Vazio continua válido.
- **Arquivos:** schema do paciente em `src/modules/crm/` (ou onde vive o `updatePatient`/
  `createPatient`), form em `src/components/pacientes/` (Novo paciente + Editar dados),
  `src/lib/` (novo `cpf.ts`).
- **Verificar:** salvar CPF "123" → erro inline, não persiste. CPF válido → salva. Vazio → salva.
- **Limpeza:** reverter o CPF da Ana Beatriz Santos (está "123" por causa do teste).

### 2.2 — "Idade" em branco no PDF do termo (ISSUE-005)

- **Problema:** a prévia mostra "Idade: 50" (`ageFromIsoDate` + `pacienteIdade` no contexto),
  mas o PDF gerado sai com a linha em branco. Algum caminho de build do PDF não recebe/renderiza
  `pacienteIdade`.
- **Mudança:** garantir que o builder do PDF receba `pacienteIdade` (ou calcule de
  `pacienteNascimento`) e renderize o valor no lugar da linha pontilhada. Se a decisão for não
  mostrar idade, remover a linha nos 3 templates — mas o padrão hoje (prévia mostra) indica que
  é pra mostrar.
- **Arquivos:** `src/components/consents/pdf.ts`, `src/modules/consents/templates.ts` (bloco
  `field` "Idade"), caminho que monta o `TemplateContext` na hora de assinar
  (`src/app/assinar/[token]/` e o de "Assinar de novo").
- **Verificar:** assinar um termo novo p/ paciente com nascimento preenchido → PDF mostra a idade.

### 2.3 — Agendamento oferece horário que estoura o expediente (ISSUE-012)

- **Problema:** slots vão até 17:30; para procedimento de 90 min o sistema ainda oferece 17:00 e
  17:30 (termina 18:30/19:00). Falta checar `início + duração <= fim do expediente`. O conflito
  com outros agendamentos já é checado corretamente.
- **Mudança:** no cálculo de disponibilidade, filtrar horários de início onde
  `início + duração(procedimento) > fimDaJanela`. Confirmar de onde vem a janela do expediente
  (config de horários? constante?).
- **Arquivos:** `src/modules/scheduling/service.ts` (geração de slots),
  possivelmente `src/app/(app)/agendamento/` e o fluxo público.
- **Verificar:** procedimento de 90 min → último início oferecido = (fimExpediente − 90 min);
  procedimento de 30 min → último início = (fimExpediente − 30 min).
- **Limpeza:** apagar o agendamento de teste "Bruno Henrique Cardoso — Tratamento de Canal
  10/09 17:30".

### 2.4 — Marca/contato do rodapé permanece fixo (ISSUE-010) — decisão: não mexer

- Decisão 1: timbre (`letterhead.ts` / `public/logo/silvana-lopes-timbre.jpg`), telefone, @ e
  endereço do rodapé **ficam fixos**. Nenhuma mudança de código.
- Única ação: **conferir com a Dra.** que os valores fixos estão corretos — telefone
  (66) 99672-0888, @enfsilvanalopes, Av. das Acácias 697 - Jardim Botânico, e a razão social /
  CNPJ que aparece no termo de Imagem e Voz (CICATRIZE MAIS FERIDAS, 31.693.471/0001-56).

### 2.5 — Rótulo "responsável" e página em branco no termo de Imagem e Voz (ISSUE-011)

- **Mudança:** rótulo da assinatura do titular: "Assinatura do titular" quando é o próprio
  paciente; "Assinatura do responsável legal" só quando assinou como responsável. Remover a
  quebra que joga "Assinatura do responsável da empresa" sozinha numa página nova (ajustar
  layout/paginação no `pdf.ts` para o kind `imagem`).
- **Arquivos:** `src/modules/consents/templates.ts` (bloco de assinatura do `imagem`),
  `src/components/consents/pdf.ts` (paginação).
- **Verificar:** termo de Imagem e Voz assinado pelo próprio paciente → rótulo "titular";
  PDF sem página quase vazia.

---

## Fase 3 — Polish (baixo)

### 3.1 — Mensagens de validação em inglês / cruas (ISSUE-001, ISSUE-004)

- `parseOrThrow`/`friendlyMessage` retorna `error.issues[0].message` — quando o schema não tem
  `message` custom, sai o texto padrão do Zod ("Too small: expected string to have >=8
  characters"). **Mudança:** adicionar `message` pt-BR nos schemas de paciente (telefone, etc.)
  e, para o form, prender o erro ao campo em vez de banner genérico.
- Inputs nativos: `<html lang="pt-BR">` no layout raiz; onde há validação nativa relevante
  (e-mail, `min` de valor no financeiro), adicionar checagem própria com mensagem pt-BR antes de
  submeter.
- **Arquivos:** schema de paciente, `src/app/layout.tsx`, forms de paciente e de lançamento
  financeiro.
- **Verificar:** telefone curto → "Telefone deve ter ao menos 8 dígitos" no campo; e-mail
  inválido e valor negativo → mensagem pt-BR.

### 3.2 — Prévia do termo na tela come vírgulas / insere espaço antes de "(" (ISSUE-006)

- **Problema:** só na prévia (o PDF está fiel). Algum `.replace`/normalização no componente que
  renderiza `type: "paragraph"` na tela.
- **Arquivos:** componente de preview do termo em `src/components/consents/` (o que renderiza os
  `blocks` na tela de assinatura), não `templates.ts`.
- **Verificar:** prévia do TCLE bate caractere a caractere com o parágrafo em `templates.ts`.

### 3.3 — Gráficos Recharts com width/height 0 (ISSUE-014)

- **Mudança:** dar altura explícita / `min-height` ao container do `ResponsiveContainer` no
  Dashboard e no Financeiro; conferir eixos (hoje sem rótulo/valores).
- **Arquivos:** `src/components/dashboard/*`, `src/components/financeiro/*` (gráficos
  "Receita — últimos 6 meses" e "Receita vs. despesas").
- **Verificar:** console sem o warning "width(0) and height(0)"; gráfico com eixo Y e valores.

### 3.4 — Horário do bloqueio mostra segundos (ISSUE-015)

- **Mudança:** formatar `startTime`/`endTime` como `HH:MM` na lista de bloqueios recorrentes.
- **Arquivo:** componente de "Bloqueios de agenda".
- **Verificar:** bloqueio listado como `09:00–10:00`.

### 3.5 — Seed / dados de teste (ISSUE-003, ISSUE-016) e limpeza geral

- Resolve-se ao zerar a base antes de entregar. Antes de zerar:
  - Conferir se a importação de histórico do WhatsApp grava `sexo` como "masculino" quando é
    desconhecido (Ana Beatriz veio "Masculino"); se for isso, corrigir para nulo/"não informado".
  - Cadastrar os procedimentos reais da clínica (hoje o seed é 100% odontológico).
- **Limpeza dos dados que este teste criou:** agendamentos Ana 10/09 14:00 e Bruno 10/09 17:30;
  bloqueio recorrente "Segunda 09:00–10:00 (Almoco QA)"; paciente "Paciente Teste QA"; CPF "123"
  da Ana; foto + endereço/tipo de ferida no tratamento "lesão por diabetes" da Ana.

---

## Verificação manual (não coberta pela automação do dogfood)

- ISSUE-017 (possível): usar o app normalmente por 20–30 min e ver se cai pra /login sozinho.
  (No teste caiu 2x, mas eu estava com 2 sessões de navegador simultâneas — inconclusivo.)
- Fluxo de assinatura ponta a ponta com o dedo/mouse de verdade (o pad não é dirigível pela
  automação): abrir link público `/assinar/<token>`, desenhar, confirmar, e conferir que o PDF
  salvo tem a assinatura desenhada e a data/hora corretas.
