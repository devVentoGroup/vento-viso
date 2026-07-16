import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CommercialCollectionCategoryOrderEditor } from "@/components/viso/commercial-collection-category-order-editor";
import { PageHeader } from "@/components/vento/standard/page-header";
import { CommercialCollectionHeroField } from "@/components/viso/commercial-collection-hero-field";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type SiteRow = {
  id: string;
  name: string | null;
  code: string | null;
  is_active: boolean | null;
  is_public?: boolean | null;
};

type BusinessRow = {
  id: string;
  code: string | null;
  name: string | null;
  is_active: boolean | null;
  site_id: string | null;
};

type CollectionRow = {
  id: string;
  site_id: string;
  code: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  kind: string;
  hero_image_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  sort_order: number | null;
  is_active: boolean | null;
};

type CategoryRow = {
  id: string;
  site_id: string;
  code: string;
  name: string;
  description: string | null;
  sort_order: number | null;
  is_active: boolean | null;
};

type CollectionCategoryRow = {
  id: string;
  collection_id: string;
  commercial_category_id: string;
  sort_order: number | null;
  is_active: boolean | null;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function asBool(value: FormDataEntryValue | null) {
  return value === "on" || value === "true";
}

function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function siteLabel(site: SiteRow | undefined) {
  return site?.name ?? site?.code ?? "Sin sede";
}

function nullableText(value: FormDataEntryValue | null) {
  const text = asText(value);
  return text || null;
}

function toDateTimeLocalValue(value: string | null | undefined) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (input: number) => String(input).padStart(2, "0");

  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
  ].join("");
}

function collectionKindLabel(kind: string | null | undefined) {
  switch (kind) {
    case "main":
      return "Menu principal";
    case "seasonal":
      return "Temporada";
    case "special":
      return "Menu especial";
    case "campaign":
      return "Campana";
    case "event":
      return "Evento";
    default:
      return kind || "Coleccion";
  }
}

function commercialCollectionsPath(siteId?: string | null, status?: "ok" | "error", message?: string, collectionId?: string | null) {
  const params = new URLSearchParams();
  const cleanSiteId = String(siteId ?? "").trim();

  if (cleanSiteId) params.set("site", cleanSiteId);
  const cleanCollectionId = String(collectionId ?? "").trim();
  if (cleanCollectionId) params.set("collection", cleanCollectionId);
  if (status && message) params.set(status, message);

  const query = params.toString();
  return query ? `/commercial-collections?${query}` : "/commercial-collections";
}

function pathWithSite(path: string, siteId?: string | null) {
  const cleanSiteId = String(siteId ?? "").trim();
  if (!cleanSiteId) return path;

  const params = new URLSearchParams();
  params.set("site", cleanSiteId);
  return `${path}?${params.toString()}`;
}

