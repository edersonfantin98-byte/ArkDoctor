import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import { getAccountProfessionalIdentity } from "@/lib/supabase/account";
import { verifyConsentToken } from "@/modules/consents/token";
import type { ConsentKind } from "@/modules/consents/schemas";
import { renderTemplate, formatBrDate } from "@/modules/consents/templates";
import { PublicConsentForm } from "@/components/consents/public-consent-form";

function Invalid() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <p className="max-w-sm text-center text-muted-foreground">
        Este link expirou ou é inválido. Peça um novo à clínica.
      </p>
    </div>
  );
}

type Identity = Awaited<ReturnType<typeof getAccountProfessionalIdentity>>;

// Toda falha (token inválido, contato ausente, erro de query) devolve null — a
// page nunca revela se o token existiu. / Any failure returns null so the page
// never leaks whether the token existed.
async function loadPage(
  token: string,
): Promise<{ kind: ConsentKind; patientName: string; identity: Identity } | null> {
  const claims = await verifyConsentToken(token);
  if (!claims) return null;

  const supabase = createServiceRoleSupabaseClient();
  try {
    const { data, error } = await supabase
      .from("contacts")
      .select("name")
      .eq("id", claims.contactId)
      .eq("account_id", claims.accountId)
      .single();
    if (error || !data) return null;
    const identity = await getAccountProfessionalIdentity(supabase, claims.accountId);
    return { kind: claims.kind, patientName: data.name, identity };
  } catch {
    return null;
  }
}

export default async function PublicConsentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const loaded = await loadPage(token);
  if (!loaded) return <Invalid />;

  const { kind, patientName, identity } = loaded;

  const t = renderTemplate(kind, {
    pacienteNome: patientName,
    pacienteCpf: null,
    pacienteNascimento: null,
    clinicaNome: identity.name,
    profissionalNome: identity.professionalName,
    profissionalConselho: identity.councilId,
    data: formatBrDate(new Date()),
  });

  const headerLines = [
    identity.name,
    identity.professionalName
      ? `${identity.professionalName}${identity.councilId ? ` - ${identity.councilId}` : ""}`
      : null,
    `Paciente: ${patientName}`,
  ].filter((l): l is string => Boolean(l));

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-xl font-bold">{t.title}</h1>
      <PublicConsentForm
        token={token}
        documentTitle={t.title}
        headerLines={headerLines}
        paragraphs={t.paragraphs}
        defaultSignerName={patientName}
      />
    </div>
  );
}
