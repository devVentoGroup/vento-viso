import Link from "next/link";

import { PageHeader } from "@/components/vento/standard/page-header";
import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

const sections = [
  {
    title: "Productos",
    description: "Crea y administra lo que vendes. Aquí defines nombre, precio, imagen, disponibilidad, personalización y en qué menús aparece.",
    href: "/menu",
    action: "Administrar productos",
    badge: "Lo que vendes",
  },
  {
    title: "Secciones",
    description: "Organiza los productos en familias permanentes como Cafés, Tortas, Entremets, Bebidas o Desayunos.",
    href: "/commercial-categories",
    action: "Administrar secciones",
    badge: "Cómo se agrupan",
  },
  {
    title: "Menús y temporadas",
    description: "Decide dónde aparecen los productos: menú principal, Regalos, campañas, fechas especiales o colecciones temporales.",
    href: "/commercial-collections",
    action: "Administrar menús",
    badge: "Dónde aparecen",
  },
  {
    title: "Revisión",
    description: "Consulta productos incompletos o configuraciones pendientes. Esta es una herramienta de control, no el flujo principal.",
    href: "/commercial-audit",
    action: "Revisar configuración",
    badge: "Control de calidad",
  },
];

export default async function CommercialMenuWorkspacePage() {
  await requireAppAccess({ appId: "viso", returnTo: "/commercial-menu" });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Menú comercial"
        subtitle="Administra el catálogo de Vento Pass siguiendo decisiones de negocio, sin tener que entender la estructura técnica del sistema."
        actions={
          <Link href="/menu/new" className="ui-btn ui-btn--brand">
            Crear producto
          </Link>
        }
      />

      <section className="rounded-3xl border border-[var(--ui-border)] bg-gradient-to-br from-white to-[var(--ui-surface-2)] p-5 shadow-sm sm:p-6">
        <div className="max-w-3xl">
          <div className="text-sm font-black uppercase tracking-[0.16em] text-[var(--ui-brand)]">
            Flujo recomendado
          </div>
          <h2 className="mt-2 text-2xl font-black text-[var(--ui-text)]">
            Primero crea lo que vendes; después decide dónde mostrarlo.
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--ui-muted)]">
            Un producto tiene una sección principal y puede aparecer en varios menús o temporadas. Desactivar una temporada no desactiva el producto.
          </p>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {[
            ["1", "Producto", "Qué compra el cliente"],
            ["2", "Sección", "Qué tipo de producto es"],
            ["3", "Menús", "Dónde debe aparecer"],
          ].map(([step, title, text]) => (
            <div key={step} className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--ui-brand)] text-sm font-black text-white">
                {step}
              </div>
              <div className="mt-3 text-base font-black text-[var(--ui-text)]">{title}</div>
              <div className="mt-1 text-sm text-[var(--ui-muted)]">{text}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group rounded-3xl border border-[var(--ui-border)] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--ui-brand)] hover:shadow-md"
          >
            <div className="inline-flex rounded-full bg-[var(--ui-surface-2)] px-3 py-1 text-xs font-black text-[var(--ui-muted)]">
              {section.badge}
            </div>
            <h2 className="mt-4 text-xl font-black text-[var(--ui-text)]">{section.title}</h2>
            <p className="mt-2 min-h-16 text-sm leading-6 text-[var(--ui-muted)]">
              {section.description}
            </p>
            <div className="mt-4 text-sm font-black text-[var(--ui-brand)]">
              {section.action} →
            </div>
          </Link>
        ))}
      </section>

      <section className="ui-panel space-y-3">
        <div className="ui-h3">Lo que sigue en esta implementación</div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            "Asignar un producto a varios menús y temporadas desde una sola pantalla.",
            "Simplificar la creación del producto como un asistente guiado.",
            "Configurar programación, anticipación mínima y productos por encargo.",
            "Agregar regalos, destinatarios guardados, tarjeta y entrega programada en Pass.",
          ].map((item, index) => (
            <div key={item} className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
              <div className="text-xs font-black uppercase tracking-wide text-[var(--ui-brand)]">Fase {index + 1}</div>
              <p className="mt-2 text-sm font-semibold leading-5 text-[var(--ui-text)]">{item}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
