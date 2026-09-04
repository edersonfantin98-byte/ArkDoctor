import { PageHeader } from "@/components/layout/page-header";
import { SettingsClient } from "@/components/settings/settings-client";
import { getClinicSettingsAction } from "./actions";

export default async function ConfiguracoesPage() {
  const settings = await getClinicSettingsAction();
  return (
    <div>
      <PageHeader
        eyebrow="Clínica"
        title="Configurações"
        description="Identidade profissional e uso de armazenamento."
      />
      <SettingsClient initial={settings} />
    </div>
  );
}
