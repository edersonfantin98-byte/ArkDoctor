import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const BUCKET = "whatsapp-media";

export interface WhatsappMediaStorage {
  upload(path: string, bytes: Uint8Array, mime: string): Promise<void>;
  createSignedUrls(paths: string[], ttlSeconds: number): Promise<(string | null)[]>;
  remove(paths: string[]): Promise<void>;
}

export function createSupabaseWhatsappMediaStorage(
  supabase: SupabaseClient<Database>,
): WhatsappMediaStorage {
  return {
    async upload(path, bytes, mime) {
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: mime, upsert: true });
      if (error) throw new Error(`Falha ao subir mídia no storage: ${error.message}`);
    },
    async createSignedUrls(paths, ttlSeconds) {
      if (paths.length === 0) return [];
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(paths, ttlSeconds);
      if (error) throw new Error("Não foi possível gerar as URLs da mídia.");
      return data.map((d) => d.signedUrl ?? null);
    },
    async remove(paths) {
      if (paths.length === 0) return;
      const { error } = await supabase.storage.from(BUCKET).remove(paths);
      if (error) throw new Error(`Falha ao remover mídia do storage: ${error.message}`);
    },
  };
}
