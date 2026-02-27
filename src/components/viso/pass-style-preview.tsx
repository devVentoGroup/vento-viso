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
      .slice(0, 4);

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

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-3xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 shadow-[var(--ui-shadow-1)]">
        <div className="ui-label">Tarjeta en Home</div>
        <div
          className="relative mt-3 rounded-3xl p-6 text-[var(--ui-text)] shadow-[var(--ui-shadow-2)]"
          style={{
            background: `linear-gradient(135deg, ${preview.start} 0%, ${preview.end} 100%)`,
          }}
        >
          <div
            className="absolute right-4 top-4 flex h-16 w-16 items-center justify-center rounded-full bg-white shadow"
            style={{ border: `3px solid ${preview.accent}` }}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={name} className="h-10 w-10 object-contain" />
            ) : (
              <span className="text-sm font-semibold" style={{ color: preview.accent }}>
                {name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <div className="text-xl font-semibold" style={{ color: preview.text }}>
            {name || "Nombre de marca"}
          </div>
          <div className="mt-1 text-sm" style={{ color: preview.textSecondary }}>
            {subtitle || "Subtitulo de experiencia"}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {preview.tagList.length ? (
              preview.tagList.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border px-3 py-1 text-xs font-semibold"
                  style={{
                    borderColor: preview.border,
                    color: preview.text,
                    background: "rgba(255,255,255,0.75)",
                  }}
                >
                  {tag}
                </span>
              ))
            ) : (
              <span className="ui-caption">Tags de categoria</span>
            )}
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm font-semibold" style={{ color: preview.accent }}>
            Explorar
            <span aria-hidden>-&gt;</span>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 shadow-[var(--ui-shadow-1)]">
        <div className="ui-label">Pantalla interna</div>
        <div
          className="mt-3 rounded-3xl p-5"
          style={{ background: preview.background, color: preview.text }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-full bg-white"
                style={{ border: `2px solid ${preview.accent}` }}
              >
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt={name} className="h-7 w-7 object-contain" />
                ) : (
                  <span className="text-xs font-semibold" style={{ color: preview.accent }}>
                    {name.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <div>
                <div className="text-base font-semibold">{name || "Marca"}</div>
                <div className="text-xs" style={{ color: preview.textSecondary }}>
                  {subtitle || "Experiencia"}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="rounded-full px-4 py-2 text-xs font-semibold"
              style={{ background: preview.primary, color: "white" }}
            >
              CTA
            </button>
          </div>

          <div className="mt-4 rounded-2xl p-4" style={{ background: preview.card }}>
            <div className="text-sm font-semibold">Contenido destacado</div>
            <div className="mt-1 text-xs" style={{ color: preview.textSecondary }}>
              Vista previa del contenido interno.
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3 text-xs font-semibold">
            <span>Resumen</span>
            <span>Mapa</span>
            <span>Canjes</span>
          </div>
          <div
            className="mt-2 h-1 w-16 rounded-full"
            style={{ background: preview.indicator }}
          />
        </div>
      </div>
    </div>
  );
}
