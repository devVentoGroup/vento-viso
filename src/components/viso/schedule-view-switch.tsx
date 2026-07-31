"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

function getMonthFromDate(value: string | null) {
  if (value && /^\d{4}-\d{2}/.test(value)) return value.slice(0, 7);
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function ScheduleViewSwitch() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isWeekly = pathname === "/staff/schedule";
  const isMonthly = pathname === "/staff/schedule/month";
  if (!isWeekly && !isMonthly) return null;

  const siteId = searchParams.get("site_id") ?? "";
  const week = searchParams.get("week") ?? "";
  const month = searchParams.get("month") ?? getMonthFromDate(week);

  const weeklyQuery = new URLSearchParams();
  if (siteId) weeklyQuery.set("site_id", siteId);
  weeklyQuery.set("week", week || `${month}-01`);
  weeklyQuery.set("view", "table");

  const monthlyQuery = new URLSearchParams();
  if (siteId) monthlyQuery.set("site_id", siteId);
  monthlyQuery.set("month", month);

  const baseClass =
    "rounded-lg px-4 py-2 text-sm font-semibold no-underline transition";
  const activeClass = "bg-[var(--ui-brand)] text-white shadow-sm";
  const inactiveClass =
    "text-[var(--ui-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]";

  return (
    <div className="flex justify-center">
      <div className="inline-flex items-center gap-1 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1 shadow-sm">
        <Link
          href={`/staff/schedule?${weeklyQuery.toString()}`}
          className={`${baseClass} ${isWeekly ? activeClass : inactiveClass}`}
        >
          Semana
        </Link>
        <Link
          href={`/staff/schedule/month?${monthlyQuery.toString()}`}
          className={`${baseClass} ${isMonthly ? activeClass : inactiveClass}`}
        >
          Mes
        </Link>
      </div>
    </div>
  );
}
