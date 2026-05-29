import { PageHeader } from "@/components/vento/standard/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/vento/standard/table";
import { requireAppAccess } from "@/lib/auth/guard";
import bwipjs from "bwip-js";

export const dynamic = "force-dynamic";

const APP_KEY_PASS = "vento_pass";

type UpdatePolicyRow = {
  id: string;
  platform: "ios" | "android";
  min_version: string;
  latest_version: string | null;
  force_update: boolean;
  store_url: string | null;
  title: string | null;
  message: string | null;
  is_enabled: boolean;
  updated_at: string;
};

async function buildQrDataUrl(value: string) {
  const png = await bwipjs.toBuffer({
    bcid: "qrcode",
    text: value,
    scale: 4,
    paddingwidth: 8,
    paddingheight: 8,
    backgroundcolor: "FFFFFF",
  });
  return `data:image/png;base64,${png.toString("base64")}`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildQrCardSvgDataUrl(params: { platformLabel: string; storeUrl: string; qrDataUrl: string }) {
  const { platformLabel, storeUrl, qrDataUrl } = params;
  const safePlatform = escapeXml(platformLabel);
  const safeUrl = escapeXml(storeUrl);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0A1E2B"/>
      <stop offset="55%" stop-color="#0F5B63"/>
      <stop offset="100%" stop-color="#17B6A6"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#05222B" flood-opacity="0.35"/>
    </filter>
  </defs>
  <rect x="0" y="0" width="1200" height="1600" fill="url(#bg)"/>
  <circle cx="180" cy="180" r="240" fill="#ffffff14"/>
  <circle cx="1100" cy="1470" r="280" fill="#ffffff14"/>
  <rect x="90" y="90" width="1020" height="1420" rx="56" fill="#F7FFFE" filter="url(#shadow)"/>
  <text x="150" y="220" font-family="Manrope, Arial, sans-serif" font-size="58" font-weight="700" fill="#052B33">Vento Pass</text>
  <text x="150" y="285" font-family="Manrope, Arial, sans-serif" font-size="34" fill="#2D5A62">Descarga oficial ${safePlatform}</text>
  <rect x="250" y="380" width="700" height="700" rx="40" fill="#FFFFFF" stroke="#DCEBED" stroke-width="6"/>
  <image href="${qrDataUrl}" x="275" y="405" width="650" height="650" />
  <text x="150" y="1185" font-family="Manrope, Arial, sans-serif" font-size="30" fill="#3C5E66">Escanea este QR para abrir la tienda.</text>
  <foreignObject x="150" y="1235" width="900" height="190">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Manrope, Arial, sans-serif; font-size: 24px; color: #2D5A62; line-height: 1.35; word-break: break-all;">
      ${safeUrl}
    </div>
  </foreignObject>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function normalizeStoreUrl(value: string | null) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function asDateTime(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function AppUpdatesPage() {
  const { supabase } = await requireAppAccess({
    appId: "viso",
    returnTo: "/app-updates",
  });

  const { data } = await supabase
    .from("app_update_policies")
    .select("id, platform, min_version, latest_version, force_update, store_url, title, message, is_enabled, updated_at")
    .eq("app_key", APP_KEY_PASS)
    .in("platform", ["ios", "android"])
    .order("platform", { ascending: true });

  const rows = (data ?? []) as UpdatePolicyRow[];
  const qrByPolicyId: Record<string, string> = {};

  for (const row of rows) {
    const url = normalizeStoreUrl(row.store_url);
    if (!url) continue;
    qrByPolicyId[row.id] = await buildQrDataUrl(url);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Actualización automática"
        subtitle="Links de App Store y Play Store para Vento Pass en formato QR."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map((row) => {
          const storeUrl = normalizeStoreUrl(row.store_url);
          const qrDataUrl = qrByPolicyId[row.id];
          const platformLabel = row.platform === "ios" ? "iOS / App Store" : "Android / Play Store";
          const downloadCardDataUrl = storeUrl && qrDataUrl
            ? buildQrCardSvgDataUrl({
                platformLabel,
                storeUrl,
                qrDataUrl,
              })
            : "";

          return (
            <div key={row.id} className="ui-panel space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="ui-h3">{platformLabel}</div>
                  <div className="ui-caption">
                    Min {row.min_version} · Latest {row.latest_version || "-"}
                  </div>
                </div>
                <span className={`ui-chip ${row.is_enabled ? "ui-chip--success" : ""}`}>
                  {row.is_enabled ? "Activo" : "Inactivo"}
                </span>
              </div>

              {storeUrl && qrDataUrl ? (
                <div className="flex items-start gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrDataUrl} alt={`QR ${platformLabel}`} className="h-40 w-40 rounded-xl border border-[var(--ui-border)] bg-white p-2" />
                  <div className="min-w-0 space-y-2 text-sm">
                    <div className="ui-caption">Link destino</div>
                    <a href={storeUrl} target="_blank" rel="noreferrer" className="break-all text-[var(--ui-accent-teal)] hover:underline">
                      {storeUrl}
                    </a>
                    <a
                      href={downloadCardDataUrl || qrDataUrl}
                      download={`vento-pass-qr-${row.platform}.svg`}
                      className="ui-btn ui-btn--brand"
                    >
                      Descargar QR estilo Vento Pass
                    </a>
                    <div className="ui-caption">Última actualización: {asDateTime(row.updated_at)}</div>
                  </div>
                </div>
              ) : (
                <div className="ui-empty">No hay `store_url` válido para esta plataforma.</div>
              )}
            </div>
          );
        })}
      </div>

      <div className="ui-panel">
        {rows.length === 0 ? (
          <div className="ui-empty">
            No se encontraron políticas para <code>app_key = {APP_KEY_PASS}</code>.
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Plataforma</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell>Forzada</TableHeaderCell>
                <TableHeaderCell>Min</TableHeaderCell>
                <TableHeaderCell>Latest</TableHeaderCell>
                <TableHeaderCell>Actualizada</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.platform === "ios" ? "iOS" : "Android"}</TableCell>
                  <TableCell>{row.is_enabled ? "Activa" : "Inactiva"}</TableCell>
                  <TableCell>{row.force_update ? "Sí" : "No"}</TableCell>
                  <TableCell>{row.min_version}</TableCell>
                  <TableCell>{row.latest_version || "-"}</TableCell>
                  <TableCell>{asDateTime(row.updated_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
