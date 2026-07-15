"use client";

import { useMemo, useState } from "react";

type Model = "single_loc" | "multi_area" | "multi_loc";
type Visibility = "operational" | "test" | "app_review" | "hidden";
type CapabilityKey = "can_request_remissions" | "can_fulfill_remissions" | "can_receive_remissions" | "can_schedule_staff" | "can_sell" | "can_produce" | "can_hold_inventory" | "is_commercial_business" | "show_in_product_setup";

export type SiteCapabilityState = Record<CapabilityKey, boolean>;
type Location = { id: string; code: string | null; description: string | null; location_type: string | null };

type Props = {
  siteId: string;
  action: (formData: FormData) => void | Promise<void>;
  initialVisibility: Visibility;
  initialModel: Model;
  initialPrimaryLocationId: string;
  initialCapabilities: SiteCapabilityState;
  locations: Location[];
};

const models: Array<[Model, string, string]> = [
  ["single_loc", "Una ubicación principal", "Toda la operación se concentra en un LOC."],
  ["multi_area", "Áreas por función", "Cocina, barra, bodega, despacho y otras áreas."],
  ["multi_loc", "Varias ubicaciones", "La sede usa varios LOCs independientes."],
];

const capabilities: Array<[CapabilityKey, string, string]> = [
  ["can_request_remissions", "Pide productos", "Puede solicitar productos a otra sede."],
  ["can_fulfill_remissions", "Despacha productos", "Puede preparar y enviar remisiones."],
  ["can_receive_remissions", "Recibe productos", "Puede confirmar la llegada de remisiones."],
  ["can_hold_inventory", "Guarda inventario", "Mantiene existencias en uno o varios LOCs."],
  ["can_produce", "Produce", "Transforma insumos en productos terminados."],
  ["can_sell", "Vende", "Realiza ventas y descuenta inventario."],
  ["can_schedule_staff", "Programa personal", "Aparece en horarios y asignaciones."],
  ["is_commercial_business", "Es negocio comercial", "Representa un punto visible para clientes."],
  ["show_in_product_setup", "Configura productos", "Aparece en disponibilidad y operación por sede."],
];

export function SiteOperationFormClient(props: Props) {
  const [model, setModel] = useState<Model>(props.initialModel);
  const [visibility, setVisibility] = useState<Visibility>(props.initialVisibility);
  const [primary, setPrimary] = useState(props.initialPrimaryLocationId);
  const [enabled, setEnabled] = useState<SiteCapabilityState>(props.initialCapabilities);

  const summary = useMemo(() => capabilities.filter(([key]) => enabled[key]).map(([, label]) => label), [enabled]);

  return (
    <form action={props.action} className="space-y-6">
      <input type="hidden" name="site_id" value={props.siteId} />
      <input type="hidden" name="operation_model" value={model} />
      <input type="hidden" name="operational_visibility" value={visibility} />
      <input type="hidden" name="primary_operational_location_id" value={primary} />
      {capabilities.map(([key]) => <input key={key} type="hidden" name={key} value={enabled[key] ? "on" : ""} />)}

      <div className="space-y-3">
        <div><div className="ui-label">1. ¿Cómo está organizada esta sede?</div><p className="ui-body-muted mt-1">Elige la opción que más se parezca a la operación real.</p></div>
        <div className="grid gap-3 md:grid-cols-3">
          {models.map(([value, title, description]) => (
            <button key={value} type="button" onClick={() => setModel(value)} className={`rounded-xl border p-4 text-left transition ${model === value ? "border-[var(--ui-brand)] bg-[var(--ui-brand-soft)]" : "border-[var(--ui-border)] bg-white hover:border-[var(--ui-brand)]"}`}>
              <div className="font-semibold text-[var(--ui-text)]">{title}</div>
              <div className="mt-1 text-sm text-[var(--ui-muted)]">{description}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1"><span className="ui-label">2. Estado de la sede</span><select value={visibility} onChange={(event) => setVisibility(event.target.value as Visibility)} className="ui-input"><option value="operational">En operación</option><option value="test">En pruebas</option><option value="app_review">En revisión</option><option value="hidden">Oculta</option></select></label>
        <label className="grid gap-1"><span className="ui-label">3. Ubicación principal</span><select value={primary} onChange={(event) => setPrimary(event.target.value)} className="ui-input"><option value="">Todavía no definida</option>{props.locations.map((location) => <option key={location.id} value={location.id}>{location.description || location.code || "LOC"}</option>)}</select></label>
      </div>

      <div className="space-y-3">
        <div><div className="ui-label">4. ¿Qué hace esta sede?</div><p className="ui-body-muted mt-1">Activa únicamente las funciones que realmente ocurren aquí.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {capabilities.map(([key, title, description]) => (
            <button key={key} type="button" onClick={() => setEnabled((current) => ({ ...current, [key]: !current[key] }))} className={`rounded-xl border p-4 text-left transition ${enabled[key] ? "border-emerald-400 bg-emerald-50" : "border-[var(--ui-border)] bg-white hover:border-[var(--ui-brand)]"}`}>
              <div className="flex items-center justify-between gap-2"><span className="font-semibold text-[var(--ui-text)]">{title}</span><span className={enabled[key] ? "ui-chip ui-chip--success" : "ui-chip"}>{enabled[key] ? "Sí" : "No"}</span></div>
              <div className="mt-1 text-sm text-[var(--ui-muted)]">{description}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4">
        <div className="ui-label">Resumen antes de guardar</div>
        <div className="mt-2 flex flex-wrap gap-2">{summary.length ? summary.map((item) => <span key={item} className="ui-chip ui-chip--success">{item}</span>) : <span className="text-sm text-[var(--ui-muted)]">No hay funciones activadas.</span>}</div>
      </div>

      <div className="flex justify-end"><button type="submit" className="ui-btn ui-btn--brand">Guardar configuración</button></div>
    </form>
  );
}
