// Order-independent, partial-word, case-insensitive keyword matching — shared
// by the buyer catalog search so "prada nylon black" matches "Black Prada Nylon Bag"
// regardless of word order, casing, or exact phrasing.

/** Splits a query into individual lowercase keyword tokens. */
export function tokenizeQuery(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

/** True if every keyword in `query` appears somewhere in `haystack` (substring, any order). */
export function matchesKeywords(haystack: string, query: string): boolean {
  const keywords = tokenizeQuery(query);
  if (!keywords.length) return true;
  const hay = haystack.toLowerCase();
  return keywords.every((kw) => hay.includes(kw));
}
