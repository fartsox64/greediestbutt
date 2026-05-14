/**
 * Parse and re-serialize a URL using the URL constructor, then verify it uses
 * the https: scheme. Returns the canonical href on success, null otherwise.
 *
 * Using new URL() instead of a string prefix check defeats bypass techniques
 * such as embedded newlines or URL-encoded characters that can slip past
 * startsWith("https://").
 */
export function safeHttpsUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}
