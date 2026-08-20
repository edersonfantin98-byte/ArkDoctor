# ArkDoctor — Design Doc

Status: em construção (brainstorming em andamento)
Última atualização: 2026-08-20

## Visão Geral

ArkDoctor é um sistema centralizado de gestão para profissionais de saúde autônomos (enfermeira inicialmente, expansível para médicos/clínicas de pequenos serviços), unificando **CRM/Pipeline**, **Agendamento**, **Financeiro** e **WhatsApp** em um único lugar.

**Problema**: falta de organização — ferramentas espalhadas, sem centralização, dificultando a rotina.

**Uso inicial**: solo (uma única profissional), mas o modelo de dados é preparado para multiusuário futuro (dados vinculados a uma entidade "Conta/Clínica", não ao usuário individual).

## Jornada do cliente (fluxo de referência)

1. Cliente entra em contato via WhatsApp perguntando sobre um procedimento
2. Profissional responde e negocia
3. Agenda um horário (fica registrado no calendário)
4. Atendimento é realizado
5. Cobrança / lançamento financeiro
6. Follow-up / retorno posterior (pós-atendimento)

## Stack Técnica

- **Frontend/Backend**: Next.js (App Router)
- **Deploy**: Cloudflare (Pages, via adapter OpenNext)
- **Banco de dados & Auth**: Supabase (Postgres + Supabase Auth)
- **Integração WhatsApp**: camada de abstração (adapter pattern) suportando:
  - API Oficial (WhatsApp Business Platform) — estável, sem risco de bloqueio, custo por mensagem
  - Não-oficial (ex: Evolution API/Baileys) — sem custo por mensagem, risco de bloqueio do número
  - Provedor configurável por conta, sem acoplar o resto do sistema a um provedor específico

## Ordem de Construção (fases)

1. **CRM/Pipeline** — contatos, funil, follow-up
2. **Agendamento/Calendário** — com bloqueio de horários
3. **Financeiro + Dashboard** — vinculado ao status "concluído" do agendamento
4. **WhatsApp Inbox** — integrado ao CRM (fase mais arriscada tecnicamente, isolada por último)

Racional: cada fase entrega valor sozinha; WhatsApp fica isolado por ser a peça tecnicamente mais instável (integração externa), e não trava o resto do sistema.

## Modelo de Dados (entidades principais)

- **Account/Clínica**: entidade raiz; todos os dados pertencem a uma conta
- **Contact (Cliente/Lead)**: nome, telefone (WhatsApp), origem, notas; vinculado ao pipeline
- **PipelineStage**: etapas do funil, configurável. Padrão: Novo Lead → Em Negociação → Agendado → Atendido → Follow-up → Perdido
- **Deal/Oportunidade**: instância de um contato dentro do pipeline, associada a um estágio + histórico de movimentação
- **Procedure (Procedimento/Serviço)**: nome, valor padrão, categoria — cadastro fixo, editável
- **Appointment (Agendamento)**: contato, procedimento, data/hora, status (agendado, confirmado, concluído, não compareceu, cancelado), notas/prontuário simples (texto livre), vinculado opcionalmente a um Deal
- **AvailabilityBlock (Bloqueio de Agenda)**: intervalos bloqueados (folga, almoço, etc.)
- **FinancialEntry (Lançamento Financeiro)**: tipo (receita/despesa), valor padrão do procedimento vs. valor efetivamente cobrado (permite desconto), categoria, data, origem (gerado a partir de Appointment concluído — sugerido, não automático — ou lançamento manual de despesa)
- **Conversation/Message (WhatsApp)**: thread de mensagens vinculada a um Contact, histórico sincronizado via adapter

## Funcionalidades por Módulo

### 1. CRM/Pipeline
- Cadastro de contatos (nome, telefone, origem, notas gerais)
- Pipeline visual (kanban), estágios configuráveis
- Histórico de movimentação entre estágios
- Busca/filtro de contatos

### 2. Agendamento/Calendário
- Visualização em calendário (dia/semana/mês)
- Criar/editar/cancelar agendamento (contato + procedimento + data/hora)
- Bloqueio de horários (indisponibilidade)
- Status do agendamento (agendado, confirmado, concluído, não compareceu, cancelado)
- Notas por atendimento (prontuário simples)

### 3. Financeiro + Dashboard
- Cadastro de procedimentos (nome, valor padrão, categoria)
- Lançamento de receita: ao marcar Appointment como "concluído", sistema sugere/pré-preenche lançamento com valor do procedimento; profissional confirma/edita antes de virar receita de fato (evita lançar dinheiro de quem não compareceu)
- Lançamento manual de despesas
- Dashboard: receita do período vs. período anterior, procedimento mais vendido, taxa de cancelamento/no-show, ticket médio
- Fora de escopo (por ora): métricas de clientes recorrentes vs. novos

### 4. WhatsApp Inbox
- Conexão via adapter (oficial ou não-oficial, configurável por conta)
- Inbox completo de conversas vinculado a Contact (ler/enviar mensagens dentro do sistema)
- Nova conversa de número desconhecido cria automaticamente novo Contact/Lead no pipeline

## Casos de Borda / Tratamento de Erros

- **Falha na conexão WhatsApp** (provedor cair ou número bloqueado): resto do sistema (CRM/Agenda/Financeiro) continua funcional; inbox mostra estado "desconectado" com opção de reconectar
- **Conflito de horário**: sistema impede criar agendamento sobre horário já ocupado ou bloqueado
- **Edição de valor no lançamento financeiro**: histórico preserva valor padrão do procedimento vs. valor efetivamente cobrado (permite dashboard de descontos concedidos)
- **Agendamento sem conclusão marcada**: não gera lançamento financeiro nem entra nas métricas de receita; pode aparecer como pendência no dashboard

## Decisões de Teste

- Testar comportamento externo (ex: "ao marcar agendamento como concluído, gera lançamento financeiro sugerido com valor correto"), não detalhes de implementação
- Módulos críticos para cobertura: cálculo do dashboard (agregações financeiras), transições de status do agendamento, geração de FinancialEntry
- Adapter do WhatsApp deve ser testável isoladamente (mock do provedor)

## Referência de Mercado

Pesquisa em sistemas similares (Feegow Clinic, Trinks, iClinic, GestãoDS) confirmou:
- Confirmação/lembrete automático via WhatsApp é padrão de mercado (reduz faltas em até 40%) — não é MVP aqui, mas é evolução natural futura
- Financeiro vinculado ao agendamento (não solto) é padrão
- Prontuário/anotações por atendimento é comum mesmo em negócios de pequenos serviços — por isso incluído como campo simples de notas no MVP

## Decisões em Aberto / Pendentes

- (nenhuma no momento — todas as decisões técnicas principais foram fechadas)

## Fora de Escopo (MVP)

- Lembretes/confirmações automáticas via WhatsApp (só inbox manual no MVP)
- App mobile nativo (web responsivo cobre celular + desktop)
- Métricas de clientes recorrentes vs. novos no dashboard
- Multiusuário/permissões (modelo de dados preparado, mas não implementado no MVP)
- Prontuário eletrônico completo (só notas simples de texto por atendimento)
