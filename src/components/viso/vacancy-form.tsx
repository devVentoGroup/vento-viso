"use client";

import { useMemo, useState } from "react";

type SiteOption = {
  id: string;
  code: string | null;
  name: string | null;
  is_active?: boolean | null;
};

type VacancyFormValues = {
  id?: string;
  title: string;
  slug: string;
  description: string;
  city: string;
  employment_type: string;
  schedule_type: string;
  salary_min: string;
  salary_max: string;
  status: string;
  site_id: string;
};

type VacancyFormProps = {
  mode: "create" | "edit";
  sites: SiteOption[];
  initial: VacancyFormValues;
  action: (formData: FormData) => void | Promise<void>;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function VacancyForm({ mode, sites, initial, action }: VacancyFormProps) {
  const [title, setTitle] = useState(initial.title);
  const [slug, setSlug] = useState(initial.slug);
  const [description, setDescription] = useState(initial.description);
  const [city, setCity] = useState(initial.city);
  const [employmentType, setEmploymentType] = useState(initial.employment_type);
  const [scheduleType, setScheduleType] = useState(initial.schedule_type);
  const [salaryMin, setSalaryMin] = useState(initial.salary_min);
  const [salaryMax, setSalaryMax] = useState(initial.salary_max);
  const [status, setStatus] = useState(initial.status || "draft");
  const [siteId, setSiteId] = useState(initial.site_id || sites[0]?.id || "");

  const selectedSiteLabel = useMemo(() => {
    const selected = sites.find((site) => site.id === siteId);
    return selected?.name ?? selected?.code ?? "Sin sede";
  }, [sites, siteId]);

  const generatedSlug = useMemo(() => slugify(title), [title]);

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="id" value={initial.id ?? ""} />

      <div className="ui-panel space-y-6">
        <div className="ui-h3">Datos de la vacante</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="ui-label">Título</span>
            <input
              name="title"
              className="ui-input"
              value={title}
              onChange={(event) => {
                const nextTitle = event.target.value;
                setTitle(nextTitle);
                if (!slug || slug === generatedSlug) {
                  setSlug(slugify(nextTitle));
                }
              }}
              placeholder="Auxiliar de cocina"
              required
            />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Slug</span>
            <input
              name="slug"
              className="ui-input"
              value={slug}
              onChange={(event) => setSlug(slugify(event.target.value))}
              placeholder="auxiliar-de-cocina"
              required
            />
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className="ui-label">Descripción</span>
            <textarea
              name="description"
              className="ui-input min-h-36 py-3"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe responsabilidades, requisitos y contexto del cargo"
              required
            />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Ciudad</span>
            <input
              name="city"
              className="ui-input"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              placeholder="Bogota"
            />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Sede</span>
            <select
              name="site_id"
              className="ui-input"
              value={siteId}
              onChange={(event) => setSiteId(event.target.value)}
            >
              <option value="">Sin sede</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {(site.name ?? site.code ?? "Sin nombre") + (site.is_active === false ? " (inactiva)" : "")}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="ui-label">Tipo de empleo</span>
            <input
              name="employment_type"
              className="ui-input"
              value={employmentType}
              onChange={(event) => setEmploymentType(event.target.value)}
              placeholder="Tiempo completo"
            />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Jornada</span>
            <input
              name="schedule_type"
              className="ui-input"
              value={scheduleType}
              onChange={(event) => setScheduleType(event.target.value)}
              placeholder="Turnos rotativos"
            />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Salario mínimo</span>
            <input
              name="salary_min"
              type="number"
              min={0}
              className="ui-input"
              value={salaryMin}
              onChange={(event) => setSalaryMin(event.target.value)}
              placeholder="0"
            />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Salario maximo</span>
            <input
              name="salary_max"
              type="number"
              min={0}
              className="ui-input"
              value={salaryMax}
              onChange={(event) => setSalaryMax(event.target.value)}
              placeholder="0"
            />
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className="ui-label">Estado</span>
            <select name="status" className="ui-input" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="draft">Borrador</option>
              <option value="published">Publicada</option>
              <option value="closed">Cerrada</option>
            </select>
          </label>
        </div>
      </div>

      <div className="ui-panel space-y-4">
        <div className="ui-h3">Previsualizacion</div>
        <div className="rounded-3xl border border-[var(--ui-border)] bg-white p-5 shadow-[var(--ui-shadow-1)] space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="ui-chip ui-chip--brand">{city || "Ciudad por definir"}</span>
            <span className="ui-chip">{status === "published" ? "Publicada" : status === "closed" ? "Cerrada" : "Borrador"}</span>
          </div>
          <div>
            <div className="text-xl font-semibold text-[var(--ui-text)]">{title || "Título de la vacante"}</div>
            <div className="ui-caption mt-1">{[employmentType, scheduleType, selectedSiteLabel].filter(Boolean).join(" · ") || "Condiciones por definir"}</div>
          </div>
          <p className="ui-body-muted text-sm leading-relaxed">
            {description.trim() || "La descripción de la vacante aparecerá aquí para validar como se vera en la app de candidatos."}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" className="ui-btn ui-btn--brand">
          {mode === "create" ? "Crear vacante" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
