import Link from "next/link";
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

function parsePassCardLayout(value: FormDataEntryValue | null) {
  return asText(value) === "featured" ? "featured" : "compact";
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getRequestedCollectionIds(formData: FormData) {
  const selected = formData
    .getAll("commercial_collection_ids")
    .map((value) => asText(value))
    .filter(Boolean);
  const fallback = asText(formData.get("commercial_collection_id"));
  return Array.from(new Set(selected.length > 0 ? selected : fallback ? [fallback] : []));
}

async function getAvailableCatalogItemCode(
  supabase: Awaited<ReturnType<typeof createClient>>,
  baseCode: string,
) {
  const normalizedBase = slugify(baseCode) || `item-${Date.now()}`;
  const { data, error } = await supabase
    .schema("pass")
    .from("catalog_items")
    .select("code")
    .ilike("code", `${normalizedBase}%`);

  if (error) throw new Error(error.message);

  const existingCodes = new Set(
    ((data ?? []) as { code: string | null }[])
      .map((row) => String(row.code ?? "").trim())
      .filter(Boolean),
  );

  if (!existingCodes.has(normalizedBase)) return normalizedBase;
  for (let index = 2; index <= 99; index += 1) {
    const candidate = `${normalizedBase}-${index}`;
    if (!existingCodes.has(candidate)) return candidate;
  }
  return `${normalizedBase}-${Date.now()}`;
}

async function getNextCatalogItemSortOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  siteId: string,
  collectionId: string,
  categoryId: string,
) {
  const { data, error } = await supabase
    .schema("pass")
    .from("catalog_item_collections")
    .select(
      "sort_order,catalog_item:catalog_items!inner(site_id,product_id,commercial_category_id,price_amount,is_active,metadata)",
    )
    .eq("commercial_collection_id", collectionId)
    .eq("is_active", true);

  if (error) throw new Error(error.message);

  const highest = (data ?? []).reduce((currentHighest, relation) => {
    const item = Array.isArray(relation.catalog_item)
      ? relation.catalog_item[0]
      : relation.catalog_item;

    if (
      !item ||
      item.site_id !== siteId ||
      item.commercial_category_id !== categoryId ||
      item.is_active === false ||
      !item.product_id ||
      Number(item.price_amount ?? 0) <= 0 ||
      item.metadata?.source_app !== "viso" ||
      item.metadata?.source_module !== "menu_comercial"
    ) {
      return currentHighest;
    }

    return Math.max(currentHighest, Number(relation.sort_order ?? 0));
  }, 0);

  return highest + 10;
}

async function cleanupCreatedCatalogItem(
  supabase: Awaited<ReturnType<typeof createClient>>,
  catalogItemId: string,
  deleteRelations = false,
) {
  if (deleteRelations) {
    await supabase
      .schema("pass")
      .from("catalog_item_collections")
      .delete()
      .eq("catalog_item_id", catalogItemId);
  }
  await supabase.schema("pass").from("catalog_items").delete().eq("id", catalogItemId);
}

