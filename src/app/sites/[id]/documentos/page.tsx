import Link from "next/link";
import { redirect } from "next/navigation";

import { RequiredDocumentRulesPanel } from "@/components/viso/required-document-rules-panel";
import { PageHeader } from "@/components/vento/standard/page-header";
import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

async function addRequiredDocumentRuleForSite(formData: FormData) {
  "use server";
  const siteId = asText(formData.get("site_id"));
  const documentTypeId = asText(formData.get("document_type_id"));
  const role = asText(formData.get("role")) || null;

  if (!siteId || !documentTypeId) {
    redirect(`/sites/${siteId}/documentos?error=${encodeURIComponent("Faltan sede o tipo de documento.")}`);
  }

  await requireAppAccess({
    appId: "viso",
    returnTo: `/sites/${siteId}/documentos`,
  });
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { error } = await supabase.from("required_document_rules").insert({
    site_id: siteId,
    role,
    document_type_id: documentTypeId,
    is_required: true,
    active: true,
    display_order: 999,
  });

  if (error) {
    redirect(`/sites/${siteId}/documentos?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/sites/${siteId}/documentos?ok=${encodeURIComponent("Regla de documento requerido añadida.")}`);
}

async function deleteRequiredDocumentRuleForSite(formData: FormData) {
  "use server";
  const id = asText(formData.get("id"));
  const siteId = asText(formData.get("site_id"));

  if (!id || !siteId) return;

  await requireAppAccess({
    appId: "viso",
    returnTo: `/sites/${siteId}/documentos`,
  });
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  await supabase.from("required_document_rules").delete().eq("id", id);

  redirect(`/sites/${siteId}/documentos?ok=${encodeURIComponent("Regla eliminada.")}`);
}

function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

type SiteRow = {
  id: string;
  code: string | null;
  name: string | null;
};

export default async function SiteDocumentosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const okMsg = sp.ok ? safeDecode(sp.ok) : "";
  const errorMsg = sp.error ? safeDecode(sp.error) : "";
  const { id: siteId } = await params;

  const { supabase } = await requireAppAccess({
    appId: "viso",
    returnTo: `/sites/${siteId}/documentos`,
  });

  const { data: siteData, error: siteError } = await supabase
    .from("sites")
    .select("id,code,name")
    .eq("id", siteId)
    .maybeSingle();

  if (siteError || !siteData) {
    redirect("/sites?error=" + encodeURIComponent("Sede no encontrada."));
  }

  const site = siteData as SiteRow;

  let documentTypes: { id: string; name: string | null; system_key: string | null; scope?: string | null }[] = [];
  let requiredRules: {
    id: string;
    site_id: string | null;
    role: string | null;
    document_type_id: string;
    is_required: boolean;
    active: boolean;
    display_order: number;
    document_type: { id: string; name: string | null } | null;
  }[] = [];

  try {
    const [typesRes, rulesRes] = await Promise.all([
      supabase
        .from("document_types")
        .select("id, name, system_key, scope")
        .eq("is_active", true)
        .order("display_order")
        .order("name"),
      supabase
        .from("required_document_rules")
        .select("id, site_id, role, document_type_id, is_required, active, display_order, document_type:document_types(id, name)")
        .or(`site_id.eq.${siteId},site_id.is.null`)
        .order("display_order"),
    ]);
    if (typesRes.data) documentTypes = typesRes.data as typeof documentTypes;
    if (rulesRes.data) requiredRules = rulesRes.data as typeof requiredRules;
  } catch {
    // Tablas pueden no existir
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Documentos requeridos: ${site.name ?? site.code ?? siteId}`}
        subtitle="Define qué documentos debe tener un trabajador de esta sede para ser elegible para el carnet laboral."
        actions={
          <Link href="/sites" className="ui-btn ui-btn--ghost">
            Volver a Sedes
          </Link>
        }
      />

      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}

      <RequiredDocumentRulesPanel
        businessId=""
        siteId={site.id}
        siteName={site.name ?? site.code ?? site.id}
        documentTypes={documentTypes}
        rules={requiredRules}
        addAction={addRequiredDocumentRuleForSite}
        deleteAction={deleteRequiredDocumentRuleForSite}
      />
    </div>
  );
}
