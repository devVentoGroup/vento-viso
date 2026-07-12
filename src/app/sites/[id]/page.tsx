import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { SiteStructureCreateForms } from "@/components/viso/site-structure-create-forms";
import { PageHeader } from "@/components/vento/standard/page-header";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const baseHref = (siteId: string) => `/sites/${siteId}`;
const text = (value: FormDataEntryValue | null) => (typeof value === "string" ? value.trim() : "");
const code = (value: string) => value.toUpperCase().replace(/[^A-Z0-9-]+/g, "-").replace(/^-+|-+$/g, "");

async function guard(siteId: string) {
  await requireAppAccess({ appId: "viso", returnTo: baseHref(siteId), permissionCode: "staff.permissions.manage" });
  return createAdminClient();
}

async function createArea(formData: FormData) {
  "use server";
  const siteId = text(formData.get("site_id"));
  const name = text(formData.get("name"));
  const kind = text(formData.get("kind"));
  const areaCode = code(text(formData.get("code")));
  if (!siteId || !name || !kind || !areaCode) redirect(`${baseHref(siteId)}?error=${encodeURIComponent("Nombre, tipo y código son obligatorios.")}`);
  const supabase = await guard(siteId);
  const { error } = await supabase.from("areas").insert({ site_id: siteId, name, kind, code: areaCode, is_active: true });
  if (error) redirect(`${baseHref(siteId)}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(baseHref(siteId));
  redirect(`${baseHref(siteId)}?ok=${encodeURIComponent("Área creada.")}`);
}

async function updateArea(formData: FormData) {
  "use server";
  const siteId = text(formData.get("site_id"));
  const areaId = text(formData.get("area_id"));
  const name = text(formData.get("name"));
  const kind = text(formData.get("kind"));
  const areaCode = code(text(formData.get("code")));
  const isActive = formData.get("is_active") === "on";
  const supabase = await guard(siteId);
  const { error } = await supabase.from("areas").update({ name, kind, code: areaCode, is_active: isActive }).eq("id", areaId).eq("site_id", siteId);
  if (error) redirect(`${baseHref(siteId)}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(baseHref(siteId));
  redirect(`${baseHref(siteId)}?ok=${encodeURIComponent("Área actualizada.")}`);
}

async function createLocation(formData: FormData) {
  "use server";
  const siteId = text(formData.get("site_id"));
  const areaId = text(formData.get("area_id"));
  const locationCode = code(text(formData.get("code")));
  const description = text(formData.get("description"));
  const locationType = text(formData.get("location_type")) || "storage";
  const zone = code(text(formData.get("zone")));
  const aisle = code(text(formData.get("aisle")));
  const level = code(text(formData.get("level")));
  const supabase = await guard(siteId);
  const { data: area } = await supabase.from("areas").select("id").eq("id", areaId).eq("site_id", siteId).maybeSingle();
  if (!area) redirect(`${baseHref(siteId)}?error=${encodeURIComponent("El área no pertenece a la sede.")}`);
  const { error } = await supabase.from("inventory_locations").insert({ site_id: siteId, area_id: areaId, code: locationCode, description, location_type: locationType, zone: zone || null, aisle: aisle || null, level: level || null, is_active: true });
  if (error) redirect(`${baseHref(siteId)}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(baseHref(siteId));
  redirect(`${baseHref(siteId)}?ok=${encodeURIComponent("LOC creado.")}`);
}

async function updateLocation(formData: FormData) {
  "use server";
  const siteId = text(formData.get("site_id"));
  const locationId = text(formData.get("location_id"));
  const areaId = text(formData.get("area_id"));
  const supabase = await guard(siteId);
  const { data: area } = await supabase.from("areas").select("id").eq("id", areaId).eq("site_id", siteId).maybeSingle();
  if (!area) redirect(`${baseHref(siteId)}?error=${encodeURIComponent("El área no pertenece a la sede.")}`);
  const { error } = await supabase.from("inventory_locations").update({
    area_id: areaId,
    code: code(text(formData.get("code"))),
    description: text(formData.get("description")),
    location_type: text(formData.get("location_type")) || "storage",
    zone: code(text(formData.get("zone"))) || null,
    aisle: code(text(formData.get("aisle"))) || null,
    level: code(text(formData.get("level"))) || null,
    is_active: formData.get("is_active") === "on",
  }).eq("id", locationId).eq("site_id", siteId);
  if (error) redirect(`${baseHref(siteId)}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(baseHref(siteId));
  redirect(`${baseHref(siteId)}?ok=${encodeURIComponent("LOC actualizado.")}`);
}

function decode(value: string | undefined) {
  try { return value ? decodeURIComponent(value) : ""; } catch { return value ?? ""; }
}

export default async function SitePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const { supabase } = await requireAppAccess({ appId: "viso", returnTo: baseHref(id), permissionCode: "staff.permissions.manage" });
  const [siteRes, areasRes, locationsRes] = await Promise.all([
    supabase.from("sites").select("id,code,name,site_type,is_active").eq("id", id).maybeSingle(),
    supabase.from("areas").select("id,site_id,code,name,kind,is_active").eq("site_id", id).order("name"),
    supabase.from("inventory_locations").select("id,site_id,area_id,code,zone,aisle,level,description,location_type,is_active").eq("site_id", id).order("code"),
  ]);
  if (!siteRes.data) notFound();
  const site = siteRes.data;
  const areas = areasRes.data ?? [];
  const locations = locationsRes.data ?? [];
  const locationsByArea = new Map<string, typeof locations>();
  for (const location of locations) {
    const key = location.area_id ?? "unassigned";
    locationsByArea.set(key, [...(locationsByArea.get(key) ?? []), location]);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={site.name ?? "Sede"}
        subtitle={`${site.code ?? "SIN-CÓDIGO"} · Administración maestra de áreas funcionales y LOCs.`}
        actions={<><Link href="/sites" className="ui-btn ui-btn--ghost">Volver a sedes</Link><Link href={`/sites/${id}/documentos`} className="ui-btn ui-btn--ghost">Documentos</Link><Link href={`/operations-map?site=${id}`} className="ui-btn ui-btn--ghost">Mapa operativo</Link></>}
      />

      {sp.error ? <div className="ui-alert ui-alert--error">{decode(sp.error)}</div> : null}
      {sp.ok ? <div className="ui-alert ui-alert--success">{decode(sp.ok)}</div> : null}

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="ui-panel"><div className="ui-caption">Estado</div><div className="mt-2 ui-h3">{site.is_active ? "Activa" : "Inactiva"}</div></div>
        <div className="ui-panel"><div className="ui-caption">Áreas funcionales</div><div className="mt-2 ui-h3">{areas.length}</div></div>
        <div className="ui-panel"><div className="ui-caption">LOCs físicos</div><div className="mt-2 ui-h3">{locations.length}</div></div>
      </section>

      <SiteStructureCreateForms siteId={id} siteCode={site.code ?? "SITE"} areas={areas.filter((area) => area.is_active)} createAreaAction={createArea} createLocationAction={createLocation} />

      <section className="space-y-4">
        <div><h2 className="ui-h2">Estructura actual</h2><p className="ui-body-muted mt-1">Sede → área funcional → LOC físico.</p></div>
        {areas.map((area) => {
          const areaLocations = locationsByArea.get(area.id) ?? [];
          return (
            <article key={area.id} className="ui-panel space-y-4">
              <form action={updateArea} className="grid gap-3 lg:grid-cols-[1.4fr_.8fr_.7fr_auto] lg:items-end">
                <input type="hidden" name="site_id" value={id} /><input type="hidden" name="area_id" value={area.id} />
                <label className="grid gap-1"><span className="ui-label">Área</span><input name="name" defaultValue={area.name ?? ""} className="ui-input" required /></label>
                <label className="grid gap-1"><span className="ui-label">Tipo</span><input name="kind" defaultValue={area.kind ?? ""} className="ui-input" required /></label>
                <label className="grid gap-1"><span className="ui-label">Código</span><input name="code" defaultValue={area.code ?? ""} className="ui-input font-mono" required /></label>
                <div className="flex items-center gap-3"><label className="flex items-center gap-2 text-sm"><input name="is_active" type="checkbox" defaultChecked={area.is_active ?? false} />Activa</label><button className="ui-btn ui-btn--ghost ui-btn--sm">Guardar</button></div>
              </form>

              <div className="space-y-3 border-t border-[var(--ui-border)] pt-4">
                {areaLocations.length === 0 ? <div className="ui-empty">Esta área todavía no tiene LOCs.</div> : areaLocations.map((location) => (
                  <form key={location.id} action={updateLocation} className="grid gap-3 rounded-xl border border-[var(--ui-border)] p-4 xl:grid-cols-[1.2fr_1fr_.8fr_.7fr_.7fr_.6fr_auto] xl:items-end">
                    <input type="hidden" name="site_id" value={id} /><input type="hidden" name="location_id" value={location.id} /><input type="hidden" name="area_id" value={area.id} />
                    <label className="grid gap-1"><span className="ui-label">Nombre LOC</span><input name="description" defaultValue={location.description ?? ""} className="ui-input" /></label>
                    <label className="grid gap-1"><span className="ui-label">Código</span><input name="code" defaultValue={location.code ?? ""} className="ui-input font-mono" required /></label>
                    <label className="grid gap-1"><span className="ui-label">Tipo</span><input name="location_type" defaultValue={location.location_type ?? "storage"} className="ui-input" /></label>
                    <label className="grid gap-1"><span className="ui-label">Zona</span><input name="zone" defaultValue={location.zone ?? ""} className="ui-input font-mono" /></label>
                    <label className="grid gap-1"><span className="ui-label">Pasillo</span><input name="aisle" defaultValue={location.aisle ?? ""} className="ui-input font-mono" /></label>
                    <label className="grid gap-1"><span className="ui-label">Nivel</span><input name="level" defaultValue={location.level ?? ""} className="ui-input font-mono" /></label>
                    <div className="flex items-center gap-3"><label className="flex items-center gap-2 text-sm"><input name="is_active" type="checkbox" defaultChecked={location.is_active ?? false} />Activo</label><button className="ui-btn ui-btn--ghost ui-btn--sm">Guardar</button></div>
                  </form>
                ))}
              </div>
            </article>
          );
        })}
        {areas.length === 0 ? <div className="ui-panel ui-empty">La sede no tiene áreas. Crea la primera arriba.</div> : null}
      </section>
    </div>
  );
}
