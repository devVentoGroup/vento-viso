"use client";

import { useMemo, useState } from "react";

type SiteOption = {
  id: string;
  code: string | null;
  name: string | null;
  is_active?: boolean | null;
};

type ProductFormValues = {
  id?: string;
  code: string;
  name: string;
  description: string;
  points_cost: number;
  is_active: boolean;
  site_id: string;
  category: string;
  image_url: string;
  metadata_extra: string;
};

type ProductFormProps = {
  mode: "create" | "edit";
  sites: SiteOption[];
  initial: ProductFormValues;
  action: (formData: FormData) => void | Promise<void>;
};

const PRODUCT_UPLOAD_ENDPOINT = "/api/viso/upload-product-image";

function getPreviewTitle(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "Producto";
  return trimmed;
}

function getPreviewCategory(category: string) {
  const trimmed = category.trim();
  return trimmed || "General";
}

export function ProductForm({ mode, sites, initial, action }: ProductFormProps) {
  const [code, setCode] = useState(initial.code);
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [pointsCost, setPointsCost] = useState(String(initial.points_cost || 100));
  const [siteId, setSiteId] = useState(initial.site_id || sites[0]?.id || "");
  const [category, setCategory] = useState(initial.category);
  const [imageUrl, setImageUrl] = useState(initial.image_url);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [uploadMessage, setUploadMessage] = useState("");

  const siteLabel = useMemo(() => {
    const selected = sites.find((site) => site.id === siteId);
    if (!selected) return "Sin sede";
    return selected.name ?? selected.code ?? "Sin sede";
  }, [sites, siteId]);

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
        <div className="ui-h3">Datos del producto</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="ui-label">Codigo</span>
            <input
              name="code"
              className="ui-input"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="molka_combo_01"
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
              placeholder="Combo brunch"
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
              placeholder="Incluye cafe filtrado y pastry del dia"
            />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Costo en puntos</span>
            <input
              name="points_cost"
              type="number"
              min={1}
              className="ui-input"
              value={pointsCost}
              onChange={(event) => setPointsCost(event.target.value)}
              required
            />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Categoria</span>
            <input
              name="category"
              className="ui-input"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder="Bebidas"
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
          <label className="flex items-center gap-2 text-sm text-[var(--ui-text)] sm:col-span-2">
            <input type="checkbox" name="is_active" defaultChecked={initial.is_active} />
            Producto activo
          </label>
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
              placeholder='{"note":"solo en horario PM"}'
            />
          </label>
        </div>
      </div>

      <div className="ui-panel space-y-4">
        <div className="ui-h3">Previsualizacion</div>
        <div className="max-w-md overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-white shadow-[var(--ui-shadow-1)]">
          <div className="h-40 w-full bg-[var(--ui-surface-2)]">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={getPreviewTitle(name)} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-[var(--ui-muted)]">
                Sin imagen
              </div>
            )}
          </div>
          <div className="space-y-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-[var(--ui-text)]">{getPreviewTitle(name)}</div>
                <div className="ui-caption">{siteLabel}</div>
              </div>
              <span className="ui-chip ui-chip--brand">{pointsCost || "0"} pts</span>
            </div>
            <div className="ui-caption">{getPreviewCategory(category)}</div>
            <p className="ui-body-muted text-sm">
              {description.trim() || "Descripcion del producto para los usuarios de Vento Pass."}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" className="ui-btn ui-btn--brand">
          {mode === "create" ? "Crear producto" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
