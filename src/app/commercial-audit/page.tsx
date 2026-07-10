import Link from "next/link";

import { PageHeader } from "@/components/vento/standard/page-header";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type SiteRow = {
  id: string;
  name: string | null;
  code: string | null;
  is_active: boolean | null;
};

type SatelliteRow = {
  site_id: string;
  is_active: boolean | null;
};

type CollectionRow = {
  id: string;
  site_id: string;
  name: string;
  code: string;
  kind: string;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean | null;
};

type CategoryRow = {
  id: string;
  site_id: string;
  name: string;
  code: string;
  is_active: boolean | null;
};

type CollectionCategoryRow = {
  collection_id: string;
  commercial_category_id: string;
  is_active: boolean | null;
};

type CatalogItemRow = {
  id: string;
  site_id: string;
  product_id: string | null;
  name: string;
  description: string | null;
  image_url: string | null;
  price_amount: number | string | null;
  commercial_collection_id: string | null;
  commercial_category_id: string | null;
  is_active: boolean | null;
  fulfillment_modes: string[] | null;
  metadata: Record<string, unknown> | null;
};

type OptionGroupRow = {
  id: string;
  catalog_item_id: string;
  is_active: boolean | null;
};

type PresentationRow = {
  catalog_item_id: string;
  surface: string;
  opens_detail_modal: boolean | null;
  allow_customer_note: boolean | null;
};

type AuditIssue = {
  key: string;
  label: string;
  count: number;
  severity: "ok" | "warning" | "critical";
  explanation: string;
  actionLabel?: string;
  actionHref?: string;
};

function relationCount<T>(rows: T[], predicate: (row: T) => boolean) {
  return rows.reduce((count, row) => count + (predicate(row) ? 1 : 0), 0);
}

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasText(value: string | null | undefined) {
  return Boolean(value && value.trim());
}

function isCanonicalItem(item: CatalogItemRow) {
  return (
    item.metadata?.source_app === "viso" &&
    item.metadata?.source_module === "menu_comercial"
  );
}

function siteLabel(site: SiteRow | undefined) {
  return site?.name ?? site?.code ?? "Sede sin nombre";
}

function issueTone(severity: AuditIssue["severity"]) {
  if (severity === "critical") return "border-red-200 bg-red-50 text-red-900";
  if (severity === "warning") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-emerald-200 bg-emerald-50 text-emerald-900";
}

function issueCountTone(severity: AuditIssue["severity"]) {
  if (severity === "critical") return "bg-red-600 text-white";
  if (severity === "warning") return "bg-amber-500 text-white";
  return "bg-emerald-600 text-white";
}

