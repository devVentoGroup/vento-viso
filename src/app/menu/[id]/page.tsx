import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { PageHeader } from "@/components/vento/standard/page-header";
import { MenuPersonalizationsClient } from "@/components/viso/menu-personalizations-client";
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

type SharedCustomizationTemplateRow = {
  id: string;
  site_id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
};

type SharedCustomizationTemplateGroupRow = {
  template_id: string;
  option_group_id: string;
  sort_order: number;
  is_active: boolean;
};

type SharedCustomizationTemplateAssignmentRow = {
  catalog_item_id: string;
  template_id: string;
  sort_order: number;
  is_active: boolean;
};

type VisualVariantRow = {
  id: string;
  name: string;
  code: string;
  price_amount: number | string | null;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
  sort_order: number | null;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type CatalogItemOptionRow = {
  id: string;
  option_group_id: string;
  code: string;
  name: string;
  description: string | null;
  price_delta_amount: number | string;
  image_url: string | null;
  product_id: string | null;
  effect_type: string;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
  metadata: Record<string, unknown> | null;
};

type CommercialCatalogItemOptionRow = {
  id: string;
  name: string | null;
  price_amount: number | string | null;
  image_url: string | null;
  category_label: string | null;
  is_active: boolean | null;
};

type CatalogOptionVisualAssetRow = {
  id: string;
  site_id: string | null;
  asset_key: string;
  display_name: string;
  image_url: string;
  linked_product_id: string | null;
  linked_ingredient_product_id: string | null;
  option_code: string | null;
  normalized_option_name: string | null;
  scope: string;
  is_active: boolean;
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

type SimpleGroupKind = "choice" | "extras" | "replacements" | "removals" | "preferences" | "recommendations";

function readGroupMetadata(value: Record<string, unknown> | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function getSimpleGroupKind(group: CatalogItemOptionGroupRow): SimpleGroupKind {
  const metadata = readGroupMetadata(group.metadata);
  const preset = typeof metadata.preset === "string" ? metadata.preset : "";
  const code = group.code.toLowerCase();
  const name = group.name.toLowerCase();

  if (preset === "extras" || code.includes("extra") || name.includes("extra") || name.includes("adicion")) {
    return "extras";
  }

  if (
    preset === "replacements" ||
    code.includes("cambio") ||
    code.includes("reemplazo") ||
    name.includes("cambio") ||
    name.includes("reemplazo") ||
    name.includes("sustit")
  ) {
    return "replacements";
  }

  if (preset === "removals" || code.includes("quitar") || name.includes("quitar") || name.includes("sin ")) {
    return "removals";
  }

  if (
    preset === "recommendations" ||
    name.includes("recomend") ||
    name.includes("tambien") ||
    name.includes("también") ||
    name.includes("sugerir")
  ) {
    return "recommendations";
  }

  if (preset === "preferences" || name.includes("preferencia") || name.includes("instruccion")) {
    return "preferences";
  }

  return "choice";
}

function getSimpleGroupLabel(kind: SimpleGroupKind) {
  switch (kind) {
    case "extras":
      return "Adiciones";
    case "replacements":
      return "Cambios";
    case "removals":
      return "Quitar ingredientes";
    case "preferences":
      return "Preferencias";
    case "recommendations":
      return "Sugerencia de venta";
    case "choice":
    default:
      return "Debe escoger";
  }
}

function getSimpleGroupDisplayName(group: CatalogItemOptionGroupRow) {
  const kind = getSimpleGroupKind(group);
  const name = String(group.name ?? "").trim();
  const normalized = name.toLowerCase();

  if (
    kind === "recommendations" &&
    (normalized.includes("producto") ||
      normalized.includes("recomend") ||
      normalized.includes("sugerir"))
  ) {
    return "También puedes agregar";
  }

  return name || getSimpleGroupLabel(kind);
}

function getSimpleGroupHelp(kind: SimpleGroupKind) {
  switch (kind) {
    case "extras":
      return "Para queso extra, salsas, leche vegetal, shot adicional o complementos.";
    case "replacements":
      return "Para cambios como leche normal por vegetal, queso estándar por queso premium o ingrediente base por otro insumo.";
    case "removals":
      return "Para opciones como “sin cebolla”, “sin tomate” o “sin salsa”.";
    case "preferences":
      return "Para instrucciones que no cambian inventario: poco dulce, bien caliente o partir en dos.";
    case "recommendations":
      return "Para bebidas, postres o acompañamientos que el cliente puede sumar.";
    case "choice":
    default:
      return "Para tamaño, tipo de leche, bebida o acompañamiento obligatorio.";
  }
}

function getSimpleDefaultEffect(kind: SimpleGroupKind) {
  switch (kind) {
    case "extras":
    case "recommendations":
      return "additive";
    case "replacements":
      return "replacement";
    case "removals":
      return "removal";
    case "preferences":
    case "choice":
    default:
      return "preference";
  }
}

function getOptionSummary(option: CatalogItemOptionRow) {
  const price = Number(option.price_delta_amount ?? 0);
  return price > 0 ? `Suma ${formatCopAdmin(price)}` : "Sin costo adicional";
}

function getSelectionRuleLabel(group: CatalogItemOptionGroupRow) {
  const isMultiple = parseSelectionType(group.selection_type) === "multiple";
  if (group.is_required) {
    return isMultiple ? `Debe escoger entre ${group.min_select} y ${group.max_select}` : "Debe escoger 1";
  }

  return isMultiple ? `Puede escoger hasta ${group.max_select}` : "Puede escoger 1";
}

function getLinkedCatalogItemId(option: CatalogItemOptionRow) {
  const metadata = option.metadata && typeof option.metadata === "object" && !Array.isArray(option.metadata)
    ? option.metadata
    : {};
  const linkedCatalogItemId = metadata.linked_catalog_item_id;
  return typeof linkedCatalogItemId === "string" && linkedCatalogItemId.trim()
    ? linkedCatalogItemId.trim()
    : null;
}

function getOptionIngredientProductId(option: CatalogItemOptionRow) {
  const metadata = option.metadata && typeof option.metadata === "object" && !Array.isArray(option.metadata)
    ? option.metadata
    : {};
  const ingredientProductId = metadata.ingredient_product_id;
  return typeof ingredientProductId === "string" && ingredientProductId.trim()
    ? ingredientProductId.trim()
    : null;
}

function getOptionDisplayName(
  option: CatalogItemOptionRow,
  linkedCatalogItemsById: Map<string, CommercialCatalogItemOptionRow>,
) {
  const linkedItemId = getLinkedCatalogItemId(option);
  const linkedItem = linkedItemId ? linkedCatalogItemsById.get(linkedItemId) : null;
  return linkedItem?.name || option.name;
}

function getOptionDisplayCategory(
  option: CatalogItemOptionRow,
  linkedCatalogItemsById: Map<string, CommercialCatalogItemOptionRow>,
) {
  const linkedItemId = getLinkedCatalogItemId(option);
  const linkedItem = linkedItemId ? linkedCatalogItemsById.get(linkedItemId) : null;
  return linkedItem?.category_label || option.description || "";
}


function parseSimpleGroupKind(value: FormDataEntryValue | string | null | undefined): SimpleGroupKind {
  const kind = typeof value === "string" ? value.trim() : "";

  if (
    kind === "extras" ||
    kind === "replacements" ||
    kind === "removals" ||
    kind === "preferences" ||
    kind === "recommendations"
  ) {
    return kind;
  }

  return "choice";
}

function getSimpleGroupCreationDefaults(kind: SimpleGroupKind) {
  switch (kind) {
    case "extras":
      return {
        name: "Adiciones",
        description: "El cliente puede agregar extras o adicionales.",
        selectionType: "multiple",
        isRequired: false,
        minSelect: 0,
        maxSelect: 10,
        sortBase: 200,
      };
    case "replacements":
      return {
        name: "Cambios",
        description: "El cliente puede reemplazar un ingrediente de la receta por otro insumo.",
        selectionType: "multiple",
        isRequired: false,
        minSelect: 0,
        maxSelect: 10,
        sortBase: 300,
      };
    case "removals":
      return {
        name: "Quitar ingredientes",
        description: "El cliente puede pedir retirar ingredientes.",
        selectionType: "multiple",
        isRequired: false,
        minSelect: 0,
        maxSelect: 99,
        sortBase: 900,
      };
    case "preferences":
      return {
        name: "Preferencias",
        description: "El cliente puede dejar instrucciones de preparación.",
        selectionType: "multiple",
        isRequired: false,
        minSelect: 0,
        maxSelect: 10,
        sortBase: 700,
      };
    case "recommendations":
      return {
        name: "También puedes agregar",
        description: "Bebidas, postres o acompañamientos que el cliente puede sumar.",
        selectionType: "multiple",
        isRequired: false,
        minSelect: 0,
        maxSelect: 10,
        sortBase: 800,
      };
    case "choice":
    default:
      return {
        name: "Elige una opción",
        description: "El cliente debe escoger una opción.",
        selectionType: "single",
        isRequired: true,
        minSelect: 1,
        maxSelect: 1,
        sortBase: 100,
      };
  }
}

async function getNextOptionGroupSortOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemId: string,
  fallbackBase: number,
) {
  const { data } = await supabase
    .schema("pass")
    .from("catalog_item_option_groups")
    .select("sort_order")
    .eq("catalog_item_id", itemId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const current = Number(data?.sort_order ?? fallbackBase - 10);
  return Number.isFinite(current) ? current + 10 : fallbackBase;
}

async function getNextOptionSortOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  groupId: string,
) {
  const { data } = await supabase
    .schema("pass")
    .from("catalog_item_options")
    .select("sort_order")
    .eq("option_group_id", groupId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const current = Number(data?.sort_order ?? -10);
  return Number.isFinite(current) ? current + 10 : 0;
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
      error: "El producto base no esta habilitado para esta sede.",
      categoryLabel: "",
      basePriceAmount: null,
      recipeCostAmount: null,
    };
  }

  if (commercialCategoryError) {
    return {
      error: `No se pudo validar la categoría comercial: ${commercialCategoryError.message}`,
      categoryLabel: "",
      basePriceAmount: null,
      recipeCostAmount: null,
    };
  }

  if (!commercialCategory) {
    return {
      error: "La categoría comercial seleccionada no existe, esta inactiva o no pertenece a esta sede.",
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
      error: "La categoría comercial seleccionada no tiene nombre ni codigo.",
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
  const requestedOpensDetailModal = asBool(formData.get("opens_detail_modal"));

  const admin = createAdminClient();
  const [
    { data: currentItem },
    { data: currentPresentationRaw },
    { count: activePersonalizationCount },
  ] = await Promise.all([
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
    admin
      .schema("pass")
      .from("catalog_item_option_groups")
      .select("id", { count: "exact", head: true })
      .eq("catalog_item_id", id)
      .eq("is_active", true),
  ]);

  const opensDetailModal = requestedOpensDetailModal || Number(activePersonalizationCount ?? 0) > 0;
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
    display_group: asText(formData.get("display_group")) || null,
    variant_label: asText(formData.get("variant_label")) || null,
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
  redirect("/menu?ok=" + encodeURIComponent("Producto actualizado."));
}


async function createOptionGroup(formData: FormData) {
  "use server";
  const supabase = await createClient();

  const itemId = asText(formData.get("catalog_item_id"));
  const groupKind = parseSimpleGroupKind(formData.get("group_kind"));
  const defaults = getSimpleGroupCreationDefaults(groupKind);
  const name = asText(formData.get("name")) || defaults.name;
  const description = asText(formData.get("description")) || defaults.description;
  const selectionType = defaults.selectionType;
  const isRequired = defaults.isRequired;
  const requestedMax = Math.round(asNonNegativeNumber(formData.get("max_select")));
  const maxSelect = selectionType === "single"
    ? 1
    : Math.max(defaults.maxSelect, requestedMax || defaults.maxSelect);
  const sortOrder = await getNextOptionGroupSortOrder(supabase, itemId, defaults.sortBase);
  const code = asCatalogCode(formData.get("code"), name);

  if (!itemId || !name || !code) {
    redirect(`/menu/${itemId || ""}?error=${encodeURIComponent("Falta el nombre del grupo.")}`);
  }

  const { data: existingGroup, error: existingGroupError } = await supabase
    .schema("pass")
    .from("catalog_item_option_groups")
    .select("id,is_active")
    .eq("catalog_item_id", itemId)
    .eq("code", code)
    .maybeSingle();

  if (existingGroupError) {
    redirect(`/menu/${itemId}?error=${encodeURIComponent(existingGroupError.message)}`);
  }

  if (existingGroup?.id) {
    if (existingGroup.is_active === false) {
      const { error: reactivateError } = await supabase
        .schema("pass")
        .from("catalog_item_option_groups")
        .update({
          name,
          description,
          selection_type: selectionType,
          is_required: isRequired,
          min_select: defaults.minSelect,
          max_select: maxSelect,
          sort_order: sortOrder,
          is_active: true,
          metadata: {
            preset: groupKind,
            configured_from: "simple_product_page",
          },
        })
        .eq("id", existingGroup.id)
        .eq("catalog_item_id", itemId);

      if (reactivateError) {
        redirect(`/menu/${itemId}?error=${encodeURIComponent(reactivateError.message)}`);
      }

      revalidatePath(`/menu/${itemId}`);
      redirect(`/menu/${itemId}?ok=${encodeURIComponent("Personalizacion reactivada.")}`);
    }

    redirect(`/menu/${itemId}?ok=${encodeURIComponent("Esa personalizacion ya existe.")}`);
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
      min_select: defaults.minSelect,
      max_select: maxSelect,
      sort_order: sortOrder,
      is_active: true,
      metadata: {
        preset: groupKind,
        configured_from: "simple_product_page",
      },
    });

  if (error) {
    if (error.code === "23505") {
      redirect(`/menu/${itemId}?ok=${encodeURIComponent("Esa personalizacion ya existe.")}`);
    }

    redirect(`/menu/${itemId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/menu/${itemId}`);
  redirect(`/menu/${itemId}?ok=${encodeURIComponent("Grupo creado.")}`);
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
    redirect(`/menu/${itemId || ""}?error=${encodeURIComponent("Grupo de opciones inválido.")}`);
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
  const priceDeltaAmount = asNonNegativeNumber(formData.get("price_delta_amount"));
  const linkedCatalogItemId = asOptionalText(formData.get("linked_catalog_item_id"));
  const optionOperationalProductId = asText(formData.get("option_product_id"));
  const optionQuantityPerOption = asNonNegativeNumber(formData.get("option_quantity_per_option"));
  const optionStockUnitCode = asOptionalText(formData.get("option_stock_unit_code"));
  const replacementTargetIngredientProductId = asText(formData.get("replacement_target_ingredient_product_id"));

  if (!itemId || !groupId) {
    redirect(`/menu/${itemId || ""}?error=${encodeURIComponent("Faltan datos para crear la opción.")}`);
  }

  const { data: group, error: groupError } = await supabase
    .schema("pass")
    .from("catalog_item_option_groups")
    .select("id,catalog_item_id,code,name,selection_type,metadata")
    .eq("id", groupId)
    .eq("catalog_item_id", itemId)
    .maybeSingle();

  if (groupError || !group) {
    redirect(`/menu/${itemId}?error=${encodeURIComponent(groupError?.message || "El grupo no pertenece a este producto.")}`);
  }

  const groupKind = getSimpleGroupKind(group as CatalogItemOptionGroupRow);
  const requiresLinkedProduct = groupKind === "recommendations";
  const requiresOperationalConsumption = groupKind === "extras" || groupKind === "replacements";
  const hasPartialOperationalConsumption = Boolean(optionOperationalProductId) || optionQuantityPerOption > 0 || Boolean(optionStockUnitCode);

  if (requiresLinkedProduct && !linkedCatalogItemId) {
    redirect(`/menu/${itemId}?error=${encodeURIComponent("Selecciona el producto comercial sugerido.")}`);
  }

  if (!requiresLinkedProduct && !name) {
    redirect(`/menu/${itemId}?error=${encodeURIComponent("Falta el nombre de la opción.")}`);
  }

  if ((requiresOperationalConsumption || hasPartialOperationalConsumption) && (!optionOperationalProductId || optionQuantityPerOption <= 0)) {
    redirect(`/menu/${itemId}?error=${encodeURIComponent("La opción necesita producto operacional y cantidad de consumo mayor a 0.")}`);
  }

  if (groupKind === "replacements" && !replacementTargetIngredientProductId) {
    redirect(`/menu/${itemId}?error=${encodeURIComponent("El cambio necesita indicar qué ingrediente de receta reemplaza.")}`);
  }

  const sortOrder = await getNextOptionSortOrder(supabase, groupId);
  let finalName = name;
  let finalDescription = description;
  let finalPriceDeltaAmount = priceDeltaAmount;
  let linkedCatalogMetadata: Record<string, unknown> = {};
  let finalEffectType = getSimpleDefaultEffect(groupKind);

  if (groupKind === "choice" && optionOperationalProductId) {
    finalEffectType = "additive";
  }

  if (linkedCatalogItemId) {
    const [{ data: currentItem }, { data: linkedItem, error: linkedError }] = await Promise.all([
      supabase
        .schema("pass")
        .from("catalog_items")
        .select("id,site_id")
        .eq("id", itemId)
        .maybeSingle(),
      supabase
        .schema("pass")
        .from("catalog_items")
        .select("id,site_id,name,description,price_amount,is_active")
        .eq("id", linkedCatalogItemId)
        .maybeSingle(),
    ]);

    if (
      linkedError ||
      !currentItem ||
      !linkedItem ||
      linkedItem.site_id !== currentItem.site_id ||
      linkedItem.is_active === false
    ) {
      redirect(`/menu/${itemId}?error=${encodeURIComponent("El producto sugerido no está disponible en esta sede.")}`);
    }

    const linkedPrice = Number(linkedItem.price_amount ?? 0);
    finalName = linkedItem.name || name;
    finalDescription = description || linkedItem.description || null;
    finalPriceDeltaAmount = Number.isFinite(linkedPrice) ? Math.max(0, linkedPrice) : 0;
    linkedCatalogMetadata = {
      linked_catalog_item_id: linkedItem.id,
      linked_catalog_item_price_amount: finalPriceDeltaAmount,
    };
  }

  const optionCode = asCatalogCode(formData.get("code"), finalName);
  if (!optionCode) {
    redirect(`/menu/${itemId}?error=${encodeURIComponent("No se pudo generar el código de la opción.")}`);
  }

  const { data: createdOption, error } = await supabase
    .schema("pass")
    .from("catalog_item_options")
    .insert({
      option_group_id: groupId,
      code: optionCode,
      name: finalName,
      description: finalDescription,
      price_delta_amount: finalPriceDeltaAmount,
      product_id: optionOperationalProductId || null,
      effect_type: finalEffectType,
      is_default: asBool(formData.get("is_default")),
      is_active: true,
      sort_order: sortOrder,
      metadata: {
        preset: groupKind,
        configured_from: "product_personalization_page",
        operational_product_id: optionOperationalProductId || null,
        replacement_target_ingredient_product_id: replacementTargetIngredientProductId || null,
        ...linkedCatalogMetadata,
      },
    })
    .select("id")
    .single();

  if (error || !createdOption?.id) {
    redirect(`/menu/${itemId}?error=${encodeURIComponent(error?.message || "No se pudo crear la opción.")}`);
  }

  if (optionOperationalProductId) {
    const { error: ruleError } = await supabase
      .schema("pass")
      .from("catalog_item_option_consumption_rules")
      .insert({
        option_id: createdOption.id,
        code: `consumo-${optionCode}`,
        name: `Consumir ${finalName}`,
        product_id: optionOperationalProductId,
        effect_type: finalEffectType === "replacement" ? "replacement" : "additive",
        quantity_per_option: optionQuantityPerOption,
        stock_unit_code: optionStockUnitCode,
        input_quantity_per_option: optionQuantityPerOption,
        input_unit_code: optionStockUnitCode,
        conversion_factor_to_stock: 1,
        input_uom_profile_id: null,
        source_location_strategy: "product_production_location",
        source_location_id: null,
        source_location_position_id: null,
        is_active: true,
        sort_order: 0,
        metadata: {
          configured_from: "product_personalization_page",
        },
      });

    if (ruleError) {
      await supabase.schema("pass").from("catalog_item_options").delete().eq("id", createdOption.id);
      redirect(`/menu/${itemId}?error=${encodeURIComponent(ruleError.message)}`);
    }
  }

  if (replacementTargetIngredientProductId) {
    const { error: recipeEffectError } = await supabase
      .schema("pass")
      .from("catalog_item_option_recipe_effects")
      .insert({
        option_id: createdOption.id,
        effect_type: "replacement",
        target_ingredient_product_id: replacementTargetIngredientProductId,
        recipe_component_code: null,
        quantity_mode: "full_recipe_component",
        quantity_amount: null,
        stock_unit_code: null,
        is_active: true,
        sort_order: 0,
        metadata: {
          configured_from: "product_personalization_page",
        },
      });

    if (recipeEffectError) {
      await supabase.schema("pass").from("catalog_item_options").delete().eq("id", createdOption.id);
      redirect(`/menu/${itemId}?error=${encodeURIComponent(recipeEffectError.message)}`);
    }
  }

  revalidatePath(`/menu/${itemId}`);
  redirect(`/menu/${itemId}?ok=${encodeURIComponent("Opción creada y mapeada.")}`);
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

async function disableRecipeEffect(formData: FormData) {
  "use server";
  const supabase = await createClient();

  const itemId = asText(formData.get("catalog_item_id"));
  const optionId = asText(formData.get("option_id"));
  const effectId = asText(formData.get("recipe_effect_id"));

  if (!itemId || !optionId || !effectId) {
    redirect(`/menu/${itemId || ""}?error=${encodeURIComponent("Efecto de receta inválido.")}`);
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

function readFormIds(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((value) => asText(value))
    .filter(Boolean);
}

async function getCatalogItemSite(supabase: SupabaseServerClient, itemId: string) {
  const { data, error } = await supabase
    .schema("pass")
    .from("catalog_items")
    .select("id,site_id")
    .eq("id", itemId)
    .maybeSingle();

  if (error || !data?.id) {
    throw new Error(error?.message || "Producto comercial no encontrado.");
  }

  return data as { id: string; site_id: string };
}

async function validateOptionGroupsForItem(
  supabase: SupabaseServerClient,
  itemId: string,
  groupIds: string[],
) {
  const uniqueIds = Array.from(new Set(groupIds));
  if (uniqueIds.length === 0) return [];

  const { data, error } = await supabase
    .schema("pass")
    .from("catalog_item_option_groups")
    .select("id,sort_order")
    .eq("catalog_item_id", itemId)
    .eq("is_active", true)
    .in("id", uniqueIds);

  if (error) throw new Error(error.message);
  if ((data ?? []).length !== uniqueIds.length) {
    throw new Error("Uno de los grupos seleccionados no pertenece a este producto.");
  }

  return (data ?? []) as { id: string; sort_order: number | null }[];
}

async function validateCatalogItemsForSite(
  supabase: SupabaseServerClient,
  siteId: string,
  itemIds: string[],
) {
  const uniqueIds = Array.from(new Set(itemIds));
  if (uniqueIds.length === 0) return [];

  const { data, error } = await supabase
    .schema("pass")
    .from("catalog_items")
    .select("id,sort_order")
    .eq("site_id", siteId)
    .eq("is_active", true)
    .in("id", uniqueIds);

  if (error) throw new Error(error.message);
  if ((data ?? []).length !== uniqueIds.length) {
    throw new Error("Una de las variantes seleccionadas no pertenece a esta sede.");
  }

  return (data ?? []) as { id: string; sort_order: number | null }[];
}

async function createSharedCustomizationTemplate(formData: FormData) {
  "use server";
  const supabase = await createClient();

  const itemId = asText(formData.get("catalog_item_id"));
  const name = asText(formData.get("name"));
  const code = asCatalogCode(formData.get("code"), name);
  const description = asText(formData.get("description")) || null;
  const groupIds = readFormIds(formData, "option_group_id");
  const variantIds = readFormIds(formData, "variant_item_id");

  if (!itemId || !name || !code) {
    redirect(`/menu/${itemId || ""}?error=${encodeURIComponent("Falta el nombre de la plantilla compartida.")}`);
  }

  if (groupIds.length === 0) {
    redirect(`/menu/${itemId}?error=${encodeURIComponent("Selecciona al menos un grupo para compartir.")}`);
  }

  try {
    const item = await getCatalogItemSite(supabase, itemId);
    const validGroups = await validateOptionGroupsForItem(supabase, itemId, groupIds);
    const validVariants = await validateCatalogItemsForSite(supabase, item.site_id, variantIds.length > 0 ? variantIds : [itemId]);

    const { data: template, error: templateError } = await supabase
      .schema("pass")
      .from("catalog_item_customization_templates")
      .insert({
        site_id: item.site_id,
        code,
        name,
        description,
        is_active: true,
        metadata: {
          configured_from: "viso_menu_product_page",
          source_catalog_item_id: itemId,
        },
      })
      .select("id")
      .single();

    if (templateError || !template?.id) {
      throw new Error(templateError?.message || "No se pudo crear la plantilla.");
    }

    const templateId = template.id as string;

    const { error: groupsError } = await supabase
      .schema("pass")
      .from("catalog_item_customization_template_groups")
      .upsert(
        validGroups.map((group) => ({
          template_id: templateId,
          option_group_id: group.id,
          sort_order: Number(group.sort_order ?? 0),
          is_active: true,
          metadata: { configured_from: "viso_menu_product_page" },
        })),
        { onConflict: "template_id,option_group_id" },
      );

    if (groupsError) throw new Error(groupsError.message);

    if (validVariants.length > 0) {
      const { error: assignmentsError } = await supabase
        .schema("pass")
        .from("catalog_item_customization_template_assignments")
        .upsert(
          validVariants.map((variant) => ({
            catalog_item_id: variant.id,
            template_id: templateId,
            sort_order: Number(variant.sort_order ?? 0),
            is_active: true,
            metadata: { configured_from: "viso_menu_product_page" },
          })),
          { onConflict: "catalog_item_id,template_id" },
        );

      if (assignmentsError) throw new Error(assignmentsError.message);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo crear la plantilla compartida.";
    redirect(`/menu/${itemId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/menu/${itemId}`);
  redirect(`/menu/${itemId}?ok=${encodeURIComponent("Plantilla compartida creada.")}`);
}

async function updateSharedCustomizationTemplate(formData: FormData) {
  "use server";
  const supabase = await createClient();

  const itemId = asText(formData.get("catalog_item_id"));
  const templateId = asText(formData.get("template_id"));
  const name = asText(formData.get("name"));
  const description = asText(formData.get("description")) || null;
  const selectedGroupIds = readFormIds(formData, "option_group_id");
  const selectedVariantIds = readFormIds(formData, "variant_item_id");
  const managedGroupIds = readFormIds(formData, "managed_option_group_id");
  const managedVariantIds = readFormIds(formData, "managed_variant_item_id");

  if (!itemId || !templateId || !name) {
    redirect(`/menu/${itemId || ""}?error=${encodeURIComponent("Faltan datos para actualizar la plantilla.")}`);
  }

  if (selectedGroupIds.length === 0) {
    redirect(`/menu/${itemId}?error=${encodeURIComponent("La plantilla debe compartir al menos un grupo.")}`);
  }

  try {
    const item = await getCatalogItemSite(supabase, itemId);

    const { data: template, error: templateError } = await supabase
      .schema("pass")
      .from("catalog_item_customization_templates")
      .select("id,site_id")
      .eq("id", templateId)
      .maybeSingle();

    if (templateError || !template?.id || template.site_id !== item.site_id) {
      throw new Error(templateError?.message || "La plantilla no pertenece a esta sede.");
    }

    const validGroups = await validateOptionGroupsForItem(supabase, itemId, selectedGroupIds);
    const validVariants = await validateCatalogItemsForSite(supabase, item.site_id, selectedVariantIds);

    const { error: templateUpdateError } = await supabase
      .schema("pass")
      .from("catalog_item_customization_templates")
      .update({ name, description, is_active: asBool(formData.get("is_active")) })
      .eq("id", templateId)
      .eq("site_id", item.site_id);

    if (templateUpdateError) throw new Error(templateUpdateError.message);

    const selectedGroupSet = new Set(validGroups.map((group) => group.id));
    const selectedVariantSet = new Set(validVariants.map((variant) => variant.id));

    const { error: groupsError } = await supabase
      .schema("pass")
      .from("catalog_item_customization_template_groups")
      .upsert(
        validGroups.map((group) => ({
          template_id: templateId,
          option_group_id: group.id,
          sort_order: Number(group.sort_order ?? 0),
          is_active: true,
          metadata: { configured_from: "viso_menu_product_page" },
        })),
        { onConflict: "template_id,option_group_id" },
      );

    if (groupsError) throw new Error(groupsError.message);

    const groupsToDisable = managedGroupIds.filter((groupId) => !selectedGroupSet.has(groupId));
    if (groupsToDisable.length > 0) {
      const { error: disableGroupsError } = await supabase
        .schema("pass")
        .from("catalog_item_customization_template_groups")
        .update({ is_active: false })
        .eq("template_id", templateId)
        .in("option_group_id", groupsToDisable);

      if (disableGroupsError) throw new Error(disableGroupsError.message);
    }

    const { error: assignmentsError } = await supabase
      .schema("pass")
      .from("catalog_item_customization_template_assignments")
      .upsert(
        validVariants.map((variant) => ({
          catalog_item_id: variant.id,
          template_id: templateId,
          sort_order: Number(variant.sort_order ?? 0),
          is_active: true,
          metadata: { configured_from: "viso_menu_product_page" },
        })),
        { onConflict: "catalog_item_id,template_id" },
      );

    if (assignmentsError) throw new Error(assignmentsError.message);

    const assignmentsToDisable = managedVariantIds.filter((variantId) => !selectedVariantSet.has(variantId));
    if (assignmentsToDisable.length > 0) {
      const { error: disableAssignmentsError } = await supabase
        .schema("pass")
        .from("catalog_item_customization_template_assignments")
        .update({ is_active: false })
        .eq("template_id", templateId)
        .in("catalog_item_id", assignmentsToDisable);

      if (disableAssignmentsError) throw new Error(disableAssignmentsError.message);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo actualizar la plantilla compartida.";
    redirect(`/menu/${itemId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/menu/${itemId}`);
  redirect(`/menu/${itemId}?ok=${encodeURIComponent("Plantilla compartida actualizada.")}`);
}

async function createRemovalOptionFromRecipe(formData: FormData) {
  "use server";
  const supabase = await createClient();

  const itemId = asText(formData.get("catalog_item_id"));
  const requestedGroupId = asText(formData.get("option_group_id"));
  const ingredientProductId = asText(formData.get("ingredient_product_id"));
  const ingredientName = asText(formData.get("ingredient_name"));
  const stockUnitCode = asOptionalText(formData.get("stock_unit_code"));

  if (!itemId || !ingredientProductId || !ingredientName) {
    redirect(`/menu/${itemId || ""}?error=${encodeURIComponent("Ingrediente inválido para crear opcion de retiro.")}`);
  }

  const groupCode = "quitar-ingredientes";
  let groupId: string | undefined;

  if (requestedGroupId) {
    const { data: requestedGroup, error: requestedGroupError } = await supabase
      .schema("pass")
      .from("catalog_item_option_groups")
      .select("id,catalog_item_id,is_active")
      .eq("id", requestedGroupId)
      .eq("catalog_item_id", itemId)
      .maybeSingle();

    if (requestedGroupError || !requestedGroup || requestedGroup.is_active === false) {
      redirect(`/menu/${itemId}?error=${encodeURIComponent(requestedGroupError?.message || "El grupo de ingredientes no pertenece a este producto o está inactivo.")}`);
    }

    groupId = requestedGroup.id as string;
  }

  if (!groupId) {
    const { data: existingGroup, error: existingGroupError } = await supabase
      .schema("pass")
      .from("catalog_item_option_groups")
      .select("id,is_active")
      .eq("catalog_item_id", itemId)
      .eq("code", groupCode)
      .maybeSingle();

    if (existingGroupError) {
      redirect(`/menu/${itemId}?error=${encodeURIComponent(existingGroupError.message)}`);
    }

    if (existingGroup?.id && existingGroup.is_active !== false) {
      groupId = existingGroup.id as string;
    }
  }

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
        metadata: { preset: "removals", source: "recipe_removals", configured_from: "simple_product_page" },
      })
      .select("id")
      .single();

    if (groupError || !createdGroup?.id) {
      redirect(`/menu/${itemId}?error=${encodeURIComponent(groupError?.message || "No se pudo crear el grupo de retiros.")}`);
    }

    groupId = createdGroup.id;
  }

  if (!groupId) {
    redirect(`/menu/${itemId}?error=${encodeURIComponent("No se pudo resolver el grupo de ingredientes.")}`);
  }

  const resolvedGroupId = groupId;
  const optionCode = `sin-${slugify(ingredientName)}`;

  const { data: existingOption, error: existingOptionError } = await supabase
    .schema("pass")
    .from("catalog_item_options")
    .select("id")
    .eq("option_group_id", resolvedGroupId)
    .eq("code", optionCode)
    .maybeSingle();

  if (existingOptionError) {
    redirect(`/menu/${itemId}?error=${encodeURIComponent(existingOptionError.message)}`);
  }

  let optionId = existingOption?.id as string | undefined;

  if (!optionId) {
    const sortOrder = await getNextOptionSortOrder(supabase, resolvedGroupId);
    const { data: createdOption, error: optionError } = await supabase
      .schema("pass")
      .from("catalog_item_options")
      .insert({
        option_group_id: resolvedGroupId,
        code: optionCode,
        name: `Sin ${ingredientName}`,
        description: `No descontar ${ingredientName} si el cliente pide retirarlo.`,
        price_delta_amount: 0,
        product_id: null,
        effect_type: "removal",
        is_default: false,
        is_active: true,
        sort_order: sortOrder,
        metadata: { preset: "removals", source: "recipe_removals", configured_from: "simple_product_page", ingredient_product_id: ingredientProductId },
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
    redirect("/menu?error=" + encodeURIComponent("Producto inválido."));
  }

  const { error } = await supabase.schema("pass").from("catalog_items").update({ is_active: false }).eq("id", id);
  if (error) {
    redirect(`/menu/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/menu/${id}`);
  revalidatePath("/menu");
  redirect(`/menu/${id}?ok=${encodeURIComponent("Producto deshabilitado.")}`);
}

async function deleteMenuItem(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const id = asText(formData.get("id"));
  if (!id) {
    redirect("/menu?error=" + encodeURIComponent("Producto inválido."));
  }

  const { error } = await supabase.schema("pass").from("catalog_items").delete().eq("id", id);
  if (error) {
    redirect(`/menu/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/menu");
  redirect("/menu?ok=" + encodeURIComponent("Producto eliminado."));
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
    redirect("/menu?error=" + encodeURIComponent("Producto no encontrado."));
  }

  const row = item as CatalogItemRow;
  const presentation = (presentationRaw ?? null) as CatalogItemPresentationRow | null;
  const sites = (sitesRaw ?? []) as SiteRow[];
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const currentDisplayGroup = typeof metadata.display_group === "string" ? metadata.display_group.trim() : "";

  const { data: sellOptionsRaw } = await supabase
    .schema("pass").from("sell_products_by_site")
    .select("site_id,product_id,name,sku,base_price,recipe_cost_amount")
    .order("name", { ascending: true });

  const { data: commercialCatalogItemsRaw } = await supabase
    .schema("pass")
    .from("catalog_items")
    .select("id,name,price_amount,image_url,category_label,is_active")
    .eq("site_id", row.site_id)
    .eq("is_active", true)
    .neq("id", row.id)
    .order("name", { ascending: true });

  const { data: visualAssetsRaw } = await supabase
    .schema("pass")
    .from("catalog_option_visual_assets")
    .select("id,site_id,asset_key,display_name,image_url,linked_product_id,linked_ingredient_product_id,option_code,normalized_option_name,scope,is_active,metadata")
    .or(`site_id.is.null,site_id.eq.${row.site_id}`)
    .order("display_name", { ascending: true });

  const { data: visualVariantsRaw } = currentDisplayGroup
    ? await supabase
      .schema("pass")
      .from("catalog_items")
      .select("id,code,name,price_amount,is_active,metadata,sort_order")
      .eq("site_id", row.site_id)
      .eq("is_active", true)
      .eq("metadata->>display_group", currentDisplayGroup)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
    : { data: [] as VisualVariantRow[] };

  const { data: sharedTemplatesRaw } = await supabase
    .schema("pass")
    .from("catalog_item_customization_templates")
    .select("id,site_id,code,name,description,is_active,metadata")
    .eq("site_id", row.site_id)
    .order("name", { ascending: true });

  const sharedTemplates = (sharedTemplatesRaw ?? []) as SharedCustomizationTemplateRow[];
  const sharedTemplateIds = sharedTemplates.map((template) => template.id);

  const [
    { data: sharedTemplateGroupsRaw },
    { data: sharedTemplateAssignmentsRaw },
  ] = sharedTemplateIds.length > 0
    ? await Promise.all([
      supabase
        .schema("pass")
        .from("catalog_item_customization_template_groups")
        .select("template_id,option_group_id,sort_order,is_active")
        .in("template_id", sharedTemplateIds),
      supabase
        .schema("pass")
        .from("catalog_item_customization_template_assignments")
        .select("catalog_item_id,template_id,sort_order,is_active")
        .in("template_id", sharedTemplateIds),
    ])
    : [{ data: [] as SharedCustomizationTemplateGroupRow[] }, { data: [] as SharedCustomizationTemplateAssignmentRow[] }];

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
      .select("id,option_group_id,code,name,description,price_delta_amount,image_url,product_id,effect_type,is_default,is_active,sort_order,metadata")
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

  const recipeIngredients = ((recipeIngredientsRaw ?? []) as RecipeIngredientRow[])
    .map((ingredient) => ({
      ...ingredient,
      product: consumptionProductById.get(ingredient.ingredient_product_id) ?? null,
    }))
    .filter((ingredient) => Boolean(ingredient.product));

  const commercialCatalogItems = ((commercialCatalogItemsRaw ?? []) as CommercialCatalogItemOptionRow[])
    .filter((item) => item.is_active !== false)
    .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), "es-CO"));
  const visualAssets = ((visualAssetsRaw ?? []) as CatalogOptionVisualAssetRow[])
    .filter((asset) => asset.is_active !== false)
    .sort((a, b) => String(a.display_name ?? "").localeCompare(String(b.display_name ?? ""), "es-CO"));
  const commercialCatalogItemsById = new Map(commercialCatalogItems.map((item) => [item.id, item]));

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

  const commercialCategories = (categoriesRaw ?? []) as CommercialCategoryRow[];
  const commercialCollections = (collectionsRaw ?? []) as CommercialCollectionRow[];
  const currentSite = sites.find((site) => site.id === row.site_id) ?? null;
  const currentOperationalProduct = products.find((product) => product.id === row.product_id) ?? null;
  const currentCollection = commercialCollections.find((collection) => collection.id === row.commercial_collection_id) ?? null;
  const currentCategory = commercialCategories.find((category) => category.id === row.commercial_category_id) ?? null;

  const visibleOptionGroups = optionGroups.filter((group) => group.is_active);
  const visualVariantsSource = ((visualVariantsRaw ?? []) as VisualVariantRow[]);
  const visualVariants = (visualVariantsSource.length > 0
    ? visualVariantsSource
    : [{
      id: row.id,
      code: row.code,
      name: row.name,
      price_amount: row.price_amount,
      is_active: row.is_active,
      metadata: row.metadata,
      sort_order: row.sort_order,
    }]).sort((a, b) => {
      const variantA = typeof a.metadata?.variant_label === "string" ? a.metadata.variant_label : a.name;
      const variantB = typeof b.metadata?.variant_label === "string" ? b.metadata.variant_label : b.name;
      return String(variantA || "").localeCompare(String(variantB || ""), "es-CO");
    });
  const sharedTemplateGroups = (sharedTemplateGroupsRaw ?? []) as SharedCustomizationTemplateGroupRow[];
  const sharedTemplateAssignments = (sharedTemplateAssignmentsRaw ?? []) as SharedCustomizationTemplateAssignmentRow[];
  const relevantSharedTemplateIds = new Set([
    ...sharedTemplateGroups
      .filter((entry) => optionGroupIds.includes(entry.option_group_id))
      .map((entry) => entry.template_id),
    ...sharedTemplateAssignments
      .filter((entry) => visualVariants.some((variant) => variant.id === entry.catalog_item_id))
      .map((entry) => entry.template_id),
  ]);
  const visibleSharedTemplates = sharedTemplates.filter((template) => relevantSharedTemplateIds.has(template.id));
  const visibleSharedTemplateGroups = sharedTemplateGroups.filter((entry) => relevantSharedTemplateIds.has(entry.template_id));
  const visibleSharedTemplateAssignments = sharedTemplateAssignments.filter((entry) => relevantSharedTemplateIds.has(entry.template_id));
  const hasVisibleRemovalsGroup = visibleOptionGroups.some((group) => getSimpleGroupKind(group) === "removals");
  const visibleOptionGroupIds = new Set(visibleOptionGroups.map((group) => group.id));
  const passModalEnabled = Boolean(presentation?.opens_detail_modal) || visibleOptionGroups.length > 0;
  const personalizationTypeCards: {
    kind: SimpleGroupKind;
    label: string;
    defaultName: string;
    description: string;
    maxSelect?: string;
  }[] = [
    {
      kind: "choice",
      label: "Tamaño o cantidad",
      defaultName: "Elige una opción",
      description: "Tamaños, cantidades, bases o acompañamientos obligatorios.",
    },
    {
      kind: "replacements",
      label: "Cambios",
      defaultName: "Cambios",
      description: "Reemplazos que consumen un insumo nuevo y retiran uno de la receta base.",
      maxSelect: "10",
    },
    {
      kind: "removals",
      label: "Ingredientes",
      defaultName: "Ingredientes",
      description: "Ingredientes que el cliente puede pedir retirar o ajustar.",
      maxSelect: "99",
    },
    {
      kind: "extras",
      label: "Extras",
      defaultName: "Extras",
      description: "Adiciones con o sin precio adicional.",
      maxSelect: "10",
    },
    {
      kind: "preferences",
      label: "Preferencias",
      defaultName: "Preferencias",
      description: "Indicaciones de preparación sin descuento de inventario.",
      maxSelect: "10",
    },
    {
      kind: "recommendations",
      label: "Sugerir producto",
      defaultName: "También puedes agregar",
      description: "Bebidas, postres o acompañamientos que el cliente puede sumar.",
      maxSelect: "10",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Editar producto del menú"
        subtitle="Configura cómo se vende, cómo se personaliza y cómo lo verá operación."
        actions={<Link href="/menu" className="ui-btn ui-btn--ghost">Volver</Link>}
      />

      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}

      <nav className="flex flex-wrap gap-2 rounded-3xl border border-[var(--ui-border)] bg-white p-2 shadow-[var(--ui-shadow-1)]">
        <a href="#producto-comercial" className="ui-btn ui-btn--ghost">Producto</a>
        <a href="#personalizaciones" className="ui-btn ui-btn--ghost">Personalizaciones</a>
        <a href="#personalizacion-compartida" className="ui-btn ui-btn--ghost">Compartida</a>
        {recipeIngredients.length > 0 && !hasVisibleRemovalsGroup ? (
          <a href="#receta-inventario" className="ui-btn ui-btn--ghost">Receta / Inventario</a>
        ) : null}
      </nav>

      <div id="producto-comercial" className="ui-panel space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
              <form action={updateMenuItem} className="space-y-6">
          <input type="hidden" name="id" value={row.id} />
          <input type="hidden" name="metadata_extra" value={Object.keys(metadata).length ? JSON.stringify(metadata) : ""} />

          <div className="grid gap-4 lg:grid-cols-3">
            <label className="space-y-2">
              <span className="ui-label">Código interno</span>
              <input name="code" className="ui-input" defaultValue={row.code} required />
            </label>

            <label className="space-y-2 lg:col-span-2">
              <span className="ui-label">Nombre comercial</span>
              <input name="name" className="ui-input" defaultValue={row.name} placeholder="Ej. Barra de helados" required />
            </label>

            <label className="space-y-2">
              <span className="ui-label">Sede</span>
              <select name="site_id" className="ui-input" defaultValue={row.site_id} required>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name ?? site.code ?? "Sin sede"}
                  </option>
                ))}
              </select>
              {currentSite ? <p className="ui-caption">Actual: {currentSite.name ?? currentSite.code}</p> : null}
            </label>

            <label className="space-y-2">
              <span className="ui-label">Colección comercial</span>
              <select name="commercial_collection_id" className="ui-input" defaultValue={row.commercial_collection_id ?? ""} required>
                <option value="">Selecciona colección</option>
                {commercialCollections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {(collection.name ?? collection.code ?? "Sin nombre") + (collection.site_id === row.site_id ? "" : " · otra sede")}
                  </option>
                ))}
              </select>
              {currentCollection ? <p className="ui-caption">Actual: {currentCollection.name ?? currentCollection.code}</p> : null}
            </label>

            <label className="space-y-2">
              <span className="ui-label">Categoría comercial</span>
              <select name="commercial_category_id" className="ui-input" defaultValue={row.commercial_category_id ?? ""} required>
                <option value="">Selecciona categoría</option>
                {commercialCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {(category.name ?? category.code ?? "Sin nombre") + (category.site_id === row.site_id ? "" : " · otra sede")}
                  </option>
                ))}
              </select>
              {currentCategory ? <p className="ui-caption">Actual: {currentCategory.name ?? currentCategory.code}</p> : null}
            </label>

            <label className="space-y-2 lg:col-span-3">
              <span className="ui-label">Producto operacional base obligatorio</span>
              <select name="product_id" className="ui-input" defaultValue={row.product_id ?? ""} required>
                <option value="">Selecciona producto operacional</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {(product.name ?? product.sku ?? "Producto sin nombre") +
                      (product.sku ? ` · ${product.sku}` : "") +
                      (product.site_ids.includes(row.site_id) ? "" : " · no habilitado en esta sede")}
                  </option>
                ))}
              </select>
              <p className="ui-caption">
                Este producto soporta la receta base y el descuento principal de inventario. El producto comercial solo define cómo se vende y se muestra en Pass.
                {currentOperationalProduct ? ` Actual: ${currentOperationalProduct.name ?? currentOperationalProduct.sku ?? currentOperationalProduct.id}.` : ""}
              </p>
            </label>

            <label className="space-y-2 lg:col-span-3">
              <span className="ui-label">Descripción comercial</span>
              <textarea
                name="description"
                className="ui-input min-h-28 py-3"
                defaultValue={row.description ?? ""}
                placeholder="Texto que verá el cliente antes de personalizar."
              />
            </label>

            <label className="space-y-2">
              <span className="ui-label">Precio base comercial</span>
              <input name="price_amount" type="number" min="1" step="1" className="ui-input" defaultValue={String(row.price_amount ?? 0)} required />
            </label>

            <label className="space-y-2">
              <span className="ui-label">Precio antes / tachado</span>
              <input name="compare_at_amount" type="number" min="0" step="1" className="ui-input" defaultValue={row.compare_at_amount == null ? "" : String(row.compare_at_amount)} />
            </label>

            <label className="space-y-2">
              <span className="ui-label">Orden</span>
              <input name="sort_order" type="number" min="0" step="1" className="ui-input" defaultValue={String(row.sort_order ?? 0)} />
            </label>

            <label className="space-y-2 lg:col-span-3">
              <span className="ui-label">Imagen comercial URL</span>
              <input name="image_url" className="ui-input" defaultValue={row.image_url ?? ""} placeholder="https://..." />
            </label>

            <label className="space-y-2">
              <span className="ui-label">Badges</span>
              <input name="badges_csv" className="ui-input" defaultValue={(row.badges ?? []).join(", ")} placeholder="Popular, Nuevo, Club" />
            </label>

            <label className="space-y-2">
              <span className="ui-label">Agrupación visual</span>
              <input
                name="display_group"
                className="ui-input"
                defaultValue={typeof metadata.display_group === "string" ? metadata.display_group : ""}
                placeholder="Ej. Barra de helados"
              />
            </label>

            <label className="space-y-2">
              <span className="ui-label">Variante visual</span>
              <input
                name="variant_label"
                className="ui-input"
                defaultValue={typeof metadata.variant_label === "string" ? metadata.variant_label : ""}
                placeholder="Ej. Yogurt light"
              />
            </label>
          </div>

          <div className="grid gap-4 rounded-3xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4 lg:grid-cols-3">
            <div>
              <div className="ui-label">Estado</div>
              <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-[var(--ui-text)]">
                <input type="checkbox" name="is_active" defaultChecked={row.is_active} />
                Publicado en Pass
              </label>
              <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-[var(--ui-text)]">
                <input type="checkbox" name="is_featured" defaultChecked={row.is_featured} />
                Mostrar en destacados
              </label>
            </div>

            <div>
              <div className="ui-label">Modalidades</div>
              <div className="mt-3 space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-[var(--ui-text)]">
                  <input type="checkbox" name="fulfillment_delivery" defaultChecked={(row.fulfillment_modes ?? []).includes("delivery")} />
                  Domicilio
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold text-[var(--ui-text)]">
                  <input type="checkbox" name="fulfillment_pickup" defaultChecked={(row.fulfillment_modes ?? []).includes("pickup")} />
                  Recoger
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold text-[var(--ui-text)]">
                  <input type="checkbox" name="fulfillment_on_premise" defaultChecked={(row.fulfillment_modes ?? []).includes("on_premise")} />
                  En sitio
                </label>
              </div>
            </div>

            <div>
              <div className="ui-label">Visualización en Pass</div>
              <label className="mt-3 block space-y-2">
                <span className="ui-caption">Layout</span>
                <select name="pass_card_layout" className="ui-input" defaultValue={parsePassCardLayout(presentation?.card_layout)}>
                  <option value="compact">Compacta</option>
                  <option value="featured">Destacada</option>
                </select>
              </label>
              <label className="mt-3 flex items-start gap-2 text-sm font-semibold text-[var(--ui-text)]">
                <input type="checkbox" name="opens_detail_modal" defaultChecked={passModalEnabled} />
                <span>
                  Abrir modal antes de agregar
                  <span className="ui-caption block">Si hay personalizaciones activas, Viso lo mantendrá encendido aunque lo desmarques.</span>
                </span>
              </label>
            </div>
          </div>

          <div className="flex justify-end rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
            <button type="submit" className="ui-btn ui-btn--brand">Guardar producto</button>
          </div>
        </form>

        <div className="flex flex-wrap gap-2 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
          <form action={disableMenuItem}>
            <input type="hidden" name="id" value={row.id} />
            <button type="submit" className="ui-btn ui-btn--ghost">Deshabilitar</button>
          </form>
          <form action={deleteMenuItem}>
            <input type="hidden" name="id" value={row.id} />
            <button type="submit" className="ui-btn ui-btn--danger">Eliminar producto</button>
          </form>
        </div>
      </div>
      </div>

      <MenuPersonalizationsClient
        itemId={row.id}
        initialSnapshot={{
          currentItem: {
            id: row.id,
            site_id: row.site_id,
            product_id: row.product_id,
            name: row.name,
            metadata,
          },
          visualVariants,
          sharedTemplates: visibleSharedTemplates,
          sharedTemplateGroups: visibleSharedTemplateGroups,
          sharedTemplateAssignments: visibleSharedTemplateAssignments,
          optionGroups,
          options: (optionOptionsRaw ?? []) as CatalogItemOptionRow[],
          consumptionRules: (consumptionRulesRaw ?? []) as CatalogItemOptionConsumptionRuleRow[],
          recipeEffects: (recipeEffectsRaw ?? []) as CatalogItemOptionRecipeEffectRow[],
          recipeIngredients,
          consumptionProducts,
          inventoryUnits,
          commercialCatalogItems,
          visualAssets,
        }}
      />

    </div>
  );
}
