"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  copyDayToOtherDaysAction: (formData: FormData) => Promise<void>;
  publishWeekAction: (formData: FormData) => Promise<void>;
};

const SLOT_MINUTES = 30;
const MINUTES_PER_DAY = 24 * 60;
const SLOT_COUNT = MINUTES_PER_DAY / SLOT_MINUTES;
const SLOT_HEIGHT = 26;
// Rango visible por defecto: 5:00–23:00 (solo horario operativo)
const VISIBLE_START_HOUR = 5;
const VISIBLE_END_HOUR = 23;
const VISIBLE_SLOT_START = (VISIBLE_START_HOUR * 60) / SLOT_MINUTES; // 10
const VISIBLE_SLOT_END = (VISIBLE_END_HOUR * 60) / SLOT_MINUTES; // 46
const VISIBLE_SLOT_COUNT = VISIBLE_SLOT_END - VISIBLE_SLOT_START + 1; // 37
const VISIBLE_START_MINUTES = VISIBLE_START_HOUR * 60;
const VISIBLE_END_MINUTES = VISIBLE_END_HOUR * 60;
const DAY_HEIGHT = VISIBLE_SLOT_COUNT * SLOT_HEIGHT;

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
      return "ui-shift--confirmed";
    case "completed":
      return "ui-shift--completed";
    case "cancelled":
      return "ui-shift--cancelled";
    case "no_show":
      return "ui-shift--no_show";
    case "scheduled":
    default:
      return "ui-shift--scheduled";
  }
}

function getEmployeeLabel(employee: PlannerEmployee) {
  return employee.full_name ?? employee.alias ?? employee.id;
}

