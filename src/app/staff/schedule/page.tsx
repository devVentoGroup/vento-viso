import Link from "next/link";
import Script from "next/script";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { PageHeader } from "@/components/vento/standard/page-header";
import { notifyShiftChange } from "@/lib/anima/shift-notify";
import { requireAppAccess } from "@/lib/auth/guard";
import { generateWeeklySuggestion } from "@/lib/planning-ai/generate";
import type {
  PlanningAvailability,
  PlanningGenerationInput,
  PlanningRequirement,
  PlanningShiftDraft,
} from "@/lib/planning-ai/types";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type SiteRow = {
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

type EmployeeRow = {
  id: string;
  full_name: string | null;
  alias: string | null;
  role: string | null;
  is_active: boolean | null;
  site_id: string | null;
};

type EmployeeSiteLink = {
  employee_id: string;
  is_active: boolean | null;
  employee?: EmployeeRow | EmployeeRow[] | null;
};

type ShiftRow = {
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

type AttendanceLogRow = {
  shift_id: string | null;
  employee_id: string;
  site_id: string;
  action: "check_in" | "check_out";
  occurred_at: string;
};

type ShiftAttendanceInfo = {
  checkInAt: string | null;
  checkOutAt: string | null;
};

type EmployeeTotals = {
  weekMinutes: number;
  fortnightMinutes: number;
  monthMinutes: number;
};

type ScheduleTableColumn = {
  key: string;
  label: string;
  subLabel?: string;
  width: number;
  minWidth: number;
};

type StaffingRequirementRow = {
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

type HistoricalShiftPatternRow = {
  shift_date: string;
  start_time: string;
  end_time: string;
  employee_id?: string | null;
  operational_role?: string | null;
  employee_role?: string | null;
  count: number;
};

type EmployeeHistoricalPlanningSignals = {
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

type AvailabilityRow = {
  employee_id: string;
  site_id: string | null;
  day_of_week: number;
  available_from: string;
  available_to: string;
  is_available: boolean;
  availability_kind: "preferred" | "allowed" | "blocked";
};

type OperationalRoleOption = {
  code: string;
  label: string;
  areaId?: string | null;
  areaLabel?: string | null;
  areaKind?: string | null;
  isDefault?: boolean | null;
  requiresExternalCheckin?: boolean | null;
  requiresExternalCheckout?: boolean | null;
};

type SiteOperationalRoleRow = {
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

type OperationalAreaOption = {
  id: string;
  label: string;
  kind: string | null;
};

type EmployeeOperationalProfileRow = {
  employee_id: string;
  site_id: string | null;
  default_operational_role: string | null;
  default_checkin_site_id: string | null;
  default_checkout_site_id: string | null;
  is_active: boolean | null;
};

type ShiftOperationalContextSeed = {
  employeeId: string;
  siteId: string;
  operationalRole: string | null | undefined;
};

type ShiftOperationalContext = {
  checkinSiteId: string | null;
  checkoutSiteId: string | null;
};

const STAFF_SCHEDULE_SITE_TYPES = new Set([
  "satellite",
  "production_center",
  "admin",
]);
const STAFF_SCHEDULE_PERMISSION = "staff.schedule.view";

const FULL_DAY_REST_START_TIME = "00:00";
const FULL_DAY_REST_END_TIME = "23:59";

function requireStaffScheduleAccess(returnTo: string, siteId?: string | null) {
  return requireAppAccess({
    appId: "viso",
    returnTo,
    permissionCode: STAFF_SCHEDULE_PERMISSION,
    siteId,
    allowPermissionAccess: true,
  });
}

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: FormDataEntryValue | null, fallback = 0) {
  if (typeof value !== "string" || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isOperationalSite(site: SiteRow) {
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

function toMonday(date: Date) {
  const copy = new Date(date);
  copy.setHours(12, 0, 0, 0);
  const day = copy.getDay();
  const diff = (day + 6) % 7;
  copy.setDate(copy.getDate() - diff);
  return copy;
}

function parseWeekStart(input?: string) {
  if (!input) return toMonday(new Date());
  const parsed = new Date(`${input}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return toMonday(new Date());
  return toMonday(parsed);
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(base: Date, days: number) {
  const copy = new Date(base);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 12, 0, 0, 0);
}

function getFortnightRange(date: Date) {
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

function getShiftMinutes(
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

function buildWeekDays(weekStart: Date) {
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

function getDayOfWeek(iso: string) {
  const parsed = new Date(`${iso}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? -1 : parsed.getDay();
}

function getScheduleDayPart(startTime: string) {
  const minutes = parseTimeToMinutes(startTime);
  if (minutes < 12 * 60) return "morning";
  if (minutes < 18 * 60) return "afternoon";
  return "evening";
}

function createEmptyHistoricalSignals(): EmployeeHistoricalPlanningSignals {
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

function buildEmployeeHistoricalSignals(
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

function normalizeRole(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function roleMatches(
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

function buildHistoricalRequirements(
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
          roleCode: pattern.operational_role ?? pattern.employee_role ?? null,
        });
      }
    }
  }

  return requirements;
}

function humanizeRoleCode(value: string | null | undefined) {
  return String(value ?? "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getOperationalRoleLabel(
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

const BASE_ROLE_TO_OPERATIONAL_ROLE: Record<string, string> = {
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

function getOperationalRoleCandidateFromBaseRole(
  value: string | null | undefined,
) {
  const normalized = normalizeRole(value)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return BASE_ROLE_TO_OPERATIONAL_ROLE[normalized] ?? normalized;
}

function formatWeekLabel(weekStart: Date) {
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

function formatShiftRange(
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

function formatHoursCompact(totalMinutes: number) {
  const safe = Math.max(0, Math.round(totalMinutes));
  const hours = safe / 60;
  if (Number.isInteger(hours)) return `${hours}h`;
  return `${hours.toFixed(1).replace(".", ",")}h`;
}

const BOGOTA_TIME_ZONE = "America/Bogota";

function getBogotaDateTimeParts(dateInput: Date | string) {
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

function parseTimeToMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function hasShiftEnded(
  shift: ShiftRow,
  nowDateIso: string,
  nowMinutes: number,
) {
  if (nowDateIso > shift.shift_date) return true;
  if (nowDateIso < shift.shift_date) return false;
  return nowMinutes > parseTimeToMinutes(shift.end_time);
}

function isLateCheckIn(
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

function getVisibleShiftStatus(
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

type AreaVisual = {
  label: string;
  chipClass: string;
  rowClass: string;
  shiftClass: string;
};

const AREA_ORDER = ["Caja", "Servicio", "Barra", "Cocina", "General"] as const;

function getAreaVisualFromRole(role: string | null | undefined): AreaVisual {
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

function buildReturnTo(siteId: string, weekStartIso: string, view?: string) {
  const query = new URLSearchParams();
  if (siteId) query.set("site_id", siteId);
  if (weekStartIso) query.set("week", weekStartIso);
  if (view === "table") query.set("view", view);
  return `/staff/schedule?${query.toString()}`;
}

function appendReturnParams(
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

function getEmployeeRef(row: EmployeeSiteLink["employee"]) {
  if (!row) return null;
  return Array.isArray(row) ? (row[0] ?? null) : row;
}

function cleanOptionalText(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function uniqueTextValues(values: Array<string | null | undefined>) {
  return [
    ...new Set(
      values
        .map(cleanOptionalText)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}

function profileLookupKey(
  employeeId: string,
  siteId: string,
  operationalRole: string,
) {
  return `${employeeId}::${siteId}::${operationalRole}`;
}

async function loadShiftOperationalContextIndex(
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

function getShiftOperationalContext(
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

function resolveContextSiteId(
  explicitValue: string | null | undefined,
  contextValue: string | null | undefined,
) {
  return cleanOptionalText(explicitValue) ?? cleanOptionalText(contextValue);
}

function withShiftOperationalContext<T extends Record<string, unknown>>(
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

function getApplicableOperationalRoleRows(
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

async function saveShiftAction(formData: FormData) {
  "use server";
  const shiftId = asText(formData.get("shift_id"));
  const employeeId = asText(formData.get("employee_id"));
  const employeeIds = [
    ...new Set(
      formData
        .getAll("employee_ids")
        .map((value) => asText(value))
        .filter(Boolean),
    ),
  ];
  const siteId = asText(formData.get("site_id"));
  const areaId = asText(formData.get("area_id")) || null;
  let resolvedAreaId = areaId;
  const explicitCheckinSiteId = asText(formData.get("checkin_site_id")) || null;
  const explicitCheckoutSiteId =
    asText(formData.get("checkout_site_id")) || null;
  const explicitOperationalContext: ShiftOperationalContext = {
    checkinSiteId: explicitCheckinSiteId,
    checkoutSiteId: explicitCheckoutSiteId,
  };
  const shiftDate = asText(formData.get("shift_date"));
  const blockShiftDates = formData
    .getAll("block_shift_date")
    .map((value) => asText(value));
  const startTime = asText(formData.get("start_time"));
  const endTime = asText(formData.get("end_time"));
  const blockStartTimes = formData
    .getAll("block_start_time")
    .map((value) => asText(value));
  const blockEndTimes = formData
    .getAll("block_end_time")
    .map((value) => asText(value));
  const blockNotes = formData
    .getAll("block_notes")
    .map((value) => asText(value));
  const shiftNotes = asText(formData.get("notes"));
  const explicitShiftKind = asText(formData.get("shift_kind"));
  const operationalRole = asText(formData.get("operational_role")) || null;
  const isRestShift = asText(formData.get("rest_shift")) === "1";
  const isFullDayRest = asText(formData.get("full_day_rest")) === "1";
  const globalShiftKind =
    explicitShiftKind === "descanso" || isRestShift || isFullDayRest
      ? "descanso"
      : "laboral";
  const blockRestIndexes = new Set(
    formData
      .getAll("block_rest_day")
      .map((value) => Number(asText(value)))
      .filter((value) => Number.isInteger(value) && value >= 0),
  );
  const blockCount = Math.max(
    blockShiftDates.length,
    blockStartTimes.length,
    blockEndTimes.length,
    blockNotes.length,
  );
  const rawShiftBlocks: Array<{
    shiftDate: string;
    startTime: string;
    endTime: string;
    notes: string;
    shiftKind: "laboral" | "descanso";
  }> =
    blockCount > 0
      ? Array.from({ length: blockCount })
          .map((_, index) => {
            const isRestBlock = blockRestIndexes.has(index);
            return {
              shiftDate: blockShiftDates[index] || shiftDate,
              startTime: isRestBlock
                ? FULL_DAY_REST_START_TIME
                : (blockStartTimes[index] ?? ""),
              endTime: isRestBlock
                ? FULL_DAY_REST_END_TIME
                : (blockEndTimes[index] ?? ""),
              notes: blockNotes[index] ?? "",
              shiftKind: isRestBlock
                ? ("descanso" as const)
                : ("laboral" as const),
            };
          })
          .filter(
            (block) =>
              block.shiftDate ||
              block.startTime ||
              block.endTime ||
              block.notes,
          )
      : [];
  const resolvedShiftBlocks: Array<{
    shiftDate: string;
    startTime: string;
    endTime: string;
    notes: string;
    shiftKind: "laboral" | "descanso";
  }> =
    globalShiftKind === "descanso" && rawShiftBlocks.length === 0
      ? [
          {
            shiftDate,
            startTime: FULL_DAY_REST_START_TIME,
            endTime: FULL_DAY_REST_END_TIME,
            notes: shiftNotes,
            shiftKind: "descanso",
          },
        ]
      : rawShiftBlocks.length > 0
        ? rawShiftBlocks
        : [
            {
              shiftDate,
              startTime,
              endTime,
              notes: shiftNotes,
              shiftKind: "laboral",
            },
          ];
  const orderedShiftBlocks = [...resolvedShiftBlocks].sort((first, second) => {
    const dateCompare = first.shiftDate.localeCompare(second.shiftDate, "es");
    if (dateCompare !== 0) return dateCompare;
    const startCompare = first.startTime.localeCompare(second.startTime, "es");
    return startCompare !== 0
      ? startCompare
      : first.endTime.localeCompare(second.endTime, "es");
  });
  const firstShiftBlock = orderedShiftBlocks[0] ?? {
    shiftDate: "",
    startTime: "",
    endTime: "",
    notes: "",
    shiftKind: "laboral" as const,
  };
  const laboralShiftBlocks = orderedShiftBlocks.filter(
    (block) => block.shiftKind !== "descanso",
  );
  const restShiftBlocks = orderedShiftBlocks.filter(
    (block) => block.shiftKind === "descanso",
  );
  const hasLaboralBlocks = laboralShiftBlocks.length > 0;
  const requestedShiftDates = [
    ...new Set(
      orderedShiftBlocks.map((block) => block.shiftDate).filter(Boolean),
    ),
  ];
  const requestedLaboralShiftDates = [
    ...new Set(
      laboralShiftBlocks.map((block) => block.shiftDate).filter(Boolean),
    ),
  ];
  const requestedRestShiftDates = [
    ...new Set(restShiftBlocks.map((block) => block.shiftDate).filter(Boolean)),
  ];
  const resolvedStartTime = firstShiftBlock.startTime;
  const resolvedEndTime = firstShiftBlock.endTime;
  const showEndAsClose = asText(formData.get("show_end_as_close")) === "1";
  const returnTo = asText(formData.get("return_to")) || "/staff/schedule";
  const keepQuick = asText(formData.get("keep_quick")) === "1";
  const primaryShiftDate = firstShiftBlock.shiftDate || shiftDate;
  const requestedEmployeeIds =
    employeeIds.length > 0 ? employeeIds : employeeId ? [employeeId] : [];

  await requireStaffScheduleAccess(returnTo, siteId);
  const supabase = createAdminClient();

  if (
    requestedEmployeeIds.length === 0 ||
    !siteId ||
    requestedShiftDates.length === 0 ||
    orderedShiftBlocks.length === 0
  ) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Completa trabajador, fecha y horario.")}`,
    );
  }

  if (shiftId && requestedEmployeeIds.length !== 1) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("La edición solo admite un trabajador por turno.")}`,
    );
  }

  if (shiftId && requestedShiftDates.length !== 1) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("La edición solo admite un día por turno.")}`,
    );
  }

  if (shiftId && orderedShiftBlocks.length !== 1) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("La edición solo admite un bloque horario por turno.")}`,
    );
  }

  let selectedRoleRequirements: Pick<
    SiteOperationalRoleRow,
    "requires_external_checkin" | "requires_external_checkout"
  > | null = null;

  if (hasLaboralBlocks) {
    if (!operationalRole) {
      redirect(
        `${returnTo}&error=${encodeURIComponent("Selecciona un rol operativo de la matriz para este turno.")}`,
      );
    }

    const { data: matrixRowsData, error: matrixError } = await supabase
      .from("vento_site_operational_role_matrix_v1")
      .select(
        "site_id,area_id,area_name,area_kind,role_code,role_label,role_family,is_default,requires_external_checkin,requires_external_checkout,is_active",
      )
      .eq("site_id", siteId)
      .eq("is_active", true);

    if (matrixError) {
      redirect(`${returnTo}&error=${encodeURIComponent(matrixError.message)}`);
    }

    const matrixRows = (matrixRowsData ?? []) as SiteOperationalRoleRow[];
    if (areaId && !matrixRows.some((row) => row.area_id === areaId)) {
      redirect(
        `${returnTo}&error=${encodeURIComponent("El área seleccionada no pertenece a la matriz activa de esta sede.")}`,
      );
    }

    const applicableRows = getApplicableOperationalRoleRows(matrixRows, areaId);
    let selectedRoleRow =
      applicableRows.find((row) => row.role_code === operationalRole) ?? null;

    if (!selectedRoleRow && !areaId) {
      const uniqueRoleAreaRows = matrixRows.filter(
        (row) => row.role_code === operationalRole,
      );
      if (uniqueRoleAreaRows.length === 1) {
        selectedRoleRow = uniqueRoleAreaRows[0] ?? null;
        resolvedAreaId = selectedRoleRow?.area_id ?? null;
      }
    }

    if (!selectedRoleRow) {
      redirect(
        `${returnTo}&error=${encodeURIComponent("El rol operativo seleccionado no está permitido para la sede y área del turno.")}`,
      );
    }

    selectedRoleRequirements = selectedRoleRow;
  }

  const incompleteBlocks = orderedShiftBlocks.some(
    (block) => !block.shiftDate || !block.startTime || !block.endTime,
  );
  if (incompleteBlocks) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Completa día, inicio y fin de cada bloque horario.")}`,
    );
  }

  if (hasLaboralBlocks) {
    const invalidBlocks = laboralShiftBlocks.filter(
      (block) => block.endTime <= block.startTime,
    );
    if (invalidBlocks.length > 0) {
      redirect(
        `${returnTo}&error=${encodeURIComponent("La hora de fin debe ser posterior a la hora de inicio en todos los bloques.")}`,
      );
    }

    for (let i = 0; i < laboralShiftBlocks.length; i += 1) {
      for (let j = i + 1; j < laboralShiftBlocks.length; j += 1) {
        const first = laboralShiftBlocks[i];
        const second = laboralShiftBlocks[j];
        if (!first || !second) continue;
        if (
          first.shiftDate === second.shiftDate &&
          first.startTime < second.endTime &&
          second.startTime < first.endTime
        ) {
          redirect(
            `${returnTo}&error=${encodeURIComponent(
              `Los bloques del turno partido se solapan (${first.startTime.slice(0, 5)} - ${first.endTime.slice(0, 5)} y ${second.startTime.slice(0, 5)} - ${second.endTime.slice(0, 5)}).`,
            )}`,
          );
        }
      }
    }
  }

  const restShiftDateSet = new Set(requestedRestShiftDates);
  if (
    hasLaboralBlocks &&
    laboralShiftBlocks.some((block) => restShiftDateSet.has(block.shiftDate))
  ) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("No mezcles descanso de día completo con bloques laborales del mismo día para el mismo trabajador.")}`,
    );
  }

  if (requestedRestShiftDates.length > 0) {
    let restConflictQuery = supabase
      .from("employee_shifts")
      .select("id,employee_id,shift_date,start_time,end_time,shift_kind,status")
      .in("employee_id", requestedEmployeeIds)
      .in("shift_date", requestedRestShiftDates)
      .neq("status", "cancelled");
    if (shiftId) {
      restConflictQuery = restConflictQuery.neq("id", shiftId);
    }
    const { data: restConflicts, error: restConflictError } =
      await restConflictQuery;
    if (restConflictError) {
      redirect(
        `${returnTo}&error=${encodeURIComponent(restConflictError.message)}`,
      );
    }
    if ((restConflicts ?? []).length > 0) {
      redirect(
        `${returnTo}&error=${encodeURIComponent("Ese trabajador ya tiene turnos en uno de los días que estás marcando como descanso. Elimina o ajusta esos turnos primero.")}`,
      );
    }
  }

  // Validar solapamiento: mismo empleado, misma fecha, rangos que se cruzan
  if (hasLaboralBlocks) {
    let overlapQuery = supabase
      .from("employee_shifts")
      .select("id, employee_id, shift_date, start_time, end_time")
      .in("employee_id", requestedEmployeeIds)
      .in("shift_date", requestedLaboralShiftDates)
      .neq("shift_kind", "descanso");
    if (shiftId) {
      overlapQuery = overlapQuery.neq("id", shiftId);
    }
    const { data: sameDayShifts, error: overlapErr } = await overlapQuery;
    if (overlapErr) {
      redirect(`${returnTo}&error=${encodeURIComponent(overlapErr.message)}`);
    }
    const overlaps = (sameDayShifts ?? []).filter(
      (s: {
        employee_id: string;
        shift_date: string;
        start_time: string;
        end_time: string;
      }) =>
        laboralShiftBlocks.some(
          (block) =>
            block.shiftDate === s.shift_date &&
            block.startTime < s.end_time &&
            s.start_time < block.endTime,
        ),
    );
    if (overlaps.length > 0) {
      const conflictingIds = [
        ...new Set(overlaps.map((shift) => shift.employee_id)),
      ];
      const { data: conflictEmployees } = await supabase
        .from("employees")
        .select("id,full_name,alias")
        .in("id", conflictingIds);
      const conflictNames = new Map(
        (conflictEmployees ?? []).map((employee) => [
          employee.id,
          employee.full_name ?? employee.alias ?? employee.id,
        ]),
      );
      const summary = conflictingIds
        .map((id) => {
          const conflict = overlaps.find((shift) => shift.employee_id === id);
          if (!conflict) return conflictNames.get(id) ?? id;
          return `${conflictNames.get(id) ?? id} ${conflict.shift_date} (${conflict.start_time.slice(0, 5)} - ${conflict.end_time.slice(0, 5)})`;
        })
        .join(", ");
      redirect(
        `${returnTo}&error=${encodeURIComponent(
          `Algunos trabajadores ya tienen un turno que se solapa: ${summary}. Ajusta el horario o quítalos de la selección.`,
        )}`,
      );
    }
  }

  const closeBlockIndex =
    !hasLaboralBlocks || !showEndAsClose
      ? -1
      : orderedShiftBlocks.reduce(
          (lastIndex, block, index) =>
            block.shiftKind === "descanso" ? lastIndex : index,
          -1,
        );
  const operationalContextIndex = await loadShiftOperationalContextIndex(
    supabase,
    hasLaboralBlocks
      ? requestedEmployeeIds.map((id) => ({
          employeeId: id,
          siteId,
          operationalRole,
        }))
      : [],
  );

  if (hasLaboralBlocks && selectedRoleRequirements) {
    const missingExternalContext = requestedEmployeeIds.filter((id) => {
      const profileContext = getShiftOperationalContext(
        operationalContextIndex,
        id,
        siteId,
        operationalRole,
      );
      const checkinSiteId = resolveContextSiteId(
        explicitOperationalContext.checkinSiteId,
        profileContext?.checkinSiteId,
      );
      const checkoutSiteId = resolveContextSiteId(
        explicitOperationalContext.checkoutSiteId,
        profileContext?.checkoutSiteId,
      );

      return (
        (Boolean(selectedRoleRequirements?.requires_external_checkin) &&
          !checkinSiteId) ||
        (Boolean(selectedRoleRequirements?.requires_external_checkout) &&
          !checkoutSiteId)
      );
    });

    if (missingExternalContext.length > 0) {
      redirect(
        `${returnTo}&error=${encodeURIComponent("Este rol operativo exige punto físico de entrada y salida. Selecciona puntos de marcación o configura el perfil operativo del trabajador.")}`,
      );
    }
  }

  const buildShiftPayload = (
    id: string,
    block: (typeof orderedShiftBlocks)[number],
    index: number,
  ) => {
    const blockShiftKind = block.shiftKind;
    const isRestBlock = blockShiftKind === "descanso";
    return withShiftOperationalContext(
      {
        site_id: siteId,
        area_id: isRestBlock ? null : resolvedAreaId,
        shift_kind: blockShiftKind,
        operational_role: isRestBlock ? null : operationalRole,
        break_minutes: isRestBlock
          ? 0
          : Math.max(0, asNumber(formData.get("break_minutes"), 0)),
        status: asText(formData.get("status")) || "scheduled",
        notes: block.notes || shiftNotes || null,
        published_at: null,
        published_by: null,
        employee_id: id,
        shift_date: block.shiftDate,
        start_time: isRestBlock ? FULL_DAY_REST_START_TIME : block.startTime,
        end_time: isRestBlock ? FULL_DAY_REST_END_TIME : block.endTime,
        show_end_as_close: !isRestBlock && index === closeBlockIndex,
      },
      isRestBlock
        ? null
        : getShiftOperationalContext(
            operationalContextIndex,
            id,
            siteId,
            operationalRole,
          ),
      blockShiftKind,
      isRestBlock ? null : explicitOperationalContext,
    );
  };

  const insertPayload = requestedEmployeeIds.flatMap((id) =>
    orderedShiftBlocks.map((block, index) =>
      buildShiftPayload(id, block, index),
    ),
  );

  const updateBlock = firstShiftBlock;
  const query = shiftId
    ? supabase
        .from("employee_shifts")
        .update(buildShiftPayload(requestedEmployeeIds[0], updateBlock, 0))
        .eq("id", shiftId)
    : supabase.from("employee_shifts").insert(insertPayload);

  const { error } = await query;
  if (error) {
    redirect(`${returnTo}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
  const successCode = shiftId
    ? "turno_actualizado_borrador"
    : insertPayload.length > 1
      ? "turnos_creados_borrador"
      : "turno_creado_borrador";
  const nextReturnTo =
    !shiftId && keepQuick
      ? appendReturnParams(returnTo, {
          quick_keep: "1",
          quick_employee_id: requestedEmployeeIds[0] ?? null,
          quick_shift_date: primaryShiftDate,
          edit_shift: null,
        })
      : appendReturnParams(returnTo, {
          quick_keep: null,
          quick_employee_id: null,
          quick_shift_date: null,
          edit_shift: null,
        });
  redirect(`${nextReturnTo}&ok=${encodeURIComponent(successCode)}`);
}

async function deleteShiftAction(formData: FormData) {
  "use server";
  const shiftId = asText(formData.get("shift_id"));
  const returnTo = asText(formData.get("return_to")) || "/staff/schedule";

  await requireStaffScheduleAccess(returnTo);
  const supabase = createAdminClient();

  if (!shiftId) {
    redirect(`${returnTo}&error=${encodeURIComponent("Turno inválido.")}`);
  }

  const { error } = await supabase
    .from("employee_shifts")
    .delete()
    .eq("id", shiftId);
  if (error) {
    redirect(`${returnTo}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
  redirect(`${returnTo}&ok=${encodeURIComponent("turno_eliminado")}`);
}

async function deleteManyShiftAction(formData: FormData) {
  "use server";
  const shiftIds = formData
    .getAll("shift_ids")
    .map((value) => asText(value))
    .filter(Boolean);
  const returnTo = asText(formData.get("return_to")) || "/staff/schedule";

  await requireStaffScheduleAccess(returnTo);
  const supabase = createAdminClient();

  if (shiftIds.length === 0) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Selecciona al menos un turno para eliminar.")}`,
    );
  }

  const { error } = await supabase
    .from("employee_shifts")
    .delete()
    .in("id", shiftIds);
  if (error) {
    redirect(`${returnTo}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
  redirect(`${returnTo}&ok=${encodeURIComponent("turnos_eliminados")}`);
}

async function deleteDraftWeekAction(formData: FormData) {
  "use server";
  const siteId = asText(formData.get("site_id"));
  const weekStartIso = asText(formData.get("week_start"));
  const returnTo = asText(formData.get("return_to")) || "/staff/schedule";

  await requireStaffScheduleAccess(returnTo, siteId);
  const supabase = createAdminClient();

  if (!siteId || !weekStartIso) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Faltan datos para descartar los borradores.")}`,
    );
  }

  const weekStart = parseWeekStart(weekStartIso);
  const weekEndIso = isoDate(addDays(weekStart, 6));

  const { error } = await supabase
    .from("employee_shifts")
    .delete()
    .eq("site_id", siteId)
    .gte("shift_date", weekStartIso)
    .lte("shift_date", weekEndIso)
    .is("published_at", null);

  if (error) {
    redirect(`${returnTo}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
  redirect(`${returnTo}&ok=${encodeURIComponent("borradores_descartados")}`);
}

async function assignManyShiftAction(formData: FormData) {
  "use server";
  const sourceShiftIds = formData
    .getAll("shift_ids")
    .map((value) => asText(value))
    .filter(Boolean);
  const targetEmployeeIds = [
    ...new Set(
      formData
        .getAll("employee_ids")
        .map((value) => asText(value))
        .filter(Boolean),
    ),
  ];
  const returnTo = asText(formData.get("return_to")) || "/staff/schedule";

  await requireStaffScheduleAccess(returnTo);
  const supabase = createAdminClient();

  if (sourceShiftIds.length === 0 || targetEmployeeIds.length === 0) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Selecciona bloques y trabajadores para aplicar la edición masiva.")}`,
    );
  }

  const { data: sourceShifts, error: sourceError } = await supabase
    .from("employee_shifts")
    .select(
      "id,employee_id,shift_date,start_time,end_time,shift_kind,operational_role,show_end_as_close,break_minutes,status,notes,site_id,area_id,checkin_site_id,checkout_site_id,published_at",
    )
    .in("id", sourceShiftIds);

  if (sourceError) {
    redirect(`${returnTo}&error=${encodeURIComponent(sourceError.message)}`);
  }

  const shiftRows = (sourceShifts ?? []) as ShiftRow[];
  if (shiftRows.length === 0) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("No se encontraron los bloques seleccionados.")}`,
    );
  }

  const requestedRanges = shiftRows
    .filter((shift) => shift.shift_kind !== "descanso")
    .map((shift) => ({
      shift_date: shift.shift_date,
      start_time: shift.start_time,
      end_time: shift.end_time,
    }));
  const requestedDates = [
    ...new Set(requestedRanges.map((item) => item.shift_date)),
  ];

  const { data: existingShifts, error: existingError } =
    requestedRanges.length > 0
      ? await supabase
          .from("employee_shifts")
          .select("employee_id,shift_date,start_time,end_time")
          .neq("shift_kind", "descanso")
          .in("employee_id", targetEmployeeIds)
          .in("shift_date", requestedDates)
      : { data: [], error: null };

  if (existingError) {
    redirect(`${returnTo}&error=${encodeURIComponent(existingError.message)}`);
  }

  const overlaps = (existingShifts ?? []).filter((existing) =>
    requestedRanges.some(
      (range) =>
        range.shift_date === existing.shift_date &&
        range.start_time < existing.end_time &&
        existing.start_time < range.end_time,
    ),
  );

  if (overlaps.length > 0) {
    const conflictingIds = [
      ...new Set(overlaps.map((shift) => shift.employee_id)),
    ];
    const { data: conflictEmployees } = await supabase
      .from("employees")
      .select("id,full_name,alias")
      .in("id", conflictingIds);
    const conflictNames = new Map(
      (conflictEmployees ?? []).map((employee) => [
        employee.id,
        employee.full_name ?? employee.alias ?? employee.id,
      ]),
    );
    const summary = conflictingIds
      .map((id) => {
        const conflict = overlaps.find((shift) => shift.employee_id === id);
        if (!conflict) return conflictNames.get(id) ?? id;
        return `${conflictNames.get(id) ?? id} (${conflict.shift_date} ${conflict.start_time.slice(0, 5)} - ${conflict.end_time.slice(0, 5)})`;
      })
      .join(", ");
    redirect(
      `${returnTo}&error=${encodeURIComponent(
        `Algunos trabajadores destino ya tienen un turno que se solapa: ${summary}.`,
      )}`,
    );
  }

  const existingExact = new Set(
    (existingShifts ?? []).map(
      (shift) =>
        `${shift.employee_id}|${shift.shift_date}|${shift.start_time}|${shift.end_time}`,
    ),
  );

  const operationalContextIndex = await loadShiftOperationalContextIndex(
    supabase,
    targetEmployeeIds.flatMap((employeeId) =>
      shiftRows.map((shift) => ({
        employeeId,
        siteId: shift.site_id,
        operationalRole: shift.operational_role,
      })),
    ),
  );

  const payload = targetEmployeeIds.flatMap((employeeId) =>
    shiftRows
      .filter((shift) => shift.employee_id !== employeeId)
      .filter(
        (shift) =>
          !existingExact.has(
            `${employeeId}|${shift.shift_date}|${shift.start_time}|${shift.end_time}`,
          ),
      )
      .map((shift) => {
        const shiftKind = shift.shift_kind ?? "laboral";
        return withShiftOperationalContext(
          {
            employee_id: employeeId,
            site_id: shift.site_id,
            area_id: shift.area_id ?? null,
            shift_date: shift.shift_date,
            start_time: shift.start_time,
            end_time: shift.end_time,
            shift_kind: shiftKind,
            operational_role: shift.operational_role ?? null,
            show_end_as_close: shift.show_end_as_close ?? false,
            break_minutes: shift.break_minutes ?? 0,
            status: shift.status || "scheduled",
            notes: shift.notes ?? null,
            published_at: null,
            published_by: null,
          },
          getShiftOperationalContext(
            operationalContextIndex,
            employeeId,
            shift.site_id,
            shift.operational_role,
          ),
          shiftKind,
          {
            checkinSiteId: shift.checkin_site_id ?? null,
            checkoutSiteId: shift.checkout_site_id ?? null,
          },
        );
      }),
  );

  if (payload.length === 0) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("No hubo nuevos turnos por crear para los trabajadores seleccionados.")}`,
    );
  }

  const { error } = await supabase.from("employee_shifts").insert(payload);
  if (error) {
    redirect(`${returnTo}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
  redirect(`${returnTo}&ok=${encodeURIComponent("turnos_asignados_masivo")}`);
}

async function copyPreviousWeekAction(formData: FormData) {
  "use server";
  const siteId = asText(formData.get("site_id"));
  const weekStartIso = asText(formData.get("week_start"));
  const returnTo = asText(formData.get("return_to")) || "/staff/schedule";

  await requireStaffScheduleAccess(returnTo, siteId);
  const supabase = createAdminClient();

  if (!siteId || !weekStartIso) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Faltan datos para copiar la semana.")}`,
    );
  }

  const weekStart = parseWeekStart(weekStartIso);
  const prevStart = addDays(weekStart, -7);
  const prevEnd = addDays(prevStart, 6);

  const { data: previousRows, error: previousError } = await supabase
    .from("employee_shifts")
    .select(
      "employee_id,site_id,area_id,shift_date,start_time,end_time,shift_kind,operational_role,show_end_as_close,break_minutes,status,notes,checkin_site_id,checkout_site_id",
    )
    .eq("site_id", siteId)
    .gte("shift_date", isoDate(prevStart))
    .lte("shift_date", isoDate(prevEnd));

  if (previousError) {
    redirect(`${returnTo}&error=${encodeURIComponent(previousError.message)}`);
  }

  const rows = (previousRows ?? []) as Array<{
    employee_id: string;
    site_id: string;
    area_id?: string | null;
    shift_date: string;
    start_time: string;
    end_time: string;
    shift_kind?: string | null;
    operational_role?: string | null;
    show_end_as_close?: boolean | null;
    break_minutes: number | null;
    status: string;
    notes: string | null;
    checkin_site_id?: string | null;
    checkout_site_id?: string | null;
  }>;

  if (rows.length === 0) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("No hay turnos en la semana anterior para copiar.")}`,
    );
  }

  const operationalContextIndex = await loadShiftOperationalContextIndex(
    supabase,
    rows.map((row) => ({
      employeeId: row.employee_id,
      siteId: row.site_id,
      operationalRole: row.operational_role,
    })),
  );

  const nextRows = rows.map((row) => {
    const baseDate = new Date(`${row.shift_date}T12:00:00`);
    baseDate.setDate(baseDate.getDate() + 7);
    const shiftKind = row.shift_kind ?? "laboral";
    const profileContext = getShiftOperationalContext(
      operationalContextIndex,
      row.employee_id,
      row.site_id,
      row.operational_role,
    );

    return {
      ...row,
      shift_date: isoDate(baseDate),
      checkin_site_id:
        shiftKind === "descanso"
          ? null
          : (profileContext?.checkinSiteId ?? row.checkin_site_id ?? null),
      checkout_site_id:
        shiftKind === "descanso"
          ? null
          : (profileContext?.checkoutSiteId ?? row.checkout_site_id ?? null),
      published_at: null,
      published_by: null,
    };
  });

  const { error } = await supabase.from("employee_shifts").upsert(nextRows, {
    onConflict: "employee_id,site_id,shift_date,start_time",
  });

  if (error) {
    redirect(`${returnTo}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
  redirect(`${returnTo}&ok=${encodeURIComponent("semana_copiada_borrador")}`);
}

async function copyDayToOtherDaysAction(formData: FormData) {
  "use server";
  const sourceDayIso = asText(formData.get("source_day"));
  const employeeId = asText(formData.get("employee_id"));
  const siteId = asText(formData.get("site_id"));
  const returnTo = asText(formData.get("return_to")) || "/staff/schedule";
  const targetDaysRaw = formData.getAll("target_days");
  const targetDays = Array.from(targetDaysRaw)
    .filter(
      (v): v is string =>
        typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()),
    )
    .filter((iso) => iso !== sourceDayIso);

  await requireStaffScheduleAccess(returnTo, siteId);
  const supabase = createAdminClient();

  if (!siteId || !sourceDayIso || !employeeId || targetDays.length === 0) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Elige el día, la persona y al menos un día destino.")}`,
    );
  }

  const query = supabase
    .from("employee_shifts")
    .select(
      "employee_id,site_id,area_id,start_time,end_time,shift_kind,operational_role,show_end_as_close,break_minutes,status,notes,checkin_site_id,checkout_site_id",
    )
    .eq("site_id", siteId)
    .eq("shift_date", sourceDayIso)
    .eq("employee_id", employeeId);

  const { data: sourceShifts, error: fetchError } = await query;

  if (fetchError) {
    redirect(`${returnTo}&error=${encodeURIComponent(fetchError.message)}`);
  }

  const rows = (sourceShifts ?? []) as Array<{
    employee_id: string;
    site_id: string;
    area_id?: string | null;
    start_time: string;
    end_time: string;
    shift_kind?: string | null;
    operational_role?: string | null;
    show_end_as_close?: boolean | null;
    break_minutes: number | null;
    status: string;
    notes: string | null;
    checkin_site_id?: string | null;
    checkout_site_id?: string | null;
  }>;

  if (rows.length === 0) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Ese día no tiene turnos de esa persona para copiar.")}`,
    );
  }

  const operationalContextIndex = await loadShiftOperationalContextIndex(
    supabase,
    rows.map((row) => ({
      employeeId: row.employee_id,
      siteId: row.site_id,
      operationalRole: row.operational_role,
    })),
  );

  const toInsert = targetDays.flatMap((shiftDate) =>
    rows.map((row) => {
      const shiftKind = row.shift_kind ?? "laboral";
      const profileContext = getShiftOperationalContext(
        operationalContextIndex,
        row.employee_id,
        row.site_id,
        row.operational_role,
      );

      return {
        employee_id: row.employee_id,
        site_id: row.site_id,
        area_id: row.area_id ?? null,
        shift_date: shiftDate,
        start_time: row.start_time,
        end_time: row.end_time,
        shift_kind: shiftKind,
        operational_role: row.operational_role ?? null,
        show_end_as_close: row.show_end_as_close ?? false,
        break_minutes: row.break_minutes,
        status: row.status,
        notes: row.notes,
        checkin_site_id:
          shiftKind === "descanso"
            ? null
            : (profileContext?.checkinSiteId ?? row.checkin_site_id ?? null),
        checkout_site_id:
          shiftKind === "descanso"
            ? null
            : (profileContext?.checkoutSiteId ?? row.checkout_site_id ?? null),
        published_at: null,
        published_by: null,
      };
    }),
  );

  // Evitar solapamientos: por cada día destino, comprobar que ni los existentes ni los nuevos se crucen
  for (const shiftDate of targetDays) {
    const { data: existingRows } = await supabase
      .from("employee_shifts")
      .select("start_time, end_time")
      .eq("employee_id", employeeId)
      .eq("shift_date", shiftDate);
    const ranges = [
      ...((existingRows ?? []) as Array<{
        start_time: string;
        end_time: string;
      }>),
      ...rows.map((r) => ({ start_time: r.start_time, end_time: r.end_time })),
    ];
    for (let i = 0; i < ranges.length; i++) {
      for (let j = i + 1; j < ranges.length; j++) {
        const a = ranges[i];
        const b = ranges[j];
        if (a.start_time < b.end_time && b.start_time < a.end_time) {
          redirect(
            `${returnTo}&error=${encodeURIComponent(
              `El día ${shiftDate} quedaría con turnos solapados para esa persona (${a.start_time.slice(0, 5)}-${a.end_time.slice(0, 5)} y ${b.start_time.slice(0, 5)}-${b.end_time.slice(0, 5)}). Ajusta o elige otros días.`,
            )}`,
          );
        }
      }
    }
  }

  const { error } = await supabase.from("employee_shifts").insert(toInsert);
  if (error) {
    redirect(`${returnTo}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
  redirect(
    `${returnTo}&ok=${encodeURIComponent("Día aplicado a los días seleccionados.")}`,
  );
}

async function publishWeekAction(formData: FormData) {
  "use server";
  const siteId = asText(formData.get("site_id"));
  const weekStartIso = asText(formData.get("week_start"));
  const returnTo = asText(formData.get("return_to")) || "/staff/schedule";

  const { user } = await requireStaffScheduleAccess(returnTo, siteId);
  const supabase = createAdminClient();

  if (!siteId || !weekStartIso) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Faltan datos para publicar la semana.")}`,
    );
  }

  const weekStart = parseWeekStart(weekStartIso);
  const weekEndIso = isoDate(addDays(weekStart, 6));

  const { data: shifts, error: shiftsError } = await supabase
    .from("employee_shifts")
    .select("id, employee_id, shift_date, start_time, end_time, published_at")
    .eq("site_id", siteId)
    .gte("shift_date", weekStartIso)
    .lte("shift_date", weekEndIso);

  if (shiftsError) {
    redirect(`${returnTo}&error=${encodeURIComponent(shiftsError.message)}`);
  }

  const shiftRows = (shifts ?? []) as Array<{
    id: string;
    employee_id: string;
    shift_date: string;
    start_time: string;
    end_time: string;
    published_at: string | null;
  }>;
  const draftRows = shiftRows.filter((row) => !row.published_at);

  if (shiftRows.length === 0) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("No hay turnos en esta semana para publicar.")}`,
    );
  }
  if (draftRows.length === 0) {
    redirect(
      `${returnTo}&ok=${encodeURIComponent("sin_borradores_por_publicar")}`,
    );
  }

  const publishedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("employee_shifts")
    .update({
      published_at: publishedAt,
      published_by: user.id,
    })
    .eq("site_id", siteId)
    .gte("shift_date", weekStartIso)
    .lte("shift_date", weekEndIso)
    .is("published_at", null);

  if (updateError) {
    redirect(`${returnTo}&error=${encodeURIComponent(updateError.message)}`);
  }

  await notifyShiftChange({
    employeeIds: draftRows.map((row) => row.employee_id),
    title: "Tu horario semanal fue publicado",
    body: `Revisa tus turnos de la semana ${formatWeekLabel(weekStart)} en ANIMA.`,
    data: {
      siteId,
      weekStart: weekStartIso,
      action: "published_week",
      source: "viso_schedule_planner",
    },
  });

  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
  redirect(`${returnTo}&ok=${encodeURIComponent("semana_publicada")}`);
}

async function suggestDraftWeekAction(formData: FormData) {
  "use server";
  const siteId = asText(formData.get("site_id"));
  const weekStartIso = asText(formData.get("week_start"));
  const returnTo = asText(formData.get("return_to")) || "/staff/schedule";

  await requireStaffScheduleAccess(returnTo, siteId);
  const supabase = createAdminClient();

  if (!siteId || !weekStartIso) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Faltan datos para generar el borrador sugerido.")}`,
    );
  }

  const weekStart = parseWeekStart(weekStartIso);
  const weekEndIso = isoDate(addDays(weekStart, 6));
  const weekDays = buildWeekDays(weekStart);

  const [
    directEmployeesRes,
    linkedEmployeesRes,
    existingShiftsRes,
    staffingRequirementsRes,
    historicalShiftsRes,
    availabilityRes,
    planningLimitsRes,
    shiftPreferencesRes,
  ] = await Promise.all([
    supabase
      .from("employees")
      .select("id,full_name,alias,role,is_active,site_id")
      .eq("site_id", siteId)
      .eq("is_active", true)
      .order("full_name", { ascending: true }),
    supabase
      .from("employee_sites")
      .select(
        "employee_id,is_active,employee:employees(id,full_name,alias,role,is_active,site_id)",
      )
      .eq("site_id", siteId)
      .eq("is_active", true),
    supabase
      .from("employee_shifts")
      .select(
        "id,employee_id,shift_date,start_time,end_time,shift_kind,operational_role,show_end_as_close,break_minutes,status,notes,site_id,area_id,checkin_site_id,checkout_site_id,published_at",
      )
      .eq("site_id", siteId)
      .gte("shift_date", weekStartIso)
      .lte("shift_date", weekEndIso),
    supabase
      .schema("viso")
      .from("site_staffing_requirements")
      .select(
        "site_id,day_of_week,start_time,end_time,min_headcount,required_role_code",
      )
      .eq("site_id", siteId)
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true }),
    supabase
      .from("employee_shifts")
      .select(
        "employee_id,shift_date,start_time,end_time,operational_role,status,shift_kind,employees!employee_shifts_employee_id_fkey(role)",
      )
      .eq("site_id", siteId)
      .gte("shift_date", isoDate(addDays(weekStart, -180)))
      .lt("shift_date", weekStartIso)
      .neq("status", "cancelled")
      .order("shift_date", { ascending: false }),
    supabase
      .schema("viso")
      .from("employee_availability")
      .select(
        "employee_id,site_id,day_of_week,available_from,available_to,is_available,availability_kind",
      )
      .or(`site_id.is.null,site_id.eq.${siteId}`),
    supabase
      .schema("viso")
      .from("employee_planning_limits")
      .select("employee_id,target_weekly_minutes,max_weekly_minutes")
      .or(`site_id.is.null,site_id.eq.${siteId}`),
    supabase
      .schema("viso")
      .from("employee_shift_preferences")
      .select(
        "employee_id,prefers_morning,prefers_afternoon,prefers_evening,avoid_opening,avoid_closing",
      )
      .or(`site_id.is.null,site_id.eq.${siteId}`),
  ]);

  if (staffingRequirementsRes.error) {
    redirect(
      `${returnTo}&error=${encodeURIComponent(staffingRequirementsRes.error.message)}`,
    );
  }

  const staffingRequirements = (staffingRequirementsRes.data ??
    []) as StaffingRequirementRow[];
  const historicalShiftRows = (historicalShiftsRes.data ?? []) as Array<{
    employee_id: string | null;
    shift_date: string;
    start_time: string;
    end_time: string;
    operational_role: string | null;
    shift_kind: string | null;
    employees?: { role: string | null } | { role: string | null }[] | null;
  }>;

  const employeeMap = new Map<string, EmployeeRow>();
  for (const row of (directEmployeesRes.data ?? []) as EmployeeRow[]) {
    employeeMap.set(row.id, row);
  }
  for (const link of (linkedEmployeesRes.data ?? []) as EmployeeSiteLink[]) {
    const employee = getEmployeeRef(link.employee);
    if (employee?.id && employee.is_active) {
      employeeMap.set(employee.id, employee);
    }
  }
  const employees = [...employeeMap.values()];

  if (employees.length === 0) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("No hay trabajadores activos en esta sede para sugerir horarios.")}`,
    );
  }

  const existingShifts = ((existingShiftsRes.data ?? []) as ShiftRow[])
    .filter((shift) => shift.status !== "cancelled")
    .map<PlanningShiftDraft>((shift) => ({
      employeeId: shift.employee_id,
      siteId: shift.site_id,
      shiftDate: shift.shift_date,
      startTime: shift.start_time,
      endTime: shift.end_time,
      shiftKind: (shift.shift_kind ?? "laboral") as "laboral" | "descanso",
      notes: shift.notes,
    }));

  let requirements: PlanningRequirement[] = [];
  if (staffingRequirements.length > 0) {
    for (const day of weekDays) {
      const dayOfWeek = getDayOfWeek(day.iso);
      const dayRequirements = staffingRequirements.filter(
        (row) => row.day_of_week === dayOfWeek,
      );

      for (const row of dayRequirements) {
        const coveredCount = existingShifts.filter(
          (shift) =>
            shift.shiftDate === day.iso &&
            shift.startTime === row.start_time &&
            shift.endTime === row.end_time &&
            roleMatches(
              employeeMap.get(shift.employeeId)?.role ?? null,
              row.required_role_code,
            ),
        ).length;
        const missingHeadcount = Math.max(0, row.min_headcount - coveredCount);

        for (let index = 0; index < missingHeadcount; index += 1) {
          requirements.push({
            siteId,
            shiftDate: day.iso,
            startTime: row.start_time,
            endTime: row.end_time,
            requiredHeadcount: 1,
            roleCode: row.required_role_code,
          });
        }
      }
    }
  } else {
    const patternCounts = new Map<string, HistoricalShiftPatternRow>();
    for (const row of historicalShiftRows) {
      if (row.shift_kind === "descanso") continue;
      const employeeRef = Array.isArray(row.employees)
        ? row.employees[0]
        : row.employees;
      const role = row.operational_role ?? employeeRef?.role ?? null;
      const key = [
        getDayOfWeek(row.shift_date),
        row.start_time,
        row.end_time,
        role ?? "",
      ].join("|");
      const current = patternCounts.get(key) ?? {
        shift_date: row.shift_date,
        start_time: row.start_time,
        end_time: row.end_time,
        operational_role: row.operational_role,
        employee_role: employeeRef?.role ?? null,
        count: 0,
      };
      current.count += 1;
      patternCounts.set(key, current);
    }

    requirements = buildHistoricalRequirements(
      weekDays,
      [...patternCounts.values()].filter((row) => row.count >= 2),
      siteId,
    );
  }

  if (requirements.length === 0 && staffingRequirements.length === 0) {
    redirect(
      `${returnTo}&error=${encodeURIComponent(
        "No hay reglas ni suficiente historico repetido para sugerir un borrador en esta sede.",
      )}`,
    );
  }

  if (requirements.length === 0) {
    redirect(`${returnTo}&ok=${encodeURIComponent("sugerencia_no_necesaria")}`);
  }

  const availabilityRows = (availabilityRes.data ?? []) as AvailabilityRow[];
  const planningLimitsRows = (planningLimitsRes.data ?? []) as Array<{
    employee_id: string;
    target_weekly_minutes: number;
    max_weekly_minutes: number;
  }>;
  const shiftPreferenceRows = (shiftPreferencesRes.data ?? []) as Array<{
    employee_id: string;
    prefers_morning: boolean;
    prefers_afternoon: boolean;
    prefers_evening: boolean;
    avoid_opening: boolean;
    avoid_closing: boolean;
  }>;
  const planningLimitsByEmployee = new Map(
    planningLimitsRows.map((row) => [row.employee_id, row] as const),
  );
  const shiftPreferencesByEmployee = new Map(
    shiftPreferenceRows.map((row) => [row.employee_id, row] as const),
  );
  const historicalSignalsByEmployee = buildEmployeeHistoricalSignals(
    historicalShiftRows,
    weekStart,
  );
  const availability: PlanningAvailability[] = availabilityRows.flatMap((row) =>
    weekDays
      .filter((day) => row.day_of_week === getDayOfWeek(day.iso))
      .map((day) => ({
        employeeId: row.employee_id,
        siteId: row.site_id,
        shiftDate: day.iso,
        availableFrom: row.available_from,
        availableTo: row.available_to,
        isAvailable: row.is_available,
        availabilityKind: row.availability_kind,
      })),
  );

  const generationInput: PlanningGenerationInput = {
    siteId,
    weekStartIso,
    employees: employees.map((employee) => {
      const limits = planningLimitsByEmployee.get(employee.id);
      const preferences = shiftPreferencesByEmployee.get(employee.id);
      const historicalSignals =
        historicalSignalsByEmployee.get(employee.id) ??
        createEmptyHistoricalSignals();
      return {
        id: employee.id,
        fullName: employee.full_name ?? employee.alias ?? null,
        roleCode: employee.role ?? null,
        siteIds: [siteId],
        isActive: Boolean(employee.is_active ?? true),
        targetWeeklyMinutes: limits?.target_weekly_minutes ?? null,
        maxWeeklyMinutes: limits?.max_weekly_minutes ?? null,
        prefersMorning: preferences?.prefers_morning ?? false,
        prefersAfternoon: preferences?.prefers_afternoon ?? false,
        prefersEvening: preferences?.prefers_evening ?? false,
        avoidOpening: preferences?.avoid_opening ?? false,
        avoidClosing: preferences?.avoid_closing ?? false,
        recentMorningShifts: historicalSignals.recentMorningShifts,
        recentAfternoonShifts: historicalSignals.recentAfternoonShifts,
        recentEveningShifts: historicalSignals.recentEveningShifts,
        lastWeekMorningShifts: historicalSignals.lastWeekMorningShifts,
        lastWeekAfternoonShifts: historicalSignals.lastWeekAfternoonShifts,
        lastWeekEveningShifts: historicalSignals.lastWeekEveningShifts,
        recentOpeningShifts: historicalSignals.recentOpeningShifts,
        recentClosingShifts: historicalSignals.recentClosingShifts,
        recentWeekendShifts: historicalSignals.recentWeekendShifts,
      };
    }),
    requirements,
    availability,
    existingShifts,
  };

  const suggestion = generateWeeklySuggestion(generationInput);

  const { data: runRow, error: runError } = await supabase
    .schema("viso")
    .from("shift_generation_runs")
    .insert({
      site_id: siteId,
      week_start: weekStartIso,
      status: suggestion.shifts.length > 0 ? "completed" : "failed",
      strategy:
        staffingRequirements.length > 0 ? "heuristic_v1" : "historical_v1",
      input_snapshot: {
        requirementsCount: requirements.length,
        employeeCount: employees.length,
        existingShiftCount: existingShifts.length,
        source:
          staffingRequirements.length > 0
            ? "configured_requirements"
            : "historical_shift_patterns",
      },
      warnings: suggestion.warnings,
    })
    .select("id")
    .single();

  if (runError || !runRow) {
    redirect(
      `${returnTo}&error=${encodeURIComponent(runError?.message ?? "No se pudo registrar la corrida de sugerencia.")}`,
    );
  }

  const explanation = {
    score: suggestion.score,
    breakdown: suggestion.breakdown,
    historicalRotationWindowDays: 180,
    historicalSignalsByEmployee: Object.fromEntries(
      [...historicalSignalsByEmployee.entries()].map(
        ([employeeId, signals]) => [employeeId, signals],
      ),
    ),
  };

  const { data: candidateRow, error: candidateError } = await supabase
    .schema("viso")
    .from("shift_generation_candidates")
    .insert({
      run_id: runRow.id,
      rank_order: 1,
      score: suggestion.score,
      coverage_score: suggestion.breakdown.coverage,
      fairness_score: suggestion.breakdown.fairness,
      continuity_score: suggestion.breakdown.continuity,
      preference_score: suggestion.breakdown.preference,
      warnings: suggestion.warnings,
      explanation,
    })
    .select("id")
    .single();

  if (candidateError || !candidateRow) {
    redirect(
      `${returnTo}&error=${encodeURIComponent(candidateError?.message ?? "No se pudo registrar el candidato sugerido.")}`,
    );
  }

  if (suggestion.shifts.length > 0) {
    const candidateItems = suggestion.shifts.map((shift) => ({
      candidate_id: candidateRow.id,
      employee_id: shift.employeeId,
      site_id: shift.siteId,
      shift_date: shift.shiftDate,
      start_time: shift.startTime,
      end_time: shift.endTime,
      shift_kind: shift.shiftKind,
      notes: shift.notes ?? null,
      explanation: {
        requiredRoleCode: shift.requiredRoleCode ?? null,
        ...(shift.explanation ?? {}),
      },
    }));

    const { error: itemsError } = await supabase
      .schema("viso")
      .from("shift_generation_candidate_items")
      .insert(candidateItems);

    if (itemsError) {
      redirect(`${returnTo}&error=${encodeURIComponent(itemsError.message)}`);
    }

    const operationalContextIndex = await loadShiftOperationalContextIndex(
      supabase,
      suggestion.shifts.map((shift) => ({
        employeeId: shift.employeeId,
        siteId: shift.siteId,
        operationalRole: shift.requiredRoleCode,
      })),
    );

    const draftRows = suggestion.shifts.map((shift) => {
      const shiftKind = shift.shiftKind;
      const operationalRole =
        shiftKind === "descanso" ? null : (shift.requiredRoleCode ?? null);
      return withShiftOperationalContext(
        {
          employee_id: shift.employeeId,
          site_id: shift.siteId,
          area_id: null,
          shift_date: shift.shiftDate,
          start_time: shift.startTime,
          end_time: shift.endTime,
          shift_kind: shiftKind,
          operational_role: operationalRole,
          show_end_as_close: false,
          break_minutes: 0,
          status: "scheduled",
          notes: shift.notes ?? "Sugerido por VISO",
          published_at: null,
          published_by: null,
        },
        getShiftOperationalContext(
          operationalContextIndex,
          shift.employeeId,
          shift.siteId,
          operationalRole,
        ),
        shiftKind,
      );
    });

    const { error: insertDraftError } = await supabase
      .from("employee_shifts")
      .insert(draftRows);
    if (insertDraftError) {
      redirect(
        `${returnTo}&error=${encodeURIComponent(insertDraftError.message)}`,
      );
    }
  }

  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
  redirect(
    `${returnTo}&ok=${encodeURIComponent(
      suggestion.shifts.length > 0
        ? "sugerencia_generada_borrador"
        : "sugerencia_sin_resultado",
    )}`,
  );
}

async function saveCoverageRequirementAction(formData: FormData) {
  "use server";
  const siteId = asText(formData.get("site_id"));
  const weekStartIso = asText(formData.get("week_start"));
  const returnTo = asText(formData.get("return_to")) || "/staff/schedule";
  const dayOfWeek = asNumber(formData.get("day_of_week"), -1);
  const startTime = asText(formData.get("start_time"));
  const endTime = asText(formData.get("end_time"));
  const minHeadcount = asNumber(formData.get("min_headcount"), 0);
  const idealHeadcount = asNumber(
    formData.get("ideal_headcount"),
    minHeadcount,
  );
  const requiredRoleCode = asText(formData.get("required_role_code")) || null;

  await requireStaffScheduleAccess(returnTo, siteId);
  const supabase = createAdminClient();

  if (
    !siteId ||
    !weekStartIso ||
    dayOfWeek < 0 ||
    dayOfWeek > 6 ||
    !startTime ||
    !endTime
  ) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Completa día, franja y sede para guardar la cobertura.")}`,
    );
  }

  if (endTime <= startTime) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("La hora de fin debe ser posterior a la hora de inicio.")}`,
    );
  }

  if (minHeadcount < 1 || idealHeadcount < minHeadcount) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Define un mínimo válido y un ideal mayor o igual al mínimo.")}`,
    );
  }

  const { error } = await supabase
    .schema("viso")
    .from("site_staffing_requirements")
    .upsert({
      site_id: siteId,
      day_of_week: dayOfWeek,
      start_time: startTime,
      end_time: endTime,
      min_headcount: minHeadcount,
      ideal_headcount: idealHeadcount,
      required_role_code: requiredRoleCode,
    });

  if (error) {
    redirect(`${returnTo}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
  redirect(`${returnTo}&ok=${encodeURIComponent("cobertura_guardada")}`);
}

async function deleteCoverageRequirementAction(formData: FormData) {
  "use server";
  const id = asText(formData.get("id"));
  const returnTo = asText(formData.get("return_to")) || "/staff/schedule";

  await requireStaffScheduleAccess(returnTo);
  const supabase = createAdminClient();

  if (!id) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Regla de cobertura inválida.")}`,
    );
  }

  const { error } = await supabase
    .schema("viso")
    .from("site_staffing_requirements")
    .delete()
    .eq("id", id);

  if (error) {
    redirect(`${returnTo}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
  redirect(`${returnTo}&ok=${encodeURIComponent("cobertura_eliminada")}`);
}

async function saveAvailabilityAction(formData: FormData) {
  "use server";
  const siteId = asText(formData.get("site_id"));
  const weekStartIso = asText(formData.get("week_start"));
  const returnTo = asText(formData.get("return_to")) || "/staff/schedule";
  const employeeId = asText(formData.get("employee_id"));
  const dayOfWeek = asNumber(formData.get("day_of_week"), -1);
  const availableFrom = asText(formData.get("available_from"));
  const availableTo = asText(formData.get("available_to"));
  const availabilityKind = asText(formData.get("availability_kind")) as
    "preferred" | "allowed" | "blocked";

  await requireStaffScheduleAccess(returnTo, siteId);
  const supabase = createAdminClient();

  if (
    !siteId ||
    !weekStartIso ||
    !employeeId ||
    dayOfWeek < 0 ||
    dayOfWeek > 6 ||
    !availableFrom ||
    !availableTo
  ) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Completa trabajador, día y horario para guardar la disponibilidad.")}`,
    );
  }

  if (availableTo <= availableFrom) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("La hora final debe ser posterior a la inicial.")}`,
    );
  }

  if (!["preferred", "allowed", "blocked"].includes(availabilityKind)) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Tipo de disponibilidad inválido.")}`,
    );
  }

  const { error } = await supabase
    .schema("viso")
    .from("employee_availability")
    .insert({
      employee_id: employeeId,
      site_id: siteId,
      day_of_week: dayOfWeek,
      available_from: availableFrom,
      available_to: availableTo,
      is_available: availabilityKind !== "blocked",
      availability_kind: availabilityKind,
    });

  if (error) {
    redirect(`${returnTo}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
  redirect(`${returnTo}&ok=${encodeURIComponent("disponibilidad_guardada")}`);
}

async function deleteAvailabilityAction(formData: FormData) {
  "use server";
  const id = asText(formData.get("id"));
  const returnTo = asText(formData.get("return_to")) || "/staff/schedule";

  await requireStaffScheduleAccess(returnTo);
  const supabase = createAdminClient();

  if (!id) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Disponibilidad inválida.")}`,
    );
  }

  const { error } = await supabase
    .schema("viso")
    .from("employee_availability")
    .delete()
    .eq("id", id);

  if (error) {
    redirect(`${returnTo}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
  redirect(`${returnTo}&ok=${encodeURIComponent("disponibilidad_eliminada")}`);
}

async function saveWorkerRulesAction(formData: FormData) {
  "use server";
  const siteId = asText(formData.get("site_id"));
  const returnTo = asText(formData.get("return_to")) || "/staff/schedule";
  const employeeId = asText(formData.get("employee_id"));
  const targetWeeklyMinutes = asNumber(
    formData.get("target_weekly_minutes"),
    2400,
  );
  const maxWeeklyMinutes = asNumber(formData.get("max_weekly_minutes"), 2880);
  const prefersMorning = asText(formData.get("prefers_morning")) === "1";
  const prefersAfternoon = asText(formData.get("prefers_afternoon")) === "1";
  const prefersEvening = asText(formData.get("prefers_evening")) === "1";
  const avoidOpening = asText(formData.get("avoid_opening")) === "1";
  const avoidClosing = asText(formData.get("avoid_closing")) === "1";

  await requireStaffScheduleAccess(returnTo, siteId);
  const supabase = createAdminClient();

  if (!siteId || !employeeId) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Selecciona un trabajador para guardar sus reglas.")}`,
    );
  }

  if (targetWeeklyMinutes < 0 || maxWeeklyMinutes < targetWeeklyMinutes) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("El máximo semanal debe ser mayor o igual al objetivo semanal.")}`,
    );
  }

  const { error: limitsError } = await supabase
    .schema("viso")
    .from("employee_planning_limits")
    .upsert({
      employee_id: employeeId,
      site_id: siteId,
      target_weekly_minutes: targetWeeklyMinutes,
      max_weekly_minutes: maxWeeklyMinutes,
    });

  if (limitsError) {
    redirect(`${returnTo}&error=${encodeURIComponent(limitsError.message)}`);
  }

  const { error: preferencesError } = await supabase
    .schema("viso")
    .from("employee_shift_preferences")
    .upsert({
      employee_id: employeeId,
      site_id: siteId,
      prefers_morning: prefersMorning,
      prefers_afternoon: prefersAfternoon,
      prefers_evening: prefersEvening,
      avoid_opening: avoidOpening,
      avoid_closing: avoidClosing,
    });

  if (preferencesError) {
    redirect(
      `${returnTo}&error=${encodeURIComponent(preferencesError.message)}`,
    );
  }

  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
  redirect(
    `${returnTo}&ok=${encodeURIComponent("reglas_trabajador_guardadas")}`,
  );
}

function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getOkMessage(code: string) {
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

export default async function StaffSchedulePage({
  searchParams,
}: {
  searchParams?: Promise<{
    site_id?: string;
    week?: string;
    view?: string;
    edit_shift?: string;
    ok?: string;
    error?: string;
    quick_keep?: string;
    quick_employee_id?: string;
    quick_shift_date?: string;
  }>;
}) {
  const sp = (await searchParams) ?? {};
  const okMsg = getOkMessage(safeDecode(sp.ok));
  const errorMsg = safeDecode(sp.error);

  await requireStaffScheduleAccess("/staff/schedule", sp.site_id ?? null);
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
      ? String(sp.site_id)
      : (operationalSites[0]?.id ?? "");

  const weekStart = parseWeekStart(sp.week);
  const weekStartIso = isoDate(weekStart);
  const weekEndIso = isoDate(addDays(weekStart, 6));
  const viewMode = "table";
  const editShiftId = safeDecode(sp.edit_shift);
  const monthStartIso = isoDate(startOfMonth(weekStart));
  const monthEndIso = isoDate(endOfMonth(weekStart));
  const fortnightRange = getFortnightRange(weekStart);
  const fortnightStartIso = isoDate(fortnightRange.start);
  const fortnightEndIso = isoDate(fortnightRange.end);
  const returnTo = buildReturnTo(selectedSiteId, weekStartIso, viewMode);
  const returnToWithoutEdit = appendReturnParams(returnTo, {
    edit_shift: null,
  });

  const [
    directEmployeesRes,
    linkedEmployeesRes,
    shiftsRes,
    staffingRequirementsRes,
    availabilityConfigRes,
    planningLimitsRes,
    shiftPreferencesRes,
    siteOperationalRolesRes,
    employeeOperationalProfilesRes,
  ] = await Promise.all([
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
          .gte("shift_date", weekStartIso)
          .lte("shift_date", weekEndIso)
          .order("shift_date", { ascending: true })
          .order("start_time", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    selectedSiteId
      ? supabase
          .schema("viso")
          .from("site_staffing_requirements")
          .select(
            "id,site_id,day_of_week,start_time,end_time,min_headcount,ideal_headcount,max_headcount,required_role_code",
          )
          .eq("site_id", selectedSiteId)
          .order("day_of_week", { ascending: true })
          .order("start_time", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    selectedSiteId
      ? supabase
          .schema("viso")
          .from("employee_availability")
          .select(
            "id,employee_id,site_id,day_of_week,available_from,available_to,is_available,availability_kind",
          )
          .eq("site_id", selectedSiteId)
          .order("day_of_week", { ascending: true })
          .order("available_from", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    selectedSiteId
      ? supabase
          .schema("viso")
          .from("employee_planning_limits")
          .select("employee_id,target_weekly_minutes,max_weekly_minutes")
          .eq("site_id", selectedSiteId)
      : Promise.resolve({ data: [], error: null }),
    selectedSiteId
      ? supabase
          .schema("viso")
          .from("employee_shift_preferences")
          .select(
            "employee_id,prefers_morning,prefers_afternoon,prefers_evening,avoid_opening,avoid_closing",
          )
          .eq("site_id", selectedSiteId)
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
  for (const row of (directEmployeesRes.data ?? []) as EmployeeRow[]) {
    employeeMap.set(row.id, row);
  }
  for (const link of (linkedEmployeesRes.data ?? []) as EmployeeSiteLink[]) {
    const employee = getEmployeeRef(link.employee);
    if (employee?.id && employee.is_active) {
      employeeMap.set(employee.id, employee);
    }
  }

  const employees = [...employeeMap.values()].sort((a, b) =>
    (a.full_name ?? a.alias ?? a.id).localeCompare(
      b.full_name ?? b.alias ?? b.id,
      "es",
    ),
  );
  const configuredOperationalRoleRows = (siteOperationalRolesRes.data ??
    []) as SiteOperationalRoleRow[];
  const employeeOperationalProfiles = (employeeOperationalProfilesRes.data ??
    []) as EmployeeOperationalProfileRow[];
  const operationalProfilesByEmployee = new Map<
    string,
    EmployeeOperationalProfileRow[]
  >();

  for (const profile of employeeOperationalProfiles) {
    if (profile.site_id !== selectedSiteId) continue;

    const current =
      operationalProfilesByEmployee.get(profile.employee_id) ?? [];
    current.push(profile);
    operationalProfilesByEmployee.set(profile.employee_id, current);
  }

  const operationalAreaOptions: OperationalAreaOption[] = Array.from(
    configuredOperationalRoleRows
      .reduce((map, row) => {
        const id = cleanOptionalText(row.area_id);
        if (!id) return map;

        map.set(id, {
          id,
          label: cleanOptionalText(row.area_name) ?? "Área sin nombre",
          kind: cleanOptionalText(row.area_kind),
        });

        return map;
      }, new Map<string, OperationalAreaOption>())
      .values(),
  ).sort((a, b) => a.label.localeCompare(b.label, "es"));
  const operationalAreaLabelById = new Map(
    operationalAreaOptions.map((area) => [
      area.id,
      area.kind ? `${area.label} · ${area.kind}` : area.label,
    ]),
  );
  const siteLabelById = new Map(
    sites.map((site) => [site.id, site.name ?? site.code ?? site.id]),
  );

  const operationalRoleSelectOptions = configuredOperationalRoleRows.reduce<
    OperationalRoleOption[]
  >((options, row) => {
    const code = cleanOptionalText(row.role_code);
    if (!code) return options;

    const areaLabel = cleanOptionalText(row.area_name) ?? "General";

    options.push({
      code,
      label: `${cleanOptionalText(row.role_label) ?? humanizeRoleCode(row.role_code)} · ${areaLabel}`,
      areaId: cleanOptionalText(row.area_id),
      areaLabel,
      areaKind: cleanOptionalText(row.area_kind),
      isDefault: Boolean(row.is_default),
      requiresExternalCheckin: Boolean(row.requires_external_checkin),
      requiresExternalCheckout: Boolean(row.requires_external_checkout),
    });

    return options;
  }, []);

  const operationalRoleOptions: OperationalRoleOption[] = Array.from(
    configuredOperationalRoleRows
      .reduce((map, row) => {
        const code = String(row.role_code ?? "").trim();
        if (!code) return map;

        const current = map.get(code) ?? {
          code,
          label: String(row.role_label ?? row.role_code ?? "").trim(),
          isDefault: false,
          requiresExternalCheckin: false,
          requiresExternalCheckout: false,
          areaLabels: [] as string[],
        };

        const areaLabel =
          String(row.area_name ?? "General").trim() || "General";
        if (!current.areaLabels.includes(areaLabel)) {
          current.areaLabels.push(areaLabel);
        }

        current.isDefault = Boolean(current.isDefault || row.is_default);
        current.requiresExternalCheckin = Boolean(
          current.requiresExternalCheckin || row.requires_external_checkin,
        );
        current.requiresExternalCheckout = Boolean(
          current.requiresExternalCheckout || row.requires_external_checkout,
        );

        map.set(code, current);
        return map;
      }, new Map<string, OperationalRoleOption & { areaLabels: string[] }>())
      .values(),
  ).map((role) => {
    const areaSummary =
      role.areaLabels.length > 0 ? role.areaLabels.join(", ") : "General";
    return {
      code: role.code,
      label: `${role.label} · ${areaSummary}`,
      isDefault: role.isDefault,
      requiresExternalCheckin: role.requiresExternalCheckin,
      requiresExternalCheckout: role.requiresExternalCheckout,
    };
  });

  const getOperationalRoleOptionsForArea = (
    areaId: string | null | undefined,
  ) => {
    const normalizedAreaId = cleanOptionalText(areaId);
    const scopedOptions = operationalRoleSelectOptions.filter(
      (role) => cleanOptionalText(role.areaId) === normalizedAreaId,
    );

    if (scopedOptions.length > 0) return scopedOptions;
    if (normalizedAreaId) {
      return operationalRoleSelectOptions.filter(
        (role) => cleanOptionalText(role.areaId) === null,
      );
    }

    return scopedOptions;
  };

  const getSiteDefaultOperationalRoleForArea = (
    _areaId: string | null | undefined,
  ) => {
    return "";
  };

  const operationalRoleCodes = new Set(
    operationalRoleOptions.map((role) => role.code),
  );
  const siteDefaultOperationalRole = getSiteDefaultOperationalRoleForArea(null);
  const employeeIds = employees.map((employee) => employee.id);
  const staffingRequirements = (staffingRequirementsRes.data ??
    []) as StaffingRequirementRow[];
  const availabilityConfigRows = (availabilityConfigRes.data ??
    []) as (AvailabilityRow & { id: string })[];
  const planningLimitsRows = (planningLimitsRes.data ?? []) as Array<{
    employee_id: string;
    target_weekly_minutes: number;
    max_weekly_minutes: number;
  }>;
  const shiftPreferenceRows = (shiftPreferencesRes.data ?? []) as Array<{
    employee_id: string;
    prefers_morning: boolean;
    prefers_afternoon: boolean;
    prefers_evening: boolean;
    avoid_opening: boolean;
    avoid_closing: boolean;
  }>;

  const totalsByEmployee: Record<string, EmployeeTotals> = {};
  if (employeeIds.length > 0 && selectedSiteId) {
    const { data: monthShiftRows } = await supabase
      .from("employee_shifts")
      .select(
        "id,employee_id,shift_date,start_time,end_time,shift_kind,operational_role,show_end_as_close,break_minutes,status,notes,site_id,area_id,checkin_site_id,checkout_site_id",
      )
      .in("employee_id", employeeIds)
      .eq("site_id", selectedSiteId)
      .gte("shift_date", monthStartIso)
      .lte("shift_date", monthEndIso);

    for (const employeeId of employeeIds) {
      totalsByEmployee[employeeId] = {
        weekMinutes: 0,
        fortnightMinutes: 0,
        monthMinutes: 0,
      };
    }

    for (const shift of (monthShiftRows ?? []) as ShiftRow[]) {
      const totals = totalsByEmployee[shift.employee_id];
      if (!totals) continue;
      const minutes = getShiftMinutes(shift);
      totals.monthMinutes += minutes;
      if (shift.shift_date >= weekStartIso && shift.shift_date <= weekEndIso) {
        totals.weekMinutes += minutes;
      }
      if (
        shift.shift_date >= fortnightStartIso &&
        shift.shift_date <= fortnightEndIso
      ) {
        totals.fortnightMinutes += minutes;
      }
    }
  }

  const weekDays = buildWeekDays(weekStart);
  const weekShifts = (shiftsRes.data ?? []) as ShiftRow[];
  const draftWeekCount = weekShifts.filter(
    (shift) => !shift.published_at,
  ).length;
  const { data: attendancePolicyRow } = await supabase
    .from("attendance_policy")
    .select("late_tolerance_minutes")
    .limit(1)
    .maybeSingle();
  const lateToleranceMinutes = Math.max(
    0,
    Number(
      (attendancePolicyRow as { late_tolerance_minutes?: number } | null)
        ?.late_tolerance_minutes ?? 15,
    ),
  );

  const shiftAttendanceById = new Map<string, ShiftAttendanceInfo>();
  if (selectedSiteId && weekShifts.length > 0) {
    const employeeIdsSet = new Set(
      weekShifts.map((shift) => shift.employee_id),
    );
    const shiftIds = weekShifts.map((shift) => shift.id);
    const dayBuckets = new Map<string, ShiftAttendanceInfo>();
    const nextWeekStartIso = isoDate(addDays(weekStart, 7));
    const { data: attendanceLogsData } = await supabase
      .from("attendance_logs")
      .select("shift_id,employee_id,site_id,action,occurred_at")
      .eq("site_id", selectedSiteId)
      .in("employee_id", [...employeeIdsSet])
      .in("action", ["check_in", "check_out"])
      .gte("occurred_at", `${weekStartIso}T00:00:00-05:00`)
      .lt("occurred_at", `${nextWeekStartIso}T00:00:00-05:00`)
      .order("occurred_at", { ascending: true });

    const shiftIdsSet = new Set(shiftIds);
    for (const row of (attendanceLogsData ?? []) as AttendanceLogRow[]) {
      if (row.shift_id && shiftIdsSet.has(row.shift_id)) {
        const current = shiftAttendanceById.get(row.shift_id) ?? {
          checkInAt: null,
          checkOutAt: null,
        };
        if (
          row.action === "check_in" &&
          (!current.checkInAt || row.occurred_at < current.checkInAt)
        ) {
          current.checkInAt = row.occurred_at;
        }
        if (
          row.action === "check_out" &&
          (!current.checkOutAt || row.occurred_at > current.checkOutAt)
        ) {
          current.checkOutAt = row.occurred_at;
        }
        shiftAttendanceById.set(row.shift_id, current);
      }

      const occurred = getBogotaDateTimeParts(row.occurred_at);
      if (!occurred) continue;
      const dayKey = `${row.employee_id}__${row.site_id}__${occurred.dateIso}`;
      const dayInfo = dayBuckets.get(dayKey) ?? {
        checkInAt: null,
        checkOutAt: null,
      };
      if (
        row.action === "check_in" &&
        (!dayInfo.checkInAt || row.occurred_at < dayInfo.checkInAt)
      ) {
        dayInfo.checkInAt = row.occurred_at;
      }
      if (
        row.action === "check_out" &&
        (!dayInfo.checkOutAt || row.occurred_at > dayInfo.checkOutAt)
      ) {
        dayInfo.checkOutAt = row.occurred_at;
      }
      dayBuckets.set(dayKey, dayInfo);
    }

    for (const shift of weekShifts) {
      if (shiftAttendanceById.has(shift.id)) continue;
      const dayKey = `${shift.employee_id}__${shift.site_id}__${shift.shift_date}`;
      const dayInfo = dayBuckets.get(dayKey);
      if (dayInfo) shiftAttendanceById.set(shift.id, dayInfo);
    }
  }
  const nowBogota = getBogotaDateTimeParts(new Date()) ?? {
    dateIso: isoDate(new Date()),
    minutes: new Date().getHours() * 60 + new Date().getMinutes(),
  };
  const visibleStatusByShiftId: Record<string, string> = {};
  for (const shift of weekShifts) {
    visibleStatusByShiftId[shift.id] = getVisibleShiftStatus(
      shift,
      shiftAttendanceById.get(shift.id),
      nowBogota.dateIso,
      nowBogota.minutes,
      lateToleranceMinutes,
    );
  }
  const shiftsByEmployeeDay = new Map<string, ShiftRow[]>();
  for (const shift of weekShifts) {
    const key = `${shift.employee_id}__${shift.shift_date}`;
    const current = shiftsByEmployeeDay.get(key) ?? [];
    current.push(shift);
    shiftsByEmployeeDay.set(key, current);
  }
  for (const rows of shiftsByEmployeeDay.values()) {
    rows.sort((a, b) => a.start_time.localeCompare(b.start_time, "es"));
  }
  const selectedSite = sites.find((site) => site.id === selectedSiteId) ?? null;
  const prevWeekHref = buildReturnTo(
    selectedSiteId,
    isoDate(addDays(weekStart, -7)),
    viewMode,
  );
  const nextWeekHref = buildReturnTo(
    selectedSiteId,
    isoDate(addDays(weekStart, 7)),
    viewMode,
  );
  const currentWeekHref = buildReturnTo(
    selectedSiteId,
    isoDate(toMonday(new Date())),
    viewMode,
  );
  const quickEmployeeId = (() => {
    const candidate = safeDecode(sp.quick_employee_id);
    if (!candidate) return "";
    return employees.some((employee) => employee.id === candidate)
      ? candidate
      : "";
  })();
  const quickShiftDate = (() => {
    const candidate = safeDecode(sp.quick_shift_date);
    if (!candidate) return weekDays[0]?.iso ?? "";
    return weekDays.some((day) => day.iso === candidate)
      ? candidate
      : (weekDays[0]?.iso ?? "");
  })();
  const resolveDefaultOperationalRole = (
    targetEmployeeIds: string[],
    existingRole?: string | null,
    areaId?: string | null,
  ) => {
    const existingCode = String(existingRole ?? "").trim();
    if (existingCode && operationalRoleCodes.has(existingCode))
      return existingCode;

    const areaRoleCodes = new Set(
      getOperationalRoleOptionsForArea(areaId).map((role) => role.code),
    );

    const profileRoles = [
      ...new Set(
        targetEmployeeIds.flatMap((id) =>
          (operationalProfilesByEmployee.get(id) ?? [])
            .map((profile) => profile.default_operational_role)
            .filter((role): role is string =>
              Boolean(role && areaRoleCodes.has(role)),
            ),
        ),
      ),
    ];

    if (profileRoles.length === 1) return profileRoles[0] ?? "";

    const candidateRoles = [
      ...new Set(
        targetEmployeeIds
          .map((id) =>
            getOperationalRoleCandidateFromBaseRole(employeeMap.get(id)?.role),
          )
          .filter((role) => role && areaRoleCodes.has(role)),
      ),
    ];

    if (candidateRoles.length === 1) return candidateRoles[0] ?? "";
    return getSiteDefaultOperationalRoleForArea(areaId);
  };
  const quickShiftAreaId = "";
  const quickShiftOperationalRole = resolveDefaultOperationalRole(
    quickEmployeeId ? [quickEmployeeId] : [],
    null,
    quickShiftAreaId,
  );
  const selectedShift =
    editShiftId && viewMode === "table"
      ? (weekShifts.find((shift) => shift.id === editShiftId) ?? null)
      : null;
  const selectedShiftEmployee = selectedShift
    ? (employees.find(
        (employee) => employee.id === selectedShift.employee_id,
      ) ?? null)
    : null;
  const selectedShiftAreaId = selectedShift?.area_id ?? "";
  const selectedShiftOperationalRole = resolveDefaultOperationalRole(
    selectedShift ? [selectedShift.employee_id] : [],
    selectedShift?.operational_role,
    selectedShiftAreaId,
  );
  const scheduleOperationalAlerts = weekShifts
    .filter((shift) => shift.shift_kind !== "descanso")
    .flatMap((shift) => {
      const employee = employeeMap.get(shift.employee_id);
      const employeeLabel =
        employee?.full_name ?? employee?.alias ?? "Trabajador";
      const shiftLabel = `${employeeLabel} · ${shift.shift_date} · ${formatShiftRange(
        shift.start_time,
        shift.end_time,
        shift.show_end_as_close,
        shift.shift_kind,
      )}`;

      if (!shift.operational_role) {
        return [`${shiftLabel}: falta rol operativo.`];
      }

      const matrixRow =
        getApplicableOperationalRoleRows(
          configuredOperationalRoleRows,
          shift.area_id,
        ).find((row) => row.role_code === shift.operational_role) ?? null;

      if (!matrixRow) {
        return [`${shiftLabel}: rol fuera de la matriz activa para su área.`];
      }

      const missingPoints = [
        matrixRow.requires_external_checkin && !shift.checkin_site_id
          ? "check-in"
          : null,
        matrixRow.requires_external_checkout && !shift.checkout_site_id
          ? "check-out"
          : null,
      ].filter(Boolean);

      return missingPoints.length > 0
        ? [
            `${shiftLabel}: falta punto externo de ${missingPoints.join(" y ")}.`,
          ]
        : [];
    });
  const employeesGroupedByArea = (() => {
    const groups = new Map<string, EmployeeRow[]>();
    for (const employee of employees) {
      const areaLabel = getAreaVisualFromRole(employee.role).label;
      const current = groups.get(areaLabel) ?? [];
      current.push(employee);
      groups.set(areaLabel, current);
    }
    for (const rows of groups.values()) {
      rows.sort((a, b) =>
        (a.full_name ?? a.alias ?? a.id).localeCompare(
          b.full_name ?? b.alias ?? b.id,
          "es",
        ),
      );
    }
    return AREA_ORDER.map((label) => ({
      label,
      employees: groups.get(label) ?? [],
      visual: getAreaVisualFromRole(label),
    })).filter((group) => group.employees.length > 0);
  })();

  const scheduleTableColumns: ScheduleTableColumn[] = [
    { key: "area", label: "Área", width: 92, minWidth: 72 },
    { key: "worker", label: "Trabajador", width: 260, minWidth: 160 },
    { key: "role", label: "Rol", width: 160, minWidth: 110 },
    ...weekDays.map((day, index) => ({
      key: `day-${index}`,
      label: day.label,
      subLabel: day.shortLabel,
      width: 158,
      minWidth: 112,
    })),
    { key: "total", label: "Total semana", width: 128, minWidth: 104 },
  ];
  const scheduleTableInitialWidth = scheduleTableColumns.reduce(
    (total, column) => total + column.width,
    0,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Horario semanal"
        subtitle="Elige la semana, haz clic en un hueco del horario o en «Añadir turno» para asignar."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/staff" className="ui-btn ui-btn--ghost">
              Ver trabajadores
            </Link>
            <Link
              href="/staff/schedule/metrics"
              className="ui-btn ui-btn--ghost"
            >
              Métricas
            </Link>
            <Link
              href={appendReturnParams(
                buildReturnTo(selectedSiteId, weekStartIso),
                { view: null },
              ).replace("/staff/schedule", "/staff/schedule/settings")}
              className="ui-btn ui-btn--ghost"
            >
              Configuración de horarios
            </Link>
            <Link href="/staff/new" className="ui-btn ui-btn--ghost">
              Invitar trabajador
            </Link>
          </div>
        }
      />

      {errorMsg ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMsg}
        </div>
      ) : null}
      {okMsg ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {okMsg}
        </div>
      ) : null}
      {scheduleOperationalAlerts.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="font-semibold">Revisión operativa pendiente</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {scheduleOperationalAlerts.slice(0, 6).map((alert) => (
              <li key={alert}>{alert}</li>
            ))}
          </ul>
          {scheduleOperationalAlerts.length > 6 ? (
            <p className="mt-2 text-xs font-medium">
              Hay {scheduleOperationalAlerts.length - 6} alertas adicionales en
              esta semana.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="ui-panel space-y-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(320px,1fr)_minmax(280px,360px)]">
          <div>
            <div className="ui-caption">Sede actual</div>
            <div className="mt-1 text-lg font-semibold text-[var(--ui-text)]">
              {selectedSite?.name ?? selectedSite?.code ?? "Sin sede"}
            </div>
            {selectedSiteId ? (
              <p className="mt-1 text-sm text-[var(--ui-muted)]">
                Solo se muestran trabajadores y turnos de esta sede. Cambia la
                sede abajo si necesitas otra.
              </p>
            ) : null}
          </div>

          <form method="get" className="space-y-2">
            <label className="ui-label">Cambiar sede</label>
            <div className="flex gap-2">
              <select
                name="site_id"
                className="ui-input"
                defaultValue={selectedSiteId}
              >
                {operationalSites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name ?? site.code ?? site.id}
                  </option>
                ))}
              </select>
              <input type="hidden" name="week" value={weekStartIso} />
              <input type="hidden" name="view" value={viewMode} />
              <button type="submit" className="ui-btn ui-btn--ghost">
                Ir
              </button>
            </div>
          </form>

          <div className="flex flex-wrap items-center gap-2 xl:col-span-2">
            <div className="mr-1 flex items-center gap-1 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1">
              <Link
                href={buildReturnTo(selectedSiteId, weekStartIso, "table")}
                className="rounded-lg bg-[var(--ui-brand)] px-3 py-1.5 text-xs font-semibold text-white transition"
              >
                Tabla semanal
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-2 xl:ml-auto">
              <div className="flex items-center rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1">
                <Link
                  href={prevWeekHref}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-lg font-semibold text-[var(--ui-muted)] transition hover:bg-[var(--ui-surface-2)]"
                  aria-label="Semana anterior"
                >
                  ‹
                </Link>
                <div className="min-w-[220px] px-2 text-center text-sm font-semibold text-[var(--ui-text)]">
                  {formatWeekLabel(weekStart)}
                </div>
                <Link
                  href={nextWeekHref}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-lg font-semibold text-[var(--ui-muted)] transition hover:bg-[var(--ui-surface-2)]"
                  aria-label="Semana siguiente"
                >
                  ›
                </Link>
              </div>
              <Link
                href={currentWeekHref}
                className="ui-btn ui-btn--ghost whitespace-nowrap"
              >
                Hoy
              </Link>
              {draftWeekCount > 0 ? (
                <form action={deleteDraftWeekAction}>
                  <input type="hidden" name="site_id" value={selectedSiteId} />
                  <input type="hidden" name="week_start" value={weekStartIso} />
                  <input type="hidden" name="return_to" value={returnTo} />
                  <button
                    type="submit"
                    className="ui-btn ui-btn--ghost whitespace-nowrap text-[var(--ui-danger)]"
                  >
                    Descartar borradores
                  </button>
                </form>
              ) : null}
              <form action={suggestDraftWeekAction}>
                <input type="hidden" name="site_id" value={selectedSiteId} />
                <input type="hidden" name="week_start" value={weekStartIso} />
                <input type="hidden" name="return_to" value={returnTo} />
                <button
                  type="submit"
                  className="ui-btn ui-btn--ghost whitespace-nowrap"
                >
                  Sugerir horarios
                </button>
              </form>
              <form action={copyPreviousWeekAction}>
                <input type="hidden" name="site_id" value={selectedSiteId} />
                <input type="hidden" name="week_start" value={weekStartIso} />
                <input type="hidden" name="return_to" value={returnTo} />
                <button
                  type="submit"
                  className="ui-btn ui-btn--ghost whitespace-nowrap"
                >
                  Copiar semana anterior
                </button>
              </form>
              <form action={publishWeekAction}>
                <input type="hidden" name="site_id" value={selectedSiteId} />
                <input type="hidden" name="week_start" value={weekStartIso} />
                <input type="hidden" name="return_to" value={returnTo} />
                <button type="submit" className="ui-btn ui-btn--brand">
                  Publicar semana
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {!selectedSiteId ? (
        <div className="ui-panel">
          <div className="ui-empty">
            No hay sedes disponibles para planificar.
          </div>
        </div>
      ) : employees.length === 0 ? (
        <div className="ui-panel">
          <div className="ui-empty">
            <p className="font-semibold text-[var(--ui-text)]">
              No hay trabajadores en{" "}
              {selectedSite?.name ?? selectedSite?.code ?? "esta sede"}.
            </p>
            <p className="mt-2 text-sm text-[var(--ui-muted)]">
              Ve a &quot;Ver trabajadores&quot; o &quot;Invitar trabajador&quot;
              para asignar gente a la sede y luego planificar turnos aquí.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Link
              href={appendReturnParams(
                buildReturnTo(selectedSiteId, weekStartIso),
                { view: null },
              ).replace("/staff/schedule", "/staff/schedule/settings")}
              className="text-sm text-[var(--ui-muted)] underline-offset-4 transition hover:text-[var(--ui-text)] hover:underline"
            >
              Configurar cobertura, disponibilidad y reglas del planificador
            </Link>
          </div>
          {viewMode === "table" ? (
            <div className="space-y-3" data-schedule-table-shell>
              {selectedShift ? (
                <div className="ui-panel">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="ui-h3">Editar turno seleccionado</div>
                      <p className="text-xs text-[var(--ui-muted)]">
                        {selectedShiftEmployee?.full_name ??
                          selectedShiftEmployee?.alias ??
                          selectedShift.employee_id}{" "}
                        · {selectedShift.shift_date} ·{" "}
                        {formatShiftRange(
                          selectedShift.start_time,
                          selectedShift.end_time,
                          selectedShift.show_end_as_close,
                          selectedShift.shift_kind,
                        )}
                      </p>
                    </div>
                    <Link
                      href={returnToWithoutEdit}
                      className="ui-btn ui-btn--ghost ui-btn--sm"
                    >
                      Cerrar edición
                    </Link>
                  </div>
                  <form
                    action={saveShiftAction}
                    className="grid gap-3 md:grid-cols-8"
                    data-operational-context-form
                  >
                    <input
                      type="hidden"
                      name="shift_id"
                      value={selectedShift.id}
                    />
                    <input
                      type="hidden"
                      name="site_id"
                      value={selectedSiteId}
                    />
                    <input
                      type="hidden"
                      name="return_to"
                      value={returnToWithoutEdit}
                    />

                    <label className="flex flex-col gap-1 md:col-span-2">
                      <span className="ui-label">Trabajador</span>
                      <select
                        name="employee_id"
                        className="ui-input"
                        required
                        defaultValue={selectedShift.employee_id}
                      >
                        {employees.map((employee) => (
                          <option
                            key={employee.id}
                            value={employee.id}
                            data-operational-role={getOperationalRoleCandidateFromBaseRole(
                              employee.role,
                            )}
                          >
                            {employee.full_name ??
                              employee.alias ??
                              employee.id}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-1 md:col-span-2">
                      <span className="ui-label">Área del turno</span>
                      <select
                        name="area_id"
                        className="ui-input"
                        defaultValue={selectedShiftAreaId}
                        data-operational-area-select
                      >
                        <option value="">General / sin área</option>
                        {operationalAreaOptions.map((area) => (
                          <option key={area.id} value={area.id}>
                            {area.label}
                            {area.kind ? ` · ${area.kind}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-1 md:col-span-2">
                      <span className="ui-label">Rol operativo del turno</span>
                      <select
                        name="operational_role"
                        className="ui-input"
                        defaultValue={selectedShiftOperationalRole}
                        data-operational-role-select
                        data-site-default-role={getSiteDefaultOperationalRoleForArea(
                          selectedShiftAreaId,
                        )}
                        data-preserve-initial-role="1"
                      >
                        <option value="">Seleccionar rol operativo</option>
                        {selectedShiftOperationalRole &&
                        !operationalRoleCodes.has(
                          selectedShiftOperationalRole,
                        ) ? (
                          <option
                            value={selectedShiftOperationalRole}
                            data-area-id={selectedShiftAreaId}
                          >
                            {getOperationalRoleLabel(
                              selectedShiftOperationalRole,
                              operationalRoleOptions,
                            )}
                          </option>
                        ) : null}
                        {operationalRoleSelectOptions.map((role) => (
                          <option
                            key={`${role.areaId ?? "general"}-${role.code}`}
                            value={role.code}
                            data-area-id={role.areaId ?? ""}
                            data-is-default={role.isDefault ? "1" : "0"}
                            data-requires-checkin={
                              role.requiresExternalCheckin ? "1" : "0"
                            }
                            data-requires-checkout={
                              role.requiresExternalCheckout ? "1" : "0"
                            }
                          >
                            {role.label}
                            {role.requiresExternalCheckin ||
                            role.requiresExternalCheckout
                              ? " · punto externo"
                              : ""}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label
                      className="flex flex-col gap-1 md:col-span-2"
                      data-external-checkin-row
                    >
                      <span className="ui-label">Punto check-in</span>
                      <select
                        name="checkin_site_id"
                        className="ui-input"
                        defaultValue={selectedShift.checkin_site_id ?? ""}
                        data-external-checkin-select
                      >
                        <option value="">Usar perfil / sede</option>
                        {sites.map((site) => (
                          <option key={site.id} value={site.id}>
                            {site.name ?? site.code ?? site.id}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label
                      className="flex flex-col gap-1 md:col-span-2"
                      data-external-checkout-row
                    >
                      <span className="ui-label">Punto check-out</span>
                      <select
                        name="checkout_site_id"
                        className="ui-input"
                        defaultValue={selectedShift.checkout_site_id ?? ""}
                        data-external-checkout-select
                      >
                        <option value="">Usar perfil / sede</option>
                        {sites.map((site) => (
                          <option key={site.id} value={site.id}>
                            {site.name ?? site.code ?? site.id}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="ui-label">Día</span>
                      <input
                        name="shift_date"
                        type="date"
                        className="ui-input"
                        required
                        defaultValue={selectedShift.shift_date}
                        min={weekDays[0]?.iso ?? undefined}
                        max={weekDays[6]?.iso ?? undefined}
                      />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="ui-label">Inicio</span>
                      <input
                        name="start_time"
                        type="time"
                        className="ui-input"
                        required
                        defaultValue={selectedShift.start_time.slice(0, 5)}
                      />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="ui-label">Fin</span>
                      <input
                        name="end_time"
                        type="time"
                        className="ui-input"
                        required
                        defaultValue={selectedShift.end_time.slice(0, 5)}
                      />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="ui-label">Descanso (min)</span>
                      <input
                        name="break_minutes"
                        type="number"
                        min={0}
                        className="ui-input"
                        defaultValue={selectedShift.break_minutes ?? 0}
                      />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="ui-label">Estado</span>
                      <select
                        name="status"
                        className="ui-input"
                        defaultValue={selectedShift.status}
                      >
                        <option value="scheduled">Programado</option>
                        <option value="confirmed">Confirmado</option>
                        <option value="completed">Completado</option>
                        <option value="cancelled">Cancelado</option>
                        <option value="no_show">No asistió</option>
                      </select>
                    </label>

                    <label className="flex flex-col gap-1 md:col-span-6">
                      <span className="ui-label">Nota</span>
                      <input
                        name="notes"
                        className="ui-input"
                        defaultValue={selectedShift.notes ?? ""}
                      />
                    </label>

                    <label className="md:col-span-6 inline-flex items-center gap-2 text-sm text-[var(--ui-text)]">
                      <input
                        type="checkbox"
                        name="show_end_as_close"
                        value="1"
                        defaultChecked={Boolean(
                          selectedShift.show_end_as_close,
                        )}
                        className="rounded border-[var(--ui-border)]"
                      />
                      Mostrar la salida de este bloque como &quot;Cierre&quot;
                      al empleado
                    </label>

                    <label className="md:col-span-6 inline-flex items-center gap-2 text-sm text-[var(--ui-text)]">
                      <input
                        type="checkbox"
                        name="full_day_rest"
                        value="1"
                        defaultChecked={selectedShift.shift_kind === "descanso"}
                        className="rounded border-[var(--ui-border)]"
                      />
                      Marcar este día como descanso
                    </label>

                    <div className="flex items-end md:col-span-1">
                      <button
                        type="submit"
                        className="ui-btn ui-btn--brand w-full"
                      >
                        Guardar cambios
                      </button>
                    </div>
                  </form>
                </div>
              ) : null}

              <div className="ui-panel">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="ui-h3">Agregar turno por horas</div>
                    <p className="text-xs text-[var(--ui-muted)]">
                      Flujo rápido: eliges persona, día y uno o varios bloques
                      horarios. Cada bloque se guarda como una fila
                      independiente.
                    </p>
                  </div>
                </div>
                <form
                  action={saveShiftAction}
                  className="grid gap-3 md:grid-cols-6"
                  data-quick-shift-form
                  data-operational-context-form
                >
                  <input type="hidden" name="site_id" value={selectedSiteId} />
                  <input
                    type="hidden"
                    name="return_to"
                    value={returnToWithoutEdit}
                  />
                  <input type="hidden" name="break_minutes" value="0" />
                  <input type="hidden" name="status" value="scheduled" />
                  <input type="hidden" name="keep_quick" value="1" />

                  <label className="flex flex-col gap-1 md:col-span-2">
                    <span className="ui-label">Trabajador</span>
                    <select
                      name="employee_id"
                      className="ui-input"
                      required
                      defaultValue={quickEmployeeId}
                    >
                      <option value="" disabled>
                        Seleccionar
                      </option>
                      {employees.map((employee) => (
                        <option
                          key={employee.id}
                          value={employee.id}
                          data-operational-role={getOperationalRoleCandidateFromBaseRole(
                            employee.role,
                          )}
                        >
                          {employee.full_name ?? employee.alias ?? employee.id}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 md:col-span-2">
                    <span className="ui-label">Área del turno</span>
                    <select
                      name="area_id"
                      className="ui-input"
                      defaultValue={quickShiftAreaId}
                      data-operational-area-select
                    >
                      <option value="">General / sin área</option>
                      {operationalAreaOptions.map((area) => (
                        <option key={area.id} value={area.id}>
                          {area.label}
                          {area.kind ? ` · ${area.kind}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 md:col-span-2">
                    <span className="ui-label">Rol operativo</span>
                    <select
                      name="operational_role"
                      className="ui-input"
                      defaultValue={quickShiftOperationalRole}
                      data-operational-role-select
                      data-site-default-role={siteDefaultOperationalRole}
                    >
                      <option value="">Seleccionar rol operativo</option>
                      {operationalRoleSelectOptions.map((role) => (
                        <option
                          key={`${role.areaId ?? "general"}-${role.code}`}
                          value={role.code}
                          data-area-id={role.areaId ?? ""}
                          data-is-default={role.isDefault ? "1" : "0"}
                          data-requires-checkin={
                            role.requiresExternalCheckin ? "1" : "0"
                          }
                          data-requires-checkout={
                            role.requiresExternalCheckout ? "1" : "0"
                          }
                        >
                          {role.label}
                          {role.requiresExternalCheckin ||
                          role.requiresExternalCheckout
                            ? " · punto externo"
                            : ""}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label
                    className="flex flex-col gap-1 md:col-span-3"
                    data-external-checkin-row
                  >
                    <span className="ui-label">Punto check-in</span>
                    <select
                      name="checkin_site_id"
                      className="ui-input"
                      defaultValue=""
                      data-external-checkin-select
                    >
                      <option value="">Usar perfil / sede</option>
                      {sites.map((site) => (
                        <option key={site.id} value={site.id}>
                          {site.name ?? site.code ?? site.id}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label
                    className="flex flex-col gap-1 md:col-span-3"
                    data-external-checkout-row
                  >
                    <span className="ui-label">Punto check-out</span>
                    <select
                      name="checkout_site_id"
                      className="ui-input"
                      defaultValue=""
                      data-external-checkout-select
                    >
                      <option value="">Usar perfil / sede</option>
                      {sites.map((site) => (
                        <option key={site.id} value={site.id}>
                          {site.name ?? site.code ?? site.id}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label
                    className="flex flex-col gap-1"
                    data-quick-shift-time-control
                  >
                    <span className="ui-label">Día bloque 1</span>
                    <input
                      name="block_shift_date"
                      type="date"
                      className="ui-input"
                      required
                      defaultValue={quickShiftDate}
                      min={weekDays[0]?.iso ?? undefined}
                      max={weekDays[6]?.iso ?? undefined}
                    />
                  </label>

                  <label
                    className="flex flex-col gap-1"
                    data-quick-shift-time-control
                  >
                    <span className="ui-label">Inicio bloque 1</span>
                    <input
                      name="block_start_time"
                      type="time"
                      className="ui-input"
                      required
                      defaultValue="06:00"
                      data-quick-shift-time-input
                    />
                  </label>

                  <label
                    className="flex flex-col gap-1"
                    data-quick-shift-time-control
                  >
                    <span className="ui-label">Fin bloque 1</span>
                    <input
                      name="block_end_time"
                      type="time"
                      className="ui-input"
                      required
                      defaultValue="14:00"
                      data-quick-shift-time-input
                    />
                  </label>

                  <label className="flex flex-col gap-1 md:col-span-6">
                    <span className="ui-label">Nota bloque 1</span>
                    <input
                      name="block_notes"
                      className="ui-input"
                      placeholder="Ej. Cajero, apoyo barra, cierre"
                      maxLength={240}
                    />
                  </label>

                  <label className="md:col-span-6 inline-flex items-center gap-2 text-sm text-[var(--ui-text)]">
                    <input
                      type="checkbox"
                      name="block_rest_day"
                      value="0"
                      className="rounded border-[var(--ui-border)]"
                      data-block-rest-day-toggle
                    />
                    Marcar este día como descanso completo
                  </label>

                  <div className="contents" data-quick-shift-extra-blocks />

                  <div
                    className="flex flex-wrap items-center gap-2 md:col-span-6"
                    data-quick-shift-add-row
                  >
                    <button
                      type="button"
                      className="ui-btn ui-btn--ghost ui-btn--sm"
                      data-add-shift-block
                    >
                      + Agregar otro bloque o día
                    </button>
                    <span className="text-xs text-[var(--ui-muted)]">
                      Úsalo para cargar varios bloques o varios días del mismo
                      trabajador.
                    </span>
                  </div>

                  <label
                    className="md:col-span-6 inline-flex items-center gap-2 text-sm text-[var(--ui-text)]"
                    data-quick-shift-close-row
                  >
                    <input
                      type="checkbox"
                      name="show_end_as_close"
                      value="1"
                      className="rounded border-[var(--ui-border)]"
                      data-quick-shift-close-input
                    />
                    Mostrar la salida del último bloque como &quot;Cierre&quot;
                    al empleado
                  </label>

                  <div className="flex items-end">
                    <button
                      type="submit"
                      className="ui-btn ui-btn--brand w-full"
                    >
                      Guardar turno
                    </button>
                  </div>
                </form>
                <Script
                  id="viso-quick-shift-blocks"
                  strategy="afterInteractive"
                >
                  {`
                  (function () {
                    var draftKey = "viso:quick-shift-draft:" + window.location.pathname + ":" + (new URLSearchParams(window.location.search).get("site_id") || "site");

                    function clearBlock(block) {
                      block.querySelectorAll("input").forEach(function (input) {
                        input.value = "";
                      });
                    }

                    function getBlockCount(form) {
                      return 1 + form.querySelectorAll('[data-quick-shift-block="optional"]').length;
                    }

                    function createBlock(form) {
                      var index = getBlockCount(form) + 1;
                      var firstDateInput = form.querySelector('input[name="block_shift_date"]');
                      var minDate = firstDateInput ? firstDateInput.getAttribute("min") || "" : "";
                      var maxDate = firstDateInput ? firstDateInput.getAttribute("max") || "" : "";
                      var inheritedDate = firstDateInput ? firstDateInput.value || "" : "";
                      var block = document.createElement("div");
                      block.className = "rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3 md:col-span-6";
                      block.setAttribute("data-quick-shift-block", "optional");
                      block.innerHTML =
                        '<div class="mb-2 flex items-center justify-between gap-2">' +
                          '<div class="text-sm font-semibold text-[var(--ui-text)]">Bloque ' + index + '</div>' +
                          '<button type="button" class="text-xs font-semibold text-[var(--ui-danger)]" data-remove-shift-block>Quitar</button>' +
                        '</div>' +
                        '<div class="grid gap-3 md:grid-cols-3">' +
                          '<label class="flex flex-col gap-1">' +
                            '<span class="ui-label">Día bloque ' + index + '</span>' +
                            '<input name="block_shift_date" type="date" class="ui-input" value="' + inheritedDate + '" min="' + minDate + '" max="' + maxDate + '" />' +
                          '</label>' +
                          '<label class="flex flex-col gap-1">' +
                            '<span class="ui-label">Inicio bloque ' + index + '</span>' +
                            '<input name="block_start_time" type="time" class="ui-input" data-quick-shift-time-input />' +
                          '</label>' +
                          '<label class="flex flex-col gap-1">' +
                            '<span class="ui-label">Fin bloque ' + index + '</span>' +
                            '<input name="block_end_time" type="time" class="ui-input" data-quick-shift-time-input />' +
                          '</label>' +
                          '<label class="flex flex-col gap-1 md:col-span-3">' +
                            '<span class="ui-label">Nota bloque ' + index + '</span>' +
                            '<input name="block_notes" class="ui-input" placeholder="Opcional" maxLength="240" />' +
                          '</label>' +
                          '<label class="inline-flex items-center gap-2 text-sm text-[var(--ui-text)] md:col-span-3">' +
                            '<input type="checkbox" name="block_rest_day" value="' + (index - 1) + '" class="rounded border-[var(--ui-border)]" data-block-rest-day-toggle />' +
                            '<span>Marcar este día como descanso completo</span>' +
                          '</label>' +
                        '</div>';
                      return block;
                    }

                    function syncBlockRestIndexes(form) {
                      Array.from(form.querySelectorAll('[data-block-rest-day-toggle]')).forEach(function (input, index) {
                        input.value = String(index);
                      });
                    }

                    function getBlockRows(form) {
                      var dates = Array.from(form.querySelectorAll('input[name="block_shift_date"]'));
                      var starts = Array.from(form.querySelectorAll('input[name="block_start_time"]'));
                      var ends = Array.from(form.querySelectorAll('input[name="block_end_time"]'));
                      var notes = Array.from(form.querySelectorAll('input[name="block_notes"]'));
                      var restInputs = Array.from(form.querySelectorAll('[data-block-rest-day-toggle]'));
                      return dates.map(function (dateInput, index) {
                        return {
                          date: dateInput.value || "",
                          start: starts[index] ? starts[index].value || "" : "",
                          end: ends[index] ? ends[index].value || "" : "",
                          note: notes[index] ? notes[index].value || "" : "",
                          restDay: Boolean(restInputs[index] && restInputs[index].checked),
                        };
                      });
                    }

                    function writeRows(form, rows) {
                      if (!Array.isArray(rows) || rows.length === 0) return;
                      var container = form.querySelector("[data-quick-shift-extra-blocks]");
                      form.querySelectorAll('[data-quick-shift-block="optional"]').forEach(function (block) {
                        block.remove();
                      });
                      rows.slice(1).forEach(function () {
                        if (container) container.appendChild(createBlock(form));
                      });
                      var dates = Array.from(form.querySelectorAll('input[name="block_shift_date"]'));
                      var starts = Array.from(form.querySelectorAll('input[name="block_start_time"]'));
                      var ends = Array.from(form.querySelectorAll('input[name="block_end_time"]'));
                      var notes = Array.from(form.querySelectorAll('input[name="block_notes"]'));
                      var restInputs = Array.from(form.querySelectorAll('[data-block-rest-day-toggle]'));
                      rows.forEach(function (row, index) {
                        if (dates[index]) dates[index].value = row.date || "";
                        if (starts[index]) starts[index].value = row.start || "";
                        if (ends[index]) ends[index].value = row.end || "";
                        if (notes[index]) notes[index].value = row.note || "";
                        if (restInputs[index]) restInputs[index].checked = Boolean(row.restDay);
                      });
                      syncBlockRestIndexes(form);
                    }

                    function saveDraft(form) {
                      try {
                        var employee = form.querySelector('[name="employee_id"]');
                        var areaSelect = form.querySelector("[data-operational-area-select]");
                        var operationalRoleSelect = form.querySelector("[data-operational-role-select]");
                        var checkinSelect = form.querySelector("[data-external-checkin-select]");
                        var checkoutSelect = form.querySelector("[data-external-checkout-select]");
                        var closeInput = form.querySelector("[data-quick-shift-close-input]");
                        window.sessionStorage.setItem(draftKey, JSON.stringify({
                          employeeId: employee ? employee.value || "" : "",
                          areaId: areaSelect ? areaSelect.value || "" : "",
                          operationalRole: operationalRoleSelect ? operationalRoleSelect.value || "" : "",
                          checkinSiteId: checkinSelect ? checkinSelect.value || "" : "",
                          checkoutSiteId: checkoutSelect ? checkoutSelect.value || "" : "",
                          showEndAsClose: Boolean(closeInput && closeInput.checked),
                          rows: getBlockRows(form),
                        }));
                      } catch (error) {
                        // No bloquear el envío si el navegador no permite sessionStorage.
                      }
                    }

                    function restoreDraft(form) {
                      var params = new URLSearchParams(window.location.search);
                      if (params.has("ok")) {
                        try { window.sessionStorage.removeItem(draftKey); } catch (error) {}
                        return;
                      }
                      if (!params.has("error")) return;
                      try {
                        var raw = window.sessionStorage.getItem(draftKey);
                        if (!raw) return;
                        var draft = JSON.parse(raw);
                        if (!draft || typeof draft !== "object") return;
                        var employee = form.querySelector('[name="employee_id"]');
                        var areaSelect = form.querySelector("[data-operational-area-select]");
                        var operationalRoleSelect = form.querySelector("[data-operational-role-select]");
                        var checkinSelect = form.querySelector("[data-external-checkin-select]");
                        var checkoutSelect = form.querySelector("[data-external-checkout-select]");
                        var closeInput = form.querySelector("[data-quick-shift-close-input]");
                        if (employee && draft.employeeId) employee.value = draft.employeeId;
                        if (areaSelect && typeof draft.areaId === "string") areaSelect.value = draft.areaId;
                        if (checkinSelect && typeof draft.checkinSiteId === "string") checkinSelect.value = draft.checkinSiteId;
                        if (checkoutSelect && typeof draft.checkoutSiteId === "string") checkoutSelect.value = draft.checkoutSiteId;
                        if (operationalRoleSelect && typeof draft.operationalRole === "string") {
                          operationalRoleSelect.value = draft.operationalRole;
                          operationalRoleSelect.setAttribute("data-user-changed", "1");
                        }
                        if (closeInput) closeInput.checked = Boolean(draft.showEndAsClose);
                        writeRows(form, draft.rows);
                      } catch (error) {
                        try { window.sessionStorage.removeItem(draftKey); } catch (storageError) {}
                      }
                    }

                    function isRestDay(form) {
                      return false;
                    }

                    function setElementHidden(element, hidden) {
                      if (!element) return;
                      element.classList.toggle("hidden", hidden);
                      element.style.display = hidden ? "none" : "";
                    }

                    function getSelectedRoleOption(roleSelect) {
                      if (!roleSelect || roleSelect.selectedIndex < 0) return null;
                      return roleSelect.options[roleSelect.selectedIndex] || null;
                    }

                    function getActiveRoleOptions(form) {
                      var areaSelect = form.querySelector("[data-operational-area-select]");
                      var roleSelect = form.querySelector("[data-operational-role-select]");
                      if (!roleSelect) return [];

                      var areaId = areaSelect ? areaSelect.value || "" : "";
                      var options = Array.from(roleSelect.options).filter(function (option) {
                        return Boolean(option.value);
                      });
                      var scopedOptions = options.filter(function (option) {
                        return (option.getAttribute("data-area-id") || "") === areaId;
                      });
                      var activeOptions = scopedOptions.length > 0
                        ? scopedOptions
                        : areaId
                          ? options.filter(function (option) { return (option.getAttribute("data-area-id") || "") === ""; })
                          : scopedOptions;

                      options.forEach(function (option) {
                        var isActive = activeOptions.indexOf(option) >= 0;
                        option.disabled = !isActive;
                        option.hidden = !isActive;
                      });

                      var currentOption = getSelectedRoleOption(roleSelect);
                      if (currentOption && currentOption.value && activeOptions.indexOf(currentOption) < 0) {
                        roleSelect.value = "";
                      }

                      return activeOptions;
                    }

                    function selectRoleOption(roleSelect, activeOptions, value) {
                      if (!roleSelect || !value) return false;
                      var option = activeOptions.find(function (item) {
                        return item.value === value;
                      });
                      if (!option) return false;
                      roleSelect.selectedIndex = Array.from(roleSelect.options).indexOf(option);
                      return true;
                    }

                    function refreshExternalPointControls(form) {
                      var roleSelect = form.querySelector("[data-operational-role-select]");
                      var selectedOption = getSelectedRoleOption(roleSelect);
                      var requiresCheckin = Boolean(selectedOption && selectedOption.getAttribute("data-requires-checkin") === "1");
                      var requiresCheckout = Boolean(selectedOption && selectedOption.getAttribute("data-requires-checkout") === "1");

                      var checkinRow = form.querySelector("[data-external-checkin-row]");
                      var checkoutRow = form.querySelector("[data-external-checkout-row]");
                      var checkinSelect = form.querySelector("[data-external-checkin-select]");
                      var checkoutSelect = form.querySelector("[data-external-checkout-select]");

                      setElementHidden(checkinRow, !requiresCheckin);
                      setElementHidden(checkoutRow, !requiresCheckout);

                      if (checkinSelect) {
                        checkinSelect.disabled = !requiresCheckin;
                        if (!requiresCheckin) checkinSelect.value = "";
                      }
                      if (checkoutSelect) {
                        checkoutSelect.disabled = !requiresCheckout;
                        if (!requiresCheckout) checkoutSelect.value = "";
                      }
                    }

                    function syncDefaultOperationalRole(form, force) {
                      var employeeSelect = form.querySelector('select[name="employee_id"]');
                      var operationalRoleSelect = form.querySelector("[data-operational-role-select]");
                      if (!operationalRoleSelect) return;

                      var activeOptions = getActiveRoleOptions(form);
                      var selectedOption = getSelectedRoleOption(operationalRoleSelect);
                      var hasActiveSelection = selectedOption && selectedOption.value && activeOptions.indexOf(selectedOption) >= 0;

                      if (!force && operationalRoleSelect.getAttribute("data-user-changed") === "1" && hasActiveSelection) {
                        refreshExternalPointControls(form);
                        return;
                      }

                      var selectedEmployeeOption = employeeSelect && employeeSelect.selectedIndex >= 0
                        ? employeeSelect.options[employeeSelect.selectedIndex]
                        : null;
                      var employeeId = selectedEmployeeOption ? selectedEmployeeOption.value || "" : "";
                      var employeeRole = employeeId && selectedEmployeeOption ? selectedEmployeeOption.getAttribute("data-operational-role") || "" : "";

                      if (!employeeId) {
                        operationalRoleSelect.value = "";
                        operationalRoleSelect.removeAttribute("data-user-changed");
                        refreshExternalPointControls(form);
                        return;
                      }

                      if (!selectRoleOption(operationalRoleSelect, activeOptions, employeeRole)) {
                        if (!hasActiveSelection) {
                          operationalRoleSelect.value = "";
                        }
                      }

                      refreshExternalPointControls(form);
                    }

                    function initOperationalContextForm(form) {
                      if (!form || form.getAttribute("data-operational-context-ready") === "1") return;
                      form.setAttribute("data-operational-context-ready", "1");

                      var areaSelect = form.querySelector("[data-operational-area-select]");
                      var employeeSelect = form.querySelector('select[name="employee_id"]');
                      var operationalRoleSelect = form.querySelector("[data-operational-role-select]");

                      if (operationalRoleSelect && operationalRoleSelect.getAttribute("data-preserve-initial-role") === "1" && operationalRoleSelect.value) {
                        operationalRoleSelect.setAttribute("data-user-changed", "1");
                      }

                      if (areaSelect) {
                        areaSelect.addEventListener("change", function () {
                          if (operationalRoleSelect) operationalRoleSelect.removeAttribute("data-user-changed");
                          syncDefaultOperationalRole(form, true);
                        });
                      }
                      if (employeeSelect) {
                        employeeSelect.addEventListener("change", function () {
                          if (operationalRoleSelect) operationalRoleSelect.removeAttribute("data-user-changed");
                          syncDefaultOperationalRole(form, true);
                        });
                      }
                      if (operationalRoleSelect) {
                        operationalRoleSelect.addEventListener("change", function () {
                          operationalRoleSelect.setAttribute("data-user-changed", "1");
                          refreshExternalPointControls(form);
                        });
                      }

                      syncDefaultOperationalRole(form, false);
                    }

                    function refreshBlockControls(form) {
                      var addButton = form.querySelector("[data-add-shift-block]");

                      if (addButton) {
                        addButton.disabled = false;
                        addButton.setAttribute("aria-disabled", "false");
                      }

                      refreshExternalPointControls(form);
                    }

                    function initQuickShiftForm(form) {
                      if (!form || form.getAttribute("data-quick-shift-ready") === "1") return;
                      form.setAttribute("data-quick-shift-ready", "1");

                      form.addEventListener("change", function (event) {
                        var target = event.target;
                        if (target && target.matches && target.matches("[data-block-rest-day-toggle]")) {
                          refreshBlockControls(form);
                        }
                      });

                      initOperationalContextForm(form);

                      form.addEventListener("submit", function () {
                        syncBlockRestIndexes(form);
                        saveDraft(form);
                      });

                      restoreDraft(form);
                      syncDefaultOperationalRole(form, false);
                      refreshBlockControls(form);
                    }

                    function initAllQuickShiftForms() {
                      document.querySelectorAll("[data-operational-context-form]").forEach(initOperationalContextForm);
                      document.querySelectorAll("[data-quick-shift-form]").forEach(initQuickShiftForm);
                    }

                    if (!window.__visoQuickShiftDelegated) {
                      window.__visoQuickShiftDelegated = true;

                      document.addEventListener("click", function (event) {
                        var addButton = event.target && event.target.closest ? event.target.closest("[data-add-shift-block]") : null;
                        if (addButton) {
                          var form = addButton.closest("[data-quick-shift-form]");
                          if (!form) return;
                          var container = form.querySelector("[data-quick-shift-extra-blocks]");
                          if (!container) return;
                          container.appendChild(createBlock(form));
                          syncBlockRestIndexes(form);
                          refreshBlockControls(form);
                          return;
                        }

                        var removeButton = event.target && event.target.closest ? event.target.closest("[data-remove-shift-block]") : null;
                        if (!removeButton) return;
                        var block = removeButton.closest('[data-quick-shift-block="optional"]');
                        var quickForm = removeButton.closest("[data-quick-shift-form]");
                        if (!block || !quickForm) return;
                        block.remove();
                        syncBlockRestIndexes(quickForm);
                        refreshBlockControls(quickForm);
                      });
                    }

                    if (document.readyState === "loading") {
                      document.addEventListener("DOMContentLoaded", initAllQuickShiftForms, { once: true });
                    } else {
                      initAllQuickShiftForms();
                    }
                  })();
                `}
                </Script>
              </div>

              <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-[var(--ui-muted)]">
                    Ajusta la tabla: arrastra bordes de columnas, arrastra filas
                    desde la línea inferior del trabajador, usa clic derecho en
                    encabezados para ocultar columnas y cambia la densidad
                    visual.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-1 text-xs">
                      <button
                        type="button"
                        data-schedule-density="compact"
                        className="rounded-lg px-2.5 py-1 font-semibold text-[var(--ui-muted)] transition hover:bg-[var(--ui-surface)]"
                      >
                        Compacta
                      </button>
                      <button
                        type="button"
                        data-schedule-density="normal"
                        className="rounded-lg px-2.5 py-1 font-semibold text-[var(--ui-muted)] transition hover:bg-[var(--ui-surface)]"
                      >
                        Normal
                      </button>
                      <button
                        type="button"
                        data-schedule-density="comfortable"
                        className="rounded-lg px-2.5 py-1 font-semibold text-[var(--ui-muted)] transition hover:bg-[var(--ui-surface)]"
                      >
                        Cómoda
                      </button>
                    </div>
                    <button
                      type="button"
                      data-schedule-reset-layout
                      className="ui-btn ui-btn--ghost ui-btn--sm"
                    >
                      Restablecer tabla
                    </button>
                    <details className="relative" data-schedule-column-menu>
                      <summary className="ui-btn ui-btn--ghost ui-btn--sm cursor-pointer list-none">
                        Columnas
                      </summary>
                      <div className="absolute right-0 z-30 mt-2 w-72 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3 text-sm shadow-xl">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
                            Mostrar / ocultar
                          </span>
                          <span className="text-[11px] text-[var(--ui-muted)]">
                            1 mínimo visible
                          </span>
                        </div>
                        <div className="grid gap-1.5">
                          {scheduleTableColumns.map((column) => (
                            <label
                              key={column.key}
                              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[var(--ui-text)] transition hover:bg-[var(--ui-surface-2)]"
                            >
                              <input
                                type="checkbox"
                                data-schedule-column-toggle={column.key}
                                defaultChecked
                                className="rounded border-[var(--ui-border)]"
                              />
                              <span className="min-w-0 flex-1 truncate">
                                {column.subLabel
                                  ? `${column.label} · ${column.subLabel}`
                                  : column.label}
                              </span>
                            </label>
                          ))}
                        </div>
                        <p className="mt-2 text-[11px] leading-snug text-[var(--ui-muted)]">
                          También puedes ocultar una columna con clic derecho
                          sobre su encabezado.
                        </p>
                      </div>
                    </details>
                  </div>
                </div>
              </div>

              <div className="ui-panel p-0 overflow-hidden">
                <style>{`
                [data-schedule-table] {
                  --schedule-cell-y: 0.625rem;
                  --schedule-shift-y: 0.375rem;
                  table-layout: fixed;
                }
                [data-schedule-table][data-density="compact"] {
                  --schedule-cell-y: 0.375rem;
                  --schedule-shift-y: 0.25rem;
                }
                [data-schedule-table][data-density="comfortable"] {
                  --schedule-cell-y: 0.875rem;
                  --schedule-shift-y: 0.5rem;
                }
                [data-schedule-table] [data-schedule-cell] {
                  padding-top: var(--schedule-cell-y);
                  padding-bottom: var(--schedule-cell-y);
                  overflow-wrap: anywhere;
                  word-break: break-word;
                  white-space: normal;
                }
                [data-schedule-table] [data-schedule-shift-card] {
                  padding-top: var(--schedule-shift-y);
                  padding-bottom: var(--schedule-shift-y);
                  overflow-wrap: anywhere;
                  word-break: break-word;
                  white-space: normal;
                }
                [data-schedule-table] [data-schedule-resize-handle] {
                  position: absolute;
                  top: 0;
                  right: -4px;
                  z-index: 10;
                  height: 100%;
                  width: 8px;
                  cursor: col-resize;
                  border: 0;
                  background: transparent;
                  padding: 0;
                }
                [data-schedule-table] [data-schedule-resize-handle]::after {
                  content: "";
                  position: absolute;
                  top: 20%;
                  bottom: 20%;
                  left: 3px;
                  width: 2px;
                  border-radius: 999px;
                  background: transparent;
                  transition: background 120ms ease;
                }
                [data-schedule-table] th:hover [data-schedule-resize-handle]::after,
                [data-schedule-table] [data-schedule-resize-handle]:focus-visible::after {
                  background: var(--ui-brand);
                }
                [data-schedule-table] [data-schedule-row-resizer] {
                  position: absolute;
                  right: 0;
                  bottom: -3px;
                  left: 0;
                  z-index: 9;
                  height: 7px;
                  cursor: row-resize;
                  border: 0;
                  background: transparent;
                  padding: 0;
                }
                [data-schedule-table] [data-schedule-row-resizer]::after {
                  content: "";
                  position: absolute;
                  right: 10px;
                  bottom: 2px;
                  left: 10px;
                  height: 2px;
                  border-radius: 999px;
                  background: transparent;
                  transition: background 120ms ease;
                }
                [data-schedule-table] tr:hover [data-schedule-row-resizer]::after,
                [data-schedule-table] [data-schedule-row-resizer]:focus-visible::after {
                  background: var(--ui-brand);
                }
                [data-schedule-column-menu] > summary::-webkit-details-marker {
                  display: none;
                }
              `}</style>
                <div className="overflow-auto ui-scrollbar-subtle">
                  <table
                    className="w-full border-collapse text-sm"
                    data-schedule-table
                    data-storage-key={`viso:schedule-table:v2:${selectedSiteId || "global"}`}
                    style={{ minWidth: scheduleTableInitialWidth }}
                  >
                    <colgroup>
                      {scheduleTableColumns.map((column) => (
                        <col
                          key={column.key}
                          data-schedule-column={column.key}
                          data-default-width={column.width}
                          data-min-width={column.minWidth}
                          style={{ width: column.width }}
                        />
                      ))}
                    </colgroup>
                    <thead className="bg-[var(--ui-surface-2)] text-xs uppercase tracking-wide text-[var(--ui-muted)]">
                      <tr>
                        {scheduleTableColumns.map((column) => (
                          <th
                            key={column.key}
                            data-schedule-column={column.key}
                            data-schedule-cell
                            className="relative border-b border-r border-[var(--ui-border)] px-3 text-left last:border-r-0"
                            title="Arrastra el borde derecho para cambiar ancho. Clic derecho para ocultar columna."
                          >
                            <div className="min-w-0 pr-3">
                              <div className="truncate">{column.label}</div>
                              {column.subLabel ? (
                                <div className="mt-0.5 text-[11px] normal-case tracking-normal">
                                  {column.subLabel}
                                </div>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              data-schedule-resize-handle={column.key}
                              aria-label={`Cambiar ancho de columna ${column.label}`}
                            />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {employeesGroupedByArea.flatMap((group) => [
                        <tr
                          key={`area-${group.label}`}
                          className={group.visual.rowClass}
                        >
                          <td
                            colSpan={scheduleTableColumns.length}
                            data-schedule-area-row
                            data-schedule-cell
                            className="border-b border-t border-[var(--ui-border)] px-3 text-sm font-bold uppercase tracking-wide text-[var(--ui-text)]"
                          >
                            {group.label}
                          </td>
                        </tr>,
                        ...group.employees.map((employee) => {
                          const employeeName =
                            employee.full_name ?? employee.alias ?? employee.id;
                          const weekMinutes =
                            totalsByEmployee[employee.id]?.weekMinutes ?? 0;
                          const areaVisual = getAreaVisualFromRole(
                            employee.role,
                          );
                          return (
                            <tr
                              key={employee.id}
                              data-schedule-row={employee.id}
                              className={`align-top ${areaVisual.rowClass}`}
                            >
                              <td
                                data-schedule-column="area"
                                data-schedule-cell
                                className="border-b border-r border-[var(--ui-border)] px-3"
                              >
                                <span
                                  className={`inline-flex max-w-full rounded-full border px-2 py-0.5 text-[11px] font-semibold ${areaVisual.chipClass}`}
                                >
                                  {areaVisual.label}
                                </span>
                              </td>
                              <td
                                data-schedule-column="worker"
                                data-schedule-cell
                                className="relative border-b border-r border-[var(--ui-border)] px-3 font-semibold text-[var(--ui-text)]"
                              >
                                <div className="min-w-0 leading-snug">
                                  {employeeName}
                                </div>
                                <button
                                  type="button"
                                  data-schedule-row-resizer={employee.id}
                                  aria-label={`Cambiar alto de fila de ${employeeName}`}
                                />
                              </td>
                              <td
                                data-schedule-column="role"
                                data-schedule-cell
                                className="border-b border-r border-[var(--ui-border)] px-3 text-[var(--ui-muted)]"
                              >
                                {employee.role ?? "Sin rol"}
                              </td>
                              {weekDays.map((day, dayIndex) => {
                                const dayRows =
                                  shiftsByEmployeeDay.get(
                                    `${employee.id}__${day.iso}`,
                                  ) ?? [];
                                return (
                                  <td
                                    key={`${employee.id}-${day.iso}`}
                                    data-schedule-column={`day-${dayIndex}`}
                                    data-schedule-cell
                                    className="border-b border-r border-[var(--ui-border)] px-2.5 align-top"
                                  >
                                    {dayRows.length === 0 ? (
                                      <span className="text-xs text-[var(--ui-muted)]">
                                        —
                                      </span>
                                    ) : (
                                      <div className="flex flex-wrap items-stretch gap-1.5">
                                        {dayRows.map((shift) => {
                                          const shiftAreaLabel = shift.area_id
                                            ? (operationalAreaLabelById.get(
                                                shift.area_id,
                                              ) ?? "Área operativa")
                                            : "General";
                                          const checkinLabel =
                                            shift.checkin_site_id &&
                                            shift.checkin_site_id !==
                                              shift.site_id
                                              ? siteLabelById.get(
                                                  shift.checkin_site_id,
                                                )
                                              : null;
                                          const checkoutLabel =
                                            shift.checkout_site_id &&
                                            shift.checkout_site_id !==
                                              shift.site_id
                                              ? siteLabelById.get(
                                                  shift.checkout_site_id,
                                                )
                                              : null;
                                          const externalPointLabel =
                                            checkinLabel && checkoutLabel
                                              ? checkinLabel === checkoutLabel
                                                ? `Marcación: ${checkinLabel}`
                                                : `Entrada: ${checkinLabel} · Salida: ${checkoutLabel}`
                                              : checkinLabel
                                                ? `Entrada: ${checkinLabel}`
                                                : checkoutLabel
                                                  ? `Salida: ${checkoutLabel}`
                                                  : null;
                                          const roleLabel =
                                            shift.operational_role
                                              ? getOperationalRoleLabel(
                                                  shift.operational_role,
                                                  operationalRoleOptions,
                                                )
                                              : formatHoursCompact(
                                                  getShiftMinutes(shift),
                                                );
                                          const cardTitle = [
                                            shiftAreaLabel,
                                            roleLabel,
                                            externalPointLabel,
                                            shift.notes,
                                          ]
                                            .filter(Boolean)
                                            .join(" · ");

                                          return (
                                            <Link
                                              key={shift.id}
                                              href={appendReturnParams(
                                                returnTo,
                                                {
                                                  edit_shift: shift.id,
                                                },
                                              )}
                                              data-schedule-shift-card
                                              className={`flex min-w-[78px] flex-1 basis-[78px] flex-col rounded-lg border px-2 no-underline ${areaVisual.shiftClass} ${
                                                shift.published_at
                                                  ? "ring-1 ring-emerald-300/70"
                                                  : "ring-1 ring-amber-300/70"
                                              } ${selectedShift?.id === shift.id ? "ring-2 ring-inset ring-[var(--ui-brand)]" : ""}`}
                                              title={cardTitle}
                                            >
                                              <div className="text-xs font-semibold leading-snug text-[var(--ui-text)]">
                                                {formatShiftRange(
                                                  shift.start_time,
                                                  shift.end_time,
                                                  shift.show_end_as_close,
                                                  shift.shift_kind,
                                                )}
                                              </div>
                                              <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[11px] leading-tight text-[var(--ui-muted)]">
                                                {shift.shift_kind ===
                                                "descanso" ? (
                                                  <span>Día libre</span>
                                                ) : (
                                                  <>
                                                    <span>
                                                      {visibleStatusByShiftId[
                                                        shift.id
                                                      ] ?? "Programado"}
                                                    </span>
                                                    <span>{roleLabel}</span>
                                                  </>
                                                )}
                                              </div>
                                              {shift.shift_kind !==
                                              "descanso" ? (
                                                <div className="mt-0.5 truncate text-[10px] font-medium leading-tight text-[var(--ui-muted)]">
                                                  {shiftAreaLabel}
                                                </div>
                                              ) : null}
                                              {externalPointLabel ? (
                                                <div className="mt-0.5 truncate text-[10px] font-semibold leading-tight text-[var(--ui-brand)]">
                                                  {externalPointLabel}
                                                </div>
                                              ) : null}
                                            </Link>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                              <td
                                data-schedule-column="total"
                                data-schedule-cell
                                className="border-b border-[var(--ui-border)] px-3"
                              >
                                <span className="inline-flex max-w-full rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-2.5 py-1 text-xs font-semibold text-[var(--ui-text)]">
                                  {formatHoursCompact(weekMinutes)}
                                </span>
                              </td>
                            </tr>
                          );
                        }),
                      ])}
                    </tbody>
                  </table>
                </div>
                <Script
                  id="viso-schedule-table-tools"
                  strategy="afterInteractive"
                >
                  {`
                  (function () {
                    function readState(storageKey) {
                      try {
                        return JSON.parse(window.localStorage.getItem(storageKey) || "{}") || {};
                      } catch (error) {
                        return {};
                      }
                    }

                    function writeState(storageKey, state) {
                      try {
                        window.localStorage.setItem(storageKey, JSON.stringify(state));
                      } catch (error) {
                        // Ignore storage errors. The table remains usable in the current session.
                      }
                    }

                    function asNumber(value, fallback) {
                      var parsed = parseFloat(String(value || ""));
                      return Number.isFinite(parsed) ? parsed : fallback;
                    }

                    function initScheduleTable(table) {
                      if (!table || table.getAttribute("data-schedule-ready") === "1") return;
                      table.setAttribute("data-schedule-ready", "1");

                      var shell = table.closest("[data-schedule-table-shell]") || table.parentElement || document;
                      var storageKey = table.getAttribute("data-storage-key") || "viso:schedule-table:v2:global";
                      var state = readState(storageKey);

                      function getColumns() {
                        return Array.from(table.querySelectorAll("col[data-schedule-column]"));
                      }

                      function getColumnKeys() {
                        return getColumns()
                          .map(function (column) { return column.getAttribute("data-schedule-column"); })
                          .filter(Boolean);
                      }

                      function getHiddenColumns() {
                        return new Set(Array.isArray(state.hiddenColumns) ? state.hiddenColumns : []);
                      }

                      function save() {
                        writeState(storageKey, state);
                      }

                      function applyLayout() {
                        var hiddenColumns = getHiddenColumns();
                        var columnWidths = state.columnWidths && typeof state.columnWidths === "object"
                          ? state.columnWidths
                          : {};
                        var visibleCount = 0;
                        var totalWidth = 0;

                        getColumns().forEach(function (column) {
                          var key = column.getAttribute("data-schedule-column");
                          if (!key) return;
                          var fallbackWidth = asNumber(column.getAttribute("data-default-width"), 140);
                          var width = Math.max(
                            asNumber(column.getAttribute("data-min-width"), 80),
                            asNumber(columnWidths[key], fallbackWidth)
                          );
                          var isHidden = hiddenColumns.has(key);
                          column.style.width = isHidden ? "0px" : width + "px";
                          column.style.display = isHidden ? "none" : "";
                          if (!isHidden) {
                            visibleCount += 1;
                            totalWidth += width;
                          }
                        });

                        getColumnKeys().forEach(function (key) {
                          var isHidden = hiddenColumns.has(key);
                          table.querySelectorAll('[data-schedule-column="' + key + '"]').forEach(function (element) {
                            element.style.display = isHidden ? "none" : "";
                          });
                        });

                        table.querySelectorAll("[data-schedule-area-row]").forEach(function (cell) {
                          cell.colSpan = Math.max(1, visibleCount);
                        });

                        shell.querySelectorAll("[data-schedule-column-toggle]").forEach(function (input) {
                          var key = input.getAttribute("data-schedule-column-toggle");
                          if (!key) return;
                          input.checked = !hiddenColumns.has(key);
                          input.disabled = !hiddenColumns.has(key) && visibleCount <= 1;
                        });

                        table.style.minWidth = Math.max(totalWidth, 360) + "px";

                        var density = state.density === "compact" || state.density === "comfortable"
                          ? state.density
                          : "normal";
                        table.setAttribute("data-density", density);
                        shell.querySelectorAll("[data-schedule-density]").forEach(function (button) {
                          var isActive = button.getAttribute("data-schedule-density") === density;
                          button.setAttribute("aria-pressed", isActive ? "true" : "false");
                          button.classList.toggle("bg-[var(--ui-surface)]", isActive);
                          button.classList.toggle("text-[var(--ui-text)]", isActive);
                          button.classList.toggle("shadow-sm", isActive);
                        });

                        var rowHeights = state.rowHeights && typeof state.rowHeights === "object" ? state.rowHeights : {};
                        table.querySelectorAll("tr[data-schedule-row]").forEach(function (row) {
                          var rowKey = row.getAttribute("data-schedule-row");
                          var height = asNumber(rowHeights[rowKey], 0);
                          row.style.height = height > 0 ? height + "px" : "";
                        });
                      }

                      function setColumnHidden(key, hidden) {
                        if (!key) return;
                        var keys = getColumnKeys();
                        var hiddenColumns = getHiddenColumns();
                        if (hidden) {
                          if (keys.length - hiddenColumns.size <= 1) return;
                          hiddenColumns.add(key);
                        } else {
                          hiddenColumns.delete(key);
                        }
                        state.hiddenColumns = Array.from(hiddenColumns);
                        save();
                        applyLayout();
                      }

                      shell.querySelectorAll("[data-schedule-column-toggle]").forEach(function (input) {
                        input.addEventListener("change", function () {
                          var key = input.getAttribute("data-schedule-column-toggle");
                          setColumnHidden(key, !input.checked);
                        });
                      });

                      shell.querySelectorAll("[data-schedule-density]").forEach(function (button) {
                        button.addEventListener("click", function () {
                          state.density = button.getAttribute("data-schedule-density") || "normal";
                          save();
                          applyLayout();
                        });
                      });

                      shell.querySelectorAll("[data-schedule-reset-layout]").forEach(function (button) {
                        button.addEventListener("click", function () {
                          state = { density: "normal" };
                          save();
                          applyLayout();
                        });
                      });

                      shell.addEventListener("contextmenu", function (event) {
                        var target = event.target;
                        if (!target || typeof target.closest !== "function") return;
                        var header = target.closest("th[data-schedule-column]");
                        if (!header || !table.contains(header)) return;
                        var key = header.getAttribute("data-schedule-column");
                        if (!key) return;
                        event.preventDefault();
                        setColumnHidden(key, true);
                      });

                      shell.addEventListener("pointerdown", function (event) {
                        var target = event.target;
                        if (!target || typeof target.closest !== "function") return;
                        var handle = target.closest("[data-schedule-resize-handle]");
                        if (!handle || !shell.contains(handle)) return;

                        var columnKey = handle.getAttribute("data-schedule-resize-handle");
                        var column = table.querySelector('col[data-schedule-column="' + columnKey + '"]');
                        if (!column) return;
                        event.preventDefault();
                        event.stopPropagation();

                        var startX = event.clientX;
                        var minWidth = asNumber(column.getAttribute("data-min-width"), 80);
                        var fallbackWidth = asNumber(column.getAttribute("data-default-width"), 140);
                        var startWidth = asNumber(
                          state.columnWidths && state.columnWidths[columnKey],
                          asNumber(column.style.width, fallbackWidth)
                        );
                        document.body.style.cursor = "col-resize";
                        document.body.style.userSelect = "none";

                        function onMove(moveEvent) {
                          var nextWidth = Math.max(minWidth, Math.round(startWidth + moveEvent.clientX - startX));
                          state.columnWidths = state.columnWidths && typeof state.columnWidths === "object" ? state.columnWidths : {};
                          state.columnWidths[columnKey] = nextWidth;
                          save();
                          applyLayout();
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

                      shell.addEventListener("pointerdown", function (event) {
                        var target = event.target;
                        if (!target || typeof target.closest !== "function") return;
                        var handle = target.closest("[data-schedule-row-resizer]");
                        if (!handle || !shell.contains(handle)) return;

                        var rowKey = handle.getAttribute("data-schedule-row-resizer");
                        var row = table.querySelector('tr[data-schedule-row="' + rowKey + '"]');
                        if (!row) return;
                        event.preventDefault();
                        event.stopPropagation();

                        var startY = event.clientY;
                        var startHeight = row.getBoundingClientRect().height;
                        document.body.style.cursor = "row-resize";
                        document.body.style.userSelect = "none";

                        function onRowMove(moveEvent) {
                          var nextHeight = Math.max(46, Math.round(startHeight + moveEvent.clientY - startY));
                          state.rowHeights = state.rowHeights && typeof state.rowHeights === "object" ? state.rowHeights : {};
                          state.rowHeights[rowKey] = nextHeight;
                          save();
                          applyLayout();
                        }

                        function onRowUp() {
                          document.removeEventListener("pointermove", onRowMove);
                          document.removeEventListener("pointerup", onRowUp);
                          document.body.style.cursor = "";
                          document.body.style.userSelect = "";
                        }

                        document.addEventListener("pointermove", onRowMove);
                        document.addEventListener("pointerup", onRowUp, { once: true });
                      });

                      applyLayout();
                    }

                    function initAllScheduleTables() {
                      document.querySelectorAll("[data-schedule-table]").forEach(initScheduleTable);
                    }

                    if (document.readyState === "loading") {
                      document.addEventListener("DOMContentLoaded", initAllScheduleTables, { once: true });
                    } else {
                      initAllScheduleTables();
                    }
                  })();
                `}
                </Script>
              </div>
              <p className="text-xs text-[var(--ui-muted)]">
                Vista tabla para planear rápido equipos grandes con edición por
                trabajador, área y bloque.
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
