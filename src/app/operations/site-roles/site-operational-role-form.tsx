"use client";

import { useEffect, useMemo, useState } from "react";

type SiteOption = {
  id: string;
  label: string;
  code: string;
  kind: string;
};

type AreaOption = {
  id: string;
  siteId: string;
  label: string;
  kind: string;
};

type OperationalRoleOption = {
  code: string;
  label: string;
  family: string;
  requiresExternal: boolean;
};

type SiteOperationalRoleFormProps = {
  sites: SiteOption[];
  areas: AreaOption[];
  catalog: OperationalRoleOption[];
  action: (formData: FormData) => void | Promise<void>;
  initialValues?: {
    id?: string;
    siteId?: string;
    areaId?: string;
    roleCode?: string;
    isDefault?: boolean;
    isActive?: boolean;
  };
  submitLabel?: string;
  compact?: boolean;
};

export function SiteOperationalRoleForm({
  sites,
  areas,
  catalog,
  action,
  initialValues,
  submitLabel = "Guardar en matriz",
  compact = false,
}: SiteOperationalRoleFormProps) {
  const [selectedSiteId, setSelectedSiteId] = useState(initialValues?.siteId ?? "");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSelectedSiteId(initialValues?.siteId ?? "");
    }, 0);

    return () => window.clearTimeout(timer);
  }, [initialValues?.siteId]);

  const filteredAreas = useMemo(
    () => areas.filter((area) => area.siteId === selectedSiteId),
    [areas, selectedSiteId],
  );

  return (
    <form action={action} className="space-y-4">
      {initialValues?.id ? (
        <input type="hidden" name="matrix_id" value={initialValues.id} />
      ) : null}

      <label className="space-y-1">
        <span className="text-sm font-medium text-slate-700">
          Sede operativa
        </span>
        <select
          name="site_id"
          className="ui-input"
          required
          value={selectedSiteId}
          onChange={(event) => setSelectedSiteId(event.target.value)}
        >
          <option value="" disabled>
            Selecciona una sede
          </option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.label}
              {site.code ? ` · ${site.code}` : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium text-slate-700">
          Área, opcional
        </span>
        <select
          key={selectedSiteId || "no-site"}
          name="area_id"
          className="ui-input"
          defaultValue={initialValues?.areaId ?? ""}
          disabled={!selectedSiteId}
        >
          <option value="">General de la sede</option>
          {filteredAreas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.label}
              {area.kind ? ` · ${area.kind}` : ""}
            </option>
          ))}
        </select>
        {!compact ? (
          <p className="text-xs leading-5 text-slate-500">
            Primero selecciona la sede. Luego solo verás las áreas que pertenecen
            a esa sede.
          </p>
        ) : null}
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium text-slate-700">
          Rol operativo aprobado
        </span>
        <select
          name="role_code"
          className="ui-input"
          required
          defaultValue={initialValues?.roleCode ?? ""}
        >
          <option value="" disabled>
            Selecciona un rol del catálogo
          </option>
          {catalog.map((role) => (
            <option key={role.code} value={role.code}>
              {role.label}
              {role.family ? ` · ${role.family}` : ""}
              {role.requiresExternal ? " · requiere punto externo" : ""}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2">
          <input
            name="is_default"
            type="checkbox"
            defaultChecked={initialValues?.isDefault ?? false}
            className="h-4 w-4"
          />
          <span className="text-sm font-medium text-slate-700">
            Rol por defecto
          </span>
        </label>

        <label className="flex items-center gap-2">
          <input
            name="is_active"
            type="checkbox"
            defaultChecked={initialValues?.isActive ?? true}
            className="h-4 w-4"
          />
          <span className="text-sm font-medium text-slate-700">Activo</span>
        </label>
      </div>

      {!compact ? (
        <p className="text-xs leading-5 text-slate-500">
          Marca rol por defecto cuando VISO deba proponerlo automáticamente en horarios. Si una sede o área tiene varios roles sin default, el horario pedirá selección manual.
        </p>
      ) : null}

      <button type="submit" className="ui-btn ui-btn--brand">
        {submitLabel}
      </button>
    </form>
  );
}

type DeleteSiteOperationalRoleFormProps = {
  id: string;
  label: string;
  action: (formData: FormData) => void | Promise<void>;
};

export function DeleteSiteOperationalRoleForm({
  id,
  label,
  action,
}: DeleteSiteOperationalRoleFormProps) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(`¿Eliminar ${label}? Esta regla dejará de estar disponible para nuevos horarios.`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="matrix_id" value={id} />
      <button type="submit" className="ui-btn ui-btn--ghost ui-btn--sm text-red-700">
        Eliminar
      </button>
    </form>
  );
}