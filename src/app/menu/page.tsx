import { CommercialMenuOrganizer } from "@/components/viso/commercial-menu-organizer";
import Link from "next/link";

import { PageHeader } from "@/components/vento/standard/page-header";
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
  commercial_collection_id: string | null;
  commercial_category_id: string | null;
  commercial_collection?:
  | { id: string; name: string | null; subtitle: string | null; code: string | null; kind: string | null; sort_order: number | null }
  | { id: string; name: string | null; subtitle: string | null; code: string | null; kind: string | null; sort_order: number | null }[]
  | null;
  commercial_category?:
  | { id: string; name: string | null; code: string | null; sort_order: number | null }
  | { id: string; name: string | null; code: string | null; sort_order: number | null }[]
  | null;
  price_amount: number;
  sort_order: number | null;
  is_active: boolean;
  is_featured: boolean;
  metadata?: Record<string, unknown> | null;
  site?: { id: string; name: string | null; code: string | null } | { id: string; name: string | null; code: string | null }[] | null;
};

type CollectionCategoryLinkRow = {
  collection_id: string;
  commercial_category_id: string;
  sort_order: number | null;
  is_active: boolean | null;
};

function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function hasTextValue(value: unknown) {
  if (typeof value === "string") return value.trim().length > 0;
  if (value == null) return false;
  return String(value).trim().length > 0;
}

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function sortNumber(value: number | string | null | undefined, fallback = Number.MAX_SAFE_INTEGER) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isVisoCommercialMenuItem(row: MenuItemRow) {
  return (
    hasTextValue(row.product_id) &&
    hasTextValue(row.commercial_category_id) &&
    row.price_amount > 0 &&
    row.metadata?.source_app === "viso" &&
    row.metadata?.source_module === "menu_comercial"
  );
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

  const [
    { data, error: menuError },
    { data: categoryLinksRaw, error: categoryLinksError },
  ] = await Promise.all([
    supabase
      .schema("pass")
      .from("catalog_items")
      .select("id,code,name,site_id,product_id,category_label,commercial_collection_id,commercial_collection:commercial_collections(id,name,subtitle,code,kind,sort_order),commercial_category_id,commercial_category:commercial_categories(id,name,code,sort_order),price_amount,sort_order,is_active,is_featured,metadata")
      .not("product_id", "is", null)
      .not("commercial_category_id", "is", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .schema("pass")
      .from("commercial_collection_categories")
      .select("collection_id,commercial_category_id,sort_order,is_active")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  const commercialRows = menuError
    ? []
    : ((data ?? []) as MenuItemRow[]).filter(isVisoCommercialMenuItem);

  const siteIds = Array.from(
    new Set(
      commercialRows
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

  const rows = commercialRows.map((row) => ({
    ...row,
    site: siteById.get(row.site_id) ?? null,
  }));

  const categoryOrderByCollection = new Map<string, number>();

  for (const link of (categoryLinksRaw ?? []) as CollectionCategoryLinkRow[]) {
    if (link.is_active === false) continue;

    const collectionId = String(link.collection_id ?? "").trim();
    const categoryId = String(link.commercial_category_id ?? "").trim();

    if (!collectionId || !categoryId) continue;

    categoryOrderByCollection.set(
      `${collectionId}:${categoryId}`,
      sortNumber(link.sort_order),
    );
  }

  const rowsBySite = new Map<
    string,
    {
      siteLabel: string;
      collections: Map<
        string,
        {
          label: string;
          subtitle: string;
          sortOrder: number;
          categories: Map<
            string,
            {
              label: string;
              sortOrder: number;
              rows: MenuItemRow[];
            }
          >;
        }
      >;
    }
  >();

  for (const row of rows) {
    const site = relationOne(row.site);
    const collection = relationOne(row.commercial_collection);
    const category = relationOne(row.commercial_category);

    const siteId = row.site_id;
    const collectionId = row.commercial_collection_id || collection?.id || "__sin_coleccion__";
    const categoryId = row.commercial_category_id || category?.id || "__sin_categoria__";

    if (!rowsBySite.has(siteId)) {
      rowsBySite.set(siteId, {
        siteLabel: site?.name ?? site?.code ?? "Sin sede",
        collections: new Map(),
      });
    }

    const siteGroup = rowsBySite.get(siteId)!;

    if (!siteGroup.collections.has(collectionId)) {
      siteGroup.collections.set(collectionId, {
        label: collection?.name ?? collection?.code ?? "Sin coleccion",
        subtitle: collection?.subtitle ?? "",
        sortOrder: sortNumber(collection?.sort_order),
        categories: new Map(),
      });
    }

    const collectionGroup = siteGroup.collections.get(collectionId)!;

    if (!collectionGroup.categories.has(categoryId)) {
      collectionGroup.categories.set(categoryId, {
        label: category?.name ?? category?.code ?? row.category_label ?? "Sin categoría",
        sortOrder:
          categoryOrderByCollection.get(`${collectionId}:${categoryId}`) ??
          sortNumber(category?.sort_order),
        rows: [],
      });
    }

    collectionGroup.categories.get(categoryId)!.rows.push(row);
  }

  const organizedMenu = Array.from(rowsBySite.entries()).map(([siteId, siteGroup]) => ({
    siteId,
    siteLabel: siteGroup.siteLabel,
    collections: Array.from(siteGroup.collections.entries())
      .map(([collectionId, collectionGroup]) => ({
        collectionId,
        label: collectionGroup.label,
        subtitle: collectionGroup.subtitle,
        sortOrder: collectionGroup.sortOrder,
        categories: Array.from(collectionGroup.categories.entries())
          .map(([categoryId, categoryGroup]) => ({
            categoryId,
            label: categoryGroup.label,
            sortOrder: categoryGroup.sortOrder,
            rows: categoryGroup.rows.sort((a, b) => {
              const aOrder = sortNumber(a.sort_order);
              const bOrder = sortNumber(b.sort_order);

              if (aOrder !== bOrder) return aOrder - bOrder;
              return a.name.localeCompare(b.name, "es-CO");
            }),
          }))
          .sort((a, b) => {
            if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
            return a.label.localeCompare(b.label, "es-CO");
          }),
      }))
      .sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.label.localeCompare(b.label, "es-CO");
      }),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Menú comercial"
        subtitle="Catálogo digital de compra por satélite. Usa categorías comerciales propias y no las categorías operacionales ni los canjes de fidelización."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/commercial-collections" className="ui-btn ui-btn--ghost">
              Colecciones comerciales
            </Link>
            <Link href="/menu/new" className="ui-btn ui-btn--brand">
              Crear item comercial
            </Link>
          </div>
        }
      />

      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}
      {menuError ? (
        <div className="ui-alert ui-alert--error">
          No se pudo cargar el menú comercial: {menuError.message}
        </div>
      ) : null}
      {categoryLinksError ? (
        <div className="ui-alert ui-alert--error">
          No se pudo cargar el orden de categorias por coleccion: {categoryLinksError.message}
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
        ) : (
          <CommercialMenuOrganizer initialMenu={organizedMenu} />
        )}
      </div>
    </div>
  );
}
