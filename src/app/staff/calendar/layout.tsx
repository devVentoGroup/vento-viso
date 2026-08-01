import type { ReactNode } from "react";

import { CalendarDisplayNormalizer } from "./calendar-display-normalizer";

export default function StaffCalendarLayout({ children }: { children: ReactNode }) {
  return (
    <div data-calendar-display-root>
      {children}
      <CalendarDisplayNormalizer />
    </div>
  );
}
