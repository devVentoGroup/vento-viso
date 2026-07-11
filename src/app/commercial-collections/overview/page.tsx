import Link from "next/link";

import { PageHeader } from "@/components/vento/standard/page-header";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type SiteRow = {
  id: string;
  name: string | null;
  code: string | null;
};

type CollectionRow = {
  id: string;
  site_id: string;
  name: string;
  subtitle: string | null;
  kind: string;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean | null;
  sort_order: number | null;
};

type CategoryLinkRow = {
  collection_id: string;
  is_active: boolean | null;
};

type ItemLinkRow = {
  commercial_collection_id: string;
  is_active: boolean | null;
};

type CollectionStatus = "visible" | "scheduled" | "expired" | "inactive";

function siteLabel(site: SiteRow | undefined) {
  return site?.name ?? site?.code ?? "Sin sede";
}

function kindLabel(kind: string) {
  switch (kind) {
    case "main":
      return "Menú principal";
    case "seasonal":
      return "Temporada";
    case "campaign":
      return "Campaña";
    case "special":
      return "Menú especial";
    case "event":
      return "Evento";
    default:
      return "Colección";
  }
}

function collectionGroup(kind: string) {
  if (kind === "main") return "main";
  if (kind === "seasonal" || kind === "event") return "seasonal";
  return "campaign";
}

function statusFor(collection: CollectionRow, now: Date): CollectionStatus {
  if (collection.is_active === false) return "inactive";

  const startsAt = collection.starts_at ? new Date(collection.starts_at) : null;
  const endsAt = collection.ends_at ? new Date(collection.ends_at) : null;

  if (startsAt && !Number.isNaN(startsAt.getTime()) && startsAt > now) return "scheduled";
  if (endsAt && !Number.isNaN(endsAt.getTime()) && endsAt < now) return "expired";
  return "visible";
}

function statusLabel(status: CollectionStatus) {
  switch (status) {
    case "visible":
      return "Visible en Pass";
    case "scheduled":
      return "Programado";
    case "expired":
      return "Vencido";
    case "inactive":
      return "Inactivo";
  }
}

function statusClasses(status: CollectionStatus) {
  switch (status) {
    case "visible":
      return "bg-emerald-50 text-emerald-700";
    case "scheduled":
      return "bg-amber-50 text-amber-700";
    case "expired":
      return "bg-slate-100 text-slate-600";
    case "inactive":
      return "bg-rose-50 text-rose-700";
  }
}

function dateLabel(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(date);
}

function overviewPath(siteId: string) {
  const params = new URLSearchParams({ site: siteId });
  return `/commercial-collections/overview?${params.toString()}`;
}

function advancedPath(siteId: string, collectionId?: string) {
  const params = new URLSearchParams({ site: siteId });
  if (collectionId) params.set("collection", collectionId);
  return `/commercial-collections?${params.toString()}`;
}

