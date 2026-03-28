import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { WebsiteMediaUploadField } from "@/components/viso/website-media-upload-field";
import { PageHeader } from "@/components/vento/standard/page-header";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  asBool,
  asNullableText,
  asNumber,
  asText,
  getPrimaryRestaurantPageSlug,
  getRestaurantPageSlugCandidates,
  safeDecode,
} from "@/lib/website-cms";

export const dynamic = "force-dynamic";

type RestaurantRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string | null;
  location: string | null;
  schedule_text: string | null;
  image_url: string | null;
  video_url: string | null;
  action_label: string | null;
  action_url: string | null;
  sort_order: number;
  is_published: boolean;
};

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

function normalizeMediaType(value: string | null) {
  if (value === "image" || value === "video") return value;
  return null;
}

function getFirstBlockByKeys(blocks: BlockRow[], keys: string[]) {
  for (const key of keys) {
    const found = blocks.find((item) => item.block_key === key);
    if (found) return found;
  }
  return null;
}

async function updateRestaurantDetail(formData: FormData) {
  "use server";

  const restaurantId = asText(formData.get("restaurant_id"));
  const slug = asText(formData.get("slug"));
  const pageSlug = asText(formData.get("page_slug")) || getPrimaryRestaurantPageSlug(slug);

  if (!restaurantId || !slug) {
    redirect("/website-cms/venues?error=" + encodeURIComponent("Restaurante inválido."));
  }

  await requireAppAccess({
    appId: "viso",
    returnTo: `/website-cms/venues/${slug}`,
  });

  const supabase = createAdminClient();

  const restaurantPayload = {
    title: asText(formData.get("title")),
    excerpt: asNullableText(formData.get("excerpt")),
    body: asNullableText(formData.get("body")),
    location: asNullableText(formData.get("location")),
    schedule_text: asNullableText(formData.get("schedule_text")),
    action_label: asNullableText(formData.get("action_label")),
    action_url: asNullableText(formData.get("action_url")),
    image_url: asNullableText(formData.get("image_url")),
    video_url: asNullableText(formData.get("video_url")),
    sort_order: asNumber(formData.get("sort_order"), 0),
    is_published: asBool(formData.get("is_published")),
  };

  if (!restaurantPayload.title) {
    redirect(`/website-cms/venues/${slug}?error=${encodeURIComponent("El título del restaurante es obligatorio.")}`);
  }

  const { error: restaurantError } = await supabase
    .from("website_items")
    .update(restaurantPayload)
    .eq("id", restaurantId)
    .eq("category", "restaurant");

  if (restaurantError) {
    redirect(`/website-cms/venues/${slug}?error=${encodeURIComponent(restaurantError.message)}`);
  }

  const blocksToUpsert = [
    {
      page_slug: pageSlug,
      block_key: "detail_hero",
      block_type: "detail_hero",
      title: asNullableText(formData.get("hero_title")),
      subtitle: asNullableText(formData.get("hero_subtitle")),
      body: asNullableText(formData.get("hero_body")),
      cta_label: asNullableText(formData.get("hero_cta_label")),
      cta_url: asNullableText(formData.get("hero_cta_url")),
      media_url: asNullableText(formData.get("hero_media_url")),
      media_type: normalizeMediaType(asNullableText(formData.get("hero_media_type"))),
      sort_order: asNumber(formData.get("hero_sort_order"), 10),
      is_published: asBool(formData.get("hero_is_published")),
    },
    ...[1, 2, 3].map((index) => ({
      page_slug: pageSlug,
      block_key: `gallery_${index}`,
      block_type: "gallery_media",
      title: asNullableText(formData.get(`gallery_${index}_title`)),
      subtitle: null,
      body: null,
      cta_label: null,
      cta_url: null,
      media_url: asNullableText(formData.get(`gallery_${index}_media_url`)),
      media_type: normalizeMediaType(asNullableText(formData.get(`gallery_${index}_media_type`))),
      sort_order: asNumber(formData.get(`gallery_${index}_sort_order`), 20 + index * 10),
      is_published: asBool(formData.get(`gallery_${index}_is_published`)),
    })),
  ];

  const { error: blocksError } = await supabase
    .from("website_blocks")
    .upsert(blocksToUpsert, { onConflict: "page_slug,block_key" });

  if (blocksError) {
    redirect(`/website-cms/venues/${slug}?error=${encodeURIComponent(blocksError.message)}`);
  }

  revalidatePath("/website-cms");
  revalidatePath("/website-cms/venues");
  revalidatePath(`/website-cms/venues/${slug}`);
  revalidatePath("/website-cms/items");

  redirect(`/website-cms/venues/${slug}?ok=${encodeURIComponent("Detalle del venue actualizado.")}`);
}

