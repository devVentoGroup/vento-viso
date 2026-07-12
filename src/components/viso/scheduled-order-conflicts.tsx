import { revalidatePath } from "next/cache";

import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

type ScheduleExceptionRow = {
  exception_date: string;
  exception_type: "closed" | "special_hours";
  opens_at: string | null;
  closes_at: string | null;
  internal_reason: string | null;
};

type ScheduledOrderRow = {
  id: string;
  status: string;
  fulfillment_type: string;
  delivery_window_start: string;
  delivery_window_end: string;
  guest_info: Record<string, unknown> | null;
  contact_phone: string | null;
  total_amount: number | string;
};

type ResolutionRow = {
  order_id: string;
  exception_date: string;
  decision: "keep";
  note: string | null;
  decided_by: string;
  decided_at: string;
};

type ConflictRow = ScheduledOrderRow & {
  exception: ScheduleExceptionRow;
  resolution: ResolutionRow | null;
  decidedByName: string | null;
};

const TIME_ZONE = "America/Bogota";

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function businessPath(businessId: string) {
  return `/businesses/${businessId}`;
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TIME_ZONE,
  }).format(new Date(`${value}T12:00:00-05:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(new Date(value));
}

function formatMoney(value: number | string) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function fulfillmentLabel(value: string) {
  if (value === "delivery") return "Domicilio";
  if (value === "pickup") return "Recoger en sede";
  return "Consumo en sede";
}

function guestText(guestInfo: Record<string, unknown> | null, key: string) {
  const value = guestInfo?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function isConflict(order: ScheduledOrderRow, exception: ScheduleExceptionRow) {
  if (exception.exception_type === "closed") return true;

  const opensAt = String(exception.opens_at ?? "").slice(0, 5);
  const closesAt = String(exception.closes_at ?? "").slice(0, 5);
  const startsAt = localTime(order.delivery_window_start);
  const endsAt = localTime(order.delivery_window_end);

  return !opensAt || !closesAt || startsAt < opensAt || endsAt > closesAt;
}

async function keepScheduledOrder(formData: FormData) {
  "use server";

  const businessId = asText(formData.get("business_id"));
  const siteId = asText(formData.get("site_id"));
  const orderId = asText(formData.get("order_id"));
  const exceptionDate = asText(formData.get("exception_date"));
  const note = asText(formData.get("note"));
  const returnTo = businessPath(businessId);

  if (!businessId || !siteId || !orderId || !/^\d{4}-\d{2}-\d{2}$/.test(exceptionDate)) {
    throw new Error("No fue posible identificar el pedido afectado.");
  }

  const { user } = await requireAppAccess({ appId: "viso", returnTo, siteId });
  const admin = createAdminClient();

  const [orderResult, exceptionResult] = await Promise.all([
    admin
      .from("orders")
      .select("id,status,fulfillment_type,delivery_window_start,delivery_window_end,guest_info,contact_phone,total_amount")
      .eq("id", orderId)
      .eq("site_id", siteId)
      .eq("schedule_mode", "scheduled")
      .neq("status", "cancelled")
      .is("voided_at", null)
      .maybeSingle(),
    admin
      .schema("pass")
      .from("site_schedule_exceptions")
      .select("exception_date,exception_type,opens_at,closes_at,internal_reason")
      .eq("site_id", siteId)
      .eq("exception_date", exceptionDate)
      .maybeSingle(),
  ]);

  if (orderResult.error) throw new Error(orderResult.error.message);
  if (exceptionResult.error) throw new Error(exceptionResult.error.message);

  const order = orderResult.data as ScheduledOrderRow | null;
  const exception = exceptionResult.data as ScheduleExceptionRow | null;

  if (!order || !exception || localDate(order.delivery_window_start) !== exceptionDate || !isConflict(order, exception)) {
    throw new Error("El pedido ya no está afectado por esta excepción.");
  }

  const { error } = await admin
    .schema("pass")
    .from("site_schedule_exception_resolutions")
    .upsert(
      {
        site_id: siteId,
        order_id: orderId,
        exception_date: exceptionDate,
        decision: "keep",
        note: note || null,
        decided_by: user.id,
        decided_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "order_id,exception_date" },
    );

  if (error) throw new Error(error.message);
  revalidatePath(returnTo);
}

export async function ScheduledOrderConflicts({
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

  const [exceptionsResult, ordersResult, resolutionsResult] = await Promise.all([
    admin
      .schema("pass")
      .from("site_schedule_exceptions")
      .select("exception_date,exception_type,opens_at,closes_at,internal_reason")
      .eq("site_id", siteId)
      .gte("exception_date", today)
      .order("exception_date", { ascending: true }),
    admin
      .from("orders")
      .select("id,status,fulfillment_type,delivery_window_start,delivery_window_end,guest_info,contact_phone,total_amount")
      .eq("site_id", siteId)
      .eq("schedule_mode", "scheduled")
      .gte("delivery_window_start", now)
      .neq("status", "cancelled")
      .is("voided_at", null)
      .order("delivery_window_start", { ascending: true }),
    admin
      .schema("pass")
      .from("site_schedule_exception_resolutions")
      .select("order_id,exception_date,decision,note,decided_by,decided_at")
      .eq("site_id", siteId)
      .gte("exception_date", today),
  ]);

  if (exceptionsResult.error || ordersResult.error || resolutionsResult.error) {
    return (
      <section className="ui-panel space-y-2">
        <h2 className="text-lg font-semibold text-[var(--ui-text)]">Pedidos afectados por cierres</h2>
        <div className="ui-alert ui-alert--error">
          No fue posible revisar los pedidos programados: {exceptionsResult.error?.message ?? ordersResult.error?.message ?? resolutionsResult.error?.message}
        </div>
      </section>
    );
  }

  const exceptions = (exceptionsResult.data ?? []) as ScheduleExceptionRow[];
  const orders = (ordersResult.data ?? []) as ScheduledOrderRow[];
  const resolutions = (resolutionsResult.data ?? []) as ResolutionRow[];
  const exceptionsByDate = new Map(exceptions.map((row) => [row.exception_date, row]));
  const resolutionsByKey = new Map(resolutions.map((row) => [`${row.order_id}:${row.exception_date}`, row]));
  const decidedByIds = [...new Set(resolutions.map((row) => row.decided_by))];

  const namesById = new Map<string, string>();
  if (decidedByIds.length > 0) {
    const { data: users } = await admin.from("users").select("id,full_name,email").in("id", decidedByIds);
    for (const user of users ?? []) {
      namesById.set(user.id, user.full_name || user.email || user.id.slice(0, 8));
    }
  }

  const conflicts = orders.reduce<ConflictRow[]>((result, order) => {
    const exceptionDate = localDate(order.delivery_window_start);
    const exception = exceptionsByDate.get(exceptionDate);
    if (!exception || !isConflict(order, exception)) return result;

    const resolution = resolutionsByKey.get(`${order.id}:${exceptionDate}`) ?? null;
    result.push({
      ...order,
      exception,
      resolution,
      decidedByName: resolution ? namesById.get(resolution.decided_by) ?? null : null,
    });
    return result;
  }, []);

  const pending = conflicts.filter((row) => !row.resolution);
  const reviewed = conflicts.filter((row) => row.resolution);

  return (
    <section className="ui-panel space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-[var(--ui-text)]">Pedidos afectados por cierres</h2>
        <p className="ui-caption">
          Revisa pedidos que quedaron fuera de una excepción. Mantener un pedido solo registra la decisión; no cambia su horario, estado ni pago.
        </p>
      </div>

      {pending.length === 0 ? (
        <div className="ui-empty">No hay pedidos programados pendientes de revisión.</div>
      ) : (
        <div className="space-y-3">
          {pending.map((order) => {
            const customerName = guestText(order.guest_info, "contact_name") || "Cliente sin nombre";
            const phone = order.contact_phone || guestText(order.guest_info, "contact_phone");
            const exceptionDate = localDate(order.delivery_window_start);
            const reason =
              order.exception.exception_type === "closed"
                ? "La sede estará cerrada todo el día."
                : `El pedido queda fuera del horario especial ${String(order.exception.opens_at).slice(0, 5)}–${String(order.exception.closes_at).slice(0, 5)}.`;

            return (
              <article key={order.id} className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold capitalize text-[var(--ui-text)]">{formatDate(exceptionDate)}</div>
                    <div className="text-sm text-[var(--ui-text)]">
                      {localTime(order.delivery_window_start)}–{localTime(order.delivery_window_end)} · {fulfillmentLabel(order.fulfillment_type)}
                    </div>
                  </div>
                  <div className="rounded-full bg-amber-200 px-3 py-1 text-xs font-semibold text-amber-900">Requiere revisión</div>
                </div>

                <div className="mt-3 grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <div className="ui-caption">Pedido</div>
                    <div className="font-medium text-[var(--ui-text)]">#{order.id.slice(0, 8).toUpperCase()}</div>
                  </div>
                  <div>
                    <div className="ui-caption">Cliente</div>
                    <div className="font-medium text-[var(--ui-text)]">{customerName}</div>
                    {phone ? <div className="ui-caption">{phone}</div> : null}
                  </div>
                  <div>
                    <div className="ui-caption">Total</div>
                    <div className="font-medium text-[var(--ui-text)]">{formatMoney(order.total_amount)}</div>
                  </div>
                  <div>
                    <div className="ui-caption">Estado actual</div>
                    <div className="font-medium text-[var(--ui-text)]">{order.status}</div>
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-amber-200 bg-white/70 px-3 py-2 text-sm text-amber-950">
                  {reason}
                  {order.exception.internal_reason ? ` Motivo interno: ${order.exception.internal_reason}` : ""}
                </div>

                <form action={keepScheduledOrder} className="mt-3 flex flex-col gap-3 md:flex-row md:items-end">
                  <input type="hidden" name="business_id" value={businessId} />
                  <input type="hidden" name="site_id" value={siteId} />
                  <input type="hidden" name="order_id" value={order.id} />
                  <input type="hidden" name="exception_date" value={exceptionDate} />
                  <label className="flex-1 space-y-1">
                    <span className="block text-xs text-[var(--ui-text-muted)]">Observación opcional</span>
                    <input name="note" type="text" className="ui-input h-10 w-full" placeholder="Ej. operación autorizada por gerencia" maxLength={500} />
                  </label>
                  <button type="submit" className="ui-btn ui-btn--primary">Mantener pedido</button>
                </form>
              </article>
            );
          })}
        </div>
      )}

      {reviewed.length > 0 ? (
        <div className="space-y-3">
          <h3 className="font-semibold text-[var(--ui-text)]">Pedidos revisados</h3>
          {reviewed.map((order) => {
            const resolution = order.resolution!;
            return (
              <article key={`${order.id}:${resolution.exception_date}`} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-[var(--ui-text)]">#{order.id.slice(0, 8).toUpperCase()}</div>
                    <div className="text-sm text-[var(--ui-text)]">
                      {formatDate(resolution.exception_date)} · {localTime(order.delivery_window_start)}–{localTime(order.delivery_window_end)}
                    </div>
                  </div>
                  <div className="rounded-full bg-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-900">Revisado: se mantiene</div>
                </div>
                <div className="mt-3 text-sm text-emerald-950">
                  Registrado por {order.decidedByName ?? "usuario autorizado"} el {formatDateTime(resolution.decided_at)}.
                  {resolution.note ? ` Observación: ${resolution.note}` : ""}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
