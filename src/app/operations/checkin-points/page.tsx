import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/vento/standard/page-header";
import { OperationsNav } from "@/components/viso/operations-nav";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/vento/standard/table";
import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

const ROUTE = "/operations/checkin-points";

type DbError = {
  message: string;
};

type QueryResponse<T> = {
  data: T[] | null;
  error: DbError | null;
};

type RpcResponse = {
  data: unknown;
  error: DbError | null;
};

type SupabaseLike = {
  from: <T>(table: string) => {
    select: (columns: string) => {
      order: (column: string, options?: { ascending?: boolean }) => Promise<QueryResponse<T>>;
    };
  };
  rpc: (functionName: string, args?: Record<string, unknown>) => Promise<RpcResponse>;
};

type CheckinPointRow = {
  [key: string]: unknown;
};

const pointKindOptions = [
  { value: "checkin_point", label: "Punto de marcación" },
  { value: "vehicle_yard", label: "Patio / recogida de vehículo" },
  { value: "meeting_point", label: "Punto de encuentro" },
  { value: "external_warehouse", label: "Bodega externa" },
  { value: "gate", label: "Portería" },
];

function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function buildRedirect(key: "ok" | "error", value: string): never {
  redirect(`${ROUTE}?${key}=${encodeURIComponent(value)}`);
}

function readFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseDecimal(value: string) {
  if (!value) return Number.NaN;
  return Number(value.replace(",", "."));
}

function isRpcSignatureError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("could not find the function") ||
    normalized.includes("function") && normalized.includes("does not exist") ||
    normalized.includes("schema cache")
  );
}

function textValue(row: CheckinPointRow | null | undefined, keys: string[]) {
  if (!row) return "";
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return value ? "true" : "false";
  }
  return "";
}

function numberText(row: CheckinPointRow | null | undefined, keys: string[]) {
  const value = textValue(row, keys);
  if (!value) return "";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return Number.isInteger(numeric) ? String(numeric) : String(numeric);
}

function booleanValue(row: CheckinPointRow | null | undefined, keys: string[], fallback = false) {
  if (!row) return fallback;
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.toLowerCase();
      if (["true", "1", "yes", "activo"].includes(normalized)) return true;
      if (["false", "0", "no", "inactivo"].includes(normalized)) return false;
    }
  }
  return fallback;
}

function pointId(row: CheckinPointRow | null | undefined) {
  return textValue(row, ["id", "site_id"]);
}

function pointCode(row: CheckinPointRow | null | undefined) {
  return textValue(row, ["code", "site_code"]);
}

function pointName(row: CheckinPointRow | null | undefined) {
  return textValue(row, ["name", "site_name", "label"]);
}

function pointAddress(row: CheckinPointRow | null | undefined) {
  return textValue(row, ["address", "formatted_address", "site_address"]);
}

function pointKind(row: CheckinPointRow | null | undefined) {
  return textValue(row, ["site_kind", "kind", "point_type"]) || "checkin_point";
}

function pointKindLabel(value: string) {
  return pointKindOptions.find((option) => option.value === value)?.label ?? value;
}

function pointLatitude(row: CheckinPointRow | null | undefined) {
  return numberText(row, ["latitude", "lat", "geo_lat", "location_latitude"]);
}

function pointLongitude(row: CheckinPointRow | null | undefined) {
  return numberText(row, ["longitude", "lng", "lon", "geo_lng", "location_longitude"]);
}

function pointRadius(row: CheckinPointRow | null | undefined) {
  return numberText(row, ["geofence_radius_meters", "radius_meters", "checkin_radius_meters", "allowed_radius_meters"]);
}

function pointIsActive(row: CheckinPointRow | null | undefined) {
  return booleanValue(row, ["is_active", "active"], true);
}

async function saveCheckinPoint(formData: FormData) {
  "use server";

  const id = readFormString(formData, "id");
  const code = readFormString(formData, "code");
  const name = readFormString(formData, "name");
  const address = readFormString(formData, "address");
  const siteKind = readFormString(formData, "site_kind") || "checkin_point";
  const latitude = parseDecimal(readFormString(formData, "latitude"));
  const longitude = parseDecimal(readFormString(formData, "longitude"));
  const radiusMeters = parseDecimal(readFormString(formData, "geofence_radius_meters"));
  const isActive = formData.get("is_active") === "on";

  if (!code) buildRedirect("error", "El código del punto de marcación es obligatorio.");
  if (!name) buildRedirect("error", "El nombre del punto de marcación es obligatorio.");
  if (!Number.isFinite(latitude)) buildRedirect("error", "La latitud debe ser numérica.");
  if (!Number.isFinite(longitude)) buildRedirect("error", "La longitud debe ser numérica.");
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) {
    buildRedirect("error", "El radio debe ser un número mayor a cero.");
  }

  const { supabase } = await requireAppAccess({
    appId: "viso",
    returnTo: ROUTE,
  });

  const db = supabase as unknown as SupabaseLike;
  const payload = {
    p_code: code,
    p_name: name,
    p_latitude: latitude,
    p_longitude: longitude,
    p_geofence_radius_meters: Math.round(radiusMeters),
    p_address: address || null,
    p_site_kind: siteKind,
    p_is_active: isActive,
  };

  let result = await db.rpc("upsert_operational_checkin_point", {
    p_site_id: id || null,
    ...payload,
  });

  if (result.error && isRpcSignatureError(result.error.message)) {
    result = await db.rpc("upsert_operational_checkin_point", {
      p_id: id || null,
      ...payload,
    });
  }

  if (result.error) buildRedirect("error", result.error.message);

  buildRedirect("ok", id ? "Punto de marcación actualizado." : "Punto de marcación creado.");
}

