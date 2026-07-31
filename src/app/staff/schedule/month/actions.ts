"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { notifyShiftChange } from "@/lib/anima/shift-notify";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  asNumber,
  asText,
  cleanOptionalText,
  endOfMonth,
  getShiftMinutes,
  isoDate,
  requireStaffScheduleAccess,
  startOfMonth,
  type EmployeeRow,
  type ShiftRow,
  type SiteOperationalRoleRow,
} from "../helpers";
import { MONTHLY_SCHEDULE_LIMIT_MINUTES } from "./constants";

function parseMonth(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isInteger(year) || monthIndex < 0 || monthIndex > 11) return null;
  return new Date(year, monthIndex, 1, 12, 0, 0, 0);
}

function buildMonthReturnTo(siteId: string, month: string) {
  const query = new URLSearchParams();
  if (siteId) query.set("site_id", siteId);
  if (month) query.set("month", month);
  return `/staff/schedule/month?${query.toString()}`;
}

function redirectWithMessage(
  returnTo: string,
  type: "ok" | "error" | "warning",
  message: string,
): never {
  const separator = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${separator}${type}=${encodeURIComponent(message)}`);
}

function normalizeRoleContext(value: string) {
  const [roleCode = "", areaId = ""] = value.split("||");
  return {
    roleCode: roleCode.trim(),
    areaId: cleanOptionalText(areaId),
  };
}

async function validateEmployeeSiteLink(
  employeeId: string,
  siteId: string,
  returnTo: string,
) {
  const supabase = createAdminClient();
  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("id,full_name,alias,role,is_active,site_id")
    .eq("id", employeeId)
    .eq("is_active", true)
    .maybeSingle();

  if (employeeError) redirectWithMessage(returnTo, "error", employeeError.message);
  if (!employee) {
    redirectWithMessage(returnTo, "error", "El trabajador no existe o está inactivo.");
  }

  if ((employee as EmployeeRow).site_id === siteId) return employee as EmployeeRow;

  const { data: siteLink, error: siteLinkError } = await supabase
    .from("employee_sites")
    .select("employee_id")
    .eq("employee_id", employeeId)
    .eq("site_id", siteId)
    .eq("is_active", true)
    .maybeSingle();

  if (siteLinkError) redirectWithMessage(returnTo, "error", siteLinkError.message);
  if (!siteLink) {
    redirectWithMessage(
      returnTo,
      "error",
      "El trabajador no está vinculado a la sede seleccionada.",
    );
  }

  return employee as EmployeeRow;
}

export async function createMonthlyShiftsAction(formData: FormData) {
  const employeeId = asText(formData.get("employee_id"));
  const siteId = asText(formData.get("site_id"));
  const month = asText(formData.get("month"));
  const startTime = asText(formData.get("start_time"));
  const endTime = asText(formData.get("end_time"));
  const breakMinutes = Math.max(0, asNumber(formData.get("break_minutes"), 0));
  const notes = asText(formData.get("notes"));
  const roleContext = normalizeRoleContext(asText(formData.get("role_context")));
  const selectedDates = [
    ...new Set(
      formData
        .getAll("shift_dates")
        .map((value) => asText(value))
        .filter(Boolean),
    ),
  ].sort();
  const returnTo =
    asText(formData.get("return_to")) || buildMonthReturnTo(siteId, month);

  await requireStaffScheduleAccess(returnTo, siteId);

  const monthDate = parseMonth(month);
  if (
    !employeeId ||
    !siteId ||
    !monthDate ||
    !startTime ||
    !endTime ||
    selectedDates.length === 0
  ) {
    redirectWithMessage(
      returnTo,
      "error",
      "Completa trabajador, horario y al menos un día del mes.",
    );
  }

  if (endTime <= startTime) {
    redirectWithMessage(
      returnTo,
      "error",
      "La hora de fin debe ser posterior a la hora de inicio.",
    );
  }

  const monthStartIso = isoDate(startOfMonth(monthDate));
  const monthEndIso = isoDate(endOfMonth(monthDate));
  const invalidDate = selectedDates.find(
    (date) =>
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      date < monthStartIso ||
      date > monthEndIso,
  );
  if (invalidDate) {
    redirectWithMessage(
      returnTo,
      "error",
      "Todos los días seleccionados deben pertenecer al mes visible.",
    );
  }

  const grossMinutes = getShiftMinutes({
    start_time: startTime,
    end_time: endTime,
    break_minutes: breakMinutes,
    shift_kind: "laboral",
  });
  if (grossMinutes <= 0) {
    redirectWithMessage(
      returnTo,
      "error",
      "El descanso no puede consumir toda la duración del turno.",
    );
  }

  const employee = await validateEmployeeSiteLink(employeeId, siteId, returnTo);
  const supabase = createAdminClient();

  const { data: matrixRows, error: matrixError } = await supabase
    .from("vento_site_operational_role_matrix_v1")
    .select(
      "site_id,area_id,area_name,area_kind,role_code,role_label,role_family,is_default,requires_external_checkin,requires_external_checkout,is_active",
    )
    .eq("site_id", siteId)
    .eq("is_active", true);

  if (matrixError) redirectWithMessage(returnTo, "error", matrixError.message);

  const activeRows = (matrixRows ?? []) as Array<SiteOperationalRoleRow & {
    is_active?: boolean | null;
  }>;
  let selectedMatrixRow = activeRows.find(
    (row) =>
      row.role_code === roleContext.roleCode &&
      cleanOptionalText(row.area_id) === roleContext.areaId,
  );

  if (!selectedMatrixRow && roleContext.roleCode) {
    const roleRows = activeRows.filter(
      (row) => row.role_code === roleContext.roleCode,
    );
    selectedMatrixRow =
      roleRows.find((row) => row.is_default) ??
      (roleRows.length === 1 ? roleRows[0] : undefined);
  }

  if (!selectedMatrixRow) {
    redirectWithMessage(
      returnTo,
      "error",
      "Selecciona un rol operativo válido para la sede y el área.",
    );
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("employee_shifts")
    .select(
      "id,employee_id,shift_date,start_time,end_time,shift_kind,operational_role,show_end_as_close,break_minutes,status,notes,site_id,area_id,checkin_site_id,checkout_site_id,published_at",
    )
    .eq("employee_id", employeeId)
    .in("shift_date", selectedDates)
    .neq("status", "cancelled");

  if (existingError) redirectWithMessage(returnTo, "error", existingError.message);

  const conflict = ((existingRows ?? []) as ShiftRow[]).find((shift) => {
    if (shift.shift_kind === "descanso") return true;
    return startTime < shift.end_time && shift.start_time < endTime;
  });
  if (conflict) {
    redirectWithMessage(
      returnTo,
      "error",
      `Ya existe un turno o descanso que se cruza el ${conflict.shift_date} (${conflict.start_time.slice(0, 5)}–${conflict.end_time.slice(0, 5)}).`,
    );
  }

  const { data: profile } = await supabase
    .from("employee_site_operational_profiles")
    .select(
      "default_checkin_site_id,default_checkout_site_id,default_operational_role,is_active",
    )
    .eq("employee_id", employeeId)
    .eq("site_id", siteId)
    .eq("default_operational_role", selectedMatrixRow.role_code)
    .neq("is_active", false)
    .maybeSingle();

  const checkinSiteId = cleanOptionalText(profile?.default_checkin_site_id);
  const checkoutSiteId = cleanOptionalText(profile?.default_checkout_site_id);
  if (selectedMatrixRow.requires_external_checkin && !checkinSiteId) {
    redirectWithMessage(
      returnTo,
      "error",
      "El rol exige un punto externo de entrada y el trabajador no lo tiene configurado.",
    );
  }
  if (selectedMatrixRow.requires_external_checkout && !checkoutSiteId) {
    redirectWithMessage(
      returnTo,
      "error",
      "El rol exige un punto externo de salida y el trabajador no lo tiene configurado.",
    );
  }

  const payload = selectedDates.map((shiftDate) => ({
    employee_id: employeeId,
    site_id: siteId,
    area_id: selectedMatrixRow?.area_id ?? null,
    shift_date: shiftDate,
    start_time: startTime,
    end_time: endTime,
    shift_kind: "laboral",
    operational_role: selectedMatrixRow?.role_code ?? null,
    show_end_as_close: false,
    break_minutes: breakMinutes,
    status: "scheduled",
    notes: notes || null,
    checkin_site_id: checkinSiteId,
    checkout_site_id: checkoutSiteId,
    published_at: null,
    published_by: null,
  }));

  const { error: insertError } = await supabase
    .from("employee_shifts")
    .insert(payload);
  if (insertError) redirectWithMessage(returnTo, "error", insertError.message);

  const { data: monthRows, error: totalError } = await supabase
    .from("employee_shifts")
    .select(
      "id,employee_id,shift_date,start_time,end_time,shift_kind,operational_role,show_end_as_close,break_minutes,status,notes,site_id,area_id,checkin_site_id,checkout_site_id,published_at",
    )
    .eq("employee_id", employeeId)
    .gte("shift_date", monthStartIso)
    .lte("shift_date", monthEndIso)
    .neq("status", "cancelled");

  if (totalError) redirectWithMessage(returnTo, "error", totalError.message);

  const projectedMinutes = ((monthRows ?? []) as ShiftRow[]).reduce(
    (total, shift) => total + getShiftMinutes(shift),
    0,
  );

  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
  revalidatePath("/staff/schedule/month");

  const employeeName =
    employee.full_name ?? employee.alias ?? "El trabajador seleccionado";
  if (projectedMinutes > MONTHLY_SCHEDULE_LIMIT_MINUTES) {
    const excessMinutes = projectedMinutes - MONTHLY_SCHEDULE_LIMIT_MINUTES;
    redirectWithMessage(
      returnTo,
      "warning",
      `${employeeName} quedó con ${(projectedMinutes / 60).toFixed(1).replace(".", ",")} h. Excede el límite mensual por ${(excessMinutes / 60).toFixed(1).replace(".", ",")} h. Los turnos permanecen en borrador y no podrán publicarse hasta corregirlos.`,
    );
  }

  redirectWithMessage(
    returnTo,
    "ok",
    `${payload.length} ${payload.length === 1 ? "turno guardado" : "turnos guardados"} en borrador. Total proyectado: ${(projectedMinutes / 60).toFixed(1).replace(".", ",")} h de 186 h.`,
  );
}

export async function deleteMonthlyDraftShiftAction(formData: FormData) {
  const shiftId = asText(formData.get("shift_id"));
  const siteId = asText(formData.get("site_id"));
  const month = asText(formData.get("month"));
  const returnTo =
    asText(formData.get("return_to")) || buildMonthReturnTo(siteId, month);

  await requireStaffScheduleAccess(returnTo, siteId);
  if (!shiftId) redirectWithMessage(returnTo, "error", "Turno inválido.");

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("employee_shifts")
    .delete()
    .eq("id", shiftId)
    .eq("site_id", siteId)
    .is("published_at", null)
    .select("id")
    .maybeSingle();

  if (error) redirectWithMessage(returnTo, "error", error.message);
  if (!data) {
    redirectWithMessage(
      returnTo,
      "error",
      "El turno ya está publicado o no pertenece a esta sede. No se eliminó.",
    );
  }

  revalidatePath("/staff/schedule");
  revalidatePath("/staff/schedule/month");
  redirectWithMessage(returnTo, "ok", "Borrador eliminado.");
}

export async function deleteMonthlyDraftsAction(formData: FormData) {
  const siteId = asText(formData.get("site_id"));
  const month = asText(formData.get("month"));
  const returnTo =
    asText(formData.get("return_to")) || buildMonthReturnTo(siteId, month);

  await requireStaffScheduleAccess(returnTo, siteId);
  const monthDate = parseMonth(month);
  if (!siteId || !monthDate) {
    redirectWithMessage(returnTo, "error", "Mes o sede inválidos.");
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("employee_shifts")
    .delete()
    .eq("site_id", siteId)
    .gte("shift_date", isoDate(startOfMonth(monthDate)))
    .lte("shift_date", isoDate(endOfMonth(monthDate)))
    .is("published_at", null);

  if (error) redirectWithMessage(returnTo, "error", error.message);

  revalidatePath("/staff/schedule");
  revalidatePath("/staff/schedule/month");
  redirectWithMessage(returnTo, "ok", "Borradores del mes eliminados.");
}

export async function publishMonthAction(formData: FormData) {
  const siteId = asText(formData.get("site_id"));
  const month = asText(formData.get("month"));
  const returnTo =
    asText(formData.get("return_to")) || buildMonthReturnTo(siteId, month);

  const { user } = await requireStaffScheduleAccess(returnTo, siteId);
  const monthDate = parseMonth(month);
  if (!siteId || !monthDate) {
    redirectWithMessage(returnTo, "error", "Mes o sede inválidos.");
  }

  const monthStartIso = isoDate(startOfMonth(monthDate));
  const monthEndIso = isoDate(endOfMonth(monthDate));
  const supabase = createAdminClient();

  const { data: shiftRowsData, error: shiftsError } = await supabase
    .from("employee_shifts")
    .select(
      "id,employee_id,shift_date,start_time,end_time,shift_kind,operational_role,show_end_as_close,break_minutes,status,notes,site_id,area_id,checkin_site_id,checkout_site_id,published_at",
    )
    .eq("site_id", siteId)
    .gte("shift_date", monthStartIso)
    .lte("shift_date", monthEndIso);

  if (shiftsError) redirectWithMessage(returnTo, "error", shiftsError.message);

  const shifts = (shiftRowsData ?? []) as ShiftRow[];
  if (shifts.length === 0) {
    redirectWithMessage(returnTo, "error", "No hay turnos en este mes.");
  }

  const draftRows = shifts.filter((shift) => !shift.published_at);
  if (draftRows.length === 0) {
    redirectWithMessage(returnTo, "ok", "No hay borradores por publicar.");
  }

  const affectedEmployeeIds = [
    ...new Set(shifts.map((shift) => shift.employee_id)),
  ];
  const { data: allSiteMonthRows, error: allSiteMonthError } = await supabase
    .from("employee_shifts")
    .select(
      "id,employee_id,shift_date,start_time,end_time,shift_kind,operational_role,show_end_as_close,break_minutes,status,notes,site_id,area_id,checkin_site_id,checkout_site_id,published_at",
    )
    .in("employee_id", affectedEmployeeIds)
    .gte("shift_date", monthStartIso)
    .lte("shift_date", monthEndIso);

  if (allSiteMonthError) {
    redirectWithMessage(returnTo, "error", allSiteMonthError.message);
  }

  const totalsByEmployee = new Map<string, number>();
  for (const shift of (allSiteMonthRows ?? []) as ShiftRow[]) {
    if (shift.status === "cancelled") continue;
    totalsByEmployee.set(
      shift.employee_id,
      (totalsByEmployee.get(shift.employee_id) ?? 0) + getShiftMinutes(shift),
    );
  }

  const exceededIds = [...totalsByEmployee.entries()]
    .filter(([, minutes]) => minutes > MONTHLY_SCHEDULE_LIMIT_MINUTES)
    .map(([employeeId]) => employeeId);

  if (exceededIds.length > 0) {
    const { data: employees } = await supabase
      .from("employees")
      .select("id,full_name,alias")
      .in("id", exceededIds);
    const names = new Map(
      (employees ?? []).map((employee: { id: string; full_name: string | null; alias: string | null }) => [
        employee.id,
        employee.full_name ?? employee.alias ?? employee.id,
      ]),
    );
    const detail = exceededIds
      .map((employeeId) => {
        const minutes = totalsByEmployee.get(employeeId) ?? 0;
        const excess = minutes - MONTHLY_SCHEDULE_LIMIT_MINUTES;
        return `${names.get(employeeId) ?? employeeId}: ${(minutes / 60).toFixed(1).replace(".", ",")} h (+${(excess / 60).toFixed(1).replace(".", ",")} h)`;
      })
      .join("; ");

    redirectWithMessage(
      returnTo,
      "error",
      `No se puede publicar. Hay trabajadores por encima de 186 h: ${detail}.`,
    );
  }

  const publishedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("employee_shifts")
    .update({ published_at: publishedAt, published_by: user.id })
    .eq("site_id", siteId)
    .gte("shift_date", monthStartIso)
    .lte("shift_date", monthEndIso)
    .is("published_at", null);

  if (updateError) redirectWithMessage(returnTo, "error", updateError.message);

  const monthLabel = monthDate.toLocaleDateString("es-CO", {
    month: "long",
    year: "numeric",
  });
  await notifyShiftChange({
    employeeIds: [...new Set(draftRows.map((row) => row.employee_id))],
    title: "Tu horario mensual fue publicado",
    body: `Revisa tus turnos de ${monthLabel} en ANIMA.`,
    data: {
      siteId,
      month,
      action: "published_month",
      source: "viso_schedule_month_planner",
    },
  });

  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
  revalidatePath("/staff/schedule/month");
  redirectWithMessage(returnTo, "ok", "Mes publicado y notificado.");
}
