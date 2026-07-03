import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";
import type { createAdminClient } from "@/lib/supabase/admin";
import type {
  PlanningAvailability,
  PlanningRequirement,
  PlanningShiftDraft,
} from "@/lib/planning-ai/types";
export type SiteRow = {
  id: string;
  name: string | null;
  code: string | null;
  site_type?: string | null;
  type?: string | null;
  operational_visibility?: string | null;
  site_operational_capabilities?:
    | { can_schedule_staff: boolean | null }
    | { can_schedule_staff: boolean | null }[]
    | null;
};

export type EmployeeRow = {
  id: string;
  full_name: string | null;
  alias: string | null;
  role: string | null;
  is_active: boolean | null;
  site_id: string | null;
};

export type EmployeeSiteLink = {
  employee_id: string;
  is_active: boolean | null;
  employee?: EmployeeRow | EmployeeRow[] | null;
};

export type ShiftRow = {
  id: string;
  employee_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  shift_kind?: string | null;
  operational_role?: string | null;
  show_end_as_close?: boolean | null;
  break_minutes: number | null;
  status: string;
  notes: string | null;
  site_id: string;
  area_id?: string | null;
  checkin_site_id?: string | null;
  checkout_site_id?: string | null;
  published_at?: string | null;
};

export type AttendanceLogRow = {
  shift_id: string | null;
  employee_id: string;
  site_id: string;
  action: "check_in" | "check_out";
  occurred_at: string;
};

export type ShiftAttendanceInfo = {
  checkInAt: string | null;
  checkOutAt: string | null;
};

export type EmployeePeriodTotals = {
  publishedMinutes: number;
  draftMinutes: number;
  totalMinutes: number;
};

export type EmployeeTotals = {
  week: EmployeePeriodTotals;
  fortnight: EmployeePeriodTotals;
  month: EmployeePeriodTotals;
};

export type ScheduleTableColumn = {
  key: string;
  label: string;
  subLabel?: string;
  width: number;
  minWidth: number;
};

export type StaffingRequirementRow = {
  id: string;
  site_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  min_headcount: number;
  ideal_headcount: number;
  max_headcount: number | null;
  required_role_code: string | null;
};

export type HistoricalShiftPatternRow = {
  shift_date: string;
  start_time: string;
  end_time: string;
  employee_id?: string | null;
  operational_role?: string | null;
  employee_role?: string | null;
  count: number;
};

export type EmployeeHistoricalPlanningSignals = {
  recentMorningShifts: number;
  recentAfternoonShifts: number;
  recentEveningShifts: number;
  lastWeekMorningShifts: number;
  lastWeekAfternoonShifts: number;
  lastWeekEveningShifts: number;
  recentOpeningShifts: number;
  recentClosingShifts: number;
  recentWeekendShifts: number;
};

export type AvailabilityRow = {
  employee_id: string;
  site_id: string | null;
  day_of_week: number;
  available_from: string;
  available_to: string;
  is_available: boolean;
  availability_kind: "preferred" | "allowed" | "blocked";
};

export type RoleConcurrencyLimitRow = {
  id: string;
  site_id: string | null;
  role_code: string;
  day_of_week: number | null;
  start_time: string | null;
  end_time: string | null;
  max_concurrent: number;
  applies_across_sites: boolean;
  is_active: boolean;
};

export type OperationalRoleOption = {
  code: string;
  label: string;
  siteId?: string | null;
  areaId?: string | null;
  areaLabel?: string | null;
  areaKind?: string | null;
  isDefault?: boolean | null;
  requiresExternalCheckin?: boolean | null;
  requiresExternalCheckout?: boolean | null;
};

export type SiteOperationalRoleRow = {
  site_id: string;
  area_id: string | null;
  area_name: string | null;
  area_kind: string | null;
  role_code: string;
  role_label: string | null;
  role_family: string | null;
  is_default: boolean | null;
  requires_external_checkin: boolean | null;
  requires_external_checkout: boolean | null;
};

export type OperationalAreaOption = {
  id: string;
  label: string;
  kind: string | null;
  siteId?: string | null;
};

export type EmployeeOperationalProfileRow = {
  employee_id: string;
  site_id: string | null;
  default_operational_role: string | null;
  default_checkin_site_id: string | null;
  default_checkout_site_id: string | null;
  is_active: boolean | null;
};

export type ShiftOperationalContextSeed = {
  employeeId: string;
  siteId: string;
  operationalRole: string | null | undefined;
};

