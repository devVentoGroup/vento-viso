import Link from "next/link";

import { OperationsNav } from "@/components/viso/operations-nav";
import { PageHeader } from "@/components/vento/standard/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/vento/standard/table";
import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

const ROUTE = "/operations/preview";

type SearchParams = {
  site_id?: string;
  area_id?: string;
  role_code?: string;
};

type DbError = {
  message: string;
};

type QueryResponse<T> = {
  data: T[] | null;
  error: DbError | null;
};

type SelectOrderBuilder<T> = {
  order: (
    column: string,
    options?: { ascending?: boolean },
  ) => Promise<QueryResponse<T>>;
};

type SupabaseLike = {
  from: <T>(table: string) => {
    select: (columns: string) => SelectOrderBuilder<T>;
  };
};

type MatrixRow = {
  [key: string]: unknown;
};

type SiteRow = {
  [key: string]: unknown;
};

type OperationalPermissionRow = {
  [key: string]: unknown;
};

function textValue(
  row: MatrixRow | SiteRow | OperationalPermissionRow | null | undefined,
  keys: string[],
) {
  if (!row) return "";

  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return value ? "true" : "false";
  }

  return "";
}

function booleanValue(
  row: MatrixRow | OperationalPermissionRow | null | undefined,
  keys: string[],
  fallback = false,
) {
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

function siteId(row: SiteRow | null | undefined) {
  return textValue(row, ["id", "site_id"]);
}

function siteName(row: SiteRow | null | undefined) {
  return textValue(row, ["name", "site_name", "label"]);
}

function siteCode(row: SiteRow | null | undefined) {
  return textValue(row, ["code", "site_code"]);
}

function matrixKey(row: MatrixRow) {
  return (
    textValue(row, ["id"]) ||
    [
      textValue(row, ["site_id"]),
      textValue(row, ["area_id"]) || "general",
      textValue(row, ["role_code"]),
    ].join(":")
  );
}

function matrixSiteId(row: MatrixRow | null | undefined) {
  return textValue(row, ["site_id"]);
}

function matrixSiteName(row: MatrixRow | null | undefined) {
  return textValue(row, ["site_name"]);
}

function matrixSiteCode(row: MatrixRow | null | undefined) {
  return textValue(row, ["site_code"]);
}

function matrixAreaName(row: MatrixRow | null | undefined) {
  return textValue(row, ["area_name"]) || "General";
}

function matrixAreaKind(row: MatrixRow | null | undefined) {
  return textValue(row, ["area_kind"]);
}

function matrixRoleCode(row: MatrixRow | null | undefined) {
  return textValue(row, ["role_code"]);
}

function matrixRoleLabel(row: MatrixRow | null | undefined) {
  return textValue(row, ["role_label"]) || matrixRoleCode(row);
}

function matrixRoleFamily(row: MatrixRow | null | undefined) {
  return textValue(row, ["role_family"]);
}

function matrixIsDefault(row: MatrixRow | null | undefined) {
  return booleanValue(row, ["is_default"], false);
}

function matrixIsActive(row: MatrixRow | null | undefined) {
  return booleanValue(row, ["is_active"], true);
}

function matrixRequiresExternal(row: MatrixRow | null | undefined) {
  return (
    booleanValue(row, ["requires_external_checkin"], false) ||
    booleanValue(row, ["requires_external_checkout"], false)
  );
}

function permissionRoleCode(row: OperationalPermissionRow | null | undefined) {
  return textValue(row, ["role_code"]);
}

function permissionCode(row: OperationalPermissionRow | null | undefined) {
  return textValue(row, ["permission_code"]);
}

function permissionSiteId(row: OperationalPermissionRow | null | undefined) {
  return textValue(row, ["site_id"]);
}

function permissionAreaId(row: OperationalPermissionRow | null | undefined) {
  return textValue(row, ["area_id"]);
}

function permissionAreaKind(row: OperationalPermissionRow | null | undefined) {
  return textValue(row, ["area_kind"]);
}

function permissionIsAllowed(row: OperationalPermissionRow | null | undefined) {
  return booleanValue(row, ["is_allowed"], true);
}

function permissionLabel(code: string) {
  const labels: Record<string, string> = {
    "nexo.access": "Abrir NEXO",
    "nexo.inventory.remissions": "Ver remisiones",
    "nexo.inventory.remissions.request": "Solicitar remisiones",
    "nexo.inventory.remissions.prepare": "Preparar remisiones",
    "nexo.inventory.remissions.receive": "Recibir remisiones",
    "nexo.inventory.remissions.transit": "Gestionar tránsito",
    "nexo.inventory.remissions.cancel": "Cancelar remisiones",
    "nexo.inventory.stock": "Ver inventario",
    "nexo.inventory.movements": "Ver movimientos",
    "pulso.access": "Abrir PULSO",
    "pulso.pos.main": "Usar POS",
  };

  return labels[code] ?? code;
}

function uniqueCount(values: string[]) {
  return new Set(values.filter(Boolean)).size;
}

function groupBySiteArea(rows: MatrixRow[]) {
  const map = new Map<string, MatrixRow[]>();

  rows.forEach((row) => {
    const key = [
      matrixSiteId(row),
      textValue(row, ["area_id"]) || "general",
    ].join(":");
    const current = map.get(key) ?? [];
    current.push(row);
    map.set(key, current);
  });

  return Array.from(map.values());
}

function buildWarnings(matrix: MatrixRow[], sites: SiteRow[]) {
  const warnings: string[] = [];
  const active = matrix.filter(matrixIsActive);
  const siteIdsWithMatrix = new Set(active.map(matrixSiteId).filter(Boolean));

  sites.forEach((site) => {
    const id = siteId(site);
    if (id && !siteIdsWithMatrix.has(id)) {
      warnings.push(`La sede ${siteName(site) || siteCode(site) || id} no tiene matriz operativa activa.`);
    }
  });

  groupBySiteArea(active).forEach((rows) => {
    const defaults = rows.filter(matrixIsDefault);
    const label = `${matrixSiteName(rows[0]) || "Sede"} / ${matrixAreaName(rows[0])}`;

    if (rows.length > 1 && defaults.length === 0) {
      warnings.push(`${label} tiene varios roles activos y ningún default. El horario deberá seleccionar rol manualmente.`);
    }

    if (defaults.length > 1) {
      warnings.push(`${label} tiene más de un rol default. Debe quedar máximo uno.`);
    }
  });

  const conductorRows = active.filter((row) => matrixRoleCode(row) === "conductor_logistica");
  if (conductorRows.length === 0) {
    warnings.push("No hay regla activa para conductor_logistica. El caso conductor no quedará disponible en horarios.");
  }

  return warnings;
}

export default async function OperationsPreviewPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const { supabase } = await requireAppAccess({
    appId: "viso",
    returnTo: ROUTE,
  });

  const db = supabase as unknown as SupabaseLike;

  const [sitesResult, matrixResult, permissionsResult] = await Promise.all([
    db
      .from<SiteRow>("viso_operational_sites")
      .select("*")
      .order("name", { ascending: true }),
    db
      .from<MatrixRow>("vento_site_operational_role_matrix_v1")
      .select("*")
      .order("site_name", { ascending: true }),
    db
      .from<OperationalPermissionRow>("operational_role_permissions")
      .select("*")
      .order("role_code", { ascending: true }),
  ]);

  const loadError =
    sitesResult.error?.message ||
    matrixResult.error?.message ||
    permissionsResult.error?.message ||
    "";

  if (loadError) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Vista previa operativa"
          subtitle="Auditoría de matriz operativa, roles por sede y puntos externos."
        />
        <OperationsNav activePath={ROUTE} />
        <div className="ui-alert ui-alert--error">{loadError}</div>
      </div>
    );
  }

  const sites = sitesResult.data ?? [];
  const matrix = matrixResult.data ?? [];
  const permissions = permissionsResult.data ?? [];
  const activeMatrix = matrix.filter(matrixIsActive);
  const warnings = buildWarnings(matrix, sites);

  const siteCount = uniqueCount(activeMatrix.map(matrixSiteId));
  const areaCount = uniqueCount(
    activeMatrix.map((row) => `${matrixSiteId(row)}:${textValue(row, ["area_id"]) || "general"}`),
  );
  const defaultCount = activeMatrix.filter(matrixIsDefault).length;
  const externalCount = activeMatrix.filter(matrixRequiresExternal).length;
  const selectedSiteId = String(sp.site_id ?? "").trim();
  const selectedAreaId = String(sp.area_id ?? "").trim();
  const selectedRoleCode = String(sp.role_code ?? "").trim();
  const selectedMatrixRows = activeMatrix.filter((row) => {
    if (selectedSiteId && matrixSiteId(row) !== selectedSiteId) return false;
    if (selectedAreaId && textValue(row, ["area_id"]) !== selectedAreaId) return false;
    if (selectedRoleCode && matrixRoleCode(row) !== selectedRoleCode) return false;
    return true;
  });
  const simulatedRow = selectedMatrixRows[0] ?? null;
  const simulatedSiteId = matrixSiteId(simulatedRow);
  const simulatedAreaId = textValue(simulatedRow, ["area_id"]);
  const simulatedAreaKind = matrixAreaKind(simulatedRow);
  const simulatedRoleCode = matrixRoleCode(simulatedRow);
  const simulatedPermissions = permissions
    .filter((row) => {
      if (!simulatedRoleCode || permissionRoleCode(row) !== simulatedRoleCode) return false;
      if (!permissionIsAllowed(row)) return false;
      const scopeSiteId = permissionSiteId(row);
      const scopeAreaId = permissionAreaId(row);
      const scopeAreaKind = permissionAreaKind(row);
      if (scopeSiteId && scopeSiteId !== simulatedSiteId) return false;
      if (scopeAreaId && scopeAreaId !== simulatedAreaId) return false;
      if (scopeAreaKind && scopeAreaKind !== simulatedAreaKind) return false;
      return true;
    })
    .map(permissionCode)
    .filter(Boolean)
    .sort();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vista previa operativa"
        subtitle="Revisa cómo queda la matriz que usará VISO para crear horarios y cómo ANIMA/NEXO/FOGO leerán el contexto activo."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/operations/site-roles" className="ui-btn ui-btn--ghost">
              Editar matriz
            </Link>
            <Link href="/operations/checkin-points" className="ui-btn ui-btn--ghost">
              Puntos de marcación
            </Link>
          </div>
        }
      />

      <OperationsNav activePath={ROUTE} />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ui-muted)]">
            Reglas activas
          </p>
          <p className="mt-2 text-2xl font-semibold text-[var(--ui-text)]">
            {activeMatrix.length}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ui-muted)]">
            Sedes configuradas
          </p>
          <p className="mt-2 text-2xl font-semibold text-[var(--ui-text)]">
            {siteCount}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ui-muted)]">
            Áreas configuradas
          </p>
          <p className="mt-2 text-2xl font-semibold text-[var(--ui-text)]">
            {areaCount}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ui-muted)]">
            Defaults
          </p>
          <p className="mt-2 text-2xl font-semibold text-[var(--ui-text)]">
            {defaultCount}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ui-muted)]">
            Punto externo
          </p>
          <p className="mt-2 text-2xl font-semibold text-[var(--ui-text)]">
            {externalCount}
          </p>
        </div>
      </section>

      <section className="ui-panel space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            Lectura operativa
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            La matriz no asigna permisos directamente. Define qué rol operativo puede quedar en un horario según sede y área. Luego, con el turno activo, las apps resuelven permisos usando sede, área y rol operativo.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4">
            <p className="font-semibold text-slate-950">VISO</p>
            <p className="mt-1 text-sm text-slate-600">
              Usa esta matriz al crear horarios para escoger o inferir el rol operativo del turno.
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4">
            <p className="font-semibold text-slate-950">ANIMA</p>
            <p className="mt-1 text-sm text-slate-600">
              Activa el contexto del turno. Para conductor, debe usar el punto físico de entrada/salida si existe.
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4">
            <p className="font-semibold text-slate-950">NEXO / FOGO / PULSO</p>
            <p className="mt-1 text-sm text-slate-600">
              Deben permitir acciones según el contexto activo, no solo por login.
            </p>
          </div>
        </div>
      </section>

      <section className="ui-panel space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            Simular turno
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Elige una combinación real de la matriz para ver qué acciones quedarán disponibles cuando una persona tenga ese rol en un turno activo.
          </p>
        </div>

        <form action={ROUTE} className="grid gap-3 md:grid-cols-4">
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Sede
            </span>
            <select name="site_id" defaultValue={selectedSiteId} className="ui-input">
              <option value="">Todas</option>
              {Array.from(
                new Map(
                  activeMatrix
                    .filter((row) => matrixSiteId(row))
                    .map((row) => [
                      matrixSiteId(row),
                      matrixSiteName(row) || matrixSiteCode(row) || matrixSiteId(row),
                    ]),
                ).entries(),
              ).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Área
            </span>
            <select name="area_id" defaultValue={selectedAreaId} className="ui-input">
              <option value="">General o cualquiera</option>
              {Array.from(
                new Map(
                  activeMatrix
                    .filter((row) => !selectedSiteId || matrixSiteId(row) === selectedSiteId)
                    .filter((row) => textValue(row, ["area_id"]))
                    .map((row) => [
                      textValue(row, ["area_id"]),
                      `${matrixAreaName(row)}${matrixAreaKind(row) ? ` (${matrixAreaKind(row)})` : ""}`,
                    ]),
                ).entries(),
              ).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Rol operativo
            </span>
            <select name="role_code" defaultValue={selectedRoleCode} className="ui-input">
              <option value="">Primer rol que coincida</option>
              {Array.from(
                new Map(
                  activeMatrix
                    .filter((row) => !selectedSiteId || matrixSiteId(row) === selectedSiteId)
                    .filter((row) => !selectedAreaId || textValue(row, ["area_id"]) === selectedAreaId)
                    .filter((row) => matrixRoleCode(row))
                    .map((row) => [
                      matrixRoleCode(row),
                      matrixRoleLabel(row) || matrixRoleCode(row),
                    ]),
                ).entries(),
              ).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end">
            <button type="submit" className="ui-btn ui-btn--brand h-11 w-full">
              Simular
            </button>
          </div>
        </form>

        {simulatedRow ? (
          <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">
                  {matrixSiteName(simulatedRow)} / {matrixAreaName(simulatedRow)}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Rol aplicado: {matrixRoleLabel(simulatedRow)}
                </p>
              </div>
              <span className="ui-chip ui-chip--success">
                {simulatedPermissions.length} acciones
              </span>
            </div>

            {simulatedPermissions.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {simulatedPermissions.map((code) => (
                  <span key={code} className="ui-chip ui-chip--soft">
                    {permissionLabel(code)}
                  </span>
                ))}
              </div>
            ) : (
              <div className="mt-4 ui-alert ui-alert--warning">
                Este rol existe en la matriz de turnos, pero aún no tiene permisos operativos asignados.
              </div>
            )}
          </div>
        ) : (
          <div className="ui-alert ui-alert--neutral">
            Selecciona una combinación para ver el resultado. Si dejas filtros vacíos, se toma la primera regla activa.
          </div>
        )}
      </section>

      {warnings.length > 0 ? (
        <section className="ui-panel space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              Alertas de configuración
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Estas alertas no bloquean, pero indican puntos que conviene revisar antes de conectar horarios.
            </p>
          </div>
          <div className="space-y-2">
            {warnings.map((warning) => (
              <div key={warning} className="ui-alert ui-alert--warning">
                {warning}
              </div>
            ))}
          </div>
        </section>
      ) : (
        <div className="ui-alert ui-alert--success">
          No se detectaron alertas básicas en la matriz activa.
        </div>
      )}

      <section className="ui-panel">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-950">
            Matriz activa
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Vista de solo lectura de las reglas actualmente configuradas.
          </p>
        </div>

        {matrix.length === 0 ? (
          <div className="ui-empty">
            No hay reglas en la matriz. Configúralas en Roles por sede.
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Sede</TableHeaderCell>
                <TableHeaderCell>Área</TableHeaderCell>
                <TableHeaderCell>Rol operativo</TableHeaderCell>
                <TableHeaderCell>Familia</TableHeaderCell>
                <TableHeaderCell>Uso en horarios</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {matrix.map((row) => {
                const active = matrixIsActive(row);
                return (
                  <TableRow key={matrixKey(row)}>
                    <TableCell>
                      <div className="font-medium text-slate-950">
                        {matrixSiteName(row) || "—"}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {matrixSiteCode(row) || "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-950">
                        {matrixAreaName(row)}
                      </div>
                      {matrixAreaKind(row) ? (
                        <div className="mt-1 text-xs text-slate-500">
                          {matrixAreaKind(row)}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-950">
                        {matrixRoleLabel(row) || "—"}
                      </div>
                      <code className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                        {matrixRoleCode(row) || "—"}
                      </code>
                    </TableCell>
                    <TableCell>{matrixRoleFamily(row) || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {matrixIsDefault(row) ? (
                          <span className="ui-chip ui-chip--soft">Default</span>
                        ) : null}
                        {matrixRequiresExternal(row) ? (
                          <span className="ui-chip ui-chip--soft">Punto externo</span>
                        ) : null}
                        {!matrixIsDefault(row) && !matrixRequiresExternal(row) ? (
                          <span className="text-sm text-slate-500">Selección manual si aplica</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`ui-chip ${active ? "ui-chip--success" : ""}`}
                      >
                        {active ? "Activo" : "Inactivo"}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
