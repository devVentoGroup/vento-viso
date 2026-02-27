"use client";

import { useMemo } from "react";

type PassStylePreviewProps = {
  name: string;
  subtitle: string;
  tags: string;
  logoUrl: string;
  gradientStart: string;
  gradientEnd: string;
  accentColor: string;
  textColor: string;
  textSecondaryColor: string;
  primaryColor: string;
  backgroundColor: string;
  indicatorColor: string;
  cardColor: string;
  borderColor: string;
};

function safeColor(value: string, fallback: string) {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : fallback;
}

function pickWatermark(tags: string, accent: string) {
  const value = tags.toLowerCase();
  if (value.includes("pizza")) return { label: "pizza", color: `${accent}22` };
  if (value.includes("shopping")) return { label: "bag", color: `${accent}22` };
  return { label: "utensils", color: `${accent}22` };
}

export function PassStylePreview({
  name,
  subtitle,
  tags,
  logoUrl,
  gradientStart,
  gradientEnd,
  accentColor,
  textColor,
  textSecondaryColor,
  primaryColor,
  backgroundColor,
  indicatorColor,
  cardColor,
  borderColor,
}: PassStylePreviewProps) {
  const preview = useMemo(() => {
    const tagList = tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 3);

    const start = safeColor(gradientStart, "#F6F2FF");
    const end = safeColor(gradientEnd, "#EFE8FF");
    const accent = safeColor(accentColor, "#A855F7");
    const text = safeColor(textColor, "#1B1033");
    const textSecondary = safeColor(textSecondaryColor, "#6B5A88");
    const primary = safeColor(primaryColor, accent);
    const background = safeColor(backgroundColor, "#FFF9F2");
    const indicator = safeColor(indicatorColor, accent);
    const card = safeColor(cardColor, "#FFFFFF");
    const border = safeColor(borderColor, "#E6DFF5");

    return {
      tagList,
      start,
      end,
      accent,
      text,
      textSecondary,
      primary,
      background,
      indicator,
      card,
      border,
    };
  }, [
    tags,
    gradientStart,
    gradientEnd,
    accentColor,
    textColor,
    textSecondaryColor,
    primaryColor,
    backgroundColor,
    indicatorColor,
    cardColor,
    borderColor,
  ]);

  const watermark = pickWatermark(tags, preview.accent);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-3xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 shadow-[var(--ui-shadow-1)]">
        <div className="ui-label">Tarjeta en home (real)</div>
        <div
          className="relative mt-4 overflow-visible rounded-[24px] border p-6 text-[var(--ui-text)] shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
          style={{
            borderColor: `${preview.accent}2A`,
            background: `linear-gradient(135deg, ${preview.start} 0%, ${preview.end} 100%)`,
          }}
        >
          <div
            className="pointer-events-none absolute right-[-14px] top-[-14px] flex h-[90px] w-[90px] items-center justify-center rounded-full bg-white shadow-[0_10px_24px_rgba(15,23,42,0.2)]"
            style={{ border: `4px solid ${preview.accent}30` }}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={name} className="h-[68px] w-[68px] object-contain" />
            ) : (
              <span className="text-base font-bold" style={{ color: preview.accent }}>
                {name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>

          <div
            className="pointer-events-none absolute right-2 top-3 text-[11px] font-semibold uppercase tracking-wide"
            style={{ color: watermark.color }}
          >
            {watermark.label}
          </div>

          <div className="pr-20 text-[22px] font-black leading-tight" style={{ color: preview.text }}>
            {name || "Nombre de marca"}
          </div>
          <div className="mt-2 text-[14px] font-semibold" style={{ color: preview.textSecondary }}>
            {subtitle || "Subtitulo de experiencia"}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {preview.tagList.length ? (
              preview.tagList.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border px-3 py-[7px] text-[11px] font-extrabold uppercase tracking-[0.06em]"
                  style={{
                    borderColor: preview.border,
                    color: preview.textSecondary,
                    background: "rgba(255,255,255,0.72)",
                  }}
                >
                  {tag}
                </span>
              ))
            ) : (
              <span className="ui-caption">Tags de categoria</span>
            )}
          </div>

          <div className="mt-4 flex items-center gap-2 text-[14px] font-extrabold" style={{ color: preview.accent }}>
            Explorar
            <span aria-hidden>-&gt;</span>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 shadow-[var(--ui-shadow-1)]">
        <div className="ui-label">Pantalla interna (real)</div>

        <div
          className="mx-auto mt-4 w-full max-w-[360px] overflow-hidden rounded-[26px] border p-0 shadow-[0_12px_28px_rgba(15,23,42,0.14)]"
          style={{ borderColor: preview.border, background: preview.background, color: preview.text }}
        >
          <div className="px-4 pb-3 pt-4">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold" style={{ color: preview.textSecondary }}>
                Punto actual
              </div>
              <button
                type="button"
                className="rounded-full px-3 py-1 text-[11px] font-bold"
                style={{ background: preview.primary, color: "white" }}
              >
                Refrescar
              </button>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white"
                style={{ border: `2px solid ${preview.accent}` }}
              >
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt={name} className="h-6 w-6 object-contain" />
                ) : (
                  <span className="text-xs font-semibold" style={{ color: preview.accent }}>
                    {name.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[15px] font-extrabold">{name || "Marca"}</div>
                <div className="truncate text-[12px] font-medium" style={{ color: preview.textSecondary }}>
                  {subtitle || "Experiencia"}
                </div>
              </div>
            </div>
          </div>

          <div
            className="border-y px-4 py-2 text-[11px] font-semibold"
            style={{ borderColor: preview.border, color: preview.textSecondary }}
          >
            Canjear | Historial | QR pendientes
            <div className="mt-2 h-[3px] w-14 rounded-full" style={{ background: preview.indicator }} />
          </div>

          <div className="space-y-3 px-4 py-3">
            <div
              className="rounded-xl border bg-white px-3 py-2 text-[12px]"
              style={{ borderColor: preview.border, color: preview.textSecondary }}
            >
              Buscar productos...
            </div>

            <div className="rounded-2xl border p-3" style={{ borderColor: preview.border, background: preview.card }}>
              <div className="text-[13px] font-bold">Producto destacado</div>
              <div className="mt-1 text-[11px]" style={{ color: preview.textSecondary }}>
                Ejemplo de card real de canjes.
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold" style={{ color: preview.textSecondary }}>
                  250 puntos
                </span>
                <button
                  type="button"
                  className="rounded-lg px-3 py-1 text-[11px] font-bold"
                  style={{ background: preview.primary, color: "#fff" }}
                >
                  Canjear
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
