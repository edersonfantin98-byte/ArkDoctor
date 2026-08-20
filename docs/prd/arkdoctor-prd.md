# ArkDoctor — PRD

Status: rascunho para revisão
Última atualização: 2026-08-20

## Problem Statement

Profissionais de saúde autônomos que prestam pequenos serviços (iniciando com uma enfermeira, expansível para médicos com clínica própria) hoje gerenciam seu negócio de forma fragmentada: contatos de clientes, agendamentos, controle financeiro e comunicação via WhatsApp ficam espalhados em ferramentas diferentes (ou sem ferramenta nenhuma — papel, memória, planilhas soltas). Essa falta de centralização atrapalha a rotina: é difícil saber quem está no funil de negociação, quando alguém deve retornar (follow-up), quanto foi faturado em determinado período, quais procedimentos são mais rentáveis, e as conversas de WhatsApp com clientes não ficam vinculadas ao histórico do cliente.

## Solution

O ArkDoctor centraliza em um único sistema web (responsivo para celular e desktop) as quatro frentes do negócio:

1. **CRM/Pipeline** — funil visual de clientes/leads, do primeiro contato ao pós-atendimento (follow-up)
2. **Agendamento/Calendário** — visualização e marcação de horários, com bloqueio de indisponibilidade
3. **Financeiro** — registro de receitas (vinculadas a atendimentos concluídos) e despesas, com dashboard comparativo entre períodos e por tipo de procedimento
4. **WhatsApp Inbox** — conversas com clientes acontecem dentro do próprio sistema, vinculadas automaticamente ao contato/pipeline

O sistema é construído para uma única profissional usar sozinha no MVP, mas o modelo de dados já é preparado para expansão futura (múltiplos usuários por conta, outros tipos de profissionais de saúde).

## User Stories

### CRM / Pipeline

1. Como profissional autônoma, quero cadastrar um novo contato (cliente/lead) manualmente, para começar a acompanhá-lo mesmo antes de ele agendar algo.
2. Como profissional autônoma, quero visualizar meus contatos organizados em um funil (pipeline) por estágio, para saber rapidamente em que fase da negociação cada um está.
3. Como profissional autônoma, quero mover um contato de um estágio para outro no pipeline, para refletir o avanço real da negociação.
4. Como profissional autônoma, quero ver o histórico de movimentação de um contato entre estágios, para entender a jornada dele até aqui.
5. Como profissional autônoma, quero um estágio de "Follow-up" no pipeline, para não esquecer de fazer o retorno pós-atendimento.
6. Como profissional autônoma, quero um estágio de "Perdido", para tirar do meu radar ativo contatos que não avançaram, sem apagar o histórico.
7. Como profissional autônoma, quero buscar/filtrar contatos por nome ou telefone, para encontrar rapidamente alguém específico.
8. Como profissional autônoma, quero registrar notas gerais sobre um contato, para lembrar de detalhes relevantes (preferências, histórico de conversas).
9. Como profissional autônoma, quero que uma nova conversa de WhatsApp de um número desconhecido crie automaticamente um novo contato/lead no pipeline, para não perder nenhum lead que chegue por mensagem.
10. Como profissional autônoma, quero configurar os estágios do meu pipeline (renomear, reordenar), para adaptar o funil à minha forma de trabalhar.

### Agendamento / Calendário

11. Como profissional autônoma, quero visualizar minha agenda em formato de calendário (dia, semana, mês), para ter uma visão clara dos meus compromissos.
12. Como profissional autônoma, quero criar um agendamento vinculando um contato, um procedimento e um horário, para marcar um atendimento.
13. Como profissional autônoma, quero editar ou cancelar um agendamento existente, para lidar com mudanças de planos.
14. Como profissional autônoma, quero bloquear intervalos da minha agenda (almoço, folga, indisponibilidade), para que esses horários não fiquem disponíveis para agendamento.
15. Como profissional autônoma, quero que o sistema me impeça de criar um agendamento em um horário já ocupado ou bloqueado, para evitar conflitos de agenda.
16. Como profissional autônoma, quero marcar o status de um agendamento (confirmado, concluído, não compareceu, cancelado), para refletir o que realmente aconteceu.
17. Como profissional autônoma, quero adicionar notas/observações a um atendimento concluído, para registrar o que foi feito ou observações relevantes (prontuário simples).
18. Como profissional autônoma, quero ver de forma destacada os agendamentos que ainda não tiveram status definido após a data/hora prevista, para não esquecer de atualizá-los.

### Financeiro / Dashboard

