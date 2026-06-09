import { redirect } from "next/navigation";

import { VacancyForm } from "@/components/viso/vacancy-form";
import { PageHeader } from "@/components/vento/standard/page-header";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableText(value: FormDataEntryValue | null) {
  const parsed = asText(value);
  return parsed || null;
}

function asNullableNumber(value: FormDataEntryValue | null) {
  const raw = asText(value);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

async function createVacancy(formData: FormData) {
  "use server";

  await requireAppAccess({
    appId: "viso",
    returnTo: "/vacancies/new",
  });

  const supabase = createAdminClient();

  const title = asText(formData.get("title"));
  const slug = asText(formData.get("slug"));
  const description = asText(formData.get("description"));
  const status = asText(formData.get("status")) || "draft";

  if (!title || !slug || !description) {
    redirect("/vacancies/new?error=" + encodeURIComponent("Título, slug y descripción son obligatorios."));
  }

  const payload = {
    title,
    slug,
    description,
    city: asNullableText(formData.get("city")),
    site_id: asNullableText(formData.get("site_id")),
    employment_type: asNullableText(formData.get("employment_type")),
    schedule_type: asNullableText(formData.get("schedule_type")),
    salary_min: asNullableNumber(formData.get("salary_min")),
    salary_max: asNullableNumber(formData.get("salary_max")),
    status,
    published_at: status === "published" ? new Date().toISOString() : null,
    closed_at: status === "closed" ? new Date().toISOString() : null,
  };

  const { error } = await supabase.schema("talento").from("vacancies").insert(payload);

  if (error) {
    redirect("/vacancies/new?error=" + encodeURIComponent(error.message));
  }

  redirect("/vacancies?ok=" + encodeURIComponent("Vacante creada."));
}

function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function NewVacancyPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const errorMsg = sp.error ? safeDecode(sp.error) : "";

  await requireAppAccess({
    appId: "viso",
    returnTo: "/vacancies/new",
  });

  const supabase = createAdminClient();
  const { data: sites } = await supabase
    .from("sites")
    .select("id,code,name,is_active")
    .order("name", { ascending: true });

  return (
    <div className="space-y-6">
      <PageHeader title="Crear vacante" subtitle="Publica una posicion para la app Vento Talento." />
      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}
      <VacancyForm
        mode="create"
        action={createVacancy}
        sites={sites ?? []}
        initial={{
          title: "",
          slug: "",
          description: "",
          city: "",
          employment_type: "",
          schedule_type: "",
          salary_min: "",
          salary_max: "",
          status: "draft",
          site_id: sites?.[0]?.id ?? "",
        }}
      />
    </div>
  );
}
