"use client";

import { useMemo, useState } from "react";

type AreaOption = {
  id: string;
  name: string | null;
  code: string | null;
  kind: string | null;
};

type Props = {
  siteId: string;
  siteCode: string;
  areas: AreaOption[];
  createAreaAction: (formData: FormData) => void | Promise<void>;
  createLocationAction: (formData: FormData) => void | Promise<void>;
};

const AREA_KIND_OPTIONS = [
  { value: "cocina", label: "Cocina / producción", suggestedCode: "COC" },
  { value: "bodega", label: "Bodega / almacenamiento", suggestedCode: "BOD" },
  { value: "bar", label: "Barra", suggestedCode: "BAR" },
  { value: "mostrador", label: "Mostrador", suggestedCode: "MOS" },
  { value: "admin", label: "Administrativa", suggestedCode: "ADM" },
] as const;

const LOCATION_TYPE_OPTIONS = [
  { value: "storage", label: "Almacenamiento", suffix: "ALM", zone: "BOD" },
  { value: "production", label: "Producción", suffix: "PROD", zone: "PROD" },
  { value: "picking", label: "Operación / picking", suffix: "PICK", zone: "PICK" },
  { value: "receiving", label: "Recepción", suffix: "REC", zone: "REC" },
  { value: "staging", label: "Alistamiento / despacho", suffix: "DESP", zone: "DESP" },
] as const;

function cleanCode(value: string, fallback = "") {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 16);
  return normalized || fallback;
}

export function SiteStructureCreateForms({
  siteId,
  siteCode,
  areas,
  createAreaAction,
  createLocationAction,
}: Props) {
  const [areaName, setAreaName] = useState("");
  const [areaKind, setAreaKind] = useState("cocina");
  const [areaCode, setAreaCode] = useState("COC");

  const activeAreas = useMemo(() => areas, [areas]);
  const [locationAreaId, setLocationAreaId] = useState(activeAreas[0]?.id ?? "");
  const [locationName, setLocationName] = useState("");
  const [locationType, setLocationType] = useState("storage");
  const [identifier, setIdentifier] = useState("ALM");
  const [zone, setZone] = useState("BOD");
  const [aisle, setAisle] = useState("MAIN");
  const [level, setLevel] = useState("");

  const selectedArea = activeAreas.find((area) => area.id === locationAreaId) ?? activeAreas[0] ?? null;
  const normalizedSiteCode = cleanCode(siteCode, "SITE");
  const normalizedAreaCode = cleanCode(selectedArea?.code || selectedArea?.name || "AREA", "AREA");
  const normalizedIdentifier = cleanCode(identifier, "LOC");
  const generatedLocationCode = `LOC-${normalizedSiteCode}-${normalizedAreaCode}-${normalizedIdentifier}`;

  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <form action={createAreaAction} className="ui-panel space-y-4">
        <input type="hidden" name="site_id" value={siteId} />
        <div>
          <div className="ui-h3">Nueva área funcional</div>
          <p className="ui-caption mt-1">Crea primero la división operativa: Panadería, Repostería, Barra, Bodega, etc.</p>
        </div>

        <label className="grid gap-1">
          <span className="ui-label">Nombre del área</span>
          <input
            name="name"
            value={areaName}
            onChange={(event) => setAreaName(event.target.value)}
            className="ui-input"
            placeholder="Ej. Panadería"
            required
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="ui-label">Tipo funcional</span>
            <select
              name="kind"
              value={areaKind}
              onChange={(event) => {
                const nextKind = event.target.value;
                setAreaKind(nextKind);
                const option = AREA_KIND_OPTIONS.find((item) => item.value === nextKind);
                setAreaCode(option?.suggestedCode ?? "AREA");
              }}
              className="ui-input"
            >
              {AREA_KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="ui-label">Código</span>
            <input
              name="code"
              value={areaCode}
              onChange={(event) => setAreaCode(cleanCode(event.target.value))}
              className="ui-input font-mono"
              required
            />
          </label>
        </div>

        <div className="ui-panel-soft p-3 text-sm text-[var(--ui-muted)]">
          Se creará <strong className="text-[var(--ui-text)]">{areaName.trim() || "Nueva área"}</strong> con código{" "}
          <strong className="font-mono text-[var(--ui-text)]">{cleanCode(areaCode, "AREA")}</strong>.
        </div>

        <button type="submit" className="ui-btn ui-btn--brand">
          Crear área
        </button>
      </form>

      <form action={createLocationAction} className="ui-panel space-y-4">
        <input type="hidden" name="site_id" value={siteId} />
        <input type="hidden" name="code" value={generatedLocationCode} />

        <div>
          <div className="ui-h3">Nuevo LOC físico</div>
          <p className="ui-caption mt-1">Un LOC es una ubicación donde se guarda, recibe, produce o mueve inventario.</p>
        </div>

        {activeAreas.length === 0 ? (
          <div className="ui-alert ui-alert--warn">Primero crea un área funcional para poder añadir un LOC.</div>
        ) : (
          <>
            <label className="grid gap-1">
              <span className="ui-label">Área a la que pertenece</span>
              <select
                name="area_id"
                value={selectedArea?.id ?? ""}
                onChange={(event) => setLocationAreaId(event.target.value)}
                className="ui-input"
                required
              >
                {activeAreas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name ?? area.code ?? area.id} ({area.code ?? area.kind ?? "AREA"})
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1">
              <span className="ui-label">Nombre visible del LOC</span>
              <input
                name="description"
                value={locationName}
                onChange={(event) => setLocationName(event.target.value)}
                className="ui-input"
                placeholder="Ej. Insumos de panadería"
                required
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="ui-label">Tipo de LOC</span>
                <select
                  name="location_type"
                  value={locationType}
                  onChange={(event) => {
                    const nextType = event.target.value;
                    setLocationType(nextType);
                    const option = LOCATION_TYPE_OPTIONS.find((item) => item.value === nextType);
                    setIdentifier(option?.suffix ?? "LOC");
                    setZone(option?.zone ?? "BOD");
                  }}
                  className="ui-input"
                >
                  {LOCATION_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1">
                <span className="ui-label">Identificador</span>
                <input
                  value={identifier}
                  onChange={(event) => setIdentifier(cleanCode(event.target.value))}
                  className="ui-input font-mono"
                  placeholder="INS, PROD, TERM"
                  required
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1">
                <span className="ui-label">Zona</span>
                <input
                  name="zone"
                  value={zone}
                  onChange={(event) => setZone(cleanCode(event.target.value))}
                  className="ui-input font-mono"
                  required
                />
              </label>
              <label className="grid gap-1">
                <span className="ui-label">Pasillo</span>
                <input
                  name="aisle"
                  value={aisle}
                  onChange={(event) => setAisle(cleanCode(event.target.value))}
                  className="ui-input font-mono"
                />
              </label>
              <label className="grid gap-1">
                <span className="ui-label">Nivel</span>
                <input
                  name="level"
                  value={level}
                  onChange={(event) => setLevel(cleanCode(event.target.value))}
                  className="ui-input font-mono"
                />
              </label>
            </div>

            <div className="ui-panel-soft p-3">
              <div className="ui-caption">Código generado</div>
              <div className="mt-1 break-all font-mono text-sm font-semibold text-[var(--ui-text)]">
                {generatedLocationCode}
              </div>
            </div>

            <button type="submit" className="ui-btn ui-btn--brand">
              Crear LOC
            </button>
          </>
        )}
      </form>
    </section>
  );
}