19. Como profissional autônoma, quero cadastrar meus procedimentos/serviços com um valor padrão, para não precisar digitar o preço toda vez.
20. Como profissional autônoma, quero editar meus procedimentos cadastrados (nome, valor, categoria), para manter a tabela de preços atualizada.
21. Como profissional autônoma, quero que, ao marcar um agendamento como "concluído", o sistema sugira automaticamente um lançamento de receita com o valor do procedimento, para agilizar o registro financeiro.
22. Como profissional autônoma, quero poder editar o valor sugerido de um lançamento de receita antes de confirmá-lo, para aplicar descontos ou ajustes sem distorcer meus dados.
23. Como profissional autônoma, quero registrar despesas manualmente (com categoria e valor), para controlar os custos gerais do meu negócio.
24. Como profissional autônoma, quero ver um dashboard com a receita do período atual comparada ao período anterior, para entender se estou crescendo ou não.
25. Como profissional autônoma, quero ver quais procedimentos mais venderam em um período, para saber onde focar.
26. Como profissional autônoma, quero ver minha taxa de cancelamento/não comparecimento, para entender o impacto disso no meu faturamento.
27. Como profissional autônoma, quero ver meu ticket médio por atendimento, para entender o valor médio que estou cobrando.
28. Como profissional autônoma, quero que agendamentos sem status de conclusão não entrem nas métricas de receita, para que meus números financeiros reflitam apenas o que de fato aconteceu.
29. Como profissional autônoma, quero filtrar o dashboard por período (semana, mês, intervalo customizado), para analisar diferentes janelas de tempo.

### WhatsApp Inbox

30. Como profissional autônoma, quero conectar meu número de WhatsApp ao sistema, para centralizar minhas conversas com clientes.
31. Como profissional autônoma, quero ler e enviar mensagens de WhatsApp diretamente dentro do sistema, para não precisar alternar entre aplicativos.
32. Como profissional autônoma, quero que o histórico de conversas fique vinculado ao contato correspondente, para ter contexto completo ao atender alguém.
33. Como profissional autônoma, quero ser avisada quando a conexão do WhatsApp cair, para saber que preciso reconectar.
34. Como profissional autônoma, quero que o restante do sistema (CRM, agenda, financeiro) continue funcionando normalmente mesmo se o WhatsApp estiver desconectado, para não depender de uma única peça instável.
35. Como administradora do sistema (eu, desenvolvedor), quero escolher entre um provedor oficial ou não-oficial de WhatsApp por configuração, para ter flexibilidade de custo/risco sem reescrever a integração.

### Conta / Acesso

36. Como profissional autônoma, quero fazer login com email e senha fornecidos previamente, para acessar meus dados de forma segura.
37. Como dona do produto (eu, desenvolvedor), quero que todos os dados fiquem vinculados a uma conta/clínica (não a um usuário individual), para permitir expansão futura para múltiplos usuários por conta sem redesenhar o modelo de dados.

## Implementation Decisions

- **Stack**: Next.js (App Router) como framework fullstack; deploy no Cloudflare (Pages, via adapter OpenNext); Supabase como banco de dados (Postgres) e provedor de autenticação (login/senha fornecidos previamente pelo desenvolvedor, sem necessidade de fluxo de cadastro/recuperação de senha self-service no MVP).
- **Modelo de conta**: entidade raiz "Account/Clínica" à qual todos os dados pertencem (Contact, Appointment, FinancialEntry, etc.), em vez de vincular dados diretamente a um usuário individual — isso evita retrabalho de schema quando o produto expandir para múltiplos usuários por conta.
- **Entidades principais**: Account, Contact, PipelineStage, Deal, Procedure, Appointment, AvailabilityBlock, FinancialEntry, Conversation/Message.
- **Pipeline configurável**: estágios padrão (Novo Lead → Em Negociação → Agendado → Atendido → Follow-up → Perdido), mas editáveis pela usuária (renomear/reordenar).
- **Vínculo Agendamento → Financeiro**: NÃO é automático e silencioso. Ao marcar um `Appointment` como "concluído", o sistema pré-preenche uma sugestão de `FinancialEntry` (tipo receita) com o valor padrão do `Procedure` associado; a usuária confirma ou edita o valor antes que o lançamento seja efetivado. Isso evita registrar receita de agendamentos que não se converteram em atendimento real (não comparecimento).
- **Preservação de valor**: `FinancialEntry` guarda tanto o valor padrão do procedimento no momento do lançamento quanto o valor efetivamente cobrado, permitindo análise de descontos concedidos ao longo do tempo.
- **Integração WhatsApp via adapter**: camada de abstração que desacopla o restante do sistema do provedor de mensageria específico. Dois provedores suportados, configuráveis por conta:
  - API Oficial (WhatsApp Business Platform): estável, sem risco de bloqueio, custo por mensagem/conversa.
  - Não-oficial (ex: Evolution API/Baileys, via QR code): sem custo por mensagem, mas viola termos de uso do WhatsApp e carrega risco real de bloqueio do número.
  - A escolha do provedor é uma decisão de configuração por conta, não uma reescrita de código.
