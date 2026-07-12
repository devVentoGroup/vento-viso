import { createAdminClient } from "@/lib/supabase/admin";

const TIME_ZONE = "America/Bogota";

type ResolutionRow = {
  order_id: string;
  decision: "contact_required" | "cancelled";
  note: string;
  decided_by: string;
  decided_at: string;
  contact_name: string | null;
  contact_phone: string | null;
  previous_order_status: string | null;
  new_order_status: string | null;
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

export async function ScheduledOrderContactHistory({ siteId }: { siteId: string | null }) {
  if (!siteId) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .schema("pass")
    .from("site_schedule_exception_resolutions")
    .select("order_id,decision,note,decided_by,decided_at,contact_name,contact_phone,previous_order_status,new_order_status")
    .eq("site_id", siteId)
    .in("decision", ["contact_required", "cancelled"])
    .order("decided_at", { ascending: false })
    .limit(20);

  if (error) {
    return <div className="ui-alert ui-alert--error">No fue posible cargar el historial de contacto: {error.message}</div>;
  }

  const rows = (data ?? []) as ResolutionRow[];
  if (rows.length === 0) return null;

  const userIds = [...new Set(rows.map((row) => row.decided_by))];
  const { data: users } = await admin.from("users").select("id,full_name,email").in("id", userIds);
  const names = new Map((users ?? []).map((user) => [user.id, user.full_name || user.email || user.id.slice(0, 8)]));

  return (
    <section className="ui-panel space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-[var(--ui-text)]">Pedidos revisados — Contacto y cancelación</h2>
        <p className="ui-caption">Últimas decisiones registradas para esta sede.</p>
      </div>

      {rows.map((row) => {
        const cancelled = row.decision === "cancelled";
        return (
          <article key={`${row.order_id}:${row.decided_at}`} className={`rounded-2xl border p-4 ${cancelled ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50"}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-[var(--ui-text)]">#{row.order_id.slice(0, 8).toUpperCase()}</div>
                <div className="ui-caption">{row.contact_name || "Cliente sin nombre"} · {row.contact_phone || "Sin teléfono"}</div>
                {cancelled ? <div className="ui-caption">Estado: {row.previous_order_status || "—"} → {row.new_order_status || "cancelled"}</div> : null}
              </div>
              <div className={`rounded-full px-3 py-1 text-xs font-semibold ${cancelled ? "bg-rose-200 text-rose-900" : "bg-amber-200 text-amber-900"}`}>
                {cancelled ? "Revisado: cancelado" : "Revisado: contactar cliente"}
              </div>
            </div>
            <div className={`mt-3 text-sm ${cancelled ? "text-rose-950" : "text-amber-950"}`}>
              Registrado por {names.get(row.decided_by) ?? "usuario autorizado"} el {formatDateTime(row.decided_at)}. Motivo: {row.note}
            </div>
          </article>
        );
      })}
    </section>
  );
}
