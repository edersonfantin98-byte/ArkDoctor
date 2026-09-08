-- Remove a funcionalidade de fotos de evolução dos tratamentos:
-- tabela treatment_photos + bucket privado treatment-photos (objetos + policy).
-- O código que lia isso saiu no commit "feat(tratamentos): remove fotos de evolução da ferida".

drop table if exists treatment_photos;

drop policy if exists "account members manage treatment photo objects" on storage.objects;

delete from storage.objects where bucket_id = 'treatment-photos';

delete from storage.buckets where id = 'treatment-photos';
