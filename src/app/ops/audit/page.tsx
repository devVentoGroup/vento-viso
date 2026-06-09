import Link from "next/link";

import { PageHeader } from "@/components/vento/standard/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/vento/standard/table";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type SiteRow = {
  id: string;
  name: string | null;
  code: string | null;
  site_type: string | null;
  is_active: boolean | null;
};

type AreaRow = {
  id: string;
  site_id: string | null;
  code: string | null;
  name: string | null;
  kind: string | null;
  is_active: boolean | null;
};

type AreaKindRow = {
  code: string;
  name: string | null;
  description: string | null;
  is_active: boolean | null;
  use_for_remission?: boolean | null;
};

type LocationRow = {
  id: string;
  site_id: string | null;
  area_id: string | null;
  code: string | null;
  description: string | null;
  zone: string | null;
  location_type: string | null;
  is_active: boolean | null;
};

type EmployeeRow = {
  id: string;
  full_name: string | null;
  alias: string | null;
  role: string | null;
  site_id: string | null;
  is_active: boolean | null;
};

type EmployeeSiteRow = {
  employee_id: string;
  site_id: string;
  is_active: boolean | null;
};

type EmployeeLocationAssignmentRow = {
  employee_id: string;
  site_id: string;
  location_id: string;
  is_active: boolean | null;
};

