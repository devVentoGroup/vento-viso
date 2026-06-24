import Link from "next/link";

type OperationNavItem = {
  href: string;
  label: string;
  description: string;
};

type OperationsNavProps = {
  activePath?: string;
};

const OPERATION_ITEMS: OperationNavItem[] = [
  {
    href: "/operations/preview",
    label: "Vista previa",
    description: "Revisa el contexto operativo antes de aplicarlo.",
  },
  {
    href: "/operations/checkin-points",
    label: "Puntos de marcación",
    description: "Administra geocercas y puntos físicos de entrada o salida.",
  },
  {
    href: "/operations/site-roles",
    label: "Roles por sede",
    description: "Configura roles operativos permitidos por sede.",
  },
  {
    href: "/operations/employee-profiles",
    label: "Perfiles operativos",
    description: "Define perfiles por trabajador, sede y rol.",
  },
];

function isActiveItem(activePath: string | undefined, href: string) {
  if (!activePath) return false;
  return activePath === href || activePath.startsWith(`${href}/`);
}

export function OperationsNav({ activePath }: OperationsNavProps) {
  return (
    <section className="ui-panel" aria-labelledby="operations-nav-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl space-y-1">
          <p className="ui-eyebrow">Modulo operativo</p>
          <h2 id="operations-nav-title" className="text-lg font-semibold text-[var(--ui-text)]">
            Operación
          </h2>
          <p className="text-sm text-[var(--ui-muted)]">
            Configura el contexto operativo que usan ANIMA, NEXO y VISO sin llenar la navegación principal.
          </p>
        </div>

        <div className="ui-chip ui-chip--soft w-fit">Configuración centralizada</div>
      </div>

      <nav aria-label="Navegación de operación" className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {OPERATION_ITEMS.map((item) => {
          const active = isActiveItem(activePath, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={[
                "group rounded-2xl border p-4 transition",
                active
                  ? "border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] shadow-sm"
                  : "border-[var(--ui-border)] bg-[var(--ui-surface)] hover:border-[var(--ui-border-strong)] hover:bg-[var(--ui-surface-strong)]",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-[var(--ui-text)]">{item.label}</p>
                  <p className="text-xs leading-5 text-[var(--ui-muted)]">{item.description}</p>
                </div>
                <span
                  className={[
                    "mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full",
                    active ? "bg-[var(--ui-accent)]" : "bg-[var(--ui-border-strong)] group-hover:bg-[var(--ui-muted)]",
                  ].join(" ")}
                />
              </div>
            </Link>
          );
        })}
      </nav>
    </section>
  );
}