export type ShiftOperationalContext = {
  checkinSiteId: string | null;
  checkoutSiteId: string | null;
};

export const STAFF_SCHEDULE_SITE_TYPES = new Set([
  "satellite",
  "production_center",
  "admin",
]);
export const STAFF_SCHEDULE_PERMISSION = "staff.schedule.view";

export const FULL_DAY_REST_START_TIME = "00:00";
export const FULL_DAY_REST_END_TIME = "23:59";

export function requireStaffScheduleAccess(returnTo: string, siteId?: string | null) {
  return requireAppAccess({
    appId: "viso",
    returnTo,
    permissionCode: STAFF_SCHEDULE_PERMISSION,
    siteId,
    allowPermissionAccess: true,
  });
}

export function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export function asNumber(value: FormDataEntryValue | null, fallback = 0) {
  if (typeof value !== "string" || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function isOperationalSite(site: SiteRow) {
  if (site.operational_visibility === "hidden") return false;
  if (site.type === "checkin_point") return false;
  const capability = Array.isArray(site.site_operational_capabilities)
    ? site.site_operational_capabilities[0]
    : site.site_operational_capabilities;
  if (typeof capability?.can_schedule_staff === "boolean")
    return capability.can_schedule_staff;
  if (!site.site_type) return true;
  return STAFF_SCHEDULE_SITE_TYPES.has(site.site_type);
}

export function toMonday(date: Date) {
  const copy = new Date(date);
  copy.setHours(12, 0, 0, 0);
  const day = copy.getDay();
  const diff = (day + 6) % 7;
  copy.setDate(copy.getDate() - diff);
  return copy;
}

export function parseWeekStart(input?: string) {
  if (!input) return toMonday(new Date());
  const parsed = new Date(`${input}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return toMonday(new Date());
  return toMonday(parsed);
}

export function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(base: Date, days: number) {
  const copy = new Date(base);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
}

export function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 12, 0, 0, 0);
}

export function getFortnightRange(date: Date) {
  const day = date.getDate();
  const start = new Date(
    date.getFullYear(),
    date.getMonth(),
    day <= 15 ? 1 : 16,
    12,
    0,
    0,
    0,
  );
  const end = new Date(
    date.getFullYear(),
    date.getMonth(),
    day <= 15
      ? 15
      : new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate(),
    12,
    0,
    0,
    0,
  );
  return { start, end };
}

export function getShiftMinutes(
  shift: Pick<
    ShiftRow,
    "start_time" | "end_time" | "break_minutes" | "shift_kind"
  >,
) {
  if (shift.shift_kind === "descanso") return 0;
  const [startHours, startMinutes] = shift.start_time
    .slice(0, 5)
    .split(":")
    .map(Number);
  const [endHours, endMinutes] = shift.end_time
    .slice(0, 5)
    .split(":")
    .map(Number);
  const gross = endHours * 60 + endMinutes - (startHours * 60 + startMinutes);
  return Math.max(0, gross - Math.max(0, shift.break_minutes ?? 0));
}

export function buildWeekDays(weekStart: Date) {
  return Array.from({ length: 7 }).map((_, index) => {
    const date = addDays(weekStart, index);
    return {
      iso: isoDate(date),
      label: date.toLocaleDateString("es-CO", { weekday: "long" }),
      shortLabel: date.toLocaleDateString("es-CO", {
        day: "2-digit",
        month: "short",
      }),
    };
  });
}

export function getDayOfWeek(iso: string) {
  const parsed = new Date(`${iso}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? -1 : parsed.getDay();
}

export function getScheduleDayPart(startTime: string) {
  const minutes = parseTimeToMinutes(startTime);
  if (minutes < 12 * 60) return "morning";
  if (minutes < 18 * 60) return "afternoon";
  return "evening";
}

export function createEmptyHistoricalSignals(): EmployeeHistoricalPlanningSignals {
  return {
    recentMorningShifts: 0,
    recentAfternoonShifts: 0,
    recentEveningShifts: 0,
    lastWeekMorningShifts: 0,
    lastWeekAfternoonShifts: 0,
    lastWeekEveningShifts: 0,
    recentOpeningShifts: 0,
    recentClosingShifts: 0,
    recentWeekendShifts: 0,
  };
}

export function buildEmployeeHistoricalSignals(
  rows: Array<{
    employee_id: string | null;
    shift_date: string;
    start_time: string;
    end_time: string;
    shift_kind: string | null;
  }>,
  weekStart: Date,
) {
  const index = new Map<string, EmployeeHistoricalPlanningSignals>();
  const lastWeekStartIso = isoDate(addDays(weekStart, -7));
  const lastWeekEndIso = isoDate(addDays(weekStart, -1));

  for (const row of rows) {
    if (!row.employee_id || row.shift_kind === "descanso") continue;
    const signals =
      index.get(row.employee_id) ?? createEmptyHistoricalSignals();
    const dayPart = getScheduleDayPart(row.start_time);
    const isLastWeek =
      row.shift_date >= lastWeekStartIso && row.shift_date <= lastWeekEndIso;

    if (dayPart === "morning") {
      signals.recentMorningShifts += 1;
      if (isLastWeek) signals.lastWeekMorningShifts += 1;
    } else if (dayPart === "afternoon") {
      signals.recentAfternoonShifts += 1;
      if (isLastWeek) signals.lastWeekAfternoonShifts += 1;
    } else {
      signals.recentEveningShifts += 1;
      if (isLastWeek) signals.lastWeekEveningShifts += 1;
    }

    if (parseTimeToMinutes(row.start_time) <= 7 * 60) {
      signals.recentOpeningShifts += 1;
    }
    if (parseTimeToMinutes(row.end_time) >= 21 * 60) {
      signals.recentClosingShifts += 1;
    }
    const dayOfWeek = getDayOfWeek(row.shift_date);
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      signals.recentWeekendShifts += 1;
    }

    index.set(row.employee_id, signals);
  }

  return index;
}

export function normalizeRole(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function roleMatches(
  role: string | null | undefined,
  requiredRole: string | null | undefined,
) {
  const normalizedRole = normalizeRole(role);
  const normalizedRequired = normalizeRole(requiredRole);
  if (!normalizedRequired) return true;
  if (!normalizedRole) return false;
  return (
    normalizedRole === normalizedRequired ||
    normalizedRole.includes(normalizedRequired) ||
    normalizedRequired.includes(normalizedRole)
  );
}

export function buildHistoricalRequirements(
  weekDays: ReturnType<typeof buildWeekDays>,
  rows: HistoricalShiftPatternRow[],
  siteId: string,
) {
  const byDay = new Map<number, HistoricalShiftPatternRow[]>();
  for (const row of rows) {
    const dayOfWeek = getDayOfWeek(row.shift_date);
    if (dayOfWeek < 0) continue;
    const list = byDay.get(dayOfWeek) ?? [];
    list.push(row);
    byDay.set(dayOfWeek, list);
  }

  const requirements: PlanningRequirement[] = [];
  for (const day of weekDays) {
    const patterns = [...(byDay.get(getDayOfWeek(day.iso)) ?? [])]
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    for (const pattern of patterns) {
      const headcount = Math.min(4, Math.max(1, Math.round(pattern.count / 4)));
      for (let index = 0; index < headcount; index += 1) {
        requirements.push({
          siteId,
          shiftDate: day.iso,
          startTime: pattern.start_time,
          endTime: pattern.end_time,
          requiredHeadcount: 1,
          roleCode:
            pattern.operational_role ??
            getOperationalRoleCandidateFromBaseRole(pattern.employee_role) ??
            pattern.employee_role ??
            null,
        });
      }
    }
  }

  return requirements;
}

export function humanizeRoleCode(value: string | null | undefined) {
  return String(value ?? "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getOperationalRoleLabel(
  value: string | null | undefined,
  options: OperationalRoleOption[] = [],
) {
  const code = String(value ?? "").trim();
  if (!code) return "Rol base";
  return (
    options.find((option) => option.code === code)?.label ??
    humanizeRoleCode(code)
  );
}

export const BASE_ROLE_TO_OPERATIONAL_ROLE: Record<string, string> = {
  cajero: "cajero_satelite",
  barista: "barista_satelite",
  cocinero: "cocinero_satelite",
  mesero: "servicio_salon",
  servicio: "servicio_salon",
  mostrador: "mostrador_satelite",
  bodeguero: "bodeguero",
  conductor: "conductor_logistica",
  panadero: "produccion_panaderia",
  pastelero: "produccion_reposteria",
  repostero: "produccion_reposteria",
  gerente: "gerencia_operativa",
  gerente_general: "gerencia_operativa",
  propietario: "propietario_admin",
};

export function getOperationalRoleCandidateFromBaseRole(
  value: string | null | undefined,
) {
  const normalized = normalizeRole(value)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return BASE_ROLE_TO_OPERATIONAL_ROLE[normalized] ?? normalized;
}

export function formatWeekLabel(weekStart: Date) {
  const end = addDays(weekStart, 6);
  return `${weekStart.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
  })} - ${end.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}`;
}

export function formatShiftRange(
  startTime: string,
  endTime: string,
  showEndAsClose?: boolean | null,
  shiftKind?: string | null,
) {
  if (shiftKind === "descanso") return "Descanso";
  return showEndAsClose
    ? `${startTime.slice(0, 5)} - Cierre`
    : `${startTime.slice(0, 5)} - ${endTime.slice(0, 5)}`;
}

export function formatHoursCompact(totalMinutes: number) {
  const safe = Math.max(0, Math.round(totalMinutes));
  const hours = safe / 60;
  if (Number.isInteger(hours)) {
    return `${hours} ${hours === 1 ? "hora" : "horas"}`;
  }
  return `${hours.toFixed(1).replace(".", ",")} horas`;
}

export function createEmptyPeriodTotals(): EmployeePeriodTotals {
  return {
    publishedMinutes: 0,
    draftMinutes: 0,
    totalMinutes: 0,
  };
}

export function addMinutesToPeriodTotals(
  totals: EmployeePeriodTotals,
  minutes: number,
  isPublished: boolean,
) {
  totals.totalMinutes += minutes;
  if (isPublished) {
    totals.publishedMinutes += minutes;
  } else {
    totals.draftMinutes += minutes;
  }
}

export const BOGOTA_TIME_ZONE = "America/Bogota";

export function getBogotaDateTimeParts(dateInput: Date | string) {
  const parsed =
    typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (Number.isNaN(parsed.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BOGOTA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(parsed);
  const lookup = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const year = lookup.year;
  const month = lookup.month;
  const day = lookup.day;
  const hour = Number(lookup.hour ?? "0");
  const minute = Number(lookup.minute ?? "0");
  if (!year || !month || !day) return null;
  return {
    dateIso: `${year}-${month}-${day}`,
    minutes: hour * 60 + minute,
  };
}

export function parseTimeToMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

export function hasShiftEnded(
  shift: ShiftRow,
  nowDateIso: string,
  nowMinutes: number,
) {
  if (nowDateIso > shift.shift_date) return true;
  if (nowDateIso < shift.shift_date) return false;
  return nowMinutes > parseTimeToMinutes(shift.end_time);
}

export function isLateCheckIn(
  shift: ShiftRow,
  checkInAt: string,
  lateToleranceMinutes: number,
) {
  const checkInParts = getBogotaDateTimeParts(checkInAt);
  if (!checkInParts) return false;
  if (checkInParts.dateIso > shift.shift_date) return true;
  if (checkInParts.dateIso < shift.shift_date) return false;
  const toleranceLimit =
    parseTimeToMinutes(shift.start_time) + Math.max(0, lateToleranceMinutes);
  return checkInParts.minutes > toleranceLimit;
}

export function getVisibleShiftStatus(
  shift: ShiftRow,
  attendance: ShiftAttendanceInfo | undefined,
  nowDateIso: string,
  nowMinutes: number,
  lateToleranceMinutes: number,
) {
  if (shift.shift_kind === "descanso") return "Descanso";
  if (!shift.published_at) return "Borrador";
  if (shift.status === "cancelled") return "Cancelado";
  if (shift.status === "no_show") return "No asistió";
  if (shift.status === "completed") return "Asistió";

  if (attendance?.checkInAt) {
    return isLateCheckIn(shift, attendance.checkInAt, lateToleranceMinutes)
      ? "Con retraso"
      : "Asistió";
  }

  if (hasShiftEnded(shift, nowDateIso, nowMinutes)) return "No asistió";
  return "Programado";
}

export function isShiftInProgress(
  shift: ShiftRow,
  nowDateIso: string,
  nowMinutes: number,
) {
  if (shift.shift_kind === "descanso") return false;
  if (shift.status === "cancelled") return false;
  if (nowDateIso !== shift.shift_date) return false;
  return (
    nowMinutes >= parseTimeToMinutes(shift.start_time) &&
    nowMinutes <= parseTimeToMinutes(shift.end_time)
  );
}

export type AreaVisual = {
  label: string;
  chipClass: string;
  rowClass: string;
  shiftClass: string;
};

export const AREA_ORDER = ["Caja", "Servicio", "Barra", "Cocina", "General"] as const;

export function getAreaVisualFromRole(role: string | null | undefined): AreaVisual {
  const normalized = String(role ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  if (normalized.includes("caj")) {
    return {
      label: "Caja",
      chipClass: "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700",
      rowClass: "bg-fuchsia-50/40",
      shiftClass: "border-fuchsia-300 bg-fuchsia-50",
    };
  }
  if (
    normalized.includes("meser") ||
    normalized.includes("serv") ||
    normalized.includes("anfit") ||
    normalized.includes("runner") ||
    normalized.includes("host")
  ) {
    return {
      label: "Servicio",
      chipClass: "border-lime-300 bg-lime-50 text-lime-700",
      rowClass: "bg-lime-50/40",
      shiftClass: "border-lime-300 bg-lime-50",
    };
  }
  if (normalized.includes("bar")) {
    return {
      label: "Barra",
      chipClass: "border-orange-300 bg-orange-50 text-orange-700",
      rowClass: "bg-orange-50/40",
      shiftClass: "border-orange-300 bg-orange-50",
    };
  }
  if (normalized.includes("cocin") || normalized.includes("repost")) {
    return {
      label: "Cocina",
      chipClass: "border-sky-300 bg-sky-50 text-sky-700",
      rowClass: "bg-sky-50/40",
      shiftClass: "border-sky-300 bg-sky-50",
    };
  }
  return {
    label: "General",
    chipClass: "border-slate-300 bg-slate-50 text-slate-700",
    rowClass: "bg-slate-50/30",
    shiftClass: "border-slate-300 bg-slate-50",
  };
}

export function buildReturnTo(siteId: string, weekStartIso: string, view?: string) {
  const query = new URLSearchParams();
  if (siteId) query.set("site_id", siteId);
  if (weekStartIso) query.set("week", weekStartIso);
  if (view === "table") query.set("view", view);
  return `/staff/schedule?${query.toString()}`;
}

export function appendReturnParams(
  returnTo: string,
  params: Record<string, string | null | undefined>,
) {
  const [pathname, rawQuery = ""] = returnTo.split("?");
  const query = new URLSearchParams(rawQuery);
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      query.set(key, value);
    } else {
      query.delete(key);
    }
  }
  const nextQuery = query.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

export function getEmployeeRef(row: EmployeeSiteLink["employee"]) {
  if (!row) return null;
  return Array.isArray(row) ? (row[0] ?? null) : row;
}

export function cleanOptionalText(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

export function uniqueTextValues(values: Array<string | null | undefined>) {
  return [
    ...new Set(
      values
        .map(cleanOptionalText)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}

export function profileLookupKey(
  employeeId: string,
  siteId: string,
  operationalRole: string,
) {
  return `${employeeId}::${siteId}::${operationalRole}`;
}

export async function loadShiftOperationalContextIndex(
  supabase: ReturnType<typeof createAdminClient>,
  seeds: ShiftOperationalContextSeed[],
) {
  const normalizedSeeds = seeds
    .map((seed) => ({
      employeeId: cleanOptionalText(seed.employeeId),
      siteId: cleanOptionalText(seed.siteId),
      operationalRole: cleanOptionalText(seed.operationalRole),
    }))
    .filter(
      (
        seed,
      ): seed is {
        employeeId: string;
        siteId: string;
        operationalRole: string;
      } => Boolean(seed.employeeId && seed.siteId && seed.operationalRole),
    );

  const contextIndex = new Map<string, ShiftOperationalContext>();
  if (normalizedSeeds.length === 0) return contextIndex;

  const employeeIds = uniqueTextValues(
    normalizedSeeds.map((seed) => seed.employeeId),
  );
  const siteIds = uniqueTextValues(normalizedSeeds.map((seed) => seed.siteId));
  const roleCodes = uniqueTextValues(
    normalizedSeeds.map((seed) => seed.operationalRole),
  );

  const { data: profileRows, error: profilesError } = await supabase
    .from("employee_site_operational_profiles")
    .select(
      "employee_id,site_id,default_operational_role,default_checkin_site_id,default_checkout_site_id,is_active",
    )
    .in("employee_id", employeeIds)
    .in("site_id", siteIds)
    .in("default_operational_role", roleCodes)
    .neq("is_active", false);

  if (profilesError) throw new Error(profilesError.message);

  for (const profile of (profileRows ??
    []) as EmployeeOperationalProfileRow[]) {
    const employeeId = cleanOptionalText(profile.employee_id);
    const siteId = cleanOptionalText(profile.site_id);
    const operationalRole = cleanOptionalText(profile.default_operational_role);
    if (!employeeId || !siteId || !operationalRole) continue;

    contextIndex.set(profileLookupKey(employeeId, siteId, operationalRole), {
      checkinSiteId: cleanOptionalText(profile.default_checkin_site_id),
      checkoutSiteId: cleanOptionalText(profile.default_checkout_site_id),
    });
  }

  return contextIndex;
}

export function getShiftOperationalContext(
  contextIndex: Map<string, ShiftOperationalContext>,
  employeeId: string,
  siteId: string,
  operationalRole: string | null | undefined,
) {
  const roleCode = cleanOptionalText(operationalRole);
  if (!employeeId || !siteId || !roleCode) return null;
  return (
    contextIndex.get(profileLookupKey(employeeId, siteId, roleCode)) ?? null
  );
}

export function resolveContextSiteId(
  explicitValue: string | null | undefined,
  contextValue: string | null | undefined,
) {
  return cleanOptionalText(explicitValue) ?? cleanOptionalText(contextValue);
}

export function withShiftOperationalContext<T extends Record<string, unknown>>(
  payload: T,
  context: ShiftOperationalContext | null,
  shiftKind: string,
  explicitContext?: ShiftOperationalContext | null,
) {
  return {
    ...payload,
    checkin_site_id:
      shiftKind === "descanso"
        ? null
        : resolveContextSiteId(
            explicitContext?.checkinSiteId,
            context?.checkinSiteId,
          ),
    checkout_site_id:
      shiftKind === "descanso"
        ? null
        : resolveContextSiteId(
            explicitContext?.checkoutSiteId,
            context?.checkoutSiteId,
          ),
  };
}

export function getApplicableOperationalRoleRows(
  rows: SiteOperationalRoleRow[],
  areaId: string | null | undefined,
) {
  const normalizedAreaId = cleanOptionalText(areaId);
  const scopedRows = rows.filter(
    (row) => cleanOptionalText(row.area_id) === normalizedAreaId,
  );
  if (scopedRows.length > 0) return scopedRows;
  if (normalizedAreaId)
    return rows.filter((row) => cleanOptionalText(row.area_id) === null);
  return scopedRows;
}

export function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function getOkMessage(code: string) {
  switch (code) {
    case "turno_creado_borrador":
      return "Turno guardado en borrador. No se enviaron notificaciones.";
    case "turnos_creados_borrador":
      return "Turnos guardados en borrador. No se enviaron notificaciones.";
    case "turno_actualizado_borrador":
      return "Borrador actualizado. No se enviaron notificaciones.";
    case "turno_eliminado":
      return "Turno eliminado.";
    case "turnos_eliminados":
      return "Bloques eliminados correctamente.";
    case "borradores_descartados":
      return "Se eliminaron los borradores de la semana.";
    case "turnos_asignados_masivo":
      return "Bloques copiados a los trabajadores seleccionados.";
    case "sin_borradores_por_publicar":
      return "No había borradores por publicar en esta semana.";
    case "semana_publicada":
      return "Semana publicada y notificada a los trabajadores con turnos en borrador.";
    case "semana_copiada_borrador":
      return "Semana anterior copiada en borrador.";
    case "cobertura_guardada":
      return "Franja de cobertura guardada.";
    case "cobertura_eliminada":
      return "Franja de cobertura eliminada.";
    case "disponibilidad_guardada":
      return "Disponibilidad guardada.";
    case "disponibilidad_eliminada":
      return "Disponibilidad eliminada.";
    case "reglas_trabajador_guardadas":
      return "Límites y preferencias del trabajador guardados.";
    case "sugerencia_generada_borrador":
      return "Se generó un borrador sugerido y quedó guardado sin publicar.";
    case "sugerencia_sin_resultado":
      return "La sugerencia se ejecutó, pero no encontró asignaciones válidas nuevas.";
    case "sugerencia_no_necesaria":
      return "La cobertura mínima de la semana ya estaba cubierta con los turnos actuales.";
    default:
      return code ? code.replace(/_/g, " ") : "";
  }
}


