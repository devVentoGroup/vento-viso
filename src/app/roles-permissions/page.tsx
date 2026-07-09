import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { PageHeader } from "@/components/vento/standard/page-header";
import {
    RolePermissionsCascade,
    type RoleOption,
    type RolePermissionAssignment,
    type RolePermissionOption,
} from "@/components/viso/role-permissions-cascade";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type RawPermissionOption = {
    id: string;
    app_code: string | null;
    code: string | null;
    label: string | null;
    description: string | null;
    group_label: string | null;
    permission_audience: string | null;
    is_operational: boolean | null;
    requires_active_work_context: boolean | null;
    human_sort_order: number | null;
    is_active: boolean | null;
    is_human_configured: boolean | null;
};

type RawSiteOption = {
    id: string;
    code: string | null;
    name: string | null;
    site_type: string | null;
};

type RawAreaOption = {
    id: string;
    name: string | null;
    kind: string | null;
    site_id: string | null;
};

type RawAreaKindOption = {
    code: string;
    name: string | null;
};

type RawRolePermission = {
    is_allowed: boolean | null;
    scope_type: string | null;
    scope_site_id: string | null;
    scope_area_id: string | null;
    scope_site_type: string | null;
    scope_area_kind: string | null;
    permission_id: string | null;
};

type PermissionScopeType = "global" | "site" | "site_type" | "area" | "area_kind";

type PermissionScope = {
    scopeType: PermissionScopeType;
    scopeSiteId: string | null;
    scopeAreaId: string | null;
    scopeSiteType: string | null;
    scopeAreaKind: string | null;
};

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

function normalizeScopeType(value: string): PermissionScopeType {
    if (value === "site") return "site";
    if (value === "site_type") return "site_type";
    if (value === "area") return "area";
    if (value === "area_kind") return "area_kind";
    return "global";
}

function readPermissionScope(formData: FormData): PermissionScope {
    const scopeType = normalizeScopeType(asText(formData.get("scope_type")));

    const scopeSiteId = scopeType === "site" ? asText(formData.get("scope_site_id")) : "";
    const scopeAreaId = scopeType === "area" ? asText(formData.get("scope_area_id")) : "";
    const scopeSiteType = scopeType === "site_type" ? asText(formData.get("scope_site_type")) : "";
    const scopeAreaKind = scopeType === "area_kind" ? asText(formData.get("scope_area_kind")) : "";

    return {
        scopeType,
        scopeSiteId: scopeSiteId || null,
        scopeAreaId: scopeAreaId || null,
        scopeSiteType: scopeSiteType || null,
        scopeAreaKind: scopeAreaKind || null,
    };
}

function validatePermissionScope(scope: PermissionScope) {
    if (scope.scopeType === "site" && !scope.scopeSiteId) {
        return "Selecciona una sede para este permiso.";
    }

    if (scope.scopeType === "site_type" && !scope.scopeSiteType) {
        return "Selecciona un tipo de sede para este permiso.";
    }

    if (scope.scopeType === "area" && !scope.scopeAreaId) {
        return "Selecciona un área para este permiso.";
    }

    if (scope.scopeType === "area_kind" && !scope.scopeAreaKind) {
        return "Selecciona un tipo de área para este permiso.";
    }

    return "";
}

function normalizePermission(item: RawPermissionOption): RolePermissionOption | null {
    const id = String(item.id ?? "").trim();
    const appCode = String(item.app_code ?? "").trim();
    const code = String(item.code ?? "").trim();

    if (!id || !appCode || !code) return null;

    return {
        id,
        appCode,
        code,
        name: item.label,
        label: item.label || code,
        description: item.description || "Define qué puede hacer este rol dentro de Vento OS.",
        groupLabel: item.group_label || "General",
        sortOrder: Number(item.human_sort_order ?? 1000),
        audience: item.permission_audience || "administrative",
        isOperational: Boolean(item.is_operational),
        requiresActiveWorkContext: Boolean(item.requires_active_work_context),
    };
}

