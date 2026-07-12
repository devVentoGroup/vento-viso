import { BusinessHours } from "./business-hours";
import { BusinessScheduleExceptions } from "./business-schedule-exceptions";
import { ScheduledOrderConflicts } from "./scheduled-order-conflicts";

export async function BusinessDeliverySlots({
  businessId,
  siteId,
}: {
  businessId: string;
  siteId: string | null;
}) {
  return (
    <div className="space-y-6">
      <BusinessHours businessId={business