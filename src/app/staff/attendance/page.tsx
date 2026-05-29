import Link from "next/link";

import { AttendanceReportPanel } from "@/components/viso/attendance-report-panel";
import { PageHeader } from "@/components/vento/standard/page-header";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type EmployeeSiteRow = {
  employee_id: string;
  site_id: string;
  is_active: boolean | null;
};

const GLOBAL_REPORT_ROLES = new Set(["propietario", "gerente_general"]);
const MANAGER_REPORT_SITE_TYPES = new Set(["satellite", "production_center"]);

export default async function StaffAttendancePage() {
  const { user } = await requireAppAccess({
    appId: "viso",
    returnTo: "/staff/attendance",
  });

  const supabase = createAdminClient();

  const [
    { data: employeeRow, error: employeeError },
    { data: settingsRow },
  ] = await Promise.all([
    supabase
      .from("employees")
      .select("id, role, site_id")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("employee_settings")
      .select("selected_site_id")
      .eq("employee_id", user.id)
      .maybeSingle(),
  ]);

  if (employeeError || !employeeRow) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Reportes de asistencia"
          subtitle="Revisa el consolidado operativo y exporta los reportes del periodo."
        />
        <div className="ui-panel border-[var(--ui-danger)] bg-[var(--ui-danger-soft)]">
          <p className="font-medium text-[var(--ui-danger)]">No se pudo cargar el contexto del trabajador</p>
        </div>
      </div>
    );
  }

  const role = String(employeeRow.role ?? "");
  const isGlobalRole = GLOBAL_REPORT_ROLES.has(role);

  const selectedSiteId =
    String(settingsRow?.selected_site_id ?? "") ||
    String(employeeRow.site_id ?? "") ||
    null;

  let scopeLabel = "Registro personal";
  let canManagerTeamReports = false;

  if (!isGlobalRole && role === "gerente" && selectedSiteId) {
    const { data: siteRow } = await supabase
      .from("sites")
      .select("id, name, site_type")
      .eq("id", selectedSiteId)
      .maybeSingle();

    if (siteRow && MANAGER_REPORT_SITE_TYPES.has(String(siteRow.site_type ?? ""))) {
      canManagerTeamReports = true;
      scopeLabel = siteRow.name ?? "Tu sede";
    }
  }

  const canPersonalReports = !isGlobalRole && !canManagerTeamReports;
  const canViewReports = isGlobalRole || canManagerTeamReports || canPersonalReports;

  let siteOptions: { id: string; label: string }[] = [];
  let employeeOptions: { id: string; label: string; role: string | null; siteIds: string[] }[] = [];

  if (isGlobalRole) {
    const [
      { data: sitesData },
      { data: employeesData },
      { data: employeeSitesData },
    ] = await Promise.all([
      supabase.from("sites").select("id, name").eq("is_active", true).order("name", { ascending: true }),
      supabase.from("employees").select("id, full_name, alias, role, site_id").eq("is_active", true).order("full_name", { ascending: true }),
      supabase.from("employee_sites").select("employee_id, site_id, is_active").eq("is_active", true),
    ]);

    const siteIdsByEmployee = new Map<string, Set<string>>();
    for (const row of (employeeSitesData ?? []) as EmployeeSiteRow[]) {
      const set = siteIdsByEmployee.get(row.employee_id) ?? new Set<string>();
      set.add(row.site_id);
      siteIdsByEmployee.set(row.employee_id, set);
    }

    siteOptions = ((sitesData as { id: string; name: string | null }[] | null) ?? []).map((row) => ({
      id: row.id,
      label: row.name ?? "Sede sin nombre",
    }));

    employeeOptions = (
      (employeesData as { id: string; full_name: string | null; alias: string | null; role: string | null; site_id: string | null }[] | null) ??
      []
    ).map((row) => {
      const siteIds = siteIdsByEmployee.get(row.id) ?? new Set<string>();
      if (row.site_id) siteIds.add(row.site_id);
      return {
        id: row.id,
        label: row.alias ?? row.full_name ?? row.id,
        role: row.role,
        siteIds: [...siteIds],
      };
    });

    scopeLabel = "Todas las sedes";
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reportes de asistencia"
        subtitle="Consulta el resumen operativo y descarga el Excel del periodo igual que en ANIMA."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/staff" className="ui-btn ui-btn--ghost">
              Volver a trabajadores
            </Link>
          </div>
        }
      />

      <AttendanceReportPanel
        canViewReports={canViewReports}
        canFilterSite={isGlobalRole}
        canFilterEmployee={isGlobalRole}
        scopeLabel={scopeLabel}
        siteOptions={siteOptions}
        employeeOptions={employeeOptions}
      />
    </div>
  );
}
