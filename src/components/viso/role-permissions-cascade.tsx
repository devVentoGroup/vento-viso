"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type RolePermissionOption = {
    id: string;
    appCode: string;
    code: string;
    name: string | null;
};

export type RolePermissionAssignment = {
    isAllowed: boolean;
    scopeType: string | null;
    scopeSiteId?: string | null;
    scopeAreaId?: string | null;
    scopeSiteType?: string | null;
    scopeAreaKind?: string | null;
    permission: RolePermissionOption;
};

type PermissionScopeType = "global" | "site" | "site_type" | "area" | "area_kind";

type ScopeOption = {
    value: string;
    label: string;
};

export type RoleOption = {
    code: string;
    name: string;
};

type RolePermissionsCascadeProps = {
    roles: RoleOption[];
    selectedRole: string;
    availablePermissions: RolePermissionOption[];
    rolePermissions: RolePermissionAssignment[];
    canManagePermissions: boolean;
    siteOptions?: ScopeOption[];
    areaOptions?: ScopeOption[];
    siteTypeOptions?: ScopeOption[];
    areaKindOptions?: ScopeOption[];
    grantPermissionAction: (formData: FormData) => Promise<void>;
    removePermissionAction: (formData: FormData) => Promise<void>;
};

type PermissionGroup = {
    appCode: string;
    modules: {
        key: string;
        label: string;
        permissions: RolePermissionOption[];
    }[];
    accessPermission: RolePermissionOption | null;
    total: number;
    active: number;
};

const APP_ORDER = ["fogo", "nexo", "origo", "shell", "viso", "anima"];

const APP_LABELS: Record<string, string> = {
    fogo: "FOGO · Recetas y producción",
    nexo: "NEXO · Inventario y remisiones",
    origo: "ORIGO · Compras y proveedores",
    shell: "SHELL · Entrada al ecosistema",
    viso: "VISO · Administración",
    anima: "ANIMA · Turnos y asistencia",
};

const APP_SHORT_LABELS: Record<string, string> = {
    fogo: "FOGO",
    nexo: "NEXO",
    origo: "ORIGO",
    shell: "SHELL",
    viso: "VISO",
    anima: "ANIMA",
};

const APP_DESCRIPTIONS: Record<string, string> = {
    fogo: "Recetas, fichas de preparación y lotes de producción.",
    nexo: "Inventario, stock, ubicaciones, retiros y remisiones.",
    origo: "Compras, proveedores y recepción de productos.",
    shell: "Acceso inicial, perfil y navegación general.",
    viso: "Trabajadores, permisos, documentos y configuración administrativa.",
    anima: "Turnos, check-in, check-out y asistencia.",
};

const DEFAULT_SITE_TYPE_OPTIONS: ScopeOption[] = [
    { value: "satellite", label: "Satélites: tiendas/puntos de venta" },
    { value: "production_center", label: "Centro de producción" },
    { value: "admin", label: "Administración / Vento Group" },
];

const DEFAULT_AREA_KIND_OPTIONS: ScopeOption[] = [
    { value: "bar", label: "Áreas de barra" },
    { value: "cocina", label: "Áreas de cocina" },
    { value: "bodega", label: "Áreas de bodega" },
    { value: "mostrador", label: "Áreas de mostrador" },
    { value: "admin", label: "Áreas administrativas" },
];

const SCOPE_OPTIONS: Array<{ value: PermissionScopeType; label: string; description: string }> = [
    {
        value: "global",
        label: "Toda la empresa",
        description: "Permite esto en cualquier sede y área. Úsalo solo para roles administrativos o propietarios.",
    },
    {
        value: "site",
        label: "Una sede exacta",
        description: "Permite esto solo en una sede concreta, por ejemplo Molka o Vento Café.",
    },
    {
        value: "site_type",
        label: "Todas las sedes de un tipo",
        description: "Permite esto en todos los satélites, centros de producción o sedes administrativas.",
    },
    {
        value: "area",
        label: "Un área exacta",
        description: "Permite esto solo en un área concreta de una sede.",
    },
    {
        value: "area_kind",
        label: "Todas las áreas de un tipo",
        description: "Permite esto en todas las áreas que sean cocina, barra, bodega, mostrador, etc.",
    },
];

