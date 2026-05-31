import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { PageHeader } from "@/components/vento/standard/page-header";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type SearchParams = {
  app?: string;
  ok?: string;
  error?: string;
};

type NavigationRow = {
  app_code: string;
  group_key: string | null;
  group_label: string | null;
  group_order: number | null;
  item_key: string;
  label: string | null;
  description: string | null;
  href: string | null;
  icon: string | null;
  required_permission_code: string | null;
  sort_order: number | null;
  is_active: boolean | null;
};

type NavigationGroup = {
  groupKey: string;
  groupLabel: string;
  groupOrder: number;
  items: NavigationRow[];
};

const MANAGED_APPS = ["viso", "nexo", "fogo", "origo", "pulso"];

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function safeDecode(value: string | null | undefined) {
  if (!value) return "";

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function asInteger(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(asText(value));
  return Number.isInteger(parsed) ? parsed : fallback;
}

function normalizeAppCode(value: string) {
  return value.trim().toLowerCase();
}

function slugify(value: string) {
  const base = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);

  return base || "group";
}

function buildRedirect(appCode: string, status: { ok?: string; error?: string }) {
  const params = new URLSearchParams();

  if (appCode) params.set("app", appCode);
  if (status.ok) params.set("ok", status.ok);
  if (status.error) params.set("error", status.error);

  const query = params.toString();
  return query ? `/app-navigation?${query}` : "/app-navigation";
}

function getAppLabel(appCode: string) {
  return appCode.toUpperCase();
}

function groupNavigationRows(rows: NavigationRow[]): NavigationGroup[] {
  const groups = new Map<string, NavigationGroup>();

  for (const row of rows) {
    const groupKey =
      String(row.group_key ?? "").trim() ||
      slugify(String(row.group_label ?? "Sin grupo"));
    const groupLabel = String(row.group_label ?? "Sin grupo").trim() || "Sin grupo";
    const groupOrder = Number(row.group_order ?? 100);

    const current =
      groups.get(groupKey) ??
      ({
        groupKey,
        groupLabel,
        groupOrder,
        items: [],
      } satisfies NavigationGroup);

    current.items.push(row);
    current.groupLabel = groupLabel;
    current.groupOrder = groupOrder;

    groups.set(groupKey, current);
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      items: group.items.sort((a, b) => {
        const orderDiff = Number(a.sort_order ?? 100) - Number(b.sort_order ?? 100);
        if (orderDiff !== 0) return orderDiff;
        return String(a.label ?? a.item_key).localeCompare(String(b.label ?? b.item_key), "es");
      }),
    }))
    .sort((a, b) => {
      const orderDiff = a.groupOrder - b.groupOrder;
      if (orderDiff !== 0) return orderDiff;
      return a.groupLabel.localeCompare(b.groupLabel, "es");
    });
}

async function updateNavigationGroup(formData: FormData) {
  "use server";

  const appCode = normalizeAppCode(asText(formData.get("app_code")));
  const groupLabel = asText(formData.get("group_label"));
  const groupOrder = asInteger(formData.get("group_order"), 100);
  const itemKeys = formData
    .getAll("item_key")
    .map((value) => String(value).trim())
    .filter(Boolean);

  await requireAppAccess({
    appId: "viso",
    returnTo: buildRedirect(appCode, {}),
    permissionCode: "staff.permissions.manage",
  });

  if (!MANAGED_APPS.includes(appCode)) {
    redirect(buildRedirect(appCode, { error: "App no administrable desde esta vista." }));
  }

  if (!groupLabel) {
    redirect(buildRedirect(appCode, { error: "El grupo necesita un nombre." }));
  }

  if (!itemKeys.length) {
    redirect(buildRedirect(appCode, { error: "No hay pantallas para guardar." }));
  }

  const supabase = createAdminClient();
  const groupKey = slugify(groupLabel);

  const updates = itemKeys.map(async (itemKey) => {
    const label = asText(formData.get(`label__${itemKey}`));
    const sortOrder = asInteger(formData.get(`sort_order__${itemKey}`), 100);
    const isActive = formData.get(`is_active__${itemKey}`) === "on";

    if (!label) {
      return {
        itemKey,
        error: "Cada pantalla necesita un nombre.",
      };
    }

    const { error } = await supabase
      .from("app_navigation_items")
      .update({
        group_key: groupKey,
        group_label: groupLabel,
        group_order: groupOrder,
        label,
        sort_order: sortOrder,
        is_active: isActive,
      })
      .eq("app_code", appCode)
      .eq("item_key", itemKey);

    return {
      itemKey,
      error: error?.message ?? null,
    };
  });

  const results = await Promise.all(updates);
  const firstError = results.find((result) => result.error);

  if (firstError?.error) {
    redirect(buildRedirect(appCode, { error: firstError.error }));
  }

  revalidatePath("/app-navigation");
  redirect(buildRedirect(appCode, { ok: "navigation_saved" }));
}

