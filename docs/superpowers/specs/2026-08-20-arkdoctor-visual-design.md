# ArkDoctor — Design System (Fundação Visual)

Status: aprovado como base inicial — sujeito a ajustes conforme a implementação avança
Última atualização: 2026-08-22

## Origem

Este design system herda o DNA visual de dois produtos irmãos já em produção — **ArkGestor** (gestão comercial) e **Arkatálogo** (catálogo de peças) — para manter consistência de marca entre os produtos "Ark" e reaproveitar um sistema de cores/componentes já validado. Estrutura de telas e fluxos do ArkDoctor são definidos à parte (ver `docs/prd/arkdoctor-prd.md` e `docs/superpowers/specs/2026-08-20-arkdoctor-design.md`) — este documento cobre **apenas** a camada visual: cor, tipografia, espaçamento, componentes.

## Stack de UI

- **Tailwind CSS** para estilização
- **shadcn/ui** como base de componentes (Button, Card, Badge, Tabs, Sheet, etc.)
- **lucide-react** para ícones
- **Recharts** para gráficos do dashboard financeiro

## Paleta de Cores

### Marca

| Papel | Valor | Uso |
|---|---|---|
| Primária (laranja) | `#FF7900` | item de menu ativo, eyebrow de cabeçalho, botões de ação primária, foco de inputs, ícones de destaque |
| Primária suave | `primary/10` (opacidade) | fundos de faixas de aviso/destaque |

### Neutras

| Papel | Valor | Uso |
|---|---|---|
| Foreground / cinza-escuro | `oklch(0.213 0 0)` ≈ `#191919` | fundo da sidebar inteira, texto principal |
| Background da página | `#efefef` | fundo atrás dos cards |
| Card / superfície | branco `oklch(1 0 0)` | cards, tabelas, modais |
| Muted foreground | cinza médio `oklch(0.551 0.027 264.364)` | texto secundário, descrições |
| Border | cinza clarinho `oklch(0.928 0.006 264.531)` | divisórias entre blocos, linhas de tabela |

Sem dark mode no MVP.

### Semânticas (padrão "pastel de fundo + saturado de texto")

Cada estado usa um par: fundo pastel (~10% opacidade da cor) + texto/ícone na cor saturada. Aplicado a badges, chips de ícone e faixas de destaque.

| Estado | Cor | Onde aparece no ArkDoctor |
|---|---|---|
| Positivo | verde | receita, atendimento concluído, agendamento confirmado, contato "conectado" |
| Negativo | vermelho | despesa, cancelado, não compareceu, WhatsApp desconectado — reservado só para esses casos, nunca decorativo |
| Pendente/atenção | âmbar/amarelo | estágio "Follow-up", agendamento sem status definido após a hora prevista |
| Neutro | cinza | estágio "Perdido", indisponível, rascunho |
| Acento pontual | azul `≈ #1D4ED8` | estágio "Agendado" no pipeline, uso reservado — não vira fundo grande |
| WhatsApp | verde `#25D366` | exclusivo do módulo de inbox, fora da paleta do tema |
| Destrutivo | vermelho padrão shadcn | apenas ações de exclusão (excluir contato, excluir procedimento) |

Regra geral: paleta enxuta por princípio — laranja + cinza/preto + branco compõem a UI; azul e vermelho são pontuais; verde-WhatsApp é isolado ao seu módulo.

## Tipografia

- **Fonte**: Inter (ou Geist Sans, mesma família funcional dos produtos irmãos) em títulos, corpo, menus e botões.
- **Fonte mono**: reservada a três usos recorrentes, sempre uppercase + tracking largo quando é rótulo:
  - eyebrow do cabeçalho de página
  - label de grupo do menu lateral
  - códigos/IDs em tabelas (sem uppercase/tracking nesse caso — é dado, não rótulo)

### Escala de tamanhos

| Uso | Tamanho | Peso | Observação |
|---|---|---|---|
| Label uppercase (eyebrow, grupo de menu) | 10px (`0.625rem`–`0.6875rem`) | bold | uppercase, `tracking-[0.18em]` a `tracking-[0.2em]`, cor apagada ou laranja |
| Texto secundário / descrição | 12–14px | regular | `text-muted-foreground` |
| Corpo padrão | 14px | regular | texto de tabela, formulários |
| Título de card/seção | 16–18px | semibold | |
| Título de página | 24px (`text-2xl`) | bold | `tracking-tight` |
| Valor de métrica/dashboard | 28–34px | bold | números grandes de KPI |

## Bordas e Raios

| Elemento | Raio |
|---|---|
| Cards, botões, itens de menu | `rounded-lg` (~14px) |
| Inputs, thumbnails, ícones-chip | `rounded-md` (~10px) |
| Avatares, badges, filtros de pílula | `rounded-full` |
| Modais grandes | 20–24px |