export default async function CommercialCollectionsOverviewPage({
  searchParams,
}: {
  searchParams?: Promise<{ site?: string }>;
}) {
  await requireAppAccess({
    appId: "viso",
    returnTo: "/commercial-collections/overview",
  });

  const requestedSiteId = String((await searchParams)?.site ?? "").trim();
  const supabase = createAdminClient();

  const [
    { data: sitesRaw, error: sitesError },
    { data: collectionsRaw, error: collectionsError },
    { data: categoryLinksRaw, error: categoryLinksError },
    { data: itemLinksRaw, error: itemLinksError },
  ] = await Promise.all([
    supabase
      .from("sites")
      .select("id,name,code")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .schema("pass")
      .from("commercial_collections")
      .select("id,site_id,name,subtitle,kind,starts_at,ends_at,is_active,sort_order")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .schema("pass")
      .from("commercial_collection_categories")
      .select("collection_id,is_active")
      .eq("is_active", true),
    supabase
      .schema("pass")
      .from("catalog_item_collections")
      .select("commercial_collection_id,is_active")
      .eq("is_active", true),
  ]);

  const sites = (sitesRaw ?? []) as SiteRow[];
  const collections = (collectionsRaw ?? []) as CollectionRow[];
  const selectedSiteId = sites.some((site) => site.id === requestedSiteId)
    ? requestedSiteId
    : sites.find((site) => collections.some((collection) => collection.site_id === site.id))?.id ?? sites[0]?.id ?? "";
  const selectedSite = sites.find((site) => site.id === selectedSiteId);
  const selectedCollections = collections.filter((collection) => collection.site_id === selectedSiteId);

  const sectionCountByCollection = new Map<string, number>();
  for (const link of (categoryLinksRaw ?? []) as CategoryLinkRow[]) {
    if (link.is_active === false) continue;
    sectionCountByCollection.set(
      link.collection_id,
      (sectionCountByCollection.get(link.collection_id) ?? 0) + 1,
    );
  }

  const productCountByCollection = new Map<string, number>();
  for (const link of (itemLinksRaw ?? []) as ItemLinkRow[]) {
    if (link.is_active === false) continue;
    productCountByCollection.set(
      link.commercial_collection_id,
      (productCountByCollection.get(link.commercial_collection_id) ?? 0) + 1,
    );
  }

  const groups = [
    {
      key: "main",
      title: "Menú principal",
      description: "El catálogo permanente que el cliente encuentra normalmente.",
    },
    {
      key: "campaign",
      title: "Campañas y menús especiales",
      description: "Colecciones comerciales para regalos, lanzamientos o comunicaciones puntuales.",
    },
    {
      key: "seasonal",
      title: "Temporadas y eventos",
      description: "Menús con fechas de inicio o finalización definidas.",
    },
  ];

  const now = new Date();
  const effectiveError =
    sitesError?.message ||
    collectionsError?.message ||
    categoryLinksError?.message ||
    itemLinksError?.message ||
    "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Menús y temporadas"
        subtitle="Controla dónde aparecen los productos y cuándo debe mostrarse cada menú, sin entrar primero a la configuración técnica."
        actions={(
          <div className="flex flex-wrap gap-2">
            {selectedSiteId ? (
              <Link href={advancedPath(selectedSiteId)} className="ui-btn ui-btn--brand">
                Crear o configurar
              </Link>
            ) : null}
            <Link href="/commercial-menu" className="ui-btn ui-btn--ghost">
              Volver al menú comercial
            </Link>
          </div>
        )}
      />

      {effectiveError ? <div className="ui-alert ui-alert--error">{effectiveError}</div> : null}

      {sites.length > 0 ? (
        <section className="ui-panel space-y-3">
          <div>
            <h2 className="ui-h3">Sede</h2>
            <p className="ui-caption">Consulta los menús configurados para cada punto de venta.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {sites.map((site) => (
              <Link
                key={site.id}
                href={overviewPath(site.id)}
                className={site.id === selectedSiteId ? "ui-chip ui-chip--brand" : "ui-chip"}
              >
                {siteLabel(site)}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {!selectedSite ? (
        <div className="ui-panel">
          <div className="ui-empty">No hay sedes comerciales activas.</div>
        </div>
      ) : selectedCollections.length === 0 ? (
        <div className="ui-panel space-y-3">
          <div className="ui-empty">{siteLabel(selectedSite)} todavía no tiene menús configurados.</div>
          <div className="flex justify-center">
            <Link href={advancedPath(selectedSite.id)} className="ui-btn ui-btn--brand">
              Crear primer menú
            </Link>
          </div>
        </div>
      ) : (
        groups.map((group) => {
          const groupCollections = selectedCollections.filter(
            (collection) => collectionGroup(collection.kind) === group.key,
          );

          if (groupCollections.length === 0) return null;

          return (
            <section key={group.key} className="space-y-3">
              <div>
                <h2 className="ui-h3">{group.title}</h2>
                <p className="ui-caption">{group.description}</p>
              </div>

              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {groupCollections.map((collection) => {
                  const status = statusFor(collection, now);
                  const startsAt = dateLabel(collection.starts_at);
                  const endsAt = dateLabel(collection.ends_at);

                  return (
                    <article
                      key={collection.id}
                      className="rounded-3xl border border-[var(--ui-border)] bg-white p-5 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-black uppercase tracking-[0.14em] text-[var(--ui-brand)]">
                            {kindLabel(collection.kind)}
                          </div>
                          <h3 className="mt-2 truncate text-lg font-black text-[var(--ui-text)]">
                            {collection.name}
                          </h3>
                          {collection.subtitle ? (
                            <p className="mt-1 text-sm text-[var(--ui-muted)]">{collection.subtitle}</p>
                          ) : null}
                        </div>
                        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${statusClasses(status)}`}>
                          {statusLabel(status)}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-[var(--ui-surface-2)] p-3">
                          <div className="text-2xl font-black text-[var(--ui-text)]">
                            {sectionCountByCollection.get(collection.id) ?? 0}
                          </div>
                          <div className="text-xs font-semibold text-[var(--ui-muted)]">Secciones</div>
                        </div>
                        <div className="rounded-2xl bg-[var(--ui-surface-2)] p-3">
                          <div className="text-2xl font-black text-[var(--ui-text)]">
                            {productCountByCollection.get(collection.id) ?? 0}
                          </div>
                          <div className="text-xs font-semibold text-[var(--ui-muted)]">Productos</div>
                        </div>
                      </div>

                      {startsAt || endsAt ? (
                        <div className="mt-4 space-y-1 rounded-2xl border border-[var(--ui-border)] px-3 py-2 text-xs text-[var(--ui-muted)]">
                          {startsAt ? <div><strong>Inicia:</strong> {startsAt}</div> : null}
                          {endsAt ? <div><strong>Finaliza:</strong> {endsAt}</div> : null}
                        </div>
                      ) : null}

                      <div className="mt-4 flex justify-end">
                        <Link
                          href={advancedPath(selectedSite.id, collection.id)}
                          className="ui-btn ui-btn--ghost ui-btn--sm"
                        >
                          Configurar
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
