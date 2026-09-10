-- Remove a funcionalidade de fotos de evolução dos tratamentos:
-- tabela treatment_photos + policy do bucket privado treatment-photos.
-- O código que lia isso saiu no commit "feat(tratamentos): remove fotos de evolução da ferida".
--
-- O bucket `treatment-photos` em si é removido FORA daqui, pela Storage API
-- (DELETE /storage/v1/bucket/treatment-photos), porque a plataforma bloqueia
-- deleção direta em storage.objects / storage.buckets via SQL
-- ("Direct deletion from storage tables is not allowed. Use the Storage API instead.").
-- Esvaziar o bucket antes de deletá-lo pela API.

drop table if exists treatment_photos;

drop policy if exists "account members manage treatment photo objects" on storage.objects;
