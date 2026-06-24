import { redirect } from "next/navigation";

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

const ROUTE = "/operations/site-roles";

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
  rpc: (functionName: string, args?: Record<string, unknown>) => Promise<RpcResponse>;
};

type SiteRow = {
  [key: string]: unknown;
};

type AreaRow = {
  [key: string]: unknown;
};

type OperationalRoleRow = {
  [key: string]: unknown;
};

type SiteRoleRow = {
  [key: string]: unknown;
};

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

function textValue(
  row: SiteRow | AreaRow | OperationalRoleRow | SiteRoleRow | null | undefined,
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
  row: SiteRow | AreaRow | OperationalRoleRow | SiteRoleRow | null | undefined,
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

function siteKind(row: SiteRow | null | undefined) {
  return textValue(row, ["site_kind", "site_type", "kind"]);
}

function areaId(row: AreaRow | null | undefined) {
  return textValue(row, ["id", "area_id"]);
}

function areaSiteId(row: AreaRow | null | undefined) {
  return textValue(row, ["site_id"]);
}

function areaName(row: AreaRow | null | undefined) {
  return textValue(row, ["name", "area_name", "label"]);
}

function areaKind(row: AreaRow | null | undefined) {
  return textValue(row, ["kind", "area_kind"]);
}

function operationalRoleCode(row: OperationalRoleRow | null | undefined) {
  return textValue(row, ["code", "role_code"]);
}

function operationalRoleLabel(row: OperationalRoleRow | null | undefined) {
  return textValue(row, ["label", "role_label"]) || operationalRoleCode(row);
}

function operationalRoleFamily(row: OperationalRoleRow | null | undefined) {
  return textValue(row, ["role_family"]);
}

function operationalRoleRequiresExternal(row: OperationalRoleRow | null | undefined) {
  return (
    booleanValue(row, ["requires_external_checkin"], false) ||
    booleanValue(row, ["requires_external_checkout"], false)
  );
}

function roleMatrixKey(row: SiteRoleRow) {
  return (
    textValue(row, ["id"]) ||
    [
      textValue(row, ["site_id"]),
      textValue(row, ["area_id"]) || "general",
      textValue(row, ["role_code"]),
    ].join(":")
  );
}

function roleMatrixSiteName(row: SiteRoleRow | null | undefined) {
  return textValue(row, ["site_name", "name"]);
}

function roleMatrixSiteCode(row: SiteRoleRow | null | undefined) {
  return textValue(row, ["site_code", "code"]);
}

function roleMatrixAreaName(row: SiteRoleRow | null | undefined) {
  return textValue(row, ["area_name"]);
}

function roleMatrixAreaKind(row: SiteRoleRow | null | undefined) {
  return textValue(row, ["area_kind"]);
}

function roleMatrixCode(row: SiteRoleRow | null | undefined) {
  return textValue(row, ["role_code"]);
}

function roleMatrixLabel(row: SiteRoleRow | null | undefined) {
  return textValue(row, ["role_label", "label"]) || roleMatrixCode(row);
}

function roleMatrixFamily(row: SiteRoleRow | null | undefined) {
  return textValue(row, ["role_family"]);
}

function roleMatrixIsDefault(row: SiteRoleRow | null | undefined) {
  return booleanValue(row, ["is_default"], false);
}

function roleMatrixIsActive(row: SiteRoleRow | null | undefined) {
  return booleanValue(row, ["is_active", "active"], true);
}

function roleMatrixRequiresExternal(row: SiteRoleRow | null | undefined) {
  return (
    booleanValue(row, ["requires_external_checkin"], false) ||
    booleanValue(row, ["requires_external_checkout"], false)
  );
}

async function saveSiteRole(formData: FormData) {
  "use server";

  const siteIdValue = readFormString(formData, "site_id");
  const areaIdValue = readFormString(formData, "area_id");
  const roleCodeValue = readFormString(formData, "role_code");
  const isDefault = formData.get("is_default") === "on";
  const isActive = formData.get("is_active") === "on";

  if (!siteIdValue) buildRedirect("error", "Selecciona una sede operativa.");
  if (!roleCodeValue) buildRedirect("error", "Selecciona un rol operativo del catálogo.");

  const { supabase } = await requireAppAccess({
    appId: "viso",
    returnTo: ROUTE,
  });

  const db = supabase as unknown as SupabaseLike;

  const result = await db.rpc("upsert_site_operational_role", {
    p_site_id: siteIdValue,
    p_area_id: areaIdValue || null,
    p_role_code: roleCodeValue,
    p_is_default: isDefault,
    p_is_active: isActive,
  });

  if (result.error) buildRedirect("error", result.error.message);

  buildRedirect(
    "ok",
    isActive
      ? "Rol operativo habilitado en la matriz."
      : "Rol operativo desactivado en la matriz.",
  );
}

export default async function SiteRolesPage({
  searchParams,
}: {
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const okMsg = sp.ok ? safeDecode(sp.ok) : "";
  const errorMsg = sp.error ? safeDecode(sp.error) : "";

  const { supabase } = await requireAppAccess({
    appId: "viso",
    returnTo: ROUTE,
  });

  const db = supabase as unknown as SupabaseLike;

  const [sitesResult, areasResult, catalogResult, matrixResult] = await Promise.all([
    db
      .from<SiteRow>("viso_operational_sites")
      .select("*")
      .order("name", { ascending: true }),
    db
      .from<AreaRow>("areas")
      .select("*")
      .order("name", { ascending: true }),
    db
      .from<OperationalRoleRow>("vento_operational_roles_v1")
      .select("*")
      .order("sort_order", { ascending: true }),
    db
      .from<SiteRoleRow>("vento_site_operational_role_matrix_v1")
      .select("*")
      .order("site_name", { ascending: true }),
  ]);

  const loadError =
    sitesResult.error?.message ||
    areasResult.error?.message ||
    catalogResult.error?.message ||
    matrixResult.error?.message ||
    "";

  if (loadError) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Matriz operativa"
          subtitle="Administra roles operativos aprobados por sede y área."
        />
        <OperationsNav activePath={ROUTE} />
        <div className="ui-alert ui-alert--error">{loadError}</div>
      </div>
    );
  }

  const sites = sitesResult.data ?? [];
  const areas = areasResult.data ?? [];
  const catalog = catalogResult.data ?? [];
  const matrix = matrixResult.data ?? [];

  const activeMatrixCount = matrix.filter(roleMatrixIsActive).length;
  const externalRolesCount = matrix.filter(roleMatrixRequiresExternal).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Matriz operativa"
        subtitle="Define qué roles operativos aprobados pueden aplicarse por sede y área. Esta matriz alimenta la creación de horarios y el contexto activo de ANIMA."
      />

      <OperationsNav activePath={ROUTE} />

      {errorMsg ? (
        <div className="ui-alert ui-alert--error">{errorMsg}</div>
      ) : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="ui-panel space-y-5">
          <div>
            <p className="ui-eyebrow">Matriz cerrada</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950">
              Habilitar rol operativo
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              No se crean roles libres. Selecciona un rol aprobado del catálogo y asígnalo a una sede o área.
            </p>
          </div>

          <form action={saveSiteRole} className="space-y-4">
            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700">
                Sede operativa
              </span>
              <select
                name="site_id"
                className="ui-input"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  Selecciona una sede
                </option>
                {sites.map((site) => {
                  const id = siteId(site);
                  const code = siteCode(site);
                  const label = siteName(site) || code || id;

                  return (
                    <option key={id || label} value={id}>
                      {label}
                      {code ? ` · ${code}` : ""}
                    </option>
                  );
                })}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700">
                Área, opcional
              </span>
              <select name="area_id" className="ui-input" defaultValue="">
                <option value="">General de la sede</option>
                {areas.map((area) => {
                  const id = areaId(area);
                  const label = areaName(area) || id;
                  const kind = areaKind(area);
                  const siteValue = areaSiteId(area);

                  return (
                    <option key={id || label} value={id}>
                      {label}
                      {kind ? ` · ${kind}` : ""}
                      {siteValue ? ` · ${siteValue.slice(0, 8)}` : ""}
                    </option>
                  );
                })}
              </select>
              <p className="text-xs leading-5 text-slate-500">
                Usa área solo cuando la sede necesita separar caja, barra, cocina, bodega o producción.
              </p>
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700">
                Rol operativo aprobado
              </span>
              <select
                name="role_code"
                className="ui-input"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  Selecciona un rol del catálogo
                </option>
                {catalog.map((role) => {
                  const code = operationalRoleCode(role);
                  return (
                    <option key={code} value={code}>
                      {operationalRoleLabel(role)}
                      {operationalRoleFamily(role) ? ` · ${operationalRoleFamily(role)}` : ""}
                      {operationalRoleRequiresExternal(role) ? " · requiere punto externo" : ""}
                    </option>
                  );
                })}
              </select>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2">
                <input
                  name="is_default"
                  type="checkbox"
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
        </div>

        <div className="ui-panel space-y-5">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ui-muted)]">
                Sedes
              </p>
              <p className="mt-2 text-2xl font-semibold text-[var(--ui-text)]">
                {sites.length}
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ui-muted)]">
                Catálogo
              </p>
              <p className="mt-2 text-2xl font-semibold text-[var(--ui-text)]">
                {catalog.length}
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ui-muted)]">
                Reglas activas
              </p>
              <p className="mt-2 text-2xl font-semibold text-[var(--ui-text)]">
                {activeMatrixCount}
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ui-muted)]">
                Punto externo
              </p>
              <p className="mt-2 text-2xl font-semibold text-[var(--ui-text)]">
                {externalRolesCount}
              </p>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              Qué controla esta matriz
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Al crear horarios en VISO, el rol operativo debe salir de esta matriz. Si el rol requiere punto externo, como conductor logística, el horario deberá pedir punto de entrada y salida.
            </p>
          </div>
        </div>
      </div>

      <div className="ui-panel">
        {matrix.length === 0 ? (
          <div className="ui-empty">
            La matriz aún no tiene reglas. Agrega el primer rol operativo aprobado para una sede.
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Sede</TableHeaderCell>
                <TableHeaderCell>Área</TableHeaderCell>
                <TableHeaderCell>Rol operativo</TableHeaderCell>
                <TableHeaderCell>Familia</TableHeaderCell>
                <TableHeaderCell>Reglas</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {matrix.map((role) => {
                const active = roleMatrixIsActive(role);
                const siteValue = textValue(role, ["site_id"]);
                const areaValue = textValue(role, ["area_id"]);
                const codeValue = roleMatrixCode(role);

                return (
                  <TableRow key={roleMatrixKey(role)}>
                    <TableCell>
                      <div className="font-medium text-slate-950">
                        {roleMatrixSiteName(role) || "—"}
                      </div>
                      {roleMatrixSiteCode(role) ? (
                        <div className="mt-1 text-xs text-slate-500">
                          {roleMatrixSiteCode(role)}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {roleMatrixAreaName(role) ? (
                        <div>
                          <div className="font-medium text-slate-950">
                            {roleMatrixAreaName(role)}
                          </div>
                          {roleMatrixAreaKind(role) ? (
                            <div className="mt-1 text-xs text-slate-500">
                              {roleMatrixAreaKind(role)}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        "General"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-950">
                        {roleMatrixLabel(role) || "—"}
                      </div>
                      <code className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                        {codeValue || "—"}
                      </code>
                    </TableCell>
                    <TableCell>{roleMatrixFamily(role) || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {roleMatrixIsDefault(role) ? (
                          <span className="ui-chip ui-chip--soft">Default</span>
                        ) : null}
                        {roleMatrixRequiresExternal(role) ? (
                          <span className="ui-chip ui-chip--soft">Punto externo</span>
                        ) : null}
                        {!roleMatrixIsDefault(role) && !roleMatrixRequiresExternal(role) ? "—" : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`ui-chip ${active ? "ui-chip--success" : ""}`}
                      >
                        {active ? "Activo" : "Inactivo"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {siteValue && codeValue ? (
                        <form action={saveSiteRole}>
                          <input type="hidden" name="site_id" value={siteValue} />
                          <input type="hidden" name="area_id" value={areaValue} />
                          <input type="hidden" name="role_code" value={codeValue} />
                          {roleMatrixIsDefault(role) ? (
                            <input type="hidden" name="is_default" value="on" />
                          ) : null}
                          {active ? null : (
                            <input type="hidden" name="is_active" value="on" />
                          )}
                          <button
                            type="submit"
                            className="ui-btn ui-btn--ghost ui-btn--sm"
                          >
                            {active ? "Desactivar" : "Activar"}
                          </button>
                        </form>
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

      {sites.length > 0 ? (
        <div className="ui-panel">
          <h2 className="text-lg font-semibold text-slate-950">
            Sedes operativas disponibles
          </h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {sites.map((site) => {
              const id = siteId(site);
              return (
                <div
                  key={id || siteName(site)}
                  className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-950">
                        {siteName(site) || "Sede"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {siteCode(site) || id || "—"}
                      </p>
                    </div>
                    {siteKind(site) ? (
                      <span className="ui-chip ui-chip--soft">
                        {siteKind(site)}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