- **Resiliência da integração WhatsApp**: falha de conexão do provedor não deve impactar a disponibilidade de CRM, Agenda ou Financeiro — o inbox deve degradar isoladamente (estado "desconectado" com opção de reconexão).
- **Notas/prontuário simples**: campo de texto livre no `Appointment`, sem estrutura clínica formal (sem CID, sem campos regulatórios) — atende ao caso de uso de "pequenos serviços", não de prontuário médico completo.
- **Ordem de construção recomendada** (fases, cada uma entregando valor isoladamente):
  1. CRM/Pipeline
  2. Agendamento/Calendário (com bloqueio de horários)
  3. Financeiro + Dashboard (depende do Agendamento existir)
  4. WhatsApp Inbox (isolado por último por ser a integração externa mais instável)
- **Plataforma**: web responsivo único (sem app nativo no MVP), acessível via navegador em celular e desktop.

## Testing Decisions

- Testes devem validar **comportamento externo observável**, não detalhes internos de implementação (ex.: testar "ao marcar Appointment como concluído, uma FinancialEntry sugerida é criada com o valor correto do Procedure", não a função interna que faz isso).
- Módulos com maior prioridade de cobertura de teste, por concentrarem lógica de negócio crítica:
  - Cálculos de agregação do dashboard (receita por período, comparação entre períodos, ticket médio, taxa de cancelamento).
  - Transições de status do `Appointment` e efeitos colaterais (geração de sugestão de `FinancialEntry`, bloqueio de métricas para agendamentos sem status definido).
  - Validação de conflito de horário/bloqueio de agenda.
- O adapter de WhatsApp deve ser testável isoladamente do provedor real, via mock/fake da interface do adapter — garante que a lógica de vínculo com Contact/Conversation seja testada sem depender de infraestrutura externa instável.
- Sem prior art no próprio repositório ainda (projeto novo); a primeira fase de implementação (CRM/Pipeline) deve estabelecer o padrão de testes a ser seguido pelas fases seguintes.

## Out of Scope

- Lembretes e confirmações automáticas de agendamento via WhatsApp (mensagens automáticas) — MVP cobre apenas inbox manual (ler/enviar); automações ficam para uma fase futura.
- Aplicativo mobile nativo (iOS/Android) — o MVP é web responsivo.
- Métricas de clientes recorrentes vs. novos no dashboard financeiro.
- Multiusuário e controle de permissões — o modelo de dados já é preparado (dados vinculados a Account, não a usuário), mas a funcionalidade de convidar/gerenciar múltiplos usuários não é construída no MVP.
- Prontuário eletrônico completo (campos clínicos estruturados, CID, anexos regulatórios) — apenas um campo de notas em texto livre por atendimento.
- Cadastro público de conta/registro self-service — login e senha são fornecidos manualmente pelo desenvolvedor via Supabase.
- Gestão de convênios/planos de saúde, emissão de guias TISS ou qualquer fluxo de faturamento a convênios — fora do escopo por se tratar de profissional autônoma com pagamento direto do cliente.

## Further Notes

- Pesquisa de mercado (Feegow Clinic, Trinks, iClinic, GestãoDS) confirmou que confirmação/lembrete automático via WhatsApp é prática comum no setor (redução de faltas em até 40%) e financeiro vinculado ao agendamento (não solto) é padrão — validando as decisões centrais deste PRD. Prontuário/anotações por atendimento também é comum mesmo em negócios de pequenos serviços, o que motivou a inclusão do campo de notas simples no MVP (mesmo não sendo solicitado inicialmente).
- A escolha entre provedor oficial e não-oficial de WhatsApp envolve um trade-off real de custo vs. risco de bloqueio do número que a usuária deve validar conscientemente antes de decidir qual usar em produção — o adapter existe justamente para não travar essa decisão de negócio a uma escolha técnica irreversível.
- Publicação em issue tracker: este PRD ainda não foi publicado em um issue tracker (ex: GitHub Issues, Linear) porque o projeto ainda não tem um configurado. Recomenda-se rodar a configuração de tracker/triage antes da fase de implementação, para que este spec possa receber a label `ready-for-agent`.
