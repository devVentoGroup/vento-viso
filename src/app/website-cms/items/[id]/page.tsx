import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

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

type WebsiteItemRow = {
  id: string;
  category: "restaurant" | "job" | "service" | "event" | "app";
  slug: string;
  title: string;
  excerpt: string | null;
  body: string | null;
  location: string | null;
  schedule_text: string | null;
  start_at: string | null;
  end_at: string | null;
  image_url: string | null;
  video_url: string | null;
  action_label: string | null;
  action_url: string | null;
  sort_order: number;
  is_published: boolean;
};

function toDatetimeLocal(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

async function updateWebsiteItem(formData: FormData) {
  "use server";

  const id = asText(formData.get("id"));

  if (!id) {
    redirect("/website-cms?error=" + encodeURIComponent("Item invalido."));
  }

  await requireAppAccess({
    appId: "viso",
    returnTo: `/website-cms/items/${id}`,
  });

  const supabase = createAdminClient();
  const category = asText(formData.get("category"));
  const slug = asText(formData.get("slug"));
  const title = asText(formData.get("title"));

  if (!category || !slug || !title) {
    redirect(`/website-cms/items/${id}?error=${encodeURIComponent("Categoria, slug y titulo son obligatorios.")}`);
  }

  if (!WEBSITE_ITEM_CATEGORIES.includes(category as (typeof WEBSITE_ITEM_CATEGORIES)[number])) {
    redirect(`/website-cms/items/${id}?error=${encodeURIComponent("Categoria invalida.")}`);
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

  const { error } = await supabase.from("website_items").update(payload).eq("id", id);

  if (error) {
    redirect(`/website-cms/items/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/website-cms");
  revalidatePath(`/website-cms/items/${id}`);
  redirect("/website-cms?ok=" + encodeURIComponent("Item actualizado."));
}

async function deleteWebsiteItem(formData: FormData) {
  "use server";

  const id = asText(formData.get("id"));
  if (!id) {
    redirect("/website-cms?error=" + encodeURIComponent("Item invalido."));
  }

  await requireAppAccess({
    appId: "viso",
    returnTo: `/website-cms/items/${id}`,
  });

  const supabase = createAdminClient();
  const { error } = await supabase.from("website_items").delete().eq("id", id);

  if (error) {
    redirect(`/website-cms/items/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/website-cms");
  redirect("/website-cms?ok=" + encodeURIComponent("Item eliminado."));
}

export default async function WebsiteItemEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const errorMsg = sp.error ? safeDecode(sp.error) : "";

  await requireAppAccess({
    appId: "viso",
    returnTo: `/website-cms/items/${id}`,
  });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("website_items")
    .select(
      "id,category,slug,title,excerpt,body,location,schedule_text,start_at,end_at,image_url,video_url,action_label,action_url,sort_order,is_published",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) {
    redirect("/website-cms?error=" + encodeURIComponent(error?.message ?? "Item no encontrado."));
  }

  const row = data as WebsiteItemRow;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Editar item web"
        subtitle={`${row.category} · ${row.title}`}
        actions={
          <Link href="/website-cms" className="ui-btn ui-btn--ghost">
            Volver
          </Link>
        }
      />

      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}

      <form action={updateWebsiteItem} className="space-y-6">
        <input type="hidden" name="id" value={row.id} />
        <div className="ui-panel space-y-4">
          <div className="ui-h3">Datos principales</div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-2">
              <span className="ui-label">Categoria</span>
              <select name="category" className="ui-input" defaultValue={row.category} required>
                {WEBSITE_ITEM_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="ui-label">Slug</span>
              <input name="slug" className="ui-input" defaultValue={row.slug} required />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Titulo</span>
              <input name="title" className="ui-input" defaultValue={row.title} required />
            </label>
            <label className="space-y-2 sm:col-span-3">
              <span className="ui-label">Extracto</span>
              <textarea name="excerpt" className="ui-input min-h-24 py-3" defaultValue={row.excerpt ?? ""} />
            </label>
            <label className="space-y-2 sm:col-span-3">
              <span className="ui-label">Body</span>
              <textarea name="body" className="ui-input min-h-36 py-3" defaultValue={row.body ?? ""} />
            </label>
          </div>
        </div>

        <div className="ui-panel space-y-4">
          <div className="ui-h3">Contexto y CTA</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="ui-label">Ubicacion</span>
              <input name="location" className="ui-input" defaultValue={row.location ?? ""} />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Horario / meta</span>
              <input name="schedule_text" className="ui-input" defaultValue={row.schedule_text ?? ""} />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Inicio (eventos)</span>
              <input name="start_at" type="datetime-local" className="ui-input" defaultValue={toDatetimeLocal(row.start_at)} />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Fin (eventos)</span>
              <input name="end_at" type="datetime-local" className="ui-input" defaultValue={toDatetimeLocal(row.end_at)} />
            </label>
            <label className="space-y-2">
              <span className="ui-label">CTA label</span>
              <input name="action_label" className="ui-input" defaultValue={row.action_label ?? ""} />
            </label>
            <label className="space-y-2">
              <span className="ui-label">CTA URL</span>
              <input name="action_url" className="ui-input" defaultValue={row.action_url ?? ""} />
            </label>
          </div>
        </div>

        <div className="ui-panel space-y-4">
          <div className="ui-h3">Media y estado</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <WebsiteMediaUploadField
              label="Image URL"
              name="image_url"
              defaultValue={row.image_url ?? ""}
              scope={`website/items/${row.category}/${row.slug}/images`}
              accept="image/*"
            />
            <WebsiteMediaUploadField
              label="Video URL"
              name="video_url"
              defaultValue={row.video_url ?? ""}
              scope={`website/items/${row.category}/${row.slug}/videos`}
              accept="video/*"
            />
            <label className="space-y-2">
              <span className="ui-label">Orden</span>
              <input name="sort_order" type="number" className="ui-input" defaultValue={row.sort_order} />
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--ui-text)]">
              <input type="checkbox" name="is_published" defaultChecked={row.is_published} />
              Publicado
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="ui-btn ui-btn--brand">
            Guardar cambios
          </button>
          <Link href="/website-cms" className="ui-btn ui-btn--ghost">
            Cancelar
          </Link>
        </div>
      </form>

      <div className="ui-panel space-y-3">
        <div className="ui-h3 text-[var(--ui-danger)]">Zona de riesgo</div>
        <form action={deleteWebsiteItem}>
          <input type="hidden" name="id" value={row.id} />
          <button type="submit" className="ui-btn ui-btn--danger">
            Eliminar item
          </button>
        </form>
      </div>
    </div>
  );
}
