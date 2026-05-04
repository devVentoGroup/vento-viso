"use client";

import Image from "next/image";

type StaffPhotoPanelProps = {
  employeeId: string;
  employeeName: string | null;
  photoUrl: string | null;
  canEditPhoto: boolean;
  uploadPhotoAction: (formData: FormData) => Promise<void>;
};

export function StaffPhotoPanel({
  employeeId,
  employeeName,
  photoUrl,
  canEditPhoto,
  uploadPhotoAction,
}: StaffPhotoPanelProps) {
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
        <form action={uploadPhotoAction} encType="multipart/form-data" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="employee_id" value={employeeId} />
          <label className="min-w-[260px] flex-1 space-y-1">
            <span className="ui-label block">Subir foto</span>
            <input
              type="file"
              name="file"
              accept="image/jpeg,image/png,image/webp"
              className="ui-input w-full"
              required
            />
          </label>
          <button type="submit" className="ui-btn ui-btn--brand">
            Guardar foto
          </button>
        </form>
      ) : (
        <p className="ui-caption">No tienes permiso para cambiar la foto oficial.</p>
      )}
    </div>
  );
}
