import Link from "next/link";

import { PageHeader } from "@/components/vento/standard/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/vento/standard/table";
import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

type SiteRow = {
  id: string;
  code: string | null;
  name: string | null;
  site_type: string | null;
  is_active: boolean | null;
};

type SatelliteRow = {
  id: string;
  site_id: string | null;
};

function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function siteTypeLabel(siteType: string | null) {
  if (!siteType) return "—";
  const labels: Record<string, string> = {
    satellite: "Satélite (Pass)",
    admin: "Administración",
    production_center: "Centro de producción",
  };
  return labels[siteType] ?? siteType;
}

export default async function SitesPage({
  searchParams,
}: {
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const okMsg = sp.ok ? safeDecode(sp.ok) : "";
  const errorMsg = sp.error ? safeDecode(sp.error) : "";

  const { supabase } = await requireAppAccess({
    appId: "viso",
    returnTo: "/sites",
  });

  const [
    { data: sitesData, error: sitesError },
    { data: satellitesData },
  ] = await Promise.all([
    supabase
      .from("sites")
      .select("id,code,name,site_type,is_active")
      .order("name", { ascending: true }),
    supabase.from("pass_satellites").select("id,site_id"),
  ]);

  if (sitesError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Sedes" subtitle="Todas las sedes y documentos requeridos para el carnet laboral." />
        <div className="ui-alert ui-alert--error">{sitesError.message}</div>
      </div>
    );
  }

  const sites = (sitesData ?? []) as SiteRow[];
  const satellites = (satellitesData ?? []) as SatelliteRow[];
  const siteIdToBusinessId = new Map<string, string>();
  satellites.forEach((s) => {
    if (s.site_id) siteIdToBusinessId.set(s.site_id, s.id);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sedes"
        subtitle="Todas las sedes. Configura aquí los documentos requeridos para Vento Group, centro de producción y cualquier sede sin Pass."
        actions={
          <Link href="/businesses" className="ui-btn ui-btn--ghost">
            Ver negocios (Pass)
          </Link>
        }
      />

      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}

      <div className="ui-panel">
        {sites.length === 0 ? (
          <div className="ui-empty">No hay sedes.</div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Código</TableHeaderCell>
                <TableHeaderCell>Nombre</TableHeaderCell>
                <TableHeaderCell>Tipo</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sites.map((site) => {
                const businessId = siteIdToBusinessId.get(site.id);
                return (
                  <TableRow key={site.id}>
                    <TableCell>{site.code ?? "—"}</TableCell>
                    <TableCell>{site.name ?? "—"}</TableCell>
                    <TableCell>{siteTypeLabel(site.site_type)}</TableCell>
                    <TableCell>
                      <span className={`ui-chip ${site.is_active ? "ui-chip--success" : ""}`}>
                        {site.is_active ? "Activo" : "Inactivo"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="flex flex-wrap items-center justify-end gap-2">
                        {businessId && (
                          <Link href={`/businesses/${businessId}`} className="ui-btn ui-btn--ghost ui-btn--sm">
                            Editar negocio
                          </Link>
                        )}
                        <Link
                          href={`/sites/${site.id}/documentos`}
                          className="ui-btn ui-btn--brand ui-btn--sm"
                        >
                          Documentos requeridos
                        </Link>
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
