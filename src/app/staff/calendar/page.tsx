import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/vento/standard/page-header";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type SearchParams = {
  month?: string;
  site_id?: string;
  type?: string;
  view?: string;
  ok?: string;
  error?: string;
};

type SiteRow = { id: string; name: string | null };
type EmployeeRow = { id: string; full_name: string | null; site_id: string | null };
type ContractCalendarRow = {
  employee_id: string;
  contract_active: boolean;
  contract_start_date: string | null;
  contract_end_date: string | null;
};
type MaintenanceEventRow = {
  id: string;
  product_id: string;
  scheduled_date: string | null;
  performed_date: string | null;
  responsible: string | null;
  work_done: string | null;
  planner_bucket: string | null;
  products?:
    | { id: string; name: string | null; sku: string | null }
    | Array<{ id: string; name: string | null; sku: string | null }>
    | null;
};
type AssetProfileRow = {
  product_id: string;
  physical_location: string | null;
  maintenance_cycle_enabled: boolean | null;
  maintenance_cycle_months: number | null;
  maintenance_cycle_anchor_date: string | null;
};
type ManualCalendarEventRow = {
  id: string;
  event_date: string;
  title: string;
  detail: string | null;
  event_type: string;
  site_id: string | null;
  priority: "high" | "medium" | "low";
  is_active: boolean | null;
};

