import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { MenuItemForm } from "@/components/viso/menu-item-form";
import { PageHeader } from "@/components/vento/standard/page-header";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SiteRow = {
  id: string;
  code: string | null;
  name: string | null;
  is_active: boolean | null;
};

type SellOptionRow = {
  site_id: string | null;
  product_id: string | null;
  name: string | null;
  sku: string | null;
  description: string | null;
  base_price: number | string | null;
  recipe_cost_amount: number | string | null;
};

type CommercialCategoryRow = {
  id: string;
  site_id: string;
  name: string | null;
  code: string | null;
  is_active: boolean | null;
};

type CommercialCollectionRow = {
  id: string;
  site_id: string;
  name: string | null;
  subtitle: string | null;
  code: string | null;
  kind: string | null;
  is_active: boolean | null;
};

type CollectionCategoryLinkRow = {
  collection_id: string;
  commercial_category_id: string;
  sort_order: number | null;
  is_active: boolean | null;
};

type CatalogItemRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  site_id: string;
  product_id: string | null;
  commercial_category_id: string | null;
  category_label: string | null;
  image_url: string | null;
  price_amount: number | string;
  compare_at_amount: number | string | null;
  sort_order: number | null;
  is_active: boolean;
  is_featured: boolean;
  badges: string[] | null;
  fulfillment_modes: string[] | null;
  metadata: Record<string, unknown> | null;
};

type CatalogItemCollectionRow = {
  catalog_item_id: string;
  commercial_collection_id: string;
  sort_order: number | null;
  is_active: boolean | null;
  is_primary: boolean | null;
};

type CatalogItemPresentationRow = {
  card_layout: string | null;
  opens_detail_modal: boolean | null;
};

