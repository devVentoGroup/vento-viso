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

  // Agrupar productos por sede (site_id). Orden: sedes con nombre A-Z, luego "Sin sede".
  const NO_SITE_KEY = "__no_site__";
  const groups = new Map<string, RewardRow[]>();
  for (const row of rows) {
    const key = row.site_id ?? NO_SITE_KEY;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  const siteOrder = [...new Set(rows.map((r) => r.site_id).filter(Boolean))] as string[];
  siteOrder.sort((a, b) => {
    const nameA = sitesById.get(a)?.name ?? sitesById.get(a)?.code ?? "";
    const nameB = sitesById.get(b)?.name ?? sitesById.get(b)?.code ?? "";
    return nameA.localeCompare(nameB, "es");
  });
  const orderedKeys = [...siteOrder];
  if (groups.has(NO_SITE_KEY)) orderedKeys.push(NO_SITE_KEY);

  function getSiteLabel(siteId: string | null) {
    if (!siteId || siteId === NO_SITE_KEY) return "Sin sede";
    const site = sitesById.get(siteId);
    return site?.name ?? site?.code ?? "Sin sede";
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Productos de fidelización"
        subtitle="Items de canje por puntos que veran los clientes en Vento Pass. No hacen parte del catalogo comercial de compras."
        actions={
          <Link href="/products/new" className="ui-btn ui-btn--brand">
            Crear producto de fidelización
          </Link>
        }
      />

      {effectiveError ? <div className="ui-alert ui-alert--error">{effectiveError}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}

      {rows.length === 0 ? (
        <div className="ui-panel">
          <div className="ui-empty">No hay productos de fidelización configurados.</div>
        </div>
      ) : (
        <div className="space-y-8">
          {orderedKeys.map((siteKey) => {
            const siteRows = groups.get(siteKey) ?? [];
            if (siteRows.length === 0) return null;
            const siteLabel = getSiteLabel(siteKey);

            return (
              <div key={siteKey} className="ui-panel space-y-4">
                <h2 className="text-lg font-semibold text-[var(--ui-text)]">
                  {siteLabel}
                  <span className="ml-2 text-sm font-normal text-[var(--ui-muted)]">
                    ({siteRows.length} {siteRows.length === 1 ? "producto" : "productos"})
                  </span>
                </h2>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Producto</TableHeaderCell>
                      <TableHeaderCell>Categoria</TableHeaderCell>
                      <TableHeaderCell>Puntos</TableHeaderCell>
                      <TableHeaderCell>Estado</TableHeaderCell>
                      <TableHeaderCell></TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {siteRows.map((row) => {
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
