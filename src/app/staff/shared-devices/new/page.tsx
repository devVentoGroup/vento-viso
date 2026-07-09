import Link from "next/link";
import { randomBytes } from "crypto";

import { PageHeader } from "@/components/vento/standard/page-header";
import {
  SharedDeviceCreateForm,
  type SharedDeviceCreateState,
} from "@/components/viso/shared-device-create-form";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type SiteOption = {
  id: string;
  name: string | null;
  code: string | null;
};

type AreaOption = {
  id: string;
  site_id: string;
  name: string | null;
  code: string | null;
  kind: string | null;
};

type AppOption = {
  code: string;
  name: string;
  description: string | null;
};

type TemplatePolicy = {
  policy_type?: string | null;
  scope_strategy?: string | null;
  role_code?: string | null;
  employee_id?: string | null;
  notes?: string | null;
};

type SharedDeviceTemplateOption = {
  id: string;
  code: string;
  label: string;
  description: string | null;
  device_type: string;
  default_app_code: string;
  requires_actor_pin: boolean;
  requires_active_actor_shift: boolean;
  allow_actor_without_pin: boolean;
  allow_actions_without_actor: boolean;
  app_codes: string[] | null;
  actor_policies: TemplatePolicy[] | null;
  sort_order: number;
};

function normalizeDeviceCode(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function generatePassword() {
  return `Vento-${randomBytes(9).toString("base64url")}-OS`;
}

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function boolValue(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function uniqueAppCodes(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean)));
}

export async function createSharedDeviceAction(
  _prevState: SharedDeviceCreateState,
  formData: FormData,
): Promise<SharedDeviceCreateState> {
  "use server";

  const { user } = await requireAppAccess({
    appId: "viso",
    returnTo: "/staff/shared-devices/new",
    permissionCode: "staff.manage",
  });

  const admin = createAdminClient();

  const templateId = textValue(formData, "template_id");
  const label = textValue(formData, "label");
  const rawCode = textValue(formData, "code");
  const code = normalizeDeviceCode(rawCode || label);
  const description = textValue(formData, "description") || null;
  const siteId = textValue(formData, "site_id");
  const areaId = textValue(formData, "area_id") || null;
  const loginEmail =
    textValue(formData, "login_email") ||
    `${code.toLowerCase()}@devices.ventogroup.co`;

  if (!templateId) {
    return {
      status: "error",
      message: "Selecciona una plantilla de dispositivo.",
    };
  }

  if (!label) {
    return {
      status: "error",
      message: "Escribe el nombre visible del dispositivo.",
    };
  }

  if (!code) {
    return {
      status: "error",
      message: "No se pudo generar un código interno válido.",
    };
  }

  if (!siteId) {
    return {
      status: "error",
      message: "Selecciona la sede del dispositivo.",
    };
  }

  if (!loginEmail.includes("@")) {
    return {
      status: "error",
      message: "El email técnico no es válido.",
    };
  }

  const { data: template, error: templateError } = await admin
    .from("shared_operational_device_templates")
    .select(
      "id,code,label,device_type,default_app_code,requires_actor_pin,requires_active_actor_shift,allow_actor_without_pin,allow_actions_without_actor,is_active",
    )
    .eq("id", templateId)
    .eq("is_active", true)
    .maybeSingle();

  if (templateError || !template) {
    return {
      status: "error",
      message: templateError?.message || "La plantilla seleccionada no existe o está inactiva.",
    };
  }

  const { data: templateApps, error: templateAppsError } = await admin
    .from("shared_operational_device_template_apps")
    .select("app_code,is_default,is_active,sort_order")
    .eq("template_id", template.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (templateAppsError) {
    return {
      status: "error",
      message: templateAppsError.message || "No se pudieron leer las apps de la plantilla.",
    };
  }

  const templateAppCodes = uniqueAppCodes(
    (templateApps ?? []).map((item) => String(item.app_code ?? "")),
  );

  const selectedAppCodes = uniqueAppCodes(
    formData.getAll("app_codes").map((value) => String(value)),
  );

  const appCodes = selectedAppCodes.length > 0 ? selectedAppCodes : templateAppCodes;

  const requestedDefaultAppCode = textValue(formData, "default_app_code").toLowerCase();
  const defaultAppCode =
    requestedDefaultAppCode ||
    String(
      (templateApps ?? []).find((item) => item.is_default)?.app_code ||
        template.default_app_code,
    ).toLowerCase();

  if (appCodes.length === 0) {
    return {
      status: "error",
      message: "La plantilla debe tener al menos una app permitida.",
    };
  }

  if (!appCodes.includes(defaultAppCode)) {
    return {
      status: "error",
      message: "La app principal debe estar incluida en las apps permitidas.",
    };
  }

  const { data: existingDevice } = await admin
    .from("shared_operational_devices")
    .select("id")
    .eq("code", code)
    .maybeSingle();

  if (existingDevice) {
    return {
      status: "error",
      message: `Ya existe un dispositivo con el código ${code}.`,
    };
  }

  const temporaryPassword = generatePassword();

  const { data: authRes, error: authError } = await admin.auth.admin.createUser({
    email: loginEmail,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      account_type: "shared_operational_device",
      device_code: code,
      device_label: label,
      template_code: template.code,
      default_app_code: defaultAppCode,
    },
    app_metadata: {
      account_type: "shared_operational_device",
      device_code: code,
      template_code: template.code,
    },
  });

  if (authError || !authRes.user) {
    return {
      status: "error",
      message: authError?.message || "No se pudo crear el usuario técnico del dispositivo.",
    };
  }

  const authUserId = authRes.user.id;

  const { data: device, error: deviceError } = await admin
    .from("shared_operational_devices")
    .insert({
      code,
      label,
      description,
      device_type: template.device_type,
      auth_user_id: authUserId,
      site_id: siteId,
      area_id: areaId,
      default_app_code: defaultAppCode,
      template_id: template.id,
      requires_actor_pin: boolValue(formData, "requires_actor_pin"),
      requires_active_actor_shift: boolValue(formData, "requires_active_actor_shift"),
      allow_actor_without_pin: boolValue(formData, "allow_actor_without_pin"),
      allow_actions_without_actor: boolValue(formData, "allow_actions_without_actor"),
      activation_status: "active",
      is_active: true,
      created_by: user.id,
      updated_by: user.id,
      metadata: {
        login_email: loginEmail,
        template_id: template.id,
        template_code: template.code,
        created_from: "viso_staff_shared_devices",
      },
    })
    .select("id")
    .single();

  if (deviceError || !device) {
    await admin.auth.admin.deleteUser(authUserId);
    return {
      status: "error",
      message: deviceError?.message || "No se pudo crear el registro del dispositivo.",
    };
  }

  const { error: appsError } = await admin
    .from("shared_operational_device_apps")
    .insert(
      appCodes.map((appCode) => ({
        device_id: device.id,
        app_code: appCode,
        is_default: appCode === defaultAppCode,
        is_active: true,
      })),
    );

  if (appsError) {
    await admin.from("shared_operational_devices").delete().eq("id", device.id);
    await admin.auth.admin.deleteUser(authUserId);
    return {
      status: "error",
      message: appsError.message || "No se pudieron asignar las apps del dispositivo.",
    };
  }

  const { error: policiesError } = await admin.rpc(
    "apply_shared_device_template_actor_policies_v1",
    {
      p_device_id: device.id,
      p_template_id: template.id,
    },
  );

  if (policiesError) {
    await admin.from("shared_operational_devices").delete().eq("id", device.id);
    await admin.auth.admin.deleteUser(authUserId);
    return {
      status: "error",
      message:
        policiesError.message ||
        "No se pudieron copiar las políticas de actor de la plantilla.",
    };
  }

  await admin.from("shared_operational_device_events").insert({
    device_id: device.id,
    session_user_id: authUserId,
    actor_employee_id: user.id,
    app_code: "viso",
    site_id: siteId,
    area_id: areaId,
    event_type: "device.created",
    source: "admin",
    event_payload: {
      code,
      label,
      login_email: loginEmail,
      template_id: template.id,
      template_code: template.code,
      app_codes: appCodes,
      default_app_code: defaultAppCode,
    },
  });

  return {
    status: "success",
    message: "Dispositivo compartido creado y activado.",
    device: {
      id: device.id,
      code,
      label,
      loginEmail,
      temporaryPassword,
      defaultAppCode,
      appCodes,
      templateCode: template.code,
      templateLabel: template.label,
    },
  };
}

