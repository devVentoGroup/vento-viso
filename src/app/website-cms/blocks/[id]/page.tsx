import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { WebsiteMediaUploadField } from "@/components/viso/website-media-upload-field";
import { PageHeader } from "@/components/vento/standard/page-header";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type BlockRow = {
  id: string;
  page_slug: string;
  block_key: string;
  block_type: string;
  title: string | null;
  subtitle: string | null;
  body: string | null;
  cta_label: string | null;
  cta_url: string | null;
  media_url: string | null;
  media_type: "image" | "video" | null;
  sort_order: number;
  is_published: boolean;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableText(value: FormDataEntryValue | null) {
  const parsed = asText(value);
  return parsed || null;
}

function asBool(value: FormDataEntryValue | null) {
  return value === "on" || value === "true";
}

function asNumber(value: FormDataEntryValue | null, fallback = 0) {
  const raw = asText(value);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function updateBlock(formData: FormData) {
  "use server";

  const id = asText(formData.get("id"));

  if (!id) {
    redirect("/website-cms?error=" + encodeURIComponent("Bloque invalido."));
  }

  await requireAppAccess({
    appId: "viso",
    returnTo: `/website-cms/blocks/${id}`,
  });

  const supabase = createAdminClient();
  const payload = {
    page_slug: asText(formData.get("page_slug")),
    block_key: asText(formData.get("block_key")),
    block_type: asText(formData.get("block_type")) || "content",
    title: asNullableText(formData.get("title")),
    subtitle: asNullableText(formData.get("subtitle")),
    body: asNullableText(formData.get("body")),
    cta_label: asNullableText(formData.get("cta_label")),
    cta_url: asNullableText(formData.get("cta_url")),
    media_url: asNullableText(formData.get("media_url")),
    media_type: asNullableText(formData.get("media_type")),
    sort_order: asNumber(formData.get("sort_order"), 0),
    is_published: asBool(formData.get("is_published")),
  };

  if (!payload.page_slug || !payload.block_key) {
    redirect(`/website-cms/blocks/${id}?error=${encodeURIComponent("Pagina y bloque son obligatorios.")}`);
  }

  const { error } = await supabase.from("website_blocks").update(payload).eq("id", id);

  if (error) {
    redirect(`/website-cms/blocks/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/website-cms");
  revalidatePath(`/website-cms/blocks/${id}`);
  redirect("/website-cms?ok=" + encodeURIComponent("Bloque actualizado."));
}

export default async function WebsiteBlockEditPage({
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
    returnTo: `/website-cms/blocks/${id}`,
  });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("website_blocks")
    .select("id,page_slug,block_key,block_type,title,subtitle,body,cta_label,cta_url,media_url,media_type,sort_order,is_published")
    .eq("id", id)
    .maybeSingle();

  if (!data) {
    redirect("/website-cms?error=" + encodeURIComponent(error?.message ?? "Bloque no encontrado."));
  }

  const row = data as BlockRow;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Editar bloque web"
        subtitle={`${row.page_slug} · ${row.block_key}`}
        actions={
          <Link href="/website-cms" className="ui-btn ui-btn--ghost">
            Volver
          </Link>
        }
      />

      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}

      <form action={updateBlock} className="space-y-6">
        <input type="hidden" name="id" value={row.id} />
        <div className="ui-panel space-y-4">
          <div className="ui-h3">Identificacion</div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-2">
              <span className="ui-label">Pagina</span>
              <input name="page_slug" className="ui-input" defaultValue={row.page_slug} required />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Block key</span>
              <input name="block_key" className="ui-input" defaultValue={row.block_key} required />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Tipo de bloque</span>
              <input name="block_type" className="ui-input" defaultValue={row.block_type} />
            </label>
          </div>
        </div>

        <div className="ui-panel space-y-4">
          <div className="ui-h3">Contenido</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 sm:col-span-2">
              <span className="ui-label">Titulo</span>
              <input name="title" className="ui-input" defaultValue={row.title ?? ""} />
            </label>
            <label className="space-y-2 sm:col-span-2">
              <span className="ui-label">Subtitulo</span>
              <input name="subtitle" className="ui-input" defaultValue={row.subtitle ?? ""} />
            </label>
            <label className="space-y-2 sm:col-span-2">
              <span className="ui-label">Body</span>
              <textarea name="body" className="ui-input min-h-28 py-3" defaultValue={row.body ?? ""} />
            </label>
            <label className="space-y-2">
              <span className="ui-label">CTA label</span>
              <input name="cta_label" className="ui-input" defaultValue={row.cta_label ?? ""} />
            </label>
            <label className="space-y-2">
              <span className="ui-label">CTA URL</span>
              <input name="cta_url" className="ui-input" defaultValue={row.cta_url ?? ""} />
            </label>
          </div>
        </div>

        <div className="ui-panel space-y-4">
          <div className="ui-h3">Media y publicacion</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <WebsiteMediaUploadField
                label="Media URL"
                name="media_url"
                defaultValue={row.media_url ?? ""}
                scope={`website/blocks/${row.page_slug}/${row.block_key}`}
                accept="image/*,video/*"
              />
            </div>
            <label className="space-y-2">
              <span className="ui-label">Media type</span>
              <select name="media_type" className="ui-input" defaultValue={row.media_type ?? ""}>
                <option value="">Sin media</option>
                <option value="image">Imagen</option>
                <option value="video">Video</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className="ui-label">Orden</span>
              <input name="sort_order" type="number" className="ui-input" defaultValue={row.sort_order} />
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--ui-text)] sm:col-span-2">
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
    </div>
  );
}
