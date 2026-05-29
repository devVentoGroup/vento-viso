import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { ProductForm } from "@/components/viso/product-form";
import { PageHeader } from "@/components/vento/standard/page-header";
import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RewardRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  points_cost: number;
  is_active: boolean;
  site_id: string | null;
  metadata: Record<string, unknown> | null;
};

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

async function updateProduct(formData: FormData) {
  "use server";
  const supabase = await createClient();

  const id = asText(formData.get("id"));
  const code = asText(formData.get("code"));
  const name = asText(formData.get("name"));
  const siteId = asText(formData.get("site_id"));
  const description = asText(formData.get("description"));
  const imageUrl = asText(formData.get("image_url"));
  const category = asText(formData.get("category"));

  if (!id || !code || !name || !siteId) {
    redirect(`/products/${id}?error=${encodeURIComponent("Faltan campos obligatorios.")}`);
  }

  const { metadata, error: metadataError } = parseMetadata(
    asText(formData.get("metadata_extra")),
    imageUrl,
    category
  );
  if (metadataError) {
    redirect(`/products/${id}?error=${encodeURIComponent(metadataError)}`);
  }

  const { error } = await supabase
    .from("loyalty_rewards")
    .update({
      code,
      name,
      description: description || null,
      points_cost: asPoints(formData.get("points_cost")),
      site_id: siteId,
      is_active: asBool(formData.get("is_active")),
      metadata,
    })
    .eq("id", id);

  if (error) {
    redirect(`/products/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/products/${id}`);
  revalidatePath("/products");
  redirect("/products?ok=" + encodeURIComponent("Producto actualizado."));
}

async function disableProduct(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const id = asText(formData.get("id"));
  if (!id) {
    redirect("/products?error=" + encodeURIComponent("Producto invalido."));
  }

  const { error } = await supabase.from("loyalty_rewards").update({ is_active: false }).eq("id", id);
  if (error) {
    redirect(`/products/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/products/${id}`);
  revalidatePath("/products");
  redirect(`/products/${id}?ok=${encodeURIComponent("Producto deshabilitado.")}`);
}

async function deleteProduct(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const id = asText(formData.get("id"));
  if (!id) {
    redirect("/products?error=" + encodeURIComponent("Producto invalido."));
  }

  const { error } = await supabase.from("loyalty_rewards").delete().eq("id", id);
  if (error) {
    redirect(`/products/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/products");
  redirect("/products?ok=" + encodeURIComponent("Producto eliminado."));
}

function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function ProductDetailPage({
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
    returnTo: `/products/${id}`,
  });

  const [{ data: product }, { data: sites }] = await Promise.all([
    supabase
      .from("loyalty_rewards")
      .select("id,code,name,description,points_cost,is_active,site_id,metadata")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("sites").select("id,code,name,is_active").order("name", { ascending: true }),
  ]);

  if (!product) {
    redirect("/products?error=" + encodeURIComponent("Producto no encontrado."));
  }

  const row = product as RewardRow;
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const imageUrl = typeof metadata.image_url === "string" ? metadata.image_url : "";
  const category = typeof metadata.category === "string" ? metadata.category : "";

  const metadataExtra = { ...metadata };
  delete metadataExtra.image_url;
  delete metadataExtra.category;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Editar producto"
        subtitle="Ajusta puntos, imagen y datos visibles en Vento Pass."
        actions={<Link href="/products" className="ui-btn ui-btn--ghost">Volver</Link>}
      />

      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}

      <ProductForm
        mode="edit"
        action={updateProduct}
        sites={sites ?? []}
        initial={{
          id: row.id,
          code: row.code,
          name: row.name,
          description: row.description ?? "",
          points_cost: row.points_cost,
          is_active: row.is_active,
          site_id: row.site_id ?? "",
          category,
          image_url: imageUrl,
          metadata_extra: Object.keys(metadataExtra).length ? JSON.stringify(metadataExtra, null, 2) : "",
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <form action={disableProduct}><input type="hidden" name="id" value={row.id} /><button type="submit" className="ui-btn ui-btn--ghost">Deshabilitar</button></form>
        <form action={deleteProduct}><input type="hidden" name="id" value={row.id} /><button type="submit" className="ui-btn ui-btn--danger">Eliminar producto</button></form>
      </div>
    </div>
  );
}

