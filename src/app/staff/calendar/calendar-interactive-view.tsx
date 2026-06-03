"use client";

import { useMemo, useState } from "react";

type CalendarEventType =
  | "holiday"
  | "mother_day"
  | "commercial"
  | "operations"
  | "other"
  | "contract_start"
  | "contract_end"
  | "maintenance";

type CalendarEvent = {
  date: string;
  type: CalendarEventType;
  title: string;
  detail?: string;
  siteId?: string | null;
  priority: "high" | "medium" | "low";
  href?: string;
};

type CalendarInteractiveViewProps = {
  events: CalendarEvent[];
  weekRows: string[][];
  weekDayLabels: string[];
  monthKey: string;
  monthLabel: string;
  selectedView: "both" | "month" | "list";
};

function eventTypeLabel(value: CalendarEventType): string {
  if (value === "holiday") return "Festivo";
  if (value === "mother_day") return "Día Madre";
  if (value === "commercial") return "Comercial";
  if (value === "operations") return "Operación";
  if (value === "other") return "Manual";
  if (value === "contract_start") return "Inicio contrato";
  if (value === "contract_end") return "Vence contrato";
  return "Mantenimiento";
}

function eventEmoji(value: CalendarEventType): string {
  if (value === "holiday") return "🎉";
  if (value === "mother_day") return "💐";
  if (value === "commercial") return "💖";
  if (value === "operations") return "☕";
  if (value === "other") return "📌";
  if (value === "contract_start") return "🟢";
  if (value === "contract_end") return "🧾";
  return "🛠️";
}

function eventCardClass(value: CalendarEventType): string {
  if (value === "holiday") return "border-indigo-100 bg-indigo-50 text-indigo-950";
  if (value === "mother_day") return "border-pink-100 bg-pink-50 text-pink-950";
  if (value === "commercial") return "border-fuchsia-100 bg-fuchsia-50 text-fuchsia-950";
  if (value === "operations") return "border-cyan-100 bg-cyan-50 text-cyan-950";
  if (value === "other") return "border-slate-200 bg-slate-50 text-slate-950";
  if (value === "contract_start") return "border-emerald-100 bg-emerald-50 text-emerald-950";
  if (value === "contract_end") return "border-rose-100 bg-rose-50 text-rose-950";
  return "border-amber-100 bg-amber-50 text-amber-950";
}

function eventDotClass(value: CalendarEventType): string {
  if (value === "holiday") return "bg-indigo-500";
  if (value === "mother_day") return "bg-pink-500";
  if (value === "commercial") return "bg-fuchsia-500";
  if (value === "operations") return "bg-cyan-500";
  if (value === "other") return "bg-slate-500";
  if (value === "contract_start") return "bg-emerald-500";
  if (value === "contract_end") return "bg-rose-500";
  return "bg-amber-500";
}

function priorityLabel(value: CalendarEvent["priority"]) {
  if (value === "high") return "Alta";
  if (value === "low") return "Baja";
  return "Media";
}

function priorityClass(value: CalendarEvent["priority"]) {
  if (value === "high") return "border-red-200 bg-red-50 text-red-700";
  if (value === "low") return "border-slate-200 bg-slate-50 text-slate-600";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function formatDay(dateIso: string) {
  return new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long" }).format(
    new Date(`${dateIso}T12:00:00`),
  );
}

function formatShortDate(dateIso: string) {
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" }).format(
    new Date(`${dateIso}T12:00:00`),
  );
}

function groupEvents(events: CalendarEvent[]) {
  return events.reduce((acc, event) => {
    const list = acc.get(event.date) ?? [];
    list.push(event);
    acc.set(event.date, list);
    return acc;
  }, new Map<string, CalendarEvent[]>());
}

