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
  asText,
  normalizeSlug,
  safeDecode,
} from "@/lib/website-cms";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  restaurant: "Restaurante",
  job: "Empleo / Vacante",
  service: "Servicio",
  event: "Evento",
  app: "App / Ecosistema",
};

async function createWebsiteItem(formData: FormData) {
  "use server";
  await requireAppAccess({ appId: "viso", returnTo: "/website-cms/items/new" });

  const supabase = createAdminClient();
  const category = asText(formData.get("category"));
  const title = asText(formData.get("title"));

  if (!category || !title) {
    redirect("/website-cms/items/new?error=" + encodeURIComponent("El tipo y el nombre son obligatorios."));
  }
  if (!WEBSITE_ITEM_CATEGORIES.includes(category as (typeof WEBSITE_ITEM_CATEGORIES)[number])) {
    redirect("/website-cms/items/new?error=" + encodeURIComponent("Tipo de contenido invalido."));
  }

  // Auto-generar slug desde el titulo
  let baseSlug = normalizeSlug(title);
  if (!baseSlug) baseSlug = "item-" + Date.now().toString(36);

  // Verificar colisiones y agregar sufijo si ya existe
  const { data: existing } = await supabase
    .from("website_items")
    .select("slug")
    .eq("category", category)
    .like("slug", `${baseSlug}%`);
  const existingSlugs = new Set((existing ?? []).map((r: { slug: string }) => r.slug));
  let slug = baseSlug;
  if (existingSlugs.has(slug)) {
    let i = 2;
    while (existingSlugs.has(`${baseSlug}-${i}`)) i++;
    slug = `${baseSlug}-${i}`;
  }

  // Auto-calcular orden: max actual de la categoria + 10
  const { data: maxData } = await supabase
    .from("website_items")
    .select("sort_order")
    .eq("category", category)
    .order("sort_order", { ascending: false })
    .limit(1);
  const maxOrder = (maxData as { sort_order: number }[] | null)?.[0]?.sort_order ?? 0;
  const sort_order = maxOrder + 10;

  const payload = {
    category,
    slug,
    title,
    excerpt: asNullableText(formData.get("excerpt")),
    body: asNullableText(formData.get("body")),
    location: asNullableText(formData.get("location")),
    schedule_text: asNullableText(formData.get("schedule_text")),
    start_at: category === "event" ? asNullableDate(formData.get("start_at")) : null,
    end_at: category === "event" ? asNullableDate(formData.get("end_at")) : null,
    image_url: asNullableText(formData.get("image_url")),
    video_url: asNullableText(formData.get("video_url")),
    action_label: asNullableText(formData.get("action_label")),
    action_url: asNullableText(formData.get("action_url")),
    sort_order,
    is_published: asBool(formData.get("is_published")),
  };

  const { data: created, error } = await supabase.from("website_items").insert(payload).select("id,category,slug").single();
  if (error) redirect("/website-cms/items/new?error=" + encodeURIComponent(error.message));

  // Redirigir al editor completo del nuevo item
  if (created?.category === "restaurant") {
    redirect(`/website-cms/venues/${encodeURIComponent(created.slug)}?ok=${encodeURIComponent("Restaurante creado. Completa la foto y el detalle.")}`);
  }
  redirect(`/website-cms/items/${created?.id}?ok=${encodeURIComponent("Creado correctamente. Ahora completa los datos.")}`);
}

