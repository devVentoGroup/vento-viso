import Link from "next/link";

import { PageHeader } from "@/components/vento/standard/page-header";
import { MenuPersonalizationsClient } from "@/components/viso/menu-personalizations-client";
import { requireAppAccess } from "@/lib/auth/guard";
import { fetchPersonalizationSnapshot } from "@/lib/viso/personalization-snapshot";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function ManagePersonalizationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: itemId } = await params;

  await requireAppAccess({
    appId: "viso",
    returnTo: `/menu/${itemId}/personalizations`,
  });

  const supabase = createAdminClient();
  let snapshot: Awaited<ReturnType<typeof fetchPersonalizationSnapshot>> | null = null;
  let loadError = "";

  try {
    snapshot = await fetchPersonalizationSnapshot(supabase, itemId);
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : "No se pudieron cargar las personalizaciones.";
  }

  if (!snapshot) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Personalizaciones"
          subtitle="No fue posible cargar la configuración del producto."
          actions={(
            <Link href={`/menu/${itemId}`} className="ui-btn ui-btn--ghost">
              Volver al producto
            </Link>
          )}
        />

        <div className="ui-alert ui-alert--error">{loadError}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Personalizaciones · ${snapshot.currentItem.name}`}
        subtitle="Configura tamaños, extras, cambios, ingredientes, preferencias y sugerencias sin mezclar la edición comercial del producto."
        actions={(
          <Link href={`/menu/${itemId}`} className="ui-btn ui-btn--ghost">
            Volver al producto
          </Link>
        )}
      />

      <MenuPersonalizationsClient
        itemId={itemId}
        initialSnapshot={snapshot}
      />
    </div>
  );
}