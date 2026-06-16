"use client";

import { FormEvent, useMemo, useState } from "react";

type JsonRecord = Record<string, unknown>;

type SimpleGroupKind = "choice" | "extras" | "replacements" | "removals" | "preferences" | "recommendations";

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

type CommercialCatalogItemOptionRow = {
  id: string;
  name: string | null;
  price_amount: number | string | null;
  image_url: string | null;
  category_label: string | null;
  is_active: boolean | null;
};

type PersonalizationSnapshot = {
  optionGroups: CatalogItemOptionGroupRow[];
  options: CatalogItemOptionRow[];
  consumptionRules: CatalogItemOptionConsumptionRuleRow[];
  recipeEffects: CatalogItemOptionRecipeEffectRow[];
  recipeIngredients: RecipeIngredientWithProduct[];
  consumptionProducts: OperationalProductRow[];
  inventoryUnits: InventoryUnitRow[];
  commercialCatalogItems: CommercialCatalogItemOptionRow[];
};

type MutationResponse = {
  ok: boolean;
  message?: string;
  error?: string;
  snapshot?: PersonalizationSnapshot;
};

type PersonalizationTypeCard = {
  kind: SimpleGroupKind;
  label: string;
  defaultName: string;
  description: string;
  maxSelect?: string;
};

