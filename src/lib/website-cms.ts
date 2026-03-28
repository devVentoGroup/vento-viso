export const WEBSITE_ITEM_CATEGORIES = ["restaurant", "job", "service", "event", "app"] as const;
export type WebsiteItemCategory = (typeof WEBSITE_ITEM_CATEGORIES)[number];

export function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getRestaurantPageSlugCandidates(slug: string): string[] {
  const safe = normalizeSlug(slug) || slug;
  return [`restaurant:${safe}`, `restaurant_${safe}`, `restaurante:${safe}`];
}

export function getPrimaryRestaurantPageSlug(slug: string): string {
  return getRestaurantPageSlugCandidates(slug)[0];
}

export function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export function asNullableText(value: FormDataEntryValue | null) {
  const parsed = asText(value);
  return parsed || null;
}

export function asBool(value: FormDataEntryValue | null) {
  return value === "on" || value === "true";
}

export function asNumber(value: FormDataEntryValue | null, fallback = 0) {
  const raw = asText(value);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function asNullableDate(value: FormDataEntryValue | null) {
  const raw = asText(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
