import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { PageHeader } from "@/components/vento/standard/page-header";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type OperationModel = "single_loc" | "multi_area" | "multi_loc";

type SiteRow = {
  id: string;
  code: string | null;
  name: string | null;
  site_type: string | null;
  is_active: boolean | null;
  operational_visibility: string | null;
};

type CapabilityRow = {
  site_id: string;
  can_request_remissions: boolean | null;
  can_fulfill_remissions: boolean | null;
  can_receive_remissions: boolean | null;
  can_sell: boolean | null;
  can_produce: boolean | null;
  can_hold_inventory: boolean | null;
  is_commercial_business: boolean | null;
  show_in_product_setup: boolean | null;
  operation_model?: OperationModel | null;
  primary_operational_location_id?: string | null;
};

type AreaRow = {
  id: string;
  site_id: string | null;
  code: string | null;
  name: string | null;
  kind: string | null;
  is_active: boolean | null;
};

type LocationRow = {
  id: string;
  site_id: string | null;
  area_id: string | null;
  code: string | null;
  zone: string | null;
  description: string | null;
  location_type: string | null;
  is_active: boolean | null;
};

type EmployeeSiteRow = {
  employee_id: string;
  site_id: string | null;
  is_active: boolean | null;
  employee:
    | {
        id: string;
        full_name: string | null;
        alias: string | null;
        role: string | null;
        is_active: boolean | null;
      }
    | {
        id: string;
        full_name: string | null;
        alias: string | null;
        role: string | null;
        is_active: boolean | null;
      }[]
    | null;
};

type LocAssignmentRow = {
  employee_id: string;
  site_id: string | null;
  location_id: string | null;
  purpose: string | null;
  is_active: boolean | null;
  employee:
    | {
        id: string;
        full_name: string | null;
        alias: string | null;
        role: string | null;
      }
    | {
        id: string;
        full_name: string | null;
        alias: string | null;
        role: string | null;
      }[]
    | null;
};

type RouteRow = {
  id: string;
  product_id: string | null;
  site_id: string | null;
  area_kind: string | null;
  input_location_id: string | null;
  output_location_id: string | null;
  output_mode: string | null;
  is_active: boolean | null;
};

