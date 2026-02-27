"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { AppSwitcher } from "./app-switcher";
import { ProfileMenu } from "./profile-menu";
import { VentoLogo } from "./vento-logo";

type SiteOption = {
  id: string;
  name: string | null;
  site_type?: string | null;
};

type NavItem = {
  href: string;
  label: string;
  description?: string;
  icon?: IconName;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

type VentoChromeProps = {
  children: React.ReactNode;
  displayName: string;
  role?: string | null;
  email?: string | null;
  sites: SiteOption[];
  activeSiteId: string;
};

const APP_ENTITY =
  (process.env.NEXT_PUBLIC_VENTO_ENTITY?.toLowerCase() as
    | "default"
    | "nexo"
    | "fogo"
    | "pulso"
    | "viso"
    | "origo"
    | "anima"
    | "aura") ?? "viso";
const APP_NAME = process.env.NEXT_PUBLIC_VENTO_APP_NAME ?? "VISO";
const APP_TAGLINE =
  process.env.NEXT_PUBLIC_VENTO_APP_TAGLINE ?? "Gerencia y auditoria";

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Inicio",
    items: [
      {
        href: "/",
        label: "Panel",
        description: "Resumen general",
        icon: "dashboard",
      },
    ],
  },
  {
    label: "Libretas",
    items: [
      {
        href: "/staff",
        label: "Trabajadores",
        description: "Personal y roles",
        icon: "users",
      },
      {
        href: "/pass-users",
        label: "Usuarios Pass",
        description: "Clientes y lealtad",
        icon: "sparkles",
      },
    ],
  },
  {
    label: "Negocios",
    items: [
      {
        href: "/businesses",
        label: "Negocios",
        description: "Sedes y Vento Pass",
        icon: "store",
      },
    ],
  },
];

type IconName = "dashboard" | "users" | "store" | "sparkles";

function Icon({ name }: { name?: IconName }) {
  const common = "none";
  switch (name) {
    case "dashboard":
      return (
        <svg viewBox="0 0 24 24" fill={common} stroke="currentColor" strokeWidth="1.6">
          <path d="M4 4h7v7H4z" />
          <path d="M13 4h7v5h-7z" />
          <path d="M13 11h7v9h-7z" />
          <path d="M4 13h7v7H4z" />
        </svg>
      );
    case "users":
      return (
        <svg viewBox="0 0 24 24" fill={common} stroke="currentColor" strokeWidth="1.6">
          <path d="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4z" />
          <path d="M4 18c0-3 3-5 6-5" />
          <path d="M20 18c0-3-3-5-6-5" />
          <circle cx="8" cy="9" r="3" />
        </svg>
      );
    case "store":
      return (
        <svg viewBox="0 0 24 24" fill={common} stroke="currentColor" strokeWidth="1.6">
          <path d="M3 9h18l-2-5H5z" />
          <path d="M5 9v10h14V9" />
          <path d="M9 19v-6h6v6" />
        </svg>
      );
    case "sparkles":
      return (
        <svg viewBox="0 0 24 24" fill={common} stroke="currentColor" strokeWidth="1.6">
          <path d="M12 3l1.5 3.5L17 8l-3.5 1.5L12 13l-1.5-3.5L7 8l3.5-1.5L12 3z" />
          <path d="M5 16l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z" />
          <path d="M18 14l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z" />
        </svg>
      );
    default:
      return null;
  }
}

function SidebarLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`ui-sidebar-item ${active ? "active" : ""}`}
    >
      <span className="ui-sidebar-item-icon">
        <Icon name={item.icon} />
      </span>
      <span className="ui-sidebar-item-content">
        <span className="ui-sidebar-item-title">{item.label}</span>
        {item.description ? (
          <span className="ui-sidebar-item-desc">{item.description}</span>
        ) : null}
      </span>
    </Link>
  );
}

export function VentoChrome({
  children,
  displayName,
  role,
  email,
  sites,
  activeSiteId,
}: VentoChromeProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);

  const currentSiteId = searchParams.get("site_id") ?? activeSiteId ?? "";
  const currentSite = useMemo(
    () => sites.find((site) => site.id === currentSiteId),
    [sites, currentSiteId]
  );
  const currentSiteLabel = currentSite?.name ?? currentSiteId ?? "Sin sede";

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <div className="min-h-screen bg-[var(--ui-bg)] text-[var(--ui-text)]">
      <div className="flex min-h-screen">
        <div
          className={`fixed inset-0 z-40 bg-black/30 transition lg:hidden ${
            menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />

        <aside
          className={`ui-sidebar fixed left-0 top-0 z-50 flex h-full w-72 flex-col gap-4 px-4 py-5 transition-transform lg:static lg:translate-x-0 lg:shadow-none ${
            menuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between">
            <VentoLogo
              entity={APP_ENTITY}
              title="Vento OS"
              subtitle={APP_TAGLINE}
            />
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="h-10 rounded-lg px-3 text-sm font-semibold text-[var(--ui-muted)] hover:bg-[var(--ui-surface-2)] lg:hidden"
            >
              Cerrar
            </button>
          </div>

          <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
              Sede activa
            </div>
            <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">{currentSiteLabel}</div>
          </div>

          <nav className="flex flex-1 flex-col gap-4 overflow-y-auto pr-1">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="space-y-2">
                <div className="px-2 text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
                  {group.label}
                </div>
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <SidebarLink
                      key={item.href}
                      item={item}
                      active={isActive(item.href)}
                      onNavigate={() => setMenuOpen(false)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="ui-header sticky top-0 z-30">
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-6 sm:py-5">
              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => setMenuOpen(true)}
                  className="inline-flex items-center rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] h-10 px-3 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)] sm:h-12 sm:px-4 sm:text-base lg:hidden"
                >
                  Menu
                </button>
                <div className="hidden sm:flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ui-surface-2)] ring-1 ring-inset ring-[var(--ui-border)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/logos/${APP_ENTITY}.svg`} alt={APP_NAME} className="h-6 w-6" />
                  </div>
                  <div className="flex flex-col leading-tight">
                    <span className="text-sm font-semibold text-[var(--ui-text)]">{APP_NAME}</span>
                    <span className="text-xs text-[var(--ui-muted)]">{APP_TAGLINE}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2">
                <AppSwitcher sites={sites} activeSiteId={activeSiteId} />
                <ProfileMenu name={displayName} role={role ?? undefined} email={email} sites={sites} />
              </div>
            </div>
          </header>

          <main className="min-w-0 flex-1 px-6 py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
