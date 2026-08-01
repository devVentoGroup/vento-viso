"use client";

import { useEffect } from "react";

const MOJIBAKE_REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  ["\u00f0\u0178\u2014\u201c\ufe0f", "\u{1F5D3}\uFE0F"],
  ["\u00f0\u0178\u2014\u201c", "\u{1F5D3}\uFE0F"],
  ["\u00e2\u0153\u00a8", "\u2728"],
  ["\u00f0\u0178\u017d\u2030", "\u{1F389}"],
  ["\u00f0\u0178\u2019\u0090", "\u{1F490}"],
  ["\u00f0\u0178\u2019\u2013", "\u{1F496}"],
  ["\u00e2\u02dc\u2022", "\u2615"],
  ["\u00f0\u0178\u201c\u0152", "\u{1F4CC}"],
  ["\u00f0\u0178\u0178\u00a2", "\u{1F7E2}"],
  ["\u00f0\u0178\u00a7\u00be", "\u{1F9FE}"],
  ["\u00f0\u0178\u203a\u00a0\ufe0f", "\u{1F6E0}\uFE0F"],
  ["\u00f0\u0178\u203a\u00a0", "\u{1F6E0}\uFE0F"],
  ["\u00f0\u0178\u0152\u02c6", "\u{1F308}"],
];

const MONTHS =
  "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre";
const WEEKDAYS =
  "lunes|martes|miércoles|jueves|viernes|sábado|domingo";

function uppercaseFirst(value: string) {
  return value
    ? value.charAt(0).toLocaleUpperCase("es-CO") + value.slice(1)
    : value;
}

function normalizeSpanishDateLabel(value: string) {
  const monthYear = new RegExp(`^(${MONTHS}) de (\\d{4})$`, "i").exec(value);
  if (monthYear) {
    return `${uppercaseFirst(monthYear[1].toLocaleLowerCase("es-CO"))} de ${monthYear[2]}`;
  }

  const fullDate = new RegExp(
    `^(${WEEKDAYS}),\\s+(\\d{1,2}) de (${MONTHS})$`,
    "i",
  ).exec(value);
  if (fullDate) {
    return `${uppercaseFirst(fullDate[1].toLocaleLowerCase("es-CO"))}, ${fullDate[2]} de ${fullDate[3].toLocaleLowerCase("es-CO")}`;
  }

  return value;
}

function normalizeText(value: string) {
  let next = value;

  for (const [broken, fixed] of MOJIBAKE_REPLACEMENTS) {
    next = next.split(broken).join(fixed);
  }

  next = next
    .replace(/\bDia\b/g, "Día")
    .replace(/\bCucuta\b/g, "Cúcuta")
    .replace(/\bOperacion\b/g, "Operación")
    .replace(/Día Madre/g, "Día de la Madre");

  const leading = next.match(/^\s*/)?.[0] ?? "";
  const trailing = next.match(/\s*$/)?.[0] ?? "";
  const endIndex = trailing.length > 0 ? next.length - trailing.length : next.length;
  const core = next.slice(leading.length, endIndex);

  return `${leading}${normalizeSpanishDateLabel(core)}${trailing}`;
}

function normalizeElementAttributes(element: Element) {
  for (const attribute of ["placeholder", "title", "aria-label"] as const) {
    const current = element.getAttribute(attribute);
    if (!current) continue;
    const normalized = normalizeText(current);
    if (normalized !== current) element.setAttribute(attribute, normalized);
  }
}

function normalizeTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    const current = root.nodeValue ?? "";
    const normalized = normalizeText(current);
    if (normalized !== current) root.nodeValue = normalized;
    return;
  }

  if (root instanceof Element) normalizeElementAttributes(root);

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
  );

  let current = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) {
      const value = current.nodeValue ?? "";
      const normalized = normalizeText(value);
      if (normalized !== value) current.nodeValue = normalized;
    } else if (current instanceof Element) {
      normalizeElementAttributes(current);
    }
    current = walker.nextNode();
  }
}

export function CalendarDisplayNormalizer() {
  useEffect(() => {
    const calendarRoot = document.querySelector<HTMLElement>(
      "[data-calendar-display-root]",
    );
    if (!calendarRoot) return;

    normalizeTree(calendarRoot);

    let scheduled = false;
    const observer = new MutationObserver((mutations) => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        for (const mutation of mutations) {
          mutation.addedNodes.forEach((node) => normalizeTree(node));
          if (mutation.type === "characterData") normalizeTree(mutation.target);
        }
      });
    });

    observer.observe(calendarRoot, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, []);

  return (
    <style>{`
      [data-calendar-display-root] .capitalize {
        text-transform: none !important;
      }
    `}</style>
  );
}
