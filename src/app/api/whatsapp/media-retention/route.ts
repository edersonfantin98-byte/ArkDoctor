import { NextResponse } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import { createSupabaseWhatsappRepository } from "@/modules/whatsapp/repository.supabase";
import { createSupabaseWhatsappMediaStorage } from "@/modules/whatsapp/storage";
import * as whatsapp from "@/modules/whatsapp/service";

export async function POST(request: Request) {
  const provided = request.headers.get("x-cron-secret");
  const expected = process.env.MEDIA_RETENTION_SECRET;
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const supabase = createServiceRoleSupabaseClient();
  const repo = createSupabaseWhatsappRepository(supabase);
  const storage = createSupabaseWhatsappMediaStorage(supabase);

  const result = await whatsapp.runMediaRetention(repo, storage, new Date().toISOString());
  console.log("[whatsapp] retenção de mídia:", result);
  return NextResponse.json({ ok: true, ...result });
}
