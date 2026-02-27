import { redirect } from "next/navigation";

import { BusinessForm } from "@/components/viso/business-form";
import { PageHeader } from "@/components/vento/standard/page-header";
import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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

async function createBusiness(formData: FormData) {
  "use server";
  const supabase = await createClient();

  const code = asText(formData.get("code"));
  const name = asText(formData.get("name"));
  const siteCode = asText(formData.get("site_code")).toUpperCase();
  const siteName = asText(formData.get("site_name"));
  const siteType = asText(formData.get("site_type")) || "satellite";

  if (!code || !name || !siteCode || !siteName) {
    redirect("/businesses/new?error=" + encodeURIComponent("Faltan campos obligatorios."));
  }

  const { data: siteRow, error: siteError } = await supabase
    .from("sites")
    .insert({
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
    .select("id")
    .single();

  if (siteError || !siteRow) {
    redirect("/businesses/new?error=" + encodeURIComponent(siteError?.message || "No se pudo crear la sede."));
  }

  const satellitePayload = {
    code,
    name,
    subtitle: asText(formData.get("subtitle")) || null,
    tags: parseTags(asText(formData.get("tags"))),
    site_id: siteRow.id,
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
    .insert(satellitePayload);

  if (satelliteError) {
    await supabase.from("sites").delete().eq("id", siteRow.id);
    redirect("/businesses/new?error=" + encodeURIComponent(satelliteError.message));
  }

  redirect("/businesses?ok=" + encodeURIComponent("Negocio creado."));
}

function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function NewBusinessPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const errorMsg = sp.error ? safeDecode(sp.error) : "";

  await requireAppAccess({
    appId: "viso",
    returnTo: "/businesses/new",
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Crear negocio"
        subtitle="Alta completa de sede y configuracion Vento Pass."
      />

      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}

      <BusinessForm
        mode="create"
        action={createBusiness}
        initial={{
          code: "",
          name: "",
          subtitle: "",
          tags: "",
          sort_order: 0,
          is_active: true,
          logo_url: "",
          watermark_icon: "",
          gradient_start: "#F6F2FF",
          gradient_end: "#EFE8FF",
          accent_color: "#A855F7",
          text_color: "#1B1033",
          text_secondary_color: "#6B5A88",
          primary_color: "#A855F7",
          background_color: "#FFF9F2",
          indicator_color: "#A855F7",
          loading_color: "#A855F7",
          border_color: "#E6DFF5",
          card_color: "#FFFFFF",
          review_url: "",
          maps_url: "",
          address_override: "",
          latitude_override: "",
          longitude_override: "",
          site_code: "",
          site_name: "",
          site_type: "satellite",
          site_address: "",
          site_latitude: "",
          site_longitude: "",
          site_is_public: true,
          site_is_active: true,
        }}
      />
    </div>
  );
}