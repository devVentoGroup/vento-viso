import Link from "next/link";

import { PageHeader } from "@/components/vento/standard/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/vento/standard/table";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type MenuItemRow = {
  id: string;
  code: string;
  name: string;
  site_id: string;
  product_id: string | null;
  category_label: string | null;
  commercial_category_id: string | null;
  commercial_category?: { id: string; name: string | null; code: string | null } | { id: string; name: string | null; code: string | null }[] | null;
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

  await requireAppAccess({
    appId: "viso",
    returnTo: "/menu",
  });
  const supabase = createAdminClient();

  const { data, error: menuError } = await supabase
    .schema("pass")
    .from("catalog_items")
    .select("id,code,name,site_id,product_id,category_label,commercial_category_id,commercial_category:commercial_categories(id,name,code),price_amount,is_active,is_featured,metadata")
    .not("product_id", "is", null)
    .not("commercial_category_id", "is", null)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  const siteIds = Array.from(
    new Set(
      ((data ?? []) as MenuItemRow[])
        .map((row) => row.site_id)
        .filter(Boolean),
    ),
  );

  const { data: sitesRaw, error: sitesError } = siteIds.length
    ? await supabase
        .from("sites")
        .select("id,name,code")
        .in("id", siteIds)
    : { data: [], error: null };

  const siteById = new Map(
    (sitesRaw ?? []).map((site) => [
      site.id,
      {
        id: site.id,
        name: site.name,
        code: site.code,
      },
    ]),
  );

  const rows = menuError
    ? []
    : ((data ?? []) as MenuItemRow[]).map((row) => ({
        ...row,
        site: siteById.get(row.site_id) ?? null,
      }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Menú comercial"
        subtitle="Catalogo digital de compra por satélite. Usa categorias comerciales propias y no las categorias operacionales ni los canjes de fidelización."
        actions={
          <Link href="/menu/new" className="ui-btn ui-btn--brand">
            Crear item comercial
          </Link>
        }
      />

      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}
      {menuError ? (
        <div className="ui-alert ui-alert--error">
          No se pudo cargar el menú comercial: {menuError.message}
        </div>
      ) : null}
      {sitesError ? (
        <div className="ui-alert ui-alert--error">
          No se pudieron cargar las sedes del menú comercial: {sitesError.message}
        </div>
      ) : null}

      <div className="ui-panel">
        {menuError ? (
          <div className="ui-empty">Corrige el error de consulta para ver los ítems comerciales.</div>
        ) : rows.length === 0 ? (
          <div className="ui-empty">No hay items comerciales configurados.</div>
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
                const commercialCategory = Array.isArray(row.commercial_category)
                  ? row.commercial_category[0] ?? null
                  : row.commercial_category ?? null;
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
                    <TableCell>{commercialCategory?.name || row.category_label || "-"}</TableCell>
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
