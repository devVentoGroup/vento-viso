"use client";

import { useEffect, useMemo, useState } from "react";

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
};

type MenuItemFormProps = {
  mode: "create" | "edit";
  sites: SiteOption[];
  products: ProductOption[];
  categories: CommercialCategoryOption[];
  collections?: CommercialCollectionOption[];
  collectionCategoryLinks?: CollectionCategoryLinkOption[];
  initial: MenuItemFormValues;
  action: (formData: FormData) => void | Promise<void>;
};

const PRODUCT_UPLOAD_ENDPOINT = "/api/viso/upload-product-image";
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function getPreviewTitle(name: string) {
  const trimmed = name.trim();
  return trimmed || "Producto del menu";
}

function getPreviewCategory(category: string) {
  const trimmed = category.trim();
  return trimmed || "Categoria general";
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

export function MenuItemForm({
  mode,
  sites,
  products,
  categories,
  collections = [],
  collectionCategoryLinks,
  initial,
  action,
}: MenuItemFormProps) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [productId, setProductId] = useState(initial.product_id);
  const [priceAmount, setPriceAmount] = useState(initial.price_amount);
  const [compareAtAmount, setCompareAtAmount] = useState(initial.compare_at_amount);
  const [siteId, setSiteId] = useState(initial.site_id || sites[0]?.id || "");
  const [commercialCollectionId, setCommercialCollectionId] = useState(
    initial.commercial_collection_id ?? "",
  );
  const [commercialCategoryId, setCommercialCategoryId] = useState(initial.commercial_category_id);
  const [categoryLabel] = useState(initial.category_label);
  const [badgesCsv, setBadgesCsv] = useState(initial.badges_csv);
  const [imageUrl, setImageUrl] = useState(initial.image_url);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [uploadMessage, setUploadMessage] = useState("");

  const siteLabel = useMemo(() => {
    const selected = sites.find((site) => site.id === siteId);
    if (!selected) return "Sin sede";
    return selected.name ?? selected.code ?? "Sin sede";
  }, [sites, siteId]);

  const visibleProducts = useMemo(() => {
    return products.filter((product) => {
      if (product.is_active === false) return false;
      const siteIds = product.site_ids || [];
      if (!siteId) return true;
      return siteIds.includes(siteId);
    });
  }, [products, siteId]);

  const selectedProduct = useMemo(() => {
    return visibleProducts.find((product) => product.id === productId) ?? null;
  }, [visibleProducts, productId]);

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
    const stillValid = visibleProducts.some((product) => product.id === productId);
    if (!stillValid) setProductId("");
  }, [productId, visibleProducts]);

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
    <form action={action} className="space-y-8">
      <input type="hidden" name="id" value={initial.id ?? ""} />
      <input type="hidden" name="code" value={initial.code} />
      <input type="hidden" name="sort_order" value={initial.sort_order} />
      <input type="hidden" name="metadata_extra" value={initial.metadata_extra} />

      <div className="ui-panel space-y-6">
        <div>
          <div className="ui-h3">1. Sede de venta</div>
          <p className="ui-caption">Primero elige la sede; las categorias y productos se filtran con esa seleccion.</p>
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
            <span className="ui-label">Categoria comercial</span>
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
          <label className="space-y-2">
            <span className="ui-label">Producto operacional base</span>
            <select
              name="product_id"
              className="ui-input"
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
              required
            >
              <option value="">Selecciona producto operacional habilitado</option>
              {visibleProducts.map((product) => (
                <option key={product.id} value={product.id}>
                  {(product.name ?? "Sin nombre") +
                    (product.sku ? ` (${product.sku})` : "") +
                    (product.is_active === false ? " [inactivo]" : "")}
                </option>
              ))}
            </select>
            {siteId && visibleProducts.length === 0 ? (
              <p className="ui-caption">
                No hay productos operacionales habilitados para crear ítems comerciales en esta sede.
              </p>
            ) : null}
            {selectedProduct && suggestedPrice != null ? (
              <p className="ui-caption">
                El precio sugerido viene de la configuración base de esta sede, pero puedes definir un precio comercial propio.
              </p>
            ) : null}
          </label>
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
              <input type="checkbox" name="is_active" defaultChecked={initial.is_active} />
              Item activo
            </label>
          </div>
          <label className="space-y-2 sm:col-span-2">
            <span className="ui-label">Descripcion</span>
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
          <label className="space-y-2">
            <span className="ui-label">Precio tachado (opcional)</span>

            <input type="hidden" name="compare_at_amount" value={compareAtAmount} />

            <div className="flex overflow-hidden rounded-xl border border-[var(--ui-border)] bg-white focus-within:ring-2 focus-within:ring-[var(--ui-brand)]/20">
              <div className="flex items-center border-r border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 text-sm font-semibold text-[var(--ui-muted)]">
                COP
              </div>
              <input
                type="text"
                inputMode="numeric"
                className="min-h-12 flex-1 bg-white px-4 text-base text-[var(--ui-text)] outline-none"
                value={formatCopInput(compareAtAmount)}
                onChange={(event) => setCompareAtAmount(onlyDigits(event.target.value))}
                placeholder="$ 0"
              />
            </div>

            <p className="ui-caption">
              Úsalo solo si quieres mostrar un precio anterior tachado.
            </p>
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
          <div className="space-y-2 sm:col-span-2">
            <span className="ui-label">Modalidades habilitadas</span>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 text-sm text-[var(--ui-text)]">
                <input type="checkbox" name="fulfillment_delivery" defaultChecked={initial.fulfillment_delivery} />
                Domicilio
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--ui-text)]">
                <input type="checkbox" name="fulfillment_pickup" defaultChecked={initial.fulfillment_pickup} />
                Recoger
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--ui-text)]">
                <input type="checkbox" name="fulfillment_on_premise" defaultChecked={initial.fulfillment_on_premise} />
                En sitio
              </label>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm text-[var(--ui-text)]">
              <input type="checkbox" name="is_featured" defaultChecked={initial.is_featured} />
              Mostrar en destacados
            </label>
          </div>
        </div>
      </div>

      <div className="ui-panel space-y-6">
        <div>
          <div className="ui-h3">Imagen comercial</div>
          <p className="ui-caption">
            La metadata técnica del ítem se genera automáticamente desde la sede, colección, categoría y producto base.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 sm:col-span-2">
            <span className="ui-label">Imagen comercial URL</span>
            <input
              name="image_url"
              className="ui-input"
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              placeholder="https://..."
            />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Subir imagen comercial</span>
            <input
              type="file"
              accept="image/*"
              className="ui-input"
              onChange={(event) => handleUpload(event.target.files?.[0] ?? null)}
            />
          </label>
          <div className="flex items-center text-sm">
            {uploadStatus === "uploading" ? "Subiendo imagen..." : uploadMessage}
          </div>
        </div>
      </div>

      <div className="ui-panel space-y-4">
        <div className="ui-h3">Previsualizacion</div>
        <div className="max-w-md overflow-hidden rounded-3xl border border-[var(--ui-border)] bg-white shadow-[var(--ui-shadow-1)]">
          <div className="h-48 w-full bg-[var(--ui-surface-2)]">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={getPreviewTitle(name)} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-[var(--ui-muted)]">
                Sin imagen
              </div>
            )}
          </div>
          <div className="space-y-3 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-[var(--ui-text)]">{getPreviewTitle(name)}</div>
                <div className="ui-caption">{siteLabel}</div>
              </div>
              <div className="text-right">
                <div className="text-base font-semibold text-[var(--ui-text)]">{asCop(priceAmount)}</div>
                {compareAtAmount ? (
                  <div className="ui-caption line-through">{asCop(compareAtAmount)}</div>
                ) : null}
              </div>
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
              {badgesCsv
                .split(",")
                .map((badge) => badge.trim())
                .filter(Boolean)
                .slice(0, 2)
                .map((badge) => (
                  <span key={badge} className="ui-chip ui-chip--brand">{badge}</span>
                ))}
            </div>
            <p className="ui-body-muted text-sm">
              {description.trim() || "Descripcion del producto comercial que vera el usuario al comprar."}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" className="ui-btn ui-btn--brand">
          {mode === "create" ? "Crear item" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