export default async function CommercialAuditPage() {
  await requireAppAccess({ appId: "viso", returnTo: "/commercial-audit" });

  const supabase = createAdminClient();

  const [
    { data: sitesRaw, error: sitesError },
    { data: satellitesRaw, error: satellitesError },
    { data: collectionsRaw, error: collectionsError },
    { data: categoriesRaw, error: categoriesError },
    { data: linksRaw, error: linksError },
    { data: itemsRaw, error: itemsError },
    { data: optionGroupsRaw, error: optionGroupsError },
    { data: presentationsRaw, error: presentationsError },
  ] = await Promise.all([
    supabase.from("sites").select("id,name,code,is_active").eq("is_active", true),
    supabase.schema("pass").from("pass_satellites").select("site_id,is_active"),
    supabase
      .schema("pass")
      .from("commercial_collections")
      .select("id,site_id,name,code,kind,starts_at,ends_at,is_active"),
    supabase
      .schema("pass")
      .from("commercial_categories")
      .select("id,site_id,name,code,is_active"),
    supabase
      .schema("pass")
      .from("commercial_collection_categories")
      .select("collection_id,commercial_category_id,is_active"),
    supabase
      .schema("pass")
      .from("catalog_items")
      .select(
        "id,site_id,product_id,name,description,image_url,price_amount,commercial_collection_id,commercial_category_id,is_active,fulfillment_modes,metadata",
      ),
    supabase
      .schema("pass")
      .from("catalog_item_option_groups")
      .select("id,catalog_item_id,is_active"),
    supabase
      .schema("pass")
      .from("catalog_item_presentation")
      .select("catalog_item_id,surface,opens_detail_modal,allow_customer_note"),
  ]);

  const loadErrors = [
    sitesError,
    satellitesError,
    collectionsError,
    categoriesError,
    linksError,
    itemsError,
    optionGroupsError,
    presentationsError,
  ].filter(Boolean);

  const sites = (sitesRaw ?? []) as SiteRow[];
  const satellites = (satellitesRaw ?? []) as SatelliteRow[];
  const collections = (collectionsRaw ?? []) as CollectionRow[];
  const categories = (categoriesRaw ?? []) as CategoryRow[];
  const links = (linksRaw ?? []) as CollectionCategoryRow[];
  const items = (itemsRaw ?? []) as CatalogItemRow[];
  const optionGroups = (optionGroupsRaw ?? []) as OptionGroupRow[];
  const presentations = (presentationsRaw ?? []) as PresentationRow[];

  const passSiteIds = new Set(
    satellites.filter((row) => row.is_active !== false).map((row) => row.site_id),
  );
  const passSites = sites.filter((site) => passSiteIds.has(site.id));

  const activeCollections = collections.filter((row) => row.is_active !== false);
  const activeCategories = categories.filter((row) => row.is_active !== false);
  const activeLinks = links.filter((row) => row.is_active !== false);
  const activeItems = items.filter((row) => row.is_active !== false && isCanonicalItem(row));
  const activeOptionGroups = optionGroups.filter((row) => row.is_active !== false);

  const linkedCollectionIds = new Set(activeLinks.map((row) => row.collection_id));
  const linkedCategoryIds = new Set(activeLinks.map((row) => row.commercial_category_id));
  const activeItemIds = new Set(activeItems.map((row) => row.id));
  const optionGroupItemIds = new Set(
    activeOptionGroups
      .map((row) => row.catalog_item_id)
      .filter((itemId) => activeItemIds.has(itemId)),
  );
  const presentedItemIds = new Set(
    presentations
      .filter((row) => row.surface === "vento_pass")
      .map((row) => row.catalog_item_id),
  );

  const globalIssues: AuditIssue[] = [
    {
      key: "pass-sites",
      label: "Sedes comerciales activas",
      count: passSites.length,
      severity: passSites.length > 0 ? "ok" : "critical",
      explanation:
        passSites.length > 0
          ? "Estas sedes pueden publicar catálogo en Vento Pass."
          : "No hay ninguna sede habilitada como satélite comercial.",
      actionLabel: "Revisar negocios",
      actionHref: "/businesses",
    },
    {
      key: "unlinked-collections",
      label: "Colecciones sin secciones",
      count: relationCount(activeCollections, (row) => !linkedCollectionIds.has(row.id)),
      severity: relationCount(activeCollections, (row) => !linkedCollectionIds.has(row.id)) > 0 ? "warning" : "ok",
      explanation:
        "Una colección sin secciones no ofrece una estructura clara para organizar productos.",
      actionLabel: "Organizar colecciones",
      actionHref: "/commercial-collections",
    },
    {
      key: "unused-categories",
      label: "Categorías sin colección",
      count: relationCount(activeCategories, (row) => !linkedCategoryIds.has(row.id)),
      severity: relationCount(activeCategories, (row) => !linkedCategoryIds.has(row.id)) > 0 ? "warning" : "ok",
      explanation:
        "Las categorías permanentes deben estar vinculadas por lo menos a una colección visible.",
      actionLabel: "Revisar categorías",
      actionHref: "/commercial-categories",
    },
    {
      key: "missing-image",
      label: "Productos activos sin imagen",
      count: relationCount(activeItems, (row) => !hasText(row.image_url)),
      severity: relationCount(activeItems, (row) => !hasText(row.image_url)) > 0 ? "warning" : "ok",
      explanation:
        "Sin imagen, el menú se ve incompleto y el cliente entiende peor qué está comprando.",
      actionLabel: "Abrir menú",
      actionHref: "/menu",
    },
    {
      key: "missing-description",
      label: "Productos activos sin descripción",
      count: relationCount(activeItems, (row) => !hasText(row.description)),
      severity: relationCount(activeItems, (row) => !hasText(row.description)) > 0 ? "warning" : "ok",
      explanation:
        "Una descripción corta reduce dudas y evita que el equipo dependa de conocimiento informal.",
      actionLabel: "Abrir menú",
      actionHref: "/menu",
    },
    {
      key: "invalid-structure",
      label: "Productos con estructura incompleta",
      count: relationCount(
        activeItems,
        (row) =>
          !row.product_id ||
          !row.commercial_collection_id ||
          !row.commercial_category_id ||
          numberValue(row.price_amount) <= 0,
      ),
      severity:
        relationCount(
          activeItems,
          (row) =>
            !row.product_id ||
            !row.commercial_collection_id ||
            !row.commercial_category_id ||
            numberValue(row.price_amount) <= 0,
        ) > 0
          ? "critical"
          : "ok",
      explanation:
        "Todo producto comercial debe tener producto base, colección, categoría y precio válido.",
      actionLabel: "Corregir productos",
      actionHref: "/menu",
    },
    {
      key: "missing-presentation",
      label: "Productos sin presentación de Pass",
      count: relationCount(activeItems, (row) => !presentedItemIds.has(row.id)),
      severity: relationCount(activeItems, (row) => !presentedItemIds.has(row.id)) > 0 ? "warning" : "ok",
      explanation:
        "La presentación define si el producto abre detalle, usa card compacta y admite notas.",
      actionLabel: "Revisar presentación",
      actionHref: "/menu",
    },
  ];

  const criticalCount = globalIssues.filter((issue) => issue.severity === "critical" && issue.count > 0).length;
  const warningCount = globalIssues.filter((issue) => issue.severity === "warning" && issue.count > 0).length;

  const siteAudits = passSites.map((site) => {
    const siteCollections = activeCollections.filter((row) => row.site_id === site.id);
    const siteCategories = activeCategories.filter((row) => row.site_id === site.id);
    const siteItems = activeItems.filter((row) => row.site_id === site.id);
    const personalizedCount = relationCount(siteItems, (row) => optionGroupItemIds.has(row.id));
    const missingImages = relationCount(siteItems, (row) => !hasText(row.image_url));
    const missingDescriptions = relationCount(siteItems, (row) => !hasText(row.description));
    const scheduledHints = relationCount(siteItems, (row) => {
      const metadata = row.metadata ?? {};
      return (
        metadata.scheduling_required === true ||
        typeof metadata.minimum_lead_minutes === "number" ||
        typeof metadata.minimum_lead_hours === "number"
      );
    });

    return {
      site,
      collections: siteCollections.length,
      categories: siteCategories.length,
      items: siteItems.length,
      personalizedCount,
      missingImages,
      missingDescriptions,
      scheduledHints,
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Diagnóstico del menú comercial"
        subtitle="Revisa el estado real del catálogo antes de configurar regalos, programación y productos por encargo."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/menu" className="ui-btn ui-btn--ghost">
              Ver menú
            </Link>
            <Link href="/commercial-collections" className="ui-btn ui-btn--brand">
              Organizar menú
            </Link>
          </div>
        }
      />

      {loadErrors.length > 0 ? (
        <div className="ui-alert ui-alert--error">
          No se pudo completar toda la auditoría. Revisa la conexión con Supabase antes de tomar decisiones.
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="ui-card">
          <div className="ui-caption">Estado general</div>
          <div className="mt-2 text-3xl font-black text-[var(--ui-text)]">
            {criticalCount > 0 ? "Requiere corrección" : warningCount > 0 ? "Requiere limpieza" : "Saludable"}
          </div>
          <p className="mt-2 text-sm text-[var(--ui-muted)]">
            {criticalCount} bloqueos críticos · {warningCount} oportunidades de mejora
          </p>
        </div>
        <div className="ui-card">
          <div className="ui-caption">Productos publicados</div>
          <div className="mt-2 text-3xl font-black text-[var(--ui-text)]">{activeItems.length}</div>
          <p className="mt-2 text-sm text-[var(--ui-muted)]">
            Ítems comerciales activos y creados desde VISO.
          </p>
        </div>
        <div className="ui-card">
          <div className="ui-caption">Productos personalizables</div>
          <div className="mt-2 text-3xl font-black text-[var(--ui-text)]">{optionGroupItemIds.size}</div>
          <p className="mt-2 text-sm text-[var(--ui-muted)]">
            Productos con grupos de opciones configurados.
          </p>
        </div>
      </section>

      <section className="ui-panel space-y-4">
        <div>
          <div className="ui-h3">Qué debes revisar primero</div>
          <p className="ui-caption">
            La auditoría traduce la estructura técnica a decisiones operativas. Corrige de arriba hacia abajo.
          </p>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {globalIssues.map((issue) => (
            <div key={issue.key} className={`rounded-2xl border p-4 ${issueTone(issue.severity)}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-black">{issue.label}</div>
                  <p className="mt-1 text-sm opacity-80">{issue.explanation}</p>
                </div>
                <span className={`inline-flex min-w-9 items-center justify-center rounded-full px-2 py-1 text-sm font-black ${issueCountTone(issue.severity)}`}>
                  {issue.count}
                </span>
              </div>
              {issue.actionHref && issue.actionLabel ? (
                <Link href={issue.actionHref} className="mt-3 inline-flex text-sm font-black underline underline-offset-4">
                  {issue.actionLabel}
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="ui-panel space-y-4">
        <div>
          <div className="ui-h3">Estado por sede</div>
          <p className="ui-caption">
            Solo aparecen sedes activas en Vento Pass. Así se evita mezclar centros operativos con catálogos comerciales.
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          {siteAudits.map((audit) => (
            <div key={audit.site.id} className="rounded-2xl border border-[var(--ui-border)] bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-black text-[var(--ui-text)]">{siteLabel(audit.site)}</div>
                  <div className="ui-caption">{audit.site.code || "Sin código"}</div>
                </div>
                <Link href={`/menu?site=${encodeURIComponent(audit.site.id)}`} className="ui-btn ui-btn--ghost ui-btn--sm">
                  Abrir
                </Link>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-[var(--ui-surface-2)] p-3 text-center">
                  <div className="text-xl font-black text-[var(--ui-text)]">{audit.collections}</div>
                  <div className="mt-1 text-[11px] font-bold text-[var(--ui-muted)]">Colecciones</div>
                </div>
                <div className="rounded-xl bg-[var(--ui-surface-2)] p-3 text-center">
                  <div className="text-xl font-black text-[var(--ui-text)]">{audit.categories}</div>
                  <div className="mt-1 text-[11px] font-bold text-[var(--ui-muted)]">Categorías</div>
                </div>
                <div className="rounded-xl bg-[var(--ui-surface-2)] p-3 text-center">
                  <div className="text-xl font-black text-[var(--ui-text)]">{audit.items}</div>
                  <div className="mt-1 text-[11px] font-bold text-[var(--ui-muted)]">Productos</div>
                </div>
              </div>

              <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[var(--ui-muted)]">Con personalizaciones</span>
                  <span className="font-black text-[var(--ui-text)]">{audit.personalizedCount}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[var(--ui-muted)]">Sin imagen</span>
                  <span className={audit.missingImages > 0 ? "font-black text-amber-700" : "font-black text-emerald-700"}>
                    {audit.missingImages}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[var(--ui-muted)]">Sin descripción</span>
                  <span className={audit.missingDescriptions > 0 ? "font-black text-amber-700" : "font-black text-emerald-700"}>
                    {audit.missingDescriptions}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[var(--ui-muted)]">Con reglas de programación detectadas</span>
                  <span className="font-black text-[var(--ui-text)]">{audit.scheduledHints}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="ui-panel space-y-4">
        <div>
          <div className="ui-h3">Flujo recomendado para cualquier persona nueva</div>
          <p className="ui-caption">
            Este será el orden que usaremos para simplificar VISO en las siguientes fases.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              step: "1",
              title: "Crear categorías",
              text: "Define familias permanentes como Cafés, Tortas o Entremets.",
              href: "/commercial-categories",
            },
            {
              step: "2",
              title: "Crear colecciones",
              text: "Agrupa categorías para menú principal, regalos o temporadas.",
              href: "/commercial-collections",
            },
            {
              step: "3",
              title: "Crear productos",
              text: "Selecciona el producto operacional y define cómo lo verá el cliente.",
              href: "/menu/new",
            },
            {
              step: "4",
              title: "Revisar y ordenar",
              text: "Valida imágenes, precios, descripciones y orden final del menú.",
              href: "/menu",
            },
          ].map((step) => (
            <Link key={step.step} href={step.href} className="rounded-2xl border border-[var(--ui-border)] bg-white p-4 transition hover:border-[var(--ui-brand)] hover:shadow-sm">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--ui-brand)] text-sm font-black text-white">
                {step.step}
              </div>
              <div className="mt-3 text-base font-black text-[var(--ui-text)]">{step.title}</div>
              <p className="mt-1 text-sm leading-5 text-[var(--ui-muted)]">{step.text}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
