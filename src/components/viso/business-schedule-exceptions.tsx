import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

type ScheduleExceptionRow = {
  id: string;
  exception_date: string;
  exception_type: "closed" | "special_hours";
  opens_at: string | null;
  closes