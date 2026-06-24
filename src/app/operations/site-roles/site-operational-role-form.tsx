"use client";

import { useMemo, useState } from "react";

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
};

export function SiteOperationalRoleForm({
  sites,
  areas,
  catalog,
  action,
}: SiteOperationalRoleFormProps) {
  const [selectedSiteId, setSelectedSiteId] = useState("");

  const filteredAreas = useMemo(
    () => areas.filter((area) => area.siteId === selectedSiteId),
    [areas, selectedSiteId],
  );

  return (
    <form action={action} className="space-y-4">
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
          defaultValue=""
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
        <p className="text-xs leading-5 text-slate-500">
          Primero selecciona la sede. Luego solo verás las áreas que pertenecen
          a esa sede.
        </p>
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium text-slate-700">
          Rol operativo aprobado
        </span>
        <select name="role_code" className="ui-input" required defaultValue="">
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
          <input name="is_default" type="checkbox" className="h-4 w-4" />
          <span className="text-sm font-medium text-slate-700">
            Rol por defecto
          </span>
        </label>

        <label className="flex items-center gap-2">
          <input
            name="is_active"
            type="checkbox"
            defaultChecked
            className="h-4 w-4"
          />
          <span className="text-sm font-medium text-slate-700">Activo</span>
        </label>
      </div>

      <button type="submit" className="ui-btn ui-btn--brand">
        Guardar en matriz
      </button>
    </form>
  );
}
