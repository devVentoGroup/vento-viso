import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/vento/standard/page-header";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type CatalogItemRow = {
  id: string;
  name: string;
  site_id: string;
  is_active: boolean | null;
  metadata: Record<string, unknown> | null;
};

type SiteRow = {
  id: string;
  name: string | null;
  code: string | null;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function asLeadHours(metadata: Record<string, unknown> | null) {
  const minutes = Number(metadata?.minimum_lead_minutes ?? 0);
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  return String(minutes / 60);
}

function availabilityMode(metadata: Record<string, unknown> | null) {
  return metadata?.availability_mode === "made_to_order" ? "made_to_order" : "immediate";
}

async function saveAvailability(formData: FormData) {
  "use server";

  const id = asText(formData.get("id"));
  const requestedMode = asText(formData.get("availability_mode"));
  const mode = requestedMode === "made_to_order" ? "made_to_order" : "immediate";
  const rawLeadHours = Number(asText(formData.get("minimum_lead_hours")) || "0");
  const minimumLeadMinutes = mode === "made_to_order" ? Math.round(rawLeadHours * 60) : 0;

  if (!id) {
    redirect(`/commercial-availability?error=${encodeURIComponent("Producto inválido.")}`);
  }

  if (mode === "made_to_order" && (!Number.isFinite(rawLeadHours) || rawLeadHours <= 0)) {
    redirect(
      `/commercial-availability?error=${encodeURIComponent("Un producto por encargo debe tener una anticipación mayor a 0 horas.")}`,
    );
  }

  const supabase = createAdminClient();
  const { data: item, error: itemError } = await supabase
    .schema("pass")
    .from("catalog_items")
    .select("id,metadata")
    .eq("id", id)
    .maybeSingle();

  if (itemError || !item) {
    redirect(
      `/commercial-availability?error=${encodeURIComponent(itemError?.message || "El producto no existe.")}`,
    );
  }

  const currentMetadata =
    item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
      ? (item.metadata as Record<string, unknown>)
      : {};

  const metadata = {
    ...currentMetadata,
    availability_mode: mode,
    scheduling_required: mode === "made_to_order",
    minimum_lead_minutes: minimumLeadMinutes,
  };

  const { error } = await supabase
    .schema("pass")
    .from("catalog_items")
    .update({ metadata })
    .eq("id", id);

  if (error) {
    redirect(`/commercial-availability?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/commercial-availability");
  revalidatePath("/commercial-menu");
  redirect(`/commercial-availability?ok=${encodeURIComponent("Disponibilidad actualizada.")}`);
}

export default async function CommercialAvailabilityPage({
  searchParams,
}: {
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  const query = (await searchParams) ?? {};
  const okMessage = safeDecode(query.ok);
  const errorMessage = safeDecode(query.error);

  await requireAppAccess({ appId: "viso", returnTo: "/commercial-availability" });

  const supabase = createAdminClient();
  const [
    { data: itemsRaw, error: itemsError },
    { data: sitesRaw, error: sitesError },
  ] = await Promise.all([
    supabase
      .schema("pass")
      .from("catalog_items")
      .select("id,name,site_id,is_active,metadata")
      .eq("metadata->>source_app", "viso")
      .eq("metadata->>source_module", "menu_comercial")
      .order("name", { ascending: true }),
    supabase.from("sites").select("id,name,code").order("name", { ascending: true }),
  ]);

  const items = (itemsRaw ?? []) as CatalogItemRow[];
  const sites = (sitesRaw ?? []) as SiteRow[];
  const sitesById = new Map(sites.map((site) => [site.id, site]));
  const loadError = itemsError?.message || sitesError?.message || "";
  const madeToOrderCount = items.filter(
    (item) => availabilityMode(item.metadata) === "made_to_order",
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Disponibilidad y anticipación"
        subtitle="Define qué productos pueden pedirse inmediatamente y cuáles requieren preparación anticipada."
        actions={
          <Link href="/commercial-menu" className="ui-btn ui-btn--ghost">
            Volver al menú comercial
          </Link>
        }
      />

      {loadError ? <div className="ui-alert ui-alert--error">{loadError}</div> : null}
      {errorMessage ? <div className="ui-alert ui-alert--error">{errorMessage}</div> : null}
      {okMessage ? <div className="ui-alert ui-alert--success">{okMessage}</div> : null}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="ui-card">
          <div className="ui-caption">Productos configurables</div>
          <div className="mt-2 text-3xl font-black text-[var(--ui-text)]">{items.length}</div>
        </div>
        <div className="ui-card">
          <div className="ui-caption">Disponibles inmediatamente</div>
          <div className="mt-2 text-3xl font-black text-[var(--ui-text)]">
            {items.length - madeToOrderCount}
          </div>
        </div>
        <div className="ui-card">
          <div className="ui-caption">Productos por encargo</div>
          <div className="mt-2 text-3xl font-black text-[var(--ui-text)]">{madeToOrderCount}</div>
        </div>
      </section>

      <section className="ui-panel space-y-4">
        <div>
          <div className="ui-h3">Reglas por producto</div>
          <p className="ui-caption">
            La anticipación se calcula por horas corridas. Pass aplicará posteriormente la mayor regla del carrito.
          </p>
        </div>

        {items.length === 0 ? (
          <div className="ui-empty">No hay productos comerciales creados desde VISO.</div>
        ) : (
          <div className="grid gap-3">
            {items.map((item) => {
              const site = sitesById.get(item.site_id);
              const mode = availabilityMode(item.metadata);

              return (
                <form
                  key={item.id}
                  action={saveAvailability}
                  className="grid gap-4 rounded-2xl border border-[var(--ui-border)] bg-white p-4 lg:grid-cols-[minmax(0,1fr)_240px_220px_auto] lg:items-end"
                >
                  <input type="hidden" name="id" value={item.id} />

                  <div>
                    <div className="text-base font-black text-[var(--ui-text)]">{item.name}</div>
                    <div className="ui-caption mt-1">
                      {site?.name ?? site?.code ?? "Sede sin nombre"}
                      {item.is_active === false ? " · Oculto" : " · Activo"}
                    </div>
                  </div>

                  <label className="space-y-2">
                    <span className="ui-label">Disponibilidad</span>
                    <select name="availability_mode" className="ui-input" defaultValue={mode}>
                      <option value="immediate">Disponible inmediatamente</option>
                      <option value="made_to_order">Producto por encargo</option>
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="ui-label">Anticipación mínima</span>
                    <div className="flex overflow-hidden rounded-xl border border-[var(--ui-border)] bg-white">
                      <input
                        name="minimum_lead_hours"
                        type="number"
                        min="0"
                        step="0.5"
                        defaultValue={asLeadHours(item.metadata)}
                        className="min-h-12 min-w-0 flex-1 px-3 outline-none"
                        placeholder={mode === "made_to_order" ? "24" : "0"}
                      />
                      <div className="flex items-center border-l border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 text-sm font-bold text-[var(--ui-muted)]">
                        horas
                      </div>
                    </div>
                  </label>

                  <button type="submit" className="ui-btn ui-btn--brand">
                    Guardar regla
                  </button>
                </form>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
