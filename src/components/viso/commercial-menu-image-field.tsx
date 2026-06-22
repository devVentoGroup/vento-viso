"use client";

import { useState } from "react";

type CommercialMenuImageFieldProps = {
  initialUrl: string | null;
  ownerId: string;
  label?: string;
};

const PRODUCT_UPLOAD_ENDPOINT = "/api/viso/upload-commercial-menu-image";
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export function CommercialMenuImageField({
  initialUrl,
  ownerId,
  label = "Imagen comercial",
}: CommercialMenuImageFieldProps) {
  const [imageUrl, setImageUrl] = useState(initialUrl ?? "");
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [uploadMessage, setUploadMessage] = useState("");
  const [imagePreviewFailed, setImagePreviewFailed] = useState(false);

  async function handleUpload(file: File | null) {
    if (!file) return;

    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadStatus("error");
      setUploadMessage("La imagen supera 5 MB. Comprimela o usa una más liviana.");
      return;
    }

    setUploadStatus("uploading");
    setUploadMessage("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("kind", "catalog-item");
      formData.append("ownerId", ownerId || "pending");

      const response = await fetch(PRODUCT_UPLOAD_ENDPOINT, {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;

      if (!response.ok || !data?.url) {
        throw new Error(data?.error || "No se pudo subir la imagen.");
      }

      setImageUrl(data.url);
      setImagePreviewFailed(false);
      setUploadStatus("done");
      setUploadMessage("Imagen cargada. Guarda el producto para aplicar el cambio.");
    } catch (error) {
      setUploadStatus("error");
      setUploadMessage(error instanceof Error ? error.message : "No se pudo subir la imagen.");
    }
  }

  return (
    <div className="space-y-3 lg:col-span-3">
      <input type="hidden" name="image_url" value={imageUrl} />

      <div className="grid gap-4 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4 sm:grid-cols-[180px_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-white">
          {imageUrl && !imagePreviewFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={label}
              className="aspect-square w-full object-cover"
              onError={() => setImagePreviewFailed(true)}
            />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center bg-white px-4 text-center text-sm font-black text-[var(--ui-muted)]">
              {imageUrl ? "No se pudo cargar la imagen" : "Sin imagen"}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <label className="block space-y-2">
            <span className="ui-label">{imageUrl ? "Reemplazar imagen comercial" : "Subir imagen comercial"}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="ui-input"
              disabled={uploadStatus === "uploading"}
              onChange={(event) => void handleUpload(event.target.files?.[0] ?? null)}
            />
          </label>

          <label className="block space-y-2">
            <span className="ui-caption">URL manual opcional</span>
            <input
              className="ui-input"
              value={imageUrl}
              onChange={(event) => {
                setImageUrl(event.target.value);
                setImagePreviewFailed(false);
                setUploadStatus("idle");
                setUploadMessage("");
              }}
              placeholder="https://..."
            />
          </label>

          <div className={`text-sm font-semibold ${uploadStatus === "error" ? "text-[var(--ui-danger)]" : "text-[var(--ui-muted)]"}`}>
            {uploadStatus === "uploading" ? "Subiendo imagen..." : uploadMessage || "JPG, PNG o WebP. Máximo 5 MB."}
          </div>

          {imageUrl ? (
            <button
              type="button"
              className="ui-btn ui-btn--ghost"
              onClick={() => {
                setImageUrl("");
                setImagePreviewFailed(false);
                setUploadStatus("idle");
                setUploadMessage("Imagen quitada. Guarda el producto para aplicar el cambio.");
              }}
            >
              Quitar imagen
            </button>
          ) : null}
          {imagePreviewFailed ? (
            <div className="text-sm font-semibold text-[var(--ui-danger)]">
              La URL se guardó, pero Storage no la está sirviendo para vista previa.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
