// Similar-piece scoring. Every piece is one-of-a-kind and gone forever once sold, so
// "similar" is the only way to help a buyer round out a purchase — score by shared
// brand / material / era, plus price proximity. Brand carries the most weight since
// resale buyers often collect within a brand.

type Scoreable = {
  brand: string;
  material: string;
  era: string;
  price: number;
};

export function similarityScore(a: Scoreable, b: Scoreable): number {
  let score = 0;
  if (a.brand && a.brand.toLowerCase() === b.brand.toLowerCase()) score += 45;
  if (a.material && a.material.toLowerCase() === b.material.toLowerCase()) score += 25;
  if (a.era && a.era.toLowerCase() === b.era.toLowerCase()) score += 15;
  // Price proximity (up to 15 pts, decaying with relative distance)
  const hi = Math.max(a.price, b.price, 1);
  const diff = Math.abs(a.price - b.price) / hi;
  score += Math.max(0, 15 * (1 - diff));
  return Math.round(score);
}

// Returns items sorted by descending match %, capped at `limit`.
export function rankSimilar<T extends Scoreable & { sku: string }>(
  base: Scoreable,
  candidates: T[],
  limit = 4,
): Array<T & { match: number }> {
  return candidates
    .map((c) => ({ ...c, match: similarityScore(base, c) }))
    .sort((x, y) => y.match - x.match)
    .slice(0, limit);
}
