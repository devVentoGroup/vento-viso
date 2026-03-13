"use client";

import { useMemo, useState } from "react";

type PlannerEmployee = {
  id: string;
  full_name: string | null;
  alias: string | null;
  role: string | null;
};

type PlannerShift = {
  id: string;
  employee_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  break_minutes: number | null;
  status: string;
  notes: string | null;
  site_id: string;
  published_at?: string | null;
};

type PlannerDay = {
  iso: string;
  label: string;
  shortLabel: string;
};

type PlannerTotals = {
  weekMinutes: number;
  fortnightMinutes: number;
  monthMinutes: number;
};

type DraftShift = {
  id: string | null;
  employee_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  status: string;
  notes: string;
  site_id: string;
};

type WeeklySchedulePlannerProps = {
  employees: PlannerEmployee[];
  shifts: PlannerShift[];
  days: PlannerDay[];
  siteId: string;
  returnTo: string;
  totalsByEmployee: Record<string, PlannerTotals>;
  saveAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
  copyPreviousWeekAction: (formData: FormData) => Promise<void>;
  publishWeekAction: (formData: FormData) => Promise<void>;
};

const SLOT_MINUTES = 30;
const MINUTES_PER_DAY = 24 * 60;
const SLOT_COUNT = MINUTES_PER_DAY / SLOT_MINUTES;
const SLOT_HEIGHT = 26;
const DAY_HEIGHT = SLOT_COUNT * SLOT_HEIGHT;

function timeToMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map((part) => Number(part));
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes: number) {
  const safe = Math.max(0, Math.min(MINUTES_PER_DAY - SLOT_MINUTES, totalMinutes));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

function addMinutes(value: string, delta: number) {
  return minutesToTime(timeToMinutes(value) + delta);
}

function formatSlotLabel(slotIndex: number) {
  const totalMinutes = slotIndex * SLOT_MINUTES;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

function formatRange(start: string, end: string) {
  return `${start.slice(0, 5)} - ${end.slice(0, 5)}`;
}

function getShiftMinutes(shift: Pick<PlannerShift, "start_time" | "end_time" | "break_minutes">) {
  const gross = timeToMinutes(shift.end_time) - timeToMinutes(shift.start_time);
  return Math.max(0, gross - Math.max(0, shift.break_minutes ?? 0));
}

function formatMinutes(totalMinutes: number) {
  const safe = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  return `${minutes} min`;
}

function getMinutesTone(totalMinutes: number) {
  if (totalMinutes >= 240 * 60) return "ui-chip--warn";
  if (totalMinutes >= 192 * 60) return "ui-chip--brand";
  return "";
}

function getStatusClass(status: string) {
  switch (status) {
    case "confirmed":
      return "border-emerald-300 bg-emerald-100 text-emerald-800";
    case "completed":
      return "border-sky-300 bg-sky-100 text-sky-800";
    case "cancelled":
      return "border-rose-300 bg-rose-100 text-rose-800";
    case "no_show":
      return "border-amber-300 bg-amber-100 text-amber-900";
    case "scheduled":
    default:
      return "border-violet-300 bg-violet-100 text-violet-900";
  }
}

function buildEmptyDraft(
  employees: PlannerEmployee[],
  days: PlannerDay[],
  siteId: string,
): DraftShift {
  return {
    id: null,
    employee_id: employees[0]?.id ?? "",
    shift_date: days[0]?.iso ?? "",
    start_time: "08:00",
    end_time: "17:00",
    break_minutes: 60,
    status: "scheduled",
    notes: "",
    site_id: siteId,
  };
}

function getEmployeeLabel(employee: PlannerEmployee) {
  return employee.full_name ?? employee.alias ?? employee.id;
}

type ShiftLayout = PlannerShift & {
  lane: number;
  laneCount: number;
};

function buildDayLayouts(shifts: PlannerShift[]) {
  const sorted = [...shifts].sort((a, b) => {
    const startDiff = timeToMinutes(a.start_time) - timeToMinutes(b.start_time);
    if (startDiff !== 0) return startDiff;
    return timeToMinutes(a.end_time) - timeToMinutes(b.end_time);
  });

  const active: Array<{ lane: number; end: number }> = [];
  const layouts: ShiftLayout[] = [];

  for (const shift of sorted) {
    const start = timeToMinutes(shift.start_time);
    const end = timeToMinutes(shift.end_time);

    for (let idx = active.length - 1; idx >= 0; idx -= 1) {
      if (active[idx].end <= start) {
        active.splice(idx, 1);
      }
    }

    const usedLanes = new Set(active.map((item) => item.lane));
    let lane = 0;
    while (usedLanes.has(lane)) lane += 1;

    active.push({ lane, end });
    layouts.push({
      ...shift,
      lane,
      laneCount: active.length,
    });
  }

  const dayMaxLaneCount = layouts.reduce((max, item) => Math.max(max, item.laneCount), 1);
  return layouts.map((item) => ({
    ...item,
    laneCount: Math.max(dayMaxLaneCount, 1),
  }));
}

export function WeeklySchedulePlanner({
  employees,
  shifts,
  days,
  siteId,
  returnTo,
  totalsByEmployee,
  saveAction,
  deleteAction,
  copyPreviousWeekAction,
  publishWeekAction,
}: WeeklySchedulePlannerProps) {
  const [draft, setDraft] = useState<DraftShift>(() => buildEmptyDraft(employees, days, siteId));

  const employeeById = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee])),
    [employees],
  );

  const shiftsByDay = useMemo(() => {
    const map = new Map<string, ShiftLayout[]>();
    for (const day of days) {
      const rows = shifts.filter((shift) => shift.shift_date === day.iso);
      map.set(day.iso, buildDayLayouts(rows));
    }
    return map;
  }, [days, shifts]);

  const shiftsByEmployee = useMemo(() => {
    const map = new Map<string, PlannerShift[]>();
    for (const shift of shifts) {
      const list = map.get(shift.employee_id) ?? [];
      list.push(shift);
      map.set(shift.employee_id, list);
    }
    return map;
  }, [shifts]);

  const draftMinutes = useMemo(() => {
    const gross = timeToMinutes(draft.end_time) - timeToMinutes(draft.start_time);
    return Math.max(0, gross - Math.max(0, draft.break_minutes));
  }, [draft.break_minutes, draft.end_time, draft.start_time]);

  const draftWeekStartIso = days[0]?.iso ?? "";
  const draftWeekEndIso = days[days.length - 1]?.iso ?? "";
  const draftMonthKey = draft.shift_date ? draft.shift_date.slice(0, 7) : "";
  const draftFortnightKey = useMemo(() => {
    const draftDay = draft.shift_date ? new Date(`${draft.shift_date}T12:00:00`) : null;
    if (!draftDay) return "";
    return `${draft.shift_date.slice(0, 7)}-${draftDay.getDate() <= 15 ? "1" : "2"}`;
  }, [draft.shift_date]);

  const draftImpactByEmployee = useMemo(() => {
    const result = new Map<string, { weekMinutes: number; fortnightMinutes: number; monthMinutes: number }>();
    if (!draft.employee_id || !draft.shift_date || draftMinutes <= 0) return result;

    const previousShift = draft.id ? shifts.find((shift) => shift.id === draft.id) ?? null : null;
    if (previousShift?.employee_id) {
      const prevDelta = getShiftMinutes(previousShift);
      const prevShiftDay = new Date(`${previousShift.shift_date}T12:00:00`);
      const prevFortnightKey = `${previousShift.shift_date.slice(0, 7)}-${prevShiftDay.getDate() <= 15 ? "1" : "2"}`;
      result.set(previousShift.employee_id, {
        weekMinutes:
          previousShift.shift_date >= draftWeekStartIso && previousShift.shift_date <= draftWeekEndIso
            ? -prevDelta
            : 0,
        fortnightMinutes: prevFortnightKey === draftFortnightKey ? -prevDelta : 0,
        monthMinutes: previousShift.shift_date.slice(0, 7) === draftMonthKey ? -prevDelta : 0,
      });
    }

    const current = result.get(draft.employee_id) ?? {
      weekMinutes: 0,
      fortnightMinutes: 0,
      monthMinutes: 0,
    };
    if (draft.shift_date >= draftWeekStartIso && draft.shift_date <= draftWeekEndIso) {
      current.weekMinutes += draftMinutes;
    }
    if (draftFortnightKey) {
      current.fortnightMinutes += draftMinutes;
    }
    if (draftMonthKey) {
      current.monthMinutes += draftMinutes;
    }
    result.set(draft.employee_id, current);
    return result;
  }, [
    draft.employee_id,
    draft.id,
    draft.shift_date,
    draftFortnightKey,
    draftMinutes,
    draftMonthKey,
    draftWeekEndIso,
    draftWeekStartIso,
    shifts,
  ]);

  const selectedEmployee = employeeById.get(draft.employee_id) ?? null;

  const selectShift = (shift: PlannerShift) => {
    setDraft({
      id: shift.id,
      employee_id: shift.employee_id,
      shift_date: shift.shift_date,
      start_time: shift.start_time.slice(0, 5),
      end_time: shift.end_time.slice(0, 5),
      break_minutes: shift.break_minutes ?? 0,
      status: shift.status,
      notes: shift.notes ?? "",
      site_id: shift.site_id,
    });
  };

  const selectSlot = (dayIso: string, slotIndex: number) => {
    const startTime = formatSlotLabel(slotIndex);
    const endTime = addMinutes(startTime, 60);
    setDraft((prev) => ({
      ...prev,
      id: null,
      shift_date: dayIso,
      site_id: siteId,
      employee_id: prev.employee_id || employees[0]?.id || "",
      start_time: startTime,
      end_time: endTime,
    }));
  };

  const resetDraft = () => {
    setDraft(buildEmptyDraft(employees, days, siteId));
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <div className="ui-panel ui-panel--halo space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="ui-h3">Planner semanal</div>
              <p className="mt-2 ui-body-muted">
                Vista tipo horario: columnas por dia, bloques por hora y asignacion rapida desde el
                panel lateral.
              </p>
            </div>
            <form action={copyPreviousWeekAction}>
              <input type="hidden" name="site_id" value={siteId} />
              <input type="hidden" name="week_start" value={days[0]?.iso ?? ""} />
              <input type="hidden" name="return_to" value={returnTo} />
              <button type="submit" className="ui-btn ui-btn--ghost">
                Copiar semana anterior
              </button>
            </form>
            <form action={publishWeekAction}>
              <input type="hidden" name="site_id" value={siteId} />
              <input type="hidden" name="week_start" value={days[0]?.iso ?? ""} />
              <input type="hidden" name="return_to" value={returnTo} />
              <button type="submit" className="ui-btn ui-btn--brand">
                Publicar horarios
              </button>
            </form>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="ui-panel-soft">
              <div className="ui-caption">Trabajadores visibles</div>
              <div className="mt-2 text-2xl font-semibold text-[var(--ui-text)]">{employees.length}</div>
            </div>
            <div className="ui-panel-soft">
              <div className="ui-caption">Turnos cargados</div>
              <div className="mt-2 text-2xl font-semibold text-[var(--ui-text)]">{shifts.length}</div>
            </div>
            <div className="ui-panel-soft">
              <div className="ui-caption">Borradores</div>
              <div className="mt-2 text-base font-semibold text-[var(--ui-text)]">
                {shifts.filter((shift) => !shift.published_at).length}
              </div>
              <div className="mt-1 ui-caption">Pendientes por publicar</div>
            </div>
          </div>
        </div>

        <div className="ui-panel p-0 overflow-hidden">
          <div className="overflow-auto ui-scrollbar-subtle">
            <div className="min-w-[1160px]">
              <div className="grid grid-cols-[72px_repeat(7,minmax(150px,1fr))] border-b border-[var(--ui-border)] bg-[var(--ui-surface-2)]">
                <div className="border-r border-[var(--ui-border)] px-3 py-4 text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
                  Hora
                </div>
                {days.map((day) => (
                  <div
                    key={day.iso}
                    className="border-r border-[var(--ui-border)] px-4 py-4 last:border-r-0"
                  >
                    <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
                      {day.label}
                    </div>
                    <div className="mt-1 text-base font-semibold text-[var(--ui-text)]">
                      {day.shortLabel}
                    </div>
                  </div>
                ))}
              </div>

              <div
                className="grid grid-cols-[72px_repeat(7,minmax(150px,1fr))]"
                style={{ minHeight: DAY_HEIGHT }}
              >
                <div className="relative border-r border-[var(--ui-border)] bg-[var(--ui-surface)]">
                  {Array.from({ length: SLOT_COUNT }).map((_, slotIndex) => (
                    <div
                      key={`time-${slotIndex}`}
                      className="absolute left-0 right-0 border-b border-dashed border-[rgba(27,16,51,0.08)] px-2"
                      style={{ top: slotIndex * SLOT_HEIGHT, height: SLOT_HEIGHT }}
                    >
                      {slotIndex % 2 === 0 ? (
                        <span className="ui-caption relative -top-2 block">{formatSlotLabel(slotIndex)}</span>
                      ) : null}
                    </div>
                  ))}
                </div>

                {days.map((day) => {
                  const dayShifts = shiftsByDay.get(day.iso) ?? [];
                  return (
                    <div
                      key={day.iso}
                      className="relative border-r border-[var(--ui-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,245,255,0.9))] last:border-r-0"
                      style={{ height: DAY_HEIGHT }}
                    >
                      {Array.from({ length: SLOT_COUNT }).map((_, slotIndex) => (
                        <button
                          key={`${day.iso}-${slotIndex}`}
                          type="button"
                          onClick={() => selectSlot(day.iso, slotIndex)}
                          className="absolute left-0 right-0 border-b border-dashed border-[rgba(27,16,51,0.08)] text-left transition hover:bg-[rgba(168,85,247,0.08)]"
                          style={{ top: slotIndex * SLOT_HEIGHT, height: SLOT_HEIGHT }}
                          title={`Asignar turno ${day.shortLabel} ${formatSlotLabel(slotIndex)}`}
                        />
                      ))}

                      {dayShifts.map((shift) => {
                        const employee = employeeById.get(shift.employee_id);
                        const startMinutes = timeToMinutes(shift.start_time);
                        const endMinutes = timeToMinutes(shift.end_time);
                        const top = (startMinutes / SLOT_MINUTES) * SLOT_HEIGHT;
                        const height = Math.max(((endMinutes - startMinutes) / SLOT_MINUTES) * SLOT_HEIGHT, SLOT_HEIGHT);
                        const laneWidth = 100 / shift.laneCount;
                        return (
                          <button
                            key={shift.id}
                            type="button"
                            onClick={() => selectShift(shift)}
                            className={`absolute rounded-2xl border px-3 py-2 text-left shadow-[var(--ui-shadow-soft)] transition hover:scale-[1.01] ${getStatusClass(shift.status)}`}
                            style={{
                              top,
                              height,
                              left: `calc(${shift.lane * laneWidth}% + 6px)`,
                              width: `calc(${laneWidth}% - 12px)`,
                            }}
                            title={`${getEmployeeLabel(employee ?? { id: shift.employee_id, full_name: null, alias: null, role: null })} · ${formatRange(shift.start_time, shift.end_time)}`}
                          >
                            <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
                              {formatRange(shift.start_time, shift.end_time)}
                            </div>
                            <div className="mt-1 text-sm font-semibold leading-tight">
                              {getEmployeeLabel(employee ?? { id: shift.employee_id, full_name: null, alias: null, role: null })}
                            </div>
                            <div className="mt-1 text-[12px] leading-tight opacity-80">
                              {employee?.role ?? "Sin rol"}
                            </div>
                            <div className="mt-2 text-[11px] font-semibold uppercase tracking-wide opacity-70">
                              {shift.published_at ? "Publicado" : "Borrador"}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="ui-panel space-y-4 xl:sticky xl:top-24">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="ui-h3">{draft.id ? "Editar turno" : "Crear turno"}</div>
              <p className="mt-2 ui-body-muted">
                {selectedEmployee
                  ? `Asignando a ${getEmployeeLabel(selectedEmployee)}`
                  : "Selecciona trabajador y bloque horario."}
              </p>
            </div>
            <button type="button" onClick={resetDraft} className="ui-btn ui-btn--ghost ui-btn--sm">
              Limpiar
            </button>
          </div>

          <form action={saveAction} className="space-y-3">
            <input type="hidden" name="shift_id" value={draft.id ?? ""} />
            <input type="hidden" name="return_to" value={returnTo} />
            <input type="hidden" name="site_id" value={draft.site_id} />

            <label className="space-y-2">
              <span className="ui-label">Trabajador</span>
              <select
                name="employee_id"
                className="ui-input"
                value={draft.employee_id}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    employee_id: event.target.value,
                  }))
                }
                required
              >
                <option value="">Selecciona trabajador</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {getEmployeeLabel(employee)} {employee.role ? `· ${employee.role}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="ui-label">Fecha</span>
                <select
                  name="shift_date"
                  className="ui-input"
                  value={draft.shift_date}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      shift_date: event.target.value,
                    }))
                  }
                  required
                >
                  {days.map((day) => (
                    <option key={day.iso} value={day.iso}>
                      {day.label} · {day.shortLabel}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="ui-label">Estado</span>
                <select
                  name="status"
                  className="ui-input"
                  value={draft.status}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      status: event.target.value,
                    }))
                  }
                >
                  <option value="scheduled">Programado</option>
                  <option value="confirmed">Confirmado</option>
                  <option value="completed">Completado</option>
                  <option value="cancelled">Cancelado</option>
                  <option value="no_show">No asistio</option>
                </select>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="ui-label">Inicio</span>
                <input
                  name="start_time"
                  type="time"
                  className="ui-input"
                  value={draft.start_time}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      start_time: event.target.value,
                    }))
                  }
                  required
                />
              </label>

              <label className="space-y-2">
                <span className="ui-label">Fin</span>
                <input
                  name="end_time"
                  type="time"
                  className="ui-input"
                  value={draft.end_time}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      end_time: event.target.value,
                    }))
                  }
                  required
                />
              </label>
            </div>

            <label className="space-y-2">
              <span className="ui-label">Descanso (min)</span>
              <input
                name="break_minutes"
                type="number"
                min="0"
                className="ui-input"
                value={draft.break_minutes}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    break_minutes: Number(event.target.value || 0),
                  }))
                }
              />
            </label>

            <label className="space-y-2">
              <span className="ui-label">Notas</span>
              <input
                name="notes"
                className="ui-input"
                value={draft.notes}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    notes: event.target.value,
                  }))
                }
                placeholder="Cobertura, reemplazo, apertura, cierre..."
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button type="submit" className="ui-btn ui-btn--brand">
                {draft.id ? "Guardar turno" : "Crear turno"}
              </button>

              {draft.id ? (
                <button
                  type="button"
                  className="ui-btn ui-btn--ghost"
                  onClick={resetDraft}
                >
                  Crear nuevo
                </button>
              ) : null}
            </div>
          </form>

          <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
            <div className="ui-caption">Impacto del turno actual</div>
            <div className="mt-2 text-sm font-semibold text-[var(--ui-text)]">
              {draftMinutes > 0 ? formatMinutes(draftMinutes) : "Ajusta el horario para ver impacto"}
            </div>
            {selectedEmployee ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {(() => {
                  const base = totalsByEmployee[selectedEmployee.id] ?? {
                    weekMinutes: 0,
                    fortnightMinutes: 0,
                    monthMinutes: 0,
                  };
                  const delta = draftImpactByEmployee.get(selectedEmployee.id) ?? {
                    weekMinutes: 0,
                    fortnightMinutes: 0,
                    monthMinutes: 0,
                  };
                  const items = [
                    { label: "Semana", total: base.weekMinutes + delta.weekMinutes },
                    { label: "Quincena", total: base.fortnightMinutes + delta.fortnightMinutes },
                    { label: "Mes", total: base.monthMinutes + delta.monthMinutes },
                  ];
                  return items.map((item) => (
                    <div key={item.label} className="rounded-2xl bg-[var(--ui-surface)] p-3">
                      <div className="ui-caption">{item.label}</div>
                      <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">
                        {formatMinutes(item.total)}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            ) : null}
          </div>

          {draft.id ? (
            <form action={deleteAction}>
              <input type="hidden" name="shift_id" value={draft.id} />
              <input type="hidden" name="employee_id" value={draft.employee_id} />
              <input type="hidden" name="return_to" value={returnTo} />
              <button type="submit" className="ui-btn ui-btn--danger w-full">
                Eliminar turno
              </button>
            </form>
          ) : null}
        </div>

        <div className="ui-panel space-y-3">
          <div className="ui-h3">Equipo de la sede</div>
          <div className="max-h-[460px] space-y-2 overflow-auto pr-1 ui-scrollbar-subtle">
            {employees.length === 0 ? (
              <div className="ui-empty">No hay trabajadores activos asociados a esta sede.</div>
            ) : (
              employees.map((employee) => {
                const assignedCount = shiftsByEmployee.get(employee.id)?.length ?? 0;
                const isSelected = draft.employee_id === employee.id;
                const baseTotals = totalsByEmployee[employee.id] ?? {
                  weekMinutes: 0,
                  fortnightMinutes: 0,
                  monthMinutes: 0,
                };
                const deltaTotals = draftImpactByEmployee.get(employee.id) ?? {
                  weekMinutes: 0,
                  fortnightMinutes: 0,
                  monthMinutes: 0,
                };
                const projectedWeek = baseTotals.weekMinutes + deltaTotals.weekMinutes;
                const projectedFortnight = baseTotals.fortnightMinutes + deltaTotals.fortnightMinutes;
                const projectedMonth = baseTotals.monthMinutes + deltaTotals.monthMinutes;
                return (
                  <button
                    key={employee.id}
                    type="button"
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        employee_id: employee.id,
                      }))
                    }
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                      isSelected
                        ? "border-violet-400 bg-violet-100 text-violet-900"
                        : "border-[var(--ui-border)] bg-[var(--ui-surface)] text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{getEmployeeLabel(employee)}</div>
                        <div className="ui-caption">{employee.role ?? "Sin rol"}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className={`ui-chip ${getMinutesTone(projectedWeek)}`}>
                            Sem: {formatMinutes(projectedWeek)}
                          </span>
                          <span className={`ui-chip ${getMinutesTone(projectedFortnight)}`}>
                            Quin: {formatMinutes(projectedFortnight)}
                          </span>
                          <span className={`ui-chip ${getMinutesTone(projectedMonth)}`}>
                            Mes: {formatMinutes(projectedMonth)}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="ui-chip">{assignedCount} turno(s)</span>
                        {(deltaTotals.weekMinutes !== 0 ||
                          deltaTotals.fortnightMinutes !== 0 ||
                          deltaTotals.monthMinutes !== 0) ? (
                          <span className="ui-chip ui-chip--brand">impacto</span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
