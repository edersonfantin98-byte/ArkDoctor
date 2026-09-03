-- Feature: mídia recebida no WhatsApp (imagem, áudio, vídeo, documento).
-- Colunas de mídia em whatsapp_messages + bucket privado whatsapp-media.
-- history_imported_at é usada só pela importação de histórico (Plano 3),
-- criada aqui para não abrir outra migração depois.
-- Espelha o padrão de 0013_signed_consents.sql (bucket privado + RLS por
-- prefixo de account_id no path do objeto).

alter table whatsapp_messages
  add column media_type text
    check (media_type in ('image', 'audio', 'video', 'document')),
  add column media_status text
    check (media_status in ('stored', 'too_large', 'expired')),
  add column media_storage_path text,
  add column media_mime text,
  add column media_filename text;

-- Se tem mídia, tem status. Texto puro deixa os dois nulos.
alter table whatsapp_messages
  add constraint whatsapp_messages_media_status_present
  check (media_type is null or media_status is not null);

-- Usado pelo cron de retenção (Plano 2b): varre só o que está guardado.
create index whatsapp_messages_media_retention_idx
  on whatsapp_messages (sent_at)
  where media_status = 'stored';

alter table whatsapp_conversations
  add column history_imported_at timestamptz;

insert into storage.buckets (id, name, public)
values ('whatsapp-media', 'whatsapp-media', false)
on conflict (id) do nothing;

create policy "account members manage whatsapp media objects"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'whatsapp-media'
    and (storage.foldername(name))[1] in (
      select account_id::text from account_users where user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'whatsapp-media'
    and (storage.foldername(name))[1] in (
      select account_id::text from account_users where user_id = auth.uid()
    )
  );
