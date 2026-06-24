import { OperationsNav } from "@/components/viso/operations-nav";
import { PageHeader } from "@/components/vento/standard/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/vento/standard/table";
import { requireAppAccess } from "@/lib/auth/guard";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const ROUTE = "/operations/employee-profiles";

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
    upsert: (values: Record<string, unknown>, options?: Record<string, unknown>) => Promise<RpcResponse>;
  };
  rpc: (functionName: string, args?: Record<string, unknown>) => Promise<RpcResponse>;
};

type EmployeeRow = {
  id: string;
  full_name: string | null;
  alias: string | null;
  role: string | null;
  site_id: string | null;
};

type SiteRow = {
  id: string;
  name: string | null;
  site_type: string | null;
  operational_visibility: string | null;
};

type SiteRoleRow = {
  id: string;
  site_id: string | null;
  role_code: string | null;
  is_active: boolean | null;
};

type CheckinPointRow = {
  [key: string]: unknown;
};

type ProfileRow = {
  employee_id: string | null;
  site_operational_role_id: string | null;
  checkin_site_id: string | null;
  checkout_site_id: string | null;
  is_active: boolean | null;
};

type LoadedData = {
  employees: EmployeeRow[];
  sites: SiteRow[];
  siteRoles: SiteRoleRow[];
  points: CheckinPointRow[];
  profiles: ProfileRow[];
  errors: string[];
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

function isRpcSignatureError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("could not find the function") ||
    (normalized.includes("function") && normalized.includes("does not exist")) ||
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

function pointId(row: CheckinPointRow | null | undefined) {
  return textValue(row, ["id", "site_id"]);
}

function pointName(row: CheckinPointRow | null | undefined) {
  return textValue(row, ["name", "site_name", "label"]);
}

function pointCode(row: CheckinPointRow | null | undefined) {
  return textValue(row, ["code", "site_code"]);
}

function employeeName(employee: EmployeeRow | null | undefined) {
  if (!employee) return "Trabajador no encontrado";
  return employee.alias || employee.full_name || employee.id;
}

function siteName(site: SiteRow | null | undefined) {
  if (!site) return "Sede no encontrada";
  return site.name || site.id;
}

function pointLabel(point: CheckinPointRow | null | undefined) {
  if (!point) return "No asignado";
  const code = pointCode(point);
  const name = pointName(point);
  if (code && name) return `${name} · ${code}`;
  return name || code || pointId(point) || "Punto sin nombre";
}

function profileKey(profile: ProfileRow) {
  return [profile.employee_id, profile.site_operational_role_id].filter(Boolean).join("::");
}

function isOperationalSite(site: SiteRow) {
  return String(site.operational_visibility ?? "operational") === "operational";
}

async function loadTable<T>({
  db,
  table,
  columns,
  orderColumn,
}: {
  db: SupabaseLike;
  table: string;
  columns: string;
  orderColumn: string;
}): Promise<QueryResponse<T>> {
  return db.from<T>(table).select(columns).order(orderColumn, { ascending: true });
}

async function loadData(db: SupabaseLike): Promise<LoadedData> {
  const [employeesRes, sitesRes, siteRolesRes, pointsRes, profilesRes] = await Promise.all([
    loadTable<EmployeeRow>({
      db,
      table: "employees",
      columns: "id,full_name,alias,role,site_id",
      orderColumn: "full_name",
    }),
    loadTable<SiteRow>({
      db,
      table: "sites",
      columns: "id,name,site_type,operational_visibility",
      orderColumn: "name",
    }),
    loadTable<SiteRoleRow>({
      db,
      table: "site_operational_roles",
      columns: "id,site_id,role_code,is_active",
      orderColumn: "role_code",
    }),
    loadTable<CheckinPointRow>({
      db,
      table: "viso_operational_checkin_points",
      columns: "*",
      orderColumn: "name",
    }),
    loadTable<ProfileRow>({
      db,
      table: "employee_site_operational_profiles",
      columns: "employee_id,site_operational_role_id,checkin_site_id,checkout_site_id,is_active",
      orderColumn: "employee_id",
    }),
  ]);

  const errors = [employeesRes, sitesRes, siteRolesRes, pointsRes, profilesRes]
    .map((res) => res.error?.message ?? "")
    .filter(Boolean);

  return {
    employees: employeesRes.data ?? [],
    sites: (sitesRes.data ?? []).filter(isOperationalSite),
    siteRoles: (siteRolesRes.data ?? []).filter((row) => row.is_active !== false),
    points: pointsRes.data ?? [],
    profiles: profilesRes.data ?? [],
    errors,
  };
}

async function saveEmployeeProfile(formData: FormData) {
  "use server";

  const employeeId = readFormString(formData, "employee_id");
  const siteOperationalRoleId = readFormString(formData, "site_operational_role_id");
  const checkinSiteId = readFormString(formData, "checkin_site_id");
  const checkoutSiteId = readFormString(formData, "checkout_site_id");
  const statusAction = readFormString(formData, "status_action");
  const isActive = statusAction === "deactivate" ? false : statusAction === "activate" ? true : formData.get("is_active") === "on";

  if (!employeeId) buildRedirect("error", "Selecciona un trabajador.");
  if (!siteOperationalRoleId) buildRedirect("error", "Selecciona una sede y un rol operativo.");
  if (!checkinSiteId) buildRedirect("error", "Selecciona el punto físico de entrada.");
  if (!checkoutSiteId) buildRedirect("error", "Selecciona el punto físico de salida.");

  const { supabase } = await requireAppAccess({
    appId: "viso",
    returnTo: ROUTE,
  });

  const db = supabase as unknown as SupabaseLike;
  const payload = {
    employee_id: employeeId,
    site_operational_role_id: siteOperationalRoleId,
    checkin_site_id: checkinSiteId,
    checkout_site_id: checkoutSiteId,
    is_active: isActive,
  };

  let result = await db.rpc("upsert_employee_site_operational_profile", {
    p_employee_id: employeeId,
    p_site_operational_role_id: siteOperationalRoleId,
    p_checkin_site_id: checkinSiteId,
    p_checkout_site_id: checkoutSiteId,
    p_is_active: isActive,
  });

  if (result.error && isRpcSignatureError(result.error.message)) {
    result = await db.from<ProfileRow>("employee_site_operational_profiles").upsert(payload, {
      onConflict: "employee_id,site_operational_role_id",
    });
  }

  if (result.error) buildRedirect("error", result.error.message);

  buildRedirect("ok", isActive ? "Perfil operativo guardado." : "Perfil operativo desactivado.");
}

export default async function EmployeeProfilesPage({
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
  const { employees, sites, siteRoles, points, profiles, errors } = await loadData(db);

  const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));
  const siteMap = new Map(sites.map((site) => [site.id, site]));
  const pointMap = new Map(points.map((point) => [pointId(point), point]));
  const siteRoleMap = new Map(siteRoles.map((role) => [role.id, role]));
  const siteRoleOptions = siteRoles
    .map((row) => {
      const siteOperationalRoleId = String(row.id ?? "").trim();
      const siteId = String(row.site_id ?? "").trim();
      const roleCode = String(row.role_code ?? "").trim();
      if (!siteOperationalRoleId || !siteId || !roleCode) return null;
      return {
        value: siteOperationalRoleId,
        label: `${siteName(siteMap.get(siteId))} · ${roleCode}`,
      };
    })
    .filter((option): option is { value: string; label: string } => Boolean(option));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Perfiles operativos"
        subtitle="Asigna trabajador, sede operativa, rol y puntos físicos de entrada y salida para preparar turnos con contexto consistente."
      />

      <OperationsNav activePath={ROUTE} />

      {errors.length ? (
        <div className="ui-alert ui-alert--error">
          {errors.map((message) => (
            <div key={message}>{message}</div>
          ))}
        </div>
      ) : null}
      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}

      <section className="ui-panel space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-[var(--ui-text)]">Nuevo perfil operativo</h2>
          <p className="mt-1 text-sm text-[var(--ui-muted)]">
            El perfil define dónde trabaja la persona, con qué rol operativo y desde qué puntos físicos puede marcar entrada y salida.
          </p>
        </div>

        <form action={saveEmployeeProfile} className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-medium text-[var(--ui-text)]">Trabajador</span>
            <select name="employee_id" className="ui-input" required>
              <option value="">Seleccionar trabajador</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employeeName(employee)}{employee.role ? ` · ${employee.role}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-[var(--ui-text)]">Sede y rol operativo</span>
            <select name="site_operational_role_id" className="ui-input" required>
              <option value="">Seleccionar sede y rol</option>
              {siteRoleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-[var(--ui-text)]">Punto físico de entrada</span>
            <select name="checkin_site_id" className="ui-input" required>
              <option value="">Seleccionar punto</option>
              {points.map((point) => {
                const id = pointId(point);
                return id ? (
                  <option key={id} value={id}>
                    {pointLabel(point)}
                  </option>
                ) : null;
              })}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-[var(--ui-text)]">Punto físico de salida</span>
            <select name="checkout_site_id" className="ui-input" required>
              <option value="">Seleccionar punto</option>
              {points.map((point) => {
                const id = pointId(point);
                return id ? (
                  <option key={id} value={id}>
                    {pointLabel(point)}
                  </option>
                ) : null;
              })}
            </select>
          </label>

          <label className="flex items-center gap-2 md:col-span-2">
            <input name="is_active" type="checkbox" defaultChecked className="h-4 w-4" />
            <span className="text-sm font-medium text-[var(--ui-text)]">Activo</span>
          </label>

          <div className="md:col-span-2">
            <button type="submit" className="ui-btn ui-btn--brand">
              Guardar perfil
            </button>
          </div>
        </form>
      </section>

      <section className="ui-panel">
        {profiles.length === 0 ? (
          <div className="ui-empty">No hay perfiles operativos configurados.</div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Trabajador</TableHeaderCell>
                <TableHeaderCell>Sede</TableHeaderCell>
                <TableHeaderCell>Rol operativo</TableHeaderCell>
                <TableHeaderCell>Entrada</TableHeaderCell>
                <TableHeaderCell>Salida</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {profiles.map((profile) => {
                const employeeId = String(profile.employee_id ?? "");
                const siteOperationalRoleId = String(profile.site_operational_role_id ?? "");
                const siteRole = siteRoleMap.get(siteOperationalRoleId);
                const siteId = String(siteRole?.site_id ?? "");
                const roleCode = String(siteRole?.role_code ?? "");
                const checkinSiteId = String(profile.checkin_site_id ?? "");
                const checkoutSiteId = String(profile.checkout_site_id ?? "");
                const isActive = profile.is_active !== false;

                return (
                  <TableRow key={profileKey(profile)}>
                    <TableCell>{employeeName(employeeMap.get(employeeId))}</TableCell>
                    <TableCell>{siteName(siteMap.get(siteId))}</TableCell>
                    <TableCell>{roleCode || "Rol no encontrado"}</TableCell>
                    <TableCell>{pointLabel(pointMap.get(checkinSiteId))}</TableCell>
                    <TableCell>{pointLabel(pointMap.get(checkoutSiteId))}</TableCell>
                    <TableCell>
                      <span className={`ui-chip ${isActive ? "ui-chip--success" : ""}`}>
                        {isActive ? "Activo" : "Inactivo"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <form action={saveEmployeeProfile}>
                        <input type="hidden" name="employee_id" value={employeeId} />
                        <input type="hidden" name="site_operational_role_id" value={siteOperationalRoleId} />
                        <input type="hidden" name="checkin_site_id" value={checkinSiteId} />
                        <input type="hidden" name="checkout_site_id" value={checkoutSiteId} />
                        <input type="hidden" name="status_action" value={isActive ? "deactivate" : "activate"} />
                        <button type="submit" className="ui-btn ui-btn--ghost ui-btn--sm">
                          {isActive ? "Desactivar" : "Activar"}
                        </button>
                      </form>
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
