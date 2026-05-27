import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

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
  price_amount: number;
  compare_at_amount: number | null;
  sort_order: number;
  is_active: boolean;
  is_featured: boolean;
  badges: string[] | null;
  fulfillment_modes: string[] | null;
  metadata: Record<string, unknown> | null;
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

function sameStringList(a: string[] | null | undefined, b: string[]) {
  const left = [...(a ?? [])].sort();
  const right = [...b].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameOptionalNumber(a: number | null | undefined, b: number | null) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Number(a) === Number(b);
}

function sameJsonObject(a: Record<string, unknown> | null | undefined, b: Record<string, unknown>) {
  return JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
}

function isImageOnlyCatalogChange(current: CatalogItemRow, formData: FormData) {
  const compareAtAmountRaw = asText(formData.get("compare_at_amount"));
  const compareAtAmount = compareAtAmountRaw
    ? asNonNegativeNumber(formData.get("compare_at_amount"))
    : null;
  const { metadata, error: metadataError } = parseMetadata(asText(formData.get("metadata_extra")));
  if (metadataError) return false;

  return (
    asText(formData.get("code")) === current.code &&
    asText(formData.get("name")) === current.name &&
    asText(formData.get("site_id")) === current.site_id &&
    asText(formData.get("product_id")) === (current.product_id ?? "") &&
    asText(formData.get("description")) === (current.description ?? "") &&
    asText(formData.get("commercial_collection_id")) === (current.commercial_collection_id ?? "") &&
    asText(formData.get("commercial_category_id")) === (current.commercial_category_id ?? "") &&
    asNonNegativeNumber(formData.get("price_amount")) === Number(current.price_amount ?? 0) &&
    sameOptionalNumber(current.compare_at_amount, compareAtAmount) &&
    Math.round(asNonNegativeNumber(formData.get("sort_order"))) === Number(current.sort_order ?? 0) &&
    asBool(formData.get("is_active")) === current.is_active &&
    asBool(formData.get("is_featured")) === current.is_featured &&
    sameStringList(current.badges, parseBadgesCsv(asText(formData.get("badges_csv")))) &&
    sameStringList(current.fulfillment_modes, parseFulfillmentModes(formData)) &&
    sameJsonObject(current.metadata, metadata) &&
    asText(formData.get("image_url")) !== (current.image_url ?? "")
  );
}

function parseMetadata(extraRaw: string) {
  if (!extraRaw) return { metadata: {}, error: "" };
  try {
    const parsed = JSON.parse(extraRaw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { metadata: parsed as Record<string, unknown>, error: "" };
    }
    return { metadata: {}, error: "Metadata extra debe ser un JSON object valido." };
  } catch {
    return { metadata: {}, error: "Metadata extra debe ser un JSON valido." };
  }
}