const personalizationTypeCards: PersonalizationTypeCard[] = [
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

function readGroupMetadata(value: JsonRecord | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function getSimpleGroupKind(group: CatalogItemOptionGroupRow): SimpleGroupKind {
  const metadata = readGroupMetadata(group.metadata);
  const preset = typeof metadata.preset === "string" ? metadata.preset : "";
  const code = group.code.toLowerCase();
  const name = group.name.toLowerCase();

  if (preset === "extras" || code.includes("extra") || name.includes("extra") || name.includes("adicion")) return "extras";
  if (preset === "replacements" || code.includes("cambio") || code.includes("reemplazo") || name.includes("cambio") || name.includes("reemplazo") || name.includes("sustit")) return "replacements";
  if (preset === "removals" || code.includes("quitar") || name.includes("quitar") || name.includes("sin ")) return "removals";
  if (preset === "recommendations" || name.includes("recomend") || name.includes("tambien") || name.includes("también") || name.includes("sugerir")) return "recommendations";
  if (preset === "preferences" || name.includes("preferencia") || name.includes("instruccion")) return "preferences";
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
  if (kind === "recommendations" && (normalized.includes("producto") || normalized.includes("recomend") || normalized.includes("sugerir"))) {
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
      return "Para opciones como sin cebolla, sin tomate o sin salsa.";
    case "preferences":
      return "Para instrucciones que no cambian inventario: poco dulce, bien caliente o partir en dos.";
    case "recommendations":
      return "Para bebidas, postres o acompañamientos que el cliente puede sumar.";
    case "choice":
    default:
      return "Para tamaño, tipo de leche, bebida o acompañamiento obligatorio.";
  }
}

function parseSelectionType(value: string | null | undefined) {
  return value === "multiple" ? "multiple" : "single";
}

function parseOptionEffectType(value: string | null | undefined) {
  if (value === "additive" || value === "replacement" || value === "removal") return value;
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

function getOptionSummary(option: CatalogItemOptionRow) {
  const price = Number(option.price_delta_amount ?? 0);
  return price > 0 ? `Suma ${formatCopAdmin(price)}` : "Sin costo adicional";
}

function getSelectionRuleLabel(group: CatalogItemOptionGroupRow) {
  const isMultiple = parseSelectionType(group.selection_type) === "multiple";
  if (group.is_required) return isMultiple ? `Debe escoger entre ${group.min_select} y ${group.max_select}` : "Debe escoger 1";
  return isMultiple ? `Puede escoger hasta ${group.max_select}` : "Puede escoger 1";
}

function getLinkedCatalogItemId(option: CatalogItemOptionRow) {
  const metadata = readGroupMetadata(option.metadata);
  const linkedCatalogItemId = metadata.linked_catalog_item_id;
  return typeof linkedCatalogItemId === "string" && linkedCatalogItemId.trim() ? linkedCatalogItemId.trim() : null;
}

function getOptionIngredientProductId(option: CatalogItemOptionRow) {
  const metadata = readGroupMetadata(option.metadata);
  const ingredientProductId = metadata.ingredient_product_id;
  return typeof ingredientProductId === "string" && ingredientProductId.trim() ? ingredientProductId.trim() : null;
}

function getOptionDisplayName(option: CatalogItemOptionRow, linkedCatalogItemsById: Map<string, CommercialCatalogItemOptionRow>) {
  const linkedItemId = getLinkedCatalogItemId(option);
  const linkedItem = linkedItemId ? linkedCatalogItemsById.get(linkedItemId) : null;
  return linkedItem?.name || option.name;
}

function getOptionDisplayCategory(option: CatalogItemOptionRow, linkedCatalogItemsById: Map<string, CommercialCatalogItemOptionRow>) {
  const linkedItemId = getLinkedCatalogItemId(option);
  const linkedItem = linkedItemId ? linkedCatalogItemsById.get(linkedItemId) : null;
  return linkedItem?.category_label || option.description || "";
}

function formString(form: HTMLFormElement, name: string) {
  const value = new FormData(form).get(name);
  return typeof value === "string" ? value.trim() : "";
}

function formNumber(form: HTMLFormElement, name: string, fallback = 0) {
  const parsed = Number(formString(form, name));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formBool(form: HTMLFormElement, name: string) {
  return new FormData(form).get(name) === "on";
}

export function MenuPersonalizationsClient({
  itemId,
  initialSnapshot,
}: {
  itemId: string;
  initialSnapshot: PersonalizationSnapshot;
}) {
  const [snapshot, setSnapshot] = useState<PersonalizationSnapshot>(initialSnapshot);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [openDetailsKey, setOpenDetailsKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const visibleOptionGroups = useMemo(() => snapshot.optionGroups.filter((group) => group.is_active), [snapshot.optionGroups]);
  const visibleOptionGroupIds = useMemo(() => new Set(visibleOptionGroups.map((group) => group.id)), [visibleOptionGroups]);
  const activeOptionCount = snapshot.options.filter((option) => option.is_active && visibleOptionGroupIds.has(option.option_group_id)).length;
  const hasVisibleRemovalsGroup = visibleOptionGroups.some((group) => getSimpleGroupKind(group) === "removals");

  const optionsByGroup = useMemo(() => {
    const map = new Map<string, CatalogItemOptionRow[]>();
    for (const option of snapshot.options) {
      const current = map.get(option.option_group_id) ?? [];
      current.push(option);
      map.set(option.option_group_id, current);
    }
    return map;
  }, [snapshot.options]);

  const consumptionRulesByOption = useMemo(() => {
    const map = new Map<string, CatalogItemOptionConsumptionRuleRow[]>();
    for (const rule of snapshot.consumptionRules) {
      const current = map.get(rule.option_id) ?? [];
      current.push(rule);
      map.set(rule.option_id, current);
    }
    return map;
  }, [snapshot.consumptionRules]);

  const recipeEffectsByOption = useMemo(() => {
    const map = new Map<string, CatalogItemOptionRecipeEffectRow[]>();
    for (const effect of snapshot.recipeEffects) {
      const current = map.get(effect.option_id) ?? [];
      current.push(effect);
      map.set(effect.option_id, current);
    }
    return map;
  }, [snapshot.recipeEffects]);

  const consumptionProductById = useMemo(() => new Map(snapshot.consumptionProducts.map((product) => [product.id, product])), [snapshot.consumptionProducts]);
  const commercialCatalogItemsById = useMemo(() => new Map(snapshot.commercialCatalogItems.map((item) => [item.id, item])), [snapshot.commercialCatalogItems]);

  async function mutate(
    action: string,
    payload: JsonRecord,
    successFallback: string,
    options?: {
      pendingKey?: string;
      closeDetailsKey?: string;
      resetForm?: HTMLFormElement;
    },
  ) {
    const nextPendingKey = options?.pendingKey ?? action;
    setPendingKey(nextPendingKey);
    setNotice(null);

    try {
      const response = await fetch(`/menu/${itemId}/personalizaciones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload }),
      });
      const data = (await response.json()) as MutationResponse;

      if (!response.ok || !data.ok || !data.snapshot) {
        throw new Error(data.error || "No se pudo guardar la personalización.");
      }

      setSnapshot(data.snapshot);
      setNotice({ type: "success", message: data.message || successFallback });

      if (options?.resetForm) {
        options.resetForm.reset();
      }

      if (options?.closeDetailsKey) {
        setOpenDetailsKey((current) => (current === options.closeDetailsKey ? null : current));
      }

      return true;
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Error inesperado." });
      return false;
    } finally {
      setPendingKey((current) => (current === nextPendingKey ? null : current));
    }
  }

  function updateDetailsState(key: string, isOpen: boolean) {
    setOpenDetailsKey((current) => {
      if (isOpen) return key;
      return current === key ? null : current;
    });
  }

  function handleCreateGroup(type: PersonalizationTypeCard) {
    const detailsKey = `create-group:${type.kind}`;
    void mutate(
      "create_group",
      { groupKind: type.kind, name: type.defaultName, description: type.description, maxSelect: type.maxSelect ? Number(type.maxSelect) : null },
      "Grupo creado.",
      { pendingKey: detailsKey },
    );
  }

  function handleUpdateGroup(event: FormEvent<HTMLFormElement>, group: CatalogItemOptionGroupRow) {
    event.preventDefault();
    const form = event.currentTarget;
    const detailsKey = `edit-group:${group.id}`;
    void mutate(
      "update_group",
      {
        groupId: group.id,
        name: formString(form, "name"),
        description: formString(form, "description"),
        selectionType: formString(form, "selection_type"),
        minSelect: formNumber(form, "min_select", 0),
        maxSelect: formNumber(form, "max_select", 1),
        isRequired: formBool(form, "is_required"),
        isActive: true,
        sortOrder: group.sort_order ?? 0,
        code: group.code,
      },
      "Grupo actualizado.",
      { pendingKey: detailsKey, closeDetailsKey: detailsKey },
    );
  }

  function handleCreateOption(event: FormEvent<HTMLFormElement>, group: CatalogItemOptionGroupRow) {
    event.preventDefault();
    const form = event.currentTarget;
    const detailsKey = `add-option:${group.id}`;
    void mutate(
      "create_option",
      {
        groupId: group.id,
        name: formString(form, "name"),
        description: formString(form, "description"),
        priceDeltaAmount: formNumber(form, "price_delta_amount", 0),
        linkedCatalogItemId: formString(form, "linked_catalog_item_id"),
        optionProductId: formString(form, "option_product_id"),
        optionQuantityPerOption: formNumber(form, "option_quantity_per_option", 0),
        optionStockUnitCode: formString(form, "option_stock_unit_code"),
        replacementTargetIngredientProductId: formString(form, "replacement_target_ingredient_product_id"),
        isDefault: formBool(form, "is_default"),
      },
      "Opción creada y mapeada.",
      { pendingKey: detailsKey, resetForm: form },
    );
  }

  function handleUpdateOption(event: FormEvent<HTMLFormElement>, option: CatalogItemOptionRow, group: CatalogItemOptionGroupRow) {
    event.preventDefault();
    const form = event.currentTarget;
    const detailsKey = `edit-option:${option.id}`;
    void mutate(
      "update_option",
      {
        groupId: group.id,
        optionId: option.id,
        name: formString(form, "name"),
        description: formString(form, "description"),
        priceDeltaAmount: formNumber(form, "price_delta_amount", 0),
        effectType: parseOptionEffectType(option.effect_type),
        isDefault: formBool(form, "is_default"),
        isActive: true,
        sortOrder: option.sort_order ?? 0,
        code: option.code,
      },
      "Opción actualizada.",
      { pendingKey: detailsKey, closeDetailsKey: detailsKey },
    );
  }

  function handleCreateConsumptionRule(event: FormEvent<HTMLFormElement>, option: CatalogItemOptionRow) {
    event.preventDefault();
    const form = event.currentTarget;
    const detailsKey = `inventory-option:${option.id}`;
    void mutate(
      "create_consumption_rule",
      {
        optionId: option.id,
        productId: formString(form, "product_id"),
        quantityPerOption: formNumber(form, "quantity_per_option", 0),
        stockUnitCode: formString(form, "stock_unit_code"),
        effectType: parseOptionEffectType(option.effect_type) === "replacement" ? "replacement" : "additive",
      },
      "Regla de consumo creada.",
      { pendingKey: detailsKey, closeDetailsKey: detailsKey, resetForm: form },
    );
  }

  function handleCreateRecipeEffect(event: FormEvent<HTMLFormElement>, option: CatalogItemOptionRow) {
    event.preventDefault();
    const form = event.currentTarget;
    const detailsKey = `inventory-option:${option.id}`;
    void mutate(
      "create_recipe_effect",
      {
        optionId: option.id,
        targetIngredientProductId: formString(form, "target_ingredient_product_id"),
        effectType: "replacement",
      },
      "Efecto de receta creado.",
      { pendingKey: detailsKey, closeDetailsKey: detailsKey, resetForm: form },
    );
  }

  return (
    <>
      <div id="personalizaciones" className="ui-panel space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="ui-h3">2. Personalizaciones</div>
            <p className="ui-caption">Crea preguntas y opciones. El inventario se configura solo dentro de la opción que lo necesite.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="ui-chip ui-chip--brand">{visibleOptionGroups.length} personalización{visibleOptionGroups.length === 1 ? "" : "es"}</span>
            <span className="ui-chip">{activeOptionCount} opción{activeOptionCount === 1 ? "" : "es"}</span>
          </div>
        </div>

        {notice ? (
          <div className={notice.type === "error" ? "ui-alert ui-alert--error" : "ui-alert ui-alert--success"}>{notice.message}</div>
        ) : null}

        <details className="rounded-[28px] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4" open={visibleOptionGroups.length === 0}>
          <summary className="cursor-pointer list-none">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-base font-black text-[var(--ui-text)]">+ Agregar personalización</div>
              <span className="ui-chip">Tamaño · Cambios · Ingredientes · Extras · Preferencias · Sugerir producto</span>
            </div>
          </summary>

          <div className="mt-4 grid gap-3 md:grid-cols-5">
            {personalizationTypeCards.map((type) => (
              <button
                key={type.kind}
                type="button"
                disabled={pendingKey === `create-group:${type.kind}`}
                onClick={() => handleCreateGroup(type)}
                className="flex min-h-24 w-full flex-col justify-between rounded-2xl border border-[var(--ui-border)] bg-white p-4 text-left shadow-[var(--ui-shadow-1)] transition hover:-translate-y-0.5 hover:shadow-[var(--ui-shadow-2)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="text-base font-black text-[var(--ui-brand)]">{type.label}</span>
                <span className="mt-2 text-xs font-semibold leading-4 text-[var(--ui-muted)]">{type.description}</span>
              </button>
            ))}
          </div>
        </details>

        {visibleOptionGroups.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[var(--ui-border)] bg-white p-6 text-center">
            <div className="text-base font-black text-[var(--ui-text)]">Este producto todavía no tiene personalizaciones.</div>
            <p className="ui-caption mt-1">Pulsa “Agregar personalización” y elige un tipo para empezar.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleOptionGroups.map((group, groupIndex) => {
              const groupOptions = optionsByGroup.get(group.id) ?? [];
              const visibleOptions = groupOptions.filter((option) => option.is_active);
              const groupKind = getSimpleGroupKind(group);
              const supportsDefaultOption = groupKind === "choice";
              const isMultiple = parseSelectionType(group.selection_type) === "multiple";
              const groupDisplayName = getSimpleGroupDisplayName(group);
              const groupEditKey = `edit-group:${group.id}`;
              const addOptionKey = `add-option:${group.id}`;
              const shouldOpenAddOption = openDetailsKey === addOptionKey || (visibleOptions.length === 0 && openDetailsKey === null);

              return (
                <div key={group.id} className="overflow-hidden rounded-[30px] border border-[var(--ui-border)] bg-white shadow-[var(--ui-shadow-1)]">
                  <div className="border-b border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--ui-brand)] text-sm font-black text-white">{groupIndex + 1}</span>
                        <div className="min-w-0">
                          <div className="truncate text-lg font-black text-[var(--ui-text)]">{groupDisplayName}</div>
                          <div className="ui-caption mt-1" title={getSimpleGroupHelp(groupKind)}>{getSimpleGroupLabel(groupKind)}</div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className="ui-chip">Selección: {isMultiple ? "Múltiple" : "Única"}</span>
                        <span className="ui-chip" title={getSelectionRuleLabel(group)}>Requerido: {group.is_required ? "Sí" : "No"}</span>
                        <button
                          type="button"
                          className="ui-btn ui-btn--danger"
                          disabled={pendingKey === `disable-group:${group.id}`}
                          onClick={() => void mutate("disable_group", { groupId: group.id }, "Grupo desactivado.", { pendingKey: `disable-group:${group.id}` })}
                        >
                          {pendingKey === `disable-group:${group.id}` ? "Eliminando..." : "Eliminar"}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="divide-y divide-[var(--ui-border)]">
                    <details
                      className="px-5 py-4"
                      open={openDetailsKey === groupEditKey}
                      onToggle={(event) => updateDetailsState(groupEditKey, event.currentTarget.open)}
                    >
                      <summary className="cursor-pointer list-none text-sm font-black text-[var(--ui-brand)]">Editar nombre y reglas</summary>
                      <form onSubmit={(event) => handleUpdateGroup(event, group)} className="mt-4 space-y-4 rounded-3xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
                        <div className="grid gap-3 lg:grid-cols-[1fr_180px_120px_120px]">
                          <label className="space-y-2">
                            <span className="ui-label">Nombre de la personalización</span>
                            <input name="name" className="ui-input" defaultValue={groupDisplayName} required />
                          </label>

                          <label className="space-y-2">
                            <span className="ui-label">Selección</span>
                            <select name="selection_type" className="ui-input" defaultValue={group.selection_type}>
                              <option value="single">Única</option>
                              <option value="multiple">Múltiple</option>
                            </select>
                          </label>

                          <label className="space-y-2">
                            <span className="ui-label">Mínimo</span>
                            <input name="min_select" type="number" min="0" className="ui-input" defaultValue={String(group.min_select ?? 0)} />
                          </label>

                          <label className="space-y-2">
                            <span className="ui-label">Máximo</span>
                            <input name="max_select" type="number" min="1" className="ui-input" defaultValue={String(group.max_select ?? 1)} />
                          </label>
                        </div>

                        <label className="block space-y-2">
                          <span className="ui-label">Texto de ayuda</span>
                          <input name="description" className="ui-input" defaultValue={group.description ?? ""} />
                        </label>

                        <label className="flex items-center gap-2 text-sm font-semibold text-[var(--ui-text)]">
                          <input type="checkbox" name="is_required" defaultChecked={group.is_required} />
                          Requerido para comprar
                        </label>

                        <div className="flex justify-end">
                          <button type="submit" className="ui-btn ui-btn--brand" disabled={pendingKey === groupEditKey}>
                            {pendingKey === groupEditKey ? "Guardando..." : "Guardar"}
                          </button>
                        </div>
                      </form>
                    </details>

                    {groupKind === "removals" ? (
                      <div className="space-y-4 px-5 py-5">
                        <div>
                          <div className="text-sm font-black text-[var(--ui-text)]">Ingredientes de la receta</div>
                          <p className="ui-caption mt-1">Activa los ingredientes que el cliente puede pedir “sin”. Si el cliente marca uno en Pass, cocina lo retira y ese ingrediente no se descuenta de inventario.</p>
                        </div>

                        {snapshot.recipeIngredients.length === 0 ? (
                          <div className="rounded-3xl border border-dashed border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-5 text-center">
                            <div className="text-sm font-black text-[var(--ui-text)]">Este producto base no tiene receta activa.</div>
                            <p className="ui-caption mt-1">Primero configura la receta operacional para poder activar ingredientes removibles.</p>
                          </div>
                        ) : (
                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {snapshot.recipeIngredients.map((ingredient) => {
                              const product = ingredient.product;
                              if (!product) return null;
                              const ingredientName = product.name ?? "Ingrediente";
                              const removalOption = visibleOptions.find((option) => {
                                const ingredientProductId = getOptionIngredientProductId(option);
                                return ingredientProductId === ingredient.ingredient_product_id || option.code === `sin-${ingredientName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
                              });

                              if (removalOption) {
                                return (
                                  <div key={ingredient.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--ui-border)] bg-white p-3">
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-black text-[var(--ui-text)]">Sin {ingredientName}</div>
                                      <div className="ui-caption">No descuenta {formatQuantityAdmin(ingredient.quantity)} {product.stock_unit_code || product.unit || "unidad"}</div>
                                    </div>
                                    <button
                                      type="button"
                                      className="ui-btn ui-btn--ghost"
                                      disabled={pendingKey === `disable-option:${removalOption.id}`}
                                      onClick={() => void mutate("disable_option", { groupId: group.id, optionId: removalOption.id }, "Opción desactivada.", { pendingKey: `disable-option:${removalOption.id}` })}
                                    >
                                      {pendingKey === `disable-option:${removalOption.id}` ? "Quitando..." : "Quitar"}
                                    </button>
                                  </div>
                                );
                              }

                              return (
                                <button
                                  key={ingredient.id}
                                  type="button"
                                  disabled={pendingKey === `create-removal:${ingredient.id}`}
                                  onClick={() => void mutate("create_removal_option_from_recipe", { groupId: group.id, ingredientProductId: ingredient.ingredient_product_id, ingredientName, stockUnitCode: product.stock_unit_code || product.unit || "" }, `Opción Sin ${ingredientName} creada.`, { pendingKey: `create-removal:${ingredient.id}` })}
                                  className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-black text-[var(--ui-text)]">Sin {ingredientName}</span>
                                    <span className="ui-caption">Receta: {formatQuantityAdmin(ingredient.quantity)} {product.stock_unit_code || product.unit || "unidad"}</span>
                                  </span>
                                  <span className="ui-btn ui-btn--brand shrink-0">Permitir quitar</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : null}

                    {groupKind === "removals" ? null : visibleOptions.length === 0 ? (
                      <div className="px-5 py-5">
                        <div className="rounded-3xl border border-dashed border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-5 text-center">
                          <div className="text-sm font-black text-[var(--ui-text)]">Aún no tiene opciones.</div>
                          <p className="ui-caption mt-1">Agrega la primera opción abajo.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="divide-y divide-[var(--ui-border)]">
                        {visibleOptions.map((option) => {
                          const consumptionRules = consumptionRulesByOption.get(option.id) ?? [];
                          const recipeEffects = recipeEffectsByOption.get(option.id) ?? [];
                          const currentEffectType = parseOptionEffectType(option.effect_type);
                          const optionName = getOptionDisplayName(option, commercialCatalogItemsById);
                          const optionMeta = getOptionDisplayCategory(option, commercialCatalogItemsById);
                          const optionPrice = Number(option.price_delta_amount ?? 0);
                          const hasOperationalRules = consumptionRules.length > 0 || recipeEffects.length > 0;
                          const optionEditKey = `edit-option:${option.id}`;
                          const optionInventoryKey = `inventory-option:${option.id}`;

                          return (
                            <div key={option.id} className="px-5 py-4">
                              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_150px_auto] lg:items-center">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="truncate text-base font-black text-[var(--ui-text)]">{optionName}</div>
                                    {supportsDefaultOption && option.is_default ? <span className="ui-chip ui-chip--success">Estándar</span> : null}
                                  </div>
                                  {optionMeta ? <div className="ui-caption mt-1 truncate">{optionMeta}</div> : null}
                                </div>

                                <div className="rounded-2xl bg-[var(--ui-surface-2)] px-3 py-2 text-sm font-black text-[var(--ui-text)]" title={getOptionSummary(option)}>
                                  {optionPrice > 0 ? `+ ${formatCopAdmin(optionPrice)}` : "+ $0"}
                                </div>

                                <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                                  <details
                                    className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2"
                                    open={openDetailsKey === optionEditKey}
                                    onToggle={(event) => updateDetailsState(optionEditKey, event.currentTarget.open)}
                                  >
                                    <summary className="cursor-pointer list-none text-sm font-black text-[var(--ui-text)]">Editar</summary>
                                    <form onSubmit={(event) => handleUpdateOption(event, option, group)} className="mt-4 w-full min-w-[280px] space-y-3">
                                      <label className="space-y-2">
                                        <span className="ui-label">Nombre</span>
                                        <input name="name" className="ui-input" defaultValue={option.name} required />
                                      </label>
                                      <label className="space-y-2">
                                        <span className="ui-label">Precio adicional</span>
                                        <input name="price_delta_amount" type="number" min="0" className="ui-input" defaultValue={String(option.price_delta_amount ?? 0)} />
                                      </label>
                                      <label className="space-y-2">
                                        <span className="ui-label">Descripción</span>
                                        <input name="description" className="ui-input" defaultValue={option.description ?? ""} />
                                      </label>
                                      {supportsDefaultOption ? (
                                        <label className="flex items-center gap-2 text-sm font-semibold text-[var(--ui-text)]">
                                          <input type="checkbox" name="is_default" defaultChecked={option.is_default} />
                                          Opción estándar
                                        </label>
                                      ) : (
                                        <input type="hidden" name="is_default" value="false" />
                                      )}
                                      <button type="submit" className="ui-btn ui-btn--brand w-full" disabled={pendingKey === optionEditKey}>
                                        {pendingKey === optionEditKey ? "Guardando..." : "Guardar opción"}
                                      </button>
                                    </form>
                                  </details>

                                  <details
                                    className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2"
                                    open={openDetailsKey === optionInventoryKey}
                                    onToggle={(event) => updateDetailsState(optionInventoryKey, event.currentTarget.open)}
                                  >
                                    <summary className="cursor-pointer list-none text-sm font-black text-[var(--ui-text)]">{hasOperationalRules ? "Inventario listo" : "Inventario"}</summary>
                                    <div className="mt-4 w-full min-w-[320px] space-y-4">
                                      <form onSubmit={(event) => handleCreateConsumptionRule(event, option)} className="space-y-3 rounded-2xl border border-[var(--ui-border)] bg-white p-4">
                                        <div className="text-sm font-black text-[var(--ui-text)]">Descontar insumo</div>
                                        <div className="grid gap-3 lg:grid-cols-[1fr_120px_140px]">
                                          <label className="space-y-2">
                                            <span className="ui-label">Insumo</span>
                                            <select name="product_id" className="ui-input" required>
                                              <option value="">Selecciona</option>
                                              {snapshot.consumptionProducts.map((product) => (
                                                <option key={product.id} value={product.id}>{product.name ?? "Sin nombre"}</option>
                                              ))}
                                            </select>
                                          </label>
                                          <label className="space-y-2">
                                            <span className="ui-label">Cantidad</span>
                                            <input name="quantity_per_option" type="number" min="0.0001" step="0.0001" className="ui-input" required />
                                          </label>
                                          <label className="space-y-2">
                                            <span className="ui-label">Unidad</span>
                                            <select name="stock_unit_code" className="ui-input" defaultValue="">
                                              <option value="">Auto</option>
                                              {snapshot.inventoryUnits.map((unit) => (
                                                <option key={unit.code} value={unit.code}>{unit.name}{unit.symbol ? ` (${unit.symbol})` : ""}</option>
                                              ))}
                                            </select>
                                          </label>
                                        </div>
                                        <button type="submit" className="ui-btn ui-btn--brand w-full" disabled={pendingKey === optionInventoryKey}>
                                          {pendingKey === optionInventoryKey ? "Guardando..." : "Guardar consumo"}
                                        </button>
                                      </form>

                                      {consumptionRules.length > 0 ? (
                                        <div className="space-y-2">
                                          {consumptionRules.map((rule) => {
                                            const product = consumptionProductById.get(rule.product_id);
                                            return (
                                              <div key={rule.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--ui-border)] bg-white p-3">
                                                <div className="text-sm font-semibold text-[var(--ui-text)]">
                                                  {product?.name ?? "Insumo"} · {formatQuantityAdmin(rule.quantity_per_option)} {rule.stock_unit_code || product?.stock_unit_code || product?.unit || "unidad"}
                                                </div>
                                                <button
                                                  type="button"
                                                  className="ui-btn ui-btn--ghost"
                                                  disabled={pendingKey === `disable-consumption:${rule.id}`}
                                                  onClick={() => void mutate("disable_consumption_rule", { optionId: option.id, ruleId: rule.id }, "Regla de consumo desactivada.", { pendingKey: `disable-consumption:${rule.id}` })}
                                                >
                                                  {pendingKey === `disable-consumption:${rule.id}` ? "Quitando..." : "Quitar"}
                                                </button>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      ) : null}

                                      {snapshot.recipeIngredients.length > 0 ? (
                                        <form onSubmit={(event) => handleCreateRecipeEffect(event, option)} className="space-y-3 rounded-2xl border border-[var(--ui-border)] bg-white p-4">
                                          <div className="text-sm font-black text-[var(--ui-text)]">Reemplazar ingrediente</div>
                                          <label className="space-y-2">
                                            <span className="ui-label">Ingrediente de receta que deja de descontarse</span>
                                            <select name="target_ingredient_product_id" className="ui-input" required>
                                              <option value="">Selecciona ingrediente</option>
                                              {snapshot.recipeIngredients.map((ingredient) => {
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
                                          <button type="submit" className="ui-btn ui-btn--brand w-full" disabled={pendingKey === optionInventoryKey}>
                                            {pendingKey === optionInventoryKey ? "Guardando..." : "Guardar reemplazo"}
                                          </button>
                                        </form>
                                      ) : null}

                                      {recipeEffects.length > 0 ? (
                                        <div className="space-y-2">
                                          {recipeEffects.map((effect) => {
                                            const targetProduct = consumptionProductById.get(effect.target_ingredient_product_id);
                                            return (
                                              <div key={effect.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--ui-border)] bg-white p-3">
                                                <div className="text-sm font-semibold text-[var(--ui-text)]">{effect.effect_type === "replacement" ? "Reemplaza" : "Quita"} {targetProduct?.name ?? "ingrediente"}</div>
                                                <button
                                                  type="button"
                                                  className="ui-btn ui-btn--ghost"
                                                  disabled={pendingKey === `disable-recipe-effect:${effect.id}`}
                                                  onClick={() => void mutate("disable_recipe_effect", { optionId: option.id, effectId: effect.id }, "Efecto de receta desactivado.", { pendingKey: `disable-recipe-effect:${effect.id}` })}
                                                >
                                                  {pendingKey === `disable-recipe-effect:${effect.id}` ? "Quitando..." : "Quitar"}
                                                </button>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      ) : null}
                                    </div>
                                  </details>

                                  <button
                                    type="button"
                                    className="ui-btn ui-btn--ghost"
                                    disabled={pendingKey === `disable-option:${option.id}`}
                                    onClick={() => void mutate("disable_option", { groupId: group.id, optionId: option.id }, "Opción desactivada.", { pendingKey: `disable-option:${option.id}` })}
                                  >
                                    {pendingKey === `disable-option:${option.id}` ? "Eliminando..." : "Eliminar"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {groupKind === "removals" ? null : (
                      <details
                        className="px-5 py-4"
                        open={shouldOpenAddOption}
                        onToggle={(event) => updateDetailsState(addOptionKey, event.currentTarget.open)}
                      >
                        <summary className="cursor-pointer list-none text-sm font-black text-[var(--ui-brand)]">+ Agregar opción</summary>
                        <form onSubmit={(event) => handleCreateOption(event, group)} className="mt-4 rounded-3xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
                          {groupKind === "recommendations" ? (
                            <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
                              <label className="space-y-2">
                                <span className="ui-label">Producto sugerido</span>
                                <select name="linked_catalog_item_id" className="ui-input" required>
                                  <option value="">Selecciona producto sugerido</option>
                                  {snapshot.commercialCatalogItems.map((catalogItem) => (
                                    <option key={catalogItem.id} value={catalogItem.id}>{catalogItem.name || "Producto sin nombre"} · {formatCopAdmin(catalogItem.price_amount)}</option>
                                  ))}
                                </select>
                              </label>
                              <label className="space-y-2">
                                <span className="ui-label">Texto opcional</span>
                                <input name="description" className="ui-input" placeholder="Ej. Queda bien con este producto." />
                              </label>
                              <button type="submit" className="ui-btn ui-btn--brand" disabled={pendingKey === addOptionKey}>
                                {pendingKey === addOptionKey ? "Agregando..." : "Agregar sugerencia"}
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <div className="grid gap-3 lg:grid-cols-[1fr_160px_1fr_auto] lg:items-end">
                                <label className="space-y-2">
                                  <span className="ui-label">Opción visible</span>
                                  <input name="name" className="ui-input" placeholder="Ej. Vaso, cono, Oreo, leche de almendra" required />
                                </label>
                                <label className="space-y-2">
                                  <span className="ui-label">Precio adicional</span>
                                  <input name="price_delta_amount" type="number" min="0" className="ui-input" defaultValue="0" />
                                </label>
                                <label className="space-y-2">
                                  <span className="ui-label">Descripción</span>
                                  <input name="description" className="ui-input" placeholder="Opcional" />
                                </label>
                                <div className="flex flex-wrap items-center gap-3">
                                  {supportsDefaultOption ? (
                                    <label className="flex items-center gap-2 text-sm font-semibold text-[var(--ui-text)]">
                                      <input type="checkbox" name="is_default" />
                                      Opción estándar
                                    </label>
                                  ) : (
                                    <input type="hidden" name="is_default" value="false" />
                                  )}
                                  <button type="submit" className="ui-btn ui-btn--brand" disabled={pendingKey === addOptionKey}>
                                    {pendingKey === addOptionKey ? "Agregando..." : "Agregar"}
                                  </button>
                                </div>
                              </div>

                              {groupKind === "extras" || groupKind === "replacements" || groupKind === "choice" ? (
                                <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
                                  <div className="mb-3">
                                    <div className="text-sm font-black text-[var(--ui-text)]">{groupKind === "replacements" ? "Inventario del producto que entra" : "Inventario que descuenta esta opción"}</div>
                                    <p className="ui-caption">{groupKind === "choice" ? "Opcional para tamaños o presentaciones. Úsalo si esta opción debe descontar un insumo específico, como vaso o cono." : "Obligatorio para adiciones y cambios. Se crea la regla de consumo al mismo tiempo que la opción."}</p>
                                  </div>
                                  <div className="grid gap-3 lg:grid-cols-[1fr_120px_150px]">
                                    <label className="space-y-2">
                                      <span className="ui-label">Producto operacional</span>
                                      <select name="option_product_id" className="ui-input" required={groupKind === "extras" || groupKind === "replacements"}>
                                        <option value="">Selecciona insumo</option>
                                        {snapshot.consumptionProducts.map((product) => (
                                          <option key={product.id} value={product.id}>{(product.name ?? "Sin nombre") + (product.sku ? ` · ${product.sku}` : "")}</option>
                                        ))}
                                      </select>
                                    </label>
                                    <label className="space-y-2">
                                      <span className="ui-label">Cantidad</span>
                                      <input name="option_quantity_per_option" type="number" min="0.0001" step="0.0001" className="ui-input" required={groupKind === "extras" || groupKind === "replacements"} />
                                    </label>
                                    <label className="space-y-2">
                                      <span className="ui-label">Unidad</span>
                                      <select name="option_stock_unit_code" className="ui-input" defaultValue="">
                                        <option value="">Auto / stock</option>
                                        {snapshot.inventoryUnits.map((unit) => (
                                          <option key={unit.code} value={unit.code}>{unit.name}{unit.symbol ? ` (${unit.symbol})` : ""}</option>
                                        ))}
                                      </select>
                                    </label>
                                  </div>
                                </div>
                              ) : null}

                              {groupKind === "replacements" ? (
                                <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
                                  <div className="mb-3">
                                    <div className="text-sm font-black text-[var(--ui-text)]">Ingrediente original que deja de descontarse</div>
                                    <p className="ui-caption">El cambio consume el producto nuevo y marca este ingrediente de la receta base como reemplazado.</p>
                                  </div>
                                  {snapshot.recipeIngredients.length === 0 ? (
                                    <div className="rounded-2xl border border-dashed border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4 text-sm font-semibold text-[var(--ui-muted)]">Este producto base no tiene receta activa. Configura receta antes de crear cambios/reemplazos.</div>
                                  ) : (
                                    <label className="space-y-2">
                                      <span className="ui-label">Reemplaza a</span>
                                      <select name="replacement_target_ingredient_product_id" className="ui-input" required>
                                        <option value="">Selecciona ingrediente de receta</option>
                                        {snapshot.recipeIngredients.map((ingredient) => {
                                          const product = ingredient.product;
                                          if (!product) return null;
                                          return (
                                            <option key={ingredient.id} value={ingredient.ingredient_product_id}>{product.name ?? "Ingrediente"} · {formatQuantityAdmin(ingredient.quantity)} {product.stock_unit_code || product.unit || "unidad"}</option>
                                          );
                                        })}
                                      </select>
                                    </label>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          )}
                        </form>
                      </details>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {snapshot.recipeIngredients.length > 0 && !hasVisibleRemovalsGroup ? (
        <div id="receta-inventario" className="ui-panel space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="ui-h3">3. Receta / Inventario</div>
              <p className="ui-caption">Atajos para convertir ingredientes de receta en opciones “Sin X”.</p>
            </div>
            <span className="ui-chip">{snapshot.recipeIngredients.length} ingrediente{snapshot.recipeIngredients.length === 1 ? "" : "s"}</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {snapshot.recipeIngredients.map((ingredient) => {
              const product = ingredient.product;
              if (!product) return null;
              return (
                <button
                  key={ingredient.id}
                  type="button"
                  disabled={pendingKey === `create-removal:${ingredient.id}`}
                  onClick={() => void mutate("create_removal_option_from_recipe", { ingredientProductId: ingredient.ingredient_product_id, ingredientName: product.name ?? "Ingrediente", stockUnitCode: product.stock_unit_code || product.unit || "" }, `Opción Sin ${product.name ?? "Ingrediente"} creada.`, { pendingKey: `create-removal:${ingredient.id}` })}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-[var(--ui-text)]">Sin {product.name ?? "Ingrediente"}</span>
                    <span className="ui-caption">{formatQuantityAdmin(ingredient.quantity)} {product.stock_unit_code || product.unit || "unidad"}</span>
                  </span>
                  <span className="ui-btn ui-btn--ghost shrink-0">Crear</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </>
  );
}
