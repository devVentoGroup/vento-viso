import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { BusinessForm } from "@/components/viso/business-form";
import { PageHeader } from "@/components/vento/standard/page-header";
import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SiteRow = {
  id: string;
  code: string | null;
  name: string | null;
  site_type: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  is_public: boolean | null;
  is_active: boolean | null;
};

type SatelliteRow = {
  id: string;
  code: string | null;
  name: string | null;
  subtitle: string | null;
  tags: string[] | null;
  logo_url: string | null;
  watermark_icon: string | null;
  gradient_start: string | null;
  gradient_end: string | null;
  accent_color: string | null;
  primary_color: string | null;
  background_color: string | null;
  text_color: string | null;
  text_secondary_color: string | null;
  card_color: string | null;
  border_color: string | null;
  indicator_color: string | null;
  loading_color: string | null;
  review_url: string | null;
  maps_url: string | null;
  address_override: string | null;
  latitude_override: number | null;
  longitude_override: number | null;
  sort_order: number | null;
  is_active: boolean | null;
  site_id: string | null;
  site?: SiteRow | SiteRow[] | null;
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

function parseTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function siteKindFor(type: string) {
  if (type === "production_center") return "warehouse";
  if (type === "admin") return "admin";
  return "store";
}

async function updateBusiness(formData: FormData) {
  "use server";
  const supabase = await createClient();

  const id = asText(formData.get("id"));
  const siteId = asText(formData.get("site_id"));
  const code = asText(formData.get("code"));
  const name = asText(formData.get("name"));
  const siteCode = asText(formData.get("site_code")).toUpperCase();
  const siteName = asText(formData.get("site_name"));
  const siteType = asText(formData.get("site_type")) || "satellite";

  if (!id || !siteId || !code || !name || !siteCode || !siteName) {
    redirect(`/businesses/${id}?error=${encodeURIComponent("Faltan campos obligatorios.")}`);
  }

  const { error: siteError } = await supabase
    .from("sites")
    .update({
      code: siteCode,
      name: siteName,
      type: "operacional",
      site_type: siteType,
      site_kind: siteKindFor(siteType),
      is_active: asBool(formData.get("site_is_active")),
      is_public: asBool(formData.get("site_is_public")),
      address: asText(formData.get("site_address")) || null,
      latitude: asNumber(formData.get("site_latitude")),
      longitude: asNumber(formData.get("site_longitude")),
    })
    .eq("id", siteId);

  if (siteError) {
    redirect(`/businesses/${id}?error=${encodeURIComponent(siteError.message)}`);
  }

  const satellitePayload = {
    code,
    name,
    subtitle: asText(formData.get("subtitle")) || null,
    tags: parseTags(asText(formData.get("tags"))),
    logo_url: asText(formData.get("logo_url")) || null,
    watermark_icon: asText(formData.get("watermark_icon")) || null,
    gradient_start: asText(formData.get("gradient_start")) || null,
    gradient_end: asText(formData.get("gradient_end")) || null,
    accent_color: asText(formData.get("accent_color")) || null,
    primary_color: asText(formData.get("primary_color")) || null,
    background_color: asText(formData.get("background_color")) || null,
    text_color: asText(formData.get("text_color")) || null,
    text_secondary_color: asText(formData.get("text_secondary_color")) || null,
    card_color: asText(formData.get("card_color")) || null,
    border_color: asText(formData.get("border_color")) || null,
    indicator_color: asText(formData.get("indicator_color")) || null,
    loading_color: asText(formData.get("loading_color")) || null,
    review_url: asText(formData.get("review_url")) || null,
    maps_url: asText(formData.get("maps_url")) || null,
    address_override: asText(formData.get("address_override")) || null,
    latitude_override: asNumber(formData.get("latitude_override")),
    longitude_override: asNumber(formData.get("longitude_override")),
    sort_order: asNumber(formData.get("sort_order")) ?? 0,
    is_active: asBool(formData.get("is_active")),
  };

  const { error: satelliteError } = await supabase
    .from("pass_satellites")
    .update(satellitePayload)
    .eq("id", id);

  if (satelliteError) {
    redirect(`/businesses/${id}?error=${encodeURIComponent(satelliteError.message)}`);
  }

  revalidatePath(`/businesses/${id}`);
  redirect(`/businesses/${id}?ok=updated`);
}

async function deleteBusiness(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const id = asText(formData.get("id"));

  if (!id) {
    redirect("/businesses?error=" + encodeURIComponent("Negocio invalido."));
  }

  const { error } = await supabase.from("pass_satellites").delete().eq("id", id);

  if (error) {
    redirect(`/businesses/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/businesses");
  redirect("/businesses?ok=" + encodeURIComponent("Negocio eliminado."));
}

function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function BusinessDetailPage({
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
    returnTo: `/businesses/${id}`,
  });

  const { data } = await supabase
    .from("pass_satellites")
    .select(
      "id,code,name,subtitle,tags,logo_url,watermark_icon,gradient_start,gradient_end,accent_color,primary_color,background_color,text_color,text_secondary_color,card_color,border_color,indicator_color,loading_color,review_url,maps_url,address_override,latitude_override,longitude_override,sort_order,is_active,site_id,site:sites(id,code,name,site_type,address,latitude,longitude,is_public,is_active)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) {
    redirect("/businesses?error=" + encodeURIComponent("Negocio no encontrado."));
  }

  const business = data as SatelliteRow;
  const site = Array.isArray(business.site)
    ? business.site[0] ?? null
    : business.site ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Editar negocio"
        subtitle="Configura sede y estilo de Vento Pass."
        actions={
          <Link href="/businesses" className="ui-btn ui-btn--ghost">
            Volver
          </Link>
        }
      />

      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">Listo: {okMsg}</div> : null}

      <BusinessForm
        mode="edit"
        action={updateBusiness}
        initial={{
          id: business.id,
          site_id: business.site_id,
          code: business.code ?? "",
          name: business.name ?? "",
          subtitle: business.subtitle ?? "",
          tags: (business.tags ?? []).join(", "),
          sort_order: business.sort_order ?? 0,
          is_active: Boolean(business.is_active),
          logo_url: business.logo_url ?? "",
          watermark_icon: business.watermark_icon ?? "",
          gradient_start: business.gradient_start ?? "#F6F2FF",
          gradient_end: business.gradient_end ?? "#EFE8FF",
          accent_color: business.accent_color ?? "#A855F7",
          text_color: business.text_color ?? "#1B1033",
          text_secondary_color: business.text_secondary_color ?? "#6B5A88",
          primary_color: business.primary_color ?? business.accent_color ?? "#A855F7",
          background_color: business.background_color ?? "#FFF9F2",
          indicator_color: business.indicator_color ?? business.accent_color ?? "#A855F7",
          loading_color: business.loading_color ?? business.accent_color ?? "#A855F7",
          border_color: business.border_color ?? "#E6DFF5",
          card_color: business.card_color ?? "#FFFFFF",
          review_url: business.review_url ?? "",
          maps_url: business.maps_url ?? "",
          address_override: business.address_override ?? "",
          latitude_override: business.latitude_override ? String(business.latitude_override) : "",
          longitude_override: business.longitude_override ? String(business.longitude_override) : "",
          site_code: site?.code ?? "",
          site_name: site?.name ?? "",
          site_type: site?.site_type ?? "satellite",
          site_address: site?.address ?? "",
          site_latitude: site?.latitude ? String(site.latitude) : "",
          site_longitude: site?.longitude ? String(site.longitude) : "",
          site_is_public: Boolean(site?.is_public),
          site_is_active: Boolean(site?.is_active),
        }}
      />

      <form action={deleteBusiness} className="flex items-center gap-2">
        <input type="hidden" name="id" value={business.id} />
        <button type="submit" className="ui-btn ui-btn--danger">
          Eliminar negocio
        </button>
      </form>
    </div>
  );
}