function DayEventCard({ event, compact = false }: { event: CalendarEvent; compact?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${eventCardClass(event.type)}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/80 text-xl shadow-sm">
          {eventEmoji(event.type)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/70 bg-white/70 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide">
              {eventTypeLabel(event.type)}
            </span>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${priorityClass(event.priority)}`}>
              {priorityLabel(event.priority)}
            </span>
          </div>
          <div className="mt-2 text-sm font-black leading-5">{event.title}</div>
          {event.detail ? (
            <p className={`mt-1 leading-5 ${compact ? "line-clamp-2 text-xs" : "text-sm"} opacity-80`}>
              {event.detail}
            </p>
          ) : null}
          {event.href ? (
            <a
              href={event.href}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex rounded-full bg-white/80 px-3 py-1.5 text-xs font-black text-slate-800 shadow-sm hover:bg-white"
            >
              Abrir detalle →
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function CalendarInteractiveView({
  events,
  weekRows,
  weekDayLabels,
  monthKey,
  monthLabel,
  selectedView,
}: CalendarInteractiveViewProps) {
  const grouped = useMemo(() => groupEvents(events), [events]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const selectedEvents = selectedDate ? grouped.get(selectedDate) ?? [] : [];
  const todayIso = new Date().toISOString().slice(0, 10);

  const eventCounts = useMemo(() => {
    return {
      holiday: events.filter((event) => event.type === "holiday" || event.type === "mother_day").length,
      contract: events.filter((event) => event.type === "contract_start" || event.type === "contract_end").length,
      maintenance: events.filter((event) => event.type === "maintenance").length,
      operations: events.filter((event) => event.type === "operations" || event.type === "commercial" || event.type === "other").length,
    };
  }, [events]);

  const orderedDates = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));

  return (
    <>
      {selectedView !== "list" ? (
        <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 p-5 text-white">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold uppercase tracking-[0.2em] text-white/60">Vista mensual</div>
                <h2 className="mt-1 text-2xl font-black capitalize">{monthLabel}</h2>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="rounded-2xl bg-white/10 px-3 py-2">
                  <div className="text-lg">🎉</div>
                  <div className="font-black">{eventCounts.holiday}</div>
                </div>
                <div className="rounded-2xl bg-white/10 px-3 py-2">
                  <div className="text-lg">🧾</div>
                  <div className="font-black">{eventCounts.contract}</div>
                </div>
                <div className="rounded-2xl bg-white/10 px-3 py-2">
                  <div className="text-lg">🛠️</div>
                  <div className="font-black">{eventCounts.maintenance}</div>
                </div>
                <div className="rounded-2xl bg-white/10 px-3 py-2">
                  <div className="text-lg">📌</div>
                  <div className="font-black">{eventCounts.operations}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto p-4">
            <div className="min-w-[860px]">
              <div className="grid grid-cols-7 gap-3 text-xs font-black uppercase tracking-wide text-slate-400">
                {weekDayLabels.map((label) => (
                  <div key={label} className="px-2 py-2">
                    {label}
                  </div>
                ))}
              </div>

              <div className="grid gap-3">
                {weekRows.map((week, weekIdx) => (
                  <div key={`week-${weekIdx}`} className="grid grid-cols-7 gap-3">
                    {week.map((dateIso) => {
                      const dayDate = new Date(`${dateIso}T12:00:00`);
                      const inMonth = dateIso.slice(0, 7) === monthKey;
                      const dayEvents = grouped.get(dateIso) ?? [];
                      const isToday = dateIso === todayIso;
                      const highCount = dayEvents.filter((event) => event.priority === "high").length;

                      return (
                        <button
                          key={dateIso}
                          type="button"
                          onClick={() => setSelectedDate(dateIso)}
                          className={`min-h-[132px] rounded-[1.35rem] border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
                            inMonth ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50/70 opacity-70"
                          } ${isToday ? "ring-2 ring-cyan-300" : ""}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className={`text-lg font-black ${inMonth ? "text-slate-950" : "text-slate-400"}`}>
                                {dayDate.getDate()}
                              </div>
                              {isToday ? <div className="text-[10px] font-black uppercase text-cyan-700">Hoy</div> : null}
                            </div>
                            {dayEvents.length > 0 ? (
                              <div className="rounded-full bg-slate-950 px-2.5 py-1 text-xs font-black text-white">
                                {dayEvents.length}
                              </div>
                            ) : null}
                          </div>

                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {Array.from(new Set(dayEvents.map((event) => event.type))).slice(0, 5).map((type) => (
                              <span key={type} className={`h-2.5 w-2.5 rounded-full ${eventDotClass(type)}`} />
                            ))}
                          </div>

                          <div className="mt-3 space-y-1.5">
                            {dayEvents.slice(0, 3).map((event, idx) => (
                              <div
                                key={`${dateIso}-${event.type}-${idx}`}
                                className={`truncate rounded-full border px-2 py-1 text-[11px] font-bold ${eventCardClass(event.type)}`}
                              >
                                {eventEmoji(event.type)} {event.title}
                              </div>
                            ))}
                            {dayEvents.length > 3 ? (
                              <div className="text-[11px] font-bold text-slate-400">+ {dayEvents.length - 3} más</div>
                            ) : null}
                            {highCount > 0 ? (
                              <div className="rounded-full bg-red-50 px-2 py-1 text-[11px] font-black text-red-700">
                                {highCount} prioridad alta
                              </div>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {selectedView !== "month" ? (
        <section className="ui-panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="ui-h2">Agenda del mes</h2>
              <p className="mt-2 ui-body-muted">
                Lista cronológica con tarjetas visuales. También puedes abrir un día desde el calendario.
              </p>
            </div>
            <span className="ui-chip ui-chip--brand">Total: {events.length}</span>
          </div>

          {orderedDates.length === 0 ? (
            <div className="ui-empty mt-4">No hay eventos en este filtro.</div>
          ) : (
            <div className="mt-5 grid gap-4">
              {orderedDates.map(([date, rows]) => (
                <div key={date} id={`date-${date}`} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                  <button
                    type="button"
                    onClick={() => setSelectedDate(date)}
                    className="flex w-full items-center justify-between gap-3 text-left"
                  >
                    <div>
                      <div className="text-xs font-black uppercase tracking-wide text-slate-400">{formatShortDate(date)}</div>
                      <div className="mt-1 text-lg font-black capitalize text-slate-950">{formatDay(date)}</div>
                    </div>
                    <div className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600 shadow-sm">
                      {rows.length} evento(s)
                    </div>
                  </button>
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {rows.map((event, idx) => (
                      <DayEventCard key={`${date}-${event.type}-${idx}`} event={event} compact />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {selectedDate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
            <div className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-br from-pink-50 via-amber-50 to-cyan-50 p-6">
              <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-pink-200/50 blur-2xl" />
              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">Detalle del día</div>
                  <h3 className="mt-2 text-3xl font-black capitalize text-slate-950">{formatDay(selectedDate)}</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {selectedEvents.length > 0
                      ? `${selectedEvents.length} evento(s) para revisar`
                      : "No hay eventos registrados para este día."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDate(null)}
                  className="rounded-full bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Cerrar
                </button>
              </div>
            </div>

            <div className="max-h-[62vh] overflow-y-auto p-5">
              {selectedEvents.length > 0 ? (
                <div className="grid gap-4">
                  {selectedEvents.map((event, idx) => (
                    <DayEventCard key={`${selectedDate}-${event.type}-${idx}`} event={event} />
                  ))}
                </div>
              ) : (
                <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                  <div className="text-4xl">🌤️</div>
                  <div className="mt-3 text-lg font-black text-slate-950">Día libre en el calendario</div>
                  <p className="mt-1 text-sm text-slate-500">
                    Puedes agregar una fecha manual desde el formulario superior.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
