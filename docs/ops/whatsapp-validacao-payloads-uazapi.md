# Validação dos payloads da Uazapi — pré-requisito dos Planos 2 e 3

Rodar contra a instância real (`arkscrapper.uazapi.com`, conta `silvana@arkdoctor.com`)
**antes** de escrever o código de mapeamento de mídia e de importação de histórico.
Motivo: o bug do webhook de 2026-09-01 foi causado por suposição de payload não
validada. Ver `docs/superpowers/specs/2026-09-03-whatsapp-midia-historico-design.md`.

Os payloads capturados viram fixtures dos testes.

## Setup

```bash
UAZ=https://arkscrapper.uazapi.com
TOKEN='<token da instância>'   # painel Uazapi -> Instância -> token, ou config->>'token' em whatsapp_connections
```

Windows: rodar via `! <comando>` no Claude Code, ou no Git Bash. `curl` já existe
no Windows 10+. `| jq` opcional.

## 1. Confirmar conexão

```bash
curl -s $UAZ/instance/status -H "token: $TOKEN"
```

## 2. `/chat/find` — lista de conversas (Plano 3)

```bash
curl -s -X POST $UAZ/chat/find -H "token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"sort":"-wa_lastMsgTimestamp","limit":5,"offset":0}'

curl -s -X POST $UAZ/chat/find -H "token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"sort":"-wa_lastMsgTimestamp","limit":10,"wa_isGroup":false}'
```

Capturar: envelope da resposta (array direto? `{chats:[...]}`?); nomes exatos dos
campos de id do chat, telefone, flag de grupo, timestamp da última mensagem, nome
do contato.

## 3. `/message/find` — mensagens de uma conversa (Planos 2 e 3)

Usar um `chatid` do passo 2, de preferência uma conversa com imagem/áudio/PDF.

```bash
curl -s -X POST $UAZ/message/find -H "token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"chatid":"<CHATID>","limit":10}'
```

Capturar: um objeto de mensagem de texto completo e um de mídia completo (JSON
inteiros). Campos-chave: `fromMe`, texto/legenda, timestamp, `sender` / `sender_pn`,
tipo da mensagem; na mídia: mimetype, filename, e se vem `url` / `base64` / id para
download.

## 4. Download de mídia recebida (Plano 2)

Depende do passo 3. Se a mensagem de mídia tiver id/chave:

```bash
curl -s -X POST $UAZ/message/download -H "token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"id":"<MESSAGE_ID_DE_MIDIA>"}'
```

Se `/message/download` não existir, anotar o erro e achar o endpoint certo na doc.

## 5. `/send/media` — envio de mídia (Plano 2)

Enviar para o próprio número. Testar os quatro tipos.

```bash
curl -s -X POST $UAZ/send/media -H "token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"number":"<NUMERO_COM_DDI_DDD>","type":"image","file":"https://picsum.photos/400","text":"teste arkdoctor"}'
```

Trocar `type` por `document`, `audio`, `video`. Ajustar nomes de campo
(`file`/`media`/`url`, `text`/`caption`) conforme o erro/doc.

## 6. Payload de mídia no webhook (Plano 2) — o mais importante

Ver o que a Uazapi entrega quando chega mídia. Opções:

- Monitor de Eventos (SSE) no painel: deixar aberto e mandar de outro celular uma
  imagem, um áudio, um PDF e um vídeo. Copiar os 4 eventos `messages`.
- Ou apontar o webhook temporariamente para `https://webhook.site/...`:

  ```bash
  curl -s -X POST $UAZ/webhook -H "token: $TOKEN" -H 'Content-Type: application/json' \
    -d '{"url":"https://webhook.site/SEU-ID","events":["messages"],"enabled":true}'
  ```

  Mandar as 4 mídias, copiar os payloads, e re-registrar a URL real depois
  (o `connect` do app refaz, ou repetir o comando com
  `.../api/whatsapp/webhook/<accountId>?secret=<secret>`).

Guardar os 4 payloads (imagem, áudio, vídeo, documento) — viram fixtures dos
testes de `parseWebhookPayload` no Plano 2.
