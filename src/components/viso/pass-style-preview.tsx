"use client";

import { useMemo } from "react";

type PassStylePreviewProps = {
  name: string;
  subtitle: string;
  tags: string;
  cardLogoUrl: string;
  headerLogoUrl: string;
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

export function PassStylePreview({
  name,
  subtitle,
  tags,
  cardLogoUrl,
  headerLogoUrl,
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

  const cardLogo = cardLogoUrl || headerLogoUrl;
  const headerLogo = headerLogoUrl || cardLogoUrl;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-3xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 shadow-[var(--ui-shadow-1)]">
        <div className="ui-label">Tarjeta en home (real)</div>
        <div
          className="relative mt-4 overflow-hidden rounded-[24px] border p-6 shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
          style={{
            borderColor: `${preview.accent}2A`,
            background: `linear-gradient(135deg, ${preview.start} 0%, ${preview.end} 100%)`,
          }}
        >
          <div className="absolute right-5 top-5 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border bg-white/95" style={{ borderColor: `${preview.accent}40` }}>
            {cardLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cardLogo} alt={name || "Logo"} className="h-12 w-12 object-contain" />
            ) : (
              <span className="text-sm font-bold" style={{ color: preview.accent }}>
                {(name || "??").slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>

          <div className="pr-20 text-[24px] font-black leading-tight" style={{ color: preview.text }}>
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
                  className="rounded-full border px-3 py-[6px] text-[11px] font-bold uppercase tracking-[0.05em]"
                  style={{
                    borderColor: `${preview.text}22`,
                    color: preview.text,
                    background: "rgba(255,255,255,0.85)",
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
          className="mx-auto mt-4 w-full max-w-[390px] overflow-hidden rounded-[26px] border p-0 shadow-[0_12px_28px_rgba(15,23,42,0.14)]"
          style={{ borderColor: preview.border, background: preview.background, color: preview.text }}
        >
          <div className="px-4 pb-3 pt-4">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold" style={{ color: preview.textSecondary }}>
                Puntos actuales
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
              <div className="min-w-0">
                <div className="truncate text-[15px] font-extrabold">{name || "Marca"}</div>
                <div className="truncate text-[12px] font-medium" style={{ color: preview.textSecondary }}>
                  {subtitle || "Experiencia"}
                </div>
              </div>
            </div>

            <div className="mt-3 flex h-10 w-full items-center overflow-hidden rounded-lg border bg-white px-2" style={{ borderColor: `${preview.border}` }}>
              {headerLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={headerLogo} alt={name || "Logo horizontal"} className="h-8 w-full object-contain object-left" />
              ) : (
                <span className="ui-caption">Logo horizontal interno</span>
              )}
            </div>
          </div>

          <div className="border-y px-4 py-2 text-[11px] font-semibold" style={{ borderColor: preview.border, color: preview.textSecondary }}>
            Canjear | Historial | QR pendientes
            <div className="mt-2 h-[3px] w-14 rounded-full" style={{ background: preview.indicator }} />
          </div>

          <div className="space-y-3 px-4 py-3">
            <div className="rounded-xl border bg-white px-3 py-2 text-[12px]" style={{ borderColor: preview.border, color: preview.textSecondary }}>
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
