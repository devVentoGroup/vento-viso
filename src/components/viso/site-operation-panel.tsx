import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

type OperationModel = "single_loc" | "multi_area" | "multi_loc";

type CapabilityRow = {
  site_id: string;
  can_request_remissions: boolean | null;
  can_fulfill_remissions: boolean | null;
  can_receive_remissions: boolean | null;
  can_schedule_staff: boolean | null;
  can_sell: boolean | null;
  can_produce: boolean | null;
  can_hold_inventory: boolean | null;
  is_commercial_business: boolean | null;
  show_in_product_setup: boolean | null;
  operation_model: OperationModel | null;
  primary_operational_location_id: string | null;
};

type LocationRow = {
  id: string;
  code: string | null;
  description: string | null;
  location_type: string | null;
  is_active: boolean | null;
};

const checked = (formData: FormData, name: string) => formData.get(name) === "on";
const text = (value: FormDataEntryValue | null) => (typeof value === "string" ? value.trim() : "");
const siteHref = (siteId: string) => `/sites/${siteId}`;

function normalizeModel(value: string): OperationModel {
  if (value === "single_loc" || value === "multi_loc") return value;
  return "multi_area";
}

function diagnostics(capability: CapabilityRow | null, locations: LocationRow[]) {
  const activeLocations = locations.filter((location) => location.is_active !== false);
  const messages: string[] = [];
  const primary = capability?.primary_operational_location_id
    ? activeLocations.find((location) => location.id === capability.primary_operational_location_id)
    : null;

  if (!primary && activeLocations.length > 0) messages.push("La sede no tiene un LOC principal definido.");
  if (capability?.operation_model === "single_loc" && activeLocations.length > 1) {
    messages.push("El modelo es LOC único, pero existen varios LOCs activos.");
  }
  if (capability?.can_produce && !activeLocations.some((location) => location.location_type === "production")) {
    messages.push("La sede produce, pero no tiene un LOC activo de producción.");
  }
  if ((capability?.can_hold_inventory || capability?.can_receive_remissions || capability?.can_sell) && activeLocations.length === 0) {
    messages.push("La sede opera inventario, pero no tiene LOCs activos.");
  }

  return messages;
}

async function updateSiteOperation(formData: FormData) {
  "use server";

  const siteId = text(formData.get("site_id"));
  const visibilityRaw = text(formData.get("operational_visibility"));
  const visibility = ["operational", "app_review", "test", "hidden"].includes(visibilityRaw)
    ? visibilityRaw
    : "operational";
  const operationModel = normalizeModel(text(formData.get("operation_model")));
  const primaryLocationId = text(formData.get("primary_operational_location_id")) || null;

  await requireAppAccess({
    appId: "viso",
    returnTo: siteHref(siteId),
    permissionCode: "staff.permissions.manage",
  });

  if (!siteId) redirect("/sites?error=" + encodeURIComponent("Selecciona una sede."));

  const supabase = createAdminClient();

  if (primaryLocationId) {
    const { data: location } = await supabase
      .from("inventory_locations")
      .select("id,site_id,is_active")
      .eq("id", primaryLocationId)
      .maybeSingle();

    if (!location || location.site_id !== siteId || location.is_active === false) {
      redirect(`${siteHref(siteId)}?error=${encodeURIComponent("El LOC principal debe estar activo y pertenecer a la sede.")}`);
    }
  }

  const { data: auth } = await supabase.auth.getUser();
  const { error: capabilityError } = await supabase.from("site_operational_capabilities").upsert(
    {
      site_id: siteId,
      can_request_remissions: checked(formData, "can_request_remissions"),
      can_fulfill_remissions: checked(formData, "can_fulfill_remissions"),
      can_receive_remissions: checked(formData, "can_receive_remissions"),
      can_schedule_staff: checked(formData, "can_schedule_staff"),
      can_sell: checked(formData, "can_sell"),
      can_produce: checked(formData, "can_produce"),
      can_hold_inventory: checked(formData, "can_hold_inventory"),
      is_commercial_business: checked(formData, "is_commercial_business"),
      show_in_product_setup: checked(formData, "show_in_product_setup"),
      operation_model: operationModel,
      primary_operational_location_id: primaryLocationId,
      updated_by: auth.user?.id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "site_id" }
  );

  if (capabilityError) {
    redirect(`${siteHref(siteId)}?error=${encodeURIComponent(capabilityError.message)}`);
  }

  const { error: siteError } = await supabase
    .from("sites")
    .update({ operational_visibility: visibility })
    .eq("id", siteId);

  if (siteError) redirect(`${siteHref(siteId)}?error=${encodeURIComponent(siteError.message)}`);

  revalidatePath(siteHref(siteId));
  revalidatePath("/operations-map");
  redirect(`${siteHref(siteId)}?ok=${encodeURIComponent("Configuración operativa actualizada.")}`);
}

