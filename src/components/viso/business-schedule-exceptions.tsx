import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

type ScheduleExceptionRow = {
  id: string;
  exception_date: string;
  exception_type: "closed" | "special_hours";
  opens_at: string | null;
  closes_at: string | null;
  internal_reason: string | null;
  customer_message: string | null;
};

type BusinessSiteRow = {
  site_id: string | null;
};

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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Bogota",
  }).format(new Date(`${value}T12:00:00-05:00`));
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

async function saveScheduleException(formData: FormData) {
  "use server";

  const businessId = asText(formData.get("business_id"));
  const exceptionId = asText(formData.get("exception_id"));
  const exceptionDate = asText(formData.get("exception_date"));
  const exceptionType = asText(formData.get("exception_type"));
  const opensAt = asText(formData.get("opens_at"));
  const closesAt = asText(formData.get("closes_at"));
  const siteId = await resolveBusinessSite(businessId);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(exceptionDate)) {
    redirectWithError(businessId, "Selecciona una fecha válida.");
  }

  if (exceptionType !== "closed" && exceptionType !== "special_hours") {
    redirectWithError(businessId, "Selecciona un tipo de excepción válido.");
  }

  if (exceptionType === "special_hours") {
    if (!isValidTime(opensAt) || !isValidTime(closesAt)) {
      redirectWithError(businessId, "Define una apertura y un cierre válidos.");
    }
    if (closesAt <= opensAt) {
      redirectWithError(businessId, "La hora de cierre debe ser posterior a la apertura.");
    }
  }

  const payload = {
    site_id: siteId,
    exception_date: exceptionDate,
    exception_type: exceptionType,
    opens_at: exceptionType === "closed" ? null : opensAt,
    closes_at: exceptionType === "closed" ? null : closesAt,
    internal_reason: asText(formData.get("internal_reason")) || null,
    customer_message: asText(formData.get("customer_message")) || null,
    updated_at: new Date().toISOString(),
  };

  const admin = createAdminClient();

  if (exceptionId) {
    const { data, error } = await admin
      .schema("pass")
      .from("site_schedule_exceptions")
      .update(payload)
      .eq("id", exceptionId)
      .eq("site_id", siteId)
      .select("id")
      .maybeSingle();

    if (error) redirectWithError(businessId, error.message);
    if (!data) redirectWithError(businessId, "La excepción ya no existe o no pertenece a esta sede.");
  } else {
    const { error } = await admin
      .schema("pass")
      .from("site_schedule_exceptions")
      .upsert(payload, { onConflict: "site_id,exception_date" });

    if (error) redirectWithError(businessId, error.message);
  }

  const returnTo = businessPath(businessId);
  revalidatePath(returnTo);
  redirect(`${returnTo}?ok=${encodeURIComponent(exceptionId ? "Excepción actualizada." : "Excepción guardada.")}`);
}

async function deleteScheduleException(formData: FormData) {
  "use server";

  const businessId = asText(formData.get("business_id"));
  const exceptionId = asText(formData.get("exception_id"));
  const siteId = await resolveBusinessSite(businessId);

  if (!exceptionId) redirectWithError(businessId, "La excepción seleccionada no es válida.");

  const admin = createAdminClient();
  const { data, error } = await admin
    .schema("pass")
    .from("site_schedule_exceptions")
    .delete()
    .eq("id", exceptionId)
    .eq("site_id", siteId)
    .select("id")
    .maybeSingle();

  if (error) redirectWithError(businessId, error.message);
  if (!data) redirectWithError(businessId, "La excepción ya no existe o no pertenece a esta sede.");

  const returnTo = businessPath(businessId);
  revalidatePath(returnTo);
  redirect(`${returnTo}?ok=${encodeURIComponent("Excepción eliminada.")}`);
}

