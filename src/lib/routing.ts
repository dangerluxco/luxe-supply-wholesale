// Lead auto-routing. Tier 1 -> senior reps (lightest load wins);
// Tier 2/3 -> round-robin across all reps by current open-lead load.

export type RoutableRep = {
  id: string;
  name: string;
  isSenior: boolean;
  load: number; // current open leads
};

export function routeLead(
  tier: number,
  reps: RoutableRep[],
): { repId: string; reason: string } | null {
  if (reps.length === 0) return null;

  if (tier === 1) {
    const seniors = reps.filter((r) => r.isSenior);
    const pool = seniors.length ? seniors : reps;
    const pick = [...pool].sort((a, b) => a.load - b.load)[0];
    return {
      repId: pick.id,
      reason: `Tier 1 → senior rep (${pick.name}, lightest load)`,
    };
  }

  // Tier 2/3: round-robin by load across everyone.
  const pick = [...reps].sort((a, b) => a.load - b.load)[0];
  return {
    repId: pick.id,
    reason: `Tier ${tier} → round-robin by load (${pick.name})`,
  };
}
