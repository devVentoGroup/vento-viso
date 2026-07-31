import { Suspense, type ReactNode } from "react";

import { ScheduleViewSwitch } from "@/components/viso/schedule-view-switch";

export default function StaffScheduleLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div className="space-y-4">
      <Suspense
        fallback={
          <div className="flex justify-center">
            <div className="h-11 w-44 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)]" />
          </div>
        }
      >
        <ScheduleViewSwitch />
      </Suspense>
      {children}
    </div>
  );
}