const MODULE_LABELS: Record<string, string> = {
    access: "Acceso general",

    "production.recipe_book": "Recetario",
    "production.recipes": "Recetas",
    "production.batches": "Producción",

    staff: "Trabajadores",
    "staff.documents": "Documentos de trabajador",
    "staff.employee_photos": "Fotos de trabajador",
    "staff.permissions": "Permisos de trabajador",

    documents: "Documentos",
    employee_photos: "Fotos de empleado",

    products: "Productos",
    inventory: "Inventario",
    suppliers: "Proveedores",
    orders: "Pedidos",
    remissions: "Remisiones",
    cash: "Caja",
    costs: "Costos",
    reports: "Reportes",
};

const ACTION_LABELS: Record<string, string> = {
    access: "Entrar a la aplicación",
    view: "Ver",
    read: "Ver",
    list: "Ver lista",
    create: "Crear",
    add: "Crear",
    update: "Editar",
    edit: "Editar",
    manage: "Crear y editar",
    delete: "Eliminar",
    remove: "Eliminar",
    publish: "Publicar",
    approve: "Aprobar",
    cancel: "Anular",
    upload: "Subir archivos",
    download: "Descargar",
    export: "Exportar",
    import: "Importar",
    view_all: "Ver todo",
};

const FRIENDLY_PERMISSION_LABELS: Record<string, string> = {
    "fogo.access": "Entrar a FOGO",
    "fogo.production.recipe_book.view": "Ver libro de recetas",
    "fogo.production.recipes": "Consultar recetas internas",
    "fogo.production.recipes.manage": "Crear y editar recetas",
    "fogo.production.batches": "Ver módulo de producción",
    "fogo.production.batches.view": "Ver lotes de producción",
    "fogo.production.batches.create": "Crear lotes de producción",
    "fogo.production.orders": "Ver órdenes de producción",

    "nexo.access": "Entrar a NEXO",
    "nexo.inventory.stock": "Ver stock",
    "nexo.inventory.movements": "Ver movimientos de inventario",
    "nexo.inventory.withdraw": "Hacer retiros de inventario",
    "nexo.inventory.remissions": "Ver remisiones",
    "nexo.inventory.remissions.receive": "Recibir remisiones",
    "nexo.inventory.remissions.prepare": "Preparar remisiones",
    "nexo.inventory.locations": "Ver ubicaciones LOC",

    "viso.access": "Entrar a VISO",
    "viso.staff.manage": "Administrar trabajadores",
    "viso.staff.permissions.manage": "Administrar permisos",
    "viso.staff.documents.manage": "Gestionar documentos de trabajadores",

    "anima.access": "Entrar a ANIMA",
    "anima.attendance.check_in": "Hacer check-in",
    "anima.attendance.check_out": "Hacer check-out",
};

const FRIENDLY_PERMISSION_DESCRIPTIONS: Record<string, string> = {
    "fogo.access": "Hace que la app FOGO aparezca disponible y permite entrar a su operación base.",
    "fogo.production.recipe_book.view": "Muestra la pantalla Recetario en el menú lateral y permite consultar fichas de preparación publicadas.",
    "fogo.production.recipes": "Permite consultar información interna de recetas usada por FOGO.",
    "fogo.production.recipes.manage": "Permite crear, editar y publicar recetas. Úsalo solo para responsables de receta o administración.",
    "fogo.production.batches.create": "Permite presionar Producir lote y registrar producción real para una receta.",
    "fogo.production.batches.view": "Permite consultar lotes de producción ya creados.",
    "fogo.production.orders": "Permite consultar órdenes de producción cuando existan.",
};

function appLabel(appCode: string) {
    return APP_LABELS[appCode] ?? appCode.toUpperCase();
}