export async function SiteOperationPanel({ siteId }: { siteId: string }) {
  const { supabase } = await requireAppAccess({
    appId: "viso",
    returnTo: siteHref(siteId),
    permissionCode: "staff.permissions.manage",
  });

  const [siteRes, capabilityRes, locationsRes] = await Promise.all([
    supabase.from("sites").select("id,operational_visibility").eq("id", siteId).maybeSingle(),
    supabase
      .from("site_operational_capabilities")
      .select("site_id,can_request_remissions,can_fulfill_remissions,can_receive_remissions,can_schedule_staff,can_sell,can_produce,can_hold_inventory,is_commercial_business,show_in_product_setup,operation_model,primary_operational_location_id")
      .eq("site_id", siteId)
      .maybeSingle(),
    supabase
      .from("inventory_locations")
      .select("id,code,description,location_type,is_active")
      .eq("site_id", siteId)
      .order("code"),
  ]);

  const capability = (capabilityRes.data ?? null) as CapabilityRow | null;
  const locations = (locationsRes.data ?? []) as LocationRow[];
  const activeLocations = locations.filter((location) => location.is_active !== false);
  const alerts = diagnostics(capability, locations);

  return (
    <section className="ui-panel space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="ui-h2">Operación de la sede</h2>
          <p className="ui-body-muted mt-1">Define qué puede hacer esta sede y cuál ubicación representa su operación principal.</p>
        </div>
        {alerts.length ? <span className="ui-chip ui-chip--warning">{alerts.length} alerta(s)</span> : <span className="ui-chip ui-chip--success">Configuración coherente</span>}
      </div>

      {alerts.length ? (
        <div className="ui-alert ui-alert--warning">
          <ul className="list-disc space-y-1 pl-5">
            {alerts.map((alert) => <li key={alert}>{alert}</li>)}
          </ul>
        </div>
      ) : null}

      <form action={updateSiteOperation} className="space-y-5">
        <input type="hidden" name="site_id" value={siteId} />

        <div className="grid gap-4 md:grid-cols-3">
          <label className="grid gap-1">
            <span className="ui-label">Visibilidad operativa</span>
            <select name="operational_visibility" defaultValue={siteRes.data?.operational_visibility ?? "operational"} className="ui-input">
              <option value="operational">Operativa</option>
              <option value="app_review">Revisión de aplicación</option>
              <option value="test">Pruebas</option>
              <option value="hidden">Oculta</option>
            </select>
          </label>

          <label className="grid gap-1">
            <span className="ui-label">Modelo operativo</span>
            <select name="operation_model" defaultValue={capability?.operation_model ?? "multi_area"} className="ui-input">
              <option value="single_loc">Un solo LOC</option>
              <option value="multi_area">Varias áreas</option>
              <option value="multi_loc">Varios LOCs</option>
            </select>
          </label>

          <label className="grid gap-1">
            <span className="ui-label">LOC principal</span>
            <select name="primary_operational_location_id" defaultValue={capability?.primary_operational_location_id ?? ""} className="ui-input">
              <option value="">Sin LOC principal</option>
              {activeLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.code ?? location.description ?? location.id}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[
            ["can_request_remissions", "Solicita remisiones", capability?.can_request_remissions],
            ["can_fulfill_remissions", "Despacha remisiones", capability?.can_fulfill_remissions],
            ["can_receive_remissions", "Recibe remisiones", capability?.can_receive_remissions],
            ["can_sell", "Realiza ventas", capability?.can_sell],
            ["can_produce", "Realiza producción", capability?.can_produce],
            ["can_hold_inventory", "Mantiene inventario", capability?.can_hold_inventory],
            ["can_schedule_staff", "Programa personal", capability?.can_schedule_staff],
            ["is_commercial_business", "Es negocio comercial", capability?.is_commercial_business],
            ["show_in_product_setup", "Aparece en configuración de productos", capability?.show_in_product_setup],
          ].map(([name, label, value]) => (
            <label key={String(name)} className="flex items-center gap-3 rounded-xl border border-[var(--ui-border)] px-4 py-3 text-sm">
              <input type="checkbox" name={String(name)} defaultChecked={Boolean(value)} />
              <span>{String(label)}</span>
            </label>
          ))}
        </div>

        <div className="flex justify-end">
          <button type="submit" className="ui-btn ui-btn--brand">Guardar operación</button>
        </div>
      </form>
    </section>
  );
}
