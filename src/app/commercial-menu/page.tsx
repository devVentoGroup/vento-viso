import Link from "next/link";

import { PageHeader } from "@/components/vento/standard/page-header";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverNowMs } from "@/lib/time/server";

export const dynamic = "force-dynamic";

type CatalogItemRow = {
  id: string;
  description: string | null;
  image_url: string | null;
  price_amount: number | string | null;
  is_active: boolean | null;
  metadata: Record<string, unknown> | null;
};

type CollectionRow = {
  id: string;
  site_id: string;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean | null;
};

type ItemCollectionRow = {
  catalog_item_id: string;
  is_active: boolean | null;
  commercial_collection?: CollectionRow | CollectionRow[] | null;
};

const sections = [
  {
    title: "Productos",
    description: "Crea y administra lo que vendes. Aquí defines nombre, precio, imagen, disponibilidad, personalización y en qué menús aparece.",
    href: "/menu",
    action: "Administrar productos",
    badge: "Lo que vendes",
  },
  {
    title: "Secciones",
    description: "Organiza los productos en familias permanentes como Cafés, Tortas, Entremets, Bebidas o Desayunos.",
    href: "/commercial-categories",
    action: "Administrar secciones",
    badge: "Cómo se agrupan",
  },
  {
    title: "Menús y temporadas",
    description: "Decide dónde aparecen los productos: menú principal, Regalos, campañas, fechas especiales o colecciones temporales.",
    href: "/commercial-collections/overview",
    action: "Administrar menús",
    badge: "Dónde aparecen",
  },
  {
    title: "Disponibilidad",
    description: "Define qué productos están disponibles inmediatamente y cuáles requieren una anticipación mínima antes de poder pedirse.",
    href: "/commercial-availability",
    action: "Configurar anticipación",
    badge: "Cuándo puede pedirse",
  },
  {
    title: "Revisión",
    description: "Consulta productos incompletos o configuraciones pendientes. Esta es una herramienta de control, no el flujo principal.",
    href: "/commercial-audit",
    action: "Revisar configuración",
    badge: "Control de calidad",
  },
];

