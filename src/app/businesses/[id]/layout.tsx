import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { BusinessDeliverySlots } from "@/components/viso/business-delivery-slots";
import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

type SatelliteRow = {
  id: string;
  site_id: string | null;
};

export default async function BusinessDetailLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireAppAccess({
    appId: "viso",
    returnTo: `/businesses/${id}`,
  });

  const { data, error } = await supabase
    .schema("pass")
    .from("pass_satellites")
    .select("id,site_id")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    redirect("/businesses?error=" + encodeURIComponent(error.message));
  }

  const business = data as SatelliteRow | null;

  return (
    <>
      {children}
      {business?.site_id ? (
        <div className="mt-6">
          <BusinessDeliverySlots businessId={business.id} siteId={business.site_id} />
        </div>
      ) : null}
    </>
  );
}
