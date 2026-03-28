import Link from "next/link";
import { redirect } from "next/navigation";

import { WebsiteMediaUploadField } from "@/components/viso/website-media-upload-field";
import { PageHeader } from "@/components/vento/standard/page-header";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  WEBSITE_ITEM_CATEGORIES,
  asBool,
  asNullableDate,
  asNullableText,
  asNumber,
  asText,
  safeDecode,
} from "@/lib/website-cms";

export const dynamic = "force-dynamic";

async function createWebsiteItem(formData: FormData) {
  "use server";

  await requireAppAccess({
    appId: "viso",
    returnTo: "/website-cms/items/new",
  });

  const supabase = createAdminClient();
  const category = asText(formData.get("category"));
  const slug = asText(formData.get("slug"));
  const title = asText(formData.get("title"));

  if (!category || !slug || !title) {
    redirect("/website-cms/items/new?error=" + encodeURIComponent("Categoria, slug y titulo son obligatorios."));
  }

  if (!WEBSITE_ITEM_CATEGORIES.includes(category as (typeof WEBSITE_ITEM_CATEGORIES)[number])) {
    redirect("/website-cms/items/new?error=" + encodeURIComponent("Categoria invalida."));
  }

  const payload = {
    category,
    slug,
    title,
    excerpt: asNullableText(formData.get("excerpt")),
    body: asNullableText(formData.get("body")),
    location: asNullableText(formData.get("location")),
    schedule_text: asNullableText(formData.get("schedule_text")),
    start_at: asNullableDate(formData.get("start_at")),
    end_at: asNullableDate(formData.get("end_at")),
    image_url: asNullableText(formData.get("image_url")),
    video_url: asNullableText(formData.get("video_url")),
    action_label: asNullableText(formData.get("action_label")),
    action_url: asNullableText(formData.get("action_url")),
    sort_order: asNumber(formData.get("sort_order"), 0),
    is_published: asBool(formData.get("is_published")),
  };

  const { error } = await supabase.from("website_items").insert(payload);

  if (error) {
    redirect("/website-cms/items/new?error=" + encodeURIComponent(error.message));
  }

  redirect("/website-cms?ok=" + encodeURIComponent("Item creado."));
}

export default async function WebsiteItemNewPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const errorMsg = sp.error ? safeDecode(sp.error) : "";

  await requireAppAccess({
    appId: "viso",
    returnTo: "/website-cms/items/new",
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Crear item web"
        subtitle="Nuevo registro para restaurantes, empleos, servicios, eventos o apps."
        actions={
          <Link href="/website-cms" className="ui-btn ui-btn--ghost">
            Volver
          </Link>
        }
      />

      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}

      <form action={createWebsiteItem} className="space-y-6">
        <div className="ui-panel space-y-4">
          <div className="ui-h3">Datos principales</div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-2">
              <span className="ui-label">Categoria</span>
              <select name="category" className="ui-input" defaultValue="restaurant" required>
                {WEBSITE_ITEM_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="ui-label">Slug</span>
              <input name="slug" className="ui-input" placeholder="restaurante-principal" required />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Titulo</span>
              <input name="title" className="ui-input" placeholder="Restaurante principal" required />
            </label>
            <label className="space-y-2 sm:col-span-3">
              <span className="ui-label">Extracto</span>
              <textarea name="excerpt" className="ui-input min-h-24 py-3" placeholder="Descripcion corta" />
            </label>
            <label className="space-y-2 sm:col-span-3">
              <span className="ui-label">Body</span>
              <textarea name="body" className="ui-input min-h-36 py-3" placeholder="Descripcion completa opcional" />
            </label>
          </div>
        </div>

        <div className="ui-panel space-y-4">
          <div className="ui-h3">Contexto y CTA</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="ui-label">Ubicacion</span>
              <input name="location" className="ui-input" placeholder="Bogota · Zona T" />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Horario / meta</span>
              <input name="schedule_text" className="ui-input" placeholder="Lunes a sabado 12:00 - 23:00" />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Inicio (eventos)</span>
              <input name="start_at" type="datetime-local" className="ui-input" />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Fin (eventos)</span>
              <input name="end_at" type="datetime-local" className="ui-input" />
            </label>
            <label className="space-y-2">
              <span className="ui-label">CTA label</span>
              <input name="action_label" className="ui-input" placeholder="Ver mas" />
            </label>
            <label className="space-y-2">
              <span className="ui-label">CTA URL</span>
              <input name="action_url" className="ui-input" placeholder="https://..." />
            </label>
          </div>
        </div>

        <div className="ui-panel space-y-4">
          <div className="ui-h3">Media y estado</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <WebsiteMediaUploadField
              label="Image URL"
              name="image_url"
              scope="website/items/new/images"
              accept="image/*"
            />
            <WebsiteMediaUploadField
              label="Video URL"
              name="video_url"
              scope="website/items/new/videos"
              accept="video/*"
            />
            <label className="space-y-2">
              <span className="ui-label">Orden</span>
              <input name="sort_order" type="number" className="ui-input" defaultValue={0} />
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--ui-text)]">
              <input type="checkbox" name="is_published" defaultChecked />
              Publicado
            </label>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" className="ui-btn ui-btn--brand">
            Crear item
          </button>
          <Link href="/website-cms" className="ui-btn ui-btn--ghost">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