function ShiftEditInline({
  shift,
  employees,
  days,
  returnTo,
  saveAction,
  deleteAction,
  getEmployeeLabel,
  onCancel,
}: {
  shift: PlannerShift;
  employees: PlannerEmployee[];
  days: PlannerDay[];
  returnTo: string;
  saveAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
  getEmployeeLabel: (e: PlannerEmployee) => string;
  onCancel: () => void;
}) {
  const [employeeId, setEmployeeId] = useState(shift.employee_id);
  const [shiftDate, setShiftDate] = useState(shift.shift_date);
  const [startTime, setStartTime] = useState(shift.start_time.slice(0, 5));
  const [endTime, setEndTime] = useState(shift.end_time.slice(0, 5));

  return (
    <>
      <form action={saveAction} className="space-y-3">
        <input type="hidden" name="shift_id" value={shift.id} />
        <input type="hidden" name="return_to" value={returnTo} />
        <input type="hidden" name="site_id" value={shift.site_id} />
        <input type="hidden" name="break_minutes" value={shift.break_minutes ?? 0} />
        <input type="hidden" name="status" value={shift.status} />
        <input type="hidden" name="notes" value={shift.notes ?? ""} />
        <label className="block">
          <span className="ui-caption">Quién</span>
          <select
            name="employee_id"
            className="ui-input mt-1 w-full"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>{getEmployeeLabel(emp)}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="ui-caption">Día</span>
          <select
            name="shift_date"
            className="ui-input mt-1 w-full"
            value={shiftDate}
            onChange={(e) => setShiftDate(e.target.value)}
          >
            {days.map((d) => (
              <option key={d.iso} value={d.iso}>{d.label} — {d.shortLabel}</option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="ui-caption">Inicio</span>
            <input
              name="start_time"
              type="time"
              className="ui-input mt-1 w-full"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="ui-caption">Fin</span>
            <input
              name="end_time"
              type="time"
              className="ui-input mt-1 w-full"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="ui-btn ui-btn--brand">Guardar</button>
          <button type="button" onClick={onCancel} className="ui-btn ui-btn--ghost">Cancelar</button>
        </div>
      </form>
      <form action={deleteAction}>
        <input type="hidden" name="shift_id" value={shift.id} />
        <input type="hidden" name="employee_id" value={shift.employee_id} />
        <input type="hidden" name="return_to" value={returnTo} />
        <button type="submit" className="ui-btn ui-btn--ghost ui-btn--sm w-full text-[var(--ui-danger)]">
          Eliminar turno
        </button>
      </form>
    </>
  );
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
  copyDayToOtherDaysAction,
  publishWeekAction,
}: WeeklySchedulePlannerProps) {
  type SlotSelection = {
    type: "slot";
    dayIso: string;
    startTime: string;
    endTime: string;
    employeeId: string | null;
    showTimeAdjust: boolean;
  };
  type ShiftSelection = { type: "shift"; shift: PlannerShift; editing: boolean };
  type Selection = null | SlotSelection | ShiftSelection;

  const [selection, setSelection] = useState<Selection>(null);
  type DragPoint = { dayIso: string; slotIndex: number };
  const [dragStart, setDragStart] = useState<DragPoint | null>(null);
  const [dragCurrent, setDragCurrent] = useState<DragPoint | null>(null);
  const justDraggedRef = useRef(false);
  const [copySourceDayIso, setCopySourceDayIso] = useState<string>("");

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

  const draftCount = shifts.filter((s) => !s.published_at).length;

  const draftAssignmentsByEmployee = useMemo(() => {
    const draftShifts = shifts.filter((s) => !s.published_at && s.site_id === siteId);
    const byEmployee = new Map<string, { employee: PlannerEmployee; shifts: PlannerShift[]; totalMinutes: number }>();
    for (const shift of draftShifts) {
      const emp = employeeById.get(shift.employee_id);
      const existing = byEmployee.get(shift.employee_id);
      const list = existing ? existing.shifts : [];
      list.push(shift);
      const totalMinutes = (existing?.totalMinutes ?? 0) + getShiftMinutes(shift);
      byEmployee.set(shift.employee_id, {
        employee: emp ?? { id: shift.employee_id, full_name: null, alias: null, role: null },
        shifts: list,
        totalMinutes,
      });
    }
    return Array.from(byEmployee.values()).sort((a, b) =>
      getEmployeeLabel(a.employee).localeCompare(getEmployeeLabel(b.employee)),
    );
  }, [shifts, siteId, employeeById]);

  const daysWithShifts = useMemo(
    () => days.filter((d) => (shiftsByDay.get(d.iso) ?? []).length > 0),
    [days, shiftsByDay],
  );

  const employeesOnSourceDay = useMemo(() => {
    if (!copySourceDayIso) return [];
    const dayShifts = shiftsByDay.get(copySourceDayIso) ?? [];
    const ids = [...new Set(dayShifts.map((s) => s.employee_id))];
    return ids
      .map((id) => employeeById.get(id) ?? { id, full_name: null, alias: null, role: null })
      .sort((a, b) => getEmployeeLabel(a).localeCompare(getEmployeeLabel(b)));
  }, [copySourceDayIso, shiftsByDay, employeeById]);

  const [copyEmployeeId, setCopyEmployeeId] = useState<string>("");

  useEffect(() => {
    if (daysWithShifts.length > 0 && !daysWithShifts.some((d) => d.iso === copySourceDayIso)) {
      setCopySourceDayIso(daysWithShifts[0].iso);
    }
  }, [daysWithShifts, copySourceDayIso]);

  useEffect(() => {
    if (employeesOnSourceDay.length > 0 && !employeesOnSourceDay.some((e) => e.id === copyEmployeeId)) {
      setCopyEmployeeId(employeesOnSourceDay[0].id);
    }
  }, [employeesOnSourceDay, copyEmployeeId]);

  const selectShift = (shift: PlannerShift) => {
    setSelection({ type: "shift", shift, editing: false });
  };

  const selectSlot = (dayIso: string, slotIndex: number) => {
    const startTime = formatSlotLabel(slotIndex);
    const endTime = addMinutes(startTime, 60);
    setSelection({
      type: "slot",
      dayIso,
      startTime,
      endTime,
      employeeId: null,
      showTimeAdjust: false,
    });
  };

  const selectSlotRange = useCallback(
    (dayIso: string, startSlotIndex: number, endSlotIndex: number) => {
      const lo = Math.min(startSlotIndex, endSlotIndex);
      const hi = Math.max(startSlotIndex, endSlotIndex);
      const startTime = formatSlotLabel(lo);
      const endTime =
        lo === hi
          ? addMinutes(startTime, 60)
          : addMinutes(formatSlotLabel(hi), SLOT_MINUTES);
      setSelection({
        type: "slot",
        dayIso,
        startTime,
        endTime,
        employeeId: null,
        showTimeAdjust: false,
      });
    },
    [],
  );

  const handleSlotMouseDown = useCallback((dayIso: string, slotIndex: number) => {
    justDraggedRef.current = false;
    setDragStart({ dayIso, slotIndex });
    setDragCurrent({ dayIso, slotIndex });
  }, []);

  const handleSlotMouseEnter = useCallback((dayIso: string, slotIndex: number) => {
    setDragCurrent((prev) => {
      if (!prev) return null;
      if (dayIso !== prev.dayIso) return prev;
      return { dayIso, slotIndex };
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    if (dragStart && dragCurrent && dragStart.dayIso === dragCurrent.dayIso) {
      justDraggedRef.current = true;
      selectSlotRange(dragStart.dayIso, dragStart.slotIndex, dragCurrent.slotIndex);
    }
    setDragStart(null);
    setDragCurrent(null);
  }, [dragStart, dragCurrent, selectSlotRange]);

  useEffect(() => {
    if (!dragStart) return;
    const onMouseUp = () => handleDragEnd();
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, [dragStart, handleDragEnd]);

  const isSlotInDragRange = useCallback(
    (dayIso: string, slotIndex: number) => {
      if (!dragStart || !dragCurrent || dragStart.dayIso !== dragCurrent.dayIso || dragStart.dayIso !== dayIso)
        return false;
      const lo = Math.min(dragStart.slotIndex, dragCurrent.slotIndex);
      const hi = Math.max(dragStart.slotIndex, dragCurrent.slotIndex);
      return slotIndex >= lo && slotIndex <= hi;
    },
    [dragStart, dragCurrent],
  );

  const isSlotInSelectionRange = useCallback(
    (dayIso: string, slotIndex: number) => {
      if (selection?.type !== "slot" || selection.dayIso !== dayIso) return false;
      const startSlot = Math.floor(timeToMinutes(selection.startTime) / SLOT_MINUTES);
      const endMinutes = timeToMinutes(selection.endTime);
      const endSlot = Math.ceil(endMinutes / SLOT_MINUTES) - 1;
      return slotIndex >= startSlot && slotIndex <= endSlot;
    },
    [selection],
  );

  const clearSelection = () => setSelection(null);

  const pickEmployeeForSlot = (employeeId: string) => {
    if (selection?.type !== "slot") return;
    setSelection({ ...selection, employeeId });
  };

  const setSlotTimeAdjust = (updates: { dayIso?: string; startTime?: string; endTime?: string }) => {
    if (selection?.type !== "slot") return;
    setSelection({
      ...selection,
      ...updates,
      showTimeAdjust: true,
    });
  };

  const startEditingShift = () => {
    if (selection?.type !== "shift") return;
    setSelection({ ...selection, editing: true });
  };

  const getDayLabel = (iso: string) => days.find((d) => d.iso === iso)?.shortLabel ?? iso;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-3">
          <p className="text-sm text-[var(--ui-muted)]">
            <span className="font-medium text-[var(--ui-text)]">{employees.length}</span> trabajadores
            {" · "}
            <span className="font-medium text-[var(--ui-text)]">{shifts.length}</span> turnos
            {" · "}
            <span className="font-medium text-[var(--ui-text)]">{draftCount}</span> borradores
          </p>
          <div className="flex flex-wrap gap-2">
            <form action={copyPreviousWeekAction}>
              <input type="hidden" name="site_id" value={siteId} />
              <input type="hidden" name="week_start" value={days[0]?.iso ?? ""} />
              <input type="hidden" name="return_to" value={returnTo} />
              <button type="submit" className="ui-btn ui-btn--ghost ui-btn--sm">
                Copiar semana anterior
              </button>
            </form>
            <form action={publishWeekAction}>
              <input type="hidden" name="site_id" value={siteId} />
              <input type="hidden" name="week_start" value={days[0]?.iso ?? ""} />
              <input type="hidden" name="return_to" value={returnTo} />
              <button type="submit" className="ui-btn ui-btn--brand ui-btn--sm">
                Publicar horarios
              </button>
            </form>
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
                  {Array.from({ length: VISIBLE_SLOT_COUNT }, (_, i) => VISIBLE_SLOT_START + i).map((slotIndex) => {
                    const isHourLine = slotIndex % 2 === 1;
                    return (
                      <div
                        key={`time-${slotIndex}`}
                        className={`absolute left-0 right-0 border-b border-dashed px-2 ${
                          isHourLine
                            ? "border-[var(--ui-border)]"
                            : "border-[rgba(15,23,42,0.08)]"
                        }`}
                        style={{ top: (slotIndex - VISIBLE_SLOT_START) * SLOT_HEIGHT, height: SLOT_HEIGHT }}
                      >
                        {slotIndex % 2 === 0 ? (
                          <span className="ui-caption relative -top-2 block">{formatSlotLabel(slotIndex)}</span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                {days.map((day) => {
                  const dayShifts = shiftsByDay.get(day.iso) ?? [];
                  return (
                    <div
                      key={day.iso}
                      className="relative border-r border-[var(--ui-border)] bg-[var(--ui-surface)] last:border-r-0"
                      style={{ height: DAY_HEIGHT }}
                    >
                      {Array.from({ length: VISIBLE_SLOT_COUNT }, (_, i) => VISIBLE_SLOT_START + i).map((slotIndex) => {
                        const inRange = isSlotInDragRange(day.iso, slotIndex);
                        const inSelection = isSlotInSelectionRange(day.iso, slotIndex);
                        const highlighted = inRange || inSelection;
                        const isHourLine = slotIndex % 2 === 1;
                        const borderClass = highlighted
                          ? "border-[var(--ui-brand)]"
                          : isHourLine
                            ? "border-[var(--ui-border)]"
                            : "border-[rgba(15,23,42,0.08)]";
                        return (
                          <button
                            key={`${day.iso}-${slotIndex}`}
                            type="button"
                            onMouseDown={() => handleSlotMouseDown(day.iso, slotIndex)}
                            onMouseEnter={() => handleSlotMouseEnter(day.iso, slotIndex)}
                            onClick={() => {
                              if (justDraggedRef.current) {
                                justDraggedRef.current = false;
                                return;
                              }
                              selectSlot(day.iso, slotIndex);
                            }}
                            className={`absolute left-0 right-0 border-b border-dashed text-left transition select-none ${
                              highlighted ? "bg-[var(--ui-brand-soft)] " : "hover:bg-[var(--ui-brand-soft)] "
                            }${borderClass}`}
                            style={{ top: (slotIndex - VISIBLE_SLOT_START) * SLOT_HEIGHT, height: SLOT_HEIGHT }}
                            title={
                              inRange
                                ? "Suelta para asignar este bloque"
                                : inSelection
                                  ? "Bloque seleccionado — elige trabajador a la derecha"
                                  : `Arrastra o haz clic para asignar · ${day.shortLabel} ${formatSlotLabel(slotIndex)}`
                            }
                          />
                        );
                      })}

                      {dayShifts.map((shift) => {
                        const employee = employeeById.get(shift.employee_id);
                        const startMinutes = timeToMinutes(shift.start_time);
                        const endMinutes = timeToMinutes(shift.end_time);
                        const visibleStart = Math.max(startMinutes, VISIBLE_START_MINUTES);
                        const visibleEnd = Math.min(endMinutes, VISIBLE_END_MINUTES);
                        if (visibleStart >= visibleEnd) return null;
                        const top = ((visibleStart - VISIBLE_START_MINUTES) / SLOT_MINUTES) * SLOT_HEIGHT;
                        const height = Math.max(((visibleEnd - visibleStart) / SLOT_MINUTES) * SLOT_HEIGHT, SLOT_HEIGHT);
                        const laneWidth = 100 / shift.laneCount;
                        return (
                          <button
                            key={shift.id}
                            type="button"
                            onClick={() => selectShift(shift)}
                            className={`absolute rounded-2xl border-2 px-3 py-2 text-left shadow-[var(--ui-shadow-soft)] transition hover:scale-[1.01] ${getStatusClass(shift.status)}`}
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

      <div className="space-y-4 xl:sticky xl:top-24">
        {selection === null && (
          <>
            {draftAssignmentsByEmployee.length > 0 ? (
              <div className="ui-panel space-y-3">
                <p className="text-sm font-semibold text-[var(--ui-text)]">
                  Asignaciones del borrador
                </p>
                <p className="ui-caption text-[var(--ui-muted)]">
                  Trabajadores y horas asignadas en esta sede esta semana (solo borrador).
                </p>
                <ul className="max-h-64 space-y-3 overflow-auto pr-1 ui-scrollbar-subtle">
                  {draftAssignmentsByEmployee.map(({ employee, shifts: empShifts, totalMinutes }) => (
                    <li
                      key={employee.id}
                      className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3"
                    >
                      <p className="text-sm font-semibold text-[var(--ui-text)]">
                        {getEmployeeLabel(employee)}
                      </p>
                      {employee.role ? (
                        <p className="text-xs text-[var(--ui-muted)]">{employee.role}</p>
                      ) : null}
                      <ul className="mt-2 space-y-1 text-xs text-[var(--ui-muted)]">
                        {empShifts.map((s) => (
                          <li key={s.id}>
                            {getDayLabel(s.shift_date)} — {formatRange(s.start_time, s.end_time)}
                            {s.break_minutes ? ` · ${s.break_minutes} min descanso` : null}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-xs font-semibold text-[var(--ui-text)]">
                        Total: {formatMinutes(totalMinutes)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {daysWithShifts.length > 0 ? (
              <div className="ui-panel space-y-3">
                <p className="text-sm font-semibold text-[var(--ui-text)]">
                  Aplicar día a otros
                </p>
                <p className="ui-caption text-[var(--ui-muted)]">
                  Copia el horario de una persona de un día al resto de días que elijas (misma persona, mismo horario). Ideal para repetir tu horario con descanso en toda la semana.
                </p>
                <form action={copyDayToOtherDaysAction} className="space-y-3">
                  <input type="hidden" name="site_id" value={siteId} />
                  <input type="hidden" name="return_to" value={returnTo} />
                  <label className="block">
                    <span className="ui-caption">Día a copiar</span>
                    <select
                      name="source_day"
                      className="ui-input mt-1 w-full"
                      value={copySourceDayIso}
                      onChange={(e) => setCopySourceDayIso(e.target.value)}
                    >
                      {daysWithShifts.map((d) => (
                        <option key={d.iso} value={d.iso}>
                          {d.label} — {d.shortLabel}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="ui-caption">Horario de</span>
                    <select
                      name="employee_id"
                      className="ui-input mt-1 w-full"
                      value={copyEmployeeId}
                      onChange={(e) => setCopyEmployeeId(e.target.value)}
                    >
                      {employeesOnSourceDay.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {getEmployeeLabel(emp)}
                          {emp.role ? ` · ${emp.role}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <fieldset className="space-y-2">
                    <span className="ui-caption block">A estos días</span>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {days.map((d) => (
                        <label key={d.iso} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            name="target_days"
                            value={d.iso}
                            disabled={d.iso === copySourceDayIso}
                            className="rounded border-[var(--ui-border)]"
                          />
                          <span className={d.iso === copySourceDayIso ? "text-[var(--ui-muted)]" : ""}>
                            {d.shortLabel}
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <button type="submit" className="ui-btn ui-btn--ghost ui-btn--sm w-full">
                    Aplicar a los días seleccionados
                  </button>
                </form>
              </div>
            ) : null}

            <div className="ui-panel flex flex-col items-center justify-center gap-4 py-12 text-center">
              <p className="max-w-xs text-[var(--ui-muted)]">
                Haz clic en un hueco o <strong>arrastra</strong> sobre varios para marcar un bloque de horas; suelta y asigna la persona.
              </p>
            </div>
          </>
        )}

        {selection?.type === "slot" && (
          <div className="ui-panel space-y-4">
            {!selection.employeeId ? (
              <>
                <p className="text-sm font-medium text-[var(--ui-text)]">
                  {getDayLabel(selection.dayIso)} · {selection.startTime.slice(0, 5)}–{selection.endTime.slice(0, 5)}
                </p>
                <p className="ui-caption">¿Quién trabaja este turno?</p>
                <div className="max-h-64 space-y-1 overflow-auto pr-1 ui-scrollbar-subtle">
                  {employees.map((emp) => (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => pickEmployeeForSlot(emp.id)}
                      className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-[var(--ui-text)] transition hover:bg-[var(--ui-brand-soft)] hover:text-[var(--ui-brand-600)]"
                    >
                      {getEmployeeLabel(emp)}
                      {emp.role ? (
                        <span className="ml-2 text-[var(--ui-muted)]">· {emp.role}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={clearSelection} className="ui-btn ui-btn--ghost ui-btn--sm w-full">
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-[var(--ui-text)]">
                  {getEmployeeLabel(employeeById.get(selection.employeeId) ?? { id: selection.employeeId, full_name: null, alias: null, role: null })}
                </p>
                {!selection.showTimeAdjust ? (
                  <>
                    <p className="ui-body-muted">
                      {getDayLabel(selection.dayIso)} · {selection.startTime.slice(0, 5)} a {selection.endTime.slice(0, 5)}
                    </p>
                    <form action={saveAction}>
                      <input type="hidden" name="shift_id" value="" />
                      <input type="hidden" name="return_to" value={returnTo} />
                      <input type="hidden" name="site_id" value={siteId} />
                      <input type="hidden" name="employee_id" value={selection.employeeId} />
                      <input type="hidden" name="shift_date" value={selection.dayIso} />
                      <input type="hidden" name="start_time" value={selection.startTime} />
                      <input type="hidden" name="end_time" value={selection.endTime} />
                      <input type="hidden" name="break_minutes" value="0" />
                      <input type="hidden" name="status" value="scheduled" />
                      <input type="hidden" name="notes" value="" />
                      <div className="flex flex-wrap gap-2">
                        <button type="submit" className="ui-btn ui-btn--brand">
                          Guardar turno
                        </button>
                        <button
                          type="button"
                          onClick={() => setSlotTimeAdjust({})}
                          className="ui-btn ui-btn--ghost"
                        >
                          Ajustar horario
                        </button>
                      </div>
                    </form>
                  </>
                ) : (
                  <form action={saveAction} className="space-y-3">
                    <input type="hidden" name="shift_id" value="" />
                    <input type="hidden" name="return_to" value={returnTo} />
                    <input type="hidden" name="site_id" value={siteId} />
                    <input type="hidden" name="employee_id" value={selection.employeeId} />
                    <input type="hidden" name="break_minutes" value="0" />
                    <input type="hidden" name="status" value="scheduled" />
                    <input type="hidden" name="notes" value="" />
                    <label className="block">
                      <span className="ui-caption">Día</span>
                      <select
                        name="shift_date"
                        className="ui-input mt-1 w-full"
                        value={selection.dayIso}
                        onChange={(e) => setSlotTimeAdjust({ dayIso: e.target.value })}
                      >
                        {days.map((d) => (
                          <option key={d.iso} value={d.iso}>{d.label} — {d.shortLabel}</option>
                        ))}
                      </select>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="ui-caption">Inicio</span>
                        <input
                          name="start_time"
                          type="time"
                          className="ui-input mt-1 w-full"
                          value={selection.startTime}
                          onChange={(e) => setSlotTimeAdjust({ startTime: e.target.value })}
                        />
                      </label>
                      <label className="block">
                        <span className="ui-caption">Fin</span>
                        <input
                          name="end_time"
                          type="time"
                          className="ui-input mt-1 w-full"
                          value={selection.endTime}
                          onChange={(e) => setSlotTimeAdjust({ endTime: e.target.value })}
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="submit" className="ui-btn ui-btn--brand">Guardar turno</button>
                      <button type="button" onClick={clearSelection} className="ui-btn ui-btn--ghost">Cancelar</button>
                    </div>
                  </form>
                )}
                <button
                  type="button"
                  onClick={() => setSelection((s) => s?.type === "slot" ? { ...s, employeeId: null, showTimeAdjust: false } : s)}
                  className="ui-btn ui-btn--ghost ui-btn--sm w-full text-[var(--ui-muted)]"
                >
                  Cambiar persona
                </button>
              </>
            )}
          </div>
        )}

        {selection?.type === "shift" && (
          <div className="ui-panel space-y-4">
            {!selection.editing ? (
              <>
                <p className="text-sm font-medium text-[var(--ui-text)]">
                  {getEmployeeLabel(employeeById.get(selection.shift.employee_id) ?? { id: selection.shift.employee_id, full_name: null, alias: null, role: null })}
                </p>
                <p className="ui-body-muted">
                  {getDayLabel(selection.shift.shift_date)} · {selection.shift.start_time.slice(0, 5)}–{selection.shift.end_time.slice(0, 5)}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={startEditingShift} className="ui-btn ui-btn--ghost">
                    Editar
                  </button>
                  <form action={deleteAction}>
                    <input type="hidden" name="shift_id" value={selection.shift.id} />
                    <input type="hidden" name="employee_id" value={selection.shift.employee_id} />
                    <input type="hidden" name="return_to" value={returnTo} />
                    <button type="submit" className="ui-btn ui-btn--ghost text-[var(--ui-danger)]">
                      Eliminar
                    </button>
                  </form>
                </div>
                <button type="button" onClick={clearSelection} className="ui-btn ui-btn--ghost ui-btn--sm w-full">
                  Cerrar
                </button>
              </>
            ) : (
              <ShiftEditInline
                shift={selection.shift}
                employees={employees}
                days={days}
                returnTo={returnTo}
                saveAction={saveAction}
                deleteAction={deleteAction}
                getEmployeeLabel={getEmployeeLabel}
                onCancel={() => setSelection({ ...selection, editing: false })}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
