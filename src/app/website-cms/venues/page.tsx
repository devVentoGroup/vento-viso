import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { PageHeader } from "@/components/vento/standard/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/vento/standard/table";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRestaurantPageSlugCandidates, normalizeSlug, safeDecode } from "@/lib/website-cms";

export const dynamic = "force-dynamic";

type RestaurantRow = { id: string; slug: string; title: string; excerpt: string | null; image_url: string | null; location: string | null; sort_order: number; is_published: boolean; };
type BlockRow = { page_slug: string; block_key: string; };
type SatelliteRow = { id: string; name: string | null; subtitle: string | null; logo_url: string | null; address_override: string | null; sort_order: number | null; is_active: boolean | null; site_id: string | null; };
type SiteAddressRow = { id: string; address: string | null; };

function completeness(row: RestaurantRow): "complete" | "partial" | "empty" {
  const h = Boolean(row.image_url), e = Boolean(row.excerpt);
  if (h && e) return "complete";
  if (h || e) return "partial";
  return "empty";
}

async function importBusinesses() {
  "use server";
  await requireAppAccess({ appId: "viso", returnTo: "/website-cms/venues" });
  const supabase = createAdminClient();

  const { data: satellites, error: satError } = await supabase
    .schema("pass").from("pass_satellites")
    .select("id,name,subtitle,logo_url,address_override,sort_order,is_active,site_id")
    .eq("is_active", true);

  if (satError) redirect("/website-cms/venues?error=" + encodeURIComponent(satError.message));
  if (!satellites?.length) redirect("/website-cms/venues?ok=" + encodeURIComponent("No hay negocios activos para importar."));

  const siteIds = (satellites as SatelliteRow[]).map((s) => s.site_id).filter(Boolean) as string[];
  const { data: sitesData } = siteIds.length
    ? await supabase.from("sites").select("id,address").in("id", siteIds)
    : { data: [] as SiteAddressRow[] };
  const siteAddressById = new Map(((sitesData ?? []) as SiteAddressRow[]).map((s) => [s.id, s.address]));

  const { data: existingItems } = await supabase.from("website_items").select("slug").eq("category", "restaurant");
  const existingSlugs = new Set((existingItems ?? []).map((i: { slug: string }) => i.slug));

  const toInsert = (satellites as SatelliteRow[]).map((s) => {
    const slug = normalizeSlug(s.name ?? "");
    if (!slug || existingSlugs.has(slug)) return null;
    const address = s.address_override || (s.site_id ? (siteAddressById.get(s.site_id) ?? null) : null);
    return { category: "restaurant" as const, slug, title: s.name ?? slug, excerpt: s.subtitle ?? null, location: address, image_url: s.logo_url ?? null, sort_order: s.sort_order ?? 0, is_published: true, action_label: "Ver restaurante", action_url: null };
  }).filter(Boolean);

  if (!toInsert.length) redirect("/website-cms/venues?ok=" + encodeURIComponent("Todos los negocios ya estaban importados."));

  const { error: insertError } = await supabase.from("website_items").insert(toInsert);
  if (insertError) redirect("/website-cms/venues?error=" + encodeURIComponent(insertError.message));

  revalidatePath("/website-cms");
  revalidatePath("/website-cms/venues");
  redirect("/website-cms/venues?ok=" + encodeURIComponent(`${toInsert.length} restaurante(s) importado(s). Ahora completa la foto y horario de cada uno.`));
}

