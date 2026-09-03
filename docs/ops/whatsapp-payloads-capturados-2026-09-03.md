# Payloads Uazapi capturados ao vivo — 2026-09-03

Validação feita contra a instância conectada na hora (subdomain `arkscrapper`,
telefone dono `556696746676`, account_id `3a67b239-5d64-4eea-bc01-32c11afd55bc`).
Fonte das fixtures dos Planos 2a / 2b / 3. Comandos usados: `docs/ops/whatsapp-validacao-payloads-uazapi.md`.

> A instância (subdomain/token) é **dinâmica** — muda conforme o telefone conectado.
> O código lê de `whatsapp_connections.config` (`subdomain`, `token`), nunca de constante.

---

## 1. `GET /instance/status`
```json
{"instance":{"status":"connected","owner":"556696746676", ...},
 "status":{"connected":true,"jid":"556696746676:12@s.whatsapp.net","loggedIn":true,"resetting":false}}
```
Usar `status.connected` (bool).

## 2. `POST /chat/find` — body `{"sort":"-wa_lastMsgTimestamp","limit":N,"offset":0,"wa_isGroup":false}`
Envelope: `{"chats":[...], "pagination":{"limit":5,"offset":0,"totalRecords":29}, "totalChatsStats":{...}}`

| campo | exemplo | nota |
|---|---|---|
| `id` | `ra9c738f87b6727` | id interno Uazapi — **NÃO** serve p/ `/message/find` |
| `wa_chatid` | `556696604575@s.whatsapp.net` | **este** é o `chatid` do `/message/find` |
| `wa_chatlid` | `257208528953502@lid` | |
| `phone` | `+55 66 9660-4575` | formatado c/ espaços |
| `wa_isGroup` | `false` | filtro `{"wa_isGroup":false}` funciona no body |
| `wa_lastMsgTimestamp` | `1788445013000` | epoch **ms** |
| `wa_contactName`/`wa_name`/`name`/`lead_name` | `Ederson Fernandes` | `lead_name` costuma vazio |
| `wa_unreadCount` | `15` | |
| `wa_archived` | `true` | |
| `wa_lastMessageType` | `Conversation` | + `ExtendedTextMessage`, `TemplateMessage`, `ImageMessage`, `AudioMessage`, `VideoMessage`, `DocumentMessage`, `UnknownMessageType`, `""` |

## 3. `POST /message/find` — body `{"chatid":"<wa_chatid JID>","limit":N}` (offset via `nextOffset`)
Envelope: `{"hasMore":true,"limit":8,"messages":[...],"nextOffset":6,"offset":0,"returnedMessages":6}`

### Campos comuns a toda mensagem
| campo | nota |
|---|---|
| `fromMe` | bool → direção (`true`=outbound) |
| `id` | `556696746676:3AFC432F36B07600E616` = `owner:messageid` |
| `messageid` | `3AFC432F36B07600E616` — vai no `/message/download` |
| `messageTimestamp` | epoch **ms** |
| `messageType` | `Conversation`\|`ExtendedTextMessage`\|`ImageMessage`\|`AudioMessage`\|`VideoMessage`\|`DocumentMessage` |
| `text` | texto puro OU legenda da mídia (`""` quando sem legenda) |
| `content` | objeto; `content.text` no texto, campos de mídia na mídia |
| `sender` | `257208528953502@lid` — sempre `@lid` |
| `sender_lid` | presente nas msgs de mídia |
| `sender_pn` | `556696604575@s.whatsapp.net` — telefone real; presente nas msgs de mídia |
| `senderName` | `Ederson Fernandes` |
| `chatid` | JID da conversa |
| `fileURL` | `""` no payload bruto; preenche só depois do `/message/download` |
| `wasSentByApi` | `true` nas enviadas pela API (o webhook exclui essas) |

> Direção do remetente: nas msgs antigas de texto **não vinha `sender_pn`**, só `sender` (`@lid`).
> Nas de mídia vem `sender_pn`. Regra: `sender_pn` → `chatid` (1:1) → `sender`.

### `content` por tipo (recortes reais)

