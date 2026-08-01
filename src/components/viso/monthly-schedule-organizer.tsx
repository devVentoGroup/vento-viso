"use client";

import { useCallback, useEffect, useState, useTransition } from "react";

import {
  getScheduleHiddenEmployeeIdsAction,
  setScheduleEmployeeHiddenAction,
} from "@/app/staff/schedule/month/visibility-actions";

type EmployeeSummary = {
  id: string;
  name: string;
  area: string;
};

type MonthlyScheduleOrganizerProps = {
  returnTo: string;
};

const MONTHLY_AREA_ORDER = [
  "caja",
  "servicio",
  "barra",
  "cocina",
  "general",
] as const;

function normalizeLabel(value: string | null | undefined, fallback: string) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function normalizeAreaKey(value: string | null | undefined) {
  return normalizeLabel(value, "General")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getAreaPriority(value: string | null | undefined) {
  const normalized = normalizeAreaKey(value);
  const matchedIndex = MONTHLY_AREA_ORDER.findIndex((area) =>
    normalized.includes(area),
  );
  if (matchedIndex >= 0) return matchedIndex;

  // Las áreas no previstas quedan antes de General, que siempre cierra la lista.
  return MONTHLY_AREA_ORDER.length - 1;
}

function collectRows() {
  const table = document.querySelector<HTMLTableElement>("table[data-month-table]");
  const body = table?.tBodies.item(0);
  if (!table || !body) {
    return { table: null, body: null, employees: [] as EmployeeSummary[] };
  }

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
    const area = normalizeLabel(
      firstCell.querySelector("span.rounded-full")?.textContent,
      "General",
    );

    row.dataset.monthEmployeeId = employeeId;
    row.dataset.monthEmployeeName = name;
    row.dataset.monthArea = area;

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

    employees.push({ id: employeeId, name, area });
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

function organizeRows(hiddenIds: Set<string>) {
  const { table, body, employees } = collectRows();
  if (!table || !body) return employees;

  body
    .querySelectorAll<HTMLTableRowElement>("tr[data-month-area-header]")
    .forEach((row) => row.remove());

  const rows = Array.from(
    body.querySelectorAll<HTMLTableRowElement>("tr[data-month-employee-id]"),
  ).sort((first, second) => {
    const firstArea = normalizeLabel(first.dataset.monthArea, "General");
    const secondArea = normalizeLabel(second.dataset.monthArea, "General");
    const priorityComparison =
      getAreaPriority(firstArea) - getAreaPriority(secondArea);
    if (priorityComparison !== 0) return priorityComparison;

    const areaComparison = firstArea.localeCompare(secondArea, "es", {
      sensitivity: "base",
    });
    if (areaComparison !== 0) return areaComparison;

    return normalizeLabel(first.dataset.monthEmployeeName, "").localeCompare(
      normalizeLabel(second.dataset.monthEmployeeName, ""),
      "es",
      { sensitivity: "base" },
    );
  });

  const groups = new Map<string, HTMLTableRowElement[]>();
  for (const row of rows) {
    const employeeId = row.dataset.monthEmployeeId ?? "";
    row.hidden = hiddenIds.has(employeeId);
    const area = normalizeLabel(row.dataset.monthArea, "General");
    const areaRows = groups.get(area) ?? [];
    areaRows.push(row);
    groups.set(area, areaRows);
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
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const refreshLayout = useCallback((nextHiddenIds: Set<string>) => {
    setEmployees(organizeRows(nextHiddenIds));
  }, []);

  useEffect(() => {
    let cancelled = false;

    getScheduleHiddenEmployeeIdsAction(returnTo)
      .then((ids) => {
        if (cancelled) return;
        const next = new Set(ids);
        setHiddenIds(next);
        refreshLayout(next);
        setReady(true);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "No fue posible cargar los trabajadores ocultos.",
        );
        refreshLayout(new Set());
        setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshLayout, returnTo]);

  useEffect(() => {
    if (ready) refreshLayout(hiddenIds);
  }, [hiddenIds, ready, refreshLayout]);

  const updateVisibility = useCallback(
    (employeeId: string, hidden: boolean) => {
      setError("");
      startTransition(async () => {
        try {
          await setScheduleEmployeeHiddenAction({ employeeId, hidden, returnTo });
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

  if (!ready && employees.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[min(360px,calc(100vw-2rem))] rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3 shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-[var(--ui-text)]">
            Vista mensual por áreas
          </div>
          <div className="text-xs text-[var(--ui-muted)]">
            {hiddenEmployees.length} ocultos en todas las vistas de horarios
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
                    {employee.area} · Mostrar de nuevo
                  </span>
                </button>
              ))
            )}
          </div>
        </details>
      </div>
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
