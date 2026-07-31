"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";

import { requireStaffScheduleAccess } from "../helpers";

function normalizeReturnTo(value: string) {
  const trimmed = String(value ?? "").trim();
  return trimmed.startsWith("/staff/schedule")
    ? trimmed
    : "/staff/schedule/month";
}

function normalizeEmployeeId(value: string) {
  return String(value ?? "").trim();
}

export async function getScheduleHiddenEmployeeIdsAction(returnTo: string) {
  const safeReturnTo = normalizeReturnTo(returnTo);
  await requireStaffScheduleAccess(safeReturnTo, null);

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("staff_schedule_hidden_employees")
    .select("employee_id");

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{ employee_id: string | null }>;
  return rows
    .map((row) => row.employee_id)
    .filter((employeeId): employeeId is string => Boolean(employeeId));
}

export async function setScheduleEmployeeHiddenAction(input: {
  employeeId: string;
  hidden: boolean;
  returnTo: string;
}) {
  const employeeId = normalizeEmployeeId(input.employeeId);
  const safeReturnTo = normalizeReturnTo(input.returnTo);

  await requireStaffScheduleAccess(safeReturnTo, null);

  if (!employeeId) throw new Error("Trabajador inválido.");

  const supabase = createAdminClient();
  const result = input.hidden
    ? await supabase.from("staff_schedule_hidden_employees").upsert({
        employee_id: employeeId,
        hidden_by: null,
        updated_by: null,
        updated_at: new Date().toISOString(),
      })
    : await supabase
        .from("staff_schedule_hidden_employees")
        .delete()
        .eq("employee_id", employeeId);

  if (result.error) throw new Error(result.error.message);

  revalidatePath("/staff/schedule/global");
  revalidatePath("/staff/schedule/month");

  return { employeeId, hidden: input.hidden };
}
