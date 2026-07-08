import Link from "next/link";
import Script from "next/script";

import { PageHeader } from "@/components/vento/standard/page-header";
import { createAdminClient } from "@/lib/supabase/admin";

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

const ZOOM_OPTIONS = [65, 75, 85, 100] as const;
const AREA_PALETTE = [
  "bg-violet-50",
  "bg-purple-50",
  "bg-fuchsia-50",
  "bg-indigo-50",
  "bg-slate-50",
  "bg-zinc-50",
] as const;

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
  return minute === 0 ? String(displayHour) : `${displayHour}:${minuteText}`;
}

function compactShiftLabel(shift: ShiftRow) {
  if (shift.shift_kind === "descanso") return "DESCANSA";
  const start = compactTime(shift.start_time);
  const end = shift.show_end_as_close ? "C" : compactTime(shift.end_time);
  return `${start} a ${end}`;
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
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700"
              }`}
            >
              {showManagement ? "Ocultar gerencia" : "Mostrar gerencia"}
            </Link>
            <button
              type="button"
              className="border border-slate-300 bg-white px-2 py-1 text-slate-700"
              data-reset-hidden-employees
            >
              Mostrar ocultos
            </button>
            <span className="mr-1 text-slate-500">Zoom</span>
            {ZOOM_OPTIONS.map((option) => (
              <Link
                key={option}
                href={buildGlobalHref(weekStartIso, option, showManagement)}
                className={`border px-2 py-1 no-underline ${
                  option === zoom
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700"
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
            <table className="w-full min-w-[1180px] border-collapse text-[11px] leading-tight">
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
                      <th className="w-[88px] border border-slate-900 bg-violet-50 px-1 py-1 text-center font-black text-violet-950">
                        AREA
                      </th>
                      <th className="w-[88px] border border-slate-900 bg-violet-50 px-1 py-1 text-center font-black text-violet-950">
                        PERSONA
                      </th>
                      {weekDays.map((day) => (
                        <th
                          key={day.iso}
                          className="w-[104px] border border-slate-900 bg-violet-50 px-1 py-1 text-center font-black text-violet-950"
                        >
                          <div>{day.label.toUpperCase()}</div>
                          <div>{day.shortLabel}</div>
                        </th>
                      ))}
                      <th className="w-[42px] border border-slate-900 bg-white px-1 py-1 text-center font-black">
                        H
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
                          >
                            <td
                              className={`max-w-[88px] truncate border border-slate-900 px-1 py-0.5 text-center text-[10px] font-black ${areaColor}`}
                              title={area}
                            >
                              {area}
                            </td>
                            <td
                              className="max-w-[88px] truncate border border-slate-900 px-1 py-0.5 text-center font-black"
                              title={name}
                            >
                              <button
                                type="button"
                                className="max-w-full truncate font-black"
                                title={`Ocultar ${name} de la vista global`}
                                data-hide-global-schedule-employee={employee.id}
                              >
                                {name}
                              </button>
                            </td>
                            {weekDays.map((day) => {
                              const rows =
                                shiftsBySiteEmployeeDay.get(
                                  `${site.id}__${employee.id}__${day.iso}`,
                                ) ?? [];
                              const hasConflict = conflictKeys.has(
                                `${employee.id}__${day.iso}`,
                              );
                              return (
                                <td
                                  key={day.iso}
                                  className={`h-[20px] max-w-[104px] truncate border border-slate-900 px-1 py-0.5 text-center font-bold ${
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
                                  {rows.length === 0
                                    ? ""
                                    : rows
                                        .map((shift) => compactShiftLabel(shift))
                                        .join(" / ")}
                                </td>
                              );
                            })}
                            <td className="border border-slate-900 px-1 py-0.5 text-center font-bold">
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
            var key = "viso:global-schedule:hidden-employees";

            function readHidden() {
              try {
                var raw = window.localStorage.getItem(key);
                var parsed = raw ? JSON.parse(raw) : [];
                return Array.isArray(parsed) ? new Set(parsed.filter(Boolean)) : new Set();
              } catch (_) {
                return new Set();
              }
            }

            function writeHidden(hidden) {
              window.localStorage.setItem(key, JSON.stringify(Array.from(hidden)));
            }

            function applyHidden() {
              var hidden = readHidden();
              document.querySelectorAll("[data-global-schedule-employee-row]").forEach(function (row) {
                var employeeId = row.getAttribute("data-global-schedule-employee-row");
                row.hidden = hidden.has(employeeId);
              });
            }

            document.addEventListener("click", function (event) {
              var target = event.target && event.target.closest ? event.target.closest("[data-hide-global-schedule-employee]") : null;
              if (target) {
                var employeeId = target.getAttribute("data-hide-global-schedule-employee");
                if (!employeeId) return;
                var hidden = readHidden();
                hidden.add(employeeId);
                writeHidden(hidden);
                applyHidden();
                return;
              }

              var reset = event.target && event.target.closest ? event.target.closest("[data-reset-hidden-employees]") : null;
              if (!reset) return;
              window.localStorage.removeItem(key);
              applyHidden();
            });

            applyHidden();
          })();
        `}
      </Script>
    </div>
  );
}
