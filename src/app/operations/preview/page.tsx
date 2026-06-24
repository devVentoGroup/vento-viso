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

function textValue(row: MatrixRow | SiteRow | null | undefined, keys: string[]) {
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
  row: MatrixRow | null | undefined,
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

export default async function OperationsPreviewPage() {
  const { supabase } = await requireAppAccess({
    appId: "viso",
    returnTo: ROUTE,
  });

  const db = supabase as unknown as SupabaseLike;

  const [sitesResult, matrixResult] = await Promise.all([
    db
      .from<SiteRow>("viso_operational_sites")
      .select("*")
      .order("name", { ascending: true }),
    db
      .from<MatrixRow>("vento_site_operational_role_matrix_v1")
      .select("*")
      .order("site_name", { ascending: true }),
  ]);

  const loadError = sitesResult.error?.message || matrixResult.error?.message || "";

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
  const activeMatrix = matrix.filter(matrixIsActive);
  const warnings = buildWarnings(matrix, sites);

  const siteCount = uniqueCount(activeMatrix.map(matrixSiteId));
  const areaCount = uniqueCount(
    activeMatrix.map((row) => `${matrixSiteId(row)}:${textValue(row, ["area_id"]) || "general"}`),
  );
  const defaultCount = activeMatrix.filter(matrixIsDefault).length;
  const externalCount = activeMatrix.filter(matrixRequiresExternal).length;

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
