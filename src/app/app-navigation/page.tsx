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

type AppRow = {
  code: string | null;
};

type RawPermissionOption = {
  code: string;
  name: string | null;
  app: { code: string } | { code: string }[] | null;
};

type PermissionOption = {
  appCode: string;
  code: string;
  fullCode: string;
  label: string;
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
  opens_in_new_tab: boolean | null;
  metadata: Record<string, unknown> | null;
};

const FALLBACK_APPS = ["viso", "nexo", "fogo", "origo", "pulso", "shell", "aura"];

const ICON_OPTIONS = [
  "dashboard",
  "accounting",
  "users",
  "calendar",
  "store",
  "sparkles",
  "package",
  "menu",
  "fileText",
  "briefcase",
  "phone",
  "book",
  "flask",
  "truck",
  "warehouse",
  "clipboard",
  "boxes",
  "shoppingCart",
  "map",
  "settings",
  "alertTriangle",
  "scan",
  "printer",
  "arrows",
  "sliders",
  "layers",
];

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

function slugify(value: string) {
  const base = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);

  return base || "item";
}

function normalizeAppCode(value: string) {
  return value.trim().toLowerCase();
}

function normalizePermission(item: RawPermissionOption): PermissionOption | null {
  const app = Array.isArray(item.app) ? item.app[0] ?? null : item.app;
  const appCode = String(app?.code ?? "").trim();
  const code = String(item.code ?? "").trim();

  if (!appCode || !code) return null;

  return {
    appCode,
    code,
    fullCode: `${appCode}.${code}`,
    label: item.name ? `${appCode}.${code} · ${item.name}` : `${appCode}.${code}`,
  };
}

function parseMetadata(value: string) {
  const raw = value.trim();

  if (!raw) {
    return { ok: true as const, value: {} as Record<string, unknown> };
  }

  try {
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        ok: false as const,
        error: "Metadata debe ser un objeto JSON. Ejemplo: {}",
      };
    }

    return {
      ok: true as const,
      value: parsed as Record<string, unknown>,
    };
  } catch {
    return {
      ok: false as const,
      error: "Metadata no es JSON valido.",
    };
  }
}

function buildRedirect(appCode: string, status: { ok?: string; error?: string }) {
  const params = new URLSearchParams();

  if (appCode) params.set("app", appCode);
  if (status.ok) params.set("ok", status.ok);
  if (status.error) params.set("error", status.error);

  const qs = params.toString();
  return qs ? `/app-navigation?${qs}` : "/app-navigation";
}

function getNavigationPayload(formData: FormData) {
  const appCode = normalizeAppCode(asText(formData.get("app_code")));
  const itemKey = slugify(asText(formData.get("item_key")));
  const groupLabel = asText(formData.get("group_label"));
  const groupKey = slugify(asText(formData.get("group_key")) || groupLabel);
  const label = asText(formData.get("label"));
  const href = asText(formData.get("href"));
  const requiredPermissionCode = asText(formData.get("required_permission_code"));
  const metadataResult = parseMetadata(asText(formData.get("metadata")));

  if (!appCode) {
    return { ok: false as const, appCode: "", error: "Selecciona una app." };
  }

  if (!itemKey) {
    return { ok: false as const, appCode, error: "Define item_key." };
  }

  if (!groupLabel) {
    return { ok: false as const, appCode, error: "Define el grupo." };
  }

  if (!label) {
    return { ok: false as const, appCode, error: "Define el nombre de pantalla." };
  }

  if (!href.startsWith("/")) {
    return { ok: false as const, appCode, error: "La ruta href debe empezar por /." };
  }

  if (!requiredPermissionCode.includes(".")) {
    return {
      ok: false as const,
      appCode,
      error: "El permiso requerido debe incluir la app. Ejemplo: nexo.inventory.stock",
    };
  }

  if (!metadataResult.ok) {
    return {
      ok: false as const,
      appCode,
      error: metadataResult.error,
    };
  }

  return {
    ok: true as const,
    appCode,
    itemKey,
    payload: {
      app_code: appCode,
      group_key: groupKey,
      group_label: groupLabel,
      group_order: asInteger(formData.get("group_order"), 100),
      item_key: itemKey,
      label,
      description: asText(formData.get("description")) || null,
      href,
      icon: asText(formData.get("icon")) || null,
      required_permission_code: requiredPermissionCode,
      sort_order: asInteger(formData.get("sort_order"), 100),
      is_active: formData.get("is_active") === "on",
      opens_in_new_tab: formData.get("opens_in_new_tab") === "on",
      metadata: metadataResult.value,
    },
  };
}

