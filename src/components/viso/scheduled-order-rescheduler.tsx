import { revalidatePath } from "next/cache";

import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

const TIME_ZONE = "America/Bogota";

type OrderRow = {
  id: string;
  fulfillment_type: string;
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

type SlotRow = {
  window_start: string;
  window_end: string;
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
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatSlot(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
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
  const start = localTime(order.delivery_window_start);
  const end = localTime(order.delivery_window_end);
  return !opensAt || !closesAt || start < opensAt || end > closesAt;
}

async function rescheduleOrder(formData: FormData) {
  "use server";

  const businessId = asText(formData.get("business_id"));
  const siteId = asText(formData.get("site_id"));
  const orderId = asText(formData.get("order_id"));
  const exceptionDate = asText(formData.get("exception_date"));
  const slotValue = asText(formData.get("slot"));
  const note = asText(formData.get("note"));
  const [windowStart, windowEnd] = slotValue.split("|");
  const returnTo = `/businesses/${businessId}`;

  if (!businessId || !siteId || !orderId || !windowStart || !windowEnd) {
    throw new Error("No fue posible identificar la nueva programación.");
  }

  const { user } = await requireAppAccess({ appId: "viso", returnTo, siteId });
  const admin = createAdminClient();
  const { error } = await admin.schema("pass").rpc("reschedule_scheduled_order_admin", {
    p_site_id: siteId,
    p_order_id: orderId,
    p_exception_date: exceptionDate,
    p_new_window_start: windowStart,
    p_new_window_end: windowEnd,
    p_decided_by: user.id,
    p_note: note || null,
    p_timezone: TIME_ZONE,
  });

  if (error) throw new Error(error.message);
  revalidatePath(returnTo);
}

export async function ScheduledOrderRescheduler({
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
  const toDate = localDate(new Date(Date.now() + 30 * 86400000).toISOString());

  const [ordersResult, exceptionsResult, resolutionsResult, slotsResult] = await Promise.all([
    admin
      .from("orders")
      .select("id,fulfillment_type,delivery_window_start,delivery_window_end,guest_info,contact_phone")
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
    admin.schema("pass").rpc("get_order_reschedule_slots_admin", {
      p_site_id: siteId,
      p_from_date: today,
      p_to_date: toDate,
      p_timezone: TIME_ZONE,
    }),
  ]);

  const error = ordersResult.error || exceptionsResult.error || resolutionsResult.error || slotsResult.error;
  if (error) {
    return <div className="ui-alert ui-alert--error">No fue posible cargar la reprogramación: {error.message}</div>;
  }

  const exceptions = (exceptionsResult.data ?? []) as ExceptionRow[];
  const exceptionsByDate = new Map(exceptions.map((row) => [row.exception_date, row]));
  const reviewed = new Set(
    (resolutionsResult.data ?? []).map((row) => `${row.order_id}:${row.exception_date}`),
  );
  const slots = (slotsResult.data ?? []) as SlotRow[];
  const affected = ((ordersResult.data ?? []) as OrderRow[]).filter((order) => {
    const date = localDate(order.delivery_window_start);
    const exception = exceptionsByDate.get(date);
    return Boolean(exception && isConflict(order, exception) && !reviewed.has(`${order.id}:${date}`));
  });

  if (affected.length === 0) return null;

  return (
    <section className="ui-panel space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-[var(--ui-text)]">Reprogramar pedidos afectados</h2>
        <p className="ui-caption">Selecciona un horario válido. El cambio conserva pago, productos, cliente y estado comercial.</p>
      </div>

      {affected.map((order) => {
        const exceptionDate = localDate(order.delivery_window_start);
        const customerName = guestText(order.guest_info, "contact_name") || "Cliente sin nombre";
        const phone = order.contact_phone || guestText(order.guest_info, "contact_phone");
        return (
          <form key={order.id} action={rescheduleOrder} className="rounded-2xl border border-[var(--ui-border)] p-4 space-y-3">
            <input type="hidden" name="business_id" value={businessId} />
            <input type="hidden" name="site_id" value={siteId} />
            <input type="hidden" name="order_id" value={order.id} />
            <input type="hidden" name="exception_date" value={exceptionDate} />

            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-[var(--ui-text)]">#{order.id.slice(0, 8).toUpperCase()} · {customerName}</div>
                <div className="ui-caption">Actual: {localTime(order.delivery_window_start)}–{localTime(order.delivery_window_end)}{phone ? ` · ${phone}` : ""}</div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
              <label className="space-y-1">
                <span className="block text-xs text-[var(--ui-text-muted)]">Nuevo horario</span>
                <select name="slot" className="ui-input h-10 w-full" required defaultValue="">
                  <option value="" disabled>Seleccionar horario</option>
                  {slots.map((slot) => (
                    <option key={slot.window_start} value={`${slot.window_start}|${slot.window_end}`}>
                      {formatSlot(slot.window_start)}–{localTime(slot.window_end)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="block text-xs text-[var(--ui-text-muted)]">Observación opcional</span>
                <input name="note" className="ui-input h-10 w-full" maxLength={500} placeholder="Motivo o acuerdo con el cliente" />
              </label>
              <button type="submit" className="ui-btn ui-btn--primary">Reprogramar</button>
            </div>
          </form>
        );
      })}
    </section>
  );
}
