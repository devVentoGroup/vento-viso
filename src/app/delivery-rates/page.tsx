import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/vento/standard/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/vento/standard/table";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type SatelliteRow = {
  site_id: string;
  name: string | null;
  is_active: boolean | null;
};

type SiteRow = {
  id: string;
  name: string | null;
  code: string | null;
};

type RateRow = {
  id: string;
  site_id: string;
  distance_km: number;
  eta_minutes: number | null;
  customer_fee_amount: number | string;
  sort_order: number | null;
  is_active: boolean | null;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function asBool(value: FormDataEntryValue | null) {
  return value === "on" || value === "true";
}

function asPositiveInteger(value: FormDataEntryValue | null, fallback = 1) {
  const parsed = Number(asText(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.round(parsed));
}

function asNonNegativeNumber(value: FormDataEntryValue | null) {
  const parsed = Number(asText(value));
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}

function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function formatCop(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(parsed) ? parsed : 0);
}

function siteName(row: SatelliteRow, sitesById: Map<string, SiteRow>) {
  const site = sitesById.get(row.site_id) ?? null;
  return row.name ?? site?.name ?? site?.code ?? "Satélite";
}

async function saveDeliveryRate(formData: FormData) {
  "use server";
  const supabase = createAdminClient();
  const id = asText(formData.get("id"));
  const siteId = asText(formData.get("site_id"));
  const distanceKm = asPositiveInteger(formData.get("distance_km"));

  if (!siteId) {
    redirect("/delivery-rates?error=" + encodeURIComponent("Selecciona un satélite."));
  }

  const payload = {
    site_id: siteId,
    distance_km: distanceKm,
    eta_minutes: asPositiveInteger(formData.get("eta_minutes"), 20),
    customer_fee_amount: asNonNegativeNumber(formData.get("customer_fee_amount")),
    sort_order: asPositiveInteger(formData.get("sort_order"), distanceKm),
    is_active: asBool(formData.get("is_active")),
  };

  const query = id
    ? supabase.schema("pass").from("delivery_distance_rates").update(payload).eq("id", id)
    : supabase.schema("pass").from("delivery_distance_rates").upsert(payload, {
        onConflict: "site_id,distance_km",
      });

  const { error } = await query;
  if (error) {
    redirect("/delivery-rates?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/delivery-rates");
  redirect("/delivery-rates?ok=" + encodeURIComponent("Tarifa guardada."));
}

async function deleteDeliveryRate(formData: FormData) {
  "use server";
  const supabase = createAdminClient();
  const id = asText(formData.get("id"));
  if (!id) {
    redirect("/delivery-rates?error=" + encodeURIComponent("Tarifa inválida."));
  }

  const { error } = await supabase.schema("pass").from("delivery_distance_rates").delete().eq("id", id);
  if (error) {
    redirect("/delivery-rates?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/delivery-rates");
  redirect("/delivery-rates?ok=" + encodeURIComponent("Tarifa eliminada."));
}

export default async function DeliveryRatesPage({
  searchParams,
}: {
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const okMsg = safeDecode(sp.ok);
  const errorMsg = safeDecode(sp.error);

  await requireAppAccess({
    appId: "viso",
    returnTo: "/delivery-rates",
  });

  const supabase = createAdminClient();
  const [{ data: satellitesRaw, error: satellitesError }, { data: ratesRaw, error: ratesError }] = await Promise.all([
    supabase
      .schema("pass")
      .from("pass_satellites")
      .select("site_id,name,is_active")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .schema("pass")
      .from("delivery_distance_rates")
      .select("id,site_id,distance_km,eta_minutes,customer_fee_amount,sort_order,is_active")
      .order("site_id", { ascending: true })
      .order("distance_km", { ascending: true }),
  ]);

  const satellites = (satellitesRaw ?? []) as SatelliteRow[];
  const siteIds = satellites.map((satellite) => satellite.site_id).filter(Boolean);
  const { data: sitesRaw, error: sitesError } = siteIds.length
    ? await supabase.from("sites").select("id,name,code").in("id", siteIds)
    : { data: [], error: null };
  const rates = (ratesRaw ?? []) as RateRow[];
  const sitesById = new Map(((sitesRaw ?? []) as SiteRow[]).map((site) => [site.id, site]));
  const effectiveError = errorMsg || satellitesError?.message || ratesError?.message || sitesError?.message || "";

  const ratesBySite = new Map<string, RateRow[]>();
  for (const rate of rates) {
    if (!ratesBySite.has(rate.site_id)) ratesBySite.set(rate.site_id, []);
    ratesBySite.get(rate.site_id)!.push(rate);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tarifas de domicilio"
        subtitle="Configura rangos por satélite. La app calcula la distancia desde el satélite de compra hasta el domicilio y cobra el primer rango que cubra esa distancia."
      />

      {effectiveError ? <div className="ui-alert ui-alert--error">{effectiveError}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}

      {satellites.length === 0 ? (
        <div className="ui-panel">
          <div className="ui-empty">No hay satélites activos para configurar.</div>
        </div>
      ) : (
        <div className="space-y-8">
          {satellites.map((satellite) => {
            const siteRates = (ratesBySite.get(satellite.site_id) ?? []).sort((a, b) => a.distance_km - b.distance_km);
            const nextDistance = Math.max(1, ...siteRates.map((rate) => rate.distance_km + 1));

            return (
              <div key={satellite.site_id} className="ui-panel space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-[var(--ui-text)]">{siteName(satellite, sitesById)}</h2>
                    <p className="ui-caption">Cobertura configurada hasta {siteRates.at(-1)?.distance_km ?? 0} km.</p>
                  </div>
                </div>

                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Rango</TableHeaderCell>
                      <TableHeaderCell>Tiempo</TableHeaderCell>
                      <TableHeaderCell>Costo</TableHeaderCell>
                      <TableHeaderCell>Estado</TableHeaderCell>
                      <TableHeaderCell></TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {siteRates.map((rate, index) => {
                      const fromKm = index === 0 ? 0 : siteRates[index - 1].distance_km;
                      return (
                        <TableRow key={rate.id}>
                          <TableCell>
                            <form id={`rate-${rate.id}`} action={saveDeliveryRate} className="flex flex-wrap items-center gap-2">
                              <input type="hidden" name="id" value={rate.id} />
                              <input type="hidden" name="site_id" value={rate.site_id} />
                              <input type="hidden" name="sort_order" value={rate.sort_order ?? rate.distance_km} />
                              <span className="text-sm text-[var(--ui-muted)]">Más de {fromKm} km hasta</span>
                              <input
                                name="distance_km"
                                type="number"
                                min={1}
                                className="ui-input h-10 w-24"
                                defaultValue={rate.distance_km}
                              />
                              <span className="text-sm text-[var(--ui-muted)]">km</span>
                            </form>
                          </TableCell>
                          <TableCell>
                            <input
                              form={`rate-${rate.id}`}
                              name="eta_minutes"
                              type="number"
                              min={1}
                              className="ui-input h-10 w-24"
                              defaultValue={rate.eta_minutes ?? 20}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <input
                                form={`rate-${rate.id}`}
                                name="customer_fee_amount"
                                type="number"
                                min={0}
                                step={100}
                                className="ui-input h-10 w-32"
                                defaultValue={Number(rate.customer_fee_amount)}
                              />
                              <span className="ui-caption">{formatCop(rate.customer_fee_amount)}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <label className="flex items-center gap-2 text-sm">
                              <input form={`rate-${rate.id}`} type="checkbox" name="is_active" defaultChecked={rate.is_active !== false} />
                              Activa
                            </label>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <button form={`rate-${rate.id}`} type="submit" className="ui-btn ui-btn--ghost ui-btn--sm">
                                Guardar
                              </button>
                              <form action={deleteDeliveryRate}>
                                <input type="hidden" name="id" value={rate.id} />
                                <button type="submit" className="ui-btn ui-btn--danger ui-btn--sm">
                                  Eliminar
                                </button>
                              </form>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow>
                      <TableCell>
                        <form id={`new-rate-${satellite.site_id}`} action={saveDeliveryRate} className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="site_id" value={satellite.site_id} />
                          <input type="hidden" name="is_active" value="on" />
                          <input type="hidden" name="sort_order" value={nextDistance} />
                          <span className="text-sm text-[var(--ui-muted)]">Nuevo hasta</span>
                          <input name="distance_km" type="number" min={1} className="ui-input h-10 w-24" defaultValue={nextDistance} />
                          <span className="text-sm text-[var(--ui-muted)]">km</span>
                        </form>
                      </TableCell>
                      <TableCell>
                        <input form={`new-rate-${satellite.site_id}`} name="eta_minutes" type="number" min={1} className="ui-input h-10 w-24" defaultValue={30} />
                      </TableCell>
                      <TableCell>
                        <input form={`new-rate-${satellite.site_id}`} name="customer_fee_amount" type="number" min={0} step={100} className="ui-input h-10 w-32" defaultValue={0} />
                      </TableCell>
                      <TableCell>
                        <span className="ui-chip ui-chip--success">Nueva</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <button form={`new-rate-${satellite.site_id}`} type="submit" className="ui-btn ui-btn--brand ui-btn--sm">
                          Agregar rango
                        </button>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
