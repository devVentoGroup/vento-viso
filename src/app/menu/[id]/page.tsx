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

type CatalogItemPresentationRow = {
  catalog_item_id: string;
  surface: string;
  card_layout: string;
  opens_detail_modal: boolean | null;
  is_highlighted: boolean | null;
  sort_weight: number | null;
  metadata: Record<string, unknown> | null;
};

type CatalogItemOptionGroupRow = {
  id: string;
  catalog_item_id: string;
  code: string;
  name: string;
  description: string | null;
  selection_type: string;
  is_required: boolean;
  min_select: number;
  max_select: number;
  sort_order: number;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
};

type CatalogItemOptionRow = {
  id: string;
  option_group_id: string;
  code: string;
  name: string;
  description: string | null;
  price_delta_amount: number | string;
  product_id: string | null;
  effect_type: string;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
  metadata: Record<string, unknown> | null;
};

type CatalogItemOptionConsumptionRuleRow = {
  id: string;
  option_id: string;
  code: string;
  name: string;
  product_id: string;
  effect_type: string;
  quantity_per_option: number | string;
  stock_unit_code: string | null;
  input_quantity_per_option: number | string | null;
  input_unit_code: string | null;
  conversion_factor_to_stock: number | string;
  input_uom_profile_id: string | null;
  source_location_strategy: string;
  source_location_id: string | null;
  source_location_position_id: string | null;
  is_active: boolean;
  sort_order: number;
  metadata: Record<string, unknown> | null;
};

type CatalogItemOptionRecipeEffectRow = {
  id: string;
  option_id: string;
  effect_type: string;
  target_ingredient_product_id: string;
  recipe_component_code: string | null;
  quantity_mode: string;
  quantity_amount: number | string | null;
  stock_unit_code: string | null;
  is_active: boolean;
  sort_order: number;
  metadata: Record<string, unknown> | null;
};

type RecipeIngredientRow = {
  id: string;
  product_id: string;
  ingredient_product_id: string;
  quantity: number | string;
  is_active: boolean | null;
};

type OperationalProductRow = {
  id: string;
  name: string | null;
  sku: string | null;
  unit: string | null;
  stock_unit_code: string | null;
  product_type: string | null;
  is_active: boolean | null;
};

type InventoryUnitRow = {
  code: string;
  name: string;
  symbol: string | null;
  family: string | null;
  is_active: boolean | null;
};

type ProductUomProfileRow = {
  id: string;
  product_id: string;
  label: string;
  input_unit_code: string;
  qty_in_input_unit: number | string;
  qty_in_stock_unit: number | string;
  is_active: boolean | null;
};

type InventoryLocationRow = {
  id: string;
  site_id: string;
  code: string;
  zone: string;
  description: string | null;
  location_type: string | null;
  is_active: boolean | null;
};

type InventoryLocationPositionRow = {
  id: string;
  site_id: string;
  location_id: string;
  code: string;
  name: string;
  kind: string;
  is_active: boolean | null;
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

function parsePassCardLayout(value: FormDataEntryValue | string | null | undefined) {
  const layout = typeof value === "string" ? value.trim() : "";
  return layout === "featured" ? "featured" : "compact";
}

function parseSelectionType(value: FormDataEntryValue | string | null | undefined) {
  const selectionType = typeof value === "string" ? value.trim() : "";
  return selectionType === "multiple" ? "multiple" : "single";
}

function parseSourceLocationStrategy(value: FormDataEntryValue | string | null | undefined) {
  const strategy = typeof value === "string" ? value.trim() : "";
  if (strategy === "explicit_location" || strategy === "explicit_position") return strategy;
  return "product_production_location";
}

function parseOptionEffectType(value: FormDataEntryValue | string | null | undefined) {
  const effectType = typeof value === "string" ? value.trim() : "";
  if (
    effectType === "additive" ||
    effectType === "replacement" ||
    effectType === "removal"
  ) {
    return effectType;
  }

  return "preference";
}

function parseConsumptionEffectType(value: FormDataEntryValue | string | null | undefined) {
  const effectType = typeof value === "string" ? value.trim() : "";
  return effectType === "replacement" ? "replacement" : "additive";
}

function parseRecipeEffectType(value: FormDataEntryValue | string | null | undefined) {
  const effectType = typeof value === "string" ? value.trim() : "";
  return effectType === "replacement" ? "replacement" : "removal";
}

function parseRecipeEffectQuantityMode(value: FormDataEntryValue | string | null | undefined) {
  const mode = typeof value === "string" ? value.trim() : "";
  return mode === "fixed_quantity" ? "fixed_quantity" : "full_recipe_component";
}

function getEffectTypeLabel(value: string | null | undefined) {
  switch (value) {
    case "additive":
      return "Extra";
    case "replacement":
      return "Reemplazo";
    case "removal":
      return "Retiro";
    case "preference":
    default:
      return "Preferencia";
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

function asCatalogCode(value: FormDataEntryValue | null, fallback: string) {
  return slugify(asText(value) || fallback);
}

function asOptionalText(value: FormDataEntryValue | null) {
  const text = asText(value);
  return text || null;
}

function asOptionalPositiveNumber(value: FormDataEntryValue | null) {
  const raw = asText(value);
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function normalizeSelectBounds(formData: FormData, selectionType: string, isRequired: boolean) {
  const rawMin = Math.round(asNonNegativeNumber(formData.get("min_select")));
  const rawMax = Math.round(asNonNegativeNumber(formData.get("max_select")));
  const minSelect = Math.max(isRequired ? 1 : 0, rawMin);

  if (selectionType === "single") {
    return {
      minSelect: Math.min(minSelect, 1),
      maxSelect: 1,
    };
  }

  return {
    minSelect,
    maxSelect: Math.max(1, rawMax, minSelect),
  };
}

function formatCopAdmin(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);

  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(parsed) ? parsed : 0);
}

function formatQuantityAdmin(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(parsed)) return "0";
  return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
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

  const passCardLayout = parsePassCardLayout(formData.get("pass_card_layout"));
  const opensDetailModal = asBool(formData.get("opens_detail_modal"));

  const admin = createAdminClient();
  const [{ data: currentItem }, { data: currentPresentationRaw }] = await Promise.all([
    admin
      .schema("pass")
      .from("catalog_items")
      .select("id,code,name,description,site_id,product_id,commercial_collection_id,commercial_category_id,category_label,image_url,price_amount,compare_at_amount,sort_order,is_active,is_featured,badges,fulfillment_modes,metadata")
      .eq("id", id)
      .maybeSingle(),
    admin
      .schema("pass")
      .from("catalog_item_presentation")
      .select("catalog_item_id,surface,card_layout,opens_detail_modal,is_highlighted,sort_weight,metadata")
      .eq("catalog_item_id", id)
      .eq("surface", "vento_pass_menu")
      .maybeSingle(),
  ]);

  const currentPresentation = (currentPresentationRaw ?? null) as CatalogItemPresentationRow | null;
  const currentPassCardLayout = parsePassCardLayout(currentPresentation?.card_layout);
  const currentOpensDetailModal = Boolean(currentPresentation?.opens_detail_modal);

  if (
    currentItem &&
    currentPassCardLayout === passCardLayout &&
    currentOpensDetailModal === opensDetailModal &&
    isImageOnlyCatalogChange(currentItem as CatalogItemRow, formData)
  ) {
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
        sort_weight: currentPresentation?.sort_weight ?? 0,
        metadata: currentPresentation?.metadata ?? {},
      },
      { onConflict: "catalog_item_id,surface" },
    );

  if (presentationError) {
    redirect(`/menu/${id}?error=${encodeURIComponent(presentationError.message)}`);
  }

  revalidatePath(`/menu/${id}`);
  revalidatePath("/menu");
  redirect("/menu?ok=" + encodeURIComponent("Item actualizado."));
}