async function grantRolePermission(formData: FormData) {
    "use server";

    const role = asText(formData.get("role"));
    const permissionId = asText(formData.get("permission_id"));
    const scope = readPermissionScope(formData);
    const scopeError = validatePermissionScope(scope);
    const isAllowed = asText(formData.get("is_allowed")) !== "false";

    if (!role || !permissionId) {
        redirect(`/roles-permissions?error=${encodeURIComponent("Faltan rol o permiso.")}`);
    }

    if (scopeError) {
        redirect(`/roles-permissions?role=${encodeURIComponent(role)}&error=${encodeURIComponent(scopeError)}`);
    }

    await requireAppAccess({
        appId: "viso",
        returnTo: `/roles-permissions?role=${encodeURIComponent(role)}`,
        permissionCode: "staff.permissions.manage",
    });

    const supabase = createAdminClient();

    const [{ data: roleRow }, { data: permissionRow }] = await Promise.all([
        supabase
            .from("roles")
            .select("code")
            .eq("code", role)
            .eq("is_active", true)
            .maybeSingle(),
        supabase
            .from("app_permissions")
            .select("id")
            .eq("id", permissionId)
            .maybeSingle(),
    ]);

    if (!roleRow) {
        redirect(`/roles-permissions?error=${encodeURIComponent("Rol inválido o inactivo.")}`);
    }

    if (!permissionRow) {
        redirect(`/roles-permissions?role=${encodeURIComponent(role)}&error=${encodeURIComponent("Permiso inválido.")}`);
    }

    let cleanup = supabase
        .from("role_permissions")
        .delete()
        .eq("role", role)
        .eq("permission_id", permissionId)
        .eq("scope_type", scope.scopeType);

    cleanup = scope.scopeSiteId
        ? cleanup.eq("scope_site_id", scope.scopeSiteId)
        : cleanup.is("scope_site_id", null);

    cleanup = scope.scopeAreaId
        ? cleanup.eq("scope_area_id", scope.scopeAreaId)
        : cleanup.is("scope_area_id", null);

    cleanup = scope.scopeSiteType
        ? cleanup.eq("scope_site_type", scope.scopeSiteType)
        : cleanup.is("scope_site_type", null);

    cleanup = scope.scopeAreaKind
        ? cleanup.eq("scope_area_kind", scope.scopeAreaKind)
        : cleanup.is("scope_area_kind", null);

    const { error: cleanupError } = await cleanup;

    if (cleanupError) {
        redirect(`/roles-permissions?role=${encodeURIComponent(role)}&error=${encodeURIComponent(cleanupError.message)}`);
    }

    const { error } = await supabase.from("role_permissions").insert({
        role,
        permission_id: permissionId,
        is_allowed: isAllowed,
        scope_type: scope.scopeType,
        scope_site_id: scope.scopeSiteId,
        scope_area_id: scope.scopeAreaId,
        scope_site_type: scope.scopeSiteType,
        scope_area_kind: scope.scopeAreaKind,
    });

    if (error) {
        redirect(`/roles-permissions?role=${encodeURIComponent(role)}&error=${encodeURIComponent(error.message)}`);
    }

    revalidatePath("/roles-permissions");
    redirect(`/roles-permissions?role=${encodeURIComponent(role)}&ok=permission_saved`);
}

async function removeRolePermission(formData: FormData) {
    "use server";

    const role = asText(formData.get("role"));
    const permissionId = asText(formData.get("permission_id"));
    const scope = readPermissionScope(formData);
    const scopeError = validatePermissionScope(scope);

    if (!role || !permissionId) {
        redirect(`/roles-permissions?error=${encodeURIComponent("Faltan rol o permiso.")}`);
    }

    if (scopeError) {
        redirect(`/roles-permissions?role=${encodeURIComponent(role)}&error=${encodeURIComponent(scopeError)}`);
    }

    await requireAppAccess({
        appId: "viso",
        returnTo: `/roles-permissions?role=${encodeURIComponent(role)}`,
        permissionCode: "staff.permissions.manage",
    });

    const supabase = createAdminClient();

    let query = supabase
        .from("role_permissions")
        .delete()
        .eq("role", role)
        .eq("permission_id", permissionId)
        .eq("scope_type", scope.scopeType);

    query = scope.scopeSiteId
        ? query.eq("scope_site_id", scope.scopeSiteId)
        : query.is("scope_site_id", null);

    query = scope.scopeAreaId
        ? query.eq("scope_area_id", scope.scopeAreaId)
        : query.is("scope_area_id", null);

    query = scope.scopeSiteType
        ? query.eq("scope_site_type", scope.scopeSiteType)
        : query.is("scope_site_type", null);

    query = scope.scopeAreaKind
        ? query.eq("scope_area_kind", scope.scopeAreaKind)
        : query.is("scope_area_kind", null);

    const { error } = await query;

    if (error) {
        redirect(`/roles-permissions?role=${encodeURIComponent(role)}&error=${encodeURIComponent(error.message)}`);
    }

    revalidatePath("/roles-permissions");
    redirect(`/roles-permissions?role=${encodeURIComponent(role)}&ok=permission_removed`);
}

