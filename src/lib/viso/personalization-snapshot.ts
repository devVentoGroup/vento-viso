import { createAdminClient } from "@/lib/supabase/admin";

type JsonRecord = Record<string, unknown>;

type CurrentCatalogItemSnapshot = {
  id: string;
  site_id: string;
  product_id: string | null;
  name: string;
  metadata: JsonRecord | null;
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
  metadata: JsonRecord | null;
};

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
  metadata: JsonRecord | null;
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
  is_active: boolean;
  sort_order: number;
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

type RecipeIngredientWithProduct = {
  id: string;
  product_id: string;
  ingredient_product_id: string;
  quantity: number | string;
  is_active: boolean | null;
  product: OperationalProductRow | null;
};

type InventoryUnitRow = {
  code: string;
  name: string;
  symbol: string | null;
  family: string | null;
  is_active: boolean | null;
};

type CommercialCatalogRelationRow = {
  id: string;
  name: string | null;
  code: string | null;
  sort_order?: number | string | null;
};

type CommercialCatalogItemOptionRow = {
  id: string;
  name: string | null;
  product_id: string | null;
  description: string | null;
  price_amount: number | string | null;
  image_url: string | null;
  category_label: string | null;
  commercial_collection_id?: string | null;
  commercial_category_id?: string | null;
  commercial_collection?: CommercialCatalogRelationRow | CommercialCatalogRelationRow[] | null;
  commercial_category?: CommercialCatalogRelationRow | CommercialCatalogRelationRow[] | null;
  sort_order?: number | string | null;
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
  metadata: JsonRecord | null;
};

export type PersonalizationSnapshot = {
  currentItem: CurrentCatalogItemSnapshot;
  visualVariants: VisualVariantRow[];
  sharedTemplates: SharedCustomizationTemplateRow[];
  sharedTemplateGroups: SharedCustomizationTemplateGroupRow[];
  sharedTemplateAssignments: SharedCustomizationTemplateAssignmentRow[];
  optionGroups: CatalogItemOptionGroupRow[];
  options: CatalogItemOptionRow[];
  consumptionRules: CatalogItemOptionConsumptionRuleRow[];
  recipeEffects: CatalogItemOptionRecipeEffectRow[];
  recipeIngredients: RecipeIngredientWithProduct[];
  consumptionProducts: OperationalProductRow[];
  inventoryUnits: InventoryUnitRow[];
  commercialCatalogItems: CommercialCatalogItemOptionRow[];
  visualAssets: CatalogOptionVisualAssetRow[];
};