type RolePermissionRow = {
  role: string;
  scope_type: string | null;
  scope_site_id: string | null;
  scope_area_id: string | null;
  scope_area_kind: string | null;
  is_allowed: boolean | null;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOperationModel(value: string): OperationModel {
  if (value === "single_loc") return "single_loc";
  if (value === "multi_loc") return "multi_loc";
  return "multi_area";
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function operationModelLabel(value: string | null | undefined) {
  if (value === "single_loc") return "LOC unico";
  if (value === "multi_loc") return "Varios LOCs";
  return "Multi area";
}

function visibilityLabel(value: string | null | undefined) {
  if (value === "app_review") return "App Review";
  if (value === "test") return "Test";
  if (value === "hidden") return "Oculta";
  return "Operativa";
}

function visibilityChipClass(value: string | null | undefined) {
  if (value === "operational" || !value) return "ui-chip ui-chip--success";
  if (value === "hidden") return "ui-chip";
  return "ui-chip ui-chip--warning";
}

function locationTypeLabel(value: string | null | undefined) {
  switch (String(value ?? "")) {
    case "receiving":
      return "Recepcion";
    case "storage":
      return "Almacenamiento";
    case "picking":
      return "Operacion";
    case "production":
      return "Producción";
    case "staging":
      return "Alistamiento";
    default:
      return value || "Sin tipo";
  }
}

function roleLabel(value: string | null | undefined) {
  return String(value ?? "sin_rol").replace(/_/g, " ");
}

function normalizeLocationType(value: string) {
  if (["receiving", "storage", "picking", "production", "staging"].includes(value)) return value;
  return "storage";
}

function booleanFromForm(value: FormDataEntryValue | null) {
  return value === "on" || value === "true";
}

function backToMap(search = "") {
  return `/operations-map${search}`;
}

async function countRows(
  supabase: ReturnType<typeof createAdminClient>,
  table: string,
  column: string,
  value: string
) {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq(column, value);
  if (error) return 1;
  return count ?? 0;
}

async function countNonZeroStock(
  supabase: ReturnType<typeof createAdminClient>,
  table: string,
  locationId: string
) {
  const { count, error } = await supabase
    .from(table)
    .select("product_id", { count: "exact", head: true })
    .eq("location_id", locationId)
    .neq("current_qty", 0);
  if (error) return 1;
  return count ?? 0;
}

async function locDeleteBlockers(supabase: ReturnType<typeof createAdminClient>, locationId: string) {
  const checks = await Promise.all([
    countRows(supabase, "employee_inventory_location_assignments", "location_id", locationId),
    countRows(supabase, "inventory_transfers", "from_loc_id", locationId),
    countRows(supabase, "inventory_transfers", "to_loc_id", locationId),
    countRows(supabase, "product_site_production_routes", "input_location_id", locationId),
    countRows(supabase, "product_site_production_routes", "output_location_id", locationId),
    countRows(supabase, "production_batch_consumptions", "location_id", locationId),
    countRows(supabase, "production_batch_outputs", "destination_location_id", locationId),
    countRows(supabase, "pulso_sales_consumption_rules", "source_loc_id", locationId),
    countRows(supabase, "recipe_outputs", "destination_location_id", locationId),
    countRows(supabase, "recipe_site_uses", "source_location_id", locationId),
    countRows(supabase, "recipe_site_uses", "destination_location_id", locationId),
    countRows(supabase, "restock_request_item_picks", "source_location_id", locationId),
    countNonZeroStock(supabase, "inventory_stock_by_location", locationId),
    countNonZeroStock(supabase, "inventory_stock_by_uom_profile", locationId),
  ]);

  return checks.reduce((total, value) => total + value, 0);
}

function capabilityLabels(capability: CapabilityRow | undefined) {
  if (!capability) return [];
  return [
    capability.can_receive_remissions ? "Recibe remisiones" : "",
    capability.can_request_remissions ? "Solicita remisiones" : "",
    capability.can_fulfill_remissions ? "Despacha remisiones" : "",
    capability.can_sell ? "Vende" : "",
    capability.can_produce ? "Produce" : "",
    capability.can_hold_inventory ? "Mantiene inventario" : "",
  ].filter(Boolean);
}

function inferredLocationUses(params: {
  location: LocationRow;
  capability?: CapabilityRow;
  isPrimaryLoc: boolean;
  routeInputCount: number;
  routeOutputCount: number;
}) {
  const uses = new Set<string>();
  const type = String(params.location.location_type ?? "");

  if (type === "receiving") uses.add("Recepcion");
  if (type === "storage") uses.add("Almacenamiento");
  if (type === "picking") uses.add("Operacion");
  if (type === "production") uses.add("Producción");
  if (type === "staging") uses.add("Alistamiento");

  if (params.isPrimaryLoc) {
    if (params.capability?.can_receive_remissions) uses.add("Entrada remisión");
    if (params.capability?.can_sell) uses.add("Venta");
    if (params.capability?.can_produce) uses.add("Producción local");
    if (params.capability?.can_hold_inventory) uses.add("Stock principal");
  }

  if (params.routeInputCount > 0) uses.add("Consume insumos");
  if (params.routeOutputCount > 0) uses.add("Recibe terminado");

  return Array.from(uses);
}

function buildDiagnostics(params: {
  site: SiteRow;
  capability?: CapabilityRow;
  locations: LocationRow[];
  areas: AreaRow[];
  primaryLoc: LocationRow | null;
}) {
  const diagnostics: string[] = [];
  const operationModel = params.capability?.operation_model ?? "multi_area";
  const activeLocations = params.locations.filter((loc) => loc.is_active !== false);
  const activeAreas = params.areas.filter((area) => area.is_active !== false);

  if (operationModel === "single_loc") {
    if (!params.primaryLoc) diagnostics.push("Define el LOC principal.");
    if (activeLocations.length > 1) diagnostics.push("Tiene mas de un LOC activo; confirma cual es el principal.");
  }

  if (operationModel !== "single_loc") {
    for (const loc of activeLocations) {
      if (!loc.area_id) diagnostics.push(`${loc.code ?? "LOC"} no tiene area asignada.`);
    }
    for (const area of activeAreas) {
      if (!activeLocations.some((loc) => loc.area_id === area.id)) {
        diagnostics.push(`${area.name ?? area.kind ?? "Area"} no tiene LOC activo.`);
      }
    }
  }

  if (params.capability?.can_produce && activeLocations.length === 0) {
    diagnostics.push("Produce, pero no tiene LOC activo.");
  }

  if ((params.capability?.can_sell || params.capability?.can_receive_remissions) && activeLocations.length === 0) {
    diagnostics.push("Opera inventario, pero no tiene LOC activo.");
  }

  return diagnostics;
}

async function updateSiteOperation(formData: FormData) {
  "use server";

  const siteId = asText(formData.get("site_id"));
  const operationModel = normalizeOperationModel(asText(formData.get("operation_model")));
  const primaryLocationId = asText(formData.get("primary_operational_location_id")) || null;
  const visibilityRaw = asText(formData.get("operational_visibility"));
  const operationalVisibility = ["app_review", "test", "hidden"].includes(visibilityRaw)
    ? visibilityRaw
    : "operational";

  await requireAppAccess({
    appId: "viso",
    returnTo: "/operations-map",
    permissionCode: "staff.permissions.manage",
  });

  if (!siteId) {
    redirect("/operations-map?error=" + encodeURIComponent("Selecciona una sede."));
  }

  const supabase = createAdminClient();

  if (primaryLocationId) {
    const { data: location } = await supabase
      .from("inventory_locations")
      .select("id,site_id")
      .eq("id", primaryLocationId)
      .maybeSingle();

    if (!location || location.site_id !== siteId) {
      redirect("/operations-map?error=" + encodeURIComponent("El LOC principal no pertenece a la sede."));
    }
  }

  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("site_operational_capabilities").upsert(
    {
      site_id: siteId,
      operation_model: operationModel,
      primary_operational_location_id: operationModel === "single_loc" ? primaryLocationId : primaryLocationId,
      updated_by: auth.user?.id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "site_id" }
  );

  if (error) {
    redirect("/operations-map?error=" + encodeURIComponent(error.message));
  }

  const { error: siteError } = await supabase
    .from("sites")
    .update({ operational_visibility: operationalVisibility })
    .eq("id", siteId);

  if (siteError) {
    redirect("/operations-map?error=" + encodeURIComponent(siteError.message));
  }

  revalidatePath("/operations-map");
  const visibilityQuery = operationalVisibility === "operational" ? "" : "&show_all=1";
  redirect("/operations-map?ok=" + encodeURIComponent("Mapa operativo actualizado.") + visibilityQuery);
}

async function createArea(formData: FormData) {
  "use server";

  const siteId = asText(formData.get("site_id"));
  const name = asText(formData.get("name"));
  const code = asText(formData.get("code"));
  const kind = asText(formData.get("kind"));

  await requireAppAccess({
    appId: "viso",
    returnTo: "/operations-map",
    permissionCode: "staff.permissions.manage",
  });

  if (!siteId || !name || !code || !kind) {
    redirect(backToMap("?error=" + encodeURIComponent("Completa sede, area, codigo y tipo.")));
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("areas").insert({
    site_id: siteId,
    name,
    code,
    kind,
    is_active: true,
  });

  if (error) {
    redirect(backToMap("?error=" + encodeURIComponent(error.message)));
  }

  revalidatePath("/operations-map");
  redirect(backToMap("?ok=" + encodeURIComponent("Area creada.")));
}

async function updateArea(formData: FormData) {
  "use server";

  const areaId = asText(formData.get("area_id"));
  const siteId = asText(formData.get("site_id"));
  const name = asText(formData.get("name"));
  const code = asText(formData.get("code"));
  const kind = asText(formData.get("kind"));
  const isActive = booleanFromForm(formData.get("is_active"));

  await requireAppAccess({
    appId: "viso",
    returnTo: "/operations-map",
    permissionCode: "staff.permissions.manage",
  });

  if (!areaId || !siteId || !name || !kind) {
    redirect(backToMap("?error=" + encodeURIComponent("Completa nombre y tipo del area.")));
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("areas")
    .update({ name, code: code || null, kind, is_active: isActive })
    .eq("id", areaId)
    .eq("site_id", siteId);

  if (error) {
    redirect(backToMap("?error=" + encodeURIComponent(error.message)));
  }

  revalidatePath("/operations-map");
  redirect(backToMap("?ok=" + encodeURIComponent("Area actualizada.")));
}

async function deleteArea(formData: FormData) {
  "use server";

  const areaId = asText(formData.get("area_id"));
  const siteId = asText(formData.get("site_id"));

  await requireAppAccess({
    appId: "viso",
    returnTo: "/operations-map",
    permissionCode: "staff.permissions.manage",
  });

  if (!areaId || !siteId) {
    redirect(backToMap("?error=" + encodeURIComponent("Selecciona un area.")));
  }

  const supabase = createAdminClient();
  const { data: area } = await supabase
    .from("areas")
    .select("id,is_active")
    .eq("id", areaId)
    .eq("site_id", siteId)
    .maybeSingle();

  if (!area) {
    redirect(backToMap("?error=" + encodeURIComponent("Area no encontrada.")));
  }

  if (area.is_active !== false) {
    redirect(backToMap("?error=" + encodeURIComponent("Primero desactiva el area antes de eliminarla.")));
  }

  const [locs, employeePermissions, employeeSettings, recipes, rules, recipeUses] = await Promise.all([
    countRows(supabase, "inventory_locations", "area_id", areaId),
    countRows(supabase, "employee_permissions", "scope_area_id", areaId),
    countRows(supabase, "employee_settings", "selected_area_id", areaId),
    countRows(supabase, "recipe_cards", "area_id", areaId),
    countRows(supabase, "pulso_sales_consumption_rules", "area_id", areaId),
    countRows(supabase, "recipe_site_uses", "area_id", areaId),
  ]);
  const blockers = locs + employeePermissions + employeeSettings + recipes + rules + recipeUses;

  if (blockers > 0) {
    redirect(backToMap("?error=" + encodeURIComponent("No se puede eliminar: todavía tiene LOCs, recetas, reglas o permisos vinculados.")));
  }

  const { error } = await supabase.from("areas").delete().eq("id", areaId).eq("site_id", siteId);

  if (error) {
    redirect(backToMap("?error=" + encodeURIComponent(error.message)));
  }

  revalidatePath("/operations-map");
  redirect(backToMap("?ok=" + encodeURIComponent("Area eliminada definitivamente.")));
}

async function createLocation(formData: FormData) {
  "use server";

  const siteId = asText(formData.get("site_id"));
  const areaId = asText(formData.get("area_id")) || null;
  const code = asText(formData.get("code"));
  const zoneRaw = asText(formData.get("zone"));
  const description = asText(formData.get("description"));
  const locationType = normalizeLocationType(asText(formData.get("location_type")));

  await requireAppAccess({
    appId: "viso",
    returnTo: "/operations-map",
    permissionCode: "staff.permissions.manage",
  });

  if (!siteId || !code) {
    redirect(backToMap("?error=" + encodeURIComponent("Completa sede y codigo del LOC.")));
  }

  const supabase = createAdminClient();

  if (areaId) {
    const { data: area } = await supabase.from("areas").select("id,site_id").eq("id", areaId).maybeSingle();
    if (!area || area.site_id !== siteId) {
      redirect(backToMap("?error=" + encodeURIComponent("El area no pertenece a la sede.")));
    }
  }

  const { error } = await supabase.from("inventory_locations").insert({
    site_id: siteId,
    area_id: areaId,
    code,
    zone: zoneRaw || code,
    description: description || null,
    location_type: locationType,
    is_active: true,
  });

  if (error) {
    redirect(backToMap("?error=" + encodeURIComponent(error.message)));
  }

  revalidatePath("/operations-map");
  redirect(backToMap("?ok=" + encodeURIComponent("LOC creado.")));
}

async function updateLocation(formData: FormData) {
  "use server";

  const locationId = asText(formData.get("location_id"));
  const siteId = asText(formData.get("site_id"));
  const areaId = asText(formData.get("area_id")) || null;
  const code = asText(formData.get("code"));
  const zone = asText(formData.get("zone"));
  const description = asText(formData.get("description"));
  const locationType = normalizeLocationType(asText(formData.get("location_type")));
  const isActive = booleanFromForm(formData.get("is_active"));

  await requireAppAccess({
    appId: "viso",
    returnTo: "/operations-map",
    permissionCode: "staff.permissions.manage",
  });

  if (!locationId || !siteId || !code) {
    redirect(backToMap("?error=" + encodeURIComponent("Completa el codigo del LOC.")));
  }

  const supabase = createAdminClient();

  if (areaId) {
    const { data: area } = await supabase.from("areas").select("id,site_id").eq("id", areaId).maybeSingle();
    if (!area || area.site_id !== siteId) {
      redirect(backToMap("?error=" + encodeURIComponent("El area no pertenece a la sede.")));
    }
  }

  const { error } = await supabase
    .from("inventory_locations")
    .update({
      area_id: areaId,
      code,
      zone: zone || null,
      description: description || null,
      location_type: locationType,
      is_active: isActive,
    })
    .eq("id", locationId)
    .eq("site_id", siteId);

  if (error) {
    redirect(backToMap("?error=" + encodeURIComponent(error.message)));
  }

  revalidatePath("/operations-map");
  redirect(backToMap("?ok=" + encodeURIComponent("LOC actualizado.")));
}

async function deleteLocation(formData: FormData) {
  "use server";

  const locationId = asText(formData.get("location_id"));
  const siteId = asText(formData.get("site_id"));

  await requireAppAccess({
    appId: "viso",
    returnTo: "/operations-map",
    permissionCode: "staff.permissions.manage",
  });

  if (!locationId || !siteId) {
    redirect(backToMap("?error=" + encodeURIComponent("Selecciona un LOC.")));
  }

  const supabase = createAdminClient();
  const { data: location } = await supabase
    .from("inventory_locations")
    .select("id,is_active")
    .eq("id", locationId)
    .eq("site_id", siteId)
    .maybeSingle();

  if (!location) {
    redirect(backToMap("?error=" + encodeURIComponent("LOC no encontrado.")));
  }

  if (location.is_active !== false) {
    redirect(backToMap("?error=" + encodeURIComponent("Primero desactiva el LOC antes de eliminarlo.")));
  }

  const blockers = await locDeleteBlockers(supabase, locationId);
  if (blockers > 0) {
    redirect(backToMap("?error=" + encodeURIComponent("No se puede eliminar: todavía tiene stock, rutas, recetas, lotes, ventas o personas vinculadas.")));
  }

  const { error } = await supabase.from("inventory_locations").delete().eq("id", locationId).eq("site_id", siteId);

  if (error) {
    redirect(backToMap("?error=" + encodeURIComponent(error.message)));
  }

  revalidatePath("/operations-map");
  redirect(backToMap("?ok=" + encodeURIComponent("LOC eliminado definitivamente.")));
}

export default async function OperationsMapPage({
  searchParams,
}: {
  searchParams?: Promise<{ ok?: string; error?: string; show_all?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const okMsg = sp.ok ? decodeURIComponent(sp.ok) : "";
  const errorMsg = sp.error ? decodeURIComponent(sp.error) : "";
  const showAllSites = sp.show_all === "1";

  const { supabase } = await requireAppAccess({
    appId: "viso",
    returnTo: "/operations-map",
    permissionCode: "staff.permissions.manage",
  });

  const [
    sitesRes,
    capabilitiesRes,
    areasRes,
    locationsRes,
    employeeSitesRes,
    locAssignmentsRes,
    routesRes,
    rolePermissionsRes,
  ] = await Promise.all([
    supabase.from("sites").select("id,code,name,site_type,is_active,operational_visibility").order("name", { ascending: true }),
    supabase
      .from("site_operational_capabilities")
      .select(
        "site_id,can_request_remissions,can_fulfill_remissions,can_receive_remissions,can_sell,can_produce,can_hold_inventory,is_commercial_business,show_in_product_setup,operation_model,primary_operational_location_id"
      ),
    supabase.from("areas").select("id,site_id,code,name,kind,is_active").order("name", { ascending: true }),
    supabase
      .from("inventory_locations")
      .select("id,site_id,area_id,code,zone,description,location_type,is_active")
      .order("code", { ascending: true }),
    supabase
      .from("employee_sites")
      .select("employee_id,site_id,is_active,employee:employees(id,full_name,alias,role,is_active)")
      .eq("is_active", true),
    supabase
      .from("employee_inventory_location_assignments")
      .select("employee_id,site_id,location_id,purpose,is_active,employee:employees(id,full_name,alias,role)")
      .eq("is_active", true),
    supabase
      .from("product_site_production_routes")
      .select("id,product_id,site_id,area_kind,input_location_id,output_location_id,output_mode,is_active")
      .eq("is_active", true),
    supabase
      .from("role_permissions")
      .select("role,scope_type,scope_site_id,scope_area_id,scope_area_kind,is_allowed")
      .eq("is_allowed", true),
  ]);

  const loadError =
    sitesRes.error?.message ||
    capabilitiesRes.error?.message ||
    areasRes.error?.message ||
    locationsRes.error?.message ||
    employeeSitesRes.error?.message ||
    locAssignmentsRes.error?.message ||
    routesRes.error?.message ||
    rolePermissionsRes.error?.message ||
    "";

  if (loadError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Mapa operativo" subtitle="Sedes, areas, LOCs y responsables." />
        <div className="ui-alert ui-alert--error">{loadError}</div>
      </div>
    );
  }

  const allSites = (sitesRes.data ?? []) as SiteRow[];
  const sites = showAllSites
    ? allSites
    : allSites.filter((site) => String(site.operational_visibility ?? "operational") === "operational");
  const hiddenSiteCount = allSites.length - sites.length;
  const capabilitiesBySite = new Map(
    ((capabilitiesRes.data ?? []) as CapabilityRow[]).map((row) => [row.site_id, row])
  );
  const areas = (areasRes.data ?? []) as AreaRow[];
  const locations = (locationsRes.data ?? []) as LocationRow[];
  const employeeSites = (employeeSitesRes.data ?? []) as EmployeeSiteRow[];
  const locAssignments = (locAssignmentsRes.data ?? []) as LocAssignmentRow[];
  const routes = (routesRes.data ?? []) as RouteRow[];
  const rolePermissions = (rolePermissionsRes.data ?? []) as RolePermissionRow[];

  const areasBySite = new Map<string, AreaRow[]>();
  for (const area of areas) {
    const siteId = String(area.site_id ?? "");
    areasBySite.set(siteId, [...(areasBySite.get(siteId) ?? []), area]);
  }

  const locationsBySite = new Map<string, LocationRow[]>();
  for (const loc of locations) {
    const siteId = String(loc.site_id ?? "");
    locationsBySite.set(siteId, [...(locationsBySite.get(siteId) ?? []), loc]);
  }

  const employeesBySite = new Map<string, EmployeeSiteRow[]>();
  for (const row of employeeSites) {
    const siteId = String(row.site_id ?? "");
    employeesBySite.set(siteId, [...(employeesBySite.get(siteId) ?? []), row]);
  }

  const locAssignmentsByLocation = new Map<string, LocAssignmentRow[]>();
  for (const row of locAssignments) {
    const locId = String(row.location_id ?? "");
    locAssignmentsByLocation.set(locId, [...(locAssignmentsByLocation.get(locId) ?? []), row]);
  }

  const routesByInputLocation = new Map<string, RouteRow[]>();
  const routesByOutputLocation = new Map<string, RouteRow[]>();
  for (const route of routes) {
    if (route.input_location_id) {
      routesByInputLocation.set(route.input_location_id, [
        ...(routesByInputLocation.get(route.input_location_id) ?? []),
        route,
      ]);
    }
    if (route.output_location_id) {
      routesByOutputLocation.set(route.output_location_id, [
        ...(routesByOutputLocation.get(route.output_location_id) ?? []),
        route,
      ]);
    }
  }

  const rolesBySite = new Map<string, Set<string>>();
  const rolesByArea = new Map<string, Set<string>>();
  const rolesByAreaKind = new Map<string, Set<string>>();
  for (const row of rolePermissions) {
    if (row.scope_type === "site" && row.scope_site_id) {
      const set = rolesBySite.get(row.scope_site_id) ?? new Set<string>();
      set.add(row.role);
      rolesBySite.set(row.scope_site_id, set);
    }
    if (row.scope_type === "area" && row.scope_area_id) {
      const set = rolesByArea.get(row.scope_area_id) ?? new Set<string>();
      set.add(row.role);
      rolesByArea.set(row.scope_area_id, set);
    }
    if (row.scope_type === "area_kind" && row.scope_area_kind) {
      const set = rolesByAreaKind.get(row.scope_area_kind) ?? new Set<string>();
      set.add(row.role);
      rolesByAreaKind.set(row.scope_area_kind, set);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mapa operativo"
        subtitle="Vista gerencial simple de sedes, areas, LOCs, capacidades y responsables."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href={showAllSites ? "/operations-map" : "/operations-map?show_all=1"}
              className="ui-btn ui-btn--ghost"
            >
              {showAllSites ? "Ver solo operativas" : `Ver no operativas${hiddenSiteCount ? ` (${hiddenSiteCount})` : ""}`}
            </Link>
            <Link href="/sites" className="ui-btn ui-btn--ghost">
              Sedes
            </Link>
            <Link href="/roles-permissions" className="ui-btn ui-btn--ghost">
              Roles
            </Link>
          </div>
        }
      />

      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}

      <section className="grid gap-3 md:grid-cols-4">
        <div className="ui-panel">
          <div className="ui-caption">Sedes</div>
          <div className="mt-1 text-2xl font-semibold text-[var(--ui-text)]">{sites.length}</div>
        </div>
        <div className="ui-panel">
          <div className="ui-caption">Areas</div>
          <div className="mt-1 text-2xl font-semibold text-[var(--ui-text)]">{areas.length}</div>
        </div>
        <div className="ui-panel">
          <div className="ui-caption">LOCs</div>
          <div className="mt-1 text-2xl font-semibold text-[var(--ui-text)]">{locations.length}</div>
        </div>
        <div className="ui-panel">
          <div className="ui-caption">Rutas activas</div>
          <div className="mt-1 text-2xl font-semibold text-[var(--ui-text)]">{routes.length}</div>
        </div>
      </section>

      <section className="space-y-4">
        {sites.map((site) => {
          const capability = capabilitiesBySite.get(site.id);
          const siteAreas = areasBySite.get(site.id) ?? [];
          const siteLocations = locationsBySite.get(site.id) ?? [];
          const primaryLoc = capability?.primary_operational_location_id
            ? siteLocations.find((loc) => loc.id === capability.primary_operational_location_id) ?? null
            : null;
          const diagnostics = buildDiagnostics({
            site,
            capability,
            locations: siteLocations,
            areas: siteAreas,
            primaryLoc,
          });
          const unassignedLocations = siteLocations.filter((loc) => !loc.area_id);
          const siteEmployees = employeesBySite.get(site.id) ?? [];
          const siteRoles = Array.from(rolesBySite.get(site.id) ?? new Set<string>());

          return (
            <details key={site.id} className="ui-panel group" open={diagnostics.length > 0}>
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-[var(--ui-text)]">{site.name ?? site.code ?? "Sede"}</h2>
                    <span className={site.is_active ? "ui-chip ui-chip--success" : "ui-chip"}>
                      {site.is_active ? "Activa" : "Inactiva"}
                    </span>
                    <span className={visibilityChipClass(site.operational_visibility)}>
                      {visibilityLabel(site.operational_visibility)}
                    </span>
                    <span className="ui-chip">{operationModelLabel(capability?.operation_model)}</span>
                    {diagnostics.length ? <span className="ui-chip ui-chip--warning">{diagnostics.length} alerta(s)</span> : null}
                  </div>
                  <div className="mt-1 text-sm text-[var(--ui-muted)]">
                    {site.code ?? "Sin codigo"} · {siteAreas.length} area(s) · {siteLocations.length} LOC(s)
                  </div>
                </div>
                <div className="text-sm font-medium text-[var(--ui-muted)] group-open:hidden">Ver detalle</div>
              </summary>

              <div className="mt-5 grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
                <div className="space-y-4">
                  <form action={updateSiteOperation} className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4">
                    <input type="hidden" name="site_id" value={site.id} />
                    <div className="ui-label">Configuración simple</div>
                    <div className="mt-3 grid gap-3">
                      <label className="grid gap-1">
                        <span className="ui-caption">Visibilidad</span>
                        <select
                          name="operational_visibility"
                          defaultValue={site.operational_visibility ?? "operational"}
                          className="ui-input"
                        >
                          <option value="operational">Operativa</option>
                          <option value="app_review">App Review</option>
                          <option value="test">Test</option>
                          <option value="hidden">Oculta</option>
                        </select>
                      </label>
                      <label className="grid gap-1">
                        <span className="ui-caption">Modelo operativo</span>
                        <select name="operation_model" defaultValue={capability?.operation_model ?? "multi_area"} className="ui-input">
                          <option value="single_loc">LOC unico</option>
                          <option value="multi_area">Multi area</option>
                          <option value="multi_loc">Varios LOCs</option>
                        </select>
                      </label>
                      <label className="grid gap-1">
                        <span className="ui-caption">LOC principal</span>
                        <select
                          name="primary_operational_location_id"
                          defaultValue={capability?.primary_operational_location_id ?? ""}
                          className="ui-input"
                        >
                          <option value="">Sin LOC principal</option>
                          {siteLocations
                            .filter((loc) => loc.is_active !== false)
                            .map((loc) => (
                              <option key={loc.id} value={loc.id}>
                                {loc.code ?? loc.zone ?? loc.id}
                              </option>
                            ))}
                        </select>
                      </label>
                      <button type="submit" className="ui-btn ui-btn--brand justify-center">
                        Guardar
                      </button>
                    </div>
                  </form>

                  <form action={createArea} className="rounded-xl border border-[var(--ui-border)] bg-white p-4">
                    <input type="hidden" name="site_id" value={site.id} />
                    <div className="ui-label">Nueva área</div>
                    <div className="mt-3 grid gap-3">
                      <label className="grid gap-1">
                        <span className="ui-caption">Área</span>
                        <input name="name" className="ui-input" />
                      </label>
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="grid gap-1">
                          <span className="ui-caption">Código</span>
                          <input name="code" className="ui-input" />
                        </label>
                        <label className="grid gap-1">
                          <span className="ui-caption">Tipo</span>
                          <input name="kind" className="ui-input" />
                        </label>
                      </div>
                      <button type="submit" className="ui-btn ui-btn--ghost justify-center">
                        Crear área
                      </button>
                    </div>
                  </form>

                  <form action={createLocation} className="rounded-xl border border-[var(--ui-border)] bg-white p-4">
                    <input type="hidden" name="site_id" value={site.id} />
                    <div className="ui-label">Nuevo LOC</div>
                    <div className="mt-3 grid gap-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="grid gap-1">
                          <span className="ui-caption">LOC</span>
                          <input name="code" className="ui-input" />
                        </label>
                        <label className="grid gap-1">
                          <span className="ui-caption">Tipo</span>
                          <select name="location_type" defaultValue="storage" className="ui-input">
                            <option value="storage">Almacenamiento</option>
                            <option value="production">Producción</option>
                            <option value="picking">Operación</option>
                            <option value="receiving">Recepción</option>
                            <option value="staging">Alistamiento</option>
                          </select>
                        </label>
                        <label className="grid gap-1">
                          <span className="ui-caption">Área</span>
                          <select name="area_id" defaultValue="" className="ui-input">
                            <option value="">Sin área</option>
                            {siteAreas.map((area) => (
                              <option key={area.id} value={area.id}>
                                {area.name ?? area.kind ?? area.code ?? area.id}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-1">
                          <span className="ui-caption">Zona</span>
                          <input name="zone" className="ui-input" />
                        </label>
                      </div>
                      <label className="grid gap-1">
                        <span className="ui-caption">Descripción</span>
                        <input name="description" className="ui-input" />
                      </label>
                      <button type="submit" className="ui-btn ui-btn--ghost justify-center">
                        Crear LOC
                      </button>
                    </div>
                  </form>

                  <div className="rounded-xl border border-[var(--ui-border)] bg-white p-4">
                    <div className="ui-label">Capacidades</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {capabilityLabels(capability).length ? (
                        capabilityLabels(capability).map((label) => (
                          <span key={label} className="ui-chip ui-chip--success">
                            {label}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-[var(--ui-muted)]">Sin capacidades configuradas.</span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--ui-border)] bg-white p-4">
                    <div className="ui-label">Personas y roles</div>
                    <div className="mt-3 space-y-2">
                      {siteEmployees.slice(0, 8).map((row) => {
                        const employee = one(row.employee);
                        return (
                          <div key={`${site.id}-${row.employee_id}`} className="flex items-center justify-between gap-2 text-sm">
                            <span>{employee?.alias || employee?.full_name || row.employee_id}</span>
                            <span className="ui-chip">{roleLabel(employee?.role)}</span>
                          </div>
                        );
                      })}
                      {siteEmployees.length > 8 ? (
                        <div className="text-xs text-[var(--ui-muted)]">+{siteEmployees.length - 8} persona(s)</div>
                      ) : null}
                      {siteEmployees.length === 0 ? <div className="text-sm text-[var(--ui-muted)]">Sin personas vinculadas.</div> : null}
                    </div>
                    {siteRoles.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {siteRoles.map((role) => (
                          <span key={`${site.id}-${role}`} className="ui-chip">
                            {roleLabel(role)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-4">
                  {diagnostics.length ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      <div className="font-semibold">Alertas</div>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        {diagnostics.map((diagnostic) => (
                          <li key={diagnostic}>{diagnostic}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {siteAreas.map((area) => {
                    const areaLocations = siteLocations.filter((loc) => loc.area_id === area.id);
                    const areaRoles = Array.from(new Set([
                      ...Array.from(rolesByArea.get(area.id) ?? new Set<string>()),
                      ...Array.from(rolesByAreaKind.get(String(area.kind ?? "")) ?? new Set<string>()),
                    ]));

                    return (
                      <div key={area.id} className="rounded-xl border border-[var(--ui-border)] bg-white p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="text-base font-semibold text-[var(--ui-text)]">{area.name ?? area.kind ?? "Area"}</div>
                            <div className="mt-1 text-xs text-[var(--ui-muted)]">{area.code ?? "Sin codigo"} · {area.kind ?? "sin tipo"}</div>
                          </div>
                          <span className={area.is_active === false ? "ui-chip" : "ui-chip ui-chip--success"}>
                            {area.is_active === false ? "Inactiva" : "Activa"}
                          </span>
                        </div>

                        <form action={updateArea} className="mt-3 grid gap-3">
                          <input type="hidden" name="area_id" value={area.id} />
                          <input type="hidden" name="site_id" value={site.id} />
                          <div className="grid gap-2 md:grid-cols-[1fr_0.8fr_0.8fr]">
                            <label className="grid gap-1">
                              <span className="ui-caption">Area</span>
                              <input name="name" defaultValue={area.name ?? ""} className="ui-input" />
                            </label>
                            <label className="grid gap-1">
                              <span className="ui-caption">Codigo</span>
                              <input name="code" defaultValue={area.code ?? ""} className="ui-input" />
                            </label>
                            <label className="grid gap-1">
                              <span className="ui-caption">Tipo</span>
                              <input name="kind" defaultValue={area.kind ?? ""} className="ui-input" />
                            </label>
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <label className="flex items-center gap-2 text-sm text-[var(--ui-muted)]">
                              <input type="checkbox" name="is_active" defaultChecked={area.is_active !== false} />
                              Activa
                            </label>
                            <div className="flex flex-wrap gap-2">
                              {area.is_active === false ? (
                                <button type="submit" formAction={deleteArea} className="ui-btn ui-btn--ghost text-red-700">
                                  Eliminar area
                                </button>
                              ) : null}
                              <button type="submit" className="ui-btn ui-btn--ghost">
                                Guardar area
                              </button>
                            </div>
                          </div>
                        </form>

                        {areaRoles.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {areaRoles.map((role) => (
                              <span key={`${area.id}-${role}`} className="ui-chip">
                                {roleLabel(role)}
                              </span>
                            ))}
                          </div>
                        ) : null}

                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          {areaLocations.map((loc) => {
                            const assignedPeople = locAssignmentsByLocation.get(loc.id) ?? [];
                            const uses = inferredLocationUses({
                              location: loc,
                              capability,
                              isPrimaryLoc: loc.id === capability?.primary_operational_location_id,
                              routeInputCount: routesByInputLocation.get(loc.id)?.length ?? 0,
                              routeOutputCount: routesByOutputLocation.get(loc.id)?.length ?? 0,
                            });

                            return (
                              <div key={loc.id} className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <div className="font-semibold text-[var(--ui-text)]">{loc.code ?? loc.zone ?? "LOC"}</div>
                                    <div className="mt-1 text-xs text-[var(--ui-muted)]">{locationTypeLabel(loc.location_type)}</div>
                                  </div>
                                  <span className={loc.is_active === false ? "ui-chip" : "ui-chip ui-chip--success"}>
                                    {loc.is_active === false ? "Inactivo" : "Activo"}
                                  </span>
                                </div>
                                <form action={updateLocation} className="mt-3 grid gap-3">
                                  <input type="hidden" name="location_id" value={loc.id} />
                                  <input type="hidden" name="site_id" value={site.id} />
                                  <div className="grid gap-2 md:grid-cols-2">
                                    <label className="grid gap-1">
                                      <span className="ui-caption">LOC</span>
                                      <input name="code" defaultValue={loc.code ?? ""} className="ui-input" />
                                    </label>
                                    <label className="grid gap-1">
                                      <span className="ui-caption">Tipo</span>
                                      <select name="location_type" defaultValue={loc.location_type ?? "storage"} className="ui-input">
                                        <option value="storage">Almacenamiento</option>
                                        <option value="production">Producción</option>
                                        <option value="picking">Operacion</option>
                                        <option value="receiving">Recepcion</option>
                                        <option value="staging">Alistamiento</option>
                                      </select>
                                    </label>
                                    <label className="grid gap-1">
                                      <span className="ui-caption">Area</span>
                                      <select name="area_id" defaultValue={loc.area_id ?? ""} className="ui-input">
                                        <option value="">Sin area</option>
                                        {siteAreas.map((optionArea) => (
                                          <option key={optionArea.id} value={optionArea.id}>
                                            {optionArea.name ?? optionArea.kind ?? optionArea.code ?? optionArea.id}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label className="grid gap-1">
                                      <span className="ui-caption">Zona</span>
                                      <input name="zone" defaultValue={loc.zone ?? ""} className="ui-input" />
                                    </label>
                                  </div>
                                  <label className="grid gap-1">
                                    <span className="ui-caption">Descripción</span>
                                    <input name="description" defaultValue={loc.description ?? ""} className="ui-input" />
                                  </label>
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <label className="flex items-center gap-2 text-sm text-[var(--ui-muted)]">
                                      <input type="checkbox" name="is_active" defaultChecked={loc.is_active !== false} />
                                      Activo
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                      {loc.is_active === false ? (
                                        <button
                                          type="submit"
                                          formAction={deleteLocation}
                                          className="ui-btn ui-btn--ghost text-red-700"
                                        >
                                          Eliminar LOC
                                        </button>
                                      ) : null}
                                      <button type="submit" className="ui-btn ui-btn--ghost">
                                        Guardar LOC
                                      </button>
                                    </div>
                                  </div>
                                </form>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {uses.length ? (
                                    uses.map((use) => (
                                      <span key={`${loc.id}-${use}`} className="ui-chip">
                                        {use}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-xs text-[var(--ui-muted)]">Sin uso inferido.</span>
                                  )}
                                </div>
                                {assignedPeople.length ? (
                                  <div className="mt-3 text-xs text-[var(--ui-muted)]">
                                    {assignedPeople
                                      .slice(0, 3)
                                      .map((row) => one(row.employee)?.alias || one(row.employee)?.full_name || row.employee_id)
                                      .join(", ")}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                          {areaLocations.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-[var(--ui-border)] p-3 text-sm text-[var(--ui-muted)]">
                              Sin LOCs en esta area.
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}

                  {unassignedLocations.length ? (
                    <div className="rounded-xl border border-[var(--ui-border)] bg-white p-4">
                      <div className="text-base font-semibold text-[var(--ui-text)]">LOCs sin area</div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {unassignedLocations.map((loc) => (
                          <div key={loc.id} className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
                            <div className="font-semibold text-[var(--ui-text)]">{loc.code ?? loc.zone ?? "LOC"}</div>
                            <div className="mt-1 text-xs text-[var(--ui-muted)]">{locationTypeLabel(loc.location_type)}</div>
                            <form action={updateLocation} className="mt-3 grid gap-3">
                              <input type="hidden" name="location_id" value={loc.id} />
                              <input type="hidden" name="site_id" value={site.id} />
                              <div className="grid gap-2 md:grid-cols-2">
                                <label className="grid gap-1">
                                  <span className="ui-caption">LOC</span>
                                  <input name="code" defaultValue={loc.code ?? ""} className="ui-input" />
                                </label>
                                <label className="grid gap-1">
                                  <span className="ui-caption">Tipo</span>
                                  <select name="location_type" defaultValue={loc.location_type ?? "storage"} className="ui-input">
                                    <option value="storage">Almacenamiento</option>
                                    <option value="production">Producción</option>
                                    <option value="picking">Operacion</option>
                                    <option value="receiving">Recepcion</option>
                                    <option value="staging">Alistamiento</option>
                                  </select>
                                </label>
                                <label className="grid gap-1">
                                  <span className="ui-caption">Area</span>
                                  <select name="area_id" defaultValue="" className="ui-input">
                                    <option value="">Sin area</option>
                                    {siteAreas.map((optionArea) => (
                                      <option key={optionArea.id} value={optionArea.id}>
                                        {optionArea.name ?? optionArea.kind ?? optionArea.code ?? optionArea.id}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="grid gap-1">
                                  <span className="ui-caption">Zona</span>
                                  <input name="zone" defaultValue={loc.zone ?? ""} className="ui-input" />
                                </label>
                              </div>
                              <label className="grid gap-1">
                                <span className="ui-caption">Descripción</span>
                                <input name="description" defaultValue={loc.description ?? ""} className="ui-input" />
                              </label>
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <label className="flex items-center gap-2 text-sm text-[var(--ui-muted)]">
                                  <input type="checkbox" name="is_active" defaultChecked={loc.is_active !== false} />
                                  Activo
                                </label>
                                <div className="flex flex-wrap gap-2">
                                  {loc.is_active === false ? (
                                    <button
                                      type="submit"
                                      formAction={deleteLocation}
                                      className="ui-btn ui-btn--ghost text-red-700"
                                    >
                                      Eliminar LOC
                                    </button>
                                  ) : null}
                                  <button type="submit" className="ui-btn ui-btn--ghost">
                                    Guardar LOC
                                  </button>
                                </div>
                              </div>
                            </form>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </details>
          );
        })}
      </section>
    </div>
  );
}
