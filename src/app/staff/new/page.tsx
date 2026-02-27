import { PageHeader } from "@/components/vento/standard/page-header";
import { StaffInviteForm } from "@/components/viso/staff-invite-form";
import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

type SiteOption = {
  id: string;
  name: string | null;
};

type RoleOption = {
  code: string;
  name: string;
};

export default async function StaffInvitePage() {
  const { supabase } = await requireAppAccess({
    appId: "viso",
    returnTo: "/staff/new",
  });

  const { data: sites } = await supabase
    .from("sites")
    .select("id,name")
    .order("name", { ascending: true });

  const { data: roles } = await supabase
    .from("roles")
    .select("code,name")
    .eq("is_active", true)
    .order("name", { ascending: true });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invitar trabajador"
        subtitle="Crea una invitacion con sede y rol."
      />

      <div className="ui-panel">
        <StaffInviteForm
          sites={(sites ?? []) as SiteOption[]}
          roles={(roles ?? []) as RoleOption[]}
        />
      </div>
    </div>
  );
}
