// NFL season year. The 2026 season's playoffs run January 2027.
export const CURRENT_SEASON = 2026;

// Playoff week indexes (spec: the prototype's week-5 Super Bowl quirk is not carried forward)
export const PLAYOFF_WEEKS = { WILD_CARD: 1, DIVISIONAL: 2, CONFERENCE: 3, SUPER_BOWL: 4 } as const;
