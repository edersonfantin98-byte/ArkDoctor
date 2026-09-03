import { NextResponse } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import { createSupabaseWhatsappRepository } from "@/modules/whatsapp/repository.supabase";
import { createSupabaseCrmRepository } from "@/modules/crm/repository.supabase";
import { createSupabaseWhatsappMediaStorage } from "@/modules/whatsapp/storage";
import { createUazapiProvider } from "@/modules/whatsapp/provider.uazapi";
import * as whatsapp from "@/modules/whatsapp/service";
import * as crm from "@/modules/crm/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  const { accountId } = await params;
  const url = new URL(request.url);
  const providedSecret = url.searchParams.get("secret");

  const supabase = createServiceRoleSupabaseClient();
  const whatsappRepo = createSupabaseWhatsappRepository(supabase);
  const crmRepo = createSupabaseCrmRepository(supabase);

  const connection = await whatsappRepo.getConnection(accountId);
  if (!whatsapp.isValidWebhookSecret(connection, providedSecret)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const rawBody = await request.json();
  const parsed = whatsapp.parseWebhookPayload(rawBody);
  if (!parsed) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const mediaDeps = parsed.media
    ? {
        storage: createSupabaseWhatsappMediaStorage(supabase),
        downloadMedia: (accId: string, providerMessageId: string) =>
          createUazapiProvider(whatsappRepo).downloadMedia(accId, providerMessageId),
      }
    : undefined;

  const message = await whatsapp.handleInboundMessage(
    whatsappRepo,
    {
      findContactByPhone: (accId, phone) => crm.findContactByPhone(crmRepo, accId, phone),
      createContact: (accId, input) => crm.createContact(crmRepo, accId, input),
    },
    accountId,
    parsed,
    mediaDeps,
  );

  return NextResponse.json({ ok: true, messageId: message.id });
}
