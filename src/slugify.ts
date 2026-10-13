/**
 * Convert an arbitrary string into a URL-safe slug: lowercase ASCII letters and digits
 * separated by single hyphens, with no leading or trailing hyphen. Accents are removed
 * ("é" -> "e"); characters with no ASCII equivalent (e.g. "ß", "日") are dropped.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
