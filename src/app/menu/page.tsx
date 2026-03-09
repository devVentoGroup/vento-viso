import Link from "next/link";

import { PageHeader } from "@/components/vento/standard/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/vento/standard/table";
import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

type MenuItemRow = {
  id: string;
  code: string;
  name: string;
  category_label: string | null;
  price_amount: number;
  is_active: boolean;
  is_featured: boolean;
  metadata?: Record<string, unknown> | null;
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

function formatCop(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function readNumericMeta(metadata: Record<string, unknown> | null | undefined, key: string) {
  const raw = metadata?.[key];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export default async function MenuPage({
  searchParams,
}: {
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const okMsg = sp.ok ? safeDecode(sp.ok) : "";
  const errorMsg = sp.error ? safeDecode(sp.error) : "";

  const { supabase } = await requireAppAccess({
    appId: "viso",
    returnTo: "/menu",
  });

  const { data } = await supabase
    .schema("pass").from("catalog_items")
    .select("id,code,name,category_label,price_amount,is_active,is_featured,metadata,site:sites(id,name,code)")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  const rows = (data ?? []) as MenuItemRow[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Menu comercial"
        subtitle="Catalogo digital de compra para satelites. Separado de rewards."
        actions={
          <Link href="/menu/new" className="ui-btn ui-btn--brand">
            Crear item
          </Link>
        }
      />

      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}

      <div className="ui-panel">
        {rows.length === 0 ? (
          <div className="ui-empty">No hay items de menu configurados.</div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Item</TableHeaderCell>
                <TableHeaderCell>Categoria</TableHeaderCell>
                <TableHeaderCell>Precio</TableHeaderCell>
                <TableHeaderCell>Costo receta</TableHeaderCell>
                <TableHeaderCell>Margen</TableHeaderCell>
                <TableHeaderCell>Negocio</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => {
                const site = Array.isArray(row.site) ? row.site[0] ?? null : row.site ?? null;
                const recipeCost = readNumericMeta(row.metadata, "recipe_cost_amount");
                const marginAmount = readNumericMeta(row.metadata, "margin_amount");
                const marginPct = readNumericMeta(row.metadata, "margin_pct");

                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-semibold">{row.name}</div>
                      <div className="ui-caption">{row.code}</div>
                      {row.is_featured ? <div className="ui-caption">Destacado</div> : null}
                    </TableCell>
                    <TableCell>{row.category_label || "-"}</TableCell>
                    <TableCell>{formatCop(row.price_amount)}</TableCell>
                    <TableCell>{recipeCost == null ? "-" : formatCop(recipeCost)}</TableCell>
                    <TableCell>
                      {marginAmount == null ? "-" : (
                        <div>
                          <div>{formatCop(marginAmount)}</div>
                          {marginPct == null ? null : <div className="ui-caption">{marginPct.toFixed(2)}%</div>}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{site?.name ?? site?.code ?? "Sin sede"}</TableCell>
                    <TableCell>
                      <span className={`ui-chip ${row.is_active ? "ui-chip--success" : ""}`}>
                        {row.is_active ? "Activo" : "Inactivo"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/menu/${row.id}`} className="ui-btn ui-btn--ghost ui-btn--sm">
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
