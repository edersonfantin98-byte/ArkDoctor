-- Remove a funcionalidade de fotos de evolução dos tratamentos:
-- tabela treatment_photos + bucket privado treatment-photos (objetos + policy).
-- O código que lia isso saiu no commit "feat(tratamentos): remove fotos de evolução da ferida".
--
-- ATENÇÃO: o `delete from storage.objects` abaixo remove só o índice de
-- metadados — NÃO apaga os arquivos binários no backend de Storage. Antes de
-- aplicar esta migração (em dev e em prod), esvaziar o bucket `treatment-photos`
-- pela Storage API / Dashboard (Storage > treatment-photos > esvaziar), senão
-- os blobs ficam órfãos e sem bucket para navegar até eles.

drop table if exists treatment_photos;

drop policy if exists "account members manage treatment photo objects" on storage.objects;

delete from storage.objects where bucket_id = 'treatment-photos';

delete from storage.buckets where id = 'treatment-photos';
