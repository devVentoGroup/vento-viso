import Link from "next/link";
import Script from "next/script";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { PageHeader } from "@/components/vento/standard/page-header";
import { createAdminClient } from "@/lib/supabase/admin";

import { deleteShiftAction, saveShiftAction } from "../actions";
import {
  addDays,
  buildWeekDays,
  formatHoursCompact,
  formatWeekLabel,
  getShiftMinutes,
  isOperationalSite,
  isoDate,
  parseWeekStart,
  requireStaffScheduleAccess,
  safeDecode,
  type EmployeeRow,
  type ShiftRow,
  type SiteRow,
} from "../helpers";

export const dynamic = "force-dynamic";

type SiteEmployeeLinkRow = {
  employee_id: string;
  site_id: string;
  is_active: boolean | null;
  employee?: EmployeeRow | EmployeeRow[] | null;
};

type HiddenScheduleEmployeeRow = {
  employee_id: string;
  employee?: EmployeeRow | EmployeeRow[] | null;
};

const ZOOM_OPTIONS = [65, 75, 85, 100] as const;
const AREA_PALETTE = [
  "bg-violet-50",
  "bg-purple-50",
  "bg-fuchsia-50",
  "bg-indigo-50",
  "bg-slate-50",
  "bg-zinc-50",
] as const;
const BASE_GLOBAL_COLUMNS = [
  { key: "area", width: 88, minWidth: 42 },
  { key: "person", width: 88, minWidth: 46 },
] as const;
const GLOBAL_HOURS_COLUMN = { key: "hours", width: 42, minWidth: 32 } as const;

function getEmployeeRef(row: SiteEmployeeLinkRow["employee"]) {
  if (!row) return null;
  return Array.isArray(row) ? (row[0] ?? null) : row;
}

function buildPlannerHref(siteId: string, weekStartIso: string) {
  const query = new URLSearchParams();
  query.set("site_id", siteId);
  query.set("week", weekStartIso);
  query.set("view", "table");
  return `/staff/schedule?${query.toString()}`;
}

function buildPlannerQuickHref(
  siteId: string,
  weekStartIso: string,
  employeeId: string,
  shiftDate: string,
) {
  const query = new URLSearchParams();
  query.set("site_id", siteId);
  query.set("week", weekStartIso);
  query.set("view", "table");
  query.set("quick_employee_id", employeeId);
  query.set("quick_shift_date", shiftDate);
  return `/staff/schedule?${query.toString()}`;
}

function buildPlannerEditHref(
  siteId: string,
  weekStartIso: string,
  shiftId: string,
) {
  const query = new URLSearchParams();
  query.set("site_id", siteId);
  query.set("week", weekStartIso);
  query.set("view", "table");
  query.set("edit_shift", shiftId);
  return `/staff/schedule?${query.toString()}`;
}

function buildGlobalHref(
  weekStartIso: string,
  zoom: number,
  showManagement = false,
) {
  const query = new URLSearchParams();
  query.set("week", weekStartIso);
  query.set("zoom", String(zoom));
  if (showManagement) query.set("show_management", "1");
  return `/staff/schedule/global?${query.toString()}`;
}

