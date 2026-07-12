import { revalidatePath } from "next/cache";

import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

const TIME_ZONE = "America/Bogota";

type OrderRow = {
  id: string;
  status: string;
  delivery_window_start: string;
  delivery_window_end: string;
  guest_info: Record<string, unknown> | null;
  contact_phone: string | null;
};

type ExceptionRow = {
  exception_date: string;
  exception_type: "closed" | "special_hours";
  opens_at: string | null;
  closes_at: string | null;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function localDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function localTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function guestText(info: Record<string, unknown> | null, key: string) {
  const value = info?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function isConflict(order: OrderRow, exception: ExceptionRow) {
  if (exception.exception_type === "closed") return true;
  const opensAt = String(exception.opens_at ?? "").slice(0, 5);
  const closesAt = String(exception.closes_at ?? "").slice(0, 5);
  return localTime(order.delivery_window_start) < opensAt || localTime(order.delivery_window_end) > closesAt;
}

async function resolveContact(formData: FormData) {
  "use server";

  const businessId = asText(formData.get("business_id"));
  const siteId = asText(formData.get("site_id"));
  const orderId = asText(formData.get("order_id"));
  const exceptionDate = asText(formData.get("exception_date"));
  const decision = asText(formData.get("decision"));
  const note = asText(formData.get("note"));
  const returnTo = `/businesses/${businessId}`;

  if (!businessId || !siteId || !orderId || !exceptionDate || !note) {
    throw new Error("Debes registrar el motivo y los datos del pedido.");
  }

  const { user } = await requireAppAccess({ appId: "viso", returnTo, siteId });
  const admin = createAdminClient();
  const { error } = await admin.schema("pass").rpc("resolve_scheduled_order_contact_admin", {
    p_site_id: siteId,
    p_order_id: orderId,
    p_exception_date: exceptionDate,
    p_decision: decision,
    p_decided_by: user.id,
    p_note: note,
    p_timezone: TIME_ZONE,
  });

  if (error) throw new Error(error.message);
  revalidatePath(returnTo);
}

export async function ScheduledOrderContactResolution({
  businessId,
  siteId,
}: {
  businessId: string;
  siteId: string | null;
}) {
  if (!siteId) return null;

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const today = localDate(now);

  const [ordersResult, exceptionsResult, resolutionsResult] = await Promise.all([
    admin
      .from("orders")
      .select("id,status,delivery_window_start,delivery_window_end,guest_info,contact_phone")
      .eq("site_id", siteId)
      .eq("schedule_mode", "scheduled")
      .gte("delivery_window_start", now)
      .neq("status", "cancelled")
      .is("voided_at", null),
    admin
      .schema("pass")
      .from("site_schedule_exceptions")
      .select("exception_date,exception_type,opens_at,closes_at")
      .eq("site_id", siteId)
      .gte("exception_date", today),
    admin
      .schema("pass")
      .from("site_schedule_exception_resolutions")
      .select("order_id,exception_date")
      .eq("site_id", siteId),
  ]);

  const error = ordersResult.error || exceptionsResult.error || resolutionsResult.error;
  if (error) {
    return <div className="ui-alert ui-alert--error">No fue posible cargar las decisiones de contacto: {error.message}</div>;
  }

  const exceptions = (exceptionsResult.data ?? []) as ExceptionRow[];
  const exceptionsByDate = new Map(exceptions.map((row) => [row.exception_date, row]));
  const reviewed = new Set((resolutionsResult.data ?? []).map((row) => `${row.order_id}:${row.exception_date}`));
  const affected = ((ordersResult.data ?? []) as OrderRow[]).filter((order) => {
    const date = localDate(order.delivery_window_start);
    const exception = exceptionsByDate.get(date);
    return Boolean(exception && isConflict(order, exception) && !reviewed.has(`${order.id}:${date}`));
  });

  if (affected.length === 0) return null;

  return (
    <section className="ui-panel space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-[var(--ui-text)]">Cancelar / contactar cliente</h2>
        <p className="ui-caption">Registra primero el motivo. Cancelar cambia únicamente el estado comercial del pedido.</p>
      </div>

      {affected.map((order) => {
        const exceptionDate = localDate(order.delivery_window_start);
        const customerName = guestText(order.guest_info, "contact_name") || "Cliente sin nombre";
        const phone = order.contact_phone || guestText(order.guest_info, "contact_phone") || "Sin teléfono";
        return (
          <form key={order.id} action={resolveContact} className="rounded-2xl border border-[var(--ui-border)] p-4 space-y-3">
            <input type="hidden" name="business_id" value={businessId} />
            <input type="hidden" name="site_id" value={siteId} />
            <input type="hidden" name="order_id" value={order.id} />
            <input type="hidden" name="exception_date" value={exceptionDate} />

            <div>
              <div className="font-semibold text-[var(--ui-text)]">#{order.id.slice(0, 8).toUpperCase()} · {customerName}</div>
              <div className="ui-caption">{phone} · {localTime(order.delivery_window_start)}–{localTime(order.delivery_window_end)}</div>
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
              <label className="space-y-1">
                <span className="block text-xs text-[var(--ui-text-muted)]">Motivo obligatorio</span>
                <input name="note" className="ui-input h-10 w-full" maxLength={500} required placeholder="Ej. cliente informado por WhatsApp" />
              </label>
              <button type="submit" name="decision" value="contact_required" className="ui-btn">Marcar para contactar</button>
              <button type="submit" name="decision" value="cancelled" className="ui-btn">Cancelar pedido</button>
            </div>
          </form>
        );
      })}
    </section>
  );
}
