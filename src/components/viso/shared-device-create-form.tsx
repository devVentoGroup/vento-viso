"use client";

import { useActionState, useMemo, useState } from "react";

type SiteOption = {
  id: string;
  name: string | null;
  code: string | null;
};

type AreaOption = {
  id: string;
  site_id: string;
  name: string | null;
  code: string | null;
  kind: string | null;
};

type AppOption = {
  code: string;
  name: string;
  description: string | null;
};

export type SharedDeviceCreateState = {
  status: "idle" | "success" | "error";
  message?: string;
  device?: {
    id: string;
    code: string;
    label: string;
    loginEmail: string;
    temporaryPassword: string;
    defaultAppCode: string;
    appCodes: string[];
  };
};

type SharedDeviceCreateFormProps = {
  action: (
    prevState: SharedDeviceCreateState,
    formData: FormData,
  ) => Promise<SharedDeviceCreateState>;
  sites: SiteOption[];
  areas: AreaOption[];
  apps: AppOption[];
};

const INITIAL_STATE: SharedDeviceCreateState = {
  status: "idle",
};

const DEVICE_TYPES = [
  { value: "pos_terminal", label: "Caja / POS" },
  { value: "kiosk", label: "Kiosco" },
  { value: "tablet", label: "Tablet" },
  { value: "reception_terminal", label: "Recepción" },
  { value: "production_terminal", label: "Producción" },
  { value: "warehouse_terminal", label: "Bodega" },
  { value: "shared_terminal", label: "Terminal compartido" },
];

const TEMPLATES: Record<
  string,
  { label: string; description: string; deviceType: string; defaultAppCode: string; appCodes: string[] }
> = {
  pos_satellite: {
    label: "Caja satélite",
    description: "PULSO para venta y NEXO para inventario operativo.",
    deviceType: "pos_terminal",
    defaultAppCode: "pulso",
    appCodes: ["pulso", "nexo"],
  },
  bar_satellite: {
    label: "Barra satélite",
    description: "PULSO para operación rápida y NEXO para movimientos.",
    deviceType: "tablet",
    defaultAppCode: "pulso",
    appCodes: ["pulso", "nexo"],
  },
  warehouse_kiosk: {
    label: "Kiosco bodega",
    description: "NEXO para retiros, conteos y movimientos.",
    deviceType: "warehouse_terminal",
    defaultAppCode: "nexo",
    appCodes: ["nexo"],
  },
  procurement_reception: {
    label: "Recepción compras",
    description: "ORIGO para recepciones y NEXO para inventario.",
    deviceType: "reception_terminal",
    defaultAppCode: "origo",
    appCodes: ["origo", "nexo"],
  },
  production_center: {
    label: "Producción centro",
    description: "FOGO para producción y NEXO para inventario.",
    deviceType: "production_terminal",
    defaultAppCode: "fogo",
    appCodes: ["fogo", "nexo"],
  },
  management_terminal: {
    label: "Gerencia",
    description: "NUMERA para rentabilidad y VISO para administración.",
    deviceType: "shared_terminal",
    defaultAppCode: "numera",
    appCodes: ["numera", "viso"],
  },
};

