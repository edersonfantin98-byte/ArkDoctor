# Backup do banco de dados

Guia rápido: o que é, onde está, e como restaurar se precisar.

## Resumo

Todo domingo, um robô (GitHub Actions) copia todo o banco de dados, tranca a
cópia com uma senha e guarda na nuvem (Cloudflare R2). Isso acontece sozinho,
sem ninguém precisar fazer nada.

- **Frequência:** toda semana (domingo, 00h horário de Brasília)
- **Onde fica salvo:** Cloudflare R2, bucket `arkdoctor-backups`
- **Quanto tempo fica guardado:** últimos 12 backups (~3 meses); os mais
  antigos são apagados automaticamente
- **Arquivo de configuração:** `.github/workflows/backup.yml`

## Passo 1 — Baixar o backup

1. Entre em [dash.cloudflare.com](https://dash.cloudflare.com).
2. Vá em **R2 Object Storage** → bucket `arkdoctor-backups`.
3. Escolha o backup pela data no nome do arquivo, ex: `backup-2026-09-14.sql.enc`
   (o mais recente = a data mais alta).
4. Clique no arquivo → **Download**.

## Passo 2 — Abrir a "senha" e a "conexão"

Você vai precisar de 2 informações guardadas nos **GitHub Secrets**
(`github.com/edersonfantin98-byte/ArkDoctor` → Settings → Secrets and
variables → Actions):

| O que é | Nome do secret | Pra que serve |
|---|---|---|
| Senha de criptografia | `BACKUP_ENCRYPTION_PASSPHRASE` | Destrancar o arquivo `.enc` |
| Conexão com o banco | `SUPABASE_DB_URL` | Restaurar os dados no Supabase |

⚠️ O GitHub não deixa você **ver** o valor de um secret depois de salvo, só
substituir. Por isso essas duas informações também devem estar guardadas em
outro lugar seu (gerenciador de senhas, anotação física, etc.) — sem elas,
o backup vira um arquivo trancado que ninguém mais abre.

## Passo 3 — Descriptografar o arquivo

Abra um terminal (PowerShell) na pasta onde baixou o arquivo e rode:

```powershell
openssl enc -aes-256-cbc -pbkdf2 -d `
  -in backup-2026-09-14.sql.enc -out backup-2026-09-14.sql `
  -pass pass:"COLE_A_SENHA_DE_CRIPTOGRAFIA_AQUI"
```

Troque `backup-2026-09-14.sql.enc` pelo nome real do arquivo baixado, e cole
a senha do secret `BACKUP_ENCRYPTION_PASSPHRASE` no lugar indicado.

Se der certo, aparece um arquivo novo `backup-2026-09-14.sql` na mesma pasta
— esse é o backup "destrancado", em texto puro.

## Passo 4 — Restaurar no banco

O Supabase usa Postgres versão 17. Restaurar com uma ferramenta de versão
diferente pode dar erro, então o jeito mais simples e seguro é usar Docker
(não precisa instalar nada além do Docker Desktop):

```powershell
docker run --rm -v "${PWD}:/backup" postgres:17 `
  psql "COLE_A_CONNECTION_STRING_AQUI" -f /backup/backup-2026-09-14.sql
```

Cole a connection string do secret `SUPABASE_DB_URL` no lugar indicado.

⚠️ **Cuidado:** isso executa os comandos do backup direto no banco de
destino. Se o banco já tiver dados, pode dar conflito (registros
duplicados). Antes de restaurar contra o banco **em produção**, pare e peça
ajuda — o ideal é restaurar num projeto Supabase novo e vazio, ou confirmar
com calma o que precisa ser feito.

## Passo 5 — Limpar o rastro

O arquivo `.sql` do Passo 3 fica com dados reais de pacientes sem proteção
nenhuma. Depois de usar, apague ele do computador:

```powershell
Remove-Item backup-2026-09-14.sql
```

(pode manter o `.enc` original, que continua trancado e seguro)

## Rodar o backup manualmente (fora do domingo)

Não precisa esperar a semana passar pra ter um backup novo:

1. `github.com/edersonfantin98-byte/ArkDoctor` → aba **Actions**
2. Clique em **"Backup semanal do banco"** na lista da esquerda
3. Botão **Run workflow** → confirmar
4. Espera ficar verde (sucesso) — o arquivo novo aparece no R2 em seguida

## Configuração (referência — já feita, não precisa repetir)

Secrets cadastrados em Settings → Secrets and variables → Actions:

- `SUPABASE_DB_URL` — connection string do **Session pooler** do Supabase
  (Connect → Connection string → Session pooler), com a senha do banco já
  preenchida no lugar de `[YOUR-PASSWORD]`.
- `BACKUP_ENCRYPTION_PASSPHRASE` — senha forte usada para criptografar os dumps.
- `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` — token de API do bucket R2
  (Cloudflare → R2 → Manage API Tokens → Account API Token → Object Read & Write).
- `R2_ACCOUNT_ID` — ID da conta Cloudflare.
- `R2_BUCKET_NAME` — nome do bucket (`arkdoctor-backups`).
