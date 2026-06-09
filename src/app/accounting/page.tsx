import Link from "next/link";

import { PageHeader } from "@/components/vento/standard/page-header";
import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  site_id?: string;
  month?: string;
}>;

type SiteOption = {
  id: string;
  name: string | null;
  code: string | null;
};

type AccountingSummary = {
  inventory_value?: number | string;
  inventory_positive_qty?: number | string;
  stock_rows?: number;
  products_with_stock?: number;
  products_missing_cost?: number;
  negative_stock_rows?: number;
  inventory_estimated_iva?: number | string;
  inventory_estimated_icui?: number | string;
  inventory_estimated_tax?: number | string;
  month_receipts_net?: number | string;
  month_receipts_iva?: number | string;
  month_receipts_icui?: number | string;
  month_receipts_tax?: number | string;
  month_receipts_gross?: number | string;
  month_receipt_lines?: number;
  month_purchase_orders_committed?: number | string;
  month_purchase_order_lines?: number;
};

type InventoryBySite = {
  site_id: string;
  site_name: string | null;
  inventory_value: number | string;
  products: number;
  missing_cost_rows: number;
};

type TopInventoryProduct = {
  site_name: string | null;
  product_id: string;
  product_name: string | null;
  sku: string | null;
  unit: string | null;
  current_qty: number | string;
  unit_cost: number | string;
  stock_value: number | string;
  iva_rate: number | string;
  icui_rate: number | string;
};

type TaxBySite = {
  site_id: string;
  site_name: string | null;
  iva: number | string;
  icui: number | string;
  estimated_tax: number | string;
};

type AccountingData = {
  summary?: AccountingSummary;
  inventory_by_site?: InventoryBySite[];
  top_inventory_products?: TopInventoryProduct[];
  tax_by_site?: TaxBySite[];
};

function toNumber(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

function number(value: number | string | null | undefined, decimals = 0) {
  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: decimals,
  }).format(toNumber(value));
}

function validMonth(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) {
    return new Date().toISOString().slice(0, 7);
  }
  return value;
}

function buildHref(siteId: string, month: string) {
  const qs = new URLSearchParams();
  if (siteId) qs.set("site_id", siteId);
  if (month) qs.set("month", month);
  const query = qs.toString();
  return query ? `/accounting?${query}` : "/accounting";
}

function MetricCard({
  label,
  value,
  note,
  tone = "brand",
}: {
  label: string;
  value: string;
  note: string;
  tone?: "brand" | "teal" | "amber" | "blue" | "rose";
}) {
  const accent = {
    brand: "ui-card--accent-brand text-[var(--ui-brand-600)]",
    teal: "ui-card--accent-teal text-[var(--ui-accent-teal)]",
    amber: "ui-card--accent-amber text-[var(--ui-accent-amber)]",
    blue: "ui-card--accent-blue text-[var(--ui-accent-blue)]",
    rose: "ui-card--accent-rose text-[var(--ui-accent-rose)]",
  }[tone];

  return (
    <div className={`ui-card ${accent}`}>
      <div className="ui-caption font-semibold">{label}</div>
      <div className="mt-2 text-2xl font-bold tracking-tight text-[var(--ui-text)] sm:text-3xl">
        {value}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-[var(--ui-muted)]">{note}</p>
    </div>
  );
}