## Elevação e Espaçamento

- Sombra sutil (padrão shadcn) somente em cards e modais — sem gradientes, sem bordas grossas.
- Espaçamento generoso entre blocos (`gap-6` entre cabeçalho e card; `gap-1.5` dentro de um bloco de título+descrição).
- Dentro de um card com múltiplas seções (filtros, tabela, paginação), separar por `border-b border-border` internamente em vez de empilhar cards separados.

## Componentes

### Sidebar
Fundo escuro (`bg-foreground`), texto branco. Logo no topo com padding generoso. Grupos com label mono (10px, uppercase, tracking largo, opacidade baixa). Item de menu: `rounded-lg`, ícone 16px + label, `px-3 py-2`. Ativo = fundo laranja sólido + texto branco. Inativo = texto semi-apagado, hover com fundo sutil. Rodapé fixo com avatar + email + botão de sair. Mobile: vira barra superior + drawer lateral (Sheet).

Módulos do ArkDoctor na sidebar (implementação atual, 2026-08-24): grupo "Geral" — Dashboard, Financeiro, Agenda; grupo "Atendimento" — WhatsApp, Pipeline; grupo "Clínica" — Pacientes, Procedimentos, Agendamento. O item "Configurações" (planejado como hub futuro desabilitado) foi removido por não ter nenhuma tela por trás.

### Cabeçalho de página (padrão em toda tela)
Eyebrow mono laranja com tracinho (`h-0.5 w-6 rounded-full bg-primary`) antes do texto → título `text-2xl font-bold tracking-tight` → descrição `text-sm text-muted-foreground`. Ação/botão principal alinhado à direita, mesma linha de base do título.

### Cards e listagens
Card branco, `rounded-lg`, sombra sutil, sem borda pesada. Badges usam `variant="outline"` para categoria/tipo neutro, e o par pastel/saturado para status. Célula de imagem/avatar em `rounded-md` ou `rounded-full` conforme o contexto.

### Pipeline (kanban)
Colunas = estágios do funil. Cards de contato com avatar circular + nome + badge de status pastel (cor conforme tabela semântica acima).

### Agenda/Calendário
Eventos coloridos por status do agendamento: confirmado = azul, concluído = verde, não compareceu/cancelado = vermelho, pendente de status = âmbar. Bloqueios de indisponibilidade em cinza (hachurado ou sólido apagado).

### Financeiro/Dashboard
Cards de métrica: ícone em chip colorido (pastel) + valor grande (28–34px, bold) + comparação textual com período anterior. Gráficos via Recharts usando a mesma paleta semântica.

### WhatsApp Inbox
Indicador de conexão: verde (`#25D366`) = conectado, vermelho = desconectado. Bolhas de conversa fora da paleta de tema principal — módulo visualmente isolado por ser integração externa.

### Tela de login
Split-screen: metade laranja sólida com título de boas-vindas + lista de benefícios (ícone em chip + texto), metade branca com formulário (logo, campos, botão laranja `rounded-full` ou `rounded-lg` conforme padrão de botão primário).

## Ícones

lucide-react em todo o sistema, sempre dentro de um chip colorido (fundo pastel da cor semântica correspondente ao contexto).

## Motion

- Hover: leve `scale` em elementos clicáveis.
- Active: `active:scale-95`.
- Transições: 150–200ms, padrão do Tailwind (`transition-all`).

## DNA Visual — resumo em 6 pontos

1. Laranja `#FF7900` é a única cor de marca — carrega toda a identidade "Ark" entre produtos.
2. Neutro dominante: sidebar escura + fundo de página cinza-claro + cards brancos. Sem dark mode.
3. Semântica de cor é sempre par pastel-fundo + saturado-texto/ícone — nunca cor sólida de fundo grande fora do laranja.
4. Vermelho é reservado — só para negativo real (cancelado, despesa, excluir) e nunca decorativo.
5. Mono só para rótulos/eyebrows/códigos — nunca para corpo de texto.
6. Raio consistente por categoria de elemento (14px cards, 10px inputs/chips, full para pílulas/avatares) — nunca raio arbitrário.

## Decisões em Aberto

- Inter vs. Geist Sans — qualquer uma serve; decidir no momento de configurar o projeto Next.js.
- Ajustes finos de paleta/componentes específicos aos módulos do ArkDoctor (ex: cores exatas de status de agendamento) serão refinados durante a implementação de cada fase.

## Fora de Escopo

- Estrutura de telas, rotas e fluxos (coberto em `docs/superpowers/specs/2026-08-20-arkdoctor-design.md`)
- Dark mode
