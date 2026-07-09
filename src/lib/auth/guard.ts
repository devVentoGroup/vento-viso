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
import {
  checkOperationalSessionPermission,
  isOperationalSessionAppAllowed,
  resolveOperationalSession,
} from "@/lib/auth/operational-session";

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

  const { data: userRes } = await client.auth.getUser();
  const user = userRes.user ?? null;

  if (!user) {
    const qs = new URLSearchParams();
    qs.set("returnTo", returnTo);
    redirect(`/login?${qs.toString()}`);
  }

  const operationalSession = await resolveOperationalSession({
    supabase: client,
    userId: user.id,
    appId,
    preferredSiteId: siteId ?? null,
    preferredAreaId: areaId ?? null,
  });
  const context: PermissionContext = {
    siteId: operationalSession.siteId,
    areaId: operationalSession.areaId,
  };
  const permissionCodes = Array.isArray(permissionCode)
    ? permissionCode.filter(Boolean)
    : permissionCode
      ? [permissionCode]
      : [];
  const normalizedCodes = permissionCodes.map((code) =>
    normalizePermissionCode(appId, code),
  );

  if (operationalSession.isSharedDevice) {
    const canAccess = isOperationalSessionAppAllowed(operationalSession, appId);
    let canAccessByPermission = false;
    if (!canAccess && allowPermissionAccess && normalizedCodes.length > 0) {
      const checks = await Promise.all(
        normalizedCodes.map((code) =>
          checkOperationalSessionPermission({
            supabase: client,
            session: operationalSession,
            appId,
            code,
          }),
        ),
      );
      canAccessByPermission = checks.every(Boolean);
    }

    if (!canAccess && !canAccessByPermission) {
      const qs = new URLSearchParams();
      qs.set("returnTo", returnTo);
      qs.set("reason", "shared_device_app_not_allowed");
      qs.set("permission", `${appId}.access`);
      redirect(`/no-access?${qs.toString()}`);
    }
  } else {
    const canAccess = await checkPermission(client, appId, "access", context);
    let canAccessByPermission = false;
    if (!canAccess && allowPermissionAccess && normalizedCodes.length > 0) {
      const checks = await Promise.all(
        normalizedCodes.map((code) => checkPermission(client, appId, code, context)),
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
  }

  if (normalizedCodes.length) {
    if (operationalSession.isSharedDevice) {
      const checks = await Promise.all(
        normalizedCodes.map((code) =>
          checkOperationalSessionPermission({
            supabase: client,
            session: operationalSession,
            appId,
            code,
          }),
        ),
      );
      const deniedIndex = checks.findIndex((allowed) => !allowed);
      if (deniedIndex !== -1) {
        const qs = new URLSearchParams();
        qs.set("returnTo", returnTo);
        qs.set("reason", "shared_device_no_permission");
        qs.set("permission", String(normalizedCodes[deniedIndex] ?? ""));
        redirect(`/no-access?${qs.toString()}`);
      }
    } else {
      const overrideRole = await getRoleOverrideFromCookies();
      const canOverride = Boolean(
        overrideRole &&
          operationalSession.role &&
          canUseRoleOverride(operationalSession.role, overrideRole),
      );

      if (canOverride) {
        const checks = await Promise.all(
          normalizedCodes.map((code) =>
            isPermissionAllowedForRole(client, overrideRole!, appId, code, context),
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
          normalizedCodes.map((code) => checkPermission(client, appId, code, context)),
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
  }

  return {
    supabase: client,
    user,
    siteId: operationalSession.siteId,
    operationalSession,
    sharedDevice: operationalSession.isSharedDevice
      ? {
          id: operationalSession.sharedDeviceId,
          code: operationalSession.sharedDeviceCode,
          label: operationalSession.sharedDeviceLabel,
          site_id: operationalSession.siteId,
          area_id: operationalSession.areaId,
          navigation_role: operationalSession.navigationRole,
          appAllowed: isOperationalSessionAppAllowed(operationalSession, appId),
        }
      : null,
  };
}
