import Link from "next/link";

import { PageHeader } from "@/components/vento/standard/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/vento/standard/table";
import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

type SatelliteRow = {
  id: string;
  code: string | null;
  name: string | null;
  is_active: boolean | null;
  site_id?: string | null;
};

type SiteRow = {
  id: string;
  name: string | null;
  code: string | null;
  is_public: boolean | null;
};

function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function BusinessesPage({
  searchParams,
}: {
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const okMsg = sp.ok ? safeDecode(sp.ok) : "";
  const errorMsg = sp.error ? safeDecode(sp.error) : "";

  const { supabase } = await requireAppAccess({
    appId: "viso",
    returnTo: "/businesses",
  });

  const { data, error } = await supabase
    .from("pass_satellites")
    .select("id,code,name,is_active,site_id")
    .order("sort_order", { ascending: true });

  const rows = (data ?? []) as SatelliteRow[];
  const siteIds = rows.map((row) => row.site_id).filter(Boolean) as string[];
  const { data: sitesData, error: sitesError } = siteIds.length
    ? await supabase.from("sites").select("id,name,code,is_public").in("id", siteIds)
    : { data: [], error: null };
  const sitesById = new Map(
    ((sitesData ?? []) as SiteRow[]).map((site) => [site.id, site]),
  );
  const effectiveError = errorMsg || error?.message || sitesError?.message || "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Negocios"
        subtitle="Sedes y configuracion de Vento Pass."
        actions={
          <Link href="/businesses/new" className="ui-btn ui-btn--brand">
            Crear negocio
          </Link>
        }
      />

      {effectiveError ? <div className="ui-alert ui-alert--error">{effectiveError}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}

      <div className="ui-panel">
        {rows.length === 0 ? (
          <div className="ui-empty">No hay negocios configurados.</div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Codigo</TableHeaderCell>
                <TableHeaderCell>Nombre</TableHeaderCell>
                <TableHeaderCell>Sede</TableHeaderCell>
                <TableHeaderCell>Pass publico</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => {
                const site = row.site_id ? sitesById.get(row.site_id) ?? null : null;
                return (
                  <TableRow key={row.id}>
                    <TableCell>{row.code ?? "-"}</TableCell>
                    <TableCell>{row.name ?? "-"}</TableCell>
                    <TableCell>{site?.name ?? site?.code ?? "-"}</TableCell>
                    <TableCell>{site?.is_public ? "Si" : "No"}</TableCell>
                    <TableCell>
                      <span className={`ui-chip ${row.is_active ? "ui-chip--success" : ""}`}>
                        {row.is_active ? "Activo" : "Inactivo"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/businesses/${row.id}`} className="ui-btn ui-btn--ghost">
                        Editar
                      </Link>
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

