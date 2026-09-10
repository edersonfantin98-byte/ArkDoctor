# ArkDoctor — Design Doc

Status: implementado (as 4 fases descritas abaixo estão construídas) + módulos posteriores de Tratamentos/Relatório clínico e Consentimentos assinados; ver `docs/prd/arkdoctor-prd.md` seção "Estado Atual da Implementação" para divergências e gaps
Última atualização: 2026-09-08

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
- **Deploy**: Cloudflare **Workers** (via `@opennextjs/cloudflare`). Desde 2026-08-30 o deploy é **automático no `git push origin main`** pela Git integration da Cloudflare — o `wrangler deploy` manual deixou de ser o caminho normal. As variáveis de ambiente passaram a ser geridas no painel da Cloudflare / `wrangler.toml`, não mais só via CLI.
- **Banco de dados & Auth**: Supabase (Postgres + Supabase Auth)
- **Integração WhatsApp**: camada de abstração (adapter pattern). O `WhatsappProvider` (`src/modules/whatsapp/provider.ts`) é a interface; a factory `getWhatsappProvider` liga hoje só `fake` (testes) e **`uazapi`** (produção — provedor não-oficial, baseado em Baileys, sem custo por mensagem e com risco de bloqueio do número que a usuária assume conscientemente). Existe um `provider.evolution.ts` escrito, mas **não está plugado na factory** — código morto mantido como referência. A API Oficial (WhatsApp Business Platform) segue prevista pelo desenho mas nunca foi implementada.

## Ordem de Construção (fases)

1. **CRM/Pipeline** — contatos, funil, follow-up
2. **Agendamento/Calendário** — com bloqueio de horários
3. **Financeiro + Dashboard** — vinculado ao status "concluído" do agendamento
4. **WhatsApp Inbox** — integrado ao CRM (fase mais arriscada tecnicamente, isolada por último)

Racional: cada fase entrega valor sozinha; WhatsApp fica isolado por ser a peça tecnicamente mais instável (integração externa), e não trava o resto do sistema.

## Modelo de Dados (entidades principais)

- **Account/Clínica**: entidade raiz; todos os dados pertencem a uma conta. Guarda também a identidade profissional (`professional_name`, `professional_council_id`) usada nos relatórios e consentimentos
- **Contact (Cliente/Lead)**: nome, telefone (WhatsApp), origem, notas; vinculado ao pipeline. Estendido com campos clínicos opcionais — e-mail, data de nascimento, CPF, sexo, dados de responsável (migrações 0010 e 0015)
- **PipelineStage**: etapas do funil, configurável. Padrão: Novo Lead → Em Negociação → Agendado → Atendido → Follow-up → Perdido
- **Deal/Oportunidade**: instância de um contato dentro do pipeline, associada a um estágio + histórico de movimentação
- **Procedure (Procedimento/Serviço)**: nome, valor padrão, categoria — cadastro fixo, editável
- **Appointment (Agendamento)**: contato, procedimento, data/hora, status (agendado, confirmado, concluído, não compareceu, cancelado), notas/prontuário simples (texto livre), vinculado opcionalmente a um Deal
- **AvailabilityBlock (Bloqueio de Agenda)**: intervalos bloqueados (folga, almoço, etc.)
- **FinancialEntry (Lançamento Financeiro)**: tipo (receita/despesa), valor padrão do procedimento vs. valor efetivamente cobrado (permite desconto), categoria, data, origem (gerado a partir de Appointment concluído — sugerido, não automático — ou lançamento manual de despesa)
- **Conversation/Message (WhatsApp)**: thread de mensagens vinculada a um Contact, histórico sincronizado via adapter. Mensagens carregam mídia opcional (imagem/áudio/vídeo/documento) guardada em bucket privado `whatsapp-media`, com status `stored`/`too_large`/`expired`; a conversa registra `history_imported_at` quando o histórico foi importado
- **Treatment (Tratamento)**: uma ferida/condição por linha, vinculada a um Contact — tipos de ferida, detalhes, tipo de tratamento, data de início, status (`em_andamento`/`concluido`), data e desfecho de alta (`cicatrizacao`/`alta`/`abandono`/`encaminhamento`), avaliação profissional e percepção do paciente. `Appointment` tem link fraco `treatment_id` (as "sessões" do tratamento). Gera um **relatório clínico** imprimível (`/pacientes/[id]/tratamentos/[treatmentId]/relatorio`). Fotos de evolução chegaram a existir e foram removidas em 2026-09-08 (migração 0017)
- **SignedConsent (Consentimento assinado)**: um PDF assinado por documento, anexado ao Contact — `kind` (`tcle`/`imagem`/`laser`), caminho no bucket privado `signed-consents`, nome do signatário, via de assinatura (`inline` na tela ou `link` público `/assinar/[token]`) e data. PDF montado com `pdf-lib` + assinatura capturada com `signature_pad`

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
- Conexão via adapter (hoje só Uazapi), com pareamento por QR code e aviso quando a conexão cai
- Inbox completo de conversas vinculado a Contact (ler/enviar mensagens dentro do sistema)
- Nova conversa de número desconhecido cria automaticamente novo Contact/Lead no pipeline
- Mídia: recebe e envia imagem/áudio/vídeo/documento; retenção via cron diário que expira mídia guardada há mais de 30 dias (`src/app/api/whatsapp/media-retention/route.ts`)
- Importação de histórico das conversas existentes sob demanda (a partir de um botão na UI após conectar)

### 5. Tratamentos + Relatório clínico
- Cadastro de tratamentos por ferida dentro da ficha do paciente, com avaliação profissional e percepção do paciente
- Agendamentos podem ser vinculados a um tratamento (viram as "sessões")
- Relatório clínico imprimível por tratamento (dados do paciente, do profissional, contagem e lista de sessões, duração)

### 6. Consentimentos
- Termos por paciente (TCLE, uso de imagem, laserterapia), assinados na tela ou por link público enviado ao paciente
- Cada assinatura gera um PDF anexado ao paciente, guardado em bucket privado
- O rótulo de assinatura usa nome e conselho do profissional das Configurações

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

- **Tamanho do Worker**: o bundle passou de 3 MiB, limite do plano Free da Cloudflare, o que bloqueia o deploy automático em produção até a conta ser migrada para o plano Paid. Desenvolvimento e smoke-tests seguem contra Supabase/Uazapi reais localmente.

## Fora de Escopo (MVP)

- Lembretes/confirmações automáticas via WhatsApp (só inbox manual no MVP)
- App mobile nativo (web responsivo cobre celular + desktop)
- Métricas de clientes recorrentes vs. novos no dashboard
- Multiusuário/permissões (modelo de dados preparado, mas não implementado no MVP)
- Prontuário eletrônico completo com campos regulatórios (CID, anexos exigidos por conselho). O módulo de Tratamentos captura dados clínicos estruturados por ferida, mas não é um prontuário regulatório.
