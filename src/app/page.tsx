import Link from "next/link";

import { PageHeader } from "@/components/vento/standard/page-header";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function countRows(
  supabase: { from: ReturnType<typeof createAdminClient>["from"] },
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
  await requireAppAccess({
    appId: "viso",
    returnTo: "/",
  });
  const supabase = createAdminClient();

  const [employeeCount, passUserCount, businessCount, productCount] =
    await Promise.all([
      countRows(supabase, "employees"),
      countRows(supabase, "users"),
      countRows(supabase.schema("pass"), "pass_satellites"),
      countRows(supabase.schema("pass"), "loyalty_rewards"),
    ]);

  return (
    <div className="space-y-10 sm:space-y-12">
      <header className="space-y-1">
        <PageHeader
          title="Panel VISO"
          subtitle="Gestión centralizada de negocios, personal y Vento Pass."
        />
      </header>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--ui-muted)]">
          Resumen
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Link href="/staff" className="ui-card group">
            <div className="ui-caption">Trabajadores</div>
            <div className="mt-2 text-3xl font-bold tracking-tight text-[var(--ui-text)]">{employeeCount}</div>
            <p className="mt-2 text-sm leading-relaxed text-[var(--ui-muted)]">Administra personal, roles y estado.</p>
          </Link>
          <Link href="/pass-users" className="ui-card group">
            <div className="ui-caption">Usuarios Vento Pass</div>
            <div className="mt-2 text-3xl font-bold tracking-tight text-[var(--ui-text)]">{passUserCount}</div>
            <p className="mt-2 text-sm leading-relaxed text-[var(--ui-muted)]">Clientes, puntos y perfil.</p>
          </Link>
          <Link href="/businesses" className="ui-card group">
            <div className="ui-caption">Negocios</div>
            <div className="mt-2 text-3xl font-bold tracking-tight text-[var(--ui-text)]">{businessCount}</div>
            <p className="mt-2 text-sm leading-relaxed text-[var(--ui-muted)]">Sedes y configuración Pass.</p>
          </Link>
          <div className="ui-card">
            <div className="ui-caption">Productos</div>
            <div className="mt-2 text-3xl font-bold tracking-tight text-[var(--ui-text)]">{productCount}</div>
            <p className="mt-2 text-sm leading-relaxed text-[var(--ui-muted)]">Catálogo publicado para canjes.</p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--ui-muted)]">
          Acciones rápidas
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Link href="/businesses/new" className="ui-panel-soft block">
            <div className="ui-title">Crear negocio</div>
            <p className="mt-2 ui-body-muted">Alta rápida de sede y satélite de Pass.</p>
          </Link>
          <Link href="/staff/new" className="ui-panel-soft block">
            <div className="ui-title">Invitar trabajador</div>
            <p className="mt-2 ui-body-muted">Genera invitaciones con rol y sede.</p>
          </Link>
          <Link href="/products/new" className="ui-panel-soft block">
            <div className="ui-title">Crear producto</div>
            <p className="mt-2 ui-body-muted">Agrega ítems que se muestran en Vento Pass.</p>
          </Link>
          <Link href="/content-blocks" className="ui-panel-soft block">
            <div className="ui-title">Contenido Pass</div>
            <p className="mt-2 ui-body-muted">Textos y bloques de la app Vento Pass.</p>
          </Link>
        </div>
      </section>
    </div>
  );
}

