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

export default async function StaffPage() {
  await requireAppAccess({
    appId: "viso",
    returnTo: "/staff",
  });

  const supabase = createAdminClient();

  const { data, error: employeesError } = await supabase
    .from("employees")
    .select("id,full_name,alias,role,is_active,site_id,site:sites!employees_site_id_fkey(id,name,code)")
    .order("full_name", { ascending: true });

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
  const employeeIds = employees.map((employee) => employee.id);

  let linksByEmployee = new Map<string, EmployeeSiteLink[]>();
  let attendanceByEmployee = new Map<string, AttendanceStatusRow>();

  if (employeeIds.length > 0) {
    const [{ data: employeeSites }, { data: attendanceRows }] = await Promise.all([
      supabase
        .from("employee_sites")
        .select("employee_id,site_id,is_primary,is_active,site:sites!employee_sites_site_id_fkey(id,name,code)")
        .in("employee_id", employeeIds)
        .order("is_primary", { ascending: false }),
      supabase
        .from("employee_attendance_status")
        .select("employee_id,current_status,last_action_at,last_site_id")
        .in("employee_id", employeeIds),
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
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trabajadores"
        subtitle="Gestiona empleados, sedes asignadas, estado y asistencia reciente."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/staff/schedule" className="ui-btn ui-btn--ghost">
              Horario semanal
            </Link>
            <Link href="/staff/new" className="ui-btn ui-btn--brand">
              Invitar trabajador
            </Link>
          </div>
        }
      />

      <div className="ui-panel ui-panel--accent-brand">
        {employees.length === 0 ? (
          <div className="ui-empty flex flex-col items-center gap-4 py-12">
            <p className="text-[var(--ui-muted)]">Aún no hay trabajadores registrados.</p>
            <p className="text-center text-sm text-[var(--ui-muted)]">
              Usa el botón de arriba para invitar al primer trabajador por correo; recibirá un enlace para completar su perfil y asignarse a una sede.
            </p>
            <Link href="/staff/new" className="ui-btn ui-btn--brand">
              Invitar trabajador
            </Link>
          </div>
        ) : (
          <Table className="ui-table--accent">
            <TableHead>
              <TableRow>
                <TableHeaderCell>Nombre</TableHeaderCell>
                <TableHeaderCell>Rol</TableHeaderCell>
                <TableHeaderCell>Sedes</TableHeaderCell>
                <TableHeaderCell>Asistencia</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {employees.map((employee) => {
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
