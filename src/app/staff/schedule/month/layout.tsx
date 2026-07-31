import type { ReactNode } from "react";

import { MonthlyScheduleOrganizer } from "@/components/viso/monthly-schedule-organizer";

export default function StaffScheduleMonthLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      {children}
      <MonthlyScheduleOrganizer returnTo="/staff/schedule/month" />
    </>
  );
}
