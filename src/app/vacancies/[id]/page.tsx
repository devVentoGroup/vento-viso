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

async function updateVacancy(formData: FormData) {
  "use server";

  const id = asText(formData.get("id"));

  await requireAppAccess({
    appId: "viso",
    returnTo: id ? `/vacancies/${id}` : "/vacancies",
  });

  const supabase = createAdminClient();
  const title = asText(formData.get("title"));
  const slug = asText(formData.get("slug"));
  const description = asText(formData.get("description"));
  const status = asText(formData.get("status")) || "draft";

  if (!id || !title || !slug || !description) {
    redirect("/vacancies?error=" + encodeURIComponent("Faltan campos obligatorios para guardar la vacante."));
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

  const { error } = await supabase.schema("talento").from("vacancies").update(payload).eq("id", id);

  if (error) {
    redirect(`/vacancies/${id}?error=` + encodeURIComponent(error.message));
  }

  redirect("/vacancies?ok=" + encodeURIComponent("Vacante actualizada."));
}

function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function EditVacancyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const errorMsg = sp.error ? safeDecode(sp.error) : "";

  await requireAppAccess({
    appId: "viso",
    returnTo: `/vacancies/${id}`,
  });

  const supabase = createAdminClient();
  const [{ data: vacancy, error: vacancyError }, { data: sites }] = await Promise.all([
    supabase
      .schema("talento")
      .from("vacancies")
      .select("id,title,slug,description,city,employment_type,schedule_type,salary_min,salary_max,status,site_id")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("sites").select("id,code,name,is_active").order("name", { ascending: true }),
  ]);

  if (vacancyError || !vacancy) {
    redirect("/vacancies?error=" + encodeURIComponent(vacancyError?.message ?? "Vacante no encontrada."));
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Editar vacante" subtitle="Ajusta lo que vera el candidato en Vento Talento." />
      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}
      <VacancyForm
        mode="edit"
        action={updateVacancy}
        sites={sites ?? []}
        initial={{
          id: vacancy.id,
          title: vacancy.title ?? "",
          slug: vacancy.slug ?? "",
          description: vacancy.description ?? "",
          city: vacancy.city ?? "",
          employment_type: vacancy.employment_type ?? "",
          schedule_type: vacancy.schedule_type ?? "",
          salary_min: vacancy.salary_min == null ? "" : String(vacancy.salary_min),
          salary_max: vacancy.salary_max == null ? "" : String(vacancy.salary_max),
          status: vacancy.status ?? "draft",
          site_id: vacancy.site_id ?? "",
        }}
      />
    </div>
  );
}
