import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/vento/standard/page-header";
import { MenuItemForm } from "@/components/viso/menu-item-form";
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
};

type CatalogItemRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  site_id: string;
  product_id: string | null;
  commercial_collection_id: string | null;
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
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}

function parseBadgesCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseFulfillmentModes(formData: FormData) {
  const modes: string[] = [];
  if (asBool(formData.get("fulfillment_delivery"))) modes.push("delivery");
  if (asBool(formData.get("fulfillment_pickup"))) modes.push("pickup");
  if (asBool(formData.get("fulfillment_on_premise"))) modes.push("on_premise");
  if (modes.length === 0) modes.push("delivery");
  return modes;
}

function parsePassCardLayout(value: FormDataEntryValue | string | null | undefined) {
  const layout = typeof value === "string" ? value.trim() : "";
  return layout === "featured" ? "featured" : "compact";
}

function parseMetadata(value: string) {
  if (!value) return {} as Record<string, unknown>;

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {} as Record<string, unknown>;
  }

  return {} as Record<string, unknown>;
}

function toOptionalNumber(value: number | string | null | undefined) {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getRequestedCollectionIds(formData: FormData) {
  const selected = formData
    .getAll("commercial_collection_ids")
    .map((value) => asText(value))
    .filter(Boolean);
  const fallback = asText(formData.get("commercial_collection_id"));
  return Array.from(new Set(selected.length > 0 ? selected : fallback ? [fallback] : []));
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
  const commercialCategoryId = asText(formData.get("commercial_category_id"));
  const collectionIds = getRequestedCollectionIds(formData);
  const primaryCollectionId = collectionIds[0] ?? "";

  if (!id || !code || !name || !siteId || !productId || !commercialCategoryId || collectionIds.length === 0) {
    redirect(`/menu/${id}?error=${encodeURIComponent("Faltan campos obligatorios.")}`);
  }

  const priceAmount = asNonNegativeNumber(formData.get("price_amount"));
  if (priceAmount <= 0) {
    redirect(`/menu/${id}?error=${encodeURIComponent("El precio comercial debe ser mayor a 0.")}`);
  }

  const compareAtRaw = asText(formData.get("compare_at_amount"));
  const compareAtAmount = compareAtRaw ? asNonNegativeNumber(formData.get("compare_at_amount")) : null;
  const sortOrder = Math.round(asNonNegativeNumber(formData.get("sort_order")));
  const passCardLayout = parsePassCardLayout(formData.get("pass_card_layout"));
  const requestedOpensDetailModal = asBool(formData.get("opens_detail_modal"));

  const [
    { data: sellOption, error: sellOptionError },
    { data: category, error: categoryError },
    { data: validCollections, error: collectionsError },
    { data: duplicateItem, error: duplicateError },
    { count: activePersonalizationCount },
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
      .eq("id", commercialCategoryId)
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
      .from("catalog_items")
      .select("id")
      .eq("site_id", siteId)
      .eq("product_id", productId)
      .neq("id", id)
      .limit(1)
      .maybeSingle(),
    admin
      .schema("pass")
      .from("catalog_item_option_groups")
      .select("id", { count: "exact", head: true })
      .eq("catalog_item_id", id)
      .eq("is_active", true),
  ]);

  if (sellOptionError || !sellOption) {
    redirect(`/menu/${id}?error=${encodeURIComponent(sellOptionError?.message || "El producto no está habilitado para esta sede.")}`);
  }

  if (categoryError || !category) {
    redirect(`/menu/${id}?error=${encodeURIComponent(categoryError?.message || "La sección seleccionada no pertenece a esta sede.")}`);
  }

  if (collectionsError || (validCollections ?? []).length !== collectionIds.length) {
    redirect(`/menu/${id}?error=${encodeURIComponent(collectionsError?.message || "Uno de los menús o temporadas no pertenece a esta sede.")}`);
  }

  if (duplicateError || duplicateItem) {
    redirect(`/menu/${id}?error=${encodeURIComponent(duplicateError?.message || "Ya existe otro producto comercial para esta referencia en la sede.")}`);
  }

  const collectionCategoryRows = collectionIds.map((collectionId, index) => ({
    collection_id: collectionId,
    commercial_category_id: commercialCategoryId,
    sort_order: index * 10,
  }));

  const { error: categoryLinksError } = await supabase
    .schema("pass")
    .from("commercial_collection_categories")
    .upsert(collectionCategoryRows, { onConflict: "collection_id,commercial_category_id" });

  if (categoryLinksError) {
    redirect(`/menu/${id}?error=${encodeURIComponent(categoryLinksError.message)}`);
  }

  const currentMetadata = parseMetadata(asText(formData.get("metadata_extra")));
  const metadata = {
    ...currentMetadata,
    source_app: "viso",
    source_module: "menu_comercial",
    operational_product_id: productId,
    commercial_collection_id: primaryCollectionId,
    commercial_category_id: commercialCategoryId,
    base_price_amount: toOptionalNumber(sellOption.base_price),
    recipe_cost_amount: toOptionalNumber(sellOption.recipe_cost_amount),
    display_group: asText(formData.get("display_group")) || null,
    variant_label: asText(formData.get("variant_label")) || null,
  };

  const { error: updateError } = await supabase
    .schema("pass")
    .from("catalog_items")
    .update({
      code,
      name,
      description: asText(formData.get("description")) || null,
      site_id: siteId,
      product_id: productId,
      commercial_collection_id: primaryCollectionId,
      commercial_category_id: commercialCategoryId,
      category_label: category.name || category.code || "",
      image_url: asText(formData.get("image_url")) || null,
      price_amount: priceAmount,
      compare_at_amount: compareAtAmount,
      sort_order: sortOrder,
      is_active: asBool(formData.get("is_active")),
      is_featured: asBool(formData.get("is_featured")),
      badges: parseBadgesCsv(asText(formData.get("badges_csv"))),
      fulfillment_modes: parseFulfillmentModes(formData),
      metadata,
    })
    .eq("id", id);

  if (updateError) {
    redirect(`/menu/${id}?error=${encodeURIComponent(updateError.message)}`);
  }

  const relationRows = collectionIds.map((collectionId, index) => ({
    catalog_item_id: id,
    commercial_collection_id: collectionId,
    sort_order: sortOrder,
    is_active: true,
    is_primary: index === 0,
    metadata: { configured_from: "viso_product_form" },
  }));

  const { error: relationUpsertError } = await supabase
    .schema("pass")
    .from("catalog_item_collections")
    .upsert(relationRows, { onConflict: "catalog_item_id,commercial_collection_id" });

  if (relationUpsertError) {
    redirect(`/menu/${id}?error=${encodeURIComponent(relationUpsertError.message)}`);
  }

  const { data: currentRelations, error: currentRelationsError } = await admin
    .schema("pass")
    .from("catalog_item_collections")
    .select("commercial_collection_id,is_active")
    .eq("catalog_item_id", id);

  if (currentRelationsError) {
    redirect(`/menu/${id}?error=${encodeURIComponent(currentRelationsError.message)}`);
  }

  const removedCollectionIds = ((currentRelations ?? []) as Array<{
    commercial_collection_id: string | null;
    is_active: boolean | null;
  }>)
    .map((relation) => String(relation.commercial_collection_id ?? ""))
    .filter((collectionId) => collectionId && !collectionIds.includes(collectionId));

  if (removedCollectionIds.length > 0) {
    const { error: deactivateError } = await supabase
      .schema("pass")
      .from("catalog_item_collections")
      .update({ is_active: false, is_primary: false })
      .eq("catalog_item_id", id)
      .in("commercial_collection_id", removedCollectionIds);

    if (deactivateError) {
      redirect(`/menu/${id}?error=${encodeURIComponent(deactivateError.message)}`);
    }
  }

  const opensDetailModal = requestedOpensDetailModal || Number(activePersonalizationCount ?? 0) > 0;
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

  await requireAppAccess({
    appId: "viso",
    returnTo: `/menu/${id}`,
  });

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
      .select("id,code,name,description,site_id,product_id,commercial_collection_id,commercial_category_id,category_label,image_url,price_amount,compare_at_amount,sort_order,is_active,is_featured,badges,fulfillment_modes,metadata")
      .eq("id", id)
      .maybeSingle(),
    admin.from("sites").select("id,code,name,is_active").eq("is_active", true).order("name", { ascending: true }),
    admin
      .schema("pass")
      .from("sell_products_by_site")
      .select("site_id,product_id,name,sku,description,base_price,recipe_cost_amount")
      .order("name", { ascending: true }),
    admin
      .schema("pass")
      .from("commercial_categories")
      .select("id,site_id,name,code,is_active")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    admin
      .schema("pass")
      .from("commercial_collections")
      .select("id,site_id,name,subtitle,code,kind,is_active")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    admin
      .schema("pass")
      .from("commercial_collection_categories")
      .select("collection_id,commercial_category_id,sort_order")
      .order("sort_order", { ascending: true }),
    admin
      .schema("pass")
      .from("catalog_items")
      .select("id,site_id,product_id,name,is_active")
      .not("site_id", "is", null)
      .not("product_id", "is", null)
      .eq("is_active", true)
      .order("name", { ascending: true }),
    admin
      .schema("pass")
      .from("catalog_item_collections")
      .select("catalog_item_id,commercial_collection_id,sort_order,is_active,is_primary")
      .eq("catalog_item_id", id)
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true }),
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
  const collectionCategoryLinks = (collectionCategoryLinksRaw ?? []) as CollectionCategoryLinkRow[];
  const existingCommercialItems = ((existingItemsRaw ?? []) as ExistingCommercialItemRow[])
    .map((existingItem) => ({
      id: existingItem.id,
      site_id: existingItem.site_id ?? "",
      product_id: existingItem.product_id,
      name: existingItem.name,
      is_active: existingItem.is_active,
    }))
    .filter((existingItem) => existingItem.site_id && existingItem.product_id);

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

  for (const sellOption of (sellOptionsRaw ?? []) as SellOptionRow[]) {
    const productId = String(sellOption.product_id ?? "").trim();
    const siteId = String(sellOption.site_id ?? "").trim();
    if (!productId || !siteId) continue;

    const current = productsMap.get(productId) ?? {
      id: productId,
      name: sellOption.name,
      sku: sellOption.sku,
      description: sellOption.description,
      site_ids: new Set<string>(),
      site_prices: {},
      site_recipe_costs: {},
      default_price: null,
    };

    current.site_ids.add(siteId);
    const price = toOptionalNumber(sellOption.base_price);
    const recipeCost = toOptionalNumber(sellOption.recipe_cost_amount);
    current.site_prices[siteId] = price;
    current.site_recipe_costs[siteId] = recipeCost;
    if (current.default_price == null && price != null) current.default_price = price;
    productsMap.set(productId, current);
  }

  const products = Array.from(productsMap.values())
    .map((product) => ({
      ...product,
      site_ids: Array.from(product.site_ids),
    }))
    .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), "es-CO"));

  const itemCollections = ((itemCollectionsRaw ?? []) as CatalogItemCollectionRow[])
    .filter((relation) => relation.is_active !== false)
    .map((relation) => relation.commercial_collection_id);
  const selectedCollectionIds = itemCollections.length > 0
    ? Array.from(new Set(itemCollections))
    : item.commercial_collection_id
      ? [item.commercial_collection_id]
      : [];

  const metadata = item.metadata ?? {};
  const fulfillmentModes = item.fulfillment_modes ?? [];
  const presentation = (presentationRaw ?? null) as CatalogItemPresentationRow | null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Editar producto en Vento Pass"
        subtitle="Revisa la ficha comercial, sus menús y la forma en que el cliente lo agrega al pedido."
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
        existingCommercialItems={existingCommercialItems}
        initial={{
          id: item.id,
          code: item.code,
          name: item.name,
          description: item.description ?? "",
          product_id: item.product_id ?? "",
          price_amount: String(item.price_amount ?? ""),
          compare_at_amount: item.compare_at_amount == null ? "" : String(item.compare_at_amount),
          sort_order: String(item.sort_order ?? 0),
          is_active: item.is_active,
          is_featured: item.is_featured,
          site_id: item.site_id,
          commercial_collection_id: selectedCollectionIds[0] ?? "",
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
