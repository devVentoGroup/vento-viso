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
  shift_kind?: string | null;
  show_end_as_close?: boolean | null;
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
  visibleStatusByShiftId?: Record<string, string>;
  initialSlot?: {
    dayIso: string;
    startTime: string;
    endTime: string;
  } | null;
  totalsByEmployee: Record<string, PlannerTotals>;
  saveAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
  deleteManyAction: (formData: FormData) => Promise<void>;
  assignManyAction: (formData: FormData) => Promise<void>;
  copyPreviousWeekAction: (formData: FormData) => Promise<void>;
  copyDayToOtherDaysAction: (formData: FormData) => Promise<void>;
  suggestDraftAction: (formData: FormData) => Promise<void>;
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
const FULL_DAY_REST_START_TIME = "00:00";
const FULL_DAY_REST_END_TIME = "23:59";

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

function formatRange(
  start: string,
  end: string,
  showEndAsClose?: boolean | null,
  shiftKind?: string | null,
) {
  if (shiftKind === "descanso") return "Descanso";
  return showEndAsClose
    ? `${start.slice(0, 5)} - Cierre`
    : `${start.slice(0, 5)} - ${end.slice(0, 5)}`;
}

function getShiftMinutes(
  shift: Pick<PlannerShift, "start_time" | "end_time" | "break_minutes" | "shift_kind">,
) {
  if (shift.shift_kind === "descanso") return 0;
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

function getEmployeeShortLabel(employee: PlannerEmployee) {
  const label = getEmployeeLabel(employee).trim();
  if (!label) return "Sin nombre";
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return label;
  return `${parts[0]} ${parts[1]}`;
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
  const [showEndAsClose, setShowEndAsClose] = useState(Boolean(shift.show_end_as_close));
  const [isRestShift, setIsRestShift] = useState(shift.shift_kind === "descanso");
  const [isFullDayRest, setIsFullDayRest] = useState(
    shift.shift_kind === "descanso" &&
      shift.start_time.slice(0, 5) === FULL_DAY_REST_START_TIME &&
      shift.end_time.slice(0, 5) === FULL_DAY_REST_END_TIME,
  );

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
              disabled={isFullDayRest}
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
              disabled={isFullDayRest}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </label>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-[var(--ui-text)]">
          <input
            type="checkbox"
            name="show_end_as_close"
            value="1"
            checked={showEndAsClose}
            onChange={(e) => setShowEndAsClose(e.target.checked)}
            className="rounded border-[var(--ui-border)]"
          />
          Mostrar salida como "Cierre" al empleado
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-[var(--ui-text)]">
          <input
            type="checkbox"
            name="rest_shift"
            value="1"
            checked={isRestShift}
            onChange={(e) => setIsRestShift(e.target.checked)}
            className="rounded border-[var(--ui-border)]"
          />
          Marcar como turno de descanso (no laboral)
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-[var(--ui-text)]">
          <input
            type="checkbox"
            name="full_day_rest"
            value="1"
            checked={isFullDayRest}
            onChange={(e) => {
              const checked = e.target.checked;
              setIsFullDayRest(checked);
              if (checked) setIsRestShift(true);
            }}
            className="rounded border-[var(--ui-border)]"
          />
          Marcar día completo como descanso
        </label>
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

type PlannerShiftGroup = {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  shift_kind?: string | null;
  show_end_as_close?: boolean | null;
  site_id: string;
  shifts: PlannerShift[];
};

type LayoutItem = {
  start_time: string;
  end_time: string;
};

type ShiftLayout<T extends LayoutItem> = T & {
  lane: number;
  laneCount: number;
};

function buildDayLayouts<T extends LayoutItem>(items: T[]) {
  const sorted = [...items].sort((a, b) => {
    const startDiff = timeToMinutes(a.start_time) - timeToMinutes(b.start_time);
    if (startDiff !== 0) return startDiff;
    return timeToMinutes(a.end_time) - timeToMinutes(b.end_time);
  });

  const active: Array<{ lane: number; end: number }> = [];
  const layouts: Array<ShiftLayout<T>> = [];

  for (const item of sorted) {
    const start = timeToMinutes(item.start_time);
    const end = timeToMinutes(item.end_time);

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
      ...item,
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

function buildShiftGroups(shifts: PlannerShift[]) {
  const groups = new Map<string, PlannerShiftGroup>();
  for (const shift of shifts) {
    const key = `${shift.shift_date}|${shift.start_time}|${shift.end_time}|${shift.show_end_as_close ? "close" : "time"}|${shift.shift_kind ?? "laboral"}`;
    const existing = groups.get(key);
    if (existing) {
      existing.shifts.push(shift);
      continue;
    }
    groups.set(key, {
      id: key,
      shift_date: shift.shift_date,
      start_time: shift.start_time,
      end_time: shift.end_time,
      shift_kind: shift.shift_kind ?? "laboral",
      show_end_as_close: shift.show_end_as_close ?? false,
      site_id: shift.site_id,
      shifts: [shift],
    });
  }
  return [...groups.values()];
}

function getGroupStatusCounts(group: PlannerShiftGroup) {
  const publishedCount = group.shifts.filter((shift) => shift.published_at).length;
  const draftCount = group.shifts.length - publishedCount;
  return { publishedCount, draftCount };
}

function getGroupStatusTitle(group: PlannerShiftGroup) {
  const { publishedCount, draftCount } = getGroupStatusCounts(group);
  if (draftCount === 0) return "Todo publicado";
  if (publishedCount === 0) return "Borrador (no publicado)";
  return `${publishedCount} publicados, ${draftCount} en borrador`;
}

function getGroupPublishedClass(group: PlannerShiftGroup) {
  const allPublished = group.shifts.every((shift) => shift.published_at);
  return allPublished ? "ui-shift--block-published" : "ui-shift--block-draft";
}

function getStatusBadgeClass(status: string) {
  switch (status) {
    case "Borrador":
      return "bg-amber-500/25 text-amber-800 ring-1 ring-amber-400/50";
    case "Con retraso":
      return "bg-orange-500/25 text-orange-800";
    case "No asistió":
      return "bg-rose-500/25 text-rose-800";
    case "Asistió":
      return "bg-sky-500/25 text-sky-800";
    case "Cancelado":
      return "bg-rose-500/25 text-rose-800";
    case "Programado":
    default:
      return "bg-emerald-500/25 text-emerald-800";
  }
}

function summarizeGroupEmployees(
  group: PlannerShiftGroup,
  employeeById: Map<string, PlannerEmployee>,
) {
  const labels = group.shifts
    .map((shift) => getEmployeeLabel(employeeById.get(shift.employee_id) ?? {
      id: shift.employee_id,
      full_name: null,
      alias: null,
      role: null,
    }))
    .sort((a, b) => a.localeCompare(b, "es"));
  if (labels.length <= 2) return labels.join(" · ");
  return `${labels.slice(0, 2).join(" · ")} +${labels.length - 2}`;
}

export function WeeklySchedulePlanner({
  employees,
  shifts,
  days,
  siteId,
  returnTo,
  visibleStatusByShiftId,
  initialSlot,
  totalsByEmployee,
  saveAction,
  deleteAction,
  deleteManyAction,
  assignManyAction,
  copyPreviousWeekAction,
  copyDayToOtherDaysAction,
  suggestDraftAction,
  publishWeekAction,
}: WeeklySchedulePlannerProps) {
  type SlotSelection = {
    type: "slot";
    dayIso: string;
    startTime: string;
    endTime: string;
    employeeIds: string[];
    showTimeAdjust: boolean;
  };
  type GroupSelection = {
    type: "group";
    group: ShiftLayout<PlannerShiftGroup>;
  };
  type ShiftSelection = { type: "shift"; shift: PlannerShift; editing: boolean };
  type Selection = null | SlotSelection | GroupSelection | ShiftSelection;

  const [selection, setSelection] = useState<Selection>(null);
  type DragPoint = { dayIso: string; slotIndex: number };
  const [dragStart, setDragStart] = useState<DragPoint | null>(null);
  const [dragCurrent, setDragCurrent] = useState<DragPoint | null>(null);
  const justDraggedRef = useRef(false);
  const [initialSlotConsumed, setInitialSlotConsumed] = useState(false);
  const [copySourceDayIso, setCopySourceDayIso] = useState<string>("");
  const [copyDayPanelOpen, setCopyDayPanelOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedShiftIds, setSelectedShiftIds] = useState<string[]>([]);
  const [selectionModeGroup, setSelectionModeGroup] = useState<PlannerShiftGroup | null>(null);
  const [bulkEmployeeIds, setBulkEmployeeIds] = useState<string[]>([]);

  const employeeById = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee])),
    [employees],
  );
  const getVisibleStatus = useCallback(
    (shift: PlannerShift) => visibleStatusByShiftId?.[shift.id] ?? (shift.published_at ? "Programado" : "Borrador"),
    [visibleStatusByShiftId],
  );

  const groupedShiftsByDay = useMemo(() => {
    const map = new Map<string, Array<ShiftLayout<PlannerShiftGroup>>>();
    for (const day of days) {
      const rows = shifts.filter((shift) => shift.shift_date === day.iso);
      map.set(day.iso, buildDayLayouts(buildShiftGroups(rows)));
    }
    return map;
  }, [days, shifts]);

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

  const publishedHoursByEmployee = useMemo(() => {
    const publishedShifts = shifts.filter((s) => s.published_at != null && s.site_id === siteId);
    const byEmployee = new Map<string, { employee: PlannerEmployee; totalMinutes: number }>();
    for (const shift of publishedShifts) {
      const emp = employeeById.get(shift.employee_id);
      const existing = byEmployee.get(shift.employee_id);
      const totalMinutes = (existing?.totalMinutes ?? 0) + getShiftMinutes(shift);
      byEmployee.set(shift.employee_id, {
        employee: emp ?? { id: shift.employee_id, full_name: null, alias: null, role: null },
        totalMinutes,
      });
    }
    return Array.from(byEmployee.values()).sort((a, b) =>
      getEmployeeLabel(a.employee).localeCompare(getEmployeeLabel(b.employee)),
    );
  }, [shifts, siteId, employeeById]);

  const [publishedHoursExpanded, setPublishedHoursExpanded] = useState(false);

  const daysWithShifts = useMemo(
    () => days.filter((d) => (groupedShiftsByDay.get(d.iso) ?? []).length > 0),
    [days, groupedShiftsByDay],
  );

  const employeesOnSourceDay = useMemo(() => {
    if (!copySourceDayIso) return [];
    const dayGroups = groupedShiftsByDay.get(copySourceDayIso) ?? [];
    const ids = [...new Set(dayGroups.flatMap((group) => group.shifts.map((shift) => shift.employee_id)))];
    return ids
      .map((id) => employeeById.get(id) ?? { id, full_name: null, alias: null, role: null })
      .sort((a, b) => getEmployeeLabel(a).localeCompare(getEmployeeLabel(b)));
  }, [copySourceDayIso, groupedShiftsByDay, employeeById]);

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

  useEffect(() => {
    if (!initialSlot || initialSlotConsumed || selectionMode) return;
    setSelection({
      type: "slot",
      dayIso: initialSlot.dayIso,
      startTime: initialSlot.startTime,
      endTime: initialSlot.endTime,
      employeeIds: [],
      showTimeAdjust: false,
    });
    setInitialSlotConsumed(true);
  }, [initialSlot, initialSlotConsumed, selectionMode]);

  const selectShift = (shift: PlannerShift) => {
    setSelection({ type: "shift", shift, editing: false });
  };

  const selectGroup = (group: ShiftLayout<PlannerShiftGroup>) => {
    setSelection({ type: "group", group });
  };

  const selectSlot = (dayIso: string, slotIndex: number) => {
    const startTime = formatSlotLabel(slotIndex);
    const endTime = addMinutes(startTime, 60);
    setSelection({
      type: "slot",
      dayIso,
      startTime,
      endTime,
      employeeIds: [],
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
        employeeIds: [],
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

  const toggleEmployeeForSlot = (employeeId: string) => {
    if (selection?.type !== "slot") return;
    setSelection({
      ...selection,
      employeeIds: selection.employeeIds.includes(employeeId)
        ? selection.employeeIds.filter((id) => id !== employeeId)
        : [...selection.employeeIds, employeeId],
    });
  };

  const setSlotTimeAdjust = (updates: { dayIso?: string; startTime?: string; endTime?: string }) => {
    if (selection?.type !== "slot") return;
    setSelection({
      ...selection,
      ...updates,
      showTimeAdjust: true,
    });
  };

  const toggleSlotTimeAdjust = () => {
    if (selection?.type !== "slot") return;
    setSelection({
      ...selection,
      showTimeAdjust: !selection.showTimeAdjust,
    });
  };

  const startEditingShift = () => {
    if (selection?.type !== "shift") return;
    setSelection({ ...selection, editing: true });
  };

  const getDayLabel = (iso: string) => days.find((d) => d.iso === iso)?.shortLabel ?? iso;
  const toggleSelectionMode = () => {
    setSelection(null);
    setSelectionMode((prev) => {
      if (prev) {
        setSelectedShiftIds([]);
        setSelectionModeGroup(null);
        setBulkEmployeeIds([]);
      }
      return !prev;
    });
  };
  const toggleShiftSelection = (shiftId: string) => {
    setSelectedShiftIds((prev) =>
      prev.includes(shiftId) ? prev.filter((id) => id !== shiftId) : [...prev, shiftId],
    );
  };

  const toggleGroupSelection = (group: PlannerShiftGroup) => {
    const groupShiftIds = group.shifts.map((shift) => shift.id);
    const allSelected = groupShiftIds.every((id) => selectedShiftIds.includes(id));
    setSelectedShiftIds((prev) => {
      if (allSelected) {
        return prev.filter((id) => !groupShiftIds.includes(id));
      }
      return [...new Set([...prev, ...groupShiftIds])];
    });
  };

  const openSelectionModeGroup = (group: PlannerShiftGroup) => {
    setSelectionModeGroup((prev) => (prev?.id === group.id ? null : group));
  };

  const toggleBulkEmployee = (employeeId: string) => {
    setBulkEmployeeIds((prev) =>
      prev.includes(employeeId) ? prev.filter((id) => id !== employeeId) : [...prev, employeeId],
    );
  };

  return (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_360px]">
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
            <button
              type="button"
              onClick={toggleSelectionMode}
              className="ui-btn ui-btn--ghost ui-btn--sm"
            >
              {selectionMode ? "Cancelar selección" : "Seleccionar varios"}
            </button>
            <form action={copyPreviousWeekAction}>
              <input type="hidden" name="site_id" value={siteId} />
              <input type="hidden" name="week_start" value={days[0]?.iso ?? ""} />
              <input type="hidden" name="return_to" value={returnTo} />
              <button type="submit" className="ui-btn ui-btn--ghost ui-btn--sm">
                Copiar semana anterior
              </button>
            </form>
            <form action={suggestDraftAction}>
              <input type="hidden" name="site_id" value={siteId} />
              <input type="hidden" name="week_start" value={days[0]?.iso ?? ""} />
              <input type="hidden" name="return_to" value={returnTo} />
              <button type="submit" className="ui-btn ui-btn--ghost ui-btn--sm">
                Sugerir borrador
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
            <div className="min-w-[1560px]">
              <div className="grid grid-cols-[72px_repeat(7,minmax(210px,1fr))] border-b border-[var(--ui-border)] bg-[var(--ui-surface-2)]">
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
                className="grid grid-cols-[72px_repeat(7,minmax(210px,1fr))]"
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
                  const dayGroups = groupedShiftsByDay.get(day.iso) ?? [];
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
                            onMouseDown={() => {
                              if (selectionMode) return;
                              handleSlotMouseDown(day.iso, slotIndex);
                            }}
                            onMouseEnter={() => {
                              if (selectionMode) return;
                              handleSlotMouseEnter(day.iso, slotIndex);
                            }}
                            onClick={() => {
                              if (selectionMode) return;
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

                      {dayGroups.map((group) => {
                        const startMinutes = timeToMinutes(group.start_time);
                        const endMinutes = timeToMinutes(group.end_time);
                        const visibleStart = Math.max(startMinutes, VISIBLE_START_MINUTES);
                        const visibleEnd = Math.min(endMinutes, VISIBLE_END_MINUTES);
                        if (visibleStart >= visibleEnd) return null;
                        const top = ((visibleStart - VISIBLE_START_MINUTES) / SLOT_MINUTES) * SLOT_HEIGHT;
                        const height = Math.max(((visibleEnd - visibleStart) / SLOT_MINUTES) * SLOT_HEIGHT, SLOT_HEIGHT);
                        const laneWidth = 100 / group.laneCount;
                        const allSelected = group.shifts.every((shift) => selectedShiftIds.includes(shift.id));
                        const someSelected = group.shifts.some((shift) => selectedShiftIds.includes(shift.id));
                        const firstShift = group.shifts[0];
                        const isGrouped = group.shifts.length > 1;
                        return (
                          <button
                            key={group.id}
                            type="button"
                            onClick={() => {
                              if (selectionMode) {
                                if (group.shifts.length > 1) {
                                  openSelectionModeGroup(group);
                                  return;
                                }
                                toggleGroupSelection(group);
                                return;
                              }
                              selectGroup(group);
                            }}
                            className={`absolute flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border px-2.5 py-2 text-left shadow-sm transition hover:shadow-md ${getGroupPublishedClass(group)} ${
                              allSelected || someSelected ? "ring-2 ring-[var(--ui-brand)] ring-offset-2" : ""
                            }`}
                            style={{
                              top,
                              height,
                              left: `calc(${group.lane * laneWidth}% + 6px)`,
                              width: `calc(${laneWidth}% - 12px)`,
                            }}
                            title={`${formatRange(group.start_time, group.end_time, group.show_end_as_close, group.shift_kind)} · ${group.shifts.length} ${group.shifts.length === 1 ? "trabajador" : "trabajadores"}`}
                          >
                            <div className="space-y-1.5" title={getGroupStatusTitle(group)}>
                              <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
                                {formatRange(group.start_time, group.end_time, group.show_end_as_close, group.shift_kind)}
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {(() => {
                                  if (group.shifts.length === 1) {
                                    if (group.shifts[0].shift_kind === "descanso") {
                                      return (
                                        <span className="rounded bg-slate-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700">
                                          Día libre
                                        </span>
                                      );
                                    }
                                    const status = getVisibleStatus(group.shifts[0]);
                                    return (
                                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${getStatusBadgeClass(status)}`}>
                                        {status}
                                      </span>
                                    );
                                  }
                                  const { publishedCount, draftCount } = getGroupStatusCounts(group);
                                  if (draftCount === 0) {
                                    return (
                                      <span className="rounded bg-emerald-500/25 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                                        Publicado
                                      </span>
                                    );
                                  }
                                  if (publishedCount === 0) {
                                    return (
                                      <span className="rounded bg-amber-500/25 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 ring-1 ring-amber-400/50">
                                        Borrador
                                      </span>
                                    );
                                  }
                                  return (
                                    <>
                                      <span className="rounded bg-emerald-500/25 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                                        {publishedCount} pub
                                      </span>
                                      <span className="rounded bg-amber-500/25 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 ring-1 ring-amber-400/50">
                                        {draftCount} borr
                                      </span>
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
                            {isGrouped ? (
                              <>
                                <div className="mt-1 line-clamp-1 text-xs font-semibold leading-tight text-[var(--ui-text)]">
                                  {group.shifts.length} trabajadores
                                </div>
                                <div className="mt-0.5 line-clamp-2 text-[11px] leading-tight text-[var(--ui-muted)]">
                                  {summarizeGroupEmployees(group, employeeById)}
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="mt-1 line-clamp-2 text-xs font-semibold leading-tight text-[var(--ui-text)]">
                                  {getEmployeeShortLabel(employeeById.get(firstShift.employee_id) ?? {
                                    id: firstShift.employee_id,
                                    full_name: null,
                                    alias: null,
                                    role: null,
                                  })}
                                </div>
                                <div className="mt-0.5 text-[11px] leading-tight text-[var(--ui-muted)]">
                                  {formatRange(firstShift.start_time, firstShift.end_time, firstShift.show_end_as_close, firstShift.shift_kind)}
                                </div>
                              </>
                            )}
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

      <div className="space-y-4 2xl:sticky 2xl:top-24">
        {selectionMode ? (
          <div className="ui-panel space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[var(--ui-text)]">
                Selección múltiple
              </p>
              <p className="ui-caption text-[var(--ui-muted)]">
                Haz clic en bloques individuales para seleccionarlos. Si un bloque tiene varios trabajadores, se abre el detalle para que marques solo los que quieras.
              </p>
            </div>
            <p className="text-sm text-[var(--ui-muted)]">
              <span className="font-semibold text-[var(--ui-text)]">{selectedShiftIds.length}</span> turnos seleccionados
            </p>
            {selectionModeGroup ? (
              <div className="space-y-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--ui-text)]">
                      {getDayLabel(selectionModeGroup.shift_date)} ·{" "}
                      {formatRange(selectionModeGroup.start_time, selectionModeGroup.end_time, selectionModeGroup.show_end_as_close, selectionModeGroup.shift_kind)}
                    </p>
                    <p className="ui-caption text-[var(--ui-muted)]">
                      Selecciona uno o varios trabajadores de este horario.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectionModeGroup(null)}
                    className="text-xs font-medium text-[var(--ui-muted)] transition hover:text-[var(--ui-text)]"
                  >
                    Cerrar
                  </button>
                </div>
                <div className="space-y-1">
                  {selectionModeGroup.shifts.map((shift) => {
                    const employee = employeeById.get(shift.employee_id) ?? {
                      id: shift.employee_id,
                      full_name: null,
                      alias: null,
                      role: null,
                    };
                    const checked = selectedShiftIds.includes(shift.id);
                    return (
                      <label
                        key={shift.id}
                        className={`flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-sm transition ${
                          checked
                            ? "bg-[var(--ui-brand-soft)] text-[var(--ui-brand-600)]"
                            : "text-[var(--ui-text)] hover:bg-[var(--ui-brand-soft)]"
                        }`}
                      >
                        <span>
                          {getEmployeeLabel(employee)}
                          {employee.role ? (
                            <span className="ml-2 text-[var(--ui-muted)]">· {employee.role}</span>
                          ) : null}
                        </span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleShiftSelection(shift.id)}
                        />
                      </label>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => toggleGroupSelection(selectionModeGroup)}
                  className="ui-btn ui-btn--ghost ui-btn--sm w-full"
                >
                  {selectionModeGroup.shifts.every((shift) => selectedShiftIds.includes(shift.id))
                    ? "Quitar este bloque de la selección"
                    : "Seleccionar todo este bloque"}
                </button>
              </div>
            ) : null}
            <div className="space-y-2">
              <p className="text-sm font-semibold text-[var(--ui-text)]">
                Agregar trabajadores
              </p>
              <p className="ui-caption text-[var(--ui-muted)]">
                Copia estos bloques a otros trabajadores manteniendo día y horario.
              </p>
              <div className="max-h-48 space-y-1 overflow-auto pr-1 ui-scrollbar-subtle">
                {employees.map((employee) => {
                  const checked = bulkEmployeeIds.includes(employee.id);
                  return (
                    <label
                      key={employee.id}
                      className={`flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-sm transition ${
                        checked
                          ? "bg-[var(--ui-brand-soft)] text-[var(--ui-brand-600)]"
                          : "text-[var(--ui-text)] hover:bg-[var(--ui-brand-soft)]"
                      }`}
                    >
                      <span>
                        {getEmployeeLabel(employee)}
                        {employee.role ? (
                          <span className="ml-2 text-[var(--ui-muted)]">· {employee.role}</span>
                        ) : null}
                      </span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleBulkEmployee(employee.id)}
                      />
                    </label>
                  );
                })}
              </div>
              <form action={assignManyAction} className="space-y-2">
                <input type="hidden" name="return_to" value={returnTo} />
                {selectedShiftIds.map((shiftId) => (
                  <input key={shiftId} type="hidden" name="shift_ids" value={shiftId} />
                ))}
                {bulkEmployeeIds.map((employeeId) => (
                  <input key={employeeId} type="hidden" name="employee_ids" value={employeeId} />
                ))}
                <button
                  type="submit"
                  disabled={selectedShiftIds.length === 0 || bulkEmployeeIds.length === 0}
                  className="ui-btn ui-btn--brand ui-btn--sm w-full disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Agregar trabajadores seleccionados
                </button>
              </form>
            </div>
            <form action={deleteManyAction} className="space-y-2">
              <input type="hidden" name="return_to" value={returnTo} />
              {selectedShiftIds.map((shiftId) => (
                <input key={shiftId} type="hidden" name="shift_ids" value={shiftId} />
              ))}
              <button
                type="submit"
                disabled={selectedShiftIds.length === 0}
                className="ui-btn ui-btn--ghost ui-btn--sm w-full text-[var(--ui-danger)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Eliminar seleccionados
              </button>
            </form>
            <button type="button" onClick={toggleSelectionMode} className="ui-btn ui-btn--ghost ui-btn--sm w-full">
              Salir del modo selección
            </button>
          </div>
        ) : null}

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
                            {getDayLabel(s.shift_date)} — {formatRange(s.start_time, s.end_time, s.show_end_as_close, s.shift_kind)}
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

            {publishedHoursByEmployee.length > 0 ? (
              <div className="ui-panel space-y-0 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setPublishedHoursExpanded((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 py-3 text-left"
                >
                  <span className="text-sm font-semibold text-[var(--ui-text)]">
                    Horas publicadas por trabajador
                  </span>
                  <span className="text-[var(--ui-muted)]" aria-hidden>
                    {publishedHoursExpanded ? "▼" : "▶"}
                  </span>
                </button>
                {publishedHoursExpanded ? (
                  <div className="border-t border-[var(--ui-border)] pt-3">
                    <p className="ui-caption text-[var(--ui-muted)] mb-3">
                      Total de horas publicadas esta semana (solo publicados, sin detalle de turnos).
                    </p>
                    <ul className="max-h-64 space-y-2 overflow-auto pr-1 ui-scrollbar-subtle">
                      {publishedHoursByEmployee.map(({ employee, totalMinutes }) => (
                        <li
                          key={employee.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2"
                        >
                          <span className="text-sm font-semibold text-[var(--ui-text)] truncate">
                            {getEmployeeLabel(employee)}
                          </span>
                          <span className="text-sm font-semibold text-[var(--ui-brand)] shrink-0">
                            {formatMinutes(totalMinutes)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            {daysWithShifts.length > 0 ? (
              <div className="ui-panel space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-[var(--ui-text)]">
                      Aplicar día a otros
                    </p>
                    <p className="ui-caption text-[var(--ui-muted)]">
                      Copia el horario de una persona de un día al resto de días que elijas.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCopyDayPanelOpen((prev) => !prev)}
                    className="ui-btn ui-btn--ghost ui-btn--sm shrink-0"
                    aria-expanded={copyDayPanelOpen}
                  >
                    {copyDayPanelOpen ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
                {copyDayPanelOpen ? (
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
                ) : null}
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
            <p className="text-sm font-medium text-[var(--ui-text)]">
              {getDayLabel(selection.dayIso)} · {selection.startTime.slice(0, 5)}–{selection.endTime.slice(0, 5)}
            </p>
            <p className="ui-caption">
              Selecciona uno o varios trabajadores para este bloque horario.
            </p>

            <div className="max-h-64 space-y-1 overflow-auto pr-1 ui-scrollbar-subtle">
              {employees.map((emp) => {
                const checked = selection.employeeIds.includes(emp.id);
                return (
                  <label
                    key={emp.id}
                    className={`flex cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-sm transition ${
                      checked
                        ? "bg-[var(--ui-brand-soft)] text-[var(--ui-brand-600)]"
                        : "text-[var(--ui-text)] hover:bg-[var(--ui-brand-soft)]"
                    }`}
                  >
                    <span>
                      {getEmployeeLabel(emp)}
                      {emp.role ? (
                        <span className="ml-2 text-[var(--ui-muted)]">· {emp.role}</span>
                      ) : null}
                    </span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleEmployeeForSlot(emp.id)}
                    />
                  </label>
                );
              })}
            </div>

            {selection.employeeIds.length > 0 ? (
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
                  Seleccionados
                </p>
                <p className="mt-1 text-sm text-[var(--ui-text)]">
                  {selection.employeeIds
                    .map((id) =>
                      getEmployeeLabel(employeeById.get(id) ?? {
                        id,
                        full_name: null,
                        alias: null,
                        role: null,
                      }),
                    )
                    .join(", ")}
                </p>
              </div>
            ) : null}

            <form action={saveAction} className="space-y-3">
              <input type="hidden" name="shift_id" value="" />
              <input type="hidden" name="return_to" value={returnTo} />
              <input type="hidden" name="site_id" value={siteId} />
              <input type="hidden" name="break_minutes" value="0" />
              <input type="hidden" name="status" value="scheduled" />
              <input type="hidden" name="notes" value="" />
              <input type="hidden" name="slot_day" value={selection.dayIso} />
              <input type="hidden" name="slot_start" value={selection.startTime} />
              <input type="hidden" name="slot_end" value={selection.endTime} />
              {selection.employeeIds.map((employeeId) => (
                <input key={employeeId} type="hidden" name="employee_ids" value={employeeId} />
              ))}

              {selection.showTimeAdjust ? (
                <>
                  <label className="block">
                    <span className="ui-caption">Día</span>
                    <select
                      name="shift_date"
                      className="ui-input mt-1 w-full"
                      value={selection.dayIso}
                      onChange={(e) => setSlotTimeAdjust({ dayIso: e.target.value })}
                    >
                      {days.map((d) => (
                        <option key={d.iso} value={d.iso}>
                          {d.label} — {d.shortLabel}
                        </option>
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
                </>
              ) : (
                <>
                  <input type="hidden" name="shift_date" value={selection.dayIso} />
                  <input type="hidden" name="start_time" value={selection.startTime} />
                  <input type="hidden" name="end_time" value={selection.endTime} />
                  <p className="ui-body-muted">
                    {getDayLabel(selection.dayIso)} · {selection.startTime.slice(0, 5)} a {selection.endTime.slice(0, 5)}
                  </p>
                </>
              )}

              <label className="inline-flex items-center gap-2 text-sm text-[var(--ui-text)]">
                <input
                  type="checkbox"
                  name="show_end_as_close"
                  value="1"
                  className="rounded border-[var(--ui-border)]"
                />
                Mostrar salida como "Cierre" al empleado
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-[var(--ui-text)]">
                <input
                  type="checkbox"
                  name="rest_shift"
                  value="1"
                  className="rounded border-[var(--ui-border)]"
                />
                Marcar como turno de descanso (no laboral)
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-[var(--ui-text)]">
                <input
                  type="checkbox"
                  name="full_day_rest"
                  value="1"
                  className="rounded border-[var(--ui-border)]"
                />
                Marcar día completo como descanso
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={selection.employeeIds.length === 0}
                  className="ui-btn ui-btn--brand disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Guardar seleccionados
                </button>
                <button
                  type="submit"
                  name="keep_slot"
                  value="1"
                  disabled={selection.employeeIds.length === 0}
                  className="ui-btn ui-btn--ghost disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Guardar y seguir
                </button>
                <button
                  type="button"
                  onClick={toggleSlotTimeAdjust}
                  className="ui-btn ui-btn--ghost"
                >
                  {selection.showTimeAdjust ? "Ocultar ajuste" : "Ajustar horario"}
                </button>
                <button type="button" onClick={clearSelection} className="ui-btn ui-btn--ghost">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {selection?.type === "group" && (
          <div className="ui-panel space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-[var(--ui-text)]">
                {getDayLabel(selection.group.shift_date)} · {formatRange(selection.group.start_time, selection.group.end_time, selection.group.show_end_as_close, selection.group.shift_kind)}
              </p>
              <p className="ui-caption">
                {selection.group.shifts.length} {selection.group.shifts.length === 1 ? "trabajador" : "trabajadores"} en este bloque.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                setSelection({
                  type: "slot",
                  dayIso: selection.group.shift_date,
                  startTime: selection.group.start_time,
                  endTime: selection.group.end_time,
                  employeeIds: [],
                  showTimeAdjust: false,
                })
              }
              className="ui-btn ui-btn--ghost w-full"
            >
              Agregar trabajadores a este horario
            </button>

            <div className="space-y-3">
              {selection.group.shifts.map((shift) => {
                const employee = employeeById.get(shift.employee_id) ?? {
                  id: shift.employee_id,
                  full_name: null,
                  alias: null,
                  role: null,
                };
                return (
                  <div
                    key={shift.id}
                    className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3"
                  >
                    <p className="text-sm font-semibold text-[var(--ui-text)]">
                      {getEmployeeLabel(employee)}
                    </p>
                    <p className="mt-1 text-xs text-[var(--ui-muted)]">
                      {employee.role ?? "Sin rol"} · {getVisibleStatus(shift)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSelection({ type: "shift", shift, editing: true })}
                        className="ui-btn ui-btn--ghost ui-btn--sm"
                      >
                        Editar
                      </button>
                      <form action={deleteAction}>
                        <input type="hidden" name="shift_id" value={shift.id} />
                        <input type="hidden" name="employee_id" value={shift.employee_id} />
                        <input type="hidden" name="return_to" value={returnTo} />
                        <button type="submit" className="ui-btn ui-btn--ghost ui-btn--sm text-[var(--ui-danger)]">
                          Eliminar
                        </button>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>

            <button type="button" onClick={clearSelection} className="ui-btn ui-btn--ghost ui-btn--sm w-full">
              Cerrar
            </button>
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
                  {getDayLabel(selection.shift.shift_date)} · {formatRange(selection.shift.start_time, selection.shift.end_time, selection.shift.show_end_as_close, selection.shift.shift_kind)}
                </p>
                <p className="ui-caption">{getVisibleStatus(selection.shift)}</p>
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