function metadataText(metadata: JsonRecord | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function variantLabel(item: VisualVariantRow) {
  return metadataText(item.metadata, "variant_label") || item.name;
}

export async function fetchPersonalizationSnapshot(
  supabase: ReturnType<typeof createAdminClient>,
  itemId: string,
): Promise<PersonalizationSnapshot> {
  const { data: item, error: itemError } = await supabase
    .schema("pass")
    .from("catalog_items")
    .select("id,site_id,product_id,name,metadata")
    .eq("id", itemId)
    .maybeSingle();

  if (itemError || !item) {
    throw new Error(itemError?.message || "Producto no encontrado.");
  }

  const currentItem = item as CurrentCatalogItemSnapshot;
  const displayGroup = metadataText(currentItem.metadata, "display_group");

  const { data: visualVariantsRaw } = displayGroup
    ? await supabase
      .schema("pass")
      .from("catalog_items")
      .select("id,name,code,price_amount,is_active,metadata,sort_order")
      .eq("site_id", currentItem.site_id)
      .eq("is_active", true)
      .eq("metadata->>display_group", displayGroup)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
    : { data: [] };

  const visualVariants = ((visualVariantsRaw ?? []) as VisualVariantRow[]).sort((a, b) => {
    const orderA = Number(a.sort_order ?? Number.MAX_SAFE_INTEGER);
    const orderB = Number(b.sort_order ?? Number.MAX_SAFE_INTEGER);
    if (orderA !== orderB) return orderA - orderB;
    return variantLabel(a).localeCompare(variantLabel(b), "es-CO");
  });

  const { data: optionGroupsRaw } = await supabase
    .schema("pass")
    .from("catalog_item_option_groups")
    .select("id,catalog_item_id,code,name,description,selection_type,is_required,min_select,max_select,sort_order,is_active,metadata")
    .eq("catalog_item_id", itemId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  const optionGroups = (optionGroupsRaw ?? []) as CatalogItemOptionGroupRow[];
  const optionGroupIds = optionGroups.map((group) => group.id);

  const { data: optionsRaw } = optionGroupIds.length > 0
    ? await supabase
      .schema("pass")
      .from("catalog_item_options")
      .select("id,option_group_id,code,name,description,price_delta_amount,product_id,effect_type,is_default,is_active,sort_order,metadata,image_url")
      .in("option_group_id", optionGroupIds)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
    : { data: [] };

  const options = (optionsRaw ?? []) as CatalogItemOptionRow[];
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
        .select("id,option_id,code,name,product_id,effect_type,quantity_per_option,stock_unit_code,is_active,sort_order")
        .in("option_id", optionIds)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true })
      : Promise.resolve({ data: [] }),
    optionIds.length > 0
      ? supabase
        .schema("pass")
        .from("catalog_item_option_recipe_effects")
        .select("id,option_id,effect_type,target_ingredient_product_id,recipe_component_code,quantity_mode,quantity_amount,stock_unit_code,is_active,sort_order")
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
      .select("id,name,product_id,description,price_amount,image_url,category_label,is_active,sort_order,commercial_collection_id,commercial_category_id,commercial_collection:commercial_collections(id,name,subtitle,code,kind,sort_order),commercial_category:commercial_categories(id,name,code,sort_order)")
      .eq("site_id", currentItem.site_id)
      .eq("is_active", true)
      .neq("id", itemId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .schema("pass")
      .from("catalog_option_visual_assets")
      .select("id,site_id,asset_key,display_name,image_url,linked_product_id,linked_ingredient_product_id,option_code,normalized_option_name,scope,is_active,metadata")
      .or(`site_id.is.null,site_id.eq.${currentItem.site_id}`)
      .order("display_name", { ascending: true }),
  ]);

  const consumptionProducts = (consumptionProductsRaw ?? []) as OperationalProductRow[];
  const consumptionProductById = new Map(consumptionProducts.map((product) => [product.id, product]));
  const recipeIngredients = ((recipeIngredientsRaw ?? []) as Omit<RecipeIngredientWithProduct, "product">[])
    .map((ingredient) => ({
      ...ingredient,
      product: consumptionProductById.get(ingredient.ingredient_product_id) ?? null,
    }))
    .filter((ingredient) => Boolean(ingredient.product));

  const visualVariantIds = visualVariants.map((variant) => variant.id);

  const { data: assignmentSeedRaw } = visualVariantIds.length > 0
    ? await supabase
      .schema("pass")
      .from("catalog_item_customization_template_assignments")
      .select("catalog_item_id,template_id,sort_order,is_active")
      .in("catalog_item_id", visualVariantIds)
    : { data: [] };

  const { data: groupSeedRaw } = optionGroupIds.length > 0
    ? await supabase
      .schema("pass")
      .from("catalog_item_customization_template_groups")
      .select("template_id,option_group_id,sort_order,is_active")
      .in("option_group_id", optionGroupIds)
    : { data: [] };

  const templateIds = Array.from(new Set([
    ...((assignmentSeedRaw ?? []) as SharedCustomizationTemplateAssignmentRow[]).map((entry) => entry.template_id),
    ...((groupSeedRaw ?? []) as SharedCustomizationTemplateGroupRow[]).map((entry) => entry.template_id),
  ]));

  const [
    { data: sharedTemplatesRaw },
    { data: sharedTemplateGroupsRaw },
    { data: sharedTemplateAssignmentsRaw },
  ] = await Promise.all([
    templateIds.length > 0
      ? supabase
        .schema("pass")
        .from("catalog_item_customization_templates")
        .select("id,site_id,code,name,description,is_active,metadata")
        .eq("site_id", currentItem.site_id)
        .in("id", templateIds)
        .order("name", { ascending: true })
      : Promise.resolve({ data: [] }),
    templateIds.length > 0
      ? supabase
        .schema("pass")
        .from("catalog_item_customization_template_groups")
        .select("template_id,option_group_id,sort_order,is_active")
        .in("template_id", templateIds)
        .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [] }),
    templateIds.length > 0
      ? supabase
        .schema("pass")
        .from("catalog_item_customization_template_assignments")
        .select("catalog_item_id,template_id,sort_order,is_active")
        .in("template_id", templateIds)
        .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  return {
    currentItem,
    visualVariants,
    sharedTemplates: (sharedTemplatesRaw ?? []) as SharedCustomizationTemplateRow[],
    sharedTemplateGroups: (sharedTemplateGroupsRaw ?? []) as SharedCustomizationTemplateGroupRow[],
    sharedTemplateAssignments: (sharedTemplateAssignmentsRaw ?? []) as SharedCustomizationTemplateAssignmentRow[],
    optionGroups,
    options,
    consumptionRules: (consumptionRulesRaw ?? []) as CatalogItemOptionConsumptionRuleRow[],
    recipeEffects: (recipeEffectsRaw ?? []) as CatalogItemOptionRecipeEffectRow[],
    recipeIngredients,
    consumptionProducts,
    inventoryUnits: (inventoryUnitsRaw ?? []) as InventoryUnitRow[],
    commercialCatalogItems: ((commercialCatalogItemsRaw ?? []) as CommercialCatalogItemOptionRow[]).filter((entry) => entry.is_active !== false),
    visualAssets: ((visualAssetsRaw ?? []) as CatalogOptionVisualAssetRow[]).filter((entry) => entry.is_active !== false),
  };
}