export default async function AccountingPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const selectedSiteId = params.site_id ?? "";
  const selectedMonth = validMonth(params.month);
  const monthDate = `${selectedMonth}-01`;

  const { supabase } = await requireAppAccess({
    appId: "viso",
    returnTo: buildHref(selectedSiteId, selectedMonth),
  });

  const [{ data: siteRows }, dashboardResult] = await Promise.all([
    supabase
      .from("sites")
      .select("id,name,code")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase.rpc("viso_accounting_dashboard", {
      p_site_id: selectedSiteId || null,
      p_month: monthDate,
    }),
  ]);

  const sites = (siteRows ?? []) as SiteOption[];
  const dashboard = (dashboardResult.data ?? {}) as AccountingData;
  const summary = dashboard.summary ?? {};
  const inventoryBySite = dashboard.inventory_by_site ?? [];
  const topProducts = dashboard.top_inventory_products ?? [];
  const taxBySite = dashboard.tax_by_site ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Contabilidad"
        subtitle="Resumen financiero operativo desde inventario, recepciones y configuración tributaria."
        actions={
          <Link href="/" className="ui-btn ui-btn--ghost ui-btn--sm">
            Panel
          </Link>
        }
      />

      {dashboardResult.error ? (
        <div className="ui-alert ui-alert--error">
          No se pudo cargar el tablero contable. Verifica que la migracion
          `viso_accounting_dashboard` ya este aplicada en Supabase.
        </div>
      ) : null}

      <form className="ui-panel-soft grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end">
        <label className="space-y-2">
          <span className="ui-label">Sede</span>
          <select name="site_id" defaultValue={selectedSiteId} className="ui-input">
            <option value="">Todas las sedes</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name ?? site.code ?? site.id}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2">
          <span className="ui-label">Mes</span>
          <input name="month" type="month" defaultValue={selectedMonth} className="ui-input" />
        </label>
        <button type="submit" className="ui-btn ui-btn--brand">
          Filtrar
        </button>
      </form>

      <section className="space-y-4">
        <h2 className="ui-section-label">Indicadores clave</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Costo total inventario"
            value={money(summary.inventory_value)}
            note={`${number(summary.products_with_stock)} productos con stock actual.`}
            tone="brand"
          />
          <MetricCard
            label="Impuestos estimados inventario"
            value={money(summary.inventory_estimated_tax)}
            note={`IVA ${money(summary.inventory_estimated_iva)} + ICUI ${money(summary.inventory_estimated_icui)}.`}
            tone="teal"
          />
          <MetricCard
            label="Recepciones del mes"
            value={money(summary.month_receipts_gross)}
            note={`Base ${money(summary.month_receipts_net)} + impuestos estimados ${money(summary.month_receipts_tax)}.`}
            tone="amber"
          />
          <MetricCard
            label="Ordenes creadas del mes"
            value={money(summary.month_purchase_orders_committed)}
            note={`${number(summary.month_purchase_order_lines)} lineas de orden no anuladas.`}
            tone="blue"
          />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="ui-panel-soft lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="ui-h2">Inventario por sede</h2>
              <p className="ui-body-muted mt-1">Valor calculado con costo promedio por sede y fallback al costo del producto.</p>
            </div>
            <span className="ui-chip ui-chip--brand">{number(summary.stock_rows)} líneas</span>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="ui-table">
              <thead>
                <tr>
                  <th className="ui-th">Sede</th>
                  <th className="ui-th text-right">Valor</th>
                  <th className="ui-th text-right">Productos</th>
                  <th className="ui-th text-right">Sin costo</th>
                </tr>
              </thead>
              <tbody>
                {inventoryBySite.map((row) => (
                  <tr key={row.site_id}>
                    <td className="ui-td font-semibold">{row.site_name ?? "Sin nombre"}</td>
                    <td className="ui-td text-right">{money(row.inventory_value)}</td>
                    <td className="ui-td text-right">{number(row.products)}</td>
                    <td className="ui-td text-right">{number(row.missing_cost_rows)}</td>
                  </tr>
                ))}
                {inventoryBySite.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="ui-empty">
                      No hay stock actual para el filtro seleccionado.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="ui-panel-soft">
          <h2 className="ui-h2">Calidad contable</h2>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--ui-border)] pb-3">
              <span className="ui-body-muted">Líneas con costo faltante</span>
              <span className="font-semibold">{number(summary.products_missing_cost)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-[var(--ui-border)] pb-3">
              <span className="ui-body-muted">Stock negativo</span>
              <span className="font-semibold">{number(summary.negative_stock_rows)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="ui-body-muted">Líneas recibidas en el mes</span>
              <span className="font-semibold">{number(summary.month_receipt_lines)}</span>
            </div>
          </div>
          <p className="ui-body-muted mt-5">
            Las cifras tributarias son estimadas desde tasas configuradas en proveedor/producto. Para cierre fiscal falta registrar impuestos reales por factura.
          </p>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="ui-panel-soft">
          <h2 className="ui-h2">Productos con mayor valor</h2>
          <div className="mt-5 overflow-x-auto">
            <table className="ui-table">
              <thead>
                <tr>
                  <th className="ui-th">Producto</th>
                  <th className="ui-th">Sede</th>
                  <th className="ui-th text-right">Cantidad</th>
                  <th className="ui-th text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((row) => (
                  <tr key={`${row.site_name}-${row.product_id}`}>
                    <td className="ui-td">
                      <div className="font-semibold">{row.product_name ?? "Producto"}</div>
                      <div className="ui-caption">{row.sku ?? "Sin SKU"} · {row.unit ?? "un"}</div>
                    </td>
                    <td className="ui-td">{row.site_name ?? "Sin sede"}</td>
                    <td className="ui-td text-right">{number(row.current_qty, 2)}</td>
                    <td className="ui-td text-right">{money(row.stock_value)}</td>
                  </tr>
                ))}
                {topProducts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="ui-empty">
                      No hay productos valorizados.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="ui-panel-soft">
          <h2 className="ui-h2">Impuestos estimados por sede</h2>
          <div className="mt-5 overflow-x-auto">
            <table className="ui-table">
              <thead>
                <tr>
                  <th className="ui-th">Sede</th>
                  <th className="ui-th text-right">IVA</th>
                  <th className="ui-th text-right">ICUI</th>
                  <th className="ui-th text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {taxBySite.map((row) => (
                  <tr key={row.site_id}>
                    <td className="ui-td font-semibold">{row.site_name ?? "Sin nombre"}</td>
                    <td className="ui-td text-right">{money(row.iva)}</td>
                    <td className="ui-td text-right">{money(row.icui)}</td>
                    <td className="ui-td text-right">{money(row.estimated_tax)}</td>
                  </tr>
                ))}
                {taxBySite.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="ui-empty">
                      No hay recepciones para el mes seleccionado.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
