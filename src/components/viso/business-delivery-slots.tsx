import { BusinessHours } from "./business-hours";
import { BusinessScheduleExceptions } from "./business-schedule-exceptions";
import { ScheduledOrderConflicts } from "./scheduled-order-conflicts";
import { ScheduledOrderRescheduleHistory } from "./scheduled-order-reschedule-history";
import { ScheduledOrderRescheduler } from "./scheduled-order-rescheduler";

export async function BusinessDeliverySlots({
  businessId,
  siteId,
}: {
  businessId: string;
  siteId: string | null;
}) {
  return (
    <div className="space-y-6">
      <BusinessHours businessId={businessId} siteId={siteId} />
      <BusinessScheduleExceptions businessId={businessId} siteId={siteId} />
      <ScheduledOrderConflicts businessId={businessId} siteId={siteId} />
      <ScheduledOrderRescheduler businessId={businessId} siteId={siteId} />
      <ScheduledOrderRescheduleHistory siteId={siteId} />
    </div>
  );
}
