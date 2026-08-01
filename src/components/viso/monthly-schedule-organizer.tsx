"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import {
  getMonthlyOperationalViewAction,
  type MonthlyOperationalShiftView,
} from "@/app/staff/schedule/month/operational-view-actions";
import {
  getScheduleHiddenEmployeeIdsAction,
  setScheduleEmployeeHiddenAction,
} from "@/app/staff/schedule/month/visibility-actions";

type EmployeeSummary = {
  id: string;
  name: string;
  baseArea: string;
  operationalAreas: string[];
};

type MonthlyScheduleOrganizerProps = {
  returnTo: string;
};

const AREA_FILTERS = [
  { key: "all", label: "Todas" },
  { key: "caja", label: "Caja" },
  { key: "servicio", label: "Servicio" },
  { key: "barra", label: "Barra" },
  { key: "cocina", label: "Cocina" },
  { key: "general", label: "General" },
] as const;

const MONTHLY_AREA_ORDER = AREA_FILTERS.filter((filter) => filter.key !== "all").map(
  (filter) => filter.key,
);

function currentReturnTo(fallback: string) {
  if (typeof window === "undefined") return fallback;
  return `${window.location.pathname}${window.location.search}`;
}

function normalizeLabel(value: string | null | undefined, fallback: string) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function normalizeAreaKey(value: string | null | undefined) {
  const normalized = normalizeLabel(value, "General")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return (
    MONTHLY_AREA_ORDER.find((area) => normalized.includes(area)) ?? "general"
  );
}

function getAreaLabel(areaKey: string) {
  return AREA_FILTERS.find((filter) => filter.key === areaKey)?.label ?? "General";
}

function getAreaPriority(value: string | null | undefined) {
  const areaKey = normalizeAreaKey(value);
  const index = MONTHLY_AREA_ORDER.indexOf(areaKey);
  return index >= 0 ? index : MONTHLY_AREA_ORDER.length - 1;
}

function groupOperationalShifts(shifts: MonthlyOperationalShiftView[]) {
  const grouped = new Map<string, MonthlyOperationalShiftView[]>();
  for (const shift of shifts) {
    const key = `${shift.employeeId}__${shift.shiftDate}`;
    const rows = grouped.get(key) ?? [];
    rows.push(shift);
    grouped.set(key, rows);
  }

  for (const rows of grouped.values()) {
    rows.sort((first, second) => {
      const startComparison = first.startTime.localeCompare(second.startTime, "es");
      return startComparison !== 0
        ? startComparison
        : first.endTime.localeCompare(second.endTime, "es");
    });
  }

  return grouped;
}

function decorateShiftCard(
  detail: HTMLDetailsElement,
  shift: MonthlyOperationalShiftView,
  selectedArea: string,
) {
  detail.dataset.operationalArea = normalizeAreaKey(shift.areaLabel);
  detail.dataset.operationalRole = shift.roleLabel;

  const summary = detail.querySelector<HTMLElement>("summary");
  if (!summary) return;

  let badge = summary.querySelector<HTMLElement>("[data-operational-shift-label]");
  if (!badge) {
    badge = document.createElement("div");
    badge.dataset.operationalShiftLabel = "1";
    badge.className =
      "mt-1 rounded-md bg-white/80 px-1.5 py-1 text-[9px] font-bold leading-tight text-[var(--ui-text)] ring-1 ring-black/5";
    summary.appendChild(badge);
  }

  badge.textContent =
    shift.shiftKind === "descanso"
      ? "Descanso"
      : `${shift.areaLabel} · ${shift.roleLabel}`;

  const matches =
    selectedArea === "all" ||
    (shift.shiftKind !== "descanso" &&
      normalizeAreaKey(shift.areaLabel) === selectedArea);
  detail.style.opacity = matches ? "1" : "0.28";
  detail.style.filter = matches ? "none" : "grayscale(0.65)";
  detail.title = matches
    ? ""
    : `Turno visible para control, pero pertenece a ${shift.areaLabel}`;
}

