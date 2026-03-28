import Link from "next/link";

import { PageHeader } from "@/components/vento/standard/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/vento/standard/table";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type WebsiteBlockRow = {
  id: string;
  page_slug: string;
  block_key: string;
  block_type: string;
  title: string | null;
  sort_order: number;
  media_type: "image" | "video" | null;
  is_published: boolean;
};

type WebsiteItemRow = {
  id: string;
  category: "restaurant" | "job" | "service" | "event" | "app";
  slug: string;
  title: string;
  location: string | null;
  sort_order: number;
  is_published: boolean;
};

const PAGE_FILTERS = [
  { key: "", label: "Todas" },
  { key: "home", label: "Home" },
  { key: "restaurantes", label: "Restaurantes" },
  { key: "empleos", label: "Empleos" },
  { key: "servicios", label: "Servicios" },
  { key: "eventos", label: "Eventos" },
  { key: "ecosistema", label: "Ecosistema" },
];

const CATEGORY_FILTERS = [
  { key: "", label: "Todas" },
  { key: "restaurant", label: "Restaurantes" },
  { key: "job", label: "Empleos" },
  { key: "service", label: "Servicios" },
  { key: "event", label: "Eventos" },
  { key: "app", label: "Apps" },
];

function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function WebsiteCmsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string; category?: string; ok?: string; error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const pageFilter = (sp.page as string) || "";
  const categoryFilter = (sp.category as string) || "";
  const okMsg = sp.ok ? safeDecode(sp.ok) : "";
  const errorMsg = sp.error ? safeDecode(sp.error) : "";

  await requireAppAccess({
    appId: "viso",
    returnTo: "/website-cms",
  });

  const supabase = createAdminClient();

  let blocksQuery = supabase
    .from("website_blocks")
    .select("id,page_slug,block_key,block_type,title,sort_order,media_type,is_published")
    .order("page_slug", { ascending: true })
    .order("sort_order", { ascending: true });

  if (pageFilter) {
    blocksQuery = blocksQuery.eq("page_slug", pageFilter);
  }

  let itemsQuery = supabase
    .from("website_items")
    .select("id,category,slug,title,location,sort_order,is_published")
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true });

  if (categoryFilter) {
    itemsQuery = itemsQuery.eq("category", categoryFilter);
  }

  const [{ data: blocksData, error: blocksError }, { data: itemsData, error: itemsError }] = await Promise.all([
    blocksQuery,
    itemsQuery,
  ]);

  const blocks = (blocksData ?? []) as WebsiteBlockRow[];
  const items = (itemsData ?? []) as WebsiteItemRow[];
  const effectiveError = errorMsg || blocksError?.message || itemsError?.message || "";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Website CMS"
        subtitle="Administra bloques e informacion del sitio publico ventogroup.co."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/website-cms/venues" className="ui-btn ui-btn--ghost">
              Venue detail
            </Link>
            <Link href="/website-cms/blocks/new" className="ui-btn ui-btn--ghost">
              Crear bloque
            </Link>
            <Link href="/website-cms/items/new" className="ui-btn ui-btn--brand">
              Crear item
            </Link>
          </div>
        }
      />

      {effectiveError ? <div className="ui-alert ui-alert--error">{effectiveError}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}

      <section className="space-y-3">
        <div className="ui-h3">Bloques de pagina</div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="ui-caption">Filtrar por pagina:</span>
          {PAGE_FILTERS.map((item) => (
            <Link
              key={item.label}
              href={item.key ? `/website-cms?page=${encodeURIComponent(item.key)}` : "/website-cms"}
              className={`ui-chip ${pageFilter === item.key ? "ui-chip--brand" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="ui-panel">
          {blocks.length === 0 ? (
            <div className="ui-empty">No hay bloques cargados para este filtro.</div>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Pagina</TableHeaderCell>
                  <TableHeaderCell>Bloque</TableHeaderCell>
                  <TableHeaderCell>Titulo</TableHeaderCell>
                  <TableHeaderCell>Orden</TableHeaderCell>
                  <TableHeaderCell>Estado</TableHeaderCell>
                  <TableHeaderCell></TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {blocks.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.page_slug}</TableCell>
                    <TableCell>
                      <div className="font-semibold">{row.block_key}</div>
                      <div className="ui-caption">{row.block_type}{row.media_type ? ` · ${row.media_type}` : ""}</div>
                    </TableCell>
                    <TableCell>{row.title ?? "Sin titulo"}</TableCell>
                    <TableCell>{row.sort_order}</TableCell>
                    <TableCell>
                      <span className={`ui-chip ${row.is_published ? "ui-chip--success" : ""}`}>
                        {row.is_published ? "Publicado" : "Oculto"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/website-cms/blocks/${row.id}`} className="ui-btn ui-btn--ghost ui-btn--sm">
                        Editar
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="ui-h3">Items de contenido</div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="ui-caption">Filtrar por categoria:</span>
          {CATEGORY_FILTERS.map((item) => (
            <Link
              key={item.label}
              href={item.key ? `/website-cms?category=${encodeURIComponent(item.key)}` : "/website-cms"}
              className={`ui-chip ${categoryFilter === item.key ? "ui-chip--brand" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="ui-panel">
          {items.length === 0 ? (
            <div className="ui-empty">No hay items creados para este filtro.</div>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Categoria</TableHeaderCell>
                  <TableHeaderCell>Item</TableHeaderCell>
                  <TableHeaderCell>Ubicacion / Meta</TableHeaderCell>
                  <TableHeaderCell>Orden</TableHeaderCell>
                  <TableHeaderCell>Estado</TableHeaderCell>
                  <TableHeaderCell></TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.category}</TableCell>
                    <TableCell>
                      <div className="font-semibold">{row.title}</div>
                      <div className="ui-caption">/{row.slug}</div>
                    </TableCell>
                    <TableCell>{row.location ?? "-"}</TableCell>
                    <TableCell>{row.sort_order}</TableCell>
                    <TableCell>
                      <span className={`ui-chip ${row.is_published ? "ui-chip--success" : ""}`}>
                        {row.is_published ? "Publicado" : "Oculto"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {row.category === "restaurant" ? (
                          <Link href={`/website-cms/venues/${encodeURIComponent(row.slug)}`} className="ui-btn ui-btn--ghost ui-btn--sm">
                            Venue detail
                          </Link>
                        ) : null}
                        <Link href={`/website-cms/items/${row.id}`} className="ui-btn ui-btn--ghost ui-btn--sm">
                          Editar
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>
    </div>
  );
}
