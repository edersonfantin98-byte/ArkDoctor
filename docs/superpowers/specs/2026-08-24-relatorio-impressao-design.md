# ArkDoctor — Relatório em PDF via Impressão — Design Doc

Status: em design
Última atualização: 2026-08-24

## Contexto

Terceira de três iniciativas solicitadas na sessão de 2026-08-24 (as outras duas — tela de pacientes e autoagendamento público — já têm spec + plano escritos e commitados, ainda não implementados).

**Pedido original:** corrigir a exportação de relatório do Dashboard (`src/components/dashboard/export-report-button.tsx`), que hoje gera um CSV cru (sem BOM, colunas não separam corretamente no Excel).

**Pivotado durante o brainstorming:** a usuária não quer um arquivo Excel/CSV — quer um relatório profissional, detalhado e intuitivo, "tipo um print da tela" (nem todo mundo sabe usar Excel). Como o app roda no Cloudflare Workers (`opennextjs-cloudflare`), geração de PDF no servidor via headless Chrome (Puppeteer e afins) não é viável nesse runtime. A abordagem escolhida é uma tela otimizada para impressão, disparada por `window.print()`, deixando o próprio navegador oferecer "Salvar como PDF" no diálogo de impressão.

## Decisão de Abordagem (confirmada com a usuária)

Reaproveitar a própria tela `/dashboard` — que já tem todo o conteúdo (cards de métricas, gráfico de receita, pipeline por estágio, atendimentos do dia) e já tem um seletor de período funcional (Semana/Mês/Personalizado) — em vez de criar uma rota de relatório separada. O seletor de período existente vira a etapa de "escolher o período antes de gerar" o relatório. Isso evita duplicar busca de dados e layout.

## Mudanças

### 1. CSS de impressão (`src/app/globals.css`)

Hoje não existe nenhuma regra de impressão no projeto. Usar as variantes `print:` do Tailwind v4 (já disponível, sem configuração extra):

- Sidebar (`src/components/layout/sidebar.tsx`, elemento `<aside>`): `print:hidden`.
- Botão de ação no `PageHeader` do Dashboard (o atual `ExportReportButton`) e os controles interativos do seletor de período (botões Semana/Mês/Personalizado, inputs de data, botão "Aplicar" em `PeriodFilter`, dentro de `dashboard-client.tsx`): `print:hidden` — não fazem sentido numa página já impressa, já que o período foi escolhido antes de imprimir.
- Card "Próximos atendimentos" (lista de paciente/procedimento/horário do dia): `print:hidden` — decisão confirmada com a usuária, o relatório não precisa desse nível de detalhe operacional; o espaço é ocupado pelo resumo financeiro (seção 4).
- Cards de métricas e o card de "Pipeline por estágio": `print:break-inside-avoid` para reduzir cortes de card no meio entre páginas.

### 2. Cabeçalho só-de-impressão

Novo elemento, visível apenas na impressão (`hidden print:block`), mostrando:
- Nome da clínica (`accountName`, mesma função `getCurrentAccountName` já usada em `src/app/(app)/layout.tsx`).
- Período do relatório em texto legível (ex: "Semana atual", "Mês atual", ou "01/08/2026 a 24/08/2026" para período customizado) — calculado a partir do estado `preset`/`customFrom`/`customTo` já existente em `DashboardClient`.
- Data/hora de geração (`new Date().toLocaleString("pt-BR")`).

Como `DashboardClient` é quem sabe o período atual, esse cabeçalho é renderizado dentro dele (não em `page.tsx`), recebendo `accountName` como prop vinda de `DashboardPage` (que passa a buscar `accountName` da mesma forma que `AppLayout` já faz).

### 3. Resumo financeiro (só impressão)

Decisão confirmada com a usuária: em vez do detalhe de paciente/procedimento do dia, o relatório traz receita e despesa vindas da tela Financeiro (`src/components/finance/finance-dashboard-client.tsx`), para o mesmo período selecionado.

