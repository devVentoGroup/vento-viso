import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { PageHeader } from "@/components/vento/standard/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/vento/standard/table";
import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SiteRow = {
  id: string;
  name: string | null;
  code: string | null;
};

type RoleRow = {
  code: string;
  name: string;
};

type EmployeeRow = {
  id: string;
  full_name: string | null;
  alias: string | null;
  role: string | null;
  is_active: boolean | null;
  site_id: string | null;
};

type EmployeeSiteRow = {
  site_id: string;
  is_primary: boolean | null;
  is_active: boolean | null;
  site?: { id: string; name: string | null; code: string | null } | { id: string; name: string | null; code: string | null }[] | null;
};

type AttendanceStatusRow = {
  employee_id: string;
  current_status: "check_in" | "check_out" | null;
  last_action_at: string | null;
  last_site_id: string | null;
};

type AttendanceLogRow = {
  id: string;
  action: "check_in" | "check_out";
  occurred_at: string;
  source: string | null;
  accuracy_meters: number | null;
  site_id: string | null;
  site?: { id: string; name: string | null; code: string | null } | { id: string; name: string | null; code: string | null }[] | null;
};

type ShiftRow = {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  status: string;
  site_id: string;
  site?: { id: string; name: string | null; code: string | null } | { id: string; name: string | null; code: string | null }[] | null;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function asBool(value: FormDataEntryValue | null) {
  return value === "on" || value === "true";
}

function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

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

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" }).format(new Date(value));
  } catch {
    return value;
  }
}

