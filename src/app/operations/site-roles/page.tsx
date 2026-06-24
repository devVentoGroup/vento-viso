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

type MutationResponse = {
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
    upsert: (
      values: Record<string, unknown>,
      options?: { onConflict?: string; ignoreDuplicates?: boolean },
    ) => Promise<MutationResponse>;
  };
};

type SiteRow = {
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

function normalizeRoleCode(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function textValue(
  row: SiteRow | SiteRoleRow | null | undefined,
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
  row: SiteRow | SiteRoleRow | null | undefined,
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

function roleSiteId(row: SiteRoleRow | null | undefined) {
  return textValue(row, ["site_id"]);
}

function roleSiteName(row: SiteRoleRow | null | undefined) {
  return textValue(row, ["site_name", "name"]);
}

function roleSiteCode(row: SiteRoleRow | null | undefined) {
  return textValue(row, ["site_code", "code"]);
}

function roleCode(row: SiteRoleRow | null | undefined) {
  return textValue(row, ["role_code"]);
}

function roleLabel(row: SiteRoleRow | null | undefined) {
  return (
    textValue(row, ["role_label", "label", "display_name"]) || roleCode(row)
  );
}

function roleIsActive(row: SiteRoleRow | null | undefined) {
  return booleanValue(row, ["is_active", "active"], true);
}

function roleKey(row: SiteRoleRow) {
  return textValue(row, ["id"]) || `${roleSiteId(row)}:${roleCode(row)}`;
}

async function saveSiteRole(formData: FormData) {
  "use server";

  const siteIdValue = readFormString(formData, "site_id");
  const roleCodeValue = normalizeRoleCode(
    readFormString(formData, "role_code"),
  );
  const isActive = formData.get("is_active") === "on";

  if (!siteIdValue) buildRedirect("error", "Selecciona una sede operativa.");
  if (!roleCodeValue)
    buildRedirect("error", "El código del rol operativo es obligatorio.");

  const { supabase } = await requireAppAccess({
    appId: "viso",
    returnTo: ROUTE,
  });

  const db = supabase as unknown as SupabaseLike;
  const result = await db.from("site_operational_roles").upsert(
    {
      site_id: siteIdValue,
      role_code: roleCodeValue,
      is_active: isActive,
    },
    { onConflict: "site_id,role_code" },
  );

  if (result.error) buildRedirect("error", result.error.message);

  buildRedirect(
    "ok",
    isActive
      ? "Rol operativo habilitado para la sede."
      : "Rol operativo desactivado para la sede.",
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
  const [sitesResult, rolesResult] = await Promise.all([
    db
      .from<SiteRow>("viso_operational_sites")
      .select("*")
      .order("name", { ascending: true }),
    db
      .from<SiteRoleRow>("viso_site_operational_roles")
      .select("*")
      .order("site_name", { ascending: true }),
  ]);

  const loadError =
    sitesResult.error?.message || rolesResult.error?.message || "";

  if (loadError) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Roles por sede"
          subtitle="Define qué roles operativos pueden usarse en cada sede sin crear módulos nuevos en la navegación principal."
        />
        <OperationsNav activePath={ROUTE} />
        <div className="ui-alert ui-alert--error">{loadError}</div>
      </div>
    );
  }

  const sites = sitesResult.data ?? [];
  const roles = rolesResult.data ?? [];
  const activeRolesCount = roles.filter(roleIsActive).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles por sede"
        subtitle="Configura los roles operativos permitidos por sede para aplicar contexto correcto en ANIMA, NEXO y VISO."
      />

      <OperationsNav activePath={ROUTE} />

      {errorMsg ? (
        <div className="ui-alert ui-alert--error">{errorMsg}</div>
      ) : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="ui-panel space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              Habilitar rol operativo
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Crea el código operativo que necesite la sede. No es un catálogo
              fijo de cargos; es una regla operativa por sede.
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
                Rol operativo
              </span>
              <input
                name="role_code"
                className="ui-input"
                placeholder="Ejemplo: conductor_ruta"
                autoComplete="off"
                required
              />
              <p className="text-xs leading-5 text-slate-500">
                Se normaliza automáticamente a minúsculas, sin tildes y con
                guiones bajos. Ejemplo: Conductor Ruta → conductor_ruta.
              </p>
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

            <button type="submit" className="ui-btn ui-btn--brand">
              Guardar rol por sede
            </button>
          </form>
        </div>

        <div className="ui-panel space-y-5">
          <div className="grid gap-3 md:grid-cols-3">
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
                Roles activos
              </p>
              <p className="mt-2 text-2xl font-semibold text-[var(--ui-text)]">
                {activeRolesCount}
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ui-muted)]">
                Total reglas
              </p>
              <p className="mt-2 text-2xl font-semibold text-[var(--ui-text)]">
                {roles.length}
              </p>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              Reglas configuradas
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Estas reglas limitan qué rol operativo se puede aplicar a un turno
              según su sede operativa.
            </p>
          </div>
        </div>
      </div>

      <div className="ui-panel">
        {roles.length === 0 ? (
          <div className="ui-empty">
            No hay roles operativos por sede configurados.
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Sede</TableHeaderCell>
                <TableHeaderCell>Rol operativo</TableHeaderCell>
                <TableHeaderCell>Código</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {roles.map((role) => {
                const active = roleIsActive(role);
                const siteValue = roleSiteId(role);
                const codeValue = roleCode(role);

                return (
                  <TableRow key={roleKey(role)}>
                    <TableCell>
                      <div className="font-medium text-slate-950">
                        {roleSiteName(role) || "—"}
                      </div>
                      {roleSiteCode(role) ? (
                        <div className="mt-1 text-xs text-slate-500">
                          {roleSiteCode(role)}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>{roleLabel(role) || "—"}</TableCell>
                    <TableCell>
                      <code className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                        {codeValue || "—"}
                      </code>
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
                          <input
                            type="hidden"
                            name="site_id"
                            value={siteValue}
                          />
                          <input
                            type="hidden"
                            name="role_code"
                            value={codeValue}
                          />
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
