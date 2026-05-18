const HITS_VERSIONS = new Set(["repentance", "afterbirth_plus", "afterbirth"]);

export function calcHitsTaken(
  version: string,
  damagePenalty: number | null,
  explorationBonus: number | null,
): number | null {
  if (!HITS_VERSIONS.has(version)) return null;
  if (damagePenalty == null || explorationBonus == null || explorationBonus === 0) return null;
  if (damagePenalty === 0) return 0;
  const inner = 1 - damagePenalty / (explorationBonus * 0.8);
  if (inner <= 0) return null;
  return Math.floor(12 * Math.log(inner) / Math.log(0.8));
}

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
