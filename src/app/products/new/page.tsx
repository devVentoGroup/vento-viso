import { redirect } from "next/navigation";

import { ProductForm } from "@/components/viso/product-form";
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

function asPoints(value: FormDataEntryValue | null) {
  const parsed = Number(asText(value));
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(1, Math.round(parsed));
}

function parseMetadata(extraRaw: string, imageUrl: string, category: string) {
  let extra: Record<string, unknown> = {};
  if (extraRaw) {
    try {
      const parsed = JSON.parse(extraRaw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        extra = parsed as Record<string, unknown>;
      }
    } catch {
      return { metadata: null, error: "Metadata extra debe ser un JSON valido." };
    }
  }

  const metadata = {
    ...extra,
    image_url: imageUrl || null,
    category: category || null,
  };

  return { metadata, error: "" };
}

async function createProduct(formData: FormData) {
  "use server";
  const supabase = await createClient();

  const code = asText(formData.get("code"));
  const name = asText(formData.get("name"));
  const siteId = asText(formData.get("site_id"));
  const description = asText(formData.get("description"));
  const imageUrl = asText(formData.get("image_url"));
  const category = asText(formData.get("category"));

  if (!code || !name || !siteId) {
    redirect("/products/new?error=" + encodeURIComponent("Faltan campos obligatorios."));
  }

  const { metadata, error: metadataError } = parseMetadata(
    asText(formData.get("metadata_extra")),
    imageUrl,
    category
  );
  if (metadataError) {
    redirect("/products/new?error=" + encodeURIComponent(metadataError));
  }

  const { error } = await supabase.from("loyalty_rewards").insert({
    code,
    name,
    description: description || null,
    points_cost: asPoints(formData.get("points_cost")),
    site_id: siteId,
    is_active: asBool(formData.get("is_active")),
    metadata,
  });

  if (error) {
    redirect("/products/new?error=" + encodeURIComponent(error.message));
  }

  redirect("/products?ok=" + encodeURIComponent("Producto creado."));
}

function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function NewProductPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const errorMsg = sp.error ? safeDecode(sp.error) : "";

  const { supabase } = await requireAppAccess({
    appId: "viso",
    returnTo: "/products/new",
  });

  const { data: sites } = await supabase
    .from("sites")
    .select("id,code,name,is_active")
    .order("name", { ascending: true });

  return (
    <div className="space-y-6">
      <PageHeader title="Crear producto" subtitle="Configura items de canje para Vento Pass." />

      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}

      <ProductForm
        mode="create"
        action={createProduct}
        sites={sites ?? []}
        initial={{
          code: "",
          name: "",
          description: "",
          points_cost: 100,
          is_active: true,
          site_id: sites?.[0]?.id ?? "",
          category: "",
          image_url: "",
          metadata_extra: "",
        }}
      />
    </div>
  );
}

