import Link from "next/link";
import Script from "next/script";

import { PageHeader } from "@/components/vento/standard/page-header";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  addDays,
  cleanOptionalText,
  endOfMonth,
  formatShiftRange,
  getAreaVisualFromRole,
  getEmployeeRef,
  getOperationalRoleCandidateFromBaseRole,
  getShiftMinutes,
  isOperationalSite,
  isoDate,
  requireStaffScheduleAccess,
  safeDecode,
  startOfMonth,
  type EmployeeOperationalProfileRow,
  type EmployeeRow,
  type EmployeeSiteLink,
  type ShiftRow,
  type SiteOperationalRoleRow,
  type SiteRow,
} from "../helpers";
import {
  createMonthlyShiftsAction,
  deleteMonthlyDraftShiftAction,
  deleteMonthlyDraftsAction,
  publishMonthAction,
} from "./actions";
import {
  MONTHLY_SCHEDULE_LIMIT_MINUTES,
  MONTHLY_SCHEDULE_WARNING_MINUTES,
} from "./constants";

export const dynamic = "force-dynamic";


function parseMonth(input?: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(input ?? "");
  if (match) {
    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    if (monthIndex >= 0 && monthIndex <= 11) {
      return new Date(year, monthIndex, 1, 12, 0, 0, 0);
    }
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0, 0);
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildMonthHref(
  siteId: string,
  month: string,
  params: Record<string, string | null | undefined> = {},
) {
  const query = new URLSearchParams();
  if (siteId) query.set("site_id", siteId);
  query.set("month", month);
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  return `/staff/schedule/month?${query.toString()}`;
}

function formatHours(minutes: number) {
  const hours = Math.max(0, minutes) / 60;
  return `${hours.toFixed(Number.isInteger(hours) ? 0 : 1).replace(".", ",")} h`;
}

function getMonthStatus(totalMinutes: number) {
  if (totalMinutes > MONTHLY_SCHEDULE_LIMIT_MINUTES) {
    return {
      label: `Exceso ${formatHours(totalMinutes - MONTHLY_SCHEDULE_LIMIT_MINUTES)}`,
      totalClass: "border-red-300 bg-red-50 text-red-800",
      barClass: "bg-red-500",
      rowClass: "bg-red-50/45",
      shiftClass: "ring-1 ring-red-300",
    };
  }
  if (totalMinutes >= MONTHLY_SCHEDULE_WARNING_MINUTES) {
    return {
      label: "Cerca del límite",
      totalClass: "border-amber-300 bg-amber-50 text-amber-800",
      barClass: "bg-amber-500",
      rowClass: "bg-amber-50/30",
      shiftClass: "ring-1 ring-amber-300",
    };
  }
  return {
    label: "Dentro del límite",
    totalClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
    barClass: "bg-emerald-500",
    rowClass: "",
    shiftClass: "",
  };
}

export default async function StaffScheduleMonthPage({
  searchParams,
}: {
  searchParams?: Promise<{
    site_id?: string;
    month?: string;
    open?: string;
    employee_id?: string;
    date?: string;
    ok?: string;
    warning?: string;
    error?: string;
  }>;
}) {
  const sp = (await searchParams) ?? {};
  const selectedMonth = parseMonth(sp.month);
  const selectedMonthKey = monthKey(selectedMonth);
  const monthStart = startOfMonth(selectedMonth);
  const monthEnd = endOfMonth(selectedMonth);
  const monthStartIso = isoDate(monthStart);
  const monthEndIso = isoDate(monthEnd);
  const monthDays = Array.from({ length: monthEnd.getDate() }, (_, index) => {
    const date = addDays(monthStart, index);
    return {
      iso: isoDate(date),
      dayNumber: date.getDate(),
      weekday: date.toLocaleDateString("es-CO", { weekday: "short" }),
      isSunday: date.getDay() === 0,
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
    };
  });

  await requireStaffScheduleAccess(
    "/staff/schedule/month",
    sp.site_id ?? null,
  );
  const supabase = createAdminClient();

  const { data: sitesData } = await supabase
    .from("sites")
    .select(
      "id,name,code,site_type,type,operational_visibility,site_operational_capabilities(can_schedule_staff)",
    )
    .order("name", { ascending: true });

  const sites = (sitesData ?? []) as SiteRow[];
  const operationalSites = sites.filter(isOperationalSite);
  const selectedSiteId =
    sp.site_id && operationalSites.some((site) => site.id === sp.site_id)
      ? sp.site_id
      : (operationalSites[0]?.id ?? "");
  const selectedSite =
    operationalSites.find((site) => site.id === selectedSiteId) ?? null;

  const [directEmployeesRes, linkedEmployeesRes, shiftsRes, matrixRes, profilesRes] =
    await Promise.all([
      selectedSiteId
        ? supabase
            .from("employees")
            .select("id,full_name,alias,role,is_active,site_id")
            .eq("site_id", selectedSiteId)
            .eq("is_active", true)
            .order("full_name", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      selectedSiteId
        ? supabase
            .from("employee_sites")
            .select(
              "employee_id,is_active,employee:employees(id,full_name,alias,role,is_active,site_id)",
            )
            .eq("site_id", selectedSiteId)
            .eq("is_active", true)
        : Promise.resolve({ data: [], error: null }),
      selectedSiteId
        ? supabase
            .from("employee_shifts")
            .select(
              "id,employee_id,shift_date,start_time,end_time,shift_kind,operational_role,show_end_as_close,break_minutes,status,notes,site_id,area_id,checkin_site_id,checkout_site_id,published_at",
            )
            .eq("site_id", selectedSiteId)
            .gte("shift_date", monthStartIso)
            .lte("shift_date", monthEndIso)
            .order("shift_date", { ascending: true })
            .order("start_time", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      selectedSiteId
        ? supabase
            .from("vento_site_operational_role_matrix_v1")
            .select(
              "site_id,area_id,area_name,area_kind,role_code,role_label,role_family,is_default,requires_external_checkin,requires_external_checkout,is_active",
            )
            .eq("site_id", selectedSiteId)
            .eq("is_active", true)
            .order("area_name", { ascending: true })
            .order("role_label", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      selectedSiteId
        ? supabase
            .from("employee_site_operational_profiles")
            .select(
              "employee_id,site_id,default_operational_role,default_checkin_site_id,default_checkout_site_id,is_active",
            )
            .eq("site_id", selectedSiteId)
            .neq("is_active", false)
        : Promise.resolve({ data: [], error: null }),
    ]);

  const employeeMap = new Map<string, EmployeeRow>();
  for (const employee of (directEmployeesRes.data ?? []) as EmployeeRow[]) {
    employeeMap.set(employee.id, employee);
  }
  for (const link of (linkedEmployeesRes.data ?? []) as EmployeeSiteLink[]) {
    const employee = getEmployeeRef(link.employee);
    if (employee?.id && employee.is_active) employeeMap.set(employee.id, employee);
  }
  const employees = [...employeeMap.values()].sort((a, b) =>
    (a.full_name ?? a.alias ?? a.id).localeCompare(
      b.full_name ?? b.alias ?? b.id,
      "es",
    ),
  );

  const shifts = (shiftsRes.data ?? []) as ShiftRow[];
  const shiftsByEmployeeDay = new Map<string, ShiftRow[]>();
  for (const shift of shifts) {
    const key = `${shift.employee_id}__${shift.shift_date}`;
    const dayRows = shiftsByEmployeeDay.get(key) ?? [];
    dayRows.push(shift);
    shiftsByEmployeeDay.set(key, dayRows);
  }

  const employeeIds = employees.map((employee) => employee.id);
  const allSiteMonthResult =
    employeeIds.length > 0
      ? await supabase
          .from("employee_shifts")
          .select(
            "id,employee_id,shift_date,start_time,end_time,shift_kind,operational_role,show_end_as_close,break_minutes,status,notes,site_id,area_id,checkin_site_id,checkout_site_id,published_at",
          )
          .in("employee_id", employeeIds)
          .gte("shift_date", monthStartIso)
          .lte("shift_date", monthEndIso)
      : { data: [], error: null };
  const allSiteMonthShiftsData = allSiteMonthResult.data ?? [];
  const allSiteMonthShiftsError = allSiteMonthResult.error;

  const totalsByEmployee = new Map<
    string,
    { total: number; published: number; draft: number }
  >();
  for (const employee of employees) {
    totalsByEmployee.set(employee.id, { total: 0, published: 0, draft: 0 });
  }
  for (const shift of (allSiteMonthShiftsData ?? []) as ShiftRow[]) {
    if (shift.status === "cancelled") continue;
    const minutes = getShiftMinutes(shift);
    const totals = totalsByEmployee.get(shift.employee_id) ?? {
      total: 0,
      published: 0,
      draft: 0,
    };
    totals.total += minutes;
    if (shift.published_at) totals.published += minutes;
    else totals.draft += minutes;
    totalsByEmployee.set(shift.employee_id, totals);
  }
  for (const dayRows of shiftsByEmployeeDay.values()) {
    dayRows.sort((a, b) => a.start_time.localeCompare(b.start_time, "es"));
  }

  const matrixRows = (matrixRes.data ?? []) as Array<
    SiteOperationalRoleRow & { is_active?: boolean | null }
  >;
  const roleOptions = matrixRows.map((row) => ({
    value: `${row.role_code}||${row.area_id ?? ""}`,
    roleCode: row.role_code,
    areaId: row.area_id ?? "",
    label: `${row.role_label ?? row.role_code} · ${row.area_name ?? "General"}`,
    isDefault: Boolean(row.is_default),
  }));
  const profiles = (profilesRes.data ?? []) as EmployeeOperationalProfileRow[];
  const profileByEmployee = new Map(
    profiles.map((profile) => [profile.employee_id, profile]),
  );

  const getDefaultRoleContext = (employee: EmployeeRow) => {
    const profileRole = cleanOptionalText(
      profileByEmployee.get(employee.id)?.default_operational_role,
    );
    const baseCandidate = getOperationalRoleCandidateFromBaseRole(employee.role);
    const candidate = profileRole ?? cleanOptionalText(baseCandidate);
    const matching = roleOptions.filter((option) => option.roleCode === candidate);
    return (
      matching.find((option) => option.isDefault)?.value ??
      (matching.length === 1 ? matching[0]?.value : "") ??
      (roleOptions.length === 1 ? roleOptions[0]?.value : "") ??
      ""
    );
  };

  const requestedEmployeeId = safeDecode(sp.employee_id);
  const requestedDate = safeDecode(sp.date);
  const formOpen =
    sp.open === "1" ||
    employees.some((employee) => employee.id === requestedEmployeeId);
  const defaultEmployeeId = employees.some(
    (employee) => employee.id === requestedEmployeeId,
  )
    ? requestedEmployeeId
    : (employees[0]?.id ?? "");
  const defaultDate = monthDays.some((day) => day.iso === requestedDate)
    ? requestedDate
    : "";
  const closeFormHref = buildMonthHref(selectedSiteId, selectedMonthKey);
  const returnTo = closeFormHref;
  const previousMonth = new Date(
    selectedMonth.getFullYear(),
    selectedMonth.getMonth() - 1,
    1,
    12,
  );
  const nextMonth = new Date(
    selectedMonth.getFullYear(),
    selectedMonth.getMonth() + 1,
    1,
    12,
  );
  const currentMonth = new Date();
  const monthLabel = selectedMonth.toLocaleDateString("es-CO", {
    month: "long",
    year: "numeric",
  });
  const draftCount = shifts.filter((shift) => !shift.published_at).length;
  const exceededEmployees = employees.filter(
    (employee) =>
      (totalsByEmployee.get(employee.id)?.total ?? 0) >
      MONTHLY_SCHEDULE_LIMIT_MINUTES,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Horario mensual"
        subtitle="Planifica todos los días del mes y controla el límite visible de 186 horas por trabajador."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/staff" className="ui-btn ui-btn--ghost">
              Ver trabajadores
            </Link>
            <Link href="/staff/schedule/metrics" className="ui-btn ui-btn--ghost">
              Métricas
            </Link>
            <Link
              href={buildMonthHref(selectedSiteId, selectedMonthKey, { open: "1" })}
              className="ui-btn ui-btn--brand"
            >
              Crear turnos del mes
            </Link>
          </div>
        }
      />

      {safeDecode(sp.error) ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {safeDecode(sp.error)}
        </div>
      ) : null}
      {safeDecode(sp.warning) ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          {safeDecode(sp.warning)}
        </div>
      ) : null}
      {safeDecode(sp.ok) ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {safeDecode(sp.ok)}
        </div>
      ) : null}

      {allSiteMonthShiftsError ? (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          No se pudieron calcular las horas del empleado en todas las sedes: {allSiteMonthShiftsError.message}. La publicación mensual queda deshabilitada hasta corregir la consulta.
        </div>
      ) : null}

      {exceededEmployees.length > 0 ? (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          <div className="font-semibold">Publicación bloqueada por exceso mensual</div>
          <div className="mt-1">
            {exceededEmployees
              .map((employee) => {
                const minutes = totalsByEmployee.get(employee.id)?.total ?? 0;
                return `${employee.full_name ?? employee.alias ?? employee.id}: ${formatHours(minutes)} (+${formatHours(minutes - MONTHLY_SCHEDULE_LIMIT_MINUTES)})`;
              })
              .join(" · ")}
          </div>
        </div>
      ) : null}

      <div className="ui-panel space-y-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(260px,1fr)_minmax(280px,380px)]">
          <div>
            <div className="ui-caption">Sede actual</div>
            <div className="mt-1 text-lg font-semibold text-[var(--ui-text)]">
              {selectedSite?.name ?? selectedSite?.code ?? "Sin sede"}
            </div>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">
              Los turnos nuevos quedan en borrador. Se permite exceder 186 h para ajustar el plan, pero no publicarlo.
            </p>
          </div>

          <form method="get" className="space-y-2">
            <label className="ui-label">Cambiar sede</label>
            <div className="flex gap-2">
              <select name="site_id" className="ui-input" defaultValue={selectedSiteId}>
                {operationalSites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name ?? site.code ?? site.id}
                  </option>
                ))}
              </select>
              <input type="hidden" name="month" value={selectedMonthKey} />
              <button type="submit" className="ui-btn ui-btn--ghost">
                Ir
              </button>
            </div>
          </form>

          <div className="flex flex-wrap items-center gap-2 xl:col-span-2">
            <div className="flex items-center rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1">
              <Link
                href={buildMonthHref(selectedSiteId, monthKey(previousMonth))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-lg font-semibold text-[var(--ui-muted)] transition hover:bg-[var(--ui-surface-2)]"
                aria-label="Mes anterior"
              >
                ‹
              </Link>
              <div className="min-w-[210px] px-3 text-center text-sm font-semibold capitalize text-[var(--ui-text)]">
                {monthLabel}
              </div>
              <Link
                href={buildMonthHref(selectedSiteId, monthKey(nextMonth))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-lg font-semibold text-[var(--ui-muted)] transition hover:bg-[var(--ui-surface-2)]"
                aria-label="Mes siguiente"
              >
                ›
              </Link>
            </div>
            <Link
              href={buildMonthHref(selectedSiteId, monthKey(currentMonth))}
              className="ui-btn ui-btn--ghost"
            >
              Mes actual
            </Link>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              {draftCount > 0 ? (
                <form
                  action={deleteMonthlyDraftsAction}
                  data-confirm-message="Se eliminarán todos los borradores del mes. Los turnos publicados se conservarán. ¿Continuar?"
                >
                  <input type="hidden" name="site_id" value={selectedSiteId} />
                  <input type="hidden" name="month" value={selectedMonthKey} />
                  <input type="hidden" name="return_to" value={returnTo} />
                  <button
                    type="submit"
                    className="ui-btn ui-btn--ghost text-[var(--ui-danger)]"
                  >
                    Eliminar borradores ({draftCount})
                  </button>
                </form>
              ) : null}
              <form action={publishMonthAction}>
                <input type="hidden" name="site_id" value={selectedSiteId} />
                <input type="hidden" name="month" value={selectedMonthKey} />
                <input type="hidden" name="return_to" value={returnTo} />
                <button
                  type="submit"
                  className="ui-btn ui-btn--brand"
                  disabled={
                    draftCount === 0 ||
                    exceededEmployees.length > 0 ||
                    Boolean(allSiteMonthShiftsError)
                  }
                  title={
                    exceededEmployees.length > 0
                      ? "Corrige los excesos antes de publicar"
                      : undefined
                  }
                >
                  Publicar mes
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {formOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/35 px-3 py-6 backdrop-blur-[1px] sm:px-6"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-6xl rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 shadow-2xl sm:p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="ui-h3">Crear múltiples turnos del mes</div>
                <p className="mt-1 text-sm text-[var(--ui-muted)]">
                  Selecciona una persona, el horario y todos los días que compartirán ese turno.
                </p>
              </div>
              <Link href={closeFormHref} className="ui-btn ui-btn--ghost ui-btn--sm">
                Cerrar
              </Link>
            </div>

            <form
              action={createMonthlyShiftsAction}
              className="grid gap-4 xl:grid-cols-12"
              data-monthly-shift-form
              data-limit-minutes={MONTHLY_SCHEDULE_LIMIT_MINUTES}
              data-warning-minutes={MONTHLY_SCHEDULE_WARNING_MINUTES}
            >
              <input type="hidden" name="site_id" value={selectedSiteId} />
              <input type="hidden" name="month" value={selectedMonthKey} />
              <input type="hidden" name="return_to" value={returnTo} />

              <label className="flex flex-col gap-1 xl:col-span-4">
                <span className="ui-label">Trabajador</span>
                <select
                  name="employee_id"
                  className="ui-input"
                  defaultValue={defaultEmployeeId}
                  required
                  data-monthly-employee
                >
                  {employees.map((employee) => {
                    const total = totalsByEmployee.get(employee.id)?.total ?? 0;
                    return (
                      <option
                        key={employee.id}
                        value={employee.id}
                        data-current-minutes={total}
                        data-default-role={getDefaultRoleContext(employee)}
                      >
                        {employee.full_name ?? employee.alias ?? employee.id} · {formatHours(total)}
                      </option>
                    );
                  })}
                </select>
              </label>

              <label className="flex flex-col gap-1 xl:col-span-4">
                <span className="ui-label">Área y rol operativo</span>
                <select
                  name="role_context"
                  className="ui-input"
                  defaultValue={
                    employees.find((employee) => employee.id === defaultEmployeeId)
                      ? getDefaultRoleContext(
                          employees.find(
                            (employee) => employee.id === defaultEmployeeId,
                          ) as EmployeeRow,
                        )
                      : ""
                  }
                  required
                  data-monthly-role
                >
                  <option value="" disabled>
                    Seleccionar
                  </option>
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 xl:col-span-2">
                <span className="ui-label">Inicio</span>
                <input
                  type="time"
                  name="start_time"
                  className="ui-input"
                  defaultValue="06:00"
                  step={1800}
                  required
                  data-monthly-start
                />
              </label>

              <label className="flex flex-col gap-1 xl:col-span-2">
                <span className="ui-label">Fin</span>
                <input
                  type="time"
                  name="end_time"
                  className="ui-input"
                  defaultValue="14:00"
                  step={1800}
                  required
                  data-monthly-end
                />
              </label>

              <label className="flex flex-col gap-1 xl:col-span-3">
                <span className="ui-label">Descanso descontado</span>
                <select
                  name="break_minutes"
                  className="ui-input"
                  defaultValue="0"
                  data-monthly-break
                >
                  <option value="0">Sin descuento</option>
                  <option value="30">30 minutos</option>
                  <option value="60">1 hora</option>
                  <option value="90">1 hora 30 minutos</option>
                </select>
              </label>

              <label className="flex flex-col gap-1 xl:col-span-9">
                <span className="ui-label">Nota opcional</span>
                <input
                  name="notes"
                  className="ui-input"
                  maxLength={240}
                  placeholder="Ej. Caja, apertura, apoyo de barra"
                />
              </label>

              <div className="xl:col-span-12 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[var(--ui-text)]">
                      Días del mes
                    </div>
                    <div className="text-xs text-[var(--ui-muted)]">
                      Se creará un turno independiente por cada fecha marcada.
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="ui-btn ui-btn--ghost ui-btn--sm"
                      data-select-month-days="weekdays"
                    >
                      Lunes a viernes
                    </button>
                    <button
                      type="button"
                      className="ui-btn ui-btn--ghost ui-btn--sm"
                      data-select-month-days="all"
                    >
                      Todo el mes
                    </button>
                    <button
                      type="button"
                      className="ui-btn ui-btn--ghost ui-btn--sm"
                      data-select-month-days="clear"
                    >
                      Limpiar
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-7 lg:grid-cols-10 xl:grid-cols-12">
                  {monthDays.map((day) => (
                    <label
                      key={day.iso}
                      className={`flex cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-2 text-sm transition hover:bg-[var(--ui-surface)] ${day.isWeekend ? "border-amber-200 bg-amber-50/60" : "border-[var(--ui-border)] bg-[var(--ui-surface)]"}`}
                    >
                      <input
                        type="checkbox"
                        name="shift_dates"
                        value={day.iso}
                        defaultChecked={day.iso === defaultDate}
                        data-month-day
                        data-weekend={day.isWeekend ? "1" : "0"}
                        className="rounded border-[var(--ui-border)]"
                      />
                      <span className="min-w-0">
                        <span className="block font-semibold text-[var(--ui-text)]">
                          {day.dayNumber}
                        </span>
                        <span className="block truncate text-[10px] uppercase text-[var(--ui-muted)]">
                          {day.weekday}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div
                className="xl:col-span-12 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900"
                data-monthly-projection
              >
                <div className="grid gap-3 sm:grid-cols-4">
                  <div>
                    <div className="text-xs font-semibold uppercase opacity-70">Actual</div>
                    <div className="mt-1 text-xl font-bold" data-projection-current>
                      0 h
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase opacity-70">Nuevas</div>
                    <div className="mt-1 text-xl font-bold" data-projection-new>
                      0 h
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase opacity-70">Proyectado</div>
                    <div className="mt-1 text-xl font-bold" data-projection-total>
                      0 h / 186 h
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase opacity-70">Estado</div>
                    <div className="mt-1 text-sm font-bold" data-projection-status>
                      Dentro del límite
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 xl:col-span-12">
                <Link href={closeFormHref} className="ui-btn ui-btn--ghost">
                  Cancelar
                </Link>
                <button type="submit" className="ui-btn ui-btn--brand">
                  Guardar como borrador
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {!selectedSiteId ? (
        <div className="ui-panel">
          <div className="ui-empty">No hay sedes disponibles para planificar.</div>
        </div>
      ) : employees.length === 0 ? (
        <div className="ui-panel">
          <div className="ui-empty">No hay trabajadores activos en esta sede.</div>
        </div>
      ) : (
        <div className="ui-panel p-0 overflow-hidden">
          <style>{`
            [data-month-table] {
              min-width: ${390 + monthDays.length * 112}px;
              border-collapse: separate;
              border-spacing: 0;
            }
            [data-month-table] [data-sticky-worker] {
              position: sticky;
              left: 0;
              z-index: 15;
              background: var(--ui-surface);
              box-shadow: 1px 0 0 var(--ui-border);
            }
            [data-month-table] [data-sticky-total] {
              position: sticky;
              right: 0;
              z-index: 15;
              background: var(--ui-surface);
              box-shadow: -1px 0 0 var(--ui-border);
            }
            [data-month-table] thead [data-sticky-worker],
            [data-month-table] thead [data-sticky-total] {
              z-index: 25;
              background: var(--ui-surface-2);
            }
          `}</style>
          <div className="overflow-auto ui-scrollbar-subtle">
            <table className="text-xs" data-month-table>
              <thead className="bg-[var(--ui-surface-2)] text-[var(--ui-muted)]">
                <tr>
                  <th
                    className="min-w-[220px] border-b border-r border-[var(--ui-border)] px-3 py-3 text-left"
                    data-sticky-worker
                  >
                    Trabajador
                  </th>
                  {monthDays.map((day) => (
                    <th
                      key={day.iso}
                      className={`w-28 min-w-28 border-b border-r border-[var(--ui-border)] px-2 py-2 text-center ${day.isSunday ? "bg-red-50 text-red-700" : day.isWeekend ? "bg-amber-50" : ""}`}
                    >
                      <div className="text-sm font-bold text-[var(--ui-text)]">
                        {day.dayNumber}
                      </div>
                      <div className="mt-0.5 uppercase">{day.weekday}</div>
                    </th>
                  ))}
                  <th
                    className="min-w-[170px] border-b border-[var(--ui-border)] px-3 py-3 text-left"
                    data-sticky-total
                  >
                    Horas del mes
                  </th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => {
                  const totals = totalsByEmployee.get(employee.id) ?? {
                    total: 0,
                    published: 0,
                    draft: 0,
                  };
                  const status = getMonthStatus(totals.total);
                  const areaVisual = getAreaVisualFromRole(employee.role);
                  const progress = Math.min(
                    100,
                    Math.round(
                      (totals.total / MONTHLY_SCHEDULE_LIMIT_MINUTES) * 100,
                    ),
                  );
                  const employeeName =
                    employee.full_name ?? employee.alias ?? employee.id;

                  return (
                    <tr key={employee.id} className={status.rowClass}>
                      <td
                        className="border-b border-r border-[var(--ui-border)] px-3 py-3 align-top"
                        data-sticky-worker
                      >
                        <div className="font-semibold text-[var(--ui-text)]">
                          {employeeName}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${areaVisual.chipClass}`}>
                            {areaVisual.label}
                          </span>
                          <span className="text-[10px] text-[var(--ui-muted)]">
                            {employee.role ?? "Sin rol"}
                          </span>
                        </div>
                      </td>

                      {monthDays.map((day) => {
                        const dayRows =
                          shiftsByEmployeeDay.get(`${employee.id}__${day.iso}`) ?? [];
                        return (
                          <td
                            key={`${employee.id}-${day.iso}`}
                            className={`border-b border-r border-[var(--ui-border)] px-1.5 py-2 align-top ${day.isSunday ? "bg-red-50/40" : day.isWeekend ? "bg-amber-50/35" : ""}`}
                          >
                            <div className="flex min-h-12 flex-col gap-1">
                              {dayRows.map((shift) => (
                                <details
                                  key={shift.id}
                                  className="relative"
                                  data-month-shift-menu
                                >
                                  <summary
                                    className={`cursor-pointer list-none rounded-lg border px-2 py-1.5 leading-tight ${shift.published_at ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"} ${status.shiftClass}`}
                                    title={`${formatShiftRange(shift.start_time, shift.end_time, shift.show_end_as_close, shift.shift_kind)}${shift.notes ? ` · ${shift.notes}` : ""}`}
                                  >
                                    <div className="font-semibold text-[var(--ui-text)]">
                                      {formatShiftRange(
                                        shift.start_time,
                                        shift.end_time,
                                        shift.show_end_as_close,
                                        shift.shift_kind,
                                      )}
                                    </div>
                                    <div className="mt-0.5 text-[9px] uppercase text-[var(--ui-muted)]">
                                      {shift.published_at ? "Publicado" : "Borrador"}
                                    </div>
                                  </summary>
                                  <div className="absolute left-0 top-full z-40 mt-1 min-w-36 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1 text-sm shadow-xl">
                                    <Link
                                      href={buildMonthHref(selectedSiteId, selectedMonthKey, {
                                        open: "1",
                                        employee_id: employee.id,
                                        date: day.iso,
                                      })}
                                      className="block rounded-lg px-3 py-2 font-medium text-[var(--ui-text)] no-underline hover:bg-[var(--ui-surface-2)]"
                                    >
                                      Nuevo bloque
                                    </Link>
                                    {!shift.published_at ? (
                                      <form
                                        action={deleteMonthlyDraftShiftAction}
                                        data-confirm-message="Se eliminará este borrador. ¿Continuar?"
                                      >
                                        <input type="hidden" name="shift_id" value={shift.id} />
                                        <input type="hidden" name="site_id" value={selectedSiteId} />
                                        <input type="hidden" name="month" value={selectedMonthKey} />
                                        <input type="hidden" name="return_to" value={returnTo} />
                                        <button
                                          type="submit"
                                          className="block w-full rounded-lg px-3 py-2 text-left font-medium text-[var(--ui-danger)] hover:bg-[var(--ui-surface-2)]"
                                        >
                                          Eliminar borrador
                                        </button>
                                      </form>
                                    ) : (
                                      <div className="px-3 py-2 text-xs text-[var(--ui-muted)]">
                                        Los publicados se corrigen desde la vista semanal.
                                      </div>
                                    )}
                                  </div>
                                </details>
                              ))}

                              <Link
                                href={buildMonthHref(selectedSiteId, selectedMonthKey, {
                                  open: "1",
                                  employee_id: employee.id,
                                  date: day.iso,
                                })}
                                className="mt-auto flex min-h-7 items-center justify-center rounded-lg border border-dashed border-transparent text-base font-semibold text-[var(--ui-muted)] no-underline transition hover:border-[var(--ui-border)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
                                title={`Crear turno para ${employeeName} el ${day.dayNumber}`}
                              >
                                +
                              </Link>
                            </div>
                          </td>
                        );
                      })}

                      <td
                        className="border-b border-[var(--ui-border)] px-3 py-3 align-top"
                        data-sticky-total
                      >
                        <div className={`rounded-xl border p-2.5 ${status.totalClass}`}>
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-base font-bold">
                              {formatHours(totals.total)}
                            </span>
                            <span className="text-[10px] font-semibold">/ 186 h</span>
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/80">
                            <div
                              className={`h-full rounded-full ${status.barClass}`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <div className="mt-2 text-[10px] font-semibold">
                            {status.label}
                          </div>
                          <div className="mt-1 text-[9px] opacity-75">
                            Todas las sedes · Pub. {formatHours(totals.published)} · Borr. {formatHours(totals.draft)}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Script id="viso-monthly-schedule-controls" strategy="afterInteractive">
        {`
          (function () {
            function parseMinutes(value) {
              var parts = String(value || "").split(":");
              if (parts.length < 2) return 0;
              return Number(parts[0] || 0) * 60 + Number(parts[1] || 0);
            }

            function formatHours(minutes) {
              var hours = Math.max(0, minutes) / 60;
              var decimals = Number.isInteger(hours) ? 0 : 1;
              return hours.toFixed(decimals).replace(".", ",") + " h";
            }

            function initForm(form) {
              if (!form || form.dataset.ready === "1") return;
              form.dataset.ready = "1";

              var employeeSelect = form.querySelector("[data-monthly-employee]");
              var roleSelect = form.querySelector("[data-monthly-role]");
              var startInput = form.querySelector("[data-monthly-start]");
              var endInput = form.querySelector("[data-monthly-end]");
              var breakSelect = form.querySelector("[data-monthly-break]");
              var projection = form.querySelector("[data-monthly-projection]");
              var limit = Number(form.getAttribute("data-limit-minutes") || "11160");
              var warning = Number(form.getAttribute("data-warning-minutes") || "10440");

              function selectedEmployeeOption() {
                if (!employeeSelect || employeeSelect.selectedIndex < 0) return null;
                return employeeSelect.options[employeeSelect.selectedIndex] || null;
              }

              function applyEmployeeDefaultRole() {
                var option = selectedEmployeeOption();
                var defaultRole = option ? option.getAttribute("data-default-role") || "" : "";
                if (roleSelect && defaultRole) roleSelect.value = defaultRole;
              }

              function refreshProjection() {
                var option = selectedEmployeeOption();
                var current = Number(option ? option.getAttribute("data-current-minutes") || "0" : "0");
                var count = form.querySelectorAll("[data-month-day]:checked").length;
                var gross = Math.max(0, parseMinutes(endInput ? endInput.value : "") - parseMinutes(startInput ? startInput.value : ""));
                var breakMinutes = Number(breakSelect ? breakSelect.value || "0" : "0");
                var perShift = Math.max(0, gross - breakMinutes);
                var added = perShift * count;
                var total = current + added;

                var currentNode = form.querySelector("[data-projection-current]");
                var newNode = form.querySelector("[data-projection-new]");
                var totalNode = form.querySelector("[data-projection-total]");
                var statusNode = form.querySelector("[data-projection-status]");
                if (currentNode) currentNode.textContent = formatHours(current);
                if (newNode) newNode.textContent = "+" + formatHours(added);
                if (totalNode) totalNode.textContent = formatHours(total) + " / 186 h";

                if (projection) {
                  projection.classList.remove("border-emerald-200", "bg-emerald-50", "text-emerald-900", "border-amber-300", "bg-amber-50", "text-amber-900", "border-red-300", "bg-red-50", "text-red-900");
                }
                if (total > limit) {
                  if (statusNode) statusNode.textContent = "Excede por " + formatHours(total - limit) + ". Se guardará solo como borrador.";
                  if (projection) projection.classList.add("border-red-300", "bg-red-50", "text-red-900");
                } else if (total >= warning) {
                  if (statusNode) statusNode.textContent = "Cerca del límite";
                  if (projection) projection.classList.add("border-amber-300", "bg-amber-50", "text-amber-900");
                } else {
                  if (statusNode) statusNode.textContent = "Dentro del límite";
                  if (projection) projection.classList.add("border-emerald-200", "bg-emerald-50", "text-emerald-900");
                }
              }

              form.querySelectorAll("[data-select-month-days]").forEach(function (button) {
                button.addEventListener("click", function () {
                  var mode = button.getAttribute("data-select-month-days");
                  form.querySelectorAll("[data-month-day]").forEach(function (input) {
                    if (mode === "clear") input.checked = false;
                    else if (mode === "all") input.checked = true;
                    else if (mode === "weekdays") input.checked = input.getAttribute("data-weekend") !== "1";
                  });
                  refreshProjection();
                });
              });

              form.addEventListener("change", function (event) {
                var target = event.target;
                if (target === employeeSelect) applyEmployeeDefaultRole();
                refreshProjection();
              });
              form.addEventListener("input", refreshProjection);
              applyEmployeeDefaultRole();
              refreshProjection();
            }

            function initMenus() {
              document.addEventListener("toggle", function (event) {
                var menu = event.target;
                if (!menu || !menu.matches || !menu.matches("[data-month-shift-menu]") || !menu.open) return;
                document.querySelectorAll("[data-month-shift-menu][open]").forEach(function (current) {
                  if (current !== menu) current.removeAttribute("open");
                });
              }, true);
              document.addEventListener("pointerdown", function (event) {
                var target = event.target;
                if (!target || !target.closest || target.closest("[data-month-shift-menu]")) return;
                document.querySelectorAll("[data-month-shift-menu][open]").forEach(function (menu) {
                  menu.removeAttribute("open");
                });
              });
            }

            function initConfirmations() {
              document.addEventListener("submit", function (event) {
                var form = event.target;
                if (!form || !form.getAttribute) return;
                var message = form.getAttribute("data-confirm-message");
                if (!message) return;
                if (!window.confirm(message)) event.preventDefault();
              });
            }

            function init() {
              document.querySelectorAll("[data-monthly-shift-form]").forEach(initForm);
              initMenus();
              initConfirmations();
            }

            if (document.readyState === "loading") {
              document.addEventListener("DOMContentLoaded", init, { once: true });
            } else {
              init();
            }
          })();
        `}
      </Script>
    </div>
  );
}