export default async function CheckinPointsPage({
  searchParams,
}: {
  searchParams?: Promise<{ ok?: string; error?: string; edit?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const okMsg = sp.ok ? safeDecode(sp.ok) : "";
  const errorMsg = sp.error ? safeDecode(sp.error) : "";
  const editId = sp.edit ? safeDecode(sp.edit) : "";

  const { supabase } = await requireAppAccess({
    appId: "viso",
    returnTo: ROUTE,
  });

  const db = supabase as unknown as SupabaseLike;
  const { data, error } = await db
    .from<CheckinPointRow>("viso_operational_checkin_points")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Puntos de marcación"
          subtitle="Puntos físicos ocultos usados para validar entrada y salida sin convertirlos en sedes operativas visibles."
        />
        <OperationsNav activePath={ROUTE} />
        <div className="ui-alert ui-alert--error">{error.message}</div>
      </div>
    );
  }

  const points = data ?? [];
  const editPoint = editId ? points.find((point) => pointId(point) === editId) ?? null : null;
  const isEditingMissing = Boolean(editId && !editPoint);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Puntos de marcación"
        subtitle="Administra geocercas ocultas para validar asistencia en puntos físicos distintos a la sede operativa."
      />

      <OperationsNav activePath={ROUTE} />

      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}
      {isEditingMissing ? (
        <div className="ui-alert ui-alert--error">
          No se encontró el punto solicitado para edición.
        </div>
      ) : null}

      <div className="ui-panel space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            {editPoint ? "Editar punto de marcación" : "Nuevo punto de marcación"}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Estos registros deben permanecer con visibilidad operativa oculta. ANIMA los usa como geocerca; VISO no debe tratarlos como sedes operativas normales.
          </p>
        </div>

        <form action={saveCheckinPoint} className="grid gap-4 md:grid-cols-2">
          <input type="hidden" name="id" value={pointId(editPoint)} />

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">Código</span>
            <input
              name="code"
              className="ui-input"
              defaultValue={pointCode(editPoint)}
              placeholder="checkin_camioneta_principal"
              required
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">Nombre</span>
            <input
              name="name"
              className="ui-input"
              defaultValue={pointName(editPoint)}
              placeholder="Punto recogida camioneta principal"
              required
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">Tipo de punto</span>
            <select name="site_kind" className="ui-input" defaultValue={pointKind(editPoint)}>
              {pointKindOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">Radio geocerca, metros</span>
            <input
              name="geofence_radius_meters"
              className="ui-input"
              type="number"
              min="1"
              step="1"
              defaultValue={pointRadius(editPoint) || "80"}
              required
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">Latitud</span>
            <input
              name="latitude"
              className="ui-input"
              inputMode="decimal"
              defaultValue={pointLatitude(editPoint)}
              placeholder="4.7110"
              required
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">Longitud</span>
            <input
              name="longitude"
              className="ui-input"
              inputMode="decimal"
              defaultValue={pointLongitude(editPoint)}
              placeholder="-74.0721"
              required
            />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm font-medium text-slate-700">Dirección o referencia</span>
            <input
              name="address"
              className="ui-input"
              defaultValue={pointAddress(editPoint)}
              placeholder="Referencia física del punto"
            />
          </label>

          <label className="flex items-center gap-2 md:col-span-2">
            <input
              name="is_active"
              type="checkbox"
              defaultChecked={pointIsActive(editPoint)}
              className="h-4 w-4"
            />
            <span className="text-sm font-medium text-slate-700">Activo</span>
          </label>

          <div className="flex flex-wrap items-center gap-2 md:col-span-2">
            <button type="submit" className="ui-btn ui-btn--brand">
              {editPoint ? "Guardar cambios" : "Crear punto"}
            </button>
            {editPoint ? (
              <Link href={ROUTE} className="ui-btn ui-btn--ghost">
                Cancelar edición
              </Link>
            ) : null}
          </div>
        </form>
      </div>

      <div className="ui-panel">
        {points.length === 0 ? (
          <div className="ui-empty">No hay puntos de marcación configurados.</div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Código</TableHeaderCell>
                <TableHeaderCell>Nombre</TableHeaderCell>
                <TableHeaderCell>Tipo</TableHeaderCell>
                <TableHeaderCell>Radio</TableHeaderCell>
                <TableHeaderCell>Coordenadas</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {points.map((point) => {
                const id = pointId(point);
                const latitude = pointLatitude(point);
                const longitude = pointLongitude(point);
                const coordinates = latitude && longitude ? `${latitude}, ${longitude}` : "—";
                const isActive = pointIsActive(point);
                return (
                  <TableRow key={id || pointCode(point)}>
                    <TableCell>{pointCode(point) || "—"}</TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-950">{pointName(point) || "—"}</div>
                      {pointAddress(point) ? (
                        <div className="mt-1 text-xs text-slate-500">{pointAddress(point)}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>{pointKindLabel(pointKind(point))}</TableCell>
                    <TableCell>{pointRadius(point) ? `${pointRadius(point)} m` : "—"}</TableCell>
                    <TableCell>{coordinates}</TableCell>
                    <TableCell>
                      <span className={`ui-chip ${isActive ? "ui-chip--success" : ""}`}>
                        {isActive ? "Activo" : "Inactivo"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {id ? (
                        <Link href={`${ROUTE}?edit=${encodeURIComponent(id)}`} className="ui-btn ui-btn--ghost ui-btn--sm">
                          Editar
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
