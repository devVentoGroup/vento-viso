import { BusinessHours } from "./business-hours";
import { BusinessScheduleExceptions } from "./business-schedule-exceptions";

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
    </div>
  );
}
