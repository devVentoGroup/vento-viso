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
  initial: MenuItemFormValues;
  action: (formData: FormData) => void | Promise<void>;
};

const PRODUCT_UPLOAD_ENDPOINT = "/api/viso/upload-product-image";

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

export function MenuItemForm({ mode, sites, products, initial, action }: MenuItemFormProps) {
  const [code, setCode] = useState(initial.code);
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [productId, setProductId] = useState(initial.product_id);
  const [priceAmount, setPriceAmount] = useState(initial.price_amount);
  const [compareAtAmount, setCompareAtAmount] = useState(initial.compare_at_amount);
  const [sortOrder, setSortOrder] = useState(initial.sort_order);
  const [siteId, setSiteId] = useState(initial.site_id || sites[0]?.id || "");
  const [categoryLabel, setCategoryLabel] = useState(initial.category_label);
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
    setUploadStatus("uploading");
    setUploadMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (code) {
        formData.append("code", code);
      }
      const response = await fetch(PRODUCT_UPLOAD_ENDPOINT, {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Error subiendo imagen.");
      }
      setImageUrl(payload.url || "");
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

      <div className="ui-panel space-y-6">
        <div className="ui-h3">Datos del item</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="ui-label">Codigo</span>
            <input
              name="code"
              className="ui-input"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="saudo-sandwich-pollo"
              required
            />
          </label>
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
            <span className="ui-label">Precio</span>
            <input
              name="price_amount"
              type="number"
              min={0}
              step="100"
              className="ui-input"
              value={priceAmount}
              onChange={(event) => setPriceAmount(event.target.value)}
              required
            />
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
            <input
              name="compare_at_amount"
              type="number"
              min={0}
              step="100"
              className="ui-input"
              value={compareAtAmount}
              onChange={(event) => setCompareAtAmount(event.target.value)}
              placeholder="0"
            />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Categoria visible</span>
            <input
              name="category_label"
              className="ui-input"
              value={categoryLabel}
              onChange={(event) => setCategoryLabel(event.target.value)}
              placeholder="Sandwiches"
            />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Producto core (venta)</span>
            <select
              name="product_id"
              className="ui-input"
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
              required
            >
              <option value="">Selecciona producto de venta</option>
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
                No hay productos de venta habilitados para esta sede.
              </p>
            ) : null}
            {selectedProduct && suggestedPrice != null ? (
              <p className="ui-caption">
                El precio sugerido se toma del producto maestro para esta sede.
              </p>
            ) : null}
          </label>
          <label className="space-y-2">
            <span className="ui-label">Orden</span>
            <input
              name="sort_order"
              type="number"
              className="ui-input"
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
            />
          </label>
          <label className="space-y-2 sm:col-span-2">
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
              <input type="checkbox" name="is_active" defaultChecked={initial.is_active} />
              Item activo
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--ui-text)]">
              <input type="checkbox" name="is_featured" defaultChecked={initial.is_featured} />
              Mostrar en destacados
            </label>
          </div>
        </div>
      </div>

      <div className="ui-panel space-y-6">
        <div className="ui-h3">Imagen y metadata</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 sm:col-span-2">
            <span className="ui-label">Imagen URL</span>
            <input
              name="image_url"
              className="ui-input"
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              placeholder="https://..."
            />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Subir imagen</span>
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
          <label className="space-y-2 sm:col-span-2">
            <span className="ui-label">Metadata extra (JSON opcional)</span>
            <textarea
              name="metadata_extra"
              className="ui-input min-h-28 py-3"
              defaultValue={initial.metadata_extra}
              placeholder='{"spicy_level":"medio"}'
            />
          </label>
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
              <span className="ui-chip">{getPreviewCategory(categoryLabel)}</span>
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
