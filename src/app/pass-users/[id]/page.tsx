import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { PageHeader } from "@/components/vento/standard/page-header";
import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type UserRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  document_id: string | null;
  document_type: string | null;
  birth_date: string | null;
  loyalty_points: number | null;
  is_active: boolean | null;
  is_client: boolean | null;
  marketing_opt_in: boolean | null;
  has_reviewed_google: boolean | null;
  role: string | null;
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

function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function updateUser(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const id = asText(formData.get("id"));

  if (!id) {
    redirect("/pass-users?error=" + encodeURIComponent("Usuario invalido."));
  }

  const payload = {
    full_name: asText(formData.get("full_name")) || null,
    email: asText(formData.get("email")) || null,
    phone: asText(formData.get("phone")) || null,
    document_type: asText(formData.get("document_type")) || null,
    document_id: asText(formData.get("document_id")) || null,
    birth_date: asText(formData.get("birth_date")) || null,
    loyalty_points: asNumber(formData.get("loyalty_points")) ?? 0,
    is_active: asBool(formData.get("is_active")),
    is_client: asBool(formData.get("is_client")),
    marketing_opt_in: asBool(formData.get("marketing_opt_in")),
    has_reviewed_google: asBool(formData.get("has_reviewed_google")),
  };

  const { error } = await supabase.from("users").update(payload).eq("id", id);

  if (error) {
    redirect(`/pass-users/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/pass-users/${id}`);
  redirect(`/pass-users/${id}?ok=updated`);
}

async function deleteUser(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const id = asText(formData.get("id"));

  if (!id) {
    redirect("/pass-users?error=" + encodeURIComponent("Usuario invalido."));
  }

  const { error } = await supabase.from("users").delete().eq("id", id);

  if (error) {
    redirect(`/pass-users/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/pass-users");
  redirect("/pass-users?ok=deleted");
}

export default async function PassUserDetailPage({
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
    returnTo: `/pass-users/${id}`,
  });

  const { data: user } = await supabase
    .from("users")
    .select(
      "id,full_name,email,phone,document_id,document_type,birth_date,loyalty_points,is_active,is_client,marketing_opt_in,has_reviewed_google,role"
    )
    .eq("id", id)
    .maybeSingle();

  if (!user) {
    redirect("/pass-users?error=" + encodeURIComponent("Usuario no encontrado."));
  }

  const profile = user as UserRow;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Editar usuario Pass"
        subtitle="Actualiza perfil, puntos y estado."
        actions={
          <Link href="/pass-users" className="ui-btn ui-btn--ghost">
            Volver
          </Link>
        }
      />

      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">Listo: {okMsg}</div> : null}

      <div className="ui-panel space-y-6">
        <form action={updateUser} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="id" value={profile.id} />
          <label className="space-y-2 sm:col-span-2">
            <span className="ui-label">Nombre completo</span>
            <input name="full_name" className="ui-input" defaultValue={profile.full_name ?? ""} />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Email</span>
            <input name="email" className="ui-input" defaultValue={profile.email ?? ""} />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Telefono</span>
            <input name="phone" className="ui-input" defaultValue={profile.phone ?? ""} />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Tipo documento</span>
            <input name="document_type" className="ui-input" defaultValue={profile.document_type ?? ""} />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Documento</span>
            <input name="document_id" className="ui-input" defaultValue={profile.document_id ?? ""} />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Fecha nacimiento</span>
            <input name="birth_date" type="date" className="ui-input" defaultValue={profile.birth_date ?? ""} />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Puntos</span>
            <input name="loyalty_points" type="number" className="ui-input" defaultValue={profile.loyalty_points ?? 0} />
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--ui-text)]">
            <input type="checkbox" name="is_active" defaultChecked={Boolean(profile.is_active)} />
            Activo
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--ui-text)]">
            <input type="checkbox" name="is_client" defaultChecked={Boolean(profile.is_client)} />
            Es cliente
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--ui-text)]">
            <input type="checkbox" name="marketing_opt_in" defaultChecked={Boolean(profile.marketing_opt_in)} />
            Marketing opt-in
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--ui-text)]">
            <input type="checkbox" name="has_reviewed_google" defaultChecked={Boolean(profile.has_reviewed_google)} />
            Review Google
          </label>
          <div className="flex items-center gap-2 sm:col-span-2">
            <button type="submit" className="ui-btn ui-btn--brand">
              Guardar cambios
            </button>
          </div>
        </form>
        <form action={deleteUser} className="flex items-center gap-2">
          <input type="hidden" name="id" value={profile.id} />
          <button type="submit" className="ui-btn ui-btn--danger">
            Eliminar
          </button>
        </form>
      </div>
    </div>
  );
}