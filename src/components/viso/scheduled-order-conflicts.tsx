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

type ConflictRow = ScheduledOrderRow & {
  exception: ScheduleExceptionRow;
};

const TIME_ZONE = "America/Bogota";

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

export async function ScheduledOrderConflicts({ siteId }: { siteId: string | null }) {
  if (!siteId) return null;

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const today = localDate(now);

  const [exceptionsResult, ordersResult] = await Promise.all([
    admin
      .schema("pass")
      .from("site_schedule_exceptions")
      .select("exception_date,exception_type,opens_at,closes_at,internal_reason")
      .eq("site_id", siteId)
      .gte("exception_date", today)
      .order("exception_date", { ascending: true }),
    admin
      .from("orders")
      .select(
        "id,status,fulfillment_type,delivery_window_start,delivery_window_end,guest_info,contact_phone,total_amount",
      )
      .eq("site_id", siteId)
      .eq("schedule_mode", "scheduled")
      .gte("delivery_window_start", now)
      .neq("status", "cancelled")
      .is("voided_at", null)
      .order("delivery_window_start", { ascending: true }),
  ]);

  if (exceptionsResult.error || ordersResult.error) {
    return (
      <section className="ui-panel space-y-2">
        <h2 className="text-lg font-semibold text-[var(--ui-text)]">Pedidos afectados por cierres</h2>
        <div className="ui-alert ui-alert--error">
          No fue posible revisar los pedidos programados: {exceptionsResult.error?.message ?? ordersResult.error?.message}
        </div>
      </section>
    );
  }

  const exceptions = (exceptionsResult.data ?? []) as ScheduleExceptionRow[];
  const orders = (ordersResult.data ?? []) as ScheduledOrderRow[];
  const exceptionsByDate = new Map(exceptions.map((row) => [row.exception_date, row]));

  const conflicts = orders.reduce<ConflictRow[]>((result, order) => {
    const exception = exceptionsByDate.get(localDate(order.delivery_window_start));
    if (exception && isConflict(order, exception)) result.push({ ...order, exception });
    return result;
  }, []);

  return (
    <section className="ui-panel space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-[var(--ui-text)]">Pedidos afectados por cierres</h2>
        <p className="ui-caption">
          Se muestran pedidos programados que ya no caben dentro del cierre u horario especial. Esta vista no modifica ni cancela pedidos.
        </p>
      </div>

      {conflicts.length === 0 ? (
        <div className="ui-empty">No hay pedidos programados afectados por las excepciones actuales.</div>
      ) : (
        <div className="space-y-3">
          {conflicts.map((order) => {
            const customerName = guestText(order.guest_info, "contact_name") || "Cliente sin nombre";
            const phone = order.contact_phone || guestText(order.guest_info, "contact_phone");
            const reason =
              order.exception.exception_type === "closed"
                ? "La sede estará cerrada todo el día."
                : `El pedido queda fuera del horario especial ${String(order.exception.opens_at).slice(0, 5)}–${String(order.exception.closes_at).slice(0, 5)}.`;

            return (
              <article key={order.id} className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold capitalize text-[var(--ui-text)]">
                      {formatDate(localDate(order.delivery_window_start))}
                    </div>
                    <div className="text-sm text-[var(--ui-text)]">
                      {localTime(order.delivery_window_start)}–{localTime(order.delivery_window_end)} · {fulfillmentLabel(order.fulfillment_type)}
                    </div>
                  </div>
                  <div className="rounded-full bg-amber-200 px-3 py-1 text-xs font-semibold text-amber-900">
                    Requiere revisión
                  </div>
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
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
