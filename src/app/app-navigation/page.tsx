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

type RegistryRow = {
  id: string;
  app_code: string;
  item_key: string;
  label: string;
  description: string | null;
  href: string;
  icon: string | null;
  suggested_group_key: string | null;
  suggested_group_label: string | null;
  suggested_group_order: number | null;
  suggested_sort_order: number | null;
  required_permission_code: string | null;
  navigation_kind: string | null;
  is_menu_candidate: boolean | null;
  parent_href: string | null;
  is_available: boolean | null;
  is_ignored: boolean | null;
};

type NavigationGroup = {
  groupKey: string;
  groupLabel: string;
  groupOrder: number;
  items: NavigationRow[];
};

type GroupOption = {
  groupKey: string;
  groupLabel: string;
  groupOrder: number;
};

const MANAGED_APPS = ["viso", "nexo", "fogo", "origo", "pulso", "numera"];

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

function parseGroupOption(value: string): GroupOption | null {
  try {
    const parsed = JSON.parse(value) as Partial<GroupOption>;

    if (!parsed.groupKey || !parsed.groupLabel) return null;

    return {
      groupKey: String(parsed.groupKey),
      groupLabel: String(parsed.groupLabel),
      groupOrder: Number(parsed.groupOrder ?? 100),
    };
  } catch {
    return null;
  }
}

