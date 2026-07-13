// Similar-piece scoring. Purchased pieces are gone forever, so "similar" is the
// only way to re-buy. Score by shared category / material / era, plus price proximity.

type Scoreable = {
  category: string;
  material: string;
  era: string;
  wholesalePrice: number;
};

export function similarityScore(a: Scoreable, b: Scoreable): number {
  let score = 0;
  if (a.category === b.category) score += 45;
  if (a.material.toLowerCase() === b.material.toLowerCase()) score += 30;
  if (a.era === b.era) score += 15;
  // Price proximity (up to 10 pts, decaying with relative distance)
  const hi = Math.max(a.wholesalePrice, b.wholesalePrice, 1);
  const diff = Math.abs(a.wholesalePrice - b.wholesalePrice) / hi;
  score += Math.max(0, 10 * (1 - diff));
  return Math.round(score);
}

// Returns items sorted by descending match %, capped at `limit`.
export function rankSimilar<T extends Scoreable & { id: string }>(
  base: Scoreable,
  candidates: T[],
  limit = 4,
): Array<T & { match: number }> {
  return candidates
    .map((c) => ({ ...c, match: similarityScore(base, c) }))
    .sort((x, y) => y.match - x.match)
    .slice(0, limit);
}
