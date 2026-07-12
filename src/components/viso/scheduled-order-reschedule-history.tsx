import { createAdminClient } from "@/lib/supabase/admin";

const TIME_ZONE = "America/Bogota";

type ResolutionRow = {
  order_id: string;
  exception_date: string;
  note: string | null;
  decided_by: string;
  decided_at: string;
  previous_window_start: string;
  previous_window_end: string;
  new_window_start: string;
  new_window_end: string;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatWindow(start: string, end: string) {
  const date = new Intl.DateTimeFormat("es-CO", {
    timeZone: TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(start));
  const time = new Intl.DateTimeFormat("es-CO", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${date} · ${time.format(new Date(start))}–${time.format(new Date(end))}`;
}

export async function ScheduledOrderRescheduleHistory({ siteId }: { siteId: string | null }) {
  if (!siteId) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .schema("pass")
    .from("site_schedule_exception_resolutions")
    .select(
      "order_id,exception_date,note,decided_by,decided_at,previous_window_start,previous_window_end,new_window_start,new_window_end",
    )
    .eq("site_id", siteId)
    .eq("decision", "rescheduled")
    .order("decided_at", { ascending: false })
    .limit(20);

  if (error) {
    return <div className="ui-alert ui-alert--error">No fue posible cargar los pedidos reprogramados: {error.message}</div>;
  }

  const rows = (data ?? []) as ResolutionRow[];
  if (rows.length === 0) return null;

  const userIds = [...new Set(rows.map((row) => row.decided_by))];
  const { data: users } = await admin.from("users").select("id,full_name,email").in("id", userIds);
  const names = new Map(
    (users ?? []).map((user) => [user.id, user.full_name || user.email || user.id.slice(0, 8)]),
  );

  return (
    <section className="ui-panel space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-[var(--ui-text)]">Pedidos revisados — Reprogramados</h2>
        <p className="ui-caption">Últimas decisiones registradas para esta sede.</p>
      </div>

      {rows.map((row) => (
        <article key={`${row.order_id}:${row.exception_date}`} className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-[var(--ui-text)]">#{row.order_id.slice(0, 8).toUpperCase()}</div>
              <div className="ui-caption">Antes: {formatWindow(row.previous_window_start, row.previous_window_end)}</div>
              <div className="text-sm font-medium text-blue-950">Ahora: {formatWindow(row.new_window_start, row.new_window_end)}</div>
            </div>
            <div className="rounded-full bg-blue-200 px-3 py-1 text-xs font-semibold text-blue-900">Revisado: reprogramado</div>
          </div>
          <div className="mt-3 text-sm text-blue-950">
            Registrado por {names.get(row.decided_by) ?? "usuario autorizado"} el {formatDateTime(row.decided_at)}.
            {row.note ? ` Observación: ${row.note}` : ""}
          </div>
        </article>
      ))}
    </section>
  );
}
