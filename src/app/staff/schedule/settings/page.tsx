import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { PlanningAvailabilityPanel } from "@/components/viso/planning-availability-panel";
import { PlanningCoveragePanel } from "@/components/viso/planning-coverage-panel";
import { PlanningWorkerRulesPanel } from "@/components/viso/planning-worker-rules-panel";
import { PageHeader } from "@/components/vento/standard/page-header";
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

type StaffingRequirementRow = {
  id: string;
  site_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  min_headcount: number;
  ideal_headcount: number;
  max_headcount: number | null;
  required_role_code: string | null;
};

type AvailabilityRow = {
  id: string;
  employee_id: string;
  site_id: string | null;
  day_of_week: number;
  available_from: string;
  available_to: string;
  is_available: boolean;
  availability_kind: "preferred" | "allowed" | "blocked";
};

type RoleConcurrencyLimitRow = {
  id: string;
  site_id: string | null;
  role_code: string;
  day_of_week: number | null;
  start_time: string | null;
  end_time: string | null;
  max_concurrent: number;
  applies_across_sites: boolean;
  is_active: boolean;
};

type OperationalRoleRow = {
  role_code: string;
  role_label: string | null;
  is_active: boolean | null;
};

const DAY_LABELS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

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

function buildSettingsReturnTo(siteId: string, weekStartIso: string) {
  const query = new URLSearchParams();
  if (siteId) query.set("site_id", siteId);
  if (weekStartIso) query.set("week", weekStartIso);
  return `/staff/schedule/settings?${query.toString()}`;
}

function buildPlannerHref(siteId: string, weekStartIso: string) {
  const query = new URLSearchParams();
  if (siteId) query.set("site_id", siteId);
  if (weekStartIso) query.set("week", weekStartIso);
  return `/staff/schedule?${query.toString()}`;
}

function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getEmployeeRef(row: EmployeeSiteLink["employee"]) {
  if (!row) return null;
  return Array.isArray(row) ? (row[0] ?? null) : row;
}

async function saveCoverageRequirementAction(formData: FormData) {
  "use server";
  const siteId = asText(formData.get("site_id"));
  const weekStartIso = asText(formData.get("week_start"));
  const returnTo =
    asText(formData.get("return_to")) || "/staff/schedule/settings";
  const dayOfWeek = asNumber(formData.get("day_of_week"), -1);
  const startTime = asText(formData.get("start_time"));
  const endTime = asText(formData.get("end_time"));
  const minHeadcount = asNumber(formData.get("min_headcount"), 0);
  const idealHeadcount = asNumber(formData.get("ideal_headcount"), 0);
  const requiredRoleCode = asText(formData.get("required_role_code")) || null;

  await requireAppAccess({ appId: "viso", returnTo });

  if (
    !siteId ||
    !weekStartIso ||
    dayOfWeek < 0 ||
    dayOfWeek > 6 ||
    !startTime ||
    !endTime
  ) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Completa día, franja y sede para guardar la cobertura.")}`,
    );
  }
  if (endTime <= startTime) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("La hora de fin debe ser posterior a la hora de inicio.")}`,
    );
  }
  if (minHeadcount < 1 || idealHeadcount < minHeadcount) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Define un mínimo válido y un ideal mayor o igual al mínimo.")}`,
    );
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .schema("viso")
    .from("site_staffing_requirements")
    .insert({
      site_id: siteId,
      day_of_week: dayOfWeek,
      start_time: startTime,
      end_time: endTime,
      min_headcount: minHeadcount,
      ideal_headcount: idealHeadcount,
      required_role_code: requiredRoleCode,
    });

  if (error) redirect(`${returnTo}&error=${encodeURIComponent(error.message)}`);

  revalidatePath("/staff/schedule");
  revalidatePath("/staff/schedule/settings");
  redirect(`${returnTo}&ok=${encodeURIComponent("cobertura_guardada")}`);
}

