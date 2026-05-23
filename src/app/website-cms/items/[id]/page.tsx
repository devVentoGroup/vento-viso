import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { WebsiteMediaUploadField } from "@/components/viso/website-media-upload-field";
import { PageHeader } from "@/components/vento/standard/page-header";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { WEBSITE_ITEM_CATEGORIES, asBool, asNullableDate, asNullableText, asNumber, asText, safeDecode } from "@/lib/website-cms";
import { CATEGORY_META } from "../category-meta";

export const dynamic = "force-dynamic";

type WebsiteItemRow = {
  id: string; category: "restaurant" | "job" | "service" | "event" | "app";
  slug: string; title: string; excerpt: string | null; body: string | null;
  location: string | null; schedule_text: string | null; start_at: string | null;
  end_at: string | null; image_url: string | null; video_url: string | null;
  action_label: string | null; action_url: string | null; sort_order: number; is_published: boolean;
};

function toDatetimeLocal(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

async function updateWebsiteItem(formData: FormData) {
  "use server";
  const id = asText(formData.get("id"));
  if (!id) redirect("/website-cms?error=" + encodeURIComponent("Item invalido."));
  await requireAppAccess({ appId: "viso", returnTo: `/website-cms/items/${id}` });
  const supabase = createAdminClient();
  const category = asText(formData.get("category"));
  const slug = asText(formData.get("slug"));
  const title = asText(formData.get("title"));
  if (!category || !slug || !title) redirect(`/website-cms/items/${id}?error=${encodeURIComponent("Categoria, slug y titulo son obligatorios.")}`);
  if (!WEBSITE_ITEM_CATEGORIES.includes(category as (typeof WEBSITE_ITEM_CATEGORIES)[number])) redirect(`/website-cms/items/${id}?error=${encodeURIComponent("Categoria invalida.")}`);
  const payload = { category, slug, title, excerpt: asNullableText(formData.get("excerpt")), body: asNullableText(formData.get("body")), location: asNullableText(formData.get("location")), schedule_text: asNullableText(formData.get("schedule_text")), start_at: asNullableDate(formData.get("start_at")), end_at: asNullableDate(formData.get("end_at")), image_url: asNullableText(formData.get("image_url")), video_url: asNullableText(formData.get("video_url")), action_label: asNullableText(formData.get("action_label")), action_url: asNullableText(formData.get("action_url")), sort_order: asNumber(formData.get("sort_order"), 0), is_published: asBool(formData.get("is_published")) };
  const { error } = await supabase.from("website_items").update(payload).eq("id", id);
  if (error) redirect(`/website-cms/items/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/website-cms");
  revalidatePath(`/website-cms/items/${id}`);
  redirect("/website-cms?ok=" + encodeURIComponent("Item actualizado."));
}

async function deleteWebsiteItem(formData: FormData) {
  "use server";
  const id = asText(formData.get("id"));
  if (!id) redirect("/website-cms?error=" + encodeURIComponent("Item invalido."));
  await requireAppAccess({ appId: "viso", returnTo: `/website-cms/items/${id}` });
  const supabase = createAdminClient();
  const { error } = await supabase.from("website_items").delete().eq("id", id);
  if (error) redirect(`/website-cms/items/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/website-cms");
  redirect("/website-cms?ok=" + encodeURIComponent("Item eliminado."));
}

export default async function WebsiteItemEditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ error?: string }> }) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const errorMsg = sp.error ? safeDecode(sp.error) : "";
  await requireAppAccess({ appId: "viso", returnTo: `/website-cms/items/${id}` });
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("website_items").select("id,category,slug,title,excerpt,body,location,schedule_text,start_at,end_at,image_url,video_url,action_label,action_url,sort_order,is_published").eq("id", id).maybeSingle();
  if (!data) redirect("/website-cms?error=" + encodeURIComponent(error?.message ?? "Item no encontrado."));
  const row = data as WebsiteItemRow;
  const meta = CATEGORY_META[row.category];
  const itemWord = row.category === "job" ? "empleo" : row.category === "restaurant" ? "restaurante" : "item";

  type Check = { label: string; done: boolean };
  const checks: Check[] = [];
  if (row.category === "restaurant" || row.category === "job") {
    checks.push({ label: "Titulo", done: Boolean(row.title) });
    checks.push({ label: row.category === "restaurant" ? "Foto" : "Imagen", done: Boolean(row.image_url) });
    checks.push({ label: "Descripcion corta", done: Boolean(row.excerpt) });
    checks.push({ label: row.category === "restaurant" ? "Ubicacion" : "Sede", done: Boolean(row.location) });
    checks.push({ label: row.category === "restaurant" ? "Horario" : "Tipo de contrato", done: Boolean(row.schedule_text) });
    checks.push({ label: "Link del boton", done: Boolean(row.action_url && row.action_url !== "#") });
  }
  const doneCount = checks.filter((c) => c.done).length;
  const allDone = checks.length === 0 || doneCount === checks.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Editar: ${row.title}`}
        subtitle={`${row.category} — aparece en ${meta.pageLabel}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {row.category === "restaurant" && (
              <Link href={`/website-cms/venues/${encodeURIComponent(row.slug)}`} className="ui-btn ui-btn--ghost">Editar detalle (hero + galeria)</Link>
            )}
            <Link href="/website-cms/venues" className="ui-btn ui-btn--ghost">Restaurantes</Link>
            <Link href="/website-cms" className="ui-btn ui-btn--ghost">CMS</Link>
          </div>
        }
      />

      {errorMsg && <div className="ui-alert ui-alert--error">{errorMsg}</div>}

      {checks.length > 0 && (
        <div className={`ui-panel space-y-3 border-l-4 ${allDone ? "border-green-500" : "border-amber-400"}`}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="ui-h3">{allDone ? "Listo para publicar" : `Completitud: ${doneCount} de ${checks.length}`}</span>
            {!allDone && <span className="text-xs text-[var(--ui-text-muted,#888)]">Completa los campos en rojo</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {checks.map((c) => (
              <span key={c.label} className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${c.done ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
                {c.done ? "OK" : "!"} {c.label}
              </span>
            ))}
          </div>
        </div>
      )}

      <details className="ui-panel">
        <summary className="ui-h3 list-none flex items-center justify-between cursor-pointer select-none">
          <span>Guia rapida — como completar este {itemWord}</span>
          <span className="text-xs text-[var(--ui-text-muted,#888)] font-normal">clic para ver</span>
        </summary>
        <ul className="mt-3 space-y-2 list-disc list-inside">
          {meta.guide.map((tip, i) => <li key={i} className="text-sm leading-relaxed">{tip}</li>)}
        </ul>
      </details>

      <form action={updateWebsiteItem} className="space-y-6">
        <input type="hidden" name="id" value={row.id} />

        <div className="ui-panel space-y-4">
          <div><div className="ui-h3">Identidad</div><div className="ui-caption">Slug y categoria raramente cambian.</div></div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-2">
              <span className="ui-label">Categoria</span>
              <select name="category" className="ui-input" defaultValue={row.category} required>
                {WEBSITE_ITEM_CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="ui-label">Slug</span>
              <span className="ui-caption block">Solo letras, numeros y guiones.</span>
              <input name="slug" className="ui-input" defaultValue={row.slug} required />
            </label>
            <label className="space-y-1">
              <span className="ui-label">{meta.titleLabel}</span>
              <span className="ui-caption block">{meta.titleHint}</span>
              <input name="title" className="ui-input" defaultValue={row.title} required />
            </label>
          </div>
        </div>

        <div className="ui-panel space-y-4">
          <div>
            <div className="ui-h3">Contenido de la tarjeta</div>
            <div className="ui-caption">Lo que ve el visitante en <strong>ventogroup.co{meta.pageUrl}</strong></div>
          </div>
          <label className="space-y-1 block">
            <span className="ui-label">{meta.excerptLabel}</span>
            <span className="ui-caption block">{meta.excerptHint}</span>
            <textarea name="excerpt" className="ui-input min-h-24 py-3" defaultValue={row.excerpt ?? ""}
              placeholder={row.category === "job" ? "Ej: Buscamos un bartender creativo con 2+ anos de experiencia..." : "Ej: Cocina japonesa de autor en el corazon de la Zona G."} />
          </label>
          <label className="space-y-1 block">
            <span className="ui-label">Descripcion extendida (opcional)</span>
            <span className="ui-caption block">Texto largo para la pagina de detalle.</span>
            <textarea name="body" className="ui-input min-h-32 py-3" defaultValue={row.body ?? ""} />
          </label>
        </div>

        <div className="ui-panel space-y-4">
          <div><div className="ui-h3">Contexto</div><div className="ui-caption">Donde y cuando — aparece debajo del titulo en la tarjeta.</div></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="ui-label">{meta.locationLabel}</span>
              <span className="ui-caption block">{meta.locationHint}</span>
              <input name="location" className="ui-input" defaultValue={row.location ?? ""} placeholder={row.category === "job" ? "Bogota - Zona T" : "Bogota - Zona G"} />
            </label>
            <label className="space-y-1">
              <span className="ui-label">{meta.scheduleLabel}</span>
              <span className="ui-caption block">{meta.scheduleHint}</span>
              <input name="schedule_text" className="ui-input" defaultValue={row.schedule_text ?? ""} placeholder={row.category === "job" ? "Tiempo completo" : "Lunes a sabado 12:00 - 23:00"} />
            </label>
            {row.category === "event" && (
              <>
                <label className="space-y-1"><span className="ui-label">Fecha de inicio</span><input name="start_at" type="datetime-local" className="ui-input" defaultValue={toDatetimeLocal(row.start_at)} /></label>
                <label className="space-y-1"><span className="ui-label">Fecha de fin</span><input name="end_at" type="datetime-local" className="ui-input" defaultValue={toDatetimeLocal(row.end_at)} /></label>
              </>
            )}
          </div>
        </div>

        <div className="ui-panel space-y-4">
          <div><div className="ui-h3">Boton de accion (CTA)</div><div className="ui-caption">El boton en la tarjeta. Si lo dejas vacio se usa "Ver mas".</div></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="ui-label">Texto del boton</span>
              <span className="ui-caption block">{meta.ctaLabelHint}</span>
              <input name="action_label" className="ui-input" defaultValue={row.action_label ?? ""} placeholder={row.category === "job" ? "Aplicar ahora" : row.category === "restaurant" ? "Reservar" : "Ver mas"} />
            </label>
            <label className="space-y-1">
              <span className="ui-label">Link del boton</span>
              <span className="ui-caption block">{meta.ctaUrlHint}</span>
              <input name="action_url" className="ui-input" defaultValue={row.action_url ?? ""} placeholder={row.category === "job" ? "https://forms.gle/... o mailto:empleos@ventogroup.co" : "https://..."} />
            </label>
          </div>
        </div>

        <div className="ui-panel space-y-4">
          <div>
            <div className="ui-h3">Foto, video y estado</div>
            <div className="ui-caption">
              La foto aparece en la tarjeta.{" "}
              {row.category === "restaurant"
                ? <span>Para hero y galeria usa <Link href={`/website-cms/venues/${encodeURIComponent(row.slug)}`} className="underline">Venue Detail</Link>.</span>
                : "El video es opcional."}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <WebsiteMediaUploadField label="Foto principal" name="image_url" defaultValue={row.image_url ?? ""} scope={`website/items/${row.category}/${row.slug}/images`} accept="image/*" />
            <WebsiteMediaUploadField label="Video (opcional)" name="video_url" defaultValue={row.video_url ?? ""} scope={`website/items/${row.category}/${row.slug}/videos`} accept="video/*" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-[var(--ui-border,#e5e7eb)]">
            <label className="space-y-1">
              <span className="ui-label">Orden en la lista</span>
              <span className="ui-caption block">Numero menor = aparece primero.</span>
              <input name="sort_order" type="number" className="ui-input" defaultValue={row.sort_order} />
            </label>
            <label className="flex items-start gap-3 pt-5 text-sm">
              <input type="checkbox" name="is_published" defaultChecked={row.is_published} className="mt-0.5" />
              <span>
                <strong>Publicado</strong><br />
                <span className="text-xs text-[var(--ui-text-muted,#888)]">
                  {row.category === "job" ? "Desmarca cuando el puesto se cubra." : "Desmarca para ocultar del sitio publico."}
                </span>
              </span>
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="ui-btn ui-btn--brand">Guardar cambios</button>
          <Link href="/website-cms" className="ui-btn ui-btn--ghost">Cancelar</Link>
        </div>
      </form>

      <div className="ui-panel space-y-3">
        <div className="ui-h3 text-[var(--ui-danger)]">Zona de riesgo</div>
        <p className="text-sm text-[var(--ui-text-muted,#888)]">Eliminar borra permanentemente del sitio. No se puede deshacer.</p>
        <form action={deleteWebsiteItem}>
          <input type="hidden" name="id" value={row.id} />
          <button type="submit" className="ui-btn ui-btn--danger">Eliminar este {itemWord}</button>
        </form>
      </div>
    </div>
  );
}
