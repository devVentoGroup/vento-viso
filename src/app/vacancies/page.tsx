import Link from "next/link";

import { PageHeader } from "@/components/vento/standard/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/vento/standard/table";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type VacancyRow = {
  id: string;
  title: string;
  slug: string;
  city: string | null;
  employment_type: string | null;
  schedule_type: string | null;
  status: string;
  site_id: string | null;
  published_at: string | null;
};

type SiteRow = {
  id: string;
  name: string | null;
  code: string | null;
};

function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function VacanciesPage({
  searchParams,
}: {
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const okMsg = sp.ok ? safeDecode(sp.ok) : "";
  const errorMsg = sp.error ? safeDecode(sp.error) : "";

  await requireAppAccess({
    appId: "viso",
    returnTo: "/vacancies",
  });

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .schema("talento")
    .from("vacancies")
    .select("id,title,slug,city,employment_type,schedule_type,status,site_id,published_at")
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as VacancyRow[];
  const siteIds = rows.map((row) => row.site_id).filter(Boolean) as string[];
  const { data: sitesData, error: sitesError } = siteIds.length
    ? await supabase.from("sites").select("id,name,code").in("id", siteIds)
    : { data: [], error: null };
  const sitesById = new Map(((sitesData ?? []) as SiteRow[]).map((site) => [site.id, site]));
  const effectiveError = errorMsg || error?.message || sitesError?.message || "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vacantes"
        subtitle="Define las posiciones que vera el candidato en Vento Talento."
        actions={
          <Link href="/vacancies/new" className="ui-btn ui-btn--brand">
            Crear vacante
          </Link>
        }
      />

      {effectiveError ? <div className="ui-alert ui-alert--error">{effectiveError}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}

      {rows.length === 0 ? (
        <div className="ui-panel">
          <div className="ui-empty">No hay vacantes creadas todavia.</div>
        </div>
      ) : (
        <div className="ui-panel">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Vacante</TableHeaderCell>
                <TableHeaderCell>Sede</TableHeaderCell>
                <TableHeaderCell>Condiciones</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => {
                const site = row.site_id ? sitesById.get(row.site_id) : null;
                const siteLabel = site?.name ?? site?.code ?? "Sin sede";
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-semibold">{row.title}</div>
                      <div className="ui-caption">/{row.slug}</div>
                    </TableCell>
                    <TableCell>
                      <div>{siteLabel}</div>
                      <div className="ui-caption">{row.city ?? "Ciudad por definir"}</div>
                    </TableCell>
                    <TableCell>
                      {[row.employment_type, row.schedule_type].filter(Boolean).join(" · ") || "Por definir"}
                    </TableCell>
                    <TableCell>
                      <span className={`ui-chip ${row.status === "published" ? "ui-chip--success" : ""}`}>
                        {row.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/vacancies/${row.id}`} className="ui-btn ui-btn--ghost ui-btn--sm">
                        Editar
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