Descoberta importante: os dados já existem. `getDashboardOverview` (`src/modules/dashboard/service.ts:165`) já chama `deps.finance.getDashboardMetrics(...)` internamente para calcular `revenueTotal`/`revenueChangePct`, e essa chamada real (`finance.getDashboardMetrics` em `src/modules/finance/service.ts`) já retorna `expenseTotal`, `balance` e `revenueExpenseHistory` — só não estão no tipo `DashboardOverview` (`src/modules/dashboard/types.ts`), que descarta esses campos. Não é necessária nenhuma nova busca de dados nem nova query — só expor o que já é calculado.

Mudanças:
- `DashboardOverview` ganha `expenseTotal: number`, `balance: number`, `revenueExpenseHistory: { month: string; revenue: number; expense: number }[]`.
- `DashboardDeps["finance"]["getDashboardMetrics"]` (o tipo do dep em `dashboard/service.ts`) passa a declarar esses 3 campos no retorno (hoje só declara `revenueTotal`/`revenueChangePct`, embora a implementação real já devolva mais).
- `getDashboardOverview` passa esses 3 campos adiante no retorno.
- `DashboardClient` ganha uma seção nova, visível só na impressão (`hidden print:block`), com dois cards (Despesa, Saldo — mesmo estilo dos cards de KPI já existentes) e o gráfico de barras "Receita vs. despesas" (mesmo componente/visual já usado em `finance-dashboard-client.tsx`, com `revenueExpenseHistory`). A tela normal do Dashboard não muda — esses dados só aparecem no relatório impresso.

### 4. Botão de exportação vira botão de impressão

`ExportReportButton` (mesmo arquivo, mesmo nome — o componente continua fazendo a mesma função de "gerar relatório", só muda o mecanismo):
- Remove toda a lógica de montar CSV/Blob.
- `onClick` chama `window.print()`.
- Label muda para "Imprimir relatório" e o ícone (atualmente `Plus`, que nunca fez sentido para exportar) vira `Printer` (lucide-react).
- Não depende mais de `overview` como prop (não monta mais linhas de dados) — pode ser simplificado para não receber props, ou manter a prop por consistência de assinatura; decisão de implementação, não afeta o design.

## Casos de Borda

- Diferenças de renderização de impressão entre navegadores: sem tratamento especial além do que `print:` do Tailwind cobre — alvo são os navegadores comuns (Chrome, Edge, Firefox).
- Gráfico de receita (Recharts/SVG dentro de `ResponsiveContainer`): imprime como SVG normalmente; paginação exata do gráfico entre páginas não é controlada — comportamento padrão do navegador.
- Período sem dados (ex: sem atendimentos hoje, sem histórico de receita): já tratado pelos estados vazios existentes na tela ("Nenhum atendimento hoje.") — nada muda para impressão.
- `accountName` sempre presente (mesma garantia que `AppLayout` já assume hoje) — sem necessidade de fallback.

## Fora de Escopo

- Geração de PDF real no servidor (Puppeteer, `@react-pdf`, etc.) — inviável no runtime Cloudflare Workers do projeto.
- Paginação customizada / controle fino de quebra de página por seção.
- Exportação em outros formatos (Excel, imagem, e-mail).
- Customização do conteúdo do relatório (escolher quais cards aparecem) — o conjunto fixo é: métricas da "Visão geral" (exceto "Próximos atendimentos") + resumo financeiro (Despesa, Saldo, Receita vs. despesas).
- Envio do relatório por e-mail/WhatsApp — só impressão local / salvar como PDF pelo navegador.

## Decisões de Teste

- `getDashboardOverview` (`src/modules/dashboard/service.test.ts`): passa a incluir `expenseTotal`, `balance` e `revenueExpenseHistory` no retorno, repassados sem transformação a partir do mock de `deps.finance.getDashboardMetrics`.

Resto da mudança é CSS + trocar o corpo de uma função de clique por `window.print()` — sem lógica nova testável por Vitest. Verificação é manual: imprimir/pré-visualizar a tela e conferir que a sidebar, os controles e "Próximos atendimentos" somem, que o cabeçalho de impressão e o resumo financeiro aparecem, e que o conteúdo é legível.

## Decisões em Aberto

- Nenhuma.