async function createMenuItem(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const siteId = asText(formData.get("site_id"));
  const productId = asText(formData.get("product_id"));
  const name = asText(formData.get("name"));
  const categoryId = asText(formData.get("commercial_category_id"));
  const collectionIds = getRequestedCollectionIds(formData);
  const primaryCollectionId = collectionIds[0] ?? "";

  if (!siteId || !productId || !name || !categoryId || collectionIds.length === 0) {
    redirect(`/menu/new?error=${encodeURIComponent("Faltan campos obligatorios.")}`);
  }

  const priceAmount = asNonNegativeNumber(formData.get("price_amount"));
  if (priceAmount <= 0) {
    redirect(`/menu/new?error=${encodeURIComponent("El precio comercial debe ser mayor a 0.")}`);
  }

  const [
    { data: site, error: siteError },
    { data: sellOption, error: sellOptionError },
    { data: category, error: categoryError },
    { data: selectedCollections, error: collectionsError },
    { data: categoryLinks, error: categoryLinksError },
    { data: duplicateItem, error: duplicateError },
  ] = await Promise.all([
    supabase.from("sites").select("id,code,name").eq("id", siteId).maybeSingle(),
    supabase
      .schema("pass")
      .from("sell_products_by_site")
      .select("product_id,name,sku,base_price,recipe_cost_amount")
      .eq("site_id", siteId)
      .eq("product_id", productId)
      .maybeSingle(),
    supabase
      .schema("pass")
      .from("commercial_categories")
      .select("id,name,code,site_id,is_active")
      .eq("id", categoryId)
      .eq("site_id", siteId)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .schema("pass")
      .from("commercial_collections")
      .select("id,name,code,site_id,is_active")
      .in("id", collectionIds)
      .eq("site_id", siteId)
      .eq("is_active", true),
    supabase
      .schema("pass")
      .from("commercial_collection_categories")
      .select("collection_id,commercial_category_id,is_active")
      .in("collection_id", collectionIds)
      .eq("commercial_category_id", categoryId)
      .eq("is_active", true),
    supabase
      .schema("pass")
      .from("catalog_items")
      .select("id")
      .eq("site_id", siteId)
      .eq("product_id", productId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle(),
  ]);

  const validationError =
    siteError?.message ||
    sellOptionError?.message ||
    categoryError?.message ||
    collectionsError?.message ||
    categoryLinksError?.message ||
    duplicateError?.message;

  if (validationError) {
    redirect(`/menu/new?error=${encodeURIComponent(validationError)}`);
  }
  if (!site) {
    redirect(`/menu/new?error=${encodeURIComponent("La sede seleccionada no existe.")}`);
  }
  if (!sellOption) {
    redirect(`/menu/new?error=${encodeURIComponent("El producto no está habilitado para esta sede.")}`);
  }
  if (!category) {
    redirect(`/menu/new?error=${encodeURIComponent("La categoría no pertenece a esta sede o está inactiva.")}`);
  }
  if ((selectedCollections ?? []).length !== collectionIds.length) {
    redirect(`/menu/new?error=${encodeURIComponent("Una colección no pertenece a la sede o está inactiva.")}`);
  }

  const linkedCollectionIds = new Set(
    (categoryLinks ?? []).map((link) => String(link.collection_id ?? "")),
  );
  const incompatibleCollection = collectionIds.find((id) => !linkedCollectionIds.has(id));
  if (incompatibleCollection) {
    redirect(
      `/menu/new?error=${encodeURIComponent(
        "La categoría elegida no está asignada a una de las colecciones seleccionadas.",
      )}`,
    );
  }
  if (duplicateItem) {
    redirect(
      `/menu/new?error=${encodeURIComponent(
        "Ya existe un producto comercial activo para esta referencia en la sede.",
      )}`,
    );
  }

  const requestedCode = slugify(asText(formData.get("code")));
  const primaryCollection = (selectedCollections ?? []).find(
    (collection) => collection.id === primaryCollectionId,
  );

  let code: string;
  let relationSortOrders: number[];
  try {
    code = await getAvailableCatalogItemCode(
      supabase,
      requestedCode ||
        [site.code || site.name, primaryCollection?.code || primaryCollection?.name, sellOption.sku || sellOption.name]
          .filter(Boolean)
          .join("-"),
    );

    const explicitSortOrderText = asText(formData.get("sort_order"));
    relationSortOrders = explicitSortOrderText
      ? collectionIds.map(() => Math.round(asNonNegativeNumber(formData.get("sort_order"))))
      : await Promise.all(
          collectionIds.map((collectionId) =>
            getNextCatalogItemSortOrder(supabase, siteId, collectionId, categoryId),
          ),
        );
  } catch (error) {
    redirect(
      `/menu/new?error=${encodeURIComponent(
        error instanceof Error ? error.message : "No se pudo generar el código u orden.",
      )}`,
    );
  }

  const compareAtRaw = asText(formData.get("compare_at_amount"));
  const compareAtAmount = compareAtRaw
    ? asNonNegativeNumber(formData.get("compare_at_amount"))
    : null;
  const passCardLayout = parsePassCardLayout(formData.get("pass_card_layout"));
  const opensDetailModal = asBool(formData.get("opens_detail_modal"));
  const categoryDisplayLabel = category.name || category.code || "";

  const { data: createdItem, error: createError } = await supabase
    .schema("pass")
    .from("catalog_items")
    .insert({
      code,
      name,
      site_id: siteId,
      product_id: productId,
      description: asText(formData.get("description")) || null,
      commercial_category_id: categoryId,
      category_label: categoryDisplayLabel,
      image_url: asText(formData.get("image_url")) || null,
      price_amount: priceAmount,
      compare_at_amount: compareAtAmount,
      sort_order: relationSortOrders[0] ?? 10,
      is_active: asBool(formData.get("is_active")),
      is_featured: asBool(formData.get("is_featured")),
      badges: parseBadgesCsv(asText(formData.get("badges_csv"))),
      fulfillment_modes: parseFulfillmentModes(formData),
      metadata: {
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
    .select("id")
    .single();

  if (createError || !createdItem?.id) {
    redirect(
      `/menu/new?error=${encodeURIComponent(createError?.message || "No se pudo crear el producto.")}`,
    );
  }

  const collectionRows = collectionIds.map((collectionId, index) => ({
    catalog_item_id: createdItem.id,
    commercial_collection_id: collectionId,
    sort_order: relationSortOrders[index] ?? relationSortOrders[0] ?? 10,
    is_active: true,
    is_primary: index === 0,
    metadata: { configured_from: "viso_product_form" },
  }));

  const { error: relationsError } = await supabase
    .schema("pass")
    .from("catalog_item_collections")
    .upsert(collectionRows, { onConflict: "catalog_item_id,commercial_collection_id" });

  if (relationsError) {
    await cleanupCreatedCatalogItem(supabase, createdItem.id);
    redirect(`/menu/new?error=${encodeURIComponent(relationsError.message)}`);
  }

  const { error: presentationError } = await supabase
    .schema("pass")
    .from("catalog_item_presentation")
    .upsert(
      {
        catalog_item_id: createdItem.id,
        surface: "vento_pass_menu",
        card_layout: passCardLayout,
        opens_detail_modal: opensDetailModal,
        is_highlighted: passCardLayout === "featured",
        sort_weight: 0,
        metadata: {},
      },
      { onConflict: "catalog_item_id,surface" },
    );

  if (presentationError) {
    await cleanupCreatedCatalogItem(supabase, createdItem.id, true);
    redirect(`/menu/new?error=${encodeURIComponent(presentationError.message)}`);
  }

  redirect(
    `/menu/${createdItem.id}?ok=${encodeURIComponent(
      "Producto creado. Ahora puedes configurar sus opciones.",
    )}`,
  );
}

function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function NewMenuItemPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const query = (await searchParams) ?? {};
  const errorMessage = safeDecode(query.error);

  await requireAppAccess({ appId: "viso", returnTo: "/menu/new" });
  const admin = createAdminClient();

  const [
    { data: sitesRaw },
    { data: sellOptionsRaw },
    { data: categoriesRaw },
    { data: collectionsRaw },
    { data: collectionCategoryLinksRaw },
    { data: existingCommercialItemsRaw },
  ] = await Promise.all([
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
      .eq("metadata->>source_app", "viso")
      .eq("metadata->>source_module", "menu_comercial")
      .order("name"),
  ]);

  const sites = (sitesRaw ?? []) as SiteRow[];
  const categories = (categoriesRaw ?? []) as CommercialCategoryRow[];
  const collections = (collectionsRaw ?? []) as CommercialCollectionRow[];
  const collectionCategoryLinks =
    (collectionCategoryLinksRaw ?? []) as CollectionCategoryLinkRow[];
  const existingCommercialItems =
    (existingCommercialItemsRaw ?? []) as ExistingCommercialItemRow[];

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
    const siteId = String(row.site_id ?? "").trim();
    if (!productId || !siteId) continue;

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

    current.site_ids.add(siteId);
    const price = toOptionalNumber(row.base_price);
    const recipeCost = toOptionalNumber(row.recipe_cost_amount);
    current.site_prices[siteId] = price;
    current.site_recipe_costs[siteId] = recipeCost;
    if (current.default_price == null && price != null) current.default_price = price;
    productsMap.set(productId, current);
  }

  const products = Array.from(productsMap.values())
    .map((product) => ({ ...product, site_ids: Array.from(product.site_ids) }))
    .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), "es-CO"));

  const publishedBySite = new Map<string, Set<string>>();
  for (const item of existingCommercialItems) {
    const itemSiteId = String(item.site_id ?? "").trim();
    const itemProductId = String(item.product_id ?? "").trim();
    if (!itemSiteId || !itemProductId || item.is_active === false) continue;
    const current = publishedBySite.get(itemSiteId) ?? new Set<string>();
    current.add(itemProductId);
    publishedBySite.set(itemSiteId, current);
  }

  const commercialCoverage = sites.map((site) => {
    const sellable = products.filter((product) => product.site_ids.includes(site.id));
    const published = publishedBySite.get(site.id) ?? new Set<string>();
    const missingProducts = sellable
      .filter((product) => !published.has(product.id))
      .map((product) => ({ id: product.id, name: product.name, sku: product.sku }));

    return {
      site_id: site.id,
      site_label: site.name ?? site.code ?? "Sin sede",
      total_sellable: sellable.length,
      created_count: sellable.length - missingProducts.length,
      missing_count: missingProducts.length,
      missing_products: missingProducts,
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Publicar producto en Vento Pass"
        subtitle="Selecciona primero la colección y después una de las categorías configuradas dentro de ella."
        actions={
          <Link href="/menu" className="ui-btn ui-btn--ghost">
            Volver
          </Link>
        }
      />

      {errorMessage ? <div className="ui-alert ui-alert--error">{errorMessage}</div> : null}

      <MenuItemForm
        mode="create"
        sites={sites}
        products={products}
        categories={categories}
        collections={collections}
        collectionCategoryLinks={collectionCategoryLinks}
        existingCommercialItems={existingCommercialItems.map((item) => ({
          id: item.id,
          site_id: item.site_id ?? "",
          product_id: item.product_id,
          name: item.name,
          is_active: item.is_active,
        }))}
        commercialCoverage={commercialCoverage}
        initial={{
          code: "",
          name: "",
          description: "",
          product_id: "",
          price_amount: "",
          compare_at_amount: "",
          sort_order: "",
          is_active: true,
          is_featured: false,
          site_id: sites[0]?.id ?? "",
          commercial_collection_ids: [],
          commercial_category_id: "",
          category_label: "",
          image_url: "",
          badges_csv: "",
          fulfillment_delivery: true,
          fulfillment_pickup: true,
          fulfillment_on_premise: false,
          metadata_extra: "",
          display_group: "",
          variant_label: "",
          pass_card_layout: "compact",
          opens_detail_modal: false,
        }}
        action={createMenuItem}
        secondaryActions={
          <Link href="/menu" className="ui-btn ui-btn--ghost">
            Cancelar
          </Link>
        }
      />
    </div>
  );
}
