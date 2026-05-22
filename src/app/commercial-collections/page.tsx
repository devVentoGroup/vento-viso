import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/vento/standard/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/vento/standard/table";
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

async function saveCollection(formData: FormData) {
  "use server";

  const supabase = createAdminClient();

  const id = asText(formData.get("id"));
  const siteId = asText(formData.get("site_id"));
  const name = asText(formData.get("name"));
  const code = slugify(name);
  const kind = asText(formData.get("kind")) || "seasonal";

  if (!siteId || !name || !code) {
    redirect("/commercial-collections?error=" + encodeURIComponent("Sede y nombre son obligatorios."));
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
    redirect("/commercial-collections?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/commercial-collections");
  revalidatePath("/menu");
  redirect("/commercial-collections?ok=" + encodeURIComponent("Coleccion guardada."));
}

async function saveCollectionCategories(formData: FormData) {
  "use server";

  const supabase = createAdminClient();

  const collectionId = asText(formData.get("collection_id"));
  const selectedCategoryIds = Array.from(
    new Set(
      formData
        .getAll("category_ids")
        .map((value) => asText(value))
        .filter(Boolean),
    ),
  );

  if (!collectionId) {
    redirect("/commercial-collections?error=" + encodeURIComponent("Coleccion invalida."));
  }

  const { data: collection, error: collectionError } = await supabase
    .schema("pass")
    .from("commercial_collections")
    .select("id,site_id")
    .eq("id", collectionId)
    .maybeSingle();

  if (collectionError || !collection) {
    redirect(
      "/commercial-collections?error=" +
        encodeURIComponent(collectionError?.message || "La coleccion no existe."),
    );
  }

  if (selectedCategoryIds.length > 0) {
    const { data: selectedCategories, error: categoriesError } = await supabase
      .schema("pass")
      .from("commercial_categories")
      .select("id,site_id")
      .in("id", selectedCategoryIds);

    if (categoriesError) {
      redirect("/commercial-collections?error=" + encodeURIComponent(categoriesError.message));
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
        "/commercial-collections?error=" +
          encodeURIComponent("Una o mas categorias no pertenecen a la sede de la coleccion."),
      );
    }
  }

  const { error: deactivateError } = await supabase
    .schema("pass")
    .from("commercial_collection_categories")
    .update({ is_active: false })
    .eq("collection_id", collectionId);

  if (deactivateError) {
    redirect("/commercial-collections?error=" + encodeURIComponent(deactivateError.message));
  }

  if (selectedCategoryIds.length > 0) {
    const payload = selectedCategoryIds.map((categoryId, index) => ({
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
      redirect("/commercial-collections?error=" + encodeURIComponent(upsertError.message));
    }
  }

  revalidatePath("/commercial-collections");
  revalidatePath("/menu");
  redirect("/commercial-collections?ok=" + encodeURIComponent("Secciones de coleccion guardadas."));
}

async function deleteCollection(formData: FormData) {
  "use server";

  const supabase = createAdminClient();

  const id = asText(formData.get("id"));

  if (!id) {
    redirect("/commercial-collections?error=" + encodeURIComponent("Coleccion invalida."));
  }

  const [
    { count: canonicalItemsCount, error: canonicalItemsError },
    { count: pricedItemsCount, error: pricedItemsError },
  ] = await Promise.all([
    supabase
      .schema("pass")
      .from("catalog_items")
      .select("id", { count: "exact", head: true })
      .eq("commercial_collection_id", id)
      .eq("metadata->>source_app", "viso")
      .eq("metadata->>source_module", "menu_comercial"),
    supabase
      .schema("pass")
      .from("catalog_items")
      .select("id", { count: "exact", head: true })
      .eq("commercial_collection_id", id)
      .gt("price_amount", 0),
  ]);

  if (canonicalItemsError || pricedItemsError) {
    redirect(
      "/commercial-collections?error=" +
        encodeURIComponent(
          canonicalItemsError?.message ||
            pricedItemsError?.message ||
            "No se pudo validar si la coleccion tiene items asignados.",
        ),
    );
  }

  if ((canonicalItemsCount ?? 0) > 0 || (pricedItemsCount ?? 0) > 0) {
    redirect(
      "/commercial-collections?error=" +
        encodeURIComponent(
          "No puedes eliminar una coleccion con items comerciales asignados. Desactivala o mueve esos productos primero.",
        ),
    );
  }

  const { error: linksError } = await supabase
    .schema("pass")
    .from("commercial_collection_categories")
    .delete()
    .eq("collection_id", id);

  if (linksError) {
    redirect("/commercial-collections?error=" + encodeURIComponent(linksError.message));
  }

  const { error } = await supabase
    .schema("pass")
    .from("commercial_collections")
    .delete()
    .eq("id", id);

  if (error) {
    redirect("/commercial-collections?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/commercial-collections");
  revalidatePath("/menu");
  redirect("/commercial-collections?ok=" + encodeURIComponent("Coleccion eliminada."));
}

export default async function CommercialCollectionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const okMsg = safeDecode(sp.ok);
  const errorMsg = safeDecode(sp.error);

  await requireAppAccess({
    appId: "viso",
    returnTo: "/commercial-collections",
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

  const categoryIdsByCollection = new Map<string, Set<string>>();

  for (const link of links) {
    if (link.is_active === false) continue;
    if (!categoryIdsByCollection.has(link.collection_id)) {
      categoryIdsByCollection.set(link.collection_id, new Set<string>());
    }
    categoryIdsByCollection.get(link.collection_id)!.add(link.commercial_category_id);
  }

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
            <Link href="/commercial-categories" className="ui-btn ui-btn--ghost">
              Categorias comerciales
            </Link>
            <Link href="/menu" className="ui-btn ui-btn--ghost">
              Volver al menu
            </Link>
          </div>
        }
      />

      {effectiveError ? <div className="ui-alert ui-alert--error">{effectiveError}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}

      <div className="ui-panel space-y-4">
        <h2 className="ui-h3">Crear coleccion</h2>
        <form action={saveCollection} className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr_auto]">
          <label className="space-y-2">
            <span className="ui-label">Sede</span>
            <select name="site_id" className="ui-input" required>
              <option value="">Selecciona sede</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {siteLabel(site)}
                </option>
              ))}
            </select>
          </label>

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

          <label className="space-y-2 xl:col-span-2">
            <span className="ui-label">Imagen hero</span>
            <input name="hero_image_url" className="ui-input" placeholder="https://..." />
          </label>
        </form>
      </div>

      {sites.length === 0 ? (
        <div className="ui-panel">
          <div className="ui-empty">No hay negocios activos con sede asociada.</div>
        </div>
      ) : (
        <div className="space-y-8">
          {sites.map((site) => {
            const siteCollections = collectionsBySite.get(site.id) ?? [];
            const siteCategories = categoriesBySite.get(site.id) ?? [];

            return (
              <div key={site.id} className="ui-panel space-y-4">
                <h2 className="text-lg font-semibold text-[var(--ui-text)]">
                  {siteLabel(site)}
                  <span className="ml-2 text-sm font-normal text-[var(--ui-muted)]">
                    ({siteCollections.length} {siteCollections.length === 1 ? "coleccion" : "colecciones"})
                  </span>
                </h2>

                {siteCategories.length === 0 ? (
                  <div className="ui-alert ui-alert--warning">
                    Esta sede todavia no tiene categorias comerciales activas. Crea categorias antes de asignar secciones a una coleccion.
                  </div>
                ) : null}

                {siteCollections.length === 0 ? (
                  <div className="ui-empty">Esta sede no tiene colecciones comerciales.</div>
                ) : (
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>Coleccion</TableHeaderCell>
                        <TableHeaderCell>Tipo</TableHeaderCell>
                        <TableHeaderCell>Vigencia</TableHeaderCell>
                        <TableHeaderCell>Estado</TableHeaderCell>
                        <TableHeaderCell></TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {siteCollections.map((collection) => {
                        const assignedCategoryIds = categoryIdsByCollection.get(collection.id) ?? new Set<string>();
                        const assignedCategories = Array.from(assignedCategoryIds)
                          .map((categoryId) => categoriesById.get(categoryId))
                          .filter((category): category is CategoryRow => Boolean(category));

                        return (
                          <TableRow key={collection.id}>
                            <TableCell>
                              <form id={`collection-${collection.id}`} action={saveCollection} className="space-y-2">
                                <input type="hidden" name="id" value={collection.id} />
                                <input type="hidden" name="site_id" value={collection.site_id} />

                                <input
                                  name="name"
                                  className="ui-input h-10"
                                  defaultValue={collection.name}
                                  required
                                />

                                <input
                                  name="subtitle"
                                  className="ui-input h-10"
                                  defaultValue={collection.subtitle ?? ""}
                                  placeholder="Subtitulo opcional"
                                />

                                <input
                                  name="description"
                                  className="ui-input h-10"
                                  defaultValue={collection.description ?? ""}
                                  placeholder="Descripcion opcional"
                                />

                                <input
                                  name="hero_image_url"
                                  className="ui-input h-10"
                                  defaultValue={collection.hero_image_url ?? ""}
                                  placeholder="Imagen hero opcional"
                                />
                              </form>

                              <form action={saveCollectionCategories} className="mt-4 rounded-2xl border border-[var(--ui-border)] p-3">
                                <input type="hidden" name="collection_id" value={collection.id} />

                                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ui-muted)]">
                                  Secciones
                                </div>

                                {siteCategories.length === 0 ? (
                                  <div className="ui-empty">No hay categorias disponibles para esta sede.</div>
                                ) : (
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    {siteCategories.map((category) => (
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

                                <div className="mt-3 flex items-center justify-between gap-3">
                                  <div className="text-xs text-[var(--ui-muted)]">
                                    {assignedCategories.length > 0
                                      ? assignedCategories.map((category) => category.name).join(" · ")
                                      : "Sin secciones asignadas"}
                                  </div>

                                  <button type="submit" className="ui-btn ui-btn--ghost ui-btn--sm">
                                    Guardar secciones
                                  </button>
                                </div>
                              </form>
                            </TableCell>

                            <TableCell>
                              <select
                                form={`collection-${collection.id}`}
                                name="kind"
                                className="ui-input h-10"
                                defaultValue={collection.kind || "seasonal"}
                              >
                                <option value="main">Menu principal</option>
                                <option value="seasonal">Temporada</option>
                                <option value="special">Menu especial</option>
                                <option value="campaign">Campana</option>
                                <option value="event">Evento</option>
                              </select>

                              <div className="mt-2 text-xs text-[var(--ui-muted)]">
                                {collectionKindLabel(collection.kind)}
                              </div>
                            </TableCell>

                            <TableCell>
                              <div className="space-y-2">
                                <label className="block space-y-1">
                                  <span className="ui-label">Desde</span>
                                  <input
                                    form={`collection-${collection.id}`}
                                    type="datetime-local"
                                    name="starts_at"
                                    className="ui-input h-10"
                                    defaultValue={toDateTimeLocalValue(collection.starts_at)}
                                  />
                                </label>

                                <label className="block space-y-1">
                                  <span className="ui-label">Hasta</span>
                                  <input
                                    form={`collection-${collection.id}`}
                                    type="datetime-local"
                                    name="ends_at"
                                    className="ui-input h-10"
                                    defaultValue={toDateTimeLocalValue(collection.ends_at)}
                                  />
                                </label>
                              </div>
                            </TableCell>

                            <TableCell>
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  form={`collection-${collection.id}`}
                                  type="checkbox"
                                  name="is_active"
                                  defaultChecked={collection.is_active !== false}
                                />
                                Activa
                              </label>
                            </TableCell>

                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <button
                                  form={`collection-${collection.id}`}
                                  type="submit"
                                  className="ui-btn ui-btn--ghost ui-btn--sm"
                                >
                                  Guardar
                                </button>

                                <form action={deleteCollection}>
                                  <input type="hidden" name="id" value={collection.id} />
                                  <button type="submit" className="ui-btn ui-btn--danger ui-btn--sm">
                                    Eliminar
                                  </button>
                                </form>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