export default async function WebsiteItemNewPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; tipo?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const errorMsg = sp.error ? safeDecode(sp.error) : "";
  const selectedType = (sp.tipo as string) || "restaurant";

  await requireAppAccess({ appId: "viso", returnTo: "/website-cms/items/new" });

  const isEvent = selectedType === "event";
  const isJob = selectedType === "job";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agregar nuevo contenido"
        subtitle="Crea un restaurante, empleo, evento, servicio o app para el sitio web."
        actions={
          <Link href="/website-cms" className="ui-btn ui-btn--ghost">Volver</Link>
        }
      />

      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}

      {/* ── Selector de tipo (recarga la pagina para mostrar los campos correctos) ── */}
      <div className="ui-panel space-y-3">
        <div className="ui-h3">Que quieres agregar?</div>
        <div className="flex flex-wrap gap-2">
          {WEBSITE_ITEM_CATEGORIES.map((cat) => (
            <Link
              key={cat}
              href={`/website-cms/items/new?tipo=${cat}`}
              className={`ui-btn ${selectedType === cat ? "ui-btn--brand" : "ui-btn--ghost"}`}
            >
              {CATEGORY_LABELS[cat] ?? cat}
            </Link>
          ))}
        </div>
        <div className="ui-caption text-sm">
          {selectedType === "restaurant" && "Un restaurante del portafolio de ventogroup.co/restaurantes"}
          {selectedType === "job" && "Una vacante disponible que aparecera en ventogroup.co/empleos"}
          {selectedType === "service" && "Un servicio del grupo en ventogroup.co/servicios"}
          {selectedType === "event" && "Un evento o activacion en ventogroup.co/eventos"}
          {selectedType === "app" && "Una app del ecosistema en ventogroup.co/ecosistema"}
        </div>
      </div>

      <form action={createWebsiteItem} className="space-y-6">
        {/* Campo oculto para el tipo ya seleccionado */}
        <input type="hidden" name="category" value={selectedType} />

        {/* ── Datos basicos ────────────────────────────────────────── */}
        <div className="ui-panel space-y-4">
          <div>
            <div className="ui-h3">
              {selectedType === "restaurant" ? "Nombre del restaurante" :
               selectedType === "job" ? "Nombre del cargo" :
               selectedType === "event" ? "Nombre del evento" :
               selectedType === "service" ? "Nombre del servicio" :
               "Nombre"}
            </div>
            <div className="ui-caption">
              La URL interna se genera automaticamente a partir del nombre.
            </div>
          </div>

          <label className="space-y-1 block">
            <span className="ui-label">
              {selectedType === "restaurant" ? "Nombre del restaurante" :
               selectedType === "job" ? "Titulo de la vacante" :
               selectedType === "event" ? "Nombre del evento" :
               selectedType === "service" ? "Nombre del servicio" :
               "Nombre"}
              {" "}*
            </span>
            <input
              name="title"
              className="ui-input"
              required
              placeholder={
                selectedType === "restaurant" ? "Ej: Vento Cafe" :
                selectedType === "job" ? "Ej: Jefe de cocina — turno manana" :
                selectedType === "event" ? "Ej: Cena de maridaje — Casa Vento" :
                selectedType === "service" ? "Ej: Consultoria de apertura" :
                "Nombre del item"
              }
            />
          </label>

          <label className="space-y-1 block">
            <span className="ui-label">
              {selectedType === "job" ? "Descripcion del cargo" : "Descripcion corta"}
            </span>
            <span className="ui-caption block">
              {selectedType === "job"
                ? "Resume las responsabilidades principales. Aparece en la tarjeta de la vacante."
                : "1-2 lineas que aparecen en la tarjeta. Puedes completarla despues."}
            </span>
            <textarea
              name="excerpt"
              className="ui-input min-h-20 py-3"
              placeholder={
                selectedType === "restaurant" ? "Ej: Cocina italiana de autor en el corazon de Cucuta." :
                selectedType === "job" ? "Ej: Buscamos un jefe de cocina apasionado con experiencia en brigadas..." :
                selectedType === "event" ? "Ej: Una noche de cata guiada con los mejores vinos de la region." :
                "Descripcion breve"
              }
            />
          </label>

          {/* Fechas: solo para eventos */}
          {isEvent && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="ui-label">Fecha y hora de inicio</span>
                <input name="start_at" type="datetime-local" className="ui-input" />
              </label>
              <label className="space-y-1">
                <span className="ui-label">Fecha y hora de fin</span>
                <input name="end_at" type="datetime-local" className="ui-input" />
              </label>
            </div>
          )}
        </div>

        {/* ── Ubicacion y horario ───────────────────────────────────── */}
        <div className="ui-panel space-y-4">
          <div className="ui-h3">
            {isJob ? "Sede y tipo de contrato" : isEvent ? "Lugar y fecha" : "Ubicacion y horario"}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="ui-label">{isJob ? "Sede o modalidad" : isEvent ? "Lugar del evento" : "Ubicacion"}</span>
              <input
                name="location"
                className="ui-input"
                placeholder={isJob ? "Bogota - Zona T / Remoto" : isEvent ? "Casa Vento - Zona G" : "Cucuta - Centro"}
              />
            </label>
            <label className="space-y-1">
              <span className="ui-label">{isJob ? "Tipo de contrato" : isEvent ? "Fecha y hora (texto)" : "Horario"}</span>
              <input
                name="schedule_text"
                className="ui-input"
                placeholder={isJob ? "Tiempo completo" : isEvent ? "Sabado 14 jun — 7:00 PM" : "Lunes a sabado 12:00 - 22:00"}
              />
            </label>
          </div>
        </div>

        {/* ── Boton de accion ───────────────────────────────────────── */}
        <div className="ui-panel space-y-4">
          <div>
            <div className="ui-h3">Boton de accion</div>
            <div className="ui-caption">El boton que aparece en la tarjeta. Puedes completarlo despues.</div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="ui-label">Texto del boton</span>
              <input
                name="action_label"
                className="ui-input"
                placeholder={isJob ? "Aplicar ahora" : selectedType === "restaurant" ? "Ver restaurante" : isEvent ? "Reservar cupo" : "Ver mas"}
              />
            </label>
            <label className="space-y-1">
              <span className="ui-label">Link del boton</span>
              <input
                name="action_url"
                className="ui-input"
                placeholder={isJob ? "https://forms.gle/... o mailto:empleos@ventogroup.co" : "https://..."}
              />
            </label>
          </div>
        </div>

        {/* ── Foto y estado ─────────────────────────────────────────── */}
        <div className="ui-panel space-y-4">
          <div>
            <div className="ui-h3">Foto y estado</div>
            <div className="ui-caption">Puedes subir la foto ahora o despues desde el editor completo.</div>
          </div>
          <WebsiteMediaUploadField
            label="Foto principal"
            name="image_url"
            scope={`website/items/${selectedType}/new/images`}
            accept="image/*"
          />
          <div className="flex items-start gap-3 pt-2 border-t border-[var(--ui-border,#e5e7eb)]">
            <input type="checkbox" name="is_published" id="is_published_new" defaultChecked className="mt-0.5" />
            <label htmlFor="is_published_new" className="text-sm cursor-pointer">
              <strong>Publicar de inmediato</strong>
              <span className="block text-xs text-[var(--ui-text-muted,#888)] mt-0.5">
                Desmarca si quieres guardar como borrador y publicar luego.
              </span>
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="ui-btn ui-btn--brand">
            Crear y continuar editando
          </button>
          <Link href="/website-cms" className="ui-btn ui-btn--ghost">Cancelar</Link>
        </div>
      </form>
    </div>
  );
}
