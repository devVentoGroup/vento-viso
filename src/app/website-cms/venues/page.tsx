import Link from "next/link";

import { PageHeader } from "@/components/vento/standard/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/vento/standard/table";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRestaurantPageSlugCandidates, safeDecode } from "@/lib/website-cms";

export const dynamic = "force-dynamic";

type RestaurantRow = {
  id: string;
  slug: string;
  title: string;
  location: string | null;
  sort_order: number;
  is_published: boolean;
};

type BlockRow = {
  page_slug: string;
  block_key: string;
};

export default async function WebsiteCmsVenuesPage({
  searchParams,
}: {
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const okMsg = sp.ok ? safeDecode(sp.ok) : "";
  const errorMsg = sp.error ? safeDecode(sp.error) : "";

  await requireAppAccess({
    appId: "viso",
    returnTo: "/website-cms/venues",
  });

  const supabase = createAdminClient();

  const [{ data: restaurantsData, error: restaurantsError }, { data: blocksData, error: blocksError }] =
    await Promise.all([
      supabase
        .from("website_items")
        .select("id,slug,title,location,sort_order,is_published")
        .eq("category", "restaurant")
        .order("sort_order", { ascending: true })
        .order("title", { ascending: true }),
      supabase
        .from("website_blocks")
        .select("page_slug,block_key")
        .or("page_slug.like.restaurant:%,page_slug.like.restaurant_%,page_slug.like.restaurante:%"),
    ]);

  const restaurants = (restaurantsData ?? []) as RestaurantRow[];
  const blocks = (blocksData ?? []) as BlockRow[];
  const effectiveError = errorMsg || restaurantsError?.message || blocksError?.message || "";

  const detailCountBySlug = new Map<string, number>();
  for (const restaurant of restaurants) {
    const pageSlugs = getRestaurantPageSlugCandidates(restaurant.slug);
    const count = blocks.filter((block) => pageSlugs.includes(block.page_slug)).length;
    detailCountBySlug.set(restaurant.slug, count);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Venue Detail CMS"
        subtitle="Editor especializado para detalle web de restaurantes (hero, gallery y features)."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/website-cms/items/new" className="ui-btn ui-btn--brand">
              Crear restaurante
            </Link>
            <Link href="/website-cms" className="ui-btn ui-btn--ghost">
              Volver a CMS
            </Link>
          </div>
        }
      />

      {effectiveError ? <div className="ui-alert ui-alert--error">{effectiveError}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}

      <div className="ui-panel">
        {restaurants.length === 0 ? (
          <div className="ui-empty">
            No hay restaurantes en `website_items`. Crea uno en Website CMS para habilitar su detalle.
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Venue</TableHeaderCell>
                <TableHeaderCell>Ubicación</TableHeaderCell>
                <TableHeaderCell>Detalle web</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {restaurants.map((row) => {
                const detailCount = detailCountBySlug.get(row.slug) ?? 0;
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-semibold">{row.title}</div>
                      <div className="ui-caption">/{row.slug}</div>
                    </TableCell>
                    <TableCell>{row.location ?? "Por definir"}</TableCell>
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
                          Perfil
                        </Link>
                        <Link
                          href={`/website-cms/venues/${encodeURIComponent(row.slug)}`}
                          className="ui-btn ui-btn--brand ui-btn--sm"
                        >
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
