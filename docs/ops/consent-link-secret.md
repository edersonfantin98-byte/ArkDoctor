# CONSENT_LINK_SECRET

Segredo HMAC que assina os tokens dos links públicos de assinatura de
consentimento (`/assinar/[token]`). Sem ele configurado em produção, a
rota falha fechada (nenhum link é aceito).

- **Local:** adicionar `CONSENT_LINK_SECRET=<string aleatória longa>` ao
  `.env.local`. Sem isso, `next dev` usa um fallback fixo (não serve para
  produção).
- **Produção (Cloudflare):** Workers & Pages → `arkdoctor` → Settings →
  Variables and Secrets → adicionar `CONSENT_LINK_SECRET` como **Secret**.
  Mesmo procedimento dos demais segredos após a Git integration.
- Gerar um valor: `openssl rand -base64 48`.
- Trocar o segredo invalida todos os links já enviados (aceitável — são de
  vida curta, 48 h).