function toOptionalNumber(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

type MenuReferencesValidation = {
  error: string;
  categoryLabel: string;
  basePriceAmount: number | null;
  recipeCostAmount: number | null;
};

async function validateCommercialMenuReferences(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemId: string,
  productId: string,
  siteId: string,
  commercialCategoryId: string,
  commercialCollectionId: string,
): Promise<MenuReferencesValidation> {
  const [
    { data: sellOption, error: sellOptionError },
    { data: commercialCategory, error: commercialCategoryError },
    { data: commercialCollection, error: commercialCollectionError },
    { data: existingItem, error: existingItemError },
  ] = await Promise.all([
    supabase
      .schema("pass")
      .from("sell_products_by_site")
      .select("product_id,base_price,recipe_cost_amount")
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
      .from("catalog_items")
      .select("id,name")
      .eq("product_id", productId)
      .eq("site_id", siteId)
      .neq("id", itemId)
      .limit(1)
      .maybeSingle(),
  ]);

  if (sellOptionError) {
    return {
      error: `No se pudo validar el producto operacional: ${sellOptionError.message}`,
      categoryLabel: "",
      basePriceAmount: null,
      recipeCostAmount: null,
    };
  }

  if (!sellOption) {
    return {
      error: "El producto operacional no esta habilitado para esta sede.",
      categoryLabel: "",
      basePriceAmount: null,
      recipeCostAmount: null,
    };
  }

  if (commercialCategoryError) {
    return {
      error: `No se pudo validar la categoria comercial: ${commercialCategoryError.message}`,
      categoryLabel: "",
      basePriceAmount: null,
      recipeCostAmount: null,
    };
  }

  if (!commercialCategory) {
    return {
      error: "La categoria comercial seleccionada no existe, esta inactiva o no pertenece a esta sede.",
      categoryLabel: "",
      basePriceAmount: null,
      recipeCostAmount: null,
    };
  }

  if (commercialCollectionError) {
    return {
      error: `No se pudo validar la coleccion comercial: ${commercialCollectionError.message}`,
      categoryLabel: "",
      basePriceAmount: null,
      recipeCostAmount: null,
    };
  }

  if (!commercialCollection) {
    return {
      error: "La coleccion comercial seleccionada no existe, esta inactiva o no pertenece a esta sede.",
      categoryLabel: "",
      basePriceAmount: null,
      recipeCostAmount: null,
    };
  }

  if (existingItemError) {
    return {
      error: `No se pudo validar si el item ya existe: ${existingItemError.message}`,
      categoryLabel: "",
      basePriceAmount: null,
      recipeCostAmount: null,
    };
  }

  if (existingItem) {
    return {
      error: "Ya existe otro item comercial para este producto en esta sede. Edita ese item o selecciona otro producto.",
      categoryLabel: "",
      basePriceAmount: null,
      recipeCostAmount: null,
    };
  }

  const categoryLabel = commercialCategory.name || commercialCategory.code || "";

  if (!categoryLabel) {
    return {
      error: "La categoria comercial seleccionada no tiene nombre ni codigo.",
      categoryLabel: "",
      basePriceAmount: null,
      recipeCostAmount: null,
    };
  }

  return {
    error: "",
    categoryLabel,
    basePriceAmount: toOptionalNumber(sellOption.base_price),
    recipeCostAmount: toOptionalNumber(sellOption.recipe_cost_amount),
  };
}

async function updateMenuItem(formData: FormData) {
  "use server";
  const supabase = await createClient();

  const id = asText(formData.get("id"));
  const code = asText(formData.get("code"));
  const name = asText(formData.get("name"));
  const siteId = asText(formData.get("site_id"));
  const productId = asText(formData.get("product_id"));

  const commercialCollectionId = asText(formData.get("commercial_collection_id"));
  const commercialCategoryId = asText(formData.get("commercial_category_id"));

  if (!id || !code || !name || !siteId || !productId || !commercialCollectionId || !commercialCategoryId) {
    redirect(`/menu/${id}?error=${encodeURIComponent("Faltan campos obligatorios.")}`);
  }

  const admin = createAdminClient();
  const { data: currentItem } = await admin
    .schema("pass")
    .from("catalog_items")
    .select("id,code,name,description,site_id,product_id,commercial_collection_id,commercial_category_id,category_label,image_url,price_amount,compare_at_amount,sort_order,is_active,is_featured,badges,fulfillment_modes,metadata")
    .eq("id", id)
    .maybeSingle();

  if (currentItem && isImageOnlyCatalogChange(currentItem as CatalogItemRow, formData)) {
    const { error: imageError } = await supabase
      .schema("pass")
      .rpc("update_catalog_item_image", {
        p_item_id: id,
        p_image_url: asText(formData.get("image_url")) || null,
      });

    if (imageError) {
      redirect(`/menu/${id}?error=${encodeURIComponent(imageError.message)}`);
    }

    revalidatePath(`/menu/${id}`);
    revalidatePath("/menu");
    redirect("/menu?ok=" + encodeURIComponent("Foto actualizada."));
  }

  const priceAmount = asNonNegativeNumber(formData.get("price_amount"));

  if (priceAmount <= 0) {
    redirect(`/menu/${id}?error=${encodeURIComponent("El precio comercial debe ser mayor a 0.")}`);
  }

  const compareAtAmountRaw = asText(formData.get("compare_at_amount"));
  const compareAtAmount = compareAtAmountRaw
    ? asNonNegativeNumber(formData.get("compare_at_amount"))
    : null;

  const sortOrder = Math.round(asNonNegativeNumber(formData.get("sort_order")));

  const { metadata, error: metadataError } = parseMetadata(asText(formData.get("metadata_extra")));
  if (metadataError) {
    redirect(`/menu/${id}?error=${encodeURIComponent(metadataError)}`);
  }

  const referencesValidation = await validateCommercialMenuReferences(
    supabase,
    id,
    productId,
    siteId,
    commercialCategoryId,
    commercialCollectionId,
  );

  if (referencesValidation.error) {
    redirect(`/menu/${id}?error=${encodeURIComponent(referencesValidation.error)}`);
  }

  const commercialMetadata = {
    ...metadata,
    source_app: "viso",
    source_module: "menu_comercial",
    operational_product_id: productId,
    commercial_collection_id: commercialCollectionId,
    commercial_category_id: commercialCategoryId,
    base_price_amount: referencesValidation.basePriceAmount,
    recipe_cost_amount: referencesValidation.recipeCostAmount,
  };

  const { error } = await supabase
    .schema("pass").from("catalog_items")
    .update({
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
    .eq("id", id);

  if (error) {
    redirect(`/menu/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/menu/${id}`);
  revalidatePath("/menu");
  redirect("/menu?ok=" + encodeURIComponent("Item actualizado."));
}

async function disableMenuItem(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const id = asText(formData.get("id"));
  if (!id) {
    redirect("/menu?error=" + encodeURIComponent("Item invalido."));
  }

  const { error } = await supabase.schema("pass").from("catalog_items").update({ is_active: false }).eq("id", id);
  if (error) {
    redirect(`/menu/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/menu/${id}`);
  revalidatePath("/menu");
  redirect(`/menu/${id}?ok=${encodeURIComponent("Item deshabilitado.")}`);
}

async function deleteMenuItem(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const id = asText(formData.get("id"));
  if (!id) {
    redirect("/menu?error=" + encodeURIComponent("Item invalido."));
  }

  const { error } = await supabase.schema("pass").from("catalog_items").delete().eq("id", id);
  if (error) {
    redirect(`/menu/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/menu");
  redirect("/menu?ok=" + encodeURIComponent("Item eliminado."));
}

function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function MenuItemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const okMsg = sp.ok ? safeDecode(sp.ok) : "";
  const errorMsg = sp.error ? safeDecode(sp.error) : "";
  const { id } = await params;

  await requireAppAccess({
    appId: "viso",
    returnTo: `/menu/${id}`,
  });
  const supabase = createAdminClient();

  const [{ data: item }, { data: sitesRaw }, { data: categoriesRaw }, { data: collectionsRaw }] = await Promise.all([
    supabase
      .schema("pass").from("catalog_items")
      .select("id,code,name,description,site_id,product_id,commercial_collection_id,commercial_category_id,category_label,image_url,price_amount,compare_at_amount,sort_order,is_active,is_featured,badges,fulfillment_modes,metadata")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("sites").select("id,code,name,is_active").eq("is_active", true).order("name", { ascending: true }),
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
  ]);

  const { data: sellOptionsRaw } = await supabase
    .schema("pass").from("sell_products_by_site")
    .select("site_id,product_id,name,sku,base_price,recipe_cost_amount")
    .order("name", { ascending: true });

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

  if (!item) {
    redirect("/menu?error=" + encodeURIComponent("Item no encontrado."));
  }

  const row = item as CatalogItemRow;
  const sites = (sitesRaw ?? []) as SiteRow[];
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Editar item comercial"
        subtitle="Ajusta la publicación comercial por sede: categoría comercial, precio, foto y disponibilidad."
        actions={<Link href="/menu" className="ui-btn ui-btn--ghost">Volver</Link>}
      />

      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}

      <MenuItemForm
        mode="edit"
        action={updateMenuItem}
        sites={sites ?? []}
        products={products}
        categories={(categoriesRaw ?? []) as CommercialCategoryRow[]}
        collections={(collectionsRaw ?? []) as CommercialCollectionRow[]}
        initial={{
          id: row.id,
          code: row.code,
          name: row.name,
          description: row.description ?? "",
          product_id: row.product_id ?? "",
          price_amount: String(row.price_amount ?? 0),
          compare_at_amount: row.compare_at_amount == null ? "" : String(row.compare_at_amount),
          sort_order: String(row.sort_order ?? 0),
          is_active: row.is_active,
          is_featured: row.is_featured,
          site_id: row.site_id,
          commercial_collection_id: row.commercial_collection_id ?? "",
          commercial_category_id: row.commercial_category_id ?? "",
          category_label: row.category_label ?? "",
          image_url: row.image_url ?? "",
          badges_csv: (row.badges ?? []).join(", "),
          fulfillment_delivery: (row.fulfillment_modes ?? []).includes("delivery"),
          fulfillment_pickup: (row.fulfillment_modes ?? []).includes("pickup"),
          fulfillment_on_premise: (row.fulfillment_modes ?? []).includes("on_premise"),
          metadata_extra: Object.keys(metadata).length ? JSON.stringify(metadata, null, 2) : "",
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <form action={disableMenuItem}><input type="hidden" name="id" value={row.id} /><button type="submit" className="ui-btn ui-btn--ghost">Deshabilitar</button></form>
        <form action={deleteMenuItem}><input type="hidden" name="id" value={row.id} /><button type="submit" className="ui-btn ui-btn--danger">Eliminar item</button></form>
      </div>
    </div>
  );
}