**ImageMessage** (legenda "Ola amigo"):
```
content: { mimetype:"image/jpeg", caption:"Ola amigo",
           URL:"https://mmg.whatsapp.net/o1/v/t24/...?...mms3=true", directPath,
           fileLength:125831, fileSHA256, fileEncSHA256, mediaKey, mediaKeyTimestamp,
           height:1600, width:738, JPEGThumbnail:"<base64>", scanLengths:[...] }
text (top-level): "Ola amigo"
```
sem `fileName`.

**AudioMessage** (nota de voz, 4s):
```
content: { mimetype:"audio/ogg; codecs=opus", PTT:true,
           URL:"https://mmg.whatsapp.net/v/t62.7117-24/...enc?...mms3=true", directPath,
           fileLength:11705, seconds:4, waveform:"<base64>", streamingSidecar,
           fileSHA256, fileEncSHA256, mediaKey, mediaKeyTimestamp }
text: ""
```

**VideoMessage** (9s):
```
content: { mimetype:"video/mp4", URL:"https://mmg.whatsapp.net/v/t62.7161-24/...enc?...mms3=true",
           directPath, fileLength:1569704, seconds:9, height:848, width:480,
           JPEGThumbnail:"<base64>", streamingSidecar, mediaKey, mediaKeyTimestamp, fileSHA256, fileEncSHA256 }
text: ""
```

**DocumentMessage** (PDF, 43 págs):
```
content: { mimetype:"application/pdf",
           fileName:"1004239-53.2025.8.11.0040-1764016747432-15474-processo.pdf",
           title:"1004239-...processo",
           URL:"https://mmg.whatsapp.net/v/t62.7119-24/...enc?...mms3=true", directPath,
           fileLength:2413752, pageCount:43, JPEGThumbnail, mediaKey, mediaKeyTimestamp, fileSHA256, fileEncSHA256 }
text: ""
```

- `content.URL` é URL **criptografada** do WhatsApp (`.enc`) — **não dá GET direto**. Usar `/message/download`.
- `content.fileLength` dá o tamanho **antes** de baixar → checagem de 16 MB sem download.

## 4. `POST /message/download` — body `{"id":"<messageid>"}` (aceita curto ou `owner:messageid`)
```json
{"fileURL":"https://arkscrapper.uazapi.com/files/<sha256>.<ext>", "mimetype":"image/jpeg", "transcription":"Ola amigo"}
```
- Uazapi descriptografa e **hospeda** o arquivo em `https://<subdomain>.uazapi.com/files/<sha>.<ext>`.
- 2ª chamada devolve `"cached":true`.
- `transcription`: veio a legenda na imagem; **não veio** no áudio (pode ser assíncrono/desligado).
- Áudio volta **transcodificado** `audio/ogg;opus` → `audio/mpeg` (`.mp3`). Vídeo → `.mp4`, PDF → `.pdf`.

### `GET https://arkscrapper.uazapi.com/files/<sha>.jpg` — **sem token**, HTTP 200
```
content-type: image/jpeg
content-length: 125831        # bate com content.fileLength
accept-ranges: bytes
```
→ Fluxo do app: `/message/download` → GET simples no `fileURL` (sem auth) → sobe no bucket.

## 5. `POST /send/media` — ❌ NÃO validado (bloqueado; ação de saída). Plano 2b.
Doc sugere `{"number","type":"image|document|audio|video","file":"<url|base64>","text":"<caption>","docName":"<nome>"}` — **confirmar campos e resposta**.

## 6. Payload de mídia no **webhook** — ❌ NÃO capturado
`/message/find` é boa aproximação (mesmo recurso "message"). Falta confirmar o envelope
`{EventType:"messages", message:{...}}` e se o `message` do webhook traz os mesmos `content.*` e `sender_pn`.
Confirmar no Step 1 da Task 4 do Plano 2a (webhook.site temporário).

### ⚠️ Bug latente (tratado no Plano 2a, Task 4)
`parseWebhookPayload` hoje: msg de mídia tem `text:""` (string) → passa no `typeof text === "string"`
e vira mensagem de corpo vazio, em vez de ser reconhecida como mídia.