async function createNavigationItem(formData: FormData) {
  "use server";

  await requireAppAccess({
    appId: "viso",
    returnTo: "/app-navigation",
    permissionCode: "staff.permissions.manage",
  });

  const result = getNavigationPayload(formData);

  if (!result.ok) {
    redirect(buildRedirect(result.appCode, { error: result.error }));
  }

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("app_navigation_items")
    .upsert(result.payload, {
      onConflict: "app_code,item_key",
    });

  if (error) {
    redirect(buildRedirect(result.appCode, { error: error.message }));
  }

  revalidatePath("/app-navigation");
  redirect(buildRedirect(result.appCode, { ok: "navigation_saved" }));
}

async function updateNavigationItem(formData: FormData) {
  "use server";

  const originalAppCode = normalizeAppCode(asText(formData.get("original_app_code")));
  const originalItemKey = slugify(asText(formData.get("original_item_key")));

  await requireAppAccess({
    appId: "viso",
    returnTo: buildRedirect(originalAppCode, {}),
    permissionCode: "staff.permissions.manage",
  });

  const result = getNavigationPayload(formData);

  if (!result.ok) {
    redirect(buildRedirect(result.appCode || originalAppCode, { error: result.error }));
  }

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("app_navigation_items")
    .update(result.payload)
    .eq("app_code", originalAppCode)
    .eq("item_key", originalItemKey);

  if (error) {
    redirect(buildRedirect(result.appCode, { error: error.message }));
  }

  revalidatePath("/app-navigation");
  redirect(buildRedirect(result.appCode, { ok: "navigation_saved" }));
}

async function deleteNavigationItem(formData: FormData) {
  "use server";

  const appCode = normalizeAppCode(asText(formData.get("app_code")));
  const itemKey = slugify(asText(formData.get("item_key")));

  await requireAppAccess({
    appId: "viso",
    returnTo: buildRedirect(appCode, {}),
    permissionCode: "staff.permissions.manage",
  });

  if (!appCode || !itemKey) {
    redirect(buildRedirect(appCode, { error: "Faltan app_code o item_key." }));
  }

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("app_navigation_items")
    .delete()
    .eq("app_code", appCode)
    .eq("item_key", itemKey);

  if (error) {
    redirect(buildRedirect(appCode, { error: error.message }));
  }

  revalidatePath("/app-navigation");
  redirect(buildRedirect(appCode, { ok: "navigation_deleted" }));
}

function PermissionSelect({
  name,
  value,
  permissions,
  appCode,
}: {
  name: string;
  value: string;
  permissions: PermissionOption[];
  appCode: string;
}) {
  const appPermissions = permissions.filter((permission) => permission.appCode === appCode);
  const hasCurrent = permissions.some((permission) => permission.fullCode === value);

  return (
    <select name={name} defaultValue={value} className="ui-input">
      {value && !hasCurrent ? <option value={value}>{value}</option> : null}
      <option value="">Selecciona permiso...</option>

      {appPermissions.map((permission) => (
        <option key={permission.fullCode} value={permission.fullCode}>
          {permission.label}
        </option>
      ))}

      {permissions.length > appPermissions.length ? (
        <option disabled>────────── Otras apps ──────────</option>
      ) : null}

      {permissions
        .filter((permission) => permission.appCode !== appCode)
        .map((permission) => (
          <option key={permission.fullCode} value={permission.fullCode}>
            {permission.label}
          </option>
        ))}
    </select>
  );
}

