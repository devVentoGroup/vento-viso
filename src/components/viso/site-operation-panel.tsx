import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { SiteOperationFormClient, type SiteCapabilityState } from "@/components/viso/site-operation-form-client";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

type OperationModel = "single_loc" | "multi_area" | "multi_loc";
type Visibility = "operational" | "test" | "app_review" | "hidden";

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

  if (!primary && activeLocations.length > 0) messages.push("Selecciona cuál LOC representa la operación principal de esta sede.");
  if (capability?.operation_model === "single_loc" && activeLocations.length > 1) {
    messages.push("Elegiste una sola ubicación principal, pero hay varios LOCs activos. Revisa cuál debería quedar como principal.");
  }
  if (capability?.can_produce && !activeLocations.some((location) => location.location_type === "production")) {
    messages.push("Marcaste que esta sede produce, pero todavía no existe un LOC activo de producción.");
  }
  if ((capability?.can_hold_inventory || capability?.can_receive_remissions || capability?.can_sell) && activeLocations.length === 0) {
    messages.push("Esta sede usa inventario, pero todavía no tiene LOCs activos.");
  }

  return messages;
}

async function updateSiteOperation(formData: FormData) {
  "use server";

  const siteId = text(formData.get("site_id"));
  const visibilityRaw = text(formData.get("operational_visibility"));
  const visibility = (["operational", "app_review", "test", "hidden"] as string[]).includes(visibilityRaw)
    ? (visibilityRaw as Visibility)
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
      redirect(`${siteHref(siteId)}?error=${encodeURIComponent("La ubicación principal debe estar activa y pertenecer a esta sede.")}`);
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
  const initialCapabilities: SiteCapabilityState = {
    can_request_remissions: Boolean(capability?.can_request_remissions),
    can_fulfill_remissions: Boolean(capability?.can_fulfill_remissions),
    can_receive_remissions: Boolean(capability?.can_receive_remissions),
    can_schedule_staff: Boolean(capability?.can_schedule_staff),
    can_sell: Boolean(capability?.can_sell),
    can_produce: Boolean(capability?.can_produce),
    can_hold_inventory: Boolean(capability?.can_hold_inventory),
    is_commercial_business: Boolean(capability?.is_commercial_business),
    show_in_product_setup: Boolean(capability?.show_in_product_setup),
  };

  return (
    <section className="ui-panel space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="ui-caption">Configuración guiada</div>
          <h2 className="ui-h2 mt-1">¿Cómo funciona esta sede?</h2>
          <p className="ui-body-muted mt-1">Responde cuatro preguntas sencillas. El sistema usará las respuestas para organizar remisiones, inventario, producción, ventas y personal.</p>
        </div>
        {alerts.length ? <span className="ui-chip ui-chip--warning">Requiere atención</span> : <span className="ui-chip ui-chip--success">Todo en orden</span>}
      </div>

      {alerts.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="font-semibold">Antes de continuar, revisa esto:</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">{alerts.map((alert) => <li key={alert}>{alert}</li>)}</ul>
        </div>
      ) : null}

      <SiteOperationFormClient
        siteId={siteId}
        action={updateSiteOperation}
        initialVisibility={(siteRes.data?.operational_visibility ?? "operational") as Visibility}
        initialModel={capability?.operation_model ?? "multi_area"}
        initialPrimaryLocationId={capability?.primary_operational_location_id ?? ""}
        initialCapabilities={initialCapabilities}
        locations={activeLocations}
      />
    </section>
  );
}