function appShortLabel(appCode: string) {
    return APP_SHORT_LABELS[appCode] ?? appCode.toUpperCase();
}

function permissionFullCode(permission: RolePermissionOption) {
    return `${permission.appCode}.${permission.code}`;
}

function humanize(value: string) {
    return value
        .replace(/[_-]+/g, " ")
        .replace(/\.+/g, " ")
        .trim()
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function moduleKeyFromPermission(code: string) {
    if (code === "access") return "access";

    const parts = code.split(".").filter(Boolean);
    if (parts.length <= 1) return parts[0] ?? code;

    return parts.slice(0, -1).join(".");
}

function actionKeyFromPermission(code: string) {
    if (code === "access") return "access";

    const parts = code.split(".").filter(Boolean);
    return parts[parts.length - 1] ?? code;
}

function moduleLabel(moduleKey: string) {
    return MODULE_LABELS[moduleKey] ?? humanize(moduleKey);
}

function actionLabel(permission: RolePermissionOption) {
    const fullCode = permissionFullCode(permission);
    if (FRIENDLY_PERMISSION_LABELS[fullCode]) return FRIENDLY_PERMISSION_LABELS[fullCode];
    if (permission.name) return permission.name;
    const actionKey = actionKeyFromPermission(permission.code);
    return ACTION_LABELS[actionKey] ?? humanize(actionKey);
}

function permissionDescription(permission: RolePermissionOption) {
    const fullCode = permissionFullCode(permission);
    return FRIENDLY_PERMISSION_DESCRIPTIONS[fullCode] ?? "Define qué puede hacer este rol y en qué sedes o áreas aplica.";
}

function normalizeScopeType(value: string | null | undefined): PermissionScopeType {
    if (value === "site") return "site";
    if (value === "site_type") return "site_type";
    if (value === "area") return "area";
    if (value === "area_kind") return "area_kind";
    return "global";
}

function findScopeLabel(options: ScopeOption[], value: string | null | undefined) {
    if (!value) return "";
    return options.find((option) => option.value === value)?.label ?? value;
}

function scopeLabel(
    assignment: RolePermissionAssignment,
    options: {
        siteOptions: ScopeOption[];
        areaOptions: ScopeOption[];
        siteTypeOptions: ScopeOption[];
        areaKindOptions: ScopeOption[];
    }
) {
    const scopeType = normalizeScopeType(assignment.scopeType);

    if (scopeType === "site") {
        return `Solo en la sede: ${findScopeLabel(options.siteOptions, assignment.scopeSiteId) || "sin sede"}`;
    }

    if (scopeType === "site_type") {
        return `En todas las sedes tipo: ${findScopeLabel(options.siteTypeOptions, assignment.scopeSiteType) || "sin tipo"}`;
    }

    if (scopeType === "area") {
        return `Solo en el área: ${findScopeLabel(options.areaOptions, assignment.scopeAreaId) || "sin área"}`;
    }

    if (scopeType === "area_kind") {
        return `En todas las áreas tipo: ${findScopeLabel(options.areaKindOptions, assignment.scopeAreaKind) || "sin tipo"}`;
    }

    return "En toda la empresa";
}

function sortApps(a: string, b: string) {
    const aIndex = APP_ORDER.indexOf(a);
    const bIndex = APP_ORDER.indexOf(b);

    if (aIndex !== -1 || bIndex !== -1) {
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    }

    return a.localeCompare(b, "es");
}

function sortPermissions(a: RolePermissionOption, b: RolePermissionOption) {
    const actionA = actionKeyFromPermission(a.code);
    const actionB = actionKeyFromPermission(b.code);
    const order = ["view", "read", "list", "create", "add", "update", "edit", "manage", "publish", "approve", "cancel", "delete", "remove"];

    const aIndex = order.indexOf(actionA);
    const bIndex = order.indexOf(actionB);

    if (aIndex !== -1 || bIndex !== -1) {
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    }

    return a.code.localeCompare(b.code, "es");
}

function buildPermissionGroups(
    availablePermissions: RolePermissionOption[],
    rolePermissions: RolePermissionAssignment[]
): PermissionGroup[] {
    const allowedIds = new Set(
        rolePermissions
            .filter((item) => item.isAllowed)
            .map((item) => item.permission.id)
    );

    const byApp = new Map<string, RolePermissionOption[]>();

    for (const permission of availablePermissions) {
        if (!permission.appCode || !permission.code) continue;
        const current = byApp.get(permission.appCode) ?? [];
        current.push(permission);
        byApp.set(permission.appCode, current);
    }

    return [...byApp.entries()]
        .sort(([a], [b]) => sortApps(a, b))
        .map(([appCode, permissions]) => {
            const accessPermission = permissions.find((permission) => permission.code === "access") ?? null;
            const moduleMap = new Map<string, RolePermissionOption[]>();

            for (const permission of permissions) {
                if (permission.code === "access") continue;

                const moduleKey = moduleKeyFromPermission(permission.code);
                const current = moduleMap.get(moduleKey) ?? [];
                current.push(permission);
                moduleMap.set(moduleKey, current);
            }

            const modules = [...moduleMap.entries()]
                .sort(([a], [b]) => moduleLabel(a).localeCompare(moduleLabel(b), "es"))
                .map(([key, modulePermissions]) => ({
                    key,
                    label: moduleLabel(key),
                    permissions: modulePermissions.slice().sort(sortPermissions),
                }));

            return {
                appCode,
                modules,
                accessPermission,
                total: permissions.length,
                active: permissions.filter((permission) => allowedIds.has(permission.id)).length,
            };
        });
}

function CheckboxMark({ checked, partial }: { checked: boolean; partial?: boolean }) {
    return (
        <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-xs font-black transition ${checked
                ? "border-[var(--ui-brand)] bg-[var(--ui-brand)] text-white"
                : partial
                    ? "border-[var(--ui-brand)] bg-[var(--ui-brand-soft)] text-[var(--ui-brand)]"
                    : "border-[var(--ui-border)] bg-white text-transparent"
                }`}
        >
            {checked ? "✓" : partial ? "–" : "✓"}
        </span>
    );
}

function ScopeFields({
    scopeType,
    siteOptions,
    areaOptions,
    siteTypeOptions,
    areaKindOptions,
}: {
    scopeType: PermissionScopeType;
    siteOptions: ScopeOption[];
    areaOptions: ScopeOption[];
    siteTypeOptions: ScopeOption[];
    areaKindOptions: ScopeOption[];
}) {
    if (scopeType === "global") {
        return (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                Aplica en toda la empresa. Úsalo para propietarios, gerencia o administración. Para operación normal, prefiere sede o tipo de sede.
            </div>
        );
    }

    if (scopeType === "site") {
        return (
            <label className="space-y-1">
                <span className="ui-label block">¿En qué sede exacta?</span>
                {siteOptions.length > 0 ? (
                    <select name="scope_site_id" className="ui-input" required>
                        <option value="">Selecciona una sede</option>
                        {siteOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                ) : (
                    <input name="scope_site_id" className="ui-input" placeholder="ID de sede" required />
                )}
                <span className="block text-xs text-[var(--ui-muted)]">Ejemplo: solo Molka o solo Vento Café.</span>
            </label>
        );
    }

    if (scopeType === "site_type") {
        return (
            <label className="space-y-1">
                <span className="ui-label block">¿En qué tipo de sede?</span>
                <select name="scope_site_type" className="ui-input" required>
                    <option value="">Selecciona tipo de sede</option>
                    {siteTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
                <span className="block text-xs text-[var(--ui-muted)]">Recomendado para roles que deben operar igual en todos los satélites o en todos los centros de producción.</span>
            </label>
        );
    }

    if (scopeType === "area") {
        return (
            <label className="space-y-1">
                <span className="ui-label block">¿En qué área exacta?</span>
                {areaOptions.length > 0 ? (
                    <select name="scope_area_id" className="ui-input" required>
                        <option value="">Selecciona un área</option>
                        {areaOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                ) : (
                    <input name="scope_area_id" className="ui-input" placeholder="ID de área" required />
                )}
                <span className="block text-xs text-[var(--ui-muted)]">Úsalo solo cuando el permiso sea para una zona puntual de una sede.</span>
            </label>
        );
    }

    return (
        <label className="space-y-1">
            <span className="ui-label block">¿En qué tipo de área?</span>
            {areaKindOptions.length > 0 ? (
                <select name="scope_area_kind" className="ui-input" required>
                    <option value="">Selecciona tipo de área</option>
                    {areaKindOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            ) : (
                <input name="scope_area_kind" className="ui-input" placeholder="Tipo de área" required />
            )}
            <span className="block text-xs text-[var(--ui-muted)]">Úsalo cuando el permiso dependa de cocina, barra, bodega, mostrador, etc.</span>
        </label>
    );
}

function RemoveScopeForm({
    role,
    permission,
    assignment,
    removePermissionAction,
    canManagePermissions,
    scopeText,
}: {
    role: string;
    permission: RolePermissionOption;
    assignment: RolePermissionAssignment;
    removePermissionAction: (formData: FormData) => Promise<void>;
    canManagePermissions: boolean;
    scopeText: string;
}) {
    return (
        <form action={removePermissionAction}>
            <input type="hidden" name="role" value={role} />
            <input type="hidden" name="permission_id" value={permission.id} />
            <input type="hidden" name="scope_type" value={normalizeScopeType(assignment.scopeType)} />
            <input type="hidden" name="scope_site_id" value={assignment.scopeSiteId ?? ""} />
            <input type="hidden" name="scope_area_id" value={assignment.scopeAreaId ?? ""} />
            <input type="hidden" name="scope_site_type" value={assignment.scopeSiteType ?? ""} />
            <input type="hidden" name="scope_area_kind" value={assignment.scopeAreaKind ?? ""} />
            <button
                type="submit"
                disabled={!canManagePermissions}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--ui-brand)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--ui-text)] transition hover:bg-[var(--ui-brand-soft)] disabled:cursor-not-allowed disabled:opacity-70"
                title={`Quitar ${scopeText}`}
            >
                <span>{scopeText}</span>
                <span className="text-[var(--ui-muted)]">×</span>
            </button>
        </form>
    );
}

function PermissionToggle({
    role,
    permission,
    assignments,
    canManagePermissions,
    siteOptions,
    areaOptions,
    siteTypeOptions,
    areaKindOptions,
    grantPermissionAction,
    removePermissionAction,
}: {
    role: string;
    permission: RolePermissionOption;
    assignments: RolePermissionAssignment[];
    canManagePermissions: boolean;
    siteOptions: ScopeOption[];
    areaOptions: ScopeOption[];
    siteTypeOptions: ScopeOption[];
    areaKindOptions: ScopeOption[];
    grantPermissionAction: (formData: FormData) => Promise<void>;
    removePermissionAction: (formData: FormData) => Promise<void>;
}) {
    const [scopeType, setScopeType] = useState<PermissionScopeType>("site_type");
    const allowedAssignments = assignments.filter((assignment) => assignment.isAllowed);
    const deniedAssignments = assignments.filter((assignment) => !assignment.isAllowed);
    const isAllowed = allowedAssignments.length > 0;
    const isDenied = !isAllowed && deniedAssignments.length > 0;
    const fullCode = permissionFullCode(permission);

    const scopeOptions = {
        siteOptions,
        areaOptions,
        siteTypeOptions,
        areaKindOptions,
    };

    return (
        <div
            className={`rounded-xl border p-4 transition ${isAllowed
                ? "border-[var(--ui-brand)] bg-[var(--ui-brand-soft)] shadow-[var(--ui-shadow-soft)]"
                : "border-[var(--ui-border)] bg-white hover:border-[var(--ui-brand)] hover:bg-[var(--ui-surface-2)]"
                }`}
        >
            <div className="flex items-start gap-3">
                <CheckboxMark checked={isAllowed} />
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                            <span className="block text-base font-semibold text-[var(--ui-text)]">
                                {actionLabel(permission)}
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-[var(--ui-muted)]">
                                {permissionDescription(permission)}
                            </span>
                        </div>

                        {isAllowed ? (
                            <span className="ui-chip ui-chip--success">Permitido</span>
                        ) : isDenied ? (
                            <span className="ui-chip ui-chip--danger">Bloqueado</span>
                        ) : (
                            <span className="ui-chip">Sin permiso</span>
                        )}
                    </div>

                    {allowedAssignments.length > 0 ? (
                        <div className="mt-3 space-y-2">
                            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
                                Ya permitido en:
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {allowedAssignments.map((assignment, index) => {
                                    const text = scopeLabel(assignment, scopeOptions);

                                    return (
                                        <RemoveScopeForm
                                            key={`${permission.id}-${assignment.scopeType ?? "global"}-${assignment.scopeSiteId ?? ""}-${assignment.scopeAreaId ?? ""}-${assignment.scopeSiteType ?? ""}-${assignment.scopeAreaKind ?? ""}-${index}`}
                                            role={role}
                                            permission={permission}
                                            assignment={assignment}
                                            removePermissionAction={removePermissionAction}
                                            canManagePermissions={canManagePermissions}
                                            scopeText={text}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    ) : null}

                    <form action={grantPermissionAction} className="mt-4 space-y-3 rounded-2xl border border-[var(--ui-border)] bg-white/70 p-3">
                        <input type="hidden" name="role" value={role} />
                        <input type="hidden" name="permission_id" value={permission.id} />
                        <input type="hidden" name="is_allowed" value="true" />

                        <label className="space-y-1">
                            <span className="ui-label block">Dónde aplica este permiso</span>
                            <select
                                name="scope_type"
                                className="ui-input"
                                value={scopeType}
                                onChange={(event) => setScopeType(normalizeScopeType(event.target.value))}
                                disabled={!canManagePermissions}
                            >
                                {SCOPE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                            <span className="block text-xs leading-5 text-[var(--ui-muted)]">
                                {SCOPE_OPTIONS.find((option) => option.value === scopeType)?.description}
                            </span>
                        </label>

                        <ScopeFields
                            scopeType={scopeType}
                            siteOptions={siteOptions}
                            areaOptions={areaOptions}
                            siteTypeOptions={siteTypeOptions}
                            areaKindOptions={areaKindOptions}
                        />

                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <button
                                type="submit"
                                disabled={!canManagePermissions}
                                className="ui-btn ui-btn--brand h-10 px-4 text-sm"
                            >
                                {isAllowed ? "Permitir también aquí" : "Permitir"}
                            </button>

                            <details className="text-xs text-[var(--ui-muted)]">
                                <summary className="cursor-pointer font-semibold">Detalle técnico</summary>
                                <div className="mt-1 rounded-lg bg-[var(--ui-surface-2)] px-2 py-1 font-mono text-[11px]">
                                    {fullCode}
                                </div>
                            </details>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

export function RolePermissionsCascade({
    roles,
    selectedRole,
    availablePermissions,
    rolePermissions,
    canManagePermissions,
    siteOptions = [],
    areaOptions = [],
    siteTypeOptions = DEFAULT_SITE_TYPE_OPTIONS,
    areaKindOptions = DEFAULT_AREA_KIND_OPTIONS,
    grantPermissionAction,
    removePermissionAction,
}: RolePermissionsCascadeProps) {
    const router = useRouter();
    const groups = useMemo(
        () => buildPermissionGroups(availablePermissions, rolePermissions),
        [availablePermissions, rolePermissions]
    );

    const initialApp = groups.find((group) => group.active > 0)?.appCode ?? groups[0]?.appCode ?? "";
    const [selectedApp, setSelectedApp] = useState(initialApp);

    const selectedGroup = groups.find((group) => group.appCode === selectedApp) ?? groups[0] ?? null;

    const assignmentByPermissionId = useMemo(() => {
        const map = new Map<string, RolePermissionAssignment[]>();

        for (const assignment of rolePermissions) {
            const id = assignment.permission.id;
            const current = map.get(id) ?? [];
            current.push(assignment);
            map.set(id, current);
        }

        return map;
    }, [rolePermissions]);

    const selectedRoleName = roles.find((role) => role.code === selectedRole)?.name ?? selectedRole;

    return (
        <div className="space-y-5">
            <div className="rounded-[var(--ui-radius-card)] border border-[var(--ui-border)] bg-white p-5 shadow-[var(--ui-shadow-soft)]">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ui-muted)]">
                            Matriz de permisos
                        </div>
                        <h2 className="mt-1 text-2xl font-semibold text-[var(--ui-text)]">Qué puede hacer cada rol</h2>
                        <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--ui-muted)]">
                            Primero elige el rol. Luego permite entrar a una app, ver sus pantallas y ejecutar acciones. Cada permiso debe decir dónde aplica: toda la empresa, una sede, un tipo de sede, un área o un tipo de área.
                        </p>
                    </div>

                    <label className="min-w-[260px] space-y-1">
                        <span className="ui-label block">Rol</span>
                        <select
                            className="ui-input"
                            value={selectedRole}
                            onChange={(event) => {
                                const role = event.target.value;
                                router.push(`/roles-permissions?role=${encodeURIComponent(role)}`);
                            }}
                        >
                            {roles.map((role) => (
                                <option key={role.code} value={role.code}>
                                    {role.name}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>

                {!canManagePermissions ? (
                    <div className="ui-alert mt-4">
                        Tienes acceso de lectura. Para cambiar permisos necesitas viso.staff.permissions.manage.
                    </div>
                ) : null}
            </div>

            <section className="grid gap-5 xl:grid-cols-[320px_1fr]">
                <aside className="space-y-3 xl:sticky xl:top-24 xl:h-fit">
                    <div className="rounded-[var(--ui-radius-card)] border border-[var(--ui-border)] bg-white p-4 shadow-[var(--ui-shadow-soft)]">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                                <h3 className="ui-h3">Apps del ecosistema</h3>
                                <p className="ui-caption mt-1">Configurando: {selectedRoleName}</p>
                            </div>
                            <span className="ui-chip">{groups.length}</span>
                        </div>

                        <div className="space-y-2">
                            {groups.map((group) => {
                                const checked = Boolean(
                                    group.accessPermission &&
                                    (assignmentByPermissionId.get(group.accessPermission.id) ?? []).some((assignment) => assignment.isAllowed)
                                );
                                const partial = !checked && group.active > 0;
                                const active = group.appCode === selectedGroup?.appCode;

                                return (
                                    <button
                                        key={group.appCode}
                                        type="button"
                                        onClick={() => setSelectedApp(group.appCode)}
                                        className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${active
                                            ? "border-[var(--ui-brand)] bg-[var(--ui-brand-soft)] shadow-[var(--ui-shadow-soft)]"
                                            : "border-[var(--ui-border)] bg-[var(--ui-surface-2)] hover:border-[var(--ui-brand)] hover:bg-white"
                                            }`}
                                    >
                                        <CheckboxMark checked={checked} partial={partial} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-sm font-semibold text-[var(--ui-text)]">{appShortLabel(group.appCode)}</span>
                                            <span className="block text-xs leading-5 text-[var(--ui-muted)]">
                                                {group.active}/{group.total} permisos permitidos
                                            </span>
                                        </span>
                                    </button>
                                );
                            })}

                            {groups.length === 0 ? (
                                <div className="ui-empty">No hay permisos registrados en app_permissions.</div>
                            ) : null}
                        </div>
                    </div>
                </aside>

                <main className="space-y-5">
                    {!selectedGroup ? (
                        <div className="ui-empty">Selecciona una aplicación para configurar permisos.</div>
                    ) : (
                        <>
                            <section className="rounded-[var(--ui-radius-card)] border border-[var(--ui-border)] bg-white p-5 shadow-[var(--ui-shadow-soft)]">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ui-muted)]">
                                            App seleccionada
                                        </div>
                                        <h3 className="mt-1 text-2xl font-semibold text-[var(--ui-text)]">
                                            {appLabel(selectedGroup.appCode)}
                                        </h3>
                                        <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--ui-muted)]">
                                            {APP_DESCRIPTIONS[selectedGroup.appCode] ?? "Define qué puede hacer este rol dentro de esta app."}
                                        </p>
                                    </div>

                                    <span className="ui-chip ui-chip--brand">
                                        {selectedGroup.active}/{selectedGroup.total} permitidos
                                    </span>
                                </div>

                                {selectedGroup.accessPermission ? (
                                    <div className="mt-5">
                                        <PermissionToggle
                                            role={selectedRole}
                                            permission={selectedGroup.accessPermission}
                                            assignments={assignmentByPermissionId.get(selectedGroup.accessPermission.id) ?? []}
                                            canManagePermissions={canManagePermissions}
                                            siteOptions={siteOptions}
                                            areaOptions={areaOptions}
                                            siteTypeOptions={siteTypeOptions}
                                            areaKindOptions={areaKindOptions}
                                            grantPermissionAction={grantPermissionAction}
                                            removePermissionAction={removePermissionAction}
                                        />
                                    </div>
                                ) : (
                                    <div className="ui-alert mt-5">
                                        Esta app no tiene configurado su permiso de entrada. Crea primero el permiso de acceso para poder mostrarla aquí.
                                    </div>
                                )}
                            </section>

                            {selectedGroup.modules.map((module) => {
                                const activeCount = module.permissions.filter((permission) =>
                                    (assignmentByPermissionId.get(permission.id) ?? []).some((assignment) => assignment.isAllowed)
                                ).length;

                                return (
                                    <section
                                        key={module.key}
                                        className="rounded-[var(--ui-radius-card)] border border-[var(--ui-border)] bg-white p-5 shadow-[var(--ui-shadow-soft)]"
                                    >
                                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                                <CheckboxMark checked={activeCount === module.permissions.length && module.permissions.length > 0} partial={activeCount > 0 && activeCount < module.permissions.length} />
                                                <div>
                                                    <h4 className="text-lg font-semibold text-[var(--ui-text)]">{module.label}</h4>
                                                    <p className="text-xs leading-5 text-[var(--ui-muted)]">
                                                        Configura qué acciones de este módulo quedan permitidas y dónde aplican.
                                                    </p>
                                                </div>
                                            </div>

                                            <span className="ui-chip">
                                                {activeCount}/{module.permissions.length}
                                            </span>
                                        </div>

                                        <div className="grid gap-3 md:grid-cols-2">
                                            {module.permissions.map((permission) => (
                                                <PermissionToggle
                                                    key={permission.id}
                                                    role={selectedRole}
                                                    permission={permission}
                                                    assignments={assignmentByPermissionId.get(permission.id) ?? []}
                                                    canManagePermissions={canManagePermissions}
                                                    siteOptions={siteOptions}
                                                    areaOptions={areaOptions}
                                                    siteTypeOptions={siteTypeOptions}
                                                    areaKindOptions={areaKindOptions}
                                                    grantPermissionAction={grantPermissionAction}
                                                    removePermissionAction={removePermissionAction}
                                                />
                                            ))}
                                        </div>
                                    </section>
                                );
                            })}

                            {selectedGroup.modules.length === 0 ? (
                                <div className="ui-empty">Esta aplicación solo tiene permiso de acceso general.</div>
                            ) : null}
                        </>
                    )}
                </main>
            </section>
        </div>
    );
}