function IconSelect({ value }: { value: string }) {
  return (
    <select name="icon" defaultValue={value} className="ui-input">
      <option value="">Sin icono</option>

      {ICON_OPTIONS.map((icon) => (
        <option key={icon} value={icon}>
          {icon}
        </option>
      ))}
    </select>
  );
}

function TextInput({
  name,
  defaultValue,
  placeholder,
  required,
}: {
  name: string;
  defaultValue?: string | number | null;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <input
      name={name}
      defaultValue={defaultValue ?? ""}
      placeholder={placeholder}
      required={required}
      className="ui-input"
    />
  );
}

function NumberInput({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue?: number | null;
}) {
  return (
    <input
      name={name}
      type="number"
      defaultValue={defaultValue ?? 100}
      className="ui-input"
    />
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function NavigationItemForm({
  row,
  permissions,
}: {
  row: NavigationRow;
  permissions: PermissionOption[];
}) {
  const metadataValue = JSON.stringify(row.metadata ?? {}, null, 2);

  return (
    <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 shadow-[var(--ui-shadow-soft)]">
      <form action={updateNavigationItem} className="space-y-4">
        <input type="hidden" name="original_app_code" value={row.app_code} />
        <input type="hidden" name="original_item_key" value={row.item_key} />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-[var(--ui-text)]">
              {row.label || row.item_key}
            </div>
            <div className="text-xs text-[var(--ui-muted)]">
              {row.href} · {row.required_permission_code}
            </div>
          </div>

          <label className="inline-flex items-center gap-2 rounded-full border border-[var(--ui-border)] px-3 py-1 text-xs font-semibold text-[var(--ui-text)]">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={row.is_active !== false}
              className="h-4 w-4"
            />
            Visible
          </label>
        </div>

        <div className="grid gap-3 lg:grid-cols-4">
          <Field label="App">
            <TextInput name="app_code" defaultValue={row.app_code} required />
          </Field>

          <Field label="Item key">
            <TextInput name="item_key" defaultValue={row.item_key} required />
          </Field>

          <Field label="Grupo key">
            <TextInput name="group_key" defaultValue={row.group_key} required />
          </Field>

          <Field label="Grupo orden">
            <NumberInput name="group_order" defaultValue={row.group_order} />
          </Field>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <Field label="Grupo">
            <TextInput name="group_label" defaultValue={row.group_label} required />
          </Field>

          <Field label="Pantalla">
            <TextInput name="label" defaultValue={row.label} required />
          </Field>

          <Field label="Orden pantalla">
            <NumberInput name="sort_order" defaultValue={row.sort_order} />
          </Field>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <Field label="Ruta href">
            <TextInput name="href" defaultValue={row.href} required />
          </Field>

          <Field label="Icono">
            <IconSelect value={row.icon ?? ""} />
          </Field>

          <Field label="Permiso requerido">
            <PermissionSelect
              name="required_permission_code"
              value={row.required_permission_code ?? ""}
              permissions={permissions}
              appCode={row.app_code}
            />
          </Field>
        </div>

        <Field label="Descripcion">
          <textarea
            name="description"
            defaultValue={row.description ?? ""}
            rows={2}
            className="ui-input min-h-20"
          />
        </Field>

        <Field label="Metadata JSON">
          <textarea
            name="metadata"
            defaultValue={metadataValue}
            rows={4}
            className="ui-input min-h-28 font-mono text-xs"
          />
        </Field>

        <label className="inline-flex items-center gap-2 text-sm text-[var(--ui-muted)]">
          <input
            type="checkbox"
            name="opens_in_new_tab"
            defaultChecked={row.opens_in_new_tab === true}
            className="h-4 w-4"
          />
          Abrir en nueva pestana
        </label>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--ui-border)] pt-4">
          <button type="submit" className="ui-btn ui-btn--primary">
            Guardar cambios
          </button>

          <button
            type="submit"
            form={`delete-${row.app_code}-${row.item_key}`}
            className="ui-btn ui-btn--ghost text-red-600 hover:text-red-700"
          >
            Eliminar
          </button>
        </div>
      </form>

      <form id={`delete-${row.app_code}-${row.item_key}`} action={deleteNavigationItem}>
        <input type="hidden" name="app_code" value={row.app_code} />
        <input type="hidden" name="item_key" value={row.item_key} />
      </form>
    </div>
  );
}

