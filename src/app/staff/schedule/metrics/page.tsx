import Link from "next/link";

import { PageHeader } from "@/components/vento/standard/page-header";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type SearchParams = {
  site_id?: string;
  from?: string;
  to?: string;
};

type SiteRow = {
  id: string;
  name: string | null;
  code: string | null;
  site_type?: string | null;
  type?: string | null;
  operational_visibility?: string | null;
  site_operational_capabilities?: { can_schedule_staff: boolean | null } | { can_schedule_staff: boolean | null }[] | null;
};

type EmployeeRow = {
  id: string;
  full_name: string | null;
  alias: string | null;
  role: string | null;
  is_active: boolean | null;
};

type ShiftRow = {
  id: string;
  employee_id: string;
  site_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  break_minutes: number | null;
  shift_kind: string | null;
  operational_role: string | null;
};

type AttendanceLogRow = {
  shift_id: string | null;
  employee_id: string;
  site_id: string;
  action: "check_in" | "check_out";
  occurred_at: string;
};

type MetricBucket = {
  scheduled: number;
  attended: number;
  complete: number;
  late: number;
  minutesScheduled: number;
  minutesWorked: number;
  lateMinutes: number;
};

const STAFF_SCHEDULE_SITE_TYPES = new Set(["satellite", "production_center", "admin"]);
const LATE_GRACE_MINUTES = 5;