async function createOptionGroup(formData: FormData) {
  "use server";
  const supabase = await createClient();

  const itemId = asText(formData.get("catalog_item_id"));
  const name = asText(formData.get("name"));
  const description = asText(formData.get("description")) || null;
  const selectionType = parseSelectionType(formData.get("selection_type"));
  const isRequired = asBool(formData.get("is_required"));
  const { minSelect, maxSelect } = normalizeSelectBounds(formData, selectionType, isRequired);
  const sortOrder = Math.round(asNonNegativeNumber(formData.get("sort_order")));
  const code = asCatalogCode(formData.get("code"), name);

  if (!itemId || !name || !code) {
    redirect(`/menu/${itemId || ""}?error=${encodeURIComponent("Faltan datos para crear el grupo de opciones.")}`);
  }

  const { error } = await supabase
    .schema("pass")
    .from("catalog_item_option_groups")
    .insert({
      catalog_item_id: itemId,
      code,
      name,
      description,
      selection_type: selectionType,
      is_required: isRequired,
      min_select: minSelect,
      max_select: maxSelect,
      sort_order: sortOrder,
      is_active: true,
      metadata: {},
    });

  if (error) {
    redirect(`/menu/${itemId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/menu/${itemId}`);
  redirect(`/menu/${itemId}?ok=${encodeURIComponent("Grupo de opciones creado.")}`);
}

async function updateOptionGroup(formData: FormData) {
  "use server";
  const supabase = await createClient();

  const itemId = asText(formData.get("catalog_item_id"));
  const groupId = asText(formData.get("option_group_id"));
  const name = asText(formData.get("name"));
  const description = asText(formData.get("description")) || null;
  const selectionType = parseSelectionType(formData.get("selection_type"));
  const isRequired = asBool(formData.get("is_required"));
  const isActive = asBool(formData.get("is_active"));
  const { minSelect, maxSelect } = normalizeSelectBounds(formData, selectionType, isRequired);
  const sortOrder = Math.round(asNonNegativeNumber(formData.get("sort_order")));
  const code = asCatalogCode(formData.get("code"), name);

  if (!itemId || !groupId || !name || !code) {
    redirect(`/menu/${itemId || ""}?error=${encodeURIComponent("Faltan datos para actualizar el grupo de opciones.")}`);
  }

  const { error } = await supabase
    .schema("pass")
    .from("catalog_item_option_groups")
    .update({
      code,
      name,
      description,
      selection_type: selectionType,
      is_required: isRequired,
      min_select: minSelect,
      max_select: maxSelect,
      sort_order: sortOrder,
      is_active: isActive,
    })
    .eq("id", groupId)
    .eq("catalog_item_id", itemId);

  if (error) {
    redirect(`/menu/${itemId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/menu/${itemId}`);
  redirect(`/menu/${itemId}?ok=${encodeURIComponent("Grupo de opciones actualizado.")}`);
}

async function disableOptionGroup(formData: FormData) {
  "use server";
  const supabase = await createClient();

  const itemId = asText(formData.get("catalog_item_id"));
  const groupId = asText(formData.get("option_group_id"));

  if (!itemId || !groupId) {
    redirect(`/menu/${itemId || ""}?error=${encodeURIComponent("Grupo de opciones invalido.")}`);
  }

  const { error } = await supabase
    .schema("pass")
    .from("catalog_item_option_groups")
    .update({ is_active: false })
    .eq("id", groupId)
    .eq("catalog_item_id", itemId);

  if (error) {
    redirect(`/menu/${itemId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/menu/${itemId}`);
  redirect(`/menu/${itemId}?ok=${encodeURIComponent("Grupo de opciones desactivado.")}`);
}

async function createOption(formData: FormData) {
  "use server";
  const supabase = await createClient();

  const itemId = asText(formData.get("catalog_item_id"));
  const groupId = asText(formData.get("option_group_id"));
  const name = asText(formData.get("name"));
  const description = asText(formData.get("description")) || null;
  const code = asCatalogCode(formData.get("code"), name);
  const priceDeltaAmount = asNonNegativeNumber(formData.get("price_delta_amount"));
  const effectType = parseOptionEffectType(formData.get("effect_type"));
  const sortOrder = Math.round(asNonNegativeNumber(formData.get("sort_order")));

  if (!itemId || !groupId || !name || !code) {
    redirect(`/menu/${itemId || ""}?error=${encodeURIComponent("Faltan datos para crear la opcion.")}`);
  }

  const { data: group, error: groupError } = await supabase
    .schema("pass")
    .from("catalog_item_option_groups")
    .select("id,catalog_item_id")
    .eq("id", groupId)
    .eq("catalog_item_id", itemId)
    .maybeSingle();

  if (groupError || !group) {
    redirect(`/menu/${itemId}?error=${encodeURIComponent(groupError?.message || "El grupo de opciones no pertenece a este item.")}`);
  }

  const { error } = await supabase
    .schema("pass")
    .from("catalog_item_options")
    .insert({
      option_group_id: groupId,
      code,
      name,
      description,
      price_delta_amount: priceDeltaAmount,
      product_id: null,
      effect_type: effectType,
      is_default: asBool(formData.get("is_default")),
      is_active: true,
      sort_order: sortOrder,
      metadata: {},
    });

  if (error) {
    redirect(`/menu/${itemId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/menu/${itemId}`);
  redirect(`/menu/${itemId}?ok=${encodeURIComponent("Opcion creada.")}`);
}

async function updateOption(formData: FormData) {
  "use server";
  const supabase = await createClient();

  const itemId = asText(formData.get("catalog_item_id"));
  const groupId = asText(formData.get("option_group_id"));
  const optionId = asText(formData.get("option_id"));
  const name = asText(formData.get("name"));
  const description = asText(formData.get("description")) || null;
  const code = asCatalogCode(formData.get("code"), name);
  const priceDeltaAmount = asNonNegativeNumber(formData.get("price_delta_amount"));
  const effectType = parseOptionEffectType(formData.get("effect_type"));
  const sortOrder = Math.round(asNonNegativeNumber(formData.get("sort_order")));

  if (!itemId || !groupId || !optionId || !name || !code) {
    redirect(`/menu/${itemId || ""}?error=${encodeURIComponent("Faltan datos para actualizar la opcion.")}`);
  }

  const { data: group, error: groupError } = await supabase
    .schema("pass")
    .from("catalog_item_option_groups")
    .select("id,catalog_item_id")
    .eq("id", groupId)
    .eq("catalog_item_id", itemId)
    .maybeSingle();

  if (groupError || !group) {
    redirect(`/menu/${itemId}?error=${encodeURIComponent(groupError?.message || "El grupo de opciones no pertenece a este item.")}`);
  }

  const { error } = await supabase
    .schema("pass")
    .from("catalog_item_options")
    .update({
      code,
      name,
      description,
      price_delta_amount: priceDeltaAmount,
      effect_type: effectType,
      is_default: asBool(formData.get("is_default")),
      is_active: asBool(formData.get("is_active")),
      sort_order: sortOrder,
    })
    .eq("id", optionId)
    .eq("option_group_id", groupId);

  if (error) {
    redirect(`/menu/${itemId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/menu/${itemId}`);
  redirect(`/menu/${itemId}?ok=${encodeURIComponent("Opcion actualizada.")}`);
}

async function disableOption(formData: FormData) {
  "use server";
  const supabase = await createClient();

  const itemId = asText(formData.get("catalog_item_id"));
  const groupId = asText(formData.get("option_group_id"));
  const optionId = asText(formData.get("option_id"));

  if (!itemId || !groupId || !optionId) {
    redirect(`/menu/${itemId || ""}?error=${encodeURIComponent("Opcion invalida.")}`);
  }

  const { error } = await supabase
    .schema("pass")
    .from("catalog_item_options")
    .update({ is_active: false })
    .eq("id", optionId)
    .eq("option_group_id", groupId);

  if (error) {
    redirect(`/menu/${itemId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/menu/${itemId}`);
  redirect(`/menu/${itemId}?ok=${encodeURIComponent("Opcion desactivada.")}`);
}

function buildConsumptionLocationPayload(formData: FormData) {
  const sourceLocationStrategy = parseSourceLocationStrategy(formData.get("source_location_strategy"));
  const sourceLocationId = asOptionalText(formData.get("source_location_id"));
  const sourceLocationPositionId = asOptionalText(formData.get("source_location_position_id"));

  if (sourceLocationStrategy === "product_production_location") {
    return {
      source_location_strategy: sourceLocationStrategy,
      source_location_id: null,
      source_location_position_id: null,
      error: "",
    };
  }

  if (sourceLocationStrategy === "explicit_location" && !sourceLocationId) {
    return {
      source_location_strategy: sourceLocationStrategy,
      source_location_id: null,
      source_location_position_id: null,
      error: "Selecciona el LOC explícito para esta regla de consumo.",
    };
  }

  if (sourceLocationStrategy === "explicit_position" && (!sourceLocationId || !sourceLocationPositionId)) {
    return {
      source_location_strategy: sourceLocationStrategy,
      source_location_id: sourceLocationId,
      source_location_position_id: null,
      error: "Selecciona LOC y posición interna para esta regla de consumo.",
    };
  }

  return {
    source_location_strategy: sourceLocationStrategy,
    source_location_id: sourceLocationId,
    source_location_position_id: sourceLocationStrategy === "explicit_position" ? sourceLocationPositionId : null,
    error: "",
  };
}

function parseConsumptionRulePayload(formData: FormData) {
  const itemId = asText(formData.get("catalog_item_id"));
  const optionId = asText(formData.get("option_id"));
  const productId = asText(formData.get("product_id"));
  const quantityPerOption = asNonNegativeNumber(formData.get("quantity_per_option"));
  const name = asText(formData.get("name"));
  const code = asCatalogCode(formData.get("code"), name || productId);
  const inputQuantityPerOption = asOptionalPositiveNumber(formData.get("input_quantity_per_option"));
  const conversionFactorToStock = asOptionalPositiveNumber(formData.get("conversion_factor_to_stock")) ?? 1;
  const inputUomProfileId = asOptionalText(formData.get("input_uom_profile_id"));
  const locationPayload = buildConsumptionLocationPayload(formData);

  return {
    itemId,
    optionId,
    productId,
    quantityPerOption,
    payload: {
      code,
      name,
      product_id: productId,
      effect_type: parseConsumptionEffectType(formData.get("effect_type")),
      quantity_per_option: quantityPerOption,
      stock_unit_code: asOptionalText(formData.get("stock_unit_code")),
      input_quantity_per_option: inputQuantityPerOption,
      input_unit_code: asOptionalText(formData.get("input_unit_code")),
      conversion_factor_to_stock: conversionFactorToStock,
      input_uom_profile_id: inputUomProfileId,
      source_location_strategy: locationPayload.source_location_strategy,
      source_location_id: locationPayload.source_location_id,
      source_location_position_id: locationPayload.source_location_position_id,
      sort_order: Math.round(asNonNegativeNumber(formData.get("sort_order"))),
      is_active: asBool(formData.get("is_active")),
      metadata: {},
    },
    error: locationPayload.error,
  };
}

async function createConsumptionRule(formData: FormData) {
  "use server";
  const supabase = await createClient();

  const { itemId, optionId, productId, quantityPerOption, payload, error } = parseConsumptionRulePayload(formData);

  if (!itemId || !optionId || !productId || !payload.name || !payload.code || quantityPerOption <= 0) {
    redirect(`/menu/${itemId || ""}?error=${encodeURIComponent("Faltan datos para crear la regla de consumo.")}`);
  }

  if (error) {
    redirect(`/menu/${itemId}?error=${encodeURIComponent(error)}`);
  }

  const { error: insertError } = await supabase
    .schema("pass")
    .from("catalog_item_option_consumption_rules")
    .insert({
      option_id: optionId,
      ...payload,
      is_active: true,
    });

  if (insertError) {
    redirect(`/menu/${itemId}?error=${encodeURIComponent(insertError.message)}`);
  }

  revalidatePath(`/menu/${itemId}`);
  redirect(`/menu/${itemId}?ok=${encodeURIComponent("Regla de consumo creada.")}`);
}

async function updateConsumptionRule(formData: FormData) {
  "use server";
  const supabase = await createClient();

  const ruleId = asText(formData.get("consumption_rule_id"));
  const { itemId, optionId, productId, quantityPerOption, payload, error } = parseConsumptionRulePayload(formData);

  if (!itemId || !optionId || !ruleId || !productId || !payload.name || !payload.code || quantityPerOption <= 0) {
    redirect(`/menu/${itemId || ""}?error=${encodeURIComponent("Faltan datos para actualizar la regla de consumo.")}`);
  }

  if (error) {
    redirect(`/menu/${itemId}?error=${encodeURIComponent(error)}`);
  }

  const { error: updateError } = await supabase
    .schema("pass")
    .from("catalog_item_option_consumption_rules")
    .update(payload)
    .eq("id", ruleId)
    .eq("option_id", optionId);

  if (updateError) {
    redirect(`/menu/${itemId}?error=${encodeURIComponent(updateError.message)}`);
  }

  revalidatePath(`/menu/${itemId}`);
  redirect(`/menu/${itemId}?ok=${encodeURIComponent("Regla de consumo actualizada.")}`);
}

async function disableConsumptionRule(formData: FormData) {
  "use server";
  const supabase = await createClient();

  const itemId = asText(formData.get("catalog_item_id"));
  const optionId = asText(formData.get("option_id"));
  const ruleId = asText(formData.get("consumption_rule_id"));

  if (!itemId || !optionId || !ruleId) {
    redirect(`/menu/${itemId || ""}?error=${encodeURIComponent("Regla de consumo invalida.")}`);
  }

  const { error } = await supabase
    .schema("pass")
    .from("catalog_item_option_consumption_rules")
    .update({ is_active: false })
    .eq("id", ruleId)
    .eq("option_id", optionId);

  if (error) {
    redirect(`/menu/${itemId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/menu/${itemId}`);
  redirect(`/menu/${itemId}?ok=${encodeURIComponent("Regla de consumo desactivada.")}`);
}


function parseRecipeEffectPayload(formData: FormData) {
  const itemId = asText(formData.get("catalog_item_id"));
  const optionId = asText(formData.get("option_id"));
  const effectType = parseRecipeEffectType(formData.get("effect_type"));
  const quantityMode = parseRecipeEffectQuantityMode(formData.get("quantity_mode"));
  const quantityAmount = quantityMode === "fixed_quantity"
    ? asOptionalPositiveNumber(formData.get("quantity_amount"))
    : null;

  return {
    itemId,
    optionId,
    payload: {
      effect_type: effectType,
      target_ingredient_product_id: asText(formData.get("target_ingredient_product_id")),
      recipe_component_code: asOptionalText(formData.get("recipe_component_code")),
      quantity_mode: quantityMode,
      quantity_amount: quantityAmount,
      stock_unit_code: asOptionalText(formData.get("stock_unit_code")),
      is_active: asBool(formData.get("is_active")),
      sort_order: Math.round(asNonNegativeNumber(formData.get("sort_order"))),
      metadata: {},
    },
    error: quantityMode === "fixed_quantity" && !quantityAmount
      ? "La cantidad fija debe ser mayor a 0."
      : "",
  };
}

async function createRecipeEffect(formData: FormData) {
  "use server";
  const supabase = await createClient();

  const { itemId, optionId, payload, error } = parseRecipeEffectPayload(formData);

  if (!itemId || !optionId || !payload.target_ingredient_product_id) {
    redirect(`/menu/${itemId || ""}?error=${encodeURIComponent("Faltan datos para crear el efecto de receta.")}`);
  }

  if (error) {
    redirect(`/menu/${itemId}?error=${encodeURIComponent(error)}`);
  }

  const { error: insertError } = await supabase
    .schema("pass")
    .from("catalog_item_option_recipe_effects")
    .insert({
      option_id: optionId,
      ...payload,
      is_active: true,
    });

  if (insertError) {
    redirect(`/menu/${itemId}?error=${encodeURIComponent(insertError.message)}`);
  }

  await supabase
    .schema("pass")
    .from("catalog_item_options")
    .update({ effect_type: payload.effect_type })
    .eq("id", optionId);

  revalidatePath(`/menu/${itemId}`);
  redirect(`/menu/${itemId}?ok=${encodeURIComponent("Efecto de receta creado.")}`);
}

async function updateRecipeEffect(formData: FormData) {
  "use server";
  const supabase = await createClient();

  const effectId = asText(formData.get("recipe_effect_id"));
  const { itemId, optionId, payload, error } = parseRecipeEffectPayload(formData);

  if (!itemId || !optionId || !effectId || !payload.target_ingredient_product_id) {
    redirect(`/menu/${itemId || ""}?error=${encodeURIComponent("Faltan datos para actualizar el efecto de receta.")}`);
  }

  if (error) {
    redirect(`/menu/${itemId}?error=${encodeURIComponent(error)}`);
  }

  const { error: updateError } = await supabase
    .schema("pass")
    .from("catalog_item_option_recipe_effects")
    .update(payload)
    .eq("id", effectId)
    .eq("option_id", optionId);

  if (updateError) {
    redirect(`/menu/${itemId}?error=${encodeURIComponent(updateError.message)}`);
  }

  await supabase
    .schema("pass")
    .from("catalog_item_options")
    .update({ effect_type: payload.effect_type })
    .eq("id", optionId);

  revalidatePath(`/menu/${itemId}`);
  redirect(`/menu/${itemId}?ok=${encodeURIComponent("Efecto de receta actualizado.")}`);
}

async function disableRecipeEffect(formData: FormData) {
  "use server";
  const supabase = await createClient();

  const itemId = asText(formData.get("catalog_item_id"));
  const optionId = asText(formData.get("option_id"));
  const effectId = asText(formData.get("recipe_effect_id"));

  if (!itemId || !optionId || !effectId) {
    redirect(`/menu/${itemId || ""}?error=${encodeURIComponent("Efecto de receta invalido.")}`);
  }

  const { error } = await supabase
    .schema("pass")
    .from("catalog_item_option_recipe_effects")
    .update({ is_active: false })
    .eq("id", effectId)
    .eq("option_id", optionId);

  if (error) {
    redirect(`/menu/${itemId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/menu/${itemId}`);
  redirect(`/menu/${itemId}?ok=${encodeURIComponent("Efecto de receta desactivado.")}`);
}

async function createRemovalOptionFromRecipe(formData: FormData) {
  "use server";
  const supabase = await createClient();

  const itemId = asText(formData.get("catalog_item_id"));
  const ingredientProductId = asText(formData.get("ingredient_product_id"));
  const ingredientName = asText(formData.get("ingredient_name"));
  const stockUnitCode = asOptionalText(formData.get("stock_unit_code"));

  if (!itemId || !ingredientProductId || !ingredientName) {
    redirect(`/menu/${itemId || ""}?error=${encodeURIComponent("Ingrediente invalido para crear opcion de retiro.")}`);
  }

  const groupCode = "quitar-ingredientes";

  const { data: existingGroup, error: existingGroupError } = await supabase
    .schema("pass")
    .from("catalog_item_option_groups")
    .select("id")
    .eq("catalog_item_id", itemId)
    .eq("code", groupCode)
    .maybeSingle();

  if (existingGroupError) {
    redirect(`/menu/${itemId}?error=${encodeURIComponent(existingGroupError.message)}`);
  }

  let groupId = existingGroup?.id as string | undefined;

  if (!groupId) {
    const { data: createdGroup, error: groupError } = await supabase
      .schema("pass")
      .from("catalog_item_option_groups")
      .insert({
        catalog_item_id: itemId,
        code: groupCode,
        name: "Quitar ingredientes",
        description: "Ingredientes que el cliente puede pedir retirar de este producto.",
        selection_type: "multiple",
        is_required: false,
        min_select: 0,
        max_select: 99,
        sort_order: 900,
        is_active: true,
        metadata: { source: "recipe_removals" },
      })
      .select("id")
      .single();

    if (groupError || !createdGroup?.id) {
      redirect(`/menu/${itemId}?error=${encodeURIComponent(groupError?.message || "No se pudo crear el grupo de retiros.")}`);
    }

    groupId = createdGroup.id;
  }

  const optionCode = `sin-${slugify(ingredientName)}`;

  const { data: existingOption, error: existingOptionError } = await supabase
    .schema("pass")
    .from("catalog_item_options")
    .select("id")
    .eq("option_group_id", groupId)
    .eq("code", optionCode)
    .maybeSingle();

  if (existingOptionError) {
    redirect(`/menu/${itemId}?error=${encodeURIComponent(existingOptionError.message)}`);
  }

  let optionId = existingOption?.id as string | undefined;

  if (!optionId) {
    const { data: createdOption, error: optionError } = await supabase
      .schema("pass")
      .from("catalog_item_options")
      .insert({
        option_group_id: groupId,
        code: optionCode,
        name: `Sin ${ingredientName}`,
        description: `No consumir ${ingredientName} en la preparacion.`,
        price_delta_amount: 0,
        product_id: null,
        effect_type: "removal",
        is_default: false,
        is_active: true,
        sort_order: 0,
        metadata: { source: "recipe_removals", ingredient_product_id: ingredientProductId },
      })
      .select("id")
      .single();

    if (optionError || !createdOption?.id) {
      redirect(`/menu/${itemId}?error=${encodeURIComponent(optionError?.message || "No se pudo crear la opcion de retiro.")}`);
    }

    optionId = createdOption.id;
  }

  const { data: existingEffect, error: existingEffectError } = await supabase
    .schema("pass")
    .from("catalog_item_option_recipe_effects")
    .select("id")
    .eq("option_id", optionId)
    .eq("target_ingredient_product_id", ingredientProductId)
    .eq("effect_type", "removal")
    .maybeSingle();

  if (existingEffectError) {
    redirect(`/menu/${itemId}?error=${encodeURIComponent(existingEffectError.message)}`);
  }

  if (!existingEffect) {
    const { error: effectError } = await supabase
      .schema("pass")
      .from("catalog_item_option_recipe_effects")
      .insert({
        option_id: optionId,
        effect_type: "removal",
        target_ingredient_product_id: ingredientProductId,
        recipe_component_code: slugify(ingredientName),
        quantity_mode: "full_recipe_component",
        quantity_amount: null,
        stock_unit_code: stockUnitCode,
        is_active: true,
        sort_order: 0,
        metadata: { source: "recipe_removals" },
      });

    if (effectError) {
      redirect(`/menu/${itemId}?error=${encodeURIComponent(effectError.message)}`);
    }
  }

  revalidatePath(`/menu/${itemId}`);
  redirect(`/menu/${itemId}?ok=${encodeURIComponent(`Opcion "Sin ${ingredientName}" creada.`)}`);
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

  const [
    { data: item },
    { data: sitesRaw },
    { data: categoriesRaw },
    { data: collectionsRaw },
    { data: presentationRaw },
    { data: optionGroupsRaw },
  ] = await Promise.all([
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
    supabase
      .schema("pass")
      .from("catalog_item_presentation")
      .select("catalog_item_id,surface,card_layout,opens_detail_modal,is_highlighted,sort_weight,metadata")
      .eq("catalog_item_id", id)
      .eq("surface", "vento_pass_menu")
      .maybeSingle(),
    supabase
      .schema("pass")
      .from("catalog_item_option_groups")
      .select("id,catalog_item_id,code,name,description,selection_type,is_required,min_select,max_select,sort_order,is_active,metadata")
      .eq("catalog_item_id", id)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  if (!item) {
    redirect("/menu?error=" + encodeURIComponent("Item no encontrado."));
  }

  const row = item as CatalogItemRow;
  const presentation = (presentationRaw ?? null) as CatalogItemPresentationRow | null;
  const sites = (sitesRaw ?? []) as SiteRow[];
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;

  const { data: sellOptionsRaw } = await supabase
    .schema("pass").from("sell_products_by_site")
    .select("site_id,product_id,name,sku,base_price,recipe_cost_amount")
    .order("name", { ascending: true });

  const optionGroups = ((optionGroupsRaw ?? []) as CatalogItemOptionGroupRow[]).sort((a, b) => {
    if (Number(a.sort_order ?? 0) !== Number(b.sort_order ?? 0)) {
      return Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
    }

    return String(a.name ?? "").localeCompare(String(b.name ?? ""), "es-CO");
  });

  const optionGroupIds = optionGroups.map((group) => group.id);

  const { data: optionOptionsRaw } = optionGroupIds.length > 0
    ? await supabase
      .schema("pass")
      .from("catalog_item_options")
      .select("id,option_group_id,code,name,description,price_delta_amount,product_id,effect_type,is_default,is_active,sort_order,metadata")
      .in("option_group_id", optionGroupIds)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
    : { data: [] as CatalogItemOptionRow[] };

  const optionsByGroup = new Map<string, CatalogItemOptionRow[]>();

  for (const option of (optionOptionsRaw ?? []) as CatalogItemOptionRow[]) {
    const current = optionsByGroup.get(option.option_group_id) ?? [];
    current.push(option);
    optionsByGroup.set(option.option_group_id, current);
  }

  const optionIds = ((optionOptionsRaw ?? []) as CatalogItemOptionRow[]).map((option) => option.id);

  const [
    { data: consumptionRulesRaw },
    { data: recipeEffectsRaw },
    { data: recipeIngredientsRaw },
    { data: consumptionProductsRaw },
    { data: inventoryUnitsRaw },
    { data: productUomProfilesRaw },
    { data: inventoryLocationsRaw },
    { data: inventoryPositionsRaw },
  ] = await Promise.all([
    optionIds.length > 0
      ? supabase
        .schema("pass")
        .from("catalog_item_option_consumption_rules")
        .select("id,option_id,code,name,product_id,effect_type,quantity_per_option,stock_unit_code,input_quantity_per_option,input_unit_code,conversion_factor_to_stock,input_uom_profile_id,source_location_strategy,source_location_id,source_location_position_id,is_active,sort_order,metadata")
        .in("option_id", optionIds)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true })
      : Promise.resolve({ data: [] as CatalogItemOptionConsumptionRuleRow[] }),
    optionIds.length > 0
      ? supabase
        .schema("pass")
        .from("catalog_item_option_recipe_effects")
        .select("id,option_id,effect_type,target_ingredient_product_id,recipe_component_code,quantity_mode,quantity_amount,stock_unit_code,is_active,sort_order,metadata")
        .in("option_id", optionIds)
        .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [] as CatalogItemOptionRecipeEffectRow[] }),
    row.product_id
      ? supabase
        .from("recipes")
        .select("id,product_id,ingredient_product_id,quantity,is_active")
        .eq("product_id", row.product_id)
        .eq("is_active", true)
        .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as RecipeIngredientRow[] }),
    supabase
      .from("products")
      .select("id,name,sku,unit,stock_unit_code,product_type,is_active")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("inventory_units")
      .select("code,name,symbol,family,is_active")
      .eq("is_active", true)
      .order("family", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("product_uom_profiles")
      .select("id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,is_active")
      .eq("is_active", true)
      .order("label", { ascending: true }),
    supabase
      .from("inventory_locations")
      .select("id,site_id,code,zone,description,location_type,is_active")
      .eq("site_id", row.site_id)
      .eq("is_active", true)
      .order("code", { ascending: true }),
    supabase
      .from("inventory_location_positions")
      .select("id,site_id,location_id,code,name,kind,is_active")
      .eq("site_id", row.site_id)
      .eq("is_active", true)
      .order("code", { ascending: true }),
  ]);

  const consumptionRulesByOption = new Map<string, CatalogItemOptionConsumptionRuleRow[]>();

  for (const rule of (consumptionRulesRaw ?? []) as CatalogItemOptionConsumptionRuleRow[]) {
    const current = consumptionRulesByOption.get(rule.option_id) ?? [];
    current.push(rule);
    consumptionRulesByOption.set(rule.option_id, current);
  }

  const recipeEffectsByOption = new Map<string, CatalogItemOptionRecipeEffectRow[]>();

  for (const effect of (recipeEffectsRaw ?? []) as CatalogItemOptionRecipeEffectRow[]) {
    const current = recipeEffectsByOption.get(effect.option_id) ?? [];
    current.push(effect);
    recipeEffectsByOption.set(effect.option_id, current);
  }

  const consumptionProducts = ((consumptionProductsRaw ?? []) as OperationalProductRow[]).sort((a, b) =>
    String(a.name ?? "").localeCompare(String(b.name ?? ""), "es-CO"),
  );

  const consumptionProductById = new Map(consumptionProducts.map((product) => [product.id, product]));
  const inventoryUnits = (inventoryUnitsRaw ?? []) as InventoryUnitRow[];
  const inventoryLocations = (inventoryLocationsRaw ?? []) as InventoryLocationRow[];
  const inventoryPositions = (inventoryPositionsRaw ?? []) as InventoryLocationPositionRow[];
  const uomProfiles = (productUomProfilesRaw ?? []) as ProductUomProfileRow[];

  const uomProfilesByProduct = new Map<string, ProductUomProfileRow[]>();
  for (const profile of uomProfiles) {
    const current = uomProfilesByProduct.get(profile.product_id) ?? [];
    current.push(profile);
    uomProfilesByProduct.set(profile.product_id, current);
  }

  const positionsByLocation = new Map<string, InventoryLocationPositionRow[]>();
  for (const position of inventoryPositions) {
    const current = positionsByLocation.get(position.location_id) ?? [];
    current.push(position);
    positionsByLocation.set(position.location_id, current);
  }

  const recipeIngredients = ((recipeIngredientsRaw ?? []) as RecipeIngredientRow[])
    .map((ingredient) => ({
      ...ingredient,
      product: consumptionProductById.get(ingredient.ingredient_product_id) ?? null,
    }))
    .filter((ingredient) => Boolean(ingredient.product));

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
          pass_card_layout: parsePassCardLayout(presentation?.card_layout),
          opens_detail_modal: Boolean(presentation?.opens_detail_modal),
        }}
      />


      <div className="ui-panel space-y-6">
        <div>
          <div className="ui-h3">Opciones configurables</div>
          <p className="ui-caption">
            Configura grupos, opciones y reglas de consumo operativo. Las opciones son lo que ve el cliente; las reglas de consumo definen qué insumo/producto se descuenta del LOC al preparar.
          </p>
        </div>

        {recipeIngredients.length > 0 ? (
          <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
            <div className="text-sm font-bold text-[var(--ui-text)]">Ingredientes retirables desde receta</div>
            <p className="ui-caption mt-1">
              Crea opciones “Sin X” a partir de ingredientes activos de la receta. Al preparar, ese ingrediente no debe consumirse.
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {recipeIngredients.map((ingredient) => {
                const product = ingredient.product;
                if (!product) return null;

                return (
                  <form
                    key={ingredient.id}
                    action={createRemovalOptionFromRecipe}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3"
                  >
                    <input type="hidden" name="catalog_item_id" value={row.id} />
                    <input type="hidden" name="ingredient_product_id" value={ingredient.ingredient_product_id} />
                    <input type="hidden" name="ingredient_name" value={product.name ?? "Ingrediente"} />
                    <input type="hidden" name="stock_unit_code" value={product.stock_unit_code || product.unit || ""} />

                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-[var(--ui-text)]">
                        {product.name ?? "Ingrediente"}
                      </div>
                      <div className="ui-caption">
                        Receta: {formatQuantityAdmin(ingredient.quantity)} {product.stock_unit_code || product.unit || "unidad"}
                      </div>
                    </div>

                    <button type="submit" className="ui-btn ui-btn--ghost shrink-0">
                      Crear “Sin”
                    </button>
                  </form>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--ui-border)] bg-white p-4">
            <div className="text-sm font-semibold text-[var(--ui-text)]">No hay ingredientes de receta para sugerir retiros.</div>
            <p className="ui-caption mt-1">
              Cuando el producto operacional tenga receta activa, aquí aparecerán ingredientes para crear opciones tipo “Sin X”.
            </p>
          </div>
        )}

        <form action={createOptionGroup} className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
          <input type="hidden" name="catalog_item_id" value={row.id} />

          <div className="grid gap-4 lg:grid-cols-[1fr_140px_140px_120px]">
            <label className="space-y-2">
              <span className="ui-label">Nuevo grupo</span>
              <input name="name" className="ui-input" placeholder="Leche, tamaño, acompañante..." required />
            </label>

            <label className="space-y-2">
              <span className="ui-label">Tipo</span>
              <select name="selection_type" className="ui-input" defaultValue="single">
                <option value="single">Única</option>
                <option value="multiple">Múltiple</option>
              </select>
            </label>

            <label className="space-y-2">
              <span className="ui-label">Máximo</span>
              <input name="max_select" type="number" min="1" className="ui-input" defaultValue="1" />
            </label>

            <label className="space-y-2">
              <span className="ui-label">Orden</span>
              <input name="sort_order" type="number" min="0" className="ui-input" defaultValue="0" />
            </label>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_140px_auto] lg:items-end">
            <label className="space-y-2">
              <span className="ui-label">Código opcional</span>
              <input name="code" className="ui-input" placeholder="leche, tamano, acompanante" />
            </label>

            <label className="space-y-2">
              <span className="ui-label">Mínimo</span>
              <input name="min_select" type="number" min="0" className="ui-input" defaultValue="0" />
            </label>

            <label className="flex items-center gap-2 pb-3 text-sm font-semibold text-[var(--ui-text)]">
              <input type="checkbox" name="is_required" />
              Obligatorio
            </label>
          </div>

          <label className="mt-4 block space-y-2">
            <span className="ui-label">Descripción opcional</span>
            <input name="description" className="ui-input" placeholder="El cliente debe escoger una opción de este grupo." />
          </label>

          <div className="mt-4">
            <button type="submit" className="ui-btn ui-btn--brand">
              Crear grupo
            </button>
          </div>
        </form>

        {optionGroups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--ui-border)] bg-white p-5">
            <div className="text-sm font-semibold text-[var(--ui-text)]">Este producto aún no tiene opciones configurables.</div>
            <p className="ui-caption mt-1">
              Crea un grupo para empezar. Después podrás agregar opciones y reglas de consumo.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {optionGroups.map((group) => {
              const groupOptions = optionsByGroup.get(group.id) ?? [];

              return (
                <div key={group.id} className="rounded-3xl border border-[var(--ui-border)] bg-white p-5 shadow-[var(--ui-shadow-1)]">
                  <form action={updateOptionGroup} className="space-y-4">
                    <input type="hidden" name="catalog_item_id" value={row.id} />
                    <input type="hidden" name="option_group_id" value={group.id} />

                    <div className="grid gap-4 lg:grid-cols-[1fr_140px_120px_120px_120px]">
                      <label className="space-y-2">
                        <span className="ui-label">Grupo</span>
                        <input name="name" className="ui-input" defaultValue={group.name} required />
                      </label>

                      <label className="space-y-2">
                        <span className="ui-label">Tipo</span>
                        <select name="selection_type" className="ui-input" defaultValue={parseSelectionType(group.selection_type)}>
                          <option value="single">Única</option>
                          <option value="multiple">Múltiple</option>
                        </select>
                      </label>

                      <label className="space-y-2">
                        <span className="ui-label">Mínimo</span>
                        <input name="min_select" type="number" min="0" className="ui-input" defaultValue={group.min_select ?? 0} />
                      </label>

                      <label className="space-y-2">
                        <span className="ui-label">Máximo</span>
                        <input name="max_select" type="number" min="1" className="ui-input" defaultValue={group.max_select ?? 1} />
                      </label>

                      <label className="space-y-2">
                        <span className="ui-label">Orden</span>
                        <input name="sort_order" type="number" min="0" className="ui-input" defaultValue={group.sort_order ?? 0} />
                      </label>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                      <label className="space-y-2">
                        <span className="ui-label">Código</span>
                        <input name="code" className="ui-input" defaultValue={group.code} required />
                      </label>

                      <label className="space-y-2">
                        <span className="ui-label">Descripción</span>
                        <input name="description" className="ui-input" defaultValue={group.description ?? ""} />
                      </label>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-2 text-sm font-semibold text-[var(--ui-text)]">
                        <input type="checkbox" name="is_required" defaultChecked={group.is_required} />
                        Obligatorio
                      </label>

                      <label className="flex items-center gap-2 text-sm font-semibold text-[var(--ui-text)]">
                        <input type="checkbox" name="is_active" defaultChecked={group.is_active} />
                        Activo
                      </label>

                      <button type="submit" className="ui-btn ui-btn--brand">
                        Guardar grupo
                      </button>
                    </div>
                  </form>

                  <div className="mt-3">
                    <form action={disableOptionGroup}>
                      <input type="hidden" name="catalog_item_id" value={row.id} />
                      <input type="hidden" name="option_group_id" value={group.id} />
                      <button type="submit" className="ui-btn ui-btn--ghost">
                        Desactivar grupo
                      </button>
                    </form>
                  </div>

                  <div className="mt-6 space-y-3 border-t border-[var(--ui-border)] pt-5">
                    <div>
                      <div className="text-sm font-bold text-[var(--ui-text)]">Opciones</div>
                      <p className="ui-caption">
                        Cada opción puede sumar precio y tener reglas de consumo de inventario.
                      </p>
                    </div>

                    <form action={createOption} className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
                      <input type="hidden" name="catalog_item_id" value={row.id} />
                      <input type="hidden" name="option_group_id" value={group.id} />

                      <div className="grid gap-4 lg:grid-cols-[1fr_150px_160px_120px]">
                        <label className="space-y-2">
                          <span className="ui-label">Nueva opción</span>
                          <input name="name" className="ui-input" placeholder="Entera, almendra, brownie..." required />
                        </label>

                        <label className="space-y-2">
                          <span className="ui-label">Adicional COP</span>
                          <input name="price_delta_amount" type="number" min="0" className="ui-input" defaultValue="0" />
                        </label>

                        <label className="space-y-2">
                          <span className="ui-label">Efecto</span>
                          <select name="effect_type" className="ui-input" defaultValue="preference">
                            <option value="preference">Preferencia</option>
                            <option value="additive">Extra</option>
                            <option value="replacement">Reemplazo</option>
                            <option value="removal">Retiro</option>
                          </select>
                        </label>

                        <label className="space-y-2">
                          <span className="ui-label">Orden</span>
                          <input name="sort_order" type="number" min="0" className="ui-input" defaultValue="0" />
                        </label>
                      </div>

                      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
                        <label className="space-y-2">
                          <span className="ui-label">Código opcional</span>
                          <input name="code" className="ui-input" placeholder="almendra, brownie..." />
                        </label>

                        <label className="space-y-2">
                          <span className="ui-label">Descripción opcional</span>
                          <input name="description" className="ui-input" />
                        </label>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-4">
                        <label className="flex items-center gap-2 text-sm font-semibold text-[var(--ui-text)]">
                          <input type="checkbox" name="is_default" />
                          Predeterminada
                        </label>

                        <button type="submit" className="ui-btn ui-btn--brand">
                          Crear opción
                        </button>
                      </div>
                    </form>

                    {groupOptions.length === 0 ? (
                      <p className="ui-caption">Este grupo todavía no tiene opciones.</p>
                    ) : (
                      <div className="space-y-3">
                        {groupOptions.map((option) => {
                          const consumptionRules = consumptionRulesByOption.get(option.id) ?? [];
                          const recipeEffects = recipeEffectsByOption.get(option.id) ?? [];

                          return (
                            <div key={option.id} className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
                              <form action={updateOption} className="space-y-4">
                                <input type="hidden" name="catalog_item_id" value={row.id} />
                                <input type="hidden" name="option_group_id" value={group.id} />
                                <input type="hidden" name="option_id" value={option.id} />

                                <div className="grid gap-4 lg:grid-cols-[1fr_150px_160px_120px]">
                                  <label className="space-y-2">
                                    <span className="ui-label">Opción</span>
                                    <input name="name" className="ui-input" defaultValue={option.name} required />
                                  </label>

                                  <label className="space-y-2">
                                    <span className="ui-label">Adicional COP</span>
                                    <input
                                      name="price_delta_amount"
                                      type="number"
                                      min="0"
                                      className="ui-input"
                                      defaultValue={String(option.price_delta_amount ?? 0)}
                                    />
                                  </label>

                                  <label className="space-y-2">
                                    <span className="ui-label">Efecto</span>
                                    <select name="effect_type" className="ui-input" defaultValue={parseOptionEffectType(option.effect_type)}>
                                      <option value="preference">Preferencia</option>
                                      <option value="additive">Extra</option>
                                      <option value="replacement">Reemplazo</option>
                                      <option value="removal">Retiro</option>
                                    </select>
                                  </label>

                                  <label className="space-y-2">
                                    <span className="ui-label">Orden</span>
                                    <input name="sort_order" type="number" min="0" className="ui-input" defaultValue={option.sort_order ?? 0} />
                                  </label>
                                </div>

                                <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                                  <label className="space-y-2">
                                    <span className="ui-label">Código</span>
                                    <input name="code" className="ui-input" defaultValue={option.code} required />
                                  </label>

                                  <label className="space-y-2">
                                    <span className="ui-label">Descripción</span>
                                    <input name="description" className="ui-input" defaultValue={option.description ?? ""} />
                                  </label>
                                </div>

                                <div className="flex flex-wrap items-center gap-4">
                                  <span className="ui-chip">
                                    {formatCopAdmin(option.price_delta_amount)}
                                  </span>

                                  <span className="ui-chip">
                                    {getEffectTypeLabel(option.effect_type)}
                                  </span>

                                  <label className="flex items-center gap-2 text-sm font-semibold text-[var(--ui-text)]">
                                    <input type="checkbox" name="is_default" defaultChecked={option.is_default} />
                                    Predeterminada
                                  </label>

                                  <label className="flex items-center gap-2 text-sm font-semibold text-[var(--ui-text)]">
                                    <input type="checkbox" name="is_active" defaultChecked={option.is_active} />
                                    Activa
                                  </label>

                                  <button type="submit" className="ui-btn ui-btn--brand">
                                    Guardar opción
                                  </button>
                                </div>
                              </form>

                              <div className="mt-3">
                                <form action={disableOption}>
                                  <input type="hidden" name="catalog_item_id" value={row.id} />
                                  <input type="hidden" name="option_group_id" value={group.id} />
                                  <input type="hidden" name="option_id" value={option.id} />
                                  <button type="submit" className="ui-btn ui-btn--ghost">
                                    Desactivar opción
                                  </button>
                                </form>
                              </div>

                              <div className="mt-5 space-y-4 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
                                <div>
                                  <div className="text-sm font-bold text-[var(--ui-text)]">Efectos sobre receta</div>
                                  <p className="ui-caption">
                                    Úsalo para “Sin ingrediente” o reemplazos reales. Esto evita que el ingrediente base se descuente al preparar.
                                  </p>
                                </div>

                                <form action={createRecipeEffect} className="space-y-4 rounded-2xl border border-[var(--ui-border)] bg-white p-4">
                                  <input type="hidden" name="catalog_item_id" value={row.id} />
                                  <input type="hidden" name="option_id" value={option.id} />
                                  <input type="hidden" name="is_active" value="true" />

                                  <div className="grid gap-4 lg:grid-cols-[160px_1fr_180px_140px]">
                                    <label className="space-y-2">
                                      <span className="ui-label">Tipo</span>
                                      <select name="effect_type" className="ui-input" defaultValue={parseRecipeEffectType(option.effect_type)}>
                                        <option value="removal">Retirar ingrediente</option>
                                        <option value="replacement">Reemplazar ingrediente</option>
                                      </select>
                                    </label>

                                    <label className="space-y-2">
                                      <span className="ui-label">Ingrediente de receta</span>
                                      <select name="target_ingredient_product_id" className="ui-input" required>
                                        <option value="">Selecciona ingrediente</option>
                                        {recipeIngredients.map((ingredient) => {
                                          const product = ingredient.product;
                                          if (!product) return null;

                                          return (
                                            <option key={ingredient.id} value={ingredient.ingredient_product_id}>
                                              {product.name ?? "Ingrediente"} · {formatQuantityAdmin(ingredient.quantity)} {product.stock_unit_code || product.unit || "unidad"}
                                            </option>
                                          );
                                        })}
                                      </select>
                                    </label>

                                    <label className="space-y-2">
                                      <span className="ui-label">Modo cantidad</span>
                                      <select name="quantity_mode" className="ui-input" defaultValue="full_recipe_component">
                                        <option value="full_recipe_component">Todo el componente</option>
                                        <option value="fixed_quantity">Cantidad fija</option>
                                      </select>
                                    </label>

                                    <label className="space-y-2">
                                      <span className="ui-label">Cantidad fija</span>
                                      <input name="quantity_amount" type="number" min="0.0001" step="0.0001" className="ui-input" />
                                    </label>
                                  </div>

                                  <div className="grid gap-4 lg:grid-cols-[1fr_160px_120px]">
                                    <label className="space-y-2">
                                      <span className="ui-label">Código componente opcional</span>
                                      <input name="recipe_component_code" className="ui-input" placeholder="milk, sauce, onion..." />
                                    </label>

                                    <label className="space-y-2">
                                      <span className="ui-label">Unidad</span>
                                      <select name="stock_unit_code" className="ui-input" defaultValue="">
                                        <option value="">Usar unidad del ingrediente</option>
                                        {inventoryUnits.map((unit) => (
                                          <option key={unit.code} value={unit.code}>
                                            {unit.name}{unit.symbol ? ` (${unit.symbol})` : ""}
                                          </option>
                                        ))}
                                      </select>
                                    </label>

                                    <label className="space-y-2">
                                      <span className="ui-label">Orden</span>
                                      <input name="sort_order" type="number" min="0" className="ui-input" defaultValue="0" />
                                    </label>
                                  </div>

                                  <button type="submit" className="ui-btn ui-btn--brand">
                                    Crear efecto de receta
                                  </button>
                                </form>

                                {recipeEffects.length === 0 ? (
                                  <p className="ui-caption">
                                    Esta opción no modifica la receta base.
                                  </p>
                                ) : (
                                  <div className="space-y-3">
                                    {recipeEffects.map((effect) => {
                                      const targetProduct = consumptionProductById.get(effect.target_ingredient_product_id);

                                      return (
                                        <div key={effect.id} className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
                                          <form action={updateRecipeEffect} className="space-y-4">
                                            <input type="hidden" name="catalog_item_id" value={row.id} />
                                            <input type="hidden" name="option_id" value={option.id} />
                                            <input type="hidden" name="recipe_effect_id" value={effect.id} />

                                            <div className="grid gap-4 lg:grid-cols-[160px_1fr_180px_140px]">
                                              <label className="space-y-2">
                                                <span className="ui-label">Tipo</span>
                                                <select name="effect_type" className="ui-input" defaultValue={parseRecipeEffectType(effect.effect_type)}>
                                                  <option value="removal">Retirar ingrediente</option>
                                                  <option value="replacement">Reemplazar ingrediente</option>
                                                </select>
                                              </label>

                                              <label className="space-y-2">
                                                <span className="ui-label">Ingrediente de receta</span>
                                                <select name="target_ingredient_product_id" className="ui-input" defaultValue={effect.target_ingredient_product_id} required>
                                                  {recipeIngredients.map((ingredient) => {
                                                    const product = ingredient.product;
                                                    if (!product) return null;

                                                    return (
                                                      <option key={ingredient.id} value={ingredient.ingredient_product_id}>
                                                        {product.name ?? "Ingrediente"} · {formatQuantityAdmin(ingredient.quantity)} {product.stock_unit_code || product.unit || "unidad"}
                                                      </option>
                                                    );
                                                  })}
                                                </select>
                                              </label>

                                              <label className="space-y-2">
                                                <span className="ui-label">Modo cantidad</span>
                                                <select name="quantity_mode" className="ui-input" defaultValue={parseRecipeEffectQuantityMode(effect.quantity_mode)}>
                                                  <option value="full_recipe_component">Todo el componente</option>
                                                  <option value="fixed_quantity">Cantidad fija</option>
                                                </select>
                                              </label>

                                              <label className="space-y-2">
                                                <span className="ui-label">Cantidad fija</span>
                                                <input
                                                  name="quantity_amount"
                                                  type="number"
                                                  min="0.0001"
                                                  step="0.0001"
                                                  className="ui-input"
                                                  defaultValue={effect.quantity_amount == null ? "" : String(effect.quantity_amount)}
                                                />
                                              </label>
                                            </div>

                                            <div className="grid gap-4 lg:grid-cols-[1fr_160px_120px]">
                                              <label className="space-y-2">
                                                <span className="ui-label">Código componente</span>
                                                <input name="recipe_component_code" className="ui-input" defaultValue={effect.recipe_component_code ?? ""} />
                                              </label>

                                              <label className="space-y-2">
                                                <span className="ui-label">Unidad</span>
                                                <select name="stock_unit_code" className="ui-input" defaultValue={effect.stock_unit_code ?? ""}>
                                                  <option value="">Usar unidad del ingrediente</option>
                                                  {inventoryUnits.map((unit) => (
                                                    <option key={unit.code} value={unit.code}>
                                                      {unit.name}{unit.symbol ? ` (${unit.symbol})` : ""}
                                                    </option>
                                                  ))}
                                                </select>
                                              </label>

                                              <label className="space-y-2">
                                                <span className="ui-label">Orden</span>
                                                <input name="sort_order" type="number" min="0" className="ui-input" defaultValue={effect.sort_order ?? 0} />
                                              </label>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-4">
                                              <span className="ui-chip">
                                                {effect.effect_type === "replacement" ? "Reemplaza" : "Retira"} {targetProduct?.name ?? "ingrediente"}
                                              </span>

                                              <label className="flex items-center gap-2 text-sm font-semibold text-[var(--ui-text)]">
                                                <input type="checkbox" name="is_active" defaultChecked={effect.is_active} />
                                                Activo
                                              </label>

                                              <button type="submit" className="ui-btn ui-btn--brand">
                                                Guardar efecto
                                              </button>
                                            </div>
                                          </form>

                                          <div className="mt-3">
                                            <form action={disableRecipeEffect}>
                                              <input type="hidden" name="catalog_item_id" value={row.id} />
                                              <input type="hidden" name="option_id" value={option.id} />
                                              <input type="hidden" name="recipe_effect_id" value={effect.id} />
                                              <button type="submit" className="ui-btn ui-btn--ghost">
                                                Desactivar efecto
                                              </button>
                                            </form>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>

                              <div className="mt-5 space-y-4 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
                                <div>
                                  <div className="text-sm font-bold text-[var(--ui-text)]">Consumo operativo</div>
                                  <p className="ui-caption">
                                    Vincula esta opción con uno o más insumos/productos para descontarlos del LOC al preparar.
                                  </p>
                                </div>

                                <form action={createConsumptionRule} className="space-y-4 rounded-2xl border border-[var(--ui-border)] bg-white p-4">
                                  <input type="hidden" name="catalog_item_id" value={row.id} />
                                  <input type="hidden" name="option_id" value={option.id} />
                                  <input type="hidden" name="is_active" value="true" />

                                  <div className="grid gap-4 lg:grid-cols-[1fr_150px_140px_120px]">
                                    <label className="space-y-2">
                                      <span className="ui-label">Insumo / producto a consumir</span>
                                      <select name="product_id" className="ui-input" required>
                                        <option value="">Selecciona insumo o producto</option>
                                        {consumptionProducts.map((product) => (
                                          <option key={product.id} value={product.id}>
                                            {[
                                              product.name ?? "Sin nombre",
                                              product.sku ? `SKU ${product.sku}` : null,
                                              product.product_type,
                                            ].filter(Boolean).join(" · ")}
                                          </option>
                                        ))}
                                      </select>
                                    </label>

                                    <label className="space-y-2">
                                      <span className="ui-label">Cantidad stock</span>
                                      <input name="quantity_per_option" type="number" min="0.0001" step="0.0001" className="ui-input" required />
                                    </label>

                                    <label className="space-y-2">
                                      <span className="ui-label">Unidad stock</span>
                                      <select name="stock_unit_code" className="ui-input" defaultValue="">
                                        <option value="">Usar unidad del producto</option>
                                        {inventoryUnits.map((unit) => (
                                          <option key={unit.code} value={unit.code}>
                                            {unit.name}{unit.symbol ? ` (${unit.symbol})` : ""}
                                          </option>
                                        ))}
                                      </select>
                                    </label>

                                    <label className="space-y-2">
                                      <span className="ui-label">Orden</span>
                                      <input name="sort_order" type="number" min="0" className="ui-input" defaultValue="0" />
                                    </label>
                                  </div>

                                  <div className="grid gap-4 lg:grid-cols-[1fr_150px_160px_150px]">
                                    <label className="space-y-2">
                                      <span className="ui-label">Nombre regla</span>
                                      <input name="name" className="ui-input" placeholder="Consumo de leche de almendra" required />
                                    </label>

                                    <label className="space-y-2">
                                      <span className="ui-label">Código opcional</span>
                                      <input name="code" className="ui-input" placeholder="leche-almendra" />
                                    </label>

                                    <label className="space-y-2">
                                      <span className="ui-label">Efecto consumo</span>
                                      <select name="effect_type" className="ui-input" defaultValue={option.effect_type === "replacement" ? "replacement" : "additive"}>
                                        <option value="additive">Extra / suma</option>
                                        <option value="replacement">Sustituto</option>
                                      </select>
                                    </label>

                                    <label className="space-y-2">
                                      <span className="ui-label">Factor conversión</span>
                                      <input name="conversion_factor_to_stock" type="number" min="0.0001" step="0.0001" className="ui-input" defaultValue="1" />
                                    </label>
                                  </div>

                                  <div className="grid gap-4 lg:grid-cols-[150px_150px_1fr]">
                                    <label className="space-y-2">
                                      <span className="ui-label">Cantidad entrada</span>
                                      <input name="input_quantity_per_option" type="number" min="0.0001" step="0.0001" className="ui-input" />
                                    </label>

                                    <label className="space-y-2">
                                      <span className="ui-label">Unidad entrada</span>
                                      <select name="input_unit_code" className="ui-input" defaultValue="">
                                        <option value="">Sin unidad</option>
                                        {inventoryUnits.map((unit) => (
                                          <option key={unit.code} value={unit.code}>
                                            {unit.name}{unit.symbol ? ` (${unit.symbol})` : ""}
                                          </option>
                                        ))}
                                      </select>
                                    </label>

                                    <label className="space-y-2">
                                      <span className="ui-label">Perfil UOM opcional</span>
                                      <select name="input_uom_profile_id" className="ui-input" defaultValue="">
                                        <option value="">Sin perfil</option>
                                        {uomProfiles.map((profile) => {
                                          const product = consumptionProductById.get(profile.product_id);
                                          return (
                                            <option key={profile.id} value={profile.id}>
                                              {(product?.name ?? "Producto") + " · " + profile.label}
                                            </option>
                                          );
                                        })}
                                      </select>
                                    </label>
                                  </div>

                                  <div className="grid gap-4 lg:grid-cols-[220px_1fr_1fr]">
                                    <label className="space-y-2">
                                      <span className="ui-label">LOC de consumo</span>
                                      <select name="source_location_strategy" className="ui-input" defaultValue="product_production_location">
                                        <option value="product_production_location">LOC de preparación del producto</option>
                                        <option value="explicit_location">LOC explícito</option>
                                        <option value="explicit_position">Posición interna explícita</option>
                                      </select>
                                    </label>

                                    <label className="space-y-2">
                                      <span className="ui-label">LOC explícito</span>
                                      <select name="source_location_id" className="ui-input" defaultValue="">
                                        <option value="">Sin LOC explícito</option>
                                        {inventoryLocations.map((location) => (
                                          <option key={location.id} value={location.id}>
                                            {[location.code, location.zone, location.location_type].filter(Boolean).join(" · ")}
                                          </option>
                                        ))}
                                      </select>
                                    </label>

                                    <label className="space-y-2">
                                      <span className="ui-label">Posición interna</span>
                                      <select name="source_location_position_id" className="ui-input" defaultValue="">
                                        <option value="">Sin posición</option>
                                        {inventoryLocations.map((location) => {
                                          const positions = positionsByLocation.get(location.id) ?? [];
                                          if (positions.length === 0) return null;

                                          return (
                                            <optgroup key={location.id} label={location.code}>
                                              {positions.map((position) => (
                                                <option key={position.id} value={position.id}>
                                                  {position.code} · {position.name}
                                                </option>
                                              ))}
                                            </optgroup>
                                          );
                                        })}
                                      </select>
                                    </label>
                                  </div>

                                  <button type="submit" className="ui-btn ui-btn--brand">
                                    Crear regla de consumo
                                  </button>
                                </form>

                                {consumptionRules.length === 0 ? (
                                  <p className="ui-caption">
                                    Esta opción no tiene reglas de consumo. Si es solo una preferencia visual, puede quedar así.
                                  </p>
                                ) : (
                                  <div className="space-y-3">
                                    {consumptionRules.map((rule) => {
                                      const product = consumptionProductById.get(rule.product_id);
                                      const ruleProfiles = uomProfilesByProduct.get(rule.product_id) ?? [];

                                      return (
                                        <div key={rule.id} className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
                                          <form action={updateConsumptionRule} className="space-y-4">
                                            <input type="hidden" name="catalog_item_id" value={row.id} />
                                            <input type="hidden" name="option_id" value={option.id} />
                                            <input type="hidden" name="consumption_rule_id" value={rule.id} />

                                            <div className="grid gap-4 lg:grid-cols-[1fr_150px_140px_120px]">
                                              <label className="space-y-2">
                                                <span className="ui-label">Insumo / producto</span>
                                                <select name="product_id" className="ui-input" defaultValue={rule.product_id} required>
                                                  {consumptionProducts.map((candidate) => (
                                                    <option key={candidate.id} value={candidate.id}>
                                                      {[
                                                        candidate.name ?? "Sin nombre",
                                                        candidate.sku ? `SKU ${candidate.sku}` : null,
                                                        candidate.product_type,
                                                      ].filter(Boolean).join(" · ")}
                                                    </option>
                                                  ))}
                                                </select>
                                              </label>

                                              <label className="space-y-2">
                                                <span className="ui-label">Cantidad stock</span>
                                                <input
                                                  name="quantity_per_option"
                                                  type="number"
                                                  min="0.0001"
                                                  step="0.0001"
                                                  className="ui-input"
                                                  defaultValue={String(rule.quantity_per_option ?? "")}
                                                  required
                                                />
                                              </label>

                                              <label className="space-y-2">
                                                <span className="ui-label">Unidad stock</span>
                                                <select name="stock_unit_code" className="ui-input" defaultValue={rule.stock_unit_code ?? ""}>
                                                  <option value="">Usar unidad del producto</option>
                                                  {inventoryUnits.map((unit) => (
                                                    <option key={unit.code} value={unit.code}>
                                                      {unit.name}{unit.symbol ? ` (${unit.symbol})` : ""}
                                                    </option>
                                                  ))}
                                                </select>
                                              </label>

                                              <label className="space-y-2">
                                                <span className="ui-label">Orden</span>
                                                <input name="sort_order" type="number" min="0" className="ui-input" defaultValue={rule.sort_order ?? 0} />
                                              </label>
                                            </div>

                                            <div className="grid gap-4 lg:grid-cols-[1fr_150px_160px_150px]">
                                              <label className="space-y-2">
                                                <span className="ui-label">Nombre regla</span>
                                                <input name="name" className="ui-input" defaultValue={rule.name} required />
                                              </label>

                                              <label className="space-y-2">
                                                <span className="ui-label">Código</span>
                                                <input name="code" className="ui-input" defaultValue={rule.code} required />
                                              </label>

                                              <label className="space-y-2">
                                                <span className="ui-label">Efecto consumo</span>
                                                <select name="effect_type" className="ui-input" defaultValue={parseConsumptionEffectType(rule.effect_type)}>
                                                  <option value="additive">Extra / suma</option>
                                                  <option value="replacement">Sustituto</option>
                                                </select>
                                              </label>

                                              <label className="space-y-2">
                                                <span className="ui-label">Factor conversión</span>
                                                <input
                                                  name="conversion_factor_to_stock"
                                                  type="number"
                                                  min="0.0001"
                                                  step="0.0001"
                                                  className="ui-input"
                                                  defaultValue={String(rule.conversion_factor_to_stock ?? 1)}
                                                />
                                              </label>
                                            </div>

                                            <div className="grid gap-4 lg:grid-cols-[150px_150px_1fr]">
                                              <label className="space-y-2">
                                                <span className="ui-label">Cantidad entrada</span>
                                                <input
                                                  name="input_quantity_per_option"
                                                  type="number"
                                                  min="0.0001"
                                                  step="0.0001"
                                                  className="ui-input"
                                                  defaultValue={rule.input_quantity_per_option == null ? "" : String(rule.input_quantity_per_option)}
                                                />
                                              </label>

                                              <label className="space-y-2">
                                                <span className="ui-label">Unidad entrada</span>
                                                <select name="input_unit_code" className="ui-input" defaultValue={rule.input_unit_code ?? ""}>
                                                  <option value="">Sin unidad</option>
                                                  {inventoryUnits.map((unit) => (
                                                    <option key={unit.code} value={unit.code}>
                                                      {unit.name}{unit.symbol ? ` (${unit.symbol})` : ""}
                                                    </option>
                                                  ))}
                                                </select>
                                              </label>

                                              <label className="space-y-2">
                                                <span className="ui-label">Perfil UOM</span>
                                                <select name="input_uom_profile_id" className="ui-input" defaultValue={rule.input_uom_profile_id ?? ""}>
                                                  <option value="">Sin perfil</option>
                                                  {ruleProfiles.map((profile) => (
                                                    <option key={profile.id} value={profile.id}>
                                                      {profile.label}
                                                    </option>
                                                  ))}
                                                </select>
                                              </label>
                                            </div>

                                            <div className="grid gap-4 lg:grid-cols-[220px_1fr_1fr]">
                                              <label className="space-y-2">
                                                <span className="ui-label">LOC de consumo</span>
                                                <select
                                                  name="source_location_strategy"
                                                  className="ui-input"
                                                  defaultValue={parseSourceLocationStrategy(rule.source_location_strategy)}
                                                >
                                                  <option value="product_production_location">LOC de preparación del producto</option>
                                                  <option value="explicit_location">LOC explícito</option>
                                                  <option value="explicit_position">Posición interna explícita</option>
                                                </select>
                                              </label>

                                              <label className="space-y-2">
                                                <span className="ui-label">LOC explícito</span>
                                                <select name="source_location_id" className="ui-input" defaultValue={rule.source_location_id ?? ""}>
                                                  <option value="">Sin LOC explícito</option>
                                                  {inventoryLocations.map((location) => (
                                                    <option key={location.id} value={location.id}>
                                                      {[location.code, location.zone, location.location_type].filter(Boolean).join(" · ")}
                                                    </option>
                                                  ))}
                                                </select>
                                              </label>

                                              <label className="space-y-2">
                                                <span className="ui-label">Posición interna</span>
                                                <select name="source_location_position_id" className="ui-input" defaultValue={rule.source_location_position_id ?? ""}>
                                                  <option value="">Sin posición</option>
                                                  {inventoryLocations.map((location) => {
                                                    const positions = positionsByLocation.get(location.id) ?? [];
                                                    if (positions.length === 0) return null;

                                                    return (
                                                      <optgroup key={location.id} label={location.code}>
                                                        {positions.map((position) => (
                                                          <option key={position.id} value={position.id}>
                                                            {position.code} · {position.name}
                                                          </option>
                                                        ))}
                                                      </optgroup>
                                                    );
                                                  })}
                                                </select>
                                              </label>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-4">
                                              <span className="ui-chip">
                                                {rule.effect_type === "replacement" ? "Sustituye con" : "Consume"} {formatQuantityAdmin(rule.quantity_per_option)} {rule.stock_unit_code || product?.stock_unit_code || product?.unit || "unidad"}
                                              </span>

                                              <label className="flex items-center gap-2 text-sm font-semibold text-[var(--ui-text)]">
                                                <input type="checkbox" name="is_active" defaultChecked={rule.is_active} />
                                                Activa
                                              </label>

                                              <button type="submit" className="ui-btn ui-btn--brand">
                                                Guardar regla
                                              </button>
                                            </div>
                                          </form>

                                          <div className="mt-3">
                                            <form action={disableConsumptionRule}>
                                              <input type="hidden" name="catalog_item_id" value={row.id} />
                                              <input type="hidden" name="option_id" value={option.id} />
                                              <input type="hidden" name="consumption_rule_id" value={rule.id} />
                                              <button type="submit" className="ui-btn ui-btn--ghost">
                                                Desactivar regla
                                              </button>
                                            </form>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form action={disableMenuItem}><input type="hidden" name="id" value={row.id} /><button type="submit" className="ui-btn ui-btn--ghost">Deshabilitar</button></form>
        <form action={deleteMenuItem}><input type="hidden" name="id" value={row.id} /><button type="submit" className="ui-btn ui-btn--danger">Eliminar item</button></form>
      </div>
    </div>
  );
}
