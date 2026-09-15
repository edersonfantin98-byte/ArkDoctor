# Backup semanal do banco — como funciona e como restaurar

## Como funciona

Todo domingo às 00h (horário de Brasília), o GitHub Actions (`.github/workflows/backup.yml`) roda sozinho:

1. Conecta no Supabase e gera um dump completo do banco (`pg_dump`).
2. Criptografa o dump com uma senha (AES-256).
3. Sobe o arquivo criptografado pro Cloudflare R2 (bucket configurado nos secrets do repositório).
4. Apaga backups com mais de 12 semanas (~3 meses), mantendo sempre os 12 mais recentes.

Nenhuma ação manual é necessária. Também dá pra rodar manualmente: aba **Actions** do GitHub → workflow "Backup semanal do banco" → **Run workflow**.

## Onde ver os backups

Painel do Cloudflare (dash.cloudflare.com) → **R2** → bucket configurado. Os arquivos ficam nomeados `backup-AAAA-MM-DD.sql.enc`.

## Como restaurar (em caso de desastre)

Você vai precisar: o arquivo `.enc` baixado do R2, a senha de criptografia (`BACKUP_ENCRYPTION_PASSPHRASE`, guardada nos GitHub Secrets) e a connection string do Supabase (`SUPABASE_DB_URL`, também nos GitHub Secrets).

1. **Descriptografar o arquivo:**
   ```bash
   openssl enc -aes-256-cbc -pbkdf2 -d \
     -in backup-2026-09-14.sql.enc -out backup-2026-09-14.sql \
     -pass pass:"SUA_SENHA_AQUI"
   ```

2. **Restaurar no Supabase:**
   ```bash
   psql "SUA_CONNECTION_STRING_AQUI" -f backup-2026-09-14.sql
   ```

   ⚠️ Isso executa os comandos SQL do dump no banco de destino. Se o banco já tiver dados, pode dar conflito (chaves duplicadas). Para um restore "limpo", restaure num projeto Supabase novo/vazio, ou peça ajuda antes de rodar contra o banco de produção.

3. Apague o arquivo `.sql` descriptografado do seu computador depois de usar (ele contém dados de pacientes sem proteção).

## Setup necessário (feito uma vez)

GitHub Secrets configurados em Settings → Secrets and variables → Actions do repositório:

- `SUPABASE_DB_URL` — connection string direta do Postgres (Supabase → Project Settings → Database → Connection string, modo "Session"/direto, porta 5432, com a senha do banco já preenchida).
- `BACKUP_ENCRYPTION_PASSPHRASE` — senha forte gerada para criptografar os dumps.
- `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` — token de API do bucket R2 (Cloudflare → R2 → Manage R2 API Tokens).
- `R2_ACCOUNT_ID` — ID da conta Cloudflare (aparece na URL do painel ou em R2 → Overview).
- `R2_BUCKET_NAME` — nome do bucket criado para os backups.
