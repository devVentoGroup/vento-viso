import Link from "next/link";

import { PageHeader } from "@/components/vento/standard/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/vento/standard/table";
import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

type RewardRow = {
  id: string;
  code: string;
  name: string;
  points_cost: number;
  is_active: boolean;
  site_id: string | null;
  metadata: Record<string, unknown> | null;
};

type SiteRow = {
  id: string;
  name: string | null;
  code: string | null;
};

function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const okMsg = sp.ok ? safeDecode(sp.ok) : "";
  const errorMsg = sp.error ? safeDecode(sp.error) : "";

  const { supabase } = await requireAppAccess({
    appId: "viso",
    returnTo: "/products",
  });

  const { data, error } = await supabase
    .from("loyalty_rewards")
    .select("id,code,name,points_cost,is_active,metadata,site_id")
    .order("name", { ascending: true });

  const rows = (data ?? []) as RewardRow[];
  const siteIds = rows.map((row) => row.site_id).filter(Boolean) as string[];
  const { data: sitesData, error: sitesError } = siteIds.length
    ? await supabase.from("sites").select("id,name,code").in("id", siteIds)
    : { data: [], error: null };
  const sitesById = new Map(
    ((sitesData ?? []) as SiteRow[]).map((site) => [site.id, site]),
  );
  const effectiveError = errorMsg || error?.message || sitesError?.message || "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Productos"
        subtitle="Items de canje que veran los clientes en Vento Pass."
        actions={
          <Link href="/products/new" className="ui-btn ui-btn--brand">
            Crear producto
          </Link>
        }
      />

      {effectiveError ? <div className="ui-alert ui-alert--error">{effectiveError}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}

      <div className="ui-panel">
        {rows.length === 0 ? (
          <div className="ui-empty">No hay productos configurados.</div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Producto</TableHeaderCell>
                <TableHeaderCell>Categoria</TableHeaderCell>
                <TableHeaderCell>Puntos</TableHeaderCell>
                <TableHeaderCell>Negocio</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => {
                const site = row.site_id ? sitesById.get(row.site_id) ?? null : null;
                const category =
                  row.metadata && typeof row.metadata === "object" && typeof row.metadata.category === "string"
                    ? row.metadata.category
                    : "-";

                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-semibold">{row.name}</div>
                      <div className="ui-caption">{row.code}</div>
                    </TableCell>
                    <TableCell>{category}</TableCell>
                    <TableCell>{row.points_cost} pts</TableCell>
                    <TableCell>{site?.name ?? site?.code ?? "Sin sede"}</TableCell>
                    <TableCell>
                      <span className={`ui-chip ${row.is_active ? "ui-chip--success" : ""}`}>
                        {row.is_active ? "Activo" : "Inactivo"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/products/${row.id}`} className="ui-btn ui-btn--ghost ui-btn--sm">
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

