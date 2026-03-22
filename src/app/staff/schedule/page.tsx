import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { PageHeader } from "@/components/vento/standard/page-header";
import { WeeklySchedulePlanner } from "@/components/viso/weekly-schedule-planner";
import { notifyShiftChange } from "@/lib/anima/shift-notify";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type SiteRow = {
  id: string;
  name: string | null;
  code: string | null;
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
  break_minutes: number | null;
  status: string;
  notes: string | null;
  site_id: string;
  published_at: string | null;
};

type EmployeeTotals = {
  weekMinutes: number;
  fortnightMinutes: number;
  monthMinutes: number;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: FormDataEntryValue | null, fallback = 0) {
  if (typeof value !== "string" || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
  const start = new Date(date.getFullYear(), date.getMonth(), day <= 15 ? 1 : 16, 12, 0, 0, 0);
  const end = new Date(
    date.getFullYear(),
    date.getMonth(),
    day <= 15 ? 15 : new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate(),
    12,
    0,
    0,
    0,
  );
  return { start, end };
}

function getShiftMinutes(shift: Pick<ShiftRow, "start_time" | "end_time" | "break_minutes">) {
  const [startHours, startMinutes] = shift.start_time.slice(0, 5).split(":").map(Number);
  const [endHours, endMinutes] = shift.end_time.slice(0, 5).split(":").map(Number);
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

function formatShiftRange(startTime: string, endTime: string) {
  return `${startTime.slice(0, 5)} - ${endTime.slice(0, 5)}`;
}

function formatHoursCompact(totalMinutes: number) {
  const safe = Math.max(0, Math.round(totalMinutes));
  const hours = safe / 60;
  if (Number.isInteger(hours)) return `${hours}h`;
  return `${hours.toFixed(1).replace(".", ",")}h`;
}

function getShiftStatusLabel(status: string) {
  switch (status) {
    case "confirmed":
      return "Confirmado";
    case "completed":
      return "Completado";
    case "cancelled":
      return "Cancelado";
    case "no_show":
      return "No asistió";
    case "scheduled":
    default:
      return "Programado";
  }
}

type AreaVisual = {
  label: string;
  chipClass: string;
  rowClass: string;
  shiftClass: string;
};

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
  if (view && (view === "table" || view === "planner")) query.set("view", view);
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
  return Array.isArray(row) ? row[0] ?? null : row;
}

async function saveShiftAction(formData: FormData) {
  "use server";
  const shiftId = asText(formData.get("shift_id"));
  const employeeId = asText(formData.get("employee_id"));
  const employeeIds = [...new Set(
    formData
      .getAll("employee_ids")
      .map((value) => asText(value))
      .filter(Boolean),
  )];
  const siteId = asText(formData.get("site_id"));
  const shiftDate = asText(formData.get("shift_date"));
  const startTime = asText(formData.get("start_time"));
  const endTime = asText(formData.get("end_time"));
  const returnTo = asText(formData.get("return_to")) || "/staff/schedule";
  const keepSlot = asText(formData.get("keep_slot")) === "1";
  const slotDay = asText(formData.get("slot_day")) || shiftDate;
  const slotStart = asText(formData.get("slot_start")) || startTime;
  const slotEnd = asText(formData.get("slot_end")) || endTime;
  const requestedEmployeeIds =
    employeeIds.length > 0 ? employeeIds : employeeId ? [employeeId] : [];

  await requireAppAccess({
    appId: "viso",
    returnTo,
  });
  const supabase = createAdminClient();

  if (requestedEmployeeIds.length === 0 || !siteId || !shiftDate || !startTime || !endTime) {
    redirect(`${returnTo}&error=${encodeURIComponent("Completa trabajador, fecha y horario.")}`);
  }

  if (shiftId && requestedEmployeeIds.length !== 1) {
    redirect(`${returnTo}&error=${encodeURIComponent("La edición solo admite un trabajador por turno.")}`);
  }

  if (endTime <= startTime) {
    redirect(`${returnTo}&error=${encodeURIComponent("La hora de fin debe ser posterior a la hora de inicio.")}`);
  }

  // Validar solapamiento: mismo empleado, misma fecha, rangos que se cruzan
  let overlapQuery = supabase
    .from("employee_shifts")
    .select("id, employee_id, start_time, end_time")
    .in("employee_id", requestedEmployeeIds)
    .eq("shift_date", shiftDate);
  if (shiftId) {
    overlapQuery = overlapQuery.neq("id", shiftId);
  }
  const { data: sameDayShifts, error: overlapErr } = await overlapQuery;
  if (overlapErr) {
    redirect(`${returnTo}&error=${encodeURIComponent(overlapErr.message)}`);
  }
  const overlaps = (sameDayShifts ?? []).filter(
    (s: { employee_id: string; start_time: string; end_time: string }) =>
      startTime < s.end_time && s.start_time < endTime,
  );
  if (overlaps.length > 0) {
    const conflictingIds = [...new Set(overlaps.map((shift) => shift.employee_id))];
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
        return `${conflictNames.get(id) ?? id} (${conflict.start_time.slice(0, 5)} - ${conflict.end_time.slice(0, 5)})`;
      })
      .join(", ");
    redirect(
      `${returnTo}&error=${encodeURIComponent(
        `Algunos trabajadores ya tienen un turno que se solapa: ${summary}. Ajusta el horario o quítalos de la selección.`,
      )}`,
    );
  }

  const basePayload = {
    site_id: siteId,
    shift_date: shiftDate,
    start_time: startTime,
    end_time: endTime,
    break_minutes: Math.max(0, asNumber(formData.get("break_minutes"), 0)),
    status: asText(formData.get("status")) || "scheduled",
    notes: asText(formData.get("notes")) || null,
    published_at: null,
    published_by: null,
  };

  const query = shiftId
    ? supabase
        .from("employee_shifts")
        .update({ ...basePayload, employee_id: requestedEmployeeIds[0] })
        .eq("id", shiftId)
    : supabase.from("employee_shifts").insert(
        requestedEmployeeIds.map((id) => ({
          ...basePayload,
          employee_id: id,
        })),
      );

  const { error } = await query;
  if (error) {
    redirect(`${returnTo}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
  const successCode = shiftId
    ? "turno_actualizado_borrador"
    : requestedEmployeeIds.length > 1
      ? "turnos_creados_borrador"
      : "turno_creado_borrador";
  const nextReturnTo =
    !shiftId && keepSlot
      ? appendReturnParams(returnTo, {
          slot_keep: "1",
          slot_day: slotDay,
          slot_start: slotStart,
          slot_end: slotEnd,
        })
      : appendReturnParams(returnTo, {
          slot_keep: null,
          slot_day: null,
          slot_start: null,
          slot_end: null,
        });
  redirect(`${nextReturnTo}&ok=${encodeURIComponent(successCode)}`);
}

async function deleteShiftAction(formData: FormData) {
  "use server";
  const shiftId = asText(formData.get("shift_id"));
  const returnTo = asText(formData.get("return_to")) || "/staff/schedule";

  await requireAppAccess({
    appId: "viso",
    returnTo,
  });
  const supabase = createAdminClient();

  if (!shiftId) {
    redirect(`${returnTo}&error=${encodeURIComponent("Turno invalido.")}`);
  }

  const { error } = await supabase.from("employee_shifts").delete().eq("id", shiftId);
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

  await requireAppAccess({
    appId: "viso",
    returnTo,
  });
  const supabase = createAdminClient();

  if (shiftIds.length === 0) {
    redirect(`${returnTo}&error=${encodeURIComponent("Selecciona al menos un turno para eliminar.")}`);
  }

  const { error } = await supabase.from("employee_shifts").delete().in("id", shiftIds);
  if (error) {
    redirect(`${returnTo}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
  redirect(`${returnTo}&ok=${encodeURIComponent("turnos_eliminados")}`);
}

async function assignManyShiftAction(formData: FormData) {
  "use server";
  const sourceShiftIds = formData
    .getAll("shift_ids")
    .map((value) => asText(value))
    .filter(Boolean);
  const targetEmployeeIds = [...new Set(
    formData
      .getAll("employee_ids")
      .map((value) => asText(value))
      .filter(Boolean),
  )];
  const returnTo = asText(formData.get("return_to")) || "/staff/schedule";

  await requireAppAccess({
    appId: "viso",
    returnTo,
  });
  const supabase = createAdminClient();

  if (sourceShiftIds.length === 0 || targetEmployeeIds.length === 0) {
    redirect(`${returnTo}&error=${encodeURIComponent("Selecciona bloques y trabajadores para aplicar la edición masiva.")}`);
  }

  const { data: sourceShifts, error: sourceError } = await supabase
    .from("employee_shifts")
    .select("id,employee_id,shift_date,start_time,end_time,break_minutes,status,notes,site_id,published_at")
    .in("id", sourceShiftIds);

  if (sourceError) {
    redirect(`${returnTo}&error=${encodeURIComponent(sourceError.message)}`);
  }

  const shiftRows = (sourceShifts ?? []) as ShiftRow[];
  if (shiftRows.length === 0) {
    redirect(`${returnTo}&error=${encodeURIComponent("No se encontraron los bloques seleccionados.")}`);
  }

  const requestedRanges = shiftRows.map((shift) => ({
    shift_date: shift.shift_date,
    start_time: shift.start_time,
    end_time: shift.end_time,
  }));
  const requestedDates = [...new Set(requestedRanges.map((item) => item.shift_date))];

  const { data: existingShifts, error: existingError } = await supabase
    .from("employee_shifts")
    .select("employee_id,shift_date,start_time,end_time")
    .in("employee_id", targetEmployeeIds)
    .in("shift_date", requestedDates);

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
    const conflictingIds = [...new Set(overlaps.map((shift) => shift.employee_id))];
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
      (shift) => `${shift.employee_id}|${shift.shift_date}|${shift.start_time}|${shift.end_time}`,
    ),
  );

  const payload = targetEmployeeIds.flatMap((employeeId) =>
    shiftRows
      .filter((shift) => shift.employee_id !== employeeId)
      .filter(
        (shift) =>
          !existingExact.has(`${employeeId}|${shift.shift_date}|${shift.start_time}|${shift.end_time}`),
      )
      .map((shift) => ({
        employee_id: employeeId,
        site_id: shift.site_id,
        shift_date: shift.shift_date,
        start_time: shift.start_time,
        end_time: shift.end_time,
        break_minutes: shift.break_minutes ?? 0,
        status: shift.status || "scheduled",
        notes: shift.notes ?? null,
        published_at: null,
        published_by: null,
      })),
  );

  if (payload.length === 0) {
    redirect(`${returnTo}&error=${encodeURIComponent("No hubo nuevos turnos por crear para los trabajadores seleccionados.")}`);
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

  await requireAppAccess({
    appId: "viso",
    returnTo,
  });
  const supabase = createAdminClient();

  if (!siteId || !weekStartIso) {
    redirect(`${returnTo}&error=${encodeURIComponent("Faltan datos para copiar la semana.")}`);
  }

  const weekStart = parseWeekStart(weekStartIso);
  const prevStart = addDays(weekStart, -7);
  const prevEnd = addDays(prevStart, 6);

  const { data: previousRows, error: previousError } = await supabase
    .from("employee_shifts")
    .select("employee_id,site_id,shift_date,start_time,end_time,break_minutes,status,notes")
    .eq("site_id", siteId)
    .gte("shift_date", isoDate(prevStart))
    .lte("shift_date", isoDate(prevEnd));

  if (previousError) {
    redirect(`${returnTo}&error=${encodeURIComponent(previousError.message)}`);
  }

  const rows = (previousRows ?? []) as Array<{
    employee_id: string;
    site_id: string;
    shift_date: string;
    start_time: string;
    end_time: string;
    break_minutes: number | null;
    status: string;
    notes: string | null;
  }>;

  if (rows.length === 0) {
    redirect(`${returnTo}&error=${encodeURIComponent("No hay turnos en la semana anterior para copiar.")}`);
  }

  const nextRows = rows.map((row) => {
    const baseDate = new Date(`${row.shift_date}T12:00:00`);
    baseDate.setDate(baseDate.getDate() + 7);
    return {
      ...row,
      shift_date: isoDate(baseDate),
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
      (v): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()),
    )
    .filter((iso) => iso !== sourceDayIso);

  await requireAppAccess({
    appId: "viso",
    returnTo,
  });
  const supabase = createAdminClient();

  if (!siteId || !sourceDayIso || !employeeId || targetDays.length === 0) {
    redirect(`${returnTo}&error=${encodeURIComponent("Elige el día, la persona y al menos un día destino.")}`);
  }

  let query = supabase
    .from("employee_shifts")
    .select("employee_id,site_id,start_time,end_time,break_minutes,status,notes")
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
    start_time: string;
    end_time: string;
    break_minutes: number | null;
    status: string;
    notes: string | null;
  }>;

  if (rows.length === 0) {
    redirect(`${returnTo}&error=${encodeURIComponent("Ese día no tiene turnos de esa persona para copiar.")}`);
  }

  const toInsert = targetDays.flatMap((shiftDate) =>
    rows.map((row) => ({
      employee_id: row.employee_id,
      site_id: row.site_id,
      shift_date: shiftDate,
      start_time: row.start_time,
      end_time: row.end_time,
      break_minutes: row.break_minutes,
      status: row.status,
      notes: row.notes,
      published_at: null,
      published_by: null,
    })),
  );

  // Evitar solapamientos: por cada día destino, comprobar que ni los existentes ni los nuevos se crucen
  for (const shiftDate of targetDays) {
    const { data: existingRows } = await supabase
      .from("employee_shifts")
      .select("start_time, end_time")
      .eq("employee_id", employeeId)
      .eq("shift_date", shiftDate);
    const ranges = [
      ...((existingRows ?? []) as Array<{ start_time: string; end_time: string }>),
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
  redirect(`${returnTo}&ok=${encodeURIComponent("Día aplicado a los días seleccionados.")}`);
}

async function publishWeekAction(formData: FormData) {
  "use server";
  const siteId = asText(formData.get("site_id"));
  const weekStartIso = asText(formData.get("week_start"));
  const returnTo = asText(formData.get("return_to")) || "/staff/schedule";

  const { user } = await requireAppAccess({
    appId: "viso",
    returnTo,
  });
  const supabase = createAdminClient();

  if (!siteId || !weekStartIso) {
    redirect(`${returnTo}&error=${encodeURIComponent("Faltan datos para publicar la semana.")}`);
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
    redirect(`${returnTo}&error=${encodeURIComponent("No hay turnos en esta semana para publicar.")}`);
  }
  if (draftRows.length === 0) {
    redirect(`${returnTo}&ok=${encodeURIComponent("sin_borradores_por_publicar")}`);
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
    case "turnos_asignados_masivo":
      return "Bloques copiados a los trabajadores seleccionados.";
    case "sin_borradores_por_publicar":
      return "No había borradores por publicar en esta semana.";
    case "semana_publicada":
      return "Semana publicada y notificada a los trabajadores con turnos en borrador.";
    case "semana_copiada_borrador":
      return "Semana anterior copiada en borrador.";
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
    ok?: string;
    error?: string;
    slot_keep?: string;
    slot_day?: string;
    slot_start?: string;
    slot_end?: string;
  }>;
}) {
  const sp = (await searchParams) ?? {};
  const okMsg = getOkMessage(safeDecode(sp.ok));
  const errorMsg = safeDecode(sp.error);

  await requireAppAccess({
    appId: "viso",
    returnTo: "/staff/schedule",
  });
  const supabase = createAdminClient();

  const { data: sitesData } = await supabase
    .from("sites")
    .select("id,name,code")
    .order("name", { ascending: true });

  const sites = (sitesData ?? []) as SiteRow[];
  const selectedSiteId = sp.site_id && sites.some((site) => site.id === sp.site_id)
    ? String(sp.site_id)
    : sites[0]?.id ?? "";

  const weekStart = parseWeekStart(sp.week);
  const weekStartIso = isoDate(weekStart);
  const weekEndIso = isoDate(addDays(weekStart, 6));
  const viewMode = sp.view === "planner" ? "planner" : "table";
  const monthStartIso = isoDate(startOfMonth(weekStart));
  const monthEndIso = isoDate(endOfMonth(weekStart));
  const fortnightRange = getFortnightRange(weekStart);
  const fortnightStartIso = isoDate(fortnightRange.start);
  const fortnightEndIso = isoDate(fortnightRange.end);
  const returnTo = buildReturnTo(selectedSiteId, weekStartIso, viewMode);

  const [directEmployeesRes, linkedEmployeesRes, shiftsRes] = await Promise.all([
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
          .select("employee_id,is_active,employee:employees(id,full_name,alias,role,is_active,site_id)")
          .eq("site_id", selectedSiteId)
          .eq("is_active", true)
      : Promise.resolve({ data: [], error: null }),
    selectedSiteId
      ? supabase
          .from("employee_shifts")
          .select("id,employee_id,shift_date,start_time,end_time,break_minutes,status,notes,site_id,published_at")
          .eq("site_id", selectedSiteId)
          .gte("shift_date", weekStartIso)
          .lte("shift_date", weekEndIso)
          .order("shift_date", { ascending: true })
          .order("start_time", { ascending: true })
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
    (a.full_name ?? a.alias ?? a.id).localeCompare(b.full_name ?? b.alias ?? b.id, "es"),
  );
  const employeeIds = employees.map((employee) => employee.id);

  const totalsByEmployee: Record<string, EmployeeTotals> = {};
  if (employeeIds.length > 0) {
    const { data: monthShiftRows } = await supabase
      .from("employee_shifts")
      .select("id,employee_id,shift_date,start_time,end_time,break_minutes,status,notes,site_id")
      .in("employee_id", employeeIds)
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
      if (shift.shift_date >= fortnightStartIso && shift.shift_date <= fortnightEndIso) {
        totals.fortnightMinutes += minutes;
      }
    }
  }

  const weekDays = buildWeekDays(weekStart);
  const weekShifts = (shiftsRes.data ?? []) as ShiftRow[];
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
  const prevWeekHref = buildReturnTo(selectedSiteId, isoDate(addDays(weekStart, -7)), viewMode);
  const nextWeekHref = buildReturnTo(selectedSiteId, isoDate(addDays(weekStart, 7)), viewMode);
  const currentWeekHref = buildReturnTo(selectedSiteId, isoDate(toMonday(new Date())), viewMode);
  const initialSlot =
    sp.slot_keep === "1" && sp.slot_day && sp.slot_start && sp.slot_end
      ? {
          dayIso: safeDecode(sp.slot_day),
          startTime: safeDecode(sp.slot_start),
          endTime: safeDecode(sp.slot_end),
        }
      : null;

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

      <div className="ui-panel space-y-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px_220px_auto]">
          <div>
            <div className="ui-caption">Sede actual</div>
            <div className="mt-1 text-lg font-semibold text-[var(--ui-text)]">
              {selectedSite?.name ?? selectedSite?.code ?? "Sin sede"}
            </div>
            {selectedSiteId ? (
              <p className="mt-1 text-sm text-[var(--ui-muted)]">
                Solo se muestran trabajadores y turnos de esta sede. Cambia la sede abajo si necesitas otra.
              </p>
            ) : null}
          </div>

          <form method="get" className="space-y-2">
            <label className="ui-label">Cambiar sede</label>
            <div className="flex gap-2">
              <select name="site_id" className="ui-input" defaultValue={selectedSiteId}>
                {sites.map((site) => (
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

          <div>
            <div className="ui-caption">Semana visible</div>
            <div className="mt-1 text-lg font-semibold text-[var(--ui-text)]">{formatWeekLabel(weekStart)}</div>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="mr-1 flex items-center gap-1 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1">
              <Link
                href={buildReturnTo(selectedSiteId, weekStartIso, "table")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  viewMode === "table"
                    ? "bg-[var(--ui-brand)] text-white"
                    : "text-[var(--ui-muted)] hover:bg-[var(--ui-surface-2)]"
                }`}
              >
                Tabla semanal
              </Link>
              <Link
                href={buildReturnTo(selectedSiteId, weekStartIso, "planner")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  viewMode === "planner"
                    ? "bg-[var(--ui-brand)] text-white"
                    : "text-[var(--ui-muted)] hover:bg-[var(--ui-surface-2)]"
                }`}
              >
                Planner
              </Link>
            </div>
            <Link href={prevWeekHref} className="ui-btn ui-btn--ghost">
              Semana anterior
            </Link>
            <Link href={currentWeekHref} className="ui-btn ui-btn--ghost">
              Esta semana
            </Link>
            <Link href={nextWeekHref} className="ui-btn ui-btn--ghost">
              Semana siguiente
            </Link>
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

      {!selectedSiteId ? (
        <div className="ui-panel">
          <div className="ui-empty">No hay sedes disponibles para planificar.</div>
        </div>
      ) : employees.length === 0 ? (
        <div className="ui-panel">
          <div className="ui-empty">
            <p className="font-semibold text-[var(--ui-text)]">
              No hay trabajadores en {selectedSite?.name ?? selectedSite?.code ?? "esta sede"}.
            </p>
            <p className="mt-2 text-sm text-[var(--ui-muted)]">
              Ve a &quot;Ver trabajadores&quot; o &quot;Invitar trabajador&quot; para asignar gente a la sede y luego planificar turnos aquí.
            </p>
          </div>
        </div>
      ) : (
        viewMode === "table" ? (
          <div className="space-y-3">
            <div className="ui-panel p-0 overflow-hidden">
              <div className="overflow-auto ui-scrollbar-subtle">
                <table className="min-w-[1320px] w-full border-collapse text-sm">
                  <thead className="bg-[var(--ui-surface-2)] text-xs uppercase tracking-wide text-[var(--ui-muted)]">
                    <tr>
                      <th className="border-b border-r border-[var(--ui-border)] px-3 py-3 text-left">Área</th>
                      <th className="border-b border-r border-[var(--ui-border)] px-3 py-3 text-left">Trabajador</th>
                      <th className="border-b border-r border-[var(--ui-border)] px-3 py-3 text-left">Rol</th>
                      {weekDays.map((day) => (
                        <th key={day.iso} className="border-b border-r border-[var(--ui-border)] px-3 py-3 text-left">
                          <div>{day.label}</div>
                          <div className="mt-0.5 text-[11px] normal-case tracking-normal">{day.shortLabel}</div>
                        </th>
                      ))}
                      <th className="border-b border-[var(--ui-border)] px-3 py-3 text-left">Total semana</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((employee) => {
                      const employeeName = employee.full_name ?? employee.alias ?? employee.id;
                      const weekMinutes = totalsByEmployee[employee.id]?.weekMinutes ?? 0;
                      const areaVisual = getAreaVisualFromRole(employee.role);
                      return (
                        <tr key={employee.id} className={`align-top ${areaVisual.rowClass}`}>
                          <td className="border-b border-r border-[var(--ui-border)] px-3 py-2.5">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${areaVisual.chipClass}`}>
                              {areaVisual.label}
                            </span>
                          </td>
                          <td className="border-b border-r border-[var(--ui-border)] px-3 py-2.5 font-semibold text-[var(--ui-text)]">
                            {employeeName}
                          </td>
                          <td className="border-b border-r border-[var(--ui-border)] px-3 py-2.5 text-[var(--ui-muted)]">
                            {employee.role ?? "Sin rol"}
                          </td>
                          {weekDays.map((day) => {
                            const dayRows = shiftsByEmployeeDay.get(`${employee.id}__${day.iso}`) ?? [];
                            return (
                              <td key={`${employee.id}-${day.iso}`} className="border-b border-r border-[var(--ui-border)] px-2.5 py-2 align-top">
                                {dayRows.length === 0 ? (
                                  <span className="text-xs text-[var(--ui-muted)]">—</span>
                                ) : (
                                  <div className="space-y-1.5">
                                    {dayRows.map((shift) => (
                                      <div
                                        key={shift.id}
                                        className={`rounded-lg border px-2 py-1.5 ${areaVisual.shiftClass} ${
                                          shift.published_at ? "ring-1 ring-emerald-300/70" : "ring-1 ring-amber-300/70"
                                        }`}
                                        title={shift.notes ?? ""}
                                      >
                                        <div className="text-xs font-semibold text-[var(--ui-text)]">
                                          {formatShiftRange(shift.start_time, shift.end_time)}
                                        </div>
                                        <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-[var(--ui-muted)]">
                                          <span>{getShiftStatusLabel(shift.status)}</span>
                                          <span>{formatHoursCompact(getShiftMinutes(shift))}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                          <td className="border-b border-[var(--ui-border)] px-3 py-2.5">
                            <span className="inline-flex rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-2.5 py-1 text-xs font-semibold text-[var(--ui-text)]">
                              {formatHoursCompact(weekMinutes)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-xs text-[var(--ui-muted)]">
              Vista tabla para planear rápido equipos grandes. Usa la vista <strong>Planner</strong> para edición detallada por bloque.
            </p>
          </div>
        ) : (
          <WeeklySchedulePlanner
            employees={employees}
            shifts={weekShifts}
            days={weekDays}
            siteId={selectedSiteId}
            returnTo={returnTo}
            initialSlot={initialSlot}
            totalsByEmployee={totalsByEmployee}
            saveAction={saveShiftAction}
            deleteAction={deleteShiftAction}
            deleteManyAction={deleteManyShiftAction}
            assignManyAction={assignManyShiftAction}
            copyPreviousWeekAction={copyPreviousWeekAction}
            copyDayToOtherDaysAction={copyDayToOtherDaysAction}
            publishWeekAction={publishWeekAction}
          />
        )
      )}
    </div>
  );
}