type ExistingCommercialItemRow = {
  id: string;
  site_id: string | null;
  product_id: string | null;
  name: string | null;
  is_active: boolean | null;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function asBool(value: FormDataEntryValue | null) {
  return value === "on" || value === "true";
}

function asNonNegativeNumber(value: FormDataEntryValue | null) {
  const parsed = Number(asText(value));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function toOptionalNumber(value: number | string | null | undefined) {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBadgesCsv(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseFulfillmentModes(formData: FormData) {
  const modes: string[] = [];
  if (asBool(formData.get("fulfillment_delivery"))) modes.push("delivery");
  if (asBool(formData.get("fulfillment_pickup"))) modes.push("pickup");
  if (asBool(formData.get("fulfillment_on_premise"))) modes.push("on_premise");
  return modes.length > 0 ? modes : ["delivery"];
}

function parsePassCardLayout(value: FormDataEntryValue | string | null | undefined) {
  const layout = typeof value === "string" ? value.trim() : "";
  return layout === "featured" ? "featured" : "compact";
}

function parseMetadata(value: string) {
  if (!value) return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {} as Record<string, unknown>;
  }
}

function getRequestedCollectionIds(formData: FormData) {
  const selected = formData
    .getAll("commercial_collection_ids")
    .map((value) => asText(value))
    .filter(Boolean);
  const fallback = asText(formData.get("commercial_collection_id"));
  return Array.from(new Set(selected.length > 0 ? selected : fallback ? [fallback] : []));
}

async function getNextCatalogItemRelationSortOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  collectionId: string,
  categoryId: string,
) {
  const { data, error } = await supabase
    .schema("pass")
    .from("catalog_item_collections")
    .select(
      "sort_order,catalog_item:catalog_items!inner(product_id,commercial_category_id,price_amount,is_active,metadata)",
    )
    .eq("commercial_collection_id", collectionId)
    .eq("is_active", true);

  if (error) throw new Error(error.message);

  return (
    (data ?? []).reduce((highest, relation) => {
      const item = Array.isArray(relation.catalog_item)
        ? relation.catalog_item[0]
        : relation.catalog_item;
      if (
        !item ||
        item.commercial_category_id !== categoryId ||
        item.is_active === false ||
        !item.product_id ||
        Number(item.price_amount ?? 0) <= 0 ||
        item.metadata?.source_app !== "viso" ||
        item.metadata?.source_module !== "menu_comercial"
      ) {
        return highest;
      }
      return Math.max(highest, Number(relation.sort_order ?? 0));
    }, 0) + 10
  );
}

async function updateMenuItem(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const admin = createAdminClient();
  const id = asText(formData.get("id"));
  const code = asText(formData.get("code"));
  const name = asText(formData.get("name"));
  const siteId = asText(formData.get("site_id"));
  const productId = asText(formData.get("product_id"));
  const categoryId = asText(formData.get("commercial_category_id"));
  const collectionIds = getRequestedCollectionIds(formData);

  if (!id || !code || !name || !siteId || !productId || !categoryId || collectionIds.length === 0) {
    redirect(`/menu/${id}?error=${encodeURIComponent("Faltan campos obligatorios.")}`);
  }

  const priceAmount = asNonNegativeNumber(formData.get("price_amount"));
  if (priceAmount <= 0) {
    redirect(`/menu/${id}?error=${encodeURIComponent("El precio comercial debe ser mayor a 0.")}`);
  }

  const [
    { data: sellOption, error: sellOptionError },
    { data: category, error: categoryError },
    { data: selectedCollections, error: collectionsError },
    { data: categoryLinks, error: categoryLinksError },
    { data: duplicateItem, error: duplicateError },
    { data: existingRelations, error: existingRelationsError },
  ] = await Promise.all([
    admin
      .schema("pass")
      .from("sell_products_by_site")
      .select("product_id,base_price,recipe_cost_amount")
      .eq("site_id", siteId)
      .eq("product_id", productId)
      .maybeSingle(),
    admin
      .schema("pass")
      .from("commercial_categories")
      .select("id,name,code,site_id,is_active")
      .eq("id", categoryId)
      .eq("site_id", siteId)
      .eq("is_active", true)
      .maybeSingle(),
    admin
      .schema("pass")
      .from("commercial_collections")
      .select("id,site_id,is_active")
      .in("id", collectionIds)
      .eq("site_id", siteId)
      .eq("is_active", true),
    admin
      .schema("pass")
      .from("commercial_collection_categories")
      .select("collection_id,commercial_category_id,is_active")
      .in("collection_id", collectionIds)
      .eq("commercial_category_id", categoryId)
      .eq("is_active", true),
    admin
      .schema("pass")
      .from("catalog_items")
      .select("id")
      .eq("site_id", siteId)
      .eq("product_id", productId)
      .neq("id", id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle(),
    admin
      .schema("pass")
      .from("catalog_item_collections")
      .select("commercial_collection_id,sort_order,is_active,is_primary")
      .eq("catalog_item_id", id),
  ]);

  const validationError =
    sellOptionError?.message ||
    categoryError?.message ||
    collectionsError?.message ||
    categoryLinksError?.message ||
    duplicateError?.message ||
    existingRelationsError?.message;

  if (validationError) {
    redirect(`/menu/${id}?error=${encodeURIComponent(validationError)}`);
  }
  if (!sellOption) {
    redirect(`/menu/${id}?error=${encodeURIComponent("El producto no está habilitado para esta sede.")}`);
  }
  if (!category) {
    redirect(`/menu/${id}?error=${encodeURIComponent("La categoría no pertenece a esta sede o está inactiva.")}`);
  }
  if ((selectedCollections ?? []).length !== collectionIds.length) {
    redirect(`/menu/${id}?error=${encodeURIComponent("Una colección no pertenece a esta sede o está inactiva.")}`);
  }

  const linkedCollectionIds = new Set(
    (categoryLinks ?? []).map((link) => String(link.collection_id ?? "")),
  );
  if (collectionIds.some((collectionId) => !linkedCollectionIds.has(collectionId))) {
    redirect(
      `/menu/${id}?error=${encodeURIComponent(
        "La categoría elegida no está configurada dentro de una de las colecciones seleccionadas.",
      )}`,
    );
  }
  if (duplicateItem) {
    redirect(
      `/menu/${id}?error=${encodeURIComponent(
        "Ya existe otro producto comercial para esta referencia en la sede.",
      )}`,
    );
  }

  const existingRelationByCollectionId = new Map<
    string,
    { sort_order: number | null; is_active: boolean | null; is_primary: boolean | null }
  >();
  for (const relation of existingRelations ?? []) {
    existingRelationByCollectionId.set(String(relation.commercial_collection_id), {
      sort_order: relation.sort_order,
      is_active: relation.is_active,
      is_primary: relation.is_primary,
    });
  }

  const explicitSortOrderText = asText(formData.get("sort_order"));
  const explicitSortOrder = Math.round(asNonNegativeNumber(formData.get("sort_order")));
  let relationRows: Array<{
    catalog_item_id: string;
    commercial_collection_id: string;
    sort_order: number;
    is_active: boolean;
    is_primary: boolean;
    metadata: Record<string, unknown>;
  }>;

  try {
    relationRows = await Promise.all(
      collectionIds.map(async (collectionId, index) => ({
        catalog_item_id: id,
        commercial_collection_id: collectionId,
        sort_order: explicitSortOrderText
          ? explicitSortOrder
          : existingRelationByCollectionId.get(collectionId)?.sort_order ??
            (await getNextCatalogItemRelationSortOrder(supabase, collectionId, categoryId)),
        is_active: true,
        is_primary: index === 0,
        metadata: { configured_from: "viso_product_form" },
      })),
    );
  } catch (error) {
    redirect(
      `/menu/${id}?error=${encodeURIComponent(
        error instanceof Error ? error.message : "No se pudo calcular el orden.",
      )}`,
    );
  }

  const compareAtRaw = asText(formData.get("compare_at_amount"));
  const compareAtAmount = compareAtRaw
    ? asNonNegativeNumber(formData.get("compare_at_amount"))
    : null;
  const passCardLayout = parsePassCardLayout(formData.get("pass_card_layout"));
  const opensDetailModal = asBool(formData.get("opens_detail_modal"));
  const metadata = parseMetadata(asText(formData.get("metadata_extra")));
  delete metadata.commercial_collection_id;

  const { error: updateError } = await supabase
    .schema("pass")
    .from("catalog_items")
    .update({
      code,
      name,
      site_id: siteId,
      product_id: productId,
      description: asText(formData.get("description")) || null,
      commercial_category_id: categoryId,
      category_label: category.name || category.code || "",
      image_url: asText(formData.get("image_url")) || null,
      price_amount: priceAmount,
      compare_at_amount: compareAtAmount,
      sort_order: relationRows[0]?.sort_order ?? explicitSortOrder,
      is_active: asBool(formData.get("is_active")),
      is_featured: asBool(formData.get("is_featured")),
      badges: parseBadgesCsv(asText(formData.get("badges_csv"))),
      fulfillment_modes: parseFulfillmentModes(formData),
      metadata: {
        ...metadata,
        source_app: "viso",
        source_module: "menu_comercial",
        operational_product_id: productId,
        commercial_category_id: categoryId,
        base_price_amount: toOptionalNumber(sellOption.base_price),
        recipe_cost_amount: toOptionalNumber(sellOption.recipe_cost_amount),
        display_group: asText(formData.get("display_group")) || null,
        variant_label: asText(formData.get("variant_label")) || null,
      },
    })
    .eq("id", id);

  if (updateError) {
    redirect(`/menu/${id}?error=${encodeURIComponent(updateError.message)}`);
  }

  const { error: deactivateError } = await supabase
    .schema("pass")
    .from("catalog_item_collections")
    .update({ is_active: false, is_primary: false })
    .eq("catalog_item_id", id);

  if (deactivateError) {
    redirect(`/menu/${id}?error=${encodeURIComponent(deactivateError.message)}`);
  }

  const { error: relationsError } = await supabase
    .schema("pass")
    .from("catalog_item_collections")
    .upsert(relationRows, { onConflict: "catalog_item_id,commercial_collection_id" });

  if (relationsError) {
    redirect(`/menu/${id}?error=${encodeURIComponent(relationsError.message)}`);
  }

  const { error: presentationError } = await supabase
    .schema("pass")
    .from("catalog_item_presentation")
    .upsert(
      {
        catalog_item_id: id,
        surface: "vento_pass_menu",
        card_layout: passCardLayout,
        opens_detail_modal: opensDetailModal,
        is_highlighted: passCardLayout === "featured",
        metadata: {},
      },
      { onConflict: "catalog_item_id,surface" },
    );

  if (presentationError) {
    redirect(`/menu/${id}?error=${encodeURIComponent(presentationError.message)}`);
  }

  revalidatePath(`/menu/${id}`);
  revalidatePath("/menu");
  redirect(`/menu/${id}?ok=${encodeURIComponent("Producto actualizado.")}`);
}

function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function MenuItemEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const okMessage = safeDecode(query.ok);
  const errorMessage = safeDecode(query.error);

  await requireAppAccess({ appId: "viso", returnTo: `/menu/${id}` });
  const admin = createAdminClient();

  const [
    { data: itemRaw },
    { data: sitesRaw },
    { data: sellOptionsRaw },
    { data: categoriesRaw },
    { data: collectionsRaw },
    { data: collectionCategoryLinksRaw },
    { data: existingItemsRaw },
    { data: itemCollectionsRaw },
    { data: presentationRaw },
  ] = await Promise.all([
    admin
      .schema("pass")
      .from("catalog_items")
      .select(
        "id,code,name,description,site_id,product_id,commercial_category_id,category_label,image_url,price_amount,compare_at_amount,sort_order,is_active,is_featured,badges,fulfillment_modes,metadata",
      )
      .eq("id", id)
      .maybeSingle(),
    admin.from("sites").select("id,code,name,is_active").eq("is_active", true).order("name"),
    admin
      .schema("pass")
      .from("sell_products_by_site")
      .select("site_id,product_id,name,sku,description,base_price,recipe_cost_amount")
      .order("name"),
    admin
      .schema("pass")
      .from("commercial_categories")
      .select("id,site_id,name,code,is_active")
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
    admin
      .schema("pass")
      .from("commercial_collections")
      .select("id,site_id,name,subtitle,code,kind,is_active")
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
    admin
      .schema("pass")
      .from("commercial_collection_categories")
      .select("collection_id,commercial_category_id,sort_order,is_active")
      .eq("is_active", true)
      .order("sort_order"),
    admin
      .schema("pass")
      .from("catalog_items")
      .select("id,site_id,product_id,name,is_active")
      .not("site_id", "is", null)
      .not("product_id", "is", null)
      .eq("is_active", true)
      .order("name"),
    admin
      .schema("pass")
      .from("catalog_item_collections")
      .select("catalog_item_id,commercial_collection_id,sort_order,is_active,is_primary")
      .eq("catalog_item_id", id)
      .eq("is_active", true)
      .order("is_primary", { ascending: false })
      .order("sort_order"),
    admin
      .schema("pass")
      .from("catalog_item_presentation")
      .select("card_layout,opens_detail_modal")
      .eq("catalog_item_id", id)
      .eq("surface", "vento_pass_menu")
      .maybeSingle(),
  ]);

  if (!itemRaw) {
    redirect(`/menu?error=${encodeURIComponent("Producto no encontrado.")}`);
  }

  const item = itemRaw as CatalogItemRow;
  const sites = (sitesRaw ?? []) as SiteRow[];
  const categories = (categoriesRaw ?? []) as CommercialCategoryRow[];
  const collections = (collectionsRaw ?? []) as CommercialCollectionRow[];
  const collectionCategoryLinks =
    (collectionCategoryLinksRaw ?? []) as CollectionCategoryLinkRow[];
  const existingCommercialItems =
    (existingItemsRaw ?? []) as ExistingCommercialItemRow[];
  const itemCollections = (itemCollectionsRaw ?? []) as CatalogItemCollectionRow[];
  const presentation = (presentationRaw ?? null) as CatalogItemPresentationRow | null;

  const productsMap = new Map<
    string,
    {
      id: string;
      name: string | null;
      sku: string | null;
      description: string | null;
      site_ids: Set<string>;
      site_prices: Record<string, number | null>;
      site_recipe_costs: Record<string, number | null>;
      default_price: number | null;
    }
  >();

  for (const row of (sellOptionsRaw ?? []) as SellOptionRow[]) {
    const productId = String(row.product_id ?? "").trim();
    const rowSiteId = String(row.site_id ?? "").trim();
    if (!productId || !rowSiteId) continue;

    const current = productsMap.get(productId) ?? {
      id: productId,
      name: row.name,
      sku: row.sku,
      description: row.description,
      site_ids: new Set<string>(),
      site_prices: {},
      site_recipe_costs: {},
      default_price: null,
    };

    current.site_ids.add(rowSiteId);
    const price = toOptionalNumber(row.base_price);
    const recipeCost = toOptionalNumber(row.recipe_cost_amount);
    current.site_prices[rowSiteId] = price;
    current.site_recipe_costs[rowSiteId] = recipeCost;
    if (current.default_price == null && price != null) current.default_price = price;
    productsMap.set(productId, current);
  }

  const products = Array.from(productsMap.values())
    .map((product) => ({ ...product, site_ids: Array.from(product.site_ids) }))
    .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), "es-CO"));

  const selectedCollectionIds = itemCollections
    .filter((relation) => relation.is_active !== false)
    .sort((a, b) => {
      if (Boolean(a.is_primary) !== Boolean(b.is_primary)) return a.is_primary ? -1 : 1;
      return Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
    })
    .map((relation) => relation.commercial_collection_id);

  const metadata = item.metadata ?? {};
  const fulfillmentModes = item.fulfillment_modes ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Editar producto en Vento Pass"
        subtitle="La colección principal determina las categorías disponibles para este producto."
        actions={
          <Link href="/menu" className="ui-btn ui-btn--ghost">
            Volver
          </Link>
        }
      />

      {errorMessage ? <div className="ui-alert ui-alert--error">{errorMessage}</div> : null}
      {okMessage ? <div className="ui-alert ui-alert--success">{okMessage}</div> : null}

      <MenuItemForm
        mode="edit"
        sites={sites}
        products={products}
        categories={categories}
        collections={collections}
        collectionCategoryLinks={collectionCategoryLinks}
        existingCommercialItems={existingCommercialItems.map((existingItem) => ({
          id: existingItem.id,
          site_id: existingItem.site_id ?? "",
          product_id: existingItem.product_id,
          name: existingItem.name,
          is_active: existingItem.is_active,
        }))}
        initial={{
          id: item.id,
          code: item.code,
          name: item.name,
          description: item.description ?? "",
          product_id: item.product_id ?? "",
          price_amount: String(item.price_amount ?? ""),
          compare_at_amount:
            item.compare_at_amount == null ? "" : String(item.compare_at_amount),
          sort_order: String(item.sort_order ?? 0),
          is_active: item.is_active,
          is_featured: item.is_featured,
          site_id: item.site_id,
          commercial_collection_ids: selectedCollectionIds,
          commercial_category_id: item.commercial_category_id ?? "",
          category_label: item.category_label ?? "",
          image_url: item.image_url ?? "",
          badges_csv: (item.badges ?? []).join(", "),
          fulfillment_delivery: fulfillmentModes.includes("delivery"),
          fulfillment_pickup: fulfillmentModes.includes("pickup"),
          fulfillment_on_premise: fulfillmentModes.includes("on_premise"),
          metadata_extra: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : "",
          display_group: typeof metadata.display_group === "string" ? metadata.display_group : "",
          variant_label: typeof metadata.variant_label === "string" ? metadata.variant_label : "",
          pass_card_layout: parsePassCardLayout(presentation?.card_layout),
          opens_detail_modal: Boolean(presentation?.opens_detail_modal),
        }}
        action={updateMenuItem}
        secondaryActions={
          <>
            <Link href={`/menu/${item.id}/personalizations`} className="ui-btn ui-btn--ghost">
              Personalizaciones
            </Link>
            <Link href="/menu" className="ui-btn ui-btn--ghost">
              Cancelar
            </Link>
          </>
        }
      />
    </div>
  );
}