export default async function WebsiteCmsVenuesPage({ searchParams }: { searchParams?: Promise<{ ok?: string; error?: string }> }) {
  const sp = (await searchParams) ?? {};
  const okMsg = sp.ok ? safeDecode(sp.ok) : "";
  const errorMsg = sp.error ? safeDecode(sp.error) : "";

  await requireAppAccess({ appId: "viso", returnTo: "/website-cms/venues" });
  const supabase = createAdminClient();

  const [
    { data: restaurantsData, error: restaurantsError },
    { data: blocksData, error: blocksError },
    { data: satellitesData },
  ] = await Promise.all([
    supabase.from("website_items").select("id,slug,title,excerpt,image_url,location,sort_order,is_published").eq("category", "restaurant").order("sort_order", { ascending: true }).order("title", { ascending: true }),
    supabase.from("website_blocks").select("page_slug,block_key").or("page_slug.like.restaurant:%,page_slug.like.restaurant_%,page_slug.like.restaurante:%"),
    supabase.schema("pass").from("pass_satellites").select("name").eq("is_active", true),
  ]);

  const restaurants = (restaurantsData ?? []) as RestaurantRow[];
  const blocks = (blocksData ?? []) as BlockRow[];
  const effectiveError = errorMsg || restaurantsError?.message || blocksError?.message || "";

  const detailCountBySlug = new Map<string, number>();
  for (const r of restaurants) {
    const pageSlugs = getRestaurantPageSlugCandidates(r.slug);
    detailCountBySlug.set(r.slug, blocks.filter((b) => pageSlugs.includes(b.page_slug)).length);
  }

  const existingSlugs = new Set(restaurants.map((r) => r.slug));
  const unsyncedCount = (satellitesData ?? []).filter((s: { name: string | null }) => {
    const slug = normalizeSlug(s.name ?? "");
    return slug && !existingSlugs.has(slug);
  }).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Restaurantes en el sitio web"
        subtitle="Aqui puedes agregar, editar e importar los restaurantes que aparecen en ventogroup.co/restaurantes"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <form action={importBusinesses}><button type="submit" className="ui-btn ui-btn--brand">Importar negocios existentes</button></form>
            <Link href="/website-cms/items/new" className="ui-btn ui-btn--brand">+ Crear manualmente</Link>
            <Link href="/website-cms" className="ui-btn ui-btn--ghost">Volver a CMS</Link>
          </div>
        }
      />

      {effectiveError ? <div className="ui-alert ui-alert--error">{effectiveError}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}

      {unsyncedCount > 0 && !okMsg && !errorMsg ? (
        <div className="ui-alert ui-alert--warning">
          <strong>{unsyncedCount} negocio(s)</strong> en VISO Negocios no estan en el sitio web aun.
          Haz clic en <strong>Importar negocios existentes</strong> para traerlos con nombre, ubicacion y logo.
          Despues completa la foto y el horario de cada uno.
        </div>
      ) : null}

      <div className="flex flex-wrap gap-4 text-xs text-[var(--ui-text-muted,#888)]">
        <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />Completo</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1" />Parcial</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-gray-300 mr-1" />Incompleto</span>
      </div>

      <div className="ui-panel">
        {restaurants.length === 0 ? (
          <div className="ui-empty space-y-2">
            <p>No hay restaurantes en el sitio web todavia.</p>
            <p className="text-sm opacity-70">Usa <strong>Importar desde Negocios</strong> para crearlos automaticamente, o crea uno manualmente.</p>
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Restaurante</TableHeaderCell>
                <TableHeaderCell>Ubicacion</TableHeaderCell>
                <TableHeaderCell>Perfil completo?</TableHeaderCell>
                <TableHeaderCell>Pagina propia</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {restaurants.map((row) => {
                const detailCount = detailCountBySlug.get(row.slug) ?? 0;
                const comp = completeness(row);
                const missing = [!row.image_url && "foto", !row.excerpt && "descripcion"].filter(Boolean).join(" / ");
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-semibold">{row.title}</div>
                      <div className="ui-caption">/restaurantes/{row.slug}</div>
                    </TableCell>
                    <TableCell>{row.location ?? <span className="opacity-40">Por definir</span>}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${comp === "complete" ? "bg-green-500" : comp === "partial" ? "bg-amber-400" : "bg-gray-300"}`} />
                        {comp === "complete"
                          ? <span className="text-xs text-green-600 font-medium">Completo</span>
                          : <span className="text-xs text-[var(--ui-text-muted,#888)]">Sin {missing}</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`ui-chip ${detailCount > 0 ? "ui-chip--success" : ""}`}>
                        {detailCount > 0 ? `${detailCount} bloque(s)` : "Sin bloques"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`ui-chip ${row.is_published ? "ui-chip--success" : ""}`}>
                        {row.is_published ? "Publicado" : "Oculto"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Link href={`/website-cms/items/${row.id}`} className="ui-btn ui-btn--ghost ui-btn--sm">
                          {comp !== "complete" ? "Completar datos" : "Editar"}
                        </Link>
                        <Link href={`/website-cms/venues/${encodeURIComponent(row.slug)}`} className="ui-btn ui-btn--brand ui-btn--sm">
                          Editar detalle
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
