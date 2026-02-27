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
  site?: { id: string; name: string | null; code: string | null; is_public: boolean | null } | { id: string; name: string | null; code: string | null; is_public: boolean | null }[] | null;
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

  const { data } = await supabase
    .from("pass_satellites")
    .select("id,code,name,is_active,site:sites(id,name,code,is_public)")
    .order("sort_order", { ascending: true });

  const rows = (data ?? []) as SatelliteRow[];

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

      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}
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
                const site = Array.isArray(row.site) ? row.site[0] ?? null : row.site ?? null;
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