async function deleteCoverageRequirementAction(formData: FormData) {
  "use server";
  const id = asText(formData.get("id"));
  const returnTo =
    asText(formData.get("return_to")) || "/staff/schedule/settings";

  await requireAppAccess({ appId: "viso", returnTo });

  if (!id)
    redirect(
      `${returnTo}&error=${encodeURIComponent("Regla de cobertura inválida.")}`,
    );

  const supabase = createAdminClient();
  const { error } = await supabase
    .schema("viso")
    .from("site_staffing_requirements")
    .delete()
    .eq("id", id);
  if (error) redirect(`${returnTo}&error=${encodeURIComponent(error.message)}`);

  revalidatePath("/staff/schedule");
  revalidatePath("/staff/schedule/settings");
  redirect(`${returnTo}&ok=${encodeURIComponent("cobertura_eliminada")}`);
}

async function saveAvailabilityAction(formData: FormData) {
  "use server";
  const siteId = asText(formData.get("site_id"));
  const weekStartIso = asText(formData.get("week_start"));
  const returnTo =
    asText(formData.get("return_to")) || "/staff/schedule/settings";
  const employeeId = asText(formData.get("employee_id"));
  const dayOfWeek = asNumber(formData.get("day_of_week"), -1);
  const availableFrom = asText(formData.get("available_from"));
  const availableTo = asText(formData.get("available_to"));
  const availabilityKind = asText(
    formData.get("availability_kind"),
  ) as AvailabilityRow["availability_kind"];

  await requireAppAccess({ appId: "viso", returnTo });

  if (
    !siteId ||
    !weekStartIso ||
    !employeeId ||
    dayOfWeek < 0 ||
    dayOfWeek > 6 ||
    !availableFrom ||
    !availableTo
  ) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Completa trabajador, día y horario para guardar la disponibilidad.")}`,
    );
  }
  if (availableTo <= availableFrom) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("La hora final debe ser posterior a la inicial.")}`,
    );
  }
  if (!["blocked", "allowed", "preferred"].includes(availabilityKind)) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Tipo de disponibilidad inválido.")}`,
    );
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .schema("viso")
    .from("employee_availability")
    .insert({
      employee_id: employeeId,
      site_id: siteId,
      day_of_week: dayOfWeek,
      available_from: availableFrom,
      available_to: availableTo,
      is_available: availabilityKind !== "blocked",
      availability_kind: availabilityKind,
    });

  if (error) redirect(`${returnTo}&error=${encodeURIComponent(error.message)}`);

  revalidatePath("/staff/schedule");
  revalidatePath("/staff/schedule/settings");
  redirect(`${returnTo}&ok=${encodeURIComponent("disponibilidad_guardada")}`);
}

async function deleteAvailabilityAction(formData: FormData) {
  "use server";
  const id = asText(formData.get("id"));
  const returnTo =
    asText(formData.get("return_to")) || "/staff/schedule/settings";

  await requireAppAccess({ appId: "viso", returnTo });

  if (!id)
    redirect(
      `${returnTo}&error=${encodeURIComponent("Disponibilidad inválida.")}`,
    );

  const supabase = createAdminClient();
  const { error } = await supabase
    .schema("viso")
    .from("employee_availability")
    .delete()
    .eq("id", id);
  if (error) redirect(`${returnTo}&error=${encodeURIComponent(error.message)}`);

  revalidatePath("/staff/schedule");
  revalidatePath("/staff/schedule/settings");
  redirect(`${returnTo}&ok=${encodeURIComponent("disponibilidad_eliminada")}`);
}