function ExceptionFields({ row, formId }: { row: ScheduleExceptionRow; formId: string }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <label className="space-y-1">
        <span className="block text-xs text-[var(--ui-text-muted)]">Fecha</span>
        <input
          form={formId}
          type="date"
          name="exception_date"
          required
          className="ui-input h-10 w-full"
          defaultValue={row.exception_date}
        />
      </label>

      <label className="space-y-1">
        <span className="block text-xs text-[var(--ui-text-muted)]">Tipo</span>
        <select
          form={formId}
          name="exception_type"
          className="ui-input h-10 w-full"
          defaultValue={row.exception_type}
        >
          <option value="closed">Cerrado todo el día</option>
          <option value="special_hours">Horario especial</option>
        </select>
      </label>

      <label className="space-y-1">
        <span className="block text-xs text-[var(--ui-text-muted)]">Apertura especial</span>
        <input
          form={formId}
          type="time"
          name="opens_at"
          className="ui-input h-10 w-full"
          defaultValue={normalizeTime(row.opens_at)}
        />
      </label>

      <label className="space-y-1">
        <span className="block text-xs text-[var(--ui-text-muted)]">Cierre especial</span>
        <input
          form={formId}
          type="time"
          name="closes_at"
          className="ui-input h-10 w-full"
          defaultValue={normalizeTime(row.closes_at)}
        />
      </label>

      <label className="space-y-1 md:col-span-2">
        <span className="block text-xs text-[var(--ui-text-muted)]">Motivo interno</span>
        <input
          form={formId}
          type="text"
          name="internal_reason"
          className="ui-input h-10 w-full"
          placeholder="Ej. evento privado"
          defaultValue={row.internal_reason ?? ""}
        />
      </label>

      <label className="space-y-1 md:col-span-2">
        <span className="block text-xs text-[var(--ui-text-muted)]">Mensaje para el cliente</span>
        <input
          form={formId}
          type="text"
          name="customer_message"
          className="ui-input h-10 w-full"
          placeholder="Opcional"
          defaultValue={row.customer_message ?? ""}
        />
      </label>
    </div>
  );
}

export async function BusinessScheduleExceptions({
  businessId,
  siteId,
}: {
  businessId: string;
  siteId: string | null;
}) {
  if (!siteId) {
    return (
      <section className="ui-panel space-y-2">
        <h2 className="text-lg font-semibold text-[var(--ui-text)]">Cierres y horarios especiales</h2>
        <div className="ui-empty">Este negocio todavía no tiene una sede vinculada.</div>
      </section>
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .schema("pass")
    .from("site_schedule_exceptions")
    .select("id,exception_date,exception_type,opens_at,closes_at,internal_reason,customer_message")
    .eq("site_id", siteId)
    .order("exception_date", { ascending: true });

  const rows = (data ?? []) as ScheduleExceptionRow[];
  const blankRow: ScheduleExceptionRow = {
    id: "new",
    exception_date: "",
    exception_type: "closed",
    opens_at: null,
    closes_at: null,
    internal_reason: null,
    customer_message: null,
  };

  return (
    <section className="ui-panel space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-[var(--ui-text)]">Cierres y horarios especiales</h2>
        <p className="ui-caption">
          Una excepción reemplaza el horario habitual de esa fecha. Las horas solo se usan cuando eliges horario especial.
        </p>
      </div>

      <form action={saveScheduleException} className="space-y-4 rounded-2xl border border-[var(--ui-border)] bg-white p-4">
        <input type="hidden" name="business_id" value={businessId} />
        <div className="font-semibold text-[var(--ui-text)]">Agregar excepción</div>
        <ExceptionFields row={blankRow} formId="new-schedule-exception" />
        <div className="flex justify-end">
          <button id="new-schedule-exception" type="submit" className="ui-btn ui-btn--primary">
            Guardar excepción
          </button>
        </div>
      </form>

      {error ? (
        <div className="ui-alert ui-alert--error">No fue posible cargar las excepciones: {error.message}</div>
      ) : rows.length === 0 ? (
        <div className="ui-empty">No hay cierres ni horarios especiales configurados.</div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const formId = `schedule-exception-${row.id}`;
            return (
              <div key={row.id} className="space-y-4 rounded-2xl border border-[var(--ui-border)] bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold capitalize text-[var(--ui-text)]">{formatDate(row.exception_date)}</div>
                    <div className="ui-caption">
                      {row.exception_type === "closed"
                        ? "Cerrado todo el día"
                        : `${normalizeTime(row.opens_at)}–${normalizeTime(row.closes_at)}`}
                    </div>
                  </div>
                  <form action={deleteScheduleException}>
                    <input type="hidden" name="business_id" value={businessId} />
                    <input type="hidden" name="exception_id" value={row.id} />
                    <button type="submit" className="ui-btn ui-btn--danger">
                      Eliminar
                    </button>
                  </form>
                </div>

                <form id={formId} action={saveScheduleException} className="space-y-4">
                  <input type="hidden" name="business_id" value={businessId} />
                  <input type="hidden" name="exception_id" value={row.id} />
                  <ExceptionFields row={row} formId={formId} />
                  <div className="flex justify-end">
                    <button type="submit" className="ui-btn ui-btn--primary">
                      Guardar cambios
                    </button>
                  </div>
                </form>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