function CreateNavigationItemForm({
  selectedApp,
  permissions,
}: {
  selectedApp: string;
  permissions: PermissionOption[];
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--ui-border)] bg-[var(--ui-surface)] p-4">
      <div className="mb-4">
        <div className="text-sm font-semibold text-[var(--ui-text)]">
          Crear entrada de navegacion
        </div>
        <div className="text-xs text-[var(--ui-muted)]">
          Agrega una pantalla al sidebar server-driven.
        </div>
      </div>

      <form action={createNavigationItem} className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-4">
          <Field label="App">
            <TextInput name="app_code" defaultValue={selectedApp} required />
          </Field>

          <Field label="Item key">
            <TextInput name="item_key" placeholder="inventory_stock" required />
          </Field>

          <Field label="Grupo key">
            <TextInput name="group_key" placeholder="inventory_control" />
          </Field>

          <Field label="Grupo orden">
            <NumberInput name="group_order" defaultValue={100} />
          </Field>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <Field label="Grupo">
            <TextInput name="group_label" placeholder="Control de inventario" required />
          </Field>

          <Field label="Pantalla">
            <TextInput name="label" placeholder="Stock" required />
          </Field>

          <Field label="Orden pantalla">
            <NumberInput name="sort_order" defaultValue={100} />
          </Field>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <Field label="Ruta href">
            <TextInput name="href" placeholder="/inventory/stock" required />
          </Field>

          <Field label="Icono">
            <IconSelect value="" />
          </Field>

          <Field label="Permiso requerido">
            <PermissionSelect
              name="required_permission_code"
              value=""
              permissions={permissions}
              appCode={selectedApp}
            />
          </Field>
        </div>

        <Field label="Descripcion">
          <textarea
            name="description"
            rows={2}
            className="ui-input min-h-20"
            placeholder="Descripcion corta para el sidebar."
          />
        </Field>

        <Field label="Metadata JSON">
          <textarea
            name="metadata"
            rows={4}
            className="ui-input min-h-28 font-mono text-xs"
            defaultValue="{}"
          />
        </Field>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-[var(--ui-muted)]">
            <input type="checkbox" name="is_active" defaultChecked className="h-4 w-4" />
            Visible en menu
          </label>

          <label className="inline-flex items-center gap-2 text-sm text-[var(--ui-muted)]">
            <input type="checkbox" name="opens_in_new_tab" className="h-4 w-4" />
            Abrir en nueva pestana
          </label>

          <button type="submit" className="ui-btn ui-btn--primary">
            Crear entrada
          </button>
        </div>
      </form>
    </div>
  );
}

