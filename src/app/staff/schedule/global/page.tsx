import Link from "next/link";

import { PageHeader } from "@/components/vento/standard/page-header";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  addDays,
  buildWeekDays,
  formatHoursCompact,
  formatShiftRange,
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

function buildGlobalHref(weekStartIso: string) {
  const query = new URLSearchParams();
  query.set("week", weekStartIso);
  return `/staff/schedule/global?${query.toString()}`;
}

function minutesFromTime(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function sortEmployees(first: EmployeeRow, second: EmployeeRow) {
  return (first.full_name ?? first.alias ?? first.id).localeCompare(
    second.full_name ?? second.alias ?? second.id,
    "es",
  );
}

export default async function StaffScheduleGlobalPage({
  searchParams,
}: {
  searchParams?: Promise<{
    week?: string;
    error?: string;
  }>;
}) {
  const sp = (await searchParams) ?? {};
  const errorMsg = safeDecode(sp.error);

  await requireStaffScheduleAccess("/staff/schedule/global", null);

  const weekStart = parseWeekStart(sp.week);
  const weekStartIso = isoDate(weekStart);
  const weekEndIso = isoDate(addDays(weekStart, 6));
  const weekDays = buildWeekDays(weekStart);
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

  const [directEmployeesRes, linkedEmployeesRes, shiftsRes] =
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
        ])
      : [
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
    if (employee.site_id) {
      employeeIdsBySiteId.get(employee.site_id)?.add(employee.id);
    }
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

  const siteLabelById = new Map(
    operationalSites.map((site) => [
      site.id,
      site.name ?? site.code ?? site.id,
    ]),
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
      .sort(sortEmployees);
    return { site, employees };
  });

  return (
    <div className="min-h-screen bg-[var(--ui-bg)] px-4 py-4">
      <div className="mx-auto max-w-[1800px] space-y-4">
        <PageHeader
          title="Vista global de horarios"
          subtitle="Panorama semanal de todas las sedes para revisar rotaciones sin salir del planner."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={buildGlobalHref(isoDate(addDays(weekStart, -7)))}
                className="ui-btn ui-btn--ghost"
              >
                Semana anterior
              </Link>
              <Link
                href={buildGlobalHref(isoDate(addDays(weekStart, 7)))}
                className="ui-btn ui-btn--ghost"
              >
                Semana siguiente
              </Link>
              <Link
                href={
                  operationalSites[0]
                    ? buildPlannerHref(operationalSites[0].id, weekStartIso)
                    : "/staff/schedule"
                }
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

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-3">
          <div>
            <div className="ui-caption">Semana</div>
            <div className="text-base font-semibold text-[var(--ui-text)]">
              {formatWeekLabel(weekStart)}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold text-[var(--ui-muted)]">
            <span className="rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-2 py-1">
              {operationalSites.length} sedes
            </span>
            <span className="rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-2 py-1">
              {shifts.length} turnos
            </span>
            <span
              className={`rounded-full border px-2 py-1 ${
                conflictKeys.size > 0
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {conflictKeys.size} conflictos
            </span>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
          {sitesWithRows.map(({ site, employees }) => (
            <section
              key={site.id}
              className="overflow-hidden rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-bold uppercase tracking-wide text-[var(--ui-text)]">
                    {site.name ?? site.code ?? site.id}
                  </h2>
                  <div className="mt-0.5 text-[11px] text-[var(--ui-muted)]">
                    {employees.length} trabajadores ·{" "}
                    {formatHoursCompact(totalMinutesBySiteId.get(site.id) ?? 0)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {(draftCountBySiteId.get(site.id) ?? 0) > 0 ? (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                      {draftCountBySiteId.get(site.id)} borrador
                    </span>
                  ) : null}
                  <Link
                    href={buildPlannerHref(site.id, weekStartIso)}
                    className="ui-btn ui-btn--ghost ui-btn--sm"
                  >
                    Abrir
                  </Link>
                </div>
              </div>

              <div className="overflow-auto ui-scrollbar-subtle">
                <table className="w-full min-w-[760px] border-collapse text-xs">
                  <thead className="bg-[var(--ui-surface)] text-[11px] uppercase tracking-wide text-[var(--ui-muted)]">
                    <tr>
                      <th className="w-36 border-b border-r border-[var(--ui-border)] px-2 py-2 text-left">
                        Trabajador
                      </th>
                      {weekDays.map((day) => (
                        <th
                          key={day.iso}
                          className="border-b border-r border-[var(--ui-border)] px-2 py-2 text-left last:border-r-0"
                        >
                          <div>{day.label.slice(0, 3)}</div>
                          <div className="normal-case">{day.shortLabel}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {employees.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-3 py-6 text-center text-sm text-[var(--ui-muted)]"
                        >
                          Sin trabajadores ni turnos esta semana.
                        </td>
                      </tr>
                    ) : (
                      employees.map((employee) => {
                        const employeeName =
                          employee.full_name ?? employee.alias ?? employee.id;
                        return (
                          <tr key={employee.id} className="align-top">
                            <td className="border-b border-r border-[var(--ui-border)] px-2 py-2 font-semibold text-[var(--ui-text)]">
                              <div className="truncate" title={employeeName}>
                                {employeeName}
                              </div>
                              {employee.role ? (
                                <div className="mt-0.5 truncate text-[11px] font-normal text-[var(--ui-muted)]">
                                  {employee.role}
                                </div>
                              ) : null}
                            </td>
                            {weekDays.map((day) => {
                              const key = `${site.id}__${employee.id}__${day.iso}`;
                              const rows =
                                shiftsBySiteEmployeeDay.get(key) ?? [];
                              const hasConflict = conflictKeys.has(
                                `${employee.id}__${day.iso}`,
                              );
                              return (
                                <td
                                  key={day.iso}
                                  className={`h-12 border-b border-r border-[var(--ui-border)] px-1.5 py-1 last:border-r-0 ${
                                    hasConflict ? "bg-red-50/70" : ""
                                  }`}
                                >
                                  <div className="flex flex-col gap-1">
                                    {rows.map((shift) => (
                                      <div
                                        key={shift.id}
                                        className={`rounded-md border px-1.5 py-1 leading-tight ${
                                          shift.shift_kind === "descanso"
                                            ? "border-slate-200 bg-slate-50 text-slate-600"
                                            : shift.published_at
                                              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                              : "border-amber-200 bg-amber-50 text-amber-800"
                                        }`}
                                        title={[
                                          siteLabelById.get(shift.site_id),
                                          shift.notes
                                            ? `Nota: ${shift.notes}`
                                            : null,
                                        ]
                                          .filter(Boolean)
                                          .join(" · ")}
                                      >
                                        <div className="font-semibold">
                                          {formatShiftRange(
                                            shift.start_time,
                                            shift.end_time,
                                            shift.show_end_as_close,
                                            shift.shift_kind,
                                          )}
                                        </div>
                                        {shift.notes ? (
                                          <div className="mt-0.5 truncate text-[10px] opacity-80">
                                            {shift.notes}
                                          </div>
                                        ) : null}
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
