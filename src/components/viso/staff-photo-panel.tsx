"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

const PHOTO_BUCKET = "employee-photos";
const STAFF_PHOTO_STORAGE_PREFIX = "staff";
const STAFF_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

const PHOTO_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

type StaffPhotoPanelProps = {
  employeeId: string;
  employeeName: string | null;
  photoUrl: string | null;
  canEditPhoto: boolean;
  uploadPhotoAction: (formData: FormData) => Promise<void>;
};

function getPhotoMimeAndExtension(file: File) {
  const mime = file.type.trim().toLowerCase();
  const extension = PHOTO_MIME_EXTENSIONS[mime];

  if (!extension) {
    return { mime: "", extension: "" };
  }

  return { mime, extension };
}

function getUploadNonce() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2);
}

export function StaffPhotoPanel({
  employeeId,
  employeeName,
  photoUrl,
  canEditPhoto,
  uploadPhotoAction,
}: StaffPhotoPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsUploading(false);
      setUploadError("");

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [photoUrl]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    setUploadError("");

    if (!form.reportValidity()) return;

    const file = fileInputRef.current?.files?.[0] ?? null;

    if (!file) {
      setUploadError("Selecciona una imagen.");
      return;
    }

    const { mime, extension } = getPhotoMimeAndExtension(file);

    if (!mime || !extension) {
      setUploadError("Solo se permiten JPG, PNG o WebP.");
      return;
    }

    if (file.size <= 0) {
      setUploadError("La foto está vacía.");
      return;
    }

    if (file.size > STAFF_PHOTO_MAX_BYTES) {
      setUploadError("La foto supera 5 MB.");
      return;
    }

    setIsUploading(true);

    const storagePath = `${STAFF_PHOTO_STORAGE_PREFIX}/${employeeId}/${Date.now()}_${getUploadNonce()}.${extension}`;
    const supabase = createClient();

    const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(storagePath, file, {
      contentType: mime,
      cacheControl: "3600",
      upsert: false,
    });

    if (uploadError) {
      setIsUploading(false);
      setUploadError(`Error al subir la foto: ${uploadError.message}`);
      return;
    }

    const metadataFormData = new FormData();
    metadataFormData.set("employee_id", employeeId);
    metadataFormData.set("storage_path", storagePath);
    metadataFormData.set("file_size_bytes", String(file.size));
    metadataFormData.set("file_mime", mime);

    await uploadPhotoAction(metadataFormData);

    setIsUploading(false);
  }

  return (
    <div className="ui-panel ui-panel--accent-brand space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="ui-h3">Foto oficial</h3>
          <p className="ui-caption mt-1">Se usa para el perfil y el carnet laboral del trabajador.</p>
        </div>
        <div className="h-24 w-24 overflow-hidden rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)]">
          {photoUrl ? (
            <Image
              src={photoUrl}
              alt={employeeName ? `Foto de ${employeeName}` : "Foto del trabajador"}
              width={96}
              height={96}
              unoptimized
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-[var(--ui-muted)]">
              Sin foto
            </div>
          )}
        </div>
      </div>

      {canEditPhoto ? (
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="employee_id" value={employeeId} />

          {uploadError ? <div className="ui-alert ui-alert--error w-full">{uploadError}</div> : null}

          <label className="min-w-[260px] flex-1 space-y-1">
            <span className="ui-label block">Subir foto</span>
            <input
              ref={fileInputRef}
              type="file"
              name="file"
              accept="image/jpeg,image/png,image/webp"
              className="ui-input w-full"
              disabled={isUploading}
              required
            />
            <span className="ui-caption block">Formatos permitidos: JPG, PNG o WebP. Máximo 5 MB.</span>
          </label>

          <button type="submit" className="ui-btn ui-btn--brand" disabled={isUploading}>
            {isUploading ? "Subiendo..." : "Guardar foto"}
          </button>
        </form>
      ) : (
        <p className="ui-caption">No tienes permiso para cambiar la foto oficial.</p>
      )}
    </div>
  );
}