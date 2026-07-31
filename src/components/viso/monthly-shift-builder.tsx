"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { createMonthlyShiftsAction } from "@/app/staff/schedule/month/actions";

type EmployeeOption = {
  id: string;
  label: string;
  currentMinutes: number;
  defaultRoleContext: string;
};

type RoleOption = {
  value: string;
  label: string;
};

type MonthDayOption = {
  iso: string;
  dayNumber: number;
  weekday: string;
  isWeekend: boolean;
};

type ShiftBlock = {
  id: string;
  roleContext: string;
  startTime: string;
  endTime: string;
  notes: string;
  dates: string[];
  notesOpen: boolean;
};

const MAX_MONTHLY_SHIFT_BLOCKS = 12;

type MonthlyShiftBuilderProps = {
  siteId: string;
  month: string;
  returnTo: string;
  closeHref: string;
  employees: EmployeeOption[];
  roleOptions: RoleOption[];
  days: MonthDayOption[];
  defaultEmployeeId: string;
  defaultDate?: string;
  limitMinutes: number;
  warningMinutes: number;
};

function parseTimeMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function toTimeValue(minutes: number) {
  const normalized = Math.max(0, Math.min(23 * 60 + 59, minutes));
  const hours = Math.floor(normalized / 60);
  const remainder = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function getBlockMinutes(block: Pick<ShiftBlock, "startTime" | "endTime">) {
  const start = parseTimeMinutes(block.startTime);
  const end = parseTimeMinutes(block.endTime);
  if (start === null || end === null || end <= start) return 0;
  return end - start;
}

function formatHours(minutes: number) {
  const hours = Math.max(0, minutes) / 60;
  return `${hours
    .toFixed(Number.isInteger(hours) ? 0 : 1)
    .replace(".", ",")} h`;
}

function formatTimeLabel(value: string) {
  const minutes = parseTimeMinutes(value);
  if (minutes === null) return value || "--:--";
  const date = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
  return date
    .toLocaleTimeString("es-CO", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
    .replace(/\s/g, " ");
}

function createInitialBlock(defaultRoleContext: string, defaultDate?: string): ShiftBlock {
  return {
    id: "block-1",
    roleContext: defaultRoleContext,
    startTime: "06:00",
    endTime: "14:00",
    notes: "",
    dates: defaultDate ? [defaultDate] : [],
    notesOpen: false,
  };
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className="ui-btn ui-btn--brand"
      disabled={disabled || pending}
    >
      {pending ? "Guardando..." : "Guardar como borrador"}
    </button>
  );
}

export function MonthlyShiftBuilder({
  siteId,
  month,
  returnTo,
  closeHref,
  employees,
  roleOptions,
  days,
  defaultEmployeeId,
  defaultDate,
  limitMinutes,
  warningMinutes,
}: MonthlyShiftBuilderProps) {
  const fallbackEmployee = employees[0] ?? null;
  const initialEmployee =
    employees.find((employee) => employee.id === defaultEmployeeId) ??
    fallbackEmployee;
  const [employeeId, setEmployeeId] = useState(initialEmployee?.id ?? "");
  const [blocks, setBlocks] = useState<ShiftBlock[]>([
    createInitialBlock(initialEmployee?.defaultRoleContext ?? "", defaultDate),
  ]);
  const [activeBlockId, setActiveBlockId] = useState("block-1");
  const [nextBlockNumber, setNextBlockNumber] = useState(2);
  const [movementNotice, setMovementNotice] = useState("");

  const employee =
    employees.find((candidate) => candidate.id === employeeId) ?? fallbackEmployee;
  const currentMinutes = employee?.currentMinutes ?? 0;
  const roleLabelByValue = useMemo(
    () => new Map(roleOptions.map((option) => [option.value, option.label])),
    [roleOptions],
  );

  const dateOwner = useMemo(() => {
    const owner = new Map<string, string>();
    for (const block of blocks) {
      for (const date of block.dates) owner.set(date, block.id);
    }
    return owner;
  }, [blocks]);

  const effectiveBlocks = blocks.filter((block) => block.dates.length > 0);
  const newMinutes = effectiveBlocks.reduce(
    (total, block) => total + getBlockMinutes(block) * block.dates.length,
    0,
  );
  const projectedMinutes = currentMinutes + newMinutes;
  const invalidBlocks = effectiveBlocks.filter(
    (block) => !block.roleContext || getBlockMinutes(block) <= 0,
  );
  const canSubmit =
    Boolean(employeeId) &&
    effectiveBlocks.length > 0 &&
    invalidBlocks.length === 0;

  const serializedBlocks = JSON.stringify(
    effectiveBlocks.map((block) => ({
      roleContext: block.roleContext,
      startTime: block.startTime,
      endTime: block.endTime,
      notes: block.notes.trim(),
      dates: [...block.dates].sort(),
    })),
  );

  const projectionState =
    projectedMinutes > limitMinutes
      ? {
          className: "border-red-300 bg-red-50 text-red-900",
          status: `Excede por ${formatHours(projectedMinutes - limitMinutes)}. Se guardará únicamente como borrador.`,
        }
      : projectedMinutes >= warningMinutes
        ? {
            className: "border-amber-300 bg-amber-50 text-amber-900",
            status: `Cerca del límite · Restan ${formatHours(limitMinutes - projectedMinutes)}`,
          }
        : {
            className: "border-emerald-200 bg-emerald-50 text-emerald-900",
            status: `Dentro del límite · Restan ${formatHours(limitMinutes - projectedMinutes)}`,
          };

  function updateBlock(blockId: string, patch: Partial<ShiftBlock>) {
    setBlocks((current) =>
      current.map((block) => (block.id === blockId ? { ...block, ...patch } : block)),
    );
  }

  function handleEmployeeChange(nextEmployeeId: string) {
    const nextEmployee = employees.find((candidate) => candidate.id === nextEmployeeId);
    setEmployeeId(nextEmployeeId);
    setBlocks((current) =>
      current.map((block) => ({
        ...block,
        roleContext: nextEmployee?.defaultRoleContext || block.roleContext,
      })),
    );
  }

  function toggleDate(blockId: string, date: string, checked: boolean) {
    const previousOwnerId = dateOwner.get(date);
    setBlocks((current) =>
      current.map((block) => {
        const withoutDate = block.dates.filter((candidate) => candidate !== date);
        if (block.id === blockId && checked) {
          return { ...block, dates: [...withoutDate, date].sort() };
        }
        return { ...block, dates: withoutDate };
      }),
    );

    if (checked && previousOwnerId && previousOwnerId !== blockId) {
      const previousIndex = blocks.findIndex((block) => block.id === previousOwnerId);
      const nextIndex = blocks.findIndex((block) => block.id === blockId);
      setMovementNotice(
        `El día ${Number(date.slice(-2))} se movió de Horario ${previousIndex + 1} a Horario ${nextIndex + 1}.`,
      );
    } else {
      setMovementNotice("");
    }
  }

  function applyDatePreset(blockId: string, mode: "weekdays" | "all" | "clear") {
    const selected =
      mode === "clear"
        ? []
        : days
            .filter((day) => mode === "all" || !day.isWeekend)
            .map((day) => day.iso);
    const selectedSet = new Set(selected);
    let movedCount = 0;

    movedCount = blocks
      .filter((block) => block.id !== blockId)
      .reduce(
        (total, block) =>
          total + block.dates.filter((date) => selectedSet.has(date)).length,
        0,
      );

    setBlocks((current) =>
      current.map((block) => {
        const keptDates = block.dates.filter((date) => !selectedSet.has(date));
        if (block.id === blockId) {
          return { ...block, dates: [...selected].sort() };
        }
        return { ...block, dates: keptDates };
      }),
    );

    setMovementNotice(
      movedCount > 0
        ? `${movedCount} ${movedCount === 1 ? "día se movió" : "días se movieron"} desde otros horarios.`
        : "",
    );
  }

  function addBlock() {
    const source =
      blocks.find((block) => block.id === activeBlockId) ?? blocks[blocks.length - 1];
    const sourceDuration = source ? getBlockMinutes(source) : 8 * 60;
    const sourceEnd = source ? parseTimeMinutes(source.endTime) : 14 * 60;
    let startTime = source?.endTime ?? "14:00";
    let endTime = "22:00";

    if (
      sourceEnd === null ||
      sourceDuration <= 0 ||
      sourceEnd + sourceDuration > 23 * 60 + 59
    ) {
      startTime = "06:00";
      endTime = "14:00";
    } else {
      endTime = toTimeValue(sourceEnd + sourceDuration);
    }

    const id = `block-${nextBlockNumber}`;
    const nextBlock: ShiftBlock = {
      id,
      roleContext:
        source?.roleContext ||
        employee?.defaultRoleContext ||
        (roleOptions.length === 1 ? roleOptions[0]?.value ?? "" : ""),
      startTime,
      endTime,
      notes: "",
      dates: [],
      notesOpen: false,
    };

    setBlocks((current) => [...current, nextBlock]);
    setActiveBlockId(id);
    setNextBlockNumber((current) => current + 1);
    setMovementNotice("");
  }

  function removeBlock(blockId: string) {
    const next = blocks.filter((block) => block.id !== blockId);
    setBlocks(next);
    if (activeBlockId === blockId) {
      setActiveBlockId(next[0]?.id ?? "");
    }
    setMovementNotice("");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/35 px-3 py-6 backdrop-blur-[1px] sm:px-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="monthly-shift-builder-title"
    >
      <div className="w-full max-w-6xl rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 shadow-2xl sm:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div id="monthly-shift-builder-title" className="ui-h3">
              Crear turnos del mes
            </div>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">
              Crea uno o varios horarios. Cada día puede pertenecer a un solo bloque para evitar duplicados accidentales.
            </p>
          </div>
          <Link href={closeHref} className="ui-btn ui-btn--ghost ui-btn--sm">
            Cerrar
          </Link>
        </div>

        <form action={createMonthlyShiftsAction} className="space-y-4">
          <input type="hidden" name="site_id" value={siteId} />
          <input type="hidden" name="month" value={month} />
          <input type="hidden" name="return_to" value={returnTo} />
          <input type="hidden" name="employee_id" value={employeeId} />
          <input type="hidden" name="blocks_json" value={serializedBlocks} />

          <label className="flex max-w-xl flex-col gap-1">
            <span className="ui-label">Trabajador</span>
            <select
              className="ui-input"
              value={employeeId}
              onChange={(event) => handleEmployeeChange(event.target.value)}
              required
            >
              {employees.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label} · {formatHours(option.currentMinutes)}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-[var(--ui-text)]">
                  Horarios del mes
                </div>
                <div className="text-xs text-[var(--ui-muted)]">
                  Solo el horario que estás editando permanece desplegado.
                </div>
              </div>
              <button
                type="button"
                className="ui-btn ui-btn--ghost ui-btn--sm"
                onClick={addBlock}
                disabled={blocks.length >= MAX_MONTHLY_SHIFT_BLOCKS}
              >
                {blocks.length >= MAX_MONTHLY_SHIFT_BLOCKS
                  ? "Máximo de horarios alcanzado"
                  : "+ Agregar otro horario"}
              </button>
            </div>

            {blocks.map((block, blockIndex) => {
              const isActive = block.id === activeBlockId;
              const blockMinutes = getBlockMinutes(block);
              const blockTotal = blockMinutes * block.dates.length;
              const blockRoleLabel =
                roleLabelByValue.get(block.roleContext) ?? "Rol sin seleccionar";

              return (
                <section
                  key={block.id}
                  className={`overflow-hidden rounded-2xl border transition ${
                    isActive
                      ? "border-[var(--ui-brand)] bg-[var(--ui-surface)] shadow-sm"
                      : "border-[var(--ui-border)] bg-[var(--ui-surface-2)]"
                  }`}
                >
                  <div className="flex items-center gap-2 px-3 py-2.5 sm:px-4">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setActiveBlockId(block.id)}
                      aria-expanded={isActive}
                    >
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-sm font-bold text-[var(--ui-text)]">
                          Horario {blockIndex + 1}
                        </span>
                        <span className="text-xs font-semibold text-[var(--ui-muted)]">
                          {formatTimeLabel(block.startTime)}–{formatTimeLabel(block.endTime)}
                        </span>
                        <span className="text-xs text-[var(--ui-muted)]">
                          {block.dates.length} {block.dates.length === 1 ? "día" : "días"} · {formatHours(blockTotal)}
                        </span>
                      </div>
                      {!isActive ? (
                        <div className="mt-1 truncate text-xs text-[var(--ui-muted)]">
                          {blockRoleLabel}
                        </div>
                      ) : null}
                    </button>

                    {blocks.length > 1 ? (
                      <button
                        type="button"
                        className="ui-btn ui-btn--ghost ui-btn--sm text-[var(--ui-danger)]"
                        onClick={() => removeBlock(block.id)}
                      >
                        Quitar
                      </button>
                    ) : null}
                  </div>

                  {isActive ? (
                    <div className="space-y-4 border-t border-[var(--ui-border)] p-3 sm:p-4">
                      <div className="grid gap-3 lg:grid-cols-8">
                        <label className="flex flex-col gap-1 lg:col-span-4">
                          <span className="ui-label">Área y rol operativo</span>
                          <select
                            className="ui-input"
                            value={block.roleContext}
                            onChange={(event) =>
                              updateBlock(block.id, { roleContext: event.target.value })
                            }
                            required={block.dates.length > 0}
                          >
                            <option value="" disabled>
                              Seleccionar
                            </option>
                            {roleOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="flex flex-col gap-1 lg:col-span-2">
                          <span className="ui-label">Inicio</span>
                          <input
                            type="time"
                            className="ui-input"
                            value={block.startTime}
                            step={1800}
                            onChange={(event) =>
                              updateBlock(block.id, { startTime: event.target.value })
                            }
                            required={block.dates.length > 0}
                          />
                        </label>

                        <label className="flex flex-col gap-1 lg:col-span-2">
                          <span className="ui-label">Fin</span>
                          <input
                            type="time"
                            className="ui-input"
                            value={block.endTime}
                            step={1800}
                            onChange={(event) =>
                              updateBlock(block.id, { endTime: event.target.value })
                            }
                            required={block.dates.length > 0}
                          />
                        </label>
                      </div>

                      {block.dates.length > 0 && blockMinutes <= 0 ? (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                          La hora de fin debe ser posterior a la hora de inicio.
                        </div>
                      ) : null}

                      <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3 sm:p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-[var(--ui-text)]">
                              Días de este horario
                            </div>
                            <div className="text-xs text-[var(--ui-muted)]">
                              Al seleccionar un día usado por otro horario, se moverá a este bloque.
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="ui-btn ui-btn--ghost ui-btn--sm"
                              onClick={() => applyDatePreset(block.id, "weekdays")}
                            >
                              Lunes a viernes
                            </button>
                            <button
                              type="button"
                              className="ui-btn ui-btn--ghost ui-btn--sm"
                              onClick={() => applyDatePreset(block.id, "all")}
                            >
                              Todo el mes
                            </button>
                            <button
                              type="button"
                              className="ui-btn ui-btn--ghost ui-btn--sm"
                              onClick={() => applyDatePreset(block.id, "clear")}
                            >
                              Limpiar
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-7 lg:grid-cols-10 xl:grid-cols-12">
                          {days.map((day) => {
                            const ownerId = dateOwner.get(day.iso);
                            const ownerIndex = blocks.findIndex(
                              (candidate) => candidate.id === ownerId,
                            );
                            const ownedHere = ownerId === block.id;
                            const ownedElsewhere = Boolean(ownerId && !ownedHere);

                            return (
                              <label
                                key={day.iso}
                                className={`relative flex cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-2 text-sm transition hover:bg-[var(--ui-surface)] ${
                                  ownedHere
                                    ? "border-[var(--ui-brand)] bg-violet-50/70"
                                    : ownedElsewhere
                                      ? "border-violet-200 bg-violet-50/70"
                                      : day.isWeekend
                                        ? "border-amber-200 bg-amber-50/60"
                                        : "border-[var(--ui-border)] bg-[var(--ui-surface)]"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={ownedHere}
                                  onChange={(event) =>
                                    toggleDate(block.id, day.iso, event.target.checked)
                                  }
                                  className="rounded border-[var(--ui-border)]"
                                />
                                <span className="min-w-0">
                                  <span className="block font-semibold text-[var(--ui-text)]">
                                    {day.dayNumber}
                                  </span>
                                  <span className="block truncate text-[10px] uppercase text-[var(--ui-muted)]">
                                    {day.weekday}
                                  </span>
                                </span>
                                {ownedElsewhere ? (
                                  <span className="absolute right-1 top-1 rounded bg-violet-100 px-1 text-[8px] font-bold text-violet-700">
                                    H{ownerIndex + 1}
                                  </span>
                                ) : null}
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      {block.notesOpen || block.notes ? (
                        <label className="flex flex-col gap-1">
                          <span className="ui-label">Nota opcional</span>
                          <div className="flex gap-2">
                            <input
                              className="ui-input"
                              maxLength={240}
                              value={block.notes}
                              onChange={(event) =>
                                updateBlock(block.id, { notes: event.target.value })
                              }
                              placeholder="Ej. Caja, apertura, apoyo de barra"
                            />
                            {!block.notes ? (
                              <button
                                type="button"
                                className="ui-btn ui-btn--ghost"
                                onClick={() =>
                                  updateBlock(block.id, { notesOpen: false })
                                }
                              >
                                Ocultar
                              </button>
                            ) : null}
                          </div>
                        </label>
                      ) : (
                        <button
                          type="button"
                          className="text-left text-sm font-semibold text-[var(--ui-brand)]"
                          onClick={() => updateBlock(block.id, { notesOpen: true })}
                        >
                          + Agregar nota a este horario
                        </button>
                      )}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>

          {movementNotice ? (
            <div
              className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-800"
              aria-live="polite"
            >
              {movementNotice}
            </div>
          ) : null}

          <div
            className={`rounded-2xl border p-4 ${projectionState.className}`}
            aria-live="polite"
          >
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <div className="text-xs font-semibold uppercase opacity-70">Actual</div>
                <div className="mt-1 text-xl font-bold">{formatHours(currentMinutes)}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase opacity-70">Nuevas</div>
                <div className="mt-1 text-xl font-bold">{formatHours(newMinutes)}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase opacity-70">Proyectado</div>
                <div className="mt-1 text-xl font-bold">
                  {formatHours(projectedMinutes)} / {formatHours(limitMinutes)}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase opacity-70">Estado</div>
                <div className="mt-1 text-sm font-bold">{projectionState.status}</div>
              </div>
            </div>

            {effectiveBlocks.length > 0 ? (
              <div className="mt-3 border-t border-current/20 pt-3 text-xs font-medium opacity-80">
                {effectiveBlocks.map((block) => {
                  const index = blocks.findIndex((candidate) => candidate.id === block.id);
                  const minutes = getBlockMinutes(block);
                  return (
                    <span key={block.id} className="mr-4 inline-block">
                      Horario {index + 1}: {block.dates.length} × {formatHours(minutes)} = {formatHours(minutes * block.dates.length)}
                    </span>
                  );
                })}
              </div>
            ) : null}
          </div>

          {!canSubmit ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {effectiveBlocks.length === 0
                ? "Selecciona al menos un día en alguno de los horarios."
                : "Corrige los horarios seleccionados antes de guardar."}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <Link href={closeHref} className="ui-btn ui-btn--ghost">
              Cancelar
            </Link>
            <SubmitButton disabled={!canSubmit} />
          </div>
        </form>
      </div>
    </div>
  );
}
