import Link from "next/link";
import Script from "next/script";

import { PageHeader } from "@/components/vento/standard/page-header";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

import {
  assignManyShiftAction,
  copyDayToOtherDaysAction,
  copyPreviousWeekAction,
  deleteAvailabilityAction,
  deleteCoverageRequirementAction,
  deleteDraftWeekAction,
  deleteManyShiftAction,
  deleteShiftAction,
  publishWeekAction,
  saveAvailabilityAction,
  saveCoverageRequirementAction,
  saveShiftAction,
  saveWorkerRulesAction,
  suggestDraftWeekAction,
} from "./actions";
import {
  addDays,
  addMinutesToPeriodTotals,
  appendReturnParams,
  AREA_ORDER,
  BOGOTA_TIME_ZONE,
  buildReturnTo,
  buildWeekDays,
  cleanOptionalText,
  createEmptyPeriodTotals,
  endOfMonth,
  formatHoursCompact,
  formatShiftRange,
  formatWeekLabel,
  getAreaVisualFromRole,
  getApplicableOperationalRoleRows,
  getBogotaDateTimeParts,
  getEmployeeRef,
  getFortnightRange,
  getOkMessage,
  getOperationalRoleCandidateFromBaseRole,
  getOperationalRoleLabel,
  getScheduleDayPart,
  getShiftMinutes,
  getVisibleShiftStatus,
  hasShiftEnded,
  humanizeRoleCode,
  isLateCheckIn,
  isOperationalSite,
  isShiftInProgress,
  isoDate,
  loadShiftOperationalContextIndex,
  normalizeRole,
  parseTimeToMinutes,
  parseWeekStart,
  requireStaffScheduleAccess,
  resolveContextSiteId,
  safeDecode,
  STAFF_SCHEDULE_PERMISSION,
  startOfMonth,
  toMonday,
  uniqueTextValues,
  withShiftOperationalContext,
  type AttendanceLogRow,
  type AvailabilityRow,
  type EmployeePeriodTotals,
  type EmployeeOperationalProfileRow,
  type EmployeeRow,
  type EmployeeSiteLink,
  type EmployeeTotals,
  type OperationalAreaOption,
  type OperationalRoleOption,
  type RoleConcurrencyLimitRow,
  type ScheduleTableColumn,
  type ShiftAttendanceInfo,
  type ShiftOperationalContext,
  type ShiftRow,
  type SiteOperationalRoleRow,
  type SiteRow,
  type StaffingRequirementRow,
} from "./helpers";
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
  const operationalSiteIds = operationalSites.map((site) => site.id);
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
  const totalsStartCandidates = [
    monthStartIso,
    fortnightStartIso,
    weekStartIso,
  ].sort();
  const totalsEndCandidates = [monthEndIso, fortnightEndIso, weekEndIso].sort();
  const totalsStartIso = totalsStartCandidates[0] ?? monthStartIso;
  const totalsEndIso =
    totalsEndCandidates[totalsEndCandidates.length - 1] ?? monthEndIso;

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
          .in("site_id", operationalSiteIds)
          .eq("is_active", true)
          .order("site_id", { ascending: true })
          .order("area_name", { ascending: true })
          .order("role_label", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    selectedSiteId
      ? supabase
          .from("employee_site_operational_profiles")
          .select(
            "employee_id,site_id,default_operational_role,default_checkin_site_id,default_checkout_site_id,is_active",
          )
          .in("site_id", operationalSiteIds)
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
  const employeeAllowedSiteIdsById = new Map<string, Set<string>>();
  for (const employee of employees) {
    employeeAllowedSiteIdsById.set(
      employee.id,
      new Set(employee.site_id ? [employee.site_id] : []),
    );
  }
  if (employees.length > 0 && operationalSiteIds.length > 0) {
    const { data: allEmployeeSiteLinks } = await supabase
      .from("employee_sites")
      .select("employee_id,site_id,is_active")
      .in(
        "employee_id",
        employees.map((employee) => employee.id),
      )
      .in("site_id", operationalSiteIds)
      .eq("is_active", true);

    for (const link of (allEmployeeSiteLinks ?? []) as Array<{
      employee_id: string;
      site_id: string;
      is_active: boolean | null;
    }>) {
      const siteSet =
        employeeAllowedSiteIdsById.get(link.employee_id) ?? new Set<string>();
      siteSet.add(link.site_id);
      employeeAllowedSiteIdsById.set(link.employee_id, siteSet);
    }
  }
  const configuredOperationalRoleRows = (siteOperationalRolesRes.data ??
    []) as SiteOperationalRoleRow[];
  const selectedSiteOperationalRoleRows = configuredOperationalRoleRows.filter(
    (row) => row.site_id === selectedSiteId,
  );
  const employeeOperationalProfiles = (employeeOperationalProfilesRes.data ??
    []) as EmployeeOperationalProfileRow[];
  const operationalProfilesByEmployee = new Map<
    string,
    EmployeeOperationalProfileRow[]
  >();

  for (const profile of employeeOperationalProfiles) {
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

        map.set(`${row.site_id}:${id}`, {
          id,
          label: cleanOptionalText(row.area_name) ?? "Área sin nombre",
          kind: cleanOptionalText(row.area_kind),
          siteId: row.site_id,
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
      siteId: row.site_id,
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
    selectedSiteOperationalRoleRows
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
    siteId: string | null | undefined = selectedSiteId,
  ) => {
    const normalizedAreaId = cleanOptionalText(areaId);
    const normalizedSiteId = cleanOptionalText(siteId);
    const siteOptions = operationalRoleSelectOptions.filter(
      (role) => cleanOptionalText(role.siteId) === normalizedSiteId,
    );
    const scopedOptions = operationalRoleSelectOptions.filter(
      (role) =>
        cleanOptionalText(role.siteId) === normalizedSiteId &&
        cleanOptionalText(role.areaId) === normalizedAreaId,
    );

    if (scopedOptions.length > 0) return scopedOptions;
    if (normalizedAreaId) {
      return siteOptions.filter(
        (role) => cleanOptionalText(role.areaId) === null,
      );
    }

    return siteOptions;
  };

  const getSiteDefaultOperationalRoleForArea = (
    areaId: string | null | undefined,
    siteId: string | null | undefined = selectedSiteId,
  ) => {
    const options = getOperationalRoleOptionsForArea(areaId, siteId);
    const defaultOptions = options.filter((role) => role.isDefault);

    if (defaultOptions.length === 1) return defaultOptions[0]?.code ?? "";
    if (options.length === 1) return options[0]?.code ?? "";
    return "";
  };

  const getDefaultAreaIdForOperationalRole = (
    roleCode: string | null | undefined,
  ) => {
    const normalizedRoleCode = cleanOptionalText(roleCode);
    if (!normalizedRoleCode) return "";

    const matchingOptions = operationalRoleSelectOptions.filter(
      (role) =>
        cleanOptionalText(role.siteId) === selectedSiteId &&
        role.code === normalizedRoleCode &&
        role.areaId,
    );
    const uniqueAreaIds = uniqueTextValues(
      matchingOptions.map((role) => role.areaId),
    );

    if (uniqueAreaIds.length === 1) return uniqueAreaIds[0] ?? "";

    const defaultMatchingOptions = matchingOptions.filter(
      (role) => role.isDefault,
    );
    const uniqueDefaultAreaIds = uniqueTextValues(
      defaultMatchingOptions.map((role) => role.areaId),
    );

    return uniqueDefaultAreaIds.length === 1
      ? (uniqueDefaultAreaIds[0] ?? "")
      : "";
  };

  const getEmployeeDefaultOperationalRole = (employee: EmployeeRow) => {
    const profiles = operationalProfilesByEmployee.get(employee.id) ?? [];
    const profileRole = cleanOptionalText(
      profiles.find((profile) =>
        profile.site_id === selectedSiteId &&
        cleanOptionalText(profile.default_operational_role),
      )?.default_operational_role,
    );

    return (
      profileRole ?? getOperationalRoleCandidateFromBaseRole(employee.role)
    );
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
        "id,employee_id,shift_date,start_time,end_time,shift_kind,operational_role,show_end_as_close,break_minutes,status,notes,site_id,area_id,checkin_site_id,checkout_site_id,published_at",
      )
      .in("employee_id", employeeIds)
      .eq("site_id", selectedSiteId)
      .gte("shift_date", totalsStartIso)
      .lte("shift_date", totalsEndIso);

    for (const employeeId of employeeIds) {
      totalsByEmployee[employeeId] = {
        week: createEmptyPeriodTotals(),
        fortnight: createEmptyPeriodTotals(),
        month: createEmptyPeriodTotals(),
      };
    }

    for (const shift of (monthShiftRows ?? []) as ShiftRow[]) {
      if (shift.status === "cancelled") continue;

      const totals = totalsByEmployee[shift.employee_id];
      if (!totals) continue;

      const minutes = getShiftMinutes(shift);
      if (minutes <= 0) continue;

      const isPublished = Boolean(shift.published_at);
      addMinutesToPeriodTotals(totals.month, minutes, isPublished);
      if (shift.shift_date >= weekStartIso && shift.shift_date <= weekEndIso) {
        addMinutesToPeriodTotals(totals.week, minutes, isPublished);
      }
      if (
        shift.shift_date >= fortnightStartIso &&
        shift.shift_date <= fortnightEndIso
      ) {
        addMinutesToPeriodTotals(totals.fortnight, minutes, isPublished);
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
  const quickEmployeeId = "";
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
    if (targetEmployeeIds.length === 0) return "";

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
  const selectedShiftHasExternalPoints = Boolean(
    selectedShift?.checkin_site_id || selectedShift?.checkout_site_id,
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
    { key: "total", label: "Horas semana", width: 190, minWidth: 150 },
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
                <div
                  key={`edit-shift-panel-${selectedShift.id}`}
                  className="ui-panel"
                >
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
                    key={`edit-shift-form-${selectedShift.id}`}
                    action={saveShiftAction}
                    className="grid gap-4 xl:grid-cols-12"
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
                      value={selectedShift.site_id}
                    />
                    <input
                      type="hidden"
                      name="return_to"
                      value={returnToWithoutEdit}
                    />
                    <input
                      type="hidden"
                      name="break_minutes"
                      value={selectedShift.break_minutes ?? 0}
                    />
                    <input
                      type="hidden"
                      name="status"
                      value={selectedShift.status || "scheduled"}
                    />

                    <label className="flex flex-col gap-1 md:col-span-4">
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
                            data-site-ids={Array.from(
                              employeeAllowedSiteIdsById.get(employee.id) ??
                                new Set<string>(),
                            ).join(",")}
                            data-operational-role={getEmployeeDefaultOperationalRole(
                              employee,
                            )}
                            data-default-area-id={getDefaultAreaIdForOperationalRole(
                              getEmployeeDefaultOperationalRole(employee),
                            )}
                          >
                            {employee.full_name ??
                              employee.alias ??
                              employee.id}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-1 md:col-span-4">
                      <span className="ui-label">Área del turno</span>
                      <select
                        name="area_id"
                        className="ui-input"
                        defaultValue={selectedShiftAreaId}
                        data-operational-area-select
                      >
                        <option value="">General / sin área</option>
                        {operationalAreaOptions.map((area) => (
                          <option
                            key={`${area.siteId ?? "site"}-${area.id}`}
                            value={area.id}
                            data-site-id={area.siteId ?? ""}
                          >
                            {area.label}
                            {area.kind ? ` · ${area.kind}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-1 md:col-span-4">
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
                            data-site-id={selectedShift.site_id}
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
                            key={`${role.siteId ?? "site"}-${role.areaId ?? "general"}-${role.code}`}
                            value={role.code}
                            data-site-id={role.siteId ?? ""}
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

                    <label className="md:col-span-12 inline-flex items-center gap-2 text-sm text-[var(--ui-text)]">
                      <input
                        type="checkbox"
                        className="rounded border-[var(--ui-border)]"
                        defaultChecked={selectedShiftHasExternalPoints}
                        data-external-points-toggle
                      />
                      Cambiar puntos de entrada y salida
                    </label>

                    <label
                      className={`flex flex-col gap-1 md:col-span-6 ${
                        selectedShiftHasExternalPoints ? "" : "hidden"
                      }`}
                      hidden={!selectedShiftHasExternalPoints}
                      data-external-checkin-row
                    >
                      <span className="ui-label">Punto check-in</span>
                      <select
                        name="checkin_site_id"
                        className="ui-input"
                        defaultValue={selectedShift.checkin_site_id ?? ""}
                        disabled={!selectedShiftHasExternalPoints}
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
                      className={`flex flex-col gap-1 md:col-span-6 ${
                        selectedShiftHasExternalPoints ? "" : "hidden"
                      }`}
                      hidden={!selectedShiftHasExternalPoints}
                      data-external-checkout-row
                    >
                      <span className="ui-label">Punto check-out</span>
                      <select
                        name="checkout_site_id"
                        className="ui-input"
                        defaultValue={selectedShift.checkout_site_id ?? ""}
                        disabled={!selectedShiftHasExternalPoints}
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

                    <label className="flex flex-col gap-1 md:col-span-4">
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

                    <label className="flex flex-col gap-1 md:col-span-4">
                      <span className="ui-label">Inicio</span>
                      <input
                        name="start_time"
                        type="time"
                        className="ui-input"
                        required
                        defaultValue={selectedShift.start_time.slice(0, 5)}
                      />
                    </label>

                    <label className="flex flex-col gap-1 md:col-span-4">
                      <span className="ui-label">Fin</span>
                      <input
                        name="end_time"
                        type="time"
                        className="ui-input"
                        required
                        defaultValue={selectedShift.end_time.slice(0, 5)}
                      />
                    </label>

                    <label className="flex flex-col gap-1 md:col-span-12">
                      <span className="ui-label">Nota</span>
                      <input
                        name="notes"
                        className="ui-input"
                        defaultValue={selectedShift.notes ?? ""}
                      />
                    </label>

                    <div className="md:col-span-12 space-y-2">
                      <label className="inline-flex items-center gap-2 text-sm text-[var(--ui-text)]">
                        <input
                          type="checkbox"
                          className="rounded border-[var(--ui-border)]"
                          defaultChecked={selectedShift.site_id !== selectedSiteId}
                          data-block-site-toggle
                        />
                        Este turno es para otra sede
                      </label>
                      <label
                        className={`flex flex-col gap-1 ${
                          selectedShift.site_id !== selectedSiteId ? "" : "hidden"
                        }`}
                        hidden={selectedShift.site_id === selectedSiteId}
                        data-block-site-row
                      >
                        <span className="ui-label">Sede del turno</span>
                        <select
                          name="block_site_id"
                          className="ui-input"
                          defaultValue={selectedShift.site_id}
                          data-block-site-select
                        >
                          {operationalSites.map((site) => (
                            <option key={site.id} value={site.id}>
                              {site.name ?? site.code ?? site.id}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <label className="md:col-span-12 inline-flex items-center gap-2 text-sm text-[var(--ui-text)]">
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

                    <label className="md:col-span-12 inline-flex items-center gap-2 text-sm text-[var(--ui-text)]">
                      <input
                        type="checkbox"
                        name="full_day_rest"
                        value="1"
                        defaultChecked={selectedShift.shift_kind === "descanso"}
                        className="rounded border-[var(--ui-border)]"
                      />
                      Marcar este día como descanso
                    </label>

                    <div className="flex items-end justify-end md:col-span-12">
                      <button
                        type="submit"
                        className="ui-btn ui-btn--brand w-full md:w-auto md:min-w-[220px]"
                      >
                        Guardar cambios
                      </button>
                    </div>
                  </form>
                  {!selectedShift.published_at ? (
                    <form action={deleteShiftAction} className="mt-3">
                      <input
                        type="hidden"
                        name="shift_id"
                        value={selectedShift.id}
                      />
                      <input
                        type="hidden"
                        name="return_to"
                        value={returnToWithoutEdit}
                      />
                      <button
                        type="submit"
                        className="ui-btn ui-btn--ghost ui-btn--sm text-[var(--ui-danger)]"
                      >
                        Eliminar este borrador
                      </button>
                    </form>
                  ) : null}
                </div>
              ) : (
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
                    className="grid gap-4 xl:grid-cols-12"
                    data-quick-shift-form
                    data-operational-context-form
                  >
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
                    <input type="hidden" name="break_minutes" value="0" />
                    <input type="hidden" name="status" value="scheduled" />

                    <select
                      className="hidden"
                      disabled
                      hidden
                      data-block-site-select-template
                    >
                      {operationalSites.map((site) => (
                        <option key={site.id} value={site.id}>
                          {site.name ?? site.code ?? site.id}
                        </option>
                      ))}
                    </select>

                    <label className="flex flex-col gap-1 md:col-span-4">
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
                            data-site-ids={Array.from(
                              employeeAllowedSiteIdsById.get(employee.id) ??
                                new Set<string>(),
                            ).join(",")}
                            data-operational-role={getEmployeeDefaultOperationalRole(
                              employee,
                            )}
                            data-default-area-id={getDefaultAreaIdForOperationalRole(
                              getEmployeeDefaultOperationalRole(employee),
                            )}
                          >
                            {employee.full_name ??
                              employee.alias ??
                              employee.id}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-1 md:col-span-4">
                      <span className="ui-label">Área del turno</span>
                      <select
                        name="area_id"
                        className="ui-input"
                        defaultValue={quickShiftAreaId}
                        data-operational-area-select
                      >
                        <option value="">General / sin área</option>
                        {operationalAreaOptions.map((area) => (
                          <option
                            key={`${area.siteId ?? "site"}-${area.id}`}
                            value={area.id}
                            data-site-id={area.siteId ?? ""}
                          >
                            {area.label}
                            {area.kind ? ` · ${area.kind}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-1 md:col-span-4">
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
                            key={`${role.siteId ?? "site"}-${role.areaId ?? "general"}-${role.code}`}
                            value={role.code}
                            data-site-id={role.siteId ?? ""}
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

                    <label className="md:col-span-12 inline-flex items-center gap-2 text-sm text-[var(--ui-text)]">
                      <input
                        type="checkbox"
                        className="rounded border-[var(--ui-border)]"
                        data-external-points-toggle
                      />
                      Cambiar puntos de entrada y salida
                    </label>

                    <label
                      className="hidden flex flex-col gap-1 md:col-span-6"
                      hidden
                      data-external-checkin-row
                    >
                      <span className="ui-label">Punto check-in</span>
                      <select
                        name="checkin_site_id"
                        className="ui-input"
                        defaultValue=""
                        disabled
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
                      className="hidden flex flex-col gap-1 md:col-span-6"
                      hidden
                      data-external-checkout-row
                    >
                      <span className="ui-label">Punto check-out</span>
                      <select
                        name="checkout_site_id"
                        className="ui-input"
                        defaultValue=""
                        disabled
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
                      className="flex flex-col gap-1 md:col-span-4"
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
                      className="flex flex-col gap-1 md:col-span-4"
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
                      className="flex flex-col gap-1 md:col-span-4"
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

                    <label className="flex flex-col gap-1 md:col-span-12">
                      <span className="ui-label">Nota bloque 1</span>
                      <input
                        name="block_notes"
                        className="ui-input"
                        placeholder="Ej. Cajero, apoyo barra, cierre"
                        maxLength={240}
                      />
                    </label>

                    <div className="md:col-span-12 space-y-2">
                      <label className="inline-flex items-center gap-2 text-sm text-[var(--ui-text)]">
                        <input
                          type="checkbox"
                          className="rounded border-[var(--ui-border)]"
                          data-block-site-toggle
                        />
                        Este bloque es para otra sede
                      </label>
                      <label
                        className="hidden flex flex-col gap-1"
                        hidden
                        data-block-site-row
                      >
                        <span className="ui-label">Sede de este bloque</span>
                        <select
                          name="block_site_id"
                          className="ui-input"
                          defaultValue={selectedSiteId}
                          data-block-site-select
                        >
                          {operationalSites.map((site) => (
                            <option key={site.id} value={site.id}>
                              {site.name ?? site.code ?? site.id}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <label className="md:col-span-12 inline-flex items-center gap-2 text-sm text-[var(--ui-text)]">
                      <input
                        type="checkbox"
                        name="block_rest_day"
                        value="0"
                        className="rounded border-[var(--ui-border)]"
                        data-block-rest-day-toggle
                      />
                      Marcar este día como descanso completo
                    </label>

                    <div
                      className="contents md:col-span-12"
                      data-quick-shift-extra-blocks
                    />

                    <div
                      className="flex flex-wrap items-center gap-2 md:col-span-12"
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
                      className="md:col-span-12 inline-flex items-center gap-2 text-sm text-[var(--ui-text)]"
                      data-quick-shift-close-row
                    >
                      <input
                        type="checkbox"
                        name="show_end_as_close"
                        value="1"
                        className="rounded border-[var(--ui-border)]"
                        data-quick-shift-close-input
                      />
                      Mostrar la salida del último bloque como
                      &quot;Cierre&quot; al empleado
                    </label>

                    <div className="flex items-end justify-end md:col-span-12">
                      <button
                        type="submit"
                        className="ui-btn ui-btn--brand w-full md:w-auto md:min-w-[220px]"
                      >
                        Guardar turno
                      </button>
                    </div>
                  </form>
                </div>
              )}
              <Script id="viso-quick-shift-blocks" strategy="afterInteractive">
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
                      block.className = "rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3 md:col-span-12";
                      block.setAttribute("data-quick-shift-block", "optional");
                      block.innerHTML =
                        '<div class="mb-2 flex items-center justify-between gap-2">' +
                          '<div class="text-sm font-semibold text-[var(--ui-text)]">Bloque ' + index + '</div>' +
                          '<button type="button" class="text-xs font-semibold text-[var(--ui-danger)]" data-remove-shift-block>Quitar</button>' +
                        '</div>' +
                        '<div class="grid gap-3 md:grid-cols-12">' +
                          '<label class="flex flex-col gap-1 md:col-span-4">' +
                            '<span class="ui-label">Día bloque ' + index + '</span>' +
                            '<input name="block_shift_date" type="date" class="ui-input" value="' + inheritedDate + '" min="' + minDate + '" max="' + maxDate + '" />' +
                          '</label>' +
                          '<label class="flex flex-col gap-1 md:col-span-4">' +
                            '<span class="ui-label">Inicio bloque ' + index + '</span>' +
                            '<input name="block_start_time" type="time" class="ui-input" data-quick-shift-time-input />' +
                          '</label>' +
                          '<label class="flex flex-col gap-1 md:col-span-4">' +
                            '<span class="ui-label">Fin bloque ' + index + '</span>' +
                            '<input name="block_end_time" type="time" class="ui-input" data-quick-shift-time-input />' +
                          '</label>' +
                          '<label class="flex flex-col gap-1 md:col-span-12">' +
                            '<span class="ui-label">Nota bloque ' + index + '</span>' +
                            '<input name="block_notes" class="ui-input" placeholder="Opcional" maxLength="240" />' +
                          '</label>' +
                          '<div class="space-y-2 md:col-span-12">' +
                            '<label class="inline-flex items-center gap-2 text-sm text-[var(--ui-text)]">' +
                              '<input type="checkbox" class="rounded border-[var(--ui-border)]" data-block-site-toggle />' +
                              '<span>Este bloque es para otra sede</span>' +
                            '</label>' +
                            '<label class="hidden flex flex-col gap-1" hidden data-block-site-row>' +
                              '<span class="ui-label">Sede de este bloque</span>' +
                              '<select name="block_site_id" class="ui-input" data-block-site-select></select>' +
                            '</label>' +
                          '</div>' +
                          '<label class="inline-flex items-center gap-2 text-sm text-[var(--ui-text)] md:col-span-12">' +
                            '<input type="checkbox" name="block_rest_day" value="' + (index - 1) + '" class="rounded border-[var(--ui-border)]" data-block-rest-day-toggle />' +
                            '<span>Marcar este día como descanso completo</span>' +
                          '</label>' +
                        '</div>';
                      var siteTemplate = form.querySelector("[data-block-site-select-template]");
                      var siteSelect = block.querySelector("[data-block-site-select]");
                      if (siteTemplate && siteSelect) siteSelect.innerHTML = siteTemplate.innerHTML;
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
                      var siteToggles = Array.from(form.querySelectorAll('[data-block-site-toggle]'));
                      var siteSelects = Array.from(form.querySelectorAll('[data-block-site-select]'));
                      return dates.map(function (dateInput, index) {
                        return {
                          date: dateInput.value || "",
                          start: starts[index] ? starts[index].value || "" : "",
                          end: ends[index] ? ends[index].value || "" : "",
                          note: notes[index] ? notes[index].value || "" : "",
                          restDay: Boolean(restInputs[index] && restInputs[index].checked),
                          otherSite: Boolean(siteToggles[index] && siteToggles[index].checked),
                          siteId: siteSelects[index] ? siteSelects[index].value || "" : "",
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
                      var siteToggles = Array.from(form.querySelectorAll('[data-block-site-toggle]'));
                      var siteSelects = Array.from(form.querySelectorAll('[data-block-site-select]'));
                      rows.forEach(function (row, index) {
                        if (dates[index]) dates[index].value = row.date || "";
                        if (starts[index]) starts[index].value = row.start || "";
                        if (ends[index]) ends[index].value = row.end || "";
                        if (notes[index]) notes[index].value = row.note || "";
                        if (restInputs[index]) restInputs[index].checked = Boolean(row.restDay);
                        if (siteToggles[index]) siteToggles[index].checked = Boolean(row.otherSite);
                        if (siteSelects[index] && typeof row.siteId === "string") siteSelects[index].value = row.siteId;
                      });
                      syncBlockRestIndexes(form);
                      refreshBlockSiteControls(form);
                    }

                    function saveDraft(form) {
                      try {
                        var siteSelect = form.querySelector('[name="site_id"]');
                        var employee = form.querySelector('[name="employee_id"]');
                        var areaSelect = form.querySelector("[data-operational-area-select]");
                        var operationalRoleSelect = form.querySelector("[data-operational-role-select]");
                        var checkinSelect = form.querySelector("[data-external-checkin-select]");
                        var checkoutSelect = form.querySelector("[data-external-checkout-select]");
                        var closeInput = form.querySelector("[data-quick-shift-close-input]");
                        window.sessionStorage.setItem(draftKey, JSON.stringify({
                          siteId: siteSelect ? siteSelect.value || "" : "",
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
                        var siteSelect = form.querySelector('[name="site_id"]');
                        var employee = form.querySelector('[name="employee_id"]');
                        var areaSelect = form.querySelector("[data-operational-area-select]");
                        var operationalRoleSelect = form.querySelector("[data-operational-role-select]");
                        var checkinSelect = form.querySelector("[data-external-checkin-select]");
                        var checkoutSelect = form.querySelector("[data-external-checkout-select]");
                        var closeInput = form.querySelector("[data-quick-shift-close-input]");
                        if (siteSelect && typeof draft.siteId === "string") siteSelect.value = draft.siteId;
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
                      element.hidden = hidden;
                      element.classList.toggle("hidden", hidden);
                      element.setAttribute("aria-hidden", hidden ? "true" : "false");
                      element.style.display = hidden ? "none" : "";
                    }

                    function getSelectedRoleOption(roleSelect) {
                      if (!roleSelect || roleSelect.selectedIndex < 0) return null;
                      return roleSelect.options[roleSelect.selectedIndex] || null;
                    }

                    function getActiveRoleOptions(form) {
                      var siteSelect = form.querySelector('[name="site_id"]');
                      var areaSelect = form.querySelector("[data-operational-area-select]");
                      var roleSelect = form.querySelector("[data-operational-role-select]");
                      if (!roleSelect) return [];

                      var siteId = siteSelect ? siteSelect.value || "" : "";
                      var areaId = areaSelect ? areaSelect.value || "" : "";
                      var options = Array.from(roleSelect.options).filter(function (option) {
                        return Boolean(option.value);
                      });
                      var siteOptions = options.filter(function (option) {
                        return !siteId || (option.getAttribute("data-site-id") || "") === siteId;
                      });
                      var scopedOptions = siteOptions.filter(function (option) {
                        return (option.getAttribute("data-area-id") || "") === areaId;
                      });
                      var activeOptions = scopedOptions.length > 0
                        ? scopedOptions
                        : areaId
                          ? siteOptions.filter(function (option) { return (option.getAttribute("data-area-id") || "") === ""; })
                          : siteOptions;

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

                    function getSelectedSiteId(form) {
                      var siteSelect = form.querySelector('[name="site_id"]');
                      return siteSelect ? siteSelect.value || "" : "";
                    }

                    function refreshEmployeeOptionsForSite(form) {
                      var siteId = getSelectedSiteId(form);
                      var employeeSelect = form.querySelector('select[name="employee_id"]');
                      if (!employeeSelect) return;

                      Array.from(employeeSelect.options).forEach(function (option) {
                        if (!option.value) return;
                        var siteIds = (option.getAttribute("data-site-ids") || "").split(",").filter(Boolean);
                        var isActive = !siteId || siteIds.indexOf(siteId) >= 0;
                        option.disabled = !isActive;
                        option.hidden = !isActive;
                      });

                      var selectedOption = employeeSelect.selectedIndex >= 0 ? employeeSelect.options[employeeSelect.selectedIndex] : null;
                      if (selectedOption && selectedOption.value && selectedOption.disabled) {
                        employeeSelect.value = "";
                      }
                    }

                    function refreshAreaOptionsForSite(form) {
                      var siteId = getSelectedSiteId(form);
                      var areaSelect = form.querySelector("[data-operational-area-select]");
                      if (!areaSelect) return;

                      Array.from(areaSelect.options).forEach(function (option) {
                        if (!option.value) return;
                        var optionSiteId = option.getAttribute("data-site-id") || "";
                        var isActive = !siteId || optionSiteId === siteId;
                        option.disabled = !isActive;
                        option.hidden = !isActive;
                      });

                      var selectedOption = areaSelect.selectedIndex >= 0 ? areaSelect.options[areaSelect.selectedIndex] : null;
                      if (selectedOption && selectedOption.value && selectedOption.disabled) {
                        areaSelect.value = "";
                      }
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

                    function selectAreaDefaultRoleOption(roleSelect, activeOptions) {
                      if (!roleSelect || activeOptions.length === 0) return false;

                      var defaultOptions = activeOptions.filter(function (item) {
                        return item.getAttribute("data-is-default") === "1";
                      });
                      var option = defaultOptions.length === 1
                        ? defaultOptions[0]
                        : activeOptions.length === 1
                          ? activeOptions[0]
                          : null;

                      if (!option) return false;

                      roleSelect.selectedIndex = Array.from(roleSelect.options).indexOf(option);
                      return true;
                    }

                    function getSelectedEmployeeOption(form) {
                      var employeeSelect = form.querySelector('select[name="employee_id"]');
                      return employeeSelect && employeeSelect.selectedIndex >= 0
                        ? employeeSelect.options[employeeSelect.selectedIndex]
                        : null;
                    }

                    function applyEmployeeDefaultArea(form, force) {
                      var areaSelect = form.querySelector("[data-operational-area-select]");
                      if (!areaSelect) return;

                      if (areaSelect.getAttribute("data-user-changed") === "1") return;

                      var selectedEmployeeOption = getSelectedEmployeeOption(form);
                      var employeeId = selectedEmployeeOption ? selectedEmployeeOption.value || "" : "";
                      var defaultAreaId = employeeId && selectedEmployeeOption
                        ? selectedEmployeeOption.getAttribute("data-default-area-id") || ""
                        : "";

                      if (defaultAreaId && (force || !areaSelect.value)) {
                        var matchingAreaOption = Array.from(areaSelect.options).find(function (option) {
                          return option.value === defaultAreaId && !option.disabled;
                        });
                        if (matchingAreaOption) areaSelect.value = defaultAreaId;
                      }

                      if (!areaSelect.value) {
                        var activeAreaOptions = Array.from(areaSelect.options).filter(function (option) {
                          return Boolean(option.value) && !option.disabled && !option.hidden;
                        });
                        if (activeAreaOptions.length === 1) {
                          areaSelect.value = activeAreaOptions[0].value;
                        }
                      }
                    }

                    function refreshExternalPointControls(form) {
                      var externalPointsToggle = form.querySelector("[data-external-points-toggle]");
                      var externalPointsEnabled = Boolean(externalPointsToggle && externalPointsToggle.checked);
                      var roleSelect = form.querySelector("[data-operational-role-select]");
                      var selectedOption = getSelectedRoleOption(roleSelect);
                      var requiresCheckin = externalPointsEnabled;
                      var requiresCheckout = externalPointsEnabled;

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
                      var operationalRoleSelect = form.querySelector("[data-operational-role-select]");
                      if (!operationalRoleSelect) return;

                      refreshEmployeeOptionsForSite(form);
                      refreshAreaOptionsForSite(form);
                      applyEmployeeDefaultArea(form, force);

                      var activeOptions = getActiveRoleOptions(form);
                      var selectedOption = getSelectedRoleOption(operationalRoleSelect);
                      var hasActiveSelection = selectedOption && selectedOption.value && activeOptions.indexOf(selectedOption) >= 0;

                      if (!force && operationalRoleSelect.getAttribute("data-user-changed") === "1" && hasActiveSelection) {
                        refreshExternalPointControls(form);
                        return;
                      }

                      var selectedEmployeeOption = getSelectedEmployeeOption(form);
                      var employeeId = selectedEmployeeOption ? selectedEmployeeOption.value || "" : "";
                      var employeeRole = employeeId && selectedEmployeeOption ? selectedEmployeeOption.getAttribute("data-operational-role") || "" : "";

                      if (!employeeId) {
                        operationalRoleSelect.value = "";
                        operationalRoleSelect.removeAttribute("data-user-changed");
                        refreshExternalPointControls(form);
                        return;
                      }

                      if (!selectRoleOption(operationalRoleSelect, activeOptions, employeeRole)) {
                        if (!hasActiveSelection && !selectAreaDefaultRoleOption(operationalRoleSelect, activeOptions)) {
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
                      var siteSelect = form.querySelector('[name="site_id"]');
                      var operationalRoleSelect = form.querySelector("[data-operational-role-select]");

                      if (operationalRoleSelect && operationalRoleSelect.getAttribute("data-preserve-initial-role") === "1" && operationalRoleSelect.value) {
                        operationalRoleSelect.setAttribute("data-user-changed", "1");
                      }

                      if (areaSelect) {
                        areaSelect.addEventListener("change", function () {
                          areaSelect.setAttribute("data-user-changed", "1");
                          if (operationalRoleSelect) operationalRoleSelect.removeAttribute("data-user-changed");
                          syncDefaultOperationalRole(form, true);
                        });
                      }
                      if (employeeSelect) {
                        employeeSelect.addEventListener("change", function () {
                          if (areaSelect) areaSelect.removeAttribute("data-user-changed");
                          if (operationalRoleSelect) operationalRoleSelect.removeAttribute("data-user-changed");
                          syncDefaultOperationalRole(form, true);
                        });
                      }
                      if (siteSelect) {
                        siteSelect.addEventListener("change", function () {
                          if (areaSelect) areaSelect.removeAttribute("data-user-changed");
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
                      var externalPointsToggle = form.querySelector("[data-external-points-toggle]");
                      if (externalPointsToggle) {
                        externalPointsToggle.addEventListener("change", function () {
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

                      refreshBlockSiteControls(form);
                      refreshExternalPointControls(form);
                    }

                    function refreshBlockSiteControls(form) {
                      Array.from(form.querySelectorAll("[data-block-site-toggle]")).forEach(function (toggle) {
                        var wrapper = toggle.closest(".space-y-2") || toggle.parentElement;
                        var row = wrapper ? wrapper.querySelector("[data-block-site-row]") : null;
                        var select = wrapper ? wrapper.querySelector("[data-block-site-select]") : null;
                        var enabled = Boolean(toggle.checked);
                        setElementHidden(row, !enabled);
                        if (select) {
                          if (!enabled) {
                            var defaultSite = form.querySelector('[name="site_id"]');
                            select.value = defaultSite ? defaultSite.value || "" : "";
                          }
                        }
                      });
                    }

                    function initQuickShiftForm(form) {
                      if (!form || form.getAttribute("data-quick-shift-ready") === "1") return;
                      form.setAttribute("data-quick-shift-ready", "1");

                      form.addEventListener("change", function (event) {
                        var target = event.target;
                        if (target && target.matches && target.matches("[data-block-rest-day-toggle]")) {
                          refreshBlockControls(form);
                        }
                        if (target && target.matches && target.matches("[data-block-site-toggle]")) {
                          refreshBlockSiteControls(form);
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

                      document.addEventListener("change", function (event) {
                        var target = event.target;
                        if (!target || !target.matches || !target.closest) return;
                        var form = target.closest("[data-operational-context-form]");
                        if (!form) return;

                        if (target.matches("[data-external-points-toggle]")) {
                          initOperationalContextForm(form);
                          refreshExternalPointControls(form);
                          return;
                        }

                        if (target.matches("[data-block-site-toggle]")) {
                          refreshBlockSiteControls(form);
                          return;
                        }

                        if (target.matches("[data-operational-role-select]")) {
                          target.setAttribute("data-user-changed", "1");
                          initOperationalContextForm(form);
                          refreshExternalPointControls(form);
                          return;
                        }

                        if (target.matches("[data-operational-area-select]") || target.matches('select[name="employee_id"]') || target.matches('[name="site_id"]')) {
                          var areaSelect = form.querySelector("[data-operational-area-select]");
                          var operationalRoleSelect = form.querySelector("[data-operational-role-select]");
                          if (target.matches("[data-operational-area-select]")) {
                            target.setAttribute("data-user-changed", "1");
                          } else if (target.matches('[name="site_id"]')) {
                            if (areaSelect) areaSelect.removeAttribute("data-user-changed");
                          } else if (areaSelect) {
                            areaSelect.removeAttribute("data-user-changed");
                          }
                          if (operationalRoleSelect) operationalRoleSelect.removeAttribute("data-user-changed");
                          initOperationalContextForm(form);
                          syncDefaultOperationalRole(form, true);
                        }
                      });

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

                    if (!window.__visoQuickShiftObserver && window.MutationObserver) {
                      window.__visoQuickShiftObserver = new MutationObserver(function () {
                        initAllQuickShiftForms();
                      });
                      window.__visoQuickShiftObserver.observe(document.body, {
                        childList: true,
                        subtree: true,
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
                          const weekTotals = totalsByEmployee[employee.id]
                            ?.week ?? {
                            publishedMinutes: 0,
                            draftMinutes: 0,
                            totalMinutes: 0,
                          };
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
                                              : null;
                                          const visibleStatus =
                                            visibleStatusByShiftId[shift.id] ??
                                            "Programado";
                                          const shiftInProgress =
                                            isShiftInProgress(
                                              shift,
                                              nowBogota.dateIso,
                                              nowBogota.minutes,
                                            );
                                          const shiftEnded = hasShiftEnded(
                                            shift,
                                            nowBogota.dateIso,
                                            nowBogota.minutes,
                                          );
                                          const shiftCompleted = Boolean(
                                            visibleStatus === "Asistió" &&
                                            shiftEnded,
                                          );
                                          const shiftPending = Boolean(
                                            visibleStatus === "Programado" &&
                                            !shiftInProgress &&
                                            !shiftEnded,
                                          );
                                          const temporalLabel = shiftInProgress
                                            ? "En curso"
                                            : shiftCompleted
                                              ? "Completado"
                                              : shiftPending
                                                ? "Pendiente"
                                                : null;
                                          const temporalMarker = shiftInProgress
                                            ? "●"
                                            : shiftCompleted
                                              ? "✓"
                                              : null;
                                          const statusLabel =
                                            visibleStatus === "Borrador" ||
                                            visibleStatus === "Cancelado" ||
                                            visibleStatus === "No asistió" ||
                                            visibleStatus === "Con retraso"
                                              ? visibleStatus
                                              : null;
                                          const employeeDefaultOperationalRole =
                                            cleanOptionalText(
                                              getEmployeeDefaultOperationalRole(
                                                employee,
                                              ),
                                            );
                                          const shiftOperationalRole =
                                            cleanOptionalText(
                                              shift.operational_role,
                                            );
                                          const normalizedShiftAreaLabel =
                                            normalizeRole(shiftAreaLabel);
                                          const normalizedGroupAreaLabel =
                                            normalizeRole(areaVisual.label);
                                          const roleAlreadyNamesArea = Boolean(
                                            roleLabel &&
                                            normalizeRole(roleLabel).includes(
                                              normalizedShiftAreaLabel,
                                            ),
                                          );
                                          const shouldShowRoleLabel = Boolean(
                                            shift.shift_kind !== "descanso" &&
                                            roleLabel &&
                                            shiftOperationalRole &&
                                            shiftOperationalRole !==
                                              employeeDefaultOperationalRole,
                                          );
                                          const shouldShowAreaLabel = Boolean(
                                            shift.shift_kind !== "descanso" &&
                                            shiftAreaLabel !== "General" &&
                                            !normalizedShiftAreaLabel.includes(
                                              normalizedGroupAreaLabel,
                                            ) &&
                                            !roleAlreadyNamesArea,
                                          );
                                          const shiftTemporalClass =
                                            visibleStatus === "Borrador"
                                              ? "ring-1 ring-amber-300/80"
                                              : visibleStatus === "Cancelado"
                                                ? "opacity-60 ring-1 ring-red-300/70"
                                                : visibleStatus === "No asistió"
                                                  ? "ring-1 ring-red-300/80"
                                                  : visibleStatus ===
                                                      "Con retraso"
                                                    ? "ring-1 ring-orange-300/80"
                                                    : shiftInProgress
                                                      ? "ring-2 ring-inset ring-[var(--ui-brand)] shadow-sm"
                                                      : shiftCompleted
                                                        ? "opacity-70"
                                                        : shiftPending
                                                          ? "ring-1 ring-slate-200/80"
                                                          : "";
                                          const markerClass = shiftInProgress
                                            ? "text-[var(--ui-brand)]"
                                            : "text-emerald-600";
                                          const visibleDetailLabels = [
                                            statusLabel,
                                            shouldShowRoleLabel
                                              ? roleLabel
                                              : null,
                                            shouldShowAreaLabel
                                              ? shiftAreaLabel
                                              : null,
                                            externalPointLabel,
                                          ].filter(Boolean);
                                          const cardTitle = [
                                            formatShiftRange(
                                              shift.start_time,
                                              shift.end_time,
                                              shift.show_end_as_close,
                                              shift.shift_kind,
                                            ),
                                            temporalLabel ?? visibleStatus,
                                            roleLabel,
                                            shiftAreaLabel,
                                            externalPointLabel,
                                            shift.notes
                                              ? `Nota: ${shift.notes}`
                                              : null,
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
                                              className={`flex min-w-[78px] flex-1 basis-[78px] flex-col rounded-lg border px-2 py-1 no-underline transition ${areaVisual.shiftClass} ${shiftTemporalClass} ${selectedShift?.id === shift.id ? "ring-2 ring-inset ring-[var(--ui-brand)]" : ""}`}
                                              title={cardTitle}
                                            >
                                              <div className="flex items-center gap-1 text-xs font-semibold leading-snug text-[var(--ui-text)]">
                                                {temporalMarker ? (
                                                  <span
                                                    className={`text-[10px] leading-none ${markerClass}`}
                                                    aria-hidden="true"
                                                  >
                                                    {temporalMarker}
                                                  </span>
                                                ) : null}
                                                <span>
                                                  {formatShiftRange(
                                                    shift.start_time,
                                                    shift.end_time,
                                                    shift.show_end_as_close,
                                                    shift.shift_kind,
                                                  )}
                                                </span>
                                              </div>
                                              {shift.shift_kind ===
                                              "descanso" ? (
                                                <div className="mt-0.5 text-[11px] leading-tight text-[var(--ui-muted)]">
                                                  Día libre
                                                </div>
                                              ) : visibleDetailLabels.length >
                                                0 ? (
                                                <div className="mt-0.5 flex flex-col gap-0.5 text-[11px] leading-tight text-[var(--ui-muted)]">
                                                  {visibleDetailLabels.map(
                                                    (label) => (
                                                      <span
                                                        key={String(label)}
                                                        className="truncate"
                                                      >
                                                        {label}
                                                      </span>
                                                    ),
                                                  )}
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
                                <div
                                  className="flex flex-col gap-1 text-[11px] font-semibold leading-tight"
                                  title={
                                    weekTotals.totalMinutes <= 0
                                      ? "Sin horas planificadas"
                                      : weekTotals.publishedMinutes > 0 &&
                                          weekTotals.draftMinutes > 0
                                        ? `Publicadas: ${formatHoursCompact(
                                            weekTotals.publishedMinutes,
                                          )} · Borrador: ${formatHoursCompact(
                                            weekTotals.draftMinutes,
                                          )} · Total: ${formatHoursCompact(
                                            weekTotals.totalMinutes,
                                          )}`
                                        : weekTotals.publishedMinutes > 0
                                          ? `${formatHoursCompact(
                                              weekTotals.publishedMinutes,
                                            )} publicadas`
                                          : `${formatHoursCompact(
                                              weekTotals.draftMinutes,
                                            )} en borrador`
                                  }
                                >
                                  {weekTotals.totalMinutes <= 0 ? (
                                    <span className="text-xs text-[var(--ui-muted)]">
                                      —
                                    </span>
                                  ) : weekTotals.publishedMinutes > 0 &&
                                    weekTotals.draftMinutes > 0 ? (
                                    <>
                                      <span className="inline-flex max-w-full rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">
                                        Publicadas{" "}
                                        {formatHoursCompact(
                                          weekTotals.publishedMinutes,
                                        )}
                                      </span>
                                      <span className="inline-flex max-w-full rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">
                                        Borrador{" "}
                                        {formatHoursCompact(
                                          weekTotals.draftMinutes,
                                        )}
                                      </span>
                                      <span className="inline-flex max-w-full rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-2 py-0.5 text-[var(--ui-text)]">
                                        Total{" "}
                                        {formatHoursCompact(
                                          weekTotals.totalMinutes,
                                        )}
                                      </span>
                                    </>
                                  ) : weekTotals.publishedMinutes > 0 ? (
                                    <span className="inline-flex max-w-full rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">
                                      {formatHoursCompact(
                                        weekTotals.publishedMinutes,
                                      )}{" "}
                                      publicadas
                                    </span>
                                  ) : (
                                    <span className="inline-flex max-w-full rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">
                                      {formatHoursCompact(
                                        weekTotals.draftMinutes,
                                      )}{" "}
                                      en borrador
                                    </span>
                                  )}
                                </div>
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
