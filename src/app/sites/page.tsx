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

type AreaCountRow = {
  site_id: string | null;
};

type LocationCountRow = {
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
    satellite: "Satélite comercial",
    admin: "Administración",
    production_center: "Centro de producción",
    distribution_center: "Centro de distribución",
  };
  return labels[siteType] ?? siteType;
}

function countBySite<T extends { site_id: string | null }>(rows: T[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.site_id) continue;
    counts.set(row.site_id, (counts.get(row.site_id) ?? 0) + 1);
  }
  return counts;
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
    { data: areasData },
    { data: locationsData },
  ] = await Promise.all([
    supabase
      .from("sites")
      .select("id,code,name,site_type,is_active")
      .order("name", { ascending: true }),
    supabase.schema("pass").from("pass_satellites").select("id,site_id"),
    supabase.from("areas").select("site_id").eq("is_active", true),
    supabase.from("inventory_locations").select("site_id").eq("is_active", true),
  ]);

  if (sitesError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Sedes" subtitle="Administración central de la estructura de Vento Group." />
        <div className="ui-alert ui-alert--error">{sitesError.message}</div>
      </div>
    );
  }

  const sites = (sitesData ?? []) as SiteRow[];
  const satellites = (satellitesData ?? []) as SatelliteRow[];
  const areaCounts = countBySite((areasData ?? []) as AreaCountRow[]);
  const locationCounts = countBySite((locationsData ?? []) as LocationCountRow[]);
  const siteIdToBusinessId = new Map<string, string>();

  satellites.forEach((satellite) => {
    if (satellite.site_id) siteIdToBusinessId.set(satellite.site_id, satellite.id);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sedes"
        subtitle="Fuente maestra de sedes, áreas funcionales y LOCs. NEXO, FOGO, PULSO y Pass consumen esta estructura."
        actions={
          <Link href="/operations-map" className="ui-btn ui-btn--ghost">
            Ver mapa operativo
          </Link>
        }
      />

      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}

      <div className="ui-panel-soft p-4 text-sm text-[var(--ui-muted)]">
        <strong className="text-[var(--ui-text)]">Regla de administración:</strong> la estructura se crea y modifica aquí. Las aplicaciones operativas solo deben usarla.
      </div>

      <div className="ui-panel">
        {sites.length === 0 ? (
          <div className="ui-empty">No hay sedes.</div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Sede</TableHeaderCell>
                <TableHeaderCell>Tipo</TableHeaderCell>
                <TableHeaderCell>Estructura</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sites.map((site) => {
                const businessId = siteIdToBusinessId.get(site.id);
                const areaCount = areaCounts.get(site.id) ?? 0;
                const locationCount = locationCounts.get(site.id) ?? 0;

                return (
                  <TableRow key={site.id}>
                    <TableCell>
                      <div className="font-semibold">{site.name ?? "Sede sin nombre"}</div>
                      <div className="mt-1 font-mono text-xs text-[var(--ui-muted)]">{site.code ?? "SIN-CODIGO"}</div>
                    </TableCell>
                    <TableCell>{siteTypeLabel(site.site_type)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <span className="ui-chip">{areaCount} áreas</span>
                        <span className="ui-chip">{locationCount} LOCs</span>
                        {businessId ? <span className="ui-chip ui-chip--success">Pass configurado</span> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`ui-chip ${site.is_active ? "ui-chip--success" : ""}`}>
                        {site.is_active ? "Activa" : "Inactiva"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Link href={`/sites/${site.id}`} className="ui-btn ui-btn--brand ui-btn--sm">
                          Administrar sede
                        </Link>
                        <Link href={`/sites/${site.id}/documentos`} className="ui-btn ui-btn--ghost ui-btn--sm">
                          Documentos
                        </Link>
                        {businessId ? (
                          <Link href={`/businesses/${businessId}`} className="ui-btn ui-btn--ghost ui-btn--sm">
                            Pass
                          </Link>
                        ) : null}
                      </div>
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
