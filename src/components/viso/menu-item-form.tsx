"use client";

import { type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

type SiteOption = {
  id: string;
  code: string | null;
  name: string | null;
  is_active?: boolean | null;
};

type ProductOption = {
  id: string;
  name: string | null;
  sku: string | null;
  unit?: string | null;
  stock_unit_code?: string | null;
  is_active?: boolean | null;
  site_ids?: string[];
  site_prices?: Record<string, number | null>;
  site_recipe_costs?: Record<string, number | null>;
  default_price?: number | null;
};

type CommercialCategoryOption = {
  id: string;
  site_id: string;
  name: string | null;
  code: string | null;
  is_active?: boolean | null;
};

type CommercialCollectionOption = {
  id: string;
  site_id: string;
  name: string | null;
  subtitle: string | null;
  code: string | null;
  kind: string | null;
  is_active?: boolean | null;
};

type CollectionCategoryLinkOption = {
  collection_id: string;
  commercial_category_id: string;
  sort_order?: number | null;
  is_active?: boolean | null;
};

type ExistingCommercialItemOption = {
  id: string;
  site_id: string;
  product_id: string | null;
  name: string | null;
  is_active?: boolean | null;
};

type CommercialCoverageSite = {
  site_id: string;
  site_label: string;
  total_sellable: number;
  created_count: number;
  missing_count: number;
  missing_products: Array<{
    id: string;
    name: string | null;
    sku: string | null;
  }>;
};

type MenuItemFormValues = {
  id?: string;
  code: string;
  name: string;
  description: string;
  product_id: string;
  price_amount: string;
  compare_at_amount: string;
  sort_order: string;
  is_active: boolean;
  is_featured: boolean;
  site_id: string;
  commercial_collection_id?: string;
  commercial_category_id: string;
  category_label: string;
  image_url: string;
  badges_csv: string;
  fulfillment_delivery: boolean;
  fulfillment_pickup: boolean;
  fulfillment_on_premise: boolean;
  metadata_extra: string;
  display_group?: string;
  variant_label?: string;
  pass_card_layout?: "compact" | "featured" | string;
  opens_detail_modal?: boolean;
};

type MenuItemFormProps = {
  mode: "create" | "edit";
  sites: SiteOption[];
  products: ProductOption[];
  categories: CommercialCategoryOption[];
  collections?: CommercialCollectionOption[];
  collectionCategoryLinks?: CollectionCategoryLinkOption[];
  existingCommercialItems?: ExistingCommercialItemOption[];
  commercialCoverage?: CommercialCoverageSite[];
  initial: MenuItemFormValues;
  action: (formData: FormData) => void | Promise<void>;
  formId?: string;
  secondaryActions?: ReactNode;
};

const PRODUCT_UPLOAD_ENDPOINT = "/api/viso/upload-commercial-menu-image";
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function getPreviewTitle(name: string) {
  const trimmed = name.trim();
  return trimmed || "Producto del menu";
}

function getPreviewCategory(category: string) {
  const trimmed = category.trim();
  return trimmed || "Categoría general";
}

function asCop(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "$0";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(parsed);
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function formatCopInput(value: string) {
  const digits = onlyDigits(value);
  if (!digits || Number(digits) <= 0) return "";

  const parsed = Number(digits);
  if (!Number.isFinite(parsed)) return "";

  return `$ ${new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: 0,
  }).format(parsed)}`;
}

function normalizeSearchValue(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function getProductDisplayName(product: ProductOption) {
  return product.name?.trim() || product.sku?.trim() || "Producto sin nombre";
}

function getProductSearchText(product: ProductOption) {
  return normalizeSearchValue(
    [
      product.name,
      product.sku,
      product.id,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function getProductPriceForSite(product: ProductOption, siteId: string) {
  const sitePrice = siteId ? product.site_prices?.[siteId] : null;
  if (typeof sitePrice === "number" && Number.isFinite(sitePrice) && sitePrice > 0) {
    return sitePrice;
  }

  const fallbackPrice = product.default_price;
  if (typeof fallbackPrice === "number" && Number.isFinite(fallbackPrice) && fallbackPrice > 0) {
    return fallbackPrice;
  }

  return null;
}

export function MenuItemForm({
  mode,
  sites,
  products,
  categories,
  collections = [],
  collectionCategoryLinks,
  existingCommercialItems = [],
  commercialCoverage = [],
  initial,
  action,
  formId,
  secondaryActions,
}: MenuItemFormProps) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [productId, setProductId] = useState(initial.product_id);
  const [productQuery, setProductQuery] = useState("");
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [showExistingProducts, setShowExistingProducts] = useState(false);
  const [priceAmount, setPriceAmount] = useState(initial.price_amount);
  const [siteId, setSiteId] = useState(initial.site_id || sites[0]?.id || "");
  const [commercialCollectionId, setCommercialCollectionId] = useState(
    initial.commercial_collection_id ?? "",
  );
  const [commercialCategoryId, setCommercialCategoryId] = useState(initial.commercial_category_id);
  const [categoryLabel] = useState(initial.category_label);
  const [badgesCsv, setBadgesCsv] = useState(initial.badges_csv);
  const [displayGroup, setDisplayGroup] = useState(initial.display_group ?? "");
  const [variantLabel, setVariantLabel] = useState(initial.variant_label ?? "");
  const [imageUrl, setImageUrl] = useState(initial.image_url);
  const [isActive, setIsActive] = useState(initial.is_active);
  const [isFeatured, setIsFeatured] = useState(initial.is_featured);
  const [fulfillmentDelivery, setFulfillmentDelivery] = useState(initial.fulfillment_delivery);
  const [fulfillmentPickup, setFulfillmentPickup] = useState(initial.fulfillment_pickup);
  const [fulfillmentOnPremise, setFulfillmentOnPremise] = useState(initial.fulfillment_on_premise);
  const [passCardLayout, setPassCardLayout] = useState(
    initial.pass_card_layout === "featured" ? "featured" : "compact",
  );
  const [opensDetailModal, setOpensDetailModal] = useState(Boolean(initial.opens_detail_modal));
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [uploadMessage, setUploadMessage] = useState("");
  const generatedFormId = useId().replace(/:/g, "");
  const resolvedFormId = formId || `menu-item-form-${generatedFormId}`;
  const productPickerRef = useRef<HTMLDivElement | null>(null);
  const productPickerListId = `${resolvedFormId}-product-results`;

  const siteLabel = useMemo(() => {
    const selected = sites.find((site) => site.id === siteId);
    if (!selected) return "Sin sede";
    return selected.name ?? selected.code ?? "Sin sede";
  }, [sites, siteId]);

  const existingCommercialProductIdsBySite = useMemo(() => {
    const map = new Map<string, Set<string>>();

    for (const item of existingCommercialItems) {
      if (item.is_active === false) continue;

      const itemSiteId = String(item.site_id ?? "").trim();
      const itemProductId = String(item.product_id ?? "").trim();

      if (!itemSiteId || !itemProductId) continue;

      const current = map.get(itemSiteId) ?? new Set<string>();
      current.add(itemProductId);
      map.set(itemSiteId, current);
    }

    if (mode === "edit" && initial.site_id && initial.product_id) {
      map.get(initial.site_id)?.delete(initial.product_id);
    }

    return map;
  }, [existingCommercialItems, initial.product_id, initial.site_id, mode]);

  const isProductAlreadyCreatedForSite = useCallback((targetProductId: string, targetSiteId: string) => {
    if (!targetProductId || !targetSiteId) return false;
    return existingCommercialProductIdsBySite.get(targetSiteId)?.has(targetProductId) ?? false;
  }, [existingCommercialProductIdsBySite]);

  const eligibleProducts = useMemo(() => {
    return products.filter((product) => {
      if (product.is_active === false) return false;
      const siteIds = product.site_ids || [];
      if (!siteId) return true;
      return siteIds.includes(siteId);
    });
  }, [products, siteId]);

  const availableProducts = useMemo(() => {
    return eligibleProducts.filter((product) => !isProductAlreadyCreatedForSite(product.id, siteId));
  }, [eligibleProducts, isProductAlreadyCreatedForSite, siteId]);

  const alreadyCreatedProducts = useMemo(() => {
    return eligibleProducts.filter((product) => isProductAlreadyCreatedForSite(product.id, siteId));
  }, [eligibleProducts, isProductAlreadyCreatedForSite, siteId]);

  const visibleProducts = useMemo(() => {
    return showExistingProducts ? eligibleProducts : availableProducts;
  }, [availableProducts, eligibleProducts, showExistingProducts]);

  const selectedSiteCoverage = useMemo(() => {
    return commercialCoverage.find((site) => site.site_id === siteId) ?? null;
  }, [commercialCoverage, siteId]);

  const selectedProductAlreadyCreated = useMemo(() => {
    return isProductAlreadyCreatedForSite(productId, siteId);
  }, [isProductAlreadyCreatedForSite, productId, siteId]);

  const selectedProduct = useMemo(() => {
    return eligibleProducts.find((product) => product.id === productId) ?? null;
  }, [eligibleProducts, productId]);

  const matchingProducts = useMemo(() => {
    const query = normalizeSearchValue(productQuery);
    if (!query) return visibleProducts;

    return visibleProducts.filter((product) => getProductSearchText(product).includes(query));
  }, [productQuery, visibleProducts]);

  const productResultsLimit = productQuery.trim() ? 30 : 12;
  const productResults = matchingProducts.slice(0, productResultsLimit);
  const hasMoreProductResults = matchingProducts.length > productResults.length;
  const availableProductCount = availableProducts.length;
  const alreadyCreatedProductCount = alreadyCreatedProducts.length;

  const visibleCollections = useMemo(() => {
    return collections.filter((collection) => {
      if (collection.is_active === false) return false;
      return collection.site_id === siteId;
    });
  }, [collections, siteId]);

  const shouldFilterCategoriesByCollection = collectionCategoryLinks != null;

  const categoryIdsByCollection = useMemo(() => {
    const map = new Map<string, Set<string>>();

    for (const link of collectionCategoryLinks ?? []) {
      if (link.is_active === false) continue;

      const collectionId = String(link.collection_id ?? "").trim();
      const categoryId = String(link.commercial_category_id ?? "").trim();

      if (!collectionId || !categoryId) continue;

      const current = map.get(collectionId) ?? new Set<string>();
      current.add(categoryId);
      map.set(collectionId, current);
    }

    return map;
  }, [collectionCategoryLinks]);

  const selectedCollection = useMemo(() => {
    return visibleCollections.find((collection) => collection.id === commercialCollectionId) ?? null;
  }, [commercialCollectionId, visibleCollections]);

  const visibleCategories = useMemo(() => {
    return categories.filter((category) => {
      if (category.is_active === false) return false;
      if (category.site_id !== siteId) return false;

      if (!commercialCollectionId) return false;

      if (!shouldFilterCategoriesByCollection) {
        return true;
      }

      const allowedCategoryIds = categoryIdsByCollection.get(commercialCollectionId);
      return allowedCategoryIds?.has(category.id) ?? false;
    });
  }, [
    categories,
    siteId,
    commercialCollectionId,
    shouldFilterCategoriesByCollection,
    categoryIdsByCollection,
  ]);

  const selectedCategory = useMemo(() => {
    return visibleCategories.find((category) => category.id === commercialCategoryId) ?? null;
  }, [commercialCategoryId, visibleCategories]);

  const liveBadges = useMemo(() => {
    return badgesCsv
      .split(",")
      .map((badge) => badge.trim())
      .filter(Boolean)
      .slice(0, 3);
  }, [badgesCsv]);

  const liveFulfillmentLabels = useMemo(() => {
    return [
      fulfillmentDelivery ? "Domicilio" : null,
      fulfillmentPickup ? "Recoger" : null,
      fulfillmentOnPremise ? "En sitio" : null,
    ].filter(Boolean);
  }, [fulfillmentDelivery, fulfillmentPickup, fulfillmentOnPremise]);

  useEffect(() => {
    if (!commercialCollectionId) return;
    const stillValid = visibleCollections.some((collection) => collection.id === commercialCollectionId);
    if (!stillValid) setCommercialCollectionId("");
  }, [commercialCollectionId, visibleCollections]);

  useEffect(() => {
    if (!commercialCategoryId) return;
    const stillValid = visibleCategories.some((category) => category.id === commercialCategoryId);
    if (!stillValid) setCommercialCategoryId("");
  }, [commercialCategoryId, visibleCategories]);

  useEffect(() => {
    if (!productId) return;
    const stillValid = eligibleProducts.some((product) => product.id === productId);
    if (!stillValid || selectedProductAlreadyCreated) {
      setProductId("");
      setProductQuery("");
    }
  }, [eligibleProducts, productId, selectedProductAlreadyCreated]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!productPickerRef.current) return;
      const target = event.target as Node | null;
      if (target && !productPickerRef.current.contains(target)) {
        setIsProductPickerOpen(false);
      }
    }

    if (isProductPickerOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isProductPickerOpen]);

  const suggestedPrice = useMemo(() => {
    if (!selectedProduct) return null;
    if (siteId) {
      const sitePrice = selectedProduct.site_prices?.[siteId];
      if (typeof sitePrice === "number" && Number.isFinite(sitePrice) && sitePrice > 0) {
        return sitePrice;
      }
    }
    const fallbackPrice = selectedProduct.default_price;
    if (typeof fallbackPrice === "number" && Number.isFinite(fallbackPrice) && fallbackPrice > 0) {
      return fallbackPrice;
    }
    return null;
  }, [selectedProduct, siteId]);

  const suggestedRecipeCost = useMemo(() => {
    if (!selectedProduct || !siteId) return null;
    const recipeCost = selectedProduct.site_recipe_costs?.[siteId];
    if (typeof recipeCost === "number" && Number.isFinite(recipeCost) && recipeCost >= 0) {
      return recipeCost;
    }
    return null;
  }, [selectedProduct, siteId]);

  const currentMarginPct = useMemo(() => {
    if (suggestedRecipeCost == null) return null;
    const currentPrice = Number(priceAmount);
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null;
    return ((currentPrice - suggestedRecipeCost) / currentPrice) * 100;
  }, [priceAmount, suggestedRecipeCost]);

  useEffect(() => {
    if (suggestedPrice == null) return;
    const current = Number(priceAmount);
    const currentHasValue = priceAmount.trim().length > 0 && Number.isFinite(current) && current > 0;
    if (currentHasValue) return;
    const suggestedRounded = String(Math.round(suggestedPrice));
    if (priceAmount !== suggestedRounded) {
      setPriceAmount(suggestedRounded);
    }
  }, [priceAmount, suggestedPrice]);


  const submitDisabled = mode === "create" && (!siteId || !productId || selectedProductAlreadyCreated);

  const handleUpload = async (file: File | null) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadStatus("error");
      setUploadMessage("La imagen supera 5 MB. Comprimela o usa una mas liviana.");
      return;
    }
    setUploadStatus("uploading");
    setUploadMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("kind", "catalog-item");
      formData.append("ownerId", initial.id || initial.code || name || "pending");
      const response = await fetch(PRODUCT_UPLOAD_ENDPOINT, {
        method: "POST",
        body: formData,
      });
      const raw = await response.text();
      let payload: Record<string, unknown> | null = null;
      if (raw) {
        try {
          payload = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          payload = null;
        }
      }
      if (!response.ok) {
        const backendError =
          payload && typeof payload === "object" && "error" in payload ? (payload.error as string) : null;
        throw new Error(backendError || raw || "Error subiendo imagen.");
      }
      const nextUrl = payload && typeof payload === "object" && "url" in payload ? (payload.url as string) : "";
      setImageUrl(nextUrl || "");
      setUploadStatus("done");
      setUploadMessage("Imagen cargada.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error subiendo imagen.";
      setUploadStatus("error");
      setUploadMessage(message);
    }
  };

  return (
    <div className="space-y-8">
      <form id={resolvedFormId} action={action} className="space-y-8">
      <input type="hidden" name="id" value={initial.id ?? ""} />
      <input type="hidden" name="code" value={initial.code} />
      <input type="hidden" name="sort_order" value={initial.sort_order} />
      <input type="hidden" name="metadata_extra" value={initial.metadata_extra} />

      <div className="ui-panel space-y-6">
        <div>
          <div className="ui-h3">1. Sede de venta</div>
          <p className="ui-caption">Primero elige la sede; las categorías y productos se filtran con esa seleccion.</p>
        </div>
        <label className="space-y-2">
          <span className="ui-label">Negocio / sede</span>
          <select
            name="site_id"
            className="ui-input"
            value={siteId}
            onChange={(event) => setSiteId(event.target.value)}
            required
          >
            <option value="">Selecciona una sede</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {(site.name ?? site.code ?? "Sin nombre") + (site.is_active === false ? " (inactiva)" : "")}
              </option>
            ))}
          </select>
        </label>
      </div>

      {mode === "create" && commercialCoverage.length > 0 ? (
        <div className="ui-panel space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="ui-h3">Mapa de creación comercial</div>
              <p className="ui-caption">
                Cobertura por satélite: productos operativos vendibles contra items comerciales activos.
              </p>
            </div>
            {selectedSiteCoverage ? (
              <span className={`ui-chip ${selectedSiteCoverage.missing_count === 0 ? "ui-chip--success" : "ui-chip--warn"}`}>
                {selectedSiteCoverage.missing_count === 0
                  ? "Sede completa"
                  : `${selectedSiteCoverage.missing_count} faltantes`}
              </span>
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {commercialCoverage.map((site) => {
              const isCurrentSite = site.site_id === siteId;
              const completion =
                site.total_sellable > 0
                  ? Math.round((site.created_count / site.total_sellable) * 100)
                  : 0;

              return (
                <button
                  key={site.site_id}
                  type="button"
                  className={`rounded-2xl border p-4 text-left transition ${
                    isCurrentSite
                      ? "border-[var(--ui-brand)] bg-[var(--ui-brand-soft)]"
                      : "border-[var(--ui-border)] bg-white hover:bg-[var(--ui-surface-2)]"
                  }`}
                  onClick={() => setSiteId(site.site_id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-[var(--ui-text)]">
                        {site.site_label}
                      </div>
                      <div className="ui-caption mt-1">
                        {site.created_count} de {site.total_sellable} creados
                      </div>
                    </div>
                    <span className={`ui-chip ${site.missing_count === 0 ? "ui-chip--success" : "ui-chip--warn"}`}>
                      {completion}%
                    </span>
                  </div>

                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--ui-surface-2)]">
                    <div
                      className="h-full rounded-full bg-[var(--ui-brand)]"
                      style={{ width: `${Math.min(100, Math.max(0, completion))}%` }}
                    />
                  </div>

                  <div className="mt-3 text-xs font-semibold text-[var(--ui-muted)]">
                    {site.missing_count === 0
                      ? "Todos los vendibles tienen item comercial."
                      : `Faltan ${site.missing_count} productos por crear.`}
                  </div>
                </button>
              );
            })}
          </div>

          {selectedSiteCoverage && selectedSiteCoverage.missing_products.length > 0 ? (
            <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-black text-[var(--ui-text)]">
                    Pendientes en {selectedSiteCoverage.site_label}
                  </div>
                  <p className="ui-caption">
                    Estos son los productos que aparecen en el buscador de creación.
                  </p>
                </div>
                <span className="ui-chip ui-chip--warn">
                  {selectedSiteCoverage.missing_products.length} pendientes
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {selectedSiteCoverage.missing_products.slice(0, 12).map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    className="rounded-xl border border-[var(--ui-border)] bg-white px-3 py-2 text-left transition hover:bg-[var(--ui-surface-2)]"
                    onClick={() => {
                      setProductId(product.id);
                      setProductQuery("");
                      setIsProductPickerOpen(false);
                    }}
                  >
                    <div className="truncate text-xs font-black text-[var(--ui-text)]">
                      {product.name?.trim() || product.sku?.trim() || "Producto sin nombre"}
                    </div>
                    {product.sku ? (
                      <div className="ui-caption mt-0.5 truncate">SKU {product.sku}</div>
                    ) : null}
                  </button>
                ))}
              </div>
              {selectedSiteCoverage.missing_products.length > 12 ? (
                <p className="ui-caption mt-3">
                  Mostrando 12 de {selectedSiteCoverage.missing_products.length}. Usa el buscador para afinar.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="ui-panel space-y-6">
        <div>
          <div className="ui-h3">2. Colección, categoría comercial y producto base</div>
          <p className="ui-caption">
            Selecciona la colección comercial, la sección visible del menú y el producto operacional base habilitado para esta sede.
            Esto no usa categorías operacionales de NEXO ni productos de fidelización.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="space-y-2">
            <span className="ui-label">Colección comercial</span>
            <select
              name="commercial_collection_id"
              className="ui-input"
              value={commercialCollectionId}
              onChange={(event) => setCommercialCollectionId(event.target.value)}
              required={visibleCollections.length > 0}
            >
              <option value="">Selecciona colección comercial</option>
              {visibleCollections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {[
                    collection.name ?? collection.code ?? "Sin nombre",
                    collection.subtitle,
                  ]
                    .filter(Boolean)
                    .join(" · ") + (collection.is_active === false ? " [inactiva]" : "")}
                </option>
              ))}
            </select>
            <p className="ui-caption">
              La colección agrupa temporadas, campañas, menú principal o menús especiales.
            </p>
            {siteId && visibleCollections.length === 0 ? (
              <p className="ui-caption">
                Esta sede no tiene colecciones comerciales. Crea una en Viso &gt; Colecciones comerciales.
              </p>
            ) : null}
          </label>
          <label className="space-y-2">
            <span className="ui-label">Categoría comercial</span>
            <select
              name="commercial_category_id"
              className="ui-input"
              value={commercialCategoryId}
              onChange={(event) => setCommercialCategoryId(event.target.value)}
              required
            >
              <option value="">Selecciona categoría comercial del menú</option>
              {visibleCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {(category.name ?? category.code ?? "Sin nombre") +
                    (category.is_active === false ? " [inactiva]" : "")}
                </option>
              ))}
            </select>
            <input
              name="category_label"
              type="hidden"
              className="ui-input"
              value={selectedCategory?.name ?? categoryLabel}
              readOnly
            />
            <p className="ui-caption">
              Esta categoría es solo para el menú comercial de Pass. No modifica categorías operacionales de NEXO.
            </p>
            {siteId && !commercialCollectionId ? (
              <p className="ui-caption">
                Primero selecciona una colección comercial para cargar sus secciones.
              </p>
            ) : null}

            {siteId && commercialCollectionId && visibleCategories.length === 0 ? (
              <p className="ui-caption">
                Esta colección no tiene secciones asignadas. Ve a Viso &gt; Colecciones comerciales y usa Guardar secciones.
              </p>
            ) : null}
          </label>
          <div className="space-y-2" ref={productPickerRef}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="ui-label">Producto operacional base</span>
              {mode === "create" ? (
                <span className="rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-2.5 py-1 text-[11px] font-bold text-[var(--ui-muted)]">
                  {availableProductCount} disponibles · {alreadyCreatedProductCount} ya creados
                </span>
              ) : null}
            </div>
            <input type="hidden" name="product_id" value={productId} />

            {mode === "create" && alreadyCreatedProductCount > 0 ? (
              <label className="flex items-center gap-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2 text-xs font-semibold text-[var(--ui-muted)]">
                <input
                  type="checkbox"
                  checked={showExistingProducts}
                  onChange={(event) => setShowExistingProducts(event.target.checked)}
                />
                Mostrar productos ya creados en esta sede
              </label>
            ) : null}

            <div className="relative">
              <input
                type="search"
                className="ui-input pr-24"
                value={productQuery}
                onChange={(event) => {
                  setProductQuery(event.target.value);
                  setIsProductPickerOpen(true);
                }}
                onFocus={() => setIsProductPickerOpen(true)}
                placeholder={
                  selectedProduct
                    ? `${getProductDisplayName(selectedProduct)}${selectedProduct.sku ? ` (${selectedProduct.sku})` : ""}`
                    : "Buscar por nombre, SKU o código"
                }
                role="combobox"
                aria-expanded={isProductPickerOpen}
                aria-controls={productPickerListId}
                aria-autocomplete="list"
              />

              {productQuery ? (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-bold text-[var(--ui-brand)] transition hover:bg-[var(--ui-surface-2)]"
                  onClick={() => {
                    setProductQuery("");
                    setIsProductPickerOpen(true);
                  }}
                >
                  Limpiar
                </button>
              ) : null}

              {isProductPickerOpen ? (
                <div
                  id={productPickerListId}
                  role="listbox"
                  className="absolute z-30 mt-2 max-h-80 w-full overflow-auto rounded-2xl border border-[var(--ui-border)] bg-white shadow-[var(--ui-shadow-2)]"
                >
                  {productResults.length > 0 ? (
                    productResults.map((product) => {
                      const isSelected = product.id === productId;
                      const optionPrice = getProductPriceForSite(product, siteId);
                      const alreadyCreated = isProductAlreadyCreatedForSite(product.id, siteId);

                      return (
                        <button
                          key={product.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          aria-disabled={alreadyCreated}
                          disabled={alreadyCreated}
                          className={`block w-full border-b border-[var(--ui-border)] px-3 py-3 text-left last:border-b-0 transition ${
                            alreadyCreated
                              ? "cursor-not-allowed bg-slate-50 opacity-70"
                              : isSelected
                                ? "bg-[var(--ui-surface-2)] hover:bg-[var(--ui-surface-2)]"
                                : "bg-white hover:bg-[var(--ui-surface-2)]"
                          }`}
                          onClick={() => {
                            if (alreadyCreated) return;
                            setProductId(product.id);
                            setProductQuery("");
                            setIsProductPickerOpen(false);
                          }}
                        >
                          <span className="flex items-center gap-2">
                            <span className="block min-w-0 flex-1 truncate text-sm font-black text-[var(--ui-text)]">
                              {getProductDisplayName(product)}
                            </span>
                            {alreadyCreated ? (
                              <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.04em] text-amber-800">
                                Ya creado
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block truncate text-xs font-semibold text-[var(--ui-muted)]">
                            {[
                              product.sku ? `SKU ${product.sku}` : null,
                              optionPrice != null ? `Precio base ${asCop(String(optionPrice))}` : null,
                              alreadyCreated ? "Edita el item existente para esta sede" : null,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "Producto habilitado para esta sede"}
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <div className="px-3 py-4 text-sm font-semibold text-[var(--ui-muted)]">
                      {availableProductCount === 0 && alreadyCreatedProductCount > 0 && !showExistingProducts
                        ? "Todos los productos habilitados para esta sede ya tienen item comercial."
                        : "No hay productos que coincidan con la búsqueda."}
                    </div>
                  )}

                  {hasMoreProductResults ? (
                    <div className="border-t border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2 text-xs font-semibold text-[var(--ui-muted)]">
                      Mostrando {productResults.length} de {matchingProducts.length}. Escribe más para afinar.
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {selectedProduct ? (
              <div className="flex items-start justify-between gap-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-black text-[var(--ui-text)]">
                    {getProductDisplayName(selectedProduct)}
                  </div>
                  <div className="ui-caption mt-1">
                    {[
                      selectedProduct.sku ? `SKU ${selectedProduct.sku}` : null,
                      suggestedPrice != null ? `Precio sugerido ${asCop(String(suggestedPrice))}` : null,
                      suggestedRecipeCost != null ? `Costo receta ${asCop(String(suggestedRecipeCost))}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Producto operacional seleccionado"}
                  </div>
                </div>

                <button
                  type="button"
                  className="ui-btn ui-btn--ghost ui-btn--sm shrink-0"
                  onClick={() => {
                    setProductId("");
                    setProductQuery("");
                    setIsProductPickerOpen(true);
                  }}
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <p className="ui-caption">
                Selecciona el producto operacional que soporta inventario, precio base y receta para este item comercial.
              </p>
            )}

            {siteId && eligibleProducts.length === 0 ? (
              <p className="ui-caption">
                No hay productos operacionales habilitados para crear ítems comerciales en esta sede.
              </p>
            ) : null}

            {siteId && eligibleProducts.length > 0 && availableProductCount === 0 ? (
              <p className="ui-caption">
                Todos los productos operacionales habilitados para esta sede ya tienen item comercial. Activa “Mostrar productos ya creados” para auditarlos.
              </p>
            ) : null}

            {selectedProductAlreadyCreated ? (
              <p className="ui-caption">
                Este producto ya tiene item comercial en la sede seleccionada. Cambia el producto o edita el item existente.
              </p>
            ) : null}
            {selectedProduct && suggestedPrice != null ? (
              <p className="ui-caption">
                El precio sugerido viene de la configuración base de esta sede, pero puedes definir un precio comercial propio.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="ui-panel space-y-6">
        <div>
          <div className="ui-h3">3. Datos del item</div>
          <p className="ui-caption">
            Define cómo verá el cliente este producto en Pass: nombre comercial, descripción, precio e imagen por sede.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="ui-label">Nombre</span>
            <input
              name="name"
              className="ui-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Sandwich de pollo"
              required
            />
          </label>
          <div className="space-y-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
            <div>
              <div className="ui-label">Estado comercial</div>
              <p className="ui-caption">Controla si el item aparece disponible en el menu de compras.</p>
            </div>
            <label className="flex items-center gap-3 text-sm font-semibold text-[var(--ui-text)]">
              <input
                type="checkbox"
                name="is_active"
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
              />
              Item activo
            </label>
          </div>
          <label className="space-y-2 sm:col-span-2">
            <span className="ui-label">Descripción</span>
            <textarea
              name="description"
              className="ui-input min-h-28 py-3"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Pan brioche, pollo apanado, queso y salsa especial."
            />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Precio comercial</span>

            <input type="hidden" name="price_amount" value={priceAmount} />

            <div className="flex overflow-hidden rounded-xl border border-[var(--ui-border)] bg-white focus-within:ring-2 focus-within:ring-[var(--ui-brand)]/20">
              <div className="flex items-center border-r border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 text-sm font-semibold text-[var(--ui-muted)]">
                COP
              </div>
              <input
                type="text"
                inputMode="numeric"
                className="min-h-12 flex-1 bg-white px-4 text-base font-semibold text-[var(--ui-text)] outline-none"
                value={formatCopInput(priceAmount)}
                onChange={(event) => setPriceAmount(onlyDigits(event.target.value))}
                placeholder="$ 22.000"
                required
              />
            </div>

            <p className="ui-caption">
              Escribe el precio en pesos colombianos. Ejemplo: 22000 se mostrará como {asCop("22000")}.
            </p>

            {suggestedPrice != null ? (
              <p className="ui-caption">Precio sugerido para esta sede: {asCop(String(suggestedPrice))}</p>
            ) : null}
            {suggestedRecipeCost != null ? (
              <p className="ui-caption">Costo receta estimado: {asCop(String(suggestedRecipeCost))}</p>
            ) : null}
            {currentMarginPct != null ? (
              <p className="ui-caption">Margen estimado: {currentMarginPct.toFixed(2)}%</p>
            ) : null}
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className="ui-label">Badges (separados por coma)</span>
            <input
              name="badges_csv"
              className="ui-input"
              value={badgesCsv}
              onChange={(event) => setBadgesCsv(event.target.value)}
              placeholder="Popular, Nuevo, Club"
            />
          </label>
          <div className="grid gap-4 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4 sm:col-span-2 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <div className="ui-label">Agrupación visual opcional</div>
              <p className="ui-caption">
                Solo cambia cómo se ve la card en Pass. No descuenta inventario. Sabores, toppings, vaso o cono se configuran después desde la edición del producto.
              </p>
            </div>
            <label className="space-y-2">
              <span className="ui-label">Nombre visual del grupo</span>
              <input
                name="display_group"
                className="ui-input"
                value={displayGroup}
                onChange={(event) => setDisplayGroup(event.target.value)}
                placeholder="Soda Hatsu"
              />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Etiqueta visual de variante</span>
              <input
                name="variant_label"
                className="ui-input"
                value={variantLabel}
                onChange={(event) => setVariantLabel(event.target.value)}
                placeholder="Sandía"
              />
            </label>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <span className="ui-label">Modalidades habilitadas</span>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 text-sm text-[var(--ui-text)]">
                <input
                  type="checkbox"
                  name="fulfillment_delivery"
                  checked={fulfillmentDelivery}
                  onChange={(event) => setFulfillmentDelivery(event.target.checked)}
                />
                Domicilio
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--ui-text)]">
                <input
                  type="checkbox"
                  name="fulfillment_pickup"
                  checked={fulfillmentPickup}
                  onChange={(event) => setFulfillmentPickup(event.target.checked)}
                />
                Recoger
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--ui-text)]">
                <input
                  type="checkbox"
                  name="fulfillment_on_premise"
                  checked={fulfillmentOnPremise}
                  onChange={(event) => setFulfillmentOnPremise(event.target.checked)}
                />
                En sitio
              </label>
            </div>
          </div>
          <div className="space-y-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4 sm:col-span-2">
            <div>
              <div className="ui-label">Visualización en Pass</div>
              <p className="ui-caption">
                Define cómo se presenta este producto en el menú comercial. La opción destacada ocupa más ancho y permite más detalle visual.
              </p>
            </div>

            <input type="hidden" name="pass_card_layout" value={passCardLayout} />
            <input type="hidden" name="opens_detail_modal" value={opensDetailModal ? "true" : "false"} />

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setPassCardLayout("compact")}
                className={`rounded-2xl border p-4 text-left transition ${passCardLayout === "compact"
                    ? "border-[var(--ui-brand)] bg-white shadow-sm"
                    : "border-[var(--ui-border)] bg-white/70"
                  }`}
              >
                <div className="text-sm font-bold text-[var(--ui-text)]">Compacta</div>
                <div className="mt-1 text-xs text-[var(--ui-muted)]">
                  Card vertical en grilla de 2 columnas. Ideal para productos genéricos o de alta rotación.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPassCardLayout("featured")}
                className={`rounded-2xl border p-4 text-left transition ${passCardLayout === "featured"
                    ? "border-[var(--ui-brand)] bg-white shadow-sm"
                    : "border-[var(--ui-border)] bg-white/70"
                  }`}
              >
                <div className="text-sm font-bold text-[var(--ui-text)]">Destacada</div>
                <div className="mt-1 text-xs text-[var(--ui-muted)]">
                  Card horizontal con más protagonismo. Ideal para combos, lanzamientos o productos estratégicos.
                </div>
              </button>
            </div>

            <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
              <label className="flex items-start gap-3 text-sm text-[var(--ui-text)]">
                <input
                  type="checkbox"
                  checked={opensDetailModal}
                  onChange={(event) => setOpensDetailModal(event.target.checked)}
                  className="mt-1"
                />
                <span>
                  <span className="block font-bold">Requiere detalle antes de agregar</span>
                  <span className="mt-1 block text-xs text-[var(--ui-muted)]">
                    Actívalo para productos que deben abrir modal antes de sumarse al pedido, como combos, productos personalizables o items con extras.
                  </span>
                </span>
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm text-[var(--ui-text)]">
              <input
                type="checkbox"
                name="is_featured"
                checked={isFeatured}
                onChange={(event) => setIsFeatured(event.target.checked)}
              />
              Mostrar en destacados
            </label>
          </div>
        </div>
      </div>


      <div className="ui-panel space-y-6">
        <div>
          <div className="ui-h3">4. Imagen comercial</div>
          <p className="ui-caption">
            Foto visible en Pass. Se guarda como imagen comercial separada del producto operacional.
          </p>
        </div>
        <input type="hidden" name="image_url" value={imageUrl} />
        <div className="grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">
          <div className="overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-white">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={getPreviewTitle(name)} className="aspect-square w-full object-cover" />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center bg-[var(--ui-surface-2)] px-4 text-center text-sm font-black text-[var(--ui-muted)]">
                Sin imagen
              </div>
            )}
          </div>
          <div className="space-y-3">
            <label className="block space-y-2">
              <span className="ui-label">{imageUrl ? "Reemplazar imagen" : "Subir imagen comercial"}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="ui-input"
                onChange={(event) => handleUpload(event.target.files?.[0] ?? null)}
              />
            </label>
            <div className="text-sm font-semibold text-[var(--ui-muted)]">
              {uploadStatus === "uploading" ? "Subiendo imagen..." : uploadMessage || "JPG, PNG o WebP. Máximo 5 MB."}
            </div>
            {imageUrl ? (
              <button type="button" className="ui-btn ui-btn--ghost" onClick={() => setImageUrl("")}>
                Quitar imagen
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="ui-panel space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="ui-h3">Vista en vivo en Pass</div>
            <p className="ui-caption">
              Esta vista cambia mientras editas. Úsala para validar si cualquier persona entendería qué está comprando el cliente.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`ui-chip ${isActive ? "ui-chip--success" : ""}`}>
              {isActive ? "Publicado" : "Oculto"}
            </span>
            <span className="ui-chip">{passCardLayout === "featured" ? "Destacada" : "Compacta"}</span>
            <span className={`ui-chip ${opensDetailModal ? "ui-chip--success" : ""}`}>
              {opensDetailModal ? "Abre modal" : "Agregado directo"}
            </span>
          </div>
        </div>

        <div className="max-w-md overflow-hidden rounded-[28px] border border-[var(--ui-border)] bg-[#FFFDF7] shadow-[var(--ui-shadow-2)]">
          <div className="relative h-56 w-full bg-[var(--ui-surface-2)]">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={getPreviewTitle(name)} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-black text-[var(--ui-muted)]">
                Sin imagen comercial
              </div>
            )}
            <div className="absolute right-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-black text-[var(--ui-text)] shadow">
              {asCop(priceAmount)}
            </div>
          </div>

          <div className="space-y-4 p-5">
            <div>
              <div className="text-2xl font-black leading-tight text-[var(--ui-text)]">{getPreviewTitle(name)}</div>
              {displayGroup || variantLabel ? (
                <div className="mt-1 text-sm font-bold text-[var(--ui-muted)]">
                  {[displayGroup, variantLabel].filter(Boolean).join(" · ")}
                </div>
              ) : null}
              <div className="ui-caption mt-1">{siteLabel}</div>
            </div>

            <div className="flex flex-wrap gap-2">
              {selectedCollection ? (
                <span className="ui-chip ui-chip--brand">
                  {selectedCollection.name ?? selectedCollection.code ?? "Colección"}
                </span>
              ) : null}
              <span className="ui-chip">
                {getPreviewCategory(selectedCategory?.name ?? selectedCategory?.code ?? categoryLabel)}
              </span>
              {liveFulfillmentLabels.map((label) => (
                <span key={label} className="ui-chip">{label}</span>
              ))}
              {liveBadges.map((badge) => (
                <span key={badge} className="ui-chip ui-chip--brand">{badge}</span>
              ))}
            </div>

            <p className="ui-body-muted text-sm leading-5">
              {description.trim() || "Descripción del producto comercial que vera el usuario al comprar."}
            </p>

            <div className="rounded-full bg-[var(--ui-brand)] px-4 py-3 text-center text-sm font-black text-white">
              {opensDetailModal ? `Ver detalle · desde ${asCop(priceAmount)}` : "Agregar al pedido"}
            </div>
          </div>
        </div>
      </div>

      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
        <div className="flex flex-wrap items-center gap-2">
          {secondaryActions}
        </div>

        <button type="submit" form={resolvedFormId} className="ui-btn ui-btn--brand" disabled={submitDisabled}>
          {mode === "create" ? "Crear item" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
