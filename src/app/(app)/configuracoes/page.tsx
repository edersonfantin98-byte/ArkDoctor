import { PageHeader } from "@/components/layout/page-header";
import { SettingsClient } from "@/components/settings/settings-client";
import { getClinicSettingsAction } from "./actions";

export default async function ConfiguracoesPage() {
  const settings = await getClinicSettingsAction();
  return (
    <div>
      <PageHeader
        title="Configurações"
        description="Identidade profissional."
      />
      <SettingsClient initial={settings} />
    </div>
  );
}