function getNavigationKindLabel(kind: string | null) {
  switch (kind) {
    case "menu":
      return "Menú";
    case "submenu":
      return "Subpantalla";
    case "detail":
      return "Detalle";
    case "action":
      return "Acción";
    case "internal":
      return "Interna";
    case "auth":
      return "Acceso";
    case "hidden":
      return "Oculta";
    default:
      return "Detectada";
  }
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
  const groupKey = asText(formData.get("group_key")) || slugify(asText(formData.get("group_label")));
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

async function promoteDetectedScreen(formData: FormData) {
  "use server";

  const appCode = normalizeAppCode(asText(formData.get("app_code")));
  const registryId = asText(formData.get("registry_id"));
  const sortOrder = asInteger(formData.get("sort_order"), 100);
  const isActive = formData.get("is_active") === "on";
  const groupOption = parseGroupOption(asText(formData.get("group_option")));

  await requireAppAccess({
    appId: "viso",
    returnTo: buildRedirect(appCode, {}),
    permissionCode: "staff.permissions.manage",
  });

  if (!MANAGED_APPS.includes(appCode)) {
    redirect(buildRedirect(appCode, { error: "App no administrable desde esta vista." }));
  }

  if (!registryId) {
    redirect(buildRedirect(appCode, { error: "No se encontró la pantalla detectada." }));
  }

  if (!groupOption) {
    redirect(buildRedirect(appCode, { error: "Selecciona un grupo válido." }));
  }

  const supabase = createAdminClient();

  const { error } = await supabase.rpc("promote_app_screen_to_navigation", {
    p_registry_id: registryId,
    p_group_key: groupOption.groupKey,
    p_group_label: groupOption.groupLabel,
    p_group_order: groupOption.groupOrder,
    p_sort_order: sortOrder,
    p_is_active: isActive,
  });

  if (error) {
    redirect(buildRedirect(appCode, { error: error.message }));
  }

  revalidatePath("/app-navigation");
  redirect(buildRedirect(appCode, { ok: "screen_added" }));
}

async function ignoreDetectedScreen(formData: FormData) {
  "use server";

  const appCode = normalizeAppCode(asText(formData.get("app_code")));
  const registryId = asText(formData.get("registry_id"));

  await requireAppAccess({
    appId: "viso",
    returnTo: buildRedirect(appCode, {}),
    permissionCode: "staff.permissions.manage",
  });

  if (!MANAGED_APPS.includes(appCode)) {
    redirect(buildRedirect(appCode, { error: "App no administrable desde esta vista." }));
  }

  if (!registryId) {
    redirect(buildRedirect(appCode, { error: "No se encontró la pantalla detectada." }));
  }

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("app_screen_registry")
    .update({
      is_ignored: true,
      is_menu_candidate: false,
    })
    .eq("id", registryId);

  if (error) {
    redirect(buildRedirect(appCode, { error: error.message }));
  }

  revalidatePath("/app-navigation");
  redirect(buildRedirect(appCode, { ok: "screen_ignored" }));
}

function AppSelector({
  selectedApp,
  visibleCounts,
  availableCounts,
}: {
  selectedApp: string;
  visibleCounts: Record<string, number>;
  availableCounts: Record<string, number>;
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
            {availableCounts[appCode] ? (
              <span className="ml-1 rounded-full bg-black/10 px-2 py-0.5 text-xs">
                +{availableCounts[appCode]}
              </span>
            ) : null}
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
      <input type="hidden" name="group_key" value={group.groupKey} />

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

function AvailableScreensSection({
  selectedApp,
  screens,
  groups,
}: {
  selectedApp: string;
  screens: RegistryRow[];
  groups: NavigationGroup[];
}) {
  const groupOptions =
    groups.length > 0
      ? groups.map((group) => ({
          groupKey: group.groupKey,
          groupLabel: group.groupLabel,
          groupOrder: group.groupOrder,
        }))
      : [
          {
            groupKey: "configuration",
            groupLabel: "Configuración",
            groupOrder: 60,
          },
        ];

  return (
    <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 shadow-[var(--ui-shadow-soft)]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
            Detectadas por agregar
          </div>
          <h2 className="mt-1 text-lg font-semibold text-[var(--ui-text)]">
            Pantallas disponibles
          </h2>
          <p className="mt-1 text-sm text-[var(--ui-muted)]">
            Estas páginas existen en código, son candidatas de menú y todavía no están en el
            sidebar.
          </p>
        </div>

        <div className="rounded-full bg-[var(--ui-surface-2)] px-3 py-1 text-sm font-semibold text-[var(--ui-text)]">
          {screens.length} pendientes
        </div>
      </div>

      {screens.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-[var(--ui-border)] p-5 text-sm text-[var(--ui-muted)]">
          No hay pantallas nuevas pendientes por agregar para {getAppLabel(selectedApp)}.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {screens.map((screen) => {
            const suggestedGroup = groups.find(
              (group) => group.groupKey === screen.suggested_group_key
            );
            const defaultGroup =
              suggestedGroup ??
              groups.find((group) => group.groupLabel === screen.suggested_group_label) ??
              groups[0];

            return (
              <div
                key={screen.id}
                className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="font-semibold text-[var(--ui-text)]">{screen.label}</div>
                    <div className="mt-1 text-sm text-[var(--ui-muted)]">{screen.href}</div>

                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--ui-muted)]">
                      <span className="rounded-full bg-[var(--ui-surface)] px-2 py-1">
                        {screen.required_permission_code ?? "Sin permiso"}
                      </span>
                      <span className="rounded-full bg-[var(--ui-surface)] px-2 py-1">
                        {getNavigationKindLabel(screen.navigation_kind)}
                      </span>
                    </div>
                  </div>

                  <form action={ignoreDetectedScreen}>
                    <input type="hidden" name="app_code" value={selectedApp} />
                    <input type="hidden" name="registry_id" value={screen.id} />
                    <button type="submit" className="ui-btn ui-btn--ghost">
                      Ignorar
                    </button>
                  </form>
                </div>

                <form action={promoteDetectedScreen} className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_140px_140px_auto]">
                  <input type="hidden" name="app_code" value={selectedApp} />
                  <input type="hidden" name="registry_id" value={screen.id} />

                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
                      Grupo existente
                    </span>
                    <select
                      name="group_option"
                      defaultValue={JSON.stringify(
                        defaultGroup
                          ? {
                              groupKey: defaultGroup.groupKey,
                              groupLabel: defaultGroup.groupLabel,
                              groupOrder: defaultGroup.groupOrder,
                            }
                          : groupOptions[0]
                      )}
                      className="ui-input"
                    >
                      {groupOptions.map((group) => (
                        <option
                          key={group.groupKey}
                          value={JSON.stringify(group)}
                        >
                          {group.groupLabel}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
                      Orden
                    </span>
                    <input
                      name="sort_order"
                      type="number"
                      defaultValue={screen.suggested_sort_order ?? 100}
                      className="ui-input"
                    />
                  </label>

                  <label className="flex items-center gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-3 lg:mt-6">
                    <input name="is_active" type="checkbox" defaultChecked className="h-5 w-5" />
                    <span className="text-sm font-semibold text-[var(--ui-text)]">
                      Visible
                    </span>
                  </label>

                  <button type="submit" className="ui-btn ui-btn--primary lg:mt-6">
                    Agregar
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function DetectedNonCandidatesSection({ screens }: { screens: RegistryRow[] }) {
  const visibleScreens = screens.slice(0, 60);

  return (
    <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 shadow-[var(--ui-shadow-soft)]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
            Auditoría
          </div>
          <h2 className="mt-1 text-lg font-semibold text-[var(--ui-text)]">
            Detectadas no candidatas
          </h2>
          <p className="mt-1 text-sm text-[var(--ui-muted)]">
            Existen en código, pero no deben aparecer como accesos principales del sidebar.
          </p>
        </div>

        <div className="rounded-full bg-[var(--ui-surface-2)] px-3 py-1 text-sm font-semibold text-[var(--ui-text)]">
          {screens.length} detectadas
        </div>
      </div>

      {screens.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-[var(--ui-border)] p-5 text-sm text-[var(--ui-muted)]">
          No hay pantallas internas registradas.
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--ui-border)]">
          <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3 bg-[var(--ui-surface-2)] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
            <div>Tipo</div>
            <div>Ruta</div>
          </div>

          <div className="divide-y divide-[var(--ui-border)]">
            {visibleScreens.map((screen) => (
              <div key={screen.id} className="grid grid-cols-[140px_minmax(0,1fr)] gap-3 px-4 py-3">
                <div className="text-sm font-semibold text-[var(--ui-text)]">
                  {getNavigationKindLabel(screen.navigation_kind)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[var(--ui-text)]">{screen.label}</div>
                  <div className="mt-1 break-all text-xs text-[var(--ui-muted)]">{screen.href}</div>
                  {screen.parent_href ? (
                    <div className="mt-1 break-all text-xs text-[var(--ui-muted)]">
                      Padre: {screen.parent_href}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {screens.length > visibleScreens.length ? (
        <div className="mt-3 text-sm text-[var(--ui-muted)]">
          Mostrando {visibleScreens.length} de {screens.length}.
        </div>
      ) : null}
    </section>
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
      : sp.ok === "screen_added"
        ? "Pantalla agregada al menú."
        : sp.ok === "screen_ignored"
          ? "Pantalla ignorada."
          : safeDecode(sp.ok);
  const errorMsg = safeDecode(sp.error);

  await requireAppAccess({
    appId: "viso",
    returnTo: "/app-navigation",
    permissionCode: "staff.permissions.manage",
  });

  const supabase = createAdminClient();

  const { data: navigationData, error: navigationError } = await supabase
    .from("app_navigation_items")
    .select(
      "app_code,group_key,group_label,group_order,item_key,label,description,href,icon,required_permission_code,sort_order,is_active"
    )
    .in("app_code", MANAGED_APPS)
    .order("app_code", { ascending: true })
    .order("group_order", { ascending: true })
    .order("sort_order", { ascending: true });

  if (navigationError) {
    redirect(buildRedirect(selectedApp, { error: navigationError.message }));
  }

  const { data: registryData, error: registryError } = await supabase
    .from("app_screen_registry")
    .select(
      "id,app_code,item_key,label,description,href,icon,suggested_group_key,suggested_group_label,suggested_group_order,suggested_sort_order,required_permission_code,navigation_kind,is_menu_candidate,parent_href,is_available,is_ignored"
    )
    .in("app_code", MANAGED_APPS)
    .order("app_code", { ascending: true })
    .order("suggested_group_order", { ascending: true })
    .order("suggested_sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (registryError) {
    redirect(buildRedirect(selectedApp, { error: registryError.message }));
  }

  const allRows = (navigationData ?? []) as NavigationRow[];
  const allRegistryRows = (registryData ?? []) as RegistryRow[];

  const selectedRows = allRows.filter((row) => row.app_code === selectedApp);
  const selectedHrefs = new Set(
    selectedRows
      .map((row) => row.href)
      .filter((href): href is string => Boolean(href))
  );
  const selectedRegistryRows = allRegistryRows.filter((row) => row.app_code === selectedApp);

  const groups = groupNavigationRows(selectedRows);

  const availableScreens = selectedRegistryRows.filter(
    (row) =>
      row.is_available !== false &&
      row.is_ignored !== true &&
      row.is_menu_candidate === true &&
      !selectedHrefs.has(row.href)
  );

  const nonCandidateScreens = selectedRegistryRows.filter(
    (row) =>
      row.is_ignored === true ||
      row.is_available === false ||
      row.is_menu_candidate !== true
  );

  const visibleCounts = MANAGED_APPS.reduce<Record<string, number>>((acc, appCode) => {
    acc[appCode] = allRows.filter(
      (row) => row.app_code === appCode && row.is_active !== false
    ).length;
    return acc;
  }, {});

  const availableCounts = MANAGED_APPS.reduce<Record<string, number>>((acc, appCode) => {
    const appHrefs = new Set(
      allRows
        .filter((row) => row.app_code === appCode)
        .map((row) => row.href)
        .filter((href): href is string => Boolean(href))
    );

    acc[appCode] = allRegistryRows.filter(
      (row) =>
        row.app_code === appCode &&
        row.is_available !== false &&
        row.is_ignored !== true &&
        row.is_menu_candidate === true &&
        !appHrefs.has(row.href)
    ).length;

    return acc;
  }, {});

  const visibleCount = selectedRows.filter((row) => row.is_active !== false).length;
  const hiddenCount = selectedRows.length - visibleCount;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Navegación de apps"
        subtitle="Administra pantallas existentes, nuevas páginas detectadas y rutas internas."
        actions={
          <Link href="/roles-permissions" className="ui-btn ui-btn--ghost">
            Permisos por rol
          </Link>
        }
      />

      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">Listo: {okMsg}</div> : null}

      <AppSelector
        selectedApp={selectedApp}
        visibleCounts={visibleCounts}
        availableCounts={availableCounts}
      />

      <div className="grid gap-3 sm:grid-cols-4">
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
            Visibles
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

        <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 shadow-[var(--ui-shadow-soft)]">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
            Por agregar
          </div>
          <div className="mt-1 text-2xl font-semibold text-[var(--ui-text)]">
            {availableScreens.length}
          </div>
        </div>
      </div>

      <AvailableScreensSection
        selectedApp={selectedApp}
        screens={availableScreens}
        groups={groups}
      />

      <section className="space-y-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
            Menú lateral actual
          </div>
          <h2 className="mt-1 text-lg font-semibold text-[var(--ui-text)]">
            Pantallas en el sidebar
          </h2>
          <p className="mt-1 text-sm text-[var(--ui-muted)]">
            Estas son las entradas reales que usa el menú lateral de {getAppLabel(selectedApp)}.
          </p>
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
      </section>

      <DetectedNonCandidatesSection screens={nonCandidateScreens} />
    </div>
  );
}
