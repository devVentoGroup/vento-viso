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

// Nombres amigables para las páginas
const PAGE_NAMES: Record<string, string> = {
  home: "Página principal",
  restaurantes: "Restaurantes",
  empleos: "Empleos",
  servicios: "Servicios",
  eventos: "Eventos",
  ecosistema: "Ecosistema",
};

// Nombres amigables para los bloques (secciones editables del sitio)
const BLOCK_NAMES: Record<string, string> = {
  // Home
  hero_main: "Hero principal — Home",
  hero_slide_1: "Slide 1 del hero — Home",
  hero_slide_2: "Slide 2 del hero — Home",
  hero_slide_3: "Slide 3 del hero — Home",
  hero_slide_4: "Slide 4 del hero — Home",
  home_editorial_1: "Sección editorial intro — Home",
  home_editorial_2: "Sección editorial statement — Home",
  home_image_banner: "Banner de imagen full-width — Home",
  home_event_spaces_feature: "Sección espacios de eventos — Home",
  // Restaurantes
  restaurantes_experience: "Sección editorial — Restaurantes",
  restaurantes_banner: "Banner de imagen — Restaurantes",
  // Servicios
  servicios_intro: "Sección intro — Servicios",
  servicios_banner: "Banner de imagen — Servicios",
  // Eventos
  eventos_spaces: "Sección espacios — Eventos",
  eventos_banner: "Banner de imagen — Eventos",
  // Detalle
  detail_hero: "Foto hero — Página detalle",
};

// Nombres amigables para las categorías
const CATEGORY_NAMES: Record<string, string> = {
  restaurant: "Restaurante",
  job: "Empleo",
  service: "Servicio",
  event: "Evento",
  app: "App",
};

// Color de categoria
const CATEGORY_COLORS: Record<string, string> = {
  restaurant: "ui-chip--success",
  job: "ui-chip--brand",
  service: "",
  event: "ui-chip--warning",
  app: "",
};

function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try { return decodeURIComponent(value); } catch { return value ?? ""; }
}

