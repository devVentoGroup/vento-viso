import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/vento/standard/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/vento/standard/table";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type SiteRow = {
  id: string;
  name: string | null;
  code: string | null;
  is_active: boolean | null;
  is_public?: boolean | null;
};

type BusinessRow = {
  id: string;
  code: string | null;
  name: string | null;
  is_active: boolean | null;
  site_id: string | null;
};

type CategoryRow = {
  id: string;
  site_id: string;
  code: string;
  name: string;
  description: string | null;
  sort_order: number | null;
  is_active: boolean | null;
};

type CategoryItemReferenceRow = {
  site_id: string | null;
  product_id: string | null;
  commercial_category_id: string | null;
  is_active: boolean | null;
  price_amount: number | string | null;
  metadata?: Record<string, unknown> | null;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function asBool(value: FormDataEntryValue | null) {
  return value === "on" || value === "true";
}

function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseBulkCategoryNames(value: string) {
  const seenCodes = new Set<string>();
  const categories: Array<{ name: string; code: string }> = [];

  for (const rawLine of value.split(/\r?\n/)) {
    const name = rawLine.trim();
    const code = slugify(name);

    if (!name || !code || seenCodes.has(code)) continue;

    seenCodes.add(code);
    categories.push({ name, code });
  }

  return categories;
}

function siteLabel(site: SiteRow | undefined) {
  return site?.name ?? site?.code ?? "Sin sede";
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function getMetadataText(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : "";
}

function isRealCommercialCatalogItem(row: CategoryItemReferenceRow) {
  return (
    Boolean(row.site_id) &&
    Boolean(row.product_id) &&
    Boolean(row.commercial_category_id) &&
    row.is_active === true &&
    toNumber(row.price_amount, 0) > 0 &&
    getMetadataText(row.metadata, "source_app") === "viso" &&
    getMetadataText(row.metadata, "source_module") === "menu_comercial"
  );
}

const LEGACY_COMMERCIAL_CATEGORY_CODES = new Set([
  "bebidas-listas-rtd",
  "bebidas-listas",
  "rtd",
]);

const LEGACY_COMMERCIAL_CATEGORY_NAMES = new Set([
  "bebidas listas (rtd)",
  "bebidas listas",
  "bebidas listas rtd",
]);

function normalizeCategoryText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isLegacyCommercialCategory(category: CategoryRow) {
  const code = normalizeCategoryText(category.code);
  const name = normalizeCategoryText(category.name);

  return (
    LEGACY_COMMERCIAL_CATEGORY_CODES.has(code) ||
    LEGACY_COMMERCIAL_CATEGORY_NAMES.has(name)
  );
}

async function saveCategory(formData: FormData) {
  "use server";
  const supabase = createAdminClient();
  const id = asText(formData.get("id"));
  const siteId = asText(formData.get("site_id"));
  const name = asText(formData.get("name"));
  const code = slugify(name);

  if (!siteId || !name || !code) {
    redirect("/commercial-categories?error=" + encodeURIComponent("Sede y nombre son obligatorios."));
  }

  let sortOrder = 0;
  if (id) {
    const { data: existing } = await supabase
      .schema("pass")
      .from("commercial_categories")
      .select("sort_order")
      .eq("id", id)
      .maybeSingle();
    sortOrder = Number(existing?.sort_order ?? 0);
  } else {
    const { data: latest } = await supabase
      .schema("pass")
      .from("commercial_categories")
      .select("sort_order")
      .eq("site_id", siteId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    sortOrder = Number(latest?.sort_order ?? -10) + 10;
  }

  const payload = {
    site_id: siteId,
    name,
    code,
    description: asText(formData.get("description")) || null,
    sort_order: sortOrder,
    is_active: asBool(formData.get("is_active")),
  };

  const { error } = id
    ? await supabase.schema("pass").from("commercial_categories").update(payload).eq("id", id)
    : await supabase
      .schema("pass")
      .from("commercial_categories")
      .upsert(payload, { onConflict: "site_id,code" });

  if (error) {
    redirect("/commercial-categories?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/commercial-categories");
  revalidatePath("/menu");
  redirect("/commercial-categories?ok=" + encodeURIComponent("Categoría guardada."));
}

async function saveCategoriesBulk(formData: FormData) {
  "use server";

  const supabase = createAdminClient();
  const siteId = asText(formData.get("site_id"));
  const rawNames = asText(formData.get("bulk_names"));
  const rawLineCount = rawNames
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean).length;

  const categoriesToCreate = parseBulkCategoryNames(rawNames);

  if (!siteId || categoriesToCreate.length === 0) {
    redirect(
      "/commercial-categories?error=" +
      encodeURIComponent("Selecciona una sede y pega al menos una categoría valida."),
    );
  }

  const codes = categoriesToCreate.map((category) => category.code);

  const { data: existingRaw, error: existingError } = await supabase
    .schema("pass")
    .from("commercial_categories")
    .select("code")
    .eq("site_id", siteId)
    .in("code", codes);

  if (existingError) {
    redirect("/commercial-categories?error=" + encodeURIComponent(existingError.message));
  }

  const existingCodes = new Set(
    ((existingRaw ?? []) as Array<{ code: string | null }>)
      .map((category) => category.code)
      .filter((code): code is string => Boolean(code)),
  );

  const newCategories = categoriesToCreate.filter(
    (category) => !existingCodes.has(category.code),
  );

  if (newCategories.length === 0) {
    redirect(
      "/commercial-categories?ok=" +
      encodeURIComponent("No se crearon categorías nuevas. Todas ya existian o estaban repetidas."),
    );
  }

  const { data: latest, error: latestError } = await supabase
    .schema("pass")
    .from("commercial_categories")
    .select("sort_order")
    .eq("site_id", siteId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    redirect("/commercial-categories?error=" + encodeURIComponent(latestError.message));
  }

  const baseSortOrder = Number(latest?.sort_order ?? 0);

  const payload = newCategories.map((category, index) => ({
    site_id: siteId,
    name: category.name,
    code: category.code,
    description: null,
    sort_order: baseSortOrder + (index + 1) * 10,
    is_active: true,
  }));

  const { error } = await supabase
    .schema("pass")
    .from("commercial_categories")
    .insert(payload);

  if (error) {
    redirect("/commercial-categories?error=" + encodeURIComponent(error.message));
  }

  const skippedCount = Math.max(0, rawLineCount - newCategories.length);

  revalidatePath("/commercial-categories");
  revalidatePath("/menu");

  redirect(
    "/commercial-categories?ok=" +
    encodeURIComponent(
      `Categorías creadas: ${newCategories.length}. Omitidas existentes o repetidas: ${skippedCount}.`,
    ),
  );
}

async function deleteCategory(formData: FormData) {
  "use server";
  const supabase = createAdminClient();
  const id = asText(formData.get("id"));
  if (!id) {
    redirect("/commercial-categories?error=" + encodeURIComponent("Categoría invalida."));
  }

  const [
    { count: canonicalItemsCount, error: canonicalItemsError },
    { count: pricedItemsCount, error: pricedItemsError },
  ] = await Promise.all([
    supabase
      .schema("pass")
      .from("catalog_items")
      .select("id", { count: "exact", head: true })
      .eq("commercial_category_id", id)
      .eq("metadata->>source_app", "viso")
      .eq("metadata->>source_module", "menu_comercial"),
    supabase
      .schema("pass")
      .from("catalog_items")
      .select("id", { count: "exact", head: true })
      .eq("commercial_category_id", id)
      .gt("price_amount", 0),
  ]);

  if (canonicalItemsError || pricedItemsError) {
    redirect(
      "/commercial-categories?error=" +
      encodeURIComponent(
        canonicalItemsError?.message ||
        pricedItemsError?.message ||
        "No se pudo validar si la categoría tiene items asignados.",
      ),
    );
  }

  if ((canonicalItemsCount ?? 0) > 0 || (pricedItemsCount ?? 0) > 0) {
    redirect(
      "/commercial-categories?error=" +
      encodeURIComponent(
        "No puedes eliminar una categoría con items comerciales reales asignados. Mueve o desactiva esos productos primero.",
      ),
    );
  }

  const { error: detachError } = await supabase
    .schema("pass")
    .from("catalog_items")
    .update({
      commercial_category_id: null,
      category_label: null,
      is_active: false,
    })
    .eq("commercial_category_id", id);

  if (detachError) {
    redirect(
      "/commercial-categories?error=" +
      encodeURIComponent(`No se pudieron desasignar los items legacy: ${detachError.message}`),
    );
  }

  const { error } = await supabase.schema("pass").from("commercial_categories").delete().eq("id", id);
  if (error) {
    redirect("/commercial-categories?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/commercial-categories");
  revalidatePath("/menu");
  redirect("/commercial-categories?ok=" + encodeURIComponent("Categoría eliminada."));
}

export default async function CommercialCategoriesPage({
  searchParams,
}: {
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const okMsg = safeDecode(sp.ok);
  const errorMsg = safeDecode(sp.error);

  await requireAppAccess({
    appId: "viso",
    returnTo: "/commercial-categories",
  });

  const supabase = createAdminClient();

  const { data: businessesRaw, error: businessesError } = await supabase
    .schema("pass")
    .from("pass_satellites")
    .select("id,code,name,is_active,site_id")
    .eq("is_active", true)
    .not("site_id", "is", null)
    .order("sort_order", { ascending: true });

  const businesses = (businessesRaw ?? []) as BusinessRow[];

  const businessSiteIds = Array.from(
    new Set(
      businesses
        .map((business) => business.site_id)
        .filter((siteId): siteId is string => Boolean(siteId)),
    ),
  );

  const [{ data: sitesRaw, error: sitesError }, { data: categoriesRaw, error: categoriesError }] =
    businessSiteIds.length > 0
      ? await Promise.all([
        supabase
          .from("sites")
          .select("id,name,code,is_active,is_public")
          .eq("is_active", true)
          .in("id", businessSiteIds),
        supabase
          .schema("pass")
          .from("commercial_categories")
          .select("id,site_id,code,name,description,sort_order,is_active")
          .in("site_id", businessSiteIds)
          .order("site_id", { ascending: true })
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
      ])
      : [
        { data: [], error: null },
        { data: [], error: null },
      ];

  const siteOrderById = new Map(
    businessSiteIds.map((siteId, index) => [siteId, index]),
  );

  const sites = ((sitesRaw ?? []) as SiteRow[]).sort(
    (a, b) =>
      (siteOrderById.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (siteOrderById.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );

  const categories = ((categoriesRaw ?? []) as CategoryRow[]).filter(
    (category) => !isLegacyCommercialCategory(category),
  );
  const categoryIds = categories.map((category) => category.id);

  const { data: categoryItemsRaw, error: categoryItemsError } = categoryIds.length
    ? await supabase
      .schema("pass")
      .from("catalog_items")
      .select("site_id,product_id,commercial_category_id,is_active,price_amount,metadata")
      .in("commercial_category_id", categoryIds)
    : { data: [], error: null };

  const assignedCategoryIds = new Set<string>();
  const realCommercialCategoryIds = new Set<string>();

  for (const row of (categoryItemsRaw ?? []) as CategoryItemReferenceRow[]) {
    const categoryId = row.commercial_category_id;
    if (!categoryId) continue;

    assignedCategoryIds.add(categoryId);

    if (isRealCommercialCatalogItem(row)) {
      realCommercialCategoryIds.add(categoryId);
    }
  }

  const visibleCategories = categories.filter((category) => {
    const hasAssignedItems = assignedCategoryIds.has(category.id);
    const hasRealCommercialItems = realCommercialCategoryIds.has(category.id);

    return !hasAssignedItems || hasRealCommercialItems;
  });

  const effectiveError =
    errorMsg ||
    businessesError?.message ||
    sitesError?.message ||
    categoriesError?.message ||
    categoryItemsError?.message ||
    "";

  const categoriesBySite = new Map<string, CategoryRow[]>();
  for (const category of visibleCategories) {
    if (!categoriesBySite.has(category.site_id)) categoriesBySite.set(category.site_id, []);
    categoriesBySite.get(category.site_id)!.push(category);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categorías comerciales"
        subtitle="Crea categorías por sede para ordenar el menu de compras en Vento Pass. No son categorías operacionales ni canjes de fidelización."
        actions={
          <Link href="/menu" className="ui-btn ui-btn--ghost">
            Volver al menú
          </Link>
        }
      />

      {effectiveError ? <div className="ui-alert ui-alert--error">{effectiveError}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}

      <div className="ui-panel space-y-4">
        <h2 className="ui-h3">Crear categoría</h2>
        <form action={saveCategory} className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
          <label className="space-y-2">
            <span className="ui-label">Sede</span>
            <select name="site_id" className="ui-input" required>
              <option value="">Selecciona sede</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {siteLabel(site)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="ui-label">Nombre</span>
            <input name="name" className="ui-input" placeholder="Bebidas frías" required />
          </label>
          <div className="flex items-end">
            <input type="hidden" name="is_active" value="on" />
            <button type="submit" className="ui-btn ui-btn--brand w-full">
              Crear
            </button>
          </div>
        </form>
      </div>

      <div className="ui-panel space-y-4">
        <div>
          <h2 className="ui-h3">Crear varias categorías</h2>
          <p className="ui-caption">
            Pega una categoria por linea. VISO creara las nuevas y omitira las que ya existan en la sede seleccionada.
          </p>
        </div>

        <form action={saveCategoriesBulk} className="grid gap-4 lg:grid-cols-[280px_1fr_auto]">
          <label className="space-y-2">
            <span className="ui-label">Sede</span>
            <select name="site_id" className="ui-input" required>
              <option value="">Selecciona sede</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {siteLabel(site)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="ui-label">Categorías</span>
            <textarea
              name="bulk_names"
              className="ui-input min-h-52"
              placeholder="Una categoría por linea"
              required
            />
          </label>

          <div className="flex items-end">
            <button type="submit" className="ui-btn ui-btn--brand w-full">
              Crear lote
            </button>
          </div>
        </form>
      </div>

      {sites.length === 0 ? (
        <div className="ui-panel">
          <div className="ui-empty">No hay negocios activos con sede asociada.</div>
        </div>
      ) : (
        <div className="space-y-8">
          {sites.map((site) => {
            const siteCategories = categoriesBySite.get(site.id) ?? [];
            return (
              <div key={site.id} className="ui-panel space-y-4">
                <h2 className="text-lg font-semibold text-[var(--ui-text)]">
                  {siteLabel(site)}
                  <span className="ml-2 text-sm font-normal text-[var(--ui-muted)]">
                    ({siteCategories.length} {siteCategories.length === 1 ? "categoría" : "categorías"})
                  </span>
                </h2>

                {siteCategories.length === 0 ? (
                  <div className="ui-empty">Esta sede no tiene categorías comerciales.</div>
                ) : (
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>Categoría</TableHeaderCell>
                        <TableHeaderCell>Estado</TableHeaderCell>
                        <TableHeaderCell></TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {siteCategories.map((category) => (
                        <TableRow key={category.id}>
                          <TableCell>
                            <form id={`category-${category.id}`} action={saveCategory} className="space-y-2">
                              <input type="hidden" name="id" value={category.id} />
                              <input type="hidden" name="site_id" value={category.site_id} />
                              <input name="name" className="ui-input h-10" defaultValue={category.name} required />
                              <input name="description" className="ui-input h-10" defaultValue={category.description ?? ""} placeholder="Descripción opcional" />
                            </form>
                          </TableCell>
                          <TableCell>
                            <label className="flex items-center gap-2 text-sm">
                              <input form={`category-${category.id}`} type="checkbox" name="is_active" defaultChecked={category.is_active !== false} />
                              Activa
                            </label>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <button form={`category-${category.id}`} type="submit" className="ui-btn ui-btn--ghost ui-btn--sm">
                                Guardar
                              </button>
                              <form action={deleteCategory}>
                                <input type="hidden" name="id" value={category.id} />
                                <button type="submit" className="ui-btn ui-btn--danger ui-btn--sm">
                                  Eliminar
                                </button>
                              </form>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
