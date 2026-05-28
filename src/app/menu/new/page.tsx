import { redirect } from "next/navigation";
import Link from "next/link";

import { MenuItemForm } from "@/components/viso/menu-item-form";
import { PageHeader } from "@/components/vento/standard/page-header";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SellOptionRow = {
  site_id: string | null;
  product_id: string | null;
  name: string | null;
  sku: string | null;
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

type SiteRow = {
  id: string;
  code: string | null;
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

function toOptionalNumber(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type MenuReferencesValidation = {
  error: string;
  categoryLabel: string;
  basePriceAmount: number | null;
  recipeCostAmount: number | null;
  siteCode: string;
  collectionCode: string;
  productCode: string;
};

async function validateCommercialMenuReferences(
  supabase: Awaited<ReturnType<typeof createClient>>,
  productId: string,
  siteId: string,
  commercialCategoryId: string,
  commercialCollectionId: string,
): Promise<MenuReferencesValidation> {
  const [
    { data: site, error: siteError },
    { data: sellOption, error: sellOptionError },
    { data: commercialCategory, error: commercialCategoryError },
    { data: commercialCollection, error: commercialCollectionError },
    { data: collectionCategoryLink, error: collectionCategoryLinkError },
    { data: existingItem, error: existingItemError },
  ] = await Promise.all([
    supabase
      .from("sites")
      .select("id,code,name")
      .eq("id", siteId)
      .maybeSingle(),
    supabase
      .schema("pass")
      .from("sell_products_by_site")
      .select("product_id,name,sku,base_price,recipe_cost_amount")
      .eq("product_id", productId)
      .eq("site_id", siteId)
      .maybeSingle(),
    supabase
      .schema("pass")
      .from("commercial_categories")
      .select("id,name,code,site_id,is_active")
      .eq("id", commercialCategoryId)
      .eq("site_id", siteId)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .schema("pass")
      .from("commercial_collections")
      .select("id,name,code,site_id,kind,is_active")
      .eq("id", commercialCollectionId)
      .eq("site_id", siteId)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .schema("pass")
      .from("commercial_collection_categories")
      .select("collection_id,commercial_category_id")
      .eq("collection_id", commercialCollectionId)
      .eq("commercial_category_id", commercialCategoryId)
      .maybeSingle(),
    supabase
      .schema("pass")
      .from("catalog_items")
      .select("id,name")
      .eq("product_id", productId)
      .eq("site_id", siteId)
      .limit(1)
      .maybeSingle(),
  ]);

  if (siteError) {
    return {
      error: `No se pudo validar la sede: ${siteError.message}`,
      categoryLabel: "",
      basePriceAmount: null,
      recipeCostAmount: null,
      siteCode: "",
      collectionCode: "",
      productCode: "",
    };
  }

  if (!site) {
    return {
      error: "La sede seleccionada no existe.",
      categoryLabel: "",
      basePriceAmount: null,
      recipeCostAmount: null,
      siteCode: "",
      collectionCode: "",
      productCode: "",
    };
  }

  if (sellOptionError) {
    return {
      error: `No se pudo validar el producto operacional: ${sellOptionError.message}`,
      categoryLabel: "",
      basePriceAmount: null,
      recipeCostAmount: null,
      siteCode: "",
      collectionCode: "",
      productCode: "",
    };
  }

  if (!sellOption) {
    return {
      error: "El producto operacional no esta habilitado para esta sede.",
      categoryLabel: "",
      basePriceAmount: null,
      recipeCostAmount: null,
      siteCode: "",
      collectionCode: "",
      productCode: "",
    };
  }

  if (commercialCategoryError) {
    return {
      error: `No se pudo validar la categoria comercial: ${commercialCategoryError.message}`,
      categoryLabel: "",
      basePriceAmount: null,
      recipeCostAmount: null,
      siteCode: "",
      collectionCode: "",
      productCode: "",
    };
  }

  if (!commercialCategory) {
    return {
      error: "La categoria comercial seleccionada no existe, esta inactiva o no pertenece a esta sede.",
      categoryLabel: "",
      basePriceAmount: null,
      recipeCostAmount: null,
      siteCode: "",
      collectionCode: "",
      productCode: "",
    };
  }

  if (commercialCollectionError) {
    return {
      error: `No se pudo validar la coleccion comercial: ${commercialCollectionError.message}`,
      categoryLabel: "",
      basePriceAmount: null,
      recipeCostAmount: null,
      siteCode: "",
      collectionCode: "",
      productCode: "",
    };
  }

  if (!commercialCollection) {
    return {
      error: "La coleccion comercial seleccionada no existe, esta inactiva o no pertenece a esta sede.",
      categoryLabel: "",
      basePriceAmount: null,
      recipeCostAmount: null,
      siteCode: "",
      collectionCode: "",
      productCode: "",
    };
  }

  if (collectionCategoryLinkError) {
    return {
      error: `No se pudo validar la relación entre colección y categoría comercial: ${collectionCategoryLinkError.message}`,
      categoryLabel: "",
      basePriceAmount: null,
      recipeCostAmount: null,
      siteCode: "",
      collectionCode: "",
      productCode: "",
    };
  }

  if (!collectionCategoryLink) {
    return {
      error: "La categoría comercial seleccionada no pertenece a la colección comercial seleccionada.",
      categoryLabel: "",
      basePriceAmount: null,
      recipeCostAmount: null,
      siteCode: "",
      collectionCode: "",
      productCode: "",
    };
  }

  if (existingItemError) {
    return {
      error: `No se pudo validar si el item ya existe: ${existingItemError.message}`,
      categoryLabel: "",
      basePriceAmount: null,
      recipeCostAmount: null,
      siteCode: "",
      collectionCode: "",
      productCode: "",
    };
  }

  if (existingItem) {
    return {
      error: "Ya existe un item comercial para este producto en esta sede. Edita el item existente en lugar de crear otro.",
      categoryLabel: "",
      basePriceAmount: null,
      recipeCostAmount: null,
      siteCode: "",
      collectionCode: "",
      productCode: "",
    };
  }

  const categoryLabel = commercialCategory.name || commercialCategory.code || "";

  if (!categoryLabel) {
    return {
      error: "La categoria comercial seleccionada no tiene nombre ni codigo.",
      categoryLabel: "",
      basePriceAmount: null,
      recipeCostAmount: null,
      siteCode: "",
      collectionCode: "",
      productCode: "",
    };
  }

  return {
    error: "",
    categoryLabel,
    basePriceAmount: toOptionalNumber(sellOption.base_price),
    recipeCostAmount: toOptionalNumber(sellOption.recipe_cost_amount),
    siteCode: site.code || site.name || siteId,
    collectionCode: commercialCollection.code || commercialCollection.name || commercialCollectionId,
    productCode: sellOption.sku || sellOption.name || productId,
  };
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

  if (error) {
    throw new Error(`No se pudo validar el código automático: ${error.message}`);
  }

  const existingCodes = new Set(
    ((data ?? []) as { code: string | null }[])
      .map((row) => String(row.code ?? "").trim())
      .filter(Boolean),
  );

  if (!existingCodes.has(normalizedBase)) {
    return normalizedBase;
  }

  for (let index = 2; index <= 99; index += 1) {
    const candidate = `${normalizedBase}-${index}`;
    if (!existingCodes.has(candidate)) {
      return candidate;
    }
  }

  return `${normalizedBase}-${Date.now()}`;
}

async function getNextCatalogItemSortOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  siteId: string,
  commercialCollectionId: string,
  commercialCategoryId: string,
) {
  const { data, error } = await supabase
    .schema("pass")
    .from("catalog_items")
    .select("sort_order")
    .eq("site_id", siteId)
    .eq("commercial_collection_id", commercialCollectionId)
    .eq("commercial_category_id", commercialCategoryId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo calcular el orden automático: ${error.message}`);
  }

  return Number(data?.sort_order ?? 0) + 10;
}

async function createMenuItem(formData: FormData) {
  "use server";
  const supabase = await createClient();

  const name = asText(formData.get("name"));
  const siteId = asText(formData.get("site_id"));
  const productId = asText(formData.get("product_id"));

  const commercialCollectionId = asText(formData.get("commercial_collection_id"));
  const commercialCategoryId = asText(formData.get("commercial_category_id"));

  if (!name || !siteId || !productId || !commercialCollectionId || !commercialCategoryId) {
    redirect("/menu/new?error=" + encodeURIComponent("Faltan campos obligatorios."));
  }

  const priceAmount = asNonNegativeNumber(formData.get("price_amount"));

  if (priceAmount <= 0) {
    redirect("/menu/new?error=" + encodeURIComponent("El precio comercial debe ser mayor a 0."));
  }

  const compareAtAmountRaw = asText(formData.get("compare_at_amount"));
  const compareAtAmount = compareAtAmountRaw
    ? asNonNegativeNumber(formData.get("compare_at_amount"))
    : null;

  const passCardLayout = parsePassCardLayout(formData.get("pass_card_layout"));

  const referencesValidation = await validateCommercialMenuReferences(
    supabase,
    productId,
    siteId,
    commercialCategoryId,
    commercialCollectionId,
  );

  if (referencesValidation.error) {
    redirect("/menu/new?error=" + encodeURIComponent(referencesValidation.error));
  }

  let code = "";
  let sortOrder = 0;

  try {
    code = await getAvailableCatalogItemCode(
      supabase,
      [
        referencesValidation.siteCode,
        referencesValidation.collectionCode,
        referencesValidation.productCode,
      ]
        .filter(Boolean)
        .join("-"),
    );

    sortOrder = await getNextCatalogItemSortOrder(
      supabase,
      siteId,
      commercialCollectionId,
      commercialCategoryId,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo generar código u orden automático.";
    redirect("/menu/new?error=" + encodeURIComponent(message));
  }

  const commercialMetadata = {
    source_app: "viso",
    source_module: "menu_comercial",
    operational_product_id: productId,
    commercial_collection_id: commercialCollectionId,
    commercial_category_id: commercialCategoryId,
    base_price_amount: referencesValidation.basePriceAmount,
    recipe_cost_amount: referencesValidation.recipeCostAmount,
  };

  const { data: createdItem, error } = await supabase
    .schema("pass")
    .from("catalog_items")
    .insert({
      code,
      name,
      site_id: siteId,
      product_id: productId,
      description: asText(formData.get("description")) || null,
      commercial_collection_id: commercialCollectionId,
      commercial_category_id: commercialCategoryId,
      category_label: referencesValidation.categoryLabel,
      image_url: asText(formData.get("image_url")) || null,
      price_amount: priceAmount,
      compare_at_amount: compareAtAmount,
      sort_order: sortOrder,
      is_active: asBool(formData.get("is_active")),
      is_featured: asBool(formData.get("is_featured")),
      badges: parseBadgesCsv(asText(formData.get("badges_csv"))),
      fulfillment_modes: parseFulfillmentModes(formData),
      metadata: commercialMetadata,
    })
    .select("id")
    .single();

  if (error) {
    redirect("/menu/new?error=" + encodeURIComponent(error.message));
  }

  if (!createdItem?.id) {
    redirect("/menu/new?error=" + encodeURIComponent("Item creado sin identificador."));
  }

  const { error: presentationError } = await supabase
    .schema("pass")
    .from("catalog_item_presentation")
    .upsert(
      {
        catalog_item_id: createdItem.id,
        surface: "vento_pass_menu",
        card_layout: passCardLayout,
        opens_detail_modal: false,
        is_highlighted: passCardLayout === "featured",
        sort_weight: 0,
        metadata: {},
      },
      { onConflict: "catalog_item_id,surface" },
    );

  if (presentationError) {
    redirect("/menu/new?error=" + encodeURIComponent(presentationError.message));
  }

  redirect("/menu?ok=" + encodeURIComponent("Item creado."));
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
  const sp = (await searchParams) ?? {};
  const errorMsg = sp.error ? safeDecode(sp.error) : "";

  await requireAppAccess({
    appId: "viso",
    returnTo: "/menu/new",
  });
  const supabase = createAdminClient();

  const { data: sitesRaw } = await supabase
    .from("sites")
    .select("id,code,name,is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });
  const activeSites = (sitesRaw ?? []) as SiteRow[];

  const [
    { data: sellOptionsRaw },
    { data: categoriesRaw },
    { data: collectionsRaw },
    { data: collectionCategoryLinksRaw },
  ] = await Promise.all([
    supabase
      .schema("pass")
      .from("sell_products_by_site")
      .select("site_id,product_id,name,sku,base_price,recipe_cost_amount")
      .order("name", { ascending: true }),
    supabase
      .schema("pass")
      .from("commercial_categories")
      .select("id,site_id,name,code,is_active")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .schema("pass")
      .from("commercial_collections")
      .select("id,site_id,name,subtitle,code,kind,is_active")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .schema("pass")
      .from("commercial_collection_categories")
      .select("collection_id,commercial_category_id,sort_order")
      .order("sort_order", { ascending: true }),
  ]);

  const productsMap = new Map<
    string,
    {
      id: string;
      name: string | null;
      sku: string | null;
      is_active: boolean;
      site_ids: Set<string>;
      site_prices: Record<string, number | null>;
      site_recipe_costs: Record<string, number | null>;
      default_price: number | null;
    }
  >();

  for (const row of (sellOptionsRaw || []) as SellOptionRow[]) {
    const productId = (row.product_id || "").trim();
    const siteId = (row.site_id || "").trim();
    if (!productId || !siteId) continue;

    if (!productsMap.has(productId)) {
      productsMap.set(productId, {
        id: productId,
        name: row.name ?? null,
        sku: row.sku ?? null,
        is_active: true,
        site_ids: new Set<string>(),
        site_prices: {},
        site_recipe_costs: {},
        default_price: null,
      });
    }

    const entry = productsMap.get(productId);
    if (!entry) continue;

    entry.site_ids.add(siteId);
    const rawPrice = row.base_price;
    const parsedPrice =
      typeof rawPrice === "number" ? rawPrice : Number(rawPrice);
    if (Number.isFinite(parsedPrice)) {
      entry.site_prices[siteId] = parsedPrice;
      if (entry.default_price == null) {
        entry.default_price = parsedPrice;
      }
    } else {
      entry.site_prices[siteId] = null;
    }

    const rawRecipeCost = row.recipe_cost_amount;
    const parsedRecipeCost =
      typeof rawRecipeCost === "number" ? rawRecipeCost : Number(rawRecipeCost);
    entry.site_recipe_costs[siteId] = Number.isFinite(parsedRecipeCost) ? parsedRecipeCost : null;
  }

  const products = Array.from(productsMap.values())
    .map((item) => ({
      id: item.id,
      name: item.name,
      sku: item.sku,
      is_active: item.is_active,
      site_ids: Array.from(item.site_ids),
      site_prices: item.site_prices,
      site_recipe_costs: item.site_recipe_costs,
      default_price: item.default_price,
    }))
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "es-CO"));

  const categorySiteIds = new Set(
    ((categoriesRaw ?? []) as CommercialCategoryRow[])
      .map((category) => String(category.site_id ?? "").trim())
      .filter(Boolean),
  );

  const collectionSiteIds = new Set(
    ((collectionsRaw ?? []) as CommercialCollectionRow[])
      .map((collection) => String(collection.site_id ?? "").trim())
      .filter(Boolean),
  );

  const commercialSites = activeSites.filter((site) => {
    return categorySiteIds.has(site.id) && collectionSiteIds.has(site.id);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Crear item comercial"
        subtitle="Catalogo de compras por satélite. Las categorias comerciales se crean por sede."
        actions={
          <Link href="/menu" className="ui-btn ui-btn--ghost">
            Volver
          </Link>
        }
      />
      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}
      <MenuItemForm
        mode="create"
        action={createMenuItem}
        sites={commercialSites}
        products={products}
        categories={(categoriesRaw ?? []) as CommercialCategoryRow[]}
        collections={(collectionsRaw ?? []) as CommercialCollectionRow[]}
        collectionCategoryLinks={(collectionCategoryLinksRaw ?? []) as CollectionCategoryLinkRow[]}
        initial={{
          code: "",
          name: "",
          description: "",
          product_id: "",
          price_amount: "",
          compare_at_amount: "",
          sort_order: "0",
          is_active: true,
          is_featured: false,
          site_id: commercialSites[0]?.id ?? "",
          commercial_collection_id: "",
          commercial_category_id: "",
          category_label: "",
          image_url: "",
          badges_csv: "",
          fulfillment_delivery: true,
          fulfillment_pickup: true,
          fulfillment_on_premise: true,
          metadata_extra: "",
          pass_card_layout: "compact",
        }}
      />
    </div>
  );
}