async function saveWorkerRulesAction(formData: FormData) {
  "use server";
  const siteId = asText(formData.get("site_id"));
  const returnTo =
    asText(formData.get("return_to")) || "/staff/schedule/settings";
  const employeeId = asText(formData.get("employee_id"));
  const targetWeeklyMinutes = Math.max(
    0,
    asNumber(formData.get("target_weekly_minutes"), 2400),
  );
  const maxWeeklyMinutes = Math.max(
    0,
    asNumber(formData.get("max_weekly_minutes"), 2880),
  );
  const prefersMorning = asText(formData.get("prefers_morning")) === "1";
  const prefersAfternoon = asText(formData.get("prefers_afternoon")) === "1";
  const prefersEvening = asText(formData.get("prefers_evening")) === "1";
  const avoidOpening = asText(formData.get("avoid_opening")) === "1";
  const avoidClosing = asText(formData.get("avoid_closing")) === "1";

  await requireAppAccess({ appId: "viso", returnTo });

  if (!siteId || !employeeId) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Selecciona un trabajador para guardar sus reglas.")}`,
    );
  }
  if (maxWeeklyMinutes < targetWeeklyMinutes) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("El máximo semanal debe ser mayor o igual al objetivo semanal.")}`,
    );
  }

  const supabase = createAdminClient();
  const { error: limitsError } = await supabase
    .schema("viso")
    .from("employee_planning_limits")
    .upsert(
      {
        employee_id: employeeId,
        site_id: siteId,
        target_weekly_minutes: targetWeeklyMinutes,
        max_weekly_minutes: maxWeeklyMinutes,
      },
      { onConflict: "employee_id,site_id" },
    );
  if (limitsError)
    redirect(`${returnTo}&error=${encodeURIComponent(limitsError.message)}`);

  const { error: preferencesError } = await supabase
    .schema("viso")
    .from("employee_shift_preferences")
    .upsert(
      {
        employee_id: employeeId,
        site_id: siteId,
        prefers_morning: prefersMorning,
        prefers_afternoon: prefersAfternoon,
        prefers_evening: prefersEvening,
        avoid_opening: avoidOpening,
        avoid_closing: avoidClosing,
      },
      { onConflict: "employee_id,site_id" },
    );
  if (preferencesError)
    redirect(
      `${returnTo}&error=${encodeURIComponent(preferencesError.message)}`,
    );

  revalidatePath("/staff/schedule");
  revalidatePath("/staff/schedule/settings");
  redirect(
    `${returnTo}&ok=${encodeURIComponent("reglas_trabajador_guardadas")}`,
  );
}

async function saveRoleConcurrencyLimitAction(formData: FormData) {
  "use server";
  const selectedSiteId = asText(formData.get("selected_site_id"));
  const returnTo =
    asText(formData.get("return_to")) || "/staff/schedule/settings";
  const scope = asText(formData.get("scope")) || "global";
  const roleCode = asText(formData.get("role_code"));
  const dayOfWeekValue = asText(formData.get("day_of_week"));
  const dayOfWeek =
    dayOfWeekValue === "" ? null : asNumber(formData.get("day_of_week"), -1);
  const startTime = asText(formData.get("start_time")) || null;
  const endTime = asText(formData.get("end_time")) || null;
  const maxConcurrent = asNumber(formData.get("max_concurrent"), 1);
  const appliesAcrossSites =
    asText(formData.get("applies_across_sites")) === "1";

  await requireAppAccess({ appId: "viso", returnTo });

  if (!roleCode) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Selecciona el rol que quieres limitar.")}`,
    );
  }
  if (maxConcurrent < 0) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("El máximo simultáneo no puede ser negativo.")}`,
    );
  }
  if (dayOfWeek != null && (dayOfWeek < 0 || dayOfWeek > 6)) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Selecciona un día válido.")}`,
    );
  }
  if (
    (startTime && !endTime) ||
    (!startTime && endTime) ||
    (startTime && endTime && endTime <= startTime)
  ) {
    redirect(
      `${returnTo}&error=${encodeURIComponent("Completa una franja válida o deja el horario vacío para todo el día.")}`,
    );
  }

  const siteId = scope === "site" ? selectedSiteId || null : null;
  const supabase = createAdminClient();
  const { error } = await supabase
    .schema("viso")
    .from("role_concurrency_limits")
    .insert({
      site_id: siteId,
      role_code: roleCode,
      day_of_week: dayOfWeek,
      start_time: startTime,
      end_time: endTime,
      max_concurrent: maxConcurrent,
      applies_across_sites: scope === "global" ? true : appliesAcrossSites,
    });

  if (error) redirect(`${returnTo}&error=${encodeURIComponent(error.message)}`);

  revalidatePath("/staff/schedule");
  revalidatePath("/staff/schedule/settings");
  redirect(`${returnTo}&ok=${encodeURIComponent("limite_rol_guardado")}`);
}