function isOperationalSite(site: SiteRow) {
  if (site.operational_visibility === "hidden") return false;
  if (site.type === "checkin_point") return false;
  const capability = Array.isArray(site.site_operational_capabilities)
    ? site.site_operational_capabilities[0]
    : site.site_operational_capabilities;
  if (typeof capability?.can_schedule_staff === "boolean") return capability.can_schedule_staff;
  if (!site.site_type) return true;
  return STAFF_SCHEDULE_SITE_TYPES.has(site.site_type);
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDateParam(value: string | undefined, fallback: Date) {
  if (!value) return toIsoDate(fallback);
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return toIsoDate(fallback);
  return toIsoDate(parsed);
}

function addDays(base: Date, days: number) {
  const copy = new Date(base);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function formatHours(minutes: number) {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

function getShiftMinutes(shift: Pick<ShiftRow, "start_time" | "end_time" | "break_minutes" | "shift_kind">) {
  if (shift.shift_kind === "descanso") return 0;
  const [startHours, startMinutes] = shift.start_time.slice(0, 5).split(":").map(Number);
  const [endHours, endMinutes] = shift.end_time.slice(0, 5).split(":").map(Number);
  const gross = endHours * 60 + endMinutes - (startHours * 60 + startMinutes);
  return Math.max(0, gross - Math.max(0, shift.break_minutes ?? 0));
}

function localDateTime(date: string, time: string) {
  return new Date(`${date}T${time.slice(0, 5)}:00-05:00`);
}

function createBucket(): MetricBucket {
  return {
    scheduled: 0,
    attended: 0,
    complete: 0,
    late: 0,
    minutesScheduled: 0,
    minutesWorked: 0,
    lateMinutes: 0,
  };
}

function addToBucket(target: MetricBucket, source: MetricBucket) {
  target.scheduled += source.scheduled;
  target.attended += source.attended;
  target.complete += source.complete;
  target.late += source.late;
  target.minutesScheduled += source.minutesScheduled;
  target.minutesWorked += source.minutesWorked;
  target.lateMinutes += source.lateMinutes;
}

function scoreBucket(bucket: MetricBucket) {
  if (bucket.scheduled === 0) return 0;
  const attendance = bucket.attended / bucket.scheduled;
  const punctuality = bucket.attended === 0 ? 0 : 1 - bucket.late / bucket.attended;
  const completion = bucket.attended === 0 ? 0 : bucket.complete / bucket.attended;
  return Math.round((attendance * 0.55 + punctuality * 0.3 + completion * 0.15) * 100);
}

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

function getEmployeeLabel(employee: EmployeeRow | undefined, fallback: string) {
  return employee?.alias ?? employee?.full_name ?? fallback;
}

function getSiteLabel(site: SiteRow | undefined, fallback: string) {
  return site?.name ?? site?.code ?? fallback;
}

function dayLabel(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("es-CO", { weekday: "long" });
}

export default async function ScheduleMetricsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  await requireAppAccess({ appId: "viso", returnTo: "/staff/schedule/metrics" });
  const supabase = createAdminClient();

  const today = new Date();
  const defaultFrom = addDays(today, -90);
  const from = parseDateParam(sp.from, defaultFrom);
  const to = parseDateParam(sp.to, today);

  const [{ data: sitesData }, { data: employeesData }] = await Promise.all([
    supabase
      .from("sites")
      .select("id,name,code,site_type,type,operational_visibility,site_operational_capabilities(can_schedule_staff)")
      .order("name", { ascending: true }),
    supabase.from("employees").select("id,full_name,alias,role,is_active").eq("is_active", true).order("full_name", { ascending: true }),
  ]);

  const sites = ((sitesData ?? []) as SiteRow[]).filter(isOperationalSite);
  const selectedSiteId = sp.site_id && sites.some((site) => site.id === sp.site_id) ? sp.site_id : "";
  const employees = (employeesData ?? []) as EmployeeRow[];
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const siteById = new Map(sites.map((site) => [site.id, site]));

  const [{ data: shiftsData }, { data: logsData }] = await Promise.all([
    supabase
      .from("employee_shifts")
      .select("id,employee_id,site_id,shift_date,start_time,end_time,break_minutes,shift_kind,operational_role")
      .gte("shift_date", from)
      .lte("shift_date", to)
      .neq("status", "cancelled")
      .order("shift_date", { ascending: false }),
    supabase
      .from("attendance_logs")
      .select("shift_id,employee_id,site_id,action,occurred_at")
      .gte("occurred_at", `${from}T00:00:00-05:00`)
      .lte("occurred_at", `${to}T23:59:59-05:00`)
      .order("occurred_at", { ascending: true }),
  ]);

  const shifts = ((shiftsData ?? []) as ShiftRow[]).filter((shift) =>
    selectedSiteId ? shift.site_id === selectedSiteId : true,
  );
  const logs = ((logsData ?? []) as AttendanceLogRow[]).filter((log) =>
    selectedSiteId ? log.site_id === selectedSiteId : true,
  );

  const logsByShift = new Map<string, AttendanceLogRow[]>();
  const logsByEmployeeDay = new Map<string, AttendanceLogRow[]>();
  for (const log of logs) {
    if (log.shift_id) {
      const rows = logsByShift.get(log.shift_id) ?? [];
      rows.push(log);
      logsByShift.set(log.shift_id, rows);
    }
    const day = log.occurred_at.slice(0, 10);
    const key = `${log.employee_id}:${log.site_id}:${day}`;
    const rows = logsByEmployeeDay.get(key) ?? [];
    rows.push(log);
    logsByEmployeeDay.set(key, rows);
  }

  const globalBucket = createBucket();
  const byEmployee = new Map<string, MetricBucket>();
  const bySite = new Map<string, MetricBucket>();
  const patternBuckets = new Map<string, MetricBucket>();

  for (const shift of shifts) {
    if (shift.shift_kind === "descanso") continue;

    const shiftLogs =
      logsByShift.get(shift.id) ??
      logsByEmployeeDay.get(`${shift.employee_id}:${shift.site_id}:${shift.shift_date}`) ??
      [];
    const checkIns = shiftLogs.filter((log) => log.action === "check_in");
    const checkOuts = shiftLogs.filter((log) => log.action === "check_out");
    const checkIn = checkIns[0] ?? null;
    const checkOut = checkOuts[checkOuts.length - 1] ?? null;
    const scheduledStart = localDateTime(shift.shift_date, shift.start_time).getTime();
    const lateMinutes = checkIn
      ? Math.max(0, Math.round((new Date(checkIn.occurred_at).getTime() - scheduledStart) / 60000))
      : 0;
    const workedMinutes =
      checkIn && checkOut
        ? Math.max(0, Math.round((new Date(checkOut.occurred_at).getTime() - new Date(checkIn.occurred_at).getTime()) / 60000))
        : 0;

    const bucket = createBucket();
    bucket.scheduled = 1;
    bucket.minutesScheduled = getShiftMinutes(shift);
    bucket.attended = checkIn ? 1 : 0;
    bucket.complete = checkIn && checkOut ? 1 : 0;
    bucket.late = lateMinutes > LATE_GRACE_MINUTES ? 1 : 0;
    bucket.minutesWorked = workedMinutes;
    bucket.lateMinutes = lateMinutes > LATE_GRACE_MINUTES ? lateMinutes : 0;

    addToBucket(globalBucket, bucket);

    const employeeBucket = byEmployee.get(shift.employee_id) ?? createBucket();
    addToBucket(employeeBucket, bucket);
    byEmployee.set(shift.employee_id, employeeBucket);

    const siteBucket = bySite.get(shift.site_id) ?? createBucket();
    addToBucket(siteBucket, bucket);
    bySite.set(shift.site_id, siteBucket);

    const patternKey = `${shift.site_id}:${dayLabel(shift.shift_date)}:${shift.start_time.slice(0, 5)}-${shift.end_time.slice(0, 5)}:${shift.operational_role ?? employeeById.get(shift.employee_id)?.role ?? "rol_base"}`;
    const patternBucket = patternBuckets.get(patternKey) ?? createBucket();
    addToBucket(patternBucket, bucket);
    patternBuckets.set(patternKey, patternBucket);
  }

  const employeeRanking = [...byEmployee.entries()]
    .map(([employeeId, bucket]) => ({
      employeeId,
      label: getEmployeeLabel(employeeById.get(employeeId), employeeId),
      role: employeeById.get(employeeId)?.role ?? "Sin rol",
      bucket,
      score: scoreBucket(bucket),
    }))
    .filter((row) => row.bucket.scheduled >= 3)
    .sort((a, b) => b.score - a.score || b.bucket.attended - a.bucket.attended)
    .slice(0, 12);

  const siteRanking = [...bySite.entries()]
    .map(([siteId, bucket]) => ({
      siteId,
      label: getSiteLabel(siteById.get(siteId), siteId),
      bucket,
      score: scoreBucket(bucket),
    }))
    .sort((a, b) => b.score - a.score || b.bucket.scheduled - a.bucket.scheduled);

  const historicalPatterns = [...patternBuckets.entries()]
    .map(([key, bucket]) => {
      const [siteId, day, range, role] = key.split(":");
      return {
        key,
        site: getSiteLabel(siteById.get(siteId), siteId),
        day,
        range,
        role,
        bucket,
        score: scoreBucket(bucket),
      };
    })
    .filter((row) => row.bucket.scheduled >= 2)
    .sort((a, b) => b.bucket.scheduled - a.bucket.scheduled || b.score - a.score)
    .slice(0, 16);

  const selectedSite = selectedSiteId ? siteById.get(selectedSiteId) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Métricas de turnos"
        subtitle="Indicadores globales, ranking de asistencia y patrones históricos para premiar buen comportamiento."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/staff/schedule" className="ui-btn ui-btn--ghost">
              Volver a turnos
            </Link>
            <Link href="/staff/attendance" className="ui-btn ui-btn--ghost">
              Reportes
            </Link>
          </div>
        }
      />

      <form className="ui-panel grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
        <label className="space-y-1">
          <span className="ui-label">Sede</span>
          <select name="site_id" className="ui-input" defaultValue={selectedSiteId}>
            <option value="">Todas las sedes</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name ?? site.code ?? site.id}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="ui-label">Desde</span>
          <input type="date" name="from" className="ui-input" defaultValue={from} />
        </label>
        <label className="space-y-1">
          <span className="ui-label">Hasta</span>
          <input type="date" name="to" className="ui-input" defaultValue={to} />
        </label>
        <div className="flex items-end">
          <button className="ui-btn ui-btn--primary w-full" type="submit">
            Analizar
          </button>
        </div>
      </form>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Score asistencia" value={formatPercent(scoreBucket(globalBucket))} caption={`${globalBucket.scheduled} turnos analizados`} />
        <MetricCard title="Cumplimiento" value={formatPercent(rate(globalBucket.attended, globalBucket.scheduled))} caption={`${globalBucket.attended} asistidos`} />
        <MetricCard title="Puntualidad" value={formatPercent(rate(globalBucket.attended - globalBucket.late, globalBucket.attended))} caption={`${globalBucket.late} llegadas tarde`} />
        <MetricCard title="Horas trabajadas" value={formatHours(globalBucket.minutesWorked)} caption={`${formatHours(globalBucket.minutesScheduled)} programadas`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="ui-panel space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--ui-text)]">Trabajadores destacados</h2>
            <p className="text-sm text-[var(--ui-muted)]">
              Ranking ponderado por asistencia, puntualidad y turnos cerrados correctamente.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-[var(--ui-muted)]">
                <tr>
                  <th className="py-2">Trabajador</th>
                  <th>Rol</th>
                  <th>Score</th>
                  <th>Asistencia</th>
                  <th>Puntualidad</th>
                  <th>Cierres</th>
                  <th>Horas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ui-border)]">
                {employeeRanking.map((row, index) => (
                  <tr key={row.employeeId}>
                    <td className="py-3 font-medium text-[var(--ui-text)]">
                      <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-pink-50 text-xs text-[var(--ui-accent)]">
                        {index + 1}
                      </span>
                      {row.label}
                    </td>
                    <td>{row.role}</td>
                    <td className="font-semibold">{row.score}</td>
                    <td>{formatPercent(rate(row.bucket.attended, row.bucket.scheduled))}</td>
                    <td>{formatPercent(rate(row.bucket.attended - row.bucket.late, row.bucket.attended))}</td>
                    <td>{formatPercent(rate(row.bucket.complete, row.bucket.attended))}</td>
                    <td>{formatHours(row.bucket.minutesWorked)}</td>
                  </tr>
                ))}
                {employeeRanking.length === 0 ? (
                  <tr>
                    <td className="py-6 text-center text-[var(--ui-muted)]" colSpan={7}>
                      No hay suficientes turnos asistidos en el rango seleccionado.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="ui-panel space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--ui-text)]">Sedes</h2>
            <p className="text-sm text-[var(--ui-muted)]">
              {selectedSite ? `Filtro activo: ${selectedSite.name ?? selectedSite.code}` : "Comparativo global por sede."}
            </p>
          </div>
          <div className="space-y-3">
            {siteRanking.map((row) => (
              <div key={row.siteId} className="rounded-xl border border-[var(--ui-border)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-[var(--ui-text)]">{row.label}</div>
                    <div className="text-xs text-[var(--ui-muted)]">{row.bucket.scheduled} turnos</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-[var(--ui-accent)]">{row.score}</div>
                    <div className="text-xs text-[var(--ui-muted)]">score</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <MiniStat label="Asist." value={formatPercent(rate(row.bucket.attended, row.bucket.scheduled))} />
                  <MiniStat label="Punt." value={formatPercent(rate(row.bucket.attended - row.bucket.late, row.bucket.attended))} />
                  <MiniStat label="Cierre" value={formatPercent(rate(row.bucket.complete, row.bucket.attended))} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="ui-panel space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--ui-text)]">Patrones históricos útiles para sugerencias</h2>
          <p className="text-sm text-[var(--ui-muted)]">
            Franjas que más se repiten en el histórico real. Estas señales ya pueden reemplazar reglas vacías.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {historicalPatterns.map((pattern) => (
            <div key={pattern.key} className="rounded-xl border border-[var(--ui-border)] bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">{pattern.site}</div>
              <div className="mt-1 font-semibold text-[var(--ui-text)]">{pattern.day}</div>
              <div className="text-xl font-bold text-[var(--ui-accent)]">{pattern.range}</div>
              <div className="mt-2 text-sm text-[var(--ui-muted)]">{pattern.role.replaceAll("_", " ")}</div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span>{pattern.bucket.scheduled} veces</span>
                <span>{formatPercent(rate(pattern.bucket.attended, pattern.bucket.scheduled))} asistencia</span>
              </div>
            </div>
          ))}
          {historicalPatterns.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--ui-border)] p-6 text-sm text-[var(--ui-muted)] md:col-span-2 xl:col-span-4">
              No hay patrones repetidos suficientes en este rango.
            </div>
          ) : null}
        </div>
      </section>

      <p className="text-xs text-[var(--ui-muted)]">
        Periodo analizado: {formatDate(from)} a {formatDate(to)}. La tardanza usa una gracia de {LATE_GRACE_MINUTES} minutos.
      </p>
    </div>
  );
}

function MetricCard({ title, value, caption }: { title: string; value: string; caption: string }) {
  return (
    <div className="ui-panel">
      <div className="text-sm text-[var(--ui-muted)]">{title}</div>
      <div className="mt-2 text-3xl font-semibold text-[var(--ui-text)]">{value}</div>
      <div className="mt-1 text-xs text-[var(--ui-muted)]">{caption}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-2">
      <div className="font-semibold text-[var(--ui-text)]">{value}</div>
      <div className="text-[var(--ui-muted)]">{label}</div>
    </div>
  );
}