function label(value: string | null | undefined, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function chipTone(value: number) {
  if (value === 0) return "ui-chip--success";
  if (value <= 3) return "ui-chip--brand";
  return "";
}

function siteLabel(site: SiteRow | undefined, siteId: string | null | undefined) {
  return site?.name ?? site?.code ?? siteId ?? "-";
}

export default async function OpsAuditPage() {
  await requireAppAccess({
    appId: "viso",
    returnTo: "/ops/audit",
  });

  const supabase = createAdminClient();
  const [
    { data: sitesData },
    { data: areasData },
    { data: areaKindsData },
    { data: locationsData },
    { data: employeesData },
    { data: employeeSitesData },
    { data: employeeLocationAssignmentsData },
  ] = await Promise.all([
    supabase.from("sites").select("id,name,code,site_type,is_active").order("name", { ascending: true }),
    supabase.from("areas").select("id,site_id,code,name,kind,is_active").order("name", { ascending: true }),
    supabase.from("area_kinds").select("code,name,description,is_active,use_for_remission").order("name", { ascending: true }),
    supabase
      .from("inventory_locations")
      .select("id,site_id,area_id,code,description,zone,location_type,is_active")
      .order("description", { ascending: true })
      .order("code", { ascending: true }),
    supabase.from("employees").select("id,full_name,alias,role,site_id,is_active").order("full_name", { ascending: true }),
    supabase.from("employee_sites").select("employee_id,site_id,is_active").eq("is_active", true),
    supabase
      .from("employee_inventory_location_assignments")
      .select("employee_id,site_id,location_id,is_active")
      .eq("purpose", "kiosk_withdraw")
      .eq("is_active", true),
  ]);

  const sites = (sitesData ?? []) as SiteRow[];
  const areas = (areasData ?? []) as AreaRow[];
  const areaKinds = (areaKindsData ?? []) as AreaKindRow[];
  const locations = (locationsData ?? []) as LocationRow[];
  const employees = (employeesData ?? []) as EmployeeRow[];
  const employeeSites = (employeeSitesData ?? []) as EmployeeSiteRow[];
  const employeeLocationAssignments = (employeeLocationAssignmentsData ?? []) as EmployeeLocationAssignmentRow[];

  const activeSites = sites.filter((site) => site.is_active !== false);
  const activeAreas = areas.filter((area) => area.is_active !== false);
  const activeLocations = locations.filter((location) => location.is_active !== false);
  const activeEmployees = employees.filter((employee) => employee.is_active !== false);

  const sitesById = new Map(sites.map((site) => [site.id, site]));
  const activeLocsByArea = activeLocations.reduce((map, location) => {
    if (!location.area_id) return map;
    const current = map.get(location.area_id) ?? [];
    current.push(location);
    map.set(location.area_id, current);
    return map;
  }, new Map<string, LocationRow[]>());
  const activeLocsBySite = activeLocations.reduce((map, location) => {
    const siteId = String(location.site_id ?? "");
    if (!siteId) return map;
    const current = map.get(siteId) ?? [];
    current.push(location);
    map.set(siteId, current);
    return map;
  }, new Map<string, LocationRow[]>());
  const activeAreasBySite = activeAreas.reduce((map, area) => {
    const siteId = String(area.site_id ?? "");
    if (!siteId) return map;
    const current = map.get(siteId) ?? [];
    current.push(area);
    map.set(siteId, current);
    return map;
  }, new Map<string, AreaRow[]>());
  const employeeSitesByEmployee = employeeSites.reduce((map, row) => {
    const current = map.get(row.employee_id) ?? [];
    current.push(row.site_id);
    map.set(row.employee_id, current);
    return map;
  }, new Map<string, string[]>());
  const locAssignmentKeys = new Set(
    employeeLocationAssignments.map((row) => `${row.employee_id}::${row.site_id}`)
  );

  const locsWithoutArea = activeLocations.filter((location) => !location.area_id);
  const areasWithoutLoc = activeAreas.filter((area) => !activeLocsByArea.has(area.id));
  const areaKindsInUse = new Map<string, number>();
  for (const area of activeAreas) {
    const kind = String(area.kind ?? "").trim();
    if (!kind) continue;
    areaKindsInUse.set(kind, (areaKindsInUse.get(kind) ?? 0) + 1);
  }
  const inactiveKindsInUse = areaKinds.filter(
    (kind) => kind.is_active === false && areaKindsInUse.has(kind.code)
  );

  const duplicateAreaGroups = Array.from(
    activeAreas.reduce((map, area) => {
      const key = `${area.site_id ?? ""}::${String(area.name ?? "").trim().toLowerCase()}`;
      if (!area.site_id || !area.name) return map;
      const current = map.get(key) ?? [];
      current.push(area);
      map.set(key, current);
      return map;
    }, new Map<string, AreaRow[]>())
  )
    .map(([, rows]) => rows)
    .filter((rows) => rows.length > 1);

  const workersMissingLoc = activeEmployees.flatMap((employee) => {
    const sitesForEmployee = employeeSitesByEmployee.get(employee.id) ?? (employee.site_id ? [employee.site_id] : []);
    return sitesForEmployee
      .filter((siteId) => !locAssignmentKeys.has(`${employee.id}::${siteId}`))
      .map((siteId) => ({ employee, siteId }));
  });

  const siteRows = activeSites.map((site) => {
    const siteAreas = activeAreasBySite.get(site.id) ?? [];
    const siteLocations = activeLocsBySite.get(site.id) ?? [];
    const siteWorkers = activeEmployees.filter((employee) => {
      const linkedSites = employeeSitesByEmployee.get(employee.id) ?? [];
      return employee.site_id === site.id || linkedSites.includes(site.id);
    });
    const workersWithLoc = siteWorkers.filter((employee) =>
      locAssignmentKeys.has(`${employee.id}::${site.id}`)
    );
    return {
      site,
      areas: siteAreas.length,
      locs: siteLocations.length,
      workers: siteWorkers.length,
      workersWithLoc: workersWithLoc.length,
      workersMissingLoc: Math.max(0, siteWorkers.length - workersWithLoc.length),
    };
  });

  const kpis = [
    { label: "Areas sin LOC", value: areasWithoutLoc.length },
    { label: "LOCs sin area", value: locsWithoutArea.length },
    { label: "Trabajadores sin LOC", value: workersMissingLoc.length },
    { label: "Tipos inactivos en uso", value: inactiveKindsInUse.length },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auditoria operativa"
        subtitle="Mapa de sedes, areas, LOCs y asignaciones de retiro para ordenar la operacion sin borrar datos a ciegas."
        actions={
          <Link href="/staff" className="ui-btn ui-btn--ghost">
            Trabajadores
          </Link>
        }
      />

      <section className="grid gap-4 md:grid-cols-4">
        {kpis.map((item) => (
          <article key={item.label} className="ui-panel-soft">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">{item.label}</div>
            <div className="mt-2 text-3xl font-semibold text-[var(--ui-text)]">{item.value}</div>
            <span className={`ui-chip mt-3 ${chipTone(item.value)}`}>{item.value === 0 ? "OK" : "Revisar"}</span>
          </article>
        ))}
      </section>

      <section className="ui-panel ui-panel--accent-brand space-y-4">
        <div>
          <div className="ui-h3">Resumen por sede</div>
          <p className="ui-body-muted">Relacion entre areas, LOCs y trabajadores listos para retiro desde quiosco.</p>
        </div>
        <Table className="ui-table--accent">
          <TableHead>
            <TableRow>
              <TableHeaderCell>Sede</TableHeaderCell>
              <TableHeaderCell>Areas</TableHeaderCell>
              <TableHeaderCell>LOCs</TableHeaderCell>
              <TableHeaderCell>Trabajadores</TableHeaderCell>
              <TableHeaderCell>Con LOC retiro</TableHeaderCell>
              <TableHeaderCell>Pendientes</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {siteRows.map((row) => (
              <TableRow key={row.site.id}>
                <TableCell>
                  <div className="font-semibold">{siteLabel(row.site, row.site.id)}</div>
                  <div className="ui-caption">{row.site.site_type ?? "site"}</div>
                </TableCell>
                <TableCell>{row.areas}</TableCell>
                <TableCell>{row.locs}</TableCell>
                <TableCell>{row.workers}</TableCell>
                <TableCell>{row.workersWithLoc}</TableCell>
                <TableCell>
                  <span className={`ui-chip ${chipTone(row.workersMissingLoc)}`}>
                    {row.workersMissingLoc}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="ui-panel space-y-4">
          <div>
            <div className="ui-h3">Trabajadores sin LOC de retiro</div>
            <p className="ui-body-muted">Estos no podran retirar desde quiosco hasta tener un LOC destino.</p>
          </div>
          {workersMissingLoc.length === 0 ? (
            <div className="ui-empty">Todos los trabajadores activos tienen LOC asignado para sus sedes.</div>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Trabajador</TableHeaderCell>
                  <TableHeaderCell>Sede</TableHeaderCell>
                  <TableHeaderCell></TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {workersMissingLoc.slice(0, 40).map(({ employee, siteId }) => (
                  <TableRow key={`${employee.id}-${siteId}`}>
                    <TableCell>
                      <div className="font-semibold">{employee.full_name ?? employee.alias ?? employee.id}</div>
                      <div className="ui-caption">{employee.role ?? "sin rol"}</div>
                    </TableCell>
                    <TableCell>{siteLabel(sitesById.get(siteId), siteId)}</TableCell>
                    <TableCell className="text-right">
                      <Link href={`/staff/${employee.id}`} className="ui-btn ui-btn--ghost ui-btn--sm">
                        Asignar
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="ui-panel space-y-4">
          <div>
            <div className="ui-h3">LOCs sin area</div>
            <p className="ui-body-muted">Todo LOC deberia pertenecer a un area para que la operacion sea consistente.</p>
          </div>
          {locsWithoutArea.length === 0 ? (
            <div className="ui-empty">No hay LOCs activos sin area.</div>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>LOC</TableHeaderCell>
                  <TableHeaderCell>Sede</TableHeaderCell>
                  <TableHeaderCell>Tipo</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {locsWithoutArea.slice(0, 40).map((location) => (
                  <TableRow key={location.id}>
                    <TableCell>
                      <div className="font-semibold">{label(location.description, label(location.code))}</div>
                      <div className="ui-caption">{location.code ?? location.id}</div>
                    </TableCell>
                    <TableCell>{siteLabel(sitesById.get(String(location.site_id ?? "")), location.site_id)}</TableCell>
                    <TableCell>{location.location_type ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="ui-panel space-y-4">
          <div>
            <div className="ui-h3">Areas sin LOC</div>
            <p className="ui-body-muted">Areas operativas activas que todavía no tienen una ubicación de inventario asociada.</p>
          </div>
          {areasWithoutLoc.length === 0 ? (
            <div className="ui-empty">Todas las areas activas tienen al menos un LOC.</div>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Area</TableHeaderCell>
                  <TableHeaderCell>Sede</TableHeaderCell>
                  <TableHeaderCell>Tipo</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {areasWithoutLoc.slice(0, 40).map((area) => (
                  <TableRow key={area.id}>
                    <TableCell>
                      <div className="font-semibold">{area.name ?? area.code ?? area.id}</div>
                      <div className="ui-caption">{area.code ?? area.id}</div>
                    </TableCell>
                    <TableCell>{siteLabel(sitesById.get(String(area.site_id ?? "")), area.site_id)}</TableCell>
                    <TableCell>{area.kind ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="ui-panel space-y-4">
          <div>
            <div className="ui-h3">Tipos de area</div>
            <p className="ui-body-muted">Uso real por tipo para detectar categorías operativas duplicadas o viejas.</p>
          </div>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Tipo</TableHeaderCell>
                <TableHeaderCell>Nombre</TableHeaderCell>
                <TableHeaderCell>Areas</TableHeaderCell>
                <TableHeaderCell>Remisión</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {areaKinds.map((kind) => (
                <TableRow key={kind.code}>
                  <TableCell className="font-mono text-xs">{kind.code}</TableCell>
                  <TableCell>{kind.name ?? "-"}</TableCell>
                  <TableCell>{areaKindsInUse.get(kind.code) ?? 0}</TableCell>
                  <TableCell>{kind.use_for_remission ? "Si" : "No"}</TableCell>
                  <TableCell>
                    <span className={`ui-chip ${kind.is_active !== false ? "ui-chip--success" : ""}`}>
                      {kind.is_active !== false ? "Activo" : "Inactivo"}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {duplicateAreaGroups.length > 0 ? (
        <section className="ui-panel space-y-4">
          <div>
            <div className="ui-h3">Areas con nombres duplicados</div>
            <p className="ui-body-muted">No se borran automáticamente; esta lista sirve para decidir unificacion.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {duplicateAreaGroups.slice(0, 20).map((rows) => {
              const first = rows[0];
              return (
                <div key={`${first.site_id}-${first.name}`} className="ui-panel-soft">
                  <div className="font-semibold">{first.name}</div>
                  <div className="ui-caption">{siteLabel(sitesById.get(String(first.site_id ?? "")), first.site_id)}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {rows.map((area) => (
                      <span key={area.id} className="ui-chip">
                        {area.code ?? area.kind ?? area.id}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="ui-panel-soft">
        <div className="font-semibold text-[var(--ui-text)]">Siguiente limpieza recomendada</div>
        <p className="mt-1 text-sm text-[var(--ui-muted)]">
          Primero asigna LOC de retiro a trabajadores activos. Luego revisa areas sin LOC y LOCs sin area. Los tipos de area se deben consolidar solo despues de ver que no haya recetas, remisiones o configuraciones dependientes.
        </p>
      </section>
    </div>
  );
}
