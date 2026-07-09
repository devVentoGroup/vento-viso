import { NextRequest, NextResponse } from "next/server";

import { checkPermission } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function canManageScheduleView() {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return false;

  const canAccess = await checkPermission(supabase, "viso", "access");
  if (canAccess) return true;

  return checkPermission(supabase, "viso", "staff.schedule.view");
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  if (!(await canManageScheduleView())) {
    return jsonError("Sin permisos para modificar la vista global.", 403);
  }

  const body = (await request.json().catch(() => null)) as {
    employeeId?: unknown;
  } | null;
  const employeeId =
    typeof body?.employeeId === "string" ? body.employeeId.trim() : "";

  if (!employeeId) return jsonError("Trabajador inválido.", 400);

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("staff_schedule_hidden_employees")
    .upsert({
      employee_id: employeeId,
      hidden_by: null,
      updated_by: null,
      updated_at: new Date().toISOString(),
    });

  if (error) return jsonError(error.message, 500);

  return NextResponse.json({ ok: true, employeeId });
}

export async function DELETE(request: NextRequest) {
  if (!(await canManageScheduleView())) {
    return jsonError("Sin permisos para modificar la vista global.", 403);
  }

  const body = (await request.json().catch(() => null)) as {
    employeeId?: unknown;
  } | null;
  const employeeId =
    typeof body?.employeeId === "string" ? body.employeeId.trim() : "";

  if (!employeeId) return jsonError("Trabajador inválido.", 400);

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("staff_schedule_hidden_employees")
    .delete()
    .eq("employee_id", employeeId);

  if (error) return jsonError(error.message, 500);

  return NextResponse.json({ ok: true, employeeId });
}