export default async function WebsiteCmsVenueDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  const { slug } = await params;
  const sp = (await searchParams) ?? {};
  const okMsg = sp.ok ? safeDecode(sp.ok) : "";
  const errorMsg = sp.error ? safeDecode(sp.error) : "";

  await requireAppAccess({
    appId: "viso",
    returnTo: `/website-cms/venues/${slug}`,
  });

  const supabase = createAdminClient();

  const { data: restaurantData, error: restaurantError } = await supabase
    .from("website_items")
    .select(
      "id,slug,title,excerpt,body,location,schedule_text,image_url,video_url,action_label,action_url,sort_order,is_published",
    )
    .eq("category", "restaurant")
    .eq("slug", slug)
    .maybeSingle();

  if (!restaurantData) {
    redirect(`/website-cms/venues?error=${encodeURIComponent(restaurantError?.message ?? "Restaurante no encontrado.")}`);
  }

  const restaurant = restaurantData as RestaurantRow;
  const pageSlugCandidates = getRestaurantPageSlugCandidates(restaurant.slug);
  const { data: blocksData, error: blocksError } = await supabase
    .from("website_blocks")
    .select("id,page_slug,block_key,block_type,title,subtitle,body,cta_label,cta_url,media_url,media_type,sort_order,is_published")
    .in("page_slug", pageSlugCandidates)
    .order("sort_order", { ascending: true });

  const blocks = (blocksData ?? []) as BlockRow[];
  const existingPageSlug = blocks[0]?.page_slug ?? null;
  const pageSlug = existingPageSlug ?? getPrimaryRestaurantPageSlug(restaurant.slug);

  const heroBlock = getFirstBlockByKeys(blocks, ["detail_hero"]);
  const gallery1 = getFirstBlockByKeys(blocks, ["gallery_1"]);
  const gallery2 = getFirstBlockByKeys(blocks, ["gallery_2"]);
  const gallery3 = getFirstBlockByKeys(blocks, ["gallery_3"]);
  const effectiveError = errorMsg || blocksError?.message || "";

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Venue Detail · ${restaurant.title}`}
        subtitle={`Slug: /${restaurant.slug} · page_slug de bloques: ${pageSlug}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`https://ventogroup.co/restaurantes/${encodeURIComponent(restaurant.slug)}`}
              target="_blank"
              rel="noreferrer"
              className="ui-btn ui-btn--ghost"
            >
              Ver página pública
            </a>
            <Link href="/website-cms/venues" className="ui-btn ui-btn--ghost">
              Volver
            </Link>
          </div>
        }
      />

      {effectiveError ? <div className="ui-alert ui-alert--error">{effectiveError}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}

      <form action={updateRestaurantDetail} className="space-y-6">
        <input type="hidden" name="restaurant_id" value={restaurant.id} />
        <input type="hidden" name="slug" value={restaurant.slug} />
        <input type="hidden" name="page_slug" value={pageSlug} />

        <div className="ui-panel space-y-4">
          <div className="ui-h3">Perfil del restaurante (website_items)</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 sm:col-span-2">
              <span className="ui-label">Título</span>
              <input name="title" className="ui-input" defaultValue={restaurant.title} required />
            </label>
            <label className="space-y-2 sm:col-span-2">
              <span className="ui-label">Extracto</span>
              <textarea name="excerpt" className="ui-input min-h-24 py-3" defaultValue={restaurant.excerpt ?? ""} />
            </label>
            <label className="space-y-2 sm:col-span-2">
              <span className="ui-label">Body / Features (usa bullets para features)</span>
              <textarea
                name="body"
                className="ui-input min-h-36 py-3"
                defaultValue={restaurant.body ?? ""}
                placeholder={"Historia del venue...\n- Feature 1\n- Feature 2"}
              />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Ubicación</span>
              <input name="location" className="ui-input" defaultValue={restaurant.location ?? ""} />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Horario</span>
              <input name="schedule_text" className="ui-input" defaultValue={restaurant.schedule_text ?? ""} />
            </label>
            <label className="space-y-2">
              <span className="ui-label">CTA label</span>
              <input name="action_label" className="ui-input" defaultValue={restaurant.action_label ?? ""} />
            </label>
            <label className="space-y-2">
              <span className="ui-label">CTA URL</span>
              <input name="action_url" className="ui-input" defaultValue={restaurant.action_url ?? ""} />
            </label>
            <WebsiteMediaUploadField
              label="Image URL"
              name="image_url"
              defaultValue={restaurant.image_url ?? ""}
              scope={`website/items/restaurant/${restaurant.slug}/images`}
              accept="image/*"
            />
            <WebsiteMediaUploadField
              label="Video URL"
              name="video_url"
              defaultValue={restaurant.video_url ?? ""}
              scope={`website/items/restaurant/${restaurant.slug}/videos`}
              accept="video/*"
            />
            <label className="space-y-2">
              <span className="ui-label">Orden</span>
              <input name="sort_order" type="number" className="ui-input" defaultValue={restaurant.sort_order} />
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--ui-text)]">
              <input type="checkbox" name="is_published" defaultChecked={restaurant.is_published} />
              Restaurante publicado
            </label>
          </div>
        </div>

        <div className="ui-panel space-y-4">
          <div className="ui-h3">Detalle hero (website_blocks.detail_hero)</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 sm:col-span-2">
              <span className="ui-label">Hero title</span>
              <input name="hero_title" className="ui-input" defaultValue={heroBlock?.title ?? restaurant.title} />
            </label>
            <label className="space-y-2 sm:col-span-2">
              <span className="ui-label">Hero subtitle</span>
              <input name="hero_subtitle" className="ui-input" defaultValue={heroBlock?.subtitle ?? ""} />
            </label>
            <label className="space-y-2 sm:col-span-2">
              <span className="ui-label">Hero body</span>
              <textarea name="hero_body" className="ui-input min-h-28 py-3" defaultValue={heroBlock?.body ?? ""} />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Hero CTA label</span>
              <input name="hero_cta_label" className="ui-input" defaultValue={heroBlock?.cta_label ?? restaurant.action_label ?? ""} />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Hero CTA URL</span>
              <input name="hero_cta_url" className="ui-input" defaultValue={heroBlock?.cta_url ?? restaurant.action_url ?? ""} />
            </label>
            <div className="sm:col-span-2">
              <WebsiteMediaUploadField
                label="Hero media URL"
                name="hero_media_url"
                defaultValue={heroBlock?.media_url ?? restaurant.video_url ?? restaurant.image_url ?? ""}
                scope={`website/venues/${restaurant.slug}/hero`}
                accept="image/*,video/*"
              />
            </div>
            <label className="space-y-2">
              <span className="ui-label">Hero media type</span>
              <select name="hero_media_type" className="ui-input" defaultValue={heroBlock?.media_type ?? (restaurant.video_url ? "video" : "image")}>
                <option value="">Sin media</option>
                <option value="image">Imagen</option>
                <option value="video">Video</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className="ui-label">Hero sort order</span>
              <input name="hero_sort_order" type="number" className="ui-input" defaultValue={heroBlock?.sort_order ?? 10} />
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--ui-text)] sm:col-span-2">
              <input type="checkbox" name="hero_is_published" defaultChecked={heroBlock?.is_published ?? true} />
              Hero publicado
            </label>
          </div>
        </div>

        <div className="ui-panel space-y-4">
          <div className="ui-h3">Galería (gallery_1, gallery_2, gallery_3)</div>
          <div className="grid gap-4 lg:grid-cols-3">
            {[gallery1, gallery2, gallery3].map((block, index) => {
              const slot = index + 1;
              return (
                <div key={`gallery-slot-${slot}`} className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 space-y-3">
                  <div className="ui-label">Gallery {slot}</div>
                  <label className="space-y-2 block">
                    <span className="ui-label">Title</span>
                    <input
                      name={`gallery_${slot}_title`}
                      className="ui-input"
                      defaultValue={block?.title ?? `Gallery ${slot}`}
                    />
                  </label>
                  <WebsiteMediaUploadField
                    label="Media URL"
                    name={`gallery_${slot}_media_url`}
                    defaultValue={block?.media_url ?? ""}
                    scope={`website/venues/${restaurant.slug}/gallery-${slot}`}
                    accept="image/*,video/*"
                  />
                  <label className="space-y-2 block">
                    <span className="ui-label">Media type</span>
                    <select name={`gallery_${slot}_media_type`} className="ui-input" defaultValue={block?.media_type ?? "image"}>
                      <option value="">Sin media</option>
                      <option value="image">Imagen</option>
                      <option value="video">Video</option>
                    </select>
                  </label>
                  <label className="space-y-2 block">
                    <span className="ui-label">Sort order</span>
                    <input
                      name={`gallery_${slot}_sort_order`}
                      type="number"
                      className="ui-input"
                      defaultValue={block?.sort_order ?? 20 + slot * 10}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-[var(--ui-text)]">
                    <input
                      type="checkbox"
                      name={`gallery_${slot}_is_published`}
                      defaultChecked={block?.is_published ?? true}
                    />
                    Publicado
                  </label>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="ui-btn ui-btn--brand">
            Guardar detalle del venue
          </button>
          <Link href="/website-cms/venues" className="ui-btn ui-btn--ghost">
            Volver al listado
          </Link>
        </div>
      </form>
    </div>
  );
}
