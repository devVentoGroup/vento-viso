import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type SimpleGroupKind = "choice" | "extras" | "replacements" | "removals" | "preferences" | "recommendations";

type JsonRecord = Record<string, unknown>;

type CurrentCatalogItemSnapshot = {
  id: string;
  site_id: string;
  product_id: string | null;
  name: string;
  metadata: JsonRecord | null;
};

type SharedCustomizationTemplateRow = {
  id: string;
  site_id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  metadata: JsonRecord | null;
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
  metadata: JsonRecord | null;
  sort_order: number | null;
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
  metadata: JsonRecord | null;
};

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(readString(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "on", "1", "yes", "si", "sí"].includes(normalized)) return true;
    if (["false", "off", "0", "no"].includes(normalized)) return false;
  }
  return fallback;
}

function readOptionalText(value: unknown) {
  const text = readString(value);
  return text || null;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => readString(item))
        .filter(Boolean),
    ),
  );
}

function getMetadataText(metadata: JsonRecord | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function getCurrentDisplayGroup(item: CurrentCatalogItemSnapshot | null | undefined) {
  return getMetadataText(item?.metadata, "display_group");
}

function getVariantLabel(item: VisualVariantRow) {
  return getMetadataText(item.metadata, "variant_label") || item.name;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeOptionName(value: string) {
  return slugify(value).replace(/^sin-/, "");
}

function getOptionAssetScope(kind: SimpleGroupKind) {
  switch (kind) {
    case "extras":
      return "extra";
    case "replacements":
      return "replacement";
    case "removals":
      return "removal";
    case "recommendations":
      return "recommendation";
    default:
      return "generic";
  }
}

function asCatalogCode(value: unknown, fallback: string) {
  return slugify(readString(value) || fallback);
}

function readGroupMetadata(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function parseSimpleGroupKind(value: unknown): SimpleGroupKind {
  const kind = readString(value);
  if (kind === "extras" || kind === "replacements" || kind === "removals" || kind === "preferences" || kind === "recommendations") {
    return kind;
  }
  return "choice";
}

function getSimpleGroupKind(group: { code: string | null; name: string | null; metadata: JsonRecord | null }): SimpleGroupKind {
  const metadata = readGroupMetadata(group.metadata);
  const preset = typeof metadata.preset === "string" ? metadata.preset : "";
  const code = String(group.code ?? "").toLowerCase();
  const name = String(group.name ?? "").toLowerCase();

  if (preset === "extras" || code.includes("extra") || name.includes("extra") || name.includes("adicion")) return "extras";
  if (preset === "replacements" || code.includes("cambio") || code.includes("reemplazo") || name.includes("cambio") || name.includes("reemplazo") || name.includes("sustit")) return "replacements";
  if (preset === "removals" || code.includes("quitar") || name.includes("quitar") || name.includes("sin ")) return "removals";
  if (preset === "recommendations" || name.includes("recomend") || name.includes("tambien") || name.includes("también") || name.includes("sugerir")) return "recommendations";
  if (preset === "preferences" || name.includes("preferencia") || name.includes("instruccion")) return "preferences";
  return "choice";
}

function getSimpleGroupCreationDefaults(kind: SimpleGroupKind) {
  switch (kind) {
    case "extras":
      return { name: "Adiciones", description: "El cliente puede agregar extras o adicionales.", selectionType: "multiple", isRequired: false, minSelect: 0, maxSelect: 10, sortBase: 200 };
    case "replacements":
      return { name: "Cambios", description: "El cliente puede reemplazar un ingrediente de la receta por otro insumo.", selectionType: "multiple", isRequired: false, minSelect: 0, maxSelect: 10, sortBase: 300 };
    case "removals":
      return { name: "Quitar ingredientes", description: "Ingredientes que el cliente puede pedir retirar de este producto.", selectionType: "multiple", isRequired: false, minSelect: 0, maxSelect: 99, sortBase: 900 };
    case "preferences":
      return { name: "Preferencias", description: "El cliente puede dejar instrucciones de preparación.", selectionType: "multiple", isRequired: false, minSelect: 0, maxSelect: 10, sortBase: 700 };
    case "recommendations":
      return { name: "También puedes agregar", description: "Bebidas, postres o acompañamientos que el cliente puede sumar.", selectionType: "multiple", isRequired: false, minSelect: 0, maxSelect: 10, sortBase: 800 };
    case "choice":
    default:
      return { name: "Elige una opción", description: "El cliente debe escoger una opción.", selectionType: "single", isRequired: true, minSelect: 1, maxSelect: 1, sortBase: 100 };
  }
}

function normalizeSelectBounds(selectionType: string, isRequired: boolean, minValue: unknown, maxValue: unknown) {
  const rawMin = Math.round(Math.max(0, readNumber(minValue, 0)));
  const rawMax = Math.round(Math.max(0, readNumber(maxValue, 1)));
  const minSelect = Math.max(isRequired ? 1 : 0, rawMin);

  if (selectionType === "single") {
    return { minSelect: Math.min(minSelect, 1), maxSelect: 1 };
  }

  return { minSelect, maxSelect: Math.max(1, rawMax, minSelect) };
}

function parseOptionEffectType(value: unknown) {
  const effectType = readString(value);
  if (effectType === "additive" || effectType === "replacement" || effectType === "removal") return effectType;
  return "preference";
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

async function getNextOptionGroupSortOrder(supabase: ReturnType<typeof createAdminClient>, itemId: string, fallbackBase: number) {
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

async function getNextOptionSortOrder(supabase: ReturnType<typeof createAdminClient>, groupId: string) {
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

async function fetchSnapshot(supabase: ReturnType<typeof createAdminClient>, itemId: string) {
  const { data: item } = await supabase
    .schema("pass")
    .from("catalog_items")
    .select("id,site_id,product_id,name,metadata")
    .eq("id", itemId)
    .maybeSingle();

  if (!item) throw new Error("Producto no encontrado.");

  const currentItem = item as CurrentCatalogItemSnapshot;
  const currentDisplayGroup = getCurrentDisplayGroup(currentItem);

  const { data: visualVariantsRaw } = currentDisplayGroup
    ? await supabase
      .schema("pass")
      .from("catalog_items")
      .select("id,name,code,price_amount,is_active,metadata,sort_order")
      .eq("site_id", currentItem.site_id)
      .eq("is_active", true)
      .eq("metadata->>display_group", currentDisplayGroup)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
    : { data: [] };

  const visualVariants = ((visualVariantsRaw ?? []) as VisualVariantRow[]).sort((a, b) => {
    const sortA = Number(a.sort_order ?? Number.MAX_SAFE_INTEGER);
    const sortB = Number(b.sort_order ?? Number.MAX_SAFE_INTEGER);
    if (sortA !== sortB) return sortA - sortB;
    return getVariantLabel(a).localeCompare(getVariantLabel(b), "es-CO");
  });

  const { data: optionGroupsRaw } = await supabase
    .schema("pass")
    .from("catalog_item_option_groups")
    .select("id,catalog_item_id,code,name,description,selection_type,is_required,min_select,max_select,sort_order,is_active,metadata")
    .eq("catalog_item_id", itemId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  const optionGroups = optionGroupsRaw ?? [];
  const optionGroupIds = optionGroups.map((group) => group.id);

  const { data: optionOptionsRaw } = optionGroupIds.length > 0
    ? await supabase
      .schema("pass")
      .from("catalog_item_options")
      .select("id,option_group_id,code,name,description,price_delta_amount,product_id,effect_type,is_default,is_active,sort_order,metadata,image_url")
      .in("option_group_id", optionGroupIds)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
    : { data: [] };

  const options = optionOptionsRaw ?? [];
  const optionIds = options.map((option) => option.id);

  const [
    { data: consumptionRulesRaw },
    { data: recipeEffectsRaw },
    { data: recipeIngredientsRaw },
    { data: consumptionProductsRaw },
    { data: inventoryUnitsRaw },
    { data: commercialCatalogItemsRaw },
    { data: visualAssetsRaw },
  ] = await Promise.all([
    optionIds.length > 0
      ? supabase
        .schema("pass")
        .from("catalog_item_option_consumption_rules")
        .select("id,option_id,code,name,product_id,effect_type,quantity_per_option,stock_unit_code,input_quantity_per_option,input_unit_code,conversion_factor_to_stock,input_uom_profile_id,source_location_strategy,source_location_id,source_location_position_id,is_active,sort_order,metadata")
        .in("option_id", optionIds)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true })
      : Promise.resolve({ data: [] }),
    optionIds.length > 0
      ? supabase
        .schema("pass")
        .from("catalog_item_option_recipe_effects")
        .select("id,option_id,effect_type,target_ingredient_product_id,recipe_component_code,quantity_mode,quantity_amount,stock_unit_code,is_active,sort_order,metadata")
        .in("option_id", optionIds)
        .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [] }),
    currentItem.product_id
      ? supabase
        .from("recipes")
        .select("id,product_id,ingredient_product_id,quantity,is_active")
        .eq("product_id", currentItem.product_id)
        .eq("is_active", true)
        .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
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
      .schema("pass")
      .from("catalog_items")
      .select("id,name,product_id,description,price_amount,image_url,category_label,is_active")
      .eq("site_id", currentItem.site_id)
      .eq("is_active", true)
      .neq("id", itemId)
      .order("name", { ascending: true }),
    supabase
      .schema("pass")
      .from("catalog_option_visual_assets")
      .select("id,site_id,asset_key,display_name,image_url,linked_product_id,linked_ingredient_product_id,option_code,normalized_option_name,scope,is_active,metadata")
      .or(`site_id.is.null,site_id.eq.${currentItem.site_id}`)
      .order("display_name", { ascending: true }),
  ]);

  const consumptionProducts = consumptionProductsRaw ?? [];
  const consumptionProductById = new Map(consumptionProducts.map((product) => [product.id, product]));
  const recipeIngredients = (recipeIngredientsRaw ?? [])
    .map((ingredient) => ({
      ...ingredient,
      product: consumptionProductById.get(ingredient.ingredient_product_id) ?? null,
    }))
    .filter((ingredient) => Boolean(ingredient.product));

  const visualVariantIds = visualVariants.map((variant) => variant.id);

  const { data: sharedAssignmentsSeedRaw } = visualVariantIds.length > 0
    ? await supabase
      .schema("pass")
      .from("catalog_item_customization_template_assignments")
      .select("catalog_item_id,template_id,sort_order,is_active")
      .in("catalog_item_id", visualVariantIds)
    : { data: [] };

  const { data: sharedGroupsSeedRaw } = optionGroupIds.length > 0
    ? await supabase
      .schema("pass")
      .from("catalog_item_customization_template_groups")
      .select("template_id,option_group_id,sort_order,is_active")
      .in("option_group_id", optionGroupIds)
    : { data: [] };

  const sharedAssignmentsSeed = (sharedAssignmentsSeedRaw ?? []) as SharedCustomizationTemplateAssignmentRow[];
  const sharedGroupsSeed = (sharedGroupsSeedRaw ?? []) as SharedCustomizationTemplateGroupRow[];

  const templateIds = Array.from(
    new Set([
      ...sharedAssignmentsSeed.map((entry) => entry.template_id),
      ...sharedGroupsSeed.map((entry) => entry.template_id),
    ]),
  );

  const { data: sharedTemplatesRaw } = templateIds.length > 0
    ? await supabase
      .schema("pass")
      .from("catalog_item_customization_templates")
      .select("id,site_id,code,name,description,is_active,metadata")
      .eq("site_id", currentItem.site_id)
      .in("id", templateIds)
      .order("name", { ascending: true })
    : { data: [] };

  const { data: sharedTemplateGroupsRaw } = templateIds.length > 0
    ? await supabase
      .schema("pass")
      .from("catalog_item_customization_template_groups")
      .select("template_id,option_group_id,sort_order,is_active")
      .in("template_id", templateIds)
      .order("sort_order", { ascending: true })
    : { data: [] };

  const { data: sharedTemplateAssignmentsRaw } = templateIds.length > 0
    ? await supabase
      .schema("pass")
      .from("catalog_item_customization_template_assignments")
      .select("catalog_item_id,template_id,sort_order,is_active")
      .in("template_id", templateIds)
      .order("sort_order", { ascending: true })
    : { data: [] };

  return {
    currentItem,
    visualVariants,
    sharedTemplates: (sharedTemplatesRaw ?? []) as SharedCustomizationTemplateRow[],
    sharedTemplateGroups: (sharedTemplateGroupsRaw ?? []) as SharedCustomizationTemplateGroupRow[],
    sharedTemplateAssignments: (sharedTemplateAssignmentsRaw ?? []) as SharedCustomizationTemplateAssignmentRow[],
    optionGroups,
    options,
    consumptionRules: consumptionRulesRaw ?? [],
    recipeEffects: recipeEffectsRaw ?? [],
    recipeIngredients,
    consumptionProducts,
    inventoryUnits: inventoryUnitsRaw ?? [],
    commercialCatalogItems: (commercialCatalogItemsRaw ?? []).filter((item) => item.is_active !== false),
    visualAssets: ((visualAssetsRaw ?? []) as CatalogOptionVisualAssetRow[]).filter((asset) => asset.is_active !== false),
  };
}

async function validateOptionGroupsForItem(
  supabase: ReturnType<typeof createAdminClient>,
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
  supabase: ReturnType<typeof createAdminClient>,
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

async function getCatalogItemSnapshot(
  supabase: ReturnType<typeof createAdminClient>,
  itemId: string,
) {
  const { data, error } = await supabase
    .schema("pass")
    .from("catalog_items")
    .select("id,site_id,product_id,name,metadata")
    .eq("id", itemId)
    .maybeSingle();

  if (error || !data?.id) {
    throw new Error(error?.message || "Producto comercial no encontrado.");
  }

  return data as CurrentCatalogItemSnapshot;
}

async function jsonOk(supabase: ReturnType<typeof createAdminClient>, itemId: string, message: string) {
  revalidatePath(`/menu/${itemId}`);
  const snapshot = await fetchSnapshot(supabase, itemId);
  return NextResponse.json({ ok: true, message, snapshot });
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: itemId } = await context.params;

  try {
    await requireAppAccess({ appId: "viso", returnTo: `/menu/${itemId}` });
  } catch {
    return jsonError("No tienes acceso a VISO.", 401);
  }

  const supabase = createAdminClient();
  const body = (await request.json().catch(() => null)) as { action?: string; payload?: JsonRecord } | null;
  const action = readString(body?.action);
  const payload = body?.payload ?? {};

  try {
    if (action === "create_group") {
      const groupKind = parseSimpleGroupKind(payload.groupKind);
      const defaults = getSimpleGroupCreationDefaults(groupKind);
      const name = readString(payload.name) || defaults.name;
      const description = readString(payload.description) || defaults.description;
      const code = asCatalogCode(payload.code, name);
      const requestedMax = Math.round(Math.max(0, readNumber(payload.maxSelect, 0)));
      const maxSelect = defaults.selectionType === "single" ? 1 : Math.max(defaults.maxSelect, requestedMax || defaults.maxSelect);
      const sortOrder = await getNextOptionGroupSortOrder(supabase, itemId, defaults.sortBase);

      const { data: existingGroup, error: existingGroupError } = await supabase
        .schema("pass")
        .from("catalog_item_option_groups")
        .select("id,is_active")
        .eq("catalog_item_id", itemId)
        .eq("code", code)
        .maybeSingle();

      if (existingGroupError) return jsonError(existingGroupError.message);

      if (existingGroup?.id) {
        if (existingGroup.is_active === false) {
          const { error } = await supabase
            .schema("pass")
            .from("catalog_item_option_groups")
            .update({
              name,
              description,
              selection_type: defaults.selectionType,
              is_required: defaults.isRequired,
              min_select: defaults.minSelect,
              max_select: maxSelect,
              sort_order: sortOrder,
              is_active: true,
              metadata: { preset: groupKind, configured_from: "simple_product_page" },
            })
            .eq("id", existingGroup.id)
            .eq("catalog_item_id", itemId);
          if (error) return jsonError(error.message);
          return jsonOk(supabase, itemId, "Personalización reactivada.");
        }
        return jsonOk(supabase, itemId, "Esa personalización ya existe.");
      }

      const { error } = await supabase.schema("pass").from("catalog_item_option_groups").insert({
        catalog_item_id: itemId,
        code,
        name,
        description,
        selection_type: defaults.selectionType,
        is_required: defaults.isRequired,
        min_select: defaults.minSelect,
        max_select: maxSelect,
        sort_order: sortOrder,
        is_active: true,
        metadata: { preset: groupKind, configured_from: "simple_product_page" },
      });
      if (error) return jsonError(error.code === "23505" ? "Esa personalización ya existe." : error.message);
      return jsonOk(supabase, itemId, "Grupo creado.");
    }

    if (action === "update_group") {
      const groupId = readString(payload.groupId);
      const name = readString(payload.name);
      const code = asCatalogCode(payload.code, name);
      const selectionType = readString(payload.selectionType) === "multiple" ? "multiple" : "single";
      const isRequired = readBool(payload.isRequired);
      const { minSelect, maxSelect } = normalizeSelectBounds(selectionType, isRequired, payload.minSelect, payload.maxSelect);
      if (!groupId || !name || !code) return jsonError("Faltan datos para actualizar el grupo.");

      const { error } = await supabase
        .schema("pass")
        .from("catalog_item_option_groups")
        .update({
          code,
          name,
          description: readOptionalText(payload.description),
          selection_type: selectionType,
          is_required: isRequired,
          min_select: minSelect,
          max_select: maxSelect,
          sort_order: Math.round(Math.max(0, readNumber(payload.sortOrder, 0))),
          is_active: readBool(payload.isActive, true),
        })
        .eq("id", groupId)
        .eq("catalog_item_id", itemId);
      if (error) return jsonError(error.message);
      return jsonOk(supabase, itemId, "Grupo de opciones actualizado.");
    }

    if (action === "disable_group") {
      const groupId = readString(payload.groupId);
      if (!groupId) return jsonError("Grupo inválido.");
      const { error } = await supabase.schema("pass").from("catalog_item_option_groups").update({ is_active: false }).eq("id", groupId).eq("catalog_item_id", itemId);
      if (error) return jsonError(error.message);
      return jsonOk(supabase, itemId, "Grupo de opciones desactivado.");
    }

    if (action === "create_option") {
      const groupId = readString(payload.groupId);
      const name = readString(payload.name);
      const description = readOptionalText(payload.description);
      const linkedCatalogItemId = readOptionalText(payload.linkedCatalogItemId);
      let optionOperationalProductId = readString(payload.optionProductId);
      let optionQuantityPerOption = Math.max(0, readNumber(payload.optionQuantityPerOption, 0));
      const optionStockUnitCode = readOptionalText(payload.optionStockUnitCode);
      const replacementTargetIngredientProductId = readString(payload.replacementTargetIngredientProductId);

      if (!groupId) return jsonError("Faltan datos para crear la opción.");

      const { data: group, error: groupError } = await supabase
        .schema("pass")
        .from("catalog_item_option_groups")
        .select("id,catalog_item_id,code,name,selection_type,metadata")
        .eq("id", groupId)
        .eq("catalog_item_id", itemId)
        .maybeSingle();
      if (groupError || !group) return jsonError(groupError?.message || "El grupo no pertenece a este producto.");

      const groupKind = getSimpleGroupKind(group);
      const requiresLinkedProduct = groupKind === "recommendations" || Boolean(linkedCatalogItemId);
      const requiresOperationalConsumption = !linkedCatalogItemId && (groupKind === "extras" || groupKind === "replacements");
      const hasPartialOperationalConsumption = Boolean(optionOperationalProductId) || optionQuantityPerOption > 0 || Boolean(optionStockUnitCode);

      if (requiresLinkedProduct && !linkedCatalogItemId) return jsonError("Selecciona el producto comercial sugerido.");
      if (!requiresLinkedProduct && !name) return jsonError("Falta el nombre de la opción.");
      if ((requiresOperationalConsumption || hasPartialOperationalConsumption) && (!optionOperationalProductId || optionQuantityPerOption <= 0)) {
        return jsonError("La opción necesita producto operacional y cantidad de consumo mayor a 0.");
      }
      if (groupKind === "replacements" && !replacementTargetIngredientProductId) return jsonError("El cambio necesita indicar qué ingrediente de receta reemplaza.");

      const sortOrder = await getNextOptionSortOrder(supabase, groupId);
      let finalName = name;
      let finalDescription = description;
      let finalPriceDeltaAmount = Math.max(0, readNumber(payload.priceDeltaAmount, 0));
      let linkedCatalogMetadata: JsonRecord = {};
      let finalEffectType = getSimpleDefaultEffect(groupKind);

      if (groupKind === "choice" && optionOperationalProductId) finalEffectType = "additive";

      if (linkedCatalogItemId) {
        const [{ data: currentItem }, { data: linkedItem, error: linkedError }] = await Promise.all([
          supabase.schema("pass").from("catalog_items").select("id,site_id").eq("id", itemId).maybeSingle(),
          supabase.schema("pass").from("catalog_items").select("id,site_id,product_id,name,description,price_amount,image_url,is_active").eq("id", linkedCatalogItemId).maybeSingle(),
        ]);

        if (linkedError || !currentItem || !linkedItem || linkedItem.site_id !== currentItem.site_id || linkedItem.is_active === false) {
          return jsonError("El producto sugerido no está disponible en esta sede.");
        }

        const linkedPrice = Number(linkedItem.price_amount ?? 0);
        finalName = linkedItem.name || name;
        finalDescription = description || linkedItem.description || null;
        if (groupKind === "recommendations") {
          finalPriceDeltaAmount = Number.isFinite(linkedPrice) ? Math.max(0, linkedPrice) : 0;
        }
        if (!optionOperationalProductId && linkedItem.product_id) {
          optionOperationalProductId = linkedItem.product_id;
        }
        if (optionOperationalProductId && optionQuantityPerOption <= 0) {
          optionQuantityPerOption = 1;
        }
        linkedCatalogMetadata = {
          linked_catalog_item_id: linkedItem.id,
          linked_catalog_item_price_amount: finalPriceDeltaAmount,
          linked_catalog_item_image_url: linkedItem.image_url || null,
        };
      }

      if (groupKind === "choice" && optionOperationalProductId) finalEffectType = "additive";

      const optionCode = asCatalogCode(payload.code, finalName);
      if (!optionCode) return jsonError("No se pudo generar el código de la opción.");

      if ((groupKind === "extras" || groupKind === "replacements" || Boolean(optionOperationalProductId)) && (!optionOperationalProductId || optionQuantityPerOption <= 0)) {
        return jsonError("La opción necesita producto operacional y cantidad de consumo mayor a 0.");
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
          is_default: readBool(payload.isDefault),
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

      if (error || !createdOption?.id) return jsonError(error?.message || "No se pudo crear la opción.");

      if (optionOperationalProductId) {
        const { error: ruleError } = await supabase.schema("pass").from("catalog_item_option_consumption_rules").insert({
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
          metadata: { configured_from: "product_personalization_page" },
        });

        if (ruleError) {
          await supabase.schema("pass").from("catalog_item_options").delete().eq("id", createdOption.id);
          return jsonError(ruleError.message);
        }
      }

      if (replacementTargetIngredientProductId) {
        const { error: recipeEffectError } = await supabase.schema("pass").from("catalog_item_option_recipe_effects").insert({
          option_id: createdOption.id,
          effect_type: "replacement",
          target_ingredient_product_id: replacementTargetIngredientProductId,
          recipe_component_code: null,
          quantity_mode: "full_recipe_component",
          quantity_amount: null,
          stock_unit_code: null,
          is_active: true,
          sort_order: 0,
          metadata: { configured_from: "product_personalization_page" },
        });

        if (recipeEffectError) {
          await supabase.schema("pass").from("catalog_item_options").delete().eq("id", createdOption.id);
          return jsonError(recipeEffectError.message);
        }
      }

      return jsonOk(supabase, itemId, "Opción creada y mapeada.");
    }

    if (action === "update_option") {
      const groupId = readString(payload.groupId);
      const optionId = readString(payload.optionId);
      const name = readString(payload.name);
      const code = asCatalogCode(payload.code, name);
      if (!groupId || !optionId || !name || !code) return jsonError("Faltan datos para actualizar la opción.");

      const { data: group, error: groupError } = await supabase
        .schema("pass")
        .from("catalog_item_option_groups")
        .select("id,catalog_item_id")
        .eq("id", groupId)
        .eq("catalog_item_id", itemId)
        .maybeSingle();
      if (groupError || !group) return jsonError(groupError?.message || "El grupo de opciones no pertenece a este item.");

      const { error } = await supabase.schema("pass").from("catalog_item_options").update({
        code,
        name,
        description: readOptionalText(payload.description),
        price_delta_amount: Math.max(0, readNumber(payload.priceDeltaAmount, 0)),
        effect_type: parseOptionEffectType(payload.effectType),
        is_default: readBool(payload.isDefault),
        is_active: readBool(payload.isActive, true),
        sort_order: Math.round(Math.max(0, readNumber(payload.sortOrder, 0))),
      }).eq("id", optionId).eq("option_group_id", groupId);

      if (error) return jsonError(error.message);
      return jsonOk(supabase, itemId, "Opción actualizada.");
    }

    if (action === "update_option_visual_asset") {
      const groupId = readString(payload.groupId);
      const optionId = readString(payload.optionId);
      const imageUrl = readOptionalText(payload.imageUrl);
      if (!groupId || !optionId) return jsonError("Opción inválida.");

      const { data: group, error: groupError } = await supabase
        .schema("pass")
        .from("catalog_item_option_groups")
        .select("id,catalog_item_id,code,name,metadata")
        .eq("id", groupId)
        .eq("catalog_item_id", itemId)
        .maybeSingle();
      if (groupError || !group) return jsonError(groupError?.message || "El grupo de opciones no pertenece a este item.");

      const { data: option, error: optionError } = await supabase
        .schema("pass")
        .from("catalog_item_options")
        .select("id,code,name,product_id,metadata")
        .eq("id", optionId)
        .eq("option_group_id", groupId)
        .maybeSingle();
      if (optionError || !option) return jsonError(optionError?.message || "Opción no encontrada.");

      const item = await getCatalogItemSnapshot(supabase, itemId);
      const groupKind = getSimpleGroupKind(group);
      const metadata = readGroupMetadata(option.metadata);
      const ingredientProductId = readString(metadata.ingredient_product_id);
      const normalizedName = normalizeOptionName(option.name);
      const assetKey = [
        item.site_id,
        option.product_id || ingredientProductId || option.code || normalizedName,
      ].filter(Boolean).join(":");

      if (!imageUrl) {
        const { error: optionUpdateError } = await supabase
          .schema("pass")
          .from("catalog_item_options")
          .update({ image_url: null })
          .eq("id", optionId)
          .eq("option_group_id", groupId);
        if (optionUpdateError) return jsonError(optionUpdateError.message);

        const { error: assetError } = await supabase
          .schema("pass")
          .from("catalog_option_visual_assets")
          .update({ is_active: false })
          .eq("site_id", item.site_id)
          .eq("asset_key", assetKey);
        if (assetError) return jsonError(assetError.message);

        return jsonOk(supabase, itemId, "Imagen comercial quitada.");
      }

      const { data: existingAsset, error: existingAssetError } = await supabase
        .schema("pass")
        .from("catalog_option_visual_assets")
        .select("id")
        .eq("site_id", item.site_id)
        .eq("asset_key", assetKey)
        .maybeSingle();
      if (existingAssetError) return jsonError(existingAssetError.message);

      const assetPayload = {
        site_id: item.site_id,
        asset_key: assetKey,
        display_name: option.name,
        image_url: imageUrl,
        linked_product_id: option.product_id || null,
        linked_ingredient_product_id: ingredientProductId || null,
        option_code: option.code,
        normalized_option_name: normalizedName || null,
        scope: getOptionAssetScope(groupKind),
        is_active: true,
        metadata: { configured_from: "viso_menu_personalizations", source_option_id: option.id },
      };

      const { data: asset, error: assetError } = existingAsset?.id
        ? await supabase
          .schema("pass")
          .from("catalog_option_visual_assets")
          .update(assetPayload)
          .eq("id", existingAsset.id)
          .select("id")
          .single()
        : await supabase
          .schema("pass")
          .from("catalog_option_visual_assets")
          .insert(assetPayload)
          .select("id")
          .single();
      if (assetError || !asset?.id) return jsonError(assetError?.message || "No se pudo guardar la imagen comercial.");

      const { error: optionUpdateError } = await supabase
        .schema("pass")
        .from("catalog_item_options")
        .update({
          image_url: imageUrl,
          metadata: {
            ...metadata,
            visual_asset_id: asset.id,
            visual_asset_image_url: imageUrl,
          },
        })
        .eq("id", optionId)
        .eq("option_group_id", groupId);
      if (optionUpdateError) return jsonError(optionUpdateError.message);

      return jsonOk(supabase, itemId, "Imagen comercial guardada.");
    }

    if (action === "disable_option") {
      const groupId = readString(payload.groupId);
      const optionId = readString(payload.optionId);
      if (!groupId || !optionId) return jsonError("Opción inválida.");
      const { error } = await supabase.schema("pass").from("catalog_item_options").update({ is_active: false }).eq("id", optionId).eq("option_group_id", groupId);
      if (error) return jsonError(error.message);
      return jsonOk(supabase, itemId, "Opción desactivada.");
    }

    if (action === "create_consumption_rule") {
      const optionId = readString(payload.optionId);
      const productId = readString(payload.productId);
      const quantityPerOption = Math.max(0, readNumber(payload.quantityPerOption, 0));
      if (!optionId || !productId || quantityPerOption <= 0) return jsonError("Faltan datos para crear la regla de consumo.");

      const { data: option } = await supabase.schema("pass").from("catalog_item_options").select("id,code,name").eq("id", optionId).maybeSingle();
      if (!option) return jsonError("Opción no encontrada.");

      const { error } = await supabase.schema("pass").from("catalog_item_option_consumption_rules").insert({
        option_id: optionId,
        code: `consumo-${option.code}`,
        name: `Consumo de ${option.name}`,
        product_id: productId,
        effect_type: parseOptionEffectType(payload.effectType) === "replacement" ? "replacement" : "additive",
        quantity_per_option: quantityPerOption,
        stock_unit_code: readOptionalText(payload.stockUnitCode),
        input_quantity_per_option: quantityPerOption,
        input_unit_code: readOptionalText(payload.stockUnitCode),
        conversion_factor_to_stock: 1,
        input_uom_profile_id: null,
        source_location_strategy: "product_production_location",
        source_location_id: null,
        source_location_position_id: null,
        is_active: true,
        sort_order: 0,
        metadata: {},
      });
      if (error) return jsonError(error.message);
      return jsonOk(supabase, itemId, "Regla de consumo creada.");
    }

    if (action === "disable_consumption_rule") {
      const optionId = readString(payload.optionId);
      const ruleId = readString(payload.ruleId);
      if (!optionId || !ruleId) return jsonError("Regla de consumo inválida.");
      const { error } = await supabase.schema("pass").from("catalog_item_option_consumption_rules").update({ is_active: false }).eq("id", ruleId).eq("option_id", optionId);
      if (error) return jsonError(error.message);
      return jsonOk(supabase, itemId, "Regla de consumo desactivada.");
    }

    if (action === "create_recipe_effect") {
      const optionId = readString(payload.optionId);
      const targetIngredientProductId = readString(payload.targetIngredientProductId);
      if (!optionId || !targetIngredientProductId) return jsonError("Faltan datos para crear el efecto de receta.");
      const { error } = await supabase.schema("pass").from("catalog_item_option_recipe_effects").insert({
        option_id: optionId,
        effect_type: readString(payload.effectType) === "replacement" ? "replacement" : "removal",
        target_ingredient_product_id: targetIngredientProductId,
        recipe_component_code: null,
        quantity_mode: "full_recipe_component",
        quantity_amount: null,
        stock_unit_code: null,
        is_active: true,
        sort_order: 0,
        metadata: {},
      });
      if (error) return jsonError(error.message);
      await supabase.schema("pass").from("catalog_item_options").update({ effect_type: "replacement" }).eq("id", optionId);
      return jsonOk(supabase, itemId, "Efecto de receta creado.");
    }

    if (action === "disable_recipe_effect") {
      const optionId = readString(payload.optionId);
      const effectId = readString(payload.effectId);
      if (!optionId || !effectId) return jsonError("Efecto de receta inválido.");
      const { error } = await supabase.schema("pass").from("catalog_item_option_recipe_effects").update({ is_active: false }).eq("id", effectId).eq("option_id", optionId);
      if (error) return jsonError(error.message);
      return jsonOk(supabase, itemId, "Efecto de receta desactivado.");
    }

    if (action === "create_removal_option_from_recipe") {
      const requestedGroupId = readString(payload.groupId);
      const ingredientProductId = readString(payload.ingredientProductId);
      const ingredientName = readString(payload.ingredientName);
      const stockUnitCode = readOptionalText(payload.stockUnitCode);
      if (!ingredientProductId || !ingredientName) return jsonError("Ingrediente inválido para crear opción de retiro.");

      const groupCode = "quitar-ingredientes";
      let groupId = requestedGroupId || "";

      if (groupId) {
        const { data: requestedGroup, error: requestedGroupError } = await supabase.schema("pass").from("catalog_item_option_groups").select("id,catalog_item_id,is_active").eq("id", groupId).eq("catalog_item_id", itemId).maybeSingle();
        if (requestedGroupError || !requestedGroup || requestedGroup.is_active === false) return jsonError(requestedGroupError?.message || "El grupo de ingredientes no pertenece a este producto o está inactivo.");
      }

      if (!groupId) {
        const { data: existingGroup, error: existingGroupError } = await supabase.schema("pass").from("catalog_item_option_groups").select("id,is_active").eq("catalog_item_id", itemId).eq("code", groupCode).maybeSingle();
        if (existingGroupError) return jsonError(existingGroupError.message);
        if (existingGroup?.id && existingGroup.is_active !== false) groupId = existingGroup.id;
      }

      if (!groupId) {
        const { data: createdGroup, error: groupError } = await supabase.schema("pass").from("catalog_item_option_groups").insert({
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
        }).select("id").single();
        if (groupError || !createdGroup?.id) return jsonError(groupError?.message || "No se pudo crear el grupo de retiros.");
        groupId = createdGroup.id;
      }

      const optionCode = `sin-${slugify(ingredientName)}`;
      const { data: existingOption, error: existingOptionError } = await supabase.schema("pass").from("catalog_item_options").select("id").eq("option_group_id", groupId).eq("code", optionCode).maybeSingle();
      if (existingOptionError) return jsonError(existingOptionError.message);

      let optionId = existingOption?.id as string | undefined;
      if (!optionId) {
        const sortOrder = await getNextOptionSortOrder(supabase, groupId);
        const { data: createdOption, error: optionError } = await supabase.schema("pass").from("catalog_item_options").insert({
          option_group_id: groupId,
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
        }).select("id").single();
        if (optionError || !createdOption?.id) return jsonError(optionError?.message || "No se pudo crear la opción de retiro.");
        optionId = createdOption.id;
      }

      const { data: existingEffect, error: existingEffectError } = await supabase.schema("pass").from("catalog_item_option_recipe_effects").select("id").eq("option_id", optionId).eq("target_ingredient_product_id", ingredientProductId).eq("effect_type", "removal").maybeSingle();
      if (existingEffectError) return jsonError(existingEffectError.message);

      if (!existingEffect) {
        const { error } = await supabase.schema("pass").from("catalog_item_option_recipe_effects").insert({
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
        if (error) return jsonError(error.message);
      }

      return jsonOk(supabase, itemId, `Opción "Sin ${ingredientName}" creada.`);
    }

    if (action === "create_shared_template") {
      const name = readString(payload.name);
      const description = readOptionalText(payload.description);
      const groupIds = readStringArray(payload.groupIds);
      const variantIds = readStringArray(payload.variantIds);

      if (!name) return jsonError("Falta el nombre de la plantilla compartida.");
      if (groupIds.length === 0) return jsonError("Selecciona al menos un grupo para compartir.");

      const item = await getCatalogItemSnapshot(supabase, itemId);
      const validGroups = await validateOptionGroupsForItem(supabase, itemId, groupIds);
      const validVariants = await validateCatalogItemsForSite(
        supabase,
        item.site_id,
        variantIds.length > 0 ? variantIds : [itemId],
      );

      const code = asCatalogCode(null, name);

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
        return jsonError(templateError?.message || "No se pudo crear la plantilla.");
      }

      const templateId = template.id as string;

      const { error: groupsError } = await supabase
        .schema("pass")
        .from("catalog_item_customization_template_groups")
        .upsert(
          validGroups.map((group, index) => ({
            template_id: templateId,
            option_group_id: group.id,
            sort_order: 10000 + index * 10,
            is_active: true,
            metadata: { configured_from: "viso_menu_product_page" },
          })),
          { onConflict: "template_id,option_group_id" },
        );

      if (groupsError) return jsonError(groupsError.message);

      if (validVariants.length > 0) {
        const { error: assignmentsError } = await supabase
          .schema("pass")
          .from("catalog_item_customization_template_assignments")
          .upsert(
            validVariants.map((variant, index) => ({
              catalog_item_id: variant.id,
              template_id: templateId,
              sort_order: index * 10,
              is_active: true,
              metadata: { configured_from: "viso_menu_product_page" },
            })),
            { onConflict: "catalog_item_id,template_id" },
          );

        if (assignmentsError) return jsonError(assignmentsError.message);
      }

      return jsonOk(supabase, itemId, "Plantilla compartida creada.");
    }

    if (action === "update_shared_template") {
      const templateId = readString(payload.templateId);
      const name = readString(payload.name);
      const description = readOptionalText(payload.description);
      const groupIds = readStringArray(payload.groupIds);
      const variantIds = readStringArray(payload.variantIds);
      const managedGroupIds = readStringArray(payload.managedGroupIds);
      const managedVariantIds = readStringArray(payload.managedVariantIds);
      const isActive = readBool(payload.isActive, true);

      if (!templateId || !name) return jsonError("Faltan datos para actualizar la plantilla.");
      if (groupIds.length === 0) return jsonError("La plantilla debe compartir al menos un grupo.");

      const item = await getCatalogItemSnapshot(supabase, itemId);

      const { data: template, error: templateError } = await supabase
        .schema("pass")
        .from("catalog_item_customization_templates")
        .select("id,site_id")
        .eq("id", templateId)
        .maybeSingle();

      if (templateError || !template?.id || template.site_id !== item.site_id) {
        return jsonError(templateError?.message || "La plantilla no pertenece a esta sede.");
      }

      const validGroups = await validateOptionGroupsForItem(supabase, itemId, groupIds);
      const validVariants = await validateCatalogItemsForSite(supabase, item.site_id, variantIds);

      const { error: templateUpdateError } = await supabase
        .schema("pass")
        .from("catalog_item_customization_templates")
        .update({ name, description, is_active: isActive })
        .eq("id", templateId)
        .eq("site_id", item.site_id);

      if (templateUpdateError) return jsonError(templateUpdateError.message);

      const selectedGroupSet = new Set(validGroups.map((group) => group.id));
      const selectedVariantSet = new Set(validVariants.map((variant) => variant.id));

      const { error: groupsError } = await supabase
        .schema("pass")
        .from("catalog_item_customization_template_groups")
        .upsert(
          validGroups.map((group, index) => ({
            template_id: templateId,
            option_group_id: group.id,
            sort_order: 10000 + index * 10,
            is_active: true,
            metadata: { configured_from: "viso_menu_product_page" },
          })),
          { onConflict: "template_id,option_group_id" },
        );

      if (groupsError) return jsonError(groupsError.message);

      const groupsToDisable = managedGroupIds.filter((groupId) => !selectedGroupSet.has(groupId));
      if (groupsToDisable.length > 0) {
        const { error: disableGroupsError } = await supabase
          .schema("pass")
          .from("catalog_item_customization_template_groups")
          .update({ is_active: false })
          .eq("template_id", templateId)
          .in("option_group_id", groupsToDisable);

        if (disableGroupsError) return jsonError(disableGroupsError.message);
      }

      const { error: assignmentsError } = await supabase
        .schema("pass")
        .from("catalog_item_customization_template_assignments")
        .upsert(
          validVariants.map((variant, index) => ({
            catalog_item_id: variant.id,
            template_id: templateId,
            sort_order: index * 10,
            is_active: true,
            metadata: { configured_from: "viso_menu_product_page" },
          })),
          { onConflict: "catalog_item_id,template_id" },
        );

      if (assignmentsError) return jsonError(assignmentsError.message);

      const assignmentsToDisable = managedVariantIds.filter((variantId) => !selectedVariantSet.has(variantId));
      if (assignmentsToDisable.length > 0) {
        const { error: disableAssignmentsError } = await supabase
          .schema("pass")
          .from("catalog_item_customization_template_assignments")
          .update({ is_active: false })
          .eq("template_id", templateId)
          .in("catalog_item_id", assignmentsToDisable);

        if (disableAssignmentsError) return jsonError(disableAssignmentsError.message);
      }

      return jsonOk(supabase, itemId, "Plantilla compartida actualizada.");
    }

    return jsonError("Acción de personalización no soportada.", 404);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Error inesperado.", 500);
  }
}
