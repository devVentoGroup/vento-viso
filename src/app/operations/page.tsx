import Link from "next/link";

import { OperationsNav } from "@/components/viso/operations-nav";
import { PageHeader } from "@/components/vento/standard/page-header";
import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

const ROUTE = "/operations";

const operationAreas = [
  {
    title: "Puntos de marcación",
    href: "/operations/checkin-points",
    description:
      "Administra geocercas y puntos físicos ocultos para entrada y salida sin convertirlos en sedes operativas visibles.",
    status: "Disponible",
  },
  {
    title: "Roles por sede",
    href: "/operations/site-roles",
    description:
      "Define qué roles operativos pueden existir en cada sede, como conductor, barista, producción o apoyo.",
    status: "Disponible",
  },
  {
    title: "Perfiles operativos",
    href: "/operations/employee-profiles",
    description:
      "Asigna perfiles por trabajador, sede y rol para preparar turnos con contexto operativo consistente.",
    status: "Siguiente",
  },
  {
    title: "Vista previa",
    href: "/operations/preview",
    description:
      "Revisa cómo quedará aplicado el contexto operativo antes de usarlo en ANIMA, NEXO y VISO.",
    status: "Siguiente",
  },
];

export default async function OperationsPage() {
  await requireAppAccess({
    appId: "viso",
    returnTo: ROUTE,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operación"
        subtitle="Centro de configuración del contexto operativo que conecta sedes, puntos físicos, roles y perfiles de trabajo."
      />

      <OperationsNav activePath={ROUTE} />

      <section className="grid gap-4 lg:grid-cols-2">
        {operationAreas.map((area) => (
          <Link
            key={area.href}
            href={area.href}
            className="ui-panel block transition hover:border-[var(--ui-border-strong)] hover:bg-[var(--ui-surface-strong)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <h2 className="text-base font-semibold text-[var(--ui-text)]">
                  {area.title}
                </h2>
                <p className="text-sm leading-6 text-[var(--ui-muted)]">
                  {area.description}
                </p>
              </div>
              <span className="ui-chip ui-chip--soft shrink-0">{area.status}</span>
            </div>
          </Link>
        ))}
      </section>

      <section className="ui-panel space-y-4">
        <div>
          <p className="ui-eyebrow">Modelo operativo</p>
          <h2 className="mt-1 text-lg font-semibold text-[var(--ui-text)]">
            Separación de sede real y punto físico
          </h2>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4">
            <p className="text-sm font-semibold text-[var(--ui-text)]">Sede operativa</p>
            <p className="mt-1 text-xs leading-5 text-[var(--ui-muted)]">
              Lugar real donde ocurre el turno y donde se reporta la operación.
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4">
            <p className="text-sm font-semibold text-[var(--ui-text)]">Punto de entrada</p>
            <p className="mt-1 text-xs leading-5 text-[var(--ui-muted)]">
              Geocerca física para validar check-in cuando no coincide con la sede.
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4">
            <p className="text-sm font-semibold text-[var(--ui-text)]">Punto de salida</p>
            <p className="mt-1 text-xs leading-5 text-[var(--ui-muted)]">
              Geocerca física para validar check-out de forma independiente.
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4">
            <p className="text-sm font-semibold text-[var(--ui-text)]">Rol operativo</p>
            <p className="mt-1 text-xs leading-5 text-[var(--ui-muted)]">
              Contexto de trabajo que activa permisos y flujos específicos.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