const PAGE_FILTERS = [
  { key: "", label: "Todas las páginas" },
  { key: "restaurantes", label: "Restaurantes" },
  { key: "empleos", label: "Empleos" },
  { key: "servicios", label: "Servicios" },
  { key: "eventos", label: "Eventos" },
  { key: "home", label: "Principal" },
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

  await requireAppAccess({ appId: "viso", returnTo: "/website-cms" });
  const supabase = createAdminClient();

  let blocksQuery = supabase
    .from("website_blocks")
    .select("id,page_slug,block_key,block_type,title,sort_order,media_type,is_published")
    .order("page_slug", { ascending: true })
    .order("sort_order", { ascending: true });
  if (pageFilter) blocksQuery = blocksQuery.eq("page_slug", pageFilter);

  let itemsQuery = supabase
    .from("website_items")
    .select("id,category,slug,title,location,sort_order,is_published")
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true });
  if (categoryFilter) itemsQuery = itemsQuery.eq("category", categoryFilter);

  const [{ data: blocksData, error: blocksError }, { data: itemsData, error: itemsError }] = await Promise.all([
    blocksQuery,
    itemsQuery,
  ]);

  const blocks = (blocksData ?? []) as WebsiteBlockRow[];
  const items = (itemsData ?? []) as WebsiteItemRow[];
  const effectiveError = errorMsg || blocksError?.message || itemsError?.message || "";

  // Conteos por categoría para los accesos rápidos
  const countByCategory = (cat: string, published?: boolean) =>
    items.filter((i) => i.category === cat && (published === undefined || i.is_published === published)).length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Sitio web ventogroup.co"
        subtitle="Actualiza el contenido que aparece en el sitio. Los cambios se reflejan de inmediato."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/website-cms/blocks/new" className="ui-btn ui-btn--ghost">
              + Agregar sección
            </Link>
            <Link href="/website-cms/items/new" className="ui-btn ui-btn--brand">
              + Agregar tarjeta
            </Link>
          </div>
        }
      />

      {effectiveError ? <div className="ui-alert ui-alert--error">{effectiveError}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}

      {/* ── Accesos rápidos por sección ───────────────────────────── */}
      <section className="space-y-3">
        <div>
          <div className="ui-h3">¿Qué quieres actualizar?</div>
          <div className="ui-caption mt-0.5">Cada sección maneja el contenido que aparece en esa página del sitio.</div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

          {/* Restaurantes */}
          <div className="ui-panel space-y-3 flex flex-col">
            <div>
              <div className="font-semibold text-sm">🍽 Restaurantes</div>
              <div className="ui-caption mt-1">Fotos, nombre, ubicación y horario de cada restaurante del grupo.</div>
            </div>
            <div className="flex items-center gap-2 text-xs text-[var(--ui-text-muted,#888)]">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
              {countByCategory("restaurant", true)} publicados
              {countByCategory("restaurant", false) > 0 && (
                <span className="text-amber-500">· {countByCategory("restaurant", false)} ocultos</span>
              )}
            </div>
            <div className="flex flex-col gap-2 mt-auto pt-1">
              <Link href="/website-cms/venues" className="ui-btn ui-btn--brand ui-btn--sm text-center">
                Administrar restaurantes
              </Link>
              <Link href="/website-cms/venues" className="ui-btn ui-btn--ghost ui-btn--sm text-center">
                Importar desde Negocios
              </Link>
            </div>
          </div>

          {/* Empleos */}
          <div className="ui-panel space-y-3 flex flex-col">
            <div>
              <div className="font-semibold text-sm">💼 Empleos</div>
              <div className="ui-caption mt-1">Vacantes activas que aparecen en ventogroup.co/empleos.</div>
            </div>
            <div className="flex items-center gap-2 text-xs text-[var(--ui-text-muted,#888)]">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
              {countByCategory("job", true)} publicados
              {countByCategory("job", false) > 0 && (
                <span className="text-amber-500">· {countByCategory("job", false)} ocultos</span>
              )}
            </div>
            <div className="flex flex-col gap-2 mt-auto pt-1">
              <Link href="/website-cms?category=job" className="ui-btn ui-btn--ghost ui-btn--sm text-center">
                Ver empleos
              </Link>
              <Link href="/website-cms/items/new" className="ui-btn ui-btn--brand ui-btn--sm text-center">
                + Publicar vacante
              </Link>
            </div>
          </div>

          {/* Eventos */}
          <div className="ui-panel space-y-3 flex flex-col">
            <div>
              <div className="font-semibold text-sm">🎉 Eventos</div>
              <div className="ui-caption mt-1">Agenda de eventos y activaciones en ventogroup.co/eventos.</div>
            </div>
            <div className="flex items-center gap-2 text-xs text-[var(--ui-text-muted,#888)]">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
              {countByCategory("event", true)} publicados
              {countByCategory("event", false) > 0 && (
                <span className="text-amber-500">· {countByCategory("event", false)} ocultos</span>
              )}
            </div>
            <div className="flex flex-col gap-2 mt-auto pt-1">
              <Link href="/website-cms?category=event" className="ui-btn ui-btn--ghost ui-btn--sm text-center">
                Ver eventos
              </Link>
              <Link href="/website-cms/items/new" className="ui-btn ui-btn--brand ui-btn--sm text-center">
                + Agregar evento
              </Link>
            </div>
          </div>

          {/* Servicios */}
          <div className="ui-panel space-y-3 flex flex-col">
            <div>
              <div className="font-semibold text-sm">🛠 Servicios</div>
              <div className="ui-caption mt-1">Servicios del grupo en ventogroup.co/servicios.</div>
            </div>
            <div className="flex items-center gap-2 text-xs text-[var(--ui-text-muted,#888)]">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
              {countByCategory("service", true)} publicados
              {countByCategory("service", false) > 0 && (
                <span className="text-amber-500">· {countByCategory("service", false)} ocultos</span>
              )}
            </div>
            <div className="flex flex-col gap-2 mt-auto pt-1">
              <Link href="/website-cms?category=service" className="ui-btn ui-btn--ghost ui-btn--sm text-center">
                Ver servicios
              </Link>
              <Link href="/website-cms/items/new" className="ui-btn ui-btn--brand ui-btn--sm text-center">
                + Agregar servicio
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Tarjetas de contenido ──────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <div className="ui-h3">Tarjetas de contenido</div>
          <div className="ui-caption mt-0.5">
            Son las tarjetas que aparecen en las listas del sitio: restaurantes, empleos, eventos y servicios.
            Cada una tiene foto, descripcion, ubicacion y un boton de accion.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="ui-caption">Filtrar:</span>
          {CATEGORY_FILTERS.map((f) => (
            <Link
              key={f.key}
              href={f.key ? `/website-cms?category=${encodeURIComponent(f.key)}` : "/website-cms"}
              className={`ui-chip ${categoryFilter === f.key ? "ui-chip--brand" : ""}`}
            >
              {f.label}
            </Link>
          ))}
        </div>

        <div className="ui-panel">
          {items.length === 0 ? (
            <div className="ui-empty space-y-1">
              <p>No hay contenido creado para este filtro.</p>
              <p className="text-sm opacity-70">Usa <strong>+ Agregar tarjeta</strong> para crear el primero, o importa restaurantes desde Negocios.</p>
            </div>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Tipo</TableHeaderCell>
                  <TableHeaderCell>Nombre / Titulo</TableHeaderCell>
                  <TableHeaderCell>Ubicacion</TableHeaderCell>
                  <TableHeaderCell>Orden</TableHeaderCell>
                  <TableHeaderCell>Estado</TableHeaderCell>
                  <TableHeaderCell></TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <span className={`ui-chip ${CATEGORY_COLORS[row.category] ?? ""}`}>
                        {CATEGORY_NAMES[row.category] ?? row.category}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold">{row.title}</div>
                      <div className="ui-caption">ventogroup.co/.../{row.slug}</div>
                    </TableCell>
                    <TableCell>{row.location ?? <span className="opacity-40">Sin definir</span>}</TableCell>
                    <TableCell>{row.sort_order}</TableCell>
                    <TableCell>
                      <span className={`ui-chip ${row.is_published ? "ui-chip--success" : ""}`}>
                        {row.is_published ? "Publicado" : "Oculto"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {row.category === "restaurant" && (
                          <Link href={`/website-cms/venues/${encodeURIComponent(row.slug)}`} className="ui-btn ui-btn--ghost ui-btn--sm">
                            Galeria
                          </Link>
                        )}
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

      {/* ── Secciones y textos del sitio ──────────────────────────── */}
      <section className="space-y-3">
        <div>
          <div className="ui-h3">Secciones y textos del sitio</div>
          <div className="ui-caption mt-0.5">
            Son las secciones editoriales de cada pagina: textos del hero, imagenes de fondo, frases destacadas y banners.
            Si no sabes cual editar, filtra por la pagina donde quieres hacer el cambio.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="ui-caption">Filtrar por pagina:</span>
          {PAGE_FILTERS.map((f) => (
            <Link
              key={f.key}
              href={f.key ? `/website-cms?page=${encodeURIComponent(f.key)}` : "/website-cms"}
              className={`ui-chip ${pageFilter === f.key ? "ui-chip--brand" : ""}`}
            >
              {f.label}
            </Link>
          ))}
        </div>

        <div className="ui-panel">
          {blocks.length === 0 ? (
            <div className="ui-empty space-y-1">
              <p>No hay secciones creadas para este filtro.</p>
              <p className="text-sm opacity-70">Usa <strong>+ Agregar seccion</strong> para crear una nueva.</p>
            </div>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Pagina</TableHeaderCell>
                  <TableHeaderCell>Que controla</TableHeaderCell>
                  <TableHeaderCell>Titulo actual</TableHeaderCell>
                  <TableHeaderCell>Estado</TableHeaderCell>
                  <TableHeaderCell></TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {blocks.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <span className="ui-chip">{PAGE_NAMES[row.page_slug] ?? row.page_slug}</span>
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold text-sm">
                        {BLOCK_NAMES[row.block_key] ?? row.block_key}
                      </div>
                      {row.media_type && (
                        <div className="ui-caption">{row.media_type === "image" ? "Imagen" : "Video"}</div>
                      )}
                    </TableCell>
                    <TableCell>{row.title ?? <span className="opacity-40">Sin titulo</span>}</TableCell>
                    <TableCell>
                      <span className={`ui-chip ${row.is_published ? "ui-chip--success" : ""}`}>
                        {row.is_published ? "Visible" : "Oculto"}
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
    </div>
  );
}
