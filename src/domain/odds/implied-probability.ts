// Ported from the prototype's odds client (convertMoneylineToProb + removeVig);
// the formulas are unchanged, only the names and the pair's return shape differ.

/**
 * American odds → implied probability (with vig).
 * Negative odds (favorite): |odds| / (|odds| + 100)
 * Positive odds (underdog): 100 / (odds + 100)
 */
export function moneylineToProb(odds: number): number {
  return odds < 0 ? Math.abs(odds) / (Math.abs(odds) + 100) : 100 / (odds + 100);
}

/** Bookmaker margins make raw implied pairs sum >1; normalize to a fair pair. */
export function removeVig(probA: number, probB: number): [number, number] {
  const total = probA + probB;
  return [probA / total, probB / total];
}