function collectAndDecorateRows(
  shifts: MonthlyOperationalShiftView[],
  selectedArea: string,
) {
  const table = document.querySelector<HTMLTableElement>("table[data-month-table]");
  const body = table?.tBodies.item(0);
  if (!table || !body) {
    return { table: null, body: null, employees: [] as EmployeeSummary[] };
  }

  const shiftsByEmployeeDay = groupOperationalShifts(shifts);
  const employees: EmployeeSummary[] = [];
  const rows = Array.from(body.querySelectorAll<HTMLTableRowElement>("tr")).filter(
    (row) => !row.hasAttribute("data-month-area-header"),
  );

  for (const row of rows) {
    const employeeLink = row.querySelector<HTMLAnchorElement>(
      'a[href*="employee_id="]',
    );
    const firstCell = row.cells.item(0);
    if (!employeeLink || !firstCell) continue;

    const employeeId = new URL(
      employeeLink.href,
      window.location.origin,
    ).searchParams.get("employee_id");
    if (!employeeId) continue;

    const name = normalizeLabel(
      firstCell.querySelector("div.font-semibold")?.textContent,
      employeeId,
    );
    const baseArea = normalizeLabel(
      firstCell.querySelector("span.rounded-full")?.textContent,
      "General",
    );

    row.dataset.monthEmployeeId = employeeId;
    row.dataset.monthEmployeeName = name;
    row.dataset.monthBaseArea = baseArea;

    if (!firstCell.querySelector("[data-base-role-caption]")) {
      const caption = document.createElement("div");
      caption.dataset.baseRoleCaption = "1";
      caption.className = "mt-1 text-[9px] font-semibold uppercase text-[var(--ui-muted)]";
      caption.textContent = "Rol base del trabajador";
      const chipRow = firstCell.querySelector("div.mt-1");
      chipRow?.insertAdjacentElement("beforebegin", caption);
    }

    if (!firstCell.querySelector("[data-month-hide-employee]")) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.monthHideEmployee = employeeId;
      button.className =
        "mt-2 block text-[10px] font-semibold text-[var(--ui-muted)] underline decoration-dotted underline-offset-2 hover:text-[var(--ui-danger)]";
      button.textContent = "Ocultar de horarios";
      button.title = `Ocultar ${name} de las vistas de horarios`;
      firstCell.appendChild(button);
    }

    const employeeShifts = shifts.filter((shift) => shift.employeeId === employeeId);
    const operationalAreas = [
      ...new Set(
        employeeShifts
          .filter((shift) => shift.shiftKind !== "descanso")
          .map((shift) => normalizeAreaKey(shift.areaLabel)),
      ),
    ];
    row.dataset.monthOperationalAreas = operationalAreas.join(",");

    const month = employeeShifts[0]?.shiftDate.slice(0, 7) ?? "";
    for (let dayNumber = 1; dayNumber < row.cells.length - 1; dayNumber += 1) {
      const cell = row.cells.item(dayNumber);
      if (!cell || !month) continue;
      const shiftDate = `${month}-${String(dayNumber).padStart(2, "0")}`;
      const dayShifts = shiftsByEmployeeDay.get(`${employeeId}__${shiftDate}`) ?? [];
      const details = Array.from(
        cell.querySelectorAll<HTMLDetailsElement>("details[data-month-shift-menu]"),
      );
      details.forEach((detail, index) => {
        const shift = dayShifts[index];
        if (shift) decorateShiftCard(detail, shift, selectedArea);
      });
    }

    employees.push({ id: employeeId, name, baseArea, operationalAreas });
  }

  return { table, body, employees };
}