async function deleteRoleConcurrencyLimitAction(formData: FormData) {
  "use server";
  const id = asText(formData.get("id"));
  const returnTo =
    asText(formData.get("return_to")) || "/staff/schedule/settings";

  await requireAppAccess({ appId: "viso", returnTo });

  if (!id)
    redirect(`${returnTo}&error=${encodeURIComponent("Límite inválido.")}`);

  const supabase = createAdminClient();
  const { error } = await supabase
    .schema("viso")
    .from("role_concurrency_limits")
    .delete()
    .eq("id", id);
  if (error) redirect(`${returnTo}&error=${encodeURIComponent(error.message)}`);

  revalidatePath("/staff/schedule");
  revalidatePath("/staff/schedule/settings");
  redirect(`${returnTo}&ok=${encodeURIComponent("limite_rol_eliminado")}`);
}

function getOkMessage(code: string) {
  switch (code) {
    case "cobertura_guardada":
      return "Cobertura guardada.";
    case "cobertura_eliminada":
      return "Cobertura eliminada.";
    case "disponibilidad_guardada":
      return "Disponibilidad guardada.";
    case "disponibilidad_eliminada":
      return "Disponibilidad eliminada.";
    case "reglas_trabajador_guardadas":
      return "Reglas del trabajador guardadas.";
    case "limite_rol_guardado":
      return "Límite por rol guardado.";
    case "limite_rol_eliminado":
      return "Límite por rol eliminado.";
    default:
      return "";
  }
}