function minutesFromTime(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function sortEmployees(first: EmployeeRow, second: EmployeeRow) {
  const firstArea = areaLabel(first);
  const secondArea = areaLabel(second);
  if (firstArea === "GENERAL" && secondArea !== "GENERAL") return 1;
  if (secondArea === "GENERAL" && firstArea !== "GENERAL") return -1;
  const areaCompare = firstArea.localeCompare(secondArea, "es");
  if (areaCompare !== 0) return areaCompare;
  return employeeLabel(first).localeCompare(employeeLabel(second), "es");
}

function normalizeZoom(value: string | undefined) {
  const parsed = Number(value);
  return ZOOM_OPTIONS.includes(parsed as (typeof ZOOM_OPTIONS)[number])
    ? parsed
    : 85;
}

function employeeLabel(employee: EmployeeRow) {
  const label = employee.alias || employee.full_name || employee.id;
  return label.trim();
}

function areaLabel(employee: EmployeeRow) {
  const role = String(employee.role ?? "").trim();
  if (!role) return "GENERAL";
  if (role.includes("cocin")) return "COCINA";
  if (role.includes("caj")) return "CAJA";
  if (role.includes("serv")) return "SERVICIO";
  if (role.includes("admin") || role.includes("ofic")) return "OFICINA";
  return role.toUpperCase();
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
}

function isManagementRole(employee: EmployeeRow) {
  const role = normalizeText(employee.role);
  return (
    role.includes("propiet") ||
    role.includes("duen") ||
    role.includes("owner") ||
    role.includes("gerente general") ||
    role.includes("gerencia general") ||
    role === "gerente" ||
    role === "gerencia"
  );
}

function compactTime(value: string) {
  const [hourText, minuteText] = value.slice(0, 5).split(":");
  const hour = Number(hourText ?? "0");
  const minute = Number(minuteText ?? "0");
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  const suffix = hour >= 12 ? "pm" : "am";
  return minute === 0
    ? `${displayHour}${suffix}`
    : `${displayHour}:${minuteText}${suffix}`;
}

function compactShiftLabel(shift: ShiftRow) {
  if (shift.shift_kind === "descanso") return "DESCANSA";
  const start = compactTime(shift.start_time);
  const end = shift.show_end_as_close ? "C" : compactTime(shift.end_time);
  return `${start} a ${end}`;
}

export async function hideEmployeeFromGlobalScheduleAction(formData: FormData) {
  "use server";

  const employeeId = String(formData.get("employee_id") ?? "").trim();
  const returnTo =
    String(formData.get("return_to") ?? "").trim() || "/staff/schedule/global";

  await requireStaffScheduleAccess(returnTo, null);

  if (!employeeId) {
    redirect(`${returnTo}&error=${encodeURIComponent("Trabajador inválido.")}`);
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("staff_schedule_hidden_employees")
    .upsert({
      employee_id: employeeId,
      hidden_by: null,
      updated_by: null,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    redirect(`${returnTo}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/staff/schedule/global");
  redirect(returnTo);
}

export async function restoreEmployeeToGlobalScheduleAction(formData: FormData) {
  "use server";

  const employeeId = String(formData.get("employee_id") ?? "").trim();
  const returnTo =
    String(formData.get("return_to") ?? "").trim() || "/staff/schedule/global";

  await requireStaffScheduleAccess(returnTo, null);

  if (!employeeId) {
    redirect(`${returnTo}&error=${encodeURIComponent("Trabajador inválido.")}`);
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("staff_schedule_hidden_employees")
    .delete()
    .eq("employee_id", employeeId);

  if (error) {
    redirect(`${returnTo}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/staff/schedule/global");
  redirect(returnTo);
}

export default async function StaffScheduleGlobalPage({
  searchParams,
}: {
  searchParams?: Promise<{
    week?: string;
    zoom?: string;
    show_management?: string;
    error?: string;
  }>;
}) {
  const sp = (await searchParams) ?? {};
  const errorMsg = safeDecode(sp.error);
  const zoom = normalizeZoom(sp.zoom);
  const showManagement = sp.show_management === "1";

  await requireStaffScheduleAccess("/staff/schedule/global", null);

  const weekStart = parseWeekStart(sp.week);
  const weekStartIso = isoDate(weekStart);
  const globalReturnTo = buildGlobalHref(weekStartIso, zoom, showManagement);
  const weekEndIso = isoDate(addDays(weekStart, 6));
  const weekDays = buildWeekDays(weekStart);
  const globalColumns = [
    ...BASE_GLOBAL_COLUMNS,
    ...weekDays.map((day, index) => ({
      key: `day-${index}`,
      width: 104,
      minWidth: 54,
      day,
    })),
    GLOBAL_HOURS_COLUMN,
  ];
  const supabase = createAdminClient();

  const { data: sitesData } = await supabase
    .from("sites")
    .select(
      "id,name,code,site_type,type,operational_visibility,site_operational_capabilities(can_schedule_staff)",
    )
    .order("name", { ascending: true });

  const sites = (sitesData ?? []) as SiteRow[];
  const operationalSites = sites.filter(isOperationalSite);
  const operationalSiteIds = operationalSites.map((site) => site.id);
  const siteLabelById = new Map(
    operationalSites.map((site) => [
      site.id,
      String(site.code || site.name || "Otra sede").toUpperCase(),
    ]),
  );

  const [directEmployeesRes, linkedEmployeesRes, shiftsRes, hiddenEmployeesRes] =
    operationalSiteIds.length > 0
      ? await Promise.all([
          supabase
            .from("employees")
            .select("id,full_name,alias,role,is_active,site_id")
            .in("site_id", operationalSiteIds)
            .eq("is_active", true)
            .order("full_name", { ascending: true }),
          supabase
            .from("employee_sites")
            .select(
              "employee_id,site_id,is_active,employee:employees(id,full_name,alias,role,is_active,site_id)",
            )
            .in("site_id", operationalSiteIds)
            .eq("is_active", true),
          supabase
            .from("employee_shifts")
            .select(
              "id,employee_id,shift_date,start_time,end_time,shift_kind,operational_role,show_end_as_close,break_minutes,status,notes,site_id,area_id,checkin_site_id,checkout_site_id,published_at",
            )
            .in("site_id", operationalSiteIds)
            .gte("shift_date", weekStartIso)
            .lte("shift_date", weekEndIso)
            .order("site_id", { ascending: true })
            .order("shift_date", { ascending: true })
            .order("start_time", { ascending: true }),
          supabase
            .from("staff_schedule_hidden_employees")
            .select(
              "employee_id,employee:employees(id,full_name,alias,role,is_active,site_id)",
            )
            .order("hidden_at", { ascending: false }),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
        ];

  const employeeById = new Map<string, EmployeeRow>();
  const employeeIdsBySiteId = new Map<string, Set<string>>();
  for (const site of operationalSites) {
    employeeIdsBySiteId.set(site.id, new Set<string>());
  }

  for (const employee of (directEmployeesRes.data ?? []) as EmployeeRow[]) {
    employeeById.set(employee.id, employee);
    if (employee.site_id) employeeIdsBySiteId.get(employee.site_id)?.add(employee.id);
  }

  for (const link of (linkedEmployeesRes.data ?? []) as SiteEmployeeLinkRow[]) {
    const employee = getEmployeeRef(link.employee);
    if (employee?.id && employee.is_active) {
      employeeById.set(employee.id, employee);
      employeeIdsBySiteId.get(link.site_id)?.add(employee.id);
    }
  }

  const shifts = (shiftsRes.data ?? []) as ShiftRow[];
  for (const shift of shifts) {
    employeeIdsBySiteId.get(shift.site_id)?.add(shift.employee_id);
  }

  const hiddenRows =
    (hiddenEmployeesRes.data ?? []) as HiddenScheduleEmployeeRow[];
  const hiddenEmployeeIds = new Set(
    hiddenRows.map((row) => row.employee_id).filter(Boolean),
  );

  const shiftsBySiteEmployeeDay = new Map<string, ShiftRow[]>();
  const shiftsByEmployeeDay = new Map<string, ShiftRow[]>();
  const totalMinutesBySiteId = new Map<string, number>();
  const draftCountBySiteId = new Map<string, number>();
  for (const shift of shifts) {
    const key = `${shift.site_id}__${shift.employee_id}__${shift.shift_date}`;
    const siteRows = shiftsBySiteEmployeeDay.get(key) ?? [];
    siteRows.push(shift);
    shiftsBySiteEmployeeDay.set(key, siteRows);

    const employeeDayKey = `${shift.employee_id}__${shift.shift_date}`;
    const employeeRows = shiftsByEmployeeDay.get(employeeDayKey) ?? [];
    employeeRows.push(shift);
    shiftsByEmployeeDay.set(employeeDayKey, employeeRows);

    totalMinutesBySiteId.set(
      shift.site_id,
      (totalMinutesBySiteId.get(shift.site_id) ?? 0) + getShiftMinutes(shift),
    );
    if (!shift.published_at) {
      draftCountBySiteId.set(
        shift.site_id,
        (draftCountBySiteId.get(shift.site_id) ?? 0) + 1,
      );
    }
  }

  for (const rows of shiftsBySiteEmployeeDay.values()) {
    rows.sort((a, b) => a.start_time.localeCompare(b.start_time, "es"));
  }

  const conflictKeys = new Set<string>();
  for (const [employeeDayKey, rows] of shiftsByEmployeeDay.entries()) {
    const laboralRows = rows
      .filter((shift) => shift.shift_kind !== "descanso")
      .sort((a, b) => a.start_time.localeCompare(b.start_time, "es"));
    for (let i = 0; i < laboralRows.length; i += 1) {
      for (let j = i + 1; j < laboralRows.length; j += 1) {
        const first = laboralRows[i];
        const second = laboralRows[j];
        if (!first || !second) continue;
        const overlaps =
          minutesFromTime(first.start_time) < minutesFromTime(second.end_time) &&
          minutesFromTime(second.start_time) < minutesFromTime(first.end_time);
        if (overlaps) conflictKeys.add(employeeDayKey);
      }
    }
  }

  const sitesWithRows = operationalSites.map((site) => {
    const employees = [...(employeeIdsBySiteId.get(site.id) ?? [])]
      .map(
        (id) =>
          employeeById.get(id) ?? {
            id,
            full_name: null,
            alias: null,
            role: null,
            is_active: true,
            site_id: site.id,
          },
      )
      .filter((employee) => showManagement || !isManagementRole(employee))
      .sort(sortEmployees);
    return { site, employees };
  });

  const hiddenEmployees = hiddenRows
    .map((row) => getEmployeeRef(row.employee))
    .filter((employee): employee is EmployeeRow => Boolean(employee?.id))
    .sort(sortEmployees);

  const areaColorByLabel = new Map<string, string>();
  const getAreaColor = (label: string) => {
    const existing = areaColorByLabel.get(label);
    if (existing) return existing;
    const next = AREA_PALETTE[areaColorByLabel.size % AREA_PALETTE.length] ?? "bg-slate-100";
    areaColorByLabel.set(label, next);
    return next;
  };

  return (
    <div className="min-h-screen bg-white px-3 py-3 text-slate-950">
      <div className="mx-auto max-w-none space-y-3">
        <PageHeader
          title="Vista global de horarios"
          subtitle="Hoja compacta de todas las sedes para revisar el panorama completo."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={buildGlobalHref(
                  isoDate(addDays(weekStart, -7)),
                  zoom,
                  showManagement,
                )}
                className="ui-btn ui-btn--ghost"
              >
                Semana anterior
              </Link>
              <Link
                href={buildGlobalHref(
                  isoDate(addDays(weekStart, 7)),
                  zoom,
                  showManagement,
                )}
                className="ui-btn ui-btn--ghost"
              >
                Semana siguiente
              </Link>
              <Link
                href={operationalSites[0] ? buildPlannerHref(operationalSites[0].id, weekStartIso) : "/staff/schedule"}
                className="ui-btn ui-btn--ghost"
              >
                Volver al planner
              </Link>
            </div>
          }
        />

        {errorMsg ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {errorMsg}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold">
          <div>
            {formatWeekLabel(weekStart)} · {operationalSites.length} sedes ·{" "}
            {shifts.length} turnos · {conflictKeys.size} conflictos
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <Link
              href={buildGlobalHref(weekStartIso, zoom, !showManagement)}
              className={`border px-2 py-1 no-underline ${
                showManagement
                  ? "border-violet-700 bg-violet-100 text-violet-950"
                  : "border-violet-200 bg-white text-violet-800"
              }`}
            >
              {showManagement
                ? "Ocultar propietarios y gerencia"
                : "Ver propietarios y gerencia"}
            </Link>
            <details className="relative" data-global-hidden-people-menu>
              <summary className="cursor-pointer list-none border border-violet-200 bg-white px-2 py-1 text-violet-800">
                Ocultos{" "}
                <span data-global-hidden-count>{hiddenEmployees.length}</span>
              </summary>
              <div
                className="absolute right-0 top-full z-50 mt-1 min-w-56 rounded-lg border border-violet-200 bg-white p-1 text-left text-[11px] shadow-xl"
                data-global-hidden-list
              >
                {hiddenEmployees.length === 0 ? (
                  <div className="px-2 py-1 text-slate-500">
                    No hay personas ocultas.
                  </div>
                ) : (
                  hiddenEmployees.map((employee) => {
                    const hiddenName = employeeLabel(employee);
                    return (
                      <form
                        key={employee.id}
                        action={restoreEmployeeToGlobalScheduleAction}
                        data-global-hidden-employee-form="restore"
                      >
                        <input
                          type="hidden"
                          name="employee_id"
                          value={employee.id}
                        />
                        <input
                          type="hidden"
                          name="return_to"
                          value={globalReturnTo}
                        />
                        <button
                          type="submit"
                          className="block w-full rounded px-2 py-1 text-left font-semibold text-violet-950 hover:bg-violet-50"
                          title={`Mostrar ${hiddenName} en la vista global`}
                        >
                          {hiddenName}
                        </button>
                      </form>
                    );
                  })
                )}
              </div>
            </details>
            <button
              type="button"
              className="border border-violet-200 bg-white px-2 py-1 text-violet-800"
              data-reset-global-columns
            >
              Restaurar columnas
            </button>
            <span className="mr-1 text-slate-500">Zoom</span>
            {ZOOM_OPTIONS.map((option) => (
              <Link
                key={option}
                href={buildGlobalHref(weekStartIso, option, showManagement)}
                className={`border px-2 py-1 no-underline ${
                  option === zoom
                    ? "border-violet-700 bg-violet-700 text-white"
                    : "border-violet-200 bg-white text-violet-800"
                }`}
              >
                {option}%
              </Link>
            ))}
          </div>
        </div>

        <div className="overflow-auto border-2 border-slate-900 bg-white">
          <div
            style={{
              transform: `scale(${zoom / 100})`,
              transformOrigin: "top left",
              width: `${10000 / zoom}%`,
            }}
          >
            <table
              className="w-full min-w-[1180px] border-collapse text-[11px] leading-tight"
              data-global-schedule-table
              data-storage-key="viso:global-schedule-table:v1"
            >
              <colgroup>
                {globalColumns.map((column) => (
                  <col
                    key={column.key}
                    data-global-schedule-column={column.key}
                    data-default-width={column.width}
                    data-min-width={column.minWidth}
                  />
                ))}
              </colgroup>
              <tbody>
                {sitesWithRows.map(({ site, employees }) => (
                  <>
                    <tr key={`${site.id}-header`}>
                      <th
                        colSpan={10}
                        className="border border-slate-900 bg-violet-100 px-1 py-1 text-center text-[11px] font-black uppercase text-violet-950"
                      >
                        {site.name ?? site.code ?? site.id} (
                        {weekDays[0]?.shortLabel.toUpperCase()} AL{" "}
                        {weekDays[6]?.shortLabel.toUpperCase()})
                      </th>
                    </tr>
                    <tr key={`${site.id}-columns`}>
                      <th
                        data-global-schedule-cell="area"
                        className="relative border border-slate-900 bg-violet-50 px-1 py-1 text-center font-black text-violet-950"
                      >
                        AREA
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-0 right-0 w-1 cursor-col-resize hover:bg-violet-300"
                          data-global-schedule-resize-handle="area"
                        />
                      </th>
                      <th
                        data-global-schedule-cell="person"
                        className="relative border border-slate-900 bg-violet-50 px-1 py-1 text-center font-black text-violet-950"
                      >
                        PERSONA
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-0 right-0 w-1 cursor-col-resize hover:bg-violet-300"
                          data-global-schedule-resize-handle="person"
                        />
                      </th>
                      {weekDays.map((day, dayIndex) => (
                        <th
                          key={day.iso}
                          data-global-schedule-cell={`day-${dayIndex}`}
                          className="relative border border-slate-900 bg-violet-50 px-1 py-1 text-center font-black text-violet-950"
                        >
                          <div>{day.label.toUpperCase()}</div>
                          <div>{day.shortLabel}</div>
                          <span
                            aria-hidden="true"
                            className="absolute inset-y-0 right-0 w-1 cursor-col-resize hover:bg-violet-300"
                            data-global-schedule-resize-handle={`day-${dayIndex}`}
                          />
                        </th>
                      ))}
                      <th
                        data-global-schedule-cell="hours"
                        className="relative border border-slate-900 bg-white px-1 py-1 text-center font-black"
                      >
                        H
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-0 right-0 w-1 cursor-col-resize hover:bg-violet-300"
                          data-global-schedule-resize-handle="hours"
                        />
                      </th>
                    </tr>
                    {employees.length === 0 ? (
                      <tr key={`${site.id}-empty`}>
                        <td
                          colSpan={10}
                          className="border border-slate-900 px-2 py-2 text-center font-semibold text-slate-500"
                        >
                          Sin trabajadores ni turnos esta semana.
                        </td>
                      </tr>
                    ) : (
                      employees.map((employee) => {
                        const name = employeeLabel(employee);
                        const area = areaLabel(employee);
                        const areaColor = getAreaColor(area);
                        const weekMinutes = weekDays.reduce((total, day) => {
                          const rows =
                            shiftsBySiteEmployeeDay.get(
                              `${site.id}__${employee.id}__${day.iso}`,
                            ) ?? [];
                          return (
                            total +
                            rows.reduce(
                              (sum, shift) => sum + getShiftMinutes(shift),
                              0,
                            )
                          );
                        }, 0);
                        return (
                          <tr
                            key={`${site.id}-${employee.id}`}
                            data-global-schedule-employee-row={employee.id}
                            hidden={hiddenEmployeeIds.has(employee.id)}
                          >
                            <td
                              data-global-schedule-cell="area"
                              className={`truncate border border-slate-900 px-1 py-0.5 text-center text-[10px] font-black ${areaColor}`}
                              title={area}
                            >
                              {area}
                            </td>
                            <td
                              data-global-schedule-cell="person"
                              className="truncate border border-slate-900 px-1 py-0.5 text-center font-black"
                              title={name}
                            >
                              <form
                                action={hideEmployeeFromGlobalScheduleAction}
                                data-global-hidden-employee-form="hide"
                              >
                                <input
                                  type="hidden"
                                  name="employee_id"
                                  value={employee.id}
                                />
                                <input
                                  type="hidden"
                                  name="return_to"
                                  value={globalReturnTo}
                                />
                                <button
                                  type="submit"
                                  className="max-w-full cursor-pointer truncate font-black hover:text-violet-700 hover:underline"
                                  title={`Ocultar ${name} de la vista global para todos`}
                                >
                                  {name}
                                </button>
                              </form>
                            </td>
                            {weekDays.map((day, dayIndex) => {
                              const rows =
                                shiftsBySiteEmployeeDay.get(
                                  `${site.id}__${employee.id}__${day.iso}`,
                                ) ?? [];
                              const employeeDayRows =
                                shiftsByEmployeeDay.get(
                                  `${employee.id}__${day.iso}`,
                                ) ?? [];
                              const otherSiteRows = employeeDayRows.filter(
                                (shift) =>
                                  shift.site_id !== site.id &&
                                  shift.status !== "cancelled",
                              );
                              const ownText = rows
                                .map((shift) => compactShiftLabel(shift))
                                .join(" / ");
                              const otherSiteText = otherSiteRows
                                .map(
                                  (shift) =>
                                    shift.shift_kind === "descanso"
                                      ? "DESCANSA"
                                      : `${siteLabelById.get(shift.site_id) ?? "OTRA"}: ${compactShiftLabel(shift)}`,
                                )
                                .join(" / ");
                              const hasLaboralShiftThatDay =
                                employeeDayRows.some(
                                  (shift) =>
                                    shift.shift_kind !== "descanso" &&
                                    shift.status !== "cancelled",
                                );
                              const hasConflict = conflictKeys.has(
                                `${employee.id}__${day.iso}`,
                              );
                              return (
                                <td
                                  key={day.iso}
                                  data-global-schedule-cell={`day-${dayIndex}`}
                                  className={`h-[20px] border border-slate-900 px-1 py-0.5 text-center font-bold ${
                                    hasConflict ? "bg-red-200" : areaColor
                                  }`}
                                  title={rows
                                    .map((shift) =>
                                      [
                                        compactShiftLabel(shift),
                                        shift.notes || null,
                                        shift.published_at ? null : "Borrador",
                                      ]
                                        .filter(Boolean)
                                        .join(" · "),
                                    )
                                    .join(" / ")}
                                >
                                  <details
                                    className="relative block min-h-[18px]"
                                    data-global-schedule-action-menu
                                  >
                                    <summary
                                      className="block min-h-[18px] cursor-pointer list-none"
                                      title={`Opciones para ${name} el ${day.label} en ${siteLabelById.get(site.id) ?? "esta sede"}`}
                                    >
                                      {ownText ? (
                                        <div className="truncate">
                                          {ownText}
                                        </div>
                                      ) : null}
                                      {otherSiteText ? (
                                        <div className="truncate text-[9px] font-black leading-none text-violet-700">
                                          {otherSiteText}
                                        </div>
                                      ) : null}
                                    </summary>
                                    <div className="absolute left-0 top-full z-50 mt-1 min-w-32 rounded-lg border border-violet-200 bg-white p-1 text-left text-[11px] font-semibold shadow-xl">
                                      <Link
                                        href={buildPlannerQuickHref(
                                          site.id,
                                          weekStartIso,
                                          employee.id,
                                          day.iso,
                                        )}
                                        className="block rounded px-2 py-1 text-violet-950 no-underline hover:bg-violet-50"
                                      >
                                        {rows.length > 0
                                          ? "Nuevo bloque"
                                          : "Nuevo"}
                                      </Link>
                                      {rows.length > 0
                                        ? rows.map((shift) => (
                                            <Link
                                              key={shift.id}
                                              href={buildPlannerEditHref(
                                                site.id,
                                                weekStartIso,
                                                shift.id,
                                              )}
                                              className="block rounded px-2 py-1 text-violet-950 no-underline hover:bg-violet-50"
                                            >
                                              Editar {compactShiftLabel(shift)}
                                            </Link>
                                          ))
                                        : null}
                                      {rows.length === 0 &&
                                      !hasLaboralShiftThatDay ? (
                                        <form action={saveShiftAction}>
                                          <input
                                            type="hidden"
                                            name="site_id"
                                            value={site.id}
                                          />
                                          <input
                                            type="hidden"
                                            name="return_to"
                                            value={buildGlobalHref(
                                              weekStartIso,
                                              zoom,
                                              showManagement,
                                            )}
                                          />
                                          <input
                                            type="hidden"
                                            name="employee_id"
                                            value={employee.id}
                                          />
                                          <input
                                            type="hidden"
                                            name="block_shift_date"
                                            value={day.iso}
                                          />
                                          <input
                                            type="hidden"
                                            name="block_start_time"
                                            value="00:00"
                                          />
                                          <input
                                            type="hidden"
                                            name="block_end_time"
                                            value="23:59"
                                          />
                                          <input
                                            type="hidden"
                                            name="block_site_id"
                                            value={site.id}
                                          />
                                          <input
                                            type="hidden"
                                            name="block_rest_day"
                                            value="0"
                                          />
                                          <input
                                            type="hidden"
                                            name="break_minutes"
                                            value="0"
                                          />
                                          <input
                                            type="hidden"
                                            name="status"
                                            value="scheduled"
                                          />
                                          <button
                                            type="submit"
                                            className="block w-full rounded px-2 py-1 text-left text-violet-950 hover:bg-violet-50"
                                          >
                                            Descanso
                                          </button>
                                        </form>
                                      ) : null}
                                      {rows.map((shift) =>
                                        !shift.published_at ? (
                                          <form
                                            key={`${shift.id}-delete`}
                                            action={deleteShiftAction}
                                          >
                                            <input
                                              type="hidden"
                                              name="shift_id"
                                              value={shift.id}
                                            />
                                            <input
                                              type="hidden"
                                              name="return_to"
                                              value={buildGlobalHref(
                                                weekStartIso,
                                                zoom,
                                                showManagement,
                                              )}
                                            />
                                            <button
                                              type="submit"
                                              className="block w-full rounded px-2 py-1 text-left text-[var(--ui-danger)] hover:bg-violet-50"
                                            >
                                              Eliminar{" "}
                                              {compactShiftLabel(shift)}
                                            </button>
                                          </form>
                                        ) : null,
                                      )}
                                    </div>
                                  </details>
                                </td>
                              );
                            })}
                            <td
                              data-global-schedule-cell="hours"
                              className="border border-slate-900 px-1 py-0.5 text-center font-bold"
                            >
                              {weekMinutes > 0
                                ? Math.round((weekMinutes / 60) * 10) / 10
                                : ""}
                            </td>
                          </tr>
                        );
                      })
                    )}
                    <tr key={`${site.id}-summary`}>
                      <td
                        colSpan={10}
                        className="border border-slate-900 bg-slate-100 px-1 py-1 text-right text-[10px] font-bold"
                      >
                        {employees.length} trabajadores ·{" "}
                        {formatHoursCompact(totalMinutesBySiteId.get(site.id) ?? 0)}
                        {(draftCountBySiteId.get(site.id) ?? 0) > 0
                          ? ` · ${draftCountBySiteId.get(site.id)} borradores`
                          : ""}
                      </td>
                    </tr>
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <Script id="viso-global-schedule-hidden-workers" strategy="afterInteractive">
        {`
          (function () {
            function closestAction(target, selector) {
              var element = target && target.nodeType === 1 ? target : target && target.parentElement;
              return element && element.closest ? element.closest(selector) : null;
            }

            function readColumnState(storageKey) {
              try {
                return JSON.parse(window.localStorage.getItem(storageKey) || "{}") || {};
              } catch (_) {
                return {};
              }
            }

            function writeColumnState(storageKey, state) {
              try {
                window.localStorage.setItem(storageKey, JSON.stringify(state));
              } catch (_) {
              }
            }

            function asNumber(value, fallback) {
              var parsed = parseFloat(String(value || ""));
              return Number.isFinite(parsed) ? parsed : fallback;
            }

            function initGlobalScheduleTable(table) {
              if (!table || table.getAttribute("data-global-schedule-ready") === "1") return;
              table.setAttribute("data-global-schedule-ready", "1");

              var storageKey = table.getAttribute("data-storage-key") || "viso:global-schedule-table:v1";
              var state = readColumnState(storageKey);

              function applyColumns() {
                var widths = state.columnWidths && typeof state.columnWidths === "object" ? state.columnWidths : {};
                var totalWidth = 0;
                table.querySelectorAll("col[data-global-schedule-column]").forEach(function (column) {
                  var key = column.getAttribute("data-global-schedule-column");
                  if (!key) return;
                  var fallbackWidth = asNumber(column.getAttribute("data-default-width"), 88);
                  var minWidth = asNumber(column.getAttribute("data-min-width"), 32);
                  var width = Math.max(minWidth, asNumber(widths[key], fallbackWidth));
                  column.style.width = width + "px";
                  totalWidth += width;
                });
                table.style.minWidth = Math.max(totalWidth, 420) + "px";
              }

              function saveColumns() {
                writeColumnState(storageKey, state);
              }

              table.addEventListener("pointerdown", function (event) {
                var handle = closestAction(event.target, "[data-global-schedule-resize-handle]");
                if (!handle || !table.contains(handle)) return;

                var key = handle.getAttribute("data-global-schedule-resize-handle");
                var column = table.querySelector('col[data-global-schedule-column="' + key + '"]');
                if (!key || !column) return;

                event.preventDefault();
                event.stopPropagation();

                var startX = event.clientX;
                var minWidth = asNumber(column.getAttribute("data-min-width"), 32);
                var fallbackWidth = asNumber(column.getAttribute("data-default-width"), 88);
                var currentWidths = state.columnWidths && typeof state.columnWidths === "object" ? state.columnWidths : {};
                var startWidth = asNumber(currentWidths[key], asNumber(column.style.width, fallbackWidth));

                document.body.style.cursor = "col-resize";
                document.body.style.userSelect = "none";

                function onMove(moveEvent) {
                  var nextWidth = Math.max(minWidth, Math.round(startWidth + moveEvent.clientX - startX));
                  state.columnWidths = state.columnWidths && typeof state.columnWidths === "object" ? state.columnWidths : {};
                  state.columnWidths[key] = nextWidth;
                  saveColumns();
                  applyColumns();
                }

                function onUp() {
                  document.removeEventListener("pointermove", onMove);
                  document.removeEventListener("pointerup", onUp);
                  document.body.style.cursor = "";
                  document.body.style.userSelect = "";
                }

                document.addEventListener("pointermove", onMove);
                document.addEventListener("pointerup", onUp, { once: true });
              });

              document.querySelectorAll("[data-reset-global-columns]").forEach(function (button) {
                button.addEventListener("click", function () {
                  state = {};
                  window.localStorage.removeItem(storageKey);
                  applyColumns();
                });
              });

              applyColumns();
            }

            function setHiddenCount(nextCount) {
              document.querySelectorAll("[data-global-hidden-count]").forEach(function (node) {
                node.textContent = String(Math.max(0, nextCount));
              });
            }

            function getHiddenCount() {
              var node = document.querySelector("[data-global-hidden-count]");
              var parsed = parseInt(node ? node.textContent || "0" : "0", 10);
              return Number.isFinite(parsed) ? parsed : 0;
            }

            function setEmployeeRowsHidden(employeeId, hidden) {
              document.querySelectorAll('[data-global-schedule-employee-row="' + employeeId + '"]').forEach(function (row) {
                row.hidden = hidden;
              });
            }

            function moveRestoreFormToEmptyState(form) {
              if (!form) return;
              form.remove();
              if (document.querySelector("[data-global-hidden-employee-form='restore']")) return;
              var menu = document.querySelector("[data-global-hidden-list]");
              if (!menu) return;
              var empty = document.createElement("div");
              empty.className = "px-2 py-1 text-slate-500";
              empty.textContent = "No hay personas ocultas.";
              menu.appendChild(empty);
            }

            function addRestoreForm(employeeId, label) {
              var menu = document.querySelector("[data-global-hidden-list]");
              if (!menu || menu.querySelector('input[name="employee_id"][value="' + employeeId + '"]')) return;
              menu.querySelectorAll(".text-slate-500").forEach(function (empty) {
                empty.remove();
              });

              var form = document.createElement("form");
              form.setAttribute("data-global-hidden-employee-form", "restore");

              var input = document.createElement("input");
              input.type = "hidden";
              input.name = "employee_id";
              input.value = employeeId;
              form.appendChild(input);

              var button = document.createElement("button");
              button.type = "submit";
              button.className = "block w-full rounded px-2 py-1 text-left font-semibold text-violet-950 hover:bg-violet-50";
              button.title = "Mostrar " + label + " en la vista global";
              button.textContent = label;
              form.appendChild(button);

              menu.appendChild(form);
            }

            document.addEventListener("submit", function (event) {
              var form = closestAction(event.target, "[data-global-hidden-employee-form]");
              if (!form) return;
              event.preventDefault();

              var mode = form.getAttribute("data-global-hidden-employee-form");
              var employeeInput = form.querySelector('input[name="employee_id"]');
              var employeeId = employeeInput ? employeeInput.value : "";
              if (!employeeId) return;

              var button = form.querySelector("button");
              if (button) button.disabled = true;

              fetch("/api/viso/staff-schedule-hidden-employees", {
                method: mode === "restore" ? "DELETE" : "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ employeeId: employeeId }),
              })
                .then(function (response) {
                  return response.json().then(function (payload) {
                    if (!response.ok || !payload.ok) {
                      throw new Error(payload.error || "No se pudo actualizar la vista global.");
                    }
                    return payload;
                  });
                })
                .then(function () {
                  if (mode === "restore") {
                    setEmployeeRowsHidden(employeeId, false);
                    moveRestoreFormToEmptyState(form);
                    setHiddenCount(getHiddenCount() - 1);
                  } else {
                    var label = button ? button.textContent || employeeId : employeeId;
                    setEmployeeRowsHidden(employeeId, true);
                    addRestoreForm(employeeId, label.trim());
                    setHiddenCount(getHiddenCount() + 1);
                  }
                })
                .catch(function (error) {
                  alert(error && error.message ? error.message : "No se pudo actualizar la vista global.");
                })
                .finally(function () {
                  if (button) button.disabled = false;
                });
            });

            document.addEventListener("toggle", function (event) {
              var menu = event.target;
              if (!menu || !menu.matches || !menu.matches("[data-global-schedule-action-menu]") || !menu.open) return;
              document.querySelectorAll("[data-global-schedule-action-menu][open]").forEach(function (current) {
                if (current !== menu) current.removeAttribute("open");
              });
            }, true);

            document.addEventListener("pointerdown", function (event) {
              if (closestAction(event.target, "[data-global-schedule-action-menu]")) return;
              document.querySelectorAll("[data-global-schedule-action-menu][open]").forEach(function (menu) {
                menu.removeAttribute("open");
              });
            });

            document.addEventListener("keydown", function (event) {
              if (event.key !== "Escape") return;
              document.querySelectorAll("[data-global-schedule-action-menu][open]").forEach(function (menu) {
                menu.removeAttribute("open");
              });
            });

            document.querySelectorAll("[data-global-schedule-table]").forEach(initGlobalScheduleTable);
          })();
        `}
      </Script>
    </div>
  );
}
