import { redirect } from "next/navigation";

import { PageHeader } from "@/components/vento/standard/page-header";
import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function createUser(formData: FormData) {
  "use server";
  const supabase = await createClient();

  const fullName = asText(formData.get("full_name"));
  const email = asText(formData.get("email"));

  if (!fullName && !email) {
    redirect("/pass-users/new?error=" + encodeURIComponent("Nombre o email son obligatorios."));
  }

  const payload = {
    id: crypto.randomUUID(),
    full_name: fullName || null,
    email: email || null,
    phone: asText(formData.get("phone")) || null,
    document_type: asText(formData.get("document_type")) || null,
    document_id: asText(formData.get("document_id")) || null,
    birth_date: asText(formData.get("birth_date")) || null,
    loyalty_points: asNumber(formData.get("loyalty_points")) ?? 0,
    role: "client",
    is_client: true,
    is_active: true,
  };

  const { error } = await supabase.from("users").insert(payload);

  if (error) {
    redirect("/pass-users/new?error=" + encodeURIComponent(error.message));
  }

  redirect("/pass-users?ok=" + encodeURIComponent("Usuario creado."));
}

function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function NewPassUserPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const errorMsg = sp.error ? safeDecode(sp.error) : "";

  await requireAppAccess({
    appId: "viso",
    returnTo: "/pass-users/new",
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Crear usuario Pass"
        subtitle="Alta manual de cliente y saldo inicial."
      />

      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}

      <div className="ui-panel">
        <form action={createUser} className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 sm:col-span-2">
            <span className="ui-label">Nombre completo</span>
            <input name="full_name" className="ui-input" placeholder="Nombre y apellido" />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Email</span>
            <input name="email" className="ui-input" placeholder="correo@dominio.com" />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Telefono</span>
            <input name="phone" className="ui-input" />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Tipo documento</span>
            <input name="document_type" className="ui-input" />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Documento</span>
            <input name="document_id" className="ui-input" />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Fecha nacimiento</span>
            <input name="birth_date" type="date" className="ui-input" />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Puntos iniciales</span>
            <input name="loyalty_points" type="number" className="ui-input" defaultValue={0} />
          </label>
          <div className="flex items-center gap-2 sm:col-span-2">
            <button type="submit" className="ui-btn ui-btn--brand">
              Crear usuario
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}