import { NextRequest, NextResponse } from "next/server";

import { checkPermission } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import {
  FULL_DAY_REST_END_TIME,
  FULL_DAY_REST_START_TIME,
  getShiftOperationalContext,
  loadShiftOperationalContextIndex,
  resolveContextSiteId,
  uniqueTextValues,
  withShiftOperationalContext,
  type SiteOperationalRoleRow,
} from "@/app/staff/schedule/helpers";

async function canManageSchedule(siteId?: string | null) {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return false;

  const context = { siteId: siteId ?? null };
  const canAccess = await checkPermission(supabase, "viso", "access", context);
  if (canAccess) return true;

  return checkPermission(supabase, "viso", "staff.schedule.view", context);
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function minutesFromTime(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
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

async function resolveOperationalRole(
  supabase: ReturnType<typeof createAdminClient>,
  employeeId: string,
  siteId: string,
  explicitRole: string,
) {
  const { data: matrixRowsData, error: matrixError } = await supabase
    .from("vento_site_operational_role_matrix_v1")
    .select(
      "site_id,area_id,area_name,area_kind,role_code,role_label,role_family,is_default,requires_external_checkin,requires_external_checkout,is_active",
    )
    .eq("site_id", siteId)
    .eq("is_active", true);

  if (matrixError) throw new Error(matrixError.message);

  const matrixRows = (matrixRowsData ?? []) as SiteOperationalRoleRow[];
  const roleCode =
    explicitRole ||
    matrixRows.find((row) => row.is_default)?.role_code ||
    (uniqueTextValues(matrixRows.map((row) => row.role_code)).length === 1
      ? (uniqueTextValues(matrixRows.map((row) => row.role_code))[0] ?? "")
      : "");

  if (!roleCode) {
    throw new Error("Selecciona el rol operativo desde el planner completo.");
  }

  const roleRows = matrixRows.filter((row) => row.role_code === roleCode);
  const selectedRole =
    roleRows.find((row) => row.is_default) ??
    (roleRows.length === 1 ? (roleRows[0] ?? null) : null) ??
    (() => {
      const uniqueAreaIds = uniqueTextValues(roleRows.map((row) => row.area_id));
      return uniqueAreaIds.length === 1
        ? (roleRows.find((row) => row.area_id === uniqueAreaIds[0]) ?? null)
        : null;
    })();

  if (!selectedRole) {
    throw new Error("Ese rol no tiene un área única. Usa el planner completo.");
  }

  const operationalContextIndex = await loadShiftOperationalContextIndex(
    supabase,
    [{ employeeId, siteId, operationalRole: roleCode }],
  );
  const profileContext = getShiftOperationalContext(
    operationalContextIndex,
    employeeId,
    siteId,
    roleCode,
  );
  const checkinSiteId = resolveContextSiteId(null, profileContext?.checkinSiteId);
  const checkoutSiteId = resolveContextSiteId(
    null,
    profileContext?.checkoutSiteId,
  );

  if (
    (selectedRole.requires_external_checkin && !checkinSiteId) ||
    (selectedRole.requires_external_checkout && !checkoutSiteId)
  ) {
    throw new Error(
      "Este rol exige punto de entrada/salida. Usa el planner completo.",
    );
  }

  return { roleCode, selectedRole, profileContext };
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    employeeId?: unknown;
    siteId?: unknown;
    shiftDate?: unknown;
    shiftId?: unknown;
    startTime?: unknown;
    endTime?: unknown;
    operationalRole?: unknown;
  } | null;

  const action = text(body?.action);
  const employeeId = text(body?.employeeId);
  const siteId = text(body?.siteId);
  const shiftDate = text(body?.shiftDate);
  const shiftId = text(body?.shiftId);
  const startTime = text(body?.startTime);
  const endTime = text(body?.endTime);
  const operationalRole = text(body?.operationalRole);

  if (action !== "rest" && action !== "labor") {
    return jsonError("Acción inválida.", 400);
  }
  if (!employeeId || !siteId || !shiftDate) {
    return jsonError("Completa trabajador, sede y fecha.", 400);
  }
  if (!(await canManageSchedule(siteId))) {
    return jsonError("Sin permisos para modificar horarios.", 403);
  }

  const supabase = createAdminClient();
  if (action === "labor") {
    if (!startTime || !endTime || endTime <= startTime) {
      return jsonError("La hora de fin debe ser posterior a la inicial.", 400);
    }

    const { data: employeeRows, error: employeeError } = await supabase
      .from("employees")
      .select("id,site_id,is_active")
      .eq("id", employeeId)
      .eq("is_active", true);
    if (employeeError) return jsonError(employeeError.message, 500);
    const employee = employeeRows?.[0];
    if (!employee) return jsonError("Trabajador inválido.", 400);

    if (employee.site_id !== siteId) {
      const { data: linkedRows, error: linkedError } = await supabase
        .from("employee_sites")
        .select("employee_id")
        .eq("employee_id", employeeId)
        .eq("site_id", siteId)
        .eq("is_active", true)
        .limit(1);
      if (linkedError) return jsonError(linkedError.message, 500);
      if ((linkedRows ?? []).length === 0) {
        return jsonError("Ese trabajador no está vinculado a la sede.", 400);
      }
    }

    let overlapQuery = supabase
      .from("employee_shifts")
      .select("id, start_time, end_time")
      .eq("employee_id", employeeId)
      .eq("shift_date", shiftDate)
      .neq("shift_kind", "descanso")
      .neq("status", "cancelled");
    if (shiftId) overlapQuery = overlapQuery.neq("id", shiftId);
    const { data: sameDayShifts, error: overlapError } = await overlapQuery;
    if (overlapError) return jsonError(overlapError.message, 500);
    const overlaps = (sameDayShifts ?? []).some(
      (shift) =>
        minutesFromTime(startTime) < minutesFromTime(shift.end_time) &&
        minutesFromTime(shift.start_time) < minutesFromTime(endTime),
    );
    if (overlaps) {
      return jsonError("Ese trabajador ya tiene un turno que se solapa.", 409);
    }

    const { data: restConflicts, error: restConflictError } = await supabase
      .from("employee_shifts")
      .select("id")
      .eq("employee_id", employeeId)
      .eq("shift_date", shiftDate)
      .eq("shift_kind", "descanso")
      .neq("status", "cancelled")
      .limit(1);
    if (restConflictError) return jsonError(restConflictError.message, 500);
    if ((restConflicts ?? []).length > 0) {
      return jsonError("Ese trabajador tiene descanso ese día.", 409);
    }

    try {
      const resolved = await resolveOperationalRole(
        supabase,
        employeeId,
        siteId,
        operationalRole,
      );
      const payload = withShiftOperationalContext(
        {
          employee_id: employeeId,
          site_id: siteId,
          area_id: resolved.selectedRole.area_id ?? null,
          shift_date: shiftDate,
          start_time: startTime,
          end_time: endTime,
          shift_kind: "laboral",
          operational_role: resolved.roleCode,
          show_end_as_close: false,
          break_minutes: 0,
          status: "scheduled",
          notes: null,
          published_at: null,
          published_by: null,
        },
        resolved.profileContext,
        "laboral",
        { checkinSiteId: null, checkoutSiteId: null },
      );

      const query = shiftId
        ? supabase
            .from("employee_shifts")
            .update(payload)
            .eq("id", shiftId)
            .is("published_at", null)
        : supabase.from("employee_shifts").insert(payload);
      const { data: savedRows, error } = await query
        .select(
          "id,employee_id,shift_date,start_time,end_time,shift_kind,show_end_as_close,status,site_id,published_at",
        )
        .limit(1);
      if (error) return jsonError(error.message, 500);
      const shift = savedRows?.[0];
      if (!shift) return jsonError("No se pudo guardar el turno.", 500);

      return NextResponse.json({
        ok: true,
        shift,
        label: `${compactTime(shift.start_time)} a ${compactTime(shift.end_time)}`,
      });
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : "No se pudo guardar el turno.",
        400,
      );
    }
  }

  const { data: conflicts, error: conflictError } = await supabase
    .from("employee_shifts")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("shift_date", shiftDate)
    .neq("status", "cancelled")
    .limit(1);

  if (conflictError) return jsonError(conflictError.message, 500);
  if ((conflicts ?? []).length > 0) {
    return jsonError(
      "Ese trabajador ya tiene turnos ese día. Elimina o ajusta esos turnos primero.",
      409,
    );
  }

  const { data: inserted, error } = await supabase
    .from("employee_shifts")
    .insert({
      employee_id: employeeId,
      site_id: siteId,
      shift_date: shiftDate,
      start_time: FULL_DAY_REST_START_TIME,
      end_time: FULL_DAY_REST_END_TIME,
      shift_kind: "descanso",
      operational_role: null,
      show_end_as_close: false,
      break_minutes: 0,
      status: "scheduled",
      notes: null,
      published_at: null,
      published_by: null,
    })
    .select(
      "id,employee_id,shift_date,start_time,end_time,shift_kind,show_end_as_close,status,site_id,published_at",
    )
    .single();

  if (error || !inserted) {
    return jsonError(error?.message ?? "No se pudo guardar el descanso.", 500);
  }

  return NextResponse.json({ ok: true, shift: inserted });
}

export async function DELETE(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    shiftId?: unknown;
    siteId?: unknown;
  } | null;

  const shiftId = text(body?.shiftId);
  const siteId = text(body?.siteId);

  if (!shiftId) return jsonError("Turno inválido.", 400);
  if (!(await canManageSchedule(siteId || null))) {
    return jsonError("Sin permisos para modificar horarios.", 403);
  }

  const supabase = createAdminClient();
  const { data: shift, error: readError } = await supabase
    .from("employee_shifts")
    .select("id,employee_id,shift_date,site_id,published_at")
    .eq("id", shiftId)
    .maybeSingle();

  if (readError) return jsonError(readError.message, 500);
  if (!shift) return jsonError("Turno no encontrado.", 404);
  if (shift.published_at) {
    return jsonError("Solo se pueden eliminar turnos en borrador.", 409);
  }
  if (!(await canManageSchedule(shift.site_id))) {
    return jsonError("Sin permisos para modificar esta sede.", 403);
  }

  const { error } = await supabase
    .from("employee_shifts")
    .delete()
    .eq("id", shiftId)
    .is("published_at", null);

  if (error) return jsonError(error.message, 500);

  return NextResponse.json({ ok: true, shift });
}
