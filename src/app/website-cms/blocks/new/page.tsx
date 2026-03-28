import Link from "next/link";
import { redirect } from "next/navigation";

import { WebsiteMediaUploadField } from "@/components/viso/website-media-upload-field";
import { PageHeader } from "@/components/vento/standard/page-header";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { asBool, asNullableText, asNumber, asText, safeDecode } from "@/lib/website-cms";

export const dynamic = "force-dynamic";

async function createWebsiteBlock(formData: FormData) {
  "use server";

  await requireAppAccess({
    appId: "viso",
    returnTo: "/website-cms/blocks/new",
  });

  const supabase = createAdminClient();
  const pageSlug = asText(formData.get("page_slug"));
  const blockKey = asText(formData.get("block_key"));

  if (!pageSlug || !blockKey) {
    redirect("/website-cms/blocks/new?error=" + encodeURIComponent("Pagina y block key son obligatorios."));
  }

  const payload = {
    page_slug: pageSlug,
    block_key: blockKey,
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

  const { error } = await supabase.from("website_blocks").insert(payload);

  if (error) {
    redirect("/website-cms/blocks/new?error=" + encodeURIComponent(error.message));
  }

  redirect("/website-cms?ok=" + encodeURIComponent("Bloque creado."));
}

export default async function WebsiteBlockNewPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const errorMsg = sp.error ? safeDecode(sp.error) : "";

  await requireAppAccess({
    appId: "viso",
    returnTo: "/website-cms/blocks/new",
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Crear bloque web"
        subtitle="Nuevo bloque de contenido para cualquier pagina publica."
        actions={
          <Link href="/website-cms" className="ui-btn ui-btn--ghost">
            Volver
          </Link>
        }
      />

      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}

      <form action={createWebsiteBlock} className="space-y-6">
        <div className="ui-panel space-y-4">
          <div className="ui-h3">Identificacion</div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-2">
              <span className="ui-label">Pagina</span>
              <input name="page_slug" className="ui-input" placeholder="home" required />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Block key</span>
              <input name="block_key" className="ui-input" placeholder="hero_main" required />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Tipo de bloque</span>
              <input name="block_type" className="ui-input" defaultValue="content" />
            </label>
          </div>
        </div>

        <div className="ui-panel space-y-4">
          <div className="ui-h3">Contenido</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 sm:col-span-2">
              <span className="ui-label">Titulo</span>
              <input name="title" className="ui-input" />
            </label>
            <label className="space-y-2 sm:col-span-2">
              <span className="ui-label">Subtitulo</span>
              <input name="subtitle" className="ui-input" />
            </label>
            <label className="space-y-2 sm:col-span-2">
              <span className="ui-label">Body</span>
              <textarea name="body" className="ui-input min-h-28 py-3" />
            </label>
            <label className="space-y-2">
              <span className="ui-label">CTA label</span>
              <input name="cta_label" className="ui-input" />
            </label>
            <label className="space-y-2">
              <span className="ui-label">CTA URL</span>
              <input name="cta_url" className="ui-input" />
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
                scope="website/blocks/new"
                accept="image/*,video/*"
              />
            </div>
            <label className="space-y-2">
              <span className="ui-label">Media type</span>
              <select name="media_type" className="ui-input" defaultValue="">
                <option value="">Sin media</option>
                <option value="image">Imagen</option>
                <option value="video">Video</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className="ui-label">Orden</span>
              <input name="sort_order" type="number" className="ui-input" defaultValue={0} />
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--ui-text)] sm:col-span-2">
              <input type="checkbox" name="is_published" defaultChecked />
              Publicado
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="ui-btn ui-btn--brand">
            Crear bloque
          </button>
          <Link href="/website-cms" className="ui-btn ui-btn--ghost">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
