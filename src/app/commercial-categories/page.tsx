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

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function asBool(value: FormDataEntryValue | null) {
  return value === "on" || value === "true";
}

function asInteger(value: FormDataEntryValue | null, fallback = 0) {
  const parsed = Number(asText(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.round(parsed);
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

async function saveCategory(formData: FormData) {
  "use server";
  const supabase = createAdminClient();
  const id = asText(formData.get("id"));
  const siteId = asText(formData.get("site_id"));
  const name = asText(formData.get("name"));
  const requestedCode = asText(formData.get("code"));
  const code = requestedCode || slugify(name);

  if (!siteId || !name || !code) {
    redirect("/commercial-categories?error=" + encodeURIComponent("Sede, nombre y codigo son obligatorios."));
  }

  const payload = {
    site_id: siteId,
    name,
    code,
    description: asText(formData.get("description")) || null,
    sort_order: asInteger(formData.get("sort_order"), 0),
    is_active: asBool(formData.get("is_active")),
  };

  const query = id
    ? supabase.schema("pass").from("commercial_categories").update(payload).eq("id", id)
    : supabase.schema("pass").from("commercial_categories").insert(payload);

  const { error } = await query;
  if (error) {
    redirect("/commercial-categories?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/commercial-categories");
  revalidatePath("/menu");
  redirect("/commercial-categories?ok=" + encodeURIComponent("Categoria guardada."));
}

async function deleteCategory(formData: FormData) {
  "use server";
  const supabase = createAdminClient();
  const id = asText(formData.get("id"));
  if (!id) {
    redirect("/commercial-categories?error=" + encodeURIComponent("Categoria invalida."));
  }

  const { count } = await supabase
    .schema("pass")
    .from("catalog_items")
    .select("id", { count: "exact", head: true })
    .eq("commercial_category_id", id);

  if ((count ?? 0) > 0) {
    redirect("/commercial-categories?error=" + encodeURIComponent("No puedes eliminar una categoria con items asignados. Desactivala o mueve los productos primero."));
  }

  const { error } = await supabase.schema("pass").from("commercial_categories").delete().eq("id", id);
  if (error) {
    redirect("/commercial-categories?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/commercial-categories");
  revalidatePath("/menu");
  redirect("/commercial-categories?ok=" + encodeURIComponent("Categoria eliminada."));
}

export default async function CommercialCategoriesPage({
  searchParams,
}: {
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const okMsg = safeDecode(sp.ok);
  const errorMsg = safeDecode(sp.error);

  await requireAppAccess({
    appId: "viso",
    returnTo: "/commercial-categories",
  });

  const supabase = createAdminClient();
  const [{ data: sitesRaw, error: sitesError }, { data: categoriesRaw, error: categoriesError }] = await Promise.all([
    supabase.from("sites").select("id,name,code,is_active").order("name", { ascending: true }),
    supabase
      .schema("pass")
      .from("commercial_categories")
      .select("id,site_id,code,name,description,sort_order,is_active")
      .order("site_id", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  const sites = ((sitesRaw ?? []) as SiteRow[]).filter((site) => site.is_active !== false);
  const categories = (categoriesRaw ?? []) as CategoryRow[];
  const sitesById = new Map(sites.map((site) => [site.id, site]));
  const effectiveError = errorMsg || sitesError?.message || categoriesError?.message || "";

  const categoriesBySite = new Map<string, CategoryRow[]>();
  for (const category of categories) {
    if (!categoriesBySite.has(category.site_id)) categoriesBySite.set(category.site_id, []);
    categoriesBySite.get(category.site_id)!.push(category);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categorías comerciales"
        subtitle="Crea categorias por sede para ordenar el menu de compras en Vento Pass. No son categorias operacionales ni canjes de fidelización."
        actions={
          <Link href="/menu" className="ui-btn ui-btn--ghost">
            Volver al menú
          </Link>
        }
      />

      {effectiveError ? <div className="ui-alert ui-alert--error">{effectiveError}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}

      <div className="ui-panel space-y-4">
        <h2 className="ui-h3">Crear categoria</h2>
        <form action={saveCategory} className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_120px_auto]">
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
            <span className="ui-label">Nombre</span>
            <input name="name" className="ui-input" placeholder="Bebidas frías" required />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Código opcional</span>
            <input name="code" className="ui-input" placeholder="bebidas-frias" />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Orden</span>
            <input name="sort_order" type="number" className="ui-input" defaultValue={0} />
          </label>
          <div className="flex items-end">
            <input type="hidden" name="is_active" value="on" />
            <button type="submit" className="ui-btn ui-btn--brand w-full">
              Crear
            </button>
          </div>
        </form>
      </div>

      {sites.length === 0 ? (
        <div className="ui-panel">
          <div className="ui-empty">No hay sedes activas.</div>
        </div>
      ) : (
        <div className="space-y-8">
          {sites.map((site) => {
            const siteCategories = categoriesBySite.get(site.id) ?? [];
            return (
              <div key={site.id} className="ui-panel space-y-4">
                <h2 className="text-lg font-semibold text-[var(--ui-text)]">
                  {siteLabel(site)}
                  <span className="ml-2 text-sm font-normal text-[var(--ui-muted)]">
                    ({siteCategories.length} {siteCategories.length === 1 ? "categoria" : "categorias"})
                  </span>
                </h2>

                {siteCategories.length === 0 ? (
                  <div className="ui-empty">Esta sede no tiene categorias comerciales.</div>
                ) : (
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>Categoria</TableHeaderCell>
                        <TableHeaderCell>Codigo</TableHeaderCell>
                        <TableHeaderCell>Orden</TableHeaderCell>
                        <TableHeaderCell>Estado</TableHeaderCell>
                        <TableHeaderCell></TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {siteCategories.map((category) => (
                        <TableRow key={category.id}>
                          <TableCell>
                            <form id={`category-${category.id}`} action={saveCategory} className="space-y-2">
                              <input type="hidden" name="id" value={category.id} />
                              <input type="hidden" name="site_id" value={category.site_id} />
                              <input name="name" className="ui-input h-10" defaultValue={category.name} required />
                              <input name="description" className="ui-input h-10" defaultValue={category.description ?? ""} placeholder="Descripcion opcional" />
                            </form>
                          </TableCell>
                          <TableCell>
                            <input form={`category-${category.id}`} name="code" className="ui-input h-10" defaultValue={category.code} required />
                          </TableCell>
                          <TableCell>
                            <input form={`category-${category.id}`} name="sort_order" type="number" className="ui-input h-10 w-24" defaultValue={category.sort_order ?? 0} />
                          </TableCell>
                          <TableCell>
                            <label className="flex items-center gap-2 text-sm">
                              <input form={`category-${category.id}`} type="checkbox" name="is_active" defaultChecked={category.is_active !== false} />
                              Activa
                            </label>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <button form={`category-${category.id}`} type="submit" className="ui-btn ui-btn--ghost ui-btn--sm">
                                Guardar
                              </button>
                              <form action={deleteCategory}>
                                <input type="hidden" name="id" value={category.id} />
                                <button type="submit" className="ui-btn ui-btn--danger ui-btn--sm">
                                  Eliminar
                                </button>
                              </form>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
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
