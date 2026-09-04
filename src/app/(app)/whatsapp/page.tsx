import { listConversationsAction } from "./actions";
import { WhatsappClient } from "@/components/whatsapp/whatsapp-client";
import { PageHeader } from "@/components/layout/page-header";

export default async function WhatsappPage() {
  const conversations = await listConversationsAction();

  return (
    <div>
      <PageHeader
        title="Inbox"
        eyebrow="Atendimento"
        description="Conversas com pacientes pelo WhatsApp."
      />
      <WhatsappClient initialConversations={conversations} />
    </div>
  );
}