async function saveCollection(formData: FormData) {
  "use server";

  const supabase = createAdminClient();

  const id = asText(formData.get("id"));
  const returnCollectionId = asText(formData.get("return_collection_id"));
  const safeReturnCollectionId = id && returnCollectionId === id ? id : "";
  const siteId = asText(formData.get("site_id"));
  const name = asText(formData.get("name"));
  const code = slugify(name);
  const kind = asText(formData.get("kind")) || "seasonal";

  if (!siteId || !name || !code) {
    redirect(commercialCollectionsPath(siteId, "error", "Sede y nombre son obligatorios.", safeReturnCollectionId));
  }

  let sortOrder = 0;

  if (id) {
    const { data: existing } = await supabase
      .schema("pass")
      .from("commercial_collections")
      .select("sort_order")
      .eq("id", id)
      .maybeSingle();

    sortOrder = Number(existing?.sort_order ?? 0);
  } else {
    const { data: latest } = await supabase
      .schema("pass")
      .from("commercial_collections")
      .select("sort_order")
      .eq("site_id", siteId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    sortOrder = Number(latest?.sort_order ?? -10) + 10;
  }

  const payload = {
    site_id: siteId,
    code,
    name,
    subtitle: nullableText(formData.get("subtitle")),
    description: nullableText(formData.get("description")),
    kind,
    hero_image_url: nullableText(formData.get("hero_image_url")),
    starts_at: nullableText(formData.get("starts_at")),
    ends_at: nullableText(formData.get("ends_at")),
    sort_order: sortOrder,
    is_active: asBool(formData.get("is_active")),
  };

  const { error } = id
    ? await supabase
      .schema("pass")
      .from("commercial_collections")
      .update(payload)
      .eq("id", id)
    : await supabase
      .schema("pass")
      .from("commercial_collections")
      .upsert(payload, { onConflict: "site_id,code" });

  if (error) {
    redirect(commercialCollectionsPath(siteId, "error", error.message, safeReturnCollectionId));
  }

  revalidatePath("/commercial-collections");
  revalidatePath("/menu");
  redirect(commercialCollectionsPath(siteId, "ok", "Coleccion guardada.", safeReturnCollectionId));
}

async function saveCollectionCategories(formData: FormData) {
  "use server";

  const supabase = createAdminClient();

  const collectionId = asText(formData.get("collection_id"));
  const returnCollectionId = asText(formData.get("return_collection_id"));
  const selectedCategoryIds = Array.from(
    new Set(
      formData
        .getAll("category_ids")
        .map((value) => asText(value))
        .filter(Boolean),
    ),
  );

  if (!collectionId) {
    redirect(commercialCollectionsPath(null, "error", "Coleccion invalida."));
  }

  const { data: collection, error: collectionError } = await supabase
    .schema("pass")
    .from("commercial_collections")
    .select("id,site_id")
    .eq("id", collectionId)
    .maybeSingle();

  const redirectSiteId = collection?.site_id ?? null;

  if (collectionError || !collection) {
    redirect(
      commercialCollectionsPath(
        redirectSiteId,
        "error",
        collectionError?.message || "La coleccion no existe.",
      ),
    );
  }
  const safeReturnCollectionId = returnCollectionId === collection.id ? collection.id : "";

  if (selectedCategoryIds.length > 0) {
    const { data: selectedCategories, error: categoriesError } = await supabase
      .schema("pass")
      .from("commercial_categories")
      .select("id,site_id")
      .in("id", selectedCategoryIds);

    if (categoriesError) {
      redirect(commercialCollectionsPath(collection.site_id, "error", categoriesError.message, safeReturnCollectionId));
    }

    const validCategoryIds = new Set(
      ((selectedCategories ?? []) as { id: string; site_id: string }[])
        .filter((category) => category.site_id === collection.site_id)
        .map((category) => category.id),
    );

    const hasInvalidCategory = selectedCategoryIds.some(
      (categoryId) => !validCategoryIds.has(categoryId),
    );

    if (hasInvalidCategory) {
      redirect(
        commercialCollectionsPath(
          collection.site_id,
          "error",
          "Una o mas categorias no pertenecen a la sede de la coleccion.", safeReturnCollectionId,
        ),
      );
    }
  }

  const { data: existingLinksRaw, error: existingLinksError } = await supabase
    .schema("pass")
    .from("commercial_collection_categories")
    .select("commercial_category_id,sort_order,is_active")
    .eq("collection_id", collectionId)
    .order("sort_order", { ascending: true });

  if (existingLinksError) {
    redirect(commercialCollectionsPath(collection.site_id, "error", existingLinksError.message, safeReturnCollectionId));
  }

  const existingOrderByCategoryId = new Map<string, number>();

  for (const link of (existingLinksRaw ?? []) as {
    commercial_category_id: string;
    sort_order: number | null;
    is_active: boolean | null;
  }[]) {
    if (link.is_active === false) continue;

    const categoryId = String(link.commercial_category_id ?? "").trim();
    const sortOrder = Number(link.sort_order ?? Number.MAX_SAFE_INTEGER);

    if (categoryId && Number.isFinite(sortOrder)) {
      existingOrderByCategoryId.set(categoryId, sortOrder);
    }
  }

  const fallbackPositionByCategoryId = new Map(
    selectedCategoryIds.map((categoryId, index) => [categoryId, index]),
  );

  const orderedCategoryIds = [...selectedCategoryIds].sort((a, b) => {
    const aOrder = existingOrderByCategoryId.get(a);
    const bOrder = existingOrderByCategoryId.get(b);

    if (aOrder != null && bOrder != null && aOrder !== bOrder) {
      return aOrder - bOrder;
    }

    if (aOrder != null && bOrder == null) return -1;
    if (aOrder == null && bOrder != null) return 1;

    return (fallbackPositionByCategoryId.get(a) ?? 0) - (fallbackPositionByCategoryId.get(b) ?? 0);
  });

  const { error: deactivateError } = await supabase
    .schema("pass")
    .from("commercial_collection_categories")
    .update({ is_active: false })
    .eq("collection_id", collectionId);

  if (deactivateError) {
    redirect(commercialCollectionsPath(collection.site_id, "error", deactivateError.message, safeReturnCollectionId));
  }

  if (orderedCategoryIds.length > 0) {
    const payload = orderedCategoryIds.map((categoryId, index) => ({
      collection_id: collectionId,
      commercial_category_id: categoryId,
      sort_order: index * 10,
      is_active: true,
    }));

    const { error: upsertError } = await supabase
      .schema("pass")
      .from("commercial_collection_categories")
      .upsert(payload, { onConflict: "collection_id,commercial_category_id" });

    if (upsertError) {
      redirect(commercialCollectionsPath(collection.site_id, "error", upsertError.message, safeReturnCollectionId));
    }
  }

  revalidatePath("/commercial-collections");
  revalidatePath("/menu");
  redirect(commercialCollectionsPath(collection.site_id, "ok", "Secciones de coleccion guardadas.", safeReturnCollectionId));
}

async function saveCollectionCategoryOrder(collectionId: string, orderedLinkIds: string[]) {
  "use server";

  const supabase = createAdminClient();

  const cleanCollectionId = String(collectionId ?? "").trim();
  const cleanOrderedLinkIds = Array.from(
    new Set(
      (orderedLinkIds ?? [])
        .map((linkId) => String(linkId ?? "").trim())
        .filter(Boolean),
    ),
  );

  if (!cleanCollectionId || cleanOrderedLinkIds.length === 0) {
    return {
      ok: false,
      error: "Orden inválido.",
    };
  }

  const { data: activeLinksRaw, error: activeLinksError } = await supabase
    .schema("pass")
    .from("commercial_collection_categories")
    .select("id,collection_id,commercial_category_id,is_active")
    .eq("collection_id", cleanCollectionId)
    .eq("is_active", true);

  if (activeLinksError) {
    return {
      ok: false,
      error: activeLinksError.message,
    };
  }

  const activeLinks = (activeLinksRaw ?? []) as {
    id: string;
    collection_id: string;
    commercial_category_id: string;
    is_active: boolean | null;
  }[];

  const activeLinkById = new Map(activeLinks.map((link) => [link.id, link]));

  const hasInvalidLink = cleanOrderedLinkIds.some((linkId) => !activeLinkById.has(linkId));

  if (hasInvalidLink) {
    return {
      ok: false,
      error: "Una sección no pertenece a esta colección o ya no está activa.",
    };
  }

  const orderedLinks = cleanOrderedLinkIds
    .map((linkId) => activeLinkById.get(linkId))
    .filter((link): link is {
      id: string;
      collection_id: string;
      commercial_category_id: string;
      is_active: boolean | null;
    } => Boolean(link));

  const linkUpdates = await Promise.all(
    orderedLinks.map((link, index) =>
      supabase
        .schema("pass")
        .from("commercial_collection_categories")
        .update({ sort_order: index * 10 })
        .eq("id", link.id),
    ),
  );

  const failedLinkUpdate = linkUpdates.find((result) => result.error);

  if (failedLinkUpdate?.error) {
    return {
      ok: false,
      error: failedLinkUpdate.error.message,
    };
  }

  revalidatePath("/commercial-collections");
  revalidatePath("/menu");

  return {
    ok: true,
  };
}

async function deleteCollection(formData: FormData) {
  "use server";

  const supabase = createAdminClient();

  const id = asText(formData.get("id"));
  const returnCollectionId = asText(formData.get("return_collection_id"));

  if (!id) {
    redirect(commercialCollectionsPath(null, "error", "Coleccion invalida."));
  }

  const { data: collectionForRedirect, error: collectionForRedirectError } = await supabase
    .schema("pass")
    .from("commercial_collections")
    .select("id,site_id")
    .eq("id", id)
    .maybeSingle();

  const redirectSiteId = collectionForRedirect?.site_id ?? null;
  const safeReturnCollectionId = returnCollectionId === id ? id : "";

  if (collectionForRedirectError || !collectionForRedirect) {
    redirect(
      commercialCollectionsPath(
        redirectSiteId,
        "error",
        collectionForRedirectError?.message || "La coleccion no existe.", safeReturnCollectionId,
      ),
    );
  }

  const { count: relationCount, error: relationsError } = await supabase
    .schema("pass")
    .from("catalog_item_collections")
    .select("catalog_item_id", { count: "exact", head: true })
    .eq("commercial_collection_id", id);

  if (relationsError) {
    redirect(
      commercialCollectionsPath(
        redirectSiteId,
        "error",
        relationsError.message ||
        "No se pudo validar si la coleccion tiene items asignados.", safeReturnCollectionId,
      ),
    );
  }

  if ((relationCount ?? 0) > 0) {
    redirect(
      commercialCollectionsPath(
        redirectSiteId,
        "error",
        "No puedes eliminar una coleccion con items comerciales asignados. Desactivala o mueve esos productos primero.", safeReturnCollectionId,
      ),
    );
  }

  const { error: linksError } = await supabase
    .schema("pass")
    .from("commercial_collection_categories")
    .delete()
    .eq("collection_id", id);

  if (linksError) {
    redirect(commercialCollectionsPath(redirectSiteId, "error", linksError.message, safeReturnCollectionId));
  }

  const { error } = await supabase
    .schema("pass")
    .from("commercial_collections")
    .delete()
    .eq("id", id);

  if (error) {
    redirect(commercialCollectionsPath(redirectSiteId, "error", error.message, safeReturnCollectionId));
  }

  revalidatePath("/commercial-collections");
  revalidatePath("/menu");
  redirect(commercialCollectionsPath(redirectSiteId, "ok", "Coleccion eliminada."));
}

export default async function CommercialCollectionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ ok?: string; error?: string; site?: string; collection?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const requestedSiteId = safeDecode(sp.site);
  const requestedCollectionId = safeDecode(sp.collection);
  const okMsg = safeDecode(sp.ok);
  const errorMsg = safeDecode(sp.error);

  await requireAppAccess({
    appId: "viso",
    returnTo: commercialCollectionsPath(requestedSiteId),
  });

  const supabase = createAdminClient();

  const { data: businessesRaw, error: businessesError } = await supabase
    .schema("pass")
    .from("pass_satellites")
    .select("id,code,name,is_active,site_id")
    .eq("is_active", true)
    .not("site_id", "is", null)
    .order("sort_order", { ascending: true });

  const businesses = (businessesRaw ?? []) as BusinessRow[];

  const businessSiteIds = Array.from(
    new Set(
      businesses
        .map((business) => business.site_id)
        .filter((siteId): siteId is string => Boolean(siteId)),
    ),
  );

  const [
    { data: sitesRaw, error: sitesError },
    { data: collectionsRaw, error: collectionsError },
    { data: categoriesRaw, error: categoriesError },
    { data: linksRaw, error: linksError },
  ] =
    businessSiteIds.length > 0
      ? await Promise.all([
        supabase
          .from("sites")
          .select("id,name,code,is_active,is_public")
          .eq("is_active", true)
          .in("id", businessSiteIds),
        supabase
          .schema("pass")
          .from("commercial_collections")
          .select("id,site_id,code,name,subtitle,description,kind,hero_image_url,starts_at,ends_at,sort_order,is_active")
          .in("site_id", businessSiteIds)
          .order("site_id", { ascending: true })
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        supabase
          .schema("pass")
          .from("commercial_categories")
          .select("id,site_id,code,name,description,sort_order,is_active")
          .in("site_id", businessSiteIds)
          .eq("is_active", true)
          .order("site_id", { ascending: true })
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        supabase
          .schema("pass")
          .from("commercial_collection_categories")
          .select("id,collection_id,commercial_category_id,sort_order,is_active")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
      ])
      : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ];

  const siteOrderById = new Map(
    businessSiteIds.map((siteId, index) => [siteId, index]),
  );

  const sites = ((sitesRaw ?? []) as SiteRow[]).sort(
    (a, b) =>
      (siteOrderById.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (siteOrderById.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );

  const selectedSiteId = sites.some((site) => site.id === requestedSiteId)
    ? requestedSiteId
    : sites[0]?.id ?? "";
  const selectedSite = sites.find((site) => site.id === selectedSiteId);

  const collections = (collectionsRaw ?? []) as CollectionRow[];
  const categories = (categoriesRaw ?? []) as CategoryRow[];
  const links = (linksRaw ?? []) as CollectionCategoryRow[];

  const collectionsBySite = new Map<string, CollectionRow[]>();
  for (const collection of collections) {
    if (!collectionsBySite.has(collection.site_id)) collectionsBySite.set(collection.site_id, []);
    collectionsBySite.get(collection.site_id)!.push(collection);
  }

  const categoriesBySite = new Map<string, CategoryRow[]>();
  const categoriesById = new Map<string, CategoryRow>();

  for (const category of categories) {
    categoriesById.set(category.id, category);
    if (!categoriesBySite.has(category.site_id)) categoriesBySite.set(category.site_id, []);
    categoriesBySite.get(category.site_id)!.push(category);
  }

  const categoryLinksByCollection = new Map<string, CollectionCategoryRow[]>();

  for (const link of links) {
    if (link.is_active === false) continue;

    if (!categoryLinksByCollection.has(link.collection_id)) {
      categoryLinksByCollection.set(link.collection_id, []);
    }

    categoryLinksByCollection.get(link.collection_id)!.push(link);
  }

  for (const collectionLinks of categoryLinksByCollection.values()) {
    collectionLinks.sort((a, b) => {
      const aOrder = Number(a.sort_order ?? Number.MAX_SAFE_INTEGER);
      const bOrder = Number(b.sort_order ?? Number.MAX_SAFE_INTEGER);

      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.commercial_category_id.localeCompare(b.commercial_category_id);
    });
  }

  const selectedSiteCollections = selectedSiteId ? collectionsBySite.get(selectedSiteId) ?? [] : [];
  const focusedCollection = selectedSiteCollections.find((collection) => collection.id === requestedCollectionId) ?? null;
  const isFocusedMode = Boolean(focusedCollection);
  const visibleCollections = focusedCollection ? [focusedCollection] : selectedSiteCollections;
  const hasInvalidFocusedCollection = Boolean(requestedCollectionId) && !focusedCollection;
  const selectedSiteCategories = selectedSiteId ? categoriesBySite.get(selectedSiteId) ?? [] : [];

  const effectiveError =
    errorMsg ||
    businessesError?.message ||
    sitesError?.message ||
    collectionsError?.message ||
    categoriesError?.message ||
    linksError?.message ||
    "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Colecciones comerciales"
        subtitle="Agrupa productos publicados en Vento Pass por menu principal, temporadas, campanas o menus especiales."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={pathWithSite("/commercial-categories", selectedSiteId)} className="ui-btn ui-btn--ghost">
              Categorias comerciales
            </Link>
            <Link href={pathWithSite("/menu", selectedSiteId)} className="ui-btn ui-btn--ghost">
              Volver al menu
            </Link>
          </div>
        }
      />

      {effectiveError ? <div className="ui-alert ui-alert--error">{effectiveError}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}

      {sites.length > 0 ? (
        <div className="ui-panel space-y-3">
          <div>
            <h2 className="ui-h3">Sede comercial</h2>
            <p className="ui-caption">Solo aparecen sedes habilitadas para venta.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {sites.map((site) => {
              const isSelected = site.id === selectedSiteId;

              return (
                <Link
                  key={site.id}
                  href={commercialCollectionsPath(site.id)}
                  className={isSelected ? "ui-chip ui-chip--brand" : "ui-chip"}
                >
                  {siteLabel(site)}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}

      {sites.length === 0 ? (
        <div className="ui-panel">
          <div className="ui-empty">No hay negocios activos con sede asociada.</div>
        </div>
      ) : (
        <>
          {!isFocusedMode ? <div className="ui-panel space-y-4">
            <h2 className="ui-h3">Crear coleccion</h2>
            <form action={saveCollection} className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr_auto]">
              <input type="hidden" name="site_id" value={selectedSiteId} />
              <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 py-3">
                <div className="ui-label">Sede activa</div>
                <div className="text-sm font-black text-[var(--ui-text)]">
                  {siteLabel(selectedSite)}
                </div>
              </div>

              <label className="space-y-2">
                <span className="ui-label">Tipo</span>
                <select name="kind" className="ui-input" defaultValue="seasonal">
                  <option value="main">Menu principal</option>
                  <option value="seasonal">Temporada</option>
                  <option value="special">Menu especial</option>
                  <option value="campaign">Campana</option>
                  <option value="event">Evento</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="ui-label">Nombre</span>
                <input name="name" className="ui-input" placeholder="Menu especial de mayo" required />
              </label>

              <div className="flex items-end">
                <input type="hidden" name="is_active" value="on" />
                <button type="submit" className="ui-btn ui-btn--brand w-full">
                  Crear
                </button>
              </div>

              <label className="space-y-2 xl:col-span-2">
                <span className="ui-label">Subtitulo</span>
                <input name="subtitle" className="ui-input" placeholder="Coleccion Madres 2026" />
              </label>

              <CommercialCollectionHeroField ownerId={`new-${selectedSiteId}`} initialUrl="" className="xl:col-span-2" />
            </form>
          </div> : null}

          {hasInvalidFocusedCollection ? (
            <div className="ui-alert ui-alert--error">La colección solicitada no existe o no pertenece a esta sede.</div>
          ) : null}

          {isFocusedMode ? (
            <div className="ui-panel flex flex-wrap items-center justify-between gap-3">
              <div><div className="ui-caption">Editando una colección</div><div className="text-lg font-black text-[var(--ui-text)]">{focusedCollection?.name}</div></div>
              <div className="flex gap-2"><Link href={`/commercial-collections/overview?site=${encodeURIComponent(selectedSiteId)}`} className="ui-btn ui-btn--ghost">Volver a menús y temporadas</Link><Link href={commercialCollectionsPath(selectedSiteId)} className="ui-btn ui-btn--ghost">Ver todas</Link></div>
            </div>
          ) : null}

          {!selectedSite ? (
            <div className="ui-panel">
              <div className="ui-empty">Selecciona una sede comercial.</div>
            </div>
          ) : (
            <div key={selectedSite.id} className="ui-panel space-y-4">
              <h2 className="text-lg font-semibold text-[var(--ui-text)]">
                {siteLabel(selectedSite)}
                <span className="ml-2 text-sm font-normal text-[var(--ui-muted)]">
                  ({visibleCollections.length} visibles de {selectedSiteCollections.length} {selectedSiteCollections.length === 1 ? "coleccion" : "colecciones"})
                </span>
              </h2>

              {selectedSiteCategories.length === 0 ? (
                <div className="ui-alert ui-alert--warning">
                  Esta sede todavia no tiene categorias comerciales activas. Crea categorias antes de asignar secciones a una coleccion.
                </div>
              ) : null}

              {visibleCollections.length === 0 ? (
                <div className="ui-empty">Esta sede no tiene colecciones comerciales.</div>
              ) : (
                <div className="grid gap-4">
                  {visibleCollections.map((collection) => {
                    const assignedCategoryLinks = categoryLinksByCollection.get(collection.id) ?? [];
                    const assignedCategoryIds = new Set(
                      assignedCategoryLinks.map((link) => link.commercial_category_id),
                    );
                    const assignedCategories = assignedCategoryLinks
                      .map((link) => ({
                        link,
                        category: categoriesById.get(link.commercial_category_id),
                      }))
                      .filter(
                        (entry): entry is { link: CollectionCategoryRow; category: CategoryRow } =>
                          Boolean(entry.category),
                      );

                    return (
                      <article
                        key={collection.id}
                        className="rounded-3xl border border-[var(--ui-border)] bg-white p-4 shadow-sm"
                      >
                        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.7fr)]">
                          <div className="space-y-4">
                            <form
                              id={`collection-${collection.id}`}
                              action={saveCollection}
                              className="grid gap-3 md:grid-cols-2"
                            >
                              <input type="hidden" name="id" value={collection.id} />
                              <input type="hidden" name="site_id" value={collection.site_id} />
                              <input type="hidden" name="return_collection_id" value={isFocusedMode ? collection.id : ""} />

                              <label className="space-y-1">
                                <span className="ui-label">Nombre</span>
                                <input
                                  name="name"
                                  className="ui-input h-10"
                                  defaultValue={collection.name}
                                  required
                                />
                              </label>

                              <label className="space-y-1">
                                <span className="ui-label">Subtítulo</span>
                                <input
                                  name="subtitle"
                                  className="ui-input h-10"
                                  defaultValue={collection.subtitle ?? ""}
                                  placeholder="Subtítulo opcional"
                                />
                              </label>

                              <label className="space-y-1 md:col-span-2">
                                <span className="ui-label">Descripción</span>
                                <input
                                  name="description"
                                  className="ui-input h-10"
                                  defaultValue={collection.description ?? ""}
                                  placeholder="Descripción opcional"
                                />
                              </label>

                              <CommercialCollectionHeroField initialUrl={collection.hero_image_url} ownerId={collection.id} className="md:col-span-2" />
                            </form>

                            <details className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
                              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ui-muted)]">
                                Categorías de esta colección
                              </summary>

                              <form action={saveCollectionCategories} className="mt-3 space-y-3">
                                <input type="hidden" name="collection_id" value={collection.id} />
                                <input type="hidden" name="return_collection_id" value={isFocusedMode ? collection.id : ""} />

                                {selectedSiteCategories.length === 0 ? (
                                  <div className="ui-empty">No hay categorías disponibles para esta sede.</div>
                                ) : (
                                  <div className="grid max-h-56 gap-2 overflow-auto pr-2 sm:grid-cols-2 xl:grid-cols-3">
                                    {selectedSiteCategories.map((category) => (
                                      <label key={category.id} className="flex items-center gap-2 text-sm">
                                        <input
                                          type="checkbox"
                                          name="category_ids"
                                          value={category.id}
                                          defaultChecked={assignedCategoryIds.has(category.id)}
                                        />
                                        {category.name}
                                      </label>
                                    ))}
                                  </div>
                                )}

                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0 text-xs text-[var(--ui-muted)]">
                                    {assignedCategories.length > 0
                                      ? assignedCategories.map(({ category }) => category.name).join(" · ")
                                      : "Sin secciones asignadas"}
                                  </div>

                                  <button type="submit" className="ui-btn ui-btn--ghost ui-btn--sm">
                                    Guardar categorías
                                  </button>
                                </div>
                              </form>
                            </details>

                            <CommercialCollectionCategoryOrderEditor
                              collectionId={collection.id}
                              items={assignedCategories.map(({ link, category }) => ({
                                linkId: link.id,
                                categoryId: category.id,
                                name: category.name,
                                description: category.description,
                              }))}
                              saveOrderAction={saveCollectionCategoryOrder}
                            />
                          </div>

                          <aside className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
                            <div className="grid gap-3">
                              <label className="space-y-1">
                                <span className="ui-label">Tipo</span>
                                <select
                                  form={`collection-${collection.id}`}
                                  name="kind"
                                  className="ui-input h-10"
                                  defaultValue={collection.kind || "seasonal"}
                                >
                                  <option value="main">Menú principal</option>
                                  <option value="seasonal">Temporada</option>
                                  <option value="special">Menú especial</option>
                                  <option value="campaign">Campaña</option>
                                  <option value="event">Evento</option>
                                </select>
                                <div className="text-xs text-[var(--ui-muted)]">
                                  {collectionKindLabel(collection.kind)}
                                </div>
                              </label>

                              <label className="space-y-1">
                                <span className="ui-label">Desde</span>
                                <input
                                  form={`collection-${collection.id}`}
                                  type="datetime-local"
                                  name="starts_at"
                                  className="ui-input h-10"
                                  defaultValue={toDateTimeLocalValue(collection.starts_at)}
                                />
                              </label>

                              <label className="space-y-1">
                                <span className="ui-label">Hasta</span>
                                <input
                                  form={`collection-${collection.id}`}
                                  type="datetime-local"
                                  name="ends_at"
                                  className="ui-input h-10"
                                  defaultValue={toDateTimeLocalValue(collection.ends_at)}
                                />
                              </label>

                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  form={`collection-${collection.id}`}
                                  type="checkbox"
                                  name="is_active"
                                  defaultChecked={collection.is_active !== false}
                                />
                                Activa
                              </label>

                              <div className="flex flex-wrap justify-end gap-2 pt-2">
                                <button
                                  form={`collection-${collection.id}`}
                                  type="submit"
                                  className="ui-btn ui-btn--ghost ui-btn--sm"
                                >
                                  Guardar
                                </button>

                                <form action={deleteCollection}>
                                  <input type="hidden" name="id" value={collection.id} />
                                  <input type="hidden" name="return_collection_id" value={isFocusedMode ? collection.id : ""} />
                                  <button type="submit" className="ui-btn ui-btn--danger ui-btn--sm">
                                    Eliminar
                                  </button>
                                </form>
                              </div>
                            </div>
                          </aside>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
