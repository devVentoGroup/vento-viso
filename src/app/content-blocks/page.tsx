import Link from "next/link";

import { PageHeader } from "@/components/vento/standard/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/vento/standard/table";
import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const APP_KEY_PASS = "vento_pass";
const SCREEN_LABELS: Record<string, string> = {
  home: "Home",
  satellite_hub: "Hub satélite",
  order_home: "Pedir (modalidad)",
  order_menu: "Menú",
  order_checkout: "Checkout",
  my_orders: "Mis pedidos",
};

type BlockRow = {
  id: string;
  app_key: string;
  screen_key: string;
  section_key: string;
  locale: string;
  sort_order: number;
  is_enabled: boolean;
  payload: Record<string, unknown>;
};

function payloadPreview(payload: Record<string, unknown>, maxLen = 60) {
  const raw = JSON.stringify(payload);
  if (raw.length <= maxLen) return raw;
  return raw.slice(0, maxLen) + "…";
}

export default async function ContentBlocksPage({
  searchParams,
}: {
  searchParams?: Promise<{ screen?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const screenFilter = (sp.screen as string) || "";

  const { supabase } = await requireAppAccess({
    appId: "viso",
    returnTo: "/content-blocks",
  });

  let query = supabase
    .from("app_content_blocks")
    .select("id, app_key, screen_key, section_key, locale, sort_order, is_enabled, payload")
    .eq("app_key", APP_KEY_PASS)
    .order("screen_key", { ascending: true })
    .order("sort_order", { ascending: true });

  if (screenFilter) {
    query = query.eq("screen_key", screenFilter);
  }

  const { data } = await query;
  const rows = (data ?? []) as BlockRow[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contenido Pass"
        subtitle="Textos y bloques que ve el usuario en la app Vento Pass. Edita copies y activa/desactiva secciones."
      />

      <div className="flex flex-wrap items-center gap-3">
        <span className="ui-caption">Filtrar por pantalla:</span>
        <Link
          href="/content-blocks"
          className={`ui-chip ${!screenFilter ? "ui-chip--brand" : ""}`}
        >
          Todas
        </Link>
        {Object.entries(SCREEN_LABELS).map(([key, label]) => (
          <Link
            key={key}
            href={`/content-blocks?screen=${encodeURIComponent(key)}`}
            className={`ui-chip ${screenFilter === key ? "ui-chip--brand" : ""}`}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="ui-panel">
        {rows.length === 0 ? (
          <div className="ui-empty">
            {screenFilter
              ? `No hay bloques para la pantalla "${SCREEN_LABELS[screenFilter] ?? screenFilter}".`
              : "No hay bloques de contenido para Vento Pass. Ejecuta la migración de seed en el proyecto pass."}
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Pantalla</TableHeaderCell>
                <TableHeaderCell>Sección</TableHeaderCell>
                <TableHeaderCell>Idioma</TableHeaderCell>
                <TableHeaderCell>Orden</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell>Payload (vista previa)</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{SCREEN_LABELS[row.screen_key] ?? row.screen_key}</TableCell>
                  <TableCell>{row.section_key}</TableCell>
                  <TableCell>{row.locale}</TableCell>
                  <TableCell>{row.sort_order}</TableCell>
                  <TableCell>
                    <span className={`ui-chip ${row.is_enabled ? "ui-chip--success" : ""}`}>
                      {row.is_enabled ? "Activo" : "Oculto"}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate font-mono text-xs text-[var(--ui-muted)]">
                    {payloadPreview(row.payload ?? {})}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/content-blocks/${row.id}`} className="ui-btn ui-btn--ghost">
                      Editar
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
