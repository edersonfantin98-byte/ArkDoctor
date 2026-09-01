# Importar histórico de conversas do WhatsApp — notas de brainstorm

Status: rascunho — spec formal e plano de implementação ficaram para a próxima sessão.

## Contexto

Depois de corrigir a conexão/recebimento de mensagens da Uazapi (ver commits de 2026-09-01 em `src/modules/whatsapp/`), a usuária pediu para trazer o histórico de conversas que já existia no WhatsApp antes de conectar ao ArkDoctor — hoje só mensagens novas (via webhook) aparecem no sistema.

## Pesquisa feita (confirmada ao vivo contra a instância real `arkscrapper`)

A Uazapi tem os endpoints necessários:

- `POST /chat/find` — lista os chats existentes na instância, com filtros/paginação/ordenação (`sort`, `limit`, `offset`, `wa_isGroup`, etc.). Testado ao vivo: retorna chats reais com `wa_lastMsgTimestamp`, `phone`, `wa_unreadCount`, etc.
- `POST /message/find` — busca mensagens de um chat específico (`chatid`, `limit`, `offset`), ordenadas da mais recente pra mais antiga (padrão 100, ordenável).
- `POST /message/history-sync` — existe também, para pedir ao WhatsApp um sync sob demanda de mensagens mais antigas que o que já está cacheado na Uazapi (mode `history`/`exact`). **Não incluído no escopo desta rodada** — `/chat/find` + `/message/find` já retornam dados reais suficientes sem precisar disso.

## Decisões tomadas no brainstorm (com a usuária)

- **Gatilho:** botão manual "Importar histórico" na tela do WhatsApp (não automático ao conectar) — evita duplicar se conectar/desconectar várias vezes, dá controle sobre quando rodar.
- **Escopo de conversas:** todas as conversas individuais (não-grupo). Quando o telefone não bate com nenhum paciente/lead existente, cria um novo (mesma lógica de auto-criação já usada no fluxo de mensagem recebida ao vivo, em `handleInboundMessage`).
- **Profundidade:** últimas 50 mensagens por conversa (a Uazapi já limita a 100 por chamada por padrão).
- **Só texto** — mídia (imagem, áudio, etc.) é ignorada nesta rodada, mesma limitação que já existe hoje no resto do app.
- **Teto por execução:** até 200 conversas por clique (deve cobrir o uso normal de uma clínica pequena; sem paginação de chats além disso nesta rodada).

## Decisão técnica meta meu (a validar/formalizar na spec)

- **Idempotência:** nova coluna `history_imported_at` (timestamptz, nullable) em `whatsapp_conversations`. Ao importar, pula qualquer conversa já marcada. Isso resolve dois problemas ao mesmo tempo:
  - Clicar no botão de novo não duplica mensagens.
  - Se a execução não terminar a tempo (risco real: Cloudflare Workers tem limite de CPU/tempo por request, e isso é uma Server Action síncrona fazendo várias chamadas de rede sequenciais), clicar de novo continua de onde parou.
- **Erros por conversa não travam a importação inteira** — se uma falhar (rede, etc.), pula e segue as outras; reporta no final quantas deram certo/erro.
- Endpoint `/chat/find` e `/message/find` provavelmente precisam de um novo método no `UazapiProvider` (fora da interface genérica `WhatsappProvider`, mesmo padrão do `getQrCode` já existente) — já que são Uazapi-específicos.
- Mapeamento de mensagem (`fromMe`, texto, timestamp, remetente) deve reaproveisar/alinhar com o parsing já corrigido em `parseWebhookPayload` (`sender_pn` preferencial sobre `sender`, que agora vem como `@lid`).

## Riscos/pontos em aberto para a spec formal

- Confirmar o formato exato do payload de `/message/find` (campos de cada mensagem) contra a API real antes de implementar — mesmo erro que já causou o bug do webhook (suposição não validada) não pode se repetir aqui.
- Definir se o teto de 200 conversas por execução é suficiente ou se precisa de paginação com múltiplos cliques.
- Definir o tratamento de timeout da Server Action no Cloudflare Workers (rodar em background? processar em lotes menores por clique?).

## Próxima sessão

1. Validar o payload real de `/message/find` contra a instância (mesma técnica usada para o bug do webhook: monitor de eventos / chamada direta).
2. Escrever a spec formal em `docs/superpowers/specs/YYYY-MM-DD-whatsapp-historico-import-design.md`.
3. Escrever o plano de implementação (superpowers:writing-plans).
