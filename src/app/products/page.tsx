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
  metadata: Record<string, unknown> | null;
  site?: { id: string; name: string | null; code: string | null } | { id: string; name: string | null; code: string | null }[] | null;
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

  const { data } = await supabase
    .from("loyalty_rewards")
    .select("id,code,name,points_cost,is_active,metadata,site:sites(id,name,code)")
    .order("name", { ascending: true });

  const rows = (data ?? []) as RewardRow[];

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

      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}
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
                const site = Array.isArray(row.site) ? row.site[0] ?? null : row.site ?? null;
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
