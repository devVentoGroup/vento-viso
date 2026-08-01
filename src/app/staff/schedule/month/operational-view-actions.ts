"use server";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  cleanOptionalText,
  endOfMonth,
  getAreaVisualFromRole,
  isOperationalSite,
  isoDate,
  requireStaffScheduleAccess,
  startOfMonth,
  type SiteOperationalRoleRow,
  type SiteRow,
} from "../helpers";

export type MonthlyOperationalShiftView = {
  id: string;
  employeeId: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  shiftKind: string;
  areaLabel: string;
  roleLabel: string;
};

export type MonthlyOperationalViewResult = {
  siteId: string;
  month: string;
  shifts: MonthlyOperationalShiftView[];
};

function parseMonth(value: string | null) {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? "");
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

function normalizeReturnTo(value: string) {
  const trimmed = String(value ?? "").trim();
  return trimmed.startsWith("/staff/schedule/month")
    ? trimmed
    : "/staff/schedule/month";
}

export async function getMonthlyOperationalViewAction(
  returnTo: string,
): Promise<MonthlyOperationalViewResult> {
  const safeReturnTo = normalizeReturnTo(returnTo);
  const url = new URL(safeReturnTo, "https://viso.local");
  const requestedSiteId = url.searchParams.get("site_id")?.trim() ?? "";
  const selectedMonth = parseMonth(url.searchParams.get("month"));
  const selectedMonthKey = monthKey(selectedMonth);

  await requireStaffScheduleAccess(safeReturnTo, requestedSiteId || null);

  const supabase = createAdminClient();
  const { data: sitesData, error: sitesError } = await supabase
    .from("sites")
    .select(
      "id,name,code,site_type,type,operational_visibility,site_operational_capabilities(can_schedule_staff)",
    )
    .order("name", { ascending: true });

  if (sitesError) throw new Error(sitesError.message);

  const operationalSites = ((sitesData ?? []) as SiteRow[]).filter(
    isOperationalSite,
  );
  const selectedSiteId =
    requestedSiteId && operationalSites.some((site) => site.id === requestedSiteId)
      ? requestedSiteId
      : (operationalSites[0]?.id ?? "");

  if (!selectedSiteId) {
    return { siteId: "", month: selectedMonthKey, shifts: [] };
  }

  if (selectedSiteId !== requestedSiteId) {
    await requireStaffScheduleAccess(safeReturnTo, selectedSiteId);
  }

  const monthStartIso = isoDate(startOfMonth(selectedMonth));
  const monthEndIso = isoDate(endOfMonth(selectedMonth));

  const [{ data: shiftRows, error: shiftError }, { data: matrixRows, error: matrixError }] =
    await Promise.all([
      supabase
        .from("employee_shifts")
        .select(
          "id,employee_id,shift_date,start_time,end_time,shift_kind,operational_role,area_id,status",
        )
        .eq("site_id", selectedSiteId)
        .gte("shift_date", monthStartIso)
        .lte("shift_date", monthEndIso)
        .order("shift_date", { ascending: true })
        .order("start_time", { ascending: true }),
      supabase
        .from("vento_site_operational_role_matrix_v1")
        .select(
          "site_id,area_id,area_name,area_kind,role_code,role_label,role_family,is_default,requires_external_checkin,requires_external_checkout,is_active",
        )
        .eq("site_id", selectedSiteId)
        .eq("is_active", true),
    ]);

  if (shiftError) throw new Error(shiftError.message);
  if (matrixError) throw new Error(matrixError.message);

  const activeMatrixRows = (matrixRows ?? []) as Array<
    SiteOperationalRoleRow & { is_active?: boolean | null }
  >;

  const shifts = (shiftRows ?? []).map((raw) => {
    const shift = raw as {
      id: string;
      employee_id: string;
      shift_date: string;
      start_time: string;
      end_time: string;
      shift_kind: string | null;
      operational_role: string | null;
      area_id: string | null;
      status: string | null;
    };

    if (shift.shift_kind === "descanso") {
      return {
        id: shift.id,
        employeeId: shift.employee_id,
        shiftDate: shift.shift_date,
        startTime: shift.start_time,
        endTime: shift.end_time,
        shiftKind: "descanso",
        areaLabel: "Descanso",
        roleLabel: "Descanso",
      } satisfies MonthlyOperationalShiftView;
    }

    const exactRow = activeMatrixRows.find(
      (row) =>
        row.role_code === shift.operational_role &&
        cleanOptionalText(row.area_id) === cleanOptionalText(shift.area_id),
    );
    const fallbackRow =
      exactRow ??
      activeMatrixRows.find((row) => row.role_code === shift.operational_role) ??
      null;
    const areaVisual = getAreaVisualFromRole(shift.operational_role);

    return {
      id: shift.id,
      employeeId: shift.employee_id,
      shiftDate: shift.shift_date,
      startTime: shift.start_time,
      endTime: shift.end_time,
      shiftKind: shift.shift_kind ?? "laboral",
      areaLabel: fallbackRow?.area_name ?? areaVisual.label ?? "General",
      roleLabel:
        fallbackRow?.role_label ?? shift.operational_role ?? "Sin rol operativo",
    } satisfies MonthlyOperationalShiftView;
  });

  return {
    siteId: selectedSiteId,
    month: selectedMonthKey,
    shifts,
  };
}
