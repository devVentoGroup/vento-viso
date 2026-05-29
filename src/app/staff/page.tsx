import Link from "next/link";

import { PageHeader } from "@/components/vento/standard/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/vento/standard/table";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type SiteLite = {
  id: string;
  name: string | null;
  code: string | null;
};

type EmployeeRow = {
  id: string;
  full_name: string | null;
  alias: string | null;
  role: string | null;
  is_active: boolean | null;
  site_id: string | null;
  site?: SiteLite | SiteLite[] | null;
};

type EmployeeSiteLink = {
  employee_id: string;
  site_id: string;
  is_primary: boolean | null;
  is_active: boolean | null;
  site?: SiteLite | SiteLite[] | null;
};

type AttendanceStatusRow = {
  employee_id: string;
  current_status: "check_in" | "check_out" | null;
  last_action_at: string | null;
  last_site_id: string | null;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("es-CO", {
      timeZone: "America/Bogota",
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function attendanceLabel(status: AttendanceStatusRow | undefined) {
  if (!status || !status.current_status) return { label: "Sin registros", tone: "" };
  if (status.current_status === "check_in") return { label: "En turno", tone: "ui-chip--success" };
  return { label: "Fuera de turno", tone: "" };
}

export default async function StaffPage({
  searchParams,
}: {
  searchParams?: Promise<{ site?: string; status?: string; role?: string }>;
}) {
  await requireAppAccess({
    appId: "viso",
    returnTo: "/staff",
    permissionCode: "staff.read",
  });

  const supabase = createAdminClient();
  const resolvedSearchParams = (await searchParams) ?? {};
  const siteFilter = typeof resolvedSearchParams.site === "string" ? resolvedSearchParams.site : "all";
  const statusFilter = typeof resolvedSearchParams.status === "string" ? resolvedSearchParams.status : "all";
  const roleFilter = typeof resolvedSearchParams.role === "string" ? resolvedSearchParams.role : "all";

  const [{ data, error: employeesError }, { data: sitesData }] = await Promise.all([
    supabase
      .from("employees")
      .select("id,full_name,alias,role,is_active,site_id,site:sites!employees_site_id_fkey(id,name,code)")
      .order("full_name", { ascending: true }),
    supabase.from("sites").select("id,name,code").order("name", { ascending: true }),
  ]);

  if (employeesError) {
    console.error("Staff list query error:", employeesError);
    return (
      <div className="space-y-6">
        <PageHeader
          title="Trabajadores"
          subtitle="Gestiona empleados, sedes asignadas, estado y asistencia reciente."
        />
        <div className="ui-panel border-[var(--ui-danger)] bg-[var(--ui-danger-soft)]">
          <p className="font-medium text-[var(--ui-danger)]">Error al cargar la lista de trabajadores</p>
          <p className="mt-1 text-sm text-[var(--ui-muted)]">
            Revisa que la tabla <code className="rounded bg-black/10 px-1">employees</code> exista y que el proyecto tenga las variables de Supabase correctas. Detalle en consola del servidor.
          </p>
          <p className="mt-2 text-xs text-[var(--ui-muted)]">{employeesError.message}</p>
        </div>
      </div>
    );
  }

  const employees = (data ?? []) as EmployeeRow[];
  const sites = ((sitesData ?? []) as SiteLite[]).sort((a, b) => (a.name ?? a.code ?? "").localeCompare(b.name ?? b.code ?? "", "es"));
  const roleOptions = Array.from(new Set(employees.map((employee) => employee.role).filter((role): role is string => Boolean(role)))).sort((a, b) => a.localeCompare(b, "es"));
  const employeeIds = employees.map((employee) => employee.id);

  let linksByEmployee = new Map<string, EmployeeSiteLink[]>();
  let attendanceByEmployee = new Map<string, AttendanceStatusRow>();
  const cardReadinessByEmployee = new Map<
    string,
    { contract_active: boolean; documents_complete: boolean }
  >();

  if (employeeIds.length > 0) {
    const [{ data: employeeSites }, { data: attendanceRows }, eligibilityRes] = await Promise.all([
      supabase
        .from("employee_sites")
        .select("employee_id,site_id,is_primary,is_active,site:sites!employee_sites_site_id_fkey(id,name,code)")
        .in("employee_id", employeeIds)
        .order("is_primary", { ascending: false }),
      supabase
        .from("employee_attendance_status")
        .select("employee_id,current_status,last_action_at,last_site_id")
        .in("employee_id", employeeIds),
      supabase.rpc("employee_wallet_eligibility"),
    ]);

    linksByEmployee = (employeeSites ?? []).reduce((map, row) => {
      const link = row as EmployeeSiteLink;
      const list = map.get(link.employee_id) ?? [];
      list.push(link);
      map.set(link.employee_id, list);
      return map;
    }, new Map<string, EmployeeSiteLink[]>());

    attendanceByEmployee = (attendanceRows ?? []).reduce((map, row) => {
      const status = row as AttendanceStatusRow;
      map.set(status.employee_id, status);
      return map;
    }, new Map<string, AttendanceStatusRow>());

    (eligibilityRes?.data ?? []).forEach((row: { employee_id: string; contract_active: boolean; documents_complete: boolean }) => {
      cardReadinessByEmployee.set(row.employee_id, {
        contract_active: row.contract_active,
        documents_complete: row.documents_complete,
      });
    });
  }

  const filteredEmployees = employees.filter((employee) => {
    const matchesSite =
      siteFilter === "all" ||
      employee.site_id === siteFilter ||
      (linksByEmployee.get(employee.id) ?? []).some((link) => link.site_id === siteFilter);

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" ? employee.is_active === true : employee.is_active !== true);

    const matchesRole = roleFilter === "all" || employee.role === roleFilter;

    return matchesSite && matchesStatus && matchesRole;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trabajadores"
        subtitle="Gestiona empleados, sedes asignadas, estado y asistencia reciente."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/staff/attendance" className="ui-btn ui-btn--ghost">
              Reportes
            </Link>
            <Link href="/staff/schedule" className="ui-btn ui-btn--ghost">
              Horario semanal
            </Link>
            <Link href="/staff/new" className="ui-btn ui-btn--brand">
              Invitar trabajador
            </Link>
          </div>
        }
      />

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--ui-border)] bg-white/80 px-4 py-3">
        <label className="min-w-[180px] flex-1 text-sm text-[var(--ui-muted)]">
          <span className="mb-1 block text-xs font-medium uppercase tracking-[0.16em] text-[var(--ui-muted)]/80">Sede</span>
          <select name="site" defaultValue={siteFilter} className="ui-input">
            <option value="all">Todas</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name ?? site.code ?? site.id}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[160px] flex-1 text-sm text-[var(--ui-muted)]">
          <span className="mb-1 block text-xs font-medium uppercase tracking-[0.16em] text-[var(--ui-muted)]/80">Estado</span>
          <select name="status" defaultValue={statusFilter} className="ui-input">
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        </label>
        <label className="min-w-[180px] flex-1 text-sm text-[var(--ui-muted)]">
          <span className="mb-1 block text-xs font-medium uppercase tracking-[0.16em] text-[var(--ui-muted)]/80">Rol</span>
          <select name="role" defaultValue={roleFilter} className="ui-input">
            <option value="all">Todos</option>
            {roleOptions.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <button type="submit" className="ui-btn ui-btn--ghost">
            Filtrar
          </button>
          <Link href="/staff" className="ui-btn ui-btn--ghost">
            Limpiar
          </Link>
        </div>
      </form>

      <div className="ui-panel ui-panel--accent-brand">
        {filteredEmployees.length === 0 ? (
          <div className="ui-empty flex flex-col items-center gap-4 py-12">
            <p className="text-[var(--ui-muted)]">{employees.length === 0 ? "Aún no hay trabajadores registrados." : "No hay trabajadores que coincidan con esos filtros."}</p>
            {employees.length === 0 ? (
              <>
                <p className="text-center text-sm text-[var(--ui-muted)]">
                  Usa el botón de arriba para invitar al primer trabajador por correo; recibirá un enlace para completar su perfil y asignarse a una sede.
                </p>
                <Link href="/staff/new" className="ui-btn ui-btn--brand">
                  Invitar trabajador
                </Link>
              </>
            ) : (
              <Link href="/staff" className="ui-btn ui-btn--ghost">
                Limpiar filtros
              </Link>
            )}
          </div>
        ) : (
          <Table className="ui-table--accent">
            <TableHead>
              <TableRow>
                <TableHeaderCell>Nombre</TableHeaderCell>
                <TableHeaderCell>Rol</TableHeaderCell>
                <TableHeaderCell>Sedes</TableHeaderCell>
                <TableHeaderCell>Contrato / Carnet</TableHeaderCell>
                <TableHeaderCell>Asistencia</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredEmployees.map((employee) => {
                const directSite = Array.isArray(employee.site) ? employee.site[0] ?? null : employee.site ?? null;
                const links = linksByEmployee.get(employee.id) ?? [];
                const primaryLink = links.find((link) => link.is_primary) ?? null;
                const primarySite = primaryLink
                  ? Array.isArray(primaryLink.site)
                    ? primaryLink.site[0] ?? null
                    : primaryLink.site ?? null
                  : null;

                const siteNames = links
                  .map((link) => (Array.isArray(link.site) ? link.site[0] ?? null : link.site ?? null))
                  .filter((site): site is SiteLite => Boolean(site))
                  .map((site) => site.name ?? site.code ?? site.id);

                const attendance = attendanceByEmployee.get(employee.id);
                const attendanceChip = attendanceLabel(attendance);
                const cardReadiness = cardReadinessByEmployee.get(employee.id);
                const cardReady = Boolean(cardReadiness?.contract_active && cardReadiness?.documents_complete);

                return (
                  <TableRow key={employee.id}>
                    <TableCell>
                      <div className="font-semibold">{employee.full_name ?? "Sin nombre"}</div>
                      <div className="ui-caption">{employee.alias ?? employee.id}</div>
                    </TableCell>
                    <TableCell>{employee.role ?? "-"}</TableCell>
                    <TableCell>
                      <div>{primarySite?.name ?? directSite?.name ?? "Sin sede principal"}</div>
                      <div className="ui-caption">
                        {siteNames.length > 0
                          ? `${siteNames.length} sede(s): ${siteNames.slice(0, 2).join(", ")}${siteNames.length > 2 ? "..." : ""}`
                          : "Sin sedes asignadas"}
                      </div>
                    </TableCell>
                    <TableCell>
                      {cardReadiness ? (
                        <div className="flex flex-wrap gap-1">
                          <span className={`ui-chip ${cardReadiness.contract_active ? "ui-chip--success" : ""}`} title="Contrato activo">
                            {cardReadiness.contract_active ? "Contrato OK" : "Sin contrato"}
                          </span>
                          <span
                            className={`ui-chip ${cardReadiness.documents_complete ? "ui-chip--success" : ""}`}
                            title="Valida documentos requeridos por sede/rol (no total de archivos subidos)."
                          >
                            {cardReadiness.documents_complete ? "Docs OK" : "Faltan docs"}
                          </span>
                          <span className={`ui-chip ${cardReady ? "ui-chip--brand" : ""}`} title="Carnet laboral interno">
                            {cardReady ? "Carnet listo" : "Carnet pendiente"}
                          </span>
                        </div>
                      ) : (
                        <span className="ui-caption">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={`ui-chip ${attendanceChip.tone}`}>{attendanceChip.label}</span>
                      <div className="ui-caption">{formatDateTime(attendance?.last_action_at)}</div>
                    </TableCell>
                    <TableCell>
                      <span className={`ui-chip ${employee.is_active ? "ui-chip--success" : ""}`}>
                        {employee.is_active ? "Activo" : "Inactivo"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/staff/${employee.id}`} className="ui-btn ui-btn--ghost ui-btn--sm">
                        Editar
                      </Link>
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
