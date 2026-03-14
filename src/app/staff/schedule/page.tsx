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

function buildReturnTo(siteId: string, weekStartIso: string) {
  const query = new URLSearchParams();
  if (siteId) query.set("site_id", siteId);
  if (weekStartIso) query.set("week", weekStartIso);
  return `/staff/schedule?${query.toString()}`;
}

function getEmployeeRef(row: EmployeeSiteLink["employee"]) {
  if (!row) return null;
  return Array.isArray(row) ? row[0] ?? null : row;
}

async function saveShiftAction(formData: FormData) {
  "use server";
  const shiftId = asText(formData.get("shift_id"));
  const employeeId = asText(formData.get("employee_id"));
  const siteId = asText(formData.get("site_id"));
  const shiftDate = asText(formData.get("shift_date"));
  const startTime = asText(formData.get("start_time"));
  const endTime = asText(formData.get("end_time"));
  const returnTo = asText(formData.get("return_to")) || "/staff/schedule";

  await requireAppAccess({
    appId: "viso",
    returnTo,
  });
  const supabase = createAdminClient();

  if (!employeeId || !siteId || !shiftDate || !startTime || !endTime) {
    redirect(`${returnTo}&error=${encodeURIComponent("Completa trabajador, fecha y horario.")}`);
  }

  if (endTime <= startTime) {
    redirect(`${returnTo}&error=${encodeURIComponent("La hora de fin debe ser posterior a la hora de inicio.")}`);
  }

  // Validar solapamiento: mismo empleado, misma fecha, rangos que se cruzan
  let overlapQuery = supabase
    .from("employee_shifts")
    .select("id, start_time, end_time")
    .eq("employee_id", employeeId)
    .eq("shift_date", shiftDate);
  if (shiftId) {
    overlapQuery = overlapQuery.neq("id", shiftId);
  }
  const { data: sameDayShifts, error: overlapErr } = await overlapQuery;
  if (overlapErr) {
    redirect(`${returnTo}&error=${encodeURIComponent(overlapErr.message)}`);
  }
  const overlaps = (sameDayShifts ?? []).filter(
    (s: { start_time: string; end_time: string }) =>
      startTime < s.end_time && s.start_time < endTime,
  );
  if (overlaps.length > 0) {
    const other = overlaps[0] as { start_time: string; end_time: string };
    const otherRange = `${other.start_time.slice(0, 5)} - ${other.end_time.slice(0, 5)}`;
    redirect(
      `${returnTo}&error=${encodeURIComponent(
        `Este empleado ya tiene un turno el mismo día que se solapa (${otherRange}). Ajusta el horario o elige otro empleado.`,
      )}`,
    );
  }

  const payload = {
    employee_id: employeeId,
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
    ? supabase.from("employee_shifts").update(payload).eq("id", shiftId)
    : supabase.from("employee_shifts").insert(payload);

  const { error } = await query;
  if (error) {
    redirect(`${returnTo}&error=${encodeURIComponent(error.message)}`);
  }

  const dateLabel = new Date(`${shiftDate}T12:00:00`).toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
  const timeRange = `${startTime.slice(0, 5)} - ${endTime.slice(0, 5)}`;
  const isUpdate = Boolean(shiftId);

  await notifyShiftChange({
    employeeIds: [employeeId],
    title: isUpdate ? "Tu turno fue actualizado" : "Tienes un turno nuevo",
    body: isUpdate
      ? `${dateLabel} · ${timeRange}. Revisa en ANIMA.`
      : `${dateLabel} · ${timeRange}. Revisa tus turnos en ANIMA.`,
    data: {
      shift_date: shiftDate,
      start_time: startTime,
      end_time: endTime,
      action: isUpdate ? "shift_updated" : "shift_created",
      source: "viso_schedule_planner",
    },
  });

  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
  redirect(`${returnTo}&ok=${encodeURIComponent(shiftId ? "turno_actualizado_borrador" : "turno_creado_borrador")}`);
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
    .select("id, employee_id, shift_date, start_time, end_time")
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
  }>;

  if (shiftRows.length === 0) {
    redirect(`${returnTo}&error=${encodeURIComponent("No hay turnos en esta semana para publicar.")}`);
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
    .lte("shift_date", weekEndIso);

  if (updateError) {
    redirect(`${returnTo}&error=${encodeURIComponent(updateError.message)}`);
  }

  await notifyShiftChange({
    employeeIds: shiftRows.map((row) => row.employee_id),
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

export default async function StaffSchedulePage({
  searchParams,
}: {
  searchParams?: Promise<{ site_id?: string; week?: string; ok?: string; error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const okMsg = safeDecode(sp.ok);
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
  const monthStartIso = isoDate(startOfMonth(weekStart));
  const monthEndIso = isoDate(endOfMonth(weekStart));
  const fortnightRange = getFortnightRange(weekStart);
  const fortnightStartIso = isoDate(fortnightRange.start);
  const fortnightEndIso = isoDate(fortnightRange.end);
  const returnTo = buildReturnTo(selectedSiteId, weekStartIso);

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
  const selectedSite = sites.find((site) => site.id === selectedSiteId) ?? null;
  const prevWeekHref = buildReturnTo(selectedSiteId, isoDate(addDays(weekStart, -7)));
  const nextWeekHref = buildReturnTo(selectedSiteId, isoDate(addDays(weekStart, 7)));
  const currentWeekHref = buildReturnTo(selectedSiteId, isoDate(toMonday(new Date())));

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

      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">Listo: {okMsg}</div> : null}

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
        <WeeklySchedulePlanner
          employees={employees}
          shifts={(shiftsRes.data ?? []) as ShiftRow[]}
          days={weekDays}
          siteId={selectedSiteId}
          returnTo={returnTo}
          totalsByEmployee={totalsByEmployee}
          saveAction={saveShiftAction}
          deleteAction={deleteShiftAction}
          copyPreviousWeekAction={copyPreviousWeekAction}
          copyDayToOtherDaysAction={copyDayToOtherDaysAction}
          publishWeekAction={publishWeekAction}
        />
      )}
    </div>
  );
}