export default async function RolesPermissionsPage({
    searchParams,
}: {
    searchParams?: Promise<{ role?: string; ok?: string; error?: string }>;
}) {
    const sp = (await searchParams) ?? {};
    const requestedRole = String(sp.role ?? "").trim();
    const okMsg =
        sp.ok === "permission_saved"
            ? "Permiso guardado."
            : sp.ok === "permission_removed"
                ? "Permiso quitado."
                : safeDecode(sp.ok);
    const errorMsg = safeDecode(sp.error);

    await requireAppAccess({
        appId: "viso",
        returnTo: "/roles-permissions",
        permissionCode: "staff.permissions.manage",
    });

    const supabase = createAdminClient();
    const db = supabase as any;

    const [
        { data: rolesData },
        { data: permissionsData },
        { data: sitesData },
        { data: areasData },
        { data: areaKindsData },
    ] = await Promise.all([
        supabase
            .from("roles")
            .select("code,name")
            .eq("is_active", true)
            .order("name", { ascending: true }),
        db
            .from("permission_catalog_human_v1")
            .select("id,app_code,code,label,description,group_label,permission_audience,is_operational,requires_active_work_context,human_sort_order,is_active,is_human_configured")
            .eq("is_active", true)
            .eq("is_human_configured", true)
            .order("app_code", { ascending: true })
            .order("human_sort_order", { ascending: true })
            .order("code", { ascending: true }),
        supabase
            .from("sites")
            .select("id,code,name,site_type")
            .eq("is_active", true)
            .order("name", { ascending: true }),
        supabase
            .from("areas")
            .select("id,name,kind,site_id")
            .order("name", { ascending: true }),
        supabase
            .from("area_kinds")
            .select("code,name")
            .order("name", { ascending: true }),
    ]);

    const roles = ((rolesData ?? []) as RoleOption[]).filter((role) => role.code && role.name);
    const selectedRole = roles.some((role) => role.code === requestedRole)
        ? requestedRole
        : roles[0]?.code ?? "";

    const siteRows = ((sitesData ?? []) as RawSiteOption[]).filter((site) => site.id);
    const siteNameById = new Map(
        siteRows.map((site) => [
            site.id,
            site.name || site.code || site.id,
        ])
    );

    const siteOptions = siteRows.map((site) => ({
        value: site.id,
        label: site.code ? `${site.name || site.code} (${site.code})` : site.name || site.id,
    }));

    const areaOptions = ((areasData ?? []) as RawAreaOption[])
        .filter((area) => area.id)
        .map((area) => {
            const siteLabel = area.site_id ? siteNameById.get(area.site_id) : "";
            const areaLabel = area.name || area.kind || area.id;

            return {
                value: area.id,
                label: siteLabel ? `${areaLabel} · ${siteLabel}` : areaLabel,
            };
        });

    const areaKindOptions = ((areaKindsData ?? []) as RawAreaKindOption[])
        .filter((areaKind) => areaKind.code)
        .map((areaKind) => ({
            value: areaKind.code,
            label: areaKind.name || areaKind.code,
        }));

    const availablePermissions = ((permissionsData ?? []) as RawPermissionOption[])
        .map(normalizePermission)
        .filter((item): item is RolePermissionOption => item !== null)
        .sort((a, b) => {
            const appSort = a.appCode.localeCompare(b.appCode, "es");
            if (appSort !== 0) return appSort;
            return a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "es");
        });

    const permissionById = new Map(
        availablePermissions.map((permission) => [permission.id, permission])
    );

    const { data: rolePermissionsData } = selectedRole
        ? await db
            .from("role_permissions")
            .select("permission_id,is_allowed,scope_type,scope_site_id,scope_area_id,scope_site_type,scope_area_kind")
            .eq("role", selectedRole)
        : { data: [] };

    const rolePermissions: RolePermissionAssignment[] = [];

    for (const row of (rolePermissionsData ?? []) as RawRolePermission[]) {
        const permissionId = String(row.permission_id ?? "").trim();
        const permission = permissionById.get(permissionId);

        if (!permission) continue;

        rolePermissions.push({
            isAllowed: Boolean(row.is_allowed),
            scopeType: row.scope_type ?? "global",
            scopeSiteId: row.scope_site_id,
            scopeAreaId: row.scope_area_id,
            scopeSiteType: row.scope_site_type,
            scopeAreaKind: row.scope_area_kind,
            permission,
        });
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Qué puede hacer cada rol"
                subtitle="Configura permisos con nombres humanos desde el catálogo central de Vento OS."
                actions={
                    <Link href="/staff" className="ui-btn ui-btn--ghost">
                        Volver a trabajadores
                    </Link>
                }
            />

            {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}
            {okMsg ? <div className="ui-alert ui-alert--success">Listo: {okMsg}</div> : null}

            {roles.length === 0 ? (
                <div className="ui-empty">No hay roles activos configurados.</div>
            ) : (
                <RolePermissionsCascade
                    roles={roles}
                    selectedRole={selectedRole}
                    availablePermissions={availablePermissions}
                    rolePermissions={rolePermissions}
                    canManagePermissions
                    siteOptions={siteOptions}
                    areaOptions={areaOptions}
                    areaKindOptions={areaKindOptions}
                    grantPermissionAction={grantRolePermission}
                    removePermissionAction={removeRolePermission}
                />
            )}
        </div>
    );
}