function slugCode(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function optionLabel(name: string | null, code?: string | null) {
  if (name && code) return `${name} (${code})`;
  return name ?? code ?? "Sin nombre";
}

export function SharedDeviceCreateForm({
  action,
  sites,
  areas,
  apps,
}: SharedDeviceCreateFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);
  const [template, setTemplate] = useState("pos_satellite");
  const [siteId, setSiteId] = useState("");
  const [label, setLabel] = useState("");
  const [code, setCode] = useState("");
  const [deviceType, setDeviceType] = useState(TEMPLATES.pos_satellite.deviceType);
  const [defaultAppCode, setDefaultAppCode] = useState(TEMPLATES.pos_satellite.defaultAppCode);
  const [selectedAppCodes, setSelectedAppCodes] = useState<string[]>(TEMPLATES.pos_satellite.appCodes);

  const visibleAreas = useMemo(
    () => areas.filter((area) => !siteId || area.site_id === siteId),
    [areas, siteId],
  );

  const appOptions = useMemo(() => {
    const byCode = new Map(apps.map((app) => [app.code, app]));

    for (const appCode of ["pulso", "nexo", "fogo", "origo", "numera", "viso"]) {
      if (!byCode.has(appCode)) {
        byCode.set(appCode, {
          code: appCode,
          name: appCode.toUpperCase(),
          description: null,
        });
      }
    }

    return Array.from(byCode.values()).sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [apps]);

  const applyTemplate = (value: string) => {
    const next = TEMPLATES[value] ?? TEMPLATES.pos_satellite;

    setTemplate(value);
    setDeviceType(next.deviceType);
    setDefaultAppCode(next.defaultAppCode);
    setSelectedAppCodes(next.appCodes);
  };

  const updateLabel = (value: string) => {
    setLabel(value);

    if (!code.trim()) {
      setCode(slugCode(value));
    }
  };

  const toggleApp = (appCode: string) => {
    setSelectedAppCodes((current) => {
      if (current.includes(appCode)) {
        const next = current.filter((item) => item !== appCode);
        if (defaultAppCode === appCode) {
          setDefaultAppCode(next[0] ?? "");
        }
        return next;
      }

      return [...current, appCode];
    });
  };

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="template" value={template} />

      <div className="grid gap-4 lg:grid-cols-3">
        <label className="space-y-2 lg:col-span-2">
          <span className="ui-label">Plantilla operativa</span>
          <select
            className="ui-input"
            value={template}
            onChange={(event) => applyTemplate(event.target.value)}
          >
            {Object.entries(TEMPLATES).map(([value, item]) => (
              <option key={value} value={value}>
                {item.label}
              </option>
            ))}
          </select>
          <span className="ui-caption block">{TEMPLATES[template]?.description}</span>
        </label>

        <label className="space-y-2">
          <span className="ui-label">Tipo de dispositivo</span>
          <select
            name="device_type"
            className="ui-input"
            value={deviceType}
            onChange={(event) => setDeviceType(event.target.value)}
          >
            {DEVICE_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="space-y-2">
          <span className="ui-label">Nombre visible</span>
          <input
            name="label"
            className="ui-input"
            value={label}
            onChange={(event) => updateLabel(event.target.value)}
            placeholder="PC Caja Vento Café 01"
            required
          />
        </label>

        <label className="space-y-2">
          <span className="ui-label">Código interno</span>
          <input
            name="code"
            className="ui-input"
            value={code}
            onChange={(event) => setCode(slugCode(event.target.value))}
            placeholder="PC_CAJA_VENTO_CAFE_01"
          />
          <span className="ui-caption block">
            Se usa para auditoría, email técnico y configuración del equipo.
          </span>
        </label>

        <label className="space-y-2">
          <span className="ui-label">Email técnico</span>
          <input
            name="login_email"
            className="ui-input"
            type="email"
            placeholder={`${(code || "pc_caja_01").toLowerCase()}@devices.ventogroup.co`}
          />
          <span className="ui-caption block">
            Si lo dejas vacío, se genera con el código interno.
          </span>
        </label>

        <label className="space-y-2">
          <span className="ui-label">Sede</span>
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
                {optionLabel(site.name, site.code)}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="ui-label">Área</span>
          <select name="area_id" className="ui-input">
            <option value="">Sin área específica</option>
            {visibleAreas.map((area) => (
              <option key={area.id} value={area.id}>
                {optionLabel(area.name, area.code)}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2 lg:col-span-2">
          <span className="ui-label">Descripción</span>
          <textarea
            name="description"
            className="ui-input min-h-24"
            placeholder="Equipo fijo de caja para Vento Café. Cada venta debe identificar al trabajador actor."
          />
        </label>
      </div>

      <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--ui-text)]">Apps permitidas</h2>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">
              El dispositivo solo podrá abrir estas apps. La app principal será la primera pantalla recomendada.
            </p>
          </div>

          <label className="min-w-48 space-y-2">
            <span className="ui-label">App principal</span>
            <select
              name="default_app_code"
              className="ui-input"
              value={defaultAppCode}
              onChange={(event) => setDefaultAppCode(event.target.value)}
              required
            >
              {selectedAppCodes.map((appCode) => (
                <option key={appCode} value={appCode}>
                  {appCode.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {appOptions.map((app) => {
            const checked = selectedAppCodes.includes(app.code);

            return (
              <label
                key={app.code}
                className={`rounded-2xl border px-4 py-3 text-sm ${
                  checked
                    ? "border-[color-mix(in_srgb,var(--ui-accent)_44%,var(--ui-border))] bg-[color-mix(in_srgb,var(--ui-accent)_8%,var(--ui-surface))]"
                    : "border-[var(--ui-border)] bg-white/70"
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    name="app_codes"
                    value={app.code}
                    checked={checked}
                    onChange={() => toggleApp(app.code)}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-semibold text-[var(--ui-text)]">{app.name}</div>
                    <div className="ui-caption">{app.description ?? app.code}</div>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--ui-border)] bg-white/80 p-4">
        <h2 className="text-sm font-semibold text-[var(--ui-text)]">Política de operación</h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3 text-sm">
            <input type="checkbox" name="requires_actor_pin" defaultChecked className="mt-1" />
            <span>
              <span className="block font-semibold">Requiere PIN del trabajador</span>
              <span className="ui-caption">Cada acción sensible debe firmarla una persona real.</span>
            </span>
          </label>

          <label className="flex gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3 text-sm">
            <input type="checkbox" name="requires_active_actor_shift" defaultChecked className="mt-1" />
            <span>
              <span className="block font-semibold">Requiere jornada activa</span>
              <span className="ui-caption">El actor debe tener jornada abierta en ANIMA.</span>
            </span>
          </label>

          <label className="flex gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3 text-sm">
            <input type="checkbox" name="allow_actor_without_pin" className="mt-1" />
            <span>
              <span className="block font-semibold">Permitir actor sin PIN</span>
              <span className="ui-caption">Útil solo para pruebas controladas.</span>
            </span>
          </label>

          <label className="flex gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3 text-sm">
            <input type="checkbox" name="allow_actions_without_actor" className="mt-1" />
            <span>
              <span className="block font-semibold">Permitir acciones sin actor</span>
              <span className="ui-caption">No recomendado. Solo para pantallas informativas.</span>
            </span>
          </label>
        </div>
      </div>

      {state.status === "error" ? (
        <div className="ui-alert ui-alert--error">{state.message}</div>
      ) : null}

      {state.status === "success" && state.device ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
          <div className="font-semibold">{state.message}</div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Dispositivo</div>
              <div>{state.device.label}</div>
              <div className="ui-caption">{state.device.code}</div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Apps</div>
              <div>{state.device.appCodes.map((app) => app.toUpperCase()).join(", ")}</div>
              <div className="ui-caption">Principal: {state.device.defaultAppCode.toUpperCase()}</div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Email técnico</div>
              <code className="break-all rounded bg-white/70 px-2 py-1">{state.device.loginEmail}</code>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Contraseña temporal</div>
              <code className="break-all rounded bg-white/70 px-2 py-1">{state.device.temporaryPassword}</code>
            </div>
          </div>

          <p className="mt-3 text-xs text-emerald-900">
            Guarda esta contraseña ahora. No se podrá volver a ver desde Supabase Auth.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          className="ui-btn ui-btn--brand"
          disabled={pending || !label.trim() || !siteId || selectedAppCodes.length === 0}
        >
          {pending ? "Creando..." : "Crear dispositivo compartido"}
        </button>

        <a href="/staff?tab=devices" className="ui-btn ui-btn--ghost">
          Cancelar
        </a>
      </div>
    </form>
  );
}