function synchronizeBuilderSelect(hiddenIds: Set<string>) {
  const dialog = document.querySelector<HTMLElement>(
    '[role="dialog"][aria-labelledby="monthly-shift-builder-title"]',
  );
  const select = dialog?.querySelector<HTMLSelectElement>("select");
  if (!select) return;

  for (const option of Array.from(select.options)) {
    const hidden = hiddenIds.has(option.value);
    option.hidden = hidden;
    option.disabled = hidden;
  }

  if (hiddenIds.has(select.value)) {
    const replacement = Array.from(select.options).find(
      (option) => !option.disabled && !option.hidden,
    );
    if (replacement) {
      select.value = replacement.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
}

function organizeRows(
  hiddenIds: Set<string>,
  shifts: MonthlyOperationalShiftView[],
  selectedArea: string,
) {
  const { table, body, employees } = collectAndDecorateRows(shifts, selectedArea);
  if (!table || !body) return employees;

  body
    .querySelectorAll<HTMLTableRowElement>("tr[data-month-area-header]")
    .forEach((row) => row.remove());

  const rows = Array.from(
    body.querySelectorAll<HTMLTableRowElement>("tr[data-month-employee-id]"),
  ).sort((first, second) => {
    if (selectedArea === "all") {
      const firstArea = normalizeLabel(first.dataset.monthBaseArea, "General");
      const secondArea = normalizeLabel(second.dataset.monthBaseArea, "General");
      const priorityComparison =
        getAreaPriority(firstArea) - getAreaPriority(secondArea);
      if (priorityComparison !== 0) return priorityComparison;
      const areaComparison = firstArea.localeCompare(secondArea, "es", {
        sensitivity: "base",
      });
      if (areaComparison !== 0) return areaComparison;
    }

    return normalizeLabel(first.dataset.monthEmployeeName, "").localeCompare(
      normalizeLabel(second.dataset.monthEmployeeName, ""),
      "es",
      { sensitivity: "base" },
    );
  });

  const groups = new Map<string, HTMLTableRowElement[]>();
  for (const row of rows) {
    const employeeId = row.dataset.monthEmployeeId ?? "";
    const operationalAreas = (row.dataset.monthOperationalAreas ?? "")
      .split(",")
      .filter(Boolean);
    const matchesArea =
      selectedArea === "all" || operationalAreas.includes(selectedArea);
    row.hidden = hiddenIds.has(employeeId) || !matchesArea;

    const groupLabel =
      selectedArea === "all"
        ? normalizeLabel(row.dataset.monthBaseArea, "General")
        : `${getAreaLabel(selectedArea)} · asignación operativa`;
    const groupRows = groups.get(groupLabel) ?? [];
    groupRows.push(row);
    groups.set(groupLabel, groupRows);
  }

  const columnCount = table.tHead?.rows.item(0)?.cells.length ?? 1;
  for (const [area, areaRows] of groups) {
    const visibleRows = areaRows.filter((row) => !row.hidden);
    if (visibleRows.length > 0) {
      const header = document.createElement("tr");
      header.dataset.monthAreaHeader = area;
      const cell = document.createElement("td");
      cell.colSpan = columnCount;
      cell.className =
        "border-b border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2 text-xs font-black uppercase tracking-wide text-[var(--ui-text)]";
      cell.textContent = `${area} · ${visibleRows.length} ${
        visibleRows.length === 1 ? "trabajador" : "trabajadores"
      }`;
      header.appendChild(cell);
      body.appendChild(header);
    }
    areaRows.forEach((row) => body.appendChild(row));
  }

  synchronizeBuilderSelect(hiddenIds);
  return employees;
}

export function MonthlyScheduleOrganizer({
  returnTo,
}: MonthlyScheduleOrganizerProps) {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [operationalShifts, setOperationalShifts] = useState<
    MonthlyOperationalShiftView[]
  >([]);
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [selectedArea, setSelectedArea] = useState("all");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const refreshLayout = useCallback(
    (
      nextHiddenIds: Set<string>,
      nextShifts: MonthlyOperationalShiftView[],
      nextArea: string,
    ) => {
      setEmployees(organizeRows(nextHiddenIds, nextShifts, nextArea));
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const safeReturnTo = currentReturnTo(returnTo);

    Promise.all([
      getScheduleHiddenEmployeeIdsAction(safeReturnTo),
      getMonthlyOperationalViewAction(safeReturnTo),
    ])
      .then(([ids, operationalView]) => {
        if (cancelled) return;
        const nextHiddenIds = new Set(ids);
        setHiddenIds(nextHiddenIds);
        setOperationalShifts(operationalView.shifts);
        refreshLayout(nextHiddenIds, operationalView.shifts, "all");
        setReady(true);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "No fue posible cargar la organización operativa.",
        );
        refreshLayout(new Set(), [], "all");
        setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshLayout, returnTo]);

  useEffect(() => {
    if (ready) refreshLayout(hiddenIds, operationalShifts, selectedArea);
  }, [hiddenIds, operationalShifts, ready, refreshLayout, selectedArea]);

  const updateVisibility = useCallback(
    (employeeId: string, hidden: boolean) => {
      setError("");
      startTransition(async () => {
        try {
          await setScheduleEmployeeHiddenAction({
            employeeId,
            hidden,
            returnTo: currentReturnTo(returnTo),
          });
          setHiddenIds((current) => {
            const next = new Set(current);
            if (hidden) next.add(employeeId);
            else next.delete(employeeId);
            return next;
          });
        } catch (cause: unknown) {
          setError(
            cause instanceof Error
              ? cause.message
              : "No fue posible cambiar la visibilidad.",
          );
        }
      });
    },
    [returnTo],
  );

  useEffect(() => {
    function handleHideClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>(
        "[data-month-hide-employee]",
      );
      const employeeId = button?.dataset.monthHideEmployee;
      if (!employeeId || hiddenIds.has(employeeId)) return;
      updateVisibility(employeeId, true);
    }

    document.addEventListener("click", handleHideClick);
    return () => document.removeEventListener("click", handleHideClick);
  }, [hiddenIds, updateVisibility]);

  const hiddenEmployees = employees
    .filter((employee) => hiddenIds.has(employee.id))
    .sort((first, second) => first.name.localeCompare(second.name, "es"));

  const visibleCount = useMemo(
    () =>
      employees.filter(
        (employee) =>
          !hiddenIds.has(employee.id) &&
          (selectedArea === "all" ||
            employee.operationalAreas.includes(selectedArea)),
      ).length,
    [employees, hiddenIds, selectedArea],
  );

  if (!ready && employees.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[min(520px,calc(100vw-2rem))] rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-[var(--ui-text)]">
            Planeación por asignación operativa
          </div>
          <div className="text-xs text-[var(--ui-muted)]">
            {visibleCount} trabajadores visibles · {hiddenEmployees.length} ocultos
          </div>
        </div>
        <details className="relative">
          <summary className="ui-btn ui-btn--ghost ui-btn--sm cursor-pointer list-none">
            Ocultos ({hiddenEmployees.length})
          </summary>
          <div className="absolute bottom-full right-0 mb-2 max-h-72 min-w-64 overflow-auto rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1 shadow-xl">
            {hiddenEmployees.length === 0 ? (
              <div className="px-3 py-2 text-xs text-[var(--ui-muted)]">
                No hay trabajadores ocultos.
              </div>
            ) : (
              hiddenEmployees.map((employee) => (
                <button
                  key={employee.id}
                  type="button"
                  className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-[var(--ui-surface-2)]"
                  onClick={() => updateVisibility(employee.id, false)}
                  disabled={pending}
                >
                  <span className="block font-semibold text-[var(--ui-text)]">
                    {employee.name}
                  </span>
                  <span className="block text-[10px] text-[var(--ui-muted)]">
                    Rol base: {employee.baseArea} · Mostrar de nuevo
                  </span>
                </button>
              ))
            )}
          </div>
        </details>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Filtrar por área operativa">
        {AREA_FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            className={
              selectedArea === filter.key
                ? "ui-btn ui-btn--brand ui-btn--sm"
                : "ui-btn ui-btn--ghost ui-btn--sm"
            }
            onClick={() => setSelectedArea(filter.key)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {selectedArea !== "all" ? (
        <div className="mt-2 text-[11px] text-[var(--ui-muted)]">
          Se muestran quienes tienen al menos un turno de {getAreaLabel(selectedArea)}.
          Sus asignaciones en otras áreas permanecen atenuadas para controlar cruces.
        </div>
      ) : null}

      {error ? (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">
          {error}
        </div>
      ) : null}
      {pending ? (
        <div className="mt-2 text-xs text-[var(--ui-muted)]">Actualizando…</div>
      ) : null}
    </div>
  );
}
