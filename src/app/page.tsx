import Link from "next/link";

import { PageHeader } from "@/components/vento/standard/page-header";
import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function countRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  filter?: { column: string; value: string | boolean }
) {
  let query = supabase.from(table).select("id", { count: "exact", head: true });
  if (filter) {
    query = query.eq(filter.column, filter.value);
  }
  const { count } = await query;
  return count ?? 0;
}

export default async function VisoHomePage() {
  const { supabase } = await requireAppAccess({
    appId: "viso",
    returnTo: "/",
  });

  const [employeeCount, passUserCount, businessCount, siteCount] =
    await Promise.all([
      countRows(supabase, "employees"),
      countRows(supabase, "users", { column: "is_client", value: true }),
      countRows(supabase, "pass_satellites"),
      countRows(supabase, "sites"),
    ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Panel VISO"
        subtitle="Gestion centralizada de negocios, personal y Vento Pass."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link href="/staff" className="ui-card">
          <div className="ui-caption">Trabajadores</div>
          <div className="mt-2 text-2xl font-semibold text-[var(--ui-text)]">{employeeCount}</div>
          <p className="mt-2 ui-body-muted">Administra personal, roles y estado.</p>
        </Link>
        <Link href="/pass-users" className="ui-card">
          <div className="ui-caption">Usuarios Vento Pass</div>
          <div className="mt-2 text-2xl font-semibold text-[var(--ui-text)]">{passUserCount}</div>
          <p className="mt-2 ui-body-muted">Clientes, puntos y perfil.</p>
        </Link>
        <Link href="/businesses" className="ui-card">
          <div className="ui-caption">Negocios</div>
          <div className="mt-2 text-2xl font-semibold text-[var(--ui-text)]">{businessCount}</div>
          <p className="mt-2 ui-body-muted">Sedes y configuracion Pass.</p>
        </Link>
        <div className="ui-card">
          <div className="ui-caption">Sedes activas</div>
          <div className="mt-2 text-2xl font-semibold text-[var(--ui-text)]">{siteCount}</div>
          <p className="mt-2 ui-body-muted">Mapa general de ubicaciones.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/businesses/new" className="ui-panel-soft">
          <div className="ui-title">Crear negocio</div>
          <p className="mt-2 ui-body-muted">Alta rapida de sede y satelite de Pass.</p>
        </Link>
        <Link href="/staff/new" className="ui-panel-soft">
          <div className="ui-title">Invitar trabajador</div>
          <p className="mt-2 ui-body-muted">Genera invitaciones con rol y sede.</p>
        </Link>
      </div>
    </div>
  );
}
