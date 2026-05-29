import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { PageHeader } from "@/components/vento/standard/page-header";
import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const SCREEN_LABELS: Record<string, string> = {
  home: "Home",
  satellite_hub: "Hub satélite",
  order_home: "Pedir (modalidad)",
  order_menu: "Menú",
  order_checkout: "Checkout",
  my_orders: "Mis pedidos",
};

type BlockRow = {
  id: string;
  app_key: string;
  screen_key: string;
  section_key: string;
  locale: string;
  sort_order: number;
  is_enabled: boolean;
  payload: Record<string, unknown>;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function asBool(value: FormDataEntryValue | null) {
  return value === "on" || value === "true";
}

function asNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function updateContentBlock(formData: FormData) {
  "use server";
  const supabase = await createClient();

  const id = asText(formData.get("id"));
  const payloadRaw = asText(formData.get("payload"));

  if (!id) {
    redirect("/content-blocks?error=" + encodeURIComponent("ID inválido."));
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(payloadRaw || "{}") as Record<string, unknown>;
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      throw new Error("Payload debe ser un objeto JSON.");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Payload debe ser un objeto JSON válido.";
    redirect(`/content-blocks/${id}?error=${encodeURIComponent(msg)}`);
  }

  const sortOrder = asNumber(formData.get("sort_order")) ?? 100;
  const isEnabled = asBool(formData.get("is_enabled"));

  const { error } = await supabase
    .from("app_content_blocks")
    .update({
      payload,
      sort_order: sortOrder,
      is_enabled: isEnabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    redirect(`/content-blocks/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/content-blocks/${id}`);
  revalidatePath("/content-blocks");
  redirect("/content-blocks?ok=" + encodeURIComponent("Bloque actualizado."));
}

function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function ContentBlockEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const okMsg = sp.ok ? safeDecode(sp.ok) : "";
  const errorMsg = sp.error ? safeDecode(sp.error) : "";
  const { id } = await params;

  const { supabase } = await requireAppAccess({
    appId: "viso",
    returnTo: `/content-blocks/${id}`,
  });

  const { data } = await supabase
    .from("app_content_blocks")
    .select("id, app_key, screen_key, section_key, locale, sort_order, is_enabled, payload")
    .eq("id", id)
    .maybeSingle();

  if (!data) {
    redirect("/content-blocks?error=" + encodeURIComponent("Bloque no encontrado."));
  }

  const block = data as BlockRow;
  const payloadStr = JSON.stringify(block.payload ?? {}, null, 2);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Editar bloque de contenido"
        subtitle={`Pantalla: ${SCREEN_LABELS[block.screen_key] ?? block.screen_key} · Sección: ${block.section_key}`}
        actions={
          <Link href="/content-blocks" className="ui-btn ui-btn--ghost">
            Volver
          </Link>
        }
      />

      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}

      <form action={updateContentBlock} className="space-y-6">
        <input type="hidden" name="id" value={block.id} />

        <div className="ui-panel space-y-4">
          <div className="ui-h3">Identificación</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="ui-label">App</span>
              <div className="mt-1 font-mono text-sm text-[var(--ui-muted)]">{block.app_key}</div>
            </div>
            <div>
              <span className="ui-label">Pantalla</span>
              <div className="mt-1 font-mono text-sm text-[var(--ui-muted)]">
                {SCREEN_LABELS[block.screen_key] ?? block.screen_key}
              </div>
            </div>
            <div>
              <span className="ui-label">Sección</span>
              <div className="mt-1 font-mono text-sm text-[var(--ui-muted)]">{block.section_key}</div>
            </div>
            <div>
              <span className="ui-label">Idioma</span>
              <div className="mt-1 font-mono text-sm text-[var(--ui-muted)]">{block.locale}</div>
            </div>
          </div>
        </div>

        <div className="ui-panel space-y-4">
          <div className="ui-h3">Configuración</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="ui-label">Orden (sort_order)</span>
              <input
                type="number"
                name="sort_order"
                className="ui-input"
                defaultValue={block.sort_order}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--ui-text)]">
              <input
                type="checkbox"
                name="is_enabled"
                defaultChecked={block.is_enabled}
              />
              Bloque visible en la app
            </label>
          </div>
        </div>

        <div className="ui-panel space-y-4">
          <div className="ui-h3">Payload (JSON)</div>
          <p className="ui-caption">
            Objeto JSON con los textos y opciones que usa la app. Las claves dependen de la pantalla y sección (ej. title, subtitle, label, delivery_eta). Debe ser un objeto válido.
          </p>
          <label className="space-y-2 block">
            <span className="ui-label">Contenido</span>
            <textarea
              name="payload"
              className="ui-input font-mono text-sm min-h-[280px]"
              defaultValue={payloadStr}
              spellCheck={false}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="ui-btn ui-btn--brand">
            Guardar cambios
          </button>
          <Link href="/content-blocks" className="ui-btn ui-btn--ghost">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