export default async function StaffScheduleSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    site_id?: string;
    week?: string;
    ok?: string;
    error?: string;
  }>;
}) {
  const sp = (await searchParams) ?? {};
  const okMsg = getOkMessage(safeDecode(sp.ok));
  const errorMsg = safeDecode(sp.error);

  await requireAppAccess({
    appId: "viso",
    returnTo: "/staff/schedule/settings",
  });

  const supabase = createAdminClient();
  const { data: sitesData } = await supabase
    .from("sites")
    .select("id,name,code")
    .order("name", { ascending: true });
  const sites = (sitesData ?? []) as SiteRow[];
  const selectedSiteId =
    sp.site_id && sites.some((site) => site.id === sp.site_id)
      ? String(sp.site_id)
      : (sites[0]?.id ?? "");
  const weekStart = parseWeekStart(sp.week);
  const weekStartIso = isoDate(weekStart);
  const returnTo = buildSettingsReturnTo(selectedSiteId, weekStartIso);

  const [
    directEmployeesRes,
    linkedEmployeesRes,
    staffingRequirementsRes,
    availabilityConfigRes,
    planningLimitsRes,
    shiftPreferencesRes,
    roleConcurrencyLimitsRes,
    operationalRolesRes,
  ] = await Promise.all([
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
          .select(
            "employee_id,is_active,employee:employees(id,full_name,alias,role,is_active,site_id)",
          )
          .eq("site_id", selectedSiteId)
          .eq("is_active", true)
      : Promise.resolve({ data: [], error: null }),
    selectedSiteId
      ? supabase
          .schema("viso")
          .from("site_staffing_requirements")
          .select(
            "id,site_id,day_of_week,start_time,end_time,min_headcount,ideal_headcount,max_headcount,required_role_code",
          )
          .eq("site_id", selectedSiteId)
          .order("day_of_week", { ascending: true })
          .order("start_time", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    selectedSiteId
      ? supabase
          .schema("viso")
          .from("employee_availability")
          .select(
            "id,employee_id,site_id,day_of_week,available_from,available_to,is_available,availability_kind",
          )
          .eq("site_id", selectedSiteId)
          .order("day_of_week", { ascending: true })
          .order("available_from", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    selectedSiteId
      ? supabase
          .schema("viso")
          .from("employee_planning_limits")
          .select("employee_id,target_weekly_minutes,max_weekly_minutes")
          .eq("site_id", selectedSiteId)
      : Promise.resolve({ data: [], error: null }),
    selectedSiteId
      ? supabase
          .schema("viso")
          .from("employee_shift_preferences")
          .select(
            "employee_id,prefers_morning,prefers_afternoon,prefers_evening,avoid_opening,avoid_closing",
          )
          .eq("site_id", selectedSiteId)
      : Promise.resolve({ data: [], error: null }),
    selectedSiteId
      ? supabase
          .schema("viso")
          .from("role_concurrency_limits")
          .select(
            "id,site_id,role_code,day_of_week,start_time,end_time,max_concurrent,applies_across_sites,is_active",
          )
          .eq("is_active", true)
          .or(`site_id.is.null,site_id.eq.${selectedSiteId}`)
          .order("role_code", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    selectedSiteId
      ? supabase
          .from("vento_site_operational_role_matrix_v1")
          .select("role_code,role_label,is_active")
          .eq("site_id", selectedSiteId)
          .eq("is_active", true)
          .order("role_label", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  const employeeMap = new Map<string, EmployeeRow>();
  for (const row of (directEmployeesRes.data ?? []) as EmployeeRow[])
    employeeMap.set(row.id, row);
  for (const link of (linkedEmployeesRes.data ?? []) as EmployeeSiteLink[]) {
    const employee = getEmployeeRef(link.employee);
    if (employee?.id && employee.is_active)
      employeeMap.set(employee.id, employee);
  }

  const employees = [...employeeMap.values()].sort((a, b) =>
    (a.full_name ?? a.alias ?? a.id).localeCompare(
      b.full_name ?? b.alias ?? b.id,
      "es",
    ),
  );
  const roleOptions = [
    ...new Set(
      employees.map((employee) => employee.role).filter(Boolean) as string[],
    ),
  ].sort((a, b) => a.localeCompare(b, "es"));
  const operationalRoleRows = (operationalRolesRes.data ??
    []) as OperationalRoleRow[];
  const operationalRoleLabelByCode = new Map<string, string>();
  for (const row of operationalRoleRows) {
    const code = String(row.role_code ?? "").trim();
    if (!code) continue;
    operationalRoleLabelByCode.set(
      code,
      String(row.role_label ?? row.role_code).trim(),
    );
  }
  for (const role of roleOptions) {
    if (!operationalRoleLabelByCode.has(role))
      operationalRoleLabelByCode.set(role, role);
  }
  const concurrencyRoleOptions = [...operationalRoleLabelByCode.entries()].sort(
    (a, b) => a[1].localeCompare(b[1], "es"),
  );
  const staffingRequirements = (staffingRequirementsRes.data ??
    []) as StaffingRequirementRow[];
  const availabilityConfigRows = (availabilityConfigRes.data ??
    []) as AvailabilityRow[];
  const planningLimitsRows = (planningLimitsRes.data ?? []) as Array<{
    employee_id: string;
    target_weekly_minutes: number;
    max_weekly_minutes: number;
  }>;
  const shiftPreferenceRows = (shiftPreferencesRes.data ?? []) as Array<{
    employee_id: string;
    prefers_morning: boolean;
    prefers_afternoon: boolean;
    prefers_evening: boolean;
    avoid_opening: boolean;
    avoid_closing: boolean;
  }>;
  const roleConcurrencyLimitRows = (roleConcurrencyLimitsRes.data ??
    []) as RoleConcurrencyLimitRow[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuración del planificador"
        subtitle="Ajusta cobertura, disponibilidad y reglas del equipo sin ensuciar la vista principal del planner."
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={buildPlannerHref(selectedSiteId, weekStartIso)}
              className="ui-btn ui-btn--ghost"
            >
              Volver al planner
            </Link>
          </div>
        }
      />

      {errorMsg ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMsg}
        </div>
      ) : null}
      {okMsg ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {okMsg}
        </div>
      ) : null}

      <div className="ui-panel space-y-4">
        <form
          method="get"
          className="grid gap-3 md:grid-cols-[minmax(260px,1fr)_180px_auto]"
        >
          <label className="flex flex-col gap-1">
            <span className="ui-label">Sede</span>
            <select
              name="site_id"
              className="ui-input"
              defaultValue={selectedSiteId}
            >
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name ?? site.code ?? site.id}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="ui-label">Semana base</span>
            <input
              name="week"
              type="date"
              className="ui-input"
              defaultValue={weekStartIso}
            />
          </label>
          <div className="flex items-end">
            <button type="submit" className="ui-btn ui-btn--ghost w-full">
              Actualizar
            </button>
          </div>
        </form>
      </div>

      {!selectedSiteId ? (
        <div className="ui-panel">
          <div className="ui-empty">
            No hay sedes disponibles para configurar.
          </div>
        </div>
      ) : employees.length === 0 ? (
        <div className="ui-panel">
          <div className="ui-empty">
            <p className="font-semibold text-[var(--ui-text)]">
              No hay trabajadores en esta sede.
            </p>
            <p className="mt-2 text-sm text-[var(--ui-muted)]">
              Primero asigna personal a la sede y luego configura reglas del
              planificador.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <PlanningCoveragePanel
            siteId={selectedSiteId}
            weekStartIso={weekStartIso}
            returnTo={returnTo}
            requirements={staffingRequirements.map((item) => ({
              id: item.id,
              dayOfWeek: item.day_of_week,
              startTime: item.start_time,
              endTime: item.end_time,
              minHeadcount: item.min_headcount,
              idealHeadcount: item.ideal_headcount,
              maxHeadcount: item.max_headcount,
              requiredRoleCode: item.required_role_code,
            }))}
            roleOptions={roleOptions}
            saveAction={saveCoverageRequirementAction}
            deleteAction={deleteCoverageRequirementAction}
          />
          <PlanningAvailabilityPanel
            siteId={selectedSiteId}
            weekStartIso={weekStartIso}
            returnTo={returnTo}
            employees={employees.map((employee) => ({
              id: employee.id,
              label: employee.full_name ?? employee.alias ?? employee.id,
            }))}
            rows={availabilityConfigRows.map((row) => ({
              id: row.id,
              employeeId: row.employee_id,
              employeeName:
                employeeMap.get(row.employee_id)?.full_name ??
                employeeMap.get(row.employee_id)?.alias ??
                row.employee_id,
              dayOfWeek: row.day_of_week,
              availableFrom: row.available_from,
              availableTo: row.available_to,
              availabilityKind: row.availability_kind,
            }))}
            saveAction={saveAvailabilityAction}
            deleteAction={deleteAvailabilityAction}
          />
          <PlanningWorkerRulesPanel
            siteId={selectedSiteId}
            weekStartIso={weekStartIso}
            returnTo={returnTo}
            employees={employees.map((employee) => ({
              id: employee.id,
              label: employee.full_name ?? employee.alias ?? employee.id,
            }))}
            rows={employees.map((employee) => {
              const limits = planningLimitsRows.find(
                (row) => row.employee_id === employee.id,
              );
              const preference = shiftPreferenceRows.find(
                (row) => row.employee_id === employee.id,
              );
              return {
                employeeId: employee.id,
                employeeName:
                  employee.full_name ?? employee.alias ?? employee.id,
                targetWeeklyMinutes: limits?.target_weekly_minutes ?? 2400,
                maxWeeklyMinutes: limits?.max_weekly_minutes ?? 2880,
                prefersMorning: preference?.prefers_morning ?? false,
                prefersAfternoon: preference?.prefers_afternoon ?? false,
                prefersEvening: preference?.prefers_evening ?? false,
                avoidOpening: preference?.avoid_opening ?? false,
                avoidClosing: preference?.avoid_closing ?? false,
              };
            })}
            saveAction={saveWorkerRulesAction}
          />
          <div className="ui-panel space-y-4">
            <div>
              <div className="ui-h3">Límites simultáneos por rol</div>
              <p className="mt-1 text-sm text-[var(--ui-muted)]">
                Define restricciones duras como máximo un cajero al mismo
                tiempo, incluso cruzando sedes.
              </p>
            </div>

            {roleConcurrencyLimitRows.length > 0 ? (
              <div className="grid gap-2 xl:grid-cols-2">
                {roleConcurrencyLimitRows.map((limit) => (
                  <div
                    key={limit.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[var(--ui-text)]">
                        {operationalRoleLabelByCode.get(limit.role_code) ??
                          limit.role_code}
                        : máximo {limit.max_concurrent}
                      </div>
                      <div className="mt-1 text-xs text-[var(--ui-muted)]">
                        {limit.site_id ? "Sede actual" : "Global"}
                        {limit.applies_across_sites
                          ? " · cruza sedes"
                          : " · solo esta sede"}
                        {limit.day_of_week == null
                          ? " · todos los días"
                          : ` · ${DAY_LABELS[limit.day_of_week]}`}
                        {limit.start_time && limit.end_time
                          ? ` · ${limit.start_time.slice(0, 5)}-${limit.end_time.slice(0, 5)}`
                          : " · todo el día"}
                      </div>
                    </div>
                    <form action={deleteRoleConcurrencyLimitAction}>
                      <input type="hidden" name="id" value={limit.id} />
                      <input type="hidden" name="return_to" value={returnTo} />
                      <button
                        type="submit"
                        className="ui-btn ui-btn--ghost ui-btn--sm text-[var(--ui-danger)]"
                      >
                        Quitar
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 py-5 text-sm text-[var(--ui-muted)]">
                Aún no hay límites simultáneos por rol.
              </div>
            )}

            <form
              action={saveRoleConcurrencyLimitAction}
              className="grid gap-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4 md:grid-cols-7"
            >
              <input
                type="hidden"
                name="selected_site_id"
                value={selectedSiteId}
              />
              <input type="hidden" name="return_to" value={returnTo} />
              <label className="flex flex-col gap-1 md:col-span-2">
                <span className="ui-label">Rol</span>
                <select
                  name="role_code"
                  className="ui-input"
                  required
                  defaultValue=""
                >
                  <option value="" disabled>
                    Seleccionar rol
                  </option>
                  {concurrencyRoleOptions.map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-label">Alcance</span>
                <select name="scope" className="ui-input" defaultValue="global">
                  <option value="global">Global</option>
                  <option value="site">Esta sede</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-label">Día</span>
                <select name="day_of_week" className="ui-input" defaultValue="">
                  <option value="">Todos</option>
                  {DAY_LABELS.map((label, index) => (
                    <option key={label} value={index}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-label">Inicio</span>
                <input name="start_time" type="time" className="ui-input" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-label">Fin</span>
                <input name="end_time" type="time" className="ui-input" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-label">Máximo</span>
                <input
                  name="max_concurrent"
                  type="number"
                  min={0}
                  className="ui-input"
                  defaultValue="1"
                  required
                />
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-[var(--ui-text)] md:col-span-4">
                <input
                  type="checkbox"
                  name="applies_across_sites"
                  value="1"
                  className="rounded border-[var(--ui-border)]"
                  defaultChecked
                />
                Contar este rol cruzando sedes
              </label>
              <div className="flex justify-end md:col-span-3">
                <button type="submit" className="ui-btn ui-btn--brand">
                  Guardar límite
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
