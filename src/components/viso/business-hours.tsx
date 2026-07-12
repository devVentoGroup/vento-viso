import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

type BusinessHourRow = {
  id: string;
  iso_weekday: number;
  opens_at: string | null;
  closes_at: string | null;
  is_closed: boolean;
};

type BusinessSiteRow = {
  site_id: string | null;
};

const WEEKDAYS = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
  { value: 7, label: "Domingo" },
] as const;

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function businessPath(businessId: string) {
  return `/businesses/${businessId}`;
}

function redirectWithError(businessId: string, message: string): never {
  const target = businessId ? businessPath(businessId) : "/businesses";
  redirect(`${target}?error=${encodeURIComponent(message)}`);
}

function normalizeTime(value: string | null | undefined) {
  return String(value ?? "").slice(0, 5);
}

function isValidTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

async function resolveBusinessSite(businessId: string) {
  if (!businessId) redirectWithError("", "Negocio inválido.");

  const returnTo = businessPath(businessId);
  const { supabase } = await requireAppAccess({ appId: "viso", returnTo });
  const { data, error } = await supabase
    .schema("pass")
    .from("pass_satellites")
    .select("site_id")
    .eq("id", businessId)
    .maybeSingle();

  if (error) redirectWithError(businessId, error.message);

  const siteId = (data as BusinessSiteRow | null)?.site_id;
  if (!siteId) redirectWithError(businessId, "El negocio no existe o no tiene una sede vinculada.");

  return siteId;
}

async function saveBusinessHours(formData: FormData) {
  "use server";

  const businessId = asText(formData.get("business_id"));
  const siteId = await resolveBusinessSite(businessId);
  const rows = WEEKDAYS.map((day) => {
    const isClosed = formData.get(`closed_${day.value}`) === "on";
    const opensAt = asText(formData.get(`opens_${day.value}`));
    const closesAt = asText(formData.get(`closes_${day.value}`));

    if (!isClosed) {
      if (!isValidTime(opensAt) || !isValidTime(closesAt)) {
        redirectWithError(businessId, `Define horas válidas para ${day.label}.`);
      }
      if (closesAt <= opensAt) {
        redirectWithError(businessId, `La hora de cierre de ${day.label} debe ser posterior a la apertura.`);
      }
    }

    return {
      site_id: siteId,
      iso_weekday: day.value,
      opens_at: isClosed ? null : opensAt,
      closes_at: isClosed ? null : closesAt,
      is_closed: isClosed,
      updated_at: new Date().toISOString(),
    };
  });

  const admin = createAdminClient();
  const { error } = await admin
    .schema("pass")
    .from("site_business_hours")
    .upsert(rows, { onConflict: "site_id,iso_weekday" });

  if (error) redirectWithError(businessId, error.message);

  const returnTo = businessPath(businessId);
  revalidatePath(returnTo);
  redirect(`${returnTo}?ok=${encodeURIComponent("Horario habitual actualizado.")}`);
}

export async function BusinessHours({
  businessId,
  siteId,
}: {
  businessId: string;
  siteId: string | null;
}) {
  if (!siteId) {
    return (
      <section className="ui-panel space-y-2">
        <h2 className="text-lg font-semibold text-[var(--ui-text)]">Horario habitual</h2>
        <div className="ui-empty">Este negocio todavía no tiene una sede vinculada.</div>
      </section>
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .schema("pass")
    .from("site_business_hours")
    .select("id,iso_weekday,opens_at,closes_at,is_closed")
    .eq("site_id", siteId)
    .order("iso_weekday", { ascending: true });

  const byDay = new Map<number, BusinessHourRow>(
    ((data ?? []) as BusinessHourRow[]).map((row) => [row.iso_weekday, row]),
  );

  return (
    <section className="ui-panel space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-[var(--ui-text)]">Horario habitual</h2>
        <p className="ui-caption">
          Define cuándo opera normalmente esta sede. Los cierres especiales se configurarán en el siguiente paso.
        </p>
      </div>

      {error ? (
        <div className="ui-alert ui-alert--error">No fue posible cargar el horario: {error.message}</div>
      ) : (
        <form action={saveBusinessHours} className="space-y-4">
          <input type="hidden" name="business_id" value={businessId} />

          <div className="space-y-3">
            {WEEKDAYS.map((day) => {
              const row = byDay.get(day.value);
              const isClosed = row?.is_closed ?? true;

              return (
                <div
                  key={day.value}
                  className="grid gap-3 rounded-2xl border border-[var(--ui-border)] bg-white p-4 md:grid-cols-[140px_120px_1fr_1fr] md:items-center"
                >
                  <div className="font-semibold text-[var(--ui-text)]">{day.label}</div>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name={`closed_${day.value}`}
                      defaultChecked={isClosed}
                    />
                    Cerrado
                  </label>

                  <label className="space-y-1">
                    <span className="block text-xs text-[var(--ui-text-muted)]">Apertura</span>
                    <input
                      type="time"
                      name={`opens_${day.value}`}
                      className="ui-input h-10 w-full"
                      defaultValue={normalizeTime(row?.opens_at)}
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="block text-xs text-[var(--ui-text-muted)]">Cierre</span>
                    <input
                      type="time"
                      name={`closes_${day.value}`}
                      className="ui-input h-10 w-full"
                      defaultValue={normalizeTime(row?.closes_at)}
                    />
                  </label>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end">
            <button type="submit" className="ui-btn ui-btn--primary">
              Guardar horario
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