export default async function AppNavigationPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const requestedApp = normalizeAppCode(String(sp.app ?? "viso"));
  const okMsg =
    sp.ok === "navigation_saved"
      ? "Navegacion guardada."
      : sp.ok === "navigation_deleted"
        ? "Entrada eliminada."
        : safeDecode(sp.ok);
  const errorMsg = safeDecode(sp.error);

  await requireAppAccess({
    appId: "viso",
    returnTo: "/app-navigation",
    permissionCode: "staff.permissions.manage",
  });

  const supabase = createAdminClient();

  const [{ data: appsData }, { data: permissionsData }, { data: navigationData }] =
    await Promise.all([
      supabase.from("apps").select("code").order("code", { ascending: true }),
      supabase
        .from("app_permissions")
        .select("code,name,app:apps(code)")
        .order("code", { ascending: true }),
      supabase
        .from("app_navigation_items")
        .select(
          "app_code,group_key,group_label,group_order,item_key,label,description,href,icon,required_permission_code,sort_order,is_active,opens_in_new_tab,metadata"
        )
        .order("app_code", { ascending: true })
        .order("group_order", { ascending: true })
        .order("sort_order", { ascending: true }),
    ]);

  const appCodesFromApps = ((appsData ?? []) as AppRow[])
    .map((app) => String(app.code ?? "").trim())
    .filter(Boolean);

  const appCodesFromNavigation = Array.from(
    new Set(
      ((navigationData ?? []) as NavigationRow[])
        .map((item) => String(item.app_code ?? "").trim())
        .filter(Boolean)
    )
  );

  const appCodes = Array.from(
    new Set([...appCodesFromApps, ...appCodesFromNavigation, ...FALLBACK_APPS])
  ).sort((a, b) => a.localeCompare(b, "es"));

  const selectedApp = appCodes.includes(requestedApp) ? requestedApp : appCodes[0] ?? "viso";

  const permissions = ((permissionsData ?? []) as RawPermissionOption[])
    .map(normalizePermission)
    .filter((item): item is PermissionOption => item !== null)
    .sort((a, b) => a.fullCode.localeCompare(b.fullCode, "es"));

  const navigationRows = ((navigationData ?? []) as NavigationRow[])
    .filter((item) => item.app_code === selectedApp)
    .sort((a, b) => {
      const groupDiff = Number(a.group_order ?? 100) - Number(b.group_order ?? 100);
      if (groupDiff !== 0) return groupDiff;
      return Number(a.sort_order ?? 100) - Number(b.sort_order ?? 100);
    });

  const visibleCount = navigationRows.filter((item) => item.is_active !== false).length;
  const hiddenCount = navigationRows.length - visibleCount;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Navegacion de apps"
        subtitle="Administra grupos, pantallas, orden, iconos, permisos y visibilidad global del sidebar."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/roles-permissions" className="ui-btn ui-btn--ghost">
              Permisos por rol
            </Link>
            <Link href="/staff" className="ui-btn ui-btn--ghost">
              Trabajadores
            </Link>
          </div>
        }
      />

      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">Listo: {okMsg}</div> : null}

      <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 shadow-[var(--ui-shadow-soft)]">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
          App seleccionada
        </div>

        <div className="flex flex-wrap gap-2">
          {appCodes.map((appCode) => (
            <Link
              key={appCode}
              href={`/app-navigation?app=${encodeURIComponent(appCode)}`}
              className={`ui-btn ${
                appCode === selectedApp ? "ui-btn--primary" : "ui-btn--ghost"
              }`}
            >
              {appCode.toUpperCase()}
            </Link>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-[var(--ui-surface-2)] p-3">
            <div className="text-xs text-[var(--ui-muted)]">Total pantallas</div>
            <div className="text-xl font-semibold text-[var(--ui-text)]">
              {navigationRows.length}
            </div>
          </div>

          <div className="rounded-xl bg-[var(--ui-surface-2)] p-3">
            <div className="text-xs text-[var(--ui-muted)]">Visibles</div>
            <div className="text-xl font-semibold text-[var(--ui-text)]">
              {visibleCount}
            </div>
          </div>

          <div className="rounded-xl bg-[var(--ui-surface-2)] p-3">
            <div className="text-xs text-[var(--ui-muted)]">Ocultas</div>
            <div className="text-xl font-semibold text-[var(--ui-text)]">
              {hiddenCount}
            </div>
          </div>
        </div>
      </div>

      <CreateNavigationItemForm selectedApp={selectedApp} permissions={permissions} />

      <div className="space-y-4">
        {navigationRows.length === 0 ? (
          <div className="ui-empty">No hay entradas de navegacion para esta app.</div>
        ) : null}

        {navigationRows.map((row) => (
          <NavigationItemForm
            key={`${row.app_code}:${row.item_key}`}
            row={row}
            permissions={permissions}
          />
        ))}
      </div>
    </div>
  );
}