function AppSelector({
  selectedApp,
  visibleCounts,
}: {
  selectedApp: string;
  visibleCounts: Record<string, number>;
}) {
  return (
    <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 shadow-[var(--ui-shadow-soft)]">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
        App
      </div>

      <div className="flex flex-wrap gap-2">
        {MANAGED_APPS.map((appCode) => (
          <Link
            key={appCode}
            href={`/app-navigation?app=${encodeURIComponent(appCode)}`}
            className={`ui-btn ${
              appCode === selectedApp ? "ui-btn--primary" : "ui-btn--ghost"
            }`}
          >
            {getAppLabel(appCode)}
            <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-xs">
              {visibleCounts[appCode] ?? 0}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function NavigationGroupCard({ group, appCode }: { group: NavigationGroup; appCode: string }) {
  const visibleCount = group.items.filter((item) => item.is_active !== false).length;
  const hiddenCount = group.items.length - visibleCount;

  return (
    <form
      action={updateNavigationGroup}
      className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 shadow-[var(--ui-shadow-soft)]"
    >
      <input type="hidden" name="app_code" value={appCode} />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
            Grupo del menú
          </div>
          <div className="mt-1 text-lg font-semibold text-[var(--ui-text)]">
            {group.groupLabel}
          </div>
          <div className="mt-1 text-sm text-[var(--ui-muted)]">
            {visibleCount} visibles · {hiddenCount} ocultas
          </div>
        </div>

        <button type="submit" className="ui-btn ui-btn--primary">
          Guardar grupo
        </button>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px]">
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
            Nombre del grupo
          </span>
          <input
            name="group_label"
            defaultValue={group.groupLabel}
            className="ui-input"
            required
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
            Orden del grupo
          </span>
          <input
            name="group_order"
            type="number"
            defaultValue={group.groupOrder}
            className="ui-input"
          />
        </label>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-[var(--ui-border)]">
        <div className="grid grid-cols-[72px_minmax(0,1fr)_120px] gap-3 bg-[var(--ui-surface-2)] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
          <div>Visible</div>
          <div>Pantalla</div>
          <div>Orden</div>
        </div>

        <div className="divide-y divide-[var(--ui-border)]">
          {group.items.map((item) => {
            const label = item.label ?? item.item_key;

            return (
              <div
                key={item.item_key}
                className="grid grid-cols-[72px_minmax(0,1fr)_120px] gap-3 px-4 py-3"
              >
                <input type="hidden" name="item_key" value={item.item_key} />

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    name={`is_active__${item.item_key}`}
                    defaultChecked={item.is_active !== false}
                    className="h-5 w-5"
                    aria-label={`Mostrar ${label}`}
                  />
                </label>

                <div className="min-w-0">
                  <input
                    name={`label__${item.item_key}`}
                    defaultValue={label}
                    required
                    className="ui-input h-12"
                  />

                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--ui-muted)]">
                    {item.href ? (
                      <span className="rounded-full bg-[var(--ui-surface-2)] px-2 py-1">
                        {item.href}
                      </span>
                    ) : null}

                    {item.required_permission_code ? (
                      <span className="rounded-full bg-[var(--ui-surface-2)] px-2 py-1">
                        {item.required_permission_code}
                      </span>
                    ) : null}
                  </div>
                </div>

                <input
                  name={`sort_order__${item.item_key}`}
                  type="number"
                  defaultValue={item.sort_order ?? 100}
                  className="ui-input h-12"
                  aria-label={`Orden de ${label}`}
                />
              </div>
            );
          })}
        </div>
      </div>
    </form>
  );
}

export default async function AppNavigationPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const requestedApp = normalizeAppCode(String(sp.app ?? "nexo"));
  const selectedApp = MANAGED_APPS.includes(requestedApp) ? requestedApp : "nexo";

  const okMsg =
    sp.ok === "navigation_saved"
      ? "Navegación guardada."
      : safeDecode(sp.ok);
  const errorMsg = safeDecode(sp.error);

  await requireAppAccess({
    appId: "viso",
    returnTo: "/app-navigation",
    permissionCode: "staff.permissions.manage",
  });

  const supabase = createAdminClient();

  const { data: navigationData, error } = await supabase
    .from("app_navigation_items")
    .select(
      "app_code,group_key,group_label,group_order,item_key,label,description,href,icon,required_permission_code,sort_order,is_active"
    )
    .in("app_code", MANAGED_APPS)
    .order("app_code", { ascending: true })
    .order("group_order", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) {
    redirect(buildRedirect(selectedApp, { error: error.message }));
  }

  const allRows = (navigationData ?? []) as NavigationRow[];
  const selectedRows = allRows.filter((row) => row.app_code === selectedApp);
  const groups = groupNavigationRows(selectedRows);

  const visibleCounts = MANAGED_APPS.reduce<Record<string, number>>((acc, appCode) => {
    acc[appCode] = allRows.filter(
      (row) => row.app_code === appCode && row.is_active !== false
    ).length;
    return acc;
  }, {});

  const visibleCount = selectedRows.filter((row) => row.is_active !== false).length;
  const hiddenCount = selectedRows.length - visibleCount;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Navegación de apps"
        subtitle="Administra la visibilidad y el orden del menú lateral sin tocar SQL."
        actions={
          <Link href="/roles-permissions" className="ui-btn ui-btn--ghost">
            Permisos por rol
          </Link>
        }
      />

      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">Listo: {okMsg}</div> : null}

      <AppSelector selectedApp={selectedApp} visibleCounts={visibleCounts} />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 shadow-[var(--ui-shadow-soft)]">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
            App seleccionada
          </div>
          <div className="mt-1 text-2xl font-semibold text-[var(--ui-text)]">
            {getAppLabel(selectedApp)}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 shadow-[var(--ui-shadow-soft)]">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
            Pantallas visibles
          </div>
          <div className="mt-1 text-2xl font-semibold text-[var(--ui-text)]">
            {visibleCount}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 shadow-[var(--ui-shadow-soft)]">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
            Ocultas
          </div>
          <div className="mt-1 text-2xl font-semibold text-[var(--ui-text)]">
            {hiddenCount}
          </div>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="ui-empty">
          No hay pantallas configuradas para {getAppLabel(selectedApp)}.
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <NavigationGroupCard
              key={`${selectedApp}:${group.groupKey}`}
              group={group}
              appCode={selectedApp}
            />
          ))}
        </div>
      )}
    </div>
  );
}
