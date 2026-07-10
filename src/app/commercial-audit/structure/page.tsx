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
  code: string;
  kind: string;
  is_active: boolean | null;
  sort_order: number | null;
};

type CategoryRow = {
  id: string;
  site_id: string;
  name: string;
  code: string;
  is_active: boolean | null;
  sort_order: number | null;
};

type LinkRow = {
  collection_id: string;
  commercial_category_id: string;
  is_active: boolean | null;
};

type ItemRow = {
  id: string;
  site_id: string;
  product_id: string | null;
  name: string;
  image_url: string | null;
  commercial_collection_id: string | null;
  commercial_category_id: string | null;
  is_active: boolean | null;
  metadata: Record<string, unknown> | null;
};

type StructuralIssue = {
  item: ItemRow;
  site: SiteRow | null;
  collection: CollectionRow | null;
  category: CategoryRow | null;
  reason: string;
  explanation: string;
};

function isCommercialItem(item: ItemRow) {
  return (
    item.metadata?.source_app === "viso" &&
    item.metadata?.source_module === "menu_comercial"
  );
}

function text(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function siteName(site: SiteRow | null | undefined) {
  return site?.name ?? site?.code ?? "Sede desconocida";
}

function itemHref(item: ItemRow) {
  return `/menu/${encodeURIComponent(item.id)}`;
}

export default async function CommercialStructureAuditPage() {
  await requireAppAccess({ appId: "viso", returnTo: "/commercial-audit/structure" });

  const supabase = createAdminClient();
  const [
    { data: sitesRaw, error: sitesError },
    { data: collectionsRaw, error: collectionsError },
    { data: categoriesRaw, error: categoriesError },
    { data: linksRaw, error: linksError },
    { data: itemsRaw, error: itemsError },
  ] = await Promise.all([
    supabase.from("sites").select("id,name,code"),
    supabase
      .schema("pass")
      .from("commercial_collections")
      .select("id,site_id,name,code,kind,is_active,sort_order"),
    supabase
      .schema("pass")
      .from("commercial_categories")
      .select("id,site_id,name,code,is_active,sort_order"),
    supabase
      .schema("pass")
      .from("commercial_collection_categories")
      .select("collection_id,commercial_category_id,is_active"),
    supabase
      .schema("pass")
      .from("catalog_items")
      .select(
        "id,site_id,product_id,name,image_url,commercial_collection_id,commercial_category_id,is_active,metadata",
      ),
  ]);

  const loadErrors = [
    sitesError,
    collectionsError,
    categoriesError,
    linksError,
    itemsError,
  ].filter(Boolean);

  const sites = (sitesRaw ?? []) as SiteRow[];
  const collections = (collectionsRaw ?? []) as CollectionRow[];
  const categories = (categoriesRaw ?? []) as CategoryRow[];
  const links = (linksRaw ?? []) as LinkRow[];
  const items = ((itemsRaw ?? []) as ItemRow[]).filter(isCommercialItem);

  const siteById = new Map(sites.map((site) => [site.id, site]));
  const collectionById = new Map(collections.map((collection) => [collection.id, collection]));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const activeLinks = links.filter((link) => link.is_active !== false);
  const activeLinkKeys = new Set(
    activeLinks.map(
      (link) => `${link.collection_id}:${link.commercial_category_id}`,
    ),
  );

  const activeItems = items.filter((item) => item.is_active !== false);
  const structuralIssues: StructuralIssue[] = [];

  for (const item of activeItems) {
    const site = siteById.get(item.site_id) ?? null;
    const collection = item.commercial_collection_id
      ? collectionById.get(item.commercial_collection_id) ?? null
      : null;
    const category = item.commercial_category_id
      ? categoryById.get(item.commercial_category_id) ?? null
      : null;

    let reason = "";
    let explanation = "";

    if (!collection) {
      reason = "Sin colección";
      explanation = "El producto no tiene una colección comercial válida.";
    } else if (collection.is_active === false) {
      reason = "Colección inactiva";
      explanation = `Está publicado, pero pertenece a “${collection.name}”, que está desactivada.`;
    } else if (collection.site_id !== item.site_id) {
      reason = "Colección de otra sede";
      explanation = "La colección pertenece a una sede diferente al producto.";
    } else if (!category) {
      reason = "Sin categoría";
      explanation = "El producto no tiene una categoría comercial válida.";
    } else if (category.is_active === false) {
      reason = "Categoría inactiva";
      explanation = `Está publicado, pero pertenece a “${category.name}”, que está desactivada.`;
    } else if (category.site_id !== item.site_id) {
      reason = "Categoría de otra sede";
      explanation = "La categoría pertenece a una sede diferente al producto.";
    } else if (
      !activeLinkKeys.has(`${collection.id}:${category.id}`)
    ) {
      reason = "Categoría fuera de la colección";
      explanation = `“${category.name}” no está habilitada dentro de “${collection.name}”.`;
    }

    if (reason) {
      structuralIssues.push({ item, site, collection, category, reason, explanation });
    }
  }

  const emptyCollections = collections
    .filter((collection) => collection.is_active !== false)
    .map((collection) => {
      const linkedCategories = activeLinks.filter(
        (link) => link.collection_id === collection.id,
      ).length;
      const activeItemCount = activeItems.filter(
        (item) => item.commercial_collection_id === collection.id,
      ).length;
      return {
        collection,
        site: siteById.get(collection.site_id) ?? null,
        linkedCategories,
        activeItemCount,
      };
    })
    .filter((entry) => entry.linkedCategories === 0 || entry.activeItemCount === 0)
    .sort((a, b) =>
      `${siteName(a.site)} ${a.collection.name}`.localeCompare(
        `${siteName(b.site)} ${b.collection.name}`,
        "es-CO",
      ),
    );

  const unusedCategories = categories
    .filter((category) => category.is_active !== false)
    .map((category) => {
      const linkedCollections = activeLinks.filter(
        (link) => link.commercial_category_id === category.id,
      ).length;
      const activeItemCount = activeItems.filter(
        (item) => item.commercial_category_id === category.id,
      ).length;
      return {
        category,
        site: siteById.get(category.site_id) ?? null,
        linkedCollections,
        activeItemCount,
      };
    })
    .filter((entry) => entry.linkedCollections === 0 || entry.activeItemCount === 0)
    .sort((a, b) =>
      `${siteName(a.site)} ${a.category.name}`.localeCompare(
        `${siteName(b.site)} ${b.category.name}`,
        "es-CO",
      ),
    );

  const duplicateGroups = new Map<
    string,
    Array<{ type: "Categoría" | "Colección"; name: string; site: SiteRow | null; active: boolean }>
  >();

  for (const category of categories) {
    const key = `category:${category.site_id}:${normalize(category.name)}`;
    const current = duplicateGroups.get(key) ?? [];
    current.push({
      type: "Categoría",
      name: category.name,
      site: siteById.get(category.site_id) ?? null,
      active: category.is_active !== false,
    });
    duplicateGroups.set(key, current);
  }

  for (const collection of collections) {
    const key = `collection:${collection.site_id}:${normalize(collection.name)}`;
    const current = duplicateGroups.get(key) ?? [];
    current.push({
      type: "Colección",
      name: collection.name,
      site: siteById.get(collection.site_id) ?? null,
      active: collection.is_active !== false,
    });
    duplicateGroups.set(key, current);
  }

  const duplicates = Array.from(duplicateGroups.values()).filter(
    (group) => group.length > 1,
  );

  const missingImages = activeItems
    .filter((item) => !text(item.image_url))
    .map((item) => ({
      item,
      site: siteById.get(item.site_id) ?? null,
      collection: item.commercial_collection_id
        ? collectionById.get(item.commercial_collection_id) ?? null
        : null,
      category: item.commercial_category_id
        ? categoryById.get(item.commercial_category_id) ?? null
        : null,
    }))
    .sort((a, b) =>
      `${siteName(a.site)} ${a.item.name}`.localeCompare(
        `${siteName(b.site)} ${b.item.name}`,
        "es-CO",
      ),
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auditoría de estructura comercial"
        subtitle="Encuentra productos mal ubicados, colecciones vacías, categorías sin uso y publicaciones incompletas sin revisar tablas técnicas."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/commercial-audit" className="ui-btn ui-btn--ghost">
              Volver al diagnóstico
            </Link>
            <Link href="/menu" className="ui-btn ui-btn--brand">
              Abrir menú
            </Link>
          </div>
        }
      />

      {loadErrors.length > 0 ? (
        <div className="ui-alert ui-alert--error">
          No se pudo completar toda la revisión. No tomes decisiones hasta corregir la conexión con Supabase.
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="ui-card">
          <div className="ui-caption">Productos mal ubicados</div>
          <div className="mt-2 text-3xl font-black text-[var(--ui-text)]">
            {structuralIssues.length}
          </div>
          <p className="mt-2 text-sm text-[var(--ui-muted)]">
            Productos activos que no pueden organizarse correctamente en el menú.
          </p>
        </div>
        <div className="ui-card">
          <div className="ui-caption">Colecciones incompletas</div>
          <div className="mt-2 text-3xl font-black text-[var(--ui-text)]">
            {emptyCollections.length}
          </div>
          <p className="mt-2 text-sm text-[var(--ui-muted)]">
            Sin secciones o sin productos activos.
          </p>
        </div>
        <div className="ui-card">
          <div className="ui-caption">Categorías sin uso real</div>
          <div className="mt-2 text-3xl font-black text-[var(--ui-text)]">
            {unusedCategories.length}
          </div>
          <p className="mt-2 text-sm text-[var(--ui-muted)]">
            Sin colección o sin productos activos.
          </p>
        </div>
        <div className="ui-card">
          <div className="ui-caption">Productos sin imagen</div>
          <div className="mt-2 text-3xl font-black text-[var(--ui-text)]">
            {missingImages.length}
          </div>
          <p className="mt-2 text-sm text-[var(--ui-muted)]">
            Cola visual pendiente para publicar un catálogo profesional.
          </p>
        </div>
      </section>

      <section className="ui-panel space-y-4">
        <div>
          <div className="ui-h3">1. Productos que requieren decisión</div>
          <p className="ui-caption">
            Corrige primero estos productos: están activos, pero su colección o categoría no corresponde al menú visible.
          </p>
        </div>

        {structuralIssues.length === 0 ? (
          <div className="ui-alert ui-alert--success">
            No encontramos productos activos con estructura inválida.
          </div>
        ) : (
          <div className="space-y-3">
            {structuralIssues.map((issue) => (
              <div
                key={issue.item.id}
                className="rounded-2xl border border-red-200 bg-red-50 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-red-950">
                      {issue.item.name}
                    </div>
                    <div className="mt-1 text-xs font-bold uppercase tracking-wide text-red-700">
                      {siteName(issue.site)} · {issue.reason}
                    </div>
                    <p className="mt-2 text-sm text-red-900/80">
                      {issue.explanation}
                    </p>
                    <div className="mt-2 text-xs text-red-800/70">
                      Colección: {issue.collection?.name ?? "Sin colección"} · Categoría: {issue.category?.name ?? "Sin categoría"}
                    </div>
                  </div>
                  <Link href={itemHref(issue.item)} className="ui-btn ui-btn--ghost ui-btn--sm">
                    Revisar producto
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="ui-panel space-y-4">
          <div>
            <div className="ui-h3">2. Colecciones incompletas</div>
            <p className="ui-caption">
              Una colección debe tener secciones y productos; de lo contrario no aporta al flujo del cliente.
            </p>
          </div>
          {emptyCollections.length === 0 ? (
            <div className="ui-alert ui-alert--success">Todas las colecciones activas tienen contenido.</div>
          ) : (
            <div className="space-y-2">
              {emptyCollections.map(({ collection, site, linkedCategories, activeItemCount }) => (
                <div key={collection.id} className="rounded-xl border border-[var(--ui-border)] bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-[var(--ui-text)]">{collection.name}</div>
                      <div className="mt-1 text-xs text-[var(--ui-muted)]">{siteName(site)} · {collection.kind}</div>
                    </div>
                    <span className="ui-chip ui-chip--warn">
                      {linkedCategories === 0 ? "Sin secciones" : "Sin productos"}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-[var(--ui-muted)]">
                    {linkedCategories} categorías vinculadas · {activeItemCount} productos activos
                  </div>
                </div>
              ))}
            </div>
          )}
          <Link href="/commercial-collections" className="ui-btn ui-btn--ghost">
            Revisar colecciones
          </Link>
        </div>

        <div className="ui-panel space-y-4">
          <div>
            <div className="ui-h3">3. Categorías sin uso real</div>
            <p className="ui-caption">
              Una categoría permanente debe estar vinculada a una colección y contener productos.
            </p>
          </div>
          {unusedCategories.length === 0 ? (
            <div className="ui-alert ui-alert--success">Todas las categorías activas están en uso.</div>
          ) : (
            <div className="space-y-2">
              {unusedCategories.map(({ category, site, linkedCollections, activeItemCount }) => (
                <div key={category.id} className="rounded-xl border border-[var(--ui-border)] bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-[var(--ui-text)]">{category.name}</div>
                      <div className="mt-1 text-xs text-[var(--ui-muted)]">{siteName(site)}</div>
                    </div>
                    <span className="ui-chip ui-chip--warn">
                      {linkedCollections === 0 ? "Sin colección" : "Sin productos"}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-[var(--ui-muted)]">
                    {linkedCollections} colecciones · {activeItemCount} productos activos
                  </div>
                </div>
              ))}
            </div>
          )}
          <Link href="/commercial-categories" className="ui-btn ui-btn--ghost">
            Revisar categorías
          </Link>
        </div>
      </section>

      <section className="ui-panel space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="ui-h3">4. Cola de imágenes pendientes</div>
            <p className="ui-caption">
              Esta lista convierte el hallazgo general en trabajo concreto y ordenado por sede.
            </p>
          </div>
          <span className="ui-chip ui-chip--warn">{missingImages.length} pendientes</span>
        </div>

        {missingImages.length === 0 ? (
          <div className="ui-alert ui-alert--success">Todos los productos activos tienen imagen.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {missingImages.map(({ item, site, collection, category }) => (
              <Link
                key={item.id}
                href={itemHref(item)}
                className="rounded-2xl border border-[var(--ui-border)] bg-white p-4 transition hover:border-[var(--ui-brand)] hover:shadow-sm"
              >
                <div className="text-sm font-black text-[var(--ui-text)]">{item.name}</div>
                <div className="mt-1 text-xs text-[var(--ui-muted)]">{siteName(site)}</div>
                <div className="mt-3 text-xs text-[var(--ui-muted)]">
                  {collection?.name ?? "Sin colección"} · {category?.name ?? "Sin categoría"}
                </div>
                <div className="mt-3 text-sm font-black text-[var(--ui-brand)]">Agregar imagen →</div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="ui-panel space-y-3">
        <div className="ui-h3">Duplicados de categorías y colecciones</div>
        {duplicates.length === 0 ? (
          <div className="ui-alert ui-alert--success">
            No encontramos categorías ni colecciones duplicadas por nombre dentro de una misma sede.
          </div>
        ) : (
          <div className="space-y-2">
            {duplicates.map((group, index) => (
              <div key={`${group[0]?.type}-${index}`} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="text-sm font-black text-amber-950">
                  {group[0]?.type} duplicada · {siteName(group[0]?.site)}
                </div>
                <div className="mt-1 text-sm text-amber-900">
                  {group.map((record) => `${record.name}${record.active ? "" : " (inactiva)"}`).join(" · ")}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