type CalendarEventType = "holiday" | "mother_day" | "commercial" | "operations" | "other" | "contract_start" | "contract_end" | "maintenance";
type CalendarEvent = {
  date: string;
  type: CalendarEventType;
  title: string;
  detail?: string;
  siteId?: string | null;
  priority: "high" | "medium" | "low";
};

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseMonth(input: string | undefined): Date {
  const now = new Date();
  const raw = String(input ?? "").trim();
  if (/^\d{4}-\d{2}$/.test(raw)) {
    const parsed = new Date(`${raw}-01T12:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0, 0);
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 12, 0, 0, 0);
}

function moveToNextMonday(date: Date): Date {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 1 ? 0 : (8 - day) % 7;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function computeEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function getColombiaHolidays(year: number): Array<{ date: string; name: string }> {
  const easter = computeEasterSunday(year);
  const fixed = [
    { date: new Date(year, 0, 1, 12), name: "Año Nuevo" },
    { date: new Date(year, 4, 1, 12), name: "Día del Trabajo" },
    { date: new Date(year, 6, 20, 12), name: "Independencia de Colombia" },
    { date: new Date(year, 7, 7, 12), name: "Batalla de Boyacá" },
    { date: new Date(year, 11, 8, 12), name: "Inmaculada Concepción" },
    { date: new Date(year, 11, 25, 12), name: "Navidad" },
  ];
  const emiliani = [
    { date: new Date(year, 0, 6, 12), name: "Día de Reyes" },
    { date: new Date(year, 2, 19, 12), name: "San José" },
    { date: new Date(year, 5, 29, 12), name: "San Pedro y San Pablo" },
    { date: new Date(year, 7, 15, 12), name: "Asunción de la Virgen" },
    { date: new Date(year, 9, 12, 12), name: "Día de la Raza" },
    { date: new Date(year, 10, 1, 12), name: "Todos los Santos" },
    { date: new Date(year, 10, 11, 12), name: "Independencia de Cartagena" },
  ].map((row) => ({ date: moveToNextMonday(row.date), name: row.name }));
  const easterRelated = [
    { date: addDays(easter, -3), name: "Jueves Santo" },
    { date: addDays(easter, -2), name: "Viernes Santo" },
    { date: moveToNextMonday(addDays(easter, 40)), name: "Ascensión del Señor" },
    { date: moveToNextMonday(addDays(easter, 60)), name: "Corpus Christi" },
    { date: moveToNextMonday(addDays(easter, 68)), name: "Sagrado Corazón" },
  ];

  return [...fixed, ...emiliani, ...easterRelated]
    .map((row) => ({ date: toIsoDate(row.date), name: row.name }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function getMothersDayCucuta(year: number): string {
  const mayFirst = new Date(year, 4, 1, 12, 0, 0, 0);
  const firstSundayDelta = (7 - mayFirst.getDay()) % 7;
  const secondSunday = addDays(mayFirst, firstSundayDelta + 7);
  return toIsoDate(secondSunday);
}

function eventTypeLabel(value: CalendarEventType): string {
  if (value === "holiday") return "Festivo";
  if (value === "mother_day") return "Día Madre";
  if (value === "commercial") return "Comercial";
  if (value === "operations") return "Operacion";
  if (value === "other") return "Manual";
  if (value === "contract_start") return "Contrato";
  if (value === "contract_end") return "Contrato";
  return "Mantenimiento";
}

function eventTypePillClass(value: CalendarEventType): string {
  if (value === "holiday") return "bg-indigo-50 text-indigo-700 border-indigo-200";
  if (value === "mother_day") return "bg-pink-50 text-pink-700 border-pink-200";
  if (value === "commercial") return "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200";
  if (value === "operations") return "bg-cyan-50 text-cyan-700 border-cyan-200";
  if (value === "other") return "bg-slate-100 text-slate-700 border-slate-200";
  if (value === "contract_start") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (value === "contract_end") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

function addMonthsKeepingDay(base: Date, months: number): Date {
  const y = base.getFullYear();
  const m = base.getMonth();
  const d = base.getDate();
  const candidate = new Date(y, m + months, 1, 12, 0, 0, 0);
  const max = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0, 12, 0, 0, 0).getDate();
  candidate.setDate(Math.min(d, max));
  return candidate;
}

function startOfCalendarWeek(date: Date): Date {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function endOfCalendarWeek(date: Date): Date {
  const start = startOfCalendarWeek(date);
  return addDays(start, 6);
}

function getMaintenanceProductName(
  products: MaintenanceEventRow["products"],
  fallbackProductId: string,
) {
  if (!products) return fallbackProductId;
  if (Array.isArray(products)) {
    return products[0]?.name ?? fallbackProductId;
  }
  return products.name ?? fallbackProductId;
}

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableText(value: FormDataEntryValue | null) {
  const text = asText(value);
  return text || null;
}

function normalizeManualEventType(value: string): CalendarEventType {
  if (value === "holiday") return "holiday";
  if (value === "mother_day") return "mother_day";
  if (value === "commercial") return "commercial";
  if (value === "operations") return "operations";
  if (value === "maintenance") return "maintenance";
  return "other";
}

function normalizePriority(value: string): "high" | "medium" | "low" {
  if (value === "high" || value === "low") return value;
  return "medium";
}

function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function saveManualEvent(formData: FormData) {
  "use server";
  const supabase = createAdminClient();
  const eventDate = asText(formData.get("event_date"));
  const title = asText(formData.get("title"));
  const eventType = normalizeManualEventType(asText(formData.get("event_type")));
  const priority = normalizePriority(asText(formData.get("priority")));

  if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !title) {
    redirect("/staff/calendar?error=" + encodeURIComponent("Completa fecha y titulo del evento manual."));
  }

  const { error } = await supabase.from("staff_manual_calendar_events").insert({
    event_date: eventDate,
    title,
    detail: asNullableText(formData.get("detail")),
    event_type: eventType,
    priority,
    site_id: asNullableText(formData.get("site_id")),
    is_active: true,
  });

  if (error) {
    redirect("/staff/calendar?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/staff/calendar");
  redirect(`/staff/calendar?month=${eventDate.slice(0, 7)}&ok=${encodeURIComponent("Fecha agregada al calendario maestro.")}`);
}

export default async function StaffMasterCalendarPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const okMsg = safeDecode(sp.ok);
  const errorMsg = safeDecode(sp.error);

  await requireAppAccess({
    appId: "viso",
    returnTo: "/staff/calendar",
  });
  const supabase = createAdminClient();

  const monthDate = parseMonth(sp.month);
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const selectedSiteId = String(sp.site_id ?? "").trim();
  const selectedType = String(sp.type ?? "all").trim().toLowerCase();
  const selectedViewRaw = String(sp.view ?? "both").trim().toLowerCase();
  const selectedView = selectedViewRaw === "month" || selectedViewRaw === "list" ? selectedViewRaw : "both";
  const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;

  const [sitesRes, employeesRes, contractRes, maintenanceRes, assetProfilesRes, manualEventsRes] = await Promise.all([
    supabase.from("sites").select("id,name").eq("is_active", true).order("name"),
    supabase.from("employees").select("id,full_name,site_id").eq("is_active", true),
    supabase.rpc("employee_wallet_eligibility"),
    supabase
      .from("product_asset_maintenance_events")
      .select("id,product_id,scheduled_date,performed_date,responsible,work_done,planner_bucket,products(id,name,sku)")
      .gte("scheduled_date", toIsoDate(monthStart))
      .lte("scheduled_date", toIsoDate(monthEnd))
      .order("scheduled_date"),
    supabase
      .from("product_asset_profiles")
      .select("product_id,physical_location,maintenance_cycle_enabled,maintenance_cycle_months,maintenance_cycle_anchor_date")
      .eq("maintenance_cycle_enabled", true),
    supabase
      .from("staff_manual_calendar_events")
      .select("id,event_date,title,detail,event_type,site_id,priority,is_active")
      .gte("event_date", toIsoDate(monthStart))
      .lte("event_date", toIsoDate(monthEnd))
      .order("event_date"),
  ]);

  const sites = (sitesRes.data ?? []) as SiteRow[];
  const employees = (employeesRes.data ?? []) as EmployeeRow[];
  const contractRows = (contractRes.data ?? []) as ContractCalendarRow[];
  const maintenanceRows = (maintenanceRes.data ?? []) as MaintenanceEventRow[];
  const assetProfiles = (assetProfilesRes.data ?? []) as AssetProfileRow[];
  const manualEvents = (manualEventsRes.data ?? []) as ManualCalendarEventRow[];

  const employeeById = new Map(employees.map((row) => [row.id, row]));

  const events: CalendarEvent[] = [];

  manualEvents.forEach((row) => {
    if (row.is_active === false) return;
    if (selectedSiteId && row.site_id && row.site_id !== selectedSiteId) return;
    events.push({
      date: row.event_date,
      type: normalizeManualEventType(row.event_type),
      title: row.title,
      detail: row.detail ?? "Evento manual",
      siteId: row.site_id,
      priority: normalizePriority(row.priority),
    });
  });

  const years = new Set([monthDate.getFullYear()]);
  const prevMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1);
  const nextMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
  years.add(prevMonth.getFullYear());
  years.add(nextMonth.getFullYear());
  for (const year of years) {
    getColombiaHolidays(year).forEach((holiday) => {
      if (holiday.date >= toIsoDate(monthStart) && holiday.date <= toIsoDate(monthEnd)) {
        events.push({
          date: holiday.date,
          type: "holiday",
          title: holiday.name,
          detail: "Festivo nacional Colombia",
          priority: "medium",
        });
      }
    });
    const motherDay = getMothersDayCucuta(year);
    if (motherDay >= toIsoDate(monthStart) && motherDay <= toIsoDate(monthEnd)) {
      events.push({
        date: motherDay,
        type: "mother_day",
        title: "Día de la Madre · Cúcuta",
        detail: "Fecha comercial clave",
        priority: "high",
      });
    }
  }

  contractRows.forEach((row) => {
    const employee = employeeById.get(row.employee_id);
    const siteId = String(employee?.site_id ?? "");
    if (!employee) return;
    if (selectedSiteId && siteId !== selectedSiteId) return;
    const person = employee.full_name ?? employee.id;
    if (row.contract_start_date) {
      events.push({
        date: row.contract_start_date,
        type: "contract_start",
        title: `Inicio contrato · ${person}`,
        detail: "Contrato laboral",
        siteId,
        priority: "low",
      });
    }
    if (row.contract_end_date) {
      events.push({
        date: row.contract_end_date,
        type: "contract_end",
        title: `Vence contrato · ${person}`,
        detail: row.contract_active ? "Contrato vigente" : "Revisar renovación",
        siteId,
        priority: "high",
      });
    }
  });

  maintenanceRows.forEach((row) => {
    events.push({
      date: String(row.scheduled_date ?? ""),
      type: "maintenance",
      title: `Mant. ${getMaintenanceProductName(row.products, row.product_id)}`,
      detail:
        `${row.work_done ?? "Mantenimiento programado"} · ${row.responsible ?? "Sin responsable"}`,
      priority: "medium",
    });
  });

  const monthStartIso = toIsoDate(monthStart);
  const monthEndIso = toIsoDate(monthEnd);
  assetProfiles.forEach((row) => {
    const months = Number(row.maintenance_cycle_months ?? 0);
    if (!row.maintenance_cycle_anchor_date || !Number.isFinite(months) || months < 1) return;
    let cursor = new Date(`${row.maintenance_cycle_anchor_date}T12:00:00`);
    let safety = 0;
    while (toIsoDate(cursor) < monthStartIso && safety < 240) {
      cursor = addMonthsKeepingDay(cursor, Math.trunc(months));
      safety += 1;
    }
    if (toIsoDate(cursor) >= monthStartIso && toIsoDate(cursor) <= monthEndIso) {
      events.push({
        date: toIsoDate(cursor),
        type: "maintenance",
        title: `Ciclo mant. ${row.product_id.slice(0, 8)}`,
        detail: `${row.physical_location ?? "Sin ubicación"} · cada ${Math.trunc(months)} mes(es)`,
        priority: "medium",
      });
    }
  });

  const filtered = events
    .filter((event) => {
      if (selectedType === "all") return true;
      return event.type === selectedType;
    })
    .sort((a, b) => (a.date === b.date ? a.title.localeCompare(b.title) : a.date.localeCompare(b.date)));

  const grouped = filtered.reduce((acc, item) => {
    const list = acc.get(item.date) ?? [];
    list.push(item);
    acc.set(item.date, list);
    return acc;
  }, new Map<string, CalendarEvent[]>());

  const calendarStart = startOfCalendarWeek(monthStart);
  const calendarEnd = endOfCalendarWeek(monthEnd);
  const days: string[] = [];
  let cursor = new Date(calendarStart);
  while (toIsoDate(cursor) <= toIsoDate(calendarEnd)) {
    days.push(toIsoDate(cursor));
    cursor = addDays(cursor, 1);
  }
  const weekRows: string[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weekRows.push(days.slice(i, i + 7));
  }
  const weekDayLabels = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  const prevMonthKey = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}`;
  const nextMonthKey = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`;
  const qs = new URLSearchParams();
  if (selectedSiteId) qs.set("site_id", selectedSiteId);
  if (selectedType && selectedType !== "all") qs.set("type", selectedType);
  if (selectedView && selectedView !== "both") qs.set("view", selectedView);
  const baseQuery = qs.toString();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendario maestro"
        subtitle="Fechas clave de operación: festivos, contratos, mantenimientos y comerciales."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/staff/schedule" className="ui-btn ui-btn--ghost">
              Horario semanal
            </Link>
          </div>
        }
      />

      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}

      <section className="ui-panel space-y-4">
        <div>
          <h2 className="ui-h3">Agregar fecha manual</h2>
          <p className="ui-caption">
            Usa este bloque para fechas locales o comerciales que no salen del calendario nacional, por ejemplo Dia de la Madre en Cucuta.
          </p>
        </div>
        <form action={saveManualEvent} className="grid gap-3 lg:grid-cols-[160px_1fr_170px_160px_180px_auto] lg:items-end">
          <label className="space-y-1">
            <span className="ui-label">Fecha</span>
            <input name="event_date" type="date" className="ui-input" required />
          </label>
          <label className="space-y-1">
            <span className="ui-label">Titulo</span>
            <input name="title" className="ui-input" placeholder="Dia de la Madre - Cucuta" required />
          </label>
          <label className="space-y-1">
            <span className="ui-label">Tipo</span>
            <select name="event_type" defaultValue="commercial" className="ui-input">
              <option value="commercial">Comercial</option>
              <option value="mother_day">Dia de la Madre</option>
              <option value="holiday">Festivo/local</option>
              <option value="operations">Operacion</option>
              <option value="maintenance">Mantenimiento</option>
              <option value="other">Manual</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="ui-label">Prioridad</span>
            <select name="priority" defaultValue="high" className="ui-input">
              <option value="high">Alta</option>
              <option value="medium">Media</option>
              <option value="low">Baja</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="ui-label">Sede</span>
            <select name="site_id" className="ui-input">
              <option value="">Todas</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name ?? site.id}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="ui-btn ui-btn--brand">
            Agregar
          </button>
          <label className="space-y-1 lg:col-span-6">
            <span className="ui-label">Detalle</span>
            <input name="detail" className="ui-input" placeholder="Contexto opcional para operaciones, marketing o personal." />
          </label>
        </form>
      </section>

      <section className="ui-panel">
        <form className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[200px_minmax(180px,1fr)_180px_180px]">
            <label className="space-y-1">
              <span className="ui-label">Mes</span>
              <input name="month" type="month" defaultValue={monthKey} className="ui-input" />
            </label>
            <label className="space-y-1">
              <span className="ui-label">Sede</span>
              <select name="site_id" defaultValue={selectedSiteId} className="ui-input">
              <option value="">Todas</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name ?? site.id}
                </option>
              ))}
            </select>
            </label>
            <label className="space-y-1">
              <span className="ui-label">Tipo</span>
              <select name="type" defaultValue={selectedType || "all"} className="ui-input">
              <option value="all">Todos</option>
              <option value="holiday">Festivos</option>
              <option value="mother_day">Día de la Madre</option>
              <option value="contract_start">Inicio contrato</option>
              <option value="contract_end">Vence contrato</option>
              <option value="maintenance">Mantenimiento</option>
            </select>
            </label>
            <label className="space-y-1">
              <span className="ui-label">Vista</span>
              <select name="view" defaultValue={selectedView} className="ui-input">
              <option value="both">Mes + lista</option>
              <option value="month">Solo mes</option>
              <option value="list">Solo lista</option>
            </select>
            </label>
          </div>
          <div className="flex flex-col gap-2 border-t border-[var(--ui-border)] pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <Link
              href={`/staff/calendar?month=${prevMonthKey}${baseQuery ? `&${baseQuery}` : ""}`}
              className="ui-btn ui-btn--ghost justify-center whitespace-nowrap sm:min-w-36"
            >
              ← Mes anterior
            </Link>
            <Link
              href={`/staff/calendar?month=${nextMonthKey}${baseQuery ? `&${baseQuery}` : ""}`}
              className="ui-btn ui-btn--ghost justify-center whitespace-nowrap sm:min-w-36"
            >
              Mes siguiente →
            </Link>
            <button type="submit" className="ui-btn ui-btn--brand justify-center whitespace-nowrap sm:min-w-28">
              Aplicar
            </button>
          </div>
        </form>
      </section>

      {selectedView !== "list" ? (
      <section className="ui-panel">
        <div className="text-sm font-semibold text-[var(--ui-text)]">
          Vista mensual
        </div>
        <div className="mt-3 overflow-x-auto">
          <div className="min-w-[760px] rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)]">
            <div className="grid grid-cols-7 border-b border-[var(--ui-border)] text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
              {weekDayLabels.map((label) => (
                <div key={label} className="px-3 py-2">
                  {label}
                </div>
              ))}
            </div>
            {weekRows.map((week, weekIdx) => (
              <div key={`week-${weekIdx}`} className="grid grid-cols-7 border-b border-[var(--ui-border)] last:border-b-0">
                {week.map((dateIso) => {
                  const dayDate = new Date(`${dateIso}T12:00:00`);
                  const inMonth = dayDate.getMonth() === monthDate.getMonth();
                  const dayEvents = grouped.get(dateIso) ?? [];
                  const highCount = dayEvents.filter((x) => x.priority === "high").length;
                  const mediumCount = dayEvents.filter((x) => x.priority === "medium").length;
                  const lowCount = dayEvents.filter((x) => x.priority === "low").length;
                  const holidayCount = dayEvents.filter((x) => x.type === "holiday").length;
                  const motherDayCount = dayEvents.filter((x) => x.type === "mother_day").length;
                  const contractCount = dayEvents.filter((x) => x.type === "contract_start" || x.type === "contract_end").length;
                  const maintenanceCount = dayEvents.filter((x) => x.type === "maintenance").length;
                  return (
                    <div
                      key={dateIso}
                      className={`min-h-[96px] border-r border-[var(--ui-border)] px-2 py-2 last:border-r-0 ${inMonth ? "bg-white" : "bg-[var(--ui-surface)]/60"}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-semibold ${inMonth ? "text-[var(--ui-text)]" : "text-[var(--ui-muted)]"}`}>
                          {dayDate.getDate()}
                        </span>
                        {dayEvents.length > 0 ? (
                          <a href={`#date-${dateIso}`} className="ui-chip ui-chip--brand text-[11px]">
                            {dayEvents.length}
                          </a>
                        ) : null}
                      </div>
                      <div className="mt-2 space-y-1 text-[11px]">
                        {holidayCount > 0 ? <div className="rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-700">Festivo: {holidayCount}</div> : null}
                        {motherDayCount > 0 ? <div className="rounded-full bg-pink-50 px-2 py-0.5 text-pink-700">Madre: {motherDayCount}</div> : null}
                        {contractCount > 0 ? <div className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">Contratos: {contractCount}</div> : null}
                        {maintenanceCount > 0 ? <div className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">Mant.: {maintenanceCount}</div> : null}
                        {highCount > 0 ? <div className="rounded-full bg-red-50 px-2 py-0.5 text-red-700">Alta: {highCount}</div> : null}
                        {mediumCount > 0 ? <div className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">Media: {mediumCount}</div> : null}
                        {lowCount > 0 ? <div className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">Baja: {lowCount}</div> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>
      ) : null}

      {selectedView !== "month" ? (
      <section className="ui-panel">
        <div className="text-sm font-semibold text-[var(--ui-text)]">
          Eventos de {monthDate.toLocaleDateString("es-CO", { month: "long", year: "numeric" })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="ui-chip ui-chip--brand">Total: {filtered.length}</span>
          <span className="ui-chip">Festivos: {filtered.filter((x) => x.type === "holiday").length}</span>
          <span className="ui-chip">Contratos: {filtered.filter((x) => x.type.startsWith("contract")).length}</span>
          <span className="ui-chip">Mantenimiento: {filtered.filter((x) => x.type === "maintenance").length}</span>
        </div>
        {grouped.size === 0 ? (
          <div className="ui-empty mt-4">No hay eventos en este filtro.</div>
        ) : (
          <div className="mt-4 space-y-3">
            {Array.from(grouped.entries()).map(([date, rows]) => (
              <div id={`date-${date}`} key={date} className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
                <div className="text-sm font-semibold text-[var(--ui-text)]">
                  {new Intl.DateTimeFormat("es-CO", { dateStyle: "full" }).format(new Date(`${date}T12:00:00`))}
                </div>
                <div className="mt-2 space-y-2">
                  {rows.map((event, idx) => (
                    <div key={`${date}-${event.type}-${idx}`} className="rounded-lg border border-[var(--ui-border)] bg-white px-3 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${eventTypePillClass(event.type)}`}>
                          {eventTypeLabel(event.type)}
                        </span>
                        <span className="font-semibold text-[var(--ui-text)]">{event.title}</span>
                      </div>
                      {event.detail ? <div className="mt-1 text-[var(--ui-muted)]">{event.detail}</div> : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      ) : null}
    </div>
  );
}
