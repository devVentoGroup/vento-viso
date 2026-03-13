import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

type ShiftNotificationPayload = {
  employeeIds: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

type TokenRow = {
  token: string;
  employee_id: string;
};

type ExpoPushResult = {
  status?: string;
  details?: {
    error?: string;
  };
};

async function sendExpoPush(
  messages: Array<{
    to: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
  }>,
) {
  const invalidTokens = new Set<string>();

  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(chunk),
      cache: "no-store",
    });

    const payload = await response.json().catch(() => null);
    const rows = Array.isArray(payload?.data) ? payload.data : [];

    rows.forEach((item: ExpoPushResult, index: number) => {
      if (item?.status === "error" && item?.details?.error === "DeviceNotRegistered") {
        const token = chunk[index]?.to;
        if (token) invalidTokens.add(token);
      }
    });
  }

  return Array.from(invalidTokens);
}

export async function notifyShiftChange({
  employeeIds,
  title,
  body,
  data,
}: ShiftNotificationPayload) {
  const uniqueEmployeeIds = [...new Set(employeeIds.filter(Boolean))];
  if (uniqueEmployeeIds.length === 0) return { sent: 0 };

  const supabase = createAdminClient();
  const { data: tokens, error } = await supabase
    .from("employee_push_tokens")
    .select("token, employee_id")
    .eq("is_active", true)
    .in("employee_id", uniqueEmployeeIds);

  if (error) {
    console.error("[SHIFT_NOTIFY] employee_push_tokens error:", error);
    return { sent: 0, error: error.message };
  }

  const messages = ((tokens ?? []) as TokenRow[]).map((row) => ({
    to: row.token,
    title,
    body,
    data: {
      type: "shift_update",
      ...data,
    },
  }));

  if (messages.length === 0) return { sent: 0 };

  const invalidTokens = await sendExpoPush(messages);
  if (invalidTokens.length > 0) {
    await supabase
      .from("employee_push_tokens")
      .update({ is_active: false })
      .in("token", invalidTokens);
  }

  return { sent: messages.length };
}