export default async function SharedDeviceCreatePage() {
  const { supabase } = await requireAppAccess({
    appId: "viso",
    returnTo: "/staff/shared-devices/new",
    permissionCode: "staff.manage",
  });

  const [{ data: sites }, { data: areas }, { data: apps }, { data: templates }] =
    await Promise.all([
      supabase
        .from("sites")
        .select("id,name,code")
        .eq("is_active", true)
        .order("name", { ascending: true }),
      supabase
        .from("areas")
        .select("id,site_id,name,code,kind")
        .eq("is_active", true)
        .order("name", { ascending: true }),
      supabase
        .from("apps")
        .select("code,name,description")
        .eq("is_active", true)
        .order("name", { ascending: true }),
      supabase
        .from("shared_operational_device_templates_admin_v1")
        .select(
          "id,code,label,description,device_type,default_app_code,requires_actor_pin,requires_active_actor_shift,allow_actor_without_pin,allow_actions_without_actor,app_codes,actor_policies,sort_order,is_active",
        )
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
    ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Crear dispositivo compartido"
        subtitle="Crea un usuario técnico y aplica una plantilla configurable de apps y políticas."
        actions={
          <Link href="/staff?tab=devices" className="ui-btn ui-btn--ghost">
            Volver
          </Link>
        }
      />

      <div className="ui-panel">
        <SharedDeviceCreateForm
          action={createSharedDeviceAction}
          sites={(sites ?? []) as SiteOption[]}
          areas={(areas ?? []) as AreaOption[]}
          apps={(apps ?? []) as AppOption[]}
          templates={(templates ?? []) as SharedDeviceTemplateOption[]}
        />
      </div>
    </div>
  );
}
