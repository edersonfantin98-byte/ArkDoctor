import { NextResponse } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import { createSupabaseWhatsappRepository } from "@/modules/whatsapp/repository.supabase";
import { createSupabaseCrmRepository } from "@/modules/crm/repository.supabase";
import * as whatsapp from "@/modules/whatsapp/service";
import * as crm from "@/modules/crm/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (webhookSecret && request.headers.get("x-webhook-secret") !== webhookSecret) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { accountId } = await params;
  const body = await request.json();

  const fromPhone = typeof body.fromPhone === "string" ? body.fromPhone : null;
  const messageBody = typeof body.body === "string" ? body.body : null;
  if (!fromPhone || !messageBody) {
    return NextResponse.json({ error: "fromPhone e body são obrigatórios" }, { status: 400 });
  }
  const fromName = typeof body.fromName === "string" ? body.fromName : undefined;

  const supabase = createServiceRoleSupabaseClient();
  const whatsappRepo = createSupabaseWhatsappRepository(supabase);
  const crmRepo = createSupabaseCrmRepository(supabase);

  const message = await whatsapp.handleInboundMessage(
    whatsappRepo,
    {
      findContactByPhone: (accId, phone) => crm.findContactByPhone(crmRepo, accId, phone),
      createContact: (accId, input) => crm.createContact(crmRepo, accId, input),
    },
    accountId,
    { fromPhone, fromName, body: messageBody },
  );

  return NextResponse.json({ ok: true, messageId: message.id });
}