function oneCollection(value: CollectionRow | CollectionRow[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function isVisibleNow(collection: CollectionRow, now: number) {
  const startsAt = collection.starts_at ? Date.parse(collection.starts_at) : Number.NEGATIVE_INFINITY;
  const endsAt = collection.ends_at ? Date.parse(collection.ends_at) : Number.POSITIVE_INFINITY;
  return startsAt <= now && endsAt > now;
}

function isCanonicalItem(item: CatalogItemRow) {
  return (
    item.metadata?.source_app === "viso" &&
    item.metadata?.source_module === "menu_comercial"
  );
}

function hasText(value: string | null | undefined) {
  return Boolean(value && value.trim());
}

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percentage(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

export default async function CommercialMenuWorkspacePage() {
  await requireAppAccess({ appId: "viso", returnTo: "/commercial-menu" });

  const supabase = createAdminClient();
  const [
    { data: satellitesRaw, error: satellitesError },
    { data: itemsRaw, error: itemsError },
    { data: relationsRaw, error: relationsError },
  ] = await Promise.all([
    supabase
      .schema("pass")
      .from("pass_satellites")
      .select("site_id,is_active")
      .not("site_id", "is", null),
    supabase
      .schema("pass")
      .from("catalog_items")
      .select("id,description,image_url,price_amount,is_active,metadata"),
    supabase
      .schema("pass")
      .from("catalog_item_collections")
      .select(
        "catalog_item_id,is_active,commercial_collection:commercial_collections(id,site_id,starts_at,ends_at,is_active)",
      ),
  ]);

  const activeSiteIds = new Set(
    ((satellitesRaw ?? []) as { site_id: string; is_active: boolean | null }[])
      .filter((row) => row.is_active !== false)
      .map((row) => row.site_id),
  );
  const activeItems = ((itemsRaw ?? []) as CatalogItemRow[]).filter(
    (item) => item.is_active !== false && isCanonicalItem(item),
  );
  const activeItemIds = new Set(activeItems.map((item) => item.id));
  const now = serverNowMs();
  const structuralItemIds = new Set<string>();
  const visibleItemIds = new Set<string>();

  for (const relation of (relationsRaw ?? []) as ItemCollectionRow[]) {
    const collection = oneCollection(relation.commercial_collection);
    if (
      relation.is_active === false ||
      !activeItemIds.has(relation.catalog_item_id) ||
      !collection ||
      collection.is_active === false
    ) {
      continue;
    }

    structuralItemIds.add(relation.catalog_item_id);
    if (isVisibleNow(collection, now)) {
      visibleItemIds.add(relation.catalog_item_id);
    }
  }

  const visibleItems = activeItems.filter((item) => visibleItemIds.has(item.id));
  const readyVisibleItems = visibleItems.filter(
    (item) =>
      numberValue(item.price_amount) > 0 &&
      hasText(item.image_url) &&
      hasText(item.description),
  );
  const hasMetricLoadError = Boolean(satellitesError || itemsError || relationsError);
  const menuCoverage = percentage(structuralItemIds.size, activeItems.length);
  const contentReadiness = percentage(readyVisibleItems.length, visibleItems.length);

  const metrics = [
    {
      label: "Sedes comerciales activas",
      value: String(activeSiteIds.size),
      detail: "Negocios habilitados para publicar catálogo en Vento Pass.",
      href: "/businesses",
      action: "Revisar negocios",
    },
    {
      label: "Productos visibles",
      value: String(visibleItems.length),
      detail: `${activeItems.length} productos comerciales están activos en VISO.`,
      href: "/menu",
      action: "Abrir productos",
    },
    {
      label: "Cobertura de menú",
      value: `${menuCoverage}%`,
      detail: `${structuralItemIds.size} de ${activeItems.length} productos activos pertenecen a un menú válido.`,
      href: "/commercial-audit",
      action: "Revisar faltantes",
    },
    {
      label: "Contenido listo",
      value: `${contentReadiness}%`,
      detail: `${readyVisibleItems.length} de ${visibleItems.length} productos visibles tienen precio, imagen y descripción.`,
      href: "/commercial-audit",
      action: "Completar catálogo",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Menú comercial"
        subtitle="Administra el catálogo de Vento Pass siguiendo decisiones de negocio, sin tener que entender la estructura técnica del sistema."
        actions={
          <Link href="/menu/new" className="ui-btn ui-btn--brand">
            Crear producto
          </Link>
        }
      />

      <section className="rounded-3xl border border-[var(--ui-border)] bg-gradient-to-br from-white to-[var(--ui-surface-2)] p-5 shadow-sm sm:p-6">
        <div className="max-w-3xl">
          <div className="text-sm font-black uppercase tracking-[0.16em] text-[var(--ui-brand)]">
            Flujo recomendado
          </div>
          <h2 className="mt-2 text-2xl font-black text-[var(--ui-text)]">
            Primero crea lo que vendes; después decide dónde mostrarlo.
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--ui-muted)]">
            Un producto tiene una sección principal y puede aparecer en varios menús o temporadas. Desactivar una temporada no desactiva el producto.
          </p>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {[
            ["1", "Producto", "Qué compra el cliente"],
            ["2", "Sección", "Qué tipo de producto es"],
            ["3", "Menús", "Dónde debe aparecer"],
          ].map(([step, title, text]) => (
            <div key={step} className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--ui-brand)] text-sm font-black text-white">
                {step}
              </div>
              <div className="mt-3 text-base font-black text-[var(--ui-text)]">{title}</div>
              <div className="mt-1 text-sm text-[var(--ui-muted)]">{text}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group rounded-3xl border border-[var(--ui-border)] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--ui-brand)] hover:shadow-md"
          >
            <div className="inline-flex rounded-full bg-[var(--ui-surface-2)] px-3 py-1 text-xs font-black text-[var(--ui-muted)]">
              {section.badge}
            </div>
            <h2 className="mt-4 text-xl font-black text-[var(--ui-text)]">{section.title}</h2>
            <p className="mt-2 min-h-16 text-sm leading-6 text-[var(--ui-muted)]">
              {section.description}
            </p>
            <div className="mt-4 text-sm font-black text-[var(--ui-brand)]">
              {section.action} →
            </div>
          </Link>
        ))}
      </section>

      <section className="ui-panel space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="ui-h3">Estado operativo del catálogo</div>
            <p className="ui-caption">
              Indicadores calculados en tiempo real con la configuración activa de Vento Pass.
            </p>
          </div>
          <Link href="/commercial-audit" className="ui-btn ui-btn--ghost ui-btn--sm">
            Ver diagnóstico completo
          </Link>
        </div>

        {hasMetricLoadError ? (
          <div className="ui-alert ui-alert--warning">
            Algunas métricas no pudieron cargarse completamente. Revisa el diagnóstico comercial antes de tomar decisiones.
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
              <div className="text-xs font-black uppercase tracking-wide text-[var(--ui-muted)]">
                {metric.label}
              </div>
              <div className="mt-2 text-3xl font-black text-[var(--ui-text)]">{metric.value}</div>
              <p className="mt-2 min-h-10 text-sm leading-5 text-[var(--ui-muted)]">{metric.detail}</p>
              <Link href={metric.href} className="mt-3 inline-flex text-sm font-black text-[var(--ui-brand)]">
                {metric.action} →
              </Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
