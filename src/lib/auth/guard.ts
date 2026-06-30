import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  checkPermission,
  normalizePermissionCode,
  type PermissionContext,
} from "@/lib/auth/permissions";
import {
  canUseRoleOverride,
  getRoleOverrideFromCookies,
  isPermissionAllowedForRole,
} from "@/lib/auth/role-override";

type GuardOptions = {
  appId: string;
  returnTo: string;
  supabase?: Awaited<ReturnType<typeof createClient>>;
  permissionCode?: string | string[];
  siteId?: string | null;
  areaId?: string | null;
  allowPermissionAccess?: boolean;
};

export async function requireAppAccess({
  appId,
  returnTo,
  supabase,
  permissionCode,
  siteId,
  areaId,
  allowPermissionAccess = false,
}: GuardOptions) {
  const client = supabase ?? (await createClient());
  const context: PermissionContext = {
    siteId: siteId ?? null,
    areaId: areaId ?? null,
  };

  const { data: userRes } = await client.auth.getUser();
  const user = userRes.user ?? null;

  if (!user) {
    const qs = new URLSearchParams();
    qs.set("returnTo", returnTo);
    redirect(`/login?${qs.toString()}`);
  }

  const permissionCodes = Array.isArray(permissionCode)
    ? permissionCode.filter(Boolean)
    : permissionCode
      ? [permissionCode]
      : [];
  const normalizedCodes = permissionCodes.map((code) =>
    normalizePermissionCode(appId, code),
  );

  const canAccess = await checkPermission(client, appId, "access", context);

  let canAccessByPermission = false;
  if (!canAccess && allowPermissionAccess && normalizedCodes.length > 0) {
    const checks = await Promise.all(
      normalizedCodes.map((code) =>
        checkPermission(client, appId, code, context),
      ),
    );
    canAccessByPermission = checks.every(Boolean);
  }

  if (!canAccess && !canAccessByPermission) {
    const qs = new URLSearchParams();
    qs.set("returnTo", returnTo);
    qs.set("reason", "no_access");
    qs.set("permission", `${appId}.access`);
    redirect(`/no-access?${qs.toString()}`);
  }

  if (normalizedCodes.length) {
    const overrideRole = await getRoleOverrideFromCookies();
    let canOverride = false;
    let actualRole = "";
    let defaultSiteId: string | null = null;

    if (overrideRole) {
      const { data: employee } = await client
        .from("employees")
        .select("role,site_id")
        .eq("id", user.id)
        .maybeSingle();
      actualRole = String(employee?.role ?? "");
      defaultSiteId = employee?.site_id ?? null;
      canOverride = canUseRoleOverride(actualRole, overrideRole);
    }

    if (canOverride) {
      const overrideContext: PermissionContext = {
        siteId: context.siteId ?? defaultSiteId,
        areaId: context.areaId ?? null,
      };

      const checks = await Promise.all(
        normalizedCodes.map((code) =>
          isPermissionAllowedForRole(
            client,
            overrideRole!,
            appId,
            code,
            overrideContext,
          ),
        ),
      );
      const deniedIndex = checks.findIndex((allowed) => !allowed);
      const deniedCode = deniedIndex >= 0 ? normalizedCodes[deniedIndex] : null;
      if (deniedCode) {
        const qs = new URLSearchParams();
        qs.set("returnTo", returnTo);
        qs.set("reason", "role_override");
        qs.set("permission", String(deniedCode ?? ""));
        redirect(`/no-access?${qs.toString()}`);
      }
    } else {
      const checks = await Promise.all(
        normalizedCodes.map((code) =>
          checkPermission(client, appId, code, context),
        ),
      );

      const deniedIndex = checks.findIndex((allowed) => !allowed);
      if (deniedIndex !== -1) {
        const qs = new URLSearchParams();
        qs.set("returnTo", returnTo);
        qs.set("reason", "no_permission");
        qs.set("permission", String(normalizedCodes[deniedIndex] ?? ""));
        redirect(`/no-access?${qs.toString()}`);
      }
    }
  }

  return { supabase: client, user };
}