async function updateEmployee(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const id = asText(formData.get("id"));
  const fullName = asText(formData.get("full_name"));
  const alias = asText(formData.get("alias"));
  const role = asText(formData.get("role"));
  const siteId = asText(formData.get("site_id"));
  const isActive = asBool(formData.get("is_active"));

  if (!id || !fullName || !role || !siteId) {
    redirect(`/staff/${id}?error=${encodeURIComponent("Faltan campos obligatorios.")}`);
  }

  const { error } = await supabase
    .from("employees")
    .update({
      full_name: fullName,
      alias: alias || null,
      role,
      site_id: siteId,
      is_active: isActive,
    })
    .eq("id", id);

  if (error) {
    redirect(`/staff/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/staff/${id}`);
  revalidatePath("/staff");
  redirect("/staff?ok=" + encodeURIComponent("Trabajador actualizado."));
}

async function deleteEmployee(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const id = asText(formData.get("id"));
  if (!id) redirect("/staff?error=" + encodeURIComponent("Empleado invalido."));

  const { error } = await supabase.from("employees").delete().eq("id", id);
  if (error) {
    redirect(`/staff/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/staff");
  redirect("/staff?ok=deleted");
}

async function addEmployeeSite(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const employeeId = asText(formData.get("employee_id"));
  const siteId = asText(formData.get("site_id"));
  const makePrimary = asBool(formData.get("is_primary"));

  if (!employeeId || !siteId) {
    redirect(`/staff/${employeeId}?error=${encodeURIComponent("Selecciona una sede.")}`);
  }

  if (makePrimary) {
    await supabase
      .from("employee_sites")
      .update({ is_primary: false })
      .eq("employee_id", employeeId);
  }

  const { error } = await supabase.from("employee_sites").insert({
    employee_id: employeeId,
    site_id: siteId,
    is_primary: makePrimary,
    is_active: true,
  });

  if (error) {
    redirect(`/staff/${employeeId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/staff/${employeeId}`);
  redirect(`/staff/${employeeId}?ok=site_added`);
}

async function setPrimarySite(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const employeeId = asText(formData.get("employee_id"));
  const siteId = asText(formData.get("site_id"));

  if (!employeeId || !siteId) {
    redirect(`/staff/${employeeId}?error=${encodeURIComponent("Sede invalida.")}`);
  }

  await supabase
    .from("employee_sites")
    .update({ is_primary: false })
    .eq("employee_id", employeeId);

  const { error } = await supabase
    .from("employee_sites")
    .update({ is_primary: true, is_active: true })
    .eq("employee_id", employeeId)
    .eq("site_id", siteId);

  if (error) {
    redirect(`/staff/${employeeId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/staff/${employeeId}`);
  redirect(`/staff/${employeeId}?ok=primary_set`);
}

async function toggleEmployeeSite(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const employeeId = asText(formData.get("employee_id"));
  const siteId = asText(formData.get("site_id"));
  const nextActive = asBool(formData.get("is_active"));

  const { error } = await supabase
    .from("employee_sites")
    .update({ is_active: nextActive })
    .eq("employee_id", employeeId)
    .eq("site_id", siteId);

  if (error) {
    redirect(`/staff/${employeeId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/staff/${employeeId}`);
  redirect(`/staff/${employeeId}?ok=site_updated`);
}

async function removeEmployeeSite(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const employeeId = asText(formData.get("employee_id"));
  const siteId = asText(formData.get("site_id"));

  const { error } = await supabase
    .from("employee_sites")
    .delete()
    .eq("employee_id", employeeId)
    .eq("site_id", siteId);

  if (error) {
    redirect(`/staff/${employeeId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/staff/${employeeId}`);
  redirect(`/staff/${employeeId}?ok=site_removed`);
}

export default async function StaffDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const okMsg = sp.ok ? safeDecode(sp.ok) : "";
  const errorMsg = sp.error ? safeDecode(sp.error) : "";
  const { id } = await params;

  const { supabase } = await requireAppAccess({
    appId: "viso",
    returnTo: `/staff/${id}`,
  });

  const [{ data: employee }, { data: sites }, { data: roles }, { data: employeeSites }, { data: attendanceStatus }, { data: attendanceLogs }, { data: shifts }] = await Promise.all([
    supabase
      .from("employees")
      .select("id,full_name,alias,role,is_active,site_id")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("sites")
      .select("id,name,code")
      .order("name", { ascending: true }),
    supabase
      .from("roles")
      .select("code,name")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("employee_sites")
      .select("site_id,is_primary,is_active,site:sites(id,name,code)")
      .eq("employee_id", id)
      .order("is_primary", { ascending: false }),
    supabase
      .from("employee_attendance_status")
      .select("employee_id,current_status,last_action_at,last_site_id")
      .eq("employee_id", id)
      .maybeSingle(),
    supabase
      .from("attendance_logs")
      .select("id,action,occurred_at,source,accuracy_meters,site_id,site:sites(id,name,code)")
      .eq("employee_id", id)
      .order("occurred_at", { ascending: false })
      .limit(20),
    supabase
      .from("employee_shifts")
      .select("id,shift_date,start_time,end_time,status,site_id,site:sites(id,name,code)")
      .eq("employee_id", id)
      .gte("shift_date", new Date().toISOString().slice(0, 10))
      .order("shift_date", { ascending: true })
      .limit(15),
  ]);

  if (!employee) {
    redirect("/staff?error=" + encodeURIComponent("Empleado no encontrado."));
  }

  const siteRows = (sites ?? []) as SiteRow[];
  const roleRows = (roles ?? []) as RoleRow[];
  const emp = employee as EmployeeRow;
  const siteLinks = (employeeSites ?? []) as EmployeeSiteRow[];
  const attendance = (attendanceStatus ?? null) as AttendanceStatusRow | null;
  const attendanceRows = (attendanceLogs ?? []) as AttendanceLogRow[];
  const shiftRows = (shifts ?? []) as ShiftRow[];

  const attendanceLabel = attendance?.current_status === "check_in" ? "En turno" : attendance?.current_status === "check_out" ? "Fuera de turno" : "Sin registros";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Editar trabajador"
        subtitle="Actualiza datos, roles, sedes y revisa asistencia/turnos."
        actions={
          <Link href="/staff" className="ui-btn ui-btn--ghost">
            Volver
          </Link>
        }
      />

      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">Listo: {okMsg}</div> : null}

      <div className="ui-panel space-y-6">
        <form action={updateEmployee} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="id" value={emp.id} />
          <label className="space-y-2 sm:col-span-2">
            <span className="ui-label">Nombre completo</span>
            <input name="full_name" className="ui-input" defaultValue={emp.full_name ?? ""} required />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Alias</span>
            <input name="alias" className="ui-input" defaultValue={emp.alias ?? ""} />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Rol</span>
            <select name="role" className="ui-input" defaultValue={emp.role ?? ""} required>
              <option value="">Selecciona un rol</option>
              {roleRows.map((role) => (
                <option key={role.code} value={role.code}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="ui-label">Sede principal</span>
            <select name="site_id" className="ui-input" defaultValue={emp.site_id ?? ""} required>
              <option value="">Selecciona una sede</option>
              {siteRows.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name ?? site.code ?? site.id}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--ui-text)]">
            <input type="checkbox" name="is_active" defaultChecked={Boolean(emp.is_active)} />
            Activo
          </label>
          <div className="flex items-center gap-2 sm:col-span-2">
            <button type="submit" className="ui-btn ui-btn--brand">
              Guardar cambios
            </button>
          </div>
        </form>
        <form action={deleteEmployee} className="flex items-center gap-2">
          <input type="hidden" name="id" value={emp.id} />
          <button type="submit" className="ui-btn ui-btn--danger">
            Eliminar
          </button>
        </form>
      </div>

      <div className="ui-panel space-y-4">
        <div className="ui-h3">Sedes asignadas</div>

        <form action={addEmployeeSite} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input type="hidden" name="employee_id" value={emp.id} />
          <select name="site_id" className="ui-input">
            <option value="">Selecciona una sede</option>
            {siteRows.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name ?? site.code ?? site.id}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_primary" />
            Hacer principal
          </label>
          <button type="submit" className="ui-btn ui-btn--ghost">
            Agregar sede
          </button>
        </form>

        {siteLinks.length === 0 ? (
          <div className="ui-empty">Este trabajador no tiene sedes asignadas.</div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Sede</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell>Principal</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {siteLinks.map((link) => {
                const site = Array.isArray(link.site) ? link.site[0] ?? null : link.site ?? null;
                return (
                  <TableRow key={link.site_id}>
                    <TableCell>{site?.name ?? site?.code ?? link.site_id}</TableCell>
                    <TableCell>
                      <form action={toggleEmployeeSite} className="flex items-center gap-2">
                        <input type="hidden" name="employee_id" value={emp.id} />
                        <input type="hidden" name="site_id" value={link.site_id} />
                        <input type="hidden" name="is_active" value={String(!link.is_active)} />
                        <span className={`ui-chip ${link.is_active ? "ui-chip--success" : ""}`}>
                          {link.is_active ? "Activo" : "Inactivo"}
                        </span>
                        <button type="submit" className="ui-btn ui-btn--ghost ui-btn--sm">
                          {link.is_active ? "Desactivar" : "Activar"}
                        </button>
                      </form>
                    </TableCell>
                    <TableCell>
                      {link.is_primary ? (
                        <span className="ui-chip ui-chip--brand">Principal</span>
                      ) : (
                        <form action={setPrimarySite}>
                          <input type="hidden" name="employee_id" value={emp.id} />
                          <input type="hidden" name="site_id" value={link.site_id} />
                          <button type="submit" className="ui-btn ui-btn--ghost ui-btn--sm">
                            Hacer principal
                          </button>
                        </form>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <form action={removeEmployeeSite}>
                        <input type="hidden" name="employee_id" value={emp.id} />
                        <input type="hidden" name="site_id" value={link.site_id} />
                        <button type="submit" className="ui-btn ui-btn--ghost ui-btn--sm">
                          Quitar
                        </button>
                      </form>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="ui-panel space-y-4">
        <div className="ui-h3">Asistencia</div>
        <div className="flex flex-wrap items-center gap-3">
          <span className={`ui-chip ${attendance?.current_status === "check_in" ? "ui-chip--success" : ""}`}>
            {attendanceLabel}
          </span>
          <span className="ui-caption">Ultimo registro: {formatDateTime(attendance?.last_action_at)}</span>
        </div>

        {attendanceRows.length === 0 ? (
          <div className="ui-empty">No hay registros de asistencia para este trabajador.</div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Fecha</TableHeaderCell>
                <TableHeaderCell>Accion</TableHeaderCell>
                <TableHeaderCell>Sede</TableHeaderCell>
                <TableHeaderCell>Origen</TableHeaderCell>
                <TableHeaderCell>Precision</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {attendanceRows.map((row) => {
                const site = Array.isArray(row.site) ? row.site[0] ?? null : row.site ?? null;
                return (
                  <TableRow key={row.id}>
                    <TableCell>{formatDateTime(row.occurred_at)}</TableCell>
                    <TableCell>
                      <span className={`ui-chip ${row.action === "check_in" ? "ui-chip--success" : ""}`}>
                        {row.action === "check_in" ? "Entrada" : "Salida"}
                      </span>
                    </TableCell>
                    <TableCell>{site?.name ?? site?.code ?? row.site_id ?? "-"}</TableCell>
                    <TableCell>{row.source ?? "-"}</TableCell>
                    <TableCell>{row.accuracy_meters != null ? `${row.accuracy_meters} m` : "-"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="ui-panel space-y-4">
        <div className="ui-h3">Proximos turnos</div>
        {shiftRows.length === 0 ? (
          <div className="ui-empty">No hay turnos programados para este trabajador.</div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Fecha</TableHeaderCell>
                <TableHeaderCell>Horario</TableHeaderCell>
                <TableHeaderCell>Sede</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {shiftRows.map((shift) => {
                const site = Array.isArray(shift.site) ? shift.site[0] ?? null : shift.site ?? null;
                return (
                  <TableRow key={shift.id}>
                    <TableCell>{formatDate(shift.shift_date)}</TableCell>
                    <TableCell>{`${shift.start_time} - ${shift.end_time}`}</TableCell>
                    <TableCell>{site?.name ?? site?.code ?? shift.site_id}</TableCell>
                    <TableCell>
                      <span className="ui-chip">{shift.status}</span>
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
