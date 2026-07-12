import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

type ScheduleExceptionRow = {
  id: string;
  exception_date: string;
  exception_type: "closed" | "special_hours";
  opens_at: string | null;
  closes_at: string | null;
  internal_reason: string | null;
  customer_message: string | null;
};

type BusinessSiteRow = {
  site_id: string | null;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}
